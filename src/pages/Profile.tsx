import { User, Mail, Settings, HelpCircle, LogOut } from 'lucide-react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';

export function ProfilePage() {
  const { user, setUser, addToast } = useStore();

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      addToast('退出失败', 'error');
    } else {
      setUser(null);
      addToast('已退出登录', 'success');
    }
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="glass-card rounded-2xl p-12">
          <User className="w-16 h-16 mx-auto text-gray-500 mb-6" />
          <h2 className="text-2xl font-semibold text-gray-300 mb-4">请先登录</h2>
          <p className="text-gray-500">登录后可以管理您的个人信息和查看使用记录</p>
        </div>
      </div>
    );
  }

  const menuItems = [
    { icon: Settings, label: '账户设置', description: '修改密码、绑定手机等' },
    { icon: HelpCircle, label: '帮助与反馈', description: '常见问题解答和意见反馈' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <User className="w-8 h-8 text-indigo-400" />
        <h1 className="text-2xl font-semibold text-white">个人中心</h1>
      </div>

      <div className="glass-card rounded-2xl p-8 mb-6">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
            <User className="w-10 h-10 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">{user.name || '用户'}</h2>
            <div className="flex items-center gap-2 text-gray-400">
              <Mail size={16} />
              <span>{user.email}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-700">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-300"
          >
            <LogOut size={20} />
            <span>退出登录</span>
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              className={`w-full flex items-center gap-4 px-6 py-4 hover:bg-white/5 transition-all duration-300 ${
                index !== menuItems.length - 1 ? 'border-b border-gray-700' : ''
              }`}
            >
              <Icon className="w-5 h-5 text-indigo-400" />
              <div className="flex-1 text-left">
                <div className="font-semibold text-white">{item.label}</div>
                <div className="text-sm text-gray-400">{item.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 glass-card rounded-2xl p-6">
        <h3 className="font-semibold text-white mb-4">关于我们</h3>
        <p className="text-gray-400 text-sm leading-relaxed">
          视频提取器是一款帮助用户从各大视频平台提取视频内容的在线工具。我们致力于提供简单、便捷的视频下载体验。
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
          <span>版本: 1.0.0</span>
          <span>服务条款</span>
          <span>隐私政策</span>
        </div>
      </div>
    </div>
  );
}