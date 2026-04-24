// src/components/icons/ShieldIcon.jsx
export default function ShieldIcon({ size = 16, color = "currentColor", className = "" }) {
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
      {/* Shield outline */}
      <path
        d="M8 1.5L2.5 4v4.5C2.5 11.75 5 14 8 14.5c3-0.5 5.5-2.75 5.5-6V4L8 1.5z"
        stroke={color}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {/* Check mark */}
      <path
        d="M5.5 8.25l1.75 1.75 3.25-3.25"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
