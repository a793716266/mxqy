// battle 分包入口
// 战斗相关资源：特效、背景、角色动画

const BATTLE_PACKAGE_LOADED = true

export function isBattlePackageLoaded() {
  return BATTLE_PACKAGE_LOADED
}

export default {
  name: 'battle',
  loaded: BATTLE_PACKAGE_LOADED,
}
