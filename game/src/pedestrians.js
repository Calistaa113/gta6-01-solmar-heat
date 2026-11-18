// Pedestrians: the people of Solmar. They stroll the sidewalks, cross at
// corners, and run when shots are fired or a car comes at them. A scared
// pedestrian sometimes drops the cash they were carrying.
import { PEDS, WORLD } from './config.js';
import { pick } from './random.js';

const SHIRTS = ['#d2691e', '#4a7fb5', '#7d5a9a', '#3f8a5f', '#c94f43', '#8a7d6b', '#d2a24c', '#5a6a7a'];
const PANTS = ['#2e3a4a', '#4a3a2e', '#5a5a5a', '#3a4a3a'];

/** Make a pedestrian at a point on a sidewalk. */
export function createPed(random, x, y) {
  return {
    x, y,
    angle: random() * Math.PI * 2,
    speed: PEDS.walkSpeed * (0.8 + random() * 0.4),
    state: 'walk', // walk | flee | down
    tx: x, ty: y, // current stroll target
    shirt: pick(random, SHIRTS),
    pants: pick(random, PANTS),
    panic: 0,
    downTimer: 0,
    dropped: false,
  };
}

/** Pick a new stroll target near the pedestrian, on a sidewalk. */
function newTarget(ped, city, random) {
  const point = city.randomRoadPoint(ped, 0);
  // offset off the road onto the sidewalk
  const road = city.nearestRoad(point.x, point.y);
  if (road.axis === 'v') {
    ped.tx = point.x + (random() < 0.5 ? -46 : 46);
    ped.ty = point.y;
  } else {
    ped.tx = point.x;
    ped.ty = point.y + (random() < 0.5 ? -46 : 46);
  }
  ped.tx = Math.max(20, Math.min(WORLD.width - 20, ped.tx));
  ped.ty = Math.max(20, Math.min(WORLD.height - 20, ped.ty));
}

/** Scare every pedestrian within `radius` of a point (gunfire, crash). */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.panic = 2.5;
      ped.fleeX = x;
      ped.fleeY = y;
    }
  }
}

export function stepPed(ped, dt, city, random) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) ped.state = 'walk';
    return;
  }
  if (ped.state === 'flee') {
    ped.panic -= dt;
    const dx = ped.x - ped.fleeX;
    const dy = ped.y - ped.fleeY;
    const d = Math.hypot(dx, dy) || 1;
    const speed = PEDS.fleeSpeed;
    ped.angle = Math.atan2(dy, dx);
    ped.x += (dx / d) * speed * dt;
    ped.y += (dy / d) * speed * dt;
    if (ped.panic <= 0) ped.state = 'walk';
  } else {
    const dx = ped.tx - ped.x;
    const dy = ped.ty - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) {
      newTarget(ped, city, random);
      return;
    }
    ped.angle = Math.atan2(dy, dx);
    ped.x += (dx / d) * ped.speed * dt;
    ped.y += (dy / d) * ped.speed * dt;
  }
  const body = { x: ped.x, y: ped.y };
  city.resolveCircle(body, 9);
  ped.x = body.x;
  ped.y = body.y;
  ped.x = Math.max(10, Math.min(WORLD.width - 10, ped.x));
  ped.y = Math.max(10, Math.min(WORLD.height - 10, ped.y));
}

/** Knock a pedestrian down (car hit or punch); returns true if cash dropped. */
export function knockDown(ped, random) {
  ped.state = 'down';
  ped.downTimer = 4 + random() * 3;
  if (!ped.dropped && random() < 0.45) {
    ped.dropped = true;
    return true;
  }
  return false;
}
