// app.js —— 媒体工具箱 HTML 版主逻辑（hash 路由 + 各工具页面）
(function () {
  const view = document.getElementById('view')
  const titleEl = document.getElementById('pageTitle')
  const backBtn = document.getElementById('backBtn')
  const tabbar = document.getElementById('tabbar')
  const toastEl = document.getElementById('toast')
  let toastTimer = null
  function toast(msg, type) {
    toastEl.textContent = msg
    toastEl.className = 'toast show' + (type ? ' ' + type : '')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastEl.className = 'toast' }, 1800)
  }
  function fmtTime(ts) {
    const d = new Date(ts); const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  function fmtDur(sec) {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
  }
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild }
  function downloadUrlFrom(blobOrUrl, filename) {
    const a = document.createElement('a'); a.href = blobOrUrl; a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 2000)
  }

  // ===== 纯客户端下载（Service Worker 代理，不经 Supabase / 无 6MB 限制）=====
  let SW_READY = false
  function registerSW() {
    if (!('serviceWorker' in navigator)) return
    if (!location.protocol.startsWith('http')) return  // file:// 不支持 SW
    try {
      // 加版本号防止浏览器缓存旧 SW
      const reg = navigator.serviceWorker.register('./sw.js?v=3')
      reg.then(r => {
        const mark = () => { SW_READY = true }
        if (r.active) mark()
        else r.addEventListener('updatefound', () => {
          const w = r.installing
          if (w) w.addEventListener('statechange', () => { if (w.state === 'activated') mark() })
        })
        navigator.serviceWorker.ready.then(mark).catch(() => {})
      }).catch(() => { SW_READY = false })
    } catch (e) { SW_READY = false }
  }
  // 经 SW 抓取跨域视频字节并真正下载（a.download 在同源 blob 下有效）
  async function downloadViaSW(src, name, onProgress) {
    if (!SW_READY) throw new Error('SW未就绪')
    const r = await fetch('/__swfetch?u=' + encodeURIComponent(src), { cache: 'no-store' })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      throw new Error('下载失败(' + r.status + ') ' + t.slice(0, 80))
    }
    const total = parseInt(r.headers.get('Content-Length') || '0', 10)
    if (total && r.body && typeof ReadableStream !== 'undefined') {
      const reader = r.body.getReader()
      const chunks = []
      let loaded = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.byteLength
        if (onProgress) onProgress(loaded, total)
      }
      const blob = new Blob(chunks, { type: r.headers.get('Content-Type') || 'video/mp4' })
      downloadUrlFrom(URL.createObjectURL(blob), name)
      return
    }
    const blob = await r.blob()
    downloadUrlFrom(URL.createObjectURL(blob), name)
  }
  // 同 SW 播放地址（视频预览用）
  function swPlayUrl(src) {
    if (!SW_READY || !src) return src
    return '/__swfetch?u=' + encodeURIComponent(src)
  }
  registerSW()

  // 同源视频代理（部署到 Netlify 时启用）：绕过浏览器直连的防盗链/CORS，
  // 并让 <a download> 能真正以文件名保存。本地/非 Netlify 环境自动降级直连。
  const PROXY_PATH = '/.netlify/functions/video-proxy'
  const IS_NETLIFY = location.hostname.endsWith('.netlify.app') || location.hostname.endsWith('.netlify.live')
  function proxyUrl(cdnUrl) { return PROXY_PATH + '?url=' + encodeURIComponent(cdnUrl) }

  const routes = {
    home:     { title: '工具箱', tab: 'home',     render: renderHome },
    records:  { title: '记录',   tab: 'records',  render: renderRecords },
    settings: { title: '我的',   tab: 'settings', render: renderSettings },
    extract:  { title: '视频提取', tab: null,     render: renderExtract, back: true },
    audio:    { title: '音乐提取', tab: null,     render: renderAudio, back: true },
    img2pdf:  { title: '图片转PDF', tab: null,    render: renderImg2pdf, back: true },
    watermark:{ title: '去水印',  tab: null,     render: renderWatermark, back: true },
    compress: { title: '智能压缩', tab: null,     render: renderCompress, back: true },
    ai:       { title: 'AI 生成', tab: null,     render: renderAi, back: true },
  }

  function router() {
    const hash = (location.hash || '#home').replace('#', '')
    const route = routes[hash] || routes.home
    ;[...tabbar.children].forEach(b => b.classList.toggle('active', b.dataset.route === route.tab))
    tabbar.style.display = route.tab ? 'flex' : 'none'
    backBtn.classList.toggle('show', !!route.back)
    titleEl.textContent = route.title
    view.innerHTML = ''
    route.render(view)
    window.scrollTo(0, 0)
  }
  backBtn.onclick = () => { if (history.length > 1) history.back(); else location.hash = '#home' }
  tabbar.addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) location.hash = '#' + b.dataset.route })
  window.addEventListener('hashchange', router)

  // ===================== 工具箱首页 =====================
  function renderHome(v) {
    const tools = [
      { id: 'extract',  name: '视频提取', desc: '抖音/快手/小红书/B站', ic: '🎬', bg: '#8db2ff' },
      { id: 'audio',    name: '音乐提取', desc: '抖音视频批量提取音频', ic: '🎵', bg: '#c9f0d2' },
      { id: 'img2pdf',  name: '图片转PDF', desc: '多图合并一键导出', ic: '📄', bg: '#ffc48f' },
      { id: 'watermark',name: '去水印', desc: '图片/视频去水印', ic: '🧽', bg: '#c9f0d2' },
      { id: 'compress', name: '智能压缩', desc: '图片/PDF/PPTX', ic: '🗜️', bg: '#d7ff63' },
      { id: 'ai',       name: 'AI生成', desc: '文字/图片生成视频图', ic: '✨', bg: '#fffaf0' },
    ]
    const grid = el('<div class="grid"></div>')
    tools.forEach(t => {
      const card = el(`<div class="tool" data-id="${t.id}">
        <div class="ic" style="background:${t.bg}">${t.ic}</div>
        <div class="nm">${t.name}</div>
        <div class="ds">${t.desc}</div>
      </div>`)
      card.onclick = () => { location.hash = '#' + t.id }
      grid.appendChild(card)
    })
    v.appendChild(el('<h3 style="margin:4px 4px 14px;font-size:17px">工具箱</h3>'))
    v.appendChild(grid)
    v.appendChild(el(`<div class="hint">本页为纯网页版，直接浏览器打开即可用。视频提取解析走服务端接口，下载由浏览器直连（无白名单/大小限制）。</div>`))
  }

  // ===================== 记录 =====================
  function renderRecords(v) {
    const list = RecordsStore.getRecords()
    const wrap = el('<div></div>')
    if (!list.length) {
      wrap.appendChild(el('<div class="card muted">还没有解析记录。去「视频提取」试试吧。</div>'))
    } else {
      list.forEach(r => {
        const typeText = r.type === 'doubao' ? '豆包原片' : (r.type === 'extract' ? '提取' : (r.type || '解析'))
        const platText = ({douyin:'抖音',kuaishou:'快手',bilibili:'B站',xiaohongshu:'小红书',doubao:'豆包',image:'图片'})[r.platform] || (r.platform || '未知')
        const card = el(`<div class="rec">
          <div class="t">${esc(r.title || '未命名')}</div>
          <div class="meta">${platText} · ${typeText} · ${fmtTime(r.time)}</div>
          <div class="acts">
            <button class="btn ghost sm" data-copy="${esc(r.url || '')}">复制链接</button>
            <button class="btn ghost sm" data-del="${r.id}">删除</button>
          </div>
        </div>`)
        card.querySelector('[data-copy]').onclick = () => {
          navigator.clipboard.writeText(r.url || '').then(() => toast('链接已复制')).catch(() => toast('复制失败'))
        }
        card.querySelector('[data-del]').onclick = () => {
          if (confirm('确定删除这条记录？')) { RecordsStore.deleteRecord(r.id); router() }
        }
        wrap.appendChild(card)
      })
    }
    v.appendChild(wrap)
    if (list.length) {
      const clearBtn = el('<button class="btn ghost">清空全部记录</button>')
      clearBtn.onclick = () => { if (confirm('确定清空全部记录？')) { RecordsStore.clearRecords(); router() } }
      v.appendChild(clearBtn)
    }
  }

  // ===================== 我的 / 设置 =====================
  function renderSettings(v) {
    const cur = Extract.getApiUrl()
    const card = el(`<div class="card">
      <h3>解析服务地址</h3>
      <input type="text" id="apiInput" value="${esc(cur)}" placeholder="https://.../functions/v1/video-extract" />
      <button class="btn" id="saveApi">保存</button>
      <div class="status" id="apiStatus"></div>
    </div>`)
    card.querySelector('#saveApi').onclick = () => {
      const val = card.querySelector('#apiInput').value.trim()
      if (!val) return toast('请输入地址')
      localStorage.setItem('apiUrl', val.replace(/\/$/, ''))
      toast('设置已保存')
    }
    v.appendChild(card)

    // 小红书共享 Cookie 状态
    const xhsCard = el(`<div class="card">
      <h3>小红书 Cookie 状态</h3>
      <div class="status" id="xhsStatus">检测中…</div>
      <details>
        <summary>管理员更新 Cookie</summary>
        <input type="text" id="adminKey" placeholder="管理员密钥" style="margin-top:10px" />
        <input type="text" id="xhsCookie" placeholder="粘贴小红书 Cookie" style="margin-top:8px" />
        <button class="btn" id="updateXhs">保存 Cookie</button>
      </details>
    </div>`)
    v.appendChild(xhsCard)
    checkXhs(xhsCard.querySelector('#xhsStatus'))
    xhsCard.querySelector('#updateXhs').onclick = () => {
      const base = Extract.getApiUrl().replace(/\/video-extract$/, '/shared-cookie')
      const cookie = xhsCard.querySelector('#xhsCookie').value.trim()
      const adminKey = xhsCard.querySelector('#adminKey').value.trim()
      if (!cookie) return toast('请粘贴 Cookie')
      fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set', platform: 'xiaohongshu', cookie, adminKey }) })
        .then(r => r.json()).then(d => {
          if (d && d.success) { toast('已保存'); checkXhs(xhsCard.querySelector('#xhsStatus')) }
          else toast(d && d.message || '保存失败')
        }).catch(() => toast('网络错误'))
    }
    v.appendChild(el(`<div class="hint">视频提取解析接口复用 Supabase <code>video-extract</code>（已开启 CORS）。地址默认即用，一般无需修改。</div>`))
  }
  function checkXhs(statusEl) {
    const base = Extract.getApiUrl().replace(/\/video-extract$/, '/shared-cookie')
    if (!base) { statusEl.textContent = '未配置地址'; return }
    fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check', platform: 'xiaohongshu' }) })
      .then(r => r.json()).then(d => {
        if (!d || !d.hasCookie) statusEl.textContent = '未配置小红书 Cookie（小红书解析将不可用）'
        else if (d.valid) statusEl.innerHTML = '✅ 有效（更新于 ' + esc(d.updated_at || '-') + '）'
        else statusEl.innerHTML = '⚠️ 已失效，需更新 Cookie'
      }).catch(() => { statusEl.textContent = '检测失败' })
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }

  // ===================== 视频提取 =====================
  function detectPlatform(url) {
    if (/douyin|tiktok/.test(url)) return 'douyin'
    if (/kuaishou|gifshow/.test(url)) return 'kuaishou'
    if (/bilibili|b23\.tv/.test(url)) return 'bilibili'
    if (/xiaohongshu|xhslink/.test(url)) return 'xiaohongshu'
    if (/doubao|doubaoai/.test(url)) return 'doubao'
    return 'douyin'
  }
  function renderExtract(v) {
    const card = el(`<div class="card">
      <h3>视频提取 · 去水印</h3>
      <div class="chips" id="platChips">
        <span class="chip active" data-p="auto">自动</span>
        <span class="chip" data-p="douyin">抖音</span>
        <span class="chip" data-p="kuaishou">快手</span>
        <span class="chip" data-p="xiaohongshu">小红书</span>
        <span class="chip" data-p="bilibili">B站</span>
        <span class="chip" data-p="doubao">豆包</span>
      </div>
      <textarea id="urlInput" placeholder="粘贴分享链接，如 https://v.douyin.com/xxxx/"></textarea>
      <div class="row">
        <button class="btn row" id="parseBtn">解析</button>
        <button class="btn ghost row" id="pasteBtn">粘贴</button>
      </div>
      <div class="status" id="status"></div>
    </div>`)
    let platform = 'auto'
    card.querySelector('#platChips').onclick = e => {
      const c = e.target.closest('.chip'); if (!c) return
      card.querySelectorAll('.chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); platform = c.dataset.p
    }
    card.querySelector('#pasteBtn').onclick = () => {
      navigator.clipboard.readText().then(t => { card.querySelector('#urlInput').value = t; toast('已粘贴') }).catch(() => toast('无法读取剪贴板'))
    }
    const parseBtn = card.querySelector('#parseBtn')
    parseBtn.onclick = async () => {
      const url = card.querySelector('#urlInput').value.trim()
      if (!url) return toast('请输入链接')
      const st = card.querySelector('#status'); st.className = 'status'; st.textContent = '解析中…'
      parseBtn.disabled = true
      try {
        const plat = platform === 'auto' ? detectPlatform(url) : platform
        const video = await Extract.parse(url, plat)
        showExtractResult(v, video, url)
        RecordsStore.addRecord({ type: 'extract', platform: video.platform || plat, title: video.title, url: (video.downloadUrls && video.downloadUrls[0]) || video.downloadUrl })
        st.textContent = ''
      } catch (e) {
        st.className = 'status err'; st.textContent = (e.cookie_invalid ? '小红书 Cookie 失效，请联系作者更新。' : (e.message || '解析失败'))
      } finally { parseBtn.disabled = false }
    }
    v.appendChild(card)
  }
  function fmtDur(sec) {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
  }
  function showExtractResult(v, video, url) {
    let src = (video.downloadUrls && video.downloadUrls[0]) || video.downloadUrl
    src = String(src).replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/\\u003D/g, '=').replace(/\\u003F/g, '?')
    const safeName = (video.title || 'video').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) + '.mp4'
    const isDash = video.isDash || false
    // 后端若没给大小或给了 1B 占位，先显示 “-”，等 metadata/HEAD 再更新
    const sizeVal = (video.fileSize && video.fileSize !== '1B' && video.fileSize !== '1 B' && video.fileSize !== '-') ? video.fileSize : '-'

    const infoRows = [
      { label: '标题', value: video.title || '视频', key: 'title' },
      { label: '时长', value: video.duration || '-', key: 'duration' },
      { label: '分辨率', value: video.resolution || '-', key: 'resolution' },
      { label: '大小', value: sizeVal, key: 'size' },
    ]
    if (video.fps && video.fps !== '-') infoRows.push({ label: '帧率', value: video.fps, key: 'fps' })

    const card = el(`<div class="card result-card">
      <h3>解析结果</h3>
      <div class="video-wrap">
        ${isDash
          ? `<div class="video-fallback">⚠️ 该视频为 DASH 分片格式<br>视频和音频分离，浏览器无法直接播放<br>请点下方「保存视频」下载</div>`
          : `<video id="resVideo" src="${esc(IS_NETLIFY ? proxyUrl(src) : src)}" controls playsinline preload="metadata" poster="${esc(video.thumbnail || '')}" referrerpolicy="no-referrer"></video>`}
      </div>
      <div class="list-card" id="infoList">
        ${infoRows.map(r => `<div class="list-row" data-key="${r.key}"><span class="row-label">${r.label}</span><span class="row-value">${esc(r.value)}</span></div>`).join('')}
      </div>
      <div class="row-actions">
        <button class="action-btn btn-fill" id="saveBtn">⬇ 保存视频</button>
        <button class="action-btn btn-outline" id="copyBtn">🔗 复制链接</button>
      </div>
      <div class="status" id="dlStatus"></div>
    </div>`)

    const videoEl = card.querySelector('#resVideo')

    function updateInfo(key, value) {
      const row = card.querySelector(`[data-key="${key}"] .row-value`)
      if (row) row.textContent = value
    }

      if (videoEl) {
        let degraded = false
        videoEl.onloadedmetadata = () => {
        const dur = isNaN(videoEl.duration) ? '-' : fmtDur(videoEl.duration)
        const res = videoEl.videoWidth && videoEl.videoHeight ? `${videoEl.videoWidth}x${videoEl.videoHeight}` : '-'
        updateInfo('duration', dur)
        updateInfo('resolution', res)
      }
        videoEl.onerror = () => {
          if (IS_NETLIFY && !degraded && videoEl.src !== src) {
            // 代理失败 → 降级直连原始 CDN 再试一次
            degraded = true
            videoEl.src = src
            videoEl.load()
            return
          }
          const st = card.querySelector('#dlStatus')
          st.className = 'status err'
          st.innerHTML = '当前视频无法在页面内播放（平台限制）。<br>请点「保存视频 / 复制链接」下载到本地观看。'
        }
    }

    const saveBtn = card.querySelector('#saveBtn')
    const copyBtn = card.querySelector('#copyBtn')
    const dlStatus = card.querySelector('#dlStatus')

    saveBtn.onclick = () => {
      if (IS_NETLIFY) {
        // 同源代理 → 浏览器能真正以文件名下载（同源下 <a download> 有效）
        const a = document.createElement('a')
        a.href = proxyUrl(src); a.download = safeName; a.referrerPolicy = 'no-referrer'
        document.body.appendChild(a); a.click(); a.remove()
        dlStatus.className = 'status'; dlStatus.textContent = '已开始下载，请留意浏览器下载栏。'
      } else {
        // 非 Netlify 环境：直连新标签，由浏览器/系统保存（跨域无法强制文件名）
        const a = document.createElement('a')
        a.href = src; a.target = '_blank'; a.rel = 'noopener'; a.referrerPolicy = 'no-referrer'
        a.download = safeName
        document.body.appendChild(a); a.click(); a.remove()
        dlStatus.className = 'status'; dlStatus.textContent = '已尝试打开视频，请在新标签中长按 / 右键保存到本地。'
      }
    }

    copyBtn.onclick = () => {
      navigator.clipboard.writeText(src).then(() => toast('链接已复制')).catch(() => toast('复制失败'))
    }

    v.appendChild(card)
  }
  // ===================== 音乐提取（批量） =====================
  function renderAudio(v) {
    const card = el(`<div class="card">
      <h3>音乐提取（批量）</h3>
      <div class="muted">每行一个抖音分享链接，最多 20 个。提取为 M4A 音频（无损抽取音轨）。</div>
      <textarea id="urls" placeholder="https://v.douyin.com/xxx/\nhttps://v.douyin.com/yyy/"></textarea>
      <button class="btn" id="start">开始提取</button>
      <div class="status" id="status"></div>
      <div id="result"></div>
    </div>`)
    card.querySelector('#start').onclick = async () => {
      const lines = card.querySelector('#urls').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20)
      if (!lines.length) return toast('请输入链接')
      const st = card.querySelector('#status'); const res = card.querySelector('#result')
      res.innerHTML = ''
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]; st.className = 'status'; st.textContent = `处理 ${i + 1}/${lines.length}…`
        try {
          const video = await Extract.parse(line, 'douyin')
          const src = (video.downloadUrls && video.downloadUrls[0]) || video.downloadUrl
          // 经 Service Worker 跨域抓取视频字节（不经 Supabase 代理，无 6MB 限制）
          const r = await fetch('/__swfetch?u=' + encodeURIComponent(src), { cache: 'no-store' })
          if (!r.ok) throw new Error('拉取视频字节失败(' + r.status + ')')
          const buf = await r.arrayBuffer()
          const { m4a } = AudioExtract.extractAudioM4A(buf)
          const url = URL.createObjectURL(new Blob([m4a], { type: 'audio/mp4' }))
          const name = (video.title || ('audio' + (i + 1)))
          const item = el(`<div class="filechip"><span>✅ ${esc(name)}</span><button class="btn ghost sm" data-dl>下载</button></div>`)
          item.querySelector('[data-dl]').onclick = () => downloadUrlFrom(url, name + '.m4a')
          res.appendChild(item)
        } catch (e) {
          const item = el(`<div class="filechip"><span>❌ ${esc(line.slice(0, 28))}：${esc(e.message || '失败')}</span></div>`)
          res.appendChild(item)
        }
      }
      st.textContent = '完成'
    }
    v.appendChild(card)
    v.appendChild(el(`<div class="hint">音频抽取经浏览器本地 Service Worker 抓取视频字节并解封装为 M4A（不经任何代理服务器，无 6MB 限制）。</div>`))
  }

  // ===================== 图片转 PDF =====================
  function renderImg2pdf(v) {
    const card = el(`<div class="card">
      <h3>图片转 PDF</h3>
      <div class="muted">最多 9 张，按原像素无损嵌入，生成标准 PDF（可直接打开发送给微信好友）。</div>
      <input type="file" id="fileInput" accept="image/*" multiple style="margin-top:10px" />
      <div id="thumbs"></div>
      <div class="status" id="status">已选 0 张</div>
      <button class="btn" id="gen">生成 PDF</button>
      <div id="result"></div>
    </div>`)
    const files = []
    const status = card.querySelector('#status'); const thumbs = card.querySelector('#thumbs')
    card.querySelector('#fileInput').onchange = (e) => {
      const picked = [...e.target.files].slice(0, 9 - files.length)
      picked.forEach(f => {
        files.push(f)
        const item = el(`<div class="filechip"><span>🖼️ ${esc(f.name)}</span><button class="btn ghost sm" data-rm>✕</button></div>`)
        item.querySelector('[data-rm]').onclick = () => { const i = files.indexOf(f); if (i >= 0) files.splice(i, 1); item.remove(); status.textContent = '已选 ' + files.length + ' 张' }
        thumbs.appendChild(item)
      })
      status.textContent = '已选 ' + files.length + ' 张'
      e.target.value = ''
    }
    card.querySelector('#gen').onclick = async () => {
      if (!files.length) return toast('请先选择图片')
      status.className = 'status'; status.textContent = '正在处理 0/' + files.length
      try {
        const loaded = []
        for (let i = 0; i < files.length; i++) { status.textContent = '正在处理 ' + (i + 1) + '/' + files.length; loaded.push(await PdfUtil.loadImageFile(files[i])) }
        const pdf = PdfUtil.buildPdf(loaded)
        const blob = new Blob([pdf], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const res = card.querySelector('#result'); res.innerHTML = ''
        const item = el(`<div class="filechip"><span>✅ 已生成 PDF（${files.length} 页）</span><button class="btn ghost sm" data-dl>下载</button></div>`)
        item.querySelector('[data-dl]').onclick = () => downloadUrlFrom(url, '图片转PDF_' + Date.now() + '.pdf')
        res.appendChild(item)
        status.textContent = '完成'
      } catch (e) { status.className = 'status err'; status.textContent = '生成失败：' + (e.message || e) }
    }
    v.appendChild(card)
  }

  // ===================== 去水印 =====================
  function renderWatermark(v) {
    const PRESETS = {
      doubao: { x: 0.78, y: 0.90, w: 0.20, h: 0.085 },
      douyin: { x: 0.03, y: 0.88, w: 0.18, h: 0.075 },
      kuaishou: { x: 0.03, y: 0.05, w: 0.20, h: 0.065 },
      xiaohongshu: { x: 0.42, y: 0.46, w: 0.16, h: 0.075 }
    }
    const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlmb2htZWZ6bmVxd2N2bHhteXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyODc2OTcsImV4cCI6MjA5OTg2MzY5N30.GOGD81UzWoGqgzAC0Idb9kyt-EW9-Rwm1_K14SYcyRo'
    const card = el(`<div class="card">
      <h3>去水印</h3>
      <div class="chips" id="wmMode">
        <span class="chip active" data-m="image">图片去水印</span>
        <span class="chip" data-m="doubao">豆包/千问链接</span>
        <span class="chip" data-m="video">视频上传</span>
      </div>
      <div id="wmBody"></div>
    </div>`)
    let mode = 'image'
    card.querySelector('#wmMode').onclick = e => {
      const c = e.target.closest('.chip'); if (!c) return
      card.querySelectorAll('#wmMode .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); mode = c.dataset.m; renderWmBody()
    }
    const body = card.querySelector('#wmBody')
    function renderWmBody() {
      body.innerHTML = ''
      if (mode === 'image') renderImageWm(body)
      else if (mode === 'doubao') renderDoubaoWm(body)
      else renderVideoWm(body)
    }
    function renderImageWm(b) {
      b.appendChild(el(`<div class="muted">选择图片，框选水印区域后应用。也可用平台预设自动定位（纯本地处理，不上传）。</div>`))
      const stage = el(`<div class="wm-stage" id="stage" style="display:none"><canvas id="cv"></canvas><div class="wm-sel" id="sel"></div></div>`)
      b.appendChild(stage)
      const ctrl = el(`<div>
        <input type="file" id="imgInput" accept="image/*" style="margin-top:10px"/>
        <div class="chips" style="margin-top:10px">
          <span class="chip" data-p="douyin">抖音预设</span>
          <span class="chip" data-p="kuaishou">快手预设</span>
          <span class="chip" data-p="doubao">豆包预设</span>
          <span class="chip" data-p="xiaohongshu">小红书预设</span>
        </div>
        <div class="chips" style="margin-top:8px">
          <span class="chip" data-sz="0.12">选区·小</span>
          <span class="chip active" data-sz="0.20">选区·中</span>
          <span class="chip" data-sz="0.30">选区·大</span>
        </div>
        <div class="chips" style="margin-top:8px">
          <span class="chip active" data-me="blur">模糊</span>
          <span class="chip" data-me="mosaic">马赛克</span>
          <span class="chip" data-me="crop">裁剪</span>
        </div>
        <button class="btn" id="apply">应用去水印</button>
        <div class="status" id="st"></div>
        <div id="res"></div>
      </div>`)
      b.appendChild(ctrl)
      let rect = { x: 0.4, y: 0.45, w: 0.2, h: 0.1 }, method = 'blur', imgEl = null
      const cv = stage.querySelector('#cv'), sel = stage.querySelector('#sel')
      function updateSel() { sel.style.left = (rect.x * 100) + '%'; sel.style.top = (rect.y * 100) + '%'; sel.style.width = (rect.w * 100) + '%'; sel.style.height = (rect.h * 100) + '%' }
      function drawImg() {
        if (!imgEl) return
        const maxEdge = 2000; const scale = Math.min(1, maxEdge / Math.max(imgEl.width, imgEl.height))
        const W = Math.round(imgEl.width * scale), H = Math.round(imgEl.height * scale)
        cv.width = W; cv.height = H
        cv.getContext('2d').drawImage(imgEl, 0, 0, W, H)
        stage.style.display = 'inline-block'
      }
      ctrl.querySelector('#imgInput').onchange = e => {
        const f = e.target.files[0]; if (!f) return
        const url = URL.createObjectURL(f)
        imgEl = new Image(); imgEl.onload = () => { drawImg(); updateSel() }; imgEl.src = url
      }
      ctrl.querySelector('[data-p]').parentElement.onclick = e => { const c = e.target.closest('[data-p]'); if (!c) return; const p = PRESETS[c.dataset.p]; if (p) rect = { ...p }; updateSel() }
      ctrl.querySelectorAll('[data-sz]').forEach(ch => ch.onclick = () => { const s = parseFloat(ch.dataset.sz); const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2; rect = { x: cx - s / 2, y: cy - s / 2, w: s, h: s * 0.5 }; if (rect.x < 0) rect.x = 0; if (rect.y < 0) rect.y = 0; updateSel() })
      ctrl.querySelectorAll('[data-me]').forEach(ch => ch.onclick = () => { ctrl.querySelectorAll('[data-me]').forEach(x => x.classList.remove('active')); ch.classList.add('active'); method = ch.dataset.me })
      let drag = null
      sel.addEventListener('pointerdown', e => { drag = { sx: e.clientX, sy: e.clientY, rx: rect.x, ry: rect.y }; sel.setPointerCapture(e.pointerId); e.preventDefault() })
      sel.addEventListener('pointermove', e => { if (!drag) return; const r = stage.getBoundingClientRect(); const dx = (e.clientX - drag.sx) / r.width, dy = (e.clientY - drag.sy) / r.height; rect.x = Math.max(0, Math.min(1 - rect.w, drag.rx + dx)); rect.y = Math.max(0, Math.min(1 - rect.h, drag.ry + dy)); updateSel() })
      sel.addEventListener('pointerup', () => { drag = null })
      ctrl.querySelector('#apply').onclick = () => {
        if (!imgEl) return toast('请先选择图片')
        const st = ctrl.querySelector('#st'); st.className = 'status'; st.textContent = '处理中…'
        try {
          const W = cv.width, H = cv.height, ctx = cv.getContext('2d')
          if (method === 'crop') {
            const cw = Math.round(rect.w * W), ch = Math.round(rect.h * H), sx = Math.round(rect.x * W), sy = Math.round(rect.y * H)
            const nc = document.createElement('canvas'); nc.width = cw; nc.height = ch; nc.getContext('2d').drawImage(cv, sx, sy, cw, ch, 0, 0, cw, ch)
            showResult(nc)
          } else {
            const sx = Math.max(0, Math.floor(rect.x * W)), sy = Math.max(0, Math.floor(rect.y * H))
            const sw = Math.min(W - sx, Math.round(rect.w * W)), sh = Math.min(H - sy, Math.round(rect.h * H))
            if (sw > 0 && sh > 0) {
              const region = ctx.getImageData(sx, sy, sw, sh)
              if (method === 'blur') { const radius = Math.max(3, Math.round(Math.min(sw, sh) * 0.06)); for (let k = 0; k < 3; k++) WM.boxBlur(region, radius) }
              else { const block = Math.max(6, Math.round(Math.min(sw, sh) / 18)); WM.mosaic(region, block) }
              ctx.putImageData(region, sx, sy)
            }
            showResult(cv)
          }
          st.className = 'status ok'; st.textContent = '去水印完成'
        } catch (err) { st.className = 'status err'; st.textContent = '处理出错：' + (err.message || err) }
      }
      function showResult(canvas) {
        canvas.toBlob(b => {
          const url = URL.createObjectURL(b); const res = ctrl.querySelector('#res'); res.innerHTML = ''
          const item = el(`<div class="filechip"><span>✅ 已处理</span><button class="btn ghost sm" data-dl>下载</button></div>`)
          item.querySelector('[data-dl]').onclick = () => downloadUrlFrom(url, '去水印_' + Date.now() + '.png')
          res.appendChild(item)
          const img = el('<img class="result-img" style="margin-top:10px"/>'); img.src = url; res.appendChild(img)
        }, 'image/png')
      }
    }
    function renderDoubaoWm(b) {
      b.appendChild(el(`<div class="muted">粘贴豆包/千问分享链接，服务端解析无水印原片（依赖 watermark-remove 服务）。</div>`))
      const box = el(`<div>
        <textarea id="dbUrl" placeholder="https://doubao.com/s/... 或千问链接"></textarea>
        <button class="btn" id="dbParse">解析无水印原片</button>
        <div class="status" id="st"></div>
        <div id="res"></div>
      </div>`)
      b.appendChild(box)
      box.querySelector('#dbParse').onclick = async () => {
        const url = box.querySelector('#dbUrl').value.trim(); if (!url) return toast('请输入链接')
        const st = box.querySelector('#st'); st.className = 'status'; st.textContent = '解析中…'
        const api = Extract.getApiUrl().replace(/\/video-extract$/, '/watermark-remove')
        try {
          const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }, body: JSON.stringify({ action: 'parse', url }) })
          const d = await res.json()
          if (d.success && d.mediaUrl) {
            RecordsStore.addRecord({ type: 'doubao', platform: 'doubao', title: (d.type === 'video' ? '豆包无水印原片' : '豆包无水印原图'), url: d.mediaUrl })
            const resBox = box.querySelector('#res'); resBox.innerHTML = ''
            if (d.type === 'video') resBox.appendChild(el(`<video src="${esc(d.mediaUrl)}" controls playsinline style="margin-top:10px"></video>`))
            else resBox.appendChild(el(`<img class="result-img" src="${esc(d.mediaUrl)}" style="margin-top:10px"/>`))
            const item = el(`<div class="filechip"><span>✅ 已获取无水印原片</span><button class="btn ghost sm" data-dl>下载</button></div>`)
            item.querySelector('[data-dl]').onclick = () => downloadUrlFrom(d.mediaUrl, 'doubao_' + Date.now() + (d.type === 'video' ? '.mp4' : '.png'))
            resBox.appendChild(item)
            st.className = 'status ok'; st.textContent = ''
          } else { st.className = 'status err'; st.textContent = d.message || '解析失败' }
        } catch (e) { st.className = 'status err'; st.textContent = '网络错误：' + (e.message || e) }
      }
    }
    function renderVideoWm(b) {
      b.appendChild(el(`<div class="muted">上传本地视频去水印（需 watermark-remove 服务端 + ffmpeg，未部署则不可用）。默认按豆包水印位置处理。</div>`))
      const box = el(`<div>
        <input type="file" id="vidInput" accept="video/*" style="margin-top:10px"/>
        <div class="chips" style="margin-top:8px">
          <span class="chip active" data-me="blur">模糊</span>
          <span class="chip" data-me="mosaic">马赛克</span>
        </div>
        <button class="btn" id="up">上传并去水印</button>
        <div class="status" id="st"></div>
        <div id="res"></div>
      </div>`)
      b.appendChild(box)
      let method = 'blur'
      box.querySelectorAll('[data-me]').forEach(ch => ch.onclick = () => { box.querySelectorAll('[data-me]').forEach(x => x.classList.remove('active')); ch.classList.add('active'); method = ch.dataset.me })
      box.querySelector('#up').onclick = async () => {
        const f = box.querySelector('#vidInput').files[0]; if (!f) return toast('请先选视频')
        const st = box.querySelector('#st'); st.className = 'status'; st.textContent = '上传处理中…'
        const api = Extract.getApiUrl().replace(/\/video-extract$/, '/watermark-remove')
        const fd = new FormData(); fd.append('file', f); fd.append('x', '0.78'); fd.append('y', '0.90'); fd.append('w', '0.20'); fd.append('h', '0.085'); fd.append('method', method)
        try {
          const res = await fetch(api, { method: 'POST', headers: { 'Authorization': 'Bearer ' + ANON, 'apikey': ANON }, body: fd })
          const d = await res.json()
          if (d.success && d.resultUrl) {
            const resBox = box.querySelector('#res'); resBox.innerHTML = ''
            resBox.appendChild(el(`<video src="${esc(d.resultUrl)}" controls playsinline style="margin-top:10px"></video>`))
            const item = el(`<div class="filechip"><span>✅ 已处理</span><button class="btn ghost sm" data-dl>下载</button></div>`)
            item.querySelector('[data-dl]').onclick = () => downloadUrlFrom(d.resultUrl, '去水印视频_' + Date.now() + '.mp4')
            resBox.appendChild(item)
            st.className = 'status ok'; st.textContent = ''
          } else { st.className = 'status err'; st.textContent = d.message || '处理失败' }
        } catch (e) { st.className = 'status err'; st.textContent = '网络错误：' + (e.message || e) + '（需部署 watermark-remove）' }
      }
    }
    v.appendChild(card)
    renderWmBody()
  }

  // ===================== 智能压缩 =====================
  function renderCompress(v) {
    const card = el(`<div class="card">
      <h3>智能压缩</h3>
      <div class="chips" id="cMode">
        <span class="chip active" data-m="image">图片</span>
        <span class="chip" data-m="pdf">PDF</span>
        <span class="chip" data-m="pptx">PPTX</span>
      </div>
      <div class="muted" id="cTip" style="margin-top:10px"></div>
      <input type="file" id="cFile" style="margin-top:10px" />
      <div id="cList"></div>
      <div style="margin-top:12px">
        <div class="muted">压缩质量：<span id="qVal">60%</span>（越低体积越小）</div>
        <input type="range" id="qRange" min="20" max="90" value="60" style="width:100%;margin-top:6px" />
      </div>
      <button class="btn" id="cGo">开始压缩</button>
      <div class="track hidden" id="cTrack"><div class="fill" id="cFill"></div></div>
      <div class="status" id="cSt"></div>
      <div id="cRes"></div>
    </div>`)
    const TIPS = {
      image: '选择 JPG/PNG 图片，重新编码降低体积（可多次）。透明区将填白底。',
      pdf: '选择 PDF，自动定位内嵌 JPEG 图片重压，不改排版。仅对图片型 PDF 有效。',
      pptx: '选择 PPTX，重压幻灯片内 JPEG 图片后重新打包。'
    }
    const ACCEPT = { image: 'image/*', pdf: 'application/pdf,.pdf', pptx: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation' }
    let mode = 'image', file = null
    const tip = card.querySelector('#cTip'), fileInput = card.querySelector('#cFile'), listEl = card.querySelector('#cList')
    const qRange = card.querySelector('#qRange'), qVal = card.querySelector('#qVal')
    const st = card.querySelector('#cSt'), res = card.querySelector('#cRes'), track = card.querySelector('#cTrack'), fill = card.querySelector('#cFill')
    function applyMode() { tip.textContent = TIPS[mode]; fileInput.accept = ACCEPT[mode]; file = null; listEl.innerHTML = ''; res.innerHTML = ''; st.textContent = '' }
    card.querySelector('#cMode').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; card.querySelectorAll('#cMode .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); mode = c.dataset.m; applyMode() }
    qRange.oninput = () => qVal.textContent = qRange.value + '%'
    fileInput.onchange = e => {
      file = e.target.files[0]; listEl.innerHTML = ''; res.innerHTML = ''; st.textContent = ''
      if (file) listEl.appendChild(el(`<div class="filechip"><span>📎 ${esc(file.name)}（${fmtSize(file.size)}）</span></div>`))
    }
    card.querySelector('#cGo').onclick = async () => {
      if (!file) return toast('请先选择文件')
      const quality = Math.max(0.2, Math.min(0.9, parseInt(qRange.value, 10) / 100))
      st.className = 'status'; st.textContent = '压缩中…'; res.innerHTML = ''
      track.classList.remove('hidden'); fill.classList.add('indet'); fill.style.width = '40%'
      try {
        const ab = await file.arrayBuffer()
        let outBytes, outName, outType, saved, origSize = file.size
        if (mode === 'image') {
          const r = await Compress.compressImageFile(file, { quality })
          outBytes = await r.blob.arrayBuffer(); outBytes = new Uint8Array(outBytes)
          saved = r.saved; outName = baseName(file.name) + '_压缩.jpg'; outType = 'image/jpeg'
        } else if (mode === 'pdf') {
          const r = await Compress.compressPdf(ab, { quality })
          outBytes = r.data; saved = r.saved; outName = baseName(file.name) + '_压缩.pdf'; outType = 'application/pdf'
        } else {
          const r = await Compress.compressPptx(ab, { quality })
          outBytes = r.data; saved = r.saved; outName = baseName(file.name) + '_压缩.pptx'; outType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        }
        fill.classList.remove('indet'); fill.style.width = '100%'
        const newSize = outBytes.length
        if (saved <= 0 && mode !== 'image') { st.className = 'status'; st.textContent = '未找到可压缩的 JPEG 图片，文件已是最优或非图片型。' }
        const url = URL.createObjectURL(new Blob([outBytes], { type: outType }))
        const pct = origSize > 0 ? Math.round((1 - newSize / origSize) * 100) : 0
        const item = el(`<div class="filechip"><span>✅ ${fmtSize(origSize)} → ${fmtSize(newSize)}（省 ${pct}%）</span><button class="btn ghost sm" data-dl>下载</button></div>`)
        item.querySelector('[data-dl]').onclick = () => downloadUrlFrom(url, outName)
        res.appendChild(item)
        st.className = 'status ok'; st.textContent = '完成'
      } catch (e) {
        st.className = 'status err'; st.textContent = '压缩失败：' + (e.message || e)
      } finally { setTimeout(() => { track.classList.add('hidden'); fill.style.width = '0' }, 600) }
    }
    applyMode()
    v.appendChild(card)
  }
  function fmtSize(n) { if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(2) + ' MB' }
  function baseName(name) { return String(name || 'file').replace(/\.[^.]+$/, '') }

  // ===================== AI 生成（文生视频 / AI 生图） =====================
  function fileToDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) }) }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
  function mapStage(s) { const m = { queued: '排队中', pending: '排队中', waiting: '排队中', processing: '生成中', generating: '生成中', running: '生成中', rendering: '生成中', completed: '完成', failed: '失败' }; return m[(s || 'queued').toLowerCase()] || s }

  function renderAi(v) {
    const L = (window.Agnes && Agnes.getLockedConfig) ? Agnes.getLockedConfig() : { videoQuality: '1080p', videoFps: 24, videoLockedSeconds: 7, videoLockedFrames: 169 }
    const card = el(`<div class="card">
      <div class="chips" id="aiTab">
        <span class="chip active" data-t="video">文生视频</span>
        <span class="chip" data-t="image">AI 生图</span>
      </div>
      <div id="aiBody"></div>
    </div>`)
    let tab = 'video'
    const body = card.querySelector('#aiBody')
    card.querySelector('#aiTab').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; card.querySelectorAll('#aiTab .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); tab = c.dataset.t; render() }
    function ratioChips(active) { return ['16:9','9:16','1:1','4:3','3:4','3:2','2:3'].map(r => `<span class="chip${r===active?' active':''}" data-r="${r}">${r}</span>`).join('') }

    // ---------- AI 优化面板（共用）----------
    function enhanceBlock(getText, type, targetSetter) {
      const wrap = el(`<div>
        <button class="btn ghost sm" id="enBtn" style="width:auto">✨ AI 优化提示词</button>
        <div id="enPanel"></div>
      </div>`)
      const panel = wrap.querySelector('#enPanel')
      wrap.querySelector('#enBtn').onclick = async () => {
        const text = (getText() || '').trim(); if (!text) return toast('请先输入描述')
        panel.innerHTML = ''
        const box = el(`<div class="enhance"><button class="x" id="enX">✕</button><h4>AI 提示词优化中…</h4><div class="track"><div class="fill indet"></div></div></div>`)
        panel.appendChild(box)
        box.querySelector('#enX').onclick = () => { panel.innerHTML = '' }
        try {
          const r = await Agnes.agnesRequest('enhance-prompt', { prompt: text, type })
          const d = r.details || {}
          const sug = (r.suggestions || []).map(s => '• ' + esc(s)).join('<br>')
          panel.innerHTML = ''
          const p = el(`<div class="enhance">
            <button class="x" id="enX">✕</button>
            <h4>✨ AI 优化建议</h4>
            ${r.critique ? `<div class="kw">${esc(r.critique)}</div>` : ''}
            ${sug ? `<span class="lbl">改进建议</span><div class="kw">${sug}</div>` : ''}
            ${r.improved_prompt ? `<span class="lbl">优化后提示词</span><div class="kw" id="enImp">${esc(r.improved_prompt)}</div>` : ''}
            ${d.camera && d.camera !== '无' ? `<span class="lbl">运镜</span><div class="kw">${esc(d.camera)}</div>` : ''}
            ${d.style && d.style !== '无' ? `<span class="lbl">风格</span><div class="kw">${esc(d.style)}</div>` : ''}
            ${d.negative && d.negative !== '无' ? `<span class="lbl">反向提示词</span><div class="kw">${esc(d.negative)}</div>` : ''}
            <div class="row" style="margin-top:12px">
              ${r.improved_prompt ? '<button class="btn ghost sm" id="enUse" style="width:auto">用优化版替换</button>' : ''}
              ${r.improved_prompt ? '<button class="btn ghost sm" id="enCopy" style="width:auto">复制</button>' : ''}
            </div>
          </div>`)
          panel.appendChild(p)
          p.querySelector('#enX').onclick = () => { panel.innerHTML = '' }
          if (r.improved_prompt) {
            p.querySelector('#enUse').onclick = () => { targetSetter(r.improved_prompt); toast('已替换为优化版') }
            p.querySelector('#enCopy').onclick = () => navigator.clipboard.writeText(r.improved_prompt).then(() => toast('已复制')).catch(() => toast('复制失败'))
          }
        } catch (e) { panel.innerHTML = ''; const er = el(`<div class="enhance"><button class="x" id="enX">✕</button><div class="kw" style="color:var(--danger)">优化失败：${esc(e.message || e)}</div></div>`); panel.appendChild(er); er.querySelector('#enX').onclick = () => panel.innerHTML = '' }
      }
      return wrap
    }
    // 参考图上传块
    function refUpload(onData) {
      const wrap = el(`<div style="margin-top:10px">
        <input type="file" accept="image/*" id="refInput" />
        <div id="refPrev"></div>
      </div>`)
      const prev = wrap.querySelector('#refPrev')
      wrap.querySelector('#refInput').onchange = async e => {
        const f = e.target.files[0]; if (!f) { onData(''); prev.innerHTML = ''; return }
        const dataUrl = await fileToDataURL(f)
        onData(dataUrl)
        prev.innerHTML = ''
        const box = el(`<div class="filechip"><img src="${dataUrl}" style="width:44px;height:44px;object-fit:cover;border-radius:8px"/><span>参考图已选</span><button class="btn ghost sm" data-rm>移除</button></div>`)
        box.querySelector('[data-rm]').onclick = () => { onData(''); prev.innerHTML = ''; wrap.querySelector('#refInput').value = '' }
        prev.appendChild(box)
      }
      return wrap
    }

    function render() { body.innerHTML = ''; if (tab === 'video') renderVideo(); else renderImage() }

    // ---------- 文生视频 ----------
    function renderVideo() {
      let ratio = '16:9', refB64 = ''
      const box = el(`<div>
        <div class="hint">锁定输出：${L.videoQuality} · ${L.videoFps}fps · ${L.videoLockedSeconds}s（${L.videoLockedFrames} 帧）。4 个 key 自动轮询。</div>
        <textarea id="vp" placeholder="描述你想要的视频画面，如：日落时分海边奔跑的金毛犬，电影感慢镜头…"></textarea>
        <div class="muted" style="margin-top:10px">画面比例</div>
        <div class="chips" id="vr" style="margin-top:6px">${ratioChips(ratio)}</div>
        <textarea id="vn" placeholder="（可选）反向提示词：不希望出现的元素" style="margin-top:10px;min-height:52px"></textarea>
        <div class="muted" style="margin-top:10px">参考图（可选，用于图生视频）</div>
      </div>`)
      box.querySelector('#vr').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; box.querySelectorAll('#vr .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); ratio = c.dataset.r }
      box.appendChild(refUpload(b => refB64 = b))
      box.appendChild(enhanceBlock(() => box.querySelector('#vp').value, 'video', t => box.querySelector('#vp').value = t))
      const genBtn = el('<button class="btn" id="vgen">生成视频</button>'); box.appendChild(genBtn)
      const statusCard = el('<div id="vStatus"></div>'); box.appendChild(statusCard)
      const resBox = el('<div id="vRes"></div>'); box.appendChild(resBox)
      genBtn.onclick = async () => {
        const prompt = box.querySelector('#vp').value.trim(); if (!prompt) return toast('请输入视频描述')
        genBtn.disabled = true; resBox.innerHTML = ''
        statusCard.innerHTML = ''
        const sc = el(`<div class="enhance"><h4 id="vStage">正在创建任务…</h4><div class="track"><div class="fill indet" id="vFill"></div></div><div class="muted" id="vMeta" style="margin-top:8px"></div></div>`)
        statusCard.appendChild(sc)
        const stageEl = sc.querySelector('#vStage'), fillEl = sc.querySelector('#vFill'), metaEl = sc.querySelector('#vMeta')
        try {
          const res = await Agnes.agnesRequest('video', { prompt, ratio, negative_prompt: box.querySelector('#vn').value.trim(), image: refB64 || undefined })
          metaEl.textContent = `账号 ${(res.keyIndex ?? 0) + 1}/${res.keyTotal || 4}（${res.keyMask || ''}）`
          stageEl.textContent = '任务已排队，正在生成…'
          const url = await pollVideo(res.task_id, res.video_id, res.keyIndex, stageEl, fillEl)
          stageEl.textContent = '✅ 生成完成'; fillEl.classList.remove('indet'); fillEl.style.width = '100%'
          RecordsStore.addRecord({ type: 'ai-video', platform: 'ai', title: prompt.slice(0, 20), url })
          const vitem = el(`<video src="${esc(url)}" controls playsinline style="margin-top:12px"></video>`)
          resBox.appendChild(vitem)
          const dl = el(`<div class="filechip"><span>✅ 视频已生成</span><button class="btn ghost sm" data-dl>下载</button></div>`)
          dl.querySelector('[data-dl]').onclick = () => window.open(url, '_blank')
          resBox.appendChild(dl)
        } catch (e) { stageEl.textContent = '❌ ' + (e.message || '生成失败'); fillEl.classList.remove('indet'); fillEl.style.width = '0' }
        finally { genBtn.disabled = false }
      }
      body.appendChild(box)
    }
    async function pollVideo(taskId, videoId, keyIndex, stageEl, fillEl) {
      let attempts = 0
      const maxAttempts = 90 // 5s*90 = 7.5min
      while (attempts < maxAttempts) {
        await sleep(5000); attempts++
        const res = await Agnes.agnesRequest('video-status', { task_id: taskId, video_id: videoId, keyIndex })
        const d = res.data || {}
        if (!d || !d.status) continue
        const stage = mapStage(d.status)
        let progress = 0
        if (d.progress != null && !isNaN(Number(d.progress))) progress = Math.round(Number(d.progress))
        else if (d.percent != null && !isNaN(Number(d.percent))) progress = Math.round(Number(d.percent))
        if ((d.status || '').toLowerCase() === 'completed') progress = 100
        stageEl.textContent = progress > 0 ? `${stage} ${progress}%` : stage
        if (progress > 0) { fillEl.classList.remove('indet'); fillEl.style.width = progress + '%' }
        if (d.status === 'completed') return d.url || d.remixed_from_video_id || ''
        if (d.status === 'failed') throw new Error((d.error && d.error.message) || '视频生成失败')
      }
      throw new Error('等待超时，请稍后重试')
    }

    // ---------- AI 生图 ----------
    function renderImage() {
      let ratio = '16:9', resolution = '1080p', refB64 = ''
      const box = el(`<div>
        <div class="hint">分辨率 1080p（快）/ 4K（清晰但慢）。4 个 key 自动轮询。</div>
        <textarea id="ip" placeholder="描述你想要的画面，如：赛博朋克风格的雨夜街道，霓虹灯反射…"></textarea>
        <div class="muted" style="margin-top:10px">画面比例</div>
        <div class="chips" id="ir" style="margin-top:6px">${ratioChips(ratio)}</div>
        <div class="muted" style="margin-top:10px">分辨率</div>
        <div class="chips" id="ires" style="margin-top:6px">
          <span class="chip active" data-res="1080p">1080p</span>
          <span class="chip" data-res="4K">4K</span>
        </div>
        <div class="muted" style="margin-top:10px">参考图（可选，用于图生图 / 修改）</div>
      </div>`)
      box.querySelector('#ir').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; box.querySelectorAll('#ir .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); ratio = c.dataset.r }
      box.querySelector('#ires').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; box.querySelectorAll('#ires .chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); resolution = c.dataset.res }
      box.appendChild(refUpload(b => refB64 = b))
      box.appendChild(enhanceBlock(() => box.querySelector('#ip').value, 'image', t => box.querySelector('#ip').value = t))
      const genBtn = el('<button class="btn" id="igen">生成图片</button>'); box.appendChild(genBtn)
      const statusCard = el('<div id="iStatus"></div>'); box.appendChild(statusCard)
      const resBox = el('<div id="iRes"></div>'); box.appendChild(resBox)
      genBtn.onclick = async () => {
        const prompt = box.querySelector('#ip').value.trim(); if (!prompt) return toast('请输入画面描述')
        genBtn.disabled = true; resBox.innerHTML = ''; statusCard.innerHTML = ''
        const sc = el(`<div class="enhance"><h4 id="iStage">生成中…</h4><div class="track"><div class="fill indet"></div></div><div class="muted" id="iMeta" style="margin-top:8px"></div></div>`)
        statusCard.appendChild(sc)
        const stageEl = sc.querySelector('#iStage'), metaEl = sc.querySelector('#iMeta')
        const t0 = Date.now(); const timer = setInterval(() => stageEl.textContent = '生成中… ' + Math.floor((Date.now() - t0) / 1000) + 's', 1000)
        try {
          const res = await Agnes.agnesRequest('image', { prompt, ratio, resolution, response_format: 'url', image: refB64 || undefined })
          clearInterval(timer)
          const url = res.data && res.data.data && res.data.data[0] && res.data.data[0].url
          if (!url) throw new Error('未返回图片地址')
          stageEl.textContent = '✅ 完成'; metaEl.textContent = `账号 ${(res.keyIndex ?? 0) + 1}/${res.keyTotal || 4} · ${res.size || ''} · ${res.resolution || resolution}`
          RecordsStore.addRecord({ type: 'ai-image', platform: 'ai', title: prompt.slice(0, 20), url })
          resBox.appendChild(el(`<img class="result-img" src="${esc(url)}" style="margin-top:12px"/>`))
          const dl = el(`<div class="filechip"><span>✅ 图片已生成</span><button class="btn ghost sm" data-dl>下载 / 打开</button></div>`)
          dl.querySelector('[data-dl]').onclick = () => window.open(url, '_blank')
          resBox.appendChild(dl)
        } catch (e) { clearInterval(timer); const msg = (e.message || '生成失败'); const tip = /timeout|超时/.test(msg) ? '（超时：建议改 1080p 或重试）' : ''; stageEl.textContent = '❌ ' + msg + tip }
        finally { genBtn.disabled = false }
      }
      body.appendChild(box)
    }

    render()
    v.appendChild(card)
  }

  router()
})()
