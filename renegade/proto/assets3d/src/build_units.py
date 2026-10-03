"""Units: grunt, scav_raider, scav_gunman, goat. Segmented 'action figure' rigs per the contract
(/workspace/autobattler-design/proto-3d-asset-contract.md section 3): required part nodes are direct
children of the root, each node origin = its joint. Extra nodes (lower limbs, attachments) ride on their part."""
import math
import numpy as np
from geo import Node, P, box, frustum, seg, prism, hull, split, xf, rx, ry, rz

M = {}   # material name -> {"hex", "role"}
def mat(name, hexv, role=None):
    M[name] = {"hex": hexv, "role": role or name}; return name

# ---- shared humanoid skeleton (metres, feet at y=0, facing +Z, character's LEFT = +X)
HIP_Y, HIP_X, KNEE_Y = 0.90, 0.10, 0.48
SH_Y, SH_X, ELBOW_Y, WRIST_Y = 1.40, 0.25, 1.11, 0.86
NECK_Y = 1.46

# Two-handed rifle hold (contract section 3 "Pose", rev. Oct 3 13:24): arms baked forward, node rotations stay identity.
# hand_r = the right hand's grip (gun origin goes here); the left hand supports the gun ahead of it.
L_UP, L_LO = 0.30, 0.32                        # shoulder->elbow, elbow->hand centre
GRIP_R = np.array([-0.11, 1.19, 0.34])         # right hand / hand_r: the gun grip
HAND_L = np.array([-0.07, 1.215, 0.48])        # left hand: under the receiver / mag well, 0.14 ahead of the grip
POLE = {"r": np.array([-0.8, -1.0, -0.1]), "l": np.array([0.9, -1.0, -0.1])}   # elbows out and down

def ik(S, H, pole):
    """Two-bone IK: elbow position for shoulder S, hand centre H."""
    S, H = np.asarray(S, float), np.asarray(H, float); v = H - S; D = np.linalg.norm(v); d = v / D
    if D >= L_UP + L_LO - 1e-6: return S + d * L_UP
    ca = (L_UP ** 2 + D ** 2 - L_LO ** 2) / (2 * L_UP * D); sa = math.sqrt(max(0.0, 1 - ca * ca))
    p = pole - np.dot(pole, d) * d; p /= np.linalg.norm(p)
    return S + L_UP * (ca * d + sa * p)

def arm_joints(side):
    s = 1 if side == "l" else -1
    S = np.array([s * SH_X, SH_Y, 0.0]); H = HAND_L if side == "l" else GRIP_R
    return S, ik(S, H, POLE[side]), H

def skeleton(name):
    r = Node(name)
    J = {"root": r}
    J["torso"] = r.kid("torso", (0, HIP_Y, 0))
    J["head"] = r.kid("head", (0, NECK_Y, 0))
    for s, side in ((1, "l"), (-1, "r")):
        S, E, H = arm_joints(side)
        a = r.kid(f"arm_{side}", S); J[f"arm_{side}"] = a
        J[f"arm_{side}_lower"] = a.kid(f"arm_{side}_lower", E)
        l = r.kid(f"leg_{side}", (s * HIP_X, HIP_Y, 0)); J[f"leg_{side}"] = l
        J[f"leg_{side}_lower"] = l.kid(f"leg_{side}_lower", (s * HIP_X, KNEE_Y, 0))
    J["hand_r"] = J["arm_r_lower"].kid("hand_r", GRIP_R)   # weapon grip point (empty)
    return J

def legs(J, pants, boots, sole, cuff, shin_wrap=None, knee_pad=None):
    for s, side in ((1, "l"), (-1, "r")):
        x = s * HIP_X; up, lo = J[f"leg_{side}"], J[f"leg_{side}_lower"]
        up.add(pants, frustum(0.49, 0.95, 0.14, 0.15, 0.17, 0.19, cx=x))
        lo.add(pants, frustum(0.16, 0.50, 0.12, 0.13, 0.14, 0.15, cx=x))
        lo.add(boots, frustum(0.03, 0.19, 0.15, 0.27, 0.15, 0.19, cx=x, cz=0.035, tz=-0.03))
        lo.add(sole, box((0.16, 0.03, 0.28), (x, 0.015, 0.035)))
        lo.add(cuff, box((0.165, 0.045, 0.2), (x, 0.19, 0.005)))
        if shin_wrap: lo.add(shin_wrap, frustum(0.24, 0.40, 0.145, 0.155, 0.15, 0.16, cx=x))
        if knee_pad: lo.add(knee_pad, box((0.13, 0.11, 0.05), (x, 0.49, 0.085)))

def arms(J, sleeve, upper, fore, hand, sleeve_long=False, band_l=None, wrap=None):
    """Arms in the rifle hold. Each limb segment is a tapered box along its bone (baked; nodes keep identity rotation)."""
    for s, side in ((1, "l"), (-1, "r")):
        S, E, H = arm_joints(side); a, lo = J[f"arm_{side}"], J[f"arm_{side}_lower"]
        du = (E - S) / np.linalg.norm(E - S); dl = (H - E) / np.linalg.norm(H - E)
        W = H - dl * 0.055                                                                  # wrist
        if sleeve_long:
            a.add(sleeve, seg(S - du * 0.05, E + du * 0.01, (0.145, 0.145), (0.12, 0.12)))
        else:
            a.add(sleeve, seg(S - du * 0.05, S + du * 0.18, (0.145, 0.145), (0.125, 0.125)))
            a.add(upper, seg(S + du * 0.17, E + du * 0.01, (0.10, 0.10), (0.095, 0.095)))
        lo.add(fore, seg(E - dl * 0.01, W, (0.095, 0.095), (0.085, 0.085)))
        if wrap: lo.add(wrap, seg(W - dl * 0.17, W - dl * 0.03, (0.105, 0.105), (0.1, 0.1)))
        if band_l and s == 1: lo.add(band_l, seg(W - dl * 0.05, W, (0.1, 0.1)))
        lo.add(hand, seg(W - dl * 0.005, H + dl * 0.05, (0.085, 0.10), (0.08, 0.095)))

# ------------------------------------------------------------------------------------------- grunt
def grunt():
    M.clear()
    skin = mat("skin", P("skin", 2)); skin_d = mat("skin_shade", P("skin", 1))
    hair = mat("hair", P("leather", 1)); shirt = mat("shirt", P("bone", 1))
    vest = mat("tint", P("leather", 0), "vest (squad tint slot)")
    pants = mat("pants", P("metal", 1)); boots = mat("boots", P("leather", 0)); sole = mat("sole", P("outline", 0))
    leather = mat("leather", P("leather", 1)); canvas = mat("canvas", P("leather", 2))
    roll = mat("bedroll", P("mutant", 1)); buckle = mat("buckle", P("metal", 2)); band = mat("wristband", P("teal", 1))
    pupil = mat("pupil", P("outline", 0))
    J = skeleton("grunt"); T, H = J["torso"], J["head"]
    legs(J, pants, boots, sole, leather)
    arms(J, shirt, skin, skin, skin, band_l=band)
    # torso: pelvis, belt, shirt, vest (tint) with an open front, straps
    T.add(pants, frustum(0.84, 1.0, 0.33, 0.2, 0.34, 0.21))
    T.add(leather, box((0.355, 0.06, 0.225), (0, 1.0, 0)))
    T.add(buckle, box((0.06, 0.045, 0.02), (0, 1.0, 0.115)))
    T.add(shirt, frustum(1.02, 1.46, 0.32, 0.2, 0.42, 0.23))
    T.add(vest, frustum(1.03, 1.405, 0.335, 0.215, 0.43, 0.245))
    T.add(shirt, box((0.075, 0.33, 0.014), (0, 1.225, 0.119)))
    T.add(leather, box((0.09, 0.075, 0.02), (0.11, 1.13, 0.117)))   # vest pocket (wearer's left)
    T.add(leather, box((0.045, 0.30, 0.02), (-0.12, 1.29, 0.123)))  # pack strap
    T.add(leather, box((0.045, 0.30, 0.02), (0.12, 1.29, 0.123)))
    T.add(leather, box((0.07, 0.09, 0.08), (-0.19, 0.97, 0.02)))    # belt pouch (right hip)
    pack = T.kid("pack")
    pack.add(leather, box((0.30, 0.34, 0.14), (0, 1.22, -0.19)))
    pack.add(canvas, box((0.31, 0.08, 0.15), (0, 1.39, -0.185)))
    pack.add(roll, prism(8, 0.065, 0.065, (-0.17, 1.47, -0.17), (0.17, 1.47, -0.17)))
    # head: neck, head, hair (brown bowl), face
    H.add(skin, box((0.11, 0.08, 0.11), (0, 1.51, 0)))
    H.add(skin, box((0.22, 0.22, 0.23), (0, 1.625, 0.01)))
    H.add(hair, frustum(1.695, 1.755, 0.236, 0.246, 0.2, 0.21, cz=0.005))
    H.add(hair, box((0.236, 0.14, 0.03), (0, 1.635, -0.11)))
    H.add(hair, box((0.222, 0.035, 0.02), (0, 1.70, 0.126)))
    for s in (1, -1):
        H.add(pupil, box((0.03, 0.03, 0.01), (s * 0.05, 1.643, 0.127)))
        H.add(skin_d, box((0.02, 0.05, 0.04), (s * 0.118, 1.632, 0.0)))
    H.add(skin_d, box((0.04, 0.05, 0.03), (0, 1.612, 0.137)))
    return J["root"], dict(M)

# ------------------------------------------------------------------------------------------- scavengers
def coat_flaps(J, coat, ragged):
    """Coat skirt hung on each leg (rides the leg swing; keeps the torso box compact)."""
    for s, side in ((1, "l"), (-1, "r")):
        x = s * HIP_X; f = J[f"leg_{side}"].kid(f"coat_flap_{side}")
        lens = ragged[side]
        f.add(coat, frustum(0.95 - lens[0], 0.95, 0.09, 0.03, 0.09, 0.03, cx=x + s * 0.04, cz=0.11))
        f.add(coat, frustum(0.95 - lens[1], 0.95, 0.09, 0.03, 0.09, 0.03, cx=x - s * 0.04, cz=0.105))
        f.add(coat, frustum(0.95 - lens[2], 0.95, 0.18, 0.03, 0.18, 0.03, cx=x, cz=-0.11))
        f.add(coat, frustum(0.95 - lens[3], 0.95, 0.03, 0.17, 0.03, 0.2, cx=x + s * 0.095))

def scav(kind):
    M.clear()
    coat = mat("tint", P("mutant", 1), "coat (squad tint slot)")
    rag = mat("rag", P("leather", 2)); dark = mat("leather_dark", P("leather", 0)); leather = mat("leather", P("leather", 1))
    sole = mat("sole", P("outline", 0)); scrap = mat("scrap_rust", P("rust", 2)); scrap_d = mat("scrap_rust_dark", P("rust", 0))
    steel = mat("scrap_steel", P("metal", 1)); steel_l = mat("scrap_steel_light", P("metal", 2)); shadow = mat("face_shadow", P("metal", 0))
    J = skeleton("scav_" + kind); T, H = J["torso"], J["head"]
    if kind == "raider":
        pants = mat("pants", P("mutant", 0)); hood = mat("hood", P("rust", 0))
        legs(J, pants, dark, sole, leather, shin_wrap=rag)
        arms(J, coat, coat, rag, dark, sleeve_long=True)
        coat_flaps(J, coat, {"l": (0.30, 0.22, 0.36, 0.27), "r": (0.24, 0.33, 0.29, 0.34)})
        T.add(coat, frustum(0.84, 1.0, 0.34, 0.22, 0.35, 0.23))
        T.add(coat, frustum(1.0, 1.44, 0.34, 0.22, 0.44, 0.25))
        T.add(rag, box((0.36, 0.05, 0.24), (0, 0.99, 0)))                         # rope belt
        T.add(hood, frustum(1.36, 1.50, 0.47, 0.27, 0.30, 0.24))                 # hood mantle over the shoulders
        T.add(scrap, box((0.22, 0.17, 0.025), (0.03, 1.24, 0.13), rz(0.12)))     # hubcap-ish chest plate
        T.add(scrap_d, box((0.05, 0.05, 0.012), (0.03, 1.24, 0.146)))
        T.add(leather, box((0.08, 0.10, 0.08), (0.19, 0.97, 0.03)))              # pouch
        sp = J["arm_l"].kid("pauldron_l")
        sp.add(steel, box((0.18, 0.05, 0.19), (0.28, 1.455, 0), rz(-0.35)))
        sp.add(scrap, box((0.17, 0.045, 0.04), (0.29, 1.42, 0.0), rz(-0.9)))
        H.add(shadow, box((0.2, 0.2, 0.2), (0, 1.62, 0.02)))                     # face in the hood's shadow
        H.add(hood, frustum(1.50, 1.765, 0.27, 0.28, 0.17, 0.2, cz=-0.02, tz=-0.04))
        H.add(hood, seg((0, 1.72, -0.1), (0, 1.765, -0.2), (0.12, 0.1), (0.03, 0.03)))   # hood point, flops back
        H.add(hood, box((0.03, 0.24, 0.12), (0.12, 1.62, 0.09)))                 # hood rim (front opening)
        H.add(hood, box((0.03, 0.24, 0.12), (-0.12, 1.62, 0.09)))
        H.add(hood, box((0.24, 0.04, 0.12), (0, 1.725, 0.09)))
        H.add(rag, frustum(1.50, 1.61, 0.21, 0.13, 0.2, 0.1, cz=0.075))           # rag mask over the lower face
        for s in (1, -1): H.add(steel_l, box((0.035, 0.018, 0.01), (s * 0.045, 1.655, 0.123)))   # glint of eyes (dull grey)
    else:  # gunman: scrap helmet, gas mask, door-panel chest plate, no flaps
        pants = mat("pants", P("leather", 1)); wrap = mat("head_wrap", P("leather", 1))
        lens = mat("lens", P("metal", 2))
        legs(J, pants, dark, sole, dark, knee_pad=steel)
        arms(J, coat, coat, coat, dark, sleeve_long=True, wrap=steel)
        T.add(pants, frustum(0.84, 1.0, 0.33, 0.21, 0.34, 0.22))
        T.add(coat, frustum(0.98, 1.46, 0.33, 0.21, 0.44, 0.245))
        T.add(dark, box((0.355, 0.07, 0.235), (0, 0.99, 0)))
        for x in (-0.12, 0.0, 0.12): T.add(leather, box((0.07, 0.08, 0.04), (x, 0.97, 0.125)))   # mag pouches
        T.add(scrap, frustum(1.06, 1.40, 0.30, 0.03, 0.36, 0.03, cz=0.13))      # car-door chest plate
        T.add(scrap_d, box((0.30, 0.035, 0.035), (0, 1.27, 0.145)))              # door trim line
        T.add(steel, frustum(1.08, 1.42, 0.30, 0.03, 0.36, 0.03, cz=-0.13))     # back plate
        T.add(dark, seg((0.18, 1.42, 0.135), (-0.17, 1.05, 0.135), (0.05, 0.02)))  # bandolier
        for s in (1, -1):
            sp = J[f"arm_{'l' if s == 1 else 'r'}"].kid(f"pauldron_{'l' if s == 1 else 'r'}")
            sp.add(scrap, box((0.16, 0.05, 0.17), (s * 0.27, 1.45, 0), rz(-s * 0.3)))
        H.add(wrap, box((0.11, 0.08, 0.11), (0, 1.51, 0)))
        H.add(wrap, box((0.21, 0.21, 0.22), (0, 1.62, 0.01)))
        H.add(steel, frustum(1.67, 1.78, 0.25, 0.26, 0.19, 0.2))                 # pot helmet
        H.add(steel_l, box((0.28, 0.025, 0.29), (0, 1.675, 0.0)))               # brim
        H.add(shadow, box((0.17, 0.13, 0.04), (0, 1.60, 0.125)))                 # gas mask face
        for s in (1, -1): H.add(lens, prism(6, 0.03, 0.03, (s * 0.045, 1.64, 0.14), (s * 0.045, 1.64, 0.16)))
        H.add(steel, prism(6, 0.035, 0.03, (0, 1.565, 0.14), (0, 1.53, 0.2)))    # filter can
    return J["root"], dict(M)

# ------------------------------------------------------------------------------------------- goat
def goat():
    """A totally normal domestic goat (Megan's lock). The only tell: tiny eye faces in material 'eye'."""
    M.clear()
    coat = mat("goat_coat", P("leather", 2)); light = mat("goat_coat_light", P("bone", 1)); darkc = mat("goat_coat_dark", P("leather", 1))
    hoof = mat("goat_hoof", P("leather", 0)); horn = mat("goat_horn", P("metal", 1)); horn_t = mat("goat_horn_tip", P("metal", 2))
    eye = mat("eye", P("rust", 1), "eye (warm-glint slot; tiny dim ember)")
    r = Node("goat")
    body = r.kid("body", (0, 0.61, 0))
    rings = [(-0.44, 0.09, 0.59, 0.74), (-0.37, 0.15, 0.47, 0.78), (-0.15, 0.17, 0.43, 0.785), (0.12, 0.17, 0.43, 0.79),
             (0.30, 0.15, 0.47, 0.80), (0.40, 0.10, 0.56, 0.77)]
    pts = []
    for z, hw, ylo, yhi in rings:
        my, hh = (ylo + yhi) / 2, (yhi - ylo) / 2
        for k in range(8):
            a = math.pi / 8 + k * math.pi / 4; pts.append((hw * math.cos(a), my + hh * math.sin(a), z))
    B = hull(pts)
    belly, back = split(B, lambda n, c: n[:, 1] < -0.55)
    body.add(coat, back); body.add(light, belly)
    # legs: origin at the top of each leg
    for s, side in ((1, "l"), (-1, "r")):
        x = s * 0.095
        f = r.kid(f"leg_f{side}", (x, 0.52, 0.26))
        f.add(coat, frustum(0.24, 0.56, 0.065, 0.075, 0.085, 0.10, cx=x, cz=0.26))
        f.add(darkc, frustum(0.045, 0.25, 0.05, 0.055, 0.055, 0.06, cx=x, cz=0.265))
        f.add(hoof, frustum(0.0, 0.05, 0.065, 0.08, 0.055, 0.06, cx=x, cz=0.275))
        b = r.kid(f"leg_b{side}", (x, 0.56, -0.30))
        b.add(coat, seg((x, 0.60, -0.29), (x, 0.30, -0.35), (0.10, 0.14), (0.065, 0.07)))
        b.add(darkc, seg((x, 0.31, -0.35), (x, 0.045, -0.32), (0.05, 0.055)))
        b.add(hoof, frustum(0.0, 0.05, 0.065, 0.08, 0.055, 0.06, cx=x, cz=-0.31))
    # head: origin = neck base (where the neck meets the body); the neck rides on the head part
    h = r.kid("head", (0, 0.72, 0.36))
    nk = h.kid("neck")
    nk.add(coat, seg((0, 0.69, 0.33), (0, 0.93, 0.47), (0.15, 0.17), (0.11, 0.12)))
    skull_c = np.array([0, 0.975, 0.50])
    h.add(coat, box((0.15, 0.15, 0.18), skull_c, rx(0.45)))
    p0, p1 = np.array([0, 0.965, 0.55]), np.array([0, 0.875, 0.675])
    h.add(light, seg(p0, p1, (0.12, 0.12), (0.085, 0.075)))
    d = (p1 - p0) / np.linalg.norm(p1 - p0)
    h.add(hoof, seg(p1 - d * 0.008, p1 + d * 0.012, (0.07, 0.05)))            # nose
    for s in (1, -1):
        pts = [(s * 0.04, 1.03, 0.47), (s * 0.055, 1.10, 0.425), (s * 0.07, 1.135, 0.35), (s * 0.085, 1.11, 0.28)]
        sz = [0.045, 0.036, 0.026, 0.014]
        for i in range(3):
            h.add(horn if i < 2 else horn_t, seg(pts[i], pts[i + 1], (sz[i], sz[i] * 1.2), (sz[i + 1], sz[i + 1] * 1.2)))
        h.add(darkc, seg((s * 0.07, 1.02, 0.46), (s * 0.135, 0.97, 0.45), (0.04, 0.055), (0.02, 0.045)))   # ear
        h.add(eye, box((0.008, 0.018, 0.024), (s * 0.077, 0.99, 0.535)))       # the only tell: tiny, dim
    h.add(darkc, seg((0, 0.885, 0.605), (0, 0.80, 0.585), (0.045, 0.04), (0.02, 0.02)))   # beard
    t = r.kid("tail", (0, 0.73, -0.42))
    t.add(coat, seg((0, 0.715, -0.40), (0, 0.80, -0.47), (0.06, 0.045), (0.04, 0.025)))
    return r, dict(M)
