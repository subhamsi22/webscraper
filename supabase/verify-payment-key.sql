create or replace function public.verify_payment_key(candidate_key text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payment as payment_row
    where payment_row."key" = candidate_key
  );
$$;

revoke all on function public.verify_payment_key(text) from public;
grant execute on function public.verify_payment_key(text) to anon, authenticated;
