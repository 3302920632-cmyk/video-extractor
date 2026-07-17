import { useState } from 'react';
import { Download, Settings, Share2, Play, Clock, Monitor, Activity, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { ExtractResult } from '../types';

const PLATFORMS = [
  { name: '抖音', domain: 'douyin' },
  { name: 'B站', domain: 'bilibili' },
  { name: '小红书', domain: 'xiaohongshu' },
  { name: '快手', domain: 'kuaishou' },
];

export function Home() {
  const [url, setUrl] = useState('');
  const [showQRCode, setShowQRCode] = useState(false);
  const {
    currentVideo,
    setCurrentVideo,
    isExtracting,
    setIsExtracting,
    showQualitySection,
    toggleQualitySection,
    showShareSection,
    toggleShareSection,
    selectedResolution,
    setSelectedResolution,
    selectedFrameRate,
    setSelectedFrameRate,
    selectedQuality,
    setSelectedQuality,
    addToast,
    user,
    addHistoryItem,
  } = useStore();

  const extractUrlFromText = (text: string): string => {
    const urlPatterns = [
      /https?:\/\/v\.douyin\.com\/[\w\/]+/gi,
      /https?:\/\/www\.douyin\.com\/[\w\/]+/gi,
      /https?:\/\/www\.bilibili\.com\/video\/[\w\/]+/gi,
      /https?:\/\/b23\.tv\/[\w\/]+/gi,
      /https?:\/\/www\.xiaohongshu\.com\/[\w\/]+/gi,
      /https?:\/\/xhs\.link\/[\w\/]+/gi,
      /https?:\/\/www\.kuaishou\.com\/[\w\/]+/gi,
      /https?:\/\/www\.ks\.com\/[\w\/]+/gi,
      /https?:\/\/v\.kuaishou\.com\/[\w\/]+/gi,
    ];

    for (const pattern of urlPatterns) {
      const match = text.match(pattern);
      if (match && match[0]) {
        return match[0];
      }
    }

    const generalUrlMatch = text.match(/https?:\/\/[^\s]+/);
    return generalUrlMatch ? generalUrlMatch[0] : text;
  };

  const handleExtract = async () => {
    if (!url.trim()) {
      addToast('请输入视频链接', 'error');
      return;
    }

    const extractedUrl = extractUrlFromText(url);
    const isValidPlatform = PLATFORMS.some((p) => extractedUrl.includes(p.domain));
    
    if (!isValidPlatform) {
      addToast('暂不支持该平台', 'error');
      return;
    }

    setIsExtracting(true);
    addToast('正在提取视频...', 'info');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: extractedUrl }),
      });

      const result: ExtractResult = await response.json();

      if (result.success && result.video) {
        setCurrentVideo(result.video);
        addToast('视频提取成功！', 'success');

        if (user) {
          await fetch(`${import.meta.env.VITE_API_URL}/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: user.id,
              url: extractedUrl,
              title: result.video.title,
              thumbnail: result.video.thumbnail,
              platform: result.video.platform,
            }),
          });
        }
      } else {
        addToast(result.message || '提取失败，该视频可能是私密或受限制视频', 'error');
      }
    } catch (error) {
      console.error('提取失败:', error);
      addToast('提取视频失败，请检查网络连接', 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDownload = () => {
    if (!currentVideo) return;
    const link = document.createElement('a');
    link.href = currentVideo.downloadUrl;
    link.download = `${currentVideo.title}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('开始下载视频...', 'success');
  };

  const handleApplyQuality = () => {
    if (!currentVideo) return;
    addToast(`正在应用${selectedResolution}分辨率、${selectedFrameRate}fps帧率增强...`, 'info');
    setTimeout(() => {
      setCurrentVideo({
        ...currentVideo,
        resolution: selectedResolution,
        fps: parseInt(selectedFrameRate),
      });
      addToast('画质增强已应用！', 'success');
    }, 2000);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      addToast('链接已复制到剪贴板', 'success');
    } catch {
      addToast('复制失败，请手动复制', 'error');
    }
  };

  const qualityOptions = [
    { id: 'hd', label: '高清增强', desc: '提升分辨率至720p，优化画面细节', resolution: '720p', fps: '30' },
    { id: 'fullhd', label: '超清增强', desc: '提升分辨率至1080p，增强画质', resolution: '1080p', fps: '60' },
    { id: 'ultrahd', label: '蓝光增强', desc: '提升分辨率至4K，极致画质体验', resolution: '4K', fps: '60' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent mb-4 animate-fadeInDown">
          🎬 视频提取器
        </h1>
        <p className="text-gray-400 text-lg mb-6 animate-fadeInUp">
          输入视频链接，一键提取、下载并分享
        </p>
        <div className="flex justify-center gap-4 flex-wrap">
          {PLATFORMS.map((platform) => (
            <span
              key={platform.name}
              className="px-4 py-2 rounded-full bg-white/5 border border-gray-700 text-gray-400 text-sm hover:bg-white/10 hover:border-indigo-500/50 transition-all duration-300"
            >
              {platform.name}
            </span>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleExtract()}
            placeholder="请输入抖音、B站、小红书、快手等视频分享链接..."
            className="flex-1 px-4 py-3 rounded-xl bg-gray-800/50 border border-gray-700 text-white placeholder-gray-500 focus:outline-none input-glow"
          />
          <button
            onClick={handleExtract}
            disabled={isExtracting}
            className="btn-primary px-8 py-3 rounded-xl text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExtracting ? (
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                提取中...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Download size={20} />
                提取视频
              </span>
            )}
          </button>
        </div>
        {isExtracting && (
          <div className="mt-4 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-loading"></div>
          </div>
        )}
      </div>

      {currentVideo && (
        <>
          <div className="glass-card rounded-2xl p-6 mb-6 animate-fadeInUp">
            <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden mb-6">
              <video
                controls
                className="w-full h-full object-contain"
                src={currentVideo.downloadUrl}
                poster={currentVideo.thumbnail}
              />
            </div>

            <div className="flex flex-wrap gap-4 mb-6 p-4 bg-white/5 rounded-xl">
              <div className="flex items-center gap-2 text-gray-300">
                <Play size={18} className="text-indigo-500" />
                <span className="font-semibold">标题:</span>
                <span className="text-gray-400 truncate max-w-xs">{currentVideo.title}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <Clock size={18} className="text-indigo-500" />
                <span className="font-semibold">时长:</span>
                <span className="text-gray-400">{currentVideo.duration}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <Monitor size={18} className="text-indigo-500" />
                <span className="font-semibold">分辨率:</span>
                <span className="text-gray-400">{currentVideo.resolution}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <Activity size={18} className="text-indigo-500" />
                <span className="font-semibold">帧率:</span>
                <span className="text-gray-400">{currentVideo.fps}fps</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleDownload}
                className="btn-success px-6 py-3 rounded-xl text-white font-semibold flex items-center gap-2"
              >
                <Download size={20} />
                下载视频
              </button>
              <button
                onClick={toggleQualitySection}
                className="btn-secondary px-6 py-3 rounded-xl text-white font-semibold flex items-center gap-2"
              >
                <Settings size={20} />
                画质增强
              </button>
              <button
                onClick={toggleShareSection}
                className="btn-secondary px-6 py-3 rounded-xl text-white font-semibold flex items-center gap-2"
              >
                <Share2 size={20} />
                分享
              </button>
            </div>
          </div>

          {showQualitySection && (
            <div className="glass-card rounded-2xl p-6 mb-6 animate-fadeInUp">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <Sparkles className="text-yellow-400" />
                画质增强设置
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {qualityOptions.map((option) => (
                  <div
                    key={option.id}
                    onClick={() => {
                      setSelectedQuality(option.id as 'hd' | 'fullhd' | 'ultrahd');
                      setSelectedResolution(option.resolution);
                      setSelectedFrameRate(option.fps);
                    }}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
                      selectedQuality === option.id
                        ? 'quality-card-selected'
                        : 'border-gray-700 bg-white/5 hover:border-indigo-500/50'
                    }`}
                  >
                    <h4 className="font-semibold text-white mb-2">{option.label}</h4>
                    <p className="text-gray-400 text-sm">{option.desc}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-gray-300 font-semibold mb-2">目标分辨率:</label>
                  <select
                    value={selectedResolution}
                    onChange={(e) => setSelectedResolution(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-700 text-white focus:outline-none input-glow"
                  >
                    <option value="720p">720p (高清)</option>
                    <option value="1080p">1080p (全高清)</option>
                    <option value="2K">2K (QHD)</option>
                    <option value="4K">4K (超高清)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-2">目标帧率:</label>
                  <select
                    value={selectedFrameRate}
                    onChange={(e) => setSelectedFrameRate(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-700 text-white focus:outline-none input-glow"
                  >
                    <option value="30">30 fps (标准)</option>
                    <option value="60">60 fps (流畅)</option>
                    <option value="120">120 fps (极速)</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleApplyQuality}
                className="btn-primary w-full py-3 rounded-xl text-white font-semibold"
              >
                应用增强
              </button>
            </div>
          )}

          {showShareSection && (
            <div className="glass-card rounded-2xl p-6 mb-6 animate-fadeInUp">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <Share2 className="text-indigo-400" />
                分享视频
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setShowQRCode(!showQRCode)}
                  className="flex flex-col items-center justify-center p-6 rounded-xl bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 transition-all duration-300"
                >
                  <svg viewBox="0 0 24 24" fill="#07c160" className="w-12 h-12 mb-3">
                    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.322-1.223a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.269-.03-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
                  </svg>
                  <span className="text-green-400 font-semibold">微信好友</span>
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex flex-col items-center justify-center p-6 rounded-xl bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 transition-all duration-300"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" className="w-12 h-12 mb-3">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  <span className="text-indigo-400 font-semibold">复制链接</span>
                </button>
              </div>

              {showQRCode && (
                <div className="mt-6 flex flex-col items-center p-6 bg-white rounded-xl">
                  <canvas id="qrCodeCanvas" width={200} height={200} className="mb-4"></canvas>
                  <p className="text-gray-700">扫码分享给微信好友</p>
                  <button
                    onClick={() => setShowQRCode(false)}
                    className="mt-4 text-gray-500 hover:text-gray-700"
                  >
                    关闭二维码
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}