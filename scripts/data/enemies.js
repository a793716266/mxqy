/**
 * enemies.js - 第一章敌人数据
 */

// 敌人等级成长率（每升一级增加的百分比）
const ENEMY_GROWTH_RATE = {
  normal: { hp: 0.08, atk: 0.05, def: 0.05, spd: 0.02 },   // 小怪
  elite: { hp: 0.10, atk: 0.07, def: 0.07, spd: 0.03 },    // 精英
  boss: { hp: 0.12, atk: 0.08, def: 0.08, spd: 0.04 }      // Boss
}

/**
 * 根据等级计算敌人最终属性
 * @param {Object} enemyData - 敌人基础数据
 * @param {number} level - 敌人等级（默认为1）
 * @returns {Object} 最终敌人数据
 */
export function getEnemyByLevel(enemyData, level = 1) {
  if (!enemyData) return null

  // 确定敌人类型（用于成长率）
  const enemyType = enemyData.isBoss ? 'boss' : (enemyData.isElite ? 'elite' : 'normal')
  const growth = ENEMY_GROWTH_RATE[enemyType]

  // 计算等级加成后的属性
  const levelMultiplier = (level - 1)
  const finalEnemy = {
    ...enemyData,
    level: level,
    
    // 应用等级加成
    maxHp: Math.floor(enemyData.maxHp * (1 + growth.hp * levelMultiplier)),
    atk: Math.floor(enemyData.atk * (1 + growth.atk * levelMultiplier)),
    def: Math.floor(enemyData.def * (1 + growth.def * levelMultiplier)),
    spd: Math.floor(enemyData.spd * (1 + growth.spd * levelMultiplier)),
    
    // 暴击率（小怪5%，精英10%，Boss15%，每级+1%）
    crit: (enemyData.isBoss ? 0.15 : (enemyData.isElite ? 0.10 : 0.05)) + level * 0.01,
    
    // 装备加成（Boss和精英自带装备加成）
    equipment: enemyData.equipment || null
  }

  // 应用装备加成（如果有）
  if (finalEnemy.equipment) {
    const stats = finalEnemy.equipment.stats
    if (stats) {
      if (stats.atk) finalEnemy.atk += stats.atk
      if (stats.def) finalEnemy.def += stats.def
      if (stats.maxHp) {
        finalEnemy.maxHp += stats.maxHp
      }
      if (stats.spd) finalEnemy.spd += stats.spd
      if (stats.crit) finalEnemy.crit += stats.crit
    }
  }

  // 初始化当前HP/MP
  finalEnemy.hp = finalEnemy.maxHp
  finalEnemy.maxMp = enemyData.maxMp || (enemyData.isBoss ? 100 : (enemyData.isElite ? 50 : 30))
  finalEnemy.mp = finalEnemy.maxMp

  console.log(`[Enemy] ${enemyData.name} Lv.${level} - HP:${finalEnemy.maxHp}, ATK:${finalEnemy.atk}, DEF:${finalEnemy.def}, CRIT:${(finalEnemy.crit * 100).toFixed(1)}%, MP:${finalEnemy.maxMp}`)
  console.log(`[Enemy] renderConfig:`, finalEnemy.renderConfig)

  return finalEnemy
}

export const ENEMIES_CH1 = {
  // 小怪 - 加强版
  wild_cat: {
    id: 'wild_cat',
    name: '野猫',
    level: 1,           // 基础等级
    maxHp: 50,       // 30 → 50 (+67%)
    atk: 12,         // 8 → 12 (+50%)
    def: 5,          // 3 → 5 (+67%)
    spd: 9,
    crit: 0.05,      // 基础暴击率 5%
    aiPattern: 'aggressive',  // 激进：猛扑不退
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'WILD_CAT',
      spriteType: 'enemy',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 15,         // 奖励提升
    gold: 8,
    skills: [
      { name: '抓挠', power: 1.2, type: 'attack' },          // 1.0 → 1.2
      { name: '狂抓', power: 1.5, type: 'attack' }           // 新增技能
    ],
    drop: [{ id: 'fish', name: '小鱼干', chance: 0.3 }]
  },
  slime_cat: {
    id: 'slime_cat',
    type: 'slime_cat',  // 添加类型标记，用于动画识别
    name: '史莱姆猫',
    level: 3,
    maxHp: 110,       // 70 → 110 (精英加强)
    atk: 12,
    def: 14,          // 8 → 14 (防御加强)
    spd: 10,  // 6 → 10 (提高移动速度，让怪物能快速接近目标)
    crit: 0.08,       // 0.05 → 0.08 (精英暴击)
    aiPattern: 'defensive',  // 防御：黏液护体、不主动冲锋
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'SLIME_CAT',
      spriteType: 'slime_cat',
      totalWalkFrames: 12,
      totalIdleFrames: 6,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,    // walk帧补零（01,02,...）
      idleFramePad: 1,     // idle帧不补零（1,2,3...）
      flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 30,          // 经验提升
    gold: 18,
    isElite: true,    // 升级为精英怪
    equipment: {      // 精英自带装备加成
      name: '黏液护甲',
      type: 'armor',
      stats: { def: 6, maxHp: 20 }
    },
    skills: [
      { name: '黏液喷射', power: 1.2, type: 'attack', effect: 'slime_spray' },
      { name: '黏液包裹', power: 1.4, type: 'attack', effect: 'slime_wrap', restrictChance: 0.35 },
      { 
        name: '跳跃攻击', 
        power: 1.5, 
        type: 'jump_attack', 
        effect: 'jump_attack',
        range: 300,  // ★ 跳跃距离（像素）
        cooldown: 3,  // ★ 冷却时间改为3秒（方便测试）
        warnDuration: 1.5,  // 预警时间（秒）
        damageRadius: 200  // ★ 伤害范围（像素）
      }
    ],
    drop: [{ id: 'gel', name: '黏液', chance: 0.25 }]
  },
  shadow_mouse: {
    id: 'shadow_mouse',
    name: '暗影鼠',
    level: 3,
    maxHp: 80,       // 45 → 80 (精英加强)
    atk: 16,
    def: 10,         // 4 → 10 (防御大幅加强)
    spd: 17,         // 速度微提
    crit: 0.12,      // 0.08 → 0.12 (精英暴击)
    aiPattern: 'aggressive',  // 激进：高速突袭
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'SHADOW_MOUSE',
      spriteType: 'shadow_mouse',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 25,         // 经验提升
    gold: 12,
    isElite: true,   // 升级为精英怪
    equipment: {     // 精英自带装备
      name: '暗影匕首',
      type: 'weapon',
      stats: { atk: 4, crit: 0.04 }
    },
    skills: [
      // 暗影咬：跳跃攻击，单体伤害，100%生命偷取，CD 15秒
      { 
        name: '暗影咬', 
        power: 1.4, 
        type: 'jump_attack',
        range: 500,           // 跳跃距离500像素
        cooldown: 15,         // CD 15秒
        effect: 'drain',      // 生命偷取效果
        drainPercent: 1.0,     // 偷取100%伤害
        target: 'single',      // 单体目标
        warnDuration: 1.0,     // 预警时间1秒
        damageRadius: 50        // 很小的范围（实际上是单体）
      },
      { name: '暗影突袭', type: 'buff', effect: 'invisible', duration: 5, power: 0 }  // 隐身5秒
    ],
    drop: [{ id: 'cheese', name: '奶酪', chance: 0.45 }]
  },
  // 精英怪 - 大幅加强
  stray_leader: {
    id: 'stray_leader',
    name: '流浪猫首领',
    level: 5,
    maxHp: 180,      // 80 → 180 (+125%)
    atk: 24,         // 14 → 24 (+71%)
    def: 14,         // 8 → 14 (+75%)
    spd: 12,         // 10 → 12
    crit: 0.10,      // 精英基础暴击率 10%
    aiPattern: 'support',  // 辅助：召唤小弟+群体控制
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'CAT',  // 使用猫咪通用资源
      spriteType: 'enemy',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 50,         // 奖励提升
    gold: 35,
    isElite: true,
    equipment: {     // 精英自带装备
      name: '锋利爪套',
      type: 'weapon',
      stats: { atk: 8, crit: 0.05 }
    },
    skills: [
      { name: '利爪连击', power: 1.5, type: 'attack' },      // 1.2 → 1.5
      { name: '召唤小弟', power: 0, type: 'summon', summonId: 'wild_cat' },
      { name: '怒吼', power: 1.0, type: 'attack', target: 'all', effect: 'stun' },  // 0.5 → 1.0
      { name: '撕裂', power: 2.0, type: 'attack' }           // 新增强力技能
    ],
    drop: [{ id: 'cat_collar', name: '猫项圈', chance: 0.5 }]
  },
  // Boss - 阳光草原（艾米的Boss形态）
  lost_healer_cat: {
    id: 'lost_healer_cat',
    type: 'aimi',  // ★ 添加 type 字段，用于动画系统识别
    name: '迷途的治愈猫',
    level: 8,
    maxHp: 350,
    atk: 22,
    matk: 28,       // 法术攻击力
    def: 16,
    spd: 11,
    isRanged: false,  // ★ 修复：艾米是近战BOSS
    aiPattern: 'aggressive',  // ★ 修复：近战BOSS应该是激进模式
    crit: 0.15,      // Boss基础暴击率 15%
    // 渲染配置（用于 CharacterSprite）- 使用艾米动画资源
    renderConfig: {
      assetPrefix: 'AIMI',
      spriteType: 'aimi',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'same', // 与英雄一致：facingLeft=true 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 150,
    gold: 80,
    isBoss: true,
    isAmy: true,  // 特殊标记：这是艾米的Boss形态
    noMpCost: true,  // ★ Boss形态不消耗蓝量
    equipment: {     // Boss自带强力装备
      name: '治愈之冠',
      type: 'accessory',
      stats: { maxHp: 50, def: 6, matk: 10, crit: 0.05 }
    },
    // ★ 重新设计技能：近战蓄力+冲锋
    skills: [
      // 普通攻击
      { name: '治愈之爪', power: 1.3, type: 'attack' },
      // ★ 新技能：蓄力冲锋（skill_01-08动画）
      { 
        name: '光明冲锋', 
        power: 2.5, 
        type: 'charge',  // 新类型：冲锋
        chargeTime: 2.0,  // 蓄力2秒
        dashDistance: 200,  // 冲锋距离200像素
        dashSpeed: 800,  // 冲锋速度（像素/秒）
        effect: 'knockback',  // 击飞效果
        critBonus: 1.0,  // 必定暴击（100%暴击加成）
        drainPercent: 0.3,  // 回复伤害30%生命值
        cooldown: 8,  // CD 8秒
        noMpCost: true 
      },
      // 防御技能
      { name: '圣盾之光', power: 0, type: 'buff', effect: 'def_up', value: 0.3, duration: 3, noMpCost: true },
      // 召唤技能
      { 
        name: '召唤暗影鼠', 
        power: 0, 
        type: 'summon', 
        summonId: 'shadow_mouse',
        cooldown: 20,  // 20秒冷却
        noMpCost: true,
        desc: '召唤暗影鼠协助战斗'
      }
    ],
    crit: 0.15,      // Boss基础暴击率 15%
    // 渲染配置（用于 CharacterSprite）- 使用艾米动画资源
    renderConfig: {
      assetPrefix: 'AIMI',
      spriteType: 'aimi',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'same', // 与英雄一致：facingLeft=true 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 150,
    gold: 80,
    isBoss: true,
    isAmy: true,  // 特殊标记：这是艾米的Boss形态
    noMpCost: true,  // ★ Boss形态不消耗蓝量
    equipment: {     // Boss自带强力装备
      name: '治愈之冠',
      type: 'accessory',
      stats: { maxHp: 50, def: 6, matk: 10, crit: 0.05 }
    },
    skills: [
      // 普通攻击
      { name: '治愈之爪', power: 1.3, type: 'attack' },
      // 群体攻击
      { name: '生命波纹', power: 0.8, type: 'attack', target: 'all' },
      // 自愈（不消耗蓝量）
      { name: '治愈之光', power: 0, type: 'heal_self', healAmount: 40, noMpCost: true },
      // Buff技能：提升防御力30%（不消耗蓝量）
      { name: '圣盾之光', power: 0, type: 'buff', effect: 'def_up', value: 0.3, duration: 3, noMpCost: true },
      // 强力攻击（不消耗蓝量）
      { name: '治愈冲击', power: 2.2, type: 'magic', noMpCost: true },
      // ★ 召唤暗影鼠（Boss特殊技能）
      { 
        name: '召唤暗影鼠', 
        power: 0, 
        type: 'summon', 
        summonId: 'shadow_mouse',
        cooldown: 20,  // 20秒冷却
        noMpCost: true,  // 不消耗蓝量
        desc: '召唤暗影鼠协助战斗'
      }
    ],
    drop: [{ id: 'healing_herb', name: '治愈草药', chance: 1.0 }],
    dialogue: [
      '你们...为什么要闯入这里？',
      '我只是想守护这片草原的和平...',
      '真正的力量...是治愈与守护吗...'
    ],
    purifyDialogue: [
      '你们的眼神...如此温暖...',
      '我一直在寻找这样的羁绊...',
      '请让我加入你们，一起守护这片大地！'
    ]
  },
  // Boss - 暗影洞穴
  dark_cat_king: {
    id: 'dark_cat_king',
    name: '暗影猫王',
    level: 10,
    maxHp: 500,      // 200 → 500 (+150%)
    atk: 32,         // 18 → 32 (+78%)
    def: 22,         // 12 → 22 (+83%)
    spd: 13,         // 11 → 13
    isRanged: true,  // Boss远程：暗影法术从远处发动
    aiPattern: 'aggressive',  // 激进：高伤暗影法术
    crit: 0.20,      // 最终Boss暴击率 20%
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'CAT',  // Boss使用猫咪通用资源
      spriteType: 'enemy',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 200,        // 奖励提升
    gold: 120,
    isBoss: true,
    equipment: {     // 最终Boss装备
      name: '暗影王冠',
      type: 'accessory',
      stats: { atk: 15, def: 10, maxHp: 80, crit: 0.05 }
    },
    skills: [
      { name: '暗影爪击', power: 1.8, type: 'attack' },      // 1.3 → 1.8
      { name: '暗影领域', power: 1.2, type: 'attack', target: 'all' },  // 0.8 → 1.2
      { name: '生命吸取', power: 1.5, type: 'attack', effect: 'drain' }, // 1.0 → 1.5
      { name: '暗影爆发', power: 2.5, type: 'attack' },      // 2.0 → 2.5
      { name: '暗影之怒', power: 3.0, type: 'attack' }       // 新增大招
    ],
    drop: [{ id: 'dark_gem', name: '暗影宝石', chance: 1.0 }],
    dialogue: [
      '哼，你竟敢闯入我的领地！',
      '喵星的光芒...让我来熄灭它！',
      '可恶...这股力量...'
    ]
  }
}

// ===== 第二章：魔法塔危机 =====
export const ENEMIES_CH2 = {
  // 小怪
  magic_sprite: {
    id: 'magic_sprite',
    name: '魔法精灵',
    level: 4,
    maxHp: 85,
    atk: 18,
    def: 8,
    spd: 14,
    crit: 0.08,
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'MAGIC_SPRITE',
      spriteType: 'enemy',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 25,
    gold: 15,
    isRanged: true,  // 远程：保持距离施法
    aiPattern: 'aggressive',  // 激进：魔法轰炸
    skills: [
      { name: '魔法弹', power: 1.4, type: 'magic' },
      { name: '魔力风暴', power: 1.8, type: 'magic' }
    ],
    drop: [{ id: 'magic_dust', name: '魔法粉尘', chance: 0.3 }]
  },
  stone_golem: {
    id: 'stone_golem',
    name: '石像守卫',
    level: 5,
    maxHp: 120,
    atk: 20,
    def: 15,
    spd: 8,  // 6 → 8 (适当提高移动速度，保持防御型特性)
    crit: 0.05,
    aiPattern: 'defensive',  // 防御：岩石护体、坚守阵地
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'STONE_GOLEM',
      spriteType: 'enemy',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 30,
    gold: 20,
    skills: [
      { name: '岩石冲击', power: 1.5, type: 'attack', mpCost: 6 },
      { name: '地震', power: 1.2, type: 'attack', target: 'all', mpCost: 15 }
    ],
    drop: [{ id: 'stone_core', name: '石核', chance: 0.25 }]
  },
  ghost_cat: {
    id: 'ghost_cat',
    name: '幽灵猫',
    level: 5,
    maxHp: 70,
    atk: 22,
    def: 6,
    spd: 18,
    crit: 0.12,
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'GHOST_CAT',
      spriteType: 'enemy',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 28,
    gold: 18,
    isRanged: true,  // 远程：穿墙袭击从远处发动
    aiPattern: 'aggressive',  // 激进：高速穿刺
    skills: [
      { name: '幽灵爪', power: 1.6, type: 'attack' },
      { name: '穿墙袭击', power: 2.0, type: 'attack' }
    ],
    drop: [{ id: 'ghost_essence', name: '幽灵精华', chance: 0.3 }]
  },
  
  // 精英
  tower_guardian: {
    id: 'tower_guardian',
    name: '塔楼守护者',
    level: 6,
    maxHp: 250,
    atk: 30,
    def: 20,
    spd: 10,
    crit: 0.10,
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'TOWER_GUARDIAN',
      spriteType: 'enemy',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 70,
    gold: 50,
    isElite: true,
    aiPattern: 'defensive',  // 防御：守护+嘲讽
    equipment: {
      name: '守护铠甲',
      type: 'armor',
      stats: { def: 12, maxHp: 40 }
    },
    skills: [
      { name: '守护一击', power: 1.8, type: 'attack' },
      { name: '嘲讽怒吼', power: 0.8, type: 'attack', target: 'all' },
      { name: '钢铁防御', power: 0, type: 'buff', effect: 'defense_up' }
    ],
    drop: [{ id: 'guardian_shield', name: '守护者盾牌', chance: 0.5 }]
  },
  
  // Boss
  crystal_mage: {
    id: 'crystal_mage',
    name: '水晶法师',
    level: 15,  // 修改为15级（原7级）
    maxHp: 400,
    atk: 35,
    def: 18,
    spd: 14,
    isRanged: true,  // Boss远程：水晶法术从远处发动
    aiPattern: 'aggressive',  // 激进：强力魔法轰炸
    crit: 0.18,
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'CRYSTAL_MAGE',
      spriteType: 'enemy',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // 敌人默认 facingLeft=false 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    exp: 180,
    gold: 100,
    isBoss: true,
    isAnnie: true,  // 特殊标记：这是安妮的Boss形态
    equipment: {
      name: '水晶法杖',
      type: 'weapon',
      stats: { atk: 20, crit: 0.08 }
    },
    skills: [
      { name: '水晶碎片', power: 1.6, type: 'magic' },
      { name: '水晶风暴', power: 1.4, type: 'magic', target: 'all' },
      { name: '魔力汲取', power: 2.0, type: 'magic', effect: 'drain' },
      { name: '水晶封印', power: 2.8, type: 'magic' }
    ],
    drop: [{ id: 'crystal_heart', name: '水晶之心', chance: 1.0 }],
    dialogue: [
      '你们也是来抢夺水晶之力的吗？',
      '我绝不会让任何人接近塔顶！',
      '这股力量...超出了我的想象...'
    ],
    purifyDialogue: [
      '水晶之力...原来不只是力量...',
      '我一直在追求强大的魔法，却忘记了魔法的真谛...',
      '请让我加入你们，用魔法守护这片大地！'
    ]
  }
}

// CommonJS 兼容导出：
// field-scene.js 通过 require() 动态加载怪物配置（scripts/entities/monsters/*.js），
// 而怪物文件再 require 本模块。为兼容 require 与 import 双模式，此处补充 CJS 导出。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ENEMIES_CH1, ENEMIES_CH2, getEnemyByLevel }
}

