CREATE TABLE public.graduandos (
  id uuid PRIMARY KEY,
  nombre text NOT NULL,
  documento text NOT NULL DEFAULT '',
  programa text NOT NULL DEFAULT '',
  cupos int NOT NULL DEFAULT 0,
  created_at bigint NOT NULL
);
GRANT ALL ON public.graduandos TO service_role;
ALTER TABLE public.graduandos ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tickets (
  code text PRIMARY KEY,
  sig text NOT NULL,
  graduando_id uuid NOT NULL REFERENCES public.graduandos(id) ON DELETE CASCADE,
  idx int NOT NULL,
  total int NOT NULL,
  used_at bigint
);
CREATE INDEX ON public.tickets(graduando_id);
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;