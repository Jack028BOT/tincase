import os
from PIL import Image

SRC = r"C:\Users\86198\.qoder-cn\tmp\C--Users-86198-Documents-Qoder-2026-09-25-ee8addec\images\ee8addec-f44e-49bd-9db3-ded4441cc8f9"
DST = r"C:\Users\86198\Documents\Qoder\2026-09-25\ee8addec\dist\assets\bg"
os.makedirs(DST, exist_ok=True)

files = [
    "7a95bacd-dd70-46f9-ad11-fc66b434482c.png",
    "54be8d21-b3ef-434d-acfa-95190857852b.png",
    "7b130e68-dd04-4398-ab56-9252c2d7e21d.png",
    "212deab0-90a7-4682-9333-0baf1be6c022.png",
    "95b8d706-d625-4212-9951-1fe1bca6a4db.png",
    "0fdf9776-10d5-492d-bb50-2b72be6859f9.png",
    "dbe1ea87-d5d3-4bb0-805f-44b45ae9c65e.png",
    "0657f973-3010-40ad-bb7c-6f3f97ffaba2.png",
    "fbeca8a0-ad23-4ef9-87fd-e9cb920443a2.png",
    "835cd68a-340c-4f8b-b99d-888ef29ae750.png",
]

total = 0
for i, name in enumerate(files, 1):
    im = Image.open(os.path.join(SRC, name)).convert("RGB")
    w = 810
    h = round(im.height * w / im.width)
    im = im.resize((w, h), Image.LANCZOS)
    out = os.path.join(DST, "bg_%d.png" % i)
    im.quantize(colors=256, method=Image.MEDIANCUT).save(out, optimize=True)
    size = os.path.getsize(out)
    total += size
    print("bg_%d.png  %dx%d  %.1f KB" % (i, w, h, size / 1024))
print("total %.1f KB" % (total / 1024))
