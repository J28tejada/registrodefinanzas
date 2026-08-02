-- Cómo quiere que le llamen, dicho por el usuario.
-- Correlo después de 0005_cuenta_personal_automatica.sql.
--
-- `display_name` ya existía, pero sale de Google o del correo: es un dato
-- heredado, no una elección. Esta columna guarda lo que la persona pidió
-- explícitamente, y por eso arranca en NULL: ese NULL es la señal de que
-- todavía no se le preguntó.

alter table public.profiles add column if not exists preferred_name text;

notify pgrst, 'reload schema';
