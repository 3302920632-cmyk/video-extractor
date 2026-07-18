# 视频提取器 - 纯 HTML 部署指南

## 架构

```
用户浏览器 (HTML) → Supabase Edge Functions (中转解析) → 视频平台 API
```

**纯前端 + Serverless，零后端部署成本！**

---

## 快速部署（3 分钟）

### 第一步：准备 Supabase 项目

1. 注册/登录 [Supabase](https://supabase.com)
2. 创建新项目
3. 复制 **Project URL** 和 **API Keys**（Settings → API）

### 第二步：部署 Edge Function

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录
supabase login

# 关联项目（输入你的 Project ID）
supabase link --project-ref your-project-ref

# 部署 Edge Function
supabase functions deploy video-extract --no-verify-jwt
```

或者在 Supabase Dashboard 手动部署：
1. 进入 **Edge Functions** 页面
2. 点击 **New function**
3. 命名为 `video-extract`
4. 将 `supabase/functions/video-extract/index.ts` 内容粘贴进去
5. 点击 **Deploy**

### 第三步：上传 HTML 文件

有两种方式：

#### 方式 A：Supabase Storage（推荐）
1. 进入 **Storage** 页面
2. 创建新 bucket（public）
3. 上传 `video-extractor.html`
4. 获取公共 URL

#### 方式 B：GitHub Pages / Vercel / Netlify
```bash
# GitHub Pages
git add video-extractor.html
git commit -m "Add video extractor"
git push

# Vercel
npx vercel --prod

# Netlify
npx netlify deploy --prod
```

### 第四步：配置 Supabase 密钥

1. 打开网页
2. 点击 **⚙️ 配置** 按钮
3. 填入：
   - **Project URL**: `https://xxxx.supabase.co`
   - **Public Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`（anon/public key）
4. 点击 **保存**

配置会自动保存到浏览器 localStorage，下次无需重复配置。

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `video-extractor.html` | 纯 HTML 前端（单文件，可直接打开） |
| `supabase/functions/video-extract/index.ts` | Supabase Edge Function 后端 |

---

## 支持平台

- ✅ 抖音
- ✅ B站（哔哩哔哩）
- ✅ 小红书
- ✅ 快手

---

## 特性

- 📱 完美适配手机端
- 🌙 暗色主题
- 🔒 纯前端，无用户数据收集
- 💾 配置本地存储，一次配置永久有效
- ⚡ Serverless 边缘函数，全球低延迟
- 🆓 免费额度足够个人使用

---

## Edge Function 免费额度

Supabase 免费套餐：
- 50,000 次请求/月
- 每个函数 10s 超时
- 对于个人使用完全够用

---

## 常见问题

### Q: 为什么需要配置 Supabase？
A: Edge Function 需要在 Supabase 平台上运行，它充当视频平台的解析中转。

### Q: 数据安全吗？
A: 完全安全。所有请求直接从浏览器发送到 Supabase，不经过任何第三方服务器。

### Q: 可以自定义域名吗？
A: 可以。Supabase Storage 和 Edge Functions 都支持绑定自定义域名。

### Q: B站视频下载需要登录吗？
A: 大多数公开视频不需要。私密视频或大会员视频可能无法提取。

---

## 开发调试

```bash
# 本地测试 Edge Function
supabase start
supabase functions serve
supabase functions deploy video-extract --local
```

---

## License

MIT
