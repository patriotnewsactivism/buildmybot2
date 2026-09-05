begin;
create or replace function public.sms_contest_action(p_tenant text,p_program uuid,p_action text,p_contact uuid default null,p_actor text default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p sms_programs; d sms_contest_draws; snapshot jsonb; selected jsonb; n integer; prior_winners jsonb; c sms_contacts; winner jsonb; inserted integer;
begin
  select * into p from sms_programs where tenant_key=p_tenant and id=p_program and kind='contest' for update;
  if p.id is null then raise exception 'Contest not found'; end if;
  if p_action='enter' then
    if p.status<>'active' or now()<(p.config->>'opensAt')::timestamptz or now()>=(p.config->>'closesAt')::timestamptz then return jsonb_build_object('closed',true); end if;
    if not exists(select 1 from sms_contacts where id=p_contact and tenant_key=p_tenant and not suppressed) then raise exception 'Contact not eligible'; end if;
    insert into sms_contest_entries(tenant_key,program_id,contact_id) values(p_tenant,p_program,p_contact) on conflict(program_id,contact_id) do nothing;
    get diagnostics inserted=row_count;
    return jsonb_build_object('entered',inserted=1,'duplicate',inserted=0);
  end if;
  if now()<(p.config->>'closesAt')::timestamptz then raise exception 'Contest has not closed'; end if;
  select * into d from sms_contest_draws where program_id=p_program order by round desc limit 1 for update;
  if p_action='draw' and d.id is not null then return to_jsonb(d); end if;
  if p_action='disqualify' then
    if p_reason is null or length(trim(p_reason))<3 or p_contact is null then raise exception 'A contact and reason are required'; end if;
    update sms_contest_entries set eligible=false,disqualification_reason=p_reason where program_id=p_program and contact_id=p_contact;
    return jsonb_build_object('disqualified',true);
  end if;
  if p_action='approve' then
    if d.id is null or p_actor is null then raise exception 'Draw and approving user required'; end if;
    if d.approved_at is null then
      for winner in select value from jsonb_array_elements(d.winners) loop
        select * into c from sms_contacts where id=(winner->>'contact_id')::uuid and tenant_key=p_tenant;
        if not exists(select 1 from sms_contest_entries where program_id=p_program and contact_id=c.id and eligible) then raise exception 'A selected winner was disqualified; perform a replacement draw first'; end if;
        insert into sms_jobs(tenant_key,contact_id,program_id,dedupe_key,purpose,body)
        values(p_tenant,c.id,p_program,'contest-winner:'||d.id||':'||c.id,'contest',
          replace(replace(p.config->>'winnerText','{{name}}',c.name),'{{prize}}',p.config->>'prize')) on conflict(tenant_key,dedupe_key) do nothing;
      end loop;
      update sms_contest_draws set approved_at=now(),approved_by=p_actor where id=d.id returning * into d;
    end if;
    return to_jsonb(d);
  end if;
  if p_action not in ('draw','replace') then raise exception 'Unknown contest action'; end if;
  if p_action='replace' and (d.id is null or p_reason is null or length(trim(p_reason))<3) then raise exception 'Previous draw and replacement reason required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id',e.id,'contact_id',e.contact_id) order by e.id),'[]') into snapshot
    from sms_contest_entries e where program_id=p_program and eligible;
  -- gen_random_uuid uses the cryptographic generator; persist both the
  -- eligible snapshot and result inside this serialized contest transaction.
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into selected from (
    select e.id entry_id,e.contact_id from sms_contest_entries e
    where e.program_id=p_program and e.eligible and not exists(
      select 1 from sms_contest_draws prev,jsonb_array_elements(prev.winners) w where prev.program_id=p_program and (w->>'contact_id')::uuid=e.contact_id)
    order by gen_random_uuid() limit case when p_action='replace' then 1 else (p.config->>'winnerCount')::integer end
  ) x;
  insert into sms_contest_draws(tenant_key,program_id,round,entry_snapshot,winners,reason)
    values(p_tenant,p_program,coalesce(d.round,0)+1,snapshot,selected,p_reason) returning * into d;
  return to_jsonb(d);
end; $$;
revoke all on function public.sms_contest_action(text,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.sms_contest_action(text,uuid,text,uuid,text,text) to service_role;
commit;
