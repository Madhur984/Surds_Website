# Dark 2D plan of the SURDS city, rendered top-down in the same black / silver / amber look as the 3D
# scene: the opening frame of the build-up. Run in Blender after surds_city.py, surds_city_animate.py
# and export_plan.py (it reads plan-data.json). Builds the hidden "SURDS Plan" collection;
# render_plan(path) shows it, hides the 3D buildings, renders from above and restores everything.
import bpy, bmesh, json, math
from mathutils import Vector

PLAN_JSON = globals().get("PLAN_JSON", "/home/boom/SURDS_docs/website/tools/blender/plan-data.json")
FONT_PATH = "/usr/share/fonts/google-noto/NotoSansMono-Medium.ttf"
D = json.load(open(PLAN_JSON))
scene = bpy.context.scene
Z = 0.19                                   # just above the block pads (0.15)

old = bpy.data.collections.get("SURDS Plan")
if old:
    for o in list(old.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(old)
PLAN = bpy.data.collections.new("SURDS Plan")
scene.collection.children.link(PLAN)
PLAN.hide_render = True                    # only render_plan() shows it


def emit(name, color, strength):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.animation_data_clear()               # keys from an earlier intro build
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*color, 1)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
    return m


def flat(name, color):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = 1.0
    return m


M_LINE = emit("Plan Line", (0.78, 0.8, 0.84), 2.2)        # building outlines: silver hairlines
M_DIM = emit("Plan Dim Line", (0.5, 0.52, 0.56), 0.55)    # plot boundaries
M_TEXT = emit("Plan Text", (0.62, 0.64, 0.68), 0.9)
M_WARM = emit("Plan Warm", (1.0, 0.62, 0.28), 2.5)        # hero labels, matching the amber network
M_FILL = flat("Plan Fill", (0.03, 0.031, 0.034))


def obj(name, bm, m):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(m)
    PLAN.objects.link(o)
    return o


def strip(bm, a, b, w, z=Z):
    a, b = Vector((*a, z)), Vector((*b, z))
    d = (b - a)
    if d.length < 1e-6:
        return
    n = Vector((-d.y, d.x, 0)).normalized() * w / 2
    vs = [bm.verts.new(p) for p in (a - n, b - n, b + n, a + n)]
    bm.faces.new(vs)


def poly(bm, pts, w, closed=True, dash=None, z=Z):
    segs = list(zip(pts, pts[1:] + pts[:1] if closed else pts[1:]))
    for a, b in segs:
        if not dash:
            strip(bm, a, b, w, z)
            continue
        a, b = Vector(a), Vector(b)
        L = (b - a).length
        t = 0.0
        while t < L:
            e = min(t + dash[0], L)
            strip(bm, a + (b - a) * (t / L), a + (b - a) * (e / L), w, z)
            t += dash[0] + dash[1]


def corners(b, pad=0.0):
    return [(b[0] - pad, b[1] - pad), (b[2] + pad, b[1] - pad), (b[2] + pad, b[3] + pad), (b[0] - pad, b[3] + pad)]


def ring(bm, c, r, w, n=40, z=Z):
    pts = [(c[0] + r * math.cos(2 * math.pi * k / n), c[1] + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    poly(bm, pts, w, z=z)


def centre(b):
    return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)


def inside(p, b):
    return b[0] <= p[0] <= b[2] and b[1] <= p[1] <= b[3]


# camera yaw of the 3D shot: the plan is drawn turned the same way, so the opening tilt is one move
cam3d = scene.camera
fwd = cam3d.matrix_world.to_quaternion() @ Vector((0, 0, -1))
YAW = math.atan2(-fwd.x, fwd.y)

FONT = bpy.data.fonts.load(FONT_PATH, check_existing=True)


def label(s, at, size, m=M_TEXT, spacing=1.15):
    cu = bpy.data.curves.new("Plan Label", "FONT")
    cu.body = s
    cu.font = FONT
    cu.size = size
    cu.space_character = spacing
    cu.align_x, cu.align_y = "CENTER", "CENTER"
    o = bpy.data.objects.new(f"Plan Label {s}", cu)
    o.location = (at[0], at[1], Z + 0.01)
    o.rotation_euler = (0, 0, YAW)
    o.data.materials.append(m)
    PLAN.objects.link(o)
    return o


# ---------------------------------------------------------------- plots
heroes = [b for b in D["buildings"] if not b["filler"]]
NAMES = {"Commercial Tower": "COMMERCIAL TOWER", "Cooling Plant A": "COOLING PLANT", "Office Block": "OFFICES",
         "Data Center": "DATA CENTRE", "Power Plant": "POWER PLANT", "Clean Room Lab": "CLEAN ROOMS",
         "Hospital": "HOSPITAL"}
blocks = sorted(D["blocks"], key=lambda b: (-centre(b)[1], centre(b)[0]))
bm_plot, bm_sub = bmesh.new(), bmesh.new()
for n, blk in enumerate(blocks, start=101):
    poly(bm_plot, corners(blk, -0.6), 0.09)
    lead = next((h["name"] for h in heroes if h["name"] in NAMES and inside(centre(h["box"]), blk)), None)
    if inside(centre(D["substation"]), blk):
        lead = "Substation"
        NAMES[lead] = "SUBSTATION"
    x0, y0, x1, y1 = blk
    if lead:
        label(NAMES[lead], (centre(blk)[0], y0 + 2.6), 1.5, M_WARM, 1.25)
        label(f"PLOT {n}", (centre(blk)[0], y1 - 2.4), 1.0)
    else:
        cx, cy = centre(blk)
        poly(bm_sub, [(cx, y0 + 0.6), (cx, y1 - 0.6)], 0.06, closed=False, dash=(0.7, 0.5))
        poly(bm_sub, [(x0 + 0.6, cy), (x1 - 0.6, cy)], 0.06, closed=False, dash=(0.7, 0.5))
        for k, (qx, qy) in enumerate([(-1, 1), (1, 1), (-1, -1), (1, -1)], start=1):
            label(f"{n}/{k}", (cx + qx * 7.4, cy + qy * 7.4), 0.85)
obj("Plan Plots", bm_plot, M_DIM)
obj("Plan Sub-plots", bm_sub, M_DIM)

# ---------------------------------------------------------------- footprints
bm_fill, bm_out, bm_in = bmesh.new(), bmesh.new(), bmesh.new()
for b in D["buildings"]:
    vs = [bm_fill.verts.new((x, y, Z - 0.01)) for x, y in corners(b["box"])]
    bm_fill.faces.new(vs)
    poly(bm_out, corners(b["box"]), 0.14 if not b["filler"] else 0.09)
    if not b["filler"]:                     # wall thickness: a second line just inside
        poly(bm_in, corners(b["box"], -0.45), 0.05)
for c in D["cooling"][::2]:
    r = (c[2] - c[0]) / 2
    ring(bm_out, centre(c), r, 0.1)
    ring(bm_in, centre(c), r * 0.7, 0.05)
for s in D["stacks"]:
    ring(bm_out, centre(s), (s[2] - s[0]) / 2 + 0.15, 0.12, n=20)
poly(bm_in, corners(D["substation"]), 0.06, dash=(0.8, 0.5))
for t in D["transformers"]:
    poly(bm_out, corners(t), 0.08)
for t in D["pylons"]:
    poly(bm_out, corners(t), 0.07)
    poly(bm_in, [(t[0], t[1]), (t[2], t[3])], 0.05, closed=False)
    poly(bm_in, [(t[2], t[1]), (t[0], t[3])], 0.05, closed=False)
for ln in D["power_lines"][::2]:
    poly(bm_in, [tuple(ln[0]), tuple(ln[-1])], 0.04, closed=False, dash=(1.2, 0.8))
for x, y in D["trees"]:
    ring(bm_in, (x, y), 1.0, 0.05, n=16)
# the SURDS network, drawn flat in amber (the 3D network only grows in at the end of the build)
M_NET = emit("Plan Network", (1.0, 0.55, 0.18), 6.0)
bm_net = bmesh.new()
for ln in D["links"]:
    poly(bm_net, [tuple(q) for q in ln["pts"]], 0.24, closed=False, z=Z + 0.02)
    ring(bm_net, tuple(ln["pts"][-1]), 0.55, 0.16, n=20, z=Z + 0.02)
ring(bm_net, tuple(D["hub"]), 1.3, 0.3, n=28, z=Z + 0.02)
obj("Plan Network", bm_net, M_NET)
obj("Plan Footprint Fill", bm_fill, M_FILL)
obj("Plan Footprints", bm_out, M_LINE)
obj("Plan Details", bm_in, M_DIM)

# ---------------------------------------------------------------- render
KEEP = ("Ground", "Roads", "Lane Markings", "Headlight Trails", "Tail Light Trails", "City Blocks", "Expressway",
        "Street Lights", "Link ", "Node ", "Hub", "Moonlight", "SURDS Cam")


def render_plan(path, scale=1.0, samples=64, frame=None):
    """Top-down render of the plan in the scene's own look; restores the scene afterwards."""
    city = bpy.data.collections["SURDS_City"]
    hidden = [o for o in city.all_objects if not o.name.startswith(KEEP) and not o.hide_render]
    trees = scene.view_layers.get("Trees")
    state = dict(cam=scene.camera, fs=scene.render.use_freestyle, frame=scene.frame_current,
                 res=(scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage),
                 taa=scene.eevee.taa_render_samples, trees=trees.use if trees else None)
    cd = bpy.data.cameras.new("Plan Cam")
    cd.type, cd.clip_end = "ORTHO", 600
    cd.ortho_scale = 330 * scale
    cam = bpy.data.objects.new("Plan Cam", cd)
    scene.collection.objects.link(cam)
    cam.location = (0, 0, 250)
    cam.rotation_euler = (0, 0, YAW)
    try:
        for o in hidden:
            o.hide_render = True
        PLAN.hide_render = False
        if trees:
            trees.use = False
        scene.render.use_freestyle = False
        scene.camera = cam
        scene.frame_set(frame if frame is not None else scene.frame_end)
        scene.eevee.taa_render_samples = samples
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
    finally:
        for o in hidden:
            o.hide_render = False
        PLAN.hide_render = True
        if trees:
            trees.use = state["trees"]
        scene.render.use_freestyle = state["fs"]
        scene.camera = state["cam"]
        scene.frame_set(state["frame"])
        scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = state["res"]
        scene.eevee.taa_render_samples = state["taa"]
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cd)


print("plan:", len(PLAN.objects), "objects, yaw", round(math.degrees(YAW), 1))
