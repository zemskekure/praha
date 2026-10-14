# Vínko

An online pixel-art night with friends in Lokál Korunní, Vinohrady. 18+ (alcohol, cocaine, fights, swearing; fiction
among friends). The design is in [DESIGN.md](DESIGN.md).

## Play it on your own server

```
cd games/vinko/server
npm install
npm start            # http://localhost:8080  (PORT=… to change)
```

The server serves the game and relays every player's position, chat and actions over a WebSocket at `/room`, so
everyone who opens the page is in the same pub. Put it behind any HTTPS proxy (Caddy, nginx) or a host that runs Node
(Render, Railway, Fly.io); `wss://` is used automatically on HTTPS.

Opened from a plain file or a static host without the server, the game plays alone. On claude.ai it uses the
artifact's own room instead.

## Controls

WASD / arrows walk · E: order, sit, doors, the taxi, the waiter, a line at the sink · Enter: chat · Q: drink ·
F: punch · G: a line (in the toilet, at the sink) · Esc: change character.

## Art

`tools/gen.mjs` generates art with RetroDiffusion (key from `RETRODIFFUSION_API_KEY`, never committed);
`tools/prep.py` and `tools/prep_props.py` turn the raw pictures into game sprites.
