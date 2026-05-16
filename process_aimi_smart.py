#!/usr/bin/env python3
"""
智能批量处理艾米（aimi）动画资源，自动检测并去除背景
处理目标：subpackages/battle/images/characters_anim/transparent/aimi/
"""

from PIL import Image
import os

def detect_background_color(img):
    """
    检测图片背景色（采样四个角和边缘）
    """
    width, height = img.size
    pixels = []
    
    # 采样四个角
    corners = [
        (0, 0), (width-1, 0),  # 左上、右上
        (0, height-1), (width-1, height-1)  # 左下、右下
    ]
    
    for x, y in corners:
        pixel = img.getpixel((x, y))
        if len(pixel) >= 3:
            pixels.append(pixel[:3])  # 只取RGB
    
    # 采样边缘（上、下、左、右各取5个点）
    edge_samples = 5
    for i in range(edge_samples):
        # 上边缘
        x = int(width * i / (edge_samples - 1))
        pixel = img.getpixel((x, 0))
        if len(pixel) >= 3:
            pixels.append(pixel[:3])
        
        # 下边缘
        pixel = img.getpixel((x, height - 1))
        if len(pixel) >= 3:
            pixels.append(pixel[:3])
        
        # 左边缘
        y = int(height * i / (edge_samples - 1))
        pixel = img.getpixel((0, y))
        if len(pixel) >= 3:
            pixels.append(pixel[:3])
        
        # 右边缘
        pixel = img.getpixel((width - 1, y))
        if len(pixel) >= 3:
            pixels.append(pixel[:3])
    
    # 找到最常见的颜色（简单投票）
    if not pixels:
        return (0, 255, 0)  # 默认绿色
    
    # 统计颜色出现次数（允许小误差）
    color_count = {}
    for p in pixels:
        # 量化到相近颜色（容差10）
        quantized = tuple((c // 10) * 10 for c in p)
        color_count[quantized] = color_count.get(quantized, 0) + 1
    
    # 返回最常见的颜色
    most_common = max(color_count, key=color_count.get)
    return most_common

def remove_background_smart(input_path, output_path, tolerance=30):
    """
    智能去除背景（自动检测背景色）
    """
    # 打开图片
    img = Image.open(input_path)
    
    # 如果是RGB模式（没有Alpha通道），先转换为RGBA
    if img.mode == 'RGB':
        # 创建RGBA图片，Alpha通道初始为255（不透明）
        rgba_img = Image.new('RGBA', img.size)
        rgba_img.paste(img, (0, 0))
        img = rgba_img
    elif img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # 检测背景色（使用RGB版本检测）
    bg_color = detect_background_color(img.convert('RGB'))
    print(f"  检测到背景色: RGB{bg_color}")
    
    datas = img.getdata()
    new_data = []
    
    for item in datas:
        r, g, b, a = item
        
        # 计算与背景色的距离
        dist = ((r - bg_color[0]) ** 2 + 
                (g - bg_color[1]) ** 2 + 
                (b - bg_color[2]) ** 2) ** 0.5
        
        # 如果接近背景色，设为透明
        if dist <= tolerance:
            new_data.append((r, g, b, 0))  # 透明
        else:
            new_data.append(item)
    
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"  ✓ 处理完成")

def process_aimi_animations_smart():
    """智能处理艾米所有动画资源"""
    
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
            print(f"\n跳过不存在的目录: {anim_dir}")
            continue
        
        print(f"\n处理 {anim} 动画...")
        
        # 获取所有帧文件
        frames = sorted([f for f in os.listdir(anim_dir) if f.endswith('.png')])
        
        for frame_file in frames:
            input_path = os.path.join(anim_dir, frame_file)
            output_path = input_path  # 直接覆盖原文件
            
            try:
                print(f"  处理: {frame_file}")
                remove_background_smart(input_path, output_path)
                total_count += 1
            except Exception as e:
                print(f"  ✗ 处理失败 {frame_file}: {e}")
    
    print(f"\n{'='*50}")
    print(f"处理完成！共处理 {total_count} 张图片")
    print(f"{'='*50}")

if __name__ == "__main__":
    print("开始智能处理艾米动画资源...")
    print("目标目录: subpackages/battle/images/characters_anim/transparent/aimi/")
    print("自动检测背景色并去除")
    print("-" * 50)
    
    process_aimi_animations_smart()
