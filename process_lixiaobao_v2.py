#!/usr/bin/env python3
"""
李小宝角色动画资源处理器 v2
===============================
修复：
1. 清除帧编号水印（底部/顶部数字 + 背景框）
2. 保留完整人物+特效（正确识别帧区域）
3. 输出透明PNG

用法: python3 process_lixiaobao_v2.py
"""

import os
import json
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

# ============ 配置 ============
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.join(BASE_DIR, "_source_backup", "李小宝")
OUTPUT_DIR = os.path.join(BASE_DIR, "images", "characters_anim", "lixiaobao")

# 源图配置：(文件名, 帧数, 列数, 行数, 帧编号位置, 输出前缀)
# 帧编号位置: 'bottom'=底部, 'top'=顶部, 'none'=无
SPRITE_CONFIGS = [
    # 竖排布局 (高>宽): 移动、攻击类
    ("李小宝移动动画.png",   8, 4, 2, "bottom", "WALK"),
    # 横排布局 (宽>高): 待机、技能类  
    ("李小宝待机动画.png",   8, 4, 2, "bottom", "IDLE"),
    ("李小宝普通攻击.png",   8, 4, 2, "bottom", "ATTACK"),
    ("冰晶术释放动画.png",   8, 4, 2, "top",    "SKILL_ICE"),
    ("雷击术释放.png",       8, 4, 2, "bottom", "SKILL_THUNDER"),
    ("火球术释放动画.png",   8, 4, 2, "bottom", "SKILL_FIRE"),
]

# 背景色 (深灰 #3d3d3d 或类似)
BG_COLOR = (61, 61, 61)
BG_TOLERANCE = 30  # 背景色容差


def load_image(path):
    """加载图片转为RGBA"""
    img = Image.open(path).convert("RGBA")
    return img


def is_vertical_layout(img):
    """判断是否为竖排布局（帧竖向排列）"""
    return img.height > img.width


def get_grid_size(img, cols, rows):
    """计算每个网格单元格的尺寸"""
    cell_w = img.width // cols
    cell_h = img.height // rows
    return cell_w, cell_h


def extract_frame(img, col, row, cell_w, cell_h):
    """提取指定位置的帧"""
    left = col * cell_w
    top = row * cell_h
    right = left + cell_w
    bottom = top + cell_h
    return img.crop((left, top, right, bottom))


def remove_frame_number(frame, number_position="bottom"):
    """
    移除帧编号水印
    - 数字通常在帧的底部或顶部
    - 用周围像素填充/修复
    """
    w, h = frame.size
    arr = np.array(frame)
    
    # 水印区域高度估计（约占帧高的8-12%）
    watermark_h = int(h * 0.10)
    
    if number_position == "bottom":
        # 底部水印区域
        region_slice = arr[h - watermark_h:h, :, :]
        arr[h - watermark_h:h, :, :] = BG_COLOR + (255,)  # 填充为背景色
    elif number_position == "top":
        # 顶部水印区域
        region_slice = arr[0:watermark_h, :, :]
        arr[0:watermark_h, :, :] = BG_COLOR + (255,)
    
    return Image.fromarray(arr)


def remove_background_simple(img, bg_color=BG_COLOR, tolerance=BG_TOLERANCE):
    """
    简单背景去除：将接近背景色的像素变为透明
    比 rembg 更可控，不会误删边缘细节
    """
    arr = np.array(img)
    
    # 创建蒙版：与背景色差异大的像素保留
    r, g, b, a = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]
    
    # 计算与背景色的距离
    diff_r = np.abs(r.astype(int) - bg_color[0])
    diff_g = np.abs(g.astype(int) - bg_color[1])
    diff_b = np.abs(b.astype(int) - bg_color[2])
    
    # 欧氏距离（简化）
    distance = np.sqrt(diff_r**2 + diff_g**2 + diff_b**2)
    
    # 距离小于阈值的视为背景 → 透明
    bg_mask = distance < tolerance
    
    # 设置透明度
    new_alpha = a.copy()
    new_alpha[bg_mask] = 0
    
    arr[:,:,3] = new_alpha
    
    return Image.fromarray(arr)


def clean_edge_artifacts(img):
    """
    清理边缘残留的背景色噪点
    使用形态学方法：先膨胀再腐蚀，去除孤立噪点
    """
    arr = np.array(img)
    alpha = arr[:,:,3]
    
    # 找出几乎透明的像素（alpha < 10），完全清零
    weak_alpha = alpha < 10
    alpha[weak_alpha] = 0
    
    # 对半透明边缘进行锐化
    semi_transparent = (alpha > 0) & (alpha < 200)
    # 将半透明像素变得更不透明（增强边缘）
    alpha[semi_transparent] = np.minimum(alpha[semi_transparent] * 1.3, 255).astype(np.uint8)
    
    arr[:,:,3] = alpha
    return Image.fromarray(arr)


def optimize_png(img, output_path):
    """优化保存PNG（压缩但不损失质量）"""
    # 确保输出目录存在
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # 保存时使用优化参数
    img.save(output_path, "PNG", optimize=True)


def process_sprite_sheet(config):
    """处理单个精灵表"""
    filename, frames, cols, rows, num_pos, prefix = config
    source_path = os.path.join(SOURCE_DIR, filename)
    
    if not os.path.exists(source_path):
        print(f"  ⚠️  源文件不存在: {filename}")
        return []
    
    print(f"\n📄 处理: {filename}")
    img = load_image(source_path)
    print(f"   尺寸: {img.width}×{img.height}, 布局: {cols}×{rows}={frames}帧")
    
    cell_w, cell_h = get_grid_size(img, cols, rows)
    print(f"   单帧尺寸: {cell_w}×{cell_h}")
    
    output_files = []
    
    for i in range(frames):
        col = i % cols
        row = i // cols
        
        # 提取帧
        frame = extract_frame(img, col, row, cell_w, cell_h)
        
        # 步骤1: 移除帧编号水印
        frame = remove_frame_number(frame, num_pos)
        
        # 步骤2: 去除背景（简单方法，更可控）
        frame = remove_background_simple(frame)
        
        # 步骤3: 清理边缘
        frame = clean_edge_artifacts(frame)
        
        # 生成输出文件名
        output_name = f"{prefix}_{i+1:02d}.png"
        output_path = os.path.join(OUTPUT_DIR, output_name)
        
        # 保存
        optimize_png(frame, output_path)
        output_files.append(output_name)
        
        file_size = os.path.getsize(output_path) / 1024
        print(f"   ✅ {output_name} ({file_size:.1f}KB)")
    
    return output_files


def main():
    print("=" * 60)
    print("  李小宝角色动画资源处理器 v2")
    print("  功能: 拆帧 + 去水印 + 去背景")
    print("=" * 60)
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    all_outputs = {}
    total_frames = 0
    
    for config in SPRITE_CONFIGS:
        outputs = process_sprite_sheet(config)
        prefix = config[4]
        all_outputs[prefix] = outputs
        total_frames += len(outputs)
    
    # 输出汇总
    print("\n" + "=" * 60)
    print("  📊 处理完成!")
    print("=" * 60)
    print(f"  总计: {len(SPRITE_CONFIGS)} 个动作, {total_frames} 帧")
    print(f"  输出目录: {OUTPUT_DIR}/")
    
    for prefix, files in all_outputs.items():
        print(f"  {prefix}: {len(files)} 帧 ({files[0]} ~ {files[-1]})")
    
    # 生成资源清单
    manifest_path = os.path.join(OUTPUT_DIR, "_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(all_outputs, f, indent=2, ensure_ascii=False)
    print(f"\n  📋 资源清单: _manifest.json")


if __name__ == "__main__":
    main()
