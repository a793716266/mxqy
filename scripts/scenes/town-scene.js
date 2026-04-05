/**
 * town-scene.js - 村庄探索场景（使用field移动系统）
 */

import { charStateManager } from '../data/character-state.js'
import { FieldMovement } from '../utils/field-movement.js'
import { equipmentManager } from '../managers/equipment-manager.js'
import { EquipmentPanel } from '../ui/equipment-panel.js'

export class TownScene {
  constructor(game, data) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0
    
    // 地图尺寸（根据village.jpeg实际尺寸：1664x928）
    const mapWidth = 1664 * this.dpr
    const mapHeight = 928 * this.dpr
    
    // 初始化移动系统（使用field-scene验证过的移动逻辑）
    this.movement = new FieldMovement(game, {
      mapWidth: mapWidth,
      mapHeight: mapHeight,
      playerX: mapWidth / 2,
      playerY: mapHeight / 2
    })
    
    // 初始化角色状态
    const savedCharData = this.game.data.get('characterStates')
    charStateManager.init(savedCharData)
    
    // 初始化装备管理器
    const savedEquipData = this.game.data.get('equipmentData')
    equipmentManager.init(savedEquipData)
    
    // 初始化队伍
    this.party = charStateManager.getAllCharacters()
    
    // 装备面板
    this.equipmentPanel = new EquipmentPanel(game, this.party[0])
    
    // 探索菜单
    this.exploreMenu = null
    
    // 测试日志
    this.testLogs = []
    
    // NPC列表
    this.npcs = this._initNPCs(mapWidth, mapHeight)
    
    // 对话框
    this.dialogue = null
    this.dialogueQueue = []
    this.nearbyNPC = null
    this.currentDialogueNPC = null
    
    // 初始对话
    this.introShown = this.game.data.get('introShown')
  }
  
  _initNPCs(mapWidth, mapHeight) {
    return [
      {
        id: 'village_chief',
        name: '村长',
        x: mapWidth * 0.3,
        y: mapHeight * 0.4,
        sprite: '👴',
        color: '#ffd700',
        dialogues: [
          { text: '欢迎来到喵星村！' },
          { text: '你是被选中的人类勇士，将带领猫咪们对抗暗影势力。' },
          { text: '村外最近出现了很多怪物，请务必小心！' }
        ],
        interactionRadius: 60 * this.dpr
      },
      {
        id: 'shop_keeper',
        name: '商店老板',
        x: mapWidth * 0.7,
        y: mapHeight * 0.8,
        sprite: '🏪',
        color: '#54a0ff',
        dialogues: [
          { text: '欢迎光临！这里有各种道具和装备。' },
          { text: '（商店功能开发中...）' }
        ],
        interactionRadius: 60 * this.dpr
      },
      {
        id: 'blacksmith',
        name: '铁匠',
        x: mapWidth * 0.6,
        y: mapHeight * 0.45,
        sprite: '⚒️',
        color: '#e67e22',
        dialogues: [
          { text: '需要管理装备吗？我可以帮你整理装备。' },
          { action: 'open_equipment' }
        ],
        interactionRadius: 60 * this.dpr
      },
      {
        id: 'quest_giver',
        name: '冒险者公会',
        x: mapWidth * 0.6,
        y: mapHeight * 0.8,
        sprite: '📜',
        color: '#ff9f43',
        dialogues: [
          { text: '这里是冒险者公会，可以接取任务。' },
          { text: '要探索野外吗？我可以为你指引方向。' },
          { action: 'open_explore_menu' }
        ],
        interactionRadius: 60 * this.dpr
      },
      {
        id: 'save_point',
        name: '存档点',
        x: mapWidth * 0.2,
        y: mapHeight * 0.7,
        sprite: '💾',
        color: '#10ac84',
        dialogues: [
          { text: '这是一个存档点。' },
          { action: 'save_game' }
        ],
        interactionRadius: 50 * this.dpr
      }
    ]
  }
  
  init() {
    // 初始化移动系统
    this.movement.init()
    
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
      
      // 处理滚动
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
        // 对话框点击
        if (this.dialogue) {
          this._showNextDialogue()
          return
        }
        
        // 检查是否点击了NPC（必须点击NPC的位置）
        const clickedNPC = this._checkClickNPC(tap)
        if (clickedNPC) {
          this._interactWithNPC(clickedNPC)
          return
        }
        
        // 尝试激活摇杆
        this.movement.handleTap(tap)
      }
    }
    
    // 如果在对话中，不处理移动
    if (this.dialogue) return
    
    // 更新移动系统（使用field-scene验证过的逻辑）
    this.movement.update(dt)
    
    // 检测附近的NPC（用于显示提示）
    this._checkNearbyNPC()
  }
  
  /**
   * 检查点击位置是否在NPC上
   */
  _checkClickNPC(tap) {
    for (const npc of this.npcs) {
      // 转换为屏幕坐标
      const screenPos = this.movement.worldToScreen(npc.x, npc.y)
      
      // 检查点击是否在NPC的互动范围内
      const dist = Math.sqrt(
        (tap.x - screenPos.x) ** 2 +
        (tap.y - screenPos.y) ** 2
      )
      
      if (dist <= npc.interactionRadius) {
        // 检查玩家是否在互动范围内
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
            // 打开探索菜单
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
            // 打开装备面板
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
  
  /**
   * 打开探索菜单
   */
  _openExploreMenu() {
    // 检查解锁条件
    const partyLevel = Math.max(...this.party.map(char => char.level))
    const amyDefeated = this.game.data.get('amyDefeated') || false
    
    // 探索副本列表
    const dungeons = [
      {
        id: 'grassland',
        name: '探索阳光草原',
        desc: '等级 1-3 | 已解锁艾米',
        area: 'grassland',
        unlocked: true,
        color: '#2ecc71'
      },
      {
        id: 'magic_tower',
        name: '探索魔法塔危机',
        desc: `等级 4-6 | ${amyDefeated ? '已击败艾米' : '需击败艾米'} ${partyLevel > 3 ? '✓' : `需等级>3 (${partyLevel})`}`,
        area: 'magic_tower',
        unlocked: amyDefeated && partyLevel > 3,  // 需要击败艾米且等级>3
        requirement: `需要：等级>3 且 击败艾米`,
        color: '#9b59b6'
      },
      {
        id: 'merchant_secret',
        name: '探索商人的秘密',
        desc: '等级 7-9 | 未解锁',
        area: 'merchant_secret',
        unlocked: false,
        color: '#f39c12'
      },
      {
        id: 'ancient_guardian',
        name: '探索古城守护者',
        desc: '等级 10-12 | 未解锁',
        area: 'ancient_guardian',
        unlocked: false,
        color: '#3498db'
      },
      {
        id: 'void_mist',
        name: '决战虚无之雾',
        desc: '最终决战 | 未解锁',
        area: 'void_mist',
        unlocked: false,
        color: '#e74c3c'
      }
    ]
    
    this.exploreMenu = {
      dungeons: dungeons,
      width: Math.min(500 * this.dpr, this.width * 0.9),
      height: Math.min(500 * this.dpr, this.height * 0.85)  // 增加高度用于测试按钮
    }
    
    console.log('[Town] 打开探索菜单', { partyLevel, amyDefeated })
  }
  
  /**
   * 处理探索菜单点击
   */
  _handleExploreMenuTap(tx, ty) {
    if (!this.exploreMenu) return
    
    const menu = this.exploreMenu
    const menuX = (this.width - menu.width) / 2
    const menuY = (this.height - menu.height) / 2
    const btnW = menu.width - 40 * this.dpr
    const btnH = 60 * this.dpr
    const startY = menuY + 60 * this.dpr
    
    // 检查关闭按钮
    const closeBtnX = menuX + menu.width - 50 * this.dpr
    const closeBtnY = menuY + 15 * this.dpr
    const closeBtnRadius = 20 * this.dpr
    const dist = Math.sqrt((tx - closeBtnX - 20 * this.dpr) ** 2 + (ty - closeBtnY - 20 * this.dpr) ** 2)
    if (dist <= closeBtnRadius) {
      this.exploreMenu = null
      return
    }
    
    // 检查测试解锁按钮（底部）
    const testBtnX = menuX + 20 * this.dpr
    const testBtnY = menuY + menu.height - 50 * this.dpr
    const testBtnW = menu.width - 40 * this.dpr
    const testBtnH = 35 * this.dpr
    if (this._isInRect(tx, ty, testBtnX, testBtnY, testBtnW, testBtnH)) {
      // 解锁所有副本并设置艾米已击败
      this.game.data.set('amyDefeated', true)
      console.log('[Town] 测试模式：解锁所有副本')
      this._addLog('[测试] 已解锁所有副本')
      this.exploreMenu = null
      this._openExploreMenu()  // 重新打开菜单刷新状态
      return
    }
    
    // 检查副本按钮
    for (let i = 0; i < menu.dungeons.length; i++) {
      const dungeon = menu.dungeons[i]
      const btnX = menuX + 20 * this.dpr
      const btnY = startY + i * (btnH + 10 * this.dpr)
      
      if (this._isInRect(tx, ty, btnX, btnY, btnW, btnH)) {
        if (dungeon.unlocked) {
          console.log(`[Town] 选择副本: ${dungeon.name}`)
          this.exploreMenu = null
          this.game.changeScene('field', { area: dungeon.area })
        } else {
          console.log(`[Town] 副本未解锁: ${dungeon.name}`)
          // 显示解锁条件
          if (dungeon.requirement) {
            this._addLog(`❌ ${dungeon.requirement}`)
          }
        }
        return
      }
    }
  }
  
  render(ctx) {
    this._renderBackground(ctx)
    this._renderNPCs(ctx)
    
    // 渲染主角和队友（使用field-scene验证过的渲染逻辑）
    this.movement.renderCharacters(ctx)
    
    // 渲染摇杆
    this.movement.renderJoystick(ctx)
    
    if (this.nearbyNPC && !this.dialogue && !this.equipmentPanel.active && !this.exploreMenu) {
      this._renderInteractionTip(ctx)
    }
    
    if (this.dialogue) {
      this._renderDialogue(ctx)
    }
    
    // 渲染装备面板
    this.equipmentPanel.render(ctx)
    
    // 渲染探索菜单
    if (this.exploreMenu) {
      this._renderExploreMenu(ctx)
    }
    
    // 渲染测试日志
    this._renderTestLogs(ctx)
  }
  
  _renderBackground(ctx) {
    const bgImage = this.game.assets.get('BG_TOWN')
    
    if (bgImage) {
      const scaleX = this.movement.mapWidth / bgImage.width
      const scaleY = this.movement.mapHeight / bgImage.height
      const scale = Math.max(scaleX, scaleY)
      
      const renderWidth = bgImage.width * scale
      const renderHeight = bgImage.height * scale
      
      ctx.drawImage(
        bgImage,
        -this.movement.cameraX, -this.movement.cameraY,
        renderWidth, renderHeight
      )
    } else {
      ctx.fillStyle = '#2d3436'
      ctx.fillRect(0, 0, this.width, this.height)
    }
  }
  
  _renderNPCs(ctx) {
    for (const npc of this.npcs) {
      const screenPos = this.movement.worldToScreen(npc.x, npc.y)
      
      if (screenPos.x < -100 || screenPos.x > this.width + 100 ||
          screenPos.y < -100 || screenPos.y > this.height + 100) {
        continue
      }
      
      if (this.nearbyNPC === npc) {
        ctx.beginPath()
        ctx.arc(screenPos.x, screenPos.y, npc.interactionRadius, 0, Math.PI * 2)
        ctx.fillStyle = `${npc.color}33`
        ctx.fill()
      }
      
      ctx.font = `${40 * this.dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(npc.sprite, screenPos.x, screenPos.y)
      
      ctx.font = `bold ${14 * this.dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 3
      ctx.strokeText(npc.name, screenPos.x, screenPos.y - 35 * this.dpr)
      ctx.fillText(npc.name, screenPos.x, screenPos.y - 35 * this.dpr)
    }
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
  
  /**
   * 渲染探索菜单
   */
  _renderExploreMenu(ctx) {
    const menu = this.exploreMenu
    if (!menu) return
    
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.fillRect(0, 0, this.width, this.height)
    
    // 菜单面板
    const menuX = (this.width - menu.width) / 2
    const menuY = (this.height - menu.height) / 2
    
    // 面板背景
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
    
    // 标题
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
    
    // 副本按钮
    const btnW = menu.width - 40 * this.dpr
    const btnH = 60 * this.dpr
    const startY = menuY + 60 * this.dpr
    
    for (let i = 0; i < menu.dungeons.length; i++) {
      const dungeon = menu.dungeons[i]
      const btnX = menuX + 20 * this.dpr
      const btnY = startY + i * (btnH + 10 * this.dpr)
      
      // 按钮背景
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
      
      // 边框
      ctx.strokeStyle = dungeon.unlocked ? dungeon.color : 'rgba(255, 255, 255, 0.2)'
      ctx.lineWidth = 2 * this.dpr
      ctx.stroke()
      
      // 副本名称
      ctx.font = `bold ${18 * this.dpr}px sans-serif`
      ctx.fillStyle = dungeon.unlocked ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'
      ctx.textAlign = 'left'
      ctx.fillText(dungeon.name, btnX + 15 * this.dpr, btnY + 25 * this.dpr)
      
      // 副本描述
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = dungeon.unlocked ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)'
      ctx.fillText(dungeon.desc, btnX + 15 * this.dpr, btnY + 45 * this.dpr)
      
      // 锁定图标
      if (!dungeon.unlocked) {
        ctx.font = `${24 * this.dpr}px sans-serif`
        ctx.textAlign = 'right'
        ctx.fillText('🔒', btnX + btnW - 15 * this.dpr, btnY + 38 * this.dpr)
      }
    }
    
    // 测试解锁按钮（底部）
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
  
  /**
   * 渲染测试日志
   */
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
  
  /**
   * 添加测试日志
   */
  _addLog(text) {
    this.testLogs.push({
      text: text,
      time: 3.0  // 显示3秒
    })
    
    // 最多保留5条日志
    if (this.testLogs.length > 5) {
      this.testLogs.shift()
    }
  }
  
  /**
   * 辅助方法：检测点是否在矩形内
   */
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
}
