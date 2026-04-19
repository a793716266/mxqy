"""
奇幻/魔法风格游戏音效生成器
生成：UI音效、战斗音效、收集/奖励音效
输出格式：MP3
"""

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
import tempfile, os, struct, wave

SAMPLE_RATE = 44100
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

def to_pcm(signal):
    """归一化并转为 16-bit PCM"""
    peak = np.max(np.abs(signal))
    if peak > 0:
        signal = signal / peak * 0.85
    return (signal * 32767).astype(np.int16)

def save_wav(signal, path):
    wavfile.write(path, SAMPLE_RATE, to_pcm(signal))

def wav_to_mp3(wav_path, mp3_path):
    os.system(f'ffmpeg -y -i "{wav_path}" -codec:a libmp3lame -qscale:a 2 "{mp3_path}" 2>/dev/null')
    os.remove(wav_path)

def export_mp3(signal, filename):
    """保存为 MP3"""
    tmp = filename.replace('.mp3', '_tmp.wav')
    save_wav(signal, tmp)
    wav_to_mp3(tmp, filename)
    print(f"  ✓ {os.path.basename(filename)}")

def sine(freq, duration, amp=1.0, phase=0.0):
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), endpoint=False)
    return amp * np.sin(2 * np.pi * freq * t + phase)

def envelope(signal, attack=0.01, decay=0.05, sustain=0.7, release=0.1):
    n = len(signal)
    sr = SAMPLE_RATE
    a = int(attack * sr)
    d = int(decay * sr)
    r = int(release * sr)
    s_len = n - a - d - r
    if s_len < 0:
        s_len = 0
    env = np.concatenate([
        np.linspace(0, 1, a),
        np.linspace(1, sustain, d),
        np.ones(s_len) * sustain,
        np.linspace(sustain, 0, r)
    ])
    env = env[:n]
    if len(env) < n:
        env = np.pad(env, (0, n - len(env)))
    return signal * env

def noise(duration, amp=1.0):
    n = int(SAMPLE_RATE * duration)
    return np.random.randn(n) * amp

def lowpass(signal, cutoff, order=4):
    sos = butter(order, cutoff / (SAMPLE_RATE / 2), btype='low', output='sos')
    return sosfilt(sos, signal)

def highpass(signal, cutoff, order=4):
    sos = butter(order, cutoff / (SAMPLE_RATE / 2), btype='high', output='sos')
    return sosfilt(sos, signal)

def bandpass(signal, low, high, order=4):
    sos = butter(order, [low / (SAMPLE_RATE / 2), high / (SAMPLE_RATE / 2)], btype='band', output='sos')
    return sosfilt(sos, signal)

def vibrato(freq_base, duration, vib_rate=5.0, vib_depth=0.015):
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), endpoint=False)
    freq_mod = freq_base * (1 + vib_depth * np.sin(2 * np.pi * vib_rate * t))
    phase = np.cumsum(2 * np.pi * freq_mod / SAMPLE_RATE)
    return np.sin(phase)

def pitch_sweep(f_start, f_end, duration, amp=1.0):
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), endpoint=False)
    freqs = np.linspace(f_start, f_end, len(t))
    phase = np.cumsum(2 * np.pi * freqs / SAMPLE_RATE)
    return amp * np.sin(phase)

def mix(*signals):
    max_len = max(len(s) for s in signals)
    out = np.zeros(max_len)
    for s in signals:
        out[:len(s)] += s
    return out

def concat(*signals):
    return np.concatenate(signals)

def fade_out(signal, duration=0.05):
    n = int(duration * SAMPLE_RATE)
    n = min(n, len(signal))
    signal = signal.copy()
    signal[-n:] *= np.linspace(1, 0, n)
    return signal

def fade_in(signal, duration=0.02):
    n = int(duration * SAMPLE_RATE)
    n = min(n, len(signal))
    signal = signal.copy()
    signal[:n] *= np.linspace(0, 1, n)
    return signal

# ─────────────────────────────────────────
# UI 音效
# ─────────────────────────────────────────

def sfx_ui_click():
    """魔法水晶点击音"""
    click = pitch_sweep(800, 1200, 0.04)
    click = envelope(click, attack=0.005, decay=0.03, sustain=0.0, release=0.005)
    sparkle = sine(2400, 0.06, 0.3)
    sparkle = envelope(sparkle, attack=0.002, decay=0.04, sustain=0.0, release=0.018)
    return fade_out(mix(click, sparkle), 0.01)

def sfx_ui_popup():
    """魔法弹窗出现音 - 上扫音"""
    sweep = pitch_sweep(400, 900, 0.15)
    sweep = envelope(sweep, attack=0.01, decay=0.05, sustain=0.6, release=0.05)
    chime1 = sine(1200, 0.12, 0.4)
    chime1 = envelope(chime1, attack=0.005, decay=0.08, sustain=0.3, release=0.03)
    chime2 = sine(1800, 0.1, 0.25)
    chime2 = np.pad(chime2, (int(0.05 * SAMPLE_RATE), 0))
    chime2 = envelope(chime2, attack=0.005, decay=0.07, sustain=0.2, release=0.02)
    return fade_out(mix(sweep, chime1, chime2), 0.02)

def sfx_ui_confirm():
    """魔法确认音 - 上行三和弦"""
    dur = 0.1
    notes = [523.25, 659.25, 783.99]  # C5 E5 G5
    sigs = []
    for i, freq in enumerate(notes):
        s = sine(freq, dur, 0.6)
        s = envelope(s, attack=0.01, decay=0.04, sustain=0.5, release=0.04)
        pad = int(i * 0.06 * SAMPLE_RATE)
        sigs.append(np.pad(s, (pad, 0)))
    result = mix(*sigs)
    # 加一点星光高频
    star = sine(3136, 0.08, 0.2)
    star = np.pad(star, (int(0.12 * SAMPLE_RATE), 0))
    star = envelope(star, attack=0.005, decay=0.06, sustain=0.0, release=0.015)
    return fade_out(mix(result, star), 0.03)

def sfx_ui_cancel():
    """魔法取消音 - 下行+低沉"""
    sweep = pitch_sweep(700, 350, 0.12)
    sweep = envelope(sweep, attack=0.01, decay=0.06, sustain=0.3, release=0.04)
    low = sine(220, 0.15, 0.4)
    low = envelope(low, attack=0.02, decay=0.08, sustain=0.2, release=0.05)
    result = mix(sweep, low)
    return fade_out(result, 0.03)

# ─────────────────────────────────────────
# 战斗音效
# ─────────────────────────────────────────

def sfx_battle_attack():
    """魔法攻击 - 魔力冲击波"""
    # 爆发感：噪声 + 中频扫频
    n = noise(0.08, 0.9)
    n = bandpass(n, 300, 2000)
    n = envelope(n, attack=0.003, decay=0.04, sustain=0.3, release=0.04)
    
    sweep = pitch_sweep(600, 250, 0.1)
    sweep = envelope(sweep, attack=0.002, decay=0.05, sustain=0.2, release=0.05)
    sweep *= 0.7
    
    punch = sine(150, 0.05, 0.8)
    punch = envelope(punch, attack=0.002, decay=0.04, sustain=0.0, release=0.008)
    
    return fade_out(mix(n, sweep, punch), 0.02)

def sfx_battle_hit():
    """受击音 - 魔法冲击"""
    hit_n = noise(0.06, 1.0)
    hit_n = bandpass(hit_n, 800, 4000)
    hit_n = envelope(hit_n, attack=0.001, decay=0.03, sustain=0.1, release=0.03)
    
    thud = sine(80, 0.08, 0.7)
    thud = envelope(thud, attack=0.001, decay=0.05, sustain=0.0, release=0.025)
    
    crack = pitch_sweep(1200, 400, 0.05)
    crack = envelope(crack, attack=0.001, decay=0.03, sustain=0.0, release=0.019)
    crack *= 0.5
    
    return fade_out(mix(hit_n, thud, crack), 0.02)

def sfx_battle_explosion():
    """爆炸音 - 魔法大爆发"""
    # 低频轰鸣
    boom = noise(0.6, 1.0)
    boom = lowpass(boom, 400)
    boom = envelope(boom, attack=0.005, decay=0.1, sustain=0.4, release=0.2)
    
    # 中频冲击
    mid = noise(0.4, 0.7)
    mid = bandpass(mid, 400, 2000)
    mid = envelope(mid, attack=0.003, decay=0.08, sustain=0.3, release=0.15)
    
    # 高频碎裂
    crack = noise(0.2, 0.4)
    crack = highpass(crack, 2000)
    crack = envelope(crack, attack=0.001, decay=0.06, sustain=0.1, release=0.1)
    
    # 魔法余韵 - 下扫
    tail = pitch_sweep(300, 80, 0.4)
    tail = envelope(tail, attack=0.01, decay=0.1, sustain=0.2, release=0.2)
    tail *= 0.5
    
    return fade_out(mix(boom, mid, crack, tail), 0.05)

def sfx_battle_skill():
    """技能释放 - 魔法咏唱"""
    # 蓄力感：上扫 + 颤音
    charge = pitch_sweep(200, 800, 0.3)
    charge = envelope(charge, attack=0.02, decay=0.1, sustain=0.6, release=0.05)
    charge *= 0.6
    
    # 魔法共鸣
    res1 = vibrato(523.25, 0.35, vib_rate=6, vib_depth=0.02)
    res1 = envelope(res1, attack=0.05, decay=0.1, sustain=0.5, release=0.1)
    res1 *= 0.5
    
    res2 = vibrato(783.99, 0.3, vib_rate=7, vib_depth=0.025)
    res2 = np.pad(res2, (int(0.05 * SAMPLE_RATE), 0))
    res2 = envelope(res2, attack=0.03, decay=0.08, sustain=0.5, release=0.1)
    res2 *= 0.4
    
    # 释放瞬间：高频爆发
    burst = noise(0.08, 0.8)
    burst = highpass(burst, 1500)
    burst = envelope(burst, attack=0.002, decay=0.04, sustain=0.2, release=0.04)
    burst = np.pad(burst, (int(0.28 * SAMPLE_RATE), 0))
    
    star = pitch_sweep(1000, 2500, 0.06)
    star = envelope(star, attack=0.003, decay=0.04, sustain=0.0, release=0.017)
    star = np.pad(star, (int(0.3 * SAMPLE_RATE), 0))
    star *= 0.6
    
    return fade_out(mix(charge, res1, res2, burst, star), 0.04)

def sfx_battle_sword_slash():
    """剑斩击 - 真实的剑刃破空声"""
    # 1. 主体嗖声 - 正弦波扫频，更真实
    # 从高频滑到中低频，模拟剑刃快速划过空气
    t = np.linspace(0, 0.15, int(SAMPLE_RATE * 0.15), endpoint=False)
    # 指数扫频：高频快速衰减到低频（更真实的斩击感）
    freq_curve = 4000 * np.exp(-t * 15) + 600  # 从4k指数降到600Hz
    phase = np.cumsum(2 * np.pi * freq_curve / SAMPLE_RATE)
    swoosh = np.sin(phase)
    # 斩击包络：快速起，快速衰减
    swoosh *= np.exp(-t * 8) * np.minimum(1, t * 50)  # 快速attack + 指数衰减
    
    # 2. 金属共鸣 - 像铃铛的衰减振动（不是噪声）
    t_ring = np.linspace(0, 0.35, int(SAMPLE_RATE * 0.35), endpoint=False)
    ring_freq = 2200 * np.exp(-t_ring * 6)  # 共鸣频率快速衰减
    ring_phase = np.cumsum(2 * np.pi * ring_freq / SAMPLE_RATE)
    ring = np.sin(ring_phase) * np.exp(-t_ring * 8)  # 铃音式衰减
    
    # 添加金属泛音
    ring += np.sin(ring_phase * 2.4) * 0.3 * np.exp(-t_ring * 10)  # 2.4倍频
    ring += np.sin(ring_phase * 3.2) * 0.15 * np.exp(-t_ring * 12)  # 3.2倍频
    ring *= 0.4
    
    # 3. 轻微的气流声 - 剑刃边缘的气流
    t_wind = np.linspace(0, 0.12, int(SAMPLE_RATE * 0.12), endpoint=False)
    wind = np.sin(2 * np.pi * 1500 * t_wind) * 0.2 * np.exp(-t_wind * 12)
    wind += np.sin(2 * np.pi * 2500 * t_wind) * 0.1 * np.exp(-t_wind * 15)
    
    # 组合：嗖声在前，共鸣在中后，气流垫底
    result = np.zeros(int(SAMPLE_RATE * 0.4))
    result[:len(swoosh)] += swoosh * 0.7  # 嗖声
    result[:len(ring)] += ring * 0.5      # 金属共鸣
    result[:len(wind)] += wind * 0.25     # 气流
    
    return fade_out(result, 0.02)

# ─────────────────────────────────────────
# 收集/奖励音效
# ─────────────────────────────────────────

def sfx_reward_coin():
    """金币收集 - 魔法金币"""
    notes = [1046.5, 1318.5, 1568.0]  # C6 E6 G6
    sigs = []
    for i, freq in enumerate(notes):
        dur = 0.12
        s = sine(freq, dur, 0.5)
        # 加入谐波模拟金属感（保持相同时长）
        s += sine(freq * 2, dur, 0.2)
        s += sine(freq * 3, dur, 0.1)
        s = envelope(s, attack=0.004, decay=0.05, sustain=0.3, release=0.065)
        pad = int(i * 0.04 * SAMPLE_RATE)
        sigs.append(np.pad(s, (pad, 0)))
    
    shimmer = noise(0.1, 0.15)
    shimmer = highpass(shimmer, 3000)
    shimmer = envelope(shimmer, attack=0.005, decay=0.05, sustain=0.1, release=0.04)
    sigs.append(shimmer)
    
    return fade_out(mix(*sigs), 0.02)

def sfx_reward_levelup():
    """升级音效 - 魔法加冕"""
    # 上行音阶
    scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5]  # C D E F G A B C
    sigs = []
    note_dur = 0.08
    for i, freq in enumerate(scale):
        s = sine(freq, note_dur, 0.55)
        s += sine(freq * 2, note_dur, 0.15)
        s = envelope(s, attack=0.005, decay=0.03, sustain=0.5, release=0.025)
        pad = int(i * 0.065 * SAMPLE_RATE)
        sigs.append(np.pad(s, (pad, 0)))
    
    # 最终和弦
    chord_notes = [1046.5, 1318.5, 1568.0, 2093.0]
    chord_start = int(0.52 * SAMPLE_RATE)
    for freq in chord_notes:
        s = sine(freq, 0.5, 0.3)
        s = envelope(s, attack=0.01, decay=0.1, sustain=0.5, release=0.15)
        s = np.pad(s, (chord_start, 0))
        sigs.append(s)
    
    # 魔法光芒
    sparkle = noise(0.3, 0.2)
    sparkle = highpass(sparkle, 4000)
    sparkle = envelope(sparkle, attack=0.02, decay=0.1, sustain=0.3, release=0.1)
    sparkle = np.pad(sparkle, (chord_start, 0))
    sigs.append(sparkle)
    
    return fade_out(mix(*sigs), 0.05)

def sfx_reward_achievement():
    """成就解锁 - 魔法宣告"""
    # 神圣感：宽泛的和弦 + 长余韵
    dur = 0.8
    freqs = [261.63, 329.63, 392.0, 523.25, 659.25]  # C E G C5 E5
    sigs = []
    for i, freq in enumerate(freqs):
        s = vibrato(freq, dur, vib_rate=4.5, vib_depth=0.01)
        s += sine(freq * 2, dur, 0.15)
        s = envelope(s, attack=0.04, decay=0.1, sustain=0.65, release=0.2)
        s *= 0.35
        delay = int(i * 0.04 * SAMPLE_RATE)
        sigs.append(np.pad(s, (delay, 0)))
    
    # 钟声效果
    bell_freqs = [1567.98, 2093.0, 2637.0]  # G6 C7 E7
    for i, freq in enumerate(bell_freqs):
        bell_dur = 0.4
        bell = sine(freq, bell_dur, 0.25)
        bell += sine(freq * 1.4, bell_dur, 0.1)  # 非谐波增加金属感
        bell = envelope(bell, attack=0.003, decay=0.1, sustain=0.2, release=0.2)
        delay = int((0.1 + i * 0.08) * SAMPLE_RATE)
        sigs.append(np.pad(bell, (delay, 0)))
    
    # 闪光尾音
    sparkle = noise(0.5, 0.15)
    sparkle = highpass(sparkle, 5000)
    sparkle = envelope(sparkle, attack=0.05, decay=0.15, sustain=0.2, release=0.2)
    sparkle = np.pad(sparkle, (int(0.2 * SAMPLE_RATE), 0))
    sigs.append(sparkle)
    
    return fade_out(mix(*sigs), 0.06)


# ─────────────────────────────────────────
# 主程序
# ─────────────────────────────────────────

def main():
    print("\n🎵 奇幻/魔法风格游戏音效生成器")
    print("=" * 40)
    
    base = os.path.dirname(os.path.abspath(__file__))
    
    print("\n📱 UI 音效")
    export_mp3(sfx_ui_click(),   f"{base}/ui/ui_click.mp3")
    export_mp3(sfx_ui_popup(),   f"{base}/ui/ui_popup.mp3")
    export_mp3(sfx_ui_confirm(), f"{base}/ui/ui_confirm.mp3")
    export_mp3(sfx_ui_cancel(),  f"{base}/ui/ui_cancel.mp3")
    
    print("\n⚔️  战斗音效")
    export_mp3(sfx_battle_attack(),     f"{base}/battle/battle_attack.mp3")
    export_mp3(sfx_battle_hit(),        f"{base}/battle/battle_hit.mp3")
    export_mp3(sfx_battle_explosion(),  f"{base}/battle/battle_explosion.mp3")
    export_mp3(sfx_battle_skill(),      f"{base}/battle/battle_skill.mp3")
    export_mp3(sfx_battle_sword_slash(), f"{base}/battle/battle_sword_slash.mp3")
    
    print("\n🏆 收集/奖励音效")
    export_mp3(sfx_reward_coin(),        f"{base}/reward/reward_coin.mp3")
    export_mp3(sfx_reward_levelup(),     f"{base}/reward/reward_levelup.mp3")
    export_mp3(sfx_reward_achievement(), f"{base}/reward/reward_achievement.mp3")
    
    print("\n✅ 全部生成完成！")
    print(f"📁 输出目录：{base}")
    print("\n文件列表：")
    for folder in ['ui', 'battle', 'reward']:
        folder_path = os.path.join(base, folder)
        for f in sorted(os.listdir(folder_path)):
            if f.endswith('.mp3'):
                size = os.path.getsize(os.path.join(folder_path, f))
                print(f"  {folder}/{f}  ({size/1024:.1f} KB)")

if __name__ == '__main__':
    main()
