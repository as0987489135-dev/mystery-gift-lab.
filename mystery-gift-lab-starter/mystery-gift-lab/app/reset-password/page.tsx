"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.session) {
        setNotice("重設密碼連結無效或已過期。請回登入頁重新申請一封重設密碼信。");
      }
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) {
        setNotice("");
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function updatePassword() {
    if (password.length < 6) {
      setNotice("新密碼至少需要 6 個字元。");
      return;
    }
    if (password !== confirmPassword) {
      setNotice("兩次輸入的新密碼不一致，請重新確認。");
      return;
    }

    setBusy(true);
    setNotice("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setNotice("更新密碼失敗：" + error.message);
      setBusy(false);
      return;
    }

    setNotice("密碼更新成功！即將返回登入頁。");
    setBusy(false);
    window.setTimeout(() => {
      window.location.href = "/";
    }, 1200);
  }

  return (
    <main className="page">
      <header className="hero">
        <div className="eyebrow">🎁 MYSTERY GIFT LAB</div>
        <h1>設定新密碼</h1>
        <p className="intro">請輸入並確認你要使用的新密碼。</p>
      </header>
      <section className="panel">
        {!ready ? (
          <p className="muted">正在確認重設密碼連結……</p>
        ) : notice.startsWith("重設密碼連結無效") ? (
          <p className="notice error">{notice}</p>
        ) : (
          <>
            <label>新密碼</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="至少 6 個字元"
            />
            <label>再次輸入新密碼</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="請再次輸入新密碼"
            />
            <button disabled={busy} onClick={updatePassword}>
              {busy ? "更新中……" : "確認更新密碼"}
            </button>
            {notice && <p className="notice ok">{notice}</p>}
          </>
        )}
        <button className="ghost" onClick={() => { window.location.href = "/"; }}>
          返回登入頁
        </button>
      </section>
      <footer>Made with 🎁, ✨ and a little mystery.</footer>
    </main>
  );
}
