import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf-8');
const envMap = {};
env.split('\n').forEach(l => {
    const m = l.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (m) envMap[m[1]] = (m[2] || '').trim().replace(/^['"]|['"]$/g, '');
});

const supabase = createClient(envMap.VITE_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY || envMap.VITE_SUPABASE_ANON_KEY);

async function inspectAndReleaseStuckChats() {
    console.log(`Buscando conversaciones en status = 'bot'...`);

    const { data: convs, error } = await supabase
        .from('contact_center_conversations')
        .select('phone, status, bot_stage, bot_active, motivo_consulta, updated_at, nombre_completo, dni, assigned_agent_name')
        .eq('status', 'bot')
        .order('updated_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching convs:', error);
        return;
    }

    console.log(`Encontradas ${convs?.length || 0} conversaciones en status 'bot':`);
    const toRelease = [];

    for (const c of convs || []) {
        console.log(`- ${c.phone} | ${c.nombre_completo || 'Sin nombre'} | stage: ${c.bot_stage} | motivo: ${c.motivo_consulta} | updated: ${c.updated_at}`);
        toRelease.push(c.phone);
    }

    console.log(`\nLiberando ${toRelease.length} conversaciones a 'sin_asignar'...`);
    for (const phone of toRelease) {
        const { error: updErr } = await supabase
            .from('contact_center_conversations')
            .update({
                status: 'sin_asignar',
                bot_active: false,
                bot_stage: 'esperando_agente'
            })
            .eq('phone', phone);
        if (updErr) {
            console.error(`Error actualizando ${phone}:`, updErr);
        } else {
            console.log(`✅ ${phone} liberado a 'sin_asignar'`);
        }
    }
}

inspectAndReleaseStuckChats();
