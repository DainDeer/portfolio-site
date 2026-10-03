// Boot: apply tuning overrides, load or create save, render, tick timers.
(function () {
  const G = window.G;
  // SP-096: ?scenario=<id> (scenarios/<id>.json) or #s=<code> opens a SANDBOX. St.sandbox is set before anything touches
  // storage, so checkBuild / load / save only ever see renegade_sandbox_* keys; nothing is written if the link fails.
  // The normal boot (no scenario in the URL) stays synchronous and unchanged.
  const req = G.Scenario.request(location);
  if (req) {
    G.State.sandbox = { pending: true };
    G.Scenario.resolve(req).then((p) => {
      G.Scenario.enter(p, req);
      try { boot(); } catch (e) { G.Scenario.exit(); throw e; }
      G.ScenarioView.mount();
      G.UI.toast("Sandbox: nothing you do here touches your own save. Exit sandbox brings it back.");
    }).catch((e) => G.ScenarioView.fail(e));
  } else boot();
  // a pasted #s= link in the same tab only changes the hash: reload so it opens
  window.addEventListener("hashchange", () => { if (location.hash.indexOf("#s=") === 0) location.reload(); });

  function boot() {
  G.State.checkBuild();   // before anything reads localStorage: a new build wipes progression (config.save.resetOnNewBuild). A sandbox skips it
  G.Debug.overrides = G.State.loadOverrides();
  if (!G.State.sandbox && !G.State.load()) G.State.newGame();   // a sandbox already has its state (G.Scenario.enter)
  G.logListeners.push(() => {});
  G.Sprites.preload(); // corpses/decals are stamped once onto the battle ground, so their art must be loaded before the first kill
  if (G.Title && G.Title.shouldShow() && !G.State.sandbox) G.Title.show();   // Slice 4 §G: the title / login screen over the game (not over a scenario)
  G.UI.render();
  if (G.State.buildNotice) G.UI.toast(G.State.buildNotice);
  setInterval(() => G.UI.tick(), DATA.config.timers.tickMs);
  // re-render the map when real art arrives so placeholders get replaced. An open outpost panel (e.g. the deploy panel,
  // whose grunt art lands ~300 ms after it opens) keeps its scroll position across this re-render: the new .panel-body
  // would otherwise start back at the top under the player's finger
  let pending = false;
  const panelScroll = () => { const b = document.querySelector(".town-panel > .panel-body"); return b ? { key: b.parentElement.dataset.panel, top: b.scrollTop, left: b.scrollLeft } : null; };
  G.Sprites.listeners.push(() => { if (pending) return; pending = true; setTimeout(() => { pending = false; if (!G.UI.battle && !document.querySelector(".modal") && (document.querySelector(".map-wrap") || document.querySelector(".site-wrap") || document.querySelector(".town-stage")) && !G.UI.search) {
    const was = panelScroll(); G.UI.render();
    const b = was && document.querySelector(".town-panel > .panel-body"); if (b && b.parentElement.dataset.panel === was.key) { b.scrollTop = was.top; b.scrollLeft = was.left; }
  } }, 300); });
  window.addEventListener("beforeunload", () => G.State.save());
  // Esc closes an outpost panel (back to the town view)
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !G.state.run && G.UI.panel && !document.querySelector(".modal")) { G.UI.openPanel(null); } });
  }
})();
