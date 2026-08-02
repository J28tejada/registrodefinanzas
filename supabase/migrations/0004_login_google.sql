-- Foto de perfil, para el login con Google.
-- Correlo después de 0003_cuentas_compartidas.sql.
--
-- Google manda nombre y foto en raw_user_meta_data; quien entra con correo y
-- contraseña no manda nada. Por eso todo es opcional y hay varios nombres de
-- clave posibles: cambian según el proveedor.
--
-- Antes de correr esto, en el panel de Supabase:
--   Authentication → Providers → Google → habilitar y pegar las credenciales.
--   El redirect que pide Google es el de Supabase, no el de la app:
--   https://TU_PROYECTO.supabase.co/auth/v1/callback

alter table public.profiles add column if not exists avatar_url text;

create or replace function public.sync_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nombre text;
  v_foto   text;
begin
  v_nombre := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );
  v_foto := coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  );

  insert into public.profiles (id, email, display_name, avatar_url)
  values (new.id, new.email, v_nombre, v_foto)
  on conflict (id) do update
    set email = excluded.email,
        -- coalesce del lado nuevo: si alguien entra primero por correo y
        -- después vincula Google, recién ahí aparecen nombre y foto. Al revés,
        -- un login por correo no tiene que borrar lo que ya puso Google.
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        avatar_url   = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end $$;

-- Rellena a quienes ya entraron con Google antes de esta migración
update public.profiles p
   set avatar_url = coalesce(
         u.raw_user_meta_data ->> 'avatar_url',
         u.raw_user_meta_data ->> 'picture'
       )
  from auth.users u
 where u.id = p.id
   and p.avatar_url is null;

notify pgrst, 'reload schema';
