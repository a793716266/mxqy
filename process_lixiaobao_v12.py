#!/usr/bin/env python3
"""
李小宝动画素材处理 v12 - 保守精确版绿幕去背

v11的问题:
  - H范围70-155太宽, 删除了一些偏黄的特效边缘
  - P2形态学二次扩展太激进(3邻域+≥3邻居), 吃掉了角色边缘
  
v12改进:
  - H范围收紧到85-130(纯绿色核心区), 避免误删偏黄/偏青的特效
  - P2只用1px邻居的一次扩展(不做二次)
  - 提高饱和度门槛, 保护低饱和的灰白/肤色
  - 新增FF(flood fill)阶段: 从图像边缘向内扩散, 只删连通的背景区域
"""

import os
import colorsys
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
# P0 网格线 (白色/浅灰低饱和)
GRID_BRIGHT_MIN = 120
GRID_SAT_MAX = 30

# P1 HSV绿幕检测 - 收紧到纯绿色核心
# 背景实测 H≈99° (范围94-107), 扩展到78-138留余量但不碰黄/青
# v12.1: H下限从82降到78, 覆盖火球光晕的黄绿混合色(H=70-82)
# 安全余量: 金边H≈40-60, 火焰H≈15-40, 不会误删
H_GREEN_MIN = 78       # 下限(覆盖火球光晕黄绿H=70-82, 远离金边H<65)
H_GREEN_MAX = 138      # 上限(避免青绿色 H>138 可能是冰/水特效)
S_GREEN_MIN = 0.12     # 最小饱和度 (排除更多灰色/抗锯齿)
L_GREEN_MIN = 0.10     # 最小亮度
L_GREEN_MAX = 0.78     # 最大亮度 (保留亮色区域)

# 保护规则:
# 1. 极亮的低饱和像素 → 保护 (可能是白色高光/反光/文字)
PROTECT_L_MAX = 0.82
PROTECT_S_FOR_BRIGHT = 0.18

# 2. 偏暖色(R>G+20)即使在绿色H范围内也保护 (可能是金边/肤色/火光)
PROTECT_WARM_R_DIFF = 20

# P2 轻量形态学扩展 - 只做1px邻居一次扩展
EXPAND_H_MIN = 78      # 略宽于P1用于边缘捕获
EXPAND_H_MAX = 138
EXPAND_S_MIN = 0.08    # 低饱和也抓
EXPAND_G_DOMINANCE = True  # 要求G通道显著偏高才扩展删除

# P3 Flood Fill - 从边缘向内扩散删除连通背景
FF_TOLERANCE_RGB = 45   # RGB欧氏距离容差
FF_MAX_DIST = 99999     # 不限制距离(删所有连通区域)

# 水印
WM_PCT = 0.18


def rgb_to_hsl(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
    return h * 360, s, l


def is_green_bg_strict(r, g, b, a):
    """P1严格绿色判定 - 只删确定的绿色背景"""
    if a < 15:
        return False
    h, s, l = rgb_to_hsl(r, g, b)

    if not (H_GREEN_MIN <= h <= H_GREEN_MAX):
        return False
    if s < S_GREEN_MIN or l < L_GREEN_MIN or l > L_GREEN_MAX:
        return False

    # 保护极亮低饱和
    if l > PROTECT_L_MAX and s < PROTECT_S_FOR_BRIGHT:
        return False

    # 保护暖色(金边/火光/肤色)
    if r > g + PROTECT_WARM_R_DIFF and r >= b:
        return False

    return True


def is_expandable(r, g, b, a):
    """P2扩展判定 - 更宽松但仍安全"""
    if a < 15:
        return False
    h, s, l = rgb_to_hsl(r, g, b)

    # 方法1: H在绿色附近
    if EXPAND_H_MIN <= h <= EXPAND_H_MAX and s >= EXPAND_S_MIN:
        # 但仍要排除明显非绿的
        if not (r > g + PROTECT_WARM_R_DIFF + 10 and r >= b):  # 不删暖色
            return True

    # 方法2: G通道显著偏高 (补充捕获)
    if EXPAND_G_DOMINANCE and a > 25:
        if g > 75 and g > r + 8 and g > b + 8:
            bright = (r + g + b) / 3
            if 35 < bright < 170:
                # 排除紫色(B>>R且B>G)
                if not (b > r + 15 and b > g):
                    return True

    return False


def phase0_grid(frame):
    """去除网格线(浅灰/白色)"""
    px = frame.load()
    w, h = frame.size
    c = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            br = (int(r) + int(g) + int(b)) // 3
            mx, mn = max(r, g, b), min(r, g, b)
            sat = int((mx - mn) * 255 / mx) if mx else 0
            if br >= GRID_BRIGHT_MIN and sat <= GRID_SAT_MAX:
                px[x, y] = (0, 0, 0, 0)
                c += 1
    if c > 50:
        print(f"      [P0] 网格线: -{c}px ({c/(w*h)*100:.1f}%)")
    return frame


def phase1_hsv_strict(frame):
    """严格HSV绿色判定 - 只删确定的绿色背景"""
    px = frame.load()
    w, h = frame.size
    rm = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_green_bg_strict(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
                rm += 1
    pct = rm / (w * h) * 100
    print(f"      [P1] HSV严格(H={H_GREEN_MIN}-{H_GREEN_MAX}°,S>{S_GREEN_MIN}): -{rm}px ({pct:.1f}%)")
    return frame


def phase2_morph_gentle(frame):
    """
    轻量形态学扩展: 只对已删除像素的4-邻居做一次扩展
    条件: 像素本身也是"偏绿"的
    不做二次扩展, 不过度侵蚀角色
    """
    px = frame.load()
    w, h = frame.size

    to_remove = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            r, g, b, a = px[x, y]
            if a < 20:
                continue

            # 检查4邻域是否有已删除像素
            has_deleted_nbr = False
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    has_deleted_nbr = True
                    break

            if has_deleted_nbr and is_expandable(r, g, b, a):
                to_remove.append((x, y))

    rm = 0
    for x, y in to_remove:
        px[x, y] = (0, 0, 0, 0)
        rm += 1

    if rm > 0:
        print(f"      [P2] 轻量扩展: -{rm}px")
    return frame


def phase3_floodfill(frame):
    """
    Flood Fill精修: 从图像四边开始, 向内扩散删除与边缘背景色相似的区域
    这能清除大片的背景而不触碰孤岛状的角色
    """
    px = frame.load()
    w, h = frame.size

    # 采样边缘像素找背景色(选最"绿"的样本)
    edge_samples = []
    sample_margin = min(8, w // 4, h // 4)
    
    # 上边和下边
    for x in range(0, w, max(1, w // 32)):
        for dy in [sample_margin, h - 1 - sample_margin]:
            if 0 <= dy < h:
                p = px[x, dy]
                if p[3] > 50:
                    edge_samples.append(p[:3])
    # 左边和右边
    for y in range(0, h, max(1, h // 32)):
        for dx in [sample_margin, w - 1 - sample_margin]:
            if 0 <= dx < w:
                p = px[dx, y]
                if p[3] > 50:
                    edge_samples.append(p[:3])

    if not edge_samples:
        return frame, 0

    # 选G通道最高的作为参考背景色
    edge_samples.sort(key=lambda c: c[1], reverse=True)
    bg_ref = tuple(sum(c) // len(edge_samples[:15]) for c in zip(*edge_samples[:15]))

    vis = [[False] * w for _ in range(h)]

    def is_similar_to_bg(x, y):
        r, g, b, a = px[x, y]
        if a < 25:
            return True  # 已经透明的也算可通行
        d = ((int(r) - bg_ref[0]) ** 2 + (int(g) - bg_ref[1]) ** 2 + (int(b) - bg_ref[2]) ** 2) ** 0.5
        return d < FF_TOLERANCE_RGB

    q = deque()
    # 从四边入队
    for x in range(w):
        for dy in (0, h - 1):
            if not vis[dy][x]:
                vis[dy][x] = True
                if px[x, dy][3] > 20 and is_similar_to_bg(x, dy):
                    q.append((x, dy))
    for y in range(h):
        for dx in (0, w - 1):
            if not vis[y][dx]:
                vis[y][dx] = True
                if px[dx, y][3] > 20 and is_similar_to_bg(dx, y):
                    q.append((dx, y))

    rm = 0
    while q:
        cx, cy = q.popleft()
        if px[cx, cy][3] == 0:
            continue
        px[cx, cy] = (0, 0, 0, 0)
        rm += 1
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and not vis[ny][nx]:
                vis[ny][nx] = True
                if px[nx, ny][3] > 20 and is_similar_to_bg(nx, ny):
                    q.append((nx, ny))

    if rm > 5:
        print(f"      [P3] FloodFill(bg={bg_ref},tol={FF_TOLERANCE_RGB}): -{rm}px")
    return frame, rm


def phase4_isolated_green(frame, action_name=""):
    """
    P4: 孤立绿色像素清除 + 火球颜色偏移
    
    阶段A - 邻域孤立检测: 周围大部分透明 -> 背景残留, 删除
    阶段B - G通道优势度检测: G比R/B高出很多 -> 绿残留, 删除  
    阶段C - 火球颜色偏移(仅cast_fireball): 残留绿向橙色偏移, 保留光晕
    """
    px = frame.load()
    w, h = frame.size
    
    ISO_H_MIN_A = 55
    ISO_H_MAX_A = 148
    ISO_S_MIN_A = 0.08
    ISO_RADIUS_A = 2
    ISO_TRANS_THRESH_A = 0.55
    
    ISO_H_MIN_B = 50
    ISO_H_MAX_B = 88
    ISO_S_MIN_B = 0.06
    ISO_G_DOMINANCE = 12
    ISO_L_MAX_B = 0.85
    
    FIRE_SHIFT_H_MIN = 50
    FIRE_SHIFT_H_MAX = 95
    FIRE_SHIFT_S_MIN = 0.05
    FIRE_G_DOM_MIN = 5
    
    to_remove = set()
    to_shift = set()
    
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 25:
                continue
            
            hv, s, l = colorsys.rgb_to_hls(r/255.0, g/255.0, b/255.0)
            hd = hv * 360
            
            if l > 0.88:
                continue
            
            # --- A ---
            if ISO_H_MIN_A <= hd <= ISO_H_MAX_A and s >= ISO_S_MIN_A:
                transp_nbr, total_nbr = 0, 0
                for dy in range(-ISO_RADIUS_A, ISO_RADIUS_A + 1):
                    for dx in range(-ISO_RADIUS_A, ISO_RADIUS_A + 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            total_nbr += 1
                            if px[nx, ny][3] < 20:
                                transp_nbr += 1
                
                if total_nbr > 0 and transp_nbr / total_nbr >= ISO_TRANS_THRESH_A:
                    to_remove.add((x, y))
                    continue
            
            # --- B ---
            if ISO_H_MIN_B <= hd <= ISO_H_MAX_B and s >= ISO_S_MIN_B and l <= ISO_L_MAX_B:
                g_dom = int(g) - max(int(r), int(b))
                if g_dom >= ISO_G_DOMINANCE:
                    to_remove.add((x, y))
                    continue
            
            # --- C: 火球颜色偏移 ---
            if action_name == "cast_fireball":
                if FIRE_SHIFT_H_MIN <= hd <= FIRE_SHIFT_H_MAX and s >= FIRE_SHIFT_S_MIN:
                    g_dom = int(g) - max(int(r), int(b))
                    if g_dom >= FIRE_G_DOM_MIN and l > 0.06:
                        to_shift.add((x, y))
    
    rm = 0
    for x, y in to_remove:
        px[x, y] = (0, 0, 0, 0)
        rm += 1
    
    shift_cnt = 0
    for x, y in to_shift:
        r, g, b, a = px[x, y]
        r2 = min(255, int(r) + 55)
        g2 = max(0, int(g) - 30)
        b2 = max(0, int(b) - 8)
        px[x, y] = (r2, g2, b2, a)
        shift_cnt += 1
    
    parts = []
    if rm > 10:
        parts.append(f"A+B:-{rm}px")
    if shift_cnt > 10:
        parts.append(f"C偏移:{shift_cnt}px")
    
    if parts:
        print(f"      [P4] 孤立绿清除({', '.join(parts)})")
    return frame


def clear_wm(frame):
    px = frame.load()
    w, h = frame.size
    ww, wh = int(w * WM_PCT), int(h * WM_PCT)
    c = 0
    # 右下角水印
    for y in range(h - wh, h):
        for x in range(w - ww, w):
            if px[x, y][3] > 10:
                px[x, y] = (0, 0, 0, 0)
                c += 1
    # 左上角帧编号
    w2, h2 = min(45, w), min(40, h)
    for y in range(h2):
        for x in range(w2):
            if px[x, y][3] > 10:
                px[x, y] = (0, 0, 0, 0)
                c += 1
    if c:
        print(f"      [WM] 水印/帧号: -{c}px")
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
        frame = frame.resize((int(w * s), max_h), Image.LANCZOS)
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

            frame = phase0_grid(frame)
            frame = phase1_hsv_strict(frame)
            frame = phase2_morph_gentle(frame)
            frame, _ = phase3_floodfill(frame)
            frame = phase4_isolated_green(frame, action_name=action_name)
            frame = clear_wm(frame)
            frame = trim_resize(frame, max_h)

            idx += 1
            fname = f"{action_name}_{idx:02d}.png"
            fpath = os.path.join(out_dir, fname)
            frame.save(fpath, optimize=True)

            sz = os.path.getsize(fpath) / 1024
            px = frame.load()
            fw2, fh2 = frame.size
            trans = sum(1 for yy in range(fh2) for xx in range(fw2) if px[xx, yy][3] == 0)
            pct = trans / (fw2 * fh2) * 100
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
