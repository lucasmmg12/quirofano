GRANT ALL ON TABLE public.rendiciones_garantias TO anon, authenticated;
GRANT ALL ON TABLE public.garantias_historial TO anon, authenticated;

ALTER TABLE public.rendiciones_garantias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on rendiciones_garantias" ON public.rendiciones_garantias FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.garantias_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on garantias_historial" ON public.garantias_historial FOR ALL USING (true) WITH CHECK (true);
-- Quitar la constraint de Foreign Key a surgeries, ya que se usan IDs de altas_administrativas
ALTER TABLE public.garantias_historial DROP CONSTRAINT IF EXISTS garantias_historial_surgery_id_fkey;
