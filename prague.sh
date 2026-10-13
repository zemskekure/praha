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
    # Drop a building wrongly tagged with the Wikidata id of the whole LDS church (it would outrank the castle).
    node -e 'const f="'$TRIP'/data/landmarks.json",fs=require("fs");fs.writeFileSync(f,JSON.stringify(JSON.parse(fs.readFileSync(f)).filter(l=>l.qid!=="Q42504")))'
    node $S/plan-art.mjs --trip $TRIP --detail "$LEVEL" \
      --theme "praha|0|historic Prague, Czech Republic: baroque palaces, pastel Art Nouveau apartment blocks and red-tiled roofs" \
      --subject "praha:apartment=a five-storey Art Nouveau apartment block in Prague, cream stucco facade with ornate gilded mosaics and tall windows|a pastel yellow neo-Renaissance Prague apartment block with a corner bay and a steep red tiled roof|a pale pink Prague tenement with stucco garlands, wrought-iron balconies and dormer windows|a light blue Art Nouveau Prague apartment block with curving floral stucco, a gable and a small balcony|a grey-green neo-baroque Prague apartment block with sculpted window pediments and a copper-roofed corner turret|a white cubist Prague apartment block with crystal-like angular window frames and a dark grey roof" \
      --subject "praha:house=a two-storey baroque Prague villa with an ochre facade and a red mansard roof|a small pastel Malá Strana house with a steep red tiled roof, a dormer and green wooden shutters|a narrow baroque Malá Strana townhouse with a curved ochre gable and a painted house sign above the door|a pale green baroque burgher house with an arched doorway and a red tiled roof|a white two-storey Prague house with a wooden gallery and a steep red roof|a salmon pink baroque house with a stepped gable and small square windows" \
      --subject "praha:shop=a Prague Art Nouveau building with a wooden cafe front and a painted Czech sign with an invented name|a Prague baroque building with an arcaded ground floor and a small shop under the arches|a Prague neo-Renaissance building with a dark green wooden pub front and a painted beer sign with an invented name|a yellow Prague corner building with a bakery shopfront, big arched windows and striped awnings|a Prague Art Nouveau building with a bookshop front of dark wood and gold lettering, invented name|a pastel Prague baroque building with a small souvenir shop and a hanging wrought-iron sign" \
      --subject "praha:civic=a grand neo-Renaissance Prague palace with a rusticated ground floor, columns and statues on the roofline|a grand Art Nouveau Prague public building with a decorated green dome and a gilded mosaic gable|a long baroque Prague palace painted ochre and white with a central pediment and a grand doorway|a neo-Renaissance Prague museum with a big glass dome, columns and sgraffito decoration" \
      --subject "praha:tower=a tall white functionalist 1930s Prague apartment building with long horizontal windows and a flat roof|a tall 1970s Prague concrete office block with brown glass ribbon windows" \
      --subject "praha:tree=a broad linden tree in full leaf|a tall horse chestnut tree in full leaf|a slender birch tree with a white trunk" \
      --subject "praha:bush=a trimmed round boxwood shrub|a flowering lilac bush" \
      --subject "praha:street=a black cast-iron Prague gas street lamp with an ornate post|a red Prague tram stop sign on a pole with a small timetable|a green wooden park bench with cast-iron legs" \
      --subject "lm-Q616334=Vyšehrad: a high brick fortress wall on a rocky hill with the twin dark neo-gothic openwork spires of a basilica rising behind it" \
      --subject "lm-Q193369=Prague Castle: a long pale neoclassical palace front with rows of windows on a hill, the tall gothic spires of a cathedral rising behind it" \
      --subject "lm-Q204871=Charles Bridge: a long gothic stone bridge on many arches with dark baroque statues along its parapet and a tall gothic stone tower gate at its end" \
      --subject "lm-Q5949=St Vitus Cathedral: a tall gothic cathedral of dark grey stone with flying buttresses, pointed spires and a big main tower with a green copper top" \
      --subject "lm-Q969482=Strahov Monastery: a white baroque church front with two slender towers topped by onion domes, behind a monastery wall" \
      --subject "lm-Q729370=the Prague Astronomical Clock: a tall dark gothic stone town hall tower with a big ornate blue and gold astronomical clock face on its side" \
      --subject "lm-Q2643308=a baroque palace garden wall with a stone gateway and a small modern metro entrance pavilion with a red M sign" \
      --subject "lm-Q2424070=the Queen Anne Summer Palace: an elegant Renaissance pavilion with a long arcade of slender columns and a green copper roof shaped like an upturned ship hull" \
      --subject "lm-Q1419555=the Kinsky Palace: a pink and white rococo palace with stucco decoration, a balcony on columns and statues on the roof" \
      --subject "lm-Q956163=the Church of Saints Cyril and Methodius: a baroque church with a pale facade, tall windows and a small square tower"
    node $S/placeholder-art.mjs --trip $TRIP ;;
  view)
    node $S/check.mjs --trip $TRIP || true
    node $S/viewer.mjs --trip $TRIP --serve 8080 ;;
  *) sed -n 2,8p "$0"; exit 1 ;;
esac
