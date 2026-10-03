"""Quality check + preview sheet for the proto 3D assets (Smudge, Oct 3 2026).
Loads every .glb BACK from disk (trimesh for counts/bounds, pygltflib for nodes/materials), checks the
contract (required node names, no root transform, identity rotations, tint/eye slots, budgets, Y-up / +Z facing),
writes check_report.json and renders ../preview_assets3d.png with a tiny z-buffer rasteriser
(back-face culled, so a wrong winding shows up as a hole; 4 flat light bands like the chunky look).
Run: python3 proto/assets3d/src/check_assets3d.py   (needs numpy, trimesh, pygltflib, pillow)"""
import json, os, sys, math
import numpy as np, trimesh, pygltflib
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.normpath(os.path.join(HERE, ".."))
STATS = {s["file"]: s for s in json.load(open(os.path.join(HERE, "build_stats.json")))}
HUMAN = ["torso", "head", "arm_l", "arm_r", "leg_l", "leg_r", "hand_r"]
GOAT = ["body", "head", "leg_fl", "leg_fr", "leg_bl", "leg_br", "tail"]
REQ = {"grunt": HUMAN, "scavenger": HUMAN, "goat": GOAT, "rifle": ["muzzle", "eject"], "pistol": ["muzzle", "eject"], "shotgun": ["muzzle", "eject"]}
GUNS = ("rifle", "pistol", "shotgun"); MELEE = ("weapon_hatchet", "machete")

def q2m(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

def read_glb(path):
    """-> tris (N,3,3), hex colour per tri, material name per tri, {node name: world origin}, node info list."""
    g = pygltflib.GLTF2().load(path); blob = g.binary_blob()
    def acc(i):
        a = g.accessors[i]; v = g.bufferViews[a.bufferView]
        return np.frombuffer(blob, np.float32, a.count * 3, v.byteOffset + (a.byteOffset or 0)).reshape(-1, 3)
    tris, cols, mnames, origins, info = [], [], [], {}, []
    def walk(i, M, t):
        n = g.nodes[i]
        R = q2m(n.rotation) if n.rotation else np.eye(3); s = np.array(n.scale) if n.scale else np.ones(3)
        tr = np.array(n.translation) if n.translation else np.zeros(3)
        M2 = M @ (R * s); t2 = t + M @ tr
        origins[n.name] = t2; info.append({"name": n.name, "rotation": n.rotation, "scale": n.scale, "mesh": n.mesh is not None})
        if n.mesh is not None:
            for p in g.meshes[n.mesh].primitives:
                pos = acc(p.attributes.POSITION) @ M2.T + t2
                m = g.materials[p.material]; tris.append(pos.reshape(-1, 3, 3))
                if p.attributes.COLOR_0 is not None:   # vertex colours (linear) -> sRGB hex per face
                    C = acc(p.attributes.COLOR_0)[::3]
                    to = lambda v: 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
                    cols.extend(["#%02x%02x%02x" % tuple(int(round(to(float(x)) * 255)) for x in c) for c in C]); mnames.extend([m.name] * len(C))
                else:
                    cols.extend([m.extras["hex"]] * (len(pos) // 3)); mnames.extend([m.name] * (len(pos) // 3))
        for c in n.children or []: walk(c, M2, t2)
    walk(g.scenes[g.scene].nodes[0], np.eye(3), np.zeros(3))
    return np.concatenate(tris), cols, mnames, origins, info, g

def check(rel):
    path = os.path.join(OUT, rel)
    sc = trimesh.load(path, force="scene")
    faces = sum(len(m.faces) for m in sc.dump())
    lo, hi = sc.bounds; size = hi - lo
    T, cols, mn, org, info, g = read_glb(path)
    root = info[0]; issues = []
    if root["rotation"] or root["scale"]: issues.append("root has rotation/scale")
    if any(i["rotation"] or i["scale"] for i in info): issues.append("a node has rotation/scale")
    st = STATS[rel]; model = st["model"]
    for name in REQ.get(model, []):
        if name not in org: issues.append("missing node " + name)
    if faces != st["tris"]: issues.append(f"tri mismatch {faces} vs build {st['tris']}")
    if faces > st["budget"]: issues.append("over budget")
    if os.path.getsize(path) > 300 * 1024: issues.append("over 300 KB")
    if st["single"] and sum(len(m.primitives) for m in g.meshes) != 1: issues.append("should be one primitive")
    mats = sorted(set(mn))
    if model in ("grunt", "scavenger") and "tint" not in mats: issues.append("no tint material")
    if model == "goat" and "eye" not in mats: issues.append("no eye material")
    if model != "goat" and "eye" in mats: issues.append("'eye' material outside the goat")
    facing = ""
    if model in ("grunt", "scavenger", "goat"):
        hc = org["head"]
        front = [t.mean(0) for t, m in zip(T, mn) if m in ("eye", "pupil", "rag", "lens", "goat_coat_light")]
        fz = np.mean([f[2] for f in front]) if front else float("nan")
        facing = f"face features z={fz:+.3f} > head pivot z={hc[2]:+.3f} -> faces +Z" if fz > hc[2] else "FACING?"
        if model == "goat": facing += f"; nose z={T[:, :, 2].max():+.2f}, tail z={T[:, :, 2].min():+.2f}"
        if abs(lo[1]) > 0.02: issues.append(f"feet not at y=0 ({lo[1]:.3f})")
    elif model in GUNS:
        facing = f"muzzle z={org['muzzle'][2]:+.3f}, butt z={lo[2]:+.3f} -> barrel +Z, stock -Z"
        if org["muzzle"][2] <= 0 or lo[2] >= 0: issues.append("gun not barrel +Z / stock -Z")
    elif model in MELEE:
        facing = f"handle/blade along +Z to z={hi[2]:+.2f}, edge +X to x={hi[0]:+.3f} (pages' melee convention)"
    elif not model.startswith(("gib", "shell")):
        if abs(lo[1]) > 1e-4: issues.append(f"base not at y=0 ({lo[1]:.4f})")
        c = (lo + hi) / 2
        if (abs(c[0]) > 1e-3 and model != "fence_wood") or abs(c[2]) > 1e-3: issues.append("not centred in X/Z")
    else:
        c = (lo + hi) / 2
        if np.abs(c).max() > 1e-3: issues.append("not centred")
    return {"file": rel, "model": model, "tris": int(faces), "budget": st["budget"], "kb": round(os.path.getsize(path) / 1024, 1),
            "size_m": [round(float(v), 3) for v in size], "min": [round(float(v), 3) for v in lo], "max": [round(float(v), 3) for v in hi],
            "nodes": [i["name"] for i in info], "node_origins": {k: [round(float(x), 3) for x in v] for k, v in org.items()},
            "materials": mats, "facing": facing, "issues": issues}, (T, cols, mn, org)

# ------------------------------------------------------------------ rasteriser
LIGHT = np.array([-0.45, 0.85, 0.40]); LIGHT /= np.linalg.norm(LIGHT)
VIEW = np.array([0.62, 0.48, 0.80]); VIEW /= np.linalg.norm(VIEW)      # camera sits front-left-above (3/4 view)
BANDS = [0.46, 0.64, 0.82, 1.0]

def hexrgb(h): h = h.lstrip("#"); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)

def render(T, cols, W, H, view=VIEW, scale=None, center=None, bg=(46, 44, 40)):
    f = -view; right = np.cross(f, [0, 1, 0]); right /= np.linalg.norm(right); up = np.cross(right, f)
    P = T.reshape(-1, 3); u = P @ right; v = P @ up; d = P @ view
    if scale is None:
        span = max((u.max() - u.min()) / W, (v.max() - v.min()) / H) * 1.12; scale = 1 / span
        center = ((u.max() + u.min()) / 2, (v.max() + v.min()) / 2)
    X = (u - center[0]) * scale + W / 2; Y = H / 2 - (v - center[1]) * scale
    X, Y, D = X.reshape(-1, 3), Y.reshape(-1, 3), d.reshape(-1, 3)
    img = np.zeros((H, W, 3)); img[:] = bg; zb = np.full((H, W), -1e9)
    n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); nl = np.linalg.norm(n, axis=1); nl[nl == 0] = 1; n /= nl[:, None]
    lit = np.clip(n @ LIGHT, 0, 1); band = np.array([BANDS[min(3, int(k * 4))] for k in lit])
    C = np.array([hexrgb(c) for c in cols]) * band[:, None]
    for i in np.where(n @ view > 1e-6)[0]:
        x, y, z = X[i], Y[i], D[i]
        x0, x1 = int(max(0, math.floor(x.min()))), int(min(W - 1, math.ceil(x.max())))
        y0, y1 = int(max(0, math.floor(y.min()))), int(min(H - 1, math.ceil(y.max())))
        if x1 < x0 or y1 < y0: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        den = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
        if abs(den) < 1e-12: continue
        a = ((y[1] - y[2]) * (gx - x[2]) + (x[2] - x[1]) * (gy - y[2])) / den
        b = ((y[2] - y[0]) * (gx - x[2]) + (x[0] - x[2]) * (gy - y[2])) / den
        c = 1 - a - b; m = (a >= -1e-6) & (b >= -1e-6) & (c >= -1e-6)
        if not m.any(): continue
        zz = a * z[0] + b * z[1] + c * z[2]
        sub = zb[y0:y1 + 1, x0:x1 + 1]; upd = m & (zz > sub)
        sub[upd] = zz[upd]; img[y0:y1 + 1, x0:x1 + 1][upd] = C[i]
    return Image.fromarray(img.clip(0, 255).astype(np.uint8)), scale, center

def font(sz):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

def main():
    files = [s for s in STATS]
    reports, geo = [], {}
    for rel in files:
        r, gdat = check(rel); reports.append(r); geo[rel] = gdat
        print(f"{rel:28s} {r['tris']:5d} tris  {r['size_m'][0]:.3f} x {r['size_m'][1]:.3f} x {r['size_m'][2]:.3f} m  {r['kb']:5.1f} KB  {r['facing']}  {'ISSUES: ' + '; '.join(r['issues']) if r['issues'] else 'ok'}")
    json.dump(reports, open(os.path.join(HERE, "check_report.json"), "w"), indent=1)
    # ---- preview sheet
    TILE, HALF = 300, 150; cols_n = 8; F, Fs = font(13), font(12)
    tiles = []; seen = {}
    for rel in files:
        seen.setdefault(STATS[rel]["model"], []).append(rel)
    for model, rels in seen.items():
        T, cols, mn, org = geo[rels[0]]
        im, _, _ = render(T, cols, HALF, HALF); im = im.resize((TILE, TILE), Image.NEAREST)
        r = next(x for x in reports if x["file"] == rels[0]); s = r["size_m"]
        names = " + ".join(os.path.basename(x) for x in rels)
        tiles.append((im, names, f"{r['tris']} tris  {s[0]:.2f} x {s[1]:.2f} x {s[2]:.2f} m"))
    # lineup at one scale: units holding their guns at hand_r, plus a 1 m ruler
    def with_gun(unit, gun, dx):
        T, c, mn, org = geo[unit]; G, gc, _, _ = geo[gun] if gun else (np.zeros((0, 3, 3)), [], None, None)
        out = [T + [dx, 0, 0]]; cc = list(c)
        if gun: out.append(G + org["hand_r"] + [dx, 0, 0]); cc += gc
        return np.concatenate(out), cc
    parts = [with_gun("grunt.glb", "rifle.glb", -1.5), with_gun("scavenger.glb", "shotgun.glb", -0.5),
             with_gun("scavenger.glb", "pistol.glb", 0.5), with_gun("goat.glb", None, 1.6)]
    from geo import box
    ruler = box((0.03, 1.0, 0.03), (-2.2, 0.5, 0)); parts.append((ruler, ["#46b8a4"] * len(ruler)))
    LT = np.concatenate([p[0] for p in parts]); LC = sum([p[1] for p in parts], [])
    front = np.array([0.0, 0.25, 1.0]); front /= np.linalg.norm(front)
    im1, _, _ = render(LT, LC, 2 * HALF, HALF, view=VIEW); im1 = im1.resize((2 * TILE, TILE), Image.NEAREST)
    im2, _, _ = render(LT, LC, 2 * HALF, HALF, view=front); im2 = im2.resize((2 * TILE, TILE), Image.NEAREST)
    # goat at roughly in-game size (about 30 px nose-to-tail at half res), shown x4 nearest: are the eyes subtle?
    T, c, _, _ = geo["goat.glb"]
    side = np.array([0.9, 0.35, 0.35]); side /= np.linalg.norm(side)
    g1, sc, ce = render(T, c, 48, 40, view=side); g1 = g1.resize((TILE * 48 // 40, TILE), Image.NEAREST)
    hd = T[T[:, :, 2].mean(1) > 0.38]; hc = [cc for cc, t in zip(c, T) if t[:, 2].mean() > 0.38]
    g2, _, _ = render(hd, hc, HALF, HALF, view=side); g2 = g2.resize((TILE, TILE), Image.NEAREST)
    specials = [(im1, "lineup 3/4 (same scale, 1 m teal ruler)", "grunt+rifle | scavenger+shotgun | scavenger+pistol | goat (guns at hand_r)"),
                (im2, "lineup front", "silhouettes at the same scale"),
                (g1, "goat at ~game size (x4 nearest)", "ember eyes should barely register"),
                (g2, "goat head close-up", "material 'eye' = the only tell")]
    lab = 40; rows = math.ceil(len(tiles) / cols_n) + 1
    sheet = Image.new("RGB", (cols_n * TILE, rows * (TILE + lab) + 50), (28, 26, 24)); dr = ImageDraw.Draw(sheet)
    dr.text((10, 12), "Renegade proto 3D assets (Smudge, Oct 3 2026): low-poly glb, palette A, 3/4 view, half-res + 4 light bands (loaded back from disk)", fill=(230, 220, 190), font=font(18))
    y0 = 50
    for i, (im, name, sub) in enumerate(tiles):
        x, y = (i % cols_n) * TILE, y0 + (i // cols_n) * (TILE + lab)
        sheet.paste(im, (x, y)); dr.text((x + 6, y + TILE + 3), name, fill=(240, 232, 205), font=F); dr.text((x + 6, y + TILE + 21), sub, fill=(170, 165, 150), font=Fs)
    y = y0 + (rows - 1) * (TILE + lab); x = 0
    for im, name, sub in specials:
        sheet.paste(im, (x, y)); dr.text((x + 6, y + TILE + 3), name, fill=(240, 232, 205), font=F); dr.text((x + 6, y + TILE + 21), sub, fill=(170, 165, 150), font=Fs)
        x += im.size[0]
    sheet.save(os.path.join(OUT, "preview_assets3d.png"))
    bad = [r for r in reports if r["issues"]]
    print("preview:", os.path.join(OUT, "preview_assets3d.png"), "| files with issues:", len(bad))

if __name__ == "__main__":
    main()
