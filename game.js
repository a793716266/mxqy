/**
 * game.js - 喵星奇缘 游戏入口
 * 微信小游戏原生 Canvas 开发
 */

// 导入模块
import { Game } from './scripts/game.js'

// 获取 canvas
const canvas = wx.createCanvas()

// 创建游戏实例
const game = new Game(canvas)

// 启动游戏循环
game.start()

console.log('[喵星奇缘] 游戏启动完成')
