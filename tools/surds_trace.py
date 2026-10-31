# The "connected physical world" panel, traced from the reference art (tools/reference/network_ref.png).
# Every placement below is a pixel coordinate measured on the 1082x392 reference panel; an orthographic
# camera with the reference's own angle projects those pixels back onto the 3D ground, so each building,
# street and orange line lands where it sits in the reference.
#   blender -b --factory-startup --python tools/surds_trace.py -- [--res 25] [--samples 96]
# Writes tools/scene_out/network.png (+ network_overlay.png for comparison) and updates views/home/city-map.js
import bpy, sys, math, json, os, re
sys.path.insert(0, r"D:/Surds_Website/tools")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
RES = int(argv[argv.index("--res") + 1]) if "--res" in argv else 100
SAMPLES = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 128
bpy.ops.wm.read_factory_settings(use_empty=True)
import surds_kit as K
from surds_kit import M, box, cyl, beam, sphere, flush, keep, coll, FAC, rng, frame_box, hvac, tube, tree, wire
from mathutils import Vector, Matrix
sc = bpy.context.scene
OUT = r"D:/Surds_Website/tools/scene_out"

# ============================================================== camera: the reference's own projection
VIEW = argv[argv.index("--view") + 1] if "--view" in argv else "network"
# per panel: size in px, metres per px, measured street slopes (down-right for -y, up-right for +x)
CFG = {"network": dict(PW=1082, PH=392, MPP=0.5, sd=0.5, su=-0.4),
       "bg":      dict(PW=1082, PH=392, MPP=0.5, sd=0.5, su=-0.4),   # same city as network, re-framed as a 16:9 page background
       "hero":    dict(PW=1082, PH=375, MPP=0.3, sd=0.55, su=-0.51)}[VIEW]
PW, PH, MPP = CFG["PW"], CFG["PH"], CFG["MPP"]
E = math.asin(math.sqrt(CFG["sd"] * -CFG["su"]))   # perpendicular street slopes multiply to -sin^2(elevation)
RX, RY = 2880, round(2880 * PH / PW)
sc.render.resolution_x, sc.render.resolution_y = RX, RY
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = PW * MPP; cam.data.clip_end = 5000
def aim(az):
    D = 900.0
    cam.location = (D * math.cos(E) * math.cos(az), D * math.cos(E) * math.sin(az), D * math.sin(E))
    cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
from bpy_extras.object_utils import world_to_camera_view
def W2P(co):
    v = world_to_camera_view(sc, cam, Vector(co)); return (v.x * PW, (1 - v.y) * PH)
def slope(vec):
    a, b = W2P((0, 0, 0)), W2P(vec); dx = b[0] - a[0]
    return (b[1] - a[1]) / dx if abs(dx) > 1e-9 else 1e9
# pick the azimuth where world +x runs up-right at -0.4 (and -y down-right at +0.5)
best = min((abs(slope((1, 0, 0)) - CFG["su"]), az) for az in [math.radians(180 + k * 0.05) for k in range(0, 1800)] if (aim(az) or True))
aim(best[1]); print("CAMERA az", round(math.degrees(best[1]), 2), "el", round(math.degrees(E), 2), "slopes", round(slope((1, 0, 0)), 3), round(slope((0, -1, 0)), 3))

def P2W(u, v, z=0.0):
    """Reference pixel -> world point on the plane at height z."""
    mw = cam.matrix_world; right, up, fwd = mw.col[0].xyz.normalized(), mw.col[1].xyz.normalized(), -mw.col[2].xyz.normalized()
    xs = (u / PW - 0.5) * PW * MPP; ys = (0.5 - v / PH) * PH * MPP
    o = cam.location + right * xs + up * ys
    t = (z - o.z) / fwd.z; return Vector((o.x + fwd.x * t, o.y + fwd.y * t, z))
H = lambda px_: px_ * MPP / math.cos(E)          # reference pixel height -> metres
def foot(L, F, R):
    """Base corners as seen (left, front, right) -> centre, width (x), depth (y). Visible faces are -y (left) and +x... see below."""
    l, f, r = P2W(*L), P2W(*F), P2W(*R)
    x0, x1 = (l.x + f.x) / 2, r.x; y0, y1 = (f.y + r.y) / 2, l.y
    return ((x0 + x1) / 2, (y0 + y1) / 2), abs(x1 - x0), abs(y1 - y0)
# sanity: F->R must be +x and L->F must be -y for the face logic above
_l, _f, _r = P2W(100, 100), P2W(150, 125), P2W(190, 109)
print("AXES F->R", tuple(round(c, 2) for c in (_r - _f).normalized()), "L->F", tuple(round(c, 2) for c in (_f - _l).normalized()))

def fit(build, L, F, R, hpx, rot=0, name=""):
    """Build a fixed-size facility at the origin, then rotate/scale it onto a traced footprint and height."""
    before = set(bpy.data.objects)
    build()
    objs = [o for o in bpy.data.objects if o not in before]
    rotm = Matrix.Rotation(math.radians(rot), 4, "Z")
    pts = [rotm @ (o.matrix_world @ Vector(c)) for o in objs for c in o.bound_box]
    bx0, bx1 = min(p.x for p in pts), max(p.x for p in pts); by0, by1 = min(p.y for p in pts), max(p.y for p in pts)
    bz1 = max(p.z for p in pts)
    (cx, cy), w, d = foot(L, F, R); h = H(hpx)
    S = Matrix.Diagonal((w / (bx1 - bx0), d / (by1 - by0), h / bz1, 1))
    Mf = Matrix.Translation((cx, cy, 0)) @ S @ Matrix.Translation((-(bx0 + bx1) / 2, -(by0 + by1) / 2, 0)) @ rotm
    for o in objs: o.matrix_world = Mf @ o.matrix_world
    print("FIT", name, "w", round(w, 1), "d", round(d, 1), "h", round(h, 1), "scale", tuple(round(s, 2) for s in (S[0][0], S[1][1], S[2][2])))
    return objs

# ============================================================== facility builders sized from the trace
from surds_kit import facade, parapet, roof_clutter, quad
def grade(name, strength=None, color=None):
    b = next(n for n in M[name].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    if strength is not None: b.inputs["Emission Strength"].default_value = strength
    if color is not None:
        bn = M[name].node_tree.nodes.get("BASE")              # textured materials keep their colour in a BASE node
        (bn.outputs[0] if bn else b.inputs["Base Color"]).default_value = (*color, 1)
grade("lit", 1.7); grade("litcool", 1.3); grade("litdim", 0.6); grade("lamp", 3.0); grade("head", 6.0); grade("tail", 3.0)
grade("net", 6.0); grade("netdim", 1.6); grade("plot", color=(0.034, 0.035, 0.04)); grade("tree", color=(0.07, 0.078, 0.074))

def dc_block(cx, cy, w, d, h):
    """Data centre as in the reference: one big box, tall lit glazing on both visible faces,
       a 3x2 grid of framed rooftop plant."""
    box("concrete", cx, cy, 0, w, d, h)
    fl = max(4, round(h / 4.2)); facade(cx, cy, w, d, 0, fl, h / fl, 2.6, 0.22, lit="lit", pier="panel", pier_w=0.6, ledge="panel", ledge_h=0.6)
    box("roof", cx, cy, h, w + 0.4, d + 0.4, 0.4); parapet("panel", cx, cy, w, d, h + 0.4, 1.0, 0.4)
    for i in range(3):
        for j in range(2):
            ux, uy = cx - w / 3 + i * w / 3, cy - d / 4 + j * d / 2
            box("metal", ux, uy, h + 0.4, w / 4.2, d / 3.2, 2.4)
            frame_box("frame", ux, uy, h + 0.4, w / 3.6, d / 2.7, 3.4, 0.18, 1)
            for a in range(2):
                for b in range(2): hvac(ux - w / 14 + a * w / 7, uy - d / 10 + b * d / 5, h + 2.8, 0, 0.9)
    keep("dc", flush("DataCenter"))

def clean_block(cx, cy, w, d, h):
    box("concrete", cx, cy, 0, w, d, h)
    facade(cx, cy, w, d, 0, max(3, round(h / 4)), h / max(3, round(h / 4)), 2.2, 0.32, lit="litcool", pier="frame", pier_w=0.3)
    box("roof", cx, cy, h, w + 0.3, d + 0.3, 0.3)
    frame_box("frame", cx, cy, h + 0.3, w * 0.9, d * 0.9, 5.0, 0.2, 2)            # the big white roof frame
    box("metal", cx - w * 0.15, cy, h + 0.3, w * 0.45, d * 0.6, 2.6); box("metal", cx + w * 0.25, cy + d * 0.15, h + 0.3, w * 0.25, d * 0.4, 3.4)
    for i in range(3): hvac(cx + w * 0.25, cy - d * 0.3 + i * 3.4, h + 0.3)
    keep("clean", flush("CleanRoom"))

def hospital_block(cx, cy, w, d, h):
    box("concrete", cx, cy, 0, w, d, h)
    fl = max(4, round(h / 3.6)); facade(cx, cy, w, d, 0, fl, h / fl, 2.2, 0.3, lit="litcool")
    box("roof", cx, cy, h, w + 0.3, d + 0.3, 0.3); parapet("panel", cx, cy, w, d, h + 0.3, 0.9)
    box("metal", cx - w * 0.15, cy + d * 0.15, h + 0.3, w * 0.35, d * 0.35, 3.0); frame_box("frame", cx + w * 0.2, cy - d * 0.2, h + 0.3, w * 0.3, d * 0.3, 2.6, 0.15)
    yf = cy - d / 2 - 0.4; xc = cx + w * 0.22; zc = h * 0.72; s_ = min(w, h) * 0.24   # glowing cross on the right-hand (-y) wall
    box("dark", xc, yf + 0.12, zc - s_ * 0.75, s_ * 1.5, 0.2, s_ * 1.5)
    box("cross", xc, yf, zc - s_ * 0.6, s_ * 0.36, 0.3, s_ * 1.2); box("cross", xc, yf, zc - s_ * 0.18, s_ * 1.2, 0.3, s_ * 0.36)
    keep("health", flush("Hospital"))

def plant_block(cx, cy, w, d, h, stacks):
    box("panel", cx, cy, 0, w, d, h)
    fl = max(3, round(h / 4)); facade(cx, cy, w, d, 0, fl, h / fl, 2.4, 0.22, lit="lit", pier="concrete2", pier_w=0.5)
    box("roof", cx, cy, h, w + 0.3, d + 0.3, 0.3)
    frame_box("frame", cx + w * 0.05, cy + d * 0.18, h + 0.3, w * 0.75, d * 0.5, 6.0, 0.2, 2)   # white plant enclosure on the roof
    for i in range(4): box("metal", cx - w * 0.25 + i * w * 0.17, cy + d * 0.18, h + 0.3, w * 0.12, d * 0.3, 3.5)
    for (u, vb, vt) in stacks:                                                   # tall thin stacks, tops where the reference has them
        base = P2W(u, vb, h)
        v0 = W2P((base.x, base.y, 0))[1]; ztop = (v0 - vt) * MPP / math.cos(E)
        cyl("frame", base.x, base.y, h, 1.0, ztop - h, 24)
        for k in (0.55, 0.8, 0.95): cyl("panel", base.x, base.y, h + (ztop - h) * k, 1.12, 0.35, 24)
    keep("energy", flush("PowerPlant"))

if VIEW in ("network", "bg"):
    # ============================================================== the traced cast (reference pixels)
    # commercial: the glass tower with an open crown, and its neighbours
    (cx, cy), w, d = foot((205, 200), (250, 213), (279, 199))
    K.glass_tower(cx, cy, w, d, max(8, round((H(130) - 7) / 3.6)), key="commercial")
    (cx, cy), w, d = foot((308, 148), (352, 172), (392, 159)); K.low_lit(cx, cy, w, d, key="commercial")
    (cx, cy), w, d = foot((395, 142), (413, 150), (426, 145)); K.office(cx, cy, w, d, max(3, round(H(40) / 3.5)), key="commercial", name="SmallTower")
    (cx, cy), w, d = foot((300, 182), (313, 188), (330, 180)); K.office(cx, cy, w, d, max(2, round(H(22) / 3.5)), key="commercial", name="TowerFoot")
    (cx, cy), w, d = foot((280, 195), (292, 200), (300, 196)); K.office(cx, cy, w, d, 2, key="commercial", name="TowerFoot2")
    (cx, cy), w, d = foot((162, 233), (190, 248), (217, 234)); K.office(cx, cy, w, d, max(3, round(H(42) / 3.5)), lit_p=0.08, name="WestBlock")
    # data centre
    (cx, cy), w, d = foot((510, 123), (595, 157), (690, 107)); dc_block(cx, cy, w, d, H(75))
    # clean rooms: main block, the six-storey front block, the low annex
    (cx, cy), w, d = foot((333, 270), (380, 293), (427, 273)); clean_block(cx, cy, w, d, H(47))
    (cx, cy), w, d = foot((314, 290), (352, 306), (372, 297)); K.office(cx, cy, w, d, max(3, round(H(50) / 3.5)), lit_p=0.14, lit="litcool", key="clean", name="CleanFront")
    (cx, cy), w, d = foot((380, 298), (403, 310), (440, 293)); K.office(cx, cy, w, d, 2, lit_p=0.2, key="clean", name="CleanAnnex")
    # hospital + its wing, and the small lab to the north-east
    (cx, cy), w, d = foot((684, 312), (730, 325), (758, 312)); hospital_block(cx, cy, w, d, H(67))
    (cx, cy), w, d = foot((657, 302), (668, 308), (684, 302)); K.office(cx, cy, w, d, 4, lit_p=0.3, lit="litcool", key="health", name="HospitalWing")
    (cx, cy), w, d = foot((739, 227), (757, 233), (773, 227)); K.office(cx, cy, w, d, 2, lit_p=0.25, name="Lab")
    # small buildings around the hub
    (cx, cy), w, d = foot((503, 162), (552, 187), (575, 173)); K.office(cx, cy, w, d, 2, lit_p=0.15, name="HubWest")
    (cx, cy), w, d = foot((555, 287), (568, 293), (585, 287)); K.office(cx, cy, w, d, 3, lit_p=0.3, name="Kiosk")
    # energy: the plant with its stacks, the substation pad and six pylons
    (cx, cy), w, d = foot((758, 176), (841, 211), (923, 179)); plant_block(cx, cy, w, d, H(49), [(843, 136, 88), (855, 138, 93), (864, 140, 97), (882, 144, 104), (891, 146, 107)])
    fit(lambda: K.substation(0, 0), (918, 312), (1037, 370), (1082, 300), 18, rot=0, name="substation")
    tips = []
    for (u, v, hpx) in [(886, 287, 57), (907, 287, 57), (983, 300, 52), (1006, 307, 50), (1015, 357, 47), (1067, 343, 60)]:
        p = P2W(u, v); tips.append(K.pylon(p.x, p.y, H(hpx), math.radians(35)))
    flush("Pylons")
    for A, B in ((0, 1), (2, 3), (3, 5), (4, 5)):
        for a, b in zip(tips[A], tips[B]): wire(a, b, 1.6)

    # ============================================================== the orange network (reference pixels)
    LINES = {
        "commercial": [[(210, 230), (283, 272), (385, 323), (440, 300), (480, 280), (522, 232), (583, 204)]],
        "clean":      [[(427, 133), (437, 135), (467, 157)], [(427, 133), (497, 113)], [(323, 177), (363, 198), (467, 157), (530, 185), (583, 204)]],
        "dc":         [[(497, 113), (593, 155), (713, 102), (738, 90)], [(658, 53), (790, 133)], [(633, 125), (697, 154)]],
        "energy":     [[(583, 204), (643, 179), (697, 154), (790, 133)], [(643, 179), (707, 207), (760, 183), (793, 170)],
                       [(700, 232), (760, 250), (918, 315), (1037, 370)]],
        "health":     [[(583, 204), (655, 233), (680, 247)], [(655, 233), (707, 207)], [(647, 254), (587, 282)]],
    }
    HUBPX = (583, 204)
    ROUTES = {k: [[tuple(P2W(*p))[:2] for p in pl] for pl in pls] for k, pls in LINES.items()}
    for k, polys in ROUTES.items():
        for i, pl in enumerate(polys):
            tube(f"Route_{k}_{i}", pl, 0.15)
            for p in pl: sphere("net", p[0], p[1], 0.45, 0.6, 2)
            for a, b in zip(pl, pl[1:]):
                L = math.dist(a, b)
                for j in range(1, int(L / 9)):
                    t = j * 9 / L; sphere("netdim", a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.4, 0.4, 2)
    hub = P2W(*HUBPX); sphere("hub", hub.x, hub.y, 1.4, 2.0, 3)
    flush("NetNodes", "Network")
    hl = bpy.data.lights.new("HubGlow", "POINT"); hl.energy = 2200; hl.color = (1.0, 0.5, 0.18); hl.shadow_soft_size = 1.5
    hlo = bpy.data.objects.new("HubGlow", hl); hlo.location = (hub.x, hub.y, 3); coll("Lights").objects.link(hlo)


else:   # ---------------------------------------------------------------- hero panel (tools/reference/hero_ref.png)
    (cx, cy), w, d = foot((728, 180), (773, 218), (821, 193))
    K.glass_tower(cx, cy, w, d, max(8, round((H(163) - H(10)) / 3.6)), crown=H(10), key="commercial")
    (cx, cy), w, d = foot((628, 117), (660, 125), (712, 107)); K.office(cx, cy, w, d, 2, lit_p=0.08, name="Back")
    (cx, cy), w, d = foot((445, 245), (507, 283), (555, 263)); K.low_lit(cx, cy, w, d)
    (cx, cy), w, d = foot((658, 210), (670, 217), (688, 208)); K.office(cx, cy, w, d, 3, lit_p=0.3, clutter=1, name="Kiosk")
    (cx, cy), w, d = foot((821, 182), (832, 187), (843, 180)); K.office(cx, cy, w, d, max(3, round(H(52) / 3.5)), lit_p=0.1, clutter=1, name="Slim")
    (cx, cy), w, d = foot((824, 222), (855, 237), (893, 217)); K.office(cx, cy, w, d, max(3, round(H(37) / 3.5)), lit_p=0.3, name="Mid")
    (cx, cy), w, d = foot((883, 200), (917, 222), (947, 205)); hh = K.office(cx, cy, w, d, max(4, round(H(64) / 3.5)), lit_p=0.16, clutter=2, name="Stacks")
    for (u, vb, vt) in [(903, 137, 118), (928, 143, 122)]:
        base = P2W(u, vb, hh); v0 = W2P((base.x, base.y, 0))[1]; zt = (v0 - vt) * MPP / math.cos(E)
        cyl("frame", base.x, base.y, hh, 0.7, zt - hh, 20); cyl("panel", base.x, base.y, zt - 1.2, 0.8, 0.4, 20)
    flush("HeroStacks")
    (cx, cy), w, d = foot((948, 157), (990, 173), (1030, 152)); hh = K.office(cx, cy, w, d, max(4, round(H(63) / 3.5)), lit_p=0.22, clutter=1, name="Framed")
    frame_box("frame", cx, cy, hh + 0.25, w * 0.85, d * 0.85, 5.0, 0.18, 1); flush("FramedTop")
    (cx, cy), w, d = foot((872, 77), (923, 100), (963, 80)); K.office(cx, cy, w, d, max(4, round(H(53) / 3.5)), lit_p=0.05, name="Dark")
    (cx, cy), w, d = foot((942, 297), (970, 312), (1008, 293)); K.office(cx, cy, w, d, 2, lit_p=0.1, name="Low")
    (cx, cy), w, d = foot((783, 240), (850, 283), (993, 233)); box("concrete2", cx, cy, 0.02, w, d, 0.12); flush("Plaza", "Streets")
    # the rail corridor: bundles of bright parallel rails along the big diagonal
    a_, b_ = P2W(557, 147), P2W(963, 367); dvec = (b_ - a_); L_ = dvec.length; dn = dvec.normalized(); nrm = Vector((-dn.y, dn.x, 0))
    for off in (-9, -7.6, -3.2, -1.8, 1.8, 3.2, 7.6, 9):
        p0, p1 = a_ - dn * 150 + nrm * off, b_ + dn * 150 + nrm * off
        beam("frame", (p0.x, p0.y, 0.25), (p1.x, p1.y, 0.25), 0.09)
    for k in range(0, int(L_ + 300), 28):                                     # catenary masts
        q = a_ - dn * 150 + dn * k
        for off in (-11, 11):
            m_ = q + nrm * off; beam("metal", (m_.x, m_.y, 0), (m_.x, m_.y, 6.5), 0.1, 8)
        beam("metal", ((q + nrm * -11).x, (q + nrm * -11).y, 6.3), ((q + nrm * 11).x, (q + nrm * 11).y, 6.3), 0.08)
    flush("Rail", "Streets")
    ROUTES = {}
    hub = P2W(583, 204)
    ROADLINES = [((557, 147), (963, 367), 24), ((473, 157), (617, 230), 10), ((430, 297), (617, 213), 10),
                 ((640, 262), (930, 128), 10), ((700, 320), (1082, 186), 10)]

# ============================================================== background framing: wider 16:9, district right of centre
if VIEW == "bg":
    RX, RY = 2880, 1620
    sc.render.resolution_x, sc.render.resolution_y = RX, RY
    cam.data.ortho_scale = PW * MPP * 1.15; cam.data.shift_x, cam.data.shift_y = -0.15, 0.02
    bpy.context.view_layer.update()
def QUIET(x, y):
    """Under the headline (left of the bg frame): filler thins out gradually to plain streets and ground."""
    if VIEW != "bg": return False
    u = W2P((x, y, 0))[0] / PW
    return rng.random() > min(1.0, max(0.0, (u - 0.24) / 0.16))

# ============================================================== streets under the lines, extended across the frame
def frame_ground(fx, fy):
    """Where the current camera's frame corner (0..1, 0..1 from top-left) meets the ground."""
    mw = cam.matrix_world; right, up, fwd = mw.col[0].xyz.normalized(), mw.col[1].xyz.normalized(), -mw.col[2].xyz.normalized()
    S_ = cam.data.ortho_scale; aspect = sc.render.resolution_y / sc.render.resolution_x
    xs = (fx - 0.5 + cam.data.shift_x) * S_; ys = (0.5 - fy) * S_ * aspect + cam.data.shift_y * S_
    o = cam.location + right * xs + up * ys; t = -o.z / fwd.z; return Vector((o.x + fwd.x * t, o.y + fwd.y * t, 0))
corners = [frame_ground(a, b) for a in (0, 1) for b in (0, 1)] if VIEW == "bg" else [P2W(0, 0), P2W(PW, 0), P2W(PW, PH), P2W(0, PH)]
PADM = 20
XMIN, XMAX = min(c.x for c in corners) - PADM, max(c.x for c in corners) + PADM
YMIN, YMAX = min(c.y for c in corners) - PADM, max(c.y for c in corners) + PADM
segs = [(a, b) for pls in ROUTES.values() for pl in pls for a, b in zip(pl, pl[1:])]
if VIEW == "hero":
    segs = [(tuple(P2W(*a))[:2], tuple(P2W(*b))[:2]) for a, b, _ in ROADLINES]
xroads, yroads = [], []           # roads running along x (constant y) / along y (constant x)
for a, b in segs:
    if abs(b[0] - a[0]) >= abs(b[1] - a[1]): xroads.append((a[1] + b[1]) / 2)
    else: yroads.append((a[0] + b[0]) / 2)
def dedupe(vals, gap=14):
    out = []
    for v in sorted(vals):
        if not out or v - out[-1] > gap: out.append(v)
    return out
xroads, yroads = dedupe(xroads), dedupe(yroads)
RW = 10.0
def street(horizontal, c):
    if horizontal:
        box("asphalt", (XMIN + XMAX) / 2, c, 0, XMAX - XMIN, RW, 0.06)
        for s in (-1, 1): box("walk", (XMIN + XMAX) / 2, c + s * (RW / 2 + 1.3), 0, XMAX - XMIN, 2.6, 0.16)
        for x in range(int(XMIN), int(XMAX), 6):
            for off in (-2.4, 2.4): box("paint", x + 1.5, c + off, 0.06, 3.0, 0.14, 0.005)
    else:
        box("asphalt", c, (YMIN + YMAX) / 2, 0.001, RW, YMAX - YMIN, 0.06)
        for s in (-1, 1): box("walk", c + s * (RW / 2 + 1.3), (YMIN + YMAX) / 2, 0.001, 2.6, YMAX - YMIN, 0.16)
        for y in range(int(YMIN), int(YMAX), 6):
            for off in (-2.4, 2.4): box("paint", c + off, y + 1.5, 0.061, 0.14, 3.0, 0.005)
for y in xroads: street(True, y)
for x in yroads: street(False, x)
flush("Streets", "Streets")
gm = bpy.data.meshes.new("Ground"); import bmesh
bmg = bmesh.new(); bmesh.ops.create_grid(bmg, x_segments=1, y_segments=1, size=600); bmg.to_mesh(gm); bmg.free()
gro = bpy.data.objects.new("Ground", gm); gm.materials.append(M["plot"]); gro.location.z = -0.01; coll("Streets").objects.link(gro)
print("ROADS x", [round(v) for v in xroads], "y", [round(v) for v in yroads])

# ============================================================== trees, lamps, cars
OCC = []
for o in coll("Buildings").objects:
    if o.type in ("MESH", "CURVE"):
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        OCC.append((min(v.x for v in bb) - 2.5, min(v.y for v in bb) - 2.5, max(v.x for v in bb) + 2.5, max(v.y for v in bb) + 2.5))
def free(x, y):
    if any(a <= x <= c and b <= y <= d for a, b, c, d in OCC): return False
    if any(abs(y - r) < RW / 2 + 3.5 for r in xroads) or any(abs(x - r) < RW / 2 + 3.5 for r in yroads): return False
    return True

# ============================================================== lot detail: nothing between the streets stays empty
def lot_free(x0, y0, x1, y1, pad=1.0):
    return not any(not (x1 + pad < a or x0 - pad > c or y1 + pad < b or y0 - pad > d) for a, b, c, d in OCC)
def parking(x0, y0, x1, y1):
    box("asphalt", (x0 + x1) / 2, (y0 + y1) / 2, 0.0, x1 - x0, y1 - y0, 0.08)
    rows = max(1, int((y1 - y0) / 12))
    for r in range(rows):
        yc = y0 + (r + 0.5) * (y1 - y0) / rows
        for k in range(int((x1 - x0 - 2) / 2.7)):
            xx = x0 + 1.6 + k * 2.7
            for sgn in (-1, 1):
                box("paint", xx - 1.35, yc + sgn * 2.7, 0.08, 0.1, 4.8, 0.006)
                if rng.random() < 0.55:
                    cy_ = yc + sgn * 2.7
                    box("car", xx, cy_, 0.1, 1.8, 4.2, 0.72); box("car", xx, cy_ + 0.15 * sgn, 0.82, 1.6, 2.3, 0.55)
                    box("glass", xx, cy_ + 0.15 * sgn, 0.9, 1.62, 2.1, 0.4)
        box("paint", (x0 + x1) / 2, yc, 0.08, x1 - x0 - 2, 0.12, 0.006)
    for xx in (x0 + 0.6, x1 - 0.6):
        beam("metal", (xx, (y0 + y1) / 2, 0), (xx, (y0 + y1) / 2, 6.0), 0.08, 8); box("lamp", xx, (y0 + y1) / 2, 5.9, 0.5, 0.5, 0.1)
def plaza(x0, y0, x1, y1):
    box("walk", (x0 + x1) / 2, (y0 + y1) / 2, 0.0, x1 - x0, y1 - y0, 0.14)
    for k in range(int((x1 - x0) / 7)):
        px = x0 + 3.5 + k * 7
        for py in (y0 + 3, y1 - 3):
            box("concrete2", px, py, 0.14, 2.2, 2.2, 0.6); tree(px, py, rng.uniform(0.7, 0.9))   # planters
        box("dark", px + 1.8, (y0 + y1) / 2, 0.14, 1.6, 0.5, 0.45)                                # benches
def shed(x0, y0, x1, y1):
    flush("Lots", "Streets")                         # keep pending lot geometry out of the building mesh
    cx_, cy_ = (x0 + x1) / 2, (y0 + y1) / 2; w_, d_ = (x1 - x0) * 0.8, (y1 - y0) * 0.75
    before = set(coll("Buildings").objects)
    K.office(cx_, cy_, w_, d_, rng.choice((1, 2)), lit_p=0.12, clutter=2, name="Lot")
    if VIEW == "bg":                                  # background: no edge lines on filler (keeps Freestyle within memory)
        for o in set(coll("Buildings").objects) - before:
            coll("Buildings").objects.unlink(o); coll("LotBuildings").objects.link(o)
    box("asphalt", cx_, y0 + 1.2, 0.0, x1 - x0, 2.4, 0.08)
def park(x0, y0, x1, y1):
    box("grass", (x0 + x1) / 2, (y0 + y1) / 2, 0.0, x1 - x0, y1 - y0, 0.06)
    box("walk", (x0 + x1) / 2, (y0 + y1) / 2, 0.06, x1 - x0, 1.8, 0.03); box("walk", (x0 + x1) / 2, (y0 + y1) / 2, 0.06, 1.8, y1 - y0, 0.03)
    for _ in range(int((x1 - x0) * (y1 - y0) / 45)):
        tx, ty = rng.uniform(x0 + 1, x1 - 1), rng.uniform(y0 + 1, y1 - 1)
        if abs(tx - (x0 + x1) / 2) > 2 and abs(ty - (y0 + y1) / 2) > 2: tree(tx, ty, rng.uniform(0.8, 1.25))
xs_ = sorted(set([XMIN] + list(yroads) + [XMAX])); ys_ = sorted(set([YMIN] + list(xroads) + [YMAX]))
M_ = RW / 2 + 2.6 + 1.0
lots = 0
for xa, xb in zip(xs_, xs_[1:]):
    for ya, yb in zip(ys_, ys_[1:]):
        bx0, bx1 = xa + (M_ if xa != XMIN else 0), xb - (M_ if xb != XMAX else 0)
        by0, by1 = ya + (M_ if ya != YMIN else 0), yb - (M_ if yb != YMAX else 0)
        if bx1 - bx0 < 12 or by1 - by0 < 12: continue
        nx_, ny_ = max(1, round((bx1 - bx0) / 34)), max(1, round((by1 - by0) / 30))
        for i in range(nx_):
            for j in range(ny_):
                x0 = bx0 + i * (bx1 - bx0) / nx_ + 1.2; x1 = bx0 + (i + 1) * (bx1 - bx0) / nx_ - 1.2
                y0 = by0 + j * (by1 - by0) / ny_ + 1.2; y1 = by0 + (j + 1) * (by1 - by0) / ny_ - 1.2
                if x1 - x0 < 9 or y1 - y0 < 9 or not lot_free(x0, y0, x1, y1) or QUIET((x0 + x1) / 2, (y0 + y1) / 2): continue
                kind = rng.choices((parking, plaza, shed, park), weights=(0.3, 0.15, 0.25, 0.3))[0]
                kind(x0, y0, x1, y1); lots += 1
                if kind is not park: OCC.append((x0, y0, x1, y1))
                else: OCC.append((x0, y0, x1, y1))
flush("Lots", "Streets")
print("LOTS", lots)
n = 0
TSTEP = 7 if VIEW == "bg" else 5
for gx in range(int(XMIN), int(XMAX), TSTEP):
    for gy in range(int(YMIN), int(YMAX), TSTEP):
        x, y = gx + rng.uniform(-2, 2), gy + rng.uniform(-2, 2)
        near = min(min(abs(x - (a + c) / 2) + abs(y - (b + d) / 2) for a, b, c, d in OCC), 999)
        p = (0.5 if near < 40 else 0.12) if VIEW in ("network", "bg") else (0.45 if near < 28 else 0.015)
        if QUIET(x, y): p *= 0.15
        if rng.random() < p and free(x, y): tree(x, y, rng.uniform(0.75, 1.2)); n += 1
for y in xroads:
    for x in range(int(XMIN), int(XMAX), 60):
        for s in (-1, 1):
            beam("metal", (x, y + s * (RW / 2 + 0.5), 0), (x, y + s * (RW / 2 + 0.5), 7.5), 0.09, 8)
            box("lamp", x, y + s * (RW / 2 - 1.0), 7.3, 0.6, 0.6, 0.12)
        if rng.random() < 0.3:
            lane = rng.choice((-2.4, 2.4)); xx = x + rng.uniform(4, 26); f = 1 if lane < 0 else -1
            box("car", xx, y + lane, 0.12, 4.2, 1.8, 0.7); box("car", xx, y + lane, 0.82, 2.2, 1.6, 0.55)
            for o in (-0.6, 0.6): box("head", xx + 2.1 * f, y + lane + o, 0.45, 0.05, 0.35, 0.15); box("tail", xx - 2.1 * f, y + lane + o, 0.5, 0.05, 0.35, 0.12)
for x in yroads:
    for y in range(int(YMIN), int(YMAX), 60):
        for s in (-1, 1):
            beam("metal", (x + s * (RW / 2 + 0.5), y, 0), (x + s * (RW / 2 + 0.5), y, 7.5), 0.09, 8)
            box("lamp", x + s * (RW / 2 - 1.0), y, 7.3, 0.6, 0.6, 0.12)
        if rng.random() < 0.3:
            lane = rng.choice((-2.4, 2.4)); yy = y + rng.uniform(4, 26); f = 1 if lane > 0 else -1
            box("car", x + lane, yy, 0.12, 1.8, 4.2, 0.7); box("car", x + lane, yy, 0.82, 1.6, 2.2, 0.55)
            for o in (-0.6, 0.6): box("head", x + lane + o, yy + 2.1 * f, 0.45, 0.35, 0.05, 0.15); box("tail", x + lane + o, yy - 2.1 * f, 0.5, 0.35, 0.05, 0.12)
flush("StreetFurniture", "Streets")
print("TREES", n)

# filler lot buildings get no Freestyle edge lines (keeps the white linework on the main sites and
# keeps Freestyle's memory in check on the wide background frame)
_bld, _st = coll("Buildings"), coll("Streets")
for o in list(_bld.objects):
    if o.name.startswith("Lot_"): _bld.objects.unlink(o); _st.objects.link(o)

# ============================================================== render + export
K.setup_render(SAMPLES, RES)
sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.006, 0.007, 0.01, 1)   # deeper blacks, like the reference
sc.view_settings.exposure = -0.35
_ls = bpy.context.view_layer.freestyle_settings.linesets[0].linestyle                  # crisper white edges
_ls.alpha = 0.38; _ls.thickness = 0.7; sc.render.line_thickness = 0.7; _ls.color = (0.78, 0.8, 0.84)
sc.render.resolution_x, sc.render.resolution_y = RX, RY      # setup_render resets to 2560x1440
if VIEW != "bg": cam.data.shift_x = cam.data.shift_y = 0.0
from mathutils.geometry import convex_hull_2d
def px(co):
    v = world_to_camera_view(sc, cam, Vector(co)); return [round(v.x * RX, 1), round((1 - v.y) * RY, 1)]
def hull(objs):
    pts = []
    for o in objs:
        if o.type != "MESH": continue
        mw = o.matrix_world; vs = o.data.vertices; step = max(1, len(vs) // 3000)
        for i in range(0, len(vs), step): pts.append(px(mw @ vs[i].co))
    return [pts[i] for i in convex_hull_2d(pts)] if len(pts) > 2 else []
shapes, anchors = {}, {}
for k, objs in FAC.items():
    groups = {}
    for o in objs: groups.setdefault(o.name.split("_")[0], []).append(o)
    shapes[k] = [hull(g) for g in groups.values()]
    best = max((o for o in objs if o.type == "MESH"), key=lambda o: max((o.matrix_world @ Vector(c)).z for c in o.bound_box))
    bb = [best.matrix_world @ Vector(c) for c in best.bound_box]
    anchors[k] = px((sum(b.x for b in bb) / 8, sum(b.y for b in bb) / 8, max(b.z for b in bb)))
routes = [{"k": k, "d": [px((p[0], p[1], 0.32)) for p in pl]} for k, polys in ROUTES.items() for pl in polys]
mp = r"D:/Surds_Website/views/home/city-map.js"
data = json.loads(re.search(r"window\.CITY_MAP = (\{.*\});", open(mp, encoding="utf-8").read(), re.S).group(1))
data[VIEW] = {"w": RX, "h": RY, "routes": routes, "shapes": shapes, "hub": px((hub.x, hub.y, 0.5)), "anchors": anchors}
open(mp, "w", encoding="utf-8").write("/* generated by tools/surds_scene.py (hero) and tools/surds_trace.py (network): do not edit by hand */\n"
                                      "window.CITY_MAP = " + json.dumps(data, separators=(",", ":")) + ";\n")
print("ANCHORS", anchors)
os.makedirs(OUT, exist_ok=True)
sc.render.filepath = f"{OUT}/{VIEW}.png"; bpy.ops.render.render(write_still=True); print("SHOT", VIEW)
bpy.ops.wm.save_as_mainfile(filepath=rf"D:/Surds_Website/tools/surds_{VIEW}.blend")
print("DONE")
