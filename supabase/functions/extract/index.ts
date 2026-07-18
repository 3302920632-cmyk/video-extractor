export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VideoInfo {
  id: string;
  title: string;
  duration: string;
  resolution: string;
  fps: number;
  thumbnail: string;
  downloadUrl: string;
  platform: string;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function extractBilibili(url: string): Promise<VideoInfo | null> {
  try {
    const response = await fetchWithTimeout(`https://api.pingcc.cn/api/video?url=${encodeURIComponent(url)}`, {}, 8000);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.code === 200 && data.data) {
      const d = data.data;
      return {
        id: 'vid_' + Date.now(),
        title: d.title || 'B站视频',
        duration: '01:00',
        resolution: '1080p',
        fps: 30,
        thumbnail: d.cover || '',
        downloadUrl: d.video_url || d.url || '',
        platform: 'bilibili',
      };
    }
  } catch (e) {}
  return null;
}

async function extractDouyin(url: string): Promise<VideoInfo | null> {
  const apis = [
    'https://api.wookong.xyz/api/video/getVideoInfo',
    'https://www.mojieai.cn/api/video',
  ];
  
  for (const api of apis) {
    try {
      const response = await fetchWithTimeout(`${api}?url=${encodeURIComponent(url)}`, {}, 8000);
      if (!response.ok) continue;
      const data = await response.json();
      if ((data.code === 200 || data.code === 1) && data.data) {
        const d = data.data;
        return {
          id: 'vid_' + Date.now(),
          title: d.title || d.desc || '抖音视频',
          duration: '01:00',
          resolution: '1080p',
          fps: 30,
          thumbnail: d.cover_url || d.cover || '',
          downloadUrl: d.video_url || d.playUrl || d.url || '',
          platform: 'douyin',
        };
      }
    } catch (e) {}
  }
  return null;
}

async function extractOther(url: string, platform: string): Promise<VideoInfo | null> {
  try {
    const response = await fetchWithTimeout(`https://api.pingcc.cn/api/video?url=${encodeURIComponent(url)}`, {}, 8000);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.code === 200 && data.data) {
      const d = data.data;
      return {
        id: 'vid_' + Date.now(),
        title: d.title || '视频',
        duration: '01:00',
        resolution: '1080p',
        fps: 30,
        thumbnail: d.cover || '',
        downloadUrl: d.video_url || d.url || '',
        platform,
      };
    }
  } catch (e) {}
  return null;
}

function detectPlatform(url: string): string {
  if (url.includes('douyin.com') || url.includes('v.douyin.com')) return 'douyin';
  if (url.includes('bilibili.com') || url.includes('b23.tv')) return 'bilibili';
  if (url.includes('xiaohongshu.com') || url.includes('xhs.link')) return 'xiaohongshu';
  if (url.includes('kuaishou.com') || url.includes('ks.com')) return 'kuaishou';
  return 'unknown';
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ success: false, message: '请输入视频链接' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const platform = detectPlatform(url);
    if (platform === 'unknown') {
      return new Response(JSON.stringify({ success: false, message: '暂不支持该平台' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    let video: VideoInfo | null = null;
    
    if (platform === 'bilibili') {
      video = await extractBilibili(url);
    } else if (platform === 'douyin') {
      video = await extractDouyin(url);
    } else {
      video = await extractOther(url, platform);
    }

    if (video && video.downloadUrl) {
      return new Response(JSON.stringify({ success: true, message: '视频提取成功', video }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ success: false, message: '提取失败，该视频可能是私密或受限制视频' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ success: false, message: '服务器内部错误' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}