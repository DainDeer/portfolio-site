"""Build every proto 3D asset (Smudge, Oct 3 2026) into proto/assets3d/ per
/workspace/autobattler-design/proto-3d-asset-contract.md (rev. Oct 3 13:24 PT), write manifest.json and build_stats.json.
Run:  python3 proto/assets3d/src/build_assets3d.py   (needs numpy + scipy)"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import build_units as U, build_props as B
from geo import write_glb

OUT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))

def place(root, how):
    """Contract origins. 'ground': bbox centred in X/Z, base at y=0 (single-node props).
    'ground_z': like ground but X kept (fence: posts stay at x = +-1). 'center': bbox centre at the origin (gibs). None: keep as modelled (units: feet at 0; weapons: grip)."""
    if how is None: return
    assert not root.kids, "only single-node assets get re-centred"
    allv = np.concatenate([t.reshape(-1, 3) for L in root.geo.values() for t in L])
    lo, hi = allv.min(0), allv.max(0); c = (lo + hi) / 2
    shift = {"ground": np.array([-c[0], -lo[1], -c[2]]), "ground_z": np.array([0, -lo[1], -c[2]]), "center": -c}[how]
    for m in root.geo: root.geo[m] = [t + shift for t in root.geo[m]]

# File names = proto-3d-asset-contract.md section 4 (revised Oct 3 13:24 PT): flat, in proto/assets3d/.
# They are also exactly the names proto/battle3d_goats + proto/battle3d_urban request.
# (name, builder, placement, budget, single_primitive)
ASSETS = [
    ("grunt", U.grunt, None, 1200, False),
    ("goat", U.goat, None, 1200, False),
    ("scavenger", lambda: U.scav("raider"), None, 1200, False),
    ("rifle", B.pipe_rifle, None, 250, False),
    ("shotgun", B.shotgun, None, 250, False),
    ("pistol", B.pistol, None, 250, False),
    ("machete", B.machete, None, 250, False),
    ("weapon_hatchet", B.hatchet, None, 250, False),
    ("rock_small", lambda: B.rock("rock_small", 1, 0.42, 22, 0.7), "ground", 300, False),
    ("rock_large", lambda: B.rock("rock_large", 3, 1.2, 44, 0.55, moss=True), "ground", 300, False),
    ("fence_wood", B.fence_segment, "ground_z", 300, False),
    ("grass_tuft", B.grass_tuft, "ground", 60, True),
    ("tree_lone", B.tree_lone, "ground", 1500, False),
    ("wall_drystone", B.wall_drystone, "ground", 1500, False),
    ("car_wreck", B.car_wreck, "ground", 1500, False),
    ("barrier", B.jersey_barrier, "ground", 1500, False),
    ("crate", B.crate, "ground", 300, False),
    ("wall_chunk", B.wall_chunk, "ground", 1500, False),
    ("wall_shopfront", B.wall_shopfront, "ground", 1500, False),
    ("streetlight", B.streetlight, "ground", 1500, False),
    ("shell_casing", B.shell_casing, "center", 24, True),
    ("gib_01", lambda: B.gib("1"), "center", 80, True),
    ("gib_02", lambda: B.gib("2"), "center", 80, True),
    ("gib_03", lambda: B.gib("3"), "center", 80, True),
    ("gib_04", lambda: B.gib("4"), "center", 80, True),
    ("gib_05", lambda: B.gib("5"), "center", 80, True),
]

def main():
    stats = []
    for name, fn, how, budget, single in ASSETS:
        rel = name + ".glb"
        root, mats = fn(); place(root, how); root.name = name
        size = write_glb(os.path.join(OUT, rel), root, mats, single=single)
        tris = sum(n.tris() for n in root.walk())
        stats.append({"file": rel, "model": name, "tris": tris, "budget": budget, "bytes": size, "single": single})
        flag = "" if tris <= budget else "  OVER BUDGET"
        print(f"{rel:22s} {tris:5d} tris (budget {budget}) {size/1024:6.1f} KB{flag}")
    man = {"files": [s["file"] for s in stats]}
    with open(os.path.join(OUT, "manifest.json"), "w") as f: json.dump(man, f, indent=2); f.write("\n")
    with open(os.path.join(os.path.dirname(__file__), "build_stats.json"), "w") as f: json.dump(stats, f, indent=1)

if __name__ == "__main__":
    main()
