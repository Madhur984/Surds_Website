# Exports the SURDS city's plan-view geometry (world XY, metres) to JSON for plan_sheet.py.
# Run in Blender after surds_city.py:  exec(open(".../export_plan.py").read())
import bpy, bmesh, json
from mathutils import Vector

OUT = globals().get("PLAN_JSON", "/home/boom/SURDS_docs/website/tools/blender/plan-data.json")
scene = bpy.context.scene
scene.frame_set(scene.frame_end)   # everything built and in place
dg = bpy.context.evaluated_depsgraph_get()


def islands(name):
    """Axis-aligned XY boxes [x0, y0, x1, y1] of each connected part of a mesh object."""
    o = bpy.data.objects[name]
    bm = bmesh.new()
    bm.from_mesh(o.evaluated_get(dg).to_mesh())
    bm.transform(o.matrix_world)
    seen, out = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, part = [v], []
        seen.add(v.index)
        while stack:
            c = stack.pop()
            part.append(c.co.copy())
            for e in c.link_edges:
                w = e.other_vert(c)
                if w.index not in seen:
                    seen.add(w.index)
                    stack.append(w)
        out.append([round(min(p.x for p in part), 3), round(min(p.y for p in part), 3),
                    round(max(p.x for p in part), 3), round(max(p.y for p in part), 3)])
    bm.free()
    return out


def bbox(o):
    ps = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return [round(min(p.x for p in ps), 3), round(min(p.y for p in ps), 3),
            round(max(p.x for p in ps), 3), round(max(p.y for p in ps), 3), round(max(p.z for p in ps), 2)]


def curve_pts(o):
    pts = []
    for sp in o.data.splines:
        for p in (sp.bezier_points if sp.type == "BEZIER" else sp.points):
            w = o.matrix_world @ Vector(p.co[:3])
            pts.append([round(w.x, 3), round(w.y, 3)])
    return pts


outlined = bpy.data.collections["SURDS Outlined"].objects
quiet = bpy.data.collections["SURDS Outlined Quiet"].objects
SUFFIX = (" Details", " Roof", " Cooling Towers", " Chillers")
buildings = []
for o in list(outlined) + list(quiet):
    if o.type != "MESH" or o.name.endswith(SUFFIX) or o.name.startswith(("Pylon", "Stack", "Transformer")):
        continue
    buildings.append(dict(name=o.name, box=bbox(o), filler=o.name in quiet))

data = dict(
    ground=bbox(bpy.data.objects["Ground"])[:4],
    blocks=islands("City Blocks"),
    roads=islands("Roads"),
    expressway=bbox(bpy.data.objects["Expressway"])[:4],
    kerbs=islands("Expressway Kerbs"),
    buildings=buildings,
    cooling=[b for n in ("Cooling Plant A Cooling Towers", "Cooling Plant B Cooling Towers") for b in islands(n)],
    stacks=[bbox(bpy.data.objects[f"Stack {k}"])[:4] for k in range(1, 6) if f"Stack {k}" in bpy.data.objects],
    transformers=[bbox(o)[:4] for o in bpy.data.objects if o.name.startswith("Transformer") and not o.name.endswith("Edges")],
    pylons=[bbox(o)[:4] for o in bpy.data.objects if o.name.startswith("Pylon ")],
    substation=bbox(bpy.data.objects["Substation Pad"])[:4],
    power_lines=[curve_pts(o) for o in bpy.data.objects if o.name.startswith("Power Line") and o.type == "CURVE"],
    links=[dict(name=o.name[5:], pts=curve_pts(o)) for o in bpy.data.objects if o.name.startswith("Link ")],
    hub=[round(v, 3) for v in bpy.data.objects["Hub"].matrix_world.translation[:2]],
    trees=[[round(v.co.x, 2), round(v.co.y, 2)] for v in bpy.data.objects["Trees"].data.vertices],
)
with open(OUT, "w") as f:
    json.dump(data, f)
print(OUT, {k: len(v) for k, v in data.items() if isinstance(v, list)})
