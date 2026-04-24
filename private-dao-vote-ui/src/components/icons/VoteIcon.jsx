// src/components/icons/VoteIcon.jsx
export default function VoteIcon({ size = 16, color = "currentColor", className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Ballot box */}
      <rect
        x="2"
        y="6"
        width="12"
        height="8"
        rx="1"
        stroke={color}
        strokeWidth="1.25"
      />
      {/* Slot */}
      <path
        d="M6 6V5a2 2 0 0 1 4 0v1"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {/* Ballot paper slot */}
      <path
        d="M5.5 9h5"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
        strokeDasharray="1.5 1"
      />
      {/* Check on paper */}
      <path
        d="M6.5 10.5l1 1 2-2"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
