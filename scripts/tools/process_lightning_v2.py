#!/usr/bin/env python3
"""
处理雷击术动画帧 - 改进版
1. 先将背景替换为纯黑色
2. 然后去掉黑色背景
3. 去掉右下角的文字
"""

from PIL import Image
import os
from pathlib import Path

def analyze_background(img):
    """分析背景颜色 - 采样边缘区域"""
    edge_pixels = []
    
    # 采样边缘区域（四周10像素宽的区域）
    for x in range(img.width):
        edge_pixels.append(img.getpixel((x, 0)))
        edge_pixels.append(img.getpixel((x, min(10, img.height - 1))))
    
    for x in range(img.width):
        edge_pixels.append(img.getpixel((x, img.height - 1)))
        edge_pixels.append(img.getpixel((x, max(img.height - 11, 0))))
    
    for y in range(img.height):
        edge_pixels.append(img.getpixel((0, y)))
        edge_pixels.append(img.getpixel((min(10, img.width - 1), y)))
    
    for y in range(img.height):
        edge_pixels.append(img.getpixel((img.width - 1, y)))
        edge_pixels.append(img.getpixel((max(img.width - 11, 0), y)))
    
    # 找出最常见的颜色作为背景色
    from collections import Counter
    color_counts = Counter(edge_pixels)
    bg_color = color_counts.most_common(1)[0][0]
    
    return bg_color[:3]  # 只返回RGB

def is_bright_pixel(r, g, b, bg_color, threshold=30):
    """检查像素是否属于背景（亮色）"""
    color_distance = abs(r - bg_color[0]) + abs(g - bg_color[1]) + abs(b - bg_color[2])
    brightness = (r + g + b) / 3
    bg_brightness = (bg_color[0] + bg_color[1] + bg_color[2]) / 3
    
    # 如果颜色接近背景色且亮度接近
    return color_distance <= threshold * 3 and abs(brightness - bg_brightness) <= 30

def process_frame(input_path, output_path):
    """处理单帧：背景变黑 -> 去除黑色背景"""
    img = Image.open(input_path).convert('RGBA')
    pixels = img.load()
    width, height = img.size
    
    # 第一步：分析背景色
    bg_color = analyze_background(img)
    print(f"  原始背景色: RGB{bg_color}")
    
    # 第二步：将背景替换为黑色
    black_pixels = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # 检查是否是背景（亮色）
            if is_bright_pixel(r, g, b, bg_color, threshold=25):
                # 替换为黑色
                pixels[x, y] = (0, 0, 0, 255)
                black_pixels += 1
    
    black_rate = (black_pixels / (width * height)) * 100
    print(f"  背景变黑: {black_pixels}/{width * height} ({black_rate:.2f}%)")
    
    # 第三步：去掉右下角的文字（右下角区域变黑）
    # 假设文字在右下角 200x100 区域
    text_area_x = width - 200
    text_area_y = height - 100
    
    for y in range(text_area_y, height):
        for x in range(text_area_x, width):
            r, g, b, a = pixels[x, y]
            # 将右下角区域的所有非黑色像素变黑
            if not (r < 30 and g < 30 and b < 30):
                pixels[x, y] = (0, 0, 0, 255)
    
    # 第四步：去除黑色背景（设置为透明）
    transparent_count = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # 如果是黑色（或接近黑色），设置为透明
            if r < 20 and g < 20 and b < 20:
                pixels[x, y] = (r, g, b, 0)
                transparent_count += 1
    
    transparency_rate = (transparent_count / (width * height)) * 100
    print(f"  透明化像素: {transparent_count}/{width * height} ({transparency_rate:.2f}%)")
    
    # 保存
    img.save(output_path)
    
    return bg_color, black_rate, transparency_rate

def process_lightning_cast():
    """处理雷击术释放动画"""
    base_dir = Path(__file__).parent.parent.parent
    input_dir = base_dir / 'images/effects/lightning_cast'
    
    print("\n⚡ 处理雷击术释放动画...")
    print(f"输入目录: {input_dir}")
    
    if not input_dir.exists():
        print(f"❌ 输入目录不存在: {input_dir}")
        return
    
    # 处理所有帧
    files = sorted(input_dir.glob('lightning_cast_*.png'))
    print(f"找到 {len(files)} 帧")
    
    bg_colors = []
    black_rates = []
    transparency_rates = []
    
    for i, file in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] 处理: {file.name}")
        bg_color, black_rate, rate = process_frame(file, file)
        bg_colors.append(bg_color)
        black_rates.append(black_rate)
        transparency_rates.append(rate)
    
    # 统计信息
    avg_r = sum(c[0] for c in bg_colors) // len(bg_colors)
    avg_g = sum(c[1] for c in bg_colors) // len(bg_colors)
    avg_b = sum(c[2] for c in bg_colors) // len(bg_colors)
    avg_black = sum(black_rates) / len(black_rates)
    avg_transparency = sum(transparency_rates) / len(transparency_rates)
    
    print(f"\n✅ 雷击术释放动画处理完成！")
    print(f"平均背景色: RGB({avg_r}, {avg_g}, {avg_b})")
    print(f"平均变黑比例: {avg_black:.2f}%")
    print(f"平均透明化比例: {avg_transparency:.2f}%")

def process_lightning_hit():
    """处理雷击术击中动画"""
    base_dir = Path(__file__).parent.parent.parent
    input_dir = base_dir / 'images/effects/lightning_hit'
    
    print("\n⚡ 处理雷击术击中动画...")
    print(f"输入目录: {input_dir}")
    
    if not input_dir.exists():
        print(f"❌ 输入目录不存在: {input_dir}")
        return
    
    # 处理所有帧
    files = sorted(input_dir.glob('lightning_hit_*.png'))
    print(f"找到 {len(files)} 帧")
    
    bg_colors = []
    black_rates = []
    transparency_rates = []
    
    for i, file in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] 处理: {file.name}")
        bg_color, black_rate, rate = process_frame(file, file)
        bg_colors.append(bg_color)
        black_rates.append(black_rate)
        transparency_rates.append(rate)
    
    # 统计信息
    avg_r = sum(c[0] for c in bg_colors) // len(bg_colors)
    avg_g = sum(c[1] for c in bg_colors) // len(bg_colors)
    avg_b = sum(c[2] for c in bg_colors) // len(bg_colors)
    avg_black = sum(black_rates) / len(black_rates)
    avg_transparency = sum(transparency_rates) / len(transparency_rates)
    
    print(f"\n✅ 雷击术击中动画处理完成！")
    print(f"平均背景色: RGB({avg_r}, {avg_g}, {avg_b})")
    print(f"平均变黑比例: {avg_black:.2f}%")
    print(f"平均透明化比例: {avg_transparency:.2f}%")

if __name__ == '__main__':
    print("⚡ 雷击术动画背景透明化处理 V2")
    print("策略: 背景变黑 -> 去除黑色背景 -> 去除右下角文字")
    print("=" * 60)
    
    process_lightning_cast()
    process_lightning_hit()
    
    print("\n" + "=" * 60)
    print("✅ 所有雷击术动画处理完成！")
