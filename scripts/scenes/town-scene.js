/**
 * town-scene.js - 村庄探索场景（可移动大地图）
 */

import { HEROES } from '../data/heroes.js'
import { charStateManager } from '../data/character-state.js'

export class TownScene {
  constructor(game, data) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0
    
    // 地图尺寸（根据village.jpeg实际尺寸：1664x928）
    this.mapWidth = 1664 * this.dpr
    this.mapHeight = 928 * this.dpr
    
    // 相机位置
    this.cameraX = 0
    this.cameraY = 0
    
    // 玩家位置
    this.playerX = this.mapWidth / 2
    this.playerY = this.mapHeight / 2
    this.playerSpeed = 150 * this.dpr
    this.playerDirection = 'right'
    this.facingLeft = true // 初始朝右（图片朝左，需要翻转）
    
    // 动画系统
    this.animFrame = 0
    this.animTimer = 0
    this.isMoving = false
    this.frameDuration = 0.15
    
    // 摇杆控制
    this.joystick = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 }
    
    // 初始化角色状态
    const savedCharData = this.game.data.get('characterStates')
    charStateManager.init(savedCharData)
    
    // 主角
    this.mainCharacter = charStateManager.getAllCharacters()[0]
    
    // 队友跟随系统
    this.followers = []
    this.followerDistance = 35 * this.dpr
    this.playerHistory = []
    this.historyMaxLength = 90
    this.historyInterval = 3
    this.historyFrameCount = 0
    this._initFollowers()
    
    // NPC列表
    this.npcs = this._initNPCs()
    
    // 对话框
    this.dialogue = null
    this.dialogueQueue = []
    this.nearbyNPC = null // 附近的NPC
    this.currentDialogueNPC = null // 当前对话的NPC
    
    // 初始对话
    this.introShown = this.game.data.get('introShown')
  }
  
  _initNPCs() {
    // 村庄NPC定义
    return [
      {
        id: 'village_chief',
        name: '村长',
        x: this.mapWidth * 0.3,
        y: this.mapHeight * 0.4,
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
        x: this.mapWidth * 0.7,
        y: this.mapHeight * 0.3,
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
        x: this.mapWidth * 0.5,
        y: this.mapHeight * 0.6,
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
        x: this.mapWidth * 0.2,
        y: this.mapHeight * 0.7,
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
  
  _initFollowers() {
    // 获取所有解锁的角色（除了第一个主角）
    const allChars = charStateManager.getAllCharacters()
    for (let i = 1; i < allChars.length; i++) {
      this.followers.push({
        character: allChars[i],
        x: this.playerX,
        y: this.playerY,
        isMoving: false,
        animFrame: 0,
        animTimer: 0
      })
    }
    console.log(`[Town] 初始化了 ${this.followers.length} 个跟随队友`)
  }
  
  init() {
    // 初始化相机位置
    this._updateCamera()
    
    // 初始化摇杆区域
    this.joystickArea = {
      x: 50 * this.dpr,
      y: this.height - 200 * this.dpr,
      r: 80 * this.dpr
    }
    
    // 注册触摸事件监听
    this._onTouchMove = (e) => {
      if (this.joystick.active && e.touches && Array.isArray(e.touches)) {
        for (const t of e.touches) {
          this.joystick.currentX = t.clientX * this.dpr
          this.joystick.currentY = t.clientY * this.dpr
        }
      }
    }
    
    this._onTouchEnd = (e) => {
      this.joystick.active = false
    }
    
    this.game.input.onMove(this._onTouchMove)
    this.game.input.onEnd(this._onTouchEnd)
    
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
    // 清理事件监听
    this.game.input.offMove(this._onTouchMove)
    this.game.input.offEnd(this._onTouchEnd)
  }
  
  update(dt) {
    this.time += dt
    
    // 处理点击
    if (this.game.input.taps.length > 0) {
      const tap = this.game.input.consumeTap()
      if (tap) {
        // 对话框点击 - 优先处理
        if (this.dialogue) {
          this._showNextDialogue()
          return
        }
        
        // 和附近NPC互动
        if (this.nearbyNPC) {
          this._interactWithNPC(this.nearbyNPC)
          return
        }
        
        // 摇杆区域外 - 尝试激活摇杆
        const jx = tap.x
        const jy = tap.y
        const distToJoystick = Math.sqrt(
          (jx - this.joystickArea.x) ** 2 + (jy - this.joystickArea.y) ** 2
        )
        
        if (distToJoystick <= this.joystickArea.r) {
          // 点击在摇杆区域内
          this.joystick.active = true
          this.joystick.startX = jx
          this.joystick.startY = jy
          this.joystick.currentX = jx
          this.joystick.currentY = jy
        }
      }
    }
    
    // 如果在对话中，不处理移动
    if (this.dialogue) return
    
    // 摇杆控制移动
    const wasMoving = this.isMoving
    this.isMoving = false
    
    if (this.joystick.active) {
      const dx = this.joystick.currentX - this.joystick.startX
      const dy = this.joystick.currentY - this.joystick.startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      if (dist > 5 * this.dpr) {
        if (Math.abs(dx) > Math.abs(dy)) {
          this.playerDirection = dx > 0 ? 'right' : 'left'
          // 如果图片朝左，逻辑需要反过来：
          // - 向右移动(dx>0)需要翻转(facingLeft=true)，让图片朝右
          // - 向左移动(dx<0)不需要翻转(facingLeft=false)，图片朝左
          this.facingLeft = dx > 0
        } else {
          this.playerDirection = dy > 0 ? 'down' : 'up'
        }
      }
      
      if (dist > 10 * this.dpr) {
        this.isMoving = true
        const moveX = (dx / dist) * this.playerSpeed * dt
        const moveY = (dy / dist) * this.playerSpeed * dt
        
        this.playerX += moveX
        this.playerY += moveY
        
        // 边界限制
        const margin = 50 * this.dpr
        this.playerX = Math.max(margin, Math.min(this.mapWidth - margin, this.playerX))
        this.playerY = Math.max(margin, Math.min(this.mapHeight - margin, this.playerY))
        
        this._updateCamera()
      }
    }
    
    // 更新队友跟随
    this._updateFollowers(dt)
    
    // 检测从移动切换到idle
    if (wasMoving && !this.isMoving) {
      this.animFrame = 0
      this.animTimer = 0
    }
    
    // 动画帧更新
    this.animTimer += dt
    const currentFrameDuration = this.isMoving ? this.frameDuration : this.frameDuration * 3
    
    if (this.animTimer >= currentFrameDuration) {
      this.animTimer = 0
      if (this.isMoving) {
        this.animFrame = (this.animFrame + 1) % 8
      } else {
        this.animFrame = (this.animFrame + 1) % 2
      }
    }
    
    // 检测附近的NPC
    this._checkNearbyNPC()
  }
  
  _updateCamera() {
    // 相机跟随玩家
    this.cameraX = this.playerX - this.width / 2
    this.cameraY = this.playerY - this.height / 2
    
    // 相机边界限制
    this.cameraX = Math.max(0, Math.min(this.mapWidth - this.width, this.cameraX))
    this.cameraY = Math.max(0, Math.min(this.mapHeight - this.height, this.cameraY))
  }
  
  _updateFollowers(dt) {
    // 记录主角移动历史
    this.historyFrameCount++
    if (this.historyFrameCount >= this.historyInterval) {
      this.historyFrameCount = 0
      this.playerHistory.unshift({
        x: this.playerX,
        y: this.playerY,
        facingLeft: this.facingLeft
      })
      if (this.playerHistory.length > this.historyMaxLength) {
        this.playerHistory.pop()
      }
    }
    
    // 更新每个队友
    this.followers.forEach((follower, i) => {
      const historyIndex = Math.min((i + 1) * 10, this.playerHistory.length - 1)
      
      if (historyIndex >= 0 && this.playerHistory[historyIndex]) {
        const targetPos = this.playerHistory[historyIndex]
        const dx = targetPos.x - follower.x
        const dy = targetPos.y - follower.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        
        if (dist > 5 * this.dpr) {
          const speed = this.playerSpeed * 0.95
          follower.x += (dx / dist) * speed * dt
          follower.y += (dy / dist) * speed * dt
          follower.isMoving = true
          follower.facingLeft = targetPos.facingLeft
        } else {
          follower.isMoving = false
        }
      }
      
      // 更新队友动画
      if (!this.isMoving) {
        const wasMoving = follower.isMoving
        follower.isMoving = false
        if (wasMoving && !follower.isMoving) {
          follower.animFrame = 0
          follower.animTimer = 0
        }
      }
      
      follower.animTimer += dt
      const frameDuration = this.isMoving ? this.frameDuration : this.frameDuration * 3
      if (follower.animTimer >= frameDuration) {
        follower.animTimer = 0
        if (this.isMoving) {
          follower.animFrame = (follower.animFrame + 1) % 8
        } else {
          follower.animFrame = (follower.animFrame + 1) % 2
        }
      }
    })
  }
  
  _checkNearbyNPC() {
    this.nearbyNPC = null
    
    for (const npc of this.npcs) {
      const dist = Math.sqrt((this.playerX - npc.x) ** 2 + (this.playerY - npc.y) ** 2)
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
      
      // 检查是否有特殊动作
      if (item.action) {
        switch (item.action) {
          case 'open_explore_menu':
            // 进入野外探索
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
      // 对话结束
      this.dialogue = null
      this.currentDialogueNPC = null
    }
  }
  
  render(ctx) {
    // 渲染背景地图
    this._renderBackground(ctx)
    
    // 渲染NPC
    this._renderNPCs(ctx)
    
    // 渲染主角和队友
    this._renderPlayer(ctx)
    
    // 渲染摇杆
    this._renderJoystick(ctx)
    
    // 渲染NPC提示
    if (this.nearbyNPC && !this.dialogue) {
      this._renderInteractionTip(ctx)
    }
    
    // 渲染对话框
    if (this.dialogue) {
      this._renderDialogue(ctx)
    }
  }
  
  _renderBackground(ctx) {
    const bgImage = this.game.assets.get('BG_TOWN')
    
    if (bgImage) {
      // 保持原始比例渲染地图
      // 计算缩放比例以适应地图尺寸
      const scaleX = this.mapWidth / bgImage.width
      const scaleY = this.mapHeight / bgImage.height
      const scale = Math.max(scaleX, scaleY)
      
      const renderWidth = bgImage.width * scale
      const renderHeight = bgImage.height * scale
      
      // 渲染可见部分
      ctx.drawImage(
        bgImage,
        -this.cameraX, -this.cameraY,
        renderWidth, renderHeight
      )
    } else {
      // 备用背景
      ctx.fillStyle = '#2d3436'
      ctx.fillRect(0, 0, this.width, this.height)
    }
  }
  
  _renderNPCs(ctx) {
    for (const npc of this.npcs) {
      const screenX = npc.x - this.cameraX
      const screenY = npc.y - this.cameraY
      
      // 只渲染可见的NPC
      if (screenX < -100 || screenX > this.width + 100 ||
          screenY < -100 || screenY > this.height + 100) {
        continue
      }
      
      // NPC光圈
      if (this.nearbyNPC === npc) {
        ctx.beginPath()
        ctx.arc(screenX, screenY, npc.interactionRadius, 0, Math.PI * 2)
        ctx.fillStyle = `${npc.color}33`
        ctx.fill()
      }
      
      // NPC图标
      ctx.font = `${40 * this.dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(npc.sprite, screenX, screenY)
      
      // NPC名称
      ctx.font = `bold ${14 * this.dpr}px sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 3
      ctx.strokeText(npc.name, screenX, screenY - 35 * this.dpr)
      ctx.fillText(npc.name, screenX, screenY - 35 * this.dpr)
    }
  }
  
  _renderPlayer(ctx) {
    // 渲染队友
    this.followers.forEach((follower, i) => {
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
      this.playerX,
      this.playerY,
      this.animFrame,
      this.facingLeft,
      this.isMoving
    )
  }
  
  _renderCharacter(ctx, character, x, y, animFrame, facingLeft, isMoving) {
    const screenX = x - this.cameraX
    const screenY = y - this.cameraY
    
    // 只渲染可见的角色
    if (screenX < -100 || screenX > this.width + 100 ||
        screenY < -100 || screenY > this.height + 100) {
      return
    }
    
    const heroId = character.id || 'zhenbao'
    
    // 获取动画帧
    const frameType = isMoving ? 'WALK' : 'IDLE'
    const frameKey = `HERO_${heroId.toUpperCase()}_${frameType}_${animFrame}`
    let img = this.game.assets.get(frameKey)
    
    // 如果没有动画帧，使用静态立绘
    if (!img) {
      img = this.game.assets.get(`HERO_${heroId.toUpperCase()}`)
    }
    
    if (img) {
      const targetHeight = 60 * this.dpr
      const scale = targetHeight / img.height
      const targetWidth = img.width * scale
      
      ctx.save()
      
      if (facingLeft) {
        ctx.translate(screenX, screenY)
        ctx.scale(-1, 1)
        ctx.translate(-screenX, -screenY)
      }
      
      ctx.drawImage(
        img,
        screenX - targetWidth / 2,
        screenY - targetHeight / 2,
        targetWidth,
        targetHeight
      )
      
      ctx.restore()
    }
  }
  
  _renderJoystick(ctx) {
    const { x, y, r } = this.joystickArea
    
    // 摇杆底座
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 摇杆手柄
    if (this.joystick.active) {
      let handleX = this.joystick.currentX
      let handleY = this.joystick.currentY
      
      // 限制手柄在底座内
      const dx = handleX - x
      const dy = handleY - y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > r) {
        handleX = x + (dx / dist) * r
        handleY = y + (dy / dist) * r
      }
      
      ctx.beginPath()
      ctx.arc(handleX, handleY, r * 0.4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.fill()
    } else {
      // 未激活时显示中心点
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
    
    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'
    ctx.beginPath()
    this._roundRect(ctx, 20 * this.dpr, y, this.width - 40 * this.dpr, boxH, 10 * this.dpr)
    ctx.fill()
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 名字
    ctx.font = `bold ${20 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ff9f43'
    ctx.textAlign = 'left'
    ctx.fillText(this.dialogue.name, 30 * this.dpr, y + 30 * this.dpr)
    
    // 文字
    ctx.font = `${18 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(this.dialogue.text, 30 * this.dpr, y + 60 * this.dpr)
    
    // 提示
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
