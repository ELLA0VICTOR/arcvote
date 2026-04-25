import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import LockIcon from "./icons/LockIcon.jsx";
import VoteIcon from "./icons/VoteIcon.jsx";
import { encryptVote, toHex } from "../lib/encryption.js";
import {
  fetchMXEPublicKey,
  getVoteStorePDA,
  getProposalPDA,
} from "../lib/arcium.js";
import { PROGRAM_ID } from "../constants.js";
import {
  createProgramFromProvider,
  createProvider,
  isWalletAllowedToVote,
} from "../lib/solana.js";

const STATE = {
  IDLE: "idle",
  ENCRYPTING: "encrypting",
  SUBMITTING: "submitting",
  DONE: "done",
  ERROR: "error",
};

export default function VoteModal({ proposal, proposalId, onClose, idl }) {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const [selected, setSelected] = useState(null);
  const [flowState, setFlowState] = useState(STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [txSignature, setTxSignature] = useState("");

  const isLoading =
    flowState === STATE.ENCRYPTING || flowState === STATE.SUBMITTING;
  const walletAllowed = isWalletAllowedToVote(proposal, publicKey);

  async function handleVote() {
    if (!selected || !publicKey) return;

    if (!walletAllowed) {
      setErrorMessage("This wallet is not on the proposal whitelist.");
      setFlowState(STATE.ERROR);
      return;
    }

    setFlowState(STATE.ENCRYPTING);
    setErrorMessage("");

    try {
      const provider = createProvider(
        { publicKey, signTransaction, signAllTransactions },
        connection
      );
      const program = createProgramFromProvider(provider, idl);

      const mxePublicKey = await fetchMXEPublicKey(provider, PROGRAM_ID);
      const { encryptedVote, voterPublicKey, nonceU128, privateKey } =
        encryptVote(selected, mxePublicKey);

      localStorage.setItem(
        `vote_key_${proposalId.toString()}_${publicKey.toBase58()}`,
        toHex(privateKey)
      );

      setFlowState(STATE.SUBMITTING);

      const proposalPDA = getProposalPDA(proposalId, PROGRAM_ID);
      const voteStorePDA = getVoteStorePDA(proposalId, PROGRAM_ID);

      const signature = await program.methods
        .castVote(
          proposalId,
          Array.from(encryptedVote),
          Array.from(voterPublicKey),
          new BN(nonceU128.toString())
        )
        .accounts({
          voter: publicKey,
          proposal: proposalPDA,
          allVotesStore: voteStorePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      setTxSignature(signature);
      setFlowState(STATE.DONE);
    } catch (error) {
      console.error("Vote submission error:", error);
      setErrorMessage(error.message || "Transaction failed");
      setFlowState(STATE.ERROR);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div className="modal-shell px-3 py-4 sm:px-4 sm:py-8">
        <div
          className="modal-panel w-full max-w-2xl animate-slide-up"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="glass-card p-5 sm:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div
                className="w-12 h-12 flex items-center justify-center flex-shrink-0"
                style={{
                  background: "var(--purple-accent)",
                  borderRadius: "4px",
                }}
              >
                <VoteIcon size={22} color="white" />
              </div>
              <div className="flex-1">
                <h2
                  className="text-xl sm:text-2xl font-display font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Cast Encrypted Vote
                </h2>
                <p
                  className="text-sm font-mono mt-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  CLIENT-SIDE ENCRYPTION BEFORE TRANSACTION SUBMISSION
                </p>
              </div>
              {!isLoading && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs sm:text-sm font-mono px-2 py-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  CLOSE
                </button>
              )}
            </div>

            {flowState === STATE.IDLE && (
              <div className="space-y-6">
                <div className="glass-card p-4">
                  <div
                    className="text-xs font-mono mb-2"
                    style={{ color: "var(--purple-accent)" }}
                  >
                    PROPOSAL
                  </div>
                  <h3
                    className="text-xl font-display font-bold mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {proposal?.title}
                  </h3>
                  <p className="text-sm font-body" style={{ color: "var(--text-secondary)" }}>
                    Select a direction below. ArcVote encrypts the ballot locally so
                    the chain records sealed vote data rather than plaintext intent.
                  </p>
                </div>

                <div>
                  <div
                    className="text-sm font-mono mb-3"
                    style={{ color: "var(--text-primary)" }}
                  >
                    BALLOT_DIRECTION
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      className={`vote-option ${
                        selected === 1 ? "vote-option-yes-selected" : ""
                      }`}
                      onClick={() => setSelected(1)}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 13l4 4L19 7"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="text-lg font-display font-bold">YES</span>
                      <span className="text-xs font-mono">APPROVE PROPOSAL</span>
                    </button>

                    <button
                      type="button"
                      className={`vote-option ${
                        selected === 2 ? "vote-option-no-selected" : ""
                      }`}
                      onClick={() => setSelected(2)}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M18 6L6 18M6 6l12 12"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="text-lg font-display font-bold">NO</span>
                      <span className="text-xs font-mono">REJECT PROPOSAL</span>
                    </button>
                  </div>
                </div>

                {proposal?.isWhitelistEnabled && (
                  <div
                    className="p-4"
                    style={{
                      background: "rgb(255 255 255 / 0.04)",
                      border: "1px solid rgb(255 255 255 / 0.06)",
                      borderRadius: "12px",
                    }}
                  >
                    <div
                      className="text-xs font-mono mb-2"
                      style={{ color: "var(--purple-accent)" }}
                    >
                      WHITELISTED ACCESS
                    </div>
                    <p
                      className="text-sm font-body"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      This proposal only accepts ballots from {proposal.allowedVoters.length} approved wallet
                      {proposal.allowedVoters.length === 1 ? "" : "s"}.
                    </p>
                    <div
                      className="text-xs font-mono mt-2"
                      style={{
                        color: walletAllowed
                          ? "var(--purple-accent)"
                          : "rgb(248 113 113)",
                      }}
                    >
                      {walletAllowed ? "CONNECTED WALLET IS ELIGIBLE" : "CONNECTED WALLET IS NOT ELIGIBLE"}
                    </div>
                  </div>
                )}

                <div
                  className="p-4 flex items-start gap-3"
                  style={{
                    background: "rgb(139 92 246 / 0.1)",
                    border: "1px solid rgb(139 92 246 / 0.25)",
                    borderRadius: "12px",
                  }}
                >
                  <LockIcon size={16} color="var(--purple-accent)" />
                  <div>
                    <div
                      className="text-xs font-mono mb-1"
                      style={{ color: "var(--purple-accent)" }}
                    >
                      PRIVACY_GUARANTEE
                    </div>
                    <p className="text-sm font-body" style={{ color: "var(--text-secondary)" }}>
                      Your vote is encrypted in this browser using the current MXE
                      public key. Observers can verify participation but cannot infer
                      direction until the aggregate tally is revealed.
                    </p>
                  </div>
                </div>

                <div
                  className="pt-4 flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 border-t"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <button type="button" onClick={onClose} className="btn-secondary w-full sm:w-auto sm:min-w-[120px]">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!selected || !walletAllowed}
                    onClick={handleVote}
                    className="btn-primary flex-1 w-full"
                  >
                    {!walletAllowed
                      ? "Wallet Not Eligible"
                      : selected === 1
                      ? "Encrypt and Cast YES"
                      : selected === 2
                      ? "Encrypt and Cast NO"
                      : "Select a Vote"}
                  </button>
                </div>
              </div>
            )}

            {isLoading && (
              <div className="glass-card p-8 text-center animate-fade-in">
                <svg
                  className="animate-spin h-10 w-10 mx-auto mb-4"
                  style={{ color: "var(--purple-accent)" }}
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <h3
                  className="text-xl font-display font-bold mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  {flowState === STATE.ENCRYPTING
                    ? "Encrypting Ballot"
                    : "Submitting Vote Transaction"}
                </h3>
                <p className="text-sm font-body max-w-lg mx-auto" style={{ color: "var(--text-secondary)" }}>
                  {flowState === STATE.ENCRYPTING
                    ? "Running x25519 key exchange and generating a confidential vote payload."
                    : "Confirm the transaction in your wallet to submit the sealed ballot onchain."}
                </p>
              </div>
            )}

            {flowState === STATE.DONE && (
              <div className="space-y-5">
                <div
                  className="p-6 text-center"
                  style={{
                    background:
                      "linear-gradient(135deg, rgb(139 92 246 / 0.18), rgb(139 92 246 / 0.06))",
                    border: "1px solid rgb(139 92 246 / 0.35)",
                    borderRadius: "16px",
                  }}
                >
                  <div
                    className="w-14 h-14 mx-auto mb-4 flex items-center justify-center"
                    style={{
                      background: "rgb(139 92 246 / 0.2)",
                      borderRadius: "9999px",
                    }}
                  >
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-display font-bold mb-2">Vote Sealed Onchain</h3>
                  <p className="text-sm font-body max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
                    Your ballot has been submitted as ciphertext and will remain unreadable
                    until the authority triggers the aggregate tally.
                  </p>
                </div>

                {txSignature && (
                  <div className="glass-card p-4">
                    <div
                      className="text-xs font-mono mb-2"
                      style={{ color: "var(--purple-accent)" }}
                    >
                      TRANSACTION
                    </div>
                    <a
                      href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-mono break-all"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {txSignature}
                    </a>
                  </div>
                )}

                <button className="btn-primary w-full" onClick={onClose}>
                  Close
                </button>
              </div>
            )}

            {flowState === STATE.ERROR && (
              <div className="space-y-5">
                <div
                  className="p-5"
                  style={{
                    background: "rgb(239 68 68 / 0.08)",
                    border: "1px solid rgb(239 68 68 / 0.35)",
                    borderRadius: "12px",
                  }}
                >
                  <div className="text-sm font-mono mb-2 text-red-300">VOTE_FAILED</div>
                  <p className="text-sm font-body text-red-200">{errorMessage}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button className="btn-secondary flex-1" onClick={onClose}>
                    Close
                  </button>
                  <button className="btn-primary flex-1" onClick={() => setFlowState(STATE.IDLE)}>
                    Try Again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
