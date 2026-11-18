// The city of Solmar: a road grid, blocks of buildings, districts (downtown,
// residential, industrial, park, beach), and the named places the missions
// and the shops use. Everything is built from the seeded random, so the same
// seed always gives the same city. Collision is circle-vs-rectangle against
// the building list.
import { BLOCK, ROAD_EVERY, ROAD_HALF, WORLD } from './config.js';
import { pick } from './random.js';

const ROOF_COLORS = ['#a89a8a', '#8d7f74', '#b5a48f', '#7a6a72', '#9a8a7a'];
const HOUSE_COLORS = ['#c9a06a', '#b58a6a', '#a87f6a', '#c2b280', '#9a7f8a'];
const TOWER_COLORS = ['#6a7a8a', '#7a6a72', '#5d7d8a', '#8a7a6a'];

function roadLines(span) {
  const lines = [];
  for (let at = 200; at < span - 100; at += ROAD_EVERY) lines.push(at);
  return lines;
}

/** Which district a block (column, row) belongs to. */
function districtFor(col, row) {
  if (row >= 5) return 'beach';
  if (col >= 3 && col <= 5 && row >= 1 && row <= 3) return 'downtown';
  if ((col === 1 && row === 2) || (col === 6 && row === 4)) return 'park';
  if (col <= 1 && row <= 1) return 'industrial';
  return 'residential';
}

export function createCity(random) {
  const roadsV = roadLines(WORLD.width);
  const roadsH = roadLines(WORLD.height);
  const buildings = [];
  const trees = [];
  const places = {};

  function addBuilding(x, y, w, h, color, tall) {
    const b = { x, y, w, h, color, tall: tall || 0 };
    buildings.push(b);
    return b;
  }

  function fillBlock(x0, y0, district) {
    if (district === 'park') {
      for (let i = 0; i < 9; i += 1) {
        trees.push({ x: x0 + 30 + random() * (BLOCK - 60), y: y0 + 30 + random() * (BLOCK - 60), r: 12 + random() * 8 });
      }
      return;
    }
    if (district === 'beach') {
      for (let i = 0; i < 4; i += 1) {
        trees.push({ x: x0 + 30 + random() * (BLOCK - 60), y: y0 + 30 + random() * (BLOCK - 60), r: 10 + random() * 6 });
      }
      return;
    }
    if (district === 'downtown') {
      const w = 150 + random() * 90;
      const h = 150 + random() * 90;
      addBuilding(x0 + (BLOCK - w) / 2, y0 + (BLOCK - h) / 2, w, h, pick(random, TOWER_COLORS), 26 + random() * 30);
      return;
    }
    if (district === 'industrial') {
      addBuilding(x0 + 20, y0 + 30, BLOCK - 40, 110, '#8a7d6b', 8);
      addBuilding(x0 + 20, y0 + BLOCK - 150, BLOCK - 40, 110, '#7d7468', 8);
      return;
    }
    // residential: a few houses with gardens
    const count = 3 + Math.floor(random() * 2);
    for (let i = 0; i < count; i += 1) {
      const w = 60 + random() * 40;
      const h = 55 + random() * 35;
      const x = x0 + 24 + ((i % 2) * (BLOCK / 2));
      const y = y0 + 24 + (Math.floor(i / 2) * (BLOCK / 2));
      addBuilding(x, y, Math.min(w, BLOCK / 2 - 44), Math.min(h, BLOCK / 2 - 44), pick(random, HOUSE_COLORS), 6 + random() * 6);
    }
    if (random() < 0.6) trees.push({ x: x0 + BLOCK / 2, y: y0 + BLOCK - 40, r: 13 });
  }

  for (let col = 0; col < roadsV.length - 1; col += 1) {
    for (let row = 0; row < roadsH.length - 1; row += 1) {
      const x0 = roadsV[col] + ROAD_HALF + 8;
      const y0 = roadsH[row] + ROAD_HALF + 8;
      fillBlock(x0, y0, districtFor(col, row));
    }
  }

  // Named places: doorstep points on the road beside their building.
  function placeAt(name, col, row, dx, dy) {
    const x = roadsV[col] + dx;
    const y = roadsH[row] + dy;
    places[name] = { x, y };
  }
  placeAt('safehouse', 4, 3, ROAD_HALF + 14, 60);
  placeAt('spray', 2, 2, ROAD_HALF + 14, 60);
  placeAt('arms', 5, 4, ROAD_HALF + 14, 60);
  placeAt('hospital', 6, 1, ROAD_HALF + 14, 60);
  placeAt('marina', 4, 5, 0, ROAD_HALF + 14);
  placeAt('courier', 1, 4, ROAD_HALF + 14, 60);
  placeAt('warehouse', 0, 0, ROAD_HALF + 14, 60);
  placeAt('pier', 4, 5, 0, ROAD_HALF + 14);

  /** True when a point is on a road (inside the kerbs). */
  function onRoad(x, y) {
    for (const rx of roadsV) if (Math.abs(x - rx) <= ROAD_HALF) return true;
    for (const ry of roadsH) if (Math.abs(y - ry) <= ROAD_HALF) return true;
    return false;
  }

  /** The nearest road centre line to a point, as {axis, at}. */
  function nearestRoad(x, y) {
    let best = { axis: 'v', at: roadsV[0], d: Infinity };
    for (const rx of roadsV) {
      const d = Math.abs(x - rx);
      if (d < best.d) best = { axis: 'v', at: rx, d };
    }
    for (const ry of roadsH) {
      const d = Math.abs(y - ry);
      if (d < best.d) best = { axis: 'h', at: ry, d };
    }
    return best;
  }

  /** Push a circle out of every building it overlaps. Returns true if pushed. */
  function resolveCircle(body, r) {
    let pushed = false;
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
      const dx = body.x - cx;
      const dy = body.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      pushed = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        body.x = cx + (dx / d) * r;
        body.y = cy + (dy / d) * r;
      } else {
        // centre inside the building: push out along the smallest overlap
        const left = body.x - b.x;
        const right = b.x + b.w - body.x;
        const top = body.y - b.y;
        const bottom = b.y + b.h - body.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) body.x = b.x - r;
        else if (m === right) body.x = b.x + b.w + r;
        else if (m === top) body.y = b.y - r;
        else body.y = b.y + b.h + r;
      }
    }
    const clampedX = Math.max(r, Math.min(WORLD.width - r, body.x));
    const clampedY = Math.max(r, Math.min(WORLD.height - r, body.y));
    const clamped = clampedX !== body.x || clampedY !== body.y;
    body.x = clampedX;
    body.y = clampedY;
    return pushed || clamped;
  }

  /** A random point on a road, at least `margin` from the player's position. */
  function randomRoadPoint(near, margin) {
    for (let tries = 0; tries < 40; tries += 1) {
      const vertical = random() < 0.5;
      let x;
      let y;
      if (vertical) {
        x = pick(random, roadsV);
        y = 120 + random() * (WORLD.height - 240);
      } else {
        x = 120 + random() * (WORLD.width - 240);
        y = pick(random, roadsH);
      }
      if (near && Math.hypot(x - near.x, y - near.y) < margin) continue;
      return { x, y };
    }
    return { x: roadsV[2], y: roadsH[2] };
  }

  /** A random point inside the beach strip (south of the last road). */
  function randomBeachPoint() {
    return {
      x: 300 + random() * (WORLD.width - 600),
      y: roadsH[roadsH.length - 1] + ROAD_HALF + 40 + random() * 120,
    };
  }

  return {
    roadsV, roadsH, buildings, trees, places,
    onRoad, nearestRoad, resolveCircle, randomRoadPoint, randomBeachPoint,
    waterY: WORLD.height - 60,
  };
}

/** Palette helpers the renderer uses for districts. */
export function blockDistrict(col, row) {
  return districtFor(col, row);
}
