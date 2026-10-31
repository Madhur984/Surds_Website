# Bake the website's boxed labels into the traced network scene, so the .blend renders the
# "connected physical world" panel on its own (as on the site), then pack and save it.
#   blender -b tools/surds_network.blend --python tools/surds_labels.py -- [--res 100] [--samples 96]
# Writes tools/SURDS_connected_world.blend (everything packed) and tools/scene_out/connected_world.png
import bpy, sys, json, re
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
RES = int(argv[argv.index("--res") + 1]) if "--res" in argv else 100
SAMPLES = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 96
sc = bpy.context.scene; cam = sc.camera
RX, RY = sc.render.resolution_x, sc.render.resolution_y
S = cam.data.ortho_scale; MPX = S / RX                      # metres per render pixel

# anchors (render px) written by tools/surds_trace.py
data = json.loads(re.search(r"window\.CITY_MAP = (\{.*\});", open(r"D:/Surds_Website/views/home/city-map.js", encoding="utf-8").read(), re.S).group(1))
ANCH = data["network"]["anchors"]
LABELS = {"commercial": "COMMERCIAL\nBUILDINGS", "dc": "DATA CENTERS", "clean": "CLEAN ROOMS\n& PHARMA",
          "energy": "ENERGY &\nUTILITIES", "health": "HEALTHCARE\n& LABS"}

# sizes, in render pixels, matching the site's CSS (.net-tag) at this panel's width
FONT, LEAD, PADX, PADY, BORDER, DOT = 24, 74, 24, 16, 2.2, 7

def emit(name, col, strength, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0, 0, 0, 1); b.inputs["Roughness"].default_value = 1.0
    b.inputs["Emission Color"].default_value = (*col, 1); b.inputs["Emission Strength"].default_value = strength
    b.inputs["Alpha"].default_value = alpha
    return m
M_TEXT = emit("Label_Text", (0.93, 0.92, 0.9), 1.15)
M_FILL = emit("Label_Fill", (0.0, 0.0, 0.0), 0.0, 0.86)
M_EDGE = emit("Label_Edge", (1.0, 0.5, 0.15), 0.35)
M_DOT  = emit("Label_Dot",  (1.0, 0.5, 0.15), 3.0)

font = bpy.data.fonts.load(r"D:/Surds_Website/tools/Inter-SemiBold.ttf")
col = bpy.data.collections.new("Labels"); sc.collection.children.link(col)

mw = cam.matrix_world
right, up, fwd = mw.col[0].xyz.normalized(), mw.col[1].xyz.normalized(), -mw.col[2].xyz.normalized()
DEPTH = 420.0                                               # in front of the whole district; ortho, so screen position is unchanged
def plane_point(u, v):
    return cam.location + right * ((u / RX - 0.5) * S) + up * ((0.5 - v / RY) * S * RY / RX) + fwd * DEPTH

def quiet(o):                                               # labels light nothing and cast nothing
    for a in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(o, a, False)
    return o
def rect(name, x0, y0, x1, y1, z, mat, parent):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)]); me.materials.append(mat)
    o = bpy.data.objects.new(name, me); o.parent = parent; col.objects.link(o); return quiet(o)
def disc(name, r, z, mat, parent, seg=32):
    import math
    me = bpy.data.meshes.new(name)
    vs = [(0, 0, z)] + [(r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg), z) for k in range(seg)]
    me.from_pydata(vs, [], [(0, k + 1, (k + 1) % seg + 1) for k in range(seg)]); me.materials.append(mat)
    o = bpy.data.objects.new(name, me); o.parent = parent; col.objects.link(o); return quiet(o)

for k, txt in LABELS.items():
    u, v = ANCH[k]
    root = bpy.data.objects.new(f"Label_{k}", None); col.objects.link(root)
    root.location = plane_point(u, v); root.rotation_euler = mw.to_euler()
    root.empty_display_size = 2
    tc = bpy.data.curves.new(f"LabelText_{k}", "FONT"); tc.body = txt; tc.font = font
    tc.size = FONT * MPX; tc.space_character = 1.22; tc.space_line = 1.05; tc.align_x = "LEFT"; tc.align_y = "TOP"
    tc.materials.append(M_TEXT)
    to = bpy.data.objects.new(tc.name, tc); to.parent = root; col.objects.link(to); quiet(to)
    bpy.context.view_layer.update()
    bb = [Vector(c) for c in to.bound_box]
    tw, th = max(p.x for p in bb) - min(p.x for p in bb), max(p.y for p in bb) - min(p.y for p in bb)
    bw, bh = tw + 2 * PADX * MPX, th + 2 * PADY * MPX
    L = LEAD * MPX; x0, x1, y0, y1 = -bw / 2, bw / 2, L, L + bh
    to.location = (x0 + PADX * MPX - min(p.x for p in bb), y1 - PADY * MPX - max(p.y for p in bb), 0.03)
    rect(f"LabelFill_{k}", x0, y0, x1, y1, 0.0, M_FILL, root)
    t = BORDER * MPX                                        # 1px-style border, four thin strips
    rect(f"LabelEdgeB_{k}", x0, y0, x1, y0 + t, 0.02, M_EDGE, root); rect(f"LabelEdgeT_{k}", x0, y1 - t, x1, y1, 0.02, M_EDGE, root)
    rect(f"LabelEdgeL_{k}", x0, y0, x0 + t, y1, 0.02, M_EDGE, root); rect(f"LabelEdgeR_{k}", x1 - t, y0, x1, y1, 0.02, M_EDGE, root)
    rect(f"LabelLead_{k}", -t / 2, 0, t / 2, L, 0.01, M_EDGE, root)
    disc(f"LabelDot_{k}", DOT * MPX, 0.02, M_DOT, root)

# headroom above the frame so the top labels are not clipped (ortho: shift moves the view, labels stay put)
TOP = 180
sc.render.resolution_y = RY + TOP; cam.data.shift_y = (TOP / 2) / RX
sc.render.resolution_percentage = RES
sc.cycles.samples = SAMPLES
sc.render.filepath = r"D:/Surds_Website/tools/scene_out/connected_world.png"
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=r"D:/Surds_Website/tools/SURDS_connected_world.blend", compress=True)
print("SAVED")
bpy.ops.render.render(write_still=True)
print("RENDERED")
