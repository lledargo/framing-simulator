# Framing Simulator

Lay out dimensional lumber in 3D to build frames, then get a cut list out of it.

This is a **visualisation and take-off tool**. It does not calculate loads, spans, or
code compliance, and it should not be used to decide whether a structure will stand up.

## What it does

- Add boards from stock presets (2x4, 2x6, 45×90 …) or type any section and length.
- Constrain surfaces to each other: a stud's end **mated** to a plate's face, two
  studs' faces **flush**, a plate resting on the ground grid.
- Constraints are parametric. Lengthen a stud and the top plate follows; swap a
  bottom plate from 2x4 to 2x6 and everything above it moves up.
- Read off a grouped cut list with quantities, total run, and board feet. Export CSV.
- Work in feet-and-inches or millimetres, switchable at any time.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm test             # unit tests for units, geometry, solver, picking, cut list
npm run lint
npm run build
```

## Navigation

Built trackpad-first — no gesture needs a middle or right mouse button.

| Gesture | Action |
| --- | --- |
| Two-finger scroll | Orbit |
| Shift + two-finger scroll | Pan |
| Pinch | Zoom toward the pointer |
| Right-drag / middle-drag | Orbit / pan, for mouse users |

Alternative mappings (Fusion, Blender, classic web 3D) are in **Settings → Navigation**.

| Key | Action |
| --- | --- |
| `1`–`6` | Front, back, right, left, top, bottom |
| `0` | Isometric |
| `F` | Frame everything |
| `V` / `C` | Select tool / Constrain tool |
| `Esc` | Cancel the current pick |
| `Delete` | Delete selection |
| `Cmd/Ctrl+Z` | Undo (add Shift to redo) |

## Building a wall

1. **Add** → click `2x4` three times.
2. **Board** tab → set the first one to *Flat, running X*, 8'. That's the bottom plate.
3. **Constrain** (`C`) → click the plate's top, then the ground grid. It drops to the floor.
4. Set the second board to *Upright, face toward Z* and 92 5/8" — a precut stud.
5. Constrain the stud's lower end to the plate's top face. It stands up on the plate.
6. Add the top plate and mate it to the stud's upper end.

Change the stud's length and the top plate moves with it.

## How it works

The interesting constraint is that this tool **never rotates a board to satisfy a
constraint** — orientation is always something the user sets explicitly. That single
restriction is what keeps the geometry kernel small.

Because orientation is known, "these two surfaces are coincident" stops being a 6-DOF
assembly mate and becomes one scalar equation along a known normal:

```
tA - tB = c        where t = normal · position
```

Constraints are then bucketed by normal direction into independent 1-D systems, and each
system is a graph of difference constraints solved by breadth-first propagation from the
ground or any pinned board. It is exact, linear in the number of constraints, and runs on
every keystroke rather than behind a "recompute" button.

Cycles are checked rather than averaged. Four boards in a rectangle whose offsets agree
resolve fine; a genuinely contradictory pair is flagged in the constraints panel with the
distance it is off by, instead of the model quietly drifting to a compromise nobody asked
for.

```
src/core/      units, lumber presets, geometry, solver, cut list — pure, no React
src/scene/     three.js viewport, board meshes, surface picking, camera controls
src/ui/        panels
src/state/     zustand store, autosave
tests/         vitest, covering core/ and the picking maths
smoke.mjs      end-to-end browser check
```

## Not built yet

Array tool for 16"/24" on-centre runs, reusable saved assemblies, stock-length cut
optimisation, arbitrary rotation for rafters and braces, and mitre/bevel end cuts.

## Licence

MIT
