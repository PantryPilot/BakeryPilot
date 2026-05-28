// Stylized geographic layer for FlowSight.
//
// Goal is *recognizable* Canada — not pixel-accurate. The outline uses ~25
// anchor points and a Catmull-Rom-style smoothing pass so the shape reads as
// a clean blob rather than a hand-traced zigzag.

export const CANVAS_W = 1280;
export const CANVAS_H = 720;

const LNG_MIN = -140;
const LNG_MAX = -52;
const LAT_MIN = 42;
const LAT_MAX = 62;

const X_PAD_LEFT = 40;
const X_PAD_RIGHT = 40;
const Y_PAD_TOP = 50;
const Y_PAD_BOTTOM = 110;

const PLOT_W = CANVAS_W - X_PAD_LEFT - X_PAD_RIGHT;
const PLOT_H = CANVAS_H - Y_PAD_TOP - Y_PAD_BOTTOM;

export interface Pt { x: number; y: number }
export interface LatLng { lat: number; lng: number }

export function project(lng: number, lat: number): Pt {
  const xRaw = (lng - LNG_MIN) / (LNG_MAX - LNG_MIN);
  const yRaw = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN);
  return {
    x: X_PAD_LEFT + xRaw * PLOT_W,
    y: Y_PAD_TOP + yRaw * PLOT_H,
  };
}

// ---------------------------------------------------------------------------
// Geographic anchors
// ---------------------------------------------------------------------------

export const PLANT_GEO: Record<string, LatLng & { city: string; province: string }> = {
  p1: { lat: 43.7642, lng: -79.5530, city: "Toronto", province: "ON" },
  p2: { lat: 43.5889, lng: -79.6446, city: "Mississauga", province: "ON" },
  p3: { lat: 43.2555, lng: -79.8733, city: "Hamilton", province: "ON" },
  p4: { lat: 45.5088, lng: -73.5541, city: "Montreal", province: "QC" },
};

export const SUPPLIER_GEO: Record<string, LatLng & { region: string }> = {
  "sup-coastalberry": { lat: 49.05, lng: -122.30, region: "BC" },
  "sup-northgrain":   { lat: 50.45, lng: -104.62, region: "SK" },
  "sup-prairiebulk":  { lat: 49.90, lng:  -97.14, region: "MB" },
  "sup-valleydairy":  { lat: 43.40, lng:  -80.40, region: "ON" },
  "sup-newleaf":      { lat: 45.34, lng:  -73.25, region: "QC" },
};

// Retailers spread to clearly distinct cities to avoid plant collisions.
export const RETAILER_GEO: Record<string, LatLng & { region: string }> = {
  costco:       { lat: 45.42, lng: -75.70, region: "ON" },   // Ottawa
  walmart:      { lat: 49.28, lng: -123.12, region: "BC" },  // Vancouver
  loblaws:      { lat: 44.65, lng: -63.58, region: "NS" },   // Halifax
  metro:        { lat: 46.81, lng: -71.21, region: "QC" },   // Quebec City
  sobeys:       { lat: 51.05, lng: -114.07, region: "AB" },  // Calgary
  "whole-foods": { lat: 47.56, lng: -52.71, region: "NL" },  // St. John's
};

export const FALLBACK_SUPPLIER_POS: LatLng[] = [
  { lat: 50.0, lng: -110.0 }, { lat: 51.0, lng: -100.0 },
  { lat: 47.5, lng:  -85.0 }, { lat: 46.0, lng:  -65.0 },
];

export const FALLBACK_RETAILER_POS: LatLng[] = [
  { lat: 45.42, lng: -75.70 }, { lat: 49.28, lng: -123.12 },
  { lat: 44.65, lng: -63.58 }, { lat: 46.81, lng:  -71.21 },
  { lat: 51.05, lng: -114.07 }, { lat: 47.56, lng:  -52.71 },
];

export const CONTEXT_CITIES: Array<LatLng & { name: string }> = [
  { name: "Vancouver",   lat: 49.28, lng: -123.12 },
  { name: "Calgary",     lat: 51.05, lng: -114.07 },
  { name: "Winnipeg",    lat: 49.90, lng:  -97.14 },
  { name: "Thunder Bay", lat: 48.38, lng:  -89.25 },
  { name: "Ottawa",      lat: 45.42, lng:  -75.70 },
  { name: "Quebec City", lat: 46.81, lng:  -71.21 },
  { name: "Halifax",     lat: 44.65, lng:  -63.58 },
  { name: "St. John's",  lat: 47.56, lng:  -52.71 },
];

// ---------------------------------------------------------------------------
// Canada outline — minimal anchor set, smoothed with Catmull-Rom → Bézier.
// ---------------------------------------------------------------------------

const CANADA_ANCHORS: Array<[number, number]> = [
  // Clockwise from NW Yukon
  [-140, 63],
  [-137, 60], [-132, 56], [-127, 52], [-124, 49.3], // BC coast
  [-115, 49], [-100, 49], [-90, 48.5],              // Prairies + Lake Superior
  [-84, 46.5], [-82, 42.5],                          // SW Ontario down to Lake Erie
  [-79, 43.3], [-76, 44.2],                          // Lake Ontario / SLR
  [-72, 45.2], [-67, 45.4],                          // Quebec south / Maine
  [-65, 44.0], [-60, 45.5],                          // Bay of Fundy / Nova Scotia
  [-58, 48.5], [-55, 51.5],                          // Cabot Strait / Newfoundland approximation
  [-58, 56.5], [-62, 60],                            // Labrador
  [-72, 62], [-90, 62], [-110, 62], [-130, 62],      // Arctic edge (cropped)
  [-140, 63],                                        // back to start
];

// Convert anchor polygon → smooth closed path using midpoint-Q-Bezier.
// (Catmull-Rom style: each segment passes through midpoints with anchors as
// control points. Yields organic curves with low point count.)
function buildSmoothClosedPath(anchorsLL: Array<[number, number]>): string {
  const pts = anchorsLL.map(([lng, lat]) => project(lng, lat));
  const n = pts.length;
  if (n < 3) return "";

  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const start = mid(pts[n - 1], pts[0]);
  const parts: string[] = [`M${start.x.toFixed(1)},${start.y.toFixed(1)}`];

  for (let i = 0; i < n; i++) {
    const next = mid(pts[i], pts[(i + 1) % n]);
    parts.push(`Q${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`);
  }

  parts.push("Z");
  return parts.join(" ");
}

export function buildCanadaPath(): string {
  return buildSmoothClosedPath(CANADA_ANCHORS);
}

// Great Lakes — keep these because they're a recognizable visual landmark.
export const GREAT_LAKES: Array<{ name: string; lat: number; lng: number; rxDeg: number; ryDeg: number }> = [
  { name: "Superior", lat: 47.7, lng: -87.5, rxDeg: 4.0, ryDeg: 1.0 },
  { name: "Michigan", lat: 44.0, lng: -86.8, rxDeg: 0.9, ryDeg: 2.2 },
  { name: "Huron",    lat: 44.7, lng: -82.6, rxDeg: 1.6, ryDeg: 1.5 },
  { name: "Erie",     lat: 42.2, lng: -81.5, rxDeg: 2.2, ryDeg: 0.6 },
  { name: "Ontario",  lat: 43.6, lng: -77.8, rxDeg: 1.4, ryDeg: 0.5 },
];

export function projectEllipse(lng: number, lat: number, rxDeg: number, ryDeg: number) {
  const c = project(lng, lat);
  const e = project(lng + rxDeg, lat - ryDeg);
  return {
    cx: c.x,
    cy: c.y,
    rx: Math.abs(e.x - c.x),
    ry: Math.abs(e.y - c.y),
  };
}
