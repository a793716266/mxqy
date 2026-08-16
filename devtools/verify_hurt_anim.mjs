import { CharacterSprite } from '../scripts/core/character-sprite.js'

const game = {
  dpr: 1,
  assets: { get: (k) => (k ? { width: 206, height: 337 } : null) },
}

const sprite = new CharacterSprite(game, { id: 'zhenbao' })

// 普通受击 → hurt_01
sprite.state = 'hurt'
sprite._hurtVariant = 1
const k1 = sprite.getCurrentFrameKey()
console.log('[普通受击] key =', k1, k1 === 'HERO_ZHENBAO_HURT_01' ? 'OK' : 'FAIL')

// 被击飞 → hurt_02
sprite._hurtVariant = 2
const k2 = sprite.getCurrentFrameKey()
console.log('[被击飞]  key =', k2, k2 === 'HERO_ZHENBAO_HURT_02' ? 'OK' : 'FAIL')

// 图片可解析
const img = sprite.getCurrentFrameImage()
console.log('[资源解析]', img ? 'OK' : 'FAIL')

// 计时：0.28s 后切回 idle
sprite._hurtVariant = 1
sprite._hurtTimer = 0.28
sprite.update(0.1, false, false)
console.log('[计时0.1] timer=', sprite._hurtTimer.toFixed(2), 'state=', sprite.state, sprite.state === 'hurt' ? 'OK(仍受击)' : 'FAIL')
sprite.update(0.2, false, false)
console.log('[计时0.3] timer=', sprite._hurtTimer.toFixed(2), 'state=', sprite.state, sprite.state === 'idle' ? 'OK(已恢复)' : 'FAIL')

// 非受击时不影响 idle/walk
sprite.state = 'idle'
sprite.animFrame = 3
console.log('[idle] key =', sprite.getCurrentFrameKey())
