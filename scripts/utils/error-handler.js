/**
 * error-handler.js - 全局错误处理器
 */

// 捕获微信小游戏API错误
export function setupErrorHandler() {
  // 捕获未处理的Promise错误
  wx.onUnhandledRejection((event) => {
    console.warn('[ErrorHandler] 未处理的Promise错误:', event.reason)
    // 不阻止游戏运行
  })
  
  // 捕获全局错误
  const originalError = console.error
  console.error = (...args) => {
    // 过滤微信内部API错误（不影响游戏运行）
    const message = args.join(' ')
    if (message.includes('webapi_getwxaasyncsecinfo') || 
        message.includes('access_token missing') ||
        message.includes('41001')) {
      console.warn('[ErrorHandler] 忽略微信内部API错误:', message)
      return
    }
    originalError.apply(console, args)
  }
}

// 安全调用微信API
export function safeCall(apiName, ...args) {
  try {
    if (typeof wx[apiName] === 'function') {
      return wx[apiName](...args)
    }
  } catch (error) {
    console.warn(`[ErrorHandler] 微信API调用失败: ${apiName}`, error)
  }
  return null
}
