/**
 * heroes.js - 角色数据
 * 
 * renderConfig 渲染配置说明：
 * - assetPrefix: 资源key前缀（如 'HERO_ZHENBAO'）
 * - spriteType: 角色类型（'zhenbao'|'lixiaobao'|'cat'|'hero'）
 * - totalWalkFrames: 行走动画总帧数
 * - totalIdleFrames: 空闲动画总帧数
 * - walkFrameOffset: 行走帧起始偏移（臻宝/李小宝从1开始）
 * - idleFrameOffset: 空闲帧起始偏移
 * - walkFramePad: 行走帧补零位数（2表示01,02...）
 * - idleFramePad: 空闲帧补零位数（史莱姆猫用1，即1,2,3...）
 * - flipRule: 翻转规则（'same'=facingLeft=true时翻转，'opposite'=facingLeft=false时翻转）
 * - shadow: 是否显示阴影
 * - targetHeight: 角色目标高度（逻辑像素）
 */

export const HEROES = [
  {
    id: 'zhenbao',
    name: '臻宝',
    title: '勇敢的战士',
    role: 'warrior',
    maxHp: 1200,
    maxMp: 300,
    atk: 180,
    def: 120,
    spd: 100,
    avatar: 'HERO_ZHENBAO', // 引用 asset-manager 注册的 key（transparent/zhenbao/idle_01）
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'HERO_ZHENBAO',
      spriteType: 'zhenbao',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1, // 帧从01开始
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'same', // facingLeft=true 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    skills: [
      { id: 'slash', name: '斩击', type: 'attack', power: 1.2, mpCost: 0, range: 100, desc: '基础物理攻击' },
      {
        id: 'shield_bash',
        name: '盾击',
        type: 'attack',
        power: 0.8,
        mpCost: 5,
        range: 80,
        cooldown: 6,
        superArmor: true,     // ★ 霸体：释放期间（含突进）不被打断，护盾/防御照常结算
        lungeDist: 150,        // ★ 突进距离（逻辑像素，释放瞬间朝面向方向位移；受障碍/边界钳制）
        desc: '举盾突进猛击前方敌人：释放期间霸体不可打断；自身获得30%最大生命的白色护盾（持续4秒，被攻击优先抵挡），1秒内防御力提升70%；30%几率眩晕命中的敌人1秒，并将前方X轴范围内的所有敌人击退',
        // ★ 盾击附加效果配置（运行时 _applyShieldBashEffects 读取，数据驱动）
        shield: {
          enabled: true,
          hpPercent: 0.30,          // 护盾值 = 30% 最大生命
          duration: 4.0,            // 护盾持续 4 秒（英雄联盟式：释放即出现，4 秒后自动消失）
        },
        defUp: {
          enabled: true,
          amp: 0.70,                // 防御 +70%
          duration: 1.5,            // 持续 1 秒
        },
        knock: {
          enabled: true,
          range: 60,                // 前方 X 轴生效范围（像素）
          distance: 150,            // 击退距离（像素，X 轴）
          stunChance: 0.30,         // 眩晕几率 30%
          stunDuration: 1.5,        // 眩晕持续 1 秒
        }
      },
      { id: 'war_cry', name: '战吼', type: 'buff', mpCost: 8, range: 0, desc: '提升全体攻击力', effect: 'atk_up', turns: 3, value: 0.3 },
      { id: 'berserk', name: '狂暴', type: 'buff', mpCost: 15, range: 0, desc: '大幅提升自身攻击与攻击速度', effect: 'atk_up_self', turns: 3, value: 0.5, atkSpeed: 0.6 },
      {
        id: 'blade_storm',
        name: '剑气风暴',
        type: 'blade_storm',   // ★ 自定义斩击大招：前摇蓄力→吸附→5次突刺→剑气收尾
        mpCost: 25,
        range: 0,
        cooldown: 3,          // 冷却（秒）
        superArmor: true,     // ★ 霸体：释放期间不被打断（受击硬直/打断均无效，效果照常结算）
        combo: 5,              // 突刺次数
        power: 0.85,           // 单次突刺伤害系数
        lungeDist: 46,         // 每次突刺前冲距离（像素，明显可见）
        pullRange: 220,        // 吸附范围（像素，世界坐标）
        pullDist: 70,          // 吸附到玩家正前方的距离
        projectile: {
          speed: 680,          // 月牙剑气飞行速度
          power: 1.6,          // 剑气伤害系数
          width: 55,           // 剑气视觉厚度（X轴，月牙厚度）
          height: 40,          // 剑气视觉高度（Y轴，竖直月牙跨度）
          hitW: 100,           // 命中矩形宽
          hitH: 100,           // 命中矩形高
          duration: 0.9
        },
        desc: '蓄力吸附周围敌人，连续突刺5次，最后挥出剑气'
      }
    ]
  },
  {
    id: 'lixiaobao',
    name: '李小宝',
    title: '智慧的法师',
    role: 'mage',
    maxHp: 80,
    maxMp: 80,
    atk: 22,
    matk: 38,
    def: 6,
    spd: 11,
    avatar: 'HERO_LIXIAOBAO', // 引用 asset-manager 注册的 key（transparent/lixiaobao/idle_01）
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'HERO_LIXIAOBAO',
      spriteType: 'lixiaobao',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1, // 帧从01开始
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'same', // facingLeft=true 时翻转
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    skills: [
      { id: 'staff_strike', name: '法杖敲击', type: 'attack', power: 0.8, mpCost: 0, desc: '用魔法杖敲击敌人' },
      {
        id: 'fireball',
        name: '火球术',
        type: 'magic',
        power: 1.5,
        mpCost: 8,
        desc: '向前方X轴200距离释放火球，命中敌人造成火焰伤害并灼烧',
        // ★ 野外战斗AOE配置（可调）：X轴直线范围灼烧
        aoe: {
          enabled: true,
          aoeType: 'lineX',        // X轴直线（弹道飞行）
          range: 200,              // X轴最大飞行距离（逻辑像素）
          projectileSpeed: 320,    // 火球飞行速度（逻辑像素/秒）
          burn: {
            enabled: true,
            tickDamage: 6,         // 每跳灼烧伤害
            duration: 3,           // 灼烧持续（秒）
            tickInterval: 0.5      // 跳间隔（秒）
          }
        },
        statusEffect: {
          type: 'burn',
          duration: 3,
          baseDamage: 15
        }
      },
      {
        id: 'ice_shard',
        name: '冰晶术',
        type: 'magic',
        power: 1.0,
        mpCost: 6,
        desc: '模仿DNF冰刃波动剑，向前方X轴延伸至边界生成冰刃，命中敌人冻结',
        // ★ 野外战斗AOE配置（可调）：冰刃波动剑，冰刃从起点逐个生成、向X轴边界延伸，再由起点逐个消失
        aoe: {
          enabled: true,
          aoeType: 'iceWave',      // 冰刃波动剑
          bladeCount: 8,           // 冰刃数量
          bladeGap: 60,            // 冰刃间距（逻辑像素）
          bladeWidth: 80,          // 冰刃宽度
          extendSpeed: 1.0,        // 生成/消失速度倍率（1.0=每 bladeAnimDur 生成一个）
          freeze: {
            enabled: true,
            duration: 2            // 冰冻持续（秒）
          }
        },
        statusEffect: {
          type: 'freeze',
          probability: 0.3
        }
      },
      {
        id: 'thunder',
        name: '雷击',
        type: 'magic',
        power: 2.0,
        mpCost: 15,
        desc: '在施法位置生成持续雷击区域：每次落雷前0.5秒黄色预警，0.5秒后雷劈落下对区域内敌人无差别攻击并施加感电（受击伤害+20%），区域持续3秒',
        // ★ 野外战斗AOE配置（可调）：固定区域持续雷击 + 预警 + 无差别群伤
        aoe: {
          enabled: true,
          aoeType: 'area',         // 圆形范围（施法位置为固定中心，不跟随）
          radius: 300,             // 作用半径（逻辑像素）
          strikeCount: 3,          // 3秒内共3次落雷
          duration: 3,             // 区域持续（秒）后消失
          warnDuration: 0.5,       // 每次落雷前黄色预警时长（秒）
          strikeInterval: 1.0,     // 相邻两次落雷间隔（秒，含预警）
          electrify: {
            enabled: true,
            duration: 3,           // 感电持续（秒）
            damageMult: 0.2        // 感电易伤：受击额外伤害比例
          }
        },
        target: 'all'
      },
      {
        id: 'mana_shield',
        name: '魔力护盾',
        type: 'buff',
        mpCost: 10,
        cooldown: 12,
        desc: '为全体队友附加魔力护盾，提升30%防御力，持续3秒',
        effect: 'def_up',
        value: 0.3,
        duration: 3
      }
    ]
  },
  {
    id: 'amy',
    name: '艾米',
    title: '温柔的治愈猫',
    role: 'healer',
    maxHp: 90,
    maxMp: 60,
    atk: 10,
    matk: 18,
    def: 8,
    spd: 13,
    avatar: 'AIMI', // 引用 asset-manager 注册的 key（transparent/aimi/idle_01）
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'AIMI',
      spriteType: 'aimi',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'same', // facingLeft=true 时翻转（与臻宝、李小宝一致）
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    unlockChapter: 1,
    skills: [
      { id: 'cat_paw', name: '猫爪击', type: 'attack', power: 1.0, mpCost: 0, desc: '用猫爪挠敌人' },
      { id: 'holy_shield', name: '圣盾之光', type: 'buff', mpCost: 10, cooldown: 15, desc: '提升全体30%防御力，持续3秒', effect: 'def_up', value: 0.3, duration: 3 },
      { id: 'heal_strike', name: '治愈冲击', type: 'attack_heal', power: 1.2, mpCost: 12, cooldown: 10, desc: '向前突进300距离，对沿途敌人必定暴击，并回复30%伤害的生命值', crit: true, healPercent: 0.3, dashDistance: 300 },
      { id: 'heal_light', name: '治愈之光', type: 'heal', power: 30, mpCost: 10, desc: '回复全队生命值', target: 'all_ally', formula: 'base + matk * 1.0' }
    ]
  },
  {
    id: 'annie',
    name: '安妮',
    title: '神秘的魔法猫',
    role: 'mage',
    maxHp: 75,
    maxMp: 70,
    atk: 20,
    matk: 35,
    def: 5,
    spd: 12,
    avatar: 'images/cats/team/cat_annie.png',
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'CAT',
      spriteType: 'cat',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // facingLeft=false 时翻转（猫咪默认朝右）
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    unlockChapter: 2,
    skills: [
      { id: 'shadow_touch', name: '暗影触碰', type: 'attack', power: 0.8, mpCost: 0, desc: '用暗影之力触碰敌人' },
      { id: 'shadow_ball', name: '暗影球', type: 'magic', power: 1.4, mpCost: 7, desc: '暗属性魔法' },
      { id: 'curse', name: '诅咒', type: 'debuff', mpCost: 10, desc: '降低敌人属性', effect: 'atk_down', turns: 3, value: 0.3 },
      { id: 'drain', name: '吸命', type: 'magic', power: 1.0, mpCost: 12, desc: '攻击并恢复生命', effect: 'drain' },
      { id: 'dark_nova', name: '暗星爆发', type: 'magic', power: 1.8, mpCost: 18, desc: '强力暗属性全体攻击', target: 'all' }
    ]
  },
  {
    id: 'qianduoduo',
    name: '钱多多',
    title: '富有的战斗猫',
    role: 'warrior',
    maxHp: 110,
    maxMp: 25,
    atk: 16,
    def: 15,
    spd: 8,
    avatar: 'images/cats/team/cat_qianduoduo.png',
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'CAT',
      spriteType: 'cat',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // facingLeft=false 时翻转（猫咪默认朝右）
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    unlockChapter: 3,
    skills: [
      { id: 'punch', name: '拳击', type: 'attack', power: 1.0, mpCost: 0, desc: '用拳头攻击' },
      { id: 'coin_throw', name: '金币投掷', type: 'attack', power: 1.1, mpCost: 5, desc: '投掷金币攻击' },
      { id: 'gold_shield', name: '金盾', type: 'buff', mpCost: 8, desc: '大幅提升自身防御', effect: 'def_up_self', turns: 3, value: 0.5 },
      { id: 'smash', name: '重击', type: 'attack', power: 1.6, mpCost: 12, desc: '强力物理攻击' },
      { id: 'fortune', name: '财运亨通', type: 'buff', mpCost: 15, desc: '战斗后获得额外金币', effect: 'gold_up', turns: 5 }
    ]
  },
  {
    id: 'xiaobei',
    name: '小贝',
    title: '坚定的守护猫',
    role: 'tank',
    maxHp: 150,
    maxMp: 20,
    atk: 12,
    def: 18,
    spd: 7,
    avatar: 'images/cats/team/cat_xiaobei.png',
    // 渲染配置（用于 CharacterSprite）
    renderConfig: {
      assetPrefix: 'CAT',
      spriteType: 'cat',
      totalWalkFrames: 8,
      totalIdleFrames: 8,
      walkFrameOffset: 1,
      idleFrameOffset: 1,
      walkFramePad: 2,
      idleFramePad: 2,
      flipRule: 'opposite', // facingLeft=false 时翻转（猫咪默认朝右）
      shadow: true,
      targetHeight: 80,
      frameDuration: 0.15
    },
    unlockChapter: 4,
    skills: [
      { id: 'shield_bash_xb', name: '盾击', type: 'attack', power: 0.9, mpCost: 0, desc: '用盾牌敲击敌人' },
      { id: 'taunt', name: '挑衅', type: 'buff', mpCost: 5, desc: '吸引敌人攻击自己', effect: 'taunt', turns: 2 },
      { id: 'iron_wall', name: '铁壁', type: 'buff', mpCost: 10, desc: '大幅提升全体防御', effect: 'def_up', turns: 3, value: 0.4 },
      { id: 'counter', name: '反击', type: 'attack', power: 1.0, mpCost: 8, desc: '受到攻击时反击', effect: 'counter' },
      { id: 'guard', name: '守护', type: 'buff', mpCost: 12, desc: '替队友承受伤害', effect: 'guard', turns: 2 }
    ]
  }
]

// 猫咪图鉴
export const CAT_COLLECTION = [
  { id: 'cat_01', name: '虎斑猫', rarity: 'common', desc: '最常见的猫咪，性格独立' },
  { id: 'cat_02', name: '波斯猫', rarity: 'rare', desc: '优雅的长毛猫，贵族气质' },
  { id: 'cat_03', name: '暹罗猫', rarity: 'rare', desc: '聪明的东方猫，善于沟通' },
  { id: 'cat_04', name: '燕尾服猫', rarity: 'common', desc: '黑白分明的绅士猫' },
  { id: 'cat_05', name: '三花猫', rarity: 'uncommon', desc: '三色花纹，几乎都是母猫' },
  { id: 'cat_06', name: '俄罗斯蓝猫', rarity: 'rare', desc: '银蓝色短毛，翠绿眼睛' },
  { id: 'cat_07', name: '橘猫', rarity: 'common', desc: '温暖的颜色，大胖橘' },
  { id: 'cat_08', name: '英短猫', rarity: 'uncommon', desc: '圆圆的脸，圆圆的眼睛' },
  { id: 'cat_09', name: '孟加拉猫', rarity: 'epic', desc: '豹纹花纹，充满野性' },
  { id: 'cat_10', name: '布偶猫', rarity: 'epic', desc: '蓝色眼睛，温柔如布偶' }
]
