"""
build_qa.py —— 生成客观质检报告 + 试听站（HTML）

扫描 tools/audio/out/wav 下所有 BGM 与 sfx，逐文件做量化质检：
  LUFS / 真峰值 dBTP / 峰均比 crest / 频谱重心 / 立体声相关 / 循环点阶跃 / 削波率
并生成自包含 HTML：包含波形图、频谱图、<audio> 试听，以及逐文件 PASS/WARN。

用法：python build_qa.py
输出：out/qa_report.html
"""
import os
import sys
import glob
import html
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from scipy.io import wavfile

from meow_audio import dsp as D
from meow_audio import qa as Q
from meow_audio.dsp import SR

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
WAV_BGM = os.path.join(OUT, 'wav')
WAV_SFX = os.path.join(OUT, 'wav', 'sfx')
MP3_BGM = 'mp3'
MP3_SFX = 'mp3/sfx'

CAT_LABEL = {
    'ui': 'UI 界面', 'battle': '打击 / 战斗', 'magic': '技能释放',
    'monster': '怪物', 'reward': '奖励', 'system': '系统 / 流程',
}

# (文件名不含扩展名, 分类, kind)
BGM_FILES = [
    ('bgm_menu', 'menu', 'bgm'), ('bgm_town', 'town', 'bgm'),
    ('bgm_explore', 'explore', 'bgm'), ('bgm_grassland', 'grassland', 'bgm'),
    ('bgm_battle', 'battle', 'bgm'), ('bgm_boss', 'boss', 'bgm'),
    ('bgm_victory', 'victory', 'bgm'),
]


def load_wav(path):
    sr, data = wavfile.read(path)
    data = data.astype(np.float64)
    if data.ndim == 1:
        data = data[:, None]
    if data.shape[1] == 1:
        data = np.repeat(data, 2, axis=1)
    # 32-bit float wav 已经是 [-1,1]；16-bit 需除 32768
    if data.max() > 1.5:
        data /= 32768.0
    return data, sr


def collect_sfx():
    rows = []
    for p in sorted(glob.glob(os.path.join(WAV_SFX, '*.wav'))):
        base = os.path.splitext(os.path.basename(p))[0]
        rows.append((base, 'sfx', 'sfx'))
    return rows


def esc(s):
    return html.escape(str(s))


def card(name, cat, kind, wav_path, mp3_rel):
    y, sr = load_wav(wav_path)
    r = Q.analyze(y, sr=sr, kind=kind)
    issues = Q.check(r, kind)
    flag = 'PASS' if not issues else 'WARN'
    flag_cls = 'pass' if flag == 'PASS' else 'warn'

    # 频率平衡条
    bd = r['band_db']
    band_labels = [('sub20_250', 'Sub'), ('low250_2k', 'Low'),
                   ('mid2k_6k', 'Mid'), ('high6k_20k', 'High')]
    maxb = max(bd.values())
    bars = ''
    for k, lab in band_labels:
        v = bd[k]
        pct = max(2.0, min(100.0, (v - (maxb - 48)) / 48.0 * 100)) if maxb > -100 else 2.0
        bars += (f'<div class="bar" title="{lab}: {v:.1f} dB">'
                 f'<span style="width:{pct:.0f}%"></span></div>')

    issues_html = ''
    if issues:
        issues_html = '<div class="issues">' + ''.join(
            f'<div class="issue">⚠ {esc(i)}</div>' for i in issues) + '</div>'

    # 只显示前 ~1.2s 的波形（BGM 太长，取开头一段代表）
    disp = y[:min(len(y), int(sr * 1.2))] if kind == 'bgm' else y
    wave = Q.wave_svg(disp, w=720, h=84)
    spec = Q.spectrum_svg(disp, sr=sr, w=720, h=84)

    return f"""
    <div class="card">
      <div class="chead">
        <span class="fname">{esc(name)}</span>
        <span class="badge {flag_cls}">{flag}</span>
      </div>
      <div class="metrics">
        <span>时长 <b>{r['dur_s']:.2f}s</b></span>
        <span>LUFS <b>{r['lufs']:.2f}</b></span>
        <span>TP <b>{r['tp_db']:+.2f}</b>dBTP</span>
        <span>crest <b>{r['crest_db']:.1f}</b>dB</span>
        <span>质心 <b>{r['centroid_hz']:.0f}</b>Hz</span>
        <span>相关 <b>{r['stereo_corr']:.2f}</b></span>
        <span>接缝 <b>{r['seam_db']:+.1f}</b>dB</span>
        <span>削波 <b>{r['clip_ratio']:.2e}</b></span>
      </div>
      <div class="specbars">{bars}</div>
      <div class="svgs">{wave}{spec}</div>
      <div class="player"><audio controls preload="none" src="{esc(mp3_rel)}"></audio></div>
      {issues_html}
    </div>"""


def main():
    files = list(BGM_FILES) + collect_sfx()
    counts = {'PASS': 0, 'WARN': 0}
    band_summary = {}   # cat -> [(name, flag, r)]
    card_by_name = {}   # name -> html card

    for name, cat, kind in files:
        if kind == 'bgm':
            wav_path = os.path.join(WAV_BGM, name + '.wav')
            mp3_rel = f'{MP3_BGM}/{name}.mp3'
        else:
            wav_path = os.path.join(WAV_SFX, name + '.wav')
            mp3_rel = f'{MP3_SFX}/{name}.mp3'
        if not os.path.exists(wav_path):
            continue
        y, sr = load_wav(wav_path)
        r = Q.analyze(y, sr=sr, kind=kind)
        flag = 'PASS' if not Q.check(r, kind) else 'WARN'
        counts[flag] += 1
        band_summary.setdefault(cat, []).append((name, flag, r))
        card_by_name[name] = card(name, cat, kind, wav_path, mp3_rel)

    total = counts['PASS'] + counts['WARN']
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')

    cat_order = ['menu', 'town', 'explore', 'grassland', 'battle', 'boss', 'victory',
                 'ui', 'magic', 'monster', 'reward', 'system']
    ordered = []
    for cat in cat_order:
        if cat not in band_summary:
            continue
        label = CAT_LABEL.get(cat, cat)
        prefix = 'BGM · ' if cat in ('menu', 'town', 'explore', 'grassland',
                                      'battle', 'boss', 'victory') else 'SFX · '
        ordered.append(f'<h3>{esc(prefix + label)}</h3>')
        ordered.append('<div class="grid">')
        for name, flag, r in band_summary[cat]:
            ordered.append(card_by_name[name])
        ordered.append('</div>')

    doc = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>喵星奇缘 · 音频质检与试听</title>
<style>
* {{ box-sizing:border-box; }}
body {{ font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
  margin:0; background:#0f172a; color:#e2e8f0; padding:24px; }}
.wrap {{ max-width:1200px; margin:0 auto; }}
h1 {{ font-size:24px; margin:0 0 4px; }}
.sub {{ color:#94a3b8; font-size:13px; margin-bottom:18px; }}
.summary {{ display:flex; gap:12px; margin-bottom:22px; }}
.pill {{ background:#1e293b; border:1px solid #334155; border-radius:10px;
  padding:12px 18px; flex:1; }}
.pill .n {{ font-size:26px; font-weight:700; }}
.pill.pass .n {{ color:#4ade80; }} .pill.warn .n {{ color:#fbbf24; }}
.pill .l {{ color:#94a3b8; font-size:12px; }}
h3 {{ border-left:3px solid #38bdf8; padding-left:10px; margin:26px 0 12px;
  font-size:16px; color:#bae6fd; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr));
  gap:14px; }}
.card {{ background:#1e293b; border:1px solid #334155; border-radius:12px;
  padding:12px 14px; }}
.chead {{ display:flex; justify-content:space-between; align-items:center;
  margin-bottom:8px; }}
.fname {{ font-family:ui-monospace,Menlo,monospace; font-size:13px; color:#e2e8f0; }}
.badge {{ font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; }}
.badge.pass {{ background:#14532d; color:#86efac; }}
.badge.warn {{ background:#78350f; color:#fcd34d; }}
.metrics {{ display:flex; flex-wrap:wrap; gap:6px 14px; font-size:11px;
  color:#cbd5e1; margin-bottom:8px; }}
.metrics b {{ color:#f1f5f9; font-weight:600; }}
.specbars {{ display:flex; gap:3px; margin-bottom:8px; }}
.bar {{ flex:1; height:6px; background:#0f172a; border-radius:3px; overflow:hidden; }}
.bar span {{ display:block; height:100%; background:#475569; }}
.svgs svg {{ width:100%; height:84px; border-radius:6px; margin-bottom:4px; }}
.player audio {{ width:100%; height:32px; }}
.issues {{ margin-top:6px; }}
.issue {{ color:#fcd34d; font-size:11px; }}
.legend {{ color:#64748b; font-size:11px; margin-top:24px; }}
</style></head>
<body><div class="wrap">
<h1>喵星奇缘 · 音频质检与试听站</h1>
<div class="sub">生成于 {now} · 管弦乐 + 民谣混合风格 · 纯程序化合成（无采样库）</div>
<div class="summary">
  <div class="pill"><div class="n">{total}</div><div class="l">总文件数</div></div>
  <div class="pill pass"><div class="n">{counts['PASS']}</div><div class="l">PASS（无告警）</div></div>
  <div class="pill warn"><div class="n">{counts['WARN']}</div><div class="l">WARN（需复核）</div></div>
</div>
<p class="sub">说明：BGM 按 LUFS 区间 [-20,-15] 与真峰值 ≤-1dBTP 质检；SFX 按真实峰值分类归一（战斗 -1.0 / 技能·怪物·系统 -1.5 / 奖励 -2.0 / UI -3.0 dBTP），故集成 LUFS 因瞬态长度而异属正常。波形图：BGM 取开头 1.2s 代表。频率平衡条（Sub/Low/Mid/High）越满代表该频段能量越强。</p>
{''.join(ordered)}
<div class="legend">量化指标含义：LUFS=集成响度；TP=真峰值（&gt;0 即削波风险）；crest=峰均比（动态余量）；质心=频谱重心（明亮度）；相关=立体声相关（1=单声，-1=反相）；接缝=循环点单样本阶跃（&gt;0dB 才有咔哒）；削波=满刻度采样点占比。<br>
★ 本表量的是<b>母版 WAV</b>。游戏端循环的是 <b>MP3 解码出的 PCM</b>，另有一道判据在
<code>verify_encode_quality.py</code> 的 <code>DELIVERED_SEAM_MAX_DB</code> ——
MP3 头部 encoder delay 与尾部 padding 由解码器做 gapless 校正，只有把 MP3 解回来量才算数。</div>
</div></body></html>"""

    out_path = os.path.join(OUT, 'qa_report.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(doc)
    print(f'报告已生成: {out_path}')
    print(f'总计 {total} 个文件，PASS={counts["PASS"]} WARN={counts["WARN"]}')


if __name__ == '__main__':
    main()
