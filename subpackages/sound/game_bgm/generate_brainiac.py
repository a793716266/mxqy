#!/usr/bin/env python3
"""
Brainiac Maniac (PvZ Zomboss BOSS战) - 高还原度合成
基于 MIDI 文件逆向工程重建
BPM: 120 | 总时长: ~100秒
"""
import numpy as np
from scipy.io import wavfile

import subprocess, os, sys

SR = 22050  # 降低采样率省内存

def sine(freq, dur, vol=1.0, phase=0.0):
    t = np.linspace(0, dur, int(SR * dur), False)
    return vol * np.sin(2 * np.pi * freq * t + phase)

def env(dur, attack=0.005, decay=0.05, sustain=0.7, release=0.1):
    n = int(SR * dur)
    a = int(SR * attack)
    d = int(SR * decay)
    r = int(SR * release)
    s = max(0, n - a - d - r)
    e = np.concatenate([
        np.linspace(0, 1, max(a,1)),
        np.linspace(1, sustain, max(d,1)),
        np.ones(s) * sustain,
        np.linspace(sustain, 0, max(r,1))
    ])
    if len(e) < n:
        e = np.pad(e, (0, n - len(e)))
    return e[:n]

def add_channels(sig_list, offset_list):
    """将多个音频片段相加到输出缓冲区"""
    total_len = max(int(SR * (max(offset_list) + max(len(s)/SR for s in sig_list if len(s)>0))) + 1, int(SR * 0.5))
    out = np.zeros(total_len)
    for sig, offset in zip(sig_list, offset_list):
        if len(sig) == 0: continue
        start = int(SR * offset)
        end = min(start + len(sig), total_len)
        out[start:end] += sig[:end-start]
    return out

def adsr_hold(freq, dur, vol, attack=0.01, hold=0.0, decay=0.1, sustain=0.6, release=0.15, phase=0.0):
    """带保持段的 ADSR 包络（适合钢琴）"""
    n = int(SR * dur)
    t = np.linspace(0, dur, n, False)
    a_n = max(int(SR * attack), 1)
    h_n = max(int(SR * hold), 1)
    d_n = max(int(SR * decay), 1)
    r_n = max(int(SR * release), 1)
    s_n = max(0, n - a_n - h_n - d_n - r_n)
    e = np.concatenate([
        np.linspace(0, 1, a_n),
        np.ones(h_n),
        np.linspace(1, sustain, d_n),
        np.ones(s_n) * sustain,
        np.linspace(sustain, 0, r_n)
    ])
    # 对齐到 n
    if len(e) > n:
        e = e[:n]
    elif len(e) < n:
        e = np.pad(e, (0, n - len(e)))
    return vol * np.sin(2 * np.pi * freq * t + phase) * e

def percussive(freq, dur, vol):
    """打击感合成器（鼓/镲）"""
    n = int(SR * dur)
    t = np.linspace(0, dur, n, False)
    s = vol * np.sin(2 * np.pi * freq * t)
    # 快速起音+短衰减
    env_b = np.exp(-t * (15 if dur > 0.1 else 40))
    # 添加噪音成分
    noise = np.random.randn(n) * 0.1 * np.exp(-t * 30)
    return (s * env_b + noise)[:n]

def save_mp3(sig, path):
    wav_path = path.replace('.mp3', '.wav')
    sig = np.clip(sig, -1.0, 1.0)
    wavfile.write(wav_path, SR, (sig * 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-y', '-i', wav_path, '-b:a', '128k', path],
                   capture_output=True)
    os.remove(wav_path)

# ===== 核心数据 =====
BPM = 120.0
BEAT = 60.0 / BPM       # 1拍 = 0.5秒
BAR  = BEAT * 4          # 1小节 = 2秒
TPB  = 960               # MIDI ticks/拍

note_names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

def N(name):
    """音符名转频率（C4=261.63Hz）"""
    name = name.replace('b', '#').replace('Cb','B').replace('Fb','E')
    # 处理重升/重降
    n = name.strip()
    octave = int(n[-1])
    pitch = n[:-1]
    idx = note_names.index(pitch)
    semitone = idx + (octave - 4) * 12  # 相对 C4
    return 261.63 * (2 ** (semitone / 12.0))

# ===== 和弦进行 (小节5-8 Bass根音) =====
# 小节1-4: Cm7? | 小节5: Cm | 小节6: D# | 小节7: Fm | 小节8: G#
# Piano主旋律: C5-C6-F5-G5-B5 跑动

# Bass 和弦根音 (小节1开始，4小节循环)
bass_roots = {
    1: N('C3'),   # Cm
    2: N('D#3'),  # D#
    3: N('F3'),   # Fm
    4: N('G#3'),  # G#
}

# Piano 主旋律音型 (一小节内的16分音符位置)
# C5=C6-F5-G5-B5-F5-G5-C6 | C6- F5-G5-B5-F5-G5-B5
PIANO_PATTERN = [
    (0.0,  'C5'), (1.0,  'C6'), (2.0,  'F5'), (3.0,  'G5'),
    (4.0,  'B5'), (5.0,  'F5'), (6.0,  'G5'), (7.0,  'C6'),
    (9.0,  'C6'), (10.0, 'F5'), (11.0, 'G5'), (12.0, 'B5'),
    (13.0, 'F5'), (14.0, 'G5'), (15.0, 'B5'),
]

# Guitar 节奏型 (C4 + A#3 双音)
GUITAR_PATTERN = [
    (0.0, ['C4', 'A#3']), (2.0, ['C4', 'A#3']),
    (4.0, ['C4', 'A#3']), (7.0, ['C4', 'A#3']),
    (9.0, ['C4', 'A#3']), (10.0, ['C4', 'A#3']),
    (12.0, ['C4', 'A#3']), (14.0, ['D#4', 'C4']),
]

# Sawtooth Lead 旋律 (小节4后半段-8)
SAW_PATTERN = [
    # 小节7-8 主lead线
    (0.0,  'D#4'), (2.0,  'F4'), (4.0,  'F4'), (6.0,  'D#4'),
    (7.0,  'G4'),  (9.0,  'F4'), (11.0, 'D#4'), (13.0, 'F4'), (15.0, 'D#4'),
]
SAW_PATTERN_B = [
    # 小节5-6 lead线
    (0.0,  'C4'), (9.0,  'G3'), (10.0, 'A#3'), (11.0, 'C4'),
    (12.0, 'D#4'),(13.0, 'D4'), (14.0, 'C4'),  (15.0, 'A#3'),
]

# 鼓型 (第5小节开始)
# Kick: C2 ~82Hz | Snare/Clap: D#1 ~39Hz | HiHat: D#1 ~T
DRUM_BEATS = [
    # 小节5-8, 16分音符位置
    (0.0, 'kick'), (3.0, 'kick'), (4.0, 'kick'), (7.0, 'kick'),
    (8.0, 'kick'), (11.0, 'kick'), (12.0, 'kick'), (14.0, 'kick'),
    (15.0, 'kick'),
]

SNARE_BEATS = [
    (4.0, 'snare'), (12.0, 'snare'), (15.0, 'snare'),
]

HIHAT_BEATS = [
    (2.0, 'hh'), (6.0, 'hh'), (10.0, 'hh'), (14.0, 'hh'),
]

print("\n-- Brainiac Maniac BGM --")
print("=" * 36)

# ===== 合成 =====
print("  [1/5] Piano 主旋律...")
total_dur = 100.0
piano_sigs = []
piano_times = []

for bar_num in range(1, 51):  # 最多50小节
    bar_start = (bar_num - 1) * BAR
    if bar_start > total_dur:
        break
    # 小节4开始力度增强
    vol = 0.35 if bar_num >= 4 else 0.25
    for beat_pos, note_name in PIANO_PATTERN:
        t = bar_start + beat_pos * BEAT / 4
        if t > total_dur: break
        # 音符时值：大部分16分，偶尔8分
        dur = BEAT / 4
        if beat_pos in [7, 14, 15]:
            pass  # 16分
        elif beat_pos == 0:
            dur = BEAT / 4
        freq = N(note_name)
        sig = adsr_hold(freq, dur, vol, attack=0.005, hold=0.0, decay=0.06, sustain=0.5, release=0.08)
        piano_sigs.append(sig)
        piano_times.append(t)

print("  [2/5] Guitar 节奏型...")
guitar_sigs = []
guitar_times = []

for bar_num in range(1, 51):
    bar_start = (bar_num - 1) * BAR
    if bar_start > total_dur: break
    if bar_num < 2: continue  # 从小节2开始
    for beat_pos, notes in GUITAR_PATTERN:
        t = bar_start + beat_pos * BEAT / 4
        if t > total_dur: break
        for n in notes:
            freq = N(n)
            sig = adsr_hold(freq, BEAT/2, 0.15, attack=0.003, hold=0.0, decay=0.08, sustain=0.4, release=0.1)
            guitar_sigs.append(sig)
            guitar_times.append(t)

print("  [3/5] Sawtooth Lead 旋律...")
saw_sigs = []
saw_times = []

for bar_num in range(5, 9):  # 小节5-8
    bar_start = (bar_num - 1) * BAR
    if bar_start > total_dur: break
    for beat_pos, note_name in SAW_PATTERN_B:
        t = bar_start + beat_pos * BEAT / 4
        if t > total_dur: break
        freq = N(note_name)
        # Sawtooth 用锯齿波模拟
        dur = BEAT / 4 * 2
        n = int(SR * dur)
        t_arr = np.linspace(0, dur, n, False)
        saw = 0.4 * (2 * (t_arr * freq % 1) - 1)
        env_saw = np.exp(-t_arr * 6)
        sig = (saw * env_saw * 0.12)[:n]
        saw_sigs.append(sig)
        saw_times.append(t)

for bar_num in range(9, 13):  # 小节9-12
    bar_start = (bar_num - 1) * BAR
    if bar_start > total_dur: break
    for beat_pos, note_name in SAW_PATTERN:
        t = bar_start + beat_pos * BEAT / 4
        if t > total_dur: break
        freq = N(note_name)
        dur = BEAT / 4 * 2
        n = int(SR * dur)
        t_arr = np.linspace(0, dur, n, False)
        saw = 0.4 * (2 * (t_arr * freq % 1) - 1)
        env_saw = np.exp(-t_arr * 5)
        sig = (saw * env_saw * 0.14)[:n]
        saw_sigs.append(sig)
        saw_times.append(t)

print("  [4/5] 鼓组 (Kick/Snare/HiHat)...")
drum_sigs = []
drum_times = []

for bar_num in range(5, 51):  # 从小节5开始
    bar_start = (bar_num - 1) * BAR
    if bar_start > total_dur: break
    vol_mult = min(1.0, 0.7 + (bar_num - 5) * 0.03)  # 渐强
    for beat_pos, inst in DRUM_BEATS:
        t = bar_start + beat_pos * BEAT / 4
        if t > total_dur: break
        if inst == 'kick':
            sig = percussive(82, 0.2, 0.5 * vol_mult)
        else:
            continue
        drum_sigs.append(sig)
        drum_times.append(t)
    for beat_pos, inst in SNARE_BEATS:
        t = bar_start + beat_pos * BEAT / 4
        if t > total_dur: break
        if inst == 'snare':
            # Snare = 主体音 + 噪音
            n = int(SR * 0.15)
            t_arr = np.linspace(0, 0.15, n, False)
            tone = 0.5 * np.sin(2 * np.pi * 200 * t_arr) * np.exp(-t_arr * 20)
            noise = 0.3 * np.random.randn(n) * np.exp(-t_arr * 25)
            sig = np.concatenate([tone + noise, np.zeros(max(0, n - len(tone + noise)))])[:n]
            sig *= vol_mult
        drum_sigs.append(sig)
        drum_times.append(t)
    for beat_pos, inst in HIHAT_BEATS:
        t = bar_start + beat_pos * BEAT / 4
        if t > total_dur: break
        if inst == 'hh':
            sig = percussive(8000, 0.05, 0.12 * vol_mult)
        drum_sigs.append(sig)
        drum_times.append(t)

print("  [5/5] Bass 和弦根音...")
bass_sigs = []
bass_times = []

for bar_num in range(1, 51):
    bar_start = (bar_num - 1) * BAR
    if bar_start > total_dur: break
    if bar_num < 5: continue  # 从小节5开始
    root_freq = bass_roots.get(((bar_num - 1) % 4) + 1, N('C3'))
    t = bar_start
    dur = BAR * 0.9
    n = int(SR * dur)
    t_arr = np.linspace(0, dur, n, False)
    bass_wave = 0.5 * (2 * (t_arr * root_freq % 1) - 1) * np.exp(-t_arr * 0.5)
    sig = bass_wave * 0.25
    bass_sigs.append(sig)
    bass_times.append(t)

# ===== 混音 =====
print("  混音中...")

def mix_all(sig_lists, time_lists, normalize=True):
    """混合所有信号"""
    total_len = int(SR * total_dur) + int(SR * 2)
    out = np.zeros(total_len)
    total_count = sum(len(s) for s in sig_lists)
    for sig, t in zip(sig_lists, time_lists):
        if len(sig) == 0: continue
        start = int(SR * t)
        end = min(start + len(sig), total_len)
        if start < total_len:
            out[start:end] += sig[:end-start]
    if normalize:
        peak = np.max(np.abs(out))
        if peak > 0:
            out = out / peak * 0.9
    return out

piano_out = mix_all(piano_sigs, piano_times)
guitar_out = mix_all(guitar_sigs, guitar_times)
saw_out = mix_all(saw_sigs, saw_times)
drum_out = mix_all(drum_sigs, drum_times)
bass_out = mix_all(bass_sigs, bass_times)

# 逐步引入各轨道
def ramp_in(sig, start_bar, end_bar):
    """在指定小节范围内淡入"""
    ramp_len = int(SR * (end_bar - start_bar) * BAR)
    ramp = np.ones(len(sig))
    fade_in_n = int(SR * (start_bar - 1) * BAR)
    ramp[:fade_in_n] = 0
    fade_ramp_n = int(SR * (end_bar - start_bar + 1) * BAR)
    ramp[fade_in_n:fade_in_n + ramp_len] = np.linspace(0, 1, ramp_len)
    return sig * ramp

guitar_out = ramp_in(guitar_out, 2, 4)
saw_out = ramp_in(saw_out, 5, 7)
drum_out = ramp_in(drum_out, 5, 6)
bass_out = ramp_in(bass_out, 5, 7)

# 最终混音
final = (piano_out * 0.7 +
         guitar_out * 0.5 +
         saw_out * 0.6 +
         drum_out * 0.8 +
         bass_out * 0.8)

# 渐进增强（高潮在小节9-12）
peak_bar = 10
for i in range(len(final)):
    t = i / SR
    bar = t / BAR
    # 小节1-4轻柔，5-8中等，9+高潮
    if bar < 4:
        gain = 0.6 + bar * 0.05
    elif bar < 8:
        gain = 0.8 + (bar - 4) * 0.05
    else:
        gain = 1.0
    final[i] *= min(gain, 1.0)

# 结尾淡出
fade_start = total_dur - 5.0
for i in range(len(final)):
    t = i / SR
    if t > fade_start:
        final[i] *= max(0, (total_dur - t) / 5.0)

# 保存
out_path = '/Users/jacob/WorkBuddy/20260418131907/game_bgm/brainiac_maniac.mp3'
save_mp3(final, out_path)
sz = os.path.getsize(out_path)
print(f"\n  [OK] brainiac_maniac.mp3  ({sz/1024:.1f} KB)")
print(f"  Duration: {total_dur:.0f}s | BPM: {BPM:.0f}")
print(f"  Structure:")
print(f"   Bars 1-4:   Piano solo + Guitar (C5-C6 run, 16th notes)")
print(f"   Bars 5-8:  + Percussion + Bass + Sawtooth Lead")
print(f"   Bars 9-12: Climax (full ensemble)")
print(f"   End:       Fade out")
print("\nDone!")
