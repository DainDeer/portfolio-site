// Battle 3D prototypes: loads the game's DATA + DOM-free battle sim (simfiles.js allowlist, no save code), builds one
// example fight from a spec and steps it. The 3D pages only read unit state and fx.
const ROOT = "../../";   // proto/<demo>/ -> repo (or /renegade/) root

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = false; s.onload = res; s.onerror = () => rej(new Error("failed to load " + src)); document.head.appendChild(s); });
}
// returns { dataMs, simMs }: data files first, then the logic files (each list in simfiles.js order)
export async function loadGame() {
  const files = window.PROTO_SIM_FILES, data = files.filter((f) => f.startsWith("data/")), logic = files.filter((f) => !f.startsWith("data/"));
  const t0 = performance.now(); await Promise.all(data.map((f) => loadScript(ROOT + f)));
  const t1 = performance.now(); await Promise.all(logic.map((f) => loadScript(ROOT + f)));
  const t2 = performance.now();
  if (!window.G || !window.G.Battle || !window.G.State || !window.G.State.proto) throw new Error("sim not loaded (or the real save code was)");
  return { dataMs: t1 - t0, simMs: t2 - t1 };
}

// spec: { allies: [{ name, weapon: {base, rarity, ilvl}, backup?: {...} }], enemies: [{ id, weapon?, backup? }], family }
// backup = a melee weapon in the Backup set (B.armSets). The game only lets your body swap sets (Grunts carry the Main
// set only); the proto gives every unit a backup and applies the same swap rule to all of them (applySwapRule).
// Replays must be exact (R = same seed): the sim seeds everything from b.rng except each unit's first attack timer
// (Math.random in the unit factory), so building the fight runs under a seeded Math.random. Proto-only; game code untouched.
export function buildFight(spec, seed) {
  const real = Math.random; Math.random = window.G.Util.makeRng((seed ^ 0x51ed) >>> 0);
  try { return buildInner(spec, seed); } finally { Math.random = real; }
}
function buildInner(spec, seed) {
  const G = window.G, DATA = window.DATA, B = G.Battle, U = G.Util;
  const allies = spec.allies.map((a, i) => {
    const sk = {}; for (const k in DATA.bodies.grunt.skills) sk[k] = { lvl: DATA.bodies.grunt.skills[k], xp: 0 };
    const w = G.Items.make(a.weapon.base, a.weapon.rarity, a.weapon.ilvl, U.makeRng(seed * 7 + i));
    const rec = { uid: "proto_g" + i, name: a.name, rank: "grunt", tplKey: "grunt", weapon: a.weapon.base, skills: sk, gear: { weapon: w }, traits: [], injuries: [], history: [] };
    const u = B.unitFromGrunt(rec, null, { rival: true });   // rival: none of "your" perks (there is no save)
    if (a.backup) B.armSets(u, w, null, G.Items.make(a.backup.base, a.backup.rarity, a.backup.ilvl, U.makeRng(seed * 7 + 100 + i)), null, a.weapon.base);
    return u;
  });
  const b = B.create({ allies, enemies: spec.enemies.map((e) => ({ id: e.id })), family: spec.family, seed });
  const foes = b.units.filter((u) => u.side === 1);
  spec.enemies.forEach((e, i) => { const u = foes[i]; if (!u || (!e.weapon && !e.backup)) return;
    const main = e.weapon ? G.Items.make(e.weapon.base, e.weapon.rarity, e.weapon.ilvl, U.makeRng(seed * 13 + i)) : null;
    const back = e.backup ? G.Items.make(e.backup.base, e.backup.rarity, e.backup.ilvl, U.makeRng(seed * 13 + 100 + i)) : null;
    B.armSets(u, main || DATA.enemies.units[e.id].weapon, null, back, null, DATA.enemies.units[e.id].weapon); });
  return b;
}
// The class AI's swap rule (config.battle.weaponSets.swap) for every unit with a backup: a gun in hand and a foe inside
// meleeSwapM -> the melee backup; a melee weapon in hand and the target rangeSwapM past its reach -> back to the gun.
export function applySwapRule(b) {
  const G = window.G, B = G.Battle, U = G.Util, SW = window.DATA.config.battle.weaponSets.swap;
  for (const u of b.units) {
    if (!u.sets || !u.sets[1] || u.state !== "alive" || !B.canSwap(b, u)) continue;
    const foes = b.units.filter((f) => f.side !== u.side && f.state === "alive"); if (!foes.length) continue;
    const near = foes.reduce((m, f) => Math.min(m, U.dist(u, f) - u.r - f.r), 99), other = u.sets[1 - u.setIdx].main, gun = u.weapon.style === "gun", oGun = other.style === "gun";
    if (gun && !oGun && near <= SW.meleeSwapM) B.swapSet(b, u, "in melee range");
    else if (!gun && oGun && near > u.weapon.range + SW.rangeSwapM) B.swapSet(b, u, "out of reach");
  }
}
export const startFight = (b) => window.G.Battle.start(b);
export const stepFight = (b, dt) => window.G.Battle.step(b, dt);
