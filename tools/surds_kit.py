# Shared SURDS scene kit: materials, mesh helpers and the building library.
# Imported by tools/surds_scene.py-style scripts after the scene has been reset.
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
sc = bpy.context.scene
rng = random.Random(7)

# ============================================================== materials
def mat(name, base, rough=0.7, metal=0.0, emit=None, strength=0.0, spec=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*base, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if "Specular IOR Level" in b.inputs: b.inputs["Specular IOR Level"].default_value = spec
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = strength
    return m
WARM, COOL = (1.0, 0.62, 0.34), (0.82, 0.9, 1.0)
ORANGE = (1.0, 0.42, 0.1)
M = {
    "concrete": mat("concrete", (0.32, 0.32, 0.33), 0.8),
    "concrete2": mat("concrete2", (0.22, 0.22, 0.23), 0.8),
    "panel":    mat("panel", (0.4, 0.4, 0.42), 0.5, 0.3),
    "frame":    mat("frame", (0.8, 0.81, 0.84), 0.3, 0.5),       # the white structural frames / mullions
    "glass":    mat("glass", (0.012, 0.014, 0.018), 0.08, 0.8, spec=1.0),
    "glass2":   mat("glass2", (0.03, 0.035, 0.045), 0.15, 0.6, spec=0.9),
    "lit":      mat("lit", WARM, emit=WARM, strength=3.2),
    "litdim":   mat("litdim", WARM, emit=WARM, strength=0.9),
    "litcool":  mat("litcool", COOL, emit=COOL, strength=2.6),
    "metal":    mat("metal", (0.42, 0.43, 0.45), 0.35, 0.8),
    "dark":     mat("dark", (0.05, 0.05, 0.055), 0.6, 0.4),
    "roof":     mat("roof", (0.24, 0.24, 0.25), 0.85),
    "asphalt":  mat("asphalt", (0.022, 0.023, 0.026), 0.6, spec=0.6),
    "paint":    mat("paint", (0.55, 0.56, 0.58), 0.6),
    "walk":     mat("walk", (0.075, 0.075, 0.08), 0.85),
    "plot":     mat("plot", (0.045, 0.046, 0.05), 0.9),
    "grass":    mat("grass", (0.018, 0.024, 0.02), 0.95),
    "tree":     mat("tree", (0.03, 0.042, 0.035), 0.9),
    "trunk":    mat("trunk", (0.04, 0.035, 0.03), 0.9),
    "lamp":     mat("lamp", WARM, emit=(1.0, 0.75, 0.5), strength=6.0),
    "cross":    mat("cross", (1, 1, 1), emit=(1.0, 0.98, 0.95), strength=12.0),
    "net":      mat("net", ORANGE, emit=ORANGE, strength=10.0),
    "netdim":   mat("netdim", ORANGE, emit=ORANGE, strength=3.0),
    "hub":      mat("hub", (1, 0.6, 0.3), emit=(1.0, 0.55, 0.22), strength=60.0),
    "head":     mat("head", (1, 1, 1), emit=(1.0, 0.95, 0.85), strength=20.0),
    "tail":     mat("tail", (1, 0.1, 0.05), emit=(1.0, 0.05, 0.02), strength=10.0),
    "car":      mat("car", (0.06, 0.065, 0.07), 0.25, 0.7),
    "wire":     mat("wire", (0.3, 0.3, 0.32), 0.5, 0.8),
    "red":      mat("red", (1, 0.1, 0.05), emit=(1.0, 0.06, 0.03), strength=20.0),
}

# ============================================================== material detail: weathering, interiors, contact shadow
class _G:
    """Tiny node-graph builder: math on sockets without the boilerplate."""
    def __init__(self, m): self.N, self.L = m.node_tree.nodes, m.node_tree.links
    def node(self, t, **inp):
        n = self.N.new(t)
        for k, v in inp.items():
            s = n.inputs[k] if not isinstance(k, int) else n.inputs[k]
            if hasattr(v, "is_output"): self.L.new(v, s)
            else: s.default_value = v
        return n
    def math(self, op, a, b=0.0, clamp=False):
        n = self.N.new("ShaderNodeMath"); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if hasattr(v, "is_output"): self.L.new(v, n.inputs[i])
            else: n.inputs[i].default_value = v
        return n.outputs[0]
    def mix(self, fac, a, b, blend="MIX"):
        n = self.N.new("ShaderNodeMix"); n.data_type = "RGBA"; n.blend_type = blend
        for s, v in ((n.inputs["Factor"], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if hasattr(v, "is_output"): self.L.new(v, s)
            else: s.default_value = v
        return n.outputs[2]
    def link(self, a, b): self.L.new(a, b)

def _rgba(c): return (*c, 1) if len(c) == 3 else c

def weather(name, base, dirt=0.35, streak=0.3, bump=0.12, scale=0.9, ao=True):
    """Walls/roofs/roads: large blotchy variation, vertical rain streaks, fine bump and
       an ambient-occlusion darkening in corners and along the ground line."""
    m = M[name]; g = _G(m); b = next(n for n in g.N if n.type == "BSDF_PRINCIPLED")
    pos = g.node("ShaderNodeNewGeometry").outputs["Position"]
    blot = g.node("ShaderNodeTexNoise", Vector=pos, Scale=scale * 0.12, Detail=6.0, Roughness=0.6).outputs["Fac"]
    smap = g.node("ShaderNodeMapping", Vector=pos); smap.inputs["Scale"].default_value = (1.6, 1.6, 0.07)
    strk = g.node("ShaderNodeTexNoise", Vector=smap.outputs[0], Scale=2.2, Detail=3.0).outputs["Fac"]
    fine = g.node("ShaderNodeTexNoise", Vector=pos, Scale=scale * 6.0, Detail=8.0, Roughness=0.7).outputs["Fac"]
    v = g.math("ADD", g.math("MULTIPLY", g.math("SUBTRACT", blot, 0.5), dirt * 2), 1.0)          # 1 +- dirt
    v = g.math("MULTIPLY", v, g.math("SUBTRACT", 1.0, g.math("MULTIPLY", g.math("MAXIMUM", g.math("SUBTRACT", strk, 0.55), 0.0), streak * 4)))
    v = g.math("MULTIPLY", v, g.math("ADD", 0.9, g.math("MULTIPLY", fine, 0.2)))
    col = g.node("ShaderNodeCombineColor"); [g.link(v, col.inputs[i]) for i in range(3)]
    bn = g.node("ShaderNodeRGB"); bn.name = "BASE"; bn.outputs[0].default_value = _rgba(base)
    tint = g.mix(1.0, bn.outputs[0], col.outputs[0], "MULTIPLY")
    if ao:
        occ = g.node("ShaderNodeAmbientOcclusion", Distance=2.5); occ.samples = 8
        g.link(tint, occ.inputs["Color"])
        tint = g.mix(g.math("SUBTRACT", 1.0, occ.outputs["AO"]), tint, g.mix(1.0, tint, (0.35, 0.35, 0.35, 1), "MULTIPLY"))
    g.link(tint, b.inputs["Base Color"])
    g.link(g.math("ADD", b.inputs["Roughness"].default_value - 0.1, g.math("MULTIPLY", blot, 0.25)), b.inputs["Roughness"])
    bmp = g.node("ShaderNodeBump", Strength=bump, Distance=0.05, Height=fine); g.link(bmp.outputs[0], b.inputs["Normal"])

def interior(name, col, cool_share=0.15):
    """Lit window pane with a room behind it. Every pane carries UVs (0..1) and a per-pane random 'wid'
       (see quad()), which drive: ceiling-light falloff, side vignette, blinds at random heights, a desk /
       furniture band, mullion + transom, warm/cool mix and brightness jitter. Emission Strength stays an
       unlinked input so scripts can still grade overall brightness."""
    m = M[name]; g = _G(m); b = next(n for n in g.N if n.type == "BSDF_PRINCIPLED")
    uv = g.node("ShaderNodeUVMap"); sep = g.node("ShaderNodeSeparateXYZ"); g.link(uv.outputs[0], sep.inputs[0])
    u, v = sep.outputs[0], sep.outputs[1]
    rnd = g.node("ShaderNodeAttribute"); rnd.attribute_type = "GEOMETRY"; rnd.attribute_name = "wid"; r = rnd.outputs["Fac"]
    r2, r3 = g.math("FRACT", g.math("MULTIPLY", r, 7.13)), g.math("FRACT", g.math("MULTIPLY", r, 13.7))
    ceil = g.math("ADD", 0.35, g.math("MULTIPLY", g.math("POWER", v, 1.6), 0.9))                  # ceiling light falls off downward
    side = g.math("SUBTRACT", 1.0, g.math("MULTIPLY", g.math("POWER", g.math("ABSOLUTE", g.math("SUBTRACT", g.math("MULTIPLY", u, 2), 1)), 3.0), 0.55))
    k = g.math("MULTIPLY", ceil, side)
    # blinds on ~40% of panes, drawn down to a random height, slatted
    has_bl = g.math("GREATER_THAN", r2, 0.6)
    bl_lvl = g.math("SUBTRACT", 1.0, g.math("MULTIPLY", r3, 0.8))
    covered = g.math("MULTIPLY", has_bl, g.math("GREATER_THAN", v, bl_lvl))
    slats = g.math("ADD", 0.45, g.math("MULTIPLY", g.math("GREATER_THAN", g.math("FRACT", g.math("MULTIPLY", v, 16)), 0.35), 0.35))
    k = g.math("MULTIPLY", k, g.math("ADD", g.math("SUBTRACT", 1.0, covered), g.math("MULTIPLY", covered, slats)))
    # desk / furniture band low in the room, with a broken silhouette
    fn = g.node("ShaderNodeTexNoise", Scale=9.0, Detail=2.0); g.link(uv.outputs[0], fn.inputs["Vector"])
    desk = g.math("MULTIPLY", g.math("LESS_THAN", v, g.math("ADD", 0.22, g.math("MULTIPLY", fn.outputs["Fac"], 0.18))), g.math("GREATER_THAN", r3, 0.25))
    k = g.math("MULTIPLY", k, g.math("SUBTRACT", 1.0, g.math("MULTIPLY", desk, 0.65)))
    # mullion and transom
    mul = g.math("LESS_THAN", g.math("ABSOLUTE", g.math("SUBTRACT", u, 0.5)), 0.018)
    tra = g.math("LESS_THAN", g.math("ABSOLUTE", g.math("SUBTRACT", v, 0.78)), 0.02)
    k = g.math("MULTIPLY", k, g.math("SUBTRACT", 1.0, g.math("MULTIPLY", g.math("MAXIMUM", mul, tra), 0.85)))
    k = g.math("MULTIPLY", k, g.math("ADD", 0.55, g.math("MULTIPLY", r3, 0.9)))                    # brightness jitter per room
    warm2 = tuple(min(1, c * f) for c, f in zip(col, (1.0, 1.12, 1.25)))
    hue = g.mix(r2, _rgba(col), _rgba(warm2))
    hue = g.mix(g.math("LESS_THAN", r, cool_share), hue, (0.78, 0.86, 1.0, 1))
    em = g.node("ShaderNodeVectorMath"); em.operation = "SCALE"; g.link(hue, em.inputs[0]); g.link(k, em.inputs["Scale"])
    g.link(em.outputs[0], b.inputs["Emission Color"])
    g.link(g.mix(1.0, hue, (0.12, 0.12, 0.12, 1), "MULTIPLY"), b.inputs["Base Color"])

def dark_glass(name):
    """Unlit pane: reflective glass with a faint room, mullion and per-pane variation."""
    m = M[name]; g = _G(m); b = next(n for n in g.N if n.type == "BSDF_PRINCIPLED")
    uv = g.node("ShaderNodeUVMap"); sep = g.node("ShaderNodeSeparateXYZ"); g.link(uv.outputs[0], sep.inputs[0])
    rnd = g.node("ShaderNodeAttribute"); rnd.attribute_type = "GEOMETRY"; rnd.attribute_name = "wid"; r = rnd.outputs["Fac"]
    mul = g.math("LESS_THAN", g.math("ABSOLUTE", g.math("SUBTRACT", sep.outputs[0], 0.5)), 0.02)
    lv = g.math("ADD", 0.025, g.math("MULTIPLY", r, 0.035))
    lv = g.math("MULTIPLY", lv, g.math("SUBTRACT", 1.0, g.math("MULTIPLY", mul, 0.7)))
    col = g.node("ShaderNodeCombineColor"); g.link(lv, col.inputs[0]); g.link(lv, col.inputs[1]); g.link(g.math("MULTIPLY", lv, 1.25), col.inputs[2])
    g.link(col.outputs[0], b.inputs["Base Color"])
    g.link(g.math("ADD", 0.05, g.math("MULTIPLY", r, 0.18)), b.inputs["Roughness"])
    # a few dark rooms keep a dim standby glow (exit sign / monitor)
    glow = g.math("MULTIPLY", g.math("GREATER_THAN", g.math("FRACT", g.math("MULTIPLY", r, 31.0)), 0.975), 0.25)
    gc = g.node("ShaderNodeVectorMath"); gc.operation = "SCALE"; gc.inputs[0].default_value = (0.5, 0.75, 1.0)
    g.link(glow, gc.inputs["Scale"]); g.link(gc.outputs[0], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = 1.0

weather("concrete", (0.32, 0.32, 0.33)); weather("concrete2", (0.22, 0.22, 0.23))
weather("panel", (0.4, 0.4, 0.42), dirt=0.25, streak=0.35, bump=0.06)
weather("roof", (0.24, 0.24, 0.25), dirt=0.45, streak=0.0, bump=0.25, scale=1.4)
weather("asphalt", (0.022, 0.023, 0.026), dirt=0.5, streak=0.0, bump=0.2, scale=2.0)
weather("walk", (0.075, 0.075, 0.08), dirt=0.3, streak=0.0, bump=0.15, scale=3.0)
weather("frame", (0.8, 0.81, 0.84), dirt=0.12, streak=0.2, bump=0.02, ao=False)
weather("metal", (0.42, 0.43, 0.45), dirt=0.3, streak=0.25, bump=0.04)
interior("lit", WARM, cool_share=0.06); interior("litdim", WARM, cool_share=0.06); interior("litcool", COOL, cool_share=0.6)
dark_glass("glass2"); dark_glass("glass")

def ground(name, base):
    """Open ground between the streets: patchy grass and worn earth, faint paving where it is not grass,
       fine grain, bump and contact shadow under everything standing on it."""
    m = M[name]; g = _G(m); b = next(n for n in g.N if n.type == "BSDF_PRINCIPLED")
    pos = g.node("ShaderNodeNewGeometry").outputs["Position"]
    bn = g.node("ShaderNodeRGB"); bn.name = "BASE"; bn.outputs[0].default_value = _rgba(base)
    patch = g.node("ShaderNodeTexNoise", Vector=pos, Scale=0.035, Detail=5.0, Roughness=0.62).outputs["Fac"]
    grass = g.math("MINIMUM", g.math("MULTIPLY", g.math("SUBTRACT", patch, 0.47), 9.0), 1.0)
    grass = g.math("MAXIMUM", grass, 0.0)
    tiles = g.node("ShaderNodeTexBrick", Vector=pos, Scale=0.45, **{"Mortar Size": 0.03, "Mortar Smooth": 0.2})
    tiles.inputs["Color1"].default_value = (1, 1, 1, 1); tiles.inputs["Color2"].default_value = (0.88, 0.88, 0.88, 1)
    tiles.inputs["Mortar"].default_value = (0.55, 0.55, 0.55, 1)
    grain = g.node("ShaderNodeTexNoise", Vector=pos, Scale=4.0, Detail=10.0, Roughness=0.75).outputs["Fac"]
    blades = g.node("ShaderNodeTexVoronoi", Vector=pos, Scale=6.0).outputs["Distance"]
    paved = g.mix(1.0, bn.outputs[0], tiles.outputs["Color"], "MULTIPLY")
    turf = g.mix(blades, (0.018, 0.03, 0.021, 1), (0.03, 0.048, 0.032, 1))
    col = g.mix(grass, paved, turf)
    col = g.mix(1.0, col, g.node("ShaderNodeCombineColor", Red=g.math("ADD", 0.75, g.math("MULTIPLY", grain, 0.5)),
                                 Green=g.math("ADD", 0.75, g.math("MULTIPLY", grain, 0.5)), Blue=g.math("ADD", 0.75, g.math("MULTIPLY", grain, 0.5))).outputs[0], "MULTIPLY")
    occ = g.node("ShaderNodeAmbientOcclusion", Distance=4.0); occ.samples = 8; g.link(col, occ.inputs["Color"])
    col = g.mix(g.math("SUBTRACT", 1.0, occ.outputs["AO"]), col, g.mix(1.0, col, (0.25, 0.25, 0.25, 1), "MULTIPLY"))
    g.link(col, b.inputs["Base Color"])
    g.link(g.math("ADD", 0.6, g.math("MULTIPLY", grass, 0.35)), b.inputs["Roughness"])
    h = g.math("ADD", g.math("MULTIPLY", grain, 0.6), g.math("MULTIPLY", g.math("SUBTRACT", 1.0, tiles.outputs["Fac"]), g.math("SUBTRACT", 1.0, grass)))
    bmp = g.node("ShaderNodeBump", Strength=0.25, Distance=0.05, Height=h); g.link(bmp.outputs[0], b.inputs["Normal"])

def foliage(name, base):
    """Tree canopies: per-tree colour (object random), leafy clumps from Voronoi, sun-tipped tops."""
    m = M[name]; g = _G(m); b = next(n for n in g.N if n.type == "BSDF_PRINCIPLED")
    bn = g.node("ShaderNodeRGB"); bn.name = "BASE"; bn.outputs[0].default_value = _rgba(base)
    oi = g.node("ShaderNodeObjectInfo")
    geo = g.node("ShaderNodeNewGeometry")
    vor = g.node("ShaderNodeTexVoronoi", Vector=geo.outputs["Position"], Scale=2.6).outputs["Distance"]
    leaf = g.node("ShaderNodeTexNoise", Vector=geo.outputs["Position"], Scale=7.0, Detail=6.0).outputs["Fac"]
    nz = g.node("ShaderNodeSeparateXYZ"); g.link(geo.outputs["Normal"], nz.inputs[0])
    top = g.math("MULTIPLY", g.math("MAXIMUM", nz.outputs["Z"], 0.0), 0.5)
    v = g.math("ADD", g.math("ADD", 0.65, g.math("MULTIPLY", oi.outputs["Random"], 0.7)), g.math("SUBTRACT", top, g.math("MULTIPLY", vor, 0.6)))
    v = g.math("MULTIPLY", v, g.math("ADD", 0.8, g.math("MULTIPLY", leaf, 0.4)))
    hue = g.mix(oi.outputs["Random"], (0.9, 1.05, 0.95, 1), (1.1, 1.0, 0.85, 1))
    col = g.mix(1.0, bn.outputs[0], hue, "MULTIPLY")
    vc = g.node("ShaderNodeCombineColor"); [g.link(v, vc.inputs[i]) for i in range(3)]
    g.link(g.mix(1.0, col, vc.outputs[0], "MULTIPLY"), b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    if "Subsurface Weight" in b.inputs: b.inputs["Subsurface Weight"].default_value = 0.0
    bmp = g.node("ShaderNodeBump", Strength=0.6, Distance=0.2, Height=g.math("ADD", vor, g.math("MULTIPLY", leaf, 0.5))); g.link(bmp.outputs[0], b.inputs["Normal"])

def car_paint(name, base):
    """One mesh holds every car: tint each by its position so the traffic is not one colour."""
    m = M[name]; g = _G(m); b = next(n for n in g.N if n.type == "BSDF_PRINCIPLED")
    pos = g.node("ShaderNodeNewGeometry").outputs["Position"]
    cell = g.node("ShaderNodeTexVoronoi", Vector=pos, Scale=0.25).outputs["Color"]
    pal = g.node("ShaderNodeValToRGB"); g.link(g.node("ShaderNodeRGBToBW", Color=cell).outputs[0], pal.inputs[0])
    el = pal.color_ramp.elements; pal.color_ramp.interpolation = "CONSTANT"
    el[0].color = (0.05, 0.055, 0.06, 1); el[1].position = 0.8; el[1].color = (0.55, 0.56, 0.58, 1)
    for pos_, c in ((0.3, (0.18, 0.19, 0.2)), (0.5, (0.02, 0.025, 0.04)), (0.65, (0.25, 0.03, 0.03))):
        e = el.new(pos_); e.color = (*c, 1)
    g.link(pal.outputs[0], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.22; b.inputs["Metallic"].default_value = 0.6

ground("plot", (0.045, 0.046, 0.05))
ground("grass", (0.03, 0.04, 0.032))
foliage("tree", (0.03, 0.042, 0.035))
car_paint("car", (0.06, 0.065, 0.07))
weather("dark", (0.05, 0.05, 0.055), dirt=0.4, streak=0.2, bump=0.08)
weather("trunk", (0.04, 0.035, 0.03), dirt=0.3, streak=0.0, bump=0.3, scale=4.0, ao=False)
weather("paint", (0.55, 0.56, 0.58), dirt=0.6, streak=0.0, bump=0.02, scale=3.0, ao=False)   # worn road markings
weather("wire", (0.3, 0.3, 0.32), dirt=0.2, streak=0.0, bump=0.0, ao=False)

# ============================================================== geometry kit
COLL = {}
def coll(name):
    if name not in COLL:
        c = bpy.data.collections.new(name); sc.collection.children.link(c); COLL[name] = c
    return COLL[name]
KIT = {}
def bm_for(m):
    if m not in KIT: KIT[m] = bmesh.new()
    return KIT[m]
def T(x, y, z, sx=1, sy=1, sz=1, rz=0.0):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Diagonal((sx, sy, sz, 1))
def box(m, x, y, z0, sx, sy, sz, rz=0.0):
    bm = bm_for(m)
    bmesh.ops.create_cube(bm, size=1.0, matrix=T(x, y, z0 + sz / 2, sx, sy, sz, rz), calc_uvs=bool(bm.loops.layers.uv))
def cyl(m, x, y, z0, r, h, seg=24, r2=None):
    bmesh.ops.create_cone(bm_for(m), cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2,
                          depth=h, matrix=Matrix.Translation((x, y, z0 + h / 2)))
def beam(m, p0, p1, t=0.14, seg=0):
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0; L = d.length
    if L < 1e-4: return
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    mid = Matrix.Translation((p0 + p1) / 2)
    if seg: bmesh.ops.create_cone(bm_for(m), cap_ends=True, segments=seg, radius1=t, radius2=t, depth=L, matrix=mid @ rot)
    else: bmesh.ops.create_cube(bm_for(m), size=1.0, matrix=mid @ rot @ Matrix.Diagonal((t, t, L, 1)))
def quad(m, a, b, c, d):
    """A window pane: UVs run 0..1 across it and 'wid' holds a per-pane random for the interior shaders."""
    bm = bm_for(m)
    uvl = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    wid = bm.faces.layers.float.get("wid") or bm.faces.layers.float.new("wid")
    f = bm.faces.new([bm.verts.new(p) for p in (a, b, c, d)])
    for loop, co in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): loop[uvl].uv = co
    f[wid] = rng.random()
def sphere(m, x, y, z, r, sub=2, sq=1.0):
    bmesh.ops.create_icosphere(bm_for(m), subdivisions=sub, radius=r, matrix=T(x, y, z, 1, 1, sq))
def flush(name, cname="Buildings"):
    objs = []
    for m, bm in KIT.items():
        me = bpy.data.meshes.new(f"{name}_{m}"); bm.to_mesh(me); bm.free()
        me.shade_smooth(); me.set_sharp_from_angle(angle=math.radians(35))
        o = bpy.data.objects.new(me.name, me); me.materials.append(M[m]); coll(cname).objects.link(o); objs.append(o)
    KIT.clear(); return objs

def frame_box(m, x, y, z0, w, d, h, t=0.16, mid=0):
    """Open steel frame: 12 edges, plus `mid` intermediate rings."""
    xs, ys = (x - w / 2, x + w / 2), (y - d / 2, y + d / 2)
    for zz in [z0, z0 + h] + [z0 + h * (k + 1) / (mid + 1) for k in range(mid)]:
        beam(m, (xs[0], ys[0], zz), (xs[1], ys[0], zz), t); beam(m, (xs[0], ys[1], zz), (xs[1], ys[1], zz), t)
        beam(m, (xs[0], ys[0], zz), (xs[0], ys[1], zz), t); beam(m, (xs[1], ys[0], zz), (xs[1], ys[1], zz), t)
    for px in xs:
        for py in ys: beam(m, (px, py, z0), (px, py, z0 + h), t)

SIDES = lambda x, y, w, d: [((x - w/2, y - d/2), (x + w/2, y - d/2), (0, -1)), ((x + w/2, y - d/2), (x + w/2, y + d/2), (1, 0)),
                            ((x + w/2, y + d/2), (x - w/2, y + d/2), (0, 1)), ((x - w/2, y + d/2), (x - w/2, y - d/2), (-1, 0))]

def facade(x, y, w, d, z0, floors, fh, bay, lit_p, lit="lit", unlit="glass2", pier="panel", pier_w=0.45,
           ledge="panel", ledge_h=0.35, depth=0.18, margin=0.12, sides=(0, 1, 2, 3)):
    """Punched or curtain-wall facade on a rectangular volume: panes per bay & floor (some lit),
       vertical piers between bays and a ledge at every floor line."""
    for si, ((ax, ay), (bx, by), (nx, ny)) in enumerate(SIDES(x, y, w, d)):
        if si not in sides: continue
        L = math.dist((ax, ay), (bx, by)); n = max(1, round(L / bay)); ux, uy = (bx - ax) / L, (by - ay) / L
        off = 0.03
        for f in range(floors):
            za, zb = z0 + f * fh + ledge_h, z0 + (f + 1) * fh - margin
            for b in range(n):
                s0, s1 = b * L / n + pier_w / 2, (b + 1) * L / n - pier_w / 2
                if s1 - s0 < 0.2: continue
                m = lit if rng.random() < lit_p else unlit
                if m is None: continue
                p = lambda s, z: (ax + ux * s + nx * off, ay + uy * s + ny * off, z)
                quad(m, p(s0, za), p(s1, za), p(s1, zb), p(s0, zb))
        rz = math.atan2(uy, ux)
        for b in range(n + 1):                                         # piers
            s = b * L / n; px, py = ax + ux * s + nx * depth / 2, ay + uy * s + ny * depth / 2
            box(pier, px, py, z0, pier_w, depth, floors * fh, rz)
        for f in range(floors + 1):                                    # floor ledges
            mx, my = (ax + bx) / 2 + nx * depth / 2, (ay + by) / 2 + ny * depth / 2
            box(ledge, mx, my, z0 + f * fh - 0.02, L + pier_w, depth + 0.06, ledge_h, rz)

def parapet(m, x, y, w, d, z, h=0.9, t=0.3):
    for (ax, ay), (bx, by), _ in SIDES(x, y, w, d):
        box(m, (ax + bx) / 2, (ay + by) / 2, z, abs(bx - ax) + t if ay == by else t, abs(by - ay) + t if ax == bx else t, h)

def hvac(x, y, z, rz=0.0, s=1.0):
    c, sn = math.cos(rz), math.sin(rz)
    box("metal", x, y, z, 2.4 * s, 1.5 * s, 1.0 * s, rz)
    for k in (-0.55, 0.55):
        fx, fy = x + k * s * c, y + k * s * sn
        cyl("dark", fx, fy, z + 1.0 * s, 0.5 * s, 0.08, 20); cyl("metal", fx, fy, z + 1.08 * s, 0.1 * s, 0.05, 10)
        for a in (0, math.pi / 2): box("metal", fx, fy, z + 1.09 * s, 1.0 * s, 0.05, 0.04, rz + a)

def roof_clutter(x, y, w, d, z, n=4, frame=True):
    placed = []
    for _ in range(n * 6):
        if len(placed) >= n: break
        px, py = x + rng.uniform(-w / 2 + 2, w / 2 - 2), y + rng.uniform(-d / 2 + 2, d / 2 - 2)
        if all(math.dist((px, py), q) > 3.2 for q in placed): placed.append((px, py)); hvac(px, py, z)
    if frame and w > 9 and d > 7:
        fw, fd = min(w * 0.4, 8), min(d * 0.45, 6)
        fx, fy = x + w / 2 - fw / 2 - 1.2, y - d / 2 + fd / 2 + 1.2
        frame_box("frame", fx, fy, z, fw, fd, 3.2, 0.14, 1); box("metal", fx, fy, z, fw - 1.2, fd - 1.2, 1.6)

# ============================================================== hero buildings
FAC = {}            # key -> list of objects (for the website's hover outlines)
def keep(key, objs):
    if key: FAC.setdefault(key, []).extend(objs)

def glass_tower(x, y, w, d, floors, fh=3.6, crown=7.0, key=None):
    H = floors * fh
    box("glass", x, y, 0, w - 0.3, d - 0.3, H)
    bay = w / 8
    for si, ((ax, ay), (bx, by), (nx, ny)) in enumerate(SIDES(x, y, w, d)):
        L = math.dist((ax, ay), (bx, by)); n = round(L / bay); ux, uy = (bx - ax) / L, (by - ay) / L
        rz = math.atan2(uy, ux)
        for f in range(floors):                                         # lit panes (lobby mostly lit)
            for b in range(n):
                p_lit = 0.6 if f == 0 else (0.42 if f < floors * 0.32 else (0.05 if f < floors - 1 else 0.02))   # lit offices sit low, as in the reference
                if rng.random() >= p_lit: continue
                s0, s1 = b * L / n + 0.12, (b + 1) * L / n - 0.12
                za, zb = f * fh + 0.35, (f + 1) * fh - 0.15
                off = 0.06; p = lambda s, z: (ax + ux * s + nx * off, ay + uy * s + ny * off, z)
                quad("lit" if rng.random() < 0.8 else "litdim", p(s0, za), p(s1, za), p(s1, zb), p(s0, zb))
        for b in range(n + 1):                                          # mullions run up through the crown
            s = b * L / n; px, py = ax + ux * s + nx * 0.1, ay + uy * s + ny * 0.1
            box("frame", px, py, 0, 0.16 if 0 < b < n else 0.4, 0.22, H + crown, rz)
        for f in range(floors + 1):                                     # spandrel at every floor
            mx, my = (ax + bx) / 2 + nx * 0.1, (ay + by) / 2 + ny * 0.1
            box("frame", mx, my, f * fh - 0.06, L + 0.3, 0.24, 0.16, rz)
        for k in range(1, 4):                                           # crown rings
            mx, my = (ax + bx) / 2 + nx * 0.1, (ay + by) / 2 + ny * 0.1
            box("frame", mx, my, H + crown * k / 3 - 0.08, L + 0.3, 0.22, 0.16, rz)
    box("roof", x, y, H, w - 0.4, d - 0.4, 0.3)
    box("metal", x, y, H + 0.3, w * 0.5, d * 0.5, 3.2); hvac(x - w * 0.2, y + d * 0.25, H + 0.3)
    cyl("metal", x + w * 0.25, y - d * 0.25, H + 0.3, 0.8, 2.2, 20)
    beam("metal", (x, y, H + 3.5), (x, y, H + crown + 5), 0.12, 8); cyl("red", x, y, H + crown + 5, 0.22, 0.3, 12)
    box("lit", x, y - d / 2 - 2.2, 0, 4.5, 0.3, 3.2); box("frame", x, y - d / 2 - 2.2, 3.2, 6, 4.6, 0.25)   # lit lobby canopy
    keep(key, flush(f"Tower_{x}_{y}"))

def office(x, y, w, d, floors, fh=3.5, lit_p=0.12, lit="lit", clutter=4, key=None, name="Office"):
    H = floors * fh
    box("concrete", x, y, 0, w, d, H)
    facade(x, y, w, d, 0, floors, fh, 2.4, lit_p, lit=lit)
    box("roof", x, y, H, w + 0.2, d + 0.2, 0.25); parapet("concrete", x, y, w, d, H + 0.25, 0.8)
    roof_clutter(x, y, w, d, H + 0.25, clutter)
    k = flush(f"{name}_{x}_{y}"); keep(key, k); return H

def low_lit(x, y, w, d, key=None):
    """Two-storey pavilion with a continuous lit glass front, as in the hero art."""
    box("concrete", x, y, 0, w, d, 7.2)
    facade(x, y, w, d, 0, 2, 3.6, 2.0, 0.45, pier="frame", pier_w=0.25, ledge="frame", ledge_h=0.25)
    box("roof", x, y, 7.2, w + 1.6, d + 1.6, 0.4); parapet("panel", x, y, w + 1.6, d + 1.6, 7.6, 0.5, 0.2)
    roof_clutter(x, y, w, d, 7.6, 2, frame=False)
    keep(key, flush(f"Pavilion_{x}_{y}"))

# ============================================================== facilities
def data_center(x, y, key="dc"):
    # twin halls with ribbed walls, an office front with lit windows, a deck of rooftop chillers
    for hx in (x - 8.5, x + 8.5):
        W_, D_, H_ = 15, 26, 10
        box("panel", hx, y, 0, W_, D_, H_)
        for (ax, ay), (bx, by), (nx, ny) in SIDES(hx, y, W_, D_):
            L = math.dist((ax, ay), (bx, by)); ux, uy = (bx - ax) / L, (by - ay) / L; rz = math.atan2(uy, ux)
            for k in range(int(L / 0.9) + 1):
                s = k * 0.9; box("concrete2", ax + ux * s + nx * 0.08, ay + uy * s + ny * 0.08, 0, 0.18, 0.16, H_ - 0.2, rz)
            mx, my = (ax + bx) / 2 + nx * 0.06, (ay + by) / 2 + ny * 0.06
            box("litdim", mx, my, 2.2, L - 2, 0.04, 0.5, rz)                 # thin lit band
        box("roof", hx, y, H_, W_ + 0.3, D_ + 0.3, 0.3); parapet("panel", hx, y, W_, D_, H_ + 0.3, 0.7, 0.25)
        for i in range(3):
            for j in range(6): hvac(hx - 4 + i * 4, y - 10 + j * 4, H_ + 0.3, 0, 1.1)
        frame_box("frame", hx + 4.5, y + 9, H_ + 0.3, 4, 6, 2.6, 0.12)
    # glazed office block on the front, lots of lit windows
    office_y = y - 13 - 4
    box("concrete", x, office_y, 0, 30, 7, 12)
    facade(x, office_y, 30, 7, 0, 3, 4.0, 2.0, 0.4, sides=(0, 1, 3))
    box("roof", x, office_y, 12, 30.3, 7.3, 0.3); parapet("panel", x, office_y, 30, 7, 12.3, 0.6, 0.2)
    for i in range(7): box("dark", x - 13 + i * 2.2, y + 16, 0, 1.8, 3.0, 2.0)   # generator row (rear)
    for i in range(7): cyl("metal", x - 13 + i * 2.2, y + 16.8, 2.0, 0.15, 1.6, 8)
    beam("metal", (x - 8.5 + 7.5, y, 6), (x + 8.5 - 7.5, y, 6), 0.5, 16)          # pipe bridge between halls
    keep(key, flush("DataCenter"))

def clean_room(x, y, key="clean"):
    box("concrete", x, y, 0, 26, 18, 9)
    facade(x, y, 26, 18, 0, 2, 4.5, 1.6, 0.45, lit="litcool", unlit="glass2", pier="frame", pier_w=0.22, ledge="panel", ledge_h=0.6)
    box("concrete", x - 3, y + 2, 9, 16, 11, 5)
    facade(x - 3, y + 2, 16, 11, 9, 1, 5, 1.6, 0.3, lit="litcool", pier="frame", pier_w=0.22)
    box("roof", x, y, 9, 26.2, 18.2, 0.25); box("roof", x - 3, y + 2, 14, 16.2, 11.2, 0.25)
    parapet("panel", x, y, 26, 18, 9.25, 0.6, 0.2)
    # the white rooftop frames from the reference + air handlers inside them
    frame_box("frame", x + 8, y - 4, 9.25, 7, 7, 4.2, 0.15, 1); box("metal", x + 8, y - 4, 9.25, 5.5, 5.5, 2.4)
    frame_box("frame", x - 3, y + 2, 14.25, 9, 6, 3.4, 0.15, 1); box("metal", x - 3, y + 2, 14.25, 7, 4, 1.8)
    for i in range(3): cyl("metal", x - 9 + i * 2.2, y - 6, 9.25, 0.35, 5.5, 14)  # exhaust stacks
    for i in range(2): hvac(x + 7, y + 5 - i * 3.5, 9.25)
    beam("metal", (x - 9, y - 7.5, 10.5), (x + 4, y - 7.5, 10.5), 0.35, 12)
    keep(key, flush("CleanRoom"))

def hospital(x, y, key="health"):
    box("concrete", x, y, 0, 14, 24, 18)
    facade(x, y, 14, 24, 0, 5, 3.6, 2.0, 0.28, lit="litcool")
    box("concrete", x + 10, y - 6, 0, 10, 12, 10.8)
    facade(x + 10, y - 6, 10, 12, 0, 3, 3.6, 2.0, 0.35, lit="lit")
    box("roof", x, y, 18, 14.2, 24.2, 0.3); parapet("panel", x, y, 14, 24, 18.3, 0.8)
    box("roof", x + 10, y - 6, 10.8, 10.2, 12.2, 0.3)
    # glowing white cross on the street-facing wall, near the top
    cx_, cz = x - 7 - 0.25, 14.2
    box("cross", cx_, y - 4, cz - 2.2, 0.3, 1.3, 4.4); box("cross", cx_, y - 4, cz - 0.65, 0.3, 4.4, 1.3)
    box("dark", cx_ + 0.05, y - 4, cz - 2.5, 0.2, 5.0, 5.0)                        # dark plate behind it
    frame_box("frame", x + 2, y + 7, 18.3, 6, 6, 3.0, 0.14, 1); hvac(x - 2, y - 6, 18.3); hvac(x - 2, y + 2, 18.3)
    box("frame", x - 7 - 2.5, y + 8, 3.6, 5, 7, 0.3); box("lit", x - 7.05, y + 8, 0.2, 0.06, 5, 3)  # entrance canopy
    keep(key, flush("Hospital"))

def power_plant(x, y, key="energy"):
    box("panel", x, y, 0, 30, 14, 12)                                               # turbine hall
    for (ax, ay), (bx, by), (nx, ny) in SIDES(x, y, 30, 14):
        L = math.dist((ax, ay), (bx, by)); ux, uy = (bx - ax) / L, (by - ay) / L; rz = math.atan2(uy, ux)
        for k in range(int(L / 1.0) + 1):
            s = k * 1.0; box("concrete2", ax + ux * s + nx * 0.08, ay + uy * s + ny * 0.08, 0, 0.16, 0.16, 11.8, rz)
        mx, my = (ax + bx) / 2 + nx * 0.06, (ay + by) / 2 + ny * 0.06
        for f, p in ((3.0, 0.5), (7.5, 0.3)):
            for k in range(int(L / 2.0)):
                if rng.random() < p:
                    s = k * 2.0 + 1.0; box("lit", ax + ux * s + nx * 0.07, ay + uy * s + ny * 0.07, f, 1.4, 0.04, 1.2, rz)
    box("roof", x, y, 12, 30.4, 14.4, 0.3)
    for i in range(5): hvac(x - 11 + i * 5.5, y - 3.5, 12.3)
    box("concrete", x + 6, y + 10, 0, 12, 7, 17)                                   # boiler house
    facade(x + 6, y + 10, 12, 7, 0, 4, 4.2, 2.0, 0.2)
    box("roof", x + 6, y + 10, 17, 12.2, 7.2, 0.3)
    for i, (h, r) in enumerate([(30, 1.1), (34, 1.3), (30, 1.1), (26, 0.9), (26, 0.9), (22, 0.8)]):   # the stacks
        sx_, sy_ = x - 11 + i * 3.4, y + 9.5
        cyl("panel", sx_, sy_, 0, r, h, 28)
        for k in range(1, 4): cyl("frame", sx_, sy_, h * k / 4, r + 0.08, 0.3, 28)
        cyl("dark", sx_, sy_, h, r * 0.8, 0.02, 20); cyl("red", sx_, sy_, h - 0.6, r + 0.1, 0.18, 20)
        beam("frame", (sx_, sy_ - r - 0.3, 0), (sx_, sy_ - r - 0.3, h - 1), 0.08)   # ladder rail
    for i in range(3): cyl("metal", x - 9 + i * 5, y - 12, 0, 2.0, 6, 32); cyl("metal", x - 9 + i * 5, y - 12, 6, 2.0, 0.8, 32, 0.4)
    beam("metal", (x - 13, y - 9, 4), (x + 13, y - 9, 4), 0.3, 12); beam("metal", (x - 13, y - 9.8, 4.6), (x + 13, y - 9.8, 4.6), 0.22, 12)
    for i in range(7): beam("frame", (x - 13 + i * 4.3, y - 9.4, 0), (x - 13 + i * 4.3, y - 9.4, 5), 0.12)
    keep(key, flush("PowerPlant"))

def substation(x, y, key="energy"):
    box("plot", x, y, 0, 34, 26, 0.12)
    for i in range(4):
        for j in range(2):
            px, py = x - 12 + i * 8, y - 5 + j * 10
            box("metal", px, py, 0.12, 3.2, 2.4, 2.6)
            for k in range(6): box("dark", px - 1.6 - 0.15, py - 1.0 + k * 0.4, 0.4, 0.3, 0.1, 2.0)   # radiator fins
            for k in (-0.9, 0, 0.9): beam("frame", (px + k, py, 2.7), (px + k, py, 4.2), 0.12, 10)
    for i in range(5):                                                              # gantries
        gx = x - 16 + i * 8
        for py in (y - 11, y + 11): beam("frame", (gx, py, 0), (gx, py, 9), 0.2)
        beam("frame", (gx, y - 11, 9), (gx, y + 11, 9), 0.2)
    for i in range(int(68 / 2.5)):                                                  # fence
        t = i * 2.5
        for (px, py) in ((x - 17 + t, y - 13), (x - 17 + t, y + 13)) if t <= 34 else ():
            box("metal", px, py, 0, 0.08, 0.08, 2.2)
    for zz in (0.3, 2.1):
        for py in (y - 13, y + 13): box("metal", x, py, zz, 34, 0.05, 0.05)
        for px in (x - 17, x + 17): box("metal", px, y, zz, 0.05, 26, 0.05)
    keep(key, flush("Substation"))

def pylon(x, y, H=24.0, rz=0.0):
    b, t = 2.4, 0.6; c, s = math.cos(rz), math.sin(rz)
    P = lambda u, v, z: (x + u * c - v * s, y + u * s + v * c, z)
    L4 = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for (u, v) in L4: beam("frame", P(u * b, v * b, 0), P(u * t, v * t, H), 0.14)
    for k in range(6):
        z0, z1 = H * k / 6, H * (k + 1) / 6; w0, w1 = b + (t - b) * k / 6, b + (t - b) * (k + 1) / 6
        for i in range(4):
            (au, av), (bu, bv) = L4[i], L4[(i + 1) % 4]
            beam("frame", P(au * w0, av * w0, z0), P(bu * w1, bv * w1, z1), 0.06)
            beam("frame", P(bu * w0, bv * w0, z0), P(au * w1, av * w1, z1), 0.06)
    tips = []
    for zz, w in ((H * 0.72, 5.5), (H * 0.86, 4.2), (H, 2.8)):
        beam("frame", P(-w, 0, zz), P(w, 0, zz), 0.12)
        beam("frame", P(-w, 0, zz), P(-t, 0, zz - 1.6), 0.08); beam("frame", P(w, 0, zz), P(t, 0, zz - 1.6), 0.08)
        for sgn in (-1, 1): tips.append(Vector(P(sgn * w, 0, zz - 1.2)))
    return tips

def wire(p0, p1, sag=2.0):
    cu = bpy.data.curves.new("Wire", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = 0.04
    sp = cu.splines.new("POLY"); n = 18; sp.points.add(n - 1)
    for i in range(n):
        t = i / (n - 1); p = p0.lerp(p1, t); sp.points[i].co = (p.x, p.y, p.z - sag * 4 * t * (1 - t), 1)
    o = bpy.data.objects.new("Wire", cu); cu.materials.append(M["wire"]); coll("Buildings").objects.link(o)

def make_tree_mesh(i):
    bm = bmesh.new(); KIT["tree"] = bm
    for k in range(rng.randint(3, 5)):
        ang = rng.uniform(0, 2 * math.pi); rr = rng.uniform(0.3, 1.1)
        sphere("tree", math.cos(ang) * rr, math.sin(ang) * rr, 3.6 + rng.uniform(-0.4, 0.9), rng.uniform(1.3, 2.0), 2, 0.85)
    me = bpy.data.meshes.new(f"TreeCanopy{i}"); bm.to_mesh(me); bm.free(); KIT.clear()
    bm2 = bmesh.new(); bmesh.ops.create_cone(bm2, cap_ends=True, segments=8, radius1=0.18, radius2=0.12, depth=3.0, matrix=Matrix.Translation((0, 0, 1.5)))
    me2 = bpy.data.meshes.new(f"TreeTrunk{i}"); bm2.to_mesh(me2); bm2.free()
    # merge canopy + trunk into one mesh with two material slots
    bmm = bmesh.new(); bmm.from_mesh(me); off = len(bmm.faces)
    bmm.from_mesh(me2)
    bmm.faces.ensure_lookup_table()
    for f in bmm.faces[off:]: f.material_index = 1
    out = bpy.data.meshes.new(f"Tree{i}"); bmm.to_mesh(out); bmm.free()
    out.materials.append(M["tree"]); out.materials.append(M["trunk"]); out.shade_smooth()
    return out

def tree(x, y, s=1.0):
    o = bpy.data.objects.new("Tree", rng.choice(tree_meshes())); o.location = (x, y, 0.1)
    o.rotation_euler.z = rng.uniform(0, 6.28); o.scale = (s, s, s * rng.uniform(0.9, 1.15)); coll("Trees").objects.link(o); return o

def tube(name, pts, r=0.2, m="net"):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = r; cu.bevel_resolution = 3
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (p[0], p[1], 0.32, 1)
    o = bpy.data.objects.new(name, cu); cu.materials.append(M[m]); coll("Network").objects.link(o); return o

_TREES = []
def tree_meshes():
    if not _TREES: _TREES.extend(make_tree_mesh(i) for i in range(6))
    return _TREES

# ============================================================== world, light, render settings
def setup_render(SAMPLES=128, RES=100):
    w = bpy.data.worlds.new("Night"); w.use_nodes = True
    bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.012, 0.014, 0.02, 1); bg.inputs[1].default_value = 1.0
    sc.world = w
    moon = bpy.data.objects.new("Moon", bpy.data.lights.new("Moon", "SUN")); coll("Lights").objects.link(moon)
    moon.data.energy = 2.0; moon.data.color = (0.74, 0.8, 1.0); moon.data.angle = math.radians(1.2)   # crisper moon shadows
    moon.rotation_euler = (math.radians(52), 0, math.radians(-72))   # from the west-southwest: left faces catch it
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN")); coll("Lights").objects.link(fill)
    fill.data.energy = 0.12; fill.data.color = (1.0, 0.85, 0.7); fill.rotation_euler = (math.radians(65), 0, math.radians(140))

    sc.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for dt in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = dt; prefs.get_devices()
                if any(d.type == dt for d in prefs.devices): break
            except Exception: pass
        for d in prefs.devices: d.use = d.type != "CPU"
        sc.cycles.device = "GPU"; print("DEVICE", prefs.compute_device_type, [d.name for d in prefs.devices if d.use])
    except Exception as e:
        print("GPU setup failed:", e)
    sc.cycles.samples = SAMPLES; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.03
    sc.cycles.use_denoising = True
    try: sc.cycles.denoiser = "OPTIX"
    except Exception: pass
    sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 2; sc.cycles.transmission_bounces = 2
    sc.cycles.use_light_tree = True
    sc.cycles.light_sampling_threshold = 0.01
    sc.cycles.blur_glossy = 1.0
    sc.view_settings.view_transform = "AgX"
    try: sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception: pass
    sc.view_settings.exposure = -0.2
    sc.render.resolution_x, sc.render.resolution_y = 2560, 1440
    sc.render.resolution_percentage = RES
    sc.render.film_transparent = False

    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "ABSOLUTE"; sc.render.line_thickness = 0.7
    fs = bpy.context.view_layer.freestyle_settings; fs.crease_angle = math.radians(130)
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("Edges")
    ls.select_by_visibility = True; ls.select_by_edge_types = True
    ls.select_silhouette = True; ls.select_border = False; ls.select_crease = True
    ls.select_by_collection = True; ls.collection = coll("Buildings"); ls.collection_negation = "INCLUSIVE"
    if ls.linestyle is None: ls.linestyle = bpy.data.linestyles.new("Edges")
    ls.linestyle.color = (0.85, 0.88, 0.95); ls.linestyle.alpha = 0.32; ls.linestyle.thickness = 0.7

    # bloom on the lights and lines
    try:
        ng = bpy.data.node_groups.new("Comp", "CompositorNodeTree"); sc.compositing_node_group = ng
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        rl = ng.nodes.new("CompositorNodeRLayers"); gl = ng.nodes.new("CompositorNodeGlare"); go = ng.nodes.new("NodeGroupOutput")
        for gt in ("Bloom", "Fog Glow"):
            try: gl.inputs["Type"].default_value = gt; break
            except Exception: pass
        for nm, v in (("Threshold", 1.2), ("Size", 0.55), ("Strength", 0.55)):
            if nm in gl.inputs: gl.inputs[nm].default_value = v
        ng.links.new(rl.outputs["Image"], gl.inputs["Image"]); ng.links.new(gl.outputs["Image"], go.inputs[0])
    except Exception as e:
        print("BLOOM skipped", e)

