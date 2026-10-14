# The whippet's animations from RetroDiffusion (art/raw/wh-*.gif, 16 frames each, facing right) -> art/dog-*.png strips.
# The white background is removed by flooding in from the edges only (the dog itself is white), painted ground lines
# and drop shadows under the feet are taken out, and the sniffing take is recoloured from grey-brown to the same fawn.
# Every strip is cropped to the union of its frames, so the feet stay put; sprites.json gets the frame size.
#   python3 tools/prep_dog.py
import json
from collections import Counter, deque
from PIL import Image

ANIMS = {'trot': 'wh-trot', 'run': 'wh-run', 'idle': 'wh-idle', 'sit': 'wh-sitA', 'lie': 'wh-lieA'}   # (the sniffing take leaked into its white background, so it is left out)
RECOLOUR = {'sniff': {(178, 153, 130): (181, 106, 58), (134, 119, 99): (150, 84, 46)}}
BG = (254, 254, 254)
KEEP = {'sniff': (2, 12)}   # the head-down part of the sniffing take
SCALE = 0.6                 # one factor for every take: they come from the same model at the same size

def shrink(im):
    # Box-filter down, keep pixels that are mostly dog, then snap each colour back to the original palette so it stays
    # crisp pixel art; the darkest colour is the outline and wins wherever the edge would have been.
    pal = [c for c, n in Counter(p[:3] for p in im.getdata() if p[3]).most_common(24)]
    w, h = round(im.width * SCALE), round(im.height * SCALE)
    pre = Image.new('RGBA', im.size); px, pp = im.load(), pre.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]; pp[x, y] = (r * a // 255, g * a // 255, b * a // 255, a)
    sm = pre.resize((w, h), Image.BOX); sp = sm.load(); out = Image.new('RGBA', (w, h)); op = out.load()
    dark = min(pal, key=lambda c: sum(c)) if pal else (0, 0, 0)
    for y in range(h):
        for x in range(w):
            r, g, b, a = sp[x, y]
            if a < 110: continue
            c = (r * 255 // a, g * 255 // a, b * 255 // a)
            if a < 200: c = dark   # the soft edge becomes the outline
            op[x, y] = min(pal, key=lambda q: (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 + (q[2] - c[2]) ** 2) + (255,)
    return out

def frames(path):
    g = Image.open(path); out = []
    for k in range(g.n_frames): g.seek(k); out.append(g.convert('RGBA'))
    return out

def flood_out(im):
    w, h = im.size; px = im.load(); seen = set(); q = deque()
    for x in range(w): q.extend([(x, 0), (x, h - 1)])
    for y in range(h): q.extend([(0, y), (w - 1, y)])
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h): continue
        seen.add((x, y)); r, g, b, a = px[x, y]
        if a == 0 or (abs(r - BG[0]) <= 3 and abs(g - BG[1]) <= 3 and abs(b - BG[2]) <= 3):
            px[x, y] = (0, 0, 0, 0); q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

def drop_ground(im):
    # a painted ground line or shadow: in the lowest rows, one colour running wider than any foot could be
    w, h = im.size; px = im.load(); bb = im.getbbox()
    if not bb: return
    for y in range(bb[3] - 1, max(bb[1], bb[3] - 7) - 1, -1):
        c = Counter(px[x, y][:3] for x in range(w) if px[x, y][3])
        for col, n in c.items():
            if n >= 14 and not (col[0] < 40 and col[1] < 40 and col[2] < 50):   # leave the dark outline alone
                for x in range(w):
                    if px[x, y][3] and px[x, y][:3] == col: px[x, y] = (0, 0, 0, 0)

meta = json.load(open('art/sprites.json'))
for key, src in ANIMS.items():
    fr = frames(f'art/raw/{src}.gif')
    for im in fr:
        flood_out(im); drop_ground(im)
        if key in RECOLOUR:
            px = im.load()
            for y in range(im.height):
                for x in range(im.width):
                    p = px[x, y]
                    if p[3] and p[:3] in RECOLOUR[key]: px[x, y] = RECOLOUR[key][p[:3]] + (255,)
    # stray specks: drop opaque pixels with no opaque neighbour
    for im in fr:
        px = im.load(); w, h = im.size
        for y in range(h):
            for x in range(w):
                if px[x, y][3] and not any(0 <= x + a < w and 0 <= y + b < h and px[x + a, y + b][3] for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))): px[x, y] = (0, 0, 0, 0)
    if key in KEEP: fr = fr[KEEP[key][0]:KEEP[key][1]]
    fr = [shrink(im) for im in fr]
    boxes = [im.getbbox() for im in fr if im.getbbox()]
    U = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    fw, fh = U[2] - U[0], U[3] - U[1]
    strip = Image.new('RGBA', (fw * len(fr), fh))
    for i, im in enumerate(fr): strip.paste(im.crop(U), (i * fw, 0))
    strip.save(f'art/dog-{key}.png'); meta[f'dog-{key}'] = {'fw': fw, 'fh': fh, 'n': len(fr)}
    print(key, fw, fh, len(fr))
json.dump(meta, open('art/sprites.json', 'w'), indent=1)
