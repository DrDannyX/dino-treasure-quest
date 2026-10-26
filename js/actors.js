// Heroes, dinosaurs (friendly and not), items and projectiles.
import { TILE as T, ROWS, VIEW_W, GROUND, HERO_IDS } from './constants.js';
import { HEROES } from './sprites.js';
import {
  G, W, tileAt, setTile, isSolid, overlap, centerX, moveX, moveY, onSafeGround, inHazard, onSpikes,
  popup, sparkle, dust, debris, shake, toast,
} from './world.js';
import { audio } from './audio.js';
import { input } from './input.js';

const GRAV = 0.5, GRAV_HOLD = 0.25, MAX_FALL = 7, APEX = 1.2;
const GROUND_Y = GROUND * T;
const REST_TIME = 1200;

const WEAPONS = {
  club: { total: 18, active: [12, 6], cd: 26, sfx: 'swing' },
  sling: { total: 14, fire: 9, cd: 20, sfx: 'sling' },
  spear: { total: 12, active: [9, 3], cd: 14, sfx: 'poke' },
};

const RIDES = {
  trike: { speed: 2.5, jump: 5.6 },
  para: { speed: 3.1, jump: 7.6 },
};

const SCORES = { compy: 100, raptor: 300, dilo: 300, ptero: 200 };

// ------------------------------------------------------------------ setup

export function makeHero(id) {
  return {
    id, kind: 'hero', x: 0, y: 0, w: 12, h: 26, vx: 0, vy: 0, facing: 1, onGround: false,
    hp: 3, state: 'ok', player: null, riding: null, restT: 0,
    atk: 0, atkCd: 0, atkHit: new Set(), invuln: 0, knock: 0, jumps: 0, coyote: 0, jumpBuf: 0,
    anim: 0, frame: 'stand', safeX: 0, safeY: 0,
  };
}

export function placeHero(h, x, y) {
  Object.assign(h, { x, y, vx: 0, vy: 0, riding: null, atk: 0, invuln: 0, knock: 0, safeX: x, safeY: y, onGround: false });
}

export function spawnEnt(e) {
  const x = e.x * T, y = e.y * T, base = (e.y + 1) * T;
  const enemy = (w, h, hp) => ({ type: e.type, x: x + (T - w) / 2, y: base - h, w, h, hp, vx: 0, vy: 0, facing: -1, mode: 'live', t: 0, flash: 0, stun: 0, invuln: 0, active: false, cool: 60 });
  switch (e.type) {
    case 'gem': return { type: 'gem', x: x + 1, y: y + 1, w: 14, h: 14, color: e.x % 3 };
    case 'heart': return { type: 'heart', x: x + 1, y: y + 2, w: 14, h: 13 };
    case 'target': return { type: 'target', x: x - 2, y: base - 34, w: 20, h: 28, id: e.id, hit: false };
    case 'checkpoint': return { type: 'checkpoint', x: x - 2, y: base - 44, w: 20, h: 44, lit: false };
    case 'trike': return { type: 'trike', x, y: base - 26, w: 40, h: 26, ...rideBase(x, base - 26) };
    case 'para': return { type: 'para', x, y: base - 36, w: 22, h: 36, ...rideBase(x, base - 36) };
    case 'brachio': return makeBrachio(x, base);
    case 'compy': return enemy(14, 12, 1);
    case 'raptor': return { ...enemy(26, 20, 2), facing: -1 };
    case 'dilo': return enemy(18, 26, 2);
    case 'ptero': return { ...enemy(24, 12, 1), y, baseX: x, baseY: y, vx: -0.9, swoop: 0 };
  }
  return null;
}

function rideBase(x, y) {
  return { vx: 0, vy: 0, facing: 1, homeX: x, homeY: y, rider: null, state: 'idle', t: 0, mountCd: 0, cd: 0, charge: 0, honk: 0, anim: 0, onGround: false, coyote: 0 };
}

// ---- Brachiosaurus: a living lift. Its back and head are moving ledges.

const BRACHIO_LOW = 58, BRACHIO_HIGH = 150;

function makeBrachio(x, base) {
  const b = {
    type: 'brachio', x, y: base - 72, base, t: 0, phase: 'low', lift: 0,
    back: { x: x + 28, y: base - 72 + 23, w: 42, dy: 0 },
    head: { x: x + 78, y: base - BRACHIO_LOW, w: 26, dy: 0 },
  };
  return b;
}

function updateBrachio(b) {
  b.t++;
  const DUR = 120, WAIT = 150;
  if (b.phase === 'low' && b.t > WAIT) { b.phase = 'rise'; b.t = 0; }
  else if (b.phase === 'rise' && b.t >= DUR) { b.phase = 'high'; b.t = 0; }
  else if (b.phase === 'high' && b.t > WAIT) { b.phase = 'lower'; b.t = 0; }
  else if (b.phase === 'lower' && b.t >= DUR) { b.phase = 'low'; b.t = 0; }
  const ease = k => 0.5 - Math.cos(Math.min(1, k) * Math.PI) / 2;
  b.lift = b.phase === 'low' ? 0 : b.phase === 'high' ? 1 : b.phase === 'rise' ? ease(b.t / DUR) : 1 - ease(b.t / DUR);
  const newY = b.base - (BRACHIO_LOW + (BRACHIO_HIGH - BRACHIO_LOW) * b.lift);
  b.head.dy = newY - b.head.y;
  b.head.y = newY;
  // Carry whoever is standing on the head.
  for (const e of standers()) if (e.standOn === b.head) e.y += b.head.dy;
}

function* standers() {
  for (const h of activeHeroes()) yield h.riding || h;
  for (const e of W.level.ents) if (e.type === 'trike' || e.type === 'para') yield e;
}

// ------------------------------------------------------------------ hero helpers

export function activeHeroes() {
  return HERO_IDS.map(id => G.heroes[id]).filter(h => h.player !== null && h.state === 'ok');
}

export const heroBody = h => h.riding || h;

function nearestHero(e) {
  let best = null, bd = Infinity;
  for (const h of activeHeroes()) {
    const b = heroBody(h);
    const d = Math.abs(centerX(b) - centerX(e)) + Math.abs(b.y - e.y) * 0.5;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function rumble(h, s, ms) {
  if (h.player !== null) input.rumble(G.players[h.player].dev, s, ms);
}

function nextFreeHero(fromId) {
  const i = HERO_IDS.indexOf(fromId);
  for (let k = 1; k <= 2; k++) {
    const h = G.heroes[HERO_IDS[(i + k) % 3]];
    if (h.player === null && h.state === 'ok') return h;
  }
  return null;
}

// Hand a player's control from one hero to another, keeping position (and ride).
function transfer(p, from, to) {
  to.x = centerX(from) - to.w / 2;
  to.y = from.y + from.h - to.h;
  to.vx = from.vx;
  to.vy = from.vy;
  to.facing = from.facing;
  to.safeX = from.safeX;
  to.safeY = from.safeY;
  to.invuln = Math.max(30, from.invuln);
  to.atk = 0;
  to.riding = from.riding;
  if (to.riding) to.riding.rider = to;
  from.riding = null;
  from.player = null;
  to.player = p.idx;
  p.hero = to.id;
  sparkle(centerX(to), to.y + 12, 10, ['#ffffff', HEROES[to.id].tunic]);
}

function switchHero(p) {
  const h = G.heroes[p.hero];
  const to = nextFreeHero(h.id);
  if (!to) {
    audio.sfx('bump');
    return;
  }
  transfer(p, h, to);
  audio.sfx('switch');
}

export function hurtHero(h, dmg, fromX) {
  if (h.invuln > 0 || h.state !== 'ok' || G.state !== 'play') return false;
  if (h.riding) {
    dismount(h, true);
    h.invuln = 90;
    audio.sfx('hurt');
    rumble(h, 0.4, 150);
    return true;
  }
  h.hp -= dmg;
  h.invuln = 90;
  h.knock = 12;
  h.vx = (centerX(h) < fromX ? -1 : 1) * 2.5;
  h.vy = -4;
  audio.sfx('hurt');
  rumble(h, 0.6, 200);
  if (h.hp <= 0) knockOut(h);
  return true;
}

function hazardHero(h) {
  if (h.riding) {
    const d = h.riding;
    dismount(h, false);
    respawnDino(d);
  }
  h.hp--;
  audio.sfx('hurt');
  rumble(h, 0.6, 200);
  h.x = h.safeX;
  h.y = h.safeY;
  h.vx = 0;
  h.vy = 0;
  h.invuln = 120;
  sparkle(centerX(h), h.y + 12, 8);
  if (h.hp <= 0) knockOut(h);
}

function knockOut(h) {
  h.hp = 0;
  audio.sfx('ko');
  sparkle(centerX(h), h.y + 12, 12, ['#ffffff', '#b83a30']);
  const p = G.players[h.player];
  const free = nextFreeHero(h.id);
  if (free) {
    transfer(p, h, free);
    free.x = h.safeX;
    free.y = h.safeY + h.h - free.h;
    free.vx = free.vy = 0;
    free.invuln = 120;
    h.state = 'down';
    h.restT = REST_TIME;
    toast(HEROES[h.id].name + ' NEEDS A REST!');
  } else {
    h.state = 'bubble';
    h.vx = h.vy = 0;
    h.x = h.safeX;
    h.y = h.safeY - 20;
  }
  if (!activeHeroes().length) G.wiped = true;
}

function reviveHero(h, x, y, hp) {
  h.state = 'ok';
  h.hp = hp;
  h.invuln = 120;
  h.x = x;
  h.y = y;
  h.vx = 0;
  h.vy = -3;
  h.safeX = x;
  h.safeY = y;
  audio.sfx('revive');
  sparkle(centerX(h), h.y + 12, 12);
}

function updateBubble(h) {
  const idx = h.player || 0;
  const tx = W.level.camX + VIEW_W / 2 - 6 + (idx - 1) * 40;
  const ty = 60 + Math.sin(G.frame * 0.05 + idx) * 6;
  h.x += (tx - h.x) * 0.03;
  h.y += (ty - h.y) * 0.03;
  for (const o of activeHeroes()) {
    if (overlap(heroBody(o), { x: h.x - 8, y: h.y - 6, w: h.w + 16, h: h.h + 12 })) {
      reviveHero(h, h.x, h.y, 2);
      popup('POP!', centerX(h), h.y - 6, '#6a8ec0');
      return;
    }
  }
}

// Heroes knocked out while a teammate took over get back up after a rest.
export function updateRestingHeroes() {
  for (const id of HERO_IDS) {
    const h = G.heroes[id];
    if (h.state === 'down' && --h.restT <= 0) {
      h.state = 'ok';
      h.hp = 3;
      toast(HEROES[id].name + ' IS BACK!');
    }
  }
}

// ------------------------------------------------------------------ hero update

export function updateHero(h) {
  if (h.state === 'bubble') return updateBubble(h);
  const p = G.players[h.player];
  const dev = p.dev;
  if (h.invuln > 0) h.invuln--;
  if (h.atkCd > 0) h.atkCd--;
  // One press switches once, even though the new hero updates this same frame.
  if (input.pressed(dev, 'switch') && p.switched !== G.frame) {
    p.switched = G.frame;
    switchHero(p);
    if (p.hero !== h.id) return;
  }
  if (h.riding) return updateRider(h, dev);

  const def = HEROES[h.id];
  const dir = (input.held(dev, 'right') ? 1 : 0) - (input.held(dev, 'left') ? 1 : 0);
  const acc = h.onGround ? 0.35 : 0.22;
  if (h.knock > 0) h.knock--;
  else h.vx += Math.max(-acc, Math.min(acc, dir * def.speed - h.vx));
  if (dir && h.atk === 0) h.facing = dir;

  if (input.pressed(dev, 'jump')) h.jumpBuf = 6;
  else if (h.jumpBuf > 0) h.jumpBuf--;
  if (h.onGround) { h.coyote = 6; h.jumps = 0; } else if (h.coyote > 0) h.coyote--;
  if (h.jumpBuf > 0 && h.coyote > 0) {
    h.vy = -def.jump;
    h.jumpBuf = 0;
    h.coyote = 0;
    h.jumps = 1;
    h.onGround = false;
    audio.sfx('jump');
  } else if (input.pressed(dev, 'jump') && !h.onGround && def.doubleJump && h.jumps < 2) {
    h.vy = -5.8;
    h.jumps = 2;
    h.jumpBuf = 0;
    audio.sfx('jump2');
    sparkle(centerX(h), h.y + h.h, 6, ['#ffffff', '#6a8ec0']);
  }
  const hold = input.held(dev, 'jump');
  let g = hold && h.vy < 0 ? GRAV_HOLD : GRAV;
  if (!h.onGround && Math.abs(h.vy) < APEX) g *= 0.5;
  h.vy = Math.min(MAX_FALL, h.vy + g);

  if (moveX(h)) h.vx = 0;
  if (h.vy > 0 && tryMountLanding(h)) return;
  const wasGround = h.onGround;
  const hit = moveY(h, { platforms: true, cornerSlip: true });
  if (hit && hit.ceiling) {
    const mid = centerX(h);
    const tx = hit.ceiling.reduce((a, b) => (Math.abs(b * T + 8 - mid) < Math.abs(a * T + 8 - mid) ? b : a));
    bumpTile(tx, hit.ty);
  }
  if (hit && hit.floor) {
    if (hit.floor.some(f => f.c === 'J')) {
      h.vy = hold ? -10 : -8;
      h.onGround = false;
      W.level.springs.set(hit.floor.find(f => f.c === 'J').tx, 10);
      audio.sfx('spring');
    } else if (!wasGround) dust(centerX(h), h.y + h.h);
  }
  if (input.pressed(dev, 'action')) tryMountNear(h);
  if (input.pressed(dev, 'attack') && h.atkCd === 0) startAttack(h);
  updateAttack(h);

  if (onSafeGround(h)) { h.safeX = h.x; h.safeY = h.y; }
  if (onSpikes(h) && hurtHero(h, 1, centerX(h) - h.facing)) h.vy = -5;
  if (h.state === 'ok' && inHazard(h)) hazardHero(h);

  const w = WEAPONS[def.weapon];
  if (h.atk > 0) h.frame = h.atk > (w.active ? w.active[0] : w.fire) ? 'atk1' : 'atk2';
  else if (h.knock > 0) h.frame = 'hurt';
  else if (!h.onGround) h.frame = h.vy < 0 ? 'jump' : 'fall';
  else if (Math.abs(h.vx) > 0.2) {
    h.anim += Math.abs(h.vx) * 0.08;
    h.frame = 'walk' + (Math.floor(h.anim) % 4);
  } else h.frame = 'stand';
}

// ---- attacks

function startAttack(h) {
  const w = WEAPONS[HEROES[h.id].weapon];
  h.atk = w.total;
  h.atkCd = w.cd;
  h.atkHit = new Set();
  audio.sfx(w.sfx);
}

function updateAttack(h) {
  if (h.atk <= 0) return;
  h.atk--;
  const def = HEROES[h.id];
  const w = WEAPONS[def.weapon];
  if (w.fire && h.atk === w.fire) {
    W.level.ents.push({ type: 'stone', x: centerX(h) + h.facing * 10 - 4, y: h.y + 6, w: 8, h: 8, vx: h.facing * 6.5, vy: -0.7, life: 48 });
  }
  if (w.active && h.atk <= w.active[0] && h.atk >= w.active[1]) {
    const box = def.weapon === 'club'
      ? { x: h.facing > 0 ? h.x + h.w - 2 : h.x - 20, y: h.y - 2, w: 22, h: 26 }
      : { x: h.facing > 0 ? h.x + h.w : h.x - 22, y: h.y + 8, w: 22, h: 8 };
    hitBox(box, def.weapon === 'club' ? 2 : 1, h, def.weapon === 'club');
  }
}

function hitBox(box, dmg, h, breaks) {
  for (const e of W.level.ents) {
    if (h.atkHit.has(e)) continue;
    if (isEnemy(e) && e.mode === 'live' && overlap(box, e)) {
      h.atkHit.add(e);
      damageEnemy(e, dmg, centerX(h));
    } else if (e.type === 'target' && !e.hit && overlap(box, e)) {
      h.atkHit.add(e);
      hitTarget(e);
    } else if (e.type === 'trex' && overlap(box, e)) {
      h.atkHit.add(e);
      damageTrex(e, dmg);
    }
  }
  if (breaks) breakRocksIn(box);
}

function breakRocksIn(box) {
  for (let tx = Math.floor(box.x / T); tx <= Math.floor((box.x + box.w - 1) / T); tx++) {
    for (let ty = Math.floor(box.y / T); ty <= Math.floor((box.y + box.h - 1) / T); ty++) {
      if (tileAt(tx, ty) === 'C') crumble(tx, ty);
    }
  }
}

// Break a whole connected group of cracked rocks.
function crumble(tx, ty) {
  const todo = [[tx, ty]];
  let n = 0;
  while (todo.length) {
    const [x, y] = todo.pop();
    if (tileAt(x, y) !== 'C') continue;
    setTile(x, y, ' ');
    n++;
    debris(x * T + 8, y * T + 8, '#9a9284', 3);
    todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  G.score += n * 20;
  shake(4);
  audio.sfx('break');
}

function hitTarget(e) {
  e.hit = true;
  audio.sfx('target');
  sparkle(centerX(e), e.y + 10, 10);
  const tiles = W.level.def.gates[e.id] || [];
  // Open from the bottom up.
  [...tiles].reverse().forEach(([x, y], i) => W.level.opening.push({ x, y, t: 1 + i * 6 }));
  audio.sfx('gate');
  shake(3);
  popup('GATE OPEN!', centerX(e), e.y - 10, '#d8a848');
}

// Gates slide away one tile at a time.
export function updateGates() {
  const L = W.level;
  for (const o of L.opening) {
    if (--o.t <= 0 && tileAt(o.x, o.y) === 'G') {
      setTile(o.x, o.y, ' ');
      dust(o.x * T + 8, o.y * T + 14, 3);
    }
  }
  L.opening = L.opening.filter(o => o.t > 0);
}

function bumpTile(tx, ty) {
  const c = tileAt(tx, ty);
  W.level.bumps.set(tx + ',' + ty, 10);
  if (c === '?') {
    setTile(tx, ty, 'U');
    W.level.ents.push({ type: 'gemDrop', x: tx * T + 1, y: ty * T - 14, w: 14, h: 14, vx: 0.6, vy: -5, color: tx % 3, life: 600 });
    audio.sfx('gem');
  } else if (c === 'H') {
    setTile(tx, ty, 'U');
    W.level.ents.push({ type: 'heartDrop', x: tx * T + 1, y: ty * T - 14, w: 14, h: 13, vx: 0.8, vy: -5, life: 900 });
    audio.sfx('heart');
  } else audio.sfx('bump');
  const above = { x: tx * T, y: (ty - 1) * T, w: T, h: T };
  for (const e of W.level.ents) if (isEnemy(e) && e.mode === 'live' && overlap(e, above)) damageEnemy(e, 9, tx * T + 8);
}

// ------------------------------------------------------------------ riding

function canMount(d) {
  return (d.type === 'trike' || d.type === 'para') && !d.rider && d.state !== 'scared' && d.mountCd === 0;
}

function tryMountLanding(h) {
  const bottom = h.y + h.h;
  for (const d of W.level.ents) {
    if (!canMount(d)) continue;
    if (bottom <= d.y + 4 && bottom + h.vy >= d.y && h.x + h.w > d.x + 6 && h.x < d.x + d.w - 6) {
      mount(h, d);
      return true;
    }
  }
  return false;
}

function tryMountNear(h) {
  for (const d of W.level.ents) {
    if (canMount(d) && overlap(h, { x: d.x - 6, y: d.y - 8, w: d.w + 12, h: d.h + 8 })) {
      mount(h, d);
      return;
    }
  }
}

function mount(h, d) {
  h.riding = d;
  d.rider = h;
  d.state = 'ridden';
  d.facing = h.facing;
  d.vx = h.vx;
  d.vy = 0;
  h.vy = 0;
  h.atk = 0;
  audio.sfx('mount');
  sparkle(centerX(d), d.y, 8, ['#ffffff', '#7a9a5a']);
  seatRider(h, d);
}

export function dismount(h, bucked) {
  const d = h.riding;
  if (!d) return;
  d.rider = null;
  d.state = bucked ? 'scared' : 'idle';
  d.fleeDir = -d.facing;
  d.t = 0;
  d.mountCd = bucked ? 90 : 30;
  d.charge = 0;
  h.riding = null;
  h.x = centerX(d) - h.w / 2;
  h.y = d.y - h.h;
  h.vx = 0;
  h.vy = bucked ? -6 : -4.5;
  if (!bucked) audio.sfx('dismount');
}

function respawnDino(d) {
  d.x = d.homeX;
  d.y = d.homeY;
  d.vx = d.vy = 0;
  d.state = 'idle';
  d.charge = 0;
  sparkle(centerX(d), d.y + 10, 10, ['#ffffff', '#7a9a5a']);
}

function seatRider(h, d) {
  h.x = centerX(d) - h.w / 2 + (d.type === 'trike' ? -2 * d.facing : -1 * d.facing);
  h.y = d.y - h.h + (d.type === 'trike' ? 14 : 10);
  h.facing = d.facing;
}

function updateRider(h, dev) {
  const d = h.riding;
  if (input.pressed(dev, 'action')) {
    dismount(h, false);
    return;
  }
  const spec = RIDES[d.type];
  const dir = (input.held(dev, 'right') ? 1 : 0) - (input.held(dev, 'left') ? 1 : 0);
  if (d.cd > 0) d.cd--;
  if (d.honk > 0) d.honk--;
  if (d.charge > 0) {
    d.charge--;
    d.vx = d.facing * 5.2;
    if (G.frame % 3 === 0) dust(d.facing > 0 ? d.x : d.x + d.w, d.y + d.h, 2);
    chargeHits(d);
  } else {
    const acc = d.onGround ? 0.3 : 0.2;
    d.vx += Math.max(-acc, Math.min(acc, dir * spec.speed - d.vx));
    if (dir) d.facing = dir;
  }
  if (input.pressed(dev, 'jump')) h.jumpBuf = 6;
  else if (h.jumpBuf > 0) h.jumpBuf--;
  if (d.onGround) d.coyote = 6;
  else if (d.coyote > 0) d.coyote--;
  if (h.jumpBuf > 0 && d.coyote > 0) {
    d.vy = -spec.jump;
    h.jumpBuf = 0;
    d.coyote = 0;
    audio.sfx('jump');
  }
  const hold = input.held(dev, 'jump');
  let g = hold && d.vy < 0 ? GRAV_HOLD : GRAV;
  if (!d.onGround && Math.abs(d.vy) < APEX) g *= 0.5;
  d.vy = Math.min(MAX_FALL, d.vy + g);
  if (input.pressed(dev, 'attack') && d.cd === 0) dinoAbility(d);

  if (moveX(d)) {
    if (d.charge > 0) {
      d.charge = 0;
      d.vx = -d.facing * 2;
      shake(4);
      audio.sfx('bump');
    } else d.vx = 0;
  }
  const hit = moveY(d, { platforms: true });
  if (hit && hit.floor && hit.floor.some(f => f.c === 'J')) {
    d.vy = hold ? -10.5 : -8.5;
    audio.sfx('spring');
  }
  if (onSafeGround(d)) {
    h.safeX = centerX(d) - h.w / 2;
    h.safeY = d.y + d.h - h.h;
  }
  d.anim += Math.abs(d.vx) * 0.07;
  seatRider(h, d);
  h.frame = h.atk > 0 ? 'rideAtk' : 'ride';
  if (h.atk > 0) h.atk--;
  if (h.invuln > 0) h.invuln--;
  if (inHazard(d)) hazardHero(h);
}

function dinoAbility(d) {
  if (d.type === 'trike') {
    d.charge = 36;
    d.cd = 50;
    d.hitTrex = false;
    audio.sfx('charge');
  } else {
    d.honk = 24;
    d.cd = 70;
    audio.sfx('honk');
    const cx = centerX(d);
    for (const e of W.level.ents) {
      if (isEnemy(e) && e.mode === 'live' && Math.abs(centerX(e) - cx) < 140 && Math.abs(e.y - d.y) < 110) {
        e.stun = 200;
        e.vx = 0;
        if (e.type === 'ptero') e.swoop = 0;
      }
      if (e.type === 'trex' && e.mode === 'walk' && Math.abs(centerX(e) - cx) < 180) {
        e.mode = 'dazed';
        e.t = 60;
      }
    }
    for (let i = 0; i < 3; i++) {
      W.level.fx.push({ x: cx + d.facing * 20, y: d.y + 4, vx: d.facing * (1 + i), vy: -0.5 + i * 0.5, life: 24, size: 3, color: '#d8a848', grav: 0 });
    }
  }
}

function chargeHits(d) {
  const front = { x: d.facing > 0 ? d.x + d.w - 4 : d.x - 10, y: d.y - 4, w: 14, h: d.h + 4 };
  breakRocksIn(front);
  for (const e of W.level.ents) {
    if (isEnemy(e) && e.mode === 'live' && overlap(front, e)) damageEnemy(e, 9, centerX(d));
    if (e.type === 'trex' && !d.hitTrex && overlap(front, e)) {
      d.hitTrex = true;
      damageTrex(e, 3);
      d.charge = 0;
      d.vx = -d.facing * 3;
      d.vy = -3;
      shake(6);
    }
  }
}

function updateDino(d) {
  if (d.rider) return;
  d.t++;
  if (d.mountCd > 0) d.mountCd--;
  if (d.cd > 0) d.cd--;
  if (d.honk > 0) d.honk--;
  if (d.state === 'scared') {
    d.vx = d.fleeDir * 2.4;
    if (d.t > 70) {
      d.state = 'idle';
      d.vx = 0;
    }
  } else {
    if (d.t % 160 === 0) d.vx = [-0.4, 0, 0.4, 0][(d.t / 160 + Math.floor(d.homeX)) % 4];
    if (Math.abs(d.x - d.homeX) > 80) d.vx = Math.sign(d.homeX - d.x) * 0.4;
  }
  d.vy = Math.min(MAX_FALL, d.vy + GRAV);
  const v = d.vx;
  if (moveX(d)) d.vx = d.state === 'scared' ? 0 : -v;
  moveY(d, { platforms: true });
  if (d.onGround && d.vx) {
    const ahead = d.vx > 0 ? d.x + d.w + 2 : d.x - 2;
    const below = tileAt(Math.floor(ahead / T), Math.floor((d.y + d.h + 2) / T));
    if (!isSolid(below) && below !== '=') d.vx = d.state === 'scared' ? 0 : -d.vx;
  }
  if (d.vx) d.facing = Math.sign(d.vx);
  d.anim += Math.abs(d.vx) * 0.07;
  if (inHazard(d)) respawnDino(d);
}

// ------------------------------------------------------------------ enemies

export const isEnemy = e => e.type === 'compy' || e.type === 'raptor' || e.type === 'dilo' || e.type === 'ptero';

export function damageEnemy(e, dmg, fromX) {
  if (e.mode !== 'live' || e.invuln > 0) return false;
  e.hp -= e.stun > 0 ? 99 : dmg;
  e.flash = 8;
  e.invuln = 10;
  const dir = centerX(e) < fromX ? -1 : 1;
  if (e.hp <= 0) {
    e.mode = 'dead';
    e.vx = dir * 1.5;
    e.vy = -4;
    G.score += SCORES[e.type];
    popup(String(SCORES[e.type]), centerX(e), e.y - 4);
    audio.sfx('defeat');
    W.level.ents.push({ type: 'gemDrop', x: centerX(e) - 7, y: e.y, w: 14, h: 14, vx: -dir, vy: -4, color: Math.floor(Math.random() * 3), life: 480 });
  } else {
    e.vx = dir * 2;
    if (e.type !== 'ptero') e.vy = -2.5;
    audio.sfx('hit');
  }
  return true;
}

function updateEnemy(e) {
  const L = W.level;
  if (!e.active) {
    if (e.x < L.camX + VIEW_W + 40 && e.x + e.w > L.camX - 80) e.active = true;
    else return;
  }
  e.t++;
  if (e.flash > 0) e.flash--;
  if (e.invuln > 0) e.invuln--;
  if (e.mode === 'dead') {
    e.vy += 0.4;
    e.x += e.vx;
    e.y += e.vy;
    if (e.y > ROWS * T + 40) e.gone = true;
    return;
  }
  if (e.stun > 0) {
    e.stun--;
    if (e.type !== 'ptero') {
      e.vy = Math.min(MAX_FALL, e.vy + GRAV);
      moveY(e);
    }
    contactHeroes(e);
    return;
  }
  const tgt = nearestHero(e);
  const dx = tgt ? centerX(tgt) - centerX(e) : 0, dy = tgt ? tgt.y - e.y : 0;
  switch (e.type) {
    case 'compy': {
      e.vy = Math.min(MAX_FALL, e.vy + GRAV);
      if (e.onGround) {
        e.vx *= 0.8;
        if (e.t % 50 === 0 && tgt && Math.abs(dx) < 220) {
          e.facing = Math.sign(dx) || -1;
          e.vx = e.facing * 1.8;
          e.vy = -4;
        }
      }
      const v = e.vx;
      if (moveX(e)) e.vx = -v;
      moveY(e);
      break;
    }
    case 'raptor': {
      e.vy = Math.min(MAX_FALL, e.vy + GRAV);
      const chasing = tgt && Math.abs(dx) < 160 && Math.abs(dy) < 50;
      if (chasing) {
        e.vx += (Math.sign(dx) * 2.8 - e.vx) * 0.08;
        e.facing = Math.sign(dx) || e.facing;
      } else e.vx = e.facing * 0.8;
      e.bite = chasing && Math.abs(dx) < 50;
      if (moveX(e)) {
        if (chasing && e.onGround) e.vy = -6.5;
        else e.facing = -e.facing;
      }
      moveY(e);
      if (e.onGround && !chasing) {
        const ahead = e.facing > 0 ? e.x + e.w + 2 : e.x - 2;
        const below = tileAt(Math.floor(ahead / T), Math.floor((e.y + e.h + 2) / T));
        if (!isSolid(below) && below !== '=') e.facing = -e.facing;
      }
      break;
    }
    case 'dilo': {
      e.vy = Math.min(MAX_FALL, e.vy + GRAV);
      e.vx *= 0.85;
      moveX(e);
      moveY(e);
      if (tgt) e.facing = Math.sign(dx) || e.facing;
      if (e.spit > 0) {
        e.spit--;
        if (e.spit === 10 && tgt) {
          const mx = e.facing > 0 ? e.x + e.w + 4 : e.x - 12;
          L.ents.push({ type: 'venom', x: mx, y: e.y + 2, w: 10, h: 10, vx: Math.max(-4, Math.min(4, dx / 38)), vy: -3.6, life: 140 });
          audio.sfx('spit');
        }
      } else if (tgt && Math.abs(dx) < 250 && Math.abs(dy) < 120 && --e.cool <= 0) {
        e.spit = 26;
        e.cool = 120;
      }
      break;
    }
    case 'ptero': {
      if (e.swoop > 0) {
        e.swoop--;
        e.x += e.vx;
        e.y += e.vy;
        if (e.swoop < 20) e.vy -= 0.25;
      } else {
        e.x += e.vx;
        if (e.x < e.baseX - 96) e.vx = 0.9;
        if (e.x > e.baseX + 96) e.vx = -0.9;
        e.y += (e.baseY + Math.sin(e.t * 0.05) * 8 - e.y) * 0.06;
        if (e.cool > 0) e.cool--;
        else if (tgt && Math.abs(dx) < 60 && dy > 24) {
          e.swoop = 54;
          e.cool = 160;
          const d = Math.hypot(dx, dy) || 1;
          e.vx = dx / d * 3.4;
          e.vy = dy / d * 3.4;
        }
      }
      e.facing = e.vx > 0 ? 1 : -1;
      break;
    }
  }
  if (e.type !== 'ptero' && e.y > ROWS * T) e.gone = true;
  if (e.type !== 'ptero' && inHazard(e)) e.gone = true;
  contactHeroes(e);
}

function contactHeroes(e) {
  for (const h of activeHeroes()) {
    const body = heroBody(h);
    if (!overlap(body, e) || e.mode !== 'live') continue;
    if (e.stun > 0) {
      damageEnemy(e, 9, centerX(body));
      continue;
    }
    if (body.vy > 0 && body.y + body.h - e.y < 12) {
      damageEnemy(e, body === h ? 1 : 9, centerX(body));
      const dev = G.players[h.player].dev;
      body.vy = input.held(dev, 'jump') ? -7 : -4.5;
      if (body === h) h.jumps = 1;
      continue;
    }
    if (body !== h && body.charge > 0) {
      damageEnemy(e, 9, centerX(body));
      continue;
    }
    hurtHero(h, 1, centerX(e));
  }
}

// ------------------------------------------------------------------ T-Rex boss

export function makeTrex(x, base) {
  return { type: 'trex', x, y: base - 80, w: 80, h: 80, hp: 18, maxHp: 18, mode: 'wait', t: 0, facing: -1, vx: 0, vy: 0, flash: 0, invuln: 0, anim: 0, onGround: true };
}

export function damageTrex(e, dmg) {
  if (e.invuln > 0 || e.mode === 'wait' || e.mode === 'defeat' || e.mode === 'enter') return;
  if (e.mode === 'dazed') dmg *= 2;
  e.hp -= dmg;
  e.flash = 10;
  e.invuln = 24;
  audio.sfx('hit');
  shake(3);
  if (e.hp <= 0) {
    e.hp = 0;
    e.mode = 'defeat';
    e.t = 0;
    G.score += 5000;
    popup('5000', centerX(e), e.y, '#d8a848');
    audio.stopMusic();
    audio.sfx('roar');
  }
}

function dropRock(x) {
  W.level.ents.push({ type: 'rock', x: x - 9, y: 2 * T, w: 18, h: 18, vy: 0, warn: 45 });
}

function updateTrex(e) {
  const L = W.level, [ax0, ax1] = L.arena;
  e.t++;
  if (e.flash > 0) e.flash--;
  if (e.invuln > 0) e.invuln--;
  const tgt = nearestHero(e);
  const gravity = () => {
    e.vy = Math.min(MAX_FALL, e.vy + GRAV);
    e.y += e.vy;
    if (e.y + e.h >= GROUND_Y) {
      const landed = e.vy > 2;
      e.y = GROUND_Y - e.h;
      e.vy = 0;
      e.onGround = true;
      return landed;
    }
    e.onGround = false;
    return false;
  };
  switch (e.mode) {
    case 'wait': return;
    case 'enter':
      e.x -= 1.2;
      e.anim += 0.1;
      if (e.x <= ax1 - 150) { e.mode = 'roar'; e.t = 0; audio.sfx('roar'); shake(10); }
      break;
    case 'roar':
      if (e.t > 70) { e.mode = 'walk'; e.t = 0; }
      break;
    case 'walk':
      if (tgt) e.facing = centerX(tgt) < centerX(e) ? -1 : 1;
      e.x += e.facing * 1.1;
      e.anim += 0.1;
      if (e.t > 140) { e.mode = 'windup'; e.t = 0; audio.sfx('roar'); }
      break;
    case 'windup':
      if (e.t > 45) { e.mode = 'charge'; e.t = 0; }
      break;
    case 'charge':
      e.x += e.facing * 4.4;
      e.anim += 0.3;
      if (e.x <= ax0 + 4 || e.x + e.w >= ax1 - 4) {
        e.x = Math.max(ax0 + 4, Math.min(ax1 - 4 - e.w, e.x));
        e.mode = 'dazed';
        e.t = 0;
        shake(12);
        audio.sfx('stomp');
        for (let i = 0; i < 4; i++) dropRock(ax0 + 40 + Math.random() * (ax1 - ax0 - 80));
      }
      break;
    case 'dazed':
      if (e.t > 170) { e.mode = 'jump'; e.t = 0; e.vy = -7.5; e.onGround = false; }
      break;
    case 'jump':
      e.x += e.facing * 1.5;
      if (gravity()) {
        shake(10);
        audio.sfx('stomp');
        for (let i = 0; i < 3; i++) dropRock(ax0 + 40 + Math.random() * (ax1 - ax0 - 80));
        e.mode = 'walk';
        e.t = 0;
      }
      break;
    case 'defeat':
      e.facing = 1;
      e.anim += 0.3;
      if (e.t > 60) e.x += 3.5;
      if (e.t === 150) {
        L.ents.push({ type: 'chest', x: (ax0 + ax1) / 2 - 20, y: -40, w: 40, h: 30, vy: 0, landed: false });
        e.gone = true;
      }
      return;
  }
  e.x = Math.max(ax0 + 4, Math.min(ax1 - 4 - e.w, e.x));
  if (e.mode !== 'jump') gravity();
  // Touching the T-Rex hurts, unless you bounce on its head.
  const head = { x: e.facing < 0 ? e.x : e.x + e.w - 40, y: e.y, w: 40, h: 18 };
  for (const h of activeHeroes()) {
    const body = heroBody(h);
    if (!overlap(body, e)) continue;
    if (body.vy > 0 && overlap(body, head) && body.y + body.h - e.y < 16) {
      damageTrex(e, 2);
      body.vy = -7;
      if (body === h) h.jumps = 1;
    } else if (e.mode !== 'dazed') hurtHero(h, 1, centerX(e));
  }
}

// ------------------------------------------------------------------ items & projectiles

function collect(e) {
  for (const h of activeHeroes()) {
    const body = heroBody(h);
    if (overlap(body, e) || (h.riding && overlap(h, e))) return h;
  }
  return null;
}

export function addGem(x, y) {
  G.gems++;
  G.totalGems++;
  G.score += 50;
  audio.sfx('gem');
  sparkle(x, y, 6, ['#ffffff', '#d8a048']);
  if (G.gems >= 100) {
    G.gems -= 100;
    G.lives++;
    audio.sfx('oneup');
    popup('1UP', x, y - 10, '#7a9a5a');
  }
}

function giveHeart(h, x, y) {
  if (h.hp < 3) h.hp++;
  else G.score += 500;
  audio.sfx('heart');
  sparkle(x, y, 8, ['#ffffff', '#b82434']);
}

function bounceItem(e) {
  e.vy = Math.min(MAX_FALL, e.vy + 0.35);
  const v = e.vx;
  if (moveX(e)) e.vx = -v;
  moveY(e, { platforms: true });
  if (e.onGround) e.vx *= 0.9;
  if (--e.life <= 0 || e.y > ROWS * T) e.gone = true;
}

function updateItem(e) {
  const L = W.level;
  switch (e.type) {
    case 'gem': {
      if (collect(e)) { e.gone = true; addGem(centerX(e), e.y + 7); }
      break;
    }
    case 'gemDrop':
      bounceItem(e);
      if (e.life < 450 && collect(e)) { e.gone = true; addGem(centerX(e), e.y + 7); }
      break;
    case 'heart': {
      const h = collect(e);
      if (h) { e.gone = true; giveHeart(h, centerX(e), e.y); }
      break;
    }
    case 'heartDrop': {
      bounceItem(e);
      const h = e.life < 870 && collect(e);
      if (h) { e.gone = true; giveHeart(h, centerX(e), e.y); }
      break;
    }
    case 'checkpoint':
      if (!e.lit && collect(e)) {
        e.lit = true;
        G.checkpoint = { world: G.world, x: e.x + 2, y: e.y + e.h };
        audio.sfx('checkpoint');
        popup('CHECKPOINT!', centerX(e), e.y - 8, '#d8a848');
        let revived = false;
        for (const id of HERO_IDS) {
          const h = G.heroes[id];
          if (h.state === 'down') { h.state = 'ok'; h.hp = 3; revived = true; }
          if (h.state === 'bubble') { reviveHero(h, e.x, e.y + 10, 3); revived = true; }
          if (h.state === 'ok') h.hp = Math.max(h.hp, 2);
        }
        if (revived) toast('TEAM RESTORED!');
      }
      break;
    case 'stone': {
      e.x += e.vx;
      e.vy += 0.05;
      e.y += e.vy;
      if (--e.life <= 0) e.gone = true;
      const tc = tileAt(Math.floor((e.x + 4) / T), Math.floor((e.y + 4) / T));
      if (isSolid(tc)) { e.gone = true; dust(e.x + 4, e.y + 4, 2); }
      for (const o of L.ents) {
        if (e.gone) break;
        if (isEnemy(o) && o.mode === 'live' && overlap(e, o)) { damageEnemy(o, 1, e.x - e.vx * 4); e.gone = true; }
        else if (o.type === 'target' && !o.hit && overlap(e, o)) { hitTarget(o); e.gone = true; }
        else if (o.type === 'trex' && overlap(e, o)) { damageTrex(o, 1); e.gone = true; }
      }
      break;
    }
    case 'venom': {
      e.x += e.vx;
      e.vy += 0.18;
      e.y += e.vy;
      if (--e.life <= 0 || isSolid(tileAt(Math.floor((e.x + 5) / T), Math.floor((e.y + 5) / T)))) {
        e.gone = true;
        sparkle(e.x + 5, e.y + 5, 4, ['#7a9a2a', '#a8b860']);
      }
      for (const h of activeHeroes()) {
        if (!e.gone && overlap(heroBody(h), e)) { hurtHero(h, 1, e.x); e.gone = true; }
      }
      break;
    }
    case 'rock':
      if (e.warn > 0) { e.warn--; break; }
      e.vy = Math.min(8, e.vy + 0.4);
      e.y += e.vy;
      for (const h of activeHeroes()) if (overlap(heroBody(h), e)) hurtHero(h, 1, centerX(e));
      if (e.y + e.h >= GROUND_Y) {
        e.gone = true;
        debris(centerX(e), GROUND_Y - 6, '#8a7a7a', 5);
        audio.sfx('break');
      }
      break;
    case 'chest':
      if (!e.landed) {
        e.vy = Math.min(8, e.vy + 0.3);
        e.y += e.vy;
        if (e.y + e.h >= GROUND_Y) {
          e.y = GROUND_Y - e.h;
          e.landed = true;
          shake(4);
          audio.sfx('stomp');
          sparkle(centerX(e), e.y, 16);
        }
      }
      break;
  }
}

// ------------------------------------------------------------------ per-frame update

export function updateActors() {
  const L = W.level;
  for (const e of L.ents) if (e.type === 'brachio') updateBrachio(e);
  for (const id of HERO_IDS) {
    const h = G.heroes[id];
    if (h.player !== null) updateHero(h);
  }
  updateRestingHeroes();
  for (const e of L.ents) {
    if (e.gone) continue;
    if (e.type === 'trike' || e.type === 'para') updateDino(e);
    else if (isEnemy(e)) updateEnemy(e);
    else if (e.type === 'trex') updateTrex(e);
    else updateItem(e);
  }
  updateGates();
  L.ents = L.ents.filter(e => !e.gone);
  audio.layer = activeHeroes().some(h => h.riding);
}
