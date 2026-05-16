// sound 分包入口文件
// 音效资源分包，仅包含音频文件，无逻辑代码
// 注意：此文件必须包含有效的 JS 代码，否则微信小游戏工具可能无法正确识别分包

const SOUND_PACKAGE_LOADED = true

export function isSoundPackageLoaded() {
  return SOUND_PACKAGE_LOADED
}

export default {
  name: 'sound',
  loaded: SOUND_PACKAGE_LOADED,
}