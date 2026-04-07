#!/usr/bin/env python3
"""
处理猫咪动画帧 - 背景透明化
"""

from PIL import Image
import numpy as np
from pathlib import Path

def analyze_background(img_array):
    """分析背景颜色 - 采样边缘区域"""
    h, w = img_array.shape[:2]
    edge_pixels = []
    
    # 采样边缘区域
    for x in range(w):
        edge_pixels.append(tuple(img_array[0, x, :3]))
        edge_pixels.append(tuple(img_array[min(10, h-1), x, :3]))
    
    for x in range(w):
        edge_pixels.append(tuple(img_array[h-1, x, :3]))
        edge_pixels.append(tuple(img_array[max(h-11, 0), x, :3]))
    
    for y in range(h):
        edge_pixels.append(tuple(img_array[y, 0, :3]))
        edge_pixels.append(tuple(img_array[y, min(10, w-1), :3]))
    
    for y in range(h):
        edge_pixels.append(tuple(img_array[y, w-1, :3]))
        edge_pixels.append(tuple(img_array[y, max(w-11, 0), :3]))
    
    # 找出最常见的颜色作为背景色
    from collections import Counter
    color_counts = Counter(edge_pixels)
    bg_color = color_counts.most_common(1)[0][0]
    
    return bg_color

def process_frame(input_path, output_path):
    """处理单帧：背景变黑 -> 透明化"""
    # 加载图像
    img = Image.open(input_path).convert('RGBA')
    img_array = np.array(img)
    
    # 分析背景色
    bg_color = analyze_background(img_array)
    print(f"  背景色: RGB{bg_color}")
    
    # 计算亮度
    brightness = np.mean(img_array[:, :, :3], axis=2)
    
    # 第一步：将浅色背景替换为黑色
    # 阈值设为240，接近白色的区域
    bg_mask = brightness > 240
    img_array[bg_mask] = [0, 0, 0, 255]
    
    black_pixels = np.sum(bg_mask)
    total_pixels = bg_mask.size
    black_rate = (black_pixels / total_pixels) * 100
    print(f"  变黑: {black_pixels}/{total_pixels} ({black_rate:.2f}%)")
    
    # 第二步：将黑色背景透明化
    transparent_count = 0
    for y in range(img_array.shape[0]):
        for x in range(img_array.shape[1]):
            r, g, b = img_array[y, x, :3]
            
            # 如果是黑色（或接近黑色），设置为透明
            if r < 20 and g < 20 and b < 20:
                img_array[y, x, 3] = 0
                transparent_count += 1
    
    transparency_rate = (transparent_count / total_pixels) * 100
    print(f"  透明化: {transparent_count}/{total_pixels} ({transparency_rate:.2f}%)")
    
    # 保存
    result_img = Image.fromarray(img_array, 'RGBA')
    result_img.save(output_path)

def process_directory(input_dir, prefix):
    """处理目录中的所有帧"""
    print(f"\n🎨 处理 {prefix} 动画...")
    print(f"输入目录: {input_dir}")
    
    files = sorted(input_dir.glob(f'{prefix}_*.png'))
    print(f"找到 {len(files)} 帧")
    
    for i, file in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] {file.name}")
        process_frame(file, file)
    
    print(f"\n✅ {prefix} 动画处理完成！")

def main():
    """主函数"""
    base_dir = Path(__file__).parent.parent.parent
    anim_dir = base_dir / 'images/characters_anim'
    
    print("🐱 猫咪动画背景透明化处理")
    print("=" * 60)
    
    # 处理idle动画
    idle_dir = anim_dir / 'cat_idle'
    process_directory(idle_dir, 'idle')
    
    # 处理walk动画
    walk_dir = anim_dir / 'cat_walk'
    process_directory(walk_dir, 'walk')
    
    print("\n" + "=" * 60)
    print("✅ 所有处理完成！")

if __name__ == '__main__':
    main()
