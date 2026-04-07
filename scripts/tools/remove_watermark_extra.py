#!/usr/bin/env python3
"""
超激进去除水印 - 扩大裁剪区域到200x100
"""

from PIL import Image
import os

def remove_watermark_crop(input_path, output_path, crop_width=200, crop_height=100):
    """
    直接裁剪右下角区域
    """
    img = Image.open(input_path)
    width, height = img.size

    if img.mode == 'RGB':
        img = img.convert('RGBA')

    pixels = img.load()

    # 直接将右下角区域设为完全透明
    for y in range(max(0, height - crop_height), height):
        for x in range(max(0, width - crop_width), width):
            pixels[x, y] = (0, 0, 0, 0)  # 完全透明

    img.save(output_path, 'PNG')
    return width, height

def process_all():
    base_dir = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim'

    # 处理walk
    print("🎬 处理walk动画（裁剪右下角200x100）...")
    walk_dir = os.path.join(base_dir, 'zhenbao_walk')
    for f in sorted(os.listdir(walk_dir)):
        if f.endswith('.png'):
            input_path = os.path.join(walk_dir, f)
            w, h = remove_watermark_crop(input_path, input_path)
            print(f"  ✅ {f}")

    # 处理idle
    print("\n🎬 处理idle动画（裁剪右下角200x100）...")
    idle_dir = os.path.join(base_dir, 'zhenbao_idle')
    for f in sorted(os.listdir(idle_dir)):
        if f.endswith('.png'):
            input_path = os.path.join(idle_dir, f)
            w, h = remove_watermark_crop(input_path, input_path)
            print(f"  ✅ {f}")

    # 更新头像
    print("\n🖼️  更新头像...")
    avatar_src = os.path.join(idle_dir, 'idle_01.png')
    avatar_dst = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters/hero_zhenbao.png'
    import shutil
    shutil.copy(avatar_src, avatar_dst)
    print("  ✅ 头像已更新")

    print("\n✅ 完成！右下角水印已彻底去除")

if __name__ == '__main__':
    process_all()
