// Vercel Serverless Function: /api/extract
// 抖音 + B站 无需 Cookie，纯 API 解析

const https = require('https');
const http = require('http');

// 通用 HTTP/HTTPS 请求
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      timeout: 15000,
      ...options,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        resolve(fetchUrl(res.headers.location, options));
        return;
      }
      
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ data: JSON.parse(data), raw: data, headers: res.headers });
        } catch {
          resolve({ data: null, raw: data, headers: res.headers });
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function detectPlatform(url) {
  if (url.includes('douyin') || url.includes('v.douyin') || url.includes('iesdouyin')) return 'douyin';
  if (url.includes('bilibili') || url.includes('b23')) return 'bilibili';
  if (url.includes('xiaohongshu') || url.includes('xhs.link')) return 'xiaohongshu';
  if (url.includes('kuaishou') || url.includes('ks.com')) return 'kuaishou';
  return null;
}

// ==================== 抖音解析 ====================

async function parseDouyin(url) {
  try {
    // Step 1: 访问分享链接，获取 _ROUTER_DATA
    const { raw: html } = await fetchUrl(url);
    
    const routerDataMatch = html.match(/window\._ROUTER_DATA\s*=\s*(\{.+?\});?\s*<\/script>/);
    if (routerDataMatch) {
      const routerData = JSON.parse(routerDataMatch[1]);
      const itemList = routerData?.video?.videoInfoRes?.item_list;
      
      if (itemList && itemList.length > 0) {
        const video = itemList[0];
        const playUrl = video?.video?.play_addr?.url_list?.[0];
        
        if (playUrl) {
          return {
            title: video?.desc || '抖音视频',
            downloadUrl: playUrl.replace('playwm', 'play'),
            thumbnail: video?.video?.cover?.url_list?.[0] || '',
            duration: video?.duration ? formatDuration(video.duration / 1000) : '--:--',
            resolution: '1080p',
            fps: 30,
            author: video?.author?.nickname || '',
            platform: 'douyin',
          };
        }
      }
    }
    
    // Step 2: 备选 - 从 HTML 中提取 video_id
    const videoIdMatch = html.match(/video_id["']?\s*[:=]\s*["']?(\d+)/);
    if (videoIdMatch) {
      try {
        const { data: apiData } = await fetchUrl(
          `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoIdMatch[1]}`
        );
        
        if (apiData?.item_list?.[0]) {
          const video = apiData.item_list[0];
          const playUrl = video?.video?.play_addr?.url_list?.[0];
          if (playUrl) {
            return {
              title: video?.desc || '抖音视频',
              downloadUrl: playUrl.replace('playwm', 'play'),
              thumbnail: video?.video?.cover?.url_list?.[0] || '',
              duration: video?.duration ? formatDuration(video.duration / 1000) : '--:--',
              resolution: '1080p',
              fps: 30,
              author: video?.author?.nickname || '',
              platform: 'douyin',
            };
          }
        }
      } catch {}
    }
    
    // Step 3: 最后尝试 - 直接从 HTML 中找视频 URL
    const videoUrlMatch = html.match(/"playAddr"\s*:\s*"([^"]+)"/);
    if (videoUrlMatch) {
      return {
        title: '抖音视频',
        downloadUrl: videoUrlMatch[1],
        thumbnail: '',
        duration: '--:--',
        resolution: '1080p',
        platform: 'douyin',
      };
    }
    
    return null;
  } catch (e) {
    console.error('Douyin parse error:', e.message);
    return null;
  }
}

// ==================== B站解析 ====================

async function parseBilibili(url) {
  try {
    // Step 1: 从 URL 中提取 BV 号
    const bvidMatch = url.match(/BV[a-zA-Z0-9]+/);
    if (!bvidMatch) return null;
    
    const bvid = bvidMatch[0];
    
    // Step 2: 获取视频信息（包含 cid）
    const viewRes = await fetchUrl(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      {
        headers: {
          'Referer': 'https://www.bilibili.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
      }
    );
    
    if (!viewRes.data || viewRes.data.code !== 0) {
      return null;
    }
    
    const viewData = viewRes.data.data;
    const cid = viewData.cid;
    const title = viewData.title;
    const duration = viewData.duration; // 秒
    const owner = viewData.owner?.name || '';
    
    // Step 3: 获取播放地址
    const playUrlRes = await fetchUrl(
      `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&otype=json&fnval=16`,
      {
        headers: {
          'Referer': 'https://www.bilibili.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
      }
    );
    
    if (!playUrlRes.data || playUrlRes.data.code !== 0) {
      // 降级：尝试不带 fnval
      const playUrlRes2 = await fetchUrl(
        `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&otype=json`,
        {
          headers: {
            'Referer': 'https://www.bilibili.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        }
      );
      
      if (!playUrlRes2.data || playUrlRes2.data.code !== 0) {
        return null;
      }
      
      return buildBilibiliResult(playUrlRes2.data, title, duration, owner, bvid);
    }
    
    return buildBilibiliResult(playUrlRes.data, title, duration, owner, bvid);
  } catch (e) {
    console.error('Bilibili parse error:', e.message);
    return null;
  }
}

function buildBilibiliResult(apiData, title, duration, owner, bvid) {
  const durl = apiData?.durl;
  if (durl && durl.length > 0) {
    return {
      title: title || 'B站视频',
      downloadUrl: durl[durl.length - 1].url, // 取最大画质
      thumbnail: apiData?.dash?.videos?.[0]?.baseUrl || '',
      duration: duration ? formatDuration(duration) : '--:--',
      resolution: '1080p',
      fps: 30,
      author: owner || '',
      platform: 'bilibili',
    };
  }
  
  // 备选：dash 格式
  const dash = apiData?.dash;
  if (dash?.video && dash.video.length > 0 && dash?.audio) {
    // 有视频+音频分离，取最高画质视频
    const bestVideo = dash.video.reduce((a, b) => 
      (parseInt(b.id) > parseInt(a.id)) ? b : a
    );
    return {
      title: title || 'B站视频',
      downloadUrl: bestVideo.baseUrl,
      thumbnail: dash?.videos?.[0]?.baseUrl || '',
      duration: duration ? formatDuration(duration) : '--:--',
      resolution: '1080p',
      fps: 30,
      author: owner || '',
      platform: 'bilibili',
    };
  }
  
  return null;
}

// ==================== 其他平台 ====================

async function parseOther(url, platform) {
  try {
    const { raw: html } = await fetchUrl(url);
    const videoTagMatch = html.match(/<video[^>]*src=["']([^"']+)["']/);
    if (videoTagMatch) {
      return {
        title: `${platform}视频`,
        downloadUrl: videoTagMatch[1],
        thumbnail: '',
        duration: '--:--',
        resolution: '1080p',
        platform,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ==================== 主入口 ====================

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }
  
  try {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { url } = JSON.parse(body);
        
        if (!url || typeof url !== 'string') {
          return res.status(400).json({ success: false, message: '请输入视频链接' });
        }
        
        const platform = detectPlatform(url);
        if (!platform) {
          return res.status(400).json({ success: false, message: '暂不支持该平台' });
        }
        
        let video;
        if (platform === 'douyin') {
          video = parseDouyin(url);
        } else if (platform === 'bilibili') {
          video = parseBilibili(url);
        } else {
          video = parseOther(url, platform);
        }
        
        video.then(result => {
          if (result && result.downloadUrl) {
            res.status(200).json({ success: true, message: '视频提取成功', video: result });
          } else {
            const errorMsg = platform === 'douyin' 
              ? '提取失败，该视频可能是私密或受限制视频'
              : platform === 'bilibili'
                ? 'B站视频提取失败，请检查链接是否正确'
                : '提取失败，请稍后重试';
            res.status(200).json({ success: false, message: errorMsg });
          }
        }).catch(err => {
          res.status(500).json({ success: false, message: '服务器错误: ' + err.message });
        });
      } catch (e) {
        res.status(400).json({ success: false, message: '请求格式错误' });
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
};
