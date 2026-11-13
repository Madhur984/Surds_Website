import bpy, bmesh, math, os, random
from mathutils import Matrix, Vector

random.seed(7)
C = bpy.context
scene = C.scene
NAME = "SURDS_City"

# ---------------------------------------------------------------- reset
old = bpy.data.collections.get(NAME)
if old:
    for o in list(old.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for ch in list(old.children_recursive):
        bpy.data.collections.remove(ch)
    bpy.data.collections.remove(old)
for o in list(getattr(bpy.data.collections.get("SURDS Trees"), "objects", [])):   # trees sit outside NAME
    bpy.data.objects.remove(o, do_unlink=True)
for cu in [c for c in bpy.data.curves if c.users == 0]:
    bpy.data.curves.remove(cu)
for me in [m for m in bpy.data.meshes if m.users == 0]:
    bpy.data.meshes.remove(me)

park = bpy.data.collections.get("Imported")
if park is None:
    park = bpy.data.collections.new("Imported")
    scene.collection.children.link(park)
for o in list(scene.collection.objects):
    park.objects.link(o)
    scene.collection.objects.unlink(o)
for lc in C.view_layer.layer_collection.children:
    if lc.collection == park:
        lc.exclude = True

col = bpy.data.collections.new(NAME)
scene.collection.children.link(col)
for lc in C.view_layer.layer_collection.children:
    lc.exclude = lc.collection != col
outlined = bpy.data.collections.new("SURDS Outlined")   # hero buildings: crisp Freestyle edge lines
col.children.link(outlined)
quiet = bpy.data.collections.new("SURDS Outlined Quiet")   # background fillers: faint lines
col.children.link(quiet)

# ---------------------------------------------------------------- materials
def mat(name, base=(0.02, 0.02, 0.02), rough=0.6, emit=None, strength=0.0, metallic=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    return m


def tex_nodes(nt, tex, size, gain, desat=0.15, bump=0.7, calm=0.0, avg=0.4):
    """Poly Haven PBR maps (source/textures/<tex>_<map>_2k.jpg), box-projected in world space at real size.
    Returns (color, roughness, normal) sockets; color is desaturated and scaled by gain."""
    N, L = nt.nodes, nt.links
    pos = N.new("ShaderNodeNewGeometry")
    scale = N.new("ShaderNodeVectorMath")
    scale.operation = "SCALE"
    L.new(pos.outputs["Position"], scale.inputs[0])
    scale.inputs["Scale"].default_value = 1.0 / size

    def img(kind, data):
        n = N.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(bpy.path.abspath(f"//textures/{tex}_{kind}_2k.jpg"), check_existing=True)
        if data:
            n.image.colorspace_settings.name = "Non-Color"
        n.projection = "BOX"
        n.projection_blend = 0.15
        L.new(scale.outputs["Vector"], n.inputs["Vector"])
        return n

    diff, rough, nor = img("diff", False), img("rough", True), img("nor", True)
    grey = N.new("ShaderNodeHueSaturation")
    grey.inputs["Saturation"].default_value = desat
    L.new(diff.outputs["Color"], grey.inputs["Color"])
    lift = N.new("ShaderNodeMixRGB")
    lift.blend_type = "MULTIPLY"
    lift.use_clamp = False
    lift.inputs["Fac"].default_value = 1.0
    L.new(grey.outputs["Color"], lift.inputs["Color1"])
    lift.inputs["Color2"].default_value = (gain, gain, gain, 1)
    smooth = N.new("ShaderNodeMixRGB")              # pull towards the texture's own mean: keeps grain, drops stains
    smooth.inputs["Fac"].default_value = calm
    L.new(lift.outputs["Color"], smooth.inputs["Color1"])
    smooth.inputs["Color2"].default_value = (gain * avg, gain * avg, gain * avg, 1)
    nmap = N.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = bump
    L.new(nor.outputs["Color"], nmap.inputs["Color"])
    return smooth.outputs["Color"], rough.outputs["Color"], nmap.outputs["Normal"]


def tex_mat(name, tex, size, gain, metallic=0.0, desat=0.15):
    """Plain PBR material from a Poly Haven texture set."""
    m = mat(name, (0.1, 0.1, 0.1), 0.7, metallic=metallic)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    c, r, n = tex_nodes(m.node_tree, tex, size, gain, desat)
    L = m.node_tree.links
    L.new(c, b.inputs["Base Color"])
    L.new(r, b.inputs["Roughness"])
    L.new(n, b.inputs["Normal"])
    return m


def window_mat(name, lit=0.35, bay=2.4, floor=3.6, glass=False, warm=(1.0, 0.74, 0.5), mortar=0.34, power=0.7,
               fade=0.0, lobby=True, sill=0.28, head=0.82, wall=None, tex=None, tex_size=4.0, tex_gain=0.4,
               pane_tone=None, metal=None, frame_glow=0.0, sheen_gain=0.9, line_grid=None):
    """Facade shader: per bay and floor a window (jambs = mortar, sill and head as fractions of the floor),
    unlit panes dark glass against the wall, a random share lit warm. World space, so a rising wall reveals floors."""
    if wall is None:
        wall = (0.05, 0.055, 0.065) if glass else (0.07, 0.07, 0.075)
    if metal is None:
        metal = 0.6 if glass else 0.0
    m = mat(name, wall, 0.15 if glass else 0.8, metallic=metal)
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = next(n for n in N if n.type == "BSDF_PRINCIPLED")

    def math_node(op, a=None, bval=None, cval=None):
        n = N.new("ShaderNodeMath")
        n.operation = op
        if a is not None:
            L.new(a, n.inputs[0])
        for i, v in ((1, bval), (2, cval)):
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            elif v is not None:
                L.new(v, n.inputs[i])
        return n

    def between(x, lo, hi):
        return math_node("MULTIPLY", math_node("GREATER_THAN", x, lo).outputs[0],
                         math_node("LESS_THAN", x, hi).outputs[0])

    pos = N.new("ShaderNodeNewGeometry")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(pos.outputs["Position"], sep.inputs[0])
    u = math_node("DIVIDE", math_node("ADD", sep.outputs[0], sep.outputs[1]).outputs[0], bay)
    v = math_node("DIVIDE", sep.outputs[2], floor)
    fu = math_node("FRACT", u.outputs[0])
    fv = math_node("FRACT", v.outputs[0])
    pane = math_node("MULTIPLY", between(fu.outputs[0], mortar / 2, 1 - mortar / 2).outputs[0],
                     between(fv.outputs[0], sill, head).outputs[0])
    if not glass:   # centre mullion splits each window into two lights
        mullion = math_node("GREATER_THAN", math_node("ABSOLUTE", math_node("SUBTRACT", fu.outputs[0], 0.5).outputs[0]).outputs[0], 0.025)
        pane = math_node("MULTIPLY", pane.outputs[0], mullion.outputs[0])

    cell = N.new("ShaderNodeCombineXYZ")                             # one random value per window
    L.new(math_node("FLOOR", u.outputs[0]).outputs[0], cell.inputs[0])
    L.new(math_node("FLOOR", v.outputs[0]).outputs[0], cell.inputs[1])
    noise = N.new("ShaderNodeTexWhiteNoise")
    noise.noise_dimensions = "3D"
    L.new(cell.outputs[0], noise.inputs["Vector"])
    rnd = noise.outputs["Value"]

    if fade:   # fewer windows lit the higher you go, like an office tower late at night
        thr = math_node("MULTIPLY_ADD", sep.outputs[2], 1.0 / fade)
        thr.inputs[2].default_value = 1.0 - lit
        on = math_node("GREATER_THAN", rnd, thr.outputs[0]).outputs[0]
    else:
        on = math_node("GREATER_THAN", rnd, 1.0 - lit).outputs[0]
    level = rnd
    if lobby:   # ground floor: tall shopfront glazing, most of it lit
        ground = math_node("LESS_THAN", sep.outputs[2], 3.3).outputs[0]
        front = math_node("MULTIPLY", between(fu.outputs[0], 0.04, 0.96).outputs[0],
                          between(fv.outputs[0], 0.06, 0.88).outputs[0])
        pane = math_node("MAXIMUM", pane.outputs[0], math_node("MULTIPLY", front.outputs[0], ground).outputs[0])
        shop = math_node("MULTIPLY", ground, math_node("GREATER_THAN", rnd, 0.55).outputs[0])
        on = math_node("MAXIMUM", on, shop.outputs[0]).outputs[0]

    geo = N.new("ShaderNodeNewGeometry")
    sn = N.new("ShaderNodeSeparateXYZ")
    L.new(geo.outputs["Normal"], sn.inputs[0])
    facade = math_node("LESS_THAN", math_node("ABSOLUTE", sn.outputs[2]).outputs[0], 0.5)
    window = math_node("MULTIPLY", pane.outputs[0], facade.outputs[0])

    lit_win = math_node("MULTIPLY", math_node("MULTIPLY", window.outputs[0], on).outputs[0], level)
    # Light coming from inside the room, not a coloured pane: brightest just under the ceiling light,
    # falling off towards the sill, darker towards the jambs (room depth). lu, lv: 0..1 across the opening.
    lu = math_node("DIVIDE", math_node("SUBTRACT", fu.outputs[0], mortar / 2).outputs[0], 1 - mortar)
    lv = math_node("DIVIDE", math_node("SUBTRACT", fv.outputs[0], sill).outputs[0], head - sill)
    lv = math_node("MINIMUM", math_node("MAXIMUM", lv.outputs[0], 0.0).outputs[0], 1.0)
    fall = math_node("POWER", lv.outputs[0], 2.2)                       # 0 at sill .. 1 at head
    fall = math_node("MULTIPLY_ADD", fall.outputs[0], 0.8, 0.12)
    lamp = math_node("GREATER_THAN", lv.outputs[0], 0.86)               # ceiling light strip
    room = math_node("MULTIPLY_ADD", lamp.outputs[0], 0.7, fall.outputs[0])
    edge = math_node("ABSOLUTE", math_node("MULTIPLY_ADD", lu.outputs[0], 2.0, -1.0).outputs[0])   # |2*lu - 1|
    depth = math_node("MULTIPLY_ADD", math_node("POWER", edge.outputs[0], 3.0).outputs[0], -0.55, 1.0)
    glow = math_node("MULTIPLY", room.outputs[0], depth.outputs[0])
    clutter = N.new("ShaderNodeTexNoise")               # furniture, partitions, people: rooms are not evenly lit
    clutter.inputs["Scale"].default_value = 2.2
    clutter.inputs["Detail"].default_value = 4.0
    L.new(pos.outputs["Position"], clutter.inputs["Vector"])
    busy = math_node("MULTIPLY_ADD", clutter.outputs["Fac"], 2.4, -0.55)
    busy.use_clamp = True
    glow = math_node("MULTIPLY", glow.outputs[0], math_node("MULTIPLY_ADD", busy.outputs[0], 0.7, 0.3).outputs[0])
    lit_win = math_node("MULTIPLY", lit_win.outputs[0], glow.outputs[0])
    strength = math_node("MULTIPLY_ADD", lit_win.outputs[0], power)
    L.new(math_node("MULTIPLY", window.outputs[0], 0.02).outputs[0], strength.inputs[2])

    tint = N.new("ShaderNodeMixRGB")                                # unlit panes read as dark glass
    L.new(window.outputs[0], tint.inputs["Fac"])
    tint.inputs["Color1"].default_value = (*wall, 1)
    if tex:   # real concrete between the windows
        tc, tr, tn = tex_nodes(nt, tex, tex_size, tex_gain, calm=0.6)
        L.new(tc, tint.inputs["Color1"])
        L.new(tr, b.inputs["Roughness"])
        L.new(tn, b.inputs["Normal"])
    if pane_tone is None:
        pane_tone = (0.05, 0.056, 0.066) if glass else (0.008, 0.009, 0.011)
    tint.inputs["Color2"].default_value = (*pane_tone, 1)
    L.new(tint.outputs["Color"], b.inputs["Base Color"])
    if glass:   # panes: clear, sharp, slightly uneven glass; frames: brushed metal
        pane_rough = math_node("MULTIPLY_ADD", rnd, 0.08)
        pane_rough.inputs[2].default_value = 0.02
        delta = math_node("SUBTRACT", pane_rough.outputs[0], 0.35)
        rough = math_node("MULTIPLY_ADD", window.outputs[0], delta.outputs[0])
        rough.inputs[2].default_value = 0.35
        L.new(rough.outputs[0], b.inputs["Roughness"])
        frame_metal = math_node("MULTIPLY_ADD", window.outputs[0], -metal)
        frame_metal.inputs[2].default_value = metal
        L.new(frame_metal.outputs[0], b.inputs["Metallic"])
        b.inputs["IOR"].default_value = 1.52
        # Painted-in reflections (as in architectural illustration): unlit panes carry a silver sheen,
        # strong on faces turned right (+x+y), gone on faces turned left, streaked and brighter higher up.
        face = N.new("ShaderNodeVectorMath")
        face.operation = "DOT_PRODUCT"
        L.new(geo.outputs["Normal"], face.inputs[0])
        face.inputs[1].default_value = (0.707, 0.707, 0.0)
        facing = math_node("MULTIPLY_ADD", face.outputs["Value"], 0.5)
        facing.inputs[2].default_value = 0.5
        facing = math_node("POWER", facing.outputs[0], 3.0)
        streak_uv = N.new("ShaderNodeCombineXYZ")
        L.new(math_node("MULTIPLY", math_node("ADD", sep.outputs[0], sep.outputs[1]).outputs[0], 0.7).outputs[0],
              streak_uv.inputs[0])
        L.new(math_node("MULTIPLY", sep.outputs[2], 0.04).outputs[0], streak_uv.inputs[1])
        streaks = N.new("ShaderNodeTexNoise")
        streaks.inputs["Scale"].default_value = 1.6
        streaks.inputs["Detail"].default_value = 2.0
        L.new(streak_uv.outputs[0], streaks.inputs["Vector"])
        streak = math_node("MULTIPLY_ADD", streaks.outputs["Fac"], 2.2)
        streak.inputs[2].default_value = -0.55
        streak.use_clamp = True
        height = math_node("MULTIPLY_ADD", sep.outputs[2], 1 / 70)
        height.inputs[2].default_value = 0.55
        unlit = math_node("MULTIPLY_ADD", on, -0.75)  # lit panes keep a quarter of the sheen: light behind glass
        unlit.inputs[2].default_value = 1.0
        sheen = math_node("MULTIPLY", window.outputs[0], unlit.outputs[0])
        sheen = math_node("MULTIPLY", sheen.outputs[0], facing.outputs[0])
        streak_mix = math_node("MULTIPLY_ADD", streak.outputs[0], 0.7)   # 0.3 .. 1.0
        streak_mix.inputs[2].default_value = 0.3
        sheen = math_node("MULTIPLY", sheen.outputs[0], streak_mix.outputs[0])
        sheen = math_node("MULTIPLY", sheen.outputs[0], height.outputs[0])
        refl = N.new("ShaderNodeEmission")
        refl.inputs["Color"].default_value = (0.8, 0.83, 0.88, 1)
        L.new(math_node("MULTIPLY", sheen.outputs[0], sheen_gain).outputs[0], refl.inputs["Strength"])
        add = N.new("ShaderNodeAddShader")
        out = next(n for n in N if n.type == "OUTPUT_MATERIAL")
        L.new(b.outputs["BSDF"], add.inputs[0])
        L.new(refl.outputs["Emission"], add.inputs[1])
        L.new(add.outputs["Shader"], out.inputs["Surface"])
    b.inputs["Emission Color"].default_value = (*warm, 1)
    if frame_glow:   # mullion grid catches stray light: silvery lines even on the shaded face
        frame = math_node("SUBTRACT", facade.outputs[0], window.outputs[0])
        if line_grid:   # hairline grid of its own, so dark floor bands between the rooms stay dark
            lb, lf, lw = line_grid
            gu = math_node("FRACT", math_node("DIVIDE", math_node("ADD", sep.outputs[0], sep.outputs[1]).outputs[0], lb).outputs[0])
            gv = math_node("FRACT", math_node("DIVIDE", sep.outputs[2], lf).outputs[0])
            lines = math_node("MAXIMUM", math_node("LESS_THAN", gu.outputs[0], lw / lb).outputs[0],
                              math_node("LESS_THAN", gv.outputs[0], lw / lf).outputs[0])
            frame = math_node("MULTIPLY", facade.outputs[0], lines.outputs[0])
        if glass:   # brightest on the lit face, still clearly there on the shaded one; broken up like real reflections
            frame = math_node("MULTIPLY", frame.outputs[0], math_node("MULTIPLY_ADD", facing.outputs[0], 0.7, 0.3).outputs[0])
            flick = N.new("ShaderNodeTexNoise")
            flick.inputs["Scale"].default_value = 1.3
            flick.inputs["Detail"].default_value = 3.0
            L.new(pos.outputs["Position"], flick.inputs["Vector"])
            catch = math_node("MULTIPLY_ADD", flick.outputs["Fac"], 2.0, -0.45)
            catch.use_clamp = True
            frame = math_node("MULTIPLY", frame.outputs[0], math_node("MULTIPLY_ADD", catch.outputs[0], 0.75, 0.25).outputs[0])
        lit_sum = strength
        strength = math_node("MULTIPLY_ADD", frame.outputs[0], frame_glow)
        L.new(lit_sum.outputs[0], strength.inputs[2])
        glow = N.new("ShaderNodeMixRGB")                 # warm where a room is lit, silver on the lines
        warm_mask = math_node("MULTIPLY", lit_win.outputs[0], 40.0)
        warm_mask.use_clamp = True
        L.new(warm_mask.outputs[0], glow.inputs["Fac"])
        glow.inputs["Color1"].default_value = (0.82, 0.84, 0.88, 1)
        glow.inputs["Color2"].default_value = (*warm, 1)
        L.new(glow.outputs["Color"], b.inputs["Emission Color"])
    L.new(strength.outputs[0], b.inputs["Emission Strength"])
    return m


M_ground = mat("City Ground", (0.004, 0.004, 0.005), 0.9)
M_road = tex_mat("City Road", "asphalt_02", 3.0, 0.12)
M_block = tex_mat("City Block", "concrete", 4.0, 0.07)
M_roof = tex_mat("City Roof", "asphalt_02", 3.0, 1.2)
M_tree = mat("City Tree", (0.035, 0.04, 0.037), 0.9)
_tn = M_tree.node_tree   # leafy clumps instead of smooth balls
_leaf = _tn.nodes.new("ShaderNodeTexNoise")
_leaf.inputs["Scale"].default_value = 3.5
_leaf.inputs["Detail"].default_value = 6.0
_bump = _tn.nodes.new("ShaderNodeBump")
_bump.inputs["Strength"].default_value = 0.8
_tn.links.new(_leaf.outputs["Fac"], _bump.inputs["Height"])
_tn.links.new(_bump.outputs["Normal"], next(n for n in _tn.nodes if n.type == "BSDF_PRINCIPLED").inputs["Normal"])
M_dash = mat("City Lane", (0, 0, 0), 1, emit=(0.8, 0.85, 1.0), strength=0.4)
M_edge = mat("City Edge", (0, 0, 0), 1, emit=(0.85, 0.9, 1.0), strength=1.6)
M_edge_dim = mat("City Edge Dim", (0, 0, 0), 1, emit=(0.7, 0.75, 0.85), strength=0.3)
M_edge_faint = mat("City Edge Faint", (0, 0, 0), 1, emit=(0.6, 0.65, 0.75), strength=0.1)
M_cross = mat("City Cross", (0, 0, 0), 1, emit=(1, 1, 1), strength=5)
M_slab = tex_mat("City Slab", "concrete", 4.0, 0.6)
M_fin = mat("City Fin", (0.2, 0.21, 0.23), 0.3, metallic=0.3, emit=(0.82, 0.84, 0.88), strength=0.15)
M_kit = tex_mat("City Rooftop Kit", "metal_plate_02", 2.0, 1.4, metallic=0.5)
M_stack = mat("Chimney", (0.3, 0.3, 0.32), 0.5)
M_street = mat("Street Light", (0, 0, 0), 1, emit=(1.0, 0.8, 0.6), strength=5)
M_cage_glass = mat("Cage Glass", (0.6, 0.62, 0.66), 0.08)
_cb = next(n for n in M_cage_glass.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
_cb.inputs["Alpha"].default_value = 0.07
try:
    M_cage_glass.surface_render_method = "BLENDED"
except AttributeError:
    M_cage_glass.blend_method = "BLEND"
M_cage_glass.use_backface_culling = False
M_wire_fine = mat("Wire Fine", (0, 0, 0), 1, emit=(0.8, 0.84, 0.9), strength=0.5)

# Tower fins: polished chrome. No colour or glow of its own; it only mirrors what is around it
# (the city-glow sky on the lit side, the night on the shaded side, and the street lights below).
M_fin_mirror = mat("Mirror Fin", (0.97, 0.97, 0.98), 0.03, metallic=1.0)

M_amber = mat("SURDS Amber", (0, 0, 0), 1, emit=(1.0, 0.42, 0.1), strength=5)
M_node = mat("SURDS Node", (0, 0, 0), 1, emit=(1.0, 0.62, 0.3), strength=10)

# Tower: near-black glass behind a dense hairline grid of mullions that catch the light (as in the reference)
W_glass = window_mat("Glass Tower Windows", 0.9, bay=1.6, floor=1.7, glass=True, mortar=0.08, sill=0.3, head=0.86,
                     power=2.6, fade=20, line_grid=(0.8, 0.85, 0.035), wall=(0.06, 0.062, 0.068), pane_tone=(0.012, 0.013, 0.016),
                     metal=0.8, frame_glow=2.6, sheen_gain=0.12)
W_curtain = window_mat("Curtain Wall Windows", 0.3, bay=1.5, floor=3.6, glass=True, mortar=0.08, sill=0.24, head=0.82,
                       power=1.4, fade=30, wall=(0.09, 0.095, 0.105))
W_curtain_dark = window_mat("Background Curtain Wall", 0.08, bay=1.5, floor=3.6, glass=True, mortar=0.08, sill=0.1,
                            head=0.92, power=1.3, lobby=False, wall=(0.03, 0.032, 0.036))
W_office = window_mat("Office Windows", 0.3, bay=1.0, floor=3.6, mortar=0.32, sill=0.4, head=0.72,
                      wall=(0.16, 0.16, 0.165), tex="concrete", tex_gain=0.6)
W_dc = window_mat("Data Center Windows", 0.35, bay=0.8, floor=5.0, mortar=0.24, sill=0.18, head=0.86, wall=(0.15, 0.15, 0.155),
                  tex="concrete_tile_facade", tex_size=2.1, tex_gain=2.2)
W_ribbon = window_mat("Ribbon Windows", 0.3, bay=2.6, floor=3.6, mortar=0.06, sill=0.42, head=0.74, wall=(0.17, 0.17, 0.175),
                      tex="concrete", tex_gain=0.62)
W_lobby_glass = window_mat("Lobby Glass", 0.9, bay=1.2, floor=4.2, glass=True, mortar=0.08, sill=0.05, head=0.95, power=1.6)
W_plant = window_mat("Plant Windows", 0.22, bay=1.3, floor=4.0, mortar=0.36, sill=0.5, head=0.8, wall=(0.15, 0.15, 0.155),
                     tex="concrete", tex_gain=0.55)
W_dark = window_mat("Background Windows", 0.07, bay=1.1, floor=3.6, mortar=0.36, sill=0.4, head=0.72, power=1.4,
                    lobby=False,
                    wall=(0.03, 0.03, 0.034), tex="concrete", tex_gain=0.18)
W_filler = window_mat("Filler Windows", 0.12, bay=1.1, floor=3.6, mortar=0.36, sill=0.4, head=0.72, power=1.6,
                      lobby=False,
                      wall=(0.04, 0.04, 0.044), tex="concrete", tex_gain=0.25)

# ---------------------------------------------------------------- geometry helpers
footprints = []
GROUPS = []      # one entry per thing that gets built: solid, edge cage, parts that ride on top
LINKS = []       # SURDS network curves, in draw order
NODES = []       # (node object, route index it lights up with)
POWER_LINES = []


def group(name, solid, edges=(), attach=(), x=0.0, y=0.0, w=1.0, d=1.0, h=1.0, hero=False, kind="building",
          background=False):
    g = dict(name=name, solid=solid, edges=list(edges), attach=list(attach),
             x=x, y=y, w=w, d=d, h=h, hero=hero, kind=kind)
    GROUPS.append(g)
    for o in [solid] + list(attach):
        if o.type == "MESH":
            (quiet if background else outlined).objects.link(o)
    return g


def frange(a, b, s):
    out, x = [], a
    while x < b - 1e-6:
        out.append(x)
        x += s
    return out


def cube_bm(w, d, h, bm=None, off=(0, 0, 0)):
    bm = bm or bmesh.new()
    bmesh.ops.create_cube(bm, size=1,
                          matrix=Matrix.Translation((off[0], off[1], off[2] + h / 2)) @ Matrix.Diagonal((w, d, h, 1)))
    return bm


def mesh_obj(name, bm, m, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if m:
        me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    col.objects.link(o)
    return o


def box(name, x, y, w, d, h, m, z=0.0, solid=True):
    if solid:
        footprints.append((x - w / 2, y - d / 2, x + w / 2, y + d / 2))
    return mesh_obj(name, cube_bm(w, d, h), m, (x, y, z))


def cut(bm, axis, positions):
    for p in positions:
        co, no = [0, 0, 0], [0, 0, 0]
        co[axis], no[axis] = p, 1
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)


def wire(name, x, y, w, d, h, m, dz=3.5, dxy=2.5, z=0.0, thick=0.05, pad=0.06, z0=0.0, rise=0.0):
    """Glowing edge cage around a building: floor rings and vertical mullions. z0 lifts it onto an upper tier."""
    bm = cube_bm(w + pad, d + pad, h + pad / 2 + rise, off=(0, 0, z0))
    if dz:
        cut(bm, 2, frange(z0 + dz, z0 + h, dz))
    if dxy:
        cut(bm, 0, frange(-w / 2 + dxy, w / 2, dxy))
        cut(bm, 1, frange(-d / 2 + dxy, d / 2, dxy))
    o = mesh_obj(name, bm, m, (x, y, z))
    mod = o.modifiers.new("Wire", "WIREFRAME")
    mod.thickness = thick
    mod.use_even_offset = True
    return o


def kit(bm, w, d, h, off, mi):
    """Box added to a multi-material detail mesh; mi picks the slot (0 slab, 1 fin, 2 rooftop kit)."""
    r = bmesh.ops.create_cube(bm, size=1,
                              matrix=Matrix.Translation((off[0], off[1], off[2] + h / 2)) @ Matrix.Diagonal((w, d, h, 1)))
    for v in r["verts"]:
        for f in v.link_faces:
            f.material_index = mi


def details(name, x, y, tiers, style, floor, z=0.0, hero=False, fin=None, fin_scale=1.0):
    """Floor slabs, glass fins, parapets and rooftop plant for a building's tiers; hero buildings also get
    entrance canopies, louvred plant screens and roof railings."""
    bm = bmesh.new()
    for w, d, z0, z1 in tiers:
        for zz in (frange(z0 + floor, z1 - 0.5, floor) if fin_scale == 1.0 else []):   # tower: no slab bands
            kit(bm, w + 0.3, d + 0.3, 0.14, (0, 0, zz - 0.07), 0)
        if style == "glass":
            for t in frange(-w / 2 + 1.5, w / 2 - 0.3, 1.5):
                for sy in (-1, 1):
                    kit(bm, 0.1 * fin_scale, 0.28 * fin_scale, z1 - z0, (t, sy * (d / 2 + 0.1 * fin_scale), z0), 1)
            for t in frange(-d / 2 + 1.5, d / 2 - 0.3, 1.5):
                for sx in (-1, 1):
                    kit(bm, 0.28 * fin_scale, 0.1 * fin_scale, z1 - z0, (sx * (w / 2 + 0.1 * fin_scale), t, z0), 1)
        p, t = 0.55, 0.18
        for sy in (-1, 1):
            kit(bm, w + 0.1, t, p, (0, sy * (d / 2 - t / 2 + 0.05), z1), 0)
        for sx in (-1, 1):
            kit(bm, t, d + 0.1, p, (sx * (w / 2 - t / 2 + 0.05), 0, z1), 0)
    w, d, _, top = tiers[-1]
    if style == "glass" and top > 30:     # tower: stair and lift housing in the middle of the roof, door facing the camera
        kit(bm, 3.0, 2.4, 2.6, (0, 0, top), 0)
        kit(bm, 3.2, 2.6, 0.12, (0, 0, top + 2.6), 0)
        kit(bm, 0.9, 0.08, 2.0, (0.6, -1.24, top), 1)
    for _ in range(random.randint(2, 4 + int(w * d // 25)) if top <= 30 else 2):   # bigger roofs carry more plant
        rw, rd = random.uniform(0.5, min(2.2, w * 0.35)), random.uniform(0.5, min(1.8, d * 0.35))
        kit(bm, rw, rd, random.uniform(0.3, 1.2),
            (random.uniform(-w / 2 + rw / 2 + 0.4, w / 2 - rw / 2 - 0.4),
             random.uniform(-d / 2 + rd / 2 + 0.4, d / 2 - rd / 2 - 0.4), top), 2)
    if 12 < top <= 30:
        kit(bm, 0.12, 0.12, 2.5 + top * 0.08, (w * 0.25, -d * 0.2, top), 1)
    if hero:
        w0, d0 = tiers[0][0], tiers[0][1]
        cw = min(4.5, w0 * 0.45)                                      # entrance canopy on posts, camera side
        kit(bm, cw, 1.8, 0.16, (w0 * 0.12, -d0 / 2 - 0.9, 3.3), 0)
        for px in (w0 * 0.12 - cw / 2 + 0.2, w0 * 0.12 + cw / 2 - 0.2):
            kit(bm, 0.12, 0.12, 3.3, (px, -d0 / 2 - 1.6, 0), 1)
        kit(bm, 1.6, min(3.5, d0 * 0.4), 0.16, (w0 / 2 + 0.8, d0 * 0.1, 3.0), 0)   # side door canopy
        if top <= 12:                                                 # louvred plant screen under the parapet
            for i in range(5):
                zz = top - 0.5 - i * 0.28
                kit(bm, w * 0.86, 0.1, 0.07, (0, -d / 2 - 0.08, zz), 1)
                kit(bm, 0.1, d * 0.86, 0.07, (w / 2 + 0.08, 0, zz), 1)
        for sy in (-1, 1):                                            # roof railing
            kit(bm, w - 0.3, 0.05, 0.05, (0, sy * (d / 2 - 0.2), top + 1.05), 1)
        for sx in (-1, 1):
            kit(bm, 0.05, d - 0.3, 0.05, (sx * (w / 2 - 0.2), 0, top + 1.05), 1)
    o = mesh_obj(name + " Details", bm, None, (x, y, z))
    for m in (M_slab, fin or M_fin, M_kit):
        o.data.materials.append(m)
    return o


def building(name, x, y, w, d, h, wm, edge=M_edge_dim, dz=None, dxy=None, thick=0.04, hero=False,
             style="slab", floor=3.6, setbacks=(), z=0.0, cage_pad=0.06, cage_rise=0.0, background=False,
             cage_glass=False):
    """A building of one or more tiers. setbacks: (fraction of height, inset) for each step back."""
    tiers, z0, inset = [], 0.0, 0.0
    for frac, step in setbacks:
        z1 = max(floor, round(h * frac / floor) * floor)
        tiers.append((w - 2 * inset, d - 2 * inset, z0, z1))
        z0, inset = z1, inset + step
    tiers.append((w - 2 * inset, d - 2 * inset, z0, h))

    if style == "glass":
        wm = {W_office: W_curtain, W_dark: W_curtain_dark, W_filler: W_curtain_dark}.get(wm, wm)
    bm = bmesh.new()
    for tw, td, a, b in tiers:
        cube_bm(tw, td, b - a, bm, off=(0, 0, a))
    s = mesh_obj(name, bm, wm, (x, y, z))
    bev = s.modifiers.new("Edge Highlight", "BEVEL")     # rounded corners catch the moonlight
    bev.width = 0.06
    bev.segments = 2
    bev.limit_method = "ANGLE"
    footprints.append((x - w / 2, y - d / 2, x + w / 2, y + d / 2))

    tw, td, _, _ = tiers[-1]
    r = box(name + " Roof", x, y, tw * 0.98, td * 0.98, 0.15, M_roof, z=z + h, solid=False)
    edges = [wire(f"{name} Edges {k + 1}", x, y, tw, td, b - a, edge, dz=dz, dxy=dxy, z=z, thick=thick, z0=a,
                  pad=cage_pad, rise=cage_rise if k == len(tiers) - 1 else 0.0)
             for k, (tw, td, a, b) in enumerate(tiers)]
    if cage_glass:   # faint glass skin hung on the stand-off frame; reads as a clear crown above the roof
        gw, gd, _, _ = tiers[-1]
        bm = cube_bm(gw + cage_pad, gd + cage_pad, h + cage_pad / 2 + cage_rise)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.normal.z) > 0.5], context="FACES")
        edges.append(mesh_obj(name + " Glass Skin", bm, M_cage_glass, (x, y, z)))
        edges.append(wire(name + " Skin Grid", x, y, gw, gd, h, M_wire_fine, dz=floor, dxy=gw / 4, z=z,
                          thick=0.006, pad=cage_pad, rise=cage_rise))
    return group(name, s, edges, [r, details(name, x, y, tiers, style, floor, z, hero=hero,
                                                       fin=M_fin_mirror if cage_glass else None,
                                                       fin_scale=0.25 if cage_glass else 1.0)], x, y, w, d, h, hero=hero,
                 background=background)


def cylinder(name, x, y, r, h, m, z=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=r, radius2=r, depth=h,
                          matrix=Matrix.Translation((0, 0, h / 2)))
    footprints.append((x - r, y - r, x + r, y + r))
    return mesh_obj(name, bm, m, (x, y, z))


def path(name, pts, m=M_amber, bevel=0.07, z=0.14):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = bevel
    cu.bevel_resolution = 2
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, xy in zip(sp.points, pts):
        p.co = (xy[0], xy[1], xy[2] if len(xy) > 2 else z, 1)
    cu.materials.append(m)
    o = bpy.data.objects.new(name, cu)
    col.objects.link(o)
    return o


def node(name, x, y, r=0.35, m=M_node, z=0.14):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=r)
    return mesh_obj(name, bm, m, (x, y, z))


def pylon(name, x, y, h=15.0, m=M_edge_dim):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=4, radius1=1.5, radius2=0.35, depth=h,
                          matrix=Matrix.Translation((0, 0, h / 2)) @ Matrix.Rotation(math.pi / 4, 4, "Z"))
    cut(bm, 2, frange(h / 6, h, h / 6))
    cube_bm(6.0, 0.25, 0.25, bm, off=(0, 0, h * 0.82))
    cube_bm(4.4, 0.25, 0.25, bm, off=(0, 0, h * 0.62))
    o = mesh_obj(name, bm, m, (x, y, 0))
    mod = o.modifiers.new("Wire", "WIREFRAME")
    mod.thickness = 0.07
    return o


# ---------------------------------------------------------------- ground, roads, blocks
ROADS = [-30, -10, 10, 30]
box("Ground", 0, 0, 104, 104, 0.1, M_ground, z=-0.1, solid=False)

bm = bmesh.new()
for r in ROADS:
    cube_bm(5, 104, 0.02, bm, off=(r, 0, 0))
    cube_bm(104, 5, 0.02, bm, off=(0, r, 0))
mesh_obj("Roads", bm, M_road)

bm = bmesh.new()
for r in ROADS:
    for side in (-1.3, 1.3):
        for t in frange(-50, 50, 4.0):
            if any(abs(t + 0.8 - o) < 3.2 for o in ROADS):
                continue
            cube_bm(0.12, 1.6, 0.01, bm, off=(r + side, t + 0.8, 0.02))
            cube_bm(1.6, 0.12, 0.01, bm, off=(t + 0.8, r + side, 0.02))
mesh_obj("Lane Markings", bm, M_dash)

M_trail = mat("Headlight Trail", (0, 0, 0), 1, emit=(1.0, 0.93, 0.85), strength=0.8)
M_tail = mat("Tail Light Trail", (0, 0, 0), 1, emit=(0.9, 0.86, 0.8), strength=0.35)
for nm, side, m in (("Headlight Trails", -0.55, M_trail), ("Tail Light Trails", 0.55, M_tail)):
    bm = bmesh.new()
    for r in ROADS:
        for horiz in (False, True):
            t = random.uniform(-52, -44)
            while t < 50:
                ln = random.uniform(3, 11)
                if horiz:
                    cube_bm(ln, 0.05, 0.01, bm, off=(t + ln / 2, r + side, 0.03))
                else:
                    cube_bm(0.05, ln, 0.01, bm, off=(r + side, t + ln / 2, 0.03))
                t += ln + random.uniform(2, 9)
    mesh_obj(nm, bm, m)

bm = bmesh.new()
for i in range(-2, 3):
    for j in range(-2, 3):
        if (i, j) != (0, 0):   # the middle is the expressway interchange
            cube_bm(15, 15, 0.15, bm, off=(20 * i, 20 * j, 0))
mesh_obj("City Blocks", bm, M_block)

# Expressway interchange in the middle: open paved ground, dense lanes of traffic both ways
mesh_obj("Expressway", cube_bm(25, 25, 0.02, off=(0, 0, 0)), M_road)
for nm, m, side in (("Expressway Headlights", M_trail, -1), ("Expressway Tail Lights", M_tail, 1)):
    bm = bmesh.new()
    for k in range(4):                           # four lanes each way on both carriageways
        c = side * (0.9 + k * 1.15)
        for horiz in (False, True):
            t = random.uniform(-14, -10)
            while t < 13:
                ln = min(random.uniform(2, 7), 13 - t)
                if not (horiz and abs(t + ln / 2) < 5.5):   # cross traffic stops at the junction
                    if horiz:
                        cube_bm(ln, 0.06, 0.01, bm, off=(t + ln / 2, c, 0.035))
                    else:
                        cube_bm(0.06, ln, 0.01, bm, off=(c, t + ln / 2, 0.035))
                t += ln + random.uniform(1, 4)
    mesh_obj(nm, bm, m)
bm = bmesh.new()                                 # central reservations and kerbs
for horiz in (False, True):
    for c in (0.0, -5.6, 5.6):
        if horiz:
            for a, b in ((-12.5, -5.6), (5.6, 12.5)):
                cube_bm(b - a, 0.25, 0.12, bm, off=((a + b) / 2, c, 0))
        else:
            cube_bm(0.25, 25, 0.12, bm, off=(c, 0, 0))
mesh_obj("Expressway Kerbs", bm, M_slab)

# ---------------------------------------------------------------- the six building types
Z0 = 0.15  # top of block pads

# Commercial tower (left corner): a plain silver glass block, metal frame on its corners only
building("Commercial Tower", -20, -20, 12, 9, 36, W_glass, edge=M_edge, dz=None, dxy=None, thick=0.012, hero=True,
         style="glass", floor=3.4, z=Z0, cage_pad=0.9, cage_rise=3.5, cage_glass=True)

# Two cooling plants across the road from the tower, leaving open ground around it
def cooling_towers(g, spots, r=1.4, h=3.2):
    bm = bmesh.new()
    for cx, cy in spots:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r, radius2=r * 0.78, depth=h,
                              matrix=Matrix.Translation((cx, cy, h / 2)))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r * 0.84, radius2=r * 0.84, depth=0.3,
                              matrix=Matrix.Translation((cx, cy, h + 0.15)))
    o = mesh_obj(g["name"] + " Cooling Towers", bm, M_kit, (g["x"], g["y"], g["h"]))
    g["attach"].append(o)
    outlined.objects.link(o)


cooling_towers(building("Cooling Plant A", -23.5, 2.5, 6.5, 6, 7.2, W_plant, edge=M_edge_dim, floor=3.6),
               [(-1.4, -1.2), (1.5, 1.2)])
cooling_towers(building("Cooling Plant B", -15.5, -2.5, 5.5, 6.5, 6.0, W_plant, edge=M_edge_dim, floor=3.0),
               [(0, -1.5), (0, 1.6)], r=1.2, h=2.8)

# Commercial low-rise (back centre)
building("Office Block", 0, 21, 13, 8, 7.2, W_office, dz=3.6, hero=True, style="glass")
building("Office Wing", 4, 15.5, 5, 3, 4, W_office)

# Data center (back right): long lit halls, rooftop chillers
dc = building("Data Center", 18, 20, 9, 11, 10, W_dc, edge=M_edge_dim, dz=5.0, dxy=None, hero=True, floor=5.0)
building("Data Center Hall", 24.4, 20, 4, 9, 7, W_dc, edge=M_edge_dim, floor=3.5)
bm = bmesh.new()
for cx in (-2.4, 0.0, 2.4):
    for cy in (-3.4, 0.0, 3.4):
        kit(bm, 1.9, 2.6, 1.1, (cx, cy, 0), 0)
        kit(bm, 1.3, 1.3, 0.25, (cx, cy, 1.1), 0)          # fan housing
mesh_obj("Data Center Chillers", bm, M_kit, (18, 20, 10.0))
dc["attach"].append(bpy.data.objects["Data Center Chillers"])
outlined.objects.link(bpy.data.objects["Data Center Chillers"])

# Energy & utilities (right): plant hall + stacks
building("Power Plant", 20, 0, 13, 9, 8, W_plant, edge=M_edge_dim, dz=4.0, dxy=3.25, hero=True, floor=4.0,
         setbacks=[(0.5, 2.0)])
for k, cx in enumerate((15.2, 17.6, 20.0, 22.4, 24.8)):
    sh = 21 + (k % 2) * 4
    group(f"Stack {k + 1}",
          cylinder(f"Stack {k + 1}", cx, 3.3, 0.36, sh, M_stack, z=Z0),
          [wire(f"Stack {k + 1} Rings", cx, 3.3, 0.8, 0.8, sh, M_edge_dim, dz=4.0, dxy=None, z=Z0, thick=0.03)],
          x=cx, y=3.3, w=0.8, d=0.8, h=sh, kind="stack")

# Clean rooms & pharma (front left): low lab block, gridded roof cage
building("Clean Room Lab", -20, 19, 11, 8, 11, W_ribbon, edge=M_edge, dz=3.6, dxy=2.0, hero=True)
building("Clean Room Wing", -22, 24.8, 7, 3.6, 6.5, W_ribbon, edge=M_edge_dim)
building("Clean Room Annex", -14.8, 25, 4.5, 4, 4.5, W_plant)

# Healthcare & labs (front centre): tower with lit cross
hosp = building("Hospital", 0, -20, 8, 8, 15, W_office, edge=M_edge_dim, dz=3.6, hero=True)
building("Hospital Wing", -4.5, -24, 6, 5, 6, W_office)
building("Hospital Lobby", 3.6, -24.2, 4, 3.5, 4.2, W_lobby_glass, edge=M_edge, floor=4.2)
hosp["attach"] += [box("Hospital Cross V", 0, -24.09, 0.7, 0.1, 3.0, M_cross, z=Z0 + 10.5, solid=False),
                   box("Hospital Cross H", 0, -24.09, 2.4, 0.1, 0.7, M_cross, z=Z0 + 11.65, solid=False)]

# Substation (front right): pad, transformers, pylons
box("Substation Pad", 20, -20, 12, 10, 0.2, M_roof, z=Z0, solid=False)
for k, (cx, cy) in enumerate([(17, -17.5), (21, -17.5), (17, -22), (21, -22)]):
    group(f"Transformer {k + 1}",
          box(f"Transformer {k + 1}", cx, cy, 2.4, 2.0, 2.2, M_roof, z=Z0 + 0.2),
          [wire(f"Transformer {k + 1} Edges", cx, cy, 2.4, 2.0, 2.2, M_edge_dim, dz=None, dxy=None, z=Z0 + 0.2, thick=0.03)],
          x=cx, y=cy, w=2.4, d=2.0, h=2.2, kind="substation")
pylons = [(25, -15), (25, -25), (36, -20), (46, -20)]
for k, (px, py) in enumerate(pylons):
    group(f"Pylon {k + 1}", pylon(f"Pylon {k + 1}", px, py), x=px, y=py, h=15, kind="substation")
for a, b in [(0, 1), (0, 2), (1, 2), (2, 3)]:
    (ax, ay), (bx, by) = pylons[a], pylons[b]
    for s in (-2.9, 2.9):
        POWER_LINES.append(path(f"Power Line {a}-{b}", [(ax + s, ay, 12.4), (bx + s, by, 12.4)], M_edge_dim, bevel=0.02))

# ---------------------------------------------------------------- filler city
def filler_block(cx, cy, wm, density=0.75, hmax=14, edge=M_edge_faint):
    for sx in (-3.6, 3.6):
        for sy in (-3.6, 3.6):
            if random.random() > density:
                continue
            w, d = random.uniform(4.5, 6.5), random.uniform(4.5, 6.5)
            h = random.choice([3.6, 7.2, 7.2, 10.8, hmax])
            h = min(h, hmax)
            style = "glass" if random.random() < 0.22 else "slab"
            steps = [(0.6, 0.9)] if h >= 10.8 and random.random() < 0.5 else []
            building(f"Building {cx}_{cy}_{sx}_{sy}", cx + sx, cy + sy, w, d, h, wm, edge=edge,
                     style=style, setbacks=steps, background=True)

for i in range(-2, 3):
    for j in range(-2, 3):
        if abs(i) == 2 or abs(j) == 2:
            if (i, j) == (2, -1):
                continue  # keep the power line corridor clear
            front = i == 2 or j == -2  # between the camera and the hero buildings
            near_tower = i <= -1 and j <= 0   # keep the tower's surroundings open
            filler_block(20 * i, 20 * j, W_dark, density=0.15 if near_tower else 0.3 if front else 0.45,
                         hmax=7.2 if front or near_tower else 12)

# ---------------------------------------------------------------- trees
def free(x, y, r=1.0):
    return not any(a - r < x < c + r and b - r < y < d + r for a, b, c, d in footprints)

# Street trees in even rows along every block edge. With the darkened Poly Haven jacaranda ("Street Tree"
# in the Tree Library collection, built from source/trees) they are instanced on points; otherwise simple balls.
tree_spots = []
tree_rng = random.Random(11)
TREE_KEEP = 0.6    # share of row spots that get a tree: sparse rows, not a forest
for i in range(-2, 3):
    for j in range(-2, 3):
        cx, cy = 20 * i, 20 * j
        if (i, j) == (0, 0):
            continue
        for t in frange(-6.4, 6.5, 6.4):
            for x, y in [(cx + t, cy - 6.6), (cx + t, cy + 6.6), (cx - 6.6, cy + t), (cx + 6.6, cy + t)]:
                if free(x, y, 1.6) and tree_rng.random() < TREE_KEEP:
                    tree_spots.append((x, y))
tree_spots = list(dict.fromkeys(tree_spots))

TREE_TPL = bpy.data.objects.get("Street Tree")
_tree_lib = "/home/boom/SURDS_docs/website/source/trees/street_tree.blend"   # made by make_street_tree.py
if TREE_TPL is None and os.path.exists(_tree_lib):
    with bpy.data.libraries.load(_tree_lib) as (_src, _dst):
        _dst.objects = ["Street Tree"]
    TREE_TPL = _dst.objects[0]
    _lib = bpy.data.collections.get("Tree Library") or bpy.data.collections.new("Tree Library")
    if _lib.name not in scene.collection.children:
        scene.collection.children.link(_lib)
    _lib.objects.link(TREE_TPL)
# Trees read as flat black silhouettes against the lit ground: every tree material goes matte black,
# keeping only the leaf alpha cut-outs.
if TREE_TPL:
    for m in TREE_TPL.data.materials:
        nt = m.node_tree
        alpha = next((n.image for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and "alpha" in n.image.name), None)
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        black = nt.nodes.new("ShaderNodeBsdfDiffuse")
        black.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1)
        if alpha:   # leaf cards keep their cut-out shape
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = alpha
            mix = nt.nodes.new("ShaderNodeMixShader")
            nt.links.new(tex.outputs["Color"], mix.inputs["Fac"])
            nt.links.new(nt.nodes.new("ShaderNodeBsdfTransparent").outputs[0], mix.inputs[1])
            nt.links.new(black.outputs[0], mix.inputs[2])
            nt.links.new(mix.outputs[0], out.inputs["Surface"])
        else:
            nt.links.new(black.outputs[0], out.inputs["Surface"])
bm = bmesh.new()
if TREE_TPL:
    for x, y in tree_spots:
        bm.verts.new((x, y, Z0))
    TREES = mesh_obj("Trees", bm, None)
    ng = bpy.data.node_groups.get("Street Tree Scatter") or bpy.data.node_groups.new("Street Tree Scatter", "GeometryNodeTree")
    ng.nodes.clear()
    for sock in list(ng.interface.items_tree):
        ng.interface.remove(sock)
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    gi, go = ng.nodes.new("NodeGroupInput"), ng.nodes.new("NodeGroupOutput")
    info = ng.nodes.new("GeometryNodeObjectInfo")
    info.inputs["Object"].default_value = TREE_TPL
    inst = ng.nodes.new("GeometryNodeInstanceOnPoints")
    rot = ng.nodes.new("FunctionNodeRandomValue")
    rot.data_type = "FLOAT_VECTOR"
    rot.inputs["Max"].default_value = (0, 0, 6.283)
    scl = ng.nodes.new("FunctionNodeRandomValue")
    scl.data_type = "FLOAT"
    scl.inputs[2].default_value = 0.52     # min
    scl.inputs[3].default_value = 0.68     # max
    scl.inputs["Seed"].default_value = 7
    ng.links.new(gi.outputs[0], inst.inputs["Points"])
    ng.links.new(info.outputs["Geometry"], inst.inputs["Instance"])
    ng.links.new(rot.outputs["Value"], inst.inputs["Rotation"])
    ng.links.new(scl.outputs[1], inst.inputs["Scale"])
    ng.links.new(inst.outputs["Instances"], go.inputs[0])
    TREES.modifiers.new("Trees", "NODES").node_group = ng
    # Trees live in their own collection and render on their own view layer without Freestyle (outlining
    # hundreds of leaf cards blows up memory); the compositor lays them back over the city.
    tree_col = bpy.data.collections.get("SURDS Trees") or bpy.data.collections.new("SURDS Trees")
    if tree_col.name not in scene.collection.children:
        scene.collection.children.link(tree_col)
    for c in list(TREES.users_collection):
        c.objects.unlink(TREES)
    tree_col.objects.link(TREES)
else:
    for x, y in tree_spots:
        s = random.uniform(0.8, 1.15)
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.05 * s, matrix=Matrix.Translation((x, y, Z0 + 1.4 * s)))
        cube_bm(0.14, 0.14, 0.7 * s, bm, off=(x, y, Z0))
    TREES = mesh_obj("Trees", bm, M_tree)

bm = bmesh.new()
for r in ROADS:
    for side in (-2.9, 2.9):
        for t in frange(-50, 50, 6.0):
            if any(abs(t - o) < 3.5 for o in ROADS):
                continue
            for px, py in ((r + side, t), (t, r + side)):
                bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=0.13,
                                          matrix=Matrix.Translation((px, py, 1.6)))
STREET_LIGHTS = mesh_obj("Street Lights", bm, M_street)

# ---------------------------------------------------------------- SURDS network
HUB = (10, 10)
routes = {
    "Office": [HUB, (0, 10), (0, 16.8)],
    "Data Center": [HUB, (20, 10), (20, 14.3)],
    "Power Plant": [HUB, (10, 0), (13.3, 0)],
    "Clean Room": [HUB, (-10, 10), (-20, 10), (-20, 14.8)],
    "Hospital": [HUB, (10, -10), (0, -10), (0, -15.8)],
    "Tower": [(0, -10), (-10, -10), (-10, -20), (-15.0, -20)],
    "Substation": [(10, -10), (20, -10), (20, -14.8)],
}
seen = set()
for i, (name, pts) in enumerate(routes.items()):
    LINKS.append(path(f"Link {name}", pts))
    for p in pts[1:]:
        if p not in seen:
            seen.add(p)
            NODES.append((node(f"Node {name} {len(seen)}", *p, r=0.32), i))
HUB_NODE = node("Hub", *HUB, r=0.75)

# ---------------------------------------------------------------- spread the city apart
# Everything is laid out on a 20 m grid; push it all out by SPREAD from the centre. Buildings, pylons and
# rooftop kit keep their size and only move; ground, roads, block pads and the expressway stretch to fill;
# merged meshes of many small parts (trees, street lights, lane dashes, light trails) move part by part.
SPREAD = 1.45
STRETCH = {"Ground", "Roads", "City Blocks", "Expressway", "Expressway Kerbs"}


def spread_parts(me):
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    seen = set()
    for v in bm.verts:
        if v.index in seen:
            continue
        part, stack = [], [v]
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            part.append(cur)
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        cx = sum(p.co.x for p in part) / len(part)
        cy = sum(p.co.y for p in part) / len(part)
        for p in part:
            p.co.x += cx * (SPREAD - 1)
            p.co.y += cy * (SPREAD - 1)
    bm.to_mesh(me)
    bm.free()


# parts of a building (cage, roof, details, cross, chillers ...) move with the building, not on their own
owner = {}
for g in GROUPS:
    for part in [g["solid"]] + g["edges"] + g["attach"]:
        owner[part.name] = (g["x"], g["y"])

for o in col.all_objects:
    if o.name in owner:
        gx, gy = owner[o.name]
        o.location.x += gx * (SPREAD - 1)
        o.location.y += gy * (SPREAD - 1)
    elif o.type == "CURVE":
        for sp in o.data.splines:
            for pt in sp.points:
                pt.co.x *= SPREAD
                pt.co.y *= SPREAD
    elif o.parent is None and o.type == "MESH" and o.location.xy.length < 1e-6:
        if o.name in STRETCH:
            o.scale.x *= SPREAD
            o.scale.y *= SPREAD
        else:
            spread_parts(o.data)
    elif o.parent is None:
        o.location.x *= SPREAD
        o.location.y *= SPREAD
for g in GROUPS:
    g["x"] *= SPREAD
    g["y"] *= SPREAD
HUB = (HUB[0] * SPREAD, HUB[1] * SPREAD)

# ---------------------------------------------------------------- camera, light, world, render
# Perspective, 50 mm, 20 degrees above the ground, on the diagonal, pulled well back
cam_data = bpy.data.cameras.new("SURDS Cam")
cam_data.type = "PERSP"
cam_data.lens = 50
cam_data.sensor_width = 36
cam_data.clip_end = 800
cam = bpy.data.objects.new("SURDS Cam", cam_data)
col.objects.link(cam)
CAM_ELEV = math.radians(20)   # low across the city (the reference sits at ~38)
d = Vector((0.707 * math.cos(CAM_ELEV), -0.707 * math.cos(CAM_ELEV), math.sin(CAM_ELEV))).normalized()
target = Vector((5 * SPREAD, 0, 2))
CAM_DIST = 195 * SPREAD / 1.5   # framed so the city reads 50% bigger on screen
cam.location = target + d * CAM_DIST
cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

sun_data = bpy.data.lights.new("Moonlight", "SUN")
sun_data.energy = 3.2
sun_data.color = (1.0, 0.97, 0.93)
sun_data.angle = math.radians(3)
sun = bpy.data.objects.new("Moonlight", sun_data)
# Key light from the right and slightly behind: faces turned towards +x read near-white, the -y faces fall dark
sun.rotation_euler = Vector((-0.8, -0.22, -0.56)).to_track_quat("-Z", "Y").to_euler()
col.objects.link(sun)

world = scene.world or bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.008, 0.0076, 0.007, 1)
bg.inputs[1].default_value = 1.0
# Glass reflects a soft overcast sky, while the camera and diffuse light still see the dark night.
wn, wl = world.node_tree.nodes, world.node_tree.links
for n in [n for n in wn if n.type != "OUTPUT_WORLD" and n != bg]:   # rebuilt from scratch on every run
    wn.remove(n)
sky = wn.new("ShaderNodeBackground")
sky.name = "Reflection Sky"
sky.inputs[0].default_value = (0.05, 0.049, 0.047, 1)
# What the glass reflects: a city-glow haze, bright towards the back right (+x+y), dark towards the front left,
# strongest near the horizon. Faces turned right mirror the glow (near white), faces turned left mirror the dark.
_tc = wn.new("ShaderNodeTexCoord")
_az = wn.new("ShaderNodeVectorMath")
_az.operation = "DOT_PRODUCT"
wl.new(_tc.outputs["Generated"], _az.inputs[0])
_az.inputs[1].default_value = (0.707, 0.707, 0.0)
_side = wn.new("ShaderNodeMath")                 # 0 front-left .. 1 back-right
_side.operation = "MULTIPLY_ADD"
_side.use_clamp = True
wl.new(_az.outputs["Value"], _side.inputs[0])
_side.inputs[1].default_value = 0.5
_side.inputs[2].default_value = 0.5
_side2 = wn.new("ShaderNodeMath")
_side2.operation = "POWER"
wl.new(_side.outputs[0], _side2.inputs[0])
_side2.inputs[1].default_value = 2.5
_sep = wn.new("ShaderNodeSeparateXYZ")
wl.new(_tc.outputs["Generated"], _sep.inputs[0])
_hz = wn.new("ShaderNodeMath")                   # 1 at the horizon, falling off up and down
_hz.operation = "ABSOLUTE"
wl.new(_sep.outputs[2], _hz.inputs[0])
_hz2 = wn.new("ShaderNodeMath")
_hz2.operation = "MULTIPLY_ADD"
_hz2.use_clamp = True
wl.new(_hz.outputs[0], _hz2.inputs[0])
_hz2.inputs[1].default_value = -1.4
_hz2.inputs[2].default_value = 1.0
_glow = wn.new("ShaderNodeMath")
_glow.operation = "MULTIPLY"
wl.new(_side2.outputs[0], _glow.inputs[0])
wl.new(_hz2.outputs[0], _glow.inputs[1])
_lvl = wn.new("ShaderNodeMath")
_lvl.operation = "MULTIPLY_ADD"
wl.new(_glow.outputs[0], _lvl.inputs[0])
_lvl.inputs[1].default_value = 0.45
_lvl.inputs[2].default_value = 0.012
wl.new(_lvl.outputs[0], sky.inputs[0])
lp = wn.new("ShaderNodeLightPath")
mix = wn.new("ShaderNodeMixShader")
wout = next(n for n in wn if n.type == "OUTPUT_WORLD")
wl.new(lp.outputs["Is Camera Ray"], mix.inputs[0])   # EEVEE honours camera rays: the camera sees night,
wl.new(sky.outputs[0], mix.inputs[1])                 # reflections (and a little fill) see the city glow
wl.new(bg.outputs[0], mix.inputs[2])
wl.new(mix.outputs[0], wout.inputs["Surface"])

for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        pass
try:
    scene.eevee.use_raytracing = True    # screen-space GI/AO so façades get contact shading
except AttributeError:
    pass
scene.render.use_freestyle = True
scene.render.line_thickness_mode = "ABSOLUTE"
scene.render.line_thickness = 0.9
fs = C.view_layer.freestyle_settings
fs.crease_angle = math.radians(140)
for ls in list(fs.linesets):
    fs.linesets.remove(ls)
ls = fs.linesets.new("SURDS Outlines")
ls.select_by_collection = True
ls.collection = outlined
ls.select_by_visibility = True
ls.visibility = "VISIBLE"
for flag in ("select_silhouette", "select_border", "select_crease", "select_external_contour"):
    setattr(ls, flag, True)
ls.linestyle.color = (0.82, 0.84, 0.88)
ls.linestyle.alpha = 0.7
ls.linestyle.thickness = 0.9
lq = fs.linesets.new("SURDS Outlines Quiet")
lq.select_by_collection = True
lq.collection = quiet
lq.select_by_visibility = True
lq.visibility = "VISIBLE"
for flag in ("select_silhouette", "select_border", "select_external_contour"):
    setattr(lq, flag, True)
lq.linestyle.color = (0.6, 0.62, 0.66)
lq.linestyle.alpha = 0.22
lq.linestyle.thickness = 0.7
scene.render.resolution_percentage = 100
scene.render.image_settings.color_depth = "8"
scene.eevee.taa_render_samples = 64
try:
    scene.eevee.ray_tracing_options.resolution_scale = "2"
except (AttributeError, TypeError):
    pass
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.view_settings.view_transform = "Standard"
scene.view_settings.exposure = -0.4
try:
    scene.view_settings.look = "High Contrast"
except TypeError:
    pass

scene.use_nodes = True
ct = scene.node_tree
ct.nodes.clear()
rl = ct.nodes.new("CompositorNodeRLayers")
gl = ct.nodes.new("CompositorNodeGlare")
for gt in ("BLOOM", "FOG_GLOW"):
    try:
        gl.glare_type = gt
        break
    except TypeError:
        pass
comp = ct.nodes.new("CompositorNodeComposite")
tree_col = bpy.data.collections.get("SURDS Trees")
if tree_col and tree_col.objects:
    def lcs(lc):
        yield lc
        for ch in lc.children:
            yield from lcs(ch)

    main_vl = C.view_layer
    tree_vl = scene.view_layers.get("Trees") or scene.view_layers.new("Trees")
    tree_vl.use_freestyle = False
    for lc in lcs(main_vl.layer_collection):
        if lc.collection == tree_col:
            lc.exclude = True
    for lc in lcs(tree_vl.layer_collection):
        name = lc.collection.name
        lc.exclude = name in ("Imported", "Tree Library")
        lc.holdout = name not in ("SURDS Trees", scene.collection.name)
    scene.render.film_transparent = True
    rl_trees = ct.nodes.new("CompositorNodeRLayers")
    rl_trees.layer = "Trees"
    over = ct.nodes.new("CompositorNodeAlphaOver")
    ct.links.new(rl.outputs["Image"], over.inputs[1])
    ct.links.new(rl_trees.outputs["Image"], over.inputs[2])
    bgc = ct.nodes.new("CompositorNodeAlphaOver")       # night sky back behind everything
    bgc.inputs[1].default_value = (*[c for c in bg.inputs[0].default_value[:3]], 1)
    ct.links.new(over.outputs["Image"], bgc.inputs[2])
    ct.links.new(bgc.outputs["Image"], gl.inputs["Image"])
else:
    ct.links.new(rl.outputs["Image"], gl.inputs["Image"])
ct.links.new(gl.outputs["Image"], comp.inputs["Image"])
if "Strength" in gl.inputs:          # softer glow: the reference's highlights don't clip
    gl.inputs["Strength"].default_value = 0.6
else:
    gl.mix = -0.4

print("objects:", len(col.objects), "| engine:", scene.render.engine, "| glare:", gl.glare_type)
