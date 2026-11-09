// Level data. Board is 960 x 560. Pegs are where gears can be placed.
// `needed` is the hint: how many of each gear the solution uses.
(function () {
  const LEVELS = [
    {
      id: 1,
      name: 'The Windmill',
      machine: 'windmill',
      objective: 'Connect the motor to the windmill gear so the blades turn.',
      winText: 'The windmill is turning!',
      motor: { x: 300, y: 460 },
      target: { x: 609, y: 343 },
      pegs: [[405, 460], [459, 388], [519, 343]],
      inventory: { red: 1, yellow: 1, blue: 1, green: 0 },
      needed: { red: 1, yellow: 1, blue: 1, green: 0 },
      hintVisible: true,
      requireDir: 0,
    },
    {
      id: 2,
      name: 'The Oil Rig',
      machine: 'oilrig',
      objective: 'Power the pump jack to start pumping oil.',
      winText: 'Oil is flowing!',
      motor: { x: 120, y: 260 },
      target: { x: 597, y: 359 },
      pegs: [[216, 332], [321, 332], [375, 260], [465, 260], [525, 305], [300, 190], [450, 420]],
      inventory: { red: 2, yellow: 1, blue: 1, green: 1 },
      needed: { red: 2, yellow: 1, blue: 1, green: 1 },
      hintVisible: true,
      requireDir: 0,
    },
    {
      id: 3,
      name: 'The Clock Tower',
      machine: 'clock',
      objective: 'Start the clock. It must run clockwise!',
      winText: 'Tick tock, right on time!',
      motor: { x: 240, y: 330 },
      target: { x: 576, y: 330 },
      pegs: [[333, 254.21], [483, 254.21], [303, 414], [408, 414], [513, 414], [408, 150], [170, 460]],
      inventory: { red: 2, yellow: 2, blue: 2, green: 2 },
      needed: { red: 0, yellow: 1, blue: 2, green: 0 },
      hintVisible: false,
      requireDir: 1,
    },
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
  else window.LEVELS = LEVELS;
})();
