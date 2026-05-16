#!/usr/bin/env python3
"""
批量处理艾米（aimi）动画资源，去除背景
处理目标：subpackages/battle/images/characters_anim/transparent/aimi/
"""

from PIL import Image
import os
import sys

def remove_background(input_path, output_path, bg_color=(0, 255, 0), tolerance=50):
    """
    去除图片背景，使背景透明
    
    Args:
        input_path: 输入图片路径
        output_path: 输出图片路径
        bg_color: 背景色 RGB 值，默认绿色 (0, 255, 0)
        tolerance: 颜色容差，值越大去除范围越广
    """
    # 打开图片
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()
    
    new_data = []
    for item in datas:
        # 计算像素颜色与背景色的差异
        r, g, b, a = item
        bg_r, bg_g, bg_b = bg_color
        
        # 如果颜色接近背景色，设置为透明
        if (abs(r - bg_r) <= tolerance and 
            abs(g - bg_g) <= tolerance and 
            abs(b - bg_b) <= tolerance):
            new_data.append((r, g, b, 0))  # 完全透明
        else:
            new_data.append(item)
    
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"✓ 处理完成: {os.path.basename(output_path)}")

def process_aimi_animations():
    """处理艾米所有动画资源"""
    
    base_dir = "subpackages/battle/images/characters_anim/transparent/aimi"
    
    # 检查目录是否存在
    if not os.path.exists(base_dir):
        print(f"错误：目录不存在 {base_dir}")
        return
    
    # 动画类型列表
    animations = ['attack', 'buff', 'idle', 'skill', 'support', 'walk']
    
    total_count = 0
    
    # 遍历每种动画类型
    for anim in animations:
        anim_dir = os.path.join(base_dir, anim)
        
        if not os.path.exists(anim_dir):
            print(f"跳过不存在的目录: {anim_dir}")
            continue
        
        print(f"\n处理 {anim} 动画...")
        
        # 获取所有帧文件
        frames = sorted([f for f in os.listdir(anim_dir) if f.endswith('.png')])
        
        for frame_file in frames:
            input_path = os.path.join(anim_dir, frame_file)
            output_path = input_path  # 直接覆盖原文件
            
            try:
                remove_background(input_path, output_path)
                total_count += 1
            except Exception as e:
                print(f"✗ 处理失败 {frame_file}: {e}")
    
    print(f"\n{'='*50}")
    print(f"处理完成！共处理 {total_count} 张图片")
    print(f"{'='*50}")

if __name__ == "__main__":
    print("开始处理艾米动画资源...")
    print("目标目录: subpackages/battle/images/characters_anim/transparent/aimi/")
    print("-" * 50)
    
    process_aimi_animations()
