// Gear World: rendering, input, levels and machines.
(() => {
  const W = 960, H = 560, GROUND = 535;
  const SNAP = 46;            // how close (board px) a drop must be to a peg
  const MOTOR_SPEED = 1.3;    // radians per second
  const TAU = Math.PI * 2;

  const MOTOR_STYLE = { r: 45, teeth: 18, color: '#a3afbb', dark: '#4c5661' };
  const TARGET_STYLE = { r: 45, teeth: 18, color: '#d4a24f', dark: '#7a5518' };

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  // ---------- Saved progress ----------
  const STORE_KEY = 'gearworld-progress-v1';
  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(STORE_KEY));
      if (p && p.unlocked) return p;
    } catch (e) { /* storage unavailable */ }
    return { unlocked: 1, done: [] };
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }
  const progress = loadProgress();

  // ---------- Sound ----------
  let audio = null;
  let muted = false;
  function tone(freq, dur, type = 'square', vol = 0.04, when = 0) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime + when;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) { /* no audio */ }
  }
  const sfx = {
    place() { tone(660, 0.05, 'square', 0.03); tone(330, 0.09, 'triangle', 0.05, 0.03); },
    remove() { tone(300, 0.08, 'triangle', 0.05); },
    jam() { tone(90, 0.3, 'sawtooth', 0.05); tone(95, 0.3, 'sawtooth', 0.04, 0.05); },
    wrong() { tone(330, 0.15, 'triangle', 0.05); tone(247, 0.25, 'triangle', 0.05, 0.15); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, i * 0.12)); },
  };

  // ---------- Gear drawing ----------
  const pathCache = {};
  function gearPath(r, teeth) {
    const key = r + '_' + teeth;
    if (pathCache[key]) return pathCache[key];
    const p = new Path2D();
    const step = TAU / teeth, ra = r + 4, rd = r - 4;
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      const pts = [[rd, a - 0.32 * step], [ra, a - 0.16 * step], [ra, a + 0.16 * step], [rd, a + 0.32 * step]];
      pts.forEach(([rr, aa], k) => {
        const x = Math.cos(aa) * rr, y = Math.sin(aa) * rr;
        if (i === 0 && k === 0) p.moveTo(x, y); else p.lineTo(x, y);
      });
      p.arc(0, 0, rd, a + 0.32 * step, a + 0.68 * step);
    }
    p.closePath();
    const axle = Math.max(5, r * 0.13);
    p.moveTo(axle, 0);
    p.arc(0, 0, axle, 0, TAU);
    if (r >= 40) {
      const holes = r >= 70 ? 6 : r >= 55 ? 5 : 4;
      const hr = r * 0.16, hd = r * 0.55;
      for (let k = 0; k < holes; k++) {
        const a = k * TAU / holes;
        const cx = Math.cos(a) * hd, cy = Math.sin(a) * hd;
        p.moveTo(cx + hr, cy);
        p.arc(cx, cy, hr, 0, TAU);
      }
    }
    pathCache[key] = p;
    return p;
  }

  function drawGear(c, x, y, style, angle, opts = {}) {
    const path = gearPath(style.r, style.teeth);
    c.save();
    c.globalAlpha = opts.alpha ?? 1;
    // shadow
    c.save();
    c.translate(x + 3, y + 4);
    c.rotate(angle);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fill(path, 'evenodd');
    c.restore();
    // body
    c.translate(x, y);
    c.rotate(angle);
    c.fillStyle = style.color;
    c.fill(path, 'evenodd');
    c.lineWidth = 2;
    c.strokeStyle = style.dark;
    c.stroke(path);
    c.beginPath();
    c.arc(0, 0, style.r - 9, 0, TAU);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.arc(0, 0, Math.max(9, style.r * 0.24), 0, TAU);
    c.strokeStyle = style.dark;
    c.lineWidth = 3;
    c.stroke();
    c.restore();

    if (opts.outline) {
      c.save();
      c.beginPath();
      c.arc(x, y, style.r + 8, 0, TAU);
      c.strokeStyle = opts.outline;
      c.lineWidth = 3;
      c.setLineDash([7, 5]);
      c.stroke();
      c.restore();
    }
    drawBolt(c, x, y);
  }

  function drawBolt(c, x, y, size = 5) {
    c.beginPath();
    c.arc(x, y, size, 0, TAU);
    c.fillStyle = '#e4e7ea';
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = '#555c63';
    c.stroke();
  }

  // Tray / drag icons
  const iconURL = {};
  for (const key of TYPE_ORDER) {
    const t = GEAR_TYPES[key];
    const c = document.createElement('canvas');
    const s = (t.r + 7) * 2;
    c.width = c.height = s * 2;
    const cc = c.getContext('2d');
    cc.scale(2, 2);
    drawGear(cc, s / 2 - 1, s / 2 - 2, t, 0);
    iconURL[key] = c.toDataURL();
  }

  // ---------- Level state ----------
  let levelIdx = 0;
  let level, motorG, targetG;
  let placed = [];          // gears on pegs: {peg, type, x, y, r, teeth, angle, offset}
  let netGears = [];        // [motor, target, ...placed] matching `net` indices
  let net = null;
  let state = 'disconnected';
  let won = false, overlayShown = false, winTimer = null;
  let showHint = false;
  let selectedType = null;
  let drag = null;
  let machine = {};         // per-level animation data
  let particles = [];

  function loadLevel(idx) {
    levelIdx = idx;
    level = LEVELS[idx];
    motorG = { x: level.motor.x, y: level.motor.y, r: 45, teeth: 18, angle: 0, offset: 0 };
    targetG = { x: level.target.x, y: level.target.y, r: 45, teeth: 18, angle: 0, offset: null };
    placed = [];
    won = false; overlayShown = false;
    clearTimeout(winTimer);
    showHint = level.hintVisible;
    selectedType = null;
    machine = { barrels: 0, rot: 0, lastAngle: 0 };
    particles = [];
    $('winOverlay').classList.add('hidden');
    $('levelName').textContent = `Level ${level.id}: ${level.name}`;
    $('objective').textContent = level.objective;
    $('hintBtn').classList.toggle('hidden', level.hintVisible);
    $('hintBtn').textContent = 'Show hint';
    buildLevelButtons();
    buildTray();
    recompute();
  }

  function remaining(type) {
    return level.inventory[type] - placed.filter((g) => g.type === type).length;
  }

  function placeGear(pegIdx, type) {
    if (remaining(type) <= 0) return false;
    const existing = placed.find((g) => g.peg === pegIdx);
    if (existing) placed = placed.filter((g) => g !== existing);
    const t = GEAR_TYPES[type];
    const [x, y] = level.pegs[pegIdx];
    placed.push({ peg: pegIdx, type, x, y, r: t.r, teeth: t.teeth, angle: Math.random() * TAU, offset: null });
    sfx.place();
    recompute();
    return true;
  }

  function removeGear(g) {
    placed = placed.filter((p) => p !== g);
    recompute();
  }

  function recompute() {
    netGears = [motorG, targetG, ...placed];
    const prevState = state;
    const res = evaluate(level, netGears);
    net = res.net;
    state = res.state;
    netGears.forEach((g, i) => { if (!net.connected[i] && i !== 0) g.offset = null; });

    if (state !== prevState) {
      if (state === 'jammed') sfx.jam();
      if (state === 'wrongdir') sfx.wrong();
    }

    if (state === 'win' && !won) {
      won = true;
      sfx.win();
      burst(targetG.x, targetG.y);
      if (!progress.done.includes(level.id)) progress.done.push(level.id);
      progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, level.id + 1));
      saveProgress();
      buildLevelButtons();
      winTimer = setTimeout(showWin, 2600);
    } else if (state !== 'win' && won && !overlayShown) {
      won = false;
      clearTimeout(winTimer);
    }
    updateStatus();
    updateTray();
  }

  function updateStatus() {
    const el = $('status');
    el.className = 'status';
    const name = { windmill: 'windmill', oilrig: 'pump jack', clock: 'clock' }[level.machine];
    if (state === 'win') {
      el.textContent = level.winText;
      el.classList.add('good');
    } else if (state === 'jammed') {
      el.textContent = net.conflict
        ? 'Jammed! A loop of gears is fighting itself.'
        : 'Jammed! Two gears are overlapping.';
      el.classList.add('bad');
    } else if (state === 'wrongdir') {
      el.textContent = 'Wrong way! The clock is running backwards. Try a different route.';
      el.classList.add('bad');
    } else if (placed.length === 0) {
      el.textContent = 'Drag gears from the toolbox onto the pegs.';
    } else {
      el.textContent = `Keep going! The motor isn't connected to the ${name} yet.`;
    }
  }

  // ---------- UI: level buttons, tray, overlay ----------
  function buildLevelButtons() {
    const nav = $('levelButtons');
    nav.innerHTML = '';
    LEVELS.forEach((l, i) => {
      const b = document.createElement('button');
      b.className = 'level-btn';
      if (i === levelIdx) b.classList.add('current');
      if (progress.done.includes(l.id)) b.classList.add('done');
      b.textContent = l.id;
      b.title = l.name;
      b.disabled = l.id > progress.unlocked;
      b.addEventListener('click', () => loadLevel(i));
      nav.appendChild(b);
    });
  }

  const trayItems = {};
  function buildTray() {
    const tray = $('tray');
    tray.innerHTML = '';
    for (const key of TYPE_ORDER) {
      const t = GEAR_TYPES[key];
      const item = document.createElement('div');
      item.className = 'tray-item';
      item.innerHTML = `
        <img src="${iconURL[key]}" alt="" style="transform: scale(${(0.55 + 0.45 * t.r / 75).toFixed(2)})">
        <span class="name" style="color:${t.dark}">${t.name}</span>
        <span class="count"></span>
        <span class="need"></span>`;
      item.addEventListener('pointerdown', (e) => startTrayDrag(e, key));
      tray.appendChild(item);
      trayItems[key] = item;
    }
  }

  function updateTray() {
    for (const key of TYPE_ORDER) {
      const item = trayItems[key];
      if (!item) continue;
      const left = remaining(key);
      item.querySelector('.count').textContent = `${left} left`;
      item.classList.toggle('empty', left <= 0);
      item.classList.toggle('selected', selectedType === key);
      const need = item.querySelector('.need');
      need.textContent = `Need ${level.needed[key]}`;
      need.classList.toggle('hidden', !showHint);
    }
    if (selectedType && remaining(selectedType) <= 0) {
      selectedType = null;
      updateTray();
    }
  }

  function showWin() {
    overlayShown = true;
    const last = levelIdx === LEVELS.length - 1;
    $('winTitle').textContent = last ? 'You beat Gear World!' : 'Level complete!';
    $('winText').textContent = last
      ? 'All three machines are running. More levels coming soon!'
      : level.winText;
    $('nextBtn').textContent = last ? 'Back to level 1' : 'Next level';
    $('winOverlay').classList.remove('hidden');
  }

  $('nextBtn').addEventListener('click', () => loadLevel((levelIdx + 1) % LEVELS.length));
  $('replayBtn').addEventListener('click', () => loadLevel(levelIdx));
  $('resetBtn').addEventListener('click', () => { if (placed.length) sfx.remove(); loadLevel(levelIdx); });
  $('hintBtn').addEventListener('click', () => {
    showHint = !showHint;
    $('hintBtn').textContent = showHint ? 'Hide hint' : 'Show hint';
    updateTray();
  });
  $('muteBtn').addEventListener('click', () => {
    muted = !muted;
    $('muteBtn').textContent = muted ? '🔈' : '🔊';
  });

  // ---------- Input ----------
  const dragImg = $('dragImg');

  function toBoard(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * W / rect.width,
      y: (e.clientY - rect.top) * H / rect.height,
      inside: e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom,
      scale: rect.width / W,
    };
  }

  function nearestPeg(p) {
    let best = -1, bestD = SNAP;
    level.pegs.forEach(([x, y], i) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function startTrayDrag(e, type) {
    if (remaining(type) <= 0) return;
    e.preventDefault();
    drag = { type, from: 'tray', sx: e.clientX, sy: e.clientY, moved: false, pos: null };
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = toBoard(e);
    e.preventDefault();
    // tap-to-place with a selected gear: an empty peg under the finger wins
    if (selectedType) {
      const peg = nearestPeg(p);
      if (peg >= 0 && !placed.some((g) => g.peg === peg)) {
        placeGear(peg, selectedType);
        return;
      }
    }
    // pick up the placed gear whose center is closest
    let hit = null, hitD = Infinity;
    for (const g of placed) {
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      if (d < g.r + 3 && d < hitD) { hit = g; hitD = d; }
    }
    if (hit) {
      drag = { type: hit.type, from: 'board', gear: hit, sx: e.clientX, sy: e.clientY, moved: false, pos: p };
      return;
    }
    if (selectedType) {
      const peg = nearestPeg(p);
      if (peg >= 0) placeGear(peg, selectedType);
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
      drag.moved = true;
      selectedType = null;
      if (drag.from === 'board') removeGear(drag.gear);
      updateTray();
    }
    if (!drag.moved) return;
    const p = toBoard(e);
    drag.pos = p;
    if (p.inside) {
      dragImg.classList.add('hidden');
    } else {
      const t = GEAR_TYPES[drag.type];
      dragImg.src = iconURL[drag.type];
      dragImg.style.width = `${(t.r + 7) * 2 * p.scale}px`;
      dragImg.style.left = `${e.clientX}px`;
      dragImg.style.top = `${e.clientY}px`;
      dragImg.classList.remove('hidden');
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    dragImg.classList.add('hidden');
    if (!d.moved) {
      if (d.from === 'tray') {
        selectedType = selectedType === d.type ? null : d.type;
        updateTray();
      } else {
        removeGear(d.gear);
        sfx.remove();
      }
      return;
    }
    const p = toBoard(e);
    if (p.inside) {
      const peg = nearestPeg(p);
      if (peg >= 0) { placeGear(peg, d.type); return; }
    }
    if (d.from === 'board') sfx.remove();
  });

  window.addEventListener('pointercancel', () => { drag = null; dragImg.classList.add('hidden'); });

  // ---------- Animation ----------
  function updateAngles(dt) {
    if (!net.jammed) motorG.angle += MOTOR_SPEED * dt;
    for (const i of net.order) {
      if (i === 0) continue;
      const g = netGears[i], p = netGears[net.parent[i]];
      const th = Math.atan2(g.y - p.y, g.x - p.x);
      // keep teeth interlocked: roll the child against its parent
      const ideal = th + Math.PI - (p.r / g.r) * (p.angle - th) + Math.PI / g.teeth;
      const step = TAU / g.teeth;
      if (g.offset == null) g.offset = Math.round((g.angle - ideal) / step) * step;
      g.angle = ideal + g.offset;
    }
    // oil barrels counter
    const da = targetG.angle - machine.lastAngle;
    machine.lastAngle = targetG.angle;
    if (level.machine === 'oilrig' && state === 'win') {
      machine.rot += Math.abs(da);
      machine.barrels = Math.floor(machine.rot / TAU);
    }
  }

  function burst(x, y) {
    const colors = TYPE_ORDER.map((k) => GEAR_TYPES[k].color);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, s = 120 + Math.random() * 220;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120,
        life: 1.2 + Math.random() * 0.6, color: colors[i % 4], size: 4 + Math.random() * 4, rot: Math.random() * TAU,
      });
    }
  }

  // ---------- Scene drawing ----------
  const THEMES = {
    windmill: { sky: ['#9fd8f5', '#e6f6ff'], hill: '#9ccc6a', hill2: '#86b957', ground: '#6da544', dirt: '#8a6a43' },
    oilrig:   { sky: ['#f7c98b', '#fdeccb'], hill: '#e3b77a', hill2: '#d4a465', ground: '#c99556', dirt: '#9b6f3d' },
    clock:    { sky: ['#a9c6ea', '#e9f1fb'], hill: '#9fb2c9', hill2: '#8a9db6', ground: '#a9a39a', dirt: '#7c766c' },
  };

  function drawBackground(t) {
    const th = THEMES[level.machine];
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // sun
    ctx.beginPath();
    ctx.arc(80, 70, 34, 0, TAU);
    ctx.fillStyle = level.machine === 'oilrig' ? '#ffd27a' : '#fff3b0';
    ctx.fill();

    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    [[0, 90, 1], [380, 50, 0.8], [700, 110, 1.1]].forEach(([ox, y, s], i) => {
      const x = ((ox + t * (8 + i * 3)) % (W + 200)) - 100;
      ctx.beginPath();
      ctx.ellipse(x, y, 40 * s, 16 * s, 0, 0, TAU);
      ctx.ellipse(x + 26 * s, y - 10 * s, 26 * s, 16 * s, 0, 0, TAU);
      ctx.ellipse(x - 24 * s, y - 4 * s, 22 * s, 12 * s, 0, 0, TAU);
      ctx.fill();
    });

    // hills
    ctx.fillStyle = th.hill;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, GROUND - 70 - Math.sin(x / 140) * 30 - Math.sin(x / 57) * 8);
    ctx.lineTo(W, GROUND);
    ctx.fill();
    ctx.fillStyle = th.hill2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, GROUND - 30 - Math.sin(x / 90 + 2) * 18);
    ctx.lineTo(W, GROUND);
    ctx.fill();

    // ground
    ctx.fillStyle = th.dirt;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = th.ground;
    ctx.fillRect(0, GROUND - 4, W, 10);
  }

  function drawMotor(t) {
    const { x, y } = motorG;
    // support post
    ctx.fillStyle = '#5d6670';
    ctx.fillRect(x - 10, y + 50, 20, GROUND - y - 50);
    ctx.fillRect(x - 30, GROUND - 8, 60, 8);
    // housing
    ctx.fillStyle = '#6b7580';
    roundRect(x - 62, y - 62, 124, 124, 16);
    ctx.fill();
    ctx.strokeStyle = '#3d444b';
    ctx.lineWidth = 3;
    ctx.stroke();
    // rivets
    ctx.fillStyle = '#c9d0d6';
    [[-50, -50], [50, -50], [-50, 50], [50, 50]].forEach(([dx, dy]) => {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, 4, 0, TAU); ctx.fill();
    });
    // chimney + smoke
    ctx.fillStyle = '#4a5158';
    ctx.fillRect(x + 28, y - 92, 18, 32);
    if (!net.jammed) {
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.6 + i / 3) % 1);
        ctx.beginPath();
        ctx.arc(x + 37 + k * 18, y - 96 - k * 50, 6 + k * 10, 0, TAU);
        ctx.fillStyle = `rgba(220,220,220,${0.6 * (1 - k)})`;
        ctx.fill();
      }
    }
    // label
    ctx.fillStyle = '#f2d16b';
    roundRect(x - 30, y + 64, 60, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#3d2f10';
    ctx.font = '600 12px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MOTOR', x, y + 73.5);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Windmill: target gear drives the blades through a vertical shaft.
  function drawWindmillBack() {
    const cx = targetG.x, hubY = 140;
    // tower
    ctx.beginPath();
    ctx.moveTo(cx - 42, hubY + 10);
    ctx.lineTo(cx + 42, hubY + 10);
    ctx.lineTo(cx + 84, GROUND);
    ctx.lineTo(cx - 84, GROUND);
    ctx.closePath();
    ctx.fillStyle = '#efe2c6';
    ctx.fill();
    ctx.strokeStyle = '#a68b5b';
    ctx.lineWidth = 3;
    ctx.stroke();
    // stone lines
    ctx.strokeStyle = 'rgba(166,139,91,0.35)';
    ctx.lineWidth = 1.5;
    for (let y = hubY + 40; y < GROUND; y += 30) {
      const half = 42 + (y - hubY - 10) / (GROUND - hubY - 10) * 42;
      ctx.beginPath(); ctx.moveTo(cx - half, y); ctx.lineTo(cx + half, y); ctx.stroke();
    }
    // door + window
    ctx.fillStyle = '#7a4f2c';
    ctx.beginPath();
    ctx.moveTo(cx - 20, GROUND); ctx.lineTo(cx - 20, GROUND - 40);
    ctx.arc(cx, GROUND - 40, 20, Math.PI, 0); ctx.lineTo(cx + 20, GROUND); ctx.fill();
    ctx.fillStyle = '#5b7fa3';
    ctx.fillRect(cx - 10, hubY + 50, 20, 26);
    // shaft from gear up to hub
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(cx - 5, hubY, 10, targetG.y - hubY);
    ctx.beginPath();
    ctx.arc(cx, targetG.y, 54, 0, TAU);
    ctx.fillStyle = 'rgba(70,52,30,0.55)';
    ctx.fill();
    // roof
    ctx.beginPath();
    ctx.moveTo(cx - 54, hubY + 14);
    ctx.quadraticCurveTo(cx, hubY - 70, cx + 54, hubY + 14);
    ctx.closePath();
    ctx.fillStyle = '#9b4b2e';
    ctx.fill();
    ctx.strokeStyle = '#6a2f1a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawWindmillBlades() {
    const cx = targetG.x, hubY = 140;
    const a = targetG.angle * 0.6;
    ctx.save();
    ctx.translate(cx, hubY);
    ctx.rotate(a);
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI / 2);
      ctx.fillStyle = '#6e4a2c';
      ctx.fillRect(-3, -150, 6, 150);
      ctx.fillStyle = 'rgba(250,244,230,0.95)';
      ctx.strokeStyle = '#6e4a2c';
      ctx.lineWidth = 2;
      ctx.fillRect(3, -148, 30, 118);
      ctx.strokeRect(3, -148, 30, 118);
      ctx.beginPath();
      for (let y = -128; y < -30; y += 20) { ctx.moveTo(3, y); ctx.lineTo(33, y); }
      ctx.moveTo(18, -148); ctx.lineTo(18, -30);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, hubY, 12, 0, TAU);
    ctx.fillStyle = '#4a3420';
    ctx.fill();
    drawBolt(ctx, cx, hubY, 4);
  }

  // Oil rig: pump jack. Target gear turns the crank, which rocks the beam.
  const PJ = { pivot: { x: 725, y: 205 }, tail: 125, head: 135, crank: 36 };

  function pumpGeometry() {
    const crankA = targetG.angle;
    const pin = { x: targetG.x + Math.cos(crankA) * PJ.crank, y: targetG.y + Math.sin(crankA) * PJ.crank };
    const sinB = Math.max(-0.9, Math.min(0.9, (targetG.y - pin.y) / PJ.tail));
    const b = Math.asin(sinB);
    const P = PJ.pivot;
    const tail = { x: P.x - Math.cos(b) * PJ.tail, y: P.y - Math.sin(b) * PJ.tail };
    return { pin, b, tail, crankA };
  }

  function drawOilRigBack() {
    const P = PJ.pivot;
    // derrick in the distance
    ctx.strokeStyle = 'rgba(120,80,40,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const dx = 905;
    ctx.moveTo(dx - 40, GROUND); ctx.lineTo(dx - 8, 110); ctx.lineTo(dx + 8, 110); ctx.lineTo(dx + 40, GROUND);
    for (let y = 150; y < GROUND; y += 55) {
      const w = 8 + (y - 110) / (GROUND - 110) * 32, w2 = 8 + (y + 55 - 110) / (GROUND - 110) * 32;
      ctx.moveTo(dx - w, y); ctx.lineTo(dx + w, y); ctx.lineTo(dx - w2, Math.min(GROUND, y + 55));
    }
    ctx.stroke();
    // base skid
    ctx.fillStyle = '#5b4a3a';
    ctx.fillRect(545, GROUND - 14, 360, 14);
    // gear stand
    ctx.strokeStyle = '#4a3c2f';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(targetG.x - 40, GROUND - 12); ctx.lineTo(targetG.x, targetG.y);
    ctx.lineTo(targetG.x + 40, GROUND - 12);
    ctx.stroke();
    // samson post
    ctx.strokeStyle = '#3f4a57';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(P.x - 45, GROUND - 12); ctx.lineTo(P.x, P.y); ctx.lineTo(P.x + 45, GROUND - 12);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(P.x - 28, 380); ctx.lineTo(P.x + 28, 380);
    ctx.stroke();
    // wellhead
    ctx.fillStyle = '#6c5845';
    ctx.fillRect(P.x + PJ.head - 14, GROUND - 46, 28, 34);
    ctx.fillStyle = '#3a2f26';
    ctx.fillRect(P.x + PJ.head - 20, GROUND - 52, 40, 8);
    // pipe to tank
    ctx.fillStyle = '#4c4c4c';
    ctx.fillRect(P.x + PJ.head + 14, GROUND - 34, 30, 7);
  }

  function drawOilRigFront() {
    const P = PJ.pivot;
    const { pin, b, tail, crankA } = pumpGeometry();
    // crank arm + counterweight on the target gear
    ctx.save();
    ctx.translate(targetG.x, targetG.y);
    ctx.rotate(crankA);
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 40, Math.PI - 0.7, Math.PI + 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7d241b';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#5a636d';
    ctx.fillRect(0, -7, PJ.crank + 6, 14);
    ctx.restore();
    // pitman arm
    ctx.strokeStyle = '#2f3740';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(pin.x, pin.y); ctx.lineTo(tail.x, tail.y);
    ctx.stroke();
    drawBolt(ctx, pin.x, pin.y, 5);
    // walking beam + horse head
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.rotate(b);
    ctx.fillStyle = '#e0a526';
    ctx.strokeStyle = '#8a6110';
    ctx.lineWidth = 2;
    ctx.fillRect(-PJ.tail - 8, -9, PJ.tail + PJ.head - 2, 18);
    ctx.strokeRect(-PJ.tail - 8, -9, PJ.tail + PJ.head - 2, 18);
    ctx.beginPath();
    ctx.moveTo(PJ.head - 14, -20);
    ctx.quadraticCurveTo(PJ.head + 26, -10, PJ.head + 8, 44);
    ctx.lineTo(PJ.head - 14, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // polished rod from horse head down to the wellhead
    const hx = P.x + Math.cos(b) * (PJ.head + 6) - Math.sin(b) * 42;
    const hy = P.y + Math.sin(b) * (PJ.head + 6) + Math.cos(b) * 42;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx, hy); ctx.lineTo(P.x + PJ.head, GROUND - 50);
    ctx.stroke();
    drawBolt(ctx, P.x, P.y, 7);
    drawBolt(ctx, tail.x, tail.y, 4);

    // barrel counter
    ctx.fillStyle = 'rgba(255,250,240,0.9)';
    roundRect(W - 190, 16, 172, 44, 12);
    ctx.fill();
    ctx.strokeStyle = '#b8863b';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#2b2b2b';
    roundRect(W - 178, 26, 18, 24, 3);
    ctx.fill();
    ctx.fillStyle = '#3b2f22';
    ctx.font = '600 18px Fredoka, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Oil: ${machine.barrels} barrels`, W - 150, 39);
  }

  // Clock tower: target gear turns the clock hands. Must go clockwise.
  function drawClockBack() {
    const cx = targetG.x, top = 72;
    ctx.fillStyle = '#ddd0b6';
    ctx.fillRect(cx - 80, top, 160, GROUND - top);
    ctx.strokeStyle = '#9c8a69';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 80, top, 160, GROUND - top);
    ctx.strokeStyle = 'rgba(156,138,105,0.35)';
    ctx.lineWidth = 1.5;
    for (let y = top + 30; y < GROUND; y += 28) {
      ctx.beginPath(); ctx.moveTo(cx - 80, y); ctx.lineTo(cx + 80, y); ctx.stroke();
    }
    // roof
    ctx.beginPath();
    ctx.moveTo(cx - 96, top + 4); ctx.lineTo(cx, 6); ctx.lineTo(cx + 96, top + 4);
    ctx.closePath();
    ctx.fillStyle = '#4f6d8f';
    ctx.fill();
    ctx.strokeStyle = '#2f4560';
    ctx.lineWidth = 2;
    ctx.stroke();
    // door
    ctx.fillStyle = '#6b4526';
    ctx.beginPath();
    ctx.moveTo(cx - 24, GROUND); ctx.lineTo(cx - 24, GROUND - 50);
    ctx.arc(cx, GROUND - 50, 24, Math.PI, 0); ctx.lineTo(cx + 24, GROUND); ctx.fill();
    // drive rod and gearbox
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(cx - 5, 150, 10, targetG.y - 150);
    ctx.beginPath();
    ctx.arc(cx, targetG.y, 54, 0, TAU);
    ctx.fillStyle = 'rgba(70,52,30,0.5)';
    ctx.fill();
    // clock face
    const fy = 150;
    ctx.beginPath();
    ctx.arc(cx, fy, 60, 0, TAU);
    ctx.fillStyle = '#c99a4a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, fy, 52, 0, TAU);
    ctx.fillStyle = '#fffdf6';
    ctx.fill();
    ctx.strokeStyle = '#3b2f22';
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12;
      ctx.lineWidth = i % 3 === 0 ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.sin(a) * 42, fy - Math.cos(a) * 42);
      ctx.lineTo(cx + Math.sin(a) * 48, fy - Math.cos(a) * 48);
      ctx.stroke();
    }
    // hands: angle 0 points at 12, positive = clockwise
    const minute = targetG.angle * 0.8;
    const hour = minute / 12 + 2.2;
    hand(cx, fy, hour, 26, 6, '#3b2f22');
    hand(cx, fy, minute, 40, 4, '#3b2f22');
    ctx.beginPath();
    ctx.arc(cx, fy, 5, 0, TAU);
    ctx.fillStyle = '#c0392b';
    ctx.fill();
    // direction arrow hint
    ctx.strokeStyle = 'rgba(47,158,85,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, fy, 70, -1.9, -1.0);
    ctx.stroke();
    const ax = cx + Math.cos(-1.0) * 70, ay = fy + Math.sin(-1.0) * 70;
    ctx.fillStyle = 'rgba(47,158,85,0.8)';
    ctx.beginPath();
    ctx.moveTo(ax + 7, ay - 4); ctx.lineTo(ax - 6, ay - 6); ctx.lineTo(ax + 2, ay + 8);
    ctx.closePath();
    ctx.fill();
  }

  function hand(x, y, a, len, w, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 8); ctx.lineTo(0, -len);
    ctx.stroke();
    ctx.restore();
  }

  // Direction arrows on spinning gears
  function drawSpinArrow(g, speed) {
    const dir = Math.sign(speed);
    const rr = g.r + 14;
    const a0 = -Math.PI / 2 - 0.5 * dir, a1 = -Math.PI / 2 + 0.5 * dir;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.x, g.y, rr, Math.min(a0, a1), Math.max(a0, a1));
    ctx.stroke();
    const ax = g.x + Math.cos(a1) * rr, ay = g.y + Math.sin(a1) * rr;
    ctx.translate(ax, ay);
    ctx.rotate(a1 + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPegs(t) {
    const occupied = new Set(placed.map((g) => g.peg));
    const highlight = selectedType || (drag && drag.moved);
    level.pegs.forEach(([x, y], i) => {
      if (occupied.has(i)) return;
      if (highlight) {
        ctx.beginPath();
        ctx.arc(x, y, 16 + Math.sin(t * 5) * 3, 0, TAU);
        ctx.strokeStyle = 'rgba(184,134,59,0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, TAU);
      ctx.fillStyle = 'rgba(60,45,25,0.35)';
      ctx.fill();
      drawBolt(ctx, x, y, 6);
    });
  }

  function styleOf(g) {
    if (g === motorG) return MOTOR_STYLE;
    if (g === targetG) return TARGET_STYLE;
    return GEAR_TYPES[g.type];
  }

  function drawGears(t) {
    netGears.forEach((g, i) => {
      let x = g.x, y = g.y, outline = null;
      const inJam = net.jammed && net.connected[i];
      if (inJam) {
        x += Math.sin(t * 70 + i) * 1.5;
        y += Math.cos(t * 63 + i) * 1.5;
      }
      if (net.overlap[i]) outline = '#d64545';
      else if (state === 'wrongdir' && i === 1) outline = '#d64545';
      else if (state === 'win' && i === 1) outline = '#2f9e55';
      drawGear(ctx, x, y, styleOf(g), g.angle, { outline });
    });
    if (!net.jammed) {
      netGears.forEach((g, i) => { if (net.connected[i] && (i === 0 || i === 1)) drawSpinArrow(g, net.speed[i]); });
    }
  }

  function drawDragGhost() {
    if (!drag || !drag.moved || !drag.pos || !drag.pos.inside) return;
    const t = GEAR_TYPES[drag.type];
    const peg = nearestPeg(drag.pos);
    if (peg >= 0) {
      const [x, y] = level.pegs[peg];
      // preview: would it mesh or collide?
      const others = netGears.filter((g) => !(g.peg === peg && g !== motorG && g !== targetG));
      let collide = false, mesh = false;
      for (const g of others) {
        const d = Math.hypot(g.x - x, g.y - y), s = g.r + t.r;
        if (d < s - MESH_TOL) collide = true;
        else if (d <= s + MESH_TOL) mesh = true;
      }
      drawGear(ctx, x, y, t, 0, { alpha: 0.6, outline: collide ? '#d64545' : mesh ? '#2f9e55' : '#b8863b' });
    } else {
      drawGear(ctx, drag.pos.x, drag.pos.y, t, 0, { alpha: 0.6 });
    }
  }

  function drawParticles(dt) {
    particles = particles.filter((p) => (p.life -= dt) > 0);
    for (const p of particles) {
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 6;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
  }

  function draw(t, dt) {
    drawBackground(t);
    if (level.machine === 'windmill') drawWindmillBack();
    if (level.machine === 'oilrig') drawOilRigBack();
    if (level.machine === 'clock') drawClockBack();
    drawMotor(t);
    if (level.machine === 'windmill') drawWindmillBlades();
    drawPegs(t);
    drawGears(t);
    if (level.machine === 'oilrig') drawOilRigFront();
    drawDragGhost();
    drawParticles(dt);
  }

  // ---------- Canvas sizing + loop ----------
  let scale = 1;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scale = canvas.width / W;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateAngles(dt);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    draw(now / 1000, dt);
    requestAnimationFrame(frame);
  }

  loadLevel(Math.min(progress.unlocked, LEVELS.length) - 1);
  requestAnimationFrame(frame);
})();
