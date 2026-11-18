// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by an autopilot that follows the road grid: it walks to a car,
// steals it, and drives the route to the mission marker (or flees the police
// along the roads), so the frame is what a short game really looks like and
// the same seed always gives the same frame.
import { STEP } from './config.js';
import { createCar } from './vehicles.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const CHASE_SECONDS = 10;
const END_LIMIT_SECONDS = 120;

function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function nearestLine(lines, value) {
  let best = lines[0];
  let bd = Math.abs(value - lines[0]);
  for (const line of lines) {
    const d = Math.abs(value - line);
    if (d < bd) { bd = d; best = line; }
  }
  return best;
}

/**
 * A route through the road grid from `from` to `to`: snap onto the nearest
 * road, then an L-shaped run through the intersections to the one nearest
 * the target, then the target itself. Consecutive waypoints always share a
 * road, so following them keeps the driver on the roads.
 */
function planRoute(city, from, to) {
  const road = city.nearestRoad(from.x, from.y);
  const snap = road.axis === 'v' ? { x: road.at, y: from.y } : { x: from.x, y: road.at };
  const ix0 = nearestLine(city.roadsV, from.x);
  const iy0 = nearestLine(city.roadsH, from.y);
  const ix1 = nearestLine(city.roadsV, to.x);
  const iy1 = nearestLine(city.roadsH, to.y);
  const raw = [snap, { x: ix0, y: iy0 }, { x: ix1, y: iy0 }, { x: ix1, y: iy1 }, { x: to.x, y: to.y }];
  const wps = [];
  for (const p of raw) {
    const last = wps[wps.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 30) wps.push(p);
  }
  return wps;
}

/** The autopilot's state: its current route and how long it has been stuck. */
function createPilot() {
  return {
    route: null,
    routeTarget: null,
    wp: 0,
    stuckTimer: 0,
    lastX: 0,
    lastY: 0,
    replanTimer: 0,
    slowTimer: 0,
    reverseTimer: 0,
    lastWp: -1,
    lastWpDist: Infinity,
    wpTimer: 0,
  };
}

/** Where the autopilot wants to go right now (mission target, or a car to steal). */
function pilotTarget(world) {
  const s = world.state;
  const p = s.player;
  if (!p.car && s.missions.stage().kind === 'steal') {
    let best = null;
    let bd = Infinity;
    for (const car of s.cars) {
      if (car.driver === 'police') continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < bd) { bd = d; best = car; }
    }
    return best ? { x: best.x, y: best.y, steal: true } : null;
  }
  const target = s.missions.target();
  return target ? { x: target.x, y: target.y, steal: false } : null;
}

/**
 * The autopilot's controls for one step. It follows its route's waypoints,
 * re-planning when the target changes or it has not moved for a while.
 */
function autopilot(world, pilot, dt, flee) {
  const s = world.state;
  const p = s.player;
  const city = s.city;
  const ctrl = { move: { x: 0, y: 0 }, run: false, aimX: p.x, aimY: p.y, shooting: false, actions: 0 };

  // pick the destination
  let dest = null;
  if (flee) {
    pilot.replanTimer -= dt;
    if (!pilot.routeTarget || pilot.replanTimer <= 0) {
      // flee toward the city centre, not away from the police: running from
      // the nearest car heads straight for the map edge and out of the city
      const cx = 1800;
      const cy = 1300;
      const d = Math.hypot(cx - p.x, cy - p.y) || 1;
      dest = {
        x: Math.max(150, Math.min(3450, p.x + ((cx - p.x) / d) * 800)),
        y: Math.max(150, Math.min(2450, p.y + ((cy - p.y) / d) * 800)),
      };
      // the flee point must sit on a road, or the route's last leg cuts
      // straight through a block to reach it
      const road = city.nearestRoad(dest.x, dest.y);
      dest = road.axis === 'v' ? { x: road.at, y: dest.y } : { x: dest.x, y: road.at };
      pilot.replanTimer = 4;
    } else {
      dest = pilot.routeTarget;
    }
  } else {
    dest = pilotTarget(world);
  }
  if (!dest) return ctrl;

  // (re)plan the route when the destination moved
  const moved = !pilot.routeTarget
    || Math.hypot(dest.x - pilot.routeTarget.x, dest.y - pilot.routeTarget.y) > 60;
  if (moved || !pilot.route) {
    pilot.route = planRoute(city, p, dest);
    pilot.routeTarget = { x: dest.x, y: dest.y };
    pilot.wp = 0;
  }
  // stuck? re-plan from where we are
  if (Math.hypot(p.x - pilot.lastX, p.y - pilot.lastY) > 24) {
    pilot.stuckTimer = 0;
    pilot.lastX = p.x;
    pilot.lastY = p.y;
  } else {
    pilot.stuckTimer += dt;
    if (pilot.stuckTimer > 3) {
      pilot.route = planRoute(city, p, dest);
      pilot.wp = 0;
      pilot.stuckTimer = 0;
      pilot.lastX = p.x;
      pilot.lastY = p.y;
    }
  }

  // The waypoint and its distance are recomputed after advancing: the
  // steering and the progress clock below must judge the waypoint the car
  // is actually heading for, not the one it just reached.
  let wp = pilot.route[Math.min(pilot.wp, pilot.route.length - 1)];
  let dx = wp.x - p.x;
  let dy = wp.y - p.y;
  let dist = Math.hypot(dx, dy);
  const reach = p.car ? 52 : 26;
  if (dist < reach) {
    if (pilot.wp < pilot.route.length - 1) {
      pilot.wp += 1;
      wp = pilot.route[Math.min(pilot.wp, pilot.route.length - 1)];
      dx = wp.x - p.x;
      dy = wp.y - p.y;
      dist = Math.hypot(dx, dy);
      // a new waypoint resets the progress clock: its distance starts large
      pilot.lastWpDist = Infinity;
      pilot.wpTimer = 0;
    } else if (dest.steal && dist < 60) ctrl.actions = 4; // E: get in
    else if (!dest.steal && dist < 30) return ctrl;
  }
  if (dest.steal && !p.car) {
    const d = Math.hypot(dest.x - p.x, dest.y - p.y);
    if (d < 60) ctrl.actions = 4;
  }

  const desired = Math.atan2(dy, dx);
  if (p.car) {
    // look ahead to the next waypoint when close, so corners are not cut
    let steerTarget = wp;
    if (dist < 130 && pilot.wp < pilot.route.length - 1) steerTarget = pilot.route[pilot.wp + 1];
    const steerDesired = Math.atan2(steerTarget.y - p.y, steerTarget.x - p.x);
    const diff = clampAngle(steerDesired - p.angle);
    const steer = Math.max(-1, Math.min(1, diff * 2));
    let throttle = 0.7;
    // brake for the turn at the next waypoint: a fast car swings wide and
    // grinds along the building on the far corner
    const nextWp = pilot.route[Math.min(pilot.wp + 1, pilot.route.length - 1)];
    const turnAngle = Math.abs(clampAngle(
      Math.atan2(nextWp.y - wp.y, nextWp.x - wp.x) - Math.atan2(wp.y - p.y, wp.x - p.x),
    ));
    if (dist < 170 && turnAngle > 0.4) throttle = 0.35;
    if (Math.abs(diff) > 1.4) throttle = Math.min(throttle, 0.4);
    // stuck against something: back out, then re-plan from where we are.
    // Progress is measured toward the waypoint, not raw movement: a car
    // being shoved around by a police ram still moves, but goes nowhere.
    // The waypoint index pins the comparison: a new waypoint starts far
    // away, and must not be judged against the old one's small distance.
    if (pilot.lastWp !== pilot.wp) {
      pilot.lastWp = pilot.wp;
      pilot.lastWpDist = dist;
      pilot.wpTimer = 0;
    }
    if (dist < pilot.lastWpDist - 30) {
      pilot.lastWpDist = dist;
      pilot.wpTimer = 0;
    } else {
      pilot.wpTimer += dt;
    }
    if (pilot.reverseTimer > 0) {
      pilot.reverseTimer -= dt;
      ctrl.move = { x: steer, y: 1 };
    } else if (pilot.wpTimer > 1.5) {
      pilot.reverseTimer = 0.7;
      pilot.wpTimer = 0;
      pilot.lastWpDist = Infinity;
      pilot.route = planRoute(city, p, dest);
      pilot.wp = 0;
      ctrl.move = { x: steer, y: 1 };
    } else {
      ctrl.move = { x: steer, y: -throttle };
    }
    ctrl.aimX = wp.x;
    ctrl.aimY = wp.y;
  } else {
    ctrl.move = { x: Math.cos(desired), y: Math.sin(desired) };
    ctrl.run = true;
  }
  return ctrl;
}

/** Put the player in a sports car on a road, heat at three stars, police closing in. */
function stageChase(world, random) {
  const s = world.state;
  const city = s.city;
  const p = city.randomRoadPoint(s.player, 600);
  const road = city.nearestRoad(p.x, p.y);
  const car = createCar(random, 'sports', p.x, p.y, road.axis === 'h' ? 0 : Math.PI / 2, 'player');
  car.road = road.at;
  car.axis = road.axis;
  car.dir = 1;
  s.cars.push(car);
  s.player.car = car;
  s.player.x = car.x;
  s.player.y = car.y;
  s.player.angle = car.angle;
  s.camera.x = car.x;
  s.camera.y = car.y;
  world.wanted.set(3);
  // two police cars already closing in, so the chase is in the frame at once
  for (let i = 0; i < 2; i += 1) {
    const q = city.randomRoadPoint(s.player, 900);
    const police = createCar(random, 'police', q.x, q.y, 0, 'police');
    s.cars.push(police);
  }
}

/**
 * Set `world` to the named scene (start, play, chase or end; any other name
 * is start) and return the screen to draw over it and the save to show.
 */
export function stageShot(name, world, random) {
  world.reset();
  const idle = { move: { x: 0, y: 0 }, run: false, aimX: 0, aimY: 0, shooting: false, actions: 0 };
  if (name !== 'play' && name !== 'chase' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, idle);
    return { screen: SCREEN_TITLE, save: { best: 0, missions: 0 } };
  }
  const pilot = createPilot();
  if (name === 'chase') {
    stageChase(world, random);
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      world.step(STEP, autopilot(world, pilot, STEP, true));
    }
    return { screen: SCREEN_PLAY, save: { best: 0, missions: 0 } };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  const doneTarget = name === 'end' ? 2 : 1;
  for (let i = 0; i < limit / STEP; i += 1) {
    world.step(STEP, autopilot(world, pilot, STEP, false));
    if (world.state.missionsDone >= doneTarget) break;
  }
  return { screen: SCREEN_PLAY, save: { best: 0, missions: world.state.missionsDone } };
}
