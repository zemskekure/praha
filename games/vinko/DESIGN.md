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
Walk (WASD/arrows) · E: talk, order at the bar · Esc: back to the intro to switch friends · punch (step 3) ·
drink (step 3) · the taxi (step 5) · the toilet together (step 6).

## Build order
1. The pub with Honza: the room, light and life.
2. The friends, their lives, their lines; online play with an intro screen to pick who you are.
3. Drinks and punches.
4. The street and tram 22.
5. The taxi.
6. The toilet.
7. The clock, last round, dawn.
