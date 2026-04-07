#!/usr/bin/env python3
"""
处理雷击术击中特效帧
1. 提取0078-0100帧（共23帧）
2. 去除绿色背景
3. 去除右下角的水印文字
"""

import os
import shutil
from PIL import Image

# 配置
SOURCE_DIR = 'images/effects/lightning_hit_new'
OUTPUT_DIR = 'images/effects/lightning_hit'
START_FRAME = 78
END_FRAME = 100

# 创建输出目录
os.makedirs(OUTPUT_DIR, exist_ok=True)

print(f"开始处理雷击术击中特效帧 {START_FRAME:04d}-{END_FRAME:04d}...")

# 处理每一帧
frame_index = 1
for i in range(START_FRAME, END_FRAME + 1):
    source_file = os.path.join(SOURCE_DIR, f'lightning_hit_{i:04d}.png')
    
    if not os.path.exists(source_file):
        print(f"警告：文件不存在 {source_file}")
        continue
    
    # 打开图片
    img = Image.open(source_file).convert('RGBA')
    pixels = img.load()
    width, height = img.size
    
    # 去除绿色背景
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # 检测绿色背景（容差范围）
            if g > 150 and r < 120 and b < 120:
                # 完全透明
                pixels[x, y] = (r, g, b, 0)
            elif g > 100 and r < 150 and b < 150:
                # 半透明处理
                alpha = int(a * (1 - (g - 100) / 150))
                pixels[x, y] = (r, g, b, max(0, alpha))
    
    # 去除右下角水印（200x100像素区域）
    watermark_width = 200
    watermark_height = 100
    for y in range(height - watermark_height, height):
        for x in range(width - watermark_width, width):
            # 直接设置为完全透明
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (r, g, b, 0)
    
    # 保存为新文件名（01-23）
    output_file = os.path.join(OUTPUT_DIR, f'lightning_hit_{frame_index:02d}.png')
    img.save(output_file)
    
    print(f"处理完成: {i:04d} -> {frame_index:02d}")
    frame_index += 1

print(f"\n✅ 处理完成！共 {frame_index - 1} 帧")
print(f"输出目录: {OUTPUT_DIR}")
