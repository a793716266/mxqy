// 决定性探针：用真实 fs 判断文件存在性的 mock wx.createImage，
// 复现 AssetManager.loadAll 在「文件真正存在/缺失」时的行为，
// 然后逐一核对史莱姆猫渲染端会请求的帧 key 是否能 get 到。
import fs from 'fs'
import path from 'path'
import { AssetManager } from '../scripts/core/asset-manager.js'
import { ASSETS } from '../scripts/core/asset-manager.js'
import slimeCat from '../scripts/entities/monsters/slime-cat.js'

// 真实 fs 支持的 createImage mock
globalThis.wx = {
  createImage() {
    return {
      _src: '',
      set src(v) {
        this._src = v
        const abs = path.resolve(process.cwd(), v)
        if (fs.existsSync(abs)) {
          // 模拟异步加载成功
          setImmediate(() => {
            this.width = 93
            this.height = 120
            if (this.onload) this.onload()
          })
        } else {
          setImmediate(() => {
            if (this.onerror) this.onerror(new Error('ENOENT ' + v))
          })
        }
      },
      get src() { return this._src }
    }
  }
}

const mgr = new AssetManager()
await mgr.loadAll(ASSETS)

// 1) 统计 SLIME_CAT_* 加载结果
const slimeKeys = Object.keys(mgr.images).filter(k => k.startsWith('SLIME_CAT_'))
const slimeMissing = Object.keys(ASSETS).filter(k => k.startsWith('SLIME_CAT_') && !mgr.images[k])
console.log('=== SLIME_CAT 注册数:', Object.keys(ASSETS).filter(k => k.startsWith('SLIME_CAT_')).length)
console.log('=== SLIME_CAT 成功加载数:', slimeKeys.length)
console.log('=== SLIME_CAT 缺失 key:', slimeMissing.length ? slimeMissing : '（无，全部加载成功）')

// 2) 用配置算出渲染端会请求的 key 集合，逐一核对 get
function buildKey(prefix, action, frameNum, pad) {
  return `${prefix}_${action.toUpperCase()}_${String(frameNum).padStart(pad, '0')}`
}
const cfg = slimeCat.animationConfig
const requested = []
// walk (continuous 1..12, pad2)
for (let i = cfg.walk.start; i <= cfg.walk.end; i++) requested.push(buildKey('SLIME_CAT', 'walk', i, cfg.walk.framePad))
for (let i = cfg.idle.start; i <= cfg.idle.end; i++) requested.push(buildKey('SLIME_CAT', 'idle', i, cfg.idle.framePad))
for (const f of cfg.attack.frameList) requested.push(buildKey('SLIME_CAT', 'attack', f, cfg.attack.framePad))
for (const f of cfg.skill.frameList) requested.push(buildKey('SLIME_CAT', 'skill', f, cfg.skill.framePad))

const missingRequested = [...new Set(requested)].filter(k => !mgr.images[k])
console.log('\n=== 渲染端会请求的 key 数(去重):', new Set(requested).size)
console.log('=== 其中加载失败/缺失:', missingRequested.length ? missingRequested : '（无，全部命中）')

// 3) 直接 stat 磁盘上注册路径，看哪些文件真的不存在
const fsMissing = []
for (const [k, p] of Object.entries(ASSETS)) {
  if (k.startsWith('SLIME_CAT_') && !fs.existsSync(path.resolve(process.cwd(), p))) fsMissing.push(p)
}
console.log('\n=== 磁盘上缺失的 SLIME_CAT 文件:', fsMissing.length ? fsMissing : '（无，全部存在）')
