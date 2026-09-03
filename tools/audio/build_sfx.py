"""
build_sfx.py —— 游戏音效生成（41 个）

分类响度目标见下面的 LOUDNESS_BY_CAT（(目标 LUFS, 真峰值上限) 二元组）。

所有音效遵循分层设计：瞬态层（清晰）+ 体层（力量）+ 尾层（材质/空间）。

★ 响度一致性靠"按需削峰"保证，不靠归一化策略：
    可达响度 = 真峰值上限 − PLR
  分类目标一定，PLR 大的音效就够不到目标。母带链会先把 PLR 削到达标线
  （D.reduce_plr，过采样 tanh 软削波，PLR 本来就低的音效一个 dB 都不动），
  再归一 —— 于是所有音效都能真正落在自己的分类目标上，不需要"峰值钳位"兜底。
  详见 meow_audio/music.py::master_sfx。
"""

import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meow_audio import dsp as D, synth as S, sfx as X, music as M, qa as Q
from meow_audio.dsp import SR

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_WAV = os.path.join(HERE, 'out', 'wav', 'sfx')
OUT_MP3 = os.path.join(HERE, 'out', 'mp3', 'sfx')
os.makedirs(OUT_WAV, exist_ok=True)
os.makedirs(OUT_MP3, exist_ok=True)


def F(name):
    """音名 -> 频率"""
    return float(D.midi2freq(D.note2midi(name)))


def mix_at(sigs, sr=SR):
    """把 [(signal, offset_seconds), ...] 混到一条时间轴上（返回立体声）"""
    if not sigs:
        return np.zeros(0)
    n = 0
    for s, off in sigs:
        s = np.asarray(s)
        n = max(n, int(off * sr) + len(s))
    out = np.zeros((n, 2))
    for s, off in sigs:
        s = np.asarray(s, dtype=np.float64)
        k = int(off * sr)
        if s.ndim == 1:
            out[k:k + len(s), 0] += s
            out[k:k + len(s), 1] += s
        else:
            m = min(len(s), n - k)
            out[k:k + m, 0] += s[:m, 0]
            out[k:k + m, 1] += s[:m, 1]
    return out


# 音效响度分级表：(目标 LUFS, 真峰值上限 dBTP)
#
# ★ 唯一事实源在 meow_audio.qa.SFX_LOUDNESS_BY_CAT —— 体检脚本读同一份，
#   避免"生成按 A 目标、判定按 B 目标"这种自己打自己的情况。
#   分档依据是「玩家必须听到的程度」（功能重要性），不是音色 —— 这是游戏
#   音频的标准做法：UI 点击一局要点几百次，必须克制否则疲劳；BOSS 死亡是
#   里程碑事件，必须盖过一切。
LOUDNESS_BY_CAT = Q.SFX_LOUDNESS_BY_CAT

# 真峰值上限：比 -1 dBTP 硬标准留出 MP3 编码过冲的余量。
# ⚠️ 2026-09-03 从 -2.0 压到 -2.6：修好 vel（见 sfx._stage 的 ⚠️）之后层间
#    电平终于拉开了，瞬态材料的过冲实测从 +1.51dB 涨到 +2.50dB —— 原来的
#    2dB 余量只剩 0.40dB（交付真峰值 -1.40dBTP 对红线 -1.0），太薄。
#    注：过冲幅度取决于素材，不是常数；改完必须重跑 verify_encode_quality 看
#    "交付真峰值最高"这一行，不能只信注释里写的经验值。
SFX_CEILING_DBTP = -2.6

# ============================================================
# 打击 / 近战
# ============================================================

def sfx_attack_melee():
    """近战普攻：挥击风声 + 命中（一次普攻的完整反馈）"""
    return mix_at([
        # 挥击是"前摇"，必须明显弱于命中 —— 撞击才是这条音效的主角
        (X.whoosh(0.20, f0=340, f1=2900, q=1.2, vel=0.45, seed=11), 0.0),
        (X.impact(0.40, body_hz=155, body_decay=0.09, pitch_sweep=0.6,
                  transient_hz=2600, transient_level=0.7, sub_level=0.40,
                  body_brightness=1.0, vel=1.2, seed=12), 0.075),
        (X.metal_ping(2400, 0.22, vel=0.14, inharmonic=0.05, seed=13), 0.078),
    ])


def sfx_attack_range():
    """远程普攻：弓弦 + 箭矢破空"""
    return mix_at([
        (X.metal_ping(1650, 0.18, vel=0.4, inharmonic=0.02, seed=21), 0.0),
        (X.whoosh(0.30, f0=900, f1=4200, q=2.2, vel=0.7, seed=22), 0.02),
    ])


def sfx_battle_attack():
    """通用攻击（比近战更中性，适配多角色）"""
    return mix_at([
        (X.whoosh(0.18, f0=400, f1=3100, q=1.4, vel=0.85, seed=31), 0.0),
        (X.impact(0.34, body_hz=170, body_decay=0.085, pitch_sweep=0.5,
                  transient_hz=2600, transient_level=0.62, sub_level=0.42,
                  body_brightness=1.0, vel=0.95, seed=32), 0.06),
    ])


def sfx_battle_hit():
    """通用命中反馈：短、脆、不抢戏"""
    return mix_at([
        (X.impact(0.26, body_hz=190, body_decay=0.065, pitch_sweep=0.55,
                  transient_hz=2800, transient_decay=0.008, transient_level=0.78,
                  tail_hz=1400, tail_decay=0.06, tail_level=0.2,
                  sub_level=0.30, body_brightness=1.0, vel=1.0, seed=41), 0.0),
        (X.metal_ping(3100, 0.12, vel=0.18, seed=42), 0.002),
    ])


def sfx_battle_sword():
    """剑击：锐利的挥击 + 刃鸣 + 命中"""
    return mix_at([
        (X.whoosh(0.16, f0=600, f1=5200, q=2.6, vel=0.50, seed=51), 0.0),
        (X.metal_scrape(0.14, f_center=4200, q=4.5, vel=0.28, seed=52), 0.05),
        # 剑的"锐"在刃鸣与刮擦上，重量仍然得由撞击层给 —— 否则只剩一层高频噪声
        (X.impact(0.36, body_hz=150, body_decay=0.095, pitch_sweep=0.65,
                  transient_hz=3600, transient_level=0.68, sub_level=0.55,
                  body_brightness=1.1, vel=1.2, seed=53), 0.075),
    ])


def sfx_hit_crit():
    """暴击：更重的低频 + 金属爆响 + 更宽声像"""
    y = mix_at([
        (X.impact(0.55, body_hz=110, body_decay=0.14, pitch_sweep=0.8,
                  transient_hz=2200, transient_decay=0.014, transient_level=0.95,
                  tail_hz=900, tail_decay=0.16, tail_level=0.3,
                  sub_level=0.75, body_brightness=1.0, vel=1.2, seed=61), 0.0),
        (X.metal_ping(1750, 0.5, vel=0.5, inharmonic=0.045, seed=62), 0.004),
        (X.metal_ping(2600, 0.35, vel=0.3, inharmonic=0.06, seed=63), 0.012),
    ])
    return D.stereo_width(y, 1.35)


def sfx_hit_block():
    """格挡：金属对撞（高 Q 共振 + 刮擦，没有肉感低频）"""
    return mix_at([
        # 金属音色是这条音效的"身份"，但撞击必须撑住重量 ——
        # 旧版 vel 是坏的（见 sfx._stage 的 ⚠️），刮擦与撞击一样响，
        # 于是整条听起来只是一层薄薄的高频噪声，没有"挡住了"的实感。
        (X.metal_scrape(0.18, f_center=3400, q=5.5, vel=0.45, seed=71), 0.0),
        (X.metal_ping(2100, 0.45, vel=0.42, inharmonic=0.04, seed=72), 0.003),
        (X.impact(0.20, body_hz=300, body_decay=0.05, pitch_sweep=0.3,
                  transient_hz=3600, transient_level=0.42, sub_level=0.95,
                  body_brightness=1.0, vel=1.15, seed=73), 0.0),
    ])


# ============================================================
# 技能释放
# ============================================================

def sfx_cast_fire():
    """火球术：蓄力上涌 + 爆燃"""
    return mix_at([
        (X.magic_charge(0.32, f0=180, f1=1250, vel=0.5, seed=101), 0.0),
        (X.elemental_cast(0.85, kind='fire', vel=1.0, seed=102), 0.30),
    ])


def sfx_cast_ice():
    """冰晶术：蓄力 + 结晶（非谐铃 + 碎裂）"""
    return mix_at([
        (X.magic_charge(0.30, f0=320, f1=1800, vel=0.45, seed=111), 0.0),
        (X.elemental_cast(0.75, kind='ice', vel=1.0, seed=112), 0.28),
    ])


def sfx_cast_lightning():
    """雷电术：极快蓄力 + 撕裂放电"""
    return mix_at([
        (X.magic_charge(0.18, f0=600, f1=3200, vel=0.5, seed=121), 0.0),
        (X.elemental_cast(0.62, kind='lightning', vel=1.05, seed=122), 0.16),
    ])


def sfx_cast_meteor():
    """陨石术：长蓄力 + 轰鸣坠落 + 爆炸"""
    return mix_at([
        (X.magic_charge(0.55, f0=110, f1=900, vel=0.55, seed=131), 0.0),
        (X.whoosh(0.6, f0=2600, f1=380, q=1.5, vel=0.55, seed=132), 0.5),
        (X.elemental_cast(0.9, kind='fire', vel=0.85, seed=133), 1.0),
        (X.explosion(1.2, vel=0.9, seed=134), 1.05),
    ])


def sfx_cast_heal():
    """治疗（艾米治愈冲击）：温暖的上行琶音 + 铃 + 柔和铺底"""
    pitches = [F('G4'), F('C5'), F('E5'), F('G5'), F('C6')]
    return mix_at([
        (X.arpeggio_up(pitches, dur=0.95, inst='bell', step=0.052,
                       vel=0.75, spread=0.85, seed=141, inharmonic=0.0012), 0.0),
        (S.pad(F('C4'), 1.3, vel=0.4, attack=0.25, release=0.7, seed=142), 0.02),
        (S.choir(F('G4'), 1.2, vel=0.3, vowel='ah', attack=0.3, release=0.6,
                 seed=143), 0.05),
        (X.metal_ping(F('E6'), 0.5, vel=0.25, inharmonic=0.001, seed=144), 0.30),
    ])


def sfx_cast_blade_storm():
    """剑气风暴（臻宝）：旋转风声 + 多段刃鸣 + 收束重击"""
    y = mix_at([
        (X.spin_whoosh(0.95, f_lo=300, f_hi=3000, rate=3.4, q=1.7, vel=0.9, seed=151), 0.0),
        (X.metal_scrape(0.22, f_center=3800, q=4.0, vel=0.5, seed=152), 0.10),
        (X.metal_scrape(0.22, f_center=3200, q=4.0, vel=0.5, seed=153), 0.34),
        (X.metal_scrape(0.22, f_center=4400, q=4.0, vel=0.5, seed=154), 0.58),
        (X.impact(0.55, body_hz=120, body_decay=0.13, pitch_sweep=0.7,
                  transient_hz=2600, transient_level=0.95, vel=1.05, seed=155), 0.80),
    ])
    return D.stereo_width(y, 1.3)


def sfx_cast_buff():
    """增益（艾米 BUFF）：五声上行琶音 + 温暖和声"""
    pitches = [F('C5'), F('D5'), F('E5'), F('G5'), F('A5')]
    return mix_at([
        (X.arpeggio_up(pitches, dur=0.8, inst='bell', step=0.05,
                       vel=0.7, spread=0.8, seed=161, inharmonic=0.001), 0.0),
        (S.pad(F('C4'), 1.0, vel=0.35, attack=0.2, release=0.5, seed=162), 0.0),
        (S.pad(F('G4'), 1.0, vel=0.28, attack=0.25, release=0.5, seed=163), 0.05),
    ])


def sfx_battle_skill():
    """通用技能释放：蓄力 + 释放瞬态（不带具体元素色彩）"""
    return mix_at([
        (X.magic_charge(0.26, f0=280, f1=1600, vel=0.5, seed=171), 0.0),
        (X.elemental_cast(0.6, kind='arcane', vel=0.9, seed=172), 0.24),
        (X.impact(0.3, body_hz=140, body_decay=0.08, pitch_sweep=0.5,
                  transient_hz=3000, transient_level=0.5, vel=0.5, seed=173), 0.24),
    ])


# ============================================================
# 元素命中
# ============================================================

def sfx_hit_fire():
    return X.explosion(0.75, vel=0.85, seed=201)


def sfx_hit_ice():
    return mix_at([
        (X.glass_shatter(0.5, n_frags=8, vel=0.9, seed=211), 0.0),
        (X.metal_ping(2800, 0.3, vel=0.35, inharmonic=0.07, seed=212), 0.0),
    ])


def sfx_hit_lightning():
    return mix_at([
        (X.elemental_cast(0.4, kind='lightning', vel=0.8, seed=221), 0.0),
    ])


def sfx_hit_meteor():
    return X.explosion(1.3, vel=1.0, seed=231)


def sfx_battle_explosion():
    return X.explosion(1.25, vel=1.0, seed=241)


# ============================================================
# 怪物
# ============================================================

def sfx_monster_hit():
    """怪物受击：肉感（无金属）

    ★ 低通从 2600Hz 抬到 5200Hz。旧版 2600 把脆层整个滤掉，实测
      sfm 0.017（纯正弦）、质心 298Hz、手机上少听 5.9dB —— 手机上几乎听不见。
      "肉感"要靠**分音密集的低频簇**（modal_synth 非谐模态）做，
      不能靠一刀切掉所有高频：切完就只剩一根闷在 200Hz 的正弦线，
      那正是 8 位机音调通道的听感。
    """
    y = X.impact(0.24, body_hz=175, body_decay=0.06, pitch_sweep=0.5,
                 transient_hz=1800, transient_decay=0.009, transient_level=0.55,
                 tail_hz=600, tail_decay=0.05, tail_level=0.25,
                 sub_level=0.50, body_brightness=1.0, vel=1.0, seed=301)
    return D.lowpass(y, 5200, q=0.7)


def sfx_monster_death():
    return X.creature_die(0.95, pitch_hz=190, vel=1.0, seed=311)


def sfx_monster_spawn():
    """怪物生成：低频上扫 + 不祥的下行非谐（"有什么要来了"）"""
    n = int(0.75 * SR)
    t = np.arange(n) / SR
    fe = D.freq_sweep(60, 240, n, sr=SR, curve='exp')
    y = np.zeros(n)
    for h, a in [(1, 1.0), (1.5, 0.4), (2.3, 0.2)]:
        y += a * np.sin(2 * np.pi * np.cumsum(fe * h) / SR)
    y *= np.clip(t / 0.25, 0, 1) * np.exp(-t / 0.55)
    air = D.highpass(D.pink_noise(n, 321), 1200, q=0.6, sr=SR) * np.exp(-t / 0.3) * 0.2
    return (y / 1.6 + air) * 0.85


def sfx_boss_death():
    return X.boss_die(2.6, vel=1.0, seed=331)


# ============================================================
# UI
# ============================================================

def sfx_ui_click():
    """点击：木质、极短（UI 音必须短，否则连点会糊成一片）"""
    return S.wood_block(1150, 0.09, vel=0.9, seed=401) * 1.15


def sfx_ui_confirm():
    """确认：上行纯五度（明确的"完成"感）"""
    return mix_at([
        (S.glockenspiel(F('C6'), 0.35, vel=0.5, seed=411), 0.0),
        (S.glockenspiel(F('G6'), 0.4, vel=0.45, seed=412), 0.055),
    ])


def sfx_ui_cancel():
    """取消：下行纯四度（"退回"感）"""
    return mix_at([
        (S.glockenspiel(F('G5'), 0.3, vel=0.45, seed=421), 0.0),
        (S.glockenspiel(F('D5'), 0.38, vel=0.4, seed=422), 0.055),
    ])


def sfx_ui_popup():
    """弹窗：轻柔 whoosh + 铃（不打断当前音乐）"""
    return mix_at([
        (X.whoosh(0.22, f0=700, f1=2400, q=1.8, vel=0.35, seed=431), 0.0),
        (S.glockenspiel(F('E6'), 0.3, vel=0.3, seed=432), 0.08),
    ])


def sfx_ui_error():
    """错误：低沉 + 小二度不协和（本能的"不对"感）"""
    return mix_at([
        (S.wood_block(F('A3'), 0.12, vel=0.6, seed=441), 0.0),
        (S.wood_block(F('Bb3'), 0.16, vel=0.55, seed=442), 0.10),
    ])


def sfx_ui_success():
    """成功：明亮上行三音"""
    return X.arpeggio_up([F('C6'), F('E6'), F('G6')], dur=0.5, inst='glockenspiel',
                         step=0.06, vel=0.5, spread=0.9, seed=451)


# ============================================================
# 奖励
# ============================================================

def sfx_reward_coin():
    """金币：金属铃 + 上行（清脆的"叮"）"""
    return mix_at([
        (X.metal_ping(3150, 0.4, vel=0.55, inharmonic=0.02, seed=501), 0.0),
        (X.metal_ping(4200, 0.35, vel=0.4, inharmonic=0.025, seed=502), 0.045),
    ])


def sfx_reward_levelup():
    """升级：五声上行琶音 + 铃 + 温暖铺底"""
    pitches = [F('C5'), F('D5'), F('E5'), F('G5'), F('A5'), F('C6')]
    return mix_at([
        (X.arpeggio_up(pitches, dur=1.0, inst='glockenspiel', step=0.055,
                       vel=0.6, spread=0.9, seed=511), 0.0),
        (X.metal_ping(F('C7'), 0.6, vel=0.3, inharmonic=0.0015, seed=512), 0.32),
        (S.pad(F('C4'), 1.1, vel=0.3, attack=0.15, release=0.6, seed=513), 0.0),
    ])


def sfx_reward_achievement():
    """成就：短号角 + 铃（值得"宣告"的时刻）"""
    return mix_at([
        (X.fanfare_short([(F('C5'), 0.14), (F('E5'), 0.14), (F('G5'), 0.30)],
                         dur=0.9, vel=0.75, seed=521), 0.0),
        (X.metal_ping(F('G6'), 0.7, vel=0.32, inharmonic=0.0015, seed=522), 0.30),
        (S.choir(F('C5'), 0.9, vel=0.28, vowel='ah', attack=0.2, seed=523), 0.28),
    ])


def sfx_reward_get_item():
    """获得物品：轻柔双音 + 铃"""
    return mix_at([
        (S.glockenspiel(F('A5'), 0.3, vel=0.4, seed=531), 0.0),
        (S.glockenspiel(F('E6'), 0.4, vel=0.35, seed=532), 0.07),
        (X.metal_ping(5200, 0.25, vel=0.18, inharmonic=0.01, seed=533), 0.07),
    ])


# ============================================================
# 系统 / 流程
# ============================================================

def sfx_wave_start():
    """波次开始：号角 + 战鼓（"来了"）"""
    return mix_at([
        (X.fanfare_short([(F('G4'), 0.18), (F('C5'), 0.34)], dur=0.8, vel=0.85, seed=601), 0.0),
        (X.impact(0.6, body_hz=95, body_decay=0.16, pitch_sweep=0.6,
                  transient_hz=1800, transient_level=0.6, vel=0.9, seed=602), 0.0),
        (X.impact(0.5, body_hz=95, body_decay=0.14, pitch_sweep=0.6,
                  transient_hz=1800, transient_level=0.5, vel=0.7, seed=603), 0.28),
    ])


def sfx_wave_complete():
    """波次完成：上行三音 + 铃（喘息的愉悦）"""
    return mix_at([
        (X.arpeggio_up([F('G5'), F('C6'), F('E6')], dur=0.7, inst='glockenspiel',
                       step=0.075, vel=0.55, spread=0.9, seed=611), 0.0),
        (X.metal_ping(F('C7'), 0.5, vel=0.25, inharmonic=0.001, seed=612), 0.16),
    ])


def sfx_game_defeat():
    """失败：下行 + 低沉和弦 + 消逝"""
    n = int(2.2 * SR)
    y = mix_at([
        (S.horn(F('C3'), 1.6, vel=0.6, attack=0.15, release=0.8, seed=621), 0.0),
        (S.horn(F('G2'), 1.8, vel=0.55, attack=0.2, release=0.9, seed=622), 0.1),
        (S.strings(F('Eb3'), 1.9, vel=0.5, attack=0.3, release=0.9, seed=623), 0.15),
        (S.choir(F('C3'), 2.0, vel=0.35, vowel='oo', attack=0.5, release=1.0, seed=624), 0.2),
        (X.impact(0.9, body_hz=70, body_decay=0.3, pitch_sweep=0.7,
                  transient_hz=900, transient_level=0.4, vel=0.7, seed=625), 0.0),
    ])
    # 音高整体下滑（"垮掉"）
    t = np.arange(n) / SR
    return D.fit_len(y, n) * np.exp(-t / 1.6)[:, None]


def sfx_dmg_crit():
    """暴击飘字：极短的高频 ping（不占混音空间，只做提示）"""
    return X.metal_ping(3600, 0.16, vel=0.35, inharmonic=0.03, seed=631)


def sfx_dmg_heal():
    """治疗飘字：柔和上行双音"""
    return mix_at([
        (S.glockenspiel(F('E6'), 0.25, vel=0.35, seed=641), 0.0),
        (S.glockenspiel(F('B6'), 0.3, vel=0.28, seed=642), 0.05),
    ])


def sfx_char_jump():
    """跳跃：短促上扫"""
    n = int(0.24 * SR)
    t = np.arange(n) / SR
    fe = D.freq_sweep(200, 700, n, sr=SR, curve='exp')
    y = D.osc('tri', fe) * np.exp(-t / 0.10) * 0.35
    air = D.highpass(D.pink_noise(n, 651), 2000, q=0.7, sr=SR) * np.exp(-t / 0.05) * 0.25
    return y + air


def sfx_char_land():
    """落地：轻冲击 + 布料/脚步声"""
    return mix_at([
        (X.impact(0.24, body_hz=120, body_decay=0.06, pitch_sweep=0.4,
                  transient_hz=2200, transient_decay=0.007, transient_level=0.5,
                  tail_hz=500, tail_decay=0.05, tail_level=0.25, vel=0.8, seed=661), 0.0),
    ])


# ============================================================
# 注册表：(配置 ID, 文件名, 分类, 输出子目录, 生成函数)
# ============================================================

SFX_LIST = [
    # 打击
    ('attack_melee',       'attack_melee',       'battle', sfx_attack_melee),
    ('attack_range',       'attack_range',       'battle', sfx_attack_range),
    ('battle_attack',      'battle_attack',      'battle', sfx_battle_attack),
    ('battle_hit',         'battle_hit',         'battle', sfx_battle_hit),
    ('battle_sword',       'battle_sword_slash', 'battle', sfx_battle_sword),
    ('hit_crit',           'hit_crit',           'battle', sfx_hit_crit),
    ('hit_block',          'hit_block',          'battle', sfx_hit_block),
    # 技能释放
    ('cast_fireball',      'cast_fireball',      'magic',  sfx_cast_fire),
    ('cast_ice_shard',     'cast_ice_shard',     'magic',  sfx_cast_ice),
    ('cast_lightning',     'cast_lightning',     'magic',  sfx_cast_lightning),
    ('cast_meteor',        'cast_meteor',        'magic',  sfx_cast_meteor),
    ('cast_heal',          'cast_heal',          'magic',  sfx_cast_heal),
    ('cast_blade_storm',   'cast_blade_storm',   'magic',  sfx_cast_blade_storm),
    ('cast_buff',          'cast_buff',          'magic',  sfx_cast_buff),
    ('battle_skill',       'battle_skill',       'magic',  sfx_battle_skill),
    # 元素命中
    ('hit_fireball',       'hit_fireball',       'magic',  sfx_hit_fire),
    ('hit_ice_shard',      'hit_ice_shard',      'magic',  sfx_hit_ice),
    ('hit_lightning',      'hit_lightning',      'magic',  sfx_hit_lightning),
    ('hit_meteor',         'hit_meteor',         'magic',  sfx_hit_meteor),
    ('battle_explosion',   'battle_explosion',   'battle', sfx_battle_explosion),
    # 怪物
    ('monster_hit',        'monster_hit',        'monster', sfx_monster_hit),
    ('monster_death',      'monster_death',      'monster', sfx_monster_death),
    ('monster_spawn',      'monster_spawn',      'monster', sfx_monster_spawn),
    ('boss_death',         'boss_death',         'monster', sfx_boss_death),
    # UI
    ('ui_click',           'ui_click',           'ui',     sfx_ui_click),
    ('ui_confirm',         'ui_confirm',         'ui',     sfx_ui_confirm),
    ('ui_cancel',          'ui_cancel',          'ui',     sfx_ui_cancel),
    ('ui_popup',           'ui_popup',           'ui',     sfx_ui_popup),
    ('ui_error',           'ui_error',           'ui',     sfx_ui_error),
    ('ui_success',         'ui_success',         'ui',     sfx_ui_success),
    # 奖励
    ('reward_coin',        'reward_coin',        'reward', sfx_reward_coin),
    ('reward_levelup',     'reward_levelup',     'reward', sfx_reward_levelup),
    ('reward_achievement', 'reward_achievement', 'reward', sfx_reward_achievement),
    ('reward_get_item',    'reward_get_item',    'reward', sfx_reward_get_item),
    # 系统
    ('wave_start',         'wave_start',         'system', sfx_wave_start),
    ('wave_complete',      'wave_complete',      'system', sfx_wave_complete),
    ('game_defeat',        'game_defeat',        'system', sfx_game_defeat),
    # 伤害/治疗飘字反馈：归入 hud 档而非 ui —— 它跟 UI 点击不是一回事，
    # 按 ui 的 -20 LUFS 走会在战斗音效里完全听不见。
    ('dmg_crit',           'dmg_crit',           'hud',    sfx_dmg_crit),
    ('dmg_heal',           'dmg_heal',           'hud',    sfx_dmg_heal),
    ('char_jump',          'char_jump',          'system', sfx_char_jump),
    ('char_land',          'char_land',          'system', sfx_char_land),
]


def main():
    from scipy.io import wavfile
    results = []
    for sid, fname, cat, fn in SFX_LIST:
        t0 = time.time()
        y = fn()
        y = np.nan_to_num(np.asarray(y, dtype=np.float64))
        y = D.as_stereo(y)
        # 尾部淡出（防止硬切爆音）
        y = D.fade(y, in_s=0.002, out_s=min(0.04, len(y) / SR * 0.25))
        lufs_t, tp_t = LOUDNESS_BY_CAT[cat]
        st = {}
        y = M.master_sfx(y, target_lufs=lufs_t, target_tp=tp_t,
                         ceiling_db=SFX_CEILING_DBTP, stats=st)

        wav = os.path.join(OUT_WAV, f'{fname}.wav')
        mp3 = os.path.join(OUT_MP3, f'{fname}.mp3')
        wavfile.write(wav, SR, y.astype(np.float32))
        # 投产 SFX 编码档位：96kbps 单声道（引擎不做声像，立体声纯属浪费体积）。
        # ⚠️ 降混必须写显式 pan 系数，不能用 `-ac 1`：浮点管线下 swr 的 rematrix_maxval
        #    无界，等于 L+R 相加，会整体抬高 ~2.5dB 并把干净母版压出削波。
        # ★ 档位唯一事实源：tools/audio/encode_mp3.js，改码率请两边同步。
        os.system(f'ffmpeg -y -loglevel error -i "{wav}" '
                  f'-af "aformat=channel_layouts=stereo,pan=mono|c0=0.5*c0+0.5*c1" '
                  f'-codec:a libmp3lame -b:a 96k -ar 44100 '
                  f'-map_metadata -1 -write_xing 1 "{mp3}"')

        results.append((sid, cat, len(y) / SR, st['lufs'],
                        st['tp'], time.time() - t0))
        shv = st.get('shave_db') or 0.0
        flag = ' [未达标]' if st.get('tp_clamped') else ''
        shv_s = f'削峰{shv:4.1f}dB' if shv > 0.05 else '未处理  '
        print(f'  ✓ {sid:20s} [{cat:7s}] {len(y)/SR:5.2f}s  '
              f'LUFS={st["lufs"]:6.2f}  TP={st["tp"]:6.2f}dBTP  '
              f'PLR {st.get("plr_in", 0):5.1f}→{st.get("plr_out", 0):5.1f}  '
              f'{shv_s}{flag}')

    # 导出分类目标清单：体检脚本靠它知道每个文件该按哪档判定。
    # 不导出的话，diagnose_audio 只能拿 BGM 的 -18±2 去套所有音效 ——
    # 结果 41 个里 23 个被误报"超出 -18±2"，真问题反而被噪音淹没。
    import json
    manifest = {fname: {'cat': cat, 'lufs': LOUDNESS_BY_CAT[cat][0],
                        'tp': LOUDNESS_BY_CAT[cat][1]}
                for _, fname, cat, _ in SFX_LIST}
    with open(Q.sfx_targets_path(), 'w', encoding='utf-8') as fp:
        json.dump(manifest, fp, ensure_ascii=False, indent=1)

    print(f'\n共 {len(results)} 个音效')
    by_cat = {}
    for sid, cat, dur, lu, tp, _ in results:
        by_cat.setdefault(cat, []).append(lu)
    print('分类内响度一致性（跨类是刻意的强弱梯度，类内才是要收紧的）：')
    for cat in LOUDNESS_BY_CAT:
        if cat in by_cat:
            v = by_cat[cat]
            print(f'  {cat:8s} n={len(v):2d}  LUFS {min(v):6.2f} ~ {max(v):6.2f}  '
                  f'跨度 {max(v)-min(v):5.2f} LU')
    return results


if __name__ == '__main__':
    print('生成音效...')
    main()
