import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: dbTime } = await supabase.rpc('next_turno_number', { p_tipo: 'admision_general' });
  
  const { data } = await supabase
    .from('turnos_cola')
    .select('numero_turno, created_at, estado')
    .eq('tipo_tramite', 'admision_general')
    .order('created_at', { ascending: false });
  console.log("Turnos admision_general:");
  console.log(data);
}
run();
