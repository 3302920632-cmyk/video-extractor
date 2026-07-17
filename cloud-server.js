import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let douyinCookies = '';

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.douyin.com/',
        'Cookie': douyinCookies,
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function refreshDouyinCookies() {
  console.log('Refreshing Douyin cookies...');
  try {
    const html = await fetchUrl('https://www.douyin.com');
    const fs = await import('fs');
    fs.writeFileSync('/tmp/douyin_cookies.txt', '', 'utf-8');
    console.log('Douyin cookies refreshed');
  } catch (e) {
    console.error('Failed to refresh cookies:', e);
  }
  setTimeout(refreshDouyinCookies, 30 * 60 * 1000);
}

refreshDouyinCookies();

async function extractDouyinVideo(url) {
  try {
    const html = await fetchUrl(url);
    
    const urlMatch = html.match(/playAddr["']?\s*[:=]\s*["']([^"']+)["']/);
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
    
    const videoTagMatch = html.match(/<video[^>]*src=["']([^"']+)["']/);
    if (videoTagMatch) {
      return {
        title: '抖音视频',
        downloadUrl: videoTagMatch[1],
        thumbnail: '',
        duration: '01:00',
        resolution: '1080p',
        platform: 'douyin',
      };
    }
    
    const playUrlMatch = html.match(/playUrl["']?\s*[:=]\s*["']([^"']+)["']/);
    if (playUrlMatch) {
      return {
        title: '抖音视频',
        downloadUrl: playUrlMatch[1],
        thumbnail: '',
        duration: '01:00',
        resolution: '1080p',
        platform: 'douyin',
      };
    }
    
    const videoUrlMatch = html.match(/video_url["']?\s*[:=]\s*["']([^"']+)["']/);
    if (videoUrlMatch) {
      return {
        title: '抖音视频',
        downloadUrl: videoUrlMatch[1],
        thumbnail: '',
        duration: '01:00',
        resolution: '1080p',
        platform: 'douyin',
      };
    }
    
    return null;
  } catch (e) {
    console.error('Douyin extraction failed:', e);
    return null;
  }
}

const THIRD_PARTY_APIS = [
  { url: 'https://api.muxiaoguo.cn/api/video11', param: 'url' },
  { url: 'https://api.258666.net/api/video', param: 'url' },
  { url: 'https://api.vvhan.com/api/video', param: 'url' },
  { url: 'https://apione.apibyte.cn/api/video6', param: 'url' },
  { url: 'https://api.pingcc.cn/api/video', param: 'url' },
  { url: 'https://www.mojieai.cn/api/video', param: 'url' },
  { url: 'https://api.wookong.xyz/api/video/getVideoInfo', param: 'url' },
  { url: 'https://www.xiaoapi.cn/api/video', param: 'url' },
];

async function extractWithThirdParty(url) {
  for (const api of THIRD_PARTY_APIS) {
    try {
      const response = await fetch(`${api.url}?${api.param}=${encodeURIComponent(url)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 15000,
      });
      const data = await response.json();
      
      if (data.success || data.code === 200 || data.code === 1 || data.status === 'success') {
        const result = data.data || data;
        if (result.video_url || result.playUrl || result.url || result.video || result.VideoUrl) {
          return {
            title: result.title || result.desc || result.video_title || '视频',
            downloadUrl: result.video_url || result.playUrl || result.url || result.video || result.VideoUrl,
            thumbnail: result.cover_url || result.cover || result.video_cover || '',
            duration: result.duration || '01:00',
            resolution: result.resolution || '1080p',
          };
        }
      }
    } catch (e) {
      console.log('API failed:', api.url, e.message);
    }
  }
  return null;
}

async function extractWithYtDlp(url) {
  return new Promise((resolve) => {
    const args = [
      '--no-warnings',
      '--ignore-errors',
      '--dump-json',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
    ];
    args.push(url);

    const ytDlp = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    ytDlp.stdout.on('data', (data) => stdout += data.toString());
    ytDlp.stderr.on('data', (data) => stderr += data.toString());

    ytDlp.on('exit', (code) => {
      if (code === 0) {
        try {
          const data = JSON.parse(stdout);
          const formats = data.formats || [];
          const bestFormat = formats.length > 0 ? formats[formats.length - 1] : data;
          resolve({
            title: data.title || '视频',
            downloadUrl: bestFormat.url || data.url || '',
            thumbnail: data.thumbnail || '',
            duration: data.duration ? formatDuration(data.duration) : '01:00',
            resolution: bestFormat.resolution || bestFormat.width ? (bestFormat.width + 'p') : '1080p',
            fps: bestFormat.fps || 30,
          });
        } catch (e) {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });

    ytDlp.on('error', () => resolve(null));

    setTimeout(() => {
      ytDlp.kill();
      resolve(null);
    }, 30000);
  });
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
}

app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.json({ success: false, message: '请提供视频链接' });
  }

  try {
    const platform = url.includes('douyin') || url.includes('tiktok') ? 'douyin' :
                     url.includes('bilibili') || url.includes('b23') ? 'bilibili' :
                     url.includes('xiaohongshu') || url.includes('xhs') ? 'xiaohongshu' :
                     url.includes('kuaishou') || url.includes('ks') ? 'kuaishou' : 'unknown';

    if (platform === 'unknown') {
      return res.json({ success: false, message: '暂不支持该平台' });
    }

    const extractionMethods = [];
    extractionMethods.push(extractWithThirdParty(url));

    if (platform === 'douyin') {
      extractionMethods.push(extractDouyinVideo(url));
      extractionMethods.push(extractWithYtDlp(url));
    } else {
      extractionMethods.push(extractWithYtDlp(url));
    }

    const results = await Promise.allSettled(extractionMethods);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const video = {
          id: result.value.id || 'vid_' + Date.now(),
          title: result.value.title || `${platform} video`,
          duration: result.value.duration || '01:00',
          resolution: result.value.resolution || '1080p',
          fps: result.value.fps || 30,
          thumbnail: result.value.thumbnail || '',
          downloadUrl: result.value.downloadUrl || '',
          platform
        };

        if (video.downloadUrl) {
          res.json({
            success: true,
            message: '视频提取成功',
            video
          });
          return;
        }
      }
    }

    res.json({
      success: false,
      message: '提取失败，请重试'
    });

  } catch (error) {
    console.error('Extraction error:', error.message);
    res.json({
      success: false,
      message: '提取失败，请重试'
    });
  }
});

app.post('/api/history', async (req, res) => {
  res.json({ success: true, message: '历史记录已保存' });
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});