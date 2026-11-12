create or replace function public.gift_get_completion_progress(p_activity_id uuid)
returns table (
  participant_id uuid,
  display_name text,
  answered_count bigint,
  question_count bigint,
  has_wish boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '請先登入。';
  end if;

  if not exists (
    select 1
    from public.gift_activities a
    where a.id = p_activity_id
      and a.owner_id = auth.uid()
  ) then
    raise exception '只有這場活動的主辦人可以查看完成進度。';
  end if;

  return query
  select
    p.id as participant_id,
    p.display_name,
    (
      select count(*)::bigint
      from public.gift_answers ans
      where ans.activity_id = p.activity_id
        and ans.participant_id = p.id
    ) as answered_count,
    (
      select count(*)::bigint
      from public.gift_questions q
      where q.activity_id = p.activity_id
    ) as question_count,
    exists (
      select 1
      from public.gift_wishes w
      where w.activity_id = p.activity_id
        and w.participant_id = p.id
    ) as has_wish
  from public.gift_participants p
  where p.activity_id = p_activity_id
  order by p.created_at asc;
end;
$$;

revoke all on function public.gift_get_completion_progress(uuid) from public;
revoke all on function public.gift_get_completion_progress(uuid) from anon;
grant execute on function public.gift_get_completion_progress(uuid) to authenticated;
