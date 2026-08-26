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
// ★ 集中式持久化：把运行时角色/装备状态在存档前快照回 this.data
//   （避免 town/field 各自散点回写导致进度丢失）
import { charStateManager } from './data/character-state.js'
import { equipmentManager } from './managers/equipment-manager.js'

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

    // ★ 切后台/关闭小程序时兜底存档：把运行时角色/装备状态快照后落盘，
    //   避免玩家直接关掉小程序（不经场景切换）导致进度丢失。
    wx.onHide(() => this._autoSave())
    if (typeof wx.onUnload === 'function') {
      wx.onUnload(() => this._autoSave())
    }
  }

  /**
   * 把运行时角色/装备状态快照回 this.data（集中式持久化的核心）
   * 必须在 data.save() 之前调用，保证任何场景（town/field）的进度都进存档。
   * 用 _initialized 守卫，避免管理器尚未初始化时把空状态覆盖掉存档。
   */
  _syncRuntimeState() {
    try {
      if (charStateManager && charStateManager._initialized) {
        this.data.set('characterStates', charStateManager.serialize())
      }
      if (equipmentManager && equipmentManager._initialized) {
        this.data.set('equipmentData', equipmentManager.serialize())
      }
    } catch (e) {
      console.error('[存档] 同步运行时状态失败:', e)
    }
  }

  /**
   * 兜底存档（切后台/关闭时调用）：先快照运行时状态再落盘
   */
  _autoSave() {
    this._syncRuntimeState()
    this.data.save()
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

      // ★ 自动存档：每次切换场景后，记录当前位置并落盘
      //   这样重载游戏后能精确恢复到上次所在场景与位置
      this._recordLocation(sceneName, data)
      // ★ 集中式快照：把运行时角色/装备状态同步回 this.data，再落盘
      //   （解决 town 场景从不回写、进度丢失的问题）
      this._syncRuntimeState()
      this.data.save()
    })
  }

  /**
   * 把"当前所在位置"写入存档，供「继续游戏」精确恢复
   * sceneName: 'town' | 'field' | 'map' | 'battle' | 'collection' | 'tower'
   * data: changeScene 传入的附加参数（含 nodeId / area / controlledHeroId 等）
   */
  _recordLocation(sceneName, data) {
    // ★ 关键：主菜单是场景中转站，不是游戏内位置。
    //   如果在这里记录 currentLocation，会导致"继续游戏"读到的 scene=main-menu
    //   → 又跳回主菜单 → 死循环（表现为"继续游戏点了没用"）。
    //   所以进主菜单时【保留】上次真实位置，不覆盖。
    if (sceneName === 'main-menu') {
      const existing = this.data.get('progression.currentLocation')
      if (existing && existing.scene && existing.scene !== 'main-menu') {
        return  // 保留现有真实位置，不写盘
      }
      // 极端情况：存档里本就是 main-menu（从未进过游戏内场景），则什么都不记
      return
    }

    const loc = { scene: sceneName, nodeId: null, area: null, controlledHeroId: null }
    if (data && typeof data === 'object') {
      if (data.nodeId !== undefined) loc.nodeId = data.nodeId
      if (data.area !== undefined) loc.area = data.area
      if (data.controlledHeroId !== undefined) loc.controlledHeroId = data.controlledHeroId
    }
    // battle/field 是从 map 进入的，继续游戏时不应卡在战斗/野外中间态，
    // 而是恢复到其来源（map 的 nodeId 或 town）。这里做归一化：
    if (sceneName === 'battle') {
      // 战斗来源通常是 map 的 nodeId（通过 battle-input 传入 nodeId）
      loc.scene = 'map'
      // nodeId 已在上面从 data.nodeId 取
    } else if (sceneName === 'field') {
      // field 来自 town 的副本入口，继续游戏恢复时回到 town 更安全
      loc.scene = 'town'
      loc.area = null
      loc.nodeId = null
    }
    this.data.set('progression.currentLocation', loc)
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

    // ★ 场景内全屏模态打开时，背包按钮已被隐藏（_render 中），此处的 tap 一并让出
    //   否则被覆盖在模态下的点击会穿透到下方的浮按钮，意外唤起背包
    if (this._sceneHasBlockingModal()) return

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
    const d = this.dpr
    const w = 88 * d
    const h = 38 * d
    // 胶囊：屏幕右侧中段偏下；右边距 20*d（避开设备圆角/刘海安全区）
    return {
      x: this.width - 20 * d - w,
      y: this.height * 0.55 - h / 2,
      w,
      h
    }
  }

  // 渲染全局背包入口按钮（胶囊：🎒 图标 + "背包"文字，皮革棕底）
  _renderBackpackButton(ctx) {
    const b = this._backpackBtnRect()
    const d = this.dpr
    const cy = b.y + b.h / 2
    const r = b.h / 2
    ctx.save()
    // 圆角矩形底（皮革棕渐变）
    const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
    grad.addColorStop(0, '#c98a4b')
    grad.addColorStop(1, '#8b5a2b')
    ctx.beginPath()
    ctx.moveTo(b.x + r, b.y)
    ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r)
    ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r)
    ctx.arcTo(b.x, b.y + b.h, b.x, b.y, r)
    ctx.arcTo(b.x, b.y, b.x + b.w, b.y, r)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // 描边 + 高光感
    ctx.strokeStyle = 'rgba(255, 224, 178, 0.75)'
    ctx.lineWidth = 2 * d
    ctx.stroke()

    // 左：🎒 图标
    ctx.font = `${20 * d}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🎒', b.x + 20 * d, cy + 1 * d)

    // 右：“背包”文字（白字，便于辨识）
    ctx.font = `bold ${16 * d}px sans-serif`
    ctx.textAlign = 'left'
    ctx.fillStyle = '#fff7ec'
    ctx.fillText('背包', b.x + 36 * d, cy + 1 * d)
    ctx.restore()
  }

  // 当前场景是否处于「全屏模态」状态（即玩家正专注于某个面板/对话框，按钮不应再出现或响应）
  // 注意：每加一种新的全屏模态，都必须在这里登记，否则会被全局背包按钮穿模盖住
  _sceneHasBlockingModal() {
    const s = this.currentScene
    if (!s) return false
    // 城镇：探索区域菜单、装备面板、角色详情面板、城镇对话模态
    if (s.exploreMenu) return true
    if (s.equipmentPanel && s.equipmentPanel.active) return true
    if (s.charInfoPanel && s.charInfoPanel.visible) return true
    // 战斗：角色详情面板（town/field 共用同一个组件）
    // ★ dungeonIntroDialogue / clearedDialogue 由 field-scene 维护（Boss 战前后独白）
    if (s.dungeonIntroDialogue) return true
    if (s.clearedDialogue || s.dungeonClearedDialogue) return true
    return false
  }

  // 是否处于开发模式（WeChat DevTools 编译预览时 platform === 'devtools'；真机生产永远为 false）
  // 仅用于开关开发专用 UI（如探索区域内的"测试：解锁所有副本"按钮）
  get isDev() {
    try {
      return (typeof wx !== 'undefined' &&
              typeof wx.getSystemInfoSync === 'function' &&
              wx.getSystemInfoSync().platform === 'devtools')
    } catch (_) {
      return false
    }
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

    // 渲染全局背包入口按钮（场景之上，设置/背包面板之下；任何场景内全屏模态打开时一并隐藏）
    // ⚠️ 这里的「场景内模态」必须比照所有会让玩家误操作背包按钮的全屏覆盖层；新增模态时请同步更新 _sceneHasBlockingModal
    if (
      !this.backpack.visible &&
      !this.settings.visible &&
      !this._sceneHasBlockingModal() &&
      this.currentScene &&
      this.sceneName !== SCENE.MAIN_MENU
    ) {
      this._renderBackpackButton(ctx)
    }

    // 渲染设置面板（在最上层）
    this.settings.render(ctx)

    // 渲染背包面板（最顶层）
    this.backpack.render(ctx)

    ctx.restore()
  }
}
