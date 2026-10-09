import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
    try {
        console.log('--- CONVERSACIONES RECIENTES ---');
        const { data: convs, error: errC } = await supabase
            .from('contact_center_conversations')
            .select('id, phone, status, assigned_agent_id, assigned_agent_name, bot_active, updated_at, last_message_text')
            .order('updated_at', { ascending: false })
            .limit(20);

        if (errC) console.error('Error convs:', errC);
        else console.table(convs);

        console.log('--- RESUMEN POR STATUS EN CONVERSACIONES ---');
        const { data: allConvs } = await supabase
            .from('contact_center_conversations')
            .select('status, assigned_agent_id, bot_active');
        
        const summary = {};
        allConvs?.forEach(c => {
            const key = `${c.status || 'null'} | assigned: ${c.assigned_agent_id ? 'yes' : 'no'} | bot: ${c.bot_active}`;
            summary[key] = (summary[key] || 0) + 1;
        });
        console.table(summary);

        console.log('--- ÚLTIMOS 10 MENSAJES WHATSAPP CONTACT_CENTER ---');
        const { data: msgs, error: errM } = await supabase
            .from('whatsapp_messages')
            .select('id, phone, direction, sender_name, created_at, line_id, content')
            .eq('line_id', 'contact_center')
            .order('created_at', { ascending: false })
            .limit(10);

        if (errM) console.error('Error msgs:', errM);
        else console.table(msgs?.map(m => ({ ...m, content: m.content?.slice(0, 30) })));

    } catch (e) {
        console.error('Crash:', e);
    }
}

run();
