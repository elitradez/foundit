-- Migration: lexical_search_items — trigram/substring search layer for browse.
--
-- WHY (measured with scripts/search-eval.mjs against the live catalog):
-- embeddings are weak on 1-2 word queries. "keys" scored Key fob with keys at
-- 0.389 and Necklace-bracelet-and-key at 0.352 — both hidden by the old 0.4
-- vector floor; all four "charger" items scored 0.27-0.34 and only surfaced
-- because the zero-result ILIKE fallback happened to fire. This function gives
-- browse a lexical signal that is unioned with vector results on every search
-- (not only on zero results), and covers misspellings via pg_trgm
-- word_similarity ("hydroflask" -> "Hydro Flask", "water bottel" -> bottle).
--
-- Used by browse search only. The Find-my-item flow's thresholds and unblur
-- gates are unaffected.

create extension if not exists pg_trgm with schema public;

-- Supports the ILIKE/trigram-operator paths; word_similarity() itself is a
-- function call (sequential at current catalog size, which is fine — revisit
-- with %> operators if the catalog reaches thousands).
create index if not exists items_name_desc_trgm_idx
  on public.items using gin ((name || ' ' || description) gin_trgm_ops);

create or replace function public.lexical_search_items(
  p_query text,
  p_university_id uuid,
  p_limit integer default 50
)
returns table(id uuid, name text, lex_score real)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id,
         i.name,
         greatest(
           word_similarity(p_query, i.name),
           -- description hits are real but slightly weaker signals than name hits
           word_similarity(p_query, i.name || ' ' || i.description) * 0.9
         )::real as lex_score
  from public.items i
  where i.university_id = p_university_id
    and i.returned_at is null
    and (
      word_similarity(p_query, i.name || ' ' || i.description) >= 0.35
      or i.name ilike '%' || p_query || '%'
      or i.description ilike '%' || p_query || '%'
    )
  order by lex_score desc
  limit p_limit;
$$;

-- Same privilege posture as search_items (see 20260610010000): service-role
-- API only; PUBLIC grant would otherwise let anon execute it.
revoke execute on function public.lexical_search_items(text, uuid, integer) from public, anon, authenticated;
grant  execute on function public.lexical_search_items(text, uuid, integer) to service_role;
