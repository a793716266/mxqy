#!/usr/bin/env python3
"""
从视频中提取艾米动画帧
使用方法：
1. 将视频文件放到项目目录
2. 修改 VIDEO_PATH 为你的视频路径
3. 运行：python3 extract_aimi_from_video.py
"""

import cv2
import os

# ======== 配置区 ========
VIDEO_PATH = 'aimi_animation.mp4'  # 修改为你的视频路径
OUTPUT_DIR = 'subpackages/battle/images/characters_anim/transparent/aimi'
FPS = 30  # 视频帧率
EXTRACT_FPS = 10  # 提取帧率（每秒提取多少帧）
# =========================

def extract_frames(video_path, output_dir, fps=30, extract_fps=10):
    """从视频中提取帧"""
    
    if not os.path.exists(video_path):
        print(f'错误：视频文件不存在 {video_path}')
        return
    
    # 创建输出目录
    animations = ['idle', 'walk', 'attack', 'skill', 'buff', 'support']
    for anim in animations:
        os.makedirs(os.path.join(output_dir, anim), exist_ok=True)
    
    # 打开视频
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f'错误：无法打开视频 {video_path}')
        return
    
    # 获取视频信息
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / video_fps
    
    print(f'视频信息：')
    print(f'  分辨率：{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}')
    print(f'  帧率：{video_fps} FPS')
    print(f'  总帧数：{total_frames}')
    print(f'  时长：{duration:.2f} 秒')
    print()
    
    # 提取帧
    frame_count = 0
    saved_count = 0
    sample_interval = int(video_fps / extract_fps)
    
    print(f'开始提取帧（每 {sample_interval} 帧保存一次）...')
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # 按间隔采样
        if frame_count % sample_interval == 0:
            # 转换为RGB（OpenCV使用BGR）
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # 保存帧（这里需要你手动分类到不同动画目录）
            output_path = os.path.join(output_dir, f'frame_{saved_count:04d}.png')
            cv2.imwrite(output_path, cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR))
            saved_count += 1
            
            if saved_count % 10 == 0:
                print(f'  已保存 {saved_count} 帧...')
        
        frame_count += 1
    
    cap.release()
    print(f'\n✅ 完成！共保存 {saved_count} 帧到 {output_dir}')
    print(f'\n⚠️ 注意：你需要手动将帧分类到不同的动画目录：')
    for anim in animations:
        print(f'  - {anim}/')

if __name__ == '__main__':
    print('=' * 50)
    print('从视频中提取艾米动画帧')
    print('=' * 50)
    print()
    
    # 检查是否安装了opencv
    try:
        import cv2
    except ImportError:
        print('错误：需要安装 OpenCV')
        print('请运行：pip3 install opencv-python')
        exit(1)
    
    extract_frames(VIDEO_PATH, OUTPUT_DIR, fps=FPS, extract_fps=EXTRACT_FPS)
