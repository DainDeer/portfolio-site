// SP-100 3D battles: cinematic kill shots (ported from proto/shared/3d/killcam.js). On a death the camera swoops to a
// close angle on the victim (a few candidate angles; any that clips terrain / props or is blocked is skipped), time drops
// to ~0.2x for ~1.2 s real time while the ragdoll, blood and gibs play, then it eases back to the fixed camera.
// Vixie (Oct 3): every death is acknowledged, nothing is skipped silently. Deaths during a shot JOIN it: one shot frames
// the whole group (the camera backs off along its angle until every victim fits), its hold stretched a little per
// victim. The only ways a death gets no shot: the Settings toggle (kc.enabled false) or a tap (kc.skip(): that shot's
// victims count as seen). kc.log lists every shot's victim ids (tests/browser/battle3d.py checks every death is in one).
// Vixie (Oct 4), the merge window: a death from the moment a shot starts easing back until 2 s after it is back joins ONE
// quick follow-up CUT (~1 s: a 0.18 s swoop from wherever the camera is, a 0.55 s hold, a 0.3 s ease back); later deaths
// in that window share the cut while it is in / holding (it frames them all). A shot + its cut are two in a row: then the
// fight runs live for at least 3 s (real seconds while the sim runs) before the next shot. Deaths after the cut, in its
// window or in the 3 s, are QUEUED and shown together in the next shot (when the 3 s are up, or at once when the fight
// ends). kc.log entries: { shot, ids, kind: "shot" | "cut" | "queued" (a shot opened by the queue), tapped }.
// Vixie (Oct 4), the hidden death: a standing unit between the camera and a victim is never accepted. Every shot / cut
// samples candidate angles (every 30° around the group, 26° / 38° first, then 52° / 65°, then near-overhead) at the
// group's real framing distance and raycasts each against the props AND the units' real meshes (layer 1 while they draw
// instanced), to every victim's torso and to where it lands; the first clear one wins. The view is re-tested every
// frame (KC.retestSec 0) and when a victim joins: blocked -> the camera swings (~0.3 s) to the nearest clear angle. Only when NO angle
// within those limits is clear, the units in the way are ghosted (opts.ghost(ids): see-through) for the rest of the
// shot. kc.log adds { clear, swings, ghosted: [ids], blocked: re-tests that found the view blocked with no fix }.
// Vixie (Oct 4), the losing blow: the fight-ending blow (the last enemy's death, or the downing of your last body, a
// bleed-out downing, not a death; the view also counts an ally going Critical as the last one standing) comes as a request
// with final: true. It is never queued or deferred by the window or the 3 s live rule: it joins the shot / cut playing
// (a place in a cut is a place in a shot: the cut stays quick), else it opens a full shot at once that takes the queue.
// kc.log adds final: true on that shot. Its end (the hold running out, or a tap) calls opts.onFinalEnd(entry, "end" | "skip"):
// Vixie (Oct 4) the battle sting plays then (js/battleview.js BV.sting).
import * as THREE from "three";

export const KC = { swoopSec: 0.28, holdSec: 1.2, outSec: 0.6, skipSec: 0.22, slow: 0.2, joinHoldSec: 0.45, maxHoldSec: 2.6, baseDist: 5.2, fitPad: 1.25,
  windowSec: 2, cutSwoopSec: 0.18, cutHoldSec: 0.55, cutJoinSec: 0.15, cutMaxHoldSec: 0.85, cutOutSec: 0.3, liveSec: 3, runMax: 2, retestSec: 0, swingRate: 12 };
const ease = (a) => a * a * (3 - 2 * a);

export function createKillcam(camera, opts) {
  const ray = new THREE.Raycaster(), tmp = new THREE.Vector3(); ray.layers.enableAll();   // instanced units keep their real meshes on layer 1 (instancing.js): still occluders
  const kc = { rules: "merge", enabled: opts.enabled !== false, phase: "idle", t: 0, shots: 0, cuts: 0, queued: 0, ghostShots: 0, swings: 0, skipped: 0, merged: 0, tapped: 0, off: 0, last: null, timeScale: 1, weight: 0, log: [] };
  let cur = null, clock = 0, lastEnd = -1e9, run = 0, live = 0, rngLast = opts.rng || Math.random;
  const queue = [];
  // the same occlusion test pickAngle uses (walls, rocks, cars and standing units' real meshes), for the tests
  kc.occluded = (a, b) => { const d = tmp.copy(b).sub(a), L = d.length(); ray.set(a, d.normalize()); ray.far = L; return ray.intersectObjects(opts.occluders().concat(opts.unitFigs().map((u) => u.fig)), true).length > 0; };
  const from = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() }, pose = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };

  // what's between p and the victims: rays to each victim's torso now, either side of it and above it (+-0.3 m: a unit
  // half across the victim is in the way too) and to where it lands (each just short of it), against
  // the props (walls, rocks, cars) and the standing units' real meshes (never the victims' own, nor ghosted units)
  function sight(p, victims, skip) {
    const props = opts.occluders(), us = opts.unitFigs().filter((u) => !victims.some((r) => r.id === u.id) && !(skip && skip.has(u.id)));
    const figOf = new Map(us.map((u) => [u.fig, u.id])), out = { rays: 0, blocked: 0, props: false, units: new Set() };
    for (const r of victims) { const f = r.focus(), sx = -(f.z - p.z), sz = f.x - p.x, sl = Math.hypot(sx, sz) || 1, ox = sx / sl * 0.3, oz = sz / sl * 0.3;
      for (const [dx, fy, dz] of [[0, f.y, 0], [ox, f.y, oz], [-ox, f.y, -oz], [0, f.y + 0.3, 0], [0, Math.max(opts.groundAt(f.x, f.z) + 0.25, f.y - 0.85), 0]]) {
        const toF = tmp.set(f.x + dx, fy, f.z + dz).sub(p), L = toF.length(); ray.set(p, toF.normalize()); ray.far = Math.max(0.1, L - 0.4); out.rays++;
        let hit = false; if (ray.intersectObjects(props, true).length) { out.props = true; hit = true; }
        for (const h of ray.intersectObjects(us.map((u) => u.fig), true)) { let o = h.object; while (o && !figOf.has(o)) o = o.parent; if (o) { out.units.add(figOf.get(o)); hit = true; } }
        if (hit) out.blocked++; } }
    return out;
  }
  // the group's framing at a direction: its centre + dir x the distance at which every victim fits the view
  const _c = new THREE.Vector3();
  function framing(victims) {
    const pts = victims.map((r) => r.focus()); _c.set(0, 0, 0); for (const p of pts) _c.add(p); _c.divideScalar(pts.length);
    let rad = 0; for (const p of pts) rad = Math.max(rad, p.distanceTo(_c));
    const vf = (camera.fov || 50) * Math.PI / 360, hf = Math.atan(Math.tan(vf) * (camera.aspect || 1.6)), half = Math.min(vf, hf);
    return { center: _c.clone(), fit: pts.length > 1 ? (rad + KC.fitPad) / Math.tan(half * 0.85) : 0, n: pts.length };
  }
  const D2R = Math.PI / 180, PREF = [100, -100, 140, -140, 60, -60, 180], ALL = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  // pick the angle: candidates around the hit direction (side-on, three-quarter, facing the shooter first; then every 30°),
  // low to high, tested at the pose frameGroup will really use. near: a direction to stay close to (a re-pick mid-shot)
  function pickAngle(victims, dir, rng, d0, near) {
    const fr = framing(victims), base = Math.atan2(dir.z, dir.x), cands = [], seen = new Set();
    const add = (az, el) => { const k = (((Math.round(az) % 360) + 360) % 360) + "/" + el; if (seen.has(k)) return; seen.add(k); cands.push({ az: az * D2R, el: el * D2R }); };
    const tier = (els, azs) => { const t0 = cands.length; for (const el of els) for (const az of azs) add(az, el); return t0; };
    const t1 = tier([26, 38], PREF); tier([26, 38], ALL); tier([52, 65], PREF.concat(ALL)); tier([80], [180, 0, 90, -90]);
    for (let i = PREF.length * 2 - 1; i > t1; i--) { const j = (rng() * (i + 1)) | 0; if (j !== i && Math.abs(cands[i].az - cands[j].az) < 1.6 && cands[i].el === cands[j].el) [cands[i], cands[j]] = [cands[j], cands[i]]; }   // a little variety
    const dirOf = (c) => { const a = base + c.az; return new THREE.Vector3(Math.cos(a) * Math.cos(c.el), Math.sin(c.el), Math.sin(a) * Math.cos(c.el)); };
    const list = cands.map((c, i) => ({ c, i, dir: dirOf(c) }));
    if (near) list.sort((a, b) => b.dir.dot(near) - a.dir.dot(near) || a.i - b.i);
    if (kc.maxCands) list.length = Math.min(list.length, kc.maxCands);   // tests only: "no clear angle within limits"
    let best = null; const dist = Math.max(d0, fr.fit);
    for (const k of list) {
      const p = fr.center.clone().addScaledVector(k.dir, dist);
      if (p.y < opts.groundAt(p.x, p.z) + 0.5) continue;                                   // under / skimming the terrain
      if (opts.inBounds && !opts.inBounds(p)) continue;
      const sg = sight(p, victims); k.sg = sg; k.pos = p;
      if (!sg.blocked) return { pos: p, dir: k.dir, angle: k.c, clear: true, ghost: [] };
      // no clear angle yet: remember the best fallback (units only in the way = they can be ghosted; fewest of them)
      const score = (sg.props ? 1000 : 0) + sg.units.size * 10 + sg.blocked;
      if (!best || score < best.score) best = { score, k };
    }
    if (best) return { pos: best.k.pos, dir: best.k.dir, angle: best.k.c, clear: false, ghost: [...best.k.sg.units], props: best.k.sg.props };
    const f = victims[0].focus(), p = new THREE.Vector3(f.x - dir.x * 1.5, f.y + 5.5, f.z - dir.z * 1.5 + 2.5);   // nothing in bounds at all: high and close
    return { pos: p, dir: p.clone().sub(fr.center).normalize(), angle: null, clear: false, ghost: [...sight(p, victims).units] };
  }
  function applyPick(pick, first) {
    cur.pick = pick; cur.dirT = pick.dir.clone(); if (first) cur.dir = pick.dir.clone();
    const g = new Set(pick.ghost); cur.ghost = g; cur.entry.clear = cur.entry.clear !== false && pick.clear;
    if (g.size) { for (const id of g) if (!cur.entry.ghosted.includes(id)) cur.entry.ghosted.push(id); if (!cur.ghostCounted) { cur.ghostCounted = true; kc.ghostShots++; } }
    if (opts.ghost) opts.ghost([...g]);
  }
  // re-test the shot's view (the pose it is heading for); blocked -> swing to the nearest clear angle, else ghost
  function retest() {
    const fr = framing(cur.victims), p = fr.center.clone().addScaledVector(cur.dirT, Math.max(cur.d0, fr.fit));
    if (!sight(p, cur.victims, cur.ghost).blocked) {
      if (cur.ghost.size) { const pick = pickAngle(cur.victims, cur.victims[0].dir, rngLast, cur.d0, cur.dirT); if (pick.clear) { cur.entry.swings++; kc.swings++; applyPick(pick, false); } }   // a clear angle opened up: un-ghost
      return; }
    const pick = pickAngle(cur.victims, cur.victims[0].dir, rngLast, cur.d0, cur.dirT);
    if (pick.clear) { cur.entry.swings++; kc.swings++; applyPick(pick, false); return; }
    cur.entry.blocked++; applyPick(pick, false);
  }

  // a death: { id, focus: () => Vector3 (live: the ragdoll's torso), dir, drama (1 normal, 2 gore, +2 the last kill), x, z }.
  // Returns true when it is (or will be) seen: in the current shot / cut, a new one, or the queue; false only when kill cams are off.
  // final: the fight-ending blow (see the top)
  kc.request = function (req, rng) {
    if (!kc.enabled) { kc.off++; return false; }
    if (rng) rngLast = rng;
    if (req.final) {
      live = 0;
      if (cur && (kc.phase === "in" || kc.phase === "hold")) {
        for (const q of queue.splice(0)) join(q);
        join(req);
      } else start(queue.splice(0).concat([req]), "shot");
      cur.final = true; cur.entry.final = true; kc.finalShot = cur.entry.shot; return true;
    }
    if (cur && (kc.phase === "in" || kc.phase === "hold")) { join(req); return true; }   // near-simultaneous: one shot frames them all
    if (kc.rules === "m2") { start([req], "shot"); return true; }   // test A/B only: the milestone-2 rule (a full shot for every death outside one)
    const inWindow = (cur && kc.phase === "out") || clock - lastEnd <= KC.windowSec;
    if (live > 0 || (inWindow && run >= KC.runMax)) { queue.push(req); kc.queued++; return true; }   // two in a row: the fight runs live first
    start(queue.splice(0).concat([req]), inWindow ? "cut" : "shot"); return true;
  };
  function join(req) {
    cur.victims.push(req); cur.entry.ids.push(req.id); kc.merged++; cur.retestT = 0;   // the framing changed: test it again now
    if (cur.kind === "cut") cur.hold = Math.min(cur.swoop + KC.cutMaxHoldSec, cur.hold + KC.cutJoinSec);
    else cur.hold = Math.min(KC.maxHoldSec, cur.hold + KC.joinHoldSec);
    if (kc.phase === "hold") kc.t = Math.min(kc.t, Math.max(0, cur.hold - cur.swoop - cur.see));   // let the newcomer be seen
  }
  function start(victims, kind, over) {
    if (cur && cur.entry.end == null) cur.entry.end = +clock.toFixed(3);
    if (opts.ghost) opts.ghost([]);   // cut short while easing back: the next one starts from here
    from.pos.copy(camera.position); from.tgt.copy(kc.lookTarget || opts.baseTarget());
    const r0 = victims[0], d0 = 4.6 + rngLast() * 1.2, pick = pickAngle(victims, r0.dir, rngLast, d0, null);
    const cut = kind === "cut", swoop = cut ? KC.cutSwoopSec : KC.swoopSec;
    cur = { kind, victims: victims.slice(), swoop, hold: swoop + (cut ? KC.cutHoldSec : KC.holdSec - KC.swoopSec), see: (cut ? KC.cutHoldSec : KC.holdSec) * 0.6, outLen: cut ? KC.cutOutSec : KC.outSec,
      d0, retestT: KC.retestSec, entry: { shot: kc.shots + 1, ids: victims.map((r) => r.id), kind, at: +clock.toFixed(3), over: !!over, swings: 0, blocked: 0, ghosted: [] } };
    applyPick(pick, true);
    if (victims.length > 1) { kc.merged += victims.length - 1; cur.hold = Math.min(cut ? swoop + KC.cutMaxHoldSec : KC.maxHoldSec, cur.hold + (victims.length - 1) * (cut ? KC.cutJoinSec : KC.joinHoldSec)); }
    run = cut ? run + 1 : 1; if (cut) kc.cuts++;
    kc.log.push(cur.entry);
    kc.phase = "in"; kc.t = 0; kc.shots++; kc.last = { drama: r0.drama, kind, clear: pick.clear, angle: pick.angle ? Math.round(pick.angle.az * 57.3) + "°/" + Math.round(pick.angle.el * 57.3) + "°" : "fallback" };
  }
  function frameGroup() { const fr = framing(cur.victims); return { center: fr.center, dist: Math.max(cur.d0, fr.fit), n: fr.n }; }
  // per frame (real seconds): drives the camera (pass the fixed pose) and returns the time scale for the sim + physics.
  // st: { live: the sim is running this frame (the 3 s live stretch only counts then), over: the fight has ended }
  kc.update = function (rdt, basePos, baseTgt, st) {
    clock += rdt;
    if (kc.phase === "idle") {
      if (live > 0 && st && st.live) live = Math.max(0, live - rdt);
      if (queue.length && (live <= 0 || (st && st.over))) { live = 0; start(queue.splice(0), "queued", st && st.over); }
    }
    if (kc.phase === "idle" || !cur) { kc.timeScale = 1; kc.weight = 0; kc.lookTarget = baseTgt.clone(); camera.position.copy(basePos); camera.lookAt(baseTgt); return 1; }
    kc.t += rdt;
    if (kc.phase !== "out" && (cur.retestT -= rdt) <= 0) { cur.retestT = KC.retestSec; retest(); }
    if (cur.dir.distanceToSquared(cur.dirT) > 1e-8) cur.dir.lerp(cur.dirT, Math.min(1, rdt * KC.swingRate)).normalize();   // a smooth swing to the clear angle
    const g = frameGroup(); pose.tgt.copy(g.center); pose.pos.copy(g.center).addScaledVector(cur.dir, g.dist);
    { const gy = opts.groundAt(pose.pos.x, pose.pos.z) + 0.5; if (pose.pos.y < gy) pose.pos.y = gy; }
    let w = 1;
    if (kc.phase === "in") { w = ease(Math.min(1, kc.t / cur.swoop)); kc.timeScale = KC.slow; if (kc.t >= cur.swoop) { kc.phase = "hold"; kc.t = 0; } }
    else if (kc.phase === "hold") { kc.timeScale = KC.slow; if (kc.t >= cur.hold - cur.swoop) { kc.phase = "out"; kc.t = 0; cur.outW = 1; cur.outSec = cur.outLen; cur.outTs = KC.slow; finalEnd("end"); } }
    else if (kc.phase === "out") { const a = Math.min(1, kc.t / cur.outSec); w = cur.outW * (1 - ease(a)); kc.timeScale = cur.outTs + (1 - cur.outTs) * ease(a);
      if (a >= 1) { kc.phase = "idle"; cur.entry.end = +clock.toFixed(3); cur = null; if (opts.ghost) opts.ghost([]); kc.timeScale = 1; lastEnd = clock; if (run >= KC.runMax) live = KC.liveSec; } }
    if (kc.phase === "idle") { camera.position.copy(basePos); camera.lookAt(baseTgt); kc.lookTarget = baseTgt.clone(); kc.weight = 0; return 1; }
    const sp = kc.phase === "in" ? from.pos : basePos, st0 = kc.phase === "in" ? from.tgt : baseTgt;
    camera.position.lerpVectors(sp, pose.pos, w); const look = new THREE.Vector3().lerpVectors(st0, pose.tgt, w); camera.lookAt(look); kc.lookTarget = look; kc.weight = w;
    return kc.timeScale;
  };
  // the shot holding the fight-ending blow is over (once)
  function finalEnd(how) { if (!cur.final || cur.finalDone) return; cur.finalDone = true; cur.entry.finalEnd = how; if (opts.onFinalEnd) opts.onFinalEnd(cur.entry, how); }
  // a tap: leave the current shot now (a quick ease back from wherever the camera is)
  kc.skip = function () {
    if (!cur || (kc.phase !== "in" && kc.phase !== "hold")) return false;
    if (kc.phase === "in") { from.pos.copy(camera.position); }
    kc.phase = "out"; kc.t = 0; cur.outW = kc.weight; cur.outSec = KC.skipSec; cur.outTs = kc.timeScale; cur.entry.tapped = true; kc.tapped++; finalEnd("skip"); return true;
  };
  kc.reset = () => { if (cur && opts.ghost) opts.ghost([]); kc.phase = "idle"; cur = null; queue.length = 0; run = 0; live = 0; lastEnd = -1e9; kc.timeScale = 1; kc.finalShot = null; kc.shots = kc.cuts = kc.queued = kc.ghostShots = kc.swings = kc.skipped = kc.merged = kc.tapped = kc.off = 0; kc.last = null; kc.log = []; };
  kc.active = () => kc.phase !== "idle";
  // the fight's end waits for this: a shot playing, or deaths still queued for one
  kc.busy = () => kc.phase !== "idle" || queue.length > 0;
  kc.pending = () => queue.map((r) => r.id);
  kc.liveLeft = () => live;
  kc.clock = () => clock;
  kc.forceLive = (sec) => { live = sec; run = KC.runMax; };   // tests only: as if two shots in a row just ended
  kc.current = () => (cur ? { ids: cur.victims.map((r) => r.id), focus: cur.victims.map((r) => r.focus()), kind: cur.kind, entry: cur.entry } : null);
  // the tests: what blocks the camera's view of the current shot's victims right now (ghosted units are see-through)
  kc.sightNow = () => { if (!cur) return null; const sg = sight(camera.position, cur.victims, cur.ghost);
    return { victims: cur.victims.length, rays: sg.rays, blocked: sg.blocked, props: sg.props, units: [...sg.units], ghosted: [...cur.ghost], phase: kc.phase, shot: cur.entry.shot, swinging: cur.dir.distanceToSquared(cur.dirT) > 1e-3 }; };
  return kc;
}
