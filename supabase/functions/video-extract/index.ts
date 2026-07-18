// Supabase Edge Function: video-extract
// 视频提取中转服务 - 支持抖音、B站、小红书、快手

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
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
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

async function extractDouyin(url) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.douyin.com/',
      'Cookie': 'ttwid=1%7C0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a%7C1700000000; sessionid=0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a;'
    };

    const resp = await fetch(url, { headers, redirect: 'follow' });
    const html = await resp.text();

    const awemeIdMatch = html.match(/aweme_id["']?\s*[:=]\s*["']([^"']+)["']/);
    if (awemeIdMatch) {
      const awemeId = awemeIdMatch[1];
      try {
        const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}`;
        const apiResp = await fetch(apiUrl, { headers });
        const apiData = await apiResp.text();
        const jsonMatch = apiData.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const json = JSON.parse(jsonMatch[0]);
          if (json.aweme_detail?.aweme_id) {
            const d = json.aweme_detail;
            const urls = d.video?.play_addr?.url_list || d.video?.play_url?.url_list || [];
            if (urls.length > 0) {
              const playUrl = urls[0].replace(/\\u002F/g, '/');
              return {
                title: d.desc || '抖音视频',
                downloadUrl: playUrl.includes('playwm') ? playUrl.replace('playwm', 'play') : playUrl,
                thumbnail: d.video?.cover?.url_list?.[0] || '',
                duration: fmtDur(d.duration / 1000),
                resolution: '1080p',
                platform: 'douyin'
              };
            }
          }
        }
      } catch (e) { console.error('Douyin API error:', e); }
    }

    const playUrlMatch = html.match(/"playUrl":\s*["']([^"']+)["']/) || html.match(/"play_addr":\s*\{[\s\S]*?"url_list":\s*\[["']([^"']+)["']/);
    if (playUrlMatch) {
      let playUrl = playUrlMatch[1];
      if (playUrl.includes('playwm')) playUrl = playUrl.replace('playwm', 'play');
      return {
        title: '抖音视频',
        downloadUrl: playUrl,
        thumbnail: '',
        duration: '-',
        resolution: '1080p',
        platform: 'douyin'
      };
    }

    const videoUrlMatch = html.match(/["'](https?:\/\/[^\s"']*douyin[^\s"']*video[^\s"']+)["']/);
    if (videoUrlMatch) {
      return {
        title: '抖音视频',
        downloadUrl: videoUrlMatch[1],
        thumbnail: '',
        duration: '-',
        resolution: '1080p',
        platform: 'douyin'
      };
    }

  } catch (e) { console.error('Douyin error:', e); }
  return null;
}

async function extractBilibili(url) {
  try {
    const bvid = url.match(/BV[\w]+/)?.[0];
    if (!bvid) return null;
    const viewResp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] },
    });
    const viewJson = await viewResp.json();
    if (viewJson.code !== 0 || !viewJson.data) return null;
    const d = viewJson.data;
    const playResp = await fetch(
      `https://api.bilibili.com/x/player/playurl?avid=${d.aid}&cid=${d.cid}&qn=80&fnval=1&fourk=1`,
      { headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Referer': url } }
    );
    const playJson = await playResp.json();
    if (playJson.code !== 0 || !playJson.data) return null;
    
    let downloadUrl = '';
    const playData = playJson.data;
    
    if (playData.dash?.video && playData.dash.video.length > 0) {
      const best = playData.dash.video.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
      downloadUrl = best?.baseUrl || '';
    } else if (playData.durl && playData.durl.length > 0) {
      downloadUrl = playData.durl[0]?.url || '';
    }
    
    if (!downloadUrl) return null;
    
    return {
      title: d.title || 'B站视频',
      downloadUrl: downloadUrl,
      thumbnail: d.pic,
      duration: fmtDur(d.duration),
      resolution: playData.quality === 80 ? '1080p' : '720p',
      fps: d.frame_rate?.split(' ')[0] || '30',
      platform: 'bilibili',
    };
  } catch (e) { console.error('Bilibili error:', e); }
  return null;
}

async function extractXiaohongshu(url) {
  try {
    const { data: html } = await fetchHtml(url, { 'Referer': 'https://www.xiaohongshu.com/' });
    const m = html.match(/"playUrl":"([^"]+)"/) || html.match(/"originVideoKey":"([^"]+)"/);
    if (m) {
      return { title: '小红书视频', downloadUrl: `https://sns-webpic-qc.xhscdn.com/${m[1]}`, thumbnail: '', duration: '-', resolution: '1080p', platform: 'xiaohongshu' };
    }
  } catch (e) { console.error('XHS error:', e); }
  return null;
}

async function extractKuaishou(url) {
  try {
    const { data: html } = await fetchHtml(url, { 'Referer': 'https://www.kuaishou.com/' });
    const m = html.match(/"playUrl":"([^"]+)"/);
    if (m) {
      return { title: '快手视频', downloadUrl: m[1], thumbnail: '', duration: '-', resolution: '1080p', platform: 'kuaishou' };
    }
  } catch (e) { console.error('Kuaishou error:', e); }
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

    const p = platform || (url.includes('douyin.com') ? 'douyin' : url.includes('bilibili.com') ? 'bilibili' : url.includes('xiaohongshu.com') ? 'xiaohongshu' : url.includes('kuaishou.com') ? 'kuaishou' : null);
    if (!p) return new Response(JSON.stringify({ success: false, message: '暂不支持该平台' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });

    let video = null;
    if (p === 'douyin') video = await extractDouyin(url);
    else if (p === 'bilibili') video = await extractBilibili(url);
    else if (p === 'xiaohongshu') video = await extractXiaohongshu(url);
    else if (p === 'kuaishou') video = await extractKuaishou(url);

    if (video?.downloadUrl) {
      return new Response(JSON.stringify({ success: true, message: '视频提取成功', video }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    return new Response(JSON.stringify({ success: false, message: '提取失败，该视频可能是私密或受限制视频' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: '服务器错误: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
});
