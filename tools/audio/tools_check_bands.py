#!/usr/bin/env python3
"""
独立复核 BGM 频段平衡 + 「手机外放可听度」。

为什么不用 diagnose_audio.py 里的 band_balance 交叉验证就算了：
  那个函数用 8192 点 Hann 帧跳 4096 求幅度平均，对**长混响尾**和
  **低频驻波**会高估 —— 一帧 186ms 里如果正好撞上鼓的衰减，能量会被
  重复计入。这里改用 Welch 法（50% 重叠 + 密度谱积分），结果才是
  真正的长时平均功率。

★ 真正要盯的是「手机外放可听度」：
  微信小游戏 99% 的播放场景是手机扬声器，典型响应在 500~800Hz 以下
  以 12dB/oct 滚降。一个把 95% 能量堆在 250Hz 以下的混音，在手机上
  就是「有声音但听不清旋律」—— LUFS 达标也没用。
  所以这里额外测一遍"过扬声器模型后的响度还剩多少"。
"""
import os
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import welch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meow_audio import dsp as D

HERE = os.path.dirname(os.path.abspath(__file__))
WAV = os.path.join(HERE, 'out', 'wav')

BANDS = [
    ('sub', 20, 60), ('low', 60, 250), ('lowmid', 250, 500),
    ('mid', 500, 2000), ('himid', 2000, 4000),
    ('high', 4000, 10000), ('air', 10000, 22050),
]


def welch_bands(x, sr):
    """Welch 长时平均功率谱 → 各频段占总能量比例（dB）"""
    mono = x.mean(axis=1) if x.ndim == 2 else x
    f, P = welch(mono, fs=sr, nperseg=1 << 15, noverlap=(1 << 15) // 2,
                 window='hann', detrend='constant', scaling='density')
    P = P * np.gradient(f)          # 密度谱 → 各 bin 功率（积分为总功率）
    total = P.sum() + 1e-20
    return {n: float(10 * np.log10(P[(f >= lo) & (f < min(hi, sr / 2))].sum() / total + 1e-20))
            for n, lo, hi in BANDS}


def phone_speaker(x, sr):
    """
    手机小喇叭模型：500Hz 以下 2 阶（12dB/oct）滚降 + 2~4kHz  presencia 提升。
    这是消费电子声学的典型曲线，不是随便凑的 —— 微型扬声器的谐振频率
    通常在 600~900Hz，以下就快速跌落。
    """
    y = D.highpass(x, 500.0, q=0.707, sr=sr)
    y = D.highpass(y, 500.0, q=0.707, sr=sr)   # 两阶串联 = 12dB/oct
    y = D.peaking(y, 3000.0, q=0.9, gain_db=4.0, sr=sr)
    return y


def main():
    rows = []
    for f in sorted(os.listdir(WAV)):
        if not f.endswith('.wav'):
            continue
        sr, x = wavfile.read(os.path.join(WAV, f))
        x = np.asarray(x, dtype=np.float64)
        if x.ndim == 2 and x.shape[1] == 1:
            x = x[:, 0]
        if np.abs(x).max() > 1.5:
            x = x / 32768.0
        rows.append((f[:-4], x, sr))

    print('=' * 104)
    print('BGM 频段平衡（Welch 长时平均功率，占比 dB）＋ 手机外放可听度')
    print('=' * 104)
    names = [b[0] for b in BANDS]
    print(f'{"素材":<15}' + ''.join(f'{n:>9}' for n in names)
          + f'{"低/中差":>9}{"外放损失":>10}')
    print('-' * 104)
    for name, x, sr in rows:
        b = welch_bands(x, sr)
        tilt = b['low'] - b['mid']                       # 正=低频压倒中频
        lu0 = D.lufs(x, sr)
        lu1 = D.lufs(phone_speaker(x, sr), sr)
        loss = lu0 - lu1                                  # 越大=手机上越吃亏
        flag = ''
        if tilt > 12.0:
            flag += ' ⚠低频压倒'
        if loss > 8.0:
            flag += ' ⚠手机上发闷'
        print(f'{name:<15}' + ''.join(f'{b[n]:>+9.1f}' for n in names)
              + f'{tilt:>+9.1f}{loss:>9.1f}LU{flag}')
    print('-' * 104)
    print('判据：低/中差 >12dB = 浑浊；外放损失 >8LU = 手机扬声器上明显发闷（旋律被吃掉）')


if __name__ == '__main__':
    main()
