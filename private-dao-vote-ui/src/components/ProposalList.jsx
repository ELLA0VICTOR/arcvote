import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import ProposalCard from "./ProposalCard.jsx";
import {
  createProgram,
  fetchAllProposals,
  getProposalStatus,
  isInTallyQueue,
} from "../lib/solana.js";

export default function ProposalList({
  onSelectProposal,
  idl,
  onRequestCreate,
  refreshNonce,
  onStatsChange,
}) {
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();
  const { connection } = useConnection();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clockTick, setClockTick] = useState(0);
  const [currentView, setCurrentView] = useState("active");

  useEffect(() => {
    if (!idl) return;
    loadProposals();
  }, [idl, refreshNonce]);

  useEffect(() => {
    if (!idl) return undefined;

    const intervalId = window.setInterval(() => {
      loadProposals(true);
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [idl, connection, connected, publicKey, signTransaction, signAllTransactions]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!proposals.length) {
      onStatsChange?.({
        total: 0,
        active: 0,
        tallying: 0,
        finalized: 0,
      });
      return;
    }

    onStatsChange?.({
      total: proposals.length,
      active: proposals.filter((item) => getProposalStatus(item.account) === "active").length,
      tallying: proposals.filter((item) => isInTallyQueue(item.account)).length,
      finalized: proposals.filter((item) => getProposalStatus(item.account) === "finalized").length,
    });
  }, [proposals, onStatsChange, clockTick]);

  async function loadProposals(isSilent = false) {
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const walletInterface = connected && publicKey
        ? { publicKey, signTransaction, signAllTransactions }
        : undefined;

      const program = createProgram(walletInterface, connection, idl);
      const all = await fetchAllProposals(program);
      setProposals(all);
    } catch (error) {
      console.error("Failed to load proposals:", error);
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  }

  const activeProposals = proposals.filter(
    (proposal) => getProposalStatus(proposal.account) === "active"
  );
  const tallyQueue = proposals.filter((proposal) => isInTallyQueue(proposal.account));
  const finalizedProposals = proposals.filter(
    (proposal) => getProposalStatus(proposal.account) === "finalized"
  );

  const sections = [
    {
      key: "active",
      label: "Active",
      title: "Active Governance Queue",
      subtitle: "ONLY OPEN PRIVATE PROPOSALS ARE SHOWN IN THIS VIEW",
      emptyTitle: "No Active Proposals",
      emptyCopy: connected
        ? "Create a fresh proposal or wait for the next governance item to open."
        : "Connect a wallet to create or participate in active governance proposals.",
      items: activeProposals,
    },
    {
      key: "tallying",
      label: "Tally Queue",
      title: "Tally Queue",
      subtitle: "EXPIRED PROPOSALS WAITING FOR AUTHORITY FINALIZATION",
      emptyTitle: "No Proposals Awaiting Tally",
      emptyCopy: "Everything that has expired has either already been finalized or no tally is pending yet.",
      items: tallyQueue,
    },
    {
      key: "finalized",
      label: "Finalized",
      title: "Finalized Archive",
      subtitle: "COMPLETED PROPOSALS WITH PUBLISHED RESULTS",
      emptyTitle: "No Finalized Proposals Yet",
      emptyCopy: "Published governance outcomes will appear here once the Arcium tally flow has completed.",
      items: finalizedProposals,
    },
  ];

  const activeSection = sections.find((section) => section.key === currentView) ?? sections[0];

  function renderProposalGrid(items) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {items.map((proposal, index) => (
          <div
            key={proposal.publicKey.toBase58()}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <ProposalCard proposal={proposal} onClick={() => onSelectProposal(proposal)} />
          </div>
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-card p-8 sm:p-12 text-center animate-fade-in">
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
        <h3 className="text-2xl font-display font-bold mb-2">Loading Governance Queue</h3>
        <p style={{ color: "var(--text-secondary)" }}>
          Pulling proposal accounts from Solana devnet...
        </p>
      </div>
    );
  }

  return (
    <div id="proposal-queue" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3
            className="text-xl sm:text-2xl font-display font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {activeSection.title}
          </h3>
          <p className="text-sm font-mono mt-1" style={{ color: "var(--text-secondary)" }}>
            {activeSection.subtitle}
          </p>
        </div>
        {connected && (
          <button onClick={onRequestCreate} className="btn-primary w-full sm:w-auto">
            Create New Proposal
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className="sm:hidden">
          <label
            htmlFor="proposal-view"
            className="block text-xs font-mono mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            QUEUE_VIEW
          </label>
          <select
            id="proposal-view"
            className="input-field w-full"
            value={currentView}
            onChange={(event) => setCurrentView(event.target.value)}
          >
            {sections.map((section) => (
              <option key={section.key} value={section.key}>
                {section.label} ({section.items.length})
              </option>
            ))}
          </select>
        </div>

        <div className="hidden sm:flex flex-wrap gap-3">
          {sections.map((section) => {
            const isSelected = section.key === currentView;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setCurrentView(section.key)}
                className="px-4 py-2 text-sm font-mono transition-all"
                style={
                  isSelected
                    ? {
                        background: "var(--purple-accent)",
                        color: "white",
                        borderRadius: "2px",
                      }
                    : {
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-secondary)",
                        borderRadius: "2px",
                        background: "transparent",
                      }
                }
              >
                {section.label.toUpperCase()} ({section.items.length})
              </button>
            );
          })}
        </div>
      </div>

      {activeSection.items.length === 0 ? (
        <div className="glass-card p-8 sm:p-12 text-center animate-fade-in">
          <svg
            className="w-20 h-20 mx-auto mb-6 text-purple-400/50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <h3 className="text-2xl font-display font-bold mb-2">
            {activeSection.emptyTitle}
          </h3>
          <p className="mb-6 font-body" style={{ color: "var(--text-secondary)" }}>
            {activeSection.emptyCopy}
          </p>
          {connected && currentView === "active" && (
            <div
              className="inline-block px-6 py-3"
              style={{
                background: "rgb(139 92 246 / 0.1)",
                border: "1px solid rgb(139 92 246 / 0.3)",
                borderRadius: "12px",
              }}
            >
              <p className="text-sm font-body" style={{ color: "var(--text-secondary)" }}>
                Click{" "}
                <span className="font-semibold" style={{ color: "var(--purple-accent)" }}>
                  Create New Proposal
                </span>{" "}
                above to get started
              </p>
            </div>
          )}
        </div>
      ) : (
        renderProposalGrid(activeSection.items)
      )}
    </div>
  );
}
