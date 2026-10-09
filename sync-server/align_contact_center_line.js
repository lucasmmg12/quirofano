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

async function run() {
    // 1. Asegurar que contact_center tenga label clara y no esté bloqueada con is_meta
    const { data: updLine, error: lineErr } = await supabase
        .from('whatsapp_lines')
        .update({
            label: 'Contact Center Sanatorio',
            is_active: true,
            is_meta: false
        })
        .eq('id', 'contact_center')
        .select();
    console.log('Updated contact_center line:', updLine, lineErr);

    // 2. Renombrar line_b para que quede explícito que es Autorizaciones
    const { data: updLineB, error: lineBErr } = await supabase
        .from('whatsapp_lines')
        .update({
            label: 'Autorizaciones (exclusivo)',
            is_active: true,
            is_meta: true
        })
        .eq('id', 'line_b')
        .select();
    console.log('Updated line_b:', updLineB, lineBErr);

    // 3. Asignar 'contact_center' a contactos que no tenían línea asignada o tenían line_a / line_b erróneamente en CRM
    const { count: updatedCount, error: crmErr } = await supabase
        .from('crm_contacts')
        .update({ assigned_line_id: 'contact_center' })
        .or('assigned_line_id.is.null,assigned_line_id.eq.line_a,assigned_line_id.eq.line_b');
    console.log('Updated CRM contacts to contact_center default:', crmErr || 'OK');
}

run();
