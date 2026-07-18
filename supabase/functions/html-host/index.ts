// Supabase Edge Function: html-host
// 托管 HTML 文件，确保正确的 Content-Type
// 支持匿名访问（不需要 Authorization 头）

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>视频提取器</title>
  <style>
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      margin: 0;
      padding: 0;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px 16px;
    }
    
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    
    .header h1 {
      font-size: 28px;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    
    .input-group {
      margin-bottom: 20px;
    }
    
    .input-group input {
      width: 100%;
      padding: 12px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
    }
    
    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
      color: white;
    }
    
    .result {
      margin-top: 20px;
      padding: 16px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      display: none;
    }
    
    .result a {
      color: var(--accent-blue);
      display: inline-block;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎬 视频提取器</h1>
      <p style="color: var(--text-secondary);">支持抖音、B站、小红书、快手</p>
    </div>
    
    <div class="input-group">
      <input type="text" id="video-url" placeholder="粘贴视频链接">
    </div>
    
    <button class="btn" id="extract-btn">提取视频</button>
    
    <div id="result" class="result">
      <p id="result-content"></p>
    </div>
  </div>
  
  <script>
    document.getElementById('extract-btn').addEventListener('click', async () => {
      const url = document.getElementById('video-url').value.trim();
      if (!url) { alert('请输入视频链接'); return; }
      
      const btn = document.getElementById('extract-btn');
      btn.disabled = true;
      btn.textContent = '提取中...';
      
      try {
        const res = await fetch('https://ifohmefzneqwcvlxmyzv.supabase.co/functions/v1/video-extract', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({url, platform: null})
        });
        const data = await res.json();
        const resultDiv = document.getElementById('result');
        const resultContent = document.getElementById('result-content');
        resultDiv.style.display = 'block';
        
        if (data.success) {
          resultContent.innerHTML = '<p><strong>' + data.video.title + '</strong></p>' +
            '<p>时长: ' + data.video.duration + ' | 分辨率: ' + data.video.resolution + '</p>' +
            '<a href="' + data.video.downloadUrl + '" target="_blank">⬇️ 点击下载视频</a>';
        } else {
          resultContent.innerHTML = '<p style="color: var(--error);">' + data.message + '</p>';
        }
      } catch (e) {
        alert('提取失败: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '提取视频';
      }
    });
  </script>
</body>
</html>`;

Deno.serve(async (req) => {
  // 支持 GET 请求直接返回 HTML
  if (req.method === 'GET') {
    return new Response(HTML_CONTENT, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  // 支持 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  
  // 其他请求返回 405
  return new Response(JSON.stringify({error: 'Method not allowed'}), {
    status: 405,
    headers: {'Content-Type': 'application/json'},
  });
});
