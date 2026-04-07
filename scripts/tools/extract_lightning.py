#!/usr/bin/env python3
"""
从视频提取雷击术动画帧并处理背景
1. 使用FFmpeg提取视频帧
2. 将浅色背景替换为黑色
3. 去除黑色背景（透明化）
"""

import subprocess
from pathlib import Path
from PIL import Image
import numpy as np
import tempfile
import shutil

def extract_frames_with_ffmpeg(video_path, temp_dir):
    """使用FFmpeg提取视频帧到临时目录"""
    print(f"\n📹 使用FFmpeg提取帧...")
    print(f"视频: {video_path}")
    
    # FFmpeg命令
    cmd = [
        'ffmpeg',
        '-i', str(video_path),
        '-vf', 'fps=30',
        '-y',
        str(temp_dir / 'frame_%04d.png')
    ]
    
    # 执行
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"❌ FFmpeg错误: {result.stderr}")
        return None
    
    # 获取提取的帧
    frames = sorted(temp_dir.glob('frame_*.png'))
    print(f"✅ 提取了 {len(frames)} 帧")
    
    return frames

def replace_light_bg_with_black(img_array):
    """将浅色背景替换为黑色"""
    # 计算亮度
    brightness = np.mean(img_array[:, :, :3], axis=2)
    
    # 找出亮度较高的像素（背景）
    # 阈值设为240，接近白色的区域
    bg_mask = brightness > 240
    
    # 创建副本
    result = img_array.copy()
    
    # 将背景区域设为黑色
    result[bg_mask] = [0, 0, 0, 255]  # RGBA
    
    black_pixels = np.sum(bg_mask)
    total_pixels = bg_mask.size
    black_rate = (black_pixels / total_pixels) * 100
    
    return result, black_rate

def remove_bottom_right_text(img_array):
    """去除右下角文字"""
    h, w = img_array.shape[:2]
    
    # 右下角区域（最后200x100像素）
    for y in range(h-100, h):
        for x in range(w-200, w):
            # 如果像素不是黑色（RGB都大于20），则设为黑色
            if not (img_array[y, x, 0] < 20 and img_array[y, x, 1] < 20 and img_array[y, x, 2] < 20):
                img_array[y, x] = [0, 0, 0, 255]
    
    return img_array

def make_black_transparent(img_array):
    """将黑色背景透明化"""
    transparent_count = 0
    
    for y in range(img_array.shape[0]):
        for x in range(img_array.shape[1]):
            r, g, b = img_array[y, x, :3]
            
            # 如果是黑色（或接近黑色），设置为透明
            if r < 20 and g < 20 and b < 20:
                img_array[y, x, 3] = 0  # Alpha = 0
                transparent_count += 1
    
    total_pixels = img_array.shape[0] * img_array.shape[1]
    transparency_rate = (transparent_count / total_pixels) * 100
    
    return img_array, transparency_rate

def process_video_frames(video_path, output_dir, prefix, start_frame, end_frame):
    """
    从视频提取帧并处理背景
    
    Args:
        video_path: 视频文件路径
        output_dir: 输出目录
        prefix: 文件名前缀
        start_frame: 起始帧（1-based）
        end_frame: 结束帧（1-based）
    """
    print(f"\n📹 处理视频: {video_path}")
    print(f"输出目录: {output_dir}")
    print(f"帧范围: {start_frame} - {end_frame}")
    
    # 创建输出目录
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 创建临时目录
    temp_dir = Path(tempfile.mkdtemp())
    
    try:
        # 提取帧
        frames = extract_frames_with_ffmpeg(video_path, temp_dir)
        
        if not frames:
            return
        
        # 处理指定范围的帧
        saved_count = 0
        frame_indices = range(start_frame, min(end_frame + 1, len(frames) + 1))
        
        for i, frame_idx in enumerate(frame_indices, 1):
            frame_file = frames[frame_idx - 1]  # 0-based index
            
            print(f"\n[{i}/{len(frame_indices)}] 处理 {frame_file.name}")
            
            # 加载图像
            img = Image.open(frame_file).convert('RGBA')
            img_array = np.array(img)
            
            # 第一步：将浅色背景替换为黑色
            print("  步骤1: 背景变黑...")
            img_array, black_rate = replace_light_bg_with_black(img_array)
            print(f"    变黑比例: {black_rate:.2f}%")
            
            # 第二步：去除右下角文字
            print("  步骤2: 去除右下角文字...")
            img_array = remove_bottom_right_text(img_array)
            
            # 第三步：将黑色背景透明化
            print("  步骤3: 透明化黑色背景...")
            img_array, transparency_rate = make_black_transparent(img_array)
            print(f"    透明化比例: {transparency_rate:.2f}%")
            
            # 保存
            output_file = output_dir / f"{prefix}_{saved_count + 1:02d}.png"
            result_img = Image.fromarray(img_array, 'RGBA')
            result_img.save(output_file)
            
            saved_count += 1
        
        print(f"\n✅ 完成！保存了 {saved_count} 帧")
        
    finally:
        # 清理临时目录
        shutil.rmtree(temp_dir)

def main():
    """主函数"""
    base_dir = Path(__file__).parent.parent.parent
    video_dir = base_dir / 'images/characters_anim/transparent'
    
    print("⚡ 雷击术动画提取与背景处理")
    print("=" * 60)
    print("策略: FFmpeg提取 → 背景变黑 → 去除文字 → 透明化黑色背景")
    
    # 处理释放动画 (frame 0001-0088)
    print("\n" + "=" * 60)
    print("⚡ 处理雷击术释放动画")
    print("=" * 60)
    
    video_path = video_dir / '雷击术释放.mp4'
    output_dir = base_dir / 'images/effects/lightning_cast'
    
    if video_path.exists():
        process_video_frames(video_path, output_dir, 'lightning_cast', 1, 88)
    else:
        print(f"❌ 视频文件不存在: {video_path}")
    
    # 处理击中动画 (frame 0089-0151，重新编号为1-63)
    print("\n" + "=" * 60)
    print("⚡ 处理雷击术击中动画")
    print("=" * 60)
    
    output_dir = base_dir / 'images/effects/lightning_hit'
    
    if video_path.exists():
        process_video_frames(video_path, output_dir, 'lightning_hit', 89, 151)
    else:
        print(f"❌ 视频文件不存在: {video_path}")
    
    print("\n" + "=" * 60)
    print("✅ 所有处理完成！")

if __name__ == '__main__':
    main()
