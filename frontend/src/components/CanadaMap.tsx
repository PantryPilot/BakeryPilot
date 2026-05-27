"use client";

import {
  buildCanadaPath,
  buildNewfoundlandPath,
  CONTEXT_CITIES,
  GREAT_LAKES,
  HUDSON_BAY,
  project,
  projectEllipse,
} from "../lib/geo";

const CANADA_PATH = buildCanadaPath();
const NEWFOUNDLAND_PATH = buildNewfoundlandPath();

/**
 * Geographic basemap for FlowSight.
 *
 * Renders Canada's outline, the Great Lakes, Hudson Bay, the US border, and a
 * graticule with major city dots — all in SVG so it scales with the parent
 * <svg viewBox>. Place this as the first child of the FlowSight <svg>.
 */
export function CanadaMap() {
  // Latitude graticule at 50°N and 60°N — visual reference for the operator.
  const grat50Left = project(-141, 50);
  const grat50Right = project(-52, 50);
  const grat60Left = project(-141, 60);
  const grat60Right = project(-52, 60);

  // US border — runs along the 49th parallel from BC to Manitoba, then drops
  // along the Great Lakes shoreline. Drawn as a faint dashed line.
  const borderPts: Array<[number, number]> = [
    [-123, 49], [-117, 49], [-110, 49], [-100, 49], [-95, 49],
    [-90, 48], [-87, 46], [-84, 46], [-83, 42], [-82, 42],
    [-79, 43], [-77, 43.5], [-75, 45], [-71, 45], [-67, 45.2],
  ];
  const borderPath = borderPts
    .map(([lng, lat], i) => {
      const { x, y } = project(lng, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const hudson = projectEllipse(HUDSON_BAY.lng, HUDSON_BAY.lat, HUDSON_BAY.rxDeg, HUDSON_BAY.ryDeg);

  return (
    <g aria-hidden>
      <defs>
        <linearGradient id="landGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#13192a" />
          <stop offset="100%" stopColor="#0f1422" />
        </linearGradient>
        <radialGradient id="waterGradient" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#091321" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#070a11" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Latitude graticule */}
      <line
        x1={grat50Left.x}
        y1={grat50Left.y}
        x2={grat50Right.x}
        y2={grat50Right.y}
        stroke="#1e293b"
        strokeOpacity="0.35"
        strokeDasharray="2 4"
        strokeWidth="0.6"
      />
      <line
        x1={grat60Left.x}
        y1={grat60Left.y}
        x2={grat60Right.x}
        y2={grat60Right.y}
        stroke="#1e293b"
        strokeOpacity="0.35"
        strokeDasharray="2 4"
        strokeWidth="0.6"
      />

      {/* Canada landmass */}
      <path
        d={CANADA_PATH}
        fill="url(#landGradient)"
        stroke="#334155"
        strokeOpacity="0.7"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Newfoundland */}
      <path
        d={NEWFOUNDLAND_PATH}
        fill="url(#landGradient)"
        stroke="#334155"
        strokeOpacity="0.7"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Hudson Bay — drawn over the land path to "carve out" water */}
      <ellipse
        cx={hudson.cx}
        cy={hudson.cy}
        rx={hudson.rx}
        ry={hudson.ry}
        fill="#070a11"
        stroke="#1e293b"
        strokeOpacity="0.5"
        strokeWidth="0.5"
      />

      {/* Great Lakes */}
      {GREAT_LAKES.map((lake) => {
        const e = projectEllipse(lake.lng, lake.lat, lake.rxDeg, lake.ryDeg);
        return (
          <ellipse
            key={lake.name}
            cx={e.cx}
            cy={e.cy}
            rx={e.rx}
            ry={e.ry}
            fill="#070a11"
            stroke="#1e293b"
            strokeOpacity="0.6"
            strokeWidth="0.5"
          />
        );
      })}

      {/* US border — faint dashed line */}
      <path
        d={borderPath}
        fill="none"
        stroke="#475569"
        strokeOpacity="0.45"
        strokeDasharray="3 4"
        strokeWidth="0.6"
      />

      {/* Context city dots + labels (Vancouver, Calgary, Winnipeg, Halifax, etc.) */}
      {CONTEXT_CITIES.map((c) => {
        const { x, y } = project(c.lng, c.lat);
        return (
          <g key={c.name}>
            <circle cx={x} cy={y} r="1.8" fill="#475569" />
            <text
              x={x + 5}
              y={y + 3}
              fontSize="9"
              fill="#64748b"
              fontFamily="ui-monospace, monospace"
              letterSpacing="0.04em"
            >
              {c.name}
            </text>
          </g>
        );
      })}

      {/* Country label — placed over the northern interior so it doesn't fight with nodes */}
      <text
        x={project(-100, 65).x}
        y={project(-100, 65).y}
        textAnchor="middle"
        fontSize="14"
        fill="#334155"
        fontFamily="ui-monospace, monospace"
        letterSpacing="0.3em"
      >
        CANADA
      </text>
    </g>
  );
}
