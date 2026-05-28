"use client";

import {
  buildCanadaPath,
  CONTEXT_CITIES,
  GREAT_LAKES,
  project,
  projectEllipse,
} from "../lib/geo";

const CANADA_PATH = buildCanadaPath();

/**
 * Stylized Canada basemap.
 *
 * Designed as a backdrop, not a focal element: the country reads as a soft
 * silhouette, with city labels as quiet context. Plant / supplier / retailer
 * nodes carry the visual weight on top.
 */
export function CanadaMap() {
  return (
    <g aria-hidden>
      <defs>
        <linearGradient id="canadaLand" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1c2540" />
          <stop offset="55%" stopColor="#1a2238" />
          <stop offset="100%" stopColor="#161d2e" />
        </linearGradient>
        <linearGradient id="canadaGlow" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
          <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
        <filter id="landShadow" x="-2%" y="-2%" width="104%" height="104%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Soft shadow behind the land for subtle depth */}
      <path d={CANADA_PATH} fill="#0e1422" filter="url(#landShadow)" opacity="0.9" />

      {/* Main land shape */}
      <path
        d={CANADA_PATH}
        fill="url(#canadaLand)"
        stroke="#3a4868"
        strokeOpacity="0.55"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Faint horizontal glow band across the populated south — gives the
          map a focal area without committing to specific borders */}
      <rect
        x="0"
        y={project(-95, 47).y - 60}
        width="1280"
        height="120"
        fill="url(#canadaGlow)"
        pointerEvents="none"
      />

      {/* Great Lakes — kept because they're the most recognizable landmark */}
      {GREAT_LAKES.map((lake) => {
        const e = projectEllipse(lake.lng, lake.lat, lake.rxDeg, lake.ryDeg);
        return (
          <ellipse
            key={lake.name}
            cx={e.cx}
            cy={e.cy}
            rx={e.rx}
            ry={e.ry}
            fill="#0c121f"
            stroke="#3a4868"
            strokeOpacity="0.5"
            strokeWidth="0.6"
          />
        );
      })}

      {/* Context cities — quiet dots with labels */}
      {CONTEXT_CITIES.map((c) => {
        const { x, y } = project(c.lng, c.lat);
        return (
          <g key={c.name} opacity="0.55">
            <circle cx={x} cy={y} r="1.6" fill="#94a3b8" />
            <text
              x={x + 5}
              y={y + 3}
              fontSize="9"
              fill="#94a3b8"
              fontFamily="ui-monospace, monospace"
              letterSpacing="0.04em"
            >
              {c.name}
            </text>
          </g>
        );
      })}

      {/* Country label — placed over the empty interior north */}
      <text
        x={project(-95, 58).x}
        y={project(-95, 58).y}
        textAnchor="middle"
        fontSize="22"
        fontWeight="500"
        fill="#475569"
        fontFamily="ui-monospace, monospace"
        letterSpacing="0.5em"
        opacity="0.35"
      >
        CANADA
      </text>
    </g>
  );
}
