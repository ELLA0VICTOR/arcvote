import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import ProposalIcon from "./icons/ProposalIcon.jsx";
import LockIcon from "./icons/LockIcon.jsx";
import { encryptNull } from "../lib/encryption.js";
import { fetchMXEPublicKey } from "../lib/arcium.js";
import { PROGRAM_ID } from "../constants.js";
import {
  createProgramFromProvider,
  createProvider,
  formatAddress,
  randomU64,
} from "../lib/solana.js";

const STEP = {
  FORM: "form",
  GENERATING: "generating",
  SUBMITTING: "submitting",
  DONE: "done",
  ERROR: "error",
};

function padDateTimePart(value) {
  return String(value).padStart(2, "0");
}

function toDateTimeLocalValue(date) {
  return [
    date.getFullYear(),
    padDateTimePart(date.getMonth() + 1),
    padDateTimePart(date.getDate()),
  ].join("-") +
    "T" +
    [
      padDateTimePart(date.getHours()),
      padDateTimePart(date.getMinutes()),
    ].join(":");
}

function getDefaultCustomEndAt() {
  const date = new Date(Date.now() + 15 * 60 * 1000);
  date.setSeconds(0, 0);
  return toDateTimeLocalValue(date);
}

export default function CreateProposalModal({ onClose, onCreated, idl }) {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const [step, setStep] = useState(STEP.FORM);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [customEndAt, setCustomEndAt] = useState(getDefaultCustomEndAt);
  const [errorMessage, setErrorMessage] = useState("");
  const [txSignature, setTxSignature] = useState("");

  const isLoading = step === STEP.GENERATING || step === STEP.SUBMITTING;
  const minCustomEndAt = toDateTimeLocalValue(new Date(Date.now() + 60 * 1000));
  const selectedCustomDate = customEndAt ? new Date(customEndAt) : null;
  const customEndPreview =
    selectedCustomDate && !Number.isNaN(selectedCustomDate.getTime())
      ? selectedCustomDate.toLocaleString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "";

  async function handleCreate() {
    if (!title.trim() || !description.trim() || !publicKey) return;

    setStep(STEP.GENERATING);
    setErrorMessage("");

    try {
      const provider = createProvider(
        { publicKey, signTransaction, signAllTransactions },
        connection
      );
      const program = createProgramFromProvider(provider, idl);

      const mxePublicKey = await fetchMXEPublicKey(provider, PROGRAM_ID);
      const { ciphertext, publicKey: nullPubKey, nonceU128 } = encryptNull(mxePublicKey);

      setStep(STEP.SUBMITTING);

      const proposalId = randomU64();
      const parsedCustomEndAt = new Date(customEndAt);
      if (Number.isNaN(parsedCustomEndAt.getTime())) {
        throw new Error("Select a valid end date and time.");
      }

      const endTimestamp = Math.floor(parsedCustomEndAt.getTime() / 1000);
      if (endTimestamp <= Math.floor(Date.now() / 1000)) {
        throw new Error("End time must be in the future.");
      }

      const endTime = new BN(endTimestamp);

      const [proposalPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
        new PublicKey(PROGRAM_ID)
      );
      const [voteStorePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("votes_store"), proposalId.toArrayLike(Buffer, "le", 8)],
        new PublicKey(PROGRAM_ID)
      );

      const signature = await program.methods
        .createProposal(
          proposalId,
          title.trim(),
          description.trim(),
          endTime,
          Array.from(nullPubKey),
          Array.from(ciphertext),
          new BN(nonceU128.toString())
        )
        .accounts({
          payer: publicKey,
          proposal: proposalPDA,
          allVotesStore: voteStorePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      setTxSignature(signature);
      setStep(STEP.DONE);
      onCreated?.();
    } catch (error) {
      console.error("Create proposal error:", error);
      setErrorMessage(error.message || "Transaction failed");
      setStep(STEP.ERROR);
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
          className="modal-panel w-full animate-slide-up"
          style={{ maxWidth: "860px" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="glass-card p-4 sm:p-5">
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                style={{
                  background: "var(--purple-accent)",
                  borderRadius: "4px",
                }}
              >
                <ProposalIcon size={22} color="white" />
              </div>
              <div className="flex-1">
                <h2
                  className="text-xl sm:text-2xl font-display font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Create Proposal
                </h2>
                <p
                  className="text-sm font-mono mt-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  DEPLOY PRIVATE GOVERNANCE ITEM TO SOLANA DEVNET
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

            {step === STEP.FORM && (
              <div className="space-y-4">
                <div className="grid md:grid-cols-[minmax(0,1fr),260px] gap-3">
                  <div>
                    <label
                      className="block text-sm font-mono mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Proposal Title
                    </label>
                    <input
                      className="input-field w-full"
                      type="text"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Approve treasury expansion for contributor grants"
                      maxLength={100}
                    />
                    <div
                      className="text-xs font-mono mt-2 text-right"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {title.length}/100
                    </div>
                  </div>

                  <div>
                    <label
                      className="block text-sm font-mono mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Voting Deadline
                    </label>
                    <input
                      className="input-field w-full"
                      type="datetime-local"
                      min={minCustomEndAt}
                      value={customEndAt}
                      onChange={(event) => setCustomEndAt(event.target.value)}
                    />

                    <div
                      className="text-xs font-body mt-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {customEndPreview
                        ? `Closes ${customEndPreview} (local time)`
                        : "Select the exact closing date and time."}
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    className="block text-sm font-mono mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Proposal Description
                  </label>
                  <textarea
                    className="input-field w-full min-h-[108px] resize-y"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Describe the governance action, expected impact, and what token holders are deciding."
                    maxLength={500}
                  />
                  <div
                    className="text-xs font-mono mt-2 text-right"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {description.length}/500
                  </div>
                </div>

                <div
                  className="p-3 flex items-start gap-3"
                  style={{
                    background: "rgb(255 255 255 / 0.05)",
                    borderRadius: "12px",
                  }}
                >
                  <LockIcon size={16} color="var(--purple-accent)" />
                  <div>
                    <div
                      className="text-xs font-mono mb-1"
                      style={{ color: "var(--purple-accent)" }}
                    >
                      AUTHORITY
                    </div>
                    <p className="text-sm font-body" style={{ color: "var(--text-secondary)" }}>
                      {publicKey
                        ? `${formatAddress(publicKey)} will initiate tallying and publish the final result.`
                        : "Connect a wallet to assign proposal authority."}
                    </p>
                  </div>
                </div>

                <div
                  className="pt-3 flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 border-t"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <button type="button" onClick={onClose} className="btn-secondary w-full sm:w-auto sm:min-w-[120px]">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      !title.trim() ||
                      !description.trim() ||
                      !publicKey ||
                      !customEndAt
                    }
                    onClick={handleCreate}
                    className="btn-primary flex-1 w-full"
                  >
                    Create Proposal
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
                  {step === STEP.GENERATING
                    ? "Generating Null Vote Padding"
                    : "Submitting Proposal Transaction"}
                </h3>
                <p className="text-sm font-body max-w-lg mx-auto" style={{ color: "var(--text-secondary)" }}>
                  {step === STEP.GENERATING
                    ? "Fetching the live MXE public key and building the encrypted empty ballot state required by the tally circuit."
                    : "Confirm the transaction in your wallet to publish the proposal and initialize the onchain vote store."}
                </p>
              </div>
            )}

            {step === STEP.DONE && (
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
                  <h3 className="text-2xl font-display font-bold mb-2">Proposal Created</h3>
                  <p className="text-sm font-body max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
                    The governance item is now live onchain and ready to collect encrypted votes.
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
                  Return to Governance Queue
                </button>
              </div>
            )}

            {step === STEP.ERROR && (
              <div className="space-y-5">
                <div
                  className="p-5"
                  style={{
                    background: "rgb(239 68 68 / 0.08)",
                    border: "1px solid rgb(239 68 68 / 0.35)",
                    borderRadius: "12px",
                  }}
                >
                  <div className="text-sm font-mono mb-2 text-red-300">SUBMISSION_FAILED</div>
                  <p className="text-sm font-body text-red-200">{errorMessage}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button className="btn-secondary flex-1" onClick={onClose}>
                    Close
                  </button>
                  <button className="btn-primary flex-1" onClick={() => setStep(STEP.FORM)}>
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
