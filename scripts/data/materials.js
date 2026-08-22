/**
 * materials.js - 素材/消耗品数据定义
 *
 * 素材库存运行时存于 DataManager 的 'materials' 字段（{ id: count }），
 * 由 field-scene._addMaterial / _collectObject 掉落入账。
 * 本表提供展示用的名称/图标/描述；背包（BackpackPanel）消耗品页按此渲染。
 */

// 素材定义表
export const MATERIALS = {
  healing_herb: {
    id: 'healing_herb',
    name: '治愈草药',
    icon: '🌿',
    desc: '迷途的治愈猫珍藏的草药，散发着温暖的光泽，可以用来调配恢复药剂。'
  },
  slime_gel: {
    id: 'slime_gel',
    name: '史莱姆凝胶',
    icon: '🫧',
    desc: '黏糊糊的凝胶，史莱姆猫的身体碎片，据说有微弱的治愈能量。'
  },
  shadow_dust: {
    id: 'shadow_dust',
    name: '暗影之尘',
    icon: '🌑',
    desc: '暗影鼠身上散落的黑色粉末，握在手里有一丝凉意。'
  },
  flame_core: {
    id: 'flame_core',
    name: '火焰核心',
    icon: '🔥',
    desc: '从火焰史莱姆体内取出的灼热核心，久久不熄。'
  },
  aqua_drop: {
    id: 'aqua_drop',
    name: '水灵之滴',
    icon: '💧',
    desc: '水属性史莱姆凝结的露珠，冰凉剔透。'
  },
  violet_petal: {
    id: 'violet_petal',
    name: '紫罗兰花瓣',
    icon: '💜',
    desc: '紫色史莱姆携带的花瓣，散发着淡淡幽香。'
  },
  stray_fang: {
    id: 'stray_fang',
    name: '流浪猫的犬牙',
    icon: '🦷',
    desc: '流浪野猫脱落的一颗犬牙，依然锋利。'
  },
  shadow_heart: {
    id: 'shadow_heart',
    name: '暗影之心',
    icon: '🖤',
    desc: '凝聚着暗影力量的结晶，隐约能听到低语声。'
  }
}

/**
 * 获取素材定义（未登记的 id 兜底返回占位定义，保证背包不崩）
 */
export function getMaterialDef(id) {
  return MATERIALS[id] || { id, name: id, icon: '🧪', desc: '神秘的素材，似乎还没有人见过它。' }
}
