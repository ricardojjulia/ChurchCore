"use client";

import { useState, useEffect } from "react";

export function ChurchForgeHeroIcon() {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => (prev + 1) % 360);
    }, 30);

    return () => clearInterval(interval);
  }, []);

  return (
    <svg
      width={180}
      height={180}
      viewBox="0 0 180 180"
      className="mx-auto"
      style={{ filter: "drop-shadow(0 4px 12px rgba(37, 99, 235, 0.15))" }}
    >
      {/* Background circle */}
      <circle cx="90" cy="90" r="88" fill="none" stroke="rgba(37, 99, 235, 0.1)" strokeWidth="2" />

      {/* Pulsing rings */}
      <g opacity={Math.max(0.1, Math.cos((rotation * Math.PI) / 180) * 0.3 + 0.3)}>
        <circle cx="90" cy="90" r="75" fill="none" stroke="rgba(37, 99, 235, 0.3)" strokeWidth="2" />
      </g>
      <g opacity={Math.max(0.1, Math.sin((rotation * Math.PI) / 180) * 0.3 + 0.3)}>
        <circle cx="90" cy="90" r="60" fill="none" stroke="rgba(37, 99, 235, 0.25)" strokeWidth="2" />
      </g>

      {/* Rotating orbiting dots */}
      <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "90px 90px", transition: "none" }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const angle = (i * 360) / 5;
          const x = 90 + Math.cos((angle * Math.PI) / 180) * 50;
          const y = 90 + Math.sin((angle * Math.PI) / 180) * 50;
          return (
            <g key={i}>
              {/* Connection line */}
              <line
                x1="90"
                y1="90"
                x2={x}
                y2={y}
                stroke="rgba(37, 99, 235, 0.2)"
                strokeWidth="1.5"
                opacity={0.6}
              />
              {/* Orbiting dot */}
              <circle
                cx={x}
                cy={y}
                r="6"
                fill="rgba(37, 99, 235, 0.8)"
                opacity={0.7 + Math.sin((rotation + i * 72) * (Math.PI / 180)) * 0.2}
              />
            </g>
          );
        })}
      </g>

      {/* Central circle */}
      <circle
        cx="90"
        cy="90"
        r="38"
        fill="url(#centerGradient)"
        opacity="0.95"
      />

      {/* Center icon */}
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

      {/* Gradient definitions */}
      <defs>
        <radialGradient id="centerGradient" cx="35%" cy="35%">
          <stop offset="0%" stopColor="rgba(37, 99, 235, 1)" />
          <stop offset="100%" stopColor="rgba(29, 78, 216, 0.9)" />
        </radialGradient>
      </defs>
    </svg>
  );
}
