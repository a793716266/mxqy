#!/usr/bin/env python3
"""Town Village BGM - 温馨小镇风格
风格：轻快、愉悦、阳光、适合作为小镇/村庄场景的背景音乐
"""
import numpy as np
from scipy.io import wavfile
import subprocess, os

SR = 22050
BPM = 100.0  # 中等稍快，明亮愉悦
BEAT = 60.0 / BPM
BAR = BEAT * 4
S8 = BEAT / 2  # 8分音符

# ===== 工具函数 =====
def sine(freq, dur, amp=1.0):
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    return amp * np.sin(2 * np.pi * freq * t)

def saw(freq, dur, amp=1.0):
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    return amp * (2.0 * (t * freq % 1.0) - 1.0)

def noise(dur, amp=1.0):
    return np.random.randn(int(SR * dur)) * amp

def lpf(sig, cutoff=3000, fs=SR):
    """简单的1极低通"""
    rc = 1.0 / (2 * np.pi * cutoff)
    dt = 1.0 / fs
    alpha = dt / (rc + dt)
    out = np.zeros(len(sig))
    out[0] = sig[0]
    for i in range(1, len(sig)):
        out[i] = out[i-1] + alpha * (sig[i] - out[i-1])
    return out

nn = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
def N(name):
    name = name.replace('b', '#')
    oct = int(name[-1])
    p = name[:-1]
    return 261.63 * (2 ** ((nn.index(p) + (oct - 4) * 12) / 12.0))

# ===== 合成器 =====
def bell(freq, dur, vol=0.3):
    """木琴/钟琴音色 - 清脆悦耳"""
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # 基频 + 泛音
    sig = sine(freq, dur, 1.0) * 1.0
    sig += sine(freq * 2, dur, 0.5) * 0.6
    sig += sine(freq * 3, dur, 0.3) * 0.3
    sig += sine(freq * 4, dur, 0.15) * 0.15
    sig += sine(freq * 5, dur, 0.08) * 0.08
    # 快速起，衰减包络
    a = int(SR * 0.003)
    r = int(SR * dur * 0.4)
    decay = np.exp(-t * (6 + freq / 300))
    decay[:a] = t[:a] / a
    decay = np.clip(decay, 0, 1)
    return vol * sig * decay

def piano_light(freq, dur, vol=0.25):
    """轻柔钢琴"""
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    sig = sine(freq, dur, 1.0) * 0.6
    sig += sine(freq * 2, dur, 1.0) * 0.3
    sig += sine(freq * 3, dur, 1.0) * 0.15
    sig += sine(freq * 4, dur, 1.0) * 0.08
    # 柔和起，平稳衰减
    a = int(SR * 0.01)
    d = int(SR * 0.08)
    r = int(SR * 0.2)
    s_len = max(0, int(SR * dur) - a - d - r)
    env = np.concatenate([
        np.linspace(0, 1, a),
        np.linspace(1, 0.6, d),
        np.ones(s_len) * 0.6,
        np.linspace(0.6, 0, r)
    ])
    env = np.pad(env, (0, max(0, int(SR * dur) - len(env))))[:int(SR * dur)]
    return vol * sig * env

def guitar_strum(freq, dur, vol=0.2):
    """吉他扫弦 - 和煦温暖"""
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    sig = sine(freq, dur, 1.0) * 0.5
    sig += sine(freq * 2, dur, 1.0) * 0.25
    sig += saw(freq, dur, 1.0) * 0.15  # 少量锯齿增加温暖感
    # 快速扫弦包络
    a = int(SR * 0.005)
    r = int(SR * 0.15)
    env = np.concatenate([
        np.linspace(0, 1, a),
        np.linspace(1, 0.5, int(SR * dur * 0.3)),
        np.linspace(0.5, 0.4, int(SR * dur * 0.3)),
        np.linspace(0.4, 0, r)
    ])
    env = np.pad(env, (0, max(0, int(SR * dur) - len(env))))[:int(SR * dur)]
    return lpf(vol * sig * env, cutoff=2500)

def strings_pad(freq, dur, vol=0.12):
    """弦乐垫声 - 悠扬绵长"""
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    vib = 1.0 + 0.003 * np.sin(2 * np.pi * 5 * t)  # 轻柔颤音
    sig = sine(freq * vib, dur, 1.0) * 0.5
    sig += sine(freq * 2 * vib, dur, 1.0) * 0.25
    sig += sine(freq * 3 * vib, dur, 1.0) * 0.12
    sig += sine(freq * 4 * vib, dur, 1.0) * 0.06
    # 长起音，持续垫声
    a = int(SR * 0.2)
    d = int(SR * 0.3)
    r = int(SR * 0.4)
    s_len = max(0, int(SR * dur) - a - d - r)
    env = np.concatenate([
        np.linspace(0, 1, a),
        np.linspace(1, 0.7, d),
        np.ones(s_len) * 0.7,
        np.linspace(0.7, 0, r)
    ])
    env = np.pad(env, (0, max(0, int(SR * dur) - len(env))))[:int(SR * dur)]
    return vol * sig * env

def flute(freq, dur, vol=0.15):
    """长笛/吹奏 - 悠扬婉转"""
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    vib = 1.0 + 0.008 * np.sin(2 * np.pi * 6 * t)
    sig = sine(freq * vib, dur, 1.0) * 0.6
    sig += sine(freq * 2 * vib, dur, 1.0) * 0.2
    sig += sine(freq * 3 * vib, dur, 1.0) * 0.08
    # 圆润包络
    a = int(SR * 0.05)
    d = int(SR * 0.1)
    r = int(SR * 0.25)
    s_len = max(0, int(SR * dur) - a - d - r)
    env = np.concatenate([
        np.linspace(0, 1, a),
        np.linspace(1, 0.8, d),
        np.ones(s_len) * 0.8,
        np.linspace(0.8, 0, r)
    ])
    env = np.pad(env, (0, max(0, int(SR * dur) - len(env))))[:int(SR * dur)]
    return vol * sig * env

def soft_kick(vol=0.3):
    """轻柔底鼓"""
    n = int(SR * 0.15)
    t = np.linspace(0, 0.15, n, endpoint=False)
    fe = 80 * np.exp(-t * 20) + 50
    return vol * sine(fe, 0.15, 1.0) * np.exp(-t * 15)

def soft_snare(vol=0.2):
    """轻柔军鼓"""
    n = int(SR * 0.12)
    t = np.linspace(0, 0.12, n, endpoint=False)
    tone = sine(180, 0.12, 1.0) * np.exp(-t * 20)
    raw_n = noise(0.12, 0.3) * np.exp(-t * 25)
    filtered = lpf(raw_n, cutoff=4000)
    return vol * (tone + filtered)

def shaker(vol=0.1):
    """沙锤/拍手"""
    n = int(SR * 0.06)
    t = np.linspace(0, 0.06, n, endpoint=False)
    raw = noise(0.06, 1.0) * np.exp(-t * 40)
    filtered = lpf(raw, cutoff=6000)
    mag = np.max(np.abs(filtered)) + 1e-9
    return vol * filtered / mag

def triangle_bell(freq, dur, vol=0.15):
    """三角铁 - 清脆点缀"""
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    sig = sine(freq, dur, 1.0) * 1.0
    sig += sine(freq * 3, dur, 1.0) * 0.4
    sig += sine(freq * 5, dur, 1.0) * 0.2
    sig += sine(freq * 7, dur, 1.0) * 0.1
    # 金属质感衰减
    decay = np.exp(-t * 15)
    decay[:int(SR * 0.002)] = t[:int(SR * 0.002)] / (SR * 0.002)
    return vol * sig * decay

def save_mp3(sig, path):
    sig = np.clip(sig, -1.0, 1.0)
    wav = path.replace('.mp3', '.wav')
    wavfile.write(wav, SR, (sig * 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-y', '-i', wav, '-b:a', '48k', '-ar', '22050', path], capture_output=True)
    os.remove(wav)

def pl(arr, sig, t):
    s = int(SR * t)
    e = min(s + len(sig), len(arr))
    if s < len(arr):
        arr[s:e] += sig[:e-s]

# ===== 音乐数据 =====
# C大调，明亮温暖
# 主旋律 - 木琴演奏
MELODY = [
    # Bar 1-2: 上行主题
    ('C5', 0), ('E5', 0.5), ('G5', 1), ('E5', 1.5),
    ('A5', 2), ('G5', 2.5), ('E5', 3), ('D5', 3.5),
    # Bar 3-4: 回应
    ('C5', 4), ('E5', 4.5), ('D5', 5), ('C5', 5.5),
    ('B4', 6), ('C5', 7), (None, 7.5),
    # Bar 5-6: 变化
    ('G4', 8), ('A4', 8.5), ('B4', 9), ('C5', 9.5),
    ('D5', 10), ('E5', 10.5), ('G5', 11), ('E5', 11.5),
    # Bar 7-8: 下行
    ('D5', 12), ('C5', 12.5), ('B4', 13), ('A4', 13.5),
    ('G4', 14), ('A4', 14.5), ('C5', 15), (None, 15.5),
]

# 和弦进行：C - Am - F - G (I - vi - IV - V)
CHORDS = [
    # Bar 1: C大三和弦
    (0, ['C4', 'E4', 'G4'], 2),
    (2, ['C4', 'E4', 'G4'], 2),
    # Bar 2: Am
    (4, ['A3', 'C4', 'E4'], 2),
    (6, ['A3', 'C4', 'E4'], 2),
    # Bar 3: F
    (8, ['F4', 'A4', 'C5'], 2),
    (10, ['F4', 'A4', 'C5'], 2),
    # Bar 4: G
    (12, ['G3', 'B3', 'D4'], 2),
    (14, ['G3', 'B3', 'D4'], 1),
    # 循环重复
    (16, ['C4', 'E4', 'G4'], 2),
    (18, ['C4', 'E4', 'G4'], 2),
    (20, ['A3', 'C4', 'E4'], 2),
    (22, ['A3', 'C4', 'E4'], 2),
    (24, ['F4', 'A4', 'C5'], 2),
    (26, ['F4', 'A4', 'C5'], 2),
    (28, ['G3', 'B3', 'D4'], 2),
    (30, ['G3', 'B3', 'D4'], 1),
]

# 吉他节奏型
GUITAR_PAT = [
    # 稳定的分解和弦
    (0, 'C4', 0), (0, 'E4', 0.5), (0, 'G4', 1), (0, 'E4', 1.5),
    (0, 'A3', 2), (0, 'C4', 2.5), (0, 'E4', 3), (0, 'C4', 3.5),
    (1, 'F4', 4), (1, 'A4', 4.5), (1, 'C5', 5), (1, 'A4', 5.5),
    (1, 'G3', 6), (1, 'B3', 6.5), (1, 'D4', 7), (1, 'B3', 7.5),
]

# 打击乐循环 (4小节循环)
DRUMS = [
    # Bar pattern
    # 轻柔的节拍
    ('kick', 0), ('kick', 2),
    ('snare', 1), ('snare', 3),
    ('shaker', 0), ('shaker', 0.5), ('shaker', 1), ('shaker', 1.5),
    ('shaker', 2), ('shaker', 2.5), ('shaker', 3), ('shaker', 3.5),
]

# ===== 主程序 =====
print("\n-- Town Village BGM (温馨小镇风格) --")

DUR = 32.0  # 32秒，4小节循环两次
NB = int(DUR / BAR)
L = int(SR * DUR) + SR

# 轨道
bell_track = np.zeros(L)
piano_track = np.zeros(L)
guitar_track = np.zeros(L)
strings_track = np.zeros(L)
drum_track = np.zeros(L)
bell点缀_track = np.zeros(L)

# 合成旋律（木琴）
print("  [1] Bell melody...")
for note, beat in MELODY:
    if note:
        t = beat * S8
        if t < DUR:
            pl(bell_track, bell(N(note), S8 * 0.8, 0.35), t)

# 合成和弦（钢琴 + 弦乐）
print("  [2] Chords (piano + strings)...")
for beat, notes, dur_beats in CHORDS:
    t = beat * BEAT
    if t >= DUR:
        continue
    for n in notes:
        # 钢琴
        pl(piano_track, piano_light(N(n), dur_beats * BEAT * 0.9, 0.15), t)
        # 弦乐垫声
        pl(strings_track, strings_pad(N(n), dur_beats * BEAT * 1.2, 0.08), t)

# 吉他扫弦
print("  [3] Guitar strum...")
for bar_off, n, beat in GUITAR_PAT:
    t = bar_off * BAR + beat * BEAT
    if t < DUR and n:
        pl(guitar_track, guitar_strum(N(n), BEAT * 0.4, 0.12), t)

# 打击乐（循环播放）
print("  [4] Drums...")
cycle_dur = BAR * 4  # 4小节循环
drum_times = [
    (0, 'kick', 0), (0, 'kick', 2),
    (1, 'snare', 1), (1, 'snare', 3),
    (2, 'shaker', 0), (2, 'shaker', 0.5), (2, 'shaker', 1), (2, 'shaker', 1.5),
    (2, 'shaker', 2), (2, 'shaker', 2.5), (2, 'shaker', 3), (2, 'shaker', 3.5),
]
for bar_off, drum, beat in drum_times:
    t = bar_off * BAR + beat * BEAT
    if drum == 'kick':
        pl(drum_track, soft_kick(0.25), t)
    elif drum == 'snare':
        pl(drum_track, soft_snare(0.18), t)
    elif drum == 'shaker':
        pl(drum_track, shaker(0.08), t)

# 三角铁点缀（每4小节一次）
print("  [5] Triangle bells...")
for cycle in range(int(DUR / cycle_dur)):
    t = cycle * cycle_dur + 3 * BAR  # 第4小节末
    pl(bell点缀_track, triangle_bell(N('G5'), 0.3, 0.2), t)
    pl(bell点缀_track, triangle_bell(N('E5'), 0.25, 0.15), t + 0.15)

# ===== 混音 =====
print("  Mixing...")
final = (bell_track * 0.6 +
         piano_track * 0.5 +
         guitar_track * 0.4 +
         strings_track * 0.35 +
         drum_track * 0.5 +
         bell点缀_track * 0.3)

# 淡入
fade_in = int(SR * 1.5)
final[:fade_in] *= np.linspace(0, 1, fade_in)

# 淡出
fade_out = int(SR * 2)
final[-fade_out:] *= np.linspace(1, 0, fade_out)

# 标准化
peak = np.max(np.abs(final))
if peak > 0:
    final = final / peak * 0.8

# 导出
out = '/Users/jacob/WorkBuddy/20260418131907/game_bgm/town_village.mp3'
save_mp3(final, out)
sz = os.path.getsize(out)
print(f"\n  [OK] town_village.mp3 ({sz/1024:.1f} KB)")
print(f"  {DUR:.0f}s | 48kbps | Town Village Style")
print(f"  风格：轻快愉悦，阳光小镇")
print(f"  乐器：木琴、钢琴、吉他、弦乐、打击乐")
print("Done!")
