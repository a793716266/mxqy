"""提取 MIDI bar 33-43 - 使用与原版完全相同的合成器"""
import mido
import numpy as np
from scipy.io import wavfile
import subprocess, os

SR = 22050
BPM = 120.0; BEAT = 60.0/BPM; BAR = BEAT*4; S16 = BEAT/4
TPB = 960

# ---- 低通滤波 ----
def lpf(sig, cutoff=5000, fs=SR):
    rc = 1.0 / (2 * np.pi * cutoff)
    dt = 1.0 / fs
    alpha = dt / (rc + dt)
    out = np.zeros(len(sig))
    out[0] = sig[0]
    for i in range(1, len(sig)):
        out[i] = out[i-1] + alpha * (sig[i] - out[i-1])
    return out

# ---- 合成器（与 gen_v4.py 完全一致）----
def piano(freq, dur, vol=0.35):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    wave=(1.00*np.sin(2*np.pi*freq*t)+0.50*np.sin(2*np.pi*freq*2*t)+
          0.25*np.sin(2*np.pi*freq*3*t)+0.12*np.sin(2*np.pi*freq*4*t)+
          0.06*np.sin(2*np.pi*freq*5*t))
    a,d,r=int(SR*0.003),int(SR*0.05),int(SR*0.14)
    s=max(0,n-a-d-r)
    env=np.concatenate([np.linspace(0,1,a),np.linspace(1,0.3,d),np.ones(s)*0.3,np.linspace(0.3,0,r)])
    env=np.pad(env,(0,max(0,n-len(env)))); env=env[:n]
    return vol*wave*env

def organ(freq, dur, vol=0.10):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    wave=(0.6*np.sin(2*np.pi*freq*t)+0.3*np.sin(2*np.pi*freq*2*t)+
          0.15*np.sin(2*np.pi*freq*3*t)+0.08*np.sin(2*np.pi*freq*4*t))
    a=int(SR*0.008); r=int(SR*0.06); s=max(0,n-a-r)
    env=np.concatenate([np.linspace(0,1,a),np.ones(s)*0.85,np.linspace(0.85,0,r)])
    env=np.pad(env,(0,max(0,n-len(env)))); env=env[:n]
    return vol*wave*env

def violins(freq, dur, vol=0.10):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    vib=1.0+0.006*np.sin(2*np.pi*5.5*t)
    wave=(np.sin(2*np.pi*freq*vib*t)+
          0.50*np.sin(2*np.pi*freq*2*t)+
          0.25*np.sin(2*np.pi*freq*3*t)+
          0.12*np.sin(2*np.pi*freq*4*t))
    a=int(SR*0.15); d=int(SR*0.2); r=int(SR*0.3)
    sustain_len=max(0,n-a-d-r)
    env=np.concatenate([np.linspace(0,1,a),np.linspace(1,0.7,d),np.ones(sustain_len)*0.7,np.linspace(0.7,0,r)])
    env=np.pad(env,(0,max(0,n-len(env)))); env=env[:n]
    return vol*wave*env

def sine_high(freq, dur, vol=0.06):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    env=np.concatenate([np.linspace(0,1,int(SR*0.02)),np.ones(max(0,n-int(SR*0.02)))*0.9])
    return vol*np.sin(2*np.pi*freq*t)*env

def harp(freq, dur, vol=0.10):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    wave=(np.sin(2*np.pi*freq*t)+0.4*np.sin(2*np.pi*freq*2*t)+
          0.2*np.sin(2*np.pi*freq*3*t)+0.1*np.sin(2*np.pi*freq*4*t))
    a=int(SR*0.002); r=int(SR*0.25)
    env=np.concatenate([np.linspace(0,1,a),np.linspace(1,0,n-a)])
    env=np.pad(env,(0,max(0,n-len(env)))); env=env[:n]
    return vol*wave*env

def saw_lead(freq, dur, vol=0.12):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    raw = 2.0*(t*freq % 1.0) - 1.0
    wave = lpf(raw, cutoff=2800)
    env=np.exp(-t*6)
    return vol*wave*env

def bass_synth(freq, dur, vol=0.22):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    raw = 2*(t*freq%1)-1
    wave = lpf(raw, cutoff=800)
    return vol*wave*np.exp(-t*1.8)

# ---- 鼓组 ----
def kick(vol=0.45):
    n=int(SR*0.22); t=np.linspace(0,0.22,n,False)
    fe=150*np.exp(-t*25)+55
    return vol*np.sin(2*np.pi*fe*t)*np.exp(-t*12)

def snare(vol=0.30):
    n=int(SR*0.20); t=np.linspace(0,0.20,n,False)
    tone=0.8*np.sin(2*np.pi*200*t)*np.exp(-t*15)
    raw_noise=0.2*np.random.randn(n)*np.exp(-t*20)
    filtered_noise=lpf(raw_noise, cutoff=6000)
    return vol*(tone+filtered_noise)

def open_hihat(vol=0.14):
    n=int(SR*0.35); t=np.linspace(0,0.35,n,False)
    raw=np.random.randn(n)*np.exp(-t*6)
    bp = lpf(raw, cutoff=9000)
    bp = bp - lpf(raw, cutoff=5000)
    mag=np.max(np.abs(bp))+1e-9
    return vol*bp/mag

def closed_hihat(vol=0.08):
    n=int(SR*0.06); t=np.linspace(0,0.06,n,False)
    raw=np.random.randn(n)*np.exp(-t*60)
    bp=lpf(raw, cutoff=8000)
    mag=np.max(np.abs(bp))+1e-9
    return vol*bp/mag

def china_crash(vol=0.18):
    n=int(SR*0.4); t=np.linspace(0,0.4,n,False)
    raw=np.random.randn(n)*np.exp(-t*5)
    filtered=lpf(raw, cutoff=5000)
    mag=np.max(np.abs(filtered))+1e-9
    return vol*filtered/mag

def ride_cymbal(vol=0.15):
    n=int(SR*0.3); t=np.linspace(0,0.3,n,False)
    raw=np.random.randn(n)*np.exp(-t*7)
    filtered=lpf(raw, cutoff=4500)
    mag=np.max(np.abs(filtered))+1e-9
    return vol*filtered/mag

# ---- 工具函数 ----
nn=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def N(name):
    name=name.replace('b','#')
    oct=int(name[-1]); p=name[:-1]
    return 261.63*(2**((nn.index(p)+(oct-4)*12)/12.0))

def midi_to_hz(note):
    return 440 * (2 ** ((note - 69) / 12))

def save_mp3(sig, path):
    sig=np.clip(sig,-1.0,1.0)
    wav=path.replace('.mp3','.wav')
    wavfile.write(wav,SR,(sig*32767).astype(np.int16))
    subprocess.run(['ffmpeg','-y','-i',wav,'-b:a','128k','-ar','44100',path],capture_output=True)
    os.remove(wav)

def pl(arr, sig, t):
    s=int(SR*t); e=min(s+len(sig),len(arr))
    if s<len(arr): arr[s:e]+=sig[:e-s]

# ---- 加载 MIDI ----
print("加载 MIDI...")
mid = mido.MidiFile('/Users/jacob/Downloads/Brainiac_Maniac.mid')

# 分析每个轨道的音域，判断是什么乐器
track_ranges = []
for i, track in enumerate(mid.tracks):
    notes = []
    for msg in track:
        if msg.type == 'note_on' and msg.velocity > 0:
            notes.append(msg.note)
    if notes:
        track_ranges.append((i, min(notes), max(notes)))
        print(f"  Track {i}: notes={len(notes)}, range={min(notes)}-{max(notes)} ({midi_to_hz(min(notes)):.1f}-{midi_to_hz(max(notes)):.1f}Hz)")

# Bar 33-43 时间范围
start_bar = 33
end_bar = 43
start_tick = start_bar * 4 * TPB
end_tick = end_bar * 4 * TPB
total_bars = end_bar - start_bar
total_dur = total_bars * BAR  # 10 bars = 20 seconds

print(f"\n提取 bar {start_bar}-{end_bar} (ticks {start_tick} - {end_tick})")
print(f"时长: {total_dur:.2f} 秒")

# 收集所有音符，按轨道分组
# 轨道分配（根据之前的分析）：
# Track 1: Piano (mid range, velocity variable)
# Track 5: Organ (full range, sustained)
# Track 6: Saw Lead (high, short staccato)
# Track 7: Bass (very low)
# Track 8: Violins (mid-high, sustained)
# Track 9: Sine high (very high, short)
# Track 10: Harp (mid range, arpeggiated)

audio = np.zeros(int(SR * (total_dur + 0.5)))

def classify_track(track_idx, avg_vel, vel_range):
    """根据轨道特性判断合成器类型"""
    if track_idx == 0:
        return 'drums'
    # 根据平均音高判断
    return None

# 收集并合成
note_count = 0
for track_idx, track in enumerate(mid.tracks):
    tick = 0
    active_notes = {}  # channel -> (pitch, vel, start_tick)
    
    for msg in track:
        tick += msg.time
        
        if msg.type == 'note_on' and msg.velocity > 0:
            active_notes[msg.channel] = (msg.note, msg.velocity, tick)
        elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
            if msg.channel in active_notes:
                pitch, vel, start_tick_n = active_notes.pop(msg.channel)
                dur_ticks = tick - start_tick_n
                
                # 检查是否在目标范围内
                if not (start_tick_n < end_tick and tick > start_tick):
                    continue
                
                # 计算在输出音频中的位置（从 bar 33 开始）
                start_sec = (start_tick_n - start_tick) / TPB * BEAT
                dur_sec = dur_ticks / TPB * BEAT
                
                if 0 <= start_sec < total_dur + 1:
                    freq = midi_to_hz(pitch)
                    vel_norm = vel / 127.0
                    
                    # 根据轨道和音域选择合成器
                    synth = None
                    vol = 0.3
                    
                    # Drum mapping (MIDI standard)
                    if pitch == 36:  # C2 Kick
                        pl(audio, kick(0.45), start_sec)
                        note_count += 1
                        continue
                    elif pitch == 38:  # D2 Snare
                        pl(audio, snare(0.30), start_sec)
                        note_count += 1
                        continue
                    elif pitch == 42:  # D#2 Closed HH
                        pl(audio, closed_hihat(0.08), start_sec)
                        note_count += 1
                        continue
                    elif pitch == 46:  # A#2 Open HH
                        pl(audio, open_hihat(0.14), start_sec)
                        note_count += 1
                        continue
                    elif pitch == 49:  # C#3 China
                        pl(audio, china_crash(0.18), start_sec)
                        note_count += 1
                        continue
                    elif pitch == 56:  # G#3 Ride
                        pl(audio, ride_cymbal(0.15), start_sec)
                        note_count += 1
                        continue
                    
                    # 非鼓组：使用钢琴音色作为默认
                    note_dur = min(dur_sec, total_dur - start_sec + 0.5)
                    sig = piano(freq, note_dur, vol * vel_norm)
                    pl(audio, sig, start_sec)
                    note_count += 1

print(f"处理了 {note_count} 个音符")

# 标准化
peak = np.max(np.abs(audio))
if peak > 0:
    audio = audio / peak * 0.85

# 导出
out_path = '/Users/jacob/WorkBuddy/20260418131907/game_bgm/brainiac_maniac_bar33-43_v2.mp3'
save_mp3(audio, out_path)
sz = os.path.getsize(out_path)
print(f"\n✓ 已生成: {out_path} ({sz/1024:.1f} KB)")
