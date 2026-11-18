// Boot and the one loop for Solmar Heat: input is read every frame, the
// world advances in fixed 1/60 s steps (several in a slow frame, none in a
// fast one), and the renderer paints what is there. The game moves between
// four screens: title, play, paused and busted/down.
//
// ?seed=N fixes the city, traffic and missions. ?shot=start|play|chase|end
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BUSTED, EVENT_CASH, EVENT_CRASH, EVENT_DOWN, EVENT_FAILED,
  EVENT_MISSION, EVENT_PUNCH, EVENT_SHOT, EVENT_SPRAY, EVENT_STAGE,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const world = createWorld(random);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? 'null');
    if (parsed && typeof parsed.best === 'number') return parsed;
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
  return { best: 0, missions: 0 };
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // see readSave
  }
}

function runShot(name) {
  const scene = stageShot(name, world, random);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.save, world.state.elapsed);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Vera has a job for you — check the objective at the top.');
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_STAGE) audio.pickup();
    if (events & EVENT_MISSION) audio.mission();
    if (events & EVENT_FAILED) audio.busted();
    if (events & EVENT_SPRAY) audio.pickup();
    if (events & EVENT_BUSTED) {
      audio.busted();
      announce('Busted. The police took their fine.');
    }
    if (events & EVENT_DOWN) {
      audio.busted();
      announce('Down. You wake up at the hospital.');
    }
    if (world.state.earned > save.best) {
      save = { best: world.state.earned, missions: Math.max(save.missions, world.state.missionsDone) };
      writeSave(save);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      if (screen === SCREEN_OVER) world.respawn();
      startGame();
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function buildCtrl(actions) {
    const move = input.move();
    const rect = canvas.getBoundingClientRect();
    const aim = renderer.screenToWorld(
      input.mouse.x + rect.left, input.mouse.y + rect.top,
      world.state.camera.x, world.state.camera.y,
    );
    return {
      move,
      run: input.held.run,
      aimX: aim.x,
      aimY: aim.y,
      shooting: input.mouse.down,
      actions,
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions() || 0;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        if (screen === SCREEN_TITLE) {
          world.step(STEP, { move: { x: 0, y: 0 }, run: false, aimX: 0, aimY: 0, shooting: false, actions: 0 });
        } else {
          const events = world.step(STEP, buildCtrl(actions));
          handleEvents(events);
          if (world.state.over) screen = SCREEN_OVER;
        }
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const player = world.state.player;
    audio.engine(player.car ? player.car.speed : 0, !!player.car);
    const policeNear = world.state.cars.some((c) => c.driver === 'police'
      && Math.hypot(c.x - player.x, c.y - player.y) < 520);
    audio.siren(STEP, policeNear && world.state.wanted.state.stars > 0);
    renderer.draw(world.state, screen, save, world.state.elapsed);
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
