"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

type Notice = { kind: "ok" | "error"; text: string } | null;
type Activity = { id: string; activity_name: string; status: string };
type Person = { id: string; display_name: string; created_at: string | null };
type Question = { id: string; question_no: number; question_text: string };
type Wish = { gift_name: string; gift_url: string | null };

export default function ParticipantPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [me, setMe] = useState<Person | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [orders, setOrders] = useState<Record<string, string[]>>({});
  const [completed, setCompleted] = useState<string[]>([]);
  const [giftName, setGiftName] = useState("");
  const [giftUrl, setGiftUrl] = useState("");
  const [wishSaved, setWishSaved] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setParticipantId(params.get("participantId") ?? "");
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadParticipantArea = useCallback(async () => {
    if (!session?.user.id || !participantId) return;
    setBusy(true);
    setNotice(null);

    const memberResult = await supabase.from("gift_participants")
      .select("id, activity_id, display_name, created_at")
      .eq("id", participantId).eq("user_id", session.user.id).single();

    if (memberResult.error || !memberResult.data) {
      setNotice({ kind: "error", text: "找不到這筆參加資料，請回首頁重新加入活動。" });
      setBusy(false);
      return;
    }

    const member = memberResult.data as Person & { activity_id: string };
    setMe({ id: member.id, display_name: member.display_name, created_at: member.created_at });

    const [activityResult, peopleResult, questionResult, wishResult, answerResult] = await Promise.all([
      supabase.from("gift_activities").select("id, activity_name, status").eq("id", member.activity_id).single(),
      supabase.from("gift_participants").select("id, display_name, created_at").eq("activity_id", member.activity_id).order("created_at", { ascending: true }),
      supabase.from("gift_questions").select("id, question_no, question_text").eq("activity_id", member.activity_id).order("question_no", { ascending: true }),
      supabase.from("gift_wishes").select("gift_name, gift_url").eq("activity_id", member.activity_id).eq("participant_id", member.id).maybeSingle(),
      supabase.from("gift_answers").select("question_id, ordered_participant_ids").eq("participant_id", member.id)
    ]);

    if (activityResult.error || !activityResult.data) {
      setNotice({ kind: "error", text: "讀取活動資料失敗，請稍後重試。" });
      setBusy(false);
      return;
    }
    if (peopleResult.error || questionResult.error) {
      setNotice({ kind: "error", text: "讀取參加者或題目資料失敗：" + (peopleResult.error?.message ?? questionResult.error?.message) });
      setBusy(false);
      return;
    }

    const peopleRows = (peopleResult.data ?? []) as Person[];
    const questionRows = (questionResult.data ?? []) as Question[];
    const answerRows = answerResult.data ?? [];
    const nextOrders: Record<string, string[]> = {};
    for (const q of questionRows) {
      const saved = answerRows.find(a => a.question_id === q.id)?.ordered_participant_ids as string[] | undefined;
      nextOrders[q.id] = saved?.length === peopleRows.length ? [...saved] : peopleRows.map(p => p.id);
    }

    setActivity(activityResult.data as Activity);
    setPeople(peopleRows);
    setQuestions(questionRows);
    setOrders(nextOrders);
    setCompleted(answerRows.map(a => a.question_id));
    if (wishResult.data) {
      setGiftName(wishResult.data.gift_name ?? "");
      setGiftUrl(wishResult.data.gift_url ?? "");
      setWishSaved(true);
    } else {
      setGiftName("");
      setGiftUrl("");
      setWishSaved(false);
    }
    if (answerResult.error) setNotice({ kind: "error", text: "讀取已提交排序紀錄失敗：" + answerResult.error.message });
    setBusy(false);
  }, [session?.user.id, participantId]);

  useEffect(() => { void loadParticipantArea(); }, [loadParticipantArea]);

  async function saveWish() {
    if (!activity || !me || !giftName.trim()) {
      setNotice({ kind: "error", text: "請至少填寫禮物名稱。" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("gift_wishes").upsert({
      activity_id: activity.id,
      participant_id: me.id,
      gift_name: giftName.trim(),
      gift_url: giftUrl.trim() || null
    }, { onConflict: "activity_id,participant_id" });
    setNotice(error
      ? { kind: "error", text: "儲存願望失敗：" + error.message }
      : { kind: "ok", text: "禮物願望已儲存！" });
    if (!error) setWishSaved(true);
    setBusy(false);
  }

  function movePerson(questionId: string, index: number, direction: -1 | 1) {
    setOrders(current => {
      const next = [...(current[questionId] ?? [])];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, [questionId]: next };
    });
  }

  async function submitRanking(question: Question) {
    if (!activity || !me) return;
    const order = orders[question.id] ?? [];
    if (order.length !== people.length || new Set(order).size !== people.length || !order.includes(me.id)) {
      setNotice({ kind: "error", text: "排序資料不完整，請確認每位參加者都在名單中。" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("gift_submit_ranking", {
      p_question_id: question.id,
      p_ordered_participant_ids: order
    });
    setNotice(error
      ? { kind: "error", text: "提交排序失敗：" + error.message }
      : { kind: "ok", text: "第 " + question.question_no + " 題排序已提交。" });
    if (!error) setCompleted(current => current.includes(question.id) ? current : [...current, question.id]);
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (!session) return <main className="page"><section className="panel participantPage"><h1>神秘禮物研究所</h1><p>請先登入，再開啟參加者活動頁面。</p><a href="/">返回首頁登入</a></section></main>;
  if (!participantId) return <main className="page"><section className="panel participantPage"><h1>找不到活動參加資料</h1><p>請從首頁輸入活動代碼加入活動，再進入參加者頁面。</p><a href="/">返回首頁</a></section></main>;
  if (!activity || !me) return <main className="page"><section className="panel participantPage"><h1>神秘禮物研究所</h1><p>{notice?.text ?? "正在載入活動資料…"}</p><a href="/">返回首頁</a></section></main>;

  return (
    <main className="page">
      <header className="hero">
        <div className="eyebrow">PARTICIPANT STUDIO</div>
        <h1>神秘禮物研究所</h1>
        <p className="intro">{activity.activity_name}｜你好，{me.display_name}</p>
      </header>

      <section className="panel participantPage">
        <div className="participantTop">
          <div><div className="sectionTitle">🎁 我的禮物願望</div><p className="muted">填寫你希望收到的禮物。願望只會提供給系統依規則解鎖，不會公開顯示主人。</p></div>
          <span className="statusTag">{activity.status === "open" ? "填寫中" : "活動已結算"}</span>
        </div>
        <label>禮物名稱（必填）</label>
        <input value={giftName} onChange={e => setGiftName(e.target.value)} placeholder="例如：無線藍牙耳機" disabled={activity.status !== "open"} />
        <label>禮物網址（選填）</label>
        <input value={giftUrl} onChange={e => setGiftUrl(e.target.value)} placeholder="貼上商品或參考網址" disabled={activity.status !== "open"} />
        <button disabled={busy || activity.status !== "open"} onClick={saveWish}>儲存禮物願望</button>
        {wishSaved && <p className="savedHint">✓ 已有儲存的禮物願望</p>}
      </section>

      <section className="panel participantPage rankingPanel">
        <div className="sectionTitle">📝 排序問卷</div>
        <p className="muted">請依照每題的描述，將參加者由最符合排到最不符合。使用上下按鈕調整順序，再逐題提交。你自己的名字也必須保留在名單中。</p>
        <div className="rankingProgress">已完成 {completed.length} / {questions.length} 題</div>
        {questions.map(question => {
          const order = orders[question.id] ?? [];
          return (
            <div className="rankingQuestion" key={question.id}>
              <div className="rankingQuestionTitle"><strong>第 {question.question_no} 題｜{question.question_text}</strong><span className={completed.includes(question.id) ? "doneTag" : "todoTag"}>{completed.includes(question.id) ? "已提交" : "尚未提交"}</span></div>
              <div className="rankingPeople">
                {order.map((personId, index) => {
                  const person = people.find(p => p.id === personId);
                  if (!person) return null;
                  return <div className="rankingPerson" key={personId}>
                    <span className="rankNumber">{index + 1}</span>
                    <strong>{person.display_name}{personId === me.id ? "（我）" : ""}</strong>
                    <div className="rankMove">
                      <button type="button" className="miniGhost" disabled={busy || activity.status !== "open" || index === 0} onClick={() => movePerson(question.id, index, -1)}>上移</button>
                      <button type="button" className="miniGhost" disabled={busy || activity.status !== "open" || index === order.length - 1} onClick={() => movePerson(question.id, index, 1)}>下移</button>
                    </div>
                  </div>;
                })}
              </div>
              <button disabled={busy || activity.status !== "open" || people.length < 2} onClick={() => submitRanking(question)}>提交本題排序</button>
            </div>
          );
        })}
        {questions.length === 0 && <div className="emptyInline">主辦人尚未設定問卷題目。</div>}
      </section>

      {notice && <div className={"notice " + notice.kind}>{notice.text}</div>}
      <div className="participantFooter"><button className="ghost" onClick={signOut}>登出</button><a href="/">返回首頁</a></div>
    </main>
  );
}
