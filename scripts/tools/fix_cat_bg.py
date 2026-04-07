#!/usr/bin/env python3
"""
修复猫咪动画背景透明度 - 去除浅绿色背景残留
"""

from PIL import Image
import os

def remove_light_background(img, threshold=230):
    """
    去除浅色背景（RGB都高于threshold的像素）
    """
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    pixels = img.load()
    width, height = img.size
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # 如果是浅色背景（RGB都很高且接近）
            if r > threshold and g > threshold and b > threshold:
                # 检查是否是接近灰白的颜色（背景）
                max_val = max(r, g, b)
                min_val = min(r, g, b)
                
                # 如果RGB值很接近（低饱和度），说明是背景
                if max_val - min_val < 20:
                    pixels[x, y] = (r, g, b, 0)  # 设为全透明
    
    return img

def process_cat_animations():
    base_path = "/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim"
    
    # 处理idle帧
    idle_path = os.path.join(base_path, "cat_idle")
    print(f"处理 IDLE 帧: {idle_path}")
    
    for filename in sorted(os.listdir(idle_path)):
        if filename.endswith('.png'):
            filepath = os.path.join(idle_path, filename)
            print(f"  处理 {filename}...")
            
            img = Image.open(filepath)
            original_mode = img.mode
            
            # 去除浅色背景
            img = remove_light_background(img, threshold=230)
            
            # 保存
            img.save(filepath)
            
            # 统计透明度
            pixels = list(img.getdata())
            transparent = sum(1 for p in pixels if p[3] == 0)
            total = len(pixels)
            print(f"    透明度: {transparent}/{total} ({transparent/total*100:.1f}%)")
    
    # 处理walk帧
    walk_path = os.path.join(base_path, "cat_walk")
    print(f"\n处理 WALK 帧: {walk_path}")
    
    for filename in sorted(os.listdir(walk_path)):
        if filename.endswith('.png'):
            filepath = os.path.join(walk_path, filename)
            print(f"  处理 {filename}...")
            
            img = Image.open(filepath)
            
            # 去除浅色背景
            img = remove_light_background(img, threshold=230)
            
            # 保存
            img.save(filepath)
            
            # 统计透明度
            pixels = list(img.getdata())
            transparent = sum(1 for p in pixels if p[3] == 0)
            total = len(pixels)
            print(f"    透明度: {transparent}/{total} ({transparent/total*100:.1f}%)")
    
    print("\n✅ 背景透明化处理完成！")

if __name__ == "__main__":
    process_cat_animations()
