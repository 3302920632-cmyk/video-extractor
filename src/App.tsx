import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Home } from "@/pages/Home";
import { HistoryPage } from "@/pages/History";
import { ProfilePage } from "@/pages/Profile";
import { Header } from "@/components/Header";
import { Toast } from "@/components/Toast";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/store";

export default function App() {
  const { setUser } = useStore();

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        setUser({
          id: data.session.user.id,
          email: data.session.user.email || '',
          name: data.session.user.user_metadata?.name || '',
          avatar_url: data.session.user.user_metadata?.avatar_url || '',
        });
      }
    };

    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name || '',
          avatar_url: session.user.user_metadata?.avatar_url || '',
        });
      } else {
        setUser(null);
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [setUser]);

  return (
    <Router>
      <div className="min-h-screen">
        <div className="bg-glow"></div>
        <div className="bg-glow-2"></div>
        <Header />
        <main className="relative z-10">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </main>
        <Toast />
      </div>
    </Router>
  );
}