import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data: mods } = await supabase.rpc('execute_readonly_query', {
        query_text: "SELECT COALESCE(modalidad, 'Sin Modalidad') as mod, COUNT(id) as cnt FROM calidad_peticiones_pruebas GROUP BY modalidad ORDER BY cnt DESC"
    });
    console.log('Modalidades:');
    console.table(mods);

    const { data: tipos } = await supabase.rpc('execute_readonly_query', {
        query_text: "SELECT COALESCE(tipo_articulo, 'Sin Tipo') as tipo, COUNT(id) as cnt FROM calidad_peticiones_pruebas GROUP BY tipo_articulo ORDER BY cnt DESC"
    });
    console.log('Tipos Articulo:');
    console.table(tipos);
}
check();
