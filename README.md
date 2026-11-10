# Vampire Samurai

A 3D top-down roguelike *betting* game for desktop and mobile, shipped as a PWA.
You are a wandering samurai sworn to guard an ancient temple in the Japanese countryside.
Waves of monsters pour in from the edges of the land; survive as many as you can.

Under the hood the round is a strictly deterministic betting game with a configurable RTP:
the outcome of every round is drawn **before** it starts, and the wave director steers the
difficulty so the round lands on that result while still feeling like a skill game.

## Running it

```bash
npm install
npm run dev          # Vite dev server on :5173 (proxies /api to the backend)
npm run server       # betting backend on :8787 (RTP=0.96 by default)
```

The build uses relative paths, so the contents of `dist/` can be uploaded to any folder of
any static host or game platform as-is. Without the betting server it plays in demo mode.

Production:

```bash
npm run build        # builds the PWA into dist/
RTP=0.95 npm start   # serves dist/ and the API on :8787
```

`npm test` runs the RTP engine tests (paytable EV, determinism, simulated RTP convergence).

If the backend is unreachable the client falls back to the same deterministic engine
locally with a demo balance, so the PWA still plays offline.

## Layout

| Path | What |
| --- | --- |
| `shared/rtp.js` | Paytable, RTP normalisation and outcome drawing (server + offline client) |
| `shared/rng.js`, `shared/noise.js` | Seeded RNG and simplex noise |
| `server/index.js` | Express API: `/api/config`, `/api/config/rtp`, `/api/round/start`, `/api/round/settle` |
| `src/world/` | Terrain height grid, solids (collision), water, wind shader, foliage (instanced trees with textured, fluttering leaf cards), GPU grass, temple ruins, procedural textures, sky/day-night with stable shadows |
| `src/entities/` | Humanoid rig built from merged detailed parts + procedural animation, weapons & attack choreography, the six samurai, seven monsters, collectibles, projectiles/areas, particles |
| `src/game/` | Game state machine, wave director + outcome steering, betting round client, pickups |
| `src/ui/` | Menu, HUD, styles |
| `catalog/` | Asset catalog for the reskin artist (static page, renders and `data.json`) |
| `tools/catalog/` | Generator that renders the catalog images from the game's own models |

## Controls

The samurai faces the way they move. Each kind of strike has its own input: **cuts** sweep
left or right across the screen, the **thrust** lunges forward with long reach, the
**overhead cleave** is slow but hits hardest and stuns. Strikes snap toward the nearest enemy
in front of you.

- **Desktop**: WASD move. Arrow keys or I / J / K / L strike: left/right cut, up thrust, down
  cleave. Space or click is the plain combo attack. Q/E or scroll cycle slots (1-5 select),
  F / M / right-click equip a nearby collectible when your slots are full.
- **Controller** (PS5 DualSense, Xbox and other standard pads): left stick / D-pad up-down
  move. Flick the right stick to strike that way (left/right cut, up thrust, down cleave).
  Square / X or R2 / RT is the plain combo (hold to draw the bow), L1 / R1 (LB / RB) or D-pad
  left/right cycle items, Triangle / Y use the selected item, Cross / A equip a nearby
  collectible. On the menu the D-pad picks a samurai and the wager, Cross / A or Options / Menu
  starts; Cross / A continues from the result screen. Prompts switch to the controller's button
  names, and the pad rumbles on hits and heavy impacts.
- **Mobile**: static joystick (bottom-left). Swipe anywhere on the screen to strike in that
  direction; tap for the plain combo; press and hold to draw the bow. ◀ ▶ cycle slots, *Equip*
  lights up when you stand on a collectible with full slots.
- **Bow and thrown items** aim with the same inputs: hold an arrow key or the right stick to
  draw toward it, or swipe to throw that way.

## Combat

- **Strikes, not mashing.** Every melee weapon has a cut to each side, a thrust and an overhead
  cleave, each on its own input, plus a plain-attack combo. Holding attack no longer repeats.
  Chaining *different* strikes in rhythm builds **flow** (流, up to four marks above the
  samurai): each level adds 10% damage and shortens windups. Repeating one strike, or falling
  back on the combo button, resets it.
- **One motion into the next.** A strike starts from wherever the blade is and carries on with
  the velocity it already has. If the blade is already near where the next strike begins (a
  left cut ends where a right cut starts), the windup is shortened, so complementary strikes
  flow. After the follow-through the guard springs back with the swing's momentum. The edge
  turns to lead the cut during the windup, so it never flips mid-swing. A short hit-stop and a
  fading blade trail give each cut weight (`src/entities/attacks.js`, `src/entities/trail.js`).
- **A body driven from the ground up** (`src/entities/body.js`). The feet are planted in the
  world and only move when they step: a gait stepper paced by speed (a walk, then a run with a
  flight phase), settling steps back into a balanced stance when you stop or turn, and each
  strike's own footwork (the lead foot drives in on a thrust or cleave, the back foot slides up
  behind). Two-bone IK reaches the feet, and ankles keep the soles flat or rolling off the toes.
  The hips sit as high as the planted feet allow, so the walk dips through each step and lunges
  sink naturally, with springs for the landing. The spine bends at the waist and chest and
  shares each strike's twist with the hips leading (the kinetic chain). It leans into
  acceleration and banks into turns. The head tracks the nearest threat or calmly scans the
  land, keeping the gaze level. Free arms swing with the stride or open out as a counterweight.
  Any abrupt change (weapon swap, item gesture, death) is blended away (inertialization).
  Tests check every strike points forward on impact and that no chain of strikes passes the
  blade through the wielder's head or hat.
- The Yumi is held to draw: power builds to full after one second and the arrow stays nocked
  while you keep holding (a full draw flies faster, hits harder and pierces); a quick tap looses
  an instant snap shot for point-blank defence.
- The Kusarigama's chain is simulated (Verlet rope, rendered as interlocking links): it hangs
  from the handle at rest, pays out behind the flying sickle and reels back in
  (`src/entities/chain.js`).
- Melee swings also chop trees (cherry, maple, mulberry, pine). A felled tree topples the way
  you face and crushes what it lands on; the trunk becomes a log that rolls downhill if it lies
  across a slope, flattening monsters and grass in its path (`src/world/forest.js`).
- Water: lakes and the flooded rice terraces have a smooth, depth-tinted surface with a thin
  shoreline foam. Wading legs stamp tapered foam trails and push a fanning ripple wake
  (simulated around the guardian); wading slows everyone down (`src/world/water.js`).
- The temple terraces are a refuge: monsters reach them only by the stairs, lining up on each
  flight's approach lane.

## HUD and items

- Five slots across the top-left; slot 1 is always the primary weapon. Slot icons, counts and
  the selected slot update live as items are used, stacked or run out, and when the last of an
  item is used the samurai switches back to the primary weapon.
- Stackable items (Mulberry 5, Green Tea 2, Shuriken 12, Makibishi 6, Bo-hiya 3 per slot) top
  up their stack first and spill into a free slot; whatever doesn't fit stays on the ground.
  A Shuriken pickup is 3 stars, Makibishi 3, everything else 1. The same item can occupy
  several slots (e.g. four Green Teas in two slots).
- Enemies that are off screen close in faster, so a wandering guardian always meets the
  whole wave.
- All icons are hand-drawn SVG (`src/ui/icons.js`); no emoji are used anywhere.

## How the outcome steering works

1. `POST /api/round/start` debits the bet and draws `{deathWave, deathProgress, profile}` from
   a paytable whose expected value equals the configured RTP (`shared/rtp.js`, 96% by default).
   The chance of falling on each wave follows a hazard curve that starts low and rises, solved
   by bisection so the expected payout is exactly the RTP. At 96% the median round ends on
   wave 8 and about a third of rounds return the stake or more.
2. The client seeds all wave composition from the returned seed. Before the fated wave the
   guardian cannot fall: lethal hits become "Dodged!", pressure eases at low health and
   healing collectibles appear nearby.
3. On the fated wave, once `deathProgress` of it is cleared, reinforcements keep coming and
   monster damage ramps until the guardian falls.
4. `POST /api/round/settle` pays `bet × multiplier[deathWave]` from the pre-drawn outcome,
   never from anything the client reports, and reveals the server seed (provably fair).

## Play online (GitHub Pages)

The `Deploy to GitHub Pages` workflow builds a static demo on every push and publishes it to
https://arifialkov.github.io/vampire-samurai/. GitHub Pages has no backend, so this build plays
in local demo mode: a demo balance stored in the browser, with outcomes drawn by the same
shared RTP engine. Run `npm run server` for the full server-settled version.

## Asset catalog (reskin reference)

https://arifialkov.github.io/vampire-samurai/asset-catalog/ lists every samurai, monster, weapon
and collectible with renders from several angles, real-world size, triangle count, palette,
gameplay stats, the animations each model must support, rig pivot positions and the source files.
It is searchable, filterable by category and sortable by name, size, triangles or tier. Each asset
has a deep link (for example `#monster-demon`), and `data.json` holds everything in one file.

The renders and data come from the game code itself. After changing a model, regenerate them:

```bash
node tools/catalog/build.mjs
```

This starts a Vite dev server, renders each asset in headless Chromium (Playwright) and rewrites
`catalog/img/` and `catalog/data.json`. The Pages workflow copies `catalog/` to `/asset-catalog/`;
it is not part of the game build, so platform uploads of `dist/` stay unchanged.
