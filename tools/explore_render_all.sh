#!/usr/bin/env bash
# Render every /explore still in its own Blender process (a 4 GB GPU runs out of memory doing them in one go),
# then convert to WebP for the page.   bash tools/explore_render_all.sh [samples]
set -e
cd "$(dirname "$0")/.."
B="${BLENDER:-/d/Hokage X_Pirate king/blender.exe}"
S="${1:-160}"
for v in tower plant-main plant-gens power-main power-ups net-main net-gpu hall-main hall-aisle roof-main; do
  "$B" -b --factory-startup --python tools/explore_render.py -- --res 100 --samples "$S" --only "$v" 2>&1 | grep -E "SHOT|Error|Traceback" || true
  [ -f "views/explore/img/$v.png" ] && ffmpeg -y -loglevel error -i "views/explore/img/$v.png" -c:v libwebp -quality 86 "views/explore/img/$v.webp"
done
echo ALL DONE
