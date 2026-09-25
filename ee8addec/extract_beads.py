import os
from collections import deque

from PIL import Image, ImageDraw

SRC = r"C:\Users\86198\.qoder-cn\tmp\C--Users-86198-Documents-Qoder-2026-09-25-ee8addec\images\ee8addec-f44e-49bd-9db3-ded4441cc8f9\4046401e-1cd7-4b6a-8b30-c744017db778.png"
OUT = r"C:\Users\86198\Documents\Qoder\2026-09-25\ee8addec\dist\assets\tiles"

img = Image.open(SRC).convert("RGBA")
w, h = img.size
print("source size:", w, h)

ImageDraw.floodfill(img, (0, 0), (0, 0, 0, 0), thresh=14)
ImageDraw.floodfill(img, (w - 1, h - 1), (0, 0, 0, 0), thresh=14)

alpha = img.getchannel("A")
mask = alpha.point(lambda v: 255 if v > 8 else 0)
px = mask.load()

row_hits = [any(px[x, y] > 0 for x in range(0, w, 3)) for y in range(h)]
bands = []
y = 0
while y < h:
    if row_hits[y]:
        y0 = y
        while y < h and row_hits[y]:
            y += 1
        bands.append((y0, y))
    else:
        y += 1
print("row bands:", len(bands), bands)

labels = (
    [chr(ord("A") + i) for i in range(26)]
    + ["heart", "star"]
)
names = []
idx = 0
for (y0, y1) in bands:
    col_hits = []
    for x in range(w):
        hit = False
        for yy in range(y0, y1, 3):
            if px[x, yy] > 0:
                hit = True
                break
        col_hits.append(hit)
    x = 0
    raw = []
    while x < w:
        if col_hits[x]:
            x0 = x
            while x < w and col_hits[x]:
                x += 1
            raw.append([x0, x])
        else:
            x += 1
    merged = []
    for seg in raw:
        if merged and seg[0] - merged[-1][1] < 30:
            merged[-1][1] = seg[1]
        else:
            merged.append(seg)
    for seg in merged:
        if seg[1] - seg[0] >= 50:
            names.append((seg[0], y0, seg[1], y1))
print("beads found:", len(names))
assert len(names) == len(labels), " bead count mismatch"

def keep_largest_component(im):
    a = im.getchannel("A")
    px = a.load()
    w, h = im.size
    seen = [[False] * w for _ in range(h)]
    best = None
    for sy in range(h):
        for sx in range(w):
            if px[sx, sy] > 8 and not seen[sy][sx]:
                comp = []
                q = deque([(sx, sy)])
                seen[sy][sx] = True
                while q:
                    x, y = q.popleft()
                    comp.append((x, y))
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny] > 8:
                            seen[ny][nx] = True
                            q.append((nx, ny))
                if best is None or len(comp) > len(best):
                    best = comp
    if best:
        keep = set(best)
        ap = im.load()
        for y in range(h):
            for x in range(w):
                if (x, y) not in keep:
                    ap[x, y] = (0, 0, 0, 0)
    return im


os.makedirs(OUT, exist_ok=True)
for (x0, y0, x1, y1), label in zip(names, labels):
    crop = img.crop((x0, y0, x1, y1))
    bbox = crop.getchannel("A").getbbox()
    crop = crop.crop(bbox)
    crop = keep_largest_component(crop)
    bbox = crop.getchannel("A").getbbox()
    crop = crop.crop(bbox)
    cw, chh = crop.size
    side = max(cw, chh) + 6
    tile = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    tile.paste(crop, ((side - cw) // 2, (side - chh) // 2))
    tile = tile.resize((96, 96), Image.LANCZOS)
    tile.save(os.path.join(OUT, "tile_%s.png" % label))
    print("tile_%s.png" % label, "from", (x0, y0, x1, y1))
print("done")
