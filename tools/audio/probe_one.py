"""单曲探针：只渲染一首，快速迭代 LRA / L10（12 首全量重建约 60s，单首约 15s）"""
import sys, os
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tools', 'audio'))
import build_bgm as B
from meow_audio import dsp as D, music as M

name = sys.argv[1] if len(sys.argv) > 1 else 'bgm_boss_healer'
entry = [t for t in B.TRACKS if t[0] == name][0]
a = entry[1]()
preset, loop = entry[2], entry[3]
st = {}
y, dry, loop_n = B.render_track(a, preset, loop)
y = M.master(y, sr=B.SR, ceiling_db=B.CEILING_DBTP, **B.MASTER[preset], loop=loop, stats=st)

lu = D.lufs(y, B.SR)
lra = D.lra(y, B.SR)
lra_dry = D.lra(dry, B.SR)
l10 = float(np.percentile(D.loudness_series(dry, B.SR, 3.0, 0.1), 10))
ok = lambda c: 'OK ' if c else '!! '

print(f"[{name}]  时长 {len(y)/B.SR:.1f}s  音符 {len(a.notes)}")
print(f"  {ok(-17.6 <= lu <= -16.4)}LUFS   = {lu:.2f}    (目标 -17.0±0.6)")
print(f"  {ok(10.0 <= lra <= 15.0)}LRA    = {lra:.2f} LU  (成品窗口 10~15)")
print(f"  {ok(9.0 <= lra_dry <= 18.0)}LRA干声= {lra_dry:.2f} LU  (窗口 9~18)")
print(f"  {ok(l10 >= -30.0)}安静段  L10 = {l10:.2f} LUFS (门限 >= -30)")
print(f"  TP = {D.true_peak_db(y, B.SR):.2f} dBTP   crest = {D.crest_db(y):.1f} dB"
      f"   削波 = {D.clip_ratio(y):.5f}")
print(f"  质心 = {D.spectral_centroid(y, B.SR):.0f} Hz"
      f"   循环点阶跃 = {D.loop_seam_error(y, B.SR):.2f} dB (判据 <= 0)")
