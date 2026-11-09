// Gear World engine: gear types and the rules for how gears connect.
// Shared by the game (browser) and the level checker (node).
(function () {
  const GEAR_TYPES = {
    red:    { key: 'red',    name: 'Small',       r: 30, teeth: 12, color: '#e5484d', dark: '#8f1d21' },
    yellow: { key: 'yellow', name: 'Medium',      r: 45, teeth: 18, color: '#f5c518', dark: '#94730a' },
    blue:   { key: 'blue',   name: 'Large',       r: 60, teeth: 24, color: '#3e8ef7', dark: '#1a4a94' },
    green:  { key: 'green',  name: 'Extra Large', r: 75, teeth: 30, color: '#2fb35a', dark: '#14652d' },
  };
  const TYPE_ORDER = ['red', 'yellow', 'blue', 'green'];

  // How close (in px) two gears' edges must be to count as meshed.
  const MESH_TOL = 4;

  // gears[0] is the motor, gears[1] is the machine's gear. Each gear: {x, y, r}.
  // Returns which gears turn, how fast/which way, and whether anything is jammed.
  function computeNetwork(gears) {
    const n = gears.length;
    const adj = Array.from({ length: n }, () => []);
    const overlap = new Array(n).fill(false);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(gears[i].x - gears[j].x, gears[i].y - gears[j].y);
        const sum = gears[i].r + gears[j].r;
        if (d < sum - MESH_TOL) {
          overlap[i] = overlap[j] = true;
        } else if (d <= sum + MESH_TOL) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
    }

    // Walk outward from the motor. Each mesh flips the direction.
    const speed = new Array(n).fill(0);
    const parent = new Array(n).fill(-1);
    const connected = new Array(n).fill(false);
    const order = [0];
    connected[0] = true;
    speed[0] = 1; // +1 = clockwise
    let conflict = false;

    for (let q = 0; q < order.length; q++) {
      const cur = order[q];
      for (const nb of adj[cur]) {
        if (!connected[nb]) {
          connected[nb] = true;
          parent[nb] = cur;
          speed[nb] = -speed[cur] * gears[cur].r / gears[nb].r;
          order.push(nb);
        } else if (Math.sign(speed[nb]) === Math.sign(speed[cur])) {
          conflict = true; // a loop with an odd number of gears locks up
        }
      }
    }

    const overlapInChain = order.some((i) => overlap[i]);
    const jammed = conflict || overlapInChain;
    return { adj, overlap, speed, parent, order, connected, jammed, conflict, overlapInChain };
  }

  // States: 'win' | 'wrongdir' | 'jammed' | 'disconnected'
  function evaluate(level, gears) {
    const net = computeNetwork(gears);
    let state;
    if (net.jammed) state = 'jammed';
    else if (!net.connected[1]) state = 'disconnected';
    else if (level.requireDir && Math.sign(net.speed[1]) !== level.requireDir) state = 'wrongdir';
    else state = 'win';
    return { state, net };
  }

  const api = { GEAR_TYPES, TYPE_ORDER, MESH_TOL, computeNetwork, evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(window, api);
})();
