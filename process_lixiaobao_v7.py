#!/usr/bin/env python3
"""
李小宝动画素材处理 v7 - 三阶段智能去背

v6问题:
  1) 有网格线的图(walk/cast_lightning等), FF只清除9-13%, 网格线阻断扩散
  2) 高饱和特效帧(cast_ice绿光/cast_lightning紫电), 98%像素被误保护

v7方案:
  阶段0 - 网格线切除: 检测高亮低饱和的网格线像素, 直接置零(打通FF通路)
  阶段1 - 保守全局筛: 只删"非常确定"的背景(RGB极接近+灰度范围窄),
          用极严阈值确保不碰角色任何部分
  阶段2 - 多轮Flood Fill: 从边缘扩散清除残留背景
  特效保护: 只保护"极高饱和度"像素(>55), 中等饱和度的角色衣服正常处理
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

# ====== P0: 网格线检测参数 ======
GRID_BRIGHTNESS_MIN = 140    # 网格线最低亮度(avg RGB)
GRID_SATURATION_MAX = 25     # 网格线最大饱和度(灰白色)
GRID_LINE_THICKNESS = 3      # 检测到后扩展的宽度

# ====== P1: 保守全局筛参数 ======
# 只删除"极度确定的背景": RGB三通道差<15 且亮度在40-220之间
P1_CHROMA_MAX = 16           # RGB通道最大差值(非常灰)
P1_BRIGHT_MIN = 40           # 最暗可判背景
P1_BRIGHT_MAX = 220          # 最亮可判背景(含网格残留)

# ====== Flood Fill参数 ======
FF_TOLERANCE = 50            # 欧氏距离阈值
HARD_PROTECT_SAT = 60        # 极高饱和度保护线(只保护最鲜艳的特效)
FALLBACK_BG = (58, 58, 58)   # 已知深灰背景色(当采样失败时回退)
FALLBACK_SAT_MAX = 40        # 采样色饱和度>此值则判定为"采到特效"，启用回退

# 水印
WM_W, WM_H = 50, 45


def get_saturation(r, g, b):
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx == 0:
        return 0
    return int((mx - mn) * 255 / mx)


def get_brightness(r, g, b):
    return (int(r) + int(g) + int(b)) // 3


def phase0_cut_grid_lines(frame):
    """
    阶段0: 检测并切除白色/浅灰网格线
    网格线特征: 高亮度(>140) + 低饱和度(<25)
    切除后Flood Fill能穿透到内部背景
    """
    pixels = frame.load()
    w, h = frame.size
    cut = 0

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 20:
                continue
            bright = get_brightness(r, g, b)
            sat = get_saturation(r, g, b)
            if bright >= GRID_BRIGHTNESS_MIN and sat <= GRID_SATURATION_MAX:
                pixels[x, y] = (0, 0, 0, 0)
                cut += 1

    pct = cut / (w * h) * 100 if w * h > 0 else 0
    if cut > 100:
        print(f"      [P0] 网格线切除: {cut}px ({pct:.1f}%)")
    return frame


def phase1_conservative_filter(frame):
    """
    阶段1: 超保守全局筛选
    只删除RGB三通道极度接近(<16) 且在亮度范围[40,220]内的像素
    这只会命中纯灰/近纯灰的背景，不会碰角色
    """
    pixels = frame.load()
    w, h = frame.size
    removed = 0

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 20:
                continue
            ri, gi, bi = int(r), int(g), int(b)
            chroma = max(abs(ri - gi), abs(gi - bi), abs(ri - bi))
            bright = get_brightness(r, g, b)
            if chroma <= P1_CHROMA_MAX and P1_BRIGHT_MIN <= bright <= P1_BRIGHT_MAX:
                pixels[x, y] = (0, 0, 0, 0)
                removed += 1

    pct = removed / (w * h) * 100 if w * h > 0 else 0
    print(f"      [P1] 保守筛选: {removed}px ({pct:.1f}%)")
    return frame


def build_hard_protect_mask(frame):
    """
    只保护极高饱和度的像素(>60)，防止最鲜艳的特效被删
    角色普通部位(中等饱和度)不保护，交给FF处理
    """
    pixels = frame.load()
    w, h = frame.size
    mask = [[False] * w for _ in range(h)]
    count = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a > 20 and get_saturation(r, g, b) > HARD_PROTECT_SAT:
                mask[y][x] = True
                count += 1
    total = w * h
    pct = count / total * 100 if total > 0 else 0
    if count > 50:
        print(f"      硬保护掩码: {count}px ({pct:.1f}%)")
    return mask


def sample_bg_colors(img, n=3):
    """从图像边缘采样n个代表性背景色"""
    pixels = img.load()
    w, h = img.size
    sw, sh = min(12, w), min(12, h)

    samples = []
    for x in range(0, w, max(1, w // 60)):
        for dy in range(sh):
            p = pixels[x, dy]
            if p[3] > 100:
                samples.append(p[:3])
        for dy in range(max(0, h - sh), h):
            p = pixels[x, dy]
            if p[3] > 100:
                samples.append(p[:3])
    for y in range(0, h, max(1, h // 60)):
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

    samples.sort(key=lambda c: sum(c))
    gs = len(samples) // n + 1
    reps = []
    for i in range(n):
        s = i * gs
        e = min(s + gs, len(samples))
        if s >= len(samples):
            break
        bucket = samples[s:e]
        if bucket:
            reps.append(tuple(sum(c) // len(bucket) for c in zip(*bucket)))
    return reps or [(60, 60, 60)]


def flood_fill(img, ref_color, tol, prot_mask):
    """BFS Flood Fill"""
    pixels = img.load()
    w, h = img.size
    vis = [[False] * w for _ in range(h)]

    def is_bg(x, y):
        if prot_mask[y][x]:
            return False
        r, g, b, _ = pixels[x, y]
        d = (abs(int(r)-ref_color[0])**2 + abs(int(g)-ref_color[1])**2 +
             abs(int(b)-ref_color[2])**2) ** 0.5
        return d < tol

    q = deque()
    for x in range(w):
        for dy in (0, h-1):
            if not vis[dy][x]:
                vis[dy][x] = True
                if pixels[x, dy][3] > 20 and is_bg(x, dy):
                    q.append((x, dy))
    for y in range(h):
        for dx in (0, w-1):
            if not vis[y][dx]:
                vis[y][dx] = True
                if pixels[dx, y][3] > 20 and is_bg(dx, y):
                    q.append((dx, y))

    rm = 0
    while q:
        x, y = q.popleft()
        if pixels[x, y][3] == 0:
            continue
        pixels[x, y] = (0, 0, 0, 0)
        rm += 1
        for dx, dy in ((-1,0),(1,0),(0,-1),(0,1)):
            nx, ny = x+dx, y+dy
            if 0 <= nx < w and 0 <= ny < h and not vis[ny][nx]:
                vis[ny][nx] = True
                if pixels[nx, ny][3] > 20 and is_bg(nx, ny):
                    q.append((nx, ny))
    return rm


def phase2_multi_ff(frame):
    """阶段2: 多轮Flood Fill + 采样失败回退机制"""
    prot_mask = build_hard_protect_mask(frame)
    bg_colors = sample_bg_colors(frame)

    # 回退检测: 如果采样色的平均饱和度太高, 说明采到的是特效而非背景
    avg_sat = 0
    valid_colors = []
    for c in bg_colors:
        sat = get_saturation(*c)
        avg_sat += sat
        if sat <= FALLBACK_SAT_MAX:
            valid_colors.append(c)
    avg_sat /= len(bg_colors) if bg_colors else 1

    if not valid_colors or avg_sat > FALLBACK_SAT_MAX:
        # 采样失效 → 使用已知背景色
        print(f"      采样失效(饱和度{avg_sat:.0f}>) → 回退到固定背景 {FALLBACK_BG}")
        bg_colors = [
            FALLBACK_BG,
            (FALLBACK_BG[0]+8, FALLBACK_BG[1]+8, FALLBACK_BG[2]+8),
            (FALLBACK_BG[0]+15, FALLBACK_BG[1]+15, FALLBACK_BG[2]+15),
        ]
        # 同时放宽保护: 特效帧中降低保护阈值避免全帧被锁死
        global HARD_PROTECT_SAT
        saved = HARD_PROTECT_SAT
        HARD_PROTECT_SAT = 75  # 临时放宽
        prot_mask = build_hard_protect_mask(frame)
        HARD_PROTECT_SAT = saved  # 恢复
    else:
        cstr = ", ".join(f"({c[0]},{c[1]},{c[2]})" for c in bg_colors)
        print(f"      采样背景: [{cstr}]")

    total = 0
    for bg in bg_colors:
        n = flood_fill(frame, bg, FF_TOLERANCE, prot_mask)
        total += n
        if n > 0:
            print(f"      FF({bg[0]},{bg[1]},{bg[2]}): -{n}px")
    return frame, total


def clear_watermark(frame):
    pixels = frame.load()
    ww, wh = min(WM_W, frame.size[0]), min(WM_H, frame.size[1])
    c = 0
    for y in range(wh):
        for x in range(ww):
            if pixels[x, y][3] > 10:
                pixels[x, y] = (0, 0, 0, 0)
                c += 1
    if c:
        print(f"      水印: -{c}px")
    return frame


def trim_and_resize(frame, max_h):
    bbox = frame.getbbox()
    if bbox:
        frame = frame.crop(bbox)
    w, h = frame.size
    if h == 0 or w == 0:
        return frame
    if h > max_h:
        s = max_h / h
        frame = frame.resize((int(w * s), max_h), Image.LANCZOS)
    pad = 4
    out = Image.new("RGBA", (frame.size[0]+pad*2, frame.size[1]+pad*2), (0,0,0,0))
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
            frame = img.crop((x, y, x+fw, y+fh))

            # P0: 切网格线
            frame = phase0_cut_grid_lines(frame)
            # P1: 保守筛选
            frame = phase1_conservative_filter(frame)
            # P2: 多轮FF
            frame, ff_rm = phase2_multi_ff(frame)
            # 水印
            frame = clear_watermark(frame)
            # 裁剪缩放
            frame = trim_and_resize(frame, max_h)

            idx += 1
            fname = f"{action_name}_{idx:02d}.png"
            fpath = os.path.join(out_dir, fname)
            frame.save(fpath, optimize=True)

            sz = os.path.getsize(fpath) / 1024
            px = frame.load()
            fw2, fh2 = frame.size
            trans = sum(1 for yy in range(fh2) for xx in range(fw2) if px[xx,yy][3]==0)
            pct = trans / (fw2*fh2) * 100
            print(f"  OK {fname}: {frame.size[0]}x{frame.size[1]} ({sz:.1f}KB, 透明{pct:.0f}%)")
    return idx


def main():
    os.makedirs(OUTPUT_FINAL, exist_ok=True)
    total = 0
    for sn, an, mh in SOURCES:
        p = os.path.join(SOURCE_DIR, sn)
        if os.path.exists(p):
            total += process_source(p, an, mh, OUTPUT_FINAL)
        else:
            print(f"  ! 未找到: {p}")
    print(f"\n  完成! 共 {total} 帧 -> {OUTPUT_FINAL}/")


if __name__ == "__main__":
    main()
