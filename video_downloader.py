#!/usr/bin/env python3
"""
抖音视频下载器 - 支持公开视频提取
使用方法：python video_downloader.py [视频链接]
或者直接运行脚本，按提示输入链接
"""

import sys
import re
import os
import json
import subprocess
import urllib.parse
import time

def extract_url(text):
    """从文本中提取URL"""
    pattern = r'https?://[^\s,，。！!？?]+'
    matches = re.findall(pattern, text)
    if matches:
        return matches[0].rstrip('，。！!？?')
    return text

def download_with_yt_dlp(url, output_dir='./downloads'):
    """使用yt-dlp下载视频"""
    os.makedirs(output_dir, exist_ok=True)
    
    yt_dlp_path = '/Users/hjx/Library/Python/3.14/bin/yt-dlp'
    if not os.path.exists(yt_dlp_path):
        yt_dlp_path = 'yt-dlp'
    
    cmd = [
        yt_dlp_path,
        '--no-warnings',
        '--ignore-errors',
        '--extract-audio',
        '--audio-format', 'mp3',
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '-o', f'{output_dir}/%(title)s.%(ext)s',
        '--write-thumbnail',
        '--embed-thumbnail',
        '--embed-metadata',
        url
    ]
    
    print(f"\n正在下载: {url}")
    print("=" * 50)
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0:
            print("\n✓ 下载成功！")
            print(f"输出目录: {output_dir}")
            
            output_files = os.listdir(output_dir)
            video_files = [f for f in output_files if f.endswith('.mp4')]
            
            if video_files:
                print(f"\n已下载视频:")
                for video in video_files:
                    file_path = os.path.join(output_dir, video)
                    file_size = os.path.getsize(file_path) / (1024 * 1024)
                    print(f"  - {video} ({file_size:.2f} MB)")
            return True
        else:
            print(f"\n✗ 下载失败:")
            if result.stderr:
                error_lines = result.stderr.strip().split('\n')
                for line in error_lines[-3:]:
                    print(f"  {line}")
            return False
    except subprocess.TimeoutExpired:
        print("✗ 下载超时")
        return False
    except FileNotFoundError:
        print("✗ 未找到yt-dlp，请先安装: pip install yt-dlp")
        return False
    except Exception as e:
        print(f"✗ 下载出错: {e}")
        return False

def download_with_cookies(url, output_dir='./downloads'):
    """尝试使用浏览器cookie下载"""
    os.makedirs(output_dir, exist_ok=True)
    
    yt_dlp_path = '/Users/hjx/Library/Python/3.14/bin/yt-dlp'
    if not os.path.exists(yt_dlp_path):
        yt_dlp_path = 'yt-dlp'
    
    cmd = [
        yt_dlp_path,
        '--no-warnings',
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '-o', f'{output_dir}/%(title)s.%(ext)s',
        '--cookies-from-browser', 'chrome',
        url
    ]
    
    print("\n正在尝试使用浏览器Cookie下载...")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0:
            print("✓ 使用Cookie下载成功！")
            return True
        else:
            print("Cookie下载失败，尝试无Cookie模式...")
            return download_with_yt_dlp(url, output_dir)
    except Exception as e:
        print(f"Cookie模式出错: {e}")
        return download_with_yt_dlp(url, output_dir)

def main():
    print("=" * 50)
    print("🎬 抖音视频下载器")
    print("=" * 50)
    print("支持平台: 抖音、B站、小红书、快手")
    print("=" * 50)
    
    if len(sys.argv) > 1:
        url = ' '.join(sys.argv[1:])
    else:
        url = input("\n请输入视频链接或分享文案: ").strip()
    
    if not url:
        print("错误: 请输入有效链接")
        sys.exit(1)
    
    url = extract_url(url)
    print(f"\n识别到链接: {url}")
    
    platform = "未知"
    if 'douyin' in url or 'tiktok' in url:
        platform = "抖音"
    elif 'bilibili' in url or 'b23' in url:
        platform = "B站"
    elif 'xiaohongshu' in url or 'xhs' in url:
        platform = "小红书"
    elif 'kuaishou' in url or 'ks' in url:
        platform = "快手"
    
    print(f"平台: {platform}")
    
    if platform == "抖音":
        print("\n提示: 抖音视频需要登录才能下载")
        print("如果下载失败，请确保Chrome浏览器已登录抖音账号")
        success = download_with_cookies(url)
    else:
        success = download_with_yt_dlp(url)
    
    if success:
        print("\n🎉 下载完成！")
    else:
        print("\n❌ 下载失败，请检查链接是否有效")
        print("或者尝试在Chrome浏览器中登录对应平台账号后再试")

if __name__ == '__main__':
    main()