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

export default function ParticipantActivityPage() {
  const params = useParams<{ activityId: string }>();
  const router = useRouter();
  const activityId = params.activityId;

  const [session, setSession] = useState<Session | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [self, setSelf] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
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

    setActivity(activityResult.data as Activity);
    setSelf(selfResult.data as Participant);
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

            <div className="hostSectionHeading">📝 本場活動問卷題目</div>
            <p className="muted">請先看看主辦人為這場活動準備了哪些題目。下一階段會接上逐題排序及送出答案功能。</p>
            {questions.length === 0 ? (
              <p className="muted">主辦人尚未設定題目，請稍後再回來查看。</p>
            ) : (
              <div className="hostQuestionList">
                {questions.map((question) => (
                  <div className="hostQuestion" key={question.id}>
                    <span className="hostQuestionNo">{question.question_no}</span>
                    <span className="hostQuestionText">{question.question_text}</span>
                  </div>
                ))}
              </div>
            )}
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
