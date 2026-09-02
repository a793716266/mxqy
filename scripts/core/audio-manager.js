/**
 * audio-manager.js - 音频引擎（喵星奇缘）
 *
 * 设计要点（相较旧版的改进）：
 *   1. BGM 等功率交叉淡化（equal-power crossfade）——场景切换不再"啪"一下硬切
 *   2. SFX 语音池 + 并发上限 + 优先级抢占（voice stealing）——爆发战斗不糊、不爆音
 *   3. 同音效节流 + 随机微调音高/音量——连击不再"机械重复"
 *   4. 场景 → BGM 自动映射（setScene）——场景没显式指定时自动播放对应曲目
 *   5. onEnded/onError 只在实例创建时注册一次（避免微信 InnerAudioContext 监听器泄漏）
 *   6. 静音期间仍记录"期望 BGM"，取消静音后自动接续
 *
 * 使用方式：
 *   this.audio = AudioManager.getInstance()
 *   this.audio.playBGM('bgm_town')                 // 显式指定（带交叉淡化）
 *   this.audio.setScene('town')                    // 场景默认 BGM（由 game.changeScene 调用）
 *   this.audio.playSFX('ui_click')
 *   this.audio.playSFX('hit_crit', { volumeScale: 1.1, pitch: 0.05 })
 *   this.audio.playSkillSFX('fireball', 'magic')   // 技能释放
 *   this.audio.playSkillHitSFX('fireball')         // 技能命中
 */

import {
  SOUND_CONFIG,
  hasSound,
  getSoundPath,
  getSceneBGM,
  getPriority,
  getSkillSFX,
  getSkillHitSFX
} from '../config/sound-config.js'

// 同一音效最小间隔（毫秒）：低于此间隔的重复请求直接丢弃，避免同相位叠加爆音
const DEFAULT_MIN_GAP_MS = 35
// 淡化 ramp 的步进间隔（毫秒）
const RAMP_STEP_MS = 50

export class AudioManager {
  constructor() {
    // —— BGM ——
    this._bgm = null            // 当前 BGM 的 InnerAudioContext
    this._bgmId = null          // 当前正在播放的 BGM ID
    this._desiredBgmId = null   // 期望播放的 BGM ID（静音时也记录，解除静音后接续）
    this._fadingOut = []        // 正在淡出待销毁的旧 BGM 实例

    // —— SFX ——
    this._sfxPool = []          // 语音槽位数组：{ ctx, id, priority, playing, startAt, token }
    this._lastPlayAt = {}       // soundId → 上次播放时间戳（节流）

    // —— 全局 ——
    this._muted = SOUND_CONFIG.muted
    this._bgmVolume = SOUND_CONFIG.bgm.volume
    this._sfxVolume = SOUND_CONFIG.sfx.volume
    this._maxInstances = SOUND_CONFIG.sfx.maxInstances || 8
    this._crossfadeMs = Math.max(0, (SOUND_CONFIG.bgm.crossfade || 0) * 1000)

    // —— 场景 ——
    this._sceneName = null
    this._explicitBGM = false   // 本次场景切换内场景是否已显式调用 playBGM

    // —— 内部 ——
    this._timers = new Set()    // 所有 ramp 定时器（销毁时统一清理）
    this._webaudio = null       // WebAudio 上下文（挥击破风声等纯合成音）
    this._tokenSeq = 0
  }

  // ==========================================================
  // 内部工具
  // ==========================================================

  _now() {
    return Date.now()
  }

  _hasWx() {
    return typeof wx !== 'undefined' && !!wx.createInnerAudioContext
  }

  /**
   * 音量渐变（等功率曲线）。淡入用 sqrt(t)，淡出用 1-sqrt(1-t)，
   * 保证交叉淡化过程中感知总音量恒定（线性叠加会在中点凹陷 -3dB）。
   */
  _ramp(ctx, from, to, durMs, onDone) {
    if (!ctx) { if (onDone) onDone(); return null }
    const clamp = (v) => Math.max(0, Math.min(1, v))
    if (durMs <= 0 || typeof setInterval === 'undefined') {
      try { ctx.volume = clamp(to) } catch (e) {}
      if (onDone) onDone()
      return null
    }
    const steps = Math.max(1, Math.round(durMs / RAMP_STEP_MS))
    const rising = to > from
    let i = 0
    try { ctx.volume = clamp(from) } catch (e) {}
    const timer = setInterval(() => {
      i++
      const t = Math.min(1, i / steps)
      // 等功率缓动
      const eased = rising ? Math.sqrt(t) : (1 - Math.sqrt(1 - t))
      try { ctx.volume = clamp(from + (to - from) * eased) } catch (e) {}
      if (i >= steps) {
        clearInterval(timer)
        this._timers.delete(timer)
        if (onDone) onDone()
      }
    }, RAMP_STEP_MS)
    this._timers.add(timer)
    return timer
  }

  /** 新建一个 SFX 槽位，onEnded/onError 只注册一次，用 token 防止过期回调误清状态 */
  _createSlot() {
    if (!this._hasWx()) return null
    let ctx = null
    try { ctx = wx.createInnerAudioContext() } catch (e) { return null }
    if (!ctx) return null
    const slot = { ctx, id: null, priority: 0, playing: false, startAt: 0, token: 0 }
    const release = (tk) => {
      // 只有当前这次播放的回调才能释放槽位（避免抢占后旧回调把新播放标记为空闲）
      if (tk === slot.token) slot.playing = false
    }
    try {
      ctx.onEnded(() => release(slot.token))
      ctx.onStop(() => release(slot.token))
      ctx.onError((err) => {
        console.warn(`[Audio] SFX 播放失败: ${slot.id}`, err)
        release(slot.token)
      })
    } catch (e) {}
    this._sfxPool.push(slot)
    return slot
  }

  /**
   * 取一个可用槽位：空闲复用 → 未达上限则新建 → 达上限按优先级抢占。
   * 抢占规则：只抢优先级 <= 自己的；同优先级抢最早开始的（经典 voice stealing）。
   * 若池内全部比自己重要，返回 null（本次请求丢弃，而不是把重要音效顶掉）。
   */
  _acquireSlot(priority) {
    const idle = this._sfxPool.find(s => !s.playing)
    if (idle) return idle

    if (this._sfxPool.length < this._maxInstances) {
      const fresh = this._createSlot()
      if (fresh) return fresh
    }

    let victim = null
    for (const s of this._sfxPool) {
      if (s.priority > priority) continue          // 更重要 → 不抢
      if (!victim ||
          s.priority < victim.priority ||
          (s.priority === victim.priority && s.startAt < victim.startAt)) {
        victim = s
      }
    }
    if (!victim) return null
    try { victim.ctx.stop() } catch (e) {}
    victim.playing = false
    return victim
  }

  // ==========================================================
  // BGM
  // ==========================================================

  /**
   * 播放背景音乐（自动与当前 BGM 交叉淡化）
   * @param {string} soundId - 如 'bgm_town'
   * @param {boolean} forceRestart - 已在播放同一曲目时是否强制从头开始
   * @param {Object} opts - { fadeMs?: number, loop?: boolean }
   */
  playBGM(soundId, forceRestart = false, opts = {}) {
    // 标记"场景已显式指定 BGM"，setScene 便不再覆盖
    this._explicitBGM = true
    this._desiredBgmId = soundId

    const path = getSoundPath(soundId)
    if (!path) {
      console.log(`[Audio] BGM 未配置: ${soundId}`)
      return
    }
    if (this._muted) return   // 静音：只记录期望，解除静音时补播

    // 同曲目且在放 → 不打断（避免场景内反复调用导致重头播放）
    if (this._bgmId === soundId && this._bgm && !forceRestart) {
      let paused = false
      try { paused = !!this._bgm.paused } catch (e) {}
      if (!paused) return
      try { this._bgm.play() } catch (e) {}
      return
    }

    if (!this._hasWx()) {
      this._bgmId = soundId
      console.log(`[Audio] 播放BGM: ${soundId} (${path})`)
      return
    }

    const fadeMs = (opts.fadeMs != null) ? opts.fadeMs : this._crossfadeMs
    const target = this._bgmVolume

    // 1) 旧 BGM 淡出并销毁
    const old = this._bgm
    if (old) {
      let cur = target
      try { cur = old.volume } catch (e) {}
      this._fadingOut.push(old)
      this._ramp(old, cur, 0, fadeMs, () => {
        try { old.stop() } catch (e) {}
        try { old.destroy() } catch (e) {}
        const i = this._fadingOut.indexOf(old)
        if (i !== -1) this._fadingOut.splice(i, 1)
      })
    }

    // 2) 新 BGM 从 0 淡入
    let next = null
    try { next = wx.createInnerAudioContext() } catch (e) { next = null }
    if (!next) { this._bgm = null; this._bgmId = null; return }
    try {
      next.src = path
      next.loop = (opts.loop != null) ? opts.loop : SOUND_CONFIG.bgm.loop
      next.volume = old ? 0 : target      // 无旧曲目时直接给目标音量（避免开场 1.4s 才出声）
      next.onError((err) => console.warn(`[Audio] BGM 播放失败: ${soundId}`, err))
      next.play()
    } catch (e) {
      console.warn(`[Audio] BGM 异常: ${soundId}`, e)
    }
    this._bgm = next
    this._bgmId = soundId
    if (old) this._ramp(next, 0, target, fadeMs)
    console.log(`[Audio] 播放BGM: ${soundId}${old ? ' (交叉淡化)' : ''}`)
  }

  /**
   * 停止背景音乐
   * @param {boolean} immediate - true=立即停；false=淡出后停
   */
  stopBGM(immediate = false) {
    this._desiredBgmId = null
    const cur = this._bgm
    this._bgm = null
    this._bgmId = null
    if (!cur) return
    if (immediate || this._crossfadeMs <= 0) {
      try { cur.stop() } catch (e) {}
      try { cur.destroy() } catch (e) {}
      return
    }
    let v = this._bgmVolume
    try { v = cur.volume } catch (e) {}
    this._fadingOut.push(cur)
    this._ramp(cur, v, 0, this._crossfadeMs, () => {
      try { cur.stop() } catch (e) {}
      try { cur.destroy() } catch (e) {}
      const i = this._fadingOut.indexOf(cur)
      if (i !== -1) this._fadingOut.splice(i, 1)
    })
  }

  pauseBGM() {
    if (this._bgm) { try { this._bgm.pause() } catch (e) {} }
  }

  resumeBGM() {
    if (this._bgm) { try { this._bgm.play() } catch (e) {} }
  }

  // ==========================================================
  // 场景联动
  // ==========================================================

  /**
   * 场景切换开始时调用（由 game.changeScene 在构建新场景前调用）。
   * 清除"显式指定"标记，这样若新场景自己不 playBGM，setScene 就会用默认曲目兜底。
   */
  beginSceneChange() {
    this._explicitBGM = false
  }

  /**
   * 场景切换完成后调用。若场景已自行 playBGM 则尊重场景选择；
   * 否则按 SCENE_BGM 映射自动播放该场景的默认 BGM。
   * @param {string} sceneName - 'main-menu' | 'town' | 'field' | 'battle' | 'collection' | 'tower'
   */
  setScene(sceneName) {
    this._sceneName = sceneName
    if (this._explicitBGM) {
      this._explicitBGM = false
      return
    }
    const id = getSceneBGM(sceneName)
    if (!id) return
    this.playBGM(id)
    this._explicitBGM = false   // 这是兜底播放，不算场景显式指定
  }

  getSceneName() {
    return this._sceneName
  }

  // ==========================================================
  // SFX
  // ==========================================================

  /**
   * 播放音效
   * @param {string} soundId
   * @param {number|Object} opts - 数字=音量倍数（向后兼容）；对象= {
   *     volumeScale?: number,   // 音量倍数，默认 1
   *     pitch?: number,         // 音高随机抖动幅度（0~0.5），如 0.06 表示 ±6%
   *     priority?: number,      // 覆盖配置优先级
   *     minGapMs?: number,      // 同音效节流间隔，默认 35ms；传 0 关闭节流
   *   }
   */
  playSFX(soundId, opts = 1.0) {
    if (this._muted) return
    if (typeof opts === 'number') opts = { volumeScale: opts }
    opts = opts || {}

    const path = getSoundPath(soundId)
    if (!path) return   // 未配置 → 静默跳过（不刷日志）

    // 节流：同一音效过密时丢弃（同相位叠加会瞬时爆表）
    const gap = (opts.minGapMs != null) ? opts.minGapMs : DEFAULT_MIN_GAP_MS
    const now = this._now()
    if (gap > 0 && this._lastPlayAt[soundId] && (now - this._lastPlayAt[soundId]) < gap) return
    this._lastPlayAt[soundId] = now

    if (!this._hasWx()) {
      console.log(`[Audio] 播放SFX: ${soundId}`)
      return
    }

    const priority = (opts.priority != null) ? opts.priority : getPriority(soundId)
    const slot = this._acquireSlot(priority)
    if (!slot) return   // 并发已满且都比自己重要 → 本次丢弃

    const volScale = (opts.volumeScale != null) ? opts.volumeScale : 1.0
    // 音量也做轻微随机（±4%），进一步弱化"复读机"感
    const jitter = opts.pitch ? (1 + (Math.random() * 2 - 1) * 0.04) : 1
    slot.token = ++this._tokenSeq
    slot.id = soundId
    slot.priority = priority
    slot.playing = true
    slot.startAt = now

    try {
      slot.ctx.src = path
      slot.ctx.volume = Math.max(0, Math.min(1, this._sfxVolume * volScale * jitter))
      // 音高抖动：微信 InnerAudioContext 支持 playbackRate 0.5~2.0
      if (opts.pitch) {
        const amt = Math.max(0, Math.min(0.5, opts.pitch))
        const rate = 1 + (Math.random() * 2 - 1) * amt
        try { slot.ctx.playbackRate = Math.max(0.5, Math.min(2.0, rate)) } catch (e) {}
      } else {
        try { if (slot.ctx.playbackRate !== 1) slot.ctx.playbackRate = 1 } catch (e) {}
      }
      slot.ctx.play()
    } catch (e) {
      console.warn(`[Audio] SFX 异常: ${soundId}`, e)
      slot.playing = false
    }
  }

  /**
   * 播放音效（多变体随机，用于同一动作的音色轮换）
   * @param {string} soundId
   * @param {number} variantCount
   */
  playSFXVariant(soundId, variantCount = 3) {
    if (variantCount <= 1) { this.playSFX(soundId); return }
    const idx = Math.floor(Math.random() * variantCount) + 1
    const variantId = `${soundId}_${idx}`
    // 变体存在就用变体，否则回落原始 ID 并加音高抖动模拟变体
    if (hasSound(variantId)) this.playSFX(variantId)
    else this.playSFX(soundId, { pitch: 0.06 })
  }

  /**
   * 播放技能释放音效
   * @param {string} skillId - heroes.js 中的 skill.id
   * @param {string} skillType - skill.type（找不到 skillId 时按类型兜底）
   * @param {Object} opts
   */
  playSkillSFX(skillId, skillType, opts = {}) {
    const id = getSkillSFX(skillId, skillType)
    this.playSFX(id, Object.assign({ pitch: 0.03, minGapMs: 60 }, opts))
  }

  /**
   * 播放技能命中音效
   * @param {string} skillId
   * @param {Object} opts
   */
  playSkillHitSFX(skillId, opts = {}) {
    const id = getSkillHitSFX(skillId)
    this.playSFX(id, Object.assign({ pitch: 0.05 }, opts))
  }

  /**
   * 打击音（原 WebAudio 玩具合成 → 改为播放专业合成成品，保留同名接口）
   * 语义：
   *   crit=true            → hit_crit（重低频 + 金属爆响 + 宽声像）
   *   type='slash'（近战）  → monster_hit（肉感低通，怪物被砍中）
   *   type='magic'（法术）  → battle_hit（短脆通用命中）
   *   type='block'         → hit_block（金属对撞刮擦）
   * 每次带 ±6% 音高抖动，避免连击听起来完全一样。
   * @param {Object} opts - { type?: 'slash'|'magic'|'block', crit?: boolean, volumeScale?: number }
   */
  playHitSynth(opts = {}) {
    if (this._muted) return
    const crit = !!opts.crit
    let id
    if (crit) id = 'hit_crit'
    else if (opts.type === 'block') id = 'hit_block'
    else if (opts.type === 'magic') id = 'battle_hit'
    else id = 'monster_hit'

    if (getSoundPath(id)) {
      this.playSFX(id, {
        volumeScale: opts.volumeScale != null ? opts.volumeScale : 1.0,
        pitch: crit ? 0.03 : 0.06,
        minGapMs: crit ? 60 : 40
      })
      return
    }
    // 资源缺失时才回落到实时合成（保证任何情况下都有打击反馈）
    this._synthHitFallback(opts)
  }

  /**
   * 挥击破风声（保持实时合成）
   * 说明：生成的 attack_melee / battle_sword 素材都自带命中撞击层，
   * 若用它们做"起手挥击"会与随后的命中音双重撞击、听起来发虚。
   * 纯噪声扫频的破风声才是正确的起手音，因此这里刻意保留 WebAudio 合成。
   * @param {Object} opts - { volumeScale?: number }
   */
  playSwingSynth(opts = {}) {
    if (this._muted) return
    if (typeof wx === 'undefined' || !wx.createWebAudioContext) return
    try {
      if (!this._webaudio) this._webaudio = wx.createWebAudioContext()
      const actx = this._webaudio
      if (actx.state === 'suspended' && actx.resume) { try { actx.resume() } catch (e) {} }
      const now = actx.currentTime
      const vol = Math.max(0, Math.min(1, this._sfxVolume)) * (opts.volumeScale || 1) * 0.5
      if (vol <= 0) return
      const detune = 1 + (Math.random() * 0.2 - 0.1)
      const dur = 0.22 * detune
      // 白噪声缓冲（破风底噪）
      const buf = actx.createBuffer(1, Math.max(1, Math.ceil(actx.sampleRate * dur)), actx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1)
      const noise = actx.createBufferSource(); noise.buffer = buf
      // 带通扫频：500→1600→700Hz，模拟挥剑由慢到快再到收的破风
      const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9
      bp.frequency.setValueAtTime(500 * detune, now)
      bp.frequency.exponentialRampToValueAtTime(1600 * detune, now + dur * 0.5)
      bp.frequency.exponentialRampToValueAtTime(700 * detune, now + dur)
      const g = actx.createGain()
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(vol, now + 0.04)
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
      noise.connect(bp); bp.connect(g); g.connect(actx.destination)
      noise.start(now); noise.stop(now + dur)
    } catch (e) {
      console.warn('[Audio] playSwingSynth 失败:', e)
    }
  }

  /** 打击音的实时合成兜底（仅在音频资源缺失时使用） */
  _synthHitFallback(opts = {}) {
    if (typeof wx === 'undefined' || !wx.createWebAudioContext) return
    try {
      if (!this._webaudio) this._webaudio = wx.createWebAudioContext()
      const actx = this._webaudio
      if (actx.state === 'suspended' && actx.resume) { try { actx.resume() } catch (e) {} }
      const now = actx.currentTime
      const crit = !!opts.crit
      const detune = 1 + (Math.random() * 0.24 - 0.12)
      const vol = Math.max(0, Math.min(1, this._sfxVolume)) * (opts.volumeScale || 1)
      const master = actx.createGain()
      master.gain.value = vol
      master.connect(actx.destination)
      // 方波下扫（金属"铛"）
      const osc = actx.createOscillator()
      osc.type = 'square'
      const f0 = (crit ? 1500 : 1050) * detune
      osc.frequency.setValueAtTime(f0, now)
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.5, now + 0.09)
      const og = actx.createGain()
      og.gain.setValueAtTime(0.0001, now)
      og.gain.exponentialRampToValueAtTime(crit ? 0.8 : 0.6, now + 0.004)
      og.gain.exponentialRampToValueAtTime(0.0001, now + (crit ? 0.12 : 0.1))
      osc.connect(og); og.connect(master)
      osc.start(now); osc.stop(now + 0.14)
      // 高通刮擦噪声
      const sdur = crit ? 0.1 : 0.07
      const sbuf = actx.createBuffer(1, Math.max(1, Math.ceil(actx.sampleRate * sdur)), actx.sampleRate)
      const sd = sbuf.getChannelData(0)
      for (let i = 0; i < sd.length; i++) sd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / sd.length, 2)
      const snoise = actx.createBufferSource(); snoise.buffer = sbuf
      const sf = actx.createBiquadFilter(); sf.type = 'highpass'; sf.frequency.value = 2500 * detune
      const sg = actx.createGain()
      sg.gain.setValueAtTime(crit ? 0.5 : 0.35, now)
      sg.gain.exponentialRampToValueAtTime(0.0001, now + sdur)
      snoise.connect(sf); sf.connect(sg); sg.connect(master)
      snoise.start(now); snoise.stop(now + sdur)
    } catch (e) {
      console.warn('[Audio] _synthHitFallback 失败:', e)
    }
  }

  // ==========================================================
  // 音量 / 静音 / 生命周期
  // ==========================================================

  /** 设置 BGM 音量 0.0~1.0（立即作用于当前曲目） */
  setBGMVolume(v) {
    this._bgmVolume = Math.max(0, Math.min(1, v))
    if (this._bgm) {
      try { this._bgm.volume = this._bgmVolume } catch (e) {}
    }
  }

  /** 设置 SFX 音量 0.0~1.0（下一次播放生效） */
  setSFXVolume(v) {
    this._sfxVolume = Math.max(0, Math.min(1, v))
  }

  /**
   * 全局静音 / 取消静音。
   * 取消静音时：若当前无 BGM 但有"期望曲目"，自动补播（解决静音期间切场景后没声的问题）。
   */
  setMuted(muted) {
    const was = this._muted
    this._muted = !!muted
    if (this._muted) {
      this.pauseBGM()
      this._sfxPool.forEach(s => { try { s.ctx.stop() } catch (e) {}; s.playing = false })
      return
    }
    if (!was) return
    if (this._bgm) {
      this.resumeBGM()
    } else if (this._desiredBgmId) {
      const want = this._desiredBgmId
      this.playBGM(want)
      this._explicitBGM = false
    }
  }

  isMuted() {
    return this._muted
  }

  /** 暂停所有音频（切后台 / 弹窗） */
  pauseAll() {
    this.pauseBGM()
    this._sfxPool.forEach(s => { try { s.ctx.pause() } catch (e) {} })
  }

  /** 恢复所有音频（回到前台） */
  resumeAll() {
    if (this._muted) return
    this.resumeBGM()
    this._sfxPool.forEach(s => {
      if (s.playing) { try { s.ctx.play() } catch (e) {} }
    })
  }

  /** 销毁并释放所有资源 */
  destroy() {
    this._timers.forEach(t => { try { clearInterval(t) } catch (e) {} })
    this._timers.clear()
    this._fadingOut.forEach(c => {
      try { c.stop() } catch (e) {}
      try { c.destroy() } catch (e) {}
    })
    this._fadingOut = []
    this.stopBGM(true)
    this._sfxPool.forEach(s => {
      try { s.ctx.stop() } catch (e) {}
      try { s.ctx.destroy() } catch (e) {}
    })
    this._sfxPool = []
    this._lastPlayAt = {}
  }

  /** 调试：当前音频状态快照 */
  debugState() {
    return {
      bgmId: this._bgmId,
      desiredBgmId: this._desiredBgmId,
      scene: this._sceneName,
      muted: this._muted,
      bgmVolume: this._bgmVolume,
      sfxVolume: this._sfxVolume,
      voices: this._sfxPool.length,
      voicesActive: this._sfxPool.filter(s => s.playing).length,
      maxInstances: this._maxInstances,
      fadingOut: this._fadingOut.length
    }
  }

  // ==================== 单例 ====================

  static _instance = null

  static getInstance() {
    if (!AudioManager._instance) {
      AudioManager._instance = new AudioManager()
    }
    return AudioManager._instance
  }
}
