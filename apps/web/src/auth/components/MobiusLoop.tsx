type Props = { size?: number };

export function MobiusLoop({ size = 72 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 84 84"
      aria-label="Møbius"
    >
      <defs>
        <linearGradient id="mobius-loop-grad" x1={0} y1={0} x2={1} y2={1}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
          <stop offset="50%" stopColor="#e8d4a8" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#c9a96a" stopOpacity={0.7} />
        </linearGradient>
      </defs>
      <g className="loopSpin">
        <ellipse
          cx={42}
          cy={42}
          rx={30}
          ry={13}
          fill="none"
          stroke="url(#mobius-loop-grad)"
          strokeWidth={1.4}
          transform="rotate(30 42 42)"
        />
        <ellipse
          cx={42}
          cy={42}
          rx={30}
          ry={13}
          fill="none"
          stroke="#c9a96a"
          strokeWidth={1}
          opacity={0.7}
          transform="rotate(-30 42 42)"
        />
        <ellipse
          cx={42}
          cy={42}
          rx={30}
          ry={13}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={0.6}
          transform="rotate(90 42 42)"
        />
      </g>
    </svg>
  );
}
