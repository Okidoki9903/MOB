// Tiny synthesized sound engine: SFX + a looping djembe/balafon groove.
// Everything is generated with WebAudio, so there are no audio files to load.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = {};
    this.killVoice = 0;
    this.musicOn = false;
    this.step = 0;
    this.intensity = 0;
    this.nextTime = 0;
    try { this.muted = localStorage.getItem('pl_muted') === '1'; } catch (e) { /* ignore */ }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      // A gentle limiter keeps crowded fights comfortable on phone speakers.
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -16;
      this.limiter.knee.value = 18;
      this.limiter.ratio.value = 5;
      this.limiter.attack.value = 0.006;
      this.limiter.release.value = 0.18;
      this.master.connect(this.limiter).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.42;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('pl_muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  // rate-limit a sound id to `perSec` plays per second
  gate(id, perSec) {
    if (!this.ctx || this.muted) return false;
    const t = this.ctx.currentTime;
    if (this.last[id] !== undefined && t - this.last[id] < 1 / perSec) return false;
    this.last[id] = t;
    return true;
  }

  tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, when = 0, bus = this.sfxBus) {
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  noiseHit(dur, freq, q = 1, vol = 0.3, type = 'bandpass', when = 0, bus = this.sfxBus) {
    const t = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
    s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  }

  shoot() {
    if (!this.gate('shoot', 14)) return;
    this.tone(520 + Math.random() * 200, 0.07, 'triangle', 0.08, 2.2);
    this.noiseHit(0.05, 3000, 2, 0.05);
  }
  hit() {
    if (!this.gate('hit', 12)) return;
    // Short stone-on-body knock: distinguish an impact from a confirmed kill.
    this.tone(185 + Math.random() * 35, 0.055, 'triangle', 0.11, 0.62);
    this.noiseHit(0.035, 1800, 1.2, 0.09);
  }
  thud() {
    if (!this.gate('thud', 10)) return;
    this.tone(140, 0.12, 'sine', 0.25, 0.5);
    this.noiseHit(0.08, 400, 1, 0.12);
  }
  pop() {
    if (!this.gate('pop', 10)) return;
    // Lower falling impact plus a tiny pitched confirmation reads through a horde.
    const note = [0, 2, 4, 7, 9][this.killVoice++ % 5];
    this.tone(260, 0.12, 'triangle', 0.14, 0.35);
    this.tone(587 * Math.pow(2, note / 12), 0.075, 'sine', 0.075, 1, 0.025);
    this.noiseHit(0.055, 680, 0.8, 0.07, 'lowpass');
  }
  collect(n = 0) {
    if (!this.gate('collect', 20)) return;
    const degrees = [0, 2, 4, 7, 9, 12];
    const f = 660 * Math.pow(2, degrees[Math.abs(Math.floor(n)) % degrees.length] / 12);
    this.tone(f, 0.14, 'sine', 0.13, 1);
    this.tone(f * 2, 0.07, 'sine', 0.035, 1, 0.015);
  }
  big() {
    if (!this.ctx || this.muted) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.18, 1, i * 0.06));
  }
  upgrade() {
    if (!this.ctx || this.muted) return;
    [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, 0.22, 'square', 0.07, 1, i * 0.07));
    this.noiseHit(0.5, 6000, 0.5, 0.08, 'highpass');
  }
  boom() {
    if (!this.gate('boom', 8)) return;
    this.tone(90, 0.45, 'sine', 0.45, 0.35);
    this.noiseHit(0.5, 600, 0.7, 0.35, 'lowpass');
  }
  crack() {
    if (!this.ctx || this.muted) return;
    this.noiseHit(0.6, 1200, 0.6, 0.4, 'lowpass');
    this.tone(70, 0.6, 'sine', 0.5, 0.4);
  }
  hurt() {
    if (!this.gate('hurt', 4)) return;
    this.tone(155, 0.18, 'triangle', 0.2, 0.52);
    this.noiseHit(0.09, 440, 1, 0.12, 'lowpass');
  }
  win() {
    if (!this.ctx || this.muted) return;
    [523, 659, 784, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16, 1, i * 0.12));
    this.tone(131, 0.6, 'sine', 0.13, 1);
    this.tone(262, 0.6, 'sine', 0.1, 1, 0.6);
  }
  lose() {
    if (!this.ctx || this.muted) return;
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.18, 0.98, i * 0.18));
  }
  laugh() {
    if (!this.gate('laugh', 1)) return;
    for (let i = 0; i < 5; i++) this.tone(520 - i * 30, 0.09, 'sawtooth', 0.05, 1.4, i * 0.1);
  }
  roar() {
    if (!this.gate('roar', 1)) return;
    this.tone(110, 0.7, 'sawtooth', 0.12, 0.6);
    this.noiseHit(0.7, 300, 0.8, 0.2, 'lowpass');
  }
  click() {
    if (!this.ctx || this.muted) return;
    this.tone(880, 0.06, 'sine', 0.15, 1.3);
  }

  missionStart() {
    if (!this.gate('missionStart', 0.5)) return;
    this.killVoice = 0;
    this.tone(98, 0.3, 'sine', 0.18, 0.65);
    [392, 494, 587].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.1, 1, 0.1 + i * 0.09));
  }
  wave(index = 0) {
    if (!this.gate('wave', 0.4)) return;
    const base = [196, 220, 246.94, 293.66][Math.abs(Math.floor(Number(index) || 0)) % 4];
    this.tone(base, 0.22, 'triangle', 0.12, 1);
    this.tone(base * 1.5, 0.18, 'triangle', 0.1, 1, 0.13);
    this.noiseHit(0.09, 950, 1, 0.055, 'bandpass', 0.13);
  }
  eliteDown() {
    if (!this.gate('eliteDown', 0.5)) return;
    // One compact victory punctuation per elite, no sustained loop.
    this.tone(130, 0.26, 'sine', 0.22, 0.4);
    [587, 740, 880].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.12, 1, 0.04 + i * 0.08));
  }
  threat(level = 0) {
    if (level < 0.55 || !this.gate('threat', 1 / 2.8)) return;
    // Sparse two-beat warning leaves room for hits and kills.
    const volume = Math.min(0.18, 0.09 + Math.max(0, level) * 0.09);
    this.tone(110, 0.1, 'triangle', volume, 0.7);
    this.tone(98, 0.14, 'triangle', volume * 0.8, 0.65, 0.19);
  }

  setIntensity(value = 0) {
    this.intensity = Math.max(0, Math.min(1, Number(value) || 0));
  }
  boss() {
    if (!this.gate('boss', 0.5)) return;
    [98, 103.83, 98].forEach((f, i) => this.tone(f, 0.65, 'triangle', 0.2, 0.8, i * 0.22));
    this.noiseHit(0.65, 460, 0.7, 0.18, 'lowpass');
  }
  combo(n = 1) {
    if (!this.gate('combo', 4)) return;
    const f = 392 * Math.pow(2, Math.min(12, Math.max(0, n)) / 12);
    [1, 1.5, 2].forEach((ratio, i) => this.tone(f * ratio, 0.19, 'sine', 0.1, 1, i * 0.045));
  }
  shield() {
    if (!this.gate('shield', 4)) return;
    this.tone(740, 0.3, 'sine', 0.13, 1.5);
    this.tone(1110, 0.35, 'sine', 0.07, 1.2, 0.04);
  }
  dash() {
    if (!this.gate('dash', 3)) return;
    this.noiseHit(0.18, 1800, 0.5, 0.12, 'bandpass');
    this.tone(260, 0.14, 'triangle', 0.08, 2.8);
  }

  // ------------------------------------------------ music (djembe + balafon)
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setTargetAtTime(0.42, this.ctx.currentTime, 0.12);
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    const tick = () => {
      if (!this.musicOn) return;
      // Resume from a background tab without walking through minutes of missed beats.
      if (this.nextTime < this.ctx.currentTime - 0.3) this.nextTime = this.ctx.currentTime + 0.03;
      while (this.nextTime < this.ctx.currentTime + 0.25) {
        this.playStep(this.step, this.nextTime - this.ctx.currentTime);
        this.nextTime += 60 / 118 / 3; // 12/8 feel: triplet subdivisions
        this.step = (this.step + 1) % 48;
      }
      this.musicTimer = setTimeout(tick, 60);
    };
    tick();
  }
  stopMusic() {
    this.musicOn = false;
    clearTimeout(this.musicTimer);
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.09);
  }
  playStep(s, when) {
    if (when < 0) return;
    const b = s % 12;
    const mb = this.musicBus;
    // bass (dun)
    if (b === 0 || b === 7) this.tone(82, 0.28, 'sine', 0.55, 0.55, when, mb);
    // djembe tone / slap
    if ([3, 5, 9, 11].includes(b)) this.tone(210, 0.1, 'sine', 0.22, 0.7, when, mb);
    if ([4, 10].includes(b)) this.noiseHit(0.08, 2200, 1.2, 0.2, 'bandpass', when, mb);
    // shaker
    if (b % 2 === 1) this.noiseHit(0.03, 8000, 0.8, 0.05, 'highpass', when, mb);
    // Extra low percussion opens up as the wave grows, without changing tempo.
    if (this.intensity > 0.35 && [2, 8].includes(b)) this.tone(125, 0.13, 'sine', 0.16 * this.intensity, 0.65, when, mb);
    if (this.intensity > 0.7 && b === 11) this.noiseHit(0.07, 3400, 0.8, 0.09, 'bandpass', when, mb);
    // balafon melody (pentatonic)
    const mel = [0, -1, 2, -1, 4, 2, -1, 7, -1, 4, 2, -1, 9, -1, 7, 4, -1, 2, 4, -1, 2, 0, -1, -1,
      0, -1, 2, -1, 4, 7, -1, 9, -1, 7, 4, -1, 2, -1, 4, 2, -1, 0, -1, 2, -1, 0, -1, -1];
    const n = mel[s];
    if (n >= 0) {
      const f = 392 * Math.pow(2, n / 12);
      this.tone(f, 0.18, 'triangle', 0.09, 1, when, mb);
      this.tone(f * 2, 0.08, 'sine', 0.04, 1, when, mb);
    }
  }
}
