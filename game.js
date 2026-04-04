/**
 * game.js - 喵星奇缘 游戏入口
 * 微信小游戏原生 Canvas 开发
 */

// 导入模块
import { Game } from './scripts/game.js'
import { setupErrorHandler } from './scripts/utils/error-handler.js'

// 初始化错误处理器
setupErrorHandler()

// 获取 canvas
const canvas = wx.createCanvas()

// 创建游戏实例
const game = new Game(canvas)

// 启动游戏循环
game.start()

console.log('[喵星奇缘] 游戏启动完成')

// 提供全局方法清除存档（用于测试）
if (typeof wx !== 'undefined') {
  wx.clearSaveData = () => {
    console.log('[ClearSave] 清除所有存档数据...')
    game.data.clear()
    console.log('[ClearSave] 存档已清除！')
    console.log('[ClearSave] 请重新编译游戏以生效')
  }
  
  wx.showSaveData = () => {
    console.log('[SaveData] 当前存档：')
    console.log('  金币:', game.data.get('gold'))
    const chars = game.data.get('characterStates')
    if (chars && chars.characters) {
      for (const char of chars.characters) {
        console.log(`  角色 ${char.id}: Lv.${char.level}, EXP:${char.exp}/${game.data.get('characterStates')?.characters?.find(c => c.id === char.id)?.maxExp || '?'}`)
      }
    }
  }
  
  console.log('[提示] 输入 wx.clearSaveData() 清除存档')
  console.log('[提示] 输入 wx.showSaveData() 查看存档')
}
