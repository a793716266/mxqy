#!/usr/bin/env python3
"""
处理冰晶术施法动画帧
- 去除背景（透明化）
- 缩放到 128x128
- 优化压缩
"""

import os
from pathlib import Path
from PIL import Image

def remove_background(img, threshold=235):
    """
    去除浅灰白色背景，保留蓝色特效
    算法逻辑：
    1. 背景色特征：R、G、B都很高（>=235）且彼此接近（灰色系）
    2. 冰晶特效特征：B值明显大于R和G（蓝色系）
    3. 右下角文字：额外的文字水印区域去除
    """
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    pixels = img.load()
    width, height = img.size
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # 判断是否为背景色（浅灰白色）
            is_high_value = (r >= threshold and g >= threshold and b >= threshold)
            is_gray = (abs(r - g) < 20 and abs(g - b) < 25 and abs(r - b) < 25)
            is_bg = is_high_value and is_gray
            
            # 判断是否为蓝色特效（需要保留）
            is_blue_effect = (b > r + 15 and b > g + 15)  # B明显大于R和G
            
            # 只去除背景色，保留蓝色特效
            if is_bg and not is_blue_effect:
                pixels[x, y] = (r, g, b, 0)  # 设为透明
    
    # 额外处理：去除右下角的文字水印（最后100x100区域）
    for y in range(height - 100, height):
        for x in range(width - 100, width):
            r, g, b, a = pixels[x, y]
            # 去除灰色文字（非蓝色特效）
            if not (b > r + 15 and b > g + 15):  # 不是蓝色特效
                if r < 235 or g < 235 or b < 235:  # 不是纯白背景
                    pixels[x, y] = (r, g, b, 0)  # 设为透明
    
    return img

def process_ice_shard_cast():
    """处理冰晶术施法动作帧"""
    # 路径设置
    base_dir = Path(__file__).parent.parent.parent
    input_dir = base_dir / 'images/characters_anim/ice_shard_frames'
    output_dir = base_dir / 'images/effects/ice_shard_cast'
    
    # 创建输出目录
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"[Ice Shard Cast] 处理冰晶术施法动画...")
    print(f"  输入: {input_dir}")
    print(f"  输出: {output_dir}")
    
    # 处理 frame_0001 到 frame_0016
    for i in range(1, 17):  # 1 到 16
        input_file = input_dir / f'frame_{i:04d}.png'
        output_file = output_dir / f'ice_shard_cast_{i:02d}.png'
        
        if not input_file.exists():
            print(f"  ⚠️  跳过: {input_file.name} (不存在)")
            continue
        
        # 打开图片
        img = Image.open(input_file)
        print(f"  处理: {input_file.name} ({img.size[0]}x{img.size[1]})")
        
        # 去除背景
        img = remove_background(img)
        
        # 缩放到 480x480（与火球术保持一致）
        target_size = 480
        img = img.resize((target_size, target_size), Image.Resampling.LANCZOS)
        
        # 保存
        img.save(output_file, 'PNG', optimize=True)
        print(f"    → {output_file.name}")
    
    # 计算总大小
    total_size = sum(
        os.path.getsize(output_dir / f'ice_shard_cast_{i:02d}.png') 
        for i in range(1, 17) 
        if (output_dir / f'ice_shard_cast_{i:02d}.png').exists()
    ) / (1024 * 1024)
    
    print(f"\n✅ 处理完成！总大小: {total_size:.2f} MB")

if __name__ == '__main__':
    process_ice_shard_cast()
