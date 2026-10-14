# RetroDiffusion props (art/raw/{p,w,s,i}-*.png, on a flat light-grey background) -> game sprites in art/.
# The background is flooded out from the edges; the soft grey drop shadow it paints becomes a real translucent
# shadow; the prop is trimmed, shrunk by its own factor so it sits at the right size next to the 48 px people, and
# snapped back to its own colours so it stays crisp pixel art. Run from games/vinko: python3 tools/prep_props.py
import json, os
from collections import Counter, deque
from PIL import Image

SCALE = {   # how big each prop should be next to the people
    'p-longtable': .5, 'p-bench': .5, 'p-sqtable': .45, 'p-standtable': .55, 'p-mugempty': .14, 'p-bar': .82, 'p-tank': .62,
    'p-taps': .32, 'p-coatstand': .62, 'p-chandelier': .5, 'p-clock': .3, 'p-radiator': .5, 'p-menu': .55, 'p-utopenci': .26,
    'p-plant': .6, 'p-crates': .5, 'p-shot': .1, 'p-plate': .16, 't-mug': .14, 't-chair': .55,
    'w-urinal': .55, 'w-sink': .6, 'w-stall': .9, 'w-dryer': .35, 'w-bin': .35,
    's-car1': .78, 's-car2': .72, 's-car3': .76, 't-taxi': .8, 's-tram': 1.4, 's-lamp': 1.25, 's-tree': 1.0, 's-bin': .5,
    's-stop': .75, 's-bike': .6, 's-noentry': .7, 's-garden': .8, 's-scooter': .5, 's-pigeon': .18,
    'i-bag': .5, 'i-joint': .5, 'i-money': .5,
}

def cut(im):
    im = im.convert('RGBA'); W, H = im.size; px = im.load()
    bg = Counter(px[x, y][:3] for x in range(W) for y in (0, H - 1)).most_common(1)[0][0]
    lum = lambda c: (c[0] + c[1] + c[2]) / 3
    grey = lambda c: max(c[:3]) - min(c[:3]) < 14
    seen, q = set(), deque([(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)])
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < W and 0 <= y < H): continue
        seen.add((x, y)); c = px[x, y]
        d = lum(bg) - lum(c)
        if c[3] == 0 or (grey(c) and abs(d) <= 10):
            px[x, y] = (0, 0, 0, 0)
        elif grey(c) and 10 < d < 90:   # the painted drop shadow: keep it, as a translucent dark
            px[x, y] = (18, 12, 8, int(min(150, d * 2.2)))
        else:
            continue
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return im

def shrink(im, k):
    bb = im.getbbox(); im = im.crop(bb)
    if k >= 1:
        return im.resize((round(im.width * k), round(im.height * k)), Image.NEAREST)
    pal = [c for c, n in Counter(p[:3] for p in im.getdata() if p[3] > 200).most_common(32)]
    pre = Image.new('RGBA', im.size); a, b = im.load(), pre.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, bl, al = a[x, y]; b[x, y] = (r * al // 255, g * al // 255, bl * al // 255, al)
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    sm = pre.resize((w, h), Image.BOX); s = sm.load(); out = Image.new('RGBA', (w, h)); o = out.load()
    for y in range(h):
        for x in range(w):
            r, g, bl, al = s[x, y]
            if al < 40: continue
            c = (r * 255 // al, g * 255 // al, bl * 255 // al)
            if al < 200 and sum(c) < 120:   # shadow stays a soft dark
                o[x, y] = (18, 12, 8, al); continue
            if al < 110: continue
            o[x, y] = min(pal, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2) + (255,) if pal else (r, g, bl, 255)
    return out

meta = json.load(open('art/sprites.json'))
for n, k in SCALE.items():
    src = f'art/raw/{n}.png'
    if not os.path.exists(src): continue
    out = shrink(cut(Image.open(src)), k); out.save(f'art/{n}.png'); meta[n] = {'fw': out.width, 'fh': out.height, 'n': 1}
    print(n, out.size)
if os.path.exists('art/raw/taxi-inside.png'):
    Image.open('art/raw/taxi-inside.png').convert('RGB').save('art/taxi-inside.png')
json.dump(meta, open('art/sprites.json', 'w'), indent=1)
