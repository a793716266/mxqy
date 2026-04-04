/**
 * clear-save.js - 清除存档工具
 * 用于测试或重新开始游戏
 */

export function clearAllSaveData(game) {
  console.log('[ClearSave] 清除所有存档数据...')
  
  // 清除所有存档数据
  game.data.clear()
  
  console.log('[ClearSave] 存档已清除，请重新开始游戏')
  
  // 重新加载页面
  if (typeof window !== 'undefined') {
    window.location.reload()
  }
}

export function showSaveData(game) {
  console.log('[SaveData] 当前存档数据：')
  
  const keys = [
    'gold',
    'characterStates',
    'fieldMonsters',
    'playerX',
    'playerY'
  ]
  
  for (const key of keys) {
    const value = game.data.get(key)
    if (value !== undefined && value !== null) {
      console.log(`  ${key}:`, value)
    }
  }
}
