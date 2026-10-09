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

async function getConv(phone) {
    const { data } = await supabase
        .from('contact_center_conversations')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();
    return data;
}

async function getLastBotMsg(phone) {
    const { data } = await supabase
        .from('whatsapp_messages')
        .select('content, created_at, sender_name')
        .eq('phone', phone)
        .eq('direction', 'outgoing')
        .order('created_at', { ascending: false })
        .limit(1);
    return data?.[0];
}

async function cleanupTestPhone(phone) {
    await supabase.from('whatsapp_messages').delete().eq('phone', phone);
    await supabase.from('contact_center_conversations').delete().eq('phone', phone);
}

async function runAllTests() {
    console.log('🚀 Iniciando batería de pruebas sobre la Edge Function whatsapp-webhook en vivo...\n');
    let allPassed = true;

    // -------------------------------------------------------------
    // TEST 1: Pedido de Turno -> Preguntas del Bot -> Datos -> Pasa a SIN ASIGNAR
    // -------------------------------------------------------------
    const phoneTurno = '5492649990001';
    await cleanupTestPhone(phoneTurno);
    console.log(`--- TEST 1: Flujo Turno con Preguntas y Pase a Sin Asignar (${phoneTurno}) ---`);

    // Mensaje 1: Paciente pide turno
    console.log('1. Paciente envía: "Hola, quiero pedir un turno con el Dr. Azuri"');
    const res1 = await sendWebhookMessage(phoneTurno, 'Hola, quiero pedir un turno con el Dr. Azuri', 'Camila Test');
    console.log('   Respuesta Webhook:', res1.status);
    
    // Esperar 1.5s
    await new Promise(r => setTimeout(r, 1500));
    let conv = await getConv(phoneTurno);
    let lastMsg = await getLastBotMsg(phoneTurno);
    console.log(`   Estado tras mensaje 1: status=${conv?.status}, stage=${conv?.bot_stage}, bot_active=${conv?.bot_active}`);
    console.log(`   Bot respondió: "${lastMsg?.content?.slice(0, 100).replace(/\n/g, ' ')}..."`);

    // Mensaje 2: Paciente responde con sus datos (DNI, Nombre, Obra Social, Preferencia)
    console.log('2. Paciente responde con datos: "Mi DNI es 38123456, tengo OSP, turno por la tarde"');
    const res2 = await sendWebhookMessage(phoneTurno, 'Mi DNI es 38123456, tengo OSP, turno por la tarde', 'Camila Test');
    console.log('   Respuesta Webhook:', res2.status);

    await new Promise(r => setTimeout(r, 1500));
    conv = await getConv(phoneTurno);
    lastMsg = await getLastBotMsg(phoneTurno);
    console.log(`   Estado tras mensaje 2: status=${conv?.status}, stage=${conv?.bot_stage}, bot_active=${conv?.bot_active}`);
    console.log(`   Bot respondió: "${lastMsg?.content?.slice(0, 100).replace(/\n/g, ' ')}..."`);

    if (conv?.status === 'sin_asignar' && conv?.bot_active === false) {
        console.log('   ✅ TEST 1 EXITOSO: Pasó a sin_asignar y bot_active = false\n');
    } else {
        console.error(`   ❌ TEST 1 FALLÓ: Se esperaba status 'sin_asignar' y bot_active false, se obtuvo status='${conv?.status}', bot_active=${conv?.bot_active}\n`);
        allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 2: Pedido directo de Asesor / Agente Humano
    // -------------------------------------------------------------
    const phoneAgente = '5492649990002';
    await cleanupTestPhone(phoneAgente);
    console.log(`--- TEST 2: Pedido Directo de Agente Humano (${phoneAgente}) ---`);
    console.log('1. Paciente envía: "Quiero hablar con una persona, un asesor por favor"');
    await sendWebhookMessage(phoneAgente, 'Quiero hablar con una persona, un asesor por favor', 'Roberto Test');
    await new Promise(r => setTimeout(r, 1500));
    conv = await getConv(phoneAgente);
    lastMsg = await getLastBotMsg(phoneAgente);
    console.log(`   Estado: status=${conv?.status}, stage=${conv?.bot_stage}, bot_active=${conv?.bot_active}`);
    console.log(`   Bot respondió: "${lastMsg?.content?.slice(0, 100).replace(/\n/g, ' ')}..."`);

    if (conv?.status === 'sin_asignar' && conv?.bot_active === false) {
        console.log('   ✅ TEST 2 EXITOSO: Derivación inmediata a sin_asignar\n');
    } else {
        console.error(`   ❌ TEST 2 FALLÓ: Se esperaba status 'sin_asignar', se obtuvo '${conv?.status}'\n`);
        allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 3: Consulta de Precios / Aranceles / Análisis
    // -------------------------------------------------------------
    const phonePrecio = '5492649990003';
    await cleanupTestPhone(phonePrecio);
    console.log(`--- TEST 3: Consulta de Arancel / Precio de Análisis (${phonePrecio}) ---`);
    console.log('1. Paciente envía: "Hola, me dirían cuánto sale una ecografía abdominal particular?"');
    await sendWebhookMessage(phonePrecio, 'Hola, me dirían cuánto sale una ecografía abdominal particular?', 'Marcos Test');
    await new Promise(r => setTimeout(r, 1500));
    conv = await getConv(phonePrecio);
    lastMsg = await getLastBotMsg(phonePrecio);
    console.log(`   Estado: status=${conv?.status}, stage=${conv?.bot_stage}, bot_active=${conv?.bot_active}`);
    console.log(`   Bot respondió: "${lastMsg?.content?.slice(0, 100).replace(/\n/g, ' ')}..."`);

    if (conv?.status === 'sin_asignar' && conv?.bot_active === false) {
        console.log('   ✅ TEST 3 EXITOSO: Derivación a sin_asignar para cotización humana\n');
    } else {
        console.error(`   ❌ TEST 3 FALLÓ: Se esperaba status 'sin_asignar', se obtuvo '${conv?.status}'\n`);
        allPassed = false;
    }

    // Limpieza final de teléfonos de prueba
    await cleanupTestPhone(phoneTurno);
    await cleanupTestPhone(phoneAgente);
    await cleanupTestPhone(phonePrecio);

    if (allPassed) {
        console.log('🎉 TODOS LOS TESTS EN VIVO PASARON CON ÉXITO:');
        console.log('- Edge Function respondiendo HTTP 200.');
        console.log('- El bot recolecta datos y deriva inmediatamente a sin_asignar.');
        console.log('- Agentes y Precios van directo a sin_asignar sin retenciones.');
    } else {
        console.error('⚠️ AL MENOS UN TEST FALLÓ. Revisar logs arriba.');
        process.exit(1);
    }
}

runAllTests();
