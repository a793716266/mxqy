/**
 * game.js - 游戏主循环和场景管理
 */

import { MainMenuScene } from './scenes/main-menu.js'
import { TownScene } from './scenes/town-scene.js'
import { FieldScene } from './scenes/field-scene.js'
import { BattleScene } from './scenes/battle-scene.js'
import { CollectionScene } from './scenes/collection-scene.js'
import { TowerScene } from './scenes/tower/tower-scene.js'
import { DataManager } from './core/data-manager.js'
import { InputManager } from './core/input-manager.js'
import { AudioManager } from './core/audio-manager.js'
import { AssetManager, ASSETS } from './core/asset-manager.js'
import { SkillEffectManager } from './core/skill-effect-manager.js'

// 场景类型
const SCENE = {
  MAIN_MENU: 'main-menu',
  TOWN: 'town',
  FIELD: 'field',
  BATTLE: 'battle',
  COLLECTION: 'collection',
  TOWER: 'tower'
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.width = canvas.width
    this.height = canvas.height
    this.dpr = wx.getSystemInfoSync().pixelRatio

    // 适配屏幕
    this._resize()

    // 当前场景
    this.currentScene = null
    this.sceneName = ''

    // 帧率控制
    this.lastTime = 0
    this.deltaTime = 0
    this.fps = 60
    this._frameCount = 0
    this._fpsTime = 0

    // 管理器
    this.data = new DataManager()
    this.input = new InputManager(this.dpr)
    this.audio = new AudioManager()
    this.assets = new AssetManager()
    this.effects = new SkillEffectManager(this)

    // 场景切换动画
    this._fadeAlpha = 0
    this._fading = false
    this._fadeCallback = null

    // 监听窗口大小变化
    wx.onWindowResize(() => this._resize())
  }

  _resize() {
    const info = wx.getSystemInfoSync()
    this.width = info.windowWidth * this.dpr
    this.height = info.windowHeight * this.dpr
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.screenWidth = info.windowWidth
    this.screenHeight = info.windowHeight
  }

  async start() {
    // 显示加载界面
    this._showLoading()
    
    // 加载存档
    this.data.load()

    // 先加载分包，再加载资源（分包资源路径在ASSETS中引用）
    console.log('[Game] 加载分包...')
    await this._loadSubpackage('battle')

    // 加载资源
    console.log('[Game] 开始加载资源...')
    await this.assets.loadAll(ASSETS)
    console.log('[Game] 资源加载完成')

    // 显示主菜单
    this.changeScene(SCENE.MAIN_MENU)

    // 启动游戏循环
    this.lastTime = Date.now()
    this._loop()
  }
  
  _showLoading() {
    // 简单的加载提示
    const ctx = this.ctx
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.font = `bold ${24 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('加载中...', this.width / 2, this.height / 2)
  }

  changeScene(sceneName, data) {
    this.sceneName = sceneName

    // 淡出 → 切换 → 淡入
    this._fadeTo(async () => {
      switch (sceneName) {
        case SCENE.MAIN_MENU:
          this.currentScene = new MainMenuScene(this)
          break
        case SCENE.TOWN:
          this.currentScene = new TownScene(this)
          break
        case SCENE.FIELD:
          this.currentScene = new FieldScene(this, data)
          break
        case SCENE.BATTLE:
          this.currentScene = new BattleScene(this, data)
          break
        case SCENE.COLLECTION:
          this.currentScene = new CollectionScene(this)
          break
        case SCENE.TOWER:
          this.currentScene = new TowerScene(this)
          break
      }

      if (this.currentScene) {
        this.currentScene.init()
      }
    })
  }

  /**
   * 加载分包
   */
  _loadSubpackage(name) {
    return new Promise((resolve) => {
      const task = wx.loadSubpackage({
        name: name,
        success: () => {
          console.log(`[Game] 分包 ${name} 加载完成`)
          resolve()
        },
        fail: (err) => {
          console.error(`[Game] 分包 ${name} 加载失败:`, err)
          resolve() // 失败也继续
        }
      })
      if (task && task.onProgressUpdate) {
        task.onProgressUpdate((res) => {
          console.log(`[Game] 分包 ${name} 加载进度: ${res.progress}%`)
        })
      }
    })
  }

  _fadeTo(callback) {
    this._fading = true
    this._fadeAlpha = 0
    this._fadeCallback = callback
    this._fadeIn = false
  }

  _updateFade() {
    if (!this._fading) return

    if (!this._fadeIn) {
      this._fadeAlpha += 0.05
      if (this._fadeAlpha >= 1) {
        this._fadeAlpha = 1
        this._fadeIn = true
        if (this._fadeCallback) {
          this._fadeCallback()
          this._fadeCallback = null
        }
      }
    } else {
      this._fadeAlpha -= 0.05
      if (this._fadeAlpha <= 0) {
        this._fadeAlpha = 0
        this._fading = false
      }
    }
  }

  _loop() {
    const now = Date.now()
    this.deltaTime = (now - this.lastTime) / 1000
    this.lastTime = now

    // FPS 计算
    this._frameCount++
    this._fpsTime += this.deltaTime
    if (this._fpsTime >= 1) {
      this.fps = this._frameCount
      this._frameCount = 0
      this._fpsTime = 0
    }

    // 更新
    this._updateFade()
    this.input.update()
    this.effects.update(this.deltaTime * 1000) // 更新特效（毫秒）

    if (this.currentScene) {
      this.currentScene.update(this.deltaTime)
    }

    // 渲染
    this._render()

    requestAnimationFrame(() => this._loop())
  }

  _render() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)

    // 渲染场景
    if (this.currentScene) {
      this.currentScene.render(ctx)
    }

    // 渲染特效（在场景上层）
    this.effects.render(ctx)

    // 渲染淡入淡出
    if (this._fadeAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${this._fadeAlpha})`
      ctx.fillRect(0, 0, this.width, this.height)
    }
  }
}
