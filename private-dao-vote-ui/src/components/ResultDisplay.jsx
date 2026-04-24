export default function ResultDisplay({ proposal }) {
  const yesCount = proposal.yesCount ?? 0;
  const noCount = proposal.noCount ?? 0;
  const votesCast = proposal.votesCast ?? 0;
  const totalVotes = Math.max(votesCast, 1);
  const yesPercentage = Math.round((yesCount / totalVotes) * 100);
  const noPercentage = Math.round((noCount / totalVotes) * 100);
  const passed = yesCount > noCount;

  const yesTone = "var(--purple-accent)";
  const noTone = "rgb(248 113 113)";
  const outcomeTone = passed ? "rgb(74 222 128)" : "rgb(248 113 113)";
  const yesWidth = yesCount > 0 ? `${yesPercentage}%` : "0%";
  const noWidth = noCount > 0 ? `${noPercentage}%` : "0%";

  return (
    <section className="space-y-4">
      <div className="glass-card p-5 sm:p-7 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div>
            <div
              className="text-xs font-mono mb-2"
              style={{ color: "var(--purple-accent)" }}
            >
              FINAL RESULT
            </div>
            <h3
              className="text-xl sm:text-3xl font-display font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Published Governance Result
            </h3>
          </div>

          <div
            className="px-3 py-2 text-xs font-mono"
            style={{
              color: outcomeTone,
              border: `1px solid ${outcomeTone}33`,
              background: passed ? "rgb(34 197 94 / 0.08)" : "rgb(239 68 68 / 0.08)",
              borderRadius: "2px",
            }}
          >
            {passed ? "PASSED" : "REJECTED"}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div
            className="p-5"
            style={{
              background: "rgb(255 255 255 / 0.04)",
              border: "1px solid rgb(255 255 255 / 0.06)",
              borderRadius: "4px",
            }}
          >
            <div
              className="text-xs font-mono mb-2"
              style={{ color: yesTone }}
            >
              YES VOTES
            </div>
            <div
              className="text-4xl font-display font-bold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              {yesCount}
            </div>
            <div className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
              {yesPercentage}% of submitted ballots
            </div>
          </div>

          <div
            className="p-5"
            style={{
              background: "rgb(255 255 255 / 0.04)",
              border: "1px solid rgb(255 255 255 / 0.06)",
              borderRadius: "4px",
            }}
          >
            <div
              className="text-xs font-mono mb-2"
              style={{ color: noTone }}
            >
              NO VOTES
            </div>
            <div
              className="text-4xl font-display font-bold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              {noCount}
            </div>
            <div className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
              {noPercentage}% of submitted ballots
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                YES
              </span>
              <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                {yesPercentage}%
              </span>
            </div>
            <div
              className="h-2 overflow-hidden"
              style={{
                background: "rgb(255 255 255 / 0.08)",
                borderRadius: "2px",
              }}
            >
              <div
                className="h-full"
                style={{
                  width: yesWidth,
                  background: yesTone,
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                NO
              </span>
              <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                {noPercentage}%
              </span>
            </div>
            <div
              className="h-2 overflow-hidden"
              style={{
                background: "rgb(255 255 255 / 0.08)",
                borderRadius: "2px",
              }}
            >
              <div
                className="h-full"
                style={{
                  width: noWidth,
                  background: noTone,
                }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div
            className="p-4"
            style={{
              background: "rgb(255 255 255 / 0.04)",
              border: "1px solid rgb(255 255 255 / 0.06)",
              borderRadius: "4px",
            }}
          >
            <div className="text-xs font-mono mb-2" style={{ color: "var(--text-secondary)" }}>
              BALLOTS CAST
            </div>
            <div className="text-2xl font-display font-bold" style={{ color: "var(--text-primary)" }}>
              {votesCast}
            </div>
          </div>

          <div
            className="p-4"
            style={{
              background: "rgb(255 255 255 / 0.04)",
              border: "1px solid rgb(255 255 255 / 0.06)",
              borderRadius: "4px",
            }}
          >
            <div className="text-xs font-mono mb-2" style={{ color: "var(--text-secondary)" }}>
              FINAL OUTCOME
            </div>
            <div
              className="text-2xl font-display font-bold"
              style={{ color: passed ? yesTone : noTone }}
            >
              {passed ? "YES" : "NO"}
            </div>
          </div>

          <div
            className="p-4 col-span-2 sm:col-span-1"
            style={{
              background: "rgb(255 255 255 / 0.04)",
              border: "1px solid rgb(255 255 255 / 0.06)",
              borderRadius: "4px",
            }}
          >
            <div className="text-xs font-mono mb-2" style={{ color: "var(--text-secondary)" }}>
              SETTLEMENT
            </div>
            <div className="text-sm font-mono" style={{ color: "var(--purple-accent)" }}>
              VERIFIED ONCHAIN
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
