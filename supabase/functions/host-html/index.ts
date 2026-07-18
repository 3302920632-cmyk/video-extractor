Deno.serve(async (req) => {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>视频提取器</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-card: rgba(255, 255, 255, 0.03);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-primary: #ffffff;
      --text-secondary: #8888aa;
      --accent-blue: #6366f1;
      --accent-purple: #8b5cf6;
      --accent-cyan: #06b6d4;
      --success: #10b981;
      --error: #ef4444;
      --warning: #f59e0b;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
    }

    input, button {
      -webkit-appearance: none;
      -moz-appearance: none;
      appearance: none;
    }

    .bg-glow {
      position: fixed;
      top: -200px;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }

    .container {
      max-width: 640px;
      margin: 0 auto;
      padding: 16px 14px 40px;
      position: relative;
      z-index: 1;
    }

    .header {
      text-align: center;
      margin-bottom: 24px;
    }

    .header h1 {
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple), var(--accent-cyan));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 6px;
    }

    .header p {
      color: var(--text-secondary);
      font-size: 13px;
    }

    .platform-tags {
      display: flex;
      justify-content: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 16px;
    }

    .platform-tag {
      padding: 6px 14px;
      border-radius: 20px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      font-size: 13px;
      transition: all 0.3s;
    }

    .platform-tag:hover {
      border-color: var(--accent-blue);
      background: rgba(99, 102, 241, 0.1);
    }

    .input-section {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 24px;
    }

    .input-wrapper {
      display: flex;
      gap: 10px;
      flex-direction: column;
    }

    @media (min-width: 640px) {
      .input-wrapper {
        flex-direction: row;
      }
    }

    .url-input {
      flex: 1;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      font-size: 15px;
      outline: none;
      transition: border-color 0.3s;
    }

    .url-input:focus {
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    }

    .url-input::placeholder {
      color: var(--text-secondary);
    }

    .extract-btn {
      padding: 12px 24px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
      color: white;
      font-size: 15px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: all 0.3s;
      white-space: nowrap;
    }

    .extract-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
    }

    .extract-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .progress-bar {
      height: 3px;
      background: var(--bg-secondary);
      border-radius: 2px;
      margin-top: 12px;
      overflow: hidden;
      display: none;
    }

    .progress-bar.active {
      display: block;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple));
      border-radius: 2px;
      animation: loading 1.5s ease-in-out infinite;
    }

    @keyframes loading {
      0% { width: 0%; margin-left: 0; }
      50% { width: 60%; margin-left: 20%; }
      100% { width: 0%; margin-left: 100%; }
    }

    .result-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 24px;
      animation: fadeInUp 0.4s ease;
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .video-preview {
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 16px;
    }

    .video-preview video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .video-info {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      padding: 14px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      margin-bottom: 8px;
    }

    @media (min-width: 640px) {
      .video-info {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .info-item .label {
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 400;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.7;
    }

    .info-item .value {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .info-item .value.loading {
      color: var(--text-secondary);
      font-weight: 400;
    }

    .action-buttons {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 16px;
    }

    .btn-download {
      flex: 1.2;
      min-width: 140px;
      padding: 14px 24px;
      border-radius: 14px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%);
      color: white;
      font-size: 15px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      position: relative;
      overflow: hidden;
    }

    .btn-download::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      transition: left 0.6s;
    }

    .btn-download:hover::before {
      left: 100%;
    }

    .btn-download:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(99, 102, 241, 0.5);
    }

    .btn-download:active {
      transform: translateY(0);
    }

    .btn-download .icon {
      font-size: 18px;
    }

    .btn-secondary-action {
      flex: 1;
      min-width: 140px;
      padding: 14px 24px;
      border-radius: 14px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .btn-secondary-action:hover {
      border-color: var(--accent-blue);
      background: rgba(99, 102, 241, 0.1);
    }

    .toast-container {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }

    .toast {
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      animation: toastIn 0.3s ease, toastOut 0.3s ease 2.7s forwards;
      pointer-events: auto;
      backdrop-filter: blur(10px);
      max-width: 90vw;
      text-align: center;
    }

    .toast.success {
      background: rgba(16, 185, 129, 0.9);
      color: white;
    }

    .toast.error {
      background: rgba(239, 68, 68, 0.9);
      color: white;
    }

    .toast.info {
      background: rgba(99, 102, 241, 0.9);
      color: white;
    }

    @keyframes toastIn {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes toastOut {
      from { opacity: 1; }
      to { opacity: 0; transform: translateY(-10px); }
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-secondary);
    }

    .empty-state .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state p {
      font-size: 14px;
    }

    .spinner {
      display: inline-block;
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="bg-glow"></div>
  <div class="toast-container" id="toastContainer"></div>

  <div class="container">
    <div class="header">
      <h1>🎬 视频提取器</h1>
      <p>输入视频链接，一键提取、下载</p>
      <div class="platform-tags">
        <span class="platform-tag">抖音</span>
        <span class="platform-tag">B站</span>
        <span class="platform-tag">小红书</span>
        <span class="platform-tag">快手</span>
      </div>
    </div>

    <div class="input-section">
      <div class="input-wrapper">
        <input type="text" class="url-input" id="urlInput" 
               placeholder="粘贴抖音/B站/小红书/快手视频分享链接..." 
               onkeypress="if(event.key==='Enter')extract()">
        <button class="extract-btn" id="extractBtn" onclick="extract()">
          <span id="btnText">提取视频</span>
        </button>
      </div>
      <div class="progress-bar" id="progressBar">
        <div class="progress-fill"></div>
      </div>
    </div>

    <div id="resultArea"></div>

    <div class="empty-state" id="emptyState">
      <div class="icon">📥</div>
      <p>输入视频链接开始提取</p>
    </div>
  </div>

  <script>
    const API_URL = 'https://ifohmefzneqwcvlxmyzv.supabase.co/functions/v1/video-extract';
    const API_KEY = 'sb_publishable_WlWKsjVo_ACvP6map0KxVA_9ChQAGB0';

    function showToast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = \`toast \${type}\`;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }

    function extractUrl(text) {
      // 从分享文本中提取 http/https 链接
      const match = text.match(/https?:\\/\\/[^\\s\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef]+/i);
      return match ? match[0] : text.trim();
    }

    function detectPlatform(url) {
      if (url.includes('douyin.com') || url.includes('v.douyin.com')) return 'douyin';
      if (url.includes('bilibili.com') || url.includes('b23.tv')) return 'bilibili';
      if (url.includes('xiaohongshu.com') || url.includes('xhs.link')) return 'xiaohongshu';
      if (url.includes('kuaishou.com') || url.includes('ks.com')) return 'kuaishou';
      return null;
    }

    async function extract() {
      const rawInput = document.getElementById('urlInput').value.trim();
      if (!rawInput) {
        showToast('请输入视频链接', 'error');
        return;
      }

      const url = extractUrl(rawInput);
      const platform = detectPlatform(url);
      if (!platform) {
        showToast('暂不支持该平台，请检查链接', 'error');
        return;
      }

      const btn = document.getElementById('extractBtn');
      const btnText = document.getElementById('btnText');
      const progressBar = document.getElementById('progressBar');
      const emptyState = document.getElementById('emptyState');

      btn.disabled = true;
      btnText.innerHTML = '<span class="spinner"></span> 提取中...';
      progressBar.classList.add('active');
      emptyState.style.display = 'none';

      try {
        let video;
        if (platform === 'bilibili') {
          video = await extractBilibili(url);
        } else {
          const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': \`Bearer \${API_KEY}\`
            },
            body: JSON.stringify({ url, platform })
          });
          const data = await res.json();
          if (!data.success || !data.video) {
            throw new Error(data.message || '提取失败');
          }
          video = data.video;
        }

        if (video) {
          renderResult(video);
          showToast('视频提取成功！', 'success');
        } else {
          showToast('提取失败', 'error');
          emptyState.style.display = 'block';
        }
      } catch (e) {
        showToast(e.message || '网络错误，请检查连接', 'error');
        emptyState.style.display = 'block';
      } finally {
        btn.disabled = false;
        btnText.textContent = '提取视频';
        progressBar.classList.remove('active');
      }
    }

    async function extractBilibili(url) {
      const bvid = url.match(/BV[\\w]+/)?.[0];
      if (!bvid) throw new Error('无法识别B站视频链接');

      const viewResp = await fetch(\`https://api.bilibili.com/x/web-interface/view?bvid=\${bvid}\`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' }
      });
      const viewJson = await viewResp.json();
      if (viewJson.code !== 0 || !viewJson.data) throw new Error('无法获取视频信息');

      const d = viewJson.data;
      const playResp = await fetch(
        \`https://api.bilibili.com/x/player/playurl?avid=\${d.aid}&cid=\${d.cid}&qn=80&fnval=1&fourk=1\`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15', 'Referer': url } }
      );
      const playJson = await playResp.json();
      if (playJson.code !== 0 || !playJson.data) throw new Error('无法获取播放地址');

      let downloadUrl = '';
      const playData = playJson.data;

      if (playData.dash?.video && playData.dash.video.length > 0) {
        const best = playData.dash.video.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
        downloadUrl = best?.baseUrl || '';
      } else if (playData.durl && playData.durl.length > 0) {
        downloadUrl = playData.durl[0]?.url || '';
      }

      if (!downloadUrl) throw new Error('无法获取视频下载链接');

      return {
        title: d.title || 'B站视频',
        downloadUrl: downloadUrl,
        thumbnail: d.pic,
        duration: fmtDur(d.duration),
        resolution: playData.quality === 80 ? '1080p' : '720p',
        fps: d.frame_rate?.split(' ')[0] || '30',
        platform: 'bilibili'
      };
    }

    function fmtDur(sec) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return \`\${String(m).padStart(2, '0')}:\${String(s).padStart(2, '0')}\`;
    }

    function cleanUrl(url) {
      if (!url) return '';
      return url.replace(/\\\\u002F/g, '/').replace(/\\\\u0026/g, '&');
    }

    function renderResult(video) {
      const area = document.getElementById('resultArea');
      video.downloadUrl = cleanUrl(video.downloadUrl);
      video.thumbnail = cleanUrl(video.thumbnail);
      const safeTitle = (video.title || '视频').replace(/'/g, "\\\\'");
      area.innerHTML = \`
        <div class="result-card">
          <div class="video-preview">
            <video id="videoPlayer" controls poster="\${video.thumbnail || ''}" preload="metadata">
              <source src="\${video.downloadUrl}" type="video/mp4">
              您的浏览器不支持视频播放
            </video>
          </div>
          <div class="video-info">
            <div class="info-item">
              <span class="label">时长</span>
              <span class="value" id="info-duration">\${video.duration !== '-' && video.duration ? video.duration : '检测中...'}</span>
            </div>
            <div class="info-item">
              <span class="label">分辨率</span>
              <span class="value" id="info-resolution">\${video.resolution && video.resolution !== '-' ? video.resolution : '检测中...'}</span>
            </div>
            <div class="info-item">
              <span class="label">帧率</span>
              <span class="value" id="info-fps">\${video.fps && video.fps !== '-' ? video.fps + ' fps' : '检测中...'}</span>
            </div>
            <div class="info-item">
              <span class="label">文件大小</span>
              <span class="value" id="info-size">检测中...</span>
            </div>
          </div>
          <div class="action-buttons">
            <button class="btn-download" onclick="downloadVideo('\${video.downloadUrl}', '\${safeTitle}')">
              <span class="icon">⬇</span>
              <span>下载视频</span>
            </button>
            <button class="btn-secondary-action" onclick="copyLink('\${video.downloadUrl}')">
              🔗 复制链接
            </button>
          </div>
        </div>
      \`;

      const v = document.getElementById('videoPlayer');
      if (v) {
        v.addEventListener('loadedmetadata', () => {
          const dur = document.getElementById('info-duration');
          const res = document.getElementById('info-resolution');
          const fpsEl = document.getElementById('info-fps');
          const sizeEl = document.getElementById('info-size');

          if (dur && (video.duration === '-' || !video.duration)) {
            dur.textContent = fmtDur(v.duration);
          }

          if (res && v.videoWidth && v.videoHeight) {
            res.textContent = \`\${v.videoWidth}x\${v.videoHeight}\`;
          }

          if (fpsEl && (video.fps === '-' || !video.fps)) {
            const fps = v.webkitDecodedFrameCount && v.currentTime ? 
              Math.round(v.webkitDecodedFrameCount / v.currentTime) : '—';
            fpsEl.textContent = fps ? fps + ' fps' : '—';
          }

          if (sizeEl) {
            fetch(video.downloadUrl, { method: 'HEAD' })
              .then(r => {
                const len = r.headers.get('content-length');
                if (len) {
                  const mb = (parseInt(len) / 1024 / 1024).toFixed(1);
                  sizeEl.textContent = mb + ' MB';
                } else {
                  sizeEl.textContent = '—';
                }
              })
              .catch(() => { sizeEl.textContent = '—'; });
          }
        });
      }
    }

    function downloadVideo(url, title) {
      const a = document.createElement('a');
      a.href = url;
      a.download = title + '.mp4';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('开始下载...', 'success');
    }

    function copyLink(url) {
      navigator.clipboard.writeText(url)
        .then(() => showToast('链接已复制', 'success'))
        .catch(() => showToast('复制失败', 'error'));
    }
  </script>
</body>
</html>
`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});
