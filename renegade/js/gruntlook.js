// Slice 4 §F: the Grunt paper doll, drawn. Composites Smudge's layer strips (DATA.gruntLook, spec from
// G.GruntGear.look) into a runtime sprite "gl_<hash>" (stand frame) + "gl_<hash>_w" (the 2-frame walk strip), so the
// battle, the roster icons and the doll all show what a Grunt wears. Also the equip menu (UI.dollEl / UI.showDoll):
// 4 slots around the doll, the stash filtered by the chosen slot, click to equip / unequip. The body uses it too.
(function (root) {
  const G = root.G, SP = G.Sprites, GG = G.GruntGear;
  const GL = G.GruntLook = { imgs: {}, state: {} };
  const FS = () => DATA.gruntLook.frameSize;
  // Smudge's grunt_options.json: new gear entries (her real layers for an item, keyed by its base) take over the
  // stand-ins without a code change (G.GruntGear.mergeOptions). Until it has loaded, the static DATA.gruntLook parts draw.
  GL.options = (typeof fetch === "function" ? fetch(DATA.sprites.basePath + DATA.gruntLook.base + "grunt_options.json").then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null))
    .then((j) => { const added = j && GG ? GG.mergeOptions(j) : []; if (added.length && G.state && G.UI && G.UI.render) G.UI.render(); return added; });
  const load = (file) => GL.imgs[file] || (GL.imgs[file] = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = DATA.sprites.basePath + file; }));
  // headwear clipsHairAbove: per column, hair above the hat's top edge is cut
  function clipHair(hairC, hat) {
    const W = hairC.width, H = hairC.height, t = document.createElement("canvas"); t.width = W; t.height = H;
    const tg = t.getContext("2d"); tg.drawImage(hat, 0, 0); const hd = tg.getImageData(0, 0, W, H).data;
    const hg = hairC.getContext("2d"), img = hg.getImageData(0, 0, W, H), d = img.data;
    for (let x = 0; x < W; x++) { let top = -1; for (let y = 0; y < H; y++) if (hd[(y * W + x) * 4 + 3] > 0) { top = y; break; }
      if (top > 0) for (let y = 0; y < top; y++) d[(y * W + x) * 4 + 3] = 0; }
    hg.putImageData(img, 0, 0);
  }
  GL.compose = async function (spec) {
    const layers = GG.layers(spec), imgs = await Promise.all(layers.map((l) => load(l.file)));
    const n = DATA.gruntLook.frames.length, c = document.createElement("canvas"); c.width = FS() * n; c.height = FS();
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    const hatI = layers.findIndex((l) => l.layer === "headwear"), hat = hatI >= 0 ? imgs[hatI] : null;
    layers.forEach((l, i) => { const im = imgs[i]; if (!im) return;
      if (l.layer === "hair" && hat) { const t = document.createElement("canvas"); t.width = c.width; t.height = c.height; t.getContext("2d").drawImage(im, 0, 0); clipHair(t, hat); g.drawImage(t, 0, 0); }
      else g.drawImage(im, 0, 0); });
    return c;
  };
  const toImg = (canvas, sx, w) => new Promise((res) => { const t = document.createElement("canvas"); t.width = w; t.height = FS(); t.getContext("2d").drawImage(canvas, sx, 0, w, FS(), 0, 0, w, FS()); const im = new Image(); im.onload = () => res(im); im.src = t.toDataURL(); });
  // build + register the sprite for a look key (async; SP listeners repaint icons, the battle picks it up next frame)
  GL.ensure = function (key) {
    if (GL.state[key]) return GL.state[key] === "ok";
    const spec = GG.specs[key]; if (!spec) return false;
    GL.state[key] = "building";
    const S = DATA.sprites, ug = S.unit_grunt;
    S[key] = { file: null, shape: ug.shape, color: ug.color, size: ug.size, anchorY: ug.anchorY, feetY: ug.feetY, walk: key + "_w", corpse: ug.corpse, look: true };
    S[key + "_w"] = { file: null, shape: "none", color: "#000", size: 1, frames: 2, fps: (S.unit_grunt_strip2 || {}).fps || 8, anchorY: ug.anchorY, feetY: ug.feetY, look: true };
    GL.compose(spec).then(async (c) => {
      const [stand, walk] = await Promise.all([toImg(c, 0, FS()), toImg(c, FS(), FS() * 2)]);
      SP.cache[key] = { ok: true, img: stand }; SP.cache[key + "_w"] = { ok: true, img: walk }; GL.state[key] = "ok";
      for (const f of SP.listeners) { f(key); f(key + "_w"); }
    });
    return false;
  };
  GL.key = (g) => (GG ? GG.lookKey(g) : null);
  // an icon for a Grunt (its doll once composited; Veterans / the core ally keep their sprite)
  G.UI.gruntIcon = function (g, px, cls) { const k = GL.key(g); if (k) GL.ensure(k); return SP.icon(k || G.State.gruntTpl(g).sprite, px, cls); };

  // ---------- the equip menu ----------
  // [grunt slot, body loadout key, label, item slot(s)]. Slice 5 §E: + the off hand (both) and the Backup set (the body only)
  const SLOTS = [["head", "head", "Head", ["head"]], ["body", "body", "Body", ["body"]], ["pack", "backpack", "Pack", ["backpack"]], ["weapon", "weapon", "Main hand", ["weapon"]], ["offhand", "offhand", "Off hand", ["weapon", "shield"]],
    ["weapon2", "weapon2", "Backup main", ["weapon"], true], ["offhand2", "offhand2", "Backup off", ["weapon", "shield"], true]];
  GL.sel = {};
  // target: { grunt: g } or { body: true } (the deploy loadout: items stay in the stash until you deploy)
  G.UI.dollEl = function (target, after) {
    const UI = G.UI, h = UI.h, s = G.state, g = target.grunt, lo = s.loadout, I = G.Items;
    if (g && !Object.keys(G.State.gruntSlots(g)).length) return h("div", { class: "doll" }, UI.gruntIcon(g, 96, "doll-art"), h("p", { class: "hint" }, `${G.Allies.rankName(g)}s don't wear gear. It fights with its ${I.base(g.weapon).name}.`));   // Slice 5 §F pets
    const tid = g ? g.uid : "body", cur = GL.sel[tid] || "weapon"; GL.sel[tid] = cur;
    const equipped = (gs, is) => g ? g.gear[gs] : (lo.gear[is] ? s.stash.items.find((i) => i.uid === lo.gear[is]) : null);
    const inRun = !!s.run, redraw = () => { if (after) after(); else UI.render(); };
    const getB = (k) => (lo.gear[k] ? s.stash.items.find((i) => i.uid === lo.gear[k]) : null), getT = (k) => (g ? g.gear[k] : getB(k));
    const act = (gs, is, uid) => {
      if (g) { const e = G.State.equipGrunt(g.uid, gs, uid); if (e) return UI.fail(e); }
      else { const x = uid && s.stash.items.find((i) => i.uid === uid);
        if (x && I.isHandItem(x)) { const fit = I.handFit(is, x, getB); if (fit.why) return UI.fail(fit.why); for (const k of fit.clear) delete lo.gear[k]; }   // Slice 5 §E
        if (uid) lo.gear[is] = uid; else delete lo.gear[is]; if ((lo.pouch || []).some((p) => p.uid === uid)) lo.pouch = []; G.State.save(); }
      if (G.Sfx) G.Sfx.play("sfx_ui_click");
      if (G.Touch && G.Touch.layout()) UI.hideTip();   // phones: the tap also opened the row's item tooltip, which stayed over the redrawn doll
      redraw();
    };
    const box = h("div", { class: "doll", "data-doll": tid });
    // the figure: the composited Grunt at dollScale (the body: its own sprite)
    const fig = h("div", { class: "doll-fig" + (!g || G.State.gruntSlots(g).offhand ? " hands" : "") });
    const sc = DATA.gruntLook.dollScale, px = FS() * sc;
    const figIcon = g ? UI.gruntIcon(g, px, "doll-art") : SP.icon(G.State.bodySprite(G.State.body(lo.bodyId)), px, "doll-art");
    fig.appendChild(figIcon);
    for (const [gs, is, label, , bk] of SLOTS) {
      if (g ? !G.State.gruntSlots(g)[gs] : false) continue;
      if (bk && g) continue;
      const it = equipped(gs, is), icon = it ? SP.icon(I.sprite(it), 36) : SP.icon(DATA.sprites["slot_" + gs] ? "slot_" + gs : "slot_gear", 36, "slot-empty");
      const b = h("button", { class: "doll-slot s-" + gs + (cur === gs ? " on" : "") + (it ? " filled r-" + it.rarity : ""), "data-dslot": gs, title: it ? I.name(it) : label + " (empty)", onclick: () => { GL.sel[tid] = gs; redraw(); } }, icon, h("span", null, label));
      fig.appendChild(b);
    }
    box.appendChild(fig);
    // the list for the chosen slot
    const [gs, is, label, accepts] = SLOTS.find((x) => x[0] === cur) || SLOTS[3], it = equipped(gs, is);
    const side = h("div", { class: "doll-list" });
    const innate = g ? I.base(g.weapon).name : I.base(DATA.bodies.basicBody.naturalWeapon).name;
    side.appendChild(h("div", { class: "doll-cur" }, h("b", null, label + ": "), it ? h("span", { style: "color:" + DATA.items.rarities[it.rarity].color }, I.name(it)) : h("i", null, gs === "weapon" ? `empty (fights with ${g ? "their" : "your"} ${innate})` : "empty"),
      it && !inRun ? h("button", { "data-act": "doll-unequip", onclick: () => act(gs, is, null) }, "Unequip") : null));
    if (inRun && g) side.appendChild(h("p", { class: "hint" }, "Equip Grunts at the outpost, not during a run."));
    const bodyTaken = new Set(Object.values(lo.gear || {}));
    const hk = g ? gs : is;   // the hand-rule key (grunt slots use the same names)
    const pool = s.stash.items.filter((x) => !I.isQuest(x) && accepts.includes(I.base(x.base).slot) && (!it || x.uid !== it.uid) && !(I.isHandItem(x) && I.handFit(hk, x, getT).why));   // a Grunt can take what the body had picked (it leaves the loadout)
    const ul = h("div", { class: "doll-items" });
    if (!pool.length) ul.appendChild(h("p", { class: "hint" }, `No ${label.toLowerCase()} items in the stash.`));
    for (const x of pool) {
      const bd = I.base(x.base), stat = bd.slot === "shield" ? `Shield · block ${bd.blockPct}% · Armor ${Math.round((bd.armor || 0) * I.scale(x.ilvl))} · ${bd.moveSpeedPct}% Move` : bd.slot === "weapon" ? `${bd.wtype ? DATA.items.wtypes[bd.wtype].name + " · " : ""}${bd.hands === 2 ? "2H" : "1H"} · ${U.fmt1(I.weaponStats(x).dmg)} dmg` : [bd.armor ? `Armor ${Math.round(bd.armor * (bd.noScale ? 1 : I.scale(x.ilvl)))}` : null, bd.carryKg ? `+${bd.carryKg} kg carry` : null].filter(Boolean).join(" · ");
      const note = bodyTaken.has(x.uid) ? (g ? " (in your loadout)" : " (you)") : "";
      const row = h("button", { class: "doll-item r-" + x.rarity, "data-uid": x.uid, disabled: inRun && g ? "" : null, onclick: () => act(gs, is, x.uid) }, SP.icon(I.sprite(x), 32), h("span", { class: "di-name", style: "color:" + DATA.items.rarities[x.rarity].color }, I.name(x) + note), h("small", null, `${DATA.items.rarities[x.rarity].name} i${x.ilvl}${stat ? " · " + stat : ""} · ${I.weight(x)} kg`));
      UI.tipOn(row, () => `<b style="color:${I.color(x)}">${I.name(x)}</b><br>` + I.describe(x).join("<br>"));
      ul.appendChild(row);
    }
    side.appendChild(ul);
    box.appendChild(side);
    return box;
  };
  G.UI.showDoll = function (target) {
    const UI = G.UI, h = UI.h, g = target.grunt;
    UI.hideTip();
    const draw = () => { const wrap = h("div", { class: "doll-modal" }, h("h2", null, g ? G.Allies.name(g) + " · gear" : "Your gear"), UI.dollEl(target, draw), h("button", { class: "primary", onclick: () => { UI.closeModal(); UI.render(); } }, "Done")); UI.modal(wrap, "doll-modal-wrap"); };
    draw();
  };
  const U = G.Util;
})(window);
