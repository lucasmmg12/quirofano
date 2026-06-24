import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
s.from('turnos_config').select('id, tipo_tramite, label, grupo_label').then(({data}) => console.log(data));
