# The Museum of Impact

*Moments that existed for milliseconds, preserved forever.*

An interactive WebGL installation: a vaulted European gallery at dusk whose works are physical impacts. **The object is not the artwork — the moment of impact is.** The visitor enters as an observer, steps inside a work, travels back to before it happened, *causes* the impact with their own hands, takes control of time, freezes it, walks around the frozen event, rearranges the fragments, and preserves what they made as a new acquisition that physically stands in the museum.

## The collection

| No. | Work | Material | Personality | The visitor… |
|---|---|---|---|---|
| 001 | **The Shatter** (flagship) | blown glass | fast · sharp · chaotic · delicate | lifts the vessel from its vitrine plinth, raises it, lets go |
| 002 | **The Fracture** | aged porcelain, gilt rim | fragile · heavy · angular | lifts the plate, drops it on the stone floor |
| 003 | **The Splash** | water, marble, bronze | fluid · organic · soft | drops a bronze sphere into a basin |
| 004 | **The Break** | clear ice, iron, ash | crystalline · sharp · fragile | takes up the hammer, swings or drops it |
| 005 | **The Collapse** | limestone, granite | heavy · slow · structural | lifts a granite sphere and brings down a portico |

## The loop

Enter → walk the corridor → a work stands on its dais with a small plaque → **Enter the moment →** → time rewinds the museum's own record of the event → the object returns to rest → *take hold* (**click to take it, move the cursor to raise it, click again to let go**; scroll pushes it away or draws it nearer, shift-scroll turns it) → let go → a cinematic camera follows the fall; the impact slows time by itself → control returns: **1× · 0.5× · 0.25× · 0.1× · ◂ Rewind · scrub · Freeze moment** → the world stops (sound, grain, physics) → orbit, zoom, pan, walk (WASD, Shift), double-click to focus, R to reset → take a fragment, turn it, throw it into others (chain reactions) → *A moment worth preserving* → name it, sign it → a quiet ceremony (light, dais, plaque) → **New Acquisitions** wing, where it stands as a real 3D installation → *Experience this moment →* re-enters the exact composition.

Freezing late never punishes: if the event has already settled, time drifts back to the most alive instant, and **Find a moment** scrubs within the event without leaving the frozen state.

## How it works

- `src/sim/simulation.js` — **ImpactSimulation**: one world per artwork (cannon-es). Breakable objects are pre-fractured pieces carried as one rigid body until an impact exceeds the material's threshold; the contact point, normal and speed shape every fragment's velocity, so each drop is different. Hold-and-release, compose (zero-gravity, viscous, with chain-reaction collisions), and material-tagged collision events.
- `src/sim/recording.js` — **time** is a recording, never reversed physics: live simulation is recorded at 120 Hz; slow motion, rewind and scrubbing replay it with interpolation.
- `src/sim/particles.js`, `src/sim/splash.js` — glitter, chips, crystals, grit, dust, and the whole splash (cavity, crown, tendrils, jet, droplets, secondary ripples) are pure functions of time, so they freeze, rewind and scrub exactly.
- `src/sim/fracture.js` (shell fracture with shared crack lines), `src/sim/voronoi.js` (volumetric Voronoi cells for the ice).
- `src/audio.js` — synthesised impact families per material, chosen by collision speed with thresholds and cooldowns; slowed time stretches and softens sound, rewind plays real fragments reversed, freeze falls silent so the room is heard; museum ambience (room tone, distant footsteps, a near-subliminal tonal bed).
- `src/camera-rig.js` — damped orbit with inertia, pan, zoom, walk, focus, reset, plus a cinematic layer that hands control back without a snap. While something is held the wheel and the left button belong to the hand, not the camera.
- **Telling the visitor what to do**: a legend of keys in the corridor and inside every moment (`#g-keys`, `#m-keys`), contextual to the state; a plumb line and a landing ring under whatever is held, with its height in metres; and **Start over** always in the top corner (also `T`).
- **The edge of the moment**: each stage is a bounded arena (`stage.arena`, drawn as a hair-thin gold ring on the floor). Nothing rolls out of the light, and `ImpactSimulation.settle()` adds the rolling resistance and rest threshold cannon-es does not model, so a sphere can actually stop.
- `src/museum.js` — the hall, installations (each work's actual fragments at its instant, breathing a few milliseconds either side), plaques, the hung collection and the New Acquisitions wing.
- **The hung collection**: four history paintings on the east wall, in the order the events happened, so the corridor is walked forward through two thousand years — *The Death of Caesar* (after Camuccini), *The Fall of Constantinople*, *The Storming of the Bastille* (after Houël), *The Fall of the Berlin Wall*. Each has a card giving the date of the event itself, and its own wash of light.
- `src/textures.js` — `painting()` builds them the way an oil painting is built: a warm ground, dead-colouring in broad translucent strokes, lights scumbled on top, then varnish, dust and craquelure. Crowds are drawn with a `figure()` silhouette primitive rather than stamped marks, so they read as people at gallery distance.
- Visitor works persist in `localStorage` as physics snapshots (positions, rotations, frozen debris and liquid state, camera).
- No image or audio files: every texture is painted on canvas, every sound synthesised.

## Typography

Display type is **Instrument Serif**; everything else is **Matter** (Displaay), self-hosted from
`public/fonts/` so every visitor sees it. Matter is a commercial typeface — the files here are
covered by the owner's licence and are not offered for reuse. Without it the stack falls back to
Inter, which the site loads from Google Fonts.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173  (append ?debug to expose test hooks)
npm run build
```

Visual references are in `references/`.
