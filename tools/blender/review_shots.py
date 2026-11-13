# Review renders for the SURDS city: the hero camera plus close-ups of the hero buildings.
# Run in Blender after surds_city.py (+ surds_city_animate.py). Set REVIEW_DIR and REVIEW_TAG first.
import bpy
from mathutils import Vector

scene = bpy.context.scene
out_dir = globals().get("REVIEW_DIR", "/tmp")
tag = globals().get("REVIEW_TAG", "v")

SHOTS = [
    # name, look-at point, ortho scale, view direction (towards the camera)
    ("tower", (-18, -14, 20), 52, (1.0, -1.0, 0.9)),
    ("datacenter_plant", (19, 10, 6), 36, (1.0, -1.0, 1.1)),
    ("hospital_cleanroom", (-6, 2, 6), 48, (1.0, -1.0, 1.1)),
]

hero_cam = scene.camera
res = scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage
path = scene.render.filepath
scene.frame_set(scene.frame_end)
scene.render.resolution_percentage = 50
written = []

scene.render.filepath = f"{out_dir}/{tag}_0_hero.png"
bpy.ops.render.render(write_still=True)
written.append(scene.render.filepath)

cam_data = bpy.data.cameras.new("Review Cam")
cam_data.type = "ORTHO"
cam_data.clip_end = 600
cam = bpy.data.objects.new("Review Cam", cam_data)
scene.collection.objects.link(cam)
try:
    for k, (name, at, scale, view) in enumerate(SHOTS, start=1):
        d = Vector(view).normalized()
        cam.location = Vector(at) + d * 150
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        cam_data.ortho_scale = scale
        scene.camera = cam
        scene.render.filepath = f"{out_dir}/{tag}_{k}_{name}.png"
        bpy.ops.render.render(write_still=True)
        written.append(scene.render.filepath)
finally:
    scene.camera = hero_cam
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.cameras.remove(cam_data)
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = res
    scene.render.filepath = path

print("\n".join(written))
