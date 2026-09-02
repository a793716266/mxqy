#!/usr/bin/env python3
"""
verify_encode_quality.py —— 客观核验重编码后的音质，而不是"我觉得够了"。

把投产 MP3 解码回 PCM，与 out/wav 无损母版对齐比较，输出客观指标并给出通过/失败判定。

★ 两个必须避开的测量陷阱（2026-09-01 亲自踩过）：
  1) 别用 `ffmpeg -ac 1` 做降混来测峰值。浮点输出下 swresample 的 rematrix_maxval
     是无界的（只对整型格式才归一到 1.0），stereo→mono 实际接近 L+R 直接相加，
     会凭空抬高约 +3dB，于是干净的 -1.0dBFS 母版被误报成 "+1.99dBFS 削波"。
     正确做法：按原始声道数解码，自己 reshape 后取平均。
  2) 带宽别用绝对门槛。本作有大量刻意的窄带素材（ui_click 3.4kHz、game_defeat 3.7kHz、
     bgm_menu 11.9kHz 竖琴长笛无镲片），拿 15kHz 一刀切会把正常素材全判死。
     正确做法：跟母版自身带宽比（相对比值），只拦"被压掉的高频"。

指标：
  · SNR (dB)      残差信噪比。感知编码不追求波形一致，绝对值不高属正常；
                  同批里明显偏低的说明该素材更难压（宽频瞬态/噪声型），值得单听。
  · 带宽 (Hz)     母版 → MP3 的有效带宽，量化"是否被压糊"。
  · 峰值 (dBFS)   MP3 解码后的真实峰值，必须 ≤ 0（否则设备定点输出会硬削波）。
  · 响度差 (dB)   与母版的 RMS 差，防止编码环节引入响度漂移、破坏素材间平衡。
  · 相关系数      防错文件 / 截断 / 严重跑偏。噪声型音效天然偏低，故分档设阈。

用法：.venv/bin/python tools/audio/verify_encode_quality.py
"""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from meow_audio import dsp as D
import build_bgm as B        # 只为 TRACKS 里的 loop 标记，别再抄一份"哪些曲子要循环"

HERE = os.path.dirname(os.path.abspath(__file__))
WAV = os.path.join(HERE, 'out', 'wav')
MP3 = os.path.join(HERE, 'out', 'mp3')

SR = 44100

# 判定门槛（分 BGM / SFX 两档）
TH = {
    'BGM': dict(bw_ratio=0.85, lame_lowpass=16500.0, rms_tol=0.6, corr_min=0.98),
    'SFX': dict(bw_ratio=0.85, lame_lowpass=15500.0, rms_tol=0.8, corr_min=0.90),
}
PEAK_CEIL_DBFS = 0.0        # MP3 解码后不得超过 0 dBFS（设备定点输出会硬削波）
# 交付到玩家手里的文件，真峰值必须 ≤ -1 dBTP（各平台硬标准）
DELIVERED_TP_MAX = -1.0
# 编码过冲只作**诊断**，不作为判据（见 check() 里的 ★ 说明）
DUR_TOL_S = 0.06            # 时长偏差（MP3 编码器补零，60ms 内属正常）
# 循环交付物的循环点阶跃上限（dB）。与 qa.SEAM_MAX_DB 同一个判据，
# 但量的是**解码回 PCM 的 MP3**，不是母版 WAV —— 玩家听到的是前者。
#   ★ 为什么要单独量一遍：BGM 是 wx.createInnerAudioContext().loop=true 由
#     微信的解码器循环播放的，它循环的 PCM 是 MP3 解出来的，不是我们的 WAV。
#     MP3 会在头部插 encoder delay、尾部补 padding（实测本批每首被吃掉
#     1152~2061 样本），解码器按 LAME/Xing tag 做 gapless 校正后长度虽然对得上，
#     但校正做没做、做对没做对，只有把 MP3 解回来量才知道。
#     WAV 上量再漂亮，也不等于玩家耳朵里没有咔哒。
DELIVERED_SEAM_MAX_DB = 0.0
# 只有真正在游戏里循环的曲子才判循环点（bgm_victory 是一次性播放）
LOOPING_BGM = {n: bool(loop) for n, _fn, _p, loop in B.TRACKS}


def probe_channels(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'a:0',
         '-show_entries', 'stream=channels', '-of', 'csv=p=0', path],
        capture_output=True, text=True, check=True).stdout.strip()
    return int(out.split(',')[0])


def decode(path):
    """解码为单声道 float64。按原始声道数取回再自己平均，绝不让 swr 帮忙降混（见文件头陷阱 1）。"""
    ch = probe_channels(path)
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ar', str(SR), '-'],
        capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    if ch > 1:
        n = (len(x) // ch) * ch
        x = x[:n].reshape(-1, ch)
        return x.mean(axis=1), np.abs(x).max()     # 返回(降混信号, 各声道真实峰值)
    return x, float(np.abs(x).max()) if len(x) else 0.0


def decode_stereo(path):
    """
    按原始声道数解码，**不做降混**。

    ★ 判循环点必须用它，不能用上面的 decode()：decode() 为了安全地量峰值而降混到单声道，
      而降混会把反相的阶跃互相抵消 —— 左声道 +0.03、右声道 -0.03 这种
      "两边都有咔哒、听着最明显"的情况，降混之后正好等于 0，判据就瞎了。
      dsp.loop_seam_error 内部是逐声道取 max，必须喂它真的多声道数据。
    """
    ch = probe_channels(path)
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ar', str(SR), '-'],
        capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    if ch > 1:
        n = (len(x) // ch) * ch
        return x[:n].reshape(-1, ch)
    return x[:, None]


def align(ref, test, max_lag=4096):
    """MP3 解码前端有编码器延迟（典型 576/1152 样本），先用互相关找整数偏移再比。"""
    n = min(len(ref), len(test), SR * 4)      # 只用前 4s 估延迟，够用且快
    if n <= max_lag + 8:
        m = min(len(ref), len(test))
        return ref[:m], test[:m], 0
    a = ref[:n] - ref[:n].mean()
    b = test[:n] - test[:n].mean()
    corr = np.correlate(b, a[:n - max_lag], mode='valid')[:max_lag]
    lag = int(np.argmax(np.abs(corr)))
    t = test[lag:]
    m = min(len(ref), len(t))
    return ref[:m], t[:m], lag


def bandwidth(x, floor_db=-60.0):
    """有效带宽：长时平均频谱里，能量跌破峰值 floor_db 之前的最高频点。"""
    nfft = 8192
    if len(x) < nfft:
        x = np.pad(x, (0, nfft - len(x)))
    win = np.hanning(nfft)
    hop = nfft // 2
    acc, frames = None, 0
    for i in range(0, len(x) - nfft + 1, hop):
        spec = np.abs(np.fft.rfft(x[i:i + nfft] * win))
        acc = spec if acc is None else acc + spec
        frames += 1
        if frames >= 400:
            break
    acc = acc / max(frames, 1)
    mag_db = 20 * np.log10(acc + 1e-12)
    idx = np.where(mag_db > mag_db.max() + floor_db)[0]
    return float(idx.max()) * SR / nfft if len(idx) else 0.0


def db(v):
    return 20 * np.log10(max(float(v), 1e-12))


def check(kind, name, wav_path, mp3_path):
    th = TH[kind]
    ref, ref_peak = decode(wav_path)
    test, test_peak = decode(mp3_path)
    dur_ref, dur_test = len(ref) / SR, len(test) / SR
    ref, test, lag = align(ref, test)

    noise = test - ref
    snr = db(np.sqrt(np.mean(ref ** 2))) - db(np.sqrt(np.mean(noise ** 2)))
    bw_ref, bw_test = bandwidth(ref), bandwidth(test)
    rms_d = db(np.sqrt(np.mean(test ** 2))) - db(np.sqrt(np.mean(ref ** 2)))
    corr = float(np.corrcoef(ref, test)[0, 1]) if len(ref) > 1 else 1.0

    # 带宽下限：母版自身带宽与 LAME 低通取小，再留 15% 容差（见文件头陷阱 2）
    bw_floor = min(bw_ref, th['lame_lowpass']) * th['bw_ratio']

    # 交付文件的真峰值：这才是要不要紧的那个数。
    # ★ 判据从"相对母版的过冲 ≤0.5dB"改成"交付真峰值 ≤ -1dBTP"，理由：
    #     过冲是有损编码的固有行为（MDCT  ringing 在瞬态处重建出采样间峰值），
    #     实测本项目最大 +1.51dB（cast_lightning 这类宽带爆裂音），
    #     而母带留的 -2dBTP 余量本来就是为了吸收它。
    #     拿"过冲 ≤0.5dB"当判据，等于要求编码器做它做不到的事 ——
    #     结果是 3 个素材被判失败，可它们的交付真峰值全都在 -2.5dBTP 以内，
    #     离 -1dBTP 的平台红线还差得远。代理指标一旦和真实目标脱节，
    #     就会把合格品判成废品，真问题反而被噪音盖住。
    #   现在直接断言真实目标（≤-1dBTP），过冲仍然打印出来供诊断。
    tp_test = D.true_peak_db(test, SR)

    # 循环曲：在交付文件（解码后的 MP3）上量循环点，见 DELIVERED_SEAM_MAX_DB 的说明。
    # 用 decode_stereo 而不是 decode —— 降混会抵消反相阶跃，见该函数的 ★。
    seam_db = None
    if kind == 'BGM' and LOOPING_BGM.get(name):
        smp = decode_stereo(mp3_path)
        seam_db = D.loop_seam_error(smp, SR)

    fails = []
    if bw_test < bw_floor:
        fails.append(f'高频被压掉 {bw_test:.0f}Hz < 下限 {bw_floor:.0f}Hz')
    if abs(rms_d) > th['rms_tol']:
        fails.append(f'响度漂移 {rms_d:+.2f}dB')
    if db(test_peak) > PEAK_CEIL_DBFS:
        fails.append(f'解码削波 {db(test_peak):+.2f}dBFS')
    if tp_test > DELIVERED_TP_MAX:
        fails.append(f'交付真峰值 {tp_test:+.2f}dBTP > {DELIVERED_TP_MAX}')
    if corr < th['corr_min']:
        fails.append(f'相关系数 {corr:.3f} < {th["corr_min"]}')
    if abs(dur_test - dur_ref) > DUR_TOL_S:
        fails.append(f'时长偏差 {dur_test - dur_ref:+.3f}s')
    if seam_db is not None and seam_db > DELIVERED_SEAM_MAX_DB:
        fails.append(f'交付文件循环点阶跃 {seam_db:+.2f}dB > '
                     f'{DELIVERED_SEAM_MAX_DB:+.1f}（播放到第 2 遍会咔哒）')

    return dict(kind=kind, name=name, snr=snr, bw_ref=bw_ref, bw_test=bw_test,
                rms_d=rms_d, peak_db=db(test_peak), ref_peak_db=db(ref_peak),
                tp_test=tp_test, overshoot=db(test_peak) - db(ref_peak),
                corr=corr, lag=lag, dur=dur_test, seam_db=seam_db, fails=fails)


def main():
    rows = []
    for f in sorted(os.listdir(WAV)):
        if f.endswith('.wav'):
            rows.append(check('BGM', f[:-4], os.path.join(WAV, f),
                              os.path.join(MP3, f[:-4] + '.mp3')))
    sfx_dir = os.path.join(WAV, 'sfx')
    for f in sorted(os.listdir(sfx_dir)):
        if f.endswith('.wav'):
            rows.append(check('SFX', f[:-4], os.path.join(sfx_dir, f),
                              os.path.join(MP3, 'sfx', f[:-4] + '.mp3')))

    print(f'{"":4}{"素材":<24}{"SNR":>8}{"带宽 母版→MP3":>20}'
          f'{"峰值":>10}{"响度差":>9}{"相关":>7}')
    print('-' * 88)
    bad = []
    for r in rows:
        if r['fails']:
            bad.append(r)
        flag = '  ✗ ' + '; '.join(r['fails']) if r['fails'] else ''
        print(f'{r["kind"]:<4}{r["name"]:<24}{r["snr"]:>7.1f}dB'
              f'{r["bw_ref"]:>10.0f}→{r["bw_test"]:>7.0f}Hz'
              f'{r["peak_db"]:>+9.2f}dB{r["rms_d"]:>+8.2f}dB{r["corr"]:>7.3f}{flag}')

    print('-' * 88)
    # 循环曲的循环点：量的是解码回 PCM 的 MP3，即玩家耳朵里被循环的那一段
    loops = [r for r in rows if r['seam_db'] is not None]
    if loops:
        print('循环交付物的循环点（判据 ≤ '
              f'{DELIVERED_SEAM_MAX_DB:+.1f}dB；负=比邻域正常过渡还平滑）:')
        for r in loops:
            flag = '' if not r['fails'] or not any('循环点' in f for f in r['fails']) else '  ✗'
            print(f'  {r["name"]:<24}{r["seam_db"]:>+7.2f} dB{flag}')
        print('-' * 88)
    worst = sorted(rows, key=lambda r: r['snr'])[:3]
    print('SNR 最低 3 个（内容最难压，值得人耳复听）: '
          + ', '.join(f'{r["name"]}({r["snr"]:.1f}dB)' for r in worst))
    print(f'峰值最高: {max(rows, key=lambda r: r["peak_db"])["name"]} '
          f'{max(r["peak_db"] for r in rows):+.2f}dBFS（上限 {PEAK_CEIL_DBFS:+.1f}）')
    # 交付真峰值与平台红线之间还剩多少余量 —— 这才是"会不会削波"的答案
    wt = max(rows, key=lambda r: r['tp_test'])
    worst_os = max(rows, key=lambda r: r['overshoot'])
    print(f'交付真峰值最高: {wt["name"]} {wt["tp_test"]:+.2f}dBTP'
          f'（平台红线 {DELIVERED_TP_MAX:+.1f}，余量 {DELIVERED_TP_MAX - wt["tp_test"]:.2f}dB）')
    print(f'编码过冲最大: {worst_os["name"]} {worst_os["overshoot"]:+.2f}dB'
          f'（有损编码固有行为，仅诊断；已被母带的 -2dBTP 余量吸收）')
    print(f'\n合计 {len(rows)} 个素材，{len(rows) - len(bad)} 通过 / {len(bad)} 失败')
    if bad:
        print('\n未通过：')
        for r in bad:
            print(f'  - {r["kind"]} {r["name"]}: {"; ".join(r["fails"])}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
