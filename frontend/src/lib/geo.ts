// Canada basemap geometry for FlowSight.
//
// Outline traced from ~80 anchor points covering all major recognizable
// features (BC panhandle indent, southern Ontario peninsula, Maritimes lobe,
// Labrador, Ungava Bay). Rendered with straight segments + rounded line joins;
// no smoothing — the point density is what carries the silhouette.

export const CANVAS_W = 1280;
export const CANVAS_H = 720;

const LNG_MIN = -141;
const LNG_MAX = -52;
const LAT_MIN = 41;
const LAT_MAX = 62;

const X_PAD_LEFT = 30;
const X_PAD_RIGHT = 30;
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
  "sup-valleydairy":  { lat: 43.40, lng:  -80.40, region: "ON" },
  "sup-newleaf":      { lat: 45.34, lng:  -73.25, region: "QC" },
};

export const RETAILER_GEO: Record<string, LatLng & { region: string }> = {
  costco:       { lat: 45.42, lng: -75.70, region: "ON" },
  walmart:      { lat: 49.28, lng: -123.12, region: "BC" },
  loblaws:      { lat: 44.65, lng: -63.58, region: "NS" },
  metro:        { lat: 46.81, lng: -71.21, region: "QC" },
  sobeys:       { lat: 51.05, lng: -114.07, region: "AB" },
  "whole-foods": { lat: 47.56, lng: -52.71, region: "NL" },
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
// Canada outline — clockwise from Yukon-Alaska coastal corner.
// Coordinates derived from major landmarks for recognizability.
// ---------------------------------------------------------------------------

const CANADA_OUTLINE: Array<[number, number]> = [
  // Yukon-Alaska border / BC coast (Alaska Panhandle creates the iconic NW cut)
  [-141, 60.0], [-140, 59.6], [-138, 59.3], [-136, 59.0], [-134, 58.0],
  [-132, 57.0], [-131, 56.0], [-130.5, 55.0],
  // BC mainland coast south to Vancouver
  [-130, 54.0], [-129, 53.0], [-127.5, 52.0], [-126, 51.0],
  [-125, 50.0], [-124, 49.4], [-123.2, 49.0],
  // 49th parallel — US border across the Prairies
  [-120, 49.0], [-115, 49.0], [-110, 49.0], [-105, 49.0], [-100, 49.0], [-95, 49.0],
  // Lake of the Woods kink
  [-94.5, 48.6], [-92.5, 48.5], [-91, 48.1], [-89.5, 48.0],
  // North of Lake Superior
  [-88, 48.3], [-86, 48.0], [-85, 47.0], [-84.5, 46.5],
  // North of Lake Huron / Manitoulin (smooth east curve)
  [-83.5, 46.0], [-82.5, 45.7], [-82, 45.0],
  // Bruce Peninsula east shore of Lake Huron
  [-81.5, 44.5], [-82.0, 43.7], [-82.4, 43.0],
  // Sarnia / Lake St. Clair
  [-82.5, 42.7], [-82.4, 42.4], [-82.8, 42.2],
  // Windsor / Pelee Point (southern tip of Canada)
  [-83.1, 42.05], [-82.9, 41.7], [-82.5, 41.7], [-82.0, 41.75],
  // Lake Erie north shore east to Niagara
  [-81.0, 42.1], [-79.5, 42.4], [-79.0, 42.85],
  // Niagara / Lake Ontario north shore east to St. Lawrence outlet
  [-78.5, 43.3], [-77.8, 43.7], [-76.8, 44.1],
  // St. Lawrence River — Ontario/Quebec/NY border
  [-76.0, 44.3], [-75.0, 44.8], [-74.3, 45.0],
  // Quebec / NY / VT / NH border (mostly 45th parallel)
  [-73.0, 45.0], [-71.5, 45.1],
  // Quebec / Maine border zigzag
  [-70.7, 45.4], [-70.3, 45.7], [-70.0, 46.4], [-69.5, 47.0],
  [-68.8, 47.4], [-67.8, 47.1],
  // Maine / NB border down to Bay of Fundy
  [-67.4, 46.0], [-67.5, 45.3],
  // Bay of Fundy north shore (NB)
  [-66.5, 45.0], [-65.7, 45.2], [-65.0, 45.4],
  // Across Chignecto Isthmus into Nova Scotia
  [-64.5, 45.7], [-64.0, 45.4], [-64.5, 44.5],
  // NS Atlantic shore south to Yarmouth
  [-65.5, 43.7], [-66.2, 43.8], [-66.0, 44.4],
  // South / Atlantic coast of NS going east
  [-64.5, 44.5], [-63.6, 44.7], [-62.5, 45.0],
  // Cape Breton
  [-61.5, 45.5], [-60.5, 45.7], [-59.8, 46.0], [-59.7, 46.4],
  [-60.5, 46.6], [-61.5, 46.5],
  // Back along Northumberland Strait into NB
  [-62.5, 46.0], [-63.7, 45.8], [-64.5, 46.0],
  // East side of NB / Acadian Peninsula
  [-64.5, 47.0], [-64.7, 47.7], [-65.0, 48.0],
  // Bay of Chaleur
  [-66.0, 48.1], [-66.5, 48.2], [-65.8, 48.5],
  // Gaspé peninsula
  [-64.5, 48.8], [-64.0, 49.2], [-64.8, 49.4],
  // North shore of Lower St. Lawrence going east (Côte-Nord)
  [-66.0, 49.6], [-68.0, 49.6], [-69.5, 49.0], [-69.5, 48.4],
  [-68.0, 48.7], [-67.5, 49.3], [-66.5, 50.0], [-64.5, 50.2],
  [-62.0, 50.3], [-60.0, 50.4], [-58.0, 51.0],
  // Strait of Belle Isle into Labrador
  [-57.0, 51.5], [-56.3, 52.5],
  // Labrador east coast going north
  [-55.8, 53.5], [-55.5, 55.0], [-56.0, 56.0], [-57.0, 57.0],
  [-58.5, 58.0], [-60.5, 59.0], [-62.5, 59.7], [-64.0, 60.3],
  // Ungava Bay
  [-65.0, 60.5], [-66.0, 60.2], [-67.5, 59.2], [-69.0, 58.7],
  [-70.0, 58.5], [-69.8, 59.5], [-69.3, 60.5], [-69.0, 61.5],
  // Hudson Strait south shore across northern Quebec
  [-71.0, 62.0], [-74.0, 62.0],
  // Top edge — clipped at 62°N
  [-90.0, 62.0], [-110.0, 62.0], [-130.0, 62.0], [-141.0, 62.0],
  // Down the Yukon-Alaska border back to the start
  [-141, 60.0],
];

export function buildCanadaPath(): string {
  return CANADA_OUTLINE
    .map(([lng, lat], i) => {
      const { x, y } = project(lng, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
}

// Newfoundland — separate island, drawn over the Atlantic.
const NEWFOUNDLAND_OUTLINE: Array<[number, number]> = [
  [-59.3, 47.6], [-58.3, 47.9], [-57.0, 48.5], [-55.8, 49.4],
  [-55.0, 49.7], [-53.6, 49.5], [-52.8, 48.5], [-52.9, 47.5],
  [-53.7, 46.8], [-55.0, 46.7], [-56.0, 47.0], [-57.5, 47.2],
  [-58.7, 47.4], [-59.3, 47.6],
];

export function buildNewfoundlandPath(): string {
  return NEWFOUNDLAND_OUTLINE
    .map(([lng, lat], i) => {
      const { x, y } = project(lng, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
}

// Hudson Bay — drawn over the land as a water carve-out.
const HUDSON_BAY_OUTLINE: Array<[number, number]> = [
  [-94, 60], [-91, 61], [-87, 61], [-83, 60.5], [-79, 59.5],
  [-78, 58], [-78, 56], [-79, 53],
  // James Bay south extension
  [-80, 51.5], [-81, 51.2], [-82, 51.5], [-82.5, 53],
  [-85, 54], [-89, 56], [-92, 58], [-94, 60],
];

export function buildHudsonBayPath(): string {
  return HUDSON_BAY_OUTLINE
    .map(([lng, lat], i) => {
      const { x, y } = project(lng, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
}

// Great Lakes — water carve-outs.
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
