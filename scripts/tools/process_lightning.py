#!/usr/bin/env python3
"""
处理雷击术动画帧 - 背景透明化
"""

from PIL import Image
import os
from pathlib import Path

def analyze_background(img):
    """分析背景颜色 - 采样边缘区域"""
    # 采样边缘区域（四周10像素宽的区域）
    edge_pixels = []
    
    # 顶部边缘
    for x in range(img.width):
        edge_pixels.append(img.getpixel((x, 0)))
        edge_pixels.append(img.getpixel((x, min(10, img.height - 1))))
    
    # 底部边缘
    for x in range(img.width):
        edge_pixels.append(img.getpixel((x, img.height - 1)))
        edge_pixels.append(img.getpixel((x, max(img.height - 11, 0))))
    
    # 左侧边缘
    for y in range(img.height):
        edge_pixels.append(img.getpixel((0, y)))
        edge_pixels.append(img.getpixel((min(10, img.width - 1), y)))
    
    # 右侧边缘
    for y in range(img.height):
        edge_pixels.append(img.getpixel((img.width - 1, y)))
        edge_pixels.append(img.getpixel((max(img.width - 11, 0), y)))
    
    # 找出最常见的颜色作为背景色
    from collections import Counter
    color_counts = Counter(edge_pixels)
    bg_color = color_counts.most_common(1)[0][0]
    
    return bg_color[:3]  # 只返回RGB

def is_skin_color(r, g, b):
    """检测是否是肤色（保护人物脸部和手）- 更精确版本"""
    # 肤色判断：使用更严格的范围
    # 1. R必须大于G和B（肤色的特征）
    # 2. R-G的差值不能太大
    # 3. 整体亮度要适中
    
    brightness = (r + g + b) / 3
    
    # 太暗或太亮的都不是肤色
    if brightness < 80 or brightness > 240:
        return False
    
    # R必须最大，且G和B不能太接近R（避免浅灰色）
    if not (r >= g and r >= b):
        return False
    
    # R-G差值不能太大（肤色特征）
    r_g_diff = r - g
    if r_g_diff > 60:  # R和G差太大，可能是红色特效
        return False
    
    # 检查是否在常见肤色范围内
    # 浅肤色：高亮度，低饱和度
    # 深肤色：中等亮度，中等饱和度
    if r > 200 and g > 160 and b > 140:
        return True  # 浅肤色
    if r > 160 and g > 120 and b > 100 and r_g_diff < 50:
        return True  # 中等肤色
    if r > 130 and g > 100 and b > 80 and r_g_diff < 40:
        return True  # 深肤色
    
    return False

def make_transparent(input_path, output_path, tolerance=30):
    """去除背景，使其透明 - 平衡版"""
    img = Image.open(input_path).convert('RGBA')
    
    # 分析背景色
    bg_color = analyze_background(img)
    print(f"  背景色: RGB{bg_color}")
    
    # 计算背景亮度
    bg_brightness = (bg_color[0] + bg_color[1] + bg_color[2]) / 3
    print(f"  背景亮度: {bg_brightness:.1f}")
    
    # 创建新的像素数据
    pixels = img.load()
    width, height = img.size
    
    transparent_count = 0
    protected_count = 0
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # 计算当前像素的亮度
            brightness = (r + g + b) / 3
            
            # 检查是否是肤色（保护人物）
            if is_skin_color(r, g, b):
                protected_count += 1
                continue
            
            # 检查饱和度
            max_val = max(r, g, b)
            min_val = min(r, g, b)
            saturation = (max_val - min_val) / max_val if max_val > 0 else 0
            
            # 高饱和度颜色保护（特效和细节）
            if saturation > 0.5:
                protected_count += 1
                continue
            
            # 计算与背景色的颜色距离
            color_distance = abs(r - bg_color[0]) + abs(g - bg_color[1]) + abs(b - bg_color[2])
            
            # 计算亮度差
            brightness_diff = abs(brightness - bg_brightness)
            
            # 综合判断：颜色接近且亮度接近
            if color_distance <= tolerance * 3 and brightness_diff <= 30:
                # 设置为完全透明
                pixels[x, y] = (r, g, b, 0)
                transparent_count += 1
            elif color_distance <= tolerance * 4 and brightness_diff <= 40:
                # 半透明过渡
                alpha = int(255 * (1 - (color_distance / (tolerance * 4))))
                pixels[x, y] = (r, g, b, max(0, min(255, alpha)))
                transparent_count += 1
    
    # 保存
    img.save(output_path)
    
    total_pixels = width * height
    transparency_rate = (transparent_count / total_pixels) * 100
    print(f"  透明化像素: {transparent_count}/{total_pixels} ({transparency_rate:.2f}%)")
    print(f"  保护像素: {protected_count}/{total_pixels} ({(protected_count/total_pixels)*100:.2f}%)")
    
    return bg_color, transparency_rate

def process_lightning_cast():
    """处理雷击术释放动画"""
    base_dir = Path(__file__).parent.parent.parent
    input_dir = base_dir / 'images/effects/lightning_cast'
    output_dir = base_dir / 'images/effects/lightning_cast'
    
    print("\n⚡ 处理雷击术释放动画...")
    print(f"输入目录: {input_dir}")
    print(f"输出目录: {output_dir}")
    
    if not input_dir.exists():
        print(f"❌ 输入目录不存在: {input_dir}")
        return
    
    # 处理所有帧
    files = sorted(input_dir.glob('lightning_cast_*.png'))
    print(f"找到 {len(files)} 帧")
    
    bg_colors = []
    transparency_rates = []
    
    for i, file in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] 处理: {file.name}")
        bg_color, rate = make_transparent(file, file)
        bg_colors.append(bg_color)
        transparency_rates.append(rate)
    
    # 统计信息
    avg_r = sum(c[0] for c in bg_colors) // len(bg_colors)
    avg_g = sum(c[1] for c in bg_colors) // len(bg_colors)
    avg_b = sum(c[2] for c in bg_colors) // len(bg_colors)
    avg_rate = sum(transparency_rates) / len(transparency_rates)
    
    print(f"\n✅ 雷击术释放动画处理完成！")
    print(f"平均背景色: RGB({avg_r}, {avg_g}, {avg_b})")
    print(f"平均透明化比例: {avg_rate:.2f}%")

def process_lightning_hit():
    """处理雷击术击中动画"""
    base_dir = Path(__file__).parent.parent.parent
    input_dir = base_dir / 'images/effects/lightning_hit'
    output_dir = base_dir / 'images/effects/lightning_hit'
    
    print("\n⚡ 处理雷击术击中动画...")
    print(f"输入目录: {input_dir}")
    print(f"输出目录: {output_dir}")
    
    if not input_dir.exists():
        print(f"❌ 输入目录不存在: {input_dir}")
        return
    
    # 处理所有帧
    files = sorted(input_dir.glob('lightning_hit_*.png'))
    print(f"找到 {len(files)} 帧")
    
    bg_colors = []
    transparency_rates = []
    
    for i, file in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] 处理: {file.name}")
        bg_color, rate = make_transparent(file, file)
        bg_colors.append(bg_color)
        transparency_rates.append(rate)
    
    # 统计信息
    avg_r = sum(c[0] for c in bg_colors) // len(bg_colors)
    avg_g = sum(c[1] for c in bg_colors) // len(bg_colors)
    avg_b = sum(c[2] for c in bg_colors) // len(bg_colors)
    avg_rate = sum(transparency_rates) / len(transparency_rates)
    
    print(f"\n✅ 雷击术击中动画处理完成！")
    print(f"平均背景色: RGB({avg_r}, {avg_g}, {avg_b})")
    print(f"平均透明化比例: {avg_rate:.2f}%")

if __name__ == '__main__':
    print("⚡ 雷击术动画背景透明化处理")
    print("=" * 60)
    
    process_lightning_cast()
    process_lightning_hit()
    
    print("\n" + "=" * 60)
    print("✅ 所有雷击术动画处理完成！")
