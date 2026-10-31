# Photoreal stills for /explore. Imports the site's data-center model (tools/explore/datacenter.glb, exported from
# views/data-center/dc-model.js by views/explore/_tool.html?export=1), re-lights it in Cycles and renders the cameras in
# views/explore/views.json, so the stills line up exactly with the live three.js scene.
#   blender -b --factory-startup --python tools/explore_render.py -- --only tower [--res 100] [--samples 128]
# One view per run is safest on a 4 GB GPU (tools/explore_render_all.sh does that). Writes views/explore/img/<view>.png.
#  - exterior (tower): golden hour, champagne-metal facade with reflective glass, marina, boats, palms, stone promenade
#  - interiors: only the shot's level (and the slab above it) is kept; visible ceiling light panels, glossy floors
import bpy, bmesh, sys, json, math, os, random
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
arg = lambda k, d: argv[argv.index(k) + 1] if k in argv else d
RES, SAMPLES, ONLY = int(arg("--res", 100)), int(arg("--samples", 128)), arg("--only", "tower")
ROOT = r"D:/Surds_Website"
OUT = f"{ROOT}/views/explore/img"; os.makedirs(OUT, exist_ok=True)
VIEWS = json.load(open(f"{ROOT}/views/explore/views.json", encoding="utf-8"))
H = 8.4
KEYS = [l["key"] for l in VIEWS["levels"]]
JOBS = [("tower", VIEWS["tower"], None)] + [(f"{lv['key']}-{s['id']}", s, lv["key"]) for lv in VIEWS["levels"] for s in lv["spots"]]
want = set(x.replace("/", "-") for x in ONLY.split(",") if x)
JOBS = [j for j in JOBS if j[0] in want]
EXTERIOR = any(j[2] in (None, "roof") for j in JOBS)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=f"{ROOT}/tools/explore/datacenter.glb")
T = lambda p: Vector((p[0], -p[2], p[1]))            # three.js (Y up) -> Blender (Z up), as the glTF importer does
rnd = random.Random(5)

# keep only what the shots need (memory): an interior needs its own level plus the next one up (its ceiling slab)
if not EXTERIOR:
    keep = set()
    for _, _, lk in JOBS:
        i = KEYS.index(lk); keep |= {KEYS[i]} | ({KEYS[i + 1]} if i + 1 < len(KEYS) else set())
    for lv in [o for o in bpy.data.objects if o.name.split(".")[0] in KEYS and o.name.split(".")[0] not in keep]:
        for c in list(lv.children_recursive) + [lv]: bpy.data.objects.remove(c, do_unlink=True)

def bsdf(m): return next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m and m.use_nodes else None
def setin(b, k, v):
    if b and k in b.inputs: b.inputs[k].default_value = v
def mat(name, col, rough, metal=0.0, emit=None, es=0.0, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = bsdf(m)
    setin(b, "Base Color", (*col, 1)); setin(b, "Roughness", rough); setin(b, "Metallic", metal); setin(b, "Coat Weight", coat)
    if emit: setin(b, "Emission Color", (*emit, 1)); setin(b, "Emission Strength", es)
    return m

# ------------------------------------------------------------ materials: tune by name (named in dc-model.js)
for m in list(bpy.data.materials):
    b = bsdf(m)
    if not b: continue
    n = m.name.split(".")[0]
    if n == "window":                  # glass that shows lit rooms and reflects the sky
        setin(b, "Emission Strength", 7.0 if EXTERIOR else 1.0); setin(b, "Roughness", 0.04); setin(b, "Specular IOR Level", 1.0)
        setin(b, "Coat Weight", 1.0); setin(b, "Coat Roughness", 0.02)
    elif n == "pier":                  # pale champagne metal, like the reel's facade
        setin(b, "Base Color", (0.52, 0.47, 0.40, 1)); setin(b, "Metallic", 0.85); setin(b, "Roughness", 0.3)
    elif n in ("glass", "wrap"):
        setin(b, "Roughness", 0.02); setin(b, "Transmission Weight", 0.92)
    elif n in ("light", "lamp"):
        setin(b, "Emission Strength", 9.0)
    elif n == "video" or n.startswith("screens") or n.startswith("signs"):
        setin(b, "Emission Strength", 2.0)
    elif n in ("sensor", "ring"):
        setin(b, "Emission Strength", 10.0)
    elif n == "fluid":
        setin(b, "Emission Strength", 1.4)
    elif n in ("tile", "perf", "epoxy", "epoxyLight", "lobby"):     # polished floors catch the lights
        setin(b, "Roughness", 0.22); setin(b, "Coat Weight", 0.5); setin(b, "Coat Roughness", 0.08)
    elif n in ("wallLight", "liner"):
        setin(b, "Roughness", 0.65)
    elif n in ("rackSide", "rackTop") or n.startswith("front"):
        setin(b, "Roughness", 0.32); setin(b, "Metallic", 0.55)
    elif n in ("metal", "metalDark", "frame", "white", "grey"):
        setin(b, "Roughness", max(0.2, b.inputs["Roughness"].default_value * 0.8))
    if m.blend_method != "OPAQUE" and n not in ("glass", "wrap", "mesh", "ring", "fluid"):
        m.blend_method = "OPAQUE"     # fade-able in the browser; solid here

# ------------------------------------------------------------ world: golden hour
w = bpy.data.worlds.new("Sky"); w.use_nodes = True; sc.world = w
nt = w.node_tree; nt.nodes.clear()
sky = nt.nodes.new("ShaderNodeTexSky")
SUN_EL, SUN_ROT = math.radians(5.0), math.radians(135)
for k, v in (("sky_type", "NISHITA"), ("sun_elevation", SUN_EL), ("sun_rotation", SUN_ROT), ("altitude", 40.0), ("air_density", 0.8), ("dust_density", 0.6), ("ozone_density", 3.0), ("sun_disc", False)):
    try: setattr(sky, k, v)
    except Exception: pass
bg = nt.nodes.new("ShaderNodeBackground"); bg.inputs["Strength"].default_value = 0.16 if EXTERIOR else 0.15
out = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(sky.outputs[0], bg.inputs[0]); nt.links.new(bg.outputs[0], out.inputs[0])
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")); sc.collection.objects.link(sun)
sun.data.energy = 5.5; sun.data.color = (1.0, 0.58, 0.32); sun.data.angle = math.radians(0.8)
d_ = Vector((-1.0, 0.55, -0.12)).normalized()            # low sun from camera-right: rakes warm light across both visible faces
sun.rotation_euler = (-d_).to_track_quat("Z", "Y").to_euler()

# ------------------------------------------------------------ exterior context
if EXTERIOR:
    stone = mat("stone", (0.46, 0.43, 0.38), 0.55)
    tile_n = stone.node_tree; tb = bsdf(stone)                     # paving joints
    br = tile_n.nodes.new("ShaderNodeTexBrick"); br.inputs["Scale"].default_value = 0.6; br.inputs["Mortar Size"].default_value = 0.01
    br.inputs["Color1"].default_value = (0.48, 0.45, 0.4, 1); br.inputs["Color2"].default_value = (0.42, 0.39, 0.34, 1); br.inputs["Mortar"].default_value = (0.25, 0.23, 0.2, 1)
    g_ = tile_n.nodes.new("ShaderNodeNewGeometry"); tile_n.links.new(g_.outputs["Position"], br.inputs["Vector"]); tile_n.links.new(br.outputs["Color"], tb.inputs["Base Color"])
    bpy.ops.mesh.primitive_plane_add(size=1, location=(10, 6, -0.52)); o = bpy.context.object; o.scale = (180, 110, 1); o.data.materials.append(stone)
    # marina: calm water in the foreground, a stone quay edge, a far shore
    water = mat("water", (0.02, 0.06, 0.09), 0.02, coat=0.0)
    wn = water.node_tree; wb = bsdf(water); setin(wb, "Specular IOR Level", 1.0)
    nz = wn.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 0.6; nz.inputs["Detail"].default_value = 6
    bm_ = wn.nodes.new("ShaderNodeBump"); bm_.inputs["Strength"].default_value = 0.08; wn.links.new(nz.outputs["Fac"], bm_.inputs["Height"]); wn.links.new(bm_.outputs[0], wb.inputs["Normal"])
    bpy.ops.mesh.primitive_plane_add(size=1, location=(60, -150, -1.6)); o = bpy.context.object; o.scale = (700, 200, 1); o.data.materials.append(water)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(160, 200, -1.6)); o = bpy.context.object; o.scale = (600, 300, 1); o.data.materials.append(water)
    quay = mat("quay", (0.55, 0.52, 0.46), 0.6)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(10, -49.5, -1.0)); o = bpy.context.object; o.scale = (180, 1.2, 1.2); o.data.materials.append(quay)
    # pontoons and boats
    hull_m = mat("hull", (0.92, 0.92, 0.9), 0.18, coat=0.8); deck_m = mat("deck", (0.55, 0.42, 0.3), 0.5); glass_m = mat("cabin_glass", (0.03, 0.04, 0.05), 0.05, coat=1.0)
    for px in (20, 48, 76):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(px, -64, -1.35)); o = bpy.context.object; o.scale = (2.2, 28, 0.4); o.data.materials.append(deck_m)
        for k in range(4):
            for side in (-1, 1):
                if rnd.random() < 0.25: continue
                L = rnd.uniform(10, 16); x0, y0 = px + side * (2.2 + 2.6), -54 - k * 7.5
                bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1, location=(x0, y0, -1.5)); o = bpy.context.object
                o.scale = (2.4, L / 2, 1.1); o.data.materials.append(hull_m)
                bpy.ops.mesh.primitive_cube_add(size=1, location=(x0, y0 + 0.5, -0.2)); o = bpy.context.object; o.scale = (3.2, L * 0.38, 1.3); o.data.materials.append(hull_m)
                bpy.ops.mesh.primitive_cube_add(size=1, location=(x0, y0 + 0.5 - L * 0.12, -0.15)); o = bpy.context.object; o.scale = (3.25, L * 0.12, 0.7); o.data.materials.append(glass_m)
    # palms along the quay and around the building
    trunk_m = mat("palm_trunk", (0.32, 0.25, 0.18), 0.85)
    frond_m = mat("palm_frond", (0.10, 0.20, 0.06), 0.55); fb = bsdf(frond_m); setin(fb, "Subsurface Weight", 0.15)
    def palm(x, y, h):
        bm = bmesh.new(); lean = Vector((rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12)))
        rings, seg = 10, 10
        for r in range(rings + 1):
            t = r / rings; c = Vector((x + lean.x * h * t * t, y + lean.y * h * t * t, -0.5 + h * t)); rad = 0.32 - 0.12 * t
            ring = [bm.verts.new(c + Vector((rad * math.cos(2 * math.pi * s / seg), rad * math.sin(2 * math.pi * s / seg), 0))) for s in range(seg)]
            if r: [bm.faces.new((prev[s], prev[(s + 1) % seg], ring[(s + 1) % seg], ring[s])) for s in range(seg)]
            prev = ring
        me = bpy.data.meshes.new("trunk"); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new("palm_trunk", me); me.materials.append(trunk_m); sc.collection.objects.link(o)
        top = Vector((x + lean.x * h, y + lean.y * h, -0.5 + h))
        bm = bmesh.new()
        for f in range(11):
            a = 2 * math.pi * f / 11 + rnd.uniform(-0.15, 0.15); L = rnd.uniform(3.2, 4.4); droop = rnd.uniform(0.9, 1.5)
            d = Vector((math.cos(a), math.sin(a), 0)); side_ = Vector((-math.sin(a), math.cos(a), 0)); pts = []
            for s in range(9):
                t = s / 8; p = top + d * (L * t) + Vector((0, 0, 0.9 * t - droop * t * t * 1.6)); wdt = 0.55 * math.sin(math.pi * min(1, t * 1.1))
                pts.append((bm.verts.new(p - side_ * wdt + Vector((0, 0, 0.12 * wdt))), bm.verts.new(p + side_ * wdt + Vector((0, 0, 0.12 * wdt)))))
            for s in range(8): bm.faces.new((pts[s][0], pts[s][1], pts[s + 1][1], pts[s + 1][0]))
        me = bpy.data.meshes.new("crown"); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new("palm_crown", me); me.materials.append(frond_m); sc.collection.objects.link(o)
    for x in list(range(-90, -30, 10)) + list(range(72, 140, 10)): palm(x + rnd.uniform(-1, 1), -45.5, rnd.uniform(6, 8))   # keep the building clear
    for y in range(-10, 30, 9): palm(-36, y + rnd.uniform(-1, 1), rnd.uniform(5.5, 7))
    # low warm bollard lights along the promenade
    bol = mat("bollard", (1, 0.85, 0.6), 0.4, emit=(1, 0.8, 0.55), es=12)
    for x in list(range(-90, -30, 12)) + list(range(72, 140, 12)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=0.9, location=(x + 4.5, -43.5, -0.05)); bpy.context.object.data.materials.append(bol)
    # distant coastline: hazy blue-grey towers, they sit in the sky's colour
    land = mat("land", (0.05, 0.055, 0.06), 0.8)                  # ground out to the horizon, so far towers stand on something
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -1.7)); o = bpy.context.object; o.scale = (3000, 3000, 1); o.data.materials.append(land)
    haze = mat("haze_city", (0.07, 0.10, 0.16), 0.9); setin(bsdf(haze), "Specular IOR Level", 0.1)
    for k in range(60):
        a = rnd.uniform(math.radians(40), math.radians(330)); r = rnd.uniform(300, 650); x, y = r * math.cos(a), r * math.sin(a) + 120
        if y < -80: continue
        h = rnd.uniform(14, 95); bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, h / 2 - 1.6)); o = bpy.context.object
        o.scale = (rnd.uniform(14, 30), rnd.uniform(14, 30), h); o.data.materials.append(haze)

# ------------------------------------------------------------ interiors: visible ceiling light panels + area lights
panel = mat("ceiling_panel", (1, 1, 1), 0.4, emit=(1.0, 0.97, 0.92), es=7.0)
for _, _, lk in JOBS:
    if lk in (None, "roof"): continue
    i = KEYS.index(lk)
    for x in range(-18, 19, 6):
        for z in range(-11, 12, 5):
            c = T((x, i * H + H - 0.62, z))
            bpy.ops.mesh.primitive_plane_add(size=1, location=c); o = bpy.context.object; o.scale = (2.4, 0.5, 1); o.rotation_euler = (math.pi, 0, 0)
            o.data.materials.append(panel); o.visible_shadow = False
            L = bpy.data.lights.new(f"ceil{i}_{x}_{z}", "AREA"); L.shape = "RECTANGLE"; L.size, L.size_y = 2.4, 0.5
            L.energy = 230; L.color = (1.0, 0.96, 0.9)
            lo = bpy.data.objects.new(L.name, L); lo.location = c - Vector((0, 0, 0.03)); sc.collection.objects.link(lo)

# ------------------------------------------------------------ render settings
sc.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for dt in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = dt; prefs.get_devices()
            if any(d.type == dt for d in prefs.devices): break
        except Exception: pass
    for d in prefs.devices: d.use = d.type != "CPU"
    sc.cycles.device = "GPU"
except Exception as e: print("GPU setup failed:", e)
sc.cycles.samples = SAMPLES; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.02
sc.cycles.use_denoising = True
try: sc.cycles.denoiser = "OPENIMAGEDENOISE"      # CPU denoise keeps the 4 GB GPU free for the scene
except Exception: pass
sc.cycles.use_auto_tile = True; sc.cycles.tile_size = 512
sc.cycles.max_bounces = 7; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 4; sc.cycles.transmission_bounces = 4
sc.cycles.light_sampling_threshold = 0.01
sc.view_settings.view_transform = "AgX"
try: sc.view_settings.look = "AgX - Medium High Contrast"
except Exception: pass
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 1080, RES
sc.render.image_settings.file_format = "PNG"

cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.sensor_fit = "VERTICAL"; cam.data.clip_start = 0.05; cam.data.clip_end = 4000
for name, v, lk in JOBS:
    p, l = T(v["pos"]), T(v["look"])
    cam.location = p; cam.rotation_euler = (l - p).to_track_quat("-Z", "Y").to_euler()
    cam.data.angle = math.radians(v["fov"])
    sc.view_settings.exposure = -0.6 if lk is None else (0.1 if lk == "roof" else -0.15)
    sc.render.filepath = f"{OUT}/{name}.png"; bpy.ops.render.render(write_still=True); print("SHOT", name)
print("DONE")
