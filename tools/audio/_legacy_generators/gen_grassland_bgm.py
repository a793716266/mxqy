"""
阳光草原副本 BGM 生成器
复用 generate_bgm.py 的振荡器/合成器/导出管线，写一首明亮欢快的大调田园曲。
和弦进行：G - D - Em - C（阳光、开阔、治愈）
乐器：吉他分解和弦(pluck) + 弦乐垫(string_pad) + 风铃(bell) + 轻打击(hat/clap)
"""

from generate_bgm import (
    silence, dur2n, ch, n2f, fade_in, fade_out,
    string_pad, pluck, bell, lead, hat_o, clap_fn,
    render_events, export,
)

SR = 44100

def make_grassland():
    tempo = 108
    beat = 60 / tempo
    bar = beat * 4
    total = 32.0

    # 明亮大调进行：G - D - Em - C（田园 / 阳光感）
    chord_prog = [ch('G', 5), ch('D', 5), ch('Em', 5), ch('C', 5)]

    # 弦乐垫（柔和铺底）
    sig = silence(total)
    for rep in range(4):
        for ci, c in enumerate(chord_prog):
            t = ci * bar + rep * bar * 4
            if t >= total:
                break
            cs = string_pad(c, bar * 0.95, amp=0.18, a=0.3)
            cs = fade_out(fade_in(cs, 0.12), 0.2)
            s = dur2n(t)
            e = min(s + len(cs), len(sig))
            sig[s:e] += cs[:e - s]

    # 吉他分解和弦（明亮 pluck）
    for rep in range(4):
        for ci, c in enumerate(chord_prog):
            t0 = ci * bar + rep * bar * 4
            if t0 >= total:
                break
            c2 = c * 2
            for si, fn in enumerate(c2[:6]):
                st = t0 + si * (beat / 4)
                if st >= total:
                    break
                g = pluck(fn, beat * 0.55, a=0.006, r=beat * 0.35) * 0.34
                s = dur2n(st)
                e = min(s + len(g), len(sig))
                sig[s:e] += g[:e - s]

    # 风铃 / 阳光闪烁（高频 bell，稀疏点缀）
    bells = [n2f('G6'), n2f('D6'), n2f('B6'), n2f('E6'), n2f('A6')]
    for rep in range(4):
        for ci, fn in enumerate(bells):
            t = ci * bar + rep * bar * 4 + beat * 1.5
            if t >= total:
                break
            b = bell(fn, beat * 1.2, amp=0.12)
            s = dur2n(t)
            e = min(s + len(b), len(sig))
            sig[s:e] += b[:e - s]

    # 轻打击（柔和 shaker + 偶尔 clap）
    events = []
    for rep in range(4):
        for ci in range(4):
            t = ci * beat + rep * bar * 4
            if t >= total:
                break
            events.append((t, hat_o(0.18) * 0.16))
            if ci >= 2:
                events.append((t, clap_fn() * 0.22))
    perc = render_events(events, total)

    # 主旋律（欢快、G 大调五声）
    mel = [
        (n2f('G5'), beat), (n2f('A5'), beat), (n2f('B5'), beat * 2), (n2f('D6'), beat),
        (n2f('B5'), beat), (n2f('A5'), beat * 2), (n2f('E5'), beat), (n2f('G5'), beat),
        (n2f('A5'), beat * 2), (n2f('D6'), beat), (n2f('B5'), beat), (n2f('G5'), beat * 2),
    ]
    t = 0.0
    for fn, nd in mel:
        if t >= total:
            break
        l = lead(fn, nd, amp=0.34)
        s = dur2n(t)
        e = min(s + len(l), len(sig))
        sig[s:e] += l[:e - s]
        t += nd

    return fade_out(fade_in(sig * 0.72 + perc * 0.4, 0.2), 1.0)


def main():
    import os
    base = os.path.dirname(os.path.abspath(__file__))
    print("\n☀ 阳光草原副本 BGM")
    export(make_grassland(), f"{base}/grassland.mp3")


if __name__ == '__main__':
    main()
