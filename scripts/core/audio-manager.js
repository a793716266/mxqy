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
}
