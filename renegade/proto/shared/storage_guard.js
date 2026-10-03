// Prototype pages: only renegade_proto_* localStorage keys may ever be written. The game's own keys (its save, settings,
// build id) share this origin on the live site, so anything else is refused and logged. Load this before anything else.
(function () {
  try {
    const S = window.Storage && window.Storage.prototype, set = S.setItem, rem = S.removeItem;
    const ok = (k) => String(k).indexOf("renegade_proto_") === 0;
    window.PROTO_STORAGE_REFUSED = [];
    S.setItem = function (k, v) { if (!ok(k)) { window.PROTO_STORAGE_REFUSED.push(String(k)); console.warn("[proto] refused storage write:", k); return; } return set.call(this, k, v); };
    S.removeItem = function (k) { if (!ok(k)) { window.PROTO_STORAGE_REFUSED.push(String(k)); console.warn("[proto] refused storage remove:", k); return; } return rem.call(this, k); };
    S.clear = function () { window.PROTO_STORAGE_REFUSED.push("(clear)"); console.warn("[proto] refused storage clear"); };
  } catch (e) { /* no storage: nothing to guard */ }
})();
