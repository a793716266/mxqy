/**
 * encode_mp3.js —— 音频编码档位的唯一事实源（从 WAV 母版重编码为投产 MP3）
 *
 * ★ 为什么存在这个脚本（2026-09-01）：
 *   首版投产用了 BGM 320kbps / SFX 192kbps 立体声，sound 分包 9.49MB，
 *   直接把整包顶到 30.93MB，爆掉微信 20MB 硬上限。
 *   微信小游戏 BGM 在手机小喇叭/耳机上，VBR ~115kbps 联合立体声与 320kbps
 *   在听感上无可辨差异；SFX 是短瞬态且引擎不做声道声像，单声道即可，体积直接砍半。
 *
 * ★ 关键原则：**永远从 out/wav 无损母版编码，绝不拿已压过的 MP3 再压一次**
 *   （MP3→MP3 是代际损失，会把高频糊成金属声，那才是真"糊弄人"）。
 *
 * 档位：
 *   BGM  : libmp3lame VBR -q:a 6（约 115kbps）, 44.1kHz, 联合立体声
 *   SFX  : libmp3lame CBR 96kbps, 44.1kHz, 单声道
 *
 * 用法：
 *   node tools/audio/encode_mp3.js            # 编码全部
 *   node tools/audio/encode_mp3.js --bgm      # 只编 BGM
 *   node tools/audio/encode_mp3.js --sfx      # 只编 SFX
 *
 * 编完记得部署：node tools/audio/deploy_audio.js
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const HERE = __dirname
const WAV = path.join(HERE, 'out', 'wav')
const MP3 = path.join(HERE, 'out', 'mp3')

/**
 * ⚠️ 绝对不要用 `-ac 1` 做立体声→单声道降混（2026-09-01 实测踩坑）。
 *
 * ffmpeg/swresample 的 `rematrix_maxval` 只对**整型**输出格式才归一到 1.0；
 * 走浮点内部管线时它是无界的，stereo→mono 实际接近 L+R 直接相加，
 * 于是 41 个音效被整体抬高约 +2.55dB，hit_block / cast_meteor 等直接冲到
 * +1.45dBFS —— 母版明明干净地限在 -1dBFS，是编码环节自己造出的削波。
 *
 * 正确写法：显式 pan 系数 0.5/0.5。前面挂 aformat=stereo 是为了兼容
 * 本身已是单声道的母版（mono→stereo 增益为 1.0，再平均回来等于原样）。
 */
const MONO_DOWNMIX = 'aformat=channel_layouts=stereo,pan=mono|c0=0.5*c0+0.5*c1'

// —— 编码档位（改这里就等于改投产码率）——
const PROFILE = {
  bgm: ['-codec:a', 'libmp3lame', '-q:a', '6', '-joint_stereo', '1', '-ar', '44100'],
  sfx: ['-af', MONO_DOWNMIX, '-codec:a', 'libmp3lame', '-b:a', '96k', '-ar', '44100'],
}

const args = process.argv.slice(2)
const onlyBgm = args.includes('--bgm')
const onlySfx = args.includes('--sfx')
const doBgm = onlyBgm || !onlySfx
const doSfx = onlySfx || !onlyBgm

function encode(src, dst, profile) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', src,
    ...PROFILE[profile],
    '-map_metadata', '-1',   // 去掉 ID3，省几百字节且避免工具链塞垃圾 tag
    '-write_xing', '1',      // 写 Xing 头，播放器能拿到准确时长（seek/loop 更稳）
    dst,
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
  return fs.statSync(dst).size
}

let inBytes = 0, outBytes = 0, count = 0
const rows = []

function run(kind, srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) { console.warn(`⚠️ 找不到母版目录：${srcDir}`); return }
  for (const f of fs.readdirSync(srcDir).sort()) {
    if (!f.endsWith('.wav')) continue
    const src = path.join(srcDir, f)
    const dst = path.join(dstDir, f.replace(/\.wav$/, '.mp3'))
    const before = fs.existsSync(dst) ? fs.statSync(dst).size : 0
    const after = encode(src, dst, kind)
    inBytes += before; outBytes += after; count++
    rows.push({ name: `${kind}/${f.replace(/\.wav$/, '')}`, before, after })
  }
}

if (doBgm) run('bgm', WAV, MP3)
if (doSfx) run('sfx', path.join(WAV, 'sfx'), path.join(MP3, 'sfx'))

const kb = b => `${(b / 1024).toFixed(0)}KB`
console.log(`\n编码完成：${count} 个文件`)
console.log(`  旧 MP3 合计: ${kb(inBytes)}`)
console.log(`  新 MP3 合计: ${kb(outBytes)}`)
if (inBytes > 0) {
  const save = inBytes - outBytes
  console.log(`  节省:        ${kb(save)}  (${(save / inBytes * 100).toFixed(1)}%)`)
}
console.log('\n变化最大的 5 个：')
rows.sort((a, b) => (b.before - b.after) - (a.before - a.after)).slice(0, 5)
  .forEach(r => console.log(`  ${r.name.padEnd(22)} ${kb(r.before).padStart(8)} → ${kb(r.after).padStart(8)}`))
console.log('\n下一步：node tools/audio/deploy_audio.js')
