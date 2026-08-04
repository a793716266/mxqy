/**
 * field-scene.js - 野外探索场景（可移动大地图）
 */

import { ENEMIES_CH1, ENEMIES_CH2, getEnemyByLevel } from '../data/enemies.js'
import { installFieldBattleSystem } from '../systems/field-battle-system.js'
import { HEROES } from '../data/heroes.js'
import { getMapCollisionsSync } from '../data/map_collisions.js'
import { isPointInObstacle as _isPointInGrasslandObstacle, generateGrasslandCollisions as _genGrassCollisions, GRASSLAND_MAP_CONFIG, GRASSLAND_MAP_OBJECTS, GLAND_OBJ_TYPE } from '../data/grassland-map-data.js'
import { RENDER_LAYER, getRenderLayer, isSortableLayer } from '../data/render-layer-config.js'
import { charStateManager } from '../data/character-state.js'
import { CharacterState } from '../data/character-state.js'
import { CharacterInfoPanel } from '../ui/character-info-panel.js'
import { equipmentManager } from '../managers/equipment-manager.js'
import { getBossDrop, getRandomEquipment } from '../data/equipment.js'
import { Renderer2D5 } from '../engine/renderer-2.5d.js'
import { CollisionEngine } from '../engine/collision-engine.js'
import { roundRect, drawButton, darkenColor } from '../ui/canvas-utils.js'
import { SceneBase } from '../core/scene-base.js'
import { CharacterSprite } from '../core/character-sprite.js'

export class FieldScene extends SceneBase {
  constructor(game, data) {
    super(game)
    
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
    
    // 怪物配置缓存
    this._monsterConfigCache = {}
    this._movingHoldFrames = 0      // 停止移动后的保持计数器（帧）
    this._MOVING_HOLD = 5           // 停止后保持5帧(约80ms)不切回idle
    this.frameDuration = 0.15 // 每帧150ms
    
    // 摇杆控制（固定位置摇杆）
    this.joystick = { active: false, touchId: null, currentX: 0, currentY: 0 }
    
    // 初始化角色状态（必须在队伍初始化之前）
    const savedCharData = this.game.data.get('characterStates')
    charStateManager.init(savedCharData)

    // ★ 兜底：单例可能在 field-scene 之前（如主菜单）被提前初始化，
    //   此时 ensureDefault 已执行，但若存档异常导致李小宝缺失，这里补建
    {
      const all = charStateManager.getAllCharacters()
      if (all.length < 2 || !charStateManager.getCharacter('lixiaobao')) {
        const heroData = HEROES.find(h => h.id === 'lixiaobao')
        if (heroData && !charStateManager.getCharacter('lixiaobao')) {
          const cs = new CharacterState(heroData)
          cs.hp = cs.maxHp
          cs.mp = cs.maxMp
          charStateManager.characters.set('lixiaobao', cs)
          console.warn('[Field] 兜底创建缺失角色: 李小宝')
        }
      }
    }
    
    // 初始化装备管理器
    const savedEquipData = this.game.data.get('equipmentData')
    equipmentManager.init(savedEquipData)
    
    // 队伍（使用角色状态管理中的数据）
    this.party = this._initParty()
    
    // 获取第一个角色（主角）
    this.mainCharacter = charStateManager.getAllCharacters()[0]

    // 为主要角色创建 CharacterSprite（包含渲染逻辑和阴影）
    this.mainCharacterSprite = null
    if (this.mainCharacter) {
      // 从 HEROES 中找到对应的角色数据（包含 renderConfig）
      const heroData = HEROES.find(h => h.id === this.mainCharacter.id)
      if (heroData) {
        // 合并状态数据和配置数据
        const spriteData = { ...heroData, ...this.mainCharacter }
        this.mainCharacterSprite = new CharacterSprite(game, spriteData)
      }
    }

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
    
    // ★ 新增：ARPG战斗系统（在地图上直接战斗）
    this.battleSystem = {
      active: false,          // 是否处于战斗状态
      attackButton: null,     // 攻击按钮
      skillButtons: [],       // 技能按钮
      playerAttackCD: 0,     // 玩家攻击冷却
      playerAttackInterval: 1000, // 玩家攻击间隔（毫秒）
      damageTexts: [],       // 伤害数字数组
      battleTarget: null,     // 当前战斗目标
      attackRange: 80,       // 玩家攻击范围（像素）
      showBattleUI: false     // 是否显示战斗UI
    }

    // ★ 强制清除旧存档（避免 NaN 数据影响测试）
    // TODO: 测试通过后删除此代码
    try {
      const saved = this.game.data.get(`fieldMonsters_${this.areaId}`)
      if (saved && Array.isArray(saved)) {
        this.game.data.remove(`fieldMonsters_${this.areaId}`)
        console.warn(`[Field] 已强制清除旧存档: fieldMonsters_${this.areaId}`)
      }
    } catch (e) {
      console.error('[Field] 清除旧存档失败:', e)
    }

    // 地图怪物（尝试恢复保存的状态，每个副本独立保存）
    const savedMonsters = this.game.data.get(`fieldMonsters_${this.areaId}`)
    console.log(`[Field] 尝试恢复区域 ${this.areaId} 的怪物状态, 已保存: ${!!savedMonsters}`)
    
    if (savedMonsters && Array.isArray(savedMonsters) && savedMonsters.length > 0) {
      // 验证怪物数据是否属于当前区域
      const validMonsters = savedMonsters.filter(m => m.id && m.id.startsWith(`${this.areaId}_`))
      
      if (validMonsters.length === savedMonsters.length) {
        // 所有怪物都属于当前区域
        this.mapMonsters = savedMonsters
        
        // ★ 属性迁移：补充缺失的战斗属性（兼容旧存档）
        this.mapMonsters.forEach(monster => {
          if (!monster.alive) return
          
          // 如果缺失战斗属性，从 enemyData 补充
          if (monster.atk === undefined || monster.def === undefined || monster.hp === undefined) {
            const enemyData = (this.areaInfo.enemyData || ENEMIES_CH1)[monster.enemyId]
            if (enemyData) {
              const finalData = getEnemyByLevel(enemyData, enemyData?.level || 1)
              monster.level = finalData.level
              monster.maxHp = finalData.maxHp
              monster.hp = finalData.hp
              monster.atk = finalData.atk
              monster.def = finalData.def
              monster.spd = finalData.spd
              monster.crit = finalData.crit
              monster.aiPattern = finalData.aiPattern
              monster.attackRange = finalData.attackRange || 80
              monster.attackInterval = finalData.attackInterval || 2000
              // ★ 标准化技能（与初次生成保持一致，补全 id/cooldown/range）
              monster.skills = this._normalizeMonsterSkills(finalData.skills, monster.enemyId)
              if (!monster.skillCDs) {
                monster.skillCDs = this._initSkillCDs(monster.skills)
                monster.isCastingSkill = false
                monster.skillAnimTimer = 0
                monster.skillCastId = null
              }
              if (monster.inCombat === undefined) {
                monster.inCombat = false
                monster.strafeDir = Math.random() > 0.5 ? 1 : -1
                monster.strafeTimer = 0
              }
              console.log(`[Field] 迁移怪物属性: ${monster.enemyId}, atk=${monster.atk}, def=${monster.def}, hp=${monster.hp}`)
            }
          }
          
          // 确保有 attackCDTimer 属性
          if (monster.attackCDTimer === undefined) {
            monster.attackCDTimer = 0
          }
        })
        
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

    // ── 2.5D 引擎（所有地图场景共用）─
    this._renderer2d5 = new Renderer2D5({ dpr: this.dpr, width: this.width, height: this.height })
    this._renderer2d5.setAssets(this.game.assets)
    // 碰撞检测引擎（替代原来散落在各场景的 _checkObstacleCollision）
    this._collisionEngine = new CollisionEngine({ dpr: this.dpr })
    this._collisionEngine.setObstacles(this.obstacles)
  }
  
  _getAreaInfo() {
    const areas = {
      grassland: {
        name: '阳光草原',
        fieldBg: null, // 程序化渲染（grassland-map-data.js）
        battleBg: 'BG_GRASSLAND', // 战斗背景
        enemies: ['wild_cat', 'slime_cat', 'shadow_mouse', 'flame_slime', 'aqua_slime', 'violet_slime', 'shadow_mouse_smooth'],
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
        enemies: ['slime_cat', 'shadow_mouse', 'wild_cat', 'flame_slime', 'aqua_slime', 'violet_slime', 'shadow_mouse_smooth'],
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
        enemies: ['shadow_mouse', 'slime_cat', 'wild_cat', 'shadow_mouse_smooth', 'flame_slime', 'aqua_slime', 'violet_slime'],
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
      const charData = allChars[i]
      
      // 从 HEROES 中找到对应的角色数据（包含 renderConfig）
      const heroData = HEROES.find(h => h.id === charData.id)
      let followerSprite = null
      
      if (heroData) {
        // 合并状态数据和配置数据
        const spriteData = { ...heroData, ...charData }
        followerSprite = new CharacterSprite(this.game, spriteData)
      }
      
      this.followers.push({
        character: charData,
        sprite: followerSprite, // 存储 CharacterSprite 实例
        // ★ 缓存翻转规则（与角色 renderConfig.flipRule 一致），供 _renderFollower 统一判定
        flipRule: (heroData && heroData.renderConfig && heroData.renderConfig.flipRule) || 'opposite',
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
        
        
        // ★ 使用 getEnemyByLevel 计算最终属性
        const finalBossData = getEnemyByLevel(bossData, bossData?.level || 5)

        // ★ 标准化技能数据
        const normalizedBossSkills = this._normalizeMonsterSkills(finalBossData.skills, bossId)

        monsters.push({
          id: `${this.areaId}_boss_${bossId}`,
          enemyId: bossId,
          x: bossX,
          y: bossY,
          name: finalBossData.name,
          isBoss: true,
          isElite: false,
          alive: true,
          // ★ 战斗属性
          level: finalBossData.level,
          maxHp: finalBossData.maxHp,
          hp: finalBossData.hp,
          atk: finalBossData.atk,
          def: finalBossData.def,
          spd: finalBossData.spd,
          crit: finalBossData.crit,
          aiPattern: finalBossData.aiPattern,
          attackRange: finalBossData.attackRange || 80,
          attackInterval: finalBossData.attackInterval || 2000,
          skills: normalizedBossSkills,
          // 技能冷却计时器（每个技能单独冷却，单位：秒）
          skillCDs: this._initSkillCDs(normalizedBossSkills),
          isCastingSkill: false,  // 是否正在施放技能
          skillAnimTimer: 0,      // 技能动画计时器（毫秒）
          skillCastId: null,      // 当前施放中的技能id
          // 战斗AI状态
          inCombat: false,        // 是否进入战斗（参与AI）
          skillUseCount: 0,       // 普攻计数，用于强制穿插技能
          strafeDir: Math.random() > 0.5 ? 1 : -1, // 横向走位方向
          strafeTimer: 0,         // 走位方向切换计时
          // 动画属性
          bobOffset: 0,
          bobSpeed: 1.5,
          animTimer: 0,
          animFrame: 0,
          attackCDTimer: 0,
          // 怪物巡逻移动
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

        // ★ 使用 getEnemyByLevel 计算最终属性（包含等级加成）
        const finalEnemyData = getEnemyByLevel(enemyData, enemyData?.level || 1)

        // ★ 标准化技能数据（enemies.js 中技能字段不统一，补全 id/cooldown/range 等）
        const normalizedSkills = this._normalizeMonsterSkills(finalEnemyData?.skills, enemyId)

        monsters.push({
          id: `${this.areaId}_monster_${i}`,  // 包含区域ID前缀
          enemyId: enemyId,
          x: x,
          y: y,
          name: finalEnemyData?.name || '坏猫',
          isBoss: finalEnemyData?.isBoss || false,
          isElite: finalEnemyData?.isElite || false,
          alive: true,
          // ★ 战斗属性（从 finalEnemyData 复制）
          level: finalEnemyData?.level || 1,
          maxHp: finalEnemyData?.maxHp || 50,
          hp: finalEnemyData?.hp || finalEnemyData?.maxHp || 50,
          atk: finalEnemyData?.atk || 10,
          def: finalEnemyData?.def || 5,
          spd: finalEnemyData?.spd || 9,
          crit: finalEnemyData?.crit || 0.05,
          aiPattern: finalEnemyData?.aiPattern || 'normal',
          attackRange: finalEnemyData?.attackRange || 80,
          attackInterval: finalEnemyData?.attackInterval || 2000,
          skills: normalizedSkills,
          // 技能冷却计时器（每个技能单独冷却，单位：秒）
          skillCDs: this._initSkillCDs(normalizedSkills),
          isCastingSkill: false,  // 是否正在施放技能
          skillAnimTimer: 0,      // 技能动画计时器（毫秒）
          skillCastId: null,      // 当前施放中的技能id
          // 战斗AI状态
          inCombat: false,        // 是否进入战斗（参与AI）
          skillUseCount: 0,       // 普攻计数，用于强制穿插技能
          strafeDir: Math.random() > 0.5 ? 1 : -1, // 横向走位方向
          strafeTimer: 0,         // 走位方向切换计时
          // 动画属性
          bobOffset: Math.random() * Math.PI * 2, // 随机浮动偏移
          bobSpeed: 2 + Math.random(), // 随机浮动速度
          animTimer: 0, // 动画计时器
          animFrame: 0, // 动画帧索引
          attackCDTimer: 0, // 攻击冷却计时器
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

    // 安装野外战斗系统（只执行一次）
    if (!this.constructor._battleSystemInstalled) {
      installFieldBattleSystem(this.constructor)
    }

    // 初始化战斗系统（为阳光草原副本模式准备）
    this._initFieldBattleSystem()

    // ★ 阳光草原副本模式：进入地图就激活战斗模式
    if (this.areaId === 'grassland') {
      console.log('[Field] 阳光草原副本模式：进入战斗状态')
      this.battleSystem.active = true
      this.battleSystem.showBattleUI = true
      // ★ 必须构建参战英雄列表（主角+跟随队友李小宝），否则 _updateAllyAI 遍历空数组，队友不会被AI接管
      this._buildBattleHeroes()
      this._initBattleUI()
    }

    // 初始化相机位置
    this._updateCamera()

    // 固定摇杆配置（底座在左下角固定位置，往左靠拢给右侧技能区腾出空间）
    const joystickCenterX = 105 * this.dpr
    const joystickCenterY = this.height - 105 * this.dpr
    this.joystickConfig = {
      centerX: joystickCenterX,     // 底座中心X（固定）
      centerY: joystickCenterY,     // 底座中心Y（固定）
baseRadius: 50 * this.dpr,    // 底座半径（缩小）
    handleRadius: 25 * this.dpr,  // 手柄半径（缩小）
    maxOffset: 45 * this.dpr,     // 手柄最大偏移
    deadZone: 5 * this.dpr        // 死区阈值
    }

    // ★ 摇杆输入统一在 update() 中通过 this.game.input.touches 读取（与战斗一致，避免两套
    // ★ 触摸 API 混用导致 touchId/坐标错配、摇杆无响应）。不再绑定 wx.onTouchStart。
    this._joystickTouchId = null
  }

  // 每帧从 InputManager 读取实时触点驱动左下固定摇杆
  _updateJoystickInput() {
    if (!this.game || !this.game.input) return
    const touches = this.game.input.touches || {}
    const jc = this.joystickConfig
    const joy = this.joystick

    // 构造触点列表 [{id,x,y}]（InputManager.touches 按 identifier 索引，坐标已乘 dpr）
    const points = Object.entries(touches).map(([id, p]) => ({ id: Number(id), x: p.x, y: p.y }))

    if (!joy.active) {
      // 寻找落在摇杆底座内的触点
      for (const tp of points) {
        const dx = tp.x - jc.centerX
        const dy = tp.y - jc.centerY
        if (Math.sqrt(dx * dx + dy * dy) < jc.baseRadius * 1.5) {
          joy.active = true
          joy.touchId = tp.id
          joy.currentX = tp.x
          joy.currentY = tp.y
          this._joystickTouchId = tp.id
          break
        }
      }
    }

    if (joy.active) {
      const tp = points.find(p => p.id === joy.touchId)
      if (tp) {
        joy.currentX = tp.x
        joy.currentY = tp.y
      } else {
        // 触点已松开
        joy.active = false
        joy.touchId = null
        this._joystickTouchId = null
      }
    }
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
        const newHeroData = HEROES.find(h => h.id === char.id)
        this.followers.push({
          character: char,
          // ★ 缓存翻转规则（与角色 renderConfig.flipRule 一致）
          flipRule: (newHeroData && newHeroData.renderConfig && newHeroData.renderConfig.flipRule) || 'opposite',
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

    // 清理摇杆状态（输入统一由 InputManager 管理，场景无需解绑全局监听）
    this.joystick.active = false
    this.joystick.touchId = null
    this._joystickTouchId = null
  }
  
  update(dt) {
    this.time += dt

    // 更新怪物移动
    this._updateMonsters(dt)

    // 摇杆输入（每帧从 InputManager 读取触点）
    this._updateJoystickInput()

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
        // 应用怪物减速 debuff（黏液包裹等）
        let speedFactor = 1
        if (this.battleSystem.playerDebuffs && this.battleSystem.playerDebuffs.length > 0) {
          for (const d of this.battleSystem.playerDebuffs) {
            if (d.effect === 'slow') speedFactor *= (1 - d.value)
          }
        }
        const moveX = (dx / dist) * this.playerSpeed * speedFactor * dt
        const moveY = (dy / dist) * this.playerSpeed * speedFactor * dt

        // 保存旧位置（用于碰撞回退）
        const oldX = this.playerX
        const oldY = this.playerY

        this.playerX += moveX
        this.playerY += moveY

        // ★ 同步被控英雄的世界坐标（战斗系统下，被控者即 playerX/playerY）
        if (this._heroWorldPos && this.battleSystem.battleHeroes && this.battleSystem.battleHeroes[0]) {
          const c = this.battleSystem.battleHeroes[0]
          this._heroWorldPos[c.partyIndex].x = this.playerX
          this._heroWorldPos[c.partyIndex].y = this.playerY
        }

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

    // ★ 新增：更新战斗系统
    if (this.battleSystem.active) {
      this._updateBattleSystem(dt)
    }

    // 更新队友跟随
    this._updateFollowers(dt)

    // 使用 CharacterSprite 更新主角动画
    if (this.mainCharacterSprite) {
      this.mainCharacterSprite.update(dt, this.isMoving, this.facingLeft)
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

      // ★ 支持序列帧动画的怪物列表（使用 _renderCatMonster 渲染）
      const useCatAnim = ['slime_cat', 'shadow_mouse', 'wild_cat', 'lost_healer_cat', 'flame_slime', 'aqua_slime', 'violet_slime', 'shadow_mouse_smooth'].includes(monster.enemyId)
      if (useCatAnim && monster.animTimer === undefined) {
        monster.animTimer = 0
        monster.animFrame = 0
      }

      // 更新猫咪动画（无论是否暂停）
      if (useCatAnim) {
        // ★ 技能动画（优先级最高）
        if (monster.isCastingSkill && monster.skillAnimTimer > 0) {
          const enemyConfig = this._getMonsterConfig(monster.enemyId)
          const skillConf = enemyConfig?.animationConfig?.skill
          if (skillConf) {
            if (skillConf.frameList) {
              const total = skillConf.frameList.length
              const progress = 1 - (monster.skillAnimTimer / (total * (skillConf.frameDuration || 100)))
              const idx = Math.min(Math.floor(progress * total), total - 1)
              monster.animFrame = idx
            } else {
              const total = skillConf.end - skillConf.start + 1
              const progress = 1 - (monster.skillAnimTimer / (total * (skillConf.frameDuration || 100)))
              const idx = Math.min(Math.floor(progress * total), total - 1)
              monster.animFrame = idx
            }
          }
        }
        // ★ 攻击动画（优先级次高）
        else if (monster.isAttacking && monster.attackAnimTimer > 0) {
          monster.attackAnimTimer -= dt * 1000
          
          // 攻击动画：使用 attack 帧
          const enemyConfig = this._getMonsterConfig(monster.enemyId)
          if (enemyConfig && enemyConfig.animationConfig.attack) {
            const attackConf = enemyConfig.animationConfig.attack
            
            // 支持 frameList（非连续帧号）和连续帧
            if (attackConf.frameList) {
              // 非连续帧号：根据进度选择 frameList 中的帧号
              const totalFrames = attackConf.frameList.length
              const progress = 1 - (monster.attackAnimTimer / 500) // 500ms 攻击动画
              const frameIdx = Math.floor(progress * totalFrames)
              monster.animFrame = Math.min(frameIdx, totalFrames - 1)
            } else {
              // 连续帧号
              const totalFrames = attackConf.end - attackConf.start + 1
              const progress = 1 - (monster.attackAnimTimer / 500)
              const frameIdx = Math.floor(progress * totalFrames)
              monster.animFrame = Math.min(frameIdx, totalFrames - 1)
            }
          }
          
          // ★ 在攻击动画的 60% 进度时计算伤害（命中帧）
          const attackProgress = 1 - (monster.attackAnimTimer / 500)
          if (attackProgress >= 0.6 && !monster.hasDealtDamage) {
            // 找到最近的英雄并造成伤害
            const mainHero = this.party[0]
            if (mainHero && mainHero.hp > 0) {
              this._dealMonsterDamage(monster, mainHero)
            }
          }
          
          if (monster.attackAnimTimer <= 0) {
            monster.isAttacking = false
            monster.attackAnimTimer = 0
            monster.animFrame = 0
          }
        } else {
          // 普通待机/移动动画
          monster.animTimer += dt
          
          // ★ 根据怪物类型确定帧数
          let walkFrames = 12
          let idleFrames = 8
          if (monster.enemyId === 'slime_cat' || monster.enemyId === 'flame_slime' || monster.enemyId === 'aqua_slime' || monster.enemyId === 'violet_slime') {
            walkFrames = 12
            idleFrames = 7  // 史莱姆猫系 idle 7 帧
          } else if (monster.enemyId === 'shadow_mouse') {
            walkFrames = 8
            idleFrames = 6  // 暗影鼠 idle 6 帧
          } else if (monster.enemyId === 'shadow_mouse_smooth') {
            walkFrames = 15  // 补帧顺滑版 15 帧
            idleFrames = 6
          } else if (monster.enemyId === 'lost_healer_cat') {
            walkFrames = 8  // 艾米 walk 8 帧
            idleFrames = 8  // 艾米 idle 8 帧
          } else {
            // wild_cat 等普通猫咪
            walkFrames = 12
            idleFrames = 8
          }
          
          const frameDuration = monster.isMoving ? 0.08 : 0.15

          if (monster.animTimer >= frameDuration) {
            monster.animTimer = 0
            if (monster.isMoving) {
              monster.animFrame = (monster.animFrame + 1) % walkFrames
            } else {
              monster.animFrame = (monster.animFrame + 1) % idleFrames
            }
          }
        }
      }

      // ★ 处于战斗（inCombat）的怪物跳过巡逻移动，由 _updateMonsterAttack 控制走位
      const isBattleTarget = monster.inCombat === true
      if (!isBattleTarget) {
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
      } // !isBattleTarget
    }
  }

  /**
   * ★ 新增：初始化怪物技能冷却表
   * 每个技能单独维护一个倒计时（秒），初始为 0 表示就绪
   * 注意：enemies.js 中的技能定义可能缺少 id/cooldown/range 等字段，
   * 这里统一以 s.id || s.name 作为冷却表的 key，保证多技能不互相覆盖。
   */
  _initSkillCDs(skills) {
    const cds = {}
    if (Array.isArray(skills)) {
      skills.forEach((s, i) => {
        const key = s.id || s.name || `skill_${i}`
        cds[key] = 0
      })
    }
    return cds
  }

  /**
   * ★ 新增：标准化怪物技能数据
   * enemies.js 中的技能定义字段不统一（缺 id/cooldown/range 等），
   * 这里补全为 AI 与施法逻辑可消费的统一格式。
   */
  _normalizeMonsterSkills(skills, enemyId) {
    if (!Array.isArray(skills) || skills.length === 0) return []
    return skills.map((s, i) => ({
      id: s.id || `${enemyId}_sk_${i}`,
      name: s.name || '技能',
      type: s.type || 'attack',
      power: s.power != null ? s.power : 1,
      cooldown: s.cooldown || 6,           // 默认 6 秒冷却
      range: s.range || 120,               // 默认 120 像素释放距离
      projectile: !!s.projectile,
      projectileSpeed: s.projectileSpeed || 220,
      effect: s.effect || null,
      value: s.value || 0,
      duration: s.duration || 3,
      dashDistance: s.dashDistance || 120,
      healAmount: s.healAmount || 0,
      summonId: s.summonId || null,
      target: s.target || 'single',
      desc: s.desc || ''
    }))
  }

  /**
   * ★ 新增：怪物对英雄造成伤害
   */
  _dealMonsterDamage(monster, hero) {
    if (!monster || !hero || hero.hp <= 0) return

    // 计算伤害（参考玩家攻击公式，考虑暴击）
    let base = Math.max(1, monster.atk - Math.floor(hero.def * 0.5))
    const isCrit = Math.random() < (monster.crit || 0.05)
    let damage = isCrit ? Math.floor(base * 1.5) : base

    hero.hp = Math.max(0, hero.hp - damage)

    // 伤害数字
    const screenX = hero.x !== undefined ? hero.x : this.playerX
    const screenY = hero.y !== undefined ? hero.y : this.playerY
    this.battleSystem.damageTexts.push({
      text: (isCrit ? '暴击 ' : '') + `-${damage}`,
      x: screenX - this.cameraX,
      y: screenY - this.cameraY - 40 * this.dpr,
      color: isCrit ? '#ff9f1a' : '#ff4757',
      life: 1.0
    })

    // 同步回角色状态管理（确保战斗结算后存档正确）
    try {
      const charState = charStateManager.getCharacter(hero.id)
      if (charState) charState.hp = hero.hp
    } catch (e) { /* 忽略 */ }

    console.log(`[Field-Battle] ${monster.name} 攻击 ${hero.name}，造成 ${damage} 点伤害（暴击:${isCrit}），剩余HP: ${hero.hp}`)
  }

  /**
   * ★ 更新怪物战斗行为（普攻 + 技能）
   * 战斗激活时，范围内所有活着的野怪都会进入 inCombat 并参与 AI，
   * 实现：横向走位、智能选技能、追击脱战 —— 不再是呆板的站桩怪。
   * 关键：怪物与玩家保持攻击距离，不贴脸，避免“粘身”BUG。
   */
  _updateMonsterAttack(dt) {
    if (!this.battleSystem.active) return
    const hero = this.party[0]
    if (!hero || hero.hp <= 0) return

    const aggroRange = 320 * this.dpr      // 仇恨/参战范围
    const leashRange = 620 * this.dpr      // 脱战（回到巡逻）范围（调大，避免走位被甩脱）

    for (const monster of this.mapMonsters) {
      if (!monster.alive) continue

      const dx = this.playerX - monster.x
      const dy = this.playerY - monster.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // 动态判定参战状态：范围内进入战斗，超出牵引范围则脱战
      if (this.battleSystem.active) {
        if (dist <= aggroRange) {
          if (!monster.inCombat && !monster.isCastingSkill) {
            monster.inCombat = true
          }
        } else if (dist > leashRange) {
          // 玩家跑太远，脱战回到巡逻
          monster.inCombat = false
          monster.isAttacking = false
          monster.attackAnimTimer = 0
          continue
        } else {
          // 在 aggro~leash 之间：已参战的怪继续追击，不脱战
          if (monster.inCombat) monster.inCombat = true
        }
      }

      if (!monster.inCombat) continue

      this._updateSingleMonsterCombat(monster, dt, hero, dx, dy, dist, attackRangeOf(monster, this.dpr))
    }

    // 本地辅助：计算攻击距离
    function attackRangeOf(m, dpr) {
      return (m.attackRange || 80) * dpr
    }
  }

  /**
   * ★ 单体怪物战斗 AI：走位 + 技能 + 普攻
   */
  _updateSingleMonsterCombat(monster, dt, hero, dx, dy, dist, attackRange) {
    // 朝向玩家
    if (dist > 1) {
      monster.moveAngle = Math.atan2(dy, dx)
    }

    // 正在施放技能：站定，不打断
    if (monster.isCastingSkill) {
      monster.isMoving = false
      monster.skillAnimTimer -= dt * 1000
      if (monster.skillAnimTimer <= 0) {
        monster.isCastingSkill = false
        monster.skillCastId = null
        monster.skillAnimTimer = 0
        monster.animFrame = 0
      }
      return
    }

    // 保持距离区间（不贴脸），并加入横向走位让移动更自然
    const keepDistance = attackRange * 0.75
    const nx = dist > 1 ? dx / dist : 0
    const ny = dist > 1 ? dy / dist : 0
    // 垂直方向（用于 strafe）
    const px = -ny
    const py = nx

    // 周期性切换走位方向，模拟包抄/绕圈
    monster.strafeTimer -= dt
    if (monster.strafeTimer <= 0) {
      monster.strafeTimer = 1.2 + Math.random() * 1.5
      if (Math.random() < 0.4) monster.strafeDir *= -1
    }

    let vx = 0, vy = 0
    const spd = monster.moveSpeed || 60
    if (dist > attackRange) {
      // 太远：靠近（带一点横向偏移，避免直线愣头青）
      vx += nx * spd * 2.2
      vy += ny * spd * 2.2
      vx += px * monster.strafeDir * spd * 1.0
      vy += py * monster.strafeDir * spd * 1.0
    } else if (dist < keepDistance) {
      // 太近：后撤并横向绕，避免粘身
      vx -= nx * spd * 1.8
      vy -= ny * spd * 1.8
      vx += px * monster.strafeDir * spd * 1.6
      vy += py * monster.strafeDir * spd * 1.6
    } else {
      // 在攻击甜区内：横向绕圈 + 强制向心锁定，避免被玩家甩出攻击范围
      vx += px * monster.strafeDir * spd * 1.4
      vy += py * monster.strafeDir * spd * 1.4
      vx += nx * spd * 1.2
      vy += ny * spd * 1.2
    }

    monster.x += vx * dt
    monster.y += vy * dt
    monster.isMoving = (Math.abs(vx) + Math.abs(vy)) > 0.01

    // 更新技能冷却
    if (monster.skillCDs) {
      for (const id in monster.skillCDs) {
        if (monster.skillCDs[id] > 0) {
          monster.skillCDs[id] = Math.max(0, monster.skillCDs[id] - dt)
        }
      }
    }

    // 计算所有就绪技能的最大射程，作为"可考虑放技能"的距离阈值
    // （避免走位把怪物推出普攻范围后技能永远无法触发）
    let maxSkillRange = attackRange
    let hasReadySkill = false
    if (monster.skills && monster.skills.length > 0 && monster.skillCDs) {
      for (const s of monster.skills) {
        if ((monster.skillCDs[s.id] || 0) <= 0) {
          hasReadySkill = true
          const r = (s.range || attackRange) * this.dpr
          if (r > maxSkillRange) maxSkillRange = r
        }
      }
    }

    // 在"普攻或技能射程"内才考虑进攻
    if (dist <= Math.max(attackRange, maxSkillRange)) {
      // 智能选技能：按距离/血量/技能类型情境加权，兼容 enemies.js 数据格式
      let chosen = null
      if (hasReadySkill) {
        const ready = monster.skills.filter(s => (monster.skillCDs[s.id] || 0) <= 0)
        const hpRatio = (monster.hp / monster.maxHp)
        let best = -1
        for (const s of ready) {
          let score = 0.6 + Math.random() * 0.4 // 基础分，避免完全 deterministic
          const sRange = (s.range || attackRange) * this.dpr
          // 进攻型技能（attack/magic/charge）：在射程内给高分，超距扣分
          if (s.type === 'attack' || s.type === 'magic' || s.type === 'charge') {
            if (dist <= sRange) score += 1.8
            else score -= 1.2
          }
          // 跳跃攻击：中近距离突进，残血时更激进
          if (s.type === 'jump_attack' && dist > attackRange * 0.4) {
            score += (hpRatio < 0.4 ? 2.2 : 1.2)
          }
          // 减益：近身时使用
          if (s.type === 'debuff' && dist < attackRange) score += 1.4
          // 增益/自愈/召唤：冷却好了就该放（提升威胁感）
          if (s.type === 'buff' || s.type === 'heal_self' || s.type === 'summon') score += 1.1
          if (score > best) { best = score; chosen = s }
        }
        // 评分达标即放；或普攻累计 3 次后强制穿插一个就绪技能（兜底，保证技能必出现）
        const forceSkill = monster.skillUseCount >= 3
        if (chosen && (best > 1.0 || forceSkill)) {
          this._castMonsterSkill(monster, chosen, hero)
          monster.skillUseCount = 0
          return
        }
      }

      // 普攻（冷却结束才放）
      if (monster.attackCDTimer > 0) {
        monster.attackCDTimer -= dt * 1000
      } else if (!monster.isAttacking) {
        monster.isAttacking = true
        monster.attackAnimTimer = 500
        monster.hasDealtDamage = false
        monster.attackCDTimer = monster.attackInterval || 2000
        monster.skillUseCount = (monster.skillUseCount || 0) + 1
      }
    }
  }

  /**
   * ★ 新增：怪物施放技能
   */
  _castMonsterSkill(monster, skill, hero) {
    if (!monster || !skill || !hero) return

    console.log(`[Field-Battle] ${monster.name} 施放技能: ${skill.name} (${skill.id})`)

    // 进入施法状态：播放 skill 动画
    monster.isCastingSkill = true
    monster.skillCastId = skill.id
    // 技能动画时长（取 animationConfig.skill.frameDuration * 帧数 或默认 800ms）
    const enemyConfig = this._getMonsterConfig(monster.enemyId)
    const skillConf = enemyConfig?.animationConfig?.skill
    const skillFrames = skillConf ? (skillConf.frameList ? skillConf.frameList.length : (skillConf.end - skillConf.start + 1)) : 8
    const skillFrameDur = skillConf?.frameDuration || 100
    monster.skillAnimTimer = skillFrames * skillFrameDur
    monster.animFrame = 0
    monster.hasDealtDamage = false

    // 设置技能冷却（秒）
    if (monster.skillCDs) monster.skillCDs[skill.id] = skill.cooldown || 10

    const dx = this.playerX - monster.x
    const dy = this.playerY - monster.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    // 根据技能类型施放效果（兼容 enemies.js 的多种 type）
    const doMeleeDamage = (mult) => {
      const dmg = Math.max(1, Math.floor(monster.atk * (mult || skill.power || 1) - hero.def * 0.3))
      hero.hp = Math.max(0, hero.hp - dmg)
      this.battleSystem.damageTexts.push({
        text: `-${dmg}`,
        x: this.playerX - this.cameraX,
        y: this.playerY - this.cameraY - 40 * this.dpr,
        color: '#ff4757',
        life: 1.0
      })
      try {
        const cs = charStateManager.getCharacter(hero.id)
        if (cs) cs.hp = hero.hp
      } catch (e) {}
    }

    if ((skill.type === 'attack' || skill.type === 'magic') && skill.projectile) {
      // 远程抛射物：生成飞弹，到达后结算伤害
      this._spawnMonsterProjectile(monster, skill, dist)
    } else if (skill.type === 'debuff') {
      // 减速/减益：立即对玩家生效
      this._applyMonsterDebuff(monster, skill)
      if (skill.power > 0) doMeleeDamage(skill.power)
    } else if (skill.type === 'jump_attack' || skill.type === 'charge') {
      // 突进/冲锋：冲到玩家附近并造成高额伤害
      const dash = Math.min(skill.dashDistance || 120, dist) * this.dpr
      if (dist > 1) {
        monster.x += (dx / dist) * dash
        monster.y += (dy / dist) * dash
      }
      doMeleeDamage(skill.power)
    } else if (skill.type === 'heal_self') {
      // 自愈
      const heal = skill.healAmount || Math.floor(monster.maxHp * 0.15)
      monster.hp = Math.min(monster.maxHp, monster.hp + heal)
      this.battleSystem.damageTexts.push({
        text: `+${heal}`,
        x: monster.x - this.cameraX,
        y: monster.y - this.cameraY - 40 * this.dpr,
        color: '#2ed573',
        life: 1.0
      })
    } else if (skill.type === 'buff') {
      // 自身增益：提示+标记（视觉反馈），实际增益可后续扩展
      this.game.showToast && this.game.showToast(`${monster.name} 使用 ${skill.name}！`)
    } else if (skill.type === 'summon') {
      // 召唤：提示（实际召唤逻辑可后续扩展）
      this.game.showToast && this.game.showToast(`${monster.name} 召唤了援助！`)
    } else {
      // 默认近战技能：直接造成伤害
      doMeleeDamage(skill.power)
    }
  }

  /**
   * ★ 新增：生成怪物远程抛射物（仅视觉 + 延迟结算）
   */
  _spawnMonsterProjectile(monster, skill, dist) {
    if (!this.battleSystem.projectiles) this.battleSystem.projectiles = []
    const dx = this.playerX - monster.x
    const dy = this.playerY - monster.y
    const len = dist > 1 ? dist : 1
    const speed = (skill.projectileSpeed || 200) * this.dpr
    this.battleSystem.projectiles.push({
      x: monster.x,
      y: monster.y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      power: skill.power || 1,
      life: 2.0, // 秒
      fromMonster: true,
      skillId: skill.id
    })
    console.log(`[Field-Battle] ${monster.name} 发射抛射物: ${skill.name}`)
  }

  /**
   * ★ 新增：对玩家施加怪物减益（减速）
   */
  _applyMonsterDebuff(monster, skill) {
    const effect = skill.effect || 'slow'
    const value = skill.value || 0.3
    const duration = skill.duration || 3

    // 在 battleSystem 上记录玩家减益
    if (!this.battleSystem.playerDebuffs) this.battleSystem.playerDebuffs = []
    this.battleSystem.playerDebuffs.push({
      effect,
      value,
      time: duration
    })

    // 提示
    this.game.showToast && this.game.showToast(`${monster.name} 使用 ${skill.name}！`)
    console.log(`[Field-Battle] 玩家被施加减益: ${effect} 值=${value} 持续=${duration}s`)
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

        // ★ 使用 getEnemyByLevel 计算最终属性（包含等级加成）
        const finalEnemyData = getEnemyByLevel(enemyData, enemyData?.level || 1)

        // ★ 标准化技能数据
        const normalizedSkills = this._normalizeMonsterSkills(finalEnemyData?.skills, enemyId)

        this.mapMonsters.push({
          id: `${this.areaId}_monster_${Date.now()}_${i}`,  // 包含区域ID前缀
          enemyId: enemyId,
          x: x,
          y: y,
          name: finalEnemyData?.name || '坏猫',
          isBoss: finalEnemyData?.isBoss || false,
          isElite: finalEnemyData?.isElite || false,
          alive: true,
          // ★ 战斗属性（从 finalEnemyData 复制）
          level: finalEnemyData?.level || 1,
          maxHp: finalEnemyData?.maxHp || 50,
          hp: finalEnemyData?.hp || finalEnemyData?.maxHp || 50,
          atk: finalEnemyData?.atk || 10,
          def: finalEnemyData?.def || 5,
          spd: finalEnemyData?.spd || 9,
          crit: finalEnemyData?.crit || 0.05,
          aiPattern: finalEnemyData?.aiPattern || 'normal',
          attackRange: finalEnemyData?.attackRange || 80,
          attackInterval: finalEnemyData?.attackInterval || 2000,
          skills: normalizedSkills,
          // 技能冷却计时器（每个技能单独冷却，单位：秒）
          skillCDs: this._initSkillCDs(normalizedSkills),
          isCastingSkill: false,  // 是否正在施放技能
          skillAnimTimer: 0,      // 技能动画计时器（毫秒）
          skillCastId: null,      // 当前施放中的技能id
          // 战斗AI状态
          inCombat: false,        // 是否进入战斗（参与AI）
          skillUseCount: 0,       // 普攻计数，用于强制穿插技能
          strafeDir: Math.random() > 0.5 ? 1 : -1, // 横向走位方向
          strafeTimer: 0,         // 走位方向切换计时
          // 动画属性
          bobOffset: Math.random() * Math.PI * 2,
          bobSpeed: 2 + Math.random(),
          animTimer: 0, // 动画计时器
          animFrame: 0, // 动画帧索引
          attackCDTimer: 0, // 攻击冷却计时器
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

    // 每个队友跟随不同的位置（战斗=分散阵型点 / 非战斗=主角移动轨迹历史点）
    for (let i = 0; i < this.followers.length; i++) {
      const follower = this.followers[i]

      // ★ 战斗激活时：队友保持分散阵型，相对【被控角色】侧后方固定偏移，不再贴脸跟随
      //   被控角色始终同步到 playerX/playerY（镜头中心），故以此为阵型中心
      let targetPos = null
      if (this.battleSystem && this.battleSystem.active) {
        const ctrlX = this.playerX
        const ctrlY = this.playerY
        const backDist = 60 * this.dpr   // 后退距离（主角身后）
        // 左右交替分散：第0个偏一侧、第1个偏另一侧，半径随索引递增，避免重叠
        const sideDir = (i % 2 === 0) ? 1 : -1
        const sideDist = (55 + i * 14) * this.dpr
        const backDir = this.facingLeft ? 1 : -1   // 主角面朝左 → 后方在右(+x)
        targetPos = {
          x: ctrlX + backDir * backDist,
          y: ctrlY + sideDir * sideDist,
          facingLeft: this.facingLeft
        }
      } else {
        // 计算队友应该在的历史位置索引
        // 第1个队友延迟10个记录点，第2个延迟20个记录点，以此类推
        // 每个记录点间隔3帧，所以实际延迟约30帧
        const historyIndex = Math.min((i + 1) * 10, this.playerHistory.length - 1)
        if (historyIndex >= 0 && this.playerHistory.length > 0) {
          targetPos = this.playerHistory[historyIndex]
        }
      }

      if (targetPos) {
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
      
      // 使用 CharacterSprite 更新队友动画
      if (follower.sprite) {
        follower.sprite.update(dt, follower.isMoving, follower.facingLeft)
      }

      // ★ 同步队友世界坐标（供战斗系统AI/血条显示使用）
      if (this._heroWorldPos && this._heroWorldPos[i + 1]) {
        this._heroWorldPos[i + 1].x = follower.x
        this._heroWorldPos[i + 1].y = follower.y
      }
    }

    // ★ 当控制的不是主角时，让主角也跟随被控者（主角作为游离单位跟随）
    if (this._heroWorldPos && this.battleSystem.battleHeroes && this.battleSystem.battleHeroes[0]) {
      const ctrl = this.battleSystem.battleHeroes[0]
      // 被控者不是主角（partyIndex !== 0），主角需要跟随
      if (ctrl.partyIndex !== 0 && this.mainCharacterSprite) {
        const px = this._heroWorldPos[0]
        if (px) {
          const dx = this.playerX - px.x
          const dy = this.playerY - px.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 10 * this.dpr) {
            const speed = this.playerSpeed * 0.95
            px.x += (dx / dist) * speed * dt
            px.y += (dy / dist) * speed * dt
          }
        }
      }
    }
  }
  
  _handleTap(tap) {
    // ★ 战斗UI按钮（攻击/技能）优先处理（王者荣耀式操作）
    if (this.battleSystem && this.battleSystem.active && this._handleBattleUITap(tap)) return

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

  /**
   * 碰撞检测 — 使用 CollisionEngine（统一脚底碰撞）
   * 所有地图场景共用同一套碰撞参数，不再各自实现
   */
  _checkObstacleCollision() {
    return this._collisionEngine.checkStaticCollision(this.playerX, this.playerY)
  }

  _checkMonsterCollision() {
    // 如果已经在进入战斗，不再检测
    if (this.isEnteringBattle) return
    
    // ★ 新增：如果已经处于战斗状态，不再检测碰撞
    if (this.battleSystem.active) return
    
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return
    
    const playerRadius = 30 * this.dpr
    const monsterRadius = 35 * this.dpr
    
    for (const monster of this.mapMonsters) {
      if (!monster.alive) continue
      
      const dist = Math.sqrt(
        (this.playerX - monster.x) ** 2 + (this.playerY - monster.y) ** 2
      )
      
      // 碰撞检测 - 现在直接在地图上触发战斗
      if (dist < playerRadius + monsterRadius) {
        this._startFieldBattle(monster)
        break
      }
    }
  }
  
  /**
   * ★ 新增：在地图上直接开始战斗（不切换场景）
   */
  _startFieldBattle(monster) {
    // 标记正在进入战斗，防止重复触发
    if (this.isEnteringBattle) return
    this.isEnteringBattle = true
    
    console.log(`[Field-Battle] 开始地图战斗 - 怪物: ${monster.name}`)
    
    // 设置战斗目标
    this.battleSystem.battleTarget = monster
    this.battleSystem.active = true
    this.battleSystem.showBattleUI = true
    
    // 初始化战斗UI
    this._initBattleUI()
    
    // 重置进入战斗标志（允许战斗结束后再次触发）
    setTimeout(() => {
      this.isEnteringBattle = false
    }, 1000)
  }
  
  /**
   * ★ 新增：初始化战斗UI（攻击按钮、技能按钮等）
   */
  _initBattleUI() {
    const btnSize = 42 * this.dpr       // 按钮尺寸（再缩小一点）
    const gap = 8 * this.dpr            // 紧凑间距
    const margin = 14 * this.dpr         // 紧凑边距
    const cell = btnSize + gap

    // 攻击按钮：屏幕右下偏内（确保上下左右四个方向技能都有空间显示）
    // 从右下角往左上各退一格，让 4 个方向的技能都完整可见
    const attackX = this.width - btnSize * 2 - margin - gap
    const attackY = this.height - btnSize * 2 - margin - gap
    this.battleSystem.attackButton = {
      x: attackX,
      y: attackY,
      width: btnSize,
      height: btnSize,
      text: 'ATK',
      cooldown: 0,
      active: true
    }

    // 技能按钮：十字布局（普攻居中，技能按 上/右/下/左 顺时针填充）
    this.battleSystem.skillButtons = []
    const skills = this.party[0]?.skills || []
    const n = skills.length
    if (n > 0) {
      const cell = btnSize + gap
      const dirs = [
        { dx: 0,     dy: -cell, pos: 'top'    },
        { dx: cell,  dy: 0,     pos: 'right'  },
        { dx: 0,     dy: cell,  pos: 'bottom' },
        { dx: -cell, dy: 0,     pos: 'left'   },
      ]
      skills.forEach((skill, index) => {
        const dir = dirs[index % dirs.length]
        let bx = attackX + dir.dx
        let by = attackY + dir.dy
        bx = Math.max(margin, Math.min(this.width - btnSize - margin, bx))
        by = Math.max(margin, Math.min(this.height - btnSize - margin, by))
        this.battleSystem.skillButtons.push({
          x: bx,
          y: by,
          width: btnSize,
          height: btnSize,
          text: skill.name,
          skill: skill,
          cooldown: 0,
          active: true,
          index: index
        })
      })
    }

    console.log(`[Field-Battle] 战斗UI初始化完成（王者荣耀式固定布局），技能数量: ${skills.length}`)
  }

  /**
   * ★ 新增：更新战斗系统
   */
  _updateBattleSystem(dt) {
    if (!this.battleSystem.active) return

    // 1. 更新玩家攻击冷却
    if (this.battleSystem.playerAttackCD > 0) {
      this.battleSystem.playerAttackCD -= dt * 1000
    }

    // 1.1 更新技能按钮冷却（★ 新增）
    if (this.battleSystem.skillButtons && this.battleSystem.skillButtons.length > 0) {
      for (const sb of this.battleSystem.skillButtons) {
        if (sb.cooldown > 0) sb.cooldown = Math.max(0, sb.cooldown - dt * 1000)
      }
    }

    // 2. 更新怪物攻击（★ 新增）
    this._updateMonsterAttack(dt)

    // 3. 更新伤害数字
    this._updateFieldDamageTexts(dt)

    // 3.1 更新抛射物（怪物远程技能）
    if (this.battleSystem.projectiles && this.battleSystem.projectiles.length > 0) {
      const hero = this.party[0]
      for (let i = this.battleSystem.projectiles.length - 1; i >= 0; i--) {
        const p = this.battleSystem.projectiles[i]
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
        // 命中玩家判定（半径约 30*dpr）
        if (hero) {
          const ddx = this.playerX - p.x
          const ddy = this.playerY - p.y
          if (Math.sqrt(ddx * ddx + ddy * ddy) < 30 * this.dpr) {
            const dmg = Math.max(1, Math.floor(this.battleSystem.battleTarget.atk * p.power - hero.def * 0.3))
            hero.hp = Math.max(0, hero.hp - dmg)
            this.battleSystem.damageTexts.push({
              text: `-${dmg}`,
              x: this.playerX - this.cameraX,
              y: this.playerY - this.cameraY - 40 * this.dpr,
              color: '#ff4757',
              life: 1.0
            })
            try { const cs = charStateManager.getCharacter(hero.id); if (cs) cs.hp = hero.hp } catch (e) {}
            p.life = -1
          }
        }
        if (p.life <= 0) this.battleSystem.projectiles.splice(i, 1)
      }
    }

    // 3.2 更新玩家减益（减速）计时
    if (this.battleSystem.playerDebuffs && this.battleSystem.playerDebuffs.length > 0) {
      for (let i = this.battleSystem.playerDebuffs.length - 1; i >= 0; i--) {
        this.battleSystem.playerDebuffs[i].time -= dt
        if (this.battleSystem.playerDebuffs[i].time <= 0) {
          this.battleSystem.playerDebuffs.splice(i, 1)
        }
      }
    }

    // 4. 检查战斗目标是否还存活
    if (this.battleSystem.battleTarget && !this.battleSystem.battleTarget.alive) {
      console.log(`[Field-Battle] 战斗目标 ${this.battleSystem.battleTarget.name} 已被击败`)
      this._endFieldBattle(true)
    }

    // 5. 检查玩家是否死亡
    const mainHero = this.party[0]
    if (mainHero && mainHero.hp <= 0) {
      console.log(`[Field-Battle] 玩家 ${mainHero.name} 已死亡`)
      this._endFieldBattle(false)
    }
  }

  /**
   * ★ 新增：结束地图战斗
   */
  _endFieldBattle(victory) {
    console.log(`[Field-Battle] 战斗结束，胜利: ${victory}`)
    
    if (victory) {
      // 战斗胜利，标记怪物死亡
      if (this.battleSystem.battleTarget) {
        this.battleSystem.battleTarget.alive = false
      }
      // 显示胜利消息
      this.game.showToast && this.game.showToast('战斗胜利！')
    } else {
      // 战斗失败，玩家死亡
      // 重置玩家HP
      this.party.forEach(hero => {
        hero.hp = hero.maxHp
      })
      this.game.showToast && this.game.showToast('战斗失败，已恢复HP')
    }

    // 重置战斗系统
    this.battleSystem.active = false
    this.battleSystem.battleTarget = null
    this.battleSystem.showBattleUI = false
    this.battleSystem.attackButton = null
    this.battleSystem.skillButtons = []
    this.battleSystem.damageTexts = []
    this.battleSystem.projectiles = []
    this.battleSystem.playerDebuffs = []

    // 清空所有怪物的战斗状态（回到巡逻）
    this.mapMonsters.forEach(m => {
      if (m) {
        m.inCombat = false
        m.isAttacking = false
        m.isCastingSkill = false
        m.attackAnimTimer = 0
        m.skillAnimTimer = 0
      }
    })

    // 保存怪物状态
    this.game.data.set(`fieldMonsters_${this.areaId}`, this.mapMonsters)
  }

  /**
   * ★ 新增：更新伤害数字
   */
  _updateFieldDamageTexts(dt) {
    if (!this.battleSystem.damageTexts || !Array.isArray(this.battleSystem.damageTexts)) return

    for (let i = this.battleSystem.damageTexts.length - 1; i >= 0; i--) {
      const item = this.battleSystem.damageTexts[i]
      item.life -= dt
      item.y -= 30 * dt // 上升效果

      if (item.life <= 0) {
        this.battleSystem.damageTexts.splice(i, 1)
      }
    }
  }

  /**
   * ★ 新增：玩家攻击怪物
   */
  _playerAttackMonster(monster) {
    if (!monster || !monster.alive) return
    if (this.battleSystem.playerAttackCD > 0) return

    const mainHero = this.party[0]
    if (!mainHero) return

    // 计算伤害
    const damage = Math.max(1, mainHero.atk - Math.floor(monster.def * 0.5))
    monster.hp = Math.max(0, monster.hp - damage)

    // 添加伤害数字
    const screenX = monster.x - this.cameraX
    const screenY = monster.y - this.cameraY
    this.battleSystem.damageTexts.push({
      text: `-${damage}`,
      x: screenX,
      y: screenY - 40 * this.dpr,
      color: '#ff4757',
      life: 1.0
    })

    // 设置攻击冷却
    this.battleSystem.playerAttackCD = this.battleSystem.playerAttackInterval

    console.log(`[Field-Battle] ${mainHero.name} 攻击 ${monster.name}，造成 ${damage} 点伤害，剩余HP: ${monster.hp}`)

    // 检查怪物是否死亡
    if (monster.hp <= 0) {
      monster.alive = false
      console.log(`[Field-Battle] ${monster.name} 被击败！`)
      this.battleSystem.battleTarget = null
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
   * 统一Y轴排序渲染 — 使用 Renderer2D5 引擎
   *
   * 渲染流程由引擎统一管理，scene 只负责提供实体数据。
   * 怪物等特殊类型的渲染通过 hooks 回调传给引擎。
   */
  _renderYSortedEntities(ctx) {
    const engine = this._renderer2d5
    const self = this
    engine.setCamera(this.cameraX, this.cameraY)
    engine.clear()

    // ── layer=0：装饰物（草/花）─
    for (const obj of GRASSLAND_MAP_OBJECTS) {
      if (obj.type !== GLAND_OBJ_TYPE.DECORATION) continue
      engine.addDecoration(obj)
    }

    // ── layer=2：障碍物（树/石块/灌木）─
    for (const obj of GRASSLAND_MAP_OBJECTS) {
      if (obj.type === GLAND_OBJ_TYPE.DECORATION) continue
      engine.addObstacle(obj)
    }

    // ── layer=2：宝箱等交互对象─
    if (this.mapObjects && Array.isArray(this.mapObjects)) {
      for (const obj of this.mapObjects) {
        const sx = obj.x - this.cameraX
        const sy = obj.y - this.cameraY
        engine.addChest(obj, sx, sy)
      }
    }

    // ── layer=2：怪物─
    if (this.mapMonsters && Array.isArray(this.mapMonsters)) {
      for (const monster of this.mapMonsters) {
        if (!monster.alive) continue
        const sx = monster.x - this.cameraX
        const sy = monster.y - this.cameraY
        engine.addMonster(monster, sx, sy)
      }
    }

    // ── layer=2：主角+队友（作为整体参与Y排序）─
    if (typeof this.playerX === 'number') {
      engine.addPlayer(this.playerY / this.dpr + 50, function renderFn(ctx) {
        // ★ FieldScene 不继承 FieldMovement，没有 renderCharacters 方法，
        //   这里统一用 CharacterSprite 渲染主角 + 所有跟随队友（与主地图非副本路径一致）。
        // ── 主角（臻宝）──
        if (self.mainCharacterSprite) {
          // 战斗系统下，主角真实世界坐标存于 _heroWorldPos[0]（可能非被控者）
          const pPos = (self._heroWorldPos && self._heroWorldPos[0]) ? self._heroWorldPos[0] : { x: self.playerX, y: self.playerY }
          const screenX = pPos.x - self.cameraX
          const screenY = pPos.y - self.cameraY
          self.mainCharacterSprite.render(ctx, screenX, screenY)

          // 移动时添加轻微的方向指示器
          if (self.mainCharacterSprite._effectiveMoving) {
            const targetHeight = 80 * self.dpr
            ctx.beginPath()
            const arrowDist = targetHeight / 2 + 10 * self.dpr
            let arrowX = screenX
            let arrowY = screenY
            
            switch (self.playerDirection) {
              case 'up': arrowY -= arrowDist; break
              case 'down': arrowY += arrowDist; break
              case 'left': arrowX -= arrowDist; break
              case 'right': arrowX += arrowDist; break
            }
            
            ctx.arc(arrowX, arrowY, 5 * self.dpr, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255,255,255,0.5)'
            ctx.fill()
          }
        }

        // ── 跟随队友（李小宝等）──
        // 副本模式原先只渲染了主角，导致队友只有血条蓝条、没有精灵动画。
        if (self.followers && Array.isArray(self.followers)) {
          for (let fi = 0; fi < self.followers.length; fi++) {
            const follower = self.followers[fi]
            // 优先用 CharacterSprite 渲染（与主角臻宝一致，已验证分包资源可加载）
            if (follower.sprite) {
              const fPos = (self._heroWorldPos && self._heroWorldPos[fi + 1])
                ? self._heroWorldPos[fi + 1]
                : { x: follower.x, y: follower.y }
              const fScreenX = fPos.x - self.cameraX
              const fScreenY = fPos.y - self.cameraY
              follower.sprite.render(ctx, fScreenX, fScreenY)
            } else if (typeof self._renderFollower === 'function') {
              // 兜底：旧版手写渲染路径
              self._renderFollower(ctx, follower, fi)
            }
          }
        }
      })
    }

    // 排序 + 统一绘制（通过 hooks 处理特殊类型）
    engine.render(ctx, {
      renderMonster: (ctx, monster, sx, sy) => {
        // ★ 修复：所有有动画资源的怪物都使用猫咪动画
        const useCatAnim = ['slime_cat', 'shadow_mouse', 'wild_cat', 'lost_healer_cat', 'flame_slime', 'aqua_slime', 'violet_slime', 'shadow_mouse_smooth'].includes(monster.enemyId)
        if (useCatAnim) {
          self._renderCatMonster(ctx, monster, sx, sy)
        } else {
          self._renderEmojiMonster(ctx, monster, sx, sy)
        }
      },
    })
  }

  /**
   * 绘制单个地图对象（考虑相机偏移和旋转）
   */
  _drawMapObject(ctx, obj) {
    const img = this.game.assets.get(obj.assetKey)
    if (!img) return

    const screenX = obj.x * this.dpr - this.cameraX
    const screenY = obj.y * this.dpr - this.cameraY
    const w = (obj.w || obj.width || img.width) * this.dpr
    const h = (obj.h || obj.height || img.height) * this.dpr
    const rotation = obj.rotation || 0

    // 视野裁剪（只绘制可见区域内的对象）
    if (screenX + w < -50 || screenX > this.width + 50 ||
        screenY + h < -50 || screenY > this.height + 50) return

    if (rotation !== 0) {
      ctx.save()
      ctx.translate(screenX + w / 2, screenY + h / 2)
      ctx.rotate(rotation * Math.PI / 180)
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
      ctx.restore()
    } else {
      ctx.drawImage(img, screenX, screenY, w, h)
    }
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

    // 调试：显示碰撞区域（临时开启用于排查问题）
    this._renderObstacles(ctx)

    // ★ 新增：渲染世界血条/蓝条（主角+队友，非战斗也始终显示）
    if (this.battleSystem) {
      this._renderWorldHealthBars(ctx)
    }

    // ★ 新增：渲染战斗UI
    if (this.battleSystem && this.battleSystem.showBattleUI) {
      this._renderBattleUI(ctx)
    }

    // ★ 新增：渲染怪物抛射物（远程技能飞弹）
    if (this.battleSystem && this.battleSystem.projectiles && this.battleSystem.projectiles.length > 0) {
      for (const p of this.battleSystem.projectiles) {
        const sx = p.x - this.cameraX
        const sy = p.y - this.cameraY
        ctx.save()
        ctx.fillStyle = p.fromMonster ? 'rgba(120, 220, 120, 0.85)' : 'rgba(255, 120, 80, 0.85)'
        ctx.beginPath()
        ctx.arc(sx, sy, 8 * this.dpr, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    // ★ 新增：渲染跳跃攻击预警区域（红色警示圈，收缩+闪烁，1秒后爆发）
    if (this.battleSystem && this.battleSystem.warningZones && this.battleSystem.warningZones.length > 0) {
      for (const z of this.battleSystem.warningZones) {
        const sx = z.x - this.cameraX
        const sy = z.y - this.cameraY
        const progress = z.total > 0 ? 1 - (z.timer / z.total) : 1 // 0→1 倒计时进度
        // 圈随倒计时收缩（从外圈收到实际半径），增强"即将命中"的压迫感
        const curR = z.r * (1.0 - 0.35 * progress)
        const blink = 0.35 + 0.35 * Math.abs(Math.sin(progress * Math.PI * 6)) // 闪烁
        ctx.save()
        // 半透明红色填充
        ctx.fillStyle = `rgba(255, 40, 40, ${0.20 + 0.25 * progress})`
        ctx.beginPath()
        ctx.arc(sx, sy, curR, 0, Math.PI * 2)
        ctx.fill()
        // 边缘红圈
        ctx.lineWidth = 3 * this.dpr
        ctx.strokeStyle = `rgba(255, 60, 60, ${blink})`
        ctx.beginPath()
        ctx.arc(sx, sy, curR, 0, Math.PI * 2)
        ctx.stroke()
        // 十字准星
        ctx.strokeStyle = `rgba(255, 80, 80, ${blink})`
        ctx.lineWidth = 2 * this.dpr
        ctx.beginPath()
        ctx.moveTo(sx - curR, sy); ctx.lineTo(sx + curR, sy)
        ctx.moveTo(sx, sy - curR); ctx.lineTo(sx, sy + curR)
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  /**
   * ★ 渲染世界血条/蓝条（主角+所有跟随队友），非战斗也始终显示
   * 与战斗系统 battleHeroes 解耦，直接读取 party / followers 的实时世界坐标
   */
  _renderWorldHealthBars(ctx) {
    if (!this.party || !this.party.length) return

    const drawBar = (wx, wy, hero, isControlled) => {
      const screenX = wx - this.cameraX
      const screenY = wy - this.cameraY
      const barWidth = 60 * this.dpr
      const barHeight = 6 * this.dpr
      const barX = screenX - barWidth / 2
      const barY = screenY - 50 * this.dpr

      // HP 背景
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(barX, barY, barWidth, barHeight)

      // HP 条
      const hpRatio = Math.max(0, (hero.hp || 0) / (hero.maxHp || 1))
      ctx.fillStyle = hpRatio > 0.5 ? '#2ed573' : (hpRatio > 0.25 ? '#ffa502' : '#ff4757')
      ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight)

      // HP 边框
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      ctx.strokeRect(barX, barY, barWidth, barHeight)

      // ★ MP 蓝条
      const mpY = barY + barHeight + 2 * this.dpr
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(barX, mpY, barWidth, barHeight)
      const mpRatio = Math.max(0, (hero.mp || 0) / (hero.maxMp || 1))
      ctx.fillStyle = '#1e90ff'
      ctx.fillRect(barX, mpY, barWidth * mpRatio, barHeight)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      ctx.strokeRect(barX, mpY, barWidth, barHeight)

      // 名字（被控制者高亮）
      ctx.fillStyle = isControlled ? '#FFD700' : '#ffffff'
      ctx.font = `${10 * this.dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(hero.name + (isControlled ? '（控制中）' : ''), screenX, barY - 4 * this.dpr)
      ctx.textAlign = 'left'
    }

    // 主角坐标（战斗中可能非被控者，但始终用真实位置）
    const mainPos = (this._heroWorldPos && this._heroWorldPos[0])
      ? this._heroWorldPos[0]
      : { x: this.playerX, y: this.playerY }
    const ctrlIdx = (this.battleSystem && this.battleSystem.battleHeroes && this.battleSystem.battleHeroes[0])
      ? this.battleSystem.battleHeroes[0].partyIndex : 0
    drawBar(mainPos.x, mainPos.y, this.party[0], ctrlIdx === 0)

    // 跟随队友
    if (this.followers && Array.isArray(this.followers)) {
      for (let i = 0; i < this.followers.length; i++) {
        const f = this.followers[i]
        if (!f || !f.character) continue
        const fPos = (this._heroWorldPos && this._heroWorldPos[i + 1]) ? this._heroWorldPos[i + 1] : { x: f.x, y: f.y }
        drawBar(fPos.x, fPos.y, f.character, ctrlIdx === (i + 1))
      }
    }
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

      // ★ 优先使用 CharacterSprite 渲染（与主角臻宝完全一致的实现路径，
      //   已验证在野外场景可正确加载分包动画资源；李小宝此前因手写 getImage
      //   在分包资源加载时机/缓存下返回 null 而只显示血条蓝条，改用此路径彻底修复）
      if (follower.sprite) {
        follower.sprite.render(ctx, screenX, screenY)
        continue
      }

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

      // 如果动画帧不存在，fallback 到同类型第一帧（避免走路时闪到idle帧）
      if (!frameImg) {
        const fallbackType = follower._effectiveMoving ? 'WALK' : 'IDLE'
        if (heroId === 'zhenbao') {
          frameImg = this.game.assets.get(`HERO_ZHENBAO_${fallbackType}_01`)
        } else if (heroId === 'lixiaobao') {
          frameImg = this.game.assets.get(`HERO_LIXIAOBAO_${fallbackType}_01`)
        } else if (heroId === 'slime_cat') {
          frameImg = this.game.assets.get(follower._effectiveMoving ? 'SLIME_CAT_WALK_01' : 'SLIME_CAT_IDLE_1')
        } else if (heroId === 'shadow_mouse') {
          frameImg = this.game.assets.get(`SHADOW_MOUSE_${fallbackType}_01`)
        } else if (isCat) {
          frameImg = this.game.assets.get(`CAT_${fallbackType}_01`)
        } else {
          frameImg = this.game.assets.get(`HERO_${heroId.toUpperCase()}_${fallbackType}_0`)
        }
      }

      if (frameImg) {
        const imgWidth = frameImg.width
        const imgHeight = frameImg.height
        const scale = targetHeight / imgHeight
        const renderWidth = imgWidth * scale
        const renderHeight = targetHeight

        ctx.save()

        // ★ 统一翻转逻辑：从角色 renderConfig.flipRule 读取，避免逐个 heroId 硬编码导致朝向错误
        // flipRule: 'same' = facingLeft 时翻转；'opposite' = !facingLeft 时翻转
        const followFlipRule = follower.flipRule || 'opposite'
        if (this._shouldFlipByRule(follower.facingLeft, followFlipRule)) {
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
        ctx.ellipse(screenX, screenY + targetHeight / 2 + 5 * this.dpr, targetHeight / 2.5, 8 * this.dpr, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fill()
      }
    }
  }

  /**
   * 在指定屏幕坐标渲染单个队友（供 Y 排序统一渲染调用）
   * 使用 CharacterSprite 渲染（自动处理动画、翻转、阴影）
   */
  _drawFollowerAt(ctx, follower, screenX, screenY) {
    if (!follower.sprite) return

    // 使用 CharacterSprite 渲染队友（自动处理动画、翻转、阴影）
    follower.sprite.render(ctx, screenX, screenY)
  }
  
  /**
   * 根据 flipRule 判断是否水平翻转渲染
   * 与 scripts/core/character-sprite.js 的 CharacterSprite._shouldFlip 语义保持一致，
   * 作为 field 场景手写渲染的统一翻转判定，避免各角色朝向硬编码出错。
   * @param {boolean} facingLeft - 当前是否应朝左
   * @param {string} flipRule - 'same'(facingLeft 时翻转) | 'opposite'(!facingLeft 时翻转) | 'none'(永不翻转)
   * @returns {boolean}
   */
  _shouldFlipByRule(facingLeft, flipRule) {
    if (flipRule === 'none') return false
    if (flipRule === 'same') return !!facingLeft
    return !facingLeft // 'opposite' 或默认
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

    // ★ 王者荣耀式：攻击/技能时播放主角攻击动画帧（ATTACK 资源；SLASH 已弃用）
    if (this.battleSystem && this.battleSystem.playerAnim) {
      const pa = this.battleSystem.playerAnim
      // 攻击进度 0~1
      const prog = pa.maxTimer ? (1 - pa.timer / pa.maxTimer) : 0
      // 攻击帧索引（8帧循环）
      const atkFrameBase = Math.floor(prog * 8) // 0~7
      let atkImg = null
      if (heroId === 'zhenbao') {
        const idx = (atkFrameBase % 8) + 1
        atkImg = this.game.assets.get(`HERO_ZHENBAO_ATTACK_${idx.toString().padStart(2, '0')}`)
      } else if (heroId === 'lixiaobao') {
        // ★ 李小宝普攻：使用 cast_universal.png 精灵表（8帧横排），与正规战斗一致
        const sheet = this.game.assets.get('LIXIAOBAO_CAST_SPRITESHEET')
        if (sheet && sheet.width) {
          const totalFrames = 8
          const frameW = Math.floor(sheet.width / totalFrames)
          const idx = atkFrameBase % totalFrames
          atkImg = {
            _isSpriteSheet: true,
            _sheet: sheet,
            _sx: idx * frameW,
            _sy: 0,
            _sw: frameW,
            _sh: sheet.height,
            width: frameW,
            height: sheet.height
          }
        } else {
          atkImg = this.game.assets.get('HERO_LIXIAOBAO_IDLE_01')
        }
      } else if (heroId === 'slime_cat') {
        atkImg = this.game.assets.get(`SLIME_CAT_IDLE_1`)
      } else if (heroId === 'shadow_mouse') {
        atkImg = this.game.assets.get(`SHADOW_MOUSE_IDLE_01`)
      } else if (isCat) {
        atkImg = this.game.assets.get(`CAT_IDLE_01`)
      } else {
        atkImg = this.game.assets.get(`HERO_${heroId.toUpperCase()}_IDLE_0`)
      }
      if (atkImg) frameImg = atkImg
    }

    // 如果动画帧不存在，fallback 到同类型第一帧（避免走路时闪到idle帧）
    if (!frameImg) {
      const fallbackType = this._effectiveMoving ? 'WALK' : 'IDLE'
      if (heroId === 'zhenbao') {
        frameImg = this.game.assets.get(`HERO_ZHENBAO_${fallbackType}_01`)
      } else if (heroId === 'lixiaobao') {
        frameImg = this.game.assets.get(`HERO_LIXIAOBAO_${fallbackType}_01`)
      } else if (heroId === 'slime_cat') {
        frameImg = this.game.assets.get(this._effectiveMoving ? 'SLIME_CAT_WALK_01' : 'SLIME_CAT_IDLE_1')
      } else if (heroId === 'shadow_mouse') {
        frameImg = this.game.assets.get(`SHADOW_MOUSE_${fallbackType}_01`)
      } else if (isCat) {
        frameImg = this.game.assets.get(`CAT_${fallbackType}_01`)
      } else {
        frameImg = this.game.assets.get(`HERO_${heroId.toUpperCase()}_${fallbackType}_0`)
      }
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

      // ★ 统一翻转逻辑：从主角 renderConfig.flipRule 读取（与 CharacterSprite._shouldFlip 一致）
      // flipRule: 'same' = facingLeft 时翻转；'opposite' = !facingLeft 时翻转
      // ★ 攻击/技能动画期间，主角朝向目标方向（覆盖移动朝向）
      let facingLeftForRender = this.facingLeft
      if (this.battleSystem && this.battleSystem.playerAnim && this.battleSystem.playerAnim.facing != null) {
        // 资源默认朝右（正X方向），目标在左侧则翻转
        facingLeftForRender = Math.cos(this.battleSystem.playerAnim.facing) < 0
      }

      const mainFlipRule = this.mainCharacter?.renderConfig?.flipRule || 'opposite'
      if (this._shouldFlipByRule(facingLeftForRender, mainFlipRule)) {
        ctx.translate(screenX, screenY)
        ctx.scale(-1, 1)
        if (frameImg._isSpriteSheet) {
          ctx.drawImage(frameImg._sheet, frameImg._sx, frameImg._sy, frameImg._sw, frameImg._sh, -renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight)
        } else {
          ctx.drawImage(
            frameImg,
            -renderWidth / 2,
            -renderHeight / 2,
            renderWidth,
            renderHeight
          )
        }
      } else {
        if (frameImg._isSpriteSheet) {
          ctx.drawImage(frameImg._sheet, frameImg._sx, frameImg._sy, frameImg._sw, frameImg._sh, screenX - renderWidth / 2, screenY - renderHeight / 2, renderWidth, renderHeight)
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
      // ★ 修复：所有有动画资源的怪物都使用猫咪动画
      const useCatAnim = ['slime_cat', 'shadow_mouse', 'wild_cat', 'flame_slime', 'aqua_slime', 'violet_slime', 'shadow_mouse_smooth'].includes(monster.enemyId)

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
   * 渲染猫咪怪物（使用 animationConfig 配置）
   */
  _renderCatMonster(ctx, monster, screenX, screenY) {
    // ★ 读取怪物配置中的 renderConfig，获取 targetHeight（默认80）
    const enemyConfig = this._getMonsterConfig(monster.enemyId)
    const renderConfig = enemyConfig?.renderConfig || {}
    const targetHeight = (renderConfig.targetHeight || 80) * this.dpr

    // ★ 读取怪物配置中的 animationConfig
    if (!enemyConfig || !enemyConfig.animationConfig) {
      // 配置不存在，降级到 emoji 渲染
      this._renderEmojiMonster(ctx, monster, screenX, screenY)
      return
    }

    // ★ 技能动画优先级最高
    let animType, animConf
    if (monster.isCastingSkill && enemyConfig && enemyConfig.animationConfig && enemyConfig.animationConfig.skill) {
      animType = 'skill'
      animConf = enemyConfig.animationConfig.skill
      // 注意：animFrame 已经在 _updateMonsters 中更新，这里不需要再更新
      // ★ 若 skill 动画资产缺失，回退到 attack（若存在），避免每帧刷 warn 并降级
      const probeFrameIdx = animConf.frameList
        ? animConf.frameList[0]
        : animConf.start
      const probeKey = this._buildFrameKey(monster.enemyId, 'skill', probeFrameIdx, animConf.framePad)
      if (!this.game.assets.get(probeKey)) {
        if (enemyConfig.animationConfig.attack) {
          animType = 'attack'
          animConf = enemyConfig.animationConfig.attack
        } else {
          animType = 'idle'
          animConf = enemyConfig.animationConfig.idle
        }
      }
    } else if (monster.isAttacking && enemyConfig.animationConfig.attack) {
      animType = 'attack'
      animConf = enemyConfig.animationConfig.attack
      // 注意：animFrame 已经在 _updateMonsters 中更新，这里不需要再更新
    } else {
      // 普通待机/移动动画
      animType = monster.isMoving ? 'walk' : 'idle'
      animConf = enemyConfig.animationConfig[animType]
      if (!animConf) {
        this._renderEmojiMonster(ctx, monster, screenX, screenY)
        return
      }
    }

    // 计算当前帧号（循环）
    // 支持 frameList（非连续帧号）和连续帧
    let frameIdx
    if (animConf.frameList) {
      // 非连续帧号：animFrame 是 frameList 的索引
      const frameListIdx = monster.animFrame % animConf.frameList.length
      frameIdx = animConf.frameList[frameListIdx]
    } else {
      // 连续帧号
      const totalFrames = animConf.end - animConf.start + 1
      frameIdx = (monster.animFrame % totalFrames) + animConf.start
    }

    // 构建资源路径（与 animationConfig.path 一致）
    const frameKey = this._buildFrameKey(monster.enemyId, animType, frameIdx, animConf.framePad)

    // 获取动画帧图片
    let frameImg = this.game.assets.get(frameKey)
    if (!frameImg) {
      // 资源未加载，降级到 emoji（每个怪物每种 animType 只提示一次，避免刷屏）
      if (!monster._warnedFrames) monster._warnedFrames = {}
      if (!monster._warnedFrames[animType]) {
        monster._warnedFrames[animType] = true
        console.warn(`[Field] 怪物 ${monster.enemyId} 的动画帧未找到: ${frameKey} (animType=${animType})，降级到 emoji`)
      }
      this._renderEmojiMonster(ctx, monster, screenX, screenY)
      return
    }

    if (frameImg) {
      const imgWidth = frameImg.width
      const imgHeight = frameImg.height
      const scale = targetHeight / imgHeight
      const renderWidth = imgWidth * scale
      const renderHeight = targetHeight

      // 根据移动方向决定"应面向左" (facingLeft=true 表示怪物应朝左)
      // 优先用本帧实际位移方向，位移极小时用相对玩家方向兜底
      let facingLeft
      const dxMove = monster.x - (monster._prevRenderX !== undefined ? monster._prevRenderX : monster.x)
      if (Math.abs(dxMove) > 0.05) {
        facingLeft = dxMove < 0
      } else if (monster.inCombat || monster.moveAngle === undefined) {
        facingLeft = (this.playerX - monster.x) < 0
      } else {
        facingLeft = Math.cos(monster.moveAngle) < 0
      }
      monster._prevRenderX = monster.x

      // 翻转判定：优先使用 renderConfig.flipRule（与英雄/主角统一的语义），
      // 仅当未配置 flipRule 时回退到旧版 assetFacing 字段。
      // flipRule: 'same' = facingLeft 时翻转；'opposite' = !facingLeft 时翻转
      // assetFacing: 'left'(素材朝左) ⇔ opposite；'right'(素材朝右) ⇔ same
      const enemyRenderConfig = enemyConfig.renderConfig || {}
      const enemyFlipRule = enemyRenderConfig.flipRule
      let shouldFlip
      if (enemyFlipRule && enemyFlipRule !== 'none') {
        shouldFlip = this._shouldFlipByRule(facingLeft, enemyFlipRule)
      } else {
        const assetFacing = enemyRenderConfig.assetFacing || 'left'
        shouldFlip = assetFacing === 'left' ? !facingLeft : facingLeft
      }

      ctx.save()

      // Boss/精英光环
      if (monster.isBoss || monster.isElite) {
        ctx.beginPath()
        ctx.arc(screenX, screenY, 45 * this.dpr, 0, Math.PI * 2)
        ctx.fillStyle = monster.isBoss ? 'rgba(255, 71, 87, 0.3)' : 'rgba(124, 92, 224, 0.3)'
        ctx.fill()
      }

      // 绘制猫咪（带方向翻转，按素材固有朝向决定）
      if (shouldFlip) {
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
   * 获取怪物配置（动态读取 scripts/entities/monsters/ 下的配置文件）
   */
  _getMonsterConfig(enemyId) {
    // ★ 优先返回缓存
    if (this._monsterConfigCache[enemyId]) {
      return this._monsterConfigCache[enemyId]
    }

    // ★ 静态 require 映射：微信小游戏/原生环境不支持动态 require 字符串
    // （require('../entities/monsters/' + id + '.js') 在真机必然抛
    //  "module '...' is not defined"）。改为编译期静态可分析的映射，
    //  彻底消除"无法加载怪物配置"报错。
    const configMap = {
      'slime_cat': require('../entities/monsters/slime-cat.js'),
      'shadow_mouse': require('../entities/monsters/shadow-mouse.js'),
      'lost_healer_cat': require('../entities/monsters/lost-healer-cat.js'),
      'wild_cat': require('../entities/monsters/wild-cat.js'),
      // === 派生资源：换肤变体（同模异色史莱姆猫）===
      'flame_slime': require('../entities/monsters/slime_cat_skins.js').flame_slime,
      'aqua_slime': require('../entities/monsters/slime_cat_skins.js').aqua_slime,
      'violet_slime': require('../entities/monsters/slime_cat_skins.js').violet_slime,
      // === 派生资源：暗影鼠补帧顺滑版 ===
      'shadow_mouse_smooth': require('../entities/monsters/shadow-mouse-tween.js')
    }

    try {
      const configModule = configMap[enemyId]
      if (!configModule) throw new Error(`未注册的怪物配置: ${enemyId}`)
      const config = configModule.default || configModule

      // 缓存配置
      this._monsterConfigCache[enemyId] = config

      return config
    } catch (err) {
      console.warn(`[Field] 无法加载怪物配置 ${enemyId}，使用默认配置`, err)

      // 降级：返回默认配置（保持向后兼容）
      const defaultConfig = this._getDefaultMonsterConfig(enemyId)
      return defaultConfig
    }
  }

  /**
   * 获取默认怪物配置（降级方案）
   */
  _getDefaultMonsterConfig(enemyId) {
    const configMap = {
      'slime_cat': {
        animationConfig: {
          idle: { start: 1, end: 7, path: 'images/characters_anim/transparent/slime_cat/idle/', framePad: 1, frameDuration: 150 },
          walk: { start: 1, end: 12, path: 'images/characters_anim/transparent/slime_cat/walk/', framePad: 2, frameDuration: 120 },
          attack: { start: 8, end: 22, path: 'images/characters_anim/transparent/slime_cat/attack/', frameList: [8, 10, 12, 14, 16, 18, 20, 22], framePad: 4, frameDuration: 100 },
          hurt: { start: 1, end: 2, path: 'images/characters_anim/transparent/slime_cat/hurt/', framePad: 1, frameDuration: 80 },
          death: { start: 1, end: 6, path: 'images/characters_anim/transparent/slime_cat/death/', framePad: 2, frameDuration: 120 },
          skill: { start: 50, end: 80, path: 'images/characters_anim/transparent/slime_cat/skill/', frameList: [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80], framePad: 4, frameDuration: 100 }
        },
        renderConfig: {
          targetHeight: 80
        }
      },
      'shadow_mouse': {
        animationConfig: {
          idle: { start: 1, end: 6, path: 'images/characters_anim/transparent/shadow_mouse/idle/', framePad: 2, frameDuration: 150 },
          walk: { start: 1, end: 8, path: 'images/characters_anim/transparent/shadow_mouse/walk/', framePad: 2, frameDuration: 100 },
          attack: { start: 1, end: 7, path: 'images/characters_anim/transparent/shadow_mouse/attack/', framePad: 2, frameDuration: 80 },
          hurt: { start: 1, end: 2, path: 'images/characters_anim/transparent/shadow_mouse/hurt/', framePad: 2, frameDuration: 80 },
          death: { start: 1, end: 6, path: 'images/characters_anim/transparent/shadow_mouse/death/', framePad: 2, frameDuration: 120 },
          skill: { start: 1, end: 8, path: 'images/characters_anim/transparent/shadow_mouse/skill/', framePad: 2, frameDuration: 100 }
        },
        renderConfig: {
          targetHeight: 80
        }
      },
      'lost_healer_cat': {
        animationConfig: {
          idle: { start: 1, end: 8, path: 'images/characters_anim/transparent/aimi/idle/', framePad: 2, frameDuration: 150 },
          walk: { start: 1, end: 8, path: 'images/characters_anim/transparent/aimi/walk/', framePad: 2, frameDuration: 120 },
          attack: { start: 1, end: 8, path: 'images/characters_anim/transparent/aimi/attack/', framePad: 2, frameDuration: 100 },
          hurt: { start: 1, end: 2, path: 'images/characters_anim/transparent/aimi/hurt/', framePad: 2, frameDuration: 80 },
          death: { start: 1, end: 8, path: 'images/characters_anim/transparent/aimi/death/', framePad: 2, frameDuration: 150 },
          skill: { start: 1, end: 8, path: 'images/characters_anim/transparent/aimi/skill/', framePad: 2, frameDuration: 100 },
          buff: { start: 1, end: 8, path: 'images/characters_anim/transparent/aimi/buff/', framePad: 2, frameDuration: 100 },
          support: { start: 1, end: 8, path: 'images/characters_anim/transparent/aimi/support/', framePad: 2, frameDuration: 100 },
          cast: { start: 1, end: 4, path: 'images/characters_anim/transparent/aimi/cast/', framePad: 2, frameDuration: 120 }
        },
        renderConfig: {
          targetHeight: 80
        }
      },
      'wild_cat': {
        // 复用史莱姆猫的资源
        animationConfig: {
          idle: { start: 1, end: 7, path: 'images/characters_anim/transparent/slime_cat/idle/', framePad: 1, frameDuration: 150 },
          walk: { start: 1, end: 12, path: 'images/characters_anim/transparent/slime_cat/walk/', framePad: 2, frameDuration: 120 }
        },
        renderConfig: {
          targetHeight: 80
        }
      }
    }
    
    return configMap[enemyId] || null
  }

  /**
   * 构建资源键（与 asset-manager.js 中的 buildFrames 逻辑一致）
   * 支持连续帧和非连续帧（frameList）
   */
  _buildFrameKey(enemyId, animType, frameIdx, framePad) {
    // 获取资源前缀
    const prefixMap = {
      'slime_cat': 'SLIME_CAT',
      'shadow_mouse': 'SHADOW_MOUSE',
      'lost_healer_cat': 'AIMI',
      'wild_cat': 'SLIME_CAT',  // wild_cat 复用史莱姆猫资源
      // === 派生资源：换肤变体（同模异色史莱姆猫）===
      'flame_slime': 'FLAME_SLIME',
      'aqua_slime': 'AQUA_SLIME',
      'violet_slime': 'VIOLET_SLIME',
      // === 派生资源：暗影鼠补帧顺滑版 ===
      'shadow_mouse_smooth': 'SHADOW_MOUSE_SMOOTH'
    }

    const prefix = prefixMap[enemyId] || 'SLIME_CAT'
    const action = animType.toUpperCase()
    
    // 构建资源键：PREFIX_ACTION_FRAMENUM
    // frameIdx 是实际文件名中的帧号（如 8, 10, 12... 或 1, 2, 3...）
    const frameNum = String(frameIdx).padStart(framePad, '0')
    return `${prefix}_${action}_${frameNum}`
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
  
  /** @deprecated 使用 canvas-utils.roundRect() */
  _roundRect(ctx, x, y, w, h, r) { roundRect(ctx, x, y, w, h, r) }

  _renderObstacles(ctx) {
    // 绘制碰撞区域的可视化（用于调试）
    if (!this.obstacles || this.obstacles.length === 0) return

    // 调试：输出第一个障碍物的坐标信息
    if (!this._obstacleRenderDebugLogged && this.obstacles.length > 0) {
      this._obstacleRenderDebugLogged = true
      const obs = this.obstacles[0]
      console.log(`[障碍物渲染调试] 第一个障碍物: 逻辑坐标(${obs.x}, ${obs.y}) 尺寸${obs.width}x${obs.height}`)
      console.log(`[障碍物渲染调试] dpr=${this.dpr}, camera(物理px)=(${this.cameraX}, ${this.cameraY})`)
    }

    for (const obstacle of this.obstacles) {
      // 转换为屏幕坐标
      const screenX = obstacle.x * this.dpr - this.cameraX
      const screenY = obstacle.y * this.dpr - this.cameraY

      // 跳过屏幕外的障碍物（优化性能）
      const w = obstacle.width * this.dpr
      const h = obstacle.height * this.dpr
      if (screenX + w < 0 || screenX > this.width || screenY + h < 0 || screenY > this.height) {
        continue
      }

      if (obstacle.type === 'rect') {
        // ── 1. 绘制半透明红色填充 ──
        ctx.fillStyle = 'rgba(255, 0, 0, 0.25)'
        ctx.fillRect(screenX, screenY, w, h)

        // ── 2. 绘制红色边框 ──
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'
        ctx.lineWidth = 2
        ctx.strokeRect(screenX, screenY, w, h)

        // ── 3. 绘制四个角落的标记（小方块）──
        const cornerSize = 6 * this.dpr
        ctx.fillStyle = '#ff0000'
        // 左上
        ctx.fillRect(screenX - cornerSize / 2, screenY - cornerSize / 2, cornerSize, cornerSize)
        // 右上
        ctx.fillRect(screenX + w - cornerSize / 2, screenY - cornerSize / 2, cornerSize, cornerSize)
        // 左下
        ctx.fillRect(screenX - cornerSize / 2, screenY + h - cornerSize / 2, cornerSize, cornerSize)
        // 右下
        ctx.fillRect(screenX + w - cornerSize / 2, screenY + h - cornerSize / 2, cornerSize, cornerSize)

        // ── 4. 绘制中心十字准星 ──
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)'
        ctx.lineWidth = 1
        const cx = screenX + w / 2
        const cy = screenY + h / 2
        // 水平线
        ctx.beginPath()
        ctx.moveTo(cx - 10 * this.dpr, cy)
        ctx.lineTo(cx + 10 * this.dpr, cy)
        ctx.stroke()
        // 垂直线
        ctx.beginPath()
        ctx.moveTo(cx, cy - 10 * this.dpr)
        ctx.lineTo(cx, cy + 10 * this.dpr)
        ctx.stroke()

        // ── 5. 显示名称和坐标信息 ──
        ctx.font = `bold ${11 * this.dpr}px monospace`
        ctx.fillStyle = '#ff0000'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        const labelY = screenY - 5 * this.dpr  // 在矩形上方显示
        ctx.fillText(`${obstacle.name || '障碍'}`, cx, labelY)
        ctx.font = `${9 * this.dpr}px monospace`
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)'
        ctx.fillText(`(${obstacle.x},${obstacle.y})`, cx, labelY - 12 * this.dpr)

        // ── 6. 绘制从障碍物中心到玩家位置的连线（如果距离较近）──
        if (typeof this.playerX === 'number') {
          const obsCenterX = obstacle.x * this.dpr + w / 2
          const obsCenterY = obstacle.y * this.dpr + h / 2
          const playerScreenX = this.playerX - this.cameraX
          const playerScreenY = this.playerY - this.cameraY
          const dist = Math.sqrt((obsCenterX - playerScreenX) ** 2 + (obsCenterY - playerScreenY) ** 2)
          if (dist < 300 * this.dpr) {  // 只绘制近距离的连线
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)'
            ctx.lineWidth = 1
            ctx.setLineDash([5, 5])
            ctx.beginPath()
            ctx.moveTo(obsCenterX, obsCenterY)
            ctx.lineTo(playerScreenX, playerScreenY)
            ctx.stroke()
            ctx.setLineDash([])  // 恢复实线
          }
        }
      } else if (obstacle.type === 'circle') {
        // 绘制圆形
        const r = obstacle.radius * this.dpr
        ctx.beginPath()
        ctx.arc(screenX, screenY, r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 0, 0, 0.25)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'
        ctx.lineWidth = 2
        ctx.stroke()

        // 显示名称
        ctx.font = `${12 * this.dpr}px sans-serif`
        ctx.fillStyle = '#ff0000'
        ctx.textAlign = 'center'
        ctx.fillText(obstacle.name || '障碍', screenX, screenY)
      }  // 结束 if (obstacle.type === 'circle')
    }
  }
}
