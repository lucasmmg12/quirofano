const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf-8');
const envMap = {};
env.split('\n').forEach(l => {
    const m = l.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (m) envMap[m[1]] = (m[2] || '').trim().replace(/^['"]|['"]$/g, '');
});

const supabase = createClient(envMap.VITE_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY || envMap.VITE_SUPABASE_ANON_KEY);

async function run() {
    for (const phone of ['5492644451288', '5492646286707', '5492645890107', '5492644650763']) {
        console.log(`\n=== PHONE ${phone} ===`);
        const { data: conv } = await supabase.from('contact_center_conversations').select('*').eq('phone', phone).single();
        console.log('Conv:', { status: conv?.status, bot_stage: conv?.bot_stage, bot_active: conv?.bot_active, motivo: conv?.motivo_consulta, medico: conv?.medico_o_especialidad, dni: conv?.dni });
        const { data: msgs } = await supabase.from('whatsapp_messages').select('direction, sender_name, content, created_at').eq('phone', phone).order('created_at', { ascending: true }).limit(10);
        msgs?.forEach(m => console.log(`  [${m.direction}] ${m.sender_name}: ${m.content?.replace(/\n/g, ' ')}`));
    }
}

run();
