// Cars: their types, the traffic that drives the road grid, and the police
// cars that chase the player. A car is a point with an angle and a speed.
// The player's car and police cars use arcade physics (accelerate, brake,
// steer while moving); traffic follows the road grid kinematically, so it
// always stays in its lane and turns at intersections. Collisions are two
// circles, one at each axle, against buildings and other cars.
import { CAR, LANE, WORLD } from './config.js';
import { pick } from './random.js';

const TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'truck'];

/** Make a car of `type` at a position, facing `angle` (radians, 0 = east). */
export function createCar(random, type, x, y, angle, driver) {
  const spec = CAR.types[type];
  return {
    type,
    x, y,
    angle,
    speed: 0,
    color: pick(random, spec.colors),
    driver: driver || 'parked', // parked | traffic | police | player
    cruise: 130 + random() * 80,
    // traffic only: which road it follows, which way, and turn state
    axis: 'h',
    dir: 1,
    road: 0,
    turning: null,
    siren: 0,
  };
}

/** A random parked or traffic car of a civilian type. */
export function randomCivilianCar(random) {
  return pick(random, TYPES);
}

export function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(min, max, v) {
  return Math.max(min, Math.min(max, v));
}

/** Move a car one step with throttle (-1..1) and steering (-1..1). */
export function driveCar(car, dt, throttle, steer) {
  const spec = CAR.types[car.type];
  const top = spec.top;
  if (throttle > 0) car.speed += spec.accel * throttle * dt;
  else if (throttle < 0) car.speed += spec.accel * throttle * dt * 1.4;
  else {
    car.speed -= Math.sign(car.speed) * 140 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  car.speed = Math.max(-top * 0.45, Math.min(top, car.speed));
  if (Math.abs(car.speed) > 12) {
    car.angle += steer * spec.turn * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 140);
  }
  car.angle = clampAngle(car.angle);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

/** The two axle points of a car, for collision checks. */
export function carAxles(car) {
  const dx = Math.cos(car.angle) * 15;
  const dy = Math.sin(car.angle) * 15;
  return [
    { x: car.x + dx, y: car.y + dy },
    { x: car.x - dx, y: car.y - dy },
  ];
}

/** Right-hand lane offset for a road and a direction of travel. */
function laneOffset(axis, dir) {
  if (axis === 'h') return dir > 0 ? LANE : -LANE;
  return dir > 0 ? -LANE : LANE;
}

/** Heading (radians) for a road axis and direction. */
function heading(axis, dir) {
  if (axis === 'h') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

/** Place a traffic car on its road at its along-road position. */
export function placeTraffic(car, along) {
  if (car.axis === 'h') {
    car.x = along;
    car.y = car.road + laneOffset('h', car.dir);
  } else {
    car.x = car.road + laneOffset('v', car.dir);
    car.y = along;
  }
  car.angle = heading(car.axis, car.dir);
}

/**
 * Traffic driving: advance along the current road; at an intersection the
 * car sometimes turns onto the crossing road (seeded choice), swinging
 * around the corner over a few steps. It slows when a car is close ahead.
 */
export function driveTraffic(car, dt, city, cars, random) {
  if (car.turning) {
    const t = car.turning;
    t.progress += dt / 0.55;
    const p = Math.min(1, t.progress);
    // quadratic Bezier around the corner: start -> corner -> end point
    const q = 1 - p;
    car.x = q * q * t.sx + 2 * q * p * t.cx + p * p * t.ex;
    car.y = q * q * t.sy + 2 * q * p * t.cy + p * p * t.ey;
    const a0 = heading(t.fromAxis, t.fromDir);
    const a1 = heading(t.toAxis, t.toDir);
    car.angle = clampAngle(a0 + clampAngle(a1 - a0) * p);
    if (p >= 1) {
      car.axis = t.toAxis;
      car.dir = t.toDir;
      car.road = t.toAxis === 'h' ? t.atY : t.atX;
      car.turning = null;
      placeTraffic(car, t.toAxis === 'h' ? car.x : car.y);
    }
    return;
  }

  const along = car.axis === 'h' ? car.x : car.y;
  const lines = car.axis === 'h' ? city.roadsV : city.roadsH;
  // next intersection ahead
  let next = null;
  for (const line of lines) {
    const d = (line - along) * car.dir;
    if (d > 24 && d < 400) { next = line; break; }
  }
  let speed = car.cruise;
  if (carAhead(car, cars, 110)) speed = Math.min(speed, 40);
  if (next !== null && Math.abs(next - along) < 60) speed = Math.min(speed, 110);
  const advance = speed * dt;
  let newAlong = along + car.dir * advance;
  placeTraffic(car, newAlong);

  if (next !== null && Math.abs(next - newAlong) < 26 && random() < 0.32) {
    const toAxis = car.axis === 'h' ? 'v' : 'h';
    const toDir = random() < 0.5 ? 1 : -1;
    const atX = car.axis === 'h' ? next : car.road;
    const atY = car.axis === 'h' ? car.road : next;
    // end point: on the new road's lane, 60 px past the intersection
    const ex = toAxis === 'h' ? atX + toDir * 60 : atX + laneOffset('v', toDir);
    const ey = toAxis === 'h' ? atY + laneOffset('h', toDir) : atY + toDir * 60;
    // control point: where the current lane line meets the new lane line
    const cx = toAxis === 'h'
      ? atX + laneOffset('v', car.dir)
      : atX + laneOffset('v', toDir);
    const cy = toAxis === 'h'
      ? atY + laneOffset('h', toDir)
      : atY + laneOffset('h', car.dir);
    car.turning = {
      progress: 0,
      fromAxis: car.axis, fromDir: car.dir,
      toAxis, toDir, atX, atY,
      sx: car.x, sy: car.y, cx, cy, ex, ey,
    };
  }
  car.x = Math.max(60, Math.min(WORLD.width - 60, car.x));
  car.y = Math.max(60, Math.min(WORLD.height - 60, car.y));
}

/** True when another car is close ahead of this one. */
function carAhead(car, cars, dist) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of cars) {
    if (other === car || other.driver === 'parked') continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(dx * -fy + dy * fx);
    if (along > 0 && along < dist && side < 30) return true;
  }
  return false;
}

/**
 * Police chase: steer toward the player and ram. Returns the distance to
 * the player, so the world can decide when a bust happens.
 */
export function drivePolice(car, dt, player) {
  const dx = player.x - car.x;
  const dy = player.y - car.y;
  const dist = Math.hypot(dx, dy);
  const desired = Math.atan2(dy, dx);
  const steer = clampAngle(desired - car.angle);
  let throttle = 1;
  if (dist < 46) throttle = 0.2;
  // ram, then back off: a police car that keeps pushing pins the player's
  // car in place instead of chasing it
  if (dist < 70) throttle = -0.4;
  if (Math.abs(steer) > 1.2 && car.speed > 200) throttle = 0;
  driveCar(car, dt, throttle, clamp(-1, 1, steer * 2.2));
  car.siren += dt;
  return dist;
}

/** Push two cars apart when their axles overlap; returns true on a bump. */
export function collideCars(a, b) {
  let hit = false;
  const axlesA = carAxles(a);
  const axlesB = carAxles(b);
  for (const pa of axlesA) {
    for (const pb of axlesB) {
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 26) {
        const push = (26 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        // a police car deflects around the player's car instead of shoving
        // it into the nearest building: the police car takes most of the push
        const policeVsPlayer = (a.driver === 'police' && b.driver === 'player')
          || (a.driver === 'player' && b.driver === 'police');
        const shareA = policeVsPlayer ? (a.driver === 'police' ? 1.5 : 0.5) : 1;
        const shareB = policeVsPlayer ? (b.driver === 'police' ? 1.5 : 0.5) : 1;
        a.x -= nx * push * shareA; a.y -= ny * push * shareA;
        b.x += nx * push * shareB; b.y += ny * push * shareB;
        a.speed *= 0.97;
        b.speed *= 0.97;
        hit = true;
      }
    }
  }
  return hit;
}
