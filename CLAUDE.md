# Tasker CRM

App Next.js 16 (App Router) + React 19 + Tailwind 4 para registrar tiempo, plataformas (clientes), pagos y metas de taskers/freelancers. Textos de la UI en español rioplatense (voseo).

## Comandos
- `pnpm dev` / `pnpm build`
- `pnpm typecheck` y `pnpm test` (vitest): correr ambos antes de commitear.

## Cómo está armado
- `app/page.tsx`: estado de toda la app y pestañas. Los datos viven en `localStorage` (clave `tiempo-oro-v1`, se mantiene por compatibilidad: no renombrarla).
- `lib/game.ts`: tipos y reglas de negocio (tareas, proyectos, facturación). `lib/finance.ts`, `lib/stats.ts`, `lib/activity.ts`: cálculos puros.
- `lib/sync.ts` + `lib/use-sync.ts`: sincronización opcional con un repo privado de GitHub, datos como `.md` con un bloque `tasker:data` (se sigue leyendo el viejo `trakker:data`).
- `extension/`: extensión de Chrome (popup para iniciar/parar el timer y modo foco). Habla con la app por el DOM del `<html>`: `data-focus*`, `data-tasker-state`, `data-focus-log` y mensajes `{tasker:"cmd"}`. Al cambiarla, subir la versión en `manifest.json` y `EXT_LATEST` en `lib/focus.ts`.
- `components/tracker/*`: vistas. Estilos en `app/globals.css`, con variables `--fs`, `--ok`, etc. (claro/oscuro).

## Convenciones
- No hay datos de ejemplo: un dispositivo nuevo arranca vacío. No agregar seeds.
- La lógica va en `lib/` como funciones puras con tests en `lib/__tests__/`; los componentes sólo muestran.
- Cualquier cambio en el formato guardado debe seguir leyendo los datos viejos.
- Gestor de paquetes: pnpm (no npm/yarn).
