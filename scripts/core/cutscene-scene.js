/**
 * cutscene-scene.js — 引擎内过场演出场景（路线 A：零包体成本）
 *
 * 复用现有 CharacterSprite（走路/待机/技能帧）+ Canvas2D 主循环，编排"电影感"过场：
 *   - 相机平移 / 缩放（focus 分数坐标 + zoom，设备无关）
 *   - 角色精灵补间走位（actor.at 分数坐标，walk/idle/技能态由 CharacterSprite 驱动）
 *   - 打字机字幕 + 旁白（居中斜体） + 说话人名牌
 *   - 黑场淡入淡出 + 信箱条（2.39:1 影院感）
 *   - 主题背景渐变 + 视差剪影（零外部资源依赖，不增包体）
 *   - 跳过按钮 / 点击推进
 *
 * 剧本数据来自 scripts/data/cutscenes.js（CUTSCENES 注册表）。
 *
 * 使用：
 *   game.playCutscene('ch1_intro', () => game.changeScene('town'))
 * 或在主菜单按钮里触发。
 *
 * 坐标系约定：
 *   - 所有屏幕定位用"分数"(0~1)：actor.at = {x,y} 表示占屏幕宽/高的比例。
 *   - 相机 focus = {x,y} 同样为分数；zoom 为整体缩放（1=原始）。
 *   - 渲染时世界层先 translate(panX,panY) 再 scale(zoom,zoom)，角色按物理 px 绘制。
 */

import { SceneBase } from './scene-base.js'
import { CharacterSprite } from './character-sprite.js'
import { CUTSCENES, getHeroById } from '../data/cutscenes.js'

// ── 可调参数 ───────────────────────────────
const CHARS_PER_SEC = 42          // 打字机速度
const LINE_HOLD = 0.45            // 自动模式下两行字幕间隔（秒）
const CAM_DUR_DEFAULT = 0.9       // 相机补间默认时长
const LETTERBOX_FRAC = 0.11       // 信箱条占屏高比例（每侧）
const BEAT_FADE = 0.45            // 黑场淡入淡出时长（秒）

// ── 主题背景（RGB）─────────────────────────
const THEMES = {
  dawn:   { top: [38, 52, 96],  mid: [122, 132, 184], bottom: [247, 196, 162] },
  day:    { top: [120, 178, 232], mid: [168, 210, 240], bottom: [214, 236, 214] },
  sunset: { top: [58, 40, 92],  mid: [196, 104, 120], bottom: [248, 178, 120] },
  night:  { top: [10, 12, 34],  mid: [26, 30, 70],   bottom: [44, 40, 92] },
  battle: { top: [44, 14, 22],  mid: [110, 34, 40],  bottom: [150, 70, 56] },
  flash:  { top: [230, 230, 240], mid: [245, 245, 250], bottom: [255, 255, 255] },
}
const DEFAULT_THEME = 'dawn'

function lerp(a, b, k) { return a + (b - a) * k }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2 }
function rgbStr(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` }
function lerpTheme(a, b, k) {
  return {
    top: [lerp(a.top[0], b.top[0], k), lerp(a.top[1], b.top[1], k), lerp(a.top[2], b.top[2], k)],
    mid: [lerp(a.mid[0], b.mid[0], k), lerp(a.mid[1], b.mid[1], k), lerp(a.mid[2], b.mid[2], k)],
    bottom: [lerp(a.bottom[0], b.bottom[0], k), lerp(a.bottom[1], b.bottom[1], k), lerp(a.bottom[2], b.bottom[2], k)],
  }
}

export class CutsceneScene extends SceneBase {
  constructor(game, data = {}) {
    super(game)
    this.cutscene = true                 // 让 Game._sceneHasBlockingModal 隐藏全局背包按钮
    this.scenarioId = data.scenarioId || 'ch1_intro'
    this.onDone = typeof data.onDone === 'function' ? data.onDone : null
  }

  init() {
    const scenario = CUTSCENES[this.scenarioId]
    if (!scenario || !Array.isArray(scenario.beats) || scenario.beats.length === 0) {
      console.warn(`[Cutscene] 未找到剧本 ${this.scenarioId}，直接结束`)
      this._finish()
      return
    }
    this.scenario = scenario
    this.beats = scenario.beats

    // 相机（分数焦点 + zoom）
    this.cam = { fx: 0.5, fy: 0.6, zoom: 1 }
    this.camFrom = { ...this.cam }
    this.camTo = { ...this.cam }
    this.camT = 0
    this.camDur = 0.01

    // 角色
    this.actors = new Map()

    // 背景主题（含交叉淡入）
    const startTheme = scenario.startTheme || DEFAULT_THEME
    this.bgCur = THEMES[startTheme] || THEMES[DEFAULT_THEME]
    this.bgFrom = this.bgCur
    this.bgTo = this.bgCur
    this.bgBlend = 1

    // 信箱条（动画入场）
    this.letterbox = 0
    this.letterboxTarget = LETTERBOX_FRAC

    // 黑场
    this.fade = 1     // 开场黑场淡入（由 Game 切换淡入叠加，这里再补一层保证纯黑起手）
    this.fadeTarget = 0

    // 时间线状态
    this.bi = -1
    this.phase = 'idle'
    this.lineIdx = 0
    this.typed = 0
    this.lineTimer = 0
    this.beatHoldTimer = 0
    this.finished = false
    this._onDoneCalled = false

    // 跳过按钮
    this.skipBtn = {
      x: this.width - 96 * this.dpr,
      y: 16 * this.dpr,
      w: 80 * this.dpr,
      h: 36 * this.dpr,
    }

    // 预创建所有剧本中出现的角色精灵（资源缺失时静默跳过，不崩）
    const seen = new Set()
    for (const b of this.beats) {
      for (const a of (b.actors || [])) {
        if (seen.has(a.id)) continue
        seen.add(a.id)
        this._ensureActor(a)
      }
    }

    this._enterBeat(0)
  }

  // ── 角色管理 ─────────────────────────────
  _ensureActor(spec) {
    if (this.actors.has(spec.id)) return this.actors.get(spec.id)
    const heroBase = getHeroById(spec.heroId || spec.id)
    // 允许剧本用 renderConfig 覆盖渲染参数（如艾米强制 AIMI 前缀）
    const hero = (heroBase && spec.renderConfig)
      ? { ...heroBase, renderConfig: { ...(heroBase.renderConfig || {}), ...spec.renderConfig } }
      : heroBase
    let sprite = null
    try {
      if (hero) sprite = new CharacterSprite(this.game, hero)
    } catch (e) {
      console.warn(`[Cutscene] 角色 ${spec.id} 精灵创建失败:`, e)
    }
    const actor = {
      id: spec.id,
      name: spec.name || (hero && hero.name) || spec.id,
      sprite,
      fx: spec.at ? spec.at.x : 0.5,
      fy: spec.at ? spec.at.y : 0.75,
      face: spec.face === 'left',
      state: spec.state || 'idle',
      moving: !!spec.moving,
      alpha: spec.alpha != null ? spec.alpha : 1,
      // 补间
      fromFx: spec.at ? spec.at.x : 0.5,
      fromFy: spec.at ? spec.at.y : 0.75,
      fromAlpha: spec.alpha != null ? spec.alpha : 1,
      toFx: spec.at ? spec.at.x : 0.5,
      toFy: spec.at ? spec.at.y : 0.75,
      toAlpha: spec.alpha != null ? spec.alpha : 1,
      t: 0,
      dur: 0.01,
    }
    this.actors.set(spec.id, actor)
    return actor
  }

  // ── beat 切换 ─────────────────────────────
  _enterBeat(i) {
    this.bi = i
    const b = this.beats[i]

    // 背景主题交叉淡入
    if (b.bg && THEMES[b.bg]) {
      this.bgFrom = this.bgCur
      this.bgTo = THEMES[b.bg]
      this.bgBlend = 0
    }

    // 相机
    const camDur = b.camera && b.camera.dur != null ? b.camera.dur : CAM_DUR_DEFAULT
    this.camFrom = { ...this.cam }
    this.camTo = {
      fx: b.camera && b.camera.focus ? b.camera.focus.x : this.cam.fx,
      fy: b.camera && b.camera.focus ? b.camera.focus.y : this.cam.fy,
      zoom: b.camera && b.camera.zoom != null ? b.camera.zoom : this.cam.zoom,
    }
    this.camT = 0
    this.camDur = Math.max(0.01, camDur)

    // 角色补间
    const actorDur = b.actorDur != null ? b.actorDur : camDur
    for (const spec of (b.actors || [])) {
      const actor = this._ensureActor(spec)
      actor.fromFx = actor.fx
      actor.fromFy = actor.fy
      actor.fromAlpha = actor.alpha
      actor.toFx = spec.at ? spec.at.x : actor.fx
      actor.toFy = spec.at ? spec.at.y : actor.fy
      actor.toAlpha = spec.exit ? 0 : (spec.alpha != null ? spec.alpha : 1)
      actor.t = 0
      actor.dur = Math.max(0.01, actorDur)
      if (spec.face) actor.face = spec.face === 'left'
      if (spec.state) actor.state = spec.state
      if (spec.moving != null) actor.moving = !!spec.moving
    }

    // 音频
    if (b.bgm && this.game.audio && this.game.audio.playBGM) {
      try { this.game.audio.playBGM(b.bgm) } catch (e) { /* 忽略 */ }
    }
    if (b.sfx && this.game.audio && this.game.audio.playSFX) {
      try { this.game.audio.playSFX(b.sfx) } catch (e) { /* 忽略 */ }
    }

    // 黑场
    if (b.fade === 'in') {
      this.fade = 1
      this.fadeTarget = 0
    } else if (b.fade === 'out') {
      this.fadeTarget = 1
    } else {
      this.fadeTarget = 0
    }

    // 字幕
    this.lineIdx = 0
    this.typed = 0
    this.lineTimer = 0
    this.beatHoldTimer = b.hold != null ? b.hold : 2.6
    this.phase = 'lines'
  }

  _nextBeat() {
    if (this.bi + 1 >= this.beats.length) {
      this._finish()
    } else {
      this._enterBeat(this.bi + 1)
    }
  }

  _finish() {
    if (this.finished) return
    this.finished = true
    if (this.scenarioId && this.game.data && this.game.data.set) {
      try { this.game.data.set(`cutsceneSeen.${this.scenarioId}`, true) } catch (e) { /* 忽略 */ }
    }
    if (!this._onDoneCalled) {
      this._onDoneCalled = true
      if (this.onDone) {
        this.onDone()
      } else if (this.game.changeScene) {
        this.game.changeScene('town')
      }
    }
  }

  // 点击推进（标准视觉小说行为）
  _advance() {
    const b = this.beats[this.bi]
    const lines = (b && b.lines) || []
    const cur = lines[this.lineIdx]
    const curLen = cur ? (cur.text ? cur.text.length : 0) : 0
    if (this.typed < curLen) {
      this.typed = curLen            // 先把当前行打完
      return
    }
    if (this.lineIdx < lines.length - 1) {
      this.lineIdx++
      this.typed = 0
      this.lineTimer = 0
      return
    }
    // 所有行已显示 → 进入下一 beat
    this._nextBeat()
  }

  // ── 主循环 ───────────────────────────────
  update(dt) {
    if (this.finished) return
    dt = Math.min(dt, 0.05)          // 防卡顿大跳

    // 信箱条入场
    if (this.letterbox < this.letterboxTarget) {
      this.letterbox = Math.min(this.letterboxTarget, this.letterbox + dt * 0.35)
    }

    // 黑场
    if (this.fade < this.fadeTarget) this.fade = Math.min(this.fadeTarget, this.fade + dt / BEAT_FADE)
    else if (this.fade > this.fadeTarget) this.fade = Math.max(this.fadeTarget, this.fade - dt / BEAT_FADE)

    // 背景交叉淡入
    if (this.bgBlend < 1) {
      this.bgBlend = Math.min(1, this.bgBlend + dt / 0.6)
      this.bgCur = lerpTheme(this.bgFrom, this.bgTo, easeInOut(this.bgBlend))
    }

    // 相机补间
    if (this.camT < this.camDur) {
      this.camT = Math.min(this.camDur, this.camT + dt)
      const k = easeInOut(this.camT / this.camDur)
      this.cam.fx = lerp(this.camFrom.fx, this.camTo.fx, k)
      this.cam.fy = lerp(this.camFrom.fy, this.camTo.fy, k)
      this.cam.zoom = lerp(this.camFrom.zoom, this.camTo.zoom, k)
    }

    // 角色补间
    for (const actor of this.actors.values()) {
      if (actor.t < actor.dur) {
        actor.t = Math.min(actor.dur, actor.t + dt)
        const k = easeInOut(actor.t / actor.dur)
        actor.fx = lerp(actor.fromFx, actor.toFx, k)
        actor.fy = lerp(actor.fromFy, actor.toFy, k)
        actor.alpha = lerp(actor.fromAlpha, actor.toAlpha, k)
      }
      // 精灵动画推进
      if (actor.sprite) {
        actor.sprite.update(dt, actor.moving, actor.face)
        // 战斗态（attack/skill/buff）由外部 state 驱动，自动播放
        if (['attack', 'skill', 'buff', 'shield', 'support'].includes(actor.state)) {
          actor.sprite.state = actor.state
        } else {
          actor.sprite.state = 'idle'
        }
      }
    }

    // 字幕时间线
    const b = this.beats[this.bi]
    if (!b) return
    const lines = b.lines || []
    const cur = lines[this.lineIdx]
    const curLen = cur ? (cur.text ? cur.text.length : 0) : 0

    if (this.phase === 'lines' || this.phase === 'wait') {
      if (cur && this.typed < curLen) {
        this.typed = Math.min(curLen, this.typed + dt * CHARS_PER_SEC)
      } else if (cur && this.typed >= curLen && this.lineIdx < lines.length - 1 && !b.waitTap) {
        // 自动进阶到下一行
        this.lineTimer += dt
        if (this.lineTimer >= LINE_HOLD) {
          this.lineIdx++
          this.typed = 0
          this.lineTimer = 0
        }
      } else {
        // 当前行已显示（或无私幕）：进入收尾阶段
        if (b.fade === 'out') {
          this.fadeTarget = 1
          if (this.fade >= 1 - 1e-3 && this.camT >= this.camDur) {
            this._nextBeat()
          }
        } else if (b.waitTap) {
          // 等待点击（由 handleTap 推进）
        } else {
          this.beatHoldTimer -= dt
          if (this.beatHoldTimer <= 0) this._nextBeat()
        }
      }
    }
  }

  handleTap(tap) {
    if (this.finished) return false
    // 跳过按钮
    const s = this.skipBtn
    if (s && tap.x >= s.x && tap.x <= s.x + s.w && tap.y >= s.y && tap.y <= s.y + s.h) {
      this._finish()
      return true
    }
    this._advance()
    return true
  }

  // ── 渲染 ─────────────────────────────────
  render(ctx) {
    if (this.finished) return
    const W = this.width, H = this.height, d = this.dpr

    // 1) 背景（屏幕空间，带轻微视差）
    this._renderBackground(ctx, W, H)

    // 2) 世界层（相机变换 + 角色）
    const panX = W / 2 - this.cam.zoom * (this.cam.fx * W)
    const panY = H / 2 - this.cam.zoom * (this.cam.fy * H)
    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(this.cam.zoom, this.cam.zoom)
    // 按 fy 排序（Y 轴遮挡，靠下者在前）
    const list = [...this.actors.values()].filter(a => a.alpha > 0.02)
    list.sort((a, b) => a.fy - b.fy)
    for (const actor of list) {
      if (!actor.sprite) continue
      const ax = actor.fx * W
      const ay = actor.fy * H
      ctx.save()
      if (actor.alpha < 1) ctx.globalAlpha = actor.alpha
      actor.sprite.render(ctx, ax, ay)
      ctx.restore()
    }
    ctx.restore()

    // 3) 字幕 / 旁白
    this._renderSubtitle(ctx, W, H, d)

    // 4) 信箱条
    this._renderLetterbox(ctx, W, H, d)

    // 5) 跳过按钮
    this._renderSkip(ctx, d)

    // 6) 黑场
    if (this.fade > 0.001) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  _renderBackground(ctx, W, H) {
    const th = this.bgCur
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, rgbStr(th.top))
    grad.addColorStop(0.55, rgbStr(th.mid))
    grad.addColorStop(1, rgbStr(th.bottom))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // 视差剪影：远山（慢）+ 近丘（快），用相机 pan 制造景深
    const panX = (W / 2 - this.cam.zoom * (this.cam.fx * W))
    const panY = (H / 2 - this.cam.zoom * (this.cam.fy * H))
    this._renderHills(ctx, W, H, -panX * 0.15 + 0, 0.78, th.bottom, 0.5)
    this._renderHills(ctx, W, H, -panX * 0.35, 0.9, th.mid, 0.45)
    // 飘浮光点（萤火/星尘）
    const t = this.time
    ctx.fillStyle = 'rgba(255,250,220,0.5)'
    for (let i = 0; i < 18; i++) {
      const fx = ((i * 97.3) % W)
      const fy = (H * 0.2) + ((i * 53.7 + t * 18) % (H * 0.5))
      const r = 1.5 * this.dpr
      ctx.beginPath()
      ctx.arc((fx + panX * 0.1) % W, fy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  _renderHills(ctx, W, H, offsetX, baseFrac, colArr, alpha) {
    const baseY = H * baseFrac
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = rgbStr(colArr)
    ctx.beginPath()
    ctx.moveTo(-50, H)
    const segs = 6
    for (let i = 0; i <= segs; i++) {
      const x = -50 + (W + 100) * (i / segs) + offsetX
      const y = baseY - Math.sin(i * 1.3 + baseFrac * 10) * H * 0.06
      ctx.lineTo(x, y)
    }
    ctx.lineTo(W + 50, H)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  _renderSubtitle(ctx, W, H, d) {
    const b = this.beats[this.bi]
    if (!b) return
    const lines = b.lines || []
    const cur = lines[this.lineIdx]
    if (!cur) return
    const shown = cur.text ? cur.text.slice(0, Math.floor(this.typed)) : ''

    // 旁白：居中斜体，无对话框
    if (cur.narrator) {
      ctx.save()
      ctx.font = `italic ${22 * d}px sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 6 * d
      const y = H * 0.5
      const wrapped = this._wrap(ctx, shown, W * 0.8)
      wrapped.forEach((ln, i) => ctx.fillText(ln, W / 2, y + (i - (wrapped.length - 1) / 2) * 30 * d))
      ctx.restore()
      return
    }

    // 对话框：底部条
    const boxH = 120 * d
    const boxY = H - this.letterbox * H - boxH
    const padX = 28 * d
    const r = 16 * d
    ctx.save()
    // 背板
    ctx.beginPath()
    this._roundRect(ctx, padX, boxY, W - padX * 2, boxH, r)
    ctx.fillStyle = 'rgba(12,14,30,0.78)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 2 * d
    ctx.stroke()

    // 说话人名牌
    if (cur.speaker) {
      const tabW = (cur.speaker.length * 22 + 28) * d
      const tabH = 34 * d
      const tabX = padX + 10 * d
      const tabY = boxY - tabH + 2 * d
      ctx.beginPath()
      this._roundRect(ctx, tabX, tabY, tabW, tabH, 10 * d)
      ctx.fillStyle = 'rgba(255,159,67,0.95)'
      ctx.fill()
      ctx.font = `bold ${20 * d}px sans-serif`
      ctx.fillStyle = '#1a1a1a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(cur.speaker, tabX + tabW / 2, tabY + tabH / 2)
    }

    // 正文（自动换行）
    ctx.font = `${22 * d}px sans-serif`
    ctx.fillStyle = '#f5f5f5'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const textX = padX + 20 * d
    const textY = boxY + 22 * d
    const maxW = W - padX * 2 - 40 * d
    const wrapped = this._wrap(ctx, shown, maxW)
    wrapped.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, textX, textY + i * 30 * d))
    ctx.restore()
  }

  _renderLetterbox(ctx, W, H, d) {
    const lb = this.letterbox * H
    if (lb <= 0.5) return
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, lb)
    ctx.fillRect(0, H - lb, W, lb)
  }

  _renderSkip(ctx, d) {
    const s = this.skipBtn
    ctx.save()
    ctx.beginPath()
    this._roundRect(ctx, s.x, s.y, s.w, s.h, 18 * d)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1.5 * d
    ctx.stroke()
    ctx.font = `${16 * d}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('跳过 ▶▶', s.x + s.w / 2, s.y + s.h / 2)
    ctx.restore()
  }

  _wrap(ctx, text, maxWidth) {
    if (!text) return ['']
    const out = []
    let line = ''
    for (const ch of text) {
      if (ch === '\n') {
        out.push(line)
        line = ''
        continue
      }
      const test = line + ch
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line)
        line = ch
      } else {
        line = test
      }
    }
    if (line) out.push(line)
    return out
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  destroy() {
    this.actors.clear()
  }
}
