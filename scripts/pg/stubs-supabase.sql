-- Lo mínimo de Supabase que las migraciones dan por sentado, para correrlas en
-- un Postgres pelado. Solo para `scripts/probar-migraciones.sh`: en Supabase
-- todo esto ya existe y NO se corre.
--
-- Es una imitación, no una copia: `auth.uid()` lee el usuario "conectado" de
-- la misma variable de sesión que llena PostgREST, y con eso alcanza para que
-- RLS y las funciones SECURITY INVOKER se porten como allá.

-- Los roles son del clúster y no de la base: sobreviven a un `drop database`,
-- así que se crean solo si faltan.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid
);
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select string_to_array(name, '/') $$;

-- Lo que Supabase le da a `authenticated` sobre lo que crean las migraciones.
grant usage on schema public, storage to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
