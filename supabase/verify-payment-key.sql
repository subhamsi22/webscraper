create or replace function public.verify_payment_key(candidate_key text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.paid_licenses as license_row
    where license_row.license_key = candidate_key
      and upper(license_row.status) = 'PAID'
  );
$$;

revoke all on function public.verify_payment_key(text) from public;
grant execute on function public.verify_payment_key(text) to anon, authenticated;
