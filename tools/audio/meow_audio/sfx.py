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
           tail_hz=700.0, tail_decay=0.10, tail_level=0.22, vel=1.0, seed=None,
           sub_level=0.45, crack_attack_ms=0.6, body_attack_ms=1.6,
           space=0.10, drive=1.7, body_brightness=1.0, air_level=0.18,
           sub_decay_mul=0.95, body_q_hz=16.0, sub_hz=None):
    """
    冲击音 —— 格斗游戏式打击。

    五层：次低频(重量) + 体(肉感) + 瞬态(脆) + 尾(材质) + 空气(清晰度)，外加一点空间。

    ★ 2026-09-03 重写。用户反馈"像小霸王"，量出来确实是。旧版实测（撞击点开窗）：

        battle_hit    sub -15.4  mid -29.7  air  -0.9   质心 3534  sfm 0.271
        hit_crit      sub -14.6  mid  -4.9  air  -3.2   质心 2698  sfm 0.349
        hit_block     sub -17.8  mid -20.9  air  -0.8   质心 2991  sfm 0.310
        attack_melee  sub -13.8  mid -13.4  air  -1.6   质心 2719  sfm 0.320
        battle_attack sub -20.7  mid  -1.8  air -18.6   质心  679  sfm 0.122
        monster_hit   sub  -7.4  mid -19.8  air -27.8   质心  298  sfm 0.017

      「小霸王」不是一种毛病，是**两种**，正好对应 8 位机音源的两个通道：
        音调通道病（battle_attack / monster_hit）：sfm 0.017~0.122，一根谱线。
          旧体层是 `sin(2π·cumsum(f)/sr)` 配音高下扫 —— 单振荡器 + 音高包络，
          这就是 8 位机激光音的定义。真实撞击的体层没有音高，是宽带脉冲激励出的
          一簇密集非谐模态 → 改用 modal_synth。
        噪声通道病（battle_hit / hit_block / attack_melee）：air 比 mid 高 12~29dB。
          全是高频噪声、没有肉 —— 像芯片的噪声通道。→ 压 transient_level、
          抬 body_brightness，把能量搬回 150~2000Hz。
        两者共同的病：sub 全部 ≤ -13.8dB，一个都没有重量。

    ⚠️ 诊断过程本身踩了三个坑，全都是"判据量错东西"，改素材之前先改判据：
        ① 拿 np.abs(x) 量起振 → 量到的是**波形周期**不是包络（2600Hz 的
           四分之一周期 = 0.096ms，和实测"起振 0.11ms"完全对上）。
           起振必须用 Hilbert 解析包络。旧素材起振其实没问题。
        ② 在"前 40ms"开窗算频谱 → 对"先挥后中"的音效量到的是风声不是撞击。
           必须从**包络峰值**处开窗。
        ③ 质心按全频带算 → 把手机喇叭放不出来的 <300Hz 也算进去，
          "有重量"和"质心达标"就永远打架。质心只量 250~8000Hz。
      判据最终落在 verify_hit_character.py，那里是唯一事实源。

    五层的频域职责（业界通行分法）：
        sub   40~120Hz    重量 / 胸腔感
        body  120~1500Hz  材质 / 肉感 / 辨识度
        crack 1.5~5kHz    穿透力 —— 手机喇叭上真正"听得见"的就是它
        tail  400~1500Hz  余韵 / 材质
        air   4~9kHz      清晰度

    ★ sub 层为什么必须饱和（移动端的关键，别删）：
      手机喇叭 300Hz 以下就滚降，纯 40~80Hz 在手机上根本放不出来，
      只会白占动态余量、把限制器顶得更狠（响度反而做不上去）。
      饱和产生的 2/3/4 次谐波落在 160~360Hz —— 手机听得到，
      而大脑会按谐波列反推出缺失的基频（缺失基频效应），
      于是"手机上依然觉得这一下很重"。这是移动端打击感的通用做法。

    ★ 起振时间：所有层都在撞击瞬间同时达峰（transient stacking），
      但每层都需要一个**非零**的起振斜坡，否则就是削不掉的数字咔哒。
      crack 0.6ms / body 1.6ms —— 短到保持"脆"，长到不再是点击。
      （旧素材实测起振 0.18~6.4ms，本来就在合理区间；真正的问题是配比不是起振。）

    ★ space：极短的房间。全干的声音会贴脸、像贴在耳边的电子音；
      加一点点早期反射，声音才"发生在某个地方"（worldization）。
    """
    n = int(dur * sr)
    t = np.arange(n) / sr
    rng = np.random.default_rng(seed)
    sd1 = (seed + 1) if seed is not None else None

    # ── 1) 次低频「重量层」：音高下坠 + 饱和（手机可听性的关键，见上面 ★）
    # ★ sub_hz 必须封顶：body_hz 一高（>300），body_hz*0.42 就跑出 sub 频段了 ——
    #   实测 body_hz=340 时 sub 掉到 -33dB，因为 143Hz 再加音高包络起振到 210Hz，
    #   整段都在 150Hz 以上，一格能量都没落进 20~150 的 sub 窗。
    sub_hz = min(body_hz * 0.42, 95.0) if sub_hz is None else sub_hz
    fe = sub_hz * (1.0 + pitch_sweep * 0.85 * np.exp(-t / max(body_decay * 0.5, 1e-4)))
    sub = np.sin(2 * np.pi * np.cumsum(fe) / sr) * np.exp(-t / (body_decay * sub_decay_mul))
    sub = D.saturate(sub * 1.5, drive=drive, blend=0.8, kind='tanh')
    sub = sub * np.exp(-t / (body_decay * 0.8))
    # 质量问题响应滞后于接触面，所以体层的起振比脆层慢一点
    sub = sub * (1.0 - np.exp(-t / max(body_attack_ms / 1000.0, 1e-5)))

    # ── 2) 体层：非谐模态簇（取代旧的纯正弦 —— 这是"小霸王感"的根因）
    body = D.modal_synth(body_hz, dur, sr=sr, partials=9,
                         decay_s=max(body_decay * 1.5, 1e-3), decay_pow=1.35,
                         amp_pow=0.85, inharmonic=0.16, brightness=body_brightness,
                         attack_s=body_attack_ms / 1000.0, level=1.0, seed=sd1)
    body = D.lowpass(body, min(body_hz * body_q_hz, sr * 0.45), q=0.7, sr=sr)

    # ── 3) 瞬态「脆层」：非零起振 + 两段式衰减
    #      （快段=接触瞬间，慢段=材料响应；只有快段会像"啪"的点击）
    atk_s = max(crack_attack_ms / 1000.0, 1e-5)
    tr = rng.standard_normal(n)
    tr = D.bandpass(tr, transient_hz, q=0.65, sr=sr)
    tr = tr * (1.0 - np.exp(-t / atk_s))
    tr = tr * (np.exp(-t / max(transient_decay, 1e-4))
               + 0.40 * np.exp(-t / max(transient_decay * 7.0, 1e-4)))

    # ── 4) 尾层（材质余韵）
    tl = rng.standard_normal(n)
    tl = D.bandpass(tl, tail_hz, q=0.6, sr=sr) * np.exp(-t / tail_decay)

    # ── 5) 空气层（清晰度，量要小 —— 多了就刺耳）
    air = rng.standard_normal(n)
    air = D.highpass(air, min(max(tail_hz * 4.0, 3000.0), sr * 0.45), q=0.7, sr=sr)
    air = air * np.exp(-t / max(transient_decay * 2.2, 1e-4))

    # ★ 各层先归一到单位峰值，层间系数才是真正的"配比"。不归一的话
    #   transient_level / tail_level 没有任何参考意义：带通白噪声的峰值在 1.5 上下，
    #   体层只有 1.0 出头，直接相加等于让脆层凭空比体层热十几 dB。
    y = (_unit_peak(body) * 1.0
         + _unit_peak(sub) * sub_level
         + _unit_peak(tr) * transient_level
         + _unit_peak(tl) * tail_level
         + _unit_peak(air) * air_level * min(1.0, transient_level))

    if space > 0:
        y = D.reverb(y, sr=sr, decay_s=min(0.34, dur * 0.5), predelay_s=0.003,
                     size=0.35, mix=space, damp_hz=3800.0, seed=seed)
    return y * vel


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
#   做法：先把原语的输出峰值统一到 _PRIM_PEAK，再把 vel 作为干净增益加回去。
#   选峰值而不是 RMS：峰值归一是**幂等**的，原语之间的内部调用
#   （elemental_cast 调 metal_ping / glass_shatter）重复作用也不会改变结果。
#
# ⚠️ 2026-09-03 修：上面两步缺了第二步，vel 被归一化整个吃掉，变成**空转**。
#    实测 whoosh / metal_ping / impact 在 vel=0.2 / 0.5 / 1.0 下峰值一律 0.900，
#    RMS 也基本不动 —— 这意味着：
#      · whoosh(vel=0.9) 和 impact(vel=1.0) 一样响，风声把撞击盖住，没有"打"的感觉
#      · build_sfx.py 里所有靠 vel 调的配比**全部无效**，怎么调输出都不变
#    归一化必须作用在"vel=1.0 的参考电平"上，而不是作用在"已经乘过 vel 的输出"上。
#    保留内部 _vel() 的亮度随力度变化（真实乐器就是这样），只把电平交给外部增益。

def _stage(fn):
    sig = inspect.signature(fn)
    _has_vel = 'vel' in sig.parameters

    @functools.wraps(fn)
    def wrapper(*a, **kw):
        y = np.asarray(fn(*a, **kw), dtype=np.float64)
        pk = float(np.max(np.abs(y))) if y.size else 0.0
        if pk <= 1e-9:
            return y
        # 1) 抹平原语之间的电平差异（本段存在的初衷）
        y = y * (_PRIM_PEAK / pk)
        # 2) 再把 vel 作为**干净的外部增益**加回去
        if _has_vel:
            try:
                v = float(sig.bind(*a, **kw).arguments.get('vel', 1.0))
            except TypeError:
                v = 1.0
            y = y * v
        return y
    return wrapper


for _name, _fn in list(globals().items()):
    if (inspect.isfunction(_fn) and _fn.__module__ == __name__
            and not _name.startswith('_')):
        globals()[_name] = _stage(_fn)
