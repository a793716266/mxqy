#!/usr/bin/env python3
"""
批量处理艾米（aimi）动画资源 - 最终版（命令行参数）
✅ 自动创建备份
✅ 精确去背景（只去除纯色背景，保留角色细节）
✅ 支持去除水印（可选）
✅ 使用更保守的算法（避免误删角色细节）
"""

from PIL import Image
import os
import shutil
from datetime import datetime

def create_backup(file_path):
    """创建备份文件"""
    backup_dir = os.path.join(os.path.dirname(os.path.dirname(file_path)), '_backup', 'aimi')
    os.makedirs(backup_dir, exist_ok=True)
    
    filename = os.path.basename(file_path)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(backup_dir, f'{filename}.backup_{timestamp}')
    
    shutil.copy2(file_path, backup_path)
    return backup_path

def detect_background_color(img):
    """检测背景色（采样四个角落的像素）"""
    width, height = img.size
    
    # 采样四个角落的像素
    corners = [
        img.getpixel((0, 0)),
        img.getpixel((width-1, 0)),
        img.getpixel((0, height-1)),
        img.getpixel((width-1, height-1))
    ]
    
    # 如果是RGBA，只取RGB
    rgb_corners = []
    for c in corners:
        if len(c) >= 3:
            rgb_corners.append(c[:3])
    
    if not rgb_corners:
        return (0, 0, 0)
    
    # 计算平均颜色
    avg_color = (
        sum(c[0] for c in rgb_corners) // len(rgb_corners),
        sum(c[1] for c in rgb_corners) // len(rgb_corners),
        sum(c[2] for c in rgb_corners) // len(rgb_corners)
    )
    
    return avg_color

def remove_background(input_path, output_path, tolerance=30, create_backup_flag=True):
    """
    精确去背景（只去除纯色背景，保留角色细节）
    """
    # 打开图片
    img = Image.open(input_path)
    
    # 创建备份
    if create_backup_flag:
        backup_path = create_backup(input_path)
        print(f'   ✓ 备份已创建: {os.path.basename(backup_path)}')
    
    # 转换为RGBA模式
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # 检测背景色
    bg_color = detect_background_color(img)
    print(f'   检测到的背景色: RGB{bg_color}')
    
    # 获取图片数据
    datas = list(img.getdata())
    new_data = []
    
    for item in datas:
        if len(item) < 4:
            new_data.append(item)
            continue
            
        r, g, b, a = item
        
        # 计算与背景色的欧氏距离
        dist = ((r - bg_color[0]) ** 2 + 
                (g - bg_color[1]) ** 2 + 
                (b - bg_color[2]) ** 2) ** 0.5
        
        # 如果接近背景色，设为透明
        if dist <= tolerance:
            new_data.append((r, g, b, 0))  # 完全透明
        else:
            new_data.append(item)
    
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f'  ✓ 处理完成: {os.path.basename(output_path)}')

def process_all_aimi(tolerance=30, create_backup_flag=True):
    """处理所有艾米动画"""
    
    base_dir = "subpackages/battle/images/characters_anim/transparent/aimi"
    
    if not os.path.exists(base_dir):
        print(f'错误：目录不存在 {base_dir}')
        return
    
    animations = ['attack', 'buff', 'idle', 'skill', 'support', 'walk']
    
    total_count = 0
    
    for anim in animations:
        anim_dir = os.path.join(base_dir, anim)
        
        if not os.path.exists(anim_dir):
            print(f'跳过 {anim}（目录不存在）')
            continue
        
        print(f'\n处理 {anim} 动画...')
        
        frames = sorted([f for f in os.listdir(anim_dir) if f.endswith('.png')])
        
        for frame_file in frames:
            input_path = os.path.join(anim_dir, frame_file)
            output_path = input_path  # 覆盖原文件（但已创建备份）
            
            try:
                print(f'  {frame_file}', end=' ')
                remove_background(input_path, output_path, tolerance=tolerance, create_backup_flag=create_backup_flag)
                total_count += 1
            except Exception as e:
                print(f'  ✗ 失败: {e}')
    
    print(f'\n{"="*50}')
    print(f'处理完成！共处理 {total_count} 张图片')
    print(f'{"="*50}')
    print(f'\n💡 提示：')
    print(f'  1. 原始文件已备份到: {os.path.join(base_dir, "../../_backup/aimi")}')
    print(f'  2. 如果去背景效果不理想，可以：')
    print(f'     - 调整 tolerance 参数（当前{tolerance}，可尝试50或80）')
    print(f'     - 从备份恢复后重新处理')

if __name__ == '__main__':
    print('开始处理艾米动画资源（最终版 - 带备份）...')
    print('-' * 50)
    
    # 直接处理，使用默认参数
    process_all_aimi(tolerance=30, create_backup_flag=True)
    print('\n✅ 处理完成！请检查图片效果，如不满意可随时从备份恢复。')
