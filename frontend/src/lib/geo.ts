// Equirectangular projection of Canada onto the FlowSight 1280×720 canvas.
//
// Longitude range: -141°W (Yukon-Alaska border) .. -52°W (Newfoundland tip)
// Latitude range:   70°N (high Arctic)         ..  41°N (Lake Erie shore)
// Padding leaves room for labels and side panels.

export const CANVAS_W = 1280;
export const CANVAS_H = 720;

const LNG_MIN = -141;
const LNG_MAX = -52;
const LAT_MIN = 41;
const LAT_MAX = 70;

const X_PAD_LEFT = 60;
const X_PAD_RIGHT = 60;
const Y_PAD_TOP = 30;
const Y_PAD_BOTTOM = 100; // leave room for time scrubber

const PLOT_W = CANVAS_W - X_PAD_LEFT - X_PAD_RIGHT;
const PLOT_H = CANVAS_H - Y_PAD_TOP - Y_PAD_BOTTOM;

export interface Pt {
  x: number;
  y: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export function project(lng: number, lat: number): Pt {
  const xRaw = (lng - LNG_MIN) / (LNG_MAX - LNG_MIN);
  const yRaw = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN);
  return {
    x: X_PAD_LEFT + xRaw * PLOT_W,
    y: Y_PAD_TOP + yRaw * PLOT_H,
  };
}

// ---------------------------------------------------------------------------
// Real-world coordinates — sourced from infra/data/cache/nominatim/*.json
// for plants; suppliers and retailers use known head-office / distribution
// center locations of the seeded entities.
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
  "sup-valleydairy":  { lat: 43.78, lng:  -81.04, region: "ON" },
  "sup-newleaf":      { lat: 45.34, lng:  -73.25, region: "QC" },
};

export const RETAILER_GEO: Record<string, LatLng & { region: string }> = {
  // Costco Wholesale Canada — Ottawa HQ
  costco:  { lat: 45.34, lng: -75.91, region: "ON" },
  // Walmart Canada HQ — Mississauga
  walmart: { lat: 43.59, lng: -79.64, region: "ON" },
  // Loblaw Companies HQ — Brampton
  loblaws: { lat: 43.6883, lng: -79.7593, region: "ON" },
  // Metro Inc HQ — Montreal
  metro:   { lat: 45.5300, lng: -73.5800, region: "QC" },
};

// Fallback positions when a supplier/retailer id isn't in the maps above.
// Spread them around the southern strip so they don't all stack.
export const FALLBACK_SUPPLIER_POS: LatLng[] = [
  { lat: 50.0, lng: -110.0 }, // AB
  { lat: 51.0, lng: -100.0 }, // SK
  { lat: 47.5, lng: -85.0 },  // northern ON
  { lat: 46.0, lng: -65.0 },  // NB
];

export const FALLBACK_RETAILER_POS: LatLng[] = [
  { lat: 43.7, lng: -79.4 }, // GTA
  { lat: 45.5, lng: -73.6 }, // Montreal
  { lat: 49.3, lng: -123.1 }, // Vancouver
  { lat: 51.0, lng: -114.1 }, // Calgary
];

// Notable Canadian cities for context labels on the basemap.
export const CONTEXT_CITIES: Array<LatLng & { name: string }> = [
  { name: "Vancouver",  lat: 49.28, lng: -123.12 },
  { name: "Calgary",    lat: 51.05, lng: -114.07 },
  { name: "Edmonton",   lat: 53.55, lng: -113.49 },
  { name: "Saskatoon",  lat: 52.13, lng: -106.67 },
  { name: "Winnipeg",   lat: 49.90, lng:  -97.14 },
  { name: "Ottawa",     lat: 45.42, lng:  -75.70 },
  { name: "Quebec City", lat: 46.81, lng:  -71.21 },
  { name: "Halifax",    lat: 44.65, lng:  -63.58 },
  { name: "St. John's", lat: 47.56, lng:  -52.71 },
];

// ---------------------------------------------------------------------------
// Canada outline — coordinate ring going clockwise from the Yukon NW corner.
// Hand-traced to a ~1°-resolution simplification of Natural Earth 1:110m,
// good enough for an ops dashboard at this canvas size.
// ---------------------------------------------------------------------------

const CANADA_OUTLINE: Array<[number, number]> = [
  // [lng, lat] — clockwise from NW corner
  [-141, 69.5], [-139, 69.8], [-136, 69.7], [-132, 69.5], [-129, 69.8],
  [-124, 70.5], [-120, 70.2], [-114, 69.0], [-110, 68.5], [-104, 68.2],
  [-99, 68.7], [-95, 68.4], [-90, 68.6], [-85, 68.5], [-80, 67.5],
  [-75, 67.2], [-70, 67.8], [-65, 67.3], [-62, 66.5], [-61, 65.0],
  // Down through Hudson Strait / Ungava
  [-62, 62.5], [-65, 61.5], [-69, 61.7], [-70, 60.5], [-69, 58.5],
  // Labrador coast
  [-65, 57.5], [-60, 56.5], [-56, 54.5], [-57, 52.5], [-57, 51.5],
  // Gulf of St. Lawrence north shore (skipping Newfoundland — drawn separately)
  [-58, 50.8], [-60, 50.3], [-64, 50.0], [-65, 49.2], [-66, 48.8],
  // Gaspé peninsula
  [-65, 48.4], [-66, 48.0], [-65, 47.5],
  // New Brunswick / Nova Scotia (simplified — NS shown as small bulge)
  [-66, 46.5], [-67, 45.2], [-66, 44.5], [-63, 44.0], [-60, 43.6], [-65, 44.5],
  // Maine border northward
  [-67, 45.2], [-69, 45.4], [-70, 45.7], [-71, 45.2],
  // Quebec / NY border, eastern Ontario, southern ON tip
  [-74.5, 45.0], [-78, 44.0], [-82, 42.5], [-83, 42.0], [-82.5, 41.8],
  // Up along Detroit/Windsor and around Lake Erie north shore (south Ontario coast)
  [-82, 42.0], [-82, 43.0], [-84, 46.5],
  // Manitoba / North Dakota border west
  [-85, 48.5], [-90, 48.5], [-95, 49.0],
  // Prairies south border
  [-100, 49.0], [-110, 49.0], [-117, 49.0], [-123, 49.0],
  // Pacific coast going north
  [-123, 50.0], [-125, 51.0], [-127, 52.5], [-128, 53.5], [-130, 54.5],
  [-131, 55.5], [-133, 57.0], [-135, 58.5], [-138, 59.5],
  // Yukon / Alaska border at 60°N
  [-141, 60.0],
  // Close back to start
  [-141, 65.0], [-141, 69.5],
];

export function buildCanadaPath(): string {
  return CANADA_OUTLINE
    .map(([lng, lat], i) => {
      const { x, y } = project(lng, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
}

// Newfoundland — drawn as a separate ring so the Gulf of St. Lawrence reads correctly.
const NEWFOUNDLAND_OUTLINE: Array<[number, number]> = [
  [-59.5, 47.5], [-58.5, 47.8], [-57.0, 48.5], [-55.5, 49.6],
  [-53.5, 49.8], [-52.7, 47.6], [-53.6, 46.6], [-55.5, 47.0],
  [-58.5, 47.2], [-59.5, 47.5],
];

export function buildNewfoundlandPath(): string {
  return NEWFOUNDLAND_OUTLINE
    .map(([lng, lat], i) => {
      const { x, y } = project(lng, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
}

// Great Lakes — simplified blobs around their real centers.
export const GREAT_LAKES: Array<{ name: string; lat: number; lng: number; rxDeg: number; ryDeg: number }> = [
  { name: "Superior", lat: 47.7, lng: -87.5, rxDeg: 4.2, ryDeg: 1.2 },
  { name: "Huron",    lat: 45.0, lng: -82.5, rxDeg: 1.8, ryDeg: 1.6 },
  { name: "Michigan", lat: 44.0, lng: -86.5, rxDeg: 1.0, ryDeg: 2.5 },
  { name: "Erie",     lat: 42.2, lng: -81.5, rxDeg: 2.3, ryDeg: 0.7 },
  { name: "Ontario",  lat: 43.6, lng: -77.8, rxDeg: 1.5, ryDeg: 0.6 },
];

// Hudson Bay — large water body inside Canada's outline.
export const HUDSON_BAY: { lat: number; lng: number; rxDeg: number; ryDeg: number } = {
  lat: 58.5, lng: -85.0, rxDeg: 8.0, ryDeg: 5.5,
};

// Projects a (lat, lng) ellipse-radius pair to canvas pixels for SVG <ellipse>.
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
