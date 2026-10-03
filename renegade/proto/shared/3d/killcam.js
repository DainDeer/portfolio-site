// Battle 3D prototypes (shared): cinematic kill shots (Megan, Oct 3) [DRAFT timings]. On a death the camera swoops to a
// close angle on the victim (a few candidate angles; any that clips terrain / props or is blocked is skipped), time drops
// to ~0.2x for ~1.2 s real time while the ragdoll, blood and gibs play, then it eases back to the fixed camera.
// Deaths close together don't stutter: during a shot a more dramatic death takes over (or a nearby one is merged into
// the frame), others are skipped; after a shot there's a short cooldown that only a dramatic death (gore / the last
// kill) breaks. ?debug shows a toggle (K); ?killcam=0 turns it off.
import * as THREE from "three";

export const KC = { swoopSec: 0.28, holdSec: 1.2, outSec: 0.6, cooldownSec: 0.9, slow: 0.2, maxHoldSec: 2.0, mergeM: 3.0 };
const ease = (a) => a * a * (3 - 2 * a);

export function createKillcam(camera, opts) {
  const ray = new THREE.Raycaster(), tmp = new THREE.Vector3();
  const kc = { enabled: opts.enabled !== false, phase: "idle", t: 0, shots: 0, skipped: 0, merged: 0, last: null, timeScale: 1, weight: 0 };
  let cur = null, cool = 0;
  const from = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() }, pose = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };

  // pick a close angle on the victim: candidates around the hit direction (side-on, three-quarter, facing the shooter)
  function pickAngle(focus, dir, rng) {
    const base = Math.atan2(dir.z, dir.x), cands = [];
    for (const az of [100, -100, 140, -140, 60, -60, 180]) for (const el of [26, 38]) cands.push({ az: az * Math.PI / 180, el: el * Math.PI / 180, d: 4.6 + rng() * 1.2 });
    for (let i = cands.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; if (j !== i && Math.abs(cands[i].az - cands[j].az) < 1.6) [cands[i], cands[j]] = [cands[j], cands[i]]; }   // a little variety
    for (const c of cands) {
      const a = base + c.az, p = new THREE.Vector3(focus.x + Math.cos(a) * Math.cos(c.el) * c.d, focus.y + Math.sin(c.el) * c.d, focus.z + Math.sin(a) * Math.cos(c.el) * c.d);
      if (p.y < opts.groundAt(p.x, p.z) + 0.5) continue;                                   // under / skimming the terrain
      if (opts.inBounds && !opts.inBounds(p)) continue;
      let blocked = false;   // a wall / rock / car / a standing unit in the way: of the torso now, or where the body lands
      for (const fy of [focus.y, Math.max(opts.groundAt(focus.x, focus.z) + 0.25, focus.y - 0.85)]) {
        const toF = tmp.set(focus.x, fy, focus.z).sub(p), L = toF.length(); ray.set(p, toF.normalize()); ray.far = L - 0.4;
        if (ray.intersectObjects(opts.occluders(), true).length) { blocked = true; break; } }
      if (blocked) continue;
      return { pos: p, angle: c };
    }
    return { pos: new THREE.Vector3(focus.x - dir.x * 1.5, focus.y + 5.5, focus.z - dir.z * 1.5 + 2.5), angle: null };   // fallback: high and close
  }

  // a death: { focus: () => Vector3 (live: the ragdoll's torso), dir, drama (1 normal, 2 gore, +2 the last kill), x, z }
  kc.request = function (req, rng) {
    if (!kc.enabled) return false;
    if (kc.phase === "in" || kc.phase === "hold") {
      const d = Math.hypot(req.x - cur.x, req.z - cur.z);
      if (req.drama > cur.drama) { start(req, rng, true); return true; }                  // more dramatic: take over
      if (d < KC.mergeM) { cur.merge = req; kc.merged++; cur.hold = Math.min(KC.maxHoldSec, cur.hold + 0.4); return true; }   // close by: frame both
      kc.skipped++; return false;
    }
    if ((kc.phase === "out" || cool > 0) && req.drama < 2) { kc.skipped++; return false; }
    start(req, rng, false); return true;
  };
  function start(req, rng, takeover) {
    from.pos.copy(camera.position); from.tgt.copy(kc.lookTarget || opts.baseTarget());
    const f = req.focus(); cur = Object.assign({}, req, { hold: KC.holdSec, pick: pickAngle(f, req.dir, rng) });
    kc.phase = "in"; kc.t = 0; kc.shots++; kc.last = { drama: req.drama, angle: cur.pick.angle ? Math.round(cur.pick.angle.az * 57.3) + "°/" + Math.round(cur.pick.angle.el * 57.3) + "°" : "fallback", takeover };
  }
  // per frame (real seconds): drives the camera (pass the fixed pose) and returns the time scale for the sim + physics
  kc.update = function (rdt, basePos, baseTgt) {
    cool = Math.max(0, cool - rdt);
    if (kc.phase === "idle" || !cur) { kc.timeScale = 1; kc.weight = 0; kc.lookTarget = baseTgt.clone(); camera.position.copy(basePos); camera.lookAt(baseTgt); return 1; }
    kc.t += rdt;
    const f = cur.focus().clone(); if (cur.merge) f.lerp(cur.merge.focus(), 0.5);
    pose.tgt.copy(f); pose.pos.copy(cur.pick.pos); if (cur.merge) pose.pos.addScaledVector(pose.pos.clone().sub(f).normalize(), 1.2);   // merged: pull back a bit
    let w = 1;
    if (kc.phase === "in") { w = ease(Math.min(1, kc.t / KC.swoopSec)); kc.timeScale = KC.slow; if (kc.t >= KC.swoopSec) { kc.phase = "hold"; kc.t = 0; } }
    else if (kc.phase === "hold") { kc.timeScale = KC.slow; if (kc.t >= cur.hold - KC.swoopSec) { kc.phase = "out"; kc.t = 0; } }
    else if (kc.phase === "out") { const a = Math.min(1, kc.t / KC.outSec); w = 1 - ease(a); kc.timeScale = KC.slow + (1 - KC.slow) * ease(a);
      if (a >= 1) { kc.phase = "idle"; cur = null; cool = KC.cooldownSec; kc.timeScale = 1; } }
    const sp = kc.phase === "in" ? from.pos : basePos, st = kc.phase === "in" ? from.tgt : baseTgt;
    camera.position.lerpVectors(sp, pose.pos, w); const look = new THREE.Vector3().lerpVectors(st, pose.tgt, w); camera.lookAt(look); kc.lookTarget = look; kc.weight = w;
    return kc.timeScale;
  };
  kc.reset = () => { kc.phase = "idle"; cur = null; cool = 0; kc.timeScale = 1; kc.shots = kc.skipped = kc.merged = 0; kc.last = null; };
  kc.active = () => kc.phase !== "idle";
  return kc;
}
