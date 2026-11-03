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

## Controls

The samurai always faces the direction they move, and every attack goes where they face.

- **Desktop**: WASD move, click / Space attack or use item, Q/E or scroll cycle slots
  (1-5 select), M / right-click equip a nearby collectible when your slots are full.
- **Mobile**: static joystick (bottom-left), ⚔ attack/use, ◀ ▶ cycle slots, *Equip* lights up
  when you stand on a collectible with full slots. Tapping the world also attacks.

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
