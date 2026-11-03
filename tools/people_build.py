# Build posed, web-light people for /explore (and the data-center model) in Blender, headless.
#   blender -b --factory-startup --python tools/people_build.py -- <scratch>/people_raw.glb
#   then: gltf-transform optimize <scratch>/people_raw.glb views/explore/assets/people.glb --compress meshopt --simplify false
#         --texture-compress false --flatten false --join false --palette false --instance false   (keeps figure names + zones)
# Each figure is a skeleton of joints turned into a smooth body with the Skin + Subdivision modifiers (about
# 7k triangles, no decimation so clothing edges stay clean). Faces get clothing zones (shirt, sleeve, vest, stripe, belt, trousers, shoes, skin, hair) from the
# nearest bone, so the page can dress every person differently with one mesh. Static poses: no skinning, cheap.
# Output: one GLB with a root node per figure (m_stand, f_walk, ...), children "body", "hat" and sometimes "prop".
import bpy, bmesh, sys, math
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)

# every zone a different colour: identical materials get merged by gltf-transform's dedup, and the page needs them apart
COL = {"skin": (0.62, 0.42, 0.32), "hair": (0.05, 0.04, 0.035), "shirt": (0.12, 0.17, 0.3), "sleeve": (0.13, 0.18, 0.32),
       "vest": (0.78, 0.88, 0.1), "stripe": (0.8, 0.82, 0.84), "belt": (0.04, 0.04, 0.045), "trousers": (0.09, 0.1, 0.12),
       "shoes": (0.03, 0.03, 0.03), "hat": (0.95, 0.95, 0.93), "device": (0.06, 0.06, 0.07), "screen": (0.2, 0.45, 0.8)}
MATS = {}
for k, c in COL.items():
    m = bpy.data.materials.new(k); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*c, 1); b.inputs["Roughness"].default_value = 0.6 if k != "screen" else 0.2
    MATS[k] = m
ORDER = list(COL)

def V(*a): return Vector(a)

# ---------------------------------------------------------------- poses (x = figure's left, -y = forward, z up), metres
def mirror(d):
    out = {}
    for k, v in d.items():
        if k.startswith("L_"): out[k] = v; out["R_" + k[2:]] = V(-v.x, v.y, v.z) if ("R_" + k[2:]) not in d else d["R_" + k[2:]]
        elif not k.startswith("R_"): out[k] = v
    for k, v in d.items():
        if k.startswith("R_"): out[k] = v
    return out

STAND = mirror({"pelvis": V(0, 0, 0.98), "waist": V(0, 0.005, 1.13), "chest": V(0, 0, 1.29), "uchest": V(0, 0.01, 1.4),
    "neck0": V(0, 0.015, 1.49), "neck1": V(0, 0.005, 1.56),
    "L_sh": V(0.2, 0.015, 1.425), "L_el": V(0.245, 0.04, 1.16), "L_wr": V(0.26, 0.0, 0.925), "L_ha": V(0.262, -0.01, 0.815),
    "L_hip": V(0.1, 0, 0.94), "L_kn": V(0.11, -0.025, 0.52), "L_an": V(0.11, 0.02, 0.09), "L_to": V(0.12, -0.15, 0.035),
    "R_kn": V(-0.105, -0.005, 0.52), "R_an": V(-0.11, 0.025, 0.09), "R_to": V(-0.13, -0.145, 0.035),
    "head_tilt": V(0.06, 0, 0)})

WALK = dict(STAND); WALK.update({"pelvis": V(0, 0, 0.965), "waist": V(0, 0.0, 1.115), "chest": V(0, -0.01, 1.275), "uchest": V(0, -0.005, 1.385),
    "neck0": V(0, 0.0, 1.475), "neck1": V(0, -0.01, 1.545),
    "L_hip": V(0.1, 0, 0.925), "L_kn": V(0.11, -0.19, 0.52), "L_an": V(0.11, -0.29, 0.11), "L_to": V(0.12, -0.44, 0.075),
    "R_hip": V(-0.1, 0, 0.925), "R_kn": V(-0.11, 0.07, 0.5), "R_an": V(-0.11, 0.3, 0.15), "R_to": V(-0.12, 0.17, 0.02),
    "R_sh": V(-0.2, 0.0, 1.41), "R_el": V(-0.24, -0.1, 1.165), "R_wr": V(-0.25, -0.24, 0.98), "R_ha": V(-0.25, -0.31, 0.89),
    "L_sh": V(0.2, 0.02, 1.41), "L_el": V(0.245, 0.12, 1.165), "L_wr": V(0.255, 0.19, 0.935), "L_ha": V(0.255, 0.21, 0.82),
    "head_tilt": V(0.04, 0, 0)})

TABLET = dict(STAND); TABLET.update({
    "R_el": V(-0.235, -0.01, 1.17), "R_wr": V(-0.14, -0.25, 1.11), "R_ha": V(-0.09, -0.31, 1.12),
    "L_el": V(0.235, -0.01, 1.17), "L_wr": V(0.13, -0.25, 1.08), "L_ha": V(0.075, -0.31, 1.095),
    "L_kn": V(0.115, -0.06, 0.53), "L_an": V(0.12, 0.0, 0.09), "L_to": V(0.14, -0.16, 0.035),
    "head_tilt": V(0.42, 0, 0)})

SIT = mirror({"pelvis": V(0, 0.06, 0.56), "waist": V(0, 0.055, 0.71), "chest": V(0, 0.035, 0.87), "uchest": V(0, 0.03, 0.98),
    "neck0": V(0, 0.03, 1.07), "neck1": V(0, 0.015, 1.14),
    "L_sh": V(0.2, 0.035, 1.005), "L_el": V(0.235, -0.03, 0.76), "L_wr": V(0.17, -0.3, 0.76), "L_ha": V(0.13, -0.41, 0.755),
    "L_hip": V(0.1, -0.03, 0.55), "L_kn": V(0.115, -0.39, 0.53), "L_an": V(0.12, -0.43, 0.09), "L_to": V(0.13, -0.58, 0.035),
    "R_kn": V(-0.11, -0.38, 0.53), "R_an": V(-0.12, -0.36, 0.09), "R_to": V(-0.13, -0.51, 0.035),
    "head_tilt": V(0.14, 0, 0)})

KNEEL = {"pelvis": V(0, 0.06, 0.5), "waist": V(0, 0.02, 0.645), "chest": V(0, -0.04, 0.8), "uchest": V(0, -0.075, 0.9),
    "neck0": V(0, -0.105, 0.98), "neck1": V(0, -0.125, 1.045),
    "L_sh": V(0.2, -0.07, 0.925), "L_el": V(0.225, -0.22, 0.7), "L_wr": V(0.15, -0.37, 0.585), "L_ha": V(0.125, -0.45, 0.56),
    "R_sh": V(-0.2, -0.07, 0.925), "R_el": V(-0.25, -0.3, 0.8), "R_wr": V(-0.23, -0.52, 0.72), "R_ha": V(-0.22, -0.62, 0.7),
    "L_hip": V(0.1, 0.04, 0.47), "L_kn": V(0.11, -0.39, 0.5), "L_an": V(0.115, -0.41, 0.09), "L_to": V(0.125, -0.56, 0.035),
    "R_hip": V(-0.1, 0.04, 0.47), "R_kn": V(-0.11, -0.02, 0.075), "R_an": V(-0.11, 0.4, 0.075), "R_to": V(-0.12, 0.47, 0.03),
    "head_tilt": V(0.3, 0, 0)}
for k in ("L_hip",): STAND["R_hip"] = V(-0.1, 0, 0.94)
for P in (STAND, WALK, TABLET):
    P.setdefault("R_hip", V(-0.1, 0, 0.94))
SIT["R_hip"] = V(-0.1, -0.03, 0.55)

POSES = {"stand": STAND, "walk": WALK, "tablet": TABLET, "sit": SIT, "kneel": KNEEL}

# bones: (a, b, zone)
BONES = [("pelvis", "waist", "torso"), ("waist", "chest", "torso"), ("chest", "uchest", "torso"), ("uchest", "neck0", "neck"), ("neck0", "neck1", "neck")]
for s in "LR":
    BONES += [("uchest", f"{s}_sh", "torso"), (f"{s}_sh", f"{s}_el", s + "uarm"), (f"{s}_el", f"{s}_wr", s + "farm"), (f"{s}_wr", f"{s}_ha", s + "hand"),
              ("pelvis", f"{s}_hip", s + "hip"), (f"{s}_hip", f"{s}_kn", s + "thigh"), (f"{s}_kn", f"{s}_an", s + "shin"), (f"{s}_an", f"{s}_to", s + "foot")]

FAT = 1.32
def radii(body):
    f = body == "f"
    R = {"pelvis": (0.165, 0.105) if not f else (0.172, 0.11), "waist": (0.148, 0.098) if not f else (0.125, 0.088),
         "chest": (0.165, 0.112) if not f else (0.145, 0.112), "uchest": (0.178, 0.1) if not f else (0.152, 0.098),
         "neck0": (0.054, 0.056) if not f else (0.046, 0.048), "neck1": (0.05, 0.054) if not f else (0.043, 0.047)}
    for s in "LR":
        R.update({f"{s}_sh": (0.062, 0.062) if not f else (0.052, 0.052), f"{s}_el": (0.042, 0.042) if not f else (0.034, 0.034),
                  f"{s}_wr": (0.03, 0.022) if not f else (0.025, 0.019), f"{s}_ha": (0.04, 0.017) if not f else (0.034, 0.015),
                  f"{s}_hip": (0.088, 0.088) if not f else (0.094, 0.09), f"{s}_kn": (0.054, 0.054) if not f else (0.05, 0.05),
                  f"{s}_an": (0.038, 0.04) if not f else (0.033, 0.035), f"{s}_to": (0.042, 0.03) if not f else (0.036, 0.026)})
    return R

def nz(v): return v.normalized()

def cuts_and_rules(J):
    """Clothing boundaries as planes (point, normal, bone groups to cut) and the rule that dresses a face."""
    up = nz(J["uchest"] - J["pelvis"]); L = (J["uchest"] - J["pelvis"]).dot(up)
    band = lambda h: J["pelvis"] + up * h
    vb, vt = 0.105, L + 0.02
    st = [vb + (vt - vb) * t for t in (0.22, 0.31, 0.5, 0.59)]
    cuts = [(band(h), up, {"torso", "Lhip", "Rhip", "neck", "Luarm", "Ruarm"}) for h in (0.075, 0.105, *st, vt)]
    nd = nz(J["neck0"] - J["uchest"]); collar = J["uchest"] + (J["neck0"] - J["uchest"]) * 0.9
    cuts.append((collar, nd, {"neck", "torso"}))
    arm = {}
    for s in "LR":
        ud = nz(J[f"{s}_el"] - J[f"{s}_sh"]); fd = nz(J[f"{s}_wr"] - J[f"{s}_el"]); sd = nz(J[f"{s}_an"] - J[f"{s}_kn"])
        sleeve = J[f"{s}_sh"] + (J[f"{s}_el"] - J[f"{s}_sh"]) * 0.42; cuff = J[f"{s}_wr"] - fd * 0.025; hem = J[f"{s}_an"] - sd * 0.035
        arm[s] = (ud, fd, sd, sleeve, cuff, hem)
        cuts += [(sleeve, ud, {s + "uarm", "torso"}), (cuff, fd, {s + "farm", s + "hand"}), (hem, sd, {s + "shin", s + "foot"})]
    def rule(grp, c):
        if grp == "torso":
            h = (c - J["pelvis"]).dot(up)
            if h < 0.075: return "trousers"
            if h < 0.105: return "belt"
            if h > vt: return "shirt"
            return "stripe" if (st[0] < h < st[1] or st[2] < h < st[3]) else "vest"
        if grp == "neck": return rule("torso", c) if (c - collar).dot(nd) < 0 else "skin"
        s, part = grp[0], grp[1:]
        ud, fd, sd, sleeve, cuff, hem = arm.get(s, (None,) * 6)
        if part == "uarm": return "shirt" if (c - sleeve).dot(ud) < 0 else "sleeve"
        if part in ("farm", "hand"): return "sleeve" if (c - cuff).dot(fd) < 0 else "skin"
        if part == "hip": return "trousers" if (c - J["pelvis"]).dot(up) < 0.105 else rule("torso", c)   # no belt bits on a lap
        if part == "thigh": return "trousers"
        if part in ("shin", "foot"): return "trousers" if (c - hem).dot(sd) < 0 else "shoes"
        return "shirt"
    return cuts, rule

def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (a + ab * t - p).length

def new_obj(name, me):
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    for k in ORDER: me.materials.append(MATS[k])
    return o

def ellipsoid(bm, centre, r, rot, seg=18, rings=12, keep=None, taper=None):
    """Add a UV ellipsoid to bm. keep(n) filters on the unit-sphere normal; taper(n) scales x/y by height."""
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    vs = res["verts"]
    if keep:
        kill = [v for v in vs if not keep(v.co.copy())]
        bmesh.ops.delete(bm, geom=kill, context="VERTS"); vs = [v for v in vs if v.is_valid]
    for v in vs:
        n = v.co.copy(); s = taper(n) if taper else 1.0
        v.co = rot @ V(n.x * r[0] * s, n.y * r[1] * s, n.z * r[2]) + centre
    return set(f for v in vs for f in v.link_faces)

def build(body, pose_name, ox):
    P = POSES[pose_name]; S = 0.94 if body == "f" else 1.0
    J = {k: v * S for k, v in P.items() if k != "head_tilt"}
    # a shorter neck: the base moves into the shoulders, the head follows
    n0 = J["uchest"] + (J["neck0"] - J["uchest"]) * 0.78; J["neck1"] = n0 + (J["neck1"] - J["neck0"]) * 0.9; J["neck0"] = n0
    R = radii(body)
    # ---- skeleton mesh -> skin -> subdivision
    names = list(J); me = bpy.data.meshes.new("sk")
    me.from_pydata([J[n] for n in names], [(names.index(a), names.index(b)) for a, b, _ in BONES], [])
    sk = bpy.data.objects.new("sk", me); bpy.context.scene.collection.objects.link(sk)
    m = sk.modifiers.new("skin", "SKIN"); m.branch_smoothing = 0.6; m.use_smooth_shade = True
    for i, n in enumerate(names):
        d = me.skin_vertices[0].data[i]; d.radius = tuple(x * S * FAT for x in R[n]); d.use_root = n == "pelvis"   # FAT: subdivision shrinks the skin cage ~25%
    sub = sk.modifiers.new("sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
    dg = bpy.context.evaluated_depsgraph_get(); ev = sk.evaluated_get(dg)
    bm = bmesh.new(); bm.from_mesh(ev.to_mesh()); ev.to_mesh_clear()
    bpy.data.objects.remove(sk, do_unlink=True); bpy.data.meshes.remove(me)
    # each face belongs to the bone it is nearest to *relative to that bone's thickness* (a hand hanging by the hip
    # is close to the hip in metres, but far in hand-radii), then clothing edges are cut in as real edge loops
    rad = {n: sum(R[n]) / 2 * S * FAT * 0.8 for n in names}
    segs = [(J[a], J[b], rad[a], rad[b], z) for a, b, z in BONES]
    def owner(c):
        best, bz = 1e9, None
        for a, b, ra, rb, z in segs:
            ab = b - a; t = max(0.0, min(1.0, (c - a).dot(ab) / max(ab.length_squared, 1e-9)))
            d = (a + ab * t - c).length / (ra + (rb - ra) * t)
            if d < best: best, bz = d, z
        return bz
    cuts, rule = cuts_and_rules(J)
    for co, no, groups in cuts:
        fs = [f for f in bm.faces if owner(f.calc_center_median()) in groups]
        if not fs: continue
        geom = list({v for f in fs for v in f.verts}) + list({e for f in fs for e in f.edges}) + fs
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=0.002)
    for f in bm.faces:
        c = f.calc_center_median(); f.material_index = ORDER.index(rule(owner(c), c))
    # ---- head: tapered ellipsoid with nose and ears; hair cap; female hair bun
    tilt = P["head_tilt"].x; rot = Matrix.Rotation(tilt, 3, "X")
    hc = J["neck1"] + rot @ (V(0, -0.014, 0.088) * S)
    hr = (0.077 * S, 0.094 * S, 0.112 * S)
    jaw = lambda n: 1.0 - 0.22 * max(0.0, -n.z) ** 1.6
    for f in ellipsoid(bm, hc, hr, rot, 20, 14, taper=jaw): f.material_index = ORDER.index("skin")
    for f in ellipsoid(bm, hc + rot @ V(0, -0.088 * S, -0.012 * S), (0.014 * S, 0.022 * S, 0.026 * S), rot, 8, 6): f.material_index = ORDER.index("skin")
    for sx in (1, -1):   # eyes and brows, small: they read as a face from a few metres away without staring
        for f in ellipsoid(bm, hc + rot @ V(sx * 0.03 * S, -0.084 * S, 0.012 * S), (0.009 * S, 0.006 * S, 0.006 * S), rot, 8, 6): f.material_index = ORDER.index("belt")
        for f in ellipsoid(bm, hc + rot @ V(sx * 0.032 * S, -0.086 * S, 0.031 * S), (0.017 * S, 0.006 * S, 0.004 * S), rot, 8, 4): f.material_index = ORDER.index("hair")
    for sx in (1, -1):
        for f in ellipsoid(bm, hc + rot @ V(sx * 0.074 * S, 0.004, -0.004), (0.012 * S, 0.02 * S, 0.03 * S), rot, 8, 6): f.material_index = ORDER.index("skin")
    if body == "m": keep = lambda n: n.z > (0.4 if n.y < -0.45 else -0.14 if n.y > 0.3 else 0.1)   # front hairline high, short at the back
    else: keep = lambda n: n.z > 0.05 or (n.y > -0.05 and n.z > -0.75) or (abs(n.x) > 0.6 and n.z > -0.6 and n.y > -0.35)
    hairr = (hr[0] * 1.075, hr[1] * 1.06, hr[2] * 1.05)
    for f in ellipsoid(bm, hc + rot @ V(0, 0.004, 0.006), hairr, rot, 20, 14, keep=keep, taper=jaw): f.material_index = ORDER.index("hair")
    if body == "f":
        for f in ellipsoid(bm, hc + rot @ V(0, 0.105 * S, 0.035 * S), (0.045 * S, 0.042 * S, 0.048 * S), rot, 10, 8): f.material_index = ORDER.index("hair")
    # ---- decimate to a web budget
    bme = bpy.data.meshes.new(f"{body}_{pose_name}_body"); bm.to_mesh(bme); bm.free()
    o = new_obj("body", bme)
    for i, mt in enumerate(list(o.data.materials)): pass
    o.data.shade_smooth()
    # ---- hard hat (the page shows it on engineers only)
    hb = bmesh.new()
    ellipsoid(hb, hc + rot @ V(0, 0.0, 0.03 * S), (0.104 * S, 0.122 * S, 0.112 * S), rot, 18, 10, keep=lambda n: n.z > -0.02)
    res = bmesh.ops.create_cone(hb, cap_ends=True, segments=18, radius1=1, radius2=1, depth=1)
    for v in res["verts"]: v.co = rot @ V(v.co.x * 0.112 * S, v.co.y * 0.13 * S - 0.02 * S, v.co.z * 0.008 + 0.028 * S) + hc
    for f in hb.faces: f.material_index = ORDER.index("hat")
    hme = bpy.data.meshes.new(f"{body}_{pose_name}_hat"); hb.to_mesh(hme); hb.free(); hat = new_obj("hat", hme); hat.data.shade_smooth()
    parts = [o, hat]
    # ---- props: a tablet in the tablet pose
    if pose_name == "tablet":
        pb = bmesh.new(); mid = (J["L_ha"] + J["R_ha"]) / 2 + V(0, -0.005, 0.03 * S)
        res = bmesh.ops.create_cube(pb, size=1.0); prot = Matrix.Rotation(-0.75, 3, "X")
        for v in res["verts"]: v.co = prot @ V(v.co.x * 0.25, v.co.y * 0.17, v.co.z * 0.012) + mid
        pb.normal_update()
        for f in pb.faces: f.material_index = ORDER.index("screen" if (prot.inverted() @ f.normal).z > 0.9 else "device")
        pme = bpy.data.meshes.new(f"{body}_tablet_prop"); pb.to_mesh(pme); pb.free(); parts.append(new_obj("prop", pme))
    root = bpy.data.objects.new(f"{body}_{pose_name}", None); bpy.context.scene.collection.objects.link(root)
    for p in parts: p.parent = root
    root.location = (ox, 0, 0)
    tri = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print(f"FIG {body}_{pose_name} body tris {tri}")

x = 0.0
for body in ("m", "f"):
    for pose in POSES:
        build(body, pose, x); x += 0.9
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True, export_attributes=False)
print("WROTE", OUT)
