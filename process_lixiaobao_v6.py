#!/usr/bin/env python3
"""
李小宝动画素材处理 v6 - 饱和保护 + 多轮Flood Fill

v5问题: P1全局阈值(SATURATION_MAX=35)太激进,
       角色暗部(紫袍阴影RGB~60,50,90, 棕色镶边等)饱和度<35被误删为背景
v6方案: 
  - 完全摒弃全局阈值扫描(根因修复)
  - 预建饱和度保护掩码(高饱和度+色彩差异大的像素标记为受保护)
  - 多轮BFS Flood Fill: 采样深灰/中灰/浅灰三个背景色分别扩散
  - 网格线(白色)会被浅色FF轮次自动清除
  - 受保护像素在任何轮次都不会被删除
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

# ====== 核心参数 ======
FF_TOLERANCE = 48          # Flood Fill欧氏距离阈值(放宽以覆盖更多背景变化)
SAT_PROTECT = 22           # 饱和度保护线: >此值永不删除
CHROMA_PROTECT = 28        # RGB通道差保护: max差值>此值说明有色彩，需保护
BG_GROUPS = 3              # 背景色采样分组数(深/中/浅)

# 水印区域
WM_W, WM_H = 50, 45


def get_saturation(r, g, b):
    """色彩饱和度 0=灰 255=高饱和"""
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx == 0:
        return 0
    return int((mx - mn) * 255 / mx)


def should_protect(r, g, b):
    """判断像素是否需要保护(角色内容，不可删除)"""
    sat = get_saturation(r, g, b)
    if sat > SAT_PROTECT:
        return True
    # 色彩差异保护
    rg = abs(int(r) - int(g))
    gb = abs(int(g) - int(b))
    rb = abs(int(r) - int(b))
    if max(rg, gb, rb) > CHROMA_PROTECT:
        return True
    return False


def build_protection_mask(img):
    """预扫描整帧，构建饱和度保护掩码"""
    pixels = img.load()
    w, h = img.size
    mask = [[False] * w for _ in range(h)]
    count = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a > 20 and should_protect(r, g, b):
                mask[y][x] = True
                count += 1
    total = w * h
    pct = count / total * 100
    print(f"      保护掩码: {count}/{total} ({pct:.1f}%)")
    return mask


def sample_bg_colors(img, n_groups=BG_GROUPS):
    """从图像边缘采样n_groups个代表性背景色"""
    pixels = img.load()
    w, h = img.size
    sw = min(10, w)
    sh = min(10, h)

    samples = []
    # 四边密集采样
    for x in range(0, w, max(1, w // 50)):
        for dy in range(sh):
            p = pixels[x, dy]
            if p[3] > 100:
                samples.append(p[:3])
        for dy in range(max(0, h - sh), h):
            p = pixels[x, dy]
            if p[3] > 100:
                samples.append(p[:3])
    for y in range(0, h, max(1, h // 50)):
        for dx in range(sw):
            p = pixels[dx, y]
            if p[3] > 100:
                samples.append(p[:3])
        for dx in range(max(0, w - sw), w):
            p = pixels[dx, y]
            if p[3] > 100:
                samples.append(p[:3])

    if not samples:
        return [(60, 60, 60)]

    # 按亮度排序后均分成n组，取每组的均值
    samples.sort(key=lambda c: sum(c))
    group_size = len(samples) // n_groups + 1
    reps = []
    for i in range(n_groups):
        start = i * group_size
        end = min(start + group_size, len(samples))
        if start >= len(samples):
            break
        bucket = samples[start:end]
        if bucket:
            reps.append(tuple(sum(c) // len(bucket) for c in zip(*bucket)))
    return reps if reps else [(60, 60, 60)]


def flood_fill(img, ref_color, tolerance, prot_mask):
    """
    单轮BFS Flood Fill: 从四边向内清除与ref_color接近且不受保护的像素
    返回本轮清除的像素数
    """
    pixels = img.load()
    w, h = img.size
    visited = [[False] * w for _ in range(h)]

    def is_background(x, y):
        if prot_mask[y][x]:          # 受保护 → 不是背景
            return False
        r, g, b, _a = pixels[x, y]
        dr = abs(int(r) - ref_color[0])
        dg = abs(int(g) - ref_color[1])
        db = abs(int(b) - ref_color[2])
        dist = (dr * dr + dg * dg + db * db) ** 0.5
        return dist < tolerance

    q = deque()
    # 四边入队
    for x in range(w):
        for dy in (0, h - 1):
            if not visited[dy][x]:
                visited[dy][x] = True
                if pixels[x, dy][3] > 20 and is_background(x, dy):
                    q.append((x, dy))
    for y in range(h):
        for dx in (0, w - 1):
            if not visited[y][dx]:
                visited[y][dx] = True
                if pixels[dx, y][3] > 20 and is_background(dx, y):
                    q.append((dx, y))

    removed = 0
    while q:
        x, y = q.popleft()
        if pixels[x, y][3] == 0:
            continue
        pixels[x, y] = (0, 0, 0, 0)
        removed += 1
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                visited[ny][nx] = True
                if pixels[nx, ny][3] > 20 and is_background(nx, ny):
                    q.append((nx, ny))

    return removed


def smart_remove_bg(frame):
    """智能去背: 保护掩码 + 多轮FF"""
    # 1) 构建保护掩码
    prot_mask = build_protection_mask(frame)

    # 2) 采样背景色
    bg_colors = sample_bg_colors(frame)
    color_str = ", ".join(f"({c[0]},{c[1]},{c[2]})" for c in bg_colors)
    print(f"      采样背景色: [{color_str}]")

    # 3) 多轮Flood Fill
    total = 0
    for bg in bg_colors:
        n = flood_fill(frame, bg, FF_TOLERANCE, prot_mask)
        total += n
        if n > 0:
            print(f"      FF({bg[0]},{bg[1]},{bg[2]}): -{n}px")

    return frame, total


def clear_watermark(frame):
    """清除左上角水印"""
    pixels = frame.load()
    wm_w = min(WM_W, frame.size[0])
    wm_h = min(WM_H, frame.size[1])
    c = 0
    for y in range(wm_h):
        for x in range(wm_w):
            if pixels[x, y][3] > 10:
                pixels[x, y] = (0, 0, 0, 0)
                c += 1
    if c:
        print(f"      水印: -{c}px")
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
        frame = frame.resize((int(w * scale), max_height), Image.LANCZOS)
    pad = 4
    out = Image.new("RGBA", (frame.size[0] + pad * 2, frame.size[1] + pad * 2), (0, 0, 0, 0))
    out.paste(frame, (pad, pad), frame)
    return out


def process_source(src_path, action_name, max_h, out_base):
    print(f"\n{'='*55}")
    print(f"  处理: {src_path} -> {action_name}")

    img = Image.open(src_path).convert("RGBA")
    w, h = img.size
    fw, fh = w // COLS, h // ROWS
    print(f"  源图: {w}x{h}, 单帧: {fw}x{fh}")

    out_dir = os.path.join(out_base, action_name)
    os.makedirs(out_dir, exist_ok=True)

    idx = 0
    for row in range(ROWS):
        for col in range(COLS):
            x, y = col * fw, row * fh
            frame = img.crop((x, y, x + fw, y + fh))

            frame, removed = smart_remove_bg(frame)
            frame = clear_watermark(frame)
            frame = trim_and_resize(frame, max_h)

            idx += 1
            fname = f"{action_name}_{idx:02d}.png"
            fpath = os.path.join(out_dir, fname)
            frame.save(fpath, optimize=True)

            size_kb = os.path.getsize(fpath) / 1024
            px = frame.load()
            fw2, fh2 = frame.size
            trans = sum(1 for yy in range(fh2) for xx in range(fw2) if px[xx, yy][3] == 0)
            pct = trans / (fw2 * fh2) * 100
            print(f"  OK {fname}: {frame.size[0]}x{frame.size[1]} ({size_kb:.1f}KB, 透明{pct:.0f}%)")

    return idx


def main():
    os.makedirs(OUTPUT_FINAL, exist_ok=True)
    total = 0
    for src_name, action_name, max_h in SOURCES:
        p = os.path.join(SOURCE_DIR, src_name)
        if os.path.exists(p):
            total += process_source(p, action_name, max_h, OUTPUT_FINAL)
        else:
            print(f"  ! 未找到: {p}")
    print(f"\n  全部完成! 共 {total} 帧 -> {OUTPUT_FINAL}/")


if __name__ == "__main__":
    main()
