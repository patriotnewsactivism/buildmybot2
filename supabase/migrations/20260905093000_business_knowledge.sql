begin;
create table if not exists public.business_knowledge_bases (
  id uuid primary key default gen_random_uuid(), tenant_key text not null,
  name text not null, published_version_id uuid, overrides jsonb not null default '{}',
  created_at timestamptz not null default now(), unique(tenant_key,id)
);
create table if not exists public.business_knowledge_versions (
  id uuid primary key default gen_random_uuid(), tenant_key text not null, base_id uuid not null,
  url text not null, status text not null default 'starting', crawl_id text,
  next_url text, expected_pages integer, page_limit integer not null default 75,
  error text, published_by text, published_at timestamptz, created_at timestamptz not null default now(),
  unique(tenant_key,id), foreign key(tenant_key,base_id) references public.business_knowledge_bases(tenant_key,id)
);
create unique index if not exists business_one_active_crawl on public.business_knowledge_versions(base_id) where status in ('starting','crawling');
create table if not exists public.business_knowledge_pages (
  id uuid primary key default gen_random_uuid(), tenant_key text not null, version_id uuid not null,
  url text not null, title text not null default '', markdown text not null, facts jsonb not null default '[]',
  content_hash text not null, extracted_at timestamptz not null default now(),
  unique(version_id,url), foreign key(tenant_key,version_id) references public.business_knowledge_versions(tenant_key,id)
);
create table if not exists public.business_knowledge_links (
  tenant_key text not null, base_id uuid not null, channel text not null check(channel in ('chatbot','voice','sms')),
  channel_id text not null, primary key(channel,channel_id),
  foreign key(tenant_key,base_id) references public.business_knowledge_bases(tenant_key,id)
);
create table if not exists public.business_knowledge_facts (
  id uuid primary key default gen_random_uuid(), tenant_key text not null, version_id uuid not null,
  category text not null, fact_key text not null, content text not null, source_url text,
  foreign key(tenant_key,version_id) references public.business_knowledge_versions(tenant_key,id)
);
create index if not exists business_knowledge_search on public.business_knowledge_facts using gin(to_tsvector('english',content));
create or replace function public.publish_business_knowledge(p_tenant text,p_version uuid,p_user text,p_facts jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare v business_knowledge_versions; b business_knowledge_bases; fact jsonb;
begin
 select * into v from business_knowledge_versions where id=p_version and tenant_key=p_tenant for update;
 if v.id is null or v.status not in ('review','published') then raise exception 'Knowledge is not ready for review'; end if;
 select * into b from business_knowledge_bases where id=v.base_id and tenant_key=p_tenant for update;
 if v.status='published' then return false; end if;
 if jsonb_array_length(p_facts)=0 then raise exception 'No facts to publish'; end if;
 for fact in select value from jsonb_array_elements(p_facts) loop
   insert into business_knowledge_facts(tenant_key,version_id,category,fact_key,content,source_url)
   values(p_tenant,p_version,fact->>'category',fact->>'key',fact->>'value',fact->>'sourceUrl');
 end loop;
 update business_knowledge_versions set status='published',published_at=now(),published_by=p_user where id=p_version;
 update business_knowledge_bases set published_version_id=p_version where id=b.id;
 return true;
end; $$;
create or replace function public.search_business_knowledge(p_tenant text,p_base uuid,p_query text,p_limit integer default 5)
returns table(content text,source_url text) language sql stable security definer set search_path=public as $$
 select f.content,f.source_url from business_knowledge_facts f join business_knowledge_bases b on b.published_version_id=f.version_id and b.tenant_key=f.tenant_key
 where b.id=p_base and b.tenant_key=p_tenant and to_tsvector('english',f.content) @@ plainto_tsquery('english',p_query)
 order by ts_rank(to_tsvector('english',f.content),plainto_tsquery('english',p_query)) desc limit least(greatest(p_limit,1),10);
$$;
do $$ declare t text; f record; begin
 foreach t in array array['business_knowledge_bases','business_knowledge_versions','business_knowledge_pages','business_knowledge_links','business_knowledge_facts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('publish_business_knowledge','search_business_knowledge') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
