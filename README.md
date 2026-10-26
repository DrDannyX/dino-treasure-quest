# Dino Treasure Quest

A dark, 16-bit style dinosaur adventure for **1–3 players**.

It's Ace's birthday. While exploring the woods, Ace, Echo and Zipper find a glowing stone
that whisks them away to a world of dinosaurs. To get home, they must find the four pieces of
a treasure map, ride the friendly plant-eaters, battle the meat-eaters, and defeat the T-Rex
guarding the treasure.

Everything (graphics, music, sound effects) is generated in code, so there are no assets
and no build step.

## The heroes

| Hero | Weapon | Special |
|------|--------|---------|
| **Ace** | Bone club | Smashes cracked rock walls |
| **Echo** | Slingshot | Hits enemies and targets from far away (targets open stone gates) |
| **Zipper** | Spear | Double jump: reaches ledges nobody else can |

Each hero has 3 hearts. Playing solo, press **switch** to swap heroes at any time. If one is
knocked out, you swap to another automatically while they rest. In co-op, a knocked-out hero
with nobody to swap to floats in a bubble until a teammate touches it. Checkpoint totems
restore the whole team.

## The dinosaurs

- **Triceratops:** ride it, and attack to charge through rocks and enemies.
- **Parasaurolophus:** ride it for huge jumps, and attack to honk and stun nearby enemies.
- **Brachiosaurus:** a living lift. Stand on its head and it raises you to high cliffs.
- **Carnivores:** Compys, Raptors, spitting Dilophosaurus, swooping Pterodactyls, and the T-Rex.

Get hit while riding and you're thrown off (no heart lost), and your dino runs off for a moment.

## Controls

| Action | Xbox controller | Keyboard (player 1) | Keyboard (player 2) |
|---|---|---|---|
| Move | Stick / D-pad | Arrow keys | W A S D |
| Jump | A | Z / Space / Up | F / W |
| Attack (or dino power) | X / RT | X | G |
| Switch hero | Y / LB / RB | C | H |
| Ride / get off | B / LT | V / Shift | R |
| Start / pause | Menu (≡) | Enter / Esc | T |
| Mute | View (⧉) | M | |

**Joining:** after the story, each player presses **A** (controller), **Z** (arrow keys) or **F**
(WASD) to join, picks a hero with left/right, and anyone presses **Start** to begin. Up to 3
players (e.g. three Xbox controllers, or two controllers plus the keyboard).

On phones and tablets, on-screen buttons appear (single player). On the title screen, press **X**
to see the **controls** or **B** for the **music box** (or click those labels with a mouse).

## Play locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Testing shortcuts: `?play&world=2&players=2` jumps straight into a world with keyboard players,
and `?debug` shows the audio state and any script errors on screen.

## Deploying

Pushing to `main` publishes the game to GitHub Pages via `.github/workflows/deploy.yml`.

## Project layout

- `js/levels.js`: level designs, written as short lists of builder calls
- `js/actors.js`: heroes, dinosaurs, enemies, the T-Rex boss, items
- `js/game.js`: game flow, story, menus, camera, rendering, HUD
- `js/sprites.js`: all pixel art and colour themes, painted in code
- `js/audio.js`: the music engine, songs and sound effects
- `js/input.js`: keyboard, up to 4 gamepads and touch
