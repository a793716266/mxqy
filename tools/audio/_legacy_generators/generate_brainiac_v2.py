#!/usr/bin/env python3
"""
Brainiac Maniac (PvZ Zomboss BOSS战) - 改进版
修复：钢琴谐波音色 + 文件压缩到 ~100KB
BPM: 120 | 时长: 40秒 | 64kbps MP3
"""
import numpy as np
from scipy.io import wavfile
import subprocess, os

SR = 22050

def piano_tone(freq, dur, vol=0.4):
    """钢琴音色：基频 + 谐波（更接近真实钢琴）"""
    n = int(SR * dur)
    t = np.linspace(0, dur, n, False)
    h1 = 1.00 * np.sin(2 * np.pi * freq * t)
    h2 = 0.50 * np.sin(2 * np.pi * freq * 2 * t)
    h3 = 0.25 * np.sin(2 * np.pi * freq * 3 * t)
    h4 = 0.12 * np.sin(2 * np.pi * freq * 4 * t)
    h5 = 0.06 * np.sin(2 * np.pi * freq * 5 * t)
    wave = h1 + h2 + h3 + h4 + h5
    a = int(SR * 0.003)
    d = int(SR * 0.06)
    r = int(SR * 0.15)
    s_dur = max(0, n - a - d - r)
    env = np.concatenate([
        np.linspace(0, 1, a),
        np.linspace(1, 0.35, d),
        np.ones(s_dur) * 0.35,
        np.linspace(0.35, 0, r)
    ])
    env = np.pad(env, (0, max(0, n - len(env))))[:n]
    return vol * wave * env

def saw(freq, dur, vol=0.1):
    n = int(SR * dur)
    t = np.linspace(0, dur, n, False)
    wave = 2 * (t * freq % 1) - 1
    env = np.exp(-t * 8)
    return vol * wave * env

def kick(dur, vol=0.5):
    n = int(SR * dur)
    t = np.linspace(0, dur, n, False)
    freq_env = 150 * np.exp(-t * 30) + 50
    wave = np.sin(2 * np.pi * freq_env * t)
    env = np.exp(-t * 15)
    return vol * wave * env

def snare(dur, vol=0.4):
    n = int(SR * dur)
    t = np.linspace(0, dur, n, False)
    tone = 0.6 * np.sin(2 * np.pi * 200 * t) * np.exp(-t * 20)
    noise = 0.4 * np.random.randn(n) * np.exp(-t * 25)
    return vol * (tone + noise)

def hihat(dur, vol=0.1):
    n = int(SR * dur)
    t = np.linspace(0, dur, n, False)
    return vol * np.random.randn(n) * np.exp(-t * 80)

def bass(freq, dur, vol=0.25):
    n = int(SR * dur)
    t = np.linspace(0, dur, n, False)
    wave = 2 * (t * freq % 1) - 1
    env = np.exp(-t * 2)
    return vol * wave * env

def save_mp3(sig, path, bitrate='64k'):
    wav_path = path.replace('.mp3', '.wav')
    sig = np.clip(sig, -1.0, 1.0)
    wavfile.write(wav_path, SR, (sig * 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-y', '-i', wav_path, '-b:a', bitrate, path],
                   capture_output=True)
    os.remove(wav_path)

BPM = 120.0
BEAT = 60.0 / BPM
BAR  = BEAT * 4

note_names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

def N(name):
    name = name.replace('b', '#').replace('Cb','B').replace('Fb','E')
    n = name.strip()
    octave = int(n[-1])
    pitch = n[:-1]
    idx = note_names.index(pitch)
    semitone = idx + (octave - 4) * 12
    return 261.63 * (2 ** (semitone / 12.0))

PIANO_PAT = [
    (0.0,'C5'), (0.25,'C6'), (0.5,'F5'), (0.75,'G5'),
    (1.0,'B5'), (1.25,'F5'), (1.5,'G5'), (1.75,'C6'),
    (2.0,'C5'), (2.25,'C6'), (2.5,'F5'), (2.75,'G5'),
    (3.0,'B5'), (3.25,'F5'), (3.5,'G5'), (3.75,'C6'),
    (4.0,'C5'), (4.25,'C6'), (4.5,'F5'), (4.75,'G5'),
    (5.0,'B5'), (5.25,'F5'), (5.5,'G5'), (5.75,'C6'),
    (8.0,'C6'), (8.25,'F5'), (8.5,'G5'), (8.75,'B5'),
    (9.0,'F5'), (9.25,'G5'), (9.5,'B5'), (9.75,'C6'),
    (10.0,'C5'), (10.25,'C6'), (10.5,'F5'), (10.75,'G5'),
    (11.0,'B5'), (11.25,'F5'), (11.5,'G5'), (11.75,'C6'),
    (12.0,'C5'), (12.25,'C6'), (12.5,'F5'), (12.75,'G5'),
    (13.0,'B5'), (13.25,'F5'), (13.5,'G5'), (13.75,'C6'),
    (14.0,'C5'), (14.25,'C6'), (14.5,'F5'), (14.75,'G5'),
    (15.0,'B5'), (15.25,'F5'), (15.5,'G5'), (15.75,'B5'),
]

BASS_ROOTS = {0: N('C3'), 1: N('D#3'), 2: N('F3'), 3: N('G#3')}

DRUM_KICK  = [(0,0),(3,0.25),(4,0),(7,0.25),(8,0),(11,0.25),(12,0),(14,0.25),(15,0)]
DRUM_SNARE = [(4,0),(12,0),(15,0)]
DRUM_HIHAT = [(2,0),(6,0),(10,0),(14,0)]

print("\n-- Brainiac Maniac (improved) --")
print("=" * 38)

DUR = 40.0
NUM_BARS = int(DUR / BAR)
out_len = int(SR * DUR) + int(SR)

piano_out  = np.zeros(out_len)
guitar_out = np.zeros(out_len)
bass_out   = np.zeros(out_len)
drum_out   = np.zeros(out_len)
saw_out    = np.zeros(out_len)

NOTE_DUR = 0.18

print("  [1] Piano...")
for bar in range(1, NUM_BARS+1):
    t_bar = (bar - 1) * BAR
    vol = 0.30 if bar < 5 else 0.35
    for beat_pos, note_name in PIANO_PAT:
        t = t_bar + beat_pos * BEAT
        if t > DUR: break
        sig = piano_tone(N(note_name), NOTE_DUR, vol)
        start = int(SR * t)
        end = min(start + len(sig), out_len)
        piano_out[start:end] += sig[:end-start]

print("  [2] Guitar...")
GUIT_PAT = [
    (0,['C4','A#3'],0.4),(2,['C4','A#3'],0.4),
    (4,['C4','A#3'],0.4),(7,['C4','A#3'],0.4),
    (9,['C4','A#3'],0.4),(10,['C4','A#3'],0.4),
    (12,['C4','A#3'],0.4),(14,['D#4','C4'],0.4),
]
for bar in range(2, NUM_BARS+1):
    t_bar = (bar - 1) * BAR
    if t_bar > DUR: break
    for beat_pos, notes, dur_b in GUIT_PAT:
        t = t_bar + beat_pos * BEAT
        if t > DUR: break
        for note_name in notes:
            sig = piano_tone(N(note_name), BEAT * dur_b, 0.12)
            start = int(SR * t)
            end = min(start + len(sig), out_len)
            guitar_out[start:end] += sig[:end-start]

print("  [3] Sawtooth Lead...")
SAW_PAT = [
    (0,'D#4',1),(2,'F4',1),(4,'F4',1),(6,'D#4',1),
    (7,'G4',1),(9,'F4',1),(11,'D#4',1),(13,'F4',1),(15,'D#4',1),
]
SAW_PAT2 = [
    (0,'C4',1.5),(9,'G3',0.5),(10,'A#3',0.5),(11,'C4',0.5),
    (12,'D#4',0.5),(13,'D4',0.5),(14,'C4',1),(15,'A#3',1),
]
for bar in range(5, 9):
    t_bar = (bar - 1) * BAR
    if t_bar > DUR: break
    for beat_pos, note_name, dur_b in SAW_PAT2:
        t = t_bar + beat_pos * BEAT
        if t > DUR: break
        sig = saw(N(note_name), BEAT * dur_b, 0.08)
        start = int(SR * t)
        end = min(start + len(sig), out_len)
        saw_out[start:end] += sig[:end-start]
for bar in range(9, NUM_BARS+1):
    t_bar = (bar - 1) * BAR
    if t_bar > DUR: break
    for beat_pos, note_name, dur_b in SAW_PAT:
        t = t_bar + beat_pos * BEAT
        if t > DUR: break
        sig = saw(N(note_name), BEAT * dur_b, 0.10)
        start = int(SR * t)
        end = min(start + len(sig), out_len)
        saw_out[start:end] += sig[:end-start]

print("  [4] Bass...")
for bar in range(5, NUM_BARS+1):
    t_bar = (bar - 1) * BAR
    if t_bar > DUR: break
    cycle = (bar - 1) % 4
    freq = BASS_ROOTS[cycle]
    sig = bass(freq, BAR * 0.85, 0.22)
    start = int(SR * t_bar)
    end = min(start + len(sig), out_len)
    bass_out[start:end] += sig[:end-start]

print("  [5] Drums...")
for bar in range(5, NUM_BARS+1):
    t_bar = (bar - 1) * BAR
    if t_bar > DUR: break
    for beat_pos, off in DRUM_KICK:
        t = t_bar + (beat_pos + off) * BEAT
        if t > DUR: break
        sig = kick(0.2, 0.45)
        start = int(SR * t)
        end = min(start + len(sig), out_len)
        drum_out[start:end] += sig[:end-start]
    for beat_pos, off in DRUM_SNARE:
        t = t_bar + (beat_pos + off) * BEAT
        if t > DUR: break
        sig = snare(0.15, 0.35)
        start = int(SR * t)
        end = min(start + len(sig), out_len)
        drum_out[start:end] += sig[:end-start]
    for beat_pos, off in DRUM_HIHAT:
        t = t_bar + (beat_pos + off) * BEAT
        if t > DUR: break
        sig = hihat(0.05, 0.08)
        start = int(SR * t)
        end = min(start + len(sig), out_len)
        drum_out[start:end] += sig[:end-start]

def ramp(sig, start_bar, end_bar):
    arr = sig.copy()
    n = len(arr)
    fade_in  = int(SR * (start_bar - 1) * BAR)
    fade_len = int(SR * (end_bar - start_bar + 1) * BAR)
    ramp_arr = np.ones(n)
    ramp_arr[:fade_in] = 0
    fade_end = min(fade_in + fade_len, n)
    ramp_arr[fade_in:fade_end] = np.linspace(0, 1, fade_end - fade_in)
    return sig * ramp_arr

guitar_out = ramp(guitar_out, 2, 4)
saw_out    = ramp(saw_out, 5, 7)
drum_out   = ramp(drum_out, 5, 6)
bass_out   = ramp(bass_out, 5, 7)

print("  Mixing...")
final = (piano_out  * 0.65 +
         guitar_out * 0.40 +
         saw_out    * 0.50 +
         drum_out   * 0.70 +
         bass_out   * 0.70)

for i in range(len(final)):
    t = i / SR
    bar = t / BAR
    if bar < 4:
        gain = 0.55 + bar * 0.08
    elif bar < 8:
        gain = 0.87 + (bar - 4) * 0.03
    else:
        gain = 1.0
    final[i] *= min(gain, 1.0)

for i in range(len(final)):
    t = i / SR
    if t > DUR - 5:
        final[i] *= max(0, (DUR - t) / 5.0)

peak = np.max(np.abs(final))
if peak > 0:
    final = final / peak * 0.9

out_path = '/Users/jacob/WorkBuddy/20260418131907/game_bgm/brainiac_maniac.mp3'
save_mp3(final, out_path, bitrate='32k')
sz = os.path.getsize(out_path)
print(f"\n  [OK] brainiac_maniac.mp3  ({sz/1024:.1f} KB)")
print(f"  Duration: {DUR:.0f}s | Bitrate: 32kbps")
print(f"   Bars 1-4:  Piano solo (pure)")
print(f"   Bars 5-8:  + Guitar + Bass + Saw Lead + Drums")
print(f"   Bars 9+:   Full ensemble climax")
print(f"   End:       Fade out")
print("\nDone!")
