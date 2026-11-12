"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

type Activity = {
  id: string;
  activity_name: string;
  activity_code: string;
  status: string;
  created_at: string;
};

type Question = {
  id: string;
  activity_id: string;
  question_no: number;
  question_text: string;
};

type Participant = {
  id: string;
  display_name?: string;
  nickname?: string;
  [key: string]: unknown;
};

type Notice = { kind: "ok" | "error"; text: string } | null;

export default function HostPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadActivities = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("gift_activities")
      .select("id, activity_name, activity_code, status, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setNotice({ kind: "error", text: "讀取活動失敗：" + error.message });
      return;
    }
    const rows = (data || []) as Activity[];
    setActivities(rows);
    if (selectedActivity) {
      const refreshed = rows.find((item) => item.id === selectedActivity.id);
      if (refreshed) setSelectedActivity(refreshed);
    }
  }, [selectedActivity]);

  const loadActivityDetails = useCallback(async (activity: Activity) => {
    setSelectedActivity(activity);
    setNotice(null);
    const [questionResult, participantResult] = await Promise.all([
      supabase
        .from("gift_questions")
        .select("id, activity_id, question_no, question_text")
        .eq("activity_id", activity.id)
        .order("question_no", { ascending: true }),
      supabase
        .from("gift_participants")
        .select("*")
        .eq("activity_id", activity.id)
    ]);

    if (questionResult.error) {
      setNotice({ kind: "error", text: "讀取題目失敗：" + questionResult.error.message });
    } else {
      setQuestions((questionResult.data || []) as Question[]);
    }

    if (participantResult.error) {
      setParticipants([]);
      setNotice({ kind: "error", text: "讀取參加者失敗：" + participantResult.error.message });
    } else {
      setParticipants((participantResult.data || []) as Participant[]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session?.user) await loadActivities(data.session.user.id);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) loadActivities(nextSession.user.id);
      else {
        setActivities([]);
        setSelectedActivity(null);
        setQuestions([]);
        setParticipants([]);
      }
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [loadActivities]);

  async function addQuestion() {
    if (!selectedActivity) return;
    const text = newQuestion.trim();
    if (!text) {
      setNotice({ kind: "error", text: "請先輸入題目內容。" });
      return;
    }
    setBusy(true);
    setNotice(null);
    const nextNo = Math.max(0, ...questions.map((q) => q.question_no)) + 1;
    const { error } = await supabase.from("gift_questions").insert({
      activity_id: selectedActivity.id,
      question_no: nextNo,
      question_text: text
    });
    if (error) {
      setNotice({ kind: "error", text: "新增題目失敗：" + error.message });
    } else {
      setNewQuestion("");
      setNotice({ kind: "ok", text: "題目已新增。" });
      await loadActivityDetails(selectedActivity);
    }
    setBusy(false);
  }

  async function saveQuestion(questionId: string) {
    const text = editingText.trim();
    if (!text) {
      setNotice({ kind: "error", text: "題目內容不能空白。" });
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("gift_questions")
      .update({ question_text: text })
      .eq("id", questionId);
    if (error) {
      setNotice({ kind: "error", text: "修改題目失敗：" + error.message });
    } else {
      setEditingId(null);
      setEditingText("");
      setNotice({ kind: "ok", text: "題目已更新。" });
      if (selectedActivity) await loadActivityDetails(selectedActivity);
    }
    setBusy(false);
  }

  async function deleteQuestion(question: Question) {
    if (!selectedActivity) return;
    if (!window.confirm(`確定刪除「${question.question_text}」嗎？`)) return;
    setBusy(true);
    const { error } = await supabase
      .from("gift_questions")
      .delete()
      .eq("id", question.id);
    if (error) {
      setNotice({ kind: "error", text: "刪除題目失敗：" + error.message });
    } else {
      setNotice({ kind: "ok", text: "題目已刪除。" });
      await loadActivityDetails(selectedActivity);
    }
    setBusy(false);
  }

  if (loading) return <main className="page"><section className="panel">正在載入主辦人管理頁面…</section></main>;

  if (!session) {
    return (
      <main className="page">
        <section className="panel">
          <div className="sectionTitle">🔐 請先登入</div>
          <p className="muted">登入後才能管理自己建立的交換禮物活動。</p>
          <Link className="hostBackLink" href="/">返回首頁登入</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page hostPage">
      <header className="hero">
        <div className="eyebrow">🎁 HOST CONTROL ROOM</div>
        <h1>主辦人管理室</h1>
        <p className="intro">管理活動、編輯題目，準備一場充滿驚喜的交換禮物派對！</p>
      </header>

      <section className="hostLayout">
        <aside className="panel hostSidebar">
          <div className="sectionTitle">🎀 我的活動</div>
          {activities.length === 0 ? (
            <p className="muted">目前還沒有由這個帳號建立的活動。請先回首頁建立活動。</p>
          ) : (
            <div className="hostActivityList">
              {activities.map((activity) => (
                <button
                  key={activity.id}
                  className={selectedActivity?.id === activity.id ? "hostActivity active" : "hostActivity"}
                  onClick={() => loadActivityDetails(activity)}
                >
                  <strong>{activity.activity_name}</strong>
                  <span>活動代碼：{activity.activity_code}</span>
                  <small>狀態：{activity.status}</small>
                </button>
              ))}
            </div>
          )}
          <Link className="hostBackLink" href="/">← 回首頁</Link>
        </aside>

        <section className="panel hostMain">
          {!selectedActivity ? (
            <div className="hostEmpty">
              <div className="hostEmptyIcon">🎉</div>
              <h2>選擇一場活動開始管理</h2>
              <p className="muted">從左側選擇活動，即可查看參加者並管理這場活動的問卷題目。</p>
            </div>
          ) : (
            <>
              <div className="hostActivityHeader">
                <div>
                  <div className="sectionTitle">🎪 {selectedActivity.activity_name}</div>
                  <p className="muted">活動代碼：<strong>{selectedActivity.activity_code}</strong></p>
                </div>
                <span className="hostStatus">{selectedActivity.status}</span>
              </div>

              <div className="hostStats">
                <div><strong>{participants.length}</strong><span>位參加者</span></div>
                <div><strong>{questions.length}</strong><span>道問卷題目</span></div>
              </div>

              <div className="hostSectionHeading">📝 問卷題目管理</div>
              <p className="muted">每場活動都有自己的題目。你可以新增、修改或刪除題目。</p>

              <div className="hostAddQuestion">
                <input
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="輸入新的問卷題目"
                  maxLength={120}
                />
                <button disabled={busy} onClick={addQuestion}>＋ 新增題目</button>
              </div>

              <div className="hostQuestionList">
                {questions.map((question) => (
                  <div className="hostQuestion" key={question.id}>
                    <span className="hostQuestionNo">{question.question_no}</span>
                    {editingId === question.id ? (
                      <div className="hostEditArea">
                        <input value={editingText} onChange={(e) => setEditingText(e.target.value)} maxLength={120} />
                        <div className="hostActions">
                          <button disabled={busy} onClick={() => saveQuestion(question.id)}>儲存</button>
                          <button className="ghost" disabled={busy} onClick={() => setEditingId(null)}>取消</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="hostQuestionText">{question.question_text}</span>
                        <div className="hostActions">
                          <button className="hostSmallButton secondary" disabled={busy} onClick={() => { setEditingId(question.id); setEditingText(question.question_text); }}>修改</button>
                          <button className="hostSmallButton danger" disabled={busy} onClick={() => deleteQuestion(question)}>刪除</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {questions.length === 0 && <p className="muted">這場活動目前沒有題目，請新增第一道題目。</p>}
              </div>

              <div className="hostSectionHeading">👥 參加者</div>
              {participants.length === 0 ? (
                <p className="muted">目前還沒有人加入這場活動。把活動代碼分享給朋友吧！</p>
              ) : (
                <div className="hostParticipantList">
                  {participants.map((person) => (
                    <div className="hostParticipant" key={person.id}>
                      <span className="hostAvatar">🎁</span>
                      <span>{String(person.display_name || person.nickname || "參加者")}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {notice && <div className={"notice " + notice.kind}>{notice.text}</div>}
        </section>
      </section>
    </main>
  );
}
