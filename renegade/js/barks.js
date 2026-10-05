// SP-010: overhead barks in battle (data: data/barks.js). The sim only reports events (b.fx { t: "bark", i, ev });
// each view keeps a bark state, hands it those events, ticks it in real time and draws Bk.list(st) over the heads.
// Picks use the state's own rng (never b.rng), so a fight plays out the same with or without barks. No DOM.
(function (root) {
  const G = root.G;
  const Bk = G.Barks = {};
  const D = () => DATA.barks;
  Bk.on = () => !!(D() && D().enabled);
  // st = { now (real s), by: Map(unit -> { text, until }), last: Map(unit -> when it last spoke), low: Set (said "low") }
  Bk.state = (rnd) => ({ now: 0, by: new Map(), last: new Map(), low: new Set(), rnd: rnd || Math.random });
  const alive = (u) => u && u.state === "alive";
  // which voice a unit speaks with: your squad / a pet, or its enemy family (missing lines fall back to outlaws)
  Bk.voice = (u) => (u.side === 0 && !u.rival ? (u.ref && u.ref.grunt && u.ref.grunt.tplKey === "pet" ? "pet" : "squad") : u.family || "outlaws");
  Bk.lines = function (u, ev) {
    const L = D().lines, v = Bk.voice(u), own = L[v] && L[v][ev];
    if (own) return own;
    return v === "squad" || v === "pet" || v === "beasts" || v === "machines" ? null : (L.outlaws[ev] || null);   // a pet or a beast doesn't shout "Reloading!"
  };
  // a sim event: maybe a line. Returns the text said (or null)
  Bk.event = function (st, b, e) {
    if (!Bk.on() || b.phase === "place") return null;   // the fight's last kill still gets its line
    const C = D(), who = b.units[e.i]; if (!who) return null;
    let ev = e.ev;
    if (ev === "hurt") {   // a hit: the first drop under the "low" line says that instead; small hits say nothing
      if (C.events.low && e.hp < C.events.low.belowPct && !st.low.has(who)) ev = "low";
      else if (e.pct < (C.events.hurt.minPct || 0)) return null;
    }
    const E = C.events[ev]; if (!E) return null;
    let u = who;
    if (E.speaker === "ally") { const pool = b.units.filter((o) => o !== who && o.side === who.side && alive(o) && !st.by.has(o)); if (!pool.length) return null; u = pool[Math.floor(st.rnd() * pool.length)]; }
    if (!alive(u)) return null;
    if (ev === "low") st.low.add(u);   // once per unit per fight, said or not
    const last = st.last.get(u); if (last != null && st.now - last < C.unitCooldownSec) return null;
    if (!E.priority && Bk.list(st).length >= C.maxOnScreen) return null;
    if (st.rnd() >= E.chance) return null;
    const lines = Bk.lines(u, ev); if (!lines || !lines.length) return null;
    const text = lines[Math.floor(st.rnd() * lines.length)];
    st.by.set(u, { text, until: st.now + C.holdSec }); st.last.set(u, st.now);
    return text;
  };
  // real time passes (rdt s); a unit that dies or flees stops talking
  Bk.tick = function (st, rdt) {
    st.now += rdt;
    for (const [u, x] of st.by) if (x.until <= st.now || u.state === "dead" || u.state === "fled") st.by.delete(u);
  };
  Bk.list = (st) => [...st.by.entries()].filter(([, x]) => x.until > st.now).map(([u, x]) => ({ u, text: x.text, left: x.until - st.now }));
  // drawing (both views): yellow text, a black drop shadow (the RuneScape look), fading out over its last 0.3 s.
  // size: canvas px; phones pass at least DATA.config.battle.phoneFloatPx.word css px worth
  Bk.draw = function (ctx, text, x, y, size, left) {
    const sh = Math.max(1, Math.round(size / 12));
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, left / 0.3));
    ctx.font = "bold " + size + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#000"; ctx.fillText(text, x + sh, y + sh);
    ctx.fillStyle = D().color; ctx.fillText(text, x, y);
    ctx.restore();
  };
})(typeof window !== "undefined" ? window : globalThis);
