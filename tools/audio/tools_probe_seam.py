#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
循环完整性探针 —— 回答三个问题，而不是直接去调参数。

【一】循环体长度是否 == 乐句长度
    循环点必须踩在小节线上。曾经 6 首循环曲每首都短 0.600s：
    crossfade_loop 用 concat([头尾交叠段, 主体]) 构造，输出必然比输入少
    xfade_s 个样本。后果不是"接缝响一声"，而是**每循环一次节拍往前挪 0.6s** ——
    接缝类指标量不出这种缺陷，只能靠长度断言抓。

【二】循环点有没有孤立阶跃（真咔哒）
    判据见 dsp.loop_seam_error：循环点那**一个**样本的跳变，
    相对邻域 ±0.5s 内单样本差分的 99.9 分位。>0dB 才可能听到咔哒。
    （旧判据是拿接缝窗均值比全曲中段均值，量的是"热闹"不是"断裂"，
      bgm_grassland 被它误报 6.63dB，实测阶跃只有邻域最大差分的 0.30 倍。）

【三】跨越循环点的包络剖面
    看循环点是不是落在一个"自然的"位置上。若紧邻循环点的一两格冲高
    而两侧平缓，就是硬切断的痕迹；若整片平缓，说明循环点只是比别处热闹。

用法：
    .venv/bin/python tools_probe_seam.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meow_audio import dsp as D          # noqa: E402
from meow_audio.dsp import SR            # noqa: E402
import build_bgm as B                    # noqa: E402

WIN = 2048


def load(path):
    from scipy.io import wavfile
    _sr, d = wavfile.read(path)
    y = np.asarray(d, dtype=np.float64)
    if y.dtype.kind == 'i':
        y = y / 32768.0
    return y


def main():
    print('=' * 80)
    print('【一】循环体长度 vs 乐句长度（差 0 才是循环点踩在小节线上）')
    print('=' * 80)
    print(f'{"曲目":16s} {"乐句":>9s} {"循环体":>9s} {"差值":>8s} {"余音tail":>9s}  判定')
    for name, fn, preset, loop in B.TRACKS:
        if not loop:
            continue
        a = fn()
        y, _dry, loop_n = B.render_track(a, preset, loop)
        d = (len(y) - loop_n) / SR
        flag = '✓' if d == 0.0 else f'✗ 每循环漂移 {d:+.3f}s'
        print(f'{name:16s} {loop_n/SR:9.3f} {len(y)/SR:9.3f} {d:+8.3f} '
              f'{B.loop_tail_s(preset):9.2f}  {flag}')

    print()
    print('=' * 80)
    print('【二】循环点孤立阶跃（>0dB 才会听到咔哒）')
    print('=' * 80)
    print(f'{"曲目":16s} {"接缝阶跃":>10s} {"邻域最大":>10s} {"邻域P99.9":>11s} '
          f'{"阶跃dB":>9s}  判定')
    for name, _fn, _preset, loop in B.TRACKS:
        if not loop:
            continue
        y = load(os.path.join(B.OUT_WAV, f'{name}.wav'))
        n = len(y)
        # 逐声道取较大值（左右反相的阶跃不会因求平均互相抵消）
        step = max(abs(float(y[0, c]) - float(y[-1, c]))
                   for c in range(y.shape[1]))
        half = int(0.5 * SR)
        nb = np.concatenate([y[n - half:-1], y[:half]])
        dn = np.abs(np.diff(nb, axis=0)).max(axis=1)
        mx, p999 = float(dn.max()), float(np.percentile(dn, 99.9))
        db = D.loop_seam_error(y, SR)
        flag = '✓ 无咔哒' if db <= 0.0 else f'✗ 孤立阶跃 {db:+.2f}dB'
        print(f'{name:16s} {step:10.6f} {mx:10.6f} {p999:11.6f} {db:+9.2f}  {flag}')

    print()
    print('=' * 80)
    print('【三】跨越循环点的 |diff| 峰值剖面（每格 128 样本 ≈ 2.9ms，跨度 ±0.25s）')
    print('=' * 80)
    for name, _fn, _preset, loop in B.TRACKS:
        if not loop:
            continue
        y = load(os.path.join(B.OUT_WAV, f'{name}.wav'))
        n = len(y)
        half = int(0.25 * SR)
        nb = np.concatenate([y[n - half:], y[:half]])
        d = np.abs(np.diff(nb, axis=0)).max(axis=1)
        w = 128
        m = (len(d) // w) * w
        peaks = d[:m].reshape(-1, w).max(axis=1)
        dall = np.abs(np.diff(y, axis=0)).max(axis=1)
        m2 = (len(dall) // w) * w
        med = float(np.median(dall[:m2].reshape(-1, w).max(axis=1)))
        rel = D.lin2db(np.maximum(peaks, 1e-12) / max(med, 1e-12))
        mid = len(rel) // 2
        seg = rel[mid - 8: mid + 8]
        print(f'{name:16s} ' + ' '.join(f'{v:+5.1f}' for v in seg))
    print('（中间两格之间就是循环点；只有紧邻的 1~2 格冲高才是硬切断的痕迹）')


if __name__ == '__main__':
    main()
