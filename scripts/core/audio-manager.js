/**
 * audio-manager.js - 音效管理器
 *
 * 使用方式：
 *   import { AudioManager } from './core/audio-manager.js'
 *   // 在 game.js 中: this.audio = new AudioManager()
 *   // 播放BGM: this.audio.playBGM('bgm_town')
 *   // 播放音效: this.audio.playSFX('ui_click')
 *   // 停止BGM: this.audio.stopBGM()
 *   // 暂停: this.audio.pauseAll()
 *   // 恢复: this.audio.resumeAll()
 */

import { SOUNDS, SOUND_CONFIG, hasSound, getSoundPath } from '../config/sound-config.js'

export class AudioManager {
  constructor() {
    this._bgm = null           // 当前BGM音频上下文
    this._bgmId = null        // 当前BGM的ID
    this._sfxPool = []        // 音效实例池（复用）
    this._muted = false       // 全局静音
    this._bgmVolume = SOUND_CONFIG.bgm.volume
    this._sfxVolume = SOUND_CONFIG.sfx.volume
  }

  // ==================== 私有方法 ====================

  // 获取或创建一个可用的SFX实例
  _acquireSFX() {
    // 找一个空闲的实例
    let sfx = this._sfxPool.find(s => !s._playing)
    if (!sfx) {
      if (typeof wx !== 'undefined' && wx.createInnerAudioContext) {
        sfx = wx.createInnerAudioContext()
        sfx._playing = false
        this._sfxPool.push(sfx)
      }
    }
    return sfx
  }

  // ==================== 公开方法 ====================

  /**
   * 播放背景音乐
   * @param {string} soundId - 音效配置中的ID，如 'bgm_town'
   * @param {boolean} forceRestart - 是否强制从头播放
   */
  playBGM(soundId, forceRestart = false) {
    if (this._muted) return
    const path = getSoundPath(soundId)
    if (!path) {
      console.log(`[Audio] BGM未配置: ${soundId}`)
      return
    }

    // 如果正在播放同一个BGM，不重复启动
    if (this._bgmId === soundId && !forceRestart && this._bgm && !this._bgm.paused) {
      return
    }

    // 停止之前的BGM
    this.stopBGM(true)

    // 创建新的BGM实例
    if (typeof wx !== 'undefined' && wx.createInnerAudioContext) {
      this._bgm = wx.createInnerAudioContext()
      this._bgm.src = path
      this._bgm.volume = this._bgmVolume
      this._bgm.loop = true
      this._bgm.play()
      this._bgmId = soundId
      console.log(`[Audio] 播放BGM: ${soundId} (${path})`)
    } else {
      console.log(`[Audio] 播放BGM: ${soundId} (path: ${path})`)
    }
  }

  /**
   * 停止背景音乐
   * @param {boolean} immediate - 是否立即停止（不带淡出）
   */
  stopBGM(immediate = false) {
    if (this._bgm) {
      try {
        this._bgm.stop()
        this._bgm.destroy()
      } catch (e) {}
      this._bgm = null
      this._bgmId = null
    }
  }

  /**
   * 暂停背景音乐
   */
  pauseBGM() {
    if (this._bgm) {
      try { this._bgm.pause() } catch (e) {}
    }
  }

  /**
   * 恢复背景音乐
   */
  resumeBGM() {
    if (this._bgm) {
      try { this._bgm.play() } catch (e) {}
    }
  }

  /**
   * 播放音效（SFX）
   * @param {string} soundId - 音效配置中的ID，如 'ui_click'
   * @param {number} volumeScale - 音量倍数（可选，默认1.0）
   */
  playSFX(soundId, volumeScale = 1.0) {
    if (this._muted) return
    const path = getSoundPath(soundId)
    if (!path) {
      // 已配置但文件为空，静默跳过
      return
    }

    if (typeof wx !== 'undefined' && wx.createInnerAudioContext) {
      const sfx = this._acquireSFX()
      if (!sfx) return

      try {
        sfx.src = path
        sfx.volume = Math.min(1.0, this._sfxVolume * volumeScale)
        sfx._playing = true
        sfx.play()

        // 播放结束后标记为空闲
        sfx.onEnded(() => {
          sfx._playing = false
        })
        sfx.onError((err) => {
          console.warn(`[Audio] SFX播放失败: ${soundId}`, err)
          sfx._playing = false
        })
      } catch (e) {
        console.warn(`[Audio] SFX异常: ${soundId}`, e)
        sfx._playing = false
      }
    } else {
      console.log(`[Audio] 播放SFX: ${soundId} (${path})`)
    }
  }

  /**
   * 播放音效（支持多变体随机）
   * @param {string} soundId - 音效ID
   * @param {number} variantCount - 变体数量，如3表示会随机播放 _1/_2/_3 后缀
   */
  playSFXVariant(soundId, variantCount = 3) {
    if (variantCount <= 1) {
      this.playSFX(soundId)
      return
    }
    const idx = Math.floor(Math.random() * variantCount) + 1
    const variantId = `${soundId}_${idx}`
    if (hasSound(variantId)) {
      this.playSFX(variantId)
    } else {
      // 找不到变体就用原始ID
      this.playSFX(soundId)
    }
  }

  /**
   * 合成打击音（WebAudio 实时合成，无需音频文件）
   * 按武器类型区分音色，并每次随机微调音高/噪声，避免"单一机械感"：
   *  - type='slash'（剑击，臻宝近战）：明亮金属"铛~" + 高频刮擦噪声，贴合刀剑劈砍
   *  - type='magic'（魔法，李小宝远程）：能量"啾~"上扫 + 柔光噪声尾，金属感低
   * 暴击(crit)更亮、更短促、音量更大。复用单个 WebAudioContext，自动降级。
   * @param {Object} opts - { type?: 'slash'|'magic', crit?: boolean, volumeScale?: number }
   */
  playHitSynth(opts = {}) {
    if (this._muted) return
    if (typeof wx === 'undefined' || !wx.createWebAudioContext) {
      // 非微信环境（Node 模拟/浏览器）静默跳过
      return
    }
    try {
      if (!this._webaudio) {
        this._webaudio = wx.createWebAudioContext()
      }
      const actx = this._webaudio
      // 微信 WebAudioContext 可能初始为 suspended（需用户手势恢复）
      if (actx.state === 'suspended' && actx.resume) {
        try { actx.resume() } catch (e) {}
      }
      const now = actx.currentTime
      const type = (opts.type === 'magic') ? 'magic' : 'slash'
      const crit = !!opts.crit
      // ★ 随机微调（±12% 音高抖动），消除"每下都一样"的单调感
      const detune = 1 + (Math.random() * 0.24 - 0.12)
      const vol = Math.max(0, Math.min(1, this._sfxVolume)) * (opts.volumeScale || 1)
      const master = actx.createGain()
      master.gain.value = vol
      master.connect(actx.destination)

      if (type === 'magic') {
        // 魔法能量命中：锯齿波快速上扫(啾~) + 柔光噪声尾
        const osc = actx.createOscillator()
        osc.type = 'sawtooth'
        const f0 = (crit ? 760 : 560) * detune
        osc.frequency.setValueAtTime(f0, now)
        osc.frequency.exponentialRampToValueAtTime(f0 * 0.45, now + (crit ? 0.22 : 0.18))
        const lp = actx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = crit ? 2600 : 1800
        const og = actx.createGain()
        og.gain.setValueAtTime(0.0001, now)
        og.gain.exponentialRampToValueAtTime(crit ? 0.9 : 0.7, now + 0.012)
        og.gain.exponentialRampToValueAtTime(0.0001, now + (crit ? 0.26 : 0.2))
        osc.connect(lp); lp.connect(og); og.connect(master)
        osc.start(now); osc.stop(now + 0.3)
        // 能量"嘶"噪声层（带通）
        const ndur = 0.12
        const nbuf = actx.createBuffer(1, Math.max(1, Math.ceil(actx.sampleRate * ndur)), actx.sampleRate)
        const nd = nbuf.getChannelData(0)
        for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nd.length, 1.5)
        const noise = actx.createBufferSource(); noise.buffer = nbuf
        const nf = actx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800 * detune; nf.Q.value = 0.8
        const ng = actx.createGain(); ng.gain.setValueAtTime(crit ? 0.35 : 0.22, now); ng.gain.exponentialRampToValueAtTime(0.0001, now + ndur)
        noise.connect(nf); nf.connect(ng); ng.connect(master)
        noise.start(now); noise.stop(now + ndur)
      } else {
        // 'slash' 剑击：明亮金属"铛~"（方波下扫）+ 剑刃共鸣泛音（三角波）+ 高频刮擦噪声
        // 1) 金属主音：方波高频快速下扫，带"铛"的实体金属感
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
        // 2) 剑刃共鸣泛音：三角波更高频短促，增强金属亮感
        const osc2 = actx.createOscillator()
        osc2.type = 'triangle'
        const f1 = (crit ? 2400 : 1700) * detune
        osc2.frequency.setValueAtTime(f1, now)
        osc2.frequency.exponentialRampToValueAtTime(f1 * 0.7, now + 0.06)
        const og2 = actx.createGain()
        og2.gain.setValueAtTime(0.0001, now)
        og2.gain.exponentialRampToValueAtTime(crit ? 0.4 : 0.3, now + 0.003)
        og2.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
        osc2.connect(og2); og2.connect(master)
        osc2.start(now); osc2.stop(now + 0.09)
        // 3) 刮擦噪声（剑刃划过）：高通短噪
        const sdur = crit ? 0.1 : 0.07
        const sbuf = actx.createBuffer(1, Math.max(1, Math.ceil(actx.sampleRate * sdur)), actx.sampleRate)
        const sd = sbuf.getChannelData(0)
        for (let i = 0; i < sd.length; i++) sd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / sd.length, 2)
        const snoise = actx.createBufferSource(); snoise.buffer = sbuf
        const sf = actx.createBiquadFilter(); sf.type = 'highpass'; sf.frequency.value = 2500 * detune
        const sg = actx.createGain(); sg.gain.setValueAtTime(crit ? 0.5 : 0.35, now); sg.gain.exponentialRampToValueAtTime(0.0001, now + sdur)
        snoise.connect(sf); sf.connect(sg); sg.connect(master)
        snoise.start(now); snoise.stop(now + sdur)
      }
    } catch (e) {
      // 合成失败不应影响游戏（如低端机不支持 WebAudio）
      console.warn('[Audio] playHitSynth 失败:', e)
    }
  }

  /**
   * 合成挥击声（WebAudio 实时合成，无需音频文件）
   * 近战（剑）起手挥砍时播放：带通噪声随扫频上移再回落 → "呼~" 破风声。
   * 复用 playHitSynth 的 WebAudioContext，自动降级（无 wx/静音时 no-op）。
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

  /**
   * 设置BGM音量
   * @param {number} v - 0.0 ~ 1.0
   */
  setBGMVolume(v) {
    this._bgmVolume = Math.max(0, Math.min(1, v))
    if (this._bgm) {
      try { this._bgm.volume = this._bgmVolume } catch (e) {}
    }
  }

  /**
   * 设置SFX音量
   * @param {number} v - 0.0 ~ 1.0
   */
  setSFXVolume(v) {
    this._sfxVolume = Math.max(0, Math.min(1, v))
  }

  /**
   * 全局静音/取消静音
   * @param {boolean} muted
   */
  setMuted(muted) {
    this._muted = muted
    if (muted) {
      this.pauseBGM()
    } else {
      this.resumeBGM()
    }
  }

  /**
   * 暂停所有音频
   */
  pauseAll() {
    this.pauseBGM()
    this._sfxPool.forEach(s => {
      try { s.pause() } catch (e) {}
    })
  }

  /**
   * 恢复所有音频
   */
  resumeAll() {
    this.resumeBGM()
    this._sfxPool.forEach(s => {
      if (s._playing) {
        try { s.play() } catch (e) {}
      }
    })
  }

  /**
   * 销毁，释放所有资源
   */
  destroy() {
    this.stopBGM()
    this._sfxPool.forEach(s => {
      try { s.destroy() } catch (e) {}
    })
    this._sfxPool = []
  }

  // ==================== 单例模式 ====================
  
  // 静态属性：保存唯一实例
  static _instance = null
  
  /**
   * 获取单例实例
   * @returns {AudioManager} 全局唯一的 AudioManager 实例
   */
  static getInstance() {
    if (!AudioManager._instance) {
      AudioManager._instance = new AudioManager()
    }
    return AudioManager._instance
  }
}
