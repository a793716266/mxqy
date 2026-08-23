/**
 * 破布偶 - 怪物配置（单一数据源，第三章·集市小镇）
 * 属性 / 技能 / AI / 渲染配置均在此定义；enemies.js 仅做聚合。
 * 主题：摊位上被黑雾附身的破布玩偶，皮厚移动慢。
 * 渲染：无逐帧动画资源，使用通用敌人精灵（emoji/单图）。
 */
module.exports = {
  id: 'rag_doll',
  name: '破布偶',
  level: 9,
  maxHp: 180,
  atk: 22,
  def: 18,
  spd: 8, // 速度低，典型"肉盾型"小怪
  crit: 0.05,
  renderConfig: {
    assetPrefix: 'RAG_DOLL',
    spriteType: 'enemy',
    totalWalkFrames: 8,
    totalIdleFrames: 8,
    walkFrameOffset: 1,
    idleFrameOffset: 1,
    walkFramePad: 2,
    idleFramePad: 2,
    flipRule: 'opposite',
    shadow: true,
    targetHeight: 80,
    frameDuration: 0.15
  },
  exp: 42,
  gold: 22,
  isRanged: false,
  aiPattern: 'defensive', // 防御：坚守阵地
  equipment: {
    name: '破布护甲',
    type: 'armor',
    stats: { def: 8, maxHp: 30 }
  },
  skills: [
    { name: '布偶重击', power: 1.5, type: 'attack' },
    { name: '碎步冲撞', power: 0.9, type: 'attack', target: 'all' }
  ],
  drop: [{ id: 'cloth_scrap', name: '布屑', chance: 0.4 }]
}
