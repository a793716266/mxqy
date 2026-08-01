#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
野外战斗怪物 - 基于现有动画资源的资源派生工具

提供三类派生能力（全部基于已有怪物动画帧，纯 PIL 处理，无外部依赖）：
  1) skill_fx    : 从怪物 skill 帧派生技能特效帧（打击爆裂 / 光环 / 拖尾）
  2) recolor     : 换肤/调色，生成同模异色新怪物变体（含配置生成）
  3) tween       : 抽帧/补帧，对 walk 序列线性插值补帧，让移动更顺滑

用法:
  python3 scripts/tools/derive_monster_assets.py skill_fx   [--src DIR] [--out DIR]
  python3 scripts/tools/derive_monster_assets.py recolor   [--src DIR] [--out DIR] [--hues 20,180,300]
  python3 scripts/tools/derive_monster_assets.py tween     [--src DIR] [--out DIR] [--factor 2]

默认路径基于本仓库 subpackages/battle/images/characters_anim/transparent/
"""
import argparse
import math
import os
import sys

from PIL import Image, ImageEnhance, ImageFilter

BASE = os.path.normpath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'subpackages', 'battle',
                 'images', 'characters_anim', 'transparent')
)


def _load(path):
    return Image.open(path).convert('RGBA')


def _save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print('  ->', path)


# ---------------------------------------------------------------------------
# 1) 技能特效帧
# ---------------------------------------------------------------------------
def derive_skill_fx(src_dir, out_dir):
    """从技能帧派生特效：爆裂环 + 光晕 + 拖尾，输出透明叠加帧。"""
    if not os.path.isdir(src_dir):
        print('[skill_fx] 源目录不存在:', src_dir)
        return
    files = sorted(f for f in os.listdir(src_dir)
                   if f.lower().endswith('.png'))
    if not files:
        print('[skill_fx] 源目录无 png:', src_dir)
        return
    print('[skill_fx] 处理', src_dir)
    fx_dir = os.path.join(out_dir, 'skill_fx')
    for fname in files:
        base = os.path.splitext(fname)[0]
        src = _load(os.path.join(src_dir, fname))
        w, h = src.size

        # 提取不透明像素的亮度作为"能量 Mask"
        lum = ImageEnhance.Brightness(src.convert('L')).enhance(1.0)
        alpha = src.split()[3]

        # (a) 爆裂环：在精灵中心外扩一圈红色光环
        ring = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        rpx = ring.load()
        cx, cy = w // 2, int(h * 0.55)
        for y in range(h):
            for x in range(w):
                d = math.hypot(x - cx, y - cy)
                if 30 < d < 38:
                    a = int(220 * (1 - abs(d - 34) / 8))
                    rpx[x, y] = (255, 90, 60, max(0, a))

        # (b) 光晕：高斯模糊的红光，alpha 取原图 alpha 的膨胀
        glow = Image.new('RGBA', (w, h), (255, 120, 80, 0))
        gpx = glow.load()
        apx = alpha.load()
        for y in range(h):
            for x in range(w):
                if apx[x, y] > 40:
                    gpx[x, y] = (255, 140, 90, int(apx[x, y] * 0.5))
        glow = glow.filter(ImageFilter.GaussianBlur(6))

        # (c) 拖尾：向左的半透明残影条
        trail = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        tpx = trail.load()
        for y in range(h):
            for x in range(w):
                if apx[x, y] > 60 and x < w * 0.5:
                    tpx[x, y] = (255, 200, 120, int(apx[x, y] * 0.35))

        # 合成特效层（不含原图，纯特效，运行时叠加）
        fx = Image.alpha_composite(ring, glow)
        fx = Image.alpha_composite(fx, trail)
        _save(fx, os.path.join(fx_dir, base + '_fx.png'))

        # 同时输出"原图+特效"合成预览帧
        combined = Image.alpha_composite(src, fx)
        _save(combined, os.path.join(fx_dir, base + '_preview.png'))


# ---------------------------------------------------------------------------
# 2) 换肤 / 调色
# ---------------------------------------------------------------------------
def _hue_shift(img, hue_deg):
    """对 RGBA 图像做整体色相旋转（保持透明通道不变）。"""
    hsv = img.convert('RGB').convert('HSV')
    hp = hsv.load()
    w, h = hsv.size
    # PIL HSV: H in [0,255], S/V in [0,255]
    shift = int((hue_deg % 360) / 360.0 * 255)
    for y in range(h):
        for x in range(w):
            hh, ss, vv = hp[x, y]
            hp[x, y] = ((hh + shift) % 256, ss, vv)
    rgb = hsv.convert('RGB')
    out = Image.new('RGBA', (w, h))
    out.paste(rgb, (0, 0))
    out.putalpha(img.split()[3])
    return out


def derive_recolor(src_dir, out_dir, hues):
    if not os.path.isdir(src_dir):
        print('[recolor] 源目录不存在:', src_dir)
        return
    # 收集所有子目录（idle/walk/attack/...），跳过派生的特效目录
    subdirs = [d for d in sorted(os.listdir(src_dir))
               if os.path.isdir(os.path.join(src_dir, d)) and d != 'skill_fx']
    print('[recolor] 源:', src_dir, '变体色相:', hues)
    for hue in hues:
        tag = 'hue_%d' % int(hue)
        for sd in subdirs:
            sdir = os.path.join(src_dir, sd)
            odir = os.path.join(out_dir, tag, sd)
            for fname in sorted(f for f in os.listdir(sdir) if f.endswith('.png')):
                out = _hue_shift(_load(os.path.join(sdir, fname)), hue)
                _save(out, os.path.join(odir, fname))


# ---------------------------------------------------------------------------
# 3) 抽帧 / 补帧
# ---------------------------------------------------------------------------
def _lerp_img(a, b, t):
    return Image.blend(a, b, t)


def derive_tween(src_dir, out_dir, factor):
    if not os.path.isdir(src_dir):
        print('[tween] 源目录不存在:', src_dir)
        return
    files = sorted(f for f in os.listdir(src_dir) if f.endswith('.png'))
    if len(files) < 2:
        print('[tween] 帧数不足，无法补帧:', src_dir)
        return
    print('[tween] 源:', src_dir, '补帧系数:', factor)
    total = (len(files) - 1) * factor + 1  # 总帧数
    out_imgs = []
    for i in range(len(files) - 1):
        a = _load(os.path.join(src_dir, files[i]))
        b = _load(os.path.join(src_dir, files[i + 1]))
        for k in range(factor):  # 不含末点，避免与下一帧起点重复
            t = k / float(factor)
            out_imgs.append(_lerp_img(a, b, t))
    # 追加末帧
    out_imgs.append(_load(os.path.join(src_dir, files[-1])))
    pad = max(2, len(str(total)))
    for i, img in enumerate(out_imgs, start=1):
        name = 'frame_%0*d.png' % (pad, i)
        _save(img, os.path.join(out_dir, name))


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description='野外怪物资源派生工具')
    sub = ap.add_subparsers(dest='cmd', required=True)

    s1 = sub.add_parser('skill_fx')
    s1.add_argument('--src', default=os.path.join(BASE, 'slime_cat', 'skill'))
    s1.add_argument('--out', default=os.path.join(BASE, 'slime_cat'))

    s2 = sub.add_parser('recolor')
    s2.add_argument('--src', default=os.path.join(BASE, 'slime_cat'))
    s2.add_argument('--out', default=os.path.join(BASE, 'slime_cat_skins'))
    s2.add_argument('--hues', default='20,180,300',
                    help='逗号分隔的色相角度列表')

    s3 = sub.add_parser('tween')
    s3.add_argument('--src', default=os.path.join(BASE, 'shadow_mouse', 'walk'))
    s3.add_argument('--out', default=os.path.join(BASE, 'shadow_mouse', 'walk_tween'))
    s3.add_argument('--factor', type=int, default=2)

    args = ap.parse_args()
    if args.cmd == 'skill_fx':
        derive_skill_fx(args.src, args.out)
    elif args.cmd == 'recolor':
        hues = [float(x) for x in args.hues.split(',') if x.strip() != '']
        derive_recolor(args.src, args.out, hues)
    elif args.cmd == 'tween':
        derive_tween(args.src, args.out, args.factor)
    print('完成。')


if __name__ == '__main__':
    main()
