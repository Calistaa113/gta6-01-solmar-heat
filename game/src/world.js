// The game's rules and state, with no drawing and no browser in it: the
// player (on foot or in a car), traffic, pedestrians, police, the wanted
// level, missions, money and pickups. step() advances one fixed step and
// returns what happened as bit flags, so the caller can react (sound,
// announcements) without the world knowing about screens or audio.
import {
  ECONOMY, PEDS, PLAYER, TRAFFIC, WANTED,
} from './config.js';
import { createCity } from './city.js';
import {
  collideCars, createCar, driveCar, drivePolice, driveTraffic, carAxles, randomCivilianCar,
} from './vehicles.js';
import { createPed, knockDown, scarePeds, stepPed } from './pedestrians.js';
import { createMissions } from './missions.js';
import { createWanted } from './wanted.js';

export const EVENT_CASH = 1;
export const EVENT_SHOT = 2;
export const EVENT_CRASH = 4;
export const EVENT_BUSTED = 8;
export const EVENT_DOWN = 16;
export const EVENT_STAGE = 32;
export const EVENT_MISSION = 64;
export const EVENT_FAILED = 128;
export const EVENT_HIT = 256;
export const EVENT_PUNCH = 512;
export const EVENT_SPRAY = 1024;

const CASH_VALUES = [25, 25, 40, 40, 50];

export function createWorld(random) {
  const city = createCity(random);
  const missions = createMissions(random, city);
  const wanted = createWanted();
  let cars = [];
  let peds = [];
  let bullets = [];
  let pickups = [];
  let particles = [];
  let cops = [];

  const player = {
    x: 0, y: 0, angle: 0,
    health: PLAYER.health,
    ammo: PLAYER.startAmmo,
    car: null,
    shootTimer: 0,
    punchTimer: 0,
    hurtTimer: 0,
    speed: 0,
  };
  const state = {
    player, cars, peds, bullets, pickups, particles, cops,
    city, missions, wanted,
    money: ECONOMY.startMoney,
    earned: 0,
    elapsed: 0,
    timeOfDay: 0.3, // 0 dawn, 0.5 noon, 1 dusk
    camera: { x: 0, y: 0 },
    over: null, // 'busted' | 'down' | null
    overTimer: 0,
    storyDone: false,
    missionsDone: 0,
  };

  function spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const p = city.randomRoadPoint(player, TRAFFIC.spawnMargin);
      const road = city.nearestRoad(p.x, p.y);
      const type = randomCivilianCar(random);
      const car = createCar(random, type, p.x, p.y, 0, 'traffic');
      car.axis = road.axis;
      car.dir = random() < 0.5 ? 1 : -1;
      car.road = road.at;
      car.cruise = 120 + random() * 90;
      placeOnRoad(car);
      cars.push(car);
    }
    // parked cars along the roads
    for (let i = 0; i < 12; i += 1) {
      const p = city.randomRoadPoint(player, 300);
      const road = city.nearestRoad(p.x, p.y);
      const type = randomCivilianCar(random);
      const car = createCar(random, type, p.x, p.y, 0, 'parked');
      car.axis = road.axis;
      car.dir = 1;
      car.road = road.at;
      placeOnRoad(car);
      // nudge off the driving lane onto the kerb
      if (car.axis === 'h') car.y += 26;
      else car.x += 26;
      cars.push(car);
    }
  }

  function placeOnRoad(car) {
    if (car.axis === 'h') {
      car.y = car.road + (car.dir > 0 ? 16 : -16);
      car.angle = car.dir > 0 ? 0 : Math.PI;
    } else {
      car.x = car.road + (car.dir > 0 ? -16 : 16);
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  function spawnPeds() {
    for (let i = 0; i < PEDS.count; i += 1) {
      const p = city.randomRoadPoint(player, 260);
      const road = city.nearestRoad(p.x, p.y);
      let x = p.x;
      let y = p.y;
      if (road.axis === 'v') x += 46;
      else y += 46;
      peds.push(createPed(random, x, y));
    }
  }

  function spawnCash() {
    for (let i = 0; i < CASH_VALUES.length; i += 1) {
      const p = city.randomRoadPoint(player, 400);
      pickups.push({ kind: 'cash', x: p.x, y: p.y, value: CASH_VALUES[i], respawn: 0 });
    }
  }

  function reset() {
    cars = [];
    peds = [];
    bullets = [];
    pickups = [];
    particles = [];
    cops = [];
    state.cars = cars;
    state.peds = peds;
    state.bullets = bullets;
    state.pickups = pickups;
    state.particles = particles;
    state.cops = cops;
    const home = city.places.safehouse;
    player.x = home.x;
    player.y = home.y;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.ammo = PLAYER.startAmmo;
    player.car = null;
    player.shootTimer = 0;
    player.punchTimer = 0;
    player.hurtTimer = 0;
    player.speed = 0;
    state.money = ECONOMY.startMoney;
    state.earned = 0;
    state.elapsed = 0;
    state.timeOfDay = 0.3;
    state.over = null;
    state.overTimer = 0;
    state.storyDone = false;
    state.missionsDone = 0;
    wanted.clear();
    missions.startMission(0, player);
    spawnTraffic();
    spawnPeds();
    spawnCash();
    state.camera.x = player.x;
    state.camera.y = player.y;
  }

  function addParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const s = (0.3 + random() * 0.7) * speed;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + random() * 0.4, max: 0.8, color, size: 2 + random() * 3,
      });
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const car of cars) {
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  function policeNeeded() {
    return wanted.policeCarsNeeded();
  }

  function spawnPolice() {
    const needed = policeNeeded();
    const have = cars.filter((c) => c.driver === 'police').length;
    for (let i = have; i < needed; i += 1) {
      const p = city.randomRoadPoint(player, 700);
      const car = createCar(random, 'police', p.x, p.y, 0, 'police');
      car.siren = random() * 2;
      cars.push(car);
    }
    // on-foot cops when the player is on foot and wanted
    if (!player.car && wanted.state.stars >= 2) {
      const want = Math.min(3, wanted.state.stars);
      while (cops.length < want) {
        const p = city.randomRoadPoint(player, 420);
        cops.push({ x: p.x, y: p.y, angle: 0, speed: 205, health: 100 });
      }
    }
  }

  function despawnPolice() {
    if (wanted.state.stars === 0) {
      cars = cars.filter((c) => c.driver !== 'police');
      cops = [];
      state.cars = cars;
      state.cops = cops;
      return;
    }
    cars = cars.filter((c) => {
      if (c.driver !== 'police') return true;
      return Math.hypot(c.x - player.x, c.y - player.y) < 1600;
    });
    state.cars = cars;
  }

  function bustPlayer(events) {
    if (state.over) return events;
    state.over = 'busted';
    state.overTimer = 0;
    const fine = Math.min(state.money, ECONOMY.bustFine);
    state.money -= fine;
    wanted.clear();
    return events | EVENT_BUSTED;
  }

  /** Respawn after being busted or down; called from the game loop. */
  function respawn() {
    const place = state.over === 'down' ? city.places.hospital : city.places.safehouse;
    if (state.over === 'down') state.money = Math.max(0, state.money - ECONOMY.hospitalCost);
    if (player.car) {
      player.car.driver = 'parked';
      player.car.speed = 0;
      player.car = null;
    }
    player.x = place.x;
    player.y = place.y;
    player.health = PLAYER.health;
    player.ammo = Math.max(player.ammo, 12);
    state.over = null;
    state.camera.x = player.x;
    state.camera.y = player.y;
    missions.restart(player);
  }

  function tryEnterCar(events) {
    if (player.car) {
      // get out beside the car
      const car = player.car;
      car.driver = 'parked';
      car.speed = 0;
      player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      player.car = null;
      return events;
    }
    const car = nearestCar(player.x, player.y, 74);
    if (!car) return events;
    const wasTraffic = car.driver === 'traffic';
    const copNear = cars.some((c) => c.driver === 'police' && Math.hypot(c.x - player.x, c.y - player.y) < 420);
    car.driver = 'player';
    player.car = car;
    player.angle = car.angle;
    if (car.type !== 'police' && (wasTraffic || copNear)) {
      wanted.add(1);
      return events | EVENT_CRASH;
    }
    return events;
  }

  function tryPunch(events) {
    if (player.punchTimer > 0 || player.car) return events;
    player.punchTimer = 0.32;
    const range = PLAYER.punchRange + 14;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - player.x, ped.y - player.y);
      if (d > range) continue;
      const ang = Math.atan2(ped.y - player.y, ped.x - player.x);
      let diff = Math.abs(ang - player.angle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < PLAYER.punchArc) {
        if (knockDown(ped, random)) {
          pickups.push({ kind: 'cash', x: ped.x, y: ped.y, value: 20, respawn: 0 });
        }
        scarePeds(peds, player.x, player.y, 240);
        return events | EVENT_PUNCH;
      }
    }
    for (const cop of cops) {
      const d = Math.hypot(cop.x - player.x, cop.y - player.y);
      if (d < range) {
        cop.health -= PLAYER.punchDamage;
        if (cop.health <= 0) {
          cops.splice(cops.indexOf(cop), 1);
          state.cops = cops;
        }
        return events | EVENT_PUNCH;
      }
    }
    return events;
  }

  function shoot(events) {
    if (player.ammo <= 0 || player.shootTimer > 0 || player.car) return events;
    player.ammo -= 1;
    player.shootTimer = PLAYER.shootCooldown;
    const mx = player.aimX - player.x;
    const my = player.aimY - player.y;
    const angle = Math.atan2(my, mx);
    player.angle = angle;
    bullets.push({
      x: player.x + Math.cos(angle) * 20,
      y: player.y + Math.sin(angle) * 20,
      angle,
      speed: PLAYER.bulletSpeed,
      life: 0.9,
      fromPlayer: true,
    });
    addParticles(player.x + Math.cos(angle) * 24, player.y + Math.sin(angle) * 24, '#f2c94c', 4, 120);
    scarePeds(peds, player.x, player.y, 320);
    return events | EVENT_SHOT;
  }

  function useShop(events, actions) {
    // E near a shop with no car nearby: buy ammo at the arms shop, heal at the hospital.
    if (!(actions & 4)) return events;
    if (nearestCar(player.x, player.y, 74)) return events;
    const arms = city.places.arms;
    const hospital = city.places.hospital;
    if (Math.hypot(player.x - arms.x, player.y - arms.y) < 80
      && state.money >= ECONOMY.ammoCost && player.ammo < PLAYER.maxAmmo) {
      state.money -= ECONOMY.ammoCost;
      player.ammo = Math.min(PLAYER.maxAmmo, player.ammo + ECONOMY.ammoAmount);
      return events | EVENT_CASH;
    }
    if (Math.hypot(player.x - hospital.x, player.y - hospital.y) < 80
      && state.money >= ECONOMY.hospitalCost && player.health < PLAYER.health) {
      state.money -= ECONOMY.hospitalCost;
      player.health = PLAYER.health;
      return events | EVENT_CASH;
    }
    return events;
  }

  /**
   * One fixed step. `ctrl` carries the movement vector, driving throttle
   * and steer, the aim point in world coordinates, whether the trigger is
   * held, and the one-shot action flags. Returns an event bitmask.
   */
  function step(dt, ctrl) {
    let events = 0;
    state.elapsed += dt;
    state.timeOfDay = (state.timeOfDay + dt / 240) % 1;
    if (state.over) {
      state.overTimer += dt;
      return events;
    }
    player.aimX = ctrl.aimX;
    player.aimY = ctrl.aimY;
    if (player.shootTimer > 0) player.shootTimer -= dt;
    if (player.punchTimer > 0) player.punchTimer -= dt;
    if (player.hurtTimer > 0) player.hurtTimer -= dt;

    const actions = ctrl.actions || 0;
    if (actions & 4) events = tryEnterCar(events);
    if (actions & 8) events = tryPunch(events);
    events = useShop(events, actions);

    // --- player movement ---
    if (player.car) {
      const car = player.car;
      const throttle = Math.max(-1, Math.min(1, -ctrl.move.y));
      driveCar(car, dt, throttle, ctrl.move.x);
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      player.speed = car.speed;
      // spray shop: drive in to repair and clear the wanted level
      const spray = city.places.spray;
      if (Math.hypot(car.x - spray.x, car.y - spray.y) < 70 && state.money >= ECONOMY.sprayCost
        && (wanted.state.stars > 0 || car.hp === 0)) {
        state.money -= ECONOMY.sprayCost;
        wanted.clear();
        car.hp = 100;
        events |= EVENT_SPRAY;
      }
    } else {
      const speed = ctrl.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const mx = ctrl.move.x;
      const my = ctrl.move.y;
      const len = Math.hypot(mx, my);
      if (len > 0) {
        player.x += (mx / len) * speed * dt;
        player.y += (my / len) * speed * dt;
        if (!ctrl.shooting) player.angle = Math.atan2(my, mx);
        player.speed = speed;
      } else player.speed = 0;
      const body = { x: player.x, y: player.y };
      city.resolveCircle(body, PLAYER.radius);
      player.x = body.x;
      player.y = body.y;
      if (ctrl.shooting) events = shoot(events);
      // slow health regen out of trouble
      if (player.hurtTimer <= 0 && player.health < PLAYER.health) {
        player.health = Math.min(PLAYER.health, player.health + 2 * dt);
      }
    }

    // --- bullets ---
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) {
        const body = { x: b.x, y: b.y };
        if (city.resolveCircle(body, 2)) {
          addParticles(b.x, b.y, '#c9c9c9', 4, 100);
          dead = true;
        }
      }
      if (!dead && b.fromPlayer) {
        for (const ped of peds) {
          if (ped.state === 'down') continue;
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
            if (knockDown(ped, random)) pickups.push({ kind: 'cash', x: ped.x, y: ped.y, value: 20, respawn: 0 });
            scarePeds(peds, b.x, b.y, 260);
            dead = true;
            break;
          }
        }
      }
      if (!dead && b.fromPlayer) {
        for (const car of cars) {
          if (car.driver === 'player') continue;
          if (Math.hypot(car.x - b.x, car.y - b.y) < 26) {
            car.hp = (car.hp || 100) - 34;
            addParticles(b.x, b.y, '#f2c94c', 5, 140);
            if (car.driver === 'police' && car.hp <= 0) {
              car.driver = 'parked';
              car.speed = 0;
              addParticles(car.x, car.y, '#666', 16, 180);
              events |= EVENT_CRASH;
            }
            dead = true;
            break;
          }
        }
      }
      if (dead) bullets.splice(i, 1);
    }

    // --- traffic and police ---
    spawnPolice();
    despawnPolice();
    for (const car of cars) {
      if (car.driver === 'traffic') driveTraffic(car, dt, city, cars, random);
      else if (car.driver === 'police') {
        const dist = drivePolice(car, dt, player);
        if (!player.car && dist < 44 && wanted.state.stars > 0) {
          events = bustPlayer(events);
        }
      }
      if (car.driver !== 'player') {
        const axles = carAxles(car);
        for (const axle of axles) {
          const body = { x: axle.x, y: axle.y };
          if (city.resolveCircle(body, 13)) {
            // push the whole car out by the axle's correction, so it slides
            // along the building instead of driving through it
            car.x += body.x - axle.x;
            car.y += body.y - axle.y;
            car.speed *= 0.6;
            if (Math.abs(car.speed) > 120) {
              addParticles(axle.x, axle.y, '#f2c94c', 3, 90);
              if (car.driver === 'police') events |= EVENT_CRASH;
            }
          }
        }
      }
    }
    // car-vs-car bumps
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        if (collideCars(cars[i], cars[j])) {
          const a = cars[i];
          const b = cars[j];
          const rel = Math.abs(a.speed - b.speed);
          if ((a.driver === 'player' || b.driver === 'player') && rel > 120) {
            events |= EVENT_CRASH;
          }
          // a police ram damages the player's car
          const playerCar = a.driver === 'player' ? a : (b.driver === 'player' ? b : null);
          const policeCar = a.driver === 'police' ? a : (b.driver === 'police' ? b : null);
          if (playerCar && policeCar && rel > 150) {
            playerCar.hp = (playerCar.hp || 100) - 2;
            addParticles(playerCar.x, playerCar.y, '#f2c94c', 6, 120);
          }
        }
      }
    }
    // player car vs buildings and peds
    if (player.car) {
      const car = player.car;
      const axles = carAxles(car);
      for (const axle of axles) {
        const body = { x: axle.x, y: axle.y };
        if (city.resolveCircle(body, 13)) {
          car.x += body.x - axle.x;
          car.y += body.y - axle.y;
          if (Math.abs(car.speed) > 320) {
            events |= EVENT_CRASH;
            car.hp = (car.hp || 100) - 3;
          }
          car.speed *= 0.82;
        }
      }
      if ((car.hp || 100) <= 0) {
        addParticles(car.x, car.y, '#666', 20, 200);
        car.driver = 'parked';
        car.speed = 0;
        player.car = null;
        player.x = car.x + 40;
        player.y = car.y;
        events |= EVENT_CRASH;
      }
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < 30 && Math.abs(car.speed) > 60) {
          if (knockDown(ped, random)) pickups.push({ kind: 'cash', x: ped.x, y: ped.y, value: 20, respawn: 0 });
          scarePeds(peds, car.x, car.y, 260);
          const copNear = cars.some((c) => c.driver === 'police' && Math.hypot(c.x - player.x, c.y - player.y) < 460);
          if (copNear) wanted.add(1);
        }
      }
    }

    // --- on-foot cops chase the player ---
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      const cop = cops[i];
      const d = Math.hypot(player.x - cop.x, player.y - cop.y);
      if (!player.car && d < 700) {
        cop.angle = Math.atan2(player.y - cop.y, player.x - cop.x);
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
        const body = { x: cop.x, y: cop.y };
        city.resolveCircle(body, 10);
        cop.x = body.x;
        cop.y = body.y;
        if (d < 26) events = bustPlayer(events);
      } else if (player.car) {
        // cops give up and walk off when the player drives away
        cops.splice(i, 1);
        state.cops = cops;
      }
    }

    // --- pedestrians ---
    for (const ped of peds) stepPed(ped, dt, city, random);

    // --- pickups ---
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const p = pickups[i];
      if (p.respawn > 0) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          const np = city.randomRoadPoint(player, 400);
          p.x = np.x;
          p.y = np.y;
        }
        continue;
      }
      if (Math.hypot(player.x - p.x, player.y - p.y) < 40) {
        state.money += p.value;
        state.earned += p.value;
        addParticles(p.x, p.y, '#3fae5a', 8, 120);
        p.respawn = 25;
        events |= EVENT_CASH;
      }
    }

    // --- wanted level ---
    const seen = cars.some((c) => c.driver === 'police'
      && Math.hypot(c.x - player.x, c.y - player.y) < WANTED.sight);
    wanted.update(dt, seen, 0);

    // --- missions ---
    const mEvents = missions.update(dt, {
      x: player.x, y: player.y,
      inCar: !!player.car,
      setWanted: (n) => wanted.set(n),
      onPickup: () => { events |= EVENT_CASH; },
      onReward: (reward) => {
        state.money += reward;
        state.earned += reward;
        state.missionsDone += 1;
      },
    });
    for (const e of mEvents) {
      if (e === 'stage') events |= EVENT_STAGE;
      if (e === 'complete') events |= EVENT_MISSION;
      if (e === 'failed') {
        events |= EVENT_FAILED;
        missions.restart(player);
      }
    }
    if (missions.state.done && !state.storyDone) {
      if (!missions.nextMission(player)) {
        state.storyDone = true;
        events |= EVENT_MISSION;
      }
    }

    // --- particles ---
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // --- camera follows the player ---
    const tx = player.x;
    const ty = player.y;
    state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 5);

    return events;
  }

  reset();
  return { state, reset, step, respawn, city, missions, wanted };
}
