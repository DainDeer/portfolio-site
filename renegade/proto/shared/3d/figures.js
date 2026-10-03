// Battle 3D prototypes (shared): the units (Smudge's segmented glTF models when present, box placeholders otherwise), their
// weapons (a main gun + a melee backup they swap to up close), procedural walk / recoil / chop / lunge, and ragdolls.
// Figures face +x (the sim's facing 0). Part names = proto-3d-asset-contract.md §3. Goats (Megan, Oct 3): totally normal
// goats, just slightly off: the ONLY tell is a faint warm glint in the eyes.
import * as THREE from "three";
import { GROUP } from "./physics.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const HUMAN_PARTS = ["torso", "head", "arm_l", "arm_r", "leg_l", "leg_r"];
export const GOAT_PARTS = ["body", "head", "leg_fl", "leg_fr", "leg_bl", "leg_br", "tail"];
const GOAT_COATS = [{ coat: 0xb89a6a, dark: 0x6a5338 }, { coat: 0xd6cdbb, dark: 0x8a7c66 }, { coat: 0x7a5a3c, dark: 0x463422 }, { coat: 0x9a8a72, dark: 0x5a4c3a }];
const GRIP = V(0.2, 1.22, 0.14);   // two-handed gun grip on the placeholder human (Smudge's figures carry hand_r)

function part(mats, color, sx, sy, sz, name, joint) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mats.solid(color));
  m.name = name; m.userData.half = { x: sx / 2, y: sy / 2, z: sz / 2 }; m.userData.joint = joint || V(0, 0, 0); m.castShadow = true; m.receiveShadow = true;
  return m;
}
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
function hung(mats, color, size, pivot, name) {   // a limb hanging from its joint: rotate the pivot to swing it
  const p = new THREE.Group(); p.position.copy(pivot);
  const m = part(mats, color, size[0], size[1], size[2], name, V(0, size[1] / 2, 0)); m.position.set(0, -size[1] / 2, 0); p.add(m);
  return { pivot: p, mesh: m };
}
function tintMaterials(root, color) {   // Smudge's painted colour, pulled ~45% toward the unit's tint (the squad reads apart, her palette stays)
  const t = new THREE.Color(color);
  root.traverse((o) => { if (!o.isMesh) return; const one = (m) => { if (m && m.name === "tint") { const c = m.clone(); c.color.lerp(t, 0.45); return c; } return m; };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
}

// a segmented glTF character -> { root, parts, pivots } in the placeholder format, or { missing } (contract §3)
function fromGlb(src, required) {
  const root = new THREE.Group(); src.rotation.y = Math.PI / 2; root.add(src); root.updateMatrixWorld(true);   // +Z forward -> +x
  const nodes = {}; for (const n of required) { const o = src.getObjectByName(n); if (!o) return { missing: n }; nodes[n] = o; }
  const hand = src.getObjectByName("hand_r");   // before the parts move out of src (it rides arm_r > arm_r_lower; Smudge's catch)
  for (const n of required) root.attach(nodes[n]);   // flatten: every part directly under the figure, world transforms kept
  const parts = {}, pivots = {}, box = new THREE.Box3(), c = new THREE.Vector3(), s = new THREE.Vector3();
  for (const n of required) {
    const node = nodes[n]; root.updateMatrixWorld(true); const joint = node.getWorldPosition(new THREE.Vector3());
    box.setFromObject(node); if (box.isEmpty()) box.setFromCenterAndSize(joint, V(0.06, 0.06, 0.06)); box.getCenter(c); box.getSize(s);
    const pivot = new THREE.Group(); pivot.position.copy(joint); root.add(pivot);
    const proxy = new THREE.Group(); proxy.name = n; proxy.position.copy(c).sub(joint); pivot.add(proxy); root.updateMatrixWorld(true);
    proxy.userData.half = { x: Math.max(0.03, s.x / 2), y: Math.max(0.03, s.y / 2), z: Math.max(0.03, s.z / 2) }; proxy.userData.joint = joint.clone().sub(c);
    proxy.attach(node); parts[n] = proxy; pivots[n] = pivot;
  }
  root.updateMatrixWorld(true);
  return { root, parts, pivots, hand: hand ? hand.getWorldPosition(new THREE.Vector3()) : null };
}

// ---- weapons: origin = the grip. Guns point +x (muzzle / eject in weapon space); melee points down the arm (-y) --------
const WEAPON_GLB = { rifle: ["rifle.glb"], shotgun: ["shotgun.glb"], pistol: ["pistol.glb"], machete: ["machete.glb", "weapon_hatchet.glb"] };
export function makeWeapon(mats, assets, kind) {
  const g = new THREE.Group(); g.name = "weapon_" + kind; const melee = kind === "machete";
  const file = (WEAPON_GLB[kind] || []).find((f) => assets && assets.has(f));
  let muzzle = null, eject = null;
  if (file) { const src = assets.clone(file); src.rotation.set(melee ? Math.PI / 2 : 0, melee ? 0 : Math.PI / 2, 0); g.add(src); g.updateMatrixWorld(true);
    const m = src.getObjectByName("muzzle"), e = src.getObjectByName("eject");
    muzzle = m ? g.worldToLocal(m.getWorldPosition(new THREE.Vector3())) : null; eject = e ? g.worldToLocal(e.getWorldPosition(new THREE.Vector3())) : null; }
  else if (kind === "rifle") { g.add(at(part(mats, 0x3a3630, 0.9, 0.08, 0.07, "barrel"), 0.25, 0.02, 0)); const st = part(mats, 0x6a4a2a, 0.22, 0.1, 0.08, "stock"); st.position.set(-0.3, 0, 0); g.add(st); }
  else if (kind === "shotgun") { g.add(at(part(mats, 0x2e2c28, 0.62, 0.09, 0.09, "barrel"), 0.2, 0.03, 0)); const st = part(mats, 0x5a3e24, 0.2, 0.11, 0.08, "stock"); st.position.set(-0.2, 0, 0); g.add(st);
    const pump = part(mats, 0x5a3e24, 0.16, 0.07, 0.1, "pump"); pump.position.set(0.25, -0.04, 0); g.add(pump); }
  else if (kind === "pistol") { g.add(at(part(mats, 0x26262a, 0.22, 0.07, 0.04, "slide"), 0.1, 0.06, 0)); g.add(at(part(mats, 0x3a3020, 0.06, 0.12, 0.04, "grip"), 0, 0, 0)); }
  else if (melee) { g.add(at(part(mats, 0x3a2a1a, 0.04, 0.13, 0.04, "handle"), 0, 0, 0)); g.add(at(part(mats, 0x8a8478, 0.03, 0.42, 0.09, "blade"), 0, -0.27, 0.02)); }
  const len = { rifle: 0.7, shotgun: 0.51, pistol: 0.21 }[kind] || 0;
  g.userData = { kind, melee, muzzle: muzzle || V(len, 0.03, 0), eject: eject || V(melee ? 0 : 0.02, 0.07, 0.06), half: melee ? { x: 0.03, y: 0.25, z: 0.05 } : { x: Math.max(0.12, len * 0.6), y: 0.05, z: 0.04 } };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---- humans: Grunts / troops / scavengers. look: { glb, tint, trousers, skin, hat, pack } ------------------------------------
export function makeHuman(mats, assets, look, mainKind, backupKind) {
  let g, parts, pivots, handW = null;
  const glb = look.glb && assets && assets.has(look.glb) ? fromGlb(assets.clone(look.glb), HUMAN_PARTS) : null;
  if (glb && glb.missing) assets.note(look.glb, "missing node " + glb.missing);
  if (glb && !glb.missing) { g = glb.root; parts = glb.parts; pivots = glb.pivots; handW = glb.hand; tintMaterials(g, look.tint); }
  else {
    g = new THREE.Group(); parts = {}; pivots = {};
    for (const [n, z] of [["leg_l", -0.11], ["leg_r", 0.11]]) { const h = hung(mats, look.trousers, [0.17, 0.8, 0.17], V(0, 0.82, z), n); g.add(h.pivot); parts[n] = h.mesh; pivots[n] = h.pivot; }
    const torso = part(mats, look.tint, 0.28, 0.62, 0.46, "torso", V(0, -0.31, 0)); torso.position.set(0, 1.13, 0); g.add(torso); parts.torso = torso;
    if (look.pack) { const pack = part(mats, 0x5a4a2a, 0.16, 0.42, 0.34, "pack"); pack.position.set(-0.21, 0.02, 0); torso.add(pack); }
    const head = part(mats, look.skin, 0.26, 0.26, 0.26, "head", V(0, -0.13, 0)); head.position.set(0.02, 1.6, 0); g.add(head); parts.head = head;
    if (look.hat === "cap") { const cap = part(mats, 0x3e4430, 0.3, 0.08, 0.3, "cap"); cap.position.set(-0.01, 0.15, 0); head.add(cap); }
    else if (look.hat === "hood") { const hood = part(mats, look.hatColor || 0x3a3a3e, 0.3, 0.2, 0.3, "hood"); hood.position.set(-0.03, 0.06, 0); head.add(hood); }
    else if (look.hat === "bandana") { const b = part(mats, look.hatColor || 0x7a3a2a, 0.04, 0.1, 0.27, "bandana"); b.position.set(0.12, -0.06, 0); head.add(b); }
    else if (look.hat === "helmet") { const h = part(mats, look.hatColor || 0x4a5040, 0.32, 0.12, 0.32, "helmet"); h.position.set(0, 0.14, 0); head.add(h); }
    const eye = part(mats, 0x1a1a14, 0.02, 0.04, 0.16, "eyes"); eye.position.set(0.13, 0.02, 0); head.add(eye);
    for (const [n, z] of [["arm_l", -0.31], ["arm_r", 0.31]]) { const h = hung(mats, look.tint, [0.13, 0.6, 0.13], V(0, 1.4, z), n); g.add(h.pivot); parts[n] = h.mesh; pivots[n] = h.pivot; }
  }
  const main = makeWeapon(mats, assets, mainKind), backup = backupKind ? makeWeapon(mats, assets, backupKind) : null;
  // the gun at the grip (or Smudge's hand_r); the melee backup in the right hand, extending the arm
  const grip = handW ? handW.clone() : GRIP.clone(), ap = pivots.arm_r; g.updateMatrixWorld(true);   // Smudge's hand_r = the gun grip (barrel +x, no rotation)
  const hand = handW ? ap.worldToLocal(g.localToWorld(handW.clone())) : V(0, -0.58, 0);
  const meleeTilt = handW ? 2.0 : 0;   // Smudge's arms are baked forward: tilt the blade up-forward out of the fist (it hangs down the arm on the placeholder)
  if (main.userData.melee) { main.position.copy(hand); main.rotation.z = meleeTilt; ap.add(main); } else { main.position.copy(grip); g.add(main); }   // a melee main (the rusher) rides the arm
  if (backup) { backup.position.copy(hand); backup.rotation.z = meleeTilt; ap.add(backup); backup.visible = false; }
  g.userData = { kind: "human", parts, pivots, main, backup, active: main, grip, height: 1.75, chop: 0, recoil: 0, lunge: 0, draw: 0, glb: !!(glb && !glb.missing) };
  setHeld(g, "main");
  return g;
}
// which hand is up: "main" (the gun, two-handed) or "backup" (the melee weapon; the gun is slung across the back)
export function setHeld(g, which) {
  const U = g.userData, P = U.pivots; if (U.kind !== "human") return;
  const back = which === "backup" && U.backup;
  U.active = back ? U.backup : U.main; U.draw = 1;
  if (U.backup) U.backup.visible = !!back;
  const melee = back || U.main.userData.melee;
  if (!U.main.userData.melee) { if (back) { U.main.position.set(-0.2, 1.28, 0); U.main.rotation.set(0, 0, 0.9); }   // slung across the back
    else { U.main.position.copy(U.grip); U.main.rotation.set(0, 0, 0); } }
  // [rot z (+ = forward), rot x] on the arm pivots. Smudge's arms come baked in the two-handed hold, so they rest at 0
  // (gun) and only move by a delta: the right arm up for a melee stance, the left arm dropped back to the side
  U.armPose = U.glb ? (melee ? { l: [-0.9, 0], r: [0.7, 0] } : { l: [0, 0], r: [0, 0] }) : (melee ? { l: [0.2, 0], r: [2.3, 0] } : { l: [1.25, -0.35], r: [1.05, 0] });
  P.arm_l.rotation.set(U.armPose.l[1], 0, U.armPose.l[0]); P.arm_r.rotation.set(U.armPose.r[1], 0, U.armPose.r[0]);
}

// ---- goats ----------------------------------------------------------------------------------------------------------------
export function makeGoat(mats, assets, idx) {
  const c = GOAT_COATS[idx % GOAT_COATS.length];
  const glb = assets && assets.has("goat.glb") ? fromGlb(assets.clone("goat.glb"), GOAT_PARTS) : null;
  if (glb && glb.missing) assets.note("goat.glb", "missing node " + glb.missing);
  if (glb && !glb.missing) { glb.root.userData = { kind: "goat", parts: glb.parts, pivots: glb.pivots, height: 1.1, lunge: 0, glb: true }; return glb.root; }
  const g = new THREE.Group(), parts = {}, pivots = {};
  const body = part(mats, c.coat, 0.92, 0.44, 0.38, "body"); body.position.set(0, 0.74, 0); g.add(body); parts.body = body;
  const head = part(mats, c.coat, 0.32, 0.26, 0.22, "head", V(-0.14, -0.04, 0)); head.position.set(0.58, 1.0, 0); g.add(head); parts.head = head;
  const snout = part(mats, c.coat, 0.14, 0.14, 0.16, "snout"); snout.position.set(0.18, -0.05, 0); head.add(snout);
  const beard = part(mats, c.dark, 0.06, 0.14, 0.06, "beard"); beard.position.set(0.18, -0.17, 0); head.add(beard);
  for (const z of [-0.07, 0.07]) { const horn = part(mats, 0x8a7a5a, 0.18, 0.05, 0.05, "horn"); horn.position.set(-0.12, 0.17, z); horn.rotation.z = 0.5; head.add(horn);
    const ear = part(mats, c.dark, 0.08, 0.04, 0.12, "ear"); ear.position.set(-0.06, 0.06, z * 2.6); head.add(ear); }
  // the only tell: a faint warm glint in otherwise ordinary goat eyes (tiny, barely emissive)
  for (const z of [-0.112, 0.112]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.01), mats.eye()); e.position.set(0.05, 0.04, z); e.name = "eye"; head.add(e); }
  for (const [n, x, z] of [["leg_fl", 0.33, -0.12], ["leg_fr", 0.33, 0.12], ["leg_bl", -0.33, -0.12], ["leg_br", -0.33, 0.12]]) {
    const h = hung(mats, c.dark, [0.1, 0.55, 0.1], V(x, 0.55, z), n); g.add(h.pivot); parts[n] = h.mesh; pivots[n] = h.pivot; }
  const tail = part(mats, c.coat, 0.12, 0.08, 0.06, "tail", V(0.05, 0, 0)); tail.position.set(-0.52, 0.92, 0); tail.rotation.z = 0.6; g.add(tail); parts.tail = tail;
  g.userData = { kind: "goat", parts, pivots, height: 1.1, lunge: 0 };
  return g;
}

// ---- per-frame pose: walk swing, recoil, melee chop, goat lunge, the swap "draw" ----------------------------------------
export function animate(fig, rdt, moving, walk) {
  const U = fig.userData, P = U.pivots, sw = moving ? Math.sin(walk) * 0.5 : 0, bob = moving ? Math.abs(Math.sin(walk)) : 0;
  if (U.kind === "human") {
    P.leg_l.rotation.z = sw; P.leg_r.rotation.z = -sw; fig.position.y += bob * 0.04;
    U.recoil = Math.max(0, U.recoil - rdt * 8); U.chop = Math.max(0, U.chop - rdt * 5); U.draw = Math.max(0, U.draw - rdt * 3);
    if (U.active === U.main && !U.main.userData.melee) U.main.position.x = U.grip.x - U.recoil * 0.08;
    const pose = U.armPose, chop = U.chop > 0 ? Math.sin((1 - U.chop) * Math.PI) : 0;   // up, then hard down
    P.arm_r.rotation.z = pose.r[0] - chop * 1.8 + U.draw * 0.8; P.arm_l.rotation.z = pose.l[0];
    if (U.active !== U.main && U.chop > 0) fig.position.addScaledVector(V(Math.cos(fig.rotation.y), 0, -Math.sin(fig.rotation.y)), chop * 0.12);
  } else {
    P.leg_fl.rotation.z = sw * 0.8; P.leg_br.rotation.z = sw * 0.8; P.leg_fr.rotation.z = -sw * 0.8; P.leg_bl.rotation.z = -sw * 0.8; fig.position.y += bob * 0.05;
    U.lunge = Math.max(0, U.lunge - rdt * 4); const l = U.lunge > 0 ? Math.sin((1 - U.lunge) * Math.PI) : 0;   // the headbutt: dip and drive
    fig.position.addScaledVector(V(Math.cos(fig.rotation.y), 0, -Math.sin(fig.rotation.y)), l * 0.35); P.head && (U.parts.head.rotation.z = -l * 0.5);
  }
}

// ---- ragdolls -------------------------------------------------------------------------------------------------------------
const MASS = { torso: 14, head: 4, arm_l: 3, arm_r: 3, leg_l: 5, leg_r: 5, body: 22, leg_fl: 1.6, leg_fr: 1.6, leg_bl: 1.6, leg_br: 1.6, tail: 0.4 };
const JOINTS = {   // [parent, child, cone angle, twist]; the pivot is the child's joint (part.userData.joint)
  human: [["torso", "head", 0.6, 0.4], ["torso", "arm_l", 1.2, 0.5], ["torso", "arm_r", 1.2, 0.5], ["torso", "leg_l", 0.9, 0.3], ["torso", "leg_r", 0.9, 0.3]],
  goat: [["body", "head", 0.6, 0.4], ["body", "leg_fl", 0.8, 0.3], ["body", "leg_fr", 0.8, 0.3], ["body", "leg_bl", 0.8, 0.3], ["body", "leg_br", 0.8, 0.3], ["body", "tail", 0.7, 0.3]]
};
export const GORE_PARTS = { human: ["arm_l", "arm_r", "leg_l", "head"], goat: ["head", "leg_fl", "leg_bl", "leg_fr"] };
const _p = new THREE.Vector3(), _q = new THREE.Quaternion();

// Turn a figure into a ragdoll. dir: the killing hit's direction (unit, world xz). detach: a part to pop off (gore) or null.
// Returns { links: [{mesh, body, name}], detached }. Part meshes are re-parented to the scene; the weapons drop as debris.
export function ragdoll(phys, scene, fig, dir, vel, detach, rng) {
  const ud = fig.userData, links = [], bodies = {};
  fig.updateMatrixWorld(true);
  for (const name in ud.parts) {
    const m = ud.parts[name], h = m.userData.half; m.getWorldPosition(_p); m.getWorldQuaternion(_q);
    const b = phys.addBox(h.x, h.y, h.z, MASS[name] || 3, _p, _q, { group: GROUP.RAGDOLL, damping: 0.12, angDamping: 0.35, sleepSpeed: 0.2 });
    b.velocity.set(vel.x, vel.y, vel.z); bodies[name] = b;
    scene.attach(m); links.push({ mesh: m, body: b, name });
  }
  const main = ud.kind === "human" ? "torso" : "body", push = ud.kind === "human" ? 3.6 : 2.6;
  for (const name in bodies) { const b = bodies[name], k = name === main ? 1 : 0.7;
    b.velocity.x += dir.x * push * k; b.velocity.z += dir.z * push * k; b.velocity.y += 1.2 * k;
    b.angularVelocity.set((rng() - 0.5) * 3, (rng() - 0.5) * 3, (rng() - 0.5) * 3); }
  let detached = null;
  for (const [pa, ch, ang, tw] of JOINTS[ud.kind]) {
    if (!bodies[pa] || !bodies[ch]) continue;
    if (ch === detach) { const b = bodies[ch]; b.velocity.x += dir.x * 4 + (rng() - 0.5) * 2; b.velocity.y += 3.5; b.velocity.z += dir.z * 4 + (rng() - 0.5) * 2;
      b.angularVelocity.set((rng() - 0.5) * 18, (rng() - 0.5) * 18, (rng() - 0.5) * 18); detached = links.find((l) => l.name === ch); continue; }
    const cm = ud.parts[ch]; cm.updateMatrixWorld(true);
    const pivotW = cm.userData.joint.clone().applyMatrix4(cm.matrixWorld), childC = cm.getWorldPosition(new THREE.Vector3());
    const axis = childC.clone().sub(pivotW); if (axis.lengthSq() < 1e-6) axis.set(0, -1, 0); axis.normalize();
    phys.joint(bodies[pa], bodies[ch], pivotW, axis, ang, tw);
  }
  for (const w of [ud.main, ud.backup]) { if (!w || !w.visible) continue;   // the weapons in hand / on the back drop
    w.getWorldPosition(_p); w.getWorldQuaternion(_q); scene.attach(w); const h = w.userData.half;
    const b = phys.addBox(h.x, h.y, h.z, 2.5, _p, _q, { group: GROUP.DEBRIS }); b.velocity.set(vel.x + dir.x * 1.5, 1.5, vel.z + dir.z * 1.5); b.angularVelocity.set(rng() * 4, rng() * 4, rng() * 4);
    links.push({ mesh: w, body: b, name: "weapon" }); }
  fig.visible = false;   // anything left on the figure (off-contract extras) goes with it
  return { links, detached };
}
