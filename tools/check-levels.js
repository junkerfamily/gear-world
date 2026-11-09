// Brute-force every way to fill each level's pegs and report the solutions.
// Run: node tools/check-levels.js
const { GEAR_TYPES, TYPE_ORDER, evaluate } = require('../engine.js');
const LEVELS = require('../levels.js');

for (const level of LEVELS) {
  const pegs = level.pegs;
  const left = { ...level.inventory };
  const choice = new Array(pegs.length).fill(null);
  const results = { win: [], wrongdir: 0, jammed: 0, disconnected: 0 };

  function rec(i) {
    if (i === pegs.length) {
      const gears = [
        { x: level.motor.x, y: level.motor.y, r: 45 },
        { x: level.target.x, y: level.target.y, r: 45 },
      ];
      choice.forEach((t, k) => t && gears.push({ x: pegs[k][0], y: pegs[k][1], r: GEAR_TYPES[t].r }));
      const { state } = evaluate(level, gears);
      if (state === 'win') results.win.push(choice.map((t) => t || '-').join(' '));
      else results[state]++;
      return;
    }
    choice[i] = null;
    rec(i + 1);
    for (const t of TYPE_ORDER) {
      if (left[t] > 0) {
        left[t]--; choice[i] = t; rec(i + 1); left[t]++; choice[i] = null;
      }
    }
  }
  rec(0);

  console.log(`\nLevel ${level.id} - ${level.name}`);
  console.log(`  winning layouts: ${results.win.length}, wrong direction: ${results.wrongdir}`);
  results.win.slice(0, 12).forEach((w) => console.log('   ', w));
}
