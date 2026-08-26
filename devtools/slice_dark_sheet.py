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

策略（不要换）：
1. 网格法：行/列投影找背景间隙分段；不足 4 列的宽段用列投影谷值劈分；
   高度<60 的薄段是装饰（标签/地面线），丢弃。
2. 装饰剔除：格内用「最大连通块 + 宽≥60」去掉标签/地面线小碎片。
3. 放置：高度锁定 + 底部居中（`scale=min(120/bh,93/bw)`），游戏按整张 120
   高归一（`scale=targetHeight/imgHeight`），高度差直接表现为身体跳变。
4. 帧号：用写入计数器（`out_idx`）保证文件 01..NN 连续，不留空洞。
"""
import argparse
import os
import numpy as np
from PIL import Image
from collections import Counter

TH = 45  # RGB 差阈值


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


def largest_blob_bbox(crop, bg):
    cd = np.abs(crop[:, :, :3].astype(int) - bg).sum(2)
    mask = cd > TH
    H, W = mask.shape
    lab = np.zeros((H, W), dtype=np.int32)
    parent = [0]  # 1-indexed: parent[0] 占位, 标签从 1 起, parent[L]=L

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
    for y in range(H):
        for x in range(W):
            if not mask[y, x]:
                continue
            nb = []
            if x > 0 and mask[y, x - 1]:
                nb.append(lab[y, x - 1])
            if y > 0 and mask[y - 1, x]:
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
    sizes = {}
    for y in range(H):
        for x in range(W):
            v = lab[y, x]
            if v == 0:
                continue
            rv = find(v)
            sizes[rv] = sizes.get(rv, 0) + 1
    if not sizes:
        return None
    big = max(sizes, key=sizes.get)
    root = np.zeros((H, W), dtype=np.int32)
    for y in range(H):
        for x in range(W):
            root[y, x] = find(lab[y, x]) if lab[y, x] != 0 else 0
    ys, xs = np.where(root == big)
    return int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())


def slice_one(src_path, out_dir, action, target):
    a = np.array(Image.open(src_path).convert('RGBA'))
    h, w = a.shape[:2]
    bg = bg_of(a)
    diff = np.abs(a[:, :, :3].astype(int) - bg).sum(2)
    rowFg = (diff > TH).sum(1)
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
        colFg = (diff[y0:y1 + 1, :] > TH).sum(0)
        csegs = gap_segments(colFg, 0, w - 1, 0.04 * rowH)
        csegs = enforce_four(csegs, colFg)
        for (x0, x1) in csegs:
            cells.append((y0, (x0 + x1) // 2, y0, y1, x0, x1))
    cells.sort(key=lambda c: (c[0], c[1]))
    os.makedirs(os.path.join(out_dir, action), exist_ok=True)
    TW, TH_H = target
    written = []
    out_idx = 0
    for (_, _, y0, y1, x0, x1) in cells:
        crop = a[y0:y1 + 1, x0:x1 + 1].copy()
        cbg = bg_of(crop)
        cd = np.abs(crop[:, :, :3].astype(int) - cbg).sum(2)
        cm = cd > TH
        if cm.sum() < 800:
            continue
        bb = largest_blob_bbox(crop, cbg)
        if bb is None:
            continue
        bx0, bx1, by0, by1 = bb
        bw0, bh0 = bx1 - bx0 + 1, by1 - by0 + 1
        if bw0 < 60 or bh0 < 90:  # 剔除标签条等细高碎片
            continue
        sub = crop[by0:by1 + 1, bx0:bx1 + 1].copy()
        sub[~cm[by0:by1 + 1, bx0:bx1 + 1], 3] = 0
        bw, bh = sub.shape[1], sub.shape[0]
        scale = min(TH_H / bh, TW / bw)  # 高度锁定 + 超宽帧 contain 防裁切
        nw, nh = max(1, int(round(bw * scale))), max(1, int(round(bh * scale)))
        sub_img = Image.fromarray(sub, 'RGBA').resize((nw, nh), Image.LANCZOS)
        canvas = Image.new('RGBA', target, (0, 0, 0, 0))
        canvas.paste(sub_img, ((TW - nw) // 2, TH_H - nh))  # 底部居中
        out_idx += 1
        canvas.save(os.path.join(out_dir, action, f'{action}_{out_idx:02d}.png'))
        written.append((out_idx, bw, bh, nw, nh))
    print(f'  {action}: {len(written)} frames')
    for r in written:
        print(f'     frame {r[0]:02d}: src {r[1]}x{r[2]} -> {r[3]}x{r[4]}')
    return len(written)


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
    counts = {}
    for act in actions:
        src = os.path.join(args.src, f'{act}.png')
        if not os.path.exists(src):
            print(f'!! 跳过 {act}：{src} 不存在')
            continue
        print(f'== {act} ==')
        counts[act] = slice_one(src, out, act, target)
    print('SUMMARY:', counts)


if __name__ == '__main__':
    main()
