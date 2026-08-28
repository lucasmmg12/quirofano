import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    console.log("Revisando gobernanza_entrevistas (últimas 3)...");
    const { data: entrevistas, error: err1 } = await supabase
        .from('gobernanza_entrevistas')
        .select('id, titulo, estado, created_at, transcripcion')
        .order('created_at', { ascending: false })
        .limit(3);
    
    if (err1) console.error("Error entrevistas:", err1);
    else console.log(entrevistas);

    console.log("\nRevisando archivos en gobernanza_audios (últimos 3)...");
    const { data: audios, error: err2 } = await supabase.storage.from('gobernanza_audios').list('', {
        limit: 5,
        sortBy: { column: 'created_at', order: 'desc' }
    });

    if (err2) console.error("Error storage:", err2);
    else console.log(audios);
}
check();
