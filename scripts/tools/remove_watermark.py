#!/usr/bin/env python3
"""
去除动画帧右下角的水印/文字 - 改进版
使用更激进的策略：直接裁剪右下角区域
"""

from PIL import Image
import os

def remove_watermark_aggressive(input_path, output_path):
    """
    激进去除水印：直接裁剪右下角区域
    """
    img = Image.open(input_path)
    width, height = img.size

    # 裁剪右下角水印区域（假设右下角100x50像素）
    watermark_width = 120
    watermark_height = 50

    # 从图片底部和右侧裁剪水印区域
    cropped = img.crop((0, 0, width - watermark_width, height - watermark_height))

    # 创建新图片，将裁剪后的内容放在左上角，右下角填充透明
    new_img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    new_img.paste(cropped, (0, 0))

    # 保存
    new_img.save(output_path, 'PNG')
    return new_img.size

def remove_watermark_smart(input_path, output_path):
    """
    智能去除水印：检测并去除深色文字区域
    """
    img = Image.open(input_path)

    if img.mode == 'RGB':
        img = img.convert('RGBA')

    pixels = img.load()
    width, height = img.size

    # 右下角区域（扩展到200x80）
    for y in range(height - 80, height):
        for x in range(width - 200, width):
            if x < 0 or y < 0:
                continue

            r, g, b = pixels[x, y][:3]

            # 检测是否是文字（深色像素）
            brightness = (r + g + b) / 3

            # 如果亮度较低（深色），可能是文字
            if brightness < 200:
                # 完全透明
                pixels[x, y] = (r, g, b, 0)
            elif brightness < 220:
                # 半透明过渡
                alpha = int(255 * (brightness - 200) / 20)
                pixels[x, y] = (r, g, b, alpha)

    img.save(output_path, 'PNG')
    return img.size

def process_directory(input_dir, output_dir):
    """处理目录下所有PNG文件"""
    os.makedirs(output_dir, exist_ok=True)

    files = sorted([f for f in os.listdir(input_dir) if f.endswith('.png')])

    for f in files:
        input_path = os.path.join(input_dir, f)
        output_path = os.path.join(output_dir, f)

        size = remove_watermark_smart(input_path, output_path)
        print(f"✅ {f} ({size[0]}x{size[1]})")

def main():
    base_dir = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim'

    # 处理walk动画
    print("🎬 处理walk动画...")
    walk_input = os.path.join(base_dir, 'zhenbao_walk')
    walk_output = os.path.join(base_dir, 'zhenbao_walk_clean')
    process_directory(walk_input, walk_output)

    # 处理idle动画
    print("\n🎬 处理idle动画...")
    idle_input = os.path.join(base_dir, 'zhenbao_idle')
    idle_output = os.path.join(base_dir, 'zhenbao_idle_clean')
    process_directory(idle_input, idle_output)

    # 替换原文件
    print("\n📦 替换原文件...")
    import shutil

    # 备份
    backup_dir = os.path.join(base_dir, 'zhenbao_backup_watermark')
    os.makedirs(backup_dir, exist_ok=True)
    shutil.copytree(walk_input, os.path.join(backup_dir, 'walk'), dirs_exist_ok=True)
    shutil.copytree(idle_input, os.path.join(backup_dir, 'idle'), dirs_exist_ok=True)

    # 替换
    shutil.rmtree(walk_input)
    shutil.rmtree(idle_input)
    shutil.move(walk_output, walk_input)
    shutil.move(idle_output, idle_input)

    print("✅ 完成！水印已去除")

if __name__ == '__main__':
    main()
