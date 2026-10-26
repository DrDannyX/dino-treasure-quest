// Shared game state, tile physics and visual-effect helpers.
import { TILE as T } from './constants.js';

export const G = {
  state: 'title', t: 0, frame: 0,
  world: 0, lives: 5, gems: 0, totalGems: 0, score: 0,
  players: [], // { idx, dev, hero, startHero }
  heroes: {}, // A / E / Z hero objects, kept across levels
  join: [],
  paused: false, toast: null, shake: 0, menu: 0, track: 0, hi: 0,
  checkpoint: null,
  touch: false,
};

// The level being played: grid, entities, effects, camera.
export const W = { level: null };

export const SOLID = new Set(['#', 'S', 'C', 'G', '?', 'H', 'U', 'J']);
export const isSolid = c => SOLID.has(c);

export function tileAt(tx, ty) {
  const L = W.level;
  if (tx < 0 || tx >= L.w) return 'S';
  if (ty < 0 || ty >= L.rows) return ' ';
  return L.grid[ty][tx];
}

export function setTile(tx, ty, c) {
  if (ty >= 0 && ty < W.level.rows && tx >= 0 && tx < W.level.w) W.level.grid[ty][tx] = c;
}

export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const centerX = e => e.x + e.w / 2;

export function moveX(e) {
  e.x += e.vx;
  const y0 = Math.floor(e.y / T), y1 = Math.floor((e.y + e.h - 0.01) / T);
  if (e.vx > 0) {
    const tx = Math.floor((e.x + e.w - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) if (isSolid(tileAt(tx, ty))) { e.x = tx * T - e.w; return true; }
  } else if (e.vx < 0) {
    const tx = Math.floor(e.x / T);
    for (let ty = y0; ty <= y1; ty++) if (isSolid(tileAt(tx, ty))) { e.x = (tx + 1) * T; return true; }
  }
  return false;
}

// Vertical move with one-way ledges and moving platforms (the Brachiosaurus).
// Returns { floor: [...] } or { ceiling: [tx...], ty } when something was hit.
export function moveY(e, opts = {}) {
  const prevBottom = e.y + e.h;
  e.y += e.vy;
  e.onGround = false;
  e.standOn = null;
  const x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w - 0.01) / T);
  if (e.vy >= 0) {
    if (opts.platforms) {
      for (const p of W.level.platforms) {
        if (e.x + e.w > p.x && e.x < p.x + p.w && prevBottom <= p.y + 1 + Math.max(0, -p.dy) && e.y + e.h >= p.y) {
          e.y = p.y - e.h;
          e.vy = 0;
          e.onGround = true;
          e.standOn = p;
          return { floor: [], platform: p };
        }
      }
    }
    const ty = Math.floor((e.y + e.h - 0.01) / T);
    const under = [];
    for (let tx = x0; tx <= x1; tx++) {
      const c = tileAt(tx, ty);
      if (isSolid(c) || (c === '=' && prevBottom <= ty * T + 0.5)) under.push({ tx, ty, c });
    }
    if (under.length) {
      e.y = ty * T - e.h;
      e.vy = 0;
      e.onGround = true;
      return { floor: under };
    }
  } else {
    const ty = Math.floor(e.y / T);
    const hits = [];
    for (let tx = x0; tx <= x1; tx++) if (isSolid(tileAt(tx, ty))) hits.push(tx);
    if (hits.length === 1 && x0 !== x1 && opts.cornerSlip) {
      // Clipped a block corner by a few pixels: nudge sideways instead of bonking.
      const tx = hits[0];
      const over = tx === x0 ? (tx + 1) * T - e.x : e.x + e.w - tx * T;
      if (over <= 4) {
        e.x += tx === x0 ? over : -over;
        return null;
      }
    }
    if (hits.length) {
      e.y = (ty + 1) * T;
      e.vy = 0;
      return { ceiling: hits, ty };
    }
  }
  return null;
}

// True when the tile under the entity's middle is solid ground (used to
// remember a safe spot to respawn after falling into a pit or lava).
export function onSafeGround(e) {
  if (!e.onGround || e.standOn) return false;
  const ty = Math.floor((e.y + e.h + 1) / T);
  const l = tileAt(Math.floor((e.x - 6) / T), ty), r = tileAt(Math.floor((e.x + e.w + 6) / T), ty);
  return (isSolid(l) || l === '=') && (isSolid(r) || r === '=');
}

export function inHazard(e) {
  if (e.y > W.level.rows * T + 8) return true;
  const ty = Math.floor((e.y + e.h - 4) / T);
  for (let tx = Math.floor(e.x / T); tx <= Math.floor((e.x + e.w - 1) / T); tx++) {
    if (tileAt(tx, ty) === 'L') return true;
  }
  return false;
}

export function onSpikes(e) {
  const ty = Math.floor((e.y + e.h - 1) / T);
  for (let tx = Math.floor((e.x + 2) / T); tx <= Math.floor((e.x + e.w - 3) / T); tx++) {
    if (tileAt(tx, ty) === '^' && e.y + e.h > ty * T + 8) return true;
  }
  return false;
}

// ------------------------------------------------------------------ effects

export function popup(text, x, y, color = '#ffffff') {
  W.level.popups.push({ text, x, y, t: 0, color });
}

export function sparkle(x, y, n = 6, colors = ['#ffffff', '#d8a848']) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    W.level.fx.push({ x, y, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4, life: 20, size: 2, color: colors[i % colors.length], grav: 0 });
  }
}

export function dust(x, y, n = 4) {
  for (let i = 0; i < n; i++) {
    W.level.fx.push({ x: x + (i - n / 2) * 3, y, vx: (i - n / 2) * 0.3, vy: -0.4 - Math.random() * 0.4, life: 16, size: 3, color: 'rgba(255,255,255,0.6)', grav: 0 });
  }
}

export function debris(x, y, color, n = 6) {
  for (let i = 0; i < n; i++) {
    W.level.fx.push({
      x: x + (Math.random() - 0.5) * 12, y: y + (Math.random() - 0.5) * 12,
      vx: (Math.random() - 0.5) * 4, vy: -3 - Math.random() * 3, life: 50, size: 4, color, grav: 0.3,
    });
  }
}

export function shake(n) {
  G.shake = Math.max(G.shake, n);
}

export function toast(text) {
  G.toast = { text, t: 150 };
}
