# 媒体工具箱（纯 HTML 版）

微信小程序整体移植为纯静态网页 SPA，无需备案、无微信白名单限制。直接浏览器打开即可用，也可一键部署到任意静态托管。

## 功能
- 视频提取（抖音/快手/小红书/B站/豆包）：解析走 Supabase `video-extract`（已开 CORS），下载优先 CDN 直链（长按保存，无大小限制），兜底走 `video-proxy` 代理（≤6MB）。
- 音乐提取（批量）：抖音视频抽取 M4A 音轨（无损，不重编码）。
- 图片转 PDF：本地拼装标准 PDF，原像素嵌入。
- 去水印：图片本地框选/预设 模糊·马赛克·裁剪；豆包/千问链接走服务端解析原片；视频上传走 `watermark-remove`（需部署）。
- 智能压缩：图片 / PDF（内嵌 JPEG）/ PPTX（ZIP 内 JPEG），纯前端零外网。
- AI 生成：文生视频（锁定 1080p·24fps·7s）、AI 生图（1080p/4K），4 key 自动轮询，支持参考图（图生视频/图生图）、AI 提示词优化。

## 本地运行
任选其一：
- 直接双击 `index.html`（file:// 打开，绝大多数功能可用；个别浏览器对 file:// 的 fetch/剪贴板有限制，建议用本地服务器）。
- 本地服务器：
  ```
  cd web && python3 -m http.server 8777
  # 浏览器打开 http://localhost:8777
  ```

## 部署（免费、无需备案）
把整个 `web/` 目录作为静态站点上传即可：
- GitHub Pages：新建仓库 → 上传 `web/` 内文件 → Settings → Pages → 选分支根目录。
- Vercel / Cloudflare Pages：导入项目，Build 命令留空，Output 目录设为 `web`（或直接拖拽 `web/` 部署）。

## 配置说明
- 解析服务地址：默认 `https://ifohmefzneqwcvlxmyzv.supabase.co/functions/v1/video-extract`，在「我的」页可改。
- Agnes key：写死在 `lib/agnes.js`（仅自玩，key 暴露在前端）。共 4 个自动轮询。
- 小红书解析依赖服务端共享 Cookie，可在「我的」页由管理员更新。

## 目录结构
```
web/
├─ index.html        # SPA 骨架 + 全部样式 + 底部导航
├─ app.js            # 路由 + 各页面渲染逻辑
├─ lib/
│  ├─ records.js     # localStorage 历史记录
│  ├─ audio.js       # MP4→M4A 音轨抽取
│  ├─ extract.js     # 视频解析 + 代理下载
│  ├─ agnes.js       # Agnes 直连（视频/图/优化，4 key 轮询）
│  ├─ pdf.js         # 图片转 PDF
│  ├─ wm.js          # 去水印像素算法（模糊/马赛克）
│  ├─ compress.js    # 图片/PDF/PPTX 压缩
│  └─ fflate.js      # ZIP 解/压（PPTX 用）
└─ README.md
```
