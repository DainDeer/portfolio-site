// Boot: apply tuning overrides, load or create save, render, tick timers.
(function () {
  const G = window.G;
  G.State.checkBuild();   // before anything reads localStorage: a new build wipes progression (config.save.resetOnNewBuild)
  G.Debug.overrides = G.State.loadOverrides();
  if (!G.State.load()) G.State.newGame();
  G.logListeners.push(() => {});
  G.Sprites.preload(); // corpses/decals are stamped once onto the battle ground, so their art must be loaded before the first kill
  if (G.Title && G.Title.shouldShow()) G.Title.show();   // Slice 4 §G: the title / login screen over the game
  G.UI.render();
  if (G.State.buildNotice) G.UI.toast(G.State.buildNotice);
  setInterval(() => G.UI.tick(), DATA.config.timers.tickMs);
  // re-render the map when real art arrives so placeholders get replaced
  let pending = false;
  G.Sprites.listeners.push(() => { if (pending) return; pending = true; setTimeout(() => { pending = false; if (!G.UI.battle && !document.querySelector(".modal") && (document.querySelector(".map-wrap") || document.querySelector(".site-wrap") || document.querySelector(".town-stage")) && !G.UI.search) G.UI.render(); }, 300); });
  window.addEventListener("beforeunload", () => G.State.save());
  // Esc closes an outpost panel (back to the town view)
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !G.state.run && G.UI.panel && !document.querySelector(".modal")) { G.UI.openPanel(null); } });
})();
