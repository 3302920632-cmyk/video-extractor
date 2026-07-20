// Supabase Edge Function: video-extract
// 视频提取中转服务 - 支持抖音、B站、小红书、快手
// 2026-07-20：修复抖音 API 签名问题，改用纯 HTML 解析 + 重定向方案
// - 抖音：从分享页面 HTML 提取 aweme_id 和 playUrl，不依赖 web API（避免 a_bogus 签名）
// - B站：支持 DASH 分片，返回完整视频信息
// - 小红书：通过服务端代理请求获取视频直链
// - 快手：通过服务端代理请求获取视频直链
// - 所有平台返回：title, downloadUrl, downloadUrls, thumbnail, duration, resolution, fileSize(estimated), platform

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

async function fetchHtml(url, extraHeaders = {}) {
  const resp = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...extraHeaders },
    redirect: 'follow',
  });
  return { data: await resp.text(), headers: Object.fromEntries(resp.headers.entries()), status: resp.status };
}

function fmtDur(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// 跟随重定向获取最终直链（修正：改用 redirect:'follow' 读取 r.url，
// 'manual' 在 Deno/undici 下返回 opaqueredirect、status 0、拿不到 Location）
async function resolveRedirect(url, headers) {
  if (!url) return url;
  try {
    const r = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (r.url && r.url.startsWith('http') && r.url !== url) return r.url;
    return url;
  } catch (e) {
    console.error('Resolve redirect error:', e.message);
    return url;
  }
}

// 从 HTML 中提取 JSON-LD 或 window.__INITIAL_STATE__ 等嵌入数据
function extractJsonFromHtml(html) {
  // 方法1：提取 <script id="RENDER_DATA"> 中的数据
  const scriptMatch = html.match(/<script[^>]*id=["']RENDER_DATA["'][^>]*>([\s\S]*?)<\/script>/i);
  if (scriptMatch) {
    try {
      return JSON.parse(scriptMatch[1]);
    } catch (e) {}
  }
  
  // 方法2：提取 window.__INITIAL_STATE__ = {...}
  const initStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/);
  if (initStateMatch) {
    try {
      const raw = initStateMatch[1].trim().replace(/;?\s*$/, '');
      return JSON.parse(raw);
    } catch (e) {}
  }
  
  // 方法3：提取 window._SSR_DATA = {...}
  const ssrMatch = html.match(/window\._SSR_DATA\s*=\s*([\s\S]*?)<\/script>/);
  if (ssrMatch) {
    try {
      const raw = ssrMatch[1].trim().replace(/;?\s*$/, '');
      return JSON.parse(raw);
    } catch (e) {}
  }
  
  // 方法4：提取 JSON 对象（从 HTML 中找最大的 JSON）
  const jsonMatch = html.match(/\{[\s\S]*?"aweme_id"[\s\S]*?"desc"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {}
  }
  
  return null;
}

// 抖音：iesdouyin 分享页 _ROUTER_DATA 解析方案（2025 验证有效，无需 cookie / a_bogus 签名）
// 原理：分享页 https://www.iesdouyin.com/share/video/{aweme_id}/ 用手机 UA 请求，
//       返回的 HTML 里内嵌 window._ROUTER_DATA，含无水印 play_addr。
async function extractDouyin(url) {
  try {
    const mobileHeaders = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Referer': 'https://www.douyin.com/?is_from_mobile_home=1&recommend=1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };

    // 第一步：解析出 aweme_id（先看链接本身，短链则跟随重定向再抠数字）
    let awemeId = (url.match(/\/(?:video|note)\/(\d+)/) || [])[1];
    if (!awemeId) {
      try {
        const r = await fetch(url, { headers: mobileHeaders, redirect: 'follow', signal: AbortSignal.timeout(15000) });
        const finalHref = r.url || '';
        awemeId = (finalHref.match(/\/(?:video|note)\/(\d+)/) || finalHref.match(/(\d{15,})/) || [])[1];
      } catch (e) { console.error('Douyin: 短链重定向失败:', e.message); }
    }
    if (!awemeId) { console.error('Douyin: 未能提取 aweme_id'); return null; }

    // 第二步：请求 iesdouyin 分享页（必须手机 UA，否则页面源码被加密）
    const shareResp = await fetch(`https://www.iesdouyin.com/share/video/${awemeId}/`, {
      headers: mobileHeaders, redirect: 'follow', signal: AbortSignal.timeout(15000),
    });
    const html = await shareResp.text();

    // 第三步：抽取 window._ROUTER_DATA
    const m = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
    if (!m) { console.error('Douyin: 未找到 _ROUTER_DATA'); return null; }
    let routerData;
    try { routerData = JSON.parse(m[1]); } catch (e) { console.error('Douyin: _ROUTER_DATA JSON 解析失败'); return null; }

    const loader = routerData?.loaderData || {};
    const page = loader['video_(id)/page'] || loader['note_(id)/page'] ||
                 Object.values(loader).find((v: any) => v && v.videoInfoRes);
    const item = page?.videoInfoRes?.item_list?.[0];
    if (!item) { console.error('Douyin: item_list 为空（私密/图集/已删除）'); return null; }

    // 第四步：取无水印直链（playwm -> play）
    let playUrl = item?.video?.play_addr?.url_list?.[0] || '';
    if (!playUrl && item?.video?.play_addr?.uri) {
      playUrl = `https://www.douyin.com/aweme/v1/play/?video_id=${item.video.play_addr.uri}`;
    }
    if (!playUrl) { console.error('Douyin: 无 play_addr（可能是图集）'); return null; }
    playUrl = playUrl.replace('playwm', 'play').replace(/\\u002F/g, '/').replace(/\\u0026/g, '&');

    // 第五步：跟随重定向拿最终 CDN 直链（前端用 no-referrer 直连该链下载）
    const finalUrl = await resolveRedirect(playUrl, {
      'User-Agent': mobileHeaders['User-Agent'],
      'Referer': 'https://www.douyin.com/',
    });

    // 估算文件大小
    let estimatedSize = null;
    try {
      const head = await fetch(finalUrl, {
        headers: { 'User-Agent': mobileHeaders['User-Agent'], 'Referer': 'https://www.douyin.com/', 'Range': 'bytes=0-0' },
        redirect: 'follow', signal: AbortSignal.timeout(12000),
      });
      const cl = head.headers.get('Content-Length');
      if (cl) estimatedSize = parseInt(cl, 10);
    } catch (e) { console.error('Douyin size estimate error:', e.message); }

    const cover = item?.video?.cover?.url_list?.[0] || item?.video?.origin_cover?.url_list?.[0] || '';
    const durRaw = item?.video?.duration || item?.duration || 0;
    const durSec = durRaw > 1000 ? durRaw / 1000 : durRaw;
    const w = item?.video?.width, h = item?.video?.height;

    return {
      title: item?.desc || '抖音视频',
      downloadUrl: finalUrl,
      downloadUrls: [finalUrl],
      thumbnail: cover,
      duration: durSec ? fmtDur(durSec) : '-',
      resolution: (w && h) ? `${w}x${h}` : '-',
      fileSize: estimatedSize ? fmtSize(estimatedSize) : '-',
      fps: '-',
      platform: 'douyin',
      referer: 'https://www.douyin.com/',
      source: 'iesdouyin',
    };
  } catch (e) {
    console.error('Douyin extract error:', e);
    return null;
  }
}

// B站：支持 DASH 分片，返回最佳清晰度
async function extractBilibili(url) {
  try {
    const bvid = url.match(/BV[\w]+/)?.[0];
    if (!bvid) return null;

    // 获取视频信息
    const viewResp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Referer': 'https://www.bilibili.com/' },
    });
    const viewJson = await viewResp.json();
    if (viewJson.code !== 0 || !viewJson.data) return null;

    const d = viewJson.data;

    // 获取播放地址：fnval=17 = DASH(16) + 单文件flv/durl(1) 同时返回
    // 优先用单文件 durl（音视频合一），浏览器可直连/无代理播放与下载；
    // 只有 DASH 时再退回分片（前端会提示）。
    const playResp = await fetch(
      `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${d.cid}&qn=127&fnval=17&fourk=1`,
      { headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Referer': url } }
    );
    const playJson = await playResp.json();
    if (playJson.code !== 0 || !playJson.data) return null;

    const playData = playJson.data;
    let downloadUrl = '';
    let resolution = '1080p';
    let isDash = false;

    // 优先：单文件（音视频合一，最适合前端无代理直连）
    if (playData.durl && playData.durl.length > 0) {
      downloadUrl = playData.durl[0]?.url || '';
      resolution = playData.quality === 127 ? '1080p+' : playData.quality === 116 ? '1080p' :
                   playData.quality === 80 ? '1080p' : playData.quality === 64 ? '720p' : '480p';
    } else if (playData.dash?.video && playData.dash.video.length > 0) {
      // 退回 DASH（视频/音频分离）
      isDash = true;
      const bestVideo = playData.dash.video
        .sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
      downloadUrl = bestVideo?.baseUrl || '';
      resolution = bestVideo?.width && bestVideo?.height
        ? `${bestVideo.width}x${bestVideo.height}`
        : '1080p';
    }

    if (!downloadUrl) return null;

    // 估算文件大小
    let estimatedSize = null;
    if (playData.durl?.[0]?.length) {
      estimatedSize = playData.durl[0].length;
    } else if (isDash && playData.dash?.video) {
      const bestVideo = playData.dash.video.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
      if (bestVideo?.size) estimatedSize = bestVideo.size;
    }

    return {
      title: d.title || 'B站视频',
      downloadUrl: downloadUrl,
      downloadUrls: [downloadUrl],
      thumbnail: d.pic,
      duration: fmtDur(d.duration),
      resolution: resolution,
      fileSize: estimatedSize ? fmtSize(estimatedSize) : '-',
      fps: d.frame_rate?.split(' ')[0] || '30',
      platform: 'bilibili',
      isDash: isDash,
      referer: 'https://www.bilibili.com/',
    };
  } catch (e) {
    console.error('Bilibili extract error:', e);
    return null;
  }
}

// 小红书：通过服务端代理获取视频
async function extractXiaohongshu(url) {
  try {
    const { data: html } = await fetchHtml(url, {
      'Referer': 'https://www.xiaohongshu.com/',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    });

    let videoUrl = '';
    const playUrlMatch = html.match(/"playUrl":"([^"]+)"/);
    const originVideoKeyMatch = html.match(/"originVideoKey":"([^"]+)"/);

    if (playUrlMatch) {
      videoUrl = playUrlMatch[1];
    } else if (originVideoKeyMatch) {
      videoUrl = `https://sns-webpic-qc.xhscdn.com/${originVideoKeyMatch[1]}`;
    }

    if (!videoUrl) return null;

    let finalUrl = await resolveRedirect(videoUrl, {
      'User-Agent': DEFAULT_HEADERS['User-Agent'],
      'Referer': 'https://www.xiaohongshu.com/',
    });

    return {
      title: '小红书视频',
      downloadUrl: finalUrl,
      downloadUrls: [finalUrl],
      thumbnail: '',
      duration: '-',
      resolution: '1080p',
      fileSize: '-',
      fps: '-',
      platform: 'xiaohongshu',
      referer: 'https://www.xiaohongshu.com/',
    };
  } catch (e) {
    console.error('XHS extract error:', e);
    return null;
  }
}

// 快手：通过服务端代理获取视频
async function extractKuaishou(url) {
  try {
    const { data: html } = await fetchHtml(url, {
      'Referer': 'https://www.kuaishou.com/',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    });

    const playUrlMatch = html.match(/"playUrl":"([^"]+)"/);
    if (!playUrlMatch) return null;

    let videoUrl = playUrlMatch[1];

    let finalUrl = await resolveRedirect(videoUrl, {
      'User-Agent': DEFAULT_HEADERS['User-Agent'],
      'Referer': 'https://www.kuaishou.com/',
    });

    return {
      title: '快手视频',
      downloadUrl: finalUrl,
      downloadUrls: [finalUrl],
      thumbnail: '',
      duration: '-',
      resolution: '1080p',
      fileSize: '-',
      fps: '-',
      platform: 'kuaishou',
      referer: 'https://www.kuaishou.com/',
    };
  } catch (e) {
    console.error('Kuaishou extract error:', e);
    return null;
  }
}

// ===== 第三方解析（优先）：调用 douyin.wtf 官方开源 API（Evil0ctal/Douyin_TikTok_Download_API）=====
// 服务端调用，无 CORS 限制；支持抖音/TikTok/Bilibili，由第三方完成解析，前端只收直链 JSON。
// 多重冗余：先试你自建实例(THIRD_PARTY_API_BASE) → 再试 douyin.wtf 公开 demo → 最后自有解析兜底。
const TP_BASES = (() => {
  const bases = [];
  const custom = (Deno.env.get('THIRD_PARTY_API_BASE') || '').trim().replace(/\/$/, '');
  if (custom) bases.push(custom);
  if (custom !== 'https://api.douyin.wtf') bases.push('https://api.douyin.wtf');
  return bases;
})();

// 在任意结构的响应里递归找"无水印视频直链"（不依赖固定字段名）
function findVideoUrl(obj, seen = new Set()) {
  let best = null;
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (const k of Object.keys(node)) {
      const key = String(k).toLowerCase();
      const prefer = /no.?watermark|no_wm/.test(key);
      const avoid = /watermark|playwm/.test(key);
      const child = node[k];
      if (typeof child === 'string') {
        const v = child.trim();
        if (!/^https?:\/\//.test(v)) continue;
        const looksVideo = /\.(mp4|m3u8)(\?|$)/i.test(v) ||
          /(play|video|aweme|v\d+\.cache|bytecdn|douyinvod|tiktokcdn|muscdn|vod)/i.test(v);
        if (!looksVideo) continue;
        const score = (prefer ? 100 : 0) + (avoid ? -50 : 0) + (/\.mp4/i.test(v) ? 10 : 0);
        if (best === null || score > best.score) best = { url: v, score };
      } else if (child && typeof child === 'object') {
        walk(child);
      }
    }
  };
  walk(obj);
  return best ? best.url : null;
}

// 在响应里按候选 key 找第一个匹配的字符串（标题/封面等）
function findStringByKeys(obj, keys, seen = new Set()) {
  let found = null;
  const walk = (n) => {
    if (!n || typeof n !== 'object' || seen.has(n) || found) return;
    seen.add(n);
    if (Array.isArray(n)) { n.forEach(walk); return; }
    for (const k of Object.keys(n)) {
      const key = String(k).toLowerCase();
      if (keys.some(kk => key.includes(kk)) && typeof n[k] === 'string' && !found) { found = n[k]; return; }
      if (n[k] && typeof n[k] === 'object') walk(n[k]);
    }
  };
  walk(obj);
  return found;
}

async function extractViaThirdParty(url, platform) {
  for (const base of TP_BASES) {
    let json: any = null;
    // 公开 demo 偶有间歇限流，重试 3 次降低偶发失败
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const apiUrl = `${base}/api/hybrid/video_data?url=${encodeURIComponent(url)}&minimal=false`;
        const resp = await fetch(apiUrl, {
          headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Accept': 'application/json' },
          redirect: 'follow',
          signal: AbortSignal.timeout(25000),
        });
        const text = await resp.text();
        try { json = JSON.parse(text); } catch { json = null; console.error(`[${base}] not JSON:`, text.slice(0, 200)); }
      } catch (e) { json = null; console.error(`[${base}] fetch error:`, (e as Error).message); }
      if (json && json.code === 200 && json.data) break;
      if (attempt < 2) await new Promise(r => setTimeout(r, 900));
    }
    if (!json || json.code !== 200 || !json.data) {
      console.error(`[${base}] parse failed after retries:`, JSON.stringify(json?.detail || json?.message || 'no data'));
      continue;
    }
    try {
      const data = json.data;
      const downloadUrl = findVideoUrl(data);
      if (!downloadUrl) { console.error(`[${base}] no video url found in data`); continue; }

      const title = findStringByKeys(data, ['title', 'desc', 'caption']) || '短视频';
      const thumbnail = findStringByKeys(data, ['cover', 'poster', 'thumbnail', 'origin_cover']) || '';

      // 估算文件大小
      let estimatedSize = null;
      try {
        const head = await fetch(downloadUrl, {
          headers: { ...DEFAULT_HEADERS, 'Range': 'bytes=0-0' },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });
        const cl = head.headers.get('Content-Length');
        if (cl) estimatedSize = parseInt(cl, 10);
      } catch (e) { console.error('Size estimate error:', e.message); }

      const plat = platform ||
        (url.includes('tiktok.com') ? 'tiktok' :
         url.includes('bilibili.com') || url.includes('b23.tv') ? 'bilibili' :
         url.includes('douyin.com') || url.includes('v.douyin.com') ? 'douyin' : 'thirdparty');

      return {
        title,
        downloadUrl,
        downloadUrls: [downloadUrl],
        thumbnail,
        duration: '-',
        resolution: '-',
        fileSize: estimatedSize ? fmtSize(estimatedSize) : '-',
        fps: '-',
        platform: plat,
        referer: '',
        source: 'thirdparty',
      };
    } catch (e) {
      console.error(`[${base}] extract error:`, e.message);
      continue;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,apikey,x-client-info',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ success: false, message: '仅支持POST' }), { status: 405, headers: { 'Content-Type': 'application/json', ...cors } });

  try {
    const { url, platform } = await req.json();
    if (!url) return new Response(JSON.stringify({ success: false, message: '请输入视频链接' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });

    const p = platform || (
      url.includes('douyin.com') || url.includes('v.douyin.com') ? 'douyin' :
      url.includes('bilibili.com') || url.includes('b23.tv') ? 'bilibili' :
      url.includes('xiaohongshu.com') || url.includes('xhslink.com') ? 'xiaohongshu' :
      url.includes('kuaishou.com') || url.includes('v.kuaishou.com') ? 'kuaishou' :
      null
    );

    if (!p) return new Response(JSON.stringify({ success: false, message: '暂不支持该平台' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });

    let video = null;
    // 优先走自有解析（服务端直连官方接口/分享页，不依赖会挂的第三方 demo，最稳）
    if (p === 'douyin') video = await extractDouyin(url);
    else if (p === 'bilibili') video = await extractBilibili(url);
    else if (p === 'xiaohongshu') video = await extractXiaohongshu(url);
    else if (p === 'kuaishou') video = await extractKuaishou(url);
    // 自有解析失败，再回退到第三方（douyin.wtf 活着时兜底；挂了就跳过）
    if (!video) video = await extractViaThirdParty(url, p);

    if (video?.downloadUrl) {
      return new Response(JSON.stringify({ success: true, message: '视频提取成功', video }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    return new Response(JSON.stringify({ success: false, message: '提取失败，该视频可能是私密或受限制视频' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: '服务器错误: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
});
