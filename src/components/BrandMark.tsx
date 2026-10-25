interface BrandMarkProps {
  readonly className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
      focusable="false"
    >
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.25" opacity="0.45" />
      <path
        d="M24 9.5c4.3 5.3 6.5 9 6.5 12.5a6.5 6.5 0 1 1-13 0c0-3.5 2.2-7.2 6.5-12.5Z"
        fill="currentColor"
      />
      <path
        d="M12.5 32.2c3.3 4.8 8.6 7.4 15.6 6.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M19 37.4c4 1 7.8.7 11.4-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
