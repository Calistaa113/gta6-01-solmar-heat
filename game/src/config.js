// Every tuning number, colour and city constant in one place. The world is a
// fixed-size city (WORLD_W x WORLD_H) drawn by a camera that follows the
// player; the simulation runs in fixed 1/60 s steps whatever the display rate.
export const STEP = 1 / 60;

/** The city: a grid of roads every ROAD_EVERY apart, blocks holding buildings. */
export const WORLD = { width: 3600, height: 2600 };
export const ROAD_EVERY = 400;
export const ROAD_HALF = 34; // half-width of a road, kerb to kerb
export const LANE = 16; // lane offset from a road's centre line
export const BLOCK = ROAD_EVERY - ROAD_HALF * 2;

/** Logical viewport the renderer scales to the window. */
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  runSpeed: 330,
  health: 100,
  punchDamage: 34,
  punchRange: 34,
  punchArc: 1.1,
  shootCooldown: 0.22,
  bulletSpeed: 900,
  startAmmo: 24,
  maxAmmo: 120,
};

export const CAR = {
  length: 54,
  width: 26,
  // Per-type: top speed, acceleration, grip (turn rate), colour set.
  types: {
    sedan: { top: 430, accel: 300, turn: 2.6, colors: ['#c94f43', '#4a7fb5', '#c9a13b', '#7d8a99'] },
    taxi: { top: 400, accel: 280, turn: 2.7, colors: ['#e8b93a'] },
    sports: { top: 560, accel: 430, turn: 3.4, colors: ['#d21f3c', '#1fd2b5', '#f2f2f2'] },
    truck: { top: 330, accel: 200, turn: 2.0, colors: ['#8a7d6b', '#5d7d5a'] },
    police: { top: 500, accel: 380, turn: 3.1, colors: ['#222831'] },
  },
};

export const TRAFFIC = { count: 34, minGap: 90, spawnMargin: 500 };
export const PEDS = { count: 46, walkSpeed: 55, fleeSpeed: 150 };

export const WANTED = {
  max: 5,
  // seconds of staying out of every cop's sight before one star drops
  decaySeconds: 26,
  // police cars on the map per wanted level (index = stars)
  policeCars: [0, 1, 2, 3, 4, 6],
  // how far a cop can see the player, in pixels
  sight: 520,
};

export const ECONOMY = {
  startMoney: 120,
  sprayCost: 150,
  ammoCost: 60,
  ammoAmount: 36,
  bustFine: 200,
  hospitalCost: 120,
};

export const PALETTE = {
  grass: '#7fae5a',
  park: '#6da34e',
  sand: '#d9c48f',
  water: '#2f6f9e',
  road: '#3c3f46',
  roadLine: '#d8c95a',
  kerb: '#9a9a92',
  sidewalk: '#b9b3a4',
  building: '#8d7f74',
  buildingRoof: '#a89a8a',
  buildingGlass: '#5d7d8a',
  downtown: '#7a6a72',
  player: '#f2c94c',
  cop: '#2f6fd0',
  copCar: '#e8e8e8',
  hud: '#101318',
  text: '#f2f0e6',
  muted: '#b9b3a4',
  red: '#d23b2e',
  green: '#3fae5a',
  gold: '#e8b93a',
  mission: '#ff9f1c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best run is kept between visits (this browser only). */
export const SAVE_KEY = 'solmar-heat.save.v1';

export const GAME_NAME = 'Solmar Heat';
export const CITY_NAME = 'Solmar';
