#!/usr/bin/env python3
"""
tools_probe_compression.py —— 量化「总线压缩吃掉多少力度弧线」

为什么要单独做这个探针：
  bgm_boss 的编曲层写了 12 dB 的力度弧线（apply_form 的 dyn_bars），
  但成品 LRA 只有 7.2 LU。差值是编曲没做到位，还是母带链把它压回去了？
  不量化就只能靠猜参数 —— 而猜出来的参数下次换个曲子又会失效。

  本脚本对每首曲子做一遍「母带前的干声 LRA」对照「不同压缩比下的成品 LRA」，
  把链路上每一级的动态损失单独列出来（混响 / 压缩 / 饱和+限制 / 归一）。

用法：.venv/bin/python tools/audio/tools_probe_compression.py
"""
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meow_audio import dsp as D, music as M
from meow_audio.dsp import SR

import build_bgm as B


def chain(y, preset, comp_ratio, target_lufs, ceiling=-2.0, loop=False):
    """复刻 build_bgm.main 的链路，但压缩比可调"""
    st = {}
    y = B.apply_space(y, preset)
    lra_in = D.lra(y)
    # loop 必须与生产一致：探针量到的东西要等于投产的东西。
    y = M.master(y, sr=SR, ceiling_db=ceiling, target_lufs=target_lufs,
                 comp_ratio=comp_ratio, loop=loop,
                 **{k: v for k, v in B.MASTER[preset].items()
                    if k not in ('comp_ratio', 'target_lufs')},
                 stats=st)
    return lra_in, st


def main():
    which = sys.argv[1:] or ['bgm_boss', 'bgm_battle']
    for name, fn, preset, loop in B.TRACKS:
        if name not in which:
            continue
        t0 = time.time()
        a = fn()
        y, dry, _loop_n = B.render_track(a, preset, loop)
        lra_dry = D.lra(dry)

        print('=' * 88)
        print(f'{name}   编曲层 LRA(母带前) = {lra_dry:5.2f} LU   '
              f'({time.time() - t0:.1f}s, {len(a.notes)} 音符)')
        print('=' * 88)
        print(f'{"压缩比":>7}{"母带前(含混响)":>16}{"成品 LRA":>11}'
              f'{"压缩吃掉":>11}{"总损失":>10}{"峰值衰减":>10}{"均值衰减":>10}')
        print('-' * 88)
        tgt = B.MASTER[preset]['target_lufs']
        for ratio in (1.0, 1.2, 1.35, 1.5, 1.8, 2.0):
            lra_in, st = chain(y, preset, ratio, tgt, loop=loop)
            print(f'{ratio:>7.2f}{lra_in:>16.2f}{st["lra"]:>11.2f}'
                  f'{lra_in - st["lra"]:>+11.2f}{lra_dry - st["lra"]:>+10.2f}'
                  f'{st["gr_peak_db"]:>+10.2f}{st["gr_rms_db"]:>+10.2f}')
        print()


if __name__ == '__main__':
    main()
