# Plan de Remediación de Ciberseguridad y Migración a `sanatorioargentino.app`

> **Estado:** Pendiente de ejecución (Documentado para implementación posterior)  
> **Dominio Oficial:** `https://sanatorioargentino.app/`  
> **Alcance:** Base de Datos Supabase (RLS + RPC), Frontend React/Vite (`src/`) y Backend de Sincronización (`sync-server/`).

---

## 1. Vulnerabilidades Críticas de Base de Datos (Supabase RLS & RPC)

### 1.1. [CRÍTICA - V-01] Eliminar Bypass por `Origin` / `Referer` en `public.is_valid_admqui_session()`
- **Archivos origen:**
  - `supabase/migrations/071_security_audit_remediation.sql` (líneas 774-784)
  - `supabase/migrations/073_enable_recepciones_users_login.sql` (líneas 141-151)
- **Problema actual:**
  Si una petición no envía `x-session-token`, la función `is_valid_admqui_session()` devuelve `TRUE` cuando el header `Origin` o `Referer` coincide con `https://%vercel.app%`, `http://localhost%`, `http://127.0.0.1%` o `http://128.223.%`. Esto permite consultar y modificar las 59 tablas principales usando la `VITE_SUPABASE_ANON_KEY` sin haber iniciado sesión.
- **Acción a realizar (Nueva migración `074_strict_rls_sanatorioargentino_app.sql`):**
  1. Eliminar el bloque `IF (v_origin LIKE ...) THEN RETURN TRUE; END IF;` al final de `public.is_valid_admqui_session()`.
  2. Exigir siempre que `v_token` (`x-session-token`) tenga longitud `>= 16` y coincida con un usuario activo en `public.admqui_usuarios` o `public.users` con `last_seen_at` vigente.
  3. Actualizar la validación complementaria de origen (cuando sí hay token válido) para incluir `https://sanatorioargentino.app` y `https://www.sanatorioargentino.app`.

### 1.2. [CRÍTICA - V-02] Eliminar Bypass de Administrador en `public.require_admqui_admin()`
- **Archivo origen:**
  - `supabase/migrations/071_security_audit_remediation.sql` (líneas 791-822)
- **Problema actual:**
  Si el token de sesión no coincide con un admin, la función tiene un fallback que verifica `IF (v_origin LIKE ...) AND EXISTS (SELECT 1 FROM public.admqui_usuarios u WHERE COALESCE(u.activo, TRUE) = TRUE AND u.rol = 'admin') THEN RETURN; END IF;`. Como siempre existe al menos un admin en la tabla, cualquier petición sin sesión con un `Origin` coincidente supera el control y puede ejecutar `admin_list_users`, `admin_save_user` y `admin_reset_user_security`.
- **Acción a realizar:**
  - Eliminar por completo el bloque `IF (v_origin LIKE ...) AND EXISTS (...)` de `public.require_admqui_admin()`.
  - Exigir que el `x-session-token` de la petición pertenezca estrictamente a un usuario con `rol = 'admin'` y `activo = TRUE`.

### 1.3. [ALTA - V-04] Blindar Tabla `public.cita_online_reservas` y Tablas Recientes
- **Archivo origen:**
  - `supabase/migrations/20261111145000_create_cita_online_reservas.sql` (líneas 46-56)
- **Problema actual:**
  Tiene políticas RLS abiertas al público anónimo (`FOR SELECT USING (true)`, `FOR INSERT WITH CHECK (true)`, `FOR UPDATE USING (true)`), exponiendo DNI, nombre, teléfono y obra social de los pacientes incluso entrando desde `https://sanatorioargentino.app/`.
- **Acción a realizar:**
  - Eliminar las políticas `Allow public read/insert/update access to cita_online_reservas`.
  - Crear la política unificada `admqui_authenticated_access` sobre `public.cita_online_reservas` con `USING (public.is_valid_admqui_session()) WITH CHECK (public.is_valid_admqui_session())`.

### 1.4. [ALTA - V-05] Desactivar `public.verify_login(text, text)` Legado sin 2FA
- **Archivo origen:**
  - `supabase/migrations/073_enable_recepciones_users_login.sql` (líneas 13-74)
- **Problema actual:**
  Fue recreada con `GRANT EXECUTE TO anon`, permitiendo validar usuario y clave sin pasar por el límite de intentos fallidos (`locked_until`) ni por el segundo factor TOTP (`mfa_enabled`) de `verify_login_secure`.
- **Acción a realizar:**
  - Revocar `EXECUTE` a `anon` en `public.verify_login(text, text)` o redirigir su lógica internamente a las validaciones de bloqueo y 2FA de `verify_login_secure`.

---

## 2. Vulnerabilidades en Frontend (`src/`)

### 2.1. [CRÍTICA - V-03] Cerrar Bypass de `localStorage` en Heartbeat de Sesión
- **Archivos afectados:**
  - `src/services/authService.js` (líneas 180-198 y 376-398)
  - `src/App.jsx` (líneas 180-205)
- **Problema actual:**
  Si alguien inyecta un JSON en `localStorage.setItem('admqui_session', ...)` desde la consola del navegador en `https://sanatorioargentino.app/`, `verifyActiveUserSession()` recibe `status: 'invalid_session'` desde Supabase, pero `App.jsx` solo ejecuta `logout()` cuando `status.active === false`.
- **Acción a realizar:**
  1. En `verifyActiveUserSession()` (`src/services/authService.js`), si `!current.sessionToken` o si `data.status !== 'ok'` (`'invalid_session'`, `'missing_token'`, `'not_found'`), retornar `{ active: false, kickedOut: false, invalidSession: true }`.
  2. En `src/App.jsx`, agregar un estado `sessionVerified` que valide el token contra el servidor antes de montar las vistas internas, expulsando inmediatamente cualquier sesión inválida o manipulada en `localStorage`.

### 2.2. [MEDIA - V-06] Proteger Rutas de `/recepcion/*` en `src/App.jsx`
- **Archivo afectado:**
  - `src/App.jsx` (líneas 326-347)
- **Problema actual:**
  Las rutas `/recepcion`, `/recepcion/garantias`, `/recepcion/fichas` y `/recepcion/equipo/:equipoId` se renderizan antes de verificar `!currentUser ? <LoginScreen />`.
- **Acción a realizar:**
  - Mover `/recepcion`, `/recepcion/garantias`, `/recepcion/fichas` y `/recepcion/equipo/:equipoId` para que requieran usuario autenticado (`currentUser`), dejando públicas únicamente las pantallas externas de consulta puntual (`/turno`, `/prestacion` con token).

---

## 3. Actualización Integral al Dominio `https://sanatorioargentino.app`

Reemplazar todas las referencias residuales a `quirofano.vercel.app` y habilitar CORS e cabeceras de seguridad para `https://sanatorioargentino.app`:

1. **`sync-server/index.js` (líneas 102-109):**
   - Agregar `/^https:\/\/([a-z0-9-]+\.)*sanatorioargentino\.app$/i` en `ALLOWED_ORIGIN_PATTERNS` para que el backend de sincronización SALUS acepte peticiones desde `https://sanatorioargentino.app`.
2. **`src/services/recetarioService.js` (línea 494) y `src/utils/recetaPdfGenerator.js` (línea 288):**
   - Cambiar el fallback `'https://quirofano.vercel.app'` por `'https://sanatorioargentino.app'`.
3. **`src/App.jsx` (línea 1171):**
   - Cambiar el texto guía de la barra de direcciones de `quirofano.vercel.app/...` a `sanatorioargentino.app/...`.
4. **`vercel.json` (líneas 17-40):**
   - Eliminar las cabeceras duplicadas (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) y agregar `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.

