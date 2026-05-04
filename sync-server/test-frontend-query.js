import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: 'c:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Sistema ADM-QUI\\.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
    let query = supabase
        .from('asociaciones_cirugias')
        .select('*')
        .is('constancia_id', null)
        .eq('en_carrito', false)
        .in('estado', ['URGENCIA', 'NO PROGRAMADA']);

    const { data, error } = await query;
    console.log(`Found ${data?.length} pending urgencias in DB`);
    if (data?.length > 0) {
        console.table(data.slice(0, 5).map(r => ({ date: r.fecha_realizacion, name: r.nombre_paciente, est: r.estado })));
    }
}
test();
