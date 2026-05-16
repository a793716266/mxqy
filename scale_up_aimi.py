#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
放大艾米所有动画帧的角色尺寸
让角色填满更多画布空间（从65% → 80%），使游戏中显示更大
"""

from PIL import Image
import os

def scale_up_character(input_dir, output_dir=None, target_ratio=0.8):
    """
    放大角色，使其填满画布的指定比例
    
    Args:
        input_dir: 输入目录
        output_dir: 输出目录（如果为None，则覆盖原文件）
        target_ratio: 目标角色占画布比例（默认0.8 = 80%）
    """
    canvas_width = 350
    canvas_height = 500
    foot_y = 470  # 脚底对齐位置
    
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # 获取所有帧文件
    frames = sorted([f for f in os.listdir(input_dir) 
                    if f.endswith('.png') and f != '.DS_Store'])
    
    if not frames:
        print(f'  ⚠️  目录中没有PNG文件: {input_dir}')
        return
    
    print(f'  📊 分析 {len(frames)} 帧...')
    
    # 获取当前角色尺寸（使用第一帧作为参考）
    sample_img = Image.open(os.path.join(input_dir, frames[0]))
    bbox = sample_img.getbbox()
    if not bbox:
        print(f'  ❌ 无法获取内容边界')
        return
    
    current_height = bbox[3] - bbox[1]
    target_height = int(canvas_height * target_ratio)
    scale = target_height / current_height
    
    print(f'    当前角色高度: {current_height}px ({current_height/canvas_height*100:.1f}%)')
    print(f'    目标角色高度: {target_height}px ({target_ratio*100:.1f}%)')
    print(f'    缩放比例: {scale:.2f}x')
    
    # 处理每一帧
    for frame in frames:
        img_path = os.path.join(input_dir, frame)
        img = Image.open(img_path).convert('RGBA')
        
        # 获取内容边界
        bbox = img.getbbox()
        if not bbox:
            continue
        
        # 提取角色区域
        character = img.crop(bbox)
        
        # 计算新尺寸
        current_w = bbox[2] - bbox[0]
        current_h = bbox[3] - bbox[1]
        new_w = int(current_w * scale)
        new_h = int(current_h * scale)
        
        # 缩放角色
        character_scaled = character.resize((new_w, new_h), Image.LANCZOS)
        
        # 创建新画布
        new_img = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
        
        # 计算位置：水平居中，脚底对齐到 foot_y
        x_pos = (canvas_width - new_w) // 2
        y_pos = foot_y - new_h
        
        # 粘贴角色
        new_img.paste(character_scaled, (x_pos, y_pos), character_scaled)
        
        # 保存
        if output_dir:
            output_path = os.path.join(output_dir, frame)
        else:
            output_path = os.path.join(input_dir, frame)
        
        new_img.save(output_path, 'PNG')
    
    print(f'  ✅ 完成！角色已放大到 {target_height}px 高度')

def main():
    aimi_dir = 'subpackages/battle/images/characters_anim/transparent/aimi'
    
    print('🎨 放大艾米所有动画帧的角色尺寸')
    print('=' * 60)
    print('目标：让角色填满画布的 80%（从当前的 65% 提升）')
    print('效果：游戏中角色会显示更大（约 1.23倍）')
    print('=' * 60)
    
    # 备份原文件
    backup_dir = os.path.join(aimi_dir, '../aimi_backup_before_scale_up')
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
        import shutil
        print(f'\n📦 备份原始帧...')
        for anim_type in os.listdir(aimi_dir):
            src = os.path.join(aimi_dir, anim_type)
            dst = os.path.join(backup_dir, anim_type)
            if os.path.isdir(src):
                shutil.copytree(src, dst)
        print(f'  ✅ 已备份到 {backup_dir}')
    
    # 处理所有动画状态
    anim_types = ['idle', 'walk', 'attack', 'skill', 'buff', 'support', 'hurt', 'defeat']
    
    for anim_type in anim_types:
        anim_dir = os.path.join(aimi_dir, anim_type)
        if not os.path.exists(anim_dir):
            continue
        
        print(f'\n🔧 处理 {anim_type} 动画...')
        scale_up_character(anim_dir, output_dir=None, target_ratio=0.8)
    
    print('\n' + '=' * 60)
    print('🎉 所有动画帧已放大完成！')
    print('💡 现在角色应该显示更大了（约1.23倍）')
    print('=' * 60)

if __name__ == '__main__':
    main()
