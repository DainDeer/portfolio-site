"""deery v2 — toony happy eyes: ellipsoid eyes with a smiling lower-lid
boolean cut, green irises, geometric sparkles. CSG-capable SDF renderer."""
import numpy as np, zlib, struct

def hx(s): return np.array([int(s[i:i+2], 16) for i in (0, 2, 4)], np.float32) / 255.0
BUBBLE = hx('f591c2'); LIGHT = hx('f9b1d3'); CREAM = hx('f0e7d8')
DEEP   = hx('e2699f'); SLATE = hx('5c6068'); FRAME = hx('33363c')
WHITE  = hx('ffffff'); IRIS  = hx('35a763'); PUPIL = hx('1c2b22')

# ---------- sdf primitives ----------
def sd_sph(p, c, r):  return np.linalg.norm(p - c, axis=1) - r
def sd_ell(p, c, radii):
    q = (p - c) / radii
    return (np.linalg.norm(q, axis=1) - 1.0) * radii.min()
def sd_cap(p, a, b, r):
    ab = b - a; pa = p - a
    t = np.clip((pa @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(pa - t[:, None]*ab, axis=1) - r
def sd_rectring(p, c, b, rc, mr):
    q = np.abs(p[:, :2] - c[:2]) - (b - rc)
    sd = (np.linalg.norm(np.maximum(q, 0), axis=1)
          + np.minimum(np.maximum(q[:, 0], q[:, 1]), 0) - rc)
    return np.sqrt(sd**2 + (p[:, 2]-c[2])**2) - mr

def sd_tor(p, c, R, mr):
    dxy = np.linalg.norm(p[:, :2] - c[:2], axis=1) - R
    return np.sqrt(dxy**2 + (p[:, 2]-c[2])**2) - mr

# ---------- objects: (sdf_fn, mat_fn) ----------
objs = []
def add_simple(sdf_fn, col, gloss):
    objs.append((sdf_fn, lambda p, c=col, g=gloss:
                 (np.tile(c, (p.shape[0], 1)), np.full(p.shape[0], g, np.float32))))

# ---------- paperclip spiral (same body as v1 keeper) ----------
def rr_point(u, w, h, r):
    sw, sh, arc = 2*(w-r), 2*(h-r), np.pi*r/2
    P = 2*sw + 2*sh + 4*arc
    d = (u % 1.0) * P
    def arcpt(cx, cy, a0, a1, f):
        th = np.deg2rad(a0 + (a1 - a0) * f)
        return cx + r*np.cos(th), cy + r*np.sin(th)
    pieces = [
        (sw,  lambda f: (-(w-r) + sw*f,  h)),
        (arc, lambda f: arcpt( (w-r),  h-r,  90,   0, f)),
        (sh,  lambda f: ( w,  h-r - sh*f)),
        (arc, lambda f: arcpt( (w-r), -(h-r),  0, -90, f)),
        (sw,  lambda f: ( (w-r) - sw*f, -h)),
        (arc, lambda f: arcpt(-(w-r), -(h-r), -90, -180, f)),
        (sh,  lambda f: (-w, -(h-r) + sh*f)),
        (arc, lambda f: arcpt(-(w-r),  h-r, 180,  90, f)),
    ]
    for ln, fn in pieces:
        if d <= ln: return fn(d / ln)
        d -= ln
    return pieces[-1][1](1.0)

T, NPTS, PHASE, K = 2.15, 100, 0.40, 0.115
pts = []
for i in range(NPTS):
    t = T * i / (NPTS - 1)
    w = 0.46 - K*t; h = 0.60 - K*t; r = max(0.30 - 0.08*t, 0.10)
    x, y = rr_point(t + PHASE, w, h, r)
    pts.append((np.float32(x), np.float32(y), np.float32(-0.09 + 0.09*t), t))

WIRE_R = 0.048
BANDS = [BUBBLE, CREAM, LIGHT, DEEP]
for i in range(NPTS - 1):
    a = np.array(pts[i][:3], np.float32); b = np.array(pts[i+1][:3], np.float32)
    col = BANDS[int(pts[i][3] / 0.22) % len(BANDS)]
    add_simple(lambda p, a=a, b=b: sd_cap(p, a, b, WIRE_R), col, 0.55)

# ---------- toony happy eyes, vertically stretched as a unit ----------
STRETCH = np.array([0.87, 1.24, 1.0], np.float32)   # thinner, taller
SMIN = float(STRETCH.min())

def make_eye(sx):
    C     = np.array([0.15*sx, 0.66, 0.15], np.float32)   # stretch pivot
    c_w   = np.array([0.15*sx, 0.66, 0.10], np.float32)
    radii = np.array([0.105, 0.135, 0.095], np.float32)
    c_ir  = np.array([0.147*sx, 0.675, 0.155], np.float32)
    c_pu  = np.array([0.147*sx, 0.675, 0.190], np.float32)
    c_cut = np.array([0.15*sx, 0.492, 0.13], np.float32)
    R_CUT = 0.132

    def warp(p):
        return (p - C) / STRETCH + C

    def sdf(p):
        q = warp(p)
        dw = sd_ell(q, c_w, radii)
        di = sd_sph(q, c_ir, 0.065)
        du = sd_sph(q, c_pu, 0.036)
        inner = np.minimum(dw, np.minimum(di, du))
        return np.maximum(inner, -sd_sph(q, c_cut, R_CUT)) * SMIN

    def mat(p):
        q = warp(p)
        dw = sd_ell(q, c_w, radii)
        di = sd_sph(q, c_ir, 0.065)
        du = sd_sph(q, c_pu, 0.036)
        col = np.tile(WHITE, (p.shape[0], 1))
        col[di < dw] = IRIS
        col[(du < di) & (du < dw)] = PUPIL
        return col, np.full(p.shape[0], 0.85, np.float32)
    objs.append((sdf, mat))

    # sparkles + glasses ring stretch with the eye
    for c_s, r_s in ((np.array([0.15*sx + 0.038*sx, 0.705, 0.205], np.float32), 0.027),
                     (np.array([0.15*sx - 0.034*sx, 0.645, 0.207], np.float32), 0.016)):
        add_simple(lambda p, c=c_s, r=r_s, w=warp: sd_sph(w(p), c, r) * SMIN, WHITE, 0.2)
    c_t = np.array([0.15*sx, 0.655, 0.235], np.float32)
    b_t = np.array([0.126, 0.172], np.float32)          # nerdy square frame
    add_simple(lambda p, c=c_t, b=b_t: sd_rectring(p, c, b, 0.042, 0.021), FRAME, 0.35)

for sx in (-1, 1):
    make_eye(sx)
    a1 = np.array([0.30*sx, 0.68, -0.045], np.float32); b1 = np.array([0.34*sx, 1.00, -0.045], np.float32)
    a2 = np.array([0.325*sx, 0.88, -0.045], np.float32); b2 = np.array([0.19*sx, 0.99, -0.045], np.float32)
    add_simple(lambda p, a=a1, b=b1: sd_cap(p, a, b, 0.038), SLATE, 0.3)
    add_simple(lambda p, a=a2, b=b2: sd_cap(p, a, b, 0.031), SLATE, 0.3)
add_simple(lambda p: sd_cap(p, np.array([-0.045, 0.655, 0.235], np.float32),
                            np.array([0.045, 0.655, 0.235], np.float32), 0.018), FRAME, 0.35)

# ---------- scene ----------
def scene(p):
    best = np.full(p.shape[0], 1e9, np.float32)
    for sdf_fn, _ in objs:
        best = np.minimum(best, sdf_fn(p))
    return best

def material(p):
    best = np.full(p.shape[0], 1e9, np.float32)
    who = np.zeros(p.shape[0], np.int32)
    for i, (sdf_fn, _) in enumerate(objs):
        d = sdf_fn(p)
        m = d < best
        best = np.where(m, d, best); who[m] = i
    col = np.zeros((p.shape[0], 3), np.float32)
    gls = np.zeros(p.shape[0], np.float32)
    for i, (_, mat_fn) in enumerate(objs):
        m = who == i
        if m.any():
            c, g = mat_fn(p[m]); col[m] = c; gls[m] = g
    return col, gls

# ---------- camera / march / shade ----------
RES = int(__import__('os').environ.get('RES', 512))
span_x, span_y = 2.0, 2.2
xs = np.linspace(-span_x/2, span_x/2, RES, dtype=np.float32)
ys = np.linspace(1.16, 1.16 - span_y, RES, dtype=np.float32)
gx, gy = np.meshgrid(xs, ys)
def roty(a): c,s=np.cos(a),np.sin(a); return np.array([[c,0,s],[0,1,0],[-s,0,c]],np.float32)
def rotx(a): c,s=np.cos(a),np.sin(a); return np.array([[1,0,0],[0,c,-s],[0,s,c]],np.float32)
ROT = roty(0.26) @ rotx(-0.10)
ro = np.stack([gx.ravel(), gy.ravel() - 0.10, np.full(RES*RES, 2.5, np.float32)], 1) @ ROT.T
rd = np.tile((np.array([0,0,-1],np.float32) @ ROT.T), (RES*RES, 1))

M = RES*RES
tdist = np.zeros(M, np.float32); alive = np.ones(M, bool); hit = np.zeros(M, bool)
for _ in range(130):
    if not alive.any(): break
    p = ro[alive] + rd[alive]*tdist[alive, None]
    d = scene(p)
    idx = np.where(alive)[0]
    h = d < 0.0016
    hit[idx[h]] = True
    tdist[idx] += np.maximum(d, 0.0010)
    alive[idx[h | (tdist[idx] > 5.0)]] = False

img = np.zeros((M, 4), np.float32)
if hit.any():
    hp = ro[hit] + rd[hit]*tdist[hit, None]
    e = 0.0022
    n = np.stack([scene(hp + [e,0,0]) - scene(hp - [e,0,0]),
                  scene(hp + [0,e,0]) - scene(hp - [0,e,0]),
                  scene(hp + [0,0,e]) - scene(hp - [0,0,e])], 1)
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    base, gloss = material(hp)
    lin = base**2.2
    L1 = np.array([0.5, 0.72, 0.65], np.float32); L1 /= np.linalg.norm(L1)
    L2 = np.array([-0.65, 0.15, 0.55], np.float32); L2 /= np.linalg.norm(L2)
    ndl1 = np.clip(n @ L1, 0, 1); ndl2 = np.clip(n @ L2, 0, 1)
    hv = (L1 - rd[hit]); hv /= np.linalg.norm(hv, axis=1, keepdims=True)
    spec = np.clip((n*hv).sum(1), 0, 1)**48 * gloss
    c = lin*(0.40 + 0.75*ndl1[:,None] + 0.25*ndl2[:,None]) + spec[:,None]
    img[hit, :3] = np.clip(c, 0, 1)**(1/2.2)
    img[hit, 3] = 1.0

img = img.reshape(RES, RES, 4)
pm = img.copy(); pm[..., :3] *= pm[..., 3:]
pm = pm.reshape(RES//2, 2, RES//2, 2, 4).mean((1, 3))
a = pm[..., 3:]; out = np.where(a > 0, pm[..., :3]/np.maximum(a, 1e-6), 0)
final8 = ((np.concatenate([np.clip(out,0,1), np.clip(a,0,1)], 2))*255 + 0.5).astype(np.uint8)

def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag+data) & 0xffffffff)
H, W = final8.shape[:2]
raw = b''.join(b'\x00' + final8[y].tobytes() for y in range(H))
png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
import os
open(os.environ.get('OUT', 'deery_v2.png'), 'wb').write(png)
print('rendered', W, 'x', H, '| hits:', int(hit.sum()))
