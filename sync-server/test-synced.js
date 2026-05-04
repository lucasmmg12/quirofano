import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: 'c:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Sistema ADM-QUI\\.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
    const { data, error } = await supabase.from('asociaciones_cirugias').select('estado, count', { count: 'exact' });
    console.log("Error:", error);

    const { data: estados, error: err2 } = await supabase.rpc('execute_sql', { sql: `
        SELECT estado, count(*) FROM asociaciones_cirugias GROUP BY estado;
    `});
    console.log("Estados:", estados || err2);

    const { data: d3 } = await supabase.from('asociaciones_cirugias').select('estado');
    const counts = {};
    for (const row of d3) {
        counts[row.estado] = (counts[row.estado] || 0) + 1;
    }
    console.log("Counts:", counts);
}
test();
