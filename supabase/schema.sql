-- ============================================================
-- Base de datos para "Control de Cupos de Grado" (ATUCSARA)
-- Ejecuta este archivo COMPLETO en Supabase → SQL Editor → New query → Run
-- ============================================================

-- Configuración global (secret de firma, PINs, cupos por defecto, programas)
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);

-- Graduandos
create table if not exists public.graduandos (
  id         text primary key,
  nombre     text not null,
  documento  text not null default '',
  programa   text not null default '',
  cupos      integer not null default 0,
  created_at bigint  not null
);

-- Tickets QR de un solo uso
create table if not exists public.tickets (
  code         text primary key,
  sig          text not null,
  graduando_id text not null references public.graduandos (id) on delete cascade,
  idx          integer not null,
  total        integer not null,
  used_at      bigint
);

-- Ninguna de las tablas se puede consultar sin la clave service_role
-- (todo acceso pasa por las funciones de servidor con PIN del proyecto).
alter table public.app_settings enable row level security;
alter table public.graduandos  enable row level security;
alter table public.tickets     enable row level security;
