// Supabase Edge Function: watermark-remove
// 去水印，两条路径：
//   路径 A（推荐，Content-Type: application/json，body: { url }）：
//     豆包/千问 AI 生成内容的「无水印原片」解析。直接从平台原生接口/页面拿原始资源直链，
//     无损、秒出、零痕迹，无需 ffmpeg、无需存储桶。这是豆包视频/图片的最优方案。
//   路径 B（兜底，Content-Type: multipart/form-data，含 file）：
//     接收上传的视频 + 归一化水印区域 (x,y,w,h ∈ 0..1) + 方式 (blur|mosaic|crop)，
//     用 ffmpeg (WASM, 单线程 core-st) 对选区做处理，结果上传 Storage 返回 URL。
//     用于非豆包来源 / 需手动框选的场景。
//
// 部署要点（Supabase 后台 / CLI）：
//   1. 在 Storage 建一个 public bucket，名为 `watermark-output`（或改下面 BUCKET 常量）。
//   2. 设置环境变量 SUPABASE_URL（项目 URL）与 SUPABASE_SERVICE_ROLE_KEY（服务密钥，用于写 Storage）。
//   3. 建议把本函数的「内存」调到 1GB、「超时」调到 300s（ffmpeg WASM 较慢）。
//   4. 小程序端需把 `*.supabase.co` 加进 downloadFile 合法域名（video-proxy 已用到，一般已加）。
//
// 说明：小程序端无法在本地处理视频帧，故视频去水印必须在服务端完成。豆包等 AI 生成视频的水印是
// 固定位置 logo，「delogo」用周围像素插值消除，效果最自然（对应方式 blur）。

import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10'
import { fetchFile, toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.1'

const BUCKET = 'watermark-output'
const MAX_BYTES = 90 * 1024 * 1024 // 90MB 上限，避免超时

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,apikey',
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

function clamp01(v: number) { return Math.min(1, Math.max(0, v)) }

// 从 ffmpeg 探测日志里解析分辨率
function parseResolution(logs: string): { w: number; h: number } | null {
  const m = logs.match(/Stream #\d+:\d+.*?: Video:.*?(\d{2,5})x(\d{2,5})/)
  if (m) return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) }
  const m2 = logs.match(/(\d{2,5})x(\d{2,5})/)
  if (m2) return { w: parseInt(m2[1], 10), h: parseInt(m2[2], 10) }
  return null
}

// ============================================================
// 豆包 / 千问 无水印原片解析（社区成熟方案）
// 原理：豆包 AI 生成的图片/视频，后端本身存有「无水印原片」。
// 不擦像素，而是解析分享链接，直接拿到平台原生的原始资源直链——无损、秒出、零痕迹。
// 参考：github.com/ihmily/doubao-nomark、github.com/wan-kong/doubao-nomark-online
// ============================================================
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40(0x18002823) NetType/WIFI Language/zh_CN'

// 跟随短链重定向，拿到最终地址
async function resolveUrl(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': CHROME_UA }, redirect: 'follow' })
    return r.url || url
  } catch { return url }
}

// 在任意对象里深度搜寻符合条件的字符串
function deepFindString(obj: any, pred: (s: string) => boolean): string | null {
  const stack = [obj]
  while (stack.length) {
    const cur = stack.pop()
    if (cur == null) continue
    if (typeof cur === 'string') { if (pred(cur)) return cur; continue }
    if (typeof cur === 'object') for (const k in cur) stack.push(cur[k])
  }
  return null
}

// 豆包视频：从分享链接取 share_id / video_id，请求官方分享接口拿无水印直链
async function parseDoubaoVideo(url: string) {
  const u = new URL(url)
  const shareId = u.searchParams.get('share_id') || u.searchParams.get('shareId') || ''
  const videoId = u.searchParams.get('video_id') || u.searchParams.get('vid') || ''
  if (!shareId || !videoId) throw new Error('链接缺少 share_id / video_id，请复制豆包「分享」按钮生成的完整链接')

  const api = 'https://www.doubao.com/creativity/share/get_video_share_info?version_code=20800&language=zh-CN&device_platform=web&aid=497858&pc_version=2.51.7'
  const resp = await fetch(api, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': WECHAT_UA,
      'origin': 'https://www.doubao.com',
      'referer': 'https://www.doubao.com/',
    },
    body: JSON.stringify({ share_id: shareId, vid: videoId, creation_id: '' }),
  })
  const dj = await resp.json().catch(() => null)
  const playInfo = dj?.data?.play_info || dj?.result?.data?.play_info || dj?.play_info
  if (!playInfo) throw new Error('未获取到视频信息（链接可能已过期或非豆包 AI 视频）')
  const play = playInfo.play || playInfo
  const videoUrl = play.main || play.url || play.play_url ||
    deepFindString(playInfo, (s) => /^https?:\/\/[^\s"]+\.mp4/i.test(s) || (/^https?:\/\//.test(s) && /\.mp4/i.test(s)))
  const poster = play.poster_url || playInfo.poster_url || ''
  if (!videoUrl) throw new Error('未解析到无水印视频地址')
  return {
    type: 'video',
    mediaUrl: videoUrl,
    poster,
    width: play.width || 0,
    height: play.height || 0,
    definition: play.definition || '',
  }
}

// 豆包图片：抓取 thread 页面 HTML，提取内嵌 JSON，取 image_ori_raw 原图
async function parseDoubaoImage(url: string) {
  const resp = await fetch(url, { headers: { 'user-agent': CHROME_UA, 'accept-language': 'zh-CN,zh;q=0.9' } })
  const html = await resp.text()
  const m = html.match(/data-script-src="modern-run-router-data-fn" data-fn-args="([\s\S]*?)" nonce="/)
  if (!m) throw new Error('未找到页面数据（链接可能需要登录或已失效）')
  const jsonStr = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  let jsonData: any
  try { jsonData = JSON.parse(jsonStr) } catch { throw new Error('页面数据解析失败') }

  const urls: string[] = []
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return
    if (o.image_ori_raw && o.image_ori_raw.url) {
      urls.push(String(o.image_ori_raw.url).replace(/&amp;/g, '&'))
    }
    for (const k in o) {
      const v = o[k]
      if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
        try { walk(JSON.parse(v)) } catch { /* not json */ }
      } else if (typeof v === 'object') {
        walk(v)
      }
    }
  }
  walk(jsonData)
  if (!urls.length) throw new Error('未解析到原图地址')
  return { type: 'image', mediaUrl: urls[0], images: urls }
}

// 统一解析入口：识别类型并调用对应解析器
async function parseShare(rawUrl: string) {
  let url = rawUrl.trim()
  if (!url) throw new Error('链接为空')
  // 短链或不含识别特征时，先跟随重定向拿最终地址
  if (!url.includes('/thread/') && !url.includes('share_id') && !url.includes('video')) {
    url = await resolveUrl(url)
  }
  if (url.includes('/thread/')) return await parseDoubaoImage(url)
  return await parseDoubaoVideo(url)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ success: false, message: '仅支持POST' }, 405)

  const contentType = req.headers.get('content-type') || ''

  // ===== 路径 A：豆包/千问链接 → 解析无水印原片（无需 ffmpeg、无需存储桶）=====
  if (contentType.includes('application/json')) {
    try {
      const body = await req.json().catch(() => ({}))
      const link = String(body.url || '')
      if (!link) return json({ success: false, message: '缺少 url' }, 400)
      const result = await parseShare(link)
      return json({ success: true, ...result })
    } catch (e) {
      return json({ success: false, message: '解析失败：' + (e as Error).message }, 400)
    }
  }

  // ===== 路径 B：上传文件 → ffmpeg 区域处理（兜底：非豆包来源 / 手动框选）=====
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceKey) {
    return json({ success: false, message: '服务端未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500)
  }

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!file || !(file instanceof File)) {
      return json({ success: false, message: '缺少视频文件(file)' }, 400)
    }
    if (file.size > MAX_BYTES) {
      return json({ success: false, message: '视频过大（>90MB），请先压缩或裁剪' }, 400)
    }

    const x = clamp01(parseFloat(form.get('x') as string) || 0)
    const y = clamp01(parseFloat(form.get('y') as string) || 0)
    const w = clamp01(parseFloat(form.get('w') as string) || 0)
    const h = clamp01(parseFloat(form.get('h') as string) || 0)
    const method = (form.get('method') as string) || 'blur'
    if (w <= 0 || h <= 0) {
      return json({ success: false, message: '水印区域无效' }, 400)
    }

    const ffmpeg = new FFmpeg()
    const logs: string[] = []
    ffmpeg.on('log', ({ message }: { message: string }) => { logs.push(message) })

    const baseURL = 'https://esm.sh/@ffmpeg/core-st@0.12.6'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    const ext = (file.name || 'input.mp4').includes('.') ? (file.name.split('.').pop() || 'mp4') : 'mp4'
    const inputName = `input.${ext === 'mov' ? 'mov' : 'mp4'}`
    await ffmpeg.writeFile(inputName, await fetchFile(await file.arrayBuffer()))

    // 1) 探测分辨率
    await ffmpeg.exec(['-i', inputName, '-f', 'null', '-'])
    const res = parseResolution(logs.join('\n'))
    if (!res || !res.w || !res.h) {
      return json({ success: false, message: '无法解析视频分辨率' }, 400)
    }
    const W = res.w, H = res.h

    // 2) 构造滤镜
    let vf = ''
    if (method === 'blur') {
      // delogo：用周围像素插值消除 logo（最适合豆包/抖音类固定角标）
      const ix = Math.max(0, Math.floor(x * W) - 6)
      const iy = Math.max(0, Math.floor(y * H) - 6)
      const iw = Math.min(W - ix, Math.ceil(w * W) + 12)
      const ih = Math.min(H - iy, Math.ceil(h * H) + 12)
      vf = `delogo=x=${ix}:y=${iy}:w=${iw}:h=${ih}:show=0`
    } else if (method === 'mosaic') {
      // 区域缩放马赛克
      vf = `[0:v]split=2[a][b];[a]crop=iw*${w}:ih*${h}:iw*${x}:ih*${y},scale=iw/24:ih/24,scale=iw*24:ih*24,format=yuv420p[c];[b][c]overlay=iw*${x}:ih*${y}`
    } else {
      // crop：裁掉水印最近的一条边
      const dTop = y, dBottom = 1 - y - h, dLeft = x, dRight = 1 - x - w
      const min = Math.min(dTop, dBottom, dLeft, dRight)
      if (min === dTop) vf = `crop=iw:ih*(1-${y}):0:ih*${y}`
      else if (min === dBottom) vf = `crop=iw:ih*${y}:0:0`
      else if (min === dLeft) vf = `crop=iw*(1-${x}):ih:iw*${x}:0`
      else vf = `crop=iw*${x}:ih:0:0`
    }

    const outName = 'output.mp4'
    const args = ['-i', inputName, '-vf', vf, '-c:a', 'copy', '-movflags', '+faststart', '-preset', 'veryfast', outName]
    const code = await ffmpeg.exec(args)
    if (code !== 0) {
      return json({ success: false, message: 'ffmpeg 处理失败', log: logs.slice(-20).join('\n') }, 500)
    }

    const data = await ffmpeg.readFile(outName)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data as Uint8Array)

    // 3) 上传到 Storage
    const name = `wm_${Date.now()}.mp4`
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'video/mp4',
        'x-upsert': 'true',
      },
      body: bytes,
    })
    if (!uploadRes.ok) {
      const txt = await uploadRes.text()
      return json({ success: false, message: '结果上传存储失败: ' + txt }, 500)
    }

    const resultUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${name}`
    return json({ success: true, resultUrl, method, resolution: `${W}x${H}` })
  } catch (e) {
    return json({ success: false, message: '服务器错误: ' + (e as Error).message }, 500)
  }
})
