#!/usr/bin/env python3
"""
臻宝动画素材处理 v7 - 精确切帧+去背+去水印
1. 先裁掉外层白色边框
2. 固定4x2网格切帧
3. 极低阈值去纯黑背景
4. 清除左上角数字水印
"""

import os
from PIL import Image

SOURCE_DIR = "_source_backup/臻宝"
OUTPUT_DIR = "images/characters_anim/zhenbao"

# 源图配置：(文件名, 动作前缀)
SOURCES = [
    ("臻宝待机动画.png", "IDLE"),
    ("臻宝普通攻击.png", "ATTACK"),
    ("臻宝盾击.png", "SKILL_SHIELD"),
    ("臻宝BUFF技能.png", "SKILL_BUFF"),
]

# 网格配置: 4列 x 2行
COLS, ROWS = 4, 2

# 边框裁剪: 外层的白色边框宽度
BORDER_TRIM = 5  # 每边裁掉的像素数

# 去背参数: 只去除接近纯黑的像素
BG_THRESHOLD = 20

# 水印区域: 左上角
WM_W = 55   # 水印区域宽
WM_H = 45   # 水印区域高


def trim_border(img):
    """裁掉外层白色边框"""
    return img.crop((
        BORDER_TRIM,
        BORDER_TRIM,
        img.size[0] - BORDER_TRIM,
        img.size[1] - BORDER_TRIM,
    ))


def remove_black_bg(frame):
    """去除近黑色背景 -> 透明，保留所有非黑像素"""
    frame = frame.convert("RGBA")
    pixels = frame.load()
    w, h = frame.size
    
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r < BG_THRESHOLD and g < BG_THRESHOLD and b < BG_THRESHOLD:
                pixels[x, y] = (0, 0, 0, 0)
    return frame


def clear_watermark(frame):
    """清除左上角水印区域 -> 设为透明"""
    pixels = frame.load()
    
    for y in range(min(WM_H, frame.size[1])):
        for x in range(min(WM_W, frame.size[0])):
            r, g, b, a = pixels[x, y]
            if a > 10:  # 有内容的像素才清除
                pixels[x, y] = (0, 0, 0, 0)
    return frame


def process_source(src_path, prefix, out_dir):
    print(f"\n处理: {src_path}")
    
    img = Image.open(src_path).convert("RGBA")
    orig_w, orig_h = img.size
    
    # 步骤1: 裁掉外层边框
    img = trim_border(img)
    inner_w, inner_h = img.size
    
    # 固定4x2网格均分
    fw = inner_w // COLS
    fh = inner_h // ROWS
    
    print(f"  原始: {orig_w}x{orig_h} -> 裁边: {inner_w}x{inner_h} -> 单帧: {fw}x{fh}")
    
    idx = 0
    for row in range(ROWS):
        for col in range(COLS):
            x = col * fw
            y = row * fh
            
            # 切帧
            frame = img.crop((x, y, x + fw, y + fh))
            
            # 步骤2: 去除黑底
            frame = remove_black_bg(frame)
            
            # 步骤3: 清除水印
            frame = clear_watermark(frame)
            
            idx += 1
            name = f"{prefix}_{idx:02d}.png"
            frame.save(os.path.join(out_dir, name))
            print(f"  ✓ {name}")
    
    return idx


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    total = 0
    for src_name, prefix in SOURCES:
        p = os.path.join(SOURCE_DIR, src_name)
        if os.path.exists(p):
            total += process_source(p, prefix, OUTPUT_DIR)
        else:
            print(f"⚠ 未找到: {p}")
    
    print(f"\n✅ 完成! 共 {total} 帧 -> {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
