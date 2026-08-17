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
   * 用于战斗命中反馈：低频"咚" + 短噪声爆，暴击更亮更短促。
   * 复用单个 WebAudioContext（懒创建），自动降级（无 wx/静音时 no-op）。
   * @param {Object} opts - { crit?: boolean, volumeScale?: number }
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
      const master = actx.createGain()
      master.gain.value = Math.max(0, Math.min(1, this._sfxVolume)) * (opts.volumeScale || 1)
      master.connect(actx.destination)

      // 1)  tonal thump：三角/方波快速下扫，营造"砸中"的实体感
      const osc = actx.createOscillator()
      osc.type = opts.crit ? 'square' : 'triangle'
      const f0 = opts.crit ? 340 : 200
      osc.frequency.setValueAtTime(f0, now)
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.12)
      const og = actx.createGain()
      og.gain.setValueAtTime(0.0001, now)
      og.gain.exponentialRampToValueAtTime(1, now + 0.005)
      og.gain.exponentialRampToValueAtTime(0.0001, now + (opts.crit ? 0.16 : 0.13))
      osc.connect(og); og.connect(master)
      osc.start(now); osc.stop(now + 0.18)

      // 2)  噪声爆（attack 质感）：极短白噪声经低通，模拟击打瞬态
      const dur = 0.06
      const buf = actx.createBuffer(1, Math.max(1, Math.ceil(actx.sampleRate * dur)), actx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2)
      }
      const noise = actx.createBufferSource()
      noise.buffer = buf
      const ng = actx.createGain()
      ng.gain.setValueAtTime(opts.crit ? 0.6 : 0.4, now)
      ng.gain.exponentialRampToValueAtTime(0.0001, now + dur)
      noise.connect(ng); ng.connect(master)
      noise.start(now); noise.stop(now + dur)
    } catch (e) {
      // 合成失败不应影响游戏（如低端机不支持 WebAudio）
      console.warn('[Audio] playHitSynth 失败:', e)
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
