// extract.js（浏览器版）—— 视频解析 + 下载
// 解析走 video-extract（CORS 已开）；下载主用 CDN 直链(<video> 播放 + 长按/另存)避开白名单/6MB 限制。
// 2026-07-20：新增代理下载支持 DASH 分片，完善视频信息显示
(function () {
  const SUPABASE = 'https://ifohmefzneqwcvlxmyzv.supabase.co'
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlmb2htZWZ6bmVxd2N2bHhteXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyODc2OTcsImV4cCI6MjA5OTg2MzY5N30.GOGD81UzWoGqgzAC0Idb9kyt-EW9-Rwm1_K14SYcyRo'
  const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

  function getApiUrl() {
    return localStorage.getItem('apiUrl') || (SUPABASE + '/functions/v1/video-extract')
  }

  // 用户可能粘贴整段分享文案，从中抽取第一个 http(s) 链接（小程序也有这个逻辑）
  function extractUrl(text) {
    if (!text) return text
    const m = String(text).match(/https?:\/\/[^\s"')\]<>]+/)
    return m ? m[0] : text.trim()
  }

  // 后端 JSON 返回的 URL 可能被 Unicode 转义（如 \u002F -> /），必须清洗
  function cleanUrl(u) {
    if (!u) return u
    return String(u).replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/\\u003D/g, '=').replace(/\\u003F/g, '?')
  }

  function cleanVideo(v) {
    if (!v) return v
    v.downloadUrl = cleanUrl(v.downloadUrl)
    v.thumbnail = cleanUrl(v.thumbnail)
    if (Array.isArray(v.downloadUrls)) v.downloadUrls = v.downloadUrls.map(cleanUrl)
    return v
  }

  async function parse(rawUrl, platform) {
    const url = extractUrl(rawUrl)
    const api = getApiUrl()
    const res = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON },
      body: JSON.stringify({ url, platform })
    })
    const d = await res.json().catch(() => ({}))
    if (!d.success) {
      const err = new Error(d.message || '解析失败')
      err.cookie_invalid = !!d.cookie_invalid
      throw err
    }
    return cleanVideo(d.video)
  }

  function saveBlob(blobUrl, filename) {
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename || ('video_' + Date.now() + '.mp4')
    document.body.appendChild(a)
    a.click()
    setTimeout(() => a.remove(), 2000)
  }

  // 格式化文件大小
  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  window.Extract = { parse, saveBlob, getApiUrl, SUPABASE, formatSize }
})()
