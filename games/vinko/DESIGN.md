# Vínko: design

One long night with my friends in Lokál Korunní, Vinohrady. Warm, funny, a bit nostalgic. For adults: they drink,
punch each other for fun, step outside to an old Mercedes taxi, and go to the toilet together. Not a crime game,
not a fighting game: the feeling of a night with your people.

## The people

| | Who | Look | Trait |
| --- | --- | --- | --- |
| Paťas | friend | chubby, slicked-back dark hair, round dark glasses, white shirt | historian, drunk |
| Štěpa | friend | chubby, floppy fringe, clear glasses, black tee, cycling helmet | cyclist, arrives late |
| Pažout | friend | chubby, short dark hair, white shirt and navy blazer | conservative junkie |
| Ado | friend | slim, dark curls, moustache, towel round the neck, tank top | gay fitness guy |
| Kopinaut | friend | skinny, spiky fair hair, green-and-white football shirt and scarf | football fan, junkie |
| Bob | friend | skinny, messy dark hair, shirtless | drinks a lot of beer |
| Kevin | **me**, the one you start as | skinny, fair hair, white tee, grey cap | two kids, drinks beer |
| Saša | friend | skinny, shaved head, thin moustache, big grin, gold chain | junkie |
| The barman | Lokál | grey moustache, waistcoat, long white apron | tired, has seen it all |

## The place
Lokál Korunní: herringbone oak floor, long dark tables with benches, bentwood chairs, cream wallpaper with a red
pattern over dark wood panelling covered in white chalk drawings, round brass chandeliers, white curtains on tall
windows to the street. Pilsner from the tank. Doors to the toilet and to Korunní street.

## Principles
1. **Vibe first.** Warm light, motion, small details; nothing is ever static. People breathe and look around, the
   chandeliers glow, the TV flickers, smoke curls, the street shows through the curtains.
2. **Grounded.** Contact shadows under everyone, nobody floats, nothing is see-through, furniture is solid.
3. **Restraint.** Few things, well placed. No clutter, no placeholder ugliness.
4. **They sound like themselves.** Short Czech lines, dry and affectionate. Every friend has a voice.
5. **Time is the resource.** The night runs 20:00 to 04:00. Being together slows it a little.

## Scenes
1. **The pub** (home base). 2. **The toilet** (cramped, honest). 3. **Korunní street** (tram 22, the Mercedes taxi).
Doors fade between them; the friends you lead come with you.

## Online
Everyone who opens the game's page is in the same pub. The intro screen asks *Za koho dneska hraješ?*: each player
picks one of the eight; a friend someone already plays is greyed out (if two pick the same one at once, the earlier
peer keeps him). Each player's presence carries who they play, where they stand, which way they face and the line they
last said. The viewer with the lowest peer label is the host: their page runs everyone nobody plays, the barman and
the clock, and shares them in its presence, so every screen shows the same night. When the host leaves, the next one
takes over where the pub was. Talking to a friend the pub runs asks the host, who makes him answer for everyone.
With nobody else there, or offline, the page plays alone. Built on the artifact `room` capability (presence only, so
view-only guests can play too).

## Verbs
- **Walk**: WASD/arrows. After a few beers the floor tilts: walking sways, the camera drifts, the light warms, words slur.
- **E** does the one thing that fits where you stand (shown under you): order a beer at the bar, sit on a bench or a
  chair (and stand up), talk to someone, go through a door, knock on the taxi.
- **Q**: take a sip. Every glass goes in four sips; the HUD counts your beers.
- **F**: a playful punch at whoever is in front of you: a lunge, stars, a stumble, a spilled beer, a line back
  (and sometimes a punch back). Four punches in a minute and the barman threatens to throw you out.
- **Doors**: the friends the pub runs who stand near you come along; in the toilet they say honest things.
- The friends nobody plays sit at the tables, go to the bar, step out to Korunní or to the toilet on their own.

## Scenes as built
- **Lokál Korunní**: candles on every table, chandeliers, a runner rug, coats on hooks, radiators under the windows;
  the tram's light crosses the curtains when it passes.
- **Záchod**: green tiles and grout, two urinals, a sink with a mirror and a dripping tap, a stall, graffiti
  („Paťas byl tady“), a fluorescent tube that flickers, someone knocking.
- **Korunní**: black-and-white mosaic pavement, granite curbs, tram rails and wires, a zebra, lime trees in iron
  grates, lamps, the tram stop, Lokál's ochre house with lit windows and door, the cream Mercedes taxi with a
  cigarette glowing inside, tram 22 about once an hour of the night.

## Faces
Each friend's walk sheet was drawn by RetroDiffusion from a closer description of his photo with the photo as the
starting picture, and the intro cards carry pixel portraits made from the photos. The photos stay out of the repo.

## Build order
1. The pub with Honza: the room, light and life.
2. The friends, their lives, their lines; online play with an intro screen to pick who you are.
3. Drinks, sitting and punches. ✓
4. The street and tram 22. ✓ (taxi scene still to come)
5. The taxi: inside the cab.
6. The toilet. ✓ (more honest talk to come)
7. The clock, last round, dawn.
