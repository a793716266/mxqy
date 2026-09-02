#!/usr/bin/env python3
"""
verify_bgm_form.py —— 编曲层回归：守住「力度弧线」和「门控语义」

为什么要有这个脚本（2026-09-02 的血案）：
    bgm_boss 写了 12 dB 的力度弧线，成品 LRA 却只有 7.2 LU。查了一圈怀疑总线
    压缩，实测只吃 0.14 dB —— 真凶是 apply_form 的 default=0.0：衬底声部
    （horn / bass / lute / strings_tremolo）被写成「只在安静段减益出声」，
    于是一到 A/A' 高潮段就整段消失。注释写的是"不能断、只退到背景"，
    代码做的恰好相反 —— 这种 bug 肉眼审不出来，只能靠断言。

两条互补的判据：
  [静态] 门控语义：区间表里出现 0.05~0.6 的"减益"值，default 却还是 0
        （= 只在列出的区间存在），几乎一定是把衬底声部写反了。
  [动态] 编曲层 LRA：母带前干声必须 ≥9 LU。不够就说明力度弧线没做出来，
        别指望母带链补 —— 母带只能保住动态，造不出动态。

用法：.venv/bin/python tools/audio/verify_bgm_form.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from meow_audio import dsp as D, qa as Q, music as M
from meow_audio.dsp import SR

import build_bgm as B

SEAM_MAX_DB = Q.TARGET['bgm']['seam_max']
LRA_MIN, LRA_MAX = 10.0, 15.0    # 成品响度范围（便携平台建议 10~15，见 dsp.lra）
L10_MIN = -30.0                  # 安静段地板：短时响度 10 分位不得低于它

PASS = [0]
FAIL = [0]


def ck(cond, title, detail=''):
    if cond:
        PASS[0] += 1
        print(f'  ✓ {title}')
    else:
        FAIL[0] += 1
        print(f'  ✗ {title}' + (f'  —— {detail}' if detail else ''))


LRA_DRY_MIN = 9.0        # 编曲层动态下限（boss 中招时是 8.35）
LRA_DRY_MAX = 18.0       # 上限：超过说明段落之间断崖式切换，不像一首曲子
DUCK_LO, DUCK_HI = 0.05, 0.6   # "减益"值的区间


def main():
    captured = {}

    real_apply_form = B.apply_form

    def spy(a, dyn_bars, gates):
        captured[cur[0]] = gates
        return real_apply_form(a, dyn_bars, gates)

    B.apply_form = spy
    cur = ['?']

    print('=' * 78)
    print('[1] 门控语义静态检查 ——「只减益、没满血」= 衬底声部写反了')
    print('=' * 78)
    # 只跑 compose 拿门控表（渲染放在下一节）
    for name, fn, preset, loop in B.TRACKS:
        cur[0] = name
        fn()
    for name, gates in captured.items():
        bad = []
        for inst, spec in gates.items():
            secs, default = (spec, 0.0) if not isinstance(spec, tuple) else spec
            if default > 0.01:
                continue                      # 显式给了 default，作者是有意识的
            gs = [g for _, _, g in secs]
            if not gs:
                continue
            # ★ 判据不是"有没有减益值"，而是"有没有满血段"。
            #   explore 的 strings 写的是 [(0,2,0.35),(2,8,1.0),(8,12,0.30),(12,16,1.0)]，
            #   减益与满血成对出现 —— 那是正确写法，不能误报。
            #   真正写反的是"全表最大增益都还在减益区间"：说明这个声部
            #   从来没以全音量出现过，只可能是在高潮段被 default=0 抹掉了。
            if max(gs) <= DUCK_HI and any(DUCK_LO <= g for g in gs):
                bad.append(f'{inst}(最大{max(gs):.2f})')
        ck(not bad, f'{name:14s} 门控语义一致',
           '这些声部只有减益值、从没满血（高潮段会消失）: ' + ', '.join(bad))

    print()
    print('=' * 78)
    print(f'[2] 编曲层动态 LRA —— 判据 {LRA_DRY_MIN}~{LRA_DRY_MAX} LU（母带保得住、造不出）')
    print('=' * 78)
    for name, fn, preset, loop in B.TRACKS:
        cur[0] = name
        a = fn()
        _y, dry, _loop_n = B.render_track(a, preset, loop)
        lra = D.lra(dry)
        ck(LRA_DRY_MIN <= lra <= LRA_DRY_MAX,
           f'{name:14s} 干声 LRA = {lra:5.2f} LU',
           f'越界（{"太平" if lra < LRA_DRY_MIN else "段落断裂"}）')

    print()
    print('=' * 78)
    print('[3] 循环体长度 == 乐句长度（循环点必须踩在小节线上）')
    print('=' * 78)
    print('  ★ 曾经每首都短 0.600s：crossfade_loop 用 concat([头尾交叠段, 主体]) 构造，')
    print('    输出必然比输入少 xfade_s 个样本。循环点因此永远落在小节线之前，')
    print('    每循环一次节拍就往前挪 0.6s —— 接缝指标量不出这种缺陷。')
    for name, fn, preset, loop in B.TRACKS:
        if not loop:
            continue
        cur[0] = name
        a = fn()
        y, _dry, loop_n = B.render_track(a, preset, loop)
        d = len(y) - loop_n
        ck(d == 0, f'{name:14s} {len(y)/SR:7.3f}s / 乐句 {loop_n/SR:7.3f}s',
           f'循环点偏离小节线 {d/SR:+.3f}s')
        # 附带：循环点单样本阶跃（真咔哒判据，见 dsp.loop_seam_error 的说明）
        seam = D.loop_seam_error(y, SR)
        ck(seam <= SEAM_MAX_DB, f'{name:14s} 循环点阶跃 {seam:+6.2f}dB',
           f'有孤立阶跃（阈值 {SEAM_MAX_DB:+.1f}dB）')

    print()
    print('=' * 78)
    print('[4] 门控区间单位：每个声部都必须真的出过声')
    print('=' * 78)
    print('  ★ 曾经 apply_form 把「小节」又乘了一次 meter，而 Arrangement.gate() 的契约')
    print('    就是小节（_gate_gain 内部做 note_beat/meter）—— 双重换算让区间整体')
    print('    右移 4 倍：bgm_battle 的 brass_stab（124 音）与 strings（24 音）')
    print('    **一个音都没响**，中频全空，手机外放损失 8.1LU。')
    print('    静态检查读的是小节表，看不出换算错误 —— 只能查"有没有音真的出来"。')
    for name, fn, preset, loop in B.TRACKS:
        cur[0] = name
        a = fn()
        silent = []
        for inst in sorted({nt['inst'] for nt in a.notes}):
            gs = [a._gate_gain(inst, nt['start'])
                  for nt in a.notes if nt['inst'] == inst]
            if not any(g > 1e-6 for g in gs):
                silent.append(inst)
        ck(not silent, f'{name:14s} 全部声部都有出声段落',
           '门控把整个声部静音了（区间单位错了？）: ' + ', '.join(silent))

    print()
    print('=' * 78)
    print(f'[5] 成品动态窗口 —— LRA {LRA_MIN}~{LRA_MAX} LU，安静段地板 ≥ {L10_MIN} LUFS')
    print('=' * 78)
    print('  ★ 两条一起看：LRA 单独看不出问题在哪 —— 也可能是安静段被抽空了。')
    print('    真正会挨骂的是地板：手机外放 -17.5LUFS 约 70dB SPL，')
    print('    安静段每往下 1dB 就多一截被环境噪声埋掉，循环起来像"音乐没了又回来"。')
    for name, fn, preset, loop in B.TRACKS:
        cur[0] = name
        a = fn()
        y, _dry, _loop_n = B.render_track(a, preset, loop)
        y = M.master(y, sr=SR, ceiling_db=B.CEILING_DBTP, **B.MASTER[preset])
        lra = D.lra(y)
        ck(LRA_MIN <= lra <= LRA_MAX, f'{name:14s} LRA = {lra:5.2f} LU',
           f'越界（{"太平" if lra < LRA_MIN else "安静段会听不见"}）')
        ls = D.loudness_series(y, SR, 3.0, 0.1)
        ls = ls[ls > -70.0]
        ls = ls[ls > ls.max() - 20.0]
        l10 = float(np.percentile(ls, 10))
        ck(l10 >= L10_MIN, f'{name:14s} 安静段地板 L10 = {l10:6.2f} LUFS',
           f'低于 {L10_MIN} LUFS（手机上会被环境噪声埋掉）')

    print()
    print('=' * 78)
    print(f'结果：{PASS[0]} 通过 / {FAIL[0]} 失败')
    print('=' * 78)
    return 1 if FAIL[0] else 0


if __name__ == '__main__':
    sys.exit(main())
