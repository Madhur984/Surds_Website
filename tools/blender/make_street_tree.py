# Builds the light, dark "Street Tree" used by surds_city.py from Poly Haven's jacaranda (CC0) and saves it to
# source/trees/street_tree.blend. Run once inside Blender:  exec(open(".../make_street_tree.py").read())
# Source: source/trees/jacaranda_tree_1k.blend  (https://polyhaven.com/a/jacaranda_tree)
import bpy, bmesh, random, os
from mathutils import Vector

ROOT = "/home/boom/SURDS_docs/website/source/trees/"
SRC = ROOT + "jacaranda_tree_1k.blend"
OUT = ROOT + "street_tree.blend"
CLUMPS = 9              # foliage clumps per tree (body of the canopy)
KEEP_LEAVES = 0.06      # real leaf cards kept around them (ragged, leafy outline) ...
LEAF_GROW = 2.2         # ... each grown this much
CLUMP_SHRINK = 0.75
BRANCH_RATIO = 0.05     # decimate twigs and branches
WIDTH = 6.5             # metres across the canopy at instance scale 1
HEIGHT = 10.0           # metres tall at instance scale 1 (scaled separately: a taller, narrower street tree)
CANOPY_BASE = 0.38      # share of the height kept clear under the canopy, so the trunk shows

with bpy.data.libraries.load(SRC) as (src, dst):
    dst.objects = ["jacaranda_tree_LOD1"]
tree = dst.objects[0]
me = tree.data.copy()
me.name = "Street Tree Mesh"
mat_kind = ["leaves" if "leaves" in m.name else "branches" if "branches" in m.name else "trunk" for m in me.materials]
li, bi, ti = mat_kind.index("leaves"), mat_kind.index("branches"), mat_kind.index("trunk")


def leaf_cards(bm):
    seen = set()
    for f in bm.faces:
        if f.index in seen or f.material_index != li:
            continue
        stack, part = [f], []
        seen.add(f.index)
        while stack:
            c = stack.pop()
            part.append(c)
            for e in c.edges:
                for g in e.link_faces:
                    if g.index not in seen and g.material_index == li:
                        seen.add(g.index)
                        stack.append(g)
        yield part


# The leaf cards are replaced by solid foliage clumps placed where the real leaves cluster (k-means):
# full, dark canopies that read at city scale, at a fraction of the weight.
rng = random.Random(3)
bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
leaf_pts, kill = [], []
for part in leaf_cards(bm):
    if rng.random() < 0.05:
        leaf_pts.append(part[0].calc_center_median().copy())
    if rng.random() > KEEP_LEAVES:
        kill.extend(part)
        continue
    vs = {v for p in part for v in p.verts}
    cen = sum((v.co for v in vs), Vector()) / len(vs)
    for v in vs:
        v.co = cen + (v.co - cen) * LEAF_GROW
bmesh.ops.delete(bm, geom=kill, context="FACES")
bm.to_mesh(me)
bm.free()

centres = rng.sample(leaf_pts, CLUMPS)
for _ in range(12):
    groups = [[] for _ in centres]
    for p in leaf_pts:
        groups[min(range(len(centres)), key=lambda k: (p - centres[k]).length_squared)].append(p)
    centres = [sum(g, Vector()) / len(g) if g else c for g, c in zip(groups, centres)]
base = min(p.z for p in leaf_pts) + CANOPY_BASE * (max(p.z for p in leaf_pts) - min(p.z for p in leaf_pts))
radii = [CLUMP_SHRINK * max(1.0, 1.15 * (sum((p - c).length for p in g) / len(g))) if g else 1.0 for g, c in zip(groups, centres)]


def only(mesh, keep):
    m = mesh.copy()
    b = bmesh.new()
    b.from_mesh(m)
    bmesh.ops.delete(b, geom=[f for f in b.faces if f.material_index not in keep], context="FACES")
    b.to_mesh(m)
    b.free()
    return m


trunk = only(me, {ti})
woody = only(me, {bi})
tmp = bpy.data.objects.new("tmp_woody", woody)
bpy.context.scene.collection.objects.link(tmp)
tmp.modifiers.new("dec", "DECIMATE").ratio = BRANCH_RATIO
woody_small = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
bpy.data.objects.remove(tmp, do_unlink=True)
leaves = only(me, {li})
bm = bmesh.new()
bm.from_mesh(leaves)
bm.from_mesh(woody_small)
bm.from_mesh(trunk)
bm.to_mesh(me)
bm.free()
for m in (trunk, woody, woody_small, leaves):
    bpy.data.meshes.remove(m)

from mathutils import noise
me.materials.append(me.materials[li])      # placeholder slot for the foliage material, set below
fi = len(me.materials) - 1
bm = bmesh.new()
bm.from_mesh(me)
for c, r in zip(centres, radii):
    c = Vector((c.x, c.y, max(c.z, base + r * 0.8)))   # clumps hang no lower than the canopy base
    geo = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r)
    for v in geo["verts"]:
        n = v.co.normalized()
        v.co = c + Vector((v.co.x, v.co.y, v.co.z * 0.8)) * (1 + 0.28 * noise.noise(n * 2.3 + c * 0.1))
        for f in v.link_faces:
            f.material_index = fi
            f.smooth = True
bm.to_mesh(me)
bm.free()

xs = [v.co.x for v in me.vertices]
ys = [v.co.y for v in me.vertices]
zs = [v.co.z for v in me.vertices]
cx, cy, z0 = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)
s = WIDTH / (max(xs) - min(xs))
sz = HEIGHT / (max(zs) - z0)
for v in me.vertices:
    v.co = Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - z0) * sz))

# Drop small woody pieces (twigs) hidden in the canopy; keep the trunk and main limbs
MIN_LIMB = 0.9   # metres, bounding-box diagonal at final scale
CANOPY_CUT = 0.5   # share of tree height above which wood is dropped
bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
seen, kill = set(), []
for f in bm.faces:
    if f.index in seen or f.material_index in (li, ti):
        continue
    stack, part = [f], []
    seen.add(f.index)
    while stack:
        c = stack.pop()
        part.append(c)
        for e in c.edges:
            for g in e.link_faces:
                if g.index not in seen and g.material_index not in (li, ti):
                    seen.add(g.index)
                    stack.append(g)
    vs = [v.co for p in part for v in p.verts]
    lo = Vector((min(c.x for c in vs), min(c.y for c in vs), min(c.z for c in vs)))
    hi = Vector((max(c.x for c in vs), max(c.y for c in vs), max(c.z for c in vs)))
    if (hi - lo).length < MIN_LIMB:
        kill.extend(part)
top = max(v.co.z for v in bm.verts)
for f in bm.faces:   # wood high inside the canopy is never seen; leaves cover it
    if f.material_index == bi and f.calc_center_median().z > CANOPY_CUT * top:
        kill.append(f)
kill = list(set(kill))
bmesh.ops.delete(bm, geom=kill, context="FACES")
bm.to_mesh(me)
bm.free()

# Dark, low-sheen materials: every colour texture is desaturated and darkened; alpha (leaf cut-outs) untouched
for i, m in enumerate(list(me.materials)[:len(mat_kind)]):
    d = m.copy()
    d.name = "Street Tree " + mat_kind[i]
    nt = d.node_tree
    for tex in [n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and n.image.colorspace_settings.name == "sRGB"]:
        outs = list(tex.outputs["Color"].links)
        if not outs:
            continue
        dark = nt.nodes.new("ShaderNodeHueSaturation")
        dark.inputs["Saturation"].default_value = 0.6
        dark.inputs["Value"].default_value = 1.1
        nt.links.new(tex.outputs["Color"], dark.inputs["Color"])
        for l in outs:
            nt.links.new(dark.outputs["Color"], l.to_socket)
    me.materials[i] = d

fol = bpy.data.materials.new("Street Tree foliage")
fol.use_nodes = True
fn, fl = fol.node_tree.nodes, fol.node_tree.links
fb = next(n for n in fn if n.type == "BSDF_PRINCIPLED")
fb.inputs["Base Color"].default_value = (0.026, 0.032, 0.028, 1)
fb.inputs["Roughness"].default_value = 0.9
leafy = fn.new("ShaderNodeTexVoronoi")
leafy.inputs["Scale"].default_value = 9.0
tone = fn.new("ShaderNodeTexNoise")
tone.inputs["Scale"].default_value = 2.5
bump = fn.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.9
fl.new(leafy.outputs["Distance"], bump.inputs["Height"])
fl.new(bump.outputs["Normal"], fb.inputs["Normal"])
ramp = fn.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.03, 0.045, 0.032, 1)
ramp.color_ramp.elements[1].color = (0.09, 0.12, 0.085, 1)
fl.new(tone.outputs["Fac"], ramp.inputs["Fac"])
fl.new(ramp.outputs["Color"], fb.inputs["Base Color"])
me.materials[fi] = fol

old = bpy.data.objects.get("Street Tree")
if old:
    bpy.data.objects.remove(old, do_unlink=True)
tpl = bpy.data.objects.new("Street Tree", me)
lib = bpy.data.collections.get("Tree Library") or bpy.data.collections.new("Tree Library")
if lib.name not in bpy.context.scene.collection.children:
    bpy.context.scene.collection.children.link(lib)
lib.objects.link(tpl)
bpy.data.objects.remove(tree, do_unlink=True)
for img in {n.image for m in me.materials for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image}:
    img.pack()
bpy.data.libraries.write(OUT, {tpl}, path_remap="RELATIVE_ALL", fake_user=True)
print("Street Tree:", len(me.polygons), "faces ->", OUT, os.path.getsize(OUT) // 1024, "KB")
