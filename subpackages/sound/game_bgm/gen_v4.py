#!/usr/bin/env python3
"""Brainiac Maniac v4 - 全乐器高保真版 BPM:120
新增: Violins弦乐垫声 + Sine高频 + Harp竖琴 + Percussion完整6种鼓组 + Organ双音和弦
"""
import numpy as np
from scipy.io import wavfile
import subprocess, os

SR = 22050
BPM = 120.0; BEAT = 60.0/BPM; BAR = BEAT*4; S16 = BEAT/4

# ---- Lowpass filter (1-pole IIR, for smoothing harsh high frequencies) ----
def lpf(sig, cutoff=5000, fs=SR):
    """1-pole IIR lowpass: softens noise and sawtooth aliasing"""
    rc = 1.0 / (2 * np.pi * cutoff)
    dt = 1.0 / fs
    alpha = dt / (rc + dt)
    out = np.zeros(len(sig))
    out[0] = sig[0]
    for i in range(1, len(sig)):
        out[i] = out[i-1] + alpha * (sig[i] - out[i-1])
    return out

def hpf(sig, cutoff=5000, fs=SR):
    """1-pole IIR highpass: removes low rumble"""
    return sig - lpf(sig, cutoff, fs)

# ---- Synthesizers ----
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
    """Bandlimited sawtooth: polynomial + PolyBLEP, then lowpass"""
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    # Bandlimited sawtooth: 2*(t*freq % 1) - 1 with lowpass
    raw = 2.0*(t*freq % 1.0) - 1.0
    # Lowpass at 2800 Hz: removes aliasing artifacts above Nyquist
    wave = lpf(raw, cutoff=2800)
    env=np.exp(-t*6)
    return vol*wave*env

def bass_synth(freq, dur, vol=0.22):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    raw = 2*(t*freq%1)-1
    # Bass: lowpass at 800 Hz for warmth, no harsh highs
    wave = lpf(raw, cutoff=800)
    return vol*wave*np.exp(-t*1.8)

# ---- Drum voices ----
def kick(vol=0.45):
    n=int(SR*0.22); t=np.linspace(0,0.22,n,False)
    fe=150*np.exp(-t*25)+55
    return vol*np.sin(2*np.pi*fe*t)*np.exp(-t*12)

def snare(vol=0.30):
    """Snare: tone-heavy, minimal noise (noise causes harshness at 16kbps)"""
    n=int(SR*0.20); t=np.linspace(0,0.20,n,False)
    # More tone, less noise
    tone=0.8*np.sin(2*np.pi*200*t)*np.exp(-t*15)
    # Heavily filtered noise (only 20% of signal)
    raw_noise=0.2*np.random.randn(n)*np.exp(-t*20)
    filtered_noise=lpf(raw_noise, cutoff=6000)
    return vol*(tone+filtered_noise)

def open_hihat(vol=0.14):
    """Open Hi-Hat: bandpass-filtered noise, no harsh white noise"""
    n=int(SR*0.35); t=np.linspace(0,0.35,n,False)
    raw=np.random.randn(n)*np.exp(-t*6)
    # Bandpass: 6000-9000 Hz gives metallic zing without harshness
    bp = lpf(raw, cutoff=9000)
    bp = bp - lpf(raw, cutoff=5000)  # highpass component
    # Normalize
    mag=np.max(np.abs(bp))+1e-9
    return vol*bp/mag

def closed_hihat(vol=0.08):
    """Closed Hi-Hat: short, filtered noise"""
    n=int(SR*0.06); t=np.linspace(0,0.06,n,False)
    raw=np.random.randn(n)*np.exp(-t*60)
    bp=lpf(raw, cutoff=8000)
    mag=np.max(np.abs(bp))+1e-9
    return vol*bp/mag

def china_crash(vol=0.18):
    """China crash: filtered noise, softer"""
    n=int(SR*0.4); t=np.linspace(0,0.4,n,False)
    raw=np.random.randn(n)*np.exp(-t*5)
    filtered=lpf(raw, cutoff=5000)
    mag=np.max(np.abs(filtered))+1e-9
    return vol*filtered/mag

def ride_cymbal(vol=0.15):
    """Ride cymbal: very soft filtered noise"""
    n=int(SR*0.3); t=np.linspace(0,0.3,n,False)
    raw=np.random.randn(n)*np.exp(-t*7)
    filtered=lpf(raw, cutoff=4500)
    mag=np.max(np.abs(filtered))+1e-9
    return vol*filtered/mag

def rev_cymbal(vol=0.28):
    n=int(SR*0.8); t=np.linspace(0,0.8,n,False)
    env=np.linspace(0,1,n)*np.exp(-t*3)
    raw=np.random.randn(n)*env
    # Reverse cymbal: lowpass to remove harshness
    filtered=lpf(raw, cutoff=5000)
    mag=np.max(np.abs(filtered))+1e-9
    return vol*filtered/mag

def save_mp3(sig, path):
    wav=path.replace('.mp3','.wav')
    sig=np.clip(sig,-1.0,1.0)
    wavfile.write(wav,SR,(sig*32767).astype(np.int16))
    subprocess.run(['ffmpeg','-y','-i',wav,'-b:a','16k','-ar','22050',path],capture_output=True)
    os.remove(wav)

nn=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def N(name):
    name=name.replace('b','#')
    oct=int(name[-1]); p=name[:-1]
    return 261.63*(2**((nn.index(p)+(oct-4)*12)/12.0))

# ---- MIDI-derived sequences ----
# Piano: 24-note pattern (from MIDI track 1)
P_SEQ=['C5','C6','F5','G5','B5','F5','G5','C6',None,'C6','F5','G5','B5','F5','G5',None,
       'C5','C6','F5','G5','B5','F5','G5','B5']

# Piano variant bars 36-40 (breakdown section)
P36=['G#4','D#5','A5','G#4','D#5','A5','D#5',None,'A#4','F5','B5','A#4','F5','B5','A#4',None]
P37=['F4','A#4','C5','F5','F4','A#4','C5','F5','F4','B4','C5','F5','A5','F5','C5','G#4']
P38=['C5','A#4','F5','C5','A#4','F5','C5','A#4','F5','C5','F5','G#4',None,None,None,None]

# Saw Lead patterns
SAW4=['G3','A#3','C4','D#4','D4','C4','A#3']
SAW56=['C4',None,None,None,None,None,None,None,'G3','A#3','C4','D#4','D4','C4','A#3']
SAW7=['D#4','F4','F4','D#4','G4','F4','D#4','F4','D#4']
SAW8=['G4','D#4','C4','D#4','G4','G4','D#4','C4','A#3']

# Guitar (rhythm doubles)
GUIT=[(0.,'C4','A#3'),(.5,'C4',None),(1.,'A#3',None),(1.75,'C4',None),
      (2.25,'C4',None),(2.5,'C4',None),(3.,'A#3',None)]
GB2=[(3.5,'D#4','C4')]

# Bass roots (4-bar cycle)
BROOT={0:N('C3'),1:N('D#3'),2:N('F3'),3:N('G#3')}

# ---- Percussion: extracted from MIDI (6 voices) ----
# Bar 8-11 pattern (16 slots per bar)
# C2=Kick, D2=Snare, D#1=OpenHH, D#2=ClosedHH, F#2=ChinaCrash, G#2=RideCymbal
PERC_PAT = [
    # slot: [('C2',...), ('D2',...), ...]
    # Each dict: voice -> list of 16ths where it plays
    # Pattern repeats every 4 bars (alternating snare emphasis)
]
# Extracted from MIDI:
# Bar 8:  K=[0,6],  SN=[],     OHH=[0,4,6,12,14], CHH=[],  CHI=[],  RID=[]
# Bar 9:  K=[4],    SN=[8],    OHH=[0,4,6,12,14], CHH=[],  CHI=[],  RID=[]
# Bar 10: K=[0,6],  SN=[],     OHH=[0,4,6,12,14], CHH=[],  CHI=[],  RID=[]
# Bar 11: K=[4],    SN=[8],    OHH=[0,4,6,12,14], CHH=[],  CHI=[],  RID=[]

# 4-bar percussion pattern aligned with original MIDI bar 8 pattern.
# Our bar5 = original bar8. Pattern cycle (offset 0 = our bar5 = orig bar8):
# orig bar8:  K=[0,6], SN=[],  OHH=[0,4,6,12,14] → our bar5
# orig bar9:  K=[4],   SN=[8], OHH=[0,4,6,12,14] → our bar6
# orig bar10: K=[0,6], SN=[],  OHH=[0,4,6,12,14] → our bar7
# orig bar11: K=[4],   SN=[8], OHH=[0,4,6,12,14] → our bar8
PERC_ALT = [
    {'K':[0,6],  'SN':[],  'OHH':[0,4,6,12,14], 'CHH':[], 'CHI':[], 'RID':[]},  # bar5
    {'K':[4],    'SN':[8], 'OHH':[0,4,6,12,14], 'CHH':[], 'CHI':[], 'RID':[]},  # bar6
    {'K':[0,6],  'SN':[],  'OHH':[0,4,6,12,14], 'CHH':[], 'CHI':[], 'RID':[]},  # bar7
    {'K':[4],    'SN':[8], 'OHH':[0,4,6,12,14], 'CHH':[], 'CHI':[], 'RID':[]},  # bar8
]

# ---- Organ: exact double-stop sequences from MIDI ----
# Each entry: (beat_pos, [note1, note2], duration_beats)
# Bar 33: G-G -> F-F -> D#-D# -> F-F -> D-D -> D#-D# -> D-D -> A#-A#
ORG_B33=[(0.00,['G5','G6'],0.25),(0.25,['F5','F6'],0.25),(0.50,['D#5','D#6'],0.25),
         (0.75,['F5','F6'],0.25),(1.00,['D5','D6'],0.25),(1.25,['D#5','D#6'],0.25),
         (1.50,['D5','D6'],0.25),(1.75,['A#4','A#5'],0.25)]
ORG_B34=[(0.00,['G4','G5'],0.25),(0.25,['C5','C6'],0.25),(0.50,['C5','C6'],0.25),
         (0.75,['A#4','A#5'],0.25),(1.50,['C5','C6'],0.25),(1.75,['D5','D6'],0.25)]
ORG_B35=[(1.50,['C5','C6'],0.25),(1.75,['D5','D6'],0.25)]
ORG_B36=[(0.00,['D#5','D#6'],0.25),(0.75,['F5','F6'],0.25),(1.50,['G5','G6'],0.25)]
ORG_B37=[(0.00,['D5','D6'],0.25),(0.25,['D#5','D#6'],0.25),(0.50,['D5','D6'],0.25),
         (0.75,['C5','C6'],0.25),(1.50,['A#4','A#5'],0.25)]
ORG_B38=[(0.00,['C5','C6'],0.25),(0.25,['F4','F5'],0.25),(0.50,['C5','F5'],0.25),
         (0.75,['C6','F4'],0.25),(1.00,['C5','C6'],0.25),(1.25,['F4','F5'],0.25),
         (1.50,['C5','F5'],0.25),(1.75,['C6','F4'],0.25)]
ORG_B39=[(0.00,['G5','G6'],0.25)]
ORG_B40=[(0.00,['G5','G6'],0.25)]
ORG_B41=[(0.25,['F5','F6'],0.25),(0.50,['D#5','D#6'],0.25),(0.75,['F5','F6'],0.25),
         (1.00,['D5','D6'],0.25),(1.25,['D#5','D#6'],0.25),(1.50,['D5','D6'],0.25),(1.75,['A#4','A#5'],0.25)]
ORG_B42=[(0.00,['G4','G5'],0.25),(0.25,['C5','C6'],0.25),(0.50,['C5','C6'],0.25),
         (0.75,['A#4','A#5'],0.25),(1.50,['C5','C6'],0.25)]
ORG_B43=[(1.50,['C5','C6'],0.25),(1.75,['D5','D6'],0.25)]
ORG_B44=[(0.00,['D#5','D#6'],0.25),(0.75,['F5','F6'],0.25),(1.50,['G5','G6'],0.25)]
ORG_B45=[(0.00,['D5','D6'],0.25),(0.25,['D#5','D#6'],0.25),(0.50,['D5','D6'],0.25),
         (0.75,['C5','C6'],0.25),(1.50,['A#4','A#5'],0.25)]
ORG_B46=[(0.00,['C5','C6'],0.25)]

# ---- Violin: exact chords from MIDI ----
# Each entry: (beat_in_bar, [note1, note2, note3], sustain_beats)
VIOLINS=[
    (36,(0.,['G4','A#3','C#4'],2.)),
    (37,(0.,['C4','G#4','D#4'],2.)),
    (38,(0.,['D#4'],2.)),
    (39,(0.,['G4'],2.)),
    (44,(0.,['G4','A#3','C#4'],2.)),
    (45,(0.,['G#4','C4','D#4'],2.)),
    (64,(0.,['C#4','F4','G#4'],2.)),
    (68,(0.,['C#4','F4','G#4'],2.)),
    (69,(0.,['C4','G#3','D#4'],2.)),
    (72,(0.,['F4','G#4','C#4'],2.)),
    (74,(0.,['F4'],2.)),
    (76,(0.,['F#3','A#3','C#4'],2.)),
    (77,(0.,['F3','C4','G#3'],2.)),
    (78,(0.,['F#3','D3','A#3'],2.)),
    (80,(0.,['A#3','F4'],2.)),
]

# ---- Sine: exact sequence from MIDI (bar 82) ----
SINE_SEQ=[(0.,'G5',0.5),(0.5,'D6',0.5),(1.0,'G5',0.5),(1.5,'F6',0.5),
          (2.0,'G6',0.5),(2.5,'G6',0.5),(3.0,'G6',0.5),(3.5,'G6',0.5)]

# ---- Harp: exact sequence from MIDI ----
HARP_SEQ=[('C4',1.),('D#4',1.),('G4',1.),('A#4',1.),
          ('A#3',1.),('D4',1.),('G4',1.),('A#4',1.),
          ('C4',1.),(None,1.),('D4',1.),('F4',1.),('A#4',0.),
          ('C4',0.5),('D#4',0.5),('G4',0.5),('A#4',0.5),
          ('A#3',1.),('D4',1.),('G4',1.),('A#4',1.),
          ('C4',1.),('D4',1.),('F4',0.5),('D#4',0.5)]

# ---- Reverse Cymbal timings (bar 8, 32, 48, 64, 82 = t=14,62,94,128,164) ----
RC_TIMES=[7., 31., 47., 63., 83.]

# ============================================================
print("\n-- Brainiac Maniac v4 (Full Ensemble) --")
DUR=48.; NB=int(DUR/BAR); L=int(SR*DUR)+SR

po=np.zeros(L); go=np.zeros(L); bo=np.zeros(L)
dro=np.zeros(L); so=np.zeros(L); oo=np.zeros(L); co=np.zeros(L)
vio=np.zeros(L); sineo=np.zeros(L); harpo=np.zeros(L)

def pl(arr,sig,t):
    s=int(SR*t); e=min(s+len(sig),L)
    if s<L: arr[s:e]+=sig[:e-s]

# ---- PIANO ----
print("  [1] Piano (background texture)...")
for bar in range(1, NB+1):
    tb=(bar-1)*BAR
    if tb>DUR: break
    # Piano is texture, not lead: moderate in intro, ducks when leads enter
    if bar <= 4:
        seq = P_SEQ; v = 0.28
    elif bar >= 36 and bar <= 36:
        seq = P36; v = 0.20
    elif bar >= 37 and bar <= 37:
        seq = P37; v = 0.20
    elif bar >= 38 and bar <= 38:
        seq = P38; v = 0.20
    else:
        seq = P_SEQ; v = 0.18
    for i,n in enumerate(seq):
        if n: pl(po,piano(N(n),S16*0.75,v),tb+i*S16)

# ---- GUITAR ----
print("  [2] Guitar (rhythm, enters bar 1)...")
for bar in range(1, NB+1):
    tb=(bar-1)*BAR
    if tb>DUR: continue
    for bp,n1,n2 in GUIT:
        t=tb+bp*BEAT
        if n1: pl(go,piano(N(n1),BEAT*0.38,0.12),t)
        if n2: pl(go,piano(N(n2),BEAT*0.38,0.10),t)
    if bar==2:
        for bp,n1,n2 in GB2:
            t=tb+bp*BEAT
            if n1: pl(go,piano(N(n1),BEAT*0.38,0.11),t)
            if n2: pl(go,piano(N(n2),BEAT*0.38,0.09),t)

# ---- SAW LEAD ----
print("  [3] Saw Lead...")
# Bar 4后半
for i,n in enumerate(SAW4): pl(so,saw_lead(N(n),S16*1.5,0.10),4*BAR+(7+i)*S16)
# Bar 5-6
for bar in [5,6]:
    tb=(bar-1)*BAR
    for i,n in enumerate(SAW56):
        if n: pl(so,saw_lead(N(n),S16*1.5,0.09),tb+i*S16)
# Bar 7-12
for bar in range(7,13):
    tb=(bar-1)*BAR
    if tb>DUR: break
    pat=SAW7 if bar%2==1 else SAW8
    for i,n in enumerate(pat):
        if n: pl(so,saw_lead(N(n),S16*1.5,0.11),tb+i*S16)

# ---- BASS ----
print("  [4] Bass (with passing tones)...")
for bar in range(5, NB+1):
    tb=(bar-1)*BAR
    if tb>DUR: break
    cy=(bar-1)%4
    if cy in BROOT: pl(bo,bass_synth(BROOT[cy],BAR*0.75,0.18),tb)

# ---- PERCUSSION (6 voices) ----
print("  [5] Percussion (6 voices)...")
for bar in range(5, NB+1):
    tb=(bar-1)*BAR
    if tb>DUR: break
    pat_idx=(bar-5)%4
    p=PERC_ALT[pat_idx]
    for slot in range(16):
        t=tb+slot*S16
        if slot in p['OHH']: pl(dro,open_hihat(0.12),t)
        if slot in p['CHH']: pl(dro,closed_hihat(0.07),t)
        if slot in p['K']:    pl(dro,kick(0.42),t)
        if slot in p['SN']:  pl(dro,snare(0.28),t)
        if slot in p['CHI']: pl(dro,china_crash(0.15),t)
        if slot in p['RID']: pl(dro,ride_cymbal(0.12),t)

# ---- ORGAN (double-stop chords) ----
# Original MIDI organ: bars 33-46 (t=64-92s). Our DUR=48s covers bars 1-24 (t=0-48s).
# Original bar 32 = t=64s > DUR=48s. We compress organ to start at bar 17 (t=32s).
# Each original bar maps to 0.5 v4 bars.
# So: MIDI bar 33→v4 bar 17, MIDI bar 34→v4 bar 17.5, etc.
print("  [6] Organ (double-stop chords)...")
organ_v4_bars = {
    17: ORG_B33, 17.5: ORG_B34, 18.0: ORG_B35, 18.5: ORG_B36,
    19.0: ORG_B37, 19.5: ORG_B38, 20.0: ORG_B39, 20.5: ORG_B40,
    21.0: ORG_B41, 21.5: ORG_B42, 22.0: ORG_B43, 22.5: ORG_B44,
    23.0: ORG_B45, 23.5: ORG_B46,
}
for bar_f, seq in organ_v4_bars.items():
    tb = bar_f * BAR
    if tb > DUR: continue
    for bp, notes, dur_beats in seq:
        t = tb + bp * BEAT
        if t > DUR: continue
        for n in notes:
            pl(oo, organ(N(n), dur_beats * BEAT * 0.80, 0.09), t)

# ---- VIOLINS (string pad) ----
# Original violin bars 36-45 (t=72-90s). Compress to v4 bars 18-23 (t=36-46s).
# MIDI bar 36→v4 bar 18, MIDI bar 37→v4 bar 18.5, etc.
print("  [7] Violins (string pads)...")
violin_v4 = [
    (18.0, (0., ['G4','A#3','C#4'], 1.5)),
    (18.5, (0., ['C4','G#4','D#4'], 1.5)),
    (19.0, (0., ['D#4'], 1.5)),
    (19.5, (0., ['G4'], 1.5)),
    (20.0, (0., ['G4','A#3','C#4'], 1.5)),
    (20.5, (0., ['G#4','C4','D#4'], 1.5)),
]
for bar_f, (beat_off, notes, dur_beats) in violin_v4:
    tb = bar_f * BAR
    if tb > DUR: continue
    t = tb + beat_off * BEAT
    for n in notes:
        pl(vio, violins(N(n), dur_beats * BEAT * 0.9, 0.09), t)

# ---- HARP (arpeggio pluck) ----
# Place harp as bridge texture at v4 bars 17-20 (t=32-40s), between organ entries
print("  [8] Harp (arpeggio)...")
harp_v4 = [
    (17,0.,'C4',0.5),(17,0.5,'D#4',0.5),(17,1.,'G4',0.5),(17,1.5,'A#4',0.5),
    (17,2.,'A#3',0.5),(17,2.5,'D4',0.5),(17,3.,'G4',0.5),(17,3.5,'A#4',0.5),
    (18,0.,'C4',0.5),(18,0.5,'D#4',0.5),(18,1.,'G4',0.5),(18,1.5,'A#4',0.5),
    (18,2.,'A#3',0.5),(18,2.5,'D4',0.5),(18,3.,'G4',0.5),(18,3.5,'A#4',0.5),
    (19,0.,'C4',0.5),(19,0.5,'D#4',0.5),(19,1.,'G4',0.5),(19,1.5,'A#4',0.5),
    (19,2.,'A#3',0.5),(19,2.5,'D4',0.5),(19,3.,'G4',0.5),(19,3.5,'A#4',0.5),
    (20,0.,'F#3',0.5),(20,0.5,'A#3',0.5),(20,1.,'C#4',0.5),(20,1.5,'F4',0.5),
    (20,2.,'C#4',0.5),(20,2.5,'F4',0.5),(20,3.,'G#4',0.5),(20,3.5,'C5',0.5),
]
for bar_off, beat_off, n, dur_beats in harp_v4:
    tb = (bar_off - 1) * BAR
    t = tb + beat_off * BEAT
    if t > DUR: continue
    if n: pl(harpo, harp(N(n), dur_beats * BEAT * 0.7, 0.09), t)

# ---- SINE (high shimmer) ----
# Place sine shimmer in v4 bars 42-48 (t=84-96s), bright ending section
print("  [9] Sine (high shimmer)...")
sine_v4 = [
    (42,0.,'G5',0.5),(42,0.5,'D6',0.5),(42,1.,'G5',0.5),(42,1.5,'F6',0.5),
    (43,0.,'G6',0.5),(43,0.5,'G6',0.5),(43,1.,'G6',0.5),(43,1.5,'G6',0.5),
    (44,0.,'G6',0.5),(44,0.5,'G6',0.5),(44,1.,'G6',0.5),(44,1.5,'F6',0.5),
    (45,0.,'G6',0.5),(45,0.5,'D6',0.5),(45,1.,'G5',0.5),(45,1.5,'F6',0.5),
    (46,0.,'G6',0.5),(46,0.5,'G6',0.5),(46,1.,'G6',0.5),(46,1.5,'G6',0.5),
    (47,0.,'G6',0.5),(47,0.5,'G6',0.5),(47,1.,'G6',0.5),(47,1.5,'G6',0.5),
    (48,0.,'G6',0.5),(48,0.5,'G6',0.5),(48,1.,'G6',0.5),(48,1.5,'G6',0.5),
]
for bar_off, beat_off, n, dur_beats in sine_v4:
    tb = (bar_off - 1) * BAR
    t = tb + beat_off * BEAT
    if t > DUR: continue
    pl(sineo, sine_high(N(n), dur_beats * BEAT * 0.8, 0.06), t)

# ---- REVERSE CYMBAL ----
print("  [10] Reverse Cymbal...")
for t in RC_TIMES:
    if t<DUR: pl(co,rev_cymbal(0.25),t)

# ---- FADE-IN RAMPS ----
def ri(sig,sb,d=2):
    a=sig.copy(); n=len(a)
    fs=int(SR*(sb-1)*BAR); fl=int(SR*d*BAR)
    r=np.ones(n)
    if fs >= n: return sig*r
    fe=min(fs+fl,n)
    r[:fs]=0
    if fe>fs: r[fs:fe]=np.linspace(0,1,fe-fs)
    return sig*r

go=ri(go,1); so=ri(so,4); dro=ri(dro,5); bo=ri(bo,5)
oo=ri(oo,17,3); vio=ri(vio,18,2); harpo=ri(harpo,17,2); sineo=ri(sineo,42,2)

# ---- MIX ----
print("  Mixing...")
# Base mix: melody leads, percussion supports (no harsh noise dominance)
final=(po*0.22 + go*0.42 + so*0.52 + dro*0.38 + bo*0.52 +
       oo*0.40 + vio*0.48 + harpo*0.30 + sineo*0.36 + co*0.22)

# Dynamic gain envelope with per-bar balance
for i in range(len(final)):
    t=i/SR; bar=t/BAR
    if bar<4:
        g=0.75+bar*0.04
    elif bar<8:
        # Band enters, drums balanced but not dominant
        g=0.88+(bar-4)*0.04
    elif bar<12:
        g=1.0+(bar-8)*0.03
    elif bar<17:
        g=1.12
    elif bar<20:
        # Organ section: orchestral blend, drums recede
        g=1.10+(bar-17)*0.03
    elif bar<24:
        g=1.20+(bar-20)*0.03
    else:
        g=1.25
    final[i]*=min(g,1.0)

# Final fadeout
for i in range(len(final)):
    t=i/SR
    if t>DUR-4: final[i]*=max(0,(DUR-t)/4.0)

peak=np.max(np.abs(final))
if peak>0: final=final/peak*0.88

out='/Users/jacob/WorkBuddy/20260418131907/game_bgm/brainiac_maniac.mp3'
save_mp3(final,out)
sz=os.path.getsize(out)
print(f"\n  [OK] brainiac_maniac.mp3  ({sz/1024:.1f} KB)")
print(f"  {DUR:.0f}s | 16kbps | Bars:")
print(f"  1-4:  Piano solo")
print(f"  5-6:  +Guitar+Drums+Bass+Saw")
print(f"  7-12: Full lead section")
print(f"  13-16:Full ensemble")
print(f"  17-20:Organ double-stops +Violins+Harp bridge")
print(f"  21-24:Climax with string pads +Sine shimmer")
print(f"  44-48s: Fadeout")
print("Done!")
