#!/usr/bin/env python3
"""
重新处理雷击术击中特效帧 - 激进去除绿色残留
"""

import os
from PIL import Image

# 配置
INPUT_DIR = 'images/effects/lightning_hit'
OUTPUT_DIR = 'images/effects/lightning_hit_cleaned'

# 创建输出目录
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("开始重新处理雷击术击中特效帧（激进去绿）...")

# 处理每一帧
for i in range(1, 24):
    filename = f'lightning_hit_{i:02d}.png'
    filepath = os.path.join(INPUT_DIR, filename)
    
    if not os.path.exists(filepath):
        print(f"警告：文件不存在 {filepath}")
        continue
    
    # 打开图片
    img = Image.open(filepath).convert('RGBA')
    pixels = img.load()
    width, height = img.size
    
    # 统计处理情况
    removed_count = 0
    
    # 激进去除绿色背景和残留
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # 如果已经是完全透明，跳过
            if a == 0:
                continue
            
            # 判断是否应该去除
            
            # 条件1：纯绿色背景（绿色通道明显高于红蓝）
            if g > 80 and g > r * 1.2 and g > b * 1.2:
                # 完全透明
                pixels[x, y] = (r, g, b, 0)
                removed_count += 1
                continue
            
            # 条件2：绿色偏多（绿色通道是最大值）
            if g > 50 and g > r and g > b:
                # 根据绿色优势程度调整透明度
                green_dominance = g / max(r, b, 1)
                if green_dominance > 1.5:
                    # 完全透明
                    pixels[x, y] = (r, g, b, 0)
                    removed_count += 1
                elif green_dominance > 1.2:
                    # 部分透明
                    new_alpha = int(a * (1 - (green_dominance - 1.2) / 0.3))
                    pixels[x, y] = (r, g, b, max(0, new_alpha))
                    removed_count += 1
            
            # 条件3：浅绿/青绿色（绿色和蓝色都比较高）
            if g > 100 and b > 80 and g > r:
                # 检查是否偏青绿色
                if abs(g - b) < 50 and g > 120:
                    # 完全透明
                    pixels[x, y] = (r, g, b, 0)
                    removed_count += 1
            
            # 条件4：黄绿色（红色和绿色都比较高）
            if g > 100 and r > 80 and g > b:
                # 检查是否偏黄绿色
                if abs(g - r) < 50 and g > 120:
                    # 部分透明
                    new_alpha = int(a * 0.3)
                    pixels[x, y] = (r, g, b, new_alpha)
                    removed_count += 1
    
    # 保存处理后的图片
    output_path = os.path.join(OUTPUT_DIR, filename)
    img.save(output_path)
    
    print(f"处理完成: {filename} - 去除了 {removed_count} 个绿色像素")

print(f"\n✅ 处理完成！输出目录: {OUTPUT_DIR}")
