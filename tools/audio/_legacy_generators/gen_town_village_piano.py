#!/usr/bin/env python3
"""Town Village BGM - 纯钢琴版"""
import numpy as np
from scipy.io import wavfile
import subprocess, os

SR = 22050
BPM = 100.0
BEAT = 60.0 / BPM
BAR = BEAT * 4
S8 = BEAT / 2

nn = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
def N(name):
    name = name.replace('b', '#')
    oct = int(name[-1])
    p = name[:-1]
    return 261.63 * (2 ** ((nn.index(p) + (oct - 4) * 12) / 12.0))

def sine(freq, dur, amp=1.0):
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    return amp * np.sin(2 * np.pi * freq * t)

def piano_light(freq, dur, vol=0.3):
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    sig = sine(freq, dur, 1.0) * 0.6
    sig += sine(freq * 2, dur, 1.0) * 0.3
    sig += sine(freq * 3, dur, 1.0) * 0.15
    sig += sine(freq * 4, dur, 1.0) * 0.08
    a = int(SR * 0.01)
    d = int(SR * 0.08)
    r = int(SR * 0.25)
    s_len = max(0, int(SR * dur) - a - d - r)
    env = np.concatenate([
        np.linspace(0, 1, a),
        np.linspace(1, 0.6, d),
        np.ones(s_len) * 0.6,
        np.linspace(0.6, 0, r)
    ])
    env = np.pad(env, (0, max(0, int(SR * dur) - len(env))))[:int(SR * dur)]
    return vol * sig * env

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

# 主旋律（16个8分音符 = 8小节）
MELODY = [
    ('C5', 0), ('E5', 0.5), ('G5', 1), ('E5', 1.5),
    ('A5', 2), ('G5', 2.5), ('E5', 3), ('D5', 3.5),
    ('C5', 4), ('E5', 4.5), ('D5', 5), ('C5', 5.5),
    ('B4', 6), ('C5', 7), (None, 7.5),
    ('G4', 8), ('A4', 8.5), ('B4', 9), ('C5', 9.5),
    ('D5', 10), ('E5', 10.5), ('G5', 11), ('E5', 11.5),
    ('D5', 12), ('C5', 12.5), ('B4', 13), ('A4', 13.5),
    ('G4', 14), ('A4', 14.5), ('C5', 15), (None, 15.5),
]

# 和弦（16小节）
CHORDS = [
    (0, ['C4', 'E4', 'G4'], 2),    # C
    (2, ['C4', 'E4', 'G4'], 2),    # C
    (4, ['A3', 'C4', 'E4'], 2),     # Am
    (6, ['A3', 'C4', 'E4'], 2),    # Am
    (8, ['F4', 'A4', 'C5'], 2),    # F
    (10, ['F4', 'A4', 'C5'], 2),   # F
    (12, ['G3', 'B3', 'D4'], 2),   # G
    (14, ['G3', 'B3', 'D4'], 2),   # G
    (16, ['C4', 'E4', 'G4'], 2),   # C
    (18, ['C4', 'E4', 'G4'], 2),   # C
    (20, ['A3', 'C4', 'E4'], 2),   # Am
    (22, ['A3', 'C4', 'E4'], 2),   # Am
    (24, ['F4', 'A4', 'C5'], 2),   # F
    (26, ['F4', 'A4', 'C5'], 2),   # F
    (28, ['G3', 'B3', 'D4'], 2),   # G
    (30, ['G3', 'B3', 'D4'], 2),   # G (修复：原来是1改为2)
]

print("\n-- Town Village Piano Only --")
DUR = 32.0
L = int(SR * DUR) + SR
melody_track = np.zeros(L)
chord_track = np.zeros(L)

# 旋律（循环覆盖全部时长）
print("  [1] Melody...")
cycle_melody = 16 * S8  # 8小节 = 4.8秒
for cycle in range(int(DUR / cycle_melody) + 1):
    offset = cycle * cycle_melody
    for note, beat in MELODY:
        if note:
            t = offset + beat * S8
            if t < DUR:
                pl(melody_track, piano_light(N(note), S8 * 0.85, 0.35), t)

# 和弦（循环覆盖全部时长）
print("  [2] Chords...")
cycle_chord = 16 * BAR  # 16小节 = 9.6秒
for cycle in range(int(DUR / cycle_chord) + 1):
    offset = cycle * cycle_chord
    for beat, notes, dur_beats in CHORDS:
        t = offset + beat * BEAT
        if t >= DUR:
            continue
        for n in notes:
            pl(chord_track, piano_light(N(n), dur_beats * BEAT * 0.7, 0.15), t)

# 混音
print("  Mixing...")
final = melody_track * 0.7 + chord_track * 0.5

# 淡入淡出
fade_in = int(SR * 1.0)
final[:fade_in] *= np.linspace(0, 1, fade_in)
fade_out = int(SR * 2)
final[-fade_out:] *= np.linspace(1, 0, fade_out)

peak = np.max(np.abs(final))
if peak > 0:
    final = final / peak * 0.8

out = '/Users/jacob/WorkBuddy/20260418131907/game_bgm/town_village_piano.mp3'
save_mp3(final, out)
sz = os.path.getsize(out)
print(f"\n  [OK] town_village_piano.mp3 ({sz/1024:.1f} KB)")
print("Done!")
