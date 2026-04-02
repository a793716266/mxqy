/**
 * data-manager.js - 存档/读档管理
 */

export class DataManager {
  constructor() {
    this.saveKey = 'meow_star_save'
    this.data = this._defaultData()
  }

  _defaultData() {
    return {
      playerName: '臻宝',
      level: 1,
      exp: 0,
      gold: 100,
      currentChapter: 1,
      currentNode: 'town_start',
      cats: [],           // 收集的猫咪
      party: [0],         // 出战角色索引
      inventory: [],      // 道具
      catsDiscovered: [], // 图鉴
      playTime: 0,
      flags: {}           // 剧情标记
    }
  }

  save() {
    this.data.playTime = (this.data.playTime || 0) + 1
    try {
      wx.setStorageSync(this.saveKey, JSON.stringify(this.data))
      console.log('[存档] 保存成功')
      return true
    } catch (e) {
      console.error('[存档] 保存失败:', e)
      return false
    }
  }

  load() {
    try {
      const raw = wx.getStorageSync(this.saveKey)
      if (raw) {
        this.data = JSON.parse(raw)
        console.log('[存档] 读档成功, 章节:', this.data.currentChapter)
        return true
      }
    } catch (e) {
      console.error('[存档] 读档失败:', e)
    }
    this.data = this._defaultData()
    return false
  }

  hasSave() {
    try {
      return !!wx.getStorageSync(this.saveKey)
    } catch (e) {
      return false
    }
  }

  get(key) {
    return this.data[key]
  }

  set(key, value) {
    this.data[key] = value
  }

  addFlag(key, value = true) {
    this.data.flags[key] = value
  }

  hasFlag(key) {
    return !!this.data.flags[key]
  }
}
