-- Migration: lexical_search_items v2 — adversarial-review fixes over v1.
--
-- 1. Escape LIKE wildcards in the user query: v1 interpolated raw user text
--    into ILIKE patterns (bound parameter, so no SQL injection — but a bare
--    '%' or '_' query pattern-matched the ENTIRE catalog and fed it to the
--    paid reranker). Patterns are now literal-escaped, consistent with the
--    route's own ILIKE fallback.
-- 2. Return the item description so lexically-rescued candidates reach the
--    AI reranker with the same context vector candidates get (v1 returned
--    only the name, weakening ranking for exactly the items this layer saves).
-- 3. Replace the unusable expression index (gin on name||' '||description —
--    served neither the per-column ILIKEs nor word_similarity()) with
--    per-column trigram indexes that the ILIKE predicates can actually use.

drop index if exists public.items_name_desc_trgm_idx;
create index if not exists items_name_trgm_idx
  on public.items using gin (name gin_trgm_ops);
create index if not exists items_description_trgm_idx
  on public.items using gin (description gin_trgm_ops);

-- Return type changes (added description), so drop + recreate; the drop loses
-- the ACLs, which are re-established below.
drop function if exists public.lexical_search_items(text, uuid, integer);

create function public.lexical_search_items(
  p_query text,
  p_university_id uuid,
  p_limit integer default 50
)
returns table(id uuid, name text, description text, lex_score real)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with esc as (
    select '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select i.id,
         i.name,
         i.description,
         greatest(
           word_similarity(p_query, i.name),
           word_similarity(p_query, i.name || ' ' || i.description) * 0.9
         )::real as lex_score
  from public.items i, esc
  where i.university_id = p_university_id
    and i.returned_at is null
    and (
      word_similarity(p_query, i.name || ' ' || i.description) >= 0.35
      or i.name ilike esc.pat escape '\'
      or i.description ilike esc.pat escape '\'
    )
  order by lex_score desc
  limit p_limit;
$$;

revoke execute on function public.lexical_search_items(text, uuid, integer) from public, anon, authenticated;
grant  execute on function public.lexical_search_items(text, uuid, integer) to service_role;
