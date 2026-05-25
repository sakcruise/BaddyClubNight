interface Props {
  className?: string;
  size?: number;
}

export default function ShuttlecockIcon({ className = "", size = 32 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <radialGradient id="corkGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f97316" />
        </radialGradient>
        <linearGradient id="featherGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff7ed" />
          <stop offset="100%" stopColor="#fed7aa" />
        </linearGradient>
      </defs>

      {/* Feather shafts */}
      {[
        [40, 62, 14, 10],
        [40, 62, 22, 6],
        [40, 62, 31, 4],
        [40, 62, 40, 4],
        [40, 62, 49, 4],
        [40, 62, 58, 6],
        [40, 62, 66, 10],
      ].map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="url(#featherGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ))}

      {/* Feather rim arc */}
      <path
        d="M14 10 Q40 -4 66 10"
        stroke="#fb923c"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M14 10 Q40 -4 66 10"
        stroke="white"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="4 6"
        opacity="0.6"
      />

      {/* Cork body */}
      <ellipse cx="40" cy="66" rx="11" ry="8" fill="url(#corkGrad)" />
      <ellipse cx="40" cy="64" rx="8" ry="5" fill="#fde68a" opacity="0.6" />

      {/* Highlight */}
      <ellipse cx="36" cy="63" rx="3" ry="2" fill="white" opacity="0.5" />
    </svg>
  );
}
