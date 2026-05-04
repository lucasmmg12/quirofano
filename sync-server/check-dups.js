import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: 'c:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Sistema ADM-QUI\\.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
    console.log("Fetching all records...");
    const { data } = await supabase.from('asociaciones_cirugias').select('fecha_realizacion, nombre_paciente, nombre_cirugia');
    
    const map = new Map();
    let dups = 0;
    for (const r of data) {
        const key = `${r.fecha_realizacion}|${r.nombre_paciente}|${r.nombre_cirugia}`;
        if (map.has(key)) {
            dups++;
        }
        map.set(key, true);
    }
    
    console.log(`Found ${dups} duplicates out of ${data.length} records!`);
}
test();
