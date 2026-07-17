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

export interface HistoryItem {
  id: string;
  user_id: string;
  url: string;
  title: string;
  thumbnail: string;
  platform: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}