import { useRef, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import TallyIcon from "./icons/TallyIcon.jsx";
import { encryptNull, decryptTallyResult } from "../lib/encryption.js";
import {
  fetchMXEPublicKey,
  getArciumAccounts,
  waitForComputation,
  getProposalPDA,
  getVoteStorePDA,
} from "../lib/arcium.js";
import {
  createProgramFromProvider,
  createProvider,
  randomComputationOffset,
} from "../lib/solana.js";
import { PROGRAM_ID } from "../constants.js";

const FLOW = {
  READY: "ready",
  ENCRYPTING: "encrypting",
  QUEUING: "queuing",
  AWAITING_MPC: "awaiting_mpc",
  DECRYPTING: "decrypting",
  PUBLISHING: "publishing",
  COMPLETE: "complete",
  ERROR: "error",
};

const FLOW_LABELS = {
  [FLOW.ENCRYPTING]: "Generating authority decryption keys",
  [FLOW.QUEUING]: "Submitting tally computation to Arcium",
  [FLOW.AWAITING_MPC]: "Waiting for encrypted MPC execution",
  [FLOW.DECRYPTING]: "Decrypting the aggregate result locally",
  [FLOW.PUBLISHING]: "Publishing the final tally onchain",
};

const FLOW_PROGRESS = {
  [FLOW.ENCRYPTING]: 20,
  [FLOW.QUEUING]: 40,
  [FLOW.AWAITING_MPC]: 72,
  [FLOW.DECRYPTING]: 88,
  [FLOW.PUBLISHING]: 100,
};

function getStoredAuthorityKey(proposalId) {
  const raw = localStorage.getItem(`authority_key_${proposalId.toString()}`);
  if (!raw) return null;

  try {
    return Uint8Array.from(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number(value))
    );
  } catch {
    return null;
  }
}

function isAlreadyProcessedError(error) {
  const message = error?.message || "";
  return message.includes("already been processed");
}

export default function TallyPanel({ proposal, proposalId, onComplete, idl }) {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const [flow, setFlow] = useState(FLOW.READY);
  const [errorMessage, setErrorMessage] = useState("");
  const [publishSignature, setPublishSignature] = useState("");
  const inFlightRef = useRef(false);

  const inProgress = [
    FLOW.ENCRYPTING,
    FLOW.QUEUING,
    FLOW.AWAITING_MPC,
    FLOW.DECRYPTING,
    FLOW.PUBLISHING,
  ].includes(flow);

  async function runTally() {
    if (!publicKey || inFlightRef.current) return;

    inFlightRef.current = true;
    setFlow(FLOW.ENCRYPTING);
    setErrorMessage("");

    try {
      const provider = createProvider(
        { publicKey, signTransaction, signAllTransactions },
        connection
      );
      const program = createProgramFromProvider(provider, idl);
      const mxePublicKey = await fetchMXEPublicKey(provider, PROGRAM_ID);
      const proposalPDA = getProposalPDA(proposalId, PROGRAM_ID);
      const voteStorePDA = getVoteStorePDA(proposalId, PROGRAM_ID);

      let currentProposal = await program.account.proposal.fetch(proposalPDA);
      let authorityPrivateKey = getStoredAuthorityKey(proposalId);
      let computationOffsetBN = currentProposal.computationOffset
        ? new BN(currentProposal.computationOffset.toString())
        : null;

      if (currentProposal.status.finalized !== undefined) {
        setFlow(FLOW.COMPLETE);
        onComplete?.({
          yesCount: currentProposal.yesCount ?? 0,
          noCount: currentProposal.noCount ?? 0,
          txSig: publishSignature,
        });
        return;
      }

      if (!computationOffsetBN) {
        const {
          ciphertext: authorityDummyCiphertext,
          publicKey: authorityPublicKey,
          nonceU128: authorityNonceU128,
          privateKey,
        } = encryptNull(mxePublicKey);

        authorityPrivateKey = privateKey;
        localStorage.setItem(
          `authority_key_${proposalId.toString()}`,
          Array.from(authorityPrivateKey).join(",")
        );
        localStorage.setItem(
          `mxe_pubkey_${PROGRAM_ID}`,
          Array.from(mxePublicKey).join(",")
        );

        const computationOffset = randomComputationOffset();
        computationOffsetBN = new BN(computationOffset.toString());
        const arciumAccounts = await getArciumAccounts(computationOffsetBN, PROGRAM_ID);

        setFlow(FLOW.QUEUING);

        try {
          await program.methods
            .tallyVotes(
              proposalId,
              computationOffsetBN,
              Array.from(authorityDummyCiphertext),
              Array.from(authorityPublicKey),
              new BN(authorityNonceU128.toString())
            )
            .accountsPartial({
              authority: publicKey,
              proposal: proposalPDA,
              allVotesStore: voteStorePDA,
              ...arciumAccounts,
            })
            .rpc({ commitment: "confirmed" });
        } catch (error) {
          if (!isAlreadyProcessedError(error)) {
            throw error;
          }
        }

        currentProposal = await program.account.proposal.fetch(proposalPDA);
        if (currentProposal.computationOffset) {
          computationOffsetBN = new BN(currentProposal.computationOffset.toString());
        }
      } else if (!authorityPrivateKey) {
        throw new Error(
          "Tally has already been queued for this proposal in another session. Use the same browser/profile that initiated finalization to continue."
        );
      }

      if (!currentProposal.tallyCiphertext || !currentProposal.tallyNonce) {
        setFlow(FLOW.AWAITING_MPC);
        await waitForComputation(provider, computationOffsetBN, PROGRAM_ID);
      }

      setFlow(FLOW.DECRYPTING);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const updatedProposal = await program.account.proposal.fetch(proposalPDA);

      if (!updatedProposal.tallyCiphertext || !updatedProposal.tallyNonce) {
        throw new Error("Callback has not propagated yet. Retry in a few seconds.");
      }

      const { yesCount, noCount } = decryptTallyResult(
        new Uint8Array(updatedProposal.tallyCiphertext),
        new Uint8Array(updatedProposal.tallyNonce),
        authorityPrivateKey,
        mxePublicKey
      );

      setFlow(FLOW.PUBLISHING);

      let signature = "";

      try {
        signature = await program.methods
          .publishTally(proposalId, yesCount, noCount)
          .accounts({
            authority: publicKey,
            proposal: proposalPDA,
          })
          .rpc({ commitment: "confirmed" });
      } catch (error) {
        if (!isAlreadyProcessedError(error)) {
          throw error;
        }
      }

      const finalizedProposal = await program.account.proposal.fetch(proposalPDA);
      if (finalizedProposal.status.finalized === undefined) {
        throw new Error("Tally publish is still settling. Retry in a few seconds.");
      }

      setPublishSignature(signature);
      setFlow(FLOW.COMPLETE);
      onComplete?.({
        yesCount: finalizedProposal.yesCount ?? yesCount,
        noCount: finalizedProposal.noCount ?? noCount,
        txSig: signature,
      });
    } catch (error) {
      console.error("Tally error:", error);
      setErrorMessage(error.message || "Tally process failed");
      setFlow(FLOW.ERROR);
    } finally {
      inFlightRef.current = false;
    }
  }

  const steps = [
    "Queue confidential tally job",
    "Arx nodes compute on encrypted ballots",
    "Callback result lands onchain",
    "Authority decrypts aggregate only",
    "Final tally is published",
  ];

  return (
    <section className="space-y-4">
      {flow === FLOW.READY && (
        <div className="glass-card p-6">
          <div className="flex items-start gap-3 mb-5">
            <div
              className="w-12 h-12 flex items-center justify-center flex-shrink-0"
              style={{
                background: "var(--purple-accent)",
                borderRadius: "4px",
              }}
            >
              <TallyIcon size={22} color="white" />
            </div>
            <div>
              <h3
                className="text-xl font-display font-bold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                Trigger Private Tally
              </h3>
              <p className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                AUTHORITY-ONLY MPC FINALIZATION FLOW
              </p>
            </div>
          </div>

          <div
            className="mb-5 p-4"
            style={{
              background: "rgb(139 92 246 / 0.1)",
              border: "1px solid rgb(139 92 246 / 0.25)",
              borderRadius: "12px",
            }}
          >
            <p className="text-sm font-body leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              This action queues a real Arcium MPC computation, waits for the callback,
              decrypts only the aggregate result locally, and publishes the verified
              tally back onchain.
            </p>
          </div>

          <div className="space-y-2 mb-6">
            {steps.map((step) => (
              <div key={step} className="flex items-start gap-2">
                <svg
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  style={{ color: "var(--purple-accent)" }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm font-body" style={{ color: "var(--text-secondary)" }}>
                  {step}
                </p>
              </div>
            ))}
          </div>

          <button className="btn-primary w-full" onClick={runTally}>
            Trigger MPC Finalization
          </button>
        </div>
      )}

      {inProgress && (
        <div className="glass-card p-6 animate-slide-up">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 relative">
              <svg className="animate-spin text-purple-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <h4
              className="text-xl font-display font-bold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              MPC Computation In Progress
            </h4>
            <p className="text-sm font-body mb-4" style={{ color: "var(--text-secondary)" }}>
              {FLOW_LABELS[flow]}
            </p>

            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ background: "rgb(255 255 255 / 0.08)" }}
            >
              <div
                className="h-full transition-all duration-500 ease-out shimmer"
                style={{
                  width: `${FLOW_PROGRESS[flow] ?? 0}%`,
                  background: "linear-gradient(90deg, var(--purple-accent), #ec4899)",
                }}
              />
            </div>
            <p
              className="text-sm font-mono mt-2"
              style={{ color: "var(--purple-accent)" }}
            >
              {FLOW_PROGRESS[flow] ?? 0}%
            </p>
          </div>

          <div className="space-y-2 text-sm font-body" style={{ color: "var(--text-secondary)" }}>
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>Encrypted ballots are processed without exposing individual direction.</p>
            </div>
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>Only the aggregate result is decrypted locally by the authority.</p>
            </div>
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>Callback verification completes before the published tally becomes canonical.</p>
            </div>
          </div>
        </div>
      )}

      {flow === FLOW.COMPLETE && (
        <div className="glass-card p-6 animate-fade-in">
          <div
            className="rounded-2xl p-6 text-center"
            style={{
              background:
                "linear-gradient(135deg, rgb(139 92 246 / 0.2), rgb(236 72 153 / 0.1))",
              border: "1px solid rgb(139 92 246 / 0.35)",
            }}
          >
            <div className="mb-4">
              <svg className="w-14 h-14 mx-auto text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="text-2xl font-display font-bold mb-2">Tally Published</h4>
            <p className="text-sm font-body max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              The Arcium computation completed, the result was decrypted locally, and
              the final tally has been written back onchain.
            </p>
          </div>

          {publishSignature && (
            <div className="glass-card p-4 mt-5">
              <div className="text-xs font-mono mb-2" style={{ color: "var(--purple-accent)" }}>
                PUBLISH_TRANSACTION
              </div>
              <a
                href={`https://explorer.solana.com/tx/${publishSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono break-all"
                style={{ color: "var(--text-primary)" }}
              >
                {publishSignature}
              </a>
            </div>
          )}
        </div>
      )}

      {flow === FLOW.ERROR && (
        <div className="glass-card p-6">
          <div
            className="p-5"
            style={{
              background: "rgb(239 68 68 / 0.08)",
              border: "1px solid rgb(239 68 68 / 0.35)",
              borderRadius: "12px",
            }}
          >
            <div className="text-sm font-mono mb-2 text-red-300">TALLY_FAILED</div>
            <p className="text-sm font-body text-red-200">{errorMessage}</p>
          </div>
          <button className="btn-primary w-full mt-4" onClick={() => setFlow(FLOW.READY)}>
            Retry Tally
          </button>
        </div>
      )}
    </section>
  );
}
