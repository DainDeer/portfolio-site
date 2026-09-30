// Slice 4 §A: tutorial state + "which step is due" (no DOM; the overlay is js/tutorialview.js). Data: data/tutorial.js.
// Save: state.tut = { mode: null | "full" | "tips" | "none" (Marta's choice), steps: { stepId: 1 } (one-time flags),
// talked (spoke to Marta), notDead (her "you're not dead" line was used) }. Wiped with everything else on a new build.
(function (root) {
  const G = root.G;
  const T = G.Tut = {};
  const D = () => DATA.tutorial;
  T.fresh = () => ({ mode: null, steps: {}, talked: false, notDead: false });
  T.st = function () { const s = G.state; if (!s.tut) s.tut = T.fresh(); s.tut.steps = s.tut.steps || {}; return s.tut; };
  T.on = () => !!(D() && D().enabled);
  T.mode = () => T.st().mode;
  T.setMode = function (m) { const st = T.st(); st.mode = m; st.talked = true; };
  // Settings > Gameplay "Replay tutorial": re-arm every step (mode "none" becomes "full", or nothing would show)
  T.replay = function () { const st = T.st(); st.steps = {}; if (!st.mode || st.mode === "none") st.mode = "full"; st.talked = true; };
  T.done = (id) => !!T.st().steps[id];
  T.mark = (id) => { T.st().steps[id] = 1; };
  T.needsMarta = () => !T.st().talked;        // her "!" and the trapdoor intercept
  T.bang = (npc) => npc === "marta" && T.needsMarta();
  // named conditions for `when` (sequence or step). ctx: { touch }
  T.conds = {
    tutorialRun: () => !G.state.tutorialDone,
    extractCheck: () => { const r = G.state.run; if (!r || !G.Exp) return false; const ex = G.Exp.extractionDef(G.Exp.node()); return !!ex && ex.type === "check"; }
  };
  T.cond = (name, ctx) => !name || (T.conds[name] ? !!T.conds[name](ctx || {}) : false);
  T.sel = (step, touch) => (touch && step.targetTouch) || step.target || null;
  T.fallback = (step, touch) => (touch && step.fallbackTouch) || step.fallback || null;   // phones: fallbackTouch instead of fallback
  // text tokens: {key:X} -> "X" on desktop, dropped with its brackets on phones; {click} / {clicking}
  T.text = function (step, touch) {
    let t = touch && step.textTouch ? step.textTouch : step.text || "";
    t = t.replace(/\s*\(\{key:([^}]+)\}\)/g, (m, k) => (touch ? "" : ` (${k})`)).replace(/\{key:([^}]+)\}/g, (m, k) => (touch ? "" : k));
    return t.replace(/\{click\}/g, touch ? "Tap" : "Click").replace(/\{clicking\}/g, touch ? "tapping" : "clicking");
  };
  // Steps of a sequence that can show now. ctx: { touch, has(selector) -> bool } (the overlay passes the real DOM)
  T.stepsNow = function (seq, ctx) {
    return seq.steps.filter((s) => !T.done(s.id) && T.cond(s.when, ctx) && !(s.skipIfMissing && !(ctx.has && ctx.has(T.sel(s, ctx.touch), T.fallback(s, ctx.touch)))));
  };
  // First due sequence for any of the triggers (in data order): { id, seq, steps } or null
  T.due = function (triggers, ctx) {
    if (!T.on() || !G.state) return null;
    const mode = T.mode(); if (!mode || mode === "none") return null;
    ctx = ctx || {}; triggers = [].concat(triggers || []);
    const S = D().sequences;
    for (const id in S) {
      const seq = S[id];
      if (!triggers.includes(seq.trigger) || !(seq.modes || []).includes(mode) || !T.cond(seq.when, ctx)) continue;
      const steps = T.stepsNow(seq, ctx);
      if (steps.length) return { id, seq, steps };
    }
    return null;
  };
  // "I've got this" + a successful extraction: Marta's one-off line (once per save)
  T.onExtracted = function () {
    const st = T.st(); if (st.mode !== "none" || st.notDead) return null;
    st.notDead = true; return D().marta.notDeadLine;
  };
})(typeof window !== "undefined" ? window : globalThis);
