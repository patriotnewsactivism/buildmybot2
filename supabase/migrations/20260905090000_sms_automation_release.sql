-- Additive, service-role-only SMS runtime. Rollback: disable SMS_LAUNCH_ENABLED
-- and SMS worker dispatch, restore the previous application, retain these rows.
begin;
create table if not exists public.sms_accounts (
  tenant_key text primary key, user_id text not null, organization_id text,
  business_name text not null default '', timezone text not null default 'America/Chicago',
  plan_key text check (plan_key in ('SMS_STARTER','SMS_GROWTH','SMS_SCALE')),
  subscription_id text unique, paid_invoice_id text, paid_until timestamptz,
  period_start timestamptz, included_segments integer not null default 0,
  used_segments integer not null default 0 check (used_segments >= 0),
  overage_micros integer not null default 20000, spend_limit_micros bigint not null default 0 check (spend_limit_micros >= 0),
  overage_used_micros bigint not null default 0 check (overage_used_micros >= 0),
  sender text unique, messaging_profile_id text, campaign_id text, campaign_usecase text,
  ready boolean not null default false, ai_enabled boolean not null default false,
  knowledge_base_id uuid, alert_phone text, alert_consent boolean not null default false,
  quiet_start integer not null default 9 check (quiet_start between 9 and 19),
  quiet_end integer not null default 20 check (quiet_end between 10 and 20),
  booking_secret_hash text, updated_at timestamptz not null default now(),
  check (quiet_start < quiet_end)
);
create table if not exists public.sms_contacts (
  id uuid primary key default gen_random_uuid(), tenant_key text not null references public.sms_accounts,
  phone text not null, name text not null default '', timezone text,
  tags jsonb not null default '[]', consents jsonb not null default '[]', consent_source text not null,
  consent_at timestamptz not null default now(), suppressed boolean not null default false,
  manual_takeover boolean not null default false, enrollment_state jsonb,
  birth_month integer, birth_day integer, created_at timestamptz not null default now(),
  unique(tenant_key,phone), unique(tenant_key,id),
  check ((birth_month is null and birth_day is null) or (birth_month between 1 and 12 and birth_day between 1 and 31))
);
create table if not exists public.sms_programs (
  id uuid primary key default gen_random_uuid(), tenant_key text not null references public.sms_accounts,
  kind text not null check (kind in ('campaign','keyword','welcome','after_hours','sequence','contest','birthday')),
  name text not null, keyword text, status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  version integer not null default 1, config jsonb not null, created_at timestamptz not null default now(),
  unique(tenant_key,id)
);
create unique index if not exists sms_keyword_per_business on public.sms_programs(tenant_key,keyword) where keyword is not null;
create unique index if not exists sms_singleton_program on public.sms_programs(tenant_key,kind) where kind in ('welcome','after_hours','birthday');
create table if not exists public.sms_jobs (
  id uuid primary key default gen_random_uuid(), tenant_key text not null references public.sms_accounts,
  contact_id uuid not null, program_id uuid, appointment_id uuid,
  dedupe_key text not null, purpose text not null check (purpose in ('marketing','birthday','appointment','contest','conversation','lead_alert','system')),
  body text not null, due_at timestamptz not null default now(), status text not null default 'queued',
  attempts integer not null default 0, lease_token uuid, lease_until timestamptz,
  segments integer not null default 0, reserved_invoice_id text, reserved_overage_micros bigint not null default 0,
  provider_message_id text unique, last_error text, delivered_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_key,dedupe_key), foreign key(tenant_key,contact_id) references public.sms_contacts(tenant_key,id),
  foreign key(tenant_key,program_id) references public.sms_programs(tenant_key,id)
);
create index if not exists sms_jobs_due on public.sms_jobs(due_at) where status in ('queued','leased');
create table if not exists public.sms_inbound_events (
  id text primary key, tenant_key text not null references public.sms_accounts,
  contact_id uuid not null, body text not null, received_at timestamptz not null default now(),
  status text not null default 'pending', lease_until timestamptz, lease_token uuid,
  foreign key(tenant_key,contact_id) references public.sms_contacts(tenant_key,id)
);
create table if not exists public.sms_appointments (
  id uuid primary key default gen_random_uuid(), tenant_key text not null references public.sms_accounts,
  external_id text not null, version bigint not null, contact_id uuid not null,
  starts_at timestamptz not null, timezone text not null, status text not null,
  request text, config jsonb not null, unique(tenant_key,external_id),
  foreign key(tenant_key,contact_id) references public.sms_contacts(tenant_key,id)
);
create table if not exists public.sms_contest_entries (
  id uuid primary key default gen_random_uuid(), tenant_key text not null,
  program_id uuid not null, contact_id uuid not null, eligible boolean not null default true,
  disqualification_reason text, entered_at timestamptz not null default now(),
  unique(program_id,contact_id), foreign key(tenant_key,program_id) references public.sms_programs(tenant_key,id),
  foreign key(tenant_key,contact_id) references public.sms_contacts(tenant_key,id)
);
create table if not exists public.sms_contest_draws (
  id uuid primary key default gen_random_uuid(), tenant_key text not null,
  program_id uuid not null, round integer not null default 1, entry_snapshot jsonb not null,
  winners jsonb not null, reason text, approved_at timestamptz, approved_by text,
  created_at timestamptz not null default now(), unique(program_id,round),
  foreign key(tenant_key,program_id) references public.sms_programs(tenant_key,id)
);
create table if not exists public.sms_provisioning (
  tenant_key text primary key references public.sms_accounts, status text not null default 'new',
  step text not null default 'brand', provider_brand_id text, provider_campaign_id text,
  provider_order_id text, sender text, last_error text, request jsonb not null default '{}',
  lease_until timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.sms_billing_periods (
  invoice_id text primary key, tenant_key text not null references public.sms_accounts,
  subscription_id text not null, starts_at timestamptz not null, ends_at timestamptz not null,
  overage_micros bigint not null default 0, stripe_invoice_item_id text,
  created_at timestamptz not null default now()
);

create or replace function public.sms_claim_jobs(p_limit integer default 20)
returns setof public.sms_jobs language sql security definer set search_path=public as $$
  update sms_jobs set status='leased', lease_token=gen_random_uuid(), lease_until=now()+interval '2 minutes', attempts=attempts+1
  where id in (select id from sms_jobs where due_at<=now() and (status='queued' or (status='leased' and lease_until<now()))
    and attempts<8 order by due_at for update skip locked limit least(greatest(p_limit,1),25)) returning *;
$$;

create or replace function public.sms_prepare_job(p_id uuid,p_token uuid,p_segments integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j sms_jobs; a sms_accounts; c sms_contacts; extra integer; cost bigint;
begin
  select * into j from sms_jobs where id=p_id for update;
  if j.id is null or j.status<>'leased' or j.lease_token is distinct from p_token or j.lease_until<now() then return jsonb_build_object('ok',false,'reason','Lease lost'); end if;
  select * into a from sms_accounts where tenant_key=j.tenant_key for update;
  select * into c from sms_contacts where id=j.contact_id and tenant_key=j.tenant_key for update;
  if p_segments not between 1 and 30 then raise exception 'Invalid segment reservation'; end if;
  if j.purpose<>'system' and (c.suppressed or not (c.consents ? j.purpose)) then
    update sms_jobs set status='cancelled',last_error='Consent absent or withdrawn' where id=j.id;
    return jsonb_build_object('ok',false,'reason','Consent absent or withdrawn');
  end if;
  if exists(select 1 from sms_opt_outs where phone_number=c.phone and organization_id is null and user_id is null) and j.purpose<>'system' then
    update sms_jobs set status='cancelled',last_error='Globally suppressed' where id=j.id;
    return jsonb_build_object('ok',false,'reason','Globally suppressed');
  end if;
  if j.program_id is not null and not exists(select 1 from sms_programs where id=j.program_id and tenant_key=j.tenant_key and status='active') then
    update sms_jobs set status='cancelled',last_error='Program inactive' where id=j.id;
    return jsonb_build_object('ok',false,'reason','Program inactive');
  end if;
  if c.manual_takeover and j.program_id is not null then
    update sms_jobs set status='cancelled',last_error='Manual takeover' where id=j.id;
    return jsonb_build_object('ok',false,'reason','Manual takeover');
  end if;
  if not a.ready or a.sender is null or a.paid_until is null or a.paid_until<=now() then
    update sms_jobs set status='queued',due_at=now()+interval '1 hour',attempts=greatest(attempts-1,0),last_error='Paid subscription or sender approval required' where id=j.id;
    return jsonb_build_object('ok',false,'reason','Account not ready');
  end if;
  extra:=greatest(0,a.used_segments+p_segments-a.included_segments)-greatest(0,a.used_segments-a.included_segments);
  cost:=case when j.purpose in ('lead_alert','system') then 0 else extra*a.overage_micros end;
  if a.overage_used_micros+cost>a.spend_limit_micros then
    update sms_jobs set status='queued',due_at=now()+interval '1 hour',attempts=greatest(attempts-1,0),last_error='SMS spending limit reached' where id=j.id;
    return jsonb_build_object('ok',false,'reason','SMS spending limit reached');
  end if;
  if j.purpose not in ('lead_alert','system') then
    update sms_accounts set used_segments=used_segments+p_segments,overage_used_micros=overage_used_micros+cost where tenant_key=j.tenant_key;
    update sms_billing_periods set overage_micros=overage_micros+cost where invoice_id=a.paid_invoice_id;
  end if;
  update sms_jobs set status='sending',segments=p_segments,reserved_invoice_id=a.paid_invoice_id,reserved_overage_micros=cost,updated_at=now() where id=j.id;
  return jsonb_build_object('ok',true,'from',a.sender,'to',c.phone,'profile',a.messaging_profile_id);
end; $$;

create or replace function public.sms_receive(p_event text,p_sender text,p_phone text,p_body text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a sms_accounts; c sms_contacts; keyword text; inserted integer;
begin
  select * into a from sms_accounts where sender=p_sender;
  if a.tenant_key is null then return jsonb_build_object('ignored',true); end if;
  insert into sms_contacts(tenant_key,phone,consent_source) values(a.tenant_key,p_phone,'inbound message; no marketing consent') on conflict(tenant_key,phone) do nothing;
  select * into c from sms_contacts where tenant_key=a.tenant_key and phone=p_phone for update;
  insert into sms_inbound_events(id,tenant_key,contact_id,body) values(p_event,a.tenant_key,c.id,p_body) on conflict(id) do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return jsonb_build_object('duplicate',true); end if;
  keyword:=upper(trim(p_body));
  if keyword in ('STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT') then
    update sms_contacts set suppressed=true,consents='[]',enrollment_state=null where id=c.id;
    update sms_jobs set status='cancelled',last_error='Recipient opted out' where contact_id=c.id and status in ('queued','leased');
  else
    -- Every reply pauses delayed follow-ups; compliance replies never reach AI.
    update sms_jobs j set status='cancelled',last_error='Recipient replied' where contact_id=c.id and status in ('queued','leased') and exists(select 1 from sms_programs p where p.id=j.program_id and p.kind='sequence');
  end if;
  return jsonb_build_object('received',true);
end; $$;

create or replace function public.sms_claim_inbound()
returns setof public.sms_inbound_events language sql security definer set search_path=public as $$
  update sms_inbound_events set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  where id in (select id from sms_inbound_events where status='pending' or (status='processing' and lease_until<now()) order by received_at for update skip locked limit 20) returning *;
$$;

create or replace function public.sms_save_appointment(p_tenant text,p_contact uuid,p_config jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a sms_appointments;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant||':'||(p_config->>'externalId'),0));
  select * into a from sms_appointments where tenant_key=p_tenant and external_id=p_config->>'externalId' for update;
  if a.id is not null and a.version >= (p_config->>'version')::bigint then return jsonb_build_object('stale',true,'id',a.id); end if;
  insert into sms_appointments(tenant_key,external_id,version,contact_id,starts_at,timezone,status,config)
  values(p_tenant,p_config->>'externalId',(p_config->>'version')::bigint,p_contact,(p_config->>'startsAt')::timestamptz,p_config->>'timezone',p_config->>'status',p_config)
  on conflict(tenant_key,external_id) do update set version=excluded.version,contact_id=excluded.contact_id,starts_at=excluded.starts_at,timezone=excluded.timezone,status=excluded.status,config=excluded.config,request=null returning * into a;
  update sms_jobs set status='cancelled',last_error='Appointment changed' where appointment_id=a.id and status in ('queued','leased');
  return to_jsonb(a);
end; $$;

-- Every table is accessed through authenticated server handlers. Runtime
-- service-role credentials do not grant customers SQL or management access.
do $$ declare t text; f record; begin
  foreach t in array array['sms_accounts','sms_contacts','sms_programs','sms_jobs','sms_inbound_events','sms_appointments','sms_contest_entries','sms_contest_draws','sms_provisioning','sms_billing_periods'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('sms_claim_jobs','sms_prepare_job','sms_receive','sms_claim_inbound','sms_save_appointment') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
