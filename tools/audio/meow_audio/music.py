"""
music.py —— 乐理、和声与编曲框架

提供：
  · 调式/音阶与和弦构造
  · 声部进行（voice leading）—— 避免平行五八度与大跳，让和声"通顺"
  · 编曲容器 Arrangement：以拍为单位排布音符，渲染为立体声
  · 无缝循环：超尾音符折回开头 + 混响尾巴 wrap
  · 人性化：力度/时值/声像的微小随机扰动
"""

import inspect
import zlib

import numpy as np
from scipy.optimize import linear_sum_assignment

from . import dsp as D
from . import synth as S
from .dsp import SR


# ============================================================
# 音阶与调式
# ============================================================

SCALES = {
    'major':           [0, 2, 4, 5, 7, 9, 11],
    'minor':           [0, 2, 3, 5, 7, 8, 10],      # 自然小调
    'harmonic_minor':  [0, 2, 3, 5, 7, 8, 11],
    'melodic_minor':   [0, 2, 3, 5, 7, 9, 11],
    'dorian':          [0, 2, 3, 5, 7, 9, 10],
    'phrygian':        [0, 1, 3, 5, 7, 8, 10],
    'lydian':          [0, 2, 4, 6, 7, 9, 11],
    'mixolydian':      [0, 2, 4, 5, 7, 9, 10],
    'pentatonic_major': [0, 2, 4, 7, 9],
    'pentatonic_minor': [0, 3, 5, 7, 10],
    'blues':           [0, 3, 5, 6, 7, 10],
    'whole_tone':      [0, 2, 4, 6, 8, 10],
}


class Key:
    """调性：主音 + 调式"""

    def __init__(self, tonic='C', scale='major'):
        if isinstance(tonic, str):
            self.tonic_midi = D.note2midi(tonic)
        else:
            self.tonic_midi = int(tonic)
        self.scale_name = scale
        self.steps = SCALES[scale]

    def degree(self, d, octave=4):
        """
        音阶级数 -> MIDI。d 从 0 开始（0 = 主音），可超出一个八度。
        d=7 即高八度主音，d=-1 即下方小二度/大二度（按调式）。
        """
        n = len(self.steps)
        oct_off, idx = divmod(int(d), n)
        base = self.tonic_midi + (octave - 4) * 12
        return base + oct_off * 12 + self.steps[idx]

    def freq(self, d, octave=4):
        return D.midi2freq(self.degree(d, octave))

    def scale_pitches(self, low_deg, high_deg, octave=4):
        return [self.degree(d, octave) for d in range(low_deg, high_deg + 1)]


# ============================================================
# 和弦
# ============================================================

CHORD_SHAPES = {
    'triad':     [0, 2, 4],
    '7':         [0, 2, 4, 6],
    'maj7':      [0, 2, 4, 6],       # 需配合调式修正七音
    'sus4':      [0, 3, 4],
    'sus2':      [0, 1, 4],
    'add9':      [0, 2, 4, 8],
    '6':         [0, 2, 4, 5],
    'm':         [0, 2, 4],          # 小三和弦（由调式三音决定，这里仅占位）
    'dim':       [0, 2, 4],
    'power':     [0, 4],             # 五度和弦（强力和弦）
    'open5':     [0, 4],
}


def chord_degrees(deg, kind='triad', n_scale=7):
    """
    以音阶级数为根音，按「隔一级叠置」取和弦音（调式和弦 / diatonic chord）。
    这样和弦自动落在当前调式内，不会跑调。
    """
    span = {'triad': 2, '7': 3, 'sus4': 2, 'sus2': 2, 'add9': 4,
            '6': 2, 'power': 2, 'open5': 2}.get(kind, 2)
    if kind == 'sus4':
        return [deg, deg + 3, deg + 4]
    if kind == 'sus2':
        return [deg, deg + 1, deg + 4]
    if kind == 'power':
        return [deg, deg + 4]
    out = [deg + 2 * i for i in range(span + 1)]
    return out


def chord_midi(key, deg, kind='triad', octave=4):
    return [key.degree(d, octave) for d in chord_degrees(deg, kind)]


def _is_parallel_perfect(a1, a2, b1, b2):
    """检测两对声部是否构成平行纯五度/纯八度"""
    d1 = abs(a2 - a1) % 12
    d2 = abs(b2 - b1) % 12
    return (d1 in (7, 0)) and (d1 == d2) and (a1 != b1) and (a2 != b2)


def voice_lead(prev, chord, low=36, high=96):
    """
    声部进行：为当前和弦选择与前一和弦连接最平滑的排列。

    为什么必须做：如果每个和弦都固定用「根音位置」排列，声部会整体
    上下大跳，听感生硬，还容易出现平行五度/八度 —— 古典和声学的大忌，
    它会让两个声部「粘在一起」失去独立性，正是业余编曲的典型特征。

    做法分两步：
      1. 最优分配：把「和弦音 -> 声部」建模为指派问题，用匈牙利算法求
         全局最小移动（贪心逐音匹配只能得到局部最优，会多跳半个八度）
      2. 平行五八度检查：若发现平行纯五度/八度，尝试把某个声部移一个八度
    """
    chord = sorted(int(c) for c in chord)
    if not prev:
        out = list(chord)
    else:
        prev = sorted(int(p) for p in prev)
        # 声部数对齐：少则重复八度（优先重复最低音），多则裁剪
        tgt = len(prev)
        src = list(chord)
        while len(src) < tgt:
            src.append(src[0] + 12)
        src = src[:tgt]

        # 代价矩阵：cost[i][j] = src[i] 的第 k 个八度候选到 prev[j] 的距离
        n = len(src)
        cost = np.full((n, n), 1e6)
        cand = {}
        for i, c in enumerate(src):
            for j in range(n):
                k = round((prev[j] - c) / 12.0)
                best_v, best_d = None, 1e9
                for kk in (k - 1, k, k + 1):
                    v = c + 12 * kk
                    if low - 12 <= v <= high + 12:
                        d = abs(v - prev[j])
                        if d < best_d:
                            best_d, best_v = d, v
                if best_v is not None:
                    cost[i, j] = best_d
                    cand[(i, j)] = best_v

        rows, cols = linear_sum_assignment(cost)
        out = [int(cand.get((i, j), src[i])) for i, j in zip(rows, cols)]

        # 平行五八度修正：尝试把某声部移 ±12 半音
        for i in range(len(out)):
            for j in range(i + 1, len(out)):
                if _is_parallel_perfect(prev[i], prev[j], out[i], out[j]):
                    for k, delta in ((i, 12), (j, 12), (i, -12), (j, -12)):
                        trial = list(out)
                        trial[k] += delta
                        if low <= trial[k] <= high and \
                           not _is_parallel_perfect(prev[i], prev[j], trial[i], trial[j]):
                            out = trial
                            break
                    break
        out = sorted(out)

    # 收进音域
    lo, hi = int(low), int(high)
    while min(out) < lo:
        out = [x + 12 for x in out]
    while max(out) > hi:
        out = [x - 12 for x in out]
    return [int(np.clip(x, lo, hi)) for x in out]


# ============================================================
# 编曲容器
# ============================================================

class Arrangement:
    """
    以「拍」为单位排布音符的编曲容器。

    用法：
        a = Arrangement(bpm=96, bars=8)
        a.add('strings', 0, 2, 'C4', vel=0.8, pan=-0.2)
        a.add_perc('taiko', 0, vel=1.0)
        y = a.render(loop=True)
    """

    def __init__(self, bpm=96.0, sr=SR, bars=8, meter=4.0, loop_bars=None):
        self.bpm = float(bpm)
        self.spb = 60.0 / self.bpm
        self.sr = int(sr)
        self.meter = float(meter)
        self.bars = bars
        self.loop_bars = loop_bars if loop_bars is not None else bars
        self.notes = []
        # 宏观动态：全曲力度弧线 + 声部分段门控
        self.dyn_pts = None
        self.dyn_smooth_ms = 140.0
        self.gates = {}

    def beat(self, b):
        return float(b) * self.spb

    def loop_len(self):
        return self.beat(self.loop_bars * self.meter)

    # ---------------- 宏观动态（编曲起伏的核心）----------------

    def dynamics(self, points, wrap=True, smooth_ms=140.0):
        """
        设置全曲力度弧线（宏观动态包络）。

        这是让编曲"有起伏"的关键原语：逐音符 vel 的微小扰动只能去掉机械感，
        造不出段落感。必须有以小节为单位的力度设计 —— 实测本项目 7 首 BGM
        在加此包络前 LRA 仅 0.6~5.9 LU（听感"一条直线"，业余感的主要来源），
        便携平台建议 8~15 LU。

        points: [(beat, gain_db), ...]，按 beat 递增。gain_db 为相对值（0 = 最响）。
                例：[('intro', -9), ('build', -4), ('climax', 0), ('break', -6)]

        wrap:   无缝循环必须首尾电平连续，否则循环点会"跳一下"。
                自动把曲线补到 loop 长度，并令末点电平 = 首点电平。

        smooth_ms: 对 dB 曲线做平滑，避免折线拐点处产生可闻的阶梯。
                   140ms 约等于人耳对慢速音量变化的分辨下限，再小会有"泵感"。
        """
        pts = [(float(b), float(g)) for b, g in points]
        pts.sort(key=lambda p: p[0])
        if not pts:
            return self
        if wrap:
            end = self.loop_bars * self.meter
            if pts[0][0] > 0:
                pts.insert(0, (0.0, pts[0][1]))
            if pts[-1][0] < end:
                pts.append((end, pts[0][1]))
            else:
                pts[-1] = (end, pts[0][1])
        self.dyn_pts = pts
        self.dyn_smooth_ms = float(smooth_ms)
        return self

    def sections(self, levels, hold_beats=0.75, **kw):
        """
        按「段落电平表」设置力度弧线：[(bar, db), ...]（坐标用小节，不是拍）。

        ★ 与 dynamics() 的区别，别混用：
          dynamics() 是线性插值，相邻控制点之间是一路斜坡。如果直接把段落电平喂给它，
          "桥段 -8dB → A' 段 0dB" 会变成四小节的渐强 —— 那就不是留白，是渐强。
          实测踩过这个坑：town 的桥段反而比 A 段还响 0.9 dB，LRA 死活上不去。

          sections() 给每段补一个「保持到下一小节边界前 hold_beats 拍」的点，
          段内电平是平的，段与段之间用短斜坡过渡 —— 这才是编曲要的"台阶"。
          0.75 拍的过渡听起来就是一声干脆的乐队齐入，不会咔哒。
        """
        pts = []
        for i, (bar, db) in enumerate(levels):
            bar = float(bar)
            pts.append((bar * self.meter, float(db)))
            if i + 1 < len(levels):
                nxt = float(levels[i + 1][0])
                hold = max(bar, nxt - hold_beats / self.meter)
                if hold > bar:
                    pts.append((hold * self.meter, float(db)))
        return self.dynamics(pts, **kw)

    def gate(self, inst, sections, default=1.0):
        """
        声部分段门控：让乐器在指定小节区间进出，而不是从头到尾都在响。

        配器法第一条：编曲的对比来自"织体密度的变化"，不是音量旋钮。
        一段音乐全程 tutti 会立刻暴露 MIDI 味 —— 真实配乐里木管、铜管、
        定音鼓都是有节制地进入的（Rimsky-Korsakov：配器的力量在于对比）。

        inst:     乐器名，与 add() 用的名字一致。
        sections: [(start_bar, end_bar, gain), ...]，区间外为 default。
                  gain=0 表示完全静音（= 该声部在此段不存在）。
        default:  区间外的增益。
        """
        self.gates[inst] = ([(float(a), float(b), float(g))
                             for a, b, g in sections], float(default))
        return self

    @staticmethod
    def _auto_seed(*parts):
        """从任意可字符串化的参数派生确定性种子（zlib.crc32，跨进程/跨平台稳定）"""
        return zlib.crc32('|'.join(str(p) for p in parts).encode('utf-8')) & 0xFFFFFFFF

    @staticmethod
    def _det_seed(inst, pitch, vel, start, idx):
        """
        派生确定性随机种子。

        ★ 这个不能省。synth 里到处是 np.random.default_rng(seed)，
          而 default_rng(None) 会去取系统熵 —— 结果是每次构建出来的音频都不一样
          （实测同参数两次构建，town 的 LRA 从 10.96 变成 8.98）。
          那样既做不了回归比对，线上出问题也无法复现。

          派生依据里带音符下标：同一个音反复演奏时噪声必须不同，
          否则听上去就是在循环同一段采样 —— 这是合成器最容易被听穿的地方。
        """
        return Arrangement._auto_seed(inst, pitch, vel, start, idx)

    def _gate_gain(self, inst, note_beat):
        if inst not in self.gates:
            return 1.0
        secs, default = self.gates[inst]
        bar = note_beat / self.meter
        for a, b, g in secs:
            if a <= bar < b:
                return g
        return default

    def _apply_dynamics(self, y):
        """把力度弧线渲染成逐样本增益包络"""
        sr = self.sr
        b = np.array([p[0] for p in self.dyn_pts])
        g = np.array([p[1] for p in self.dyn_pts])
        t_beats = np.arange(len(y)) / sr / self.spb
        db = np.interp(t_beats, b, g)
        w = int(self.dyn_smooth_ms * 0.001 * sr)
        if w > 1:
            ker = np.hanning(w + 2)[1:-1]
            ker = ker / ker.sum()
            # 反射填充，避免首尾被拉向 0（首尾必须严格等于设定值）
            pad = w
            db = np.convolve(np.pad(db, pad, mode='reflect'), ker, mode='same')[pad:-pad]
        return y * D.db2lin(db)[:, None]

    def add(self, inst, start_beat, dur_beat, pitch, vel=0.8, pan=0.0,
            humanize=1.0, seed=None, **kw):
        """
        pitch 可以是 MIDI 数值、音名字符串('C4')，或频率(>2000 视为 Hz)。
        """
        self.notes.append(dict(inst=inst, start=float(start_beat),
                               dur=float(dur_beat), pitch=pitch,
                               vel=float(vel), pan=float(pan),
                               humanize=humanize, seed=seed, kw=kw))
        return self

    def add_chord(self, inst, start_beat, dur_beat, pitches, vel=0.8,
                  pan=0.0, spread=0.0, humanize=1.0, seed=None, **kw):
        """和弦：spread>0 时各声部做微小时间错位（模拟不齐的合奏起音）"""
        if seed is None:
            seed = self._auto_seed('chord', inst, start_beat, len(self.notes))
        rng = np.random.default_rng(seed)
        for i, p in enumerate(pitches):
            pn = spread * (i - (len(pitches) - 1) / 2.0) / max(len(pitches) - 1, 1)
            off = rng.uniform(0, 0.012) * humanize
            self.add(inst, start_beat + off, dur_beat, p, vel=vel, pan=pn,
                     humanize=humanize, seed=seed, **kw)
        return self

    def add_perc(self, inst, start_beat, vel=0.9, pan=0.0, pitch=None,
                 seed=None, **kw):
        """
        打击乐。pitch 仅对有音高的打击乐生效（定音鼓/太鼓/手鼓/木鱼），
        定音鼓是调音乐器，应当跟随和声根音 —— 这是配器法的基本常识。
        """
        return self.add(inst, start_beat, 0.0, pitch, vel=vel, pan=pan,
                        humanize=0.0, seed=seed, **kw)

    def pattern(self, inst, grid, start_beat=0.0, step_beats=0.25,
                vel=0.8, accent=1.25, pan=0.0, seed=None, **kw):
        """
        节奏型：用字符串网格快速排鼓。
        grid: 'x...x...x..x.x..' —— x=重音, o=普通, .=休止
        """
        if seed is None:
            seed = self._auto_seed('pattern', inst, start_beat, len(self.notes))
        rng = np.random.default_rng(seed)
        for i, ch in enumerate(grid):
            if ch == '.':
                continue
            v = vel * (accent if ch == 'x' else 1.0)
            v *= 1.0 + rng.uniform(-0.05, 0.05)
            self.add_perc(inst, start_beat + i * step_beats, vel=v, pan=pan,
                          seed=seed, **kw)
        return self

    # ---------------- 渲染 ----------------

    def render(self, loop=False, tail_s=2.0, extra_s=0.0, wrap=False):
        """
        渲染为立体声。

        loop=True 时**不做任何截短或折叠**，原样返回 (乐句 + tail_s) 的完整缓冲。

        ★ 为什么折叠不在这里做：无缝循环折的是「越过循环点的余音」，而余音里
          有一半是混响尾巴 —— 混响是调用方在 render 之后才加的。在这里截短到
          乐句长度，混响尾巴就永远丢了，后面再怎么"折"都只能拿干声冒充。
          所以调用顺序必须是：render(L+T) → 加混响 → D.fold_loop_tail(..., L)。

        wrap=True 是逐音符折叠（把溢出到乐句之外的样本抄回开头）。开了它再在
        缓冲层折一次，同一段余音就被算两遍 —— 二者只能选一个，本项目统一走
        缓冲层折叠（更精确，且能带上混响），故默认 False。
        """
        sr = self.sr
        loop_s = self.loop_len()
        total_s = (loop_s if loop else self.beat(self.bars * self.meter)) + extra_s
        render_s = total_s + (tail_s if loop else 0.0)

        n = int(render_s * sr) + 4
        L = np.zeros(n)
        R = np.zeros(n)
        rng = np.random.default_rng(1234)

        cache = {}

        for ni, nt in enumerate(self.notes):
            inst_name = nt['inst']
            vel0 = float(nt['vel'])
            # 声部门控：gain=0 表示该段此声部不存在，直接跳过（省算力也避免缓存污染）
            gg = self._gate_gain(inst_name, nt['start'])
            if gg <= 1e-6:
                continue
            vel0 *= gg
            human = nt['humanize']
            seed = nt['seed']
            if seed is None:
                seed = self._det_seed(inst_name, nt['pitch'], round(vel0, 3),
                                      round(nt['start'], 3), ni)

            if human > 0:
                vel, t_off, pan_off = S.humanize(vel0, 0.0, human, rng)
            else:
                vel, t_off, pan_off = vel0, 0.0, 0.0

            start = self.beat(nt['start']) + t_off
            pan = float(np.clip(nt['pan'] + pan_off, -1.0, 1.0))
            # 等功率声像律（cos/sin），中央每声道 -3dB，总功率守恒
            gl = float(np.cos((pan + 1.0) * np.pi / 4.0))
            gr = float(np.sin((pan + 1.0) * np.pi / 4.0))

            # 音高解析：音名 / MIDI / 频率
            p = nt['pitch']
            kw = dict(nt['kw'])
            is_perc = (p is None) or (nt['dur'] == 0.0 and inst_name in S.PERCUSSION)
            if p is None:
                freq_key = None
            elif isinstance(p, str):
                freq_key = float(D.midi2freq(D.note2midi(p)))
            elif isinstance(p, (int, float)) and p < 2000:
                freq_key = float(D.midi2freq(p))
            else:
                freq_key = float(p)

            if is_perc:
                # 打击乐时长由乐器自身的物理衰减决定，不强制指定
                dur = None
            else:
                dur = self.beat(nt['dur']) + kw.pop('release_pad', 0.35)

            # 缓存：节奏型中大量重复音符，humanize=0 时可安全复用
            ck = None
            if human == 0:
                if is_perc:
                    ck = ('p', inst_name, round(vel, 3), seed)
                elif freq_key is not None:
                    ck = ('n', inst_name, round(freq_key, 2), round(dur, 3))

            if ck is not None and ck in cache:
                mono = cache[ck] * (vel if ck[0] == 'n' else 1.0)
            else:
                fn = S.get_instrument(inst_name)
                if is_perc:
                    # 有音高的打击乐（定音鼓等）传入音高，其余忽略
                    if freq_key is not None and 'freq' in inspect.signature(fn).parameters:
                        mono = fn(freq_key, vel=vel, sr=sr, seed=seed, **kw)
                    else:
                        mono = fn(vel=vel, sr=sr, seed=seed, **kw)
                else:
                    mono = fn(freq_key, dur, vel=vel, sr=sr, seed=seed, **kw)
                mono = np.nan_to_num(np.asarray(mono, dtype=np.float64))
                if ck is not None:
                    # 存 vel=1 的原型，取用时再按力度缩放
                    cache[ck] = mono / max(vel, 1e-6) if ck[0] == 'n' else mono
                    mono = cache[ck] * (vel if ck[0] == 'n' else 1.0)

            seg_len = len(mono)
            if seg_len == 0:
                continue

            # 放置到时间轴
            i0 = int(start * sr)
            if i0 >= n:
                continue
            j0 = max(0, i0)
            j1 = min(n, i0 + seg_len)
            if j1 > j0:
                seg = mono[j0 - i0: j1 - i0]
                L[j0:j1] += seg * gl
                R[j0:j1] += seg * gr

            # 无缝循环：超出循环长度的部分折回开头
            if loop and wrap:
                loop_n = int(loop_s * sr)
                if i0 + seg_len > loop_n:
                    ov = i0 + seg_len - loop_n
                    k = min(ov, loop_n)
                    if k > 0:
                        tail_seg = mono[seg_len - ov: seg_len - ov + k]
                        L[:k] += tail_seg * gl
                        R[:k] += tail_seg * gr

        y = np.stack([L, R], axis=-1)

        # 宏观力度弧线：在循环折叠之前施加，保证循环点两端电平一致
        if self.dyn_pts:
            y = self._apply_dynamics(y)

        if not loop:
            y = y[:int(total_s * sr)]

        return y


# ============================================================
# 母带
# ============================================================

def master(y, sr=SR, target_lufs=-17.0, ceiling_db=-2.0,
           eq=None, comp_ratio=1.6, comp_thresh=-18.0, comp_ref=-20.0,
           width=1.15, sat_drive=1.12, bright_db=0.0, low_cut=28.0,
           loop=False, stats=None):
    """
    母带链路：切除次声 -> 预归一 -> 音色 EQ -> 总线压缩 -> 展宽 -> 饱和 -> 限制 -> 响度归一

    ★ loop=True（循环曲必须开）：把素材拼两遍送进链路，只取第二遍输出。

      为什么必须这么做：链路里每一个环节都有状态 —— 高通/EQ 的滤波器记忆、
      压缩器的包络、限制器的前视窗。从头处理一截有限长缓冲时，这些状态都从零起步，
      于是**开头几百个样本是"启动瞬态"，结尾才是稳态**。循环体首尾因此不再属于
      同一个周期，循环点会多出一个本不该有的阶跃。
      实测 bgm_explore：母带前循环点阶跃 -18.7dB（远平滑于邻域过渡），
      母带后变成 +4.7dB —— 阶跃是母带链自己造出来的，源头就在高通那一步
      （0.086 的跳变，占了成品 0.033 的大头）。

      拼两遍、取第二遍：第二遍的入口状态 = 第一遍走完的状态，对任何冲激响应
      远短于乐句长度的滤波器而言，那已经是收敛的周期稳态；第二遍的出口状态
      同样是稳态。取出来的这段正是"周期信号被周期性处理"的结果 —— 首尾天然衔接。
      代价只是 2 倍算力与内存（几十 MB，几秒钟），换来的是循环点不再有人工痕迹。


    顺序是有讲究的：
      · 先 EQ（塑形）再压缩（否则压缩器会跟着被提升的频段乱动作）
      · 饱和放在压缩后（补回被压掉的谐波，增加"响度感"）
      · 限制器必须最后（保证不削波）
      · 最后按 LUFS 归一（游戏多曲目响度一致才不会切歌时忽大忽小）

    ★ 预归一（comp_ref）是这版修的关键，别删。
      原实现直接用固定阈值 -20dBFS 压缩，而本项目编曲渲染出来的素材本身就有
      -6.5 ~ -9.6 LUFS，整首几乎全程高于阈值 —— 实测增益衰减达 4.5 ~ 6.8 dB，
      压缩器从"胶合"退化成"自动压平器"，把编曲仅有的那点起伏又吃掉 ~1 LU。
      先归一到 comp_ref 再压缩，增益衰减就只发生在峰值上，均值稳定在 1~3 dB。

    ★ ceiling_db 默认 -2.0 而非 -1.0：MP3 编码会产生 0.5~1 dB 的真峰值过冲
      （有损编码的通病），留 1 dB 余量才能保证「交付到玩家耳朵里的文件」≤ -1 dBTP。

    stats: 传入 dict 则回填过程量（增益衰减、各级响度），供回归脚本断言。
    """
    y = np.asarray(y, dtype=np.float64)
    mono_in = y.ndim == 1
    ys = D.as_stereo(y)
    st = stats if stats is not None else {}

    # 0) 循环素材：拼两遍再进链路，让所有有状态的环节都工作在周期稳态（见 docstring）
    n_loop = len(ys)
    if loop:
        ys = np.concatenate([ys, ys], axis=0)

    # 1) 切除次声（听不见但吃掉大量动态余量）
    ys = D.highpass(ys, low_cut, q=0.6, sr=sr)

    # 2) 预归一到压缩器工作电平（见上面 ★ 说明）
    cur0 = D.lufs(ys, sr)
    if cur0 > -100:
        ys = ys * D.db2lin(comp_ref - cur0)
    st['pre_gain_db'] = comp_ref - cur0
    st['lra_in'] = D.lra(ys, sr)

    # 3) 音色 EQ
    if eq is None:
        eq = [('peak', 220.0, 1.0, -1.2),     # 去浑浊
              ('peak', 3200.0, 0.9, 1.6),     # 提清晰
              ('hs', 9000.0, 0.8, 1.8 + bright_db)]
    for kind, fc, q, g in eq:
        # biquad 内部已按声道递归（早期版本靠调用点手工拆，一旦漏拆就是静默旁通）
        ys = D.biquad(ys, kind, fc, q, g, sr)

    # 4) 总线压缩（只做胶合）
    #    ★ detector 必须是 'rms'：总线要的是整体电平稳定，不是逐个瞬态下压。
    #      用 'peak' 检测器会让压缩器盯着每个音符的起振点下压，把编曲做出来的
    #      力度起伏又抹平一层 —— 刚才花大力气把 LRA 从 1 LU 拉到 11 LU，
    #      不能在总线这一步还回去。RMS 检测器配 20ms 窗，看到的是"段落电平"。
    tp_before = D.true_peak_db(ys, sr)
    rms_before = D.rms_db(ys)
    # ★ 必须整块立体声喂进去：compressor 内部取 max(L,R) 做联动检测，
    #   一条增益曲线同时驱动两个声道。若在这里按 c in range(2) 分声道调用，
    #   左右各自为政 —— 同一个军鼓在左声道压 3dB、右声道压 1dB，声像就会
    #   随着每次击打左右乱跳。这是总线压缩最容易踩的坑。
    ys = D.compressor(ys, sr=sr, thresh_db=comp_thresh,
                      ratio=comp_ratio, attack=0.020, release=0.25,
                      knee_db=6.0, detector='rms', rms_ms=20.0)
    st['gr_peak_db'] = D.true_peak_db(ys, sr) - tp_before   # 峰值被压掉多少（负=衰减）
    st['gr_rms_db'] = D.rms_db(ys) - rms_before             # 整体电平损失（负=衰减）

    # 5) 立体声展宽
    ys = D.stereo_width(ys, width)

    # 6) 饱和（补谐波，提升响度感而不提升峰值 —— 这是"降峰值/响度比"最不伤动态的手段）
    ys = D.saturate(ys, drive=sat_drive, blend=0.42, kind='tanh')

    # 7) 限制器（同样必须整块立体声：分声道限制会让峰值时刻的声像被拉偏）
    ys = D.limiter(ys, ceiling_db=ceiling_db, sr=sr)

    # 8) 响度归一 + 限制，迭代收敛
    #    ★ 只归一一次是不够的：归一化把峰值顶过上限，限制器又把它压回来，
    #      一次下来 miss 目标最多 2 dB（实测 battle 差 2.01 dB），而且各曲 miss 的量
    #      不一样，会把"菜单最静、BOSS 最澎湃"的强弱梯度搞成反的。
    #      归一/限制交替迭代几轮即收敛（母带工具的标准做法），
    #      上限 4 轮是为了防止无脑压到底把瞬态压碎。
    st['norm_passes'] = 0
    cur = D.lufs(ys, sr)
    if cur > -100:
        for it in range(4):
            if abs(target_lufs - cur) < 0.15:
                break
            ys = ys * D.db2lin(target_lufs - cur)
            ys = D.limiter(ys, ceiling_db=ceiling_db, sr=sr)
            st['norm_passes'] = it + 1
            cur = D.lufs(ys, sr)
    st['lufs_miss'] = cur - target_lufs

    # 9) 去直流偏移（保险，避免亚音速成分带来的轻微 DC）
    ys = ys - ys.mean(axis=0, keepdims=True)

    # 10) 循环素材：丢掉用来预热状态的第一遍，只留工作在周期稳态上的第二遍。
    #     统计量也必须在这一步之后量 —— 量的必须是交付出去的那一段。
    if loop:
        ys = ys[n_loop:]

    st['lufs'] = D.lufs(ys, sr)
    st['tp'] = D.true_peak_db(ys, sr)
    st['lra'] = D.lra(ys, sr)
    st['crest'] = D.crest_db(ys)
    return ys if not mono_in else ys.mean(axis=-1)


def master_sfx(y, sr=SR, target_lufs=-16.0, ceiling_db=-2.0,
               target_tp=-3.0, max_shave_db=14.0,
               width=1.0, sat_drive=1.3, low_cut=40.0, stats=None):
    """音效母带：按需削峰 + 响度归一。

    ★ 核心思路：可达响度 = 真峰值上限 − PLR（峰/响度比）。

      分类响度目标一定，PLR 越大的音效能达到的 LUFS 就越低。旧实现用
      "响度归一 + 峰值钳位"，结果是钳位负责兜底、响度目标形同虚设 ——
      实测 41 个音效里有 26 个被钳位，battle 类内散开 6.49 LU
      （-22.49 ~ -16.00），玩家听到的就是"宝箱开启比怪物出场还响"这类失衡。

      根因不在归一化策略，在素材本身的 PLR：实测这批音效 PLR 8.5~25.1dB，
      中位 16.2。所以真正的解法是**先把 PLR 削到达标的线，再归一**：
        target_plr = target_tp − target_lufs
      PLR 削到这条线以下，响度目标与真峰值上限就能同时满足，不再需要钳位。
      PLR 本来就低的音效（dmg_crit 8.5、monster_spawn 9.3、attack_range 10.1）
      一个 dB 都不会被动 —— 好素材不该为坏素材陪绑。

    ★ 削峰用 D.reduce_plr（过采样 tanh 软削波），不用压缩器：
      压缩器削瞬态需要毫秒级 release，而毫秒级 release 会跟着低频波形跑，
      在 40~80Hz 上造成十几 dB 的增益调制 —— 那是失真不是削峰。
      软削波无记忆、无时间常数，不存在这个问题。

    参数：
      target_lufs   分类响度目标（见 build_sfx.LOUDNESS_BY_CAT）
      target_tp     分类真峰值上限
      max_shave_db  削峰量上限，保护极端素材不被削成一坨糊的
    """
    y = np.asarray(y, dtype=np.float64)
    mono_in = y.ndim == 1
    ys = D.as_stereo(y)
    st = stats if stats is not None else {}

    ys = D.highpass(ys, low_cut, q=0.6, sr=sr)
    if width != 1.0:
        ys = D.stereo_width(ys, width)

    # 1) 按需削峰：削到"响度目标与峰值上限能同时满足"为止
    target_plr = target_tp - target_lufs
    ys, _ = D.reduce_plr(ys, sr, target_plr=target_plr,
                         max_shave_db=max_shave_db, stats=st)
    st['crest_in'] = st.get('plr_in')
    st['crest_after_comp'] = st.get('plr_out')

    # 2) 轻度饱和：只为音色与粘合，不为削峰（削峰已在上一步精确完成）
    ys = D.saturate(ys, drive=sat_drive, blend=0.45, kind='tanh')
    ys = D.limiter(ys, ceiling_db=ceiling_db, sr=sr)

    # 3) 响度归一 —— 决定"听感有多响"
    cur = D.lufs(ys, sr)
    if cur > -100:
        ys = ys * D.db2lin(target_lufs - cur)
        ys = D.limiter(ys, ceiling_db=ceiling_db, sr=sr)

    # 4) 真峰值钳位 —— 决定"绝对不会越界"。PLR 削到位后这里应当是空操作，
    #    只有 max_shave_db 兜底触发的极端素材才会走到。
    if target_tp is not None:
        tp = D.true_peak_db(ys, sr)
        if tp > -100 and tp > target_tp:
            ys = ys * D.db2lin(target_tp - tp)
            ys = D.limiter(ys, ceiling_db=ceiling_db, sr=sr)

    # 去直流偏移（保险）
    ys = ys - ys.mean(axis=0, keepdims=True)

    st['lufs'] = D.lufs(ys, sr)
    st['tp'] = D.true_peak_db(ys, sr)
    st['plr'] = st['tp'] - st['lufs']
    # ★ 判据是"响度目标有没有达到"，不是"真峰值离上限有多近"。
    #   后者会误报：PLR 刚好削到目标线时 TP 必然贴近 target_tp，那是正常达标，
    #   不是被钳位。只有 PLR 削不到位（撞上 max_shave_db）才会真的影响响度。
    st['lufs_miss'] = st['lufs'] - target_lufs
    st['tp_clamped'] = abs(st['lufs_miss']) > 0.25
    return ys if not mono_in else ys.mean(axis=-1)
