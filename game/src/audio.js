// Sound, all synthesized with Web Audio: no audio files, nothing loaded
// over the network. Engine hum, sirens, gunshots, pickups and jingles.
// The context starts on the first user gesture; M mutes everything.
export function createAudio() {
  let context = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;

  function ensure() {
    if (context) return context;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      context = new AC();
    } catch {
      return null;
    }
    return context;
  }

  function tone(freq, dur, type, vol, slideTo) {
    const ctx = ensure();
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol || 0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  function noise(dur, vol, lowpass) {
    const ctx = ensure();
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.2;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      if (muted && engineGain) engineGain.gain.value = 0;
      return muted;
    },
    get muted() { return muted; },
    shoot() { noise(0.12, 0.25, 900); tone(180, 0.08, 'square', 0.06, 60); },
    punch() { noise(0.08, 0.18, 500); },
    pickup() { tone(660, 0.09, 'sine', 0.1); tone(990, 0.14, 'sine', 0.1); },
    cash() { tone(880, 0.08, 'sine', 0.1); tone(1174, 0.08, 'sine', 0.1); tone(1568, 0.16, 'sine', 0.1); },
    mission() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.12), i * 90)); },
    busted() { [392, 311, 233].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sawtooth', 0.08), i * 140)); },
    crash() { noise(0.25, 0.3, 700); },
    /** Continuous engine hum while driving; call every frame with speed. */
    engine(speed, driving) {
      const ctx = ensure();
      if (!ctx) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 60;
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(ctx.destination);
        engineOsc.start();
      }
      const target = muted ? 0 : (driving ? 0.028 + Math.min(0.05, Math.abs(speed) / 9000) : 0);
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 0.16, ctx.currentTime, 0.08);
    },
    /** Two-tone siren while police are close; call every frame. */
    siren(dt, active) {
      if (!active || muted) return;
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.42;
        sirenHigh = !sirenHigh;
        tone(sirenHigh ? 780 : 590, 0.4, 'sine', 0.045);
      }
    },
  };
}
