#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
改进版：使用第一帧作为锚点对齐所有帧
确保动画播放时角色不会抖动
"""

from PIL import Image
import os

# 配置
INPUT_BASE = 'subpackages/battle/images/characters_anim/transparent/aimi'
OUTPUT_BASE = 'subpackages/battle/images/characters_anim/transparent/aimi_aligned_v2'

# 需要处理的动画类型
ANIMATIONS = ['idle', 'walk', 'attack', 'support', 'buff', 'skill']

def get_character_bounds(img):
    """获取角色像素的边界框"""
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

def align_to_anchor(img, anchor_bounds, canvas_width, canvas_height):
    """将对齐基准从锚点帧改为当前帧"""
    bounds = get_character_bounds(img)
    if bounds is None:
        return img
    
    anchor_min_x, anchor_min_y, anchor_max_x, anchor_max_y = anchor_bounds
    min_x, min_y, max_x, max_y = bounds
    
    # 计算锚点帧的中心
    anchor_center_x = (anchor_min_x + anchor_max_x) // 2
    anchor_center_y = (anchor_min_y + anchor_max_y) // 2
    
    # 计算当前帧的中心
    current_center_x = (min_x + max_x) // 2
    current_center_y = (min_y + max_y) // 2
    
    # 计算偏移量
    offset_x = anchor_center_x - current_center_x
    offset_y = anchor_center_y - current_center_y
    
    # 创建新画布
    new_img = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
    
    # 粘贴原图（应用偏移）
    new_img.paste(img, (offset_x, offset_y), img)
    
    return new_img

def process_animation(anim_name):
    """处理单个动画序列 - 使用第一帧作为锚点"""
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
    
    # 使用第一帧作为锚点
    anchor_frame = frames[0][1]
    anchor_bounds = get_character_bounds(anchor_frame)
    
    if anchor_bounds is None:
        print(f'  ⚠️  锚点帧没有角色像素')
        return
    
    anchor_center_x = (anchor_bounds[0] + anchor_bounds[2]) // 2
    anchor_center_y = (anchor_bounds[1] + anchor_bounds[3]) // 2
    
    print(f'  锚点帧: {anim_name}_01')
    print(f'  锚点中心: ({anchor_center_x}, {anchor_center_y})')
    
    # 获取最大画布尺寸
    max_width = max(img.size[0] for _, img in frames)
    max_height = max(img.size[1] for _, img in frames)
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    # 对齐每帧到锚点
    for frame_num, img in frames:
        aligned_img = align_to_anchor(img, anchor_bounds, max_width, max_height)
        
        # 验证对齐效果
        new_bounds = get_character_bounds(aligned_img)
        if new_bounds:
            new_center_x = (new_bounds[0] + new_bounds[2]) // 2
            new_center_y = (new_bounds[1] + new_bounds[3]) // 2
            print(f'    ✓ {anim_name}_{str(frame_num).zfill(2)}.png (中心=({new_center_x},{new_center_y}))')
        
        output_path = os.path.join(output_dir, f'{anim_name}_{str(frame_num).zfill(2)}.png')
        aligned_img.save(output_path)
        
        aligned_img.close()
        img.close()
    
    print(f'  ✅ 完成 {len(frames)} 帧')

def main():
    print('=' * 60)
    print('改进版：使用第一帧作为锚点对齐')
    print('=' * 60)
    
    for anim_name in ANIMATIONS:
        process_animation(anim_name)
    
    print('\n' + '=' * 60)
    print(f'✅ 全部完成！')
    print(f'输出目录: {OUTPUT_BASE}')
    print('=' * 60)
    print('\n下一步：检查对齐效果后，将 aimi_aligned_v2 替换到 aimi 目录')

if __name__ == '__main__':
    main()
