// Automatic bootstrap: visible progress and retry; only required code, then title-owned media.
(function () {
  if (typeof document === "undefined") return;
  clearTimeout(window.entryWatchdog);
  const $ = (id) => document.getElementById(id);
  const gate = $("entry"), retry = $("entry-retry"), status = $("entry-status"), progress = $("entry-progress");
  const resources = $("game-resources").content, scripts = [...resources.querySelectorAll("script[src]")].map((s) => s.getAttribute("src"));
  const styles = [...resources.querySelectorAll("link[rel=stylesheet]")].map((s) => s.getAttribute("href"));
  const texts = new Map(); let busy = false, executed = false, started = false, fatal = false;
  const E = window.Entry = { phase: "landing", timeoutMs: 12000, bootCount: 0 };
  E.url = (path) => { const u = new URL(path, document.baseURI); if (u.origin === location.origin && /^https?:$/.test(u.protocol) && window.BUILD_ID && window.BUILD_ID !== "dev") u.searchParams.set("v", window.BUILD_ID); return u.href; };
  function note(text) { status.textContent = text; }
  function showError(error, action) { E.phase = "error"; note(error.message || String(error)); retry.hidden = false; retry.onclick = action; progress.hidden = true; }
  async function fetchText(path, versioned = true) {
    if (texts.has(path)) return texts.get(path);
    const c = new AbortController(), timer = setTimeout(() => c.abort(), E.timeoutMs);
    try {
      const r = await fetch(versioned ? E.url(path) : new URL(path, document.baseURI), { signal: c.signal });
      if (!r.ok) throw Error("HTTP " + r.status);
      const text = await r.text();
      if (/^\s*</.test(text)) throw Error("unexpected page instead of code");
      texts.set(path, text); return text;
    } catch (e) { throw Error("Could not load " + path + (e.name === "AbortError" ? " (connection timed out)." : ".") + " Check your connection and retry."); }
    finally { clearTimeout(timer); }
  }
  function execute(path) {
    let error = null; const onError = (e) => { error = e.error || Error(e.message); };
    window.addEventListener("error", onError);
    const s = document.createElement("script"); s.textContent = texts.get(path) + "\n//# sourceURL=" + E.url(path); document.head.appendChild(s); s.remove();
    window.removeEventListener("error", onError);
    if (error) throw Error("The game could not start (" + path + "). Reload and try again.");
  }
  async function prepare() {
    retry.hidden = true;
    try {
      // The identity script also defines the namespace of separately hosted playable builds.
      const build = scripts.find((s) => /^js\/build_id\.js(?:\?|$)/.test(s));
      await fetchText(build, false); execute(build);
      await enter();
    } catch (e) { showError(e, prepare); }
  }
  async function loadCode() {
    const files = [...styles, ...scripts.filter((s) => !/^js\/build_id\.js(?:\?|$)/.test(s))];
    progress.hidden = false; progress.max = files.length;
    let index = 0, failure = null;
    const update = () => { const done = files.filter((p) => texts.has(p)).length; progress.value = done; note("Loading game: " + done + " / " + files.length + " files"); };
    update();
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (index < files.length && !failure) { const path = files[index++]; try { await fetchText(path); update(); } catch (e) { failure = e; } }
    }));
    if (failure) throw failure; // nothing executes until every required file has arrived
    if (executed) return;
    for (const path of styles) {
      const s = document.createElement("style"); s.dataset.gameStyle = path;
      s.textContent = texts.get(path).replace(/url\(([^)]+)\)/g, (_, value) => {
        const url = value.trim().replace(/^["']|["']$/g, ""); return "url(" + JSON.stringify(E.url(new URL(url, new URL(path, document.baseURI)).href)) + ")";
      }); document.head.appendChild(s);
    }
    try { for (const path of files.filter((s) => s.endsWith(".js"))) execute(path); executed = true; }
    catch (e) { fatal = true; throw e; }
  }
  async function enter() {
    if (busy || E.phase === "playing") return;
    busy = true; E.phase = "loading"; retry.hidden = true;
    try {
      await loadCode();
      if (!started) {
        try { await G.start(); } catch (e) { fatal = true; throw Error("The game could not start. Reload and try again."); }
        started = true; E.bootCount++; $("app").hidden = false;
      }
      // Cosmetic art is asynchronous and never covers usable title/game controls with a loading gate.
      $("app").removeAttribute("inert"); gate.remove(); E.phase = "playing"; document.body.classList.remove("entry-open");
    } catch (e) {
      showError(e, fatal ? () => location.reload() : enter);
    } finally { busy = false; }
  }
  E.enter = enter;
  // A frozen in-flight page must re-enter from a clean document when restored from the back/forward cache.
  window.addEventListener("pageshow", (event) => { if (event.persisted && E.phase !== "playing") location.reload(); });
  document.body.classList.add("entry-open"); prepare();
})();
