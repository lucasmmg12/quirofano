-- ============================================================
-- SISTEMA ADM-QUI — Migración 056: Tipo de Trámite Admisión General
-- ============================================================
-- Agrega el tipo de trámite por defecto para el Kiosco unificado.
-- ============================================================

INSERT INTO turnos_config (tipo_tramite, label, prefijo, box_default, color, icono) 
VALUES ('admision_general', 'Admisión General', 'A', 1, '#1565C0', 'Users')
ON CONFLICT (tipo_tramite) DO NOTHING;
