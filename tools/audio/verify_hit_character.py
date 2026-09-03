#!/usr/bin/env python3
"""
打击音「声学指纹」回归 —— 把「像小霸王 / 像格斗游戏」钉成可判定的数。

★ 为什么要有这个脚本
  用户的主观反馈（"像小霸王"）必须翻译成客观量，否则只能靠猜、改完无法验证。
  但**判据本身也会错**，本项目一天内就错了三次，全都是"量错东西"：
    ① 拿 np.abs(x) 量起振 → 量到的是波形周期（2600Hz 的四分之一周期 = 0.096ms），
       不是包络。起振判据必须用 Hilbert 解析包络。
    ② 在"前 40ms"开窗算频谱 → 对"先挥后中"的音效量到的是风声不是撞击。
       必须从**包络峰值**处开窗。
    ③ 质心按全频带算 → 把手机喇叭放不出来的 <300Hz 也算进去，
       于是"有重量"和"质心达标"互相打架，永远调不到一起。
       质心必须只量**手机能重放的频段**。

  → 这三条的共性：判据量的不是它自以为在量的那个东西。
    每次怀疑素材之前，先怀疑判据。

★ 指标定义（撞击点起 40ms 开窗）
  attack_ms       【只打印，不判定】包络从 10% 峰值到峰值，回看上限 10ms。
                  ★ 为什么不拿它当判据（踩了两次，给了两个相反的错误答案）：
                    ① 直接拿 np.abs(x) 量 → 量到的是**波形周期**不是包络，
                       2600Hz 的四分之一周期 = 0.096ms，和"起振 0.11ms"完全对上。
                    ② 改成包络之后 → 量到 10~60ms，因为风声前摇也算进去了。
                    结论：**分层合成音（风声 + 撞击）的"起振时间"在文件层面
                    不是一个有定义的量**。要量就得量撞击层本身，而交付文件里
                    层已经混在一起了。所以降级为诊断项，判定交给下面那五条。
  sfm             谱平坦度 (几何均值/算术均值)，0~1。1=纯噪声，0=纯音。
                  ≤0.2 就是一根谱线 —— 8 位机的音调通道。
                  ★ 只算 80~8000Hz：算全频带的话，被低通的音效会因为
                    8k 以上全是空频段而把几何均值拉到 0（monster_hit 假报
                    0.042），那是"带宽窄"被误判成"音调化"。
  sub             20~150Hz 能量占比 dB。重量感来源。
  mid             500~2000Hz 能量占比 dB。撞击的"肉"。
  air             2000~8000Hz 能量占比 dB。穿透力，手机上真正听得见的部分。
  centroid_phone  250~8000Hz 内的功率质心 —— 只量手机能重放的频段。
  phone_loss_db   ★ 手机上实际听到的响度损失 = lufs(highpass300(x)) − lufs(x)。
                    模型：小喇叭 300Hz 以下基本放不出来，所以手机听到的
                    就是过 300Hz 高通之后的残差，它的 LUFS 才是真响度。
                    这个值越接近 0，说明能量没有浪费在放不出来的低频上。
                    ⚠️ 别拿"能量占比"当这个判据 —— 占比阈值是拍出来的，
                       没有物理依据；响度差可以直接解释成"手机上轻了几 dB"。

★ 判定
  · sub 显著存在（≥SUB_MIN_DB）—— 没有它就没有重量
  · 不尖薄：air 不得高出 mid 太多（≤AIR_OVER_MID_DB）
  · 不音调化：sfm ≥ SFM_MIN —— 低于它就是 8 位机的音调通道
  · 手机上不亏响度：phone_loss_db ≥ PHONE_LOSS_MIN_DB
  · 手机上不刺耳也不闷：centroid_phone ∈ [CEN_MIN, CEN_MAX]
"""
import os
import sys

import numpy as np
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from meow_audio import dsp as D  # noqa: E402
from meow_audio.dsp import SR  # noqa: E402

WAV_DIR = os.path.join(HERE, 'out', 'wav', 'sfx')
WIN_MS = 40

# ── 判定阈值 ────────────────────────────────────────────────
SUB_MIN_DB = -10.0          # sub 至少要有，低于此 = 没重量
AIR_OVER_MID_DB = 8.0       # air 最多比 mid 高这么多，超出 = 尖薄
SFM_MIN = 0.25              # 低于此 = 音调化（8 位机音调通道）
PHONE_LOSS_MIN_DB = -8.0    # 手机上亏掉的响度上限（见上面 phone_loss_db 的模型）
CEN_MIN, CEN_MAX = 800.0, 3600.0   # 手机频段内的质心窗口

# 需要判定的打击类音效（whoosh/纯金属/系统音不在此列 —— 设计上就不是撞击）
IMPACT_SFX = [
    'battle_hit', 'hit_crit', 'hit_block', 'attack_melee',
    'battle_attack', 'monster_hit', 'battle_sword_slash',
]
# 豁免：设计意图就不是撞击，只做不刺耳的宽松检查
LOOSE_SFX = ['attack_range', 'hit_fireball']


# ── 指标 ────────────────────────────────────────────────────
def load(path):
    sr, x = wavfile.read(path)
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2:
        x = x.mean(axis=1)
    if x.max() > 1.5:
        x /= 32768.0
    return x


def envelope(x):
    """滑窗峰值保持包络（±0.3ms）—— 消掉波形自身的振荡，只留幅度轨迹。

    ★ 不用 Hilbert：它靠整段 FFT 求解析信号，信号**开头**的包络会被环绕
      边界污染。撞击恰恰就在开头（hit_block 的峰值在第 123 个样本），
      污染出来的 0.18ms 完全是假数据。滑窗峰值保持没有边界问题。
    """
    x = np.abs(np.asarray(x, dtype=np.float64))
    w = max(1, int(0.0003 * SR))
    return maximum_filter1d(x, size=2 * w + 1, mode='constant', cval=0.0)


def attack_ms(x, lookback_ms=10.0):
    """包络从 10% 峰值升到峰值的时间（毫秒），回看上限 lookback_ms。

    回看封顶是必要的：撞击前面常有风声/前摇，不封顶就会把整段前摇算成"起振"
    （实测 battle_sword_slash 量出 59.68ms，那是挥剑不是撞击）。
    超过上限说明"没有干净的局部起振"，返回上限值 —— 只是诊断，不作判定。
    """
    e = envelope(x)
    i_pk = int(np.argmax(e))
    thr = 0.1 * e.max()
    lim = int(lookback_ms / 1000.0 * SR)
    for i in range(i_pk, max(-1, i_pk - lim), -1):
        if e[i] < thr:
            return (i_pk - i) / SR * 1000.0
    return lookback_ms


def _window(x, ms=WIN_MS):
    """★ 从**包络峰值**开窗 —— 量的一定是撞击本身，不是前摇/风声。"""
    n = min(int(SR * ms / 1000), len(x))
    s = min(int(np.argmax(envelope(x))), max(0, len(x) - n))
    return x[s:s + n] * np.hanning(n)


def _band(P, f, lo, hi):
    m = (f >= lo) & (f < hi)
    return float(10 * np.log10(np.sum(P[m]) / (np.sum(P) + 1e-20)))


def measure(x):
    seg = _window(x)
    S = np.abs(np.fft.rfft(seg))
    f = np.fft.rfftfreq(len(seg), 1 / SR)
    P = S ** 2 + 1e-20
    # 只量手机能重放的频段：小喇叭 300Hz 以下滚降、8kHz 以上也基本没了
    ph = (f >= 250) & (f < 8000)
    # ★ SFM 只算 80~8000Hz：算全频带会把"带宽窄"误判成"音调化"
    #   （被低通的音效 8k 以上全是空频段，几何均值被拉到 0）
    sb = (f >= 80) & (f < 8000)
    Ss = S[sb] + 1e-12
    # 手机模型：300Hz 以下放不出来 → 过一遍 300Hz 高通，残差的 LUFS 才是手机上的真响度
    lu_full = D.lufs(x, SR)
    lu_phone = D.lufs(D.highpass(np.asarray(x, dtype=np.float64),
                                 300.0, q=0.7, sr=SR), SR)
    return {
        'attack': attack_ms(x),
        'sfm': float(np.exp(np.mean(np.log(Ss))) / np.mean(Ss)),
        'sub': _band(P, f, 20, 150),
        'low': _band(P, f, 150, 500),
        'mid': _band(P, f, 500, 2000),
        'air': _band(P, f, 2000, 8000),
        'centroid_phone': float(np.sum(f[ph] * P[ph]) / np.sum(P[ph])),
        'phone_loss': lu_phone - lu_full,
    }


def judge(m, loose=False):
    """loose = 设计意图就不是撞击（弓弦、火球飞行…），只守"别薄、别像纯音"。

    ★ 重量（sub）这条对它们不成立：一次放箭、一发火球在飞，本来就没有
      低频冲击力。硬套 sub 判据只会逼着给 whoosh 塞低频，塞完就变成闷响。
    """
    bad = []
    if m['air'] - m['mid'] > AIR_OVER_MID_DB:
        bad.append(f"尖薄 air-mid={m['air'] - m['mid']:+.1f}>{AIR_OVER_MID_DB}")
    if m['sfm'] < SFM_MIN:
        bad.append(f"音调化 sfm={m['sfm']:.3f}<{SFM_MIN}")
    if not loose:
        if m['sub'] < SUB_MIN_DB:
            bad.append(f"无重量 sub={m['sub']:.1f}<{SUB_MIN_DB}")
        if m['phone_loss'] < PHONE_LOSS_MIN_DB:
            bad.append(f"手机亏响度 {m['phone_loss']:.1f}dB")
        if not (CEN_MIN <= m['centroid_phone'] <= CEN_MAX):
            bad.append(f"质心越界 cen={m['centroid_phone']:.0f}")
    return bad


def main():
    npass = nfail = 0
    print('打击音声学指纹（撞击点起 40ms 开窗）')
    print(f'{"素材":<15}{"起振":>7}{"SFM":>7}{"sub":>7}{"low":>7}{"mid":>7}'
          f'{"air":>7}{"质心*":>7}{"手机亏":>7}  判定')
    print('-' * 104)
    for name in IMPACT_SFX + LOOSE_SFX:
        p = os.path.join(WAV_DIR, f'{name}.wav')
        if not os.path.exists(p):
            print(f'{name:<15}  [缺失]')
            nfail += 1
            continue
        m = measure(load(p))
        bad = judge(m, loose=(name in LOOSE_SFX))
        tag = ' '.join(bad) if bad else 'PASS'
        print(f'{name:<15}{m["attack"]:>7.2f}{m["sfm"]:>7.3f}{m["sub"]:>7.1f}'
              f'{m["low"]:>7.1f}{m["mid"]:>7.1f}{m["air"]:>7.1f}'
              f'{m["centroid_phone"]:>7.0f}{m["phone_loss"]:>7.1f}  {tag}')
        for b in bad:
            print(f'    ✗ {name}: {b}')
            nfail += 1
        if not bad:
            npass += 1
    print('\n质心* = 250~8000Hz（手机可重放频段）内的功率质心')
    print('手机亏 = lufs(过300Hz高通) − lufs(全频)，即手机上实际少听到多少 dB')
    print(f'判定：{npass} 通过 / {nfail} 失败')
    return 1 if nfail else 0


if __name__ == '__main__':
    sys.exit(main())
