import { useEffect, useState } from 'react';
import { History, Trash2, Play, ExternalLink } from 'lucide-react';
import { useStore } from '../store';
import { HistoryItem } from '../types';

export function HistoryPage() {
  const { user, history, setHistory, addToast } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/history?user_id=${user.id}`);
      const result = await response.json();
      if (result.success) {
        setHistory(result.data || []);
      }
    } catch (error) {
      console.error('获取历史记录失败:', error);
      addToast('获取历史记录失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/history/${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        setHistory(history.filter((item) => item.id !== id));
        addToast('删除成功', 'success');
      } else {
        addToast('删除失败', 'error');
      }
    } catch (error) {
      console.error('删除失败:', error);
      addToast('删除失败', 'error');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="glass-card rounded-2xl p-12">
          <History className="w-16 h-16 mx-auto text-gray-500 mb-6" />
          <h2 className="text-2xl font-semibold text-gray-300 mb-4">请先登录</h2>
          <p className="text-gray-500">登录后可以查看和管理您的提取历史</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <History className="w-8 h-8 text-indigo-400" />
        <h1 className="text-2xl font-semibold text-white">提取历史</h1>
      </div>

      {loading ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400 mt-4">加载中...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <History className="w-16 h-16 mx-auto text-gray-500 mb-6" />
          <h2 className="text-xl font-semibold text-gray-300 mb-4">暂无提取记录</h2>
          <p className="text-gray-500">去首页提取视频后，记录会保存在这里</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((item) => (
            <div
              key={item.id}
              className="glass-card rounded-xl p-4 flex items-center gap-4 hover:bg-white/5 transition-all duration-300"
            >
              <img
                src={item.thumbnail}
                alt={item.title}
                className="w-20 h-20 object-cover rounded-lg"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white truncate">{item.title}</h3>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                  <span>{item.platform}</span>
                  <span>{formatDate(item.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-all duration-300"
                  title="查看原链接"
                >
                  <ExternalLink size={18} />
                </a>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-300"
                  title="删除记录"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}