/**
 * devtools/_dungeon_enemies_loader.mjs
 * ------------------------------------------------------------------
 * 自定义 ESM loader：在 load 阶段把 enemies.js 及其依赖的怪物文件即时转译为 ESM。
 *
 * 背景：enemies.js 与 entities/monsters/*.js 是 CJS（top-level require / module.exports），
 * 本工程 type:module 下直接 import 会因 require 未定义而崩溃。转译规则：
 *   - require(        ->  __require(   （由 createRequire 提供；enemies.js 用真实文件路径构造）
 *   - module.exports = ->  export default  （怪物文件顶层；enemies.js 的 module.exports 在
 *     `if (typeof module !== 'undefined')` 守卫内，ESM 下不执行，保留原样不转译）
 *
 * 这样 field-scene 能拿到真实 ENEMIES_CH1~CH4 + getEnemyByLevel，真实运行 _generateMonsters。
 */
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const REAL_ENEMIES_URL = new URL('../scripts/data/enemies.js', import.meta.url)

function transformEnemies(src) {
  const preamble = `import { createRequire } from 'module'\nconst __require = createRequire(${JSON.stringify(REAL_ENEMIES_URL)})\n`
  return preamble + src.replace(/require\(/g, '__require(')
}

function transformMonster(src) {
  const preamble = `import { createRequire } from 'module'\nconst __require = createRequire(import.meta.url)\n`
  return preamble + src
    .replace(/require\(/g, '__require(')
    .replace(/module\.exports\s*=/g, 'export default')
}

export async function load(url, context, next) {
  if (url.endsWith('/data/enemies.js') && !url.includes('/entities/monsters/')) {
    const src = readFileSync(fileURLToPath(url), 'utf8')
    return { format: 'module', source: transformEnemies(src), shortCircuit: true }
  }
  if (url.includes('/entities/monsters/') && url.endsWith('.js')) {
    const src = readFileSync(fileURLToPath(url), 'utf8')
    return { format: 'module', source: transformMonster(src), shortCircuit: true }
  }
  return next(url, context)
}
