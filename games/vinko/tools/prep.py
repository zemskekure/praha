# RetroDiffusion's raw characters -> game sprites. Each walk take is a 16-frame GIF (rows up, left, down, right x 4
# steps) on a flat white background. The background is flooded out from the edges (white shirts survive), then any
# enclosed pockets of the exact background colour are cleared too. Run from games/vinko: python3 tools/prep.py
import json, os
from collections import deque
from PIL import Image, ImageSequence

CAST = ['patas', 'stepa', 'pazout', 'ado', 'kopinaut', 'bob', 'kevin', 'sasa', 'barman']

def frames(path): return [f.convert('RGBA') for f in ImageSequence.Iterator(Image.open(path))]

def key_out(im, tol=20):
    im = im.copy(); W, H = im.size; px = im.load(); bg = px[0, 0][:3]
    close = lambda c, t: sum(abs(a - b) for a, b in zip(c[:3], bg)) <= t
    seen, q = set(), deque([(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)])
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < W and 0 <= y < H): continue
        seen.add((x, y))
        if px[x, y][3] == 0 or close(px[x, y], tol): px[x, y] = (0, 0, 0, 0); q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    for y in range(H):
        for x in range(W):
            if px[x, y][3] and close(px[x, y], 3): px[x, y] = (0, 0, 0, 0)
    return im

meta = json.load(open('art/sprites.json')) if os.path.exists('art/sprites.json') else {}
for n in CAST:
    src = f'art/raw/{n}.gif'
    if not os.path.exists(src): continue
    fr = [key_out(f) for f in frames(src)]
    W, H = fr[0].size; s = Image.new('RGBA', (W * len(fr), H))
    for i, f in enumerate(fr): s.alpha_composite(f, (i * W, 0))
    s.save(f'art/{n}.png'); meta[n] = {'fw': W, 'fh': H, 'n': len(fr)}
    feet = max((f.getbbox() or (0, 0, 0, 0))[3] for f in fr); meta[n]['feet'] = feet
    print(n, W, H, len(fr), 'feet', feet)
json.dump(meta, open('art/sprites.json', 'w'), indent=1)
