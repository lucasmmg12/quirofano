import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data: tables } = await supabase.rpc('execute_readonly_query', {
        query_text: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    });
    console.log('Tables:', tables?.map(t => t.table_name));

    // Check if any table has 'cama' or 'habitacion'
    const { data: cols } = await supabase.rpc('execute_readonly_query', {
        query_text: "SELECT table_name, column_name FROM information_schema.columns WHERE column_name ILIKE '%cama%' OR column_name ILIKE '%habitacion%' OR column_name ILIKE '%box%'"
    });
    console.log('Columns matching cama/habitacion/box:', cols);
}
check();
