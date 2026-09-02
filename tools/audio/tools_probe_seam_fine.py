#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
接缝细看 —— 判定"咔哒"必须是**单点跳变**，不能是"整片偏亮"。

loop_seam_error 取的是窗口内 |diff| 的均值，这会做两件事：
  1. 把单个样本的尖峰抹平（尖峰只占 1/2048，均值几乎看不见它）；
  2. 把"这段本来就热闹"当成"接缝不连续"（均值与局部频谱亮度成正比）。
真正的咔哒是循环点处一个样本的阶跃：|y[0] - y[-1]| 显著大于邻域内的最大 |diff|。
本脚本直接比这个。

用法：
    python3 tools_probe_seam_fine.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meow_audio import dsp as D          # noqa: E402
import build_bgm as B                    # noqa: E402

SR = D.SR


def load(path):
    from scipy.io import wavfile
    _sr, d = wavfile.read(path)
    y = np.asarray(d, dtype=np.float64)
    if y.ndim == 2:
        y = y.mean(axis=-1)
    if y.dtype.kind == 'i':
        y = y / 32768.0
    return y


def main():
    print('=' * 84)
    print('循环点单样本阶跃 vs 邻域最大单样本差分')
    print('（阶跃/邻域 > 1 才是真咔哒；< 1 说明循环点比音乐内部的跳变还平缓）')
    print('=' * 84)
    print(f'{"曲目":16s} {"阶跃|y0-y-1|":>13s} {"邻域最大|diff|":>15s} {"邻域P99.9":>12s} '
          f'{"阶跃/最大":>10s}  判定')

    for name, _fn, _space, loop in B.TRACKS:
        if not loop:
            continue
        y = load(os.path.join(B.OUT_WAV, f'{name}.wav'))
        n = len(y)
        # 循环点：文件末尾 -> 文件开头
        step = abs(y[0] - y[-1])
        # 邻域：循环点前后各 0.5s（排除掉接缝本身那一个样本）
        half = int(0.5 * SR)
        nb = np.concatenate([y[n - half:-1], y[:half]])
        dnb = np.abs(np.diff(nb))
        mx = float(dnb.max())
        p999 = float(np.percentile(dnb, 99.9))
        r = step / mx if mx > 1e-12 else 0.0
        flag = '✓ 无咔哒' if r <= 1.0 else f'✗ 真咔哒（{r:.2f}×）'
        print(f'{name:16s} {step:13.6f} {mx:15.6f} {p999:12.6f} {r:10.3f}  {flag}')

    print()
    print('=' * 84)
    print('循环点附近逐 128 样本的 |diff| 峰值剖面（跨度 ±0.25s，看阶跃是否孤立）')
    print('=' * 84)
    for name, _fn, _space, loop in B.TRACKS:
        if not loop:
            continue
        y = load(os.path.join(B.OUT_WAV, f'{name}.wav'))
        n = len(y)
        half = int(0.25 * SR)
        nb = np.concatenate([y[n - half:], y[:half]])
        d = np.abs(np.diff(nb))
        w = 128
        m = (len(d) // w) * w
        peaks = d[:m].reshape(-1, w).max(axis=1)
        # 归一化到全曲中位数邻域峰值
        dall = np.abs(np.diff(y))
        m2 = (len(dall) // w) * w
        pall = dall[:m2].reshape(-1, w).max(axis=1)
        med = float(np.median(pall))
        rel = D.lin2db(np.maximum(peaks, 1e-12) / max(med, 1e-12))
        mid = len(rel) // 2
        seg = rel[mid - 8: mid + 8]
        bars = ' '.join(f'{v:+5.1f}' for v in seg)
        print(f'{name:16s} {bars}')
    print('（中间两格之间就是循环点；若只有紧邻循环点的 1~2 格冲高，才是真阶跃）')


if __name__ == '__main__':
    main()
