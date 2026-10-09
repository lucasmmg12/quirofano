import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf-8');
const envMap = {};
env.split('\n').forEach(l => {
    const m = l.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (m) envMap[m[1]] = (m[2] || '').trim().replace(/^['"]|['"]$/g, '');
});

const supabase = createClient(envMap.VITE_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY || envMap.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data: rosal } = await supabase
        .from('crm_contacts')
        .select('phone, nombre, assigned_line_id')
        .ilike('nombre', '%ROSAL%');
    console.log('ROSAL in CRM:', rosal);

    const { data: lineCounts } = await supabase
        .from('crm_contacts')
        .select('assigned_line_id');
    const counts = {};
    lineCounts?.forEach(c => {
        counts[c.assigned_line_id] = (counts[c.assigned_line_id] || 0) + 1;
    });
    console.log('Line counts in CRM contacts:', counts);
}

check();
