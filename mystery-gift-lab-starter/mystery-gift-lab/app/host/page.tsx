"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type Progress = { participant_id: string; display_name: string; answered_count: number; question_count: number; has_wish: boolean };
type Notice = { kind: "ok" | "error"; text: string } | null;

export default function HostPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
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
  }, []);

  const loadActivityDetails = useCallback(async (activity: Activity) => {
    setSelectedActivity(activity);
    setNotice(null);
    setProgress([]);
    const [questionResult, participantResult, progressResult] = await Promise.all([
      supabase
        .from("gift_questions")
        .select("id, activity_id, question_no, question_text")
        .eq("activity_id", activity.id)
        .order("question_no", { ascending: true }),
      supabase
        .from("gift_participants")
        .select("*")
        .eq("activity_id", activity.id),
      supabase.rpc("gift_get_completion_progress", { p_activity_id: activity.id })
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

    if (progressResult.error) {
      setProgress([]);
      setNotice({ kind: "error", text: "讀取完成進度失敗：" + progressResult.error.message + "。請先在 Supabase 建立進度查詢函式。" });
    } else {
      setProgress((progressResult.data || []) as Progress[]);
    }
  }, []);

  useEffect(() => {
    // Subscribe first, then use getSession as a fallback for the initial load.
    // The ref prevents a slower getSession result from overwriting a newer auth event.
    const authEventReceived = { current: false };
    const applySession = (nextSession: Session | null) => {
      setSession(nextSession);
      if (nextSession?.user) {
        void loadActivities(nextSession.user.id);
      } else {
        setActivities([]);
        setSelectedActivity(null);
        setQuestions([]);
        setParticipants([]);
      }
      setLoading(false);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived.current = true;
      applySession(nextSession);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!authEventReceived.current) {
        if (error) {
          setNotice({ kind: "error", text: "讀取登入狀態失敗：" + error.message });
        }
        applySession(data.session);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [loadActivities]);

  async function addQuestion() {
    if (!selectedActivity || selectedActivity.status !== "open") return;
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
    if (!selectedActivity || selectedActivity.status !== "open") return;
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
    if (!selectedActivity || selectedActivity.status !== "open") return;
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

  const canFinalize = Boolean(
    selectedActivity &&
    selectedActivity.status === "open" &&
    participants.length >= 2 &&
    questions.length >= 1 &&
    progress.length === participants.length &&
    progress.every((person) =>
      Number(person.answered_count) >= Number(person.question_count) &&
      Number(person.question_count) === questions.length &&
      person.has_wish
    )
  );

  async function finalizeRankings() {
    if (!selectedActivity || !canFinalize || finalizing) return;
    const confirmed = window.confirm(
      "確定要結算這場活動的問卷並鎖定嗎？\n\n結算後，參加者將無法再修改問卷或禮物願望，排名也會正式產生。此操作無法復原。"
    );
    if (!confirmed) return;

    setFinalizing(true);
    setNotice(null);
    const { data, error } = await supabase.rpc("gift_finalize_rankings", {
      p_activity_id: selectedActivity.id
    });

    if (error || data !== true) {
      setNotice({ kind: "error", text: "結算失敗：" + (error?.message || "系統未回傳成功結果，活動尚未確認鎖定。") });
    } else {
      const lockedActivity = { ...selectedActivity, status: "locked" };
      setSelectedActivity(lockedActivity);
      setActivities((previous) =>
        previous.map((item) => item.id === lockedActivity.id ? lockedActivity : item)
      );
      setNotice({ kind: "ok", text: "問卷已成功結算，活動已鎖定！所有排名已由系統計算完成。" });
      await loadActivityDetails(lockedActivity);
    }
    setFinalizing(false);
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
                <button disabled={busy || selectedActivity.status !== "open"} onClick={addQuestion}>＋ 新增題目</button>
              </div>

              <div className="hostQuestionList">
                {questions.map((question) => (
                  <div className="hostQuestion" key={question.id}>
                    <span className="hostQuestionNo">{question.question_no}</span>
                    {editingId === question.id ? (
                      <div className="hostEditArea">
                        <input disabled={selectedActivity.status !== "open"} value={editingText} onChange={(e) => setEditingText(e.target.value)} maxLength={120} />
                        <div className="hostActions">
                          <button disabled={busy || selectedActivity.status !== "open"} onClick={() => saveQuestion(question.id)}>儲存</button>
                          <button className="ghost" disabled={busy} onClick={() => setEditingId(null)}>取消</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="hostQuestionText">{question.question_text}</span>
                        <div className="hostActions">
                          <button className="hostSmallButton secondary" disabled={busy || selectedActivity.status !== "open"} onClick={() => { setEditingId(question.id); setEditingText(question.question_text); }}>修改</button>
                          <button className="hostSmallButton danger" disabled={busy || selectedActivity.status !== "open"} onClick={() => deleteQuestion(question)}>刪除</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {questions.length === 0 && <p className="muted">這場活動目前沒有題目，請新增第一道題目。</p>}
              </div>

              <div className="hostSectionHeading">📊 參加者完成進度</div>
              <p className="muted">只顯示完成數量及是否填寫禮物，不會顯示任何人的問卷答案或禮物內容。</p>
              {progress.length === 0 ? (
                <p className="muted">尚無完成進度資料，請確認資料庫進度查詢功能已設定。</p>
              ) : (
                <div className="hostProgressList">
                  {progress.map((person) => {
                    const answersDone = Number(person.answered_count) >= Number(person.question_count);
                    const wishDone = person.has_wish;
                    return (
                      <div className="hostProgressCard" key={person.participant_id}>
                        <strong>{person.display_name}</strong>
                        <div className="hostProgressDetails">
                          <span className={answersDone ? "surveySaved" : "surveyPending"}>問卷 {person.answered_count}/{person.question_count} 題</span>
                          <span className={wishDone ? "surveySaved" : "surveyPending"}>禮物願望：{wishDone ? "已填寫" : "未填寫"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <section className="hostFinalizePanel">
                <div className="hostSectionHeading">🔐 問卷結算與活動鎖定</div>
                {selectedActivity.status === "open" ? (
                  <>
                    <p className="muted">
                      所有參加者都完成全部問卷並填寫禮物願望後，主辦人才能進行結算。結算後會計算每題排名並鎖定活動。
                    </p>
                    <div className={canFinalize ? "hostFinalizeStatus ready" : "hostFinalizeStatus pending"}>
                      {canFinalize
                        ? "🎉 全員資料已完成，可以進行結算！"
                        : "尚未符合結算條件，請確認上方每位參加者的問卷及禮物願望進度。"}
                    </div>
                    <button
                      type="button"
                      className="hostFinalizeButton"
                      disabled={!canFinalize || finalizing || busy}
                      onClick={finalizeRankings}
                    >
                      {finalizing ? "正在結算…" : "🔒 確認結算並鎖定活動"}
                    </button>
                  </>
                ) : (
                  <div className="hostFinalizeStatus ready">
                    🔒 這場活動已完成結算並鎖定，問卷及禮物願望不能再修改。
                  </div>
                )}
              </section>

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
