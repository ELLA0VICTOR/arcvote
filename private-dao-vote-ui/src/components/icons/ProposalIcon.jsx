// src/components/icons/ProposalIcon.jsx
export default function ProposalIcon({ size = 16, color = "currentColor", className = "" }) {
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
      {/* Document body with corner fold */}
      <path
        d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
        stroke={color}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {/* Corner fold crease */}
      <path
        d="M10 2v3h3"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Text lines */}
      <line x1="4.5" y1="7.5"  x2="11.5" y2="7.5"  stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="4.5" y1="9.5"  x2="11.5" y2="9.5"  stroke={color} strokeWidth="1" strokeLinecap="round" />
      <line x1="4.5" y1="11.5" x2="8.5"  y2="11.5" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
