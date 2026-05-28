"use client";

import {
  buildCanadaPath,
  buildHudsonBayPath,
  buildNewfoundlandPath,
  CONTEXT_CITIES,
  GREAT_LAKES,
  project,
  projectEllipse,
} from "../lib/geo";

const CANADA_PATH = buildCanadaPath();
const NEWFOUNDLAND_PATH = buildNewfoundlandPath();
const HUDSON_BAY_PATH = buildHudsonBayPath();

/**
 * Atlas-style Canada basemap, theme-aware via CSS custom properties.
 * Designed as a quiet backdrop — silhouette + Great Lakes + Hudson Bay,
 * with city dots for context. Plant / supplier / retailer nodes carry the
 * visual weight on top.
 */
export function CanadaMap() {
  return (
    <g aria-hidden>
      <defs>
        <linearGradient id="canadaLand" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--bp-map-land)" }} />
          <stop offset="100%" style={{ stopColor: "var(--bp-map-land-deep)" }} />
        </linearGradient>
      </defs>

      {/* Canada mainland */}
      <path
        d={CANADA_PATH}
        fill="url(#canadaLand)"
        style={{ stroke: "var(--bp-map-stroke)" }}
        strokeOpacity="0.45"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Newfoundland (separate island) */}
      <path
        d={NEWFOUNDLAND_PATH}
        fill="url(#canadaLand)"
        style={{ stroke: "var(--bp-map-stroke)" }}
        strokeOpacity="0.45"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Hudson Bay carve-out */}
      <path
        d={HUDSON_BAY_PATH}
        style={{ fill: "var(--bp-map-water)", stroke: "var(--bp-map-water-stroke)" }}
        strokeOpacity="0.5"
        strokeWidth="0.8"
      />

      {/* Great Lakes carve-outs */}
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
            strokeWidth="0.5"
          />
        );
      })}

      {/* Context cities — quiet dots with labels */}
      {CONTEXT_CITIES.map((c) => {
        const { x, y } = project(c.lng, c.lat);
        return (
          <g key={c.name} opacity="0.55">
            <circle cx={x} cy={y} r="1.5" style={{ fill: "var(--bp-map-city)" }} />
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

      {/* Country label — very faint, over the empty north */}
      <text
        x={project(-95, 58).x}
        y={project(-95, 58).y}
        textAnchor="middle"
        fontSize="22"
        fontWeight="500"
        style={{ fill: "var(--bp-map-label)" }}
        fontFamily="ui-monospace, monospace"
        letterSpacing="0.5em"
        opacity="0.4"
      >
        CANADA
      </text>
    </g>
  );
}
