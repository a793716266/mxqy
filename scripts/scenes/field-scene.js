/**
 * field-scene.js - 野外探索场景（可移动大地图）
 */

import { ENEMIES_CH1, ENEMIES_CH2, getEnemyByLevel } from '../data/enemies.js'
import { installFieldBattleSystem } from '../systems/field-battle-system.js'
import { getHeroMoveLock, isHeroSuperArmor } from '../systems/combat-state.js'
import { HEROES } from '../data/heroes.js'
import { getMapCollisionsSync } from '../data/map_collisions.js'
import { isPointInObstacle as _isPointInGrasslandObstacle, generateGrasslandCollisions as _genGrassCollisions, GRASSLAND_MAP_CONFIG, GRASSLAND_MAP_OBJECTS, GLAND_OBJ_TYPE } from '../data/grassland-map-data.js'
import { RENDER_LAYER, getRenderLayer, isSortableLayer } from '../data/render-layer-config.js'
import { GRASSLAND_DUNGEON } from '../data/grassland-dungeon.js'
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
    // ★ 初始位置：阳光草原地图左下角（x=200, y=2900，逻辑像素，已避开障碍物）
    this.playerX = 200 * this.dpr
    this.playerY = 2900 * this.dpr
    this.playerSpeed = 150 * this.dpr
    // ★ 主角实际移速倍率（含 slow 减速 debuff，正常=1）：用于同步走路动画播放速度
    this._playerMoveSpeedMult = 1
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
                monster.strafeAngle = Math.random() * Math.PI * 2  // ★ 固定世界方向角，避免 strafe 随相对位置抖动
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

    // ★ 副本模式（阳光草原）：不依赖恢复存档，进入即用已加载的怪物批次（通关后清档→下次全新）；
    //   播副本 BGM。注意：不在此二次调用 _generateMonsters()，以免打乱确定性测试的 seeded RNG。
    if (this.areaInfo.isDungeon) {
      this.dungeonCleared = false
      this.showDungeonClear = false
      this.dungeonClearTimer = 0
      this._returningToTown = false
      this.dungeonTotal = this.mapMonsters.length
      this.dungeonReward = 80
      // ★ 安全区 / 回血点（篝火）：逻辑像素配置 ×dpr
      this.safeZones = (GRASSLAND_DUNGEON.safeZones || []).map(z => ({
        id: z.id, name: z.name, x: z.x * this.dpr, y: z.y * this.dpr, radius: z.radius * this.dpr,
      }))
      this._inSafeZone = false
      this._dropFloaters = []
      this.bossDialogueShown = false
      this.storyDialogue = null
      // ★ 开场引导对话（首次进入触发，持久化防重复）——自动播放不阻塞操作
      if (!this.game.data.hasFlag('introShown_grassland')) {
        this._showStoryDialogue(GRASSLAND_DUNGEON.introDialogue.name, GRASSLAND_DUNGEON.introDialogue.lines)
        this.game.data.setFlag('introShown_grassland')
      }
      const _a = this.game.audio
      if (_a && typeof _a.playBGM === 'function') _a.playBGM('bgm_grassland')
    } else {
      const _a = this.game.audio
      if (_a && typeof _a.playBGM === 'function') _a.playBGM('bgm_explore')
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
        bossEnemy: 'dark_cat_king',  // 第一章代表 Boss：暗影猫王（替换偏弱的治疗猫）
        bossLevel: 5,               // 显式覆盖 dark_cat_king 自带的 level 10，避免 HP 按 10 级缩放膨胀
        // ★ 第一章 Boss 属性覆盖（maxHp/atk/def/spd）已数据驱动地配置在
        //   scripts/data/grassland-dungeon.js 的 bossStatsOverride，由 _generateMonsters 读取应用。
        enemyData: ENEMIES_CH1,  // 敌人数据源
        color: '#5daE4a',
        minEnemies: 1,  // 最少敌人数量
        maxEnemies: 2,  // 最多敌人数量
        isDungeon: true // ★ 阳光草原即副本：不刷新怪物、可通关、有目标HUD/奖励
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
      this.bossDisplayName = bossData ? bossData.name : '首领'
      
      // 检查Boss是否已被击败
      const bossFlag = `${this.areaId}_${bossId}_defeated`
      if (!this.game.data.hasFlag(bossFlag) && bossData) {
        // Boss位置：地图右上角远处（85%, 8%）
        const bossX = this.mapWidth * 0.85
        const bossY = this.mapHeight * 0.08
        
        
        // ★ 使用 getEnemyByLevel 计算最终属性（bossLevel 显式覆盖自带 level，避免缩放膨胀）
        const finalBossData = getEnemyByLevel(bossData, this.areaInfo.bossLevel || bossData.level || 5)

        // ★ 第一章 Boss 属性覆盖：dark_cat_king 本体按终章 level 10 编写，getEnemyByLevel 会进一步放大，
        //   必须用 GRASSLAND_DUNGEON.bossStatsOverride 把 HP/攻/防/速拉回章节适配值（见配置文件注释）。
        if (GRASSLAND_DUNGEON.bossStatsOverride) {
          const _o = GRASSLAND_DUNGEON.bossStatsOverride
          if (_o.maxHp != null) { finalBossData.maxHp = _o.maxHp; finalBossData.hp = _o.maxHp }
          if (_o.atk != null) finalBossData.atk = _o.atk
          if (_o.def != null) finalBossData.def = _o.def
          if (_o.spd != null) finalBossData.spd = _o.spd
        }

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
          strafeAngle: Math.random() * Math.PI * 2, // ★ 固定世界方向角，避免 strafe 随相对位置抖动
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
        
        // ★ 记录 Boss 登场台词（玩家首次接近时触发一次），复用实体 dialogue 字段前两句
        this.bossDialogue = (bossData && Array.isArray(bossData.dialogue)) ? bossData.dialogue.slice(0, 2) : null
        this.bossDialogueName = bossData ? bossData.name : '暗影猫王'
        this.bossDialogueShown = false
        console.log(`[Field] 生成Boss: ${bossData.name} 在位置 (${bossX}, ${bossY})`)
      }
    }

    // ★ 区域分层刷新（grassland 读 GRASSLAND_DUNGEON.spawnZones，难度递进；其它区域保留原随机）
    if (this.areaId === 'grassland' && GRASSLAND_DUNGEON.spawnZones) {
      let _idx = 0
      for (const _zone of GRASSLAND_DUNGEON.spawnZones) {
        const _zx = _zone.x * this.dpr, _zy = _zone.y * this.dpr
        const _zw = _zone.w * this.dpr, _zh = _zone.h * this.dpr
        for (let _i = 0; _i < _zone.count; _i++) {
          let _att = 0, _valid = false, _x, _y
          while (!_valid && _att < 50) {
            _x = _zx + Math.random() * _zw
            _y = _zy + Math.random() * _zh
            _valid = true
            for (const m of monsters) {
              if (Math.sqrt((_x - m.x) ** 2 + (_y - m.y) ** 2) < minDistance) { _valid = false; break }
            }
            if (_valid && collisions && collisions.length > 0) {
              if (_isPointInGrasslandObstacle(_x / this.dpr, _y / this.dpr, 60, collisions)) _valid = false
            }
            _att++
          }
          if (!_valid) continue
          const _eid = _zone.enemies[Math.floor(Math.random() * _zone.enemies.length)]
          const _lvl = _zone.level[0] + Math.floor(Math.random() * (_zone.level[1] - _zone.level[0] + 1))
          this._spawnMonsterCommon(monsters, _eid, _x, _y, _lvl, _idx++)
        }
      }
      console.log(`[Field] 区域分层生成了 ${monsters.length} 只怪物（含 Boss）`)
    } else {
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
          strafeAngle: Math.random() * Math.PI * 2, // ★ 固定世界方向角，避免 strafe 随相对位置抖动
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
    }

    console.log(`[Field] 生成了 ${monsters.length} 只怪物`)
    return monsters
  }

  /**
   * 通用怪物构造（抽自 _generateMonsters 的普通怪分支，供区域分层刷新复用）。
   * 统一生成完整战斗属性 + AI 巡逻参数，避免重复字面量。
   */
  _spawnMonsterCommon(monsters, enemyId, x, y, level, idx) {
    const enemyData = (this.areaInfo.enemyData || ENEMIES_CH1)[enemyId]
    if (!enemyData) return
    const finalEnemyData = getEnemyByLevel(enemyData, level)
    const normalizedSkills = this._normalizeMonsterSkills(finalEnemyData?.skills, enemyId)
    monsters.push({
      id: `${this.areaId}_monster_${idx}`,
      enemyId,
      x,
      y,
      name: finalEnemyData?.name || '坏猫',
      isBoss: false,
      isElite: false,
      alive: true,
      level: finalEnemyData?.level || level,
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
      skillCDs: this._initSkillCDs(normalizedSkills),
      isCastingSkill: false,
      skillAnimTimer: 0,
      skillCastId: null,
      inCombat: false,
      skillUseCount: 0,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeTimer: 0,
      strafeAngle: Math.random() * Math.PI * 2,
      bobOffset: Math.random() * Math.PI * 2,
      bobSpeed: 2 + Math.random(),
      animTimer: 0,
      animFrame: 0,
      attackCDTimer: 0,
      homeX: x,
      homeY: y,
      patrolRadius: (80 + Math.random() * 40) * this.dpr,
      moveAngle: Math.random() * Math.PI * 2,
      moveSpeed: (20 + Math.random() * 10) * this.dpr,
      moveTimer: 0,
      pauseTimer: 0,
      isMoving: Math.random() > 0.3,
    })
  }

  /**
   * 启动一段叙事对话（自动逐条播放、不阻塞操作）。
   * name  : 说话者；lines: 文本数组。每条停留 hold 秒后自动切下一条，全部播完置空。
   */
  _showStoryDialogue(name, lines) {
    if (!lines || !lines.length) return
    this.storyDialogue = { name, lines, index: 0, timer: 4.0, hold: 4.0 }
  }

  _updateStoryDialogue(dt) {
    const d = this.storyDialogue
    if (!d) return
    d.timer -= dt
    if (d.timer <= 0) {
      d.index++
      if (d.index >= d.lines.length) {
        this.storyDialogue = null
      } else {
        d.timer = d.hold
      }
    }
  }

  /**
   * 玩家首次接近存活 Boss 时弹出登场台词（每副本仅一次，由 bossDialogueShown 防重复）。
   */
  _checkBossApproach() {
    if (this.bossDialogueShown || !this.bossDialogue || !this.bossDialogue.length) return
    const boss = (this.mapMonsters || []).find(m => m.isBoss && m.alive)
    if (!boss) return
    const dx = this.playerX - boss.x
    const dy = this.playerY - boss.y
    if (Math.sqrt(dx * dx + dy * dy) < 240 * this.dpr) {
      this._showStoryDialogue(this.bossDialogueName || '暗影猫王', this.bossDialogue)
      this.bossDialogueShown = true
    }
  }

  /**
   * 安全区（篝火）回血：玩家进入任一安全区半径内，全队向 maxHp 持续回升（每秒 30%），
   * 避免第一章前期无治疗角色时被反复撞怪打至卡死。进入瞬间提示一次。
   */
  _updateSafeZoneHeal(dt) {
    if (!this.safeZones || !this.safeZones.length) return
    let inZone = false
    for (const z of this.safeZones) {
      const dx = this.playerX - z.x
      const dy = this.playerY - z.y
      if (Math.sqrt(dx * dx + dy * dy) <= z.radius) { inZone = true; break }
    }
    if (inZone) {
      // ★ 直接操作 persistent 队伍 HP（this.party），而非 battleSystem.battleHeroes：
      // 后者仅在开战时构建，探索期为空数组，会导致篝火回血在两次战斗之间完全失效。
      const party = this.party
      if (party && party.length) {
        for (const hero of party) {
          if (!hero || hero.hp == null) continue
          const maxHp = hero.maxHp || hero.hp
          if (hero.hp < maxHp) {
            hero.hp = Math.min(maxHp, hero.hp + maxHp * 0.3 * dt)
          }
        }
      }
      if (!this._inSafeZone) {
        this._inSafeZone = true
        if (this.game.showToast) this.game.showToast('🔥 在篝火旁休息，生命恢复中...')
      }
    } else {
      this._inSafeZone = false
    }
  }
  
  init() {
    // 队友 AI 行为模式：false=自行寻怪战斗不跟随；true=召回（紧跟主角身边）
    this.aiRecall = false

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

    // ★ 副本叙事对话推进（自动播放，不阻塞移动/战斗）
    if (this.storyDialogue) this._updateStoryDialogue(dt)
    // ★ 掉落飘字上浮动画
    this._updateDropFloaters(dt)

    // ★ 副本：安全区回血 + Boss 接近登场对话
    if (this.areaInfo && this.areaInfo.isDungeon) {
      this._updateSafeZoneHeal(dt)
      this._checkBossApproach()
    }

    // 更新怪物移动
    this._updateMonsters(dt)

    // ★ 英雄状态：击飞弧线位移 + 眩晕倒计时（供移动冻结/AI跳过/渲染使用）
    this._updateHeroStatus(dt)

    // 摇杆输入（每帧从 InputManager 读取触点）
    this._updateJoystickInput()

    // 摇杆控制移动
    const wasMoving = this.isMoving
    this.isMoving = false

    if (this.joystick.active) {
      // ★ 统一移动锁收口到 combat-state.getHeroMoveLock（单一真相源，含玩家/AI 历史不对称）：
      //   castLockTimer(全锁) / _stunned(击飞硬直) / _hurtLock(受击硬直) / castAxisLockTimer(Y 轴锁)
      const ctrlHero = this._getCurrentControlHero && this._getCurrentControlHero()
      const _moveLock = getHeroMoveLock({ hero: (ctrlHero && ctrlHero.hero) || {}, battleSystem: this.battleSystem, isMain: true })
      if (_moveLock.full) {
        this.isMoving = false
      } else {
        const jx = this.joystick.currentX - this.joystickConfig.centerX
        let dy = this.joystick.currentY - this.joystickConfig.centerY
        let dist = Math.sqrt(jx * jx + dy * dy)
        let dx = jx

        // ★ 伤害技能/普攻施法期间：只允许 X 轴移动（Y 分量被限制为 0）
        //   对应 castAxisLockTimer（field-battle-system 在普攻/伤害技能释放时设置）
        if (_moveLock.axisY) {
          dy = 0
          dist = Math.abs(jx)
          if (dist < 1) dist = 0
        }

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
          this._playerMoveSpeedMult = speedFactor
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

          // ★ 不再检查与怪物的碰撞（与AI角色行为一致：角色之间无碰撞，角色与怪物也无碰撞）
          // 之前只有被控者(摇杆移动)触发 _checkMonsterCollision，AI角色不走这里，
          // 导致"臻宝不碰撞、李小宝碰撞"的差异；现统一移除，角色可自由穿过怪物。
          // this._checkMonsterCollision()
        }
      }
    }

    // ★ 新增：更新战斗系统
    if (this.battleSystem.active) {
      this._updateBattleSystem(dt)
    }

    // 更新队友跟随
    this._updateFollowers(dt)

    // 使用 CharacterSprite 更新主角动画
    // ★ 战斗中被控者不是主角时，主角的动画由 _updateFollowers 尾部的主角AI站位逻辑维护，
    //   这里不能用摇杆状态(this.isMoving)覆盖——否则主角会"原地播放走路动画"
    const isHeroControlled = !(this.battleSystem && this.battleSystem.active &&
      this.battleSystem.battleHeroes && this.battleSystem.battleHeroes[0] &&
      this.battleSystem.battleHeroes[0].partyIndex !== 0)
    if (this.mainCharacterSprite && isHeroControlled) {
      // ★ 同步主角实际移速倍率（slow 减速→动画变慢，消除滑步；加速 buff→动画变快）
      this.mainCharacterSprite._moveSpeedMult = this._playerMoveSpeedMult || 1
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
    // ★ 副本：检测通关 / 通关后回城倒计时
    this._checkDungeonClear(dt)

    // 更新切换提示计时器
    if (this.showSwitchTip) {
      this.switchTipTimer -= dt
      if (this.switchTipTimer <= 0) {
        this.showSwitchTip = false
      }
    }

    // ★ BUFF 粒子系统更新 + 持续喷发（真正的粒子效果）
    this._updateBuffParticles(dt)
    // ★ 怪物异常状态粒子系统更新 + 持续喷发
    this._updateMonsterStatusParticles(dt)
  }

  // ==========================================================================
  // ★ BUFF 粒子系统（专业粒子：速度/方向/重力/衰减/寿命）
  // ==========================================================================

  /**
   * 喷发粒子（释放 buff 瞬间：环形扩散 + 上升）
   * @param {Object} hero 英雄
   * @param {string} color 颜色
   * @param {number} count 数量
   */
  _spawnBuffParticles(hero, color, count) {
    if (!this.battleSystem.buffParticles) this.battleSystem.buffParticles = []
    const bh = (this.battleSystem.battleHeroes || []).find(b => b.hero === hero)
    const pos = bh && bh.getPos ? bh.getPos() : { x: this.playerX, y: this.playerY }
    const x = pos.x
    const y = pos.y
    const dpr = this.dpr
    const n = count || 24
    for (let i = 0; i < n; i++) {
      // 环形扩散（+随机）为主 + 部分上升粒子
      let angle, spd
      if (i < n * 0.7) {
        // 环形扩散粒子：以角色为中心向四周喷出
        angle = (i / (n * 0.7)) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
        spd = (60 + Math.random() * 90) * dpr
      } else {
        // 上升粒子
        angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8
        spd = (50 + Math.random() * 60) * dpr
      }
      this.battleSystem.buffParticles.push({
        x: x + (Math.random() - 0.5) * 20 * dpr,
        y: y + 20 * dpr + (Math.random() - 0.5) * 10 * dpr,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: (2 + Math.random() * 4) * dpr,
        color: color,
        life: 1,
        decay: 0.6 + Math.random() * 0.8,   // 每秒衰减，0.6~1.4秒存活
        gravity: 40 * dpr,                   // 向下重力
        glow: true
      })
    }
    // 上限保护
    if (this.battleSystem.buffParticles.length > 200) {
      this.battleSystem.buffParticles.splice(0, this.battleSystem.buffParticles.length - 200)
    }
  }

  /**
   * 持续喷发（buff 持续期间每帧少量粒子，体现"生效中"）
   */
  _spawnBuffAuraParticles(hero, color) {
    if (!this.battleSystem.buffParticles) this.battleSystem.buffParticles = []
    if (this.battleSystem.buffParticles.length > 150) return
    const bh = (this.battleSystem.battleHeroes || []).find(b => b.hero === hero)
    const pos = bh && bh.getPos ? bh.getPos() : { x: this.playerX, y: this.playerY }
    const dpr = this.dpr
    // 每帧 2 个上升粒子（从脚下往头顶飘）
    for (let i = 0; i < 2; i++) {
      this.battleSystem.buffParticles.push({
        x: pos.x + (Math.random() - 0.5) * 30 * dpr,
        y: pos.y + 25 * dpr,
        vx: (Math.random() - 0.5) * 30 * dpr,
        vy: -(50 + Math.random() * 40) * dpr,   // 向上
        size: (1.5 + Math.random() * 2.5) * dpr,
        color: color,
        life: 1,
        decay: 0.5 + Math.random() * 0.5,
        gravity: -8 * dpr,   // 微浮力，飘得更久
        glow: true
      })
    }
  }

  /**
   * 更新粒子（位置/衰减）
   */
  _updateBuffParticles(dt) {
    if (!this.battleSystem || !this.battleSystem.buffParticles) return
    const list = this.battleSystem.buffParticles
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]
      p.life -= p.decay * dt
      if (p.life <= 0) { list.splice(i, 1); continue }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.gravity * dt
    }
    // ★ 持续喷发：buff 存活期间每帧补充粒子
    if (this.battleSystem.active && this.battleSystem.battleHeroes) {
      for (const bh of this.battleSystem.battleHeroes) {
        if (!bh.hero || bh.hero.hp <= 0) continue
        const activeBuffs = (bh.hero._buffs || []).filter(b => b._active && b._remaining > 0)
        for (const b of activeBuffs) {
          this._spawnBuffAuraParticles(bh.hero, this._hexColorFromRgba(b._color) || '#7ab8ff')
        }
      }
    }
  }

  /**
   * 把 rgba(...) 前缀转成 hex（粒子用 hex 更好混色）
   */
  _hexColorFromRgba(c) {
    if (!c) return '#7ab8ff'
    const m = c.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/)
    if (!m) return c
    const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3])
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
  }

  /**
   * 渲染粒子
   */
  _renderBuffParticles(ctx) {
    if (!this.battleSystem || !this.battleSystem.buffParticles) return
    const list = this.battleSystem.buffParticles
    if (list.length === 0) return
    const dpr = this.dpr
    ctx.save()
    for (const p of list) {
      const alpha = Math.max(0, Math.min(1, p.life))
      const sx = p.x - this.cameraX
      const sy = p.y - this.cameraY
      // 发光外圈
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.25})`
      ctx.beginPath()
      ctx.arc(sx, sy, p.size * 1.8, 0, Math.PI * 2)
      ctx.fill()
      // 粒子核心（带颜色）
      ctx.fillStyle = p.color.startsWith('#') ? p.color : p.color
      ctx.globalAlpha = alpha * 0.9
      ctx.beginPath()
      ctx.arc(sx, sy, p.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  // ════════════════════════════════════════════════════════════
  // ★ 怪物异常状态视觉系统（灼烧/冰冻/感电/紧固）
  //   复用 BUFF 粒子基础设施，独立 list 管理怪物状态持续粒子
  // ════════════════════════════════════════════════════════════

  // 状态元数据（与 battle-system 的 STATUS_META 保持一致，供渲染取色）
  STATUS_META = {
    burn:      { color: '#ff6a2b', glow: 'rgba(255,106,43,', name: '灼烧' },
    freeze:    { color: '#7fe3ff', glow: 'rgba(127,227,255,', name: '冰冻' },
    electrify: { color: '#ffe14d', glow: 'rgba(255,225,77,', name: '感电' },
    root:      { color: '#5bd66b', glow: 'rgba(91,214,107,', name: '紧固' },
  }

  /**
   * 怪物状态持续粒子生成（每帧由 _updateMonsterStatusParticles 调用）
   * 不同状态用不同粒子语言：
   *   burn      → 橙红火星上升 + 飘动
   *   freeze    → 青蓝冰晶碎片缓慢下坠 + 微光
   *   electrify → 黄白电弧火花快速迸射
   *   root      → 绿色藤蔓/草屑从脚底钻出
   */
  _spawnMonsterStatusParticles(monster, type, color) {
    if (!this.battleSystem.monsterStatusParticles) this.battleSystem.monsterStatusParticles = []
    if (this.battleSystem.monsterStatusParticles.length > 320) return
    const dpr = this.dpr
    const wx = monster.x
    const wy = monster.y
    let n = 2
    if (type === 'burn') {
      for (let i = 0; i < 2; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9
        const spd = (40 + Math.random() * 60) * dpr
        this.battleSystem.monsterStatusParticles.push({
          x: wx + (Math.random() - 0.5) * 26 * dpr,
          y: wy - (10 + Math.random() * 40) * dpr,
          vx: Math.cos(a) * spd * 0.4,
          vy: Math.sin(a) * spd,
          size: (2 + Math.random() * 3) * dpr,
          color: Math.random() < 0.5 ? color : '#ffd24a',
          life: 0.6 + Math.random() * 0.4,
          decay: 1.0 + Math.random() * 0.6,
          gravity: -10 * dpr,
          glow: true,
          kind: 'ember'
        })
      }
    } else if (type === 'freeze') {
      for (let i = 0; i < 1; i++) {
        const a = Math.random() * Math.PI * 2
        const spd = (15 + Math.random() * 25) * dpr
        this.battleSystem.monsterStatusParticles.push({
          x: wx + Math.cos(a) * 22 * dpr,
          y: wy - (20 + Math.random() * 30) * dpr,
          vx: Math.cos(a) * spd * 0.5,
          vy: (10 + Math.random() * 20) * dpr,   // 冰晶缓慢下坠
          size: (1.5 + Math.random() * 2.5) * dpr,
          color: color,
          life: 0.7 + Math.random() * 0.5,
          decay: 0.8 + Math.random() * 0.4,
          gravity: 12 * dpr,
          glow: true,
          kind: 'ice'
        })
      }
    } else if (type === 'electrify') {
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2
        const spd = (80 + Math.random() * 120) * dpr
        this.battleSystem.monsterStatusParticles.push({
          x: wx + (Math.random() - 0.5) * 30 * dpr,
          y: wy - (10 + Math.random() * 50) * dpr,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          size: (1 + Math.random() * 2) * dpr,
          color: Math.random() < 0.5 ? color : '#ffffff',
          life: 0.2 + Math.random() * 0.25,
          decay: 2.5 + Math.random() * 2,
          gravity: 0,
          glow: true,
          kind: 'spark'
        })
      }
    } else if (type === 'root') {
      for (let i = 0; i < 1; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.8
        const spd = (30 + Math.random() * 50) * dpr
        this.battleSystem.monsterStatusParticles.push({
          x: wx + (Math.random() - 0.5) * 30 * dpr,
          y: wy + 8 * dpr,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd * 0.3,
          size: (2 + Math.random() * 2.5) * dpr,
          color: color,
          life: 0.5 + Math.random() * 0.4,
          decay: 1.2 + Math.random() * 0.6,
          gravity: 30 * dpr,
          glow: false,
          kind: 'vine'
        })
      }
    }
  }

  /**
   * 更新怪物状态粒子（位置/衰减）+ 持续补充
   */
  _updateMonsterStatusParticles(dt) {
    if (!this.battleSystem) return
    if (!this.battleSystem.monsterStatusParticles) this.battleSystem.monsterStatusParticles = []
    const list = this.battleSystem.monsterStatusParticles
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]
      p.life -= p.decay * dt
      if (p.life <= 0) { list.splice(i, 1); continue }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.gravity * dt
      // 火花类快速闪烁衰减已有 decay 控制；其余自然飘散
    }
    // ★ 持续喷发：怪物处于异常状态时每帧补充粒子
    if (this.battleSystem.active && this.mapMonsters) {
      for (const m of this.mapMonsters) {
        if (!m.alive || !m.statusEffects) continue
        for (const e of m.statusEffects) {
          if (!e._active || e._remaining <= 0) continue
          const color = e._color || (this.STATUS_META && this.STATUS_META[e.type] && this.STATUS_META[e.type].color) || '#ffffff'
          this._spawnMonsterStatusParticles(m, e.type, color)
        }
      }
    }
  }

  /**
   * 渲染怪物状态粒子（与 BUFF 粒子同款发光画法）
   */
  _renderMonsterStatusParticles(ctx) {
    if (!this.battleSystem || !this.battleSystem.monsterStatusParticles) return
    const list = this.battleSystem.monsterStatusParticles
    if (list.length === 0) return
    const dpr = this.dpr
    ctx.save()
    for (const p of list) {
      const alpha = Math.max(0, Math.min(1, p.life))
      const sx = p.x - this.cameraX
      const sy = p.y - this.cameraY
      if (p.glow) {
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.25})`
        ctx.beginPath()
        ctx.arc(sx, sy, p.size * 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = p.color
      ctx.globalAlpha = alpha * 0.9
      ctx.beginPath()
      ctx.arc(sx, sy, p.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  _updateMonsters(dt) {
    if (!this.mapMonsters || !Array.isArray(this.mapMonsters)) return

    for (const monster of this.mapMonsters) {
      // ★ 击杀掉落：检测怪物「刚死亡」状态跳变（alive=false 且尚未结算），一次性触发。
      //   覆盖所有击杀路径（普攻 / 技能 / AOE / 落雷），无需在每个 m.alive=false 处散点埋点。
      if (!monster.alive) {
        if (!monster._looted) {
          monster._looted = true
          this._rollMonsterDrop(monster)
        }
        continue
      }

      // ★ 支持序列帧动画的怪物列表（使用 _renderCatMonster 渲染）
      const useCatAnim = ['slime_cat', 'shadow_mouse', 'wild_cat', 'lost_healer_cat', 'flame_slime', 'aqua_slime', 'violet_slime', 'shadow_mouse_smooth'].includes(monster.enemyId)
      if (useCatAnim && monster.animTimer === undefined) {
        monster.animTimer = 0
        monster.animFrame = 0
      }

      // 更新猫咪动画（无论是否暂停）
      if (useCatAnim) {
        const _mcfg = this._getMonsterConfig(monster.enemyId)
        // ★ 跳跃攻击（jump_attack）按语义分相驱动 skill 帧：
        //   预警阶段 = 起跳准备(frameList 前段)，飞跃阶段 = 跳跃至目标(中段)，落地 = 收尾帧(末帧)。
        //   注：此前此逻辑硬编码限定 shadow_mouse，导致其它会跳跃的猫怪(如史莱姆猫)放跳跃攻击时
        //   走不到分相、_jumpLandingTimer 清理不执行 → isCastingSkill 不复位、skill 帧永久卡死。
        //   现改为对所有 jump_attack 猫怪通用，并基于 frameList 索引(0-based)推进，兼容任意帧表。
        const _isJumpAttack = monster.isCastingSkill && monster._castingSkill &&
          monster._castingSkill.type === 'jump_attack' &&
          _mcfg && _mcfg.animationConfig && _mcfg.animationConfig.skill
        if (_isJumpAttack) {
          const sk = _mcfg.animationConfig.skill
          const _skillFrames = sk.frameList ||
            (sk.end != null ? Array.from({ length: sk.end - sk.start + 1 }, (_, i) => sk.start + i) : [])
          const _sfTotal = _skillFrames.length
          let idx = 0
          if (_sfTotal > 0) {
            if (monster._jumpLandingTimer != null && monster._jumpLandingTimer > 0) {
              idx = _sfTotal - 1 // 落地收尾帧
            } else if (monster._jumpState) {
              const p = Math.min(1, monster._jumpState.progress)
              if (p >= 1) idx = _sfTotal - 1
              else idx = Math.min(_sfTotal - 1, 4 + Math.floor(p * 3)) // 飞跃段：第5帧起
            } else if (monster._jumpWarn) {
              const dur = monster._jumpWarnDur || 1
              const t = monster._jumpWarnTimer != null ? monster._jumpWarnTimer : 0
              const prog = 1 - Math.max(0, Math.min(dur, t)) / dur
              idx = Math.min(_sfTotal - 1, Math.floor(prog * 4)) // 起跳准备前4帧
            } else {
              idx = 0
            }
          }
          monster.animFrame = idx
          // 落地收尾计时递减与清理（对所有 jump_attack 猫怪通用；
          // 该值跳跃全程为0，落地后置0.15s，递减到0才清施法状态，避免提前回 idle）
          if (monster._jumpLandingTimer != null && monster._jumpLandingTimer > 0) {
            monster._jumpLandingTimer -= dt
            if (monster._jumpLandingTimer <= 0) {
              monster._jumpLandingTimer = 0
              monster.isCastingSkill = false
              monster.skillAnimTimer = 0
              monster._jumpPrepZone = null
            }
          }
        }
        // ★ 技能动画（优先级最高）
        else if (monster.isCastingSkill && monster.skillAnimTimer > 0 && !monster._lightCharge) {
          const enemyConfig = this._getMonsterConfig(monster.enemyId)
          const skillConf = enemyConfig?.animationConfig?.skill
          if (skillConf) {
            if (skillConf.frameList) {
              const total = skillConf.frameList.length
              const progress = 1 - (monster.skillAnimTimer / (total * (skillConf.frameDuration || 100)))
              const idx = Math.max(0, Math.min(Math.floor(progress * total), total - 1))
              monster.animFrame = idx
            } else {
              const total = skillConf.end - skillConf.start + 1
              const progress = 1 - (monster.skillAnimTimer / (total * (skillConf.frameDuration || 100)))
              const idx = Math.max(0, Math.min(Math.floor(progress * total), total - 1))
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
            // ★ 找到最近的【参战英雄】并造成伤害（而非固定 party[0]）
            //   切换控制后，怪物攻击的目标应是最近的英雄（可能不是主角）
            const mainHero = this._findNearestBattleHero(monster)
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

      // ★ 冰冻状态：怪物无法移动/行动（由英雄技能冰晶术施加）
      if (monster._frozen) {
        monster.isMoving = false
        continue
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
    return skills.map((s, i) => {
      const base = { ...s }
      return {
        // ★ 先展开原始技能对象，保留所有自定义字段（光明冲锋的 chargeTime/warnDuration/
        //   aoeRadius/stun/knockback 等均必须透传，否则专用状态机会读到 undefined 而失效）
        ...base,
        id: base.id || `${enemyId}_sk_${i}`,
        name: base.name || '技能',
        type: base.type || 'attack',
        power: base.power != null ? base.power : 1,
        cooldown: base.cooldown || 6,           // 默认 6 秒冷却
        range: base.range || 120,               // 默认 120 像素释放距离
        projectile: !!base.projectile,
        projectileSpeed: base.projectileSpeed || 220,
        effect: base.effect || null,
        value: base.value || 0,
        duration: base.duration || 3,
        dashDistance: base.dashDistance || 120,
        healAmount: base.healAmount || 0,
        summonId: base.summonId || null,
        target: base.target || 'single',
        // ★ 霸体标记：superArmor=true 表示释放期间不被打断（如 BOSS 大招）；
        //   默认 false → 非霸体技能/普攻在受到 HP 伤害时会被打断，技能放不出来。
        superArmor: !!base.superArmor,
        desc: base.desc || ''
      }
    })
  }


  /**
   * ★ 触发英雄受击动画
   * @param {Object} hero - 英雄数据（party/follower 中的对象，含 id）
   * @param {boolean} isKnockback - true=被击飞(hurt_02) / false=普通受击(hurt_01)
   */
  _triggerHeroHurt(hero, isKnockback) {
    if (!hero) return
    // ★ 霸体(superArmor)：释放霸体技能（剑气风暴等）期间不受击硬直、不切受击动画，
    //   保证连续突刺等动画不被怪物攻击打断（伤害仍正常结算，只是不被打断动作）。
    // ★ 改用 combat-state 单一真相源判断霸体（superArmor）
    if (isHeroSuperArmor({ hero })) return
    let sprite = null
    if (this.mainCharacterSprite && this.mainCharacter && hero.id === this.mainCharacter.id) {
      sprite = this.mainCharacterSprite
    } else if (this.followers && this.followers.length) {
      const f = this.followers.find(ff => ff.character && ff.character.id === hero.id)
      if (f) sprite = f.sprite
    }
    if (!sprite) return
    sprite.state = 'hurt'
    sprite._hurtVariant = isKnockback ? 2 : 1
    sprite.animFrame = 0
    sprite._hurtTimer = isKnockback ? 0.5 : 0.28
    // ★ 受击硬直：被击中的瞬间角色完全无法行动（不能移动/攻击/放技能），
    //   时长与受击动画对齐（普通0.28s / 被击飞0.5s）。由 _updateHeroStatus 每帧递减。
    hero._hurtLock = isKnockback ? 0.5 : 0.28
  }

  // ★ 我方 AI 英雄施法被打断：当前正在释放技能/普攻且非霸体时，清除施法状态
  //   使技能放不出来（动画中止）。霸体技能（superArmor）不受影响。


  /**
   * ★【非运行路径 / 死代码】单体怪物战斗 AI：走位 + 技能 + 普攻
   * ⚠️ 警告：野外实时战斗实际运行的是 field-battle-system.js 的 mixin 版本
   *   （_updateMonsterAttack → _fieldMonsterCombatMove / _fieldChooseMonsterSkill / _fieldCastMonsterSkill）。
   *   本方法从未被任何调用方触发（mixin 已覆盖怪物 AI）。请勿在此修改战斗逻辑，
   *   否则改动不会生效且会误导后续维护。要改怪物 AI，去 field-battle-system.js。
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
    // ★ 带滞回：甜区上界放宽到 attackRange*1.15，下界放宽到 attackRange*0.6，
    //   避免 strafe 小幅推离攻击范围后即触发"猛冲靠近"造成边界振荡/抖动。
    const farThreshold = attackRange * 1.15
    const nearThreshold = attackRange * 0.6
    const nx = dist > 1 ? dx / dist : 0
    const ny = dist > 1 ? dy / dist : 0
    // ★ strafe 方向改用「固定世界方向角」strafeAngle（怪物进场时随机、翻转时 +PI），
    //   不再基于「指向玩家向量旋转 90°」的 px/py。否则当怪物与玩家同 Y 轴/同 X 轴时，
    //   相对角度快速翻转会让 strafe 方向每帧抖动，表现为左右抽风。
    if (monster.strafeAngle == null) monster.strafeAngle = Math.random() * Math.PI * 2
    const sx = Math.cos(monster.strafeAngle)
    const sy = Math.sin(monster.strafeAngle)

    // 周期性切换走位方向，模拟包抄/绕圈（低频，避免频繁翻转造成抖动）
    monster.strafeTimer -= dt
    if (monster.strafeTimer <= 0) {
      monster.strafeTimer = 1.2 + Math.random() * 1.5
      if (Math.random() < 0.4) {
        monster.strafeDir *= -1
        monster.strafeAngle += Math.PI   // ★ 翻转时直接旋转世界角，方向整体反转
      }
    }

    let vx = 0, vy = 0
    const spd = monster.moveSpeed || 60
    if (dist > farThreshold) {
      // 太远：靠近（带一点横向偏移，避免直线愣头青）
      vx += nx * spd * 2.2
      vy += ny * spd * 2.2
      vx += sx * spd * 0.6
      vy += sy * spd * 0.6
    } else if (dist < nearThreshold) {
      // 太近：后撤并横向绕，避免粘身
      vx -= nx * spd * 1.8
      vy -= ny * spd * 1.8
      vx += sx * spd * 1.0
      vy += sy * spd * 1.0
    } else {
      // 在攻击甜区内：仅做低速横向绕圈（包抄），完全不加径向分量。
      // ★ 之前这里在 dist>0.95*attackRange 时补向心，导致 strafe 把怪物推到攻击范围上沿后
      //   反复"补向心推近→strafe推远→再补向心"，在边界自激振荡（典型表现为同Y轴时左右抖动）。
      //   现在进入甜区后彻底停径向力，只绕圈；退出甜区由"太远/太近"分支负责拉回。
      vx += sx * spd * 0.7
      vy += sy * spd * 0.7
    }

    // ★ 速度平滑（lerp）：避免每帧速度突变造成左右摇摆/抽风。
    //   用固定收敛速率（与帧率无关），避免 0.0001^dt 在 dt 波动时系数不稳。
    if (monster._vx == null) { monster._vx = 0; monster._vy = 0 }
    const lerp = Math.min(1, dt * 6)
    monster._vx += (vx - monster._vx) * lerp
    monster._vy += (vy - monster._vy) * lerp

    monster.x += monster._vx * dt
    monster.y += monster._vy * dt
    monster.isMoving = (Math.abs(monster._vx) + Math.abs(monster._vy)) > 0.01

    // ★ 地形碰撞 + 绕行：怪物同样受障碍（树/石/森林）阻挡，不能穿墙。
    //   用 moveWithSlide 分轴滑动避障；若完全被挡死（滑动后位置没动）则累计卡住帧，
    //   长时间卡死则主动改变绕行方向 + 加一个侧向脱离冲量，从别的方向绕开障碍物，
    //   而不是原地死卡。
    if (this._collisionEngine) {
      const slid = this._collisionEngine.moveWithSlide(monster.x - monster._vx * dt, monster.y - monster._vy * dt, monster.x, monster.y)
      monster.x = slid.x
      monster.y = slid.y
      if (slid.x === monster.x - monster._vx * dt && slid.y === monster.y - monster._vy * dt) {
        monster._stuckFrames = (monster._stuckFrames || 0) + 1
        if (monster._stuckFrames > 30) {
          // ★ 卡死超过约0.5s：翻转绕圈方向 + 给一个垂直当前朝向的侧向冲量，绕开障碍
          monster.strafeAngle = (monster.strafeAngle || 0) + Math.PI + (Math.random() - 0.5) * 1.2
          const perpX = Math.cos(monster.strafeAngle)
          const perpY = Math.sin(monster.strafeAngle)
          const burst = (monster.moveSpeed || 60) * 1.5
          monster._vx += perpX * burst
          monster._vy += perpY * burst
          monster._stuckFrames = 0
        }
      } else {
        monster._stuckFrames = 0
      }
    }

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
   * ★【非运行路径 / 死代码】怪物施放技能（同 _updateSingleMonsterCombat，已被
   *   field-battle-system.js 的 _fieldCastMonsterSkill 取代，请勿在此修改）。
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
      const dmg = Math.max(1, Math.floor(monster.atk * (mult || skill.power || 1) - this._getHeroDef(hero) * 0.3))
      // ★ 护盾优先吸收
      const res = this._applyHeroDamage(hero, dmg)
      if (res.absorbed > 0) {
        this.battleSystem.damageTexts.push({ text: `🛡-${res.absorbed}`, x: this.playerX - this.cameraX, y: this.playerY - this.cameraY - 70 * this.dpr, color: '#ffffff', life: 1.0 })
      }
      if (res.hpDamage > 0) {
        this.battleSystem.damageTexts.push({
          text: `-${res.hpDamage}`,
          x: this.playerX - this.cameraX,
          y: this.playerY - this.cameraY - 40 * this.dpr,
          color: '#ff4757',
          life: 1.0
        })
      }
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
   * ★【非运行路径 / 死代码】生成怪物远程抛射物（已被 field-battle-system.js 的
   *   _fieldSpawnMonsterProjectile 取代，请勿在此修改）。
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
    // ★ 副本模式：不刷新怪物，保证可通关（击败全部即胜利）
    if (this.areaInfo && this.areaInfo.isDungeon) return
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
          strafeAngle: Math.random() * Math.PI * 2, // ★ 固定世界方向角，避免 strafe 随相对位置抖动
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
  /**
   * ★ 英雄状态更新：击飞（视觉弧线位移，不改变逻辑世界坐标）+ 眩晕倒计时
   *   击飞仅做渲染偏移，避免与控制/跟随系统抢世界坐标；落地后转入眩晕。
   */
  _updateHeroStatus(dt) {
    const heroes = (this.battleSystem && this.battleSystem.battleHeroes) || []
    for (const bh of heroes) {
      const hero = bh.hero
      if (!hero) continue
      if (hero._knockback) {
        const kb = hero._knockback
        kb.t += dt
        const p = Math.min(1, kb.t / kb.dur)
        const arc = Math.sin(Math.PI * p)
        hero._kbOffsetX = (kb.toX - kb.fromX) * p
        hero._kbOffsetY = (kb.toY - kb.fromY) * p - arc * kb.height
        if (p >= 1) {
          hero._knockback = null
          hero._kbOffsetX = 0
          hero._kbOffsetY = 0
          hero._stunned = (hero._stunned || 0) + (kb.stunAfter || 0)
        }
      }
      if (hero._stunned && hero._stunned > 0) {
        hero._stunned = Math.max(0, hero._stunned - dt)
      }
      // ★ 受击硬直倒计时（被击中后短暂无法行动）
      if (hero._hurtLock && hero._hurtLock > 0) {
        hero._hurtLock = Math.max(0, hero._hurtLock - dt)
      }
    }
  }

  _updateFollowers(dt) {
    // ★ 记录主角位置历史（每3帧记录一次，避免太密集）
    //   —— 必须在最前、无条件执行：主角(臻宝)AI 跟随直接依赖 playerHistory。
    //      原代码把这段放在「followers 为空就直接 return」之后，导致「无任何跟随队友时」
    //      主角块被早返回跳过、臻宝无法跟随。真实游戏里 followers 恒含李小宝+猫咪不会触发，
    //      但架构上主角跟随不应耦合到无关的 followers 数组，故解耦。
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
    // ★ 仅当存在跟随队友才执行本循环；无队友时跳过，但下面的「主角块」仍必须运行
    if (this.followers && Array.isArray(this.followers)) {
      for (let i = 0; i < this.followers.length; i++) {
      const follower = this.followers[i]

      // ★ 战斗中阵亡的队友不再移动/站位（死亡消失）
      if (this.battleSystem && this.battleSystem.active && follower.character && follower.character.hp <= 0) {
        follower.isMoving = false
        continue
      }

      // ★ 当前被玩家控制的英雄（battleHeroes[0]）不再走 AI 站位/跟随逻辑，
      //   否则会把被控角色强行拽回输出位，导致切换控制"看起来没反应"
      const ctrlHero = (this.battleSystem && this.battleSystem.battleHeroes &&
                        this.battleSystem.battleHeroes[0]) || null
      // ★ 修复：用引用相等判定被控角色（切换控制后 battleHeroes 与 followers 已同步重排，
      //   原 partyIndex === i+1 的写法恒为 false，导致被控角色从未被跳过、被 AI 逻辑抢控）
      const isControlled = ctrlHero && ctrlHero.followerRef && follower === ctrlHero.followerRef
      if (this.battleSystem && this.battleSystem.active && isControlled) {
        // 被控角色：坐标由摇杆/切换逻辑维护，这里只同步到 follower 供渲染，不做 AI 移动
        follower.x = this._heroWorldPos[i + 1] ? this._heroWorldPos[i + 1].x : follower.x
        follower.y = this._heroWorldPos[i + 1] ? this._heroWorldPos[i + 1].y : follower.y
        follower.isMoving = this.isMoving
        follower.facingLeft = this.facingLeft
        if (follower.sprite) {
          follower.sprite.update(dt, follower.isMoving, follower.facingLeft)
        }
        continue
      }

      // ★ 队友独立行动：战斗中 or 非战斗(未召回) 都自己找最近的怪物，走到输出位站桩，不跟随主角
      let targetPos = null
      let isCombatPos = false
      const inCombat = this.battleSystem && this.battleSystem.active
      const allyAutoHunt = !this.aiRecall   // 未召回时，队友自行寻怪战斗
      // ★ 召回模式：跟随主角为主，仅当主角附近有怪时才去攻击（否则贴着主角）
      if (this.aiRecall) {
        const recallRange = 200 * this.dpr
        const nearMon = this._findNearestMapMonster(this.playerX, this.playerY, recallRange)
        if (nearMon) {
          targetPos = this._getAllyCombatTarget(follower, i) || { x: nearMon.x, y: nearMon.y, facingLeft: nearMon.x < this.playerX }
          isCombatPos = true
        }
        // 无附近怪 → targetPos 保持 null → 走下方召回分支跟随主角
      } else if (inCombat || allyAutoHunt) {
        targetPos = this._getAllyCombatTarget(follower, i)
        isCombatPos = !!targetPos
      }

      // ★ 非战斗 + 附近有怪物且队友已接近 → 队友主动开战（召回时也允许，附近有怪就打）
      if (!inCombat && targetPos) {
        const nearMon = this._findNearestMapMonster(follower.x, follower.y, 80 * this.dpr)
        if (nearMon) {
          this._startFieldBattle(nearMon)
        }
      }

      if (!targetPos) {
        if (this.aiRecall) {
          // ★ 召回模式：队友立即回到主角身边（紧随主角移动轨迹）
          const historyIndex = Math.min((i + 1) * 10, this.playerHistory.length - 1)
          if (historyIndex >= 0 && this.playerHistory.length > 0) {
            targetPos = this.playerHistory[historyIndex]
          }
        } else {
          // 非战斗且附近无怪：原地待命（不跟随主角），等待怪物出现
          // 让队友停在当前位置，避免一直跟随主角
          follower.isMoving = false
          follower._effectiveMoving = false
          if (follower.sprite && typeof follower.sprite.update === 'function') {
            follower.sprite.update(dt, false, follower.facingLeft)
          }
          continue
        }
      }

      if (targetPos) {
        // 平滑移动到目标位置
        const dx = targetPos.x - follower.x
        const dy = targetPos.y - follower.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        // 战斗中到位阈值放宽，避免在输出位上反复微调抖动
        const arriveDist = isCombatPos ? 16 * this.dpr : 10 * this.dpr

        // 如果距离大于阈值，移动队友
        // 降低速度，避免追上主角
        if (dist > arriveDist) {
          const speed = this.playerSpeed * 0.95
          const moveX = (dx / dist) * speed * dt
          const moveY = (dy / dist) * speed * dt

          // ★ 与被控角色一致的施法移动限制：
          //   _castLock > 0：BUFF 释放期间完全锁定移动（不能移动）
          //   _castAxisLock > 0：普攻/伤害技能施法期间限制 Y 轴（只能 X 轴移动）
          const oldX = follower.x
          const oldY = follower.y
          // ★ 统一移动锁收口到 combat-state.getHeroMoveLock（随从/AI 共享同一判断逻辑）
          const _fLock = getHeroMoveLock({ hero: follower })
          if (!_fLock.full) {
            if (_fLock.axisY) {
              // 仅 X 轴移动
              follower.x += moveX
            } else {
              follower.x += moveX
              follower.y += moveY
            }
          }
          // ★ 地形碰撞：与被控角色一致，AI 同样受地形障碍（树/石/森林）阻挡，不能穿墙。
          //   ★ 用 moveWithSlide 做分轴滑动避障（完整→仅X→仅Y→回退），
          //     不再原地点死卡住；若完全回退则累计卡住帧，长时间卡住则放弃当前锁定站位，
          //     下一帧重新规划路线（绕开障碍物），表现更聪明。
          if (this._collisionEngine) {
            const slid = this._collisionEngine.moveWithSlide(oldX, oldY, follower.x, follower.y)
            follower.x = slid.x
            follower.y = slid.y
            // ★ 卡住检测：完全回退（位置没动）才累计，分轴滑动成功不算卡
            if (slid.x === oldX && slid.y === oldY) {
              follower._stuckFrames = (follower._stuckFrames || 0) + 1
              if (follower._stuckFrames > 45) {  // 约 0.75s 卡死 → 放弃当前站位点，重新寻路
                follower._lockedStand = null
                follower._aiTargetId = null
                follower._stuckFrames = 0
              }
            } else {
              follower._stuckFrames = 0
            }
          }
          follower.facingLeft = targetPos.facingLeft
          follower.isMoving = true
        } else if (isCombatPos) {
          // ★ 战斗站位：到位即停，朝向怪物，不受主角移动状态影响
          follower.facingLeft = targetPos.facingLeft
          const wasMoving = follower.isMoving
          follower.isMoving = false
          if (wasMoving) {
            follower.animFrame = 0
            follower.animTimer = 0
          }
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
      
      // ★ 智能规避：躲预警区/投射物/残血风筝/远程kite/避免扎堆（与 _updateAllyAI 共用 _computeAllyAvoidance）
      if (this.battleSystem && this.battleSystem.active) {
        const fLock = getHeroMoveLock({ hero: follower })
        if (!fLock.full) {
          const fAllies = []
          for (const o of this.followers) {
            if (o === follower) continue
            if (!o.character || o.character.hp <= 0) continue
            fAllies.push({ x: o.x, y: o.y })
          }
          const fav = this._computeAllyAvoidance(follower.x, follower.y, follower.character, this.battleSystem, fAllies, this.dpr)
          let fx = fav.ex * 1.6 + fav.mx * 0.5
          let fy = fav.ey * 1.6 + fav.my * 0.5
          if (fLock.axisY) fy = 0
          if (fx !== 0 || fy !== 0) {
            follower.x += fx * dt
            follower.y += fy * dt
            if (Math.hypot(fx, fy) > 1) follower.isMoving = true
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
    } // ← 结束「存在跟随队友」的 if 守卫；下面的主角块无条件运行（解耦 followers）

    // ★ 当控制的不是主角时，主角作为"独立AI单位"也去怪物附近站位输出（不再贴被控者身上）
    //   —— 与队友统一使用 _getAllyCombatTarget，保持一致的战斗站位行为
    if (this._heroWorldPos && this.battleSystem && this.battleSystem.battleHeroes &&
        this.battleSystem.battleHeroes[0]) {
      const ctrl = this.battleSystem.battleHeroes[0]
      const px = this._heroWorldPos[0]
      if (ctrl.partyIndex !== 0 && px) {
        const inCombat = this.battleSystem.active
        // ★ 召回模式(或非战斗)：主角(臻宝)跟随被控角色；只有"解散"模式(战斗)才去打怪
        //   —— 原战斗分支直接调 _getAllyCombatTarget 让主角跑去怪物站位点，覆盖跟随，
        //      表现为"召回后不跟随角色"。
        const followPlayer = !inCombat || this.aiRecall
        if (followPlayer) {
          // ★ 跟随：与 followers 召回完全一致——跟随玩家轨迹历史点（落在身后固定距离），
          //   而非「当前玩家坐标」。用当前坐标会让 AI 在玩家附近反复横跳(振荡)且越落越远；
          //   历史点法使臻宝稳定 trailing 在玩家身后、保持编队。速度 0.95x 与 followers 一致。
          //   近身怪的攻击仍由 _updateAllyAI 统一负责，跟随与攻击不冲突。
          if (this.playerHistory.length > 0) {
            const histIdx = Math.min(10, this.playerHistory.length - 1)
            const hp = this.playerHistory[histIdx]
            const dx = hp.x - px.x
            const dy = hp.y - px.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            const arrive = 16 * this.dpr
            if (dist > arrive) {
              const speed = this.playerSpeed * 0.95
              const oldX = px.x
              const oldY = px.y  // 注意：此处 oldY 仅用于碰撞回退判定，下面统一用 dx/dy
              const ux = dx / dist, uy = dy / dist
              if (px._noclipFrames > 0) {
                // ★ 兜底穿透：长时间卡死时直接朝目标移动(忽略碰撞)，确保绝不永久冻结
                px.x += ux * speed * dt
                px.y += uy * speed * dt
                px._noclipFrames--
              } else {
                // ★ 正常跟随：朝历史轨迹点（身后固定距离）移动
                px.x += ux * speed * dt
                px.y += uy * speed * dt
                // ★ 地形碰撞：用 moveWithSlide 滑动避障（与队友一致）
                if (this._collisionEngine) {
                  const slid = this._collisionEngine.moveWithSlide(oldX, oldY, px.x, px.y)
                  px.x = slid.x
                  px.y = slid.y
                }
                // ★ 卡住检测：用「是否更靠近目标」判定，而非简单的坐标相等——
                //   否则 moveWithSlide 的 Y 轴滑动或目标 y 的微差会让 blocked 误判为 false，
                //   导致绕障逻辑每帧自取消、永远脱困不了。
                const followBlocked = (Math.hypot(hp.x - px.x, hp.y - px.y) >= dist - 0.5)
                if (followBlocked) {
                  px._stuckFrames = (px._stuckFrames || 0) + 1
                } else {
                  px._stuckFrames = 0
                  px._detourFrames = 0
                }
                if (px._stuckFrames > 18 && !px._detourFrames) {
                  px._detourFrames = 50
                  // 选更通畅的垂直方向：检测 (dx,dy) 的左右法线方向是否可走
                  const pdx = -dy / dist, pdy = dx / dist
                  const r = 16 * this.dpr, fy = 36 * this.dpr
                  const freeA = this._collisionEngine
                    ? !this._collisionEngine.checkStaticCollision(oldX + pdx * speed * dt * 12, oldY + pdy * speed * dt * 12, { radius: r, footOffsetY: fy })
                    : true
                  const freeB = this._collisionEngine
                    ? !this._collisionEngine.checkStaticCollision(oldX - pdx * speed * dt * 12, oldY - pdy * speed * dt * 12, { radius: r, footOffsetY: fy })
                    : true
                  px._detourSign = (freeA && !freeB) ? 1 : (freeB ? -1 : (px._detourSign === 1 ? -1 : 1))
                }
                if (px._detourFrames > 0) {
                  const dOldX = px.x, dOldY = px.y
                  const pdx = -dy / dist, pdy = dx / dist
                  px.x += pdx * px._detourSign * speed * dt
                  px.y += pdy * px._detourSign * speed * dt
                  if (this._collisionEngine) {
                    const s2 = this._collisionEngine.moveWithSlide(dOldX, dOldY, px.x, px.y)
                    px.x = s2.x
                    px.y = s2.y
                  }
                  px._detourFrames--
                }
                // ★ 长时间(>120帧≈2s)仍卡死(如障碍簇)：进入兜底穿透模式，循环几次必能脱困
                if (px._stuckFrames > 120) {
                  px._noclipFrames = 40
                  px._stuckFrames = 0
                  px._detourFrames = 0
                }
              }
              this.mainCharacterSprite.facingLeft = dx < 0
              this.mainCharacterSprite.isMoving = true
            } else {
              this.mainCharacterSprite.facingLeft = dx < 0
              this.mainCharacterSprite.isMoving = false
            }
          } else {
            this.mainCharacterSprite.isMoving = false
          }
        } else {
          // 解散(战斗)：主角去怪物附近站位输出（复用队友站位逻辑，i=-1 表示主角侧）
          const targetPos = this._getAllyCombatTarget(px, -1)
          px._aiTargetId = targetPos ? targetPos._targetId : null

          // ★ 无怪可打时：回到被控者身边待命（保持队伍），不四处乱跑
          let moveTarget = targetPos
          if (!moveTarget) {
            const histIdx = Math.min(10, this.playerHistory.length - 1)
            const hp0 = this.playerHistory.length > 0 ? this.playerHistory[histIdx] : null
            if (hp0) {
              moveTarget = { x: hp0.x, y: hp0.y, facingLeft: this.facingLeft }
            }
          }

          if (moveTarget) {
            const dx = moveTarget.x - px.x
            const dy = moveTarget.y - px.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > 16 * this.dpr) {
              const speed = this.playerSpeed * 0.95
              const moveX = (dx / dist) * speed * dt
              const moveY = (dy / dist) * speed * dt
              const oldX = px.x
              const oldY = px.y
              // ★ 统一移动锁收口到 combat-state.getHeroMoveLock
              const _pLock = getHeroMoveLock({ hero: px })
              if (!_pLock.full) {
                if (_pLock.axisY) {
                  px.x += moveX   // 仅 X 轴
                } else {
                  px.x += moveX
                  px.y += moveY
                }
              }
              if (this._collisionEngine) {
                const slid = this._collisionEngine.moveWithSlide(oldX, oldY, px.x, px.y)
                px.x = slid.x
                px.y = slid.y
                if (slid.x === oldX && slid.y === oldY) {
                  px._stuckFrames = (px._stuckFrames || 0) + 1
                  if (px._stuckFrames > 45) {
                    px._lockedStand = null
                    px._aiTargetId = null
                    px._stuckFrames = 0
                  }
                } else {
                  px._stuckFrames = 0
                }
              }
              this.mainCharacterSprite.facingLeft = moveTarget.facingLeft
              this.mainCharacterSprite.isMoving = true
            } else {
              this.mainCharacterSprite.facingLeft = moveTarget.facingLeft
              this.mainCharacterSprite.isMoving = false
            }
          } else {
            this.mainCharacterSprite.isMoving = false
          }
        }
        if (this.mainCharacterSprite) {
          this.mainCharacterSprite.update(dt, this.mainCharacterSprite.isMoving, this.mainCharacterSprite.facingLeft)
        }
      }
    }
  }

  /**
   * ★ 查找离某怪物最近的【存活参战英雄】（用于怪物攻击动画命中结算）
   * 注意：必须用 battleHeroes（含切换后的被控者），而非固定 party[0]
   * @param {Object} monster 怪物
   * @returns {Object|null} 英雄对象（.hp/.def 等），无存活英雄返回 null
   */
  _findNearestBattleHero(monster) {
    const heroes = (this.battleSystem && this.battleSystem.battleHeroes) || []
    // ★ 挑衅(taunt)：命中帧强制锁定正在挑衅的英雄
    if (typeof this._fieldGetTauntHero === 'function') {
      const tauntHero = this._fieldGetTauntHero()
      if (tauntHero) return tauntHero
    }
    let best = null
    let bestD = Infinity
    for (const bh of heroes) {
      if (!bh.hero || bh.hero.hp <= 0) continue
      const p = (typeof bh.getPos === 'function') ? bh.getPos() : null
      if (!p) continue
      const d = (p.x - monster.x) ** 2 + (p.y - monster.y) ** 2
      if (d < bestD) { bestD = d; best = bh.hero }
    }
    return best
  }

  /**
   * 战斗中队友的独立站位目标
   * 队友不跟随主角，而是自己锁定最近的怪物，走到怪物侧边的输出位站桩输出
   * @param {number} x 搜索中心 X
   * @param {number} y 搜索中心 Y
   * @param {number} range 搜索半径
   * @returns {Object|null} 最近的地图怪物；无则返回 null
   */
  _findNearestMapMonster(x, y, range) {
    const monsters = this.mapMonsters
    if (!monsters || !monsters.length) return null
    let best = null
    let bestD = range * range
    for (const m of monsters) {
      // 跳过已死亡/正在离场的怪物
      if (m.dead || m.removed || (m.hp !== undefined && m.hp <= 0)) continue
      const dx = m.x - x
      const dy = m.y - y
      const d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; best = m }
    }
    return best
  }

  /**
   * ★ 获取队友战斗目标站位：队友独立行动，自己找最近的怪物，走到怪物附近的输出位站桩
   * @param {Object} follower 队友对象
   * @param {number} i 队友索引（用于左右错开，避免多个队友重叠）
   * @returns {{x:number,y:number,facingLeft:boolean}|null} 目标站位；无怪物时返回 null（回退为跟随主角）
   */
  _getAllyCombatTarget(follower, i) {
    const monsters = this.mapMonsters
    if (!monsters || !monsters.length) return null

    // 0) ★ 优先集火玩家当前锁定的目标（battleTarget）：确保 AI 与玩家打同一只怪，
    //    使队友施加的灼烧/冰冻/感电等状态都汇聚到面板上显示的那只怪身上
    let target = null
    const playerTarget = this.battleSystem && this.battleSystem.battleTarget
    if (playerTarget && playerTarget.alive) {
      target = playerTarget
      follower._aiTargetId = playerTarget.id
    }

    // 1) 否则沿用自己已锁定的怪物（仍存活则继续输出，避免每帧切目标导致来回横跳）
    if (!target && follower._aiTargetId != null) {
      for (const m of monsters) {
        if (m.alive && m.id === follower._aiTargetId) { target = m; break }
      }
    }

    // 2) 未锁定 / 目标已死：找离自己最近的存活怪物
    if (!target) {
      let minDist = Infinity
      for (const m of monsters) {
        if (!m.alive) continue
        const dx = m.x - follower.x
        const dy = m.y - follower.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < minDist) { minDist = d; target = m }
      }
      // ★ 全图寻怪：取消参战半径限制，队友会去找地图上最近的任何怪物
      follower._aiTargetId = target ? target.id : null
    }

    if (!target) {
      follower._aiTargetId = null
      follower._lockedStand = null
      return null   // 附近无怪物 → 回退跟随主角
    }

    // ★ 目标位移检测（修复"AI 攻击某单位，该单位跳跃攻击另一个角色后 AI 傻在原地"）：
    //   怪物用 jump_attack 等位移技能大幅移动后，原本锁定的站位点(_lockedStand)已远离怪物，
    //   若仍站旧点就会导致 AI 走到空位发呆。按位移幅度处理：
    //     - 位移 > 200*dpr：视为目标已远离（跳去打别人），放弃旧目标，改选最近存活怪物；
    //     - 位移 > 90*dpr ：仅放弃旧站位点，重新规划靠近当前目标的输出位。
    if (target && follower._lockedStand && follower._lockedStand._targetId === target.id) {
      const lx = follower._lockedStand.x, ly = follower._lockedStand.y
      const movedDist = Math.hypot(target.x - lx, target.y - ly)
      if (movedDist > 200 * this.dpr) {
        let minDist = Infinity, nearest = null
        for (const m of monsters) {
          if (!m.alive) continue
          const dd = Math.hypot(m.x - follower.x, m.y - follower.y)
          if (dd < minDist) { minDist = dd; nearest = m }
        }
        target = nearest
        follower._aiTargetId = target ? target.id : null
        follower._lockedStand = null
      } else if (movedDist > 90 * this.dpr) {
        follower._lockedStand = null
      }
    }
    if (!target) {
      follower._aiTargetId = null
      follower._lockedStand = null
      return null
    }

    // 3) 计算输出位：★ AI 站位点锁定，不再每帧跟随怪物实时坐标漂移，
    //    实现"AI 与怪物完全互不干扰、可自由穿插"（怪物走位不会再带动/推开 AI）。
    //    - 首次选定目标时，基于怪物当前位置算一个固定偏移站位点并存起来；
    //    - 之后怪物怎么移动，AI 都站定在自己锁定的点，不再被怪物"带跑/推开"。
    const attackDist = ((this.battleSystem && this.battleSystem.attackRange) || 100) * this.dpr * 0.75
    // 队友从自己当前所在的一侧接近怪物（谁在左就站左边），减少绕路
    const side0 = (follower.x <= target.x) ? -1 : 1
    // 索引错开，避免多个队友挤在同一个点（i=-1 表示主角，放最外侧）
    const idx = Math.max(0, i)
    const yOffset0 = ((i % 2 === 0) ? 1 : -1) * (18 + idx * 10) * this.dpr

    // ★ 站位点避障：若算出的输出位落在障碍物内（墙/树/石），尝试翻转 side、调整 yOffset，
    //   选一个可达的站位点，避免 AI 一头撞进障碍里反复卡死。
    //   注意 checkStaticCollision 用物理像素（带 footOffset），与运行时移动一致。
    const tryStand = (side, yOff) => {
      const x = target.x + side * attackDist
      const y = target.y + yOff
      if (this._collisionEngine && this._collisionEngine.checkStaticCollision(x, y)) return null
      return { x, y }
    }
    let stand = null
    if (!follower._lockedStand || follower._lockedStand._targetId !== target.id) {
      // 候选优先级：原 side/原 yOffset → 翻转 side → 不同 yOffset → 反向 yOffset
      const candidates = [
        [side0, yOffset0],
        [-side0, yOffset0],
        [side0, yOffset0 + 40 * this.dpr],
        [side0, yOffset0 - 40 * this.dpr],
        [-side0, yOffset0 + 40 * this.dpr],
        [-side0, yOffset0 - 40 * this.dpr],
      ]
      for (const [s, y] of candidates) {
        const r = tryStand(s, y)
        if (r) { stand = r; break }
      }
      if (!stand) stand = { x: target.x + side0 * attackDist, y: target.y + yOffset0 }  // 都挡也至少给一个
      follower._lockedStand = { x: stand.x, y: stand.y, _targetId: target.id }
    }

    return {
      x: follower._lockedStand.x,
      y: follower._lockedStand.y,
      facingLeft: (target.x < follower.x),
      _targetId: target.id
    }
  }

  /**
   * ★ 召回：立即把所有队友瞬移到被控角色（当前操作角色）周围，不再缓慢走回
   */
  _recallAlliesToPlayer() {
    if (!this.followers || !this.followers.length) return
    // 被控角色的世界坐标（战斗中 battleHeroes[0]，非战斗用主角）
    let cx = this.playerX
    let cy = this.playerY
    const ctrlHero = (this.battleSystem && this.battleSystem.battleHeroes &&
                      this.battleSystem.battleHeroes[0]) || null
    if (ctrlHero && this._heroWorldPos && this._heroWorldPos[ctrlHero.partyIndex]) {
      cx = this._heroWorldPos[ctrlHero.partyIndex].x
      cy = this._heroWorldPos[ctrlHero.partyIndex].y
    }
    const radius = 55 * this.dpr
    // ★ 关键修复（任务7-A）：召回只作用于「非被控成员」，被控角色由玩家摇杆操控，
    //   不能被瞬移到环绕圈上、否则切换控制权后玩家操作的角色会被强行拉走，
    //   表现为"切换后召回/解散失效"。用引用相等跳过被控角色（followerRef 与 followers 同引用）。
    let nonCtrlCount = 0
    for (let i = 0; i < this.followers.length; i++) {
      const follower = this.followers[i]
      if (ctrlHero && ctrlHero.followerRef && follower === ctrlHero.followerRef) continue
      const angle = (Math.PI * 2 * nonCtrlCount) / Math.max(1, this.followers.length - 1)
      follower.x = cx + Math.cos(angle) * radius
      follower.y = cy + Math.sin(angle) * radius
      follower.facingLeft = cx < follower.x
      follower.isMoving = false
      follower._aiTargetId = null
      if (follower.sprite && typeof follower.sprite.update === 'function') {
        follower.sprite.update(0, false, follower.facingLeft)
      }
      nonCtrlCount++
    }
    // ★ 召回同时覆盖「非 followers 的人类英雄」：切换控制后，原主角(如臻宝)变为 AI 队友，
    //   它不在 this.followers 里，上面循环不会动它 → 召回对它无效。这里把这类英雄也瞬移到
    //   被控角色周围，使"切换后召回/解散"对原主角同样生效。followers 成员已由上方循环处理，跳过避免重复瞬移。
    const heroes = this.battleSystem && this.battleSystem.battleHeroes
    if (heroes && heroes.length) {
      for (const bh of heroes) {
        if (!bh || bh === ctrlHero) continue
        if (bh.followerRef && this.followers && this.followers.indexOf(bh.followerRef) !== -1) continue
        const p = bh.getPos ? bh.getPos() : null
        if (!p) continue
        const angle = (Math.PI * 2 * nonCtrlCount) / Math.max(1, heroes.length - 1)
        p.x = cx + Math.cos(angle) * radius
        p.y = cy + Math.sin(angle) * radius
        if (bh.hero) bh.hero._aiTargetId = null
        if (bh.sprite) {
          bh.sprite.facingLeft = cx < p.x
          bh.sprite.isMoving = false
        }
        nonCtrlCount++
      }
    }
    console.log('[Field] 已召回非被控队友到被控角色周围（被控角色保持操控原位）')
  }

  /**
   * 在被控角色脚下绘制高亮指示圈（脉冲动画），让玩家一眼看出当前控制的是谁
   */
  _renderControlIndicator(ctx, screenX, screenY) {
    const t = Date.now() / 1000 * 4
    const pulse = 0.5 + 0.5 * Math.sin(t)
    const r = (24 + pulse * 4) * this.dpr
    ctx.save()
    ctx.strokeStyle = `rgba(74, 158, 255, ${0.6 + pulse * 0.4})`
    ctx.lineWidth = 3 * this.dpr
    ctx.translate(screenX, screenY + 30 * this.dpr)
    ctx.scale(1, 0.4)
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  /**
   * ★ 渲染英雄 BUFF 光环粒子（持续期间效果）
   *   - 脚下光环（按 buff 类型配色，多层叠加）
   *   - 上升粒子光点（体现"生效中"）
   *   - 剩余时间数字（剩余 >0.5s 时显示）
   *   - 即将消失（<1s）闪烁提示
   * @param {Object} ctx 画布上下文
   * @param {number} screenX 角色屏幕X
   * @param {number} screenY 角色屏幕Y
   * @param {Object} hero 英雄对象（含 _buffs）
   */
  _renderHeroBuffAura(ctx, screenX, screenY, hero) {
    if (!hero || !hero._buffs || !this.battleSystem) return
    const active = hero._buffs.filter(b => b._active && b._remaining > 0)
    if (active.length === 0) return
    const t = Date.now() / 1000
    const dpr = this.dpr
    ctx.save()
    // 椭圆绘制（兼容微信小游戏：不用 ctx.ellipse）
    const drawOval = (cx, cy, rx, ry) => {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1, ry / (rx || 1))
      ctx.beginPath()
      ctx.arc(0, 0, rx, 0, Math.PI * 2)
      ctx.restore()
    }
    active.forEach((b, i) => {
      const colorBase = b._color || 'rgba(200,200,255,'
      const baseR = (32 + i * 10) * dpr
      const warn = b._remaining <= 1.5
      const flicker = b._remaining <= 1.0
      // 呼吸/闪烁 alpha
      let alpha
      if (flicker) {
        alpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 10))
      } else {
        alpha = 0.65 + 0.35 * Math.sin(t * 2.5 + i)
      }
      const orbitR = baseR + 6 * Math.sin(t * 1.8 + i)
      // ★ 三层光圈（从外到内逐渐变亮）
      // 外光晕（大、淡）
      ctx.strokeStyle = colorBase + (alpha * 0.2) + ')'
      ctx.lineWidth = 6 * dpr
      drawOval(screenX, screenY + 32 * dpr, orbitR + 14 * dpr, (orbitR + 14 * dpr) * 0.32)
      ctx.stroke()
      // 中圈
      ctx.strokeStyle = colorBase + (alpha * 0.5) + ')'
      ctx.lineWidth = 4 * dpr
      drawOval(screenX, screenY + 32 * dpr, orbitR + 6 * dpr, (orbitR + 6 * dpr) * 0.32)
      ctx.stroke()
      // 内圈（最亮）
      ctx.strokeStyle = colorBase + alpha + ')'
      ctx.lineWidth = (flicker ? 5 : 3.5) * dpr
      drawOval(screenX, screenY + 32 * dpr, orbitR, orbitR * 0.32)
      ctx.stroke()
      // ★ 底部发光底座（填充半透明椭圆，增加体积感）
      ctx.fillStyle = colorBase + (alpha * 0.12) + ')'
      drawOval(screenX, screenY + 32 * dpr, orbitR + 4 * dpr, (orbitR + 4 * dpr) * 0.32)
      ctx.fill()
      // ★ 环绕大光点（8个，旋转）
      const n = 8
      for (let p = 0; p < n; p++) {
        const ang = t * 1.2 + (Math.PI * 2 * p) / n + i * 0.7
        const px = screenX + Math.cos(ang) * orbitR
        const py = screenY + 32 * dpr + Math.sin(ang) * orbitR * 0.32
        const ps = 4 * dpr + 2 * dpr * Math.sin(t * 4 + p)
        // 光点外发光
        ctx.fillStyle = colorBase + (alpha * 0.25) + ')'
        ctx.beginPath()
        ctx.arc(px, py, ps * 2.2, 0, Math.PI * 2)
        ctx.fill()
        // 光点核心
        ctx.fillStyle = colorBase + (0.85 + 0.15 * Math.sin(t * 6 + p)) + ')'
        ctx.beginPath()
        ctx.arc(px, py, ps, 0, Math.PI * 2)
        ctx.fill()
      }
      // ★ 上升光柱粒子（6个，从脚下往上飘）
      for (let p = 0; p < 6; p++) {
        const ph = ((t * 0.7 + p / 6 + i * 0.3) % 1)
        const ppx = screenX + Math.sin(t * 1.8 + p * 1.3 + i) * 16 * dpr
        const ppy = screenY + 20 * dpr - ph * 70 * dpr
        const pAlpha = 0.8 * (1 - ph)
        // 尾迹
        ctx.fillStyle = colorBase + (pAlpha * 0.3) + ')'
        ctx.beginPath()
        ctx.arc(ppx, ppy + 8 * dpr, 3 * dpr, 0, Math.PI * 2)
        ctx.fill()
        // 核心
        ctx.fillStyle = colorBase + pAlpha + ')'
        ctx.beginPath()
        ctx.arc(ppx, ppy, 3.5 * dpr * (1 - ph * 0.5), 0, Math.PI * 2)
        ctx.fill()
      }
      // ★ 剩余时间数字（大号、带阴影、持续显示）
      if (i === active.length - 1) {
        const secs = Math.ceil(b._remaining)
        const numAlpha = flicker ? (0.5 + 0.5 * Math.abs(Math.sin(t * 10))) : 1.0
        ctx.font = `bold ${16 * dpr}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        // 阴影
        ctx.fillStyle = `rgba(0,0,0,${numAlpha * 0.6})`
        ctx.fillText(secs, screenX + 1, screenY - 65 * dpr + 1)
        // 主数字
        ctx.fillStyle = colorBase + numAlpha + ')'
        ctx.fillText(secs, screenX, screenY - 65 * dpr)
        // buff 名称小字
        const buffName = b.type === 'def_up' ? '防御' : b.type === 'def_up_self' ? '金盾' : b.type === 'atk_up' ? '战吼' : b.type === 'atk_up_self' ? '狂暴' : ''
        if (buffName) {
          ctx.font = `${10 * dpr}px sans-serif`
          ctx.fillStyle = colorBase + (numAlpha * 0.8) + ')'
          ctx.fillText(buffName, screenX, screenY - 80 * dpr)
        }
      }
    })
    ctx.restore()
  }

  /**
   * ★ 渲染怪物异常状态视觉（脚底圈 + 身体染色 + 头顶状态标记）
   *   - 脚底：按状态配色的椭圆光圈（多状态叠加，逐层外扩）
   *   - 身体：冰冻=青蓝半透明覆盖；灼烧=橙红呼吸光晕；感电=黄白边缘电光；紧固=绿色根系提示
   *   - 头顶：状态图标+剩余秒数（即将消失闪烁）
   * @param {Object} ctx 画布上下文
   * @param {number} screenX 怪物屏幕X（脚底）
   * @param {number} screenY 怪物屏幕Y（脚底）
   * @param {Object} monster 怪物对象（含 statusEffects）
   */
  _renderMonsterStatusAura(ctx, screenX, screenY, monster) {
    if (!monster || !monster.statusEffects || !this.battleSystem) return
    const active = monster.statusEffects.filter(e => e._active && e._remaining > 0)
    if (active.length === 0) return
    const t = Date.now() / 1000
    const dpr = this.dpr
    ctx.save()
    const drawOval = (cx, cy, rx, ry) => {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1, ry / (rx || 1))
      ctx.beginPath()
      ctx.arc(0, 0, rx, 0, Math.PI * 2)
      ctx.restore()
    }
    // 怪物身体包围盒（用于身体染色）：脚底向上约 90*dpr 高、宽约 56*dpr
    const bodyH = 100 * dpr
    const bodyW = 56 * dpr
    const bodyTopY = screenY - bodyH
    active.forEach((e, i) => {
      const colorBase = e._glow || (this.STATUS_META[e.type] && this.STATUS_META[e.type].glow) || 'rgba(255,255,255,'
      const warn = e._remaining <= 1.5
      const flicker = e._remaining <= 1.0
      const alpha = flicker ? (0.5 + 0.5 * Math.abs(Math.sin(t * 10))) : (0.6 + 0.4 * Math.sin(t * 2.5 + i))
      const baseR = (30 + i * 9) * dpr
      const orbitR = baseR + 6 * Math.sin(t * 1.8 + i)
      // ★ 脚底三层光圈
      ctx.strokeStyle = colorBase + (alpha * 0.18) + ')'
      ctx.lineWidth = 6 * dpr
      drawOval(screenX, screenY + 6 * dpr, orbitR + 14 * dpr, (orbitR + 14 * dpr) * 0.34)
      ctx.stroke()
      ctx.strokeStyle = colorBase + alpha + ')'
      ctx.lineWidth = 3.5 * dpr
      drawOval(screenX, screenY + 6 * dpr, orbitR, orbitR * 0.34)
      ctx.stroke()
      // ★ 身体染色覆盖（按状态类型差异化）
      if (e.type === 'freeze') {
        // 冰冻：青蓝半透明冰壳
        ctx.fillStyle = colorBase + '0.22)'
        this._roundRect(ctx, screenX - bodyW / 2, bodyTopY, bodyW, bodyH, 12 * dpr)
        ctx.fill()
        // 冰晶高光斜线
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 2 * dpr
        ctx.beginPath()
        ctx.moveTo(screenX - bodyW * 0.2, bodyTopY + bodyH * 0.25)
        ctx.lineTo(screenX + bodyW * 0.1, bodyTopY + bodyH * 0.6)
        ctx.stroke()
      } else if (e.type === 'burn') {
        // 灼烧：橙红呼吸光晕
        const ba = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(t * 5 + i))
        ctx.fillStyle = colorBase + ba + ')'
        this._roundRect(ctx, screenX - bodyW / 2, bodyTopY, bodyW, bodyH, 12 * dpr)
        ctx.fill()
      } else if (e.type === 'electrify') {
        // 感电：黄白边缘电弧
        ctx.strokeStyle = colorBase + (0.5 + 0.5 * Math.sin(t * 18 + i)) + ')'
        ctx.lineWidth = 2.5 * dpr
        this._roundRect(ctx, screenX - bodyW / 2, bodyTopY, bodyW, bodyH, 12 * dpr)
        ctx.stroke()
      } else if (e.type === 'root') {
        // 紧固：绿色根系提示（脚底向上爬的草绿光）
        ctx.fillStyle = colorBase + '0.16)'
        this._roundRect(ctx, screenX - bodyW / 2, screenY - bodyH * 0.45, bodyW, bodyH * 0.45, 12 * dpr)
        ctx.fill()
      }
      // ★ 环绕小光点（旋转）
      const n = 6
      for (let p = 0; p < n; p++) {
        const ang = t * 1.4 + (Math.PI * 2 * p) / n + i * 0.7
        const px = screenX + Math.cos(ang) * orbitR
        const py = screenY + 6 * dpr + Math.sin(ang) * orbitR * 0.34
        ctx.fillStyle = colorBase + (0.7 + 0.3 * Math.sin(t * 6 + p)) + ')'
        ctx.beginPath()
        ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }
    })
    // ★ 头顶状态图标 + 剩余时间（取剩余最短的状态）
    const shortest = active.reduce((a, b) => (b._remaining < a._remaining ? b : a), active[0])
    const secs = Math.ceil(shortest._remaining)
    const flick = shortest._remaining <= 1.0
    const iconY = bodyTopY - 18 * dpr
    const numAlpha = flick ? (0.5 + 0.5 * Math.abs(Math.sin(t * 10))) : 1.0
    const iconColor = shortest._glow || (this.STATUS_META[shortest.type] && this.STATUS_META[shortest.type].glow) || 'rgba(255,255,255,'
    // 图标底圈
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.arc(screenX, iconY, 13 * dpr, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = iconColor + (numAlpha * 0.9) + ')'
    ctx.lineWidth = 2.5 * dpr
    ctx.beginPath()
    ctx.arc(screenX, iconY, 13 * dpr, 0, Math.PI * 2)
    ctx.stroke()
    // 状态标识字（灼/冰/电/缚）
    const mark = shortest.type === 'burn' ? '灼' : shortest.type === 'freeze' ? '冰' : shortest.type === 'electrify' ? '电' : shortest.type === 'root' ? '缚' : '?'
    ctx.fillStyle = iconColor + numAlpha + ')'
    ctx.font = `bold ${15 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(mark, screenX, iconY)
    // 剩余秒数
    ctx.font = `bold ${13 * dpr}px sans-serif`
    ctx.fillStyle = `rgba(0,0,0,${numAlpha * 0.6})`
    ctx.fillText(secs, screenX + 1, iconY - 22 * dpr + 1)
    ctx.fillStyle = iconColor + numAlpha + ')'
    ctx.fillText(secs, screenX, iconY - 22 * dpr)
    ctx.restore()
  }

  /**
   * ★ 渲染 buff 生效冲击波（释放瞬间扩散光圈）
   */
  _renderBuffShockwaves(ctx) {
    const list = this.battleSystem && this.battleSystem.buffShockwaves
    if (!list || list.length === 0) return
    const dpr = this.dpr
    ctx.save()
    const drawOval = (cx, cy, rx, ry) => {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1, ry / (rx || 1))
      ctx.beginPath()
      ctx.arc(0, 0, rx, 0, Math.PI * 2)
      ctx.restore()
    }
    for (const sw of list) {
      const prog = sw._t / (sw._dur || 1)
      if (prog >= 1) continue
      const r = (25 + prog * 110) * dpr
      const alpha = 0.9 * (1 - prog)
      const cb = sw._color || 'rgba(200,200,255,'
      const cx = sw.x - this.cameraX
      const cy = sw.y - this.cameraY + 32 * dpr
      // ★ 三层扩散圈
      ctx.strokeStyle = cb + (alpha * 0.3) + ')'
      ctx.lineWidth = (7 * (1 - prog) + 2) * dpr
      drawOval(cx, cy, r + 15 * dpr, (r + 15 * dpr) * 0.3)
      ctx.stroke()
      ctx.strokeStyle = cb + (alpha * 0.6) + ')'
      ctx.lineWidth = (5 * (1 - prog) + 2) * dpr
      drawOval(cx, cy, r, r * 0.3)
      ctx.stroke()
      ctx.strokeStyle = cb + alpha + ')'
      ctx.lineWidth = (4 * (1 - prog) + 1) * dpr
      drawOval(cx, cy, r * 0.65, r * 0.65 * 0.3)
      ctx.stroke()
      // ★ 中心闪光球（释放瞬间，逐渐缩小消失）
      const flashR = 14 * dpr * (1 - prog * 0.7)
      if (flashR > 0) {
        ctx.fillStyle = cb + (alpha * 0.35) + ')'
        ctx.beginPath()
        ctx.arc(cx, cy, flashR * 2.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = cb + (alpha * 0.95) + ')'
        ctx.beginPath()
        ctx.arc(cx, cy, flashR, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`
        ctx.beginPath()
        ctx.arc(cx, cy, flashR * 0.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  _handleTap(tap) {
    // ★ 副本通关遮罩：点击任意处立即返回城镇
    if (this.showDungeonClear) {
      this._returningToTown = true
      this.game.changeScene('town')
      return
    }

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
        // 检查是否点击了切换按钮区域（右侧的 ↻ 圆形按钮）
        // ★ 直接用卡片右下角区域判定，避免依赖 _charSwitchBtnBounds 可能未初始化的问题
        const hitX0 = card.x + card.width - 50 * this.dpr
        const hitY0 = card.y
        const inSwitchBtn = tap.x >= hitX0 && tap.x <= card.x + card.width &&
                                   tap.y >= hitY0 && tap.y <= card.y + 50 * this.dpr
        if (inSwitchBtn) {
          // ★ 复用已有的左上角切换按钮：战斗中对参战英雄进行控制权切换（主角 <-> 队友）
          //   注意：_switchControl 挂在 FieldSceneClass.prototype 上（field-scene 实例方法），
          //   直接 this._switchControl() 调用即可，this 即为 field-scene 实例
          if (this.battleSystem && this.battleSystem.active && typeof this._switchControl === 'function') {
            this._switchControl()
            // ★ 显示切换提示（用当前被控角色名；角色卡/头像已在 _switchControl 内同步更新）
            const ctrl = this.battleSystem.battleHeroes && this.battleSystem.battleHeroes[0]
            this.switchTipName = ctrl ? ctrl.hero.name : ''
            this.showSwitchTip = true
            this.switchTipTimer = 1.5
          }
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

    // ★ 召回/解散按钮（角色信息卡片正下方，与 render 绘制坐标一致）：切换队友"自行寻怪 / 召回身边"模式
    const recallBtn = { x: 20 * this.dpr, y: (80 + 100 + 8) * this.dpr, w: 180 * this.dpr, h: 40 * this.dpr }
    if (tap.x >= recallBtn.x && tap.x <= recallBtn.x + recallBtn.w &&
        tap.y >= recallBtn.y && tap.y <= recallBtn.y + recallBtn.h) {
      this.aiRecall = !this.aiRecall
      // ★ 点击"召回"：立即把全部队友瞬移到被控角色周围（而非缓慢走回）
      if (this.aiRecall) this._recallAlliesToPlayer()
      console.log(`[Field] 队友召回模式: ${this.aiRecall ? '召回中（跟随主角）' : '解散（自行寻怪）'}`)
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
    // ★ 宝箱奖励读配置（chestReward.entries），按 type 结算：
    //   gold     → _addGold（写入 'gold' 字段）
    //   material → _addMaterial（写入 data.materials 库存）
    const entries = (GRASSLAND_DUNGEON.chestReward && GRASSLAND_DUNGEON.chestReward.entries) || []
    const msgs = []
    for (const entry of entries) {
      const rate = entry.rate != null ? entry.rate : 1
      if (Math.random() > rate) continue
      if (entry.type === 'gold') {
        const g = (entry.min || 0) + Math.floor(Math.random() * ((entry.max || 0) - (entry.min || 0) + 1))
        if (g > 0) { this._addGold(g); msgs.push(`💰 ${g} 金币`) }
      } else if (entry.type === 'material') {
        const cnt = entry.count || 1
        this._addMaterial(entry.id, cnt)
        msgs.push(`🧪 ${entry.id} ×${cnt}`)
      }
    }
    if (msgs.length && this.game.showToast) this.game.showToast(`宝箱获得：${msgs.join('，')}`)
    console.log(`[Field] 收集宝箱获得：${msgs.join('，')}`)
  }

  /**
   * ★ 统一金币入账：写入 data 的 'gold' 字段（映射 player.gold，HUD / 其它系统均读取它）
   * 取代各处散落的 this.game.data.set('gold', ...) 与孤立的 'coins' 字段。
   */
  _addGold(amount) {
    if (!amount || !this.game || !this.game.data) return
    const cur = (this.game.data.get && this.game.data.get('gold')) || 0
    this.game.data.set('gold', cur + amount)
  }

  /**
   * ★ 素材入账：素材库存存于 data 的 'materials'（{ id: count }）
   */
  _addMaterial(id, count) {
    if (!id || !count || !this.game || !this.game.data) return
    const mats = (this.game.data.get && this.game.data.get('materials')) || {}
    mats[id] = (mats[id] || 0) + count
    this.game.data.set('materials', mats)
  }

  /**
   * ★ 击杀掉落：按怪物 enemyId 查 GRASSLAND_DUNGEON.lootTable 掷骰。
   * 由 _updateMonsters 在怪物「刚死亡」时调用一次（monster._looted 守卫）。
   */
  _rollMonsterDrop(monster) {
    if (!monster || !GRASSLAND_DUNGEON.lootTable) return
    const table = GRASSLAND_DUNGEON.lootTable[monster.enemyId]
    if (!table || !table.length) return
    const parts = []
    for (const entry of table) {
      if (entry.rate != null && Math.random() > entry.rate) continue
      if (entry.type === 'gold') {
        const amt = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1))
        this._addGold(amt)
        parts.push(`💰+${amt}`)
        this._pushDropFloater(monster.x, monster.y, `💰+${amt}`, '#ffd84d')
      } else if (entry.type === 'material') {
        const c = entry.count || 1
        this._addMaterial(entry.id, c)
        parts.push(`🧪${entry.id}×${c}`)
        this._pushDropFloater(monster.x, monster.y - 16 * this.dpr, `🧪${entry.id}`, '#7fe3ff')
      }
    }
    if (parts.length && this.game.showToast) {
      this.game.showToast(`击败 ${monster.name}：${parts.join('  ')}`)
    }
    console.log(`[Field] ${monster.name}(${monster.enemyId}) 掉落: ${parts.join('  ') || '无'}`)
  }

  /** 在怪物死亡位置（世界坐标）生成一条上浮的掉落飘字（金币/素材正反馈） */
  _pushDropFloater(x, y, text, color) {
    if (this._dropFloaters == null) this._dropFloaters = []
    this._dropFloaters.push({ x, y, text, color: color || '#fff', life: 1.1, maxLife: 1.1, vy: 36 })
  }

  _updateDropFloaters(dt) {
    if (!this._dropFloaters || !this._dropFloaters.length) return
    for (let i = this._dropFloaters.length - 1; i >= 0; i--) {
      const f = this._dropFloaters[i]
      f.life -= dt
      f.y -= f.vy * dt
      if (f.life <= 0) this._dropFloaters.splice(i, 1)
    }
  }

  _renderDropFloaters(ctx) {
    if (!this._dropFloaters || !this._dropFloaters.length) return
    const dpr = this.dpr
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${14 * dpr}px sans-serif`
    for (const f of this._dropFloaters) {
      const sx = f.x - this.cameraX
      const sy = f.y - this.cameraY
      if (sx < -60 || sy < -60 || sx > this.width + 60 || sy > this.height + 60) continue
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.maxLife))
      ctx.fillStyle = f.color
      ctx.fillText(f.text, sx, sy)
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  /**
   * 碰撞检测 — 使用 CollisionEngine（统一脚底碰撞）
   * 所有地图场景共用同一套碰撞参数，不再各自实现
   */
  /**
   * ★ 切换控制后刷新左上角角色卡（由 _switchControl 调用，手动切换和阵亡自动切换都走这里）
   * 注意：hero 可能是 party 里的普通对象（无 getExpProgress），
   * 必须转成 CharacterState 实例传给面板，否则 renderMiniCard 崩溃
   */
  _refreshCharCard(hero) {
    if (!hero || !this.charInfoPanel) return
    // 按 id 从角色状态管理器取 CharacterState 实例
    const cs = charStateManager.getAllCharacters().find(c => c.id === hero.id)
    const target = cs || hero
    // ★ BUFF 挂在 battleHeroes 的 hero（party 普通对象）上，需同步到卡片显示对象，
    //   否则角色卡看不到 BUFF 状态
    if (cs) {
      if (cs._buffs !== hero._buffs) {
        cs._buffs = hero._buffs || []
      }
    } else {
      if (target._buffs !== hero._buffs) {
        target._buffs = hero._buffs || []
      }
    }
    // ★ 挂载含 BUFF 加成的攻防计算（角色卡数值随 BUFF 提升）
    const self = this
    target._getAtkWithBuff = function() { return self._getHeroAtk(hero) }
    target._getDefWithBuff = function() { return self._getHeroDef(hero) }
    this.charInfoPanel.setCharacter(target)
  }

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

    // ── layer=2：技能命中特效（按 2.5D Y 轴排序，随单位前后遮挡）─
    //   只处理未被角色绑定消费的特效（_consumedByChar=true 的由角色渲染管线绘制）
    //   effect.x/y 是屏幕坐标（playHitEffect 传入时已减 camera），sortY 用世界坐标换算
    if (this.game && this.game.effects && this.game.effects.effects) {
      for (const ef of this.game.effects.effects) {
        if (!ef.isPlaying || !ef.images || ef.images.length === 0) continue
        if (ef._consumedByChar) continue
        const currentImage = ef.images[ef.currentFrame]
        if (!currentImage) continue
        const efW = currentImage.width * (ef.scale || 1)
        const efH = currentImage.height * (ef.scale || 1)
        // ★ 世界锚定特效：每帧用世界坐标减相机重投影（钉在目标身上，相机滚动不漂走）
        //   非世界锚定：沿用创建时冻结的屏幕坐标（兼容旧逻辑）
        const isWorld = ef.worldX !== undefined && ef.worldY !== undefined
        const sx = isWorld ? (ef.worldX - this.cameraX) : ef.x
        const sy = isWorld ? (ef.worldY - this.cameraY) : ef.y
        ef._ySorted = true   // ★ 本帧已由 Y 排序渲染，防止 effects.render() 重复绘制
        // ★ 2.5D 层级对齐：特效脚底锚定在世界坐标 (world.y)，与角色/怪物一致
        //   角色/怪物 sortY 取脚底 pos.y/dpr，故特效也用 world.y 作为锚点，
        //   绘制时按脚底对齐（sy - efH + efH/2 使底部贴 world.y，而非中心贴 world.y）
        const worldY = isWorld ? ef.worldY : (ef.y + this.cameraY)
        engine.addEntity({
          layer: 2,
          sortY: worldY / this.dpr,
          type: 'skillEffect',
          render: (ctx) => {
            ctx.save()
            ctx.globalAlpha = ef.alpha
            // 底部对齐世界坐标：把精灵底边贴到 sy（脚底），中心上移 efH/2
            ctx.drawImage(currentImage, sx - efW / 2, sy - efH + efH / 2, efW, efH)
            ctx.restore()
          }
        })
      }
    }

    // ── layer=2：投射物（火球弹道/普攻冲击波，按世界Y排序随单位遮挡）─
    if (this.battleSystem && this.battleSystem.projectiles && this.battleSystem.projectiles.length > 0) {
      const now = Date.now() / 1000
      for (const p of this.battleSystem.projectiles) {
        const sx = p.x - this.cameraX
        const sy = p.y - this.cameraY
        const isBasic = !!p.isBasicAttack
        engine.addEntity({
          layer: 2,
          sortY: p.y / this.dpr,
          type: 'projectile',
          render: (ctx) => {
            ctx.save()
            // ★ P2 弹道拖尾：施加 translate 前用世界坐标绘制近期位置渐隐残影
            if (p._trail && p._trail.length > 1) {
              for (let ti = 0; ti < p._trail.length; ti++) {
                const tp = p._trail[ti]
                const a = ti / (p._trail.length - 1)
                ctx.fillStyle = `rgba(${isBasic ? '150,210,255' : '255,150,60'}, ${0.3 * a})`
                ctx.beginPath()
                ctx.arc(tp.x - this.cameraX, tp.y - this.cameraY, (isBasic ? 5 : 6) * this.dpr * (0.4 + 0.6 * a), 0, Math.PI * 2)
                ctx.fill()
              }
            }
            ctx.translate(sx, sy)
            if (isBasic) {
              // ★ 普攻冲击波：蓝白色能量弹 + 环绕粒子
              // 核心
              const pulse = 0.8 + 0.2 * Math.sin(now * 10)
              ctx.fillStyle = 'rgba(150, 210, 255, 0.9)'
              ctx.beginPath()
              ctx.arc(0, 0, 7 * this.dpr * pulse, 0, Math.PI * 2)
              ctx.fill()
              // 白色核心
              ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
              ctx.beginPath()
              ctx.arc(0, 0, 3.5 * this.dpr, 0, Math.PI * 2)
              ctx.fill()
              // 外发光
              ctx.fillStyle = 'rgba(150, 210, 255, 0.25)'
              ctx.beginPath()
              ctx.arc(0, 0, 12 * this.dpr, 0, Math.PI * 2)
              ctx.fill()
              // 环绕小粒子
              for (let k = 0; k < 3; k++) {
                const ang = now * 6 + (Math.PI * 2 * k) / 3
                ctx.fillStyle = 'rgba(200, 235, 255, 0.6)'
                ctx.beginPath()
                ctx.arc(Math.cos(ang) * 10 * this.dpr, Math.sin(ang) * 4 * this.dpr, 2 * this.dpr, 0, Math.PI * 2)
                ctx.fill()
              }
            } else if (p.bladeStorm) {
              // ★ 剑气：修罗邪光斩式月牙实体面（凸面朝前飞行，带残影）
              const dir = p.vx >= 0 ? 1 : -1
              const dpr = this.dpr
              const age = p.age || 0
              const fade = Math.max(0, Math.min(1, p.life / (p.life + age + 0.001) * 1.6))
              const H = (p.height || 110) * dpr   // 月牙竖直跨度
              // 月牙几何：外弧（凸面朝前）+ 内弧（凹面朝后）闭合填充
              const R_out = H * 0.6      // 外弧半径
              const R_in  = H * 0.42     // 内弧半径（<R_out，形成厚度）
              const o_cx = -R_out * 0.5  // 外弧圆心（偏后）
              const i_cx = R_in * 0.15   // 内弧圆心（偏前）
              const cy = 0
              const a0 = -Math.PI * 0.28
              const a1 =  Math.PI * 0.28

              // 月牙前缘（最右）X 坐标 = 外弧最右点
              const edgeX = o_cx + R_out
              // 月牙后缘（最左）X 坐标 = 外弧/内弧左侧交点附近，取内弧最左
              const backX = i_cx - R_in

              // 绘制月牙实体路径（外弧正向 + 内弧反向，端点连接形成闭合面）
              function crescentPath(ctx, oCx, iCx, rOut, rIn, aStart, aEnd) {
                ctx.beginPath()
                ctx.arc(oCx, 0, rOut, aStart, aEnd)
                ctx.arc(iCx, 0, rIn, aEnd, aStart, true)
                ctx.closePath()
              }

              ctx.save()
              ctx.scale(dir, 1)

              // ===== 残影拖尾：3个月牙面，向后偏移、逐渐变淡 =====
              for (let k = 3; k >= 1; k--) {
                const off = k * 9 * dpr
                const aOff = k * 0.035
                ctx.globalAlpha = fade * (0.18 - k * 0.04)
                ctx.fillStyle = 'rgba(150, 210, 255, 0.85)'
                crescentPath(ctx, o_cx - off, i_cx - off, R_out, R_in, a0 - aOff, a1 + aOff)
                ctx.fill()
              }

              // ===== 主体剑气（月牙实体面，前缘亮、后缘消散） =====
              ctx.globalAlpha = fade

              // 1) 主体填充：水平线性渐变（前缘青白实、后缘透明）
              const bodyGrad = ctx.createLinearGradient(edgeX, 0, backX, 0)
              bodyGrad.addColorStop(0,   'rgba(220, 240, 255, 0.95)')  // 前缘：实
              bodyGrad.addColorStop(0.5, 'rgba(180, 225, 255, 0.6)')   // 中段
              bodyGrad.addColorStop(1,   'rgba(140, 200, 255, 0.0)')   // 后缘：透明消散
              ctx.fillStyle = bodyGrad
              crescentPath(ctx, o_cx, i_cx, R_out, R_in, a0, a1)
              ctx.fill()

              // 2) 外层光晕（沿前缘外侧的青蓝光）
              ctx.strokeStyle = 'rgba(120, 190, 255, 0.45)'
              ctx.lineWidth = 7 * dpr
              ctx.lineJoin = 'round'
              crescentPath(ctx, o_cx, i_cx, R_out, R_in, a0, a1)
              ctx.stroke()

              // 3) 前缘刃锋（细锐亮线，强化刀刃锋利感）
              const edgeGrad = ctx.createLinearGradient(edgeX, 0, o_cx, 0)
              edgeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
              edgeGrad.addColorStop(1, 'rgba(180, 220, 255, 0.1)')
              ctx.strokeStyle = edgeGrad
              ctx.lineWidth = 1.8 * dpr
              ctx.lineCap = 'round'
              ctx.beginPath()
              ctx.arc(o_cx, 0, R_out, a0, a1)
              ctx.stroke()

              // 4) 内部能量纹路已移除（用户反馈多余）

              // 5) 凸面中段能量高光（亮斑）
              const coreX = edgeX
              const grad = ctx.createRadialGradient(coreX, 0, 0, coreX, 0, 12 * dpr)
              grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)')
              grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
              ctx.fillStyle = grad
              ctx.beginPath()
              ctx.arc(coreX, 0, 12 * dpr, 0, Math.PI * 2)
              ctx.fill()

              // 5) 上下尖端亮点（让端角尖锐发光）
              for (const a of [a0, a1]) {
                const tx = o_cx + R_out * Math.cos(a)
                const ty = R_out * Math.sin(a)
                const tg = ctx.createRadialGradient(tx, ty, 0, tx, ty, 7 * dpr)
                tg.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
                tg.addColorStop(1, 'rgba(255, 255, 255, 0)')
                ctx.fillStyle = tg
                ctx.beginPath()
                ctx.arc(tx, ty, 7 * dpr, 0, Math.PI * 2)
                ctx.fill()
              }

              ctx.restore()
            } else {
              // ★ 火球：火焰粒子效果（核心亮球 + 多层火焰粒子 + 拖尾）
              // 外层火焰（橙红扩散）
              for (let k = 0; k < 6; k++) {
                const ang = now * 8 + (Math.PI * 2 * k) / 6
                const rr = (7 + 3 * Math.sin(now * 5 + k)) * this.dpr
                const fx = Math.cos(ang) * rr
                const fy = Math.sin(ang) * rr * 0.7
                ctx.fillStyle = `rgba(255, 140, 40, ${0.35 + 0.3 * Math.abs(Math.sin(now * 5 + k))})`
                ctx.beginPath()
                ctx.arc(fx, fy, 3.5 * this.dpr, 0, Math.PI * 2)
                ctx.fill()
              }
              // 内层火焰（黄）
              ctx.fillStyle = 'rgba(255, 200, 60, 0.85)'
              ctx.beginPath()
              ctx.arc(0, 0, 6 * this.dpr, 0, Math.PI * 2)
              ctx.fill()
              // 核心（白热）
              ctx.fillStyle = 'rgba(255, 255, 230, 0.95)'
              ctx.beginPath()
              ctx.arc(0, 0, 3 * this.dpr, 0, Math.PI * 2)
              ctx.fill()
              // 大光晕
              ctx.fillStyle = 'rgba(255, 120, 30, 0.25)'
              ctx.beginPath()
              ctx.arc(0, 0, 14 * this.dpr, 0, Math.PI * 2)
              ctx.fill()
              // 火焰拖尾（向左后方 = 运动反方向）
              ctx.fillStyle = 'rgba(255, 100, 30, 0.4)'
              ctx.beginPath()
              ctx.arc(-p.castDir * 10 * this.dpr, 0, 4 * this.dpr, 0, Math.PI * 2)
              ctx.fill()
              ctx.fillStyle = 'rgba(255, 80, 20, 0.25)'
              ctx.beginPath()
              ctx.arc(-p.castDir * 16 * this.dpr, 0, 3 * this.dpr, 0, Math.PI * 2)
              ctx.fill()
            }
            ctx.restore()
          }
        })
      }
    }

    // ★ P2 命中环（命中瞬间扩散圈，世界坐标，按 Y 排序随单位遮挡）
    if (this.battleSystem && this.battleSystem.hitRings && this.battleSystem.hitRings.length > 0) {
      for (const r of this.battleSystem.hitRings) {
        const sx = r.x - this.cameraX
        const sy = r.y - this.cameraY
        engine.addEntity({
          layer: 2,
          sortY: r.y / this.dpr,
          type: 'hitRing',
          render: (ctx) => {
            const prog = r.life > 0 ? Math.min(1, r.age / r.life) : 1
            const rad = r.r0 + (r.r1 - r.r0) * prog
            const alpha = (1 - prog) * 0.85
            ctx.save()
            ctx.strokeStyle = `rgba(${r.color}, ${alpha})`
            ctx.lineWidth = (3 + 2 * (1 - prog)) * this.dpr
            ctx.beginPath()
            ctx.arc(sx, sy, rad, 0, Math.PI * 2)
            ctx.stroke()
            ctx.restore()
          }
        })
      }
    }

    // ★ P2 远程蓄力发光（受控英雄身上脉冲光环，起手蓄力到弹丸飞出）
    if (this.battleSystem && this.battleSystem._chargeGlow) {
      const cg = this.battleSystem._chargeGlow
      const hero = cg.hero
      if (hero && hero.getPos) {
        const hp = hero.getPos()
        const sx = hp.x - this.cameraX
        const sy = hp.y - this.cameraY
        engine.addEntity({
          layer: 1,
          sortY: hp.y / this.dpr,
          type: 'chargeGlow',
          render: (ctx) => {
            const prog = cg.maxTimer > 0 ? Math.max(0, cg.timer / cg.maxTimer) : 0
            const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 80)
            const R = (38 + 16 * (1 - prog)) * this.dpr * pulse
            const alpha = 0.22 + 0.28 * prog
            ctx.save()
            const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R)
            g.addColorStop(0, `rgba(${cg.color}, ${alpha})`)
            g.addColorStop(1, `rgba(${cg.color}, 0)`)
            ctx.fillStyle = g
            ctx.beginPath()
            ctx.arc(sx, sy, R, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }
        })
      }
    }

    // ── layer=2：BUFF 粒子（按世界Y排序，被角色正确遮挡）─
    if (this.battleSystem && this.battleSystem.buffParticles && this.battleSystem.buffParticles.length > 0) {
      for (const pt of this.battleSystem.buffParticles) {
        const sx = pt.x - this.cameraX
        const sy = pt.y - this.cameraY
        const pAlpha = Math.max(0, Math.min(1, pt.life))
        engine.addEntity({
          layer: 2,
          sortY: pt.y / this.dpr,
          type: 'buffParticle',
          render: (ctx) => {
            ctx.save()
            // 发光外圈
            ctx.fillStyle = `rgba(255, 255, 255, ${pAlpha * 0.25})`
            ctx.beginPath()
            ctx.arc(sx, sy, pt.size * 1.8, 0, Math.PI * 2)
            ctx.fill()
            // 核心
            ctx.fillStyle = pt.color.startsWith('#') ? pt.color : pt.color
            ctx.globalAlpha = pAlpha * 0.9
            ctx.beginPath()
            ctx.arc(sx, sy, pt.size, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }
        })
      }
    }

    // ── layer=2：BUFF 脚底光环（按世界Y排序，被前排角色正确遮挡）─
    // ★ 之前在 _renderWorldHealthBars 里直接绘制，绕过了 Y 排序，始终盖在最上层；
    //   现改为注册为 Y 排序实体，脚底锚定角色世界坐标，层级与角色/怪物一致。
    if (this.party && this.party.length) {
      const auraAt = (wx, wy, hero) => {
        if (!hero || !hero._buffs) return
        const active = hero._buffs.filter(b => b._active && b._remaining > 0)
        if (active.length === 0) return
        engine.addEntity({
          layer: 2,
          sortY: wy / this.dpr,
          type: 'buffAura',
          render: (ctx) => {
            // 角色脚底屏幕坐标（与 character 实体同一锚点，确保遮挡一致）
            const sx = wx - this.cameraX
            const sy = wy - this.cameraY
            this._renderHeroBuffAura(ctx, sx, sy, hero)
          }
        })
      }
      const mainPos = (this._heroWorldPos && this._heroWorldPos[0]) ? this._heroWorldPos[0] : { x: this.playerX, y: this.playerY }
      const mainDead = this.battleSystem && this.battleSystem.active && this.party[0] && this.party[0].hp <= 0
      if (!mainDead) auraAt(mainPos.x, mainPos.y, this.party[0])
      if (this.followers && Array.isArray(this.followers)) {
        for (let i = 0; i < this.followers.length; i++) {
          const f = this.followers[i]
          if (!f || !f.character) continue
          if (this.battleSystem && this.battleSystem.active && f.character.hp <= 0) continue
          const fPos = (this._heroWorldPos && this._heroWorldPos[i + 1]) ? this._heroWorldPos[i + 1] : { x: f.x, y: f.y }
          auraAt(fPos.x, fPos.y, f.character)
        }
      }
    }

    // ── layer=2：霸体技能光环（英雄施放霸体技能期间显示，按世界Y排序）─
    if (this.battleSystem) {
      const saAt = (wx, wy, hero, isMain) => {
        if (!hero) return
        if (!this._heroSuperArmorOn(hero, isMain)) return
        engine.addEntity({
          layer: 2,
          sortY: wy / this.dpr,
          type: 'superArmorAura',
          render: (ctx) => this._renderSuperArmorAura(ctx, wx - this.cameraX, wy - this.cameraY, false)
        })
      }
      const saMainPos = (this._heroWorldPos && this._heroWorldPos[0]) ? this._heroWorldPos[0] : { x: this.playerX, y: this.playerY }
      if (!(this.battleSystem.active && this.party[0] && this.party[0].hp <= 0)) saAt(saMainPos.x, saMainPos.y, this.party[0], true)
      if (this.followers && Array.isArray(this.followers)) {
        for (let i = 0; i < this.followers.length; i++) {
          const f = this.followers[i]
          if (!f || !f.character) continue
          if (this.battleSystem.active && f.character.hp <= 0) continue
          const fPos = (this._heroWorldPos && this._heroWorldPos[i + 1]) ? this._heroWorldPos[i + 1] : { x: f.x, y: f.y }
          saAt(fPos.x, fPos.y, f.character, false)
        }
      }
    }

    // ── layer=2：怪物异常状态视觉（脚底圈/身体染色/头顶标记，按世界Y排序）─
    if (this.battleSystem && this.battleSystem.active && this.mapMonsters) {
      for (const m of this.mapMonsters) {
        if (!m.alive || !m.statusEffects || m.statusEffects.filter(e => e._active && e._remaining > 0).length === 0) continue
        const mx = m.x - this.cameraX
        const my = m.y - this.cameraY
        engine.addEntity({
          layer: 2,
          sortY: m.y / this.dpr,   // ★ 脚底锚定，与角色/怪物同级，前排正确遮挡
          type: 'monsterStatusAura',
          render: (ctx) => {
            this._renderMonsterStatusAura(ctx, mx, my, m)
          }
        })
      }
    }

    // ── layer=2：怪物霸体技能光环（红色，提示敌方大招不可打断）─
    if (this.battleSystem && this.battleSystem.active && this.mapMonsters) {
      for (const m of this.mapMonsters) {
        if (!m.alive) continue
        if (!this._monsterSuperArmorOn(m)) continue
        const mx = m.x - this.cameraX
        const my = m.y - this.cameraY
        engine.addEntity({
          layer: 2,
          sortY: m.y / this.dpr,
          type: 'superArmorAuraMonster',
          render: (ctx) => this._renderSuperArmorAura(ctx, mx, my, true)
        })
      }
    }

    // ── layer=2：怪物状态施加冲击波（扩散光圈，按世界Y排序）─
    if (this.battleSystem && this.battleSystem.statusShockwaves && this.battleSystem.statusShockwaves.length > 0) {
      // 先推进动画（在渲染层消费前更新半径/透明度）
      this.battleSystem.statusShockwaves = this.battleSystem.statusShockwaves.filter(sw => sw._t < 1)
      for (const sw of this.battleSystem.statusShockwaves) {
        sw._t += 1 / 30   // 约 0.5s 扩散完（按帧近似，渲染层每帧调用一次）
        sw.r = sw.r + (sw.maxR - sw.r) * 0.18
        sw.alpha = Math.max(0, 0.9 * (1 - sw._t))
      }
      for (const sw of this.battleSystem.statusShockwaves) {
        engine.addEntity({
          layer: 2,
          sortY: sw.y / this.dpr,
          type: 'statusShockwave',
          render: (ctx) => {
            const sx = sw.x - this.cameraX
            const sy = sw.y - this.cameraY
            ctx.save()
            ctx.strokeStyle = sw.color
            ctx.globalAlpha = sw.alpha
            ctx.lineWidth = 4 * this.dpr
            ctx.translate(sx, sy)
            ctx.scale(1, 0.34)
            ctx.beginPath()
            ctx.arc(0, 0, sw.r, 0, Math.PI * 2)
            ctx.stroke()
            ctx.restore()
          }
        })
      }
    }

    // ── layer=2：怪物状态持续粒子（与 BUFF 粒子同款发光，按世界Y排序）─
    if (this.battleSystem && this.battleSystem.monsterStatusParticles && this.battleSystem.monsterStatusParticles.length > 0) {
      engine.addEntity({
        layer: 2,
        sortY: (this.battleSystem.monsterStatusParticles.length ? (this.battleSystem.monsterStatusParticles[0].y) : this.playerY) / this.dpr,
        type: 'monsterStatusParticle',
        render: (ctx) => { this._renderMonsterStatusParticles(ctx) }
      })
    }

    // ── layer=2：BUFF 生效冲击波（释放瞬间扩散光圈，按世界Y排序）─
    if (this.battleSystem && this.battleSystem.buffShockwaves && this.battleSystem.buffShockwaves.length > 0) {
      for (const sw of this.battleSystem.buffShockwaves) {
        engine.addEntity({
          layer: 2,
          sortY: sw.y / this.dpr,
          type: 'buffShockwave',
          render: (ctx) => {
            // 临时把冲击波画到当前 ctx（_renderBuffShockwaves 内部用 this.cameraX/Y 计算屏幕坐标）
            this._renderBuffShockwaves(ctx)
          }
        })
        break // 一次性绘制全部冲击波即可（函数内部遍历 list），只注册一个实体
      }
    }

    // ── layer=2：主角 + 队友（各自独立参与Y排序，互不遮挡错乱）─
    // ★ 修复：之前所有角色画在一个 renderFn 里，主角和队友不按各自 Y 排序，
    //   导致队友（李小宝）永远画在主角（臻宝）上面。现改为每个角色一个 Y 排序实体。
    if (typeof this.playerX === 'number') {
      // ★ 当前被控角色的 partyIndex（用于绘制控制指示标记）
      const ctrlPartyIdx = (self.battleSystem && self.battleSystem.battleHeroes &&
                            self.battleSystem.battleHeroes[0])
        ? self.battleSystem.battleHeroes[0].partyIndex : 0
      // ★ 角色渲染辅助：按角色世界坐标创建独立 Y 排序实体
      const addCharEntity = (sortY, drawFn) => {
        engine.addEntity({
          layer: 2,
          sortY: sortY,
          type: 'character',
          render: (ctx) => drawFn(ctx)
        })
      }

      // ── 主角（臻宝）独立实体 ──
      // ★ 战斗中被击杀（hp<=0）的主角不渲染（死亡消失）
      const mainBhAlive = !(self.battleSystem && self.battleSystem.active) ||
        !(self.party && self.party[0] && self.party[0].hp <= 0)
      if (self.mainCharacterSprite && mainBhAlive) {
        // 战斗系统下，主角真实世界坐标存于 _heroWorldPos[0]（可能非被控者）
        const pPos = (self._heroWorldPos && self._heroWorldPos[0]) ? self._heroWorldPos[0] : { x: self.playerX, y: self.playerY }
        const screenX = pPos.x - self.cameraX
        const screenY = pPos.y - self.cameraY
        // ★ 击飞渲染偏移（不改变逻辑世界坐标，落地后转入眩晕）
        const mainHero = self.party && self.party[0]
        const mainKbX = (mainHero && mainHero._kbOffsetX) || 0
        const mainKbY = (mainHero && mainHero._kbOffsetY) || 0
        const mainStunned = !!(mainHero && mainHero._stunned > 0)
        const mainRenderX = screenX + mainKbX
        const mainRenderY = screenY + mainKbY
        addCharEntity(pPos.y / self.dpr, function mainRender(ctx) {
          // ★ 被控角色脚下画高亮圈
          if (self.battleSystem && self.battleSystem.active && ctrlPartyIdx === 0) {
            self._renderControlIndicator(ctx, mainRenderX, mainRenderY)
          }
          // ★ MP不足抖动：应用抖动偏移
          const mainShakeX = self.mainCharacterSprite._shakeOffsetX || 0
          const mainShakeY = self.mainCharacterSprite._shakeOffsetY || 0
          self.mainCharacterSprite.render(ctx, mainRenderX + mainShakeX, mainRenderY + mainShakeY)
          // ★ 主角受击泛红
          self._renderHeroHurtFlash(ctx, mainRenderX + mainShakeX, mainRenderY + mainShakeY, mainHero, self.dpr)
          // ★ 主角 BUFF 光环已移至 _renderWorldHealthBars 里统一渲染（确保每帧必调）

          // ★ 眩晕指示（被击飞落地后）：头顶旋转星星 + 轻微暗化
          if (mainStunned) {
            self._renderHeroStun(ctx, mainRenderX, mainRenderY)
          }

          // 移动时添加轻微的方向指示器
          if (self.mainCharacterSprite._effectiveMoving) {
            const targetHeight = 80 * self.dpr
            ctx.beginPath()
            const arrowDist = targetHeight / 2 + 10 * self.dpr
            let arrowX = mainRenderX
            let arrowY = mainRenderY
            
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
        })
      }

      // ── 跟随队友（李小宝等）各自独立实体，按各自 Y 排序 ──
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
            // ★ 被击杀的队友（hp<=0）不渲染（死亡消失）
            const fAlive = !(self.battleSystem && self.battleSystem.active) ||
              !(follower.character && follower.character.hp <= 0)
            if (!fAlive) continue
            // ★ 击飞渲染偏移（不改变逻辑世界坐标，落地后转入眩晕）
            const fHero = follower.character
            const fKbX = (fHero && fHero._kbOffsetX) || 0
            const fKbY = (fHero && fHero._kbOffsetY) || 0
            const fStunned = !!(fHero && fHero._stunned > 0)
            const fRenderX = fScreenX + fKbX
            const fRenderY = fScreenY + fKbY
            const fSortY = fPos.y / self.dpr
            addCharEntity(fSortY, function followerRender(ctx) {
              // ★ 被控角色（队友）脚下画高亮圈
              if (self.battleSystem && self.battleSystem.active && ctrlPartyIdx === (fi + 1)) {
                self._renderControlIndicator(ctx, fRenderX, fRenderY)
              }
              // ★ MP不足抖动：应用抖动偏移
              const fShakeX = follower.sprite._shakeOffsetX || 0
              const fShakeY = follower.sprite._shakeOffsetY || 0
              follower.sprite.render(ctx, fRenderX + fShakeX, fRenderY + fShakeY)
              // ★ 队友受击泛红
              self._renderHeroHurtFlash(ctx, fRenderX + fShakeX, fRenderY + fShakeY, fHero, self.dpr)
              // ★ 眩晕指示（被击飞落地后）
              if (fStunned) {
                self._renderHeroStun(ctx, fRenderX, fRenderY)
              }
              // ★ 队友 BUFF 光环已移至 _renderWorldHealthBars 里统一渲染
            })
          } else if (typeof self._renderFollower === 'function') {
            // 兜底：旧版手写渲染路径（作为独立实体）
            const fPos = { x: follower.x, y: follower.y }
            addCharEntity(fPos.y / self.dpr, function followerRender(ctx) {
              self._renderFollower(ctx, follower, fi)
            })
          }
        }
      }
    }

    // ★ BUFF 生效冲击波已移至 _renderWorldHealthBars 里统一渲染

    // ★ 世界血条/蓝条：推入 2.5D 排序引擎（与角色/怪物同层级参与深度排序）
    if (this.battleSystem) {
      this._renderWorldHealthBars(ctx)
    }

    // 排序 + 统一绘制（通过 hooks 处理特殊类型）
    engine.render(ctx, {
      renderMonster: (ctx, monster, sx, sy) => {
        // ★ 修复：所有有动画资源的怪物都使用猫咪动画
        const useCatAnim = ['slime_cat', 'shadow_mouse', 'wild_cat', 'lost_healer_cat', 'flame_slime', 'aqua_slime', 'violet_slime', 'shadow_mouse_smooth'].includes(monster.enemyId)
        // ★ 跳跃攻击动画：按抛物线高度上移渲染（跳跃期间怪物在空中）
        const jumpY = sy + (monster._jumpOffsetY || 0)
        if (useCatAnim) {
          self._renderCatMonster(ctx, monster, sx, jumpY)
        } else {
          self._renderEmojiMonster(ctx, monster, sx, jumpY)
        }
        // ★ 受击闪白：命中瞬间在怪物身体位置叠半透明白覆盖
        //   （_hitFlash 由战斗系统 _onHitFeedback 置 1，并在 _updateBattleSystem 递减）
        if (monster._hitFlash && monster._hitFlash > 0) {
          const cfg = self._getMonsterConfig(monster.enemyId)
          const th = ((cfg && cfg.renderConfig && cfg.renderConfig.targetHeight) || 80) * self.dpr
          ctx.save()
          ctx.globalAlpha = Math.min(0.85, monster._hitFlash * 0.9)
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.ellipse(sx, jumpY - th * 0.45, th * 0.45, th * 0.5, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
        // ★ 怪物头顶血条已移除（用户要求）：怪物血条统一在左下目标面板
        //   （召回/解散按钮下方，_renderTargetPanel）显示，含扣血追赶效果
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
    // ★ 每帧重置技能特效的 Y 排序标记（本帧已被 2.5D 引擎排序渲染，避免重复绘制）
    if (this.game && this.game.effects && this.game.effects.effects) {
      for (const ef of this.game.effects.effects) {
        ef._ySorted = false
      }
    }
    // ══ 世界层（背景 + 实体）震屏包裹：命中/受击时整屏轻震，仅世界层、不动 HUD ══
    const _shake = (this.battleSystem && this.battleSystem._shake) || 0
    ctx.save()
    if (_shake > 0) {
      ctx.translate((Math.random() - 0.5) * 2 * _shake, (Math.random() - 0.5) * 2 * _shake)
    }
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
    ctx.restore()
    
    // 顶部UI
    this._renderTopUI(ctx)
    // ★ 副本目标 HUD（阳光草原）
    this._renderDungeonHUD(ctx)
    // ★ 副本：篝火安全区图标 + 叙事对话气泡
    if (this.areaInfo && this.areaInfo.isDungeon) this._renderSafeZones(ctx)
    if (this._dropFloaters && this._dropFloaters.length) this._renderDropFloaters(ctx)
    if (this.storyDialogue) this._renderStoryDialogue(ctx)
    
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

    // ★ 召回/解散按钮（角色信息卡片正下方，与卡片左对齐，视觉上形成一组）
    const recallBtnX = 20 * this.dpr
    const recallBtnY = (80 + 100 + 8) * this.dpr   // 卡片底部 y=80+100=180, 间距8
    const recallBtnW = 180 * this.dpr              // 与卡片等宽
    const recallBtnH = 40 * this.dpr               // 略矮于卡片，紧凑
    ctx.fillStyle = this.aiRecall ? 'rgba(255, 120, 120, 0.95)' : 'rgba(255, 255, 255, 0.92)'
    ctx.beginPath()
    this._roundRect(ctx, recallBtnX, recallBtnY, recallBtnW, recallBtnH, 10 * this.dpr)
    ctx.fill()
    ctx.strokeStyle = this.aiRecall ? 'rgba(220, 60, 60, 0.95)' : 'rgba(60, 120, 220, 0.9)'
    ctx.lineWidth = 3 * this.dpr
    ctx.stroke()
    ctx.font = `bold ${16 * this.dpr}px sans-serif`
    ctx.fillStyle = '#222222'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.aiRecall ? '📣 召回中' : '⚔ 解散', recallBtnX + recallBtnW / 2, recallBtnY + recallBtnH / 2)

    // 角色信息卡片（左上角，顶部UI下方）
    if (this.charInfoPanel && this.mainCharacter) {
      this.charInfoCardBounds = this.charInfoPanel.renderMiniCard(
        20 * this.dpr,  // 左边距
        80 * this.dpr  // 顶部UI下方
      )

      // 绘制角色切换按钮
      if (this.charInfoCardBounds) {
        const btnSize = 32 * this.dpr
        const btnX = this.charInfoCardBounds.x + this.charInfoCardBounds.width - btnSize - 8 * this.dpr
        const btnY = this.charInfoCardBounds.y + 8 * this.dpr

        // 记录按钮命中区域（供点击切换控制使用），仅在多英雄参战时生效
        // ★ 命中区扩大为卡片右上角整块（便于点击），圆形按钮仅作视觉提示
        const hitMarginX = 50 * this.dpr
        const hitMarginY = 50 * this.dpr
        this._charSwitchBtnBounds = {
          x: this.charInfoCardBounds.x + this.charInfoCardBounds.width - hitMarginX,
          y: this.charInfoCardBounds.y,
          width: hitMarginX,
          height: hitMarginY,
          enabled: !!(this.battleSystem && this.battleSystem.active &&
                      this.battleSystem.battleHeroes && this.battleSystem.battleHeroes.length > 1)
        }

        // 按钮背景（战斗中可切换时高亮，否则变灰）
        ctx.fillStyle = this._charSwitchBtnBounds.enabled ? 'rgba(74, 158, 255, 0.9)' : 'rgba(120, 120, 120, 0.6)'
        ctx.beginPath()
        ctx.arc(btnX + btnSize / 2, btnY + btnSize / 2, btnSize / 2, 0, Math.PI * 2)
        ctx.fill()

        // 切换图标
        ctx.font = `${18 * this.dpr}px sans-serif`
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
      const tipName = this.switchTipName || (this.mainCharacter && this.mainCharacter.name) || ''
      const tipText = `切换至 ${tipName}`
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

    // 调试：显示碰撞区域（临时开启用于排查问题）——已按需求关闭
    // this._renderObstacles(ctx)

    // ★ 世界血条/蓝条已改为按 2.5D Y 轴排序渲染（在 _renderYSortedEntities 中推入引擎），此处不再直接绘制

    // ★ 新增：渲染战斗UI
    if (this.battleSystem && this.battleSystem.showBattleUI) {
      this._renderBattleUI(ctx)
    }

    // ★ 投射物已改为按 2.5D Y 轴排序渲染（在 _renderYSortedEntities 中），此处不再重复绘制

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

    // ★ 新增：渲染雷击持续区域（区域底 + 落雷前黄色预警 + 落雷闪光）
    this._renderThunderZones(ctx)

    // ★ 新增：渲染 DNF 式固定目标面板（当前攻击怪物：头像 + 名字 + 血条 + 状态）
    if (this.battleSystem) {
      this._renderTargetPanel(ctx)
      this._renderCombo(ctx)
    }
    // ★ 副本通关遮罩（最上层）
    this._renderDungeonClear(ctx)
  }

  /**
   * ★ P2 连击计数 HUD：连续命中累计，断连窗口内超时清零（由 battleSystem.combo 驱动）
   * 至少 2 连才显示，避免平A常驻干扰；居中偏上，带渐变与缩放。
   */
  /**
   * ★ 渲染雷击持续区域：持续区域底 + 落雷前黄色预警 + 落雷闪光
   */
  _renderThunderZones(ctx) {
    const procs = this.battleSystem && this.battleSystem.skillProcesses
    if (!procs || procs.length === 0) return
    const dpr = this.dpr
    for (const p of procs) {
      if (p.type !== 'thunder') continue
      const sx = p.x - this.cameraX
      const sy = p.y - this.cameraY
      const r = p.radius
      const el = p._elapsed || 0
      ctx.save()
      // 1) 持续区域底（柔和琥珀色，弱脉动）
      const pulse = 0.08 + 0.04 * Math.sin(el * 4)
      ctx.fillStyle = `rgba(255, 200, 60, ${pulse})`
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
      ctx.setLineDash([10 * dpr, 8 * dpr])
      ctx.lineWidth = 2 * dpr
      ctx.strokeStyle = 'rgba(255, 200, 80, 0.45)'
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
      // 2) 落雷前黄色预警（强闪 + 收缩圈 + 十字准星）
      if (p._warning) {
        const nextTime = p._firstStrikeAt + p._strikeIndex * p.strikeInterval
        const remain = Math.max(0, nextTime - el)
        const prog = p.warnDuration > 0 ? 1 - remain / p.warnDuration : 1 // 0→1
        const blink = 0.4 + 0.5 * Math.abs(Math.sin(prog * Math.PI * 6))
        const curR = r * (1.0 - 0.25 * prog)
        ctx.fillStyle = `rgba(255, 225, 60, ${0.18 + 0.30 * prog})`
        ctx.beginPath(); ctx.arc(sx, sy, curR, 0, Math.PI * 2); ctx.fill()
        ctx.lineWidth = 3 * dpr
        ctx.strokeStyle = `rgba(255, 230, 70, ${blink})`
        ctx.beginPath(); ctx.arc(sx, sy, curR, 0, Math.PI * 2); ctx.stroke()
        ctx.strokeStyle = `rgba(255, 230, 70, ${blink})`
        ctx.lineWidth = 2 * dpr
        ctx.beginPath()
        ctx.moveTo(sx - curR, sy); ctx.lineTo(sx + curR, sy)
        ctx.moveTo(sx, sy - curR); ctx.lineTo(sx, sy + curR)
        ctx.stroke()
      }
      // 3) 落雷闪光残影（短暂全区域亮闪 + 放射闪电）
      if (p._flashTimer > 0) {
        const a = p._flashTimer / 0.18
        ctx.fillStyle = `rgba(255, 255, 200, ${0.5 * a})`
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = `rgba(255, 255, 180, ${0.9 * a})`
        ctx.lineWidth = 3 * dpr
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + 0.3
          const bx = sx + Math.cos(ang) * r * 0.7
          const by = sy + Math.sin(ang) * r * 0.7
          ctx.beginPath()
          ctx.moveTo(bx, by)
          ctx.lineTo(sx + (bx - sx) * 0.15, sy + (by - sy) * 0.15 - 10 * dpr)
          ctx.stroke()
        }
      }
      ctx.restore()
    }
  }

  _renderCombo(ctx) {
    const bs = this.battleSystem
    if (!bs || !bs.combo || bs.combo < 2) return
    const dpr = this.dpr
    const cx = this.width / 2
    const cy = 64 * dpr
    const n = bs.combo
    const scale = 1 + Math.min(0.5, (n - 2) * 0.035)
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 连击数（橙金渐变 + 描边增强可读性）
    const grad = ctx.createLinearGradient(cx - 60 * dpr, 0, cx + 60 * dpr, 0)
    grad.addColorStop(0, '#ffd36b')
    grad.addColorStop(1, '#ff7b3d')
    ctx.font = `bold ${Math.floor(36 * dpr * scale)}px sans-serif`
    ctx.lineWidth = 4 * dpr
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.strokeText(`${n}`, cx, cy)
    ctx.fillStyle = grad
    ctx.fillText(`${n}`, cx, cy)
    // COMBO 标签
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `bold ${Math.floor(13 * dpr)}px sans-serif`
    ctx.fillText('COMBO', cx, cy + 26 * dpr)
    ctx.restore()
  }

  /**
   * ★ 副本（阳光草原）目标 HUD：顶部居中显示"清剿进度 + 进度条"
   * 通关后（dungeonCleared）隐藏，避免与通关遮罩重叠。
   */
  _renderDungeonHUD(ctx) {
    if (!this.areaInfo || !this.areaInfo.isDungeon || this.dungeonCleared) return
    if (!this.mapMonsters) return
    const dpr = this.dpr
    const total = this.dungeonTotal || this.mapMonsters.length
    const alive = this.mapMonsters.filter(m => m.alive).length
    const killed = total - alive
    const ratio = total > 0 ? Math.max(0, Math.min(1, killed / total)) : 1

    // ★ 首领状态（阳光草原等副本含 Boss）
    const bossTotal = this.mapMonsters.filter(m => m.isBoss).length
    const bossAlive = this.mapMonsters.filter(m => m.isBoss && m.alive).length
    const bossDefeated = bossTotal > 0 && bossAlive === 0

    const w = Math.min(360 * dpr, this.width * 0.82)
    const x = (this.width - w) / 2
    const y = 16 * dpr
    const lineH = 17 * dpr
    const h = 34 * dpr + (bossTotal > 0 ? lineH : 0)
    ctx.save()
    // 背板
    ctx.fillStyle = 'rgba(0,0,0,0.42)'
    this._roundRect(ctx, x, y, w, h, 8 * dpr)
    ctx.fill()
    // 标题（清剿进度）
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${14 * dpr}px sans-serif`
    ctx.fillStyle = '#ffe9a8'
    ctx.fillText(`🗺️ 清剿进度  ${killed}/${total}`, x + w / 2, y + 12 * dpr)
    // 进度条
    const barX = x + 14 * dpr
    const barY = y + h - 11 * dpr
    const barW = w - 28 * dpr
    const barH = 7 * dpr
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    this._roundRect(ctx, barX, barY, barW, barH, 3 * dpr)
    ctx.fill()
    ctx.fillStyle = '#4caf50'
    this._roundRect(ctx, barX, barY, Math.max(barH, barW * ratio), barH, 3 * dpr)
    ctx.fill()
    // 首领状态行 + 专属血条
    if (bossTotal > 0) {
      const boss = this.mapMonsters.find(m => m.isBoss)
      const bossAlive = boss && boss.alive
      ctx.font = `bold ${13 * dpr}px sans-serif`
      ctx.fillStyle = bossDefeated ? '#7cff7c' : '#ff8a8a'
      ctx.fillText(bossDefeated ? `👑 首领已击败` : `👑 ${this.bossDisplayName || '首领'}`, x + w / 2, y + 26 * dpr)
      // 首领血条（存活时，恒显于 HUD 下方，便于掌握 Boss 战进度）
      if (bossAlive && boss.maxHp) {
        const bw = w - 28 * dpr
        const bx = x + 14 * dpr
        const by = y + h + 6 * dpr
        const bh = 7 * dpr
        const ratio = Math.max(0, Math.min(1, boss.hp / boss.maxHp))
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        this._roundRect(ctx, bx, by, bw, bh, 3 * dpr)
        ctx.fill()
        ctx.fillStyle = ratio > 0.3 ? '#ff5b5b' : '#ff2d2d'
        this._roundRect(ctx, bx, by, Math.max(bh, bw * ratio), bh, 3 * dpr)
        ctx.fill()
      }
    }
    ctx.restore()

    // ★ 接近首领提示（仅在首领存活时）
    if (!bossDefeated && this.playerX != null) {
      const boss = this.mapMonsters.find(m => m.isBoss && m.alive)
      if (boss) {
        const dx = this.playerX - boss.x
        const dy = this.playerY - boss.y
        if (Math.sqrt(dx * dx + dy * dy) < 300 * dpr) {
          ctx.save()
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.font = `bold ${16 * dpr}px sans-serif`
          ctx.fillStyle = 'rgba(255,90,90,0.95)'
          ctx.fillText(`⚔️ ${boss.name || '首领'}就在附近！`, this.width / 2, this.height - 120 * dpr)
          ctx.restore()
        }
      }
    }
  }

  /** 篝火安全区图标（世界坐标，转屏幕后绘制光圈 + 🔥 + 名称） */
  _renderSafeZones(ctx) {
    if (!this.safeZones || !this.safeZones.length) return
    const dpr = this.dpr
    for (const z of this.safeZones) {
      const sx = z.x - this.cameraX
      const sy = z.y - this.cameraY
      if (sx < -220 || sy < -220 || sx > this.width + 220 || sy > this.height + 220) continue
      // 暖色光圈
      ctx.save()
      ctx.globalAlpha = 0.22
      ctx.fillStyle = '#ff8c42'
      ctx.beginPath()
      ctx.arc(sx, sy, z.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      // 篝火图标
      ctx.font = `${40 * dpr}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🔥', sx, sy)
      // 名称
      ctx.font = `${13 * dpr}px sans-serif`
      ctx.fillStyle = '#fff'
      ctx.fillText(z.name, sx, sy + 40 * dpr)
    }
  }

  /** 顶部叙事对话气泡（自动播放，不阻塞操作） */
  _renderStoryDialogue(ctx) {
    const d = this.storyDialogue
    if (!d) return
    const dpr = this.dpr
    const line = d.lines[d.index] || ''
    const boxW = Math.min(580 * dpr, this.width * 0.92)
    const boxH = 92 * dpr
    const x = (this.width - boxW) / 2
    const y = 64 * dpr
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    this._roundRect(ctx, x, y, boxW, boxH, 12 * dpr)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,233,168,0.85)'
    ctx.lineWidth = 2 * dpr
    this._roundRect(ctx, x, y, boxW, boxH, 12 * dpr)
    ctx.stroke()
    // 说话者
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = `bold ${15 * dpr}px sans-serif`
    ctx.fillStyle = '#ffe9a8'
    ctx.fillText(`${d.name}：`, x + 18 * dpr, y + 14 * dpr)
    // 内容（单行，过长截断）
    ctx.font = `${15 * dpr}px sans-serif`
    ctx.fillStyle = '#fff'
    const text = line.length > 30 ? line.slice(0, 30) + '…' : line
    ctx.fillText(text, x + 18 * dpr, y + 46 * dpr)
    // 进度
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = `${12 * dpr}px sans-serif`
    ctx.fillText(`${d.index + 1}/${d.lines.length}`, x + boxW - 14 * dpr, y + boxH - 22 * dpr)
    ctx.restore()
  }

  /**
   * ★ 副本通关检测
   * - 未通关：所有怪物 alive=false → 标记通关、发金币奖励、切胜利BGM、弹遮罩、清怪物存档（可重复挑战）
   * - 已通关：倒计时 dungeonClearTimer，到点自动返回城镇
   */
  _checkDungeonClear(dt) {
    if (!this.areaInfo || !this.areaInfo.isDungeon) return
    if (this.dungeonCleared) {
      this.dungeonClearTimer -= dt
      if (this.dungeonClearTimer <= 0 && !this._returningToTown) {
        this._returningToTown = true
        this.game.changeScene('town')
      }
      return
    }
    if (!this.mapMonsters || this.mapMonsters.length === 0) return
    const alive = this.mapMonsters.filter(m => m.alive).length
    if (alive === 0) {
      this.dungeonCleared = true
      this.showDungeonClear = true
      this.dungeonClearTimer = 3.5
      // 奖励：金币（统一走 'gold' 字段，HUD / 击杀 / 战斗奖励均读取它；
      // 原 'coins' 字段为孤儿，无人读取，会导致通关奖励丢失）
      const reward = (GRASSLAND_DUNGEON.clearReward && GRASSLAND_DUNGEON.clearReward.coins) ?? (this.dungeonReward || 80)
      this._addGold(reward)
      this.game.data.set(`dungeon_cleared_${this.areaId}`, true)
      // ★ 通关解锁角色（GDD：第一章通关解锁艾米）。仅阳光草原触发本配置的解锁。
      if (this.areaId === 'grassland' && GRASSLAND_DUNGEON.clearReward && GRASSLAND_DUNGEON.clearReward.unlocks) {
        for (const hid of GRASSLAND_DUNGEON.clearReward.unlocks) {
          const ok = charStateManager.unlockCharacter(hid)
          if (ok && this.game.showToast) this.game.showToast(`✨ ${hid} 加入队伍！`)
          console.log(`[Field] 副本通关解锁角色: ${hid} (${ok ? '成功' : '已存在'})`)
        }
      }
      // 清掉怪物存档，下次进入重新生成（可重复挑战）
      this.game.data.set(`fieldMonsters_${this.areaId}`, null)
      // 切换胜利 BGM + 金币音效（兼容测试 mock：方法可能不存在）
      const a = this.game.audio
      if (a) {
        if (typeof a.stopBGM === 'function') a.stopBGM()
        if (typeof a.playBGM === 'function') a.playBGM('bgm_victory')
        if (typeof a.playSFX === 'function') a.playSFX('reward_coin')
      }
    }
  }

  /**
   * ★ 副本通关遮罩（最上层绘制）
   * 半透明黑底 + 居中面板：标题 / 战果 / 奖励 / 返回提示
   */
  _renderDungeonClear(ctx) {
    if (!this.showDungeonClear) return
    const dpr = this.dpr
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, this.width, this.height)

    const pw = Math.min(420 * dpr, this.width * 0.86)
    const ph = 240 * dpr
    const px = (this.width - pw) / 2
    const py = (this.height - ph) / 2
    const grad = ctx.createLinearGradient(0, py, 0, py + ph)
    grad.addColorStop(0, '#2d5a2d')
    grad.addColorStop(1, '#16331a')
    ctx.fillStyle = grad
    this._roundRect(ctx, px, py, pw, ph, 16 * dpr)
    ctx.fill()
    ctx.strokeStyle = '#ffd36b'
    ctx.lineWidth = 3 * dpr
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 标题
    ctx.fillStyle = '#ffe9a8'
    ctx.font = `bold ${26 * dpr}px sans-serif`
    ctx.fillText('🎉 副本通关！', this.width / 2, py + 50 * dpr)
    // 战果
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${16 * dpr}px sans-serif`
    ctx.fillText('清剿了阳光草原的所有敌人', this.width / 2, py + 96 * dpr)
    // 奖励
    ctx.fillStyle = '#ffd36b'
    ctx.font = `bold ${21 * dpr}px sans-serif`
    ctx.fillText(`💰 获得金币 +${this.dungeonReward || 80}`, this.width / 2, py + 142 * dpr)
    // 提示
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.font = `${14 * dpr}px sans-serif`
    const sec = Math.max(0, Math.ceil(this.dungeonClearTimer))
    ctx.fillText(`点击任意处 / ${sec}s 后返回城镇`, this.width / 2, py + 188 * dpr)
    ctx.restore()
  }

  /**
   * ★ DNF 式固定目标面板：展示当前攻击的怪物
   * 位置：召回/解散按钮正下方（与角色卡片、按钮左对齐、等宽）
   * 布局（紧凑横向）：
   *   第1行：[小图标] 怪物名  Lv.x
   *   第2行：[========HP条========]  120/150
   *   第3行：[状态1] [状态2] ...
   */
  _renderTargetPanel(ctx) {
    const bs = this.battleSystem
    if (!bs) return
    // ★ 面板目标必须从"当前区域的活怪列表(mapMonsters)"里取，杜绝游离引用
    //   （_lastDamagedMonster / battleTarget 可能残留上一场战斗已销毁的旧怪物对象，
    //    其 hp 字段可能已被清理 → 导致 curHp.toFixed 崩溃）
    //   策略：优先 _lastDamagedMonster（真正挨打的怪），其次 battleTarget，
    //   但都必须能在 mapMonsters 里找到且 alive && hp > 0 才用
    const liveList = (this.mapMonsters || []).filter(m => m && m.alive && typeof m.hp === 'number' && m.hp > 0)
    const findLive = (ref) => {
      if (!ref || !ref.id) return null
      return liveList.find(m => m.id === ref.id) || null
    }
    let target = findLive(bs._lastDamagedMonster)
    if (!target) target = findLive(bs.battleTarget)
    if (!target) return
    const dpr = this.dpr

    // ── 血条平滑动画（DNF 式双层延迟扣血效果）──
    const hpMax = (typeof target.maxHp === 'number' && target.maxHp > 0) ? target.maxHp : (target.hp > 0 ? target.hp : 1)
    if (!this._tpLastT) this._tpLastT = Date.now()
    const nowT = Date.now()
    let dt = (nowT - this._tpLastT) / 1000
    if (dt < 0) dt = 0
    if (dt > 0.1) dt = 0.1
    this._tpLastT = nowT
    // 回落速度：每秒追回 4% 满血（红边停留约2.5秒）
    const LAG_SPEED = hpMax * 0.04
    // ★ 按 id 字典存 lag，每只怪独立维护、永不清除：
    //   即使面板每帧在不同怪间切换（多怪混战），每只怪的 lag 记录都保留。
    //   当面板切到"刚被打的那只"时，它的 lag 已从上次受伤的高位开始追 → 红边必现
    if (!this._targetPanelLagMap) this._targetPanelLagMap = {}
    const lagKey = (target.id != null) ? target.id : '__cur__'
    const curHp = target.hp
    // ★ _preDamageHp：扣血前记录的旧血量（_damageMonster / _playerAttackMonster 写入）
    const preDmg = (typeof target._preDamageHp === 'number') ? target._preDamageHp : null
    // ★ 残影效果：与角色血条 drawBar 完全一致的逻辑（已验证能正常工作）
    //   用 ratio（0~1比例值）而非绝对 hp 值存储 lag，避免 curHp>=lag 吞掉残影
    const realRatio = Math.max(0, Math.min(1, target.hp / hpMax))
    let lagRatio = this._targetPanelLagMap[lagKey]
    if (typeof lagRatio !== 'number' || lagRatio < realRatio) {
      // 首次或 lag 落后于真实血量：如果有受伤记录(_preDamageHp > hp)，从 preDmg 的 ratio 起步
      if (preDmg != null && preDmg > target.hp) {
        lagRatio = Math.max(realRatio, Math.min(1, preDmg / hpMax))
      } else {
        lagRatio = realRatio
      }
    } else {
      // lag 高于真实血量：缓慢追回（每秒追回 20% 满血，和角色血条一致）
      lagRatio = Math.max(realRatio, lagRatio - 0.2 * dt)
    }
    this._targetPanelLagMap[lagKey] = lagRatio

    // 面板位置：召回/解散按钮正下方（与角色卡片、按钮左对齐、等宽）
    const panelX = 20 * dpr
    const panelY = (80 + 100 + 8 + 40 + 8) * dpr   // 卡片(80+100) + 按钮间距8 + 按钮高40 + 间距8
    const panelW = 180 * dpr
    const rowH = 22 * dpr                           // 每行高度
    const pad = 6 * dpr                              // 内边距
    const panelH = (pad * 2 + rowH * 3 + 6 * dpr)   // 3行 + 行间距

    ctx.save()

    // 面板背景（半透明深色卡片）
    ctx.fillStyle = 'rgba(18, 20, 28, 0.85)'
    this._roundRect(ctx, panelX, panelY, panelW, panelH, 8 * dpr)
    ctx.fill()
    // 顶部高亮边线（类似 DNF 目标框的强调色）
    ctx.fillStyle = 'rgba(255, 80, 80, 0.9)'
    ctx.beginPath()
    ctx.moveTo(panelX + 8 * dpr, panelY)
    ctx.lineTo(panelX + panelW - 8 * dpr, panelY)
    ctx.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + 3 * dpr)
    ctx.lineTo(panelX + panelW, panelY + 3 * dpr)
    ctx.lineTo(panelX, panelY + 3 * dpr)
    ctx.lineTo(panelX, panelY + 3 * dpr)
    ctx.quadraticCurveTo(panelX, panelY, panelX + 8 * dpr, panelY)
    ctx.closePath()
    ctx.fill()
    // 外边框
    ctx.strokeStyle = 'rgba(255, 200, 90, 0.7)'
    ctx.lineWidth = 1.5 * dpr
    ctx.strokeRect(panelX, panelY, panelW, panelH)

    // ── 第1行：小图标 + 名字 + 等级 ──
    const iconSz = 18 * dpr
    const y1 = panelY + pad
    // ★ 头像 key 修正：使用 assetPrefix 大写格式（与 asset-manager 注册一致）
    //   enemyId → assetPrefix 映射表（与 character-sprite._autoDetectPrefix 一致）
    const prefixMap = {
      slime_cat: 'SLIME_CAT', shadow_mouse: 'SHADOW_MOUSE', wild_cat: 'SLIME_CAT',
      lost_healer_cat: 'LOST_HEALER_CAT', flame_slime: 'FLAME_SLIME',
      aqua_slime: 'AQUA_SLIME', violet_slime: 'VIOLET_SLIME',
      shadow_mouse_smooth: 'SHADOW_MOUSE'
    }
    const assetPrefix = prefixMap[target.enemyId] || null
    const iconKey = assetPrefix ? (assetPrefix + '_WALK_01') : null
    const iconImg = iconKey && this.game && this.game.assets ? this.game.assets.get(iconKey) : null
    if (iconImg) {
      ctx.drawImage(iconImg, panelX + pad, y1 + (rowH - iconSz) / 2, iconSz, iconSz)
    } else {
      const icon = target.isBoss ? '👹' : (target.isElite ? '👿' : '🐱')
      ctx.font = `${iconSz}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(icon, panelX + pad, y1 + rowH / 2)
    }
    // 名字
    const nameX = panelX + pad + iconSz + 4 * dpr
    const nameMaxW = panelW - (nameX - panelX) - pad - 35 * dpr   // 给等级留空间
    ctx.font = `bold ${13 * dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    let nameText = target.name || '怪物'
    if (ctx.measureText(nameText).width > nameMaxW) {
      while (ctx.measureText(nameText + '..').width > nameMaxW && nameText.length > 1) nameText = nameText.slice(0, -1)
      nameText += '..'
    }
    ctx.fillText(nameText, nameX, y1 + rowH / 2)
    // 等级（右侧对齐）
    if (target.level != null) {
      ctx.font = `bold ${11 * dpr}px sans-serif`
      ctx.fillStyle = '#ffd700'
      ctx.textAlign = 'right'
      ctx.fillText(`Lv.${target.level}`, panelX + panelW - pad, y1 + rowH / 2)
    }

    // ── 第2行：血条（带平滑动画）+ HP数字 ──
    const barY = panelY + pad + rowH + 3 * dpr
    const barH = 14 * dpr
    const barX = panelX + pad
    const barW = panelW - pad * 2
    // 血条背景槽
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    this._roundRect(ctx, barX, barY, barW, barH, 3 * dpr)
    ctx.fill()
    // HP填充（扣血追赶双层：红色"残影" + 亮绿"当前血"）
    //   realRatio / lagRatio 已在上面用 ratio 方式计算完成
    // 1) 先画满条红色残影（0~lagRatio）
    if (lagRatio > 0.001) {
      ctx.fillStyle = '#ff2222'
      ctx.fillRect(barX, barY, barW * lagRatio, barH)
    }
    // 2) 再画绿色真实血量（0~realRatio），盖在红色上面 → 右侧露出红边
    if (realRatio > 0) {
      ctx.fillStyle = '#2ed573'
      ctx.fillRect(barX, barY, barW * realRatio, barH)
    }
    // 血条边框
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 0.8 * dpr
    ctx.strokeRect(barX, barY, barW, barH)
    // HP 数字（显示真实 HP，右下角叠在血条上）
    ctx.font = `${9 * dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 2 * dpr
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
    ctx.fillText(`${Math.ceil(target.hp)}/${target.maxHp}`, barX + barW - 2 * dpr, barY + barH - 1 * dpr)
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0

    // ── 第3行：异常/增益状态图标 ──
    // 过滤：剩余时间 > 0（_active 非必须，兼容不同写入方式）
    const effects = (target.statusEffects || []).filter(e => (e._remaining != null ? e._remaining : e.duration) > 0)
    if (effects.length > 0) {
      const effSz = 16 * dpr
      const effY = panelY + pad + rowH * 2 + 6 * dpr
      let ix = panelX + pad
      const metaMap = (this.battleSystem && this.battleSystem.STATUS_META) || {}
      effects.slice(0, 8).forEach((e) => {
        const meta = metaMap[e.type] || {}
        let color = e._color || meta.color || '#ffffff'
        // 容错：若不是合法颜色（如 hex 无括号），直接用作底色；rgba 则降透明度
        let fill = color
        if (typeof color === 'string' && color.indexOf('rgba') === 0) {
          fill = color.replace(/[\d.]+\)$/, '0.75)')
        }
        // 图标底色块
        ctx.fillStyle = fill
        this._roundRect(ctx, ix, effY, effSz, effSz, 3 * dpr)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.65)'
        ctx.lineWidth = 0.8 * dpr
        ctx.strokeRect(ix, effY, effSz, effSz)
        // 状态首字标识（用中文状态名首字，避免纯数字难辨）
        const label = (meta.name && meta.name[0]) || (e.type && e.type[0]) || '?'
        ctx.font = `bold ${9 * dpr}px sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, ix + effSz / 2, effY + effSz / 2 - 5 * dpr)
        // 剩余秒数（底部小字）
        ctx.font = `${7 * dpr}px sans-serif`
        ctx.fillText(String(Math.ceil(e._remaining || e.duration || 0)), ix + effSz / 2, effY + effSz / 2 + 5 * dpr)
        ix += effSz + 3 * dpr
        if (ix + effSz > panelX + panelW - pad) return   // 超出宽度则停止
      })
    }

    ctx.restore()
  }

  /**
   * ★ 渲染世界血条/蓝条（主角+所有跟随队友），非战斗也始终显示
   * 与战斗系统 battleHeroes 解耦，直接读取 party / followers 的实时世界坐标
   */
  _renderWorldHealthBars(ctx) {
    if (!this.party || !this.party.length) return

    // ── ★ 扣血追赶动画：真实墙钟时间驱动帧间隔（防帧率波动/切后台跳变）──
    const nowT = Date.now()
    if (!this._whbLastT) this._whbLastT = nowT
    let frameDt = (nowT - this._whbLastT) / 1000
    this._whbLastT = nowT
    if (frameDt < 0) frameDt = 0
    if (frameDt > 0.1) frameDt = 0.1
    if (!this._heroHpLagMap) this._heroHpLagMap = {}

    // ★ 改为按 2.5D Y 轴排序渲染：把血条/蓝条作为独立实体推入引擎，
    //   与角色/怪物同 layer(2)、同锚点(中心Y) 参与深度排序，前排角色正确遮挡后排血条
    const drawBar = (wx, wy, hero, isControlled, lagKey) => {
      // 扣血追赶残影值：每帧在推入前计算一次（渲染时直接取用，避免深度排序后时序错乱）
      const hpRatio = Math.max(0, (hero.hp || 0) / (hero.maxHp || 1))
      let lagRatio = this._heroHpLagMap[lagKey]
      if (typeof lagRatio !== 'number' || lagRatio < hpRatio) lagRatio = hpRatio
      else lagRatio = Math.max(hpRatio, lagRatio - 0.2 * frameDt)   // 每秒追回 20% 满血
      this._heroHpLagMap[lagKey] = lagRatio

      this._renderer2d5.addEntity({
        layer: 2,
        sortY: wy / this.dpr,   // ★ 与角色实体同锚点(中心Y)，同 layer 参与 2.5D 深度排序
        type: 'heroHealthBar',
        render: (ctx) => {
          const screenX = wx - this.cameraX
          const screenY = wy - this.cameraY
          const barWidth = 60 * this.dpr
          const barHeight = 6 * this.dpr
          const barX = screenX - barWidth / 2
          const barY = screenY - 50 * this.dpr

          // HP 背景
          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          ctx.fillRect(barX, barY, barWidth, barHeight)

          if (lagRatio > hpRatio) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
            ctx.fillRect(barX, barY, barWidth * lagRatio, barHeight)
          }

          ctx.fillStyle = hpRatio > 0.5 ? '#2ed573' : (hpRatio > 0.25 ? '#ffa502' : '#ff4757')
          ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight)

          // HP 边框
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1
          ctx.strokeRect(barX, barY, barWidth, barHeight)

          // ★ 护盾条（英雄联盟式白色护盾）：紧贴 HP 条上方显示
          if (hero._shield && hero._shield > 0) {
            const shMax = hero._shieldMax || hero._shield
            const shRatio = Math.max(0, Math.min(1, hero._shield / (shMax || 1)))
            const shY = barY - barHeight - 3 * this.dpr
            ctx.fillStyle = 'rgba(0,0,0,0.6)'
            ctx.fillRect(barX, shY, barWidth, barHeight)
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(barX, shY, barWidth * shRatio, barHeight)
            ctx.strokeStyle = '#8ec5ff'
            ctx.lineWidth = 2
            ctx.strokeRect(barX + 0.5, shY + 0.5, barWidth - 1, barHeight - 1)
          }

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
      })
    }

    // 主角坐标（战斗中可能非被控者，但始终用真实位置）
    const mainPos = (this._heroWorldPos && this._heroWorldPos[0])
      ? this._heroWorldPos[0]
      : { x: this.playerX, y: this.playerY }
    const ctrlIdx = (this.battleSystem && this.battleSystem.battleHeroes && this.battleSystem.battleHeroes[0])
      ? this.battleSystem.battleHeroes[0].partyIndex : 0
    // ★ 战斗中阵亡的角色不显示血条
    if (!(this.battleSystem && this.battleSystem.active && this.party[0] && this.party[0].hp <= 0)) {
      drawBar(mainPos.x, mainPos.y, this.party[0], ctrlIdx === 0, 'main')
    }

    // 跟随队友
    if (this.followers && Array.isArray(this.followers)) {
      for (let i = 0; i < this.followers.length; i++) {
        const f = this.followers[i]
        if (!f || !f.character) continue
        // ★ 战斗中阵亡的队友不显示血条
        if (this.battleSystem && this.battleSystem.active && f.character.hp <= 0) continue
        const fPos = (this._heroWorldPos && this._heroWorldPos[i + 1]) ? this._heroWorldPos[i + 1] : { x: f.x, y: f.y }
        drawBar(fPos.x, fPos.y, f.character, ctrlIdx === (i + 1), 'f' + i)
      }
    }

    // ★ BUFF 脚底光环与生效冲击波已改为按 2.5D Y 轴排序渲染（在 _renderYSortedEntities 中），
    //   与角色/怪物同级，前端角色可正确遮挡，此处不再重复绘制
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
        // ★ 队友受击泛红（探索状态理论无受击，_hurtFlash 默认 0 不绘制，战斗路径已覆盖）
        this._renderHeroHurtFlash(ctx, screenX, screenY, follower.character, this.dpr)
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
    // ★ 队友受击泛红
    this._renderHeroHurtFlash(ctx, screenX, screenY, follower.character, this.dpr)
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
        // ★ blade_storm 用状态机指定的自定义帧（pa.frame，如 02/03/07）
        const idx = pa.frame ? (pa.frame % 8) : (atkFrameBase % 8) + 1
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
      const useCatAnim = ['slime_cat', 'shadow_mouse', 'wild_cat', 'lost_healer_cat', 'flame_slime', 'aqua_slime', 'violet_slime', 'shadow_mouse_smooth'].includes(monster.enemyId)

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
      // 配置不存在，降级到稳定占位（不闪 emoji）
      this._renderCatPlaceholder(ctx, monster, screenX, screenY, enemyConfig)
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
        this._renderCatPlaceholder(ctx, monster, screenX, screenY, enemyConfig)
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
      // ★ 防御性回退：某帧缺失时，优先回退到「同动作首帧 → idle 首帧 → walk 首帧」，
      //   保证怪物始终有精灵绘制，而不是整只闪成 emoji（flicker 根因：个别帧缺失 / 运行期未加载）。
      frameImg = this._tryFallbackFrame(monster, enemyConfig, animType, animConf)
    }
    if (!frameImg) {
      // 全部回退仍失败：资源确实缺失，降级为稳定占位（不闪 emoji，每种 animType 只告警一次，附完整状态便于定位）
      if (!monster._warnedFrames) monster._warnedFrames = {}
      if (!monster._warnedFrames[animType]) {
        monster._warnedFrames[animType] = true
        console.warn(`[Field][placeholder] 怪物 ${monster.enemyId} 动画帧缺失: ${frameKey} ` +
          `(animType=${animType}, animFrame=${monster.animFrame}, isMoving=${monster.isMoving}, ` +
          `isCastingSkill=${!!monster.isCastingSkill}, isAttacking=${!!monster.isAttacking})`)
      }
      this._renderCatPlaceholder(ctx, monster, screenX, screenY, enemyConfig)
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
        // ★ 战斗兜底朝向：用「怪物相对玩家水平位置」决定，但加滞回死区，
        //   避免怪物绕圈到玩家正上/正下方（水平偏移≈0）时朝向每帧左右翻转（抖动）。
        //   relX>0 表示怪物在玩家右侧 → 朝右（facingLeft=false）；
        //   仅当 |relX| 超过死区才更新朝向，否则保持上一帧。
        const relX = monster.x - this.playerX
        const faceDead = 10 * this.dpr
        if (relX > faceDead) {
          facingLeft = false
        } else if (relX < -faceDead) {
          facingLeft = true
        } else {
          facingLeft = (monster.facingLeft !== undefined) ? monster.facingLeft : ((this.playerX - monster.x) < 0)
        }
      } else {
        facingLeft = Math.cos(monster.moveAngle) < 0
      }
      monster.facingLeft = facingLeft
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

      // ★ 隐身(暗影突袭)：怪物半透明呈现，玩家可感知但仍不可被选中
      if (monster._invisible) ctx.globalAlpha = 0.22

      // ★ 光明冲锋蓄力：全身能量聚集特效（金色光环 + 上升粒子 + 聚拢环），随蓄力强度增强
      if (monster._energyCharge) {
        this._renderEnergyCharge(ctx, screenX, screenY, targetHeight, monster._energyIntensity || 0)
      }

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
          idle: { start: 1, end: 7, path: 'subpackages/battle/images/characters_anim/transparent/slime_cat/idle/', framePad: 1, frameDuration: 150 },
          walk: { start: 1, end: 12, path: 'subpackages/battle/images/characters_anim/transparent/slime_cat/walk/', framePad: 2, frameDuration: 120 },
          attack: { start: 8, end: 22, path: 'subpackages/battle/images/characters_anim/transparent/slime_cat/attack/', frameList: [8, 10, 12, 14, 16, 18, 20, 22], framePad: 4, frameDuration: 100 },
          hurt: { start: 1, end: 2, path: 'subpackages/battle/images/characters_anim/transparent/slime_cat/hurt/', framePad: 1, frameDuration: 80 },
          death: { start: 1, end: 6, path: 'subpackages/battle/images/characters_anim/transparent/slime_cat/death/', framePad: 2, frameDuration: 120 },
          skill: { start: 50, end: 80, path: 'subpackages/battle/images/characters_anim/transparent/slime_cat/skill/', frameList: [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80], framePad: 4, frameDuration: 100 }
        },
        renderConfig: {
          targetHeight: 80
        }
      },
      'shadow_mouse': {
        animationConfig: {
          idle: { start: 1, end: 6, path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/idle/', framePad: 2, frameDuration: 150 },
          walk: { start: 1, end: 8, path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/walk/', framePad: 2, frameDuration: 100 },
          attack: { start: 1, end: 7, path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/attack/', framePad: 2, frameDuration: 80 },
          hurt: { start: 1, end: 2, path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/hurt/', framePad: 2, frameDuration: 80 },
          death: { start: 1, end: 6, path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/death/', framePad: 2, frameDuration: 120 },
          skill: { start: 1, end: 8, path: 'subpackages/battle/images/characters_anim/transparent/shadow_mouse/skill/', framePad: 2, frameDuration: 100 }
        },
        renderConfig: {
          targetHeight: 80
        }
      },
      'wild_cat': {
        // 复用史莱姆猫的资源
        animationConfig: {
          idle: { start: 1, end: 7, path: 'subpackages/battle/images/characters_anim/transparent/slime_cat/idle/', framePad: 1, frameDuration: 150 },
          walk: { start: 1, end: 12, path: 'subpackages/battle/images/characters_anim/transparent/slime_cat/walk/', framePad: 2, frameDuration: 120 }
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
   * 动画帧缺失时的防御性回退：依次尝试「同动作首帧 → idle 首帧 → walk 首帧」，
   * 返回首个在 game.assets 中存在的图片；全部缺失则返回 null。
   * 目的：个别帧缺失/运行期未加载时，怪物仍绘制一个有效精灵，避免整只闪成 emoji。
   */
  _tryFallbackFrame(monster, enemyConfig, animType, animConf) {
    const cands = []
    if (animConf) {
      if (animConf.frameList) cands.push([animType, animConf.frameList[0], animConf.framePad])
      else if (animConf.start != null) cands.push([animType, animConf.start, animConf.framePad])
    }
    const ac = enemyConfig && enemyConfig.animationConfig
    if (ac) {
      if (animType !== 'idle' && ac.idle) cands.push(['idle', ac.idle.start, ac.idle.framePad])
      if (animType !== 'walk' && ac.walk) cands.push(['walk', ac.walk.start, ac.walk.framePad])
    }
    for (const [at, fi, fp] of cands) {
      const k = this._buildFrameKey(monster.enemyId, at, fi, fp)
      const img = this.game.assets.get(k)
      if (img) return img
    }
    return null
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
   * 猫咪怪物资源缺失时的「稳定占位」渲染（替代 emoji，杜绝一闪一闪的抖动观感）。
   * 画一个稳定的纯色圆 + 名称；真正的精灵会在资源进入运行包后自动恢复。
   * 缺失的精确 key 由调用方此前打印的 [Field][placeholder] 日志给出，便于定位。
   */
  _renderCatPlaceholder(ctx, monster, screenX, screenY, enemyConfig) {
    const bob = Math.sin(this.time * monster.bobSpeed + monster.bobOffset) * 4 * this.dpr
    const r = (enemyConfig?.renderConfig?.targetHeight || 80) * this.dpr * 0.4
    // 底部阴影
    ctx.beginPath()
    ctx.ellipse(screenX, screenY + r + 6 * this.dpr, r * 0.8, 6 * this.dpr, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fill()
    // 主体圆（优先用配置色，否则默认史莱姆绿）
    const color = enemyConfig?.renderConfig?.color || '#7ED957'
    ctx.beginPath()
    ctx.arc(screenX, screenY + bob, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = 2 * this.dpr
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.stroke()
    // 名称
    ctx.font = `${12 * this.dpr}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(monster.name, screenX, screenY + r + 22 * this.dpr)
  }

  /**
   * 渲染怪物警告指示器
   */
  /**
   * ★ 英雄眩晕指示：头顶旋转星星 + 轻微暗化，提示"被击飞落地后眩晕1秒"
   *   (screenX, screenY) 为该英雄精灵的渲染锚点（脚下中心）
   */
  _renderHeroStun(ctx, screenX, screenY) {
    const t = this.time || 0
    ctx.save()
    // 头顶微弱暗化光环
    ctx.beginPath()
    ctx.arc(screenX, screenY - 70 * this.dpr, 26 * this.dpr, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(120, 120, 160, 0.18)'
    ctx.fill()
    // 3 颗旋转星星（💫 风格的手绘多角星）
    const starCount = 3
    for (let i = 0; i < starCount; i++) {
      const ang = t * 3 + (i * Math.PI * 2 / starCount)
      const orbitR = 16 * this.dpr
      const sx = screenX + Math.cos(ang) * orbitR
      const sy = screenY - 80 * this.dpr + Math.sin(ang) * orbitR * 0.5
      this._drawStar(ctx, sx, sy, 5 * this.dpr, '#FFE66D')
    }
    ctx.restore()
  }

  // ★ 英雄受击泛红：身体瞬间罩一层半透明红覆盖（与怪物受击闪白同一椭圆思路）
  //   hero._hurtFlash 由战斗系统 _applyHeroDamage/_dealMonsterDamage 置 1，并在 _updateBattleSystem 递减。
  //   (x, y) 为角色脚底屏幕坐标（与 sprite.render 同一锚点）。
  _renderHeroHurtFlash(ctx, x, y, hero, dpr) {
    if (!hero || !hero._hurtFlash || hero._hurtFlash <= 0) return
    const th = 120 * dpr
    ctx.save()
    ctx.globalAlpha = Math.min(0.7, hero._hurtFlash * 0.85)
    ctx.fillStyle = '#ff2a2a'
    ctx.beginPath()
    ctx.ellipse(x, y - th * 0.45, th * 0.42, th * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  _drawStar(ctx, cx, cy, r, color) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5)
      const a2 = a + Math.PI / 5
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45)
    }
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,180,40,0.9)'
    ctx.lineWidth = 1 * this.dpr
    ctx.stroke()
    ctx.restore()
  }

  /**
   * ★ 霸体技能视觉特效：英雄/怪物施放霸体(superArmor)技能期间，在身周绘制金色/红色
   *   护盾光环 + 旋转碎片 + 头顶「霸体」盾牌标记，直观提示"本次施法不可被打断"。
   *   (screenX, screenY) 为实体脚底屏幕坐标；isMonster=true 用红色（敌方霸体大招）。
   */
  _renderSuperArmorAura(ctx, screenX, screenY, isMonster) {
    const t = this.time || 0
    const dpr = this.dpr || 1
    const pulse = 0.5 + 0.5 * Math.sin(t * 6)
    const bodyH = 80 * dpr
    const cx = screenX
    // ★ 注意：传入的 screenX/screenY 已是实体「中心」锚点
    //   （CharacterSprite 与怪物均按中心绘制：footY = screenY + targetHeight/2），
    //   故光环以身体中心为基准，脚底 = 中心 + 半身高（旧代码误把 screenY 当脚底，整体偏上约半身高）
    const cy = screenY
    const feetY = screenY + bodyH * 0.5
    const main = isMonster ? '255,72,72' : '255,196,64'   // 英雄=金，怪物=红
    const sub = isMonster ? '255,150,96' : '77,208,225'   // 副色
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    // 1) 全身柔光
    const glowR = bodyH * 0.9
    const grad = ctx.createRadialGradient(cx, cy, glowR * 0.1, cx, cy, glowR)
    grad.addColorStop(0, 'rgba(' + main + ',' + (0.10 + 0.10 * pulse) + ')')
    grad.addColorStop(0.7, 'rgba(' + main + ',' + (0.05 + 0.05 * pulse) + ')')
    grad.addColorStop(1, 'rgba(' + main + ',0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
    ctx.fill()

    // 2) 脚底旋转双环（椭圆）
    for (let ring = 0; ring < 2; ring++) {
      const dir = ring === 0 ? 1 : -1
      const rr = (34 + ring * 6) * dpr * (0.95 + 0.05 * pulse)
      ctx.save()
      ctx.translate(cx, feetY)
      ctx.scale(1, 0.34)
      ctx.strokeStyle = 'rgba(' + main + ',' + (0.55 + 0.3 * (ring === 0 ? pulse : 1 - pulse)) + ')'
      ctx.lineWidth = (3 - ring) * dpr
      ctx.beginPath()
      ctx.arc(0, 0, rr, t * dir * 2 + (ring ? Math.PI : 0), t * dir * 2 + (ring ? Math.PI : 0) + Math.PI * 1.4)
      ctx.stroke()
      ctx.restore()
    }

    // 3) 身体周围旋转护盾碎片（6 片）
    const shards = 6
    for (let i = 0; i < shards; i++) {
      const ang = t * 1.6 + (Math.PI * 2 * i) / shards
      const orbit = (bodyH * 0.55) * (0.9 + 0.1 * Math.sin(t * 3 + i))
      const px = cx + Math.cos(ang) * orbit
      const py = cy + Math.sin(ang) * orbit * 0.5
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(ang + t)
      ctx.fillStyle = 'rgba(' + sub + ',' + (0.5 + 0.4 * pulse) + ')'
      ctx.beginPath()
      ctx.moveTo(0, -5 * dpr)
      ctx.lineTo(4 * dpr, 0)
      ctx.lineTo(0, 5 * dpr)
      ctx.lineTo(-4 * dpr, 0)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // 4) 头顶「霸体」盾牌标记（中心上方半身高处，紧贴头顶）
    const labelY = screenY - bodyH * 0.5 - 16 * this.dpr
    ctx.save()
    ctx.translate(cx, labelY)
    ctx.fillStyle = 'rgba(' + main + ',0.85)'
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.5 * dpr
    const s = 9 * dpr
    ctx.beginPath()
    ctx.moveTo(0, -s)
    ctx.lineTo(s, -s * 0.5)
    ctx.lineTo(s, s * 0.3)
    ctx.quadraticCurveTo(s, s, 0, s * 1.4)
    ctx.quadraticCurveTo(-s, s, -s, s * 0.3)
    ctx.lineTo(-s, -s * 0.5)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    ctx.font = 'bold ' + (12 * dpr) + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(' + main + ',0.95)'
    ctx.fillText('霸体', cx, labelY - 16 * dpr)

    ctx.restore()
  }

  /**
   * ★ 判定英雄此刻是否处于「霸体技能施法中」（用于叠加霸体光环）。
   *   isMain=true（主控玩家）：走 playerAnim.timer 通道；
   *   isMain=false（AI 队友）：走 _aiCastingSkill 通道。
   */
  _heroSuperArmorOn(hero, isMain) {
    if (!hero) return false
    if (!isMain) return !!(hero._aiCastingSkill && hero._aiCastingSkill.superArmor)
    return !!(this.battleSystem && this.battleSystem.playerAnim && this.battleSystem.playerAnim.timer > 0 && hero._castSuperArmor)
  }

  /**
   * ★ 判定怪物此刻是否处于「霸体技能施法中」（用于叠加红色霸体光环）。
   */
  _monsterSuperArmorOn(monster) {
    if (!monster) return false
    return !!(monster.isCastingSkill && monster.skillAnimTimer > 0 && monster._castingSkill && monster._castingSkill.superArmor)
  }

  /**
   * ★ 光明冲锋蓄力能量聚集特效：以角色脚下中心为圆心，绘制金色光环 + 上升粒子 + 向内聚拢环。
   *   强度 intensity ∈ [0,1] 随蓄力时间增强（越接近释放越亮越密）。
   *   (screenX, screenY) 为怪物精灵锚点（脚下中心），targetHeight 为精灵高度。
   */
  _renderEnergyCharge(ctx, screenX, screenY, targetHeight, intensity) {
    const t = this.time || 0
    const k = Math.max(0, Math.min(1, intensity))
    const bodyH = targetHeight
    const cx = screenX
    const cy = screenY - bodyH / 2   // 包围全身的圆心（身体中部）
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    // 1) 全身柔光圆（扩散感），半径随强度增长
    const glowR = (bodyH * 0.75) * (0.7 + 0.5 * k)
    const grad = ctx.createRadialGradient(cx, cy, glowR * 0.15, cx, cy, glowR)
    grad.addColorStop(0, `rgba(255, 240, 160, ${0.10 + 0.28 * k})`)
    grad.addColorStop(0.6, `rgba(255, 210, 90, ${0.06 + 0.16 * k})`)
    grad.addColorStop(1, 'rgba(255, 180, 40, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
    ctx.fill()

    // 2) 旋转双环（蓄力光环），随强度变亮变粗
    for (let ring = 0; ring < 2; ring++) {
      const dir = ring === 0 ? 1 : -1
      const rr = glowR * (0.55 + 0.12 * ring) * (0.85 + 0.15 * Math.sin(t * 4 + ring))
      ctx.beginPath()
      ctx.arc(cx, cy, rr, t * dir * 2.2, t * dir * 2.2 + Math.PI * 1.4)
      ctx.strokeStyle = `rgba(255, 225, 120, ${0.25 + 0.5 * k})`
      ctx.lineWidth = (2 + 2 * k) * this.dpr
      ctx.stroke()
    }

    // 3) 上升粒子（能量从脚底向全身汇聚），数量随强度增加
    const particleCount = Math.floor(6 + 10 * k)
    for (let i = 0; i < particleCount; i++) {
      const phase = (t * 0.9 + i / particleCount) % 1          // 0→1 上升进度
      const px = cx + Math.sin(i * 2.3 + t * 3) * glowR * 0.45 * (1 - phase * 0.3)
      const py = screenY - phase * bodyH                       // 从脚底升到头顶
      const pr = (2 + 2 * k) * this.dpr * (1 - phase * 0.4)
      ctx.beginPath()
      ctx.arc(px, py, pr, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 235, 150, ${0.5 * (1 - phase) + 0.2})`
      ctx.fill()
    }

    // 4) 向外脉冲环（释放前征兆），强度越高越频繁
    const pulse = (t * (1.2 + 2 * k)) % 1
    ctx.beginPath()
    ctx.arc(cx, cy, glowR * (0.4 + pulse * 0.8), 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255, 245, 180, ${(1 - pulse) * 0.35 * k})`
    ctx.lineWidth = 2 * this.dpr
    ctx.stroke()

    ctx.restore()
  }

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

    // ★ 金币常驻显示（读取 data 的 'gold' 字段，让玩家资产可见）
    const goldNow = (this.game.data.get && this.game.data.get('gold')) || 0
    ctx.save()
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffd86b'
    ctx.font = `bold ${18 * this.dpr}px sans-serif`
    ctx.fillText(`💰 ${goldNow}`, this.width - 20 * this.dpr, 65 * this.dpr)
    ctx.restore()
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
