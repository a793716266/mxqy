/**
 * save-sanitize.js - 存档序列化安全工具
 *
 * ★ 背景（2026-09-01 线上 BUG）：
 *   野外战斗把「活着的怪物对象」直接塞进存档（data.set(`fieldMonsters_${areaId}`, this.mapMonsters)），
 *   而怪物身上挂着运行时状态：monster._lightCharge.zone.monsterRef === monster（光明冲锋警示区回引怪物），
 *   于是 DataManager.save() 里的 JSON.stringify(this.data) 抛
 *   "Converting circular structure to JSON" → 整个存档写不进去（进度全丢风险）。
 *
 * ★ 双重防线：
 *   1) toSerializable()：写入存档前把活对象"拍扁"成纯数据快照
 *      —— 丢弃函数、丢弃 `_` 前缀的瞬时态、断环（按祖先路径判定，不误伤共享引用）。
 *   2) safeStringify()：DataManager.save() 的最后兜底
 *      —— 正常路径直接 JSON.stringify（零开销）；一旦抛错自动降级为净化后再存，
 *         保证"某个模块忘了净化"也不会让整个存档失败。
 */

/** 明确不该进存档的对象引用键（即便不带 `_` 前缀） */
const DEFAULT_SKIP_KEYS = new Set([
  'monsterRef', 'heroRef', 'owner', 'ownerRef', 'target', 'targetRef',
  'sprite', 'scene', 'game', 'renderer', 'ctx', 'parent', 'zone'
])

/**
 * 把任意值转成可 JSON 序列化的纯数据
 * @param {*} value 任意值
 * @param {Object} [opts]
 * @param {boolean} [opts.dropUnderscore=true] 是否丢弃 `_` 前缀的键（运行时瞬时态约定）
 * @param {number}  [opts.maxDepth=12]       最大递归深度
 * @param {number}  [opts.maxNodes=20000]    最大节点数（防止异常数据撑爆内存）
 * @param {Set<string>} [opts.skipKeys]      额外要丢弃的键
 * @returns {*} 纯数据（与原对象无引用共享）
 */
export function toSerializable(value, opts = {}) {
  const dropUnderscore = opts.dropUnderscore !== false
  const maxDepth = opts.maxDepth || 12
  const maxNodes = opts.maxNodes || 20000
  const skipKeys = opts.skipKeys && opts.skipKeys.size ? opts.skipKeys : DEFAULT_SKIP_KEYS

  let nodeCount = 0
  const path = new Set()   // 当前递归路径上的祖先（用于判定"真·循环"）

  function walk(v, depth) {
    if (v === null || v === undefined) return v
    const t = typeof v
    if (t === 'string' || t === 'boolean') return v
    if (t === 'number') return Number.isFinite(v) ? v : null   // NaN / Infinity → null
    if (t === 'function') return undefined                     // 函数：丢弃
    if (v instanceof Date) return v.toISOString()
    if (t !== 'object') return null                            // symbol / bigint 等

    // 真·循环引用（祖先链上已出现）→ 断开
    if (path.has(v)) return undefined
    if (depth >= maxDepth || ++nodeCount > maxNodes) return null

    path.add(v)
    let out
    if (Array.isArray(v)) {
      out = []
      for (let i = 0; i < v.length; i++) {
        const c = walk(v[i], depth + 1)
        out.push(c === undefined ? null : c)   // 数组保持下标对齐
      }
    } else {
      out = {}
      const keys = Object.keys(v)
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        if (dropUnderscore && k.charCodeAt(0) === 95) continue   // `_` 开头 = 瞬时态
        if (skipKeys.has(k)) continue
        const c = walk(v[k], depth + 1)
        if (c === undefined) continue
        out[k] = c
      }
    }
    path.delete(v)
    return out
  }

  return walk(value, 0)
}

/**
 * 安全 JSON.stringify：优先走原生快路径，失败时自动净化后重试
 * @param {*} value
 * @returns {string|null} 序列化结果；彻底失败返回 null
 */
export function safeStringify(value) {
  try {
    return JSON.stringify(value)
  } catch (e) {
    console.warn('[存档] 检测到不可序列化数据（循环引用/函数），自动剔除后保存：', e && e.message ? e.message : e)
    try {
      // 兜底：不丢 `_` 键（避免误删合法存档字段），只断环 + 去函数
      return JSON.stringify(toSerializable(value, { dropUnderscore: false }))
    } catch (e2) {
      console.error('[存档] 净化后仍无法序列化：', e2)
      return null
    }
  }
}

export default { toSerializable, safeStringify }
