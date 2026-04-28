type Props = { size?: number };

export function MobiusMark({ size = 32 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" aria-label="Møbius">
      <ellipse
        cx={21}
        cy={21}
        rx={16}
        ry={7}
        fill="none"
        stroke="#e8e9f3"
        strokeWidth={1.2}
        transform="rotate(30 21 21)"
      />
      <ellipse
        cx={21}
        cy={21}
        rx={16}
        ry={7}
        fill="none"
        stroke="#c9a96a"
        strokeWidth={1}
        opacity={0.85}
        transform="rotate(-30 21 21)"
      />
    </svg>
  );
}
