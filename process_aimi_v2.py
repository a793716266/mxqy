#!/usr/bin/env python3
"""
批量处理艾米（aimi）动画资源 - 改进版
使用颜色统计找到背景色并去除
"""

from PIL import Image
import os
from collections import Counter

def get_most_common_color(img):
    """获取图片中最常见的颜色（可能是背景）"""
    # 缩小图片以加快统计速度
    small_img = img.resize((100, 100), Image.Resampling.LANCZOS)
    datas = list(small_img.getdata())
    
    # 只统计RGB，忽略Alpha
    rgb_datas = [item[:3] for item in datas if len(item) >= 3]
    
    # 量化颜色（减少颜色数量以便统计）
    quantized = [(r // 20 * 20, g // 20 * 20, b // 20 * 20) for r, g, b in rgb_datas]
    
    # 统计最常见的颜色
    counter = Counter(quantized)
    most_common = counter.most_common(1)[0][0]
    
    return most_common

def remove_background_v2(input_path, output_path, tolerance=50):
    """
    改进的背景去除算法
    """
    # 打开图片
    img = Image.open(input_path).convert("RGBA")
    
    # 获取最常见的颜色（假设是背景）
    bg_color = get_most_common_color(img)
    print(f"  背景色 (RGB): {bg_color}")
    
    datas = img.getdata()
    new_data = []
    
    for item in datas:
        r, g, b, a = item
        
        # 计算与背景色的欧氏距离
        dist = ((r - bg_color[0]) ** 2 + 
                (g - bg_color[1]) ** 2 + 
                (b - bg_color[2]) ** 2) ** 0.5
        
        # 如果接近背景色，设为透明
        if dist <= tolerance:
            new_data.append((r, g, b, 0))  # 完全透明
        else:
            new_data.append(item)
    
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"  ✓ 完成")

def process_all_aimi():
    """处理所有艾米动画"""
    
    base_dir = "subpackages/battle/images/characters_anim/transparent/aimi"
    
    if not os.path.exists(base_dir):
        print(f"错误：目录不存在 {base_dir}")
        return
    
    animations = ['attack', 'buff', 'idle', 'skill', 'support', 'walk']
    
    total_count = 0
    
    for anim in animations:
        anim_dir = os.path.join(base_dir, anim)
        
        if not os.path.exists(anim_dir):
            continue
        
        print(f"\n处理 {anim} 动画...")
        
        frames = sorted([f for f in os.listdir(anim_dir) if f.endswith('.png')])
        
        for frame_file in frames:
            input_path = os.path.join(anim_dir, frame_file)
            output_path = input_path
            
            try:
                print(f"  {frame_file}", end=" ")
                remove_background_v2(input_path, output_path)
                total_count += 1
            except Exception as e:
                print(f"  ✗ 失败: {e}")
    
    print(f"\n{'='*50}")
    print(f"处理完成！共处理 {total_count} 张图片")
    print(f"{'='*50}")

if __name__ == "__main__":
    print("开始处理艾米动画资源（改进版）...")
    print("-" * 50)
    process_all_aimi()
