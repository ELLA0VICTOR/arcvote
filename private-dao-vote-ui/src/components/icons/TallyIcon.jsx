// src/components/icons/TallyIcon.jsx
export default function TallyIcon({ size = 16, color = "currentColor", className = "" }) {
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
      {/* Circuit board tally lines */}
      {/* Four vertical tally marks */}
      <line x1="3"  y1="4" x2="3"  y2="12" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
      <line x1="5.5" y1="4" x2="5.5" y2="12" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
      <line x1="8" y1="4" x2="8"  y2="12" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
      <line x1="10.5" y1="4" x2="10.5" y2="12" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
      {/* Fifth diagonal strike-through */}
      <line x1="2" y1="11" x2="12" y2="5" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
      {/* Circuit node dots */}
      <circle cx="3"   cy="4"  r="1" fill={color} />
      <circle cx="5.5" cy="12" r="1" fill={color} />
      <circle cx="8"   cy="4"  r="1" fill={color} />
      <circle cx="10.5" cy="12" r="1" fill={color} />
    </svg>
  );
}
