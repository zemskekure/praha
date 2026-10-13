# Praha: Pixel Path

A pixel-art fly-through of a real road in Prague, made with
[jonwheatley/pixel-path](https://github.com/jonwheatley/pixel-path) (MIT). The skill is copied into
`.claude/skills/pixel-path/` (upstream commit `74341a9`), so Claude Code picks it up in this repo.

**Route:** Prague Castle (Hradčanské náměstí) → Malá Strana → over the Vltava → along the embankment past the
Charles Bridge and the National Theatre → Vyšehrad. It's about 5–7 km and stays in one region ("historic Prague").

## Run it

```
./prague.sh route    # route + cost estimate (free)
./prague.sh bake     # OpenStreetMap buildings, land cover, hills, landmarks (free, a few minutes)
./prague.sh plan     # art plan + free placeholder art
./prague.sh view     # self-check, then serve on http://127.0.0.1:8080/
```

Or just ask Claude: *"make the Prague pixel path"*.

### Paid art (optional)
Placeholders are free. For real art, set `RETRODIFFUSION_API_KEY` in your own terminal or in the environment's
secrets (never paste it into a chat). Pick a level, `LEVEL=sparse|moderate|detailed ./prague.sh plan`, then:

```
node .claude/skills/pixel-path/scripts/rd.mjs quote --trip trips/prague
node .claude/skills/pixel-path/scripts/rd.mjs run   --trip trips/prague --budget 4.00
node .claude/skills/pixel-path/scripts/clean.mjs    --trip trips/prague
```

Rough cost for one region: sparse $0.72, moderate about $3.24, detailed about $6.48, plus about 25% for re-rolls.
After the bake, add Prague's landmarks (Prague Castle / St Vitus, the National Theatre, the Dancing House,
Vyšehrad's Basilica of St Peter and St Paul) to `plan` as `--subject "lm-<wikidata id>=..."`, using the IDs the bake
prints.

## Network
The bake needs these hosts: `nominatim.openstreetmap.org`, `router.project-osrm.org`, `routing.openstreetmap.de`,
`overpass-api.de` (and its mirrors `lz4.`/`z.overpass-api.de`, `overpass.kumi.systems`, `overpass.private.coffee`),
`s3.amazonaws.com`, `query.wikidata.org`/`www.wikidata.org`, plus `api.retrodiffusion.ai` for paid art.

## Credits
Map data © OpenStreetMap contributors (ODbL). Routing: OSRM. Elevation: Terrain Tiles (Mapzen/Tilezen, AWS).
Landmarks: Wikidata. Art: RetroDiffusion. Skill by Jon Wheatley (MIT).
