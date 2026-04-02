/**
 * audio-manager.js - 音效管理（简化版，无实际音频文件时静默）
 */

export class AudioManager {
  constructor() {
    this.bgm = null
    this._ctx = null
    try {
      this._ctx = wx.createInnerAudioContext()
    } catch (e) {
      // 静默处理
    }
  }

  playBGM(name) {
    // 后续添加音频文件后启用
    console.log('[Audio] 播放BGM:', name)
  }

  playSFX(name) {
    // 后续添加音频文件后启用
    console.log('[Audio] 播放音效:', name)
  }

  stopBGM() {
    // 后续启用
  }
}
