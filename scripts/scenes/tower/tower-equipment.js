/**
 * tower-equipment.js - 装备系统模块
 *
 * 职责：装备穿戴/卸下、背包管理、合成、出售、属性计算、提示框渲染
 * 模式：Context对象模式 - 所有函数接收 battle(TowerBattle实例) 作为首参数
 */
// ============================================================
//  装备品质配置
// ============================================================
const { DROP_LIFETIME: DROP_LIFETIME_CFG } = require('./tower-config.js')

const QUALITY_COLORS = {
  legendary: '#ff8c00',
  epic: '#a335ee',
  rare: '#0070dd',
  uncommon: '#1eff00',
  common: '#9d9d9d'
}

const QUALITY_NAMES = {
  common: '普通',
  uncommon: '优秀',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说'
}

const DROP_LIFETIME = DROP_LIFETIME_CFG || 8000

// ============================================================
//  属性应用/退还工具（装备穿戴/卸下的核心逻辑复用）
// ============================================================

/**
 * 从角色身上退还装备属性（卸下时调用）
 * @param {Object} char - 角色对象
 * @param {Object} item - 要退还属性的装备
 */
function _removeEquipBonus(char, item) {
  if (!item || !char) return
  if (item.bonusHp) { char.maxHp -= item.bonusHp; char.currentHp = Math.max(1, char.currentHp - item.bonusHp) }
  if (item.bonusAtk) char.atk -= item.bonusAtk
  if (item.bonusMatk) char.matk = Math.max(0, (char.matk || 0) - item.bonusMatk)
  if (item.bonusDef) char.def = Math.max(0, (char.def || 5) - item.bonusDef)
  if (item.bonusSpd) char.spd = Math.max(0, char.spd - item.bonusSpd)
  if (item.bonusCrit) char.critChance = Math.max(0, (char.critChance || 0) - item.bonusCrit)
  if (item.bonusLifesteal) char.lifesteal = Math.max(0, (char.lifesteal || 0) - item.bonusLifesteal)
  if (item.bonusMpRegen) char.mpRegen = Math.max(0, (char.mpRegen || 0) - item.bonusMpRegen)
  if (item.bonusHpRegen) char.hpRegen = Math.max(0, (char.hpRegen || 0) - item.bonusHpRegen)
  if (item.bonusCdr) char.cdr = Math.max(0, (char.cdr || 0) - item.bonusCdr)
  // ★ 重新计算 moveSpeed（与 _applyEquipBonus 保持一致）
  char.moveSpeed = 120 + (char.spd || 10) * 5
  if (char._baseMoveSpeed !== undefined) char._baseMoveSpeed = char.moveSpeed
}

/**
 * 给角色应用装备属性（穿上时调用）
 * @param {Object} char - 角色对象
 * @param {Object} item - 装备对象
 */
function _applyEquipBonus(char, item) {
  if (!item || !char) return
  if (item.bonusHp) { char.maxHp += item.bonusHp; char.currentHp += item.bonusHp }
  if (item.bonusAtk) char.atk += item.bonusAtk
  if (item.bonusMatk) char.matk = (char.matk || 0) + item.bonusMatk
  if (item.bonusDef) char.def = (char.def || 5) + item.bonusDef
  if (item.bonusSpd) char.spd += item.bonusSpd
  if (item.bonusCrit) char.critChance = (char.critChance || 0) + item.bonusCrit
  if (item.bonusLifesteal) char.lifesteal = (char.lifesteal || 0) + item.bonusLifesteal
  if (item.bonusMpRegen) char.mpRegen = (char.mpRegen || 0) + item.bonusMpRegen
  if (item.bonusHpRegen) char.hpRegen = (char.hpRegen || 0) + item.bonusHpRegen
  if (item.bonusCdr) char.cdr = (char.cdr || 0) + item.bonusCdr
  // ★ 重新计算 moveSpeed
  char.moveSpeed = 120 + (char.spd || 10) * 5
  if (char._baseMoveSpeed !== undefined) char._baseMoveSpeed = char.moveSpeed
}

/**
 * 获取装备加成描述文字列表
 * @param {Object} item - 装备对象
 * @returns {Array<string>} 描述文字数组
 */
function _getEquipBonusTexts(item) {
  const texts = []
  if (item.bonusHp) texts.push(`HP+${item.bonusHp}`)
  if (item.bonusAtk) texts.push(`攻+${item.bonusAtk}`)
  if (item.bonusMatk) texts.push(`魔+${item.bonusMatk}`)
  if (item.bonusDef) texts.push(`防+${item.bonusDef}`)
  if (item.bonusSpd) texts.push(`速+${item.bonusSpd}`)
  if (item.bonusCrit) texts.push(`暴+${item.bonusCrit}`)
  if (item.bonusLifesteal) texts.push(`吸+${item.bonusLifesteal}`)
  if (item.bonusMpRegen) texts.push(`MP回+${item.bonusMpRegen}`)
  if (item.bonusHpRegen) texts.push(`HP回+${item.bonusHpRegen}`)
  if (item.bonusCdr) texts.push(`CD减+${item.bonusCdr}`)
  return texts
}

/**
 * 获取装备详细属性列表（用于tooltip和装备面板展示）
 * @param {Object} item - 装备对象
 * @returns {Array<{text:string, color?:string}>} 属性行数组
 */
function _getEquipStats(item) {
  const lines = []
  const green = '#4ade80', blue = '#60a5fa', yellow = '#fbbf24', purple = '#c084fc'
  if (item.bonusHp) lines.push({ text: `❤ HP +${item.bonusHp}`, color: green })
  if (item.bonusAtk) lines.push({ text: `⚔ 攻击 +${item.bonusAtk}`, color: yellow })
  if (item.bonusMatk) lines.push({ text: `✨ 魔攻 +${item.bonusMatk}`, color: purple })
  if (item.bonusDef) lines.push({ text: `🛡 防御 +${item.bonusDef}`, color: blue })
  if (item.bonusSpd) lines.push({ text: `💨 速度 +${item.bonusSpd}`, color: '#93c5fd' })
  if (item.bonusCrit) lines.push({ text: `💥 暴击 +${item.bonusCrit}%`, color: '#f97316' })
  if (item.bonusLifesteal) lines.push({ text: `🩸 吸血 +${item.bonusLifesteal}%`, color: '#ef4444' })
  if (item.bonusMpRegen) lines.push({ text: `💧 MP回复 +${item.bonusMpRegen}/s`, color: '#38bdf8' })
  if (item.bonusHpRegen) lines.push({ text: `💚 HP回复 +${item.bonusHpRegen}/s`, color: '#4ade80' })
  if (item.bonusCdr) lines.push({ text: `⏬ 冷却缩减 +${item.bonusCdr}%`, color: '#a78bfa' })
  return lines
}

// ============================================================
//  装备分配面板（点击掉落物后弹出选择角色界面）
// ============================================================

/**
 * 打开装备分配面板
 * @param {TowerBattle} battle - 战斗实例
 * @param {Object} item - 待分配的装备物品
 */
function openEquipPanel(battle, item) {
  const W = battle.width, H = battle.height
  battle.equipPanel = {
    visible: true,
    item: item,
    selectedCharIndex: -1,
    animTimer: 0,
    charButtons: [],
  }
  const btnW = 80, btnH = 90, gap = 12
  const totalW = battle.party.length * btnW + (battle.party.length - 1) * gap
  let startX = (W - totalW) / 2
  for (let i = 0; i < battle.party.length; i++) {
    battle.equipPanel.charButtons.push({
      x: startX + i * (btnW + gap),
      y: H * 0.62,
      w: btnW,
      h: btnH,
      charIndex: i,
    })
  }
}

/**
 * 将装备穿到指定角色身上（从分配面板确认后调用）
 * @param {TowerBattle} battle - 战斗实例
 * @param {Object} item - 装备物品
 * @param {number} charIndex - 目标角色索引
 * @param {boolean} fromInventory - 是否从背包中穿戴（vs 地面拾取）
 */
function equipToCharacter(battle, item, charIndex, fromInventory = false) {
  if (!item) return
  const c = battle.party[charIndex]
  if (!c || c.isDead) return

  // 从背包移除
  if (fromInventory && battle.equipPanel.invIndex !== undefined && battle.equipPanel.invIndex >= 0) {
    battle.inventory[battle.equipPanel.invIndex] = null
    battle.inventory = battle.inventory.filter(Boolean)
  } else if (!fromInventory) {
    // 地面掉落物
    item.collected = true
    item.collectAnim = 0
    battle.stats.dropsCollected++
  }

  // 替换旧装备 → 退还属性
  const slot = item.slot || 'accessory'
  const oldItem = c.equippedItems[slot]
  if (oldItem) {
    _removeEquipBonus(c, oldItem)
    if (battle.inventory.length < battle.maxInventorySize) {
      battle.inventory.push({ ...oldItem })
    }
  }

  // 装上新装备
  c.equippedItems[slot] = item
  _applyEquipBonus(c, item)

  // 浮动提示
  const bonusTexts = _getEquipBonusTexts(item)
  addFloatingText(battle, c.x, c.y - 200, `${c.name} 穿上 ${item.name}\n${bonusTexts.join(' ')}`, '#ffd700', 2.0)

  // 收集粒子特效
  const color = QUALITY_COLORS[item.quality]
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2
    battle.particles.push({
      x: c.x, y: c.y - 100,
      vx: Math.cos(angle) * 50, vy: Math.sin(angle) * 50 - 30,
      size: 3 + Math.random() * 3, color, life: 1, decay: 2.0
    })
  }

  battle.equipPanel.visible = false
}

/**
 * 直接将背包中的装备穿戴到 selectedCharIndex 对应的角色
 * @param {TowerBattle} battle - 战斗实例
 * @param {Object} item - 装备物品
 * @param {number} invIdx - 背包中的索引位置
 */
function equipToSelectedChar(battle, item, invIdx) {
  if (!item || invIdx === undefined || invIdx < 0) return
  const idx = battle.selectedCharIndex >= 0 ? battle.selectedCharIndex : 0
  const c = battle.party[idx]
  if (!c || c.isDead) return

  const slotKey = item.slot || 'accessory'

  // 检查该槽位是否已有装备，有则先卸下回背包（满则提示）
  const oldItem = c.equippedItems[slotKey]
  if (oldItem && battle.inventory.length >= battle.maxInventorySize) {
    addFloatingText(battle, battle.width / 2, battle.height * 0.55, `❌ ${c.name}的${slotKey}槽位有装备，但背包已满！`, '#f87171')
    return
  }
  if (oldItem) { battle.inventory.push({ ...oldItem }) }

  // 从背包移除新装备
  battle.inventory.splice(invIdx, 1)

  // 退还旧属性 + 应用新属性
  if (oldItem) _removeEquipBonus(c, oldItem)
  c.equippedItems[slotKey] = item
  _applyEquipBonus(c, item)

  // 浮动提示
  const bonusTexts = _getEquipBonusTexts(item)
  addFloatingText(battle, c.x, c.y - 200, `✨ ${c.name} 穿上 ${item.name}\n${bonusTexts.join(' ')}`, '#ffd700', 2.0)

  // 粒子特效
  const color = QUALITY_COLORS[item.quality] || '#fff'
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2
    battle.particles.push({
      x: c.x, y: c.y - 100,
      vx: Math.cos(angle) * 50, vy: Math.sin(angle) * 50 - 30,
      size: 3 + Math.random() * 3, color, life: 1, decay: 2.0,
    })
  }
}

/**
 * 点击角色装备槽 → 卸下装备回背包
 * @param {TowerBattle} battle - 战斗实例
 * @param {Object} slot - 槽位信息 { charIdx, slot }
 */
function onCharEquipSlotTap(battle, slot) {
  const c = battle.party[slot.charIdx]
  if (!c || c.isDead) return
  const item = c.equippedItems[slot.slot]
  if (!item) return

  // 背包满则提示
  if (battle.inventory.length >= battle.maxInventorySize) {
    addFloatingText(battle, battle.width / 2, battle.height * 0.55, `❌ 背包已满，无法卸下!`, '#f87171')
    return
  }

  // 卸下：退还所有属性
  _removeEquipBonus(c, item)

  // 清空槽位，放入背包
  c.equippedItems[slot.slot] = null
  battle.inventory.push({ ...item })

  addFloatingText(battle, c.x, c.y - 200, `📤 ${c.name} 卸下了 ${item.name}`, '#94a3b8')
}

/**
 * 出售用户选中的背包装备（需先点击选中）
 * @param {TowerBattle} battle - 战斗实例
 */
function sellSelectedInventoryItem(battle) {
  if (battle.inventory.length === 0) {
    addFloatingText(battle, battle.width / 2, battle.height * 0.55, '❌ 背包没有可卖的装备', '#f87171')
    return
  }

  const targetIdx = battle._sellTargetIndex
  if (targetIdx === undefined || targetIdx < 0 || !battle.inventory[targetIdx]) {
    addFloatingText(battle, battle.width / 2, battle.height * 0.55, '👆 请先点击要卖的装备', '#fbbf24')
    return
  }

  // 品质价格倍率
  const priceMap = { common: 10, uncommon: 20, rare: 40, epic: 80, legendary: 160 }
  const sold = battle.inventory[targetIdx]
  const base = priceMap[sold.quality] || 5
  const value = base + (sold.level || 1) * 3

  battle.inventory.splice(targetIdx, 1)
  battle.gold += value
  battle._sellTargetIndex = -1

  addFloatingText(battle, battle.width / 2, battle.height * 0.55,
    `💰 出售 ${sold.name} → +${value}金币`, '#f1c40f')
}

/**
 * 合成装备：两个同槽位+同品质的装备合成升级（消耗金币）
 * @param {TowerBattle} battle - 战斗实例
 */
function synthesizeEquipment(battle) {
  const cost = battle._synthCost || 50
  if (battle.inventory.length < 2) {
    addFloatingText(battle, battle.width / 2, battle.height * 0.55, '❌ 装备不足2件', '#f87171')
    return
  }
  if (battle.gold < cost) {
    addFloatingText(battle, battle.width / 2, battle.height * 0.55, `❌ 金币不足，需要${cost}💰`, '#f87171')
    return
  }

  console.log(`[Tower] 合成检测: inventory=${JSON.stringify(battle.inventory.map(i => ({ n: i.name, s: i.slot, q: i.quality })))}`)
  for (let i = 0; i < battle.inventory.length; i++) {
    for (let j = i + 1; j < battle.inventory.length; j++) {
      const a = battle.inventory[i], b = battle.inventory[j]
      if (a.slot && b.slot && a.slot === b.slot && a.quality === b.quality) {
        console.log(`[Tower] ✅ 找到可合成对: [${i}]${a.name}(${a.slot},${a.quality}) + [${j}]${b.name}(${b.slot},${b.quality})`)

        const newLevel = Math.max(1, (a.level || 1)) + 1
        // 成长公式：每级在基础值上叠加一小部分
        const grow = (base, lv) => {
          if (!base || base <= 0) return 0
          return base + Math.floor(base * (lv - 1) * 0.2)
        }
        const newItem = {
          ...a,
          level: newLevel,
          bonusHp: grow(a.bonusHp || 0, newLevel),
          bonusAtk: grow(a.bonusAtk || 0, newLevel),
          bonusMatk: grow(a.bonusMatk || 0, newLevel),
          bonusDef: grow(a.bonusDef || 0, newLevel),
          bonusSpd: grow(a.bonusSpd || 0, newLevel),
          bonusCrit: grow(a.bonusCrit || 0, newLevel),
          bonusLifesteal: grow(a.bonusLifesteal || 0, newLevel),
          bonusMpRegen: grow(a.bonusMpRegen || 0, newLevel),
          bonusHpRegen: grow(a.bonusHpRegen || 0, newLevel),
          bonusCdr: grow(a.bonusCdr || 0, newLevel),
          name: `${a.name}+${newLevel}`,
        }

        // 升级品质
        const qualityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary']
        const qi = qualityOrder.indexOf(a.quality)
        if (qi >= 0 && newLevel >= 3 && qi < qualityOrder.length - 1) {
          newItem.quality = qualityOrder[qi + 1]
        }

        // 移除旧物品，放入新物品
        battle.inventory.splice(j, 1)
        battle.inventory.splice(i, 1, newItem)
        battle.gold -= cost

        const attrText = [
          newItem.bonusHp ? `HP+${newItem.bonusHp}` : '',
          newItem.bonusAtk ? `攻+${newItem.bonusAtk}` : '',
          newItem.bonusMatk ? `魔+${newItem.bonusMatk}` : '',
          newItem.bonusDef ? `防+${newItem.bonusDef}` : '',
          newItem.bonusSpd ? `速+${newItem.bonusSpd}` : '',
        ].filter(Boolean).join(' ')
        console.log(`[Tower] ⚗️合成: ${a.name}Lv${a.level||1} + ${b.name}Lv${b.level||1} → ${newItem.name}, 属性: ${attrText}`)
        addFloatingText(battle, battle.width / 2, battle.height * 0.55,
          `⚗️ ${newItem.name}\n${attrText || '属性提升'} (-${cost}💰)`, '#a78bfa')
        return
      }
    }
  }

  console.log(`[Tower] ❌ 无可合成对: 需要同槽位+同品质的两件装备`)
  addFloatingText(battle, battle.width / 2, battle.height * 0.55, '❌ 没有可合成的装备', '#f87171')
}

// ============================================================
//  装备面板渲染
// ============================================================

/**
 * 渲染装备分配面板（选择角色穿装备）
 * @param {CanvasRenderingContext2D} ctx - Canvas上下文
 * @param {TowerBattle} battle - 战斗实例
 */
function renderEquipPanel(ctx, battle) {
  const ep = battle.equipPanel
  if (!ep.visible || !ep.item) return
  const W = battle.width, H = battle.height, dpr = battle.dpr
  const item = ep.item

  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, W, H)

  const panelW = Math.min(340 * dpr, W * 0.88)
  const panelH = H * 0.52
  const panelX = (W - panelW) / 2
  const panelY = H * 0.15

  ctx.fillStyle = 'rgba(18,22,28,0.96)'
  const r = 14
  ctx.beginPath()
  ctx.moveTo(panelX + r, panelY)
  ctx.lineTo(panelX + panelW - r, panelY)
  ctx.quadraticCurveTo(panelX + panelW, panelY, panelX + panelW, panelY + r)
  ctx.lineTo(panelX + panelW, panelY + panelH - r)
  ctx.quadraticCurveTo(panelX + panelW, panelY + panelH, panelX + panelW - r, panelY + panelH)
  ctx.lineTo(panelX + r, panelY + panelH)
  ctx.quadraticCurveTo(panelX, panelY + panelH, panelX, panelY + panelH - r)
  ctx.lineTo(panelX, panelY + r)
  ctx.quadraticCurveTo(panelX, panelY, panelX + r, panelY)
  ctx.fill()

  ctx.strokeStyle = QUALITY_COLORS[item.quality]
  ctx.lineWidth = 2
  ctx.stroke()

  // 标题
  ctx.font = `bold ${Math.max(18, 20 * dpr)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.fillText('🎒 选择角色装备', W / 2, panelY + 28)

  // 装备图标
  const iconCx = W / 2
  const iconCy = panelY + 95
  const iconR = 42 * dpr

  const pulse = Math.sin(Date.now() / 400) * 0.25 + 1
  ctx.shadowBlur = 20
  ctx.shadowColor = QUALITY_COLORS[item.quality]
  ctx.fillStyle = '#1a1f26'
  ctx.beginPath()
  ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = QUALITY_COLORS[item.quality]
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.shadowBlur = 0

  const slotIcon = { weapon: '\u2694', armor: '\u{1F6E1}', accessory: '\u{1F48E}' }
  ctx.fillStyle = QUALITY_COLORS[item.quality]
  ctx.font = `bold ${Math.max(36, 40 * dpr)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(slotIcon[item.slot] || '?', iconCx, iconCy)

  // 名称 + 品质标签
  ctx.font = `bold ${Math.max(19, 22 * dpr)}px sans-serif`
  ctx.fillStyle = QUALITY_COLORS[item.quality]
  ctx.fillText(`${QUALITY_NAMES[item.quality]} ${item.name}`, iconCx, iconCy + iconR + 24)

  // 属性加成列表
  const statLines = _getEquipStats(item)
  ctx.font = `${Math.max(14, 16 * dpr)}px sans-serif`
  ctx.fillStyle = '#c9d1d9'
  for (let i = 0; i < statLines.length; i++) {
    ctx.fillText(statLines[i].text, iconCx, iconCy + iconR + 50 + i * 24)
  }

  // 分割线
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(panelX + 20, panelY + panelH * 0.55)
  ctx.lineTo(panelX + panelW - 20, panelY + panelH * 0.55)
  ctx.stroke()

  // 角色选择区域标题
  ctx.font = `${Math.max(14, 16 * dpr)}px sans-serif`
  ctx.fillStyle = '#8b949e'
  ctx.fillText('点击角色头像装备', W / 2, panelY + panelH * 0.58)

  // 角色头像按钮
  for (const btn of ep.charButtons) {
    const ci = btn.charIndex
    const ch = battle.party[ci]
    const bx = btn.x, by = btn.y, bw = btn.w, bh = btn.h

    const isDead = ch.isDead
    ctx.fillStyle = isDead ? 'rgba(40,44,52,0.8)' : 'rgba(33,38,46,0.92)'
    ctx.beginPath()
    ctx.moveTo(bx + 8, by)
    ctx.lineTo(bx + bw - 8, by)
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + 8)
    ctx.lineTo(bx + bw, by + bh - 8)
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - 8, by + bh)
    ctx.lineTo(bx + 8, by + bh)
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - 8)
    ctx.lineTo(bx, by + 8)
    ctx.quadraticCurveTo(bx, by, bx + 8, by)
    ctx.fill()

    ctx.strokeStyle = isDead ? '#3d444d' : QUALITY_COLORS[item.quality]
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.font = `bold ${Math.max(11, 12 * dpr)}px sans-serif`
    ctx.fillStyle = isDead ? '#565e69' : '#e6edf3'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ch.name, bx + bw / 2, by + 18)

    ctx.font = `${Math.max(9, 10 * dpr)}px sans-serif`
    ctx.fillStyle = isDead ? '#484f58' : '#8b949e'
    ctx.fillText(`Lv${ch.level} ${ch.role === 'mage' ? '\uD83D\uDD2C' : '\u2694'}`, bx + bw / 2, by + 34)

    ctx.font = `${Math.max(9, 10 * dpr)}px sans-serif`
    ctx.fillStyle = isDead ? '#484f58' : '#58a6ff'
    ctx.fillText(`ATK:${ch.atk}  DEF:${ch.def || 5}`, bx + bw / 2, by + 50)

    if (!isDead) {
      ctx.fillStyle = '#3fb950'
      const preview = []
      if (item.bonusAtk) preview.push(`+${item.bonusAtk}atk`)
      if (item.bonusMatk) preview.push(`+${item.bonusMatk}matk`)
      if (item.bonusDef) preview.push(`+${item.bonusDef}def`)
      if (item.bonusHp) preview.push(`+${item.bonusHp}hp`)
      if (preview.length > 0) {
        ctx.font = `bold ${Math.max(9, 10 * dpr)}px sans-serif`
        ctx.fillText(preview.join(' '), bx + bw / 2, by + 66)
      }
    } else {
      ctx.font = `${Math.max(9, 10 * dpr)}px sans-serif`
      ctx.fillStyle = '#f85149'
      ctx.fillText('\u2717 已阵亡', bx + bw / 2, by + 66)
    }
  }

  ctx.font = `${Math.max(10, 11 * dpr)}px sans-serif`
  ctx.fillStyle = '#565e69'
  ctx.textAlign = 'center'
  ctx.fillText('点击面板外关闭', W / 2, panelY + panelH - 16)
}

/**
 * 渲染悬浮装备属性提示框
 * @param {CanvasRenderingContext2D} ctx - Canvas上下文
 * @param {TowerBattle} battle - 战斗实例
 */
function renderItemTooltip(ctx, battle) {
  const h = battle._hoveredItem
  if (!h || !h.item) return
  const item = h.item
  const W = battle.width, H = battle.height, dpr = battle.dpr

  const qColors = {
    common: { name: '普通', bg: '#2a3040', border: '#666', text: '#aab' },
    uncommon: { name: '优秀', bg: '#1a3050', border: '#4a90c8', text: '#8ec8ff' },
    rare: { name: '稀有', bg: '#282048', border: '#7c5cf0', text: '#c9a0ff' },
    epic: { name: '史诗', bg: '#381438', border: '#d050d0', text: '#f0a0f0' },
    legendary: { name: '传说', bg: '#403000', border: '#e8a800', text: '#ffd060' },
  }
  const qc = qColors[item.quality] || qColors.common

  const slotNames = { weapon: '\u2694 武器', armor: '\u{1F6E1} 护甲', accessory: '\u{1F48E} 饰品' }

  const lines = []
  lines.push({ text: item.name, color: qc.text, size: 15, bold: true })
  lines.push({ text: `${qc.name} ${slotNames[item.slot] || ''}  Lv${item.level || 1}`, color: qc.border, size: 12 })
  lines.push(..._getEquipStats(item))

  const padX = Math.max(10, 12 * dpr)
  const padY = Math.max(7, 8 * dpr)
  const lineHeight = Math.max(18, 22 * dpr)
  let maxW = 0
  for (const l of lines) {
    ctx.font = `${l.bold ? 'bold' : ''} ${Math.max(l.size, 11 * dpr)}px sans-serif`
    maxW = Math.max(maxW, ctx.measureText(l.text).width)
  }
  const tipW = maxW + padX * 2
  const tipH = lines.length * lineHeight + padY * 2

  let tipX = h.x - tipW / 2
  let tipY = h.y - tipH - 8
  if (tipX < 4) tipX = 4
  if (tipX + tipW > W - 4) tipX = W - tipW - 4
  if (tipY < 4) tipY = h.y + h.size || h.h || 30

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4
  ctx.fillStyle = qc.bg
  roundRect(ctx, tipX, tipY, tipW, tipH, 6)
  ctx.fill()
  ctx.shadowColor = 'transparent'

  ctx.strokeStyle = qc.border
  ctx.lineWidth = 1.2
  roundRect(ctx, tipX, tipY, tipW, tipH, 6)
  ctx.stroke()

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    ctx.font = `${l.bold ? 'bold' : ''} ${Math.max(l.size, 11 * dpr)}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = l.color
    ctx.fillText(l.text, tipX + padX, tipY + padY + i * lineHeight)
  }

  ctx.restore()
}

/**
 * 渲染掉落物品
 * @param {CanvasRenderingContext2D} ctx - Canvas上下文
 * @param {TowerBattle} battle - 战斗实例
 */
function renderDroppedItems(ctx, battle) {
  for (const item of battle.droppedItems) {
    if (item.collected && item.collectAnim >= 1) continue

    ctx.save()
    ctx.translate(item.x, item.y)

    if (item.collected) {
      ctx.globalAlpha = 1 - item.collectAnim
      ctx.scale(1 - item.collectAnim * 0.5, 1 - item.collectAnim * 0.5)
    }

    if (item.blink && !item.collected) {
      ctx.globalAlpha = 0.25 + Math.sin(Date.now() / 50) * 0.5
    }

    const color = QUALITY_COLORS[item.quality]

    // 品质光环
    const pulse = Math.sin(Date.now() / (item.pulseSpeed * 100)) * 0.3 + 1
    const glowR = (26 + item.glowIntensity * pulse * 1.3)

    if (item.quality !== 'common') {
      const glowGrad = ctx.createRadialGradient(0, 0, 8, 0, 0, Math.max(1, glowR))
      glowGrad.addColorStop(0, color + '40')
      glowGrad.addColorStop(1, color + '00')
      ctx.fillStyle = glowGrad
      ctx.beginPath()
      ctx.arc(0, 0, glowR, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.shadowBlur = item.glowIntensity * (item.quality === 'legendary' ? 1.8 : 1.2)
    ctx.shadowColor = color

    // 物品图标底座
    const baseR = 48
    ctx.fillStyle = '#1c2128'
    ctx.beginPath()
    ctx.arc(0, 0, baseR, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 3.5
    ctx.stroke()

    const slotIcon = { weapon: '\u2694', armor: '\u{1F6E1}', accessory: '\u{1F48D}' }
    ctx.fillStyle = color
    ctx.font = 'bold 48px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(slotIcon[item.slot] || '?', 0, 2)

    // 名称
    if (!item.collected) {
      ctx.font = 'bold 16px sans-serif'
      ctx.fillStyle = '#e6edf3'
      ctx.fillText(item.name, 0, baseR + 20)
    }

    // 时间条
    if (!item.collected) {
      const ratio = item.remaining / DROP_LIFETIME
      const barColor = ratio > 0.5 ? color : ratio > 0.25 ? '#ff8c00' : '#ff4444'
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(-24, 28, 48, 5)
      ctx.fillStyle = barColor
      ctx.fillRect(-24, 28, 48 * ratio, 5)
    }

    // 传说星光
    if (item.quality === 'legendary' && !item.collected) {
      for (let s = 0; s < 3; s++) {
        const starAngle = Date.now() / 800 + s * (Math.PI * 2 / 3)
        const starR = 36 + Math.sin(Date.now() / 400 + s * 2) * 6
        const sx = Math.cos(starAngle) * starR
        const sy = Math.sin(starAngle) * starR
        ctx.fillStyle = '#ffd700'
        ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 200 + s) * 0.4
        ctx.beginPath()
        ctx.arc(sx, sy, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = item.collected ? (1 - item.collectAnim) : 1
    }

    ctx.shadowBlur = 0
    ctx.restore()
  }
}

// ============================================================
//  掉落物品更新
// ============================================================

/**
 * 更新所有掉落物品状态（过期、收集动画等）
 * @param {TowerBattle} battle - 战斗实例
 * @param {number} dt - 时间差(ms)
 */
function updateDroppedItems(battle, dt) {
  const now = Date.now()
  for (const item of battle.droppedItems) {
    if (item.collected) {
      item.collectAnim += dt / 350
      continue
    }
    const age = now - item.spawnTime
    item.remaining = Math.max(0, DROP_LIFETIME - age)
    const timeLeft = item.remaining / 1000
    if (timeLeft < 2.5) item.blink = Math.sin(age / 80 * Math.PI) > 0
  }

  // 合并过滤逻辑：移除已收集完成或过期的物品
  const expired = []
  battle.droppedItems = (battle.droppedItems || []).filter(i => {
    if (i.collected && i.collectAnim >= 1) return false
    if (i.remaining <= 0 && !i.collected) {
      expired.push(i)
      return false
    }
    return true
  })

  // 过期消失粒子效果
  for (const item of expired) {
    for (let j = 0; j < 6; j++) {
      ;(battle.particles || []).push({
        x: item.x + (Math.random() - 0.5) * 20,
        y: item.y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        size: 2 + Math.random() * 3,
        color: QUALITY_COLORS[item.quality],
        life: 1,
        decay: 2.5
      })
    }
  }
  battle.droppedItems = (battle.droppedItems || []).filter(i => !(i.remaining <= 0 && !i.collected))
}

// ============================================================
//  辅助方法
// ============================================================

/** 添加浮动文字到 effects 数组 */
function addFloatingText(battle, x, y, text, color, duration) {
  battle.effects.push({
    type: 'dmg_number', x, y, value: text, color,
    scale: 0.9, life: duration || 1.8, vy: -25
  })
}

/** 圆角矩形辅助方法 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

// ============================================================
//  导出模块接口
// ============================================================
module.exports = {
  // 配置常量
  QUALITY_COLORS,
  QUALITY_NAMES,
  DROP_LIFETIME,

  // 属性工具
  _removeEquipBonus,
  _applyEquipBonus,
  _getEquipBonusTexts,
  _getEquipStats,

  // 装备操作
  openEquipPanel,
  equipToCharacter,
  equipToSelectedChar,
  onCharEquipSlotTap,
  sellSelectedInventoryItem,
  synthesizeEquipment,

  // 渲染
  renderEquipPanel,
  renderItemTooltip,
  renderDroppedItems,
  updateDroppedItems,

  // 辅助
  addFloatingText,
  roundRect,
}
