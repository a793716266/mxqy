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
import { FieldMovement } from '../utils/field-movement.js'
import { equipmentManager } from '../managers/equipment-manager.js'
import { EquipmentPanel } from '../ui/equipment-panel.js'
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

    // 角色信息面板（队伍状态条点击成员 → 打开详情）
    this.charInfoPanel = new CharacterInfoPanel(game, this.party[0])
    // 队伍状态条成员热区（render 时填充，update 点击检测用）
    this._partyBarBounds = []
    // 角色详情面板 bounds（renderDetailPanel 返回，关闭/卸下点击用）
    this._charInfoBounds = null
    
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

        // ★ 队伍状态条成员点击 → 打开角色详情
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
        id: 'merchant_secret',
        name: '探索商人的秘密',
        desc: '等级 7-9 | 未解锁',
        area: 'merchant_secret',
        unlocked: testMode,
        requirement: '需要：完成魔法塔危机',
        color: '#f39c12'
      },
      {
        id: 'ancient_guardian',
        name: '探索古城守护者',
        desc: '等级 10-12 | 未解锁',
        area: 'ancient_guardian',
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
    const startY = menuY + 60 * this.dpr
    
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
    
    // 测试解锁按钮
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
            this.game.changeScene('field', { area: dungeon.area })
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
    if (this.nearbyNPC && !this.dialogue && !this.equipmentPanel.active && !this.exploreMenu) {
      this._renderInteractionTip(ctx)
    }
    
    if (this.dialogue) {
      this._renderDialogue(ctx)
    }
    
    this.equipmentPanel.render(ctx)
    
    if (this.exploreMenu) {
      this._renderExploreMenu(ctx)
    }
    
    this._renderTestLogs(ctx)

    // ★ 金币顶栏（常驻显示玩家金币）
    this._renderTopBar(ctx)

    // ★ 队伍状态条（常驻显示全员头像/等级/HP/MP，点击打开角色详情）
    this._renderPartyBar(ctx)

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

    // NPC图标
    ctx.font = `${40 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(npc.sprite || '🐱', sx, sy)
    
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
    ctx.fillText('选择探索区域', menuX + menu.width / 2, menuY + 40 * this.dpr)
    
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
    const startY = menuY + 60 * this.dpr
    
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
    
    // 测试按钮
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
   * ★ 顶部队伍状态条：常驻显示全员头像 / 等级 / HP / MP，
   * 点击任意成员打开 CharacterInfoPanel 角色详情（含属性/装备/Buff）。
   */
  _renderPartyBar(ctx) {
    const dpr = this.dpr
    const members = (this.party && this.party.length) ? this.party : []
    if (!members.length) return

    const n = members.length
    const leftInset = 8 * dpr
    const rightInset = 8 * dpr
    const gap = 5 * dpr
    const availW = this.width - leftInset - rightInset
    // 自适应卡宽：全员一排，宽屏不浪费、窄屏不溢出
    const cardW = Math.min(64 * dpr, (availW - (n - 1) * gap) / n)
    const cardH = 52 * dpr
    const startX = leftInset
    const y = this._getSafeTop() + 52 * dpr // 第二行，避开第一行的金币 pill

    this._partyBarBounds = []
    ctx.save()
    for (let i = 0; i < n; i++) {
      const c = members[i]
      const x = startX + i * (cardW + gap)
      this._partyBarBounds.push({ x, y, width: cardW, height: cardH, index: i, char: c })

      const isControlled = (i === 0) // 被控者（队伍首位）高亮

      // 卡片背景（玻璃面板，与金币 pill 风格一致）
      ctx.fillStyle = isControlled ? 'rgba(255,210,74,0.15)' : 'rgba(26,26,46,0.62)'
      this._roundRect(ctx, x, y, cardW, cardH, 10 * dpr)
      ctx.fill()
      ctx.strokeStyle = isControlled ? '#ffd24a' : 'rgba(255,255,255,0.18)'
      ctx.lineWidth = isControlled ? 1.5 * dpr : 1 * dpr
      this._roundRect(ctx, x, y, cardW, cardH, 10 * dpr)
      ctx.stroke()

      // 头像（圆形裁剪）
      const avatarR = 13 * dpr
      const avatarCx = x + cardW / 2
      const avatarCy = y + 15 * dpr
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
        ctx.font = `${16 * dpr}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('🐱', avatarCx, avatarCy)
      }
      ctx.restore()

      // 等级
      ctx.font = `bold ${10 * dpr}px sans-serif`
      ctx.fillStyle = isControlled ? '#ffd24a' : '#ffd700'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`Lv.${c.level || 1}`, avatarCx, y + 32 * dpr)

      // HP 条
      const barW = cardW - 12 * dpr
      const barH = 3.5 * dpr
      const barX = x + 6 * dpr
      const hpY = y + 41 * dpr
      const hpP = Math.max(0, Math.min(1, (c.hp || 0) / (c.maxHp || 1)))
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(barX, hpY, barW, barH)
      ctx.fillStyle = hpP > 0.6 ? '#4ade80' : hpP > 0.3 ? '#ff9800' : '#f44336'
      ctx.fillRect(barX, hpY, barW * hpP, barH)
    }
    ctx.restore()
  }

  /**
   * 检测点击是否落在队伍状态条某成员热区，是则打开该成员详情。
   * @returns {boolean} 命中并打开返回 true（调用方应 return 不再处理移动）
   */
  _handlePartyBarTap(tap) {
    for (const card of this._partyBarBounds) {
      if (tap.x >= card.x && tap.x <= card.x + card.width &&
          tap.y >= card.y && tap.y <= card.y + card.height) {
        this.charInfoPanel.setCharacter(card.char)
        this.charInfoPanel.show()
        this.game.audio.playSFX('ui_confirm')
        return true
      }
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
