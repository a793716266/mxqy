/**
 * tower-ui.js - 渲染与交互模块
 *
 * 职责：全部Canvas渲染、触控/点击交互、HUD、技能栏、策略栏、装备面板
 * 模式：Context对象模式 - 所有函数接收 battle(TowerBattle实例) 作为首参数
 */
const { QUALITY_COLORS, roundRect, addFloatingText, renderDroppedItems,
        synthesizeEquipment, sellSelectedInventoryItem, onCharEquipSlotTap,
        equipToSelectedChar } = require('./tower-equipment')

// ============================================================
//  主渲染入口
// ============================================================

/**
 * 主渲染函数 - 根据当前阶段分发到子渲染器
 * @param {CanvasRenderingContext2D} ctx - Canvas上下文
 * @param {TowerBattle} battle - 战斗实例
 */
function render(ctx, battle) {
  const W = battle.width
  const H = battle.height
  const dpr = battle.dpr

  ctx.save()

  // 重置Canvas状态为默认值（防止GCO异常导致clearRect残留）
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
  ctx.filter = 'none'
  ctx.clearRect(0, 0, W, H)
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.filter = 'none'

  // ===== 分阶段渲染 =====
  try {
    if (battle.phase === 'card_select') {
      renderCardSelect(ctx, battle)
      renderTransition(ctx, battle)
      ctx.restore()
      return
    }

    if (battle.phase === 'victory' || battle.phase === 'defeat') {
      renderResultScreen(ctx, battle)
      ctx.restore()
      return
    }

  // ===== 战斗场景渲染 =====
  // 背景
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, W, H)

  const bgImg = battle.assets?.get?.('BG_TOWER_BATTLE')
  if (bgImg && bgImg.width > 0) {
    const area = getBattleArea(battle)
    const areaW = area.right - area.left
    const areaH = area.bottom - area.top
    const imgW = bgImg.width, imgH = bgImg.height
    const scale = Math.max(areaW / imgW, areaH / imgH) * 1.75
    const drawW = imgW * scale
    const drawH = imgH * scale
    const offsetX = area.left + (areaW - drawW) / 2
    const offsetY = area.top + (areaH - drawH) / 2
    ctx.drawImage(bgImg, offsetX, offsetY, drawW, drawH)
  }

  // 地面效果区域参数
  const topBarH = Math.max(H * 0.095, 56)
  const bottomMargin = Math.max(8, 12 * dpr)
  const skillBarH = Math.max(H * 0.055, 40)
  const tacticsBarH = Math.max(H * 0.06, 42)
  const equipBarH = Math.max(H * 0.155, 120)
  const bottomBarH = skillBarH + tacticsBarH + equipBarH + 8
  const groundY = H - bottomBarH - bottomMargin - 10

  // 地面渐变
  const area = getBattleArea(battle)
  const grdTop = Math.min(area.top, topBarH + 30)
  const grdBottom = Math.max(area.bottom, groundY)
  const groundGrad = ctx.createLinearGradient(0, grdTop, 0, grdBottom)
  groundGrad.addColorStop(0, 'rgba(255,245,180,0.25)')
  groundGrad.addColorStop(0.4, 'rgba(240,220,140,0.18)')
  groundGrad.addColorStop(1, 'rgba(200,175,100,0.35)')
  ctx.fillStyle = groundGrad
  ctx.fillRect(area.left, area.top, area.right - area.left, area.bottom - area.top)

  // 边界墙
  const wallThickness = 4
  ctx.strokeStyle = 'rgba(100,160,220,0.35)'
  ctx.lineWidth = wallThickness
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(wallThickness / 2, topBarH + 25); ctx.lineTo(wallThickness / 2, groundY); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(W - wallThickness / 2, topBarH + 25); ctx.lineTo(W - wallThickness / 2, groundY); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, topBarH + 25); ctx.lineTo(W, topBarH + 25); ctx.stroke()

  // 区域着色
  ctx.fillStyle = 'rgba(88,166,255,0.04)'
  ctx.fillRect(0, 0, W * 0.45, groundY)
  ctx.fillStyle = 'rgba(255,80,80,0.04)'
  ctx.fillRect(W * 0.45, 0, W * 0.55, groundY)

  // 虫洞区域标记
  if (battle.wormhole.active) {
    const wh = battle.wormhole
    ctx.fillStyle = `rgba(168,85,247,${0.04 + Math.sin(battle.battleTime * 0.003) * 0.03})`
    ctx.beginPath()
    ctx.arc(wh.x, wh.y, wh.interactRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  // 相机震动
  const camShakeX = (Math.random() - 0.5) * (battle.camera.shakeX || 0) * 2
  const camShakeY = (Math.random() - 0.5) * (battle.camera.shakeY || 0) * 2
  ctx.translate(camShakeX, camShakeY)

  // 渲染层级（按画家算法）
  renderParticles(ctx, battle)
  renderDroppedItems(ctx, battle)
  renderWormhole(ctx, battle)
  // ★ 移动指示器
  if (battle._moveIndicator && battle._moveIndicator.timer > 0) {
    const mi = battle._moveIndicator
    const alpha = Math.min(1, mi.timer / 200)
    ctx.strokeStyle = `rgba(88,166,255,${alpha * 0.8})`
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.arc(mi.x, mi.y, 18, 0, Math.PI * 2); ctx.stroke()
    // 十字
    ctx.beginPath(); ctx.moveTo(mi.x - 10, mi.y); ctx.lineTo(mi.x + 10, mi.y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(mi.x, mi.y - 10); ctx.lineTo(mi.x, mi.y + 10); ctx.stroke()
    ctx.setLineDash([])
  }
  renderAllEntities(ctx, battle)
  renderSkillArcMenu(ctx, battle)
  renderEffects(ctx, battle)      // 非空间型特效
  renderFloatingTexts(ctx, battle)
  renderTransition(ctx, battle)   // 过场黑屏（最上层）

  ctx.restore()

  // UI层（不受相机影响）
  const equipMod = require('./tower-equipment')
  equipMod.renderEquipPanel(ctx, battle)
  renderUI(ctx, battle)
  } catch (e) {
    console.error(`[Tower] 💥 render 崩溃! phase=${battle.phase}, error=`, e)
    ctx.restore()
  }
}

// ============================================================
//  卡牌选择界面
// ============================================================

function renderCardSelect(ctx, battle) {
  console.log(`[Tower] 🔍 renderCardSelect 开始`)
  const W = battle.width, H = battle.height, dpr = battle.dpr
  const cp = battle.cardPhase
  console.log(`[Tower] 🔍 cp=`, cp ? `cards=${cp.cards?.length}, confirmed=${cp.confirmed}, selIdx=${cp.selectedIndex}` : 'NULL!!')

  ctx.fillStyle = 'rgba(13, 17, 23, 0.95)'
  ctx.fillRect(0, 0, W, H)

  // 标题
  ctx.fillStyle = '#ffd700'
  ctx.font = `bold ${22 * dpr}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('✦ 选择一张祝福卡牌 ✦', W / 2, H * 0.12)

  ctx.fillStyle = '#8b949e'
  ctx.font = `${13 * dpr}px sans-serif`
  ctx.fillText('点击即可选择，效果持续整场战斗', W / 2, H * 0.12 + 30 * dpr)

  const cardW = Math.min(100 * dpr, W * 0.28)
  const cardH = Math.min(130 * dpr, H * 0.32)
  const gap = 12 * dpr
  const totalW = (cp.cards || []).length * cardW + ((cp.cards || []).length - 1) * gap
  const startX = (W - totalW) / 2
  const startY = (H - cardH) / 2 - 10 * dpr
  const time = (cp.animTimer || 0) / 1000

  console.log(`[Tower] 🔍 进入 forEach 循环, cards count=${(cp.cards||[]).length}`)
  ;(cp.cards || []).forEach((card, i) => {
    const cx = startX + i * (cardW + gap)
    const cy = startY
    const isSelected = cp.selectedIndex === i
    const isConfirmed = cp.confirmed && isSelected

    const floatOffset = isSelected ? Math.sin(time * 3) * 4 : 0
    const selScale = isSelected ? 1.05 : 1

    ctx.save()
    ctx.translate(cx + cardW / 2, cy + cardH / 2 + floatOffset)
    ctx.scale(selScale, selScale)
    ctx.translate(-cardW / 2, -cardH / 2)

    if (isConfirmed) {
      const confirmT = Math.min(1, ((Date.now() - cp._confirmTime) || 0) / 350)
      if (confirmT > 0.5) { ctx.globalAlpha = 1 - confirmT; const s = 1 + confirmT * 0.15; ctx.scale(s, s) }
    }

    const cardGrad = ctx.createLinearGradient(0, 0, 0, cardH)
    cardGrad.addColorStop(0, '#1c2128')
    cardGrad.addColorStop(1, '#21262d')
    ctx.fillStyle = cardGrad

    if (isSelected) { ctx.shadowBlur = 16 + Math.sin(time * 4) * 6; ctx.shadowColor = card.color || '#ffd700' }
    roundRect(ctx, 0, 0, cardW, cardH, 10)
    ctx.fill()
    ctx.shadowBlur = 0

    ctx.strokeStyle = isSelected ? (card.color || '#ffd700') : '#30363d'
    ctx.lineWidth = isSelected ? 2.5 : 1.5
    roundRect(ctx, 0, 0, cardW, cardH, 10)
    ctx.stroke()

    ctx.font = `${28 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(card.icon, cardW / 2, cardH * 0.22)

    ctx.fillStyle = card.color || '#f0e6d3'
    ctx.font = `bold ${12 * dpr}px sans-serif`
    ctx.fillText(card.name, cardW / 2, cardH * 0.40)

    ctx.fillStyle = '#8b949e'
    ctx.font = `${10 * dpr}px sans-serif`
    const maxDescW = cardW - 16
    let line = '', lineY = cardH * 0.54, lineCount = 0
    const descText = card.desc || ''
    for (const ch of descText) {
      const testLine = line + ch
      if (ctx.measureText(testLine).width > maxDescW && line.length > 0) {
        ctx.fillText(line, cardW / 2, lineY); line = ch; lineY += 15 * dpr; lineCount++
        if (lineCount >= 2) break
      } else line = testLine
    }
    if (lineCount < 2 && line) ctx.fillText(line, cardW / 2, lineY)

    if (card.rare) {
      ctx.fillStyle = '#f39c12'; ctx.font = `bold ${10 * dpr}px sans-serif`; ctx.fillText('★ 稀有 ★', cardW / 2, cardH * 0.88)
    } else if (!isConfirmed) {
      ctx.fillStyle = '#484f58'; ctx.font = `${10 * dpr}px sans-serif`; ctx.fillText('点击选择', cardW / 2, cardH * 0.88)
    }

    if (isConfirmed) {
      ctx.fillStyle = 'rgba(13, 17, 23, 0.7)'
      roundRect(ctx, 0, 0, cardW, cardH, 10)
      ctx.fill()
      ctx.fillStyle = '#3fb950'
      ctx.font = `bold ${14 * dpr}px sans-serif`
      ctx.fillText('✓ 已选', cardW / 2, cardH / 2)
    }
    ctx.restore()
  })

  if (!cp.confirmed) {
    ctx.fillStyle = '#484f58'
    ctx.font = `${12 * dpr}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('点击任意一张卡牌开始战斗', W / 2, H - 24 * dpr)
  }
  console.log(`[Tower] 🔍 renderCardSelect 正常结束`)
}

// ============================================================
//  结果界面（胜利/失败）
// ============================================================

function renderResultScreen(ctx, battle) {
  const W = battle.width, H = battle.height, dpr = battle.dpr

  ctx.fillStyle = 'rgba(13, 17, 23, 0.94)'
  ctx.fillRect(0, 0, W, H)

  const isVictory = battle.phase === 'victory'
  const title = isVictory ? '🎉 胜利!' : '☠️ 失败...'
  const subtitle = isVictory ? '恭喜通关！所有波次已击败' : '全员阵亡，挑战失败'

  ctx.fillStyle = isVictory ? '#ffd700' : '#f85149'
  ctx.font = `bold ${36 * dpr}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, W / 2, H * 0.35)

  ctx.fillStyle = '#c9d1d9'
  ctx.font = `${16 * dpr}px sans-serif`
  ctx.fillText(subtitle, W / 2, H * 0.45)

  // 统计数据
  const stats = battle.getStats ? battle.getStats() : {}
  const statLines = [
    `⏱ 用时: ${((stats.time || 0)).toFixed(1)}s`,
    `💀 击杀: ${stats.kills || 0}`,
    `📦 拾取: ${stats.dropsCollected || 0}`,
  ]
  ctx.fillStyle = '#8b949e'
  ctx.font = `${14 * dpr}px sans-serif`
  for (let i = 0; i < statLines.length; i++) {
    ctx.fillText(statLines[i], W / 2, H * 0.55 + i * 28 * dpr)
  }

  // 返回按钮
  const btnW = 200 * dpr, btnH = 50 * dpr
  const btnX = (W - btnW) / 2, btnY = H * 0.78
  ctx.fillStyle = isVictory ? 'rgba(46,160,67,0.8)' : 'rgba(200,60,60,0.8)'
  roundRect(ctx, btnX, btnY, btnW, btnH, 10)
  ctx.fill()
  ctx.strokeStyle = isVictory ? '#3fb950' : '#f85149'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${16 * dpr}px sans-serif`
  ctx.fillText('返回', W / 2, btnY + btnH / 2)

  // 存储按钮边界供点击检测
  battle._backBtnBounds = { x: btnX, y: btnY, w: btnW, h: btnH }
}

// ============================================================
//  HUD顶栏
// ============================================================

function renderUI(ctx, battle) {
  const W = battle.width, H = battle.height, dpr = battle.dpr
  const topBarH = Math.max(H * 0.095, 56)

  // 顶栏背景
  const grad = ctx.createLinearGradient(0, 0, 0, topBarH)
  grad.addColorStop(0, 'rgba(13,17,23,0.92)')
  grad.addColorStop(1, 'rgba(18,24,38,0.88)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, topBarH)

  // 底部分隔线
  ctx.strokeStyle = 'rgba(80,140,220,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, topBarH); ctx.lineTo(W, topBarH); ctx.stroke()

  // ---- 左侧：波次信息 ----
  const currentWave = Math.min(battle.waveIndex + 1, battle.totalWaves)
  ctx.fillStyle = '#a78bfa'
  ctx.font = `bold ${Math.max(14, 16 * dpr)}px sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`⚔ 第${currentWave}波`, Math.max(8, 10), topBarH * 0.36)

  // 波次数值
  const waveColor = currentWave <= 3 ? '#4ade80' : currentWave <= 6 ? '#fbbf24' : currentWave <= 9 ? '#f97316' : '#f87171'
  ctx.fillStyle = waveColor
  ctx.font = `bold ${Math.max(13, 14 * dpr)}px sans-serif`
  ctx.fillText(`${currentWave} / ${battle.totalWaves}`, Math.max(72, 80), topBarH * 0.32)

  // 进度条
  const progBarW = Math.min(100 * dpr, W * 0.22)
  const progBarX = Math.max(8, 10)
  const progBarY = topBarH * 0.58
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  roundRect(ctx, progBarX, progBarY, progBarW, Math.max(6, 7), 3)
  ctx.fill()
  const progress = battle.totalWaves > 0 ? currentWave / battle.totalWaves : 0
  if (progress > 0) {
    ctx.fillStyle = '#a855f7'
    roundRect(ctx, progBarX, progBarY, progBarW * Math.min(progress, 1), Math.max(6, 7), 3)
    ctx.fill()
  }

  // ---- 中间：状态 ----
  let centerLabel = '', centerColor = '#94a3b8'
  if (battle.transition.active) { centerLabel = '🌀 传送中...'; centerColor = '#a855f7' }
  else if (battle.wormhole.active && !battle.allWavesDone) { centerLabel = '🌀 前往虫洞!'; centerColor = '#a855f7' }
  else if (battle.allWavesDone) { centerLabel = '✅ 全部通关!'; centerColor = '#4ade80' }
  else if (battle.waveActive) { centerLabel = `⚔️ 第 ${currentWave} 波激战中`; centerColor = '#f97316' }
  else { centerLabel = `第 ${currentWave} / ${battle.totalWaves} 波` }

  ctx.fillStyle = centerColor
  ctx.font = `bold ${Math.max(16, 18 * dpr)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(centerLabel, W / 2, topBarH * 0.36)

  // 剩余怪物
  if (!battle.allWavesDone && battle.waveTotalCount > 0) {
    const validMonsters = (battle.monsters || []).filter(m => m != null)
    const aliveCount = validMonsters.filter(m => !m.isDead).length
    const unspawned = Math.max(0, battle.waveTotalCount - battle.waveSpawnedCount)
    const remaining = unspawned + aliveCount
    const remainLabel = remaining > 0 ? `剩余: ${remaining}` : '清理中...'
    ctx.fillStyle = remaining > 3 ? '#94a3b8' : remaining > 0 ? '#fbbf24' : '#4ade80'
    ctx.font = `${Math.max(10, 11 * dpr)}px sans-serif`
    ctx.fillText(remainLabel, W / 2, topBarH * 0.68)
  }

  // 右侧统计
  ctx.fillStyle = '#7890b0'
  ctx.font = `${Math.max(10, 11 * dpr)}px sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const statsText = `💀${battle.stats.kills || 0}  📦${battle.stats.dropsCollected || 0}`
  ctx.fillText(statsText, W - Math.max(8, 10), topBarH * 0.42)

  // 虫洞提示
  if (battle.wormhole.active && !battle.transition.active && !battle.allWavesDone) {
    ctx.fillStyle = '#a855f7'
    ctx.font = `${Math.max(10, 11 * dpr)}px sans-serif`
    ctx.textAlign = 'center'
    const hintPulse = 0.6 + Math.sin(battle.battleTime * 0.004) * 0.4
    ctx.globalAlpha = hintPulse
    ctx.fillText('👆 靠近虫洞进入下一波 →', W / 2, topBarH * 0.85)
    ctx.globalAlpha = 1
  }

  // 底部面板
  renderBottomPanel(ctx, battle)

  // 悬浮提示
  const equipMod = require('./tower-equipment')
  equipMod.renderItemTooltip(ctx, battle)
}

// ============================================================
//  底部面板系统
// ============================================================

function renderBottomPanel(ctx, battle) {
  const W = battle.width, H = battle.height, dpr = battle.dpr
  const bottomMargin = Math.max(8, 12 * dpr)
  const skillBarH = Math.max(H * 0.055, 40)
  const tacticsBarH = Math.max(H * 0.06, 42)
  const equipBarH = Math.max(H * 0.22, 170)
  const totalBarH = tacticsBarH + skillBarH + equipBarH + 8
  const panelY = H - totalBarH - bottomMargin

  renderSkillBar(ctx, 0, panelY, W, skillBarH, battle)
  renderTacticsBar(ctx, 0, panelY + skillBarH + 4, W, tacticsBarH, battle)
  renderEquipInventory(ctx, 0, panelY + skillBarH + 4 + tacticsBarH + 4, W, equipBarH, battle)

  battle._bottomPanelBounds = {
    y: panelY,
    skillBar: { x: 0, y: panelY, w: W, h: skillBarH },
    tacticsBar: { x: 0, y: panelY + skillBarH + 4, w: W, h: tacticsBarH },
    equipBar: { x: 0, y: panelY + skillBarH + 4 + tacticsBarH + 4, w: W, h: equipBarH },
  }
}

// ============================================================
//  技能栏
// ============================================================

function renderSkillBar(ctx, x, y, w, h, battle) {
  const dpr = battle.dpr
  const selected = battle.party[battle.selectedCharIndex]
  if (!selected || !selected.skills) { return }
  const skills = selected.skills
  ctx.save()

  const grad = ctx.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, 'rgba(18,24,38,0.92)')
  grad.addColorStop(1, 'rgba(12,18,28,0.95)')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w, h)

  ctx.strokeStyle = 'rgba(100,160,255,0.2)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
  ctx.strokeStyle = 'rgba(50,70,110,0.25)'
  ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke()

  // 角色名标签
  ctx.fillStyle = '#7aa2d8'
  ctx.font = `bold ${Math.max(9, 10 * dpr)}px sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText(`${selected.name} 技能`, x + Math.max(8, 10 * dpr), y + h / 2)

  // 技能按钮
  battle._skillBarButtons = []
  const btnGap = Math.max(4, 5 * dpr)
  const btnSize = Math.min(h * 0.72, 36 * dpr)
  const labelW = 70 * dpr
  const totalBtnW = skills.length * btnSize + (skills.length - 1) * btnGap
  const startX = x + labelW + (w - labelW - Math.max(16, 20 * dpr) - totalBtnW) / 2
  const btnY = y + (h - btnSize) / 2

  for (let i = 0; i < skills.length; i++) {
    const sk = skills[i]
    const bx = startX + i * (btnSize + btnGap)
    const cdRemaining = Math.max(0, selected.skillCDs[sk.id] || 0)
    const onCD = cdRemaining > 0
    const canAfford = (selected.currentMp || 0) >= (sk.mpCost || 0)
    const unlocked = sk.unlockLevel ? (selected.level >= (sk.unlockLevel || 1)) : true
    const disabled = selected.isDead || !unlocked || onCD || !canAfford

    ctx.save(); ctx.translate(bx, btnY)

    if (!unlocked) { ctx.fillStyle = 'rgba(38,44,54,0.8)'; ctx.strokeStyle = '#333'; ctx.lineWidth = 1 }
    else if (onCD) {
      const g = ctx.createRadialGradient(btnSize/2, btnSize/2, 2, btnSize/2, btnSize/2, btnSize*0.45)
      g.addColorStop(0, 'rgba(50,45,65,0.85)'); g.addColorStop(1, 'rgba(35,32,48,0.75)')
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(80,70,100,0.4)'; ctx.lineWidth = 1
    } else if (!canAfford) {
      const g = ctx.createRadialGradient(btnSize/2, btnSize/2, 2, btnSize/2, btnSize/2, btnSize*0.45)
      g.addColorStop(0, 'rgba(90,40,35,0.8)'); g.addColorStop(1, 'rgba(65,30,26,0.7)')
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(180,80,60,0.3)'; ctx.lineWidth = 1
    } else {
      const typeColor = sk.type === 'magic' ? [100,50,200] : sk.type === 'heal' ? [50,170,90] : sk.type === 'buff' ? [200,150,50] : [70,85,105]
      const g = ctx.createRadialGradient(btnSize/2, btnSize/2, 2, btnSize/2, btnSize/2, btnSize*0.45)
      g.addColorStop(0, `rgba(${typeColor[0]},${typeColor[1]},${typeColor[2]},0.8)`)
      g.addColorStop(1, `rgba(${Math.floor(typeColor[0]*0.6)},${Math.floor(typeColor[1]*0.6)},${Math.floor(typeColor[2]*0.6)},0.65)`)
      ctx.fillStyle = g; ctx.strokeStyle = `rgba(${typeColor[0]+50},${typeColor[1]+50},${typeColor[2]+50},0.5)`; ctx.lineWidth = 1.2
    }

    roundRect(ctx, 0, 0, btnSize, btnSize, 5); ctx.fill(); ctx.stroke()

    // CD遮罩
    if (onCD && sk.cd > 0 && cdRemaining > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.beginPath(); ctx.moveTo(btnSize/2, btnSize/2)
      ctx.arc(btnSize/2, btnSize/2, btnSize * 0.48, -Math.PI / 2, -Math.PI / 2 + (cdRemaining / sk.cd) * Math.PI * 2)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.max(9, 10 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`${Math.ceil(cdRemaining / 1000)}s`, btnSize/2, btnSize/2 + 14)
    } else {
      ctx.fillStyle = !unlocked ? '#556' : (!canAfford ? '#e88' : '#eef')
      ctx.font = `${Math.max(8, 9 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const displayName = sk.name.length > 3 ? sk.name.slice(0, 3) : sk.name
      ctx.fillText(displayName, btnSize/2, btnSize/2)
    }

    if (!unlocked) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `${14 * dpr}px sans-serif`
      ctx.fillText(`🔒${sk.unlockLevel}级`, btnSize/2, btnSize/2)
    }
    ctx.restore()

    battle._skillBarButtons.push({
      skillIdx: i, skillId: sk.id, charIndex: battle.selectedCharIndex,
      x: bx, y: btnY, w: btnSize, h: btnSize, disabled, onCD, canAfford, unlocked,
    })
  }
  ctx.restore()
}

// ============================================================
//  策略按钮栏
// ============================================================

function renderTacticsBar(ctx, x, y, w, h, battle) {
  const dpr = battle.dpr
  ctx.save()

  const grad = ctx.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, 'rgba(20,28,42,0.95)')
  grad.addColorStop(1, 'rgba(14,20,32,0.98)')
  ctx.fillStyle = grad; ctx.fillRect(x, y, w, h)

  ctx.strokeStyle = 'rgba(80,140,220,0.25)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke()
  ctx.strokeStyle = 'rgba(60,80,120,0.3)'; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke()

  const aliveChar = (battle.party || []).find(c => !c.isDead)
  const aiGlobalOn = aliveChar ? !!aliveChar.autoAttackEnabled : false

  const buttons = [
    { id: 'auto_attack', label: aiGlobalOn ? 'AI:开' : 'AI:关', icon: '🤖', active: aiGlobalOn, desc: aiGlobalOn ? 'AI自动战斗中（点击关闭）' : '开启AI自动战斗' },
    { id: 'target_nearest', label: '最近目标', icon: '🎯', active: battle.battleTactics.targetPriority === 'nearest', desc: '优先攻击最近的敌人' },
    { id: 'target_lowestHp', label: '残血优先', icon: '🩸', active: battle.battleTactics.targetPriority === 'lowestHp', desc: '优先攻击HP最低的敌人' },
    { id: 'target_ranged', label: '先打远程', icon: '🏹', active: battle.battleTactics.targetPriority === 'ranged', desc: '优先攻击远程怪物' },
    { id: 'hold_position', label: '坚守位置', icon: '🛡️', active: !!battle.battleTactics.holdPosition, desc: '角色不自动移动' },
  ]

  const btnCount = buttons.length
  const btnGap = Math.max(4, 6 * dpr)
  const btnH = Math.max(h * 0.62, 30)
  const btnW = Math.min((w - (btnCount + 1) * btnGap) / btnCount, 90 * dpr)
  const totalW = btnCount * btnW + (btnCount - 1) * btnGap
  const startX = x + (w - totalW) / 2
  const btnY = y + (h - btnH) / 2

  battle._tacticButtons = []
  for (let i = 0; i < btnCount; i++) {
    const btn = buttons[i]
    const bx = startX + i * (btnW + btnGap)

    ctx.fillStyle = btn.active ? (() => { const g = ctx.createLinearGradient(bx, btnY, bx, btnY + btnH); g.addColorStop(0, 'rgba(59,130,246,0.8)'); g.addColorStop(1, 'rgba(37,99,235,0.75)'); return g })() : 'rgba(45,52,64,0.85)'
    roundRect(ctx, bx, btnY, btnW, btnH, 6); ctx.fill()
    if (btn.active && !btn.disabled) { ctx.strokeStyle = 'rgba(96,165,250,0.8)'; ctx.lineWidth = 1.5; roundRect(ctx, bx, btnY, btnW, btnH, 6); ctx.stroke() }
    else if (!btn.disabled) { ctx.strokeStyle = 'rgba(70,80,100,0.5)'; ctx.lineWidth = 0.8; roundRect(ctx, bx, btnY, btnW, btnH, 6); ctx.stroke() }

    ctx.font = `${Math.max(12, 13 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.globalAlpha = btn.disabled ? 0.35 : (btn.active ? 1 : 0.7); ctx.fillText(btn.icon, bx + btnW / 2, btnY + btnH * 0.35)
    ctx.font = `${Math.max(9, 10 * dpr)}px sans-serif`
    ctx.fillStyle = btn.active ? '#e2e8f0' : (btn.disabled ? '#555' : '#94a3b8')
    ctx.fillText(btn.label, bx + btnW / 2, btnY + btnH * 0.72); ctx.globalAlpha = 1

    battle._tacticButtons.push({ ...btn, x: bx, y: btnY, w: btnW, h: btnH })
  }
  ctx.restore()
}

// ============================================================
//  装备背包 + 角色卡片
// ============================================================

function renderEquipInventory(ctx, x, y, w, h, battle) {
  const dpr = battle.dpr
  ctx.save()

  const grad = ctx.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, 'rgba(16,22,34,0.97)')
  grad.addColorStop(1, 'rgba(10,15,24,0.99)')
  ctx.fillStyle = grad; ctx.fillRect(x, y, w, h)

  const splitX = w * 0.58
  ctx.strokeStyle = 'rgba(60,80,120,0.25)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(splitX, y + 6); ctx.lineTo(splitX, y + h - 6); ctx.stroke()

  // 左侧：背包
  const invPadding = Math.max(8, 10 * dpr)
  const slotSize = Math.min((splitX - invPadding * 3) / 4, Math.max(58, 68 * dpr))
  const invLabelY = y + Math.max(20, 24 * dpr)

  ctx.fillStyle = '#889ab8'; ctx.font = `bold ${Math.max(15, 17 * dpr)}px sans-serif`
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText(`🎒 临时背包 (${battle.inventory.length}/${battle.maxInventorySize})`, x + invPadding, invLabelY)

  const gridStartY = invLabelY + Math.max(16, 18 * dpr)
  battle._inventorySlots = []

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const idx = row * 4 + col
      const sx = x + invPadding + col * (slotSize + 6)
      const sy = gridStartY + row * (slotSize + 6)
      const item = battle.inventory[idx]

      if (item) {
        const qColors = { common: '#374151', uncommon: '#1e3a5f', rare: '#3b2d5f', epic: '#4a1942', legendary: '#5c3d00' }
        ctx.fillStyle = qColors[item.quality] || '#374151'
        const qc = item.quality === 'legendary' ? '#fbbf24' : item.quality === 'epic' ? '#a855f7' : item.quality === 'rare' ? '#3b82f6' : '#6b7280'
        ctx.strokeStyle = qc; ctx.lineWidth = 1.5
      } else {
        ctx.fillStyle = 'rgba(30,38,52,0.85)'; ctx.strokeStyle = 'rgba(60,72,92,0.4)'; ctx.lineWidth = 1
      }
      roundRect(ctx, sx, sy, slotSize, slotSize, 5); ctx.fill(); ctx.stroke()

      // 待卖选中高亮
      if (item && battle._sellTargetIndex === idx) {
        ctx.strokeStyle = 'rgba(255,160,0,0.85)'; ctx.lineWidth = 2.5
        roundRect(ctx, sx - 1.5, sy - 1.5, slotSize + 3, slotSize + 3, 6); ctx.stroke()
        ctx.fillStyle = '#ffa500'; ctx.font = `bold ${Math.max(12, 14 * dpr)}px sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'top'
        ctx.fillText('卖', sx + slotSize - 2, sy + 2)
      }

      if (item) {
        const slotIcon = { weapon: '\u2694', armor: '\u{1F6E1}', accessory: '\u{1F48E}' }
        ctx.font = `bold ${Math.max(26, 30 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(slotIcon[item.slot] || '?', sx + slotSize / 2, sy + slotSize * 0.42)
        ctx.font = `bold ${Math.max(12, 14 * dpr)}px sans-serif`; ctx.fillStyle = '#b0c0d4'
        ctx.fillText(`Lv${item.level || 1}`, sx + slotSize / 2, sy + slotSize * 0.78)
      } else {
        ctx.fillStyle = 'rgba(80,96,120,0.35)'; ctx.font = `bold ${Math.max(24, 28 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('+', sx + slotSize / 2, sy + slotSize / 2)
      }
      battle._inventorySlots.push({ idx, x: sx, y: sy, size: slotSize, item })
    }
  }

  // 底部按钮行：卖出 | 金币 | 合成
  const btnRowY = y + h - Math.max(h * 0.13, 30) - 6
  const btnRowH = Math.max(h * 0.13, 30)
  const totalBtnW = splitX - invPadding * 2
  const btnGap = 4
  const singleBtnW = (totalBtnW - btnGap * 2) / 3

  const hasSellTarget = battle._sellTargetIndex >= 0 && battle._sellTargetIndex < battle.inventory.length
  ctx.fillStyle = hasSellTarget ? 'rgba(180,80,50,0.88)' : 'rgba(120,70,50,0.75)'
  roundRect(ctx, x + invPadding, btnRowY, singleBtnW, btnRowH, 5); ctx.fill()
  ctx.strokeStyle = hasSellTarget ? 'rgba(255,160,80,0.8)' : 'rgba(220,140,80,0.5)'; ctx.stroke()
  ctx.fillStyle = hasSellTarget ? '#ffd700' : '#f0c080'
  ctx.font = `bold ${Math.max(13, 15 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(hasSellTarget ? `💰卖${battle.inventory[battle._sellTargetIndex].name}` : '💰 卖出', x + invPadding + singleBtnW / 2, btnRowY + btnRowH / 2)
  battle._sellButton = { x: x + invPadding, y: btnRowY, w: singleBtnW, h: btnRowH }

  const goldX = x + invPadding + singleBtnW + btnGap
  ctx.fillStyle = 'rgba(30,38,52,0.9)'; roundRect(ctx, goldX, btnRowY, singleBtnW, btnRowH, 5); ctx.fill()
  ctx.fillStyle = '#f1c40f'; ctx.font = `bold ${Math.max(15, 17 * dpr)}px sans-serif`
  ctx.fillText(`💰 ${battle.gold}`, goldX + singleBtnW / 2, btnRowY + btnRowH / 2)

  const synthCost = 50
  const synthBtnX = goldX + singleBtnW + btnGap
  const canSynth = battle.gold >= synthCost && battle.inventory.length >= 2
  ctx.fillStyle = canSynth ? 'rgba(55,40,90,0.85)' : 'rgba(35,32,48,0.7)'
  roundRect(ctx, synthBtnX, btnRowY, singleBtnW, btnRowH, 5); ctx.fill()
  ctx.strokeStyle = canSynth ? 'rgba(168,85,247,0.7)' : 'rgba(100,80,130,0.3)'; ctx.stroke()
  ctx.fillStyle = canSynth ? '#c9a0ff' : '#666'
  ctx.font = `bold ${Math.max(13, 15 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(`⚗️合成-${synthCost}`, synthBtnX + singleBtnW / 2, btnRowY + btnRowH / 2)
  battle._synthButton = { x: synthBtnX, y: btnRowY, w: singleBtnW, h: btnRowH }
  battle._synthCost = synthCost

  // 右侧：角色卡片
  renderCharacterCard(ctx, battle, splitX + 8, y, w - splitX - 8, h, dpr)
  ctx.restore()
}

/**
 * 渲染角色信息卡片（头像+属性+装备槽）
 */
function renderCharacterCard(ctx, battle, charAreaX, y, charAreaW, h, dpr) {
  if (battle.selectedCharIndex < 0) battle.selectedCharIndex = 0
  const idx = Math.min(battle.selectedCharIndex, battle.party.length - 1)
  const c = battle.party[idx]

  // 标题
  const labelY = y + Math.max(14, 16 * dpr)
  ctx.font = `bold ${Math.max(14, 16 * dpr)}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillStyle = c.isDead ? '#666' : '#c8dce8'; ctx.fillText(c.name, charAreaX, labelY)
  ctx.textAlign = 'right'; ctx.fillStyle = '#5a6a80'; ctx.font = `${Math.max(11, 12 * dpr)}px sans-serif`
  ctx.fillText(`${idx + 1}/${battle.party.length}`, charAreaX + charAreaW, labelY)

  // 大卡片
  const charCardH = Math.min(h - 52, 140 * dpr)
  const cardX = charAreaX, cardY = labelY + Math.max(10, 12 * dpr)
  const bgGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + charCardH)
  bgGrad.addColorStop(0, c.isDead ? 'rgba(35,30,30,0.92)' : 'rgba(28,42,58,0.88)')
  bgGrad.addColorStop(1, c.isDead ? 'rgba(25,22,22,0.96)' : 'rgba(18,28,40,0.95)')
  ctx.fillStyle = bgGrad
  roundRect(ctx, cardX, cardY, charAreaW, charCardH, 10); ctx.fill()
  ctx.strokeStyle = c.isDead ? 'rgba(90,70,70,0.35)' : 'rgba(60,140,160,0.35)'; ctx.lineWidth = 1
  roundRect(ctx, cardX, cardY, charAreaW, charCardH, 10); ctx.stroke()

  // 头像
  const avatarSize = Math.min(charCardH - 12, 68 * dpr)
  const avatarX = cardX + 8, avatarY = cardY + (charCardH - avatarSize) / 2
  ctx.save(); ctx.beginPath(); ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2); ctx.clip()
  let avatarKey = null
  if (c.name.includes('臻宝')) avatarKey = 'HERO_ZHENBAO_IDLE_01'
  else if (c.name.includes('李') || c.name.includes('小宝')) avatarKey = 'HERO_LIXIAOBAO_IDLE_01'
  const avatarImg = avatarKey ? battle.assets?.get?.(avatarKey) : null
  if (avatarImg && avatarImg.width > 0) { ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize) }
  else {
    const abGrad = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize)
    abGrad.addColorStop(0, c.role === 'mage' ? '#4a3f9e' : '#9a6a32'); abGrad.addColorStop(1, c.role === 'mage' ? '#2d2558' : '#6a4520')
    ctx.fillStyle = abGrad; ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize)
    ctx.font = `bold ${Math.max(24, avatarSize * 0.45)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = c.isDead ? '#555' : '#e8f0f8'; ctx.fillText(c.name.charAt(0), avatarX + avatarSize / 2, avatarY + avatarSize / 2)
  }
  ctx.restore()

  // 死亡状态遮罩
  if (c.isDead && c.respawnTimer > 0) {
    ctx.save(); ctx.beginPath(); ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2); ctx.clip()
    ctx.fillStyle = 'rgba(0,0,0,0.68)'; ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize)
    ctx.font = `bold ${Math.max(22, avatarSize * 0.4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('☠', avatarX + avatarSize / 2, avatarY + avatarSize * 0.32)
    const sec = Math.ceil(c.respawnTimer / 1000)
    const flashAlpha = sec <= 3 ? (0.6 + 0.4 * Math.sin(Date.now() / 200)) : 1
    ctx.globalAlpha = flashAlpha; ctx.fillStyle = sec <= 3 ? '#ff4444' : '#58a6ff'
    ctx.font = `bold ${Math.max(12, avatarSize * 0.26)}px sans-serif`
    ctx.fillText(`${sec}s`, avatarX + avatarSize / 2, avatarY + avatarSize * 0.32); ctx.restore()
  }

  // 头像边框
  ctx.beginPath(); ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2, 0, Math.PI * 2)
  ctx.strokeStyle = c.isDead ? '#555' : (c.role === 'mage' ? '#7c8ce8' : '#e8a84c'); ctx.lineWidth = 2; ctx.stroke()

  // 信息区
  const infoX = avatarX + avatarSize + 12
  const infoW = charAreaW - (infoX - cardX) - 44
  const infoTop = cardY + 6

  ctx.font = `bold ${Math.max(13, 14 * dpr)}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillStyle = c.isDead ? '#555' : '#eef4fa'; ctx.fillText(c.name, infoX, infoTop)
  ctx.font = `${Math.max(11, 12 * dpr)}px sans-serif`
  const roleColor = c.role === 'mage' ? '#93b4f5' : '#f5c563'; ctx.fillStyle = c.isDead ? '#444' : roleColor
  ctx.fillText(`Lv${c.level}  ${c.role === 'mage' ? '法师' : '战士'}`, infoX, infoTop + 57)

  // 三个装备槽
  const slotKeys = ['weapon', 'armor', 'accessory']
  const slotIcons = { weapon: '\u2694', armor: '\u{1F6E1}', accessory: '\u{1F48E}' }
  const slotW = (infoW - 8) / 3, slotH = Math.max(34, 32 * dpr), slotStartY = infoTop + 100
  battle._charEquipSlots = []

  for (let si = 0; si < 3; si++) {
    const sk = slotKeys[si], sx = infoX + si * (slotW + 4), sy = slotStartY
    const eqItem = c.equippedItems[sk]
    if (eqItem) {
      const qBg = { common: '#2a3040', uncommon: '#1a2a45', rare: '#2a2050', epic: '#3a1540', legendary: '#4a3000' }
      ctx.fillStyle = qBg[eqItem.quality] || '#2a3040'
      const qBorder = { common: '#555', uncommon: '#4a90c8', rare: '#7c5cf0', epic: '#c050d0', legendary: '#e8a000' }
      ctx.strokeStyle = qBorder[eqItem.quality] || '#555'; ctx.lineWidth = 1.5
    } else { ctx.fillStyle = 'rgba(24,32,44,0.75)'; ctx.strokeStyle = 'rgba(60,76,100,0.3)'; ctx.lineWidth = 1 }
    roundRect(ctx, sx, sy, slotW, slotH, 4); ctx.fill(); ctx.stroke()

    if (eqItem) {
      ctx.font = `bold ${Math.max(16, 18 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(slotIcons[sk], sx + slotW / 2, sy + slotH * 0.42)
      ctx.font = `bold ${Math.max(10, 10 * dpr)}px sans-serif`; ctx.fillStyle = '#9ab'
      ctx.fillText(`L${eqItem.level || 1}`, sx + slotW / 2, sy + slotH * 0.78)
    } else {
      ctx.fillStyle = 'rgba(70,90,115,0.4)'; ctx.font = `bold ${Math.max(20, 22 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('+', sx + slotW / 2, sy + slotH / 2)
    }
    battle._charEquipSlots.push({ charIdx: idx, slot: sk, x: sx, y: sy, w: slotW, h: slotH })
  }

  // HP/MP/EXP 三条状态栏
  const barX = infoX, barStartY = slotStartY + slotH + 10
  const barW = infoW, barH = 9, barGap = 26
  let cursorY = barStartY

  // HP
  const hpRatio = (c.maxHp || 1) > 0 ? Math.max(0, (c.currentHp || 0) / (c.maxHp || 1)) : 0
  ctx.fillStyle = 'rgba(40,20,20,0.50)'; roundRect(ctx, barX, cursorY, barW, barH, 3); ctx.fill()
  if (hpRatio > 0) { ctx.fillStyle = hpRatio > 0.5 ? '#e74c3c' : hpRatio > 0.25 ? '#e67e22' : '#c0392b'; roundRect(ctx, barX, cursorY, Math.max(barH * 0.5, barW * hpRatio), barH, 3); ctx.fill() }
  ctx.font = `bold ${Math.max(10, 11 * dpr)}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillStyle = hpRatio > 0.5 ? '#ff6b6b' : '#ffa07a'; ctx.fillText(`HP  ${(c.currentHp||0).toFixed(0)} / ${(c.maxHp||0).toFixed(0)}`, barX + 2, cursorY + barH + 2)
  cursorY += barH + barGap

  // MP
  const mpMax = c.maxMp || 30, mpCur = Math.floor(c.currentMp || 0), mpRatio = mpMax > 0 ? Math.max(0, mpCur / mpMax) : 0
  ctx.fillStyle = 'rgba(15,25,45,0.48)'; roundRect(ctx, barX, cursorY, barW, barH, 3); ctx.fill()
  if (mpRatio > 0) { ctx.fillStyle = '#3498db'; roundRect(ctx, barX, cursorY, Math.max(barH * 0.5, barW * mpRatio), barH, 3); ctx.fill() }
  ctx.fillStyle = '#74b9ff'; ctx.fillText(`MP  ${mpCur} / ${mpMax}`, barX + 2, cursorY + barH + 2)
  cursorY += barH + barGap

  // EXP
  // EXP（使用config统一经验表）
  const EXP_TABLE = require('./tower-config').EXP_TABLE
  const curExp = c.totalExp || 0, nextExp = EXP_TABLE[c.level + 1] || 999999, prevExp = EXP_TABLE[c.level] || 0
  const needed = nextExp - prevExp, gained = Math.max(0, curExp - prevExp), expRatio = needed > 0 ? Math.min(1, gained / needed) : 0
  ctx.fillStyle = 'rgba(30,28,35,0.40)'; roundRect(ctx, barX, cursorY, barW, barH, 3); ctx.fill()
  if (expRatio > 0) { ctx.fillStyle = 'rgba(200,195,210,0.85)'; roundRect(ctx, barX, cursorY, Math.max(barH * 0.5, barW * expRatio), barH, 3); ctx.fill() }
  ctx.fillStyle = '#b8b4c4'; ctx.fillText(`EXP  ${gained} / ${needed}`, barX + 2, cursorY + barH + 2)

  // 切换按钮
  const btnSize = Math.min(26, charCardH * 0.3), btnCY = cardY + charCardH / 2
  const leftBtnX = cardX + charAreaW - btnSize * 2 - 6, rightBtnX = cardX + charAreaW - btnSize - 4
  ;[{ dir: -1, bx: leftBtnX, enabled: idx > 0 }, { dir: 1, bx: rightBtnX, enabled: idx < battle.party.length - 1 }].forEach(b => {
    ctx.fillStyle = b.enabled ? 'rgba(50,130,180,0.6)' : 'rgba(40,52,68,0.35)'
    roundRect(ctx, b.bx, btnCY - btnSize / 2, btnSize, btnSize, 5); ctx.fill()
    if (b.enabled) { ctx.strokeStyle = 'rgba(100,180,230,0.4)'; ctx.lineWidth = 0.8; roundRect(ctx, b.bx, btnCY - btnSize / 2, btnSize, btnSize, 5); ctx.stroke() }
    ctx.font = `bold ${Math.max(11, 12 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = b.enabled ? '#c0e0ff' : '#445'; ctx.fillText(b.dir < 0 ? '\u25C0' : '\u25B6', b.bx + btnSize / 2, btnCY)
  })

  battle._charSwitchBtns = [{ dir: -1, x: leftBtnX, y: btnCY - btnSize / 2, w: btnSize, h: btnSize }, { dir: 1, x: rightBtnX, y: btnCY - btnSize / 2, w: btnSize, h: btnSize }]
}

// ============================================================
//  实体渲染（Y轴排序）
// ============================================================

function renderAllEntities(ctx, battle) {
  const entities = []
  for (const c of (battle.party || [])) { if (!(c.isDead && c.respawnTimer <= 0)) entities.push({ type: 'char', entity: c, y: c.y }) }
  for (const m of (battle.monsters || [])) { if (!(m.isDead && m.deathTimer <= 0)) entities.push({ type: 'monster', entity: m, y: m.y + (m.shakeY || 0) }) }
  for (const p of (battle.projectiles || [])) { if (p.hit && !p._keepDrawing) continue; entities.push({ type: 'projectile', entity: p, y: p.y }) }

  entities.sort((a, b) => a.y - b.y)
  for (const e of entities) {
    if (e.type === 'char') renderOneCharacter(ctx, e.entity, battle)
    else if (e.type === 'monster') renderOneMonster(ctx, e.entity, battle)
    else if (e.type === 'projectile') renderOneProjectile(ctx, e.entity, battle)
  }
}

/** 渲染单个角色精灵 */
function renderOneCharacter(ctx, c, battle) {
  if (c.isDead && c.respawnTimer <= 0) return
  ctx.save(); ctx.translate(c.x, c.y)

  if (c.facingRight) ctx.scale(-1, 1)
  if (c.isDead) { ctx.globalAlpha = 0.55; ctx.fillStyle = '#58a6ff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${(c.respawnTimer / 1000).toFixed(1)}s`, 0, 0); ctx.restore(); return }

  // 攻击动画位移
  if (c.attackAnimTimer > 0 && c.animState === 'attack') { const progress = c.attackAnimTimer / 350; ctx.translate(16 * progress, -4 * Math.sin((1 - progress) * Math.PI)); const s = 1 + (1 - progress) * 0.15; ctx.scale(s, s) }
  else if (c.castSkillId && c.attackAnimTimer > 0) { const progress = c.attackAnimTimer / 600; ctx.translate(0, -6 * Math.sin(progress * Math.PI * 3)); ctx.scale(1 + Math.sin(progress * Math.PI * 2) * 0.08, 1 + Math.sin(progress * Math.PI * 2) * 0.08) }

  if (c.hurtFlash > 0) { ctx.shadowBlur = 22; ctx.shadowColor = '#ffffff' }
  if (c.levelUpFlash > 0) { ctx.shadowBlur = 15 + c.levelUpFlash * 20; ctx.shadowColor = '#ffd700' }

  // 脚下阴影
  if (!c.isDead) {
    ctx.save(); const shW = 44 + (c.levelUpFlash > 0 ? 8 : 0), shH = 14
    ctx.beginPath(); ctx.ellipse(0, -2, shW, shH, 0, 0, Math.PI * 2)
    const shGrad = ctx.createRadialGradient(0, -2, 0, 0, -2, shW)
    shGrad.addColorStop(0, 'rgba(40,35,20,0.45)'); shGrad.addColorStop(0.6, 'rgba(30,25,15,0.22)'); shGrad.addColorStop(1, 'rgba(20,18,10,0)')
    ctx.fillStyle = shGrad; ctx.fill(); ctx.restore(); ctx.shadowBlur = 0
  }

  // 精灵图
  const img = getCharFrameImage(c, battle)
  if (img) { const drawH = 200, drawW = img.width * (drawH / img.height); ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH) }
  else {
    const roleColor = { warrior: '#3498db', mage: '#9b59b6', fighter: '#e74c3c', healer: '#2ecc71' }[c.role] || '#888'
    ctx.fillStyle = c.hurtFlash > 0 ? '#ffffff' : roleColor
    roundRect(ctx, -40, -170, 80, 170, 14); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.name.charAt(0), 0, -85)
  }
  ctx.restore()

  // UI层（名字/等级/血条/Buff）
  ctx.save(); ctx.translate(c.x, c.y)
  ctx.shadowBlur = 0
  const nameColor = c.levelUpFlash > 0 ? '#ffd700' : '#ffffff'
  const fontSize = Math.max(18, Math.round(16 * battle.dpr))
  ctx.font = `bold ${fontSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const labelText = `${c.name} Lv${c.level}`, labelY = -232
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  const textW = ctx.measureText(labelText).width + 16
  roundRect(ctx, -textW / 2, labelY - fontSize / 2 - 4, textW, fontSize + 8, 4); ctx.fill()
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeText(labelText, 0, labelY)
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6; ctx.fillStyle = nameColor; ctx.fillText(labelText, 0, labelY); ctx.shadowBlur = 0

  // Buff图标栏
  if (c.buffs && c.buffs.length > 0) {
    const iconSize = Math.max(16, 18 * dpr), gap = 3
    const totalW = c.buffs.length * (iconSize + gap) - gap, startX = -totalW / 2, buffLabelY = labelY + 22
    for (let bi = 0; bi < c.buffs.length; bi++) {
      const b = c.buffs[bi], bx = startX + bi * (iconSize + gap)
      const elapsed = Date.now() - b.startTime, remain = Math.max(0, b.duration - elapsed), ratio = remain / b.duration
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.65)'; roundRect(ctx, bx, buffLabelY, iconSize, iconSize + 8, 4); ctx.fill()
      ctx.strokeStyle = b.color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6 + ratio * 0.4; ctx.stroke()
      ctx.font = `${Math.max(11, 12 * battle.dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'
      ctx.fillText(b.icon, bx + iconSize / 2, buffLabelY + iconSize * 0.38)
      const timerFont = Math.max(7, 8 * battle.dpr); ctx.font = `bold ${timerFont}px sans-serif`
      ctx.fillStyle = remain <= 3000 ? (0.6 + 0.4 * Math.sin(Date.now() / 200)) > 0.5 ? '#ff4444' : '#ff4444' : b.color
      ctx.fillText(`${(remain / 1000).toFixed(1)}s`, bx + iconSize / 2, buffLabelY + iconSize + 2); ctx.restore()
    }
  }

  // 血条
  const charHp = isFinite(c.currentHp) ? c.currentHp : 0, charMaxHp = isFinite(c.maxHp) ? c.maxHp : 100
  const hpR = Math.max(0, charHp / charMaxHp), barW = 90, hpBarY = -214
  ctx.fillStyle = '#111111'; ctx.fillRect(-barW / 2, hpBarY, barW, 16)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(-barW / 2, hpBarY, barW, 16)
  if (hpR > 0) { ctx.fillStyle = '#ff4444'; ctx.fillRect(-barW / 2 + 2, hpBarY + 2, (barW - 4) * hpR, 12); ctx.fillStyle = 'rgba(255,100,100,0.4)'; ctx.fillRect(-barW / 2 + 2, hpBarY + 2, (barW - 4) * hpR, 4) }

  // MP蓝条
  const charMp = isFinite(c.currentMp) ? c.currentMp : (c.maxMp || 30)
  const charMaxMp = isFinite(c.maxMp) ? c.maxMp : 30
  const mpR = charMaxMp > 0 ? Math.max(0, charMp / charMaxMp) : 0
  const mpBarY = hpBarY + 20
  ctx.fillStyle = '#111111'; ctx.fillRect(-barW / 2, mpBarY, barW, 10)
  if (mpR > 0) { ctx.fillStyle = '#3498db'; ctx.fillRect(-barW / 2 + 1, mpBarY + 1, (barW - 2) * mpR, 8) }

  // 选中框
  if (battle.party.indexOf(c) === battle.selectedCharIndex) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); roundRect(ctx, -42, -240, 84, 268, 10); ctx.stroke(); ctx.setLineDash([]) }
  ctx.restore()
}

/** 渲染单个怪物精灵 */
function renderOneMonster(ctx, m, battle) {
  if (m.isDead && m.deathTimer <= 0) return
  ctx.save(); ctx.translate(m.x + (m.shakeX || 0), m.y + (m.shakeY || 0))

  if (m.isStealthed) ctx.globalAlpha = 0.25 + 0.15 * Math.sin(Date.now() / 120)
  if (m.facingRight) ctx.scale(-1, 1)
  if (m.isDead) { ctx.globalAlpha = m.deathTimer / 450; ctx.scale(1 - (1 - m.deathTimer / 450) * 0.5, 1 - (1 - m.deathTimer / 450) * 0.5) }
  if (m.hurtFlash > 0) { ctx.shadowBlur = 20; ctx.shadowColor = '#ffffff' }

  // 脚下阴影
  if (!m.isDead) { ctx.save(); ctx.beginPath(); ctx.ellipse(0, -1, 28, 9, 0, 0, Math.PI * 2); const mshGrad = ctx.createRadialGradient(0, -1, 0, 0, -1, 28); mshGrad.addColorStop(0, 'rgba(40,35,20,0.40)'); mshGrad.addColorStop(0.6, 'rgba(30,25,15,0.22)'); mshGrad.addColorStop(1, 'rgba(20,18,10,0)'); ctx.fillStyle = mshGrad; ctx.fill(); ctx.restore(); ctx.shadowBlur = 0 }

  const img = getMonsterFrameImage(m, battle)
  const MONSTER_SPRITES = require('./tower-config').MONSTER_SPRITES
  const spr = MONSTER_SPRITES[m.type] || MONSTER_SPRITES.slime
  const baseScale = spr.scale || 1, drawH = 80
  if (img) {
    const rawH = img.height, actualDrawH = Math.max(80, rawH * baseScale), drawW = img.width * (actualDrawH / rawH)
    if (spr.tint && !m.isDead) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = spr.tint; ctx.fillRect(-drawW / 2, -actualDrawH / 2, drawW, actualDrawH); ctx.globalCompositeOperation = 'destination-over' }
    ctx.drawImage(img, -drawW / 2, -actualDrawH, drawW, actualDrawH)
    if (spr.tint) ctx.globalCompositeOperation = 'source-over'
  } else {
    const bodyColor = { slime: '#7ec850', goblin: '#56a364', orc: '#8b5e3c', wolf: '#7a7a7a', undead: '#9b8fb4', demon: '#c0392b', dragon: '#e74c3c' }[m.type] || '#888'
    ctx.fillStyle = m.hurtFlash > 0 ? '#ffffff' : bodyColor; ctx.beginPath(); ctx.arc(0, -10, 36, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.name.charAt(0), 0, 2)
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-9, -6, 6, 0, Math.PI * 2); ctx.arc(9, -6, 6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-8, -6, 3, 0, Math.PI * 2); ctx.arc(10, -6, 3, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()

  // 怪物UI层
  ctx.save(); ctx.translate(m.x + (m.shakeX || 0), m.y + (m.shakeY || 0))
  const rcfg = { normal: { label: '', color: '#e6edf3' }, elite: { label: '★精英', color: '#3b82f6' }, lord: { label: '★★领主', color: '#ec4899' } }
  const hpRat = Math.max(0, m.hp / m.maxHp), barW = 100 + (m.rarity === 'lord' ? 30 : m.rarity === 'elite' ? 15 : 0), barH = 16, barY = -drawH - 14

  ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(-barW / 2, barY, barW, barH)
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.strokeRect(-barW / 2, barY, barW, barH)
  if (hpRat > 0) { ctx.fillStyle = '#ff4444'; ctx.fillRect(-barW / 2 + 2, barY + 2, (barW - 4) * hpRat, barH - 4); ctx.fillStyle = 'rgba(255,100,100,0.4)'; ctx.fillRect(-barW / 2 + 2, barY + 2, (barW - 4) * hpRat, 4) }

  if (!m.isDead) {
    let nameText = m.name
    if (rcfg[m.rarity]?.label) nameText = `${rcfg[m.rarity].label} ${nameText}`
    if (m.isStealthed) nameText = `👻 ${nameText}`
    if (m.isTransformed) nameText = `🔥 ${nameText}`
    nameText += ` Lv${m.level}`
    const fontSize = Math.max(16, Math.round(8 * battle.dpr))
    ctx.font = `bold ${fontSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const nameLabelY = barY - barH - 6
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; const textW = ctx.measureText(nameText).width + 12
    roundRect(ctx, -textW / 2, nameLabelY - fontSize / 2 - 3, textW, fontSize + 6, 4); ctx.fill()
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeText(nameText, 0, nameLabelY)
    ctx.fillStyle = rcfg[m.rarity]?.color || '#e6edf3'; ctx.fillText(nameText, 0, nameLabelY)
  }
  ctx.restore()
}

/** 渲染投射物 */
function renderOneProjectile(ctx, p, battle) {
  try {
    ctx.save()
    // 投射物轨迹
    for (let i = 0; i < (p.trail?.length || 0); i++) { const alpha = (i / p.trail.length) * 0.45, size = p.size * (i / p.trail.length) * 0.8; ctx.globalAlpha = alpha; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.trail[i].x, p.trail[i].y, Math.max(0.5, size), 0, Math.PI * 2); ctx.fill() }
    ctx.globalAlpha = 1; ctx.shadowBlur = p.isSkill ? 14 : 10; ctx.shadowColor = p.color; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
  } catch (_) {} ctx.restore()
}

// ============================================================
//  特效/粒子/浮动文字/技能菜单/虫洞/过场
// ============================================================

function renderEffects(ctx, battle) {
  const SPATIAL_TYPES = ['ice_wave_sword', 'char_hit', 'skill_effect_frames', 'skill_beam', 'cast_ring']
  const effects = battle.effects || []

  // ★ 先渲染空间型特效（在 renderAllEntities 之后但受相机影响）
  for (const e of effects) {
    if (!SPATIAL_TYPES.includes(e.type)) continue
    try {
      renderSpatialEffect(ctx, e, battle)
    } catch (_) { if (e?.type) e.life = 0 }
  }

  // 再渲染非空间型特效
  for (const e of effects) {
    if (SPATIAL_TYPES.includes(e.type)) continue
    try {
      if (e.type === 'dmg_number') {
        ctx.save(); ctx.globalAlpha = Math.min(1, e.life); ctx.fillStyle = e.color
        const baseSize = e.isText ? 16 : (18 + Math.floor(e.life * 8)), fs = baseSize * battle.dpr * (e.scale || 1)
        ctx.font = `${e.isText ? '' : 'bold '}${fs}px sans-serif`; ctx.textAlign = 'center'
        ctx.fillText(String(e.value), e.x, e.y); ctx.restore()
      }
    } catch (_) { if (e?.type) e.life = 0 }
  }
  battle.effects = (battle.effects || []).filter(e => e.life > 0)
}

/** 渲染空间型特效（精灵帧动画） */
function renderSpatialEffect(ctx, e, battle) {
  const HIT_EFFECTS = require('./tower-config').HIT_EFFECTS

  if (e.type === 'skill_effect_frames') {
    // 技能命中帧精灵动画
    if (!e.frames || !e.frames.length) return
    const imgName = e.frames[Math.min(e.frame || 0, e.frames.length - 1)]
    const img = battle.assets?.get?.(imgName)
    if (!img || img.width === 0) return
    ctx.save(); ctx.globalAlpha = Math.min(1, e.life)
    const size = e.size || 120, drawW = img.width * (size / img.height), drawH = size
    ctx.drawImage(img, e.x - drawW / 2, e.y - drawH, drawW, drawH)
    ctx.restore()
    return
  }

  if (e.type === 'char_hit') {
    // 命中帧特效
    const hitData = HIT_EFFECTS[e.hitType]
    if (!hitData || !hitData.frames || !hitData.frames.length) return
    const imgName = hitData.frames[Math.min(e.frame || 0, hitData.frames.length - 1)]
    const img = battle.assets?.get?.(imgName)
    if (!img || img.width === 0) return
    ctx.save(); ctx.globalAlpha = Math.min(1, e.life)
    const size = e.size || 80, drawW = img.width * (size / img.height), drawH = size
    ctx.drawImage(img, e.x - drawW / 2, e.y - drawH, drawW, drawH)
    ctx.restore()
    return
  }

  if (e.type === 'cast_ring') {
    // 施法光环
    ctx.save(); ctx.globalAlpha = Math.min(0.8, e.life)
    const rad = (e.radius || 60) * (1 + (1 - e.life) * 0.3)
    ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(e.x, e.y, rad, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(168,85,247,0.3)'; ctx.lineWidth = 8
    ctx.beginPath(); ctx.arc(e.x, e.y, rad * 0.7, 0, Math.PI * 2); ctx.stroke()
    ctx.restore(); return
  }

  if (e.type === 'silence_aura') {
    // 沉默光环（猫人减伤）
    ctx.save(); ctx.globalAlpha = Math.min(0.6, e.life)
    const rad = e.range || 300
    const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rad)
    grad.addColorStop(0, 'rgba(96,165,250,0.35)')
    grad.addColorStop(0.7, 'rgba(96,165,250,0.15)')
    grad.addColorStop(1, 'rgba(96,165,250,0)')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(e.x, e.y, rad, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(96,165,250,0.6)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(e.x, e.y, rad, 0, Math.PI * 2); ctx.stroke()
    ctx.restore(); return
  }

  if (e.type === 'skill_beam') {
    // 技能光束（从起点到终点画一条发光线）
    const ex = e.targetX ?? e.x, ey = e.targetY ?? e.y
    ctx.save(); ctx.globalAlpha = Math.min(1, e.life * 1.5)
    const grad = ctx.createLinearGradient(e.x, e.y, ex, ey)
    grad.addColorStop(0, e.color || '#a855f7')
    grad.addColorStop(1, 'rgba(168,85,247,0)')
    ctx.strokeStyle = grad; ctx.lineWidth = e.width || 6
    ctx.shadowBlur = 15; ctx.shadowColor = e.color || '#a855f7'
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(ex, ey); ctx.stroke()
    // 光束核心（白色细线）
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = (e.width || 6) * 0.35
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(ex, ey); ctx.stroke()
    ctx.restore(); return
  }

  if (e.type === 'ice_wave_sword') {
    // 冰剑波浪（扇形扩散效果）
    ctx.save(); ctx.globalAlpha = Math.min(0.9, e.life)
    const rad = (e.radius || 60) * (1 + (1 - e.life) * 0.5)
    const segments = 8
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2 - Math.PI / 2
      const cx2 = e.x + Math.cos(angle) * rad * 0.6
      const cy2 = e.y + Math.sin(angle) * rad * 0.6
      ctx.shadowBlur = 10; ctx.shadowColor = '#66ddff'
      ctx.fillStyle = 'rgba(102,221,255,0.7)'
      ctx.beginPath(); ctx.arc(cx2, cy2, 8 * e.life, 0, Math.PI * 2); ctx.fill()
    }
    // 主体圆环
    ctx.strokeStyle = '#66ddff'; ctx.lineWidth = 3
    ctx.shadowBlur = 12; ctx.shadowColor = '#66ddff'
    ctx.beginPath(); ctx.arc(e.x, e.y, rad, 0, Math.PI * 2); ctx.stroke()
    ctx.restore(); return
  }
}

function renderParticles(ctx, battle) {
  for (const p of (battle.particles || [])) {
    ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2); ctx.fill(); ctx.restore()
  }
}

function renderFloatingTexts(ctx, battle) {
  for (const ft of (battle.floatingTexts || [])) {
    ctx.save(); ctx.globalAlpha = Math.min(1, ft.life); ctx.fillStyle = ft.color
    ctx.font = `bold ${16 * battle.dpr}px sans-serif`; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3 * battle.dpr
    ctx.strokeText(ft.text, ft.x, ft.y); ctx.fillText(ft.text, ft.x, ft.y); ctx.restore()
  }
}

function renderSkillArcMenu(ctx, battle) {
  if (!battle.skillMenu.visible || battle.skillMenu.charIndex < 0) return
  const c = battle.party[battle.skillMenu.charIndex]; if (!c || !c.skills || c.skills.length === 0) return
  const cx = c.x, cy = c.y - 140, btnRadius = 34, arcRadius = 115, dpr = battle.dpr
  const elapsed = Date.now() - (battle.skillMenu.openTimer || 0), fadeIn = Math.min(1, elapsed / 200)
  ctx.globalAlpha = fadeIn * 0.95; ctx.fillStyle = 'rgba(13,17,23,0.35)'; ctx.beginPath(); ctx.arc(cx, cy - 10, arcRadius + 60, 0, Math.PI * 2); ctx.fill()

  for (let i = 0; i < c.skills.length; i++) {
    const sk = c.skills[i], angleOffset = ((i / (c.skills.length - 1 || 1)) - 0.5) * Math.PI * 0.85, angle = -Math.PI / 2 + angleOffset
    const bx = cx + Math.cos(angle) * arcRadius, by = cy + Math.sin(angle) * arcRadius
    const cdRem = (c.skillCDs[sk.id] || 0), onCD = cdRem > 0, canAfford = (c.currentMp || 0) >= (sk.mpCost || 0), unlocked = sk.unlockLevel ? (c.level >= (sk.unlockLevel || 1)) : true
    ctx.save(); ctx.translate(bx, by)
    if (!unlocked) { ctx.fillStyle = 'rgba(45,51,59,0.8)'; ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1.5 }
    else { const g = ctx.createRadialGradient(0, 0, 2, 0, 0, btnRadius); g.addColorStop(0, onCD ? 'rgba(80,40,130,0.7)' : 'rgba(100,50,180,0.8)'); g.addColorStop(1, onCD ? 'rgba(60,30,100,0.6)' : 'rgba(80,40,150,0.7)'); ctx.fillStyle = g; ctx.strokeStyle = onCD ? '#484f58' : '#58a6ff'; ctx.lineWidth = 2 }
    ctx.beginPath(); ctx.arc(0, 0, btnRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    if (onCD && sk.cd > 0) { ctx.fillStyle = 'rgba(0,0,0,55)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, btnRadius, -Math.PI / 2, -Math.PI / 2 + (cdRem / sk.cd) * Math.PI * 2); ctx.closePath(); ctx.fill() }
    ctx.fillStyle = !unlocked ? '#666' : (canAfford ? '#f0e6d3' : '#e74c3c')
    ctx.font = `bold ${11 * dpr}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(!unlocked ? '?' : sk.name.length > 3 ? sk.name.slice(0, 3) : sk.name, 0, 0)
    if (onCD) { ctx.fillStyle = '#fff'; ctx.font = `bold ${10 * dpr}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${Math.ceil(cdRem / 1000)}s`, 0, btnRadius + 14) }
    ctx.restore()
    if (!battle.skillMenu.buttons) battle.skillMenu.buttons = []
    battle.skillMenu.buttons[i] = { x: bx, y: by, r: btnRadius, skillIdx: i, charIndex: battle.skillMenu.charIndex }
  }

  // AI按钮
  const aiBtnY = cy + arcRadius + 45, aiBtnW = 130 * dpr, aiBtnH = 36 * dpr, aiOn = !!c.autoAttackEnabled
  battle.skillMenu.aiButton = { x: cx - aiBtnW / 2, y: aiBtnY - aiBtnH / 2, w: aiBtnW, h: aiBtnH, charIndex: battle.skillMenu.charIndex }
  ctx.save()
  ctx.fillStyle = aiOn ? (() => { const g = ctx.createLinearGradient(cx - aiBtnW / 2, aiBtnY, cx + aiBtnW / 2, aiBtnY); g.addColorStop(0, 'rgba(46,160,67,0.8)'); g.addColorStop(1, 'rgba(35,134,54,0.75)'); return g })() : 'rgba(55,62,72,0.85)'
  ctx.strokeStyle = aiOn ? '#3fb950' : '#58a6ff'; ctx.lineWidth = 1.5
  roundRect(ctx, cx - aiBtnW / 2, aiBtnY - aiBtnH / 2, aiBtnW, aiBtnH, 8); ctx.fill(); ctx.stroke()
  ctx.fillStyle = aiOn ? '#fff' : '#c9d1d9'; ctx.font = `bold ${12 * dpr}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(aiOn ? '🤖 AI战斗中(点关闭)' : '🤖 开启AI自动', cx, aiBtnY)
  ctx.restore()

  ctx.globalAlpha = fadeIn * 0.6; ctx.fillStyle = '#8b949e'; ctx.font = `${10 * dpr}px sans-serif`; ctx.textAlign = 'center'
  ctx.fillText('点击技能释放', cx, cy - arcRadius - 20); ctx.globalAlpha = 1
}

function renderWormhole(ctx, battle) {
  const w = battle.wormhole; if (!w.active) return
  ctx.save(); ctx.translate(w.x, w.y)
  const appearScale = 0.3 + w.spawnAnim * 0.7; ctx.scale(appearScale, appearScale)
  const animT = w.animTimer, pulse = 0.85 + Math.sin(w.pulseTimer * 2.5) * 0.15
  for (let ring = 3; ring >= 0; ring--) {
    const ringR = w.radius + ring * 18, rotOffset = animT * (0.8 - ring * 0.15) * (ring % 2 ? 1 : -1)
    ctx.save(); ctx.rotate(rotOffset)
    ctx.strokeStyle = `rgba(120, 60, 200, ${0.12 * pulse * (1 - ring * 0.2)})`; ctx.lineWidth = 2 + ring; ctx.setLineDash([8 + ring * 4, 6 + ring * 3])
    ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke()
    const dotCount = 6 + ring * 2
    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2 + rotOffset * 1.5; const dx = Math.cos(angle) * ringR, dy = Math.sin(angle) * ringR
      ctx.fillStyle = `rgba(160, 100, 255, ${0.5 * pulse})`; ctx.beginPath(); ctx.arc(dx, dy, 2 + ring * 0.5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }
  for (let layer = 5; layer >= 0; layer--) {
    const lr = w.radius * (0.25 + layer * 0.14), alpha = 0.9 - layer * 0.12, hue = 260 + layer * 8 + Math.sin(animT * 2 + layer) * 10
    ctx.fillStyle = `hsla(${hue}, 70%, ${10 + layer * 5}%, ${alpha})`; ctx.beginPath(); ctx.arc(0, 0, lr, 0, Math.PI * 2); ctx.fill()
  }
  ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.arc(0, 0, w.radius * 0.22, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(140, 90, 220, 0.45)'; ctx.lineWidth = 1.5
  for (let s = 0; s < 3; s++) { ctx.beginPath(); const spiralOffset = (animT * 2.5 + s * 2.1); for (let a = 0; a < Math.PI * 4; a += 0.15) { const sr = 4 + a * (w.radius * 0.13); const sx = Math.cos(a + spiralOffset) * sr, sy = Math.sin(a + spiralOffset) * sr; if (a === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy) } ctx.stroke() }
  const textFloat = Math.sin(animT * 2.5) * 6
  ctx.shadowBlur = 14; ctx.shadowColor = '#a855f7'; ctx.fillStyle = '#e0d0ff'; ctx.font = `bold ${Math.max(11, 12 * battle.dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('🌀 靠近传送', 0, -w.radius - 20 + textFloat); ctx.fillText(`第 ${Math.min(battle.waveIndex + 1, battle.totalWaves)} 波`, 0, -w.radius - 38 + textFloat); ctx.shadowBlur = 0
  const hintAlpha = 0.08 + Math.sin(w.pulseTimer * 3) * 0.05; ctx.strokeStyle = `rgba(168,85,247, ${hintAlpha})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, w.interactRadius, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

function renderTransition(ctx, battle) {
  const t = battle.transition; if (!t.active && t.alpha <= 0) return
  ctx.fillStyle = `rgba(0, 0, 0, ${t.alpha})`; ctx.fillRect(0, 0, battle.width, battle.height)
  if (t.phase === 'holding' || t.alpha > 0.7) {
    const label = t.label || '⚡ 传送中... ⚡'; ctx.fillStyle = '#a855f7'; ctx.font = `bold ${Math.max(18, 22 * battle.dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = Math.min(1, t.alpha * 1.5); ctx.fillText(label, battle.width / 2, battle.height / 2); ctx.globalAlpha = 1
  }
}

// ============================================================
//  精灵帧获取辅助
// ============================================================

function getCharFrameImage(char, battle) {
  const HERO_SPRITES = require('./tower-config').HERO_SPRITES
  const spriteKey = char.heroType || 'zhenbao'
  if (!char.animState || !HERO_SPRITES[spriteKey]) return battle.assets?.get?.(HERO_SPRITES[spriteKey]?.idle?.[0]) || null
  // ★ walk 帧可能不存在（如猫人、法师），fallback 到 idle
  const animState = (char.animState === 'walk' && !HERO_SPRITES[spriteKey]?.walk) ? 'idle' : char.animState
  const frames = HERO_SPRITES[spriteKey][animState]
  if (!frames || !frames.length) return battle.assets?.get?.(HERO_SPRITES[spriteKey]?.idle?.[0]) || null
  // 确保 _animStartTime 存在
  if (!char._animStartTime) char._animStartTime = Date.now()
  // ★ 使用配置的帧率，fallback 150ms
  const spriteCfg = HERO_SPRITES[spriteKey]
  const rate = (spriteCfg.frameRate && spriteCfg.frameRate[animState]) || spriteCfg.frameRate?.idle || 150
  const idx = Math.floor((Date.now() - char._animStartTime) / rate) % frames.length
  return battle.assets?.get?.(frames[idx]) || battle.assets?.get?.(HERO_SPRITES[spriteKey]?.idle?.[0]) || null
}

function getMonsterFrameImage(monster, battle) {
  const MONSTER_SPRITES = require('./tower-config').MONSTER_SPRITES
  const spr = MONSTER_SPRITES[monster.type] || MONSTER_SPRITES.slime
  // ★ 帧直接在 spr[state] 下（idle/attack/walk/skill），不是 spr.frames[state]
  const state = monster.isDead ? (spr.death ? 'death' : 'idle')
    : (monster.attackAnimTimer > 0 ? (spr.attack ? 'attack' : 'idle') : 'idle')
  // 根据怪物当前动画状态选择帧数组，fallback 链：当前状态 → idle → walk → 第一个可用数组
  const frames = spr[state] || spr.idle || spr.walk || Object.values(spr).find(v => Array.isArray(v)) || []
  if (!frames || frames.length === 0) return null
  const rate = spr.frameRate ? (spr.frameRate[state] || spr.frameRate.idle || 200) : 200
  // 确保 _animStartTime 存在
  if (!monster._animStartTime) monster._animStartTime = Date.now()
  const idx = Math.floor((Date.now() - monster._animStartTime) / rate) % frames.length
  return battle.assets?.get?.(frames[idx]) || null
}

function getBattleArea(battle) {
  const W = battle.width, H = battle.height
  const topBarH = Math.max(H * 0.095, 56), bottomMargin = Math.max(8, 12 * battle.dpr)
  const groundY = H - Math.max(H * 0.155, 120) - bottomMargin - 10
  return { left: 4, right: W - 4, top: topBarH + 25, bottom: groundY }
}

// ============================================================
//  交互处理
// ============================================================

/**
 * 处理主画布点击事件
 */
function onTap(battle, x, y) {
  try {
    if (battle.phase === 'card_select') { handleCardTap(battle, x, y); return }
    if (battle.phase === 'victory' || battle.phase === 'defeat') {
      if (battle._backBtnBounds && x >= battle._backBtnBounds.x && x <= battle._backBtnBounds.x + battle._backBtnBounds.w && y >= battle._backBtnBounds.y && y <= battle._backBtnBounds.y + battle._backBtnBounds.h) { battle._backToResult = true }
      return
    }
    if (battle.phase !== 'battle') return
    battle.tapPos = { x, y }; battle.lastTapTime = Date.now()
    handleUITap(battle, x, y)
  } catch (e) {
    console.error(`[Tower] 💥 onTap 崩溃! phase=${battle.phase}, error=`, e)
  }
}

function handleCardTap(battle, x, y) {
  const cp = battle.cardPhase; if (cp.confirmed) return
  const W = battle.width, H = battle.height, dpr = battle.dpr
  const cardW = Math.min(100 * dpr, W * 0.28), cardH = Math.min(130 * dpr, H * 0.32), gap = 12 * dpr
  const totalW = cp.cards.length * cardW + (cp.cards.length - 1) * gap, startX = (W - totalW) / 2, startY = (H - cardH) / 2 - 10 * dpr
  for (let i = 0; i < cp.cards.length; i++) {
    const cx = startX + i * (cardW + gap), cy = startY
    if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
      console.log(`[Tower] 🔍 卡牌点击命中: index=${i}, card=${cp.cards[i]?.name}`)
      cp.selectedIndex = i; cp.confirmed = true; cp._confirmTime = Date.now()
      applyCardEffect(battle, cp.cards[i])
      console.log(`[Tower] 🔍 applyCardEffect 返回后，设置 setTimeout`)
      setTimeout(() => {
        try {
          console.log(`[Timer] ⏰ setTimeout 触发! 切换到 battle 阶段`)
          battle.phase = 'battle'
          console.log(`[Timer] 🔍 调用 _initPositions, party=${Array.isArray(battle.party)?'array('+battle.party.length+')':typeof battle.party}`)
          battle._initPositions()
          console.log(`[Timer] ✅ _initPositions 完成`)
          battle.waveCooldownTimer = 1000
        } catch(e) {
          console.error(`[Timer] 💥 setTimeout 回调崩溃!`, e)
        }
      }, 350)
      return
    }
  }
}

function handleUITap(battle, x, y) {
  const bp = battle._bottomPanelBounds; if (!bp) return

  // 技能弧形菜单按钮（优先级最高，显示在最上层）
  if (battle.skillMenu.visible) {
    // 检查AI按钮
    const aiBtn = battle.skillMenu.aiButton
    if (aiBtn && x >= aiBtn.x && x <= aiBtn.x + aiBtn.w && y >= aiBtn.y && y <= aiBtn.y + aiBtn.h) {
      const c = battle.party[aiBtn.charIndex]
      if (c) {
        c.autoAttackEnabled = !c.autoAttackEnabled
        console.log(`[Tower] 🎮 技能菜单AI按钮: ${c.name} AI=${c.autoAttackEnabled ? '开启' : '关闭'}`)
      }
      return
    }
    // 检查技能弧形按钮
    if (battle.skillMenu.buttons) for (const btn of battle.skillMenu.buttons) {
      const dx = x - btn.x, dy = y - btn.y
      if (dx*dx + dy*dy <= btn.r*btn.r) {
        onSkillBarTap(battle, { charIndex: btn.charIndex, skillIdx: btn.skillIdx, x: btn.x, y: btn.y, w: btn.r*2, h: btn.r*2 })
        return
      }
    }
    // 点击其他区域关闭菜单
    battle.skillMenu.visible = false
    return
  }

  // 技能按钮
  if (battle._skillBarButtons) for (const btn of battle._skillBarButtons) { if (!btn.disabled && x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) { onSkillBarTap(battle, btn); return } }
  // 策略按钮
  if (battle._tacticButtons) for (const btn of battle._tacticButtons) { if (!btn.disabled && x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) { onTacticButtonTap(battle, btn.id); return } }
  // 背包槽位
  if (battle._inventorySlots) for (const slot of battle._inventorySlots) { if (x >= slot.x && x <= slot.x + slot.size && y >= slot.y && y <= slot.y + slot.size) { onInventorySlotTap(battle, slot); return } }
  // 合成按钮
  if (battle._synthButton) { const sb = battle._synthButton; if (x >= sb.x && x <= sb.x + sb.w && y >= sb.y && y <= sb.y + sb.h) { synthesizeEquipment(battle); return } }
  // 出售按钮
  if (battle._sellButton) { const slb = battle._sellButton; if (x >= slb.x && x <= slb.x + slb.w && y >= slb.y && y <= slb.y + slb.h) { sellSelectedInventoryItem(battle); return } }
  // 角色装备槽位
  if (battle._charEquipSlots) for (const slot of battle._charEquipSlots) { if (x >= slot.x && x <= slot.x + slot.w && y >= slot.y && y <= slot.y + slot.h) { onCharEquipSlotTap(battle, slot); return } }
  // 角色切换
  if (battle._charSwitchBtns) for (const btn of battle._charSwitchBtns) { if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) { const next = battle.selectedCharIndex + btn.dir; if (next >= 0 && next < battle.party.length) battle.selectedCharIndex = next; return } }
  
  // 点击角色切换选中
  for (let i = 0; i < (battle.party || []).length; i++) {
    const c = battle.party[i]
    if (c && !c.isDead && c.respawnTimer <= 0) {
      const dx = x - c.x, dy = y - c.y
      if (dx*dx + dy*dy <= 2500) {  // 50px半径
        battle.selectedCharIndex = i
        battle.skillMenu.visible = true
        battle.skillMenu.charIndex = i
        battle.skillMenu.openTimer = Date.now()
        console.log(`[Tower] 🎮 选中角色: ${c.name} (${i})`)
        return
      }
    }
  }

  // ★ 点击战斗区域空地 → 移动选中角色到目标位置
  if (battle.selectedCharIndex >= 0 && battle.selectedCharIndex < (battle.party || []).length) {
    const area = getBattleArea(battle)
    // 确保点击位置在战斗区域内（不在底部面板上）
    if (y >= area.top && y <= area.bottom && x >= area.left && x <= area.right) {
      const c = battle.party[battle.selectedCharIndex]
      if (c && !c.isDead && !c.isCasting) {
        // 钳制目标位置到战斗区域
        const [clampedX, clampedY] = battle._clampTargetToArea(x, y)
        c.targetX = clampedX
        c.targetY = clampedY
        c._manualMoveTime = Date.now()  // ★ 标记手动移动，保护1.5秒不被AI覆盖
        // 关闭坚守位置模式
        if (battle.battleTactics.holdPosition) {
          battle.battleTactics.holdPosition = false
        }
        // 视觉反馈：移动指示器
        battle._moveIndicator = { x: clampedX, y: clampedY, timer: 500 }
        console.log(`[Tower] 🎮 移动角色: ${c.name} → (${Math.round(clampedX)}, ${Math.round(clampedY)})`)
        return
      }
    }
  }
}

function onSkillBarTap(battle, btn) {
  const char = battle.party[btn.charIndex]; if (!char || char.isDead) return
  const sk = char.skills[btn.skillIdx]; if (!sk) return
  const mpCost = sk.mpCost || 0; if ((char.currentMp || 0) < mpCost) return
  char.currentMp -= mpCost
  console.log(`[Tower] 🎮 手动释放技能: ${char.name} -> ${sk.name}`)
  castSkill(battle, char, btn.skillIdx)
}

function onTacticButtonTap(battle, btnId) {
  const t = battle.battleTactics
  switch (btnId) {
    case 'auto_attack': { const newState = !battle.party.some(c => !c.isDead && c.autoAttackEnabled); for (const c of (battle.party || [])) { if (!c.isDead) c.autoAttackEnabled = newState }; console.log(`[Tower] AI自动攻击 ${newState ? '已开启' : '已关闭'}`); break }
    case 'target_nearest': t.targetPriority = 'nearest'; break
    case 'target_lowestHp': t.targetPriority = t.targetPriority === 'lowestHp' ? 'nearest' : 'lowestHp'; break
    case 'target_ranged': t.targetPriority = t.targetPriority === 'ranged' ? 'nearest' : 'ranged'; break
    case 'hold_position': t.holdPosition = !t.holdPosition; if (t.holdPosition) { for (const c of (battle.party || [])) { c.targetX = c.x; c.targetY = c.y } } break
  }
}

function onInventorySlotTap(battle, slot) {
  const item = slot.item; if (!item) return
  const now = Date.now(), last = battle._lastTapSlot
  if (last && last.idx === slot.idx && (now - last.time) < 350) {
    battle._lastTapSlot = null; equipToSelectedChar(battle, item, slot.idx); return
  }
  battle._lastTapSlot = { idx: slot.idx, time: now }
  battle._sellTargetIndex = slot.idx
  battle._hoveredItem = { item, x: slot.x + slot.size / 2, y: slot.y - 8, source: 'inventory' }
  battle._tooltipTimer = setTimeout(() => { if (battle._hoveredItem?.item === item) battle._hoveredItem = null }, 2000)
}

/** 施放技能（完整版 - 含魔法攻击/投射物/特效） */
function castSkill(battle, char, skillIdx) {
  const sk = char.skills[skillIdx]; if (!sk) return
  console.log(`[Tower] 施放技能: ${sk.name} (id=${sk.id}, type=${sk.type})`)

  // ★ 技能动画状态映射
  const SKILL_ANIM_MAP = {
    shield_bash: 'shield',
    war_cry: 'buff',
    berserk: 'buff',
  }
  const skillAnim = SKILL_ANIM_MAP[sk.id]
  if (skillAnim) {
    char.animState = skillAnim
    char._animStartTime = Date.now()
    setTimeout(() => {
      if (char && char.animState === skillAnim) {
        char.animState = 'idle'
        char._animStartTime = Date.now()
      }
    }, 800)
  }

  // Buff 类技能：委托给 combat 模块
  if (sk.type === 'buff') {
    const Combat = require('./tower-combat.js')
    Combat.applyBuffSkill(battle, char, sk)
  }

  // ★ 魔法攻击类技能：发射投射物 + 伤害 + 特效
  if (sk.type === 'magic' || sk.type === 'attack') {
    const Combat = require('./tower-combat.js')
    const Effects = require('./tower-effects.js')
    const HIT_EFFECTS = require('./tower-config').HIT_EFFECTS
    const SKILL_VISUAL = require('./tower-config').SKILL_VISUAL

    // 找最近的敌人作为目标
    const Characters = require('./tower-characters.js')
    // 直接查找最近怪物
    let bestTarget = null, bestDist = Infinity
    for (const m of (battle.monsters || [])) {
      if (m.isDead) continue
      const d = (m.x - char.x) ** 2 + (m.y - char.y) ** 2
      if (d < bestDist) { bestDist = d; bestTarget = m }
    }

    if (bestTarget) {
      const effectiveMatk = Combat.getEffectiveMatk(char)
      const baseDmg = Combat.calcDamage(effectiveMatk * (sk.power || 1.3), bestTarget.def || 0, true)
      let finalDmg = Math.floor(baseDmg * (0.85 + Math.random() * 0.3))

      // 暴击
      const critChance = char.critChance || 0
      let isCrit = false
      if (critChance > 0 && Math.random() < critChance) {
        finalDmg = Math.floor(finalDmg * 1.5); isCrit = true
      }

      // 根据技能子类型决定视觉效果
      const hitType = sk.effect || sk.id || 'ice'  // fireball/ice/lightning
      const vis = SKILL_VISUAL.get(hitType)

      // ★ 发射投射物
      battle.projectiles.push({
        x: char.x + (char.facingRight ? 30 : -30), y: char.y - 40,
        targetX: bestTarget.x, targetY: bestTarget.y,
        target: bestTarget, dmg: finalDmg,
        speed: 300 + Math.random() * 80,
        color: hitType === 'fireball' ? '#ff6622' : hitType === 'lightning' ? '#ffee44' : '#66ddff',
        size: vis ? vis.beamBaseSize / 20 : 10,
        isSkill: true, trail: [],
        skillName: sk.name,
        onHit: (proj) => {
          Combat.applyDamage(battle, proj.target, 'char', proj.dmg)
          if (char.lifesteal && char.lifesteal > 0) Combat.applyLifesteal(battle, char, proj.dmg)
          // 命中特效
          const hitFrames = HIT_EFFECTS[hitType]
          if (hitFrames && hitFrames.frames) {
            const effectSize = vis ? vis.hitFrameSize : 120
            battle.effects.push({
              type: 'skill_effect_frames',
              x: proj.target.x, y: proj.target.y - 20,
              frames: hitFrames.frames, frameRate: hitFrames.frameRate || 60,
              size: effectSize, animFrame: 0, animTimer: 0,
              life: hitFrames.frames.length * (hitFrames.frameRate || 60) / 1000,
            })
          }
          // 命中粒子
          Effects.spawnParticles(battle, proj.target.x, proj.target.y, {
            count: 8, color: proj.color, speed: 120, size: 4, decay: 3
          })
          // 伤害飘字
          Effects.addFloatingText(battle, proj.target.x, proj.target.y - 30,
            isCrit ? `-${finalDmg}💥` : `-${finalDmg}`, isCrit ? '#ffff00' : '#ff6b6b', 1.5)
          // 屏幕微震
          Effects.applyScreenShake(battle, 2, 2)
        }
      })

      // 施法闪光
      Effects.spawnParticles(battle, char.x, char.y - 50, {
        count: 6, color: '#ffffff', speed: 80, size: 3, decay: 4
      })
    }
  }

  // 通用施法状态（视觉反馈 + CD）
  char.isCasting = true
  char.castSkillId = sk.id
  char.attackAnimTimer = 500
  if (!char.skillCDs) char.skillCDs = {}
  char.skillCDs[sk.id] = sk.cd || 5000
}

/** 应用祝福卡效果（调用 battle 实例的 _applyCardEffect 真正生效） */
function applyCardEffect(battle, card) {
  console.log(`[Tower] 应用卡牌效果: ${card.name} - ${card.desc}`)
  // 调用 battle 实例方法真正应用卡牌效果
  if (battle._applyCardEffect && card) {
    console.log(`[Tower] 🔍 调用 _applyCardEffect 前, party=${Array.isArray(battle.party)?'array('+battle.party.length+')':typeof battle.party}`)
    battle._applyCardEffect(card)
    console.log(`[Tower] ✅ _applyCardEffect 成功返回`)
  }
}

// ============================================================
//  导出模块接口
// ============================================================
module.exports = {
  // 主渲染
  render,
  renderCardSelect,
  renderResultScreen,
  renderUI,
  renderBottomPanel,
  renderSkillBar,
  renderTacticsBar,
  renderEquipInventory,

  // 实体渲染
  renderAllEntities,
  renderOneCharacter,
  renderOneMonster,
  renderOneProjectile,
  renderEffects,
  renderParticles,
  renderFloatingTexts,
  renderSkillArcMenu,
  renderWormhole,
  renderTransition,

  // 交互
  onTap,
  handleUITap,
  handleCardTap,
  onSkillBarTap,
  onTacticButtonTap,
  onInventorySlotTap,
  onCharEquipSlotTap,

  // 内部使用（供 tower-battle 调度器调用）
  castSkill,
  applyCardEffect,
}
