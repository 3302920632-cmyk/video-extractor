// Netlify Function：同源视频代理
// 解决浏览器直连平台 CDN 的两道墙：防盗链(Referer) + CORS。
// 服务端用正确 Referer 去抓 CDN，再以「同源」响应流回浏览器，
// 于是 <video> 能播、<a download> 能真文件名保存，且支持 Range(seek)。
//
// 注意：Netlify Functions 免费版对单次响应体有约 6MB 上限，
// 超长视频请在 netlify.toml 升级套餐或改用 Edge Functions。

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

// 按目标 CDN 域名返回该平台防盗链所需的 Referer；无匹配则空（no-referrer）
function referrerFor(targetUrl) {
  const u = String(targetUrl).toLowerCase()
  if (u.includes('bilivideo') || u.includes('bilibili')) return 'https://www.bilibili.com/'
  if (u.includes('kuaishou') || u.includes('gifshow') || u.includes('ks-cdn') || u.includes('kuaishoucdn')) return 'https://www.kuaishou.com/'
  if (u.includes('xiaohongshu') || u.includes('xhscdn')) return 'https://www.xiaohongshu.com/'
  if (u.includes('douyin') || u.includes('tiktok') || u.includes('byteimg') || u.includes('aweme') || u.includes('ixigua') || u.includes('douyinvod')) return 'https://www.douyin.com/'
  return ''
}

export default async (request, context) => {
  const url = new URL(request.url)
  const target = url.searchParams.get('url')
  if (!target) return new Response('missing url', { status: 400 })

  const referer = url.searchParams.get('referer') || referrerFor(target)
  const headers = { 'User-Agent': UA, 'Accept': '*/*' }
  if (referer) headers['Referer'] = referer
  const range = request.headers.get('range')
  if (range) headers['Range'] = range

  try {
    const upstream = await fetch(target, { headers, redirect: 'follow' })
    const out = new Headers()
    out.set('Content-Type', upstream.headers.get('Content-Type') || 'video/mp4')
    out.set('Cache-Control', 'no-store')
    out.set('Accept-Ranges', upstream.headers.get('Accept-Ranges') || 'bytes')
    const cr = upstream.headers.get('Content-Range')
    if (cr) out.set('Content-Range', cr)
    const cl = upstream.headers.get('Content-Length')
    if (cl) out.set('Content-Length', cl)
    // 同源场景下其实不需要 CORS，放开也无妨，便于本地调试
    out.set('Access-Control-Allow-Origin', '*')
    return new Response(upstream.body, { status: upstream.status, headers: out })
  } catch (e) {
    return new Response('proxy error: ' + e.message, { status: 502 })
  }
}
