/**
 * town-scene.js - 村庄探索场景（可移动大地图）
 */

import { charStateManager } from '../data/character-state.js'
import {
  JoystickController,
  PlayerMovementController,
  CameraController,
  FollowerSystem
} from '../utils/movement-controller.js'

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
    
    // 初始化移动控制器
    this.joystick = new JoystickController(this.dpr)
    this.playerMovement = new PlayerMovementController(this.dpr, {
      playerX: mapWidth / 2,
      playerY: mapHeight / 2,
      playerSpeed: 150 * this.dpr,
      playerDirection: 'right',
      facingLeft: true, // 图片朝左，初始朝右需要翻转
      mapWidth: mapWidth,
      mapHeight: mapHeight,
      imageFacesLeft: true // 图片朝左
    })
    
    this.camera = new CameraController(this.width, this.height, this.dpr, {
      mapWidth: mapWidth,
      mapHeight: mapHeight
    })
    
    this.followerSystem = new FollowerSystem(this.dpr)
    
    // 初始化角色状态
    const savedCharData = this.game.data.get('characterStates')
    charStateManager.init(savedCharData)
    
    // 主角
    this.mainCharacter = charStateManager.getAllCharacters()[0]
    
    // 初始化队友跟随系统
    this.followerSystem.init(
      this.playerMovement.playerX,
      this.playerMovement.playerY,
      true // 图片朝左
    )
    
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
    // 绑定摇杆输入
    this.joystick.bindInput(this.game)
    
    // 设置摇杆位置（屏幕左下角）
    this.joystick.setAreaY(this.height - 200 * this.dpr)
    
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
    this.joystick.unbindInput(this.game)
  }
  
  update(dt) {
    this.time += dt
    
    // 处理点击事件
    if (this.game.input.taps.length > 0) {
      const tap = this.game.input.consumeTap()
      if (tap) {
        // 对话框点击
        if (this.dialogue) {
          this._showNextDialogue()
          return
        }
        
        // 和附近NPC互动
        if (this.nearbyNPC) {
          this._interactWithNPC(this.nearbyNPC)
          return
        }
        
        // 尝试激活摇杆
        this.joystick.handleTap(tap)
      }
    }
    
    // 如果在对话中，不处理移动
    if (this.dialogue) return
    
    // 更新玩家移动
    this.playerMovement.update(dt, this.joystick)
    
    // 更新相机跟随
    this.camera.follow(this.playerMovement.playerX, this.playerMovement.playerY)
    
    // 更新队友跟随
    this.followerSystem.update(
      dt,
      this.playerMovement.playerX,
      this.playerMovement.playerY,
      this.playerMovement.facingLeft,
      this.playerMovement.isMoving,
      this.playerMovement.playerSpeed
    )
    
    // 检测附近的NPC
    this._checkNearbyNPC()
  }
  
  _checkNearbyNPC() {
    this.nearbyNPC = null
    
    for (const npc of this.npcs) {
      const dist = Math.sqrt(
        (this.playerMovement.playerX - npc.x) ** 2 +
        (this.playerMovement.playerY - npc.y) ** 2
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
    this._renderPlayer(ctx)
    this._renderJoystick(ctx)
    
    if (this.nearbyNPC && !this.dialogue) {
      this._renderInteractionTip(ctx)
    }
    
    if (this.dialogue) {
      this._renderDialogue(ctx)
    }
  }
  
  _renderBackground(ctx) {
    const bgImage = this.game.assets.get('BG_TOWN')
    
    if (bgImage) {
      const scaleX = this.playerMovement.mapWidth / bgImage.width
      const scaleY = this.playerMovement.mapHeight / bgImage.height
      const scale = Math.max(scaleX, scaleY)
      
      const renderWidth = bgImage.width * scale
      const renderHeight = bgImage.height * scale
      
      ctx.drawImage(
        bgImage,
        -this.camera.cameraX, -this.camera.cameraY,
        renderWidth, renderHeight
      )
    } else {
      ctx.fillStyle = '#2d3436'
      ctx.fillRect(0, 0, this.width, this.height)
    }
  }
  
  _renderNPCs(ctx) {
    for (const npc of this.npcs) {
      const screenPos = this.camera.worldToScreen(npc.x, npc.y)
      
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
  
  _renderPlayer(ctx) {
    // 渲染队友
    const followers = this.followerSystem.getFollowers()
    followers.forEach(follower => {
      this._renderCharacter(
        ctx,
        follower.character,
        follower.x,
        follower.y,
        follower.animFrame,
        follower.facingLeft,
        follower.isMoving
      )
    })
    
    // 渲染主角
    this._renderCharacter(
      ctx,
      this.mainCharacter,
      this.playerMovement.playerX,
      this.playerMovement.playerY,
      this.playerMovement.animFrame,
      this.playerMovement.facingLeft,
      this.playerMovement.isMoving
    )
  }
  
  _renderCharacter(ctx, character, x, y, animFrame, facingLeft, isMoving) {
    const screenPos = this.camera.worldToScreen(x, y)
    
    if (screenPos.x < -100 || screenPos.x > this.width + 100 ||
        screenPos.y < -100 || screenPos.y > this.height + 100) {
      return
    }
    
    const heroId = character.id || 'zhenbao'
    
    const frameType = isMoving ? 'WALK' : 'IDLE'
    const frameKey = `HERO_${heroId.toUpperCase()}_${frameType}_${animFrame}`
    let img = this.game.assets.get(frameKey)
    
    if (!img) {
      img = this.game.assets.get(`HERO_${heroId.toUpperCase()}`)
    }
    
    if (img) {
      const targetHeight = 60 * this.dpr
      const scale = targetHeight / img.height
      const targetWidth = img.width * scale
      
      ctx.save()
      
      if (facingLeft) {
        ctx.translate(screenPos.x, screenPos.y)
        ctx.scale(-1, 1)
        ctx.translate(-screenPos.x, -screenPos.y)
      }
      
      ctx.drawImage(
        img,
        screenPos.x - targetWidth / 2,
        screenPos.y - targetHeight / 2,
        targetWidth,
        targetHeight
      )
      
      ctx.restore()
    }
  }
  
  _renderJoystick(ctx) {
    const { x, y, r } = this.joystick.area
    
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = 2
    ctx.stroke()
    
    if (this.joystick.active) {
      const offset = this.joystick.getOffset()
      let handleX = this.joystick.currentX
      let handleY = this.joystick.currentY
      
      if (offset.dist > r) {
        handleX = x + (offset.dx / offset.dist) * r
        handleY = y + (offset.dy / offset.dist) * r
      }
      
      ctx.beginPath()
      ctx.arc(handleX, handleY, r * 0.4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, r * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.fill()
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
