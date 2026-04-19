/**
 * heroes.js - 角色数据
 */

export const HEROES = [
  {
    id: 'zhenbao',
    name: '臻宝',
    title: '勇敢的战士',
    role: 'warrior',
    maxHp: 120,
    maxMp: 30,
    atk: 18,
    def: 12,
    spd: 10,
    avatar: 'images/characters/hero_zhenbao.png',
    skills: [
      { id: 'slash', name: '斩击', type: 'attack', power: 1.2, mpCost: 0, desc: '基础物理攻击' },
      { id: 'shield_bash', name: '盾击', type: 'attack', power: 0.8, mpCost: 5, desc: '附带眩晕效果', effect: 'stun' },
      { id: 'war_cry', name: '战吼', type: 'buff', mpCost: 8, desc: '提升全体攻击力', effect: 'atk_up', turns: 3, value: 0.3 },
      { id: 'berserk', name: '狂暴', type: 'buff', mpCost: 15, desc: '大幅提升自身攻击', effect: 'atk_up_self', turns: 3, value: 0.5 }
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
    avatar: 'images/characters/hero_lixiaobao.png',
    skills: [
      { id: 'staff_strike', name: '法杖敲击', type: 'attack', power: 0.8, mpCost: 0, desc: '用魔法杖敲击敌人' },
      {
        id: 'fireball',
        name: '火球术',
        type: 'magic',
        power: 1.5,
        mpCost: 8,
        desc: '强力火焰魔法，灼烧敌人3回合',
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
        desc: '冰系攻击，30%概率冻结敌人1回合',
        statusEffect: {
          type: 'freeze',
          probability: 0.3
        }
      },
      { id: 'thunder', name: '雷击', type: 'magic', power: 2.0, mpCost: 15, desc: '强力雷电攻击全体', target: 'all' },
      { id: 'mana_shield', name: '魔力护盾', type: 'buff', mpCost: 10, desc: '提升全体防御', effect: 'def_up', turns: 3, value: 0.3 }
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
    avatar: 'images/cats/team/cat_amy.png',
    unlockChapter: 1,
    skills: [
      { id: 'cat_paw', name: '猫爪击', type: 'attack', power: 0.9, mpCost: 0, desc: '用猫爪挠敌人' },
      { id: 'heal', name: '治疗', type: 'heal', power: 30, mpCost: 8, desc: '恢复单体生命值', target: 'single_ally' },
      { id: 'group_heal', name: '群疗', type: 'heal', power: 20, mpCost: 15, desc: '恢复全体生命值', target: 'all_ally' },
      { id: 'purify', name: '净化', type: 'heal', power: 10, mpCost: 10, desc: '治愈异常状态', target: 'single_ally', effect: 'cleanse' },
      { id: 'smite', name: '圣光击', type: 'magic', power: 1.0, mpCost: 5, desc: '用圣光攻击敌人' }
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
