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
 * Stylized Canada basemap, theme-aware via CSS custom properties.
 *
 * Colours come from --bp-map-* variables defined in globals.css, so the same
 * SVG works in both light and dark themes without any JS conditional.
 */
export function CanadaMap() {
  return (
    <g aria-hidden>
      <defs>
        <linearGradient id="canadaLand" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--bp-map-land)" }} />
          <stop offset="100%" style={{ stopColor: "var(--bp-map-land-deep)" }} />
        </linearGradient>
        <filter id="landShadow" x="-2%" y="-2%" width="104%" height="104%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Soft shadow behind the land for subtle depth */}
      <path
        d={CANADA_PATH}
        style={{ fill: "var(--bp-map-shadow)" }}
        filter="url(#landShadow)"
        opacity="0.6"
      />

      {/* Main land shape */}
      <path
        d={CANADA_PATH}
        fill="url(#canadaLand)"
        style={{ stroke: "var(--bp-map-stroke)" }}
        strokeOpacity="0.55"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Great Lakes — the most recognizable landmark on the map */}
      {GREAT_LAKES.map((lake) => {
        const e = projectEllipse(lake.lng, lake.lat, lake.rxDeg, lake.ryDeg);
        return (
          <ellipse
            key={lake.name}
            cx={e.cx}
            cy={e.cy}
            rx={e.rx}
            ry={e.ry}
            style={{ fill: "var(--bp-map-water)", stroke: "var(--bp-map-water-stroke)" }}
            strokeOpacity="0.55"
            strokeWidth="0.6"
          />
        );
      })}

      {/* Context cities — quiet dots with labels */}
      {CONTEXT_CITIES.map((c) => {
        const { x, y } = project(c.lng, c.lat);
        return (
          <g key={c.name} opacity="0.7">
            <circle cx={x} cy={y} r="1.6" style={{ fill: "var(--bp-map-city)" }} />
            <text
              x={x + 5}
              y={y + 3}
              fontSize="9"
              style={{ fill: "var(--bp-map-city)" }}
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
        style={{ fill: "var(--bp-map-label)" }}
        fontFamily="ui-monospace, monospace"
        letterSpacing="0.5em"
        opacity="0.35"
      >
        CANADA
      </text>
    </g>
  );
}
