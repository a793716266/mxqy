#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
艾米动画帧对齐脚本 - 脚底+左端双重对齐
确保角色在动画中不会飘逸（上下左右抖动）
"""

from PIL import Image
import os

# 配置
INPUT_BASE = 'subpackages/battle/images/characters_anim/transparent/aimi'
OUTPUT_BASE = 'subpackages/battle/images/characters_anim/transparent/aimi_aligned_final'

# 需要处理的动画类型
ANIMATIONS = ['idle', 'walk', 'attack', 'support', 'buff', 'skill']

def get_character_bounds(img):
    """获取角色像素的边界框 (min_x, min_y, max_x, max_y)"""
    datas = list(img.getdata())
    width, height = img.size
    
    min_x, max_x = width, 0
    min_y, max_y = height, 0
    found = False
    
    for y in range(height):
        for x in range(width):
            idx = y * width + x
            if datas[idx][3] > 0:  # 不透明像素
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                found = True
    
    if found:
        return (min_x, min_y, max_x, max_y)
    return None

def align_frame_left_bottom(img, target_left, target_bottom, canvas_width, canvas_height):
    """左端+脚底对齐"""
    bounds = get_character_bounds(img)
    if bounds is None:
        return img
    
    min_x, min_y, max_x, max_y = bounds
    
    # 计算偏移量
    offset_x = target_left - min_x  # 左端对齐
    offset_y = target_bottom - max_y  # 脚底对齐
    
    # 创建新画布
    new_img = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
    
    # 粘贴原图（应用偏移）
    new_img.paste(img, (offset_x, offset_y), img)
    
    return new_img

def process_animation(anim_name):
    """处理单个动画序列 - 使用左端+脚底对齐"""
    input_dir = os.path.join(INPUT_BASE, anim_name)
    output_dir = os.path.join(OUTPUT_BASE, anim_name)
    
    if not os.path.exists(input_dir):
        print(f'⚠️  跳过 {anim_name}（目录不存在）')
        return
    
    print(f'\n处理: {anim_name}')
    
    # 读取所有帧
    frames = []
    for i in range(1, 9):
        frame_path = os.path.join(input_dir, f'{anim_name}_{str(i).zfill(2)}.png')
        if os.path.exists(frame_path):
            img = Image.open(frame_path).convert('RGBA')
            frames.append((i, img))
    
    if not frames:
        print(f'  ⚠️  没有找到帧')
        return
    
    # 分析所有帧的边界
    all_bounds = []
    for frame_num, img in frames:
        bounds = get_character_bounds(img)
        all_bounds.append(bounds)
    
    # 计算目标位置（使用所有帧的最大值）
    # 左端对齐：取所有帧的最小左边界（最左端）
    # 脚底对齐：取所有帧的最大脚底（最低端）
    min_left = min(bounds[0] for bounds in all_bounds if bounds)
    max_bottom = max(bounds[3] for bounds in all_bounds if bounds)
    
    print(f'  目标左端: {min_left}')
    print(f'  目标脚底: {max_bottom}')
    
    # 获取最大画布尺寸
    max_width = max(img.size[0] for _, img in frames)
    max_height = max(img.size[1] for _, img in frames)
    
    # 扩展画布（确保有足够空间）
    canvas_width = max_width + 50
    canvas_height = max_height + 50
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    # 对齐每帧
    for (frame_num, img), bounds in zip(frames, all_bounds):
        if bounds is None:
            print(f'    ⚠️  帧 {frame_num} 没有角色像素')
            continue
        
        aligned_img = align_frame_left_bottom(img, min_left, max_bottom, canvas_width, canvas_height)
        
        # 验证对齐效果
        new_bounds = get_character_bounds(aligned_img)
        if new_bounds:
            new_left = new_bounds[0]
            new_bottom = new_bounds[3]
            print(f'    ✓ {anim_name}_{str(frame_num).zfill(2)}.png (左={new_left}, 底={new_bottom})')
        
        output_path = os.path.join(output_dir, f'{anim_name}_{str(frame_num).zfill(2)}.png')
        aligned_img.save(output_path)
        
        aligned_img.close()
        img.close()
    
    print(f'  ✅ 完成 {len(frames)} 帧')

def main():
    print('=' * 60)
    print('艾米动画帧对齐 - 脚底+左端双重对齐')
    print('=' * 60)
    
    for anim_name in ANIMATIONS:
        process_animation(anim_name)
    
    print('\n' + '=' * 60)
    print(f'✅ 全部完成！')
    print(f'输出目录: {OUTPUT_BASE}')
    print('=' * 60)
    print('\n下一步：检查对齐效果后，将 aimi_aligned_final 替换到 aimi 目录')

if __name__ == '__main__':
    main()
