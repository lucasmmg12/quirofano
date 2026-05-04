import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: 'c:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Sistema ADM-QUI\\.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
    const { data, error } = await supabase.from('asociaciones_cirugias').select('nombre_cirugia, especialidad, estado').eq('estado', 'URGENCIA').limit(10);
    console.log("URGENCIAS EXISTENTES:", data, error);

    const { data: nullData, error: nullErr } = await supabase.from('asociaciones_cirugias').select('nombre_cirugia').is('nombre_cirugia', null).limit(5);
    console.log("NULL CIRUGIAS:", nullData, nullErr);
}
test();
