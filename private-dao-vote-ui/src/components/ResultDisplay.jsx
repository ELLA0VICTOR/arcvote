import ShieldIcon from "./icons/ShieldIcon.jsx";

export default function ResultDisplay({ proposal }) {
  const yesCount = proposal.yesCount ?? 0;
  const noCount = proposal.noCount ?? 0;
  const votesCast = proposal.votesCast ?? 0;
  const abstainCount = Math.max(0, votesCast - yesCount - noCount);
  const totalVotes = Math.max(votesCast, 1);
  const yesPercentage = Math.round((yesCount / totalVotes) * 100);
  const noPercentage = Math.round((noCount / totalVotes) * 100);
  const passed = yesCount > noCount;

  return (
    <section className="space-y-4">
      <div className="glass-card p-6 animate-fade-in">
        <div
          className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
          style={{
            background: passed
              ? "linear-gradient(135deg, rgb(139 92 246 / 0.22), rgb(34 197 94 / 0.14))"
              : "linear-gradient(135deg, rgb(139 92 246 / 0.18), rgb(239 68 68 / 0.12))",
            border: "1px solid rgb(139 92 246 / 0.35)",
          }}
        >
          <div className="text-center mb-6">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4"
              style={{
                background: passed ? "rgb(34 197 94 / 0.2)" : "rgb(239 68 68 / 0.18)",
                color: passed ? "rgb(74 222 128)" : "rgb(248 113 113)",
              }}
            >
              {passed ? "PASSED" : "REJECTED"}
            </div>
            <h3 className="text-3xl font-display font-bold mb-2">Published Governance Result</h3>
            <p className="text-sm font-body max-w-2xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              The only revealed output is the aggregate tally. Individual ballots
              remained encrypted throughout proposal creation, voting, and MPC execution.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <div
              className="p-5"
              style={{
                background: "rgb(255 255 255 / 0.05)",
                border: "1px solid rgb(255 255 255 / 0.08)",
                borderRadius: "14px",
              }}
            >
              <div className="text-xs font-mono mb-2" style={{ color: "rgb(74 222 128)" }}>
                YES_VOTES
              </div>
              <div className="text-4xl font-display font-bold mb-2">{yesCount}</div>
              <div className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                {yesPercentage}% of submitted ballots
              </div>
            </div>

            <div
              className="p-5"
              style={{
                background: "rgb(255 255 255 / 0.05)",
                border: "1px solid rgb(255 255 255 / 0.08)",
                borderRadius: "14px",
              }}
            >
              <div className="text-xs font-mono mb-2" style={{ color: "rgb(248 113 113)" }}>
                NO_VOTES
              </div>
              <div className="text-4xl font-display font-bold mb-2">{noCount}</div>
              <div className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                {noPercentage}% of submitted ballots
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-mono" style={{ color: "rgb(74 222 128)" }}>
                  YES
                </span>
                <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                  {yesPercentage}%
                </span>
              </div>
              <div className="progress-track">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${yesPercentage}%`,
                    background: "linear-gradient(90deg, #22c55e, #8b5cf6)",
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-mono" style={{ color: "rgb(248 113 113)" }}>
                  NO
                </span>
                <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                  {noPercentage}%
                </span>
              </div>
              <div className="progress-track">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${noPercentage}%`,
                    background: "linear-gradient(90deg, #ef4444, #8b5cf6)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="text-3xl font-display font-bold mb-1" style={{ color: "var(--purple-accent)" }}>
            {votesCast}
          </div>
          <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
            BALLOTS_CAST
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="text-3xl font-display font-bold mb-1" style={{ color: "var(--purple-accent)" }}>
            {abstainCount}
          </div>
          <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
            EMPTY_SLOTS
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="text-3xl font-display font-bold mb-1" style={{ color: "var(--purple-accent)" }}>
            {proposal.maxVoters}
          </div>
          <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
            CIRCUIT_CAPACITY
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="text-3xl font-display font-bold mb-1" style={{ color: "var(--purple-accent)" }}>
            {passed ? "YES" : "NO"}
          </div>
          <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
            FINAL_OUTCOME
          </div>
        </div>
      </div>

      <div
        className="glass-card p-5 flex items-start gap-3"
        style={{
          borderColor: "rgb(139 92 246 / 0.3)",
        }}
      >
        <ShieldIcon size={18} color="var(--purple-accent)" />
        <div>
          <div className="text-sm font-mono mb-1" style={{ color: "var(--purple-accent)" }}>
            VERIFIED_EXECUTION
          </div>
          <p className="text-sm font-body leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            The result was accepted only after the Arcium callback payload was verified
            by the Solana program. The chain stores the final aggregate tally, not any
            individual vote choice.
          </p>
        </div>
      </div>
    </section>
  );
}
