#!/usr/bin/env python3
"""
处理臻宝移动动画背景透明化
"""

from PIL import Image
import os

def make_background_transparent(img, threshold=240):
    """
    将浅色背景转换为透明
    threshold: RGB阈值，高于此值且低饱和度的像素将被设为透明
    """
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    # 转换为RGBA模式
    img = img.convert('RGBA')
    pixels = img.load()
    width, height = img.size
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # 检查是否是浅色背景（RGB都很高）
            if r > threshold and g > threshold and b > threshold:
                # 检查饱和度（低饱和度说明是灰白色背景）
                max_val = max(r, g, b)
                min_val = min(r, g, b)
                
                # 如果RGB值很接近（低饱和度），说明是背景
                if max_val - min_val < 15:
                    pixels[x, y] = (r, g, b, 0)  # 设为全透明
    
    return img

def process_directory(input_dir, output_dir, frame_type):
    """处理目录中的所有帧"""
    os.makedirs(output_dir, exist_ok=True)
    
    files = sorted([f for f in os.listdir(input_dir) if f.endswith('.png')])
    print(f"\n处理 {frame_type} 帧: {len(files)} 张")
    
    for filename in files:
        input_path = os.path.join(input_dir, filename)
        output_path = os.path.join(output_dir, filename)
        
        print(f"  处理 {filename}...", end=' ')
        
        img = Image.open(input_path)
        img = make_background_transparent(img, threshold=240)
        img.save(output_path)
        
        # 统计透明度
        pixels = list(img.getdata())
        transparent = sum(1 for p in pixels if p[3] == 0)
        total = len(pixels)
        print(f"透明度: {transparent/total*100:.1f}%")
    
    print(f"✅ {frame_type} 帧处理完成！")

if __name__ == "__main__":
    base_path = "/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim"
    
    # 处理idle帧
    process_directory(
        os.path.join(base_path, "zhenbao_idle"),
        os.path.join(base_path, "zhenbao_idle"),
        "IDLE"
    )
    
    # 处理walk帧
    process_directory(
        os.path.join(base_path, "zhenbao_walk"),
        os.path.join(base_path, "zhenbao_walk"),
        "WALK"
    )
