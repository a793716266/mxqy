// 决定性探针：复刻 field-scene 渲染拼 key 逻辑，逐一核对渲染会请求的帧
// 是否都有真实磁盘文件（分包 + 主包任一存在即视为可加载）。
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
const require = createRequire(import.meta.url)
const ROOT = path.resolve('.')
const PKG = 'subpackages/battle/'

// --- 复刻 field-scene._buildFrameKey ---
const prefixMap = {
  slime_cat: 'SLIME_CAT', shadow_mouse: 'SHADOW_MOUSE', lost_healer_cat: 'AIMI',
  wild_cat: 'SLIME_CAT', flame_slime: 'FLAME_SLIME', aqua_slime: 'AQUA_SLIME',
  violet_slime: 'VIOLET_SLIME', shadow_mouse_smooth: 'SHADOW_MOUSE_SMOOTH',
}
function buildFrameKey(enemyId, animType, frameIdx, framePad) {
  const prefix = prefixMap[enemyId] || 'SLIME_CAT'
  return `${prefix}_DUMMY`.replace('_DUMMY', '') // placeholder
}

// --- 各怪的磁盘目录（transparent 下）与 walk 文件前缀 ---
const DIR = {
  slime_cat: 'slime_cat', wild_cat: 'slime_cat',
  shadow_mouse: 'shadow_mouse', lost_healer_cat: 'aimi',
  flame_slime: 'slime_cat_skins/hue_20', aqua_slime: 'slime_cat_skins/hue_180',
  violet_slime: 'slime_cat_skins/hue_300', shadow_mouse_smooth: 'shadow_mouse',
}
// walk 文件前缀（默认=action，shadow_mouse_smooth 例外用 'frame'）
const WALK_PREFIX = { shadow_mouse_smooth: 'frame' }

const FILE = {
  slime_cat: 'slime-cat.js', wild_cat: 'wild-cat.js', shadow_mouse: 'shadow-mouse.js',
  lost_healer_cat: 'lost-healer-cat.js',
}
function cfgFile(enemyId) {
  if (enemyId === 'flame_slime' || enemyId === 'aqua_slime' || enemyId === 'violet_slime')
    return require(path.join(ROOT, 'scripts/entities/monsters/slime_cat_skins.js'))[enemyId]
  if (enemyId === 'shadow_mouse_smooth')
    return require(path.join(ROOT, 'scripts/entities/monsters/shadow-mouse-tween.js'))
  return require(path.join(ROOT, `scripts/entities/monsters/${FILE[enemyId]}`))
}

function diskExists(enemyId, action, num) {
  let dir = DIR[enemyId]
  if (enemyId === 'shadow_mouse_smooth' && action === 'walk') dir = 'shadow_mouse/walk_tween'
  const filePrefix = (action === 'walk' && WALK_PREFIX[enemyId]) ? WALK_PREFIX[enemyId] : action
  const rel = `images/characters_anim/transparent/${dir}/${action}/${filePrefix}_${num}.png`
  return fs.existsSync(path.join(ROOT, PKG + rel)) || fs.existsSync(path.join(ROOT, rel))
}

let totalReq = 0, totalMiss = 0
const missing = []
for (const enemyId of Object.keys(DIR)) {
  const cfg = cfgFile(enemyId)
  const anim = (cfg && cfg.animationConfig) || {}
  for (const action of ['idle', 'walk', 'attack', 'hurt', 'death', 'skill']) {
    const conf = anim[action]
    if (!conf) continue
    const reqs = []
    if (conf.frameList) {
      for (const f of conf.frameList) reqs.push([f, conf.framePad])
    } else {
      for (let i = conf.start; i <= conf.end; i++) reqs.push([i, conf.framePad])
    }
    for (const [f, pad] of reqs) {
      const num = String(f).padStart(pad, '0')
      totalReq++
      if (!diskExists(enemyId, action, num)) {
        totalMiss++
        missing.push(`${enemyId}.${action} -> ${num}`)
      }
    }
  }
}
console.log(`渲染会请求的总帧数: ${totalReq}`)
console.log(`磁盘缺失(必导致 emoji)的帧数: ${totalMiss}`)
if (missing.length) {
  console.log('--- 缺失清单(前80) ---')
  console.log(missing.slice(0, 80).join('\n'))
} else {
  console.log('>> 所有请求帧在磁盘均有文件：emoji 非资源缺失导致，需查 animFrame/运行时')
}
