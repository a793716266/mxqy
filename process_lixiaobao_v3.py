#!/usr/bin/env python3
"""
李小宝动画素材处理 v3 - 提取帧 + 去背 + 裁剪 + 缩放

1. 固定4x2网格切帧 (1254x1254 → 每帧313x627)
2. 去除深灰背景 (~RGB<80)
3. 清除左上角数字水印
4. 自动裁剪透明边界 (trim)
5. 缩放到目标尺寸:
   - walk/idle: 最大高度200
   - attack/cast: 最大高度280
"""

import os
from PIL import Image, ImageOps

SOURCE_DIR = "_source_backup/李小宝"
OUTPUT_RAW = "images/characters_anim/lixiaobao"   # 中间产物
OUTPUT_FINAL = "subpackages/battle/images/characters_anim/transparent/lixiaobao"

# 源图配置: (文件名, 动作名, 目标最大高度)
SOURCES = [
    ("李小宝移动.png",       "walk",           200),
    ("李小宝待机动画.png",   "idle",           200),
    ("李小宝普通攻击.png",   "attack",         280),
    ("火球术释放动画.png",   "cast_fireball",  280),
    ("冰晶术释放动画.png",   "cast_ice",       280),
    ("法师雷击术释放动画.png","cast_lightning", 280),
]

# 网格配置: 4列 x 2行
COLS, ROWS = 4, 2

# 去背景参数: 深灰背景阈值
BG_THRESHOLD = 80  # RGB都低于此值视为背景

# 水印清除区域 (左上角)
WM_W = 50
WM_H = 45


def remove_bg(frame):
    """去除深灰背景 → 透明"""
    frame = frame.convert("RGBA")
    pixels = frame.load()
    w, h = frame.size
    
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # 深灰背景 (接近均匀的灰色)
            if r < BG_THRESHOLD and g < BG_THRESHOLD and b < BG_THRESHOLD:
                pixels[x, y] = (0, 0, 0, 0)
            elif abs(int(r) - int(g)) < 25 and abs(int(g) - int(b)) < 25 and r < BG_THRESHOLD + 20 and g < BG_THRESHOLD + 20 and b < BG_THRESHOLD + 20:
                # 额外检测: 接近均匀的深色也去掉
                avg = (r + g + b) / 3
                if avg < BG_THRESHOLD + 10:
                    pixels[x, y] = (0, 0, 0, 0)
    
    return frame


def clear_watermark(frame):
    """清除左上角水印区域"""
    pixels = frame.load()
    for y in range(min(WM_H, frame.size[1])):
        for x in range(min(WM_W, frame.size[0])):
            if pixels[x, y][3] > 10:
                pixels[x, y] = (0, 0, 0, 0)
    return frame


def trim_and_resize(frame, max_height):
    """
    1. 裁掉四周完全透明的像素
    2. 保持宽高比缩放到max_height以内
    3. 加少量padding防止贴边
    """
    # 裁剪透明边界
    bbox = frame.getbbox()
    if bbox:
        frame = frame.crop(bbox)
    
    w, h = frame.size
    if h == 0 or w == 0:
        return frame
    
    # 缩放到目标高度
    if h > max_height:
        scale = max_height / h
        new_w = int(w * scale)
        new_h = max_height
        frame = frame.resize((new_w, new_h), Image.LANCZOS)
    
    # 添加小padding (3-5px)
    padding = 4
    padded = Image.new("RGBA", (frame.size[0] + padding*2, frame.size[1] + padding*2), (0, 0, 0, 0))
    padded.paste(frame, (padding, padding), frame if frame.mode == "RGBA" else None)
    
    return padded


def process_source(src_path, action_name, max_h, out_base):
    print(f"\n处理: {src_path} -> {action_name}")
    
    img = Image.open(src_path).convert("RGBA")
    w, h = img.size
    fw = w // COLS
    fh = h // ROWS
    
    print(f"  源图: {w}x{h}, 单帧: {fw}x{fh}")
    
    # 每个动作一个子目录
    out_dir = os.path.join(out_base, action_name)
    os.makedirs(out_dir, exist_ok=True)
    
    idx = 0
    for row in range(ROWS):
        for col in range(COLS):
            x = col * fw
            y = row * fh
            
            # 切帧
            frame = img.crop((x, y, x + fw, y + fh))
            
            # 去背景
            frame = remove_bg(frame)
            
            # 清水印
            frame = clear_watermark(frame)
            
            # 裁剪 + 缩放
            frame = trim_and_resize(frame, max_h)
            
            idx += 1
            fname = f"{action_name}_{idx:02d}.png"
            fpath = os.path.join(out_dir, fname)
            frame.save(fpath, optimize=True)
            size_kb = os.path.getsize(fpath) / 1024
            print(f"  ✓ {fname}: {frame.size[0]}x{frame.size[1]} ({size_kb:.1f}KB)")
    
    return idx


def main():
    os.makedirs(OUTPUT_FINAL, exist_ok=True)
    total = 0
    
    for src_name, action_name, max_h in SOURCES:
        p = os.path.join(SOURCE_DIR, src_name)
        if os.path.exists(p):
            n = process_source(p, action_name, max_h, OUTPUT_FINAL)
            total += n
        else:
            print(f"⚠ 未找到: {p}")
    
    print(f"\n✅ 完成! 共 {total} 帧 -> {OUTPUT_FINAL}/")


if __name__ == "__main__":
    main()
