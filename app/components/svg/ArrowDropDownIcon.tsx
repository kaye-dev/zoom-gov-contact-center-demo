export function ArrowDropDownIcon({
  className,
  height = 24,
  width = 24,
}: {
  className?: string;
  height?: number;
  width?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -960 960 960"
      className={className}
      height={`${height}px`}
      width={`${width}px`}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M480-360 280-560h400L480-360Z" />
    </svg>
  );
}
