---
name: rtx-render
description: Render a Blender scene (.blend, or a .py that builds one) on the team's RTX 4090 (rtxserver) through the studio at wa.gpunet.in, as if it rendered locally - packs it here, uploads only what changed, renders, brings frames or just the mp4 back, with monitor/status/cancel/clean. No ssh needed. Use when someone says render this on the server / rtx / 4090, a local Blender render is too slow, or asks to monitor/cancel a remote render.
---

# rtx-render: Blender renders on the team's RTX 4090

`rtx-render` (the script next to this file; stdlib Python, no dependencies) sends a Blender scene to
the studio at **wa.gpunet.in** and brings the result back over HTTPS. Link it onto your PATH once:

```bash
ln -sf "$PWD/.claude/skills/rtx-render/rtx-render" ~/.local/bin/rtx-render
```

```bash
rtx-render login                        # once: paste a token from wa.gpunet.in › Apps › Blender render
rtx-render scene.blend                  # pack -> upload diff -> render -> frames in ./out/scene/
rtx-render build.py [--base b.blend]    # runs build.py LOCALLY in headless Blender, renders the result remotely
rtx-render scene.blend --video-only     # the server encodes the mp4; only that comes back
rtx-render scene.blend -s 1 -e 120 -o out/x --mp4 --detach

rtx-render monitor [JOB] [--mp4]        # progress, f/min, ETA, GPU; keeps downloading; Ctrl-C only detaches
rtx-render status                       # your jobs
rtx-render cancel [JOB]                 # stop it on the server
rtx-render clean [JOB]                  # delete a finished job on the server (local frames kept)
```
JOB defaults to your newest. `RTX_URL` overrides the server (default `https://wa.gpunet.in`).
`RTX_TOKEN` overrides the saved token.

You can watch the same jobs live in the portal: **wa.gpunet.in › Apps › Blender render** shows
progress, the latest frame and the video. An agent can use the **Blender MCP** at
`https://wa.gpunet.in/blender`, which signs in with your wavault account. It can list scenes,
start renders, follow them and look at frames. Uploading still goes through this CLI or the page.

## Access (one-time, per person)

1. You need a wavault account on a team (ask Aryan for an invite).
2. Sign in at wa.gpunet.in, then open Apps › Blender render › "Make a token", and run
   `rtx-render login` with it. Tokens can be revoked on the same page.
3. You need Blender 4.5 locally (`blender` on PATH, or `BLENDER=/path/to/blender`), because it packs
   the scene before upload. You need `ffmpeg` only for `--mp4`.

## Be a good neighbour on the GPU

The 4090 is shared. The server enforces it:
- One worker per job by default (at most 2), and at most 2 Blender processes across everyone's
  jobs, so ~20 GB of GPU memory stays free.
- Jobs wait while the GPU or the disk is short, and each person can have 2 renders queued or running.

Clean up finished jobs (`rtx-render clean`); the server also deletes them a day after you fetch the results.

## What it does

1. **Packs locally**: `blender -b` opens the .blend, or runs the .py (optionally on `--base`), then
   runs `pack_all()` and saves an **uncompressed** copy with output forced to `//frames/f_####`
   (movie formats become PNG). A .py keeps all its local paths working, because only the render goes
   remote. No Python is ever sent to the server, which runs Blender with `--disable-autoexec`.
2. **Uploads a diff**: the packed file is cut into chunks along its own block structure (rtx-blend1;
   the portal page cuts identically), and only the chunks the server has nowhere are sent,
   gzip-compressed.
   - The server keeps the last upload of every file keyed by its **path inside the git repo**, so
     everyone sending `source/surds-city.blend` diffs against whoever sent it last.
   - Measured on the SURDS city (136 MB packed): the first upload sent 79 MB; a re-pack after
     moving one object sent **1.7 MB**.
   - The server then checks the scene in Blender and warns about anything not packed.
3. **Renders** with `-w` Blender processes over the frame range, each using `use_overwrite=False` +
   `use_placeholder=True`: a worker claims the next free frame with an empty file. `device.py`
   turns on OptiX/CUDA for Cycles. With `--video-only` the server encodes `video.mp4` (libx264).
4. **Monitor and download**: one status call every 8 s. Finished frames (complete files only) are
   downloaded into the out folder. `--mp4` encodes `<out>.mp4` locally; `--video-only` brings back
   only the mp4.

## Notes

- From Claude Code the CLI only needs HTTPS to wa.gpunet.in. For a long render, run the monitor as
  a background task and filter its output:
  `rtx-render monitor JOB --mp4 2>&1 | tr '\r' '\n' | grep -E "done|cancelled|failed|encoded|Error"`.
- "Not freed memory blocks" and Freestyle "strokes set empty" log errors are harmless.
- Freestyle builds its view map from *every* visible mesh, not just its lineset's collections, so
  dense wireframe or tube geometry in view can stall a frame for minutes. The page and the CLI flag
  "no new frame for 15 min". Put such objects on a separate view layer with Freestyle off (holdout
  the rest) and alpha-over it in the compositor; the SURDS city does this.

## Numbers (2026-10-27)

- SURDS city, EEVEE Next 1080p / 64 samples + Freestyle: ~6.4 s/frame per process (mostly
  single-threaded CPU Freestyle). 1 worker, 320 frames: ~25 min. 2 workers help when Freestyle
  dominates.
- About 1.2-1.9 GB of VRAM per EEVEE worker.

## Files

- Local state: `~/.cache/rtx-render/jobs.json` (job -> out dir, frame count). Your token is in
  `~/.config/rtx-render/token` (mode 600).
- Server (wavault on rtxserver): `~/.wavault/render/`. The design is in the wavault repo at
  `docs/dev/render.md`.
