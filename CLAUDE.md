# SURDS website

## Rendering Blender scenes: use the `rtx-render` skill

Anyone working in this folder renders Blender scenes on the team's shared RTX 4090 with the
**rtx-render** skill (`.claude/skills/rtx-render/`). Claude Code picks it up automatically in this
repo; read its `SKILL.md` for one-time access setup (your own ssh key, `cloudflared`, the `rtx-remote`
host) and put the tool on your PATH:

```bash
ln -sf "$PWD/.claude/skills/rtx-render/rtx-render" ~/.local/bin/rtx-render
rtx-render source/surds-city.blend --video-only     # from anywhere; only the mp4 comes back
```

- Uploads are diffs against the last upload of the same repo file, whoever sent it, so re-rendering
  after an edit costs a few MB instead of the whole scene.
- The GPU is shared: one Blender process by default, keep ~20 GB of it free, `rtx-render clean` when done.
- Frames land in `out/` (git-ignored).

## The SURDS city scene (`/render` page)

Built from scripts, in this order, in one Blender Python namespace:
`tools/blender/surds_city.py` → `surds_city_animate.py` → `surds_plan2d.py` → `surds_intro.py`
(`export_plan.py` refreshes `plan-data.json`, which the plan and the registrar sheet `plan_sheet.py` read).
The saved scene is `source/surds-city.blend` (git-ignored: too large for GitHub).
