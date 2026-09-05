begin;
create or replace function public.sms_apply_payment(p_tenant text,p_subscription text,p_invoice text,p_plan text,p_start timestamptz,p_end timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
declare a sms_accounts; added integer; allowance integer; rate integer;
begin
  select * into a from sms_accounts where tenant_key=p_tenant for update;
  if a.tenant_key is null or p_end<=p_start then raise exception 'Invalid account or paid period'; end if;
  if a.subscription_id is not null and a.subscription_id<>p_subscription then raise exception 'Another SMS subscription exists'; end if;
  allowance:=case p_plan when 'SMS_STARTER' then 1000 when 'SMS_GROWTH' then 5000 when 'SMS_SCALE' then 20000 else null end;
  rate:=case p_plan when 'SMS_STARTER' then 20000 when 'SMS_GROWTH' then 18000 when 'SMS_SCALE' then 15000 else null end;
  if allowance is null then raise exception 'Unknown plan'; end if;
  insert into sms_billing_periods(invoice_id,tenant_key,subscription_id,starts_at,ends_at) values(p_invoice,p_tenant,p_subscription,p_start,p_end) on conflict(invoice_id) do nothing;
  get diagnostics added=row_count;
  if added=0 then return false; end if;
  if a.period_start is not null and p_start<=a.period_start then return false; end if;
  update sms_accounts set subscription_id=p_subscription,paid_invoice_id=p_invoice,plan_key=p_plan,
    period_start=p_start,paid_until=p_end,included_segments=allowance,used_segments=0,
    overage_micros=rate,overage_used_micros=0,updated_at=now() where tenant_key=p_tenant;
  return true;
end; $$;
revoke all on function public.sms_apply_payment(text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.sms_apply_payment(text,text,text,text,timestamptz,timestamptz) to service_role;
commit;
