#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一艾米 idle 帧的角色尺寸（宽度 + 高度）
确保角色在所有帧中保持一致的尺寸，消除"大小闪烁"感
"""

from PIL import Image
import os

def unify_character_size(input_dir, output_dir=None, target_size=None):
    """
    统一角色在所有帧中的尺寸（宽度和高度）
    
    Args:
        input_dir: 输入目录（如 aimi/idle）
        output_dir: 输出目录（如果为None，则覆盖原文件）
        target_size: 目标角色尺寸 (width, height)，如果为None则自动计算
    """
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # 获取所有帧文件
    frames = sorted([f for f in os.listdir(input_dir) 
                    if f.endswith('.png') and f != '.DS_Store'])
    
    print(f'📊 分析 {len(frames)} 帧的角色尺寸...')
    
    # 第一步：分析所有帧的角色尺寸
    frame_data = []
    for frame in frames:
        img_path = os.path.join(input_dir, frame)
        img = Image.open(img_path)
        
        # 获取透明图的内容边界
        bbox = img.getbbox()
        if bbox:
            content_width = bbox[2] - bbox[0]
            content_height = bbox[3] - bbox[1]
            frame_data.append({
                'file': frame,
                'img': img,
                'bbox': bbox,
                'width': content_width,
                'height': content_height
            })
            print(f'  {frame}: 角色尺寸={content_width}x{content_height}px')
    
    if not frame_data:
        print('❌ 没有找到有效的帧')
        return
    
    # 计算目标尺寸（使用中位数，避免极端值影响）
    widths = sorted([d['width'] for d in frame_data])
    heights = sorted([d['height'] for d in frame_data])
    
    median_width = widths[len(widths) // 2]
    median_height = heights[len(heights) // 2]
    
    if target_size is None:
        target_size = (median_width, median_height)
    
    target_width, target_height = target_size
    
    print(f'\n📏 尺寸统计:')
    print(f'  宽度: 最小={min(widths)}px, 最大={max(widths)}px, 中位数={median_width}px')
    print(f'  高度: 最小={min(heights)}px, 最大={max(heights)}px, 中位数={median_height}px')
    print(f'  目标尺寸: {target_width}x{target_height}px')
    
    # 第二步：统一每帧的角色尺寸
    print(f'\n🔧 开始统一角色尺寸...')
    
    canvas_width = 350
    canvas_height = 500
    foot_y = 470  # 脚底对齐位置
    
    for data in frame_data:
        frame = data['file']
        img = data['img']
        bbox = data['bbox']
        current_width = data['width']
        current_height = data['height']
        
        # 提取角色区域
        character = img.crop(bbox)
        
        # 缩放到目标尺寸
        target_size_with_aspect = (target_width, target_height)
        character_resized = character.resize(target_size_with_aspect, Image.LANCZOS)
        
        # 创建新画布
        new_img = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
        
        # 计算位置：水平居中，脚底对齐到 foot_y
        x_pos = (canvas_width - target_width) // 2
        y_pos = foot_y - target_height
        
        # 粘贴角色
        new_img.paste(character_resized, (x_pos, y_pos), character_resized)
        
        # 保存
        if output_dir:
            output_path = os.path.join(output_dir, frame)
        else:
            output_path = os.path.join(input_dir, frame)
        
        new_img.save(output_path, 'PNG')
        print(f'  ✅ {frame}: {current_width}x{current_height} → {target_width}x{target_height}')
    
    print(f'\n✅ 完成！所有帧已统一到 {target_width}x{target_height}px')

def main():
    # 处理 idle 帧
    idle_dir = 'subpackages/battle/images/characters_anim/transparent/aimi/idle'
    backup_dir = 'subpackages/battle/images/characters_anim/transparent/aimi/idle_backup_v2'
    
    print('🎨 统一艾米 idle 帧的角色尺寸（宽度 + 高度）')
    print('=' * 60)
    
    # 先备份（如果还没有备份）
    print('\n📦 备份原始帧...')
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
    
    import shutil
    for f in os.listdir(idle_dir):
        if f.endswith('.png'):
            shutil.copy2(os.path.join(idle_dir, f), os.path.join(backup_dir, f))
    print(f'  ✅ 已备份到 {backup_dir}')
    
    # 统一尺寸（使用中位数尺寸）
    unify_character_size(idle_dir, output_dir=None, target_size=None)
    
    print('\n' + '=' * 60)
    print('🎉 处理完成！')

if __name__ == '__main__':
    main()
