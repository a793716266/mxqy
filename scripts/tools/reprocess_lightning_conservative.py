#!/usr/bin/env python3
"""
重新处理雷击术击中特效帧 - 保守算法，只去除明确的绿色背景
"""

import os
from PIL import Image

# 配置
INPUT_DIR = 'images/effects/lightning_hit_temp'
OUTPUT_DIR = 'images/effects/lightning_hit'
START_FRAME = 78
END_FRAME = 100

# 创建输出目录
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("开始重新处理雷击术击中特效帧（保守算法）...")

# 处理每一帧
frame_index = 1
for i in range(START_FRAME, END_FRAME + 1):
    source_file = os.path.join(INPUT_DIR, f'frame_{i:04d}.png')
    
    if not os.path.exists(source_file):
        print(f"警告：文件不存在 {source_file}")
        continue
    
    # 打开图片
    img = Image.open(source_file).convert('RGBA')
    pixels = img.load()
    width, height = img.size
    
    removed_count = 0
    
    # 保守地去背景：只去除明确的绿色背景
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # 只去除非常明显的绿色背景
            # 条件：绿色通道非常高（>180），且红蓝通道很低（<100）
            if g > 180 and r < 100 and b < 100:
                # 完全透明
                pixels[x, y] = (r, g, b, 0)
                removed_count += 1
            # 处理浅绿色（绿色略高）
            elif g > 150 and r < 120 and b < 120:
                # 部分透明
                green_ratio = g / max(r, b, 1)
                if green_ratio > 1.8:
                    # 完全透明
                    pixels[x, y] = (r, g, b, 0)
                    removed_count += 1
                elif green_ratio > 1.5:
                    # 部分透明（保留50%）
                    pixels[x, y] = (r, g, b, max(0, int(a * 0.5)))
                    removed_count += 1
    
    # 去除右下角水印（200x100像素区域）
    watermark_width = 200
    watermark_height = 100
    for y in range(height - watermark_height, height):
        for x in range(width - watermark_width, width):
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (r, g, b, 0)
    
    # 保存
    output_file = os.path.join(OUTPUT_DIR, f'lightning_hit_{frame_index:02d}.png')
    img.save(output_file)
    
    print(f"处理完成: {i:04d} -> {frame_index:02d} - 去除了 {removed_count} 个像素")
    frame_index += 1

# 清理临时文件
import shutil
shutil.rmtree(INPUT_DIR)

print(f"\n✅ 处理完成！共 {frame_index - 1} 帧")
print(f"输出目录: {OUTPUT_DIR}")
