import puppeteer, { Browser, Page } from 'puppeteer';
import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

export interface VideoInfo {
  id: string;
  title: string;
  duration: string;
  resolution: string;
  fps: number;
  thumbnail: string;
  downloadUrl: string;
  platform: string;
}

export interface ExtractResult {
  success: boolean;
  message: string;
  video?: VideoInfo;
}

function detectPlatform(url: string): string | null {
  if (url.includes('douyin') || url.includes('tiktok')) {
    return 'douyin';
  } else if (url.includes('bilibili') || url.includes('b23')) {
    return 'bilibili';
  } else if (url.includes('xiaohongshu') || url.includes('xhs')) {
    return 'xiaohongshu';
  } else if (url.includes('kuaishou') || url.includes('ks')) {
    return 'kuaishou';
  }
  return null;
}

const USER_DATA_DIR = path.join(process.cwd(), '.browser-data');
let browserInstance: Browser | null = null;

async function getBrowser(headless: boolean = true): Promise<Browser> {
  if (browserInstance && !browserInstance.process().killed) {
    return browserInstance;
  }

  const browser = await puppeteer.launch({
    headless: headless,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
      '--user-data-dir=' + USER_DATA_DIR,
      '--start-maximized',
      '--ignore-certificate-errors',
    ],
    defaultViewport: null,
  });

  browserInstance = browser;

  browser.on('disconnected', () => {
    browserInstance = null;
  });

  return browser;
}

async function extractWithBrowser(url: string, platform: string): Promise<VideoInfo | null> {
  const browser = await getBrowser(true);

  try {
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
      (window as any).chrome = { runtime: {} };
    });

    const videoUrls: string[] = [];
    let pageTitle = '';
    let thumbnail = '';

    page.on('response', async (response) => {
      try {
        const responseUrl = response.url();

        if (responseUrl.includes('.mp4') || responseUrl.includes('video') || responseUrl.includes('play')) {
          const contentType = response.headers()['content-type'];
          if (contentType && contentType.includes('video')) {
            videoUrls.push(responseUrl);
          }
        }

        if (platform === 'douyin' && responseUrl.includes('/aweme/v1/')) {
          try {
            const data = await response.json();
            if (data && data.item_list && data.item_list[0]) {
              const item = data.item_list[0];
              const video = item.video || item;
              if (video.play_addr?.url_list) {
                videoUrls.push(...video.play_addr.url_list);
              }
              if (item.desc) pageTitle = item.desc;
              if (video.cover?.url_list) thumbnail = video.cover.url_list[0];
            }
          } catch (e) {}
        }

        if (platform === 'bilibili' && (responseUrl.includes('/player') || responseUrl.includes('/playurl'))) {
          try {
            const data = await response.json();
            const dash = data.data?.dash;
            const durl = data.data?.durl;
            if (dash?.video) {
              dash.video.forEach((v: any) => {
                if (v.baseUrl) videoUrls.push(v.baseUrl);
              });
            } else if (durl) {
              durl.forEach((v: any) => {
                if (v.url) videoUrls.push(v.url);
              });
            }
          } catch (e) {}
        }

        if (platform === 'xiaohongshu' && responseUrl.includes('/api/sns/v3/note')) {
          try {
            const data = await response.json();
            const note = data.data;
            if (note?.video?.url) videoUrls.push(note.video.url);
            if (note?.title) pageTitle = note.title;
            if (note?.image_list?.[0]?.url) thumbnail = note.image_list[0].url;
          } catch (e) {}
        }
      } catch (e) {}
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await new Promise(resolve => setTimeout(resolve, 5000));

    pageTitle = (await page.title()) || pageTitle;

    const domVideo = await page.$('video');
    if (domVideo) {
      const src = await domVideo.evaluate((v) => v.src || v.getAttribute('data-src'));
      if (src) videoUrls.push(src);
      const poster = await domVideo.evaluate((v) => v.poster);
      if (poster) thumbnail = poster;
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    const scripts = await page.$$('script');
    for (const script of scripts) {
      const content = await script.evaluate((s) => s.textContent);
      if (!content) continue;

      if (content.includes('playAddr') || content.includes('video_url')) {
        const match = content.match(/playAddr["']?\s*[:=]\s*["']([^"']+)["']/) ||
                      content.match(/video_url["']?\s*[:=]\s*["']([^"']+)["']/);
        if (match) videoUrls.push(match[1]);
      }

      if (platform === 'bilibili' && content.includes('__playinfo__')) {
        const match = content.match(/__playinfo__\s*=\s*({.+?});/);
        if (match) {
          try {
            const playinfo = JSON.parse(match[1]);
            const dash = playinfo.data?.dash;
            if (dash?.video) {
              dash.video.forEach((v: any) => {
                if (v.baseUrl) videoUrls.push(v.baseUrl);
              });
            }
          } catch (e) {}
        }
      }
    }

    await page.close();

    const validUrls = videoUrls.filter((u) => u && u.startsWith('http'));

    if (validUrls.length > 0) {
      const bestUrl = validUrls[validUrls.length - 1];
      return {
        id: 'vid_' + Date.now(),
        title: pageTitle || platform + ' video',
        duration: '01:00',
        resolution: '1080p',
        fps: 30,
        thumbnail: thumbnail || 'https://www.w3schools.com/html/img_mountain.jpg',
        downloadUrl: bestUrl,
        platform,
      };
    }

    return null;
  } catch (error) {
    console.error('Browser extraction failed:', error);
    return null;
  }
}

async function extractWithThirdPartyAPI(url: string, platform: string): Promise<VideoInfo | null> {
  const apis = [
    { url: 'https://apione.apibyte.cn/api/video6', code: 200 },
    { url: 'https://www.xiaoapi.cn/api/video', code: 200 },
    { url: 'https://api.wookong.xyz/api/video/getVideoInfo', code: 1 },
    { url: 'https://api.pingcc.cn/api/video', code: 200 },
    { url: 'https://www.mojieai.cn/api/video', code: 200 },
    { url: 'https://api.songshuhui.net/api/video', code: 200 },
    { url: 'https://api.censhuai.cn/api/video', code: 200 },
  ];

  for (const api of apis) {
    try {
      const response = await axios.get(api.url, { params: { url }, timeout: 30000 });
      const data = response.data;
      if (data.code === api.code && data.data) {
        const videoData = data.data;
        let downloadUrl = '';
        let title = '';
        let thumbnail = '';

        if (videoData.video_url) downloadUrl = videoData.video_url;
        else if (videoData.playUrl) downloadUrl = videoData.playUrl;
        else if (videoData.url) downloadUrl = videoData.url;

        if (videoData.title) title = videoData.title;
        else if (videoData.desc) title = videoData.desc;

        if (videoData.cover_url) thumbnail = videoData.cover_url;
        else if (videoData.cover) thumbnail = videoData.cover;

        if (downloadUrl) {
          return {
            id: 'vid_' + Date.now(),
            title: title || platform + ' video',
            duration: '01:00',
            resolution: '1080p',
            fps: 30,
            thumbnail: thumbnail || 'https://www.w3schools.com/html/img_mountain.jpg',
            downloadUrl: downloadUrl,
            platform,
          };
        }
      }
    } catch (error: any) {
      console.error('API failed:', api.url, error.message);
    }
  }
  return null;
}

async function extractWithYtDlp(url: string, platform: string): Promise<VideoInfo | null> {
  try {
    const ytDlpPath = '/Users/hjx/Library/Python/3.14/bin/yt-dlp';
    const command = ytDlpPath + ' --dump-json "' + url + '"';
    const { stdout } = await execPromise(command, { timeout: 30000 });

    if (!stdout) return null;

    const data = JSON.parse(stdout);
    const formats = data.formats || [];
    const bestFormat = formats.length > 0 ? formats[formats.length - 1] : data;

    return {
      id: data.id || 'vid_' + Date.now(),
      title: data.title || platform + ' video',
      duration: data.duration ? formatDuration(data.duration) : '01:00',
      resolution: bestFormat.resolution || bestFormat.width ? bestFormat.width + 'p' : '1080p',
      fps: bestFormat.fps || 30,
      thumbnail: data.thumbnail || 'https://www.w3schools.com/html/img_mountain.jpg',
      downloadUrl: bestFormat.url || data.url || '',
      platform,
    };
  } catch (error: any) {
    console.error('yt-dlp failed:', error.message);
    return null;
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
}

export async function extractVideo(url: string): Promise<ExtractResult> {
  const platform = detectPlatform(url);

  if (!platform) {
    return { success: false, message: 'Unsupported platform' };
  }

  try {
    let videoInfo: VideoInfo | null = null;

    videoInfo = await extractWithThirdPartyAPI(url, platform);

    if (!videoInfo && platform === 'bilibili') {
      videoInfo = await extractWithYtDlp(url, platform);
    }

    if (!videoInfo) {
      videoInfo = await extractWithBrowser(url, platform);
    }

    if (videoInfo && videoInfo.downloadUrl) {
      return {
        success: true,
        message: 'Video extracted successfully',
        video: videoInfo,
      };
    } else {
      return {
        success: false,
        message: 'Login required. Please click "Start Browser" button to login first.',
      };
    }
  } catch (error) {
    console.error('Video extraction error:', error);
    return { success: false, message: 'Video extraction failed, please try again later' };
  }
}

export async function initBrowser(): Promise<{ success: boolean; message: string }> {
  try {
    const browser = await getBrowser(false);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto('https://www.douyin.com/', { waitUntil: 'networkidle2', timeout: 60000 });

    return {
      success: true,
      message: 'Browser started. Please login to Douyin in the popped browser window. Once logged in, close the browser and try extracting videos.',
    };
  } catch (error: any) {
    return { success: false, message: 'Browser start failed: ' + error.message };
  }
}