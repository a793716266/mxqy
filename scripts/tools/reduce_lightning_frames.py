#!/usr/bin/env python3
"""
将雷击术121帧减少到30帧 - 均匀采样 + 去背景去水印
"""

from PIL import Image
import os
import shutil

def process_frame(input_path, output_path):
    """
    处理单帧 - 去除背景和右下角水印
    """
    img = Image.open(input_path)

    # 转换为RGBA
    if img.mode == 'RGB':
        img = img.convert('RGBA')

    pixels = img.load()
    width, height = img.size

    # 分析背景颜色（从角落采样）
    bg_samples = []
    for x in [0, 1, 2, width-1, width-2, width-3]:
        for y in [0, 1, 2, height-1, height-2, height-3]:
            bg_samples.append(pixels[x, y][:3])

    # 计算背景色平均值
    bg_r = sum([s[0] for s in bg_samples]) // len(bg_samples)
    bg_g = sum([s[1] for s in bg_samples]) // len(bg_samples)
    bg_b = sum([s[2] for s in bg_samples]) // len(bg_samples)

    # 去除背景（容差30）
    tolerance = 30
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y][:3]

            # 计算与背景色的距离
            diff = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)

            if diff < tolerance * 3:
                # 接近背景色 -> 完全透明
                pixels[x, y] = (r, g, b, 0)
            elif diff < tolerance * 6:
                # 半透明过渡区域
                alpha = int(255 * (diff - tolerance * 3) / (tolerance * 3))
                pixels[x, y] = (r, g, b, alpha)

    # 去除右下角水印区域（200x100）
    for y in range(max(0, height - 100), height):
        for x in range(max(0, width - 200), width):
            pixels[x, y] = (0, 0, 0, 0)

    img.save(output_path, 'PNG')
    return img.size

def main():
    base_dir = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/effects'

    input_dir = os.path.join(base_dir, 'lightning_new')
    output_dir = os.path.join(base_dir, 'lightning_cast_new')

    os.makedirs(output_dir, exist_ok=True)

    # 获取所有帧
    all_frames = sorted([f for f in os.listdir(input_dir) if f.endswith('.png')])
    total_frames = len(all_frames)
    target_frames = 30

    print(f"📹 总帧数: {total_frames}")
    print(f"🎯 目标帧数: {target_frames}")

    # 均匀采样
    selected_indices = [int(i * (total_frames - 1) / (target_frames - 1)) for i in range(target_frames)]
    print(f"📊 采样索引: {selected_indices[:5]}...{selected_indices[-5:]}")

    # 处理选中的帧
    print("\n⚡ 处理帧...")
    for i, frame_idx in enumerate(selected_indices):
        input_file = all_frames[frame_idx]
        output_file = f'lightning_cast_{(i+1):02d}.png'

        input_path = os.path.join(input_dir, input_file)
        output_path = os.path.join(output_dir, output_file)

        size = process_frame(input_path, output_path)
        print(f"  ✅ {input_file} -> {output_file} ({size[0]}x{size[1]})")

    # 备份并替换
    print("\n📦 替换现有特效...")
    old_dir = os.path.join(base_dir, 'lightning_cast')
    backup_dir = os.path.join(base_dir, 'lightning_cast_backup')

    if os.path.exists(old_dir):
        shutil.move(old_dir, backup_dir)
        print(f"  ✅ 旧特效已备份: {backup_dir}")

    shutil.move(output_dir, old_dir)
    print(f"  ✅ 新特效已启用: {old_dir}")

    # 清理临时文件
    shutil.rmtree(input_dir)
    print(f"  ✅ 已清理临时文件")

    print(f"\n✅ 完成！已将{total_frames}帧减少到{target_frames}帧")

if __name__ == '__main__':
    main()
