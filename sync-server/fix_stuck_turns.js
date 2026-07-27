import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTurns() {
    const { data: turns, error } = await supabase
        .from('turnos_cola')
        .select('*')
        .eq('numero_turno', 'S024')
        .order('created_at', { ascending: false })
        .limit(3);

    if (error) {
        console.error("Error fetching turns:", error);
        return;
    }

    console.log(`Found ${turns.length} turns for S024 in history.`);
    for (const turn of turns) {
        console.log(`- ID: ${turn.id}, State: ${turn.estado}, Created: ${turn.created_at}`);
    }
}

checkTurns();
