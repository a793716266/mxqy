#!/usr/bin/env python3
"""
李小宝动画素材处理 v8 - 连通区域分析(CCA)去背

v7问题的根因:
  Flood Fill + 饱和保护存在根本矛盾:
  - 保护阈值太高 → 特效帧95%+被锁死, 背景清不掉
  - 保护阈值太低 → 角色暗部(紫袍阴影等)被FF误删
  - 回退机制导致正常帧(idle)也被误判退化

v8方案: 抛弃FF+保护范式, 改用三阶段:
  P0 - 网格线切除(同v7)
  P1 - 保守全局筛选(同v7): 只删极确定的纯灰背景
  P2 - 连通区域分析(CCA):
        对所有残留像素做BFS连通分量标记
        计算每个连通区的"色彩分数"(区内高饱和像素占比)
        分数低于阈值 → 判为残留背景/灰色噪点, 整区删除
        分数高于阈值 → 判为角色/特效内容, 完整保留
  这种方法的优点: 以"区域"为单位决策, 不是逐像素,
                   即使区域内有少量灰色像素(衣服暗部), 只要区内有足够色彩就全保留
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

# ====== P0: 网格线参数 ======
GRID_BRIGHT_MIN = 140
GRID_SAT_MAX = 25

# ====== P1: 保守筛选参数 ======
P1_CHROMA_MAX = 16      # RGB通道最大差值
P1_BRIGHT_MIN = 40
P1_BRIGHT_MAX = 220

# ====== P2: CCA参数 ======
CCA_MIN_AREA = 8          # 最小连通区面积(小于此的直接删,视为噪点)
CCA_SAT_THRESHOLD = 20    # 高饱和判定线
CCA_COLOR_RATIO = 0.06    # 区内>此比例的高饱和像素 → 判定为"有色彩"→保留
                          # 即一个200px的连通区只要有12个以上有色像素就保留

# 水印
WM_W, WM_H = 50, 45


def get_sat(r, g, b):
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx == 0:
        return 0
    return int((mx - mn) * 255 / mx)


def get_bright(r, g, b):
    return (int(r) + int(g) + int(b)) // 3


# ==================== P0: 网格线切除 ====================
def phase0_cut_grid(frame):
    px = frame.load()
    w, h = frame.size
    cut = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            if get_bright(r, g, b) >= GRID_BRIGHT_MIN and get_sat(r, g, b) <= GRID_SAT_MAX:
                px[x, y] = (0, 0, 0, 0)
                cut += 1
    pct = cut / (w * h) * 100
    if cut > 100:
        print(f"      [P0] 网格线: -{cut}px ({pct:.1f}%)")
    return frame


# ==================== P1: 保守筛选 ====================
def phase1_conservative(frame):
    px = frame.load()
    w, h = frame.size
    rm = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            ri, gi, bi = int(r), int(g), int(b)
            chroma = max(abs(ri-gi), abs(gi-bi), abs(ri-bi))
            br = get_bright(r, g, b)
            if chroma <= P1_CHROMA_MAX and P1_BRIGHT_MIN <= br <= P1_BRIGHT_MAX:
                px[x, y] = (0, 0, 0, 0)
                rm += 1
    pct = rm / (w * h) * 100
    print(f"      [P1] 保守筛选: -{rm}px ({pct:.1f}%)")
    return frame


# ==================== P2: 连通区域分析 ====================
def phase2_cca(frame):
    """
    对P1后的残留像素做连通区域分析:
    1. BFS标记所有4-连通区域
    2. 对每区计算色彩分数
    3. 删除"无色彩"区域(残留背景)
    """
    px = frame.load()
    w, h = frame.size
    visited = [[False] * w for _ in range(h)]

    # 收集所有非透明像素作为种子
    seeds = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 20:
                seeds.append((x, y))

    if not seeds:
        return frame, 0

    # BFS标记所有连通区域
    regions = []  # list of [(x,y), ...]

    for sx, sy in seeds:
        if visited[sy][sx]:
            continue
        # 新区域
        region = []
        q = deque([(sx, sy)])
        visited[sy][sx] = True
        while q:
            x, y = q.popleft()
            region.append((x, y))
            for dx, dy in ((-1,0),(1,0),(0,-1),(0,1)):
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                    if px[nx, ny][3] > 20:
                        visited[ny][nx] = True
                        q.append((nx, ny))
        regions.append(region)

    # 分析每个区域
    kept_regions = 0
    removed_pixels = 0
    removed_regions = 0

    for region in regions:
        area = len(region)

        # 太小的区域直接删除(噪点)
        if area < CCA_MIN_AREA:
            for x, y in region:
                px[x, y] = (0, 0, 0, 0)
            removed_pixels += area
            removed_regions += 1
            continue

        # 计算色彩分数: 高饱和像素占比
        colored = 0
        for x, y in region:
            r, g, b, _a = px[x, y]
            if get_sat(r, g, b) > CCA_SAT_THRESHOLD:
                colored += 1

        ratio = colored / area

        if ratio < CCA_COLOR_RATIO and area > CCA_MIN_AREA * 2:
            # 区域较大但几乎没有色彩 → 残留背景, 删除
            for x, y in region:
                px[x, y] = (0, 0, 0, 0)
            removed_pixels += area
            removed_regions += 1
        else:
            kept_regions += 1

    total_reg = len(regions)
    print(f"      [P2] CCA: {total_reg}个区域, "
          f"保留{kept_regions}, 删除{removed_regions}({removed_pixels}px)")

    return frame, removed_pixels


# ==================== 水印 & 裁剪 ====================
def clear_wm(frame):
    px = frame.load()
    ww, wh = min(WM_W, frame.size[0]), min(WM_H, frame.size[1])
    c = 0
    for y in range(wh):
        for x in range(ww):
            if px[x, y][3] > 10:
                px[x, y] = (0, 0, 0, 0)
                c += 1
    if c:
        print(f"      水印: -{c}px")
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


# ==================== 主流程 ====================
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

            frame = phase0_cut_grid(frame)     # 切网格
            frame = phase1_conservative(frame)  # 粗筛背景
            frame, cca_rm = phase2_cca(frame)  # CCA精修
            frame = clear_wm(frame)             # 水印
            frame = trim_resize(frame, max_h)   # 裁缩

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
