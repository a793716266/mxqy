/**
 * Jest 全局 setup
 * 模拟微信小游戏全局 API（wx.*）
 */

// 模拟微信存储（mockStorage 必须挂到 global 上，供测试直接操作）
global.mockStorage = {}
global.wx = {
  setStorageSync: (key, value) => { global.mockStorage[key] = value },
  getStorageSync: (key) => global.mockStorage[key],
  removeStorageSync: (key) => { delete global.mockStorage[key] },
  onError: () => {},
  reportError: () => {},
  reportPerformance: () => {},
  createInnerAudioContext: () => ({}),
  updateManager: null,
}
