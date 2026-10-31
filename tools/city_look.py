# Restyle city_pack_7.glb into the SURDS "intelligent city" look:
# near-black buildings, fine glowing white edge lines, warm lit windows,
# glowing orange network lines between key districts, bloom, black world.
#   blender -b --factory-startup --python tools/city_look.py -- raw|final [--res 50] [--anim]
import bpy, math, sys, random
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["final"]
MODE = args[0]
RES = int(args[args.index("--res") + 1]) if "--res" in args else 100
ANIM = "--anim" in args
OUT = r"D:/Surds_Website/tools/city_out"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"D:/Surds_Website/city_pack_7.glb")
sc = bpy.context.scene
meshes = [o for o in sc.objects if o.type == "MESH" and len(o.data.polygons)]
for o in sc.objects:
    if o.type == "MESH" and not len(o.data.polygons): o.hide_render = True

# ---------------------------------------------------------------- normalise to ~240 m across, centred, ground at z=0
def world_bounds(objs):
    mn = Vector((1e18,) * 3); mx = Vector((-1e18,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    return mn, mx
mn, mx = world_bounds(meshes)
root = bpy.data.objects.new("CityRoot", None); sc.collection.objects.link(root)
tops = [o for o in sc.objects if o.parent is None and o is not root]
for o in tops:
    o.parent = root
span = max(mx.x - mn.x, mx.y - mn.y)
s = 240.0 / span
root.scale = (s, s, s)
root.location = (-(mn.x + mx.x) / 2 * s, -(mn.y + mx.y) / 2 * s, -mn.z * s)
bpy.context.view_layer.update()
mn, mx = world_bounds(meshes)
print("NORMALISED", tuple(round(v, 1) for v in mn), tuple(round(v, 1) for v in mx))

# ---------------------------------------------------------------- camera: high isometric-style three-quarter view
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); sc.collection.objects.link(cam)
tgt = bpy.data.objects.new("CamTarget", None); sc.collection.objects.link(tgt)
c = cam.constraints.new("TRACK_TO"); c.target = tgt; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
cam.data.lens = 50; cam.data.clip_end = 5000
centre = (mn + mx) / 2
tgt.location = (centre.x, centre.y, 8)
cam.location = (centre.x - 170, centre.y - 210, 190)
sc.camera = cam

sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
sc.render.resolution_percentage = RES
sc.render.engine = "BLENDER_EEVEE"
sc.eevee.taa_render_samples = 32

if MODE == "probe":
    # top-down height map (1 px = 1 m) to find empty lots for the facility buildings
    dg = bpy.context.evaluated_depsgraph_get()
    W, H = 240, 164
    img = bpy.data.images.new("hm", W, H); px = [0.0] * (W * H * 4)
    for j in range(H):
        for i in range(W):
            hit, loc, *_ = sc.ray_cast(dg, Vector((i - 120 + .5, j - 82 + .5, 300)), Vector((0, 0, -1)))
            v = min(1.0, loc.z / 20.0) if hit else 0.0
            k = (j * W + i) * 4; px[k:k + 4] = (v, v if v > .03 else .25 * hit, v, 1)
    img.pixels = px; img.filepath_raw = OUT + "/heightmap.png"; img.file_format = "PNG"; img.save()
    for j in range(H - 2, 0, -4):     # ascii map, 4 m cells, north up: '.' empty ground, '#' building
        row = ""
        for i in range(0, W, 4):
            occ = any(px[((jj) * W + ii) * 4] > .03 for jj in range(j - 2, j + 2) for ii in range(i, min(W, i + 4)))
            row += "#" if occ else "."
        print("MAP %4d %s" % (j - 82, row))
    print("PROBE DONE"); sys.exit(0)

if MODE == "raw":
    w = bpy.data.worlds.new("W"); w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    sc.world = w
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")); sun.data.energy = 3
    sun.rotation_euler = (math.radians(50), 0, math.radians(30)); sc.collection.objects.link(sun)
    sc.render.filepath = OUT + "/raw.png"
    bpy.ops.render.render(write_still=True)
    print("RAW DONE")
    sys.exit(0)

# ================================================================ FINAL LOOK
ground = [o for o in meshes if o.dimensions.z * root.scale.z < 1.5 and o.dimensions.x * root.scale.x > 60]
gset = set(ground)

def find_tex(mat):
    if not mat or not mat.use_nodes: return None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image: return n.image
    return None

def build_mat(name, img, is_ground):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); N, Ls = nt.nodes, nt.links
    out = N.new("ShaderNodeOutputMaterial"); bs = N.new("ShaderNodeBsdfPrincipled")
    bs.inputs["Roughness"].default_value = 0.75 if not is_ground else 0.42   # ground: soft sheen picks up the glow
    Ls.new(bs.outputs[0], out.inputs[0])
    dark = N.new("ShaderNodeRGB"); dark.outputs[0].default_value = (0.012, 0.013, 0.016, 1)
    base = dark.outputs[0]
    if img:
        tx = N.new("ShaderNodeTexImage"); tx.image = img
        mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MIX"
        mix.inputs["Factor"].default_value = 0.3 if not is_ground else 0.16
        Ls.new(dark.outputs[0], mix.inputs[6]); Ls.new(tx.outputs[0], mix.inputs[7])
        base = mix.outputs[2]
        if is_ground:
            # roads read as faint grey lines on the dark ground
            lum = N.new("ShaderNodeRGBToBW"); Ls.new(tx.outputs[0], lum.inputs[0])
            ramp = N.new("ShaderNodeValToRGB"); Ls.new(lum.outputs[0], ramp.inputs[0])
            ramp.color_ramp.elements[0].position = 0.45; ramp.color_ramp.elements[1].position = 0.75
            k = N.new("ShaderNodeMath"); k.operation = "MULTIPLY"; k.inputs[1].default_value = 0.12
            Ls.new(ramp.outputs[0], k.inputs[0]); Ls.new(k.outputs[0], bs.inputs["Emission Strength"])
            bs.inputs["Emission Color"].default_value = (0.55, 0.6, 0.7, 1)
    if is_ground:
        Ls.new(base, bs.inputs["Base Color"]); return m

    # ---- procedural facade: a floor-by-floor window grid on every wall, ~1 in 8 windows lit warm
    geo = N.new("ShaderNodeNewGeometry")
    pos = N.new("ShaderNodeSeparateXYZ"); Ls.new(geo.outputs["Position"], pos.inputs[0])
    u = N.new("ShaderNodeMath"); u.operation = "ADD"; Ls.new(pos.outputs["X"], u.inputs[0]); Ls.new(pos.outputs["Y"], u.inputs[1])
    uv = N.new("ShaderNodeCombineXYZ"); Ls.new(u.outputs[0], uv.inputs["X"]); Ls.new(pos.outputs["Z"], uv.inputs["Y"])
    br = N.new("ShaderNodeTexBrick")
    br.inputs["Color1"].default_value = (0, 0, 0, 1); br.inputs["Color2"].default_value = (1, 1, 1, 1)
    br.inputs["Mortar"].default_value = (0, 0, 0, 1)
    br.inputs["Scale"].default_value = 1.0; br.inputs["Mortar Size"].default_value = 0.28
    br.inputs["Brick Width"].default_value = 1.7; br.inputs["Row Height"].default_value = 1.15
    br.offset = 0.0; br.squash = 1.0
    Ls.new(uv.outputs[0], br.inputs["Vector"])
    glass = N.new("ShaderNodeMath"); glass.operation = "SUBTRACT"; glass.inputs[0].default_value = 1.0
    Ls.new(br.outputs["Fac"], glass.inputs[1])                      # 1 on a window pane, 0 on the frame
    rnd_ = N.new("ShaderNodeRGBToBW"); Ls.new(br.outputs["Color"], rnd_.inputs[0])
    lit = N.new("ShaderNodeValToRGB"); lit.color_ramp.elements[0].position = 0.86; lit.color_ramp.elements[1].position = 0.87
    Ls.new(rnd_.outputs[0], lit.inputs[0])
    # walls only (fade on roofs and plazas)
    nz = N.new("ShaderNodeSeparateXYZ"); Ls.new(geo.outputs["Normal"], nz.inputs[0])
    ab = N.new("ShaderNodeMath"); ab.operation = "ABSOLUTE"; Ls.new(nz.outputs["Z"], ab.inputs[0])
    wall = N.new("ShaderNodeMath"); wall.operation = "SUBTRACT"; wall.inputs[0].default_value = 1.0; wall.use_clamp = True
    Ls.new(ab.outputs[0], wall.inputs[1])
    pw = N.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = 6.0; Ls.new(wall.outputs[0], pw.inputs[0])
    # skip the first floor (street level) so lights sit up the towers
    up = N.new("ShaderNodeMath"); up.operation = "GREATER_THAN"; up.inputs[1].default_value = 4.0; Ls.new(pos.outputs["Z"], up.inputs[0])
    m1 = N.new("ShaderNodeMath"); m1.operation = "MULTIPLY"; Ls.new(glass.outputs[0], m1.inputs[0]); Ls.new(pw.outputs[0], m1.inputs[1])
    m2 = N.new("ShaderNodeMath"); m2.operation = "MULTIPLY"; Ls.new(m1.outputs[0], m2.inputs[0]); Ls.new(up.outputs[0], m2.inputs[1])
    # brightness tiers per window: dark / blinds-drawn glow / lit / bright
    lit.color_ramp.interpolation = "CONSTANT"
    el = lit.color_ramp.elements
    el[0].position = 0.0; el[0].color = (0, 0, 0, 1); el[1].position = 0.70; el[1].color = (0.07, 0.07, 0.07, 1)
    for p_, v_ in ((0.84, 0.75), (0.92, 1.0), (0.97, 1.35)): e_ = el.new(p_); e_.color = (v_, v_, v_, 1)
    m3 = N.new("ShaderNodeMath"); m3.operation = "MULTIPLY"; Ls.new(m2.outputs[0], m3.inputs[0]); Ls.new(lit.outputs[0], m3.inputs[1])
    st = N.new("ShaderNodeMath"); st.operation = "MULTIPLY"; st.inputs[1].default_value = 2.6; Ls.new(m3.outputs[0], st.inputs[0])
    Ls.new(st.outputs[0], bs.inputs["Emission Strength"])
    # hue per window: mostly warm tungsten, some cool office LED
    hsh = N.new("ShaderNodeMath"); hsh.operation = "MULTIPLY"; hsh.inputs[1].default_value = 37.0; Ls.new(rnd_.outputs[0], hsh.inputs[0])
    frc = N.new("ShaderNodeMath"); frc.operation = "FRACT"; Ls.new(hsh.outputs[0], frc.inputs[0])
    hue = N.new("ShaderNodeValToRGB"); hue.color_ramp.interpolation = "CONSTANT"
    hue.color_ramp.elements[0].color = (1.0, 0.62, 0.32, 1); hue.color_ramp.elements[1].position = 0.74
    hue.color_ramp.elements[1].color = (0.78, 0.86, 1.0, 1)
    Ls.new(frc.outputs[0], hue.inputs[0])
    # emission = window glow + a faint cool floor/mullion grid on the walls (the "wireframe" read)
    sc1 = N.new("ShaderNodeVectorMath"); sc1.operation = "SCALE"
    Ls.new(hue.outputs[0], sc1.inputs[0]); Ls.new(st.outputs[0], sc1.inputs["Scale"])
    mort = N.new("ShaderNodeMath"); mort.operation = "MULTIPLY"; Ls.new(br.outputs["Fac"], mort.inputs[0]); Ls.new(pw.outputs[0], mort.inputs[1])
    mort2 = N.new("ShaderNodeMath"); mort2.operation = "MULTIPLY"; mort2.inputs[1].default_value = 0.055; Ls.new(mort.outputs[0], mort2.inputs[0])
    sc2 = N.new("ShaderNodeVectorMath"); sc2.operation = "SCALE"; sc2.inputs[0].default_value = (0.7, 0.8, 1.0)
    Ls.new(mort2.outputs[0], sc2.inputs["Scale"])
    add = N.new("ShaderNodeVectorMath"); add.operation = "ADD"
    Ls.new(sc1.outputs[0], add.inputs[0]); Ls.new(sc2.outputs[0], add.inputs[1])
    for l_ in list(bs.inputs["Emission Strength"].links): Ls.remove(l_)
    bs.inputs["Emission Strength"].default_value = 1.0
    Ls.new(add.outputs[0], bs.inputs["Emission Color"])
    # unlit panes read as faintly lighter glass, so facades show their grid in the dark
    pane = N.new("ShaderNodeMix"); pane.data_type = "RGBA"; pane.blend_type = "ADD"
    k2 = N.new("ShaderNodeMath"); k2.operation = "MULTIPLY"; k2.inputs[1].default_value = 0.035; Ls.new(m1.outputs[0], k2.inputs[0])
    Ls.new(k2.outputs[0], pane.inputs["Factor"]); Ls.new(base, pane.inputs[6]); pane.inputs[7].default_value = (0.55, 0.62, 0.75, 1)
    Ls.new(pane.outputs[2], bs.inputs["Base Color"])
    return m

cache = {}
for o in meshes:
    is_g = o in gset
    for slot in o.material_slots:
        key = (slot.material.name if slot.material else "none", is_g)
        if key not in cache:
            cache[key] = build_mat("C_" + key[0] + ("_g" if is_g else ""), find_tex(slot.material), is_g)
        slot.material = cache[key]

# ---------------------------------------------------------------- fewer buildings: keep a compact downtown core only
import bmesh
CORE, RX, RY = (-12.0, 8.0), 44.0, 56.0
kept = 0
for o in meshes:
    if o in gset: continue
    mw = o.matrix_world
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    seen = set(); doomed = []
    for f0 in bm.faces:                       # walk each loose building part
        if f0.index in seen: continue
        isl, stack = [], [f0]; seen.add(f0.index)
        while stack:
            f = stack.pop(); isl.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); stack.append(g)
        c = sum((mw @ f.calc_center_median() for f in isl), Vector()) / len(isl)
        if ((c.x - CORE[0]) / RX) ** 2 + ((c.y - CORE[1]) / RY) ** 2 > 1: doomed += isl
        else:
            kept += 1
            # big connected plaza/terrain pieces: trim whatever spills past the core
            for f in isl:
                p = mw @ f.calc_center_median()
                if ((p.x - CORE[0]) / (RX * 1.08)) ** 2 + ((p.y - CORE[1]) / (RY * 1.08)) ** 2 > 1: doomed.append(f)
    bmesh.ops.delete(bm, geom=doomed, context="FACES"); bm.to_mesh(o.data); bm.free()
for o in ground: o.hide_render = True; o.hide_viewport = True
meshes = [o for o in meshes if o in gset or len(o.data.polygons)]
print("KEPT parts", kept)

# dark ground with a faint survey grid that fades out radially, so the city floats on black
gm = bpy.data.materials.new("GridGround"); gm.use_nodes = True
N, Ls = gm.node_tree.nodes, gm.node_tree.links
gb = next(n for n in N if n.type == "BSDF_PRINCIPLED")
gb.inputs["Roughness"].default_value = 0.6
if "Specular IOR Level" in gb.inputs: gb.inputs["Specular IOR Level"].default_value = 0.12
geo = N.new("ShaderNodeNewGeometry"); sp = N.new("ShaderNodeSeparateXYZ"); Ls.new(geo.outputs["Position"], sp.inputs[0])
def mnode(op, a=None, b=None, va=None, vb=None):
    n = N.new("ShaderNodeMath"); n.operation = op
    if a is not None: Ls.new(a, n.inputs[0])
    if va is not None: n.inputs[0].default_value = va
    if b is not None: Ls.new(b, n.inputs[1])
    if vb is not None: n.inputs[1].default_value = vb
    return n.outputs[0]
def grid_line(coord, step, width):
    f = mnode("FRACT", mnode("DIVIDE", coord, vb=step))
    return mnode("GREATER_THAN", mnode("ABSOLUTE", mnode("SUBTRACT", f, vb=0.5)), vb=0.5 - width)
gx = grid_line(sp.outputs["X"], 10.0, 0.012); gy = grid_line(sp.outputs["Y"], 10.0, 0.012)
line = mnode("MAXIMUM", gx, gy)
dx = mnode("SUBTRACT", sp.outputs["X"], vb=CORE[0] + 20); dy = mnode("SUBTRACT", sp.outputs["Y"], vb=CORE[1] - 4)
dist = mnode("SQRT", mnode("ADD", mnode("MULTIPLY", dx, dx), mnode("MULTIPLY", dy, dy)))
lin = mnode("SUBTRACT", None, mnode("DIVIDE", dist, vb=165.0), va=1.0); lin.node.use_clamp = True
fallc = mnode("POWER", lin, vb=1.6)
Ls.new(mnode("MULTIPLY", mnode("MULTIPLY", line, fallc), vb=0.22), gb.inputs["Emission Strength"])
gb.inputs["Emission Color"].default_value = (0.55, 0.62, 0.78, 1)
basev = N.new("ShaderNodeCombineColor"); k = mnode("MULTIPLY", fallc, vb=0.018)
for ch in ("Red", "Green", "Blue"): Ls.new(k, basev.inputs[ch])
Ls.new(basev.outputs[0], gb.inputs["Base Color"])
me = bpy.data.meshes.new("GridGround"); bmg = bmesh.new()
bmesh.ops.create_grid(bmg, x_segments=1, y_segments=1, size=400); bmg.to_mesh(me); bmg.free()
gplane = bpy.data.objects.new("GridGround", me); gplane.location.z = -0.02; me.materials.append(gm)
sc.collection.objects.link(gplane)
ground = list(ground) + [gplane]; gset = set(ground)

# ---------------------------------------------------------------- world + light
w = bpy.data.worlds.new("Night"); w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.004, 0.005, 0.008, 1)
sc.world = w
moon = bpy.data.objects.new("Moon", bpy.data.lights.new("Moon", "SUN")); sc.collection.objects.link(moon)
moon.data.energy = 0.9; moon.data.color = (0.75, 0.82, 1.0); moon.rotation_euler = (math.radians(55), 0, math.radians(-35))
rim = bpy.data.objects.new("Rim", bpy.data.lights.new("Rim", "SUN")); sc.collection.objects.link(rim)
rim.data.energy = 0.25; rim.data.color = (1.0, 0.85, 0.7); rim.rotation_euler = (math.radians(70), 0, math.radians(150))

# ---------------------------------------------------------------- landmark towers, found by ray-casting the skyline
dg = bpy.context.evaluated_depsgraph_get()
pts = []
for x in range(-114, 115, 4):
    for y in range(-76, 77, 4):
        hit, loc, nrm, idx, ob, mat = sc.ray_cast(dg, Vector((x, y, 200)), Vector((0, 0, -1)))
        if hit and ob not in gset: pts.append((loc.z, x, y))
pts.sort(reverse=True)
hubs = []
for z, x, y in pts:
    if z < 6: break
    if all((x - hx) ** 2 + (y - hy) ** 2 > 24 ** 2 for _, hx, hy in hubs): hubs.append((z, x, y))
    if len(hubs) == 5: break
cx = sum(h[1] for h in hubs) / len(hubs); cy = sum(h[2] for h in hubs) / len(hubs)
print("HUBS", [(round(z), x, y) for z, x, y in hubs], "CENTRE", round(cx), round(cy))

# ---------------------------------------------------------------- SURDS facilities, built procedurally on empty lots
import bmesh
from mathutils import Matrix
def flat_mat(name, base, rough=0.6, emit=None, strength=0.0, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*base, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit: b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = strength
    return m
FM = {
    "shell": flat_mat("F_shell", (0.016, 0.017, 0.021)),
    "metal": flat_mat("F_metal", (0.03, 0.032, 0.038), 0.35, metal=0.6),
    "pad":   flat_mat("F_pad", (0.01, 0.011, 0.013), 0.9),
    "led":   flat_mat("F_led", (0.6, 0.8, 1.0), emit=(0.62, 0.8, 1.0), strength=3.0),
    "fan":   flat_mat("F_fan", (0.02, 0.02, 0.025), emit=(0.62, 0.8, 1.0), strength=0.35),
    "lab":   flat_mat("F_lab", (0.8, 0.9, 1.0), emit=(0.85, 0.93, 1.0), strength=1.1),
    "warm":  flat_mat("F_warm", (1, 0.55, 0.25), emit=(1.0, 0.5, 0.2), strength=0.45),
    "solar": flat_mat("F_solar", (0.012, 0.018, 0.035), 0.2, metal=0.4),
    "glass": build_mat("F_glass", None, False),   # same window grid as the city towers
    "net":   None,                                 # filled once the network material exists
}
fcoll = bpy.data.collections.new("Facilities"); sc.collection.children.link(fcoll)
KIT = {}
def bm_for(mat):
    if mat not in KIT: KIT[mat] = bmesh.new()
    return KIT[mat]
def M(x, y, z, sx=1, sy=1, sz=1, rz=0.0):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Diagonal((sx, sy, sz, 1))
def box(mat, x, y, z0, sx, sy, sz, rz=0.0):
    bmesh.ops.create_cube(bm_for(mat), size=1.0, matrix=M(x, y, z0 + sz / 2, sx, sy, sz, rz))
def cyl(mat, x, y, z0, r, h, seg=40, r2=None, axis="Z"):
    rot = {"Z": Matrix(), "X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(math.pi / 2, 4, "X")}[axis]
    zc = z0 + (h / 2 if axis == "Z" else 0)
    bmesh.ops.create_cone(bm_for(mat), cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2,
                          depth=h, matrix=Matrix.Translation((x, y, zc)) @ rot)
def lathe(mat, x, y, prof, seg=96):
    # hollow surface of revolution from (radius, z) pairs, e.g. a hyperboloid cooling tower
    bm = bm_for(mat); rings = []
    for r, z in prof:
        rings.append([bm.verts.new((x + r * math.cos(2 * math.pi * k / seg), y + r * math.sin(2 * math.pi * k / seg), z)) for k in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for k in range(seg): bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
def flush(tag):
    for mat, bm in KIT.items():
        me = bpy.data.meshes.new(f"{tag}_{mat}"); bm.to_mesh(me); bm.free()
        me.shade_smooth(); me.set_sharp_from_angle(angle=math.radians(40))   # round tanks smooth, boxes crisp
        o = bpy.data.objects.new(me.name, me); o.data.materials.append(FM[mat]); fcoll.objects.link(o)
    KIT.clear()

def data_hall(x, y, L, D, H, rz=0.0, chill_rows=2):
    """Hyperscale data hall: dark shell, vertical facade fins, a cool LED band, rooftop chillers with lit fans."""
    c, s = math.cos(rz), math.sin(rz)
    P = lambda u, v: (x + u * c - v * s, y + u * s + v * c)
    box("pad", x, y, 0, L + 4, D + 4, 0.12, rz)
    box("shell", x, y, 0.12, L, D, H, rz)
    box("shell", x, y, 0.12 + H, L - 0.6, D - 0.6, 0.5, rz)                    # parapet step
    n = int(L / 1.4)
    for i in range(n + 1):                                                       # facade fins, both long sides
        u = -L / 2 + i * L / n
        for v in (-D / 2 - 0.15, D / 2 + 0.15):
            px, py = P(u, v); box("metal", px, py, 0.12, 0.18, 0.3, H - 0.4, rz)
    for v in (-D / 2 - 0.05, D / 2 + 0.05):                                      # LED band under the roofline
        px, py = P(0, v); box("led", px, py, H - 0.7, L - 1.0, 0.12, 0.22, rz)
    for u in (-L / 2 - 0.05, L / 2 + 0.05):
        px, py = P(u, 0); box("led", px, py, H - 0.7, 0.12, D - 1.0, 0.22, rz)
    # loading docks on one long side
    for i in range(3):
        px, py = P(-L / 2 + 4 + i * 3.2, -D / 2 - 0.2); box("metal", px, py, 0.12, 2.4, 0.4, 2.6, rz)
    # rooftop chiller rows: each unit carries two lit fan discs
    cols = int((L - 4) / 2.6)
    for r in range(chill_rows):
        v = (-D / 4 + r * D / 2) if chill_rows == 2 else 0
        for i in range(cols):
            u = -L / 2 + 2.4 + i * 2.6; px, py = P(u, v); zt = 0.62 + H
            box("metal", px, py, zt, 2.2, 1.6, 0.9, rz)
            for f in (-0.5, 0.5):
                fx, fy = P(u + f, v); cyl("fan", fx, fy, zt + 0.9, 0.42, 0.12, 32)
                cyl("metal", fx, fy, zt + 1.02, 0.44, 0.03, 32, r2=0.44)               # grille rim
                for a in (0, math.pi / 2): box("metal", fx, fy, zt + 1.04, 0.84, 0.04, 0.03, rz + a)
                cyl("metal", fx, fy, zt + 1.04, 0.08, 0.06, 12)                        # hub
    # roof guard-rail: posts every ~2 m and a top rail on all four edges
    zr = H + 0.62
    for (u0, v0, u1, v1) in ((-L/2+.4, -D/2+.4, L/2-.4, -D/2+.4), (-L/2+.4, D/2-.4, L/2-.4, D/2-.4),
                             (-L/2+.4, -D/2+.4, -L/2+.4, D/2-.4), (L/2-.4, -D/2+.4, L/2-.4, D/2-.4)):
        ln = math.hypot(u1 - u0, v1 - v0); k = max(1, int(ln / 2))
        for i in range(k + 1):
            px, py = P(u0 + (u1 - u0) * i / k, v0 + (v1 - v0) * i / k); box("metal", px, py, zr, 0.06, 0.06, 1.0, rz)
        mx_, my_ = P((u0 + u1) / 2, (v0 + v1) / 2)
        horiz = abs(v1 - v0) < 1e-6
        box("metal", mx_, my_, zr + 1.0, ln if horiz else 0.07, 0.07 if horiz else ln, 0.06, rz)
        box("metal", mx_, my_, zr + 0.5, ln if horiz else 0.05, 0.05 if horiz else ln, 0.04, rz)
    # duct spine along the roof
    a, b = P(-L / 2 + 1.5, D / 2 - 1.2), P(L / 2 - 1.5, D / 2 - 1.2)
    cx_, cy_ = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    box("metal", cx_, cy_, H + 0.62, L - 3, 0.7, 0.7, rz)
    return P(L / 2 - 3, 0), H + 1.6

def gensets(x0, y, n, step=2.6):
    for i in range(n):
        x = x0 + i * step
        box("shell", x, y, 0.12, 2.0, 1.2, 1.4); box("metal", x, y + 0.65, 0.3, 1.6, 0.1, 0.6)
        cyl("metal", x - 0.6, y, 1.52, 0.14, 1.4, 10)
        box("warm", x + 0.6, y - 0.62, 1.0, 0.25, 0.04, 0.14)                   # status lamp

def substation(x, y, nx, ny):
    box("pad", x, y, 0, nx * 3.4 + 2, ny * 3.4 + 2, 0.1)
    for i in range(nx):
        for j in range(ny):
            px, py = x + (i - (nx - 1) / 2) * 3.4, y + (j - (ny - 1) / 2) * 3.4
            box("metal", px, py, 0.1, 1.8, 1.3, 1.5)
            for k in (-0.6, 0, 0.6): cyl("metal", px + k, py, 1.6, 0.09, 0.9, 8)  # bushings
    for i in range(nx + 1):                                                       # gantry frames
        px = x + (i - nx / 2) * 3.4
        for py in (y - ny * 1.7, y + ny * 1.7): box("metal", px, py, 0.1, 0.18, 0.18, 4.2)
        box("metal", px, y, 4.2, 0.16, ny * 3.4, 0.16)

def tanks_h(x, y, n, axis="Y", r=0.9, l=5.0):
    for i in range(n):
        px, py = (x + i * 2.3, y) if axis == "Y" else (x, y + i * 2.3)
        cyl("metal", px, py, r + 0.35, r, l, 18, axis=axis)
        for e in (-l / 3, l / 3):
            sx, sy = (px, py + e) if axis == "Y" else (px + e, py)
            box("shell", sx, sy, 0.0, 0.4 if axis == "Y" else 0.4, 1.4, 0.6)

hubs_fac = []   # (label, x, y, roof_z)

# 1) hyperscale data-centre campus, west of downtown (hero foreground)
p, z = data_hall(-77, -2, 38, 11, 6.0); hubs_fac.append(("Data Center", -77, -2, z))
data_hall(-94, 15.5, 42, 10, 6.0)
box("glass", -67.5, 15.5, 0.12, 5.5, 9.5, 10.5); box("shell", -67.5, 15.5, 10.62, 5.9, 9.9, 0.4)  # glazed ops block
gensets(-116, 7.6, 7)
tanks_h(-117.5, -6.5, 2, axis="Y", r=0.8, l=6.0)
for i in range(6):                                                                # pipe rack between halls
    box("metal", -94 + i * 4.6, 7.2, 0.12, 0.18, 0.18, 3.4)
cyl("metal", -82.5, 6.9, 3.6, 0.28, 24, 14, axis="X"); cyl("metal", -82.5, 7.5, 3.6, 0.28, 24, 14, axis="X")
flush("DataCenterA")

# 2) edge data centre + substation, south-east
data_hall(100, -71, 24, 12, 5.5, chill_rows=2); hubs_fac.append(("Edge Data Center", 100, -71, 7.1))
gensets(89.5, -61.5, 8, 2.9)
substation(93, -79.5, 4, 1)
flush("DataCenterB")

# 3) clean-room / pharma plant, east
box("pad", 84, -1.5, 0, 46, 14, 0.12)
box("shell", 80, -1.5, 0.12, 38, 11, 6.5)
box("shell", 72, -1.5, 6.62, 18, 8, 1.6)                                          # mechanical penthouse
for v in (-5.56, 5.56): box("lab", 80, -1.5 + v, 2.4, 36, 0.06, 1.1)              # continuous clean-room glazing
for v in (-5.56, 5.56): box("lab", 80, -1.5 + v, 4.6, 36, 0.06, 0.5)
for i in range(4):                                                                # rooftop air handlers + ducts
    ux = 84 + i * 4.2; box("metal", ux, -3.0, 6.62, 3.2, 2.2, 1.6); cyl("fan", ux, -0.6, 6.62, 0.6, 1.9, 16)
cyl("metal", 90.3, 1.6, 7.6, 0.4, 13, 14, axis="X")
cyl("metal", 66, 2, 0.12, 0.55, 15, 16)                                           # exhaust stack
for i in range(3):                                                                # process tank farm
    for j in range(2):
        tx, ty = 103.5 + i * 3.2, -5 + j * 6.0
        cyl("metal", tx, ty, 0.12, 1.25, 7.5, 22); cyl("metal", tx, ty, 7.62, 1.25, 0.9, 22, r2=0.3)
box("metal", 106.7, -2, 7.0, 7.5, 0.25, 0.25)
flush("CleanRoom"); hubs_fac.append(("Clean Rooms & Pharma", 80, -1.5, 8.3))

# 4) energy & utilities: twin cooling towers, a substation and a solar field
for tx, ty in ((79, -33), (97, -30)):
    hyp = lambda z: 4.5 + 2.5 * ((z - 13.5) / 13.5) ** 2 if z < 13.5 else 4.5 + 0.5 * ((z - 13.5) / 5) ** 2
    prof = []
    for z in [i * 0.375 for i in range(51)]:                                      # hyperboloid shell with thin
        prof.append((hyp(z), z))                                                  # stiffening ribs every 3 m
        if 0 < z < 18 and abs(z / 1.5 - round(z / 1.5)) < 1e-6:
            prof += [(hyp(z) + 0.14, z), (hyp(z) + 0.14, z + 0.12), (hyp(z + 0.12), z + 0.12)]
    lathe("shell", tx, ty, prof)
    cyl("warm", tx, ty, 15.0, 4.4, 0.05, 36)                                     # warm glow inside the throat
    for k in range(18):                                                          # raking legs at the base
        a = 2 * math.pi * k / 18; box("metal", tx + 6.8 * math.cos(a), ty + 6.8 * math.sin(a), 0, 0.3, 0.3, 1.0, a)
substation(109, -32, 1, 4)
for r in range(3):                                                                # solar rows
    for i in range(8):
        px, py = 68 + i * 5.0, -43 - r * 2.9
        box("metal", px, py, 0, 0.15, 0.15, 0.8); box("solar", px, py, 0.8, 4.6, 2.2, 0.08)
flush("Energy"); hubs_fac.append(("Energy & Utilities", 109, -32, 4.4))

# 5) hospital, north-east: podium + ward tower + rooftop helipad
box("pad", 102, 67, 0, 24, 20, 0.12)
box("glass", 102, 66, 0.12, 22, 17, 5.5)
box("glass", 104, 68, 5.62, 14, 9.5, 16.5)
box("shell", 104, 68, 22.12, 14.4, 9.9, 0.6)
cyl("shell", 104, 68, 22.72, 4.0, 0.25, 32); cyl("led", 104, 68, 22.97, 3.6, 0.03, 32); cyl("shell", 104, 68, 22.98, 3.4, 0.04, 32)
box("led", 104, 68, 23.02, 0.5, 2.6, 0.03); box("led", 104, 68, 23.02, 2.6, 0.5, 0.03)   # glowing cross on the pad
box("shell", 92.5, 60, 0.12, 5, 6, 3.2); box("lab", 92.5, 56.97, 2.2, 4.2, 0.05, 0.6)  # A&E canopy
flush("Hospital"); hubs_fac.append(("Healthcare & Labs", 104, 68, 23.0))

# street lights around the facility sites: pole, arm, warm head
def street_light(x, y, rz=0.0):
    cyl("metal", x, y, 0, 0.07, 4.2, 12)
    ax, ay = x + 0.6 * math.cos(rz), y + 0.6 * math.sin(rz)
    box("metal", (x + ax) / 2, (y + ay) / 2, 4.15, 1.2, 0.06, 0.06, rz)
    box("warm", ax, ay, 4.0, 0.45, 0.2, 0.08, rz)
for i in range(9): street_light(-117 + i * 7.5, -9.5, math.pi / 2)
for i in range(7): street_light(62 + i * 7.5, 6.8, -math.pi / 2)
for i in range(5): street_light(87 + i * 6.5, -56.5, -math.pi / 2)
for i in range(4): street_light(91 + i * 7, 55, math.pi / 2)
flush("StreetLights")

# ---------------------------------------------------------------- denser city: parapets, rooftop plant, masts
FM["red"] = flat_mat("F_red", (1, 0.1, 0.05), emit=(1.0, 0.08, 0.04), strength=6.0)
rng = random.Random(7)
def in_poly(px, py, poly):
    inside = False; n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > py) != (y2 > py) and px < x1 + (py - y1) * (x2 - x1) / (y2 - y1): inside = not inside
    return inside
roofs = []
for o in meshes:
    if o in gset: continue
    mw = o.matrix_world; sw = sum(mw.to_scale()) / 3
    bm = bmesh.new(); bm.from_mesh(o.data)
    # glTF arrives triangulated: merge coplanar triangles so each flat roof is one clean face
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1.0), verts=bm.verts[:], edges=bm.edges[:], delimit={"MATERIAL"})
    nrm_m = mw.to_3x3().inverted().transposed()
    up_faces = []
    for f in bm.faces:
        n = (nrm_m @ f.normal).normalized()
        wa = f.calc_area() * sw * sw
        if n.z > 0.97 and wa > 12:
            zc = (mw @ f.calc_center_median()).z
            if zc > 2.5: up_faces.append((f, wa))
    for f, wa in up_faces:
        # parapet: inset the roof edge and sink the roof slab 0.55 m behind it
        bmesh.ops.inset_individual(bm, faces=[f], thickness=0.32 / sw, depth=-0.55 / sw, use_even_offset=True)
        poly = [(mw @ v.co) for v in f.verts]
        roofs.append(([(p.x, p.y) for p in poly], sum(p.z for p in poly) / len(poly), wa))
    bm.to_mesh(o.data); bm.free()

def fits(poly, x, y, hx, hy, rz):
    c, s = math.cos(rz), math.sin(rz)
    return all(in_poly(x + u * c - v * s, y + u * s + v * c, poly) for u in (-hx, hx) for v in (-hy, hy))
tall = sorted(roofs, key=lambda r: -r[1])[:14]
for poly, z, wa in roofs:
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    # align equipment with the roof's longest edge
    e = max(range(len(poly)), key=lambda i: math.dist(poly[i], poly[(i + 1) % len(poly)]))
    (x1, y1), (x2, y2) = poly[e], poly[(e + 1) % len(poly)]; rz = math.atan2(y2 - y1, x2 - x1)
    placed = []
    def place(hx, hy, tries=40):
        for _ in range(tries):
            x, y = rng.uniform(min(xs), max(xs)), rng.uniform(min(ys), max(ys))
            if fits(poly, x, y, hx + 0.5, hy + 0.5, rz) and all(math.dist((x, y), q) > r + max(hx, hy) + 0.6 for q, r in placed):
                placed.append(((x, y), max(hx, hy))); return x, y
        return None
    if wa > 90 and (p := place(1.6, 1.3)):                                        # stair / lift overrun
        box("shell", p[0], p[1], z, 3.2, 2.6, 2.3, rz); box("metal", p[0], p[1], z + 2.3, 3.4, 2.8, 0.15, rz)
    for _ in range(min(9, int(wa / 28))):                                         # packaged AC units
        if p := place(0.9, 0.6):
            box("metal", p[0], p[1], z, 1.8, 1.2, 0.75, rz)
            cyl("fan", p[0], p[1], z + 0.75, 0.38, 0.06, 24)
    if wa > 60 and rng.random() < 0.45 and (p := place(0.8, 0.8)):              # water tank on legs
        for dx, dy in ((-.5, -.5), (.5, -.5), (-.5, .5), (.5, .5)): box("metal", p[0] + dx, p[1] + dy, z, .1, .1, 1.2)
        cyl("shell", p[0], p[1], z + 1.2, 0.8, 1.6, 40); cyl("shell", p[0], p[1], z + 2.8, 0.82, 0.5, 40, r2=0.1)
    if (poly, z, wa) in tall and (p := place(0.3, 0.3)):                          # mast + red aviation light
        h = 3 + wa ** 0.5 * 0.35
        cyl("metal", p[0], p[1], z, 0.12, h, 12, r2=0.05); cyl("red", p[0], p[1], z + h, 0.16, 0.25, 16)
        for k in range(1, 4): box("metal", p[0], p[1], z + h * k / 4, 0.7, 0.05, 0.05, rz)
flush("Rooftops")
print("ROOFS", len(roofs))

# ---------------------------------------------------------------- glowing network: L-shaped street runs centre -> each tower
net = bpy.data.materials.new("Net"); net.use_nodes = True
nb = next(n for n in net.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
nb.inputs["Base Color"].default_value = (1, 0.45, 0.12, 1); nb.inputs["Emission Color"].default_value = (1, 0.42, 0.1, 1)
nb.inputs["Emission Strength"].default_value = 14.0
def path_curve(name, pts3, bevel=0.22):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = bevel; cu.bevel_resolution = 2
    sp = cu.splines.new("POLY"); sp.points.add(len(pts3) - 1)
    for i, p in enumerate(pts3): sp.points[i].co = (p[0], p[1], p[2], 1)
    o = bpy.data.objects.new(name, cu); o.data.materials.append(net); sc.collection.objects.link(o); return o
def node(name, loc, r):
    me = bpy.data.meshes.new(name); o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    import bmesh; bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=r); bm.to_mesh(me); bm.free()
    o.location = loc; o.data.materials.append(net); return o
Z = 0.45
node("Centre", (cx, cy, Z), 1.6)
for i, (z, x, y) in enumerate(hubs):
    mid = (x, cy, Z) if i % 2 else (cx, y, Z)
    path_curve(f"Net{i}", [(cx, cy, Z), mid, (x, y, Z)]); node(f"Hub{i}", (x, y, Z), 0.9)
    path_curve(f"Beam{i}", [(x, y, Z), (x, y, z * 0.92)], 0.07)   # thin beam up the connected tower
for i in range(len(hubs) - 1):
    a, b = hubs[i], hubs[i + 1]
    path_curve(f"Ring{i}", [(a[1], a[2], Z), (b[1], a[2], Z), (b[1], b[2], Z)], 0.12)
# facilities: trunk line from the centre, a riser up the wall, and a SURDS node glowing on the roof
for i, (label, x, y, rz) in enumerate(hubs_fac):
    path_curve(f"FacNet{i}", [(cx, cy, Z), (cx, y, Z), (x, y, Z)], 0.22); node(f"FacHub{i}", (x, y, Z), 0.9)
    path_curve(f"FacBeam{i}", [(x, y, Z), (x, y, rz)], 0.07)
    nd = node(f"FacNode{i}", (x, y, rz + 0.35), 0.55)
    print("FACILITY", label, round(x), round(y))

# data pulses riding the street runs, and halo rings around every node
FM["net"] = net
FM["netdim"] = flat_mat("F_netdim", (1, 0.45, 0.12), emit=(1, 0.42, 0.1), strength=2.5)
FM["pulse"] = flat_mat("F_pulse", (1, 0.85, 0.6), emit=(1, 0.8, 0.55), strength=40.0)
def annulus(mat, x, y, z, r0, r1, seg=64):
    bm = bm_for(mat)
    vi = [bm.verts.new((x + r0 * math.cos(2 * math.pi * k / seg), y + r0 * math.sin(2 * math.pi * k / seg), z)) for k in range(seg)]
    vo = [bm.verts.new((x + r1 * math.cos(2 * math.pi * k / seg), y + r1 * math.sin(2 * math.pi * k / seg), z)) for k in range(seg)]
    for k in range(seg): bm.faces.new((vi[k], vo[k], vo[(k + 1) % seg], vi[(k + 1) % seg]))
runs = [[(cx, cy, Z), ((x, cy, Z) if i % 2 else (cx, y, Z)), (x, y, Z)] for i, (z, x, y) in enumerate(hubs)]
runs += [[(cx, cy, Z), (cx, y, Z), (x, y, Z)] for _, x, y, _ in hubs_fac]
for pts3 in runs:
    segs = [(Vector(a), Vector(b)) for a, b in zip(pts3, pts3[1:])]
    total = sum((b - a).length for a, b in segs)
    for k in range(max(1, int(total / 26))):
        d = (k + rng.uniform(0.2, 0.8)) * total / max(1, int(total / 26))
        for a, b in segs:
            if d <= (b - a).length:
                p = a + (b - a).normalized() * d
                for t in range(6):                                   # bright head + fading tail
                    q = p - (b - a).normalized() * t * 0.45
                    cyl("pulse" if t < 2 else "net", q.x, q.y, Z - 0.05, 0.3 - t * 0.03, 0.42, 16)
                break
            d -= (b - a).length
for _, x, y in [(0, cx, cy)] + [(0, h[1], h[2]) for h in hubs] + [(0, f[1], f[2]) for f in hubs_fac]:
    annulus("netdim", x, y, 0.2, 2.2, 2.45); annulus("netdim", x, y, 0.2, 3.6, 3.75)
flush("NetFX")

# ---------------------------------------------------------------- streetscape: roads under the network, cars, trees, fence, pylons
FM["asphalt"] = flat_mat("F_asphalt", (0.006, 0.0065, 0.008), 0.55)
FM["mark"] = flat_mat("F_mark", (0.6, 0.62, 0.66), emit=(0.75, 0.78, 0.85), strength=0.35)
FM["tree"] = flat_mat("F_tree", (0.008, 0.016, 0.011), 0.8)
FM["car"] = flat_mat("F_car", (0.025, 0.027, 0.032), 0.3, metal=0.5)
FM["head"] = flat_mat("F_head", (1, 1, 1), emit=(1.0, 0.95, 0.85), strength=6.0)
FM["tail"] = flat_mat("F_tail", (1, 0.1, 0.05), emit=(1.0, 0.06, 0.03), strength=4.0)
FM["wire"] = flat_mat("F_wire", (0.6, 0.65, 0.75), emit=(0.6, 0.66, 0.8), strength=0.6)
in_core = lambda x, y, k=1.0: ((x - CORE[0]) / (RX * k)) ** 2 + ((y - CORE[1]) / (RY * k)) ** 2 < 1
seen_seg = set()
for pts3 in runs:
    for a, b in zip(pts3, pts3[1:]):
        key = (round(a[0]), round(a[1]), round(b[0]), round(b[1]))
        if key in seen_seg or (b[0], b[1]) == (a[0], a[1]): continue
        seen_seg.add(key)
        horiz = abs(b[1] - a[1]) < 1e-6
        x0, x1 = sorted((a[0], b[0])); y0, y1 = sorted((a[1], b[1]))
        L_ = (x1 - x0) if horiz else (y1 - y0)
        mx_, my_ = (x0 + x1) / 2, (y0 + y1) / 2
        box("asphalt", mx_, my_, 0.0, (L_ + 7) if horiz else 7, 7 if horiz else (L_ + 7), 0.05)
        for off in (-3.3, 3.3):                                                       # kerb lines
            box("mark", mx_ + (0 if horiz else off), my_ + (off if horiz else 0), 0.05, (L_ + 7) if horiz else 0.12, 0.12 if horiz else (L_ + 7), 0.01)
        s0 = (x0 if horiz else y0)
        k0 = math.ceil(s0 / 5.0)
        while k0 * 5.0 + 2.5 < s0 + L_:                                               # lane dashes on a global 5 m grid
            s = k0 * 5.0 + 1.25; k0 += 1
            for off in (-1.6, 1.6):
                px, py = (s, a[1] + off) if horiz else (a[0] + off, s)
                if not in_core(px, py, 0.9):
                    box("mark", px, py, 0.05, 2.0 if horiz else 0.12, 0.12 if horiz else 2.0, 0.01)
        # traffic: a few cars per segment outside the core, each lane heading its own way
        t_ = 4.0
        while t_ < L_ - 4:
            t_ += rng.uniform(9, 22)
            if t_ >= L_ - 3: break
            lane = rng.choice((-2.4, 2.4)); fwd = 1 if lane > 0 else -1
            px, py = ((x0 + t_, a[1] + lane) if horiz else (a[0] + lane, y0 + t_))
            if in_core(px, py, 1.02): continue
            rz_ = (0 if fwd > 0 else math.pi) if horiz else (math.pi / 2 if fwd > 0 else -math.pi / 2)
            c_, s_ = math.cos(rz_), math.sin(rz_)
            box("car", px, py, 0.08, 2.1, 0.95, 0.5, rz_); box("car", px - 0.15 * c_, py - 0.15 * s_, 0.58, 1.1, 0.85, 0.38, rz_)
            for side in (-0.3, 0.3):
                box("head", px + 1.06 * c_ - side * s_, py + 1.06 * s_ + side * c_, 0.32, 0.05, 0.18, 0.1, rz_)
                box("tail", px - 1.06 * c_ - side * s_, py - 1.06 * s_ + side * c_, 0.36, 0.05, 0.2, 0.08, rz_)
flush("Streets")

def tree(x, y, s=1.0):
    cyl("car", x, y, 0, 0.12 * s, 1.1 * s, 8)
    r = rng.uniform(1.0, 1.45) * s
    bmesh.ops.create_icosphere(bm_for("tree"), subdivisions=2, radius=r, matrix=M(x, y, 1.0 * s + r * 0.85, 1, 1, 0.9))
def tree_row(x0, y0, x1, y1, step=4.0, skip=()):
    n = max(1, int(math.dist((x0, y0), (x1, y1)) / step))
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n + rng.uniform(-0.5, 0.5); y = y0 + (y1 - y0) * i / n + rng.uniform(-0.5, 0.5)
        if any(lo <= (y if x0 == x1 else x) <= hi for lo, hi in skip): continue
        tree(x, y, rng.uniform(0.85, 1.15))
tree_row(87, 56, 87, 79, skip=((63.5, 72.5),))          # hospital: west, north and south edges
tree_row(91, 80.5, 115, 80.5); tree_row(91, 53.5, 115, 53.5)
tree_row(62, 9.5, 102, 9.5); tree_row(62, -11.5, 100, -11.5)   # pharma campus
tree_row(63, -46, 63, -20, skip=((-35.5, -28.5),))      # energy site
tree_row(-118, -15, -58, -15, 4.5)                      # data-centre campus, south boundary
tree_row(86, -86, 114, -86)                             # edge data centre
flush("Trees")

def fence(x0, y0, x1, y1, gaps=()):
    for (ax, ay, bx, by) in ((x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0)):
        L_ = math.dist((ax, ay), (bx, by)); n = int(L_ / 3)
        for i in range(n + 1):
            px, py = ax + (bx - ax) * i / n, ay + (by - ay) * i / n
            if any(abs(px - gx) < 3.5 and abs(py - gy) < 3.5 for gx, gy in gaps): continue
            box("metal", px, py, 0, 0.08, 0.08, 1.9)
            if i < n:
                qx, qy = ax + (bx - ax) * (i + 0.5) / n, ay + (by - ay) * (i + 0.5) / n
                if any(abs(qx - gx) < 3.5 and abs(qy - gy) < 3.5 for gx, gy in gaps): continue
                rz_ = math.atan2(by - ay, bx - ax)
                for zz in (0.9, 1.85): box("metal", qx, qy, zz, L_ / n, 0.04, 0.04, rz_)
fence(-120.5, -12.5, -54.5, 24.0, gaps=((-54.5, -2),))
fence(84.5, -83.5, 115.5, -57.5, gaps=((84.5, -71),))
flush("Fences")

def strut(mat, p0, p1, r=0.07):
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    bmesh.ops.create_cone(bm_for(mat), cap_ends=True, segments=6, radius1=r, radius2=r, depth=d.length,
                          matrix=Matrix.Translation((p0 + p1) / 2) @ rot)
def pylon(x, y, H=13.0):
    b, t = 1.6, 0.5
    lv = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for i, (sx, sy) in enumerate(lv):                                                # four raked legs
        strut("metal", (x + sx * b, y + sy * b, 0), (x + sx * t, y + sy * t, H), 0.09)
    for k in range(4):                                                                # X-bracing panels
        z0, z1 = H * k / 4, H * (k + 1) / 4
        w0, w1 = b + (t - b) * k / 4, b + (t - b) * (k + 1) / 4
        for i in range(4):
            (ax, ay), (bx, by) = lv[i], lv[(i + 1) % 4]
            strut("metal", (x + ax * w0, y + ay * w0, z0), (x + bx * w1, y + by * w1, z1), 0.04)
            strut("metal", (x + bx * w0, y + by * w0, z0), (x + ax * w1, y + ay * w1, z1), 0.04)
    for zz, w in ((H * 0.78, 3.6), (H * 0.95, 2.6)):                                  # cross-arms
        strut("metal", (x - w, y, zz), (x + w, y, zz), 0.07)
    return [(x - 3.6, y, H * 0.78 - 0.6), (x + 3.6, y, H * 0.78 - 0.6), (x, y, H + 0.6)]
tops = [pylon(118, y_) for y_ in (-44, -24, -4, 16)]
flush("Pylons")
def wire(p0, p1, sag=1.2):
    cu = bpy.data.curves.new("Wire", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = 0.035
    sp_ = cu.splines.new("POLY"); n = 16; sp_.points.add(n - 1)
    for i in range(n):
        t = i / (n - 1); p = Vector(p0).lerp(Vector(p1), t); sp_.points[i].co = (p.x, p.y, p.z - sag * 4 * t * (1 - t), 1)
    o = bpy.data.objects.new("Wire", cu); cu.materials.append(FM["wire"]); fcoll.objects.link(o)
for A, B in zip(tops, tops[1:]):
    for pa, pb in zip(A, B): wire(pa, pb)
for pa in tops[1][:2]: wire((111, -32, 4.3), pa, 0.6)                                 # drop from the substation gantry

# ---------------------------------------------------------------- white architectural edge lines (Freestyle), ground excluded
gcoll = bpy.data.collections.new("Ground"); sc.collection.children.link(gcoll)
for o in ground:
    for c0 in list(o.users_collection): c0.objects.unlink(o)
    gcoll.objects.link(o)
sc.render.use_freestyle = True
sc.render.line_thickness_mode = "ABSOLUTE"; sc.render.line_thickness = 1.0
vl = bpy.context.view_layer; fs = vl.freestyle_settings
fs.crease_angle = math.radians(140)
ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("Edges")
ls.select_by_visibility = True; ls.select_by_edge_types = True
ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True
ls.select_by_collection = True; ls.collection = gcoll; ls.collection_negation = "EXCLUSIVE"
if ls.linestyle is None: ls.linestyle = bpy.data.linestyles.new("EdgeLines")
ls.linestyle.color = (0.82, 0.86, 0.95); ls.linestyle.alpha = 0.5; ls.linestyle.thickness = 1.0
# depth: lines thin out and fade with distance from the camera
am = ls.linestyle.alpha_modifiers.new("Depth", "DISTANCE_FROM_CAMERA")
am.range_min, am.range_max = 90.0, 420.0; am.invert = True; am.influence = 0.6; am.blend = "MULTIPLY"
tm = ls.linestyle.thickness_modifiers.new("DepthT", "DISTANCE_FROM_CAMERA")
tm.range_min, tm.range_max = 80.0, 400.0; tm.value_min, tm.value_max = 1.1, 0.55; tm.blend = "MULTIPLY"
ls.linestyle.caps = "ROUND"

# ---------------------------------------------------------------- bloom (compositor glare)
try:
    ng = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
    sc.compositing_node_group = ng
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    rl = ng.nodes.new("CompositorNodeRLayers"); gl = ng.nodes.new("CompositorNodeGlare"); go = ng.nodes.new("NodeGroupOutput")
    for gt in ("BLOOM", "FOG_GLOW"):
        try:
            if "Type" in gl.inputs: gl.inputs["Type"].default_value = gt.title().replace("_", " ")
            else: gl.glare_type = gt
            break
        except Exception: pass
    for nm, v in (("Threshold", 0.6), ("Size", 0.6), ("Strength", 0.9)):
        if nm in gl.inputs: gl.inputs[nm].default_value = v
    ng.links.new(rl.outputs["Image"], gl.inputs["Image"]); ng.links.new(gl.outputs["Image"], go.inputs[0])
    print("BLOOM ok")
except Exception as e:
    print("BLOOM skipped:", e)

sc.view_settings.view_transform = "AgX"
try: sc.view_settings.look = "AgX - Medium High Contrast"
except Exception: pass
sc.eevee.taa_render_samples = 96
for attr, v in (("use_raytracing", True), ("use_shadows", True), ("use_gtao", True)):
    try: setattr(sc.eevee, attr, v)
    except Exception: pass
try: sc.view_settings.look = "AgX - High Contrast"
except Exception: pass

# ---------------------------------------------------------------- labels: Nunito Sans, a thin leader and an orange tag dot
font = bpy.data.fonts.load(r"D:/Surds_Website/tools/NunitoSans-SemiBold.ttf")
txt_m = flat_mat("F_label", (1, 1, 1), emit=(0.93, 0.95, 1.0), strength=1.3)
lead_m = flat_mat("F_leader", (1, 1, 1), emit=(0.8, 0.85, 0.95), strength=0.5)
labels = []
tall0 = hubs[0]
for label, x, y, top in [("Commercial Buildings", tall0[1], tall0[2], tall0[0])] + hubs_fac:
    if label == "Edge Data Center": continue
    h = 12.0
    cu = bpy.data.curves.new(f"Lead_{label}", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = 0.07
    sp_ = cu.splines.new("POLY"); sp_.points.add(1)
    sp_.points[0].co = (x, y, top + 1.0, 1); sp_.points[1].co = (x, y, top + h, 1)
    lo = bpy.data.objects.new(cu.name, cu); cu.materials.append(lead_m); gcoll.objects.link(lo)
    dot = node(f"Tag_{label}", (x, y, top + h), 0.6)
    tc = bpy.data.curves.new(f"Label_{label}", "FONT"); tc.body = label; tc.font = font
    tc.size = 5.2; tc.align_x = "CENTER"; tc.materials.append(txt_m)
    to = bpy.data.objects.new(tc.name, tc); gcoll.objects.link(to); to.location = (x, y, top + h + 1.6)
    labels += [lo, dot, to]

def shoot(name, cam_loc, tgt_loc, lens, shift=0.0, show_labels=False):
    cam.data.type = "PERSP"
    cam.location = cam_loc; tgt.location = tgt_loc; cam.data.lens = lens; cam.data.shift_x = shift; cam.data.shift_y = 0
    _render(name, show_labels, (Vector(cam_loc) - Vector(tgt_loc)).length)

def shoot_iso(name, tgt_loc, az, el, scale, shift_x=0.0, shift_y=0.0, show_labels=False):
    """Orthographic isometric view: az/el in degrees, camera sits on that bearing above the target."""
    D = 600.0; a, e = math.radians(az), math.radians(el)
    cam.data.type = "ORTHO"; cam.data.ortho_scale = scale
    cam.data.shift_x, cam.data.shift_y = shift_x, shift_y
    tgt.location = tgt_loc
    cam.location = (tgt_loc[0] + D * math.cos(e) * math.cos(a), tgt_loc[1] + D * math.cos(e) * math.sin(a), tgt_loc[2] + D * math.sin(e))
    _render(name, show_labels, D)

def label_positions():
    # screen position of every label anchor (0..1 from the top-left), for the HTML overlay on the website
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update(); out = {}
    for o in labels:
        if o.name.startswith("Tag_"):
            v = world_to_camera_view(sc, cam, o.location)
            out[o.name[4:]] = (round(v.x * 100, 2), round((1 - v.y) * 100, 2))
    print("LABELPOS", out)

def _render(name, show_labels, dist):
    am.range_min, am.range_max = dist - 140, dist + 220
    tm.range_min, tm.range_max = dist - 140, dist + 220
    bpy.context.view_layer.update()
    rot = cam.matrix_world.to_euler()
    for o in labels:
        o.hide_render = not show_labels
        if o.type == "FONT": o.rotation_euler = rot
    if name.startswith("network"): label_positions()
    sc.render.filepath = f"{OUT}/{name}.png"; bpy.ops.render.render(write_still=True); print("SHOT", name)

# hero: isometric district on the right, open dark space on the left for the headline
sc.render.resolution_x, sc.render.resolution_y = 2560, 1440      # retina-sized stills for the website
shoot_iso("hero", (10, 0, 6), 225, 33, 365, -0.14, 0.02)
# connected physical world: labelled facilities linked by the network (+ a clean plate for HTML labels)
shoot_iso("network", (12, 6, 0), 235, 42, 345, 0.0, 0.085, show_labels=True)
shoot_iso("network_clean", (12, 6, 0), 235, 42, 345, 0.0, 0.085, show_labels=False)
# close-up of the data-centre campus
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
shoot("datacenter", (-150, -62, 42), (-84, 6, 2), 42)
print("POLYS", sum(len(o.data.polygons) for o in sc.objects if o.type == "MESH"))
bpy.ops.wm.save_as_mainfile(filepath=r"D:/Surds_Website/tools/city_surds.blend")
print("FINAL DONE")
