// Screen/encounter media loading. Successful files are reused; failures have an explicit retry path.
(function (root) {
  const G = root.G; if (!G || typeof document === "undefined") return;
  const jobs = new Map(), retries = new Map(), dom = new Map(), failedDom = new Set();
  const A = G.Assets = { timeoutMs: 12000 };
  A.url = (path) => {
    const u = new URL(path, document.baseURI);
    if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return u.href;
    if (root.BUILD_ID && root.BUILD_ID !== "dev") u.searchParams.set("v", root.BUILD_ID);
    const retry = retries.get(u.pathname); if (retry) u.searchParams.set("retry", retry);
    return u.href;
  };
  A.image = function (path) {
    const url = A.url(path); if (jobs.has(url)) return jobs.get(url).promise;
    const job = { state: "pending", url, start: Date.now() }; jobs.set(url, job);
    job.promise = new Promise((resolve, reject) => {
      const img = new Image(); job.img = img;
      const finish = (ok) => { if (job.state !== "pending") return; clearTimeout(timer); job.state = ok ? "ready" : "failed";
        if (ok) resolve(img); else reject(Error("Image unavailable: " + path)); };
      const timer = setTimeout(() => finish(false), A.timeoutMs);
      img.onload = () => finish(true); img.onerror = () => finish(false); img.src = url;
    });
    return job.promise;
  };
  // Town fallbacks remove broken <img>s; retain their failure so Retry can rebuild the screen.
  document.addEventListener("error", (e) => { if (e.target instanceof HTMLImageElement && e.target.src) failedDom.add(e.target.src); }, true);
  document.addEventListener("load", (e) => { if (e.target instanceof HTMLImageElement) failedDom.delete(e.target.src); }, true);
  A.stats = function () {
    for (const el of document.images) {
      if (!el.src || el.src.startsWith("data:")) continue;
      let j = dom.get(el); if (!j || j.url !== el.src) { j = { url: el.src, start: Date.now() }; dom.set(el, j); }
      j.state = el.complete ? (el.naturalWidth ? "ready" : "failed") : Date.now() - j.start >= A.timeoutMs ? "failed" : "pending";
    }
    for (const el of dom.keys()) if (!el.isConnected) dom.delete(el);
    const s = { ready: 0, pending: 0, failed: failedDom.size };
    for (const j of [...jobs.values(), ...dom.values()]) s[j.state]++;
    return s;
  };
  A.retry = function () {
    for (const url of failedDom) { const p = new URL(url).pathname; retries.set(p, (retries.get(p) || 0) + 1); } failedDom.clear();
    for (const [url, job] of jobs) if (job.state === "failed") { const p = new URL(url).pathname; retries.set(p, (retries.get(p) || 0) + 1); jobs.delete(url); }
    for (const [el, j] of dom) if (j.state === "failed") { const p = new URL(j.url).pathname; retries.set(p, (retries.get(p) || 0) + 1); el.src = A.url(j.url); dom.delete(el); }
    if (G.Sprites) for (const key of Object.keys(G.Sprites.cache)) if (G.Sprites.cache[key].failed) { delete G.Sprites.cache[key]; G.Sprites.get(key); }
    if (G.GruntLook && G.GruntLook.retry) G.GruntLook.retry();
    if (G.Title && G.Title.open) { G.Title.close(); G.Title.show(); }
    if (G.state && G.UI && !G.UI.battle) G.UI.render();
  };
  A.settle = async function (progress) {
    let quiet = 0;
    while (true) { const s = A.stats(); if (progress) progress(s);
      if (!s.pending) { if (++quiet >= 3) return s; } else quiet = 0;
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  const notice = document.createElement("div"); notice.id = "asset-notice"; notice.setAttribute("role", "status"); document.body.appendChild(notice);
  let lastNotice = "";
  setInterval(() => {
    if (root.Entry && root.Entry.phase !== "playing") return;
    const s = A.stats(), key = s.failed + ":" + s.pending; if (key === lastNotice) return; lastNotice = key; notice.replaceChildren();
    if (s.failed) { notice.append(document.createTextNode("Some artwork is missing.")); const b = document.createElement("button"); b.textContent = "Retry art"; b.onclick = A.retry; notice.appendChild(b); }
    else if (s.pending) notice.textContent = "Loading artwork: " + s.pending + " remaining…";
  }, 500);
})(typeof window !== "undefined" ? window : globalThis);
