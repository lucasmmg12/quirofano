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

async function sendWebhookMessage(phone, bodyText, name = 'Paciente Test') {
    const payload = {
        eventName: 'message.incoming',
        projectId: 'ddaeae5f-7204-4205-bc37-31236f277539', // Contact Center
        data: {
            from: phone,
            body: bodyText,
            name: name,
            type: 'text'
        }
    };

    const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_KEY}`
        },
        body: JSON.stringify(payload)
    });

    const resJson = await res.json().catch(() => ({}));
    return { status: res.status, json: resJson };
}

async function run() {
    const testPhone = '5492649990005';
    console.log('--- Configurando conversación cerrada/finalizada para prueba ---');
    await supabase.from('contact_center_conversations').upsert({
        phone: testPhone,
        status: 'finalizado',
        bot_active: false,
        bot_stage: 'esperando_agente',
        closed_at: new Date().toISOString(),
        resolution_reason: 'Turno Coordinado',
        closed_by_agent_name: 'Lucas Marinero',
        assigned_agent_name: null,
        nombre_completo: 'Test Reabrir',
        dni: '35111222'
    }, { onConflict: 'phone' });

    console.log('1. Paciente escribe: "test" tras estar finalizada...');
    const res1 = await sendWebhookMessage(testPhone, 'test', 'Test Reabrir');
    console.log('Respuesta Webhook 1:', res1.status, res1.json?.ok);

    // Esperar 2.5 segundos para dar tiempo a que procese y persista
    await new Promise(r => setTimeout(r, 2500));

    const { data: conv1 } = await supabase.from('contact_center_conversations').select('*').eq('phone', testPhone).single();
    console.log(`Estado tras test: status=${conv1.status}, bot_active=${conv1.bot_active}, closed_at=${conv1.closed_at}, resolution_reason=${conv1.resolution_reason}, stage=${conv1.bot_stage}`);

    if (conv1.status === 'bot' && conv1.bot_active === true && conv1.closed_at === null) {
        console.log('✅ TEST 1 SUPERADO: El chat finalizado volvió al bot exitosamente.');
    } else {
        console.log('❌ FALLO TEST 1: El chat no volvió al bot correctamente.');
    }

    // Ahora probemos una cortesía pura pos-cierre
    console.log('\n--- Probando cortesía pura pos-cierre ("Muchas gracias!") ---');
    await supabase.from('contact_center_conversations').upsert({
        phone: testPhone,
        status: 'finalizado',
        bot_active: false,
        bot_stage: 'esperando_agente',
        closed_at: new Date().toISOString(),
        resolution_reason: 'Turno Coordinado',
        closed_by_agent_name: 'Lucas Marinero'
    }, { onConflict: 'phone' });

    const res2 = await sendWebhookMessage(testPhone, 'Muchas gracias!', 'Test Reabrir');
    console.log('Respuesta Webhook 2:', res2.status, res2.json?.ok);
    await new Promise(r => setTimeout(r, 2500));

    const { data: conv2 } = await supabase.from('contact_center_conversations').select('*').eq('phone', testPhone).single();
    console.log(`Estado tras cortesía: status=${conv2.status}, bot_active=${conv2.bot_active}, closed_at=${conv2.closed_at}`);
    if (conv2.status === 'finalizado' && conv2.bot_active === false && conv2.closed_at !== null) {
        console.log('✅ TEST 2 SUPERADO: La cortesía pos-cierre se mantuvo archivada sin molestar.');
    } else {
        console.log('❌ FALLO TEST 2: La cortesía reabrió el bot erróneamente.');
    }
}

run();
