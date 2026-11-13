# Brief: add Blender rendering to the studio (wa.gpunet.in) as an HTTP service + GUI

You're extending the studio app behind wa.gpunet.in (the image/video generator studio) with a **Blender
render** feature. The goal: anyone on the team can send a Blender scene from anywhere and get frames
or an mp4 back through the studio's web UI or an HTTP API, with no SSH involved. The rendering runs on the
team's RTX 4090 render box (`rtxserver`; ask Aryan for access details).

## Start from our working code

A command-line version already works end-to-end over SSH. Reuse its logic; don't reinvent it.

- Repo: `https://github.com/AryanLuharuwala/Surds_Website`, branch **`building_model`**
- Tool: `.claude/skills/rtx-render/rtx-render`. It's a single stdlib-Python file. Read it fully first.
- Notes: `.claude/skills/rtx-render/SKILL.md` covers design, measured numbers and gotchas.

What the tool does, and what you should keep:

1. **Pack**: headless Blender runs `bpy.ops.file.pack_all()`, forces output to `//frames/f_####`
   (movie formats become PNG), and saves **uncompressed** (`compress=False`).
   - Uncompressed matters: it is what makes the diff upload work.
   - Read the scene's frame range, fps, file extension, resolution and engine from the pack step's
     `RTX_SCENE {json}` line.
2. **Diff upload**: the server keeps the last upload of each file in a cache, and new uploads send only
   the changed parts.
   - Cache key = hash of the file's path inside the git repo, so collaborators share it.
   - Measured on the 136 MB SURDS city: the first upload sent 76 MB; after moving one building the
     re-upload sent **1.9 MB**.
   - Each job gets a hard link to the cached file, so older jobs keep their own version.
3. **Render**: `blender -b scene.blend -P device.py -s S -e E -j STEP -a`, where `device.py` does two things:
   - sets `render.use_overwrite=False` and `render.use_placeholder=True`, so several workers can share a
     range and a rerun resumes;
   - turns on OptiX/CUDA for Cycles, because Cycles reads its device from user prefs, which a background
     run doesn't have. EEVEE needs nothing.
4. **Progress / results**:
   - Count only non-empty frame files; 0-byte files are placeholders.
   - Never hand out a frame file still being written (the CLI only syncs files untouched for 3 s).
   - Optionally encode `video.mp4` on the server: `ffmpeg -framerate FPS -start_number S -i frames/f_%04d.png -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart`.

## What to build

**A render service on rtxserver** (it must run there: Blender 4.5.6 is at
`~/blender-install/blender-4.5.6-linux-x64/blender`, and ffmpeg has libx264).

Endpoints:

| Method and path | What it does |
|---|---|
| `POST /render/uploads` | Diff-aware upload. Because rsync isn't available over HTTP, use content-addressed chunks (details below). |
| `POST /render/jobs` | Body: `{scene: <uploaded blend id>, start, end, workers=1, output: "frames"/"video"}` |
| `GET /render/jobs` and `GET /render/jobs/{id}` | Status: frames done / total, f/min, ETA, GPU utilisation and memory, last error line from each worker log. |
| `GET /render/jobs/{id}/events` | Server-sent events stream of the same, for the GUI. |
| `GET /render/jobs/{id}/frames/{n}` | A single frame, plus a way to list frames. |
| `GET /render/jobs/{id}/latest.png` | Live preview. |
| `GET /render/jobs/{id}/video.mp4` | The encoded video. |
| `POST /render/jobs/{id}/cancel` | Stop a job. |
| `DELETE /render/jobs/{id}` | Delete a job's files. |

How the diff upload should work over HTTP:
1. The client splits the packed .blend into chunks, ideally content-defined (FastCDC / rolling hash, ~1 MB average) so an insertion doesn't shift every later chunk; fixed 1 MB chunks are an acceptable start.
2. The client sends the list of chunk hashes.
3. The server replies with the hashes it doesn't have.
4. The client uploads only those chunks.
5. The server rebuilds the file and stores it with that cache key.
6. Keep a chunk store and garbage-collect chunks no scene references any more.

**GUI in the studio:**
- drop a packed .blend (or use the client below);
- choose frame range, workers and frames-vs-video;
- a job list with progress bars and ETA;
- a live latest-frame preview;
- a video player and downloads when done;
- cancel and delete buttons.

**Thin client.** Port the `rtx-render` CLI to talk HTTP instead of ssh and rsync, keeping its command shape: `rtx-render scene.blend`, `build.py`, `monitor`, `status`, `cancel`, `clean`, `--video-only`.

Packing has to stay **on the sender's machine**. A scene's textures, fonts and linked libraries live at paths on that machine, so the server can't find them. A `.py` "build" script also has to run there for the same reason. The GUI can accept only already-packed files. To warn about anything still missing, run a Blender check on the server that lists images whose `packed_file` is None and whose path doesn't exist.

## Security: this endpoint is remote code execution on a shared box

- A `.blend` can carry Python that auto-runs. **Always run Blender with `--disable-autoexec`.** Never accept `.py` files or Python strings over HTTP; build scripts run on the client only.
- Require auth on every endpoint: per-person bearer tokens you can revoke, or reuse the studio's existing auth. No anonymous access.
- Limit upload size and how many jobs each person can run at once, and validate every path and id. Nothing from a request may reach a shell command unquoted.

## Rules for the box (shared with ~20 other people)

**GPU and disk:**
- **Default to 1 Blender worker and keep ~20 GB of the 4090's memory free.** Each EEVEE worker uses about 1.2–1.9 GB. Check `nvidia-smi` before starting more, and queue jobs instead of running them all at once.
- The home disk (`/mnt/oldhome`, shared) often has only ~6 GB free. Refuse new jobs below ~2 GB free, and offer cleanup: auto-delete job directories a while after their results are fetched.

**Processes:**
- **Never use `pgrep`, or `ps … | grep`, on this box.** Under load these can hang permanently (in uninterruptible D state) and drag the whole machine down. Record each worker's PID when you start it (`$!`) and check it with `[ -d /proc/$pid ]`.
- Start workers properly detached: `(setsid nohup ./run.sh > log 2>&1 < /dev/null &)`. Keep the service itself under the same kind of cron-based keepalive the existing tunnels use; there's no systemd or sudo.

**Freestyle (the outline pass):**
- It runs on the CPU, single-threaded per process. That's why the GPU sits idle between frames, and why more workers raise throughput when someone allows it.
- It builds its data from **every visible mesh**, so dense wireframe geometry in view can stall one frame for minutes. Treat "no new frame for 15 min" as a stall and show it in the UI.

**Leave alone:** the other services on the box (cloudflared tunnels, `fml.py`, `upskara-web`, `wavault`). The rtxserver skill notes describe them.

## Test with

`source/surds-city.blend` from the SURDS repo. Ask Aryan for it: it's 314 MB, so it isn't in git.

Measured results so far, with 1080p, 64 samples and outlines:
- about 6.4 s per frame per process;
- the full 320 frames took **24.5 min with 1 worker**, and ~15 min with 3→12 workers.

Check two things:
- a resubmit after a small edit uploads only a few MB;
- `output: "video"` returns a playable mp4 of the right length (320 frames at 30 fps = 10.7 s).
