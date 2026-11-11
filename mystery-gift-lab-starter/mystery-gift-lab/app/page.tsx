"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

type Notice = { kind: "ok" | "error"; text: string } | null;
type Activity = {
  id: string;
  activity_name: string;
  activity_code: string;
  status: string;
  created_at: string | null;
};
type Question = { id: string; question_no: number; question_text: string };
type Participant = { id: string; display_name: string; created_at: string | null };

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activityName, setActivityName] = useState("2026 神秘交換禮物派對");
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingQuestionText, setEditingQuestionText] = useState("");

  const loadActivities = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("gift_activities")
      .select("id, activity_name, activity_code, status, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      setNotice({ kind: "error", text: `讀取活動失敗：${error.message}` });
      return;
    }
    const rows = (data ?? []) as Activity[];
    setActivities(rows);
    setSelectedActivity(current => current ? rows.find(row => row.id === current.id) ?? null : null);
  }, []);

  const loadActivityDetails = useCallback(async (activity: Activity) => {
    const [questionResult, participantResult] = await Promise.all([
      supabase.from("gift_questions").select("id, question_no, question_text")
        .eq("activity_id", activity.id).order("question_no", { ascending: true }),
      supabase.from("gift_participants").select("id, display_name, created_at")
        .eq("activity_id", activity.id).order("created_at", { ascending: true })
    ]);
    if (questionResult.error) {
      setNotice({ kind: "error", text: `讀取題目失敗：${questionResult.error.message}` });
      setQuestions([]);
    } else setQuestions((questionResult.data ?? []) as Question[]);
    if (participantResult.error) {
      setNotice({ kind: "error", text: `讀取參加者失敗：${participantResult.error.message}` });
      setParticipants([]);
    } else setParticipants((participantResult.data ?? []) as Participant[]);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setActivities([]);
        setSelectedActivity(null);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user.id) void loadActivities(session.user.id);
  }, [session?.user.id, loadActivities]);

  useEffect(() => {
    if (selectedActivity) void loadActivityDetails(selectedActivity);
    else { setQuestions([]); setParticipants([]); }
  }, [selectedActivity?.id, loadActivityDetails]);

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
    if (error) setNotice({ kind: "error", text: `建立活動失敗：${error.message}` });
    else {
      setNotice({ kind: "ok", text: `建立活動成功！活動代碼：${data?.[0]?.activity_code ?? "請至下方活動列表查看"}` });
      if (session?.user.id) await loadActivities(session.user.id);
    }
    setBusy(false);
  }

  async function joinActivity() {
    if (!joinCode.trim() || !displayName.trim()) {
      return setNotice({ kind: "error", text: "請輸入活動代碼及參加者暱稱。" });
    }
    setBusy(true); setNotice(null);
    const { error } = await supabase.rpc("gift_join_activity", {
      p_code: joinCode.trim(),
      p_display_name: displayName.trim()
    });
    setNotice(error
      ? { kind: "error", text: `加入活動失敗：${error.message}` }
      : { kind: "ok", text: "加入活動成功！後續將接上問卷及禮物填寫頁面。" });
    setBusy(false);
  }

  async function addQuestion() {
    if (!selectedActivity || !newQuestion.trim()) return;
    setBusy(true); setNotice(null);
    const nextNo = questions.reduce((max, item) => Math.max(max, item.question_no), 0) + 1;
    const { error } = await supabase.from("gift_questions").insert({
      activity_id: selectedActivity.id,
      question_no: nextNo,
      question_text: newQuestion.trim()
    });
    if (error) setNotice({ kind: "error", text: `新增題目失敗：${error.message}` });
    else {
      setNewQuestion("");
      setNotice({ kind: "ok", text: "題目已新增。" });
      await loadActivityDetails(selectedActivity);
    }
    setBusy(false);
  }

  async function saveQuestion(questionId: string) {
    if (!selectedActivity || !editingQuestionText.trim()) return;
    setBusy(true); setNotice(null);
    const { error } = await supabase.from("gift_questions")
      .update({ question_text: editingQuestionText.trim() })
      .eq("id", questionId).eq("activity_id", selectedActivity.id);
    if (error) setNotice({ kind: "error", text: `修改題目失敗：${error.message}` });
    else {
      setEditingQuestionId(null);
      setNotice({ kind: "ok", text: "題目已更新。" });
      await loadActivityDetails(selectedActivity);
    }
    setBusy(false);
  }

  async function deleteQuestion(question: Question) {
    if (!selectedActivity || !window.confirm(`確定刪除「${question.question_text}」嗎？`)) return;
    setBusy(true); setNotice(null);
    const { error } = await supabase.from("gift_questions")
      .delete().eq("id", question.id).eq("activity_id", selectedActivity.id);
    if (error) setNotice({ kind: "error", text: `刪除題目失敗：${error.message}。若已有參加者作答，資料庫關聯限制可能會阻止刪除。` });
    else {
      setNotice({ kind: "ok", text: "題目已刪除。" });
      await loadActivityDetails(selectedActivity);
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

      <section className="panel mainPanel">
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

      {session && (
        <section className="dashboard">
          <div className="dashboardHeading">
            <div><div className="eyebrow">HOST STUDIO</div><h2>我的活動管理</h2><p>管理活動題目，查看參加者加入狀況。</p></div>
            <span className="countPill">{activities.length} 場活動</span>
          </div>
          <div className="activityLayout">
            <div className="activityList">
              {activities.length === 0 ? <div className="emptyState">目前還沒有活動，先建立一場交換禮物吧！</div> :
                activities.map(activity => (
                  <button key={activity.id} className={`activityCard ${selectedActivity?.id === activity.id ? "active" : ""}`}
                    onClick={() => setSelectedActivity(activity)}>
                    <span className="activityCardTop"><strong>{activity.activity_name}</strong><span className={`statusTag ${activity.status}`}>{activity.status === "open" ? "準備中" : activity.status}</span></span>
                    <span className="activityCode">活動代碼：{activity.activity_code}</span>
                    <span className="activityMeta">建立於 {activity.created_at ? new Date(activity.created_at).toLocaleDateString("zh-TW") : "—"}</span>
                  </button>
                ))}
            </div>
            <div className="managementPanel">
              {!selectedActivity ? <div className="emptyState">請先選擇左側的一場活動，開始管理題目及參加者。</div> : (
                <>
                  <div className="managementTitle"><div><span className="smallLabel">CURRENT ACTIVITY</span><h3>{selectedActivity.activity_name}</h3></div><span className="statusTag open">{selectedActivity.status === "open" ? "準備中" : selectedActivity.status}</span></div>
                  <div className="statGrid">
                    <div className="statBox"><strong>{questions.length}</strong><span>活動題目</span></div>
                    <div className="statBox"><strong>{participants.length}</strong><span>已加入參加者</span></div>
                  </div>
                  <div className="subheading">📝 題目管理 <span>可依活動自行新增、修改或刪除</span></div>
                  <div className="addQuestion">
                    <input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="輸入想新增的題目…" />
                    <button disabled={busy || !newQuestion.trim() || selectedActivity.status !== "open"} onClick={addQuestion}>新增</button>
                  </div>
                  <div className="questionList">
                    {questions.map(question => (
                      <div className="questionRow" key={question.id}>
                        <span className="questionNo">{question.question_no}</span>
                        {editingQuestionId === question.id ? (
                          <div className="editQuestion"><input value={editingQuestionText} onChange={e => setEditingQuestionText(e.target.value)} />
                            <div className="rowActions"><button disabled={busy} onClick={() => saveQuestion(question.id)}>儲存</button><button className="miniGhost" onClick={() => setEditingQuestionId(null)}>取消</button></div>
                          </div>
                        ) : (
                          <><span className="questionText">{question.question_text}</span><div className="rowActions"><button className="miniGhost" disabled={busy || selectedActivity.status !== "open"} onClick={() => { setEditingQuestionId(question.id); setEditingQuestionText(question.question_text); }}>編輯</button><button className="miniDelete" disabled={busy || selectedActivity.status !== "open"} onClick={() => deleteQuestion(question)}>刪除</button></div></>
                        )}
                      </div>
                    ))}
                    {questions.length === 0 && <div className="emptyInline">這場活動目前沒有題目。</div>}
                  </div>
                  <div className="subheading participantHeading">👥 參加者名單 <span>目前加入活動的人員</span></div>
                  <div className="participantList">
                    {participants.map((person, index) => <div className="participantRow" key={person.id}><span className="participantIndex">{index + 1}</span><strong>{person.display_name}</strong><span className="participantDate">{person.created_at ? new Date(person.created_at).toLocaleDateString("zh-TW") : ""}</span></div>)}
                    {participants.length === 0 && <div className="emptyInline">還沒有參加者加入，分享活動代碼邀請朋友吧！</div>}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}
      <footer>Made with 🎁, ✨ and a little mystery.</footer>
    </main>
  );
}
