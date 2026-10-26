// Level designs. Tiles:
//   # ground   S stone block   C cracked rock (Ace's club or a Triceratops charge breaks it)
//   = one-way ledge   ^ spikes   L lava / tar (hurts)   G gate (opened by hitting its target)
//   ? gem block   H heart block   U used block   J bouncy leaf
// Entities placed with row(): o gem, h heart
// Levels are ROWS tall unless they say otherwise. Helpers like stairs() and
// enemy() build on the current floor row, which floor() moves (for caves).
import { ROWS, GROUND } from './constants.js';

class Builder {
  constructor(w, rows = ROWS) {
    this.w = w;
    this.rows = rows;
    this.gy = GROUND;
    this.grid = Array.from({ length: rows }, () => Array(w).fill(' '));
    this.ents = [];
    this.gates = {};
    this.startX = 3;
    this.startY = GROUND;
    this.goalX = null;
    this.goalY = GROUND;
    this.bossArena = null;
  }
  set(x, y, c) {
    if (x >= 0 && x < this.w && y >= 0 && y < this.rows) this.grid[y][x] = c;
  }
  floor(y) {
    this.gy = y;
    return this;
  }
  ground(x0, x1, top = this.gy) {
    return this.fill(x0, top, x1, this.rows - 1, '#');
  }
  fill(x0, y0, x1, y1, c) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) this.set(x, y, c);
    return this;
  }
  row(x, y, str) {
    [...str].forEach((c, i) => {
      if (c === ' ') return;
      if (c === 'o') this.ents.push({ type: 'gem', x: x + i, y });
      else if (c === 'h') this.ents.push({ type: 'heart', x: x + i, y });
      else this.set(x + i, y, c);
    });
    return this;
  }
  // A pool of lava / tar at the bottom of a gap.
  pool(x0, x1) {
    return this.fill(x0, this.rows - 2, x1, this.rows - 1, 'L');
  }
  stairs(x, n, dir = 1) {
    for (let i = 0; i < n; i++) {
      const h = dir > 0 ? i + 1 : n - i;
      this.fill(x + i, this.gy - h, x + i, this.gy - 1, 'S');
    }
    return this;
  }
  // A cracked rock wall too tall to jump over.
  boulders(x, w = 2, h = 6) {
    return this.fill(x, this.gy - h, x + w - 1, this.gy - 1, 'C');
  }
  pillar(x, h, w = 2) {
    return this.fill(x, this.gy - h, x + w - 1, this.gy - 1, 'S');
  }
  spikes(x0, x1) {
    return this.fill(x0, this.gy - 1, x1, this.gy - 1, '^');
  }
  spring(x) {
    this.set(x, this.gy - 1, 'J');
    return this;
  }
  gate(x, id, h = 6) {
    this.fill(x, this.gy - h, x, this.gy - 1, 'G');
    (this.gates[id] = this.gates[id] || []).push(...Array.from({ length: h }, (_, i) => [x, this.gy - h + i]));
    return this;
  }
  // y is the row the target's post stands in.
  target(x, id, y = this.gy - 1) {
    this.ents.push({ type: 'target', x, y, id });
    return this;
  }
  arc(x0, x1, top) {
    const mid = (x0 + x1) / 2, half = (x1 - x0) / 2 || 1;
    for (let x = x0; x <= x1; x++) {
      const k = (x - mid) / half;
      this.ents.push({ type: 'gem', x, y: Math.round(top + k * k * 3) });
    }
    return this;
  }
  enemy(type, x, y = this.gy - 1) {
    this.ents.push({ type, x, y });
    return this;
  }
  trike(x, y = this.gy - 1) { this.ents.push({ type: 'trike', x, y }); return this; }
  para(x, y = this.gy - 1) { this.ents.push({ type: 'para', x, y }); return this; }
  brachio(x) { this.ents.push({ type: 'brachio', x, y: this.gy - 1 }); return this; }
  checkpoint(x, y = this.gy - 1) { this.ents.push({ type: 'checkpoint', x, y }); return this; }
  start(x) { this.startX = x; this.startY = this.gy; return this; }
  goal(x) { this.goalX = x; this.goalY = this.gy; return this; }
  boss(x0, x1) { this.bossArena = [x0, x1]; return this; }
  done(meta) {
    return {
      ...meta, w: this.w, rows: this.rows, grid: this.grid, ents: this.ents, gates: this.gates,
      startX: this.startX, startY: this.startY, goalX: this.goalX, goalY: this.goalY, bossArena: this.bossArena,
    };
  }
}

function fernJungle() {
  const L = new Builder(212);
  L.ground(0, 50).start(3);
  L.row(8, 11, 'o o o');
  L.row(14, 10, '?S?S?');
  L.enemy('compy', 18).enemy('compy', 22);
  L.trike(27);
  L.row(33, 7, 'ooo');
  L.boulders(34);
  L.row(39, 11, 'ooo');
  L.enemy('raptor', 45);
  L.arc(50, 55, 9);
  L.ground(55, 121);
  L.row(60, 10, '===').row(60, 9, 'ooo');
  L.enemy('ptero', 64, 6);
  L.spikes(70, 72).target(73, 1).gate(76, 1);
  L.enemy('compy', 80);
  L.brachio(85);
  L.fill(92, 6, 110, 13, '#');
  L.row(95, 5, 'o o o o o');
  L.enemy('compy', 103, 5);
  L.row(107, 2, 'h');
  L.checkpoint(114);
  L.enemy('dilo', 119);
  L.row(122, 10, '==').arc(121, 124, 8);
  L.ground(125, 166);
  // Zipper-only bonus ledge: too high for a single jump.
  L.row(130, 7, '==').row(130, 6, 'oo').row(130, 5, 'oo');
  L.row(140, 10, '?H?');
  L.enemy('raptor', 145).enemy('compy', 150);
  L.enemy('ptero', 156, 7);
  L.arc(166, 170, 8);
  L.ground(170, 211);
  L.enemy('raptor', 176);
  L.spring(181).row(180, 3, 'ooo');
  L.stairs(185, 4);
  L.goal(198);
  return L.done({ name: 'FERN JUNGLE', theme: 'jungle', music: 'jungle', time: 400 });
}

function volcanoValley() {
  const L = new Builder(220);
  L.ground(0, 30).start(3);
  L.para(10);
  L.row(14, 10, '?S?');
  L.enemy('compy', 20);
  L.pool(31, 36).row(33, 11, '==').row(33, 10, 'oo');
  L.ground(37, 70);
  L.enemy('dilo', 44);
  L.boulders(50).row(49, 6, 'oooo');
  L.enemy('raptor', 58);
  L.pool(71, 80).row(73, 11, '==').row(77, 10, '==').row(76, 6, 'ooo');
  L.enemy('ptero', 75, 5);
  L.ground(81, 120);
  L.spikes(86, 88).row(85, 10, '=====').row(85, 9, 'ooooo');
  L.checkpoint(96);
  L.trike(100);
  L.enemy('dilo', 106).stairs(110, 2).enemy('dilo', 112, 11);
  L.boulders(116);
  L.pool(121, 128).row(123, 11, '==').row(126, 10, '==');
  L.ground(129, 219);
  L.enemy('raptor', 135).enemy('raptor', 140);
  L.target(146, 1, 9).row(145, 10, '===').gate(150, 1);
  L.enemy('ptero', 160, 6);
  L.row(166, 10, '?H?');
  L.enemy('compy', 172).enemy('compy', 175).enemy('dilo', 182);
  L.stairs(190, 4);
  L.goal(205);
  return L.done({ name: 'VOLCANO VALLEY', theme: 'volcano', music: 'volcano', time: 400 });
}

function mistySwamp() {
  const L = new Builder(220);
  L.ground(0, 24).start(3);
  L.trike(8);
  L.enemy('compy', 16);
  L.pool(25, 29).row(26, 11, '==');
  L.ground(30, 72);
  L.boulders(36);
  L.enemy('raptor', 44);
  L.brachio(51);
  L.fill(58, 6, 72, 13, '#');
  L.row(60, 5, 'ooooo').enemy('ptero', 66, 2);
  L.pool(73, 80).row(75, 10, '==').row(78, 11, '==');
  L.ground(81, 130);
  L.para(86);
  L.checkpoint(92);
  L.enemy('dilo', 100).enemy('raptor', 106);
  L.spikes(110, 113).target(114, 1).gate(117, 1);
  L.row(122, 7, '==').row(122, 6, 'oo').row(122, 5, 'hh');
  L.pool(131, 140).row(133, 10, '==').row(137, 9, '==').row(137, 8, 'oo');
  L.ground(141, 219);
  L.enemy('ptero', 146, 6).enemy('ptero', 156, 7);
  L.row(150, 10, '?H?S?');
  L.enemy('raptor', 162).enemy('raptor', 168).enemy('compy', 172);
  L.boulders(178);
  L.enemy('dilo', 186);
  L.stairs(192, 4);
  L.goal(205);
  return L.done({ name: 'MISTY SWAMP', theme: 'swamp', music: 'swamp', time: 400 });
}

// Three screens tall: drop down a shaft, cross an underground lake, ride a
// Brachiosaurus up the cavern wall, then climb back out to the surface.
function crystalCaves() {
  const L = new Builder(190, 46);
  // Entrance tunnel.
  L.floor(12).ground(0, 22).start(3);
  L.fill(0, 0, 34, 3, '#');
  L.row(7, 9, 'o o o');
  L.row(12, 8, '?S?');
  L.enemy('compy', 17);
  // The shaft down, with ledges to break the fall.
  L.row(24, 17, '====').row(24, 16, 'oooo');
  L.row(30, 22, '====').row(30, 21, 'oooo');
  L.row(24, 27, '====').row(24, 26, 'oooo');
  // Lower tunnel.
  L.fill(35, 0, 70, 23, '#');
  L.floor(32).ground(23, 70);
  L.checkpoint(28);
  L.trike(38);
  L.enemy('raptor', 47);
  L.enemy('dilo', 53);
  L.boulders(58, 2, 8).row(61, 29, 'h');
  L.spikes(64, 65).row(64, 28, 'oo');
  // Underground lake under a tall cavern.
  L.fill(71, 0, 120, 9, '#');
  L.fill(71, 43, 90, 45, 'L');
  L.row(73, 31, '===').row(79, 29, '===').row(85, 31, '===');
  L.arc(73, 87, 25);
  L.enemy('ptero', 82, 23);
  L.ground(91, 120);
  L.brachio(92);
  L.row(96, 18, 'ooo');
  // Up on the shelf: the upper tunnel, with a gate only Echo's sling can open.
  L.floor(24).ground(99, 150);
  L.fill(121, 0, 150, 15, '#');
  L.checkpoint(104);
  L.enemy('raptor', 112);
  L.target(117, 1).gate(124, 1, 8);
  L.row(128, 21, 'ooo');
  L.enemy('dilo', 132);
  L.row(136, 20, '?H?');
  L.enemy('compy', 141).enemy('compy', 145);
  // Climb out over a crystal pit (or bounce up on the leaf).
  L.ground(151, 165).spikes(151, 159).spring(160).spikes(161, 165);
  L.row(152, 20, '===').row(157, 16, '===').row(162, 12, '===');
  L.row(157, 15, 'ooo').row(162, 11, 'ooo');
  L.enemy('ptero', 158, 6);
  L.floor(8).ground(166, 189);
  L.enemy('raptor', 172);
  L.arc(174, 178, 4);
  L.goal(182);
  return L.done({ name: 'CRYSTAL CAVES', theme: 'cave', music: 'cave', time: 400 });
}

function trexLair() {
  const L = new Builder(70);
  L.fill(0, 0, 69, 1, 'S');
  L.ground(0, 69).start(3);
  L.enemy('compy', 12).enemy('compy', 16);
  L.row(18, 10, '?H?');
  L.enemy('raptor', 24);
  L.checkpoint(30);
  L.trike(40);
  L.fill(66, 2, 69, 13, 'S');
  L.boss(36, 65);
  return L.done({ name: "T-REX'S LAIR", theme: 'lair', music: 'swamp', time: 400 });
}

export const LEVELS = [fernJungle(), volcanoValley(), mistySwamp(), crystalCaves(), trexLair()];
