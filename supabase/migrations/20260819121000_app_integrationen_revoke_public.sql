revoke all on table public.app_integrationen from public, anon, authenticated;
grant all on table public.app_integrationen to service_role;

alter function public.set_updated_at() set search_path = public;
