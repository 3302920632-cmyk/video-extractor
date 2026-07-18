// Supabase Edge Function: video-extract
// 处理视频链接提取，返回无水印视频下载地址

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

async function fetchWithOptions(url: string, options: Record<string, any> = {}) {
  const parsedUrl = new URL(url);
  const headers = { ...DEFAULT_HEADERS, ...options.headers };
  
  const resp = await fetch(url, {
    method: options.method || 'GET',
    headers,
    redirect: 'follow',
  });
  
  const data = await resp.text();
  return { data, headers: Object.fromEntries(resp.headers.entries()), statusCode: resp.status };
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 抖音解析
async function parseDouyin(url: string) {
  try {
    const { data: html } = await fetchWithOptions(url, {
      headers: { 'Referer': 'https://www.douyin.com/' },
    });

    // 提取 videoId 或 aweme_id
    const videoIdMatch = html.match(/videoId["']?\s*[:=]\s*["']([^"']+)["']/);
    const awemeIdMatch = html.match(/aweme_id["']?\s*[:=]\s*["']([^"']+)["']/);
    const videoId = videoIdMatch?.[1] || awemeIdMatch?.[1];
    
    if (!videoId) {
      // 尝试从 HTML 中提取直接视频 URL
      const urlMatch = html.match(/["'](https?:\/\/[^\s"']*douyin[^\s"']*video[^\s"']+)["']/);
      if (urlMatch) {
        return {
          title: '抖音视频',
          downloadUrl: urlMatch[1],
          thumbnail: '',
          duration: '01:00',
          resolution: '1080p',
          platform: 'douyin',
        };
      }
      return null;
    }

    // 调用抖音视频详情 API
    const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`;
    const { data: apiData } = await fetchWithOptions(apiUrl, {
      headers: { 'Referer': url },
    });

    try {
      const json = JSON.parse(apiData);
      if (json.aweme_detail) {
        const detail = json.aweme_detail;
        const videoUrls = detail.video?.play_addr?.url_list || detail.video?.download_addr?.url_list || [];
        const coverUrl = detail.video?.cover?.url_list?.[0] || '';
        
        if (videoUrls.length > 0) {
          return {
            title: detail.desc || '抖音视频',
            downloadUrl: videoUrls[0],
            thumbnail: coverUrl,
            duration: detail.duration ? formatDuration(detail.duration / 1000) : '01:00',
            resolution: '1080p',
            platform: 'douyin',
          };
        }
      }
    } catch (e) {
      console.warn('抖音 API 解析失败:', e);
    }

    return null;
  } catch (e) {
    console.error('抖音解析错误:', e);
    return null;
  }
}

// B站解析（通过 API 获取）
async function parseBilibili(url: string) {
  try {
    // 提取 avid/bvid
    let bvid = url.match(/BV[\w]+/)?.[0];
    
    if (!bvid) {
      // 尝试从 short link 跳转
      const resp = await fetch(url, { redirect: 'manual' });
      const finalUrl = resp.headers.get('location') || url;
      bvid = finalUrl.match(/BV[\w]+/)?.[0];
    }

    if (!bvid) return null;

    // 通过 API 获取视频信息
    const apiResp = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] },
    });
    const json = await apiResp.json();

    if (json.code !== 0 || !json.data) {
      return null;
    }

    const data = json.data;
    
    // 获取视频流地址（需要代理或 CDN）
    const cid = data.cid;
    const aid = data.aid;
    
    // 获取播放地址
    const playResp = await fetch(
      `https://api.bilibili.com/x/player/playurl?avid=${aid}&cid=${cid}&qn=80&fnval=1&fourk=1`,
      { headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Referer': url } }
    );
    const playJson = await playResp.json();

    if (playJson.code !== 0 || !playJson.data?.dash) {
      return null;
    }

    const dash = playJson.data.dash;
    // 找最佳视频流
    const videoStream = dash.video?.sort((a: any, b: any) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
    const audioStream = dash.audio?.sort((a: any, b: any) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];

    if (!videoStream?.baseUrl) {
      return null;
    }

    return {
      title: data.title || 'B站视频',
      downloadUrl: videoStream.baseUrl,
      thumbnail: data.pic,
      duration: formatDuration(data.duration),
      resolution: videoStream.id4?.includes('1080') ? '1080p' : '720p',
      fps: data.frame_rate?.split(' ')[0] || '30',
      platform: 'bilibili',
    };
  } catch (e) {
    console.error('B站解析错误:', e);
    return null;
  }
}

// 小红书解析
async function parseXiaohongshu(url: string) {
  try {
    const { data: html } = await fetchWithOptions(url, {
      headers: { 'Referer': 'https://www.xiaohongshu.com/' },
    });

    // 提取视频 URL
    const videoUrlMatch = html.match(/"playUrl":"([^"]+)"/) || 
                          html.match(/"originVideoKey":"([^"]+)"/);
    
    if (videoUrlMatch) {
      return {
        title: '小红书视频',
        downloadUrl: `https://sns-webpic-qc.xhscdn.com/${videoUrlMatch[1]}`,
        thumbnail: '',
        duration: '-',
        resolution: '1080p',
        platform: 'xiaohongshu',
      };
    }

    return null;
  } catch (e) {
    console.error('小红书解析错误:', e);
    return null;
  }
}

// 快手解析
async function parseKuaishou(url: string) {
  try {
    const { data: html } = await fetchWithOptions(url, {
      headers: { 'Referer': 'https://www.kuaishou.com/' },
    });

    const videoUrlMatch = html.match(/"playUrl":"([^"]+)"/);
    if (videoUrlMatch) {
      return {
        title: '快手视频',
        downloadUrl: videoUrlMatch[1],
        thumbnail: '',
        duration: '-',
        resolution: '1080p',
        platform: 'kuaishou',
      };
    }

    return null;
  } catch (e) {
    console.error('快手解析错误:', e);
    return null;
  }
}

serve(async (req: Request) => {
  // CORS 处理
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-client-info',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: '仅支持 POST 请求' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const { url, platform } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ success: false, message: '请输入视频链接' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const detectedPlatform = platform || 
      (url.includes('douyin.com') ? 'douyin' :
       url.includes('bilibili.com') ? 'bilibili' :
       url.includes('xiaohongshu.com') ? 'xiaohongshu' :
       url.includes('kuaishou.com') ? 'kuaishou' : null);

    if (!detectedPlatform) {
      return new Response(JSON.stringify({ success: false, message: '暂不支持该平台' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    let video = null;

    switch (detectedPlatform) {
      case 'douyin':
        video = await parseDouyin(url);
        break;
      case 'bilibili':
        video = await parseBilibili(url);
        break;
      case 'xiaohongshu':
        video = await parseXiaohongshu(url);
        break;
      case 'kuaishou':
        video = await parseKuaishou(url);
        break;
    }

    if (video && video.downloadUrl) {
      return new Response(JSON.stringify({ success: true, message: '视频提取成功', video }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ 
      success: false, 
      message: '提取失败，该视频可能是私密或受限制视频' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (e) {
    console.error('Edge Function 错误:', e);
    return new Response(JSON.stringify({ 
      success: false, 
      message: '服务器内部错误: ' + e.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
