 "use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

type Notice = { kind: "ok" | "error"; text: string } | null;

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activityName, setActivityName] = useState("2026 神秘交換禮物派對");
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signUp() {
    setBusy(true); setNotice(null);
    const { error } = await supabase.auth.signUp({ email, password });
    setNotice(error
      ? { kind: "error", text: error.message }
      : { kind: "ok", text: "註冊要求已送出。若系統要求信箱驗證，請先至 Email 收信完成驗證，再登入。" });
    setBusy(false);
  }

  async function signIn() {
    setBusy(true); setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setNotice(error ? { kind: "error", text: error.message } : { kind: "ok", text: "登入成功！" });
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setNotice({ kind: "ok", text: "已登出。" });
  }

  async function createActivity() {
    if (!activityName.trim()) return setNotice({ kind: "error", text: "請輸入活動名稱。" });
    setBusy(true); setNotice(null);
    const { data, error } = await supabase.rpc("gift_create_activity", { p_name: activityName.trim() });
    if (error) {
      setNotice({ kind: "error", text: `建立活動失敗：${error.message}` });
    } else {
      setNotice({ kind: "ok", text: `建立活動成功！資料庫回傳：${JSON.stringify(data)}。請先保留活動代碼；下一階段會加入完整活動管理畫面。` });
    }
    setBusy(false);
  }

  async function joinActivity() {
    if (!joinCode.trim() || !displayName.trim()) {
      return setNotice({ kind: "error", text: "請輸入活動代碼及參加者暱稱。" });
    }
    setBusy(true); setNotice(null);
    const { data, error } = await supabase.rpc("gift_join_activity", {
      p_code: joinCode.trim(),
      p_display_name: displayName.trim()
    });
    if (error) {
      setNotice({ kind: "error", text: `加入活動失敗：${error.message}` });
    } else {
      setNotice({ kind: "ok", text: `加入活動成功！資料庫回傳：${JSON.stringify(data)}。下一階段會接上問卷及禮物填寫頁面。` });
    }
    setBusy(false);
  }

  return (
    <main className="page">
      <div className="sparkle s1">✦</div><div className="sparkle s2">✧</div>
      <header className="hero">
        <div className="eyebrow">🎄 A LITTLE SECRET, A BIG SURPRISE 🎁</div>
        <h1>神秘禮物研究所</h1>
        <p className="subtitle">Mystery Gift Lab</p>
        <p className="intro">用一點點猜測，交換一份大大的驚喜！</p>
      </header>

      <section className="panel">
        {session ? (
          <>
            <div className="signed"><span className="dot" /> 已登入：{session.user.email}</div>
            <div className="sectionTitle">🎀 建立一場交換禮物</div>
            <label>活動名稱</label>
            <input value={activityName} onChange={e => setActivityName(e.target.value)} />
            <button disabled={busy} onClick={createActivity}>建立活動</button>
            <div className="divider"><span>或</span></div>
            <div className="sectionTitle">💌 加入朋友的活動</div>
            <label>活動代碼</label>
            <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="輸入主辦人提供的代碼" />
            <label>你的暱稱</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="大家會看到的名字" />
            <button className="secondary" disabled={busy} onClick={joinActivity}>加入活動</button>
            <button className="ghost" onClick={signOut}>登出</button>
          </>
        ) : (
          <>
            <div className="sectionTitle">✨ 登入研究所</div>
            <p className="muted">先登入或建立帳號，才能建立活動或加入朋友的派對。</p>
            <label>Email</label>
            <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
            <label>密碼</label>
            <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 碼" />
            <button disabled={busy} onClick={signIn}>登入</button>
            <button className="secondary" disabled={busy} onClick={signUp}>建立新帳號</button>
          </>
        )}
        {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
      </section>
      <footer>Made with 🎁, ✨ and a little mystery.</footer>
    </main>
  );
}
