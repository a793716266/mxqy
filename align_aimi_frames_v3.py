#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
灵活对齐脚本 - 支持多种对齐模式
1. center - 中心对齐（适合idle、walk等稳定动画）
2. bottom - 脚底对齐（适合有跳跃的动画）
3. manual - 手动指定锚点帧
"""

from PIL import Image
import os
import json

# 配置
INPUT_BASE = 'subpackages/battle/images/characters_anim/transparent/aimi'
OUTPUT_BASE = 'subpackages/battle/images/characters_anim/transparent/aimi_aligned_v3'

# 对齐模式配置：每个动画使用哪种对齐方式
# - 'center': 中心对齐（默认）
# - 'bottom': 脚底对齐（Y轴底部对齐，适合有跳跃的动画）
# - 'manual': 手动指定锚点帧（需要提供 anchor_frame 参数）
ALIGNMENT_CONFIG = {
    'idle': {'mode': 'center'},
    'walk': {'mode': 'center'},
    'attack': {'mode': 'center'},
    'support': {'mode': 'center'},
    'buff': {'mode': 'bottom'},  # buff动画有上下移动，使用脚底对齐
    'skill': {'mode': 'bottom'},  # skill动画有上下移动，使用脚底对齐
}

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

def align_frame(img, anchor_bounds, mode='center', canvas_width=None, canvas_height=None):
    """对齐单帧到锚点帧"""
    bounds = get_character_bounds(img)
    if bounds is None:
        return img
    
    if canvas_width is None:
        canvas_width = max(img.size[0], anchor_bounds[2] + 10)
    if canvas_height is None:
        canvas_height = max(img.size[1], anchor_bounds[3] + 10)
    
    anchor_min_x, anchor_min_y, anchor_max_x, anchor_max_y = anchor_bounds
    min_x, min_y, max_x, max_y = bounds
    
    if mode == 'center':
        # 中心对齐
        anchor_cx = (anchor_min_x + anchor_max_x) // 2
        anchor_cy = (anchor_min_y + anchor_max_y) // 2
        current_cx = (min_x + max_x) // 2
        current_cy = (min_y + max_y) // 2
        
        offset_x = anchor_cx - current_cx
        offset_y = anchor_cy - current_cy
    
    elif mode == 'bottom':
        # 脚底对齐（Y轴底部对齐，X轴中心对齐）
        anchor_cx = (anchor_min_x + anchor_max_x) // 2
        anchor_bottom_y = anchor_max_y
        
        current_cx = (min_x + max_x) // 2
        current_bottom_y = max_y
        
        offset_x = anchor_cx - current_cx
        offset_y = anchor_bottom_y - current_bottom_y
    
    else:
        # 默认中心对齐
        anchor_cx = (anchor_min_x + anchor_max_x) // 2
        anchor_cy = (anchor_min_y + anchor_max_y) // 2
        current_cx = (min_x + max_x) // 2
        current_cy = (min_y + max_y) // 2
        
        offset_x = anchor_cx - current_cx
        offset_y = anchor_cy - current_cy
    
    # 创建新画布
    new_img = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
    
    # 粘贴原图（应用偏移）
    new_img.paste(img, (offset_x, offset_y), img)
    
    return new_img

def process_animation(anim_name, config):
    """处理单个动画序列"""
    input_dir = os.path.join(INPUT_BASE, anim_name)
    output_dir = os.path.join(OUTPUT_BASE, anim_name)
    
    if not os.path.exists(input_dir):
        print(f'⚠️  跳过 {anim_name}（目录不存在）')
        return
    
    mode = config.get('mode', 'center')
    anchor_frame_num = config.get('anchor_frame', 1)  # 默认使用第1帧作为锚点
    
    print(f'\n处理: {anim_name} (模式: {mode})')
    
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
    
    # 找到锚点帧
    anchor_img = None
    for frame_num, img in frames:
        if frame_num == anchor_frame_num:
            anchor_img = img
            break
    
    if anchor_img is None:
        # 如果找不到指定的锚点帧，使用第一帧
        anchor_img = frames[0][1]
        print(f'  ⚠️  找不到锚点帧 {anchor_frame_num}，使用第1帧')
    
    anchor_bounds = get_character_bounds(anchor_img)
    if anchor_bounds is None:
        print(f'  ⚠️  锚点帧没有角色像素')
        return
    
    # 计算锚点信息（用于显示）
    anchor_cx = (anchor_bounds[0] + anchor_bounds[2]) // 2
    anchor_cy = (anchor_bounds[1] + anchor_bounds[3]) // 2
    print(f'  锚点帧: {anim_name}_{str(anchor_frame_num).zfill(2)}')
    print(f'  锚点中心: ({anchor_cx}, {anchor_cy})')
    
    # 获取最大画布尺寸
    max_width = max(img.size[0] for _, img in frames)
    max_height = max(img.size[1] for _, img in frames)
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    # 对齐每帧
    for frame_num, img in frames:
        aligned_img = align_frame(img, anchor_bounds, mode, max_width, max_height)
        
        # 验证对齐效果
        new_bounds = get_character_bounds(aligned_img)
        if new_bounds:
            new_cx = (new_bounds[0] + new_bounds[2]) // 2
            new_cy = (new_bounds[1] + new_bounds[3]) // 2
            print(f'    ✓ {anim_name}_{str(frame_num).zfill(2)}.png (中心=({new_cx},{new_cy}))')
        
        output_path = os.path.join(output_dir, f'{anim_name}_{str(frame_num).zfill(2)}.png')
        aligned_img.save(output_path)
        
        aligned_img.close()
        img.close()
    
    print(f'  ✅ 完成 {len(frames)} 帧')

def main():
    print('=' * 60)
    print('灵活对齐脚本 - 支持多种对齐模式')
    print('=' * 60)
    
    for anim_name, config in ALIGNMENT_CONFIG.items():
        process_animation(anim_name, config)
    
    print('\n' + '=' * 60)
    print(f'✅ 全部完成！')
    print(f'输出目录: {OUTPUT_BASE}')
    print('=' * 60)
    print('\n下一步：检查对齐效果后，将 aimi_aligned_v3 替换到 aimi 目录')

if __name__ == '__main__':
    main()
