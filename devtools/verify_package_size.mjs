/**
 * verify_package_size.mjs
 *
 * 主包体积门禁：微信小游戏主包 ≤ 4MB（4096KB），整包 ≤ 20MB。
 *
 * ★ 关键配置位置（2026-09-01 线上 BUG 修复）：
 *   `packOptions.ignore` 写在 `project.config.json`（不是 game.json）！
 *   小游戏 / 小程序的 packOptions 都在 project.config.json 里。
 *
 * 本脚本读取 project.config.json 的 packOptions.ignore + game.json 的 subpackages，
 * 重新估算主包"参与打包的文件"总大小，断言 ≤ 3.5MB（留 500KB 余量给 minify + 图片）。
 *
 * 用法：`npm run verify-package-size`
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const MAIN_LIMIT = 3.5 * 1024 * 1024       // 主包软上限（4MB - 500KB 安全余量）
const TOTAL_LIMIT = 20 * 1024 * 1024      // 整包硬上限（微信）
const TOTAL_SOFT_LIMIT = 18 * 1024 * 1024 // 整包软门禁（留 2MB 余量）

// 读取 ignore 配置（project.config.json 而不是 game.json）
const projectCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'))
const gameJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.json'), 'utf8'))
const subpackageRoots = (gameJson.subpackages || []).map(s => s.root.replace(/\/+$/, ''))
const ignoreFolders = new Set()
const ignoreFiles = []   // 存 pattern，支持通配符匹配（**/*.py 等）
for (const rule of (projectCfg.packOptions && projectCfg.packOptions.ignore) || []) {
  if (rule.type === 'folder') ignoreFolders.add(rule.value.replace(/\/+$/, ''))
  else if (rule.type === 'file') ignoreFiles.push(rule.value)
}
// 兜底：永远不参与（即便没配 ignore）
const SKIP_DIRS = new Set(['.git', '.venv', 'venv', '.workbuddy', '.codebuddy', 'node_modules', '__pycache__'])

let passed = 0, failed = 0
const assert = (c, n, d) => { if (c) { passed++; console.log(`  ✓ ${n}`) } else { failed++; console.log(`  ✗ ${n}  ${d || ''}`) } }

// 把 file 通配 pattern 编译为正则（支持 ** 跨任意目录、* 单层、? 单字符）
function globToRegex(pattern) {
  // 先用占位符保护 glob 元字符，避免被正则转义吃掉
  let s = pattern
    .replace(/\*\*\//g, '__GSP__')          // **/ 整体占位（不含 /）
    .replace(/\?/g, '__Q__')
    .replace(/\*\*/g, '__GS__')              // 单独 ** 占位（匹配任意内容）
    .replace(/\*/g, '__S__')                 // 单层 *
  s = s.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/__GSP__/g, '(?:.*/)?')         // **/ → 可选任意目录前缀（含 /）
    .replace(/__GS__/g, '.*')
    .replace(/__S__/g, '[^/]*')
    .replace(/__Q__/g, '[^/]')
  return new RegExp('^' + s + '$')
}
const ignoreFileRegexes = ignoreFiles.map(p => globToRegex(p))

/**
 * 递归统计目录真实字节数。
 *
 * ★ 2026-09-01 BUG 修复：本脚本是 ESM（.mjs），里面 `require('child_process')` 会抛
 *   `ReferenceError: require is not defined`，而调用点全都包在 try/catch 里 →
 *   异常被静默吞掉 → 分包体积恒为 0 → 整包报 "3.02MB"，而真实体积 31MB（严重超 20MB 上限）。
 *   现在改为纯 fs 递归，不依赖任何子进程，出错必须显式暴露。
 *
 * @param {string} abs 绝对路径
 * @param {(rel:string)=>boolean} [skip] 传入时按 ignore 规则跳过（用于分包统计真实入包体积）
 */
function dirSize(abs, skip) {
  let bytes = 0, count = 0
  const stack = [abs]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try { entries = fs.readdirSync(cur, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = path.join(cur, e.name)
      if (SKIP_DIRS.has(e.name)) continue
      const rel = path.relative(ROOT, p).replace(/\\/g, '/')
      if (skip && skip(rel)) continue
      if (e.isDirectory()) stack.push(p)
      else if (e.isFile()) {
        try { bytes += fs.statSync(p).size; count++ } catch { /* 断链软链接 */ }
      }
    }
  }
  return { bytes, count }
}

function isIgnored(rel) {
  const norm = rel.replace(/\\/g, '/')
  const base = path.basename(norm)
  // file 类型 pattern 匹配
  for (const re of ignoreFileRegexes) if (re.test(norm) || re.test(base)) return true
  // folder 类型匹配（精确 + 前缀）
  const parts = norm.split('/')
  let acc = ''
  for (const p of parts) { acc = acc ? `${acc}/${p}` : p; if (ignoreFolders.has(acc)) return true }
  for (const fol of ignoreFolders) if (norm === fol || norm.startsWith(fol + '/')) return true
  return false
}

// 递归扫主包（按真实打包行为：非 ignore 命中即计入）
function scanMain() {
  const files = []
  const ignoredTotal = { bytes: 0, count: 0 }
  const ignoredTop = []

  function walk(dir) {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const abs = path.join(dir, e.name)
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
      if (SKIP_DIRS.has(e.name)) {
        if (e.isDirectory()) addIgnored(rel, abs, true)
        continue
      }
      if (isIgnored(rel)) {
        addIgnored(rel, abs, e.isDirectory())
        continue
      }
      if (subpackageRoots.some(r => rel === r || rel.startsWith(r + '/'))) continue
      if (e.isDirectory()) walk(abs)
      else if (e.isFile()) files.push({ rel, size: fs.statSync(abs).size })
    }
  }
  function addIgnored(rel, abs, isDir) {
    let bytes = 0
    if (isDir) {
      bytes = dirSize(abs).bytes
    } else {
      bytes = fs.statSync(abs).size
    }
    ignoredTotal.bytes += bytes
    ignoredTotal.count += 1
    ignoredTop.push({ rel, bytes })
  }
  walk(ROOT)
  return { files, ignoredTotal, ignoredTop }
}

const { files, ignoredTotal, ignoredTop } = scanMain()
const mainBytes = files.reduce((s, f) => s + f.size, 0)
const ignoredTopSorted = ignoredTop.sort((a, b) => b.bytes - a.bytes).slice(0, 5)

console.log('\n【主包体积估算】')
console.log(`  参与打包文件: ${files.length} 个, 合计 ${fmt(mainBytes)} (${(mainBytes / 1024).toFixed(0)} KB)`)
console.log(`  软上限:       ${fmt(MAIN_LIMIT)} (3.5MB / 4MB 微信限制)`)
console.log(`  被忽略:       ${ignoredTotal.count} 项, 共节省 ${fmt(ignoredTotal.bytes)}`)
console.log('  top5 被忽略:')
for (const it of ignoredTopSorted) console.log(`    - ${it.rel}  ${fmt(it.bytes)}`)

console.log('\n【主包 TOP 10 大文件】')
files.sort((a, b) => b.size - a.size).slice(0, 10).forEach(f => {
  console.log(`  ${(f.size / 1024).toFixed(1).padStart(7)} KB  ${f.rel}`)
})

// 整包估算：主包 + 每个分包（分包同样受 packOptions.ignore 约束）
const subStats = []
let totalBytes = mainBytes
for (const sub of subpackageRoots) {
  const abs = path.join(ROOT, sub)
  if (!fs.existsSync(abs)) {
    subStats.push({ sub, bytes: 0, count: 0, missing: true })
    continue
  }
  const { bytes, count } = dirSize(abs, isIgnored)
  subStats.push({ sub, bytes, count, missing: false })
  totalBytes += bytes
}

console.log('\n【分包体积】')
if (!subStats.length) console.log('  （game.json 未配置 subpackages）')
for (const s of subStats.sort((a, b) => b.bytes - a.bytes)) {
  console.log(`  ${fmt(s.bytes).padStart(9)}  ${String(s.count).padStart(4)} 文件  ${s.sub}${s.missing ? '  ← 目录不存在！' : ''}`)
}

console.log(`\n【整包估算】≈ ${fmt(totalBytes)} / ${fmt(TOTAL_LIMIT)}（20MB 微信限制），软门禁 ${fmt(TOTAL_SOFT_LIMIT)}`)
if (totalBytes > TOTAL_SOFT_LIMIT) {
  console.log('  ⚠️ 已超软门禁。按体积降序排查上面的分包，优先压缩图片/音频码率。')
}

console.log('\n【断言】')
assert(mainBytes <= MAIN_LIMIT, `主包 ≤ ${fmt(MAIN_LIMIT)}`, `当前 ${fmt(mainBytes)}`)
assert(files.length > 0, '主包有真实代码文件（非空工程）')
assert(ignoreFolders.has('_source_backup'), 'project.config.json 已忽略 _source_backup/（75M 元凶）')
assert(ignoreFolders.has('devtools'), 'project.config.json 已忽略 devtools/（防止开发脚本进生产包）')
assert(ignoreFolders.has('.venv'), 'project.config.json 已忽略 .venv/（Python 虚拟环境 145M）')
assert(ignoreFolders.has('outputs'), 'project.config.json 已忽略 outputs/（预览图）')
assert(ignoreFolders.has('tools'), 'project.config.json 已忽略 tools/（map-editor 工具）')
assert(ignoreFiles.some(p => p.includes('.py')), 'project.config.json 已忽略 *.py（Python 工具脚本）')
assert(ignoreFiles.some(p => p.includes('.html')), 'project.config.json 已忽略 *.html')
assert(ignoreFiles.some(p => p.includes('.original')), 'project.config.json 已忽略 *.original（备份）')
assert(subpackageRoots.length >= 1, '存在分包（避免主包过大）')
// ★ 整包断言：此前因 ESM require BUG，分包恒计 0，本条形同虚设（报 3.02MB / 真实 31MB）
assert(subStats.every(s => !s.missing), 'game.json 声明的分包目录都真实存在')
assert(subStats.some(s => s.bytes > 0), '分包体积统计非 0（防 ESM require BUG 再次静默漏算）')
assert(totalBytes <= TOTAL_LIMIT, `整包 ≤ ${fmt(TOTAL_LIMIT)}（微信硬上限）`, `当前 ${fmt(totalBytes)}`)
assert(totalBytes <= TOTAL_SOFT_LIMIT, `整包 ≤ ${fmt(TOTAL_SOFT_LIMIT)}（软门禁，留 2MB 余量）`, `当前 ${fmt(totalBytes)}`)

console.log(`\n结果: ${passed} 通过 / ${failed} 失败`)
process.exit(failed === 0 ? 0 : 1)

function fmt(b) {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)}MB`
  if (b > 1024) return `${(b / 1024).toFixed(1)}KB`
  return `${b}B`
}