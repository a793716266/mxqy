"""
qa.py —— 客观质检

对生成的音频做可量化的检查。听感最终由人耳判定，但这些指标能
把"明显不合格"挡在交付之前：

  · LUFS       : 多曲目响度是否一致（切歌时不忽大忽小）
  · 真峰值 dBTP: 是否会在 DA 转换后削波
  · crest      : 动态是否被压扁（低于 8dB 说明过度压缩，听感疲劳）
  · 频谱重心   : 明亮度是否合理（分帧能量加权，不是只看开头）
  · 分频段能量 : 频率平衡（低音糊 / 高音刺 都能看出来）
  · 循环接缝   : 接缝跳变是否大于信号内部平均跳变（会不会有"咔哒"）
  · 削波率     : 是否有采样点触及满刻度
"""

import os

import numpy as np

from . import dsp as D
from .dsp import SR


def sfx_targets_path():
    """
    分类目标清单的落盘位置 —— 生成端与体检端必须指向同一个文件。

    ★ 曾经两边各写各的：build_sfx 用 os.path.join(OUT_MP3, '..', 'sfx_targets.json')，
      但 OUT_MP3 本身就是 out/mp3/sfx，算出来是 out/mp3/sfx_targets.json；
      diagnose_audio 却读 out/sfx_targets.json —— 于是清单永远"不存在"，
      体检端静默退化成拿 BGM 的 -18±2 去套音效，23/41 被误报。
      路径这种东西只要有两份，就一定会漂移，所以收敛到这里。
    """
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(root, 'out', 'sfx_targets.json')

# ★ 音效分类响度目标的**唯一事实源**（(目标 LUFS, 真峰值上限 dBTP)）。
#   build_sfx 用它来归一，diagnose_audio 用它来判定 —— 两边共用一份，
#   就不会出现"体检报告说 23 个音效不合格，其实全都是按分类目标精确命中的"。
#
#   分档依据是「玩家必须听到的程度」（功能重要性），不是音色 —— 这是游戏
#   音频的标准做法。UI 点击一局要点几百次，必须克制否则疲劳；BOSS 死亡是
#   里程碑事件，必须盖过一切。
#
#   所以**绝不能把 BGM 的 -18±2 LUFS 套到音效上**：那些 -15 的奖励音、
#   -20 的 UI 音都是刻意的强弱梯度。体检时按各自分类的目标判，跨类不比。
SFX_LOUDNESS_BY_CAT = {
    'ui':      (-20.0, -5.0),   # 安静、不打扰，且高频重复不容疲劳
    'hud':     (-17.0, -3.5),   # 伤害/治疗飘字反馈（比 UI 响，但不当主角）
    'battle':  (-16.0, -3.0),   # 打击必须穿透 BGM
    'magic':   (-15.5, -3.0),   # 技能要有存在感
    'monster': (-16.5, -3.5),
    'reward':  (-15.0, -3.0),   # 愉悦、值得"跳出来"
    'system':  (-16.0, -3.0),
}

# 循环点阶跃上限（dB）。
#   0.0 的含义：循环点那一个样本的跳变，不得超过邻域内 99.9% 的正常过渡。
#   见 dsp.loop_seam_error 的 docstring —— 旧判据是拿接缝窗均值比全曲中段均值，
#   量的是"这里热不热闹"而不是"这里断没断"，bgm_grassland 被它误报 6.63dB，
#   实测循环点阶跃只有邻域最大差分的 0.30 倍，根本没有咔哒。
SEAM_MAX_DB = 0.0

# 目标区间（超出即告警）
TARGET = {
    'bgm': dict(lufs=(-20.0, -15.0), tp_max=-0.5, crest=(9.0, 20.0),
                centroid=(500.0, 6000.0), clip_max=1e-5, seam_max=SEAM_MAX_DB),
    # SFX 的 LUFS 由上面的分类目标单独判（见 diagnose_audio），这里只兜底
    # 一个极宽的物理可行区间，用来抓 NaN / 静音 / 爆音这类真异常。
    'sfx': dict(lufs=(-40.0, -5.0), tp_max=-0.5, crest=(4.0, 26.0),
                centroid=(250.0, 13000.0), clip_max=1e-5, seam_max=99.0),
}


def analyze(y, sr=SR, kind='bgm'):
    y = np.asarray(y, dtype=np.float64)
    mono = y.mean(axis=-1) if y.ndim == 2 else y
    bands = D.band_energy_db(y, sr=sr)
    corr = 1.0
    if y.ndim == 2:
        c = np.corrcoef(y[:, 0], y[:, 1])[0, 1]
        corr = float(c) if np.isfinite(c) else 1.0

    return dict(
        dur_s=len(y) / sr,
        lufs=D.lufs(y, sr),
        tp_db=D.true_peak_db(y, sr),
        rms_db=D.rms_db(mono),
        crest_db=D.crest_db(mono),
        centroid_hz=D.spectral_centroid(y, sr),
        band_db=dict(zip(('sub20_250', 'low250_2k', 'mid2k_6k', 'high6k_20k'), bands)),
        clip_ratio=D.clip_ratio(y),
        dc=D.dc_offset(mono),
        stereo_corr=corr,
        seam_db=D.loop_seam_error(y, sr),
        finite=bool(np.isfinite(y).all()),
    )


def check(r, kind='bgm'):
    """返回问题列表（空 = 通过）"""
    t = TARGET[kind]
    issues = []
    lo, hi = t['lufs']
    if not (lo <= r['lufs'] <= hi):
        issues.append(f"LUFS {r['lufs']:.2f} 超出目标区间 [{lo}, {hi}]")
    if r['tp_db'] > t['tp_max']:
        issues.append(f"真峰值 {r['tp_db']:.2f}dBTP 超过天花板 {t['tp_max']}dBTP")
    lo, hi = t['crest']
    if not (lo <= r['crest_db'] <= hi):
        issues.append(f"峰均比 {r['crest_db']:.1f}dB 超出 [{lo}, {hi}]（动态过大或过度压缩）")
    lo, hi = t['centroid']
    if not (lo <= r['centroid_hz'] <= hi):
        issues.append(f"频谱重心 {r['centroid_hz']:.0f}Hz 超出 [{lo:.0f}, {hi:.0f}]（过暗或过亮）")
    if r['clip_ratio'] > t['clip_max']:
        issues.append(f"削波率 {r['clip_ratio']:.6f} 过高")
    if r['seam_db'] > t['seam_max']:
        issues.append(f"循环点阶跃 {r['seam_db']:.1f}dB（会听到咔哒声）")
    if abs(r['dc']) > 1e-3:
        issues.append(f"直流偏移 {r['dc']:.2e} 过大")
    if not r['finite']:
        issues.append("存在 NaN/Inf")
    return issues


def fmt_row(name, r, kind='bgm'):
    iss = check(r, kind)
    flag = 'OK  ' if not iss else 'WARN'
    return (f"| {name} | {r['dur_s']:.1f}s | {r['lufs']:.2f} | {r['tp_db']:.2f} | "
            f"{r['crest_db']:.1f} | {r['centroid_hz']:.0f} | {r['stereo_corr']:.2f} | "
            f"{r['seam_db']:+.1f} | {flag} |"), iss


# ============================================================
# SVG 波形图（无第三方依赖）
# ============================================================

def wave_svg(y, w=760, h=96, fg='#2c5282', bg='#f7fafc', grid='#e2e8f0'):
    """峰值包络波形图。降采样时保留每段的 min/max，波形才不会失真。"""
    y = np.asarray(y, dtype=np.float64)
    mono = y.mean(axis=-1) if y.ndim == 2 else y
    n = len(mono)
    cols = w
    step = max(1, n // cols)
    tops, bots = [], []
    for i in range(cols):
        seg = mono[i * step: min((i + 1) * step, n)]
        if len(seg) == 0:
            break
        mx, mn = float(seg.max()), float(seg.min())
        tops.append(mx)
        bots.append(mn)
    if not tops:
        return ''
    peak = max(max(tops), -min(bots), 1e-9)
    mid = h / 2.0
    scale = (h / 2.0 - 2.0) / peak

    pts = []
    for i, v in enumerate(tops):
        pts.append(f"{i:.1f},{mid - v * scale:.1f}")
    for i in range(len(bots) - 1, -1, -1):
        pts.append(f"{i:.1f},{mid - bots[i] * scale:.1f}")

    return (f'<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'preserveAspectRatio="none" style="background:{bg};display:block">'
            f'<line x1="0" y1="{mid}" x2="{w}" y2="{mid}" stroke="{grid}" stroke-width="1"/>'
            f'<polygon points="{" ".join(pts)}" fill="{fg}" fill-opacity="0.85"/>'
            f'</svg>')


def spectrum_svg(y, sr=SR, w=760, h=96, fg='#2f855a', bg='#f7fafc', grid='#e2e8f0'):
    """对数频谱图（20Hz - 20kHz），用于看频率平衡"""
    y = np.asarray(y, dtype=np.float64)
    mono = y.mean(axis=-1) if y.ndim == 2 else y
    n = len(mono)
    N = min(n, 1 << 16)
    wnd = np.hanning(N)
    mag = np.abs(np.fft.rfft(mono[:N] * wnd))
    freqs = np.fft.rfftfreq(N, 1.0 / sr)
    db = 20 * np.log10(np.maximum(mag, 1e-10))
    db -= db.max()

    # 对数频率轴
    fmin, fmax = 20.0, min(20000.0, sr / 2)
    pts = []
    buckets = w
    for i in range(buckets):
        f0 = fmin * (fmax / fmin) ** (i / buckets)
        f1 = fmin * (fmax / fmin) ** ((i + 1) / buckets)
        m = (freqs >= f0) & (freqs < f1)
        v = db[m].max() if m.any() else -100.0
        v = float(np.clip(v, -72.0, 0.0))
        yy = h - (v + 72.0) / 72.0 * (h - 2) - 1
        pts.append(f"{i:.1f},{yy:.1f}")
    pts.append(f"{w},{h}")
    pts.append(f"0,{h}")
    return (f'<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'preserveAspectRatio="none" style="background:{bg};display:block">'
            f'<polygon points="{" ".join(pts)}" fill="{fg}" fill-opacity="0.75"/>'
            f'</svg>')
