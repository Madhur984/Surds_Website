# Convert NVIDIA SimReady (OpenUSD) equipment from Vertiv / Trane into web GLBs for /explore.
#   blender -b --factory-startup --python tools/simready_convert.py -- <asset_dir> <out.glb> [--tris 120000]
# Imports the asset's *_main.usd (or <name>.usd), keeps meshes + materials, joins per material, decimates to a triangle
# budget, puts it on the floor (z=0) centred on x/y, and exports a GLB. Prints SIZE w d h and TRIS so the page can lay it out.
# Assets are CC-BY-4.0 (Vertiv/simready-assets, TraneTechnologies/simready-assets on Hugging Face): credit them on the page.
import bpy, sys, os, glob, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]
TRIS = int(argv[argv.index("--tris") + 1]) if "--tris" in argv else 120000

bpy.ops.wm.read_factory_settings(use_empty=True)
usd = sorted(glob.glob(os.path.join(SRC, "simready_usd", "*_main.usd")) or glob.glob(os.path.join(SRC, "simready_usd", "*.usd")))[0]
bpy.ops.wm.usd_import(filepath=usd, import_cameras=False, import_lights=False, import_materials=True, import_usd_preview=True,
                      set_material_blend=True, import_guide=False, import_proxy=False, import_render=True)

for o in bpy.context.scene.objects: o.hide_set(False); o.hide_viewport = False; o.hide_render = False
# USD point instancers / instanced prims come in as instances: make them real, single-user meshes first
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.duplicates_make_real()
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.make_single_user(type="ALL", object=True, obdata=True)
for o in [o for o in bpy.context.scene.objects if o.type not in ("MESH", "EMPTY")]: bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and len(o.data.polygons)]
for o in [o for o in bpy.context.scene.objects if o.type == "MESH" and not len(o.data.polygons)]: bpy.data.objects.remove(o, do_unlink=True)
# bake transforms into the meshes and join everything into one object
bpy.ops.object.select_all(action="DESELECT")
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
for o in [o for o in bpy.context.scene.objects if o.type == "EMPTY"]: bpy.data.objects.remove(o, do_unlink=True)

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
t0 = tris(obj)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.object.mode_set(mode="OBJECT")
# drop vertex-colour layers (they double the GLB and the SimReady materials already carry the colours)
for ca in list(obj.data.color_attributes): obj.data.color_attributes.remove(ca)
# remove tiny loose parts (screws, internal components) that collapse can't simplify and nobody can see
import bmesh
MINPART = float(argv[argv.index("--minpart") + 1]) if "--minpart" in argv else 0.035
bm = bmesh.new(); bm.from_mesh(obj.data); bm.faces.ensure_lookup_table()
seen, kill = set(), []
for f0 in bm.faces:
    if f0.index in seen: continue
    isl, stack = [], [f0]; seen.add(f0.index)
    while stack:
        f = stack.pop(); isl.append(f)
        for e in f.edges:
            for g in e.link_faces:
                if g.index not in seen: seen.add(g.index); stack.append(g)
    vs = {v for f in isl for v in f.verts}
    lo = Vector((min(v.co.x for v in vs), min(v.co.y for v in vs), min(v.co.z for v in vs)))
    hi = Vector((max(v.co.x for v in vs), max(v.co.y for v in vs), max(v.co.z for v in vs)))
    if (hi - lo).length < MINPART: kill += isl
bmesh.ops.delete(bm, geom=kill, context="FACES"); bm.to_mesh(obj.data); bm.free()
print(f"PARTS removed {len(kill)} faces under {MINPART} m")
# CAD tessellation: flat panels are split into many coplanar patches, which edge-collapse can't touch.
# 1) planar dissolve merges coplanar faces, 2) collapse brings it to budget, 3) repeat with a looser angle if needed.
for ang in (2.0, 5.0, 10.0):
    if tris(obj) <= TRIS: break
    m = obj.modifiers.new("planar", "DECIMATE"); m.decimate_type = "DISSOLVE"; m.angle_limit = math.radians(ang); m.use_dissolve_boundaries = False
    bpy.ops.object.modifier_apply(modifier=m.name)
    m = obj.modifiers.new("tri", "TRIANGULATE"); bpy.ops.object.modifier_apply(modifier=m.name)
    if tris(obj) > TRIS:
        m = obj.modifiers.new("dec", "DECIMATE"); m.ratio = max(0.05, TRIS / tris(obj)); m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=m.name)
    print("REDUCE", ang, tris(obj))
# floor it, centre it
bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))); mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
obj.location -= Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)); bpy.ops.object.transform_apply(location=True)
bpy.context.view_layer.objects.active = obj
if obj.data.has_custom_normals: bpy.ops.mesh.customdata_custom_splitnormals_clear()   # USD normals are garbage after decimation
obj.data.shade_smooth(); obj.data.set_sharp_from_angle(angle=math.radians(30))   # flat panels stay crisp, curves smooth
print(f"SIZE {mx.x - mn.x:.3f} {mx.y - mn.y:.3f} {mx.z - mn.z:.3f}  TRIS {t0} -> {tris(obj)}  MATS {len(obj.data.materials)}")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_attributes=False, export_apply=True, export_yup=True,
                          export_image_format="JPEG", export_jpeg_quality=82)
print("WROTE", OUT)
