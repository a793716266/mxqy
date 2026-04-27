#!/usr/bin/env python3
"""
李小宝动画素材处理 v11 - HSV色相精确定位绿幕去背

核心发现(通过HSV分析):
  - 绿色背景: H = 94-107° (集中在99°附近), 高饱和, 亮度适中
  - 角色紫袍: H = 270-280° (紫色)
  - 角色/金边/肤色: H = 0-60° (暖色)
  → 背景和角色在色相上完全无重叠! 用H值检测可实现零误删

三阶段:
  P0 - 去网格线(白色/浅灰低饱和)
  P1 - HSV绿幕筛: H在绿色范围 + 合理的S/L → 删
  P2 - 形态学扩展: 捕获边缘1px抗锯齿残留
  WM - 清水印
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
# P0 网格线
GRID_BRIGHT_MIN = 130
GRID_SAT_MAX = 35

# P1 HSV绿幕检测
# 背景实测 H=94-107° (中心~99°)
# 扩展到 70-155° 以覆盖所有绿色变体(含抗锯齿混合)
H_GREEN_MIN = 70       # 绿色H下限 (黄绿边界)
H_GREEN_MAX = 155      # 绿色H上限 (青绿边界)
S_GREEN_MIN = 0.08     # 最小饱和度 (排除灰白)
L_GREEN_MIN = 0.08     # 最小亮度 (排除近黑)
L_GREEN_MAX = 0.92     # 最大亮度 (保留极亮像素, 可能是高光)

# 保护: 如果像素太亮(L>0.88) 且饱和度低(S<0.15), 可能是白色高光/反光
PROTECT_BRIGHT_MAX = 0.88
PROTECT_SAT_FOR_BRIGHT = 0.15

# P2 形态学扩展
EXPAND_RADIUS = 1      # 扩展1px捕获抗锯齿
# 扩展时: 只删除"偏绿"的邻居 (H在更宽范围 或 G通道明显偏高)
EXPAND_H_MIN = 55
EXPAND_H_MAX = 165
EXPAND_S_MIN = 0.05    # 扩展时降低饱和度门槛

# 水印
WM_PCT = 0.18


def rgb_to_hsl(r, g, b):
    """RGB(0-255) -> H(0-360), S(0-1), L(0-1)"""
    h, l, s = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
    return h * 360, s, l


def is_green_pixel(r, g, b, a):
    """
    判断像素是否为绿色背景
    使用HSV色相作为主要判定依据
    """
    if a < 15:
        return False
    
    h, s, l = rgb_to_hsl(r, g, b)
    
    # 必须在绿色H范围内
    if not (H_GREEN_MIN <= h <= H_GREEN_MAX):
        return False
    
    # 饱和度和亮度检查
    if s < S_GREEN_MIN or l < L_GREEN_MIN or l > L_GREEN_MAX:
        return False
    
    # 保护: 极亮的低饱和像素 (可能是反光/高光)
    if l > PROTECT_BRIGHT_MAX and s < PROTECT_SAT_FOR_BRIGHT:
        return False
    
    return True


def is_greenish_for_expand(r, g, b, a):
    """扩展阶段用的宽松绿色判定"""
    if a < 15:
        return False
    h, s, l = rgb_to_hsl(r, g, b)
    if EXPAND_H_MIN <= h <= EXPAND_H_MAX and s >= EXPAND_S_MIN:
        return True
    # 额外: G通道显著偏高的情况
    if a > 30 and g > 80 and g > r + 10 and g > b + 10:
        bright = (r + g + b) / 3
        if 40 < bright < 180:
            return True
    return False


def phase0_grid(frame):
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
        print(f"      [P0] 网格: -{c}px ({c/(w*h)*100:.1f}%)")
    return frame


def phase1_hsv_green(frame):
    """使用HSV色相精确检测并删除绿色背景"""
    px = frame.load()
    w, h = frame.size
    rm = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_green_pixel(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
                rm += 1
    pct = rm / (w * h) * 100
    print(f"      [P1] HSV绿幕(H={H_GREEN_MIN}-{H_GREEN_MAX}°): -{rm}px ({pct:.1f}%)")
    return frame


def phase2_morphExpand(frame):
    """
    形态学扩展: 对已删除的绿色区域, 检查其邻居
    如果邻居也是"偏绿"的, 也删除 (捕获抗锯齿边缘)
    """
    px = frame.load()
    w, h = frame.size
    
    # 标记已删除的位置
    removed = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                removed[y][x] = True
    
    rm = 0
    to_remove = []
    
    for y in range(h):
        for x in range(w):
            if removed[y][x]:
                continue
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            
            # 检查4邻域是否有已删除的像素
            has_removed_neighbor = False
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and removed[ny][nx]:
                    has_removed_neighbor = True
                    break
            
            if has_removed_neighbor and is_greenish_for_expand(r, g, b, a):
                to_remove.append((x, y))
    
    for x, y in to_remove:
        px[x, y] = (0, 0, 0, 0)
        rm += 1
    
    if rm > 0:
        print(f"      [P2] 形态扩展: -{rm}px")
    
    # 第二轮扩展: 更激进, 处理角落
    rm2 = 0
    to_remove2 = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            
            # 检查8邻域
            near_count = 0
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        near_count += 1
            
            # 如果周围大部分已被删除, 且自身偏绿
            if near_count >= 3 and is_greenish_for_expand(r, g, b, a):
                to_remove2.append((x, y))
    
    for x, y in to_remove2:
        px[x, y] = (0, 0, 0, 0)
        rm2 += 1
    
    if rm2 > 0:
        print(f"      [P2] 二次扩展: -{rm2}px")
    
    return frame


def clear_wm(frame):
    px = frame.load()
    w, h = frame.size
    ww, wh = int(w * WM_PCT), int(h * WM_PCT)
    c = 0
    # 右下
    for y in range(h - wh, h):
        for x in range(w - ww, w):
            if px[x, y][3] > 10:
                px[x, y] = (0, 0, 0, 0)
                c += 1
    # 左上(帧编号区域)
    w2, h2 = min(45, w), min(40, h)
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
            frame = phase1_hsv_green(frame)
            frame = phase2_morphExpand(frame)
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
