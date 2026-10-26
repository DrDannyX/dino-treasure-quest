import { TILE as T, VIEW_W, VIEW_H, ROWS, CAM_Y, GROUND, HERO_IDS, PLAYER_COLORS } from './constants.js';
import { SPR, HEROES, THEMES, LAYER_W, buildSprites } from './sprites.js';
import { paint, addOutline, tint, makeCanvas } from './gfx.js';
import { drawText } from './font.js';
import { audio, TRACKS } from './audio.js';
import { input, touch, deviceLabel } from './input.js';
import { LEVELS } from './levels.js';
import { G, W, centerX, overlap, setTile, popup, sparkle, toast } from './world.js';
import { makeHero, placeHero, spawnEnt, updateActors, activeHeroes, heroBody, makeTrex, isEnemy } from './actors.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const GROUND_Y = GROUND * T;
const START_LIVES = 5;
const GOLD = ['#e8d0a0', '#b8862a', '#6a4010'];
const BONE = ['#e0d6c0', '#a89878', '#6a5a48'];
// Smouldering embers rather than bright colours.
const EMBERS = ['#6a1410', '#8a2a14', '#a8461a', '#b8662a', '#c8862a', '#d8a848'];

// ------------------------------------------------------------------ helpers

function loadHi() {
  try { return +localStorage.getItem('dinoquest.hi') || 0; } catch { return 0; }
}

function saveHi() {
  if (G.score <= G.hi) return;
  G.hi = G.score;
  try { localStorage.setItem('dinoquest.hi', String(G.hi)); } catch { /* storage unavailable */ }
}

const pad = (n, len) => String(n).padStart(len, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function setState(s) {
  G.state = s;
  G.t = 0;
}

// ------------------------------------------------------------------ level setup

function loadLevel() {
  const def = LEVELS[G.world];
  const L = {
    def, w: def.w, grid: def.grid.map(r => r.slice()), theme: def.theme,
    ents: def.ents.map(spawnEnt).filter(Boolean),
    fx: [], popups: [], bumps: new Map(), springs: new Map(), opening: [], platforms: [],
    camX: 0, arena: null, bossStarted: false,
  };
  W.level = L;
  if (def.goalX != null) L.ents.push({ type: 'goal', x: def.goalX * T - 6, y: GROUND_Y - 22, w: 28, h: 22 });
  if (def.bossArena) {
    L.arena = [def.bossArena[0] * T, (def.bossArena[1] + 1) * T];
    L.ents.push(makeTrex(L.arena[1] - 84, GROUND_Y));
  }
  L.platforms = L.ents.filter(e => e.type === 'brachio').flatMap(b => [b.back, b.head]);

  let sx = def.startX * T, sy = GROUND_Y - 26;
  const cp = G.checkpoint && G.checkpoint.world === G.world ? G.checkpoint : null;
  if (cp) {
    sx = cp.x;
    sy = cp.y - 26;
    const totem = L.ents.find(e => e.type === 'checkpoint' && e.x + 2 === cp.x);
    if (totem) totem.lit = true;
  }
  for (const id of HERO_IDS) {
    const h = G.heroes[id];
    h.state = 'ok';
    h.hp = 3;
    h.player = null;
  }
  G.players.forEach((p, i) => {
    const h = G.heroes[p.hero];
    h.player = p.idx;
    placeHero(h, sx + i * 20, sy);
    h.facing = 1;
  });
  G.wiped = false;
  updateCamera(true);
}

function updateCamera(snap) {
  const L = W.level;
  const hs = activeHeroes();
  let target = L.camX;
  if (L.bossStarted) target = L.arena[0];
  else if (hs.length) {
    const avg = hs.reduce((s, h) => s + centerX(heroBody(h)), 0) / hs.length;
    target = clamp(avg - VIEW_W / 2, 0, L.w * T - VIEW_W);
  }
  L.camX = snap ? target : L.camX + (target - L.camX) * 0.12;
  // With more than one player, nobody can wander off screen.
  if (hs.length > 1 || L.bossStarted) {
    for (const h of hs) {
      const b = heroBody(h);
      const lo = L.camX + 2, hi = L.camX + VIEW_W - 2 - b.w;
      if (b.x < lo) { b.x = lo; if (b.vx < 0) b.vx = 0; }
      if (b.x > hi) { b.x = hi; if (b.vx > 0) b.vx = 0; }
    }
  }
}

function startBoss() {
  const L = W.level;
  L.bossStarted = true;
  const wx = L.arena[0] / T;
  for (let y = 2; y < GROUND; y++) setTile(wx, y, 'S');
  for (const h of activeHeroes()) {
    const b = heroBody(h);
    if (b.x < L.arena[0] + T + 2) b.x = L.arena[0] + T + 4;
  }
  const trex = L.ents.find(e => e.type === 'trex');
  if (trex) trex.mode = 'enter';
  audio.playSong('boss');
  toast('DEFEAT THE T-REX!');
}

function updateFx() {
  const L = W.level;
  for (const f of L.fx) {
    f.x += f.vx;
    f.y += f.vy;
    f.vy += f.grav;
    f.life--;
  }
  L.fx = L.fx.filter(f => f.life > 0);
  for (const p of L.popups) {
    p.y -= 0.6;
    p.t++;
  }
  L.popups = L.popups.filter(p => p.t < 50);
  for (const m of [L.bumps, L.springs]) {
    for (const [k, v] of m) {
      if (v <= 1) m.delete(k);
      else m.set(k, v - 1);
    }
  }
}

// ------------------------------------------------------------------ game flow

function newGame() {
  G.world = startWorld;
  G.lives = START_LIVES;
  G.gems = 0;
  G.totalGems = 0;
  G.score = 0;
  G.checkpoint = null;
  for (const id of HERO_IDS) G.heroes[id] = makeHero(id);
  setState('intro');
}

function startPlay() {
  loadLevel();
  setState('play');
  audio.playSong(LEVELS[G.world].music);
}

function startClear() {
  setState('clear');
  G.score += 1000;
  audio.stopMusic();
  audio.playJingle('clear');
  for (const h of activeHeroes()) {
    if (h.riding) h.riding.vx = 0;
    h.vx = 0;
  }
}

function updateJoin() {
  if (G.t === 1) audio.playSong('select');
  const taken = dev => new Set(G.join.filter(j => j.dev !== dev).map(j => j.sel));
  const firstFree = () => HERO_IDS.find(id => !G.join.some(j => j.sel === id));
  for (const dev of input.devices()) {
    const j = G.join.find(x => x.dev === dev);
    if (!j) {
      if ((input.pressed(dev, 'jump') || input.pressed(dev, 'start')) && G.join.length < 3) {
        G.join.push({ dev, sel: firstFree() });
        audio.sfx('join');
      }
      continue;
    }
    const dir = input.pressed(dev, 'right') ? 1 : input.pressed(dev, 'left') ? -1 : 0;
    if (dir) {
      const busy = taken(dev);
      let i = HERO_IDS.indexOf(j.sel);
      for (let k = 0; k < 3; k++) {
        i = (i + dir + 3) % 3;
        if (!busy.has(HERO_IDS[i])) break;
      }
      j.sel = HERO_IDS[i];
      audio.sfx('select');
    }
    if (input.pressed(dev, 'action')) {
      G.join = G.join.filter(x => x !== j);
      audio.sfx('leave');
      if (!G.join.length) setState('title');
      return;
    }
    if (input.pressed(dev, 'start') && G.t > 15) {
      G.players = G.join.map((x, i) => ({ idx: i, dev: x.dev, hero: x.sel, startHero: x.sel }));
      audio.sfx('checkpoint');
      newGame();
      return;
    }
  }
}

function playTrack(i) {
  G.track = i;
  const t = TRACKS[i];
  audio.stopMusic();
  if (t.song) audio.playSong(t.song);
  else audio.playJingle(t.jingle);
}

function step() {
  input.update();
  if (click && G.frame - click.frame > 2) click = null;
  G.frame++;
  G.t++;
  if (G.toast && --G.toast.t <= 0) G.toast = null;
  if (G.shake > 0) G.shake--;
  if (input.anyPressed('mute')) {
    // If sound hasn't started yet, the tap that started it means "sound on".
    if (!audio.ready && !audio.muted) toast('SOUND ON');
    else toast(audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON');
  }

  switch (G.state) {
    case 'title': {
      if (G.t === 1) audio.playSong('title');
      updateWeather('jungle');
      const dev = input.whoPressed('start') || input.whoPressed('jump');
      if (dev && G.t > 20) {
        G.join = [{ dev, sel: 'A' }];
        audio.sfx('join');
        setState('story');
      } else if ((input.anyPressed('action') || clicked(MUSIC_LINK)) && G.t > 20) {
        setState('musicbox');
        playTrack(G.track);
      } else if ((input.anyPressed('attack') || clicked(CONTROLS_LINK)) && G.t > 20) {
        audio.sfx('select');
        setState('controls');
      }
      break;
    }
    case 'controls':
      if (G.t > 10 && (input.anyPressed('action') || input.anyPressed('start') || input.anyPressed('jump') || input.anyPressed('attack') || clicked())) {
        audio.sfx('select');
        setState('title');
      }
      break;
    case 'story':
      // Any button skips the story.
      if (G.t > 20 && (input.anyPressed('start') || input.anyPressed('jump') || input.anyPressed('action'))) setState('join');
      else if (G.t * STORY_SPEED > STORY.length * 20 + VIEW_H + 40) setState('join');
      break;
    case 'join':
      updateJoin();
      break;
    case 'musicbox': {
      const n = TRACKS.length;
      const dev = input.whoPressed('left') ? -1 : input.whoPressed('right') ? 1 : 0;
      if (dev) playTrack((G.track + dev + n) % n);
      else if (input.anyPressed('jump')) playTrack(G.track);
      else if ((input.anyPressed('action') || input.anyPressed('start')) && G.t > 10) {
        audio.stopMusic();
        setState('title');
      }
      break;
    }
    case 'intro':
      if (G.t === 1) audio.stopMusic();
      if (G.t > 160 || ((input.anyPressed('start') || input.anyPressed('jump')) && G.t > 40)) startPlay();
      break;
    case 'play': {
      if (input.anyPressed('start')) {
        G.paused = !G.paused;
        audio.paused = G.paused;
        audio.sfx('pause');
      }
      if (G.paused) break;
      updateWeather(W.level.theme);
      updateActors();
      updateFx();
      updateCamera();
      const L = W.level;
      if (L.arena && !L.bossStarted && activeHeroes().some(h => heroBody(h).x > L.arena[0] + 3 * T)) startBoss();
      for (const e of L.ents) {
        if (e.type === 'goal' && activeHeroes().some(h => heroBody(h).x + heroBody(h).w > e.x + 10)) { startClear(); break; }
        if (e.type === 'chest' && e.landed && activeHeroes().some(h => overlap(heroBody(h), e))) {
          e.open = true;
          setState('treasure');
          audio.stopMusic();
          audio.playJingle('treasure');
          audio.sfx('chest');
          G.score += 10000;
          break;
        }
      }
      if (G.wiped && G.state === 'play') {
        setState('wipe');
        audio.stopMusic();
        audio.playJingle('wipe');
      }
      break;
    }
    case 'clear':
      updateFx();
      if (G.t > 260) {
        G.world++;
        G.checkpoint = null;
        saveHi();
        setState('intro');
      }
      break;
    case 'wipe':
      updateFx();
      if (G.t > 160) {
        G.lives--;
        saveHi();
        if (G.lives <= 0) {
          setState('gameover');
          G.menu = 0;
          audio.playJingle('gameover');
        } else {
          G.players.forEach(p => { p.hero = p.startHero; });
          setState('intro');
        }
      }
      break;
    case 'gameover':
      if (input.anyPressed('up') || input.anyPressed('down')) {
        G.menu = 1 - G.menu;
        audio.sfx('select');
      }
      if ((input.anyPressed('start') || input.anyPressed('jump')) && G.t > 60) {
        if (G.menu === 0) {
          G.lives = START_LIVES;
          G.score = 0;
          G.gems = 0;
          G.checkpoint = null;
          G.players.forEach(p => { p.hero = p.startHero; });
          setState('intro');
        } else setState('title');
      }
      break;
    case 'treasure': {
      updateFx();
      const chest = W.level.ents.find(e => e.type === 'chest');
      if (chest && G.t % 4 === 0 && G.t < 200) {
        const c = ['#c8862a', '#a8202a', '#e0b860'][G.t % 3];
        W.level.fx.push({ x: centerX(chest), y: chest.y + 6, vx: (Math.random() - 0.5) * 4, vy: -4 - Math.random() * 3, life: 70, size: 4, color: c, grav: 0.15 });
      }
      if (G.t > 330) {
        saveHi();
        setState('ending');
      }
      break;
    }
    case 'ending':
      if (G.t > 30 && !audio.song && !audio.pending) audio.playSong('treasure');
      if ((input.anyPressed('start') || input.anyPressed('jump')) && G.t > 150) setState('title');
      break;
  }
}

// ------------------------------------------------------------------ rendering

const shadowCache = new Map();
function shadow(w) {
  if (!shadowCache.has(w)) {
    shadowCache.set(w, paint(w, 5, ({ ellipse }) => ellipse(w / 2, 2.5, w / 2, 2.5, 'rgba(0,0,0,0.28)')));
  }
  return shadowCache.get(w);
}

let HEART_SMALL, HEART_EMPTY, BUBBLE, VIGNETTE, TREX_SHADOW;

function buildUiSprites() {
  HEART_SMALL = addOutline(paint(11, 10, ({ ellipse, poly, px }) => {
    ellipse(3.5, 3.5, 2.5, 2.5, '#b82434');
    ellipse(7.5, 3.5, 2.5, 2.5, '#b82434');
    poly([[1, 4], [10, 4], [5.5, 9]], '#b82434');
    px(3, 2, '#ffffff');
  }), '#1a1020');
  HEART_EMPTY = addOutline(paint(11, 10, ({ ellipse, poly }) => {
    ellipse(3.5, 3.5, 2.5, 2.5, '#3a2a3a');
    ellipse(7.5, 3.5, 2.5, 2.5, '#3a2a3a');
    poly([[1, 4], [10, 4], [5.5, 9]], '#3a2a3a');
  }), '#1a1020');
  // Darkened screen edges for a spookier feel.
  VIGNETTE = makeCanvas(VIEW_W, VIEW_H);
  const vg = VIGNETTE.getContext('2d');
  const grad = vg.createRadialGradient(VIEW_W / 2, VIEW_H * 0.55, VIEW_H * 0.35, VIEW_W / 2, VIEW_H * 0.55, VIEW_W * 0.62);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,8,0.6)');
  vg.fillStyle = grad;
  vg.fillRect(0, 0, VIEW_W, VIEW_H);
  TREX_SHADOW = SPR.dinos.trex.walk.map(f => tint(f.l, '#04060a'));
  BUBBLE = paint(44, 44, ({ ellipse }) => {
    ellipse(22, 22, 21, 21, 'rgba(180,230,255,0.55)');
    ellipse(22, 22, 19, 19, 'rgba(120,190,255,0.25)');
    ellipse(14, 12, 4, 3, 'rgba(255,255,255,0.9)');
  });
}

function drawBackground(theme, cx) {
  const bg = SPR.bg[theme];
  ctx.drawImage(bg.sky, 0, 0);
  for (const layer of bg.layers) {
    let x = -(Math.floor(cx * layer.f) % LAYER_W);
    for (; x < VIEW_W; x += LAYER_W) ctx.drawImage(layer.img, x, 0);
  }
  const f = G.frame;
  if (theme === 'volcano' || theme === 'lair') {
    for (let i = 0; i < 30; i++) {
      const x = ((i * 67.3 - cx * 0.6 + Math.sin(f * 0.02 + i) * 10) % VIEW_W + VIEW_W) % VIEW_W;
      const y = VIEW_H - ((i * 41 + f * (0.4 + (i % 3) * 0.2)) % VIEW_H);
      ctx.fillStyle = i % 2 ? '#ffb020' : '#ff6a10';
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  } else if (theme === 'swamp') {
    for (let i = 0; i < 20; i++) {
      const x = ((i * 89 - cx * 0.7 + Math.sin(f * 0.03 + i * 2) * 14) % VIEW_W + VIEW_W) % VIEW_W;
      const y = 100 + Math.sin(f * 0.02 + i) * 40 + (i * 13) % 80;
      ctx.fillStyle = (f + i * 9) % 60 < 30 ? '#a8b860' : '#6a7a30';
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  } else if (theme === 'jungle') {
    for (let i = 0; i < 12; i++) {
      const x = ((i * 131 - cx * 0.8 + f * 0.3) % VIEW_W + VIEW_W) % VIEW_W;
      const y = (i * 47 + f * 0.5 + Math.sin(f * 0.04 + i) * 8) % VIEW_H;
      ctx.fillStyle = i % 2 ? '#4a6a3a' : '#5e7a40';
      ctx.fillRect(Math.round(x), Math.round(y), 3, 2);
    }
  }
}

// Storms: lightning flashes now and then, with thunder a moment later.
const weather = { flash: 0, thunder: 0 };

function updateWeather(theme) {
  weather.flash *= 0.88;
  if (weather.thunder > 0 && --weather.thunder === 0) audio.sfx('thunder');
  if ((theme === 'jungle' || theme === 'swamp') && weather.thunder === 0 && Math.random() < 1 / 700) {
    weather.flash = 1;
    weather.thunder = 25 + Math.floor(Math.random() * 50);
  }
}

function drawRain(cx) {
  ctx.fillStyle = 'rgba(170,200,230,0.35)';
  for (let i = 0; i < 90; i++) {
    const x = ((i * 53.3 - cx * 0.9 - G.frame * 2) % VIEW_W + VIEW_W) % VIEW_W;
    const y = (i * 97 + G.frame * 7) % VIEW_H;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 6);
  }
}

function drawAtmosphere(theme, cx) {
  if (theme === 'jungle') drawRain(cx);
  ctx.drawImage(VIGNETTE, 0, 0);
  if (weather.flash > 0.02) {
    ctx.fillStyle = `rgba(220,230,255,${(weather.flash * 0.55).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawMist(cx) {
  ctx.fillStyle = 'rgba(200,235,220,0.07)';
  for (let i = 0; i < 4; i++) {
    const y = 150 + i * 22;
    for (let x = 0; x < VIEW_W; x += 8) {
      const h = 10 + Math.sin((x + cx * (0.3 + i * 0.2) + G.frame * (0.5 + i * 0.2)) * 0.02) * 8;
      ctx.fillRect(x, Math.round(y - h / 2), 8, Math.round(h));
    }
  }
}

function tileImage(c, tx, ty) {
  const t = SPR.tiles[W.level.theme];
  const above = W.level.grid[ty - 1] ? W.level.grid[ty - 1][tx] : ' ';
  switch (c) {
    case '#': return above === '#' ? t.ground : t.groundTop;
    case 'S': return t.stone;
    case 'C': return t.cracked;
    case '=': return t.plat;
    case '^': return t.spikes;
    case 'L': return above === 'L' ? t.hazardFill : t.hazard[Math.floor(G.frame / 10) % 4];
    case 'G': return t.gate;
    case '?': case 'H': return t.q[(G.frame % 60) < 12 ? 1 : 0];
    case 'U': return t.used;
    case 'J': return t.spring[W.level.springs.has(tx) ? 1 : 0];
  }
  return null;
}

function drawTiles(cx) {
  const L = W.level;
  const x0 = Math.max(0, Math.floor(cx / T)), x1 = Math.min(L.w - 1, x0 + Math.ceil(VIEW_W / T) + 1);
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = L.grid[ty][tx];
      if (c === ' ') continue;
      const img = tileImage(c, tx, ty);
      if (!img) continue;
      const b = L.bumps.get(tx + ',' + ty);
      const off = b ? Math.round(Math.sin((10 - b) / 10 * Math.PI) * 5) : 0;
      ctx.drawImage(img, tx * T - cx, ty * T - CAM_Y - off);
    }
  }
}

function drawShadow(e, cx) {
  if (!e.onGround) return;
  const w = Math.max(8, Math.round(e.w * 0.9));
  ctx.drawImage(shadow(w), Math.round(centerX(e) - w / 2 - cx), Math.round(e.y + e.h - 3 - CAM_Y));
}

function pick(set, facing, flash) {
  if (flash) return facing > 0 ? set.wr : set.wl;
  return facing > 0 ? set.r : set.l;
}

function drawBrachio(b, cx) {
  const sp = SPR.dinos.brachio;
  const bx = Math.round(b.x - cx), by = Math.round(b.y - CAM_Y);
  ctx.drawImage(sp.body, bx, by);
  // Neck from the shoulders up to the head, as a chain of discs.
  const sx = bx + 66, sy = by + 30;
  const hx = bx + 84, hy = Math.round(b.head.y - CAM_Y) + 8;
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const cx1 = sx + 26, cy1 = (sy + hy) / 2 + 10;
    const x = (1 - k) * (1 - k) * sx + 2 * (1 - k) * k * cx1 + k * k * hx;
    const y = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * cy1 + k * k * hy;
    pts.push([Math.round(x), Math.round(y)]);
  }
  for (const [x, y] of pts) ctx.drawImage(sp.neck.outline, x - 8, y - 8);
  for (const [x, y] of pts) ctx.drawImage(sp.neck.fill, x - 7, y - 7);
  pts.forEach(([x, y], i) => { if (i % 3 === 1) ctx.drawImage(sp.neck.shade, x - 5, y - 6); });
  ctx.drawImage(sp.head, Math.round(b.head.x - cx) - 2, Math.round(b.head.y - CAM_Y) - 2);
}

function drawRideDino(d, cx) {
  const sp = SPR.dinos[d.type];
  const step = Math.floor(d.anim) % 2;
  let set;
  if (d.type === 'trike') set = (d.charge > 0 ? sp.charge : sp.walk)[step];
  else set = d.honk > 0 ? sp.honk : sp.walk[step];
  const img = pick(set, d.facing);
  const ox = d.type === 'trike' ? (d.facing > 0 ? 24 : 30) : (d.facing > 0 ? 20 : 26);
  const sh = d.type === 'trike' ? 38 : 50;
  drawShadow(d, cx);
  ctx.drawImage(img, Math.round(centerX(d) - ox - cx), Math.round(d.y + d.h - sh - CAM_Y));
  if (!d.rider && d.state === 'idle' && Math.floor(G.frame / 30) % 2 && activeHeroes().some(h => Math.abs(centerX(h) - centerX(d)) < 60)) {
    drawText(ctx, 'RIDE!', centerX(d) - cx, d.y - 22 - CAM_Y, { align: 'center', color: '#d8a848' });
  }
}

function drawEnemy(e, cx) {
  if (!e.active) return;
  const sp = SPR.dinos;
  const flash = e.flash > 0 && e.flash % 2 === 0;
  const dead = e.mode === 'dead';
  const step = Math.floor(e.t / 8) % 2;
  let set, ox, oh;
  switch (e.type) {
    case 'compy': set = sp.compy[e.onGround ? 0 : 1]; ox = 13; oh = 20; break;
    case 'raptor': set = e.bite && step ? sp.raptor.bite : sp.raptor.run[Math.floor(e.t / 5) % 2]; ox = 21; oh = 30; break;
    case 'dilo': set = e.spit > 0 ? sp.dilo.spit : sp.dilo.idle[Math.floor(e.t / 20) % 2]; ox = 17; oh = 34; break;
    case 'ptero': set = sp.ptero[Math.floor(e.t / 6) % 2]; ox = 21; oh = 19; break;
  }
  if (!dead && e.type !== 'ptero') drawShadow(e, cx);
  const img = dead ? (e.facing > 0 ? set.dr : set.dl) : pick(set, e.facing, flash);
  ctx.drawImage(img, Math.round(centerX(e) - ox - cx), Math.round(e.y + e.h - oh - CAM_Y));
  if (e.stun > 0) {
    for (let i = 0; i < 3; i++) {
      const a = G.frame * 0.1 + i * 2.1;
      ctx.drawImage(SPR.items.star, Math.round(centerX(e) - 4 + Math.cos(a) * 10 - cx), Math.round(e.y - 10 + Math.sin(a) * 3 - CAM_Y));
    }
  }
}

function drawTrex(e, cx) {
  const sp = SPR.dinos.trex;
  let set = sp.walk[Math.floor(e.anim) % 2];
  if (e.mode === 'roar' || e.mode === 'windup') set = sp.roar;
  if (e.mode === 'dazed') set = sp.dazed;
  const flash = e.flash > 0 && e.flash % 2 === 0;
  ctx.drawImage(shadow(90), Math.round(centerX(e) - 45 - cx), GROUND_Y - 3 - CAM_Y);
  const img = pick(set, e.facing, flash);
  const ox = e.facing > 0 ? 54 : 70;
  ctx.drawImage(img, Math.round(centerX(e) - ox - cx), Math.round(e.y + e.h - 100 - CAM_Y));
  if (e.mode === 'dazed') {
    const hx = e.facing < 0 ? e.x + 10 : e.x + e.w - 10;
    for (let i = 0; i < 4; i++) {
      const a = G.frame * 0.1 + i * 1.6;
      ctx.drawImage(SPR.items.star, Math.round(hx + Math.cos(a) * 16 - cx), Math.round(e.y - 14 + Math.sin(a) * 4 - CAM_Y));
    }
  }
}

function drawItem(e, cx) {
  const it = SPR.items;
  const x = Math.round(e.x - cx), y = Math.round(e.y - CAM_Y);
  switch (e.type) {
    case 'gem': case 'gemDrop': {
      if (e.life && e.life < 120 && G.frame % 6 < 3) return;
      const bob = e.type === 'gem' ? Math.round(Math.sin(G.frame * 0.08 + e.x) * 2) : 0;
      ctx.drawImage(it.gems[e.color], x, y + bob);
      if ((G.frame + e.x) % 50 < 4) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 4, y + 3 + bob, 2, 2); }
      break;
    }
    case 'heart': case 'heartDrop':
      if (e.life && e.life < 120 && G.frame % 6 < 3) return;
      ctx.drawImage(it.heart, x, y + Math.round(Math.sin(G.frame * 0.1) * 2));
      break;
    case 'target':
      ctx.drawImage(e.hit ? it.targetHit : it.target, x, y);
      break;
    case 'checkpoint':
      ctx.drawImage(it.totem[e.lit ? 1 : 0], x, y);
      if (e.lit) {
        const fl = Math.floor(G.frame / 5) % 3;
        ctx.fillStyle = '#ff6a10';
        ctx.fillRect(x + 6, y + 1 - fl, 8, 6 + fl);
        ctx.fillStyle = '#d8a848';
        ctx.fillRect(x + 8, y + 3 - fl, 4, 4 + fl);
      }
      break;
    case 'goal':
      ctx.drawImage(it.pedestal, x, y);
      ctx.drawImage(it.map, x + 3, y - 24 + Math.round(Math.sin(G.frame * 0.06) * 3));
      if (G.frame % 40 < 20) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 6 + (G.frame % 16), y - 22, 2, 2); }
      break;
    case 'stone':
      ctx.drawImage(it.stone, x, y);
      break;
    case 'venom':
      ctx.drawImage(it.venom, x, y);
      break;
    case 'rock':
      if (e.warn > 0) {
        if (G.frame % 8 < 5) ctx.drawImage(shadow(18), x, GROUND_Y - 3 - CAM_Y);
      } else ctx.drawImage(it.rock, x, y);
      break;
    case 'chest':
      ctx.drawImage(it.chest[e.open ? 1 : 0], x, y - 2);
      if (!e.open && e.landed && G.frame % 40 < 20) drawText(ctx, 'OPEN ME!', centerX(e) - cx, y - 14, { align: 'center', color: '#d8a848' });
      break;
  }
}

function drawHero(h, cx) {
  const spr = SPR.heroes[h.id];
  if (h.state === 'bubble') {
    const x = Math.round(h.x - cx), y = Math.round(h.y - CAM_Y);
    ctx.drawImage(spr.frames.hurt.r, x - 10, y - 7);
    ctx.drawImage(BUBBLE, x - 16, y - 10);
    if (G.frame % 40 < 24) drawText(ctx, 'HELP!', x + 6, y - 20, { align: 'center', color: '#d8a848' });
    return;
  }
  if (h.invuln > 0 && !h.riding && Math.floor(G.frame / 3) % 2) return;
  let frame = h.frame;
  if (G.state === 'clear' || G.state === 'treasure') frame = Math.floor(G.t / 12 + HERO_IDS.indexOf(h.id)) % 2 ? 'cheer' : 'stand';
  const set = spr.frames[frame] || spr.frames.stand;
  if (!h.riding) drawShadow(h, cx);
  const hop = frame === 'cheer' && !h.riding ? -4 : 0;
  ctx.drawImage(pick(set, h.facing), Math.round(h.x - (h.facing > 0 ? 10 : 14) - cx), Math.round(h.y - 7 - CAM_Y + hop));
  // Player tag so everyone can find themselves.
  if (G.players.length > 1) {
    const p = G.players[h.player];
    drawText(ctx, 'P' + (p.idx + 1), centerX(h) - cx, h.y - 18 - CAM_Y, { align: 'center', color: PLAYER_COLORS[p.idx] });
  }
}

function drawFx(cx) {
  const L = W.level;
  for (const f of L.fx) {
    ctx.fillStyle = f.color;
    const s = f.size * Math.min(1, f.life / 10);
    ctx.fillRect(Math.round(f.x - cx - s / 2), Math.round(f.y - CAM_Y - s / 2), Math.ceil(s), Math.ceil(s));
  }
  for (const p of L.popups) drawText(ctx, p.text, p.x - cx, p.y - CAM_Y, { align: 'center', color: p.color });
}

function drawHud() {
  ctx.fillStyle = 'rgba(10,6,16,0.55)';
  ctx.fillRect(0, 0, VIEW_W, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(0, 26, VIEW_W, 1);
  HERO_IDS.forEach((id, i) => {
    const h = G.heroes[id];
    const x0 = 4 + i * 96;
    const out = h.state === 'down';
    ctx.globalAlpha = out ? 0.4 : 1;
    ctx.drawImage(SPR.heroes[id].head, x0, 4);
    ctx.globalAlpha = 1;
    drawText(ctx, HEROES[id].name, x0 + 20, 3, { color: '#ffffff' });
    for (let k = 0; k < 3; k++) ctx.drawImage(k < h.hp ? HEART_SMALL : HEART_EMPTY, x0 + 20 + k * 11, 13);
    if (h.player !== null && G.players.length > 1) {
      drawText(ctx, 'P' + (h.player + 1), x0 + 74, 14, { color: PLAYER_COLORS[h.player] });
    }
    if (out) {
      drawText(ctx, 'REST', x0 + 56, 14, { color: '#aaaaaa' });
    } else if (h.state === 'bubble' && G.frame % 30 < 18) {
      drawText(ctx, 'HELP', x0 + 56, 14, { color: '#d8a848' });
    }
  });
  ctx.drawImage(SPR.items.gems[0], 294, 6);
  drawText(ctx, '*' + pad(G.gems, 2), 310, 9, { color: '#d8a048' });
  drawText(ctx, 'LIVES ' + G.lives, 340, 4);
  drawText(ctx, 'WORLD ' + (G.world + 1), 340, 14, { color: '#d8a848' });
  drawText(ctx, pad(G.score, 6), VIEW_W - 4, 9, { align: 'right' });
  const trex = W.level.ents.find(e => e.type === 'trex');
  if (trex && W.level.bossStarted && trex.mode !== 'defeat') {
    drawText(ctx, 'T-REX', VIEW_W / 2 - 104, 33, { color: '#c86a50' });
    ctx.fillStyle = '#1a1020';
    ctx.fillRect(VIEW_W / 2 - 70, 32, 174, 9);
    ctx.fillStyle = '#5a1018';
    ctx.fillRect(VIEW_W / 2 - 69, 33, 172, 7);
    ctx.fillStyle = trex.flash > 0 ? '#ffffff' : '#a8201a';
    ctx.fillRect(VIEW_W / 2 - 69, 33, Math.round(172 * trex.hp / trex.maxHp), 7);
  }
}

function drawWorld() {
  const L = W.level;
  const sx = G.shake ? Math.round((Math.random() - 0.5) * G.shake) : 0;
  const cx = Math.round(L.camX) + sx;
  drawBackground(L.theme, cx);
  for (const e of L.ents) if (e.type === 'brachio') drawBrachio(e, cx);
  drawTiles(cx);
  for (const e of L.ents) {
    if (e.type === 'trike' || e.type === 'para') drawRideDino(e, cx);
  }
  for (const e of L.ents) {
    if (isEnemy(e)) drawEnemy(e, cx);
    else if (e.type === 'trex') drawTrex(e, cx);
    else if (e.type !== 'brachio' && e.type !== 'trike' && e.type !== 'para') drawItem(e, cx);
  }
  for (const id of HERO_IDS) {
    const h = G.heroes[id];
    if (h.player !== null && (h.state === 'ok' || h.state === 'bubble')) drawHero(h, cx);
  }
  drawFx(cx);
  if (L.theme === 'swamp') drawMist(cx);
  drawAtmosphere(L.theme, cx);
  drawHud();
  if (G.state === 'clear') {
    drawText(ctx, 'MAP PIECE FOUND!', VIEW_W / 2, 90, { scale: 3, align: 'center', color: GOLD });
    drawText(ctx, (G.world + 1) + ' OF 3', VIEW_W / 2, 122, { scale: 2, align: 'center', color: '#ffffff' });
  }
  if (G.state === 'wipe') {
    drawText(ctx, 'OH NO!', VIEW_W / 2, 100, { scale: 4, align: 'center', color: '#b83a30' });
  }
  if (G.state === 'treasure') {
    drawText(ctx, 'TREASURE FOUND!', VIEW_W / 2, 70, { scale: 3, align: 'center', color: GOLD });
  }
  if (G.paused) drawPause();
}

function drawPause() {
  ctx.fillStyle = 'rgba(6,4,10,0.9)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawText(ctx, 'PAUSED', VIEW_W / 2, 56, { scale: 4, align: 'center', color: GOLD });
  drawControlsTable(102);
  drawText(ctx, 'PRESS START TO PLAY', VIEW_W / 2, 236, { align: 'center' });
}


function drawGroundStrip(theme, cx) {
  const t = SPR.tiles[theme];
  const off = -(Math.floor(cx) % T);
  for (let x = off; x < VIEW_W; x += T) {
    ctx.drawImage(t.groundTop, x, GROUND_Y - CAM_Y);
    ctx.drawImage(t.ground, x, GROUND_Y + T - CAM_Y);
    ctx.drawImage(t.ground, x, GROUND_Y + 2 * T - CAM_Y);
  }
}

function drawBig(id, frame, facing, x, y, scale = 2) {
  const set = SPR.heroes[id].frames[frame];
  ctx.drawImage(facing > 0 ? set.r : set.l, Math.round(x), Math.round(y), 36 * scale, 34 * scale);
}

function drawDinoBig(set, facing, x, y, w, h, scale = 2) {
  ctx.drawImage(facing > 0 ? set.r : set.l, Math.round(x), Math.round(y), w * scale, h * scale);
}

function soundHint() {
  if (!audio.ready) drawText(ctx, G.touch ? 'TAP ANYWHERE FOR SOUND' : 'CLICK OR PRESS A KEY FOR SOUND', 6, 4, { color: '#ffffff' });
}

function drawTitle() {
  const cx = G.frame * 0.5;
  drawBackground('jungle', cx);
  // A T-Rex silhouette stalks through the trees, red eye glowing.
  const rx = VIEW_W + 60 - ((G.frame * 0.45) % (VIEW_W + 260));
  const ry = GROUND_Y - CAM_Y - 96 + Math.round(Math.abs(Math.sin(G.frame * 0.05)) * 2);
  ctx.drawImage(TREX_SHADOW[Math.floor(G.frame / 16) % 2], Math.round(rx), ry);
  ctx.fillStyle = G.frame % 120 < 8 ? '#400808' : '#ff2a2a';
  ctx.fillRect(Math.round(rx) + 31, ry + 22, 2, 2);
  drawGroundStrip('jungle', cx);
  drawAtmosphere('jungle', cx);
  drawText(ctx, 'DINO', VIEW_W / 2, 26, { scale: 6, align: 'center', color: GOLD, shadow: '#1a1020' });
  drawText(ctx, 'TREASURE QUEST', VIEW_W / 2, 76, { scale: 3, align: 'center', color: BONE, shadow: '#1a1020' });
  // A trike strolls across the title screen.
  const tx = ((G.frame * 0.8) % (VIEW_W + 160)) - 120;
  drawDinoBig(SPR.dinos.trike.walk[Math.floor(G.frame / 10) % 2], 1, tx, GROUND_Y - CAM_Y - 72, 54, 38, 2);
  HERO_IDS.forEach((id, i) => {
    const hop = Math.abs(Math.sin(G.frame * 0.08 + i)) * 6;
    drawBig(id, hop > 4 ? 'jump' : 'stand', i === 2 ? -1 : 1, VIEW_W / 2 - 110 + i * 76, GROUND_Y - CAM_Y - 64 - hop);
    drawText(ctx, HEROES[id].name, VIEW_W / 2 - 74 + i * 76, 110, { align: 'center', color: HEROES[id].tunicL });
  });
  if (Math.floor(G.frame / 30) % 2 === 0) drawText(ctx, 'PRESS START', VIEW_W / 2, 230, { scale: 2, align: 'center' });
  drawText(ctx, '1 - 3 PLAYERS', VIEW_W / 2, 252, { align: 'center', color: '#ffe0a0' });
  drawText(ctx, 'HI ' + pad(G.hi, 6), VIEW_W - 6, 4, { align: 'right' });
  drawText(ctx, (G.touch ? 'B' : 'B / V') + ': MUSIC BOX', VIEW_W - 6, 14, { align: 'right', color: '#d8a848' });
  drawText(ctx, 'X: CONTROLS', VIEW_W - 6, 24, { align: 'right', color: '#d8a848' });
  soundHint();
}

const STORY = [
  "IT WAS ACE'S BIRTHDAY.",
  '',
  'ACE, ECHO AND ZIPPER WERE',
  'EXPLORING THE WOODS BEHIND',
  "ACE'S HOUSE WHEN THEY FOUND",
  'A STRANGE, GLOWING STONE.',
  '',
  'ACE PICKED IT UP...',
  'AND THE WORLD SPUN AROUND THEM.',
  '',
  'WHEN THE LIGHT FADED, THE',
  'THREE FRIENDS STOOD IN A DARK,',
  'STEAMING JUNGLE.',
  '',
  'GIANT FERNS. DISTANT ROARS.',
  'DINOSAURS!',
  '',
  'A CAVE PAINTING TOLD OF A',
  'TREASURE HIDDEN IN THE LAIR',
  'OF THE MIGHTY T-REX.',
  'WHOEVER OPENS IT',
  'CAN RETURN HOME.',
  '',
  'BUT THE MAP WAS TORN INTO',
  'THREE PIECES, LOST IN THE',
  'JUNGLE, THE VOLCANO',
  'AND THE SWAMP.',
  '',
  'THE GENTLE PLANT-EATERS',
  'WILL HELP YOU.',
  'THE MEAT-EATERS WILL NOT.',
  '',
  'FIND THE MAP.',
  'DEFEAT THE T-REX.',
  'GET ACE HOME IN TIME',
  'FOR BIRTHDAY CAKE!',
];
const STORY_SPEED = 0.45;

function drawStory() {
  drawBackground('jungle', G.frame * 0.15);
  ctx.fillStyle = 'rgba(4,4,10,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // The glowing stone that started it all, pulsing behind the text.
  const pulse = 0.5 + Math.sin(G.frame * 0.05) * 0.5;
  ctx.globalAlpha = 0.25 + pulse * 0.3;
  ctx.drawImage(SPR.items.gems[0], VIEW_W / 2 - 28, VIEW_H / 2 - 32, 56, 64);
  ctx.globalAlpha = 1;
  const top = VIEW_H + 10 - G.t * STORY_SPEED;
  STORY.forEach((line, i) => {
    const y = top + i * 20;
    if (!line || y < -20 || y > VIEW_H) return;
    const loud = line.endsWith('!');
    drawText(ctx, line, VIEW_W / 2, y, { scale: 2, align: 'center', color: loud ? GOLD : BONE });
  });
  // Fade the text in at the bottom and out at the top.
  const fade = (y0, dir) => {
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = `rgba(8,6,12,${(dir > 0 ? i : 23 - i) / 24})`;
      ctx.fillRect(0, y0 + i * 2, VIEW_W, 2);
    }
  };
  fade(0, -1);
  fade(VIEW_H - 48, 1);
  drawText(ctx, (G.touch ? 'TAP A' : 'PRESS START') + ' TO SKIP', VIEW_W - 8, VIEW_H - 12, { align: 'right', color: '#8a7a68' });
  soundHint();
}

const CONTROLS = [
  ['MOVE', 'STICK / D-PAD', 'ARROWS', 'W A S D'],
  ['JUMP', 'A', 'Z / SPACE', 'F'],
  ['ATTACK', 'X', 'X', 'G'],
  ['SWITCH HERO', 'Y', 'C', 'H'],
  ['RIDE / GET OFF', 'B', 'V / SHIFT', 'R'],
  ['PAUSE', 'MENU', 'ENTER', 'T'],
  ['MUTE', 'VIEW', 'M', '-'],
];

// The full key table, shared by the controls screen and the pause menu.
function drawControlsTable(top) {
  const cols = [16, 140, 262, 372];
  ['ACTION', 'XBOX PAD', 'KEYBOARD', 'PLAYER 2 KEYS'].forEach((h, i) => drawText(ctx, h, cols[i], top, { color: '#d8a848' }));
  ctx.fillStyle = 'rgba(216,168,72,0.4)';
  ctx.fillRect(12, top + 10, VIEW_W - 24, 1);
  CONTROLS.forEach((row, r) => {
    const y = top + 18 + r * 15;
    if (r % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(12, y - 4, VIEW_W - 24, 15);
    }
    row.forEach((cell, i) => drawText(ctx, cell, cols[i], y, { color: i ? '#e0d6c0' : '#c8b090' }));
  });
}

function drawControls() {
  drawBackground('jungle', G.frame * 0.2);
  ctx.fillStyle = 'rgba(6,4,10,0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawText(ctx, 'CONTROLS', VIEW_W / 2, 8, { scale: 3, align: 'center', color: GOLD });
  drawControlsTable(40);
  const tips = [
    'JUMP ONTO A FRIENDLY DINO TO RIDE IT.',
    'ATTACK WHILE RIDING TO USE ITS POWER.',
    'ACE SMASHES CRACKED ROCKS. ECHO HITS TARGETS.',
    'ZIPPER CAN DOUBLE JUMP. STAND ON A BRACHIO TO RIDE UP.',
  ];
  tips.forEach((t, i) => drawText(ctx, t, VIEW_W / 2, 172 + i * 12, { align: 'center', color: '#a89878' }));
  if (G.touch) drawText(ctx, 'ON-SCREEN BUTTONS MATCH THE XBOX LAYOUT', VIEW_W / 2, 226, { align: 'center', color: '#d8a848' });
  if (Math.floor(G.frame / 30) % 2 === 0) drawText(ctx, 'PRESS B TO GO BACK', VIEW_W / 2, 246, { align: 'center' });
}

function drawJoin() {
  drawBackground('jungle', G.frame * 0.3);
  ctx.fillStyle = 'rgba(10,6,16,0.45)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawText(ctx, 'CHOOSE YOUR HEROES', VIEW_W / 2, 12, { scale: 3, align: 'center', color: GOLD });
  HERO_IDS.forEach((id, i) => {
    const def = HEROES[id];
    const x = VIEW_W / 2 + (i - 1) * 156 - 70, y = 42;
    const owners = G.join.map((j, k) => ({ j, k })).filter(o => o.j.sel === id);
    ctx.fillStyle = 'rgba(20,12,30,0.75)';
    ctx.fillRect(x, y, 140, 172);
    const border = owners.length ? PLAYER_COLORS[owners[0].k] : 'rgba(255,255,255,0.25)';
    ctx.fillStyle = border;
    ctx.fillRect(x, y, 140, 2); ctx.fillRect(x, y + 170, 140, 2); ctx.fillRect(x, y, 2, 172); ctx.fillRect(x + 138, y, 2, 172);
    const hop = owners.length ? Math.abs(Math.sin(G.frame * 0.12)) * 6 : 0;
    drawBig(id, owners.length && hop > 3 ? 'cheer' : 'stand', 1, x + 16, y + 8 - hop, 3);
    drawText(ctx, def.name, x + 70, y + 110, { scale: 2, align: 'center', color: def.tunicL });
    drawText(ctx, def.title, x + 70, y + 128, { align: 'center', color: '#ffe0a0' });
    drawText(ctx, def.ability[0], x + 70, y + 142, { align: 'center' });
    drawText(ctx, def.ability[1], x + 70, y + 152, { align: 'center' });
    owners.forEach((o, n) => {
      drawText(ctx, 'P' + (o.k + 1) + ' ' + deviceLabel(o.j.dev), x + 70, y + 178 + n * 10, { align: 'center', color: PLAYER_COLORS[o.k] });
    });
  });
  const lines = G.touch
    ? ['< > CHOOSE   B LEAVE   START TO GO!']
    : ['PRESS A (PAD), Z (KEYS) OR F (WASD) TO JOIN', '< > CHOOSE   B / V / R LEAVE   START / ENTER / T TO GO!'];
  lines.forEach((l, i) => drawText(ctx, l, VIEW_W / 2, 236 + i * 12, { align: 'center', color: i ? '#ffffff' : '#d8a848' }));
  soundHint();
}

function drawIntro() {
  ctx.fillStyle = '#0c0810';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const def = LEVELS[G.world];
  drawText(ctx, G.world === LEVELS.length - 1 ? 'FINAL WORLD' : 'WORLD ' + (G.world + 1), VIEW_W / 2, 36, { scale: 3, align: 'center' });
  drawText(ctx, def.name, VIEW_W / 2, 70, { scale: 4, align: 'center', color: GOLD });
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = i < G.world ? 1 : 0.25;
    ctx.drawImage(SPR.items.map, VIEW_W / 2 - 50 + i * 36, 112, 22, 20);
  }
  ctx.globalAlpha = 1;
  drawText(ctx, 'MAP PIECES', VIEW_W / 2, 138, { align: 'center', color: '#ffe0a0' });
  G.players.forEach((p, i) => {
    const x = VIEW_W / 2 + (i - (G.players.length - 1) / 2) * 80 - 36;
    drawBig(p.hero, 'stand', 1, x, 156);
    if (G.players.length > 1) drawText(ctx, 'P' + (i + 1), x + 36, 228, { align: 'center', color: PLAYER_COLORS[i] });
  });
  drawText(ctx, 'LIVES ' + G.lives, VIEW_W / 2, 248, { align: 'center' });
  if (G.checkpoint && G.checkpoint.world === G.world) drawText(ctx, 'FROM CHECKPOINT', VIEW_W / 2, 258, { align: 'center', color: '#d8a848' });
}

function drawGameOver() {
  ctx.fillStyle = '#0c0810';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawText(ctx, 'GAME OVER', VIEW_W / 2, 70, { scale: 5, align: 'center', color: '#b83a30' });
  drawText(ctx, 'SCORE ' + pad(G.score, 6), VIEW_W / 2, 130, { align: 'center' });
  ['CONTINUE', 'BACK TO TITLE'].forEach((label, i) => {
    const y = 164 + i * 18;
    drawText(ctx, label, VIEW_W / 2 - 40, y, { color: G.menu === i ? '#d8a848' : '#888888' });
    if (G.menu === i) drawText(ctx, '>', VIEW_W / 2 - 54, y, { color: '#d8a848' });
  });
}

function drawEnding() {
  const cx = G.frame * 0.3;
  drawBackground('jungle', cx);
  drawGroundStrip('jungle', cx);
  drawText(ctx, 'THE TREASURE IS YOURS!', VIEW_W / 2, 10, { scale: 3, align: 'center', color: GOLD });
  drawText(ctx, 'ACE MADE IT HOME FOR BIRTHDAY CAKE!', VIEW_W / 2, 38, { align: 'center', color: '#d8a848' });
  drawText(ctx, 'HAPPY BIRTHDAY, ACE!', VIEW_W / 2, 50, { align: 'center', color: '#d8a848' });
  drawText(ctx, 'STARRING ACE, ECHO AND ZIPPER', VIEW_W / 2, 64, { align: 'center', color: '#c8b090' });
  drawText(ctx, 'WITH TRIKE, PARA AND BRACHIO', VIEW_W / 2, 76, { align: 'center', color: '#a89878' });
  drawText(ctx, 'GEMS ' + G.totalGems + '    SCORE ' + G.score, VIEW_W / 2, 90, { align: 'center' });
  ctx.drawImage(SPR.items.chest[1], VIEW_W / 2 - 40, GROUND_Y - CAM_Y - 62, 80, 64);
  const tx = ((G.frame * 0.7) % (VIEW_W + 200)) - 140;
  drawDinoBig(SPR.dinos.trike.walk[Math.floor(G.frame / 10) % 2], 1, tx, GROUND_Y - CAM_Y - 72, 54, 38);
  const px = VIEW_W + 100 - ((G.frame * 0.9) % (VIEW_W + 220));
  drawDinoBig(SPR.dinos.para.walk[Math.floor(G.frame / 8) % 2], -1, px, GROUND_Y - CAM_Y - 96, 46, 50);
  HERO_IDS.forEach((id, i) => {
    const hop = Math.max(0, Math.sin(G.frame * 0.15 + i * 2)) * 14;
    drawBig(id, hop > 3 ? 'cheer' : 'stand', i === 2 ? -1 : 1, VIEW_W / 2 + [-200, -126, 52][i], GROUND_Y - CAM_Y - 64 - hop);
  });
  for (let i = 0; i < 14; i++) {
    const x = (i * 37 + Math.sin(G.frame * 0.03 + i) * 10) % VIEW_W;
    const y = VIEW_H - ((G.frame * 0.7 + i * 41) % (VIEW_H + 20));
    ctx.drawImage(SPR.items.gems[i % 3], Math.round(x), Math.round(y));
  }
  if (G.t > 150 && Math.floor(G.frame / 30) % 2 === 0) drawText(ctx, 'PRESS START', VIEW_W / 2, 104, { align: 'center' });
}

function drawMusicBox() {
  const cx = G.frame * 0.4;
  drawBackground('volcano', cx);
  drawGroundStrip('volcano', cx);
  drawText(ctx, 'MUSIC BOX', VIEW_W / 2, 10, { scale: 4, align: 'center', color: GOLD });
  const track = TRACKS[G.track];
  drawText(ctx, '<', 50, 50, { scale: 2 });
  drawText(ctx, '>', VIEW_W - 60, 50, { scale: 2 });
  drawText(ctx, track.name, VIEW_W / 2, 50, { scale: 2, align: 'center' });
  const finished = !audio.song && !audio.pending;
  drawText(ctx, 'TRACK ' + (G.track + 1) + ' OF ' + TRACKS.length + (finished ? '  -  PRESS A TO PLAY' : ''), VIEW_W / 2, 70, { align: 'center', color: '#d8a848' });
  const heights = new Array(12).fill(0);
  let kick = 0;
  for (const e of audio.recent(0.45)) {
    const fresh = 1 - e.age;
    if (e.kind === 'drums') { if (e.value === 'k') kick = Math.max(kick, fresh); continue; }
    const w = e.kind === 'lead' ? 1 : e.kind === 'bass' || e.kind === 'softBass' ? 0.8 : e.kind === 'pad' ? 0.35 : 0.55;
    heights[e.value % 12] = Math.max(heights[e.value % 12], fresh * w);
  }
  const colW = 18, gap = 6, left = Math.round(VIEW_W / 2 - (12 * (colW + gap) - gap) / 2), base = 190;
  heights.forEach((h, i) => {
    const x = left + i * (colW + gap);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, base - 2, colW, 2);
    for (let b = 0; b < Math.round(h * 16); b++) {
      ctx.fillStyle = EMBERS[Math.min(EMBERS.length - 1, Math.floor(b / 3))];
      ctx.fillRect(x, base - 7 - b * 6, colW, 4);
    }
  });
  const hop = Math.round(kick * 10);
  drawBig('A', hop > 2 ? 'cheer' : 'stand', 1, 4, GROUND_Y - CAM_Y - 64 - hop);
  drawBig('E', hop > 2 ? 'cheer' : 'stand', -1, VIEW_W - 76, GROUND_Y - CAM_Y - 64 - hop);
  drawBig('Z', hop > 2 ? 'jump' : 'stand', 1, VIEW_W / 2 - 36, GROUND_Y - CAM_Y - 64 - hop);
  drawText(ctx, G.touch ? '< > CHOOSE   A PLAY   B BACK' : 'ARROWS CHOOSE   Z / A PLAY   V / B BACK', VIEW_W / 2, 200, { align: 'center' });
  soundHint();
}

function render() {
  ctx.imageSmoothingEnabled = false;
  switch (G.state) {
    case 'title': drawTitle(); break;
    case 'story': drawStory(); break;
    case 'controls': drawControls(); break;
    case 'join': drawJoin(); break;
    case 'musicbox': drawMusicBox(); break;
    case 'intro': drawIntro(); break;
    case 'gameover': drawGameOver(); break;
    case 'ending': drawEnding(); break;
    default: drawWorld();
  }
  if (G.toast) {
    const w = G.toast.text.length * 6 + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(Math.round(VIEW_W / 2 - w / 2), 44, w, 14);
    drawText(ctx, G.toast.text, VIEW_W / 2, 48, { align: 'center', color: '#d8a848' });
  }
  if (DEBUG) {
    const a = audio.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, VIEW_H - 22, VIEW_W, 22);
    drawText(ctx, 'AUDIO ' + (a ? a.state : 'NOT STARTED') + ' SONG ' + (audio.song ? audio.song.name : audio.pending || '-') + ' DEVICES ' + input.devices().join(' '), 4, VIEW_H - 20, { color: '#7a9a5a' });
    if (lastError) drawText(ctx, lastError.slice(0, 76), 4, VIEW_H - 10, { color: '#b83a30' });
  }
}

// ------------------------------------------------------------------ boot

// Clickable title-screen labels (in game pixels), for mouse users.
const MUSIC_LINK = { x: VIEW_W - 110, y: 12, w: 106, h: 10 };
const CONTROLS_LINK = { x: VIEW_W - 72, y: 22, w: 68, h: 10 };
let click = null;

// True once for a click inside `area` (or anywhere when no area is given).
function clicked(area) {
  if (!click) return false;
  const hit = !area || (click.x >= area.x && click.x < area.x + area.w && click.y >= area.y && click.y < area.y + area.h);
  if (hit) click = null;
  return hit;
}

function resize() {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = Math.floor(VIEW_W * s) + 'px';
  canvas.style.height = Math.floor(VIEW_H * s) + 'px';
}

function setupTouch() {
  const el = document.getElementById('touch');
  if (!el || !window.matchMedia('(pointer: coarse)').matches) return;
  el.hidden = false;
  G.touch = true;
  const buttons = [...el.querySelectorAll('[data-act]')];
  // Work out which buttons are under each finger, so a thumb can slide
  // between buttons without lifting, and several can be held at once.
  const sync = e => {
    e.preventDefault();
    for (const b of buttons) touch[b.dataset.act] = false;
    for (const t of e.touches) {
      const hit = document.elementFromPoint(t.clientX, t.clientY);
      const btn = hit && hit.closest('[data-act]');
      if (btn) touch[btn.dataset.act] = true;
    }
    for (const b of buttons) b.classList.toggle('down', touch[b.dataset.act]);
  };
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    document.addEventListener(ev, sync, { passive: false });
  }
}

// Optional URL params: ?play&world=2&players=2 jumps straight in (keyboard
// players), and ?debug shows the audio state and any script error on screen.
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const startWorld = clamp((+params.get('world') || 1) - 1, 0, LEVELS.length - 1);
let lastError = '';
if (DEBUG) {
  window.addEventListener('error', e => { lastError = String(e.message); });
  window.addEventListener('unhandledrejection', e => { lastError = String(e.reason); });
}

function boot() {
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  buildSprites();
  buildUiSprites();
  G.hi = loadHi();
  resize();
  window.addEventListener('resize', resize);
  setupTouch();
  // iOS only lets audio start from certain gestures, so listen for all of them.
  for (const ev of ['keydown', 'mousedown', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) {
    window.addEventListener(ev, () => audio.unlock(), { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) audio.resume(); });
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    click = { x: (e.clientX - r.left) / r.width * VIEW_W, y: (e.clientY - r.top) / r.height * VIEW_H, frame: G.frame };
  });
  input.onGamepadConnected(gp => toast('CONTROLLER ' + (gp.index + 1) + ' CONNECTED!'));
  // Handy for poking at the game from the browser console.
  window.dino = { G, W };

  if (params.has('play')) {
    const n = clamp(+params.get('players') || 1, 1, 2);
    G.players = ['kb1', 'kb2'].slice(0, n).map((dev, i) => ({ idx: i, dev, hero: HERO_IDS[i], startHero: HERO_IDS[i] }));
    newGame();
    startPlay();
  }

  let last = performance.now(), acc = 0;
  const STEP = 1000 / 60;
  function frame(now) {
    acc += Math.min(100, now - last);
    last = now;
    while (acc >= STEP) {
      step();
      acc -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
