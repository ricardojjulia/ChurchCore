const ORBIT_POINTS = [
  { x: "140.00", y: "90.00", begin: "0s" },
  { x: "105.45", y: "137.55", begin: "0.4s" },
  { x: "49.55", y: "119.39", begin: "0.8s" },
  { x: "49.55", y: "60.61", begin: "1.2s" },
  { x: "105.45", y: "42.45", begin: "1.6s" },
] as const;

export function ChurchCoreOpsHeroIcon() {
  return (
    <svg
      width={180}
      height={180}
      viewBox="0 0 180 180"
      className="mx-auto"
      style={{ filter: "drop-shadow(0 4px 12px rgba(37, 99, 235, 0.15))" }}
      aria-hidden="true"
    >
      <circle
        cx="90"
        cy="90"
        r="88"
        fill="none"
        stroke="rgba(37, 99, 235, 0.1)"
        strokeWidth="2"
      />

      <g>
        <circle
          cx="90"
          cy="90"
          r="75"
          fill="none"
          stroke="rgba(37, 99, 235, 0.3)"
          strokeWidth="2"
        >
          <animate
            attributeName="opacity"
            values="0.2;0.55;0.2"
            dur="3.2s"
            repeatCount="indefinite"
          />
        </circle>
      </g>

      <g>
        <circle
          cx="90"
          cy="90"
          r="60"
          fill="none"
          stroke="rgba(37, 99, 235, 0.25)"
          strokeWidth="2"
        >
          <animate
            attributeName="opacity"
            values="0.5;0.15;0.5"
            dur="2.8s"
            repeatCount="indefinite"
          />
        </circle>
      </g>

      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 90 90"
          to="360 90 90"
          dur="18s"
          repeatCount="indefinite"
        />

        {ORBIT_POINTS.map((point) => (
          <g key={`${point.x}-${point.y}`}>
            <line
              x1="90"
              y1="90"
              x2={point.x}
              y2={point.y}
              stroke="rgba(37, 99, 235, 0.2)"
              strokeWidth="1.5"
              opacity="0.6"
            />
            <circle
              cx={point.x}
              cy={point.y}
              r="6"
              fill="rgba(37, 99, 235, 0.82)"
            >
              <animate
                attributeName="opacity"
                values="0.55;0.95;0.55"
                dur="2.4s"
                begin={point.begin}
                repeatCount="indefinite"
              />
            </circle>
          </g>
        ))}
      </g>

      <circle cx="90" cy="90" r="38" fill="url(#centerGradient)" opacity="0.95" />

      <text
        x="90"
        y="95"
        fontSize="32"
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
      >
        ⛪
      </text>

      <defs>
        <radialGradient id="centerGradient" cx="35%" cy="35%">
          <stop offset="0%" stopColor="rgba(37, 99, 235, 1)" />
          <stop offset="100%" stopColor="rgba(29, 78, 216, 0.9)" />
        </radialGradient>
      </defs>
    </svg>
  );
}
