// SP-100 3D battles: the units (Smudge's segmented glTF models when present, box placeholders otherwise), their weapons
// (main set in hand, a backup set slung on the back, a dual-wield off-hand or a shield at hand_l), Grunt gear merged by
// node name, procedural walk / recoil / chop / lunge / hover, and ragdolls. Ported from proto/shared/3d/figures.js.
// Figures face +x (the sim's facing 0). Part names = the manifest's plans (contract rev 2 §3). Nothing here depends on
// primitive counts or mesh names below the part nodes (Smudge merges each part's primitives into one mesh).
import * as THREE from "three";
import { GROUP } from "./physics.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const PLANS = {
  human: ["torso", "head", "arm_l", "arm_r", "leg_l", "leg_r"],
  quad: ["body", "head", "leg_fl", "leg_fr", "leg_bl", "leg_br", "tail"],
  hexapod: ["body", "head", "leg_fl", "leg_fr", "leg_ml", "leg_mr", "leg_bl", "leg_br"],
  hover: ["body", "head", "rotor_fl", "rotor_fr", "rotor_bl", "rotor_br"],
  turret: ["base", "gun"]
};
// manifest.plans.hover.spinners (contract rev 2)
const SPINNERS = ["blade_fl", "blade_fr", "blade_bl", "blade_br"];
const EMPTIES = ["hand_r", "hand_l", "back", "head_top", "muzzle", "muzzle_l", "muzzle_r", "eject"];
const GOAT_COATS = [{ coat: 0xb89a6a, dark: 0x6a5338 }, { coat: 0xd6cdbb, dark: 0x8a7c66 }, { coat: 0x7a5a3c, dark: 0x463422 }, { coat: 0x9a8a72, dark: 0x5a4c3a }];
const GRIP = V(0.2, 1.22, 0.14);   // two-handed gun grip on the placeholder human
const HEIGHT = { human: 1.8, quad: 1.15, hexapod: 0.6, hover: 1.95, turret: 1.2 };

function part(mats, color, sx, sy, sz, name, joint) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mats.solid(color));
  m.name = name; m.userData.half = { x: sx / 2, y: sy / 2, z: sz / 2 }; m.userData.joint = joint || V(0, 0, 0); m.castShadow = !mats.LOW; m.receiveShadow = true;
  return m;
}
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
function hung(mats, color, size, pivot, name) {
  const p = new THREE.Group(); p.position.copy(pivot);
  const m = part(mats, color, size[0], size[1], size[2], name, V(0, size[1] / 2, 0)); m.position.set(0, -size[1] / 2, 0); p.add(m);
  return { pivot: p, mesh: m };
}
// Smudge's painted colour pulled ~45% toward a squad tint, on the "tint" material only. No colour = no call (a white
// tint would wash the slot out: Smudge's note)
export function tintMaterials(root, color) {
  if (color == null) return;
  const t = new THREE.Color(color), done = new Map();
  root.traverse((o) => { if (!o.isMesh) return; const one = (m) => { if (!m || m.name !== "tint") return m; if (!done.has(m)) { const c = m.clone(); c.color.lerp(t, 0.45); done.set(m, c); } return done.get(m); };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
}
// Grunt gear (manifest "gear"): every mesh in the gear file goes onto the unit's node of the same name (its nearest named
// ancestor that the unit has), with no offset; the listed nodes (hair under a hood) hide
export function mergeGear(src, gear, hides) {
  src.updateMatrixWorld(true); gear.updateMatrixWorld(true);
  const meshes = []; gear.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const inv = new THREE.Matrix4();
  for (const m of meshes) {
    let a = m, target = null;
    while (a && a !== gear) { if (a.name) { target = src.getObjectByName(a.name); if (target) break; } a = a.parent; }
    if (!target) continue;
    const c = new THREE.Mesh(m.geometry, m.material); c.castShadow = m.castShadow; c.receiveShadow = true; c.name = "gear";
    inv.copy(a.matrixWorld).invert(); c.matrix.multiplyMatrices(inv, m.matrixWorld); c.matrix.decompose(c.position, c.quaternion, c.scale);
    target.add(c);
  }
  for (const h of hides || []) { const o = src.getObjectByName(h); if (o) o.visible = false; }
}

// a part's box for its ragdoll / gore proxy: its meshes, minus decorations that would inflate the hull (Smudge: the
// orbital_drone_t1 orbital_ring under body; the hull stays 0.22 x 0.13 x 0.29 m, not 0.38 x 0.13 x 0.33)
const BOX_SKIP = /^orbital_ring/;
// self-lit materials (orbital_glow) keep their colour: no squad tint, no ghost / hit tint
export const SELF_LIT = (m) => !!m && (m.name === "orbital_glow" || m.isMeshBasicMaterial);
const _pb = new THREE.Box3();
function partBox(node, box) {
  box.makeEmpty(); node.updateWorldMatrix(true, true);
  const walk = (o) => { if (o !== node && BOX_SKIP.test(o.name)) return;
    if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _pb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(_pb); }
    for (const c of o.children) walk(c); };
  walk(node); return box;
}
// a segmented glTF character -> { root, parts, pivots, empties } in the placeholder format, or { missing }
function fromGlb(src, required) {
  const root = new THREE.Group(); src.rotation.y = Math.PI / 2; root.add(src); root.updateMatrixWorld(true);   // +Z forward -> +x
  const nodes = {}; for (const n of required) { const o = src.getObjectByName(n); if (!o) return { missing: n }; nodes[n] = o; }
  const empties = {}; for (const n of EMPTIES) { const o = src.getObjectByName(n); if (o) empties[n] = { obj: o, pos: o.getWorldPosition(new THREE.Vector3()) }; }
  for (const n of required) root.attach(nodes[n]);   // flatten: every part directly under the figure, world transforms kept
  const parts = {}, pivots = {}, box = new THREE.Box3(), c = new THREE.Vector3(), s = new THREE.Vector3();
  for (const n of required) {
    const node = nodes[n]; root.updateMatrixWorld(true); const joint = node.getWorldPosition(new THREE.Vector3());
    partBox(node, box); if (box.isEmpty()) box.setFromCenterAndSize(joint, V(0.06, 0.06, 0.06)); box.getCenter(c); box.getSize(s);
    const pivot = new THREE.Group(); pivot.position.copy(joint); root.add(pivot);
    const proxy = new THREE.Group(); proxy.name = n; proxy.position.copy(c).sub(joint); pivot.add(proxy); root.updateMatrixWorld(true);
    proxy.userData.half = { x: Math.max(0.03, s.x / 2), y: Math.max(0.03, s.y / 2), z: Math.max(0.03, s.z / 2) }; proxy.userData.joint = joint.clone().sub(c);
    proxy.attach(node); parts[n] = proxy; pivots[n] = pivot;
  }
  root.updateMatrixWorld(true);
  return { root, parts, pivots, empties };
}

// ---- weapons: origin = the grip. Guns point +x (muzzle / eject in weapon space); melee points down the arm (-y) --------
// spec: Roster3D.weaponSpec() { file, melee, kind, pellets }
export function makeWeapon(mats, assets, spec) {
  const kind = spec.kind, melee = !!spec.melee, g = new THREE.Group(); g.name = "weapon_" + (spec.id || kind);
  let muzzle = null, eject = null, tip = null;
  const src = spec.file && assets.has(spec.file) ? assets.clone(spec.file) : null;
  if (src) { src.rotation.set(melee ? Math.PI / 2 : 0, melee ? 0 : Math.PI / 2, 0); g.add(src); g.updateMatrixWorld(true);
    const p = (n) => { const o = src.getObjectByName(n); return o ? g.worldToLocal(o.getWorldPosition(new THREE.Vector3())) : null; };
    muzzle = p("muzzle"); eject = p("eject"); tip = p("tip"); }
  else if (kind === "rifle") { g.add(at(part(mats, 0x3a3630, 0.9, 0.08, 0.07, "barrel"), 0.25, 0.02, 0)); g.add(at(part(mats, 0x6a4a2a, 0.22, 0.1, 0.08, "stock"), -0.3, 0, 0)); }
  else if (kind === "shotgun") { g.add(at(part(mats, 0x2e2c28, 0.62, 0.09, 0.09, "barrel"), 0.2, 0.03, 0)); g.add(at(part(mats, 0x5a3e24, 0.2, 0.11, 0.08, "stock"), -0.2, 0, 0)); }
  else if (kind === "pistol") { g.add(at(part(mats, 0x26262a, 0.22, 0.07, 0.04, "slide"), 0.1, 0.06, 0)); g.add(at(part(mats, 0x3a3020, 0.06, 0.12, 0.04, "grip"), 0, 0, 0)); }
  else { g.add(at(part(mats, 0x3a2a1a, 0.04, 0.13, 0.04, "handle"), 0, 0, 0)); g.add(at(part(mats, 0x8a8478, 0.03, 0.42, 0.09, "blade"), 0, -0.27, 0.02)); }
  const len = { rifle: 0.7, shotgun: 0.51, pistol: 0.21 }[kind] || 0;
  g.userData = { kind, melee, file: src ? spec.file : null, pellets: spec.pellets || 1, muzzle: muzzle || V(len, 0.03, 0), eject: eject || V(melee ? 0 : 0.02, 0.07, 0.06), tip,
    half: melee ? { x: 0.03, y: 0.25, z: 0.05 } : { x: Math.max(0.12, len * 0.6), y: 0.05, z: 0.04 } };
  g.traverse((o) => { if (o.isMesh) o.castShadow = !mats.LOW; });
  return g;
}
function makeShield(mats, assets, file) {
  const g = new THREE.Group(); g.name = "shield"; const src = file && assets.has(file) ? assets.clone(file) : null;
  if (src) { src.rotation.y = Math.PI / 2; g.add(src); } else g.add(at(part(mats, 0x5a5a50, 0.05, 0.6, 0.45, "shield"), 0.05, 0, 0));
  g.userData = { kind: "shield", file: src ? file : null, half: { x: 0.04, y: 0.3, z: 0.24 } }; return g;
}

// ---- humans. look: { file, gear: [{file, hides}], tint, main, backup, off, shield } (weapon specs / shield file) -----------
export function makeHuman(mats, assets, look) {
  let g, parts, pivots, E = {};
  let src = look.file && assets.has(look.file) ? assets.clone(look.file) : null;
  if (src && look.gear) for (const x of look.gear) { const gs = assets.clone(x.file); if (gs) mergeGear(src, gs, x.hides); }
  const glb = src ? fromGlb(src, PLANS.human) : null;
  if (glb && glb.missing) assets.note(look.file, "missing node " + glb.missing);
  if (glb && !glb.missing) { g = glb.root; parts = glb.parts; pivots = glb.pivots; E = glb.empties; tintMaterials(g, look.tint); }
  else {
    g = new THREE.Group(); parts = {}; pivots = {};
    const tint = look.tint != null ? look.tint : look.side === 1 ? 0x7a4a34 : 0x5a6a48;
    for (const [n, z] of [["leg_l", -0.11], ["leg_r", 0.11]]) { const h = hung(mats, 0x45463a, [0.17, 0.8, 0.17], V(0, 0.82, z), n); g.add(h.pivot); parts[n] = h.mesh; pivots[n] = h.pivot; }
    const torso = part(mats, tint, 0.28, 0.62, 0.46, "torso", V(0, -0.31, 0)); torso.position.set(0, 1.13, 0); g.add(torso); parts.torso = torso;
    const head = part(mats, 0xc8a07a, 0.26, 0.26, 0.26, "head", V(0, -0.13, 0)); head.position.set(0.02, 1.6, 0); g.add(head); parts.head = head;
    const eye = part(mats, 0x1a1a14, 0.02, 0.04, 0.16, "eyes"); eye.position.set(0.13, 0.02, 0); head.add(eye);
    for (const [n, z] of [["arm_l", -0.31], ["arm_r", 0.31]]) { const h = hung(mats, tint, [0.13, 0.6, 0.13], V(0, 1.4, z), n); g.add(h.pivot); parts[n] = h.mesh; pivots[n] = h.pivot; }
  }
  const handW = E.hand_r ? E.hand_r.pos : null, handLW = E.hand_l ? E.hand_l.pos : null, backW = E.back ? E.back.pos : null;
  g.updateMatrixWorld(true);
  const toArm = (arm, w, dflt) => (w ? pivots[arm].worldToLocal(g.localToWorld(w.clone())) : dflt);
  const handR = toArm("arm_r", handW, V(0, -0.58, 0)), handL = toArm("arm_l", handLW, V(0, -0.58, 0));
  const meleeTilt = handW ? 2.0 : 0;   // Smudge's arms are baked forward: tilt the blade up-forward out of the fist
  const mk = (s) => (s ? makeWeapon(mats, assets, s) : null);
  const main = mk(look.main), backup = mk(look.backup), off = mk(look.off), shield = look.shield ? makeShield(mats, assets, look.shield) : null;
  const grip = handW ? handW.clone() : GRIP.clone();
  for (const w of [main, backup]) { if (!w) continue; if (w.userData.melee) { pivots.arm_r.add(w); } else g.add(w); }
  if (off) { off.position.copy(handL); if (off.userData.melee) off.rotation.z = meleeTilt; pivots.arm_l.add(off); }
  if (shield) { shield.position.copy(handL); pivots.arm_l.add(shield); }
  g.userData = { kind: "human", plan: "human", parts, pivots, main, backup, off, shield, active: main, grip, handR, meleeTilt, back: backW, height: HEIGHT.human, chop: 0, recoil: 0, lunge: 0, draw: 0, glb: !!(glb && !glb.missing),
    file: look.file, gear: look.gear || [], tint: look.tint != null ? look.tint : null };   // file / gear / tint: the instanced path (instancing.js)
  setHeld(g, 0);
  return g;
}
// which set is up: 0 = the main set in hand (backup slung), 1 = the backup set in hand (main slung)
export function setHeld(g, idx) {
  const U = g.userData, P = U.pivots; if (U.kind !== "human") return;
  const up = idx === 1 && U.backup ? U.backup : U.main, down = up === U.main ? U.backup : U.main;
  U.active = up; U.draw = 1;
  const hold = (w) => { if (!w) return; w.visible = true;
    if (w.userData.melee) { if (w.parent !== P.arm_r) P.arm_r.add(w); w.position.copy(U.handR); w.rotation.set(0, 0, U.meleeTilt); }
    else { if (w.parent !== g) g.add(w); w.position.copy(U.grip); w.rotation.set(0, 0, 0); } };
  const sling = (w) => { if (!w) return; if (w.parent !== g) g.add(w);
    if (U.back) { w.position.copy(U.back).add(V(-0.08, 0, 0)); } else w.position.set(-0.2, 1.28, 0);
    w.rotation.set(0, 0, w.userData.melee ? -0.4 : 0.9); };
  hold(up); sling(down);
  if (U.off) U.off.visible = up === U.main;   // dual wield is the main set's
  if (U.shield) U.shield.visible = up === U.main;
  const melee = !up || up.userData.melee;
  U.armPose = U.glb ? (melee ? { l: [-0.9, 0], r: [0.7, 0] } : { l: [0, 0], r: [0, 0] }) : (melee ? { l: [0.2, 0], r: [2.3, 0] } : { l: [1.25, -0.35], r: [1.05, 0] });
  if (U.off || (U.shield && U.shield.visible)) U.armPose.l = U.glb ? [0.5, 0] : [1.1, 0];   // the off hand forward
  P.arm_l.rotation.set(U.armPose.l[1], 0, U.armPose.l[0]); P.arm_r.rotation.set(U.armPose.r[1], 0, U.armPose.r[0]);
}

// ---- quadrupeds (goat, hound, spitter, maw, the pet goat): file = Smudge's model ----------------------------------------
export function makeQuad(mats, assets, file, idx) {
  const glb = file && assets.has(file) ? fromGlb(assets.clone(file), PLANS.quad) : null;
  if (glb && glb.missing) assets.note(file, "missing node " + glb.missing);
  if (glb && !glb.missing) { const bb = new THREE.Box3().setFromObject(glb.root);
    glb.root.userData = { kind: "quad", plan: "quad", parts: glb.parts, pivots: glb.pivots, empties: glb.empties, height: Math.max(0.8, bb.max.y), lunge: 0, glb: true, file }; return glb.root; }
  const c = GOAT_COATS[(idx || 0) % GOAT_COATS.length];
  const g = new THREE.Group(), parts = {}, pivots = {};
  const body = part(mats, c.coat, 0.92, 0.44, 0.38, "body"); body.position.set(0, 0.74, 0); g.add(body); parts.body = body;
  const head = part(mats, c.coat, 0.32, 0.26, 0.22, "head", V(-0.14, -0.04, 0)); head.position.set(0.58, 1.0, 0); g.add(head); parts.head = head;
  for (const [n, x, z] of [["leg_fl", 0.33, -0.12], ["leg_fr", 0.33, 0.12], ["leg_bl", -0.33, -0.12], ["leg_br", -0.33, 0.12]]) {
    const h = hung(mats, c.dark, [0.1, 0.55, 0.1], V(x, 0.55, z), n); g.add(h.pivot); parts[n] = h.mesh; pivots[n] = h.pivot; }
  const tail = part(mats, c.coat, 0.12, 0.08, 0.06, "tail", V(0.05, 0, 0)); tail.position.set(-0.52, 0.92, 0); tail.rotation.z = 0.6; g.add(tail); parts.tail = tail;
  g.userData = { kind: "quad", plan: "quad", parts, pivots, height: HEIGHT.quad, lunge: 0 };
  return g;
}
// ---- machines: crawler (hexapod), drone (hover: body at 1.6 m), sentry (turret: yaw pivot at the ring) ---------------------
export function makeMachine(mats, assets, plan, file) {
  const glb = file && assets.has(file) ? fromGlb(assets.clone(file), PLANS[plan]) : null;
  if (glb && glb.missing) assets.note(file, "missing node " + glb.missing);
  if (glb && !glb.missing) {
    // hover: spin the blade_* discs (each inside its rotor_* arm, origin on the spin axis), never the rotor arms. Parts are
    // found by name (a one-primitive part loads as a Mesh carrying the node name)
    const spinners = plan === "hover" ? SPINNERS.map((n) => glb.root.getObjectByName(n)).filter(Boolean) : [];
    glb.root.userData = { kind: plan, plan, parts: glb.parts, pivots: glb.pivots, empties: glb.empties, height: HEIGHT[plan], lunge: 0, glb: true, spin: 0, spinners, file }; return glb.root; }
  const g = new THREE.Group(), parts = {}, pivots = {}, col = 0xd8d0b8;
  const add = (n, sx, sy, sz, x, y, z, c) => { const p = new THREE.Group(); p.position.set(x, y, z); const m = part(mats, c || col, sx, sy, sz, n); p.add(m); g.add(p); parts[n] = m; pivots[n] = p; };
  if (plan === "hover") { add("body", 0.5, 0.2, 0.5, 0, 1.6, 0); add("head", 0.16, 0.16, 0.16, 0.24, 1.52, 0, 0x2a2a28); for (const [n, x, z] of [["rotor_fl", 0.38, -0.38], ["rotor_fr", 0.38, 0.38], ["rotor_bl", -0.38, -0.38], ["rotor_br", -0.38, 0.38]]) add(n, 0.3, 0.03, 0.06, x, 1.68, z, 0x3a3a38); }
  else if (plan === "turret") { add("base", 0.7, 0.9, 0.7, 0, 0.45, 0, 0x6a6a60); add("gun", 0.9, 0.25, 0.3, 0.1, 1.0, 0); }
  else { add("body", 0.7, 0.32, 0.6, 0, 0.42, 0); add("head", 0.2, 0.14, 0.2, 0, 0.62, 0, 0xc03020); for (const [n, x, z] of [["leg_fl", 0.3, -0.36], ["leg_fr", 0.3, 0.36], ["leg_ml", 0, -0.4], ["leg_mr", 0, 0.4], ["leg_bl", -0.3, -0.36], ["leg_br", -0.3, 0.36]]) add(n, 0.06, 0.42, 0.06, x, 0.22, z, 0x3a3a38); }
  g.userData = { kind: plan, plan, parts, pivots, height: HEIGHT[plan], lunge: 0, spin: 0, spinners: plan === "hover" ? ["rotor_fl", "rotor_fr", "rotor_bl", "rotor_br"].map((n) => parts[n]) : [] };
  return g;
}
// transparent copies of a figure's materials (Unseen Stalkers, rival ghosts). ghost: a cyan emissive tint
export function setOpacity(fig, a, ghost) {
  const U = fig.userData; if (U.opacity === a && U.ghost === !!ghost) return; U.opacity = a; U.ghost = !!ghost;
  if (!U.matCopies) U.matCopies = new Map();
  fig.traverse((o) => { if (!o.isMesh) return; const one = (m) => { let c = U.matCopies.get(m); if (!c && m && [...U.matCopies.values()].includes(m)) c = m; if (!c) { c = m.clone(); U.matCopies.set(m, c); }
      c.transparent = a < 1; c.opacity = a; c.depthWrite = a >= 1; if (c.emissive && !SELF_LIT(m)) c.emissive.setHex(ghost ? 0x1c5a68 : 0x000000); return c; };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
}

// ---- per-frame pose: walk swing, recoil, chop, lunge, the swap "draw", rotors / legs / the sentry's gun -------------------
export function animate(fig, rdt, moving, walk, aim) {
  const U = fig.userData, P = U.pivots, sw = moving ? Math.sin(walk) * 0.5 : 0, bob = moving ? Math.abs(Math.sin(walk)) : 0;
  const fwd = V(Math.cos(fig.rotation.y), 0, -Math.sin(fig.rotation.y));
  if (U.kind === "human") {
    P.leg_l.rotation.z = sw; P.leg_r.rotation.z = -sw; fig.position.y += bob * 0.04;
    U.recoil = Math.max(0, U.recoil - rdt * 8); U.chop = Math.max(0, U.chop - rdt * 5); U.draw = Math.max(0, U.draw - rdt * 3);
    if (U.active && !U.active.userData.melee) U.active.position.x = U.grip.x - U.recoil * 0.08;
    const pose = U.armPose, chop = U.chop > 0 ? Math.sin((1 - U.chop) * Math.PI) : 0;
    P.arm_r.rotation.z = pose.r[0] - chop * 1.8 + U.draw * 0.8; P.arm_l.rotation.z = pose.l[0];
    if (U.active && U.active.userData.melee && U.chop > 0) fig.position.addScaledVector(fwd, chop * 0.12);
  } else if (U.kind === "quad") {
    P.leg_fl.rotation.z = sw * 0.8; P.leg_br.rotation.z = sw * 0.8; P.leg_fr.rotation.z = -sw * 0.8; P.leg_bl.rotation.z = -sw * 0.8; fig.position.y += bob * 0.05;
    U.lunge = Math.max(0, U.lunge - rdt * 4); const l = U.lunge > 0 ? Math.sin((1 - U.lunge) * Math.PI) : 0;
    fig.position.addScaledVector(fwd, l * 0.35); if (U.parts.head) U.parts.head.rotation.z = -l * 0.5;
  } else if (U.kind === "hexapod") {
    const legs = ["leg_fl", "leg_mr", "leg_bl"], legs2 = ["leg_fr", "leg_ml", "leg_br"];
    for (const n of legs) if (P[n]) P[n].rotation.z = sw * 0.7; for (const n of legs2) if (P[n]) P[n].rotation.z = -sw * 0.7;
    U.lunge = Math.max(0, U.lunge - rdt * 4); fig.position.addScaledVector(fwd, (U.lunge > 0 ? Math.sin((1 - U.lunge) * Math.PI) : 0) * 0.25);
  } else if (U.kind === "hover") {
    U.spin += rdt * 40; for (const o of U.spinners || []) o.rotation.y = U.spin * (/l$/.test(o.name) ? 1 : -1);
    U.t = (U.t || 0) + rdt; fig.position.y += Math.sin(U.t * 2.4) * 0.06; if (P.body) P.body.rotation.z = moving ? -0.12 : 0;
    U.recoil = Math.max(0, (U.recoil || 0) - rdt * 8);
  } else if (U.kind === "turret") {
    U.recoil = Math.max(0, (U.recoil || 0) - rdt * 8);
    if (P.gun && aim != null) { let d = aim - P.gun.rotation.y; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; P.gun.rotation.y += d * Math.min(1, rdt * 8); }
  }
}

// ---- ragdolls -------------------------------------------------------------------------------------------------------------
const MASS = { torso: 14, head: 4, arm_l: 3, arm_r: 3, leg_l: 5, leg_r: 5, body: 22, leg_fl: 1.6, leg_fr: 1.6, leg_bl: 1.6, leg_br: 1.6, leg_ml: 1.6, leg_mr: 1.6, tail: 0.4, rotor_fl: 0.6, rotor_fr: 0.6, rotor_bl: 0.6, rotor_br: 0.6, base: 30, gun: 8 };
const JOINTS = {   // [parent, child, cone angle, twist]; the pivot is the child's joint (part.userData.joint)
  human: [["torso", "head", 0.6, 0.4], ["torso", "arm_l", 1.2, 0.5], ["torso", "arm_r", 1.2, 0.5], ["torso", "leg_l", 0.9, 0.3], ["torso", "leg_r", 0.9, 0.3]],
  quad: [["body", "head", 0.6, 0.4], ["body", "leg_fl", 0.8, 0.3], ["body", "leg_fr", 0.8, 0.3], ["body", "leg_bl", 0.8, 0.3], ["body", "leg_br", 0.8, 0.3], ["body", "tail", 0.7, 0.3]],
  hexapod: [["body", "head", 0.4, 0.3], ["body", "leg_fl", 0.8, 0.3], ["body", "leg_fr", 0.8, 0.3], ["body", "leg_ml", 0.8, 0.3], ["body", "leg_mr", 0.8, 0.3], ["body", "leg_bl", 0.8, 0.3], ["body", "leg_br", 0.8, 0.3]],
  hover: [["body", "head", 0.4, 0.3]],          // the rotors fly off as debris
  turret: [["base", "gun", 0.7, 0.4]]
};
export const GORE_PARTS = { human: ["arm_l", "arm_r", "leg_l", "head"], quad: ["head", "leg_fl", "leg_bl", "leg_fr"], hexapod: ["leg_fl", "leg_mr", "head"], hover: ["head"], turret: ["gun"] };
export const MAIN_PART = { human: "torso", quad: "body", hexapod: "body", hover: "body", turret: "base" };
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
// a part's collision box in world size: an elite (x1.15) or a pet (x0.72) keeps its figure's scale, and so must its box
const worldHalf = (m, h) => { m.getWorldScale(_s); return { x: h.x * Math.abs(_s.x), y: h.y * Math.abs(_s.y), z: h.z * Math.abs(_s.z) }; };

// Turn a figure into a ragdoll. dir: the killing hit's direction (unit, world xz). detach: a part to pop off (gore) or null.
// Returns { links: [{mesh, body, name}], detached }. Part meshes are re-parented to the scene; the weapons drop as debris.
export function ragdoll(phys, scene, fig, dir, vel, detach, rng) {
  const ud = fig.userData, links = [], bodies = {}, plan = ud.plan || ud.kind;
  fig.updateMatrixWorld(true);
  for (const name in ud.parts) {
    const m = ud.parts[name], h = worldHalf(m, m.userData.half); m.getWorldPosition(_p); m.getWorldQuaternion(_q);
    const b = phys.addBox(h.x, h.y, h.z, MASS[name] || 3, _p, _q, { group: GROUP.RAGDOLL, damping: 0.12, angDamping: 0.35, sleepSpeed: 0.2 });
    b.velocity.set(vel.x, vel.y, vel.z); bodies[name] = b;
    scene.attach(m); links.push({ mesh: m, body: b, name });
  }
  const main = MAIN_PART[plan], push = plan === "human" ? 3.6 : 2.6;
  for (const name in bodies) { const b = bodies[name], k = name === main ? 1 : 0.7;
    b.velocity.x += dir.x * push * k; b.velocity.z += dir.z * push * k; b.velocity.y += 1.2 * k;
    b.angularVelocity.set((rng() - 0.5) * 3, (rng() - 0.5) * 3, (rng() - 0.5) * 3); }
  let detached = null;
  for (const [pa, ch, ang, tw] of JOINTS[plan] || []) {
    if (!bodies[pa] || !bodies[ch]) continue;
    if (ch === detach) { const b = bodies[ch]; b.velocity.x += dir.x * 4 + (rng() - 0.5) * 2; b.velocity.y += 3.5; b.velocity.z += dir.z * 4 + (rng() - 0.5) * 2;
      b.angularVelocity.set((rng() - 0.5) * 18, (rng() - 0.5) * 18, (rng() - 0.5) * 18); detached = links.find((l) => l.name === ch); continue; }
    const cm = ud.parts[ch]; cm.updateMatrixWorld(true);
    const pivotW = cm.userData.joint.clone().applyMatrix4(cm.matrixWorld), childC = cm.getWorldPosition(new THREE.Vector3());
    const axis = childC.clone().sub(pivotW); if (axis.lengthSq() < 1e-6) axis.set(0, -1, 0); axis.normalize();
    phys.joint(bodies[pa], bodies[ch], pivotW, axis, ang, tw);
  }
  for (const w of [ud.main, ud.backup, ud.off, ud.shield]) { if (!w || !w.visible || !w.parent) continue;   // the weapons in hand / on the back drop
    w.getWorldPosition(_p); w.getWorldQuaternion(_q); const h = worldHalf(w, w.userData.half); scene.attach(w);
    const b = phys.addBox(h.x, h.y, h.z, 2.5, _p, _q, { group: GROUP.DEBRIS }); b.velocity.set(vel.x + dir.x * 1.5, 1.5, vel.z + dir.z * 1.5); b.angularVelocity.set(rng() * 4, rng() * 4, rng() * 4);
    links.push({ mesh: w, body: b, name: "weapon" }); }
  fig.visible = false;
  return { links, detached };
}
