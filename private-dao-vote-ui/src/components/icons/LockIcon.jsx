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
      <path
        d="M8 2.25 12.25 4.7v6.6L8 13.75 3.75 11.3V4.7L8 2.25Z"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.15 6.2h3.7"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.8 6.9 7.8 8.6M9.2 6.9 8.2 8.6"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.1" cy="6.2" r="0.85" fill={color} />
      <circle cx="9.9" cy="6.2" r="0.85" fill={color} />
      <circle cx="8" cy="9.55" r="0.85" fill={color} />
    </svg>
  );
}
