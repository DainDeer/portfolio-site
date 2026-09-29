// Sprite loader: every entity references a key from DATA.sprites. Missing files -> placeholder shapes.
(function (root) {
  const G = root.G;
  const SP = G.Sprites = { cache: {}, listeners: [] };
  const reg = () => DATA.sprites;

  SP.def = function (key) {
    let d = reg()[key];
    if (!d) { // auto-register icon families (skill_*, stat_*, dmg_*) with a text badge placeholder
      const m = /^(skill|stat|dmg)_(.+)$/.exec(key);
      d = { file: "icons/" + key + ".png", shape: "badge", color: m && m[1] === "skill" ? "#556" : "#465", size: 1, text: m ? m[2].slice(0, 3).toUpperCase() : "?" };
      reg()[key] = d;
    }
    return d;
  };
  SP.get = function (key) {
    const c = SP.cache[key];
    if (c) return c.ok ? c.img : null;
    const d = SP.def(key);
    const entry = SP.cache[key] = { ok: false, img: null };
    if (reg().probeAssets === false || !d.file || typeof Image === "undefined") return null;
    if ((reg().pendingArt || []).some((p) => key.startsWith(p))) return null; // not delivered yet: don't request (avoids 404 noise)
    const img = new Image();
    img.onload = () => { entry.ok = true; entry.img = img; for (const f of SP.listeners) f(key); };
    img.onerror = () => { entry.ok = false; };
    img.src = reg().basePath + d.file;
    return null;
  };

  // draw centred at (x,y), size in px, rotation in rad
  SP.draw = function (ctx, key, x, y, size, rot, alpha, tint) {
    const d = SP.def(key), img = SP.get(key);
    ctx.save(); ctx.translate(x, y); if (alpha != null) ctx.globalAlpha = alpha;
    if (img) {
      const facing = /^(unit|enemy|corpse)_/.test(key);
      if (facing && reg().facingMode === "flip") { if (rot && Math.cos(rot) < -0.01) ctx.scale(-1, 1); }
      else if (rot) ctx.rotate(rot);
      ctx.imageSmoothingEnabled = !reg().pixelArt;
      ctx.drawImage(img, -size / 2, -size / 2, size, size); ctx.restore(); return;
    }
    if (rot) ctx.rotate(rot);
    const s = size * (d.size || 1) / 2, col = tint || d.color;
    ctx.fillStyle = col; ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    switch (d.shape) {
      case "square": ctx.rect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6); break;
      case "triangle": ctx.moveTo(s, 0); ctx.lineTo(-s * 0.8, -s * 0.8); ctx.lineTo(-s * 0.8, s * 0.8); ctx.closePath(); break;
      case "diamond": ctx.moveTo(s, 0); ctx.lineTo(0, -s); ctx.lineTo(-s, 0); ctx.lineTo(0, s); ctx.closePath(); break;
      case "cross": ctx.rect(-s, -s * 0.33, s * 2, s * 0.66); ctx.rect(-s * 0.33, -s, s * 0.66, s * 2); break;
      case "star": for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); break;
      case "splat": for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, rr = s * (0.55 + ((i * 37) % 10) / 22); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.restore(); return;
      case "gib": ctx.rect(-s, -s * 0.6, s * 2, s * 1.2); ctx.fill(); ctx.restore(); return;
      case "dot": ctx.arc(0, 0, Math.max(1.5, s), 0, Math.PI * 2); ctx.fill(); ctx.restore(); return;
      case "corpse": ctx.ellipse(0, 0, s * 0.95, s * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.arc(s * 0.6, 0, s * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return;
      case "bar": ctx.rect(-s, -s * 0.25, s * 2, s * 0.5); break;
      case "frame": ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.strokeRect(-s + 1.5, -s + 1.5, s * 2 - 3, s * 2 - 3); ctx.restore(); return;
      case "badge": ctx.rect(-s, -s, s * 2, s * 2); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(s * 0.8)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(d.text || "?", 0, 1); ctx.restore(); return;
      case "none": ctx.restore(); return;
      default: ctx.arc(0, 0, s, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.stroke();
    // facing notch for units so direction reads
    if (/^(unit|enemy)_/.test(key)) { ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.beginPath(); ctx.arc(s * 0.55, 0, s * 0.22, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  };

  // World-space draw for the battle canvas. Image art is drawn at native size x texelScale x imgScale (snapped to
  // whole texels so pixels stay square), anchored at its ground point. Falls back to the placeholder at fallbackSize.
  // o: { rot, alpha, tint, frame, anchor (use anchorY), facing (flip/rotate by heading), decal (quarter-turn rotation), mirror }
  SP.drawWorld = function (ctx, key, x, y, fallbackSize, o) {
    o = o || {};
    const d = SP.def(key), img = SP.get(key);
    if (!img) { SP.draw(ctx, key, x, y, fallbackSize, o.rot, o.alpha, o.tint); return { w: fallbackSize, h: fallbackSize, top: y - fallbackSize / 2 }; }
    const frames = d.frames || 1, fw = img.naturalWidth / frames, fh = img.naturalHeight;
    const t = Math.max(1, Math.round((reg().texelScale || 1) * (d.imgScale || 1) * (o.scale || 1)));
    const w = fw * t, h = fh * t, ay = o.anchor ? (d.anchorY != null ? d.anchorY : 0.5) : 0.5;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.imageSmoothingEnabled = !reg().pixelArt;
    const rot = o.rot || 0;
    if (o.facing && reg().facingMode === "flip") { if (Math.cos(rot) < -0.01) ctx.scale(-1, 1); }
    else if (o.decal && reg().decalRotation === "quarter") { ctx.rotate(Math.round(rot / (Math.PI / 2)) * (Math.PI / 2)); if (o.mirror) ctx.scale(1, -1); }
    else if (rot) ctx.rotate(rot);
    const f = Math.floor(o.frame || 0) % frames;
    ctx.drawImage(img, f * fw, 0, fw, fh, -Math.round(w / 2), -Math.round(h * ay), w, h);
    ctx.restore();
    return { w, h, top: y - h * ay };
  };

  // DOM icon: a small canvas element (re-drawn if the real image arrives later).
  // px = the size the visible art should occupy. Image art snaps to whole multiples of its native size (crisp pixels)
  // when px >= iconSnapMin x native; smaller requests downscale smoothly. Baked-in padding (def.pad, e.g. the 36x36
  // item icons with 32px art) is drawn outside the layout box via negative margins, so a padded icon lines up with
  // unpadded 32px icons and the same-size rarity frame lands exactly on top of it.
  SP.icon = function (key, px, extraClass) {
    const c = document.createElement("canvas");
    c.className = "icon " + (extraClass || ""); c.dataset.sprite = key; c.dataset.px = px;
    SP.paintIcon(c);
    return c;
  };
  SP.paintIcon = function (c) {
    const key = c.dataset.sprite, px = +c.dataset.px, d = SP.def(key), img = SP.get(key);
    if (!img) { c.width = c.height = px; c.style.margin = ""; SP.draw(c.getContext("2d"), key, px / 2, px / 2, px, 0); return; }
    const nw = img.naturalWidth / (d.frames || 1), nh = img.naturalHeight, pad = d.pad || 0, art = Math.max(nw, nh) - 2 * pad;
    let sc = px / art; const snap = sc >= (reg().iconSnapMin || 0.75);
    if (snap) sc = Math.max(1, Math.round(sc));
    c.width = Math.round(nw * sc); c.height = Math.round(nh * sc);
    c.style.margin = pad ? `-${Math.round(pad * sc)}px` : "";
    const g = c.getContext("2d"); g.clearRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = !(reg().pixelArt && snap);
    g.drawImage(img, 0, 0, nw, nh, 0, 0, c.width, c.height);
  };
  SP.listeners.push((key) => {
    if (typeof document === "undefined") return;
    document.querySelectorAll(`canvas.icon[data-sprite="${key}"]`).forEach((c) => SP.paintIcon(c));
  });
  // request every registered image up front
  SP.preload = function () { for (const k in reg()) if (reg()[k] && typeof reg()[k] === "object" && reg()[k].file) SP.get(k); };
  // pattern helper for tiled backgrounds
  SP.pattern = function (ctx, key) { const img = SP.get(key); return img ? ctx.createPattern(img, "repeat") : null; };
})(window);
