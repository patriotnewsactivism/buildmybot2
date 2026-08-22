-- Keep vector retrieval server-only and make the RPC match the production
-- knowledge_chunks schema, whose UUID values are stored in text columns.

create or replace function public.match_knowledge_chunks(
  query_embedding public.vector,
  match_bot_id uuid,
  match_threshold double precision default 0.5,
  match_count integer default 5
)
returns table(
  id uuid,
  source_id uuid,
  content text,
  chunk_index integer,
  similarity double precision
)
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  return query
  select
    kc.id::uuid,
    kc.source_id::uuid,
    kc.content,
    kc.chunk_index,
    1 - (kc.embedding operator(public.<=>) query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.bot_id = match_bot_id::text
    and kc.embedding is not null
    and 1 - (kc.embedding operator(public.<=>) query_embedding) > match_threshold
  order by kc.embedding operator(public.<=>) query_embedding
  limit match_count;
end
$function$;

revoke execute on function public.match_knowledge_chunks(
  public.vector, uuid, double precision, integer
) from public, anon, authenticated;

grant execute on function public.match_knowledge_chunks(
  public.vector, uuid, double precision, integer
) to service_role;
