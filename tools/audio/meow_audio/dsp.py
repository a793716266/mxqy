"""
dsp.py —— 喵星奇缘音频引擎 / DSP 核心库

设计目标：拒绝「正弦波 + 线性 ADSR + butter 滤波」的玩具级合成。
本模块提供专业音频制作链路所需的基础构件：

  · PolyBLEP 抗锯齿振荡器（naive saw/square 的混叠是业余音色的头号元凶）
  · 指数型 ADSR（RC 充放电曲线，线性包络听起来生硬）
  · RBJ 双二阶滤波器，支持**分块时变系数**（滤波器包络 = 音色灵魂）
  · Karplus-Strong 物理建模拨弦（谐波随时间真实衰减）
  · 合成 IR 卷积混响（早期反射 + 分频段衰减，真实空间感）
  · 前馈 RMS 压缩器 / 真峰值限制器 / 参量 EQ / MS 立体声展宽
  · ITU-R BS.1770-4 响度（LUFS）与真峰值测量（交付质检）

全部函数输入输出均为 float64 ndarray，内部统一在 [-1,1] 之外允许超出，
由 master 链路负责收敛。
"""

import numpy as np
from scipy.signal import lfilter, fftconvolve, resample_poly
from scipy.ndimage import maximum_filter1d

SR = 44100

# ============================================================
# 基础工具
# ============================================================

def db2lin(db):
    return 10.0 ** (np.asarray(db, dtype=np.float64) / 20.0)


def lin2db(x, floor=-200.0):
    x = np.asarray(x, dtype=np.float64)
    return np.maximum(floor, 20.0 * np.log10(np.maximum(np.abs(x), 1e-12)))


def midi2freq(m):
    """MIDI 音高 -> 频率（Hz），支持小数（微分音 / 弦乐揉弦）"""
    return 440.0 * (2.0 ** ((np.asarray(m, dtype=np.float64) - 69.0) / 12.0))


_NOTE_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def note2midi(name):
    """
    音名 -> MIDI。支持 'C4' 'F#3' 'Bb5' 'Eb4'，省略八度时默认 C4 音区（octave=4）。
    MIDI 60 = C4 = 中央 C（科学音高记号法）。
    """
    name = name.strip()
    pc = _NOTE_PC[name[0].upper()]
    i = 1
    while i < len(name) and name[i] in '#b':
        pc += 1 if name[i] == '#' else -1
        i += 1
    octave = int(name[i:]) if name[i:] else 4
    return (octave + 1) * 12 + pc


def normalize(x, target_dbfs=-1.0):
    """峰值归一化"""
    x = np.asarray(x, dtype=np.float64)
    peak = np.max(np.abs(x))
    if peak < 1e-12:
        return x
    return x * (db2lin(target_dbfs) / peak)


def as_stereo(x):
    """单声道 -> 立体声（复制）"""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        return np.stack([x, x], axis=-1)
    return x


def fit_len(x, n):
    """补齐/截断到长度 n"""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        if len(x) >= n:
            return x[:n]
        return np.pad(x, (0, n - len(x)))
    if len(x) >= n:
        return x[:n]
    return np.pad(x, ((0, n - len(x)), (0, 0)))


def mix(*sigs):
    """对齐长度后相加，返回 float64"""
    n = max(len(np.asarray(s)) for s in sigs)
    out = np.zeros(n, dtype=np.float64)
    for s in sigs:
        s = np.asarray(s, dtype=np.float64)
        out[:len(s)] += s if s.ndim == 1 else s.mean(axis=-1)
    return out


# ============================================================
# 噪声
# ============================================================

def white_noise(n, seed=None):
    rng = np.random.default_rng(seed)
    return rng.standard_normal(int(n))


def pink_noise(n, seed=None):
    """
    Paul Kellet 粉红噪声近似（-3dB/oct）。
    白噪声在音乐语境下刺耳，粉红噪声才是「空气/风/自然底噪」的正确底色。
    """
    rng = np.random.default_rng(seed)
    w = rng.standard_normal(int(n))
    b = np.zeros(7)
    out = np.empty(int(n))
    for i, x in enumerate(w):
        b[0] = 0.99886 * b[0] + x * 0.0555179
        b[1] = 0.99332 * b[1] + x * 0.0750759
        b[2] = 0.96900 * b[2] + x * 0.1538520
        b[3] = 0.86650 * b[3] + x * 0.3104856
        b[4] = 0.55000 * b[4] + x * 0.5329522
        b[5] = -0.7616 * b[5] - x * 0.0168980
        out[i] = (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + x * 0.5362) * 0.11
        b[6] = x * 0.115926
    return out


# ============================================================
# 振荡器（PolyBLEP 抗锯齿）
# ============================================================

def _poly_blep(t, dt):
    """
    PolyBLEP 残差校正项。
    在波形的间断点处插入一个二阶多项式脉冲，把频谱混叠能量压低 ~20dB。
    这是「听起来像软音源」而不是「听起来像 90 年代 MIDI」的关键。
    """
    dt = np.clip(np.asarray(dt, dtype=np.float64), 1e-9, 0.5)
    out = np.zeros_like(t)
    lo = t < dt
    x = t[lo] / dt[lo] if dt.ndim else t[lo] / dt
    out[lo] = x + x - x * x - 1.0
    hi = t > (1.0 - dt)
    x2 = (t[hi] - 1.0) / (dt[hi] if dt.ndim else dt)
    out[hi] = x2 * x2 + x2 + x2 + 1.0
    return out


def osc(shape, freq, sr=SR, phase0=0.0):
    """
    抗锯齿振荡器。freq 可为标量或逐采样数组（支持揉弦/滑音/扫频）。

    shape: 'sine' | 'saw' | 'square' | 'tri'
    """
    n = len(freq) if np.ndim(freq) else None
    f = np.asarray(freq, dtype=np.float64)
    if n is None:
        raise ValueError("osc: freq 必须是逐采样数组（用 freq_env 生成）")
    dt = np.clip(f / sr, 1e-9, 0.5)
    ph = phase0 + np.cumsum(f) / sr
    t = np.mod(ph, 1.0)

    if shape == 'sine':
        return np.sin(2.0 * np.pi * t)
    if shape == 'saw':
        return (2.0 * t - 1.0) - _poly_blep(t, dt)
    if shape == 'square':
        t2 = np.mod(t + 0.5, 1.0)
        s1 = (2.0 * t - 1.0) - _poly_blep(t, dt)
        s2 = (2.0 * t2 - 1.0) - _poly_blep(t2, dt)
        return s1 - s2
    if shape == 'tri':
        # 三角波谐波按 1/n^2 衰减，混叠能量本就很低；
        # 再叠一次 PolyBLEP 校正保证高音区干净。
        s = (2.0 * t - 1.0) - _poly_blep(t, dt)
        return 2.0 * np.abs(s) - 1.0
    raise ValueError(f"osc: 未知波形 {shape}")


def freq_env(base_freq, n, sr=SR, vib_rate=0.0, vib_cents=0.0,
             glide_from=None, glide_time=0.0, seed=None):
    """
    生成逐采样瞬时频率轨迹，支持：
      · vibrato（揉弦/颤音，rate Hz + cents 深度）
      · glide（滑音，从 glide_from 滑到 base_freq）
    """
    f = np.full(int(n), float(base_freq))
    if glide_from and glide_time > 0:
        k = int(glide_time * sr)
        k = min(k, n)
        f[:k] = np.linspace(float(glide_from), float(base_freq), k)
    if vib_rate > 0 and vib_cents > 0:
        t = np.arange(n) / sr
        # 揉弦有随机相位，否则所有音符同步抖动会非常机械
        ph = 0.0
        if seed is not None:
            ph = np.random.default_rng(seed).uniform(0, 2 * np.pi)
        f = f * (2.0 ** ((vib_cents / 100.0) * np.sin(2 * np.pi * vib_rate * t + ph) / 12.0))
    return f


def freq_sweep(f0, f1, n, sr=SR, curve='exp'):
    """扫频轨迹（用于 kick 音高包络、whoosh、镲片等）"""
    n = int(n)
    if curve == 'exp':
        return np.exp(np.linspace(np.log(max(f0, 1e-6)), np.log(max(f1, 1e-6)), n))
    return np.linspace(f0, f1, n)


# ============================================================
# 包络（指数型，非线性的线性）
# ============================================================

def env_adsr(n, sr=SR, a=0.01, d=0.1, s=0.7, r=0.2, exp_curve=True):
    """
    ADSR 包络。
    exp_curve=True 时使用 RC 充放电曲线（1-exp），听感自然；
    False 时退化为线性（仅用于对比/特殊音色）。
    s 为延音电平（0~1），r 为释音时长（秒）。
    """
    n = int(n)
    a_n, d_n, r_n = int(a * sr), int(d * sr), int(r * sr)
    s_n = max(0, n - a_n - d_n - r_n)

    if exp_curve:
        atk = 1.0 - np.exp(-5.0 * np.arange(a_n) / max(a_n, 1)) if a_n else np.zeros(0)
        dec = (s + (1.0 - s) * np.exp(-5.0 * np.arange(d_n) / max(d_n, 1))) if d_n else np.zeros(0)
        rel = s * np.exp(-5.0 * np.arange(r_n) / max(r_n, 1)) if r_n else np.zeros(0)
    else:
        atk = np.linspace(0, 1, a_n) if a_n else np.zeros(0)
        dec = np.linspace(1, s, d_n) if d_n else np.zeros(0)
        rel = np.linspace(s, 0, r_n) if r_n else np.zeros(0)

    env = np.concatenate([atk, dec, np.ones(s_n) * s, rel])
    return fit_len(env, n)


def env_ar(n, sr=SR, a=0.005, r=0.3, exp_curve=True):
    """打击乐用 AR 包络"""
    n = int(n)
    a_n = min(int(a * sr), n)
    r_n = n - a_n
    if exp_curve:
        atk = 1.0 - np.exp(-5.0 * np.arange(a_n) / max(a_n, 1)) if a_n else np.zeros(0)
        rel = np.exp(-5.0 * np.arange(r_n) / max(r_n, 1)) if r_n else np.zeros(0)
    else:
        atk = np.linspace(0, 1, a_n) if a_n else np.zeros(0)
        rel = np.linspace(1, 0, r_n) if r_n else np.zeros(0)
    return fit_len(np.concatenate([atk, rel]), n)


def env_exp_decay(n, tau, sr=SR):
    """纯指数衰减 e^{-t/tau}"""
    return np.exp(-np.arange(int(n)) / (max(tau, 1e-6) * sr))


def env_pluck(n, decay_s, sr=SR, curve=1.0):
    """拨弦/钟类衰减：(1-t/T)^curve * exp 混合，比纯 exp 更有「敲击感」"""
    n = int(n)
    T = max(decay_s * sr, 1.0)
    t = np.arange(n) / T
    return np.exp(-3.0 * t) * np.maximum(0.0, 1.0 - t) ** curve


# ============================================================
# 滤波器（RBJ 双二阶 + 分块时变系数）
# ============================================================

def _biquad_coef(kind, fc, q, gain_db, sr):
    """RBJ Audio EQ Cookbook 系数。fc/q/gain 支持数组（逐块）"""
    w0 = 2.0 * np.pi * np.clip(fc, 1.0, sr * 0.49) / sr
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2.0 * np.maximum(q, 1e-6))

    if kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'bp':      # constant 0 dB peak
        b = [alpha, 0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'notch':
        b = [1, -2 * cw, 1]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == 'peak':
        A = 10 ** (np.asarray(gain_db) / 40.0)
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == 'ls':
        A = 10 ** (np.asarray(gain_db) / 40.0)
        # ★ 搁架的 alpha 与钟形/低通不是同一个公式（RBJ cookbook）：
        #     alpha = sin(w0)/2 * sqrt( (A + 1/A)*(1/S - 1) + 2 )
        #   原来这里沿用了 alpha = sin(w0)/(2q)，导致搁架曲线的斜坡形状偏了 ——
        #   K 加权的第一级正是 4dB 高频搁架，于是整条响度测量系统性偏高
        #   ≈0.9dB（对 ffmpeg ebur128 实测：白噪声 -7.91 vs -8.8 LUFS）。
        #   响度测错 1dB，后面所有"归一到 -18 LUFS"就都偏 1dB。
        alpha = sw / 2.0 * np.sqrt((A + 1.0 / np.maximum(A, 1e-9))
                                   * (1.0 / np.maximum(q, 1e-6) - 1.0) + 2.0)
        sa = 2 * np.sqrt(np.maximum(A, 1e-9)) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + sa),
             2 * A * ((A - 1) - (A + 1) * cw),
             A * ((A + 1) - (A - 1) * cw - sa)]
        a = [(A + 1) + (A - 1) * cw + sa,
             -2 * ((A - 1) + (A + 1) * cw),
             (A + 1) + (A - 1) * cw - sa]
    elif kind == 'hs':
        A = 10 ** (np.asarray(gain_db) / 40.0)
        alpha = sw / 2.0 * np.sqrt((A + 1.0 / np.maximum(A, 1e-9))
                                   * (1.0 / np.maximum(q, 1e-6) - 1.0) + 2.0)
        sa = 2 * np.sqrt(np.maximum(A, 1e-9)) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + sa),
             -2 * A * ((A - 1) + (A + 1) * cw),
             A * ((A + 1) + (A - 1) * cw - sa)]
        a = [(A + 1) - (A - 1) * cw + sa,
             2 * ((A - 1) - (A + 1) * cw),
             (A + 1) - (A - 1) * cw - sa]
    else:
        raise ValueError(f"未知滤波器类型: {kind}")

    a0 = np.asarray(a[0], dtype=np.float64)
    b = [np.asarray(v, dtype=np.float64) / a0 for v in b]
    a = [np.asarray(v, dtype=np.float64) / a0 for v in a]
    return b, a


def biquad(x, kind, fc, q=0.707, gain_db=0.0, sr=SR, block=None):
    """
    双二阶滤波器。fc/q 可以是逐采样数组 —— 此时按 block 分块更新系数，
    块间保留滤波器状态，实现平滑的**滤波器包络**（合成音色的灵魂）。

    ★ 多声道必须逐声道沿时间轴滤波。
      lfilter 默认沿 axis=-1，对形状 (n, 2) 的立体声信号会去滤「长度 2 的
      声道轴」而不是 n 个采样点 —— 滤波器被静默旁通，不报错、不警告，
      只是什么都不做。实测：500Hz 二阶高通对 80Hz 正弦
          单声道 -31.8dB（正确）    立体声 -0.9dB（等于旁通）
      母带链的低切（music.master / master_sfx 的 D.highpass）正是在立体声上
      调用的，所以这个 bug 让整条频响整形链路失效 —— 低频没人管，混音才会
      堆成 91% 能量挤在 60~250Hz 的"轰隆"声。回归见 verify_dsp_mono_stereo。
    """
    x = np.asarray(x, dtype=np.float64)
    if x.ndim > 1:
        return np.stack([biquad(x[:, c], kind, fc, q, gain_db, sr, block)
                         for c in range(x.shape[1])], axis=-1)
    n = len(x)
    scalar = np.ndim(fc) == 0 and np.ndim(q) == 0

    if scalar:
        b, a = _biquad_coef(kind, float(fc), float(q), gain_db, sr)
        return lfilter(b, a, x)

    fc_t = np.broadcast_to(np.asarray(fc, dtype=np.float64), (n,))
    q_t = np.broadcast_to(np.asarray(q, dtype=np.float64) * np.ones(n), (n,))
    g_t = np.broadcast_to(np.asarray(gain_db, dtype=np.float64) * np.ones(n), (n,))
    block = int(block or 256)

    out = np.empty(n)
    zi = np.zeros(2)
    for i in range(0, n, block):
        j = min(i + block, n)
        b, a = _biquad_coef(kind, fc_t[i:j].mean(), q_t[i:j].mean(), g_t[i:j].mean(), sr)
        y, zi = lfilter(b, a, x[i:j], zi=zi)
        out[i:j] = y
    return out


def lowpass(x, fc, q=0.707, sr=SR, block=None):
    return biquad(x, 'lp', fc, q, 0.0, sr, block)


def highpass(x, fc, q=0.707, sr=SR, block=None):
    return biquad(x, 'hp', fc, q, 0.0, sr, block)


def bandpass(x, fc, q=1.0, sr=SR, block=None):
    return biquad(x, 'bp', fc, q, 0.0, sr, block)


def notch(x, fc, q=4.0, sr=SR, block=None):
    return biquad(x, 'notch', fc, q, 0.0, sr, block)


def peaking(x, fc, q=1.0, gain_db=0.0, sr=SR, block=None):
    return biquad(x, 'peak', fc, q, gain_db, sr, block)


def eq_param(x, sr=SR, bands=()):
    """
    参量 EQ。bands = [(kind, fc, q, gain_db), ...]
    kind: 'lp' | 'hp' | 'peak' | 'ls' | 'hs' | 'notch'
    """
    y = np.asarray(x, dtype=np.float64)
    for band in bands:
        kind, fc, q, g = band
        y = biquad(y, kind, fc, q, g, sr)
    return y


# ============================================================
# 物理建模：Karplus-Strong 拨弦
# ============================================================

def karplus_strong(freq, dur, sr=SR, damping=0.996, brightness=0.5,
                   pick_pos=0.2, seed=None, level=1.0):
    """
    Karplus-Strong 拨弦（梳状滤波器等价形式，全向量化）。

    原理：延迟线长度 N = sr/freq，每绕一圈做一次两点平均低通 + 阻尼。
    高音绕圈次数多 -> 高频衰减快，这正是真实弦振动的物理行为。
    传递函数 y[n] = 0.5*g*(y[n-N] + y[n-N-1])，用 lfilter 直接求解，
    避免逐采样 Python 循环。

    damping   : 每周期能量保留（越大延音越长）
    brightness: 激励明亮度（1=白噪激励，越小拨片越软）
    pick_pos  : 激励位置，梳状抵消对应谐波（真实拨弦位置影响音色）
    """
    n = int(dur * sr)
    if n <= 0:
        return np.zeros(0)
    N = max(2, int(sr / float(freq)))
    rng = np.random.default_rng(seed)

    ex = rng.standard_normal(N)
    if brightness < 1.0:
        k = int(1 + (1.0 - brightness) * 10)
        ex = np.convolve(ex, np.ones(k) / k, mode='same')
    if pick_pos > 0.01:
        d = max(1, int(N * min(pick_pos, 0.5)))
        ex = ex - np.concatenate([np.zeros(d), ex[:-d]]) * 0.7

    A = np.zeros(N + 2)
    A[0] = 1.0
    A[N] = -0.5 * damping
    A[N + 1] = -0.5 * damping

    x_ex = np.zeros(n)
    x_ex[:min(N, n)] = ex[:min(N, n)]
    y = lfilter([1.0], A, x_ex)
    return y * level


def modal_synth(freq, dur, sr=SR, partials=14, decay_s=1.2, decay_pow=0.9,
                amp_pow=1.0, inharmonic=0.0, odd_only=False, brightness=0.6,
                attack_s=0.003, level=1.0, seed=None, detune_cents=0.0):
    """
    模态合成（Modal Synthesis）—— 真实乐器物理的正确建模方式。

    与「一个衰减正弦 + 几个固定泛音」不同，模态合成让**每个分音独立衰减**，
    且高次分音衰减更快（tau_k = tau / k^decay_pow）。
    真实弦振动的能量就是这样逐级耗散的，这是音色「活起来」的关键。

    partials  : 分音数量
    decay_pow : 衰减指数（越大高次泛音消失越快 = 越暗越柔）
    amp_pow   : 分音振幅 1/k^amp_pow（锯齿~1.0，方波~1.0 且奇次，三角~2.0）
    inharmonic: 非谐性系数（>0 时 f_k = f*k*sqrt(1+B*k^2)，钟/铃/金属必备）
    odd_only  : 只保留奇次分音（单簧管/方波类音色）
    """
    n = int(dur * sr)
    if n <= 0:
        return np.zeros(0)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)
    f0 = float(freq)
    y = np.zeros(n)

    for k in range(1, partials + 1):
        if odd_only and (k % 2 == 0):
            continue
        if inharmonic > 0:
            fk = f0 * k * np.sqrt(1.0 + inharmonic * k * k)
        else:
            fk = f0 * k
        if fk >= sr * 0.49:      # 超过奈奎斯特的分音直接丢弃（防混叠）
            continue
        ak = (1.0 / k) ** amp_pow
        if brightness < 1.0:
            ak *= (brightness ** (k - 1))
        # 每个分音独立衰减 + 随机相位（避免所有分音同相叠加出刺耳尖峰）
        tauk = max(decay_s / (k ** decay_pow), 1e-4)
        ph = rng.uniform(0, 2 * np.pi)
        # 音分 -> 频率比 2^(c/1200)；高次分音失谐略大（真实弦的非刚性）
        cents = rng.uniform(-1.0, 1.0) * detune_cents * (k ** 0.3)
        fk_eff = fk * (2.0 ** (cents / 1200.0))
        y += ak * np.sin(2 * np.pi * fk_eff * t + ph) * np.exp(-t / tauk)

    # 起音瞬态：拨片/弓毛/槌击的噪声爆发（没有它就是「电子音」）
    na = max(1, int(attack_s * sr))
    noise = rng.standard_normal(n) * np.exp(-t / max(attack_s * 0.4, 1e-4))
    noise = bandpass(noise, min(f0 * 6.0, sr * 0.45), q=0.7, sr=sr)
    y = y + noise * 0.28

    atk = 1.0 - np.exp(-5.0 * t / max(attack_s, 1e-5))
    return y * atk * level


# ============================================================
# 效果器
# ============================================================

def delay_line(x, sr=SR, time_s=0.25, feedback=0.35, mix=0.25, damp_hz=6000.0,
               stereo_spread=0.0):
    """
    反馈延迟。反馈环路内带低通阻尼（真实回声高频衰减更快）。
    stereo_spread>0 时左右声道延迟时间错开（乒乓延迟的雏形）。
    """
    x = np.asarray(x, dtype=np.float64)
    mono = x.ndim == 1
    xs = as_stereo(x)
    n = len(xs)
    out = np.zeros_like(xs)

    for ch in range(2):
        sp = stereo_spread * (ch - 0.5) * 2
        d = max(1, int((time_s + sp * time_s * 0.15) * sr))
        sig = xs[:, ch].copy()
        buf = np.zeros(d)
        y = np.zeros(n)
        fb_state = 0.0
        # 阻尼系数（一阶低通）
        a = np.exp(-2.0 * np.pi * damp_hz / sr)
        for i in range(n):
            echo = buf[0]
            y[i] = sig[i] + echo
            fb = sig[i] + echo * feedback
            fb_state = (1 - a) * fb + a * fb_state
            buf = np.roll(buf, -1)
            buf[-1] = fb_state
        out[:, ch] = (1 - mix) * xs[:, ch] + mix * y

    return out if not mono else out.mean(axis=-1)


def make_ir(sr=SR, decay_s=2.0, predelay_s=0.012, size=1.0,
            early=None, damp_hz=4500.0, stereo=True, seed=None,
            tail_lowboost_db=3.0):
    """
    合成脉冲响应（IR）。

    结构：
      1. 预延迟（直达声与第一批反射的时间差，决定「房间大小」的直觉）
      2. 早期反射：若干离散反射，带方向性（左右能量差 → 空间宽度）
      3. 后期混响尾巴：指数衰减噪声，密度随时间上升
      4. 分频段衰减：低频混响时间长、高频衰减快（真实房间的空气吸收）

    返回 (n, 2) 立体声 IR。
    """
    rng = np.random.default_rng(seed)
    n = int(decay_s * sr)
    ir = np.zeros((n, 2 if stereo else 1))

    pre = int(predelay_s * sr)

    # --- 早期反射 ---
    if early is None:
        early = [(0.011, 0.62, -0.4), (0.019, 0.50, 0.55), (0.027, 0.42, -0.7),
                 (0.037, 0.34, 0.8), (0.049, 0.27, -0.5), (0.063, 0.20, 0.35),
                 (0.081, 0.15, -0.25)]
    for t_s, amp, pan in early:
        k = pre + int(t_s * size * sr)
        if k < n:
            if stereo:
                ir[k, 0] += amp * (1 - max(pan, 0)) * 0.9
                ir[k, 1] += amp * (1 + min(pan, 0)) * 0.9
            else:
                ir[k, 0] += amp

    # --- 后期混响尾巴 ---
    for ch in range(ir.shape[1]):
        # 噪声起始段密度低（稀疏反射），随时间变密
        tail = rng.standard_normal(n - pre)
        env = np.exp(-np.linspace(0, 6.5, len(tail)))
        # 低频段延长衰减（空气吸收使高频先消失）
        tail_lp = lowpass(tail * env, damp_hz, q=0.5, sr=sr)
        tail_hp = highpass(tail * env * 0.3, max(damp_hz * 1.5, 2000), q=0.5, sr=sr)
        tail_all = tail_lp + tail_hp
        # 低频尾巴额外增益，让空间感温暖不刺耳
        low_part = lowpass(tail * np.exp(-np.linspace(0, 3.2, len(tail))), 320.0, q=0.7, sr=sr)
        tail_all = tail_all + low_part * db2lin(tail_lowboost_db)
        ir[pre:, ch] += tail_all * (0.16 * size)

    if stereo:
        # 轻微去相关 + 时间错位，避免左右完全相同的「单声道混响」感
        ir[:, 1] = np.roll(ir[:, 1], int(0.0035 * sr))
    return ir


def reverb(x, sr=SR, decay_s=2.0, predelay_s=0.012, size=1.0, mix=0.28,
           damp_hz=4500.0, early=None, seed=None, ir=None, stereo=True):
    """
    卷积混响。用合成 IR + FFT 卷积，比 Schroeder 结构更容易做出
    「大厅 / 房间 / 洞穴」的差异化空间。
    """
    x = np.asarray(x, dtype=np.float64)
    mono = x.ndim == 1
    xs = as_stereo(x)
    if ir is None:
        ir = make_ir(sr=sr, decay_s=decay_s, predelay_s=predelay_s, size=size,
                     damp_hz=damp_hz, early=early, stereo=stereo, seed=seed)
    wet = np.stack([fftconvolve(xs[:, ch], ir[:, min(ch, ir.shape[1] - 1)])[:len(xs)]
                    for ch in range(2)], axis=-1)

    # 自动增益补偿：把湿信号对齐到干信号的 RMS。
    # 不做这一步时，IR 的能量会随 decay_s/早期反射数量剧烈变化，
    # 同一个 mix=0.3 在不同曲子上会差出 10dB —— 混响量完全失控。
    wet_rms = np.sqrt(np.mean(wet ** 2))
    dry_rms = np.sqrt(np.mean(xs ** 2))
    if wet_rms > 1e-9 and dry_rms > 1e-9:
        wet = wet * (dry_rms / wet_rms)

    y = (1 - mix) * xs + mix * wet
    return y if not mono else y.mean(axis=-1)


def saturate(x, drive=1.0, blend=1.0, kind='tanh'):
    """
    软饱和（谐波激励）。
    tanh  : 温暖，奇次谐波为主（模拟变压器/电子管）
    asym  : 非对称，加入偶次谐波（模拟单端放大，更有「模拟味」）
    """
    x = np.asarray(x, dtype=np.float64)
    d = x * max(drive, 1e-6)
    if kind == 'tanh':
        y = np.tanh(d)
    elif kind == 'asym':
        y = np.tanh(d + 0.15 * d ** 2)
    elif kind == 'hard':
        y = np.clip(d, -1.0, 1.0)
    else:
        raise ValueError(kind)
    y = y / np.tanh(max(drive, 1e-6)) if kind != 'hard' else y
    return (1 - blend) * x + blend * y


def _peak_follow(det, rel, max_chunk=4096):
    """
    精确峰值跟随器：瞬时起攻 + 指数释放。

        env[n] = max(det[n], rel * env[n-1])

    这是模拟峰值检波（二极管给电容瞬时充电、电阻缓慢放电）的离散等价。

    ★ 为什么不能用 lfilter 近似：
      一阶低通对 |x| 做平滑，2ms 的瞬态经过 4ms 时间常数后包络只爬到峰值的
      四成，电平被低估十几个 dB，压缩器根本"看不见"瞬态。本项目实测过：
      旧的「两个一阶低通取大」实现，在 thresh=RMS+2、ratio=8.0 这种极端
      设置下，battle_attack 的峰均比还是 21.1 → 22.6 dB（不降反升），
      等于完全旁通 —— 而旁通恰恰发生在最需要压缩的那类素材上。

    递归非线性，无法直接用 lfilter。用「衰减累积最大值」精确向量化：

        env[s+i] = rel^i * max( max_{j<=i}( rel^-j * det[s+j] ), rel*env[s-1] )

    分块计算，块长按 rel 自适应（rel^-L 控制在 1e6 量级），既精确又不溢出。
    """
    det = np.asarray(det, dtype=np.float64)
    n = len(det)
    if n == 0:
        return det
    denom = -np.log(max(rel, 1e-12))
    L = int(min(max_chunk, max(64.0, 13.8 / max(denom, 1e-12))))
    L = max(1, min(L, n))

    ar = np.arange(L, dtype=np.float64)
    ap_full = rel ** ar
    an_full = 1.0 / ap_full

    env = np.empty(n, dtype=np.float64)
    carry = float(det[0])
    pos = 0
    while pos < n:
        m = min(L, n - pos)
        ap = ap_full if m == L else rel ** ar[:m]
        an = an_full if m == L else 1.0 / ap
        v = det[pos:pos + m] * an
        c = np.maximum.accumulate(np.maximum(v, rel * carry))
        blk = c * ap
        env[pos:pos + m] = blk
        carry = float(blk[-1])
        pos += m
    return env


def _box_rms(x, w):
    """长度 w 的滑动 RMS（盒式），O(n) cumsum 实现。"""
    w = max(int(w), 1)
    if w == 1:
        return np.abs(x)
    p = np.concatenate([[0.0], np.cumsum(np.asarray(x, dtype=np.float64) ** 2)])
    y = np.sqrt(np.maximum((p[w:] - p[:-w]) / w, 0.0))
    return fit_len(y, len(x))


def compressor(x, sr=SR, thresh_db=-18.0, ratio=3.0, attack=0.008, release=0.18,
               knee_db=6.0, makeup_db=0.0, lookahead=0.0, detector='peak',
               rms_ms=20.0):
    """
    前馈压缩器（软拐点）。

    ★ 架构：检测器管"看见多少"，起攻管"多快下手"，两者不能混为一谈。
      旧实现把 attack 做成检测器上的一阶低通，结果 attack 越大检测器越瞎，
      瞬态直接漏过去（详见 _peak_follow 的实测注记）。现在：

        检测器 detector -> 'peak' 瞬时起攻的峰值跟随（能看见真实瞬态）
                           'rms'  短窗 RMS（不被单采样尖峰牵着走）
        起攻 attack     -> 作用在**增益衰减量**上，控制增益下压的快慢
        释放 release    -> 检测器的指数释放时间常数

      lookahead 让检测器提前 la 秒看到峰值，起攻平滑带来的延迟被抵消，
      于是"压得住瞬态"和"不削掉起振的冲击感"可以同时成立。

      detector='peak' 用于音效（要真的把峰均比压下来）；
      detector='rms'  用于总线粘合（要的是电平稳定，不是逐瞬态下压）。

    软拐点在阈值 ±knee/2 区间用二次曲线过渡，避免硬压缩的「泵感」。

    ★ 立体声是**联动**的：检测器取两声道较大者，算出一条增益曲线同时作用于
      两个声道。如果左右各压各的，声像会随着电平起伏左右游走 —— 这正是
      "stereo linked" 压缩器存在的原因，也是动圈压缩器的硬件行为。
    """
    x = np.asarray(x, dtype=np.float64)
    if len(x) == 0:
        return x
    n = len(x)
    det = np.abs(x).max(axis=-1) if x.ndim > 1 else np.abs(x)

    if lookahead > 0:
        # 未来窗最大值 = 滑窗膨胀，origin=-(la//2) 让窗口覆盖 [i, i+la-1]。
        # 用 ndimage 的 C 实现，不要写 np.roll 循环：音效只有 1~2 秒还好，
        # BGM 是上百万采样，循环版会慢到不能接受。
        la = max(1, min(int(lookahead * sr), 512))
        det = maximum_filter1d(det, size=la, mode='nearest', origin=-(la // 2))

    if detector == 'rms':
        env = _box_rms(det, max(int(rms_ms * 0.001 * sr), 1))
        env = _peak_follow(env, np.exp(-1.0 / max(release * sr, 1e-6)))
    else:
        env = _peak_follow(det, np.exp(-1.0 / max(release * sr, 1e-6)))

    lvl = lin2db(env, floor=-200.0)
    thr = float(thresh_db)
    k = max(float(knee_db), 1e-6)
    over = lvl - thr

    gain_db = np.zeros(n)
    above = over > k / 2
    below = over < -k / 2
    knee = ~(above | below)

    gain_db[above] = (thr + over[above] / ratio) - lvl[above]
    xk = over[knee]
    gain_db[knee] = ((1.0 / ratio - 1.0) * (xk + k / 2.0) ** 2) / (2.0 * k)

    # 起攻平滑：作用在"增益衰减量"上，而不是作用在检测器上。
    # 这样 attack 调大只会让下压更柔和，不会让压缩器变瞎。
    if attack > 0:
        a_atk = np.exp(-1.0 / max(attack * sr, 1e-6))
        gr = -gain_db
        gr = lfilter([1.0 - a_atk], [1.0, -a_atk], gr, zi=[gr[0]])[0]
        gain_db = -gr

    g = db2lin(gain_db + makeup_db)
    return x * g[:, None] if x.ndim > 1 else (x * g)


def limiter(x, ceiling_db=-1.0, sr=SR, lookahead=0.0015, release=0.05):
    """
    真峰值限制器（前视 + 向量化）。

    先按 4 倍过采样估计 ISP（采样间峰值）—— 只卡采样点峰值是不够的，
    DAC 重建后的真实峰值可能比采样点高出 1dB 以上，这正是
    "母带没削波但播放时有失真" 的根因。

    ★ 立体声：逐声道过采样（各声道的 ISP 是独立的），再逐时刻取两声道最大
      值，用**一条**增益曲线同时压两个声道。
      - 不能只对单声道过采样再套用（会漏掉另一声道的采样间峰）；
      - 也不能 resample_poly 直接喂 2D（默认 axis=-1，会去插值声道轴，
        滤波被静默旁通，见 biquad 里的实测数据）；
      - 更不能左右各压各的（声像游走），理由同 compressor 的立体声联动。
    """
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    if n < 8:
        return x
    ceil = db2lin(ceiling_db)
    ch = x.ndim > 1

    if ch:
        os_abs = np.abs(np.stack([resample_poly(x[:, c], 4, 1)
                                  for c in range(x.shape[1])], axis=-1)).max(axis=-1)
    else:
        os_abs = np.abs(resample_poly(x, 4, 1))
    m = (len(os_abs) // 4) * 4
    tp = os_abs[:m].reshape(-1, 4).max(axis=1)
    tp = fit_len(tp, n)

    # 前视：取未来 lookahead 窗口内的最大峰值
    la = max(1, min(int(lookahead * sr), 64))
    if la > 1:
        # 滑窗膨胀，origin=-(la//2) 把窗口整体推到当前点之后 [i, i+la-1]。
        # 已对 la=1..64 逐点比对 np.roll 参考实现：内部**完全一致**（误差 0），
        # 只有尾部 la 个样本不同 —— np.roll 是环形回绕，会拿文件开头的电平
        # 去决定结尾的增益（毫无道理），ndimage 是边界钳位，反而更正确。
        # 顺带：原来的 np.roll 循环在 BGM 上是 la 次全数组拷贝（上亿次），
        # ndimage 的 C 实现等价且快一个数量级。
        tp_la = maximum_filter1d(tp, size=la, mode='nearest', origin=-(la // 2))
    else:
        tp_la = tp

    gain = np.minimum(1.0, ceil / np.maximum(tp_la, 1e-9))
    g = np.minimum.accumulate(gain)          # 瞬时 attack
    rel = np.exp(-1.0 / max(release * sr, 1e-6))
    smooth = lfilter([1.0 - rel], [1.0, -rel], g, zi=[g[0]])[0]   # 慢释放
    g = np.minimum(g, smooth)
    return x * g[:, None] if ch else (x * g)


def stereo_width(x, width=1.0):
    """
    MS（Mid-Side）立体声展宽。
    width=1 原样；>1 加宽；0 折叠为单声道；<0 反转。
    """
    xs = as_stereo(x)
    mid = (xs[:, 0] + xs[:, 1]) * 0.5
    side = (xs[:, 0] - xs[:, 1]) * 0.5
    side *= max(width, 0.0)
    return np.stack([mid + side, mid - side], axis=-1)


def pan_stereo(x, pan=0.0, law='sqrt'):
    """
    声像。-1 全左，0 中央，+1 全右。
    law='sqrt' 为等功率律（cos/sin），中央位置每声道 -3dB，总功率守恒，
    声像移动时不会有「中间变响」的问题。
    """
    xs = as_stereo(x)
    p = float(np.clip(pan, -1.0, 1.0))
    if law == 'linear':
        gl = 1.0 - max(p, 0.0)
        gr = 1.0 + min(p, 0.0)
    else:
        a = (p + 1.0) * np.pi / 4.0
        gl, gr = np.cos(a), np.sin(a)
    return np.stack([xs[:, 0] * gl, xs[:, 1] * gr], axis=-1)


# ============================================================
# 测量（交付质检）
# ============================================================

def _k_weight(x, sr):
    """ITU-R BS.1770-4 K 加权（高通搁架 + 高频搁架）"""
    # Stage 1: 高频搁架 ~4kHz
    y = biquad(x, 'hs', 1681.97, 0.7071, 3.99, sr)
    # Stage 2: 高通 (RLB) ~38Hz
    y = biquad(y, 'hp', 38.13, 0.5, 0.0, sr)
    return y


def _as_channels(x):
    """统一成 (声道数, 采样数)。单声道保持 1 声道 —— 复制成两路会凭空多 3dB
    （BS.1770 是"输入有几声道就按几声道加权求和"，ffmpeg 与 pyloudnorm 都是
    这个行为：同一段白噪声，单声道 -10.9 LUFS，复制成立体声 -7.9 LUFS）。"""
    xs = np.atleast_2d(np.asarray(x, dtype=np.float64).T)
    if xs.shape[0] > xs.shape[1]:
        xs = xs.T
    return xs


def _k_power_cumsum(xs, sr):
    """
    K 加权后各声道功率的累积和，供 O(1) 滑窗均值使用。

    ★ K 加权必须对**整段连续信号**做一次，绝不能逐块重来。
      逐块 lfilter 从零状态起步，等于在每个块边界重新注入一次滤波器的阶跃
      响应。对平稳素材（白噪声、正弦）这点误差可以忽略（实测 0.09dB），
      但对低频漂移大的素材是灾难 —— 实测一段布朗噪声：连续滤波 -34.9 LUFS，
      逐块滤波 -31.4 LUFS，差 3.5dB。而我们的 BGM 恰好是低频极重的素材
      （bgm_battle 有 91% 能量在 250Hz 以下），正是会被这个 bug 打中的那类。
      BS.1770 的原文也是先对信号做 K 加权、再开窗测功率，从未说过逐块滤波。
    """
    pw = np.stack([_k_weight(np.ascontiguousarray(xs[c]), sr) ** 2
                   for c in range(xs.shape[0])])
    return np.concatenate([np.zeros((pw.shape[0], 1)), np.cumsum(pw, axis=1)], axis=1)


def _blocks_ms(cs, starts, length):
    """各窗口内、各声道功率的均值之和（BS.1770 的 Σ_c G_c·mean(z_c)）"""
    e = starts + length
    return (cs[:, e] - cs[:, starts]).sum(axis=0) / float(length)


def lufs(x, sr=SR):
    """
    ITU-R BS.1770-4 集成响度（LUFS）。
    游戏 BGM 目标约 -18 ~ -16 LUFS，音效可到 -16 ~ -14。

    实现要点（每一条都是实测踩过的坑，详见 verif_dsp.py 与代码注记）：
      · 单声道不复制成两路
      · 各声道功率**求和**（G_L=G_R=1.0），不是平均
      · K 加权对整段连续信号做一次，不逐块重来
      · 400ms 块 **75% 重叠**（BS.1770-4 明确要求）
      · 相对门 = 绝对门后的**响度** -10 LU（含 -0.691 偏移，别漏）
    """
    xs = _as_channels(x)
    block = int(0.4 * sr)
    n = xs.shape[1]
    if n < 8:
        return -120.0
    if n < block:
        block = n
    hop = max(block // 4, 1)                 # 75% 重叠
    starts = np.arange(0, n - block + 1, hop)
    if starts.size == 0:
        return -120.0
    cs = _k_power_cumsum(xs, sr)
    p = np.maximum(_blocks_ms(cs, starts, block), 1e-12)

    # 门控：-70 LUFS 绝对门 + 相对 -10 LU 门（两遍，不迭代）
    l = -0.691 + 10.0 * np.log10(p)
    keep = l > -70.0
    if not keep.any():
        return -120.0
    l_abs, p_abs = l[keep], p[keep]
    rel_gate = (-0.691 + 10.0 * np.log10(max(float(np.mean(p_abs)), 1e-12))) - 10.0
    keep2 = l_abs > rel_gate
    if not keep2.any():
        return -120.0
    return float(-0.691 + 10.0 * np.log10(max(float(np.mean(p_abs[keep2])), 1e-12)))


def loudness_series(x, sr=SR, window_s=3.0, hop_s=0.1):
    """
    短时响度序列（LUFS），EBU Tech 3342 / ITU-R BS.1770。

    ★ 窗内**不能**再套一次 400ms 分块门控 —— 短时响度的定义就是
      「3s 矩形窗 + K 加权 + 均方」，不带任何内部门控。
      之前这里直接调 lufs()（内部有 400ms 分块 + 相对门 -10LU），
      等于在短时窗里又做了一遍门控，测出来的 LRA 系统性偏高：
      bgm_boss 报 8.26LU，按标准算法只有 7.2LU —— 差了整整 1 LU，
      足以让一个不合格的曲子看起来合格。测量错了，整改方向就跟着错。

    返回一维数组，长度 = (len - win)//hop + 1；素材短于窗口时返回单点。

    ★ 与 lufs 同一套口径：连续 K 加权 + cumsum 滑窗。
      原来的实现是「每个 3s 窗各滤一次」，BGM 上百万采样 × 每 0.1s 一窗，
      等于把整首曲子反复滤了几十遍 —— 既慢，又会因逐窗重起步而失真
      （低频漂移大的素材实测差 3.5dB，见 _k_power_cumsum 的注记）。
    """
    xs = _as_channels(x)
    win, hop = int(window_s * sr), int(hop_s * sr)
    n = xs.shape[1]
    if n < win:
        return np.array([lufs(x, sr)])
    starts = np.arange(0, n - win + 1, max(hop, 1))
    if starts.size == 0:
        return np.array([lufs(x, sr)])
    cs = _k_power_cumsum(xs, sr)
    p = np.maximum(_blocks_ms(cs, starts, win), 1e-12)
    return -0.691 + 10.0 * np.log10(p)


def lra(x, sr=SR, window_s=3.0, hop_s=0.1):
    """
    响度范围 LRA（LU），EBU Tech 3342 算法，衡量"整首曲子有多少力度起伏"。

    算法：3s 窗/0.1s 跳步的短时响度序列 -> -70 LUFS 绝对门 -> -20 LU 相对门
          -> 取 95 百分位与 10 百分位之差。

    参考值（便携/手游循环 BGM）：
      < 6 LU   听感"一条直线"，典型 MIDI 铺陈、无编曲起伏 —— 业余感的主要来源
      10~14 LU 本项目的工作区间（见下）
      > 18 LU  动态过大，在手机扬声器/嘈杂环境下安静段会听不见

    ★ 为什么定在 10~14，而不是"越大越有起伏越好"（2026-09-02 修订）：
      上限不是审美问题，是**可听地板**问题。手机外放 -17.5 LUFS 约 70 dB SPL，
      街道环境噪声 65~75 dB —— 安静段每往下 1 dB，就多一截被埋掉。
      实测 LRA 17.5 LU 时，短时响度 L10 掉到 -31 LUFS（比整曲低 13.5 dB），
      循环时会听成"音乐没了又回来"。收到 11~14 LU 后 L10 抬到 -28 以上。
      真实管弦乐现场可达 14~20 LU，但那是听音室场景；
      游戏是在手机扬声器上放、还要盖过音效，所以取 10~14。

    ★ 曾经所有 BGM 的 LRA 都被系统性低估 3~5 LU：旧的循环折叠把乐句末尾的干声
      折回开头（见 fold_loop_tail 的说明），等于给安静段垫了一层不该有的底噪。
      bug 修掉之后真实值才暴露出来，各曲力度弧线随之从 9~12 dB 收到 5.5~10 dB。
      测错的指标会指向错误的整改方向 —— 这条和 K 加权、声道求和是同一类教训。
    """
    ls = loudness_series(x, sr, window_s, hop_s)
    if ls.size < 10:
        return 0.0
    ls = ls[ls > -70.0]                      # 绝对门
    if ls.size < 10:
        return 0.0
    rel = ls.max() - 20.0                    # 相对门（相对最响短时值）
    ls = ls[ls > rel]
    if ls.size < 10:
        return 0.0
    return float(np.percentile(ls, 95) - np.percentile(ls, 10))


def true_peak_db(x, sr=SR, oversample=4):
    """真峰值（dBTP），4 倍过采样估计采样间峰值"""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2:
        return max(true_peak_db(x[:, c], sr, oversample) for c in range(x.shape[1]))
    n = len(x)
    if n < 8:
        return lin2db(np.max(np.abs(x)))
    up = resample_poly(x, oversample, 1)
    return float(lin2db(np.max(np.abs(up))))


def rms_db(x):
    x = np.asarray(x, dtype=np.float64)
    return float(lin2db(np.sqrt(np.mean(x ** 2))))


def crest_db(x):
    """峰均比（dB）—— 过度压缩会让这个值低于 8dB，听感疲劳"""
    return float(true_peak_db(x) - rms_db(x))


def plr_db(x, sr=SR):
    """
    峰/响度比 PLR = 真峰值 - 集成响度（dB）。

    ★ 这是音效母带真正的约束量，比"峰均比"更贴切：
        **可达响度 = 真峰值上限 − PLR**
      分类响度目标一旦定死，PLR 越大的音效能够达到的 LUFS 就越低。
      本项目实测 41 个音效 crest 8.5~25.1dB（中位 16.2），所以同一分类
      内部会散开 6~11 LU —— 玩家听到的就是"宝箱开启比怪物出场还响"这类
      莫名其妙的失衡。根因在 PLR，不在归一化策略。
    """
    tp = true_peak_db(x, sr)
    lu = lufs(x, sr)
    if tp < -100 or lu < -100:
        return 0.0
    return float(tp - lu)


def shave_peaks(x, shave_db=6.0, sr=SR, oversample=4):
    """
    削峰：过采样 + tanh 软削波，**无检测器**。

    ★ 为什么不用压缩器削峰 —— 这里有个绕不开的两难，实测过：
        要削掉瞬态，release 必须快到毫秒级（release=120ms 时峰均比只降 5dB，
        release=2ms 能降 17dB）；
        但 release 一旦快到几毫秒，检测器就会跟着低频波形上下走 —— 40Hz 的
        半周期是 12.5ms，6ms 时间常数下包络在峰间掉 18dB，增益被调制十几 dB。
        那是失真，不是削峰。
      两难的根子在"用时间常数去跟踪电平"这件事本身。

      软削波是**无记忆**的：任一采样的输出只取决于该采样的瞬时值，没有时间
      常数，因此不存在"跟着波形跑"。低电平区 tanh 近似线性（峰值以下 20dB 处
      实测只掉 0.1dB），只有靠近峰值的顶部被压缩 —— 削掉的正是需要削的部分。

    ★ 必须过采样。无记忆非线性会产生 Nyquist 以上的谐波，直接折叠回可听频段
      就是刺耳的混叠失真；4 倍过采样后由 resample_poly 的抗混叠滤波滤除。

    削波量由 tanh 的拐点 u 精确确定：解 tanh(u)/u = 10^(-shave_db/20)，
    则 k = peak/u，波形 y = k*tanh(x/k) 恰好把**真峰值**压低 shave_db：
        y_up(peak) = k*tanh(p/k) = k*tanh(u) = p * tanh(u)/u = p * 10^(-sh/20)

    ★ 削减量的参照量必须是真峰值，不能是采样点峰值。
      上面这套公式精确作用于过采样域（p 就是 4 倍上采样后的峰值），
      但**降采样回去之后采样点会变** —— 抗混叠滤波把 4 倍域的尖峰抹平了，
      所以拿降采样后的采样点峰值去衡量，永远比设定值小三成：
      实测设定 6dB 只测到 4.0dB（比值 0.66），设定 10dB 只测到 7.0dB。
      原来的校准就是量错了对象，跑满 3 轮后 10dB 还差 0.85dB，
      max_shave_db 这个保护上限因此名不副实。
      现在统一用 true_peak_db 衡量（和 plr_db 口径一致），并用割线法求根 ——
      a(s) 对 s 近似线性（斜率 0.66~0.74，随素材略变），从 (0,0) 起割线，
      3 轮内稳定收敛到 0.05dB 内。
    """
    x = np.asarray(x, dtype=np.float64)
    if len(x) == 0 or shave_db <= 0.05:
        return x
    n0 = x.shape[0]
    up = resample_poly(x, oversample, 1, axis=0)
    p = float(np.max(np.abs(up)))
    if p <= 1e-9:
        return x
    tp0 = true_peak_db(x, sr, oversample)       # 削减量的参照基准
    if tp0 < -100:
        return x

    def _solve(r):
        # tanh(u)/u 从 1 单调降到 0，二分求解
        lo, hi = 1e-6, 200.0
        for _ in range(60):
            mid = 0.5 * (lo + hi)
            if np.tanh(mid) / mid > r:
                lo = mid
            else:
                hi = mid
        return 0.5 * (lo + hi)

    def _shape(sh):
        k = p / _solve(db2lin(-sh))
        return fit_len(resample_poly(k * np.tanh(up / k), 1, oversample, axis=0), n0)

    def _actual(y):
        return tp0 - true_peak_db(y, sr, oversample)

    # 割线法：过 (0,0) 与当前 (s, a) 作直线，求 a = shave_db 处对应的 s
    s0, a0 = 0.0, 0.0
    s1, y = float(shave_db), _shape(float(shave_db))
    a1 = _actual(y)
    for _ in range(4):
        if abs(a1 - shave_db) < 0.05 or s1 > 60.0:
            break
        s2 = s0 + (shave_db - a0) * (s1 - s0) / (a1 - a0) if a1 > a0 + 1e-6 \
            else s1 * 1.15 + 0.1
        s0, a0 = s1, a1
        s1 = float(np.clip(s2, 0.0, 60.0))
        y = _shape(s1)
        a1 = _actual(y)
    return y


def reduce_plr(x, sr=SR, target_plr=13.0, max_shave_db=16.0, iters=8,
               stats=None):
    """
    把 PLR 削到 target_plr 以下 —— 二分削波量，**只削到刚好够就停**。

    ★ 必须"按需削"，不能一刀切：
      PLR 本来就低的音效（dmg_crit 8.5dB、monster_spawn 9.3dB、attack_range
      10.1dB）根本不需要处理，一刀切只会把本来干净的冲击感磨平、还白送失真。
      只有 PLR 超过"可达响度 = 峰值上限 − PLR"这条线的才处理，而且到达标线就停。

    ★ 二分是安全的：削得越多 PLR 越低，单调，不会震荡。
      削波量上限 max_shave_db 是保护 —— 极端素材（近乎纯脉冲）削到上限还
      不达标就接受现实，绝不为了凑一个数字把音效削成一坨糊的。

    返回 (处理后信号, 实际 PLR 下降 dB)。
    """
    x = np.asarray(x, dtype=np.float64)
    st = stats if stats is not None else {}
    cur = plr_db(x, sr)
    st['plr_in'] = cur
    st['plr_target'] = float(target_plr)
    if cur <= target_plr + 0.05:
        st['plr_out'] = cur
        st['shave_db'] = 0.0
        return x, 0.0

    # 先算上限，作为"最坏情况下也得用"的兜底
    best = shave_peaks(x, max_shave_db, sr)
    best_s = max_shave_db
    lo, hi = 0.0, max_shave_db
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        z = shave_peaks(x, mid, sr)
        if plr_db(z, sr) > target_plr:
            lo = mid                       # 削得不够
        else:
            hi = mid                       # 达标 -> 记录，再试试更轻的
            best, best_s = z, mid
    st['plr_out'] = plr_db(best, sr)
    st['shave_db'] = best_s
    return best, float(cur - st['plr_out'])


def spectral_centroid(x, sr=SR, frame=8192, hop=4096):
    """
    频谱重心（Hz）—— 衡量明亮度。

    必须分帧后按能量加权平均：只分析开头几千个采样会严重失真
    （例如开头有镲片的曲子会被误判为极亮）。
    """
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2:
        x = x.mean(axis=-1)
    n = len(x)
    if n < frame:
        frame = min(n, 1024)
        hop = max(frame, 1)
    if n < 8:
        return 0.0

    w = np.hanning(frame)
    freqs = np.fft.rfftfreq(frame, 1.0 / sr)
    num = 0.0
    den = 0.0
    for i in range(0, n - frame + 1, hop):
        seg = x[i:i + frame] * w
        mag = np.abs(np.fft.rfft(seg))
        e = mag.sum()
        if e < 1e-12:
            continue
        num += float(np.dot(freqs, mag))
        den += float(e)
    return num / den if den > 0 else 0.0


def band_energy_db(x, sr=SR, bands=((20, 250), (250, 2000), (2000, 6000), (6000, 20000))):
    """分频段能量（dB），用于判断频率平衡是否合理"""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2:
        x = x.mean(axis=-1)
    out = []
    for lo, hi in bands:
        y = x
        if lo > 20:
            y = highpass(y, lo, q=0.7, sr=sr)
        if hi < sr * 0.49:
            y = lowpass(y, hi, q=0.7, sr=sr)
        out.append(rms_db(y))
    return out


def loop_seam_error(y, sr=SR, nb_s=0.5):
    """
    循环接缝误差（dB）—— 只量「咔哒」，不量「热闹」。

    ★ 旧实现的判据是量错了东西，整个换掉：
        旧 = mean|diff|(接缝窗 ±2048 样本) - mean|diff|(信号中间三分之一)
      但 |diff| 的均值与局部频谱亮度、局部电平成正比 —— 它量的是
      "这一段有多热闹"，不是"这里断没断"。实测 bgm_grassland 被报 6.63dB，
      而循环点那一个样本的阶跃只有邻域内最大差分的 0.30 倍，根本没有咔哒；
      只是循环点恰好落在小节强拍（比中段的安静段落热闹）而已。
      判据量错东西时，改判据和改素材都是错的 —— 所以必须先换判据。

    新判据：循环点处**那一个样本**的阶跃 |y[0] - y[-1]|，
            相对循环点邻域（±nb_s 秒）内单样本差分的 99.9 分位。
      咔哒的物理含义是波形在循环点被硬切断，表现为单个样本的跳变
      显著大于周边任何一次正常过渡。这种尖峰只占 2048 样本窗的 1/2048，
      用窗口均值去量会被彻底抹平 —— 必须逐样本比。

    立体声：逐声道算后取较大值（左右反相的阶跃不会因为求平均而互相抵消）。

    返回 <= 0 dB：循环点比邻域 99.9% 的过渡都平滑（正常）。
    返回  > 0 dB：循环点存在孤立阶跃，会听到咔哒。
    """
    y = np.asarray(y, dtype=np.float64)
    n = len(y)
    if n < int(sr):
        return 0.0

    half = int(max(min(nb_s * sr, n // 4), 1))

    def _one(v):
        step = abs(float(v[0]) - float(v[-1]))
        nb = np.concatenate([v[n - half:-1], v[:half]])
        d = np.abs(np.diff(nb))
        ref = float(np.percentile(d, 99.9))
        if ref < 1e-12:
            return 0.0
        return float(lin2db(step / ref))

    if y.ndim == 2:
        return max(_one(y[:, c]) for c in range(y.shape[1]))
    return _one(y)


def dc_offset(x):
    x = np.asarray(x, dtype=np.float64)
    return float(np.mean(x))


def clip_ratio(x, thresh=0.999):
    x = np.asarray(x, dtype=np.float64)
    return float(np.mean(np.abs(x) >= thresh))


# ============================================================
# 无缝循环：把尾部混响尾巴折回开头
# ============================================================

def fold_loop_tail(x, loop_n, tail_n=None):
    """
    精确环形叠加：把「越过循环点的余音」原样折回开头，输出正好 loop_n 个样本。

    数学上的依据：乐句若是周期为 L 的连续信号 r(t)，那么无缝循环体就是
        out[i] = Σ_k r[i + k·L]
    只要尾部余音在 T 秒内衰减干净，求和就只剩两项 —— 直接把 x[L : L+T] 加回
    x[0:T] 即可，**不需要任何淡入淡出**。加淡出反而是错的：余音本来就在自然衰减，
    再乘一条 1→0 的斜线等于把它提前掐掉，循环点会听到"空间突然被抽走"。

    ★ 取代了旧的 make_loopable（已删）。旧版有两个硬伤：
      1) 它折的是 out[:k] += x[-k:] —— **乐句末尾 k 秒的干声**，
         不是余音。干声不是尾巴，折回去等于在小节强拍上叠了一整段上一遍的
         尾声（预回声），而且还让循环点两端同时存在同一段素材，电平翻倍。
      2) 折叠前必须先 x[:loop_n] 截短，而混响是调用方在之后才加的 ——
         于是混响尾巴在截短时就被丢光了，只能拿干声冒充。
      所以调用顺序必须是：render(L+T) → 加混响 → 本函数折回。顺序反了，
      折回去的东西就是错的。

    参数
    ----
    x       : (n, ...) 渲染缓冲，n >= loop_n + tail_n
    loop_n  : 乐句长度（样本）。输出长度严格等于它 —— 循环点必须踩在小节线上。
    tail_n  : 要折回的余音长度（样本），默认取 x 中 loop_n 之后的全部。
    """
    xs = np.asarray(x, dtype=np.float64)
    n = len(xs)
    loop_n = int(loop_n)
    if loop_n <= 0:
        return xs
    if n <= loop_n:
        return xs[:loop_n].copy()
    avail = n - loop_n
    tail_n = avail if tail_n is None else int(tail_n)
    tail_n = int(min(max(tail_n, 0), avail, loop_n))
    out = xs[:loop_n].copy()
    if tail_n > 0:
        out[:tail_n] += xs[loop_n: loop_n + tail_n]
    return out


def crossfade_loop(x, sr=SR, xfade_s=0.35):
    """
    严格无缝循环：把尾部与开头交叉淡化成一个过渡段，并把它放在循环体最前，
    使循环点（文件末尾 -> 文件开头）正好落在原始信号相邻样本之间，从而无缝。

    构造：xf = head*f + tail*(1-f)（开头=尾、结尾=头），
          out = concat([xf, body[k:-k]])。
    循环点：out[-1]=orig[n-k-1] -> out[0]=tail[0]=orig[n-k]，二者在原始信号中相邻，
    故过渡自然、无咔哒。
    """
    xs = np.asarray(x, dtype=np.float64)
    n = len(xs)
    k = int(xfade_s * sr)
    k = min(k, n // 4)
    if k <= 0:
        return xs
    head = xs[:k]
    tail = xs[-k:]
    f = np.linspace(0.0, 1.0, k)
    if xs.ndim == 2:
        f = f[:, None]
    xf = head * f + tail * (1.0 - f)   # 开头=尾，结尾=头
    return np.concatenate([xf, xs[k:-k]])


# ============================================================
# 淡入淡出
# ============================================================

def fade(x, in_s=0.0, out_s=0.0, sr=SR):
    xs = np.asarray(x, dtype=np.float64).copy()
    n = len(xs)
    if in_s > 0:
        k = min(int(in_s * sr), n // 2)
        if xs.ndim == 1:
            xs[:k] *= np.linspace(0, 1, k) ** 1.5
        else:
            xs[:k] *= (np.linspace(0, 1, k) ** 1.5)[:, None]
    if out_s > 0:
        k = min(int(out_s * sr), n // 2)
        if xs.ndim == 1:
            xs[-k:] *= np.linspace(1, 0, k) ** 1.5
        else:
            xs[-k:] *= (np.linspace(1, 0, k) ** 1.5)[:, None]
    return xs
