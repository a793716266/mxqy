#!/usr/bin/env python3
"""
重新处理雷击术击中特效帧 - 激进去除所有绿色
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

print("开始重新处理雷击术击中特效帧（激进去绿）...")

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
    
    # 激进去除所有绿色
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # 计算颜色特征
            total = r + g + b
            if total == 0:
                continue
            
            # 判断是否为绿色
            green_ratio = g / total
            
            # 判断是否为白色/黄色闪电核心（保留）
            is_white_or_yellow = (r > 200 and g > 200 and b > 200) or \
                                  (r > 200 and g > 150 and b < 150)
            
            # 如果不是白色/黄色核心，且绿色比例高，则去除
            if not is_white_or_yellow:
                # 绿色主导
                if green_ratio > 0.45 and g > r and g > b:
                    # 完全透明
                    pixels[x, y] = (r, g, b, 0)
                    removed_count += 1
                # 青绿色（绿色和蓝色高）
                elif g > 80 and b > 80 and g > r and (g + b) > r * 1.5:
                    # 完全透明
                    pixels[x, y] = (r, g, b, 0)
                    removed_count += 1
                # 浅绿色渐变
                elif g > 120 and g > r * 0.9 and g > b * 1.1 and r < 180:
                    # 根据绿色优势调整透明度
                    dominance = (g - max(r, b)) / 255.0
                    if dominance > 0.15:
                        # 完全透明
                        pixels[x, y] = (r, g, b, 0)
                        removed_count += 1
                    elif dominance > 0.05:
                        # 部分透明
                        new_alpha = int(a * (1 - dominance))
                        pixels[x, y] = (r, g, b, max(0, new_alpha))
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
