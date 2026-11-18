// Missions and the story: six jobs from Vera, the fixer who runs Solmar's
// back streets. Each mission is a chain of stages — go somewhere, pick
// something up, carry someone, survive the heat — with a reward at the end.
// The module owns the mission state; the world feeds it the player's
// position and car each step and reads back the current objective.
export const MISSIONS = [
  {
    id: 'wheels',
    title: 'First Wheels',
    giver: 'Vera',
    briefing: 'You need wheels, Rook. Take any car on the street and bring it to the spray shop.',
    reward: 250,
    stages: [
      { kind: 'steal', label: 'Steal a car (press E near one)' },
      { kind: 'goto', place: 'spray', label: 'Drive to the spray shop' },
    ],
  },
  {
    id: 'cash',
    title: 'Cash Run',
    giver: 'Vera',
    briefing: 'Three bags of cash are stashed around the city. Collect them all and bring them home.',
    reward: 400,
    stages: [
      { kind: 'pickup', count: 3, label: 'Collect the cash bags' },
      { kind: 'goto', place: 'safehouse', label: 'Bring the cash to the safehouse' },
    ],
  },
  {
    id: 'courier',
    title: 'Courier',
    giver: 'Vera',
    briefing: 'My courier is waiting by the docks road. Pick him up in a car and get him to the marina. The cops are watching, so expect heat.',
    reward: 600,
    stages: [
      { kind: 'person', place: 'courier', label: 'Pick up the courier (be in a car)' },
      { kind: 'goto', place: 'marina', label: 'Drive the courier to the marina', wanted: 2 },
    ],
  },
  {
    id: 'heat',
    title: 'Heat Wave',
    giver: 'Vera',
    briefing: 'The whole force is after you. Stay out of their hands for 40 seconds, then lose them at the spray shop.',
    reward: 500,
    stages: [
      { kind: 'survive', seconds: 40, label: 'Survive the heat — 40 seconds', wanted: 3 },
      { kind: 'goto', place: 'spray', label: 'Lose the cops at the spray shop' },
    ],
  },
  {
    id: 'drop',
    title: 'The Drop',
    giver: 'Vera',
    briefing: 'A package for the warehouse, across town. Seventy-five seconds, no excuses.',
    reward: 700,
    stages: [
      { kind: 'goto', place: 'warehouse', label: 'Deliver the package to the warehouse', time: 75 },
    ],
  },
  {
    id: 'king',
    title: 'King of Solmar',
    giver: 'Vera',
    briefing: 'Last job. Three packages, the whole city watching, and the pier at the end of it. Do this and Solmar is yours.',
    reward: 1500,
    stages: [
      { kind: 'pickup', count: 3, label: 'Collect the three packages', wanted: 3 },
      { kind: 'goto', place: 'pier', label: 'Deliver everything to the pier' },
    ],
  },
];

export function createMissions(random, city) {
  const state = {
    index: 0,
    stage: 0,
    bags: [],
    timer: 0,
    surviveLeft: 0,
    courierAboard: false,
    done: false,
    banner: '',
    bannerTimer: 0,
  };

  function mission() {
    return MISSIONS[state.index];
  }

  function stage() {
    return mission().stages[state.stage];
  }

  /** Where the current stage wants the player to be, if anywhere. */
  function target() {
    const st = stage();
    if (!st) return null;
    if (st.kind === 'steal' || st.kind === 'survive') return null;
    if (st.place) {
      const p = city.places[st.place];
      return { x: p.x, y: p.y, label: st.label, kind: st.kind };
    }
    if (st.kind === 'pickup') {
      const bag = state.bags.find((b) => !b.taken);
      if (bag) return { x: bag.x, y: bag.y, label: st.label, kind: 'pickup' };
    }
    return { x: 0, y: 0, label: st.label, kind: st.kind };
  }

  function spawnBags(count, near) {
    state.bags = [];
    for (let i = 0; i < count; i += 1) {
      const p = city.randomRoadPoint(near, 500);
      state.bags.push({ x: p.x, y: p.y, taken: false });
    }
  }

  function startStage(near) {
    const st = stage();
    state.timer = st.time || 0;
    state.surviveLeft = st.seconds || 0;
    if (st.kind === 'pickup') spawnBags(st.count, near);
    if (st.kind === 'person') state.courierAboard = false;
  }

  function startMission(index, near) {
    state.index = index;
    state.stage = 0;
    state.done = false;
    startStage(near);
    showBanner(`${mission().title} — ${mission().giver}`, 3);
  }

  function showBanner(text, seconds) {
    state.banner = text;
    state.bannerTimer = seconds;
  }

  /**
   * One step. `ctx` carries the player's position, whether they are in a
   * car, and a function to read or set the wanted level. Returns an array
   * of events: 'stage' | 'complete' | 'failed'.
   */
  function update(dt, ctx) {
    const events = [];
    if (state.done || state.index >= MISSIONS.length) return events;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    const st = stage();
    if (!st) return events;
    if (st.wanted !== undefined && ctx.setWanted) ctx.setWanted(st.wanted);

    if (st.time) {
      state.timer -= dt;
      if (state.timer <= 0) {
        events.push('failed');
        showBanner('Too slow — the job fell through', 3);
        return events;
      }
    }
    if (st.kind === 'survive') {
      state.surviveLeft -= dt;
      if (state.surviveLeft <= 0) {
        events.push('stage');
        advance(ctx);
        return events;
      }
      return events;
    }
    if (st.kind === 'steal') {
      if (ctx.inCar) {
        events.push('stage');
        advance(ctx);
      }
      return events;
    }
    if (st.kind === 'person') {
      const p = city.places[st.place];
      const d = Math.hypot(ctx.x - p.x, ctx.y - p.y);
      if (d < 70 && ctx.inCar) {
        state.courierAboard = true;
        events.push('stage');
        advance(ctx);
      }
      return events;
    }
    if (st.kind === 'pickup') {
      for (const bag of state.bags) {
        if (bag.taken) continue;
        if (Math.hypot(ctx.x - bag.x, ctx.y - bag.y) < 44) {
          bag.taken = true;
          events.push('stage');
          if (ctx.onPickup) ctx.onPickup(bag);
          if (state.bags.every((b) => b.taken)) advance(ctx);
          return events;
        }
      }
      return events;
    }
    // goto / deliver
    const t = target();
    if (t && Math.hypot(ctx.x - t.x, ctx.y - t.y) < 64) {
      events.push('stage');
      advance(ctx);
    }
    return events;
  }

  function advance(ctx) {
    state.stage += 1;
    if (state.stage >= mission().stages.length) {
      const reward = mission().reward;
      state.done = true;
      if (ctx.onReward) ctx.onReward(reward);
      showBanner(`${mission().title} complete — $${reward}`, 4);
      return;
    }
    startStage({ x: ctx.x, y: ctx.y });
  }

  /** Start the next mission, or report that the story is finished. */
  function nextMission(near) {
    if (state.index + 1 >= MISSIONS.length) return false;
    startMission(state.index + 1, near);
    return true;
  }

  /** Restart the current mission from its first stage. */
  function restart(near) {
    startMission(state.index, near);
  }

  startMission(0, { x: 0, y: 0 });
  return {
    state, mission, stage, target, update, nextMission, restart, startMission,
    showBanner,
  };
}
