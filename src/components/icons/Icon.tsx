type IconProps = { size?: number; className?: string };

export function CompassLogoIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="20" height="20" rx="5" fill="#534AB7" />
      <circle cx="10" cy="10" r="6.5" stroke="#CECBF6" strokeWidth="1.3" />
      <circle
        cx="10"
        cy="10"
        r="3.8"
        stroke="#7F77DD"
        strokeWidth="1"
        strokeDasharray="2.8 2"
      />
      <circle cx="10" cy="10" r="1.5" fill="#CECBF6" />
      <line
        x1="10"
        y1="10"
        x2="10"
        y2="4.5"
        stroke="#CECBF6"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="10"
        y1="10"
        x2="14.2"
        y2="12.5"
        stroke="#9490C4"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PackageIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="1.5" y="4.5" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 7.5h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.5 4.5V2.5M10.5 4.5V2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function FlaskIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M5.5 1.5h5M6 1.5v4.8L2.5 13a.75.75 0 0 0 .65 1.1h9.7a.75.75 0 0 0 .65-1.1L10 6.3V1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 10.5h8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export function AppWindowIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 6h13" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4.5" cy="4.25" r="0.9" fill="currentColor" />
      <circle cx="7" cy="4.25" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function SparkleIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8 1.5L9.2 6.8L14.5 8L9.2 9.2L8 14.5L6.8 9.2L1.5 8L6.8 6.8L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RefreshIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3 8a5 5 0 1 0 1.2-3.3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <polyline
        points="3,4.5 3,8 6.5,8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GearIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.42 1.42M11.65 11.65l1.42 1.42M2.93 13.07l1.42-1.42M11.65 4.35l1.42-1.42"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <polyline
        points="10,3 5,8 10,13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <polyline
        points="6,3 11,8 6,13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
