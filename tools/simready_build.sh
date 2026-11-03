#!/usr/bin/env bash
# Convert the NVIDIA SimReady (OpenUSD) equipment used by /explore into compressed web GLBs.
# Sources: Hugging Face Vertiv/simready-assets and TraneTechnologies/simready-assets (CC-BY-4.0), downloaded to $SRC.
#   bash tools/simready_build.sh            (needs Blender and @gltf-transform/cli in $TOOL)
set -e
cd "$(dirname "$0")/.."
B="${BLENDER:-/d/Hokage X_Pirate king/blender.exe}"; SRC="${SRC:-D:/simready_src}"; TOOL="${TOOL:-/d/simready_src/tool}"; OUT="$PWD/views/explore/assets"
mkdir -p "$OUT" "$SRC/glb"
conv(){  # <source folder> <name> <triangle budget> [min part size m]
  "$B" -b --factory-startup --python tools/simready_convert.py -- "$1" "$SRC/glb/$2.glb" --tris $3 --minpart ${4:-0.03} 2>&1 | grep -E "SIZE|Error|Traceback" | sed "s/^/$2: /"
  (cd "$TOOL" && npx gltf-transform optimize "$SRC/glb/$2.glb" "$OUT/$2.glb" --compress meshopt --texture-compress webp --simplify true --simplify-error 0.0008 --weld true 2>&1 | tail -1)
}
conv "$SRC/vertiv/16OCP_ORV3_racks_Computer_racks" rack_ocp 60000
conv "$SRC/vertiv/33kVA_DC_power_shelf" power_shelf 20000
conv "$SRC/vertiv/CW181DCHA1SAEP" crah 120000
conv "$SRC/vertiv/XDU1350" cdu 60000
conv "$SRC/vertiv/APM2" ups_apm2 120000
conv "$SRC/vertiv/1800A_MSB" switchboard 100000
conv "$SRC/vertiv/NVD_RPP_1200_480_XT210_FA" rpp 80000
conv "$SRC/vertiv/MCV330_12FAN" condenser 120000
conv "$SRC/trane/CVHH1500_2300T22C45C" chiller_water 150000
echo ALL DONE
