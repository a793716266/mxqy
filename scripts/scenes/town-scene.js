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
    
    // 装备面板
    this.equipmentPanel = new EquipmentPanel(game, charStateManager.getAllCharacters()[0])
    
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
        y: mapHeight * 0.3,
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
        x: mapWidth * 0.5,
        y: mapHeight * 0.6,
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
            this.game.changeScene('field', { area: 'grassland' })
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
  
  render(ctx) {
    this._renderBackground(ctx)
    this._renderNPCs(ctx)
    
    // 渲染主角和队友（使用field-scene验证过的渲染逻辑）
    this.movement.renderCharacters(ctx)
    
    // 渲染摇杆
    this.movement.renderJoystick(ctx)
    
    if (this.nearbyNPC && !this.dialogue && !this.equipmentPanel.active) {
      this._renderInteractionTip(ctx)
    }
    
    if (this.dialogue) {
      this._renderDialogue(ctx)
    }
    
    // 渲染装备面板
    this.equipmentPanel.render(ctx)
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
