#!/usr/bin/env bash
# Bundle a hostable copy of Praha 3D: binary data as base64 text (some hosts serve only text), and the page without
# its document wrapper. Usage: tools/praha3d/bundle.sh OUTDIR [pixel|studio]
set -euo pipefail
OUT=$1; STYLE=${2:-pixel}; SRC=trips/prague/3d; WEB=tools/praha3d/web
mkdir -p "$OUT"
cp "$WEB/app.js" "$SRC/path.json" "$OUT/"
for f in "$SRC"/*.bin; do base64 -w0 "$f" > "$OUT/$(basename "$f").txt"; done
sed -e '/^<!doctype html>/d' -e '/^<html/d' -e '/^<head>/d' -e '/^<\/head>/d' -e '/^<body>/d' -e '/^<\/body>/d' -e '/^<\/html>/d' \
    -e '/<meta charset/d' -e '/<meta name="viewport"/d' "$WEB/index.html" > "$OUT/index.html"
if [ "$STYLE" = studio ]; then
  sed -i -e 's|<title>Praha 3D</title>|<title>Praha 3D Studio</title>|' \
         -e 's|<script src="app.js"></script>|<script>window.PRAHA_STYLE = "studio";</script>\n<script src="app.js"></script>|' "$OUT/index.html"
fi
echo "bundled $STYLE into $OUT"
