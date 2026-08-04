export function ChevronRightIcon({
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
      <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z" />
    </svg>
  );
}
