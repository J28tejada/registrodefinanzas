-- Segundo canal: Telegram.
--
-- Lo que decide qué se registra —la confirmación, el agrupado, los
-- presupuestos— no depende de por dónde entró el mensaje. Así que las tablas
-- dejan de llamarse "whatsapp_*" y pasan a tener una columna `channel`; el
-- teléfono pasa a ser un `external_id` genérico (número de WhatsApp o chat de
-- Telegram).
--
-- Correr después de 0001_init.sql. Renombrar preserva los datos existentes.

-- ─── Renombrar tablas y columnas ─────────────────────────────────────────────

alter table if exists public.whatsapp_numbers    rename to chat_links;
alter table if exists public.whatsapp_link_codes rename to chat_link_codes;
alter table if exists public.whatsapp_messages   rename to chat_messages;

alter table public.chat_links    rename column phone to external_id;
alter table public.chat_messages rename column phone to external_id;
alter table public.pending_actions rename column phone to external_id;

alter table public.chat_messages rename column wa_message_id to provider_message_id;

-- ─── Columna de canal ────────────────────────────────────────────────────────

alter table public.chat_links      add column if not exists channel text not null default 'whatsapp';
alter table public.chat_link_codes add column if not exists channel text;
alter table public.chat_messages   add column if not exists channel text not null default 'whatsapp';
alter table public.pending_actions add column if not exists channel text not null default 'whatsapp';

do $$
begin
  -- `channel` nulo en los códigos significa "sirve para cualquier canal": el
  -- usuario genera un código y lo manda por donde quiera.
  alter table public.chat_links      add constraint chat_links_channel_ck      check (channel in ('whatsapp','telegram'));
  alter table public.chat_link_codes add constraint chat_link_codes_channel_ck check (channel is null or channel in ('whatsapp','telegram'));
  alter table public.chat_messages   add constraint chat_messages_channel_ck   check (channel in ('whatsapp','telegram'));
  alter table public.pending_actions add constraint pending_actions_channel_ck check (channel in ('whatsapp','telegram'));
exception when duplicate_object then null;
end $$;

-- ─── Índices ─────────────────────────────────────────────────────────────────
-- Un identificador solo es único dentro de su canal: un chat de Telegram y un
-- teléfono podrían coincidir como cadena.

alter table public.chat_links drop constraint if exists whatsapp_numbers_phone_key;
drop index if exists public.chat_links_channel_external_idx;
create unique index chat_links_channel_external_idx
  on public.chat_links (channel, external_id);

drop index if exists public.whatsapp_messages_phone_idx;
create index if not exists chat_messages_conv_idx
  on public.chat_messages (channel, external_id, created_at desc);

drop index if exists public.whatsapp_messages_wa_id_idx;
create unique index if not exists chat_messages_provider_id_idx
  on public.chat_messages (channel, provider_message_id);

-- Una sola pendiente viva por conversación: con dos, un "sí" sería ambiguo.
drop index if exists public.pending_actions_one_live_per_phone;
create unique index if not exists pending_actions_one_live_per_chat
  on public.pending_actions (channel, external_id) where status = 'pending';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Las políticas siguen a la tabla al renombrarla, pero se recrean por las dudas.

do $$
declare t text;
begin
  foreach t in array array['chat_links', 'chat_link_codes', 'chat_messages', 'pending_actions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "propios" on public.%I', t);
    execute format(
      'create policy "propios" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
