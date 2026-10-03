"""Tiny procedural low-poly kit for the Renegade proto 3D assets (Smudge, Oct 3 2026).

Every shape is built as a triangle soup (n, 3, 3) in metres, Y up, +Z forward.
Faces are flat: each triangle gets its own face normal and one material (one solid colour).
Nodes form a hierarchy; geometry is added in ABSOLUTE (asset-space) coordinates and stored
relative to the node origin, so each node's origin is its joint / pivot.
The GLB writer is hand-rolled (no deps beyond numpy) so the output is fully controlled:
no root transform, identity rotations everywhere, translations only, one primitive per material.
"""
import json, math, struct
import numpy as np
from scipy.spatial import ConvexHull

# ---------------------------------------------------------------- palette A
# Copied from /workspace/autobattler/assets/style-test/src/palettes.py (PALETTE_A, ramps dark -> light).
PAL = {
    "outline": ["#120a0a"],
    "skin":    ["#4e2e22", "#8c5a3c", "#c48c64"],
    "teal":    ["#0e3a3c", "#1c7470", "#46b8a4"],
    "rust":    ["#3e1410", "#862c1c", "#c65a30"],
    "leather": ["#2e2418", "#5e4a30", "#96784c"],
    "metal":   ["#26262a", "#4e5054", "#8c8c86"],
    "blood":   ["#2e0406", "#6e0a0e", "#a81c18"],
    "mutant":  ["#232a1c", "#4a5636", "#838c56"],
    "bone":    ["#96784c", "#d4c8a0"],
    "glow":    ["#f0c83c"],
}

def P(ramp, i):
    return PAL[ramp][i]

# ---------------------------------------------------------------- math
def rx(a):
    c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def ry(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def rz(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def align_y(d):
    """Rotation matrix taking +Y onto unit vector d (minimal rotation)."""
    d = np.asarray(d, float); d = d / np.linalg.norm(d)
    y = np.array([0.0, 1.0, 0.0]); v = np.cross(y, d); c = float(np.dot(y, d))
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3) if c > 0 else rz(math.pi)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1.0 / (1.0 + c))

def xf(tris, R=None, t=(0, 0, 0), about=(0, 0, 0)):
    T = np.asarray(tris, float).reshape(-1, 3, 3)
    a = np.asarray(about, float)
    if R is not None:
        T = (T - a) @ np.asarray(R).T + a
    return T + np.asarray(t, float)

def normals(T):
    n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    l = np.linalg.norm(n, axis=1, keepdims=True); l[l == 0] = 1
    return n / l

def orient(T, center=None):
    """Flip triangles so they face away from `center` (valid for convex pieces)."""
    T = np.array(T, float)
    c = T.reshape(-1, 3).mean(0) if center is None else np.asarray(center, float)
    n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    flip = (n * (T.mean(1) - c)).sum(1) < 0
    T[flip] = T[flip][:, [0, 2, 1]]
    return T

# ---------------------------------------------------------------- primitives (all convex, auto-oriented)
_HQ = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]

def hexa(pts):
    """8 corners: bottom ring 0-3, top ring 4-7 (same winding)."""
    p = np.asarray(pts, float); T = []
    for a, b, c, d in _HQ:
        T += [[p[a], p[b], p[c]], [p[a], p[c], p[d]]]
    return orient(np.array(T), p.mean(0))

def frustum(y0, y1, w0, d0, w1=None, d1=None, cx=0.0, cz=0.0, tx=0.0, tz=0.0):
    """Tapered box standing on Y: bottom rect w0 x d0 at y0 centred (cx,cz); top w1 x d1 at y1 shifted by (tx,tz)."""
    w1 = w0 if w1 is None else w1; d1 = d0 if d1 is None else d1
    def ring(y, w, d, ox, oz):
        return [(ox - w / 2, y, oz - d / 2), (ox + w / 2, y, oz - d / 2), (ox + w / 2, y, oz + d / 2), (ox - w / 2, y, oz + d / 2)]
    return hexa(ring(y0, w0, d0, cx, cz) + ring(y1, w1, d1, cx + tx, cz + tz))

def box(size, center=(0, 0, 0), R=None):
    sx, sy, sz = size; cx, cy, cz = center
    T = frustum(-sy / 2, sy / 2, sx, sz)
    return xf(T, R, (cx, cy, cz))

def seg(p0, p1, s0, s1=None, roll=0.0):
    """Tapered box from p0 to p1; s0=(w,d) cross-section at p0, s1 at p1 (w along the local X after alignment)."""
    p0 = np.asarray(p0, float); p1 = np.asarray(p1, float); s1 = s0 if s1 is None else s1
    L = np.linalg.norm(p1 - p0)
    T = frustum(0, L, s0[0], s0[1], s1[0], s1[1])
    if roll: T = xf(T, ry(roll))
    return xf(T, align_y(p1 - p0), p0)

def prism(n, r0, r1, p0, p1, phase=None, sx=1.0):
    """n-sided cylinder / cone from p0 (radius r0) to p1 (radius r1). sx squashes local X."""
    p0 = np.asarray(p0, float); p1 = np.asarray(p1, float)
    L = np.linalg.norm(p1 - p0); ph = math.pi / n if phase is None else phase
    a = [ph + 2 * math.pi * k / n for k in range(n)]
    b = [(r0 * math.cos(t) * sx, 0, r0 * math.sin(t)) for t in a]
    t = [(r1 * math.cos(q) * sx, L, r1 * math.sin(q)) for q in a]
    T = []
    for k in range(n):
        j = (k + 1) % n
        if r0 > 0 and r1 > 0:
            T += [[b[k], b[j], t[j]], [b[k], t[j], t[k]]]
        elif r1 == 0:
            T += [[b[k], b[j], (0, L, 0)]]
        else:
            T += [[t[k], t[j], (0, 0, 0)]]
    if r0 > 0:
        for k in range(1, n - 1): T.append([b[0], b[k], b[k + 1]])
    if r1 > 0:
        for k in range(1, n - 1): T.append([t[0], t[k], t[k + 1]])
    T = orient(np.array(T, float), (0, L / 2, 0))
    return xf(T, align_y(p1 - p0), p0)

def hull(pts):
    pts = np.asarray(pts, float); h = ConvexHull(pts)
    T = pts[h.simplices]
    return orient(T, pts[h.vertices].mean(0))

def split(T, pred):
    """Split a triangle soup by a predicate on (normals, centroids) -> (match, rest)."""
    n = normals(T); m = pred(n, T.mean(1))
    return T[m], T[~m]

def rng(seed):
    return np.random.default_rng(seed)

# ---------------------------------------------------------------- nodes
class Node:
    def __init__(self, name, at=(0, 0, 0), parent=None):
        self.name = name; self.at = np.asarray(at, float); self.parent = parent
        self.geo = {}; self.kids = []; self.extras = {}
    @property
    def t(self):
        return self.at - (self.parent.at if self.parent is not None else np.zeros(3))
    def kid(self, name, at=None):
        n = Node(name, self.at if at is None else at, self); self.kids.append(n); return n
    def add(self, mat, tris):
        """Add geometry given in ABSOLUTE asset coordinates."""
        T = np.asarray(tris, float).reshape(-1, 3, 3)
        if len(T): self.geo.setdefault(mat, []).append(T - self.at)
        return self
    def walk(self):
        yield self
        for k in self.kids: yield from k.walk()
    def tris(self):
        return sum(sum(len(t) for t in v) for v in self.geo.values())
    def all_tris_abs(self):
        out = []
        for n in self.walk():
            for m, L in n.geo.items():
                for t in L: out.append((m, t + n.at))
        return out

# ---------------------------------------------------------------- glb writer
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_rgb(h):
    h = h.lstrip("#"); return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]

def write_glb(path, root, mats, asset_extras=None, single=False):
    """mats: name -> {"hex": "#rrggbb", "role": str}. One primitive per material per node.
    single=True: ONE primitive per node with per-face vertex colours (COLOR_0, linear) and one white material named
    'vertex_colour' -- for files the pages consume as a single mesh (instanced grass, casings, gib chunks)."""
    used = []
    for n in root.walk():
        for m in n.geo:
            if m not in used: used.append(m)
    mat_index = {m: i for i, m in enumerate(used)}
    materials = []
    if single:
        materials.append({"name": "vertex_colour", "pbrMetallicRoughness": {"baseColorFactor": [1.0, 1.0, 1.0, 1.0], "metallicFactor": 0.0, "roughnessFactor": 1.0},
                          "extras": {"hex": "#ffffff", "role": "white base; colours are per-face COLOR_0 (palette A)", "palette": {m: mats[m]["hex"] for m in used}}})
    for m in ([] if single else used):
        spec = mats[m]; rgb = hex_rgb(spec["hex"])
        materials.append({"name": m, "pbrMetallicRoughness": {"baseColorFactor": [round(srgb_to_linear(c), 6) for c in rgb] + [1.0],
                          "metallicFactor": 0.0, "roughnessFactor": 1.0},
                          "extras": {"hex": spec["hex"], "role": spec.get("role", m)}})
    buf = bytearray(); views = []; accs = []; meshes = []; nodes = []

    def add_acc(arr, typ, minmax):
        arr = np.ascontiguousarray(arr, dtype=np.float32)
        while len(buf) % 4: buf.append(0)
        off = len(buf); buf.extend(arr.tobytes())
        views.append({"buffer": 0, "byteOffset": off, "byteLength": arr.nbytes, "target": 34962})
        a = {"bufferView": len(views) - 1, "componentType": 5126, "count": int(arr.shape[0]), "type": typ}
        if minmax:
            a["min"] = [float(v) for v in arr.min(0)]; a["max"] = [float(v) for v in arr.max(0)]
        accs.append(a); return len(accs) - 1

    def emit(n):
        idx = len(nodes); g = {"name": n.name}; nodes.append(g)
        t = n.t
        if np.abs(t).max() > 1e-9: g["translation"] = [round(float(v), 6) for v in t]
        if n.extras: g["extras"] = n.extras
        if n.geo and single:
            T = np.concatenate([t for m in used if m in n.geo for t in n.geo[m]]).astype(np.float64)
            C = np.concatenate([np.tile([srgb_to_linear(c) for c in hex_rgb(mats[m]["hex"])], (sum(len(t) for t in n.geo[m]) * 3, 1)) for m in used if m in n.geo])
            N = np.repeat(normals(T), 3, axis=0)
            prim = {"attributes": {"POSITION": add_acc(T.reshape(-1, 3), "VEC3", True), "NORMAL": add_acc(N, "VEC3", False),
                                   "COLOR_0": add_acc(C, "VEC3", False)}, "material": 0, "mode": 4}
            meshes.append({"name": n.name, "primitives": [prim]}); g["mesh"] = len(meshes) - 1
        elif n.geo:
            prims = []
            for m in used:
                if m not in n.geo: continue
                T = np.concatenate(n.geo[m]).astype(np.float64)
                N = np.repeat(normals(T), 3, axis=0)
                pos = T.reshape(-1, 3)
                prims.append({"attributes": {"POSITION": add_acc(pos, "VEC3", True), "NORMAL": add_acc(N, "VEC3", False)},
                              "material": mat_index[m], "mode": 4})
            meshes.append({"name": n.name, "primitives": prims}); g["mesh"] = len(meshes) - 1
        kids = [emit(k) for k in n.kids]
        if kids: g["children"] = kids
        return idx

    emit(root)
    while len(buf) % 4: buf.append(0)
    gltf = {"asset": {"version": "2.0", "generator": "Renegade proto assets3d (Smudge) build_assets3d.py",
                      "extras": dict({"units": "m", "up": "+Y", "forward": "+Z"}, **(asset_extras or {}))},
            "scene": 0, "scenes": [{"name": root.name, "nodes": [0]}], "nodes": nodes, "meshes": meshes,
            "materials": materials, "accessors": accs, "bufferViews": views, "buffers": [{"byteLength": len(buf)}]}
    js = json.dumps(gltf, separators=(",", ":")).encode()
    while len(js) % 4: js += b" "
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(buf), 0x004E4942) + bytes(buf)
    with open(path, "wb") as f: f.write(out)
    return len(out)
