create or replace function public.gift_finalize_rankings(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity public.gift_activities%rowtype;
  v_participant_count integer;
  v_question_count integer;
  v_answer_count integer;
  v_wish_count integer;
  v_ranking_count integer;
  v_expected_count integer;
begin
  if auth.uid() is null then
    raise exception '請先登入。';
  end if;

  select *
  into v_activity
  from public.gift_activities
  where id = p_activity_id
  for update;

  if not found then
    raise exception '找不到這場活動。';
  end if;

  if v_activity.owner_id <> auth.uid() then
    raise exception '只有活動主辦人可以結算問卷。';
  end if;

  if v_activity.status <> 'open' then
    raise exception '這場活動已經結算或鎖定，無法重複操作。';
  end if;

  select count(*)::integer
  into v_participant_count
  from public.gift_participants
  where activity_id = p_activity_id;

  select count(*)::integer
  into v_question_count
  from public.gift_questions
  where activity_id = p_activity_id;

  if v_participant_count < 2 then
    raise exception '至少需要 2 位參加者才能結算。';
  end if;

  if v_question_count < 1 then
    raise exception '目前沒有問卷題目，無法結算。';
  end if;

  v_expected_count := v_participant_count * v_question_count;

  select count(*)::integer
  into v_answer_count
  from public.gift_answers a
  join public.gift_questions q
    on q.id = a.question_id
   and q.activity_id = a.activity_id
  where a.activity_id = p_activity_id;

  if v_answer_count <> v_expected_count then
    raise exception '問卷尚未全部完成：應有 % 筆作答，目前只有 % 筆。', v_expected_count, v_answer_count;
  end if;

  -- Validate every saved ordering: all participants exactly once, no foreign IDs.
  if exists (
    select 1
    from public.gift_answers a
    join public.gift_questions q
      on q.id = a.question_id
     and q.activity_id = a.activity_id
    where a.activity_id = p_activity_id
      and (
        coalesce(array_length(a.ordered_participant_ids, 1), 0) <> v_participant_count
        or (
          select count(distinct submitted_id)
          from unnest(a.ordered_participant_ids) as submitted(submitted_id)
        ) <> v_participant_count
        or exists (
          select 1
          from unnest(a.ordered_participant_ids) as submitted(submitted_id)
          where not exists (
            select 1
            from public.gift_participants p
            where p.activity_id = p_activity_id
              and p.id = submitted.submitted_id
          )
        )
      )
  ) then
    raise exception '部分問卷排序資料不完整或包含非本活動參加者，請重新儲存該題。';
  end if;

  select count(*)::integer
  into v_wish_count
  from public.gift_wishes
  where activity_id = p_activity_id;

  if v_wish_count <> v_participant_count then
    raise exception '還有參加者尚未填寫禮物願望，請完成後再結算。';
  end if;

  delete from public.gift_rankings
  where activity_id = p_activity_id;

  -- Each participant receives N points for rank 1, N-1 for rank 2, ... 1 for last.
  -- Random ordering is used only to break equal total scores.
  insert into public.gift_rankings (
    activity_id,
    question_id,
    participant_id,
    total_score,
    actual_rank
  )
  select
    p_activity_id,
    q.id,
    p.id,
    coalesce(score.total_score, 0)::integer,
    row_number() over (
      partition by q.id
      order by coalesce(score.total_score, 0) desc, random()
    )::integer
  from public.gift_questions q
  cross join public.gift_participants p
  left join lateral (
    select sum(v_participant_count + 1 - submitted.ordinality)::integer as total_score
    from public.gift_answers a
    cross join lateral unnest(a.ordered_participant_ids) with ordinality
      as submitted(participant_id, ordinality)
    where a.activity_id = p_activity_id
      and a.question_id = q.id
      and submitted.participant_id = p.id
  ) score on true
  where q.activity_id = p_activity_id
    and p.activity_id = p_activity_id;

  get diagnostics v_ranking_count = row_count;

  if v_ranking_count <> v_expected_count then
    raise exception '排名資料寫入筆數不符，預期 % 筆，實際 % 筆。', v_expected_count, v_ranking_count;
  end if;

  update public.gift_activities
  set status = 'locked'
  where id = p_activity_id;
end;
$$;

revoke all on function public.gift_finalize_rankings(uuid) from public;
revoke all on function public.gift_finalize_rankings(uuid) from anon;
grant execute on function public.gift_finalize_rankings(uuid) to authenticated;
