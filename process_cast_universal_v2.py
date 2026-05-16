#!/usr/bin/env python3
"""
处理李小宝施法精灵图 v5 - 彻底清理版

策略:
1. 绿幕去除 (HSV + RGB双重判断)
2. 网格线/浅色低饱和像素清除
3. 激进裁剪: 顶部28px + 底部45px直接裁掉(角色不延伸到这些区域)
4. 二次边缘清理: 裁剪后再次扫描边缘残留
5. 最终透明化: 所有非角色的浅色像素都透明化
"""

import os
from PIL import Image

SOURCE = "_source_backup/李小宝/李小宝技能释放动画 copy.png"
OUTPUT = "subpackages/battle/images/characters_anim/transparent/lixiaobao/cast_universal.png"


def is_green(r, g, b, a):
    """判断是否为绿色背景/绿幕"""
    if a < 20:
        return True
    # 明显绿色
    if g > 80 and g > r * 1.15 and g > b * 1.08:
        return True
    return False


def is_grid_or_light(r, g, b, a):
    """判断是否为网格线/浅色残留"""
    if a < 20:
        return True
    br = (r + g + b) // 3
    mx_i, mn_i = max(r, g, b), min(r, g, b)
    sat = int((mx_i - mn_i) * 255 / max(mx_i, 1))
    # 浅色 + 低饱和 = 网格线/背景色
    if br >= 100 and sat <= 50:
        return True
    # 接近白色/灰色的像素
    if br >= 180 and max(abs(r - g), abs(g - b), abs(b - r)) < 30:
        return True
    return False


def process():
    img = Image.open(SOURCE).convert("RGBA")
    w, h = img.size
    print(f"源图尺寸: {w}x{h}")
    px = img.load()

    # === 第一步：颜色清理 ===
    removed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_green(r, g, b, a) or is_grid_or_light(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
                removed += 1
    print(f"[颜色清理] 清除 {removed}px")

    # === 第二步：找到内容边界 ===
    content_top = h
    content_bottom = 0
    for y in range(h):
        row_content = sum(1 for xx in range(w) if px[xx, y][3] > 20)
        if row_content > 10:  # 一行有超过10个不透明像素算有内容
            content_top = min(content_top, y)
            content_bottom = max(content_bottom, y)

    print(f"内容范围: Y={content_top} ~ {content_bottom} (高{content_bottom - content_top + 1})")

    # === 第三步：裁剪 ===
    # 角色在中间，顶部有网格线，底部有帧编号
    # 安全裁剪: 顶部留2px边距，底部留4px边距
    crop_top = max(0, content_top - 2)
    crop_bottom = min(h, content_bottom + 6)
    
    cropped = img.crop((0, crop_top, w, crop_bottom))
    cw, ch = cropped.size
    cpx = cropped.load()
    print(f"[裁剪] {cw}x{ch} (去顶{crop_top}px, 去底{h - crop_bottom}px)")

    # === 第四步：二次清理 - 重点处理边缘和残留 ===
    rm2 = 0
    for y in range(ch):
        for x in range(cw):
            r, g, b, a = cpx[x, y]
            if a < 15:
                continue
            br_val = (int(r) + int(g) + int(b)) // 3
            mx_i, mn_i = max(r, g, b), min(r, g, b)
            sat = int((mx_i - mn_i) * 255 / max(mx_i, 1))
            
            # 边缘区域: 更宽松的清理条件
            edge_margin = 5
            is_edge = (x < edge_margin or x >= cw - edge_margin or 
                       y < edge_margin or y >= ch - edge_margin)
            
            if is_edge:
                # 边缘任何可疑像素都清除
                if br_val >= 80 or sat <= 60 or is_green(r, g, b, a):
                    cpx[x, y] = (0, 0, 0, 0)
                    rm2 += 1
                    continue
            
            # 非边缘: 只清除明显异常的
            if is_grid_or_light(r, g, b, a) or is_green(r, g, b, a):
                cpx[x, y] = (0, 0, 0, 0)
                rm2 += 1
    
    if rm2:
        print(f"[二次清理] 清除 {rm2}px")

    # === 第五步：最终扫描 - 强制清除所有浅色残留 ===
    rm3 = 0
    for y in range(ch):
        for x in range(cw):
            r, g, b, a = cpx[x, y]
            if a < 15:
                continue
            br_val = (int(r) + int(g) + int(b)) // 3
            mx_i, mn_i = max(r, g, b), min(r, g, b)
            sat = int((mx_i - mn_i) * 255 / max(mx_i, 1))
            
            # 非常亮的像素(不是角色的一部分)
            if br_val > 220:
                cpx[x, y] = (0, 0, 0, 0)
                rm3 += 1
                continue
            
            # 底部区域: 最后30行，更激进地清理
            if y > ch - 35 and br_val >= 60:
                # 角色的脚是深色的，浅色的一定是残留
                if br_val > 100 or sat < 80:
                    cpx[x, y] = (0, 0, 0, 0)
                    rm3 += 1
                    continue
            
            # 分界线附近: 检查是否是孤立的竖线像素
            frame_w = cw // 7
            for fi in range(1, 7):
                bx = fi * frame_w
                if abs(x - bx) <= 2:
                    # 在分界线2px范围内，检查周围是否有足够多的同色像素
                    # 如果是孤立像素，清除它
                    neighbors = 0
                    for dx in [-3, -2, -1, 1, 2, 3]:
                        nx = x + dx
                        if 0 <= nx < cw:
                            nr, ng, nb, na = cpx[nx, y]
                            if na > 20:
                                ndiff = abs(int(nr) - r) + abs(int(ng) - g) + abs(int(nb) - b)
                                if ndiff < 50:
                                    neighbors += 1
                    if neighbors < 2:  # 孤立像素
                        cpx[x, y] = (0, 0, 0, 0)
                        rm3 += 1
                    break
    if rm3:
        print(f"[最终清理] 清除 {rm3}px")

    # === 保存 ===
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    cropped.save(OUTPUT, optimize=True)
    sz = os.path.getsize(OUTPUT) / 1024
    print(f"\n✅ 已保存: {OUTPUT} ({cw}x{ch}, {sz:.1f}KB)")

    # === 分界验证 ===
    frame_w = cw // 7
    print(f"\n--- 帧分界验证 (每帧={frame_w}px, 共7帧) ---")
    for i in range(1, 7):
        bx = i * frame_w
        # 检查分界线上有多少不透明像素
        cnt = sum(1 for yy in range(ch) if cpx[bx, yy][3] > 10)
        status = "✓ 干净" if cnt <= 3 else ("~ 少量" if cnt <= 10 else "⚠ 有残留")
        print(f"  帧{i-1}|{i} (x={bx}): {status} ({cnt}px)")


if __name__ == "__main__":
    process()
