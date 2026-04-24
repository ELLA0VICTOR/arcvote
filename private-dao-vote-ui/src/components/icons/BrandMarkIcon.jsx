export default function BrandMarkIcon({
  size = 16,
  color = "currentColor",
  className = "",
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="8" y="8" width="16" height="16" stroke={color} strokeWidth="2" fill="none" />
      <rect x="12" y="12" width="8" height="8" fill={color} />
    </svg>
  );
}
