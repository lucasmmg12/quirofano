-- ============================================================
-- 020: Agregar fertilidad y precaucion al CHECK constraint de status
-- ============================================================

ALTER TABLE surgeries DROP CONSTRAINT IF EXISTS surgeries_status_check;
ALTER TABLE surgeries ADD CONSTRAINT surgeries_status_check 
    CHECK (status = ANY (ARRAY['lila','amarillo','verde','azul','rojo','precaucion','fertilidad']));
