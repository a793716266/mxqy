"""
模仿《植物大战僵尸》Zomboss BOSS 战音乐 "The King"
Laura Shigihara 风格：钢琴 + 合成铜管 + 弦乐拨奏 + 贝斯 + 竖琴
结构：阴森引子 → 铜管号角推进 → 高潮冲刺
时长：60 秒
"""

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
import os

SR = 44100
OUT = "/Users/jacob/WorkBuddy/20260418131907/game_bgm"

def n2n(s): return int(SR * s)

def nf(name):
    """'D4' -> note('D',4)"""
    semi = {'C':-9,'D':-7,'E':-5,'F':-4,'G':-2,'A':0,'B':2,
            'Db':-8,'Eb':-6,'Gb':-3,'Ab':-1,'Bb':1}
    for i in range(8, 1, -1):
        if name.endswith(str(i)):
            root = name[:-1]
            for k in ['Db','Eb','Gb','Ab','Bb']:
                if root.startswith(k): root=k; break
            s = semi.get(root, 0)
            return 440.0 * (2**((12*(i+1)+s-69)/12))
    for k in ['Db','Eb','Gb','Ab','Bb']:
        if name.startswith(k):
            return 440.0 * (2**((12*9+semi[k]-69)/12))
    return 440.0 * (2**((12*9+semi.get(name,0)-69)/12))

def zro(s): return np.zeros(n2n(s), dtype=np.float32)

def sin(f, d, a=1.0):
    t = np.linspace(0, d, n2n(d), endpoint=False)
    return (a*np.sin(2*np.pi*f*t)).astype(np.float32)

def saw(f, d, a=1.0):
    t = np.linspace(0, d, n2n(d), endpoint=False)
    return (a*(2*(t*f % 1)-1)).astype(np.float32)

def tri(f, d, a=1.0):
    t = np.linspace(0, d, n2n(d), endpoint=False)
    p = (t*f) % 1
    return (a*(4*np.abs(p-0.5)-1)).astype(np.float32)

def sqr(f, d, a=1.0, dt=0.5):
    t = np.linspace(0, d, n2n(d), endpoint=False)
    return (a*(2*(t*f % 1 < dt)-1)).astype(np.float32)

def rnd(d, a=1.0):
    return (np.random.randn(n2n(d))*a).astype(np.float32)

def lp(sig, c, o=4):
    sos = butter(o, c/(SR/2), btype='low', output='sos')
    return sosfilt(sos, sig).astype(np.float32)

def hp(sig, c, o=4):
    sos = butter(o, c/(SR/2), btype='high', output='sos')
    return sosfilt(sos, sig).astype(np.float32)

def bp(sig, lo, hi, o=4):
    sos = butter(o, [lo/(SR/2), hi/(SR/2)], btype='band', output='sos')
    return sosfilt(sos, sig).astype(np.float32)

def adsr_env(n_samples, a=0.01, d=0.1, s=0.7, r=0.2):
    ai=n2n(a); di=n2n(d); ri=n2n(r); si=max(0,n_samples-ai-di-ri)
    env = np.concatenate([np.linspace(0,1,ai), np.linspace(1,s,di), np.ones(si)*s, np.linspace(s,0,ri)])
    return np.pad(env,(0,max(0,n_samples-len(env))))[:n_samples]

def mix(*sigs):
    mx = max(len(x) for x in sigs)
    out = np.zeros(mx, dtype=np.float32)
    for x in sigs: out[:len(x)] += x
    return out

def cat(*sigs):
    return np.concatenate([x.astype(np.float32) for x in sigs])

def ins(sig, start, *new):
    """在 sig 的 start 秒处插入信号"""
    out = sig.copy()
    for x in new:
        n_x = len(x)
        s = n2n(start); e = min(s+n_x, len(out))
        if s < len(out): out[s:e] += x[:e-s]
    return out

def fi(sig, t):
    n = min(n2n(t), len(sig)//3)
    s = sig.copy().astype(np.float32)
    s[:n] *= np.linspace(0,1,n); return s

def fo(sig, t):
    n = min(n2n(t), len(sig)//3)
    s = sig.copy().astype(np.float32)
    s[-n:] *= np.linspace(1,0,n); return s

def save_mp3(sig, path):
    peak = np.max(np.abs(sig))
    if peak > 1e-9: sig = sig/peak*0.85
    wav = (sig*32767).astype(np.int16)
    tmp = path.replace('.mp3','_t.wav')
    wavfile.write(tmp, SR, wav)
    os.system(f'ffmpeg -y -i "{tmp}" -codec:a libmp3lame -qscale:a 2 "{path}" 2>/dev/null')
    os.remove(tmp)

def out(sig, path):
    print(f"  [OK] {path}")
    save_mp3(sig.astype(np.float32), path)

# ══════════════════════════════════════════════════════════════════════
# 合成器（复现 Laura Shigihara 风格）
# ══════════════════════════════════════════════════════════════════════

def piano(f, d, vel=0.8, a=0.004, r=None):
    """大钢琴击弦 - 核心音色"""
    if r is None: r = d*0.5
    t = np.linspace(0, d, n2n(d), endpoint=False)
    w = sin(f, d)*0.5 + tri(f*2, d)*0.3 + sin(f*4, d)*0.15
    w += sqr(f, d, a=0.1, dt=0.2)*vel*0.2
    env = adsr_env(n2n(d), a=a, d=0.1, s=0.3, r=r)
    return (w*env*vel).astype(np.float32)

def brass_fanfare(f, d, a=0.7):
    """合成铜管号角 - The King 标志性音色"""
    t = np.linspace(0, d, n2n(d), endpoint=False)
    vib = 1 + 0.008*np.sin(2*np.pi*5.5*t)
    w = saw(f*vib, d)*0.5 + saw(f*2*vib, d)*0.3 + sin(f*vib, d)*0.3
    w = lp(w, 3000)*0.7 + sin(f*0.5, d)*0.4
    env = adsr_env(n2n(d), a=0.01, d=0.08, s=0.65, r=d*0.35)
    return (w*env*a).astype(np.float32)

def brass_stab(f, d, a=0.8):
    """铜管突强重音"""
    w = saw(f, d)*0.6 + saw(f*2, d)*0.25 + sin(f, d)*0.35
    w = lp(w, 2500)
    env = adsr_env(n2n(d), a=0.003, d=0.06, s=0.4, r=d*0.3)
    return (w*env*a).astype(np.float32)

def string_pizz(f, d, a=0.4):
    """弦乐拨奏（pizzicato）"""
    t = np.linspace(0, d, n2n(d), endpoint=False)
    w = sin(f, d)*0.5 + tri(f*2, d)*0.3
    decay = np.exp(-t/(d*0.15))
    env = adsr_env(n2n(d), a=0.002, d=0.01, s=0.0, r=d*0.1)
    return (w*decay*env*a).astype(np.float32)

def string_trem(f, d, amp=0.35):
    """弦乐震音（高潮用）"""
    t = np.linspace(0, d, n2n(d), endpoint=False)
    w = sin(f, d)*0.5 + sin(f*2, d)*0.3
    w = lp(w, 2000)
    env = adsr_env(n2n(d), a=0.01, d=0.1, s=0.8, r=d*0.2)
    return (w*env*amp).astype(np.float32)

def bass_acoustic(f, d, a=0.6):
    """低音贝斯（拨弦感）"""
    t = np.linspace(0, d, n2n(d), endpoint=False)
    w = sin(f, d)*0.5 + sin(f*2, d)*0.2 + sin(f*3, d)*0.1
    w = lp(w, 500)
    env = adsr_env(n2n(d), a=0.005, d=0.08, s=0.5, r=d*0.3)
    return (w*env*a).astype(np.float32)

def sub_bass(f, d, a=0.5):
    """次低音（地鼓轰鸣感）"""
    w = sin(f, d) + sin(f*0.5, d)*0.5
    env = adsr_env(n2n(d), a=0.01, d=0.15, s=0.6, r=d*0.3)
    return (w*env*a).astype(np.float32)

def harp_arp(f, d, a=0.4):
    """竖琴琶音（装饰性）"""
    t = np.linspace(0, d, n2n(d), endpoint=False)
    w = sin(f, d)*0.4 + sin(f*3, d)*0.2
    env = adsr_env(n2n(d), a=0.002, d=0.1, s=0.1, r=d*0.5)
    return (w*env*a).astype(np.float32)

def kick(p=50, d=0.25):
    t = np.linspace(0, d, n2n(d), endpoint=False)
    f = p*np.exp(-t/0.015)
    ph = np.cumsum(2*np.pi*f/SR)
    w = np.sin(ph)
    return (w*np.exp(-t*16)).astype(np.float32)

def snare(d=0.12):
    t = np.linspace(0, d, n2n(d), endpoint=False)
    nse = rnd(d)*np.exp(-t*20)
    body = sin(180, d)*np.exp(-t*25)
    return (hp(nse, 180)*0.5 + body*0.4).astype(np.float32)

def hat_c(d=0.05):
    t = np.linspace(0, d, n2n(d), endpoint=False)
    return (hp(rnd(d)*np.exp(-t*70), 4500)*0.3).astype(np.float32)

def crash(d=0.6):
    t = np.linspace(0, d, n2n(d), endpoint=False)
    nse = rnd(d)*np.exp(-t*4)
    return (hp(nse, 1800)*0.7).astype(np.float32)

# ══════════════════════════════════════════════════════════════════════
# 乐句
# ══════════════════════════════════════════════════════════════════════

# ── Phase 1: 阴森引子（0-18s）BPM 80，D小调 ─────────────────────────

def piano_intro_dark(tempo=80):
    """大钢琴独奏引子 - 低音区，戏剧性"""
    beat = 60/tempo
    total = 18.0
    sig = zro(total)

    # 钢琴独奏旋律（D小调阴森主题）
    mel = [
        (nf('D3'), beat*2), (nf('F3'), beat),
        (nf('Eb3'), beat*2), (nf('D3'), beat),
        (nf('C3'), beat*2), (nf('Bb2'), beat),
        (nf('A2'), beat*2), (nf('G2'), beat),
        (nf('F2'), beat*3), (nf('D3'), beat),
    ]
    t = 0.0
    for fn, nd in mel:
        if t >= total: break
        p = piano(fn, nd, vel=0.75)
        sig = ins(sig, t, p)
        t += nd

    # 低音弦乐拨奏点缀
    pizz_mel = [(nf('D2'), beat*2), (nf('F2'), beat), (nf('C2'), beat*2), (nf('Bb1'), beat),
                (nf('A1'), beat*2), (nf('G1'), beat*2)]
    t = 4.0
    for fn, nd in pizz_mel:
        if t >= total: break
        s = string_pizz(fn, nd*0.8, a=0.3)
        sig = ins(sig, t, s)
        t += nd

    # 次低音铺垫（地鼓感）
    bass_notes = [nf('D2'), nf('Eb2'), nf('C2'), nf('Bb1')]
    for i, fn in enumerate(bass_notes):
        t_b = i * beat * 3
        if t_b >= total: break
        b = sub_bass(fn, beat*2, a=0.3)
        sig = ins(sig, t_b, b)

    return sig

# ── Phase 2: 铜管号角推进（18-38s）BPM 110 ──────────────────────────

def brass_fanfare_phase(tempo=110):
    """铜管号角 + 钢琴和弦推进"""
    beat = 60/tempo
    total = 20.0
    sig = zro(total)

    # 钢琴和弦铺底（每小节）
    chord_prog = [
        [nf('D3'), nf('F3'), nf('A3'), nf('C4')],
        [nf('C3'), nf('Eb3'), nf('G3'), nf('Bb3')],
        [nf('Bb2'), nf('D3'), nf('F3'), nf('A3')],
        [nf('A2'), nf('C3'), nf('E3'), nf('G3')],
    ]
    for rep in range(5):
        for ci, ch in enumerate(chord_prog):
            t = ci*beat*4 + rep*beat*16
            if t >= total: break
            for fn in ch:
                p = piano(fn, beat*2, vel=0.6, a=0.01)
                sig = ins(sig, t, p)

    # 弦乐拨奏节奏型（"The King" 标志性拨奏 loop）
    pizz_pattern = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]
    pizz_bass = [nf('D2'), nf('A2'), nf('F2'), nf('G2')]
    for rep in range(4):
        for ci, fn in enumerate(pizz_bass):
            for pi, hit in enumerate(pizz_pattern[ci*4:(ci+1)*4]):
                if hit:
                    t_p = rep*beat*16 + ci*beat*4 + pi*beat
                    if t_p >= total: break
                    s = string_pizz(fn, beat*0.4, a=0.35)
                    sig = ins(sig, t_p, s)

    # 铜管号角主题（D小调主旋律）
    fanfare_mel = [
        (nf('D4'), beat), (nf('F4'), beat), (nf('A4'), beat*2),
        (nf('G4'), beat), (nf('F4'), beat), (nf('Eb4'), beat),
        (nf('D4'), beat*2),
    ]
    t = 0.0
    for fn, nd in fanfare_mel:
        if t >= total: break
        f = brass_fanfare(fn, nd, a=0.65)
        sig = ins(sig, t, f)
        t += nd

    # 第二遍号角（提高八度）
    fanfare_hi = [(nf('D5'), beat), (nf('F5'), beat), (nf('A5'), beat*2),
                  (nf('G5'), beat), (nf('F5'), beat), (nf('Eb5'), beat),
                  (nf('D5'), beat*2)]
    t = 10.0
    for fn, nd in fanfare_hi:
        if t >= total: break
        f = brass_fanfare(fn, nd, a=0.55)
        sig = ins(sig, t, f)
        t += nd

    # 铜管突强重音
    stabs = [(0, nf('A3')), (4, nf('G3')), (8, nf('F3')), (12, nf('Eb3')), (16, nf('D3'))]
    for t_s, fn in stabs:
        if t_s >= total: break
        s = brass_stab(fn, beat*1.5, a=0.6)
        sig = ins(sig, t_s, s)

    # 鼓组（行进感）
    for step in range(int(total/(beat/2))):
        t_d = step*beat/2
        if t_d >= total: break
        if step % 8 == 0:
            k = kick(p=55)
            sig = ins(sig, t_d, k)
        if step % 8 == 4:
            s = snare()
            sig = ins(sig, t_d, s)
        if step % 2 == 0:
            h = hat_c()
            sig = ins(sig, t_d, h)

    # 竖琴琶音装饰
    harp_notes = [nf('D5'), nf('F5'), nf('A5'), nf('C6'), nf('A5'), nf('F5')]
    for i, fn in enumerate(harp_notes):
        t_h = 2.0 + i * beat * 0.5
        if t_h >= total: break
        h = harp_arp(fn, beat*0.8, a=0.25)
        sig = ins(sig, t_h, h)

    return sig

# ── Phase 3: 高潮冲刺（38-60s）BPM 140 ───────────────────────────────

def finale_phase(tempo=140):
    """弦乐震音 + 急促钢琴 + 铜管轰鸣"""
    beat = 60/tempo
    total = 22.0
    sig = zro(total)

    # 弦乐震音铺垫
    trem_notes = [nf('D4'), nf('F4'), nf('A4'), nf('D5')]
    for rep in range(4):
        for ci, fn in enumerate(trem_notes):
            t = ci*beat + rep*beat*4
            if t >= total: break
            tr = string_trem(fn, beat*1.5, amp=0.4)
            sig = ins(sig, t, tr)

    # 钢琴急促和弦（高潮核心）
    chord_prog = [
        [nf('D4'), nf('F4'), nf('A4'), nf('C5')],
        [nf('C4'), nf('Eb4'), nf('G4'), nf('Bb4')],
        [nf('Bb3'), nf('D4'), nf('F4'), nf('A4')],
        [nf('A3'), nf('C4'), nf('E4'), nf('G4')],
    ]
    for rep in range(3):
        for ci, ch in enumerate(chord_prog):
            t = ci*beat*2 + rep*beat*8
            if t >= total: break
            for fn in ch:
                p = piano(fn, beat*1.5, vel=0.9, a=0.003)
                sig = ins(sig, t, p)

    # 铜管决胜号角
    finale_mel = [
        (nf('D4'), beat*0.5), (nf('D4'), beat*0.5), (nf('F4'), beat),
        (nf('A4'), beat*2), (nf('G4'), beat), (nf('F4'), beat),
        (nf('Eb4'), beat), (nf('D4'), beat*2),
        (nf('D5'), beat*2), (nf('C5'), beat), (nf('Bb4'), beat),
        (nf('A4'), beat), (nf('G4'), beat*2),
    ]
    t = 0.0
    for fn, nd in finale_mel:
        if t >= total: break
        f = brass_fanfare(fn, nd, a=0.7)
        sig = ins(sig, t, f)
        t += nd

    # 铜管重击
    stabs = [(0, nf('D3')), (3, nf('F3')), (6, nf('A3')), (9, nf('G3')),
             (12, nf('Eb3')), (15, nf('D3')), (18, nf('F3'))]
    for t_s, fn in stabs:
        if t_s >= total: break
        s = brass_stab(fn, beat*2, a=0.75)
        sig = ins(sig, t_s, s)

    # 激烈鼓组
    for step in range(int(total/(beat/4))):
        t_d = step*beat/4
        if t_d >= total: break
        if step % 4 == 0:
            k = kick(p=60)
            sig = ins(sig, t_d, k)
        if step % 8 == 4:
            s = snare()
            sig = ins(sig, t_d, s)
        if step % 4 == 2:
            h = hat_c()
            sig = ins(sig, t_d, h)

    # 定音鼓
    crashes = [0, 7, 14]
    for tc in crashes:
        if tc >= total: break
        c = crash(d=0.7)
        sig = ins(sig, tc, c)

    # 竖琴上行琶音（高潮装饰）
    for rep in range(3):
        for ci, fn in enumerate([nf('D5'),nf('F5'),nf('A5'),nf('C6'),nf('D6')]):
            t_h = rep*beat*6 + ci*beat*0.4
            if t_h >= total: break
            h = harp_arp(fn, beat*0.6, a=0.3)
            sig = ins(sig, t_h, h)

    return sig

# ══════════════════════════════════════════════════════════════════════
# 主程序
# ══════════════════════════════════════════════════════════════════════

def main():
    print("\n-- Zomboss 'The King' BGM --")
    print("=" * 36)

    p1 = piano_intro_dark()
    p2 = brass_fanfare_phase()
    p3 = finale_phase()

    # 衔接处理
    # P1 末尾淡出 + P2 淡入
    fade_d = 1.5
    p1_fo = fo(p1, fade_d)
    p2_fi = fi(p2, fade_d)
    p2_fo = fo(p2, fade_d)
    p3_fi = fi(p3, fade_d)

    # 淡入淡出交叉叠加
    cross_n = n2n(fade_d)
    p1_tail = p1_fo[:cross_n] * np.linspace(1, 0, cross_n)
    p2_head = p2_fi[:cross_n] * np.linspace(0, 1, cross_n)

    # 拼接
    gap = zro(fade_d)
    full = cat(p1_fo, gap)
    # 交叉淡入
    cross_start = len(p1_fo) - cross_n
    full[cross_start:cross_start+cross_n] += p2_head

    full = cat(full, gap)
    cross_start2 = len(full) - cross_n
    # P2 到 P3 交叉
    p3_head_seg = p3_fi[:cross_n] * np.linspace(0, 1, cross_n)
    full[cross_start2:cross_start2+cross_n] += p2_fo[:cross_n] * np.linspace(1, 0, cross_n)

    full = cat(full, p3_fi)
    full = fo(full, 2.0)

    path = f"{OUT}/pvz_the_king.mp3"
    out(full, path)
    sz = os.path.getsize(path)
    print(f"\n  File: pvz_the_king.mp3  ({sz/1024:.1f} KB)")
    print(f"  Duration: 60s | 3 Phases:")
    print(f"   Phase 1 (0-18s)  Dark Intro     - Piano solo + string pizz  BPM 80")
    print(f"   Phase 2 (18-38s) Brass Fanfare  - Brass + piano chords + drums  BPM 110")
    print(f"   Phase 3 (38-60s) Finale Climax  - String tremolo + frantic piano  BPM 140")

if __name__ == '__main__':
    main()
