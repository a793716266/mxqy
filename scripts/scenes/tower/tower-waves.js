/**
 * tower-waves.js - 波次/虫洞/掉落物/过场动画
 *
 * 从 tower-battle.js 提取的场景流程控制：
 * - 波次刷怪系统（_updateSpawner / _checkWaveSpawn）
 * - 虫洞传送系统（初始化/更新/渲染/交互检测）
 * - 过场黑屏过渡动画
 * - 掉落物品更新与渲染
 * - 掉落品质随机
 * - 胜牌选择阶段初始化/更新/渲染
 *
 * 设计模式：所有函数接收 battle 上下文。
 */

const { QUALITY_COLORS, DROP_LIFETIME, CARD_POOL, EXP_TABLE, PKG } = require('./tower-config.js')
const { pushEffectSafe, addFloatingText, spawnParticles } = require('./tower-effects.js')

// ========== 虫洞系统 ==========

function initWormhole(battle) {
  battle.wormhole = {
    active: false,
    x: battle.width * 0.52,
    y: battle.height * 0.48,
    radius: 36,
    interactRadius: 70,
    pulseTimer: 0,
    rotationAngle: 0,
  }
}

function updateWormhole(battle, dt) {
  const w = battle.wormhole
  if (!w || !w.active) return

  w.pulseTimer += dt / 1000
  w.rotationAngle += dt / 1000 * 0.5
}

function checkWormholeInteraction(battle) {
  const w = battle.wormhole
  if (!w || !w.active || battle.transition.active || battle.allWavesDone) return

  const party = battle.party || []
  for (const c of party) {
    if (c.isDead) continue
    const dx = c.x - w.x, dy = c.y - w.y
    const dist = Math.sqrt(dx*dx + dy*dy)
    if (dist < w.interactRadius) {
      startTransition(battle, `⚡ 第 ${Math.min(battle.waveIndex+1, battle.totalWaves)} 波`)
      return
    }
  }
}

function renderWormhole(battle, ctx) {
  const w = battle.wormhole
  if (!w) return

  const isActive = w.active
  const animT = (w.pulseTimer || 0) / 1000
  const baseR = w.radius, pulseR = baseR + Math.sin(animT * 3) * 8
  const interactAlpha = 0.08 + Math.sin(w.pulseTimer * 3) * 0.05

  ctx.save()
  ctx.translate(w.x, w.y)

  // 外圈旋转环
  ctx.rotate(w.rotationAngle || 0)
  ctx.strokeStyle = isActive ? '#a855f7' : '#6644cc'
  ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.arc(0, 0, pulseR + (isActive ? 6 : 0), 0, Math.PI * 2)
  ctx.stroke()

  // 内填充（虫洞效果）
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, isActive ? pulseR + 15 : pulseR)
  grad.addColorStop(0, isActive ? 'rgba(168,85,247,0.9)' : 'rgba(100,80,200,0.35)')
  grad.addColorStop(0.3, isActive ? 'rgba(168,85,247,0.5)' : 'rgba(100,80,200,0.2)')
  grad.addColorStop(0.7, isActive ? 'rgba(168,85,247,0.25)' : 'rgba(100,80,200,0.08)')
  grad.addColorStop(1, 'rgba(50,30,120,0)')
  ctx.fillStyle = grad
  ctx.beginPath(); ctx.arc(0, 0, isActive ? pulseR + 20 : pulseR, 0, Math.PI * 2)
  ctx.fill()

  // 星芒粒子
  if (isActive) {
    ctx.fillStyle = '#e0d0ff'
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + animT * 4
      const sr = 4 + Math.sin(angle * 3 + animT * 2) * 2
      const sx = Math.cos(angle) * (pulseR * 0.45), sy = Math.sin(angle) * (pulseR * 0.45)
      ctx.globalAlpha = 0.6 + 0.3 * Math.sin(animT * 2 + i * 1.33)
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.5, sr), 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // "靠近传送"提示文字浮动
  const textFloat = Math.sin(animT * 2.5) * 6
  ctx.shadowBlur = 14; ctx.shadowColor = '#a855f7'
  ctx.fillStyle = '#e0d0ff'
  ctx.font = `bold ${Math.max(11, 12 * battle.dpr)}px sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('🌀 靠近传送', 0, -w.radius - 20 + textFloat)
  ctx.fillText(`第 ${Math.min(battle.waveIndex + 1, battle.totalWaves)} 波`, 0, -w.radius - 38 + textFloat)
  ctx.shadowBlur = 0

  // 交互范围提示环
  ctx.strokeStyle = `rgba(168,85,247,${interactAlpha})`
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(0, 0, w.interactRadius, 0, Math.PI * 2); ctx.stroke()

  ctx.restore()
}

// ========== 过场动画 ==========

function initTransition(battle) {
  battle.transition = {
    active: false, alpha: 0, phase: 'none', timer: 0,
    holdDuration: 1200, callback: null,
  }
}

function updateTransition(battle, dtMs) {
  const t = battle.transition
  if (!t.active) return

  switch (t.phase) {
    case 'fading_out': t.alpha = Math.min(1, t.alpha + dtMs / 350); break
    case 'holding': t.timer += dtMs; break
    case 'fading_in': t.alpha = Math.max(0, t.alpha - dtMs / 400); break
  }

  if (t.phase === 'fading_out' && t.alpha >= 1) {
    t.phase = 'holding'; t.timer = 0; t.alpha = 1
  } else if (t.phase === 'holding' && t.timer >= t.holdDuration) {
    t.phase = 'fading_in'; t.alpha = 1
  } else if (t.phase === 'fading_in' && t.alpha <= 0) {
    t.active = false; t.phase = 'none'; t.alpha = 0; t.timer = 0
    if (t.callback) { t.callback(); t.callback = null }
  }
}

function startTransition(battle, label, callback) {
  const t = battle.transition
  t.active = true; t.alpha = 0; t.phase = 'fading_out'; t.timer = 0
  t.label = label || '\u26A1 传送中... \u26A1'
  t.callback = callback || (() => { battle.phase = 'battle' })
}

function renderTransition(battle, ctx) {
  const t = battle.transition
  if (!t.active && t.alpha <= 0) return
  ctx.fillStyle = `rgba(0, 0, 0, ${t.alpha})`
  ctx.fillRect(0, 0, battle.width, battle.height)
  if (t.phase === 'holding' || t.alpha > 0.7) {
    const label = t.label || '⚡ 传送中...'
    ctx.fillStyle = '#a855f7'
    ctx.font = `bold ${Math.max(18, 22 * battle.dpr)}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.globalAlpha = Math.min(1, t.alpha * 1.5)
    ctx.fillText(label, battle.width / 2, battle.height / 2)
    ctx.globalAlpha = 1
  }
}

// ========== 刷怪系统 ==========

function updateSpawner(battle, dt) {
  if (battle.transition.active) return
  checkWaveSpawn(battle, dt)
}

function checkWaveSpawn(battle, dt) {
  if (battle.allWavesDone || battle.transition.active) return
  if (battle.waveIndex >= battle.totalWaves) { battle.allWavesDone = true; return }

  // 第一波特殊：直接从中心传送出现
  if (!battle._firstWaveSpawned) {
    battle._firstWaveSpawned = true
    const waveDef = battle.waveDefs[battle.waveIndex]
    if (waveDef) {
      spawnFullWave(battle, waveDef)
    }
    return
  }

  // 冷却期检查
  if (battle._waveClearCooldownActive) {
    battle.waveCooldownTimer -= dt
    if (battle.waveCooldownTimer <= 0) {
      battle._waveClearCooldownActive = false
      // ★ 当前波次完全清除，递增波次索引
      battle.waveIndex++
      // 激活虫洞
      battle.wormhole.active = true
    }
    return
  }

  // 当前波怪物全部死亡 → 进入冷却
  const aliveCount = (battle.monsters || []).filter(m => !m.isDead).length
  if (battle.waveActive && aliveCount <= 0 && battle.waveSpawnedCount >= battle.waveTotalCount) {
    battle.waveActive = false
    battle._waveClearCooldownActive = true
    battle.waveCooldownTimer = battle.waveCooldown || 3000
    return
  }

  // 定时生成下一波
  if (!battle.waveActive && !battle._waveClearCooldownActive) {
    battle.spawnTimer += dt
    if (battle.spawnTimer >= (battle.spawnInterval || 2500)) {
      battle.spawnTimer = 0
      if (battle.waveIndex < battle.totalWaves) {
        const waveDef = battle.waveDefs[battle.waveIndex]
        if (waveDef) {
          spawnFullWave(battle, waveDef)
        }
      }
    }
  }
}

function spawnFullWave(battle, waveDef) {
  battle.waveActive = true
  battle.waveSpawnedCount = 0
  battle.waveTotalCount = 0
  const monsters = waveDef && Array.isArray(waveDef.monsters) ? waveDef.monsters : []
  for (const m of monsters) {
    battle.waveTotalCount += m.count
  }
  for (const m of monsters) {
    for (let i = 0; i < m.count; i++) {
      const Monsters = require('./tower-monsters.js')
      Monsters.createMonster(battle, m.type, { rarity: m.rarity || 'normal' })
      battle.waveSpawnedCount++
    }
  }
  // ★ 不在这里++waveIndex，等波次清除完成后在 checkWaveSpawn 中递增
}

// ========== 掉落物系统 ==========

function updateDroppedItems(battle, dt) {
  const now = Date.now()
  const DROP_LIFETIME = 8000
  
  for (const item of (battle.droppedItems || [])) {
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
}

function renderDroppedItems(battle, ctx) {
  for (const item of battle.droppedItems) {
    if (item.collected && item.collectAnim >= 1) continue

    ctx.save(); ctx.translate(item.x, item.y)

    if (item.collected) { ctx.globalAlpha=1-item.collectAnim; ctx.scale(1-item.collectAnim*0.5,1-item.collectAnim*0.5) }
    if (item.blink && !item.collected) { ctx.globalAlpha=0.25+Math.sin(Date.now()/50)*0.5 }

    const color=QUALITY_COLORS[item.quality]
    const pulse=Math.sin(Date.now/(item.pulseSpeed*100))*0.3+1
    const glowR=(26+item.glowIntensity*pulse*1.3)

    if(item.quality!=='common'){
      const glowGrad=ctx.createRadialGradient(0,0,8,0,0,Math.max(1,glowR))
      glowGrad.addColorStop(0,color+'40'); glowGrad.addColorStop(1,color+'00')
      ctx.fillStyle=glowGrad; ctx.beginPath(); ctx.arc(0,0,glowR,0,Math.PI*2); ctx.fill()
    }

    ctx.shadowBlur=item.glowIntensity*(item.quality==='legendary'?1.8:1.2)
    ctx.shadowColor=color
    const baseR=48; ctx.fillStyle='#1c2128'
    ctx.beginPath(); ctx.arc(0,0,baseR,0,Math.PI*2); ctx.fill()
    ctx.strokeStyle=color; ctx.lineWidth=3.5; ctx.stroke()

    const slotIcon={weapon:'\u2694',armor:'\u{1F6E1}',accessory:'\u{1F48E}'}
    ctx.fillStyle=color; ctx.font='bold 48px sans-serif'
    ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText(slotIcon[item.slot]||'?',0,2)

    if(!item.collected){
      ctx.font='bold 16px sans-serif'; ctx.fillStyle='#e6edf3'
      ctx.fillText(item.name,0,baseR+20)
      if(!item.collected){
        const ratio=item.remaining/DROP_LIFETIME
        const barColor=ratio>0.5?color:ratio>0.25?'#ff8c00':'#ff4444'
        ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(-24,28,48,5)
        ctx.fillStyle=barColor; ctx.fillRect(-24,28,48*ratio,5)
      }
    }

    // 传说星光
    if(item.quality==='legendary'&&!item.collected){
      for(let s=0;s<3;s++){
        const starAngle=Date.now()/800+s*(Math.PI*2/3)
        const starR=36+Math.sin(Date.now()/400+s*6)*6
        const sx=Math.cos(starAngle)*starR, sy=Math.sin(starAngle)*starR
        ctx.fillStyle='#ffd700'; ctx.globalAlpha=0.6+0.4*Math.sin(Date.now()/200+s)
        ctx.beginPath(); ctx.arc(sx,sy,3.5,0,Math.PI*2); ctx.fill()
      }
      ctx.globalAlpha=item.collected?(1-item.collectAnim):1
    }

    ctx.shadowBlur=0; ctx.restore()
  }
}

// ========== 卡牌选择阶段 ==========

function initCardPhase(battle) {
  const cards = shuffleAndPick(CARD_POOL, 3).map(card => ({ ...card }))
  battle.cardPhase = {
    cards,
    selectedIndex: -1,
    confirmed: false,
    animTimer: 0,
  }
  battle.phase = 'card_select'
}

function shuffleAndPick(arr, count) {
  const a=[...arr]
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];
  }
  return a.slice(0,count)
}

function updateCardSelect(battle, dtMs) {
  battle.cardPhase.animTimer += dtMs
}

function renderCardSelect(battle, ctx) {
  const W=battle.width,H=battle.height,dpr=battle.dpr,cp=battle.cardPhase
  ctx.fillStyle='rgba(13,17,23,0.95)'; ctx.fillRect(0,0,W,H)

  ctx.fillStyle='#ffd700'; ctx.font=`bold ${22*dpr}px sans-serif`
  ctx.textAlign='center'; ctx.textBaseline='top'
  ctx.fillText('\u2726 选择一张祝福卡牌 \u2726',W/2,H*0.12)
  ctx.fillStyle='#8b949e'; ctx.font=`${13*dpr}px sans-serif`
  ctx.fillText('点击即可选择，效果持续整场战斗',W/2,H*0.12+30*dpr)

  const cardW=Math.min(100*dpr,W*0.28),cardH=Math.min(130*dpr,H*0.32)
  const gap=12*dpr,totalW=cp.cards.length*cardW+(cp.cards.length-1)*gap
  const startX=(W-totalW)/2,startY=(H-cardH)/2-10*dpr,time=(cp.animTimer||0)/1000

  cp.cards.forEach((card,i)=>{
    const cx=startX+i*(cardW+gap),cy=startY
    const isSelected=cp.selectedIndex===i,isConfirmed=cp.confirmed&&isSelected
    const floatOffset=isSelected?Math.sin(time*3)*4:0
    const selScale=isSelected?1.05:1

    ctx.save(); ctx.translate(cx+cardW/2,cy+cardH/2+floatOffset); ctx.scale(selScale,selScale)
    if(isConfirmed){
      const confirmT=Math.min(1,((Date.now()-cp._confirmTime)||0)/350)
      if(confirmT>0.5){ctx.globalAlpha=1-confirmT;const s=1+confirmT*0.15;ctx.scale(s,s)}
    }

    const cardGrad=ctx.createLinearGradient(0,0,0,cardH)
    cardGrad.addColorStop(0,'#1c2128'); cardGrad.addColorStop(1,'#21262d')
    ctx.fillStyle=cardGrad
    if(isSelected){ctx.shadowBlur=16+Math.sin(time*4)*6;ctx.shadowColor=card.color||'#ffd700'}
    roundRect(ctx,0,0,cardW,cardH,10); ctx.fill(); ctx.shadowBlur=0

    ctx.strokeStyle=isSelected?(card.color||'#ffd700'):'#30363d'
    ctx.lineWidth=isSelected?2.5:1.5; roundRect(ctx,0,0,cardW,cardH,10); ctx.stroke()

    ctx.font=`${28*dpr}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText(card.icon,cardW/2,cardH*0.22)
    ctx.fillStyle=card.color||'#f0e6d3'; ctx.font=`bold ${12*dpr}px sans-serif`
    ctx.fillText(card.name,cardW/2,cardH*0.40)
    ctx.fillStyle='#8b949e'; ctx.font=`${10*dpr}px sans-serif`
    const maxDescW=cardW-16,line='',lineY=cardH*0.54,lineCount=0
    const _descText=card.desc||''
    for(const ch of _descText){
      const testLine=line+ch;if(ctx.measureText(testLine).width>maxDescW&&line.length>0){
        ctx.fillText(line,cx/2,lineY); line=ch;lineY+=15*dpr;lineCount++
        if(lineCount>=2)break
      }else{line+=ch}
    }
    if(lineCount<2&&line)ctx.fillText(line,cx/2,lineY)

    if(card.rare){ctx.fillStyle='#f39c12';ctx.font=`bold ${10*dpr}px sans-serif`;ctx.fillText('\u2605\u7A00 \u7A00',cardW/2,cardH*0.88)}
    else if(!isConfirmed&&!cp.confirmed){ctx.fillStyle='#484f58';ctx.font=`${10*dpr}px sans-serif`;ctx.fillText('点击选择',cardW/2,cardH*0.88)}

    if(isConfirmed){ctx.fillStyle='rgba(13,17,23,0.7)';roundRect(ctx,0,0,cardW,cardH,10);ctx.fill()
      ctx.fillStyle='#3fb950';ctx.font=`bold ${14*dpr}px sans-serif`;ctx.fillText('\u2713 已选',cardW/2,cardH/2)}

    ctx.restore()
  })

  if(!cp.confirmed){
    ctx.fillStyle='#484f58';ctx.font=`${12*dpr}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='bottom'
    ctx.fillText('点击任意一张卡牌开始战斗',W/2,H-24*dpr)
  }
}

/** 圆角矩形 */
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y)
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r)
  ctx.quadraticCurveTo(x+w,y+h,x,y+h-r);ctx.lineTo(x+r,y+h)
  ctx.quadraticCurveTo(x,y,y+h,x,y+r);ctx.quadraticCurveTo(x,y,x+r,y)
  ctx.closePath()
}

module.exports = {
  initWormhole,
  updateWormhole,
  checkWormholeInteraction,
  renderWormhole,
  initTransition,
  updateTransition,
  startTransition,
  renderTransition,
  updateSpawner,
  checkWaveSpawn,
  updateDroppedItems,
  renderDroppedItems,
  initCardPhase,
  updateCardSelect,
  renderCardSelect,
}
