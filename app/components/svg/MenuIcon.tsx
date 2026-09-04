export function MenuIcon({ className, height = 24, width = 24 }: { className?: string; height?: number; width?: number }) {
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
      <path d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z" />
    </svg>
  );
}
