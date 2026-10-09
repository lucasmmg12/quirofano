import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
    try {
        console.log('=== ANALIZANDO CHATS EN "sin_asignar" ===\n');

        // 1. Obtener todas las conversaciones en sin_asignar
        const { data: convs, error: errC } = await supabase
            .from('contact_center_conversations')
            .select('*')
            .eq('status', 'sin_asignar')
            .order('updated_at', { ascending: false });

        if (errC) {
            console.error('Error fetching convs:', errC);
            return;
        }

        console.log(`Total de conversaciones en "sin_asignar": ${convs.length}\n`);

        // Desglose por motivo, etapa del bot, y presencia de DNI/datos
        const stages = {};
        const motivos = {};
        const tieneDni = { si: 0, no: 0 };
        const tieneObraSocial = { si: 0, no: 0 };
        const derivacionRazones = {};

        convs.forEach(c => {
            const st = c.bot_stage || 'sin_stage';
            stages[st] = (stages[st] || 0) + 1;

            const mot = (c.motivo_consulta || 'Sin motivo').slice(0, 40);
            motivos[mot] = (motivos[mot] || 0) + 1;

            if (c.dni) tieneDni.si++; else tieneDni.no++;
            if (c.obra_social) tieneObraSocial.si++; else tieneObraSocial.no++;

            const razon = c.ai_summary?.triage_reason || c.ai_summary?.derivacion_motivo || c.resolution_reason || 'Pase a operador estándar';
            derivacionRazones[razon] = (derivacionRazones[razon] || 0) + 1;
        });

        console.log('--- DISTRIBUCIÓN POR ETAPA DEL BOT (bot_stage) ---');
        console.table(stages);

        console.log('\n--- DISTRIBUCIÓN POR RAZÓN / TIPO DERIVACIÓN ---');
        console.table(derivacionRazones);

        console.log('\n--- DATOS COMPLETADOS AL LLEGAR A SIN ASIGNAR ---');
        console.log(`Con DNI: ${tieneDni.si} / ${convs.length} (${Math.round(tieneDni.si / convs.length * 100)}%)`);
        console.log(`Con Obra Social: ${tieneObraSocial.si} / ${convs.length} (${Math.round(tieneObraSocial.si / convs.length * 100)}%)`);

        // Analicemos los últimos 20 chats en detalle (últimos 3 mensajes de cada uno)
        console.log('\n--- MUESTRA DE LOS ÚLTIMOS 15 CHATS EN "sin_asignar" ---');
        for (const c of convs.slice(0, 15)) {
            // Traer últimos 4 mensajes
            const { data: msgs } = await supabase
                .from('whatsapp_messages')
                .select('direction, sender_name, content, created_at')
                .eq('phone', c.phone)
                .order('created_at', { ascending: false })
                .limit(4);

            console.log(`\n------------------------------------------------------------`);
            console.log(`📱 Tel: ${c.phone} | Paciente: ${c.nombre_completo || 'Desconocido'} | DNI: ${c.dni || 'S/D'}`);
            console.log(`🏷️ Stage: ${c.bot_stage} | Motivo: ${c.motivo_consulta}`);
            console.log(`📝 Resumen IA: ${JSON.stringify(c.ai_summary || {})}`);
            console.log(`💬 Últimos mensajes:`);
            (msgs || []).reverse().forEach(m => {
                const dir = m.direction === 'incoming' ? '📥 Paciente' : `📤 ${m.sender_name || 'Bot'}`;
                const text = (m.content || '').replace(/\n/g, ' ').slice(0, 90);
                console.log(`   [${dir}]: ${text}`);
            });
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

run();
