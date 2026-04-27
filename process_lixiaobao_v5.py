#!/usr/bin/env python3
"""
李小宝动画素材处理 v5 - 双阶段混合去背

v4问题: 有网格线的源图(cast_ice/cast_lightning/walk), 白色网格阻挡flood fill扩散
v5方案: 
  阶段1 - 全局阈值粗筛: 用宽松阈值去除大部分背景(包括网格线), 
          但对角色区域用饱和度保护避免误删
  阶段2 - flood fill精修: 从四边向内精细清除残留背景连通区
"""

import os
from PIL import Image
from collections import deque

SOURCE_DIR = "_source_backup/李小宝"
OUTPUT_FINAL = "subpackages/battle/images/characters_anim/transparent/lixiaobao"

SOURCES = [
    ("李小宝移动.png",       "walk",           200),
    ("李小宝待机动画.png",   "idle",           200),
    ("李小宝普通攻击.png",   "attack",         280),
    ("火球术释放动画.png",   "cast_fireball",  280),
    ("冰晶术释放动画.png",   "cast_ice",       280),
    ("法师雷击术释放动画.png","cast_lightning", 280),
]

COLS, ROWS = 4, 2

# ====== 阶段1参数: 全局阈值粗筛 ======
# 背景色范围: 深灰(~60) 到 浅灰/白(~220) 都算背景
# 关键: 用"低饱和度+低色彩变化"来区分背景和角色
BG_GRAY_MIN = 45   # 最暗背景
BG_GRAY_MAX = 230  # 最亮背景(含网格线)
SATURATION_MAX = 35  # 饱和度上限: 角色像素通常有更高的色彩饱和度

# ====== 阶段2参数: flood fill精修 ======
FF_TOLERANCE = 40   # 与采样背景色的欧氏距离阈值

# 水印区域
WM_W, WM_H = 50, 45


def get_saturation(r, g, b):
    """计算色彩饱和度 (0=灰, 255=高饱和)"""
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx == 0:
        return 0
    return int((mx - mn) * 255 / mx)


def phase1_coarse_remove(frame):
    """
    阶段1: 全局阈值粗筛
    - 低饱和度 + RGB三通道接近 + 在灰度范围内 → 判为背景
    - 高饱和度或明显色彩差异 → 保留(角色)
    """
    pixels = frame.load()
    w, h = frame.size
    removed = 0
    
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            
            # 计算色彩特征
            rg_diff = abs(int(r) - int(g))
            gb_diff = abs(int(g) - int(b))
            rb_diff = abs(int(r) - int(b))
            max_chroma = max(rg_diff, gb_diff, rb_diff)
            
            avg = (r + g + b) / 3
            
            # 判断是否为背景:
            # 条件1: 平均亮度在灰度范围内
            in_range = BG_GRAY_MIN <= avg <= BG_GRAY_MAX
            # 条件2: 色彩变化小(低饱和度/灰度)
            is_grayish = max_chroma < SATURATION_MAX
            
            if in_range and is_grayish:
                pixels[x, y] = (0, 0, 0, 0)
                removed += 1
    
    pct = removed / (w * h) * 100
    print(f"      [P1] 全局粗筛: 移除 {removed}/{w*h} ({pct:.0f}%)")
    return frame


def sample_bg_from_edges(img):
    """从残留图像的四边采样背景参考色"""
    pixels = img.load()
    w, h = img.size
    
    edge_samples = []
    sample_width = min(5, w, h)
    
    for x in range(w):
        for dy in range(sample_width):
            p = pixels[x, dy]
            if p[3] > 100:  # 还是不透明
                edge_samples.append(p[:3])
        for dy in range(max(0, h - sample_width), h):
            p = pixels[x, dy]
            if p[3] > 100:
                edge_samples.append(p[:3])
    
    for y in range(h):
        for dx in range(sample_width):
            p = pixels[dx, y]
            if p[3] > 100:
                edge_samples.append(p[:3])
        for dx in range(max(0, w - sample_width), w):
            p = pixels[dx, y]
            if p[3] > 100:
                edge_samples.append(p[:3])
    
    if not edge_samples:
        return (60, 60, 60)
    
    # 取中位数附近值
    edge_samples.sort(key=lambda c: sum(c))
    mid = len(edge_samples) // 2
    # 取中间10个样本的平均
    start = max(0, mid - 5)
    end = min(len(edge_samples), mid + 5)
    bucket = edge_samples[start:end]
    return tuple(sum(c) // len(bucket) for c in zip(*bucket))


def phase2_flood_fill(img, bg_color, tolerance):
    """
    阶段2: BFS flood fill 从四边精修
    清除与背景连通的残留像素
    """
    pixels = img.load()
    w, h = img.size
    
    visited = [[False] * w for _ in range(h)]
    
    def is_bg(x, y):
        r, g, b = pixels[x, y][:3]
        dr = abs(int(r) - bg_color[0])
        dg = abs(int(g) - bg_color[1])
        db = abs(int(b) - bg_color[2])
        dist = (dr*dr + dg*dg + db*db) ** 0.5
        
        if dist < tolerance:
            # 灰度检查
            rg = abs(int(r) - int(g))
            gb = abs(int(g) - int(b))
            if rg + gb < 50:
                return True
        return False
    
    queue = deque()
    
    # 四边种子
    for x in range(w):
        for dy in [0, h-1]:
            if not visited[dy][x]:
                visited[dy][x] = True
                if pixels[x, dy][3] > 20 and is_bg(x, dy):
                    queue.append((x, dy))
    for y in range(h):
        for dx in [0, w-1]:
            if not visited[y][dx]:
                visited[y][dx] = True
                if pixels[dx, y][3] > 20 and is_bg(dx, y):
                    queue.append((dx, y))
    
    removed = 0
    while queue:
        x, y = queue.popleft()
        
        if pixels[x, y][3] == 0:
            continue
            
        pixels[x, y] = (0, 0, 0, 0)
        removed += 1
        
        for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
            nx, ny = x+dx, y+dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                visited[ny][nx] = True
                if pixels[nx, ny][3] > 20 and is_bg(nx, ny):
                    queue.append((nx, ny))
    
    if removed > 0:
        print(f"      [P2] FloodFill精修: 额外清除 {removed} 像素")
    return img


def clear_watermark(frame):
    """清除左上角水印"""
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
        print(f"      水印: 清除 {cleared} 像素")
    return frame


def trim_and_resize(frame, max_height):
    bbox = frame.getbbox()
    if bbox:
        frame = frame.crop(bbox)
    
    w, h = frame.size
    if h == 0 or w == 0:
        return frame
    
    if h > max_height:
        scale = max_height / h
        new_w = int(w * scale)
        frame = frame.resize((new_w, max_height), Image.LANCZOS)
    
    padding = 4
    padded = Image.new("RGBA", (frame.size[0] + padding*2, frame.size[1] + padding*2), (0, 0, 0, 0))
    padded.paste(frame, (padding, padding), frame)
    return padded


def process_source(src_path, action_name, max_h, out_base):
    print(f"\n{'='*55}")
    print(f"处理: {src_path} -> {action_name}")
    
    img = Image.open(src_path).convert("RGBA")
    w, h = img.size
    fw = w // COLS
    fh = h // ROWS
    print(f"  源图: {w}x{h}, 单帧: {fw}x{fh}")
    
    out_dir = os.path.join(out_base, action_name)
    os.makedirs(out_dir, exist_ok=True)
    
    idx = 0
    for row in range(ROWS):
        for col in range(COLS):
            x = col * fw
            y = row * fh
            
            frame = img.crop((x, y, x + fw, y + fh))
            
            # 阶段1: 全局阈值粗筛 (去除背景+网格线)
            frame = phase1_coarse_remove(frame)
            
            # 阶段2: flood fill精修
            bg = sample_bg_from_edges(frame)
            frame = phase2_flood_fill(frame, bg, FF_TOLERANCE)
            
            # 清水印
            frame = clear_watermark(frame)
            
            # 裁剪缩放
            frame = trim_and_resize(frame, max_h)
            
            idx += 1
            fname = f"{action_name}_{idx:02d}.png"
            fpath = os.path.join(out_dir, fname)
            frame.save(fpath, optimize=True)
            
            size_kb = os.path.getsize(fpath) / 1024
            px = frame.load()
            fw2, fh2 = frame.size
            trans_pct = sum(1 for yy in range(fh2) for xx in range(fw2) if px[xx,yy][3]==0) / (fw2*fh2) * 100
            print(f"  ✓ {fname}: {frame.size[0]}x{frame.size[1]} ({size_kb:.1f}KB, 透明{trans_pct:.0f}%)")
    
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
    
    print(f"\n✅ 完成! 共 {total} 帧 -> {OUTPUT_FINAL}/")


if __name__ == "__main__":
    main()
