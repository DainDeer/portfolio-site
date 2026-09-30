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
  // item -> part id: a part keyed by the item's base (Smudge's own layers) > one listing it in its grunt_options.json
  // "items" > the stand-in map (DATA.gruntLook.items) > wtype_<wtype> (weapons) / fallback.<slot>
  GG.partFor = function (slot, item) {
    const P = L().parts, I = L().items, J = GG.optItems, key = slot === "pack" ? "backpack" : slot;
    if (!item) return null;
    const base = typeof item === "string" ? item : item.base, bd = G.Items.base(base) || {};
    if (P[key] && P[key][base]) return base;
    const j = (J[key] || {})[base]; if (j && P[key][j]) return j;
    if (key === "weapon") { const id = I.weapon[base] || (bd.wtype && P.weapon["wtype_" + bd.wtype] ? "wtype_" + bd.wtype : null); return id && P.weapon[id] ? id : null; }
    const id = (I[key] || {})[base] || L().fallback[key]; return id && P[key][id] ? id : null;
  };
  // Smudge's assets/grunt_options/grunt_options.json (fetched at load by js/gruntlook.js; read from disk by the headless
  // tests and tools/asset-manifest.js): every gear entry not already in DATA.gruntLook.parts is added (paths made
  // relative to grunt_options/), and each entry's "items" list maps those item bases to it. Returns the ids added.
  GG.optItems = {};
  GG.mergeOptions = function (opt) {
    const added = [], P = L().parts, strip = (p) => (typeof p === "string" ? p.replace(/^grunt_options\//, "") : p);
    const gear = (opt && opt.gear) || {};
    for (const slot in gear) {
      if (!P[slot]) continue;
      for (const id in gear[slot]) {
        const e = gear[slot][id] || {}, ly = e.layers || {};
        if (!P[slot][id]) {
          let part = null;
          if (slot === "head" && ly.headwear) part = { headwear: strip(ly.headwear), hidesHair: !!e.hides_hair, hidesFacialHair: !!e.hides_facial_hair };
          else if (slot === "body" && ly.torso) { part = {}; for (const k of ["legwear", "footwear", "torso", "belt"]) if (ly[k]) part[k] = strip(ly[k]);
            if (ly.sleeves) { part.sleeves = {}; for (const v in ly.sleeves) part.sleeves[v] = strip(ly.sleeves[v]); } if (e.hides_legwear) delete part.legwear;
            if (e.extraLayers && e.extraLayers.headwear) part.headwear = strip(e.extraLayers.headwear); }   // Slice 5 §H: the maid headband (drawn only with nothing on the head)
          else if (slot === "backpack" && (ly.pack_back || ly.pack_straps)) part = { pack_back: strip(ly.pack_back), pack_straps: strip(ly.pack_straps) };
          else if (slot === "weapon" && ly.weapon) part = { weapon: strip(ly.weapon), armVariant: e.armVariant || (e.pose === "two_hand" ? "two_hand" : "one_hand") };
          else if (slot === "offhand" && (ly.shield || ly.offhand)) { part = { armVariant: e.armVariant || "one_hand" }; if (ly.shield) part.shield = strip(ly.shield); if (ly.offhand) part.offhand = strip(ly.offhand); }   // Slice 5 §E
          if (part) { P[slot][id] = part; added.push(slot + "/" + id); }
        }
        if (P[slot][id]) for (const b of e.items || []) { (GG.optItems[slot] = GG.optItems[slot] || {})[b] = id; }
      }
    }
    return added;
  };
  // the look spec + its sprite key ("gl_" + a hash of the spec). null for Veterans / the core ally (they keep their sprites)
  GG.look = function (g) {
    if (!L().enabled || !g || (g.tplKey && g.tplKey !== "grunt")) return null;
    const gear = g.gear || {}, lk = GG.baseLook(g);
    const w = GG.partFor("weapon", gear.weapon) || GG.partFor("weapon", g.weapon || CFG().innateWeapon);
    const spec = { skin: lk.skin, hair: lk.hair, hairColour: lk.hairColour, beard: lk.beard, head: GG.partFor("head", gear.head), body: GG.partFor("body", gear.body), backpack: GG.partFor("pack", gear.pack), weapon: w };
    { const ob = gear.body && outfitOf(gear.body.base); if (ob && CO().outfits[ob].underwear) spec.body = GG.UNDERWEAR; }   // wearing the Lucky Boxers
    for (const sl of ["head", "body"]) { const o = GG.cosPart(g, sl); if (o !== undefined) spec[sl] = o; }   // Slice 5 §H: an unlocked look over the real gear
    const off = GG.partFor("offhand", gear.offhand); if (off) spec.offhand = off;   // Slice 5 §E (only when drawn: old keys stay)
    const key = "gl_" + hash(JSON.stringify(spec)).toString(36);
    GG.specs[key] = spec;
    return { key, spec };
  };
  GG.lookKey = (g) => { const l = GG.look(g); return l ? l.key : null; };

  // ---------- Slice 5 §H cosmetics (DATA.gruntLook.cosmetics) ----------
  GG.UNDERWEAR = "_underwear";
  const CO = () => L().cosmetics || { outfits: {} };
  const cst = () => { const s = G.state; if (!s) return { unlocked: {} }; s.cosmetics = s.cosmetics || { unlocked: {} }; s.cosmetics.unlocked = s.cosmetics.unlocked || {}; return s.cosmetics; };
  GG.cosState = cst;
  // the item's own look part (Smudge's key, a grunt_options "items" entry or the stand-in map; never the slot fallback)
  GG.ownPart = function (slot, base) {
    const P = L().parts[slot] || {}; if (P[base]) return base;
    const j = (GG.optItems[slot] || {})[base]; if (j && P[j]) return j;
    const m = (L().items[slot] || {})[base]; return m && P[m] ? m : null;
  };
  const outfitOf = (base) => { const O = CO().outfits; for (const id in O) if (O[id].item === base) return id; return null; };
  const pretty = (id) => id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  // every look: [{ id, name, slot, part, pending, underwear, silly }]
  GG.cosList = function () {
    const out = [], O = CO().outfits, P = L().parts, seen = new Set();
    for (const id in O) { const o = O[id], own = P[o.slot] && P[o.slot][o.item], pt = o.underwear ? GG.UNDERWEAR : GG.ownPart(o.slot, o.item);
      if (pt) seen.add(o.slot + pt);   // the outfit IS that part's look (no second "look_<id>" entry)
      out.push({ id, name: o.name, slot: o.slot, silly: true, underwear: !!o.underwear, part: o.underwear ? GG.UNDERWEAR : GG.ownPart(o.slot, o.item), pending: !o.underwear && !own }); }
    for (const slot of ["head", "body"]) for (const part in P[slot]) {
      if (seen.has(slot + part)) continue; seen.add(slot + part);
      const it = Object.keys(DATA.items.bases).find((b) => DATA.items.bases[b].slot === slot && !outfitOf(b) && GG.ownPart(slot, b) === part);
      out.push({ id: "look_" + part, name: (it ? DATA.items.bases[it].name : pretty(part)) + " look", slot, part, gear: true });
    }
    return out;
  };
  GG.cosDef = (id) => GG.cosList().find((c) => c.id === id) || null;
  GG.cosUnlocked = (id) => !!cst().unlocked[id];
  // the looks an item unlocks when equipped: its outfit, else its gear look
  GG.cosFor = function (item) {
    if (!item) return [];
    const base = typeof item === "string" ? item : item.base, b = DATA.items.bases[base]; if (!b || !["head", "body"].includes(b.slot)) return [];
    const o = outfitOf(base); if (o) return [o];
    const part = GG.ownPart(b.slot, base); return part ? ["look_" + part] : [];
  };
  // call on every equip (a Grunt at the outpost, your loadout, your body in a run): returns the newly unlocked looks
  GG.noteEquip = function (item) {
    const c = cst(), got = [];
    for (const id of GG.cosFor(item)) if (!c.unlocked[id]) { c.unlocked[id] = { run: (G.state && G.state.runCount) || 0 }; got.push(id); }
    return got;
  };
  // g.cosmetic[slot]: a look id, "none" (head: bare), or unset (the gear's own look). undefined = no override
  GG.cosPart = function (g, slot) {
    const id = g && g.cosmetic && g.cosmetic[slot]; if (!id) return undefined;
    if (id === "none") return slot === "head" ? null : undefined;
    if (!GG.cosUnlocked(id)) return undefined;
    const d = GG.cosDef(id); return d && d.slot === slot && d.part ? d.part : undefined;
  };
  GG.setCosmetic = function (g, slot, id) {
    if (!g || !["head", "body"].includes(slot)) return "No such slot.";
    if (!GG.look(g)) return "Only Grunts wear outfits.";
    if (id && id !== "none" && (!GG.cosUnlocked(id) || (GG.cosDef(id) || {}).slot !== slot)) return "You haven't unlocked that look.";
    if (id === "none" && slot !== "head") return "No such look.";
    g.cosmetic = g.cosmetic || {}; if (id) g.cosmetic[slot] = id; else delete g.cosmetic[slot];
    if (!Object.keys(g.cosmetic).length) delete g.cosmetic;
    return null;
  };
  // the layer files (paths under assets/) for a spec, bottom -> top: [{ layer, file }]
  GG.layers = function (spec) {
    const D = L(), P = D.parts, B = D.basePaths, fill = (t) => t.replace("{skin}", spec.skin).replace("{hair}", spec.hair).replace("{hairColour}", spec.hairColour);
    const wp = spec.weapon && P.weapon[spec.weapon], op = spec.offhand && P.offhand && P.offhand[spec.offhand];
    // Slice 5 §E: a shield's pose (one_hand_shield) with a 1H / no main weapon; a two-hander (blocksOffhand) hides it
    const wav = wp ? wp.armVariant : "one_hand", blocked = /^two_hand/.test(wav), av = op && !blocked ? op.armVariant || wav : wav;
    const uw = spec.body === GG.UNDERWEAR;   // Slice 5 §H "Just the underwear": body + underwear + face + arms + hair
    const hd = spec.head && P.head[spec.head], bd = !uw && spec.body && P.body[spec.body], pk = spec.backpack && P.backpack[spec.backpack];
    const armsF = B.arms[av] || B.arms.one_hand, sleevesF = uw ? null : bd ? bd.sleeves[av] || bd.sleeves.one_hand : D.empty.sleeves[av] || D.empty.sleeves.one_hand;
    const pick = { pack_back: pk && pk.pack_back, body: fill(B.body), underwear: B.underwear, face: fill(B.face),
      legwear: uw ? null : bd ? (bd.hidesLegwear ? null : bd.legwear) : D.empty.legwear, footwear: bd && bd.footwear, torso: uw ? null : bd ? bd.torso : D.empty.torso,
      pack_straps: pk && pk.pack_straps, belt: bd && bd.belt, weapon: wp && wp.weapon, offhand: op && !blocked && op.offhand, shield: op && !blocked && op.shield, arms: fill(armsF), sleeves: sleevesF,
      hair: hd && hd.hidesHair ? null : fill(B.hair), facial_hair: spec.beard && !(hd && hd.hidesFacialHair) ? fill(B.facial_hair) : null,
      headwear: hd ? hd.headwear : bd && bd.headwear };   // a body part's headwear (the maid headband) only on a bare head
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
