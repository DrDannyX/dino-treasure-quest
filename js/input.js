// Input from several devices at once, so up to three people can play.
// Devices: 'kb1' (arrows side of the keyboard), 'kb2' (WASD side),
// 'pad0'..'pad3' (Xbox / standard gamepads) and 'touch' (on-screen buttons).

const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'switch', 'action', 'start', 'mute'];

const KEYMAPS = {
  kb1: {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: ['KeyZ', 'Space', 'ArrowUp'], attack: ['KeyX'], switch: ['KeyC'], action: ['KeyV', 'ShiftRight', 'ShiftLeft'],
    start: ['Enter', 'Escape'], mute: ['KeyM'],
  },
  kb2: {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    jump: ['KeyF', 'KeyW'], attack: ['KeyG'], switch: ['KeyH'], action: ['KeyR'],
    start: ['KeyT'], mute: [],
  },
};

// Standard gamepad mapping (what Xbox controllers report in browsers):
// 0=A 1=B 2=X 3=Y 4=LB 5=RB 6=LT 7=RT 8=View 9=Menu 12-15=D-pad
const PAD = {
  jump: [0], attack: [2, 7], switch: [3, 4, 5], action: [1, 6],
  start: [9], mute: [8], up: [12], down: [13], left: [14], right: [15],
};

const keys = new Set();
export const touch = {};
let prev = {}, cur = {};
let onConnect = null;
const lastPads = {};

window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('gamepadconnected', e => onConnect && onConnect(e.gamepad));

function readAll() {
  const out = {};
  for (const [dev, map] of Object.entries(KEYMAPS)) {
    const s = {};
    for (const a of ACTIONS) s[a] = (map[a] || []).some(k => keys.has(k));
    out[dev] = s;
  }
  const t = {};
  for (const a of ACTIONS) t[a] = !!touch[a];
  out.touch = t;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p || !p.connected) continue;
    const id = 'pad' + p.index;
    lastPads[id] = p;
    const b = i => !!(p.buttons[i] && p.buttons[i].pressed);
    const s = {};
    for (const a of ACTIONS) s[a] = (PAD[a] || []).some(b);
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (ax < -0.4) s.left = true;
    if (ax > 0.4) s.right = true;
    if (ay < -0.6) s.up = true;
    if (ay > 0.6) s.down = true;
    out[id] = s;
  }
  return out;
}

export const input = {
  update() {
    prev = cur;
    cur = readAll();
  },
  held: (dev, a) => !!(cur[dev] && cur[dev][a]),
  pressed: (dev, a) => !!(cur[dev] && cur[dev][a] && !(prev[dev] && prev[dev][a])),
  // Devices that exist right now.
  devices: () => Object.keys(cur),
  // First device that just pressed `a`, or null.
  whoPressed(a) {
    for (const dev of Object.keys(cur)) if (input.pressed(dev, a)) return dev;
    return null;
  },
  anyPressed: a => input.whoPressed(a) !== null,
  onGamepadConnected(fn) {
    onConnect = fn;
  },
  rumble(dev, strong = 0.6, ms = 200) {
    const p = lastPads[dev];
    const act = p && p.vibrationActuator;
    if (act && act.playEffect) {
      act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 }).catch(() => {});
    }
  },
};

export function deviceLabel(dev) {
  if (dev === 'kb1') return 'KEYS';
  if (dev === 'kb2') return 'WASD';
  if (dev === 'touch') return 'TOUCH';
  return 'PAD ' + (+dev.slice(3) + 1);
}
