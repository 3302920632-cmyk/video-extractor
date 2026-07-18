// Vercel Serverless Function: /api/set-cookies & /api/cookies-status
// Cookie 管理接口

const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(process.cwd(), '.douyin-cookie');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method === 'GET') {
    // /api/cookies-status
    const hasCookie = fs.existsSync(COOKIE_FILE);
    return res.status(200).json({ hasCookies: hasCookie });
  }
  
  if (req.method === 'POST') {
    // /api/set-cookies
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { cookies } = JSON.parse(body);
        if (cookies) {
          fs.writeFileSync(COOKIE_FILE, cookies, 'utf-8');
          res.status(200).json({ success: true, message: 'Cookie已保存' });
        } else {
          res.status(400).json({ success: false, message: '请提供Cookie' });
        }
      } catch (e) {
        res.status(400).json({ success: false, message: '请求格式错误' });
      }
    });
  }
};
