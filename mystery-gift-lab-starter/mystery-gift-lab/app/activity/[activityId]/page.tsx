"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

type Activity = {
  id: string;
  activity_name: string;
  activity_code: string;
  status: string;
};

type Participant = {
  id: string;
  display_name: string;
};

type Question = {
  id: string;
  question_no: number;
  question_text: string;
};

type Notice = { kind: "ok" | "error"; text: string } | null;
type Answer = { question_id: string; ordered_participant_ids: string[] };
type Wish = { id: string; gift_name: string; gift_url: string };

export default function ParticipantActivityPage() {
  const params = useParams<{ activityId: string }>();
  const router = useRouter();
  const activityId = params.activityId;

  const [session, setSession] = useState<Session | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [self, setSelf] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [rankings, setRankings] = useState<Record<string, string[]>>({});
  const [savedQuestions, setSavedQuestions] = useState<string[]>([]);
  const [wish, setWish] = useState<Wish | null>(null);
  const [giftName, setGiftName] = useState("");
  const [giftUrl, setGiftUrl] = useState("");
  const [savingWish, setSavingWish] = useState(false);
  const [wishSaved, setWishSaved] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);

  const loadActivity = useCallback(async (userId: string) => {
    setLoading(true);
    setNotice(null);

    const [activityResult, selfResult, participantResult, questionResult] = await Promise.all([
      supabase
        .from("gift_activities")
        .select("id, activity_name, activity_code, status")
        .eq("id", activityId)
        .maybeSingle(),
      supabase
        .from("gift_participants")
        .select("id, display_name")
        .eq("activity_id", activityId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("gift_participants")
        .select("id, display_name")
        .eq("activity_id", activityId)
        .order("created_at", { ascending: true }),
      supabase
        .from("gift_questions")
        .select("id, question_no, question_text")
        .eq("activity_id", activityId)
        .order("question_no", { ascending: true })
    ]);

    if (activityResult.error || !activityResult.data) {
      setNotice({ kind: "error", text: "讀取活動失敗，請確認活動連結是否正確，或你是否已加入這場活動。" });
      setActivity(null);
      setLoading(false);
      return;
    }

    if (selfResult.error || !selfResult.data) {
      setNotice({ kind: "error", text: "找不到你在這場活動的參加者資料，請返回首頁重新加入活動。" });
      setActivity(activityResult.data as Activity);
      setLoading(false);
      return;
    }

    if (participantResult.error) {
      setNotice({ kind: "error", text: "讀取參加者名單失敗：" + participantResult.error.message });
    } else {
      setParticipants((participantResult.data || []) as Participant[]);
    }

    if (questionResult.error) {
      setNotice({ kind: "error", text: "讀取活動題目失敗：" + questionResult.error.message });
    } else {
      setQuestions((questionResult.data || []) as Question[]);
    }

    const loadedParticipants = (participantResult.data || []) as Participant[];
    const loadedQuestions = (questionResult.data || []) as Question[];
    const currentParticipant = selfResult.data as Participant;

    setParticipants(loadedParticipants);
    setQuestions(loadedQuestions);

    const { data: wishRow, error: wishError } = await supabase
      .from("gift_wishes")
      .select("id, gift_name, gift_url")
      .eq("activity_id", activityId)
      .eq("participant_id", currentParticipant.id)
      .maybeSingle();

    if (wishError) {
      setNotice({ kind: "error", text: "讀取你的禮物願望失敗：" + wishError.message });
    } else if (wishRow) {
      const loadedWish = wishRow as Wish;
      setWish(loadedWish);
      setGiftName(loadedWish.gift_name || "");
      setGiftUrl(loadedWish.gift_url || "");
      setWishSaved(true);
    } else {
      setWish(null);
      setGiftName("");
      setGiftUrl("");
      setWishSaved(false);
    }

    const { data: answerRows, error: answerError } = await supabase
      .from("gift_answers")
      .select("question_id, ordered_participant_ids")
      .eq("activity_id", activityId)
      .eq("participant_id", currentParticipant.id);

    if (answerError) {
      setNotice({ kind: "error", text: "讀取你先前的作答紀錄失敗：" + answerError.message });
    } else {
      const answerMap: Record<string, string[]> = {};
      const savedIds: string[] = [];
      ((answerRows || []) as Answer[]).forEach((answer) => {
        const validIds = answer.ordered_participant_ids.filter((id) =>
          loadedParticipants.some((person) => person.id === id)
        );
        const missingIds = loadedParticipants
          .map((person) => person.id)
          .filter((id) => !validIds.includes(id));
        answerMap[answer.question_id] = [...validIds, ...missingIds];
        if (missingIds.length === 0 && validIds.length === loadedParticipants.length) {
          savedIds.push(answer.question_id);
        }
      });
      loadedQuestions.forEach((question) => {
        if (!answerMap[question.id]) {
          answerMap[question.id] = loadedParticipants.map((person) => person.id);
        }
      });
      setRankings(answerMap);
      setSavedQuestions(savedIds);
    }

    setActivity(activityResult.data as Activity);
    setSelf(currentParticipant);
    setLoading(false);
  }, [activityId]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error || !data.session) {
        router.replace("/");
        return;
      }

      setSession(data.session);
      await loadActivity(data.session.user.id);
    }

    void initialize();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) {
        router.replace("/");
      } else {
        void loadActivity(nextSession.user.id);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadActivity, router]);

  function movePerson(questionId: string, index: number, direction: -1 | 1) {
    const current = rankings[questionId] || participants.map((person) => person.id);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) return;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setRankings((previous) => ({ ...previous, [questionId]: next }));
    setSavedQuestions((previous) => previous.filter((id) => id !== questionId));
  }

  async function saveRanking(questionId: string) {
    if (!self || !activity || activity.status !== "open") return;
    const orderedIds = rankings[questionId] || [];
    if (orderedIds.length !== participants.length || new Set(orderedIds).size !== participants.length) {
      setNotice({ kind: "error", text: "排序資料不完整，請重新確認這一題。" });
      return;
    }
    setSavingQuestion(questionId);
    setNotice(null);
    const { error } = await supabase.rpc("gift_submit_ranking", {
      p_question_id: questionId,
      p_ordered_participant_ids: orderedIds
    });
    if (error) {
      setNotice({ kind: "error", text: "儲存排序失敗：" + error.message });
    } else {
      setSavedQuestions((previous) => previous.includes(questionId) ? previous : [...previous, questionId]);
      setNotice({ kind: "ok", text: "這一題的排序已安全儲存，只有你本人可以查看自己的作答。" });
    }
    setSavingQuestion(null);
  }

  async function saveWish() {
    if (!self || !activity || activity.status !== "open") return;
    const name = giftName.trim();
    const url = giftUrl.trim();
    if (!name) {
      setNotice({ kind: "error", text: "請先填寫想收到的禮物名稱。" });
      return;
    }
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid protocol");
      } catch {
        setNotice({ kind: "error", text: "請輸入有效的禮物網址，並以 https:// 或 http:// 開頭。" });
        return;
      }
    }
    setSavingWish(true);
    setNotice(null);
    const result = wish
      ? await supabase.from("gift_wishes").update({ gift_name: name, gift_url: url }).eq("id", wish.id).select("id, gift_name, gift_url").single()
      : await supabase.from("gift_wishes").insert({ activity_id: activityId, participant_id: self.id, gift_name: name, gift_url: url }).select("id, gift_name, gift_url").single();
    if (result.error || !result.data) {
      setNotice({ kind: "error", text: "儲存禮物願望失敗：" + (result.error?.message || "未取得儲存資料") });
    } else {
      setWish(result.data as Wish);
      setWishSaved(true);
      setNotice({ kind: "ok", text: "你的禮物願望已成功儲存！只有你本人及主辦人可以查看。" });
    }
    setSavingWish(false);
  }

  if (loading) {
    return <main className="page"><section className="panel">正在載入活動資料…</section></main>;
  }

  if (!session) {
    return <main className="page"><section className="panel">正在返回登入頁面…</section></main>;
  }

  return (
    <main className="page hostPage">
      <header className="hero">
        <div className="eyebrow">🎁 YOUR MYSTERY GIFT PARTY</div>
        <h1>活動參加室</h1>
        <p className="intro">準備好認識大家，開始這場神秘的禮物冒險了嗎？</p>
      </header>

      <section className="panel participantPanel">
        {activity ? (
          <>
            <div className="hostActivityHeader">
              <div>
                <div className="sectionTitle">🎪 {activity.activity_name}</div>
                <p className="muted">活動代碼：<strong>{activity.activity_code}</strong></p>
              </div>
              <span className="hostStatus">{activity.status === "open" ? "開放參加" : "已鎖定"}</span>
            </div>

            {self && (
              <div className="participantWelcome">
                <span>👋</span>
                <div>
                  <strong>嗨，{self.display_name}！</strong>
                  <p>你已經加入這場活動囉。</p>
                </div>
              </div>
            )}

            <div className="hostStats">
              <div><strong>{participants.length}</strong><span>位參加者</span></div>
              <div><strong>{questions.length}</strong><span>道問卷題目</span></div>
            </div>

            <div className="hostSectionHeading">👥 一起參加的朋友</div>
            {participants.length === 0 ? (
              <p className="muted">目前還沒有其他參加者。</p>
            ) : (
              <div className="hostParticipantList">
                {participants.map((person) => (
                  <div className="hostParticipant" key={person.id}>
                    <span className="hostAvatar">{person.id === self?.id ? "🌟" : "🎁"}</span>
                    <span>{person.display_name}{person.id === self?.id ? "（我）" : ""}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="hostSectionHeading">📝 本場活動排名問卷</div>
            <p className="muted">請依照每一題的描述，將所有參加者由最符合排到最不符合。使用上移、下移調整順序，再逐題儲存。你的答案不會公開給其他參加者。</p>
            {activity.status !== "open" && (
              <div className="notice error">活動已鎖定，目前不能再修改或提交問卷。</div>
            )}
            {questions.length === 0 ? (
              <p className="muted">主辦人尚未設定題目，請稍後再回來查看。</p>
            ) : participants.length < 2 ? (
              <p className="muted">至少需要 2 位參加者，才能開始排名問卷。</p>
            ) : (
              <div className="participantSurvey">
                <div className="surveyProgress">已完成 {savedQuestions.filter((id) => questions.some((question) => question.id === id)).length} / {questions.length} 題</div>
                {questions.map((question) => {
                  const orderedIds = rankings[question.id] || participants.map((person) => person.id);
                  const isSaved = savedQuestions.includes(question.id);
                  return (
                    <section className="surveyQuestion" key={question.id}>
                      <div className="surveyQuestionTitle">
                        <span className="hostQuestionNo">{question.question_no}</span>
                        <strong>{question.question_text}</strong>
                        <span className={isSaved ? "surveySaved" : "surveyPending"}>{isSaved ? "已儲存" : "未儲存"}</span>
                      </div>
                      <p className="surveyHint">第 1 名最符合，最後一名最不符合</p>
                      <div className="surveyRankingList">
                        {orderedIds.map((personId, index) => {
                          const person = participants.find((item) => item.id === personId);
                          if (!person) return null;
                          return (
                            <div className="surveyRankingRow" key={personId}>
                              <span className="surveyRankNumber">{index + 1}</span>
                              <span className="surveyPersonName">{person.display_name}{person.id === self?.id ? "（我）" : ""}</span>
                              <div className="surveyMoveButtons">
                                <button type="button" className="hostSmallButton" aria-label="上移" disabled={activity.status !== "open" || index === 0} onClick={() => movePerson(question.id, index, -1)}>↑</button>
                                <button type="button" className="hostSmallButton" aria-label="下移" disabled={activity.status !== "open" || index === orderedIds.length - 1} onClick={() => movePerson(question.id, index, 1)}>↓</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className="secondary surveySaveButton"
                        disabled={activity.status !== "open" || savingQuestion === question.id}
                        onClick={() => saveRanking(question.id)}
                      >
                        {savingQuestion === question.id ? "儲存中…" : isSaved ? "重新儲存這題" : "儲存這題排序"}
                      </button>
                    </section>
                  );
                })}
                <div className="surveyCompletion">
                  {savedQuestions.filter((id) => questions.some((question) => question.id === id)).length === questions.length
                    ? "🎉 太好了！所有題目的排序都已完成並儲存。"
                    : "完成所有題目並逐題儲存後，就完成排名問卷囉！"}
                </div>
              </div>
            )}

            <div className="hostSectionHeading">🎁 我的禮物願望</div>
            <p className="muted">請填寫你希望收到的禮物。這份資料不會公開給其他參加者，只有你本人及主辦人可以查看。</p>
            <div className="giftWishForm">
              <label htmlFor="giftName">禮物名稱</label>
              <input id="giftName" type="text" maxLength={120} placeholder="例如：保溫杯、桌上型小風扇" value={giftName} disabled={activity.status !== "open"} onChange={(event) => { setGiftName(event.target.value); setWishSaved(false); }} />
              <label htmlFor="giftUrl">禮物網址（選填）</label>
              <input id="giftUrl" type="url" placeholder="https://..." value={giftUrl} disabled={activity.status !== "open"} onChange={(event) => { setGiftUrl(event.target.value); setWishSaved(false); }} />
              <button type="button" className="secondary surveySaveButton" disabled={activity.status !== "open" || savingWish} onClick={saveWish}>
                {savingWish ? "儲存中…" : wishSaved ? "重新儲存禮物願望" : "儲存我的禮物願望"}
              </button>
              {wishSaved && <span className="surveySaved"> 已儲存</span>}
            </div>
          </>
        ) : (
          <div className="hostEmpty">
            <div className="hostEmptyIcon">🧩</div>
            <h2>目前無法開啟這場活動</h2>
            <p className="muted">請確認你已登入正確帳號，並且已加入這場活動。</p>
          </div>
        )}

        {notice && <div className={"notice " + notice.kind}>{notice.text}</div>}
        <Link className="hostBackLink" href="/">← 回首頁</Link>
      </section>
    </main>
  );
}
