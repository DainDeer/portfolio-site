// Optional SFX hook (audio is "later" in Slice 1). Plays assets/sfx/<key>.mp3 if present; silent otherwise.
(function (root) {
  const G = root.G;
  const SFX = G.Sfx = { enabled: false, volume: 0.5, cache: {} };
  SFX.play = function (key) {
    if (!SFX.enabled || !key) return;
    let e = SFX.cache[key];
    if (e === false) return;
    if (!e) {
      e = new Audio("assets/sfx/" + key + ".mp3");
      e.addEventListener("error", () => { SFX.cache[key] = false; });
      SFX.cache[key] = e;
    }
    try { const n = e.cloneNode(); n.volume = SFX.volume; n.play().catch(() => {}); } catch (err) {}
  };
})(window);
