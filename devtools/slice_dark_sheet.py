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

T = 70  # 洪水填充阈值：color-distance 之和 <= T 视为"可连通背景"


def bg_of(a):
    h, w = a.shape[:2]
    cs = [tuple(a[2, 2, :3]), tuple(a[h // 2, 2, :3]),
          tuple(a[2, w // 2, :3]), tuple(a[h - 3, w - 3, :3])]
    return np.array(Counter(cs).most_common(1)[0][0], dtype=int)


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


def slice_sheet(src_path, target):
    a = np.array(Image.open(src_path).convert('RGBA'))
    bg = bg_of(a)
    cells = segment_cells(a, bg)
    results = []
    for (y0, y1, x0, x1) in cells:
        crop = a[y0:y1 + 1, x0:x1 + 1].copy()
        cbg = bg_of(crop)
        opaque = key_opaque(crop, cbg)
        opaque = largest_component(opaque)
        opaque = fill_holes(opaque)  # 连通性抠图后再补一次内部洞（双保险）
        if opaque.sum() < 800:
            continue
        ys, xs = np.where(opaque)
        bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
        bw, bh = bx1 - bx0 + 1, by1 - by0 + 1
        if bw < 50 or bh < 90:  # 剔除标签条/地面线/竖线碎片
            continue
        sub = crop[by0:by1 + 1, bx0:bx1 + 1].copy()
        sm = opaque[by0:by1 + 1, bx0:bx1 + 1]
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
    # 两遍：以"身体帧"(idle/walk/attack) 的内容高度分位数为统一基准，
    # 所有帧共用 sH 脚底锚定 → 身体尺寸一致、消除逐帧胀缩；skill 的柱/臂
    # 超出画布顶部则按宽 contain（与旧行为一致，不引入回归）。
    body_acts = [a for a in ('idle', 'walk', 'attack') if a in per_action]
    body_bhs = [bh for a in body_acts for (_, _, bh) in per_action[a]]
    if body_bhs:
        body_bhs.sort()
        refH = body_bhs[min(len(body_bhs) - 1, int(0.85 * len(body_bhs)))]
    else:
        refH = max((bh for res in per_action.values() for (_, _, bh) in res), default=1)
    sH = th / refH
    for act in actions:
        res = per_action.get(act)
        if not res:
            continue
        od = os.path.join(out, act)
        os.makedirs(od, exist_ok=True)
        written = []
        out_idx = 0
        for (sub, bw, bh) in res:
            s = sH
            if bw * s > tw:
                s = tw / bw
            nw, nh = max(1, int(round(bw * s))), max(1, int(round(bh * s)))
            sub_img = Image.fromarray(sub, 'RGBA').resize((nw, nh), Image.LANCZOS)
            canvas = Image.new('RGBA', target, (0, 0, 0, 0))
            canvas.paste(sub_img, ((tw - nw) // 2, th - nh))  # 脚底对齐底部 + 水平居中
            out_idx += 1
            canvas.save(os.path.join(od, f'{act}_{out_idx:02d}.png'))
            written.append((out_idx, bw, bh, nw, nh))
        print(f'  {act}: {len(written)} frames (uniform scale sH={sH:.3f}, refH={refH})')
        for r in written:
            print(f'     frame {r[0]:02d}: src {r[1]}x{r[2]} -> {r[3]}x{r[4]}')
    print('SUMMARY:', {k: len(v) for k, v in per_action.items()})


if __name__ == '__main__':
    main()
