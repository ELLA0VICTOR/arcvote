// src/components/icons/LockIcon.jsx
export default function LockIcon({ size = 16, color = "currentColor", className = "" }) {
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
      {/* Shackle */}
      <path
        d="M5 7V5a3 3 0 0 1 6 0v2"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Body */}
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.5"
        stroke={color}
        strokeWidth="1.25"
      />
      {/* Keyhole */}
      <circle cx="8" cy="10.5" r="1" fill={color} />
      <path
        d="M8 11.5v1"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
