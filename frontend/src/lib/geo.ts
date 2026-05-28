// Geographic projection + reference data for the FlowSight Canada map.
//
// The canvas focuses on the populated southern strip (lat 41° to 63°N) so
// plants, suppliers and retailers fill the frame instead of getting crushed
// into one corner. Equirectangular projection is precise enough at this scale.

export const CANVAS_W = 1280;
export const CANVAS_H = 720;

const LNG_MIN = -141;
const LNG_MAX = -52;
const LAT_MIN = 41;
const LAT_MAX = 63;

const X_PAD_LEFT = 40;
const X_PAD_RIGHT = 40;
const Y_PAD_TOP = 40;
const Y_PAD_BOTTOM = 110; // leaves room for scrubber + ticker

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
// Real-world coordinates
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
  "sup-valleydairy":  { lat: 43.40, lng:  -80.40, region: "ON" }, // Cambridge/Kitchener
  "sup-newleaf":      { lat: 45.34, lng:  -73.25, region: "QC" },
};

// Retailers placed at distinct distribution-hub cities (not their HQs) so they
// don't visually collide with the GTA / Montreal plant cluster.
export const RETAILER_GEO: Record<string, LatLng & { region: string }> = {
  costco:  { lat: 45.42, lng: -75.70, region: "ON" }, // Ottawa
  walmart: { lat: 42.98, lng: -81.25, region: "ON" }, // London, ON
  loblaws: { lat: 44.23, lng: -76.48, region: "ON" }, // Kingston, ON
  metro:   { lat: 46.81, lng: -71.21, region: "QC" }, // Quebec City
};

export const FALLBACK_SUPPLIER_POS: LatLng[] = [
  { lat: 50.0, lng: -110.0 },
  { lat: 51.0, lng: -100.0 },
  { lat: 47.5, lng: -85.0 },
  { lat: 46.0, lng: -65.0 },
];

export const FALLBACK_RETAILER_POS: LatLng[] = [
  { lat: 45.42, lng: -75.70 },
  { lat: 42.98, lng: -81.25 },
  { lat: 44.23, lng: -76.48 },
  { lat: 46.81, lng: -71.21 },
];

export const CONTEXT_CITIES: Array<LatLng & { name: string }> = [
  { name: "Vancouver",   lat: 49.28, lng: -123.12 },
  { name: "Calgary",     lat: 51.05, lng: -114.07 },
  { name: "Edmonton",    lat: 53.55, lng: -113.49 },
  { name: "Saskatoon",   lat: 52.13, lng: -106.67 },
  { name: "Winnipeg",    lat: 49.90, lng:  -97.14 },
  { name: "Thunder Bay", lat: 48.38, lng:  -89.25 },
  { name: "Ottawa",      lat: 45.42, lng:  -75.70 },
  { name: "Quebec City", lat: 46.81, lng:  -71.21 },
  { name: "Halifax",     lat: 44.65, lng:  -63.58 },
  { name: "St. John's",  lat: 47.56, lng:  -52.71 },
];

// ---------------------------------------------------------------------------
// Canada outline — denser tracing than before. Clockwise from Yukon NW.
// Coastline points are roughly 1° spaced; interior US-border points are wider.
// ---------------------------------------------------------------------------

const CANADA_OUTLINE: Array<[number, number]> = [
  // Yukon-Alaska border (running north to Beaufort coast)
  [-141.0, 63.0], [-141.0, 61.5], [-141.0, 60.0],
  // Alaska Panhandle — the BC/Alaska boundary creates a deep indent
  [-140.0, 60.0], [-138.5, 59.5], [-137.0, 59.0], [-135.5, 58.5],
  [-134.0, 57.5], [-132.5, 56.5], [-131.0, 55.5],
  // BC coast — Prince Rupert → Vancouver Island → Vancouver
  [-130.5, 54.5], [-129.5, 53.5], [-128.5, 52.5], [-127.5, 51.5],
  [-126.5, 50.7], [-125.5, 50.0], [-124.5, 49.4], [-123.5, 49.1], [-123.0, 49.0],
  // 49th parallel — BC/AB/SK/MB through to Lake of the Woods
  [-120.0, 49.0], [-115.0, 49.0], [-110.0, 49.0], [-105.0, 49.0],
  [-100.0, 49.0], [-97.0, 49.0], [-95.0, 49.0],
  // Lake of the Woods kink
  [-94.5, 48.7], [-92.5, 48.5], [-90.5, 48.0], [-89.5, 48.0],
  // North shore of Lake Superior
  [-88.0, 48.3], [-86.5, 48.0], [-85.0, 47.0], [-84.5, 46.5],
  // Sault Ste Marie / north of Lake Huron / North Channel
  [-84.0, 46.0], [-83.0, 45.7], [-82.3, 45.5], [-81.8, 45.0],
  // Bruce Peninsula / east shore of Lake Huron
  [-81.7, 44.5], [-82.0, 43.7], [-82.4, 43.0], [-82.5, 42.7],
  // Sarnia → Lake Erie north shore (Windsor is southernmost Canadian point)
  [-82.6, 42.4], [-83.0, 42.1], [-83.1, 41.9], [-82.5, 41.7], [-81.9, 41.9],
  [-81.0, 42.1], [-79.8, 42.4], [-78.9, 42.85],
  // Niagara → north shore of Lake Ontario → eastern lake outlet
  [-78.7, 43.1], [-77.9, 43.6], [-77.2, 43.9], [-76.4, 44.2],
  // St. Lawrence River — Ontario/Quebec/NY border
  [-75.7, 44.7], [-74.7, 45.0],
  // Quebec / NY / VT / NH / Maine border
  [-73.3, 45.0], [-72.0, 45.0], [-71.0, 45.3], [-70.3, 45.7],
  [-70.3, 46.4], [-69.3, 47.0], [-68.5, 47.4], [-67.8, 47.1],
  // Down into NB / Maine border to Bay of Fundy
  [-67.4, 45.7], [-67.5, 45.3], [-67.0, 45.1], [-66.5, 45.0],
  [-66.0, 45.2], [-65.5, 45.3], [-65.0, 45.3],
  // Nova Scotia (treated as connected via Chignecto isthmus)
  [-64.7, 45.0], [-64.5, 44.5], [-65.0, 43.7], [-66.0, 43.6],
  [-66.2, 43.9], [-65.7, 44.4], [-64.5, 44.5], [-63.5, 44.6],
  [-62.5, 44.9], [-61.5, 45.3], [-60.3, 45.8], [-59.8, 46.2],
  [-60.0, 46.6], [-60.8, 46.7], [-61.5, 46.5], [-62.7, 46.0], [-63.7, 45.7],
  [-64.5, 45.7], [-64.5, 46.0],
  // Back up east side of NB to Acadian peninsula
  [-64.5, 46.5], [-64.7, 47.0], [-64.8, 47.5], [-64.7, 47.9],
  // Bay of Chaleur (NB north / Gaspé south)
  [-65.5, 48.0], [-66.5, 48.1], [-66.0, 48.4],
  // Gaspé peninsula tip
  [-65.5, 48.7], [-64.5, 49.0], [-64.2, 49.2], [-64.8, 49.4],
  // Côte-Nord — north shore of the Gulf of St. Lawrence going east
  [-66.0, 49.6], [-67.5, 49.7], [-69.0, 49.5], [-70.0, 48.9],
  [-69.5, 48.4], [-68.5, 48.7], [-67.5, 49.3], [-66.5, 50.0],
  [-65.0, 50.1], [-63.0, 50.2], [-61.0, 50.3], [-59.5, 50.5],
  [-58.5, 51.0],
  // Strait of Belle Isle (between Labrador and Newfoundland)
  [-57.5, 51.4], [-56.8, 51.8],
  // Labrador coast going north
  [-56.3, 52.5], [-55.7, 53.5], [-55.5, 54.5], [-56.0, 55.5],
  [-57.2, 56.5], [-58.5, 57.5], [-60.0, 58.5], [-62.0, 59.3],
  [-63.5, 60.0], [-64.5, 60.4], [-65.5, 60.7],
  // Ungava Bay — large bay carved into northern Quebec
  [-65.5, 60.4], [-66.8, 59.5], [-68.5, 58.6], [-69.8, 58.4],
  [-70.5, 58.8], [-70.0, 60.0], [-69.5, 60.7], [-69.0, 61.5],
  [-69.5, 62.0],
  // Hudson Strait south shore (across northern Quebec)
  [-71.0, 62.5], [-73.0, 62.6], [-75.0, 62.7], [-77.0, 62.5],
  [-78.0, 62.3],
  // Top edge of crop — straight horizontal across the Arctic at 63°N
  [-82.0, 63.0], [-90.0, 63.0], [-100.0, 63.0], [-110.0, 63.0],
  [-120.0, 63.0], [-130.0, 63.0], [-141.0, 63.0],
];

export function buildCanadaPath(): string {
  return CANADA_OUTLINE
    .map(([lng, lat], i) => {
      const { x, y } = project(lng, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
}

// Newfoundland (separate landmass — drawn over the Atlantic)
const NEWFOUNDLAND_OUTLINE: Array<[number, number]> = [
  [-59.4, 47.7], [-58.5, 47.9], [-57.0, 48.6], [-55.8, 49.4],
  [-55.0, 49.7], [-53.6, 49.5], [-52.7, 48.5], [-52.8, 47.5],
  [-53.8, 46.7], [-55.0, 46.7], [-56.0, 47.0], [-57.5, 47.3],
  [-58.7, 47.5], [-59.4, 47.7],
];

export function buildNewfoundlandPath(): string {
  return NEWFOUNDLAND_OUTLINE
    .map(([lng, lat], i) => {
      const { x, y } = project(lng, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
}

// Hudson Bay + James Bay as a single composite water path
// (drawn over the land to "carve out" water).
const HUDSON_BAY_OUTLINE: Array<[number, number]> = [
  // Start NW of Hudson Bay
  [-94.0, 60.5], [-92.0, 61.5], [-89.0, 61.5], [-86.0, 60.5],
  [-83.0, 60.0], [-80.0, 59.0],
  // East coast going south
  [-78.5, 58.0], [-78.0, 56.0], [-78.5, 54.0], [-79.0, 53.0],
  [-79.5, 52.0],
  // James Bay east side
  [-80.0, 51.5], [-80.5, 51.0], [-81.0, 51.0],
  // James Bay south tip
  [-81.5, 51.2], [-82.0, 51.5],
  // James Bay west side
  [-82.5, 52.0], [-82.0, 53.0], [-83.5, 54.0],
  // West coast of Hudson Bay going north
  [-86.0, 55.5], [-89.0, 56.5], [-92.0, 58.0], [-94.0, 60.0], [-94.0, 60.5],
];

export function buildHudsonBayPath(): string {
  return HUDSON_BAY_OUTLINE
    .map(([lng, lat], i) => {
      const { x, y } = project(lng, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
}

// Great Lakes — simplified ellipses (renders cleaner than polygons at this scale).
export const GREAT_LAKES: Array<{ name: string; lat: number; lng: number; rxDeg: number; ryDeg: number }> = [
  { name: "Superior", lat: 47.7, lng: -87.5, rxDeg: 4.2, ryDeg: 1.1 },
  { name: "Michigan", lat: 44.0, lng: -86.8, rxDeg: 0.9, ryDeg: 2.4 },
  { name: "Huron",    lat: 44.7, lng: -82.5, rxDeg: 1.8, ryDeg: 1.6 },
  { name: "Erie",     lat: 42.2, lng: -81.5, rxDeg: 2.3, ryDeg: 0.7 },
  { name: "Ontario",  lat: 43.6, lng: -77.8, rxDeg: 1.5, ryDeg: 0.55 },
];

export function projectEllipse(
  lng: number,
  lat: number,
  rxDeg: number,
  ryDeg: number,
): { cx: number; cy: number; rx: number; ry: number } {
  const c = project(lng, lat);
  const e = project(lng + rxDeg, lat - ryDeg);
  return {
    cx: c.x,
    cy: c.y,
    rx: Math.abs(e.x - c.x),
    ry: Math.abs(e.y - c.y),
  };
}

// US border line — the part that's NOT already on the land outline.
// (The 49th parallel is part of the outline; this is for the Great Lakes section
// where the Canadian outline traces lake shores and we need a separate US line.)
export const US_BORDER_LINE: Array<[number, number]> = [
  [-95.0, 49.0], [-94.5, 48.7], [-92.0, 48.0], [-89.5, 47.5],
  [-87.0, 45.5], [-84.5, 41.7], [-82.5, 41.7], [-82.5, 42.3],
  [-83.0, 42.3], [-79.5, 42.5], [-79.0, 43.3], [-77.0, 43.3],
  [-75.0, 44.5], [-71.0, 45.0], [-67.8, 45.7],
];

export function buildUSBorderPath(): string {
  return US_BORDER_LINE
    .map(([lng, lat], i) => {
      const { x, y } = project(lng, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// Province division reference lines (subtle visual context).
// Each entry is a polyline of (lng, lat) following an approximate inter-provincial boundary.
export const PROVINCE_DIVIDERS: Array<Array<[number, number]>> = [
  // BC / AB — 120th meridian
  [[-120, 49], [-120, 60]],
  // AB / SK — 110th meridian
  [[-110, 49], [-110, 60]],
  // SK / MB — 101.5° approx (not a meridian, simplification: use 102)
  [[-102, 49], [-102, 60]],
  // MB / ON — irregular, approximate with line from southeast MB to Hudson Bay
  [[-95, 49], [-95, 56]],
  // ON / QC — Ottawa river / Lake Timiskaming
  [[-79.5, 46], [-79.5, 51], [-80.0, 55], [-80.0, 60]],
  // QC / Labrador — irregular, approximate
  [[-66.0, 51], [-66.5, 53], [-65.5, 55], [-64.5, 58]],
  // NB / QC — Restigouche / Bay of Chaleur
  [[-67.5, 47.5], [-67.0, 48.0]],
  // NB / NS — Chignecto isthmus
  [[-64.0, 45.8], [-63.7, 46.0]],
];

export function buildProvinceDividerPaths(): string[] {
  return PROVINCE_DIVIDERS.map((line) =>
    line
      .map(([lng, lat], i) => {
        const { x, y } = project(lng, lat);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" "),
  );
}
