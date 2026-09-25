import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

BASE = r"C:\Users\86198\Desktop\广东工业大学\AI图片"
FILES = [
    ("star_text",  "866309678473789702.jpg", 30),
    ("kaomoji",    "1141451468115425316.jpg", 30),
    ("bow",        "aesthetic blue stickers _ __ Discover Our Free Sticker Bundle_ _Blue Bow Aesthetic_ Stickers fo.jpg", 22),
    ("star_best",  "png (1).jpg", 6),
    ("bubbles",    "png (2).jpg", 30),
    ("star_bloom", "png.jpg", 30),
    ("chat",       "💕💕💕.jpg", 30),
    ("heart_text", "💛.jpg", 30),
    ("camera",     "_✦ ݁˖.jpg", 30),
    ("patches",    "2744449770148903.jpg", 26),
]
THRESH_IDX = 2
OUT = r"C:\Users\86198\Documents\Qoder\2026-09-25\ee8addec\dist\assets\decal"
os.makedirs(OUT, exist_ok=True)

report = {}
for name, fn, thresh in FILES:
    img = Image.open(os.path.join(BASE, fn)).convert("RGBA")
    w, h = img.size
    # floodfill background from many border seeds so interior whites survive
    seeds = []
    for x in range(0, w, max(1, w // 12)):
        seeds.append((x, 0))
        seeds.append((x, h - 1))
    for y in range(0, h, max(1, h // 12)):
        seeds.append((0, y))
        seeds.append((w - 1, y))
    # flood with a magenta marker distinctly outside photo gamut
    MARK = (255, 0, 254, 255)
    for s in seeds:
        px = img.getpixel(s)
        if abs(px[0] - MARK[0]) + abs(px[1] - MARK[1]) + abs(px[2] - MARK[2]) > 60:
            ImageDraw.floodfill(img, s, MARK, thresh=thresh)
    arr = np.array(img)
    mask = ~((arr[:, :, 0] == 255) & (arr[:, :, 1] == 0) & (arr[:, :, 2] == 254))
    arr[:, :, 3] = np.where(mask, 255, 0).astype(np.uint8)
    # un-blend semi-transparent edge against white
    a = arr[:, :, 3].astype(np.float64)
    soft = np.clip(a / 255.0, 0, 1)
    for ch in range(3):
        c = arr[:, :, ch].astype(np.float64)
        arr[:, :, ch] = np.where((a > 0) & (a < 255), np.clip((c - (1 - soft) * 255) / np.maximum(soft, 0.01), 0, 255), c)
    crop = Image.fromarray(arr)
    bb = crop.getchannel("A").getbbox()
    crop = crop.crop(bb)
    a_img = crop.getchannel("A").filter(ImageFilter.GaussianBlur(0.8))
    crop.putalpha(a_img)
    cw, ch = crop.size
    if max(cw, ch) > 520:
        s = 520.0 / max(cw, ch)
        crop = crop.resize((max(1, int(cw * s)), max(1, int(ch * s))), Image.LANCZOS)
    q = crop.quantize(colors=256, method=Image.FASTOCTREE)
    p = os.path.join(OUT, "decal_%s.png" % name)
    q.save(p, optimize=True)
    report[name] = {"size": crop.size, "bytes": os.path.getsize(p)}
    print(name, crop.size, os.path.getsize(p))

# preview sheet
sheet = Image.new("RGB", (5 * 240 + 40, 2 * 260 + 30), (252, 214, 229))
keys = [k for k, _, _ in FILES]
for i, name in enumerate(keys):
    im = Image.open(os.path.join(OUT, "decal_%s.png" % name)).convert("RGBA")
    im.thumbnail((220, 240))
    x = 20 + (i % 5) * 240
    y = 15 + (i // 5) * 260
    sheet.paste(im, (x, y), im)
sheet.save(r"C:\Users\86198\Documents\Qoder\2026-09-25\ee8addec\decals_preview.png")
print("done")
