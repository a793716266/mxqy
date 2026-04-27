#!/usr/bin/env python3
"""
李小宝动画素材处理 v10 - 基于通道比例的绿背景去背

背景实测数据: RGB(~62, ~121, ~37), 饱和度~176(极高)
核心区分特征:
  - 背景: G通道主导(G>>R 且 G>>B), G/(R+B) > 1.0, 亮度~73
  - 角色紫: B或R主导, G偏低
  - 冰/雷特效: 高饱和但RGB分布不同于纯背景

三阶段:
  P0 - 切网格线(白色/浅灰低饱和)
  P1 - 通道比例绿背景筛: G主导 + 亮度合理 → 删
  P2 - Flood Fill从边缘精修(用色彩保护防止误删角色)
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

# ====== 参数 ======
# P0 网格线
GRID_BRIGHT_MIN = 130
GRID_SAT_MAX = 35

# P1 绿背景 - 通道比例法
# 背景实测约 R=62,G=121,B=37
P1_GR_RATIO_MIN = 1.5     # G/R 最小比值 (背景约1.95)
P1_GB_RATIO_MIN = 2.0     # G/B 最小比值 (背景约3.27)
P1_BRIGHT_MIN = 40        # 亮度范围
P1_BRIGHT_MAX = 145
P1_G_ABS_MIN = 90         # G通道绝对值下限(确保是真的绿)

# P2 FF
FF_TOLERANCE = 50
FF_SAT_PROTECT = 100       # FF中保护的最低饱和度(低于此值的不保护,允许FF删除)

# 水印
WM_PCT = 0.18


def get_sat(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    return int((mx - mn) * 255 / mx) if mx else 0


def phase0_grid(frame):
    px = frame.load()
    w, h = frame.size
    c = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            br = (int(r)+int(g)+int(b)) // 3
            if br >= GRID_BRIGHT_MIN and get_sat(r, g, b) <= GRID_SAT_MAX:
                px[x, y] = (0, 0, 0, 0)
                c += 1
    if c > 50:
        print(f"      [P0] 网格: -{c}px ({c/(w*h)*100:.1f}%)")
    return frame


def phase1_green_ratio(frame):
    """基于通道比例检测并删除绿色背景"""
    px = frame.load()
    w, h = frame.size
    rm = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            ri, gi, bi = int(r), int(g), int(b)

            # 跳过非绿色像素(快速预筛选)
            if gi < P1_G_ABS_MIN:
                continue

            bright = (ri + gi + bi) // 3
            if not (P1_BRIGHT_MIN <= bright <= P1_BRIGHT_MAX):
                continue

            # 绿色主导检测
            if ri > 0 and bi > 0:
                gr_ratio = gi / ri   # G/R
                gb_ratio = gi / bi   # G/B
                if gr_ratio >= P1_GR_RATIO_MIN and gb_ratio >= P1_GB_RATIO_MIN:
                    px[x, y] = (0, 0, 0, 0)
                    rm += 1
            elif ri == 0 and bi == 0 and gi >= P1_G_ABS_MIN:
                # 纯绿色像素
                if P1_BRIGHT_MIN <= bright <= P1_BRIGHT_MAX:
                    px[x, y] = (0, 0, 0, 0)
                    rm += 1

    pct = rm / (w*h) * 100
    print(f"      [P1] 绿通道比: -{rm}px ({pct:.1f}%)")
    return frame


def phase2_ff(frame):
    """Flood Fill精修, 用饱和度>100作为保护(只保护最鲜艳的特效核心)"""
    px = frame.load()
    w, h = frame.size

    # 采样边缘背景色(优先选暗绿色)
    edge_samples = []
    sw, sh = min(12, w), min(12, h)
    for x in range(0, w, max(1, w//40)):
        for dy in range(sh):
            p = px[x, dy]
            if p[3] > 100:
                edge_samples.append(p[:3])
        for dy in range(max(0,h-sh), h):
            p = px[x, dy]
            if p[3] > 100:
                edge_samples.append(p[:3])

    if not edge_samples:
        return frame, 0

    # 取G通道最高的样本(最像绿色背景)
    edge_samples.sort(key=lambda c: c[1], reverse=True)
    top_green = edge_samples[:min(20, len(edge_samples))]
    bg = tuple(sum(c)//len(top_green) for c in zip(*top_green))

    vis = [[False]*w for _ in range(h)]

    def is_bg(x, y):
        r, g, b, _ = px[x, y]
        # 只保护极高饱和度
        if get_sat(r, g, b) > FF_SAT_PROTECT:
            return False
        d = (abs(int(r)-bg[0])**2+abs(int(g)-bg[1])**2+abs(int(b)-bg[2])**2)**0.5
        return d < FF_TOLERANCE

    q = deque()
    for x in range(w):
        for dy in (0, h-1):
            if not vis[dy][x]:
                vis[dy][x] = True
                if px[x, dy][3] > 20 and is_bg(x, dy):
                    q.append((x, dy))
    for y in range(h):
        for dx in (0, w-1):
            if not vis[y][dx]:
                vis[y][dx] = True
                if px[dx, y][3] > 20 and is_bg(dx, y):
                    q.append((dx, y))

    rm = 0
    while q:
        x, y = q.popleft()
        if px[x, y][3] == 0:
            continue
        px[x, y] = (0, 0, 0, 0)
        rm += 1
        for dx, dy in ((-1,0),(1,0),(0,-1),(0,1)):
            nx, ny = x+dx, y+dy
            if 0<=nx<w and 0<=ny<h and not vis[ny][nx]:
                vis[ny][nx] = True
                if px[nx, ny][3] > 20 and is_bg(nx, ny):
                    q.append((nx, ny))
    if rm > 0:
        print(f"      [P2] FF({bg[0]},{bg[1]},{bg[2]}): -{rm}px")
    return frame, rm


def clear_wm(frame):
    px = frame.load()
    w, h = frame.size
    ww, wh = int(w*WM_PCT), int(h*WM_PCT)
    c = 0
    # 右下
    for y in range(h-wh, h):
        for x in range(w-ww, w):
            if px[x, y][3] > 10:
                px[x, y] = (0, 0, 0, 0)
                c += 1
    # 左上
    w2, h2 = min(45,w), min(40,h)
    for y in range(h2):
        for x in range(w2):
            if px[x, y][3] > 10:
                px[x, y] = (0, 0, 0, 0)
                c += 1
    if c:
        print(f"      [WM] 水印: -{c}px")
    return frame


def trim_resize(frame, max_h):
    bbox = frame.getbbox()
    if bbox:
        frame = frame.crop(bbox)
    w, h = frame.size
    if h == 0 or w == 0:
        return frame
    if h > max_h:
        s = max_h / h
        frame = frame.resize((int(w*s), max_h), Image.LANCZOS)
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

            frame = phase0_grid(frame)
            frame = phase1_green_ratio(frame)
            frame, _ = phase2_ff(frame)
            frame = clear_wm(frame)
            frame = trim_resize(frame, max_h)

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
    print(f"\n  完成! 共 {total} 帧")


if __name__ == "__main__":
    main()
