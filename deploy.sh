#!/bin/bash
# 一键部署脚本 - 上传 HTML 到 Supabase Storage
# 用法: bash deploy.sh

SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlmb2htZWZ6bmVxd2N2bHhteXp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDI4NzY5NywiZXhwIjoyMDk5ODYzNjk3fQ.6ZOVEmrj1XCOQqwgbiXielETAp3OB1Hp4DQz_xduCsE"
PROJECT_REF="ifohmefzneqwcvlxmyzv"
HTML_FILE="${1:-video-extractor.html}"

echo "🚀 部署视频提取器..."
echo "文件: $HTML_FILE"

# 上传
RESPONSE=$(curl -s --connect-timeout 30 -X POST "https://$PROJECT_REF.supabase.co/storage/v1/object/public/static/$HTML_FILE" \
  -H "apikey: $PROJECT_REF" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Cache-Control: public, max-age=31536000" \
  --data-binary @"$HTML_FILE")

if echo "$RESPONSE" | grep -q '"Key"'; then
  echo "✅ 部署成功!"
  echo ""
  echo "📱 访问地址:"
  echo "https://$PROJECT_REF.supabase.co/storage/v1/object/public/static/$HTML_FILE"
else
  echo "❌ 部署失败: $RESPONSE"
  exit 1
fi
