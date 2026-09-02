"""
sfx.py —— 游戏音效合成原语

设计原则（与"随便合成一个音"的区别）：

 1. **分层**：任何真实声音 = 瞬态层 + 体层 + 尾层。
    瞬态层（0~15ms）决定"清晰度"，体层决定"力量/音高"，尾层决定"空间"。
    缺少瞬态层的音效在混音里会"糊"，这是业余音效最常见的问题。

 2. **短而准**：游戏音效通常 0.1~1.2 秒。过长的音效会一直占据混音空间，
    让后续音效被掩蔽，玩家听到的就是一团糊。

 3. **频率避让**：BGM 主要能量在 250Hz~4kHz，音效要有辨识度就得
    往更高（金属/魔法的高频瞬态）或更低（冲击的低频体）走。

 4. **有音乐性**：技能音带明确音高（琶音/和声），
    这样连续释放技能时听起来是"演奏"而不是"噪音"。
"""

import functools
import inspect

import numpy as np

from . import dsp as D
from . import synth as S
from .dsp import SR


# ============================================================
# 增益分级（gain staging）
# ============================================================

# vel=1.0 时各原语的统一输出峰值
_PRIM_PEAK = 0.9


def _unit_peak(x):
    """归一到单位峰值 —— 分层配比之前必须先做这一步，否则层间系数没有意义。"""
    x = np.asarray(x, dtype=np.float64)
    pk = float(np.max(np.abs(x))) if x.size else 0.0
    return x / pk if pk > 1e-9 else x


# ============================================================
# 原语：空气 / 风
# ============================================================

def whoosh(dur=0.35, sr=SR, f0=320.0, f1=3200.0, q=1.1, vel=1.0,
           attack=0.012, seed=None, curve='exp'):
    """
    挥击风声。带通噪声的中心频率扫掠 —— 这是"挥动"感的来源。
    真实挥击是：起手慢（低频）→ 掠过（高频）→ 消失。
    """
    n = int(dur * sr)
    if n <= 0:
        return np.zeros(0)
    t = np.arange(n) / sr
    noise = D.pink_noise(n, seed)
    fc = D.freq_sweep(f0, f1, n, sr=sr, curve=curve)
    y = D.bandpass(noise, np.clip(fc, 40, sr * 0.45), q=q, sr=sr, block=256)
    env = np.clip(t / max(attack, 1e-4), 0, 1) * np.exp(-t / (dur * 0.38))
    return y * env * vel * 1.6


def spin_whoosh(dur=0.9, sr=SR, f_lo=280.0, f_hi=2600.0, rate=3.2, q=1.6,
                vel=1.0, seed=None):
    """
    旋转风声（剑气风暴）。
    用 LFO 调制中心频率 + 声像旋转，制造"绕着转"的空间运动感。
    """
    n = int(dur * sr)
    t = np.arange(n) / sr
    noise = D.pink_noise(n, seed)
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * rate * t)
    fc = f_lo + (f_hi - f_lo) * lfo
    y = D.bandpass(noise, np.clip(fc, 40, sr * 0.45), q=q, sr=sr, block=256)
    env = np.clip(t / 0.05, 0, 1) * np.exp(-t / (dur * 0.45))
    mono = y * env * vel * 1.5
    # 声像随 LFO 旋转 —— 这是"绕圈"的听感关键
    pan = np.sin(2 * np.pi * rate * t)
    gl = np.cos((pan + 1) * np.pi / 4)
    gr = np.sin((pan + 1) * np.pi / 4)
    return np.stack([mono * gl, mono * gr], axis=-1)


# ============================================================
# 原语：冲击 / 打击
# ============================================================

def impact(dur=0.5, sr=SR, body_hz=140.0, body_decay=0.10, pitch_sweep=0.55,
           transient_hz=2600.0, transient_decay=0.010, transient_level=0.7,
           tail_hz=700.0, tail_decay=0.10, tail_level=0.22, vel=1.0, seed=None):
    """
    冲击音。三层：瞬态（脆）+ 体（力量）+ 尾（材质）。
    pitch_sweep 是"力量感"的关键：真实撞击的音高会瞬间下坠。
    """
    n = int(dur * sr)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)

    # 体层：音高下扫（撞击瞬间鼓皮/物体张力松弛）
    fe = body_hz * (1.0 + pitch_sweep * np.exp(-t / max(body_decay * 0.35, 1e-4)))
    body = np.sin(2 * np.pi * np.cumsum(fe) / sr) * np.exp(-t / body_decay)
    # 加一个次谐波，让低频更"实"
    body = body + 0.45 * np.sin(2 * np.pi * np.cumsum(fe * 0.5) / sr) * np.exp(-t / (body_decay * 1.4))

    # 瞬态层
    tr = rng.standard_normal(n)
    tr = D.highpass(tr, transient_hz, q=0.7, sr=sr) * np.exp(-t / transient_decay)

    # 尾层（材质感）
    tl = rng.standard_normal(n)
    tl = D.bandpass(tl, tail_hz, q=0.6, sr=sr) * np.exp(-t / tail_decay)

    # ★ 三层必须先各自归一到单位峰值，再按系数配比。
    #   不归一的话 transient_level / tail_level 没有任何参考意义：高通白噪声的
    #   峰值在 1.5 上下，体层峰值只有 1.45×0.85≈1.23，直接相加等于让瞬态层
    #   凭空比体层热十几 dB。实测 impact 的峰均比因此高达 21.6dB，而真实撞击
    #   录音一般在 12~16dB —— 这是 battle / magic / monster 三类音效峰均比
    #   集体失控的直接来源，也是它们达不到分类响度目标的根因。
    return (_unit_peak(body) * 0.85
            + _unit_peak(tr) * transient_level
            + _unit_peak(tl) * tail_level) * vel


def metal_ping(freq=1800.0, dur=0.55, sr=SR, inharmonic=0.035, vel=1.0,
               bright=0.85, seed=None):
    """
    金属撞击。金属的模态比是非整数的（板/棒振动），
    用 inharmonic 制造"铛"的金属感 —— 整数泛音只能做出"叮"的电子音。
    """
    return S.bell(freq, dur, vel=vel, sr=sr, inharmonic=inharmonic, seed=seed) * 1.3


def metal_scrape(dur=0.3, sr=SR, f_center=3200.0, q=3.0, vel=1.0, seed=None):
    """金属摩擦/刮擦（剑刃相格）"""
    n = int(dur * sr)
    t = np.arange(n) / sr
    noise = D.pink_noise(n, seed)
    fc = f_center * (1.0 + 0.4 * np.sin(2 * np.pi * 11 * t))
    y = D.bandpass(noise, np.clip(fc, 100, sr * 0.45), q=q, sr=sr, block=256)
    tr = D.highpass(np.random.default_rng(seed).standard_normal(n), 5000, q=0.7, sr=sr)
    tr *= np.exp(-t / 0.006)
    env = np.clip(t / 0.004, 0, 1) * np.exp(-t / (dur * 0.4))
    # 同 impact：层内先归一到单位峰值，系数才是"层间配比"
    return (_unit_peak(y * env) + _unit_peak(tr) * 0.5) * vel


def glass_shatter(dur=0.7, sr=SR, n_frags=10, vel=1.0, seed=None):
    """
    玻璃/冰碎裂：主破裂 + 若干随机延迟的碎片。
    碎片的时间随机分布是"碎裂"感的关键 —— 单一瞬态只会像"敲一下"。
    """
    n = int(dur * sr)
    rng = np.random.default_rng(seed)
    t = np.arange(n) / sr
    y = np.zeros(n)

    # 主破裂
    tr = rng.standard_normal(n)
    y += _unit_peak(D.highpass(tr, 3200.0, q=0.7, sr=sr) * np.exp(-t / 0.02))

    # 碎片：高频短瞬态，随机时间与音高
    for _ in range(n_frags):
        d = int(rng.uniform(0.005, dur * 0.55) * sr)
        if d >= n:
            continue
        seg_n = min(int(rng.uniform(0.02, 0.09) * sr), n - d)
        if seg_n <= 0:
            continue
        f = rng.uniform(2600.0, 8200.0)
        seg = np.sin(2 * np.pi * f * np.arange(seg_n) / sr)
        seg *= np.exp(-np.arange(seg_n) / (0.012 * sr))
        seg += rng.standard_normal(seg_n) * np.exp(-np.arange(seg_n) / (0.004 * sr)) * 0.5
        y[d:d + seg_n] += _unit_peak(seg) * rng.uniform(0.25, 0.7)

    return y * vel


def explosion(dur=1.3, sr=SR, vel=1.0, seed=None):
    """
    爆炸：低频塌陷 + 宽带噪声爆发 + 碎片 + 长尾。
    分三段：initial burst（0-50ms）、body（50-400ms）、tail（衰减）。
    """
    n = int(dur * sr)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)

    # 低频塌陷（能量感）
    fe = D.freq_sweep(180.0, 32.0, n, sr=sr, curve='exp')
    sub = np.sin(2 * np.pi * np.cumsum(fe) / sr) * np.exp(-t / 0.28)

    # 宽带爆发（高频先衰减）
    noise = rng.standard_normal(n)
    fc = 9000.0 * np.exp(-t / 0.09) + 600.0
    burst = D.lowpass(noise, np.clip(fc, 100, sr * 0.45), q=0.6, sr=sr, block=256)
    burst *= np.exp(-t / 0.35)

    # 碎片
    frag = np.zeros(n)
    for _ in range(7):
        d = int(rng.uniform(0.02, dur * 0.5) * sr)
        if d >= n:
            continue
        m = min(int(0.05 * sr), n - d)
        frag[d:d + m] += _unit_peak(rng.standard_normal(m)
                                    * np.exp(-np.arange(m) / (0.01 * sr))) * \
            rng.uniform(0.2, 0.55)

    # 长尾（低频 rumble）
    tail = D.lowpass(rng.standard_normal(n), 220.0, q=0.7, sr=sr) * np.exp(-t / 0.5)

    # 同 impact：四层各自归一到单位峰值后再配比
    return (_unit_peak(sub) * 0.9 + _unit_peak(burst) * 0.85
            + _unit_peak(frag) * 0.55 + _unit_peak(tail) * 0.5) * vel


# ============================================================
# 原语：魔法 / 元素
# ============================================================

def elemental_cast(dur=0.9, sr=SR, kind='fire', vel=1.0, seed=None):
    """
    元素魔法释放。不同元素用完全不同的物理隐喻：

      fire      火 : 低频轰鸣上涌 + 噪声爆燃（能量外放）
      ice       冰 : 高频非谐铃 + 碎裂（结晶感）
      lightning 雷 : 白噪撕裂 + 极快滤波扫频 + 低频炸裂（速度感）
      arcane    奥 : 上行非谐铃 + 空间感（神秘）
    """
    n = int(dur * sr)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)

    if kind == 'fire':
        # 轰鸣上涌
        fe = D.freq_sweep(60.0, 190.0, n, sr=sr, curve='exp')
        rumble = np.sin(2 * np.pi * np.cumsum(fe) / sr) * np.clip(t / 0.12, 0, 1) \
            * np.exp(-t / 0.45)
        # 爆燃（噪声，高频先起）
        noise = rng.standard_normal(n)
        fc = 400.0 + 5200.0 * np.clip(t / 0.15, 0, 1) * np.exp(-t / 0.3)
        burn = D.bandpass(noise, np.clip(fc, 100, sr * 0.45), q=0.5, sr=sr, block=256)
        burn *= np.clip(t / 0.03, 0, 1) * np.exp(-t / 0.4)
        y = rumble * 0.9 + burn * 0.75

    elif kind == 'ice':
        # 结晶：高频非谐铃 + 碎裂
        y = metal_ping(3150.0, dur, sr=sr, inharmonic=0.06, vel=0.55, seed=seed)
        y = y * np.clip(t / 0.004, 0, 1)
        y += D.fit_len(metal_ping(4700.0, dur * 0.7, sr=sr, inharmonic=0.09, vel=0.32, seed=seed), n)
        shatter = glass_shatter(dur * 0.6, sr=sr, n_frags=6, seed=seed)
        y = D.fit_len(y, n) + D.fit_len(shatter, n) * 0.5
        # 冰冷的空气感
        air = D.highpass(rng.standard_normal(n), 8000.0, q=0.7, sr=sr)
        y += air * np.exp(-t / 0.25) * 0.12

    elif kind == 'lightning':
        # 撕裂：白噪 + 极快扫频
        noise = rng.standard_normal(n)
        fc = D.freq_sweep(12000.0, 900.0, n, sr=sr, curve='exp')
        y = _unit_peak(D.bandpass(noise, np.clip(fc, 100, sr * 0.45), q=0.8, sr=sr, block=256)
                       * np.exp(-t / 0.10))
        # 多次放电（雷电的"噼啪"）
        for d in (0.0, 0.035, 0.075):
            k = int(d * sr)
            if k < n:
                seg_n = min(int(0.05 * sr), n - k)
                crack = rng.standard_normal(seg_n) * np.exp(-np.arange(seg_n) / (0.008 * sr))
                y[k:k + seg_n] += _unit_peak(D.highpass(crack, 2600.0, q=0.7, sr=sr)) * 0.8
        # 低频炸裂
        y += _unit_peak(np.sin(2 * np.pi * np.cumsum(D.freq_sweep(140, 45, n, sr=sr)) / sr)
                        * np.exp(-t / 0.18)) * 0.55

    elif kind == 'arcane':
        # 奥术：非谐铃 + 上行 + 空间
        y = np.zeros(n)
        for i, (f, a) in enumerate([(880, 0.5), (1320, 0.38), (1760, 0.3), (2640, 0.22)]):
            seg = metal_ping(f, dur * 0.8, sr=sr, inharmonic=0.02, vel=a, seed=seed)
            off = int(i * 0.035 * sr)
            if off < n:
                L = min(len(seg), n - off)
                y[off:off + L] += seg[:L] * 0.7
        y = D.fit_len(y, n)
        y += D.highpass(rng.standard_normal(n), 5200.0, q=0.7, sr=sr) * np.exp(-t / 0.3) * 0.1
        y *= np.clip(t / 0.02, 0, 1)

    else:
        raise ValueError(f"未知元素: {kind}")

    return np.nan_to_num(y) * vel


def magic_charge(dur=0.7, sr=SR, f0=220.0, f1=1400.0, vel=1.0, seed=None):
    """蓄力：上行扫频 + 逐渐增强的能量感（施法前摇）"""
    n = int(dur * sr)
    t = np.arange(n) / sr
    y = np.zeros(n)
    # 三个失谐的锯齿上行（能量积累）
    rng = np.random.default_rng(seed)
    for cents in (-7.0, 0.0, 7.0):
        fe = D.freq_sweep(f0, f1, n, sr=sr, curve='exp') * (2 ** (cents / 1200.0))
        y += D.osc('saw', fe)
    y /= 3.0
    # 滤波器同步打开（能量增强）
    fc = D.freq_sweep(400.0, 7000.0, n, sr=sr, curve='exp')
    y = D.lowpass(y, np.clip(fc, 100, sr * 0.45), q=1.1, sr=sr, block=256)
    env = np.clip(t / (dur * 0.8), 0, 1) ** 1.6
    # 末端闪烁（能量满）
    if n > int(0.08 * sr):
        k = n - int(0.08 * sr)
        y[k:] *= (1.0 + 0.5 * np.sin(2 * np.pi * 45 * np.arange(n - k) / sr))
    return y * env * vel * 0.5


# ============================================================
# 原语：音乐性音阶 / 琶音（技能与奖励）
# ============================================================

def arpeggio_up(pitches, dur=0.9, sr=SR, inst='bell', step=0.055,
                vel=0.9, spread=0.5, seed=None, **kw):
    """上行琶音（治疗/增益/奖励）—— 带明确音高 = 有音乐性

    pitches 接受频率（float）或音名字符串（如 'C6'）。
    """
    n = int(dur * sr + sr * 0.8)
    out = np.zeros(n)
    for i, p in enumerate(pitches):
        f = D.midi2freq(D.note2midi(p)) if isinstance(p, str) else float(p)
        seg = S.get_instrument(inst)(f, dur - i * step + 0.4, vel=vel, sr=sr,
                                     seed=(seed or 0) + i * 17, **kw)
        off = int(i * step * sr)
        seg = D.fit_len(seg, n - off) if off < n else np.zeros(0)
        if len(seg):
            out[off:off + len(seg)] += seg
    return out * spread


def fanfare_short(pitches_dur, dur=1.2, sr=SR, inst='brass_stab', vel=1.0, seed=None):
    """短号角（成就/波次完成）

    pitches_dur 的每一项为 (频率或音名字符串, 时值)。
    """
    n = int(dur * sr + sr)
    out = np.zeros(n)
    t_acc = 0.0
    for i, (p, d) in enumerate(pitches_dur):
        f = D.midi2freq(D.note2midi(p)) if isinstance(p, str) else float(p)
        seg = S.get_instrument(inst)(f, d + 0.25, vel=vel, sr=sr, seed=(seed or 0) + i * 31)
        off = int(t_acc * sr)
        if off < n:
            out[off:off + len(seg[:n - off])] += seg[:n - off]
        t_acc += d
    return out


# ============================================================
# 原语：生物 / 死亡
# ============================================================

def creature_die(dur=0.9, sr=SR, pitch_hz=180.0, vel=1.0, seed=None):
    """
    怪物死亡：低吼下坠 + 骨裂 + 消散。
    下坠的音高 = "生命流逝"，这是死亡音效的通用语法。
    """
    n = int(dur * sr)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)

    # 低吼（音高下坠 + 粗糙的振幅调制）
    fe = D.freq_sweep(pitch_hz, pitch_hz * 0.45, n, sr=sr, curve='exp')
    growl = np.zeros(n)
    for h, a in [(1, 1.0), (2, 0.5), (3, 0.28), (4.7, 0.14)]:   # 非谐 = 粗糙感
        growl += a * np.sin(2 * np.pi * np.cumsum(fe * h) / sr)
    growl /= 1.9
    growl *= (1.0 + 0.35 * np.sin(2 * np.pi * 28 * t))           # 喉音颤动
    growl *= np.exp(-t / (dur * 0.42))

    # 骨裂/碎裂
    crack = glass_shatter(dur * 0.4, sr=sr, n_frags=5, seed=seed)

    # 消散（气息）
    air = D.highpass(rng.standard_normal(n), 1800.0, q=0.6, sr=sr)
    air *= np.exp(-t / (dur * 0.30))

    # ★ 原实现漏了 * vel —— 调用方给的音量为 0 也照常全音量输出。
    #   顺带把三层归一到单位峰值再配比（同 impact）。
    return (_unit_peak(growl) + D.fit_len(crack, n) * 0.45
            + _unit_peak(air) * 0.16) * vel


def boss_die(dur=2.6, sr=SR, vel=1.0, seed=None):
    """
    BOSS 死亡：低频塌陷 + 金属崩解 + 合唱消逝 + 胜利前奏的种子。
    这是玩家最有成就感的瞬间，值得做长、做足层次。
    """
    n = int(dur * sr)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)

    y = np.zeros(n)

    # 1) 巨大的低频塌陷
    fe = D.freq_sweep(120.0, 24.0, n, sr=sr, curve='exp')
    collapse = np.sin(2 * np.pi * np.cumsum(fe) / sr) * np.exp(-t / 0.9)
    collapse += 0.5 * np.sin(2 * np.pi * np.cumsum(fe * 0.5) / sr) * np.exp(-t / 1.2)
    y += collapse * 0.9

    # 2) 金属崩解（护甲碎裂，延迟触发）
    for i, d in enumerate([0.05, 0.22, 0.42, 0.68, 1.0]):
        k = int(d * sr)
        if k >= n:
            continue
        seg = metal_ping(rng.uniform(900, 2400), 0.6, sr=sr,
                         inharmonic=0.05, vel=0.5, seed=(seed or 0) + i)
        seg = D.fit_len(seg, min(len(seg), n - k))
        y[k:k + len(seg)] += seg[:n - k]

    # 3) 碎片
    shatter = glass_shatter(dur * 0.5, sr=sr, n_frags=12, seed=seed)
    k = int(0.18 * sr)
    y[k:k + len(shatter[:n - k])] += shatter[:n - k] * 0.5

    # 4) 合唱消逝（灵魂离去的神圣感）
    k = int(0.35 * sr)
    if k < n:
        cho = S.choir(D.midi2freq(57), dur - 0.35, vel=0.5, sr=sr,
                      vowel='oo', attack=0.4, release=1.2, seed=seed)
        cho = D.fit_len(cho, n - k)
        y[k:] += cho[:n - k] * 0.5

    # 5) 尾部的低频余响
    tail = D.lowpass(rng.standard_normal(n), 160.0, q=0.7, sr=sr) * np.exp(-t / 1.1) * 0.35
    return (y + tail) * vel * 0.85


# ============================================================
# 统一增益分级：让 vel 成为跨原语可比的音量旋钮
# ============================================================
#
# ★ 为什么必须有这一段（这是音效峰均比失控的真正根源）：
#   实测各原语在 vel=1.0 时输出峰值 0.24 ~ 2.47 —— 跨了 20 dB。于是 `vel`
#   根本不可比：battle_attack 里 whoosh(vel=0.85) 与 impact(vel=0.95) 看着
#   "差不多响"，实际差 10 dB 以上；cast_blade_storm 里 spin_whoosh(vel=0.9)
#   与 impact(vel=1.05) 差了 30 dB —— 那段 800ms 风声几乎听不见，整条音效
#   退化成"一段静音 + 最后一声斩击"。
#
#   后果不止是配比错：峰均比被瞬态层抬高之后，"可达响度 = 峰值上限 − 峰均比"
#   这条线就把大量音效卡在分类响度目标之下 —— 这才是同类音效散开 6.5 LU
#   的根因，跟归一化策略无关。
#
#   做法：vel=1.0 时把所有原语的输出峰值统一到 _PRIM_PEAK。
#   选峰值而不是 RMS：峰值归一是**幂等**的，原语之间的内部调用
#   （elemental_cast 调 metal_ping / glass_shatter）重复作用也不会改变结果。

def _stage(fn):
    @functools.wraps(fn)
    def wrapper(*a, **kw):
        y = np.asarray(fn(*a, **kw), dtype=np.float64)
        pk = float(np.max(np.abs(y))) if y.size else 0.0
        return y * (_PRIM_PEAK / pk) if pk > 1e-9 else y
    return wrapper


for _name, _fn in list(globals().items()):
    if (inspect.isfunction(_fn) and _fn.__module__ == __name__
            and not _name.startswith('_')):
        globals()[_name] = _stage(_fn)
