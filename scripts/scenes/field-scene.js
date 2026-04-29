/**
 * field-scene.js - 野外探索场景（可移动大地图）
 */

import { ENEMIES_CH1, ENEMIES_CH2, getEnemyByLevel } from '../data/enemies.js'
import { HEROES } from '../data/heroes.js'
import { getMapCollisionsSync } from '../data/map_collisions.js'
import { isPointInObstacle as _isPointInGrasslandObstacle, generateGrasslandCollisions as _genGrassCollisions, GRASSLAND_MAP_CONFIG, GRASSLAND_MAP_OBJECTS, GLAND_OBJ_TYPE } from '../data/grassland-map-data.js'
import { charStateManager } from '../data/character-state.js'
import { CharacterInfoPanel } from '../ui/character-info-panel.js'
import { equipmentManager } from '../managers/equipment-manager.js'
import { getBossDrop, getRandomEquipment } from '../data/equipment.js'

export class FieldScene {
  constructor(game, data) {
    this.game = game
    this.ctx = game.ctx
    this.width = game.width
    this.height = game.height
    this.dpr = game.dpr
    this.time = 0
    
    // 区域信息（兼容 nodeId 和 area 两种参数名）
    this.areaId = data?.area || data?.nodeId || 'grassland'
    console.log(`[Field] 区域ID: ${this.areaId} (来源: ${data?.area ? 'area' : data?.nodeId ? 'nodeId' : '默认'})`)
    this.areaInfo = this._getAreaInfo()
    
    // 地图尺寸（大地图 - 扩大一倍）
    this.mapWidth = 4000 * this.dpr // 地图宽度
    this.mapHeight = 3000 * this.dpr // 地图高度
    
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
    this._effectiveMoving = false   // 带滞后的有效移动状态，防止walk/idle闪烁
    this._movingHoldFrames = 0      // 停止移动后的保持计数器（帧）
    this._MOVING_HOLD = 5           // 停止后保持5帧(约80ms)不切回idle
    this.frameDuration = 0.15 // 每帧150ms
    
    // 摇杆控制（固定位置摇杆）
    this.joystick = { active: false, touchId: null, currentX: 0, currentY: 0 }
    
    // 初始化角色状态（必须在队伍初始化之前）
    const savedCharData = this.game.data.get('characterStates')
    charStateManager.init(savedCharData)
    
    // 初始化装备管理器
    const savedEquipData = this.game.data.get('equipmentData')
    equipmentManager.init(savedEquipData)
    
    // 队伍（使用角色状态管理中的数据）
    this.party = this._initParty()
    
    // 获取第一个角色（主角）
    this.mainCharacter = charStateManager.getAllCharacters()[0]

    // 队友跟随系统
    this.followers = [] // 跟随的队友列表
    this.followerDistance = 35 * this.dpr // 队友跟随距离
    this.playerHistory = [] // 主角移动历史（用于队友跟随路径）
    this.historyMaxLength = 90 // 保存最近90帧的位置（约1.5秒）
    this.historyInterval = 3 // 每3帧记录一次位置
    this.historyFrameCount = 0 // 记录帧计数器
    this._initFollowers() // 初始化队友

    // 角色信息面板
    if (this.mainCharacter) {
      this.charInfoPanel = new CharacterInfoPanel(game, this.mainCharacter)
    }

    // 角色切换提示
    this.showSwitchTip = false
    this.switchTipTimer = 0
    
    // 战斗触发标志（防止重复触发）
    this.isEnteringBattle = false

    // 地图怪物（尝试恢复保存的状态，每个副本独立保存）
    const savedMonsters = this.game.data.get(`fieldMonsters_${this.areaId}`)
    console.log(`[Field] 尝试恢复区域 ${this.areaId} 的怪物状态, 已保存: ${!!savedMonsters}`)
    
    if (savedMonsters && Array.isArray(savedMonsters) && savedMonsters.length > 0) {
      // 验证怪物数据是否属于当前区域
      const validMonsters = savedMonsters.filter(m => m.id && m.id.startsWith(`${this.areaId}_`))
      
      if (validMonsters.length === savedMonsters.length) {
        // 所有怪物都属于当前区域
        this.mapMonsters = savedMonsters
        const aliveCount = this.mapMonsters.filter(m => m.alive).length
        const bossCount = this.mapMonsters.filter(m => m.isBoss && m.alive).length
        console.log(`[Field] 恢复了 ${aliveCount} 只怪物，其中 ${bossCount} 只BOSS`)
        if (bossCount > 0) {
          const bossNames = this.mapMonsters.filter(m => m.isBoss && m.alive).map(m => m.name).join(', ')
          console.log(`[Field] 存活的BOSS: ${bossNames}`)
        }
      } else {
        // 数据不属于当前区域，重新生成
        console.log(`[Field] 数据不属于当前区域，重新生成怪物`)
        console.log(`[Field] 预期前缀: ${this.areaId}_, 实际: ${savedMonsters[0]?.id}`)
        this.mapMonsters = this._generateMonsters()
      }
    } else {
      this.mapMonsters = this._generateMonsters()
    }

    // UI
    this.showMinimap = true
    this.showMenu = false

    // 地图元素（宝箱、资源点）
    this.mapObjects = this._generateMapObjects()
    
    // 地图碰撞数据（grassland 直接同步生成，其他走 map_collisions）
    if (this.areaId === 'grassland') {
      this.obstacles = _genGrassCollisions()
    } else {
      this.obstacles = getMapCollisionsSync(this.areaId)
    }
    console.log(`[Field] 加载了 ${this.obstacles.length} 个障碍物`)
  }
  
  _getAreaInfo() {
    const areas = {
      grassland: {
        name: '阳光草原',
        fieldBg: null, // 程序化渲染（grassland-map-data.js）
        battleBg: 'BG_GRASSLAND', // 战斗背景
        enemies: ['wild_cat', 'slime_cat', 'shadow_mouse'],
        bossEnemy: 'lost_healer_cat',  // 添加Boss
        enemyData: ENEMIES_CH1,  // 敌人数据源
        color: '#5daE4a',
        minEnemies: 1,  // 最少敌人数量
        maxEnemies: 2   // 最多敌人数量
      },
      magic_tower: {
        name: '魔法塔',
        fieldBg: null, // 程序化渲染
        battleBg: 'BG_GRASSLAND',
        enemies: ['magic_sprite', 'stone_golem', 'ghost_cat'],
        bossEnemy: 'crystal_mage',
        eliteEnemy: 'tower_guardian',
        enemyData: ENEMIES_CH2,  // 第二章敌人数据
        color: '#9b59b6',
        minEnemies: 1,
        maxEnemies: 3  // 魔法塔敌人数量更多
      },
      forest: {
        name: '迷雾森林',
        fieldBg: null, // 后续可替换为森林专用图片
        battleBg: 'BG_FOREST',
        enemies: ['slime_cat', 'shadow_mouse', 'wild_cat'],
        bossEnemy: 'stray_leader',
        enemyData: ENEMIES_CH1,
        color: '#2ed573',
        minEnemies: 1,
        maxEnemies: 2
      },
      cave: {
        name: '暗影洞穴',
        fieldBg: null, // 后续可替换为洞穴专用图片
        battleBg: 'BG_CAVE',
        enemies: ['shadow_mouse', 'slime_cat', 'wild_cat'],
        bossEnemy: 'dark_cat_king',
        enemyData: ENEMIES_CH1,
        color: '#636e72',
        minEnemies: 1,
        maxEnemies: 2
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
    const party = allChars.map(charState => {
      console.log(`[Field] 角色 ${charState.name} - ATK:${charState.atk}, DEF:${charState.def}, 装备:`, charState.equipment)
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
    
    return party
  }

  /**
   * 初始化跟随队友
   */
  _initFollowers() {
    const allChars = charStateManager.getAllCharacters()
    
    // 从第二个角色开始，都是跟随队友
    for (let i = 1; i < allChars.length; i++) {
      this.followers.push({
        character: allChars[i],
        x: this.playerX - i * this.followerDistance, // 初始位置在主角后面
        y: this.playerY,
        animFrame: 0,
        animTimer: 0,
        isMoving: false,
        _effectiveMoving: false,
        _movingHoldFrames: 0,
        facingLeft: this.facingLeft
      })
    }
    
    console.log(`[Field] 初始化了 ${this.followers.length} 个跟随队友`)
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
    
    // 获取碰撞数据用于避障（逻辑像素坐标）
    let collisions = null
    if (this.areaId === 'grassland') {
      collisions = _genGrassCollisions()
    }

    // 先生成Boss（如果该区域有Boss且未被击败）
    if (this.areaInfo.bossEnemy) {
      const bossId = this.areaInfo.bossEnemy
      const bossData = (this.areaInfo.enemyData || ENEMIES_CH1)[bossId]
      
      // 检查Boss是否已被击败
      const bossFlag = `${this.areaId}_${bossId}_defeated`
      if (!this.game.data.hasFlag(bossFlag) && bossData) {
        // Boss位置：地图右上角远处（85%, 8%）
        const bossX = this.mapWidth * 0.85
        const bossY = this.mapHeight * 0.08
        
        monsters.push({
          id: `${this.areaId}_boss_${bossId}`,
          enemyId: bossId,
          x: bossX,
          y: bossY,
          name: bossData.name,
          isBoss: true,
          isElite: false,
          alive: true,
          bobOffset: 0,
          bobSpeed: 1.5,
          animTimer: 0,
          animFrame: 0,
          homeX: bossX,
          homeY: bossY,
          patrolRadius: 20 * this.dpr,
          moveAngle: 0,
          moveSpeed: 10 * this.dpr,
          moveTimer: 0,
          pauseTimer: 0,
          isMoving: true
        })
        
        console.log(`[Field] 生成Boss: ${bossData.name} 在位置 (${bossX}, ${bossY})`)
      }
    }

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

        // ⭐ 新增：检查是否与障碍物重叠（坐标转回逻辑像素）
        if (validPosition && collisions && collisions.length > 0) {
          const lx = x / this.dpr
          const ly = y / this.dpr
          if (_isPointInGrasslandObstacle(lx, ly, 60, collisions)) {
            validPosition = false
          }
        }

        attempts++
      }

      if (validPosition) {
        // 随机选择敌人类型
        const enemyId = this.areaInfo.enemies[Math.floor(Math.random() * this.areaInfo.enemies.length)]
        const enemyData = (this.areaInfo.enemyData || ENEMIES_CH1)[enemyId]  // 使用对应章节的敌人数据

        monsters.push({
          id: `${this.areaId}_monster_${i}`,  // 包含区域ID前缀
          enemyId: enemyId,
          x: x,
          y: y,
          name: (enemyData?.isBoss || enemyData?.isElite) ? (enemyData?.name || '未知怪物') : '坏猫',
          isBoss: enemyData?.isBoss || false,
          isElite: enemyData?.isElite || false,
          alive: true,
          // 怪物动画
          bobOffset: Math.random() * Math.PI * 2, // 随机浮动偏移
          bobSpeed: 2 + Math.random(), // 随机浮动速度
          animTimer: 0, // 动画计时器
          animFrame: 0, // 动画帧索引
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
    // 处理战斗结果
    this._checkBattleResult()

    // 初始化相机位置
    this._updateCamera()

    // 固定摇杆配置（底座在左下角固定位置）
    const joystickCenterX = 130 * this.dpr
    const joystickCenterY = this.height - 130 * this.dpr
    this.joystickConfig = {
      centerX: joystickCenterX,     // 底座中心X（固定）
      centerY: joystickCenterY,     // 底座中心Y（固定）
      baseRadius: 60 * this.dpr,    // 底座半径
      handleRadius: 30 * this.dpr,  // 手柄半径
      maxOffset: 50 * this.dpr,     // 手柄最大偏移
      deadZone: 5 * this.dpr        // 死区阈值（降低提高灵敏度）
    }

    // 注册触摸事件监听（用touchIdentifier跟踪摇杆触摸点）
    this._onTouchStart = (e) => {
      if (!this.joystick.active && e.touches) {
        for (const t of e.touches) {
          const tx = t.clientX * this.dpr
          const ty = t.clientY * this.dpr
          const dx = tx - this.joystickConfig.centerX
          const dy = ty - this.joystickConfig.centerY
          // 判断是否在摇杆底座范围内（宽松判定，1.5倍半径）
          if (Math.sqrt(dx * dx + dy * dy) < this.joystickConfig.baseRadius * 1.5) {
            this.joystick.active = true
            this.joystick.touchId = t.identifier
            this.joystick.currentX = tx
            this.joystick.currentY = ty
            break
          }
        }
      }
    }

    this._onTouchMove = (e) => {
      if (this.joystick.active && e.touches) {
        for (const t of e.touches) {
          if (t.identifier === this.joystick.touchId) {
            this.joystick.currentX = t.clientX * this.dpr
            this.joystick.currentY = t.clientY * this.dpr
            break
          }
        }
      }
    }

    this._onTouchEnd = (e) => {
      if (this.joystick.active && e.changedTouches) {
        for (const t of e.changedTouches) {
          if (t.identifier === this.joystick.touchId) {
            this.joystick.active = false
            this.joystick.touchId = null
            break
          }
        }
      }
    }

    wx.onTouchStart(this._onTouchStart)
    this.game.input.onMove(this._onTouchMove)
    this.game.input.onEnd(this._onTouchEnd)
  }

  _checkBattleResult() {
    const battleMonsterId = this.game.data.get('currentBattleMonsterId')
    const battleVictory = this.game.data.get('battleVictory')
    const droppedEquipment = this.game.data.get('droppedEquipment')

    console.log(`[Field] 检查战斗结果 - 区域: ${this.areaId}, 战斗怪物ID: ${battleMonsterId}, 胜利: ${battleVictory}`)
    console.log(`[Field] 当前区域怪物数量: ${this.mapMonsters?.length}, 其中存活: ${this.mapMonsters?.filter(m => m.alive).length}`)

    if (!battleMonsterId) {
      console.log(`[Field] 无战斗结果需要处理`)
      return
    }

    if (battleMonsterId) {
      // 找到对应怪物
      const monster = this.mapMonsters.find(m => m.id === battleMonsterId)

      if (monster) {
        console.log(`[Field] 找到战斗怪物 - ID: ${monster.id}, 名称: ${monster.name}, 类型: ${monster.enemyId}, 是否BOSS: ${monster.isBoss}`)
        
        if (battleVictory) {
          // 战斗胜利，标记怪物死亡
          monster.alive = false
          console.log(`[Field] 怪物 ${monster.name} 被击败`)
          
          // 处理装备掉落
          if (droppedEquipment) {
            equipmentManager.addItem(droppedEquipment.id)
            console.log(`[Field] 获得装备: ${droppedEquipment.name}`)
            this.game.data.delete('droppedEquipment')
            
            // 保存装备数据
            this.game.data.set('equipmentData', equipmentManager.serialize())
          }
        } else {
          // 战斗失败/撤退，怪物保持存活
          console.log(`[Field] 战斗未胜利（失败或撤退），怪物 ${monster.name} 仍然存活`)
        }
      } else {
        console.error(`[Field] 未找到战斗怪物！ID: ${battleMonsterId}`)
        console.log(`[Field] 当前所有怪物ID: ${this.mapMonsters.map(m => `${m.id}(${m.name})`).join(', ')}`)
      }

      // 清除临时数据
      this.game.data.delete('currentBattleMonsterId')
      this.game.data.delete('battleVictory')

      // 保存怪物状态（每个副本独立保存）
      this.game.data.set(`fieldMonsters_${this.areaId}`, this.mapMonsters)
      console.log(`[Field] 已保存区域 ${this.areaId} 的怪物状态`)
    }
    
    // 检查是否有新角色加入队伍
    this._checkNewFollowers()
  }
  
  /**
   * 检查并添加新加入的队友
   */
  _checkNewFollowers() {
    const allChars = charStateManager.getAllCharacters()
    const currentFollowerIds = this.followers.map(f => f.character.id)
    
    // 找出新加入的角色
    for (let i = 1; i < allChars.length; i++) {
      const char = allChars[i]
      if (!currentFollowerIds.includes(char.id)) {
        // 新角色加入，添加到followers
        this.followers.push({
          character: char,
          x: this.playerX - (this.followers.length + 1) * this.followerDistance,
          y: this.playerY,
          animFrame: 0,
          animTimer: 0,
          isMoving: false,
          _effectiveMoving: false,
          _movingHoldFrames: 0,
          facingLeft: this.facingLeft
        })
        console.log(`[Field] 新角色加入跟随: ${char.name}`)
      }
    }
    
    // 更新主角色（第一个角色）
    if (allChars.length > 0 && this.mainCharacter?.id !== allChars[0].id) {
      this.mainCharacter = allChars[0]
      console.log(`[Field] 主角切换为: ${this.mainCharacter.name}`)
    }
  }
  
  destroy() {
    // 保存怪物状态（每个副本独立保存）
    this.game.data.set(`fieldMonsters_${this.areaId}`, this.mapMonsters)
    
    // 保存角色状态
    const charData = charStateManager.serialize()
    this.game.data.set('characterStates', charData)

    // 清理事件监听
    wx.offTouchStart(this._onTouchStart)
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
      const dx = this.joystick.currentX - this.joystickConfig.centerX
      const dy = this.joystick.currentY - this.joystickConfig.centerY
      const dist = Math.sqrt(dx * dx + dy * dy)

      // 更新方向（偏移 > 死区）
      if (dist > this.joystickConfig.deadZone) {
        // 根据水平移动分量更新朝向
        if (Math.abs(dx) > Math.abs(dy)) {
          this.playerDirection = dx > 0 ? 'right' : 'left'
          this.facingLeft = dx < 0 // 向左移动时 facingLeft 为 true
        } else {
          this.playerDirection = dy > 0 ? 'down' : 'up'
          // 上下移动时不改变水平朝向
        }
      }

      if (dist > this.joystickConfig.deadZone) {
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

    // 更新队友跟随
    this._updateFollowers(dt)

    // 检测从移动切换到idle，重置动画帧（避免使用walk_7等无效帧）
    // 使用带滞后的有效移动状态，防止摇杆在死区边缘抖动导致 walk/idle 闪烁
    if (this.isMoving) {
      this._effectiveMoving = true
      this._movingHoldFrames = 0
    } else {
      this._movingHoldFrames++
      if (this._movingHoldFrames > this._MOVING_HOLD) {
        if (this._effectiveMoving) {
          // 真正停止移动了，重置动画到idle起始
          this.animFrame = 0
          this.animTimer = 0
        }
        this._effectiveMoving = false
        this._movingHoldFrames = 0
      }
    }

    // 动画帧更新
    this.animTimer += dt

    // 根据主角类型确定帧率和帧数（1秒循环）
    const heroId = this.mainCharacter?.id || 'zhenbao'
    const isCat = heroId.toLowerCase().includes('cat') || heroId === 'mao' // 猫咪角色

    let frameDuration, totalFrames
    if (this._effectiveMoving) {
      // 走路动画
      if (heroId === 'zhenbao') {
        frameDuration = 0.100 // 臻宝8帧（walk_01~08），100ms/帧 ≈ 0.8秒循环
        totalFrames = 8
      } else if (heroId === 'lixiaobao') {
        frameDuration = 0.100 // 李小宝8帧（walk_01~08），100ms/帧 ≈ 0.8秒循环
        totalFrames = 8
      } else if (heroId === 'slime_cat') {
        frameDuration = 0.083 // 史莱姆猫12帧walk，83ms/帧 ≈ 1秒循环
        totalFrames = 12
      } else if (heroId === 'shadow_mouse') {
        frameDuration = 0.083 // 暗影鼠12帧walk
        totalFrames = 12
      } else if (isCat) {
        frameDuration = 0.083 // 猫咪12帧（减帧版），83ms/帧 ≈ 1秒循环
        totalFrames = 12
      } else {
        frameDuration = 0.125 // 其他8帧，125ms/帧 = 1秒循环
        totalFrames = 8
      }
    } else {
      // 待机动画（1秒循环）
      if (heroId === 'zhenbao') {
        frameDuration = 0.200 // 臻宝5帧（减帧版），200ms/帧 = 1秒循环
        totalFrames = 5
      } else if (heroId === 'lixiaobao') {
        frameDuration = 0.125 // 李小宝8帧idle（idle_01~08），125ms/帧 = 1秒循环
        totalFrames = 8
      } else if (heroId === 'slime_cat') {
        frameDuration = 0.143 // 史莱姆猫7帧idle，143ms/帧 ≈ 1秒循环
        totalFrames = 7
      } else if (heroId === 'shadow_mouse') {
        frameDuration = 0.167 // 暗影鼠6帧idle
        totalFrames = 6
      } else if (isCat) {
        frameDuration = 0.125 // 猫咪8帧（减帧版），125ms/帧 ≈ 1秒循环
        totalFrames = 8
      } else {
        frameDuration = 0.500 // 其他2帧，500ms/帧 = 1秒循环
        totalFrames = 2
      }
    }

    if (this.animTimer >= frameDuration) {
      this.animTimer = 0
      this.animFrame = (this.animFrame + 1) % totalFrames
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

      // 初始化猫咪动画属性（所有普通怪物都使用坏猫动画）
      const useCatAnim = !monster.isBoss && !monster.isElite
      if (useCatAnim && monster.animTimer === undefined) {
        monster.animTimer = 0
        monster.animFrame = 0
      }

      // 更新猫咪动画（无论是否暂停）
      if (useCatAnim) {
        monster.animTimer += dt
        const frameDuration = monster.isMoving ? 0.08 : 0.15

        if (monster.animTimer >= frameDuration) {
          monster.animTimer = 0
          if (monster.isMoving) {
            monster.animFrame = (monster.animFrame + 1) % 12
          } else {
            monster.animFrame = (monster.animFrame + 1) % 8
          }
        }
      }

      // 暂停计时器（只暂停移动，不暂停动画）
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
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return
    const aliveCount = this.mapMonsters.filter(m => m.alive).length
    const minMonsters = 10 // 最少保留10只怪物

    if (aliveCount < minMonsters) {
      this._respawnMonsters(minMonsters - aliveCount)
    }
  }

  _respawnMonsters(count) {
    const margin = 150 * this.dpr
    const minDistance = 120 * this.dpr
    
    // 获取碰撞数据
    let collisions = null
    if (this.areaId === 'grassland') {
      collisions = _genGrassCollisions()
    }

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
        
        // 检查障碍物碰撞
        if (validPosition && collisions && collisions.length > 0) {
          const lx = x / this.dpr
          const ly = y / this.dpr
          if (_isPointInGrasslandObstacle(lx, ly, 60, collisions)) {
            validPosition = false
          }
        }

        attempts++
      }

      if (validPosition) {
        const enemyId = this.areaInfo.enemies[Math.floor(Math.random() * this.areaInfo.enemies.length)]
        const enemyData = (this.areaInfo.enemyData || ENEMIES_CH1)[enemyId]  // 使用对应章节的敌人数据

        this.mapMonsters.push({
          id: `${this.areaId}_monster_${Date.now()}_${i}`,  // 包含区域ID前缀
          enemyId: enemyId,
          x: x,
          y: y,
          name: (enemyData?.isBoss || enemyData?.isElite) ? (enemyData?.name || '未知怪物') : '坏猫',
          isBoss: enemyData?.isBoss || false,
          isElite: enemyData?.isElite || false,
          alive: true,
          bobOffset: Math.random() * Math.PI * 2,
          bobSpeed: 2 + Math.random(),
          animTimer: 0, // 动画计时器
          animFrame: 0, // 动画帧索引
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

    // 保存怪物状态（每个副本独立保存）
    this.game.data.set(`fieldMonsters_${this.areaId}`, this.mapMonsters)
  }
  
  _updateCamera() {
    // 相机跟随玩家（平滑跟随）
    const targetCameraX = this.playerX - this.width / 2
    const targetCameraY = this.playerY - this.height / 2
    
    // 限制相机在地图范围内
    this.cameraX = Math.max(0, Math.min(this.mapWidth - this.width, targetCameraX))
    this.cameraY = Math.max(0, Math.min(this.mapHeight - this.height, targetCameraY))
  }

  /**
   * 更新队友跟随
   */
  _updateFollowers(dt) {
    if (!this.followers || !Array.isArray(this.followers)) return
    if (this.followers.length === 0) return

    // 记录主角位置历史（每3帧记录一次，避免太密集）
    this.historyFrameCount++
    if (this.historyFrameCount >= this.historyInterval) {
      this.historyFrameCount = 0
      this.playerHistory.unshift({
        x: this.playerX,
        y: this.playerY,
        facingLeft: this.facingLeft
      })
      
      // 限制历史长度
      if (this.playerHistory.length > this.historyMaxLength) {
        this.playerHistory.pop()
      }
    }

    // 每个队友跟随不同的历史位置
    for (let i = 0; i < this.followers.length; i++) {
      const follower = this.followers[i]
      
      // 计算队友应该在的历史位置索引
      // 第1个队友延迟10个记录点，第2个延迟20个记录点，以此类推
      // 每个记录点间隔3帧，所以实际延迟约30帧
      const historyIndex = Math.min((i + 1) * 10, this.playerHistory.length - 1)
      
      if (historyIndex >= 0 && this.playerHistory.length > 0) {
        const targetPos = this.playerHistory[historyIndex]
        
        // 平滑移动到目标位置
        const dx = targetPos.x - follower.x
        const dy = targetPos.y - follower.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        
        // 如果距离大于阈值，移动队友
        // 降低速度，避免追上主角
        if (dist > 10 * this.dpr) {
          const speed = this.playerSpeed * 0.95
          const moveX = (dx / dist) * speed * dt
          const moveY = (dy / dist) * speed * dt
          
          follower.x += moveX
          follower.y += moveY
          follower.facingLeft = targetPos.facingLeft
          follower.isMoving = true
        } else {
          // 距离足够近，且主角已停止移动时，才让队友也停止
          // 使用主角的_effectiveMoving判断，避免循环依赖
          if (!this._effectiveMoving) {
            const wasMoving = follower.isMoving
            follower.isMoving = false
            
            if (wasMoving && !follower.isMoving) {
              follower.animFrame = 0
              follower.animTimer = 0
            }
          }
        }
      }
      
      // 队友移动状态滞后（与主角相同的防闪烁机制）
      if (follower.isMoving) {
        follower._effectiveMoving = true
        follower._movingHoldFrames = 0
      } else {
        follower._movingHoldFrames++
        if (follower._movingHoldFrames > this._MOVING_HOLD) {
          follower._effectiveMoving = false
          follower._movingHoldFrames = 0
        }
      }
      
      // 更新队友动画
      follower.animTimer += dt

      // 根据角色类型确定帧率和帧数（1秒循环）
      const heroId = follower.character.id
      const isCat = heroId.toLowerCase().includes('cat') || heroId === 'mao'

      let frameDuration, totalFrames
      if (follower._effectiveMoving) {
        // 走路动画
        if (heroId === 'zhenbao') {
          frameDuration = 0.100
          totalFrames = 8
        } else if (heroId === 'lixiaobao') {
          frameDuration = 0.100 // 李小宝8帧walk
          totalFrames = 8
        } else if (heroId === 'slime_cat') {
          frameDuration = 0.083  // 史莱姆猫12帧walk
          totalFrames = 12
        } else if (heroId === 'shadow_mouse') {
          frameDuration = 0.083  // 暗影鼠12帧walk
          totalFrames = 12
        } else if (isCat) {
          frameDuration = 0.083
          totalFrames = 12
        } else {
          frameDuration = 0.125
          totalFrames = 8
        }
      } else {
        // 待机动画
        if (heroId === 'zhenbao') {
          frameDuration = 0.200
          totalFrames = 5
        } else if (heroId === 'lixiaobao') {
          frameDuration = 0.125 // 李小宝8帧idle
          totalFrames = 8
        } else if (heroId === 'slime_cat') {
          frameDuration = 0.143  // 史莱姆猫7帧idle
          totalFrames = 7
        } else if (heroId === 'shadow_mouse') {
          frameDuration = 0.167  // 暗影鼠6帧idle
          totalFrames = 6
        } else if (isCat) {
          frameDuration = 0.125
          totalFrames = 8
        } else {
          frameDuration = 0.500
          totalFrames = 2
        }
      }

      if (follower.animTimer >= frameDuration) {
        follower.animTimer = 0
        follower.animFrame = (follower.animFrame + 1) % totalFrames
      }
    }
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
          // 切换角色（已移除，改为跟随模式）
          console.log('[Field] 已切换为跟随模式')
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
    
    // 返回按钮（左上角）
    const backBtn = { x: 20 * this.dpr, y: 20 * this.dpr, w: 90 * this.dpr, h: 40 * this.dpr }
    if (tap.x >= backBtn.x && tap.x <= backBtn.x + backBtn.w &&
        tap.y >= backBtn.y && tap.y <= backBtn.y + backBtn.h) {
      this.game.changeScene('town')
      return
    }
    
    // 摇杆区域点击由touchStart事件处理，不再通过tap激活
    
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
    // 如果已经在进入战斗，不再检测
    if (this.isEnteringBattle) return
    
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
    // 标记正在进入战斗，防止重复触发
    if (this.isEnteringBattle) return
    this.isEnteringBattle = true
    
    console.log(`[Field] 触发战斗 - 怪物ID: ${monster.id}, 名称: ${monster.name}, 类型: ${monster.enemyId}, 是否BOSS: ${monster.isBoss}`)
    
    const enemyBase = (this.areaInfo.enemyData || ENEMIES_CH1)[monster.enemyId]
    if (!enemyBase) {
      console.error(`[Field] 敌人数据不存在: ${monster.enemyId}`)
      this.isEnteringBattle = false
      return
    }

    // 计算敌人等级
    // Boss和精英使用设定等级
    // 普通怪物基于设定等级上下浮动
    let enemyLevel
    
    if (enemyBase.isBoss) {
      // Boss使用固定等级
      enemyLevel = enemyBase.level || 10
    } else if (enemyBase.isElite) {
      // 精英使用固定等级
      enemyLevel = enemyBase.level || 5
    } else {
      // 普通怪物：基于设定等级上下浮动2级
      const baseLevel = enemyBase.level || 1
      const levelVariation = Math.floor(Math.random() * 5) - 2 // -2 到 +2
      enemyLevel = Math.max(1, baseLevel + levelVariation)
    }

    // 生成敌人队伍（支持多只怪物）
    const enemies = []
    
    // Boss和精英单独战斗
    if (enemyBase.isBoss || enemyBase.isElite) {
      const enemy = getEnemyByLevel(enemyBase, enemyLevel)
      enemies.push(enemy)
      console.log(`[Field] 遭遇${enemyBase.isBoss ? 'Boss' : '精英'}: ${enemy.name} Lv.${enemyLevel}`)
    } else {
      // 普通怪物：随机1-3只
      const minEnemies = this.areaInfo.minEnemies || 1
      const maxEnemies = this.areaInfo.maxEnemies || 2
      const enemyCount = Math.floor(Math.random() * (maxEnemies - minEnemies + 1)) + minEnemies
      
      for (let i = 0; i < enemyCount; i++) {
        // 随机选择敌人类型
        const enemyTypes = this.areaInfo.enemies
        const randomType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)]
        const randomEnemyBase = (this.areaInfo.enemyData || ENEMIES_CH1)[randomType]
        
        if (randomEnemyBase) {
          // 每只怪物等级略有差异（基于设定等级）
          const baseLevel = randomEnemyBase.level || 1
          const individualLevel = Math.max(1, baseLevel + Math.floor(Math.random() * 3) - 1)
          const enemy = getEnemyByLevel(randomEnemyBase, individualLevel)
          enemies.push(enemy)
        }
      }
      
      console.log(`[Field] 遭遇怪物群: ${enemies.map(e => `${e.name} Lv.${e.level}`).join(', ')}`)
    }

    // 不在这里标记怪物死亡，等战斗结束后根据结果决定
    // 只保存当前正在战斗的怪物ID
    this.game.data.set('currentBattleMonsterId', monster.id)

    // 保存队伍状态
    this.game.data.set('party', this.party)
    
    // ⚠️ 保存怪物状态（防止返回时重新生成）
    this.game.data.set(`fieldMonsters_${this.areaId}`, this.mapMonsters)
    console.log(`[Field] 战斗前保存了 ${this.mapMonsters.filter(m => m.alive).length} 只怪物到区域 ${this.areaId}`)

    // 进入战斗
    this.game.changeScene('battle', {
      party: this.party,
      enemies: enemies,  // 传递敌人队伍
      bg: this.areaInfo.battleBg,
      nodeId: this.areaId,
      monsterId: monster.id
    })
  }

  /**
   * 程序化渲染地图（阳光草原等，不依赖图片素材）
   * 参考 town-scene 的 _renderBackground + _renderMapLayer 方式
   */
  _renderProgrammaticMap(ctx) {
    const camX = this.cameraX
    const camY = this.cameraY
    const cfg = GRASSLAND_MAP_CONFIG

    // 1. 基础草地背景
    ctx.fillStyle = cfg.bgColor
    ctx.fillRect(0, 0, this.width, this.height)

    // 2. 深色草地纹理块（伪随机分布）
    ctx.fillStyle = cfg.bgDarkColor
    const tileSize = 100 * this.dpr
    for (let gx = Math.floor(camX / tileSize) * tileSize - tileSize;
         gx < camX + this.width + tileSize * 2; gx += tileSize) {
      for (let gy = Math.floor(camY / tileSize) * tileSize - tileSize;
           gy < camY + this.height + tileSize * 2; gy += tileSize) {
        const hash = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453
        if ((hash - Math.floor(hash)) > 0.6) {
          ctx.fillRect(gx - camX, gy - camY, tileSize * (0.7 + (hash - Math.floor(hash)) * 0.5), tileSize * 0.55)
        }
      }
    }

    // 3. 地图对象不再在此绘制，统一由 _renderYSortedEntities 按 Y 轴排序渲染
  }

  /**
   * 统一Y轴排序渲染 —— 伪3D层次感核心
   *
   * 将树木、装饰、宝箱、怪物、队友、主角全部收集到一个数组，
   * 按各自底部Y坐标（y + height）排序后依次绘制。
   * 排序靠前的先画（在后面/上方），排序靠后的后画（在前面/下方），
   * 自然产生"前遮后"的2.5D视觉效果。
   */
  _renderYSortedEntities(ctx) {
    const entities = []  // { sortY, type, data, renderFn }

    // 1. 收集地图障碍物（树、石块、灌木等）
    for (const obj of GRASSLAND_MAP_OBJECTS) {
      if (obj.type === GLAND_OBJ_TYPE.DECORATION) continue  // 装饰物始终在最前层
      const img = this.game.assets.get(obj.assetKey)
      if (!img) continue
      const screenX = obj.x * this.dpr - this.cameraX
      const screenY = obj.y * this.dpr - this.cameraY
      const w = (obj.w || obj.width || img.width) * this.dpr
      const h = (obj.h || obj.height || img.height) * this.dpr
      // 视野裁剪（宽松一点，避免排序时闪烁）
      if (screenX + w < -100 || screenX > this.width + 100 ||
          screenY + h < -100 || screenY > this.height + 100) continue
      entities.push({
        sortY: obj.y + (obj.h || obj.height || 80),  // 底部Y坐标
        type: 'obstacle',
        img, screenX, screenY, w, h,
      })
    }

    // 2. 收集地图装饰（草堆、花朵——始终在角色前面，给一个很大的sortY）
    for (const obj of GRASSLAND_MAP_OBJECTS) {
      if (obj.type !== GLAND_OBJ_TYPE.DECORATION) continue
      const img = this.game.assets.get(obj.assetKey)
      if (!img) continue
      const screenX = obj.x * this.dpr - this.cameraX
      const screenY = obj.y * this.dpr - this.cameraY
      const w = (obj.w || obj.width || img.width) * this.dpr
      const h = (obj.h || obj.height || img.height) * this.dpr
      if (screenX + w < -50 || screenX > this.width + 50 ||
          screenY + h < -50 || screenY > this.height + 50) continue
      entities.push({
        sortY: 999999,  // 装饰物始终最前
        type: 'decoration',
        img, screenX, screenY, w, h,
      })
    }

    // 3. 收集宝箱等交互对象
    if (this.mapObjects && Array.isArray(this.mapObjects)) {
      for (const obj of this.mapObjects) {
        if (obj.collected) continue
        const screenX = obj.x - this.cameraX
        const screenY = obj.y - this.cameraY
        if (screenX < -50 || screenX > this.width + 50 ||
            screenY < -50 || screenY > this.height + 50) continue
        entities.push({ sortY: obj.y, type: 'chest', screenX, screenY })
      }
    }

    // 4. 收集怪物 —— 坐标为物理像素
    if (this.mapMonsters && Array.isArray(this.mapMonsters)) {
      for (const monster of this.mapMonsters) {
        if (!monster.alive) continue
        const screenX = monster.x - this.cameraX
        const screenY = monster.y - this.cameraY
        if (screenX < -100 || screenX > this.width + 100 ||
            screenY < -100 || screenY > this.height + 100) continue
        // sortY 转为逻辑像素，+40 为怪物脚底偏移
        entities.push({
          sortY: monster.y / this.dpr + 40,
          type: 'monster', monster, screenX, screenY,
        })
      }
    }

    // 5. 收集队友 —— 坐标来自 field-movement（物理像素）
    if (this.followers && Array.isArray(this.followers)) {
      for (let i = 0; i < this.followers.length; i++) {
        const f = this.followers[i]
        if (!f) continue
        const screenX = f.x - this.cameraX
        const screenY = f.y - this.cameraY
        // sortY 转为逻辑像素
        entities.push({
          sortY: f.y / this.dpr + 50,
          type: 'follower', index: i, f, screenX, screenY,
        })
      }
    }

    // 6. 收集主角 —— 使用 playerX/Y（物理像素，与移动/碰撞系统一致）
    if (typeof this.playerX === 'number') {
      const px = this.playerX - this.cameraX
      const py = this.playerY - this.cameraY
      // sortY 转为逻辑像素（与地图对象的 obj.y 同单位）
      entities.push({
        sortY: this.playerY / this.dpr + 50,
        type: 'player', px, py,
      })
    }

    // ── 按 sortY 升序排序（Y小的先画=在后，Y大的后画=在前）──
    entities.sort((a, b) => a.sortY - b.sortY)

    // ── 统一绘制 ──
    for (const e of entities) {
      switch (e.type) {
        case 'obstacle':
        case 'decoration':
          ctx.drawImage(e.img, e.screenX, e.screenY, e.w, e.h)
          break
        case 'chest':
          ctx.font = `${24 * this.dpr}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('📦', e.screenX, e.screenY)
          break
        case 'monster': {
          const useCatAnim = !e.monster.isBoss && !e.monster.isElite
          if (useCatAnim) {
            this._renderCatMonster(ctx, e.monster, e.screenX, e.screenY)
          } else {
            this._renderEmojiMonster(ctx, e.monster, e.screenX, e.screenY)
          }
          break
        }
        case 'follower':
          this._drawFollowerAt(ctx, e.f, e.screenX, e.screenY, e.index)
          break
        case 'player':
          this._renderPlayer(ctx)
          break
      }
    }
  }

  /**
   * 绘制单个地图对象（考虑相机偏移）
   */
  _drawMapObject(ctx, obj) {
    const img = this.game.assets.get(obj.assetKey)
    if (!img) return
    
    const screenX = obj.x * this.dpr - this.cameraX
    const screenY = obj.y * this.dpr - this.cameraY
    const w = (obj.w || obj.width || img.width) * this.dpr
    const h = (obj.h || obj.height || img.height) * this.dpr

    // 视野裁剪（只绘制可见区域内的对象）
    if (screenX + w < -50 || screenX > this.width + 50 ||
        screenY + h < -50 || screenY > this.height + 50) return

    ctx.drawImage(img, screenX, screenY, w, h)
  }
  
  render(ctx) {
    // 地图背景（程序化渲染只画草地纹理）
    if (this.areaInfo.fieldBg) {
      const bgImage = this.game.assets.get(this.areaInfo.fieldBg)
      if (bgImage) {
        ctx.drawImage(
          bgImage,
          this.cameraX / this.dpr, this.cameraY / this.dpr,
          this.width / this.dpr, this.height / this.dpr,
          0, 0, this.width, this.height
        )
      } else {
        ctx.fillStyle = this.areaInfo.color
        ctx.fillRect(0, 0, this.width, this.height)
      }
    } else {
      this._renderProgrammaticMap(ctx)
    }

    // ══ 统一Y轴排序渲染（伪3D层次感）══
    // 树木/装饰/宝箱/怪物/队友/主角 全部按底部Y坐标排序后绘制
    this._renderYSortedEntities(ctx)
    
    // 顶部UI
    this._renderTopUI(ctx)
    
    // 摇杆
    this._renderJoystick(ctx)
    
    // 返回按钮（左上角）
    const backBtnX = 20 * this.dpr
    const backBtnY = 20 * this.dpr
    const backBtnW = 90 * this.dpr
    const backBtnH = 40 * this.dpr
    
    // 按钮背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.beginPath()
    this._roundRect(ctx, backBtnX, backBtnY, backBtnW, backBtnH, 8 * this.dpr)
    ctx.fill()
    
    // 按钮边框
    ctx.strokeStyle = 'rgba(100, 149, 237, 0.8)'
    ctx.lineWidth = 2 * this.dpr
    ctx.stroke()
    
    // 按钮文字
    ctx.font = `bold ${16 * this.dpr}px sans-serif`
    ctx.fillStyle = '#333333'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🏠 城镇', backBtnX + backBtnW / 2, backBtnY + backBtnH / 2)
    
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

  /**
   * 渲染跟随队友
   */
  _renderFollowers(ctx) {
    if (!this.followers || !Array.isArray(this.followers)) return
    const targetHeight = 80 * this.dpr // 与小镇一致

    for (const follower of this.followers) {
      // 转换为屏幕坐标
      const screenX = follower.x - this.cameraX
      const screenY = follower.y - this.cameraY

      // 获取当前动画帧图片
      let frameImg = null
      const heroId = follower.character.id
      const isCat = heroId.toLowerCase().includes('cat') || heroId === 'mao' // 猫咪角色

      if (heroId === 'zhenbao') {
        // 臻宝使用新版动画（walk帧从walk_01开始，+1偏移）
        if (follower._effectiveMoving) {
          const walkKey = `HERO_ZHENBAO_WALK_${(follower.animFrame + 1).toString().padStart(2, '0')}`
          frameImg = this.game.assets.get(walkKey)
        } else {
          const idleKey = `HERO_ZHENBAO_IDLE_${(follower.animFrame + 1).toString().padStart(2, '0')}`
          frameImg = this.game.assets.get(idleKey)
        }
      } else if (heroId === 'lixiaobao') {
        // 李小宝使用透明背景动画（帧从01开始，+1偏移，默认朝左）
        if (follower._effectiveMoving) {
          const walkKey = `HERO_LIXIAOBAO_WALK_${(follower.animFrame + 1).toString().padStart(2, '0')}`
          frameImg = this.game.assets.get(walkKey)
        } else {
          const idleKey = `HERO_LIXIAOBAO_IDLE_${(follower.animFrame + 1).toString().padStart(2, '0')}`
          frameImg = this.game.assets.get(idleKey)
        }
      } else if (heroId === 'slime_cat') {
        // 史莱姆猫使用专属动画资源（transparent/slime_cat目录）
        if (follower._effectiveMoving) {
          frameImg = this.game.assets.get(`SLIME_CAT_WALK_${(follower.animFrame + 1).toString().padStart(2, '0')}`)
        } else {
          frameImg = this.game.assets.get(`SLIME_CAT_IDLE_${follower.animFrame + 1}`)
        }
      } else if (heroId === 'shadow_mouse') {
        // 暗影鼠使用专属动画资源
        if (follower._effectiveMoving) {
          frameImg = this.game.assets.get(`SHADOW_MOUSE_WALK_${(follower.animFrame + 1).toString().padStart(2, '0')}`)
        } else {
          frameImg = this.game.assets.get(`SHADOW_MOUSE_IDLE_${String(follower.animFrame + 1).padStart(2, '0')}`)
        }
      } else if (isCat) {
        // 猫咪使用特殊的动画资源
        if (follower._effectiveMoving) {
          const walkKey = `CAT_WALK_${(follower.animFrame + 1).toString().padStart(2, '0')}`
          frameImg = this.game.assets.get(walkKey)
        } else {
          const idleKey = `CAT_IDLE_${(follower.animFrame + 1).toString().padStart(2, '0')}`
          frameImg = this.game.assets.get(idleKey)
        }
      } else {
        // 普通英雄使用标准动画资源
        if (follower._effectiveMoving) {
          const walkKey = `HERO_${heroId.toUpperCase()}_WALK_${follower.animFrame}`
          frameImg = this.game.assets.get(walkKey)
        } else {
          const idleKey = `HERO_${heroId.toUpperCase()}_IDLE_${follower.animFrame}`
          frameImg = this.game.assets.get(idleKey)
        }
      }

      // 如果动画帧不存在，尝试使用静态立绘
      if (!frameImg) {
        frameImg = this.game.assets.get(`HERO_${heroId.toUpperCase()}`)
      }

      if (frameImg) {
        const imgWidth = frameImg.width
        const imgHeight = frameImg.height
        const scale = targetHeight / imgHeight
        const renderWidth = imgWidth * scale
        const renderHeight = targetHeight

        ctx.save()

        // 根据角色素材默认朝向决定是否翻转（与主角一致）
        if (heroId === 'zhenbao' || heroId === 'lixiaobao') {
          // 臻宝/李小宝：默认朝右 → facingLeft 时翻转
          if (follower.facingLeft) {
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
            ctx.drawImage(
              frameImg,
              screenX - renderWidth / 2,
              screenY - renderHeight / 2,
              renderWidth,
              renderHeight
            )
          }
        } else {
          // 李小宝及其他：默认朝左 → !facingLeft 时翻转
          if (!follower.facingLeft) {
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
            ctx.drawImage(
              frameImg,
              screenX - renderWidth / 2,
              screenY - renderHeight / 2,
              renderWidth,
              renderHeight
            )
          }
        }

        ctx.restore()
        
        // 底部阴影
        ctx.beginPath()
        ctx.ellipse(screenX, screenY + targetHeight / 2 + 5 * this.dpr, targetHeight / 2.5, 8 * this.dpr, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fill()
      }
    }
  }

  /**
   * 在指定屏幕坐标渲染单个队友（供 Y 排序统一渲染调用）
   */
  _drawFollowerAt(ctx, follower, screenX, screenY) {
    const targetHeight = 80 * this.dpr
    let frameImg = null
    const heroId = follower.character.id
    const isCat = heroId.toLowerCase().includes('cat') || heroId === 'mao'

    if (heroId === 'zhenbao') {
      frameImg = follower._effectiveMoving
        ? this.game.assets.get(`HERO_ZHENBAO_WALK_${(follower.animFrame + 1).toString().padStart(2, '0')}`)
        : this.game.assets.get(`HERO_ZHENBAO_IDLE_${(follower.animFrame + 1).toString().padStart(2, '0')}`)
    } else if (heroId === 'lixiaobao') {
      frameImg = follower._effectiveMoving
        ? this.game.assets.get(`HERO_LIXIAOBAO_WALK_${(follower.animFrame + 1).toString().padStart(2, '0')}`)
        : this.game.assets.get(`HERO_LIXIAOBAO_IDLE_${(follower.animFrame + 1).toString().padStart(2, '0')}`)
    } else if (heroId === 'slime_cat') {
      frameImg = follower._effectiveMoving
        ? this.game.assets.get(`SLIME_CAT_WALK_${(follower.animFrame + 1).toString().padStart(2, '0')}`)
        : this.game.assets.get(`SLIME_CAT_IDLE_${follower.animFrame + 1}`)
    } else if (heroId === 'shadow_mouse') {
      frameImg = follower._effectiveMoving
        ? this.game.assets.get(`SHADOW_MOUSE_WALK_${(follower.animFrame + 1).toString().padStart(2, '0')}`)
        : this.game.assets.get(`SHADOW_MOUSE_IDLE_${String(follower.animFrame + 1).padStart(2, '0')}`)
    } else if (isCat) {
      frameImg = follower._effectiveMoving
        ? this.game.assets.get(`CAT_WALK_${(follower.animFrame + 1).toString().padStart(2, '0')}`)
        : this.game.assets.get(`CAT_IDLE_${(follower.animFrame + 1).toString().padStart(2, '0')}`)
    } else {
      frameImg = follower._effectiveMoving
        ? this.game.assets.get(`HERO_${heroId.toUpperCase()}_WALK_${follower.animFrame}`)
        : this.game.assets.get(`HERO_${heroId.toUpperCase()}_IDLE_${follower.animFrame}`)
    }
    if (!frameImg) {
      frameImg = this.game.assets.get(`HERO_${heroId.toUpperCase()}`)
    }
    if (!frameImg) return

    const imgWidth = frameImg.width
    const imgHeight = frameImg.height
    const scale = targetHeight / imgHeight
    const renderWidth = imgWidth * scale
    const renderHeight = targetHeight

    ctx.save()
    if (heroId === 'zhenbao' || heroId === 'lixiaobao') {
      if (follower.facingLeft) {
        ctx.translate(screenX, screenY)
        ctx.scale(-1, 1)
        ctx.drawImage(frameImg, -renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight)
      } else {
        ctx.drawImage(frameImg, screenX - renderWidth / 2, screenY - renderHeight / 2, renderWidth, renderHeight)
      }
    } else {
      if (!follower.facingLeft) {
        ctx.translate(screenX, screenY)
        ctx.scale(-1, 1)
        ctx.drawImage(frameImg, -renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight)
      } else {
        ctx.drawImage(frameImg, screenX - renderWidth / 2, screenY - renderHeight / 2, renderWidth, renderHeight)
      }
    }
    ctx.restore()

    // 底部阴影
    ctx.beginPath()
    ctx.ellipse(screenX, screenY + targetHeight / 2 + 5 * this.dpr, targetHeight / 2.5, 8 * this.dpr, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fill()
  }
  
  _renderPlayer(ctx) {
    const targetHeight = 80 * this.dpr // 与小镇一致的角色大小

    // 转换为屏幕坐标
    const screenX = this.playerX - this.cameraX
    const screenY = this.playerY - this.cameraY

    // 获取当前动画帧图片
    let frameImg = null
    const heroId = this.mainCharacter?.id || 'zhenbao'
    const isCat = heroId.toLowerCase().includes('cat') || heroId === 'mao' // 猫咪角色

    if (heroId === 'zhenbao') {
      // 臻宝使用新版动画（walk帧从walk_01开始，+1偏移）
      if (this._effectiveMoving) {
        const walkKey = `HERO_ZHENBAO_WALK_${(this.animFrame + 1).toString().padStart(2, '0')}`
        frameImg = this.game.assets.get(walkKey)
      } else {
        const idleKey = `HERO_ZHENBAO_IDLE_${(this.animFrame + 1).toString().padStart(2, '0')}`
        frameImg = this.game.assets.get(idleKey)
      }
    } else if (heroId === 'lixiaobao') {
      // 李小宝使用透明背景动画（帧从01开始，+1偏移，默认朝左）
      if (this._effectiveMoving) {
        const walkKey = `HERO_LIXIAOBAO_WALK_${(this.animFrame + 1).toString().padStart(2, '0')}`
        frameImg = this.game.assets.get(walkKey)
      } else {
        const idleKey = `HERO_LIXIAOBAO_IDLE_${(this.animFrame + 1).toString().padStart(2, '0')}`
        frameImg = this.game.assets.get(idleKey)
      }
    } else if (heroId === 'slime_cat') {
      // 史莱姆猫使用专属动画资源
      if (this._effectiveMoving) {
        const walkKey = `SLIME_CAT_WALK_${(this.animFrame + 1).toString().padStart(2, '0')}`
        frameImg = this.game.assets.get(walkKey)
      } else {
        const idleKey = `SLIME_CAT_IDLE_${this.animFrame + 1}`
        frameImg = this.game.assets.get(idleKey)
      }
    } else if (heroId === 'shadow_mouse') {
      // 暗影鼠使用专属动画资源
      if (this._effectiveMoving) {
        const walkKey = `SHADOW_MOUSE_WALK_${(this.animFrame + 1).toString().padStart(2, '0')}`
        frameImg = this.game.assets.get(walkKey)
      } else {
        const idleKey = `SHADOW_MOUSE_IDLE_${String(this.animFrame + 1).padStart(2, '0')}`
        frameImg = this.game.assets.get(idleKey)
      }
    } else {
      // 普通英雄使用标准动画资源（HERO_XXX_WALK_0格式，索引从0开始）
        if (this._effectiveMoving) {
        const walkKey = `HERO_${heroId.toUpperCase()}_WALK_${this.animFrame}`
        frameImg = this.game.assets.get(walkKey)
      } else {
        const idleKey = `HERO_${heroId.toUpperCase()}_IDLE_${this.animFrame}`
        frameImg = this.game.assets.get(idleKey)
      }
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

      // 根据角色素材默认朝向决定是否翻转
      // 臻宝/李小宝: 默认朝右 → 向左(facingLeft)时翻转
      // 其他角色: 默认朝左 → 向右(!facingLeft)时翻转
      if (heroId === 'zhenbao' || heroId === 'lixiaobao') {
        if (this.facingLeft) {
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
          ctx.drawImage(
            frameImg,
            screenX - renderWidth / 2,
            screenY - renderHeight / 2,
            renderWidth,
            renderHeight
          )
        }
      } else {
        // 李小宝及其他角色：默认朝左
        if (!this.facingLeft) {
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
          ctx.drawImage(
            frameImg,
            screenX - renderWidth / 2,
            screenY - renderHeight / 2,
            renderWidth,
            renderHeight
          )
        }
      }

      // 恢复状态
      ctx.restore()
      
      // 底部阴影（不翻转）
      ctx.beginPath()
      ctx.ellipse(screenX, screenY + targetHeight * 0.45, targetHeight / 3, 7 * this.dpr, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fill()

      // 移动时添加轻微的方向指示器
      if (this._effectiveMoving) {
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
      if (screenX < -100 || screenX > this.width + 100 ||
          screenY < -100 || screenY > this.height + 100) {
        continue
      }

      // 所有普通怪物使用坏猫动画，Boss/精英使用emoji
      const useCatAnim = !monster.isBoss && !monster.isElite

      if (useCatAnim) {
        // 使用猫咪动画渲染
        this._renderCatMonster(ctx, monster, screenX, screenY)
      } else {
        // 使用emoji渲染（Boss、精英等）
        this._renderEmojiMonster(ctx, monster, screenX, screenY)
      }
    }
  }

  /**
   * 渲染猫咪怪物（使用动画帧）
   */
  _renderCatMonster(ctx, monster, screenX, screenY) {
    const targetHeight = 80 * this.dpr // 猫咪怪物尺寸（比主角小一点）

    // 获取动画帧图片
    let frameImg = null
    if (monster.isMoving) {
      if (monster.id === 'slime_cat') {
        frameImg = this.game.assets.get(`SLIME_CAT_WALK_${(monster.animFrame + 1).toString().padStart(2, '0')}`)
      } else if (monster.id === 'shadow_mouse') {
        frameImg = this.game.assets.get(`SHADOW_MOUSE_WALK_${(monster.animFrame + 1).toString().padStart(2, '0')}`)
      } else {
        const walkKey = `CAT_WALK_${(monster.animFrame + 1).toString().padStart(2, '0')}`
        frameImg = this.game.assets.get(walkKey)
      }
    } else {
      if (monster.id === 'slime_cat') {
        frameImg = this.game.assets.get(`SLIME_CAT_IDLE_${monster.animFrame + 1}`)
      } else if (monster.id === 'shadow_mouse') {
        frameImg = this.game.assets.get(`SHADOW_MOUSE_IDLE_${String(monster.animFrame + 1).padStart(2, '0')}`)
      } else {
        const idleKey = `CAT_IDLE_${(monster.animFrame + 1).toString().padStart(2, '0')}`
        frameImg = this.game.assets.get(idleKey)
      }
    }

    if (frameImg) {
      const imgWidth = frameImg.width
      const imgHeight = frameImg.height
      const scale = targetHeight / imgHeight
      const renderWidth = imgWidth * scale
      const renderHeight = targetHeight

      // 根据移动方向决定朝向
      const facingLeft = monster.moveAngle !== undefined ? Math.cos(monster.moveAngle) < 0 : true

      ctx.save()

      // Boss/精英光环
      if (monster.isBoss || monster.isElite) {
        ctx.beginPath()
        ctx.arc(screenX, screenY, 45 * this.dpr, 0, Math.PI * 2)
        ctx.fillStyle = monster.isBoss ? 'rgba(255, 71, 87, 0.3)' : 'rgba(124, 92, 224, 0.3)'
        ctx.fill()
      }

      // 绘制猫咪（带方向翻转）
      if (!facingLeft) {
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
        ctx.drawImage(
          frameImg,
          screenX - renderWidth / 2,
          screenY - renderHeight / 2,
          renderWidth,
          renderHeight
        )
      }

      ctx.restore()

      // 底部阴影
      ctx.beginPath()
      ctx.ellipse(screenX, screenY + renderHeight / 2 + 5 * this.dpr, renderWidth / 2.5, 8 * this.dpr, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fill()
    } else {
      // 备用：如果动画帧加载失败，使用emoji
      this._renderEmojiMonster(ctx, monster, screenX, screenY)
      return
    }

    // 怪物名称
    ctx.font = `${12 * this.dpr}px sans-serif`
    ctx.fillStyle = monster.isBoss ? '#ff4757' :
                   monster.isElite ? '#a55eea' : '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(monster.name, screenX, screenY + targetHeight / 2 + 25 * this.dpr)

    // 靠近警告
    this._renderMonsterWarning(ctx, monster, screenX, screenY, targetHeight)
  }

  /**
   * 渲染emoji怪物（Boss、精英等非猫类）
   */
  _renderEmojiMonster(ctx, monster, screenX, screenY) {
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

    // 怪物图标
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

    // 靠近警告
    this._renderMonsterWarning(ctx, monster, screenX, screenY, 32)
  }

  /**
   * 渲染怪物警告指示器
   */
  _renderMonsterWarning(ctx, monster, screenX, screenY, monsterHeight) {
    const dist = Math.sqrt(
      (this.playerX - monster.x) ** 2 + (this.playerY - monster.y) ** 2
    )

    if (dist < 200 * this.dpr) {
      ctx.font = `${20 * this.dpr}px sans-serif`
      ctx.fillStyle = '#ff9f43'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const warningBob = Math.sin(this.time * 5) * 3 * this.dpr
      ctx.fillText('⚠️', screenX, screenY - monsterHeight / 2 - 15 * this.dpr + warningBob)
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
    const jc = this.joystickConfig
    
    // 固定底座位置
    const baseX = jc.centerX
    const baseY = jc.centerY
    
    if (this.joystick.active) {
      const dx = this.joystick.currentX - jc.centerX
      const dy = this.joystick.currentY - jc.centerY
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      // 计算手柄位置（限制在最大偏移范围内）
      let handleX = baseX
      let handleY = baseY
      if (dist > 0) {
        const clampedDist = Math.min(dist, jc.maxOffset)
        handleX = baseX + (dx / dist) * clampedDist
        handleY = baseY + (dy / dist) * clampedDist
      }
      
      // 底座
      ctx.beginPath()
      ctx.arc(baseX, baseY, jc.baseRadius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 2 * this.dpr
      ctx.stroke()
      
      // 手柄
      ctx.beginPath()
      ctx.arc(handleX, handleY, jc.handleRadius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 2 * this.dpr
      ctx.stroke()
    } else {
      // 未激活：显示半透明摇杆提示
      ctx.beginPath()
      ctx.arc(baseX, baseY, jc.baseRadius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 2 * this.dpr
      ctx.stroke()
      
      ctx.beginPath()
      ctx.arc(baseX, baseY, jc.handleRadius, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fill()
      
      ctx.font = `${14 * this.dpr}px sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('移动', baseX, baseY)
    }
  }
  
  _renderMinimap(ctx) {
    if (!this.mapMonsters || !this.mapObjects) return
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
