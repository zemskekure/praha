#!/usr/bin/env bash
# Pixel Path: Prague Castle -> Malá Strana -> Vltava embankment -> Vyšehrad.
# Run from the repo root in a session whose network allows the map services (see README.md).
#   ./prague.sh route      # step 1: route + cost estimate (free)
#   ./prague.sh bake       # step 2: bake OSM buildings, land, hills, landmarks (free, a few minutes)
#   ./prague.sh plan       # step 3: plan the art + free placeholder art
#   ./prague.sh view       # build and serve the fly-through on http://127.0.0.1:8080/
#   LEVEL=moderate ./prague.sh plan   # sparse | moderate | detailed (paid art, see README)
set -euo pipefail
S=.claude/skills/pixel-path/scripts
TRIP=trips/prague
LEVEL=${LEVEL:-moderate}
export NODE_USE_ENV_PROXY=1   # Node fetch ignores HTTPS_PROXY without this (cloud sessions)
export PIXEL_PATH_USER_AGENT=${PIXEL_PATH_USER_AGENT:-"praha-pixel-path/1.0 (github.com/zemskekure/praha)"}

case "${1:-}" in
  route)
    # Coordinates skip geocoding: Hradčanské náměstí -> Smetanovo nábřeží (by the Charles Bridge) -> Vyšehrad.
    node $S/route.mjs --out $TRIP \
      --from "50.0898,14.3975" \
      --via  "50.0855,14.4135" \
      --to   "50.0647,14.4183" ;;
  bake)
    node $S/bake.mjs --trip $TRIP ;;
  plan)
    node $S/plan-art.mjs --trip $TRIP --detail "$LEVEL" \
      --theme "praha|0|historic Prague, Czech Republic: baroque palaces, pastel Art Nouveau apartment blocks and red-tiled roofs" \
      --subject "praha:apartment=a five-storey Art Nouveau apartment block in Prague, cream stucco facade with ornate gilded mosaics and tall windows|a pastel yellow neo-Renaissance Prague apartment block with a corner bay and a steep red tiled roof|a pale pink Prague tenement with stucco garlands, wrought-iron balconies and dormer windows" \
      --subject "praha:terrace=a narrow baroque Malá Strana townhouse with an ochre facade, a curved gable and a painted house sign above the door|a pastel green baroque burgher house with a red tiled roof and arched ground-floor doorway" \
      --subject "praha:shop=a Prague Art Nouveau building with a wooden cafe front and a painted Czech sign with an invented name|a Prague baroque building with an arcaded ground floor and a small shop under the arches" \
      --subject "praha:civic=a grand neo-Renaissance Prague palace with a rusticated ground floor, columns and statues on the roofline" \
      --subject "praha:church=a baroque Prague church with twin towers and a green copper dome|a gothic Prague church with two dark spiky spires" \
      --subject "praha:tree=a broad linden tree in full leaf" \
      --subject "praha:street=a black cast-iron Prague gas street lamp with an ornate post"
    node $S/placeholder-art.mjs --trip $TRIP ;;
  view)
    node $S/check.mjs --trip $TRIP || true
    node $S/viewer.mjs --trip $TRIP --serve 8080 ;;
  *) sed -n 2,8p "$0"; exit 1 ;;
esac
