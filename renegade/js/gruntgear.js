// Slice 4 §F: Grunt gear (4 slots like the body) + the paper-doll look spec. No DOM: js/gruntlook.js composites and draws.
(function (root) {
  const G = root.G;
  const GG = G.GruntGear = { specs: {} };
  const L = () => DATA.gruntLook, CFG = () => DATA.config.grunts;
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  // cosmetic base look from the uid (no rng draws, nothing saved)
  GG.baseLook = function (g) {
    const K = L().looks, x = hash(String((g && (g.uid || g.name)) || "grunt"));
    return { skin: K.skins[x % K.skins.length], hair: K.hair[(x >>> 4) % K.hair.length], hairColour: K.hairColours[(x >>> 8) % K.hairColours.length], beard: ((x >>> 12) % 100) < K.beardPct };
  };
  GG.partFor = function (slot, item) {
    const P = L().parts, I = L().items, key = slot === "pack" ? "backpack" : slot;
    if (!item) return null;
    const base = typeof item === "string" ? item : item.base, bd = G.Items.base(base) || {};
    if (key === "weapon") { const id = I.weapon[base] || (bd.wtype && P.weapon["wtype_" + bd.wtype] ? "wtype_" + bd.wtype : null); return id && P.weapon[id] ? id : null; }
    const id = (I[key] || {})[base] || L().fallback[key]; return id && P[key][id] ? id : null;
  };
  // the look spec + its sprite key ("gl_" + a hash of the spec). null for Veterans / the core ally (they keep their sprites)
  GG.look = function (g) {
    if (!L().enabled || !g || (g.tplKey && g.tplKey !== "grunt")) return null;
    const gear = g.gear || {}, lk = GG.baseLook(g);
    const w = GG.partFor("weapon", gear.weapon) || GG.partFor("weapon", g.weapon || CFG().innateWeapon);
    const spec = { skin: lk.skin, hair: lk.hair, hairColour: lk.hairColour, beard: lk.beard, head: GG.partFor("head", gear.head), body: GG.partFor("body", gear.body), backpack: GG.partFor("pack", gear.pack), weapon: w };
    const key = "gl_" + hash(JSON.stringify(spec)).toString(36);
    GG.specs[key] = spec;
    return { key, spec };
  };
  GG.lookKey = (g) => { const l = GG.look(g); return l ? l.key : null; };
  // the layer files (paths under assets/) for a spec, bottom -> top: [{ layer, file }]
  GG.layers = function (spec) {
    const D = L(), P = D.parts, B = D.basePaths, fill = (t) => t.replace("{skin}", spec.skin).replace("{hair}", spec.hair).replace("{hairColour}", spec.hairColour);
    const wp = spec.weapon && P.weapon[spec.weapon], av = wp ? wp.armVariant : "one_hand";
    const hd = spec.head && P.head[spec.head], bd = spec.body && P.body[spec.body], pk = spec.backpack && P.backpack[spec.backpack];
    const pick = { pack_back: pk && pk.pack_back, body: fill(B.body), underwear: B.underwear, face: fill(B.face),
      legwear: bd ? (bd.hidesLegwear ? null : bd.legwear) : D.empty.legwear, footwear: bd && bd.footwear, torso: bd ? bd.torso : D.empty.torso,
      pack_straps: pk && pk.pack_straps, belt: bd && bd.belt, weapon: wp && wp.weapon, arms: fill(B.arms[av]), sleeves: bd ? bd.sleeves[av] : D.empty.sleeves[av],
      hair: hd && hd.hidesHair ? null : fill(B.hair), facial_hair: spec.beard ? fill(B.facial_hair) : null, headwear: hd && hd.headwear };
    const out = [];
    for (const layer of D.layerOrder) if (pick[layer]) out.push({ layer, file: D.base + pick[layer] });
    return out;
  };
  // every file the doll can ask for (tools/asset-manifest.js packs them)
  GG.allFiles = function () {
    const D = L(), set = new Set(), K = D.looks, add = (p) => set.add(D.base + p);
    const walk = (o) => { for (const k in o) { const v = o[k]; if (typeof v === "string" && /\.png$/.test(v)) add(v); else if (v && typeof v === "object") walk(v); } };
    walk(D.parts); walk(D.empty); add(D.basePaths.underwear);
    for (const s of K.skins) { add(D.basePaths.body.replace("{skin}", s)); add(D.basePaths.face.replace("{skin}", s)); for (const a in D.basePaths.arms) add(D.basePaths.arms[a].replace("{skin}", s)); }
    for (const c of K.hairColours) { add(D.basePaths.facial_hair.replace("{hairColour}", c)); for (const hs of K.hair) add(D.basePaths.hair.replace("{hair}", hs).replace("{hairColour}", c)); }
    return [...set];
  };
  // §F starting kit (config.grunts.startKit, by roster position). rng: its own stream so the new-game rolls don't move
  GG.giveStartKit = function (g, idx, rng) {
    const kit = CFG().startKit[idx]; if (!kit) return;
    for (const slot in kit) { const k = kit[slot]; g.gear[slot] = G.Items.make(k.base, k.rarity, k.ilvl, rng || G.Util.makeRng(0x5eed + idx)); }
  };
  // Megan's playtest grunts had { weapon, gear }: move the one gear item to its slot
  GG.migrate = function (g) {
    if (!g.gear || g.tplKey === "veteran" || g.tplKey === "core") return;
    const SL = CFG().slots, old = g.gear.gear;
    for (const k in SL) if (!(k in g.gear)) g.gear[k] = null;
    if ("gear" in g.gear) { delete g.gear.gear; if (old) { const sl = G.Items.base(old.base).slot, k = Object.keys(SL).find((x) => SL[x].includes(sl)); if (k && !g.gear[k]) g.gear[k] = old; else if (G.state) G.state.stash.items.push(old); } }
  };
})(typeof window !== "undefined" ? window : globalThis);
