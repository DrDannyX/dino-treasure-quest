// 16-bit style music + sound effects, synthesised live with the Web Audio API.
// Songs are written as 16th-note steps: a note name ("C5", "F#4"), "-" to hold
// the previous note, or "." for silence. Pads, arpeggios and bass lines are
// generated from each song's chord list.

const NOTE_IDX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

function midiOf(tok) {
  if (typeof tok === 'number') return tok;
  if (/^\d+$/.test(tok)) return +tok;
  const m = /^([A-G][#b]?)(\d)$/.exec(tok);
  return m ? (+m[2] + 1) * 12 + NOTE_IDX[m[1]] : null;
}
const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);

const CHORDS = {
  C: ['C', 'E', 'G'], D: ['D', 'F#', 'A'], E: ['E', 'G#', 'B'], F: ['F', 'A', 'C'], G: ['G', 'B', 'D'],
  A: ['A', 'C#', 'E'], B: ['B', 'D#', 'F#'], Bb: ['Bb', 'D', 'F'], Ab: ['Ab', 'C', 'Eb'],
  Am: ['A', 'C', 'E'], Dm: ['D', 'F', 'A'], Em: ['E', 'G', 'B'], Gm: ['G', 'Bb', 'D'], Cm: ['C', 'Eb', 'G'],
};

// Chord tones as ascending midi numbers starting at octave `oct`.
function chordMidi(name, oct) {
  const out = [];
  for (const n of CHORDS[name]) {
    let m = (oct + 1) * 12 + NOTE_IDX[n];
    while (out.length && m <= out[out.length - 1]) m += 12;
    out.push(m);
  }
  return out;
}

const BASS = {
  drive: ([r, , f]) => [r, '.', r, '.', r + 12, '.', r, '.', r, '.', r, '.', f, '.', r + 12, '.'],
  bounce: ([r, , f]) => [r, '-', '.', r + 12, '.', r, f, '.', r, '-', '.', r + 12, '.', f, r + 12, '.'],
  walk: ([r, t, f]) => [r, '-', '-', '.', t, '-', '-', '.', f, '-', '-', '.', r + 12, '-', f, '.'],
  slow: ([r, , f]) => [r, '-', '-', '-', '-', '-', '.', '.', f, '-', '-', '.', r + 12, '-', '-', '.'],
  // Driving 16th notes for the fast, scary tracks.
  pump: ([r, , f]) => [r, r, r + 12, r, r, r, r + 12, r, r, r, r + 12, r, f, f, r + 12, f],
  // Heavy, stomping hits.
  stomp: ([r, , f]) => [r, '-', '.', r, '.', '.', r, '.', r, '-', '.', r, f, '.', r + 12, '.'],
};

// A deep sub-bass hit on the chord's root under every kick drum.
function subBar(chord, drumBar) {
  const root = chordMidi(chord, 1)[0];
  return drumBar.map(d => (d === 'k' ? root : '.'));
}

const ARP = {
  up: ([a, b, c]) => [a, '.', b, '.', c, '.', a + 12, '.', c, '.', b, '.', a, '.', b, '.'],
  pulse: ([a, b, c]) => ['.', '.', b, '.', '.', '.', c, '.', '.', '.', b, '.', '.', '.', c, '.'],
  sparkle: ([a, b, c]) => [a + 12, c, b, a, a + 12, c, b, a, a + 12, c, b, a, a + 12, c, b, a],
};

const DRUMS = {
  march: 'k . h . s . h . k . h k s . h h',
  jungle: 'k . t . s t . t k . t t s . t .',
  rock: 'k . h . s . h . k k h . s . h h',
  gentle: 'k . . . h . . k k . . . h . h .',
  fast: 'k h s h k h s h k h s h k k s c',
  none: '. . . . . . . . . . . . . . . .',
};

// Extra bongo layer played over any song while someone is riding a dinosaur.
const RIDE_LAYER = 't . t t . t t . t . t t . t . t';

const SONGS = {
  title: {
    bpm: 126, chords: 'Dm C Dm Bb Dm C Bb Am', drums: 'march', bass: 'walk', arp: 'up', heavy: false,
    lead: `C5 - - . F5 - - . A5 - G5 - F5 - C6 -
           C6 - - - - - . . G5 - A5 - G5 - E5 -
           D5 - - . F5 - - . A5 - G5 - F5 - D6 -
           D6 - - - C6 - Bb5 - A5 - - - G5 - - -
           A5 - - . A5 . Bb5 . C6 - - - A5 - F5 -
           G5 - - . G5 . A5 . Bb5 - - - G5 - E5 -
           F5 - - . G5 . A5 . Bb5 - - - D6 - - -
           C6 - - - - - - - C6 . Bb5 . A5 . G5 .`,
  },
  select: {
    bpm: 120, chords: 'C G Am F', drums: 'gentle', bass: 'bounce', arp: 'pulse',
    lead: `G5 . E5 . C5 . E5 . G5 . C6 . . . . .
           B5 . G5 . D5 . G5 . B5 . D6 . . . . .
           C6 . A5 . E5 . A5 . C6 . E6 . . . . .
           F6 - - . E6 . D6 . C6 - - - . . . .`,
  },
  jungle: {
    bpm: 140, chords: 'G Em C D G Em C D', drums: 'jungle', bass: 'bounce', arp: 'up',
    lead: `B4 . D5 . G5 . B5 . A5 . G5 . D5 . . .
           E5 . G5 . B5 . E6 . D6 . B5 . G5 . . .
           C6 . B5 . G5 . E5 . G5 . A5 . B5 . C6 .
           D6 - - . A5 . F#5 . D5 - - . E5 . F#5 .
           G5 . G5 . B5 . D6 . G6 - - . F#6 . E6 .
           D6 . B5 . G5 . B5 . E6 - - . D6 . B5 .
           C6 . E6 . G6 . E6 . C6 . A5 . G5 . E5 .
           F#5 - - . A5 . D6 . F#6 - - - - . . .`,
  },
  volcano: {
    bpm: 150, chords: 'Em Em C D Em Em C B', drums: 'rock', bass: 'pump', arp: 'sparkle',
    lead: `E5 . E5 . G5 . E5 . B5 - - . A5 . G5 .
           F#5 . G5 . A5 . G5 . F#5 - E5 - - - . .
           E5 . E5 . G5 . C6 . B5 - - . A5 . G5 .
           F#5 . A5 . D6 . C6 . B5 - - . A5 . F#5 .
           B5 . . B5 . . E6 . D6 . B5 . G5 . E5 .
           G5 . A5 . B5 . A5 . G5 - F#5 - E5 - - .
           C6 . . C6 . . E6 . D6 . C6 . B5 . A5 .
           B5 - - - D#6 - - - F#6 - - - B5 - - .`,
  },
  swamp: {
    bpm: 110, chords: 'Dm Bb Gm A Dm Bb Gm A', drums: 'gentle', bass: 'slow', arp: 'pulse',
    lead: `D5 - - . F5 - . A5 - - . G5 - F5 - .
           D5 - - . F5 - . Bb5 - - . A5 - G5 - .
           G5 - - . Bb5 - . D6 - - . C6 - Bb5 - .
           A5 - - - C#6 - - - E6 - - - . . . .
           F5 . E5 . D5 . A4 . D5 . F5 . A5 - - .
           Bb5 . A5 . G5 . F5 . D5 . F5 . Bb5 - - .
           D6 - - . C6 . Bb5 . G5 - - . A5 . Bb5 .
           A5 - - - E5 - - - C#5 - - - A4 - - -`,
  },
  boss: {
    bpm: 168, chords: 'Cm Cm Ab Bb Cm Cm Ab G', drums: 'fast', bass: 'pump', arp: 'sparkle',
    lead: `C5 C5 . C5 Eb5 . C5 . G5 . F5 . Eb5 . D5 .
           C5 C5 . C5 Eb5 . G5 . C6 - - . B5 . G5 .
           Ab5 . G5 . F5 . Eb5 . C5 . Eb5 . Ab5 . C6 .
           Bb5 . Ab5 . G5 . F5 . D5 . F5 . Bb5 . D6 .
           Eb6 . D6 . C6 . G5 . Eb5 . G5 . C6 . Eb6 .
           D6 . C6 . B5 . C6 . G5 - - . . . . .
           C6 . Eb6 . Ab6 . Eb6 . C6 . Ab5 . Eb5 . C5 .
           B4 . D5 . G5 . B5 . D6 - - . B5 . G5 .`,
  },
  treasure: {
    bpm: 120, chords: 'C Am F G C Am Dm G', drums: 'march', bass: 'stomp', arp: 'up',
    lead: `E5 - - . G5 - - . C6 - - - E6 - - -
           C6 - - . A5 - - . E5 - - - A5 - - -
           A5 - - . C6 - - . F6 - - - E6 - D6 -
           D6 - - - B5 - - - G5 - - - - - - -
           E6 - - . D6 . C6 . G5 - - . C6 . E6 .
           E6 - - . D6 . C6 . A5 - - . C6 . E6 .
           F6 - - . E6 . D6 . A5 - - . D6 . F6 .
           G6 - - - - - - - G5 . A5 . B5 . D6 .`,
  },
};

const JINGLES = {
  clear: { bpm: 180, lead: 'G5 C6 E6 G6 - - E6 - G6 - - - - . . . A6 - - - G6 - - - E6 - - - G6 - - - - - - - - - - . . .', bass: 'C3 - - - - - - - - - - - - . . . F3 - - - - - - - G3 - - - - - - - C3 - - - - - - - - - - . . .' },
  wipe: { bpm: 130, lead: 'A5 G#5 G5 F#5 F5 - - . C5 - - . F4 - - - - - - .', bass: 'F3 - - - - - - - - - - - F2 - - - - - - .' },
  gameover: { bpm: 100, lead: 'E5 - - C5 - - A4 - - - . B4 - C5 - A4 - - - - - - - .', bass: 'A2 - - - - - - - - - - E2 - - - A2 - - - - - - - .' },
  treasure: { bpm: 160, lead: 'C5 E5 G5 C6 E6 G6 C7 - - - . . G6 - C7 - E7 - - - - - - - - - - - . .', bass: 'C3 - - - - - - - - - - - G2 - - - C3 - - - - - - - - - - - . .' },
};

// Everything the music box can play, in order.
export const TRACKS = [
  { name: 'TITLE THEME', song: 'title' },
  { name: 'CHOOSE YOUR HERO', song: 'select' },
  { name: 'FERN JUNGLE', song: 'jungle' },
  { name: 'VOLCANO VALLEY', song: 'volcano' },
  { name: 'MISTY SWAMP', song: 'swamp' },
  { name: 'T-REX SHOWDOWN', song: 'boss' },
  { name: 'TREASURE FOUND', song: 'treasure' },
  { name: 'MAP PIECE', jingle: 'clear' },
  { name: 'TREASURE CHEST', jingle: 'treasure' },
  { name: 'OH NO!', jingle: 'wipe' },
  { name: 'GAME OVER', jingle: 'gameover' },
];

function tokens(str) {
  return str.trim().split(/\s+/);
}

// Sustained chord: each chord tone held for the whole bar.
function padBars(bars) {
  const voices = [[], [], []];
  for (const ch of bars) {
    const notes = chordMidi(ch, 4);
    notes.forEach((m, i) => voices[i].push(m, ...Array(14).fill('-'), '.'));
  }
  return voices;
}

// Songs are "heavy" (sub-bass, gritty bass, pumping kick) unless they say otherwise.
function compileSong(s) {
  const bars = s.chords.split(' ');
  const drumBar = tokens(DRUMS[s.drums]);
  const pads = padBars(bars);
  const heavy = s.heavy !== false;
  return {
    bpm: s.bpm,
    heavy,
    channels: [
      { kind: 'lead', steps: tokens(s.lead) },
      ...pads.map(steps => ({ kind: 'pad', steps })),
      { kind: 'arp', steps: bars.flatMap(b => ARP[s.arp](chordMidi(b, 4))) },
      { kind: heavy ? 'bass' : 'softBass', steps: bars.flatMap(b => BASS[s.bass](chordMidi(b, 2))) },
      ...(heavy ? [{ kind: 'sub', steps: bars.flatMap(b => subBar(b, drumBar)) }] : []),
      { kind: 'drums', steps: bars.flatMap(() => drumBar) },
    ],
  };
}

function compileJingle(j) {
  const channels = [{ kind: 'lead', steps: tokens(j.lead) }];
  if (j.bass) channels.push({ kind: 'bass', steps: tokens(j.bass) });
  return { bpm: j.bpm, channels };
}

export function songBars() {
  return Object.fromEntries(Object.entries(SONGS).map(([k, v]) => [k, [tokens(v.lead).length / 16, v.chords.split(' ').length]]));
}

// Instrument presets: oscillators (with detune in cents), envelope and filter.
const INSTR = {
  lead: { osc: [['pulse25', 0, 1], ['sawtooth', 6, 0.35]], vol: 0.075, a: 0.01, d: 0.2, s: 0.7, r: 0.1, cut: 3800, vib: 5 },
  pad: { osc: [['sawtooth', -9, 1], ['sawtooth', 9, 1]], vol: 0.016, a: 0.12, d: 0.3, s: 0.8, r: 0.3, cut: 1400 },
  arp: { osc: [['pulse12', 0, 1], ['sine', 1200, 0.5]], vol: 0.035, a: 0.002, d: 0.14, s: 0.05, r: 0.06, cut: 5000 },
  // Gritty saw + sub-octave square, with a filter that snaps shut for a thump.
  bass: { osc: [['sawtooth', 0, 0.7], ['square', -1200, 0.55], ['triangle', 0, 0.8]], vol: 0.15, a: 0.004, d: 0.16, s: 0.55, r: 0.06, cut: 700, cutEnv: 2600 },
  // The original, gentler bass (used by the title theme).
  softBass: { osc: [['triangle', 0, 1], ['square', 0, 0.22]], vol: 0.16, a: 0.005, d: 0.12, s: 0.75, r: 0.05, cut: 1100 },
  // Sine sub-bass, plus a quiet overtone so small speakers can still hear it.
  sub: { osc: [['sine', 0, 1], ['triangle', 1200, 0.3]], vol: 0.32, a: 0.003, d: 0.2, s: 0.25, r: 0.08, cut: 500 },
  bell: { osc: [['sine', 0, 1], ['sine', 1200, 0.4], ['sine', 2400, 0.2]], vol: 0.09, a: 0.002, d: 0.5, s: 0.1, r: 0.2, cut: 8000 },
};

const MASTER_VOL = 0.9;

class Synth {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.song = null;
    this.pending = null;
    this.paused = false;
    this.layer = false;
    this.compiled = {};
    this.events = [];
  }

  // Call from inside a user gesture (tap, click or key press). On iOS the
  // context is only reliably allowed to start if it is created, resumed and
  // made to play something during a gesture the browser accepts, so keep
  // trying on every gesture until it is running. Safari's Web Audio follows
  // the iPhone's silent switch by default.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.build(new AC());
    }
    if (this.ctx.state !== 'running') {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(() => {});
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      src.connect(this.ctx.destination);
      src.start(0);
    }
  }

  // Outside a gesture (e.g. returning to the tab) we can only ask nicely.
  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  build(c) {
    this.ctx = c;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    limiter.connect(c.destination);
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOL;
    this.master.connect(limiter);
    // A feedback echo gives the warm "16-bit console" space.
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.19;
    const fb = c.createGain();
    fb.gain.value = 0.3;
    const damp = c.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2400;
    const wet = c.createGain();
    wet.gain.value = 0.28;
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(wet).connect(this.master);
    this.echo = delay;
    this.music = c.createGain();
    this.music.gain.value = 0.75;
    this.music.connect(this.master);
    this.music.connect(delay);
    // Melody, chords and arpeggios dip on every kick so the beat pumps.
    this.duck = c.createGain();
    this.duck.connect(this.music);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);
    const sfxSend = c.createGain();
    sfxSend.gain.value = 0.35;
    this.sfxBus.connect(sfxSend).connect(delay);
    this.waves = { pulse12: this.pulse(0.125), pulse25: this.pulse(0.25), pulse50: this.pulse(0.5) };
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    setInterval(() => this.schedule(), 25);
    if (this.pending) {
      const name = this.pending;
      this.pending = null;
      this.playSong(name);
    }
  }

  pulse(duty) {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      re[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
      im[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
    }
    return this.ctx.createPeriodicWave(re, im);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : MASTER_VOL;
    return this.muted;
  }

  osc(type, freq, t) {
    const o = this.ctx.createOscillator();
    if (this.waves[type]) o.setPeriodicWave(this.waves[type]);
    else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    return o;
  }

  // Play one note with an instrument preset.
  play(t, freq, dur, inst, dest, volMul = 1) {
    const c = this.ctx, p = INSTR[inst];
    const g = c.createGain();
    const v = p.vol * volMul;
    const end = t + dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + p.a);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, v * p.s), t + p.a + p.d);
    g.gain.setValueAtTime(Math.max(0.0001, v * p.s), Math.max(t + p.a + p.d, end));
    g.gain.exponentialRampToValueAtTime(0.0001, Math.max(t + p.a + p.d, end) + p.r);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    if (p.cutEnv) {
      f.frequency.setValueAtTime(p.cutEnv, t);
      f.frequency.exponentialRampToValueAtTime(p.cut, t + p.a + p.d);
    } else f.frequency.value = p.cut;
    f.connect(g).connect(dest);
    const stop = Math.max(t + p.a + p.d, end) + p.r + 0.02;
    let lfo = null;
    if (p.vib && dur > 0.2) {
      lfo = c.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = c.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(freq * 0.006 * p.vib / 5, t + Math.min(0.3, dur));
      lfo.connect(depth);
      lfo.start(t);
      lfo.stop(stop);
      lfo.depth = depth;
    }
    for (const [type, cents, mul] of p.osc) {
      const o = this.osc(type, freq * Math.pow(2, cents / 1200), t);
      if (lfo) lfo.depth.connect(o.frequency);
      const og = c.createGain();
      og.gain.value = mul;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(stop);
    }
  }

  tone(t, freq, dur, wave, vol, dest, slideTo) {
    const o = this.osc(wave, freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol * 0.8, t + Math.max(0.01, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hiss(t, dur, vol, dest, filter = 'highpass', freq = 5000, q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  drum(kind, t) {
    const out = this.music;
    switch (kind) {
      case 'k':
        if (this.song && this.song.data.heavy === false) {
          this.tone(t, 150, 0.16, 'sine', 0.55, out, 42);
          this.hiss(t, 0.02, 0.12, out, 'lowpass', 3000);
          break;
        }
        this.tone(t, 170, 0.2, 'sine', 0.75, out, 38);
        this.tone(t, 900, 0.02, 'triangle', 0.25, out, 200);
        this.hiss(t, 0.02, 0.14, out, 'lowpass', 3000);
        this.duck.gain.setValueAtTime(0.5, t);
        this.duck.gain.linearRampToValueAtTime(1, t + 0.17);
        break;
      case 's':
        this.hiss(t, 0.16, 0.28, out, 'bandpass', 1900, 0.8);
        this.tone(t, 190, 0.08, 'triangle', 0.2, out, 140);
        break;
      case 'h': this.hiss(t, 0.04, 0.09, out, 'highpass', 7000); break;
      case 'c': this.hiss(t, 0.6, 0.12, out, 'highpass', 5000); break;
      case 't': this.tone(t, 260, 0.14, 'sine', 0.3, out, 150); break;
    }
  }

  // ---- music

  playSong(name) {
    if (!this.ctx) {
      this.pending = name;
      return;
    }
    if (this.song && this.song.name === name && this.song.loop) return;
    if (!this.compiled[name]) this.compiled[name] = compileSong(SONGS[name]);
    this.start(name, this.compiled[name], true);
  }

  playJingle(name) {
    if (!this.ctx) return;
    this.start(name, compileJingle(JINGLES[name]), false);
  }

  start(name, data, loop) {
    this.song = { name, data, loop, step: 0, next: this.ctx.currentTime + 0.06 };
    this.song.length = Math.max(...data.channels.map(c => c.steps.length));
  }

  stopMusic() {
    this.song = null;
    this.pending = null;
  }

  // Remember recent notes so the music box can draw a visualiser.
  note(t, kind, value) {
    this.events.push({ t, kind, value });
    if (this.events.length > 96) this.events.shift();
  }

  recent(window = 0.5) {
    if (!this.ctx) return [];
    const now = this.ctx.currentTime;
    return this.events.filter(e => e.t <= now && now - e.t < window).map(e => ({ ...e, age: (now - e.t) / window }));
  }

  schedule() {
    const s = this.song;
    if (!s || !this.ready || this.paused) return;
    const stepDur = 60 / s.data.bpm / 4;
    if (s.next < this.ctx.currentTime - 0.2) s.next = this.ctx.currentTime + 0.02;
    while (s.next < this.ctx.currentTime + 0.12) {
      if (s.step >= s.length) {
        if (!s.loop) { this.song = null; return; }
        s.step = 0;
      }
      for (const ch of s.data.channels) {
        const i = s.step % ch.steps.length;
        const tok = ch.steps[i];
        if (ch.kind === 'drums') {
          if (tok !== '.') {
            this.drum(tok, s.next);
            this.note(s.next, 'drums', tok);
          }
          continue;
        }
        const m = midiOf(tok);
        if (m == null) continue;
        let hold = 1;
        while (ch.steps[(i + hold) % ch.steps.length] === '-' && hold < 16) hold++;
        const dest = ch.kind === 'bass' || ch.kind === 'sub' || ch.kind === 'softBass' ? this.music : this.duck;
        this.play(s.next, hz(m), hold * stepDur * 0.9, ch.kind, dest);
        this.note(s.next, ch.kind, m);
      }
      if (this.layer && s.loop) {
        const tok = RIDE_LAYER.split(' ')[s.step % 16];
        if (tok !== '.') this.tone(s.next, tok === 't' && s.step % 4 === 0 ? 320 : 240, 0.1, 'sine', 0.22, this.music, 160);
      }
      s.step++;
      s.next += stepDur;
    }
  }

  // ---- sound effects

  sfx(name) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01, out = this.sfxBus;
    const seq = (notes, step, inst = 'bell', vol = 1) =>
      notes.forEach((n, i) => this.play(t + i * step, hz(midiOf(n)), step * 1.2, inst, out, vol));
    switch (name) {
      case 'jump': this.tone(t, 260, 0.16, 'pulse25', 0.11, out, 640); break;
      case 'jump2': this.tone(t, 420, 0.18, 'pulse25', 0.11, out, 1000); break;
      case 'swing': this.hiss(t, 0.12, 0.25, out, 'bandpass', 900, 2); break;
      case 'sling': this.tone(t, 900, 0.08, 'triangle', 0.25, out, 300); this.hiss(t, 0.06, 0.12, out, 'highpass', 3000); break;
      case 'poke': this.hiss(t, 0.07, 0.2, out, 'bandpass', 2500, 3); break;
      case 'hit':
        this.tone(t, 300, 0.1, 'square', 0.12, out, 80);
        this.hiss(t, 0.08, 0.25, out, 'lowpass', 2500);
        break;
      case 'defeat': seq(['G5', 'C5'], 0.06, 'lead', 1.2); this.hiss(t, 0.15, 0.2, out, 'lowpass', 1500); break;
      case 'hurt': this.tone(t, 600, 0.35, 'pulse25', 0.12, out, 150); break;
      case 'ko': seq(['E5', 'C5', 'A4', 'F4'], 0.09, 'lead', 1.3); break;
      case 'revive': seq(['C5', 'E5', 'G5', 'C6'], 0.06, 'bell'); break;
      case 'gem': seq(['E6', 'B6'], 0.06, 'bell', 1.1); break;
      case 'heart': seq(['C6', 'E6', 'G6'], 0.06, 'bell'); break;
      case 'oneup': seq(['C6', 'E6', 'G6', 'C7', 'G6', 'C7'], 0.07, 'bell'); break;
      case 'break':
        this.hiss(t, 0.35, 0.45, out, 'lowpass', 900);
        this.tone(t, 120, 0.25, 'square', 0.1, out, 40);
        break;
      case 'gate': this.hiss(t, 0.7, 0.3, out, 'lowpass', 500); this.tone(t, 80, 0.7, 'sawtooth', 0.08, out, 60); break;
      case 'target': seq(['G5', 'D6', 'G6'], 0.05, 'bell'); break;
      case 'mount': this.tone(t, 300, 0.12, 'triangle', 0.3, out, 500); seq(['C5', 'G5'], 0.07, 'bell', 0.7); break;
      case 'dismount': this.tone(t, 500, 0.12, 'triangle', 0.3, out, 250); break;
      case 'charge': this.tone(t, 110, 0.45, 'sawtooth', 0.12, out, 330); this.hiss(t, 0.4, 0.15, out, 'lowpass', 600); break;
      case 'honk':
        this.play(t, hz(midiOf('F3')), 0.35, 'lead', out, 2);
        this.play(t + 0.02, hz(midiOf('C4')), 0.33, 'lead', out, 1.5);
        break;
      case 'roar':
        this.hiss(t, 1.1, 0.5, out, 'lowpass', 700);
        this.tone(t, 90, 1.1, 'sawtooth', 0.22, out, 45);
        break;
      case 'stomp': this.tone(t, 70, 0.4, 'sine', 0.7, out, 30); this.hiss(t, 0.3, 0.35, out, 'lowpass', 400); break;
      case 'spit': this.hiss(t, 0.15, 0.2, out, 'bandpass', 1500, 4); this.tone(t, 500, 0.12, 'triangle', 0.15, out, 200); break;
      case 'switch': this.tone(t, 400, 0.15, 'sine', 0.2, out, 1200); this.hiss(t, 0.12, 0.08, out, 'highpass', 4000); break;
      case 'join': seq(['C6', 'G6'], 0.07, 'bell'); break;
      case 'leave': seq(['G5', 'C5'], 0.07, 'bell'); break;
      case 'select': this.tone(t, 900, 0.05, 'pulse25', 0.09, out, 1300); break;
      case 'pause': seq(['E6', 'C6', 'E6', 'C6'], 0.06, 'bell', 0.8); break;
      case 'tick': this.tone(t, 1500, 0.03, 'pulse50', 0.04, out); break;
      case 'checkpoint': seq(['C5', 'G5', 'C6', 'E6', 'G6'], 0.07, 'bell'); break;
      case 'spring': this.tone(t, 180, 0.3, 'triangle', 0.35, out, 900); break;
      case 'bump': this.tone(t, 150, 0.09, 'triangle', 0.35, out, 70); break;
      case 'thunder':
        this.hiss(t, 2.2, 0.55, out, 'lowpass', 260);
        this.hiss(t + 0.05, 0.4, 0.3, out, 'lowpass', 900);
        break;
      case 'chest': seq(['G5', 'C6', 'E6', 'G6', 'C7'], 0.09, 'bell', 1.2); break;
    }
  }
}

export const audio = new Synth();
