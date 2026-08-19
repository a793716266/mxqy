// 验证史莱姆猫（分包）PNG 是否结构完整、可被解码（对照臻宝）。
// 失败模式：fs.exists 通过，但 wx.createImage onerror（损坏/格式异常）→ key 永不写入 → emoji。
import fs from 'fs'
import zlib from 'zlib'
import path from 'path'

function checkPng(rel) {
  const abs = path.resolve(process.cwd(), rel)
  if (!fs.existsSync(abs)) return { rel, exists: false }
  const buf = fs.readFileSync(abs)
  // 签名
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buf.subarray(0, 8).equals(sig)) return { rel, exists: true, ok: false, reason: 'bad-signature' }
  // IHDR
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, idat = [], iend = false
  try {
    while (off < buf.length) {
      const len = buf.readUInt32BE(off)
      const type = buf.toString('ascii', off + 4, off + 8)
      const data = buf.subarray(off + 8, off + 8 + len)
      if (type === 'IHDR') {
        w = data.readUInt32BE(0); h = data.readUInt32BE(4)
        bitDepth = data[8]; colorType = data[9]
      } else if (type === 'IDAT') {
        idat.push(data)
      } else if (type === 'IEND') {
        iend = true; break
      }
      off += 12 + len
    }
  } catch (e) {
    return { rel, exists: true, ok: false, reason: 'parse-error: ' + e.message }
  }
  if (!iend) return { rel, exists: true, ok: false, reason: 'no-IEND' }
  // 尝试 inflate IDAT（真正解码能力）
  try {
    const raw = zlib.inflateSync(Buffer.concat(idat))
    const channels = [0, 0, 0, 0, 0, 0, 4, 0, 4, 4, 0, 0, 4][colorType] || 4
    const expected = h * (w * channels + 1) // +1 for filter byte per row
    const ok = raw.length === expected
    return { rel, exists: true, ok, w, h, colorType, bitDepth, rawLen: raw.length, expected, reason: ok ? 'ok' : `len-mismatch raw=${raw.length} exp=${expected}` }
  } catch (e) {
    return { rel, exists: true, ok: false, reason: 'inflate-error: ' + e.message }
  }
}

const base = 'subpackages/battle/images/characters_anim/transparent/slime_cat'
const groups = {
  walk: [1,2,3,4,5,6,7,8,9,10,11,12].map(n => `${base}/walk/walk_${String(n).padStart(2,'0')}.png`),
  idle: [1,2,3,4,5,6,7].map(n => `${base}/idle/idle_${n}.png`),
  attack: [8,10,12,14,16,18,20,22].map(n => `${base}/attack/attack_${String(n).padStart(4,'0')}.png`),
  skill: [50,53,56,59,62,65,68,71,74,77,80].map(n => `${base}/skill/skill_${String(n).padStart(4,'0')}.png`),
}
let bad = []
for (const [g, list] of Object.entries(groups)) {
  for (const f of list) {
    const r = checkPng(f)
    if (!r.ok) { bad.push(r); console.log('BAD', f, JSON.stringify(r)) }
  }
}
console.log(`\n史莱姆猫分包 PNG 检查：合计 ${Object.values(groups).flat().length} 张，损坏/异常 ${bad.length} 张`)

// 对照：臻宝 walk 前几张
console.log('\n--- 对照 臻宝（分包）---')
const zb = ['subpackages/battle/images/characters_anim/transparent/zhenbao/walk/walk_01.png',
            'subpackages/battle/images/characters_anim/transparent/zhenbao/walk/walk_02.png',
            'subpackages/battle/images/characters_anim/transparent/zhenbao/idle/idle_01.png']
for (const f of zb) console.log(f, JSON.stringify(checkPng(f)))
