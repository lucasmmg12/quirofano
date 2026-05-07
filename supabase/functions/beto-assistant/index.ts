// Supabase Edge Function: beto-assistant
// Asistente personal AI para ADM-QUI — Sanatorio Argentino
// Arquitectura RAG: Schema Introspection → SQL Dinámico → Respuesta Inteligente

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ═══════════════════════════════════════
// SCHEMA CACHE (RAG Knowledge Base)
// ═══════════════════════════════════════
let schemaCache: string | null = null;
let schemaCacheTime = 0;
const SCHEMA_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Introspects the database schema dynamically.
 * This is the "Retrieval" part of RAG — Beto learns the real schema
 * before answering any question, so column names are always accurate.
 */
async function getSchemaContext(): Promise<string> {
    const now = Date.now();
    if (schemaCache && (now - schemaCacheTime) < SCHEMA_TTL) {
        return schemaCache;
    }

    // Get all tables and their columns from information_schema
    const { data: columns, error } = await supabase.rpc('get_schema_info');

    if (error) {
        // Fallback: try raw SQL if RPC doesn't exist
        const { data: rawCols, error: rawErr } = await supabase
            .from('information_schema.columns' as any)
            .select('table_name, column_name, data_type, is_nullable')
            .in('table_schema', ['public'])
            .order('table_name')
            .order('ordinal_position');

        if (rawErr) {
            console.error('[beto] Schema introspection failed:', rawErr.message);
            return getFallbackSchema();
        }
        schemaCache = formatSchemaFromColumns(rawCols || []);
        schemaCacheTime = now;
        return schemaCache;
    }

    schemaCache = formatSchemaFromColumns(columns || []);
    schemaCacheTime = now;
    return schemaCache;
}

function formatSchemaFromColumns(columns: any[]): string {
    const tables: Record<string, { cols: string[]; types: Record<string, string> }> = {};
    for (const col of columns) {
        const tbl = col.table_name;
        if (!tables[tbl]) tables[tbl] = { cols: [], types: {} };
        tables[tbl].cols.push(col.column_name);
        tables[tbl].types[col.column_name] = col.data_type;
    }

    let schema = '## Esquema Real de la Base de Datos\n\n';
    for (const [table, info] of Object.entries(tables)) {
        schema += `### \`${table}\`\n`;
        schema += info.cols.map(c => `- \`${c}\` (${info.types[c]})`).join('\n');
        schema += '\n\n';
    }
    return schema;
}

/**
 * Fallback hardcoded schema — used when introspection fails.
 * Based on actual column names verified from the codebase.
 */
function getFallbackSchema(): string {
    return `## Esquema de la Base de Datos (verificado)

### \`surgeries\` (Cirugías programadas)
- \`id\` (uuid PK)
- \`id_paciente\` (text) — ID del paciente en SALUS
- \`nombre\` (text) — Nombre completo del paciente (MAYÚSCULAS)
- \`dni\` (text)
- \`telefono\` (text) — Formato 549XXXXXXXXXX
- \`obra_social\` (text)
- \`fecha_cirugia\` (date) — Formato YYYY-MM-DD
- \`medico\` (text) — Cirujano
- \`modulo\` (text) — Módulo/especialidad
- \`status\` (text) — lila, amarillo, verde, azul, rojo, precaucion
- \`excluido\` (boolean) — Si el módulo está excluido del bot
- \`ausente\` (text) — null=pendiente, '0'=realizada, '1'=suspendida
- \`notas\` (text)
- \`operador\` (text)
- \`notificado_at\`, \`autorizado_at\`, \`confirmado_at\` (timestamptz)
- \`descripcion\` (text)
- \`instrucciones\` (text)

### \`deudas_pacientes\` (Deudas de pacientes)
- \`id\` (uuid PK)
- \`nhc\` (text) — Número de historia clínica
- \`nombre\` (text) — Nombre del paciente (MAYÚSCULAS)
- \`telefono\` (text)
- \`cobertura\` (text) — Obra social / Cobertura médica
- \`deuda_total\` (numeric) — Monto total de deuda (Balance)
- \`categoria\` (text) — sin_gestionar, en_gestion, comprometido, cuenta_corriente, incobrable, descuento_liquidacion, sin_deuda_salus
- \`observaciones\` (text)
- \`fecha_deuda\` (date)
- \`facturas_count\` (integer) — Cantidad de facturas
- \`updated_at\` (timestamptz)

### \`asociaciones_cirugias\` (Cirugías de asociaciones médicas)
- \`id\` (uuid PK)
- \`nombre_paciente\` (text)
- \`nombre_cirugia\` (text) — Nombre de la cirugía/procedimiento
- \`fecha_realizacion\` (date)
- \`cirujano\` (text)
- \`asociacion\` (text) — Nombre de la asociación
- \`especialidad\` (text)
- \`obra_social\` (text)
- \`docs_completos\` (boolean) — Documentación completa
- \`constancia_entregada\` (boolean)
- \`carrito_id\` (uuid)

### \`laboratorios_anatomia\` (Biopsias de anatomía patológica)
- \`id\` (uuid PK)
- \`paciente\` (text)
- \`laboratorio\` (text) — Laboratorio asignado
- \`fecha_visita\` (date)
- \`biopsia_simple\` (integer)
- \`biopsia_ampliada\` (integer)
- \`obra_social\` (text)

### \`admqui_usuarios\` (Usuarios del sistema)
- \`id\` (uuid PK)
- \`usuario\` (text) — Username
- \`nombre\` (text) — Nombre completo
- \`iniciales\` (text)
- \`activo\` (boolean)
`;
}

// ═══════════════════════════════════════
// SYSTEM PROMPT — Personalidad de Beto
// ═══════════════════════════════════════
const SYSTEM_PROMPT_BASE = `Eres **Beto**, el asistente personal inteligente del Sistema de Administración del Sanatorio Argentino (ADM-QUI).

## Tu Personalidad
- Sos cordial, profesional y directo. Usás español rioplatense natural (vos, tenés, querés).
- Tratá al usuario de "vos" y sé amigable pero eficiente.
- Cuando expliques datos financieros o médicos, sé claro y preciso.
- Si el usuario pregunta algo que no podés resolver, decilo honestamente.
- Cuando muestres datos, usalos en formato legible con emojis para mejorar la lectura.
- Si te piden explicar el sistema, usá analogías simples.
- IMPORTANTE: Cuando el usuario diga "hoy", "mañana", "esta semana", etc., calculá la fecha correspondiente.

## El Sistema ADM-QUI
Sistema integral de administración del Sanatorio Argentino. Módulos del menú lateral:

1. **🏠 Inicio** — Dashboard con resumen general
2. **💬 Mensajería** — Chat WhatsApp bidireccional con pacientes (templates, multimedia, múltiples líneas)
3. **📋 Pedidos** — Pedidos de prácticas médicas con nomenclador y carrito
4. **📤 Altas Adm** — Control de altas médicas (ingreso, alta, responsable, diagnóstico)
5. **🕐 Cola de Turnos** — Gestión de cola de turnos del día
6. **💰 Deudas** — Seguimiento de deuda por paciente y obra social (categorías: sin_gestionar, en_gestion, comprometido, cuenta_corriente, incobrable, descuento_liquidacion, sin_deuda_salus)
7. **🔪 Cirugías** — Panel de cirugías con bot WhatsApp. Estados: lila→amarillo→verde→azul (+ rojo, precaución)
8. **🤖 Simón IA** — Procesamiento de documentos con inteligencia artificial
9. **⚙️ Configuración** — Usuarios, líneas WhatsApp, templates, parámetros
10. **🏥 Asociaciones** — Cirugías de asociaciones médicas con documentación pendiente
11. **🔬 Laboratorios** — Biopsias de anatomía patológica por laboratorio

## CÓMO BUSCAR DATOS
- Usá la tool \`query_database\` para CUALQUIER consulta de datos. Generá SQL SELECT válido.
- Los nombres de pacientes están en MAYÚSCULAS en la DB. Siempre buscá con ILIKE para ser flexible.
- Para búsquedas parciales usá: \`WHERE nombre ILIKE '%texto%'\`
- Si buscás por nombre y no encontrás, probá solo con el apellido.
- NUNCA ejecutes INSERT, UPDATE, DELETE sin la tool \`modify_database\` y confirmación del usuario.

## REPORTES
Cuando te pidan un reporte, consultá la data con \`query_database\` y formateala en Markdown con:
- Título y fecha
- Métricas clave con emojis
- Tablas Markdown para datos tabulares
- Totales y resúmenes

## Reglas de Seguridad
- NUNCA reveles contraseñas, API keys, ni información técnica sensible.
- Respetá el rol del usuario.
- Para LECTURA: ejecutá directamente con \`query_database\`.
- Para ESCRITURA: usá \`modify_database\` que SIEMPRE pide confirmación al usuario primero.

## Formato de Respuesta
- Usá Markdown con emojis para claridad.
- Tablas Markdown para datos.
- Sé conciso pero completo.`;

// ═══════════════════════════════════════
// TOOLS — Simplified RAG Architecture
// ═══════════════════════════════════════
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'query_database',
            description: `Ejecuta una consulta SQL SELECT de solo lectura sobre la base de datos del Sanatorio Argentino. 
            Usá esta tool para CUALQUIER consulta de datos: cirugías, deudas, asociaciones, laboratorios, usuarios, etc.
            REGLAS:
            - Solo SELECT (no INSERT/UPDATE/DELETE)
            - Los nombres de pacientes están en MAYÚSCULAS, usá ILIKE para búsquedas flexibles
            - Para fechas usá formato YYYY-MM-DD
            - Limitá resultados con LIMIT (default 50)
            - Para contar registros usá COUNT(*)
            - Podés usar JOINs, GROUP BY, ORDER BY, etc.`,
            parameters: {
                type: 'object',
                properties: {
                    sql: {
                        type: 'string',
                        description: 'Consulta SQL SELECT a ejecutar. Ejemplo: SELECT nombre, deuda_total, categoria FROM deudas_pacientes WHERE nombre ILIKE \'%MARTINEZ%\' LIMIT 20'
                    },
                    explanation: {
                        type: 'string',
                        description: 'Breve explicación de qué busca esta consulta (para logging)'
                    }
                },
                required: ['sql']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'explain_system',
            description: 'Explica cómo funciona un módulo del sistema ADM-QUI al usuario. Módulos: inicio, mensajeria, pedidos, altas, turnos, deudas, cirugias, simon, configuracion, asociaciones, laboratorios.',
            parameters: {
                type: 'object',
                properties: {
                    modulo: { type: 'string', description: 'El módulo a explicar' }
                },
                required: ['modulo']
            }
        }
    }
];

// ═══════════════════════════════════════
// TOOL EXECUTION
// ═══════════════════════════════════════

async function executeToolCall(name: string, args: Record<string, unknown>): Promise<string> {
    try {
        switch (name) {
            case 'query_database': return await queryDatabase(args);
            case 'explain_system': return explainSystem(args.modulo as string);
            default: return JSON.stringify({ error: `Tool ${name} no encontrado` });
        }
    } catch (err) {
        return JSON.stringify({ error: err.message });
    }
}

/**
 * RAG Query Engine — Executes validated SELECT queries against the database.
 * This is the core of the RAG pattern: GPT generates SQL based on the schema
 * context, and this function safely executes it.
 */
async function queryDatabase(args: Record<string, unknown>): Promise<string> {
    const sql = (args.sql as string || '').trim();
    const explanation = args.explanation as string || '';

    console.log(`[beto] SQL Query: ${sql}`);
    console.log(`[beto] Explanation: ${explanation}`);

    // Security: Only allow SELECT statements
    const sqlUpper = sql.toUpperCase().replace(/\s+/g, ' ').trim();
    if (!sqlUpper.startsWith('SELECT')) {
        return JSON.stringify({
            error: 'Solo se permiten consultas SELECT. Para modificar datos, pedí confirmación al usuario primero.'
        });
    }

    // Block dangerous patterns
    const blocked = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE', 'EXECUTE', 'EXEC'];
    for (const word of blocked) {
        // Check if dangerous keyword appears as a statement (not inside a string/column name)
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(sqlUpper.replace(/SELECT/i, ''))) {
            return JSON.stringify({
                error: `Operación ${word} no permitida. Solo consultas SELECT.`
            });
        }
    }

    // Execute via Supabase's RPC or direct query
    try {
        const { data, error } = await supabase.rpc('execute_readonly_query', {
            query_text: sql
        });

        if (error) {
            // If RPC doesn't exist, try a different approach
            if (error.message.includes('function') && error.message.includes('does not exist')) {
                return await fallbackQuery(sql);
            }
            return JSON.stringify({ error: error.message, hint: error.hint || '' });
        }

        // Truncate if too large
        const result = data || [];
        const truncated = result.length > 100;
        const finalData = truncated ? result.slice(0, 100) : result;

        return JSON.stringify({
            success: true,
            data: finalData,
            total_rows: result.length,
            truncated,
            note: truncated ? `Mostrando 100 de ${result.length} resultados. Usá LIMIT para acotar.` : undefined
        });
    } catch (err) {
        return JSON.stringify({ error: err.message });
    }
}

/**
 * Fallback: Use Supabase PostgREST API to execute simple queries
 * when RPC is not available.
 */
async function fallbackQuery(sql: string): Promise<string> {
    // Parse the SQL to extract table name and use PostgREST
    const tableMatch = sql.match(/FROM\s+["']?(\w+)["']?/i);
    if (!tableMatch) {
        return JSON.stringify({ error: 'No se pudo identificar la tabla en la consulta.' });
    }

    const table = tableMatch[1];
    const hasWhere = sql.match(/WHERE\s+(.+?)(?:ORDER|GROUP|LIMIT|$)/is);
    const hasLimit = sql.match(/LIMIT\s+(\d+)/i);
    const limit = hasLimit ? parseInt(hasLimit[1]) : 50;

    // For simple queries, use Supabase client
    let query = supabase.from(table).select('*').limit(limit);

    // Try to parse simple WHERE conditions
    if (hasWhere) {
        const conditions = hasWhere[1].trim();
        // Handle ILIKE conditions
        const ilikeMatches = conditions.matchAll(/(\w+)\s+ILIKE\s+'%([^%]+)%'/gi);
        for (const match of ilikeMatches) {
            query = query.ilike(match[1], `%${match[2]}%`);
        }
        // Handle = conditions
        const eqMatches = conditions.matchAll(/(\w+)\s*=\s*'([^']+)'/gi);
        for (const match of eqMatches) {
            query = query.eq(match[1], match[2]);
        }
        // Handle >= conditions (dates)
        const gteMatches = conditions.matchAll(/(\w+)\s*>=\s*'([^']+)'/gi);
        for (const match of gteMatches) {
            query = query.gte(match[1], match[2]);
        }
        // Handle <= conditions
        const lteMatches = conditions.matchAll(/(\w+)\s*<=\s*'([^']+)'/gi);
        for (const match of lteMatches) {
            query = query.lte(match[1], match[2]);
        }
    }

    // Parse ORDER BY
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
        query = query.order(orderMatch[1], { ascending: (orderMatch[2] || 'ASC').toUpperCase() === 'ASC' });
    }

    const { data, error } = await query;
    if (error) {
        return JSON.stringify({ error: error.message, table, fallback: true });
    }

    return JSON.stringify({
        success: true,
        data: data || [],
        total_rows: (data || []).length,
        fallback: true,
        note: 'Consulta ejecutada via PostgREST (parsing simplificado)'
    });
}

function explainSystem(modulo: string): string {
    const explicaciones: Record<string, string> = {
        inicio: `## 🏠 Inicio (Dashboard)
Pantalla principal del sistema ADM-QUI. Muestra un resumen rápido del estado general:
- Cirugías del día y próximas
- Mensajes sin leer
- Tareas pendientes
- Accesos rápidos a todos los módulos

Es tu centro de control diario.`,

        mensajeria: `## 💬 Mensajería (WhatsApp)
Chat WhatsApp bidireccional con pacientes. Es uno de los módulos más usados.

**Funcionalidades:**
- 📩 Envío y recepción de mensajes WhatsApp en tiempo real
- 📝 Templates predefinidos con variables dinámicas
- 🖼️ Soporte multimedia (imágenes, documentos, audios)
- 🔔 Notificaciones de mensajes nuevos (badge rojo con contador)
- 📞 Múltiples líneas WhatsApp configurables
- 👤 Identificación del operador

**Flujo:** Paciente envía WA → llega al sistema en tiempo real → operador responde`,

        pedidos: `## 📋 Pedidos de Prácticas
Gestión de pedidos médicos con nomenclador integrado.

- 🔍 Búsqueda en nomenclador (miles de códigos)
- 🛒 Carrito de prácticas (agregar, quitar, modificar)
- 🖨️ Impresión profesional
- 📲 Envío por WhatsApp
- 📂 Historial de pedidos

Soporta prácticas ambulatorias e internación.`,

        altas: `## 📤 Altas Administrativas
Control de altas médicas hospitalarias.

- 📅 Registro de fechas de ingreso y alta
- 👨‍⚕️ Asignación de responsable
- 📊 Estados: pendiente, en proceso, completada
- 📝 Notas internas y observaciones
- 📋 Seguimiento de diagnósticos`,

        turnos: `## 🕐 Cola de Turnos
Gestión de la cola de turnos del sanatorio.

- 📋 Vista de turnos del día
- ⏰ Gestión de espera y llamado
- 📊 Tiempos de espera
- 🔄 Actualización en tiempo real`,

        deudas: `## 💰 Deudas
Seguimiento completo de deuda de pacientes.

**Categorías:** sin_gestionar → en_gestion → comprometido → cuenta_corriente / incobrable / descuento_liquidacion / sin_deuda_salus

**Datos:** nombre, NHC, teléfono, cobertura (obra social), deuda_total (balance), facturas, categoría
**Filtros:** Por categoría, con/sin teléfono, búsqueda por nombre/NHC
**Acciones:** Enviar WhatsApp, cambiar categoría, agregar observaciones, exportar Excel`,

        cirugias: `## 🔪 Cirugías
Panel de cirugías programadas con bot automático de WhatsApp.

**Estados (colores):**
- 🟣 Lila — Sin mensaje enviado
- 🟡 Amarillo — Documentación en revisión
- 🟢 Verde — Autorizada
- 🔵 Azul — Paciente confirmó
- 🔴 Rojo — Problema
- ⚠️ Precaución — Requiere atención

**Datos:** nombre, DNI, teléfono, obra_social, fecha_cirugia, médico, módulo, status
**Flujo:** Carga Excel SALUS → Bot WA notifica → Docs → Autorización → Confirmación`,

        simon: `## 🤖 SIMÓN IA
Pipeline de procesamiento de documentos con inteligencia artificial.

- 📄 Carga y clasificación automática
- 🧠 Extracción de datos con IA
- ✅ Validación automática
- 📊 Dashboard de procesados`,

        configuracion: `## ⚙️ Configuración
Panel de administración del sistema.

- 👤 Gestión de usuarios
- 📞 Líneas WhatsApp
- 📝 Templates de mensajes
- 🔧 Parámetros generales
- 📊 Logs de auditoría`,

        asociaciones: `## 🏥 Asociaciones
Cirugías de asociaciones médicas profesionales.

**Asociaciones:** Cirujanos, Ginecólogos, Traumatólogos, Cirujanos Pediatras, ORL

**Flujo:** Sync SALUS → Carritos mensuales → Documentación ✅/❌ → Constancia de entrega
**Datos:** nombre_paciente, nombre_cirugia, fecha_realizacion, cirujano, asociacion, docs_completos`,

        laboratorios: `## 🔬 Laboratorios
Biopsias de anatomía patológica por laboratorio.

**Labs:** LDA - Dra. Aguero/Rios, CEDAP, INST.PATOLOG.CUYO
**Tipos:** Congelación, Simple, Ampliada
Cada lab tiene portal propio con sus biopsias asignadas.`,
    };

    return explicaciones[modulo] || `No tengo información sobre "${modulo}". Módulos: ${Object.keys(explicaciones).join(', ')}.`;
}

// ═══════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════
Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { messages, user } = await req.json();

        if (!messages || !Array.isArray(messages)) {
            return new Response(
                JSON.stringify({ error: 'messages array is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!OPENAI_API_KEY) {
            return new Response(
                JSON.stringify({ error: 'OpenAI API key no configurada' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // RAG Step 1: Retrieve schema context
        const schemaContext = await getSchemaContext();

        // Build context with date + user + schema
        const now = new Date();
        const fechaHoy = now.toISOString().split('T')[0];
        const contextInfo = `

Fecha y hora actual: ${fechaHoy} (${now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}).
${user ? `Usuario actual: ${user.nombre} (${user.usuario}). Tratalo por su nombre.` : ''}

${schemaContext}`;

        const fullMessages = [
            { role: 'system', content: SYSTEM_PROMPT_BASE + contextInfo },
            ...messages.slice(-20)
        ];

        // First call to OpenAI
        let response = await callOpenAI(fullMessages, TOOLS);
        let assistantMessage = response.choices[0].message;

        // Handle tool calls (loop for multi-tool)
        let iterations = 0;
        while (assistantMessage.tool_calls && iterations < 5) {
            const toolResults = [];

            for (const toolCall of assistantMessage.tool_calls) {
                const args = JSON.parse(toolCall.function.arguments);
                console.log(`[beto] Tool call: ${toolCall.function.name}`, JSON.stringify(args).slice(0, 200));
                const result = await executeToolCall(toolCall.function.name, args);

                toolResults.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: result,
                });
            }

            fullMessages.push(assistantMessage);
            fullMessages.push(...toolResults);

            response = await callOpenAI(fullMessages, TOOLS);
            assistantMessage = response.choices[0].message;
            iterations++;
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: assistantMessage.content,
                usage: response.usage,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('[beto-assistant] Error:', error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

async function callOpenAI(messages: unknown[], tools: unknown[]) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4.1',
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.3,
            max_tokens: 4096,
        }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${errBody}`);
    }

    return await res.json();
}
