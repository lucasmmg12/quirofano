import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function fix() {
  await s.from('turnos_config').update({ label: 'Facturaci\u00f3n, Cobros y Reintegros' }).eq('tipo_tramite', 'reintegros_facturacion');
  await s.from('turnos_config').update({ label: 'Parto o Ces\u00e1rea', grupo_label: 'Autorizaciones de Internaciones y Cirug\u00edas' }).eq('tipo_tramite', 'aut_parto_cesarea');
  await s.from('turnos_config').update({ grupo_label: 'Autorizaciones de Internaciones y Cirug\u00edas' }).in('tipo_tramite', ['aut_obra_social_prov', 'aut_otras_obras_soc']);
  await s.from('turnos_config').update({ grupo_label: 'Informes M\u00e9dicos y Estudios' }).in('tipo_tramite', ['inf_biopsias', 'inf_historia_clinica', 'inf_foja_quirurgica']);
  await s.from('turnos_config').update({ label: 'Solicitud de Historia Cl\u00ednica' }).eq('tipo_tramite', 'inf_historia_clinica');
  await s.from('turnos_config').update({ label: 'Solicitud de Foja Quir\u00fargica' }).eq('tipo_tramite', 'inf_foja_quirurgica');
  console.log('Fixed using unicode escapes');
}

fix();
