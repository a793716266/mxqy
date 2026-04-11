/**
 * 微信小游戏语法检查脚本
 * 使用 @babel/parser 解析JS文件，模拟微信编译器的严格程度
 * 
 * 用法: node scripts/tools/check_syntax.js [文件路径|目录]
 * 默认检查 scripts/ 目录下所有 .js 文件
 * 
 * 注意: 首次运行需要安装依赖:
 *   npm install --save-dev @babel/parser
 */

import { parse } from '@babel/parser'
import { readFileSync, statSync, readdirSync } from 'fs'
import { resolve, extname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
// 脚本位于 scripts/tools/，项目根目录是上级的上级
const PROJECT_ROOT = resolve(__dirname, '..', '..')

function collectJsFiles(targetPath) {
  const files = []
  const stat = statSync(targetPath)
  
  if (stat.isFile() && targetPath.endsWith('.js')) {
    return [targetPath]
  }
  
  if (stat.isDirectory()) {
    const entries = readdirSync(targetPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const fullPath = resolve(targetPath, entry.name)
      if (entry.isDirectory()) {
        files.push(...collectJsFiles(fullPath))
      } else if (extname(entry.name) === '.js') {
        files.push(fullPath)
      }
    }
  }
  return files.sort()
}

function checkFile(filePath) {
  const code = readFileSync(filePath, 'utf-8')
  try {
    parse(code, {
      sourceType: 'module',
      plugins: [
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'optionalChaining',
        'nullishCoalescingOperator',
        'bigInt',
        'dynamicImport',
        'topLevelAwait',
      ],
      errorRecovery: false,
    })
    return null
  } catch (err) {
    // 只返回真正的语法错误，过滤掉类型推断的噪音
    if (err instanceof SyntaxError) {
      return {
        line: err.loc?.line ?? 0,
        column: err.loc?.column ?? 0,
        message: err.message.replace(/^.*?:\s*/, '').replace(/\s*\(\d+:\d+\)$/, ''),
      }
    }
    return { line: 0, column: 0, message: err.message }
  }
}

// === 主流程 ===
const targetArg = process.argv[2] ? resolve(process.argv[2]) : resolve(PROJECT_ROOT, 'scripts')
const files = collectJsFiles(targetArg)

console.log(`\n[Babel Syntax Check] 检查 ${files.length} 个 JS 文件...\n`)

let passCount = 0
let failCount = 0
const errors = []

for (const file of files) {
  const relFile = file.replace(PROJECT_ROOT + '/', '')
  const err = checkFile(file)
  if (!err) {
    passCount++
  } else {
    failCount++
    errors.push({ file: relFile, ...err })
    console.error(`  ✗ ${relFile}:${err.line}:${err.column}  ${err.message}`)
  }
}

if (failCount === 0) {
  console.log(`  全部通过 (${passCount}/${files.length})\n`)
  process.exit(0)
} else {
  console.log(`\n  失败 ${failCount}/${files.length}\n`)
  process.exit(1)
}
