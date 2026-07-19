// sw.js —— 纯客户端代理（不经任何后端/代理服务器）
// 拦截同源路径 /__swfetch?u=<encoded_cdn_url>，替页面跨域抓取视频字节，
// 再以“同源”响应返回，页面即可 blob 真正下载 / <video> 直接播放。
// 无 Supabase、无 6MB 限制。
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

// 根据目标 CDN 域名返回该平台防盗链所需的 Referer；无匹配则空（no-referrer）
function referrerFor(targetUrl) {
  const u = String(targetUrl).toLowerCase()
  if (u.includes('bilivideo') || u.includes('bilibili')) return 'https://www.bilibili.com/'
  if (u.includes('kuaishou') || u.includes('gifshow') || u.includes('ks-cdn') || u.includes('kuaishoucdn')) return 'https://www.kuaishou.com/'
  if (u.includes('xiaohongshu') || u.includes('xhscdn')) return 'https://www.xiaohongshu.com/'
  if (u.includes('douyin') || u.includes('tiktok') || u.includes('byteimg') || u.includes('aweme') || u.includes('ixigua') || u.includes('douyinvod')) return 'https://www.douyin.com/'
  return '' // 兜底：no-referrer
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => self.clients.claim())

self.addEventListener('fetch', (event) => {
  const req = event.request
  let url
  try { url = new URL(req.url) } catch (e) { return }
  if (url.pathname !== '/__swfetch') return

  const target = url.searchParams.get('u')
  if (!target) return

  event.respondWith((async () => {
    try {
      // 透传 Range（视频 seek 需要）
      const headers = { 'User-Agent': UA, 'Accept': '*/*' }
      const range = req.headers.get('Range')
      if (range) headers['Range'] = range

      // 按目标 CDN 域名设置正确的 Referer，逐个绕过各平台防盗链：
      // B站 bilivideo 必须带 bilibili.com；抖音/快手/小红书 带各自域名或空 Referer 均放行。
      // 兜底空 Referer（no-referrer）可覆盖大多数短视频 CDN。
      const ref = referrerFor(target)
      const upstreamReq = new Request(target, {
        method: 'GET',
        headers,
        referrer: ref,                  // ref 为 '' 时表示 no-referrer
        referrerPolicy: ref ? 'unsafe-url' : 'no-referrer',
      })

      const upstream = await fetch(upstreamReq)
      if (!upstream.ok && upstream.status !== 206) {
        return new Response('上游错误 HTTP ' + upstream.status, { status: 502 })
      }

      // 流式返回，避免大视频占用内存
      const respHeaders = {
        'Content-Type': upstream.headers.get('Content-Type') || 'video/mp4',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      }
      const len = upstream.headers.get('Content-Length')
      if (len) respHeaders['Content-Length'] = len
      const acceptRanges = upstream.headers.get('Accept-Ranges')
      if (acceptRanges) respHeaders['Accept-Ranges'] = acceptRanges
      const contentRange = upstream.headers.get('Content-Range')
      if (contentRange) respHeaders['Content-Range'] = contentRange

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: respHeaders,
      })
    } catch (err) {
      return new Response('SW 抓取失败: ' + err.message, { status: 502 })
    }
  })())
})
