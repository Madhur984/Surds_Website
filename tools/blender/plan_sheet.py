"""Draw the SURDS city as a land-records survey plan (a registrar's plot map) from export_plan.py's JSON.

usage: python3 plan_sheet.py [plan-data.json] [out.svg]

Every survey block gets a number; hero blocks are one plot, the others are split into four sub-plots.
Coordinates are the scene's world XY in metres (north = +Y), so the plan lines up with the 3D city.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "plan-data.json")
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "..", "views", "render", "city-plan.svg")
D = json.load(open(src))

W, H = 1600, 1131                       # A-series sheet, landscape
PAPER, INK, RED, BLUE = "#efe6cf", "#2b261e", "#a8352b", "#2e4c80"
SERIF = "'Libre Caslon Text','Nimbus Roman','Times New Roman',serif"
NARROW = "'Archivo Narrow','Nimbus Sans Narrow','Arial Narrow',sans-serif"
MONO = "'Courier Prime','Nimbus Mono PS','Courier New',monospace"
HAND = "'Homemade Apple','Z003','URW Chancery L',cursive"

gx0, gy0, gx1, gy1 = D["ground"]
MAP = 1000                              # map frame, px
MX, MY = 56, 70
K = (MAP - 40) / (gx1 - gx0)            # px per metre
E0, N0 = 4520.0, 2310.0                 # survey grid origin offsets (easting / northing)


def P(x, y):
    return MX + 20 + (x - gx0) * K, MY + 20 + (gy1 - y) * K


def rect(b, **a):
    x0, y0 = P(b[0], b[3])
    x1, y1 = P(b[2], b[1])
    return el("rect", x=f"{x0:.2f}", y=f"{y0:.2f}", width=f"{x1 - x0:.2f}", height=f"{y1 - y0:.2f}", **a)


def el(tag, body=None, **a):
    attrs = " ".join(f'{k.rstrip("_").replace("_", "-")}="{v}"' for k, v in a.items())
    return f"<{tag} {attrs}>{body}</{tag}>" if body is not None else f"<{tag} {attrs}/>"


def text(x, y, s, size=10, font=NARROW, fill=INK, anchor="middle", rot=0, **a):
    tr = f"rotate({rot} {x:.1f} {y:.1f})" if rot else None
    extra = dict(transform=tr) if tr else {}
    s = str(s).replace("&", "&amp;")
    return el("text", s, x=f"{x:.1f}", y=f"{y:.1f}", font_size=size, font_family=font, fill=fill,
              text_anchor=anchor, **extra, **a)


def centre(b):
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2


def inside(pt, b):
    return b[0] <= pt[0] <= b[2] and b[1] <= pt[1] <= b[3]


# ------------------------------------------------------------------ plots
USE = {
    "Commercial Tower": ("COMMERCIAL TOWER", "Commercial"),
    "Cooling Plant A": ("DISTRICT COOLING PLANT", "Utility"),
    "Office Block": ("OFFICE BLOCK", "Commercial"),
    "Data Center": ("DATA CENTRE", "Industrial (IT)"),
    "Power Plant": ("POWER PLANT", "Utility"),
    "Clean Room Lab": ("CLEAN ROOM / PHARMA", "Industrial"),
    "Hospital": ("HOSPITAL", "Institutional"),
}
heroes = [b for b in D["buildings"] if not b["filler"]]
blocks = sorted(D["blocks"], key=lambda b: (-centre(b)[1], centre(b)[0]))
plots, schedule = [], []
for n, blk in enumerate(blocks, start=101):
    owners = [h for h in heroes if inside(centre(h["box"]), blk)]
    lead = next((h for h in owners if h["name"] in USE), None)
    if inside(centre(D["substation"]), blk):
        lead = dict(name="Substation", box=D["substation"] + [6.0])
        USE["Substation"] = ("ELECTRICAL SUBSTATION", "Utility")
    if lead:
        label, use = USE[lead["name"]]
        tall = max([h["box"][4] for h in owners] + [lead["box"][4]])
        storeys = max(0, round(tall / 3.6) - 1)
        plots.append(dict(no=str(n), box=blk, hero=True, label=label))
        x0, y0, x1, y1 = blk
        schedule.append((str(n), label.title().replace("Ii", "II"), use, (x1 - x0) * (y1 - y0), f"G+{storeys}"))
    else:
        cx, cy = centre(blk)
        for k, (qx0, qy0, qx1, qy1) in enumerate([(blk[0], cy, cx, blk[3]), (cx, cy, blk[2], blk[3]),
                                                  (blk[0], blk[1], cx, cy), (cx, blk[1], blk[2], cy)], start=1):
            plots.append(dict(no=f"{n}/{k}", box=[qx0, qy0, qx1, qy1], hero=False, label=None))

# ------------------------------------------------------------------ sheet
S = []
S.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">')
S.append("""<defs>
<filter id="paper" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="4" result="grain"/>
  <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.36  0 0 0 0 0.24  0 0 0 0.10 0"/>
  <feComposite in2="SourceGraphic" operator="in"/>
  <feBlend in2="SourceGraphic" mode="multiply"/>
</filter>
<filter id="stain" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="3" seed="9"/>
  <feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.42  0 0 0 0 0.2  0 0 0 0.5 -0.18"/>
</filter>
<filter id="ink" x="-2%" y="-2%" width="104%" height="104%">
  <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="2" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1"/>
</filter>
<filter id="stamp" x="-10%" y="-10%" width="120%" height="120%">
  <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="7" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.42" result="holes"/>
  <feComposite in="SourceGraphic" in2="holes" operator="in"/>
</filter>
<pattern id="hatch" patternUnits="userSpaceOnUse" width="4.5" height="4.5" patternTransform="rotate(45)">
  <line x1="0" y1="0" x2="0" y2="4.5" stroke="#2b261e" stroke-width="0.7"/></pattern>
<pattern id="hatch-light" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
  <line x1="0" y1="0" x2="0" y2="6" stroke="#2b261e" stroke-width="0.45" stroke-opacity="0.8"/></pattern>
<pattern id="row" patternUnits="userSpaceOnUse" width="7" height="7">
  <circle cx="3.5" cy="3.5" r="0.55" fill="#2b261e" fill-opacity="0.35"/></pattern>
</defs>""")
S.append(el("rect", width=W, height=H, fill=PAPER))
S.append(el("rect", width=W, height=H, fill=PAPER, filter="url(#paper)"))
S.append(el("rect", width=W, height=H, filter="url(#stain)", opacity="0.55"))
for fx in (W / 3, 2 * W / 3):            # fold creases
    S.append(el("line", x1=f"{fx:.0f}", y1=0, x2=f"{fx:.0f}", y2=H, stroke="#fffaf0", stroke_width=2, opacity=0.5))
    S.append(el("line", x1=f"{fx + 2:.0f}", y1=0, x2=f"{fx + 2:.0f}", y2=H, stroke="#8a7a5a", stroke_width=0.6, opacity=0.25))
S.append(el("line", x1=0, y1=H / 2, x2=W, y2=H / 2, stroke="#fffaf0", stroke_width=2, opacity=0.4))

# sheet border
S.append(el("rect", x=22, y=22, width=W - 44, height=H - 44, fill="none", stroke=INK, stroke_width=2.2))
S.append(el("rect", x=30, y=30, width=W - 60, height=H - 60, fill="none", stroke=INK, stroke_width=0.7))
S.append(text(MX, 54, "FORM No. LR-14  ·  SURVEY & SETTLEMENT", 11, NARROW, anchor="start", letter_spacing="1.5"))
S.append(text(MX + MAP, 54, "SHEET 1 OF 1", 11, NARROW, anchor="end", letter_spacing="1.5"))

# ------------------------------------------------------------------ map
S.append('<g id="map" filter="url(#ink)">')
S.append(el("rect", x=MX, y=MY, width=MAP, height=MAP, fill="none", stroke=INK, stroke_width=1.6))
S.append(el("rect", x=MX + 6, y=MY + 6, width=MAP - 12, height=MAP - 12, fill="none", stroke=INK, stroke_width=0.5))
step = 10
v = math.ceil(gx0 / step) * step
while v <= gx1:                          # grid ticks with survey easting / northing
    px, _ = P(v, 0)
    _, py = P(0, v)
    for a, b in ((MY, MY + 6), (MY + MAP - 6, MY + MAP)):
        S.append(el("line", x1=f"{px:.1f}", y1=a, x2=f"{px:.1f}", y2=b, stroke=INK, stroke_width=0.6))
    for a, b in ((MX, MX + 6), (MX + MAP - 6, MX + MAP)):
        S.append(el("line", x1=a, y1=f"{py:.1f}", x2=b, y2=f"{py:.1f}", stroke=INK, stroke_width=0.6))
    if round(v) % 20 == 0:
        S.append(text(px, MY - 4, f"E {E0 + v:.0f}", 8, MONO))
        S.append(text(MX - 4, py, f"N {N0 + v:.0f}", 8, MONO, rot=-90, dy="0"))
    for gy in range(math.ceil(gy0 / step) * step, int(gy1) + 1, 2 * step):   # faint grid crosses
        if round(v) % 20 == 0:
            cx, cy = P(v, gy)
            S.append(el("path", d=f"M{cx - 3:.1f} {cy:.1f}h6M{cx:.1f} {cy - 3:.1f}v6", stroke=INK, stroke_width=0.35, opacity=0.5))
    v += step

# ground (boundary of the surveyed area)
S.append(rect(D["ground"], fill="none", stroke=INK, stroke_width=1.3, stroke_dasharray="14 3 2 3"))

# roads: edges + dash-dot centre lines
for r in D["roads"]:
    S.append(rect(r, fill="#e7dcc0", stroke="none"))
for r in D["roads"]:
    vert = (r[3] - r[1]) > (r[2] - r[0])
    x0, y0 = P(r[0], r[3])
    x1, y1 = P(r[2], r[1])
    if vert:
        S.append(el("path", d=f"M{x0:.1f} {y0:.1f}V{y1:.1f}M{x1:.1f} {y0:.1f}V{y1:.1f}", stroke=INK, stroke_width=0.9, fill="none"))
        S.append(el("line", x1=f"{(x0 + x1) / 2:.1f}", y1=f"{y0:.1f}", x2=f"{(x0 + x1) / 2:.1f}", y2=f"{y1:.1f}",
                    stroke=INK, stroke_width=0.4, stroke_dasharray="10 3 1.5 3", opacity=0.7))
    else:
        S.append(el("path", d=f"M{x0:.1f} {y0:.1f}H{x1:.1f}M{x0:.1f} {y1:.1f}H{x1:.1f}", stroke=INK, stroke_width=0.9, fill="none"))
        S.append(el("line", x1=f"{x0:.1f}", y1=f"{(y0 + y1) / 2:.1f}", x2=f"{x1:.1f}", y2=f"{(y0 + y1) / 2:.1f}",
                    stroke=INK, stroke_width=0.4, stroke_dasharray="10 3 1.5 3", opacity=0.7))

# expressway interchange
ex = D["expressway"]
S.append(rect(ex, fill="#e2d6b8", stroke=INK, stroke_width=1.1))
for kb in D["kerbs"]:
    S.append(rect(kb, fill=INK, fill_opacity=0.55, stroke="none"))
cx, cy = P(*centre(ex))
S.append(el("circle", cx=f"{cx:.1f}", cy=f"{cy:.1f}", r=f"{5.2 * K:.1f}", fill=PAPER, stroke=INK, stroke_width=0.8))
S.append(text(cx, cy - 4, "EXPRESSWAY", 9.5, NARROW, letter_spacing="1.2", font_weight="bold"))
S.append(text(cx, cy + 8, "INTERCHANGE", 9.5, NARROW, letter_spacing="1.2", font_weight="bold"))
S.append(text(cx, cy + 19, "(PUBLIC R.O.W.)", 7.5, NARROW))

# road names
VNAMES = {-43.5: "CANAL ROAD", -14.5: "TOWER ROAD", 14.5: "GRID ROAD", 43.5: "RING ROAD EAST"}
HNAMES = {43.5: "NORTH AVENUE", 14.5: "SURDS LINK ROAD", -14.5: "HOSPITAL ROAD", -43.5: "SOUTH AVENUE"}
for r in D["roads"]:
    vert = (r[3] - r[1]) > (r[2] - r[0])
    c = centre(r)
    if vert:
        name = VNAMES.get(round(c[0], 1), "ROAD")
        for yy in (-58.0, 58.0):
            x, y = P(c[0], yy)
            S.append(text(x, y, f"{name}  ·  7.25 m", 8.5, NARROW, rot=-90, dy="3", letter_spacing="1"))
    else:
        name = HNAMES.get(round(c[1], 1), "ROAD")
        for xx in (-58.0, 58.0):
            x, y = P(xx, c[1])
            S.append(text(x, y, f"{name}  ·  7.25 m", 8.5, NARROW, dy="3", letter_spacing="1"))

# plots: survey-block boundary heavy, sub-plot boundaries light
for p in plots:
    S.append(rect(p["box"], fill="none", stroke=INK, stroke_width=1.6 if p["hero"] else 0.55))
for blk in blocks:
    S.append(rect(blk, fill="none", stroke=INK, stroke_width=1.6))
    x0, y0 = P(blk[0], blk[3])
    x1, y1 = P(blk[2], blk[1])
    w = blk[2] - blk[0]
    S.append(text((x0 + x1) / 2, y0 - 2.5, f"{w:.2f}", 6.5, MONO, opacity=0.8))
    S.append(text(x0 - 2.5, (y0 + y1) / 2, f"{blk[3] - blk[1]:.2f}", 6.5, MONO, rot=-90, opacity=0.8))

# buildings
for b in D["buildings"]:
    S.append(rect(b["box"], fill="url(#hatch-light)" if b["filler"] else "url(#hatch)", stroke=INK,
                  stroke_width=0.7 if b["filler"] else 1.1))
for c in D["cooling"][::2]:              # cooling towers (outer rims): double circles
    x, y = P(*centre(c))
    r = (c[2] - c[0]) / 2 * K
    S.append(el("circle", cx=f"{x:.1f}", cy=f"{y:.1f}", r=f"{r:.1f}", fill=PAPER, stroke=INK, stroke_width=0.9))
    S.append(el("circle", cx=f"{x:.1f}", cy=f"{y:.1f}", r=f"{r * 0.7:.1f}", fill="none", stroke=INK, stroke_width=0.5))
for s in D["stacks"]:
    x, y = P(*centre(s))
    S.append(el("circle", cx=f"{x:.1f}", cy=f"{y:.1f}", r=f"{(s[2] - s[0]) / 2 * K + 1:.1f}", fill=INK))
S.append(rect(D["substation"], fill="url(#row)", stroke=INK, stroke_width=0.9, stroke_dasharray="4 2"))
for t in D["transformers"]:
    S.append(rect(t, fill=PAPER, stroke=INK, stroke_width=0.9))
    x, y = P(*centre(t))
    S.append(text(x, y + 3, "T", 8, NARROW, font_weight="bold"))
for line in D["power_lines"][::2]:
    a, b = P(*line[0]), P(*line[-1])
    S.append(el("line", x1=f"{a[0]:.1f}", y1=f"{a[1]:.1f}", x2=f"{b[0]:.1f}", y2=f"{b[1]:.1f}",
                stroke=INK, stroke_width=0.7, stroke_dasharray="6 2 1 2 1 2"))
for t in D["pylons"]:
    x0, y0 = P(t[0], t[3])
    x1, y1 = P(t[2], t[1])
    S.append(el("path", d=f"M{x0:.1f} {y0:.1f}H{x1:.1f}V{y1:.1f}H{x0:.1f}ZM{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}M{x1:.1f} {y0:.1f}L{x0:.1f} {y1:.1f}",
                fill="none", stroke=INK, stroke_width=0.8))

# trees: survey symbol (scalloped crown + dot)
for x, y in D["trees"]:
    px, py = P(x, y)
    r = 1.15 * K
    S.append(el("circle", cx=f"{px:.1f}", cy=f"{py:.1f}", r=f"{r:.1f}", fill=PAPER, stroke=INK, stroke_width=0.55,
                stroke_dasharray="2.2 0.8"))
    S.append(el("circle", cx=f"{px:.1f}", cy=f"{py:.1f}", r="0.9", fill=INK))

# SURDS service network, amended in red
for ln in D["links"]:
    pts = [P(*q) for q in ln["pts"]]
    d = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    S.append(el("path", d=d, fill="none", stroke=RED, stroke_width=1.3, stroke_dasharray="9 3 2 3"))
    S.append(el("circle", cx=f"{pts[-1][0]:.1f}", cy=f"{pts[-1][1]:.1f}", r="2.6", fill=PAPER, stroke=RED, stroke_width=1.1))
hx, hy = P(*D["hub"])
S.append(el("circle", cx=f"{hx:.1f}", cy=f"{hy:.1f}", r="7", fill=PAPER, stroke=RED, stroke_width=1.3))
S.append(el("circle", cx=f"{hx:.1f}", cy=f"{hy:.1f}", r="2.6", fill=RED))
S.append(text(hx + 10, hy - 9, "SURDS HUB", 8, NARROW, fill=RED, anchor="start", font_weight="bold", letter_spacing="1"))

# plot numbers and uses
for p in plots:
    x, y = P(*centre(p["box"]))
    if p["hero"]:
        x0, y0 = P(p["box"][0], p["box"][3])
        tx, ty = x0 + 7, y0 + 15
        S.append(el("rect", x=f"{tx - 3:.1f}", y=f"{ty - 11:.1f}", width=f"{len(p['no']) * 8 + 26:.0f}", height=15,
                    fill=PAPER, stroke=INK, stroke_width=0.6))
        S.append(text(tx, ty, f"Sy. {p['no']}", 10.5, SERIF, anchor="start", font_weight="bold"))
        x1, y1 = P(p["box"][2], p["box"][1])
        S.append(text((x0 + x1) / 2, y1 - 6, p["label"], 8, NARROW, letter_spacing="1", font_weight="bold",
                      paint_order="stroke", stroke=PAPER, stroke_width=3))
    else:
        S.append(el("circle", cx=f"{x:.1f}", cy=f"{y:.1f}", r="11", fill=PAPER, stroke=INK, stroke_width=0.55))
        S.append(text(x, y + 3, p["no"], 7.5, MONO, font_weight="bold"))

# north arrow + scale bar inside the frame
nx, ny = MX + MAP - 58, MY + 70
S.append(el("circle", cx=nx, cy=ny, r=30, fill=PAPER, stroke=INK, stroke_width=0.8))
S.append(el("path", d=f"M{nx} {ny - 40}L{nx + 9} {ny + 14}L{nx} {ny + 6}Z", fill=INK))
S.append(el("path", d=f"M{nx} {ny - 40}L{nx - 9} {ny + 14}L{nx} {ny + 6}Z", fill=PAPER, stroke=INK, stroke_width=0.9))
S.append(text(nx, ny - 45, "N", 15, SERIF, font_weight="bold"))
S.append("</g>")

sx, sy = MX + 30, MY + MAP - 34
S.append(el("rect", x=sx - 12, y=sy - 22, width=K * 50 + 64, height=44, fill=PAPER, stroke=INK, stroke_width=0.6))
for k in range(5):
    S.append(el("rect", x=f"{sx + k * 10 * K:.1f}", y=sy, width=f"{10 * K:.1f}", height=5,
                fill=INK if k % 2 == 0 else PAPER, stroke=INK, stroke_width=0.6))
    S.append(text(sx + k * 10 * K, sy + 15, str(k * 10), 7.5, MONO))
S.append(text(sx + 50 * K, sy + 15, "50 m", 7.5, MONO))
S.append(text(sx, sy - 8, "SCALE 1 : 1000", 8.5, NARROW, anchor="start", letter_spacing="1.2"))

# ------------------------------------------------------------------ title block (right panel)
PX, PW = MX + MAP + 26, W - (MX + MAP + 26) - 50
y = MY
S.append(el("rect", x=PX, y=y, width=PW, height=MAP, fill="none", stroke=INK, stroke_width=1.6))
S.append(text(PX + PW / 2, y + 30, "DEPARTMENT OF LAND RECORDS", 12, SERIF, letter_spacing="2"))
S.append(el("line", x1=PX + 30, y1=y + 40, x2=PX + PW - 30, y2=y + 40, stroke=INK, stroke_width=0.6))
S.append(text(PX + PW / 2, y + 78, "SURDS DISTRICT", 30, SERIF, font_weight="bold", letter_spacing="3"))
S.append(text(PX + PW / 2, y + 102, "SURVEY PLAN  ·  PLOT MAP", 14, SERIF, letter_spacing="3"))
S.append(text(PX + PW / 2, y + 122, "Ward 7  ·  Survey Block 101 – 124", 11, SERIF, font_style="italic"))
y += 140
S.append(el("line", x1=PX, y1=y, x2=PX + PW, y2=y, stroke=INK, stroke_width=1.2))

S.append(text(PX + 14, y + 22, "SCHEDULE OF PLOTS", 11, NARROW, anchor="start", font_weight="bold", letter_spacing="1.5"))
cols = (PX + 14, PX + 66, PX + 250, PX + 360, PX + PW - 14)
y += 40
for c, h, a in zip(cols, ("Sy. No.", "Holding / Use", "Class", "Area m²", "Storeys"), ("start", "start", "start", "end", "end")):
    pass
heads = [("Sy. No.", cols[0], "start"), ("Holding", cols[1], "start"), ("Class", cols[2], "start"),
         ("Area m²", cols[3] + 40, "end"), ("Ht.", cols[4], "end")]
for h, cx, a in heads:
    S.append(text(cx, y, h, 9, NARROW, anchor=a, font_weight="bold"))
S.append(el("line", x1=PX + 10, y1=y + 6, x2=PX + PW - 10, y2=y + 6, stroke=INK, stroke_width=0.6))
for no, name, use, area, st in sorted(schedule):
    y += 19
    S.append(text(cols[0], y, no, 9.5, MONO, anchor="start"))
    S.append(text(cols[1], y, name, 9.5, NARROW, anchor="start"))
    S.append(text(cols[2], y, use, 9, NARROW, anchor="start", font_style="italic"))
    S.append(text(cols[3] + 40, y, f"{area:,.1f}", 9.5, MONO, anchor="end"))
    S.append(text(cols[4], y, st, 9.5, MONO, anchor="end"))
    S.append(el("line", x1=PX + 10, y1=y + 6, x2=PX + PW - 10, y2=y + 6, stroke=INK, stroke_width=0.3, stroke_dasharray="1.5 2"))
sub = [p for p in plots if not p["hero"]]
y += 19
qa = (sub[0]["box"][2] - sub[0]["box"][0]) * (sub[0]["box"][3] - sub[0]["box"][1])
S.append(text(cols[0], y, "others", 9.5, MONO, anchor="start"))
S.append(text(cols[1], y, f"{len(sub)} sub-plots, 4 per block", 9.5, NARROW, anchor="start"))
S.append(text(cols[2], y, "Mixed", 9, NARROW, anchor="start", font_style="italic"))
S.append(text(cols[3] + 40, y, f"{qa:,.1f} ea.", 9.5, MONO, anchor="end"))
y += 24
S.append(el("line", x1=PX, y1=y, x2=PX + PW, y2=y, stroke=INK, stroke_width=1.2))

# legend
S.append(text(PX + 14, y + 22, "REFERENCE", 11, NARROW, anchor="start", font_weight="bold", letter_spacing="1.5"))
y += 36
LG = []
def lg(sym, label):
    LG.append((sym, label))
lg('<rect x="0" y="-7" width="26" height="12" fill="url(#hatch)" stroke="#2b261e" stroke-width="1"/>', "Built structure (pucca)")
lg('<rect x="0" y="-7" width="26" height="12" fill="none" stroke="#2b261e" stroke-width="1.6"/>', "Survey block boundary")
lg('<rect x="0" y="-7" width="26" height="12" fill="none" stroke="#2b261e" stroke-width="0.55"/>', "Sub-plot boundary")
lg('<rect x="0" y="-7" width="26" height="12" fill="#e7dcc0"/><line x1="0" y1="-1" x2="26" y2="-1" stroke="#2b261e" stroke-width="0.5" stroke-dasharray="6 2 1 2"/>', "Public road, centre line")
lg('<circle cx="13" cy="-1" r="6" fill="#efe6cf" stroke="#2b261e" stroke-width="0.6" stroke-dasharray="2.2 0.8"/><circle cx="13" cy="-1" r="1" fill="#2b261e"/>', "Tree")
lg('<circle cx="13" cy="-1" r="6" fill="#efe6cf" stroke="#2b261e" stroke-width="0.9"/><circle cx="13" cy="-1" r="4" fill="none" stroke="#2b261e" stroke-width="0.5"/>', "Cooling tower")
lg('<path d="M7 -7h12v12h-12zM7 -7l12 12M19 -7l-12 12" fill="none" stroke="#2b261e" stroke-width="0.8"/><line x1="19" y1="-1" x2="40" y2="-1" stroke="#2b261e" stroke-width="0.7" stroke-dasharray="6 2 1 2 1 2"/>', "HT tower and line")
lg(f'<line x1="0" y1="-1" x2="26" y2="-1" stroke="{RED}" stroke-width="1.3" stroke-dasharray="9 3 2 3"/><circle cx="26" cy="-1" r="2.6" fill="#efe6cf" stroke="{RED}" stroke-width="1.1"/>', "SURDS service line (amended)")
for k, (sym, label) in enumerate(LG):
    cx = PX + 18 + (k % 2) * (PW / 2)
    cy = y + (k // 2) * 22
    S.append(f'<g transform="translate({cx:.1f} {cy:.1f})">{sym}</g>')
    S.append(text(cx + 46, cy + 3, label, 9, NARROW, anchor="start"))
y += (len(LG) + 1) // 2 * 22 + 4
S.append(el("line", x1=PX, y1=y, x2=PX + PW, y2=y, stroke=INK, stroke_width=1.2))

# notes
S.append(text(PX + 14, y + 22, "NOTES", 11, NARROW, anchor="start", font_weight="bold", letter_spacing="1.5"))
notes = ["1. All dimensions in metres. Areas computed from boundary measurements.",
         "2. Grid coordinates referred to district survey datum (E / N).",
         "3. Expressway interchange vested in public right of way; no plots.",
         "4. SURDS service lines shown in red as amended on date below."]
for k, n in enumerate(notes):
    S.append(text(PX + 14, y + 42 + k * 16, n, 9, SERIF, anchor="start"))
y += 42 + len(notes) * 16 + 4
S.append(el("line", x1=PX, y1=y, x2=PX + PW, y2=y, stroke=INK, stroke_width=1.2))

# record of amendments (mutation register)
S.append(text(PX + 14, y + 22, "RECORD OF AMENDMENTS", 11, NARROW, anchor="start", font_weight="bold", letter_spacing="1.5"))
y += 42
for h, cx in (("No.", PX + 14), ("Date", PX + 50), ("Particulars", PX + 140), ("Initials", PX + PW - 14)):
    S.append(text(cx, y, h, 9, NARROW, anchor="end" if h == "Initials" else "start", font_weight="bold"))
S.append(el("line", x1=PX + 10, y1=y + 6, x2=PX + PW - 10, y2=y + 6, stroke=INK, stroke_width=0.6))
AMEND = [("1", "14-03-2025", "Sy. 101–124 surveyed; plots demarcated", "R.I."),
         ("2", "02-09-2025", "Sy. 116 sanctioned, commercial tower G+9", "A.M."),
         ("3", "27-10-2026", "SURDS service lines entered (in red)", "A.M.")]
for no, dt, txt, ini in AMEND:
    y += 19
    S.append(text(PX + 14, y, no, 9.5, MONO, anchor="start"))
    S.append(text(PX + 50, y, dt, 9.5, MONO, anchor="start"))
    S.append(text(PX + 140, y, txt, 9.5, NARROW, anchor="start", fill=RED if no == "3" else INK))
    S.append(text(PX + PW - 14, y, ini, 13, HAND, anchor="end", fill=BLUE))
    S.append(el("line", x1=PX + 10, y1=y + 6, x2=PX + PW - 10, y2=y + 6, stroke=INK, stroke_width=0.3, stroke_dasharray="1.5 2"))

# signatures, seal
bot = MY + MAP
S.append(el("line", x1=PX + 20, y1=bot - 46, x2=PX + 180, y2=bot - 46, stroke=INK, stroke_width=0.6))
S.append(el("line", x1=PX + PW - 180, y1=bot - 46, x2=PX + PW - 20, y2=bot - 46, stroke=INK, stroke_width=0.6))
S.append(text(PX + 100, bot - 32, "Surveyor", 9, SERIF, font_style="italic"))
S.append(text(PX + PW - 100, bot - 32, "Sub-Registrar", 9, SERIF, font_style="italic"))
S.append(text(PX + 100, bot - 52, "R. Iyer", 20, HAND, fill=BLUE, rot=-4))
S.append(text(PX + PW - 100, bot - 52, "A. Menon", 20, HAND, fill=BLUE, rot=-3))
S.append(text(PX + 20, bot - 12, "Prepared 27-10-2026  ·  Plan No. SD/7/2026/014", 8.5, MONO, anchor="start"))

sx, sy = PX + PW / 2, bot - 120   # seal
seal = [el("circle", cx=0, cy=0, r=52, fill="none", stroke=BLUE, stroke_width=2.4),
        el("circle", cx=0, cy=0, r=31, fill="none", stroke=BLUE, stroke_width=1),
        '<path id="sealarc" d="M-41 0a41 41 0 1 1 82 0a41 41 0 1 1 -82 0" fill="none"/>',
        f'<text font-family="{NARROW}" font-size="9" fill="{BLUE}" letter-spacing="1.6" font-weight="bold">'
        '<textPath href="#sealarc">SURDS DISTRICT ✦ LAND RECORDS ✦ CERTIFIED ✦</textPath></text>',
        text(0, -4, "SUB-REGISTRAR", 8.5, NARROW, fill=BLUE, font_weight="bold", letter_spacing="1"),
        text(0, 9, "WARD 7", 8.5, NARROW, fill=BLUE, letter_spacing="1"),
        text(0, 22, "★", 9, SERIF, fill=BLUE)]
S.append(f'<g transform="translate({sx:.1f} {sy:.1f}) rotate(-14)" opacity="0.82" filter="url(#stamp)">{"".join(seal)}</g>')

# "certified true copy" stamp across the map corner
cx, cy = MX + MAP - 190, MY + MAP - 70
S.append(f'<g transform="translate({cx} {cy}) rotate(-8)" opacity="0.78" filter="url(#stamp)">'
         + el("rect", x=-98, y=-22, width=196, height=44, fill="none", stroke=RED, stroke_width=2.2, rx=3)
         + text(0, -2, "CERTIFIED TRUE COPY", 14, NARROW, fill=RED, font_weight="bold", letter_spacing="2")
         + text(0, 14, "27 OCT 2026", 10, MONO, fill=RED, font_weight="bold", letter_spacing="2") + "</g>")

S.append("</svg>")
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
open(out, "w").write("\n".join(S))
print(out, f"{os.path.getsize(out) // 1024} KB", f"{len(plots)} plots")
