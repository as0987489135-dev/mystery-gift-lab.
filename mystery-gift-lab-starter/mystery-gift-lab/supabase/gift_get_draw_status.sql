create or replace function public.gift_get_draw_status(
  p_activity_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '請先登入';
  end if;

  if not public.gift_is_owner(p_activity_id) then
    raise exception '只有活動主辦人可以查看抽籤狀態';
  end if;

  return exists (
    select 1
    from public.gift_assignments
    where activity_id = p_activity_id
  );
end;
$$;

revoke all on function public.gift_get_draw_status(uuid) from public;
revoke all on function public.gift_get_draw_status(uuid) from anon;
grant execute on function public.gift_get_draw_status(uuid) to authenticated;
