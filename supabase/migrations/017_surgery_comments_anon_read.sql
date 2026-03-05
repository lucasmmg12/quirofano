-- Permitir lectura anónima de surgery_comments para la vista de recepción
-- La vista /recepcion no requiere login, usa acceso anon

CREATE POLICY "Allow select for anon"
ON surgery_comments
FOR SELECT
TO anon
USING (true);
