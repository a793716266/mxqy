#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
重新切割精灵图 - 改进版
1. 使用更大的画布（避免截断）
2. 使用脚底对齐（适合有跳跃的动画）
3. 保留角色的所有动作幅度
"""

from PIL import Image
import os

# 路径配置
PICTURES_DIR = '/Users/jacob/Pictures'
OUTPUT_BASE = 'subpackages/battle/images/characters_anim/transparent/aimi_final'

# 精灵图配置：(文件名, 目标目录, 帧数)
SPRITE_CONFIG = [
    ('艾米待机动画.png', 'idle', 8),
    ('艾米移动动画.png', 'walk', 8),
    ('艾米普通攻击.png', 'attack', 8),
    ('艾米治愈之拳动画.png', 'support', 8),
    ('艾米BUFF动画.png', 'buff', 8),
    ('艾米治愈技能.png', 'skill', 8),
]

def remove_background(img, tolerance=30):
    """去背景（保留角色细节）"""
    datas = list(img.getdata())
    newData = []
    
    # 使用左上角作为背景色
    bg_r, bg_g, bg_b = datas[0][0], datas[0][1], datas[0][2]
    
    for item in datas:
        r, g, b, a = item
        diff = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)
        
        if diff < tolerance:
            newData.append((255, 255, 255, 0))
        else:
            newData.append((r, g, b, a))
    
    img.putdata(newData)
    return img

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
            if datas[idx][3] > 0:
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                found = True
    
    if found:
        return (min_x, min_y, max_x, max_y)
    return None

def split_and_align_sprite(image_path, output_dir, frame_count, align_mode='bottom'):
    """切割精灵图并对齐"""
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    
    # 计算每帧宽度
    frame_width = width // frame_count
    
    print(f'  图片尺寸: {width}x{height}, 帧数: {frame_count}, 每帧宽度: {frame_width}')
    
    # 切割所有帧
    frames = []
    for i in range(frame_count):
        left = i * frame_width
        right = left + frame_width
        
        frame = img.crop((left, 0, right, height))
        frames.append(frame)
    
    # 去背景
    frames = [remove_background(frame) for frame in frames]
    
    # 分析所有帧的边界
    all_bounds = []
    for frame in frames:
        bounds = get_character_bounds(frame)
        all_bounds.append(bounds)
    
    # 计算统一画布尺寸（足够大以容纳所有帧）
    max_frame_width = max(frame.size[0] for frame in frames)
    max_frame_height = max(frame.size[1] for frame in frames)
    
    if align_mode == 'bottom':
        # 脚底对齐：找到最大的Y底部
        max_bottom = max(bounds[3] for bounds in all_bounds if bounds)
        # 画布高度需要足够大
        canvas_height = max(max_frame_height, max_bottom + 20)
        canvas_width = max_frame_width + 20
        
        # 对齐锚点（使用第一帧的脚底位置）
        anchor_bounds = all_bounds[0]
        if anchor_bounds:
            anchor_bottom = anchor_bounds[3]
            
            # 创建对齐后的帧
            aligned_frames = []
            for i, frame in enumerate(frames):
                bounds = all_bounds[i]
                if bounds is None:
                    aligned_frames.append(frame)
                    continue
                
                # 计算脚底偏移
                offset_y = anchor_bottom - bounds[3]
                offset_x = (anchor_bounds[2] + anchor_bounds[0]) // 2 - (bounds[2] + bounds[0]) // 2
                
                # 创建新画布
                new_frame = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
                new_frame.paste(frame, (offset_x + (canvas_width - frame.size[0]) // 2, offset_y), frame)
                aligned_frames.append(new_frame)
            
            frames = aligned_frames
    
    # 保存
    os.makedirs(output_dir, exist_ok=True)
    for i, frame in enumerate(frames):
        frame_num = str(i + 1).zfill(2)
        output_path = os.path.join(output_dir, f'{os.path.basename(output_dir)}_{frame_num}.png')
        frame.save(output_path)
        print(f'    ✓ {os.path.basename(output_dir)}_{frame_num}.png')
    
    img.close()
    return frame_count

def main():
    print('=' * 60)
    print('重新切割精灵图（改进版）')
    print('=' * 60)
    
    total_frames = 0
    
    for filename, dirname, frame_count in SPRITE_CONFIG:
        image_path = os.path.join(PICTURES_DIR, filename)
        output_dir = os.path.join(OUTPUT_BASE, dirname)
        
        if not os.path.exists(image_path):
            print(f'\n⚠️  跳过 {filename}（文件不存在）')
            continue
        
        print(f'\n处理: {filename}')
        print(f'  输出到: {output_dir}')
        
        try:
            # 根据动画类型选择对齐模式
            align_mode = 'bottom' if dirname in ['buff', 'skill', 'support'] else 'center'
            
            frames = split_and_align_sprite(image_path, output_dir, frame_count, align_mode)
            total_frames += frames
            print(f'  ✅ 完成 {frames} 帧')
        except Exception as e:
            print(f'  ❌ 错误: {e}')
            import traceback
            traceback.print_exc()
    
    print('\n' + '=' * 60)
    print(f'✅ 全部完成！共处理 {total_frames} 帧')
    print(f'输出目录: {OUTPUT_BASE}')
    print('=' * 60)
    print('\n请检查对齐效果，满意后替换到 aimi 目录')

if __name__ == '__main__':
    main()
