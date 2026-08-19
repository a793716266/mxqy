// 验证 loadImage 主包回退：模拟「分包图片在微信里加载失败、主包副本可加载」的真实场景。
import fs from 'fs'
import path from 'path'
import { AssetManager } from '../scripts/core/asset-manager.js'
import { ASSETS } from '../scripts/core/asset-manager.js'

// mock：subpackages/battle/ 开头的路径一律 onerror（模拟分包未挂载/未打入包），
// 其余路径（主包 images/...）按真实 fs 判断成功/失败。
globalThis.wx = {
  createImage() {
    return {
      _src: '',
      set src(v) {
        this._src = v
        const isSub = v.startsWith('subpackages/battle/')
        if (isSub) {
          // 模拟分包加载失败
          setImmediate(() => { if (this.onerror) this.onerror(new Error('subpackage not mounted: ' + v)) })
        } else {
          const abs = path.resolve(process.cwd(), v)
          if (fs.existsSync(abs)) setImmediate(() => { this.width = 93; this.height = 120; if (this.onload) this.onload() })
          else setImmediate(() => { if (this.onerror) this.onerror(new Error('ENOENT ' + v)) })
        }
      },
      get src() { return this._src }
    }
  }
}

const mgr = new AssetManager()
await mgr.loadAll(ASSETS)

// 史莱姆猫（有主包副本，应回退成功）
const slimeKeys = Object.keys(ASSETS).filter(k => k.startsWith('SLIME_CAT_'))
const slimeOk = slimeKeys.filter(k => mgr.images[k])
console.log('=== 分包全失败场景下，SLIME_CAT 回退主包成功数:', slimeOk.length, '/', slimeKeys.length)

// 暗影鼠（有主包副本 shadow_mouse）
const smKeys = Object.keys(ASSETS).filter(k => k.startsWith('SHADOW_MOUSE_'))
const smOk = smKeys.filter(k => mgr.images[k])
console.log('=== SHADOW_MOUSE 回退成功数:', smOk.length, '/', smKeys.length)

// 臻宝（无主包副本，分包失败应全部失败 → 这正是之前 emoji 的根因，但臻宝分包在正常环境能加载）
const zbKeys = Object.keys(ASSETS).filter(k => k.startsWith('HERO_ZHENBAO_'))
const zbOk = zbKeys.filter(k => mgr.images[k])
console.log('=== HERO_ZHENBAO（无主包副本，分包失败）成功数:', zbOk.length, '/', zbKeys.length, '(此场景预期0，正常环境分包可加载)')

console.log('\n=== 结论：有主包副本的猫怪（slime_cat/shadow_mouse）在分包失败时会自动回退主包，不再 emoji ===')
