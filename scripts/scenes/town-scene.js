/**
 * town-scene.js - 村庄探索场景（使用程序化地图 + 碰撞检测）
 * 
 * 重构说明：
 * - 不再使用 village.jpeg 作为背景
 * - 改用 town-map-data.js 定义的地图对象程序化渲染
 * - 所有建筑物、树木、石块等都有碰撞体积
 * - 道路、花朵、草堆等装饰物无碰撞
 * - 移动系统集成碰撞检测
 */

import { charStateManager } from '../data/character-state.js'
import { HEROES } from '../data/heroes.js'
import { FieldMovement } from '../utils/field-movement.js'
import { equipmentManager } from '../managers/equipment-manager.js'
import { EquipmentPanel } from '../ui/equipment-panel.js'
import { EnhancePanel } from '../ui/enhance-panel.js'
import { CharacterInfoPanel } from '../ui/character-info-panel.js'
import { Renderer2D5 } from '../engine/renderer-2.5d.js'
import {
  TOWN_MAP_CONFIG,
  TOWN_MAP_OBJECTS,
  TOWN_NPC_POSITIONS,
  TOWN_SPAWN_POINT,
  MAP_OBJ_TYPE,
  TOWN_ROAD_ZONES,
  generateTownCollisions
} from '../data/town-map-data.js'

export class TownScene {
  constructor(game, data) {
    this.game = game
    this.game.audio.playBGM('bgm_town')
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0
    
    // 地图尺寸
    const mapWidth = (TOWN_MAP_CONFIG?.width || 2000) * this.dpr
    const mapHeight = (TOWN_MAP_CONFIG?.height || 1200) * this.dpr
    
    // 初始化移动系统（防御性检查 TOWN_SPAWN_POINT）
    const spawnX = (TOWN_SPAWN_POINT?.x || 985) * this.dpr
    const spawnY = (TOWN_SPAWN_POINT?.y || 700) * this.dpr
    this.movement = new FieldMovement(game, {
      mapWidth: mapWidth,
      mapHeight: mapHeight,
      playerX: spawnX,
      playerY: spawnY
    })
    
    // 加载碰撞数据
    this.obstacles = generateTownCollisions()
    console.log(`[Town] 加载了 ${this.obstacles.length} 个碰撞障碍物`)
    
    // 初始化角色状态
    const savedCharData = this.game.data.get('characterStates')
    charStateManager.init(savedCharData)
    
    // 初始化装备管理器
    const savedEquipData = this.game.data.get('equipmentData')
    equipmentManager.init(savedEquipData)
    
    // 初始化队伍
    this.party = charStateManager.getAllCharacters()

    // ★ 从野外战斗失败返回：复活全队（保持死亡状态回城，到城镇后再复活）
    //   复活后仅恢复 10% HP/MP（死亡代价）
    if (this.game.data.get('needReviveOnTown')) {
      for (const char of this.party) {
        if (char) {
          char.hp = Math.max(1, Math.floor(char.maxHp * 0.1))
          char.mp = Math.max(0, Math.floor(char.maxMp * 0.1))
        }
      }
      this.game.data.delete('needReviveOnTown')
      console.log('[Town] 战斗失败返回，全队以10%血量复活')
    }
    
    // 装备面板
    this.equipmentPanel = new EquipmentPanel(game, this.party[0])
    this.enhancePanel = new EnhancePanel(game)

    // 角色信息面板（队伍状态条点击成员 → 打开详情）
    this.charInfoPanel = new CharacterInfoPanel(game, this.party[0])
    // 队伍状态条成员热区（render 时填充，update 点击检测用）
    this._partyBarBounds = []
    // 角色详情面板 bounds（renderDetailPanel 返回，关闭/卸下点击用）
    this._charInfoBounds = null
    // ★ 展开迷你卡热区（点击队伍卡后滑出，点击空白/再点同卡收起）
    this._partyExpandBounds = null
    this._expandedHeroId = null
    // ★ 控制者（被金边高亮 / 经验展示对象 / 进副本主操控角色）：
    //   优先读持久化值（跨场景/重进 town 记忆），兜底取首个已解锁角色；并挂到 game 供进入副本复用
    this.controlledHeroId = (this.game && this.game.data && this.game.data.get('controlledHeroId'))
      || (this.party[0] && this.party[0].id) || 'zhenbao'
    if (this.game) {
      this.game.controlledHeroId = this.controlledHeroId
      if (this.game.data) this.game.data.set('controlledHeroId', this.controlledHeroId)
    }
    
    // 探索菜单
    this.exploreMenu = null
    
    // 测试日志
    this.testLogs = []

    // 调试坐标显示（用于调整资源位置）。默认关闭：生产包不再渲染该浮层。
    this._debugCoordsEnabled = false
    this._debugCoords = { x: 0, y: 0, show: false, tapWorldX: 0, tapWorldY: 0 }
    
    // NPC列表（使用新位置）
    this.npcs = this._initNPCs(mapWidth, mapHeight)
    
    // 对话框
    this.dialogue = null
    this.dialogueQueue = []
    this.nearbyNPC = null
    this.currentDialogueNPC = null
    
    // 初始对话
    this.introShown = this.game.data.get('introShown')

    // ── 2.5D 引擎（所有地图场景共用）─
    this._renderer2d5 = new Renderer2D5({ dpr: this.dpr, width: this.width, height: this.height })
    this._renderer2d5.setAssets(this.game.assets)
  }
  
  _initNPCs(mapWidth, mapHeight) {
    const dpr = this.dpr
    return [
      {
        id: 'village_chief',
        name: '村长',
        x: TOWN_NPC_POSITIONS.village_chief.x * dpr,
        y: TOWN_NPC_POSITIONS.village_chief.y * dpr,
        sprite: '👴',
        color: '#ffd700',
        dialogues: [
          { text: '欢迎来到喵星村！' },
          { text: '你是被选中的人类勇士，将带领猫咪们对抗暗影势力。' },
          { text: '小心别撞到树木和建筑哦，那些都是实心的！' }
        ],
        interactionRadius: 60 * dpr
      },
      {
        id: 'shop_keeper',
        name: '商店老板',
        x: TOWN_NPC_POSITIONS.shop_keeper.x * dpr,
        y: TOWN_NPC_POSITIONS.shop_keeper.y * dpr,
        sprite: '🏪',
        color: '#54a0ff',
        dialogues: [
          { text: '欢迎光临喵星商店！这里有各种道具和装备。' },
          { text: '（商店功能开发中...）' }
        ],
        interactionRadius: 60 * dpr
      },
      {
        id: 'blacksmith',
        name: '铁匠',
        x: TOWN_NPC_POSITIONS.blacksmith.x * dpr,
        y: TOWN_NPC_POSITIONS.blacksmith.y * dpr,
        sprite: '⚒️',
        color: '#e67e22',
        dialogues: [
          { text: '需要管理装备吗？我可以帮你整理装备。' },
          { action: 'open_equipment' }
        ],
        interactionRadius: 60 * dpr
      },
      {
        id: 'quest_giver',
        name: '冒险者公会',
        x: TOWN_NPC_POSITIONS.quest_giver.x * dpr,
        y: TOWN_NPC_POSITIONS.quest_giver.y * dpr,
        sprite: '📜',
        color: '#ff9f43',
        dialogues: [
          { text: '这里是冒险者公会，可以接取任务。' },
          { text: '要探索野外吗？我可以为你指引方向。' },
          { action: 'open_explore_menu' }
        ],
        interactionRadius: 60 * dpr
      },
      {
        id: 'save_point',
        name: '存档点',
        x: TOWN_NPC_POSITIONS.save_point.x * dpr,
        y: TOWN_NPC_POSITIONS.save_point.y * dpr,
        sprite: '💾',
        color: '#10ac84',
        dialogues: [
          { text: '这是一个存档点。' },
          { action: 'save_game' }
        ],
        interactionRadius: 50 * dpr
      },
      {
        id: 'potion_seller',
        name: '药剂师',
        x: TOWN_NPC_POSITIONS.potion_seller.x * dpr,
        y: TOWN_NPC_POSITIONS.potion_seller.y * dpr,
        sprite: '🧪',
        color: '#9b59b6',
        dialogues: [
          { text: '需要药品吗？我的药水可以帮你恢复体力。' },
          { text: '（药店功能开发中...）' }
        ],
        interactionRadius: 55 * dpr
      },
      {
        // ★ 装备强化器（类似 DNF 强化机）：走近交互 → 打开强化面板
        id: 'enhance_machine',
        name: '装备强化器',
        machine: true,
        x: TOWN_NPC_POSITIONS.enhance_machine.x * dpr,
        y: TOWN_NPC_POSITIONS.enhance_machine.y * dpr,
        color: '#f39c12',
        dialogues: [
          { action: 'open_enhance' }
        ],
        interactionRadius: 60 * dpr
      }
    ]
  }
  
  init() {
    // 初始化移动系统
    this.movement.init()
    
    // 将碰撞数据注入移动系统
    this.movement.setObstacles(this.obstacles)
    
    // 初始对话
    if (!this.introShown) {
      const chief = this.npcs.find(n => n.id === 'village_chief')
      if (chief) {
        this.currentDialogueNPC = chief
        this.dialogueQueue = [...chief.dialogues]
        this._showNextDialogue()
        this.game.data.set('introShown', true)
      }
    }
  }
  
  destroy() {
    this.movement.destroy()
  }
  
  update(dt) {
    this.time += dt

    // 更新测试日志衰减
    for (let i = this.testLogs.length - 1; i >= 0; i--) {
      this.testLogs[i].time -= dt
      if (this.testLogs[i].time <= 0) {
        this.testLogs.splice(i, 1)
      }
    }

    // 更新调试坐标显示衰减
    if (this._debugCoords.show && this._debugCoords.showTime !== undefined) {
      this._debugCoords.showTime -= dt
      if (this._debugCoords.showTime <= 0) {
        this._debugCoords.show = false
      }
    }

    // 实时更新玩家世界坐标
    this._debugCoords.x = Math.round(this.movement.playerX / this.dpr)
    this._debugCoords.y = Math.round(this.movement.playerY / this.dpr)
    
    // 如果探索菜单打开，只处理菜单输入
    if (this.exploreMenu) {
      if (this.game.input.taps.length > 0) {
        const tap = this.game.input.consumeTap()
        if (tap) {
          this._handleExploreMenuTap(tap.x, tap.y)
        }
      }
      return
    }
    
    // 如果装备面板打开，只处理面板输入
    if (this.equipmentPanel.active) {
      if (this.game.input.taps.length > 0) {
        const tap = this.game.input.consumeTap()
        if (tap) {
          this.equipmentPanel.handleTap(tap.x, tap.y)
        }
      }

      if (this.game.input.scrollY) {
        this.equipmentPanel.handleScroll(this.game.input.scrollY)
        this.game.input.scrollY = 0
      }

      return
    }

    // 如果强化器面板打开，只处理面板输入
    if (this.enhancePanel.active) {
      if (this.game.input.taps.length > 0) {
        const tap = this.game.input.consumeTap()
        if (tap) {
          this.enhancePanel.handleTap(tap.x, tap.y)
        }
      }

      if (this.game.input.scrollY) {
        this.enhancePanel.handleScroll(this.game.input.scrollY)
        this.game.input.scrollY = 0
      }

      return
    }
    
    // 处理点击事件
    if (this.game.input.taps.length > 0) {
      const tap = this.game.input.consumeTap()
      if (tap) {
        // 记录触摸点的世界坐标（调试用）
        // screenToWorld = screenPos + cameraPos
        this._debugCoords.tapWorldX = Math.round((tap.x + this.movement.cameraX) / this.dpr)
        this._debugCoords.tapWorldY = Math.round((tap.y + this.movement.cameraY) / this.dpr)
        this._debugCoords.show = true
        this._debugCoords.showTime = 3.0 // 显示3秒

        // ★ 角色详情面板打开时，优先处理面板内点击（关闭✕ / 卸下）
        if (this.charInfoPanel.visible) {
          this.game.audio.playSFX('ui_click')
          this._handleCharInfoTap(tap)
          return
        }

        // 对话框点击
        if (this.dialogue) {
          this.game.audio.playSFX('ui_click')
          this._showNextDialogue()
          return
        }

        // 检查是否点击了NPC
        const clickedNPC = this._checkClickNPC(tap)
        if (clickedNPC) {
          this.game.audio.playSFX('ui_confirm')
          this._interactWithNPC(clickedNPC)
          return
        }

        // ★ 迷你详情卡展开时，先处理其内点击（详情按钮/点外收起）
        if (this._expandedHeroId && this._handlePartyExpandTap(tap)) return

        // ★ 队伍状态条成员点击 → 切换控制者并展开迷你卡
        if (this._handlePartyBarTap(tap)) return

        // 尝试激活摇杆
        this.movement.handleTap(tap)
      }
    }
    
    // 对话中不处理移动
    if (this.dialogue) return
    
    // 更新移动系统（已包含碰撞检测）
    this.movement.update(dt)
    
    // 检测附近的NPC
    this._checkNearbyNPC()
  }
  
  _checkClickNPC(tap) {
    for (const npc of this.npcs) {
      const screenPos = this.movement.worldToScreen(npc.x, npc.y)
      
      const dist = Math.sqrt(
        (tap.x - screenPos.x) ** 2 +
        (tap.y - screenPos.y) ** 2
      )
      
      if (dist <= npc.interactionRadius) {
        const playerDist = Math.sqrt(
          (this.movement.playerX - npc.x) ** 2 +
          (this.movement.playerY - npc.y) ** 2
        )
        
        if (playerDist <= npc.interactionRadius * 1.5) {
          return npc
        }
      }
    }
    
    return null
  }
  
  _checkNearbyNPC() {
    this.nearbyNPC = null
    
    for (const npc of this.npcs) {
      const dist = Math.sqrt(
        (this.movement.playerX - npc.x) ** 2 +
        (this.movement.playerY - npc.y) ** 2
      )
      if (dist <= npc.interactionRadius) {
        this.nearbyNPC = npc
        break
      }
    }
  }
  
  _interactWithNPC(npc) {
    this.currentDialogueNPC = npc
    this.dialogueQueue = [...npc.dialogues]
    this._showNextDialogue()
  }
  
  _showNextDialogue() {
    if (this.dialogueQueue.length > 0) {
      const item = this.dialogueQueue.shift()
      
      if (item.action) {
        switch (item.action) {
          case 'open_explore_menu':
            this.dialogue = null
            this.currentDialogueNPC = null
            this._openExploreMenu()
            return
          case 'save_game':
            this.game.data.save()
            this.currentDialogueNPC = null
            this.dialogue = { name: '系统', text: '存档成功！' }
            return
          case 'open_equipment':
            this.dialogue = null
            this.currentDialogueNPC = null
            this.equipmentPanel.open(charStateManager.getAllCharacters()[0])
            return
          case 'open_enhance':
            this.dialogue = null
            this.currentDialogueNPC = null
            this.enhancePanel.open()
            return
        }
      }
      
      this.dialogue = {
        name: this.currentDialogueNPC?.name || '???',
        text: item.text
      }
    } else {
      this.dialogue = null
      this.currentDialogueNPC = null
    }
  }
  
  _openExploreMenu() {
    const partyLevel = Math.max(...this.party.map(char => char.level))
    const amyDefeated = this.game.data.get('amyDefeated') || false
    const testMode = this.game.data.get('testUnlockAll') || false
    
    const dungeons = [
      {
        id: 'grassland',
        name: '☀ 阳光草原副本',
        desc: '清剿全部敌人通关 | 已解锁艾米',
        area: 'grassland',
        unlocked: true,
        color: '#2ecc71'
      },
      {
        id: 'tower',
        name: '⚔️ 闯关模式',
        desc: '挑战层层关卡，收集强力装备',
        area: 'tower',
        unlocked: true,
        color: '#f39c12'
      },
      {
        id: 'magic_tower',
        name: '探索魔法塔危机',
        desc: `等级 4-6 | ${amyDefeated ? '已击败艾米' : '需击败艾米'} ${partyLevel > 3 ? '✓' : `需等级>3 (${partyLevel})`}`,
        area: 'magic_tower',
        unlocked: testMode || (amyDefeated && partyLevel > 3),
        requirement: `需要：等级>3 且 击败艾米`,
        color: '#9b59b6'
      },
      {
        id: 'merchant_town',
        name: '探索商人的秘密',
        desc: '等级 7-9 | 未解锁',
        area: 'merchant_town',
        unlocked: testMode,
        requirement: '需要：完成魔法塔危机',
        color: '#f39c12'
      },
      {
        id: 'ancient_ruins',
        name: '探索古城守护者',
        desc: '等级 10-12 | 未解锁',
        area: 'ancient_ruins',
        unlocked: testMode,
        requirement: '需要：完成商人的秘密',
        color: '#3498db'
      },
      {
        id: 'void_mist',
        name: '决战虚无之雾',
        desc: '最终决战 | 未解锁',
        area: 'void_mist',
        unlocked: testMode,
        requirement: '需要：完成古城守护者',
        color: '#e74c3c'
      }
    ]
    
    this.exploreMenu = {
      dungeons: dungeons,
      width: Math.min(500 * this.dpr, this.width * 0.9),
      height: Math.min(500 * this.dpr, this.height * 0.85)
    }
    
    console.log('[Town] 打开探索菜单', { partyLevel, amyDefeated, testMode })
  }
  
  _handleExploreMenuTap(tx, ty) {
    if (!this.exploreMenu) return
    
    const menu = this.exploreMenu
    const menuX = (this.width - menu.width) / 2
    const menuY = (this.height - menu.height) / 2
    const btnW = menu.width - 40 * this.dpr
    const btnH = 60 * this.dpr
    const startY = menuY + 76 * this.dpr
    
    // 关闭按钮
    const closeBtnX = menuX + menu.width - 50 * this.dpr
    const closeBtnY = menuY + 15 * this.dpr
    const closeBtnRadius = 20 * this.dpr
    const dist = Math.sqrt((tx - closeBtnX - 20 * this.dpr) ** 2 + (ty - closeBtnY - 20 * this.dpr) ** 2)
    if (dist <= closeBtnRadius) {
      this.game.audio.playSFX('ui_cancel')
      this.exploreMenu = null
      return
    }
    
    // 测试解锁按钮（仅开发模式生效，避免玩家误触或生产泄漏）
    if (this.game.isDev) {
      const testBtnX = menuX + 20 * this.dpr
      const testBtnY = menuY + menu.height - 50 * this.dpr
      const testBtnW = menu.width - 40 * this.dpr
      const testBtnH = 35 * this.dpr
      if (this._isInRect(tx, ty, testBtnX, testBtnY, testBtnW, testBtnH)) {
        this.game.data.set('amyDefeated', true)
        this.game.data.set('testUnlockAll', true)
        console.log('[Town] 测试模式：解锁所有副本')
        this._addLog('[测试] 已解锁所有副本')
        this.exploreMenu = null
        this._openExploreMenu()
        return
      }
    }
    
    // 副本按钮
    for (let i = 0; i < menu.dungeons.length; i++) {
      const dungeon = menu.dungeons[i]
      const btnX = menuX + 20 * this.dpr
      const btnY = startY + i * (btnH + 10 * this.dpr)
      
      if (this._isInRect(tx, ty, btnX, btnY, btnW, btnH)) {
        if (dungeon.unlocked) {
          this.game.audio.playSFX('ui_confirm')
          console.log(`[Town] 选择副本: ${dungeon.name}`)
          this.exploreMenu = null
          this.game.audio.stopBGM()
          if (dungeon.area === 'tower') {
            this.game.changeScene('tower')
          } else {
            this.game.changeScene('field', { area: dungeon.area, controlledHeroId: this.controlledHeroId })
          }
        } else {
          if (dungeon.requirement) {
            this._addLog(`❌ ${dungeon.requirement}`)
          }
        }
        return
      }
    }
  }
  
  render(ctx) {
    // 1. 绘制草地背景
    this._renderBackground(ctx)

    // 2. 绘制程序化土路
    this._renderPaths(ctx)

    // 3. 统一Y轴排序渲染（伪3D层次感）
    // 地图对象、NPC、主角全部按底部Y坐标排序后绘制
    this._renderYSortedEntities(ctx)
    
    // 4. 渲染摇杆
    this.movement.renderJoystick(ctx)
    
    // 6. UI元素
    if (this.nearbyNPC && !this.dialogue && !this.equipmentPanel.active && !this.enhancePanel.active && !this.exploreMenu) {
      this._renderInteractionTip(ctx)
    }
    
    if (this.dialogue) {
      this._renderDialogue(ctx)
    }
    
    this.equipmentPanel.render(ctx)
    if (this.enhancePanel.active) this.enhancePanel.render(ctx)
    
    if (this.exploreMenu) {
      this._renderExploreMenu(ctx)
    }
    
    this._renderTestLogs(ctx)

    // ★ 金币顶栏（常驻显示玩家金币）
    this._renderTopBar(ctx)

    // ★ 队伍状态条（常驻显示全员头像/等级/HP/MP/经验，点击切换控制者并展开迷你卡）
    this._renderPartyBar(ctx)

    // ★ 迷你详情卡（点击队伍卡后滑出，角色详情面板之下）
    this._renderPartyExpandCard(ctx)

    // ★ 角色详情面板（带遮罩，最上层；点击成员后可见）
    this._charInfoBounds = this.charInfoPanel.renderDetailPanel()

    // 调试坐标显示（默认关闭，仅内部调试时置 _debugCoordsEnabled=true）
    if (this._debugCoordsEnabled) this._renderDebugCoords(ctx)
  }

  /**
   * 绘制像素风格道路（区域式布局，用素材平铺矩形）
   */
  _renderPaths(ctx) {
    const camX = this.movement.cameraX
    const camY = this.movement.cameraY
    const dpr = this.dpr

    // 预缓存素材（只查一次）
    if (!this._roadImgs) {
      this._roadImgs = {
        h: this.game.assets.get('TOWN_ROAD_H'),
        t: this.game.assets.get('TOWN_ROAD_T'),
        cross: this.game.assets.get('TOWN_ROAD_CROSS'),
        curve: this.game.assets.get('TOWN_ROAD_CURVE'),
      }
    }

    if (!this._roadImgs.h) return

    ctx.save()

    for (const zone of TOWN_ROAD_ZONES) {
      const zx = zone.x * dpr - camX
      const zy = zone.y * dpr - camY
      const zw = zone.w * dpr
      const zh = zone.h * dpr

      // 视野裁剪：不在屏幕内则跳过
      if (zx + zw < -20 || zx > this.width + 20 || zy + zh < -20 || zy > this.height + 20) continue

      switch (zone.type) {
        case 'straight_h':
          this._tileRect(ctx, this._roadImgs.h, zx, zy, zw, zh, 0)
          break
        case 'straight_v':
          this._tileRect(ctx, this._roadImgs.h, zx, zy, zw, zh, Math.PI / 2)
          break
        case 'cross':
          ctx.drawImage(this._roadImgs.cross, zx, zy, zw, zh)
          break
        case 't_north':
          // T字朝北（上方开口）= 原图不旋转
          ctx.drawImage(this._roadImgs.t, zx, zy, zw, zh)
          break
        case 't_south':
          // T字朝南 = 旋转180°
          this._drawRotated(ctx, this._roadImgs.t, zx, zy, zw, zh, Math.PI)
          break
        case 't_east':
          // T字朝东 = 旋转-90°
          this._drawRotated(ctx, this._roadImgs.t, zx, zy, zw, zh, -Math.PI / 2)
          break
        case 't_west':
          // T字朝西 = 旋转90°
          this._drawRotated(ctx, this._roadImgs.t, zx, zy, zw, zh, Math.PI / 2)
          break
        case 'curve':
          ctx.drawImage(this._roadImgs.curve, zx, zy, zw, zh)
          break
      }
    }

    ctx.restore()
  }

  /**
   * 用图片平铺填充一个矩形区域（支持旋转）
   */
  _tileRect(ctx, img, x, y, w, h, rotation) {
    if (!img) return

    ctx.save()
    // 移到区域中心，旋转，再绘制
    ctx.translate(x + w / 2, y + h / 2)
    ctx.rotate(rotation)

    // 计算需要多少个图块来填满
    // 旋转后：原来的宽变成沿绘制方向的长度
    const imgW = img.width
    const imgH = img.height
    // 沿路方向（旋转后的"长"方向）的长度
    const alongLen = (rotation === 0 || rotation === Math.PI) ? w : h
    // 垂直于路方向的宽度
    const acrossLen = (rotation === 0 || rotation === Math.PI) ? h : w

    const count = Math.ceil(alongLen / imgW) + 1
    const overlap = Math.max(3, imgW * 0.05)
    const step = imgW - overlap

    for (let i = 0; i < count; i++) {
      const sx = -alongLen / 2 + i * step
      if (sx > alongLen / 2) break

      let drawW = imgW
      if (sx + imgW > alongLen / 2 + 1) {
        drawW = alongLen / 2 - sx
        if (drawW <= 0) break
      }

      ctx.drawImage(
        img,
        sx,
        -acrossLen / 2,
        drawW,
        acrossLen
      )
    }

    ctx.restore()
  }

  /**
   * 绘制旋转的图片（用于T字路口不同朝向）
   */
  _drawRotated(ctx, img, x, y, w, h, angle) {
    if (!img) return
    ctx.save()
    ctx.translate(x + w / 2, y + h / 2)
    ctx.rotate(angle)
    ctx.drawImage(img, -w / 2, -h / 2, w, h)
    ctx.restore()
  }

  /**
   * 绘制草地背景（带简单纹理）
   */
  _renderBackground(ctx) {
    const camX = this.movement.cameraX
    const camY = this.movement.cameraY
    
    // 基础草地颜色
    ctx.fillStyle = TOWN_MAP_CONFIG.bgColor
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 绘制深色草地块（模拟纹理），只在可见区域内
    ctx.fillStyle = TOWN_MAP_CONFIG.bgDarkColor
    const tileSize = 80 * this.dpr
    const startX = Math.floor(camX / tileSize) * tileSize
    const startY = Math.floor(camY / tileSize) * tileSize * tileSize
    
    for (let gx = startX - tileSize; gx < camX + this.width + tileSize * 2; gx += tileSize) {
      for (let gy = startY - tileSize; gy < camY + this.height + tileSize * 2; gy += tileSize) {
        // 用伪随机（基于位置）决定是否绘制深色块
        const hash = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453
        if ((hash - Math.floor(hash)) > 0.65) {
          const sx = gx - camX
          const sy = gy - camY
          const size = tileSize * (0.8 + (hash - Math.floor(hash)) * 0.4)
          ctx.fillRect(sx, sy, size, size * 0.6)
        }
      }
    }
  }

  /**
   * 统一Y轴排序渲染 — 使用 Renderer2D5 引擎
   *
   * 渲染流程由引擎统一管理，scene 只负责提供实体数据。
   * 地图对象、NPC、玩家全部按底部Y坐标排序后绘制。
   */
  _renderYSortedEntities(ctx) {
    const engine = this._renderer2d5
    const self = this
    engine.setCamera(this.movement.cameraX, this.movement.cameraY)
    engine.clear()

    // ── 遍历所有地图对象，根据 obj.layer 设置图层 ──
    for (const obj of TOWN_MAP_OBJECTS) {
      // 根据 obj.layer 确定图层
      // fg层降低层级，与road层差不多（都是layer 1），避免遮挡过多
      let layer = 2 // 默认 layer=2（main）
      if (obj.layer === 'bg') layer = 0
      else if (obj.layer === 'road') layer = 1
      else if (obj.layer === 'fg') layer = 1  // 修改：从3降为1，与road同层

      // 根据类型添加到引擎
      if (obj.type === MAP_OBJ_TYPE.DECORATION) {
        engine.addDecoration(obj, { layer })
      } else {
        engine.addObstacle(obj, { layer })
      }
    }

    // ── layer=2：NPC─
    if (this.npcs && Array.isArray(this.npcs)) {
      for (const npc of this.npcs) {
        const screenPos = this.movement.worldToScreen(npc.x, npc.y)
        engine.addNPC(npc, { x: screenPos.x, y: screenPos.y }, {
          dpr: this.dpr,
          nearbyNPC: this.nearbyNPC
        })
      }
    }

    // ── layer=2：主角+队友（作为整体参与Y排序）─
    if (typeof this.movement.playerX === 'number') {
      engine.addPlayer(this.movement.playerY / this.dpr + 50, (ctx) => {
        self.movement.renderCharacters(ctx)
      })
    }

    // 排序 + 统一绘制（通过 hooks 处理NPC渲染）
    engine.render(ctx, {
      renderNPC: (ctx, npc, sx, sy, extra) => {
        self._renderNPC(ctx, npc, sx, sy, extra)
      }
    })
  }

  _renderInteractionTip(ctx) {
    const tipY = 100 * this.dpr
    
    ctx.font = `bold ${16 * this.dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    
    const text = `点击与 ${this.nearbyNPC.name} 互动`
    ctx.strokeText(text, this.width / 2, tipY)
    ctx.fillText(text, this.width / 2, tipY)
  }

  /**
   * 渲染单个NPC（供 Renderer2D5 引擎调用）
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} npc      NPC数据对象
   * @param {number} sx       屏幕X坐标
   * @param {number} sy       屏幕Y坐标
   * @param {Object} extra    额外参数 { nearbyNPC, dpr }
   */
  _renderNPC(ctx, npc, sx, sy, extra) {
    const dpr = extra.dpr || this.dpr

    // 互动范围指示
    if (extra.nearbyNPC === npc) {
      ctx.beginPath()
      ctx.arc(sx, sy, npc.interactionRadius || 50 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = `${npc.color || '#ffffff'}33`
      ctx.fill()
    }

    // ★ 强化器：绘制实体机器（铁灰舱体 + 橙色发光核心 + 提示箭头）
    if (npc.machine) {
      const w = 70 * dpr, h = 96 * dpr
      const bx = sx - w / 2, by = sy - h / 2
      // 舱体
      ctx.fillStyle = '#3b4252'
      ctx.beginPath()
      this._roundRect(ctx, bx, by, w, h, 10 * dpr)
      ctx.fill()
      ctx.strokeStyle = '#f39c12'
      ctx.lineWidth = 3 * dpr
      ctx.stroke()
      // 发光核心
      const cx = sx, cy = by + h * 0.42
      const glow = ctx.createRadialGradient(cx, cy, 2 * dpr, cx, cy, 20 * dpr)
      glow.addColorStop(0, '#fff3c4')
      glow.addColorStop(0.5, '#f39c12')
      glow.addColorStop(1, 'rgba(243,156,18,0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, 20 * dpr, 0, Math.PI * 2)
      ctx.fill()
      // 底座
      ctx.fillStyle = '#2b303b'
      ctx.beginPath()
      this._roundRect(ctx, bx - 6 * dpr, by + h - 12 * dpr, w + 12 * dpr, 16 * dpr, 6 * dpr)
      ctx.fill()
      // 名称标签
      ctx.font = `bold ${14 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 3
      ctx.strokeText(npc.name || 'Unknown', sx, sy - h / 2 - 10 * dpr)
      ctx.fillText(npc.name || 'Unknown', sx, sy - h / 2 - 10 * dpr)
      return
    }

    // ★ 村长精灵：优先用真实角色立绘（93×120 透明 PNG），资源未加载则降级 emoji
    if (npc.id === 'village_chief') {
      const chiefImg = this.game.assets.get('NPC_VILLAGE_CHIEF_IDLE_01')
      if (chiefImg) {
        // 与主角一致的高度基准（field-movement 主角 = 80*dpr 高）
        const targetH = 80 * dpr
        const scale = targetH / chiefImg.height
        const w = chiefImg.width * scale
        const h = chiefImg.height * scale
        // 脚下椭圆地影（与 field-movement 主角一致）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
        ctx.beginPath()
        ctx.ellipse(sx, sy, w * 0.35, w * 0.1, 0, 0, Math.PI * 2)
        ctx.fill()
        // 朝向：立绘是侧脸朝右（牧羊杖在左），玩家在左侧时水平翻转避免背对
        const facingLeft = typeof this.movement.playerX === 'number' && this.movement.playerX < npc.x
        ctx.save()
        if (facingLeft) {
          ctx.translate(sx, 0)
          ctx.scale(-1, 1)
          ctx.translate(-sx, 0)
        }
        // 脚底对齐 sy：图片 bottom 贴 sy
        ctx.drawImage(chiefImg, sx - w / 2, sy - h, w, h)
        ctx.restore()
      } else {
        ctx.font = `${40 * dpr}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(npc.sprite || '👴', sx, sy)
      }
    } else {
      // NPC图标（emoji）
      ctx.font = `${40 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(npc.sprite || '🐱', sx, sy)
    }

    // 名称标签
    ctx.font = `bold ${14 * dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    ctx.strokeText(npc.name || 'Unknown', sx, sy - 35 * dpr)
    ctx.fillText(npc.name || 'Unknown', sx, sy - 35 * dpr)
  }
  
  _renderDialogue(ctx) {
    const boxH = 150 * this.dpr
    const y = this.height - boxH - 20 * this.dpr
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'
    ctx.beginPath()
    this._roundRect(ctx, 20 * this.dpr, y, this.width - 40 * this.dpr, boxH, 10 * this.dpr)
    ctx.fill()
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.font = `bold ${20 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ff9f43'
    ctx.textAlign = 'left'
    ctx.fillText(this.dialogue.name, 30 * this.dpr, y + 30 * this.dpr)
    
    ctx.font = `${18 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(this.dialogue.text, 30 * this.dpr, y + 60 * this.dpr)
    
    ctx.font = `${14 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.textAlign = 'right'
    ctx.fillText('点击继续', this.width - 30 * this.dpr, y + boxH - 15 * this.dpr)
  }
  
  _renderExploreMenu(ctx) {
    const menu = this.exploreMenu
    if (!menu) return
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    const menuX = (this.width - menu.width) / 2
    const menuY = (this.height - menu.height) / 2
    
    const panelGrad = ctx.createLinearGradient(menuX, menuY, menuX, menuY + menu.height)
    panelGrad.addColorStop(0, '#2c3e50')
    panelGrad.addColorStop(1, '#34495e')
    
    ctx.fillStyle = panelGrad
    ctx.beginPath()
    this._roundRect(ctx, menuX, menuY, menu.width, menu.height, 20 * this.dpr)
    ctx.fill()
    
    ctx.strokeStyle = '#f39c12'
    ctx.lineWidth = 3 * this.dpr
    ctx.stroke()
    
    ctx.font = `bold ${24 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText('选择探索区域', menuX + menu.width / 2, menuY + 38 * this.dpr)

    // ★ 当前出战主角提示（与城镇队伍条金边主控保持一致）
    const ctrlCs = this.party && this.party.find(c => c.id === this.controlledHeroId)
    const ctrlName = (ctrlCs && ctrlCs.name) || this.controlledHeroId || '未知'
    ctx.font = `bold ${14 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffd24a'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`👑 出战主角：${ctrlName}`, menuX + menu.width / 2, menuY + 58 * this.dpr)
    
    // 关闭按钮
    const closeBtnX = menuX + menu.width - 50 * this.dpr
    const closeBtnY = menuY + 15 * this.dpr
    ctx.fillStyle = '#e74c3c'
    ctx.beginPath()
    ctx.arc(closeBtnX + 20 * this.dpr, closeBtnY + 20 * this.dpr, 18 * this.dpr, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `bold ${24 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText('×', closeBtnX + 20 * this.dpr, closeBtnY + 28 * this.dpr)
    
    const btnW = menu.width - 40 * this.dpr
    const btnH = 60 * this.dpr
    const startY = menuY + 76 * this.dpr
    
    for (let i = 0; i < menu.dungeons.length; i++) {
      const dungeon = menu.dungeons[i]
      const btnX = menuX + 20 * this.dpr
      const btnY = startY + i * (btnH + 10 * this.dpr)
      
      if (dungeon.unlocked) {
        const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH)
        btnGrad.addColorStop(0, dungeon.color)
        btnGrad.addColorStop(1, dungeon.color + 'aa')
        ctx.fillStyle = btnGrad
      } else {
        ctx.fillStyle = 'rgba(100, 100, 100, 0.5)'
      }
      
      ctx.beginPath()
      this._roundRect(ctx, btnX, btnY, btnW, btnH, 10 * this.dpr)
      ctx.fill()
      
      ctx.strokeStyle = dungeon.unlocked ? dungeon.color : 'rgba(255, 255, 255, 0.2)'
      ctx.lineWidth = 2 * this.dpr
      ctx.stroke()
      
      ctx.font = `bold ${18 * this.dpr}px sans-serif`
      ctx.fillStyle = dungeon.unlocked ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'
      ctx.textAlign = 'left'
      ctx.fillText(dungeon.name, btnX + 15 * this.dpr, btnY + 25 * this.dpr)
      
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = dungeon.unlocked ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)'
      ctx.fillText(dungeon.desc, btnX + 15 * this.dpr, btnY + 45 * this.dpr)
      
      if (!dungeon.unlocked) {
        ctx.font = `${24 * this.dpr}px sans-serif`
        ctx.textAlign = 'right'
        ctx.fillText('🔒', btnX + btnW - 15 * this.dpr, btnY + 38 * this.dpr)
      }
      // ★ 已通关标记（消费 dungeon_cleared_grassland flag，原只写不读，现形成闭环）
      if (dungeon.id === 'grassland' && this.game.data.get('dungeon_cleared_grassland')) {
        ctx.font = `${22 * this.dpr}px sans-serif`
        ctx.textAlign = 'right'
        ctx.fillText('✅ 已通关', btnX + btnW - 15 * this.dpr, btnY + 38 * this.dpr)
      }
    }
    
    // 测试按钮（仅 WeChat DevTools 编译模式下可见；生产环境整段跳过，避免开发按钮泄漏到线上）
    if (!this.game.isDev) return
    const testBtnX = menuX + 20 * this.dpr
    const testBtnY = menuY + menu.height - 50 * this.dpr
    const testBtnW = menu.width - 40 * this.dpr
    const testBtnH = 35 * this.dpr
    
    ctx.fillStyle = 'rgba(231, 76, 60, 0.8)'
    ctx.beginPath()
    this._roundRect(ctx, testBtnX, testBtnY, testBtnW, testBtnH, 8 * this.dpr)
    ctx.fill()
    
    ctx.font = `bold ${14 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText('🧪 测试：解锁所有副本', testBtnX + testBtnW / 2, testBtnY + testBtnH / 2 + 5 * this.dpr)
  }
  
  _renderTestLogs(ctx) {
    const logY = 200 * this.dpr
    ctx.font = `bold ${16 * this.dpr}px sans-serif`
    ctx.textAlign = 'center'
    
    for (let i = 0; i < this.testLogs.length; i++) {
      const log = this.testLogs[i]
      const alpha = Math.min(1, log.time)
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.5})`
      ctx.lineWidth = 2
      ctx.strokeText(log.text, this.width / 2, logY + i * 25 * this.dpr)
      ctx.fillText(log.text, this.width / 2, logY + i * 25 * this.dpr)
    }
  }
  
  _addLog(text) {
    this.testLogs.push({ text, time: 3.0 })
    if (this.testLogs.length > 5) this.testLogs.shift()
  }
  
  _isInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh
  }
  
  _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  /**
   * 渲染调试坐标信息（用于调整资源位置）
   * 显示玩家当前世界坐标和触摸位置的世界坐标
   */
  /**
   * 安全区顶部内边距（dpr 已乘）。优先取微信胶囊顶部，否则按屏高兜底。
   * 这样 HUD 不会被 iOS 状态栏 / 刘海吃掉。
   */
  _getSafeTop() {
    const dpr = this.dpr
    try {
      if (typeof wx !== 'undefined' && wx.getMenuButtonBoundingClientRect) {
        const r = wx.getMenuButtonBoundingClientRect()
        if (r && r.top) return r.top * dpr
      }
    } catch (e) {}
    return Math.max(this.height * 0.06, 44) * dpr
  }

  _renderTopBar(ctx) {
    const dpr = this.dpr
    ctx.save()
    const gold = (this.game.data.get && this.game.data.get('gold')) || 0
    // 右上金币 pill：玻璃圆角，避开微信胶囊（右侧 12dpr 内边距）
    const bh = 36 * dpr
    const padX = 14 * dpr
    const gap = 6 * dpr
    const coinR = 9 * dpr
    const numW = (String(gold).length * 12 + 6) * dpr
    const bx = this.width - (12 * dpr + padX * 2 + coinR * 2 + gap + numW)
    const by = this._getSafeTop() + 8 * dpr
    const bw = padX * 2 + coinR * 2 + gap + numW

    ctx.fillStyle = 'rgba(26,26,46,0.62)'
    this._roundRect(ctx, bx, by, bw, bh, 18 * dpr)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 1 * dpr
    this._roundRect(ctx, bx, by, bw, bh, 18 * dpr)
    ctx.stroke()

    // 金币图标（圆形）
    const cx = bx + padX + coinR
    const cy = by + bh / 2
    ctx.fillStyle = '#ffd86b'
    ctx.beginPath()
    ctx.arc(cx, cy, coinR, 0, Math.PI * 2)
    ctx.fill()

    // 金币数字
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffd86b'
    ctx.font = `bold ${16 * dpr}px sans-serif`
    ctx.fillText(`${gold}`, cx + coinR + gap, cy + 1 * dpr)
    ctx.restore()
  }

  /**
   * ★ 顶部紧凑队伍状态条：常驻显示全员头像 / 等级 / HP / MP / 经验，
   * 点击任意已解锁成员 → 切换为控制者并滑出迷你详情卡（再点同卡收起）。
   */
  _renderPartyBar(ctx) {
    const dpr = this.dpr
    // ★ 全员 6 槽：遍历 HEROES 全量阵容，已解锁取角色状态、未解锁画「?」占位
    const heroList = (typeof HEROES !== 'undefined' && HEROES) ? HEROES : []
    const members = heroList.map(h => {
      const cs = charStateManager.getCharacter(h.id)
      return cs
        ? Object.assign({}, cs, { _locked: false, _heroDef: h })
        : { id: h.id, name: h.name, _locked: true, _heroDef: h }
    })
    if (!members.length) return

    const n = members.length
    const leftInset = 8 * dpr
    const rightInset = 8 * dpr
    const gap = 5 * dpr
    const availW = this.width - leftInset - rightInset
    // 紧凑卡宽：全员一排不溢出（上限 72，窄屏自适应）
    const cardW = Math.min(72 * dpr, (availW - (n - 1) * gap) / n)
    const cardH = 46 * dpr
    const totalW = n * cardW + (n - 1) * gap
    const startX = Math.max(leftInset, (this.width - totalW) / 2)
    const y = this._getSafeTop() + 44 * dpr // 第二行，金币 pill 下方

    this._partyBarBounds = []
    ctx.save()
    for (let i = 0; i < n; i++) {
      const c = members[i]
      const x = startX + i * (cardW + gap)
      this._partyBarBounds.push({ x, y, width: cardW, height: cardH, index: i, char: c })

      const locked = !!c._locked
      const isControlled = !locked && c.id === this.controlledHeroId

      // 卡片背景（玻璃面板，与金币 pill 风格一致）
      if (locked) {
        ctx.fillStyle = 'rgba(26,26,46,0.40)'
      } else {
        ctx.fillStyle = isControlled ? 'rgba(255,210,74,0.16)' : 'rgba(26,26,46,0.62)'
      }
      this._roundRect(ctx, x, y, cardW, cardH, 10 * dpr)
      ctx.fill()
      ctx.strokeStyle = locked ? 'rgba(255,255,255,0.12)' : (isControlled ? '#ffd24a' : 'rgba(255,255,255,0.18)')
      ctx.lineWidth = isControlled ? 1.5 * dpr : 1 * dpr
      this._roundRect(ctx, x, y, cardW, cardH, 10 * dpr)
      ctx.stroke()

      if (locked) {
        // 未解锁：? 占位 + 锁图标
        const cx = x + cardW / 2
        ctx.font = `${18 * dpr}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.fillText('?', cx, y + cardH / 2 - 5 * dpr)
        ctx.font = `${10 * dpr}px sans-serif`
        ctx.fillText('🔒', cx, y + cardH - 10 * dpr)
        continue
      }

      // 头像（圆形裁剪）
      const avatarR = 14 * dpr
      const avatarCx = x + 16 * dpr
      const avatarCy = y + cardH / 2
      ctx.save()
      ctx.beginPath()
      ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2)
      ctx.clip()
      const avatarImg = this.game.assets.get(`HERO_${c.id.toUpperCase()}`)
      if (avatarImg) {
        ctx.drawImage(avatarImg, avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2)
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.2)'
        ctx.fillRect(avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2)
      }
      ctx.restore()

      // 右侧信息列：等级 + HP/MP/经验 三条迷你条
      const ix = x + 34 * dpr
      const iw = cardW - 38 * dpr
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = `bold ${10 * dpr}px sans-serif`
      ctx.fillStyle = isControlled ? '#ffd24a' : '#ffd700'
      ctx.fillText(`Lv.${c.level || 1}`, ix, y + 9 * dpr)

      const barH = 4 * dpr
      // HP
      const hpY = y + 18 * dpr
      const hpP = Math.max(0, Math.min(1, (c.hp || 0) / (c.maxHp || 1)))
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(ix, hpY, iw, barH)
      ctx.fillStyle = hpP > 0.6 ? '#4ade80' : hpP > 0.3 ? '#ff9800' : '#f44336'
      ctx.fillRect(ix, hpY, iw * hpP, barH)
      // MP
      const mpY = y + 25 * dpr
      const mpP = Math.max(0, Math.min(1, (c.mp || 0) / (c.maxMp || 1)))
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(ix, mpY, iw, barH)
      ctx.fillStyle = '#4fc3f7'
      ctx.fillRect(ix, mpY, iw * mpP, barH)
      // 经验（带百分比文字）
      const expY = y + 32 * dpr
      const expP = Math.max(0, Math.min(1, (typeof c.getExpProgress === 'function') ? c.getExpProgress() : 0))
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(ix, expY, iw, barH)
      ctx.fillStyle = '#a78bfa'
      ctx.fillRect(ix, expY, iw * expP, barH)
      ctx.font = `${7 * dpr}px sans-serif`
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${Math.floor(expP * 100)}%`, ix + iw / 2, expY + barH / 2)

      // ★ 主控角标（金边卡右上角，明确标识「进副本主操控角色」）
      if (isControlled) {
        const tagW = 26 * dpr
        const tagH = 12 * dpr
        const tagX = x + cardW - tagW - 2 * dpr
        const tagY = y + 2 * dpr
        ctx.fillStyle = '#ffd24a'
        this._roundRect(ctx, tagX, tagY, tagW, tagH, 4 * dpr)
        ctx.fill()
        ctx.fillStyle = '#3a2a00'
        ctx.font = `bold ${8 * dpr}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('主控', tagX + tagW / 2, tagY + tagH / 2 + 0.5 * dpr)
      }
    }
    ctx.restore()
  }

  /**
   * ★ 点击已解锁队伍卡后滑出的迷你详情卡（头像/名/Lv/HP/MP/EXP + 查看详情按钮）。
   * 返回 bounds（含 detailBtn）供点击命中；无展开时返回 null。
   */
  _renderPartyExpandCard(ctx) {
    this._partyExpandBounds = null
    if (!this._expandedHeroId) return null
    // ★ 详情面板打开时自动收起迷你卡 — 避免叠层穿透（z-order 上迷你卡位于详情面板之上，会盖住「属性」标题）
    if (this.charInfoPanel && this.charInfoPanel.visible) {
      this._expandedHeroId = null
      return null
    }
    const cs = charStateManager.getCharacter(this._expandedHeroId)
    if (!cs) { this._expandedHeroId = null; return null }
    const dpr = this.dpr
    const w = 230 * dpr
    const h = 132 * dpr
    // 锚定在被展开卡下方，避免溢出右边界
    const barCard = this._partyBarBounds.find(b => b.char && b.char.id === this._expandedHeroId)
    let x = barCard ? barCard.x : 8 * dpr
    if (x + w > this.width - 8 * dpr) x = this.width - 8 * dpr - w
    if (x < 8 * dpr) x = 8 * dpr
    const y = this._getSafeTop() + 44 * dpr + 52 * dpr // 队伍条下方

    ctx.save()
    ctx.fillStyle = 'rgba(20,20,38,0.92)'
    this._roundRect(ctx, x, y, w, h, 12 * dpr)
    ctx.fill()
    ctx.strokeStyle = '#ffd24a'
    ctx.lineWidth = 1.5 * dpr
    this._roundRect(ctx, x, y, w, h, 12 * dpr)
    ctx.stroke()

    // 头像
    const av = 36 * dpr
    const avx = x + 12 * dpr, avy = y + 12 * dpr
    ctx.save()
    ctx.beginPath()
    ctx.arc(avx + av / 2, avy + av / 2, av / 2, 0, Math.PI * 2)
    ctx.clip()
    const img = this.game.assets.get(`HERO_${cs.id.toUpperCase()}`)
    if (img) ctx.drawImage(img, avx, avy, av, av)
    else { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(avx, avy, av, av) }
    ctx.restore()

    // 名称 + 等级
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.font = `bold ${15 * dpr}px sans-serif`
    ctx.fillStyle = '#fff'
    ctx.fillText(cs.name || this._expandedHeroId, avx + av + 10 * dpr, avy)
    ctx.font = `${12 * dpr}px sans-serif`
    ctx.fillStyle = '#ffd700'
    ctx.fillText(`Lv.${cs.level || 1}`, avx + av + 10 * dpr, avy + 20 * dpr)

    // 三条状态条（含数值）
    const sx = x + 12 * dpr
    const sw = w - 24 * dpr
    let sy = y + 58 * dpr
    const drawBar = (label, cur, max, color) => {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.font = `${9 * dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillText(label, sx, sy + 4 * dpr)
      const barX = sx + 34 * dpr
      const barW = sw - 34 * dpr - 46 * dpr
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(barX, sy, barW, 8 * dpr)
      const p = Math.max(0, Math.min(1, cur / (max || 1)))
      ctx.fillStyle = color
      ctx.fillRect(barX, sy, barW * p, 8 * dpr)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#fff'
      ctx.fillText(`${Math.floor(cur)}/${Math.floor(max)}`, sx + sw, sy + 4 * dpr)
      sy += 16 * dpr
    }
    drawBar('HP', cs.hp || 0, cs.maxHp || 1, '#4ade80')
    drawBar('MP', cs.mp || 0, cs.maxMp || 1, '#4fc3f7')
    drawBar('EXP', cs.exp || 0, cs.maxExp || 1, '#a78bfa')

    // 查看详情按钮
    const btnW = w - 24 * dpr
    const btnH = 26 * dpr
    const btnX = x + 12 * dpr
    const btnY = y + h - btnH - 10 * dpr
    ctx.fillStyle = 'rgba(255,210,74,0.22)'
    this._roundRect(ctx, btnX, btnY, btnW, btnH, 8 * dpr)
    ctx.fill()
    ctx.strokeStyle = '#ffd24a'
    ctx.lineWidth = 1 * dpr
    this._roundRect(ctx, btnX, btnY, btnW, btnH, 8 * dpr)
    ctx.stroke()
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${12 * dpr}px sans-serif`
    ctx.fillStyle = '#ffd24a'
    ctx.fillText('查看详情 →', btnX + btnW / 2, btnY + btnH / 2)
    ctx.restore()

    this._partyExpandBounds = {
      x, y, width: w, height: h,
      detailBtn: { x: btnX, y: btnY, width: btnW, height: btnH },
      charId: this._expandedHeroId
    }
    return this._partyExpandBounds
  }

  /**
   * 检测点击是否落在队伍状态条某成员热区。
   * 已解锁：点击切换为控制者并滑出迷你详情卡；再点同卡收起。
   * 未解锁：提示未解锁。
   * @returns {boolean} 命中返回 true（调用方应 return 不再处理移动）
   */
  _handlePartyBarTap(tap) {
    for (const card of this._partyBarBounds) {
      if (tap.x >= card.x && tap.x <= card.x + card.width &&
          tap.y >= card.y && tap.y <= card.y + card.height) {
        // 未解锁角色：不打开，仅给提示音
        if (card.char && card.char._locked) {
          if (this.game.showToast) this.game.showToast(`${card.char.name} 尚未解锁`)
          this.game.audio.playSFX('ui_cancel')
          return true
        }
        const id = card.char.id
        // 点击已展开的英雄 → 收起；否则切换为控制者并展开
        if (this._expandedHeroId === id) {
          this._expandedHeroId = null
        } else {
          this._setControlled(id)
          this._expandedHeroId = id
        }
        this.game.audio.playSFX('ui_confirm')
        return true
      }
    }
    return false
  }

  /**
   * 设置当前控制者（金边高亮 + 挂到 game 供进入副本复用）
   */
  _setControlled(id) {
    this.controlledHeroId = id
    if (this.game) {
      this.game.controlledHeroId = id
      // ★ 持久化，使选择跨场景/重进城镇后仍生效
      if (this.game.data) this.game.data.set('controlledHeroId', id)
    }
  }

  /**
   * 迷你详情卡内点击：详情按钮 → 打开完整角色面板；点击卡片外 → 收起。
   * @returns {boolean} 命中返回 true
   */
  _handlePartyExpandTap(tap) {
    const b = this._partyExpandBounds
    if (!b) return false
    // 详情按钮
    const db = b.detailBtn
    if (tap.x >= db.x && tap.x <= db.x + db.width &&
        tap.y >= db.y && tap.y <= db.y + db.height) {
      const cs = charStateManager.getCharacter(b.charId)
      if (cs) { this.charInfoPanel.setCharacter(cs); this.charInfoPanel.show() }
      // ★ 打开详情面板后立即收起迷你卡，避免 z-order 叠层盖住「属性」标题
      this._expandedHeroId = null
      this.game.audio.playSFX('ui_confirm')
      return true
    }
    // 卡片主体之外（遮罩）→ 收起
    if (!(tap.x >= b.x && tap.x <= b.x + b.width && tap.y >= b.y && tap.y <= b.y + b.height)) {
      this._expandedHeroId = null
      return true
    }
    return false
  }

  /**
   * 角色详情面板内点击处理：关闭✕ / 卸下装备 / 点击面板外遮罩关闭。
   */
  _handleCharInfoTap(tap) {
    const b = this._charInfoBounds
    if (!b) { this.charInfoPanel.hide(); return }

    // 关闭按钮（右上✕）
    if (b.closeBtn && tap.x >= b.closeBtn.x && tap.x <= b.closeBtn.x + b.closeBtn.width &&
        tap.y >= b.closeBtn.y && tap.y <= b.closeBtn.y + b.closeBtn.height) {
      this.charInfoPanel.hide()
      return
    }

    // 卸下装备按钮
    if (b.slots && b.slots.length) {
      for (const s of b.slots) {
        const ub = s.unequipBtn
        if (ub && tap.x >= ub.x && tap.x <= ub.x + ub.width &&
            tap.y >= ub.y && tap.y <= ub.y + ub.height) {
          equipmentManager.unequip(this.charInfoPanel.character, s.slot)
          this.game.data.set('equipmentData', equipmentManager.serialize())
          if (this.game.showToast) this.game.showToast('已卸下装备')
          return
        }
      }
    }

    // 点击面板主体之外（遮罩区域）→ 关闭
    if (!(tap.x >= b.x && tap.x <= b.x + b.width && tap.y >= b.y && tap.y <= b.y + b.height)) {
      this.charInfoPanel.hide()
    }
  }

  _renderDebugCoords(ctx) {
    const dpr = this.dpr
    const pad = 12 * dpr
    const lineHeight = 22 * dpr
    const fontSize = 14 * dpr

    // 收集所有要显示的坐标信息
    const lines = [
      `🧑 玩家: (${this._debugCoords.x}, ${this._debugCoords.y})`
    ]

    // 显示触摸坐标（如果最近有点击）
    if (this._debugCoords.show && this._debugCoords.showTime !== undefined) {
      lines.push(`👆 触摸: (${this._debugCoords.tapWorldX}, ${this._debugCoords.tapWorldY})`)
      lines.push(`   → town-map-data 中使用此坐标`)
    }

    // 显示地图范围提示
    lines.push(`🗺️ 地图: 2000 × 1200`)

    // 计算面板尺寸
    const panelW = 280 * dpr
    const panelH = lines.length * lineHeight + pad * 2
    const panelX = this.width - panelW - 10 * dpr
    const panelY = 10 * dpr

    // 绘制半透明背景
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.beginPath()
    this._roundRect(ctx, panelX, panelY, panelW, panelH, 8 * dpr)
    ctx.fill()

    ctx.strokeStyle = 'rgba(255, 193, 7, 0.6)'
    ctx.lineWidth = 2 * dpr
    ctx.stroke()

    // 绘制文字
    ctx.font = `bold ${fontSize}px "Courier New", monospace`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    for (let i = 0; i < lines.length; i++) {
      const alpha = (i === 1 && this._debugCoords.showTime !== undefined)
        ? Math.min(1, this._debugCoords.showTime)
        : 1
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.fillText(lines[i], panelX + pad, panelY + pad + i * lineHeight)
    }

    // 如果有触摸坐标，在触摸位置绘制一个小标记
    if (this._debugCoords.show) {
      const screenPos = this.movement.worldToScreen(
        this._debugCoords.tapWorldX * dpr,
        this._debugCoords.tapWorldY * dpr
      )
      const markAlpha = Math.min(1, this._debugCoords.showTime || 0)

      // 十字标记
      ctx.strokeStyle = `rgba(255, 80, 80, ${markAlpha})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(screenPos.x - 10, screenPos.y)
      ctx.lineTo(screenPos.x + 10, screenPos.y)
      ctx.moveTo(screenPos.x, screenPos.y - 10)
      ctx.lineTo(screenPos.x, screenPos.y + 10)
      ctx.stroke()

      // 坐标标签
      ctx.fillStyle = `rgba(255, 80, 80, ${markAlpha})`
      ctx.font = `bold ${12 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(
        `(${this._debugCoords.tapWorldX}, ${this._debugCoords.tapWorldY})`,
        screenPos.x,
        screenPos.y - 15 * dpr
      )
    }

    ctx.restore()
  }
}
