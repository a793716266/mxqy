/**
 * field-scene.js - 野外探索场景（可移动大地图）
 */

import { ENEMIES_CH1 } from '../data/enemies.js'
import { HEROES } from '../data/heroes.js'
import { getMapCollisions } from '../data/map_collisions.js'
import { charStateManager } from '../data/character-state.js'
import { CharacterInfoPanel } from '../ui/character-info-panel.js'

export class FieldScene {
  constructor(game, data) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0
    
    // 区域信息
    this.areaId = data?.area || 'grassland'
    this.areaInfo = this._getAreaInfo()
    
    // 地图尺寸（大地图）
    this.mapWidth = 2000 * this.dpr // 地图宽度
    this.mapHeight = 1500 * this.dpr // 地图高度
    
    // 相机位置（相对于地图）
    this.cameraX = 0
    this.cameraY = 0
    
    // 玩家位置（相对于地图）
    this.playerX = this.mapWidth / 2
    this.playerY = this.mapHeight / 2
    this.playerSpeed = 150 * this.dpr
    this.playerDirection = 'down'
    this.facingLeft = false // 角色是否朝左（用于翻转）
    
    // 动画系统
    this.animFrame = 0
    this.animTimer = 0
    this.isMoving = false
    this.frameDuration = 0.15 // 每帧150ms
    
    // 摇杆控制
    this.joystick = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 }
    
    // 初始化角色状态（必须在队伍初始化之前）
    const savedCharData = this.game.data.get('characterStates')
    charStateManager.init(savedCharData)
    
    // 队伍（使用角色状态管理中的数据）
    this.party = this._initParty()
    
    // 获取第一个角色（主角）
    this.currentCharacterIndex = 0 // 当前控制的角色索引
    this.mainCharacter = charStateManager.getAllCharacters()[this.currentCharacterIndex]

    // 角色信息面板
    if (this.mainCharacter) {
      this.charInfoPanel = new CharacterInfoPanel(game, this.mainCharacter)
    }

    // 角色切换提示
    this.showSwitchTip = false
    this.switchTipTimer = 0

    // 地图怪物（尝试恢复保存的状态）
    const savedMonsters = this.game.data.get('fieldMonsters')
    if (savedMonsters && Array.isArray(savedMonsters) && savedMonsters.length > 0) {
      this.mapMonsters = savedMonsters
      console.log(`[Field] 恢复了 ${this.mapMonsters.filter(m => m.alive).length} 只怪物`)
    } else {
      this.mapMonsters = this._generateMonsters()
    }

    // UI
    this.showMinimap = true
    this.showMenu = false

    // 地图元素（宝箱、资源点）
    this.mapObjects = this._generateMapObjects()
    
    // 地图碰撞数据
    this.obstacles = getMapCollisions(this.areaId)
    console.log(`[Field] 加载了 ${this.obstacles.length} 个障碍物`)
  }
  
  _getAreaInfo() {
    const areas = {
      grassland: {
        name: '阳光草原',
        fieldBg: 'FIELD_GRASSLAND', // 野外探索地图
        battleBg: 'BG_GRASSLAND', // 战斗背景
        enemies: ['wild_cat', 'slime_cat', 'shadow_mouse'],
        bossEnemy: null,
        color: '#7bed9f'
      },
      forest: {
        name: '迷雾森林',
        fieldBg: 'FIELD_FOREST',
        battleBg: 'BG_FOREST',
        enemies: ['slime_cat', 'shadow_mouse', 'wild_cat'],
        bossEnemy: 'stray_leader',
        color: '#2ed573'
      },
      cave: {
        name: '暗影洞穴',
        fieldBg: 'FIELD_CAVE',
        battleBg: 'BG_CAVE',
        enemies: ['shadow_mouse', 'slime_cat', 'wild_cat'],
        bossEnemy: 'dark_cat_king',
        color: '#636e72'
      }
    }
    return areas[this.areaId] || areas.grassland
  }
  
  _initParty() {
    // 使用角色状态管理中的数据
    const allChars = charStateManager.getAllCharacters()
    
    if (allChars.length === 0) {
      console.warn('[Field] 没有可用的角色状态')
      return []
    }
    
    // 将角色状态转换为战斗用的角色对象
    return allChars.map(charState => {
      return {
        id: charState.id,
        name: charState.name,
        title: charState.title,
        role: charState.role,
        avatar: charState.avatar,
        skills: charState.skills,
        
        // 使用成长后的属性
        maxHp: charState.maxHp,
        maxMp: charState.maxMp,
        atk: charState.atk,
        def: charState.def,
        spd: charState.spd,
        
        // 当前状态
        hp: charState.hp,
        mp: charState.mp,
        buffs: charState.buffs || [],
        
        // 等级信息（用于显示）
        level: charState.level,
        exp: charState.exp
      }
    })
  }
  
  _generateMapObjects() {
    const objects = []
    // 随机生成宝箱和资源点（分布在整个地图上）
    const margin = 100 * this.dpr
    for (let i = 0; i < 5; i++) {
      objects.push({
        type: 'chest',
        x: Math.random() * (this.mapWidth - margin * 2) + margin,
        y: Math.random() * (this.mapHeight - margin * 2) + margin,
        collected: false
      })
    }
    return objects
  }

  _generateMonsters() {
    const monsters = []
    const maxMonsters = 20
    const margin = 150 * this.dpr // 边缘留空
    const minDistance = 120 * this.dpr // 怪物之间的最小距离

    for (let i = 0; i < maxMonsters; i++) {
      let attempts = 0
      let validPosition = false
      let x, y

      // 尝试找到一个有效的位置
      while (!validPosition && attempts < 50) {
        x = Math.random() * (this.mapWidth - margin * 2) + margin
        y = Math.random() * (this.mapHeight - margin * 2) + margin

        // 检查与其他怪物的距离
        validPosition = true
        for (const m of monsters) {
          const dist = Math.sqrt((x - m.x) ** 2 + (y - m.y) ** 2)
          if (dist < minDistance) {
            validPosition = false
            break
          }
        }

        // 检查与玩家初始位置的距离（不要在出生点附近）
        const distToPlayer = Math.sqrt(
          (x - this.mapWidth / 2) ** 2 + (y - this.mapHeight / 2) ** 2
        )
        if (distToPlayer < 200 * this.dpr) {
          validPosition = false
        }

        attempts++
      }

      if (validPosition) {
        // 随机选择敌人类型
        const enemyId = this.areaInfo.enemies[Math.floor(Math.random() * this.areaInfo.enemies.length)]
        const enemyData = ENEMIES_CH1[enemyId]

        monsters.push({
          id: `monster_${i}`,
          enemyId: enemyId,
          x: x,
          y: y,
          name: enemyData?.name || '未知怪物',
          isBoss: enemyData?.isBoss || false,
          isElite: enemyData?.isElite || false,
          alive: true,
          // 怪物动画
          bobOffset: Math.random() * Math.PI * 2, // 随机浮动偏移
          bobSpeed: 2 + Math.random(), // 随机浮动速度
          // 怪物巡逻移动
          homeX: x, // 出生点（巡逻中心）
          homeY: y,
          patrolRadius: (80 + Math.random() * 40) * this.dpr, // 巡逻半径 80-120
          moveAngle: Math.random() * Math.PI * 2, // 移动方向
          moveSpeed: (20 + Math.random() * 10) * this.dpr, // 移动速度 20-30
          moveTimer: 0, // 移动计时器
          pauseTimer: 0, // 暂停计时器
          isMoving: Math.random() > 0.3 // 70%概率初始移动
        })
      }
    }

    console.log(`[Field] 生成了 ${monsters.length} 只怪物`)
    return monsters
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
  }
  
  destroy() {
    // 保存怪物状态
    this.game.data.set('fieldMonsters', this.mapMonsters)
    
    // 保存角色状态
    const charData = charStateManager.serialize()
    this.game.data.set('characterStates', charData)

    // 清理事件监听
    this.game.input.offMove(this._onTouchMove)
    this.game.input.offEnd(this._onTouchEnd)
  }
  
  update(dt) {
    this.time += dt

    // 更新怪物移动
    this._updateMonsters(dt)

    // 摇杆控制移动
    const wasMoving = this.isMoving
    this.isMoving = false

    if (this.joystick.active) {
      const dx = this.joystick.currentX - this.joystick.startX
      const dy = this.joystick.currentY - this.joystick.startY
      const dist = Math.sqrt(dx * dx + dy * dy)

      // 立即更新方向（无论是否移动）
      if (dist > 5 * this.dpr) {
        // 根据水平移动分量更新朝向
        if (Math.abs(dx) > Math.abs(dy)) {
          this.playerDirection = dx > 0 ? 'right' : 'left'
          this.facingLeft = dx < 0 // 向左移动时 facingLeft 为 true
        } else {
          this.playerDirection = dy > 0 ? 'down' : 'up'
          // 上下移动时不改变水平朝向
        }
      }

      if (dist > 10 * this.dpr) {
        this.isMoving = true
        const moveX = (dx / dist) * this.playerSpeed * dt
        const moveY = (dy / dist) * this.playerSpeed * dt

        // 保存旧位置（用于碰撞回退）
        const oldX = this.playerX
        const oldY = this.playerY

        this.playerX += moveX
        this.playerY += moveY

        // 边界限制（地图边界）
        const margin = 50 * this.dpr
        this.playerX = Math.max(margin, Math.min(this.mapWidth - margin, this.playerX))
        this.playerY = Math.max(margin, Math.min(this.mapHeight - margin, this.playerY))

        // 检查与障碍物的碰撞
        if (this._checkObstacleCollision()) {
          // 碰撞了障碍物，退回原位置
          this.playerX = oldX
          this.playerY = oldY
        }

        // 更新相机位置（跟随玩家）
        this._updateCamera()

        // 检查与怪物的碰撞
        this._checkMonsterCollision()
      }
    }

    // 检测从移动切换到idle，重置动画帧（避免使用walk_7等无效帧）
    if (wasMoving && !this.isMoving) {
      this.animFrame = 0
      this.animTimer = 0
    }

    // 动画帧更新
    this.animTimer += dt
    const currentFrameDuration = this.isMoving ? this.frameDuration : this.frameDuration * 3 // 待机动画更慢

    if (this.animTimer >= currentFrameDuration) {
      this.animTimer = 0

      if (this.isMoving) {
        // 走路动画：所有角色都是8帧
        this.animFrame = (this.animFrame + 1) % 8
      } else {
        // 待机动画：2帧循环
        this.animFrame = (this.animFrame + 1) % 2
      }
    }

    // 点击处理
    if (this.game.input.taps.length > 0) {
      const tap = this.game.input.consumeTap()
      if (tap) {
        this._handleTap(tap)
      }
    }

    // 检查并补充怪物
    this._checkAndRespawnMonsters()

    // 更新切换提示计时器
    if (this.showSwitchTip) {
      this.switchTipTimer -= dt
      if (this.switchTipTimer <= 0) {
        this.showSwitchTip = false
      }
    }
  }

  _updateMonsters(dt) {
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return

    for (const monster of this.mapMonsters) {
      if (!monster.alive) continue

      // 暂停计时器
      if (monster.pauseTimer > 0) {
        monster.pauseTimer -= dt
        continue
      }

      // 移动计时器
      monster.moveTimer += dt

      // 每隔一段时间改变方向或暂停
      if (monster.moveTimer > 2 + Math.random() * 3) { // 2-5秒改变一次
        monster.moveTimer = 0
        if (Math.random() > 0.4) { // 60%概率改变方向
          monster.moveAngle = Math.random() * Math.PI * 2
          monster.isMoving = true
        } else { // 40%概率暂停
          monster.isMoving = false
          monster.pauseTimer = 1 + Math.random() * 2 // 暂停1-3秒
        }
      }

      // 移动怪物
      if (monster.isMoving) {
        const moveX = Math.cos(monster.moveAngle) * monster.moveSpeed * dt
        const moveY = Math.sin(monster.moveAngle) * monster.moveSpeed * dt

        const newX = monster.x + moveX
        const newY = monster.y + moveY

        // 检查是否在巡逻范围内
        const distFromHome = Math.sqrt(
          (newX - monster.homeX) ** 2 + (newY - monster.homeY) ** 2
        )

        if (distFromHome <= monster.patrolRadius) {
          // 在范围内，正常移动
          monster.x = newX
          monster.y = newY
        } else {
          // 超出范围，改变方向朝向出生点
          monster.moveAngle = Math.atan2(
            monster.homeY - monster.y,
            monster.homeX - monster.x
          )
          monster.isMoving = true
        }
      }
    }
  }

  _checkAndRespawnMonsters() {
    const aliveCount = this.mapMonsters.filter(m => m.alive).length
    const minMonsters = 10 // 最少保留10只怪物

    if (aliveCount < minMonsters) {
      this._respawnMonsters(minMonsters - aliveCount)
    }
  }

  _respawnMonsters(count) {
    const margin = 150 * this.dpr
    const minDistance = 120 * this.dpr

    for (let i = 0; i < count; i++) {
      let attempts = 0
      let validPosition = false
      let x, y

      while (!validPosition && attempts < 50) {
        x = Math.random() * (this.mapWidth - margin * 2) + margin
        y = Math.random() * (this.mapHeight - margin * 2) + margin

        validPosition = true

        // 检查与现有怪物的距离
        for (const m of this.mapMonsters) {
          if (!m.alive) continue
          const dist = Math.sqrt((x - m.x) ** 2 + (y - m.y) ** 2)
          if (dist < minDistance) {
            validPosition = false
            break
          }
        }

        // 检查与玩家的距离
        const distToPlayer = Math.sqrt(
          (x - this.playerX) ** 2 + (y - this.playerY) ** 2
        )
        if (distToPlayer < 300 * this.dpr) { // 不要在玩家视野内刷新
          validPosition = false
        }

        attempts++
      }

      if (validPosition) {
        const enemyId = this.areaInfo.enemies[Math.floor(Math.random() * this.areaInfo.enemies.length)]
        const enemyData = ENEMIES_CH1[enemyId]

        this.mapMonsters.push({
          id: `monster_${Date.now()}_${i}`,
          enemyId: enemyId,
          x: x,
          y: y,
          name: enemyData?.name || '未知怪物',
          isBoss: enemyData?.isBoss || false,
          isElite: enemyData?.isElite || false,
          alive: true,
          bobOffset: Math.random() * Math.PI * 2,
          bobSpeed: 2 + Math.random(),
          // 怪物巡逻移动
          homeX: x,
          homeY: y,
          patrolRadius: (80 + Math.random() * 40) * this.dpr,
          moveAngle: Math.random() * Math.PI * 2,
          moveSpeed: (20 + Math.random() * 10) * this.dpr,
          moveTimer: 0,
          pauseTimer: 0,
          isMoving: Math.random() > 0.3
        })
      }
    }

    console.log(`[Field] 补充了 ${count} 只怪物`)

    // 保存怪物状态
    this.game.data.set('fieldMonsters', this.mapMonsters)
  }
  
  _updateCamera() {
    // 相机跟随玩家（平滑跟随）
    const targetCameraX = this.playerX - this.width / 2
    const targetCameraY = this.playerY - this.height / 2
    
    // 限制相机在地图范围内
    this.cameraX = Math.max(0, Math.min(this.mapWidth - this.width, targetCameraX))
    this.cameraY = Math.max(0, Math.min(this.mapHeight - this.height, targetCameraY))
  }
  
  _handleTap(tap) {
    // 如果详细信息面板打开，检查关闭按钮
    if (this.charInfoPanel && this.charInfoPanel.visible && this.charDetailBounds) {
      const closeBtn = this.charDetailBounds.closeBtn
      if (tap.x >= closeBtn.x && tap.x <= closeBtn.x + closeBtn.width &&
          tap.y >= closeBtn.y && tap.y <= closeBtn.y + closeBtn.height) {
        this.charInfoPanel.hide()
        return
      }
      
      // 点击面板外部也关闭
      const panel = this.charDetailBounds
      if (tap.x < panel.x || tap.x > panel.x + panel.width ||
          tap.y < panel.y || tap.y > panel.y + panel.height) {
        this.charInfoPanel.hide()
        return
      }
      
      return // 面板打开时不响应其他点击
    }
    
    // 角色信息卡片点击（切换角色或打开详情）
    if (this.charInfoCardBounds) {
      const card = this.charInfoCardBounds
      if (tap.x >= card.x && tap.x <= card.x + card.width &&
          tap.y >= card.y && tap.y <= card.y + card.height) {
        // 检查是否点击了切换按钮区域（右侧部分）
        const isSwitchArea = tap.x > card.x + card.width - 40 * this.dpr
        if (isSwitchArea) {
          // 切换角色
          this._switchCharacter()
          return
        } else {
          // 打开详情面板
          if (this.charInfoPanel) {
            this.charInfoPanel.show()
            return
          }
        }
      }
    }
    
    // 返回按钮
    const backBtn = { x: this.width - 50 * this.dpr, y: 20 * this.dpr, w: 40 * this.dpr, h: 40 * this.dpr }
    if (tap.x >= backBtn.x && tap.x <= backBtn.x + backBtn.w &&
        tap.y >= backBtn.y && tap.y <= backBtn.y + backBtn.h) {
      this.game.changeScene('town')
      return
    }
    
    // 摇杆区域
    const ja = this.joystickArea
    const dist = Math.sqrt((tap.x - ja.x) ** 2 + (tap.y - ja.y) ** 2)
    if (dist <= ja.r * 1.5) {
      // 开始摇杆控制
      this.joystick.active = true
      this.joystick.startX = tap.x
      this.joystick.startY = tap.y
      this.joystick.currentX = tap.x
      this.joystick.currentY = tap.y
      return
    }
    
    // 检查地图对象（安全检查）
    if (!this.mapObjects || !Array.isArray(this.mapObjects)) return
    
    for (const obj of this.mapObjects) {
      if (obj.collected) continue
      
      // 将点击位置转换为地图坐标
      const mapTapX = tap.x + this.cameraX
      const mapTapY = tap.y + this.cameraY
      const dist = Math.sqrt((mapTapX - obj.x) ** 2 + (mapTapY - obj.y) ** 2)
      
      if (dist < 50 * this.dpr) {
        this._collectObject(obj)
        return
      }
    }
  }
  
  _collectObject(obj) {
    obj.collected = true
    const gold = 10 + Math.floor(Math.random() * 20)
    this.game.data.set('gold', (this.game.data.get('gold') || 100) + gold)
    console.log(`[Field] 收集宝箱获得 ${gold} 金币`)
  }

  /**
   * 切换角色
   */
  _switchCharacter() {
    const allChars = charStateManager.getAllCharacters()
    if (allChars.length <= 1) {
      console.log('[Field] 只有一个角色，无法切换')
      return
    }

    // 切换到下一个角色
    this.currentCharacterIndex = (this.currentCharacterIndex + 1) % allChars.length
    this.mainCharacter = allChars[this.currentCharacterIndex]

    // 更新角色信息面板
    if (this.charInfoPanel) {
      this.charInfoPanel.character = this.mainCharacter
    }

    // 显示切换提示
    this.showSwitchTip = true
    this.switchTipTimer = 1.5 // 显示1.5秒

    console.log(`[Field] 切换到角色: ${this.mainCharacter.name}`)
  }

  _checkObstacleCollision() {
    if (!this.obstacles || this.obstacles.length === 0) return false

    const playerRadius = 25 * this.dpr // 玩家碰撞半径

    for (const obstacle of this.obstacles) {
      if (obstacle.type === 'rect') {
        // 矩形碰撞检测
        const rect = {
          x: obstacle.x * this.dpr,
          y: obstacle.y * this.dpr,
          width: obstacle.width * this.dpr,
          height: obstacle.height * this.dpr
        }

        // 找到矩形上离玩家最近的点
        const closestX = Math.max(rect.x, Math.min(this.playerX, rect.x + rect.width))
        const closestY = Math.max(rect.y, Math.min(this.playerY, rect.y + rect.height))

        // 计算距离
        const distX = this.playerX - closestX
        const distY = this.playerY - closestY
        const distance = Math.sqrt(distX * distX + distY * distY)

        if (distance < playerRadius) {
          return true // 碰撞了
        }
      } else if (obstacle.type === 'circle') {
        // 圆形碰撞检测
        const circle = {
          x: obstacle.x * this.dpr,
          y: obstacle.y * this.dpr,
          radius: obstacle.radius * this.dpr
        }

        const dist = Math.sqrt(
          (this.playerX - circle.x) ** 2 + (this.playerY - circle.y) ** 2
        )

        if (dist < playerRadius + circle.radius) {
          return true // 碰撞了
        }
      }
    }

    return false // 没有碰撞
  }

  _checkMonsterCollision() {
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return

    const playerRadius = 30 * this.dpr
    const monsterRadius = 35 * this.dpr

    for (const monster of this.mapMonsters) {
      if (!monster.alive) continue

      const dist = Math.sqrt(
        (this.playerX - monster.x) ** 2 + (this.playerY - monster.y) ** 2
      )

      // 碰撞检测
      if (dist < playerRadius + monsterRadius) {
        this._triggerBattle(monster)
        break
      }
    }
  }

  _triggerBattle(monster) {
    const enemy = ENEMIES_CH1[monster.enemyId]
    if (!enemy) {
      console.error(`[Field] 敌人数据不存在: ${monster.enemyId}`)
      return
    }

    console.log(`[Field] 遭遇怪物: ${monster.name}`, enemy)

    // 标记怪物为已战斗
    monster.alive = false

    // 保存怪物状态
    this.game.data.set('fieldMonsters', this.mapMonsters)

    // 保存队伍状态
    this.game.data.set('party', this.party)

    // 进入战斗
    this.game.changeScene('battle', {
      party: this.party,
      enemy: enemy,
      bg: this.areaInfo.battleBg,
      nodeId: this.areaId,
      monsterId: monster.id
    })
  }
  
  render(ctx) {
    // 绘制地图（使用相机偏移）
    const bgImage = this.game.assets.get(this.areaInfo.fieldBg)
    if (bgImage) {
      // 只绘制地图的可视部分
      ctx.drawImage(
        bgImage,
        this.cameraX / this.dpr, this.cameraY / this.dpr, // 源图起始位置（逻辑像素）
        this.width / this.dpr, this.height / this.dpr, // 源图尺寸（逻辑像素）
        0, 0, // 目标位置
        this.width, this.height // 目标尺寸
      )
    } else {
      ctx.fillStyle = this.areaInfo.color
      ctx.fillRect(0, 0, this.width, this.height)
    }
    
    // 地图对象（宝箱等）
    this._renderMapObjects(ctx)

    // 地图怪物
    this._renderMonsters(ctx)

    // 玩家角色
    this._renderPlayer(ctx)
    
    // 顶部UI
    this._renderTopUI(ctx)
    
    // 摇杆
    this._renderJoystick(ctx)
    
    // 返回按钮
    ctx.font = `${24 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.fillText('✕', this.width - 20 * this.dpr, 50 * this.dpr)
    
    // 角色信息卡片（左上角，顶部UI下方）
    if (this.charInfoPanel && this.mainCharacter) {
      this.charInfoCardBounds = this.charInfoPanel.renderMiniCard(
        20 * this.dpr,  // 左边距
        80 * this.dpr  // 顶部UI下方
      )

      // 绘制角色切换按钮
      if (this.charInfoCardBounds) {
        const btnX = this.charInfoCardBounds.x + this.charInfoCardBounds.width - 35 * this.dpr
        const btnY = this.charInfoCardBounds.y + 10 * this.dpr
        const btnSize = 25 * this.dpr

        // 按钮背景
        ctx.fillStyle = 'rgba(74, 158, 255, 0.8)'
        ctx.beginPath()
        ctx.arc(btnX + btnSize / 2, btnY + btnSize / 2, btnSize / 2, 0, Math.PI * 2)
        ctx.fill()

        // 切换图标
        ctx.font = `${16 * this.dpr}px sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('↻', btnX + btnSize / 2, btnY + btnSize / 2)
      }
    }

    // 角色切换提示
    if (this.showSwitchTip) {
      ctx.font = `bold ${20 * this.dpr}px sans-serif`
      ctx.fillStyle = '#ffd700'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // 背景框
      const tipText = `切换至 ${this.mainCharacter.name}`
      const tipWidth = ctx.measureText(tipText).width + 40 * this.dpr
      const tipHeight = 40 * this.dpr
      const tipX = (this.width - tipWidth) / 2
      const tipY = this.height / 2 - 100 * this.dpr

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
      ctx.fillRect(tipX, tipY, tipWidth, tipHeight)

      ctx.strokeStyle = '#ffd700'
      ctx.lineWidth = 2
      ctx.strokeRect(tipX, tipY, tipWidth, tipHeight)

      ctx.fillStyle = '#ffd700'
      ctx.fillText(tipText, this.width / 2, tipY + tipHeight / 2)
    }

    // 角色详细信息面板
    if (this.charInfoPanel) {
      this.charDetailBounds = this.charInfoPanel.renderDetailPanel()
    }
    
    // 小地图
    if (this.showMinimap) {
      this._renderMinimap(ctx)
    }

    // 调试：显示碰撞区域（可选）
    // 取消注释下面这行可以显示碰撞区域
    // this._renderObstacles(ctx)
  }
  
  _renderPlayer(ctx) {
    const targetHeight = 60 * this.dpr // 固定高度

    // 转换为屏幕坐标
    const screenX = this.playerX - this.cameraX
    const screenY = this.playerY - this.cameraY

    // 获取当前动画帧图片
    let frameImg = null
    const heroId = this.mainCharacter?.id || 'zhenbao'

    if (this.isMoving) {
      // 走路动画帧
      const walkKey = `HERO_${heroId.toUpperCase()}_WALK_${this.animFrame}`
      frameImg = this.game.assets.get(walkKey)
    } else {
      // 待机动画帧
      const idleKey = `HERO_${heroId.toUpperCase()}_IDLE_${this.animFrame}`
      frameImg = this.game.assets.get(idleKey)
    }

    // 如果动画帧不存在，尝试使用静态立绘
    if (!frameImg) {
      frameImg = this.game.assets.get(`HERO_${heroId.toUpperCase()}`)
    }

    if (frameImg) {
      // 获取图片原始尺寸
      const imgWidth = frameImg.width
      const imgHeight = frameImg.height

      // 保持宽高比，基于图片高度缩放（与臻宝一致的处理方式）
      const scale = targetHeight / imgHeight
      const renderWidth = imgWidth * scale
      const renderHeight = targetHeight

      // 保存当前状态
      ctx.save()

      // 根据朝向决定是否翻转（角色图片本身朝左，所以向右时才翻转）
      if (!this.facingLeft) {
        // 向右时翻转图片（把朝左的图片翻成朝右）
        ctx.translate(screenX, screenY)
        ctx.scale(-1, 1)
        ctx.drawImage(
          frameImg,
          -renderWidth / 2,
          -renderHeight / 2,
          renderWidth,
          renderHeight
        )
      } else {
        // 向左时不翻转（图片本身朝左）
        ctx.drawImage(
          frameImg,
          screenX - renderWidth / 2,
          screenY - renderHeight / 2,
          renderWidth,
          renderHeight
        )
      }

      // 恢复状态
      ctx.restore()
      
      // 底部阴影（不翻转）
      ctx.beginPath()
      ctx.ellipse(screenX, screenY + targetHeight / 2 + 5 * this.dpr, targetHeight / 2.5, 8 * this.dpr, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fill()

      // 移动时添加轻微的方向指示器
      if (this.isMoving) {
        ctx.beginPath()
        const arrowDist = targetHeight / 2 + 10 * this.dpr
        let arrowX = screenX
        let arrowY = screenY
        
        switch (this.playerDirection) {
          case 'up': arrowY -= arrowDist; break
          case 'down': arrowY += arrowDist; break
          case 'left': arrowX -= arrowDist; break
          case 'right': arrowX += arrowDist; break
        }
        
        ctx.arc(arrowX, arrowY, 4 * this.dpr, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fill()
      }
    } else {
      // 备用：圆圈 + emoji
      ctx.beginPath()
      ctx.arc(screenX, screenY, targetHeight / 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3
      ctx.stroke()

      ctx.font = `${30 * this.dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🧑', screenX, screenY)
    }
  }
  
  _renderMapObjects(ctx) {
    // 安全检查
    if (!this.mapObjects || !Array.isArray(this.mapObjects)) return

    for (const obj of this.mapObjects) {
      if (obj.collected) continue

      // 转换为屏幕坐标
      const screenX = obj.x - this.cameraX
      const screenY = obj.y - this.cameraY

      // 只绘制在屏幕内的对象
      if (screenX < -50 || screenX > this.width + 50 ||
          screenY < -50 || screenY > this.height + 50) {
        continue
      }

      // 宝箱图标
      ctx.font = `${24 * this.dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('📦', screenX, screenY)
    }
  }

  _renderMonsters(ctx) {
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return

    for (const monster of this.mapMonsters) {
      if (!monster.alive) continue

      // 转换为屏幕坐标
      const screenX = monster.x - this.cameraX
      const screenY = monster.y - this.cameraY

      // 只绘制在屏幕内的怪物
      if (screenX < -60 || screenX > this.width + 60 ||
          screenY < -60 || screenY > this.height + 60) {
        continue
      }

      // 怪物浮动效果
      const bob = Math.sin(this.time * monster.bobSpeed + monster.bobOffset) * 5 * this.dpr

      // 怪物阴影
      ctx.beginPath()
      ctx.ellipse(screenX, screenY + 25 * this.dpr, 20 * this.dpr, 6 * this.dpr, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fill()

      // 怪物光环（Boss/精英）
      if (monster.isBoss || monster.isElite) {
        ctx.beginPath()
        ctx.arc(screenX, screenY + bob, 35 * this.dpr, 0, Math.PI * 2)
        ctx.fillStyle = monster.isBoss ? 'rgba(255, 71, 87, 0.3)' : 'rgba(124, 92, 224, 0.3)'
        ctx.fill()
      }

      // 怪物图标（根据类型）
      ctx.font = `${32 * this.dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const monsterIcon = monster.isBoss ? '👹' :
                         monster.isElite ? '👿' : '🐱'
      ctx.fillText(monsterIcon, screenX, screenY + bob)

      // 怪物名称
      ctx.font = `${12 * this.dpr}px sans-serif`
      ctx.fillStyle = monster.isBoss ? '#ff4757' :
                     monster.isElite ? '#a55eea' : '#ffffff'
      ctx.fillText(monster.name, screenX, screenY + 40 * this.dpr)

      // 怪物指示器（感叹号）
      const dist = Math.sqrt(
        (this.playerX - monster.x) ** 2 + (this.playerY - monster.y) ** 2
      )
      if (dist < 200 * this.dpr) {
        // 靠近时显示警告
        ctx.font = `${20 * this.dpr}px sans-serif`
        ctx.fillStyle = '#ff9f43'
        const warningBob = Math.sin(this.time * 5) * 3 * this.dpr
        ctx.fillText('⚠️', screenX, screenY - 35 * this.dpr + warningBob)
      }
    }
  }
  
  _renderTopUI(ctx) {
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, this.width, 70 * this.dpr)
    
    // 区域名
    ctx.font = `bold ${22 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.fillText(`📍 ${this.areaInfo.name}`, 20 * this.dpr, 45 * this.dpr)
    
    // 队伍状态（简化）
    ctx.font = `${16 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText(`👥 ${this.party.length}`, 20 * this.dpr, 65 * this.dpr)
    
    // 玩家坐标显示（调试用）
    ctx.font = `${14 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,0,0.9)'
    ctx.textAlign = 'right'
    const playerLogicX = Math.floor(this.playerX / this.dpr)
    const playerLogicY = Math.floor(this.playerY / this.dpr)
    ctx.fillText(`坐标: (${playerLogicX}, ${playerLogicY})`, this.width - 20 * this.dpr, 45 * this.dpr)
  }
  
  _renderJoystick(ctx) {
    const ja = this.joystickArea
    
    // 摇杆底座
    ctx.beginPath()
    ctx.arc(ja.x, ja.y, ja.r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 摇杆手柄
    if (this.joystick.active) {
      const dx = this.joystick.currentX - this.joystick.startX
      const dy = this.joystick.currentY - this.joystick.startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const maxDist = ja.r * 0.7
      
      let handleX = ja.x + (dx / dist) * Math.min(dist, maxDist)
      let handleY = ja.y + (dy / dist) * Math.min(dist, maxDist)
      
      ctx.beginPath()
      ctx.arc(handleX, handleY, 25 * this.dpr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(ja.x, ja.y, 25 * this.dpr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.fill()
    }
    
    // 提示文字
    ctx.font = `${12 * this.dpr}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.textAlign = 'center'
    ctx.fillText('移动', ja.x, ja.y + ja.r + 20 * this.dpr)
  }
  
  _renderMinimap(ctx) {
    const mapSize = 80 * this.dpr
    const mapX = this.width - mapSize - 15 * this.dpr
    const mapY = 85 * this.dpr

    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.beginPath()
    this._roundRect(ctx, mapX, mapY, mapSize, mapSize, 5 * this.dpr)
    ctx.fill()

    // 绘制怪物位置（安全检查）
    if (this.mapMonsters && Array.isArray(this.mapMonsters)) {
      for (const monster of this.mapMonsters) {
        if (!monster.alive) continue

        const mx = mapX + (monster.x / this.mapWidth) * mapSize
        const my = mapY + (monster.y / this.mapHeight) * mapSize

        ctx.beginPath()
        ctx.arc(mx, my, monster.isBoss ? 3 * this.dpr : 2 * this.dpr, 0, Math.PI * 2)
        ctx.fillStyle = monster.isBoss ? '#ff4757' :
                       monster.isElite ? '#a55eea' : '#ff6b6b'
        ctx.fill()
      }
    }

    // 绘制宝箱位置（安全检查）
    if (this.mapObjects && Array.isArray(this.mapObjects)) {
      for (const obj of this.mapObjects) {
        if (obj.collected) continue
        const bx = mapX + (obj.x / this.mapWidth) * mapSize
        const by = mapY + (obj.y / this.mapHeight) * mapSize

        ctx.beginPath()
        ctx.arc(bx, by, 2 * this.dpr, 0, Math.PI * 2)
        ctx.fillStyle = '#ffd700'
        ctx.fill()
      }
    }

    // 绘制可视区域框
    const viewX = mapX + (this.cameraX / this.mapWidth) * mapSize
    const viewY = mapY + (this.cameraY / this.mapHeight) * mapSize
    const viewW = (this.width / this.mapWidth) * mapSize
    const viewH = (this.height / this.mapHeight) * mapSize

    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    ctx.strokeRect(viewX, viewY, viewW, viewH)

    // 玩家位置（相对于地图）
    const px = mapX + (this.playerX / this.mapWidth) * mapSize
    const py = mapY + (this.playerY / this.mapHeight) * mapSize

    ctx.beginPath()
    ctx.arc(px, py, 3 * this.dpr, 0, Math.PI * 2)
    ctx.fillStyle = '#ff9f43'
    ctx.fill()
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

  _renderObstacles(ctx) {
    // 绘制碰撞区域的可视化（用于调试）
    if (!this.obstacles || this.obstacles.length === 0) return

    for (const obstacle of this.obstacles) {
      // 转换为屏幕坐标
      const screenX = obstacle.x * this.dpr - this.cameraX
      const screenY = obstacle.y * this.dpr - this.cameraY

      ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'
      ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'
      ctx.lineWidth = 2

      if (obstacle.type === 'rect') {
        // 绘制矩形
        const w = obstacle.width * this.dpr
        const h = obstacle.height * this.dpr
        ctx.fillRect(screenX, screenY, w, h)
        ctx.strokeRect(screenX, screenY, w, h)

        // 显示名称
        ctx.font = `${12 * this.dpr}px sans-serif`
        ctx.fillStyle = '#ff0000'
        ctx.textAlign = 'center'
        ctx.fillText(obstacle.name || '障碍', screenX + w / 2, screenY + h / 2)
      } else if (obstacle.type === 'circle') {
        // 绘制圆形
        const r = obstacle.radius * this.dpr
        ctx.beginPath()
        ctx.arc(screenX, screenY, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // 显示名称
        ctx.font = `${12 * this.dpr}px sans-serif`
        ctx.fillStyle = '#ff0000'
        ctx.textAlign = 'center'
        ctx.fillText(obstacle.name || '障碍', screenX, screenY)
      }
    }
  }
}
