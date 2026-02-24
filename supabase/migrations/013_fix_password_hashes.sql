-- ============================================================
-- FIX: Re-hashear passwords que quedaron en texto plano
-- Fecha: 2026-02-24
-- 
-- Si password_hash NO empieza con '$2' (formato bcrypt),
-- significa que está en texto plano y necesita ser hasheada.
-- ============================================================

-- Asegurar extensión pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Re-hashear TODOS los passwords que estén en texto plano
UPDATE usuarios
SET password_hash = crypt(password_hash, gen_salt('bf')),
    updated_at = NOW()
WHERE password_hash NOT LIKE '$2%';

-- Verificación (esto se puede ver en los logs de Supabase)
DO $$
DECLARE
  plain_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO plain_count
  FROM usuarios
  WHERE password_hash NOT LIKE '$2%';
  
  IF plain_count > 0 THEN
    RAISE WARNING 'ALERTA: Aún quedan % passwords sin hashear!', plain_count;
  ELSE
    RAISE NOTICE 'OK: Todos los passwords están hasheados con bcrypt.';
  END IF;
END $$;
