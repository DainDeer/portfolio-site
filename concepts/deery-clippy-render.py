"""deery the assistant — raymarched 3D mockup of a fursona-striped paperclip
with green eyes, glasses, and inward antlers. transparent background."""
import numpy as np, zlib, struct

# ---------- palette (from dain.jpg / logo v2) ----------
def hx(s): return np.array([int(s[i:i+2], 16) for i in (0, 2, 4)], np.float32) / 255.0
BUBBLE = hx('f591c2'); LIGHT = hx('f9b1d3'); CREAM = hx('f0e7d8')
DEEP   = hx('e2699f'); SLATE = hx('5c6068'); FRAME = hx('33363c')
WHITE  = hx('ffffff'); IRIS  = hx('35a763'); PUPIL = hx('1c2b22')

# ---------- paperclip spiral path ----------
def rr_point(u, w, h, r):
    """point on rounded-rect perimeter, u in [0,1), clockwise from top-left."""
    sw, sh, arc = 2*(w-r), 2*(h-r), np.pi*r/2
    P = 2*sw + 2*sh + 4*arc
    d = u * P
    segs = [
        ('line', (-(w-r),  h), ( (w-r),  h), sw),   # top, L->R
        ('arc',  ( (w-r),  h-r), 90, 0,      arc),  # top-right corner
        ('line', ( w, h-r), ( w, -(h-r)),    sh),   # right side down
        ('arc',  ( (w-r), -(h-r)), 0, -90,   arc),  # bottom-right
        ('line', ( (w-r), -h), (-(w-r), -h), sw),   # bottom, R->L
        ('arc',  (-(w-r), -(h-r)), -90, -180, arc), # bottom-left
        ('line', (-w, -(h-r)), (-w,  h-r),   sh),   # left side up
        ('arc',  (-(w-r),  h-r), 180, 90,    arc),  # top-left
    ]
    for kind, a, b, ln in segs:
        if d <= ln or kind is segs[-1][0] and a is segs[-1][1]:
            f = min(d / ln, 1.0)
            if kind == 'line':
                ax, ay = a; bx, by = b
                return ax + (bx-ax)*f, ay + (by-ay)*f
            cx, cy = a
            th = np.deg2rad(b + (b if False else 0))
            th = np.deg2rad(a2b(b, f, segs, kind))  # placeholder
        d -= ln
    return 0.0, 0.0

# (cleaner arc handling — rewrite rr_point without cleverness)
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
        if d <= ln:
            return fn(d / ln)
        d -= ln
    return pieces[-1][1](1.0)

T, NPTS, PHASE = 2.15, 100, 0.40
K = 0.115
pts = []
for i in range(NPTS):
    t = T * i / (NPTS - 1)
    w = 0.46 - K*t; h = 0.60 - K*t; r = max(0.30 - 0.08*t, 0.10)
    x, y = rr_point(t + PHASE, w, h, r)
    z = -0.09 + 0.09*t
    pts.append((x, y, z, t))

WIRE_R = 0.048
BANDS = [BUBBLE, CREAM, LIGHT, DEEP]

prims = []   # (kind, params..., color, gloss)
for i in range(NPTS - 1):
    a = np.array(pts[i][:3], np.float32); b = np.array(pts[i+1][:3], np.float32)
    col = BANDS[int(pts[i][3] / 0.22) % len(BANDS)]
    prims.append(('cap', a, b, WIRE_R, col, 0.55))

def cap(a, b, r, col, gl=0.4): prims.append(('cap', np.array(a,np.float32), np.array(b,np.float32), r, col, gl))
def sph(c, r, col, gl=0.6):    prims.append(('sph', np.array(c,np.float32), r, col, gl))
def tor(c, R, mr, col, gl=0.5):prims.append(('tor', np.array(c,np.float32), R, mr, col, gl))

# eyes on the top wire, glasses in front, antlers behind
for sx in (-1, 1):
    sph((0.15*sx, 0.615, 0.10), 0.115, WHITE, 0.85)
    sph((0.15*sx, 0.615, 0.175), 0.058, IRIS, 0.85)
    sph((0.15*sx, 0.615, 0.212), 0.030, PUPIL, 0.9)
    tor((0.15*sx, 0.615, 0.225), 0.150, 0.020, FRAME, 0.35)
    cap((0.30*sx, 0.68, -0.045), (0.34*sx, 1.00, -0.045), 0.038, SLATE, 0.3)
    cap((0.325*sx, 0.88, -0.045), (0.19*sx, 0.99, -0.045), 0.031, SLATE, 0.3)  # inward prong
cap((-0.045, 0.615, 0.225), (0.045, 0.615, 0.225), 0.018, FRAME, 0.35)        # glasses bridge

# ---------- sdf ----------
def sdf_all(p):
    """p: (M,3) -> dist (M,), and per-prim dists optionally"""
    best = np.full(p.shape[0], 1e9, np.float32)
    for pr in prims:
        best = np.minimum(best, sdf_one(pr, p))
    return best

def sdf_one(pr, p):
    if pr[0] == 'cap':
        _, a, b, r, _, _ = pr
        ab = b - a; pa = p - a
        t = np.clip((pa @ ab) / (ab @ ab), 0, 1)
        return np.linalg.norm(pa - t[:, None]*ab, axis=1) - r
    if pr[0] == 'sph':
        _, c, r, _, _ = pr
        return np.linalg.norm(p - c, axis=1) - r
    _, c, R, mr, _, _ = pr
    dxy = np.linalg.norm(p[:, :2] - c[:2], axis=1) - R
    return np.sqrt(dxy**2 + (p[:, 2]-c[2])**2) - mr

def material(p):
    best = np.full(p.shape[0], 1e9, np.float32)
    col = np.zeros((p.shape[0], 3), np.float32)
    gls = np.zeros(p.shape[0], np.float32)
    for pr in prims:
        d = sdf_one(pr, p)
        m = d < best
        best = np.where(m, d, best)
        col[m] = pr[-2]; gls[m] = pr[-1]
    return col, gls

# ---------- camera (ortho, 3/4 tilt) ----------
RES = 512
span_x, span_y = 2.0, 2.2
xs = np.linspace(-span_x/2, span_x/2, RES, dtype=np.float32)
ys = np.linspace(1.16, 1.16 - span_y, RES, dtype=np.float32)   # y down rows
gx, gy = np.meshgrid(xs, ys)
def roty(a): c,s=np.cos(a),np.sin(a); return np.array([[c,0,s],[0,1,0],[-s,0,c]],np.float32)
def rotx(a): c,s=np.cos(a),np.sin(a); return np.array([[1,0,0],[0,c,-s],[0,s,c]],np.float32)
ROT = roty(0.26) @ rotx(-0.10)
ro = np.stack([gx.ravel(), gy.ravel() - 0.10, np.full(RES*RES, 2.5, np.float32)], 1) @ ROT.T
rd = np.tile((np.array([0,0,-1],np.float32) @ ROT.T), (RES*RES, 1))

# ---------- march ----------
M = RES*RES
tdist = np.zeros(M, np.float32)
alive = np.ones(M, bool)
hit = np.zeros(M, bool)
for step in range(110):
    if not alive.any(): break
    p = ro[alive] + rd[alive]*tdist[alive, None]
    d = sdf_all(p)
    idx = np.where(alive)[0]
    h = d < 0.0016
    hit[idx[h]] = True
    tdist[idx] += np.maximum(d, 0.0012)
    dead = h | (tdist[idx] > 5.0)
    alive[idx[dead]] = False

# ---------- shade ----------
img = np.zeros((M, 4), np.float32)
if hit.any():
    hp = ro[hit] + rd[hit]*tdist[hit, None]
    e = 0.0022
    n = np.stack([
        sdf_all(hp + [e,0,0]) - sdf_all(hp - [e,0,0]),
        sdf_all(hp + [0,e,0]) - sdf_all(hp - [0,e,0]),
        sdf_all(hp + [0,0,e]) - sdf_all(hp - [0,0,e])], 1)
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    base, gloss = material(hp)
    lin = base**2.2
    L1 = np.array([0.5, 0.72, 0.65], np.float32); L1 /= np.linalg.norm(L1)
    L2 = np.array([-0.65, 0.15, 0.55], np.float32); L2 /= np.linalg.norm(L2)
    ndl1 = np.clip(n @ L1, 0, 1); ndl2 = np.clip(n @ L2, 0, 1)
    v = -rd[hit]
    hv1 = (L1 + v); hv1 /= np.linalg.norm(hv1, axis=1, keepdims=True)
    spec = np.clip((n*hv1).sum(1), 0, 1)**48 * gloss
    c = lin*(0.40 + 0.75*ndl1[:,None] + 0.25*ndl2[:,None]) + spec[:,None]
    img[hit, :3] = np.clip(c, 0, 1)**(1/2.2)
    img[hit, 3] = 1.0

img = img.reshape(RES, RES, 4)
# 2x downsample with premultiplied alpha
pm = img.copy(); pm[..., :3] *= pm[..., 3:]
pm = pm.reshape(RES//2, 2, RES//2, 2, 4).mean((1, 3))
a = pm[..., 3:]; out = np.where(a > 0, pm[..., :3]/np.maximum(a, 1e-6), 0)
final = np.concatenate([np.clip(out,0,1), np.clip(a,0,1)], 2)
final8 = (final*255 + 0.5).astype(np.uint8)

def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag+data) & 0xffffffff)
H, W = final8.shape[:2]
raw = b''.join(b'\x00' + final8[y].tobytes() for y in range(H))
png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
open('deery_clippy3.png', 'wb').write(png)
print('rendered', W, 'x', H, '| hit pixels:', int(hit.sum()))
