/**
 * 批量替换 battle 目录中的 console.log 为 this._addDebugLog()
 * 只替换包含调试标签的日志：[Enemy AI], [Battle], [治愈冲击调试], [调试]
 */

const fs = require('fs')
const path = require('path')

const BATTLE_DIR = path.join(__dirname, '..', 'scenes', 'battle')
const DEBUG_TAGS = ['[Enemy AI]', '[Battle]', '[治愈冲击调试]', '[调试]', '[Enemy]', '[Hero]', '[AI]']

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  let modified = false
  
  // 替换包含调试标签的 console.log
  DEBUG_TAGS.forEach(tag => {
    const regex = new RegExp(`console\\.log\\(\`${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (.*?)\`\\)`, 'g')
    const newContent = content.replace(regex, (match, p1) => {
      modified = true
      return `this._addDebugLog(\`${tag} ${p1}\`)`
    })
    
    if (newContent !== content) {
      content = newContent
    }
  })
  
  // 也处理双引号的情况
  DEBUG_TAGS.forEach(tag => {
    const regex = new RegExp(`console\\.log\\("${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (.*?)"\\)`, 'g')
    const newContent = content.replace(regex, (match, p1) => {
      modified = true
      return `this._addDebugLog("${tag} ${p1}")`
    })
    
    if (newContent !== content) {
      content = newContent
    }
  })
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`✅ 已处理: ${path.basename(filePath)}`)
    return true
  }
  
  return false
}

// 处理 battle 目录中的所有 JS 文件
const files = fs.readdirSync(BATTLE_DIR)
  .filter(f => f.endsWith('.js'))
  .map(f => path.join(BATTLE_DIR, f))

console.log(`\n[Debug Log Replacer] 开始处理 ${files.length} 个文件...\n`)

let processedCount = 0
files.forEach(file => {
  if (processFile(file)) {
    processedCount++
  }
})

console.log(`\n✅ 完成！共处理 ${processedCount} 个文件\n`)
