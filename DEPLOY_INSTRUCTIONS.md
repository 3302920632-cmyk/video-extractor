# 🚀 部署指南 - 3 步完成

你的 Supabase 项目信息：
- **Project URL**: `https://ifohmefzneqwcvlxmyzv.supabase.co`
- **Public Key**: `sb_publishable_WlWKsjVo_ACvP6map0KxVA_9ChQAGB0`

---

## 第 1 步：部署 Edge Function（5 分钟）

### 方式 A：通过 Dashboard 手动部署（最简单）

1. 打开 https://supabase.com/dashboard/project/ifohmefzneqwcvlxmyzv
2. 左侧菜单点击 **Edge Functions**
3. 点击 **New function**
4. Function name 填：`video-extract`
5. 点击 **Create and deploy**
6. 删除自动生成的代码，把下面这段粘贴进去：

<details>
<summary>点击查看需要粘贴的代码</summary>

```typescript
// Edge Function: video-extract
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

async function fetchWithOptions(url, options = {}) {
  const headers = { ...DEFAULT_HEADERS, ...options.headers };
  const resp = await fetch(url, { method: options.method || 'GET', headers, redirect: 'follow' });
  const data = await resp.text();
  return { data, headers: Object.fromEntries(resp.headers.entries()), statusCode: resp.status };
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function parseDouyin(url) {
  try {
    const { data: html } = await fetchWithOptions(url, {
      headers: { 'Referer': 'https://www.douyin.com/' },
    });
    const videoIdMatch = html.match(/videoId["']?\s*[:=]\s*["']([^"']+)["']/);
    const awemeIdMatch = html.match(/aweme_id["']?\s*[:=]\s*["']([^"']+)["']/);
    const videoId = videoIdMatch?.[1] || awemeIdMatch?.[1];
    if (!videoId) {
      const urlMatch = html.match(/["'](https?:\/\/[^\s"']*douyin[^\s"']*video[^\s"']+)["']/);
      if (urlMatch) return { title: '抖音视频', downloadUrl: urlMatch[1], thumbnail: '', duration: '01:00', resolution: '1080p', platform: 'douyin' };
      return null;
    }
    const { data: apiData } = await fetchWithOptions(`https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`, {
      headers: { 'Referer': url },
    });
    try {
      const json = JSON.parse(apiData);
      if (json.aweme_detail) {
        const detail = json.aweme_detail;
        const videoUrls = detail.video?.play_addr?.url_list || detail.video?.download_addr?.url_list || [];
        if (videoUrls.length > 0) {
          return { title: detail.desc || '抖音视频', downloadUrl: videoUrls[0], thumbnail: detail.video?.cover?.url_list?.[0] || '', duration: detail.duration ? formatDuration(detail.duration / 1000) : '01:00', resolution: '1080p', platform: 'douyin' };
        }
      }
    } catch (e) {}
    return null;
  } catch (e) { return null; }
}

async function parseBilibili(url) {
  try {
    let bvid = url.match(/BV[\w]+/)?.[0];
    if (!bvid) {
      const resp = await fetch(url, { redirect: 'manual' });
      const finalUrl = resp.headers.get('location') || url;
      bvid = finalUrl.match(/BV[\w]+/)?.[0];
    }
    if (!bvid) return null;
    const apiResp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] },
    });
    const json = await apiResp.json();
    if (json.code !== 0 || !json.data) return null;
    const data = json.data;
    const playResp = await fetch(
      `https://api.bilibili.com/x/player/playurl?avid=${data.aid}&cid=${data.cid}&qn=80&fnval=1&fourk=1`,
      { headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Referer': url } }
    );
    const playJson = await playResp.json();
    if (playJson.code !== 0 || !playJson.data?.dash) return null;
    const dash = playJson.data.dash;
    const videoStream = dash.video?.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
    if (!videoStream?.baseUrl) return null;
    return {
      title: data.title || 'B站视频',
      downloadUrl: videoStream.baseUrl,
      thumbnail: data.pic,
      duration: formatDuration(data.duration),
      resolution: videoStream.id4?.toString().includes('1080') ? '1080p' : '720p',
      fps: data.frame_rate?.split(' ')[0] || '30',
      platform: 'bilibili',
    };
  } catch (e) { return null; }
}

async function parseXiaohongshu(url) {
  try {
    const { data: html } = await fetchWithOptions(url, {
      headers: { 'Referer': 'https://www.xiaohongshu.com/' },
    });
    const videoUrlMatch = html.match(/"playUrl":"([^"]+)"/) || html.match(/"originVideoKey":"([^"]+)"/);
    if (videoUrlMatch) {
      return { title: '小红书视频', downloadUrl: `https://sns-webpic-qc.xhscdn.com/${videoUrlMatch[1]}`, thumbnail: '', duration: '-', resolution: '1080p', platform: 'xiaohongshu' };
    }
    return null;
  } catch (e) { return null; }
}

async function parseKuaishou(url) {
  try {
    const { data: html } = await fetchWithOptions(url, {
      headers: { 'Referer': 'https://www.kuaishou.com/' },
    });
    const videoUrlMatch = html.match(/"playUrl":"([^"]+)"/);
    if (videoUrlMatch) {
      return { title: '快手视频', downloadUrl: videoUrlMatch[1], thumbnail: '', duration: '-', resolution: '1080p', platform: 'kuaishou' };
    }
    return null;
  } catch (e) { return null; }
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-client-info',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ success: false, message: '仅支持 POST' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  try {
    const { url, platform } = await req.json();
    if (!url) return new Response(JSON.stringify({ success: false, message: '请输入视频链接' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const detectedPlatform = platform ||
      (url.includes('douyin.com') ? 'douyin' :
       url.includes('bilibili.com') ? 'bilibili' :
       url.includes('xiaohongshu.com') ? 'xiaohongshu' :
       url.includes('kuaishou.com') ? 'kuaishou' : null);

    if (!detectedPlatform) return new Response(JSON.stringify({ success: false, message: '暂不支持该平台' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    let video = null;
    switch (detectedPlatform) {
      case 'douyin': video = await parseDouyin(url); break;
      case 'bilibili': video = await parseBilibili(url); break;
      case 'xiaohongshu': video = await parseXiaohongshu(url); break;
      case 'kuaishou': video = await parseKuaishou(url); break;
    }

    if (video && video.downloadUrl) {
      return new Response(JSON.stringify({ success: true, message: '视频提取成功', video }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    return new Response(JSON.stringify({ success: false, message: '提取失败，该视频可能是私密或受限制视频' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: '服务器错误: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});
```

</details>

7. 点击 **Save** → **Deploy**

### 方式 B：通过 Git 部署

1. 在你的项目目录下执行：
```bash
git init
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin <你的GitHub仓库地址>
git push -u origin main
```
2. 在 Supabase Dashboard → Settings → Git → 连接 GitHub
3. 选择分支 → Deploy

---

## 第 2 步：部署 HTML 文件（1 分钟）

### 方式 A：Supabase Storage

1. Dashboard → **Storage** → **Create bucket**
2. Bucket name: `static`，勾选 **Public**
3. 上传 `video-extractor.html` 到这个 bucket
4. 右键文件 → **Copy URL** → 就是你的网站地址

### 方式 B：GitHub Pages（推荐）

```bash
git add video-extractor.html
git commit -m "Add video extractor page"
git push
```
然后在 GitHub 仓库 → Settings → Pages → Source 选 main 分支

### 方式 C：Netlify Drop（最简单）
1. 打开 https://app.netlify.com/drop
2. 直接把 `video-extractor.html` 拖进去
3. 自动生成一个网站 URL

---

## 第 3 步：测试

1. 用手机打开你的网站 URL
2. 点击 **⚙️ 配置**
3. 填入：
   - **Project URL**: `https://ifohmefzneqwcvlxmyzv.supabase.co`
   - **Public Key**: `sb_publishable_WlWKsjVo_ACvP6map0KxVA_9ChQAGB0`
4. 保存
5. 粘贴抖音视频链接测试！

---

## 快速测试 Edge Function

部署完成后，可以用这个命令测试：

```bash
curl -X POST https://ifohmefzneqwcvlxmyzv.supabase.co/functions/v1/video-extract \
  -H "Content-Type: application/json" \
  -d '{"url":"https://v.douyin.com/xxxxxxxx/","platform":"douyin"}'
```
