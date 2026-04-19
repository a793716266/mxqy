"""提取 MIDI bar 33-43 并生成音频"""
import mido
import numpy as np
from scipy.io import wavfile
import os

SR = 22050
TPB = 960  # ticks per beat
BPM = 120

def midi_to_hz(note):
    return 440 * (2 ** ((note - 69) / 12))

def sine(freq, dur, amp=1.0):
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    return amp * np.sin(2 * np.pi * freq * t)

def adsr(sig, a=0.01, d=0.1, s=0.6, r=0.2, dur=None):
    n = len(sig)
    if dur is None:
        dur = n / SR
    ai, di, si, ri = int(a*SR), int(d*SR), int(s*SR), int(r*SR)
    env_len = ai + di + si + ri
    if env_len > 0:
        env = np.concatenate([
            np.linspace(0, 1, max(1, ai)),
            np.linspace(1, 0.7, max(1, di)),
            np.full(max(0, si), 0.7),
            np.linspace(0.7, 0, max(1, ri))
        ])
        env = np.pad(env, (0, max(0, n - len(env))))[:n]
    else:
        env = np.ones(n)
    return sig * env

def export_mp3(sig, path):
    peak = np.max(np.abs(sig))
    if peak > 0:
        sig = sig / peak * 0.85
    wav_path = path.replace('.mp3', '.wav')
    wavfile.write(wav_path, SR, (sig * 32767).astype(np.int16))
    os.system(f'ffmpeg -y -i "{wav_path}" -codec:a libmp3lame -qscale:a 2 "{path}" 2>/dev/null')
    os.remove(wav_path)
    sz = os.path.getsize(path)
    print(f"  ✓ {os.path.basename(path)} ({sz/1024:.1f} KB)")

# 加载MIDI
mid = mido.MidiFile('/Users/jacob/Downloads/Brainiac_Maniac.mid')
beat_dur = 60 / BPM
bar_dur = beat_dur * 4  # 4/4拍

# bar 33-43 = ticks 33*4*960 到 43*4*960
start_tick = 33 * 4 * TPB
end_tick = 43 * 4 * TPB

print(f"提取 bar 33-43 (ticks {start_tick} - {end_tick})")
print(f"时长: {(end_tick - start_tick) / TPB / 4 * beat_dur:.2f} 秒")

# 收集所有音符
notes = []  # (tick, pitch, vel, dur_ticks, track_idx)
track_names = []

for track_idx, track in enumerate(mid.tracks):
    tick = 0
    active_notes = {}  # channel -> (pitch, vel, start_tick)
    
    for msg in track:
        tick += msg.time
        if msg.type == 'note_on' and msg.velocity > 0:
            active_notes[msg.channel] = (msg.note, msg.velocity, tick)
        elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
            if msg.channel in active_notes:
                pitch, vel, start = active_notes.pop(msg.channel)
                dur_ticks = tick - start
                if start_tick <= start < end_tick or start <= start_tick < end_tick:
                    notes.append((start, pitch, vel, dur_ticks, track_idx))
        elif msg.type == 'track_name':
            if track_idx < len(track_names) + 1:
                track_names.append(msg.name)

print(f"找到 {len(notes)} 个音符")

# 合成音频
# bar 33 开始的时间偏移
offset_in_bar = 33 * bar_dur  # 33 * 2 = 66秒位置
total_dur = (end_tick - start_tick) / TPB * beat_dur  # 10小节 = 20秒

audio = np.zeros(int(SR * (total_dur + 0.5)))

def piano(freq, dur, vel=100):
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # 钢琴音色：基频 + 谐波
    sig = np.sin(2*np.pi*freq*t) * 1.0
    sig += np.sin(2*np.pi*freq*2*t) * 0.3 / 2
    sig += np.sin(2*np.pi*freq*3*t) * 0.1 / 3
    sig += np.sin(2*np.pi*freq*5*t) * 0.05 / 5
    amp = vel / 127 * 0.5
    # ADSR
    a, d = 0.005, 0.1
    s_level = 0.3
    r = dur * 0.3
    env = np.exp(-t * (2 + freq/500))
    env = np.clip(t/a, 0, 1) * np.where(t < a+d, 1 - (t-a)*(1-s_level)/d, s_level)
    env *= np.where(t > dur-r, (dur-t)/r, 1)
    env = np.clip(env, 0, 1)
    return sig * env * amp

for tick, pitch, vel, dur_ticks, track_idx in notes:
    # 计算在输出音频中的位置
    start_sec = (tick - start_tick) / TPB * beat_dur
    dur_sec = dur_ticks / TPB * beat_dur
    
    if 0 <= start_sec < total_dur + 1:
        freq = midi_to_hz(pitch)
        # 使用钢琴音色
        note_sig = piano(freq, min(dur_sec, total_dur - start_sec + 0.5), vel)
        
        start_sample = int(start_sec * SR)
        end_sample = min(start_sample + len(note_sig), len(audio))
        audio[start_sample:end_sample] += note_sig[:end_sample - start_sample]

# 标准化
peak = np.max(np.abs(audio))
if peak > 0:
    audio = audio / peak * 0.8

# 导出
out_path = '/Users/jacob/WorkBuddy/20260418131907/game_bgm/brainiac_maniac_bar33-43.mp3'
export_mp3(audio, out_path)
print(f"\n已生成: {out_path}")
