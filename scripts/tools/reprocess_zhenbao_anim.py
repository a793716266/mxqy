#!/usr/bin/env python3
"""
重新处理臻宝动画帧 - 保留剑的完整性
问题：之前处理过度，导致剑变成半透明
解决：更精确的背景识别和保留剑像素
"""

from PIL import Image
import os

def process_frame_precise(input_path, output_path):
    """
    精确处理单帧 - 只去除纯白背景，保留剑的金属质感
    """
    img = Image.open(input_path)
    
    # 转换为RGBA
    if img.mode == 'RGB':
        img = img.convert('RGBA')
    
    pixels = img.load()
    width, height = img.size
    
    # 统计背景颜色
    bg_color = None
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y][:3]
            # 检查纯白色背景
            if r >= 254 and g >= 254 and b >= 254:
                # 纯白背景 -> 完全透明
                pixels[x, y] = (255, 255, 255, 0)
            # 检查接近白色的背景（可能有轻微噪点）
            elif r >= 250 and g >= 250 and b >= 248:
                # 接近白色 -> 完全透明
                pixels[x, y] = (r, g, b, 0)
    
    # 保存
    img.save(output_path, 'PNG')
    return img.size

def main():
    # 原始帧目录
    input_dir = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim/zhenbao_walk_frames'
    
    # 输出目录
    output_walk_dir = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim/zhenbao_walk_new'
    output_idle_dir = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/images/characters_anim/zhenbao_idle_new'
    
    os.makedirs(output_walk_dir, exist_ok=True)
    os.makedirs(output_idle_dir, exist_ok=True)
    
    # 获取所有帧
    frames = sorted([f for f in os.listdir(input_dir) if f.endswith('.png')])
    print(f'找到 {len(frames)} 帧')
    
    # 处理walk帧（从121帧中均匀选取34帧）
    walk_indices = [int(i * len(frames) / 34) for i in range(34)]
    print(f'处理walk动画：{len(walk_indices)} 帧')
    
    for i, frame_idx in enumerate(walk_indices):
        input_path = os.path.join(input_dir, frames[frame_idx])
        output_path = os.path.join(output_walk_dir, f'walk_{(i+1):02d}.png')
        size = process_frame_precise(input_path, output_path)
        if i == 0:
            print(f'  示例：{frames[frame_idx]} -> walk_{(i+1):02d}.png, 尺寸: {size}')
    
    # 处理idle帧（从walk中选择静态姿势）
    idle_indices = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36][:10]  # 10帧idle
    print(f'处理idle动画：{len(idle_indices)} 帧')
    
    for i, frame_idx in enumerate(idle_indices):
        if frame_idx < len(frames):
            input_path = os.path.join(input_dir, frames[frame_idx])
            output_path = os.path.join(output_idle_dir, f'idle_{(i+1):02d}.png')
            size = process_frame_precise(input_path, output_path)
            if i == 0:
                print(f'  示例：{frames[frame_idx]} -> idle_{(i+1):02d}.png, 尺寸: {size}')
    
    print('✅ 处理完成！')
    print(f'walk动画：{output_walk_dir}')
    print(f'idle动画：{output_idle_dir}')

if __name__ == '__main__':
    main()
