#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一艾米动画帧的角色中心位置
确保每帧中角色的中心点一致，避免动画抖动
"""

from PIL import Image
import os

# 配置
INPUT_BASE = 'subpackages/battle/images/characters_anim/transparent/aimi'
OUTPUT_BASE = 'subpackages/battle/images/characters_anim/transparent/aimi_aligned'

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

def normalize_frame(img, target_center_x, target_center_y, canvas_width, canvas_height):
    """将角色中心对齐到目标位置"""
    bounds = get_character_bounds(img)
    if bounds is None:
        return img
    
    min_x, min_y, max_x, max_y = bounds
    char_center_x = (min_x + max_x) // 2
    char_center_y = (min_y + max_y) // 2
    
    # 计算偏移量
    offset_x = target_center_x - char_center_x
    offset_y = target_center_y - char_center_y
    
    # 创建新画布
    new_img = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
    
    # 粘贴原图（应用偏移）
    new_img.paste(img, (offset_x, offset_y), img)
    
    return new_img

def process_animation(anim_name):
    """处理单个动画序列"""
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
    
    # 分析所有帧的角色中心
    centers_x = []
    centers_y = []
    max_width = 0
    max_height = 0
    
    for frame_num, img in frames:
        bounds = get_character_bounds(img)
        if bounds:
            min_x, min_y, max_x, max_y = bounds
            center_x = (min_x + max_x) // 2
            center_y = (min_y + max_y) // 2
            centers_x.append(center_x)
            centers_y.append(center_y)
        
        # 记录最大尺寸
        max_width = max(max_width, img.size[0])
        max_height = max(max_height, img.size[1])
    
    # 计算目标中心（使用平均值）
    if centers_x:
        target_center_x = sum(centers_x) // len(centers_x)
        target_center_y = sum(centers_y) // len(centers_y)
    else:
        target_center_x = max_width // 2
        target_center_y = max_height // 2
    
    print(f'  目标中心: ({target_center_x}, {target_center_y})')
    print(f'  X中心范围: {min(centers_x)}-{max(centers_x)} (偏差{ max(centers_x)-min(centers_x)}px)')
    print(f'  Y中心范围: {min(centers_y)}-{max(centers_y)} (偏差{max(centers_y)-min(centers_y)}px)')
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    # 重新对齐每帧
    for frame_num, img in frames:
        aligned_img = normalize_frame(img, target_center_x, target_center_y, max_width, max_height)
        
        output_path = os.path.join(output_dir, f'{anim_name}_{str(frame_num).zfill(2)}.png')
        aligned_img.save(output_path)
        print(f'    ✓ {anim_name}_{str(frame_num).zfill(2)}.png')
        
        img.close()
        aligned_img.close()
    
    print(f'  ✅ 完成 {len(frames)} 帧')

def main():
    print('=' * 60)
    print('统一艾米动画帧的角色中心')
    print('=' * 60)
    
    for anim_name in ANIMATIONS:
        process_animation(anim_name)
    
    print('\n' + '=' * 60)
    print(f'✅ 全部完成！')
    print(f'输出目录: {OUTPUT_BASE}')
    print('=' * 60)
    print('\n下一步：检查对齐效果后，将 aimi_aligned 重命名为 aimi')

if __name__ == '__main__':
    main()
