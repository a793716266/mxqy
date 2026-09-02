#!/usr/bin/env node
/**
 * optimize_png.js —— 批量压缩分包/主包 PNG，默认只处理最大的 characters_anim。
 *
 * ★ 设计原则（2026-09-01）：
 *   1) 先备份原图到 tools/images/_backup_originals/ 并退出打包（不在 subpackages 内）
 *   2) 调用 pngquant 量化到调色板，保留 RGBA、尺寸、alpha
 *   3) 跳过"压缩后反而更大"的 pngquant --skip-if-larger
 *   4) 可选 --restore 一键把备份盖回来
 *   5) 有进度和节省统计
 *
 * 用法：
 *   npm run optimize-images                      # 默认优化 subpackages/battle/images/characters_anim
 *   npm run optimize-images -- subpackages/battle/images/backgrounds
 *   npm run optimize-images --restore             # 从备份还原全部
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..', '..')
const BACKUP_ROOT = path.join(ROOT, 'tools', 'images', '_backup_originals')

// 默认目标：体积最大的角色动画目录
const DEFAULT_TARGETS = [
  'subpackages/battle/images/characters_anim',
]

const PNGQUANT_QUALITY = '82-100'
const PNGQUANT_SPEED = '1'

function fmt(b) {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)}MB`
  if (b > 1024) return `${(b / 1024).toFixed(1)}KB`
  return `${b}B`
}

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

function hashRel(rel) {
  return crypto.createHash('sha1').update(rel).digest('hex').slice(0, 12)
}

function backupPath(rel) {
  // 用 sha1(相对路径) 做文件名，避免特殊字符问题
  return path.join(BACKUP_ROOT, hashRel(rel) + '.png')
}

function indexPath() { return path.join(BACKUP_ROOT, '_index.json') }

function loadIndex() {
  const p = indexPath()
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {}
}
function saveIndex(idx) {
  fs.writeFileSync(indexPath(), JSON.stringify(idx, null, 2))
}

function findPngs(dir) {
  const out = []
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.isFile() && e.name.toLowerCase().endsWith('.png')) out.push(p)
    }
  }
  return out.sort()
}

function pngquantAvailable() {
  try { execFileSync('pngquant', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

function getInfo(p) {
  // 用 ffprobe 读尺寸和模式太贵，用文件头速读
  const buf = fs.readFileSync(p, { start: 16, length: 8 })
  return { width: buf.readUInt32BE(0), height: buf.readUInt32BE(4) }
}

function optimizeOne(abs, rel, idx, dry) {
  const before = fs.statSync(abs).size
  const h = hashRel(rel)
  const back = backupPath(rel)

  // 没有备份先创建（幂等：已存在就不覆盖，避免多次跑把原始备份给冲掉）
  if (!fs.existsSync(back)) {
    ensureDir(path.dirname(back))
    fs.copyFileSync(abs, back)
  }

  if (dry) {
    console.log(`  [dry] ${rel} ${fmt(before)}`)
    return { before, after: before, skipped: true }
  }

  const tmp = abs + '.tmp.png'
  try {
    execFileSync('pngquant', [
      '--quality', PNGQUANT_QUALITY,
      '--speed', PNGQUANT_SPEED,
      '--strip',
      '--skip-if-larger',
      '--force',
      '--output', tmp,
      abs,
    ], { stdio: ['ignore', 'ignore', 'inherit'] })
  } catch (e) {
    // --skip-if-larger 会以 98/99 退出；其它错误需要清理 tmp
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    // 98 = skipped, 99 = too low quality; 都保留原文件
    if (e.status === 98 || e.status === 99) {
      return { before, after: before, skipped: true }
    }
    throw new Error(`pngquant failed on ${rel}: ${e.message}`)
  }

  if (!fs.existsSync(tmp)) {
    // 被跳过或失败
    return { before, after: before, skipped: true }
  }

  const after = fs.statSync(tmp).size
  const beforeInfo = getInfo(abs)
  const afterInfo = getInfo(tmp)
  if (beforeInfo.width !== afterInfo.width || beforeInfo.height !== afterInfo.height) {
    fs.unlinkSync(tmp)
    throw new Error(`尺寸变化：${rel} ${beforeInfo.width}x${beforeInfo.height} -> ${afterInfo.width}x${afterInfo.height}`)
  }

  // 保留一份压缩前的当前版本到备份（如果之前还没备份）
  fs.renameSync(tmp, abs)
  idx[h] = { rel, backed: true, ts: new Date().toISOString() }

  return { before, after, skipped: false }
}

function optimizeTargets(targets, dry) {
  ensureDir(BACKUP_ROOT)
  const idx = loadIndex()
  let totalBefore = 0, totalAfter = 0, totalCount = 0, skipped = 0, errors = []

  for (const t of targets) {
    const dir = path.join(ROOT, t)
    if (!fs.existsSync(dir)) { console.warn(`目录不存在：${dir}`); continue }
    const files = findPngs(dir)
    console.log(`\n处理：${t}（${files.length} 张 PNG）`)
    for (const file of files) {
      const rel = path.relative(ROOT, file)
      try {
        const r = optimizeOne(file, rel, idx, dry)
        totalBefore += r.before
        totalAfter += r.after
        totalCount++
        if (r.skipped) skipped++
        else if (totalCount % 50 === 0) console.log(`  ...已处理 ${totalCount} 张`)
      } catch (e) {
        errors.push(`${rel}: ${e.message}`)
        console.error(`  ✗ ${rel}: ${e.message}`)
      }
    }
  }

  saveIndex(idx)

  console.log('\n==================== 压缩汇总 ====================')
  console.log(`处理文件: ${totalCount} 张（跳过/失败保留原样: ${skipped + errors.length} 张）`)
  console.log(`压缩前:   ${fmt(totalBefore)}`)
  console.log(`压缩后:   ${fmt(totalAfter)}`)
  const save = totalBefore - totalAfter
  console.log(`节省:     ${fmt(save)}  (${save > 0 ? (save / totalBefore * 100).toFixed(1) : 0}%)`)
  if (errors.length) console.log(`错误:     ${errors.length} 个（未压缩）`)
}

function restore() {
  const idx = loadIndex()
  let restored = 0, missing = 0
  for (const h of Object.keys(idx)) {
    const { rel } = idx[h]
    const back = backupPath(rel)
    const target = path.join(ROOT, rel)
    if (!fs.existsSync(back)) { missing++; continue }
    ensureDir(path.dirname(target))
    fs.copyFileSync(back, target)
    restored++
  }
  console.log(`还原完成：${restored} 个文件已恢复；备份缺失 ${missing} 个`)
}

function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry') || args.includes('-n')
  if (args.includes('--restore') || args.includes('-r')) {
    restore()
    return
  }
  if (!pngquantAvailable()) {
    console.error('未找到 pngquant，请先安装：brew install pngquant')
    process.exit(1)
  }
  const targets = args.filter(a => !a.startsWith('-'))
  if (!targets.length) targets.push(...DEFAULT_TARGETS)
  optimizeTargets(targets, dry)
}

main()
