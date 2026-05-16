#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 Pictures 目录的原始精灵图切割并去背景
保留原始图片，不会覆盖
"""

from PIL import Image
import os

# 路径配置
PICTURES_DIR = '/Users/jacob/Pictures'
OUTPUT_BASE = 'subpackages/battle/images/characters_anim/transparent/aimi'

# 精灵图配置：(文件名, 目标目录, 帧数, 是否需要去背景)
SPRITE_CONFIG = [
    ('艾米待机动画.png', 'idle', 8, True),
    ('艾米移动动画.png', 'walk', 8, True),
    ('艾米普通攻击.png', 'attack', 8, True),
    ('艾米治愈之拳动画.png', 'support', 8, True),
    ('艾米BUFF动画.png', 'buff', 8, True),
    ('艾米治愈技能.png', 'skill', 8, True),
]

def split_sprite_sheet(image_path, output_dir, frame_count, do_remove_bg=True):
    """切割精灵图并可选去背景"""
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    
    # 计算每帧宽度
    frame_width = width // frame_count
    
    print(f'  图片尺寸: {width}x{height}, 帧数: {frame_count}, 每帧宽度: {frame_width}')
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    for i in range(frame_count):
        # 计算当前帧的区域
        left = i * frame_width
        right = left + frame_width
        
        # 切割
        frame = img.crop((left, 0, right, height))
        
        # 可选：去背景
        if do_remove_bg:
            frame = remove_background_preserve_details(frame)
        
        # 保存
        frame_num = str(i + 1).zfill(2)
        anim_name = os.path.basename(output_dir)
        output_path = os.path.join(output_dir, f'{anim_name}_{frame_num}.png')
        frame.save(output_path)
        print(f'    ✓ {anim_name}_{frame_num}.png')
    
    img.close()
    return frame_count

def remove_background_preserve_details(img):
    """去背景但保留角色细节"""
    datas = list(img.getdata())
    newData = []
    
    # 分析背景色（假设四角像素是背景）
    width, height = img.size
    corners = [
        datas[0],  # 左上
        datas[width - 1],  # 右上
        datas[width * (height - 1)],  # 左下
        datas[width * height - 1]  # 右下
    ]
    
    # 使用左上角作为背景色
    bg_r, bg_g, bg_b = corners[0][0], corners[0][1], corners[0][2]
    
    # 计算容差（适应光照变化）
    tolerance = 30
    
    for item in datas:
        r, g, b, a = item
        
        # 计算与背景色的差异
        diff = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)
        
        if diff < tolerance:
            # 接近背景色 → 透明
            newData.append((255, 255, 255, 0))
        else:
            # 角色像素 → 保留
            newData.append((r, g, b, a))
    
    img.putdata(newData)
    return img

def main():
    print('=' * 60)
    print('从 Pictures 目录处理艾米动画资源')
    print('=' * 60)
    
    total_frames = 0
    
    for filename, dirname, frame_count, do_remove_bg in SPRITE_CONFIG:
        image_path = os.path.join(PICTURES_DIR, filename)
        output_dir = os.path.join(OUTPUT_BASE, dirname)
        
        if not os.path.exists(image_path):
            print(f'\n⚠️  跳过 {filename}（文件不存在）')
            continue
        
        print(f'\n处理: {filename}')
        print(f'  输出到: {output_dir}')
        
        try:
            frames = split_sprite_sheet(image_path, output_dir, frame_count, do_remove_bg)
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

if __name__ == '__main__':
    main()
