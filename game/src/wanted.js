// The wanted level: stars the player earns by committing crimes in sight
// of the law, and the police response they buy. Stars drop one at a time
// after the player stays out of every cop's sight for a while; the spray
// shop clears them at once, for cash.
import { WANTED } from './config.js';

export function createWanted() {
  const state = { stars: 0, unseen: 0, heat: 0 };

  /** Add stars, up to the maximum. */
  function add(n) {
    state.stars = Math.min(WANTED.max, state.stars + n);
    state.unseen = 0;
  }

  function set(n) {
    if (n > state.stars) state.stars = Math.min(WANTED.max, n);
    if (n > 0) state.unseen = 0;
  }

  function clear() {
    state.stars = 0;
    state.unseen = 0;
  }

  /** How many police cars should be on the map right now. */
  function policeCarsNeeded() {
    return WANTED.policeCars[state.stars];
  }

  /**
   * One step. `seen` is true when any cop can see the player this step.
   * `crime` is a fresh crime the player just committed (stealing a car in
   * view, shooting, running someone over).
   */
  function update(dt, seen, crime) {
    if (crime) add(crime);
    if (state.stars === 0) return;
    if (seen) state.unseen = 0;
    else {
      state.unseen += dt;
      if (state.unseen >= WANTED.decaySeconds) {
        state.stars -= 1;
        state.unseen = 0;
      }
    }
  }

  return { state, add, set, clear, policeCarsNeeded, update };
}
