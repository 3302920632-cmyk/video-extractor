import { useState } from 'react';
import { Home, History, User, LogIn, LogOut, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';

export function Header() {
  const location = useLocation();
  const { user, setUser, addToast } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'github' });
    if (error) {
      addToast('登录失败', 'error');
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      addToast('退出失败', 'error');
    } else {
      setUser(null);
      addToast('已退出登录', 'success');
    }
  };

  const navItems = [
    { path: '/', label: '首页', icon: Home },
    { path: '/history', label: '提取历史', icon: History },
    { path: '/profile', label: '个人中心', icon: User },
  ];

  return (
    <header className="sticky top-0 z-50 glass-card">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">🎬</span>
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              视频提取器
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-indigo-500/20 text-indigo-400'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-gray-300">{user.email}</span>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-300"
                >
                  <LogOut size={18} />
                  <span>退出</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-all duration-300"
              >
                <LogIn size={18} />
                <span>登录</span>
              </button>
            )}
          </div>

          <button
            className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-gray-700 pt-4">
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 ${
                      isActive
                        ? 'bg-indigo-500/20 text-indigo-400'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              {user ? (
                <button
                  onClick={() => {
                    handleSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-300 mt-2"
                >
                  <LogOut size={20} />
                  <span>退出登录</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    handleSignIn();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-all duration-300 mt-2"
                >
                  <LogIn size={20} />
                  <span>登录</span>
                </button>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}