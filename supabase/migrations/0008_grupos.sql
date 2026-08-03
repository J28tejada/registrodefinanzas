-- El agente en grupos de WhatsApp.
-- Correlo después de 0007_arreglar_aceptar_invitacion.sql.
--
-- Hasta acá una conversación era una persona: `external_id` bastaba para saber
-- de quién era el mensaje. En un grupo el `external_id` es el grupo y quien
-- escribe viene aparte, así que hace falta guardar las dos cosas.
--
-- El vínculo del GRUPO dice a qué cuenta van los gastos. La atribución de cada
-- gasto sale del vínculo de QUIEN ESCRIBIÓ, que es su chat individual. Por eso
-- cada integrante tiene que vincularse por separado: sin eso no se sabe quién
-- gastó qué, que es justamente lo que se quiere ver después.

alter table public.pending_actions add column if not exists participant text;
alter table public.chat_messages   add column if not exists participant text;
-- Marca la conversación como grupal sin tener que adivinar por el sufijo @g.us,
-- que es específico de WhatsApp.
alter table public.chat_links      add column if not exists is_group boolean not null default false;

-- La pendiente pasa a ser por persona dentro de la conversación: en un grupo,
-- dos personas pueden estar proponiendo un gasto a la vez y el "sí" de cada una
-- tiene que aplicar el suyo. En el chat 1 a 1 `participant` es NULL y el
-- comportamiento no cambia.
drop index if exists pending_actions_one_live_per_phone;
create unique index if not exists pending_actions_one_live_per_sender
  on public.pending_actions (external_id, coalesce(participant, ''))
  where status = 'pending';

create index if not exists chat_messages_participant_idx
  on public.chat_messages (external_id, participant, created_at desc);

notify pgrst, 'reload schema';
