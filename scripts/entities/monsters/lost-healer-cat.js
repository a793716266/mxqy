/**
 * 迷途的治愈猫（艾米BOSS）- 怪物配置（单一数据源）
 * 属性 / 技能 / AI / 动画 / 渲染配置均在此定义；enemies.js 仅做聚合。
 * ★ 此处是唯一数据源：skills（含光明冲锋 light_charge）、renderConfig 等全部在此，
 *   不再 require enemies.js，避免循环依赖与数据分叉。
 */
module.exports = {
  // === 基础属性（原 enemies.js ENEMIES_CH1.lost_healer_cat）===
  id: 'lost_healer_cat',
  name: '迷途的治愈猫',
  type: 'aimi', // ★ type 字段，用于动画系统识别
  level: 8,
  maxHp: 350,
  atk: 22,
  matk: 28, // 法术攻击力
  def: 16,
  spd: 11,
  isRanged: false, // ★ 艾米是近战BOSS
  aiPattern: 'aggressive', // ★ 近战BOSS应该是激进模式
  crit: 0.15, // Boss基础暴击率 15%
  exp: 150,
  gold: 80,
  isBoss: true,
  isAmy: true, // 特殊标记：这是艾米的Boss形态
  noMpCost: true, // ★ Boss形态不消耗蓝量
  equipment: {
    // Boss自带强力装备
    name: '治愈之冠',
    type: 'accessory',
    stats: { maxHp: 50, def: 6, matk: 10, crit: 0.05 }
  },
  skills: [
    // 普通攻击
    { name: '治愈之爪', power: 1.3, type: 'attack' },
    // ★ 光明冲锋（重做）：蓄力→红色警示区→瞬移→AOE伤害+击飞+落地眩晕（专用状态机 light_charge）
    {
      id: 'light_charge',
      name: '光明冲锋',
      type: 'light_charge',
      power: 1.8,
      cooldown: 15, // 秒
      range: 420, // 较远距离即可起手（预警区落在目标附近）
      chargeTime: 2.4, // 蓄力总时长：前0.4s播放01-03，随后在03帧停留满2秒（能量聚集）
      warnDuration: 1.0, // 红色警示区存在/延迟时间（1秒后落下）
      aoeRadius: 95, // 落地 AOE 半径（像素，未乘 dpr）
      knockback: true, // 击飞
      knockbackHeight: 200, // 击飞抛物高度（像素，未乘 dpr），原 70 → 130 更夸张
      stun: 1.0, // 落地眩晕秒数
      superArmor: true // 蓄力期间霸体不被打断
    },
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
      cooldown: 20, // 20秒冷却
      noMpCost: true, // 不消耗蓝量
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
  ],

  // === 动画配置（使用艾米资源）===
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

  // === 渲染配置 ===
  renderConfig: {
    assetPrefix: 'AIMI',
    spriteType: 'aimi',
    totalWalkFrames: 8,
    totalIdleFrames: 8,
    walkFrameOffset: 1,
    idleFrameOffset: 1,
    walkFramePad: 2,
    idleFramePad: 2,
    flipRule: 'same', // 与英雄一致
    shadow: true,
    targetHeight: 80, // 渲染目标高度（像素）
    frameDuration: 0.15
  }
}
