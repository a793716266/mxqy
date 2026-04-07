#!/usr/bin/env python3
"""
处理臻宝新动画 - 去背景 + 去除右下角文字
idle: frame_0001-0010 (10帧)
walk: frame_0020-0038 (19帧)
"""

from PIL import Image
import os

def remove_background_and_text(input_path, output_path):
    """
    去除背景和右下角文字
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

    print(f"  背景色: RGB({bg_r}, {bg_g}, {bg_b})")

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

    # 去除右下角文字区域（假设右下角100x50像素）
    text_area_width = 150
    text_area_height = 60
    for y in range(height - text_area_height, height):
        for x in range(width - text_area_width, width):
            # 检查是否是文字区域（通常比背景深）
            r, g, b = pixels[x, y][:3]
            brightness = (r + g + b) / 3

            # 如果不是背景色，就透明化
            diff = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)
            if diff > 20:
                pixels[x, y] = (r, g, b, 0)

    # 保存
    img.save(output_path, 'PNG')
    return img.size

def main():
    base_dir = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim'

    # 输入目录
    input_dir = os.path.join(base_dir, 'zhenbao_extracted')

    # 输出目录
    output_idle_dir = os.path.join(base_dir, 'zhenbao_idle')
    output_walk_dir = os.path.join(base_dir, 'zhenbao_walk')

    # 备份旧文件
    print("📦 备份旧动画...")
    backup_dir = os.path.join(base_dir, 'zhenbao_backup_old')
    os.makedirs(backup_dir, exist_ok=True)

    # 备份现有动画
    import shutil
    if os.path.exists(output_idle_dir):
        shutil.copytree(output_idle_dir, os.path.join(backup_dir, 'idle_old'), dirs_exist_ok=True)
    if os.path.exists(output_walk_dir):
        shutil.copytree(output_walk_dir, os.path.join(backup_dir, 'walk_old'), dirs_exist_ok=True)

    # 清空输出目录
    os.makedirs(output_idle_dir, exist_ok=True)
    os.makedirs(output_walk_dir, exist_ok=True)

    # 清空旧文件
    for f in os.listdir(output_idle_dir):
        os.remove(os.path.join(output_idle_dir, f))
    for f in os.listdir(output_walk_dir):
        os.remove(os.path.join(output_walk_dir, f))

    # 处理idle帧 (0001-0010)
    print("\n🎬 处理idle动画 (10帧)...")
    for i in range(1, 11):
        input_file = f'frame_{i:04d}.png'
        output_file = f'idle_{i:02d}.png'

        input_path = os.path.join(input_dir, input_file)
        output_path = os.path.join(output_idle_dir, output_file)

        if os.path.exists(input_path):
            size = remove_background_and_text(input_path, output_path)
            print(f"  ✅ {input_file} -> {output_file} ({size[0]}x{size[1]})")
        else:
            print(f"  ❌ 文件不存在: {input_file}")

    # 处理walk帧 (0020-0038)
    print("\n🎬 处理walk动画 (19帧)...")
    walk_count = 0
    for i in range(20, 39):
        input_file = f'frame_{i:04d}.png'
        walk_count += 1
        output_file = f'walk_{walk_count:02d}.png'

        input_path = os.path.join(input_dir, input_file)
        output_path = os.path.join(output_walk_dir, output_file)

        if os.path.exists(input_path):
            size = remove_background_and_text(input_path, output_path)
            print(f"  ✅ {input_file} -> {output_file} ({size[0]}x{size[1]})")
        else:
            print(f"  ❌ 文件不存在: {input_file}")

    # 更新头像
    print("\n🖼️  更新头像...")
    avatar_src = os.path.join(output_idle_dir, 'idle_01.png')
    avatar_dst = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters/hero_zhenbao.png'
    shutil.copy(avatar_src, avatar_dst)
    print(f"  ✅ 头像已更新: {avatar_dst}")

    # 清理临时文件
    print("\n🗑️  清理临时文件...")
    shutil.rmtree(input_dir)
    print("  ✅ 已删除: zhenbao_extracted/")

    print("\n✅ 全部完成！")
    print(f"  idle动画: {output_idle_dir} (10帧)")
    print(f"  walk动画: {output_walk_dir} (19帧)")

if __name__ == '__main__':
    main()
