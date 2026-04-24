import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import ProposalCard from "./ProposalCard.jsx";
import { PROGRAM_ID } from "../constants.js";
import { fetchAllProposals, getProposalStatus } from "../lib/solana.js";

export default function ProposalList({
  onSelectProposal,
  idl,
  onRequestCreate,
  refreshNonce,
  onStatsChange,
}) {
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();
  const { connection } = useConnection();
  const [filter, setFilter] = useState("all");
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!idl) return;
    loadProposals();
  }, [idl, refreshNonce]);

  async function loadProposals() {
    setLoading(true);
    try {
      const walletInterface = connected && publicKey
        ? { publicKey, signTransaction, signAllTransactions }
        : { publicKey: null, signTransaction: null, signAllTransactions: null };

      const provider = new AnchorProvider(connection, walletInterface, {
        commitment: "confirmed",
      });
      const program = new Program(idl, PROGRAM_ID, provider);
      const all = await fetchAllProposals(program);
      setProposals(all);

      onStatsChange?.({
        total: all.length,
        active: all.filter((item) => getProposalStatus(item.account) === "active").length,
        tallying: all.filter((item) => getProposalStatus(item.account) === "tallying").length,
        finalized: all.filter((item) => getProposalStatus(item.account) === "finalized").length,
      });
    } catch (error) {
      console.error("Failed to load proposals:", error);
    } finally {
      setLoading(false);
    }
  }

  const filtered = proposals.filter((proposal) => {
    const status = getProposalStatus(proposal.account);
    if (filter === "active") return status === "active";
    if (filter === "tallying") return status === "tallying";
    if (filter === "finalized") return status === "finalized";
    return true;
  });

  if (loading) {
    return (
      <div className="glass-card p-12 text-center animate-fade-in">
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
            className="text-2xl font-display font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Governance Queue
          </h3>
          <p className="text-sm font-mono mt-1" style={{ color: "var(--text-secondary)" }}>
            LIVE PRIVATE PROPOSALS ON SOLANA DEVNET
          </p>
        </div>
        {connected && (
          <button onClick={onRequestCreate} className="btn-primary">
            Create New Proposal
          </button>
        )}
      </div>

      {proposals.length > 0 && (
        <div className="flex flex-wrap gap-3 justify-center">
          {[
            ["all", "All", proposals.length],
            [
              "active",
              "Active",
              proposals.filter((item) => getProposalStatus(item.account) === "active").length,
            ],
            [
              "tallying",
              "Tallying",
              proposals.filter((item) => getProposalStatus(item.account) === "tallying").length,
            ],
            [
              "finalized",
              "Finalized",
              proposals.filter((item) => getProposalStatus(item.account) === "finalized").length,
            ],
          ].map(([value, label, count]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className="px-4 py-2 text-sm font-mono transition-all"
              style={
                filter === value
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
              {label.toUpperCase()} ({count})
            </button>
          ))}
        </div>
      )}

      {proposals.length === 0 ? (
        <div className="glass-card p-12 text-center animate-fade-in">
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
          <h3 className="text-2xl font-display font-bold mb-2">No Proposals Yet</h3>
          <p className="mb-6 font-body" style={{ color: "var(--text-secondary)" }}>
            Be the first to create a private governance proposal
          </p>
          {connected && (
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
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="font-body" style={{ color: "var(--text-secondary)" }}>
            No {filter} proposals found
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filtered.map((proposal, index) => (
            <div key={proposal.publicKey.toBase58()} style={{ animationDelay: `${index * 100}ms` }}>
              <ProposalCard proposal={proposal} onClick={() => onSelectProposal(proposal)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
