# 📱 视频提取器 - 纯 HTML 版

## 快速开始

### 1️⃣ 准备 Supabase
- 注册 https://supabase.com
- 创建项目，获取 Project URL 和 API Key

### 2️⃣ 部署 Edge Function
```bash
# 安装 CLI
npm install -g supabase

# 登录 & 关联项目
supabase login
supabase link --project-ref YOUR_PROJECT_ID

# 部署函数
supabase functions deploy video-extract --no-verify-jwt
```

### 3️⃣ 上传 HTML
直接将 `video-extractor.html` 上传到：
- Supabase Storage
- GitHub Pages
- Vercel / Netlify
- 任何静态托管服务

### 4️⃣ 配置使用
1. 打开网页
2. 点击 **⚙️ 配置**
3. 填入 Supabase Project URL 和 Public Key
4. 保存后即可使用！

---

## 架构

```
手机/电脑浏览器
    ↓ (HTTPS)
Supabase Edge Function (视频解析中转)
    ↓
抖音/B站/小红书/快手 API
    ↓
返回视频下载链接
```

**零后端服务器！Serverless！全球低延迟！**

---

## 支持平台

| 平台 | 状态 |
|------|------|
| 抖音 | ✅ |
| B站 | ✅ |
| 小红书 | ✅ |
| 快手 | ✅ |

---

## 特性

- 📱 完美移动端适配
- 🌙 暗色主题
- 🔒 隐私保护（无数据收集）
- 💾 本地配置存储
- ⚡ Serverless 边缘计算
- 🆓 免费额度充足

---

## 详细部署文档

查看 [PURE_HTML_DEPLOY.md](./PURE_HTML_DEPLOY.md) 获取完整部署指南。
