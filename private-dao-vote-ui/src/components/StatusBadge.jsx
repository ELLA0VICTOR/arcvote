export default function StatusBadge({ status }) {
  const config = {
    active: {
      label: "Active",
      className: "status-pill status-pill-active",
    },
    tallying: {
      label: "Tallying",
      className: "status-pill status-pill-tallying",
    },
    finalized: {
      label: "Finalized",
      className: "status-pill status-pill-finalized",
    },
  };

  const current = config[status] ?? config.active;

  return <span className={current.className}>{current.label}</span>;
}
