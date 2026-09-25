import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = r"C:\Users\86198\.qoder-cn\tmp\C--Users-86198-Documents-Qoder-2026-09-25-ee8addec\images\ee8addec-f44e-49bd-9db3-ded4441cc8f9\f75cc19c-59e0-455d-972b-b84c69e3c98e.png"
OUT = r"C:\Users\86198\Documents\Qoder\2026-09-25\ee8addec\dist\assets\tiles"

img = Image.open(SRC).convert("RGBA")
w, h = img.size
print("source size:", w, h)

ImageDraw.floodfill(img, (0, 0), (0, 0, 0, 0), thresh=20)
ImageDraw.floodfill(img, (w - 1, h - 1), (0, 0, 0, 0), thresh=20)
ImageDraw.floodfill(img, (w - 1, 0), (0, 0, 0, 0), thresh=20)
ImageDraw.floodfill(img, (0, h - 1), (0, 0, 0, 0), thresh=20)

alpha_img = img.getchannel("A")
mask = alpha_img.point(lambda v: 255 if v > 8 else 0)
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

labels = [chr(ord("A") + i) for i in range(26)] + ["heart", "star"]
names = []
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
assert len(names) == len(labels), "bead count mismatch"


def keep_largest_component(im):
    a = im.getchannel("A")
    p = a.load()
    cw, ch = im.size
    seen = [[False] * cw for _ in range(ch)]
    best = None
    for sy in range(ch):
        for sx in range(cw):
            if p[sx, sy] > 8 and not seen[sy][sx]:
                comp = []
                q = deque([(sx, sy)])
                seen[sy][sx] = True
                while q:
                    x, yy = q.popleft()
                    comp.append((x, yy))
                    for nx, ny in ((x + 1, yy), (x - 1, yy), (x, yy + 1), (x, yy - 1)):
                        if 0 <= nx < cw and 0 <= ny < ch and not seen[ny][nx] and p[nx, ny] > 8:
                            seen[ny][nx] = True
                            q.append((nx, ny))
                if best is None or len(comp) > len(best):
                    best = comp
    if best:
        keep = set(best)
        arr = np.array(im)
        keep_mask = np.zeros((ch, cw), dtype=bool)
        for (x, yy) in keep:
            keep_mask[yy, x] = True
        arr[:, :, 3] = np.where(keep_mask, arr[:, :, 3], 0)
        return Image.fromarray(arr)
    return im


os.makedirs(OUT, exist_ok=True)
sheet = Image.new("RGBA", (96 * 7, 96 * 4), (20, 20, 20, 255))
for i, ((x0, y0, x1, y1), label) in enumerate(zip(names, labels)):
    crop = img.crop((x0, y0, x1, y1))
    bbox = crop.getchannel("A").getbbox()
    crop = crop.crop(bbox)
    crop = keep_largest_component(crop)
    bbox = crop.getchannel("A").getbbox()
    crop = crop.crop(bbox)

    # Edge cleanup: un-darken semi-transparent edge pixels (they are bead
    # color blended over the black background), then feather alpha slightly.
    arr = np.asarray(crop).astype(np.float64)
    a = arr[:, :, 3]
    scale = 255.0 / np.maximum(a, 1.0)
    arr[:, :, 0] = np.clip(arr[:, :, 0] * scale, 0, 255)
    arr[:, :, 1] = np.clip(arr[:, :, 1] * scale, 0, 255)
    arr[:, :, 2] = np.clip(arr[:, :, 2] * scale, 0, 255)
    crop = Image.fromarray(arr.astype(np.uint8))
    a_soft = crop.getchannel("A").filter(ImageFilter.GaussianBlur(0.8))
    crop.putalpha(a_soft)

    cw, ch = crop.size
    side = max(cw, ch) + 6
    tile = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    tile.paste(crop, ((side - cw) // 2, (side - ch) // 2))
    tile = tile.resize((96, 96), Image.LANCZOS)
    tile.save(os.path.join(OUT, "tile_%s.png" % label))
    sheet.paste(tile, ((i % 7) * 96, (i // 7) * 96), tile)

sheet_path = r"C:\Users\86198\Documents\Qoder\2026-09-25\ee8addec\beads_preview.png"
sheet.save(sheet_path)
print("done ->", sheet_path)
