// Boot only after the entry gate has loaded code and the player has continued.
(function () {
  const G = window.G;
  let prepared = false, running = false, inFlight = null;
  G.start = function () {
    if (running) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = start().finally(() => { inFlight = null; }); return inFlight;
  };
  async function start() {
    const req = G.Scenario.request(location);
    if (!prepared) {
      if (req) {
        G.State.sandbox = { pending: true };
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), (window.Entry && Entry.timeoutMs) || 12000);
        try { const p = await G.Scenario.resolve(req, controller.signal); G.Scenario.enter(p, req); }
        catch (e) { G.ScenarioView.fail(e); return; }
        finally { clearTimeout(timer); }
      }
      G.State.checkBuild();
      G.Debug.overrides = G.State.loadOverrides();
      if (!G.State.sandbox && !G.State.load()) G.State.newGame();
      prepared = true;
    }
    running = true;
    G.logListeners.push(() => {});
    if (G.Title && G.Title.shouldShow() && !G.State.sandbox) G.Title.show();
    G.UI.render();
    if (window.Entry && Entry.audioContext && G.Sfx) G.Sfx.resume();
    if (G.Title && G.Title.open) G.Title.syncSound();
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
    window.addEventListener("keydown", (e) => { if (G.Util.typing(e)) return; if (e.key === "Escape" && !G.state.run && G.UI.panel && !document.querySelector(".modal")) { G.UI.openPanel(null); } });
    if (req) { G.ScenarioView.mount(); G.UI.toast("Sandbox: nothing you do here touches your own save. Exit sandbox brings it back."); }
    window.addEventListener("hashchange", () => { if (location.hash.indexOf("#s=") === 0) location.reload(); });
  }
})();
