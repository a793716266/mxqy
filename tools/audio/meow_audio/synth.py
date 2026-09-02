"""
synth.py —— 管弦乐 + 民谣 乐器音色库

每个乐器都按真实乐器的**物理行为**建模，而不是「正弦波 + 泛音叠加」：

  弦乐   : ensemble detune（合唱感）+ 渐入揉弦 + 弓毛噪声 + 弓压滤波包络
  木笛   : 气声（呼吸噪声）随音高增强 + 极轻的二次谐波
  铜管   : 力度驱动亮度（brightness follows dynamics）+ 强滤波包络
  合唱   : 元音共振峰（formant）三带通 —— 这是「人声」与「合成 pad」的分界
  定音鼓 : 圆形膜振动模态比（1 : 1.504 : 1.742 : 2.0）+ 击打后音高下扫
  竖琴   : 模态合成，高次分音衰减更快
  打击乐 : 瞬态层 / 体层 / 尾层 三层分离设计

统一约定：
  · 所有乐器函数返回单声道 float64 ndarray
  · dur 已包含 release 尾巴，返回长度 = int(dur * sr)，末尾归零
  · vel (0~1) 为力度，同时影响音量与亮度
"""

import numpy as np
from . import dsp as D
from .dsp import SR


# ============================================================
# 通用辅助
# ============================================================

def _reg_area(freq):
    """音区判定：返回 0(低) ~ 1(高)，用于音色随音区自动变化"""
    return float(np.clip((np.log2(max(freq, 20.0) / 110.0)) / 4.0, 0.0, 1.0))


def _vel(vel):
    """力度 -> (增益, 亮度增量)。真实乐器：力度越大越亮"""
    v = float(np.clip(vel, 0.0, 1.4))
    return (v ** 0.75), (0.18 * v)


def humanize(vel, timing, amount=1.0, rng=None):
    """演奏人性化：力度与时值的微小随机扰动，避免机械感"""
    # rng=None 时不能退化成系统熵，否则每次构建出的音频都不一样，无法回归/复现
    rng = rng or np.random.default_rng(0x5EED ^ (int(vel * 4096) & 0xFFFF))
    if amount <= 0:
        return vel, timing, 0.0
    dv = rng.normal(0, 0.035 * amount)
    dt = rng.normal(0, 0.008 * amount)
    dp = rng.uniform(-0.25, 0.25) * amount
    return max(0.05, vel + dv), max(0.0, timing + dt), dp


# ============================================================
# 弦乐组
# ============================================================

def strings(freq, dur, vel=0.8, sr=SR, bright=0.55, attack=0.13, release=0.28,
            vib_rate=5.1, vib_cents=11.0, ensemble=4, spread_cents=9.0,
            seed=None, pan=0.0, block=512):
    """
    弦乐合奏（小提琴/中提琴/大提琴组）。

    为什么不能用单个锯齿波：真实弦乐组是十几把琴在拉，每把琴的音高、
    揉弦相位、起音时刻都有微小差异。单振荡器的弦乐听起来就是「电子琴弦乐」，
    这是最容易被听出来的破绽。ensemble detune 是必须的。
    """
    n = int(dur * sr)
    if n <= 0:
        return np.zeros(0)
    gain, bright_add = _vel(vel)
    rng = np.random.default_rng(seed)
    area = _reg_area(freq)

    out = np.zeros(n)
    for i in range(ensemble):
        # 各声部的固定音分偏移（-spread/2 ~ +spread/2）
        cents = (i / max(ensemble - 1, 1) - 0.5) * 2.0 * spread_cents
        cents += rng.uniform(-2.5, 2.5)
        f = float(freq) * (2.0 ** (cents / 1200.0))

        # 揉弦：渐入（真实演奏者不会一按弦就开始抖）
        vib_c = vib_cents * rng.uniform(0.75, 1.25)
        fe = D.freq_env(f, n, sr=sr, vib_rate=vib_rate * rng.uniform(0.9, 1.1),
                        vib_cents=vib_c, seed=(hash((seed, i)) % 100000) if seed else None)
        # 揉弦深度随时间渐入
        t = np.arange(n) / sr
        vib_ramp = np.clip((t - 0.12) / 0.5, 0.0, 1.0)
        vib_amt = vib_c / 1200.0 * vib_ramp
        fe = f * (2.0 ** (vib_amt * np.sin(2 * np.pi * vib_rate * t
                                           + rng.uniform(0, 2 * np.pi))))

        w = D.osc('saw', fe)
        # 弓压滤波包络：起音瞬间亮，随后回落（模拟弓毛抓弦的建立过程）
        base = (bright + bright_add) * (1.0 - 0.25 * area)
        fc_start = float(freq) * (5.0 + 9.0 * base)
        fc_end = float(freq) * (2.2 + 4.0 * base)
        fc = fc_start + (fc_end - fc_start) * (1 - np.exp(-t / 0.22))
        w = D.lowpass(w, fc, q=0.72, sr=sr, block=block)

        # 每把琴起音略有先后（0~25ms），这是合奏感的另一半
        off = int(rng.uniform(0, 0.025) * sr)
        env = D.env_adsr(n, sr=sr, a=attack * rng.uniform(0.85, 1.2), d=0.14,
                         s=0.82, r=release)
        seg = np.roll(w * env, off)
        seg[:off] *= 0.0
        out += seg

    out /= ensemble

    # 弓毛噪声：起音瞬间的擦弦声（没有它就少了「真实感」的最后一环）
    t = np.arange(n) / sr
    br = D.bandpass(rng.standard_normal(n), min(float(freq) * 3.5, sr * 0.45),
                    q=0.8, sr=sr)
    out += br * np.exp(-t / 0.055) * 0.055 * area

    out *= gain * 1.35
    return D.highpass(out, 90.0, q=0.7, sr=sr)


def strings_pizz(freq, dur, vel=0.9, sr=SR, bright=0.62, seed=None):
    """弦乐拨奏（pizzicato）—— 短促、有弹性的拨弦"""
    n = int(dur * sr)
    gain, bright_add = _vel(vel)
    y = D.modal_synth(float(freq), dur, sr=sr, partials=12,
                      decay_s=max(0.28, min(dur * 0.45, 0.7)),
                      decay_pow=1.25, amp_pow=1.15,
                      brightness=min(0.95, bright + bright_add),
                      attack_s=0.002, seed=seed)
    return D.fit_len(y, n) * gain * 1.1


def strings_tremolo(freq, dur, vel=0.7, sr=SR, rate=7.5, depth=0.55, seed=None):
    """弦乐震音（tremolo）—— 紧张段落与战斗曲常用"""
    y = strings(freq, dur, vel=vel, sr=sr, attack=0.06, seed=seed,
                vib_rate=rate, vib_cents=0.0)
    t = np.arange(len(y)) / sr
    trem = 1.0 - depth * 0.5 * (1.0 - np.cos(2 * np.pi * rate * t))
    return y * trem


# ============================================================
# 拨弦乐器（民谣色彩）
# ============================================================

def harp(freq, dur, vel=0.9, sr=SR, bright=0.72, seed=None, decay_scale=1.0):
    """
    竖琴。模态合成 + 明亮起音。
    竖琴的特征是「晶莹」—— 中高频分音强、衰减快、低分音延音长。
    """
    n = int(dur * sr)
    gain, bright_add = _vel(vel)
    y = D.modal_synth(float(freq), dur, sr=sr, partials=16,
                      decay_s=max(0.9, min(dur * 0.55, 2.4)) * decay_scale,
                      decay_pow=1.05, amp_pow=1.25,
                      brightness=min(0.98, bright + bright_add),
                      attack_s=0.0018, detune_cents=1.5, seed=seed)
    return D.fit_len(y, n) * gain * 0.95


def lute(freq, dur, vel=0.9, sr=SR, bright=0.5, seed=None):
    """
    鲁特琴 / 民谣吉他。比竖琴暗、拨片噪声更明显、中频厚。
    城镇曲的主要节奏织体。
    """
    n = int(dur * sr)
    gain, bright_add = _vel(vel)
    y = D.modal_synth(float(freq), dur, sr=sr, partials=14,
                      decay_s=max(0.5, min(dur * 0.5, 1.6)),
                      decay_pow=1.35, amp_pow=1.05,
                      brightness=min(0.9, bright + bright_add),
                      attack_s=0.003, detune_cents=2.0, seed=seed)
    # 拨片撞击琴身的木质共鸣
    body = D.bandpass(np.random.default_rng(seed if seed is not None else 0x1A7E).standard_normal(n),
                      220.0, q=1.4, sr=sr)
    t = np.arange(n) / sr
    y = y + body * np.exp(-t / 0.03) * 0.16
    return D.fit_len(y, n) * gain * 1.0


def pizz_bass(freq, dur, vel=0.9, sr=SR, seed=None):
    """低音拨弦（大提琴/贝斯拨奏）—— 厚重、衰减快"""
    n = int(dur * sr)
    gain, _ = _vel(vel)
    y = D.modal_synth(float(freq), dur, sr=sr, partials=10,
                      decay_s=max(0.35, min(dur * 0.4, 0.9)),
                      decay_pow=1.5, amp_pow=0.9, brightness=0.45,
                      attack_s=0.004, seed=seed)
    return D.fit_len(y, n) * gain * 1.15


# ============================================================
# 木管
# ============================================================

def flute(freq, dur, vel=0.8, sr=SR, breath=0.55, vibrato=True,
          attack=0.055, release=0.18, seed=None):
    """
    木笛 / 长笛。

    专业要点：长笛接近纯音，但**纯正弦就是破绽**。
    真实长笛 = 强基频 + 极少量 2/3 次谐波 + 明显的气声（呼吸噪声）。
    气声随音高增强（高音区需要更强的气流）。
    """
    n = int(dur * sr)
    if n <= 0:
        return np.zeros(0)
    gain, bright_add = _vel(vel)
    rng = np.random.default_rng(seed)
    f = float(freq)
    area = _reg_area(f)
    t = np.arange(n) / sr

    vib_c = 8.0 if vibrato else 0.0
    fe = D.freq_env(f, n, sr=sr, vib_rate=4.8, vib_cents=vib_c, seed=seed)
    vib_ramp = np.clip((t - 0.18) / 0.6, 0.0, 1.0)
    fe = f * (2.0 ** (vib_c / 1200.0 * vib_ramp *
                      np.sin(2 * np.pi * 4.8 * t + rng.uniform(0, 2 * np.pi))))

    y = np.sin(2 * np.pi * np.cumsum(fe) / sr)
    # 极轻的 2/3 次谐波，给音色一点"木头味"
    y = y + 0.13 * np.sin(2 * np.pi * np.cumsum(fe * 2) / sr) * (0.5 + bright_add)
    y = y + 0.05 * np.sin(2 * np.pi * np.cumsum(fe * 3) / sr)

    # 气声：这是木管的灵魂
    air = rng.standard_normal(n)
    air = D.bandpass(air, min(f * 2.2, sr * 0.45), q=0.55, sr=sr)
    air_env = np.clip(t / 0.05, 0, 1) * (1 - np.exp(-t / 0.09)) * 0.7
    y = y + air * air_env * (breath * (0.10 + 0.10 * area))

    env = D.env_adsr(n, sr=sr, a=attack, d=0.09, s=0.86, r=release)
    return y * env * gain * 0.92


def recorder(freq, dur, vel=0.85, sr=SR, breath=0.95, seed=None):
    """竖笛（更朴素、气声更多、中频突出）—— 民谣风格的主力旋律乐器"""
    return flute(freq, dur, vel=vel, sr=sr, breath=breath, vibrato=False,
                 attack=0.035, release=0.14, seed=seed)


def oboe(freq, dur, vel=0.8, sr=SR, seed=None):
    """双簧管 —— 锯齿谐波丰富、带鼻音，适合民谣与田园段落"""
    n = int(dur * sr)
    gain, bright_add = _vel(vel)
    f = float(freq)
    t = np.arange(n) / sr
    fe = D.freq_env(f, n, sr=sr, vib_rate=5.0, vib_cents=9.0, seed=seed)
    y = D.osc('saw', fe)
    # 双簧管的共振峰：约 1.4k / 2.9k，形成特有的"芦苇"鼻音
    y = D.peaking(y, 1400.0, q=1.6, gain_db=7.0, sr=sr)
    y = D.peaking(y, 2900.0, q=2.2, gain_db=5.0, sr=sr)
    fc = f * 6.0 + (f * 3.0) * np.exp(-t / 0.3)
    y = D.lowpass(y, fc + bright_add * 2000, q=1.1, sr=sr, block=512)
    env = D.env_adsr(n, sr=sr, a=0.05, d=0.1, s=0.85, r=0.2)
    return y * env * gain * 0.75


# ============================================================
# 铜管
# ============================================================

def horn(freq, dur, vel=0.85, sr=SR, bright=0.5, attack=0.085,
         release=0.3, seed=None, block=512):
    """
    圆号 / 法国号。

    铜管的核心特征：**亮度随力度变化**（brightness follows dynamics）。
    弱奏时圆号是柔和的圆润音色，强奏时 brassy 刺亮。
    用滤波器包络 + 力度驱动截止频率来模拟。
    """
    n = int(dur * sr)
    if n <= 0:
        return np.zeros(0)
    gain, bright_add = _vel(vel)
    f = float(freq)
    t = np.arange(n) / sr

    fe = D.freq_env(f, n, sr=sr, vib_rate=4.6, vib_cents=6.0, seed=seed)
    # 起音时的微小音高上滑（铜管吹奏的"唇音建立"）
    k = max(1, int(0.035 * sr))
    fe[:k] = fe[:k] * np.linspace(0.985, 1.0, k)

    y = D.osc('saw', fe)
    b = bright + bright_add
    # 滤波包络：起音时快速打开（"呲"），随后稳定
    fc_open = f * (3.0 + 12.0 * b)
    fc_hold = f * (2.0 + 5.5 * b)
    fc = fc_hold + (fc_open - fc_hold) * np.exp(-t / 0.075)
    y = D.lowpass(y, np.clip(fc, 80, sr * 0.45), q=0.9, sr=sr, block=block)

    env = D.env_adsr(n, sr=sr, a=attack, d=0.12, s=0.85, r=release)
    return y * env * gain * 0.85


def brass_stab(freq, dur, vel=1.0, sr=SR, attack=0.02, seed=None, block=512):
    """铜管强奏短音（战斗曲的节奏重音）"""
    n = int(dur * sr)
    gain, bright_add = _vel(vel)
    f = float(freq)
    t = np.arange(n) / sr
    fe = D.freq_env(f, n, sr=sr, vib_rate=0.0, vib_cents=0.0)
    y = D.osc('saw', fe)
    fc = f * (3.0 + 14.0 * (0.7 + bright_add)) * np.exp(-t / 0.12) + f * 2.5
    y = D.lowpass(y, np.clip(fc, 80, sr * 0.45), q=1.15, sr=sr, block=block)
    env = D.env_adsr(n, sr=sr, a=attack, d=0.09, s=0.55, r=min(0.25, dur * 0.4))
    return y * env * gain * 0.8


# ============================================================
# 人声 / 合唱
# ============================================================

_FORMANTS = {
    'ah': [(800, 9.0), (1150, 7.0), (2900, 4.0)],
    'oh': [(450, 10.0), (800, 8.0), (2800, 3.5)],
    'oo': [(325, 11.0), (700, 7.5), (2530, 3.0)],
    'ee': [(350, 10.0), (2000, 8.5), (2800, 4.5)],
    'mm': [(280, 12.0), (1100, 6.0), (2400, 2.5)],
}


def choir(freq, dur, vel=0.75, sr=SR, vowel='ah', vibrato=True,
          attack=0.35, release=0.5, ensemble=3, seed=None):
    """
    合唱 pad。

    关键：**元音共振峰**。人声之所以是人声，是因为声道形成的共振峰。
    用三个带通滤波器塑造 F1/F2/F3 —— 没有这一步，
    再多的锯齿波也只是「合成 pad」，永远不会像人声。
    """
    n = int(dur * sr)
    if n <= 0:
        return np.zeros(0)
    gain, bright_add = _vel(vel)
    rng = np.random.default_rng(seed)
    f = float(freq)
    t = np.arange(n) / sr

    out = np.zeros(n)
    for i in range(ensemble):
        cents = rng.uniform(-9, 9)
        fi = f * (2.0 ** (cents / 1200.0))
        vib_c = 13.0 if vibrato else 0.0
        vib_ramp = np.clip((t - 0.25) / 0.8, 0.0, 1.0)
        fe = fi * (2.0 ** (vib_c / 1200.0 * vib_ramp *
                           np.sin(2 * np.pi * 4.7 * t + rng.uniform(0, 2 * np.pi))))
        w = D.osc('saw', fe)
        # 男声/女声混合：部分声部只保留奇次谐波（更接近闭口音）
        if i % 3 == 2:
            w = w * 0.6 + D.osc('square', fe) * 0.25
        out += w

    out /= ensemble

    # 元音共振峰
    formant_signal = np.zeros(n)
    for fc_f, fg in _FORMANTS.get(vowel, _FORMANTS['ah']):
        formant_signal += D.bandpass(out, fc_f, q=3.5, sr=sr) * db_gain(fg)
    out = out * 0.35 + formant_signal * 0.65

    out = D.lowpass(out, f * (3.0 + 3.0 * bright_add) + 900, q=0.8, sr=sr, block=512)
    env = D.env_adsr(n, sr=sr, a=attack, d=0.25, s=0.9, r=release)
    return out * env * gain * 0.55


def db_gain(db):
    return 10.0 ** (db / 20.0)


# ============================================================
# 键盘 / 色彩乐器
# ============================================================

def bell(freq, dur, vel=0.9, sr=SR, inharmonic=0.0028, seed=None):
    """
    钟 / 铃 / 钟琴。

    钟的音色 = **非谐性分音**。真实钟体的振动模态不是整数倍：
    1 : 2.0 : 2.4 : 3.0 : 4.5 ... 用整数泛音做钟，听起来就是「电子铃」。
    """
    n = int(dur * sr)
    gain, bright_add = _vel(vel)
    y = D.modal_synth(float(freq), dur, sr=sr, partials=11,
                      decay_s=max(0.8, min(dur * 0.5, 2.8)),
                      decay_pow=0.55, amp_pow=0.85,
                      inharmonic=inharmonic,
                      brightness=min(0.95, 0.7 + bright_add),
                      attack_s=0.0012, seed=seed)
    return D.fit_len(y, n) * gain * 0.72


def glockenspiel(freq, dur, vel=0.85, sr=SR, seed=None):
    """钟琴 / 钢片琴 —— 明亮、清脆、延音中等"""
    n = int(dur * sr)
    gain, bright_add = _vel(vel)
    y = D.modal_synth(float(freq), dur, sr=sr, partials=10,
                      decay_s=max(0.5, min(dur * 0.45, 1.5)),
                      decay_pow=0.8, amp_pow=1.0,
                      inharmonic=0.0012, brightness=min(0.98, 0.85 + bright_add),
                      attack_s=0.001, seed=seed)
    return D.fit_len(y, n) * gain * 0.6


def music_box(freq, dur, vel=0.8, sr=SR, seed=None):
    """音乐盒 —— 八音盒音色，用于城镇/回忆段落的装饰"""
    y = bell(freq, dur, vel=vel * 0.8, sr=sr, inharmonic=0.0015, seed=seed)
    return D.lowpass(y, float(freq) * 8.0 + 2500, q=0.7, sr=sr) * 0.9


# ============================================================
# 打击乐（三层设计：瞬态 / 体 / 尾）
# ============================================================

def perc_layer(n, sr=SR, transient_hz=3000, transient_decay=0.012,
               body_hz=180, body_decay=0.18, body_sweep=0.0,
               tail_hz=6000, tail_decay=0.08, tail_level=0.35,
               seed=None, noise_kind='white'):
    """
    打击乐三层模型。任何真实打击乐都包含：
      瞬态层 (0~15ms) : 决定「打击感」与音头清晰度
      体层   (50~300ms): 决定音高、厚度、材质（木/皮/金属）
      尾层   (衰减噪声): 决定空间感与响度衰减
    分开控制三层 = 能精确塑形任意打击乐。
    """
    rng = np.random.default_rng(seed)
    t = np.arange(n) / sr

    tr = rng.standard_normal(n) if noise_kind == 'white' else D.pink_noise(n, seed)
    tr = D.highpass(tr, transient_hz, q=0.7, sr=sr) * np.exp(-t / max(transient_decay, 1e-4))

    if body_sweep != 0:
        fe = D.freq_sweep(body_hz * (1 + body_sweep), body_hz, n, sr=sr)
        body = np.sin(2 * np.pi * np.cumsum(fe) / sr) * np.exp(-t / body_decay)
    else:
        body = np.sin(2 * np.pi * body_hz * t) * np.exp(-t / body_decay)

    tl = rng.standard_normal(n)
    tl = D.bandpass(tl, tail_hz, q=0.6, sr=sr) * np.exp(-t / max(tail_decay, 1e-4)) * tail_level

    return tr, body, tl


def timpani(freq, dur=1.8, vel=1.0, sr=SR, seed=None):
    """
    定音鼓。

    两个决定性细节：
    1. 圆形鼓膜的振动模态比是 1 : 1.504 : 1.742 : 2.00 : 2.245（贝塞尔函数零点），
       不是整数倍 —— 这才是定音鼓「有音高却不清晰」的原因。
    2. 击打后音高会下滑约一个全音（鼓皮张力瞬间松弛）。
    """
    n = int(dur * sr)
    gain, _ = _vel(vel)
    t = np.arange(n) / sr
    f0 = float(freq)

    # 音高下扫
    fe = f0 * (1.0 + 0.13 * np.exp(-t / 0.06))

    ratios = [1.000, 1.504, 1.742, 2.000, 2.245, 2.494]
    amps = [1.0, 0.62, 0.40, 0.28, 0.16, 0.10]
    taus = [0.9, 0.55, 0.42, 0.33, 0.24, 0.18]

    y = np.zeros(n)
    for r, a, tau in zip(ratios, amps, taus):
        fk = fe * r
        y += a * np.sin(2 * np.pi * np.cumsum(fk) / sr) * np.exp(-t / (tau * (dur / 1.8) ** 0.5))

    # 槌头瞬态
    tr = np.random.default_rng(seed).standard_normal(n)
    tr = D.bandpass(tr, 1200.0, q=0.8, sr=sr) * np.exp(-t / 0.028)
    y = y + tr * 0.32

    env = D.env_ar(n, sr=sr, a=0.003, r=dur * 0.9)
    return y * env * gain * 0.85


def taiko(freq=95.0, dur=1.1, vel=1.0, sr=SR, seed=None):
    """太鼓 / 大鼓 —— 低沉、皮革感强、瞬态沉重"""
    n = int(dur * sr)
    gain, _ = _vel(vel)
    t = np.arange(n) / sr
    fe = float(freq) * (1.0 + 0.55 * np.exp(-t / 0.035))
    body = np.sin(2 * np.pi * np.cumsum(fe) / sr) * np.exp(-t / 0.35)
    body += 0.35 * np.sin(2 * np.pi * np.cumsum(fe * 1.6) / sr) * np.exp(-t / 0.14)

    rng = np.random.default_rng(seed)
    tr = rng.standard_normal(n)
    tr = D.bandpass(tr, 900.0, q=0.7, sr=sr) * np.exp(-t / 0.02) * 0.55
    # 皮革的低频"扑"声
    skin = rng.standard_normal(n)
    skin = D.lowpass(skin, 320.0, q=0.8, sr=sr) * np.exp(-t / 0.06) * 0.5
    return (body + tr + skin) * gain * 0.95


def hand_drum(freq=190.0, dur=0.45, vel=0.9, sr=SR, seed=None):
    """手鼓 / 铃鼓鼓面 —— 民谣节奏的主力"""
    n = int(dur * sr)
    gain, _ = _vel(vel)
    t = np.arange(n) / sr
    fe = float(freq) * (1.0 + 0.4 * np.exp(-t / 0.02))
    body = np.sin(2 * np.pi * np.cumsum(fe) / sr) * np.exp(-t / 0.13)
    rng = np.random.default_rng(seed)
    tr = rng.standard_normal(n)
    tr = D.highpass(tr, 1800.0, q=0.7, sr=sr) * np.exp(-t / 0.008) * 0.5
    return (body * 0.9 + tr) * gain * 0.8


def snare(dur=0.28, vel=0.9, sr=SR, seed=None):
    """军鼓 —— 噪声 + 两个非谐正弦（鼓皮模态）+ 弹簧沙沙声"""
    n = int(dur * sr)
    gain, _ = _vel(vel)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)

    noise = rng.standard_normal(n)
    noise = D.bandpass(noise, 1900.0, q=0.55, sr=sr) * np.exp(-t / 0.075)
    # 鼓皮的两个主要模态
    body = (np.sin(2 * np.pi * 185 * t) * 0.6 + np.sin(2 * np.pi * 331 * t) * 0.4) \
        * np.exp(-t / 0.055)
    # 响弦（snare wires）的高频沙沙
    wires = rng.standard_normal(n)
    wires = D.highpass(wires, 4200.0, q=0.7, sr=sr) * np.exp(-t / 0.09) * 0.42

    return (noise * 0.75 + body * 0.5 + wires) * gain * 0.62


def tambourine(dur=0.5, vel=0.85, sr=SR, seed=None):
    """铃鼓 —— 金属片的多个非谐高频模态叠加"""
    n = int(dur * sr)
    gain, _ = _vel(vel)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(n)
    jingle = np.zeros(n)
    # 金属片的非谐模态（真实铃片的频率比不是整数）
    for f, a, tau in [(3140, 1.0, 0.10), (4210, 0.72, 0.075),
                      (5670, 0.5, 0.055), (7300, 0.34, 0.04),
                      (9100, 0.22, 0.028)]:
        jingle += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)) * np.exp(-t / tau)
    head = D.bandpass(noise, 2600.0, q=0.8, sr=sr) * np.exp(-t / 0.02) * 0.35
    return (jingle * 0.5 + head) * gain * 0.5


def cymbal(dur=1.6, vel=0.8, sr=SR, crash=False, seed=None):
    """镲片 —— 密集非谐模态 + 长衰减噪声"""
    n = int(dur * sr)
    gain, _ = _vel(vel)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(n)
    # 高频"嘶"声，随衰减逐渐变暗（高频先消失）
    fc = 9000.0 * np.exp(-t / (0.5 if crash else 0.22)) + 2200.0
    shimmer = D.highpass(noise, np.clip(fc, 200, sr * 0.45), q=0.6, sr=sr, block=512)
    env = np.exp(-t / (0.9 if crash else 0.35))
    return shimmer * env * gain * (0.30 if crash else 0.22)


def shaker(dur=0.16, vel=0.7, sr=SR, seed=None):
    """沙锤 —— 短促高频噪声"""
    n = int(dur * sr)
    gain, _ = _vel(vel)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(n)
    y = D.highpass(noise, 5500.0, q=0.7, sr=sr)
    env = np.clip(t / 0.008, 0, 1) * np.exp(-t / 0.035)
    return y * env * gain * 0.3


def wood_block(freq=900.0, dur=0.14, vel=0.85, sr=SR, seed=None):
    """木鱼 / 木梆 —— 清脆木质敲击"""
    n = int(dur * sr)
    gain, _ = _vel(vel)
    t = np.arange(n) / sr
    y = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.028)
    y += 0.5 * np.sin(2 * np.pi * freq * 2.7 * t) * np.exp(-t / 0.016)
    tr = np.random.default_rng(seed).standard_normal(n)
    tr = D.highpass(tr, 2600.0, q=0.7, sr=sr) * np.exp(-t / 0.006) * 0.35
    return (y + tr) * gain * 0.5


# ============================================================
# 低音 / 持续音
# ============================================================

def bass_sustained(freq, dur, vel=0.85, sr=SR, bright=0.4, attack=0.02,
                   release=0.12, seed=None, block=512):
    """持续低音（大提琴/低音管/合成 bass）—— 和声的根基"""
    n = int(dur * sr)
    gain, bright_add = _vel(vel)
    f = float(freq)
    t = np.arange(n) / sr
    fe = D.freq_env(f, n, sr=sr)
    y = D.osc('saw', fe) * 0.7 + D.osc('square', fe) * 0.3
    fc = f * (2.5 + 6.0 * (bright + bright_add)) * np.exp(-t / 0.4) + f * 1.6
    y = D.lowpass(y, np.clip(fc, 60, sr * 0.45), q=0.9, sr=sr, block=block)
    env = D.env_adsr(n, sr=sr, a=attack, d=0.1, s=0.8, r=release)
    y = y * env
    # 低音要有"实体感"：加一点次谐波
    sub = np.sin(2 * np.pi * f * 0.5 * t) * env * 0.35
    return (y + sub) * gain * 0.75


def pad(freq, dur, vel=0.6, sr=SR, bright=0.45, attack=0.6, release=0.8,
        seed=None, block=1024):
    """柔和 pad —— 铺底和声，慢起音"""
    n = int(dur * sr)
    gain, bright_add = _vel(vel)
    f = float(freq)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)
    out = np.zeros(n)
    for cents in (-7.0, 0.0, 6.0):
        fi = f * (2.0 ** (cents / 1200.0))
        fe = D.freq_env(fi, n, sr=sr, vib_rate=0.35, vib_cents=4.0,
                        seed=(hash((seed, cents)) % 99991) if seed else None)
        out += D.osc('saw', fe)
    out /= 3.0
    fc = f * (2.0 + 4.0 * (bright + bright_add))
    out = D.lowpass(out, np.clip(fc, 80, sr * 0.45), q=0.7, sr=sr, block=block)
    env = D.env_adsr(n, sr=sr, a=attack, d=0.3, s=0.88, r=release)
    return out * env * gain * 0.42


# ============================================================
# 乐器注册表
# ============================================================

INSTRUMENTS = {
    'strings': strings,
    'strings_pizz': strings_pizz,
    'strings_tremolo': strings_tremolo,
    'harp': harp,
    'lute': lute,
    'pizz_bass': pizz_bass,
    'flute': flute,
    'recorder': recorder,
    'oboe': oboe,
    'horn': horn,
    'brass_stab': brass_stab,
    'choir': choir,
    'bell': bell,
    'glockenspiel': glockenspiel,
    'music_box': music_box,
    'bass': bass_sustained,
    'pad': pad,
}

PERCUSSION = {
    'timpani': timpani,
    'taiko': taiko,
    'hand_drum': hand_drum,
    'snare': snare,
    'tambourine': tambourine,
    'cymbal': cymbal,
    'shaker': shaker,
    'wood_block': wood_block,
}


def get_instrument(name):
    if name in INSTRUMENTS:
        return INSTRUMENTS[name]
    if name in PERCUSSION:
        return PERCUSSION[name]
    raise KeyError(f"未知乐器: {name}；可用: {sorted(list(INSTRUMENTS) + list(PERCUSSION))}")
