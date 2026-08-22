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
import { SettingsPanel } from './ui/settings-panel.js'
import { BackpackPanel } from './ui/backpack-panel.js'
import { computeDeltaTime } from './utils/time.js'

// 场景类型
export const SCENE = {
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

    // 管理器（统一使用单例模式）
    this.data = DataManager.getInstance()
    this.input = new InputManager(this.dpr)
    this.audio = AudioManager.getInstance()
    this.assets = new AssetManager()
    this.effects = new SkillEffectManager(this)
    this.settings = new SettingsPanel(this)  // 设置面板
    this.backpack = new BackpackPanel(this)  // 背包面板（全场景通用：装备/消耗品/金币）

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
    await this._loadSubpackage('sound')

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
    this.deltaTime = computeDeltaTime(now, this.lastTime)
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

    // 处理设置面板输入
    this._handleSettingsInput()
    this.settings.update(this.deltaTime)

    // ★ 处理背包（全局面板）：入口按钮 + 面板输入
    this._handleBackpackInput()
    this.backpack.update(this.deltaTime)

    // ★ 背包打开期间暂停场景 update（野外战斗中查看背包不会被怪物偷袭），渲染照常
    if (this.currentScene && !this.backpack.visible) {
      this.currentScene.update(this.deltaTime)
    }

    // 渲染
    try {
      this._render()
    } catch(e) {
      console.error(`[Game] 💥 _render 崩溃! scene=${this.currentScene?.constructor?.name}`, e)
    }

    requestAnimationFrame(() => this._loop())
  }

  // 处理设置面板输入
  _handleSettingsInput() {
    if (!this.settings.visible) return

    // 处理点击
    const tap = this.input.consumeTap()
    if (tap) {
      this.settings.handleTap(tap.x, tap.y)
    }

    // 处理拖动
    if (Object.keys(this.input.touches).length > 0) {
      for (const id in this.input.touches) {
        const t = this.input.touches[id]
        this.settings.handleDrag(t.x, t.y)
      }
    } else {
      this.settings.handleDragEnd()
    }
  }

  // ★ 处理背包输入：面板打开时消费全部点击；未打开时检测全局入口按钮（只消费命中按钮的那一次点击）
  _handleBackpackInput() {
    if (this.backpack.visible) {
      const tap = this.input.consumeTap()
      if (tap) {
        this.backpack.handleTap(tap.x, tap.y)
      }
      return
    }

    // 设置面板打开时不响应入口按钮（按钮被设置面板遮罩盖住，不应穿透点击）
    if (this.settings.visible || !this.input.taps || this.input.taps.length === 0) return

    // ★ 主菜单（开始界面）不显示背包按钮，避免与开始氛围不协调
    if (this.sceneName === SCENE.MAIN_MENU) return

    const tap = this.input.taps[0]
    const b = this._backpackBtnRect()
    if (tap.x >= b.x && tap.x <= b.x + b.w &&
        tap.y >= b.y && tap.y <= b.y + b.h) {
      this.input.taps.shift()   // 命中才消费，未命中留给场景处理
      if (this.audio && this.audio.playSFX) this.audio.playSFX('ui_popup')
      this.backpack.show()
    }
  }

  // 全局背包入口按钮区域（屏幕右侧中段偏下，按屏幕高度比例自适应；避开 field 顶部 70*dpr 黑栏与小地图 85~165*dpr 占位，也避开摇杆/召回按钮等左侧与底部 UI）
  _backpackBtnRect() {
    return {
      x: this.width - 60 * this.dpr,
      y: this.height * 0.55 - 25 * this.dpr,
      w: 50 * this.dpr,
      h: 50 * this.dpr
    }
  }

  // 渲染全局背包入口按钮（圆形皮质背包钮）
  _renderBackpackButton(ctx) {
    const b = this._backpackBtnRect()
    const d = this.dpr
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    const r = b.w / 2

    ctx.save()
    // 按钮底（皮革棕渐变）
    const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
    grad.addColorStop(0, '#c98a4b')
    grad.addColorStop(1, '#8b5a2b')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()

    // 描边 + 阴影感
    ctx.strokeStyle = 'rgba(255, 224, 178, 0.75)'
    ctx.lineWidth = 2 * d
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()

    ctx.font = `${22 * d}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🎒', cx, cy + 1 * d)
    ctx.restore()
  }

  _render() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)

    // 裁剪到canvas边界，防止内容溢出（某些设备安全区域导致右侧裁切）
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, this.width, this.height)
    ctx.clip()

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

    // 渲染全局背包入口按钮（场景之上，设置/背包面板之下；面板打开/无场景/主菜单时隐藏）
    if (!this.backpack.visible && !this.settings.visible && this.currentScene && this.sceneName !== SCENE.MAIN_MENU) {
      this._renderBackpackButton(ctx)
    }

    // 渲染设置面板（在最上层）
    this.settings.render(ctx)

    // 渲染背包面板（最顶层）
    this.backpack.render(ctx)

    ctx.restore()
  }
}
