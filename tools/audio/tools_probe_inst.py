#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
分声部能量探针 —— 想知道该动哪个声部，就先把每个声部单独渲染出来量。

为什么必须这么干：母带会把整曲归一到固定 LUFS，所以「把一个声部调小」是零和的 ——
  你调小的那部分能量会被归一补回来，其他声部反而变响，**比例一点没变**。
  这就是 earlier 把战斗动机升八度、结果低/中差只动 0.3dB 的原因。
  想改变频段比例，必须**把能量从一个频段搬到另一个频段**，而不是删掉它。

本脚本给出每个声部的：
  电平      该声部独奏时相对全曲总能量的 dB（谁在占地方，一目了然）
  低频占比  该声部能量中 <250Hz 的百分比（谁在往手机扬声器听不见的地方堆能量）
  ≥250Hz   该声部搬到 250Hz 以上的那部分能量（相对全曲 dB，越高越"有用"）

用法：.venv/bin/python tools_probe_inst.py [曲名...]     默认 bgm_battle
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meow_audio import dsp as D                      # noqa: E402
from meow_audio.dsp import SR                        # noqa: E402
import build_bgm as B                                # noqa: E402

SPLIT_HZ = 250.0


def band_power(y, lo, hi):
    """Welch 长时平均功率在 [lo, hi) 内的总和。"""
    ys = np.asarray(y, dtype=np.float64)
    if ys.ndim == 2:
        ys = ys.mean(axis=-1)
    n = len(ys)
    win = min(16384, n)
    w = np.hanning(win)
    step = win // 2
    acc = None
    freqs = None
    for s in range(0, n - win, step):
        seg = ys[s:s + win] * w
        sp = np.abs(np.fft.rfft(seg)) ** 2
        acc = sp if acc is None else acc + sp
        if freqs is None:
            freqs = np.fft.rfftfreq(win, 1.0 / SR)
    acc = acc / max(1, len(range(0, n - win, step)))
    m_lo = (freqs >= lo) & (freqs < hi)
    return float(acc[m_lo].sum()), float(acc.sum())


def solo(a, keep):
    """返回只保留 keep 这个声部的编曲副本（音符表浅拷贝，不动其它状态）。"""
    import copy
    b = copy.copy(a)
    b.notes = [nt for nt in a.notes if nt['inst'] == keep]
    return b


def main():
    which = sys.argv[1:] or ['bgm_battle']
    for name, fn, preset, loop in B.TRACKS:
        if name not in which:
            continue
        a = fn()
        full, _dry, loop_n = B.render_track(a, preset, loop)
        full = full[:loop_n] if loop else full
        _, p_full = band_power(full, 0.0, SR / 2)
        lo_full, _ = band_power(full, 0.0, SPLIT_HZ)

        insts = sorted({nt['inst'] for nt in a.notes})
        print('=' * 88)
        print(f'{name}   全曲总功率 {D.lin2db(p_full):.2f}dB  '
              f'<{SPLIT_HZ:.0f}Hz 占比 {100*lo_full/p_full:5.1f}%')
        print('=' * 88)
        print(f'{"声部":16s} {"音符":>5s} {"电平":>8s} {"低频占比":>9s} '
              f'{"≥250Hz能量":>11s} {"纯低频能量":>11s}')
        print('-' * 88)
        rows = []
        for inst in insts:
            b = solo(a, inst)
            if not b.notes:
                continue
            y, _d, ln = B.render_track(b, preset, loop)
            y = y[:ln] if loop else y
            lp, _ = band_power(y, 0.0, SPLIT_HZ)
            _, tp = band_power(y, 0.0, SR / 2)
            if tp <= 0:
                continue
            rows.append((inst, len(b.notes), D.lin2db(tp / p_full),
                         100.0 * lp / tp, D.lin2db((tp - lp) / p_full),
                         D.lin2db(lp / p_full)))
        # 按"纯低频能量"降序：最该被搬走的排在最上面
        for inst, n, lvl, lopct, hi_db, lo_db in sorted(rows, key=lambda r: -r[5]):
            flag = '  ← 低频主力' if lopct > 80.0 and lo_db > -18.0 else ''
            print(f'{inst:16s} {n:5d} {lvl:8.2f} {lopct:8.1f}% '
                  f'{hi_db:11.2f} {lo_db:11.2f}{flag}')
        print()


if __name__ == '__main__':
    main()
