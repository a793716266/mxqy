/**
 * sunny-grassland-test.js - 喵星奇缘 阳光草原自动化探索测试
 * 
 * 流程：
 * 1. 连接微信开发者工具自动化端口
 * 2. 启动/连接小游戏
 * 3. 点击"开始冒险"进入游戏
 * 4. 探索阳光草原地图
 * 5. 收集 console 报错、截图、场景状态
 */

const automator = require('miniprogram-automator')

const IDE_PORT = 26529
const PROJECT_PATH = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native'
const SCREENSHOT_DIR = '/Users/jacob/WorkBuddy/20260329175454/meow-star-native/scripts/automation/screenshots'

const fs = require('fs')
const path = require('path')

// 记录所有 console 消息和错误
const consoleLogs = []
const errors = []
let miniProgram = null

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function screenshot(name) {
  try {
    ensureDir(SCREENSHOT_DIR)
    const file = path.join(SCREENSHOT_DIR, `${name}.png`)
    await miniProgram.screenshot({ path: file })
    log(`📸 截图保存: ${file}`)
    return file
  } catch (e) {
    log(`⚠️ 截图失败: ${e.message}`)
    return null
  }
}

async function main() {
  log('🚀 开始阳光草原自动化测试')
  log(`连接 IDE 端口: ${IDE_PORT}`)

  // 连接开发者工具
  miniProgram = await automator.launch({
    cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    projectPath: PROJECT_PATH,
    port: IDE_PORT
  })
  log('✅ 已连接到开发者工具')

  // 监听 console
  miniProgram.on('console', (msg) => {
    const entry = { type: msg.type, text: msg.text, time: new Date().toISOString() }
    consoleLogs.push(entry)
    if (msg.type === 'error' || msg.type === 'warn') {
      errors.push(entry)
    }
    log(`[console:${msg.type}] ${msg.text}`)
  })

  // 监听页面错误
  miniProgram.on('pageError', (err) => {
    log(`[pageError] ${err.message}`)
    errors.push({ type: 'pageError', text: err.message, stack: err.stack, time: new Date().toISOString() })
  })

  await sleep(3000)
  log('等待游戏启动...')

  // 截图当前状态
  await screenshot('01_initial')

  // 等待游戏加载完成（小游戏 canvas 加载）
  await sleep(5000)

  // 尝试获取当前页面/场景信息
  try {
    const pages = await miniProgram.currentPages()
    log(`当前页面数: ${pages.length}`)
  } catch (e) {
    log(`⚠️ 获取页面失败(小游戏可能无page): ${e.message}`)
  }

  // 小游戏使用 canvas，无法直接点击 DOM 元素，需要模拟触摸
  // 通过 evaluate 调用 wx 事件或通过系统触摸模拟
  
  // 方法1: 尝试通过 evaluate 获取屏幕信息
  try {
    const sysInfo = await miniProgram.evaluate(() => {
      return wx.getSystemInfoSync()
    })
    log(`系统信息: ${JSON.stringify(sysInfo)}`)
  } catch (e) {
    log(`⚠️ 获取系统信息失败: ${e.message}`)
  }

  await screenshot('02_after_load')

  // ============ 开始点击游戏 ============
  // 主菜单"开始冒险"按钮位置（基于代码: cx±btnW/2, cy+40*dpr）
  // 需要先知道屏幕尺寸。小游戏 canvas 全屏，逻辑坐标 = 物理像素/dpr
  // 这里根据 getSystemInfoSync 动态计算
  
  let sysInfo = null
  try {
    sysInfo = await miniProgram.evaluate(() => wx.getSystemInfoSync())
  } catch (e) { }

  if (sysInfo) {
    const { windowWidth, windowHeight, pixelRatio } = sysInfo
    log(`屏幕: ${windowWidth}x${windowHeight}, dpr=${pixelRatio}`)
    
    // 按钮位置基于 game.width = windowWidth*dpr, 所以逻辑坐标在 canvas 上
    // 主菜单按钮: cx = width/2, cy = height/2, 开始冒险在 cy+40*dpr
    const cx = windowWidth / 2
    const startBtnY = windowHeight / 2 + 40 * pixelRatio / pixelRatio // 简化：逻辑坐标=物理坐标(若dpr=1)
    
    // 注意: 触摸事件 clientX/clientY 是物理像素，游戏内 ×dpr 转换
    // 主菜单按钮 y = (height/2 + 40*dpr)，在物理坐标中 = (windowHeight/2 + 40)
    // 但需要确认 dpr 情况。这里用物理坐标点击
    
    log(`点击"开始冒险"按钮 @ (${Math.round(cx)}, ${Math.round(windowHeight/2 + 40)})`)
    
    // 使用 miniProgram 的触摸模拟
    // 小游戏自动化：使用 evaluate 派发 touch 事件或使用系统点击
    try {
      // 方法：通过 evaluate 调用 wx.onTouchStart 监听器（实际游戏用 wx.onTouchStart）
      // 更可靠的方式：使用 automator 的 tap
      // 但 automator.tap 只对 DOM 元素有效。小游戏 canvas 需要模拟 touch
      
      // 尝试 evaluate 方式派发触摸（注入到 wx 全局）
      await miniProgram.evaluate((x, y) => {
        // 模拟 wx touch 事件
        const touchEvent = {
          touches: [{ identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y }],
          changedTouches: [{ identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y }]
        }
        // 触发 wx.onTouchStart 回调
        if (wx.__touchStartListeners) {
          wx.__touchStartListeners.forEach(cb => cb(touchEvent))
        }
        if (wx.__touchEndListeners) {
          const endEvent = { ...touchEvent, touches: [], changedTouches: [{ identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y }] }
          wx.__touchEndListeners.forEach(cb => cb(endEvent))
        }
        return 'dispatched'
      }, Math.round(cx), Math.round(windowHeight / 2 + 40))
      log('✅ 已派发触摸事件(方式1)')
    } catch (e) {
      log(`⚠️ 方式1失败: ${e.message}`)
    }

    await sleep(2000)
    await screenshot('03_after_start_click')
  }

  // 继续尝试多种方式探索
  log('等待场景切换...')
  await sleep(3000)
  await screenshot('04_scene_state')

  // 输出测试结果汇总
  log('\n========== 测试结果汇总 ==========')
  log(`Console 消息总数: ${consoleLogs.length}`)
  log(`错误/警告数: ${errors.length}`)
  errors.forEach(e => {
    log(`❌ [${e.type}] ${e.text}`)
  })

  // 保存日志
  ensureDir(SCREENSHOT_DIR)
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'console-logs.json'), JSON.stringify(consoleLogs, null, 2))
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'errors.json'), JSON.stringify(errors, null, 2))
  log('📄 日志已保存')

  await miniProgram.close()
  log('🏁 测试结束')
}

main().catch(e => {
  console.error('测试失败:', e)
  process.exit(1)
})
