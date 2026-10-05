// Automatic bootstrap: visible progress and retry; only required code, then title-owned media.
// Megan: the animated camp comes up first, and the loading bar sits over it while the rest of the game loads.
(function () {
  if (typeof document === "undefined") return;
  clearTimeout(window.entryWatchdog);
  const $ = (id) => document.getElementById(id);
  const gate = $("entry"), retry = $("entry-retry"), status = $("entry-status"), progress = $("entry-progress");
  const resources = $("game-resources").content, scripts = [...resources.querySelectorAll("script[src]")].map((s) => s.getAttribute("src"));
  const styles = [...resources.querySelectorAll("link[rel=stylesheet]")].map((s) => s.getAttribute("href"));
  const texts = new Map(), inflight = new Map(), ran = new Set(); let busy = false, executed = false, started = false, fatal = false;
  const ASSETS = "assets/";   // DATA.sprites.basePath (tests/entry.js keeps them equal); data/sprites.js loads later
  const E = window.Entry = { phase: "landing", timeoutMs: 12000, bootCount: 0 };
  E.url = (path) => { const u = new URL(path, document.baseURI); if (u.origin === location.origin && /^https?:$/.test(u.protocol) && window.BUILD_ID && window.BUILD_ID !== "dev") u.searchParams.set("v", window.BUILD_ID); return u.href; };
  function note(text) { status.textContent = text; }
  function showError(error, action) { E.phase = "error"; note(error.message || String(error)); retry.hidden = false; retry.onclick = action; progress.hidden = true; }
  // one download per file, shared by the camp and the main loader
  function fetchText(path, versioned = true) {
    if (texts.has(path)) return Promise.resolve(texts.get(path));
    if (!inflight.has(path)) inflight.set(path, download(path, versioned).finally(() => inflight.delete(path)));
    return inflight.get(path);
  }
  async function download(path, versioned) {
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
    if (ran.has(path)) return;   // the camp's own code already ran
    let error = null; const onError = (e) => { error = e.error || Error(e.message); };
    window.addEventListener("error", onError);
    const s = document.createElement("script"); s.textContent = texts.get(path) + "\n//# sourceURL=" + E.url(path); document.head.appendChild(s); s.remove();
    window.removeEventListener("error", onError);
    if (error) throw Error("The game could not start (" + path + "). Reload and try again.");
    ran.add(path);
  }
  // The camp: only its own code runs early (the G namespace, the title tuning, the renderer: no game state, no saves).
  // The title adopts this canvas when it opens (js/title.js), so the scene never restarts.
  async function backdrop() {
    const q = location.search, parts = ["js/core.js", "data/title.js", "js/titlescene.js"].map((p) => scripts.find((s) => s.split("?")[0] === p));
    if (parts.includes(undefined) || /[?&](notitle|scenario)\b/.test(q) || location.hash.startsWith("#s=") || (navigator.webdriver && !/[?&]title\b/.test(q))) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;   // the title shows its still
    await Promise.all(parts.map((p) => fetchText(p)));
    if (executed) return;
    for (const p of parts) execute(p);
    const S = DATA.title.scene;
    if (DATA.title.enabled === false || !S.webgl) return;
    const json = JSON.parse(await fetchText(ASSETS + S.file));
    if (started || (G.Title && G.Title.open)) return;   // the title got there first, with its own scene
    const TS = G.TitleScene, cv = document.createElement("canvas"); cv.className = "title-gl"; TS.fit(cv);
    const B = E.backdrop = { canvas: cv, resize: () => TS.fit(cv), onError: () => { TS.stop(); cv.remove(); window.removeEventListener("resize", B.resize); if (E.backdrop === B) E.backdrop = null; } };
    $("entry-backdrop").appendChild(cv);
    if (!TS.start(cv, json, { fps: TS.fps(), onError: (e) => B.onError(e) })) return B.onError();
    window.addEventListener("resize", B.resize);
    cv.getBoundingClientRect(); cv.classList.add("on");   // commit opacity 0 first, so it fades in (no frame callback: those pause in hidden tabs)
  }
  async function prepare() {
    retry.hidden = true;
    try {
      // The identity script also defines the namespace of separately hosted playable builds.
      const build = scripts.find((s) => /^js\/build_id\.js(?:\?|$)/.test(s));
      await fetchText(build, false); execute(build);
      // the camp first; capped, so a slow or broken scene never holds the game back
      await Promise.race([backdrop().catch(() => {}), new Promise((r) => setTimeout(r, 4000))]);
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
      if (E.backdrop) E.backdrop.onError();   // no title opened (a scenario, ?notitle): no camp behind the game
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
