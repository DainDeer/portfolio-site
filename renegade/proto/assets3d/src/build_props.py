"""Weapons, props, gibs and extras. Origins: props on the ground (base y=0, centred X/Z), weapons at the grip,
gibs at their bounding-box centre (they are physics chunks). Facing +Z."""
import math
import numpy as np
from geo import Node, P, box, frustum, seg, prism, hull, split, xf, rx, ry, rz, hexa, rng, orient

M = {}
def mat(name, hexv, role=None):
    M[name] = {"hex": hexv, "role": role or name}; return name

def rock_pts(seed, size, n, squash, flat=0.18):
    g = rng(seed); pts = []
    for _ in range(n):
        v = g.normal(size=3); v /= np.linalg.norm(v)
        r = size / 2 * (0.75 + 0.25 * g.random())
        pts.append((v[0] * r * (1 + 0.15 * g.random()), v[1] * r * squash, v[2] * r * (0.85 + 0.2 * g.random())))
    pts = np.array(pts); lo = pts[:, 1].min() + flat * (pts[:, 1].max() - pts[:, 1].min())
    pts[:, 1] = np.maximum(pts[:, 1], lo); pts[:, 1] -= lo
    return pts

def rock(name, seed, size, n, squash, moss=False):
    M.clear(); top = mat("rock_light", P("metal", 2)); side = mat("rock", P("metal", 1)); warm = mat("rock_warm", P("leather", 1))
    mz = mat("moss", P("mutant", 1)) if moss else None
    r = Node(name); T = hull(rock_pts(seed, size, n, squash))
    up, rest = split(T, lambda nn, c: nn[:, 1] > 0.55)
    g = rng(seed + 7); pick = g.random(len(rest)) < 0.4
    if moss:
        mm = g.random(len(up)) < 0.35; r.add(mz, up[mm]); up = up[~mm]
    r.add(top, up); r.add(warm, rest[pick]); r.add(side, rest[~pick])
    return r, dict(M)

# ------------------------------------------------------------------------------------------- weapons
def pipe_rifle():
    M.clear(); wood = mat("wood", P("leather", 1)); wood_l = mat("wood_light", P("leather", 2)); steel = mat("gun_steel", P("metal", 1))
    dark = mat("gun_dark", P("metal", 0)); bright = mat("gun_bright", P("metal", 2)); rubber = mat("butt_pad", P("leather", 0))
    r = Node("rifle")
    r.add(wood, seg((0, -0.10, -0.035), (0, 0.035, 0.0), (0.032, 0.05)))                       # pistol grip
    r.add(steel, box((0.05, 0.065, 0.28), (0, 0.065, 0.06)))                                     # receiver
    r.add(wood, hexa([(-0.022, 0.035, -0.08), (0.022, 0.035, -0.08), (0.024, -0.04, -0.33), (-0.024, -0.04, -0.33),
                      (-0.022, 0.095, -0.08), (0.022, 0.095, -0.08), (0.024, 0.10, -0.33), (-0.024, 0.10, -0.33)]))  # stock
    r.add(rubber, box((0.052, 0.145, 0.02), (0, 0.03, -0.34)))                                   # butt plate
    r.add(wood_l, box((0.056, 0.05, 0.15), (0, 0.07, 0.275)))                                    # handguard
    r.add(dark, prism(6, 0.016, 0.016, (0, 0.075, 0.20), (0, 0.075, 0.55)))                      # pipe barrel
    r.add(bright, prism(6, 0.024, 0.024, (0, 0.075, 0.385), (0, 0.075, 0.415)))                  # pipe coupling
    r.add(bright, prism(6, 0.021, 0.021, (0, 0.075, 0.535), (0, 0.075, 0.555)))                  # muzzle ring
    r.add(dark, box((0.012, 0.035, 0.015), (0, 0.105, 0.52)))                                    # front sight
    r.add(dark, box((0.03, 0.02, 0.02), (0, 0.105, 0.16)))                                       # rear sight
    r.add(dark, seg((0, 0.04, 0.09), (0, -0.10, 0.125), (0.035, 0.07), (0.035, 0.065)))         # magazine
    r.add(dark, box((0.012, 0.012, 0.06), (0, -0.004, 0.03)))                                    # trigger guard
    r.kid("muzzle", (0, 0.075, 0.555)); r.kid("eject", (-0.03, 0.085, 0.08))
    return r, dict(M)

def scav_carbine():
    M.clear(); steel = mat("gun_steel", P("metal", 1)); dark = mat("gun_dark", P("metal", 0)); rust = mat("scrap_rust", P("rust", 2))
    cloth = mat("wrap_cloth", P("mutant", 1)); rubber = mat("butt_pad", P("leather", 0)); tape = mat("tape", P("leather", 2))
    r = Node("scav_carbine")
    r.add(dark, seg((0, -0.10, -0.04), (0, 0.035, 0.0), (0.032, 0.05)))
    r.add(rust, box((0.052, 0.07, 0.30), (0, 0.065, 0.07)))                                      # scrap receiver
    r.add(steel, prism(5, 0.013, 0.013, (0, 0.085, -0.08), (0, 0.06, -0.31)))                    # skeleton stock, top bar
    r.add(steel, prism(5, 0.011, 0.011, (0, -0.02, -0.04), (0, -0.02, -0.31)))                   # lower bar
    r.add(rubber, box((0.05, 0.14, 0.035), (0, 0.03, -0.325)))                                   # big butt pad
    r.add(cloth, box((0.058, 0.055, 0.15), (0, 0.068, 0.29)))                                    # rag-wrapped handguard
    r.add(dark, prism(6, 0.015, 0.015, (0, 0.075, 0.22), (0, 0.075, 0.45)))
    r.add(steel, box((0.042, 0.042, 0.06), (0, 0.075, 0.46)))                                    # muzzle brake chunk
    r.add(dark, box((0.012, 0.03, 0.015), (0, 0.105, 0.40)))
    r.add(steel, box((0.03, 0.03, 0.05), (0, 0.112, 0.12)))                                      # scrap scope block
    r.add(dark, seg((0, 0.04, 0.12), (0, -0.05, 0.14), (0.034, 0.075)))                          # banana mag, two bends
    r.add(dark, seg((0, -0.05, 0.14), (0, -0.13, 0.19), (0.034, 0.075), (0.034, 0.07)))
    r.add(tape, box((0.04, 0.03, 0.08), (0, -0.045, 0.14)))
    r.kid("muzzle", (0, 0.075, 0.49)); r.kid("eject", (-0.03, 0.085, 0.09))
    return r, dict(M)

def pistol():
    M.clear(); dark = mat("gun_dark", P("metal", 0)); steel = mat("gun_steel", P("metal", 1)); grip = mat("wood", P("leather", 1)); bore = mat("bore", P("outline", 0))
    r = Node("pistol")
    r.add(grip, seg((0, -0.08, -0.03), (0, 0.02, 0.0), (0.03, 0.048)))                           # grip, raked back
    r.add(steel, box((0.03, 0.034, 0.20), (0, 0.047, 0.06)))                                     # slide (lighter, reads on top)
    r.add(dark, box((0.026, 0.022, 0.13), (0, 0.02, 0.035)))                                     # frame
    r.add(dark, box((0.01, 0.03, 0.05), (0, -0.01, 0.035)))                                      # trigger guard
    r.add(bore, box((0.014, 0.014, 0.004), (0, 0.05, 0.161)))                                    # muzzle bore
    r.add(dark, box((0.008, 0.012, 0.01), (0, 0.069, 0.15)))                                     # front sight
    r.add(dark, box((0.032, 0.016, 0.02), (0, 0.068, -0.03)))                                    # rear sight / hammer
    r.kid("muzzle", (0, 0.05, 0.163)); r.kid("eject", (-0.02, 0.06, 0.05))
    return r, dict(M)

def hatchet():
    """Melee, in the pages' convention (figures.js makeWeapon turns melee by rotation.x = PI/2, so +Z ends up
    pointing down the arm): origin = grip, handle along +Z with the head at the +Z end, cutting edge facing +X."""
    M.clear(); wood = mat("wood_light", P("leather", 2)); wrap = mat("grip_wrap", P("leather", 0)); steel = mat("blade", P("metal", 1)); edge = mat("blade_edge", P("metal", 2))
    r = Node("weapon_hatchet")
    r.add(wood, seg((0, 0, -0.10), (0.0, 0, 0.36), (0.032, 0.026), (0.03, 0.024)))
    r.add(wrap, seg((0, 0, -0.10), (0, 0, 0.06), (0.038, 0.032)))
    r.add(steel, hexa([(-0.04, -0.012, 0.30), (-0.04, -0.012, 0.37), (-0.04, 0.012, 0.37), (-0.04, 0.012, 0.30),
                       (0.10, -0.009, 0.27), (0.10, -0.009, 0.40), (0.10, 0.009, 0.40), (0.10, 0.009, 0.27)]))
    r.add(edge, hexa([(0.10, -0.009, 0.27), (0.10, -0.009, 0.40), (0.10, 0.009, 0.40), (0.10, 0.009, 0.27),
                      (0.13, -0.003, 0.26), (0.13, -0.003, 0.41), (0.13, 0.003, 0.41), (0.13, 0.003, 0.26)]))
    r.kid("tip", (0.13, 0, 0.335))
    return r, dict(M)

def machete():
    """Same melee convention as the hatchet: blade along +Z from the grip, edge facing +X, spine -X."""
    M.clear(); steel = mat("blade", P("metal", 1)); edge = mat("blade_edge", P("metal", 2)); grip = mat("grip_wrap", P("leather", 0)); rust = mat("blade_rust", P("rust", 2))
    r = Node("machete")
    r.add(grip, seg((0, 0, -0.08), (0, 0, 0.06), (0.034, 0.028), (0.03, 0.026)))
    r.add(steel, box((0.06, 0.03, 0.02), (0.005, 0, 0.065)))                                     # guard
    r.add(steel, hexa([(-0.022, -0.007, 0.075), (-0.022, -0.007, 0.40), (-0.022, 0.007, 0.40), (-0.022, 0.007, 0.075),
                       (0.022, -0.005, 0.075), (0.045, -0.005, 0.36), (0.045, 0.005, 0.36), (0.022, 0.005, 0.075)]))
    r.add(edge, hexa([(0.022, -0.005, 0.075), (0.045, -0.005, 0.36), (0.045, 0.005, 0.36), (0.022, 0.005, 0.075),
                      (0.032, -0.002, 0.075), (0.056, -0.002, 0.36), (0.056, 0.002, 0.36), (0.032, 0.002, 0.075)]))
    r.add(steel, hexa([(-0.022, -0.007, 0.40), (-0.022, 0.007, 0.40), (0.056, 0.002, 0.36), (0.056, -0.002, 0.36),
                       (-0.022, -0.004, 0.43), (-0.022, 0.004, 0.43), (0.02, 0.002, 0.42), (0.02, -0.002, 0.42)]))   # clipped tip
    r.add(rust, box((0.03, 0.016, 0.08), (-0.004, 0, 0.2)))
    r.kid("tip", (0.0, 0, 0.43))
    return r, dict(M)

def shotgun():
    M.clear(); wood = mat("wood", P("leather", 1)); dark = mat("gun_dark", P("metal", 0)); steel = mat("gun_steel", P("metal", 1)); rubber = mat("butt_pad", P("leather", 0)); pump = mat("wood_light", P("leather", 2))
    r = Node("shotgun")
    r.add(wood, seg((0, -0.10, -0.035), (0, 0.035, 0.0), (0.034, 0.05)))
    r.add(dark, box((0.05, 0.07, 0.20), (0, 0.06, 0.04)))
    r.add(wood, hexa([(-0.023, 0.03, -0.06), (0.023, 0.03, -0.06), (0.025, -0.055, -0.30), (-0.025, -0.055, -0.30),
                      (-0.023, 0.09, -0.06), (0.023, 0.09, -0.06), (0.025, 0.09, -0.30), (-0.025, 0.09, -0.30)]))
    r.add(rubber, box((0.054, 0.155, 0.02), (0, 0.018, -0.31)))
    r.add(dark, prism(6, 0.019, 0.019, (0, 0.08, 0.14), (0, 0.08, 0.44)))                        # barrel
    r.add(steel, prism(6, 0.014, 0.014, (0, 0.045, 0.14), (0, 0.045, 0.39)))                     # mag tube
    r.add(pump, box((0.05, 0.045, 0.12), (0, 0.048, 0.27)))                                      # pump
    r.add(steel, box((0.012, 0.012, 0.012), (0, 0.105, 0.43)))                                   # bead sight
    r.add(dark, box((0.012, 0.012, 0.06), (0, -0.004, 0.03)))
    r.kid("muzzle", (0, 0.08, 0.44)); r.kid("eject", (-0.03, 0.08, 0.06))
    return r, dict(M)

def shell_casing():
    """Contract: <= 24 tris, about 9 mm x 35 mm along Z, instanced (fx.js takes the first mesh): one primitive."""
    M.clear(); brass = mat("brass", P("glow", 0)); rim = mat("brass_dark", P("leather", 2)); mouth = mat("casing_mouth", P("leather", 0))
    r = Node("shell_casing")
    T = prism(6, 0.0047, 0.0034, (0, 0, -0.0175), (0, 0, 0.0175))
    back, rest = split(T, lambda n, c: n[:, 2] < -0.9); front, side = split(rest, lambda n, c: n[:, 2] > 0.9)
    r.add(brass, side); r.add(rim, back); r.add(mouth, front)
    return r, dict(M)

# ------------------------------------------------------------------------------------------- outdoor props
def fence_segment():
    M.clear(); post = mat("wood_post", P("leather", 1)); rail = mat("wood_rail", P("leather", 2)); top = mat("wood_dark", P("leather", 0))
    r = Node("fence_segment")
    for x, lean in ((-1.0, 0.035), (1.0, -0.02)):
        R = rz(lean) @ rx(0.02)
        r.add(post, xf(frustum(0.0, 1.04, 0.115, 0.115, 0.10, 0.10), R, (x, 0, 0)))
        r.add(top, xf(frustum(1.04, 1.11, 0.10, 0.10, 0.05, 0.06), R, (x, 0, 0)))
    r.add(rail, box((2.16, 0.09, 0.045), (0, 0.44, 0.08), rz(0.02)))
    r.add(rail, box((2.18, 0.10, 0.045), (0, 0.88, 0.08), rz(-0.025)))
    r.add(top, box((0.05, 0.05, 0.02), (-1.0, 0.44, 0.11)))                                      # nail-plate scraps
    r.add(top, box((0.05, 0.05, 0.02), (1.0, 0.88, 0.11)))
    return r, dict(M)

def fence_post():
    M.clear(); post = mat("wood_post", P("leather", 1)); rail = mat("wood_rail", P("leather", 2)); dark = mat("wood_dark", P("leather", 0))
    r = Node("fence_post"); R = rz(-0.12) @ rx(0.06)
    r.add(dark, xf(frustum(-0.05, 0.16, 0.13, 0.13, 0.12, 0.12), R))
    r.add(post, xf(frustum(0.16, 0.78, 0.12, 0.12, 0.105, 0.105), R))
    g = rng(5); pts = [(g.uniform(-0.055, 0.055), 0.78 + g.uniform(0, 0.16) * (1 if i % 2 else 0.4), g.uniform(-0.055, 0.055)) for i in range(9)]
    pts += [(-0.055, 0.78, -0.055), (0.055, 0.78, -0.055), (0.055, 0.78, 0.055), (-0.055, 0.78, 0.055)]
    r.add(post, xf(hull(pts), R))                                                                # splintered top
    r.add(rail, xf(box((0.5, 0.09, 0.045), (0.2, 0.52, 0.08), rz(-0.55)), R))                   # broken rail stub, hanging
    return r, dict(M)

def tree_dead():
    M.clear(); bark = mat("bark", P("leather", 1)); bark_d = mat("bark_dark", P("leather", 0)); branch = mat("branch", P("leather", 2)); twig = mat("twig", P("metal", 2))
    r = Node("tree_dead")
    trunk = [((0, -0.05, 0), 0.21), ((0.05, 0.9, 0.02), 0.17), ((0.13, 1.8, -0.05), 0.13), ((0.08, 2.6, 0.0), 0.085), ((0.16, 3.25, 0.06), 0.035)]
    for i in range(len(trunk) - 1):
        (a, ra), (b, rb) = trunk[i], trunk[i + 1]
        r.add(bark_d if i == 0 else bark, prism(6, ra, rb, a, b))
    for ang in (0.3, 2.4, 4.3):
        d = np.array([math.cos(ang), 0, math.sin(ang)])
        r.add(bark_d, prism(5, 0.09, 0.02, (0, 0.25, 0), tuple(d * 0.55 + [0, -0.02, 0])))      # root flare
    limbs = [[(0.11, 1.65, -0.04), (-0.55, 2.35, 0.18), (-0.95, 3.0, 0.38), (-1.05, 3.4, 0.45)],
             [(0.11, 2.15, -0.03), (0.75, 2.75, -0.30), (1.15, 3.25, -0.25)],
             [(0.09, 2.55, 0.0), (0.25, 3.05, 0.55), (0.15, 3.5, 0.80)],
             [(0.12, 1.25, 0.0), (0.6, 1.6, 0.45), (0.85, 1.8, 0.75)]]
    radii = [[0.075, 0.05, 0.025, 0.008], [0.065, 0.035, 0.008], [0.05, 0.025, 0.006], [0.05, 0.025, 0.006]]
    for L, R in zip(limbs, radii):
        for i in range(len(L) - 1):
            r.add(branch if i == 0 else twig, prism(5 if i == 0 else 4, R[i], R[i + 1], L[i], L[i + 1]))
    for a, b in [((-0.55, 2.35, 0.18), (-0.4, 2.9, -0.1)), ((0.75, 2.75, -0.3), (1.0, 2.85, -0.75)), ((0.25, 3.05, 0.55), (0.6, 3.35, 0.6))]:
        r.add(twig, prism(3, 0.022, 0.004, a, b))
    return r, dict(M)

def tree_lone():
    M.clear(); bark = mat("bark", P("leather", 1)); bark_d = mat("bark_dark", P("leather", 0))
    lg = mat("leaf_light", P("mutant", 2)); lm = mat("leaf", P("mutant", 1)); ld = mat("leaf_dark", P("mutant", 0))
    r = Node("tree_lone")
    r.add(bark_d, prism(6, 0.24, 0.19, (0, -0.05, 0), (0.05, 1.0, 0)))
    r.add(bark, prism(6, 0.19, 0.12, (0.05, 1.0, 0), (0.1, 2.3, 0.05)))
    r.add(bark, prism(5, 0.08, 0.04, (0.08, 1.9, 0.03), (-0.7, 2.6, 0.2)))
    for i, (c, s) in enumerate([((0.1, 3.1, 0.05), 1.55), ((-0.75, 2.75, 0.25), 1.0), ((0.75, 2.9, -0.35), 1.05), ((0.0, 3.85, 0.0), 1.0)]):
        g = rng(40 + i); pts = []
        for _ in range(16):
            v = g.normal(size=3); v /= np.linalg.norm(v); pts.append(np.array(c) + v * s / 2 * np.array([1.1, 0.8, 1.1]) * (0.8 + 0.2 * g.random()))
        T = hull(pts); up, rest = split(T, lambda n, cc: n[:, 1] > 0.45)
        lowp, mid = split(rest, lambda n, cc: n[:, 1] < -0.3)
        r.add(lg, up); r.add(lm, mid); r.add(ld, lowp)
    return r, dict(M)

def grass_tuft():
    M.clear(); a = mat("grass", P("mutant", 1)); b = mat("grass_light", P("mutant", 2)); dry = mat("grass_dry", P("leather", 2))
    r = Node("grass_tuft"); g = rng(11)
    for i in range(12):
        ang = i * 2.4 + g.uniform(-0.3, 0.3); rad = g.uniform(0.0, 0.07)
        bx, bz = math.cos(ang) * rad, math.sin(ang) * rad
        h = g.uniform(0.18, 0.34); lean = g.uniform(0.04, 0.12)
        tip = (bx + math.cos(ang) * lean, h, bz + math.sin(ang) * lean)
        w = 0.022; base = [(bx + w * math.cos(ang + k * 2.094 + 0.5), 0, bz + w * math.sin(ang + k * 2.094 + 0.5)) for k in range(3)]
        T = np.array([[base[0], base[1], tip], [base[1], base[2], tip], [base[2], base[0], tip], [base[0], base[2], base[1]]], float)
        T = orient(T, np.mean(base + [tip], axis=0))
        r.add(dry if i in (3, 9) else (b if i % 2 else a), T)
    return r, dict(M)

# ------------------------------------------------------------------------------------------- urban props
def car_wreck():
    M.clear(); paint = mat("car_soot", P("metal", 1)); rust = mat("car_rust", P("rust", 2)); rust_d = mat("car_rust_dark", P("rust", 0))
    glass = mat("car_burnt_out", P("outline", 0)); tire = mat("tire_melted", P("metal", 0)); rim = mat("rim", P("metal", 2)); chrome = mat("bumper", P("metal", 1)); hole = mat("light_socket", P("outline", 0))
    r = Node("car_wreck")
    R = rx(0.025) @ rz(0.03); piv = (0, 0.3, 0); drop = -0.10   # sits low on its rims
    def add(m, T): r.add(m, xf(T, R, (0, drop, 0), about=piv))
    body = []
    for sx in (-1, 1):
        body += [(sx * 0.87, 0.30, -2.0), (sx * 0.86, 0.85, -1.97), (sx * 0.87, 0.86, -1.05), (sx * 0.87, 0.83, 1.3),
                 (sx * 0.84, 0.72, 2.02), (sx * 0.87, 0.40, 2.04), (sx * 0.87, 0.40, -2.04), (sx * 0.87, 0.30, 1.92)]
    B = hull(body)
    top, rest = split(B, lambda n, c: n[:, 1] > 0.5)
    under, sides = split(rest, lambda n, c: n[:, 1] < -0.5)
    add(paint, top); add(paint, sides); add(rust_d, under)
    cab = []
    for sx in (-1, 1):
        cab += [(sx * 0.81, 0.83, 0.75), (sx * 0.81, 0.84, -1.05), (sx * 0.65, 1.38, 0.25), (sx * 0.65, 1.38, -0.65)]
    add(glass, hull(cab))
    add(paint, box((1.34, 0.05, 0.95), (0, 1.395, -0.2)))
    for sx in (-1, 1):
        add(paint, seg((sx * 0.80, 0.83, 0.74), (sx * 0.655, 1.39, 0.24), (0.07, 0.08)))       # A pillar
        add(paint, seg((sx * 0.80, 0.84, -1.04), (sx * 0.655, 1.39, -0.64), (0.07, 0.1)))      # C pillar
        add(paint, seg((sx * 0.78, 0.84, -0.18), (sx * 0.665, 1.39, -0.2), (0.06, 0.08)))      # B pillar
        add(rust, box((0.02, 0.15, 2.5), (sx * 0.875, 0.45, 0.1)))                              # rotten door bottoms
        add(hole, box((0.26, 0.12, 0.02), (sx * 0.58, 0.62, 2.035)))                            # headlight sockets
        add(rust_d, box((0.30, 0.12, 0.02), (sx * 0.58, 0.68, -1.985)))                         # tail lights
    add(chrome, box((1.80, 0.14, 0.10), (0, 0.40, 2.07)))
    add(rust, box((1.80, 0.14, 0.10), (0, 0.40, -2.07)))
    add(rust, box((0.75, 0.012, 0.42), (0.2, 0.785, 1.66), rx(0.142)))                          # hood rust patch
    add(rust, box((0.75, 0.012, 0.55), (-0.2, 1.425, -0.3)))                                  # roof rust patch
    add(rust_d, box((0.5, 0.012, 0.5), (0.1, 0.86, -1.55)))                                     # trunk patch
    add(rust, box((0.02, 0.22, 0.55), (0.875, 0.62, 1.55)))                                     # fender rot (left front)
    add(rust, box((0.02, 0.20, 0.45), (-0.875, 0.60, -1.5)))                                    # fender rot (right rear)
    add(rust, box((0.02, 0.18, 0.7), (-0.875, 0.66, 0.2)))                                      # door rot (right)
    for x, z, ok in ((0.80, 1.30, True), (-0.80, 1.30, False), (0.80, -1.30, True), (-0.80, -1.30, True)):
        sx = 1 if x > 0 else -1
        # burnt out: tyres gone, the car sits on its bare (rusted) rims; one corner lower
        rr = 0.21 if ok else 0.19
        r.add(rust_d, prism(8, rr, rr, (x - sx * 0.09, rr, z), (x + sx * 0.09, rr, z)))
        r.add(tire, prism(8, 0.12, 0.12, (x + sx * 0.085, rr, z), (x + sx * 0.10, rr, z)))
    return r, dict(M)

def jersey_barrier():
    M.clear(); conc = mat("concrete", P("metal", 2)); grime = mat("concrete_grime", P("metal", 1)); slot = mat("slot", P("metal", 0)); rebar = mat("rebar", P("rust", 2))
    r = Node("jersey_barrier")
    r.add(grime, box((2.0, 0.075, 0.61), (0, 0.0375, 0)))
    r.add(conc, xf(frustum(0.075, 0.33, 0.61, 2.0, 0.254, 2.0), ry(math.pi / 2)))
    r.add(conc, xf(frustum(0.33, 0.81, 0.254, 1.85, 0.154, 1.85, cz=0.075), ry(math.pi / 2)))  # spans x -1 .. 0.85
    r.add(conc, xf(frustum(0.33, 0.60, 0.254, 0.15, 0.2, 0.15, cz=-0.925), ry(math.pi / 2)))   # chipped end
    for x in (-0.55, 0.55): r.add(slot, box((0.25, 0.06, 0.62), (x, 0.03, 0)))
    r.add(rebar, prism(4, 0.008, 0.008, (0.93, 0.5, 0.0), (0.97, 0.76, 0.02)))
    r.add(rebar, prism(4, 0.008, 0.008, (0.92, 0.45, -0.04), (0.99, 0.66, -0.07)))
    return r, dict(M)

def dumpster():
    M.clear(); body = mat("dumpster_paint", P("mutant", 1)); trim = mat("dumpster_trim", P("mutant", 0)); lid = mat("dumpster_lid", P("metal", 0))
    rust = mat("dumpster_rust", P("rust", 2)); wheel = mat("caster", P("metal", 1))
    r = Node("dumpster")
    r.add(body, frustum(0.12, 1.05, 1.70, 0.95, 1.80, 1.05))
    r.add(trim, box((1.86, 0.07, 1.10), (0, 1.06, 0)))
    for sx in (-1, 1):
        r.add(trim, box((0.07, 0.13, 0.95), (sx * 0.91, 0.72, 0)))                              # fork pockets
        for z in (-0.38, 0.38): r.add(wheel, box((0.09, 0.12, 0.09), (sx * 0.72, 0.06, z)))
    r.add(lid, box((0.9, 0.04, 1.10), (-0.45, 1.115, 0.0), rx(-0.04)))                          # closed lid half
    r.add(lid, xf(box((0.9, 0.04, 1.08), (0.46, 1.10, 0.0)), rx(-0.45), about=(0, 1.10, -0.54)))  # propped-open half
    r.add(rust, box((0.7, 0.30, 0.012), (-0.35, 0.32, 0.485)))
    r.add(rust, box((0.012, 0.25, 0.4), (0.865, 0.4, 0.2)))
    return r, dict(M)

def crate():
    M.clear(); core = mat("crate_board", P("leather", 1)); frame = mat("crate_frame", P("leather", 2)); dark = mat("crate_stencil", P("leather", 0))
    r = Node("crate"); s = 0.8; h = s / 2; t = 0.075
    r.add(core, box((s - 0.04, s - 0.04, s - 0.04), (0, h, 0)))
    for a in (-1, 1):
        for b in (-1, 1):
            r.add(frame, box((s, t, t), (0, h + a * (h - t / 2), b * (h - t / 2))))
            r.add(frame, box((t, s - 2 * t, t), (a * (h - t / 2), h, b * (h - t / 2))))
            r.add(frame, box((t, t, s - 2 * t), (a * (h - t / 2), h + b * (h - t / 2), 0)))
    for z in (-1, 1):
        r.add(frame, seg((-h + t, t, z * (h - 0.02)), (h - t, s - t, z * (h - 0.02)), (0.07, 0.035)))
    r.add(dark, box((0.2, 0.12, 0.012), (0.17, 0.22, h - 0.01)))                                 # stencil block
    return r, dict(M)

def barrel():
    M.clear(); paint = mat("drum_paint", P("mutant", 1)); rib = mat("drum_rust", P("rust", 2)); rim = mat("drum_rim", P("metal", 1)); dark = mat("drum_cap", P("metal", 0))
    r = Node("barrel")
    r.add(paint, prism(10, 0.29, 0.29, (0, 0, 0), (0, 0.88, 0)))
    for y in (0.29, 0.58): r.add(rib, prism(10, 0.302, 0.302, (0, y - 0.018, 0), (0, y + 0.018, 0)))
    r.add(rim, prism(10, 0.296, 0.296, (0, 0.86, 0), (0, 0.895, 0)))
    r.add(dark, prism(6, 0.035, 0.035, (0.14, 0.88, 0.06), (0.14, 0.905, 0.06)))
    r.add(rib, box((0.22, 0.2, 0.012), (0.0, 0.42, 0.291)))
    return r, dict(M)

def sandbags():
    M.clear(); a = mat("burlap", P("leather", 2)); b = mat("burlap_dark", P("leather", 1))
    r = Node("sandbags"); g = rng(3)
    def bag(c, yaw):
        hx, hy, hz = 0.22, 0.075, 0.14; pts = []
        for sx in (-1, 1):
            for sz in (-1, 1):
                for sy in (-1, 1):
                    pts.append((sx * hx, sy * hy * 0.8, sz * hz * 0.7))
                pts.append((sx * hx * 0.8, 0, sz * hz))
        return xf(hull(pts), ry(yaw), c)
    rows = [(5, 0.075), (4, 0.215), (3, 0.355)]   # bag height 0.15, rows touch
    k = 0
    for n, y in rows:
        for i in range(n):
            x = (i - (n - 1) / 2) * 0.43 + g.uniform(-0.02, 0.02)
            T = bag((x, y, g.uniform(-0.02, 0.02)), g.uniform(-0.08, 0.08))
            r.add(a if k % 3 else b, T); k += 1
    return r, dict(M)

def wall_columns(r, mat_name, x0, x1, heights, t=0.15, y0=0.18):
    xs = np.linspace(x0, x1, len(heights) + 1)
    for i, h in enumerate(heights):
        a, b = xs[i], xs[i + 1]
        r.add(mat_name, hexa([(a, y0, -t), (b, y0, -t), (b, y0, t), (a, y0, t), (a, h, -t), (b, h, -t), (b, h, t), (a, h, t)]))

def wall_ruin(variant):
    M.clear(); brick = mat("brick", P("skin", 1)); brick_d = mat("brick_dark", P("skin", 0)); plaster = mat("plaster", P("bone", 1))
    conc = mat("concrete", P("metal", 2)); grime = mat("concrete_grime", P("metal", 1))
    name = "wall_ruin_" + variant; r = Node(name); g = rng(21 if variant == "a" else 22)
    if variant == "a":
        L = 3.6
        r.add(conc, box((L + 0.1, 0.18, 0.38), (0, 0.09, 0)))
        wall_columns(r, brick, -L / 2, L / 2, [1.15, 1.6, 2.05, 2.45, 2.6, 2.6, 2.3, 2.4, 1.85, 1.5, 0.95, 0.7, 0.85, 0.5])
        r.add(plaster, box((1.1, 0.75, 0.01), (-0.15, 1.35, 0.155)))
        r.add(plaster, box((0.5, 0.4, 0.01), (0.9, 0.8, 0.155)))
        r.add(plaster, box((0.8, 0.6, 0.01), (0.3, 1.1, -0.155)))
        r.add(brick_d, box((0.3, 0.07, 0.31), (-0.05, 2.635, 0)))                                  # loose top course
        r.add(brick_d, box((0.25, 0.07, 0.31), (1.25, 0.985, 0.0)))
        span = (-1.4, 1.6)
    else:
        L = 3.2; x0 = -L / 2
        r.add(conc, box((L + 0.1, 0.18, 0.38), (0, 0.09, 0)))
        wall_columns(r, brick, x0, -0.55, [2.3, 2.6, 2.75, 2.5])                                   # left pier
        wall_columns(r, brick, -0.55, 0.45, [0.95, 0.95, 0.95, 0.9])                               # under the window
        wall_columns(r, brick, 0.45, L / 2, [2.15, 1.9, 1.55, 1.1, 0.6])                           # broken right pier
        r.add(conc, box((1.15, 0.06, 0.36), (-0.05, 0.96, 0)))                                     # sill
        r.add(conc, box((1.3, 0.16, 0.32), (-0.2, 2.02, 0), rz(-0.12)))                            # sagging lintel
        r.add(plaster, box((0.7, 0.9, 0.01), (-1.15, 1.4, 0.155)))
        r.add(plaster, box((0.6, 0.45, 0.01), (0.0, 0.5, 0.155)))
        r.add(plaster, box((0.5, 0.7, 0.01), (0.95, 0.9, -0.155)))
        span = (-1.2, 1.3)
    for i in range(6):                                                                             # loose bricks at the foot
        x = g.uniform(*span); z = g.choice([-1, 1]) * g.uniform(0.25, 0.55)
        r.add(brick_d if i % 2 else brick, box((0.22, 0.07, 0.11), (x, 0.035, z), ry(g.uniform(0, 3))))
    for i in range(2):
        c = np.array([g.uniform(*span), 0, g.choice([-1, 1]) * 0.35]); pts = c + g.normal(size=(10, 3)) * [0.16, 0.08, 0.14]
        pts[:, 1] = np.abs(pts[:, 1]); r.add(grime, hull(pts))
    return r, dict(M)

def streetlight():
    M.clear(); pole = mat("pole", P("metal", 1)); dark = mat("pole_dark", P("metal", 0)); rust = mat("pole_rust", P("rust", 2)); lens = mat("lamp_lens", P("bone", 1))
    r = Node("streetlight"); R = rz(0.035) @ rx(-0.02)                                             # leaning
    def add(m, T): r.add(m, xf(T, R))
    add(dark, prism(8, 0.16, 0.14, (0, 0, 0), (0, 0.32, 0)))
    add(rust, prism(8, 0.145, 0.125, (0, 0.32, 0), (0, 0.38, 0)))
    add(pole, prism(6, 0.07, 0.048, (0, 0.38, 0), (0, 4.15, 0)))
    add(dark, box((0.06, 0.18, 0.02), (0, 0.8, 0.07)))                                             # access hatch
    add(pole, prism(5, 0.04, 0.035, (0, 4.05, 0), (0, 4.36, 0.4)))
    add(pole, prism(5, 0.035, 0.03, (0, 4.36, 0.4), (0, 4.43, 1.0)))
    add(dark, box((0.24, 0.11, 0.46), (0, 4.42, 1.15)))
    add(lens, box((0.17, 0.03, 0.34), (0, 4.355, 1.16)))
    return r, dict(M)

def debris_pile():
    M.clear(); conc = mat("concrete", P("metal", 2)); grime = mat("concrete_grime", P("metal", 1)); brick = mat("brick", P("skin", 1))
    brick_d = mat("brick_dark", P("skin", 0)); plank = mat("plank", P("leather", 2)); rebar = mat("rebar", P("rust", 2))
    r = Node("debris_pile"); g = rng(9)
    pts = g.normal(size=(18, 3)) * [0.55, 0.3, 0.45]; pts[:, 1] = np.abs(pts[:, 1]) * 1.2; pts = np.vstack([pts, [[0, 0.55, 0]]])
    T = hull(pts); up, rest = split(T, lambda n, c: n[:, 1] > 0.5); r.add(grime, rest); r.add(conc, up)
    for i in range(7):
        a = i * 0.9 + g.uniform(-0.2, 0.2); rad = g.uniform(0.45, 0.8)
        c = np.array([math.cos(a) * rad, 0, math.sin(a) * rad]); s = g.uniform(0.08, 0.2)
        p = c + g.normal(size=(9, 3)) * [s, s * 0.6, s]; p[:, 1] = np.abs(p[:, 1])
        r.add([conc, brick, grime, brick_d][i % 4], hull(p))
    for i in range(3):
        r.add(brick_d if i else brick, box((0.22, 0.07, 0.11), (g.uniform(-0.3, 0.3), 0.36 + 0.05 * i, g.uniform(-0.2, 0.2)), ry(g.uniform(0, 3)) @ rz(0.3)))
    r.add(plank, seg((-0.75, 0.04, 0.2), (0.15, 0.5, -0.1), (0.14, 0.035)))
    r.add(rebar, prism(4, 0.009, 0.009, (0.1, 0.3, 0.05), (0.35, 0.95, 0.2)))
    r.add(rebar, prism(4, 0.009, 0.009, (-0.15, 0.3, -0.1), (-0.5, 0.8, -0.25)))
    return r, dict(M)

# ------------------------------------------------------------------------------------------- gibs
def gib(kind):
    """Gore chunks. fx.js takes the FIRST mesh of each file at scale 1, so these are written single-primitive with
    vertex colours (build_assets3d.py). Centred on the bbox, <= 0.25 m, <= 80 tris. Stylised, chunky."""
    M.clear(); meat = mat("gib_meat", P("blood", 1)); dark = mat("gib_meat_dark", P("blood", 0)); bone = mat("gib_bone", P("bone", 1)); fat = mat("gib_fat", P("skin", 2))
    r = Node("gib_" + kind); g = rng(30 + int(kind))
    if kind == "1":     # meat lump
        v = g.normal(size=(16, 3)); v /= np.linalg.norm(v, axis=1, keepdims=True)
        T = hull(v * (0.8 + 0.2 * g.random((16, 1))) * [0.09, 0.065, 0.08])
        pick = g.random(len(T)); r.add(meat, T[pick < 0.55]); r.add(dark, T[(pick >= 0.55) & (pick < 0.85)]); r.add(fat, T[pick >= 0.85])
    elif kind == "2":   # bone with a meat collar
        r.add(bone, prism(5, 0.02, 0.017, (-0.1, 0, 0), (0.08, 0.005, 0)))
        r.add(bone, hull(np.array([0.11, 0.0, 0]) + g.normal(size=(8, 3)) * [0.022, 0.026, 0.03]))
        T = hull(np.array([-0.07, 0, 0]) + g.normal(size=(10, 3)) * [0.045, 0.045, 0.045])
        up, rest = split(T, lambda n, c: n[:, 1] > 0.3); r.add(meat, up); r.add(dark, rest)
    elif kind == "3":   # rib chunk
        T = hull(g.normal(size=(12, 3)) * [0.085, 0.03, 0.06])
        up, rest = split(T, lambda n, c: n[:, 1] > 0.4); r.add(meat, up); r.add(dark, rest)
        for z in (-0.03, 0.03):
            r.add(bone, prism(4, 0.009, 0.006, (0.02, 0.01, z), (0.10, 0.045, z * 1.6)))
            r.add(bone, prism(4, 0.006, 0.003, (0.10, 0.045, z * 1.6), (0.135, 0.022, z * 2.0)))
    elif kind == "4":   # knuckle: a bone ball in a meat cup
        r.add(bone, hull(np.array([0.03, 0.02, 0]) + g.normal(size=(10, 3)) * [0.035, 0.035, 0.035]))
        T = hull(np.array([-0.02, -0.01, 0]) + g.normal(size=(12, 3)) * [0.06, 0.04, 0.055])
        pick = g.random(len(T)); r.add(meat, T[pick < 0.6]); r.add(dark, T[pick >= 0.6])
    else:               # flat flap with a splinter
        T = hull(g.normal(size=(12, 3)) * [0.075, 0.02, 0.06])
        up, rest = split(T, lambda n, c: n[:, 1] > 0.4); r.add(fat if g.random() < 0.3 else meat, up); r.add(dark, rest)
        r.add(bone, prism(3, 0.008, 0.002, (-0.02, 0.01, 0.0), (0.06, 0.05, 0.05)))
    allv = np.concatenate([t.reshape(-1, 3) for L in r.geo.values() for t in L]); k = min(1.0, 0.24 / (allv.max(0) - allv.min(0)).max())
    for m in r.geo: r.geo[m] = [t * k for t in r.geo[m]]   # keep every chunk inside the contract's 0.25 m
    return r, dict(M)

# ------------------------------------------------------------------------------------------- pages-only extras
def wall_drystone():
    """A broken 2 m run of dry-stone wall along X, about 1.1 m high. Front/back faces kept nearly planar (decals)."""
    M.clear(); cols = [mat("stone", P("metal", 2)), mat("stone_dark", P("metal", 1)), mat("stone_warm", P("leather", 2)), mat("stone_brown", P("leather", 1))]
    moss = mat("moss", P("mutant", 1))
    r = Node("wall_drystone"); g = rng(17)
    y = 0.0
    courses = [(4, 0.30, 0.62), (4, 0.28, 0.56), (3, 0.27, 0.50), (3, 0.26, 0.44)]
    for row, (n, hh, d) in enumerate(courses):
        xs = np.linspace(-1.0, 1.0, n + 1) + (0.12 if row % 2 else 0)
        xs[0], xs[-1] = -1.0 + 0.03 * row, 1.0 - 0.04 * row
        for i in range(n):
            if row == 3 and i == n - 1: continue                                       # tumbled top stone at the +X end
            a, b = xs[i] + 0.015, xs[i + 1] - 0.015; j = lambda k=0.025: g.uniform(-k, k); fz = lambda: g.uniform(-0.008, 0.008)
            h1 = y + hh * g.uniform(0.88, 1.0)
            pts = [(a + j(), y, -d / 2 + fz()), (b + j(), y, -d / 2 + fz()), (b + j(), y, d / 2 + fz()), (a + j(), y, d / 2 + fz()),
                   (a + 0.025 + j(0.015), h1, -d / 2 + 0.02 + fz()), (b - 0.025 + j(0.015), h1 + j(0.02), -d / 2 + 0.02 + fz()),
                   (b - 0.025 + j(0.015), h1 + j(0.02), d / 2 - 0.02 + fz()), (a + 0.025 + j(0.015), h1, d / 2 - 0.02 + fz())]
            T = hexa(pts); c = cols[int(g.integers(0, 4))]
            if row == 3:
                up, rest = split(T, lambda nn, cc: nn[:, 1] > 0.7)
                r.add(moss if g.random() < 0.5 else c, up); r.add(c, rest)
            else:
                r.add(c, T)
        y += hh * 0.94
    return r, dict(M)

def wall_chunk():
    """A broken brick wall piece about 2.4 m along X, up to about 2.3 m (the urban page lines them up every 2.1 m)."""
    M.clear(); brick = mat("brick", P("skin", 1)); brick_d = mat("brick_dark", P("skin", 0)); plaster = mat("plaster", P("bone", 1)); conc = mat("concrete", P("metal", 2))
    r = Node("wall_chunk"); g = rng(23)
    r.add(conc, box((2.5, 0.16, 0.38), (0, 0.08, 0)))
    wall_columns(r, brick, -1.2, 1.2, [1.6, 2.05, 2.3, 2.3, 2.15, 1.75, 1.85, 1.3, 0.95], y0=0.16)
    r.add(plaster, box((0.9, 0.7, 0.01), (-0.3, 1.2, 0.155)))
    r.add(plaster, box((0.6, 0.5, 0.01), (0.5, 0.7, -0.155)))
    r.add(brick_d, box((0.27, 0.07, 0.31), (-0.45, 2.335, 0)))
    for i in range(3):
        r.add(brick_d if i % 2 else brick, box((0.22, 0.07, 0.11), (g.uniform(-1.0, 1.0), 0.035, g.choice([-1, 1]) * g.uniform(0.25, 0.45)), ry(g.uniform(0, 3))))
    return r, dict(M)

def wall_shopfront():
    """A 6 m shopfront facade along X, front = +Z (flat front for blood): door, boarded window, faded sign, cornice."""
    M.clear(); brick = mat("brick", P("skin", 1)); brick_d = mat("brick_dark", P("skin", 0)); conc = mat("concrete", P("metal", 2)); grime = mat("concrete_grime", P("metal", 1))
    door = mat("door", P("leather", 0)); glass = mat("window_dark", P("metal", 0)); board = mat("board", P("leather", 2)); sign = mat("sign_faded", P("bone", 1)); ink = mat("sign_ink", P("rust", 0))
    r = Node("wall_shopfront"); g = rng(29)
    r.add(brick, box((6.0, 3.3, 0.4), (0, 1.75, 0)))
    r.add(grime, box((6.04, 0.25, 0.44), (0, 0.125, 0)))                                         # plinth
    r.add(conc, box((6.2, 0.2, 0.6), (0, 3.5, 0.05)))                                            # cornice
    for x in (-2.95, 2.95): r.add(brick_d, box((0.25, 3.3, 0.46), (x, 1.75, 0)))                 # pilasters
    r.add(conc, box((1.3, 0.14, 0.44), (-1.7, 2.2, 0)))                                          # door lintel
    r.add(door, box((1.1, 2.1, 0.06), (-1.7, 1.05, 0.21)))
    r.add(conc, box((2.9, 0.12, 0.46), (1.0, 0.76, 0)))                                          # window sill
    r.add(glass, box((2.6, 1.4, 0.04), (1.0, 1.5, 0.205)))
    for k in range(4):
        r.add(board, box((2.8, 0.18, 0.04), (1.0, 1.0 + k * 0.33, 0.245), rz(g.uniform(-0.06, 0.06))))
    r.add(sign, box((5.2, 0.55, 0.1), (0, 2.95, 0.24)))
    for i, w in enumerate([0.5, 0.35, 0.6, 0.45, 0.3, 0.55]):                                       # faded lettering blocks
        r.add(ink, box((w, 0.24, 0.012), (-2.0 + i * 0.8, 2.95, 0.295)))
    return r, dict(M)
