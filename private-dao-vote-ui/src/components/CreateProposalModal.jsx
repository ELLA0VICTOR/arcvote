import { useRef, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import ProposalIcon from "./icons/ProposalIcon.jsx";
import LockIcon from "./icons/LockIcon.jsx";
import { encryptNull } from "../lib/encryption.js";
import { fetchMXEPublicKey } from "../lib/arcium.js";
import { MAX_VOTERS, PROGRAM_ID } from "../constants.js";
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

function parseWhitelistInput(value) {
  const entries = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!entries.length) {
    return [];
  }

  const allowedVoters = [];
  const seen = new Set();

  for (const entry of entries) {
    let pubkey;
    try {
      pubkey = new PublicKey(entry);
    } catch {
      throw new Error(`Invalid wallet address in whitelist: ${entry}`);
    }

    const normalized = pubkey.toBase58();
    if (seen.has(normalized)) {
      throw new Error(`Duplicate whitelist address: ${normalized}`);
    }

    seen.add(normalized);
    allowedVoters.push(pubkey);
  }

  if (allowedVoters.length > MAX_VOTERS) {
    throw new Error(
      `This build supports up to ${MAX_VOTERS} whitelisted voters per proposal.`
    );
  }

  return allowedVoters;
}

function parseWhitelistFile(value) {
  const entries = value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const allowedVoters = [];
  const rejectedEntries = [];
  const seen = new Set();

  for (const entry of entries) {
    let pubkey;
    try {
      pubkey = new PublicKey(entry);
    } catch {
      rejectedEntries.push({ value: entry, reason: "Invalid address" });
      continue;
    }

    const normalized = pubkey.toBase58();
    if (seen.has(normalized)) {
      rejectedEntries.push({ value: normalized, reason: "Duplicate entry" });
      continue;
    }

    if (allowedVoters.length >= MAX_VOTERS) {
      rejectedEntries.push({
        value: normalized,
        reason: `Exceeds ${MAX_VOTERS}-wallet limit`,
      });
      continue;
    }

    seen.add(normalized);
    allowedVoters.push(pubkey);
  }

  allowedVoters.sort((a, b) => a.toBase58().localeCompare(b.toBase58()));

  return { allowedVoters, rejectedEntries };
}

export default function CreateProposalModal({ onClose, onCreated, idl }) {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();

  const [step, setStep] = useState(STEP.FORM);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [customEndAt, setCustomEndAt] = useState(getDefaultCustomEndAt);
  const [restrictVoting, setRestrictVoting] = useState(false);
  const [whitelistText, setWhitelistText] = useState("");
  const [whitelistImportSummary, setWhitelistImportSummary] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [txSignature, setTxSignature] = useState("");
  const whitelistFileInputRef = useRef(null);

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
  const whitelistCount = whitelistText
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean).length;

  async function handleWhitelistUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileContents = await file.text();
      const { allowedVoters, rejectedEntries } = parseWhitelistFile(fileContents);

      setWhitelistText(allowedVoters.map((address) => address.toBase58()).join("\n"));
      setWhitelistImportSummary({
        fileName: file.name,
        acceptedCount: allowedVoters.length,
        rejectedEntries,
      });

      if (!allowedVoters.length) {
        setErrorMessage("No valid wallet addresses were found in the uploaded file.");
      } else {
        setErrorMessage("");
      }
    } catch (error) {
      console.error("Whitelist import error:", error);
      setErrorMessage(error.message || "Failed to import wallet list.");
    } finally {
      event.target.value = "";
    }
  }

  function handleDownloadTemplate() {
    const template = [
      "wallet_address",
      "6UjjZq8cZLepWU8UKAvB7KjcGGxrRiin9xFXgburNEWD",
      "7TFtVd1e5DSaonVSGP73GPKe78w2EmkL5LrkjGGL6PDH",
    ].join("\n");

    const blob = new Blob([template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "arcvote-whitelist-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

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
      const allowedVoters = restrictVoting ? parseWhitelistInput(whitelistText) : [];

      if (restrictVoting && allowedVoters.length === 0) {
        throw new Error("Add at least one wallet address to enable restricted voting.");
      }

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
          new BN(nonceU128.toString()),
          allowedVoters
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
                  className="p-4 space-y-3"
                  style={{
                    background: "rgb(255 255 255 / 0.04)",
                    border: "1px solid rgb(255 255 255 / 0.06)",
                    borderRadius: "12px",
                  }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div
                        className="text-sm font-mono mb-1"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Eligible Voters
                      </div>
                      <p
                        className="text-xs font-body"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Leave this open for public participation, or restrict voting to a defined wallet set.
                      </p>
                    </div>

                    <label
                      className="flex items-center gap-3 text-xs font-mono"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <input
                        type="checkbox"
                        checked={restrictVoting}
                        onChange={(event) => setRestrictVoting(event.target.checked)}
                      />
                      Restrict voting
                    </label>
                  </div>

                  {restrictVoting ? (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          ref={whitelistFileInputRef}
                          type="file"
                          accept=".txt,.csv,text/plain,text/csv"
                          onChange={handleWhitelistUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          className="btn-secondary w-full sm:w-auto"
                          onClick={() => whitelistFileInputRef.current?.click()}
                        >
                          Upload TXT / CSV
                        </button>
                        <button
                          type="button"
                          className="btn-secondary w-full sm:w-auto"
                          onClick={handleDownloadTemplate}
                        >
                          Download Template
                        </button>
                      </div>

                      <div
                        className="text-xs font-body"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Import one wallet per line or column. ArcVote will dedupe valid entries and ignore invalid rows.
                      </div>

                      {whitelistImportSummary && (
                        <div
                          className="p-3 space-y-2"
                          style={{
                            background: "rgb(255 255 255 / 0.03)",
                            border: "1px solid rgb(255 255 255 / 0.06)",
                            borderRadius: "10px",
                          }}
                        >
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs font-mono">
                            <span style={{ color: "var(--text-primary)" }}>
                              IMPORTED {whitelistImportSummary.fileName.toUpperCase()}
                            </span>
                            <span style={{ color: "var(--purple-accent)" }}>
                              {whitelistImportSummary.acceptedCount}/{MAX_VOTERS} accepted
                            </span>
                          </div>

                          {whitelistImportSummary.rejectedEntries.length > 0 && (
                            <div
                              className="text-xs font-body"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              Rejected:{" "}
                              {whitelistImportSummary.rejectedEntries
                                .slice(0, 3)
                                .map((entry) => `${entry.value} (${entry.reason})`)
                                .join(", ")}
                              {whitelistImportSummary.rejectedEntries.length > 3
                                ? ` +${whitelistImportSummary.rejectedEntries.length - 3} more`
                                : ""}
                            </div>
                          )}
                        </div>
                      )}

                      <textarea
                        className="input-field w-full min-h-[112px] resize-y"
                        value={whitelistText}
                        onChange={(event) => setWhitelistText(event.target.value)}
                        placeholder={"One wallet address per line\n6UjjZq8cZLepWU8UKAvB7KjcGGxrRiin9xFXgburNEWD"}
                      />
                      <div
                        className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs font-mono"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <span>Only listed wallets can cast ballots.</span>
                        <span>{whitelistCount}/{MAX_VOTERS} entered</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="text-xs font-mono"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      OPEN VOTE — any connected wallet can participate until the voting deadline.
                    </div>
                  )}
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
