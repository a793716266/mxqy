#!/usr/bin/env python3
"""
diagnose_audio.py —— 用行业标准给母版做「专业度体检」

用户说"感觉还是不够专业"时，靠耳朵猜是没用的。这个脚本把主观听感翻译成客观指标，
对照游戏音频行业标准，把"不专业"定位到具体数字上。

════════════════════════════════════════════════════════════════
判定基准（微信小游戏 = 移动/掌机平台）
════════════════════════════════════════════════════════════════
来源：Sony ASWG-R001、EBU R128 / ITU-R BS.1770、ITU-T H.872、GANG 建议

  · 集成响度 LUFS  ：移动/掌机 -18 LUFS ± 2  → 合格区间 -20.0 ~ -16.0
                    （主机/PC 才是 -23~-24；别拿错标准）
  · 真峰值 True Peak：≤ -1.0 dBTP（所有平台统一）
                    codec 和定点输出都怕削波，这是硬红线
  · 响度范围 LRA   ：便携 10~15 LU，主机 ≤20 LU
                    太低=压扁了没生气，太高=手机小喇叭上忽大忽小
  · 峰均比 Crest   ：≥ 8 dB。低于 8dB 说明过度压缩，听感疲劳
                    （管弦乐现场录音通常 14~20dB，重压流行乐 8~10dB）

另外输出：
  · 频段平衡 —— 定位"浑浊/刺耳/发闷"这类主观描述的客观来源
  · 立体声相关 —— 单声道兼容性（手机外放很多是单声道）
  · 频谱质心 —— 明亮度

用法：.venv/bin/python tools/audio/diagnose_audio.py
"""
import os
import sys

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meow_audio import dsp as D, qa as Q

HERE = os.path.dirname(os.path.abspath(__file__))
WAV = os.path.join(HERE, 'out', 'wav')

# ── 判定基准 ──────────────────────────────────────────────────
LUFS_MIN, LUFS_MAX = -20.0, -16.0     # 移动平台 -18 ± 2
TP_MAX = -1.0                          # 真峰值上限
LRA_MIN, LRA_MAX = 10.0, 15.0          # 便携建议区间（放宽到 8~18 才算"失败线"）
LRA_FAIL_MIN, LRA_FAIL_MAX = 8.0, 18.0
CREST_MIN = 8.0                        # 峰均比下限（低于此=过度压缩）


def load(path):
    sr, x = wavfile.read(path)
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2 and x.shape[1] == 1:
        x = x[:, 0]
    return sr, x


def lra(x, sr):
    """
    EBU Tech 3342 响度范围（LRA）。

    ★ 直接复用 dsp.lra —— 这里曾经有一份独立实现，两份算法会各自漂移：
      那份用的是「逐窗独立 K 加权」，而 dsp 里改成了整段连续加权（低频漂移
      大的素材差 3.5dB）。测量口径必须只有一份，否则"整改到位了没有"永远是
      一笔糊涂账。
    短于 3 秒的素材（绝大多数音效）无法计算，返回 None。
    """
    if len(x) < 3.0 * sr:
        return None
    v = D.lra(x, sr)
    return v if v > 0 else None


BANDS = [
    ('sub', 20, 60), ('low', 60, 250), ('lowmid', 250, 500),
    ('mid', 500, 2000), ('himid', 2000, 4000),
    ('high', 4000, 10000), ('air', 10000, 22050),
]


def band_balance(x, sr):
    """各频段相对总能量的占比（dB）。定位浑浊(lowmid堆积)/发闷(air缺失)/刺耳(himid过冲)。"""
    mono = x.mean(axis=1) if x.ndim == 2 else x
    n = len(mono)
    frame = 8192
    if n < frame:
        return {}
    win = np.hanning(frame)
    specs = [np.abs(np.fft.rfft(mono[i:i + frame] * win))
             for i in range(0, n - frame + 1, frame // 2)]
    if not specs:
        return {}
    S = np.mean(specs, axis=0)
    freqs = np.fft.rfftfreq(frame, 1.0 / sr)
    total = np.sum(S ** 2) + 1e-20
    out = {}
    for name, lo, hi in BANDS:
        idx = (freqs >= lo) & (freqs < min(hi, sr // 2))
        if not idx.any():
            continue
        out[name] = float(10 * np.log10(np.sum(S[idx] ** 2) / total + 1e-20))
    return out


def stereo_corr(x):
    """立体声相关系数。手机外放多为单声道，相关性过低（<0）会在降混时相位抵消。"""
    if x.ndim == 2 and x.shape[1] == 2:
        return float(np.corrcoef(x[:, 0], x[:, 1])[0, 1])
    return None


def load_targets():
    """读 build_sfx 导出的分类目标清单 {文件名: {cat, lufs, tp}}"""
    p = Q.sfx_targets_path()          # 与生成端共用同一份路径定义，别再各写各的
    if not os.path.exists(p):
        return {}
    import json
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def check(name, path, kind, targets=None):
    sr, x = load(path)
    l = D.lufs(x, sr)
    tp = D.true_peak_db(x, sr)
    cr = D.crest_db(x)
    lr = lra(x, sr)
    cen = D.spectral_centroid(x, sr)
    cor = stereo_corr(x)
    bal = band_balance(x, sr) if kind == 'BGM' else {}

    issues = []
    if kind == 'SFX':
        # ★ 按各自分类的目标判，不拿 BGM 的 -18±2 硬套 ——
        #   UI -20、奖励 -15 都是刻意的强弱梯度，套 BGM 标准会把 23/41 个
        #   音效误报成"不合格"，真问题被噪音淹掉（上一版就是这样）。
        t = (targets or {}).get(name)
        if t and abs(l - t['lufs']) > 0.3:
            issues.append(f"LUFS {l:+.2f} 偏离 {t['cat']} 档目标 "
                          f"{t['lufs']:+.1f}（差 {l - t['lufs']:+.2f}）")
        elif t and tp > t['tp'] + 0.3:
            issues.append(f"真峰值 {tp:+.2f}dBTP 超过 {t['cat']} 档上限 "
                          f"{t['tp']:+.1f}")
    elif not (LUFS_MIN <= l <= LUFS_MAX):
        issues.append(f'LUFS {l:+.1f} 超出 -18±2')
    if tp > TP_MAX:
        issues.append(f'真峰值 {tp:+.2f}dBTP > -1')
    if lr is not None and not (LRA_FAIL_MIN <= lr <= LRA_FAIL_MAX):
        issues.append(f'LRA {lr:.1f}LU 超出 {LRA_FAIL_MIN}~{LRA_FAIL_MAX}')
    if cr < CREST_MIN and kind == 'BGM':
        issues.append(f'峰均比 {cr:.1f}dB < {CREST_MIN}（过度压缩）')
    if cor is not None and cor < 0.0:
        issues.append(f'立体声相关 {cor:+.2f} < 0（单声道降混会相位抵消）')

    return dict(name=name, kind=kind, lufs=l, tp=tp, crest=cr, lra=lr,
                centroid=cen, corr=cor, bal=bal, issues=issues,
                dur=len(x) / sr)


def main():
    targets = load_targets()
    rows = []
    for f in sorted(os.listdir(WAV)):
        if f.endswith('.wav'):
            rows.append(check(f[:-4], os.path.join(WAV, f), 'BGM', targets))
    sfx_dir = os.path.join(WAV, 'sfx')
    if os.path.isdir(sfx_dir):
        for f in sorted(os.listdir(sfx_dir)):
            if f.endswith('.wav'):
                rows.append(check(f[:-4], os.path.join(sfx_dir, f), 'SFX', targets))

    # ── 明细表 ──
    print('=' * 100)
    print('母版专业度体检（基准：移动/掌机 -18±2 LUFS, TP≤-1dBTP, LRA 8~18, crest≥8dB）')
    print('=' * 100)
    print(f'{"素材":<22}{"LUFS":>7}{"真峰值":>9}{"峰均比":>8}{"LRA":>7}'
          f'{"质心":>8}{"立体声":>8}  判定')
    print('-' * 100)
    for r in rows:
        lr = f'{r["lra"]:.1f}' if r['lra'] is not None else '  —'
        cor = f'{r["corr"]:+.2f}' if r['corr'] is not None else '  —'
        flag = '✓' if not r['issues'] else '✗ ' + '; '.join(r['issues'])
        print(f'{r["kind"]+" "+r["name"]:<22}{r["lufs"]:>+6.1f}{r["tp"]:>+8.2f}'
              f'{r["crest"]:>7.1f}{lr:>7}{r["centroid"]:>7.0f}{cor:>8}  {flag}')

    # ── 汇总 ──
    bgm = [r for r in rows if r['kind'] == 'BGM']
    sfx = [r for r in rows if r['kind'] == 'SFX']
    bad = [r for r in rows if r['issues']]

    print('\n' + '=' * 100)
    print('汇总')
    print('=' * 100)
    if bgm:
        lufs = [r['lufs'] for r in bgm]
        crest = [r['crest'] for r in bgm]
        lras = [r['lra'] for r in bgm if r['lra'] is not None]
        print(f'BGM  {len(bgm)} 首')
        print(f'  LUFS   : {min(lufs):+.1f} ~ {max(lufs):+.1f} '
              f'(均值 {np.mean(lufs):+.1f}, 目标 -18±2)')
        if lras:
            print(f'  LRA    : {min(lras):.1f} ~ {max(lras):.1f} LU '
                  f'(便携建议 10~15)')
        print(f'  峰均比 : {min(crest):.1f} ~ {max(crest):.1f} dB '
              f'(≥{CREST_MIN} 为不过压；管弦乐现场 14~20dB)')
    if sfx:
        tp = [r['tp'] for r in sfx]
        print(f'SFX  {len(sfx)} 个')
        print(f'  真峰值 : {min(tp):+.2f} ~ {max(tp):+.2f} dBTP (上限 -1)')
        # ★ 真正要盯的是**分类内**跨度：跨类是刻意的强弱梯度，类内散开才是 bug。
        #   玩家抱怨的"开宝箱比怪物出场还响"永远发生在同一个分类内部，
        #   所以判据是类内 ≤1 LU，不是全体 ≤N LU。
        by_cat = {}
        for r in sfx:
            t = targets.get(r['name'])
            if t:
                by_cat.setdefault(t['cat'], []).append(r['lufs'])
        if not by_cat:
            print('  （缺 out/sfx_targets.json，无法按类归档 —— 先跑 build_sfx.py）')
        else:
            print('  分类内响度跨度（判据 ≤1.0 LU；跨类的强弱差是刻意设计）:')
            worst = 0.0
            for cat in sorted(by_cat, key=lambda c: -max(by_cat[c])):
                v = by_cat[cat]
                sp = max(v) - min(v)
                worst = max(worst, sp)
                tgt = Q.SFX_LOUDNESS_BY_CAT[cat][0]
                flag = '' if sp <= 1.0 else '  ✗ 类内散开'
                print(f'    {cat:8s} n={len(v):2d}  目标 {tgt:+.1f}  '
                      f'实测 {min(v):+.2f} ~ {max(v):+.2f}  跨度 {sp:.2f} LU{flag}')
            print(f'  最大类内跨度 {worst:.2f} LU '
                  f'({"达标" if worst <= 1.0 else "不达标，见问题清单"})')

    # ── BGM 频段平衡 ──
    if bgm and bgm[0]['bal']:
        print('\n' + '=' * 100)
        print('BGM 频段平衡（相对总能量 dB）—— 定位浑浊/发闷/刺耳')
        print('=' * 100)
        names = list(bgm[0]['bal'].keys())
        print(f'{"素材":<18}' + ''.join(f'{n:>9}' for n in names))
        print('-' * 100)
        for r in bgm:
            print(f'{r["name"]:<18}' + ''.join(f'{r["bal"][n]:>+9.1f}' for n in names))
        print('-' * 100)
        print('参考：健康的管弦乐混音 low 与 mid 应有足够支撑，air 在 -25~-35dB 之间；')
        print('      lowmid(250-500) 若明显高于 mid 会「浑浊」，air 低于 -40 会「发闷」。')

    print('\n' + '=' * 100)
    print(f'合计 {len(rows)} 个素材，{len(rows) - len(bad)} 达标 / {len(bad)} 有问题')
    if bad:
        print('\n问题清单：')
        for r in bad:
            print(f'  - {r["kind"]} {r["name"]}: {"; ".join(r["issues"])}')
    print('=' * 100)


if __name__ == '__main__':
    main()
