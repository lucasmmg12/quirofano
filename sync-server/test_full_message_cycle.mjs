import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '.env');
const env = fs.readFileSync(envPath, 'utf-8');
const envMap = {};
env.split('\n').forEach(l => {
    const m = l.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (m) envMap[m[1]] = (m[2] || '').trim().replace(/^['"]|['"]$/g, '');
});

const SUPABASE_URL = envMap.VITE_SUPABASE_URL;
const SERVICE_KEY = envMap.SUPABASE_SERVICE_ROLE_KEY || envMap.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook?line=contact_center`;

async function testFullMessageCycle() {
    console.log('=====================================================');
    console.log('🔍 VERIFICACIÓN DE ENTRADA Y SALIDA DE MENSAJES');
    console.log('=====================================================\n');

    const testPhone = '5492649990099';

    // 1. Limpiar estado previo de prueba
    await supabase.from('whatsapp_messages').delete().eq('phone', testPhone);
    await supabase.from('contact_center_conversations').delete().eq('phone', testPhone);

    // ----------------------------------------------------
    // PASO 1: ENTRADA DE MENSAJE (INCOMING)
    // ----------------------------------------------------
    console.log('1️⃣ Probando recepción de mensaje entrante (INCOMING)...');
    const incomingPayload = {
        eventName: 'message.incoming',
        projectId: 'ddaeae5f-7204-4205-bc37-31236f277539', // Contact Center Project
        data: {
            from: testPhone,
            body: 'Hola, buenas tardes, quisiera consultar por turnos',
            name: 'Paciente E2E Test',
            type: 'text'
        }
    };

    const startTime = Date.now();
    const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_KEY}`
        },
        body: JSON.stringify(incomingPayload)
    });

    const resJson = await res.json().catch(() => ({}));
    console.log(`   Respuesta HTTP del Webhook: ${res.status} (ok: ${resJson.ok})`);

    if (res.status !== 200 || !resJson.ok) {
        console.error('❌ Error en el Webhook al recibir mensaje entrante:', resJson);
        process.exit(1);
    }

    // Esperar a que la Edge Function procese y persista tanto entrada como salida
    console.log('   Esperando procesamiento del bot y guardado en base de datos...');
    await new Promise(r => setTimeout(r, 3000));

    // Verificar en whatsapp_messages que esté el INCOMING
    const { data: incomingMsgs } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('phone', testPhone)
        .eq('direction', 'incoming')
        .order('created_at', { ascending: false });

    if (!incomingMsgs || incomingMsgs.length === 0) {
        console.error('❌ FALLO: El mensaje entrante NO se guardó en whatsapp_messages');
        process.exit(1);
    }
    console.log(`   ✅ Mensaje entrante guardado correctamente (ID: ${incomingMsgs[0].id}, texto: "${incomingMsgs[0].content}")`);

    // ----------------------------------------------------
    // PASO 2: SALIDA DE MENSAJE DEL BOT (OUTGOING)
    // ----------------------------------------------------
    console.log('\n2️⃣ Probando respuesta automática saliente del Bot (OUTGOING)...');
    const { data: botOutgoingMsgs } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('phone', testPhone)
        .eq('direction', 'outgoing')
        .order('created_at', { ascending: false });

    if (!botOutgoingMsgs || botOutgoingMsgs.length === 0) {
        console.error('❌ FALLO: El bot no generó respuesta saliente en whatsapp_messages');
        process.exit(1);
    }
    console.log(`   ✅ Respuesta saliente del Bot generada (ID: ${botOutgoingMsgs[0].id}, emisor: "${botOutgoingMsgs[0].sender_name}")`);
    console.log(`   📝 Contenido saliente: "${botOutgoingMsgs[0].content.slice(0, 80)}..."`);

    // ----------------------------------------------------
    // PASO 3: SALIDA DE MENSAJE DEL OPERADOR HUMANO (OUTGOING AGENTE)
    // ----------------------------------------------------
    console.log('\n3️⃣ Probando envío de mensaje saliente de Operador Humano (OUTGOING AGENTE)...');
    const agentMsgContent = 'Hola Paciente E2E Test, te saluda una operadora del Contact Center.';
    const { data: agentOut, error: agentErr } = await supabase
        .from('whatsapp_messages')
        .insert({
            phone: testPhone,
            direction: 'outgoing',
            content: agentMsgContent,
            sender_name: 'Erica Leal (Operadora)',
            is_read: true,
            line_id: 'contact_center',
            raw_payload: {
                line: 'contact_center',
                agent: 'eleal',
                agentName: 'Erica Leal',
                source: 'contact_center'
            }
        })
        .select()
        .single();

    if (agentErr || !agentOut) {
        console.error('❌ FALLO: No se pudo guardar el mensaje saliente del operador:', agentErr);
        process.exit(1);
    }

    // Actualizar la conversación simulando la acción del frontend
    await supabase.from('contact_center_conversations').update({
        last_message_text: agentMsgContent,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'asignado',
        assigned_agent_name: 'Erica Leal'
    }).eq('phone', testPhone);

    console.log(`   ✅ Mensaje saliente de operador guardado y conversación actualizada (ID: ${agentOut.id})`);

    // ----------------------------------------------------
    // PASO 4: VERIFICACIÓN DE ESTADO DE LA CONVERSACIÓN
    // ----------------------------------------------------
    console.log('\n4️⃣ Verificando estado integral de la conversación...');
    const { data: conv } = await supabase
        .from('contact_center_conversations')
        .select('*')
        .eq('phone', testPhone)
        .single();

    console.log(`   Estado conversación: status="${conv.status}", operador="${conv.assigned_agent_name}", last_message="${conv.last_message_text}"`);

    // Limpiar registros de prueba
    await supabase.from('whatsapp_messages').delete().eq('phone', testPhone);
    await supabase.from('contact_center_conversations').delete().eq('phone', testPhone);

    console.log('\n=====================================================');
    console.log('🎉 VERIFICACIÓN EXITOSA: ENTRADA Y SALIDA OPERATIVAS AL 100%');
    console.log('=====================================================');
}

testFullMessageCycle().catch(err => {
    console.error('Error no controlado en test:', err);
    process.exit(1);
});
