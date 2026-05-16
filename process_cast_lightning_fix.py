#!/usr/bin/env python3
"""
Fix cast_lightning frames 05-08: scale up 1.2x, canvas 320x400
"""

import os
from PIL import Image

BASE_DIR = "subpackages/battle/images/characters_anim/transparent/lixiaobao/cast_lightning"
OUTPUT_SIZE = (320, 400)
SCALE = 1.2

def process_frame(idx):
    src = os.path.join(BASE_DIR, f"cast_lightning_{idx:02d}.png")
    img = Image.open(src).convert("RGBA")

    if idx <= 4:
        new_img = Image.new("RGBA", OUTPUT_SIZE, (0, 0, 0, 0))
        paste_x = (OUTPUT_SIZE[0] - img.width) // 2
        paste_y = (OUTPUT_SIZE[1] - img.height) // 2
        new_img.paste(img, (paste_x, paste_y), img)
        return new_img

    new_w = int(img.width * SCALE)
    new_h = int(img.height * SCALE)
    scaled = img.resize((new_w, new_h), Image.LANCZOS)

    new_img = Image.new("RGBA", OUTPUT_SIZE, (0, 0, 0, 0))
    paste_x = (OUTPUT_SIZE[0] - scaled.width) // 2
    paste_y = (OUTPUT_SIZE[1] - scaled.height) // 2
    new_img.paste(scaled, (paste_x, paste_y), scaled)

    return new_img

print(f"=== cast_lightning fix: canvas {OUTPUT_SIZE[0]}x{OUTPUT_SIZE[1]}, scale {SCALE}x ===")
print(f"  Scaled size: {int(240*SCALE)}x{int(240*SCALE)}")
for i in range(1, 9):
    result = process_frame(i)
    out_path = os.path.join(BASE_DIR, f"cast_lightning_{i:02d}.png")
    result.save(out_path, optimize=True)
    print(f"  Frame {i:02d}: {result.size} OK")

print("Done!")
