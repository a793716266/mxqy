import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const nodeRequire = createRequire(import.meta.url)
globalThis.require = (p) => {
  const abs = p.startsWith('.') ? path.resolve(projectRoot, 'scripts', 'data', p) : p
  return nodeRequire(abs)
}

const THEMES = await import(path.resolve(projectRoot, 'scripts', 'data', 'field-map-themes.js'))
const AM = await import(path.resolve(projectRoot, 'scripts', 'core', 'asset-manager.js'))

// 收集 assetKey → 相对路径
const keys = Object.values(AM).concat(Object.values(AM.default || {}))
let ASSET_MAP = null
for (const k of keys) {
  if (k && typeof k === 'object' && !Array.isArray(k)) {
    const sample = Object.keys(k).slice(0, 3).join(',')
    if (/TOWN_|TREE|ROCK|GRASS|FLOWER|maps_|BUILDING/.test(sample) || k.TOWN_MOUNTAIN) { ASSET_MAP = k; break }
  }
}
if (!ASSET_MAP) {
  for (const [name, val] of Object.entries({ ...AM, ...(AM.default || {}) })) {
    if (val && typeof val === 'object' && !Array.isArray(val) && val.TOWN_MOUNTAIN) { ASSET_MAP = val; break }
  }
}

const AREAS = ['grassland', 'magic_tower', 'merchant_town', 'ancient_ruins', 'void_mist', 'forest', 'cave']
const out = { root: projectRoot, assets: {}, maps: {} }
const used = new Set()
for (const area of AREAS) {
  const t = THEMES.getFieldMap(area)
  out.maps[area] = {
    name: t.name, width: t.width, height: t.height, bg: t.bg,
    spawn: t.spawn, boss: t.boss, path: t.path,
    objects: t.objects.map(o => ({ assetKey: o.assetKey, x: o.x, y: o.y, w: o.w || o.width || 64, h: o.h || o.height || 64, type: o.type })),
    collisions: t.collisions
  }
  t.objects.forEach(o => used.add(o.assetKey))
}
for (const k of used) if (ASSET_MAP && ASSET_MAP[k]) out.assets[k] = ASSET_MAP[k]

fs.writeFileSync('/tmp/field_maps.json', JSON.stringify(out))
console.log('导出完成：区域', AREAS.length, '| 素材', Object.keys(out.assets).length)
