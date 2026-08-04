export function ChevronLeftIcon({
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
      <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z" />
    </svg>
  );
}
