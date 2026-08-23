// 空 stub：field-scene.js 真实导入 enemies.js，但 enemies.js 使用 CommonJS require（node ESM 不支持），
// 且其导出(_renderMinimap 完全用不到)。本 stub 提供同名导出，仅用于让 FieldScene 在 node 下可加载，
// 以便对真实 _renderMinimap 方法做运行时验证。
export const ENEMIES_CH1 = []
export const ENEMIES_CH2 = []
export const getEnemyByLevel = () => null
