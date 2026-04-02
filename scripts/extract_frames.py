#!/usr/bin/env python3
"""
视频帧提取脚本
从视频中提取所有帧并保存为图片

使用方法:
1. 安装依赖: pip3 install opencv-python
2. 运行脚本: python3 scripts/extract_frames.py
"""

import os
import sys

try:
    import cv2
except ImportError:
    print("错误: 未安装 opencv-python 库")
    print("请运行: pip3 install opencv-python")
    sys.exit(1)

# 配置
VIDEO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 
                          "images/characters_anim/人物移动.mp4")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 
                          "images/characters_anim/frames")

def extract_frames(video_path, output_dir, fps=None):
    """
    从视频中提取帧
    
    Args:
        video_path: 视频文件路径
        output_dir: 输出目录路径
        fps: 提取帧率（None表示提取所有帧）
    """
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    # 打开视频文件
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"错误: 无法打开视频文件 {video_path}")
        return False
    
    # 获取视频信息
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    print(f"视频信息:")
    print(f"  分辨率: {width}x{height}")
    print(f"  帧率: {video_fps:.2f} FPS")
    print(f"  总帧数: {total_frames}")
    print(f"  时长: {total_frames/video_fps:.2f} 秒")
    print()
    
    # 计算提取间隔
    if fps is None:
        # 提取所有帧
        frame_interval = 1
        expected_frames = total_frames
    else:
        # 按指定帧率提取
        frame_interval = int(video_fps / fps)
        expected_frames = total_frames // frame_interval
    
    print(f"开始提取帧...")
    print(f"预计提取帧数: {expected_frames}")
    print()
    
    frame_count = 0
    saved_count = 0
    
    while True:
        ret, frame = cap.read()
        
        if not ret:
            break
        
        # 根据间隔保存帧
        if frame_count % frame_interval == 0:
            # 生成文件名（4位数字编号）
            filename = f"frame_{saved_count:04d}.png"
            output_path = os.path.join(output_dir, filename)
            
            # 保存图片
            cv2.imwrite(output_path, frame)
            saved_count += 1
            
            # 显示进度
            if saved_count % 10 == 0 or saved_count == expected_frames:
                print(f"进度: {saved_count}/{expected_frames} ({saved_count/expected_frames*100:.1f}%)")
        
        frame_count += 1
    
    # 释放资源
    cap.release()
    
    print()
    print(f"✅ 提取完成!")
    print(f"总共提取了 {saved_count} 帧")
    print(f"保存位置: {output_dir}")
    
    return True

if __name__ == "__main__":
    print("=" * 60)
    print("视频帧提取工具")
    print("=" * 60)
    print()
    
    # 检查视频文件是否存在
    if not os.path.exists(VIDEO_PATH):
        print(f"错误: 视频文件不存在 {VIDEO_PATH}")
        sys.exit(1)
    
    print(f"输入视频: {VIDEO_PATH}")
    print(f"输出目录: {OUTPUT_DIR}")
    print()
    
    # 提取所有帧（如果需要降低帧率，可以传入 fps 参数，如 fps=15）
    success = extract_frames(VIDEO_PATH, OUTPUT_DIR, fps=None)
    
    if not success:
        sys.exit(1)
