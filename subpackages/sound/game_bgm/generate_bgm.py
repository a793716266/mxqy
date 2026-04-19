"""
奇幻/魔法风格游戏 BGM 生成器 v2（内存优化版）
5 首 BGM：主菜单、战斗、探索、Boss战、胜利
"""

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
import os

SR = 44100
OUT = os.path.dirname(os.path.abspath(__file__))
MAX_RAM = 6 * 1024 * 1024  # 6MB 安全上限

def dur2n(d):
    return int(SR * d)

def note(name, octave=4):
    semitones = {'C':-9,'D':-7,'E':-5,'F':-4,'G':-2,'A':0,'B':2,
                 'Db':-8,'Eb':-6,'Gb':-3,'Ab':-1,'Bb':1,'F#':1,'C#':1}
    s = semitones.get(name, 0)
    return 440.0 * (2 ** ((12*(octave+1)+s-69)/12))

def note_list(lst):
    return [note(n,o) for n,o in lst]

def n2f(name, octaves=None):
    """简写：'D6' -> note('D',6)"""
    if octaves is None:
        for i in range(8,2,-1):
            if name.endswith(str(i)):
                return note(name[:-1], i)
        return note(name, 4)
    return note(name, octaves)

def silence(sec):
    return np.zeros(dur2n(sec), dtype=np.float32)

def mix32(*sigs):
    """混合信号，统一 float32"""
    max_len = max(len(s) for s in sigs)
    out = np.zeros(max_len, dtype=np.float32)
    for s in sigs:
        out[:len(s)] += s.astype(np.float32)
    return out

def concat32(*sigs):
    return np.concatenate([s.astype(np.float32) for s in sigs])

def append(sig, *new):
    return concat32(sig, *new)

def fade_in(sig, t):
    n = min(dur2n(t), len(sig)//4)
    s = sig.copy().astype(np.float32)
    s[:n] *= np.linspace(0,1,n)
    return s

def fade_out(sig, t):
    n = min(dur2n(t), len(sig)//4)
    s = sig.copy().astype(np.float32)
    s[-n:] *= np.linspace(1,0,n)
    return s

def save_mp3(sig, path):
    peak = np.max(np.abs(sig))
    if peak > 0:
        sig = sig / peak * 0.85
    wav = (sig * 32767).astype(np.int16)
    tmp = path.replace('.mp3','_t.wav')
    wavfile.write(tmp, SR, wav)
    os.system(f'ffmpeg -y -i "{tmp}" -codec:a libmp3lame -qscale:a 2 "{path}" 2>/dev/null')
    os.remove(tmp)

def export(sig, filename):
    print(f"  ✓ {filename}")
    save_mp3(sig.astype(np.float32), filename)

# ── 振荡器 ────────────────────────────────────────────────────────────

def sine(f, dur, amp=1.0):
    t = np.linspace(0, dur, dur2n(dur), endpoint=False)
    return (amp * np.sin(2*np.pi*f*t)).astype(np.float32)

def saw(f, dur, amp=1.0):
    t = np.linspace(0, dur, dur2n(dur), endpoint=False)
    return (amp * (2*(t*f % 1) - 1)).astype(np.float32)

def tri(f, dur, amp=1.0):
    t = np.linspace(0, dur, dur2n(dur), endpoint=False)
    p = (t*f) % 1
    return (amp*(4*np.abs(p-0.5)-1)).astype(np.float32)

def noise(dur, amp=1.0):
    return (np.random.randn(dur2n(dur))*amp).astype(np.float32)

def lp(sig, cutoff, order=4):
    sos = butter(order, cutoff/(SR/2), btype='low', output='sos')
    return sosfilt(sos, sig).astype(np.float32)

def hp(sig, cutoff, order=4):
    sos = butter(order, cutoff/(SR/2), btype='high', output='sos')
    return sosfilt(sos, sig).astype(np.float32)

def bp(sig, lo, hi, order=4):
    sos = butter(order, [lo/(SR/2), hi/(SR/2)], btype='band', output='sos')
    return sosfilt(sos, sig).astype(np.float32)

# ── 合成器 ─────────────────────────────────────────────────────────────

def pluck(f, dur, a=0.003, r=None):
    if r is None: r = dur*0.35
    t = np.linspace(0, dur, dur2n(dur), endpoint=False)
    w = saw(f, dur)*0.6 + tri(f*0.5, dur)*0.3
    env = np.exp(-t/(dur*0.12))
    env2 = np.where(t < a, t/a, np.exp(-(t-a)/(r)) * np.exp(-a/r*0.1))
    env2 = np.minimum(env, env2[:len(env)])
    # ADSR envelope
    ai = dur2n(a); ri = dur2n(r); di = max(0, dur2n(dur)-ai-ri)
    adsr_env = np.concatenate([np.ones(ai)*1, np.linspace(1,0.3,di), np.zeros(ri)])
    adsr_env = np.pad(adsr_env, (0, max(0,len(t)-len(adsr_env))))[:len(t)]
    return (w * adsr_env * env).astype(np.float32)

def string_pad(freqs, dur, amp=0.25, a=0.2, r=None):
    if r is None: r = dur*0.3
    waves = [sine(f, dur)*0.5 + tri(f*2, dur)*0.25 for f in freqs]
    combined = mix32(*waves) if waves else silence(dur)
    ai=dur2n(a); ri=dur2n(r); di=max(0,dur2n(dur)-ai-ri)
    adsr_env = np.concatenate([np.linspace(0,1,ai), np.linspace(1,0.6,di), np.linspace(0.6,0,ri)])
    adsr_env = np.pad(adsr_env,(0,max(0,dur2n(dur)-len(adsr_env))))[:dur2n(dur)]
    return lp(combined * adsr_env * amp, 2500).astype(np.float32)

def bell(f, dur, amp=0.5):
    t = np.linspace(0, dur, dur2n(dur), endpoint=False)
    sig = sine(f, dur)*0.5 + sine(f*2.756, dur)*0.3 + sine(f*5.404, dur)*0.1
    env = np.exp(-t*(2.5 + f/2500))
    return (sig*env*amp).astype(np.float32)

def lead(f, dur, amp=0.5):
    w = saw(f, dur)*0.7 + saw(f*1.004, dur)*0.3
    w = lp(w, 2200)
    ai=dur2n(0.01); ri=dur2n(dur*0.3); di=max(0,dur2n(dur)-ai-ri)
    adsr_env = np.concatenate([np.linspace(0,1,ai), np.linspace(1,0.7,di), np.linspace(0.7,0,ri)])
    adsr_env = np.pad(adsr_env,(0,max(0,dur2n(dur)-len(adsr_env))))[:dur2n(dur)]
    return (w*adsr_env*amp).astype(np.float32)

def bass_fn(f, dur, amp=0.6):
    w = sine(f, dur)*0.5 + saw(f, dur, amp=0.4)*0.4
    w = lp(w, 350)
    ai=dur2n(0.005); ri=dur2n(dur*0.2); di=max(0,dur2n(dur)-ai-ri)
    adsr_env = np.concatenate([np.linspace(0,1,ai), np.linspace(1,0.6,di), np.linspace(0.6,0,ri)])
    adsr_env = np.pad(adsr_env,(0,max(0,dur2n(dur)-len(adsr_env))))[:dur2n(dur)]
    return (w*adsr_env*amp).astype(np.float32)

# ── 鼓 ───────────────────────────────────────────────────────────────

def kick_fn(dur=0.25, pitch=55):
    t = np.linspace(0, dur, dur2n(dur), endpoint=False)
    f = pitch * np.exp(-t/0.012)
    ph = np.cumsum(2*np.pi*f/SR)
    w = np.sin(ph).astype(np.float32)
    env = np.exp(-t*18).astype(np.float32)
    return (w*env).astype(np.float32)

def snare_fn(dur=0.14):
    t = np.linspace(0, dur, dur2n(dur), endpoint=False)
    nse = np.random.randn(dur2n(dur))*np.exp(-t*22)
    body = np.sin(2*np.pi*200*t)*np.exp(-t*28)
    return (hp(nse.astype(np.float32), 200)*0.6 + body.astype(np.float32)*0.5).astype(np.float32)

def hat_c(dur=0.05):
    t = np.linspace(0, dur, dur2n(dur), endpoint=False)
    nse = np.random.randn(dur2n(dur))*np.exp(-t*70)
    return (hp(nse.astype(np.float32), 5000)*0.35).astype(np.float32)

def hat_o(dur=0.18):
    t = np.linspace(0, dur, dur2n(dur), endpoint=False)
    nse = np.random.randn(dur2n(dur))*np.exp(-t*11)
    return (hp(nse.astype(np.float32), 2800)*0.3).astype(np.float32)

def clap_fn(dur=0.12):
    t = np.linspace(0, dur, dur2n(dur), endpoint=False)
    nse = np.random.randn(dur2n(dur))
    env = np.exp(-t*18)
    burst = np.exp(-(t % 0.01)*180)
    nse *= env*(1 + burst*2.5)
    return (hp(nse.astype(np.float32), 300)*0.75).astype(np.float32)

# ── 和弦工具 ──────────────────────────────────────────────────────────

def ch(name, oct=4):
    """返回和弦内音频率列表"""
    root = name[0]
    rest = name[1:]
    c_map = {'maj':[0,4,7],'min':[0,3,7],'m':[0,3,7],'dim':[0,3,6],
             'aug':[0,4,8],'sus2':[0,2,7],'sus4':[0,5,7],
             'maj7':[0,4,7,11],'min7':[0,3,7,10],'7':[0,4,7,10]}
    intervals = [0]
    for k,v in c_map.items():
        if rest.startswith(k): intervals=v; break
    flat_map = {'Db':1,'Eb':3,'Gb':6,'Ab':8,'Bb':10,'F#':6,'C#':1,'D#':4}
    sem = {'C':-9,'D':-7,'E':-5,'F':-4,'G':-2,'A':0,'B':2}
    sem.update(flat_map)
    s = sem[root]
    return [440.0*2**((s+b-9)/12+(oct-4)) for b in intervals]

# ── 节拍工具 ──────────────────────────────────────────────────────────

def build_pattern(bars, beat, steps=8, fn_kick=None, fn_snare=None, fn_hat=None):
    """构建鼓组节拍，返回信号列表 [(onset_sec, sig), ...]"""
    events = []
    bar_dur = beat*4
    step_dur = bar_dur/steps
    for bar_i in range(bars):
        for step in range(steps):
            t = bar_i*bar_dur + step*step_dur
            if fn_kick and step % (steps//2) == 0:
                events.append((t, fn_kick()))
            if fn_snare:
                if isinstance(fn_snare, tuple):
                    if step in fn_snare: events.append((t, fn_snare_fn()))
                elif step == steps//2:
                    events.append((t, fn_snare()))
            if fn_hat and step % 2 == 0:
                events.append((t, fn_hat()))
    return events

def render_events(events, total_dur):
    """将事件列表渲染为连续信号"""
    n_total = dur2n(total_dur)
    out = np.zeros(n_total, dtype=np.float32)
    for t_sec, sig in events:
        start = dur2n(t_sec)
        end = min(start+len(sig), n_total)
        out[start:end] += sig[:end-start]
    return out

# ──────────────────────────────────────────────────────────────────────
# 🎵 主菜单 BGM
# Am - F - C - G，弦乐垫 + 铃声 + 精灵琶音
# ──────────────────────────────────────────────────────────────────────

def make_menu():
    tempo=75; beat=60/tempo; bar=beat*4; total=30.0
    chord_prog = [ch('Am'), ch('F'), ch('C'), ch('G')]

    # 弦乐垫（逐小节叠加）
    sig = silence(total)
    for rep in range(4):
        for ci, c in enumerate(chord_prog):
            t = ci*bar + rep*bar*4
            if t >= total: break
            cs = string_pad(c, bar*0.95, amp=0.22, a=0.25)
            cs = fade_out(fade_in(cs, 0.08), 0.12)
            s = dur2n(t); e = min(s+len(cs), dur2n(total))
            sig[s:e] += cs[:e-s]

    # 铃声旋律
    bell_notes = [n2f('E6'),n2f('G6'),n2f('A6'),n2f('B6'),n2f('C7'),n2f('B6'),n2f('A6'),n2f('G6')]
    step = beat*2
    for i, fn in enumerate(bell_notes):
        t = i*step; n_dur = beat*1.8
        if t >= total: break
        b = bell(fn, n_dur, amp=0.22)
        s=dur2n(t); e=min(s+len(b),len(sig)); sig[s:e]+=b[:e-s]

    # 精灵琶音
    arp = [n2f('E5'),n2f('G5'),n2f('A5'),n2f('C6'),n2f('G5')]
    step = beat*0.5
    i = 0
    for t in np.arange(0, total, step):
        fn = arp[i % len(arp)]
        n_dur = min(step*1.8, total-t)
        a = pluck(fn, n_dur, a=0.003)*0.28
        s=dur2n(t); e=min(s+len(a),len(sig)); sig[s:e]+=a[:e-s]
        i += 1

    # 简单主旋律
    mel = [(n2f('E5'),beat*2),(n2f('G5'),beat*2),(n2f('A5'),beat*2),(n2f('C6'),beat*4),
           (n2f('B5'),beat*2),(n2f('A5'),beat*2),(n2f('G5'),beat*4)]
    t = 0.0
    for fn, nd in mel:
        if t >= total: break
        l = lead(fn, nd, amp=0.38)
        s=dur2n(t); e=min(s+len(l),len(sig)); sig[s:e]+=l[:e-s]
        t += nd

    return fade_out(fade_in(sig, 0.4), 1.5)

# ──────────────────────────────────────────────────────────────────────
# ⚔️ 战斗 BGM
# Em - C - G - D，快节奏，鼓 + lead + 密集琶音
# ──────────────────────────────────────────────────────────────────────

def make_battle():
    tempo=140; beat=60/tempo; bar=beat*4; total=30.0
    chord_prog = [ch('Em'), ch('C'), ch('G'), ch('D')]

    # 鼓组
    events = []
    step_dur = beat/2
    for step in range(int(total/step_dur)):
        t = step*step_dur
        if t >= total: break
        if step % 4 == 0:   events.append((t, kick_fn(0.28, 52)))
        if step % 4 == 2:   events.append((t, kick_fn(0.22, 58)))
        if step % 4 == 1:   events.append((t, snare_fn()))
        if step % 4 == 3:   events.append((t, snare_fn()*0.7))
        if step % 2 == 0:   events.append((t, hat_c()))
    drum = render_events(events, total)

    # 弦乐垫
    sig = silence(total)
    for rep in range(4):
        for ci, c in enumerate(chord_prog):
            t = ci*bar + rep*bar*4
            if t >= total: break
            cs = string_pad(c, bar*0.9, amp=0.32, a=0.06)
            cs = fade_out(fade_in(cs, 0.02), 0.12)
            s=dur2n(t); e=min(s+len(cs),len(sig)); sig[s:e]+=cs[:e-s]

    # 密集琶音
    arp = [n2f('B3'),n2f('E4'),n2f('G4'),n2f('B4'),n2f('E5')]
    step = beat*0.25
    i = 0
    for t in np.arange(0, total, step):
        fn = arp[i % len(arp)]
        nd = min(step*2, total-t)
        a = pluck(fn, nd)*0.32
        s=dur2n(t); e=min(s+len(a),len(sig)); sig[s:e]+=a[:e-s]
        i += 1

    # Lead 旋律
    mel = [(n2f('E5'),beat),(n2f('G5'),beat),(n2f('B5'),beat),(n2f('E6'),beat*2),
           (n2f('D5'),beat),(n2f('B4'),beat*2),(n2f('C5'),beat),(n2f('E5'),beat),
           (n2f('G5'),beat),(n2f('B5'),beat*2)]
    t = 0.0
    for fn, nd in mel:
        if t >= total: break
        l = lead(fn, nd, amp=0.42)
        s=dur2n(t); e=min(s+len(l),len(sig)); sig[s:e]+=l[:e-s]
        t += nd

    return fade_out(fade_in(drum*0.6 + sig, 0.08), 0.8)

# ──────────────────────────────────────────────────────────────────────
# 🗺️ 探索 BGM
# D - A - Bm - G，明亮吉他 + 弦乐 + 风铃
# ──────────────────────────────────────────────────────────────────────

def make_explore():
    tempo=90; beat=60/tempo; bar=beat*4; total=30.0
    chord_prog = [ch('D',5), ch('A',5), ch('Bm',5), ch('G',5)]

    # 弦乐垫
    sig = silence(total)
    for rep in range(4):
        for ci, c in enumerate(chord_prog):
            t = ci*bar + rep*bar*4
            if t >= total: break
            cs = string_pad(c, bar*0.95, amp=0.2, a=0.3)
            cs = fade_out(fade_in(cs, 0.12), 0.2)
            s=dur2n(t); e=min(s+len(cs),len(sig)); sig[s:e]+=cs[:e-s]

    # 吉他分解和弦
    for rep in range(4):
        for ci, c in enumerate(chord_prog):
            t0 = ci*bar + rep*bar*4
            if t0 >= total: break
            c2 = c*2
            for si, fn in enumerate(c2[:6]):
                st = t0 + si*(beat/4)
                if st >= total: break
                g = pluck(fn, beat*0.55, a=0.008, r=beat*0.35)*0.32
                s=dur2n(st); e=min(s+len(g),len(sig)); sig[s:e]+=g[:e-s]

    # 风铃点缀
    bells = [n2f('D6'),n2f('A6'),n2f('F#6'),n2f('C#6')]
    for rep in range(4):
        for ci, fn in enumerate(bells):
            t = ci*bar + rep*bar*4 + beat*2.5
            if t >= total: break
            b = bell(fn, beat*1.5, amp=0.13)
            s=dur2n(t); e=min(s+len(b),len(sig)); sig[s:e]+=b[:e-s]

    # 轻打击
    events = []
    for rep in range(4):
        for ci in range(4):
            t = ci*beat + rep*bar*4
            if t >= total: break
            events.append((t, clap_fn()*0.38))
            if ci >= 2:
                events.append((t, hat_o(0.28)*0.22))
    perc = render_events(events, total)

    # 主旋律
    mel = [(n2f('D5'),beat),(n2f('F#5'),beat),(n2f('A5'),beat*2),(n2f('B5'),beat),
           (n2f('A5'),beat),(n2f('G5'),beat*2),(n2f('E5'),beat),(n2f('F#5'),beat),(n2f('D5'),beat*2)]
    t = 0.0
    for fn, nd in mel:
        if t >= total: break
        l = lead(fn, nd, amp=0.35)
        s=dur2n(t); e=min(s+len(l),len(sig)); sig[s:e]+=l[:e-s]
        t += nd

    return fade_out(fade_in(sig*0.7 + perc*0.4, 0.2), 1.0)

# ──────────────────────────────────────────────────────────────────────
# 👹 Boss 战 BGM
# Dm - Am - Bb - F，张力紧绷，底鼓+警报 lead + 低音弦
# ──────────────────────────────────────────────────────────────────────

def make_boss():
    tempo=160; beat=60/tempo; bar=beat*4; total=30.0
    chord_prog = [ch('Dm'), ch('Am'), ch('Bb'), ch('F')]

    # 疯狂鼓组
    events = []
    step_dur = beat/4
    for step in range(int(total/step_dur)):
        t = step*step_dur
        if t >= total: break
        if step % 2 == 0: events.append((t, kick_fn(0.3, 42)))
        if step % 8 == 5: events.append((t, kick_fn(0.2, 48)))
        if step % 8 == 4: events.append((t, snare_fn()))
        if step % 8 == 0: events.append((t, snare_fn()*0.75))
        if step % 2 == 1: events.append((t, hat_c()))
        if step % 4 == 2: events.append((t, hat_o(0.14)*0.45))
    drum = render_events(events, total)

    # 弦乐张力垫
    sig = silence(total)
    for rep in range(4):
        for ci, c in enumerate(chord_prog):
            t = ci*bar + rep*bar*4
            if t >= total: break
            # 提高八度
            ch_hi = [f*2 for f in c]
            cs = string_pad(ch_hi, bar*0.9, amp=0.42, a=0.04)
            cs = fade_out(fade_in(cs, 0.01), 0.1)
            s=dur2n(t); e=min(s+len(cs),len(sig)); sig[s:e]+=cs[:e-s]

    # 低音
    bass_n = [n2f('D2'),n2f('A2'),n2f('Bb2'),n2f('F2')]
    for rep in range(6):
        for ci, fn in enumerate(bass_n):
            t = ci*bar*0.5 + rep*bar*2
            if t >= total: break
            b = bass_fn(fn, beat*1.6, amp=0.55)
            s=dur2n(t); e=min(s+len(b),len(sig)); sig[s:e]+=b[:e-s]

    # 警报 lead
    alarm = [(n2f('A4'),beat*0.5),(n2f('Ab4'),beat*0.5),
             (n2f('G4'),beat*0.5),(n2f('F4'),beat*0.5),
             (n2f('D4'),beat*0.5),(n2f('C4'),beat*0.5),
             (n2f('Bb3'),beat*0.5),(n2f('A3'),beat*0.5)]
    t = 0.0
    for fn, nd in alarm:
        if t >= total: break
        l = lead(fn, nd, amp=0.48)
        s=dur2n(t); e=min(s+len(l),len(sig)); sig[s:e]+=l[:e-s]
        t += nd

    # 紧张琶音
    arp = [n2f('D4'),n2f('F4'),n2f('A4'),n2f('C5'),n2f('A4'),n2f('F4')]
    step = beat*0.25
    i = 0
    for t in np.arange(0, total, step):
        fn = arp[i % len(arp)]
        nd = min(step*2, total-t)
        a = pluck(fn, nd)*0.38
        s=dur2n(t); e=min(s+len(a),len(sig)); sig[s:e]+=a[:e-s]
        i += 1

    return fade_out(fade_in(drum*0.65 + sig, 0.05), 1.0)

# ──────────────────────────────────────────────────────────────────────
# 🏆 胜利 BGM
# D - A - Bm - F#m - G - D，光辉凯旋，弦乐 + 钟琴 + 号角
# ──────────────────────────────────────────────────────────────────────

def make_victory():
    tempo=120; beat=60/tempo; bar=beat*4; total=30.0
    chord_prog = [ch('D',5), ch('A',5), ch('Bm',5), ch('F#m',5), ch('G',5), ch('D',5)]

    # 军乐鼓
    events = []
    step_dur = beat/4
    for step in range(int(total/step_dur)):
        t = step*step_dur
        if t >= total: break
        if step % 8 == 0: events.append((t, kick_fn(0.28, 62)))
        if step % 4 == 2: events.append((t, snare_fn()))
        if step % 2 == 0: events.append((t, hat_o(0.15)*0.45))
    drum = render_events(events, total)

    # 弦乐垫
    sig = silence(total)
    for rep in range(3):
        for ci, c in enumerate(chord_prog):
            t = ci*bar*0.67 + rep*bar*4
            if t >= total: break
            cs = string_pad(c, bar*0.9, amp=0.26, a=0.1)
            cs = fade_out(fade_in(cs, 0.06), 0.15)
            s=dur2n(t); e=min(s+len(cs),len(sig)); sig[s:e]+=cs[:e-s]

    # 钟琴和弦
    bells = [n2f('D6'),n2f('F#6'),n2f('A6'),n2f('D7')]
    for rep in range(4):
        for ci, fn in enumerate(bells):
            t = ci*beat + rep*bar*2
            if t >= total: break
            b = bell(fn, beat*2, amp=0.32)
            s=dur2n(t); e=min(s+len(b),len(sig)); sig[s:e]+=b[:e-s]

    # 凯旋号角旋律
    fanfare = [(n2f('D4'),beat),(n2f('D4'),beat*0.5),(n2f('F#4'),beat*0.5),
               (n2f('A4'),beat),(n2f('D5'),beat*2),
               (n2f('A4'),beat),(n2f('G4'),beat),
               (n2f('F#4'),beat),(n2f('D4'),beat*2)]
    t = 0.0
    for fn, nd in fanfare:
        if t >= total: break
        l = lead(fn, nd, amp=0.48)
        s=dur2n(t); e=min(s+len(l),len(sig)); sig[s:e]+=l[:e-s]
        t += nd

    # 光辉上行和弦
    glows = [ch('D',6), ch('A',6), ch('F#m',6)]
    for ci, c in enumerate(glows):
        t = ci*beat*4
        if t >= total: break
        cs = string_pad(c, beat*3.5, amp=0.38, a=0.06)
        s=dur2n(t); e=min(s+len(cs),len(sig)); sig[s:e]+=cs[:e-s]

    return fade_out(fade_in(drum*0.5 + sig, 0.2), 1.5)

# ──────────────────────────────────────────────────────────────────────
# 主程序
# ──────────────────────────────────────────────────────────────────────

def main():
    print("\n🎵 奇幻/魔法风格游戏 BGM 生成器")
    print("=" * 42)
    base = OUT

    print("\n📜 主菜单 BGM")
    export(make_menu(), f"{base}/fantasy_menu.mp3")

    print("\n⚔️  战斗/副本 BGM")
    export(make_battle(), f"{base}/fantasy_battle.mp3")

    print("\n🗺️  探索/大地图 BGM")
    export(make_explore(), f"{base}/fantasy_explore.mp3")

    print("\n👹 Boss 战 BGM")
    export(make_boss(), f"{base}/fantasy_boss.mp3")

    print("\n🏆 胜利/结算 BGM")
    export(make_victory(), f"{base}/fantasy_victory.mp3")

    print("\n✅ 全部生成完成！")
    print(f"📁 输出目录：{base}")
    for f in sorted(os.listdir(base)):
        if f.endswith('.mp3'):
            sz = os.path.getsize(os.path.join(base, f))
            print(f"  {f}  ({sz/1024:.1f} KB)")

if __name__ == '__main__':
    main()
