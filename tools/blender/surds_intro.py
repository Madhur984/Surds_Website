# Opening of the SURDS build-up. The camera holds the 3D view; the 2D plan stands upright on the city's
# front corner like a sheet and pivots on it, falling back onto the city. Wherever the falling sheet passes through
# a building it leaves that building behind as glowing cross-section layers and a ghost wireframe of the
# finished shape (an imaginary preview). The sheet lands as the ground, the blueprint city holds, then the
# existing construction (pushed back by INTRO frames) replaces each ghost from the bottom up. Runs in the same namespace after surds_city.py, surds_city_animate.py and surds_plan2d.py.
import bpy, bmesh, math
from mathutils import Matrix, Quaternion, Vector

HOLD_2D, FALL, HOLD_BP = 24, 36, 30        # frames: sheet upright, sheet falls, blueprint hold
SHEET_START = 0.3                          # the upright sheet's size; it grows to full size as it falls
                                           # (small enough that the camera still pulls back while it grows)
FACE_EL = math.radians(3)                  # camera nearly level with the upright sheet: it reads face-on
INTRO = HOLD_2D + FALL + HOLD_BP
F_FALL0 = HOLD_2D + 1
F_LAND = F_FALL0 + FALL
WIRE = 0.05                                # blueprint line thickness, metres

assert scene.frame_end == F_END, "run on a freshly built scene (surds_city + surds_city_animate)"

# ---------------------------------------------------------------- blueprint footprints, from the finished city
scene.frame_set(F_END)
bpy.context.view_layer.update()
sites = []
for g in GROUPS:
    if g["kind"] not in ("building", "stack"):
        continue
    ps = [g["solid"].matrix_world @ Vector(c) for c in g["solid"].bound_box]
    site = dict(g=g, x0=min(p.x for p in ps), y0=min(p.y for p in ps), x1=max(p.x for p in ps),
                y1=max(p.y for p in ps), top=max(p.z for p in ps), s1=g["solid"].scale.z)
    # the finished building, frozen in world space: solid, roof, details, cooling towers, chillers ...
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    for part in [g["solid"]] + [o for o in g["attach"] if o.type == "MESH"]:
        me = bpy.data.meshes.new_from_object(part.evaluated_get(dg))
        me.transform(part.matrix_world)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    site["bm"] = bm
    sites.append(site)

# ---------------------------------------------------------------- push the whole build-up back by INTRO frames
shifted = set()


def shift(idb):
    ad = getattr(idb, "animation_data", None)
    if not ad or not ad.action or ad.action.name in shifted:
        return
    shifted.add(ad.action.name)
    for fc in ad.action.fcurves:
        for kp in fc.keyframe_points:
            kp.co.x += INTRO
            kp.handle_left.x += INTRO
            kp.handle_right.x += INTRO


for coll in (bpy.data.objects, bpy.data.curves, bpy.data.cameras, bpy.data.lights, bpy.data.meshes, bpy.data.materials):
    for idb in coll:
        shift(idb)
for m in bpy.data.materials:
    if m.node_tree:
        shift(m.node_tree)
scene.frame_end = F_END + INTRO


def key(o, attr, frame, value, idx=None):
    if idx is None:
        setattr(o, attr, value)
        o.keyframe_insert(attr, frame=frame)
    else:
        getattr(o, attr)[idx] = value
        o.keyframe_insert(attr, index=idx, frame=frame)


# the city's own pieces stay out until the build starts (the ghosts stand in for them); the ground and
# streets appear when the sheet lands, the sheet's own copy of them handing over
GROUND = ("Ground", "Roads", "Lane Markings", "City Blocks", "Expressway")
LATER = ("Headlight Trails", "Tail Light Trails", "Street Lights")
for o in list(col.all_objects):
    ad = o.animation_data
    if ad and ad.action and any(fc.data_path == "hide_render" for fc in ad.action.fcurves):
        continue
    if o.name.startswith(GROUND + LATER):
        key(o, "hide_render", 1, True)
        key(o, "hide_render", F_LAND, False)
    elif not o.name.startswith(KEEP):
        key(o, "hide_render", 1, True)
        key(o, "hide_render", INTRO + 1, False)

# trees render on their own layer and are laid over the top, so they must sit out the intro entirely
key(TREES, "hide_render", 1, True)
key(TREES, "hide_render", INTRO + 1, False)

# ---------------------------------------------------------------- the 2D plan as a falling sheet
# The sheet hinges on the city's front corner (nearest the camera). It starts upright and smaller, face to
# the camera, and falls back flat onto the city while growing from that fixed corner to full size. An empty
# at the hinge carries it (rotation + scale about the corner); in that empty's space local Z > 0 is exactly
# the region the sheet has already swept through.
h_dir = Vector((d.x, d.y, 0)).normalized()                    # towards the camera, on the ground
gx = max(abs(v) for v in D["ground"])
hinge = Vector((math.copysign(gx, h_dir.x), math.copysign(gx, h_dir.y), 0))
axis = Vector((0, 0, 1)).cross(h_dir)                         # turning about it lifts the far side up
old = bpy.data.objects.get("Plan Sweep")
if old:
    bpy.data.objects.remove(old, do_unlink=True)
sweep = bpy.data.objects.new("Plan Sweep", None)
col.objects.link(sweep)                                       # rebuilt with the city
sweep.location = hinge
sweep.rotation_mode = "QUATERNION"
for f in range(1, F_LAND + 1):
    t = min(max((f - F_FALL0) / FALL, 0.0), 1.0)
    # pivots on its corner: eases off upright, falls, and settles flat
    e = t * t * (3 - 2 * t)
    sweep.rotation_quaternion = Quaternion(axis, math.pi / 2 * (1 - e))
    sweep.keyframe_insert("rotation_quaternion", frame=f)
    sweep.scale = [SHEET_START + (1 - SHEET_START) * e] * 3
    sweep.keyframe_insert("scale", frame=f)
for fc in sweep.animation_data.action.fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"

# the sheet's paper: the ground and streets, so the upright sheet reads like the plan render
paper = []
for name in GROUND:
    src = bpy.data.objects[name]
    o = src.copy()
    o.animation_data_clear()
    o.name = "Plan Paper " + name
    PLAN.objects.link(o)
    paper.append(o)
PLAN.hide_render = False
rest = Matrix.Translation(-hinge)                            # children keep their place when the sheet lies flat
for o in PLAN.objects:
    o.parent = sweep
    o.matrix_parent_inverse = rest
    o.animation_data_clear() if o in paper else None
    key(o, "hide_render", 1, False)
    flat_now = o in paper or o.name == "Plan Footprint Fill"
    key(o, "hide_render", F_LAND if flat_now else F_LAND + 16, True)
for m in (M_LINE, M_DIM, M_TEXT, M_WARM, M_NET):            # once down, the lines dissolve into the ground
    em = next(n for n in m.node_tree.nodes if n.type == "EMISSION").inputs["Strength"]
    s0 = em.default_value
    em.keyframe_insert("default_value", frame=F_LAND)
    em.default_value = 0.0
    em.keyframe_insert("default_value", frame=F_LAND + (8 if m in (M_TEXT, M_WARM) else 15))
    em.default_value = s0

# ---------------------------------------------------------------- blueprint wireframes
M_BP = bpy.data.materials.get("Blueprint Wire") or bpy.data.materials.new("Blueprint Wire")
M_BP.use_nodes = True
nt = M_BP.node_tree
nt.animation_data_clear()
nt.nodes.clear()
L = nt.links.new


def math_node(op, a=None, b=None, c=None):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    for k, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[k].default_value = v
        else:
            L(v, n.inputs[k])
    return n.outputs[0]


geo = nt.nodes.new("ShaderNodeNewGeometry")
noise = nt.nodes.new("ShaderNodeTexNoise")
noise.noise_dimensions = "4D"
noise.inputs["Scale"].default_value = 0.22
noise.inputs["Detail"].default_value = 1.0
fcu = noise.inputs["W"].driver_add("default_value")
fcu.driver.expression = "frame / 20"          # glints drift along the lines
L(geo.outputs["Position"], noise.inputs["Vector"])
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.6
ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
ramp.color_ramp.elements[1].position = 0.72
ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
L(noise.outputs["Fac"], ramp.inputs["Fac"])
glint = math_node("MULTIPLY_ADD", ramp.outputs["Color"], 9.0, 1.0)
# position relative to the falling sheet: only what it has swept through exists; a hot band where it cuts
tc = nt.nodes.new("ShaderNodeTexCoord")
tc.object = sweep
sz = nt.nodes.new("ShaderNodeSeparateXYZ")
L(tc.outputs["Object"], sz.inputs[0])
rel = sz.outputs["Z"]
below = math_node("GREATER_THAN", rel, 0.0)                 # swept: on the far side of the sheet
band = math_node("MAXIMUM", math_node("SUBTRACT", 1.0, math_node("MULTIPLY", rel, 0.5)), 0.0)  # hot where it's cutting
lit = math_node("MULTIPLY", math_node("ADD", glint, math_node("MULTIPLY", band, 14.0)), below)
# the real building replaces its ghost from the bottom up: only the part above its current top remains,
# with a bright seam where construction meets the blueprint ("clip" is driven by the building's growth)
own = nt.nodes.new("ShaderNodeTexCoord")
oz = nt.nodes.new("ShaderNodeSeparateXYZ")
L(own.outputs["Object"], oz.inputs[0])
clip = nt.nodes.new("ShaderNodeAttribute")
clip.attribute_type = "OBJECT"
clip.attribute_name = "clip"
above = math_node("SUBTRACT", oz.outputs["Z"], clip.outputs["Fac"])
unbuilt = math_node("GREATER_THAN", above, 0.0)
seam = math_node("MULTIPLY", math_node("MAXIMUM", math_node("SUBTRACT", 1.0, math_node("MULTIPLY", above, 1.2)), 0.0),
                 math_node("GREATER_THAN", clip.outputs["Fac"], 0.05))
lit = math_node("MULTIPLY", math_node("ADD", lit, math_node("MULTIPLY", seam, 10.0)), unbuilt)
below = math_node("MULTIPLY", below, unbuilt)
info = nt.nodes.new("ShaderNodeObjectInfo")
sep = nt.nodes.new("ShaderNodeSeparateColor")
L(info.outputs["Color"], sep.inputs["Color"])
strength = math_node("MULTIPLY", math_node("MULTIPLY", lit, sep.outputs[0]), 1.8)
em = nt.nodes.new("ShaderNodeEmission")
em.inputs["Color"].default_value = (0.66, 0.82, 1.0, 1)
L(strength, em.inputs["Strength"])
mix = nt.nodes.new("ShaderNodeMixShader")
L(below, mix.inputs["Fac"])
L(nt.nodes.new("ShaderNodeBsdfTransparent").outputs[0], mix.inputs[1])
L(em.outputs[0], mix.inputs[2])
L(mix.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])

bp_col = bpy.data.collections.get("SURDS Blueprint")
if bp_col:
    for o in list(bp_col.objects):
        bpy.data.objects.remove(o, do_unlink=True)
else:
    bp_col = bpy.data.collections.new("SURDS Blueprint")
    scene.collection.children.link(bp_col)

# The sheet and the ghosts render on their own layer without Freestyle (outlining the dense ghost
# wireframes stalls Freestyle for minutes a frame); the city is holdout there, so buildings still hide
# them, and the compositor lays the layer over the city like the trees.
def lcs(lc):
    yield lc
    for ch in lc.children:
        yield from lcs(ch)


bp_vl = scene.view_layers.get("Blueprint") or scene.view_layers.new("Blueprint")
bp_vl.use_freestyle = False
for vl in scene.view_layers:
    for lc in lcs(vl.layer_collection):
        if vl == bp_vl:
            name = lc.collection.name
            lc.exclude = name in ("Imported", "Tree Library")
            lc.holdout = lc.collection not in (bp_col, PLAN, scene.collection)
        elif lc.collection in (bp_col, PLAN):
            lc.exclude = True
ct = scene.node_tree
sky = next(n for n in ct.nodes if n.type == "ALPHAOVER" and n.inputs[2].links
           and n.inputs[2].links[0].from_node.type == "ALPHAOVER")
city_trees = sky.inputs[2].links[0].from_node
rl_bp = ct.nodes.new("CompositorNodeRLayers")
rl_bp.layer = bp_vl.name
over_bp = ct.nodes.new("CompositorNodeAlphaOver")
ct.links.new(city_trees.outputs["Image"], over_bp.inputs[1])
ct.links.new(rl_bp.outputs["Image"], over_bp.inputs[2])
ct.links.new(over_bp.outputs["Image"], sky.inputs[2])

# slice outlines become thin tubes
tube = bpy.data.node_groups.get("Blueprint Tube") or bpy.data.node_groups.new("Blueprint Tube", "GeometryNodeTree")
tube.nodes.clear()
for sock in list(tube.interface.items_tree):
    tube.interface.remove(sock)
tube.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
tube.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
gi, go = tube.nodes.new("NodeGroupInput"), tube.nodes.new("NodeGroupOutput")
m2c = tube.nodes.new("GeometryNodeMeshToCurve")
prof = tube.nodes.new("GeometryNodeCurvePrimitiveCircle")
prof.inputs["Resolution"].default_value = 4
prof.inputs["Radius"].default_value = WIRE * 0.4
c2m = tube.nodes.new("GeometryNodeCurveToMesh")
setm = tube.nodes.new("GeometryNodeSetMaterial")
setm.inputs["Material"].default_value = M_BP
tube.links.new(gi.outputs[0], m2c.inputs["Mesh"])
tube.links.new(m2c.outputs[0], c2m.inputs["Curve"])
tube.links.new(prof.outputs["Curve"], c2m.inputs["Profile Curve"])
tube.links.new(c2m.outputs[0], setm.inputs["Geometry"])
tube.links.new(setm.outputs[0], go.inputs[0])

SLICE = 1.2                                   # metres between the layers the sheet leaves behind


def blueprint(site):
    """Ghost of the finished building (its real geometry as a thin wireframe) plus the stack of
    cross-sections the rising sheet leaves in it."""
    g = site["g"]
    cx, cy = (site["x0"] + site["x1"]) / 2, (site["y0"] + site["y1"]) / 2
    bm = site["bm"]
    bmesh.ops.translate(bm, verts=bm.verts, vec=(-cx, -cy, -Z0))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)
    me = bpy.data.meshes.new(f"Blueprint {g['name']}")
    bm.to_mesh(me)
    sl = bmesh.new()                          # cross-sections, every SLICE metres
    z = SLICE * 0.5
    while z < site["top"] - Z0:
        cut = bm.copy()
        res = bmesh.ops.bisect_plane(cut, geom=cut.verts[:] + cut.edges[:] + cut.faces[:],
                                     plane_co=(0, 0, z), plane_no=(0, 0, 1))
        for e in [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]:
            a, b = (sl.verts.new(v.co) for v in e.verts)
            sl.edges.new((a, b))
        cut.free()
        z += SLICE
    bmesh.ops.remove_doubles(sl, verts=sl.verts, dist=0.005)
    bm.free()
    me.materials.clear()
    o = bpy.data.objects.new(f"Blueprint {g['name']}", me)
    o.location = (cx, cy, Z0)
    o.data.materials.append(M_BP)
    w = o.modifiers.new("Wire", "WIREFRAME")
    w.thickness = WIRE
    w.use_even_offset = False
    bp_col.objects.link(o)
    sme = bpy.data.meshes.new(f"Blueprint Slices {g['name']}")
    sl.to_mesh(sme)
    sl.free()
    so = bpy.data.objects.new(f"Blueprint Slices {g['name']}", sme)
    so.location = o.location
    so.modifiers.new("Tube", "NODES").node_group = tube
    bp_col.objects.link(so)
    return o, so


for site in sites:
    g = site["g"]
    done = g["end"] + 4 + INTRO               # its building is complete; nothing of the ghost is left
    H = site["top"] - Z0 + 0.4
    for o, level in zip(blueprint(site), (1.0, 0.55)):
        key(o, "hide_render", 1, True)
        key(o, "hide_render", F_FALL0, False)
        key(o, "hide_render", done + 2, True)
        o.color = (level, level, level, 1)
        o["clip"] = 0.0
        fc = o.driver_add('["clip"]')
        var = fc.driver.variables.new()
        var.name = "s"
        var.targets[0].id = g["solid"]
        var.targets[0].data_path = "scale[2]"
        fc.driver.expression = f"s / {site['s1']:.4f} * {H:.2f}"

# ---------------------------------------------------------------- camera: level with the upright sheet, rising into 3D
# as it falls. Starts face-on (so the sheet reads as a flat 2D plan standing up), ends at the 3D view where
# the push-in begins; it moves with the same easing as the fall.
iso_loc = target + d * (CAM_DIST * 1.25)
iso_el = math.asin(d.z)
reach = hinge.length                                   # hinge corner to the plan's centre at full size
face_c = hinge + Vector((0, 0, reach * SHEET_START))   # the upright sheet's centre
face_d = 2 * reach * SHEET_START / (cam.data.sensor_width * 9 / 16) * cam.data.lens * 1.18   # pulls back as the sheet grows
prev = None
for f in range(1, F_LAND + 1):
    t = min(max((f - F_FALL0) / FALL, 0.0), 1.0)
    e = t * t * (3 - 2 * t)
    el = FACE_EL + (iso_el - FACE_EL) * e
    dist = face_d + (CAM_DIST * 1.25 - face_d) * e
    c = face_c.lerp(target, e)
    v = h_dir * math.cos(el) + Vector((0, 0, math.sin(el)))
    cam.location = c + v * dist
    q = (-v).to_track_quat("-Z", "Y")
    rot = q.to_euler("XYZ", prev) if prev else q.to_euler()
    prev = rot
    cam.rotation_euler = rot
    cam.keyframe_insert("location", frame=f)
    cam.keyframe_insert("rotation_euler", frame=f)
for fc in cam.animation_data.action.fcurves:
    for kp in fc.keyframe_points:
        if kp.co.x <= F_LAND:
            kp.interpolation = "LINEAR"
cam.location = iso_loc

scene.render.use_motion_blur = True        # the falling sheet smears a little; slow moves stay crisp
scene.render.motion_blur_shutter = 0.5
scene.frame_set(1)
print(f"intro: {INTRO} frames, {len(sites)} blueprints, frame_end {scene.frame_end}")
