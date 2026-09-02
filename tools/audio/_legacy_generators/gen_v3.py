#!/usr/bin/env python3
"""Brainiac Maniac - 高保真重建版 BPM:120 时长:64s ~100KB"""
import numpy as np
from scipy.io import wavfile
import subprocess, os

SR = 22050
BPM=120.0; BEAT=60.0/BPM; BAR=BEAT*4; S16=BEAT/4

def piano(freq, dur, vol=0.35):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    wave=(1.0*np.sin(2*np.pi*freq*t)+0.5*np.sin(2*np.pi*freq*2*t)+
          0.25*np.sin(2*np.pi*freq*3*t)+0.12*np.sin(2*np.pi*freq*4*t)+
          0.06*np.sin(2*np.pi*freq*5*t))
    a,d,r=int(SR*0.003),int(SR*0.04),int(SR*0.12)
    s=max(0,n-a-d-r)
    env=np.concatenate([np.linspace(0,1,a),np.linspace(1,0.3,d),np.ones(s)*0.3,np.linspace(0.3,0,r)])
    env=np.pad(env,(0,max(0,n-len(env))))[:n]
    return vol*wave*env

def saw_lead(freq, dur, vol=0.12):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    wave=2*(t*freq%1)-1; env=np.exp(-t*6)
    return vol*wave*env

def organ(freq, dur, vol=0.12):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    wave=(0.6*np.sin(2*np.pi*freq*t)+0.3*np.sin(2*np.pi*freq*2*t)+
          0.15*np.sin(2*np.pi*freq*3*t)+0.08*np.sin(2*np.pi*freq*4*t))
    return vol*wave*np.ones(n)*0.9

def kick(vol=0.45):
    n=int(SR*0.22); t=np.linspace(0,0.22,n,False)
    fe=150*np.exp(-t*25)+55
    return vol*np.sin(2*np.pi*fe*t)*np.exp(-t*12)

def hihat(vol=0.07):
    n=int(SR*0.04); t=np.linspace(0,0.04,n,False)
    return vol*np.random.randn(n)*np.exp(-t*70)

def hitom(vol=0.18):
    n=int(SR*0.12); t=np.linspace(0,0.12,n,False)
    return vol*np.sin(2*np.pi*130*t)*np.exp(-t*20)

def bass_synth(freq, dur, vol=0.22):
    n=int(SR*dur); t=np.linspace(0,dur,n,False)
    return vol*(2*(t*freq%1)-1)*np.exp(-t*1.5)

def rev_cymbal(vol=0.3):
    n=int(SR*0.8); t=np.linspace(0,0.8,n,False)
    return vol*np.random.randn(n)*(np.linspace(0,1,n)*np.exp(-t*3))

def save_mp3(sig, path):
    wav=path.replace('.mp3','.wav')
    sig=np.clip(sig,-1.0,1.0)
    wavfile.write(wav,SR,(sig*32767).astype(np.int16))
    subprocess.run(['ffmpeg','-y','-i',wav,'-b:a','16k','-ar','22050',path],capture_output=True)
    os.remove(wav)

nn=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def N(name):
    name=name.replace('b','#').replace('Cb','B').replace('Fb','E')
    n=name.strip(); oct=int(n[-1]); p=n[:-1]
    idx=nn.index(p); sem=idx+(oct-4)*12
    return 261.63*(2**(sem/12.0))

# Piano: 15 notes per bar, 2x 480tick rests
P_SEQ=['C5','C6','F5','G5','B5','F5','G5','C6',None,'C6','F5','G5','B5','F5','G5',None,'C5','C6','F5','G5','B5','F5','G5','B5']
# Saw Lead patterns
SAW4=['G3','A#3','C4','D#4','D4','C4','A#3']
SAW56=['C4',None,None,None,None,None,None,None,'G3','A#3','C4','D#4','D4','C4','A#3']
SAW7=['D#4','F4','F4','D#4','G4','F4','D#4','F4','D#4']
SAW8=['G4','D#4','C4','D#4','G4','G4','D#4','C4','A#3']
# Guitar
GUIT=[(0.,'C4','A#3'),(.5,'C4',None),(1.,'A#3',None),(1.75,'C4',None),(2.25,'C4',None),(2.5,'C4',None),(3.,'A#3',None)]
GB2=[(3.5,'D#4','C4')]
# Bass roots
BROOT={0:N('C3'),1:N('D#3'),2:N('F3'),3:N('G#3')}
# Drums
DK=[0,3,4,7,8,11,12,14,15]
DT=[1,3,6,8,10,11,13,14]
DH=[2,6,10,14]
# Organ
OB25=['C4','A#3','C4','A#3','C4','A#3','C4','A#3','D4','C4','D4','D#4','F4','D4',None,'D#4']
OB26=['D#4',None,'D4',None,'C4',None,'A#3','G3','A#3']
OB27=['C4','A#3','C4','A#3','C4','A#3','C4','A#3','D4','C4','D4','C4','D4','C4',None,'C4']
OB28=['D#4','D4','D#4','F4','G4','F4','D#4','D4','D#4','D4','C4','A#3','C4','A#3','C4','A#3']
RC=[7.,31.,47.,63.,83.]

print("\n-- Brainiac Maniac (Hi-Fi) --")
DUR=48.; NB=int(DUR/BAR); L=int(SR*DUR)+SR
po=np.zeros(L); go=np.zeros(L); bo=np.zeros(L)
dro=np.zeros(L); so=np.zeros(L); oo=np.zeros(L); co=np.zeros(L)

def pl(arr,sig,t):
    s=int(SR*t); e=min(s+len(sig),L)
    if s<L: arr[s:e]+=sig[:e-s]

# Piano
print("  [1] Piano...")
for bar in range(1,NB+1):
    tb=(bar-1)*BAR; v=0.28 if bar<5 else 0.32
    for i,n in enumerate(P_SEQ):
        if n: pl(po,piano(N(n),S16*0.75,v),tb+i*S16)

# Guitar
print("  [2] Guitar...")
for bar in range(1,NB+1):
    tb=(bar-1)*BAR
    if bar<2: continue
    for bp,n1,n2 in GUIT:
        t=tb+bp*BEAT
        if n1: pl(go,piano(N(n1),BEAT*0.4,0.10),t)
        if n2: pl(go,piano(N(n2),BEAT*0.4,0.08),t)
    if bar==2:
        for bp,n1,n2 in GB2:
            t=tb+bp*BEAT
            if n1: pl(go,piano(N(n1),BEAT*0.4,0.09),t)
            if n2: pl(go,piano(N(n2),BEAT*0.4,0.07),t)

# Saw Lead
print("  [3] Saw Lead...")
for i,n in enumerate(SAW4): pl(so,saw_lead(N(n),S16*1.5,0.10),4*BAR+(7+i)*S16)
for bar in [5,6]:
    tb=(bar-1)*BAR
    for i,n in enumerate(SAW56):
        if n: pl(so,saw_lead(N(n),S16*1.5,0.09),tb+i*S16)
for bar in range(7,13):
    tb=(bar-1)*BAR
    pat=SAW7 if bar%2==1 else SAW8
    for i,n in enumerate(pat):
        if n: pl(so,saw_lead(N(n),S16*1.5,0.11),tb+i*S16)

# Bass
print("  [4] Bass...")
for bar in range(5,NB+1):
    tb=(bar-1)*BAR
    if tb>DUR: break
    cy=(bar-1)%4
    if cy in BROOT: pl(bo,bass_synth(BROOT[cy],BAR*0.8,0.20),tb)

# Drums
print("  [5] Drums...")
for bar in range(5,NB+1):
    tb=(bar-1)*BAR
    if tb>DUR: break
    for i in range(16): pl(dro,hihat(0.05),tb+i*S16)
    for i in DK: pl(dro,kick(0.42),tb+i*S16)
    for i in DT: pl(dro,hitom(0.16),tb+i*S16)
    for i in DH: pl(dro,hihat(0.06),tb+i*S16)

# Organ
print("  [6] Organ...")
for bar in [21,22,23,24]:
    tb=(bar-1)*BAR
    if tb>DUR: break
    seq=OB25 if bar==21 else OB26 if bar==22 else OB27 if bar==23 else OB28
    for i,n in enumerate(seq):
        if n: pl(oo,organ(N(n),S16*0.8,0.10),tb+i*S16)

# Reverse Cymbal
print("  [7] Reverse Cymbal...")
for t in RC:
    if t<DUR: pl(co,rev_cymbal(0.25),t)

def ri(sig,sb,d=2):
    a=sig.copy(); n=len(a)
    fs=int(SR*(sb-1)*BAR); fl=int(SR*d*BAR)
    r=np.ones(n); r[:fs]=0
    fe=min(fs+fl,n); r[fs:fe]=np.linspace(0,1,fe-fs)
    return sig*r

go=ri(go,2); so=ri(so,4); dro=ri(dro,5); bo=ri(bo,5); oo=ri(oo,21)

print("  Mixing...")
final=(po*0.60+go*0.35+so*0.55+dro*0.60+bo*0.65+oo*0.45+co*0.35)
for i in range(len(final)):
    t=i/SR; bar=t/BAR
    g=(0.50+bar*0.07 if bar<4 else 0.78+(bar-4)*0.03 if bar<8 else
       0.90+(bar-8)*0.03 if bar<12 else 1.0 if bar<21 else
       1.0+(bar-21)*0.05 if bar<24 else 1.2)
    final[i]*=min(g,1.0)
for i in range(len(final)):
    t=i/SR
    if t>DUR-4: final[i]*=max(0,(DUR-t)/4.0)
peak=np.max(np.abs(final))
if peak>0: final=final/peak*0.88

out='/Users/jacob/WorkBuddy/20260418131907/game_bgm/brainiac_maniac.mp3'
save_mp3(final,out)
sz=os.path.getsize(out)
print(f"\n  [OK] brainiac_maniac.mp3  ({sz/1024:.1f} KB)")
print(f"  {DUR:.0f}s | 16kbps | Bars 1-4 Piano, 5-6 +G+B+S+D, 7-12+S2")
print(f"  Bars 13-20 full, 21-24 +Organ, climax+fadeout")
print("Done!")
