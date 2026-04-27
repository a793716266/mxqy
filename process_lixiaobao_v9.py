#!/usr/bin/env python3
"""
李小宝动画素材处理 v9 - 专用绿幕去背

背景已换成绿色, 利用绿色通道 dominance 特征实现零误删去背:

  绿幕背景: G >> R 且 G >> B  (如 G=130, R=75, B=55)
  角色颜色全都不满足此条件:
    - 紫袍: B > R > G          → G最小, 安全
    - 金边: R > G > B          → R最大, 安全
    - 肤色: R > G ≈ B          → R最大, 安全
    - 宝石: B > R > G          → B最大, 安全
    - 冰特效: Cyan/白          → R≈G≈B 或 B偏大, 安全
    - 雷特效: 紫/品红          → R≈B > G, 安全

三阶段流程:
  P1 - 绿色Dominance粗筛: 一次性清除85%+绿幕
  P2 - Flood Fill精修: 从四边向内清除残留(穿透网格线)
  P3 - 水印清理
"""

import os
from PIL import Image
from collections import deque

SOURCE_DIR = "_source_backup/李小宝"
OUTPUT_FINAL = "subpackages/battle/images/characters_anim/transparent/lixiaobao"

SOURCES = [
    ("李小宝移动.png",        "walk",           200),
    ("李小宝待机动画.png",    "idle",           200),
    ("李小宝普通攻击.png",    "attack",         280),
    ("火球术释放动画.png",    "cast_fireball",  280),
    ("冰晶术释放动画.png",    "cast_ice",       280),
    ("法师雷击术释放动画.png","cast_lightning", 280),
]

COLS, ROWS = 4, 2

# ====== P1: 绿幕参数 ======
GREEN_OVER_R = 15    # G 必须比 R 高至少这么多
GREEN_OVER_B = 20    # G 必须比 B 高至少这么多
GREEN_MIN_G = 45     # G 通道最低门槛

# ====== P2: Flood Fill参数 ======
FF_TOLERANCE = 50     # RGB欧氏距离阈值
FF_TOLERANCE_LOOSE = 70  # 第二轮放宽阈值

# 水印区域 (右下角)
WM_W, WM_H = 50, 45


# ========== 工具函数 ==========

def is_green_dominant(r, g, b):
    """判断像素是否为绿幕: G显著高于R和B"""
    if g < GREEN_MIN_G:
        return False
    if g <= r + GREEN_OVER_R:
        return False
    if g <= b + GREEN_OVER_B:
        return False
    return True


def rgb_distance(c1, c2):
    """两色欧氏距离"""
    return ((c1[0]-c2[0])**2 + (c1[1]-c2[1])**2 + (c1[2]-c2[2])**2) ** 0.5


def get_sat(r, g, b):
    mx, mn = max(r,g,b), min(r,g,b)
    return int((mx-mn)*255/mx) if mx else 0


def get_brightness(r, g, b):
    return (int(r)+int(g)+int(b)) // 3


# ==================== P1: 绿幕粗筛 ====================
def phase1_green_screen(frame):
    """遍历所有像素, 用绿色dominance规则删除绿幕"""
    px = frame.load()
    w, h = frame.size
    rm = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            if is_green_dominant(r, g, b):
                px[x, y] = (0, 0, 0, 0)
                rm += 1
    pct = rm / (w*h) * 100
    print(f"      [P1] 绿幕粗筛: -{rm}px ({pct:.1f}%)")
    return frame


# ==================== P2: Flood Fill精修 ====================
def sample_edge_colors(frame):
    """从图片四边采集背景候选色, 返回去重后的列表"""
    px = frame.load()
    w, h = frame.size
    colors = []

    step_x = max(1, w // 30)
    step_y = max(1, h // 30)

    # 四边采样
    for x in range(0, w, step_x):
        if px[x, 0][3] > 20:
            colors.append(px[x, 0][:3])
        if px[x, h-1][3] > 20:
            colors.append(px[x, h-1][:3])
    for y in range(0, h, step_y):
        if px[0, y][3] > 20:
            colors.append(px[0, y][:3])
        if px[w-1, y][3] > 20:
            colors.append(px[w-1, y][:3])

    # 去重 (容差15以内视为同色)
    unique = []
    for c in colors:
        if not any(rgb_distance(c, u) < 15 for u in unique):
            unique.append(c)

    return unique


def make_protect_mask(frame):
    """
    构建保护掩码: 角色和特效像素标记为受保护
    保护条件(任一满足即保护):
      1. 高饱和度(>50) → 彩色特效/高光
      2. R显著大于G且R显著大于B → 红/橙/黄色系(金边/火)
      3. B显著大于G且B显著大于R → 蓝/紫色系(紫袍/冰/雷)
      4. 很亮(>210)且不绿 → 皮肤高光/白色特效
    """
    px = frame.load()
    w, h = frame.size
    mask = [[False]*w for _ in range(h)]

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            sat = get_sat(r, g, b)
            br = get_brightness(r, g, b)

            # 条件1: 高饱和
            if sat > 50:
                mask[y][x] = True
                continue
            # 条件2: 偏红/橙/黄
            if r > g + 25 and r > b + 15:
                mask[y][x] = True
                continue
            # 条件3: 偏蓝/紫
            if b > g + 25 and b > r + 15:
                mask[y][x] = True
                continue
            # 条件4: 亮且不绿
            if br > 210 and g < r and g < b:
                mask[y][x] = True
                continue

    return mask


def flood_fill(frame, target_color, tolerance, prot_mask):
    """从四边向内的BFS Flood Fill, 受保护的像素跳过"""
    px = frame.load()
    w, h = frame.size
    visited = [[False]*w for _ in range(h)]
    q = deque()
    rm = 0

    # 种子: 四边所有不透明像素
    for x in range(w):
        for y in (0, h-1):
            if px[x,y][3] > 20 and not visited[y][x]:
                visited[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w-1):
            if px[x,y][3] > 20 and not visited[y][x]:
                visited[y][x] = True
                q.append((x, y))

    while q:
        cx, cy = q.popleft()

        # 受保护则跳过(不删除,也不扩展)
        if prot_mask[cy][cx]:
            continue

        r, g, b, _a = px[cx, cy]
        dist = rgb_distance((r,g,b), target_color)
        if dist <= tolerance:
            px[cx, cy] = (0, 0, 0, 0)
            rm += 1
            for dx, dy in ((-1,0),(1,0),(0,-1),(0,1)):
                nx, ny = cx+dx, cy+dy
                if 0<=nx<w and 0<=ny<h and not visited[ny][nx]:
                    if px[nx,ny][3] > 20:
                        visited[ny][nx] = True
                        q.append((nx, ny))

    return rm


def phase2_floodfill(frame):
    """P2: 多轮Flood Fill精修"""
    bg_colors = sample_edge_colors(frame)
    prot_mask = make_protect_mask(frame)

    cstr = ", ".join(f"({c[0]},{c[1]},{c[2]})" for c in bg_colors)
    print(f"      [P2] 采样背景: [{cstr}]")

    total_rm = 0
    # 第一轮: 标准阈值
    for bg in bg_colors:
        n = flood_fill(frame, bg, FF_TOLERANCE, prot_mask)
        total_rm += n
        if n > 0:
            print(f"      [P2a] FF({bg[0]},{bg[1]},{bg[2]}): -{n}px")

    # 第二轮: 放宽阈值补刀
    for bg in bg_colors:
        n = flood_fill(frame, bg, FF_TOLERANCE_LOOSE, prot_mask)
        total_rm += n
        if n > 0:
            print(f"      [P2b] FF宽松({bg[0]},{bg[1]},{bg[2]}): -{n}px")

    return frame, total_rm


# ==================== P3: 水印 ====================
def clear_watermark(frame):
    """清除右下角水印区域"""
    px = frame.load()
    w, h = frame.size
    ww, wh = min(WM_W, w), min(WM_H, h)
    c = 0
    for y in(range(h - wh, h)):
        for x in(range(w - ww, w)):
            if px[x, y][3] > 10:
                px[x, y] = (0, 0, 0, 0)
                c += 1
    if c > 0:
        print(f"      [P3] 水印: -{c}px")
    return frame


# ==================== 裁剪缩放 ====================
def trim_and_resize(frame, max_h):
    """裁掉透明边距, 限制高度, 加4px padding"""
    bbox = frame.getbbox()
    if bbox:
        frame = frame.crop(bbox)
    w, h = frame.size
    if h == 0 or w == 0:
        return frame
    if h > max_h:
        scale = max_h / h
        nw = int(w * scale)
        frame = frame.resize((nw, max_h), Image.LANCZOS)
    # 加padding
    padded = Image.new("RGBA", (frame.size[0]+8, frame.size[1]+8), (0,0,0,0))
    padded.paste(frame, (4, 4), frame)
    return padded


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
            x0, y0 = col * fw, row * fh
            frame = img.crop((x0, y0, x0+fw, y0+fh))

            # 三阶段去背
            frame = phase1_green_screen(frame)       # P1: 绿幕粗筛
            frame, ff_rm = phase2_floodfill(frame)   # P2: FF精修
            frame = clear_watermark(frame)            # P3: 水印
            frame = trim_and_resize(frame, max_h)     # 裁缩

            idx += 1
            fname = f"{action_name}_{idx:02d}.png"
            fpath = os.path.join(out_dir, fname)
            frame.save(fpath, optimize=True)

            # 统计
            sz_kb = os.path.getsize(fpath) / 1024
            px = frame.load()
            fw2, fh2 = frame.size
            trans_cnt = sum(1 for yy in range(fh2) for xx in range(fw2) if px[xx,yy][3]==0)
            trans_pct = trans_cnt / (fw2*fh2) * 100
            print(f"  OK {fname}: {frame.size[0]}x{frame.size[1]} ({sz_kb:.1f}KB, 透明{trans_pct:.0f}%)")

    return idx


def main():
    os.makedirs(OUTPUT_FINAL, exist_ok=True)
    total = 0
    for src_name, action, max_h in SOURCES:
        path = os.path.join(SOURCE_DIR, src_name)
        if os.path.exists(path):
            total += process_source(path, action, max_h, OUTPUT_FINAL)
        else:
            print(f"  ! 未找到: {path}")
    print(f"\n{'='*55}")
    print(f"  完成! 共处理 {total} 帧 -> {OUTPUT_FINAL}/")


if __name__ == "__main__":
    main()
