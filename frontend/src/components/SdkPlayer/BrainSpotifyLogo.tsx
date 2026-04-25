import * as React from "react";

export function BrainSpotifyLogo({
  size = 28,
  title = "CogniShift",
}: {
  size?: number;
  title?: string;
}) {
  const id = React.useId();
  const gradientId = `${id}-brainGradient`;
  const glowId = `${id}-glow`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="14" y1="10" x2="52" y2="54">
          <stop offset="0" stopColor="#1ED760" />
          <stop offset="1" stopColor="#1DB954" />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0.35  0 0 1 0 0.2  0 0 0 0.75 0"
            result="color"
          />
          <feMerge>
            <feMergeNode in="color" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outline-only “brain” mark (simple + readable at small sizes) */}
      <g filter={`url(#${glowId})`} fill="none" stroke={`url(#${gradientId})`}>
        <path
          d="M26.5 14.5c-6.4 0-11.6 5.2-11.6 11.6 0 2.5.8 4.8 2.1 6.7-1.4 2-2.1 4.3-2.1 6.8 0 6.4 5.2 11.6 11.6 11.6 2.7 0 5.2-.9 7.2-2.5 2 1.6 4.6 2.5 7.3 2.5 6.4 0 11.6-5.2 11.6-11.6 0-2.5-.8-4.9-2.2-6.8 1.4-1.9 2.2-4.2 2.2-6.7 0-6.4-5.2-11.6-11.6-11.6-2.7 0-5.3 1-7.3 2.6-2-1.6-4.5-2.6-7.2-2.6Z"
          strokeWidth="3.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M32 16.6v31.3"
          strokeWidth="2.6"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M26.2 22.5c2.4.2 4.1 1.4 4.8 3.4.6 1.9-.2 4-2 5.2m-3.4 7.7c2.6.2 4.5 1.6 5.1 3.8.6 2.2-.5 4.4-2.7 5.4"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M37.8 22.5c-2.4.2-4.1 1.4-4.8 3.4-.6 1.9.2 4 2 5.2m3.4 7.7c-2.6.2-4.5 1.6-5.1 3.8-.6 2.2.5 4.4 2.7 5.4"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}

