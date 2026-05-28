"use client";

import {
  buildCanadaPath,
  buildHudsonBayPath,
  buildNewfoundlandPath,
  buildProvinceDividerPaths,
  buildUSBorderPath,
  CANVAS_H,
  CANVAS_W,
  CONTEXT_CITIES,
  GREAT_LAKES,
  project,
  projectEllipse,
} from "../lib/geo";

const CANADA_PATH = buildCanadaPath();
const NEWFOUNDLAND_PATH = buildNewfoundlandPath();
const HUDSON_BAY_PATH = buildHudsonBayPath();
const US_BORDER_PATH = buildUSBorderPath();
const PROVINCE_DIVIDER_PATHS = buildProvinceDividerPaths();

/**
 * Geographic basemap for FlowSight.
 *
 * Order matters: ocean rect first, then Canada land, then water carve-outs
 * (Hudson Bay, Great Lakes), then borders, then labels.
 */
export function CanadaMap() {
  return (
    <g aria-hidden>
      <defs>
        <linearGradient id="oceanGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#050811" />
          <stop offset="100%" stopColor="#070d1c" />
        </linearGradient>
        <linearGradient id="landGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1a2538" />
          <stop offset="100%" stopColor="#141c2c" />
        </linearGradient>
      </defs>

      {/* Ocean background */}
      <rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="url(#oceanGradient)" />

      {/* Canada landmass */}
      <path
        d={CANADA_PATH}
        fill="url(#landGradient)"
        stroke="#3a4a66"
        strokeOpacity="0.65"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Newfoundland (separate island) */}
      <path
        d={NEWFOUNDLAND_PATH}
        fill="url(#landGradient)"
        stroke="#3a4a66"
        strokeOpacity="0.65"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Province dividers — very subtle */}
      {PROVINCE_DIVIDER_PATHS.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="#2a3650"
          strokeOpacity="0.55"
          strokeWidth="0.6"
          strokeDasharray="3 3"
        />
      ))}

      {/* Hudson Bay carved out of the land */}
      <path
        d={HUDSON_BAY_PATH}
        fill="#070d1c"
        stroke="#3a4a66"
        strokeOpacity="0.55"
        strokeWidth="0.8"
      />

      {/* Great Lakes carved out */}
      {GREAT_LAKES.map((lake) => {
        const e = projectEllipse(lake.lng, lake.lat, lake.rxDeg, lake.ryDeg);
        return (
          <ellipse
            key={lake.name}
            cx={e.cx}
            cy={e.cy}
            rx={e.rx}
            ry={e.ry}
            fill="#070d1c"
            stroke="#3a4a66"
            strokeOpacity="0.55"
            strokeWidth="0.6"
          />
        );
      })}

      {/* US border — faint dashed (only on the parts that aren't the lake shorelines) */}
      <path
        d={US_BORDER_PATH}
        fill="none"
        stroke="#475569"
        strokeOpacity="0.35"
        strokeDasharray="4 4"
        strokeWidth="0.7"
      />

      {/* Context city dots + labels */}
      {CONTEXT_CITIES.map((c) => {
        const { x, y } = project(c.lng, c.lat);
        return (
          <g key={c.name}>
            <circle cx={x} cy={y} r="2" fill="#64748b" opacity="0.9" />
            <text
              x={x + 5}
              y={y + 3}
              fontSize="9"
              fill="#94a3b8"
              fontFamily="ui-monospace, monospace"
              letterSpacing="0.04em"
              opacity="0.7"
            >
              {c.name}
            </text>
          </g>
        );
      })}

      {/* Country label — placed over the empty north */}
      <text
        x={project(-95, 60).x}
        y={project(-95, 60).y}
        textAnchor="middle"
        fontSize="16"
        fontWeight="600"
        fill="#334155"
        fontFamily="ui-monospace, monospace"
        letterSpacing="0.35em"
        opacity="0.5"
      >
        CANADA
      </text>
    </g>
  );
}
