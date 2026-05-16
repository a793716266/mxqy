#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
创建艾米动画GIF预览
每个动画生成一个GIF，方便检查对齐效果
"""

from PIL import Image, ImageDraw, ImageFont
import os

# 配置
INPUT_BASE = 'subpackages/battle/images/characters_anim/transparent/aimi_final'
OUTPUT_DIR = 'subpackages/battle/images/characters_anim/transparent/aimi_preview'

# 需要预览的动画
ANIMATIONS = ['idle', 'walk', 'attack', 'support', 'buff', 'skill']

def add_frame_number(img, frame_num):
    """在图片左上角添加帧编号"""
    # 创建可绘制的副本
    draw_img = img.copy()
    draw = ImageDraw.Draw(draw_img)
    
    # 帧编号文字
    text = str(frame_num)
    
    # 尝试使用系统字体
    try:
        # macOS系统字体
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 30)
    except:
        font = ImageFont.load_default()
    
    # 绘制文字（白色带黑边）
    x, y = 5, 5
    
    # 黑边（绘制4次偏移文字）
    draw.text((x-1, y), text, fill='black', font=font)
    draw.text((x+1, y), text, fill='black', font=font)
    draw.text((x, y-1), text, fill='black', font=font)
    draw.text((x, y+1), text, fill='black', font=font)
    
    # 白色文字
    draw.text((x, y), text, fill='white', font=font)
    
    return draw_img

def create_animation_gif(anim_name, duration=200):
    """创建单个动画的GIF"""
    input_dir = os.path.join(INPUT_BASE, anim_name)
    
    if not os.path.exists(input_dir):
        print(f'⚠️  跳过 {anim_name}（目录不存在）')
        return False
    
    print(f'\n处理: {anim_name}')
    
    # 读取所有帧
    frames = []
    for i in range(1, 9):
        frame_path = os.path.join(input_dir, f'{anim_name}_{str(i).zfill(2)}.png')
        if os.path.exists(frame_path):
            img = Image.open(frame_path).convert('RGBA')
            
            # 添加帧编号
            img_with_number = add_frame_number(img, i)
            
            # 转换为RGB（GIF不支持RGBA）
            rgb_img = Image.new('RGB', img_with_number.size, (0, 0, 0))
            rgb_img.paste(img_with_number, mask=img_with_number.split()[3])  # 使用alpha通道作为mask
            
            frames.append(rgb_img)
            print(f'    ✓ 帧 {i}')
        else:
            print(f'    ⚠️  帧 {i} 不存在')
    
    if not frames:
        print(f'  ❌ 没有找到任何帧')
        return False
    
    # 创建输出目录
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 保存为GIF
    output_path = os.path.join(OUTPUT_DIR, f'{anim_name}.gif')
    
    # 第一帧作为基础，后续帧作为追加
    frames[0].save(
        output_path,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,  # 无限循环
        optimize=True
    )
    
    print(f'  ✅ 已保存: {output_path}')
    print(f'     帧数: {len(frames)}, 每帧{duration}ms')
    
    return True

def create_combined_preview():
    """创建组合预览图（所有动画放在一张图上）"""
    print('\n创建组合预览...')
    
    # 读取所有动画的第一帧
    all_frames = []
    anim_names = []
    
    for anim_name in ANIMATIONS:
        input_dir = os.path.join(INPUT_BASE, anim_name)
        frame_path = os.path.join(input_dir, f'{anim_name}_01.png')
        
        if os.path.exists(frame_path):
            img = Image.open(frame_path).convert('RGBA')
            all_frames.append(img)
            anim_names.append(anim_name)
    
    if not all_frames:
        print('  ⚠️  没有找到任何帧')
        return
    
    # 计算画布大小
    frame_width = max(img.size[0] for img in all_frames)
    frame_height = max(img.size[1] for img in all_frames)
    
    gap = 20
    cols = 3
    rows = (len(all_frames) + cols - 1) // cols
    
    canvas_width = cols * frame_width + (cols + 1) * gap
    canvas_height = rows * frame_height + (rows + 1) * gap
    
    # 创建画布
    canvas = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
    
    # 粘贴每一帧
    for i, (img, anim_name) in enumerate(zip(all_frames, anim_names)):
        row = i // cols
        col = i % cols
        
        x = col * (frame_width + gap) + gap
        y = row * (frame_height + gap) + gap
        
        canvas.paste(img, (x, y), img)
    
    # 保存
    output_path = os.path.join(OUTPUT_DIR, 'all_animations.png')
    canvas.save(output_path)
    print(f'  ✅ 已保存: {output_path}')

def main():
    print('=' * 60)
    print('创建艾米动画GIF预览')
    print('=' * 60)
    
    # 创建输出目录
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 为每个动画创建GIF
    success_count = 0
    for anim_name in ANIMATIONS:
        if create_animation_gif(anim_name, duration=200):
            success_count += 1
    
    # 创建组合预览图
    create_combined_preview()
    
    print('\n' + '=' * 60)
    print(f'✅ 完成！成功创建 {success_count} 个GIF')
    print(f'输出目录: {OUTPUT_DIR}')
    print('=' * 60)
    print('\n预览文件：')
    print(f'  - 单个动画GIF: {OUTPUT_DIR}/[动画名].gif')
    print(f'  - 组合预览图: {OUTPUT_DIR}/all_animations.png')
    print('\n如何反馈问题：')
    print('  告诉我："[动画名]第X帧有问题（比如偏左/偏上/特效被切）"')

if __name__ == '__main__':
    main()
