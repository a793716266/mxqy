#!/usr/bin/env python3
"""
verify_dsp.py —— DSP 层回归测试

★ 存在的理由：这类 bug 是**静默**的 —— 不报错、不崩、指标看着也正常，
  只是滤波器什么都没做。靠"听感不对"去发现，成本是整个音频工程返工。
  所以必须写成断言：立体声路径与单声道路径必须给出同样（或按设计联动）的
  结果，任何一处 axis 写错都会当场红。

用法：.venv/bin/python tools/audio/verify_dsp.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meow_audio import dsp as D
from meow_audio.dsp import SR

PASS = 0
FAIL = 0
FAILED = []


def ck(cond, name, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  ✓ {name}')
    else:
        FAIL += 1
        FAILED.append(name)
        print(f'  ✗ {name}   {detail}')


def close(a, b, tol=1e-9):
    # equal_nan=True 是必须的：判据里用 np.nan 屏蔽了小信号样本，
    # 不带这个参数 allclose 遇到 NaN 一律返回 False，测试会假失败。
    return bool(np.allclose(np.asarray(a, np.float64),
                            np.asarray(b, np.float64),
                            atol=tol, rtol=0.0, equal_nan=True))


def tone(freq, n=SR, sr=SR, amp=0.5):
    return amp * np.sin(2 * np.pi * freq * np.arange(n) / sr)


def stereo_of(mono, spread=0.7):
    """构造立体声：两声道不同但相关（避免退化成双单声道掩盖 axis bug）"""
    return np.stack([mono, mono * spread + 0.1 * np.roll(mono, 7)], axis=-1)


# ============================================================
print('=' * 78)
print('DSP 回归测试')
print('=' * 78)

# ── 1. 多声道滤波 = 逐声道滤波 ──────────────────────────────
print('\n[1] 滤波器多声道路径（★ 曾静默旁通：lfilter 默认沿最后一轴）')
sig = stereo_of(tone(90) + 0.3 * tone(3000))
for kind, args in [('lp', (2000, 0.7, 0.0)), ('hp', (500, 0.7, 0.0)),
                   ('bp', (1000, 1.0, 0.0)), ('notch', (1000, 4.0, 0.0)),
                   ('peak', (3000, 1.0, 6.0)), ('ls', (200, 0.7, 6.0)),
                   ('hs', (4000, 0.7, 6.0))]:
    fc, q, g = args
    got = D.biquad(sig, kind, fc, q, g, SR)
    want = np.stack([D.biquad(sig[:, c], kind, fc, q, g, SR)
                     for c in range(2)], axis=-1)
    ck(close(got, want, 1e-12), f'{kind:6s} 立体声 == 逐声道',
       f'max err {np.abs(got - want).max():.3g}')

# ── 2. 滤波器真的在起作用（单声道 / 立体声都要衰减）─────────
print('\n[2] 滤波器衰减量（单声道与立体声必须一致，否则就是被旁通）')
for label, x in [('mono', tone(80)), ('stereo', stereo_of(tone(80)))]:
    before = D.rms_db(x)
    after = D.rms_db(D.highpass(x, 500.0, q=0.707, sr=SR))
    drop = before - after
    ck(drop > 25.0, f'80Hz 过 500Hz 高通衰减 >25dB [{label}]', f'实测 {drop:.1f}dB')

# 立体声与单声道的衰减量必须一致（同一内容）
m = tone(80)
dm = D.rms_db(m) - D.rms_db(D.highpass(m, 500.0, 0.707, sr=SR))
ds = D.rms_db(stereo_of(m)) - D.rms_db(D.highpass(stereo_of(m), 500.0, 0.707, sr=SR))
ck(abs(dm - ds) < 0.2, '单声道/立体声衰减量一致', f'{dm:.2f} vs {ds:.2f} dB')

# ── 3. 滤波器包络（逐采样 fc 数组）也要支持立体声 ────────────
print('\n[3] 滤波器包络路径（block 分块）')
n = SR // 2
fc_t = np.linspace(300, 6000, n)
m1 = D.lowpass(np.random.default_rng(1).standard_normal(n), fc_t, 1.0, sr=SR, block=256)
s1 = D.lowpass(stereo_of(np.random.default_rng(1).standard_normal(n)), fc_t, 1.0,
               sr=SR, block=256)
ck(s1.shape == (n, 2), '包络滤波立体声形状正确', str(s1.shape))
ck(close(s1[:, 0], m1, 1e-12), '包络滤波 左声道 == 单声道',
   f'max err {np.abs(s1[:, 0] - m1).max():.3g}')

# ── 4. 压缩器立体声联动 ────────────────────────────────────
print('\n[4] 压缩器（立体声必须联动，不能左右各压各的）')
x = stereo_of(tone(200) * 0.9, spread=0.3)
y = D.compressor(x, sr=SR, thresh_db=-30.0, ratio=6.0, attack=0.005, release=0.15)
# 判据是「左右两个声道拿到的是同一条增益曲线」，而不是直接比信号比值 ——
# 后者在过零点附近会因分母趋零而放大成天文数字，测不出东西。
# 只在两声道都有足够电平的位置比（否则一边是数值一边是 NaN，
# equal_nan 也救不回来）。
m = (np.abs(x[:, 0]) > 1e-3) & (np.abs(x[:, 1]) > 1e-3)
gain_l = y[m, 0] / x[m, 0]
gain_r = y[m, 1] / x[m, 1]
ck(close(gain_l, gain_r, 1e-9), '左右声道同一条增益曲线（声像不游走）',
   f'max dev {np.abs(gain_l - gain_r).max():.3g}')
# 检测器取两声道较大者 → 压出来的结果与「只对较大声道做单声道压缩」一致
g_ref = D.compressor(np.abs(x).max(axis=-1), sr=SR, thresh_db=-30.0, ratio=6.0,
                     attack=0.005, release=0.15) / np.maximum(np.abs(x).max(axis=-1), 1e-12)
ck(close(y, x * g_ref[:, None], 1e-9), '增益曲线 = max(L,R) 检测结果')

# ── 5. 限制器立体声真峰值 ─────────────────────────────────
print('\n[5] 限制器（真峰值天花板 + 立体声联动）')
rng = np.random.default_rng(2)
for label, xx in [('mono', rng.standard_normal(SR) * 0.6),
                  ('stereo', stereo_of(rng.standard_normal(SR) * 0.6))]:
    yy = D.limiter(xx, ceiling_db=-2.0, sr=SR)
    tp = D.true_peak_db(yy, SR)
    ck(tp <= -1.90, f'限制后真峰值 ≤ -2dBTP [{label}]', f'实测 {tp:.2f}dBTP')
    # 联动：左右声道拿到同一条增益曲线
    if label == 'stereo':
        msk = (np.abs(xx[:, 0]) > 1e-3) & (np.abs(xx[:, 1]) > 1e-3)
        gl = yy[msk, 0] / xx[msk, 0]
        gr = yy[msk, 1] / xx[msk, 1]
        ck(close(gl, gr, 1e-9), '限制器左右同一条增益曲线（声像不游走）',
           f'max dev {np.abs(gl - gr).max():.3g}')

# ── 6. 前视窗：ndimage 实现 == np.roll 参考（内部）────────
print('\n[6] 限制器前视窗（ndimage 替代 np.roll 循环）')
from scipy.ndimage import maximum_filter1d


def ref_future(a, la):
    r = a.copy()
    for i in range(1, la):
        r = np.maximum(r, np.roll(a, -i))
    return r


worst = 0.0
for la in range(1, 65):
    a = np.random.default_rng(3 + la).standard_normal(4000)
    e = float(np.abs(ref_future(a, la)[:-la]
                     - maximum_filter1d(a, size=la, mode='nearest',
                                        origin=-(la // 2))[:-la]).max())
    worst = max(worst, e)
ck(worst == 0.0, 'la=1..64 内部逐点一致（差异只在边界，且钳位比回绕更对）',
   f'max err {worst:.3g}')

# ── 7. 真峰值测量 ─────────────────────────────────────────
print('\n[7] 真峰值测量')
st = stereo_of(tone(1000) * 0.8)
ck(abs(D.true_peak_db(st, SR)
       - max(D.true_peak_db(st[:, 0], SR), D.true_peak_db(st[:, 1], SR))) < 1e-9,
   '立体声真峰值 == 两声道最大值')
# 采样间峰值必须被抓到：两个相邻反相采样之间，重建后峰值高于采样点
imp = np.zeros(SR)
imp[1000] = 0.9
imp[1001] = -0.9
ck(D.true_peak_db(imp, SR) > D.lin2db(0.9) + 0.5,
   '能测到采样间峰值（ISP）',
   f'{D.true_peak_db(imp, SR):.2f} vs 采样点 {D.lin2db(0.9):.2f} dBFS')

# ── 8. _peak_follow 与朴素循环一致 ────────────────────────
print('\n[8] 峰值跟随器（递归非线性，无法用 lfilter 近似）')
a = np.abs(np.random.default_rng(4).standard_normal(3000))
rel = np.exp(-1.0 / (0.2 * SR))
naive = np.empty_like(a)
carry = 0.0
for i, v in enumerate(a):
    carry = max(v, rel * carry)
    naive[i] = carry
ck(float(np.abs(D._peak_follow(a, rel) - naive).max()) < 1e-12,
   '向量化实现 == 逐采样朴素循环',
   f'max err {np.abs(D._peak_follow(a, rel) - naive).max():.3g}')
# 冲激后接零：正好一个时间常数时必须衰减到 1/e
imp = np.zeros(int(0.2 * SR) + 1)
imp[0] = 1.0
ck(abs(D._peak_follow(imp, rel)[-1] - np.exp(-1.0)) < 0.02,
   '冲激后一个时间常数衰减到 1/e',
   f'{D._peak_follow(imp, rel)[-1]:.4f} vs {np.exp(-1.0):.4f}')

# ── 9. 削峰校准精度 ───────────────────────────────────────
print('\n[9] 过采样 tanh 软削波（削减量校准，参照量 = 真峰值）')
for want in (2.0, 4.0, 6.0, 10.0, 14.0):
    xin = np.random.default_rng(5).standard_normal(SR // 2)
    xin /= np.abs(xin).max()
    tp_in = D.true_peak_db(xin, SR)
    got = tp_in - D.true_peak_db(D.shave_peaks(xin, want, SR), SR)
    ck(abs(got - want) < 0.1, f'设定削 {want:.0f}dB → 真峰值实降 {got:.2f}dB',
       f'偏差 {got - want:+.2f}dB')
# 立体声也要能削，且两声道一起削
xst = stereo_of(np.random.default_rng(5).standard_normal(SR // 2))
xst /= np.abs(xst).max()
tp_s = D.true_peak_db(xst, SR)
got_s = tp_s - D.true_peak_db(D.shave_peaks(xst, 6.0, SR), SR)
ck(abs(got_s - 6.0) < 0.1, f'立体声削峰 6dB → 真峰值实降 {got_s:.2f}dB')

# ── 10. reduce_plr 只削到达标线 ──────────────────────────
print('\n[10] PLR 削减（达标素材一个 dB 都不该动）')
# 低 PLR 素材（方波，峰均比≈0）不该被削
sq = np.sign(np.sin(2 * np.pi * 220 * np.arange(SR) / SR)) * 0.9
sta = {}
z, drop = D.reduce_plr(sq, SR, target_plr=13.0, stats=sta)
ck(sta.get('shave_db', 0.0) == 0.0 and drop == 0.0, '低 PLR 素材一个 dB 都不动',
   f"shave={sta.get('shave_db')} drop={drop}")
# 高 PLR 素材要被削到达标线以下
xn = np.random.default_rng(6).standard_normal(SR)
xn[int(0.5 * SR)] = 8.0                       # 单个极端尖峰 → PLR 很大
st2 = {}
z2, drop2 = D.reduce_plr(xn, SR, target_plr=13.0, stats=st2)
ck(st2['plr_out'] <= 13.05, '高 PLR 素材削到达标线',
   f"PLR {st2['plr_in']:.1f} → {st2['plr_out']:.1f}")
ck(st2.get('shave_db', 0.0) > 1.0, '确实发生了削减', f"{st2.get('shave_db'):.1f}dB")
# 削减量与 PLR 下降量应当接近（只压峰值，响度基本不变）
ck(abs(drop2 - (st2['plr_in'] - st2['plr_out'])) < 1.0,
   'PLR 下降量 ≈ 削减量（响度基本不动）',
   f"drop={drop2:.2f} vs ΔPLR={st2['plr_in'] - st2['plr_out']:.2f}")

# ── 11. 响度测量不能有内部门控 ────────────────────────────
print('\n[11] 短时响度 = 3s 矩形窗 + K 加权 + 均方（无内部门控）')
n = int(6.0 * SR)
xm = np.concatenate([np.random.default_rng(7).standard_normal(n // 2) * 0.5,
                     np.zeros(n // 2)])
# 手工按标准定义直算一个 3s 窗（单声道 = 1 个声道，不复制）
seg = xm[:int(3.0 * SR)]
expect = -0.691 + 10 * np.log10(float(np.mean(D._k_weight(seg, SR) ** 2)))
got = D.loudness_series(xm, SR, 3.0, 0.1)[0]
ck(abs(got - expect) < 0.05, '首个短时窗 == 标准定义直算',
   f'{got:.3f} vs {expect:.3f} LUFS')

# ── 12. LRA 已知答案校验 ──────────────────────────────────
print('\n[12] LRA（两段恒定电平，理论值 = 两段的 LUFS 之差）')
# 落差必须**明显小于** -20 LU 的相对门，否则轻的那段会被门掉 ——
# 之前用 20dB 落差，轻段正好卡在门限上被削掉一半，测出 3.6LU 而非 20LU。
seg_len = int(4.0 * SR)
lo = np.random.default_rng(8).standard_normal(seg_len) * 0.1     # 轻
hi = np.random.default_rng(9).standard_normal(seg_len) * 0.5     # 响（+14dB）
two = np.concatenate([lo] * 3 + [hi] * 3)        # 各 12s，保证都进 10/95 百分位
meas = D.lra(two, SR)
theory = D.lufs(hi, SR) - D.lufs(lo, SR)
ck(abs(meas - theory) < 2.0, 'LRA ≈ 两段电平差',
   f'实测 {meas:.2f} vs 理论 {theory:.2f} LU')

# ── 13. 确定性（同种子两次结果一致）────────────────────────
print('\n[13] 确定性')
a1 = D.pink_noise(4096, seed=12345)
a2 = D.pink_noise(4096, seed=12345)
ck(close(a1, a2), 'pink_noise 同种子一致')
ck(not close(a1, D.pink_noise(4096, seed=12346)), 'pink_noise 异种子不同')

print('\n' + '=' * 78)
print(f'结果：{PASS} 通过 / {FAIL} 失败')
if FAILED:
    print('失败项：')
    for f in FAILED:
        print('  -', f)
print('=' * 78)
sys.exit(1 if FAIL else 0)
