# Control de Cupos de Grado — ATUCSARA

Aplicación web para el control de acceso a las ceremonias de grado del Instituto Técnico Laboral ATUCSARA mediante tickets QR de un solo uso, funciona en línea y sin conexión.

## Funcionalidades

- **Escáner QR** de tickets con validación en tiempo real (sonido, vibración y pantalla de resultado).
- **Graduandos**: creación individual o importación masiva por CSV, con número configurable de cupos.
- **Tickets**: impresión, descarga individual (PNG), descarga masiva (ZIP) y compartición individual o grupal por WhatsApp.
- **Reportes**: estadísticas de asistencia, exportación CSV y configuración (PINs, cupos por defecto, programas de estudio).
- **Modo offline**: los ingresos se registran localmente y se sincronizan con la nube al reconectarse.

## Estructura técnica

- **Frontend**: React + TanStack Start/Router + Tailwind CSS + shadcn/ui.
- **Base de datos**:
  - La nube (Supabase) es la fuente compartida de verdad entre dispositivos.
  - Cada dispositivo mantiene una copia local con Dexie (`src/lib/db.ts`), sincronizada por `src/lib/sync.ts`, para operar sin internet y encolar ingresos en un outbox.
  - Todo el acceso va por funciones de servidor verificadas con PIN (`src/lib/sync.functions.ts`); la app no tiene cuentas de usuario.
  - Esquema de la base de datos: [`supabase/schema.sql`](supabase/schema.sql).
- **PWA**: service worker con caché de la página y assets institucionales, para uso en el evento con cobertura limitada.

## Credenciales

La app necesita variables de entorno de Supabase:
- `SUPABASE_URL` / `VITE_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, nunca en el navegador).

Para ejecutar en local, colócalas en un archivo `.env.local` (rails de git a través de `*.local`).

## Desarrollo

```sh
npm install
npm run dev
```

Otros comandos: `npm run build`, `npm run preview`, `npm run test`, `npm run lint`, `npm run format`.
