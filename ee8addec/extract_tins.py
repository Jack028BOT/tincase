import os
import numpy as np
from PIL import Image, ImageFilter

SRC = r"C:\Users\86198\.qoder-cn\tmp\C--Users-86198-Documents-Qoder-2026-09-25-ee8addec\images\ee8addec-f44e-49bd-9db3-ded4441cc8f9"
FILES = {
    "tin_rect": "e855c8dd-5f5b-4cfe-9732-aad17bece341.png",
    "tin_star": "6411f68e-2c2c-415d-919b-42c542b7ef5f.png",
    "tin_heart": "46c9b76e-0d7a-4744-9e7a-76152a727675.png",
}
OUT = r"C:\Users\86198\Documents\Qoder\2026-09-25\ee8addec\dist\assets\tins"


def largest_component_bbox(a):
    h, w = a.shape
    seen = np.zeros((h, w), dtype=bool)
    best = None
    from collections import deque
    for sy in range(0, h, 4):
        for sx in range(0, w, 4):
            if a[sy, sx] > 8 and not seen[sy, sx]:
                comp_minx = comp_maxx = sx
                comp_miny = comp_maxy = sy
                count = 0
                q = deque([(sx, sy)])
                seen[sy, sx] = True
                while q:
                    x, y = q.popleft()
                    count += 1
                    if x < comp_minx: comp_minx = x
                    if x > comp_maxx: comp_maxx = x
                    if y < comp_miny: comp_miny = y
                    if y > comp_maxy: comp_maxy = y
                    for nx, ny in ((x + 2, y), (x - 2, y), (x, y + 2), (x, y - 2)):
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny, nx] and a[ny, nx] > 8:
                            seen[ny, nx] = True
                            q.append((nx, ny))
                if best is None or count > best[0]:
                    best = (count, comp_minx, comp_miny, comp_maxx, comp_maxy)
    return best


for name, fn in FILES.items():
    img = Image.open(os.path.join(SRC, fn)).convert("RGBA")
    arr = np.array(img).astype(np.float64)
    rgb, a = arr[:, :, :3], arr[:, :, 3]
    lum = rgb.mean(axis=2)
    dark = (lum < 40) & (a < 200)
    alpha = np.where(dark, 0, 255).astype(np.uint8)
    bb = largest_component_bbox(alpha)
    pad = 6
    x0 = max(0, bb[1] - pad); y0 = max(0, bb[2] - pad)
    x1 = min(img.width, bb[3] + pad + 1); y1 = min(img.height, bb[4] + pad + 1)
    crop = img.crop((x0, y0, x1, y1))
    ca = np.array(crop)
    clum = ca[:, :, :3].mean(axis=2)
    ca[:, :, 3] = np.where((clum < 40) & (ca[:, :, 3] < 200), 0, 255).astype(np.uint8)
    a2 = ca[:, :, 3].astype(np.float64)
    # un-darken semi-transparent edge pixels against black
    scale = 255.0 / np.maximum(a2, 1.0)
    for ch in range(3):
        ca[:, :, ch] = np.clip(ca[:, :, ch] * scale, 0, 255)
    crop = Image.fromarray(ca)
    a_soft = crop.getchannel("A").filter(ImageFilter.GaussianBlur(1.0))
    crop.putalpha(a_soft)
    bb2 = crop.getchannel("A").getbbox()
    crop = crop.crop(bb2)
    w, h = crop.size
    if max(w, h) > 800:
        s = 800.0 / max(w, h)
        crop = crop.resize((int(w * s), int(h * s)), Image.LANCZOS)
    q = crop.quantize(colors=256, method=Image.FASTOCTREE)
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name + ".png")
    q.save(p, optimize=True)
    print(name, crop.size, os.path.getsize(p), "bytes")
print("done")
