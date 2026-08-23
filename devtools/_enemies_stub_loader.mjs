// 加载钩子：把 field-scene 链中唯一的 CommonJS require 模块 enemies.js 重定向到空 stub，
// 使 FieldScene 能在 node ESM 下加载，从而验证真实的 _renderMinimap 方法。
import { pathToFileURL } from 'url'

const STUB = pathToFileURL(new URL('./_stub_enemies.mjs', import.meta.url).pathname).href

export async function resolve(specifier, context, next) {
  if (specifier.includes('data/enemies.js')) {
    return { url: STUB, shortCircuit: true }
  }
  return next(specifier, context)
}
