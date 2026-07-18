import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const COOKIE_FILE = path.join(__dirname, '.douyin-cookies');
let douyinCookies = '';

try {
  douyinCookies = fs.readFileSync(COOKIE_FILE, 'utf-8');
} catch (e) {}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

async function fetchWithOptions(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const headers = { ...DEFAULT_HEADERS, ...options.headers };
    if (douyinCookies && url.includes('douyin')) {
      headers['Cookie'] = douyinCookies;
    }
    
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers,
      timeout: options.timeout || 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(fetchWithOptions(res.headers.location, options));
        } else {
          resolve({ data, headers: res.headers, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

async function saveCookies(newCookies) {
  if (newCookies) {
    const cookieLines = Array.isArray(newCookies) ? newCookies : [newCookies];
    const cookieString = cookieLines.join('; ');
    if (cookieString.length > douyinCookies.length) {
      douyinCookies = cookieString;
      fs.writeFileSync(COOKIE_FILE, douyinCookies, 'utf-8');
    }
  }
}

async function parseDouyin(url) {
  try {
    const { data: html, headers } = await fetchWithOptions(url, {
      headers: { 'Referer': 'https://www.douyin.com/' },
    });

    await saveCookies(headers['set-cookie']);

    const videoIdMatch = html.match(/videoId["']?\s*[:=]\s*["']([^"']+)["']/);
    const awemeIdMatch = html.match(/aweme_id["']?\s*[:=]\s*["']([^"']+)["']/);
    const videoId = videoIdMatch ? videoIdMatch[1] : (awemeIdMatch ? awemeIdMatch[1] : null);
    
    if (!videoId) {
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
            duration: Math.floor(detail.duration / 1000) ? formatDuration(detail.duration / 1000) : '01:00',
            resolution: '1080p',
            platform: 'douyin',
          };
        }
      }
    } catch (e) {}

    const playUrlMatch = html.match(/playAddr["']?\s*[:=]\s*["']([^"']+)["']/);
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

    return null;
  } catch (e) {
    return null;
  }
}

async function parseBilibili(url) {
  return new Promise((resolve) => {
    const args = [
      '--no-warnings',
      '--ignore-errors',
      '--dump-json',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
    ];
    args.push(url);

    const ytDlpPath = process.env.YT_DLP_PATH || '/usr/local/bin/yt-dlp';
    const ytDlp = spawn(ytDlpPath, args, {
      env: { ...process.env, PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin' }
    });
    let output = '';

    ytDlp.stdout.on('data', (data) => output += data.toString());
    ytDlp.stderr.on('data', () => {});
    
    ytDlp.on('error', () => resolve(null));

    ytDlp.on('close', (code) => {
      try {
        if (output) {
          const info = JSON.parse(output);
          let downloadUrl = info.url || '';
          if (!downloadUrl && info.formats && info.formats.length > 0) {
            const mp4Formats = info.formats.filter(f => f.ext === 'mp4' && f.url);
            if (mp4Formats.length > 0) {
              downloadUrl = mp4Formats[mp4Formats.length - 1].url;
            } else {
              downloadUrl = info.formats[info.formats.length - 1].url;
            }
          }
          resolve({
            title: info.title || 'B站视频',
            downloadUrl: downloadUrl,
            thumbnail: info.thumbnail || '',
            duration: formatDuration(info.duration || 60),
            resolution: info.width ? `${info.width}p` : '1080p',
            fps: info.fps || 30,
            platform: 'bilibili',
          });
        } else {
          resolve(null);
        }
      } catch (e) {
        resolve(null);
      }
    });

    setTimeout(() => {
      ytDlp.kill();
      resolve(null);
    }, 45000);
  });
}

async function parseOther(url, platform) {
  try {
    const { data: html } = await fetchWithOptions(url, {
      headers: { 'Referer': url },
    });

    const videoTagMatch = html.match(/<video[^>]*src=["']([^"']+)["']/);
    if (videoTagMatch) {
      return {
        title: `${platform}视频`,
        downloadUrl: videoTagMatch[1],
        thumbnail: '',
        duration: '01:00',
        resolution: '1080p',
        platform,
      };
    }

    const playUrlMatch = html.match(/playUrl["']?\s*[:=]\s*["']([^"']+)["']/);
    if (playUrlMatch) {
      return {
        title: `${platform}视频`,
        downloadUrl: playUrlMatch[1],
        thumbnail: '',
        duration: '01:00',
        resolution: '1080p',
        platform,
      };
    }

    return null;
  } catch (e) {
    return null;
  }
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function detectPlatform(url) {
  if (url.includes('douyin.com') || url.includes('v.douyin.com')) return 'douyin';
  if (url.includes('bilibili.com') || url.includes('b23.tv')) return 'bilibili';
  if (url.includes('xiaohongshu.com') || url.includes('xhs.link')) return 'xiaohongshu';
  if (url.includes('kuaishou.com') || url.includes('ks.com')) return 'kuaishou';
  return 'unknown';
}

app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  
  if (!url || typeof url !== 'string') {
    return res.json({ success: false, message: '请输入视频链接' });
  }

  const platform = detectPlatform(url);
  if (platform === 'unknown') {
    return res.json({ success: false, message: '暂不支持该平台' });
  }

  let video = null;

  if (platform === 'douyin') {
    video = await parseDouyin(url);
  } else if (platform === 'bilibili') {
    video = await parseBilibili(url);
  } else {
    video = await parseOther(url, platform);
  }

  if (video && video.downloadUrl) {
    res.json({ success: true, message: '视频提取成功', video });
  } else {
    const needLogin = platform === 'douyin' && !douyinCookies;
    const message = needLogin 
      ? '需要先登录抖音，请在浏览器中打开 https://www.douyin.com 登录后再试' 
      : '提取失败，该视频可能是私密或受限制视频';
    res.json({ success: false, message });
  }
});

app.post('/api/set-cookies', async (req, res) => {
  const { cookies } = req.body;
  if (cookies) {
    douyinCookies = cookies;
    fs.writeFileSync(COOKIE_FILE, cookies, 'utf-8');
    res.json({ success: true, message: 'Cookie已保存' });
  } else {
    res.json({ success: false, message: '请提供Cookie' });
  }
});

app.get('/api/cookies-status', (req, res) => {
  res.json({ hasCookies: !!douyinCookies });
});

app.get('/api/history', (req, res) => {
  res.json({ success: true, data: [] });
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});