// All of the game's pixel art, painted in code at load time.
import { paint, flipH, flipV, tint, addOutline, makeCanvas, pixelate, mix } from './gfx.js';
import { TILE, VIEW_W, VIEW_H } from './constants.js';

const OUTLINE = '#1a1020';
const SKIN = '#f2b98a', SKIN_D = '#c98a5e', BOOT = '#8a5a30', BOOT_D = '#5a3818';

// ------------------------------------------------------------------ heroes

export const HEROES = {
  A: {
    id: 'A', name: 'ACE', title: 'THE MIGHTY', ability: ['CLUB SMASH', 'BREAKS ROCKS'], weapon: 'club',
    speed: 2.0, jump: 6.4, doubleJump: false,
    tunic: '#9a3426', tunicD: '#5e1a12', tunicL: '#c8604a', hair: '#5e3018', hairD: '#38180a', letter: '#e0b860',
  },
  E: {
    id: 'E', name: 'ECHO', title: 'THE SHARPSHOOTER', ability: ['SLINGSHOT', 'HITS TARGETS'], weapon: 'sling',
    speed: 2.1, jump: 6.4, doubleJump: false,
    tunic: '#3a6e34', tunicD: '#20441c', tunicL: '#62944e', hair: '#b08050', hairD: '#7a5028', letter: '#e0d6c0',
  },
  Z: {
    id: 'Z', name: 'ZIPPER', title: 'THE ACROBAT', ability: ['DOUBLE JUMP', 'SPEAR POKE'], weapon: 'spear',
    speed: 2.4, jump: 6.2, doubleJump: true,
    tunic: '#2e5488', tunicD: '#1a3258', tunicL: '#5a7eb0', hair: '#2a2030', hairD: '#120c18', letter: '#e0b860',
  },
};

const LETTERS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  E: ['###', '#..', '##.', '#..', '###'],
  Z: ['###', '..#', '.#.', '#..', '###'],
};

// d: leg spread, lift: [front, back] raise, arm: front arm pose, bob: body offset.
const POSES = {
  stand: { d: 0, lift: [0, 0], arm: 'idle', bob: 0 },
  walk0: { d: 3, lift: [0, 0], arm: 'idle', bob: 0 },
  walk1: { d: 0, lift: [2, 0], arm: 'idle', bob: -1 },
  walk2: { d: -3, lift: [0, 0], arm: 'idle', bob: 0 },
  walk3: { d: 0, lift: [0, 2], arm: 'idle', bob: -1 },
  jump: { d: 2, lift: [3, 1], arm: 'idle', bob: 0 },
  fall: { d: 3, lift: [0, 1], arm: 'idle', bob: 0 },
  atk1: { d: 1, lift: [0, 0], arm: 'wind', bob: 0 },
  atk2: { d: 3, lift: [0, 0], arm: 'strike', bob: 0 },
  hurt: { d: 2, lift: [1, 1], arm: 'hurt', bob: 0 },
  ride: { ride: true, arm: 'idle', bob: 0 },
  rideAtk: { ride: true, arm: 'strike', bob: 0 },
  cheer: { d: 1, lift: [2, 2], arm: 'cheer', bob: -1 },
};

function paintWeapon(p, def, arm, hand) {
  const [hx, hy] = hand;
  if (def.weapon === 'club') {
    const bone = '#f0e2c0', boneD = '#c8b090';
    if (arm === 'wind') {
      p.line(hx, hy, hx - 6, hy - 8, boneD, 2);
      p.ellipse(hx - 7, hy - 9, 3, 3, bone);
    } else if (arm === 'strike') {
      p.line(hx, hy, hx + 8, hy, boneD, 3);
      p.ellipse(hx + 9, hy, 2.5, 3.5, bone);
      p.px(hx + 9, hy - 2, '#ffffff');
    } else if (arm !== 'cheer' && arm !== 'hurt') {
      p.line(hx, hy, hx + 3, hy - 9, boneD, 2);
      p.ellipse(hx + 3.5, hy - 10, 2.5, 3, bone);
    }
  } else if (def.weapon === 'sling') {
    const wood = '#a8743c';
    if (arm === 'strike') {
      p.line(hx + 1, hy + 2, hx + 1, hy - 2, wood, 2);
      p.px(hx, hy - 3, wood);
      p.px(hx + 2, hy - 3, wood);
      p.px(hx + 3, hy - 4, wood);
    } else if (arm === 'wind') {
      p.line(hx, hy, hx, hy - 4, wood, 2);
      p.line(hx - 1, hy - 4, hx - 5, hy - 2, '#e8e0d0', 1);
    } else if (arm !== 'cheer' && arm !== 'hurt') {
      p.line(hx, hy, hx + 1, hy - 4, wood, 2);
      p.px(hx, hy - 5, wood);
      p.px(hx + 2, hy - 5, wood);
    }
  } else if (def.weapon === 'spear') {
    const wood = '#a8743c', tip = '#c8d0e0', tipD = '#7a8498';
    if (arm === 'strike') {
      p.line(hx - 8, hy, hx + 8, hy, wood, 1);
      p.poly([[hx + 8, hy - 2], [hx + 13, hy + 0.5], [hx + 8, hy + 3]], tip);
      p.px(hx + 9, hy + 1, tipD);
    } else if (arm === 'wind') {
      p.line(hx - 9, hy + 1, hx + 4, hy - 1, wood, 1);
      p.poly([[hx + 4, hy - 3], [hx + 8, hy - 1], [hx + 4, hy + 1]], tip);
    } else if (arm !== 'cheer' && arm !== 'hurt') {
      p.line(hx + 1, hy + 8, hx + 2, hy - 15, wood, 1);
      p.poly([[hx, hy - 15], [hx + 2.5, hy - 21], [hx + 5, hy - 15]], tip);
      p.px(hx + 3, hy - 16, tipD);
    }
  }
}

function paintHero(def, pose) {
  const spr = paint(36, 34, p => {
    const { rect, px, ellipse, line } = p;
    const b = pose.bob;
    // legs
    if (pose.ride) {
      rect(16, 25, 6, 3, SKIN);
      rect(20, 26, 4, 4, BOOT);
      rect(20, 29, 4, 1, BOOT_D);
    } else {
      const front = 15 + pose.d, back = 13 - pose.d;
      const [lf, lb] = pose.lift;
      rect(back, 26, 3, 5 - lb, SKIN_D);
      rect(back, 31 - lb, 4, 2, BOOT_D);
      rect(front, 26, 3, 5 - lf, SKIN);
      rect(front, 31 - lf, 4, 2, BOOT);
      px(front + 3, 31 - lf, BOOT_D);
    }
    // back arm
    if (pose.arm === 'cheer' || pose.arm === 'hurt') line(12, 17 + b, 9, 9 + b, SKIN_D, 2);
    else line(12, 17 + b, 11, 22 + b, SKIN_D, 2);
    // tunic
    rect(11, 16 + b, 10, 10, def.tunic);
    rect(11, 16 + b, 1, 9, def.tunicL);
    rect(19, 16 + b, 2, 10, def.tunicD);
    for (let x = 11; x < 21; x += 2) px(x, 26 + b, x > 18 ? def.tunicD : def.tunic);
    rect(11, 23 + b, 10, 1, BOOT_D);
    [[12, 18], [18, 20], [13, 25], [18, 25]].forEach(([x, y]) => px(x, y + b, def.tunicD));
    LETTERS[def.id].forEach((row, y) => {
      for (let x = 0; x < 3; x++) if (row[x] === '#') px(14 + x, 17 + y + b, def.letter);
    });
    // head
    ellipse(16, 10 + b, 6, 6, SKIN);
    rect(17, 13 + b, 4, 3, SKIN);
    px(11, 10 + b, SKIN_D);
    px(11, 11 + b, SKIN_D);
    // hair
    ellipse(15.5, 6.5 + b, 6.5, 3.5, def.hair);
    rect(9, 6 + b, 3, 6, def.hair);
    if (def.id === 'A') {
      [[11, 3], [13, 2], [16, 2], [19, 3], [21, 5]].forEach(([x, y]) => px(x, y + b, def.hair));
      px(10, 12 + b, def.hairD);
      rect(12, 4 + b, 6, 1, def.hairD);
    } else if (def.id === 'E') {
      // short, tousled cut with a swept fringe
      [[12, 3], [14, 2], [17, 3]].forEach(([x, y]) => px(x, y + b, def.hair));
      rect(17, 7 + b, 4, 1, def.hair);
      px(20, 8 + b, def.hair);
      rect(13, 4 + b, 5, 1, '#e0b07a');
      px(10, 11 + b, def.hairD);
    } else {
      p.poly([[10, 6 + b], [11, 0 + b], [14, 5 + b]], def.hair);
      p.poly([[14, 5 + b], [16, 0 + b], [18, 5 + b]], def.hair);
      p.poly([[18, 5 + b], [21, 1 + b], [21, 7 + b]], def.hair);
      px(16, 2 + b, '#5a4a78');
      px(12, 3 + b, '#5a4a78');
    }
    px(19, 7 + b, def.hairD);
    // face
    if (pose.arm === 'hurt') {
      px(14, 9 + b, OUTLINE); px(15, 10 + b, OUTLINE); px(15, 9 + b, OUTLINE); px(14, 10 + b, OUTLINE);
      px(18, 9 + b, OUTLINE); px(19, 10 + b, OUTLINE); px(19, 9 + b, OUTLINE); px(18, 10 + b, OUTLINE);
      rect(17, 13 + b, 2, 2, '#8a2a2a');
    } else {
      rect(14, 9 + b, 2, 3, '#ffffff');
      rect(15, 9 + b, 1, 3, OUTLINE);
      rect(18, 9 + b, 2, 3, '#ffffff');
      rect(19, 9 + b, 1, 3, OUTLINE);
      px(15, 9 + b, '#ffffff');
      px(19, 9 + b, '#ffffff');
      rect(17, 14 + b, 3, 1, '#8a2a2a');
      px(20, 13 + b, '#8a2a2a');
      px(20, 12 + b, '#ff8f8f');
      px(13, 12 + b, '#ff8f8f');
    }
    px(22, 11 + b, SKIN_D);
    // front arm + weapon
    let hand;
    switch (pose.arm) {
      case 'wind': hand = [14, 13 + b]; break;
      case 'strike': hand = [25, 19 + b]; break;
      case 'cheer': hand = [23, 8 + b]; break;
      case 'hurt': hand = [24, 11 + b]; break;
      default: hand = [20, 22 + b];
    }
    paintWeapon(p, def, pose.arm, hand);
    line(19, 17 + b, hand[0], hand[1], SKIN, 2);
    rect(hand[0] - 1, hand[1] - 1, 3, 3, SKIN);
    px(hand[0] + 1, hand[1] + 1, SKIN_D);
  });
  return addOutline(spr, OUTLINE);
}

function buildHero(def) {
  const frames = {};
  for (const [name, pose] of Object.entries(POSES)) {
    const r = paintHero(def, pose);
    const l = flipH(r);
    frames[name] = { r, l, wr: tint(r, '#ffffff'), wl: tint(l, '#ffffff') };
  }
  const head = makeCanvas(18, 17);
  head.getContext('2d').drawImage(frames.stand.r, -7, 0);
  return { frames, head };
}

// ------------------------------------------------------------------ dinosaurs

function dino(w, h, fn, flipToLeft = true) {
  const r = addOutline(paint(w, h, fn), OUTLINE);
  const l = flipH(r);
  return { r, l, wr: tint(r, '#ffffff'), wl: tint(l, '#ffffff'), dr: flipV(r), dl: flipV(l) };
}

const TRIKE = { body: '#4a7e56', bodyD: '#2c5238', belly: '#a8b888', frill: '#b8702e', frillD: '#7a4218', horn: '#d8ccb0' };

function paintTrike(step, charge) {
  const c = TRIKE, hd = charge ? 3 : 0;
  return dino(54, 38, ({ rect, px, ellipse, poly, line }) => {
    poly([[11, 15], [11, 25], [0, 22]], c.body);
    poly([[11, 22], [11, 25], [1, 23]], c.bodyD);
    const lo = step ? 2 : -2;
    rect(13 - lo, 27, 5, 9, c.bodyD);
    rect(31 + lo, 27, 5, 9, c.bodyD);
    ellipse(24, 21, 15, 10, c.body);
    ellipse(25, 26, 12, 4.5, c.belly);
    [[16, 14], [22, 13], [28, 15], [19, 18], [26, 19]].forEach(([x, y]) => { px(x, y, c.bodyD); px(x + 1, y, c.bodyD); });
    rect(17 + lo, 27, 5, 9, c.body);
    rect(34 - lo, 27, 5, 9, c.body);
    [17 + lo, 34 - lo].forEach(x => { px(x, 35, c.horn); px(x + 2, 35, c.horn); px(x + 4, 35, c.horn); });
    ellipse(37, 13 + hd, 7, 9, c.frill);
    ellipse(37, 13 + hd, 5, 7, c.frillD);
    ellipse(37.5, 13.5 + hd, 3.5, 5.5, c.frill);
    [[33, 6], [37, 4], [41, 6], [43, 11]].forEach(([x, y]) => px(x, y + hd, c.horn));
    ellipse(42, 20 + hd, 7, 6, c.body);
    poly([[46, 17 + hd], [52, 22 + hd], [46, 25 + hd]], '#7a7068');
    line(41, 14 + hd, 50, 7 + hd, c.horn, 2);
    poly([[46, 16 + hd], [49, 11 + hd], [48, 17 + hd]], c.horn);
    rect(42, 16 + hd, 2, 2, '#ffffff');
    px(43, 17 + hd, OUTLINE);
    line(44, 23 + hd, 48, 22 + hd, c.bodyD, 1);
  });
}

const PARA = { body: '#5e5288', bodyD: '#3c325e', belly: '#a8a0c0', crest: '#b8862a', crestD: '#7a5410' };

function paintPara(step, honk) {
  const c = PARA;
  return dino(46, 50, ({ rect, px, ellipse, poly, line }) => {
    poly([[13, 25], [13, 33], [0, 26]], c.body);
    const lo = step ? 3 : -3;
    // far leg
    ellipse(18 - lo / 2, 36, 4, 5, c.bodyD);
    line(18 - lo / 2, 39, 20 - lo, 46, c.bodyD, 3);
    rect(19 - lo, 46, 5, 2, c.bodyD);
    ellipse(20, 30, 11, 8, c.body);
    ellipse(22, 33, 8, 4, c.belly);
    [[14, 25], [18, 24], [22, 25]].forEach(([x, y]) => { px(x, y, c.bodyD); px(x, y + 1, c.bodyD); });
    // near leg
    ellipse(17 + lo / 2, 35, 5, 6, c.body);
    line(17 + lo / 2, 39, 19 + lo, 46, c.body, 3);
    rect(18 + lo, 46, 5, 2, c.bodyD);
    line(27, 33, 30, 36, c.bodyD, 2);
    // neck + head
    poly([[24, 26], [29, 24], [36, 12], [30, 10]], c.body);
    ellipse(33, 10, 5, 4, c.body);
    if (honk) {
      poly([[36, 8], [43, 4], [41, 9]], c.body);
      poly([[36, 12], [43, 15], [38, 14]], c.body);
    } else {
      ellipse(38, 12, 5, 2.5, c.body);
      px(41, 12, c.bodyD);
    }
    poly([[30, 7], [34, 5], [19, 1], [17, 3]], honk ? '#e0b860' : c.crest);
    line(19, 2, 31, 6, c.crestD, 1);
    rect(34, 8, 2, 2, '#ffffff');
    px(35, 9, OUTLINE);
  });
}

const BRACHIO = { body: '#4a6e78', bodyD: '#2c4650', belly: '#9ab0b4' };

function buildBrachio() {
  const c = BRACHIO;
  const body = addOutline(paint(100, 74, ({ rect, px, ellipse, poly }) => {
    poly([[22, 33], [22, 47], [1, 56], [3, 51]], c.body);
    rect(31, 50, 8, 20, c.bodyD);
    rect(61, 50, 8, 20, c.bodyD);
    ellipse(48, 40, 29, 18, c.body);
    ellipse(50, 50, 22, 6, c.belly);
    [[34, 28], [42, 26], [50, 27], [58, 30], [38, 34], [54, 35]].forEach(([x, y]) => rect(x, y, 3, 2, c.bodyD));
    rect(24, 50, 9, 22, c.body);
    rect(54, 50, 9, 22, c.body);
    [24, 54].forEach(x => { px(x + 1, 71, '#f4ead0'); px(x + 4, 71, '#f4ead0'); px(x + 7, 71, '#f4ead0'); });
  }), OUTLINE);
  const head = addOutline(paint(26, 16, ({ px, ellipse, rect }) => {
    ellipse(10, 8, 8, 6, c.body);
    ellipse(17, 9, 6, 4, c.body);
    ellipse(9, 4, 4, 2.5, c.bodyD);
    rect(10, 6, 2, 2, '#ffffff');
    px(11, 7, OUTLINE);
    rect(16, 11, 5, 1, c.bodyD);
    px(21, 10, c.bodyD);
    px(14, 9, '#ff9fb0');
  }), OUTLINE);
  // Neck segments: an outline disc and a body disc, drawn in two passes.
  const disc = (r, col) => paint(r * 2 + 2, r * 2 + 2, ({ ellipse }) => ellipse(r + 1, r + 1, r, r, col));
  const neck = { outline: disc(7, OUTLINE), fill: disc(6, c.body), shade: disc(3, c.bodyD) };
  return { body, head, neck };
}

// ---- carnivores

const COMPY = { body: '#5a7a34', bodyD: '#34501c', belly: '#a8b880' };
function paintCompy(step) {
  const c = COMPY;
  return dino(26, 20, ({ px, ellipse, poly, line, rect }) => {
    poly([[2, 8], [10, 9], [10, 12]], c.body);
    const lo = step ? 2 : -2;
    line(11, 13, 10 - lo, 18, c.bodyD, 2);
    ellipse(12, 11, 5, 4, c.body);
    ellipse(13, 13, 3, 1.5, c.belly);
    line(13, 13, 14 + lo, 18, c.body, 2);
    poly([[15, 9], [17, 4], [19, 5], [17, 10]], c.body);
    ellipse(19, 5, 3.5, 2.5, c.body);
    ellipse(22, 6, 2.5, 1.5, c.body);
    rect(19, 4, 2, 2, '#ff2a2a');
    px(20, 4, '#ffd0d0');
    px(23, 7, '#ffffff');
    px(16, 12, c.bodyD);
    [[8, 9], [11, 8], [14, 8]].forEach(([x, y]) => px(x, y, '#c04030'));
  });
}

const RAPTOR = { body: '#a86a34', bodyD: '#6a3a14', stripe: '#3e1a08', belly: '#d8bc90' };
function paintRaptor(step, open) {
  const c = RAPTOR;
  return dino(42, 30, ({ px, ellipse, poly, line, rect }) => {
    poly([[1, 9], [15, 11], [15, 16]], c.body);
    poly([[1, 9], [5, 10], [4, 12]], c.stripe);
    const lo = step ? 3 : -3;
    ellipse(17 - lo / 2, 20, 3, 4, c.bodyD);
    line(17 - lo / 2, 22, 15 - lo, 28, c.bodyD, 2);
    rect(14 - lo, 27, 4, 1, c.bodyD);
    ellipse(19, 15, 8.5, 5.5, c.body);
    ellipse(20, 18, 6, 2.5, c.belly);
    [13, 17, 21].forEach(x => line(x, 10, x + 1, 13, c.stripe, 1));
    ellipse(18 + lo / 2, 20, 3.5, 4.5, c.body);
    line(18 + lo / 2, 23, 20 + lo, 28, c.body, 2);
    rect(19 + lo, 27, 5, 1, c.bodyD);
    px(24 + lo, 26, '#ffffff');
    line(25, 16, 28, 19, c.bodyD, 1);
    px(29, 20, '#ffffff');
    poly([[24, 12], [27, 7], [31, 7], [28, 14]], c.body);
    ellipse(30, 8, 5, 3.5, c.body);
    if (open) {
      poly([[32, 6], [40, 5], [38, 8], [33, 9]], c.body);
      poly([[32, 10], [39, 13], [33, 12]], c.body);
      px(35, 9, '#ffffff'); px(37, 10, '#ffffff'); px(36, 8, '#ffffff');
    } else {
      poly([[32, 6], [40, 8], [39, 11], [32, 11]], c.body);
      line(33, 10, 39, 10, c.stripe, 1);
      px(35, 11, '#ffffff'); px(37, 11, '#ffffff');
    }
    rect(30, 6, 2, 2, '#ff2a2a');
    px(30, 6, '#ffd0d0');
    line(29, 5, 33, 5, c.stripe, 1);
  });
}

const DILO = { body: '#7e8a34', bodyD: '#4a5418', belly: '#b8bc88', crest: '#a8242a', frill: '#b88a2a' };
function paintDilo(bob, spit) {
  const c = DILO, b = bob ? 1 : 0;
  return dino(34, 34, ({ px, ellipse, poly, line, rect }) => {
    poly([[1, 18], [10, 18], [10, 23]], c.body);
    rect(11, 24, 3, 8, c.bodyD);
    rect(10, 31, 5, 2, c.bodyD);
    ellipse(14, 22 + b, 8, 6, c.body);
    ellipse(15, 25 + b, 5, 2.5, c.belly);
    rect(16, 25, 3, 7, c.body);
    rect(16, 31, 5, 2, c.bodyD);
    poly([[17, 18 + b], [20, 10 + b], [24, 11 + b], [21, 20 + b]], c.body);
    if (spit) {
      ellipse(21, 11, 8, 9, c.frill);
      ellipse(21, 11, 6, 7, c.crest);
      ellipse(21, 11, 4, 5, c.frill);
    }
    ellipse(24, 9 + b, 5, 4, c.body);
    poly([[26, 7 + b], [32, 9 + b], [31, 12 + b], [26, 12 + b]], c.body);
    if (spit) {
      poly([[27, 12], [32, 15], [28, 14]], c.body);
      rect(27, 11, 4, 2, '#8a2030');
    }
    line(21, 5 + b, 27, 4 + b, c.crest, 2);
    line(21, 7 + b, 27, 6 + b, c.crest, 1);
    rect(24, 8 + b, 2, 2, '#ff2a2a');
    px(24, 8 + b, '#ffd0d0');
    [[10, 19], [14, 17], [18, 19]].forEach(([x, y]) => px(x, y + b, c.bodyD));
    line(19, 22 + b, 22, 24 + b, c.bodyD, 1);
  });
}

const PTERO = { body: '#6e3a52', wing: '#8e5a70', wingD: '#4a1e34', beak: '#c8a868' };
function paintPtero(up) {
  const c = PTERO;
  return dino(42, 26, ({ px, ellipse, poly }) => {
    if (up) poly([[14, 12], [26, 12], [10, 1], [6, 3]], c.wing);
    else poly([[14, 13], [26, 13], [9, 24], [5, 22]], c.wing);
    if (up) poly([[10, 1], [14, 12], [12, 12], [6, 3]], c.wingD);
    else poly([[9, 24], [14, 13], [12, 13], [5, 22]], c.wingD);
    ellipse(20, 13, 6, 3.5, c.body);
    ellipse(27, 10, 3.5, 3, c.body);
    poly([[29, 9], [40, 12], [29, 12]], c.beak);
    poly([[25, 8], [16, 4], [26, 6]], c.body);
    px(28, 9, '#ff2a2a');
    px(28, 10, '#ff2a2a');
    poly([[18, 16], [15, 19], [20, 17]], c.wingD);
  });
}

const TREX = { body: '#6e2a24', bodyD: '#401410', stripe: '#260a06', belly: '#b8987a' };
function paintTrex(step, roar, dazed) {
  const c = TREX;
  return dino(124, 100, ({ px, ellipse, poly, line, rect }) => {
    poly([[2, 44], [40, 36], [46, 56]], c.body);
    poly([[2, 44], [20, 44], [42, 52]], c.bodyD);
    const lo = step ? 5 : -5;
    // far leg
    ellipse(60 - lo / 2, 66, 9, 12, c.bodyD);
    line(60 - lo / 2, 74, 62 - lo, 92, c.bodyD, 7);
    poly([[56 - lo, 92], [72 - lo, 92], [72 - lo, 97], [56 - lo, 97]], c.bodyD);
    ellipse(54, 52, 28, 21, c.body);
    ellipse(60, 60, 19, 10, c.belly);
    [34, 44, 54, 64].forEach(x => poly([[x, 32], [x + 4, 32], [x + 2, 44]], c.stripe));
    // near leg
    ellipse(48 + lo / 2, 66, 11, 13, c.body);
    line(48 + lo / 2, 74, 50 + lo, 92, c.body, 8);
    poly([[44 + lo, 91], [62 + lo, 91], [63 + lo, 97], [43 + lo, 97]], c.body);
    [46, 52, 58].forEach(x => px(x + lo, 96, '#f4ead0'));
    // tiny arm
    line(76, 54, 82, 60, c.bodyD, 3);
    px(83, 61, '#f4ead0');
    px(84, 59, '#f4ead0');
    // neck + head
    poly([[66, 36], [82, 22], [92, 34], [78, 52]], c.body);
    ellipse(92, 27, 17, 12, c.body);
    const jaw = roar ? 10 : 0;
    poly([[84, 34 + jaw], [118, 34 + jaw / 2], [116, 41 + jaw], [86, 44 + jaw]], c.body);
    poly([[96, 18], [120, 24], [121, 33], [98, 34]], c.body);
    if (roar) {
      poly([[98, 34], [120, 33], [116, 41], [88, 42]], '#5a1018');
      for (let x = 100; x < 119; x += 3) { px(x, 34, '#ffffff'); px(x, 35, '#ffffff'); px(x - 1, 40, '#ffffff'); }
    } else {
      line(98, 34, 120, 33, c.stripe, 1);
      for (let x = 100; x < 119; x += 3) px(x, 35, '#ffffff');
    }
    line(86, 18, 98, 20, c.stripe, 2);
    if (dazed) {
      line(90, 21, 94, 25, OUTLINE, 1); line(94, 21, 90, 25, OUTLINE, 1);
    } else {
      ellipse(92, 23, 2.5, 2.5, '#ff2a2a');
      rect(92, 22, 1, 3, '#ffe0a0');
    }
    px(116, 26, c.stripe);
    [[72, 28], [80, 30]].forEach(([x, y]) => rect(x, y, 3, 2, c.stripe));
  });
}

function buildDinos() {
  return {
    trike: { walk: [paintTrike(0, false), paintTrike(1, false)], charge: [paintTrike(0, true), paintTrike(1, true)] },
    para: { walk: [paintPara(0, false), paintPara(1, false)], honk: paintPara(0, true) },
    brachio: buildBrachio(),
    compy: [paintCompy(0), paintCompy(1)],
    raptor: { run: [paintRaptor(0, false), paintRaptor(1, false)], bite: paintRaptor(1, true) },
    dilo: { idle: [paintDilo(0, false), paintDilo(1, false)], spit: paintDilo(0, true) },
    ptero: [paintPtero(true), paintPtero(false)],
    trex: { walk: [paintTrex(0, false, false), paintTrex(1, false, false)], roar: paintTrex(0, true, false), dazed: paintTrex(0, false, true) },
  };
}

// ------------------------------------------------------------------ items

function buildItems() {
  const gem = (c1, c2, c3) => addOutline(paint(14, 16, ({ poly, px }) => {
    poly([[2, 5], [5, 1], [9, 1], [12, 5], [7, 14]], c2);
    poly([[2, 5], [12, 5], [7, 14]], c1);
    poly([[5, 1], [7, 5], [9, 1]], c3);
    poly([[2, 5], [5, 5], [7, 14]], c3);
    px(5, 3, '#ffffff'); px(4, 4, '#ffffff');
  }), OUTLINE);
  const heart = addOutline(paint(14, 13, ({ ellipse, poly, px }) => {
    ellipse(4.5, 4.5, 3.5, 3.5, '#b82434');
    ellipse(9.5, 4.5, 3.5, 3.5, '#b82434');
    poly([[1, 5], [13, 5], [7, 12]], '#b82434');
    poly([[7, 6], [13, 5], [7, 12]], '#7a1020');
    px(3, 3, '#ffffff'); px(4, 3, '#ffffff'); px(3, 4, '#ffffff');
  }), OUTLINE);
  const heartEmpty = tint(heart, '#3a2a3a');
  const map = addOutline(paint(22, 20, ({ poly, line, px }) => {
    poly([[1, 3], [20, 1], [21, 17], [2, 19]], '#f0dca0');
    poly([[1, 3], [6, 3], [2, 19]], '#d8b878');
    line(5, 7, 10, 12, '#a87848', 1); line(10, 12, 14, 8, '#a87848', 1);
    line(13, 11, 17, 15, '#e8413a', 2); line(17, 11, 13, 15, '#e8413a', 2);
    px(8, 15, '#3a8a5a'); px(9, 14, '#3a8a5a');
  }), OUTLINE);
  const chest = open => addOutline(paint(40, 32, ({ rect, px, poly, ellipse }) => {
    rect(3, 14, 34, 16, '#9a5a24');
    rect(3, 14, 34, 2, '#c8803a');
    rect(3, 22, 34, 2, '#e0b030');
    [3, 18, 34].forEach(x => rect(x, 14, 3, 16, '#e0b030'));
    if (open) {
      rect(5, 10, 30, 6, '#2a1206');
      ellipse(12, 11, 4, 3, '#d8a848'); ellipse(20, 9, 5, 4, '#d8a848'); ellipse(28, 11, 4, 3, '#d8a848');
      px(19, 7, '#ffffff'); px(11, 10, '#ffffff');
      poly([[4, 2], [36, 2], [35, 9], [5, 9]], '#9a5a24');
      rect(4, 2, 32, 2, '#e0b030');
    } else {
      poly([[3, 14], [37, 14], [35, 5], [5, 5]], '#b06a2a');
      rect(5, 5, 30, 2, '#c8803a');
      [3, 18, 34].forEach(x => rect(x, 5, 3, 9, '#e0b030'));
      rect(17, 16, 6, 6, '#d8a848');
      px(19, 18, OUTLINE); px(20, 18, OUTLINE); px(19, 19, OUTLINE);
    }
  }), OUTLINE);
  const stone = addOutline(paint(8, 8, ({ ellipse, px }) => { ellipse(4, 4, 3, 3, '#a8a8b8'); px(3, 3, '#ffffff'); }), OUTLINE);
  const venom = addOutline(paint(10, 10, ({ ellipse, px }) => { ellipse(5, 5, 4, 4, '#9ae040'); ellipse(5, 5, 2.5, 2.5, '#d8ff80'); px(4, 3, '#ffffff'); }), OUTLINE);
  const rock = addOutline(paint(18, 18, ({ ellipse, px, rect }) => {
    ellipse(9, 9, 8, 7, '#8a7a7a'); ellipse(8, 7, 5, 4, '#a89a98'); rect(10, 12, 4, 1, '#5a4a4a'); px(6, 5, '#d0c8c0');
  }), OUTLINE);
  const star = addOutline(paint(9, 9, ({ poly }) => poly([[4.5, 0], [6, 3.5], [9, 4], [6.5, 6], [7, 9], [4.5, 7.5], [2, 9], [2.5, 6], [0, 4], [3, 3.5]], '#c89a3a')), OUTLINE);
  const totem = lit => addOutline(paint(20, 44, ({ rect, px, ellipse, poly }) => {
    rect(6, 10, 8, 33, '#9a6a3a');
    rect(6, 10, 2, 33, '#c08a50');
    rect(12, 10, 2, 33, '#6a4420');
    [14, 26].forEach(y => {
      rect(7, y, 2, 2, lit ? '#e07a20' : '#2a1a10'); rect(11, y, 2, 2, lit ? '#e07a20' : '#2a1a10');
      rect(8, y + 5, 4, 1, '#2a1a10');
    });
    poly([[1, 8], [19, 8], [16, 11], [4, 11]], '#7a7a88');
    rect(1, 7, 18, 2, '#a0a0b0');
    if (!lit) { rect(7, 4, 6, 3, '#4a4a4a'); px(9, 3, '#6a6a6a'); }
    rect(4, 36, 12, 2, '#6a4420');
    ellipse(10, 42, 7, 2, '#7a7a88');
  }), OUTLINE);
  const target = addOutline(paint(20, 34, ({ rect, ellipse }) => {
    rect(9, 18, 3, 16, '#8a5a30');
    ellipse(10, 10, 9, 9, '#d8ccb0');
    ellipse(10, 10, 7, 7, '#8a2020');
    ellipse(10, 10, 5, 5, '#d8ccb0');
    ellipse(10, 10, 3, 3, '#8a2020');
  }), OUTLINE);
  const targetHit = tint(target, '#6a6a6a');
  const pedestal = addOutline(paint(28, 22, ({ rect, poly }) => {
    poly([[2, 21], [26, 21], [22, 4], [6, 4]], '#a8a0b8');
    poly([[18, 21], [26, 21], [22, 4], [18, 4]], '#7a7090');
    rect(3, 2, 22, 3, '#c8c0d8');
  }), OUTLINE);
  return {
    gems: [gem('#c8862a', '#7a4a0e', '#f0c070'), gem('#a8202a', '#600c14', '#e07070'), gem('#2a8048', '#124a26', '#78c08c')],
    heart, heartEmpty, map, chest: [chest(false), chest(true)], stone, venom, rock, star,
    totem: [totem(false), totem(true)], target, targetHit, pedestal,
  };
}

// ------------------------------------------------------------------ tiles

export const THEMES = {
  jungle: {
    top: ['#5e8a3e', '#2e6430', '#1a4220'], dirt: ['#5a3a24', '#3e2614', '#7a5434'],
    stone: ['#a09888', '#746c60', '#403a32'], plat: ['#a07a48', '#6a4420', '#3a200c'], vine: '#2a7a2a',
    hazard: null, spikes: ['#e0d8c4', '#8a7c68'],
    sky: ['#0a1220', '#1a2e38', '#34503e'], music: 'jungle',
  },
  volcano: {
    top: ['#8a7070', '#5a4a4a', '#3a2e2e'], dirt: ['#3a2e2e', '#2a2020', '#ff7a20'],
    stone: ['#8a7a7a', '#5e5050', '#2e2424'], plat: ['#7a6a6a', '#4a3e3e', '#2a2020'], vine: null,
    hazard: ['#ffe080', '#ffa020', '#ff5a10', '#c02a08'], spikes: ['#d0c8c8', '#7a7070'],
    sky: ['#0c0306', '#3e0a10', '#a02a10'], music: 'volcano',
  },
  swamp: {
    top: ['#9ac860', '#6a9a4a', '#3a6a3a'], dirt: ['#4a3a2a', '#2e241a', '#6a5a3a'],
    stone: ['#8a9a8a', '#5e6e5e', '#34403a'], plat: ['#7a6a48', '#54462e', '#2e2416'], vine: '#4a7a3a',
    hazard: ['#7a5a9a', '#4a3060', '#2a1a3a', '#160c20'], spikes: ['#e0e0c8', '#8a8a70'],
    sky: ['#06080e', '#142028', '#304840'], music: 'swamp',
  },
  cave: {
    top: ['#5ab0a8', '#2e7a80', '#1a4a58'], dirt: ['#2a2438', '#1c1828', '#3e3450'],
    stone: ['#7a7a9a', '#4e4e6e', '#2a2a40'], plat: ['#6a6a88', '#44445e', '#24243a'], vine: '#2a8a8a',
    hazard: null, spikes: ['#c0f0ff', '#5aa0c0'],
    sky: ['#04040a', '#0a0a18', '#141428'], music: 'cave',
  },
  lair: {
    top: ['#9a8a9a', '#6a5a6a', '#3e3240'], dirt: ['#3e3240', '#2a2030', '#5a4a5a'],
    stone: ['#9a8aa0', '#6a5a70', '#3a2e40'], plat: ['#8a7a8a', '#5a4a5a', '#2a2030'], vine: null,
    hazard: ['#ffe080', '#ffa020', '#ff5a10', '#c02a08'], spikes: ['#f0ead8', '#a89880'],
    sky: ['#0c0810', '#22161e', '#3a2420'], music: 'boss',
  },
};

function buildTiles(key) {
  const t = THEMES[key];
  const [t1, t2, t3] = t.top, [d1, d2, d3] = t.dirt, [s1, s2, s3] = t.stone;
  const rnd = (i, j) => ((i * 73 + j * 151) % 97) / 97;
  const dirt = ({ rect, px }, top) => {
    rect(0, top, 16, 16 - top, d1);
    for (let y = top; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const r = rnd(x, y);
        if (r < 0.07) px(x, y, d2);
        else if (r > 0.95) px(x, y, d3);
      }
    }
    if (key === 'volcano') {
      px(4, top + 6, d3); px(5, top + 7, d3); px(6, top + 7, d3); px(11, top + 3, d3); px(12, top + 4, d3);
    } else {
      rect(3, top + 5, 3, 2, d2); rect(10, top + 9, 4, 2, d2); px(10, top + 9, d3);
    }
  };
  const groundTop = paint(16, 16, p => {
    dirt(p, 4);
    p.rect(0, 0, 16, 5, t2);
    p.rect(0, 0, 16, 1, t1);
    for (let x = 0; x < 16; x++) {
      const h = 5 + ((x * 5) % 3);
      p.rect(x, 4, 1, h - 3, x % 3 ? t2 : t3);
      if (x % 4 === 1) p.px(x, 1, t1);
    }
    if (key === 'jungle' || key === 'swamp') { p.px(3, 0, t1); p.px(9, 0, t1); p.px(13, 0, t1); }
  });
  const ground = paint(16, 16, p => dirt(p, 0));
  const stone = paint(16, 16, ({ rect, px }) => {
    rect(0, 0, 16, 16, s2);
    rect(0, 0, 16, 1, s1); rect(0, 0, 1, 16, s1);
    rect(0, 15, 16, 1, s3); rect(15, 0, 1, 16, s3);
    rect(0, 7, 16, 1, s3); rect(7, 0, 1, 7, s3); rect(11, 8, 1, 7, s3);
    rect(0, 8, 16, 1, s1); rect(8, 0, 1, 7, s1); rect(12, 8, 1, 7, s1);
    px(3, 3, s1); px(13, 11, s1);
  });
  const cracked = paint(16, 16, ({ rect, px, line, ellipse }) => {
    ellipse(8, 8, 8, 8, s2);
    ellipse(7, 6, 5, 4, s1);
    line(4, 3, 8, 8, s3, 1); line(8, 8, 6, 13, s3, 1); line(8, 8, 13, 10, s3, 1); line(13, 10, 14, 4, s3, 1);
    rect(0, 12, 16, 4, s2);
    rect(0, 15, 16, 1, s3);
    px(10, 5, '#ffffff');
  });
  const [p1, p2, p3] = t.plat;
  const plat = paint(16, 16, ({ rect, px }) => {
    rect(0, 0, 16, 7, p2);
    rect(0, 0, 16, 2, p1);
    rect(0, 6, 16, 1, p3);
    px(0, 3, p3); px(0, 4, p3); px(8, 2, p3); px(8, 3, p3); px(8, 4, p3); px(8, 5, p3);
    if (t.vine) { px(4, 7, t.vine); px(4, 8, t.vine); px(12, 7, t.vine); px(12, 8, t.vine); px(12, 9, t.vine); }
  });
  const [sp1, sp2] = t.spikes;
  const spikes = paint(16, 16, ({ poly }) => {
    for (let i = 0; i < 3; i++) {
      const x = 1 + i * 5;
      poly([[x, 16], [x + 2.5, 6], [x + 5, 16]], sp1);
      poly([[x + 2.5, 6], [x + 5, 16], [x + 3, 16]], sp2);
    }
  });
  const block = (c1, c2, c3) => paint(16, 16, ({ rect, px, poly }) => {
    rect(0, 0, 16, 16, c2);
    rect(1, 1, 14, 14, c1);
    rect(1, 1, 14, 1, '#ffffff');
    rect(14, 1, 1, 14, c3);
    rect(1, 14, 14, 1, c3);
    // fossil footprint
    poly([[5, 7], [8, 4], [11, 7], [8, 12]], c3);
    px(5, 4, c3); px(8, 3, c3); px(11, 4, c3);
  });
  const hz = t.hazard || ['#4aa0e0', '#2a70b0', '#1a4a80', '#0c2a50'];
  const hazard = frame => paint(16, 16, ({ rect, px }) => {
    rect(0, 0, 16, 16, hz[2]);
    rect(0, 10, 16, 6, hz[3]);
    for (let x = 0; x < 16; x++) {
      const y = 2 + Math.round(Math.sin((x + frame * 4) / 16 * Math.PI * 2) * 1.5);
      rect(x, y, 1, 3, hz[1]);
      px(x, y, hz[0]);
    }
    px((5 + frame * 6) % 16, 8, hz[0]);
  });
  const hazardFill = paint(16, 16, ({ rect, px }) => {
    rect(0, 0, 16, 16, hz[2]);
    rect(0, 6, 16, 10, hz[3]);
    px(3, 3, hz[1]); px(11, 9, hz[1]);
  });
  const gate = paint(16, 16, ({ rect }) => {
    rect(0, 0, 16, 16, '#3a2a20');
    [1, 6, 11].forEach(x => { rect(x, 0, 4, 16, '#8a8a98'); rect(x, 0, 1, 16, '#c8c8d8'); rect(x + 3, 0, 1, 16, '#5a5a68'); });
    rect(0, 7, 16, 2, '#6a6a78');
  });
  const leaf = squash => paint(16, 16, ({ ellipse, rect, px }) => {
    rect(7, 9, 2, 7, '#3a7a2a');
    ellipse(8, 8 + squash, 8, 4 - squash / 2, '#2a8a3a');
    ellipse(8, 7 + squash, 7, 3 - squash / 2, '#4a8a3a');
    px(8, 6 + squash, '#8ab870');
    ellipse(8, 7 + squash, 1, 3 - squash / 2, '#2a8a3a');
  });
  return {
    groundTop, ground, stone, cracked, plat, spikes,
    q: [block('#a8782a', '#4a3008', '#7a5214'), block('#c8964a', '#4a3008', '#8a6020')],
    used: block('#a8907a', '#5a4a3a', '#7a6a5a'),
    hazard: [hazard(0), hazard(1), hazard(2), hazard(3)], hazardFill, gate,
    spring: [leaf(0), leaf(3)],
  };
}

// ------------------------------------------------------------------ backgrounds

export const LAYER_W = 512;

function buildSky(stops) {
  const c = makeCanvas(VIEW_W, VIEW_H);
  const g = c.getContext('2d');
  const bands = 24, bh = VIEW_H / bands;
  const colorAt = t => {
    const seg = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(seg));
    return mix(stops[i], stops[i + 1], seg - i);
  };
  for (let b = 0; b < bands; b++) {
    g.fillStyle = colorAt(b / (bands - 1));
    g.fillRect(0, Math.floor(b * bh), VIEW_W, Math.ceil(bh) + 1);
    if (b > 0) {
      g.fillStyle = colorAt((b - 1) / (bands - 1));
      const y0 = Math.floor(b * bh);
      for (let x = 0; x < VIEW_W; x += 2) g.fillRect(x + (y0 % 2), y0, 1, 1);
    }
  }
  return c;
}

function wrapped(fn) {
  for (const off of [-LAYER_W, 0, LAYER_W]) fn(off);
}

// Wraps both ways, for cave layers that also repeat top to bottom.
function wrapped2(fn) {
  for (const oy of [-VIEW_H, 0, VIEW_H]) wrapped(o => fn(o, oy));
}

function crystal(g, x, y, h, w, light, dark) {
  tri(g, [[x - w, y], [x, y - h], [x + w, y]], dark);
  tri(g, [[x - w, y], [x, y - h], [x, y]], light);
}

function blob(g, x, y, rx, ry, col) {
  g.fillStyle = col;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, 7);
  g.fill();
}

function tri(g, pts, col) {
  g.fillStyle = col;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.fill();
}

function buildBackground(key) {
  const t = THEMES[key];
  const layers = [];
  const layer = (f, draw) => {
    const c = makeCanvas(LAYER_W, VIEW_H);
    draw(c.getContext('2d'));
    layers.push({ img: pixelate(c), f });
  };
  if (key === 'jungle') {
    layer(0.08, g => {
      [[60, 120, 110], [230, 100, 130], [420, 130, 100]].forEach(([x, peak, half]) => wrapped(o => {
        tri(g, [[x + o - half, 230], [x + o, peak], [x + o + half, 230]], '#26404a');
        tri(g, [[x + o, peak], [x + o + half, 230], [x + o + 10, 230]], '#1e343e');
      }));
      wrapped(o => {
        tri(g, [[330 + o, 230], [370 + o, 92], [392 + o, 92], [440 + o, 230]], '#1a2e36');
        [[380, 80, 12], [372, 64, 9], [386, 50, 7]].forEach(([x, y, r]) => blob(g, x + o, y, r, r * 0.8, '#3a4a50'));
      });
    });
    layer(0.25, g => {
      for (let i = 0; i < 12; i++) {
        const x = i * 44 + (i % 3) * 7, h = 120 + (i % 4) * 18;
        wrapped(o => {
          g.fillStyle = '#0e2a20';
          g.fillRect(x + o - 4, 270 - h, 8, h);
          [[0, 0, 26], [-16, 10, 18], [16, 12, 18], [0, -14, 16]].forEach(([dx, dy, r]) => blob(g, x + o + dx, 270 - h + dy, r, r * 0.7, '#123826'));
          [[-6, -4, 10], [10, 4, 8]].forEach(([dx, dy, r]) => blob(g, x + o + dx, 270 - h + dy, r, r * 0.6, '#1a4830'));
        });
      }
    });
    layer(0.5, g => {
      for (let i = 0; i < 10; i++) {
        const x = i * 52 + (i % 2) * 18;
        wrapped(o => {
          for (let k = 0; k < 5; k++) {
            const a = -Math.PI / 2 + (k - 2) * 0.45;
            tri(g, [[x + o, 232], [x + o + Math.cos(a - 0.12) * 46, 232 + Math.sin(a - 0.12) * 46], [x + o + Math.cos(a + 0.12) * 46, 232 + Math.sin(a + 0.12) * 46]], k % 2 ? '#08200f' : '#0c2a16');
          }
        });
      }
      for (let i = 0; i < 9; i++) {
        const x = i * 60 + 20, len = 30 + (i * 23) % 50;
        wrapped(o => {
          g.fillStyle = '#0e3018';
          g.fillRect(x + o, 0, 3, len);
          blob(g, x + o + 1, len, 5, 4, '#154020');
        });
      }
    });
  } else if (key === 'volcano') {
    layer(0.08, g => {
      wrapped(o => {
        tri(g, [[120 + o, 240], [220 + o, 70], [250 + o, 70], [360 + o, 240]], '#4a1828');
        blob(g, 235 + o, 72, 16, 6, '#ff7a20');
        [[230, 50, 18], [244, 30, 22], [228, 8, 26]].forEach(([x, y, r]) => blob(g, x + o, y, r, r * 0.7, '#5a3040'));
        tri(g, [[232 + o, 74], [218 + o, 130], [226 + o, 130]], '#ff5a10');
      });
      [[30, 150, 80], [440, 160, 90]].forEach(([x, peak, half]) => wrapped(o => tri(g, [[x + o - half, 240], [x + o, peak], [x + o + half, 240]], '#3a1420')));
    });
    layer(0.3, g => {
      for (let i = 0; i < 8; i++) {
        const x = i * 64 + (i % 3) * 9, h = 70 + (i % 4) * 24;
        wrapped(o => {
          tri(g, [[x + o - 22, 270], [x + o - 6, 270 - h], [x + o + 6, 270 - h + 8], [x + o + 22, 270]], '#2a1018');
          g.fillStyle = '#ff6a10';
          g.fillRect(x + o - 2, 270 - h + 30, 2, 20);
        });
      }
    });
    layer(0.55, g => {
      for (let i = 0; i < 12; i++) {
        const x = i * 43;
        wrapped(o => {
          blob(g, x + o, 236, 20, 12, '#1a0a10');
          g.fillStyle = '#ff8a20';
          g.fillRect(x + o - 6, 232, 6, 1);
        });
      }
    });
  } else if (key === 'swamp') {
    layer(0.1, g => {
      for (let i = 0; i < 9; i++) {
        const x = i * 58, h = 110 + (i % 3) * 20;
        wrapped(o => {
          g.fillStyle = '#1e2c30';
          g.fillRect(x + o - 3, 240 - h, 6, h);
          blob(g, x + o, 240 - h, 24, 14, '#24363a');
        });
      }
    });
    layer(0.3, g => {
      for (let i = 0; i < 6; i++) {
        const x = i * 86 + 20;
        wrapped(o => {
          g.fillStyle = '#141e20';
          g.fillRect(x + o - 5, 110, 10, 160);
          g.fillRect(x + o - 30, 140, 28, 4);
          g.fillRect(x + o + 2, 125, 24, 4);
          g.fillRect(x + o - 30, 128, 4, 14);
          g.fillRect(x + o + 22, 115, 4, 12);
          g.fillStyle = '#1e3424';
          for (let k = 0; k < 4; k++) g.fillRect(x + o - 26 + k * 7, 144, 2, 10 + (k % 2) * 8);
        });
      }
    });
    layer(0.55, g => {
      for (let i = 0; i < 40; i++) {
        const x = i * 13;
        wrapped(o => tri(g, [[x + o, 240], [x + o + 2, 196 + (i * 7) % 30], [x + o + 4, 240]], i % 2 ? '#0a140a' : '#101c10'));
      }
    });
  } else if (key === 'cave') {
    layer(0.1, g => {
      for (let i = 0; i < 6; i++) {
        const x = i * 86 + (i % 2) * 20, w = 18 + (i % 3) * 8;
        wrapped2((o, oy) => {
          g.fillStyle = '#10101e';
          g.fillRect(x + o - w / 2, oy, w, VIEW_H);
          for (let y = 0; y < VIEW_H; y += 18) blob(g, x + o + Math.sin(y * 0.07 + i) * 6, y + oy, w * 0.7, 12, '#10101e');
        });
      }
    });
    layer(0.3, g => {
      for (let i = 0; i < 10; i++) {
        const x = i * 51 + (i % 3) * 11, y = (i * 97) % VIEW_H + 20;
        const [light, dark] = i % 3 ? ['#2a7a8a', '#1a4a5a'] : ['#6a4a9a', '#3a2a5a'];
        wrapped2((o, oy) => {
          blob(g, x + o, y + oy, 20, 8, '#181828');
          crystal(g, x + o - 8, y + oy, 22, 5, light, dark);
          crystal(g, x + o + 3, y + oy, 32, 6, light, dark);
          crystal(g, x + o + 13, y + oy, 16, 4, light, dark);
        });
      }
    });
    layer(0.55, g => {
      for (let i = 0; i < 14; i++) {
        const x = i * 37 + (i % 4) * 5, y = (i * 61) % VIEW_H, len = 14 + (i * 11) % 26;
        wrapped2((o, oy) => {
          blob(g, x + o, y + oy, 12, 5, '#0a0a14');
          tri(g, [[x + o - 7, y + oy], [x + o + 7, y + oy], [x + o, y + oy + len]], '#0a0a14');
        });
      }
    });
  } else if (key === 'lair') {
    layer(0.15, g => {
      for (let i = 0; i < 16; i++) {
        const x = i * 32, len = 30 + (i * 17) % 60;
        wrapped(o => tri(g, [[x + o - 14, 0], [x + o + 14, 0], [x + o, len]], '#2a1c26'));
      }
      for (let i = 0; i < 8; i++) wrapped(o => blob(g, i * 64 + o, 250, 40, 30, '#2a1c26'));
    });
    layer(0.4, g => {
      for (let i = 0; i < 6; i++) {
        const x = i * 86 + 30;
        wrapped(o => {
          g.fillStyle = '#e8dcc0';
          for (let k = 0; k < 4; k++) g.fillRect(x + o - 12 + k * 8, 196 - k % 2 * 4, 3, 30);
          g.fillRect(x + o - 14, 194, 30, 3);
        });
      }
    });
  }
  return { sky: buildSky(t.sky), layers, vertical: key === 'cave' };
}

// ------------------------------------------------------------------ build all

export const SPR = {};

export function buildSprites() {
  SPR.heroes = {};
  for (const id of Object.keys(HEROES)) SPR.heroes[id] = buildHero(HEROES[id]);
  SPR.dinos = buildDinos();
  SPR.items = buildItems();
  SPR.tiles = {};
  SPR.bg = {};
  for (const key of Object.keys(THEMES)) {
    SPR.tiles[key] = buildTiles(key);
    SPR.bg[key] = buildBackground(key);
  }
}
