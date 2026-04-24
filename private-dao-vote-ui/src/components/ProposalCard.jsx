import StatusBadge from "./StatusBadge.jsx";
import ProposalIcon from "./icons/ProposalIcon.jsx";
import {
  formatAddress,
  formatDate,
  formatTimeRemaining,
  getProposalStatus,
  isVotingEnded,
} from "../lib/solana.js";

export default function ProposalCard({ proposal, index = 0, onClick }) {
  const account = proposal.account;
  const status = getProposalStatus(account);
  const ended = isVotingEnded(account);
  const endTimestamp = account.endTime.toNumber();
  const votesCast = account.votesCast;
  const maxVoters = account.maxVoters;
  const utilization = Math.max(
    6,
    Math.round((Math.min(votesCast, maxVoters) / Math.max(maxVoters, 1)) * 100)
  );
  const excerpt =
    account.description.length > 170
      ? `${account.description.slice(0, 170)}...`
      : account.description;

  const metaCards = [
    {
      label: "Authority",
      value: formatAddress(account.authority.toBase58()),
    },
    {
      label: ended ? "Closed" : "Countdown",
      value: ended ? formatDate(endTimestamp) : formatTimeRemaining(endTimestamp),
    },
    {
      label: "Ballots",
      value: `${votesCast}/${maxVoters}`,
    },
    {
      label: "Circuit",
      value: "Fixed 10-slot MPC",
    },
  ];

  return (
    <div
      className="glass-card-hover p-6 animate-cascade cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex justify-between items-start gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 flex items-center justify-center flex-shrink-0"
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--purple-accent)",
                borderRadius: "4px",
              }}
            >
              <ProposalIcon size={18} color="var(--purple-accent)" />
            </div>
            <div className="min-w-0">
              <div
                className="text-xs font-mono mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                PROPOSAL_{account.proposalId.toString()}
              </div>
              <h3
                className="text-2xl font-display font-bold leading-tight truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {account.title}
              </h3>
            </div>
          </div>
          <p
            className="text-sm font-body leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {excerpt}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <StatusBadge status={status} />
          <div
            className="px-2 py-1 text-xs font-mono"
            style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: "2px",
              color: "var(--text-secondary)",
            }}
          >
            DEVNET
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {metaCards.map((item) => (
          <div
            key={item.label}
            className="p-3"
            style={{
              background: "rgb(255 255 255 / 0.05)",
              borderRadius: "10px",
            }}
          >
            <p
              className="text-xs font-mono mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              {item.label}
            </p>
            <p
              className="text-sm font-semibold break-words"
              style={{ color: "var(--text-primary)" }}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <div className="flex justify-between items-center mb-2 gap-4">
          <span
            className="text-xs font-mono"
            style={{ color: "var(--text-secondary)" }}
          >
            BALLOT_FILL
          </span>
          <span
            className="text-xs font-mono"
            style={{ color: "var(--purple-accent)" }}
          >
            {utilization}%
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${utilization}%` }} />
        </div>
      </div>

      {status !== "finalized" && (
        <div
          className="mb-5 p-4 flex items-start gap-3"
          style={{
            background: "rgb(139 92 246 / 0.1)",
            border: "1px solid rgb(139 92 246 / 0.25)",
            borderRadius: "12px",
          }}
        >
          <svg
            className="w-5 h-5 mt-0.5 flex-shrink-0"
            style={{ color: "var(--purple-accent)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <div className="flex-1">
            <p
              className="text-sm font-semibold mb-1"
              style={{ color: "rgb(196 181 253)" }}
            >
              Ballots remain encrypted
            </p>
            <p className="text-xs font-body" style={{ color: "var(--text-secondary)" }}>
              Vote direction stays hidden until the authority triggers the Arcium MPC
              tally and publishes only the aggregate result.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div
            className="text-xs font-mono"
            style={{ color: "var(--text-secondary)" }}
          >
            {ended && status !== "finalized"
              ? "Awaiting authority tally"
              : status === "finalized"
              ? "Final result available"
              : "Voting window open"}
          </div>
          {!ended && (
            <div
              className="text-xs font-mono"
              style={{ color: "var(--purple-accent)" }}
            >
              ENDS {formatDate(endTimestamp)}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={(event) => {
            event.stopPropagation();
            onClick?.();
          }}
        >
          Inspect Proposal
        </button>
      </div>
    </div>
  );
}
