// SP-100 3D battles: the cannon-es adapter (ported from proto/shared/3d/physics.js). Physics is purely cosmetic (the sim
// decides every outcome): casings, gib chunks, dropped rifles and ragdolls. Swapping in Rapier would only touch this file.
import * as CANNON from "cannon-es";

export const GROUP = { STATIC: 1, DEBRIS: 2, RAGDOLL: 4 };

// opts.bounds: { cx, cz, half } the "flew off" box for check() (default: 40 m around the 20 x 12 m office it started in)
export function createPhysics(opts) {
  const BND = Object.assign({ cx: 10, cz: 6, half: 40 }, (opts && opts.bounds) || {});
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.defaultContactMaterial.friction = 0.45;
  world.defaultContactMaterial.restitution = 0.15;
  const brass = new CANNON.Material("brass"), ground = new CANNON.Material("ground");
  world.addContactMaterial(new CANNON.ContactMaterial(brass, ground, { friction: 0.3, restitution: 0.35 }));
  const statics = [], dynamics = new Set(), constraints = new Set();
  let removedBad = 0;

  const P = {
    world, CANNON,
    addFloor() { const b = new CANNON.Body({ mass: 0, material: ground, collisionFilterGroup: GROUP.STATIC, collisionFilterMask: GROUP.DEBRIS | GROUP.RAGDOLL });
      b.addShape(new CANNON.Plane()); b.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(b); statics.push(b); return b; },
    // terrain: heights h(x, z) sampled every es m over [x0, x0 + w] x [z0, z0 + d]. cannon's Heightfield lies in its
    // local XY plane with height on +Z; rotated -90° about X, local (i*es, j*es, h) lands on world (x0 + i*es, h, z1 - j*es)
    addHeightfield(h, x0, z0, w, d, es) {
      const nx = Math.round(w / es) + 1, nz = Math.round(d / es) + 1, z1 = z0 + (nz - 1) * es, data = [];
      for (let i = 0; i < nx; i++) { const col = []; for (let j = 0; j < nz; j++) col.push(h(x0 + i * es, z1 - j * es)); data.push(col); }
      const b = new CANNON.Body({ mass: 0, material: ground, collisionFilterGroup: GROUP.STATIC, collisionFilterMask: GROUP.DEBRIS | GROUP.RAGDOLL });
      b.addShape(new CANNON.Heightfield(data, { elementSize: es })); b.quaternion.setFromEuler(-Math.PI / 2, 0, 0); b.position.set(x0, 0, z1);
      world.addBody(b); statics.push(b); return b; },
    addStaticBox(cx, cy, cz, hx, hy, hz, rotY) { const b = new CANNON.Body({ mass: 0, material: ground, collisionFilterGroup: GROUP.STATIC, collisionFilterMask: GROUP.DEBRIS | GROUP.RAGDOLL });
      b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz))); b.position.set(cx, cy, cz); if (rotY) b.quaternion.setFromEuler(0, rotY, 0); world.addBody(b); statics.push(b); return b; },
    // a dynamic box. opts: { group, brass, damping }
    addBox(hx, hy, hz, mass, pos, quat, opts) {
      opts = opts || {}; const grp = opts.group || GROUP.DEBRIS;
      const b = new CANNON.Body({ mass, material: opts.brass ? brass : undefined, collisionFilterGroup: grp,
        collisionFilterMask: grp === GROUP.DEBRIS ? GROUP.STATIC | GROUP.RAGDOLL : GROUP.STATIC | GROUP.RAGDOLL | GROUP.DEBRIS });
      b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
      b.position.set(pos.x, pos.y, pos.z); if (quat) b.quaternion.set(quat.x, quat.y, quat.z, quat.w);
      b.linearDamping = opts.damping != null ? opts.damping : 0.05; b.angularDamping = opts.angDamping != null ? opts.angDamping : 0.15;
      b.allowSleep = true; b.sleepSpeedLimit = opts.sleepSpeed || 0.12; b.sleepTimeLimit = 0.5;
      world.addBody(b); dynamics.add(b); return b;
    },
    // a ragdoll joint: pivots and axes are given in world space at rest and converted into each body's frame
    joint(a, b, pivotW, axisW, angle, twist) {
      const pA = a.pointToLocalFrame(new CANNON.Vec3(pivotW.x, pivotW.y, pivotW.z)), pB = b.pointToLocalFrame(new CANNON.Vec3(pivotW.x, pivotW.y, pivotW.z));
      const ax = new CANNON.Vec3(axisW.x, axisW.y, axisW.z), axA = a.quaternion.inverse().vmult(ax), axB = b.quaternion.inverse().vmult(ax);
      const c = new CANNON.ConeTwistConstraint(a, b, { pivotA: pA, pivotB: pB, axisA: axA, axisB: axB, angle, twistAngle: twist, collideConnected: false, maxForce: 1e6 });
      world.addConstraint(c); constraints.add(c); return c;
    },
    removeBody(b) { if (!b) return; world.removeBody(b); dynamics.delete(b); },
    removeConstraint(c) { if (!c) return; world.removeConstraint(c); constraints.delete(c); },
    clearStatic() { for (const b of statics) world.removeBody(b); statics.length = 0; },
    clearDynamic() { for (const c of constraints) world.removeConstraint(c); constraints.clear(); for (const b of dynamics) world.removeBody(b); dynamics.clear(); },
    step(dt) { if (dt > 0) world.step(1 / 60, dt, 4); },
    // the "physics doesn't explode" guard: a body with NaN or far outside the scene is parked and counted
    check() {
      let bad = 0;
      for (const b of dynamics) { const p = b.position, v = b.velocity;
        if (!isFinite(p.x + p.y + p.z + v.x + v.y + v.z) || p.y < -2 || p.y > 30 || Math.abs(p.x - BND.cx) > BND.half || Math.abs(p.z - BND.cz) > BND.half) {
          bad++; world.removeBody(b); dynamics.delete(b); } }
      removedBad += bad; return bad;
    },
    stats() { let awake = 0; for (const b of dynamics) if (b.sleepState !== CANNON.Body.SLEEPING) awake++;
      return { dynamic: dynamics.size, awake, constraints: constraints.size, statics: statics.length, removedBad }; },
    // copy a body's transform onto an Object3D
    sync(body, obj) { obj.position.set(body.position.x, body.position.y, body.position.z); obj.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w); }
  };
  return P;
}
