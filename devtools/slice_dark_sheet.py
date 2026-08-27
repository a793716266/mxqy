#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""深色实底 sprite-sheet (4×2 = 8 帧/动作) → 93×120 透明 PNG 批量切片。

适用：AI 出的多动作精灵表，固定 4 列 × 2 行，深/浅单色实底（无 alpha），
表内可能含「文字标签条」(顶部细条) 与「地面线」(薄横线) 等装饰。

用法：
  python3 devtools/slice_dark_sheet.py \
    --name stone_golem \
    --src "_source_backup/石像守卫" \
    --out "subpackages/battle/images/characters_anim/transparent/stone_golem" \
    --actions idle,walk,attack,skill

策略（v2，修复"很差"的渲染）：
1. 网格法：行/列投影找背景间隙分段；不足 4 列的宽段用列投影谷值劈分；
   高度<60 的薄段是装饰（标签/地面线），丢弃。
2. 连通性抠图（关键修复）：在每格内，从「格边界」做 BFS 洪水填充，凡是
   通过 color-distance<=T 的链能连到边界的像素 = 背景（透明）；被身体包围、
   连不到边界的暗部阴影 = 身体（不透明）。这样既能消除身体内部的"穿透洞"，
   又能消除贴边暗块"黑雾"。再用"最大连通不透明块"剔除标签条/地面线碎片。
3. 补洞：对抠图结果再做一次"外部透明"洪水（从格边界穿过透明像素），
   未连到边界的内部透明区 = 洞 → 填回不透明，双保险。
4. 统一缩放 + 脚底锚定（修复尺寸跳变）：两遍处理，先算所有帧的最大内容高度
   maxBh，再对所有帧用 s=120/maxBh 统一缩放（脚底对齐到 y=120），宽帧若超
   93 则改为按宽 contain。这样身体比例一致、脚底不上下跳，消除逐帧"胀缩"。
5. 帧号：用写入计数器（out_idx）保证文件 01..NN 连续，不留空洞。
"""
import argparse
import os
import numpy as np
from PIL import Image
from collections import Counter, deque

T = 28  # 洪水填充阈值：color-distance 之和 <= T 视为"可连通背景"。
        # 源图表色间隙在 cd=20(背景)与 cd=30(石像最暗腿/阴影)之间，取 28 紧贴背景，
        # 只删纯背景、保留石像全部部位(含暗腿)；不再误删贴边暗身体。


def bg_of(a):
    """整表级背景色：取外边框一圈像素的众数(robust 到单角被特效污染)。"""
    h, w = a.shape[:2]
    m = 3
    ring = np.concatenate([
        a[:m, :, :3].reshape(-1, 3),
        a[h - m:, :, :3].reshape(-1, 3),
        a[:, :m, :3].reshape(-1, 3),
        a[:, w - m:, :3].reshape(-1, 3),
    ], axis=0).astype(int)
    cols = [tuple(c) for c in ring]
    return np.array(Counter(cols).most_common(1)[0][0], dtype=int)


def gap_segments(proj, x0, x1, thr):
    segs, s = [], None
    for x in range(x0, x1 + 1):
        if proj[x] >= thr:
            if s is None:
                s = x
        else:
            if s is not None:
                segs.append((s, x - 1))
                s = None
    if s is not None:
        segs.append((s, x1))
    return segs


def enforce_four(segs, proj):
    segs = [tuple(s) for s in segs]
    for _ in range(8):
        if len(segs) >= 4:
            break
        widest = max(segs, key=lambda s: s[1] - s[0])
        lo, hi = widest
        valley = min(range(lo, hi + 1), key=lambda x: proj[x])
        segs.remove(widest)
        segs.append((lo, valley))
        segs.append((valley + 1, hi))
        segs.sort()
    for _ in range(8):
        if len(segs) <= 4:
            break
        best_i, best_w = None, None
        for i in range(len(segs) - 1):
            w = (segs[i][1] - segs[i][0]) + (segs[i + 1][1] - segs[i + 1][0])
            if best_w is None or w < best_w:
                best_w, best_i = w, i
        i = best_i
        segs[i] = (segs[i][0], segs[i + 1][1])
        del segs[i + 1]
    return sorted(segs)


def key_opaque(crop, bg):
    """返回布尔不透明遮罩：True=身体。从边界洪水，连到边界的暗像素=背景。"""
    cd = np.abs(crop[:, :, :3].astype(int) - bg).sum(2)
    H, W = cd.shape
    reachable = np.zeros((H, W), bool)
    dq = deque()
    for x in range(W):
        for y in (0, H - 1):
            if cd[y, x] <= T and not reachable[y, x]:
                reachable[y, x] = True
                dq.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if cd[y, x] <= T and not reachable[y, x]:
                reachable[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not reachable[ny, nx] and cd[ny, nx] <= T:
                reachable[ny, nx] = True
                dq.append((ny, nx))
    transparent = (cd <= T) & reachable
    opaque = ~transparent
    # 补洞：从边界穿过透明像素洪水，未连到边界的内部透明区=洞→填回不透明
    exterior = np.zeros((H, W), bool)
    dq2 = deque()
    for x in range(W):
        for y in (0, H - 1):
            if transparent[y, x] and not exterior[y, x]:
                exterior[y, x] = True
                dq2.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if transparent[y, x] and not exterior[y, x]:
                exterior[y, x] = True
                dq2.append((y, x))
    while dq2:
        y, x = dq2.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not exterior[ny, nx] and transparent[ny, nx]:
                exterior[ny, nx] = True
                dq2.append((ny, nx))
    opaque |= (transparent & ~exterior)
    return opaque


def largest_component(opaque):
    """返回最大连通不透明块遮罩（剔除标签条/地面线等小碎片）。"""
    H, W = opaque.shape
    lab = np.zeros((H, W), dtype=np.int32)
    parent = [0]
    ys, xs = np.where(opaque)
    if len(ys) == 0:
        return opaque
    coord = {}
    nxt = 1

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for y, x in zip(ys, xs):
        nb = []
        if x > 0 and opaque[y, x - 1]:
            nb.append(lab[y, x - 1])
        if y > 0 and opaque[y - 1, x]:
            nb.append(lab[y - 1, x])
        if not nb:
            lab[y, x] = nxt
            parent.append(nxt)
            coord[nxt] = (y, x)
            nxt += 1
        else:
            r = min(nb)
            lab[y, x] = r
            for v in nb:
                union(r, v)
    sizes = {}
    for y, x in zip(ys, xs):
        rv = find(lab[y, x])
        sizes[rv] = sizes.get(rv, 0) + 1
    if not sizes:
        return opaque
    big = max(sizes, key=sizes.get)
    out = np.zeros((H, W), bool)
    for y, x in zip(ys, xs):
        if find(lab[y, x]) == big:
            out[y, x] = True
    return out


def segment_cells(a, bg):
    h, w = a.shape[:2]
    diff = np.abs(a[:, :, :3].astype(int) - bg).sum(2)
    rowFg = (diff > T).sum(1)
    rowBg = rowFg < 0.02 * w
    rsegs, s = [], None
    for y in range(h):
        if not rowBg[y]:
            s = y if s is None else s
        else:
            if s is not None:
                rsegs.append((s, y - 1))
                s = None
    if s is not None:
        rsegs.append((s, h - 1))
    rsegs = [(y0, y1) for (y0, y1) in rsegs if (y1 - y0 + 1) >= 60]
    cells = []
    for (y0, y1) in rsegs:
        rowH = y1 - y0 + 1
        colFg = (diff[y0:y1 + 1, :] > T).sum(0)
        csegs = gap_segments(colFg, 0, w - 1, 0.04 * rowH)
        csegs = enforce_four(csegs, colFg)
        for (x0, x1) in csegs:
            cells.append((y0, y1, x0, x1))
    cells.sort(key=lambda c: (c[0], (c[2] + c[3]) // 2))
    return cells


def fill_holes(opaque):
    """把最终不透明遮罩里"连不到边界"的内部透明区填回不透明（消除穿透洞）。"""
    H, W = opaque.shape
    cur = ~opaque
    ext = np.zeros((H, W), bool)
    dq = deque()
    for x in range(W):
        for y in (0, H - 1):
            if cur[y, x]:
                ext[y, x] = True
                dq.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if cur[y, x]:
                ext[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not ext[ny, nx] and cur[ny, nx]:
                ext[ny, nx] = True
                dq.append((ny, nx))
    out = opaque.copy()
    out |= (cur & ~ext)
    return out


def keep_main_components(opaque, min_ratio=0.02, abs_min=500, min_side=4):
    """保留「最大块」外加所有面积 >= max(min_ratio*最大块, abs_min) 的连通块；
    并删除极细线状独立块(宽或高 <= min_side)，如源表帧间分隔竖线/横线残留。

    阈值依据(v5/v6 实测)：真实肢体/武器块最小约 919px，噪声块最大约 205px，
    故 abs_min=500 删噪声留肢体；线状残留(如 3px 宽竖线，离身体 30+px 无法桥接)
    用 min_side 删——它面积虽大(上千 px)但是线，不能当肢体留。
    """
    H, W = opaque.shape
    lab = np.zeros((H, W), dtype=np.int32)
    parent = [0]
    ys, xs = np.where(opaque)
    if len(ys) == 0:
        return opaque

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    nxt = 1
    for y, x in zip(ys, xs):
        nb = []
        if x > 0 and opaque[y, x - 1]:
            nb.append(lab[y, x - 1])
        if y > 0 and opaque[y - 1, x]:
            nb.append(lab[y - 1, x])
        if not nb:
            lab[y, x] = nxt
            parent.append(nxt)
            nxt += 1
        else:
            r = min(nb)
            lab[y, x] = r
            for v in nb:
                union(r, v)
    # 标注完成后，单独扫一遍统计每根的(面积 + 包围盒)，避免合并时 bbox 更新错误
    sizes = {}
    bb = {}
    for y, x in zip(ys, xs):
        rv = find(lab[y, x])
        sizes[rv] = sizes.get(rv, 0) + 1
        if rv not in bb:
            bb[rv] = [y, y, x, x]
        else:
            b = bb[rv]
            if y < b[0]:
                b[0] = y
            if y > b[1]:
                b[1] = y
            if x < b[2]:
                b[2] = x
            if x > b[3]:
                b[3] = x
    if not sizes:
        return opaque
    mx = max(sizes.values())
    floor = max(min_ratio * mx, abs_min)
    keep_roots = set()
    for rv, sz in sizes.items():
        if sz < floor:
            continue
        b = bb[rv]
        w = b[3] - b[2] + 1
        h = b[1] - b[0] + 1
        if min(w, h) <= min_side:  # 极细线状残留(帧间分隔线等)
            continue
        keep_roots.add(rv)
    out = np.zeros((H, W), bool)
    for y, x in zip(ys, xs):
        if find(lab[y, x]) in keep_roots:
            out[y, x] = True
    return out


def drop_thin_lines(opaque, min_side=3):
    """终检：删除最终遮罩里宽或高 <= min_side 的极细线状连通块。

    用于清掉源表细线(帧间分隔线)以及缩放后从身体断裂的 1px 细丝残留。
    只删独立细块，连接在身体上的细部位(属同一组件)不受影响。
    """
    H, W = opaque.shape
    lab = np.zeros((H, W), dtype=np.int32)
    parent = [0]
    ys, xs = np.where(opaque)
    if len(ys) == 0:
        return opaque

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    nxt = 1
    for y, x in zip(ys, xs):
        nb = []
        if x > 0 and opaque[y, x - 1]:
            nb.append(lab[y, x - 1])
        if y > 0 and opaque[y - 1, x]:
            nb.append(lab[y - 1, x])
        if not nb:
            lab[y, x] = nxt
            parent.append(nxt)
            nxt += 1
        else:
            r = min(nb)
            lab[y, x] = r
            for v in nb:
                union(r, v)
    bb = {}
    for y, x in zip(ys, xs):
        rv = find(lab[y, x])
        if rv not in bb:
            bb[rv] = [y, y, x, x]
        else:
            b = bb[rv]
            if y < b[0]:
                b[0] = y
            if y > b[1]:
                b[1] = y
            if x < b[2]:
                b[2] = x
            if x > b[3]:
                b[3] = x
    thin = set()
    for rv, b in bb.items():
        w = b[3] - b[2] + 1
        h = b[1] - b[0] + 1
        if min(w, h) <= min_side:
            thin.add(rv)
    out = opaque.copy()
    for y, x in zip(ys, xs):
        if find(lab[y, x]) in thin:
            out[y, x] = False
    return out


def slice_sheet(src_path, target):
    a = np.array(Image.open(src_path).convert('RGBA'))
    bg = bg_of(a)
    cells = segment_cells(a, bg)
    results = []
    PAD = 40  # 给单元格垫一圈背景边距，使石像永不直接贴边（避免暗身体被当背景删、只剩头）
    for (y0, y1, x0, x1) in cells:
        crop = a[y0:y1 + 1, x0:x1 + 1].copy()
        # 关键修复(v5)：必须使用「整表级」背景 bg，不能用裁剪格四角的 bg_of(crop)。
        # 某些动作(如 skill 的岩石/光效)会伸进单元格四角，导致 bg_of(crop) 采到
        # 明亮的特效色 → 把真正的深色背景误判为身体(保留不透明=黑底)，
        # 同时把明亮特效当背景删掉(反向抠图)。整表背景 bg=[16,21,25] 恒定，
        # 用它做填充边距与洪水基准才正确。
        Hc, Wc = crop.shape[:2]
        padded = np.zeros((Hc + 2 * PAD, Wc + 2 * PAD, 4), dtype=np.uint8)
        padded[:, :, :3] = bg
        padded[:, :, 3] = 255
        padded[PAD:PAD + Hc, PAD:PAD + Wc] = crop
        opaque = key_opaque(padded, bg)
        opaque = keep_main_components(opaque)  # 头+身体若断开都留，只删标签碎块
        opaque = fill_holes(opaque)
        if opaque.sum() < 800:
            continue
        ys, xs = np.where(opaque)
        # bbox 在 padded 坐标 -> 映射回 crop 坐标
        bx0, bx1 = xs.min() - PAD, xs.max() - PAD
        by0, by1 = ys.min() - PAD, ys.max() - PAD
        bx0, bx1 = max(0, bx0), min(Wc - 1, bx1)
        by0, by1 = max(0, by0), min(Hc - 1, by1)
        bw, bh = bx1 - bx0 + 1, by1 - by0 + 1
        if bw < 50 or bh < 90:  # 剔除标签条/地面线/竖线碎片
            continue
        sub = crop[by0:by1 + 1, bx0:bx1 + 1].copy()
        sm = opaque[by0 + PAD:by1 + PAD + 1, bx0 + PAD:bx1 + PAD + 1]
        sub[~sm, 3] = 0
        results.append((sub, bw, bh))
    return results


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--name', required=True, help='怪物目录名（与 enemies.js id 一致）')
    p.add_argument('--src', required=True, help='源表所在目录（含 <action>.png）')
    p.add_argument('--out', help='输出根目录（默认 subpackages/battle/images/characters_anim/transparent/<name>）')
    p.add_argument('--actions', default='idle,walk,attack,skill', help='动作列表，逗号分隔')
    p.add_argument('--target', default='93x120', help='输出画布 WxH')
    args = p.parse_args()
    out = args.out or f'subpackages/battle/images/characters_anim/transparent/{args.name}'
    tw, th = map(int, args.target.lower().split('x'))
    target = (tw, th)
    actions = [a.strip() for a in args.actions.split(',') if a.strip()]
    per_action = {}
    for act in actions:
        src = os.path.join(args.src, f'{act}.png')
        if not os.path.exists(src):
            print(f'!! 跳过 {act}：{src} 不存在')
            continue
        print(f'== {act} ==')
        per_action[act] = slice_sheet(src, target)
    # 各动作统一缩放到「共同目标站立高度」targetH：每动作取自身内容高中位数定比例，
    # 该动作内所有帧共用同一比例(脚底锚定) → 同动作帧间尺寸一致；跨动作用共同 targetH
    # 归一(补偿源表跨动作缩放差异) → 角色表观大小在各动画间一致。skill 特效超宽按宽 contain。
    targetH = 110
    for act in actions:
        res = per_action.get(act)
        if not res:
            continue
        bhs = [bh for (_, _, bh) in res]
        med = sorted(bhs)[len(bhs) // 2]
        s_act = targetH / med if med > 0 else 1
        od = os.path.join(out, act)
        # 先清空旧帧，避免上一轮多切出的残帧(如 skill_09)污染动画
        if os.path.isdir(od):
            for fn in os.listdir(od):
                if fn.endswith('.png'):
                    os.remove(os.path.join(od, fn))
        os.makedirs(od, exist_ok=True)
        written = []
        out_idx = 0
        for (sub, bw, bh) in res:
            s = s_act
            if bw * s > tw:
                s = tw / bw
            nw, nh = max(1, int(round(bw * s))), max(1, int(round(bh * s)))
            sub_img = Image.fromarray(sub, 'RGBA').resize((nw, nh), Image.LANCZOS)
            canvas = Image.new('RGBA', target, (0, 0, 0, 0))
            canvas.paste(sub_img, ((tw - nw) // 2, th - nh))  # 脚底对齐底部 + 水平居中
            # 终检：清掉最终画布里的极细线残留(源细线/缩放后断裂的 1px 细丝)
            amask = np.array(canvas.split()[-1]) > 200
            amask = drop_thin_lines(amask, min_side=3)
            canvas.putalpha(Image.fromarray((amask.astype(np.uint8) * 255), 'L'))
            out_idx += 1
            canvas.save(os.path.join(od, f'{act}_{out_idx:02d}.png'))
            written.append((out_idx, bw, bh, nw, nh))
        print(f'  {act}: {len(written)} frames (per-action scale s={s_act:.3f}, targetH={targetH})')
        for r in written:
            print(f'     frame {r[0]:02d}: src {r[1]}x{r[2]} -> {r[3]}x{r[4]}')
    print('SUMMARY:', {k: len(v) for k, v in per_action.items()})


if __name__ == '__main__':
    main()
