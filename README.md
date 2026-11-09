# Gear World

A web puzzle game: place gears on the pegs to connect the motor to each machine.

- 4 gear sizes, each a different color: Small (red), Medium (yellow), Large (blue), Extra Large (green)
- 3 levels: The Windmill, The Oil Rig, The Clock Tower

## Play locally

```bash
python3 -m http.server 8742
```

Then open http://localhost:8742.

## Adding levels

Levels live in `levels.js`. After editing, check every level is solvable:

```bash
node tools/check-levels.js
```
