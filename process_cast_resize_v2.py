#!/usr/bin/env python3
"""
重新处理 cast_fireball / cast_ice / cast_lightning，
使角色体量与 cast_attack 一致。

关键调整：
- 加大缩放比例，让角色更大
- 底部对齐（脚底对齐）
- 特效允许超出画布上方（因为角色是主体）
"""
import os
from PIL import Image

BASE_DIR = os.path.join(os.path.dirname(__file__),
    'subpackages/battle/images/characters_anim/transparent/lixiaobao')
CANVAS_W, CANVAS_H = 206, 337
# cast_attack的角色约占画布高度的95%+，用1.15倍让内容更饱满
SCALE_FACTOR = 1.15

FOLDERS = ['cast_fireball', 'cast_ice', 'cast_lightning']

def get_content_bbox(img):
    """获取非透明内容的边界框 (left, top, right, bottom)"""
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    alpha = img.split()[3]
    nonzero = list(alpha.getdata())
    width, height = img.size
    
    min_x, min_y = width, height
    max_x, max_y = 0, 0
    
    for i, a in enumerate(nonzero):
        if a > 10:
            x = i % width
            y = i // width
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
    
    if max_x < min_x or max_y < min_y:
        return None
    
    return (min_x, min_y, max_x + 1, max_y + 1)

def process_folder(folder_name):
    folder_path = os.path.join(BASE_DIR, folder_name)
    files = sorted([f for f in os.listdir(folder_path) if f.endswith('.png')])
    print(f'\n=== {folder_name} ({len(files)} frames) ===')
    
    for fname in files:
        path = os.path.join(folder_path, fname)
        img = Image.open(path).convert('RGBA')
        
        bbox = get_content_bbox(img)
        if not bbox:
            print(f'  {fname}: SKIP')
            continue
        
        left, top, right, bottom = bbox
        content_w = right - left
        content_h = bottom - top
        
        content = img.crop(bbox)
        
        # 用 SCALE_FACTOR 放大
        new_w = int(content_w * SCALE_FACTOR)
        new_h = int(content_h * SCALE_FACTOR)
        
        resized = content.resize((new_w, new_h), Image.LANCZOS)
        
        canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
        
        # 水平居中，底部对齐
        paste_x = (CANVAS_W - new_w) // 2
        paste_y = CANVAS_H - new_h
        
        canvas.paste(resized, (paste_x, paste_y), resized)
        canvas.save(path)
        print(f'  {fname}: {content_w}x{content_h} -> {new_w}x{new_h} @ ({paste_x},{paste_y})')

def main():
    for folder in FOLDERS:
        process_folder(folder)
    print('\nDone!')

if __name__ == '__main__':
    main()
