// SP-100: the fixed-step battle clock the 3D view drives the sim with. Real time is scaled exactly like the 2D view does
// (G.Abilities.timeScale: tactical pause 0, aiming 25% / 0, else the speed slider x a render slow-mo such as the kill cam),
// accumulated, and spent in whole G.Battle.step(b, 1/60) steps. So the sim always sees the same sequence of 1/60 s steps,
// whatever the frame rate, kill cams or speed changes: the fight's outcome and event log equal a plain headless
// run at 1/60 (tests/battle3d.js checks this over many seeds). No DOM: loaded headless by the tests.
(function (root) {
  const G = root.G;
  const BC = G.BattleClock = { DT: 1 / 60, MAX_STEPS: 48 };
  BC.create = () => ({ acc: 0, steps: 0 });
  // c: a clock, b: the battle, realDt: real seconds since the last frame, speed: the slider, ts: render slow-mo (1 = none).
  // onStep(b) runs after every step (the view drains b.fx there). Returns the number of steps taken.
  BC.advance = function (c, b, realDt, speed, ts, onStep) {
    const scale = G.Abilities ? G.Abilities.timeScale(b, speed, ts) : speed * (ts || 1);
    c.acc += Math.max(0, realDt) * scale;
    let n = 0;
    while (c.acc >= BC.DT - 1e-12 && !b.over) {
      G.Battle.step(b, BC.DT); c.acc -= BC.DT; c.steps++; n++;
      if (onStep) onStep(b);
      if (n >= BC.MAX_STEPS) { c.acc = 0; break; }   // a stalled tab: drop the backlog (later, never different)
    }
    if (b.over) c.acc = 0;
    return n;
  };
})(typeof window !== "undefined" ? window : globalThis);
