"""
build_bgm.py —— 喵星奇缘 BGM 作曲与生成

管弦乐 + 民谣混合风格（弦乐组 + 竖琴/鲁特琴/木笛 + 铜管 + 打击乐）。

每首曲子都包含：
  · 明确的调式与和声进行（不是随机音符）
  · 主旋律 + 织体 + 低音 + 打击乐的分层配器
  · 声部进行（voice leading）处理的和声排列
  · 差异化空间（混响）与母带参数

输出：24bit/44.1kHz WAV（供质检）与 320kbps MP3（进分包）
"""

import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meow_audio import dsp as D, synth as S, music as M

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_WAV = os.path.join(HERE, 'out', 'wav')
OUT_MP3 = os.path.join(HERE, 'out', 'mp3')
os.makedirs(OUT_WAV, exist_ok=True)
os.makedirs(OUT_MP3, exist_ok=True)

SR = 44100


# ============================================================
# 空间（混响）预设 —— 不同场景用不同的房间
# ============================================================

REVERB = {
    'menu':    dict(mix=0.32, decay_s=2.6, size=1.05, damp_hz=3600, predelay_s=0.022),
    'town':    dict(mix=0.16, decay_s=1.0, size=0.55, damp_hz=5400, predelay_s=0.009),
    'field':   dict(mix=0.24, decay_s=2.0, size=0.95, damp_hz=4300, predelay_s=0.016),
    'bright':  dict(mix=0.18, decay_s=1.4, size=0.7, damp_hz=5600, predelay_s=0.010),
    'battle':  dict(mix=0.19, decay_s=1.5, size=0.8, damp_hz=4400, predelay_s=0.011),
    'boss':    dict(mix=0.34, decay_s=3.2, size=1.4, damp_hz=3200, predelay_s=0.026),
    'victory': dict(mix=0.30, decay_s=2.8, size=1.25, damp_hz=4000, predelay_s=0.018),
    # —— 副本专属曲 ——
    # 魔法塔：中等房间，高阻尼（水晶/魔法质感，尾巴要"亮"不要"糊"）
    'magic_tower':   dict(mix=0.22, decay_s=1.7, size=0.78, damp_hz=5200, predelay_s=0.013),
    # 商人镇：小房间、极干（街头集市的亲近感，和 town 同族但更紧凑）
    'merchant_town': dict(mix=0.15, decay_s=1.0, size=0.55, damp_hz=5600, predelay_s=0.010),
    # 远古遗迹：大空间、低阻尼（空旷石殿，混响尾巴长，营造岁月感）
    'ancient_ruins': dict(mix=0.28, decay_s=2.4, size=1.05, damp_hz=3600, predelay_s=0.020),
    # 虚空迷雾：最大空间、阻尼最低（雾气弥漫，声音化不开）
    'void_mist':     dict(mix=0.36, decay_s=3.0, size=1.30, damp_hz=3000, predelay_s=0.028),
    # The King（BOSS）：大但收得住 —— 铜管要宏大，但鼓组不能被混响拖散
    'the_king':      dict(mix=0.30, decay_s=2.8, size=1.20, damp_hz=3400, predelay_s=0.024),
}

# target_lufs: 便携平台目标 -18 LUFS ±2（手机扬声器场景；主机/PC 的 -23/-24 是另一套标准）。
#   曲子之间差值即切歌时的相对强弱：菜单最安静、BOSS 最澎湃，梯度刻意保留。
# comp_ratio:  总线压缩只做"胶合"，不做"压平"。
#   ★ 这版从 1.8~3.0 降到 1.4~2.0。旧值配合固定阈值 -20dBFS，而素材本身就有
#     -6.5~-9.6 LUFS，导致整首全程深度衰减 4.5~6.8 dB，把编曲的起伏又吃掉 ~1 LU。
#     现在先预归一到 comp_ref 再压缩，增益衰减稳定在 1~3 dB（由 verify 断言）。
# comp_thresh: 相对预归一后电平设定，只削峰值、不压整体。
#   注意：目标值必须"够得着"。加了力度弧线后峰值/响度比（PLR）升高，
#   若目标定得太响，归一化时峰值会顶破限制器被压回来，各曲 miss 的量还不同，
#   反而把强弱梯度搞反（实测过：battle 定 -16.5 时实际只到 -18.5，比 menu 还静）。
#   现在 1.5 dB 的梯度是"限制器能吞得下"的范围，剩下的强度差异交给编曲密度与
#   LRA —— 这本来也是更专业的做法：强度来自配器，不来自音量旋钮。
MASTER = {
    'menu':    dict(target_lufs=-18.5, comp_ratio=1.4, comp_thresh=-18.0, width=1.25, bright_db=0.0),
    'town':    dict(target_lufs=-18.0, comp_ratio=1.6, comp_thresh=-18.0, width=1.10, bright_db=0.8),
    'field':   dict(target_lufs=-18.0, comp_ratio=1.5, comp_thresh=-18.0, width=1.20, bright_db=0.4),
    'bright':  dict(target_lufs=-17.5, comp_ratio=1.8, comp_thresh=-18.0, width=1.05, bright_db=1.4),
    'battle':  dict(target_lufs=-17.5, comp_ratio=2.0, comp_thresh=-18.0, width=1.10, bright_db=0.6),
    'boss':    dict(target_lufs=-17.0, comp_ratio=2.0, comp_thresh=-18.0, width=1.15, bright_db=-0.5),
    'victory': dict(target_lufs=-17.0, comp_ratio=1.8, comp_thresh=-18.0, width=1.30, bright_db=1.0),
    # —— 副本专属曲 ——
    # 四首副本环境曲都定在 -18.0（与 town/field 同层）：它们是"探索时的背景"，
    # 不该抢 BOSS 曲的位置；强度差异交给配器密度与 LRA，不靠音量旋钮。
    'magic_tower':   dict(target_lufs=-18.0, comp_ratio=1.6, comp_thresh=-18.0, width=1.18, bright_db=1.2),
    'merchant_town': dict(target_lufs=-18.0, comp_ratio=1.7, comp_thresh=-18.0, width=1.12, bright_db=1.0),
    # 遗迹压暗（bright 负）：石造空间的音色本就沉，硬提亮会失真
    'ancient_ruins': dict(target_lufs=-18.0, comp_ratio=1.5, comp_thresh=-18.0, width=1.20, bright_db=-0.6),
    # 虚空迷雾最暗，但仍留一点低频"撑住"，避免手机上整首听不见
    'void_mist':     dict(target_lufs=-17.8, comp_ratio=1.8, comp_thresh=-18.0, width=1.22, bright_db=-1.0),
    # The King 是 BOSS 曲，与 boss/victory 同层（-17.0），压缩比给到 2.0
    # 把铜管与鼓的动态粘住 —— 这是全曲最"满"的一首。
    'the_king':      dict(target_lufs=-17.0, comp_ratio=2.0, comp_thresh=-18.0, width=1.20, bright_db=0.2),
}

# 真峰值上限：-1 dBTP 是各平台硬标准，再留 1 dB 给 MP3 编码过冲
# （有损编码会引起 0.5~1 dB 的真峰值抬升，这是通病不是 bug）
CEILING_DBTP = -2.0


def apply_space(y, preset):
    return D.reverb(y, sr=SR, seed=7, **REVERB[preset])


# ============================================================
# 辅助：按和声进行铺和声层
# ============================================================

def lay_harmony(a, key, prog, bars, inst='strings', octave=4,
                low=48, high=77, vel=0.7, bars_per_chord=1, spread=0.25,
                pan_base=0.0, **kw):
    """按进行铺和弦长音，自动做声部进行"""
    prev = None
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(key, deg, 'triad', octave)
        v = M.voice_lead(prev, ch, low=low, high=high)
        prev = v
        st = ci * bars_per_chord * a.meter
        a.add_chord(inst, st, bars_per_chord * a.meter - 0.15, v,
                    vel=vel, spread=spread, pan=pan_base, **kw)
    return a


def arpeggio(a, key, prog, inst='harp', octave=4, low_oct=3,
             step=0.5, bars_per_chord=1, vel=0.6, pan=0.0, up_down=True,
             note_dur=0.45, **kw):
    """琶音织体（竖琴/鲁特琴）。up_down=True 时上下往复，避免单调的单向跑动"""
    beats_pc = bars_per_chord * a.meter
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(key, deg, 'triad', octave)
        base = int(ch[0]) - 12 * (octave - low_oct)
        seq = list(ch) + [int(ch[1]) + 12, int(ch[0]) + 12]
        if up_down:
            seq = seq + list(reversed(seq[1:-1]))
        n = int(beats_pc / step)
        for i in range(n):
            p = seq[i % len(seq)]
            a.add(inst, ci * beats_pc + i * step, note_dur, p,
                  vel=vel * (1.0 if (i % 4 != 3) else 0.82),
                  pan=pan, humanize=0.35, **kw)
    return a


def apply_form(a, dyn_bars, gates):
    """
    给编曲套上「曲式」—— 宏观力度弧线 + 声部进出。

    为什么必须有这一步：实测本项目 7 首 BGM 在套曲式前，干声 LRA 只有
    1.18~3.50 LU，听感就是"一条直线"，这是 MIDI 铺陈最典型的破绽。
    逐音符的 vel 微扰只能去掉机械感，造不出段落感；对比必须来自
    **织体密度的变化**（Rimsky-Korsakov：配器的力量在于对比）。

    dyn_bars: [(bar, db), ...] 段落电平表（0 dB = 最响，负值 = 弱）
              走 a.sections()：段内是平的，段间短过渡。不要改成线性插值。

    gates:    {inst: 区间表} 或 {inst: (区间表, default)}
              区间表 = [(bar_lo, bar_hi, gain), ...]

      ★★ default 是这里最容易写错、后果又最隐蔽的一个参数 ★★
        default = 0.0（默认）→ 该声部「只在列出的区间存在」，区间外完全静音。
                  适合**特色声部**：铜管动机、太鼓、镲、军鼓、竖琴华彩……
                  真实配乐里这些声部本来就是有节制地进入的，
                  全程 tutti 会立刻暴露 MIDI 味（Rimsky-Korsakov：配器靠对比）。
        default = 1.0         → 该声部「全曲都在」，列出的区间只是把它压低。
                  适合**衬底声部**：鲁特琴/ostinato 律动、弦乐震音、半音下行的
                  低音铜管与贝斯。直接静音会让律动断掉，减益才能既留律动又降响度。

        踩过的坑（2026-09-02）：town/grassland 的 lute、battle 的 strings_tremolo、
        boss 的 horn 与 bass 都写成了 [(安静段, 0.4), ...] 却沿用 default=0.0，
        效果与注释完全相反 —— 衬底声部只在安静段出声，一到 A/A' 高潮段就整段消失。
        后果不是"少了点配器"，而是**动态被反向压缩**：安静段还有底噪撑着、
        高潮段反而空了，BOSS 曲编曲层 LRA 被压到 8.35 LU（battle 同结构 14.12）。
        判据：区间表里出现 0.3~0.5 这类"减益"值，就该怀疑 default 是不是该给 1.0。

    两套手段叠加才能得到有起伏但不过头的力度弧线：
      门控负责"音色/密度"的对比（这是听感上最明显的），
      弧线负责"电平"的台阶（这是响度表上量得到的）。

    ★ 弧线深度的上限由「手机扬声器上的可听地板」决定，不是由"想要多大起伏"决定
      （2026-09-02 二次调校）：
      修好循环折叠的 bug 之后（旧版把乐句末尾的干声折回开头，等于给安静段垫了一层
      不该有的底噪，人为把 LRA 压低 3~5 LU），真实 LRA 暴露出来是 14.06~17.49 LU，
      安静段（短时响度 L10）掉到 -25.9 ~ -31.0 LUFS，比整曲低 8.9~13.5 dB。
      街道环境噪声 65~75 dB SPL，手机外放 -17.5 LUFS 约 70 dB —— 安静段直接被埋掉，
      循环时会听成"音乐没了又回来"。
      所以把各曲弧线深度从 9~12 dB 收到 5.5~10 dB，LRA 落到 11~14 LU。
      **对比不靠电平，靠织体** —— 门控一个字没动，听感上的段落感反而更清楚。
    """
    a.sections(dyn_bars)
    for inst, spec in gates.items():
        secs, default = (spec, 0.0) if not isinstance(spec, tuple) else spec
        # ★ 单位就是**小节**，不要乘 meter。
        #   Arrangement.gate() 的契约是「区间表用小节」（_gate_gain 内部会做
        #   note_beat / meter 的换算）。这里曾经多乘了一次 meter，
        #   于是 16 小节的曲子里 [(1,8),(12,16)] 被当成 [(4,32),(48,64)] 小节 ——
        #   全部落在乐曲之外或错位，门控整体失效：
        #     · bgm_battle 的 brass_stab（124 音）与 strings（24 音）**一个音都没响**，
        #       全曲只有贝斯+鼓在撑，这就是它手机外放损失 8.1LU 的真正原因 ——
        #       不是"低频太多"，而是**中频压根没有声部**。
        #     · pizz_bass 本该 1~8、12~16 小节，实际变成 4~15 小节。
        #   静态检查（verify_bgm_form [1]）读的是这里的小节表，看不出换算错误，
        #   所以这个 bug 藏了很久 —— 只有把声部单独渲染出来量才能抓到。
        a.gate(inst, [(float(lo), float(hi), float(g)) for lo, hi, g in secs],
               default=float(default))
    return a


def bass_line(a, key, prog, inst='pizz_bass', octave=2, bars_per_chord=1,
              pattern=(0, 2), vel=0.85, **kw):
    """低音线：根音 + 五度（或八度），跟随和声"""
    beats_pc = bars_per_chord * a.meter
    for ci, deg in enumerate(prog):
        root = key.degree(deg, octave)
        fifth = key.degree(deg + 2, octave)
        for i, p in enumerate(pattern):
            pitch = root if p == 0 else fifth
            at = ci * beats_pc + i * (beats_pc / len(pattern))
            a.add(inst, at, beats_pc / len(pattern) * 0.85, pitch,
                  vel=vel * (1.0 if i == 0 else 0.86), humanize=0.3, **kw)
    return a


# ============================================================
# 1. 主菜单 —— D 多利亚，宁静中带神秘
# ============================================================

def compose_menu():
    """
    D 多利亚（D E F G A B C）—— 比自然小调多一个大六度(B)，
    所以既不明亮也不悲伤，是奇幻游戏标题画面的经典选择。
    进行 i - bVII - IV - i（Dm - C - G - Dm），bVII 是多利亚的标志性音响。
    """
    a = M.Arrangement(bpm=72, sr=SR, bars=12)
    k = M.Key('D', 'dorian')
    prog = [0, 6, 3, 0, 0, 6]     # Dm - C - G - Dm - Dm - C，每和弦 2 小节
    bpc = 2

    # 和声铺底：弦乐 pad（慢起音）
    prev = None
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        v = M.voice_lead(prev, ch, low=50, high=74)
        prev = v
        a.add_chord('strings', ci * bpc * 4, bpc * 4 + 0.4, v,
                    vel=0.5, spread=0.5, pan=0.0, attack=0.55, release=0.9)
        # 低八度加厚
        a.add_chord('pad', ci * bpc * 4, bpc * 4 + 0.2, [x - 12 for x in v],
                    vel=0.32, spread=0.0, pan=0.0)

    # 竖琴琶音（流动感）
    arpeggio(a, k, prog, inst='harp', octave=4, step=0.5, bars_per_chord=bpc,
             vel=0.5, pan=-0.25, note_dur=0.9, up_down=True)

    # 主旋律：木笛，悠远
    mel = [
        ('A4', 0, 2.0, 0.85), ('D5', 2, 1.5, 0.8), ('C5', 3.5, 0.5, 0.7),
        ('A4', 4, 2.0, 0.8),  ('G4', 6, 1.0, 0.72), ('A4', 7, 1.0, 0.7),
        ('G4', 8, 2.0, 0.8),  ('C5', 10, 2.0, 0.85),
        ('A4', 12, 1.5, 0.75), ('G4', 13.5, 0.5, 0.65), ('E4', 14, 2.0, 0.72),
        ('G4', 16, 1.0, 0.75), ('A4', 17, 1.0, 0.75), ('B4', 18, 2.0, 0.85),
        ('A4', 20, 2.0, 0.75), ('G4', 22, 2.0, 0.7),
        ('F4', 24, 1.0, 0.75), ('E4', 25, 1.0, 0.72), ('D4', 26, 2.0, 0.7),
        ('E4', 28, 1.0, 0.6), ('D4', 29, 3.0, 0.62),
        # A' 段（bar 8-11）：旋律上扬再回落，与 A 段形成呼应
        ('D5', 32, 2.0, 0.8),  ('F5', 34, 1.0, 0.75), ('E5', 35, 1.0, 0.72),
        ('D5', 36, 2.0, 0.78), ('C5', 38, 2.0, 0.72),
        ('E5', 40, 1.0, 0.75), ('G5', 41, 1.0, 0.8),  ('F5', 42, 2.0, 0.78),
        ('E5', 44, 2.0, 0.72), ('D5', 46, 2.0, 0.65),
    ]
    for p, s, d, v in mel:
        a.add('recorder', s, d, p, vel=v, pan=0.12, humanize=0.5, breath=0.9)
        # 高八度长笛重叠后半段，形成"回忆浮现"的层次
        if s >= 32 and d >= 1.5:
            a.add('flute', s, d, p, vel=v * 0.3, pan=-0.35, humanize=0.4)

    # 合唱：极轻的衬底，增加"史诗感"的远景
    for ci, deg in enumerate(prog):
        root = k.degree(deg, 4)
        a.add_chord('choir', ci * bpc * 4, bpc * 4 + 0.5,
                    [root - 12, root + 4], vel=0.16, spread=0.0,
                    pan=0.0, vowel='ah', attack=0.9, release=1.2)

    # 铃鼓点缀（每 4 小节一次）
    a.add_perc('tambourine', 0, vel=0.25, pan=-0.4)
    a.add_perc('tambourine', 16, vel=0.22, pan=0.35)

    # ---- 曲式：12 小节的起承转合 ----
    # intro(0-2) 只剩和声远景 → A(2-6) 木笛主题进来 → 桥(6-8) 撤旋律留白
    # → A'(8-12) 全奏、长笛叠八度推到顶点 → 回落接回循环点
    return apply_form(a, [
        (0, -7.5), (2, -3.0), (6, -4.0), (8, 0.0), (11, -3.5),
    ], {
        'recorder': [(2, 6, 1.0), (8, 12, 1.0)],
        'harp':     [(2, 6, 1.0), (8, 12, 1.0)],
        'choir':    [(4, 12, 1.0)],
        'tambourine': [(4, 12, 1.0)],
    })


# ============================================================
# 2. 城镇 —— G 大调，轻快亲切
# ============================================================

def compose_town():
    """
    G 大调，I-V-vi-IV 循环。
    配器思路：鲁特琴做 8 分音符分解和弦（节奏骨架）+ 手鼓/铃鼓（律动）
    + 木笛主旋律 + 拨弦贝斯。整体偏干（小房间混响），营造"街头的亲近感"。
    """
    a = M.Arrangement(bpm=112, sr=SR, bars=16)
    k = M.Key('G', 'major')
    prog = [0, 4, 5, 3, 0, 4, 3, 4] * 2  # G D Em C G D C D（A-A' 两段）

    # 和声：弦乐拨奏（轻快，不做成长音）
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        v = M.voice_lead(None, ch, low=55, high=76)
        for beat in (0, 1.5, 2.5):
            a.add_chord('strings_pizz', ci * 4 + beat, 0.5, v,
                        vel=0.45 if beat == 0 else 0.32, spread=0.35, pan=-0.1)

    # 鲁特琴：8 分音符分解和弦（节奏引擎）
    arpeggio(a, k, prog, inst='lute', octave=4, step=0.5, bars_per_chord=1,
             vel=0.55, pan=0.3, note_dur=0.4, up_down=True)

    # 拨弦贝斯
    bass_line(a, k, prog, inst='pizz_bass', octave=2,
              pattern=(0, 2, 0, 2), vel=0.8)

    # 主旋律：木笛，跳跃欢快
    mel = [
        ('D5', 0, 0.5, 0.9),  ('G5', 0.5, 0.5, 0.8), ('B4', 1, 0.5, 0.75),
        ('D5', 1.5, 0.5, 0.8), ('G5', 2, 1.0, 0.9),  ('F#5', 3, 1.0, 0.8),
        ('A4', 4, 0.5, 0.8),  ('D5', 4.5, 0.5, 0.78), ('F#5', 5, 1.0, 0.85),
        ('E5', 6, 1.0, 0.78), ('D5', 7, 1.0, 0.75),
        ('E5', 8, 1.0, 0.85), ('G5', 9, 1.0, 0.82),
        ('B4', 10, 0.5, 0.75), ('E5', 10.5, 0.5, 0.78), ('G5', 11, 1.0, 0.8),
        ('E5', 12, 1.0, 0.82), ('D5', 13, 1.0, 0.78), ('C5', 14, 2.0, 0.8),
        ('G5', 16, 0.5, 0.88), ('B4', 16.5, 0.5, 0.75), ('D5', 17, 1.0, 0.85),
        ('G5', 18, 2.0, 0.9),
        ('F#5', 20, 1.0, 0.85), ('A5', 21, 1.0, 0.82), ('G5', 22, 2.0, 0.8),
        ('E5', 24, 1.0, 0.8),  ('G5', 25, 1.0, 0.82), ('E5', 26, 2.0, 0.78),
        ('D5', 28, 1.0, 0.8),  ('F#5', 29, 1.0, 0.82), ('D5', 30, 2.0, 0.75),
    ]
    for p, s, d, v in mel:
        a.add('recorder', s, d, p, vel=v, pan=-0.15, humanize=0.6, breath=0.7)
    # A' 段：同一旋律换长笛 + 反向声像 —— 重复而不单调的标准手法
    for p, s, d, v in mel:
        a.add('flute', s + 32, d, p, vel=v * 0.8, pan=0.18, humanize=0.6)

    # 打击乐：手鼓 + 铃鼓（民谣律动），A' 段加沙锤与铃鼓密度
    for bar in range(16):
        b = bar * 4
        a.add_perc('hand_drum', b, vel=0.75, pitch='A2', pan=0.15)
        a.add_perc('hand_drum', b + 1.5, vel=0.45, pitch='E3', pan=-0.1)
        a.add_perc('hand_drum', b + 2.5, vel=0.6, pitch='A2', pan=0.1)
        a.add_perc('tambourine', b + 1, vel=0.4, pan=-0.35)
        a.add_perc('tambourine', b + 3, vel=0.5, pan=0.3)
        if bar % 2 == 1:
            a.add_perc('shaker', b + 3.5, vel=0.3, pan=0.25)
        if bar >= 8:                       # A' 段加厚
            a.add_perc('shaker', b + 0.75, vel=0.22, pan=-0.2)
            a.add_perc('tambourine', b + 2, vel=0.3, pan=0.25)

    # 竖琴装饰（每 2 小节一句上行）
    for bar in (2, 6, 10, 14):
        ch = M.chord_midi(k, prog[bar], 'triad', 5)
        for i, p in enumerate(ch + [ch[0] + 12]):
            a.add('harp', bar * 4 + 3 + i * 0.25, 0.6, p, vel=0.4, pan=0.4)

    # ---- 曲式：16 小节 引子 - A - 桥 - A' ----
    # ★ 安静段必须给足 4 小节（占全曲 25%），2 小节没用：LRA 取 3 秒窗的第 10 百分位，
    #   2 小节在 112bpm 下只有 4.3 秒，撑不到 10 百分位上，弧线白画（实测过）。
    # intro(0-3) 只有鲁特琴与贝斯，街头由远及近
    # → A(3-8) 全套律动 + 木笛主题
    # → 桥(8-12) 撤掉整套打击乐与旋律，只留分解和弦 —— 四小节的"换气"
    # → A'(12-16) 长笛主题 + 沙锤加厚，全曲顶点
    return apply_form(a, [
        (0, -5.0), (3, -1.0), (8, -4.0), (12, 0.0), (15, -1.5),
    ], {
        'recorder':     [(3, 8, 1.0)],
        'flute':        [(12, 16, 1.0)],
        # 同 grassland：拨弦织体与贝斯是地基，全曲在场、稀疏段减益（留骨架换色彩）
        'strings_pizz': ([(0, 3, 0.35), (8, 12, 0.30)], 1.0),
        'pizz_bass':    ([(0, 3, 0.45), (8, 12, 0.40)], 1.0),
        'hand_drum':    [(3, 8, 1.0), (12, 16, 1.0)],
        'tambourine':   [(3, 8, 1.0), (12, 16, 1.0)],
        'shaker':       [(12, 16, 1.0)],
        'harp':         [(4, 16, 1.0)],
        # 鲁特琴分解和弦是贯穿全曲的节奏引擎，静音会把律动掐断；
        # 用 0.35~0.4 的减益做"弱奏但仍在动"，既留律动又真的降了响度
            # 鲁特琴是全曲的律动引擎，不能断 —— 安静段减益退到背景，高潮段必须满血。
        # （写成 [(0,3,0.40),(8,12,0.35)] 配 default=0.0 会让它在 A/A' 段整段消失）
    'lute':         ([(0, 3, 0.40), (8, 12, 0.35)], 1.0),
    })


# ============================================================
# 3. 野外探索 —— D 大调，开阔
# ============================================================

def compose_explore():
    """
    D 大调 I-vi-IV-V。
    配器：弦乐 8 分音符 ostinato（推进感）+ 圆号长音（空间感）
    + 竖笛旋律 + 定音鼓（跟随和声根音，注意定音鼓是调音乐器）。
    """
    a = M.Arrangement(bpm=96, sr=SR, bars=16)
    k = M.Key('D', 'major')
    prog = [0, 5, 3, 4, 0, 5, 3, 4] * 2  # D Bm G A

    # 弦乐 ostinato（8 分音符，音型化 —— 这是探索曲的推进引擎）
    prev = None
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        v = M.voice_lead(prev, ch, low=53, high=74)
        prev = v
        seq = [v[0], v[1], v[2], v[1]]
        for i in range(8):
            a.add('strings', ci * 4 + i * 0.5, 0.42, seq[i % 4],
                  vel=0.42 if i % 2 == 0 else 0.32, pan=-0.2 + (i % 4) * 0.1,
                  attack=0.035, release=0.16, humanize=0.35)

    # 圆号长音（和声的"远景"）
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 3)
        a.add_chord('horn', ci * 4, 4.2, [ch[0], ch[2]], vel=0.42,
                    spread=0.15, pan=0.28, attack=0.22, release=0.5)

    # 拨弦贝斯 + 大提琴
    bass_line(a, k, prog, inst='bass', octave=2, pattern=(0, 0), vel=0.7)

    # 主旋律：竖笛 + 长笛交替
    mel = [
        ('A4', 0, 1.0, 0.82), ('D5', 1, 1.0, 0.85), ('F#5', 2, 2.0, 0.9),
        ('E5', 4, 1.0, 0.8),  ('D5', 5, 1.0, 0.78), ('B4', 6, 2.0, 0.8),
        ('G4', 8, 1.0, 0.78), ('B4', 9, 1.0, 0.8),  ('A4', 10, 2.0, 0.82),
        ('C#5', 12, 2.0, 0.85), ('E5', 14, 2.0, 0.88),
        ('D5', 16, 1.0, 0.85), ('E5', 17, 1.0, 0.82), ('F#5', 18, 2.0, 0.9),
        ('F#5', 20, 2.0, 0.85), ('D5', 22, 2.0, 0.78),
        ('G5', 24, 1.0, 0.85), ('F#5', 25, 1.0, 0.8), ('E5', 26, 2.0, 0.82),
        ('C#5', 28, 2.0, 0.85), ('A4', 30, 2.0, 0.78),
    ]
    for p, s, d, v in mel:
        inst = 'flute' if s < 16 else 'recorder'
        a.add(inst, s, d, p, vel=v, pan=0.05, humanize=0.5)
    # A' 段：换乐器对调（A 段用长笛的段落改竖笛，反之亦然）
    for p, s, d, v in mel:
        inst = 'recorder' if s < 16 else 'flute'
        a.add(inst, s + 32, d, p, vel=v * 0.82, pan=-0.12, humanize=0.55)

    # 定音鼓：跟随和声根音（这是配器法常识，不是随便敲）
    for ci, deg in enumerate(prog):
        root = k.degree(deg, 2)
        a.add_perc('timpani', ci * 4, vel=0.6, pitch=root, pan=0.0)
        if ci % 2 == 1:
            a.add_perc('timpani', ci * 4 + 2.5, vel=0.42, pitch=root)

    # 竖琴（色彩点缀）
    arpeggio(a, k, prog, inst='harp', octave=5, step=1.0,
             bars_per_chord=1, vel=0.3, pan=0.45, note_dur=0.8)

    # ---- 曲式：16 小节 引子 - A - 桥 - A' ----
    # intro(0-3) 只有圆号远景（空旷的荒野），弦乐 ostinato 从第 2 小节进入
    # → A(3-8) 全套：ostinato + 定音鼓 + 旋律
    # → 桥(8-12) 撤掉 ostinato、贝斯、定音鼓与旋律，只留圆号 —— 开阔的留白
    # → A'(12-16) 全部回到并推到顶点
    return apply_form(a, [
        (0, -6.5), (3, -1.5), (8, -5.0), (12, 0.0), (15, -2.5),
    ], {
        'strings':  [(0, 2, 0.35), (2, 8, 1.0), (8, 12, 0.30), (12, 16, 1.0)],
        'bass':     [(3, 8, 1.0), (12, 16, 1.0)],
        'flute':    [(3, 8, 1.0), (12, 16, 1.0)],
        'recorder': [(3, 8, 1.0), (12, 16, 1.0)],
        'timpani':  [(3, 8, 1.0), (12, 16, 1.0)],
        'harp':     [(4, 8, 1.0), (12, 16, 1.0)],
    })


# ============================================================
# 4. 草原副本 —— C 大调五声，明亮欢快
# ============================================================

def compose_grassland():
    """
    C 大调（五声化旋律 C D E G A）。
    这是"阳光草原"副本的专属曲：速度最快、织体最轻、打击乐最活跃。
    用钟琴和铃鼓制造"闪闪发亮"的质感。
    """
    a = M.Arrangement(bpm=126, sr=SR, bars=16)
    k = M.Key('C', 'major')
    prog = [0, 4, 5, 3, 0, 4, 3, 4] * 2  # C G Am F C G F G

    # 拨弦织体（16 分音符跳跃 —— 欢快的核心）
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        v = M.voice_lead(None, ch, low=55, high=76)
        for i in range(8):
            p = v[i % 3]
            a.add('strings_pizz', ci * 4 + i * 0.5, 0.3, p,
                  vel=0.5 if i % 2 == 0 else 0.34,
                  pan=-0.3 + (i % 4) * 0.18, humanize=0.4)

    # 鲁特琴（民谣底色）
    arpeggio(a, k, prog, inst='lute', octave=4, step=0.5, bars_per_chord=1,
             vel=0.42, pan=0.32, note_dur=0.35, up_down=True)

    # 拨弦贝斯（跳跃的根音 - 五度）
    bass_line(a, k, prog, inst='pizz_bass', octave=2,
              pattern=(0, 2, 0, 2), vel=0.8)

    # 主旋律：五声化，大量跳进（活泼的关键）
    mel = [
        ('G4', 0, 0.5, 0.85), ('C5', 0.5, 0.5, 0.88), ('E5', 1, 1.0, 0.9),
        ('D5', 2, 1.0, 0.82), ('C5', 3, 1.0, 0.8),
        ('D5', 4, 0.5, 0.85), ('G5', 4.5, 0.5, 0.9), ('E5', 5, 1.0, 0.82),
        ('D5', 6, 2.0, 0.85),
        ('E5', 8, 0.5, 0.85), ('A5', 8.5, 0.5, 0.9), ('G5', 9, 1.0, 0.85),
        ('E5', 10, 1.0, 0.8), ('C5', 11, 1.0, 0.78),
        ('A4', 12, 0.5, 0.8), ('C5', 12.5, 0.5, 0.82), ('F5', 13, 1.0, 0.88),
        ('E5', 14, 2.0, 0.85),
        ('G5', 16, 0.5, 0.88), ('C6', 16.5, 0.5, 0.9), ('G5', 17, 1.0, 0.85),
        ('E5', 18, 2.0, 0.82),
        ('D5', 20, 0.5, 0.85), ('G5', 20.5, 0.5, 0.88), ('B4', 21, 1.0, 0.8),
        ('D5', 22, 2.0, 0.82),
        ('C5', 24, 0.5, 0.82), ('F5', 24.5, 0.5, 0.85), ('A5', 25, 1.0, 0.88),
        ('G5', 26, 2.0, 0.85),
        ('D5', 28, 1.0, 0.85), ('G5', 29, 1.0, 0.88), ('C5', 30, 2.0, 0.8),
    ]
    for p, s, d, v in mel:
        a.add('recorder', s, d, p, vel=v, pan=-0.12, humanize=0.55, breath=0.6)
    # A' 段：旋律上移八度（明亮感升级），钟琴同步跟奏
    for p, s, d, v in mel:
        a.add('flute', s + 32, d, p, vel=v * 0.78, pan=0.2, humanize=0.55)

    # 钟琴：高八度点缀旋律骨干（"闪光"质感）
    for p, s, d, v in mel[::4]:
        a.add('glockenspiel', s, d, p, vel=v * 0.42, pan=0.45, humanize=0.2)
        a.add('glockenspiel', s + 32, d, p, vel=v * 0.42, pan=-0.4, humanize=0.2)

    # 打击乐：手鼓 + 铃鼓（密集、轻快）
    for bar in range(16):
        b = bar * 4
        a.add_perc('hand_drum', b, vel=0.8, pitch='C2', pan=0.2)
        a.add_perc('hand_drum', b + 1, vel=0.4, pitch='G2', pan=-0.15)
        a.add_perc('hand_drum', b + 2, vel=0.65, pitch='C2', pan=0.15)
        a.add_perc('hand_drum', b + 3, vel=0.45, pitch='G2', pan=-0.1)
        a.add_perc('tambourine', b + 0.5, vel=0.35, pan=-0.4)
        a.add_perc('tambourine', b + 1.5, vel=0.45, pan=0.35)
        a.add_perc('tambourine', b + 2.5, vel=0.35, pan=-0.35)
        a.add_perc('tambourine', b + 3.5, vel=0.55, pan=0.4)
        a.add_perc('shaker', b + 3.75, vel=0.28, pan=0.2)

    # ---- 曲式：16 小节 引子 - A - 桥 - A' ----
    # intro(0-3) 只有鲁特琴与贝斯（草原由远及近）
    # → A(3-8) 拨弦织体 + 全套打击乐 + 竖笛主题
    # → 桥(8-12) 撤掉打击乐与旋律，只留鲁特琴分解和弦（四小节喘息）
    # → A'(12-16) 长笛高八度主题 + 钟琴闪光，全曲顶点
    return apply_form(a, [
        (0, -5.0), (3, -1.0), (8, -4.0), (12, 0.0), (15, -1.5),
    ], {
        # ★ 拨弦织体与贝斯是"地基"，不是"事件"：静音会把 intro / 桥段抽成
        #   只剩一把鲁特琴。实测修好门控单位 bug 之后（声部真的按小节进出了），
        #   本曲安静段短时响度掉到 -34.3 LUFS —— 比整曲低 16.8 dB，
        #   手机外放上整段听不见，循环起来就是"音乐没了又回来"。
        #   改成全曲在场、稀疏段减益退到背景：留骨架、换色彩，
        #   段落的对比由旋律声部（竖笛/长笛/钟琴）的进出承担。
        'strings_pizz': ([(0, 3, 0.35), (8, 12, 0.30)], 1.0),
        'pizz_bass':    ([(0, 3, 0.45), (8, 12, 0.40)], 1.0),
        'recorder':     [(3, 8, 1.0)],
        'flute':        [(12, 16, 1.0)],
        'glockenspiel': [(4, 8, 1.0), (12, 16, 1.0)],
        'hand_drum':    [(3, 8, 1.0), (12, 16, 1.0)],
        'tambourine':   [(3, 8, 1.0), (12, 16, 1.0)],
        'shaker':       [(3, 8, 1.0), (12, 16, 1.0)],
        # 同 town：鲁特琴是节奏引擎，用减益而不是静音
            # 鲁特琴是全曲的律动引擎，不能断 —— 安静段减益退到背景，高潮段必须满血。
        # （写成 [(0,3,0.40),(8,12,0.35)] 配 default=0.0 会让它在 A/A' 段整段消失）
    'lute':         ([(0, 3, 0.40), (8, 12, 0.35)], 1.0),
    })


# ============================================================
# 5. 普通战斗 —— E 小调，紧张推进
# ============================================================

def compose_battle():
    """
    E 小调 i-VI-III-VII (Em C G D) —— 游戏战斗曲最经典的进行之一。
    
    战斗曲的关键不是旋律，而是**推进力**：
    1. 弦乐 16 分震音（持续紧张）
    2. 铜管切分强音（重音错位制造推动）
    3. 太鼓的稳定脉动 + 定音鼓重击
    4. 拨弦贝斯的快速根音
    """
    a = M.Arrangement(bpm=142, sr=SR, bars=16)
    k = M.Key('E', 'minor')
    prog = [0, 5, 3, 4, 0, 5, 3, 4] * 2  # Em C G D

    # 弦乐震音（紧张底噪）
    #   ★ 音域 52~72 → 60~79（165~523Hz → 262~784Hz），vel 0.4 → 0.62。
    #     原来整段压在 lowmid(250-500)，mid(500-2000) 一个音都没有 ——
    #     实测本曲 mid 段比其他 6 首低 14~18 dB，手机小喇叭上只剩"轰隆"，
    #     旋律完全听不出来。
    #     震音是全曲唯一的**持续**声部：铜管是断奏、鼓是瞬态，只有它一直在响，
    #     所以中频"有没有东西"几乎完全由它决定 —— 抬它性价比最高。
    #     vel 也必须提：实测原来只占全曲 -12.6dB，等于不存在。
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        v = M.voice_lead(None, ch, low=64, high=84)
        for i in range(4):
            a.add('strings_tremolo', ci * 4 + i, 0.95, v[i % 3],
                  vel=0.72, pan=-0.25 + (i % 2) * 0.5, rate=8.5, depth=0.5)

    # 铜管切分强音（推进感的来源）
    #   ★ octave 3→4：和声垫从 165~247Hz 抬到 330~494Hz，给上方的旋律腾出
    #     声部空间（配器法：和声垫在下、旋律在上，别挤在同一个八度里互相糊）。
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        # 切分：落在 1.5 / 3.5 拍（弱拍强奏 = 推动）
        a.add_chord('brass_stab', ci * 4 + 1.5, 0.5, [ch[0], ch[2]],
                    vel=0.85, spread=0.08, pan=0.3)
        a.add_chord('brass_stab', ci * 4 + 3.5, 0.5, [ch[1], ch[2] + 12],
                    vel=0.7, spread=0.08, pan=-0.25)
        if ci % 4 == 0:
            a.add_chord('brass_stab', ci * 4, 0.8, [ch[0], ch[2], ch[0] + 12],
                        vel=1.0, spread=0.1, pan=0.0)

    # 拨弦贝斯（8 分驱动）
    #   ★ 两处改动，都是同一个病根：贝斯和定音鼓原本都堆在 octave 2（82~131Hz），
    #     两个声部在同一音区做同一件事 —— 这是"浑浊"最经典的成因（不是音量问题，
    #     是音区分配问题）。实测本曲 95.3% 的能量在 250Hz 以下、500~2000Hz 比
    #     其他 6 首低 14~18dB，手机外放损失 12.7LU（其他曲 2.8~6.3LU）。
    #     ① 贝斯抬到 octave 3（165~262Hz）：与定音鼓分层，让位给鼓做低频基础，
    #        自己退到大提琴音区承担律动 —— 这才是它该干的活。
    #     ② vel 0.75/0.5 → 0.62/0.42：8 分音符 ostinato 是全曲密度最高的声部，
    #        单音符看着不响，一个声部就吃掉全曲一半能量（实测 -0.5dB 占全曲）。
    for ci, deg in enumerate(prog):
        root = k.degree(deg, 3)
        for i in range(8):
            a.add('pizz_bass', ci * 4 + i * 0.5, 0.4, root,
                  vel=0.62 if i % 2 == 0 else 0.42, humanize=0.3, pan=0.0)

    # 铜管短动机（战斗主题，重复 = 记忆点）
    #   ★ 整体上移一个八度：E4~B4(329~494Hz) → E5~B5(659~988Hz)。
    #     小号最有穿透力的音区就在 600~1000Hz，这也是游戏战斗主题的常规音区；
    #     原来压在 329~494Hz，正好和低频鼓组/贝斯抢占同一片区域，
    #     结果就是低频轰隆、旋律被埋 —— 手机外放尤其致命。
    motif = [('E5', 0, 0.5, 0.9), ('G5', 0.5, 0.5, 0.85),
             ('B5', 1, 0.75, 0.95), ('A5', 2, 0.5, 0.85), ('G5', 2.5, 0.5, 0.85),
             ('E5', 3, 1.0, 0.9)]
    for rep in range(8):
        off = rep * 8
        for p, s, d, v in motif:
            a.add('brass_stab', off + s, d, p, vel=v * (1.0 if rep % 2 == 0 else 0.9),
                  pan=-0.15 if rep % 2 == 0 else 0.15, humanize=0.2)
            # 后半段用弦乐齐奏加厚主题（配器渐进，避免 8 次重复听腻）
            if rep >= 4:
                # 弦乐齐奏加厚：0.45 → 0.72。这是 mid(500-2000) 段第二个
                # 也是最后一个支撑点，原来太弱，铜管一停中频就塌了。
                a.add('strings', off + s, d + 0.2, p, vel=v * 0.72,
                      pan=0.15 if rep % 2 == 0 else -0.15, attack=0.05, humanize=0.3)

    # 打击乐：太鼓（重拍）+ 定音鼓（和声根音）+ 镲
    for ci, deg in enumerate(prog):
        b = ci * 4
        root = k.degree(deg, 2)
        # ★ 太鼓 pitch 从 root-12 改成 root-5：原来是 41~65Hz，其中 Em 段的
        #   41Hz 已经在真实太鼓基频（60~90Hz）以下 —— 手机微型喇叭在 100Hz
        #   以下以约 12dB/oct 急剧衰减，这段能量基本白给，还白占动态余量。
        #   抬到 58~92Hz 才既听得见、又保住"沉重"的体感。
        # 太鼓略收（-1.5dB）：它的能量 99.4% 在 250Hz 以下，而低频正是手机
        # 外放唯一放不出来的部分 —— 把余量让给中高频的镲与军鼓更划算。
        a.add_perc('taiko', b, vel=0.64, pitch=root - 5, pan=0.0)
        a.add_perc('taiko', b + 2, vel=0.47, pitch=root - 5, pan=0.1)
        a.add_perc('taiko', b + 3.5, vel=0.38, pitch=root - 5, pan=-0.1)
        a.add_perc('timpani', b + 1.5, vel=0.7, pitch=root, pan=-0.05)
        # 镲与军鼓提上来：它们是全曲仅有的两个中高频声部，也是唯一能在手机
        # 微型喇叭上"活下来"的成分。原电平下两者合计只占全曲 -21dB，
        # 等于不存在 —— 旋律与节奏骨架在手机上一起消失了。
        if ci % 4 == 0:
            a.add_perc('cymbal', b, vel=0.85, pan=0.3, crash=True)
        if ci % 2 == 1:
            a.add_perc('snare', b + 3, vel=0.95, pan=0.25)
            a.add_perc('snare', b + 3.5, vel=0.70, pan=-0.2)

    # ---- 曲式：16 小节 引子 - A - 桥 - A' ----
    # intro(0-3) 只有弦乐震音与定音鼓（开战前的紧绷，不给重击）
    # → A(4-8) 铜管动机 + 太鼓全开
    # → 桥(8-12) 铜管与太鼓全部撤掉，只剩震音 —— 压力蓄积，
    #   这一下留白同时给了后段 8 dB 的动态空间，是整首最响段落能"响得起来"的前提
    # → A'(12-16) 铜管动机 + 弦乐齐奏叠加 + 全套打击乐，全曲顶点
    return apply_form(a, [
        (0, -5.5), (3, -1.0), (8, -5.0), (12, 0.0), (15, -2.0),
    ], {
        'brass_stab': [(4, 8, 1.0), (12, 16, 1.0)],
        # 同 grassland/town：贝斯是地基，全曲在场、稀疏段减益
        'pizz_bass':  ([(0, 3, 0.45), (8, 12, 0.40)], 1.0),
        'strings':    [(12, 16, 1.0)],
        'taiko':      [(3, 8, 1.0), (12, 16, 1.0)],
        'cymbal':     [(3, 8, 1.0), (12, 16, 1.0)],
        'snare':      [(3, 8, 1.0), (12, 16, 1.0)],
        # 震音是"紧张底噪"，全曲不能断，但安静段要退到背景里。
        # ★ default=1.0 是关键：衬底声部在 A/A' 段要满血，只有安静段才减益。
        #   沿用 default=0.0 会变成"只在安静段有底噪、高潮段反而空"，
        #   动态弧线会被反向压平。
        'strings_tremolo': ([(0, 3, 0.45), (8, 12, 0.40)], 1.0),
    })


# ============================================================
# 6. BOSS 战 —— C 小调，压迫宏大
# ============================================================

def compose_boss():
    """
    C 小调，低音半音下行 C - Bb - Ab - G（i - VII - VI - V）。
    
    BOSS 曲的压迫感来自三个手段：
    1. **低音半音下行** —— 最经典的"厄运降临"手法（从帕赫贝尔到现代游戏都用它）
    2. **合唱衬底** —— 人声天然带有"仪式感/神圣感"，比任何乐器都有效
    3. **留白与重击** —— 重拍留白，让太鼓的一击有足够的动态空间
    """
    a = M.Arrangement(bpm=150, sr=SR, bars=16)
    k = M.Key('C', 'minor')
    prog = [0, 6, 5, 4, 0, 6, 5, 4] * 2  # Cm Bb Ab G

    # 低音铜管（半音下行的主体，长音 + 慢起）
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 3)
        a.add_chord('horn', ci * 4, 4.0, [ch[0], ch[2]],
                    vel=0.62, spread=0.12, pan=0.3, attack=0.18, release=0.6)
        # 低八度加厚
        a.add('bass', ci * 4, 3.9, ch[0] - 12, vel=0.75, pan=0.0)

    # 弦乐：半音级进的紧张音型（不安感）
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        v = M.voice_lead(None, ch, low=55, high=75)
        for i in range(8):
            # 相邻半音震荡（tremolo + 半音）
            p = v[i % 3] + (1 if i % 4 == 3 else 0)
            a.add('strings', ci * 4 + i * 0.5, 0.45, p,
                  vel=0.36 if i % 2 == 0 else 0.28,
                  pan=-0.3 + (i % 3) * 0.3, attack=0.05, release=0.14)

    # 合唱：神圣感的来源（'oo' 元音，低沉）
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        a.add_chord('choir', ci * 4, 4.3, [ch[0], ch[1], ch[2]],
                    vel=0.4, spread=0.1, pan=0.0, vowel='oo',
                    attack=0.5, release=0.8)

    # BOSS 主题动机：铜管，附点节奏（英雄与威胁并存）
    motif = [('G4', 0, 0.75, 0.95), ('C5', 0.75, 0.25, 0.85),
             ('Bb4', 1, 0.5, 0.9),  ('Ab4', 1.5, 0.5, 0.88),
             ('G4', 2, 1.5, 0.95),  ('Eb4', 3.5, 0.5, 0.85)]
    for rep in range(8):
        off = rep * 8
        for p, s, d, v in motif:
            a.add('brass_stab', off + s, d, p,
                  vel=v * (1.0 if rep % 2 == 0 else 0.92),
                  pan=(-0.2 if rep % 2 == 0 else 0.2), humanize=0.2)
            # 后半段叠加高八度铜管（配器加厚，把情绪推上去）
            if rep >= 4:
                a.add('horn', off + s, d + 1.0, p, vel=v * 0.4,
                      pan=(0.2 if rep % 2 == 0 else -0.2), attack=0.1, humanize=0.2)

    # 打击乐：太鼓重击 + 镲 + 定音鼓
    for ci, deg in enumerate(prog):
        b = ci * 4
        root = k.degree(deg, 2)
        # 重拍留白：只在 1 和 3.5 击打，给重击留出动态空间
        a.add_perc('taiko', b, vel=1.0, pitch=root - 12, pan=0.0)
        a.add_perc('taiko', b + 3.5, vel=0.85, pitch=root - 12, pan=0.12)
        a.add_perc('timpani', b + 2, vel=0.8, pitch=root, pan=-0.1)
        if ci % 4 == 0:
            a.add_perc('cymbal', b, vel=0.75, pan=0.35, crash=True)
        if ci % 4 == 3:
            # 每 4 小节一次密集军鼓推进（段落收束）
            for i in range(4):
                a.add_perc('snare', b + 3 + i * 0.25, vel=0.4 + i * 0.15,
                           pan=-0.25 + i * 0.15)

    # ---- 曲式：16 小节 引子 - A - 桥 - A' ----
    # intro(0-3) 只有半音下行的低音铜管与合唱（厄运降临，还不给重击）
    # → A(4-8) 铜管动机 + 太鼓 + 镲
    # → 桥(8-12) 打击乐与铜管全部撤掉，合唱顶上来 —— 暴风雨前的死寂。
    #   这一下留白比任何重击都更压迫，同时也是后段能推到顶点的前提。
    # → A'(12-16) 全套 + 圆号叠加动机，全曲顶点
    # 合唱从 A 段才进来（引子不给），桥段顶到 1.35 —— 死寂里只剩人声最压迫
    a.gate('choir', [(4, 8, 1.0), (8, 12, 1.35), (12, 16, 0.9)], default=0.0)
    return apply_form(a, [
        (0, -9.0), (3, -1.5), (8, -7.5), (12, 0.0), (15, -2.0),
    ], {
        'strings':    [(2, 8, 1.0), (12, 16, 1.0)],
        'brass_stab': [(4, 8, 1.0), (12, 16, 1.0)],
        # 半音下行的低音铜管是 BOSS 的身份，不能断；但引子/桥段要退到远处。
        # ★ 必须 default=1.0：这是衬底声部，列区间是为了"压低"不是"只在此存在"。
        #   原写法 default=0.0 让它在 A(4-8) 与 A'(12-16) 两个主段整段消失 ——
        #   BOSS 的身份动机恰好在最该出现的地方缺席，LRA 也被压到 8.35 LU。
        'horn':       ([(0, 3, 0.40), (8, 12, 0.45)], 1.0),
        'taiko':      [(4, 8, 1.0), (12, 16, 1.0)],
        'timpani':    [(4, 8, 1.0), (12, 16, 1.0)],
        'cymbal':     [(4, 8, 1.0), (12, 16, 1.0)],
        'snare':      [(4, 8, 1.0), (12, 16, 1.0)],
        # 低音是半音下行的主体，不能断；安静段减益退到背景。
        # ★ 同 horn：default=1.0。贝斯在 A/A' 段消失会让整首曲子"没根"。
        'bass':       ([(0, 3, 0.35), (8, 12, 0.35)], 1.0),
    })


# ============================================================
# 7. 通关 —— C 大调，辉煌终止（不循环）
# ============================================================

def compose_victory():
    """
    C 大调，三段式：
      A (bar 0-3)  号角前奏：铜管附点节奏 + 定音鼓滚奏 —— "宣告"
      B (bar 4-11) 主题：弦乐 + 圆号 + 长笛 —— "凯旋"
      C (bar 12-15) 终止：完满终止 V-I + 钟琴 + 合唱 —— "落定"
    
    通关音乐必须是**有终止式的完整乐句**，不能是循环片段 ——
    玩家需要听到"结束了"的信号，这是游戏音乐的基本语法。
    """
    a = M.Arrangement(bpm=124, sr=SR, bars=16)
    k = M.Key('C', 'major')

    # ---- A: 号角前奏（C - G - C - G）----
    fanfare = [
        ('C4', 0, 0.75, 1.0), ('E4', 0.75, 0.25, 0.85), ('G4', 1, 1.5, 0.95),
        ('C5', 2.5, 0.5, 1.0), ('B4', 3, 0.5, 0.9), ('C5', 3.5, 0.5, 0.95),
    ]
    for p, s, d, v in fanfare:
        a.add('brass_stab', s, d, p, vel=v, pan=0.0, humanize=0.15)
        a.add('horn', s, d + 1.5, p, vel=v * 0.6, pan=0.25, attack=0.08)
    # 定音鼓滚奏
    for i in range(8):
        a.add_perc('timpani', i * 0.5, vel=0.45 + i * 0.05, pitch='C2', pan=0.0)

    # ---- B: 主题（C - G - Am - F - C - F - G - C）----
    prog = [0, 4, 5, 3, 0, 3, 4, 0]
    prev = None
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        v = M.voice_lead(prev, ch, low=52, high=76)
        prev = v
        bar = 4 + ci
        # 弦乐主体
        a.add_chord('strings', bar * 4, 3.9, v, vel=0.72, spread=0.3, pan=0.0)
        # 圆号加厚中声部
        a.add_chord('horn', bar * 4, 3.9, [v[0], v[2]], vel=0.5, spread=0.1,
                    pan=0.3, attack=0.12)
        # 低音
        a.add('pizz_bass', bar * 4, 1.8, k.degree(deg, 2), vel=0.85, pan=0.0)
        a.add('pizz_bass', bar * 4 + 2, 1.8, k.degree(deg, 2) + 7, vel=0.7, pan=0.0)
        # 定音鼓（跟随根音）
        a.add_perc('timpani', bar * 4, vel=0.75, pitch=k.degree(deg, 2), pan=0.0)
        if ci % 2 == 1:
            a.add_perc('timpani', bar * 4 + 2.5, vel=0.55,
                       pitch=k.degree(deg, 2), pan=0.05)
        # 铜管强音（每小节第一拍）
        a.add_chord('brass_stab', bar * 4, 0.9, [ch[0], ch[2]], vel=0.8,
                    spread=0.06, pan=0.15)

    # 主题旋律（长笛 + 竖笛，歌唱性）
    mel = [
        ('G4', 16, 1.0, 0.85), ('C5', 17, 1.0, 0.9), ('E5', 18, 2.0, 0.95),
        ('D5', 20, 1.0, 0.85), ('E5', 21, 1.0, 0.85), ('D5', 22, 2.0, 0.88),
        ('C5', 24, 1.0, 0.85), ('A4', 25, 1.0, 0.82), ('C5', 26, 2.0, 0.88),
        ('F5', 28, 2.0, 0.95), ('E5', 30, 2.0, 0.9),
        ('G5', 32, 1.0, 0.9),  ('E5', 33, 1.0, 0.85), ('C5', 34, 2.0, 0.9),
        ('A4', 36, 1.0, 0.85), ('F5', 37, 1.0, 0.9),  ('A5', 38, 2.0, 0.95),
        ('G5', 40, 2.0, 0.92), ('B4', 42, 2.0, 0.88),
        ('C6', 44, 4.0, 1.0),
    ]
    for p, s, d, v in mel:
        a.add('flute', s, d, p, vel=v, pan=-0.1, humanize=0.35)

    # 竖琴华彩（上行音阶，胜利的光辉）
    for i in range(12):
        a.add('harp', 40 + i * 0.25, 0.8, k.degree(i, 4), vel=0.5, pan=0.4)

    # ---- C: 终止（完满终止 V -> I）----
    # V 级（G）
    a.add_chord('strings', 48, 3.9, [55, 59, 62, 67], vel=0.8, spread=0.2)
    a.add_chord('brass_stab', 48, 1.2, [55, 62], vel=0.9, spread=0.05)
    a.add_perc('timpani', 48, vel=0.85, pitch='G2')
    a.add_perc('cymbal', 48, vel=0.7, crash=True, pan=0.3)

    # I 级（C，完满终止）
    a.add_chord('strings', 52, 7.5, [48, 55, 60, 64, 67], vel=0.85, spread=0.25,
                pan=0.0, release=1.5)
    a.add_chord('brass_stab', 52, 2.0, [48, 60, 64], vel=1.0, spread=0.08)
    a.add_chord('horn', 52, 7.0, [55, 60, 64], vel=0.6, spread=0.15, attack=0.15)
    a.add_chord('choir', 52, 7.5, [52, 55, 60, 64], vel=0.45, spread=0.1,
                vowel='ah', attack=0.6, release=1.5)
    a.add_perc('timpani', 52, vel=1.0, pitch='C2')
    a.add_perc('cymbal', 52, vel=0.8, crash=True, pan=-0.25)
    a.add_perc('taiko', 52, vel=0.9, pitch='C1')

    # 钟琴收尾（点睛）
    for i, p in enumerate(['C5', 'E5', 'G5', 'C6']):
        a.add('bell', 53 + i * 0.4, 3.0, p, vel=0.55, pan=0.3 - i * 0.15)
    a.add('glockenspiel', 56, 2.0, 'C6', vel=0.5, pan=-0.3)

    # ---- 曲式：A 号角 - B 主题 - C 终止 ----
    # 不循环，所以不需要首尾电平连续（wrap=False）。
    # 关键在 B 段主动收 7dB：终止式的辉煌是"对比"出来的，
    # 如果前面已经给满，最后的完满终止就没有任何冲击力。
    a.sections([
        (0, -6.0),    # A: 号角宣告，先不给满
        (3, -11.0),   # B: 主题进入时主动收，为终止式留出动态空间
        (8, -2.5),    # B 后半：情绪回升
        (12, 0.0),    # C: 完满终止 V-I = 全曲顶点
    ], wrap=False)
    # B 段的伴奏要退让，只留弦乐与旋律 —— 不然"弱奏"只是一句空话
    a.gate('pizz_bass', [(4, 12, 0.50)], default=1.0)
    a.gate('timpani', [(4, 12, 0.45)], default=1.0)
    return a


# ============================================================
# 8. 魔法塔（第 2 章副本）—— A 小调，神秘闪耀
# ============================================================

def compose_magic_tower():
    """
    塔是"水晶与法术"的空间，所以要**亮、薄、有折射感**：
      · 钟琴 + 竖琴 做高频闪烁（魔法的"光"）
      · 长笛 + 木笛 旋律（轻、飘，不要铜管的重量）
      · pad 只做远景（塔的结构），不做厚和声垫 —— 那会把它变成城镇曲
      · 打击乐极轻：只有铃鼓与沙锤，给律动不给冲击
    与 grassland 的区别：grassland 是"阳光下的草原"（厚、暖、外向），
    魔法塔是"室内的水晶"（薄、冷、内省）。
    """
    a = M.Arrangement(bpm=108, sr=SR, bars=16)
    k = M.Key('A', 'minor')
    prog = [0, 5, 2, 6, 0, 5, 3, 4]   # Am F C G | Am F Dm Em
    bpc = 2

    # 远景 pad：塔的空间感
    lay_harmony(a, k, prog, 16, inst='pad', octave=4, low=48, high=72,
                vel=0.34, bars_per_chord=bpc, spread=0.0, pan_base=0.0,
                attack=0.7, release=1.0)

    # 合唱 'ah'：塔的"神圣"底色（比遗迹曲轻得多）
    for ci, deg in enumerate(prog):
        root = k.degree(deg, 4)
        a.add_chord('choir', ci * bpc * 4, bpc * 4 + 0.4, [root, root + 7],
                    vel=0.18, spread=0.0, pan=0.0, vowel='ah',
                    attack=0.9, release=1.1)

    # 竖琴琶音：主要织体（上行往复，闪烁）
    arpeggio(a, k, prog, inst='harp', octave=4, low_oct=4, step=0.5,
             bars_per_chord=bpc, vel=0.44, pan=-0.28, note_dur=0.75, up_down=True)

    # 钟琴：旋律骨干上方的"光点"
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 5)
        for i, p in enumerate(ch + [ch[0] + 12]):
            a.add('glockenspiel', ci * bpc * 4 + i * 0.25 + 1.5, 0.5, p,
                  vel=0.30, pan=0.42, humanize=0.15)

    # 拨弦贝斯（轻，不做驱动 —— 让竖琴/钟琴当主角）
    bass_line(a, k, prog, inst='pizz_bass', octave=2, bars_per_chord=bpc,
              pattern=(0, 2), vel=0.62)

    # 主旋律：长笛（飘）；A' 段木笛跟奏加厚
    mel = [
        ('A4', 0, 1.0, 0.80), ('C5', 1, 1.0, 0.82), ('E5', 2, 2.0, 0.88),
        ('D5', 4, 1.0, 0.78), ('C5', 5, 1.0, 0.76), ('A4', 6, 2.0, 0.74),
        ('G4', 8, 1.0, 0.78), ('E5', 9, 1.0, 0.82), ('A5', 10, 2.0, 0.88),
        ('G5', 12, 1.0, 0.80), ('E5', 13, 1.0, 0.78), ('D5', 14, 2.0, 0.76),
        ('C5', 16, 1.0, 0.80), ('A4', 17, 1.0, 0.78), ('D5', 18, 2.0, 0.84),
        ('C5', 20, 1.0, 0.78), ('E5', 21, 1.0, 0.80), ('A5', 22, 2.0, 0.86),
        ('G5', 24, 1.0, 0.80), ('F5', 25, 1.0, 0.78), ('E5', 26, 2.0, 0.80),
        ('D5', 28, 1.0, 0.76), ('C5', 29, 1.0, 0.74), ('A4', 30, 2.0, 0.72),
    ]
    for p, s, d, v in mel:
        a.add('flute', s, d, p, vel=v, pan=0.10, humanize=0.45)
    for p, s, d, v in mel:
        a.add('recorder', s + 32, d, p, vel=v * 0.80, pan=-0.14, humanize=0.5)

    # 打击乐：极轻
    for bar in range(16):
        b = bar * 4
        if bar % 2 == 0:
            a.add_perc('tambourine', b + 2, vel=0.30, pan=-0.35)
        a.add_perc('shaker', b + 3.5, vel=0.22, pan=0.30)

    return apply_form(a, [
        (0, -5.0), (3, -1.2), (8, -3.8), (12, 0.0), (15, -1.8),
    ], {
        # ★ 竖琴是这首的**织体主体**，不是"事件"：门控成只在 A/A' 段出现会把
        #   intro / 桥段抽空 —— 成品 LRA 冲到 17.16 LU（窗口 10~15），
        #   循环时听成"音乐没了又回来"。改为全曲在场、稀疏段减益退到背景。
        #   但矫枉也会过正：地板抬太高 + 弧线收太浅 → LRA 掉到 9.38（低于下限 10）。
        #   现在这版是两头的折中：竖琴保留全曲在场，地板与弧线各退一步，
        #   对比主要由旋律/色彩声部（长笛、木笛、钟琴、合唱）的进出承担。
        'pad':          ([(0, 3, 0.62), (8, 12, 0.58)], 1.0),
        'pizz_bass':    ([(0, 3, 0.60), (8, 12, 0.56)], 1.0),
        'harp':         ([(0, 3, 0.50), (8, 12, 0.45)], 1.0),
        'glockenspiel': [(4, 8, 1.0), (12, 16, 1.0)],
        'flute':        [(3, 8, 1.0)],
        'recorder':     [(12, 16, 1.0)],
        'choir':        [(4, 12, 1.0)],
        'tambourine':   [(3, 8, 1.0), (12, 16, 1.0)],
        'shaker':       [(3, 8, 1.0), (12, 16, 1.0)],
    })


# ============================================================
# 9. 商人镇（第 3 章副本）—— D 多利亚，热闹集市
# ============================================================

def compose_merchant_town():
    """
    town 与 grassland 都已经是"欢快"了，这首必须拉开定位：
      · 用**多利亚**而非大调：小三度 + 大六度，是"异域集市/商队"的经典音响
      · 鲁特琴密集 8 分音符分解和弦 = 集市的"人流"引擎
      · 手鼓走切分（叫卖/交易的错落），不用 grassland 那种均匀四拍
      · 旋律用木笛，但节奏更碎（短句 + 停顿，像讨价还价）
    """
    a = M.Arrangement(bpm=120, sr=SR, bars=16)
    k = M.Key('D', 'dorian')
    prog = [0, 6, 2, 6, 0, 6, 3, 4]   # Dm C F C | Dm C G Am
    bpc = 2

    # 弦乐拨奏：和声骨架（轻快，不做长音）
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        v = M.voice_lead(None, ch, low=55, high=76)
        for beat in (0, 1.5, 2.5):
            a.add_chord('strings_pizz', ci * bpc * 4 + beat, 0.5, v,
                        vel=0.44 if beat == 0 else 0.30, spread=0.35, pan=-0.12)

    # 鲁特琴：人流/交易引擎
    arpeggio(a, k, prog, inst='lute', octave=4, low_oct=3, step=0.5,
             bars_per_chord=bpc, vel=0.52, pan=0.30, note_dur=0.38, up_down=True)

    # 拨弦贝斯（切分跳跃）
    bass_line(a, k, prog, inst='pizz_bass', octave=2, bars_per_chord=bpc,
              pattern=(0, 2, 0, 2), vel=0.78)

    # 主旋律：木笛，短句 + 停顿
    mel = [
        ('D5', 0, 0.5, 0.86), ('F5', 0.5, 0.5, 0.82), ('A5', 1, 1.0, 0.88),
        ('G5', 2, 0.5, 0.80), ('F5', 2.5, 0.5, 0.78), ('E5', 3, 1.0, 0.80),
        ('D5', 4, 0.5, 0.84), ('C5', 4.5, 0.5, 0.80), ('D5', 5, 1.0, 0.82),
        ('A4', 6, 2.0, 0.76),
        ('F5', 8, 0.5, 0.86), ('A5', 8.5, 0.5, 0.88), ('G5', 9, 1.0, 0.84),
        ('F5', 10, 0.5, 0.80), ('E5', 10.5, 0.5, 0.78), ('D5', 11, 1.0, 0.80),
        ('C5', 12, 0.5, 0.82), ('D5', 12.5, 0.5, 0.84), ('F5', 13, 1.0, 0.86),
        ('A5', 14, 2.0, 0.88),
        ('G5', 16, 0.5, 0.84), ('A5', 16.5, 0.5, 0.86), ('C6', 17, 1.0, 0.90),
        ('A5', 18, 0.5, 0.82), ('G5', 18.5, 0.5, 0.80), ('F5', 19, 1.0, 0.82),
        ('E5', 20, 0.5, 0.80), ('D5', 20.5, 0.5, 0.78), ('E5', 21, 1.0, 0.80),
        ('D5', 22, 2.0, 0.78),
        ('A4', 24, 0.5, 0.80), ('C5', 24.5, 0.5, 0.82), ('F5', 25, 1.0, 0.86),
        ('E5', 26, 0.5, 0.80), ('D5', 26.5, 0.5, 0.78), ('C5', 27, 1.0, 0.80),
        ('D5', 28, 0.5, 0.82), ('F5', 28.5, 0.5, 0.84), ('A5', 29, 1.0, 0.88),
        ('G5', 30, 2.0, 0.82),
    ]
    for p, s, d, v in mel:
        a.add('recorder', s, d, p, vel=v, pan=-0.14, humanize=0.6, breath=0.7)
    for p, s, d, v in mel:
        a.add('flute', s + 32, d, p, vel=v * 0.78, pan=0.16, humanize=0.6)

    # 打击乐：手鼓切分 + 铃鼓 + 沙锤
    for bar in range(16):
        b = bar * 4
        a.add_perc('hand_drum', b, vel=0.72, pitch='D2', pan=0.18)
        a.add_perc('hand_drum', b + 1.5, vel=0.44, pitch='A2', pan=-0.12)
        a.add_perc('hand_drum', b + 2.5, vel=0.58, pitch='D2', pan=0.12)
        a.add_perc('tambourine', b + 1, vel=0.38, pan=-0.34)
        a.add_perc('tambourine', b + 3, vel=0.46, pan=0.30)
        if bar % 2 == 1:
            a.add_perc('shaker', b + 3.5, vel=0.28, pan=0.24)

    return apply_form(a, [
        (0, -4.0), (3, -1.0), (8, -3.2), (12, 0.0), (15, -1.5),
    ], {
        # ★ 同 magic_tower / void_mist 的教训：拨弦织体、贝斯、鲁特琴都是
        #   **地基声部**，不是"事件"。第一版把它们压到 0.30~0.45 且弧线开到 5dB，
        #   结果安静段短时响度 L10 掉到 -31.53 LUFS —— 低于 -30 门限，
        #   手机外放上整段被环境噪声埋掉，循环时听成"音乐没了又回来"；
        #   同时 LRA 顶到 14.93（窗口上限 15），是同一个病的两个症状。
        #   抬高地板、收浅弧线后，对比仍由旋律（木笛→长笛）与打击乐的进出承担。
        'strings_pizz': ([(0, 3, 0.55), (8, 12, 0.50)], 1.0),
        'pizz_bass':    ([(0, 3, 0.62), (8, 12, 0.58)], 1.0),
        'lute':         ([(0, 3, 0.55), (8, 12, 0.50)], 1.0),
        'recorder':     [(3, 8, 1.0)],
        'flute':        [(12, 16, 1.0)],
        'hand_drum':    [(3, 8, 1.0), (12, 16, 1.0)],
        'tambourine':   [(3, 8, 1.0), (12, 16, 1.0)],
        'shaker':       [(12, 16, 1.0)],
    })


# ============================================================
# 10. 远古遗迹（第 4 章副本）—— E 弗里几亚，庄严古老
# ============================================================

def compose_ancient_ruins():
    """
    弗里几亚的关键音响是 **bII**（这里的 F）：主音上方小二度，
    是"古老/异教/东方"最直接的色彩，从文艺复兴到现代游戏配乐都用它。
    配器：低弦乐长音（石殿的重量）+ 圆号远调（空旷）+ 定音鼓（仪式）
    + 合唱 'oo'（祭祀）。打击乐刻意稀疏 —— 遗迹是安静的，不是战场。
    """
    a = M.Arrangement(bpm=88, sr=SR, bars=16)
    k = M.Key('E', 'phrygian')
    prog = [0, 1, 0, 5, 0, 1, 3, 0]   # Em F Em C | Em F Am Em
    bpc = 2

    # 低弦乐长音：石殿的重量
    lay_harmony(a, k, prog, 16, inst='strings', octave=4, low=48, high=72,
                vel=0.42, bars_per_chord=bpc, spread=0.30, pan_base=0.0,
                attack=0.5, release=0.9)

    # 圆号：远处的号角（空旷回响）
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 3)
        a.add_chord('horn', ci * bpc * 4, bpc * 4 + 0.3, [ch[0], ch[2]],
                    vel=0.34, spread=0.14, pan=0.30, attack=0.25, release=0.6)

    # 合唱 'oo'：祭祀感
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        a.add_chord('choir', ci * bpc * 4, bpc * 4 + 0.5, ch,
                    vel=0.26, spread=0.08, pan=0.0, vowel='oo',
                    attack=0.7, release=1.0)

    # 低音长音
    bass_line(a, k, prog, inst='bass', octave=2, bars_per_chord=bpc,
              pattern=(0, 0), vel=0.62)

    # 竖琴：极稀疏的装饰（石缝里的光）
    for ci in (1, 3, 5, 7):
        ch = M.chord_midi(k, prog[ci], 'triad', 5)
        for i, p in enumerate(ch):
            a.add('harp', ci * bpc * 4 + 2 + i * 0.25, 0.8, p, vel=0.26, pan=0.40)

    # 主旋律：木笛，级进为主（古老朴素，不要跳进的活泼感）
    mel = [
        ('E4', 0, 1.5, 0.72), ('F4', 1.5, 0.5, 0.68), ('E4', 2, 2.0, 0.70),
        ('C4', 4, 1.5, 0.68), ('D4', 5.5, 0.5, 0.66), ('E4', 6, 2.0, 0.72),
        ('G4', 8, 1.5, 0.74), ('F4', 9.5, 0.5, 0.70), ('E4', 10, 2.0, 0.72),
        ('C4', 12, 2.0, 0.68), ('B3', 14, 2.0, 0.66),
        ('E4', 16, 1.5, 0.74), ('G4', 17.5, 0.5, 0.72), ('A4', 18, 2.0, 0.78),
        ('G4', 20, 1.5, 0.72), ('F4', 21.5, 0.5, 0.70), ('E4', 22, 2.0, 0.72),
        ('C4', 24, 1.5, 0.68), ('E4', 25.5, 0.5, 0.70), ('G4', 26, 2.0, 0.74),
        ('F4', 28, 2.0, 0.70), ('E4', 30, 2.0, 0.66),
    ]
    for p, s, d, v in mel:
        a.add('recorder', s, d, p, vel=v, pan=0.04, humanize=0.5, breath=0.85)
    # A' 段：圆号叠旋律（遗迹的回声）
    for p, s, d, v in mel:
        if d >= 1.5:
            a.add('horn', s + 32, d, p, vel=v * 0.34, pan=-0.22, attack=0.2,
                  humanize=0.3)

    # 定音鼓：仪式性的稀疏重击（跟随和声根音）
    for ci, deg in enumerate(prog):
        root = k.degree(deg, 2)
        a.add_perc('timpani', ci * bpc * 4, vel=0.52, pitch=root, pan=0.0)
        if ci % 2 == 1:
            a.add_perc('timpani', ci * bpc * 4 + 4, vel=0.34, pitch=root)

    return apply_form(a, [
        (0, -6.5), (3, -1.5), (8, -5.0), (12, 0.0), (15, -2.5),
    ], {
        'strings':  ([(0, 3, 0.45), (8, 12, 0.40)], 1.0),
        'bass':     ([(0, 3, 0.40), (8, 12, 0.38)], 1.0),
        'horn':     ([(0, 3, 0.45), (8, 12, 0.50)], 1.0),
        'choir':    [(4, 8, 1.0), (12, 16, 1.0)],
        'recorder': [(3, 8, 1.0), (12, 16, 1.0)],
        'harp':     [(4, 8, 1.0), (12, 16, 1.0)],
        'timpani':  [(3, 8, 1.0), (12, 16, 1.0)],
    })


# ============================================================
# 11. 虚空迷雾（终章副本）—— D 小调，阴森不安
# ============================================================

def compose_void_mist():
    """
    这是 BOSS 战之前的"迷雾区"，情绪要**压抑但不释放**：
      · 弦乐震音 + 半音邻音（不安，但力度留到 BOSS 曲再爆发）
      · 极低 pad 持续音（雾的"底"）
      · 稀疏的钟 —— 远处、不知来源，比密集打击乐更瘆人
      · 合唱 'oo' 低沉长音；旋律半音下行（迷途感）
    刻意**不用**太鼓/军鼓：那是 The King 的武器。这里留白，
    否则玩家打到 BOSS 时已经听觉疲劳，BOSS 曲的冲击就没了。
    """
    a = M.Arrangement(bpm=82, sr=SR, bars=16)
    k = M.Key('D', 'minor')
    prog = [0, 5, 3, 4, 0, 5, 2, 4]   # Dm Bb Gm A | Dm Bb F A
    bpc = 2

    # 极低 pad：雾的"底"（长音，几乎不动）
    lay_harmony(a, k, prog, 16, inst='pad', octave=3, low=43, high=60,
                vel=0.40, bars_per_chord=bpc, spread=0.0, pan_base=0.0,
                attack=1.2, release=1.4)

    # 弦乐震音 + 半音邻音（不安）
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        v = M.voice_lead(None, ch, low=55, high=72)
        for i in range(16):          # 2 小节 × 16 个 8 分音符
            p = v[i % 3] + (1 if i % 4 == 3 else 0)   # 每 4 个音加一个半音邻音
            a.add('strings_tremolo', ci * bpc * 4 + i * 0.5, 0.85, p,
                  vel=0.34 if i % 2 == 0 else 0.26,
                  pan=-0.28 + (i % 3) * 0.26, rate=7.5, depth=0.45)

    # 合唱 'oo'：虚空中的低语
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        a.add_chord('choir', ci * bpc * 4, bpc * 4 + 0.6, [ch[0], ch[2]],
                    vel=0.22, spread=0.06, pan=0.0, vowel='oo',
                    attack=0.9, release=1.3)

    # 低音
    bass_line(a, k, prog, inst='bass', octave=2, bars_per_chord=bpc,
              pattern=(0, 0), vel=0.60)

    # 钟：稀疏、远处、无规律（迷雾里的方位感丧失）
    for ci in (1, 4, 6, 7):
        root = k.degree(prog[ci], 5)
        a.add('bell', ci * bpc * 4 + 1.5, 2.6, root, vel=0.24,
              pan=(0.44 if ci % 2 == 0 else -0.40), humanize=0.1)

    # 主旋律：木笛低音区，半音下行
    mel = [
        ('D4', 0, 2.0, 0.62),  ('C4', 2, 2.0, 0.60),
        ('Bb3', 4, 2.0, 0.62), ('A3', 6, 2.0, 0.58),
        ('D4', 8, 1.5, 0.62),  ('C4', 9.5, 0.5, 0.58), ('Bb3', 10, 2.0, 0.60),
        ('G3', 12, 2.0, 0.58), ('A3', 14, 2.0, 0.56),
        ('D4', 16, 2.0, 0.64), ('F4', 18, 2.0, 0.62),
        ('E4', 20, 1.5, 0.60), ('C4', 21.5, 0.5, 0.58), ('D4', 22, 2.0, 0.60),
        ('A3', 24, 2.0, 0.58), ('Bb3', 26, 2.0, 0.60),
        ('A3', 28, 2.0, 0.58), ('D4', 30, 2.0, 0.56),
    ]
    for p, s, d, v in mel:
        a.add('recorder', s, d, p, vel=v, pan=0.06, humanize=0.55, breath=0.9)
    # A' 段：长笛叠高八度（雾里透出的一线光）
    for p, s, d, v in mel:
        a.add('flute', s + 32, d, p, vel=v * 0.30, pan=-0.18, humanize=0.5)

    return apply_form(a, [
        (0, -5.0), (3, -1.2), (8, -4.0), (12, 0.0), (15, -2.0),
    ], {
        # 同 magic_tower：pad / 震音 / 贝斯是"雾"本身，不能断。
        # 第一版把它们压到 0.40~0.55 且弧线开到 7dB，成品 LRA 15.13 越界
        # （窗口 10~15）。抬高地板、收浅弧线，对比交给合唱/钟/木笛的进出。
        'pad':             ([(0, 3, 0.70), (8, 12, 0.66)], 1.0),
        'strings_tremolo': ([(0, 3, 0.62), (8, 12, 0.58)], 1.0),
        'bass':            ([(0, 3, 0.60), (8, 12, 0.56)], 1.0),
        'choir':           [(4, 12, 1.0)],
        'bell':            [(2, 16, 1.0)],
        'recorder':        [(3, 8, 1.0), (12, 16, 1.0)],
        'flute':           [(12, 16, 1.0)],
    })


# ============================================================
# 12. BOSS 曲 —— D 小调，PvZ「The King」风格（用户点名）
# ============================================================

def compose_the_king():
    """
    用户点名要这首（PvZ Zomboss 主题）。它的辨识度来自三样东西，缺一不可：
      1. **拨奏 ostinato**：8 分音符持续拨弦，贯穿全曲。这是 The King 的心跳，
         也是它与普通"管弦 BOSS 曲"最大的区别 —— 它不是长音铺底，是**律动**在推。
      2. **铜管号角动机**：附点节奏 + 四度上行，英雄气与威胁并存。
      3. **D 小调 + 半音下行的低音**（D - C - Bb - A）：厄运降临的经典走向。

    与 bgm_boss 拉开定位：bgm_boss 是"半音下行 + 合唱"的教堂式压迫（静态），
    这首是"拨奏驱动 + 铜管号角"的行进式压迫（推进）。

    ★ 注意：管弦音色库里没有钢琴，原曲的"阴森钢琴独奏引子"用 music_box
      替代 —— 它的音色同样是"敲击后快速衰减的短音"，能给出那股发条般的阴森感。
    """
    a = M.Arrangement(bpm=132, sr=SR, bars=16)
    k = M.Key('D', 'minor')
    prog = [0, 5, 2, 6, 0, 5, 3, 4]   # Dm Bb F C | Dm Bb Gm A
    bpc = 2

    # === 1. 拨奏 ostinato：全曲的心脏（8 分音符，跟随和声）===
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        v = M.voice_lead(None, ch, low=55, high=74)
        for i in range(16):          # 2 小节 × 16 个 8 分音符
            p = v[i % 3]
            a.add('strings_pizz', ci * bpc * 4 + i * 0.5, 0.38, p,
                  vel=(0.56 if i % 2 == 0 else 0.40),
                  pan=-0.30 + (i % 4) * 0.20, humanize=0.35)

    # === 2. 低音：半音下行 D - C - Bb - A（厄运降临）===
    for ci, deg in enumerate(prog):
        root = k.degree(deg, 2)
        a.add('bass', ci * bpc * 4, 1.9, root, vel=0.70, pan=0.0)
        a.add('bass', ci * bpc * 4 + 2, 1.9, root + 7, vel=0.56, pan=0.0)

    # === 3. 低音铜管长音（号角的地基）===
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 3)
        a.add_chord('horn', ci * bpc * 4, bpc * 4 + 0.2, [ch[0], ch[2]],
                    vel=0.40, spread=0.12, pan=0.28, attack=0.18, release=0.5)

    # === 4. 铜管号角动机（The King 的"脸"）===
    # 附点节奏 + 四度上行，重复 = 记忆点。音区抬到 D5~A5（小号最有穿透力的一段），
    # 避开低音鼓与贝斯占据的 100Hz 以下区域 —— 手机外放才听得见。
    motif = [('D5', 0, 0.5, 0.95), ('F5', 0.5, 0.25, 0.85), ('A5', 0.75, 1.25, 1.0),
             ('G5', 2, 0.5, 0.88), ('F5', 2.5, 0.5, 0.86), ('E5', 3, 1.0, 0.90)]
    for rep in range(16):            # 每小节一次，共 16 次
        off = rep * 4
        for p, s, d, v in motif:
            a.add('brass_stab', off + s, d, p,
                  vel=v * (1.0 if rep % 2 == 0 else 0.90),
                  pan=(-0.18 if rep % 2 == 0 else 0.18), humanize=0.18)
            # 后半段叠高八度圆号，把情绪推上去
            if rep >= 8:
                a.add('horn', off + s, d + 0.5, p, vel=v * 0.36,
                      pan=(0.20 if rep % 2 == 0 else -0.20), attack=0.1, humanize=0.2)

    # === 5. music_box：阴森的短音动机（替代原曲的钢琴引子）===
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 5)
        a.add('music_box', ci * bpc * 4, 0.6, ch[0], vel=0.30, pan=0.38, humanize=0.2)
        a.add('music_box', ci * bpc * 4 + 3, 0.6, ch[1], vel=0.24, pan=-0.34, humanize=0.2)
        a.add('music_box', ci * bpc * 4 + 6, 0.6, ch[2], vel=0.22, pan=0.30, humanize=0.2)

    # === 6. 合唱 'oo'：BOSS 的仪式感 ===
    for ci, deg in enumerate(prog):
        ch = M.chord_midi(k, deg, 'triad', 4)
        a.add_chord('choir', ci * bpc * 4, bpc * 4 + 0.5, [ch[0], ch[2]],
                    vel=0.30, spread=0.08, pan=0.0, vowel='oo',
                    attack=0.6, release=0.9)

    # === 7. 打击乐：行进鼓（The King 的驱动）===
    # 太鼓音高用 root-5 而不是 root-12：真实太鼓基频 60~90Hz，
    # 手机微型喇叭 100Hz 以下以约 12dB/oct 衰减，root-12 那段能量基本白给。
    for ci, deg in enumerate(prog):
        b = ci * bpc * 4      # 该和弦的起始拍
        bar = ci * bpc        # 该和弦的起始小节（bpc=2 → 每个和弦 2 小节）
        root = k.degree(deg, 2)
        a.add_perc('taiko', b, vel=0.82, pitch=root - 5, pan=0.0)          # 正拍
        a.add_perc('taiko', b + 2, vel=0.58, pitch=root - 5, pan=0.10)
        a.add_perc('taiko', b + 5.5, vel=0.50, pitch=root - 5, pan=-0.10)  # 切分
        a.add_perc('snare', b + 4, vel=0.72, pan=0.22)
        a.add_perc('snare', b + 7, vel=0.58, pan=-0.18)
        # 沙锤当 hi-hat（8 分音符，保持律动）
        for i in range(16):
            a.add_perc('shaker', b + i * 0.5 + 0.25, vel=0.24, pan=0.30)
        # ★ 镲只打在 A 段与 A' 段的**进入点**（bar 2 / bar 12）。
        #   曾写成 `ci % 4 == 0` —— 那落点是 bar 0 与 bar 8：bar 0 在引子里
        #   （引子不该有 crash），bar 8 又是桥段起点、恰好落在门控区间外。
        #   而 cymbal 的门控区间是 (2,8)/(12,16)，于是两记镲**全部被静音**，
        #   段落进入的"落点"整个塌掉（回归 [1] 抓到：门控把整个声部静音了）。
        #   改成按小节号显式指定，与门控区间对齐。
        if bar in (2, 12):
            a.add_perc('cymbal', b, vel=0.80, pan=0.32, crash=True)

    # === 曲式：16 小节 引子 - A - 桥 - A' ===
    # intro(0-2)：只有拨奏 + 低音铜管 + music_box（BOSS 从雾里走出来，不给重击）
    # A(2-8)    ：铜管号角动机 + 全套行进鼓
    # 桥(8-12)  ：撤掉鼓与铜管，只留拨奏与合唱 —— 死寂，为后段留动态空间
    # A'(12-16) ：号角 + 圆号叠八度 + 全套鼓，全曲顶点
    return apply_form(a, [
        (0, -7.5), (2, -1.0), (8, -6.5), (12, 0.0), (15, -1.5),
    ], {
        # 拨奏 ostinato 与低音是地基，全曲在场、稀疏段减益（断掉就不是 The King 了）
        'strings_pizz': ([(0, 2, 0.50), (8, 12, 0.45)], 1.0),
        'bass':         ([(0, 2, 0.45), (8, 12, 0.42)], 1.0),
        'horn':         ([(0, 2, 0.50), (8, 12, 0.45)], 1.0),
        'brass_stab':   [(2, 8, 1.0), (12, 16, 1.0)],
        'taiko':        [(2, 8, 1.0), (12, 16, 1.0)],
        'snare':        [(2, 8, 1.0), (12, 16, 1.0)],
        'shaker':       [(2, 8, 1.0), (12, 16, 1.0)],
        'cymbal':       [(2, 8, 1.0), (12, 16, 1.0)],
        # music_box 只属于引子与桥段（阴森的留白），进主段就让位给铜管
        'music_box':    [(0, 2, 1.0), (8, 12, 1.0)],
        # 合唱在桥段顶上来（死寂里只剩人声最压迫），A' 段退让给铜管
        'choir':        [(4, 12, 1.0)],
    })


# ============================================================
# 曲目注册表
# ============================================================

TRACKS = [
    ('bgm_menu',      compose_menu,      'menu',    True),
    ('bgm_town',      compose_town,      'town',    True),
    ('bgm_explore',   compose_explore,   'field',   True),
    ('bgm_grassland', compose_grassland, 'bright',  True),
    ('bgm_battle',    compose_battle,    'battle',  True),
    ('bgm_boss',      compose_boss,      'boss',    True),
    ('bgm_victory',   compose_victory,   'victory', False),
    # —— 副本专属环境曲（每个副本一首，不再互相复用） ——
    # 顺序即曲目表的语义顺序：菜单 → 城镇 → 野外 → 副本 1~5 → 战斗 → BOSS → 胜利
    ('bgm_magic_tower',   compose_magic_tower,   'magic_tower',   True),
    ('bgm_merchant_town', compose_merchant_town, 'merchant_town', True),
    ('bgm_ancient_ruins', compose_ancient_ruins, 'ancient_ruins', True),
    ('bgm_void_mist',     compose_void_mist,     'void_mist',     True),
    # —— BOSS 专属曲（PvZ "The King" 风格，用户点名） ——
    ('bgm_the_king',      compose_the_king,      'the_king',      True),
]


# ============================================================
# 导出
# ============================================================

def save_wav(path, y, sr=SR):
    """32-bit float WAV（中间母带格式，精度高于 24bit int 且便于分析）"""
    from scipy.io import wavfile
    y = np.clip(np.asarray(y, dtype=np.float64), -1.0, 1.0)
    wavfile.write(path, sr, y.astype(np.float32))


def to_mp3(wav_path, mp3_path):
    """投产 BGM 编码档位：VBR -q:a 6（约 115kbps）联合立体声。

    ★ 编码档位的唯一事实源是 tools/audio/encode_mp3.js，改码率请两边同步改。
      原先用 320k CBR，7 首就吃掉 8.8MB，把整包顶到 30.9MB 爆掉微信 20MB 硬上限；
      手机端 115kbps VBR 与 320kbps 听感无可辨差异（已用 verify_encode_quality.py 客观核验）。
    """
    os.system(f'ffmpeg -y -loglevel error -i "{wav_path}" -codec:a libmp3lame '
              f'-q:a 6 -joint_stereo 1 -ar 44100 -map_metadata -1 -write_xing 1 "{mp3_path}"')


def loop_tail_s(preset):
    """
    循环曲需要多渲染多少秒「越过循环点的余音」。

    ★ 必须 ≥ 该曲混响预设的 decay_s：余音里有一半是混响尾巴，
      尾巴没衰减完就被缓冲截掉，折回去的是个被硬切的残尾，照样能听出来。
      boss 的 decay_s=3.2s 最长，原来的固定 2.2s 对它是明显不够的。
      （+0.3s 是给音符自身释放时间留的余量，decay_s 只管混响。）
    """
    return max(2.2, REVERB[preset]['decay_s'] * 1.15 + 0.3)


def render_track(a, space_preset, loop):
    """
    把一首曲子渲染到「可以进母带」的状态：干声 → 加空间 → 循环折回。

    ★ 生成端、回归脚本、探针脚本都必须走这里。
      曾经三处各写一句 `a.render(loop=loop, tail_s=2.2 if loop else 0.0)`
      （build_bgm / verify_bgm_form / tools_probe_compression），
      而折叠该在混响前还是混响后、tail 该多长，都是只有这里知道的细节 ——
      任何一处抄漏，它量到的就不是投产的那首曲子。
      路径与流程只要有两份，就一定会漂移。

    返回 (y, dry, loop_n)
      y      : 可进母带的立体声素材
      dry    : 加混响前的乐句本体（量"编曲层动态"用，不含余音也不含混响）
      loop_n : 乐句长度（样本）。非循环曲为 0。
    """
    tail_s = loop_tail_s(space_preset) if loop else 0.0
    loop_n = int(a.loop_len() * SR) if loop else 0
    y = a.render(loop=loop, tail_s=tail_s)
    dry = y[:loop_n] if loop else y
    y = apply_space(y, space_preset)
    if loop:
        # 混响加完再折回：此刻越过循环点的是「音符释放 + 混响尾巴」的完整余音。
        y = D.fold_loop_tail(y, loop_n)
        assert len(y) == loop_n, f'fold_loop_tail 输出 {len(y)} ≠ 乐句 {loop_n}'
    return y, dry, loop_n


def main():
    results = []
    for name, fn, space_preset, loop in TRACKS:
        t0 = time.time()
        a = fn()
        y, dry, loop_n = render_track(a, space_preset, loop)
        lra_dry = D.lra(dry)            # 套曲式后的"编曲层"动态，母带前
        st = {}
        # loop=True 必须传：让母带链工作在周期稳态上（见 M.master 的 ★ 说明）。
        # 否则链路各环节的启动瞬态会在循环点造出一个本不该有的阶跃 ——
        # bgm_explore 母带前 -18.7dB、母带后 +4.7dB，就是这么来的。
        y = M.master(y, sr=SR, ceiling_db=CEILING_DBTP,
                     **MASTER[space_preset], loop=loop, stats=st)

        wav = os.path.join(OUT_WAV, f'{name}.wav')
        mp3 = os.path.join(OUT_MP3, f'{name}.mp3')
        save_wav(wav, y)
        to_mp3(wav, mp3)

        dur = len(y) / SR
        st.update(name=name, dur=dur, lra_dry=lra_dry,
                  centroid=D.spectral_centroid(y), clip=D.clip_ratio(y),
                  corr=float(np.corrcoef(y[:, 0], y[:, 1])[0, 1]),
                  notes=len(a.notes), t=time.time() - t0)
        results.append(st)
        print(f'  ✓ {name:14s} {dur:6.1f}s  LUFS={st["lufs"]:6.2f} '
              f'(偏差{st["lufs_miss"]:+.2f})  LRA={st["lra"]:5.2f}LU  '
              f'压缩 均{st["gr_rms_db"]:+5.2f}/峰{st["gr_peak_db"]:+5.2f}dB  '
              f'TP={st["tp"]:6.2f}dBTP  归一{st["norm_passes"]}轮')

    print('\n汇总:')
    for r in results:
        print(f"  {r['name']:14s} 时长={r['dur']:5.1f}s 音符={r['notes']:4d} "
              f"LUFS={r['lufs']:6.2f} LRA={r['lra']:5.2f}LU "
              f"(母带前 {r['lra_dry']:5.2f}) crest={r['crest']:5.1f}dB "
              f"质心={r['centroid']:5.0f}Hz 相关={r['corr']:.3f} "
              f"削波={r['clip']:.5f}")
    return results


if __name__ == '__main__':
    print('生成 BGM...')
    main()
