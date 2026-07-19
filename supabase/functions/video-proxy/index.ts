// Supabase Edge Function: video-proxy
// 视频下载中转：服务端模拟浏览器（带 UA / Referer / Range）拉取视频字节流并流式回传。
// 客户端只连已白名单的 supabase.co，彻底绕开 downloadFile 的 CDN 通配白名单限制。

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,apikey,Range',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  try {
    const url = new URL(req.url)
    const target = url.searchParams.get('url')
    const referer = url.searchParams.get('referer') || ''
    const ua =
      url.searchParams.get('ua') ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    if (!target || !/^https?:\/\//.test(target)) {
      return new Response(JSON.stringify({ error: 'invalid url' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
      })
    }

    const headers: Record<string, string> = { 'User-Agent': ua }
    if (referer) headers['Referer'] = referer
    const range = req.headers.get('Range')
    if (range) headers['Range'] = range

    const upstream = await fetch(target, { headers, redirect: 'follow' })
    if (!upstream.ok && upstream.status !== 206) {
      return new Response(JSON.stringify({ error: 'upstream ' + upstream.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors },
      })
    }

    const ct = upstream.headers.get('Content-Type') || 'video/mp4'
    const out = new Headers(cors)
    out.set('Content-Type', ct)
    const cl = upstream.headers.get('Content-Length')
    if (cl) out.set('Content-Length', cl)
    const cr = upstream.headers.get('Content-Range')
    if (cr) out.set('Content-Range', cr)
    out.set('Accept-Ranges', 'bytes')
    out.set('Cache-Control', 'no-store')

    return new Response(upstream.body, { status: upstream.status, headers: out })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'proxy fetch failed: ' + String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }
})
