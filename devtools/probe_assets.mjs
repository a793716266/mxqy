// 探针：mock wx.createImage，跑 loadAll(ASSETS)，检查 SLIME_CAT_* / HERO_ZHENBAO_* 是否解析到真实文件
import fs from 'node:fs'
import path from 'node:path'

const PROJECT_ROOT = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native'

globalThis.wx = {
  createImage() {
    const img = { _path: '', onload: null, onerror: null }
    Object.defineProperty(img, 'src', {
      set(v) {
        img._path = v
        const p = path.resolve(PROJECT_ROOT, v)
        if (fs.existsSync(p)) {
          if (img.onload) img.onload()
        } else {
          if (img.onerror) img.onerror(new Error('missing: ' + v))
        }
      },
      get() { return img._path },
    })
    return img
  },
}

const { AssetManager, ASSETS } = await import(PROJECT_ROOT + '/scripts/core/asset-manager.js')

const mgr = new AssetManager()
await mgr.loadAll(ASSETS)
const total = Object.keys(ASSETS).length
const loaded = Object.keys(mgr.images).length
console.log(`ASSETS 总数=${total}, 成功加载=${loaded}`)

const keys = Object.keys(ASSETS)
const missing = keys.filter(k => !mgr.images[k])
console.log(`失败 key 数=${missing.length}`)

const focusPrefixes = ['SLIME_CAT', 'SHADOW_MOUSE', 'HERO_ZHENBAO', 'AIMI', 'FLAME_SLIME']
for (const pfx of focusPrefixes) {
  const all = keys.filter(k => k.startsWith(pfx))
  const fail = all.filter(k => !mgr.images[k])
  console.log(`\n[${pfx}] 共 ${all.length} 个, 失败 ${fail.length} 个`)
  if (fail.length) console.log('  失败样例:', fail.slice(0, 6).join(', '))
}

console.log('\n=== 全部失败 key (前40) ===')
console.log(missing.slice(0, 40).join('\n'))
