#!/usr/bin/env python3
"""
生成李小宝施法精灵表 v7 - 锚点对齐版（基于已处理的透明图）

核心思路:
1. 使用已有的透明版 cast_universal.png 作为输入（绿幕已去）
2. 按均分裁出每帧，检测每帧的实际内容边界
3. 以脚底中心为锚点，重新排列所有帧到新画布
4. 输出对齐后的新精灵表
"""
import os
from PIL import Image, ImageDraw

# 已处理好的透明版精灵图
INPUT = "subpackages/battle/images/characters_anim/transparent/lixiaobao/cast_universal.png"
OUTPUT = "subpackages/battle/images/characters_anim/transparent/lixiaobao/cast_universal.png"
DEBUG_OUTPUT = "cast_aligned_debug.png"


def get_content_bounds(img):
    """
    获取图像中不透明内容的边界框。
    返回 (left, top, right, bottom) 或 None
    """
    w, h = img.size
    px = img.load()
    
    left, top, right, bottom = w, h, 0, 0
    found = False
    
    for y in range(h):
        for x in range(w):
            a = px[x, y][3]
            if a > 20:  # 明显不透明的像素
                found = True
                left = min(left, x)
                right = max(right, x)
                top = min(top, y)
                bottom = max(bottom, y)
    
    if not found:
        return None
    return (left, top, right, bottom)


def get_foot_position(img, bounds):
    """
    计算角色的"脚底位置"。
    策略: 在内容底部区域找水平中心。
    返回 (foot_center_x, foot_y) 相对于图片左上角
    """
    w, h = img.size
    px = img.load()
    left, top, right, bottom = bounds
    
    # 在最底部 20% 的区域找脚底
    content_h = bottom - top
    search_y_start = max(top, int(bottom - content_h * 0.22))
    
    # 找最底部有内容的行的中心
    foot_min_x, foot_max_x = right + 1, left - 1
    
    # 从下往上扫描，找到最低的有内容的行
    lowest_content_row = top
    for y in range(bottom, search_y_start - 1, -1):
        row_has_content = False
        for x in range(left, right + 1):
            if px[x, y][3] > 20:
                row_has_content = True
                foot_min_x = min(foot_min_x, x)
                foot_max_x = max(foot_max_x, x)
        if row_has_content:
            lowest_content_row = y
            break  # 找到最底部的有内容的行了
    
    if foot_min_x > foot_max_x:
        # fallback: 用整个bounds的底部中心
        return ((left + right) // 2, bottom)
    
    center_x = (foot_min_x + foot_max_x) // 2
    return (center_x, lowest_content_row)


def process():
    img = Image.open(INPUT).convert("RGBA")
    src_w, src_h = img.size
    print(f"输入: {INPUT}")
    print(f"尺寸: {src_w}x{src_h}")
    
    frames = 7
    frameW = src_w // frames
    print(f"每帧宽度: {frameW}px, 共{frames}帧")
    
    # === 第一步：分析每帧 ===
    frame_data = []  # (frame_img, bounds, foot_pos, orig_idx)
    
    for i in range(frames):
        sx = i * frameW
        ex = min(sx + frameW, src_w)
        
        # 裁出这一帧
        frame_img = img.crop((sx, 0, ex, src_h))
        
        # 获取内容边界
        bounds = get_content_bounds(frame_img)
        if not bounds:
            print(f"  帧{i}: ⚠ 无内容!")
            continue
        
        fp = get_foot_position(frame_img, bounds)
        cw = bounds[2] - bounds[0]
        ch = bounds[3] - bounds[1]
        
        print(f"  帧{i}: 内容({bounds[0]},{bounds[1]})~({bounds[2]},{bounds[3]}) "
              f"尺寸{cw}x{ch} 脚底=({fp[0]},{fp[1]})")
        
        frame_data.append((frame_img, bounds, fp, i))
    
    if not frame_data:
        print("错误: 没有检测到任何内容!")
        return
    
    # 分析偏移情况
    print("\n--- 锚点偏移分析 ---")
    avg_center = sum(fd[2][0] for fd in frame_data) / len(frame_data)
    avg_bottom = sum(fd[2][1] for fd in frame_data) / len(frame_data)
    
    for fd in frame_data:
        idx = fd[3]
        dx = fd[2][0] - avg_center
        dy = fd[2][1] - avg_bottom
        arrow = ""
        if abs(dx) > 3:
            arrow += "→" if dx > 0 else "←"
        if abs(dy) > 3:
            arrow += "↓" if dy > 0 else "↑"
        status = arrow if arrow else "✓"
        print(f"  帧{idx}: 偏移({dx:+.1f}, {dy:+.1f}) {status}")
    
    # === 第二步：计算新画布尺寸 ===
    max_cw = max(fd[1][2] - fd[1][0] for fd in frame_data)  # 最大内容宽度
    max_ch = max(fd[1][3] - fd[1][1] for fd in frame_data)  # 最大内容高度
    
    PAD_X = 10   # 左右边距
    PAD_TOP = 8  # 顶部边距
    PAD_BOT = 4  # 底部边距（脚底下留一点空间）
    
    new_frame_w = max_cw + PAD_X * 2
    new_frame_h = max_ch + PAD_TOP + PAD_BOT
    canvas_w = new_frame_w * frames
    canvas_h = new_frame_h
    
    anchor_x = new_frame_w // 2   # 新画布中每帧的中心X
    anchor_y = canvas_h - PAD_BOT  # 新画布中的脚底Y
    
    print(f"\n新画布: {canvas_w}x{canvas_h}, 每帧{new_frame_w}x{new_frame_h}")
    print(f"锚点: centerX={anchor_x}, footY={anchor_y}")
    
    # === 第三步：构建对齐的新精灵表 ===
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    
    # 调试图
    dbg_scale = 2
    dbg = Image.new("RGB", (canvas_w * dbg_scale, canvas_h * dbg_scale), (30, 32, 40))
    dbg_draw = ImageDraw.Draw(dbg)
    
    for idx, (frame_img, bounds, fp, orig_i) in enumerate(frame_data):
        # 计算粘贴位置: 使脚底对齐到 (anchor_x, anchor_y)
        paste_x = idx * new_frame_w + (anchor_x - fp[0])
        paste_y = anchor_y - fp[1]
        
        # 将原始帧（含alpha通道）粘贴到画布
        canvas.paste(frame_img, (paste_x, paste_y), frame_img)
        
        # 验证
        new_fp_x = paste_x + fp[0]
        new_fp_y = paste_y + fp[1]
        target_x = idx * new_frame_w + anchor_x
        ok_x = abs(new_fp_x - target_x) < 2
        ok_y = abs(new_fp_y - anchor_y) < 2
        status = "✅" if (ok_x and ok_y) else ("⚠Y" if ok_x else "⚠X" if ok_y else "⚠XY")
        print(f"  帧{orig_i}→pos{idx}: @({paste_x},{paste_y}) "
              f"脚底@({new_fp_x},{new_fp_y}) 目标@({target_x},{anchor_y}) {status}")
        
        # 调试绘制
        dsx = idx * new_frame_w * dbg_scale
        dex = (idx + 1) * new_frame_w * dbg_scale
        
        # 帧分隔线
        dbg_draw.line([(dex, 0), (dex, canvas_h * dbg_scale)], fill=(80, 82, 92), width=1)
        
        # 绘制帧内容（放大）
        resized = frame_img.resize(
            (frame_img.width * dbg_scale, frame_img.height * dbg_scale),
            Image.NEAREST
        )
        dbg.paste(resized.convert("RGB"), 
                  (paste_x * dbg_scale, paste_y * dbg_scale), 
                  resized)
        
        # 锚点十字标记
        ax = target_x * dbg_scale
        ay = anchor_y * dbg_scale
        dbg_draw.line([(ax - 12, ay), (ax + 12, ay)], fill=(0, 255, 210), width=2)
        dbg_draw.line([(ax, ay - 12), (ax, ay + 12)], fill=(0, 255, 210), width=2)
        
        # 帧号
        dbg_draw.text((dsx + 4, 4), f"F{orig_i}", fill=(255, 255, 100))
        
        # 标记原脚底位置（红点）
        rx = new_fp_x * dbg_scale
        ry = new_fp_y * dbg_scale
        dbg_draw.ellipse([rx - 4, ry - 4, rx + 4, ry + 4], fill=(255, 80, 80))
    
    # 保存正式输出
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    canvas.save(OUTPUT, optimize=True)
    sz = os.path.getsize(OUTPUT) / 1024
    print(f"\n✅ 已保存: {OUTPUT} ({canvas_w}x{canvas_h}, {sz:.1f}KB)")
    print(f"   每帧: {new_frame_w}x{new_frame_h}px")
    
    # 分界验证
    cpx = canvas.load()
    print(f"\n--- 分界验证 ---")
    total_cross = 0
    for i in range(1, frames):
        bx = i * new_frame_w
        cnt = sum(1 for yy in range(canvas_h) if cpx[bx, yy][3] > 15)
        total_cross += cnt
        s = "✓" if cnt <= 3 else "~" if cnt <= 10 else "⚠"
        print(f"  F{i-1}|F{i}: {s} {cnt}px")
    print(f"  总交叉像素: {total_cross}")
    
    # 保存调试图
    dbg.save(DEBUG_OUTPUT)
    d_sz = os.path.getsize(DEBUG_OUTPUT) / 1024
    print(f"\n📋 调试图: {DEBUG_OUTPUT} ({d_sz:.1f}KB)")


if __name__ == "__main__":
    process()
