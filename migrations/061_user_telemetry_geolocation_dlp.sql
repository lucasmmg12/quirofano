-- 061_user_telemetry_geolocation_dlp.sql
-- Agrega telemetría de ciberseguridad, geolocalización obligatoria por sesión y trazabilidad de dispositivos a user_sessions

ALTER TABLE public.user_sessions
    ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS precision_metros DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geo_permission TEXT,
    ADD COLUMN IF NOT EXISTS geo_label TEXT,
    ADD COLUMN IF NOT EXISTS isp_org TEXT,
    ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS os_browser TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_audit_log_usuario_created ON public.audit_log (usuario, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_usuario_started ON public.user_sessions (usuario, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_module_usage_usuario_entered ON public.user_module_usage (usuario, entered_at DESC);

