# Build-up animation for the SURDS city. Runs in the same namespace right after
# surds_city.py (uses GROUPS, LINKS, NODES, HUB_NODE, TREES, POWER_LINES, helpers).
import bpy, math, random

F_END = 230          # ~7.7 s at 30 fps; the last 24 frames hold on the finished city
NET_START = 160      # amber network starts drawing once everything is built
EPS = 0.001
rng = random.Random(11)

scene.frame_start, scene.frame_end = 1, F_END
scene.render.fps = 30

M_crane = mat("Crane", (0, 0, 0), 1, emit=(0.85, 0.88, 0.95), strength=0.9)
M_beacon = mat("Crane Beacon", (0, 0, 0), 1, emit=(1.0, 0.25, 0.1), strength=40)


def key(o, attr, idx, frame, value):
    getattr(o, attr)[idx] = value
    o.keyframe_insert(attr, index=idx, frame=frame)


def grow_z(o, f0, f1):
    final = o.scale.z
    key(o, "scale", 2, f0, EPS)
    key(o, "scale", 2, f1, final)


def pop(o, f0, f1):
    for i in range(3):
        key(o, "scale", i, f0, EPS)
        key(o, "scale", i, f1, 1.0)


def shown(o, spans):
    for frame, on in spans:
        o.hide_render = not on
        o.keyframe_insert("hide_render", frame=frame)
        o.hide_viewport = not on
        o.keyframe_insert("hide_viewport", frame=frame)


def parent_keep(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def crane(name, x, y, h, jib=11.0):
    """Lattice tower crane: mast object with the jib (and cable, hook, beacon) as rotating children."""
    mast_bm = cube_bm(0.9, 0.9, h)
    cut(mast_bm, 2, frange(1.2, h, 1.2))
    mast = mesh_obj(name + " Mast", mast_bm, M_crane, (x, y, Z0))
    mast.modifiers.new("Wire", "WIREFRAME").thickness = 0.06

    jb = cube_bm(jib + 4.5, 0.7, 0.7, off=(jib / 2 - 2.25, 0, 0))
    cut(jb, 0, frange(-4.5, jib, 1.1))
    cube_bm(1.4, 1.1, 0.9, jb, off=(-3.6, 0, -0.9))          # counterweight
    cube_bm(0.35, 0.35, 2.6, jb, off=(0, 0, 0.7))            # peak
    jib_o = mesh_obj(name + " Jib", jb, M_crane, (x, y, Z0 + h))
    jib_o.modifiers.new("Wire", "WIREFRAME").thickness = 0.05

    drop = h * 0.55
    cb = cube_bm(0.05, 0.05, drop, off=(jib * 0.7, 0, -drop))
    cube_bm(0.6, 0.6, 0.5, cb, off=(jib * 0.7, 0, -drop - 0.5))
    cable = mesh_obj(name + " Cable", cb, M_crane, (x, y, Z0 + h))

    bb = bmesh.new()
    bmesh.ops.create_uvsphere(bb, u_segments=8, v_segments=4, radius=0.22)
    beacon = mesh_obj(name + " Beacon", bb, M_beacon, (x, y, Z0 + h + 3.4))

    bpy.context.view_layer.update()
    parent_keep(jib_o, mast)
    for c in (cable, beacon):
        parent_keep(c, jib_o)
    return mast, jib_o, (cable, beacon)


bpy.context.view_layer.update()

# ---------------------------------------------------------------- schedule
HERO_START = {"Power Plant": 16, "Commercial Tower": 18, "Data Center": 28,
              "Clean Room Lab": 36, "Hospital": 44, "Office Block": 54}
for g in GROUPS:
    if g["name"] in HERO_START:
        start = HERO_START[g["name"]]
    elif g["kind"] == "stack":
        start = 42 + int(g["name"][-1]) * 5
    elif g["kind"] == "substation":
        start = rng.uniform(70, 100)
    else:
        start = rng.uniform(6, 100)
    g["start"] = int(start)
    g["end"] = int(start + 12 + g["h"] * 1.6)

# ---------------------------------------------------------------- buildings rise: edge cage first, walls follow
for g in GROUPS:
    f0, f1 = g["start"], g["end"]
    for part in g["attach"]:
        parent_keep(part, g["solid"])
    for e in g["edges"]:
        grow_z(e, f0, f1)
    grow_z(g["solid"], f0 + 4, f1 + 4)

# ---------------------------------------------------------------- cranes on the hero sites and a few tall fillers
fillers = [g for g in GROUPS if g["kind"] == "building" and not g["hero"] and g["h"] >= 10.8 and g["start"] >= 14]
rng.shuffle(fillers)
for g in [g for g in GROUPS if g["hero"]] + fillers[:6]:
    cx, cy = g["x"] - g["w"] / 2 - 1.6, g["y"] + g["d"] / 2 + 1.6     # back-left corner, away from camera
    ch = g["h"] + 7
    mast, jib_o, _ = crane(f"Crane {g['name']}", cx, cy, ch, jib=max(8.0, min(13.0, g["w"] + 2)))
    aim = math.atan2(g["y"] - cy, g["x"] - cx)
    up0, up1 = g["start"] - 12, g["start"]
    down0, down1 = g["end"] + 5, g["end"] + 16
    shown(mast, [(1, False), (up0, True), (down1, False)])
    for c in [jib_o] + list(jib_o.children):
        shown(c, [(1, False), (up0, True), (down1, False)])
    # telescope up out of the ground (the opaque ground plane hides what's below) and back down
    sunk = Z0 - ch - 4.5
    for f, z in [(up0, sunk), (up1, Z0), (down0, Z0), (down1, sunk)]:
        key(mast, "location", 2, f, z)
    mid = (g["start"] + g["end"]) // 2
    for f, a in [(up1, aim - 0.7), (mid, aim + 0.45), (g["end"], aim - 0.15)]:
        key(jib_o, "rotation_euler", 2, f, a)

# ---------------------------------------------------------------- trees and power lines
grow_z(TREES, 120, 150)
grow_z(STREET_LIGHTS, 128, 150)
for pl in POWER_LINES:
    pl.data.bevel_factor_mapping_end = "SPLINE"
    pl.data.bevel_factor_end = 0.0
    pl.data.keyframe_insert("bevel_factor_end", frame=110)
    pl.data.bevel_factor_end = 1.0
    pl.data.keyframe_insert("bevel_factor_end", frame=128)

# ---------------------------------------------------------------- SURDS network draws out from the hub
pop(HUB_NODE, NET_START - 8, NET_START)
route_end = {}
for i, link in enumerate(LINKS):
    f0 = NET_START + i * 4
    f1 = f0 + 22
    route_end[i] = f1
    link.data.bevel_factor_mapping_end = "SPLINE"
    link.data.bevel_factor_end = 0.0
    link.data.keyframe_insert("bevel_factor_end", frame=f0)
    link.data.bevel_factor_end = 1.0
    link.data.keyframe_insert("bevel_factor_end", frame=f1)
for n, i in NODES:
    pop(n, route_end[i] - 6, route_end[i])

# ---------------------------------------------------------------- slow push-in
final = target + d * (CAM_DIST * 1.12)               # slow dolly in along the view line, stopping short of the
                                                     # framing distance so the tower and corners stay in shot
cam.location = target + d * (CAM_DIST * 1.25)
cam.keyframe_insert("location", frame=1)
cam.location = final
cam.keyframe_insert("location", frame=F_END - 24)

scene.frame_set(F_END)
print("groups:", len(GROUPS), "| cranes:", len([o for o in col.objects if o.name.endswith(" Mast")]),
      "| last building done:", max(g["end"] + 6 for g in GROUPS))
