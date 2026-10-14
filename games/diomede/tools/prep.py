# Turn RetroDiffusion's raw pictures into game-ready sprites: cut the background away, pack animation frames into
# sheets, and sample clean ground textures from the tilesets. Run from games/diomede: python3 tools/prep.py
from PIL import Image, ImageSequence
import json, math, os
os.makedirs('art', exist_ok=True)
meta = {}

def frames(path): return [f.convert('RGBA') for f in ImageSequence.Iterator(Image.open(path))]
def key_out(im, bg=None, tol=46, flood=True):
    """Make the background transparent: the corner colour, flood-filled in from the edges (or everywhere)."""
    im = im.copy(); W, H = im.size; px = im.load(); bg = bg or px[0, 0][:3]
    close = lambda c: sum(abs(a - b) for a, b in zip(c[:3], bg)) <= tol
    if not flood:
        for y in range(H):
            for x in range(W):
                if close(px[x, y]): px[x, y] = (0, 0, 0, 0)
        return im
    seen, stack = set(), [(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < W and 0 <= y < H): continue
        seen.add((x, y))
        if px[x, y][3] == 0 or close(px[x, y]):
            px[x, y] = (0, 0, 0, 0); stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return im
def sheet(fr, name):
    W, H = fr[0].size; s = Image.new('RGBA', (W * len(fr), H))
    for i, f in enumerate(fr): s.alpha_composite(f, (i * W, 0))
    s.save(f'art/{name}.png'); return {'fw': W, 'fh': H, 'n': len(fr)}

# The man: 16 frames, 4 directions (up, left, down, right) x 4 steps. Background keyed out everywhere (it is flat).
fr = [key_out(f, flood=False, tol=20) for f in frames('art/raw/man.gif')]
meta['man'] = {**sheet(fr, 'man'), 'rows': {'up': 0, 'left': 1, 'down': 2, 'right': 3}}
# The boat: 8 views; record the screen angle its bow points at in each (measured, y down).
fr = [key_out(f, flood=False, tol=20) for f in frames('art/raw/boat.gif')]
angles = []
for f in fr:
    p = f.load(); pts = [(x, y) for y in range(f.height) for x in range(f.width) if p[x, y][3] > 0]
    S = set(pts); pts = [q for q in pts if all((q[0] + dx, q[1] + dy) in S for dx in (-1, 0, 1) for dy in (-1, 0, 1))]
    cx = sum(q[0] for q in pts) / len(pts); cy = sum(q[1] for q in pts) / len(pts)
    sxx = sum((q[0] - cx) ** 2 for q in pts); syy = sum((q[1] - cy) ** 2 for q in pts); sxy = sum((q[0] - cx) * (q[1] - cy) for q in pts)
    a = 0.5 * math.atan2(2 * sxy, sxx - syy); ux, uy = math.cos(a), math.sin(a)
    pr = [((q[0] - cx) * ux + (q[1] - cy) * uy, (q[0] - cx) * -uy + (q[1] - cy) * ux) for q in pts]
    lo, hi = min(t for t, _ in pr), max(t for t, _ in pr)
    wd = lambda a0, a1: (lambda s: max(s) - min(s) if s else 0)([v for t, v in pr if a0 <= t <= a1])
    bow = (ux, uy) if wd(hi - 6, hi) < wd(lo, lo + 6) else (-ux, -uy)
    angles.append(round(math.atan2(bow[1], bow[0]), 3))
meta['boat'] = {**sheet(fr, 'boat'), 'angles': angles}
# Props: white backgrounds flood-filled away from the edges, then trimmed.
for n in ['house-a', 'house-b', 'house-c', 'school', 'station', 'dome', 'rock-a']:
    im = key_out(Image.open(f'art/raw/{n}.png').convert('RGBA'), bg=(255, 255, 255), tol=60)
    bb = im.getbbox(); im = im.crop(bb); im.save(f'art/{n}.png'); meta[n] = {'w': im.width, 'h': im.height}
# Ground textures: the purest 32 px cell of each kind from the two tilesets.
def cells(path):
    im = Image.open(path).convert('RGB'); return [im.crop((x, y, x + 32, y + 32)) for y in range(0, im.height, 32) for x in range(0, im.width, 32)]
def score(c, test): d = list(c.getdata()); return sum(1 for p in d if test(p)) / len(d)
green = lambda p: p[1] > p[0] + 8 and p[1] > p[2] + 8
grey = lambda p: abs(p[0] - p[1]) < 14 and abs(p[1] - p[2]) < 18 and p[0] > 90
water = lambda p: p[2] > p[0] + 25
for name, path, test in [('tex-grass', 'art/raw/tiles-land.png', green), ('tex-rock', 'art/raw/tiles-land.png', grey),
                         ('tex-water', 'art/raw/tiles-shore.png', water), ('tex-shingle', 'art/raw/tiles-shore.png', grey)]:
    best = max(cells(path), key=lambda c: score(c, test)); best.save(f'art/{name}.png'); meta[name] = {'purity': round(score(best, test), 2)}
# Second batch: generated with transparent backgrounds already; just trim. Bigger buildings for the right proportions.
for n in ['house-a2', 'house-b2', 'house-c2', 'house-d2', 'school2', 'station2', 'dome2', 'rack2', 'umiak2', 'tank2', 'mast2', 'buoy2', 'rock-b2', 'walrus', 'seal']:
    if not os.path.exists(f'art/raw/{n}.png'): continue
    im = Image.open(f'art/raw/{n}.png').convert('RGBA'); im = im.crop(im.getbbox()); im.save(f'art/{n}.png'); meta[n] = {'w': im.width, 'h': im.height}
for n in ['villager-a', 'villager-b', 'martina']:
    if os.path.exists(f'art/raw/{n}.gif'):
        fr = [key_out(f, flood=False, tol=20) for f in frames(f'art/raw/{n}.gif')]
        meta[n] = {**sheet(fr, n), 'rows': {'up': 0, 'left': 1, 'down': 2, 'right': 3}}
json.dump(meta, open('art/sprites.json', 'w'), indent=1)
print(json.dumps({k: v for k, v in meta.items()}, indent=None)[:900])
