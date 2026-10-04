// SP-100 3D battles: which of Smudge's models (assets/3d/manifest.json) draws each sim unit, weapon, shield and Grunt
// gear piece. No DOM, no three.js: the 3D view (js/b3d/) asks it, and tests/battle3d.js checks every enemy / class /
// ally / pet / weapon in DATA maps to a real file. man = the parsed manifest (files, units, gear, weapon_item_to_file,
// gear_item_to_part). Anything without a file falls back to a placeholder in the view (never an error).
(function (root) {
  const G = root.G;
  const R = G.Roster3D = {};
  const has = (man, f) => !!(man && f && man.files && man.files.indexOf(f) >= 0);
  // weapons the data gives NPCs / classes that Smudge filed under another name (on top of manifest.weapon_item_to_file)
  R.WEAPON_ALIAS = { hunter_rifle_npc: "hunter_longrifle" };
  // natural weapons that are the body itself (claws, horns, the sentry's own gun...): nothing held
  R.BODY_WEAPONS = ["nat_fists", "bone_claws", "goat_horns", "maw_bite", "drone_zapper", "crawler_none", "sentry_gun", "acid_gland"];
  R.unitKey = function (sprite) { return String(sprite || "").replace(/^unit_/, "").replace(/^enemy_(outlaw_|beast_)?/, ""); };
  // file for a weapon base id: the manifest's item map > a file named after the id > wtype_<type>. null = nothing held
  R.weaponFile = function (id, man) {
    if (!id || R.BODY_WEAPONS.indexOf(id) >= 0) return null;
    const m = (man && man.weapon_item_to_file) || {}, alias = m[id] || R.WEAPON_ALIAS[id];
    if (alias && has(man, alias + ".glb")) return alias + ".glb";
    if (has(man, id + ".glb")) return id + ".glb";
    const bd = (DATA.items.bases || {})[id] || {};
    if (bd.wtype && has(man, "wtype_" + bd.wtype + ".glb")) return "wtype_" + bd.wtype + ".glb";
    return null;
  };
  // w: a weaponStats() object (u.weapon) -> { file, melee, wtype, pellets, kind (placeholder shape) } or null (body weapon)
  R.weaponSpec = function (w, man) {
    if (!w || R.BODY_WEAPONS.indexOf(w.id) >= 0) return null;
    const bd = (DATA.items.bases || {})[w.id] || {}, melee = w.style !== "gun", wt = bd.wtype || (melee ? "blade" : "rifle");
    return { id: w.id, file: R.weaponFile(w.id, man), melee, wtype: wt, pellets: wt === "shotgun" ? 5 : 1,
      kind: melee ? "machete" : wt === "pistol" ? "pistol" : wt === "shotgun" ? "shotgun" : "rifle" };
  };
  R.shieldFile = function (base, man) { return base && has(man, base + ".glb") ? base + ".glb" : null; };
  // Grunt gear: item -> gear_<slot>_<part>.glb (+ the nodes it hides)
  R.gearFiles = function (g, man) {
    const out = [], gear = (g && g.gear) || {}, map = (man && man.gear_item_to_part) || {};
    for (const [slot, key] of [["head", "head"], ["body", "body"], ["pack", "pack"]]) {
      const it = gear[key], part = it && (map[slot] || {})[it.base]; if (!part) continue;
      const f = "gear_" + slot + "_" + part + ".glb", meta = ((man && man.gear) || {})["gear_" + slot + "_" + part] || {};
      if (has(man, f)) out.push({ slot, file: f, hides: meta.hides || [], tint: !!meta.tint });
    }
    return out;
  };
  // a sim unit -> { key, plan, file, gear, scale, tintIdx, ghost, faint }
  R.unitSpec = function (u, man) {
    const units = (man && man.units) || {}, g = u.ref && u.ref.grunt;
    let key = R.unitKey(u.sprite), scale = u.elite ? 1.15 : 1;
    if (g && g.tplKey === "pet" && key === "hound") scale *= 0.72;   // the hound pup: a small hound
    if (g && g.tplKey === "pet" && key === "ai_drone") scale *= 0.8;
    let gear = [];
    if (key === "grunt" && g) { gear = R.gearFiles(g, man); if (gear.some((x) => x.slot === "body") && units.grunt_mannequin) key = "grunt_mannequin"; }
    const meta = units[key] || null;
    return { key, plan: meta ? meta.plan : (u.family === "beasts" ? "quad" : "human"), file: meta && has(man, key + ".glb") ? key + ".glb" : null, gear, scale,
      tint: !!(meta && meta.tint) && (u.rank === "grunt" || key === "grunt_mannequin"), defaultWeapon: meta ? meta.weapon : null, rival: !!u.rival };
  };
  // every file a battle needs: its units (+ weapons, shields, backup sets, gear) and the shared fx models
  R.filesFor = function (b, man, extra) {
    const out = new Set(extra || []);
    for (const u of b.units) {
      const s = R.unitSpec(u, man); if (s.file) out.add(s.file); for (const x of s.gear) out.add(x.file);
      for (const S of u.sets || [{ main: u.weapon }]) if (S) { for (const w of [S.main, S.off]) { const ws = R.weaponSpec(w, man); if (ws && ws.file) out.add(ws.file); } const sf = S.shield && R.shieldFile(S.shield.base, man); if (sf) out.add(sf); }
    }
    // Defense / Handcar reinforcements are descriptors until they spawn. Read their static definitions rather than
    // constructing sim units here: unit construction consumes attack-timer randomness and assigns unit ids.
    for (const wave of b.waves || []) for (const e of wave) {
      const d = DATA.enemies.units[e.id]; if (!d) continue;
      const s = R.unitSpec({ sprite: d.sprite, family: d.family }, man); if (s.file) out.add(s.file);
      const weapon = R.weaponFile(d.weapon, man); if (weapon) out.add(weapon);
    }
    for (const f of R.FX_FILES) if (has(man, f)) out.add(f);
    return [...out];
  };
  R.FX_FILES = ["shell_casing.glb", "frag_grenade.glb", "acid_glob.glb", "drone_bolt.glb", "arrow.glb", "crossbow_bolt.glb", "med_kit.glb", "gib_metal_01.glb", "gib_metal_02.glb", "gib_metal_03.glb"]
    .concat(Array.from({ length: 12 }, (_, i) => "gib_" + String(i + 1).padStart(2, "0") + ".glb"));
  // coverage (tests/battle3d.js): every enemy / class / basic body / Grunt / Veteran / pet sprite and every weapon base
  R.coverage = function (man) {
    const D = DATA, units = [], weapons = [];
    const unit = (what, sprite) => { const key = R.unitKey(sprite); units.push({ what, sprite, key, file: man.units && man.units[key] && has(man, key + ".glb") ? key + ".glb" : null }); };
    for (const id in D.enemies.units) unit("enemy " + id, D.enemies.units[id].sprite);
    for (const id in D.bodies.classes) unit("class " + id, D.bodies.classes[id].sprite);
    unit("basic body", D.bodies.basicBody.sprite); unit("grunt", D.bodies.grunt.sprite);
    if (D.allies.veteran) unit("veteran", D.allies.veteran.sprite);
    for (const id in D.allies.pets || {}) unit("pet " + id, D.allies.pets[id].sprite);
    for (const id in D.items.bases) { const bd = D.items.bases[id]; if (bd.slot !== "weapon" && bd.slot !== "shield") continue;
      weapons.push({ id, slot: bd.slot, file: bd.slot === "shield" ? R.shieldFile(id, man) : R.weaponFile(id, man), body: R.BODY_WEAPONS.indexOf(id) >= 0 }); }
    return { units, weapons };
  };
})(typeof window !== "undefined" ? window : globalThis);
