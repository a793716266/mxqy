#!/usr/bin/env python3
"""
李小宝动画素材处理 v4 - 边缘扩散去背 (flood fill)

修复v3问题: 全局阈值误删角色深色衣服
改用边缘种子填充: 只从四边向内去除背景连通区域, 完整保留角色
"""

import os
from PIL import Image
from collections import deque

SOURCE_DIR = "_source_backup/李小宝"
OUTPUT_FINAL = "subpackages/battle/images/characters_anim/transparent/lixiaobao"

# 源图配置: (文件名, 动作名, 目标最大高度)
SOURCES = [
    ("李小宝移动.png",       "walk",           200),
    ("李小宝待机动画.png",   "idle",           200),
    ("李小宝普通攻击.png",   "attack",         280),
    ("火球术释放动画.png",   "cast_fireball",  280),
    ("冰晶术释放动画.png",   "cast_ice",       280),
    ("法师雷击术释放动画.png","cast_lightning", 280),
]

# 网格配置: 4列 x 2行
COLS, ROWS = 4, 2

# 背景色容差: 与采样背景色的欧氏距离阈值
BG_TOLERANCE = 35  # 允许的RGB差异

# 水印区域 (左上角数字)
WM_W = 50
WM_H = 45


def sample_bg_color(img):
    """采样四边角落+边缘像素, 取出现最多的颜色作为背景色"""
    pixels = img.load()
    w, h = img.size
    
    # 采集边缘像素 (四边各取2px宽)
    edge_colors = []
    
    # 上边
    for x in range(w):
        for dy in range(min(3, h)):
            edge_colors.append(pixels[x, dy][:3])
    # 下边
    for x in range(w):
        for dy in range(max(0, h - 3), h):
            edge_colors.append(pixels[x, dy][:3])
    # 左边
    for y in range(h):
        for dx in range(min(3, w)):
            edge_colors.append(pixels[dx, y][:3])
    # 右边
    for y in range(h):
        for dx in range(max(0, w - 3), w):
            edge_colors.append(pixels[dx, y][:3])
    
    # 找出现频率最高的颜色 (简化: 取中位数附近的代表)
    # 用直方图找最常见颜色
    from collections import Counter
    color_counts = Counter()
    for c in edge_colors:
        # 量化到8级以合并相近色
        qc = (c[0] // 32, c[1] // 32, c[2] // 32)
        color_counts[qc] += 1
    
    # 取最常见的量化色, 还原为实际值范围
    top_color = color_counts.most_common(1)[0][0]
    
    # 在原始边缘像素中找到该量化桶的代表色
    bucket_r = []
    for c in edge_colors:
        qc = (c[0] // 32, c[1] // 32, c[2] // 32)
        if qc == top_color:
            bucket_r.append(c)
    
    if bucket_r:
        # 取平均值作为背景参考色
        avg = [sum(p) // len(bucket_r) for p in zip(*bucket_r)]
        return tuple(avg)
    
    return (60, 60, 60)  # fallback


def flood_fill_remove_bg(img, bg_color, tolerance):
    """
    从图片四边开始, 用BFS扩散填充去除背景连通区域
    只删除与背景色相近且与边缘连通的像素
    """
    pixels = img.load()
    w, h = img.size
    
    # 创建访问标记
    visited = [[False] * w for _ in range(h)]
    
    def is_bg_pixel(x, y):
        """判断像素是否属于背景"""
        r, g, b = pixels[x, y][:3]
        dr = abs(int(r) - bg_color[0])
        dg = abs(int(g) - bg_color[1])
        db = abs(int(b) - bg_color[2])
        
        # 欧氏距离
        dist = (dr * dr + dg * dg + db * db) ** 0.5
        
        # 额外检查: 背景通常是低饱和度的均匀色
        # 角色像素通常有明显的色彩变化或较高的亮度对比
        if dist < tolerance:
            # 进一步确认: 背景色通常是均匀灰色 (RGB三通道接近)
            rg_diff = abs(int(r) - int(g))
            gb_diff = abs(int(g) - int(b))
            if rg_diff + gb_diff < 40:  # 接近灰/白/黑
                return True
        return False
    
    # BFS队列
    queue = deque()
    
    # 初始化: 把四边所有可能是背景的像素加入队列
    for x in range(w):
        if not visited[0][x]:
            visited[0][x] = True
            if is_bg_pixel(x, 0):
                queue.append((x, 0))
        if not visited[h - 1][x]:
            visited[h - 1][x] = True
            if is_bg_pixel(x, h - 1):
                queue.append((x, h - 1))
    
    for y in range(h):
        if not visited[y][0]:
            visited[y][0] = True
            if is_bg_pixel(0, y):
                queue.append((0, y))
        if not visited[y][w - 1]:
            visited[y][w - 1] = True
            if is_bg_pixel(w - 1, y):
                queue.append((w - 1, y))
    
    removed = 0
    while queue:
        x, y = queue.popleft()
        
        # 标记为透明
        r, g, b, a = pixels[x, y]
        pixels[x, y] = (0, 0, 0, 0)
        removed += 1
        
        # 4邻域扩散
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                visited[ny][nx] = True
                if is_bg_pixel(nx, ny):
                    queue.append((nx, ny))
    
    print(f"      去背: 移除 {removed} 个背景像素 (总{w*h})")
    return img


def clear_watermark(frame):
    """清除左上角水印数字区域"""
    pixels = frame.load()
    wm_w = min(WM_W, frame.size[0])
    wm_h = min(WM_H, frame.size[1])
    cleared = 0
    for y in range(wm_h):
        for x in range(wm_w):
            if pixels[x, y][3] > 10:
                pixels[x, y] = (0, 0, 0, 0)
                cleared += 1
    if cleared > 0:
        print(f"      水印: 清除左上角 {cleared} 像素")
    return frame


def trim_and_resize(frame, max_height):
    """裁掉透明边界 + 缩放到目标高度 + 加padding"""
    bbox = frame.getbbox()
    if bbox:
        frame = frame.crop(bbox)
    
    w, h = frame.size
    if h == 0 or w == 0:
        return frame
    
    if h > max_height:
        scale = max_height / h
        new_w = int(w * scale)
        new_h = max_height
        frame = frame.resize((new_w, new_h), Image.LANCZOS)
    
    padding = 4
    padded = Image.new("RGBA", (frame.size[0] + padding * 2, frame.size[1] + padding * 2), (0, 0, 0, 0))
    padded.paste(frame, (padding, padding), frame)
    
    return padded


def process_source(src_path, action_name, max_h, out_base):
    print(f"\n{'='*50}")
    print(f"处理: {src_path} -> {action_name}")
    
    img = Image.open(src_path).convert("RGBA")
    w, h = img.size
    fw = w // COLS
    fh = h // ROWS
    
    print(f"  源图: {w}x{h}, 单帧: {fw}x{fh}")
    
    # 采样背景色 (用第一帧做样本)
    first_frame = img.crop((0, 0, fw, fh))
    bg_color = sample_bg_color(first_frame)
    print(f"  检测背景色: RGB{bg_color}")
    
    out_dir = os.path.join(out_base, action_name)
    os.makedirs(out_dir, exist_ok=True)
    
    idx = 0
    for row in range(ROWS):
        for col in range(COLS):
            x = col * fw
            y = row * fh
            
            # 切帧
            frame = img.crop((x, y, x + fw, y + fh))
            
            # 边缘扩散去背 (核心改进!)
            frame = flood_fill_remove_bg(frame, bg_color, BG_TOLERANCE)
            
            # 清水印
            frame = clear_watermark(frame)
            
            # 裁剪 + 缩放
            frame = trim_and_resize(frame, max_h)
            
            idx += 1
            fname = f"{action_name}_{idx:02d}.png"
            fpath = os.path.join(out_dir, fname)
            frame.save(fpath, optimize=True)
            size_kb = os.path.getsize(fpath) / 1024
            
            # 统计透明度
            px = frame.load()
            fw2, fh2 = frame.size
            transparent = sum(1 for yy in range(fh2) for xx in range(fw2) if px[xx, yy][3] == 0)
            pct = transparent / (fw2 * fh2) * 100
            print(f"  ✓ {fname}: {frame.size[0]}x{frame.size[1]} ({size_kb:.1f}KB, 透明{pct:.0f}%)")
    
    return idx


def main():
    os.makedirs(OUTPUT_FINAL, exist_ok=True)
    total = 0
    
    for src_name, action_name, max_h in SOURCES:
        p = os.path.join(SOURCE_DIR, src_name)
        if os.path.exists(p):
            n = process_source(p, action_name, max_h, OUTPUT_FINAL)
            total += n
        else:
            print(f"⚠ 未找到: {p}")
    
    print(f"\n✅ 完成! 共处理 {total} 帧 -> {OUTPUT_FINAL}/")


if __name__ == "__main__":
    main()
