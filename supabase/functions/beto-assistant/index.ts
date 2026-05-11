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

    try {
        // Get schema via RPC
        const { data: columns, error } = await supabase.rpc('get_schema_info');

        if (!error && columns) {
            // Filter only relevant ADM-QUI tables
            const relevantTables = [
                'surgeries', 'surgery_events', 'surgery_templates',
                'deudas_pacientes',
                'asociaciones_cirugias',
                'laboratorios_anatomia',
                'admqui_usuarios',
                'altas_medicas',
                'whatsapp_messages', 'whatsapp_templates',
                'consultas_guardia', 'consultas_imports',
            ];
            const filtered = columns.filter((c: any) => relevantTables.includes(c.table_name));
            schemaCache = formatSchemaFromColumns(filtered);
            schemaCacheTime = now;
            return schemaCache;
        }
    } catch (e) {
        console.error('[beto] Schema RPC error:', e.message);
    }

    // Fallback to hardcoded schema
    schemaCache = getFallbackSchema();
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
- \`status\` (text) — VALORES POSIBLES: 'lila', 'amarillo', 'verde', 'azul', 'rojo', 'precaucion'
- \`excluido\` (boolean) — Si el módulo está excluido del bot
- \`ausente\` (text) — null=pendiente, '0'=realizada, '1'=suspendida
- \`notas\` (text)
- \`operador\` (text)
- \`notificado_at\`, \`autorizado_at\`, \`confirmado_at\` (timestamptz)
- \`descripcion\` (text)
- \`instrucciones\` (text)

**FLUJO DE ESTADOS (CRÍTICO — leé con atención):**
Los estados de cirugía son colores que representan un pipeline de gestión:
1. \`lila\` = Sin mensaje enviado (estado inicial, todavía no se contactó al paciente)
2. \`amarillo\` = En Revisión (se envió mensaje, documentación en revisión)
3. \`verde\` = Autorizada (admin aprobó, esperando confirmación del paciente)
4. \`azul\` = Confirmada (paciente confirmó asistencia ✅)
5. \`rojo\` = Problema (documentación faltante, paciente no responde, etc.)
6. \`precaucion\` = Requiere atención especial

**Columna \`ausente\` (resultado final de la cirugía):**
- NULL = cirugía aún pendiente/activa (no se realizó todavía)
- '0' = cirugía REALIZADA exitosamente
- '1' = cirugía SUSPENDIDA

**REGLAS para evaluar estado de confirmación:**
- Una cirugía está "CONFIRMADA" si \`status = 'azul'\`
- Una cirugía está "AUTORIZADA" (pero aún no confirmada) si \`status = 'verde'\`
- Una cirugía está "EN PROCESO" (notificada, en gestión) si \`status = 'amarillo'\`
- Una cirugía está "SIN GESTIONAR" si \`status = 'lila'\`
- Una cirugía está "CON PROBLEMA" si \`status = 'rojo'\`
- Cuando pregunten "cirugías confirmadas" → filtrar por \`status = 'azul'\`
- Cuando pregunten "cirugías sin confirmar" → filtrar por \`status != 'azul'\` (o listar las que NO son azul)
- Para cirugías "en buen camino" considerá verde + azul como avanzadas
- SIEMPRE excluí las excluidas: \`excluido = false\`
- Para cirugías "activas" (no finalizadas): \`ausente IS NULL\`

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

### \`consultas_guardia\` (Consultas de guardia ambulatorias — ~5800 por mes)
- \`id\` (bigint PK)
- \`import_id\` (uuid FK → consultas_imports)
- \`id_visita\` (bigint UNIQUE) — ID de la visita en SALUS
- \`id_paciente\` (bigint)
- \`cliente\` (text) — Obra social completa, ej: "001 - PROVINCIA"
- \`paciente\` (text) — Nombre completo del paciente
- \`nhc\` (int) — Número de historia clínica
- \`nif\` (text) — DNI del paciente
- \`agenda\` (text) — Agenda médica, ej: "GUARDIAS PEDIATRÍA", "GUARDIAS CLINICA"
- \`agrupacion_agenda\` (text)
- \`grupo_agenda\` (text) — Grupo: "GUARDIAS", "GUARDIA CLINICA", "CARDIOLOGÍA", etc.
- \`tipo_visita\` (text) — Tipo específico: "(PED) CONSULTAS", "(CARD) ELECTROCARDIOGRAMA", etc.
- \`tiempo_pred\` (int) — Tiempo predeterminado en minutos
- \`fecha_visita\` (date) — Fecha de la consulta
- \`visita_especialidad\` (text) — VALORES: 'PEDIATRIA', 'CLINICO', 'GINECOLOGIA', 'CARDIOLOGIA', 'PREPARTO', 'NEONATOLOGIA'
- \`mes_periodo\` (text) — Formato: '2026-04', '2026-05'. Usar para filtrar por mes.

### \`consultas_imports\` (Registro de importaciones mensuales)
- \`id\` (uuid PK)
- \`mes\` (text) — Período, ej: '2026-04'
- \`archivo\` (text) — Nombre del archivo importado
- \`total_registros\` (int)
- \`created_at\` (timestamptz)

**REGLAS para consultas de guardia:**
- Filtrar SIEMPRE por mes_periodo, ej: \`WHERE mes_periodo = '2026-04'\`
- Especialidades: PEDIATRIA (~61%), CLINICO (~20%), GINECOLOGIA (~13%), CARDIOLOGIA (~5%)
- Obras sociales principales: PROVINCIA (~34%), OSDE BINARIO (~15%), JERARQUICOS (~7%)
- Promedio: ~195 consultas/día
- Los datos son de guardias (consultas ambulatorias de emergencia)
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
7. **🔪 Cirugías** — Panel de cirugías con bot WhatsApp. Pipeline: lila(sin mensaje) → amarillo(en revisión) → verde(autorizada) → azul(CONFIRMADA). Extras: rojo(problema), precaución.
8. **🤖 Simón IA** — Procesamiento de documentos con inteligencia artificial
9. **⚙️ Configuración** — Usuarios, líneas WhatsApp, templates, parámetros
10. **🏥 Asociaciones** — Cirugías de asociaciones médicas con documentación pendiente
11. **🔬 Laboratorios** — Biopsias de anatomía patológica por laboratorio
12. **📊 Consultas Guardia** — Estadísticas de consultas ambulatorias de guardia. Datos por especialidad, obra social, día/semana. ~5800 consultas/mes. Tabla: consultas_guardia.

## CÓMO BUSCAR DATOS
- Usá la tool \`query_database\` para CUALQUIER consulta de datos. Generá SQL SELECT válido.
- Los nombres de pacientes están en MAYÚSCULAS en la DB. Siempre buscá con ILIKE para ser flexible.
- Para búsquedas parciales usá: \`WHERE nombre ILIKE '%texto%'\`
- Si buscás por nombre y no encontrás, probá solo con el apellido.

## CONSULTAS DE CIRUGÍAS (MUY IMPORTANTE)
Cuando te pregunten sobre cirugías, SIEMPRE usá el campo \`status\` para determinar el estado.
El campo \`status\` contiene COLORES que representan estados del pipeline:
- \`status = 'azul'\` → CONFIRMADA ✅ (el paciente confirmó asistencia)
- \`status = 'verde'\` → AUTORIZADA (aprobada por admin, aún sin confirmación del paciente)
- \`status = 'amarillo'\` → EN REVISIÓN (documentación enviada, en proceso)
- \`status = 'lila'\` → SIN MENSAJE (estado inicial, no se contactó al paciente)
- \`status = 'rojo'\` → PROBLEMA
- \`status = 'precaucion'\` → PRECAUCIÓN

PATRONES SQL correctos:
- Cirugías confirmadas: \`SELECT ... FROM surgeries WHERE status = 'azul' AND excluido = false\`
- Cirugías SIN confirmar: \`SELECT ... FROM surgeries WHERE status != 'azul' AND excluido = false\`
- Cirugías autorizadas (verde + azul): \`SELECT ... FROM surgeries WHERE status IN ('verde','azul') AND excluido = false\`
- Resumen de estados: \`SELECT status, COUNT(*) FROM surgeries WHERE fecha_cirugia = 'YYYY-MM-DD' AND excluido = false AND (ausente IS NULL) GROUP BY status\`
- Cirugías activas (no finalizadas): agregar \`AND (ausente IS NULL)\` para excluir realizadas/suspendidas
- Cirugías realizadas: \`ausente = '0'\`
- Cirugías suspendidas: \`ausente = '1'\`

**NUNCA** uses \`confirmado_at\` como indicador principal de confirmación. El campo que define si una cirugía está confirmada es \`status = 'azul'\`. El \`confirmado_at\` es solo un timestamp auxiliar.

## MODIFICAR DATOS (Human-in-the-loop)
- Para ESCRITURA: usá \`modify_database\`.
- SIEMPRE primero describí lo que vas a hacer y pedí confirmación EXPLÍCITA.
- Solo cuando el usuario diga "sí", "dale", "confirmo", "ok" → ejecutá con confirmed=true.
- Si el usuario NO confirmó, NO ejecutes. Mostrá qué harías y preguntá.

## ENVIAR WHATSAPP
- Usá \`send_whatsapp\` para enviar mensajes.
- SIEMPRE mostrá el mensaje antes de enviar y pedí confirmación.
- Buscá primero el teléfono del paciente en la DB.

## NAVEGACIÓN
- Si el usuario pide ir a un módulo, usá \`navigate_to\`.
- Tu respuesta debe incluir: \`[ACTION:navigate:modulo]\` para que el frontend redirija.
- Ejemplo: "Te llevo a Cirugías [ACTION:navigate:cirugias]"

## ALERTAS
- Usá \`get_alerts\` cuando el usuario pregunte "qué hay pendiente", "qué tengo que hacer", "novedades".
- Presentá las alertas de forma clara y priorizada (⚠️ warnings primero).

## REPORTES (IMPORTANTE — Formato para exportación PDF)
Cuando te pidan un reporte, consultá la data con \`query_database\` y formateala con este formato ESTRICTO:

### Estructura obligatoria:
1. **Título**: Empezá SIEMPRE con \`## 📊 Título del Reporte\`
2. **Fecha**: Línea con la fecha actual: \`**Fecha:** DD/MM/YYYY\`
3. **Resumen rápido**: 2-3 métricas clave con emojis (ej: "📋 Total: 15 cirugías | ✅ Confirmadas: 10 | ⚠️ Pendientes: 5")
4. **Tabla de datos**: Tabla Markdown con columnas CORTAS y legibles
5. **Conclusión/Resumen**: Cierre con observaciones clave

### Reglas para tablas:
- Usá nombres de columna CORTOS: "Paciente", "Especialidad", "Estado", "Fecha", "Médico"
- NO repitas datos que ya están en el resumen
- MÁXIMO 6-7 columnas por tabla. Si hay más datos, hacé múltiples tablas temáticas.
- Los estados deben ser LEGIBLES: "Confirmada ✅" en vez de "azul"
- Montos con formato: "$50.000" en vez de "50000"
- Fechas con formato: "08/05" en vez de "2026-05-08"
- Si hay muchos registros (>15), mostrá los más relevantes y un resumen del resto

### Ejemplo de reporte bien formateado:
\`\`\`
## 📊 Reporte de Cirugías — 08/05/2026

**Fecha:** 08/05/2026 | **Total:** 12 cirugías

📋 Total: 12 | ✅ Confirmadas: 8 | ⚠️ Pendientes: 3 | 🔴 Problemas: 1

| Paciente | Especialidad | Médico | Estado |
|----------|-------------|--------|--------|
| LUNA, GLADYS | Urología | Dr. Zalazar | Confirmada ✅ |
| BISTOCCO, M. | Traumatología | Dra. García | Pendiente ⚠️ |

### Observaciones
- 67% de confirmación alcanzado
- 3 cirugías requieren contacto urgente
\`\`\`

El frontend detecta automáticamente los reportes y ofrece al usuario **descarga en PDF** e **impresión** con formato profesional del Sanatorio.

## EXPORTACIÓN A EXCEL (NUEVO — MUY IMPORTANTE)
Cuando el usuario pida exportar datos a Excel, descargar un reporte, o diga cosas como "pasame a Excel", "dame un Excel de...", "exportar a Excel", "descargar datos":

1. Usá la tool \`generate_excel_report\` para consultar los datos.
2. La tool te devuelve los datos en formato JSON.
3. En tu respuesta, incluí un bloque especial \`\`\`beto-excel\`\`\` con la estructura de datos para que el frontend genere y descargue el Excel automáticamente.

### Formato del bloque beto-excel:
\`\`\`beto-excel
{"reportName": "Deudas_OSDE_Mayo2026", "sheetName": "Datos", "columns": ["Paciente", "NHC", "Deuda Total", "Cobertura"], "data": [["PEREZ, JUAN", "12345", 150000, "OSDE"], ["GARCIA, ANA", "67890", 85000, "OSDE"]], "filters": "Obra Social: OSDE | Período: Mayo 2026"}
\`\`\`

**REGLAS para Excel:**
- \`reportName\`: Nombre del archivo sin extensión (sin espacios, usar guiones bajos)
- \`sheetName\`: Nombre de la pestaña del Excel (corto, max 31 chars)
- \`columns\`: Array de nombres de columnas legibles (en español)
- \`data\`: Array de arrays con los valores (cada sub-array es una fila)
- \`filters\`: String descriptivo de los filtros aplicados (se agrega como subtítulo)
- Montos numéricos SIN formato (el frontend los formatea)
- Fechas como strings legibles: "08/05/2026"
- Estados legibles: "Confirmada" en vez de "azul"
- MÁXIMO 500 filas por reporte. Si hay más, avisá al usuario y mostrá los primeros 500.
- Siempre acompañá el bloque beto-excel con un mensaje descriptivo al usuario.

### Reportes predefinidos por módulo:
Cuando el usuario pida "exportar deudas", "Excel de cirugías", etc. sin filtros específicos, usá estos queries base:
- **Deudas**: SELECT nombre, nhc, telefono, cobertura, deuda_total, categoria, facturas_count, fecha_deuda FROM deudas_pacientes ORDER BY deuda_total DESC LIMIT 500
- **Cirugías**: SELECT nombre, dni, obra_social, fecha_cirugia, medico, modulo, status, ausente FROM surgeries WHERE excluido = false ORDER BY fecha_cirugia DESC LIMIT 500
- **Consultas Guardia**: SELECT paciente, nif, cliente, agenda, tipo_visita, fecha_visita, visita_especialidad FROM consultas_guardia WHERE mes_periodo = '[mes_actual]' LIMIT 500
- **Asociaciones**: SELECT nombre_paciente, nombre_cirugia, fecha_realizacion, cirujano, asociacion, especialidad, obra_social, docs_completos FROM asociaciones_cirugias ORDER BY fecha_realizacion DESC LIMIT 500
- **Laboratorios**: SELECT paciente, laboratorio, fecha_visita, biopsia_simple, biopsia_ampliada, obra_social FROM laboratorios_anatomia ORDER BY fecha_visita DESC LIMIT 500
- **Altas**: SELECT * FROM altas_medicas ORDER BY created_at DESC LIMIT 500

## Reglas de Seguridad
- NUNCA reveles contraseñas, API keys, ni información técnica sensible.
- Respetá el rol del usuario.

## FORMATO DE ACCIONES EN RESPUESTA
Cuando ejecutes una acción especial, incluí estos tags en tu respuesta para que el frontend los procese:
- Navegación: \`[ACTION:navigate:nombre_modulo]\`
- Confirmación requerida: \`[ACTION:confirm:descripcion]\`
Estos tags son invisibles para el usuario pero el frontend los usa para ejecutar acciones.

## Formato de Respuesta
- Usá Markdown con emojis para claridad.
- Tablas Markdown para datos.
- Sé conciso pero completo.

## RESPUESTAS ENRIQUECIDAS (Rich Components)
Cuando generes reportes o resúmenes, podés usar bloques especiales que el frontend renderiza como componentes visuales:

### Stats Card (Mini-dashboard con métricas)
\`\`\`beto-stats
{"items": [{"value": "12", "label": "Confirmadas", "color": "#10B981"}, {"value": "5", "label": "Pendientes", "color": "#F59E0B"}]}
\`\`\`

### Pipeline (Barra de progreso por estados)
\`\`\`beto-pipeline
{"items": [{"status": "azul", "label": "Confirmadas", "count": 8}, {"status": "verde", "label": "Autorizadas", "count": 3}, {"status": "lila", "label": "Sin mensaje", "count": 5}]}
\`\`\`

### Insight (Tarjeta de predicción/tendencia)
\`\`\`beto-insight
{"type": "positive|warning|negative|info", "title": "Tendencia positiva", "description": "Las confirmaciones aumentaron un 15% respecto al mes pasado."}
\`\`\`

Usá estos bloques cuando muestres datos de cirugías, deudas o estadísticas. El frontend los detecta y los renderiza como componentes visuales interactivos. Incluilos ADEMÁS del texto normal de tu respuesta.`;

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
                        description: 'Consulta SQL SELECT a ejecutar.'
                    },
                    explanation: {
                        type: 'string',
                        description: 'Breve explicación de qué busca esta consulta'
                    }
                },
                required: ['sql']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'modify_database',
            description: `Ejecuta una operación de escritura (UPDATE) en la base de datos. SOLO usar después de que el usuario CONFIRME la acción.
            REGLAS:
            - Solo UPDATE (no INSERT, DELETE, DROP)
            - El usuario DEBE haber confirmado explícitamente (dijo "sí", "dale", "confirmo", etc.)
            - Siempre incluí una cláusula WHERE específica
            - Antes de usar esta tool, primero describí al usuario qué vas a hacer y pedí confirmación`,
            parameters: {
                type: 'object',
                properties: {
                    sql: { type: 'string', description: 'SQL UPDATE a ejecutar. DEBE tener WHERE.' },
                    description: { type: 'string', description: 'Descripción legible de lo que hace este cambio' },
                    confirmed: { type: 'boolean', description: 'true si el usuario ya confirmó esta acción' }
                },
                required: ['sql', 'description', 'confirmed']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'send_whatsapp',
            description: `Envía un mensaje de WhatsApp a un paciente. SOLO usar después de que el usuario CONFIRME.
            El usuario debe confirmar antes de enviar. Mostrale el mensaje que vas a enviar y pedí OK.`,
            parameters: {
                type: 'object',
                properties: {
                    telefono: { type: 'string', description: 'Número de teléfono (formato 549XXXXXXXXXX)' },
                    mensaje: { type: 'string', description: 'Texto del mensaje a enviar' },
                    paciente: { type: 'string', description: 'Nombre del paciente (para logging)' }
                },
                required: ['telefono', 'mensaje']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'navigate_to',
            description: 'Redirige al usuario a un módulo específico del sistema. Usá esto cuando el usuario pida "llevame a", "abrí", "ir a".',
            parameters: {
                type: 'object',
                properties: {
                    modulo: { type: 'string', description: 'Módulo destino: inicio, mensajeria, pedidos, altas, turnos, deudas, cirugias, simon, configuracion' }
                },
                required: ['modulo']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_alerts',
            description: 'Obtiene alertas y pendientes del sistema. Usá esto cuando el usuario pregunte "qué hay pendiente", "qué tengo que hacer", "novedades", o al inicio de la conversación.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'explain_system',
            description: 'Explica cómo funciona un módulo del sistema ADM-QUI.',
            parameters: {
                type: 'object',
                properties: {
                    modulo: { type: 'string', description: 'Módulo a explicar: inicio, mensajeria, pedidos, altas, turnos, deudas, cirugias, simon, configuracion, asociaciones, laboratorios' }
                },
                required: ['modulo']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generate_excel_report',
            description: `Genera datos para un reporte Excel. Usá esta tool cuando el usuario pida exportar datos a Excel, descargar reportes, o diga "pasame a Excel", "exportar", "descargar datos".
            Ejecuta una consulta SQL y devuelve los datos formateados para que el frontend genere el archivo Excel.
            REGLAS:
            - Solo SELECT (no INSERT/UPDATE/DELETE)
            - Limitá a 500 filas máximo
            - Incluí columnas legibles en español
            - Transformá estados técnicos a legibles (azul→Confirmada, lila→Sin mensaje, etc)
            - Formateá fechas como DD/MM/YYYY
            - Montos como números sin formato`,
            parameters: {
                type: 'object',
                properties: {
                    sql: {
                        type: 'string',
                        description: 'Consulta SQL SELECT para obtener los datos del reporte. LIMIT 500 máximo.'
                    },
                    report_name: {
                        type: 'string',
                        description: 'Nombre descriptivo del reporte sin extensión, con guiones bajos. Ej: Deudas_OSDE_Mayo2026'
                    },
                    sheet_name: {
                        type: 'string',
                        description: 'Nombre de la pestaña del Excel (max 31 chars). Ej: Deudas'
                    },
                    columns: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Nombres legibles de las columnas en español. Ej: ["Paciente", "NHC", "Deuda Total"]'
                    },
                    column_keys: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Keys técnicas correspondientes a cada columna (nombres de columna SQL). Ej: ["nombre", "nhc", "deuda_total"]'
                    },
                    filters_description: {
                        type: 'string',
                        description: 'Descripción legible de los filtros aplicados. Ej: "Obra Social: OSDE | Período: Mayo 2026"'
                    }
                },
                required: ['sql', 'report_name', 'sheet_name', 'columns', 'column_keys']
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
            case 'modify_database': return await modifyDatabase(args);
            case 'send_whatsapp': return await sendWhatsApp(args);
            case 'navigate_to': return navigateTo(args);
            case 'get_alerts': return await getAlerts();
            case 'explain_system': return explainSystem(args.modulo as string);
            case 'generate_excel_report': return await generateExcelReport(args);
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
            error: 'Solo se permiten consultas SELECT.'
        });
    }

    // Execute via RPC
    try {
        const { data, error } = await supabase.rpc('execute_readonly_query', {
            query_text: sql
        });

        if (error) {
            console.error('[beto] RPC error:', error.message);
            // Try fallback
            return await fallbackQuery(sql);
        }

        const result = data || [];
        const truncated = result.length > 50;
        const finalData = truncated ? result.slice(0, 50) : result;

        return JSON.stringify({
            success: true,
            data: finalData,
            total_rows: result.length,
            truncated,
        });
    } catch (err) {
        console.error('[beto] Query execution error:', err.message);
        return await fallbackQuery(sql);
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

// ═══════════════════════════════════════
// MODIFY DATABASE (Human-in-the-loop)
// ═══════════════════════════════════════

async function modifyDatabase(args: Record<string, unknown>): Promise<string> {
    const sql = (args.sql as string || '').trim();
    const description = args.description as string || '';
    const confirmed = args.confirmed as boolean || false;

    if (!confirmed) {
        return JSON.stringify({
            action: 'confirm_required',
            description,
            sql_preview: sql,
            message: 'El usuario aún no confirmó esta acción. Mostrá la descripción y pedí confirmación.'
        });
    }

    // Only allow UPDATE
    const sqlUpper = sql.toUpperCase().replace(/\s+/g, ' ').trim();
    if (!sqlUpper.startsWith('UPDATE')) {
        return JSON.stringify({ error: 'Solo se permiten operaciones UPDATE.' });
    }

    // Must have WHERE clause
    if (!sqlUpper.includes('WHERE')) {
        return JSON.stringify({ error: 'UPDATE debe tener cláusula WHERE.' });
    }

    // Block dangerous operations
    if (/\b(DROP|TRUNCATE|DELETE|ALTER|CREATE)\b/i.test(sql)) {
        return JSON.stringify({ error: 'Operación no permitida.' });
    }

    try {
        const { data, error } = await supabase.rpc('execute_readonly_query', {
            query_text: sql.replace(/^UPDATE/i, 'UPDATE') // RPC only allows SELECT, so we need direct execution
        });

        // Since our RPC only allows SELECT, we need a write RPC
        // For now, parse the UPDATE and use Supabase client
        const tableMatch = sql.match(/UPDATE\s+["']?(\w+)["']?/i);
        const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*'([^']+)'/i);
        const setMatch = sql.match(/SET\s+(\w+)\s*=\s*'([^']+)'/i);

        if (!tableMatch || !whereMatch || !setMatch) {
            return JSON.stringify({ error: 'No se pudo parsear el UPDATE. Formato: UPDATE tabla SET campo=valor WHERE condicion=valor' });
        }

        const { error: updateError } = await supabase
            .from(tableMatch[1])
            .update({ [setMatch[1]]: setMatch[2], updated_at: new Date().toISOString() })
            .eq(whereMatch[1], whereMatch[2]);

        if (updateError) {
            return JSON.stringify({ error: updateError.message });
        }

        return JSON.stringify({
            success: true,
            action: 'modified',
            description,
            message: `✅ ${description}`
        });
    } catch (err) {
        return JSON.stringify({ error: err.message });
    }
}

// ═══════════════════════════════════════
// SEND WHATSAPP
// ═══════════════════════════════════════

async function sendWhatsApp(args: Record<string, unknown>): Promise<string> {
    const telefono = args.telefono as string;
    const mensaje = args.mensaje as string;
    const paciente = args.paciente as string || 'Paciente';

    if (!telefono || !mensaje) {
        return JSON.stringify({ error: 'Se requiere teléfono y mensaje.' });
    }

    // Normalize phone number
    let phone = telefono.replace(/\D/g, '');
    if (phone.length === 10) phone = '549' + phone;
    if (phone.length === 11 && phone.startsWith('0')) phone = '549' + phone.slice(1);

    try {
        // Call the existing WhatsApp send function
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: {
                to: phone,
                message: mensaje,
                context: `Enviado por Beto para ${paciente}`
            }
        });

        if (error) {
            return JSON.stringify({ error: error.message, fallback: 'Podés intentar enviarlo manualmente desde el módulo de Mensajería.' });
        }

        return JSON.stringify({
            success: true,
            action: 'whatsapp_sent',
            message: `📲 Mensaje enviado a ${paciente} (${phone})`,
            paciente,
            telefono: phone
        });
    } catch (err) {
        return JSON.stringify({
            error: err.message,
            message: 'No se pudo enviar. Intentá desde el módulo de Mensajería.',
            action: 'whatsapp_error'
        });
    }
}

// ═══════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════

function navigateTo(args: Record<string, unknown>): string {
    const modulo = args.modulo as string || '';
    const moduleMap: Record<string, string> = {
        inicio: 'inicio',
        mensajeria: 'mensajeria',
        pedidos: 'pedidos',
        altas: 'altas',
        turnos: 'turnos',
        deudas: 'deudas',
        cirugias: 'cirugias',
        simon: 'simon',
        configuracion: 'configuracion',
    };

    const target = moduleMap[modulo.toLowerCase()];
    if (!target) {
        return JSON.stringify({ error: `Módulo "${modulo}" no encontrado.`, available: Object.keys(moduleMap) });
    }

    return JSON.stringify({
        action: 'navigate',
        target,
        message: `🧭 Navegando a ${modulo}...`
    });
}

// ═══════════════════════════════════════
// PROACTIVE ALERTS
// ═══════════════════════════════════════

async function getAlerts(): Promise<string> {
    const hoy = new Date().toISOString().split('T')[0];
    const alerts: { type: string; icon: string; message: string; count?: number }[] = [];

    try {
        // 1. Cirugías de hoy — conteo total y desglose por estado
        const { count: cirugiasHoy } = await supabase.from('surgeries')
            .select('*', { count: 'exact', head: true })
            .eq('excluido', false).eq('fecha_cirugia', hoy)
            .is('ausente', null);

        // Cirugías de hoy confirmadas (status = 'azul')
        const { count: confirmadasHoy } = await supabase.from('surgeries')
            .select('*', { count: 'exact', head: true })
            .eq('excluido', false).eq('fecha_cirugia', hoy)
            .eq('status', 'azul')
            .is('ausente', null);

        // Cirugías de hoy sin notificar (status = 'lila', aún no se contactó al paciente)
        const { count: sinNotificar } = await supabase.from('surgeries')
            .select('*', { count: 'exact', head: true })
            .eq('excluido', false).eq('fecha_cirugia', hoy)
            .eq('status', 'lila')
            .is('ausente', null);

        if (cirugiasHoy && cirugiasHoy > 0) {
            const confirmadas = confirmadasHoy || 0;
            const sinConfirmar = cirugiasHoy - confirmadas;
            alerts.push({
                type: 'info', icon: '🔪',
                message: `${cirugiasHoy} cirugías para hoy: ${confirmadas} confirmadas ✅, ${sinConfirmar} sin confirmar`,
                count: cirugiasHoy
            });
        }
        if (sinNotificar && sinNotificar > 0) {
            alerts.push({
                type: 'warning', icon: '⚠️',
                message: `${sinNotificar} cirugías de hoy SIN notificar al paciente (estado lila)`,
                count: sinNotificar
            });
        }

        // 2. Deudas sin gestionar
        const { count: sinGestionar } = await supabase.from('deudas_pacientes')
            .select('*', { count: 'exact', head: true })
            .eq('categoria', 'sin_gestionar')
            .gte('deuda_total', 50000);

        if (sinGestionar && sinGestionar > 0) {
            alerts.push({
                type: 'warning', icon: '💰',
                message: `${sinGestionar} pacientes con deuda sin gestionar (>$50.000)`,
                count: sinGestionar
            });
        }

        // 3. Documentación pendiente en asociaciones
        const { count: docsPend } = await supabase.from('asociaciones_cirugias')
            .select('*', { count: 'exact', head: true })
            .or('docs_completos.is.null,docs_completos.eq.false');

        if (docsPend && docsPend > 0) {
            alerts.push({
                type: 'info', icon: '📋',
                message: `${docsPend} cirugías de asociaciones con documentación pendiente`,
                count: docsPend
            });
        }

        // 4. Cirugías próximas (próximos 3 días) con desglose de confirmadas
        const tresDias = new Date();
        tresDias.setDate(tresDias.getDate() + 3);
        const tresDiasStr = tresDias.toISOString().split('T')[0];

        const { count: proximas } = await supabase.from('surgeries')
            .select('*', { count: 'exact', head: true })
            .eq('excluido', false)
            .gt('fecha_cirugia', hoy)
            .lte('fecha_cirugia', tresDiasStr)
            .is('ausente', null);

        const { count: proximasConfirmadas } = await supabase.from('surgeries')
            .select('*', { count: 'exact', head: true })
            .eq('excluido', false)
            .gt('fecha_cirugia', hoy)
            .lte('fecha_cirugia', tresDiasStr)
            .eq('status', 'azul')
            .is('ausente', null);

        if (proximas && proximas > 0) {
            const confProx = proximasConfirmadas || 0;
            alerts.push({
                type: 'info', icon: '📅',
                message: `${proximas} cirugías en los próximos 3 días (${confProx} confirmadas, ${proximas - confProx} pendientes)`,
                count: proximas
            });
        }
    } catch (err) {
        console.error('[beto] Alerts error:', err.message);
    }

    return JSON.stringify({
        alerts,
        total: alerts.length,
        fecha: hoy
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
// GENERATE EXCEL REPORT
// ═══════════════════════════════════════

async function generateExcelReport(args: Record<string, unknown>): Promise<string> {
    const sql = (args.sql as string || '').trim();
    const reportName = args.report_name as string || 'Reporte';
    const sheetName = (args.sheet_name as string || 'Datos').slice(0, 31);
    const columns = args.columns as string[] || [];
    const columnKeys = args.column_keys as string[] || [];
    const filtersDescription = args.filters_description as string || '';

    console.log(`[beto] Excel Report: ${reportName}`);
    console.log(`[beto] Excel SQL: ${sql}`);

    // Security: Only allow SELECT
    const sqlUpper = sql.toUpperCase().replace(/\s+/g, ' ').trim();
    if (!sqlUpper.startsWith('SELECT')) {
        return JSON.stringify({ error: 'Solo se permiten consultas SELECT.' });
    }

    // Enforce LIMIT 500
    let safeSql = sql;
    if (!sqlUpper.includes('LIMIT')) {
        safeSql += ' LIMIT 500';
    }

    try {
        // Reuse query infrastructure
        const queryResult = await queryDatabase({ sql: safeSql, explanation: `Excel report: ${reportName}` });
        const parsed = JSON.parse(queryResult);

        if (!parsed.success || !parsed.data) {
            return JSON.stringify({
                error: parsed.error || 'No se pudieron obtener datos',
                report_name: reportName,
            });
        }

        const rows = parsed.data;

        // Map data to arrays using column_keys
        const mappedData = rows.map((row: Record<string, unknown>) => {
            return columnKeys.map(key => {
                const val = row[key];
                if (val === null || val === undefined) return '';
                return val;
            });
        });

        return JSON.stringify({
            success: true,
            report_name: reportName,
            sheet_name: sheetName,
            columns,
            data: mappedData,
            filters: filtersDescription,
            total_rows: rows.length,
            truncated: parsed.truncated || false,
            message: `📊 Reporte "${reportName}" listo con ${rows.length} registros.`,
        });
    } catch (err) {
        console.error('[beto] Excel report error:', err.message);
        return JSON.stringify({
            error: err.message,
            report_name: reportName,
        });
    }
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
        const { messages, user, currentModule, stream } = await req.json();
        const startTime = Date.now(); // #12 analytics

        if (!messages || !Array.isArray(messages)) {
            return new Response(
                JSON.stringify({ error: 'messages array is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!OPENAI_API_KEY) {
            return new Response(
                JSON.stringify({ error: 'OpenAI API key no configurada' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // RAG Step 1: Retrieve schema context
        const schemaContext = await getSchemaContext();

        // Build context
        const now = new Date();
        const fechaHoy = now.toISOString().split('T')[0];

        // Per-user personality
        let personalityBoost = '';
        if (user?.usuario === 'frojo') {
            personalityBoost = `
PERSONALIDAD ESPECIAL PARA ESTE USUARIO: Sos fanático de Los Simpsons. Metele referencias, frases y comparaciones de Los Simpsons en tus respuestas, de forma natural y graciosa pero sin perder la utilidad. Ejemplos:
- Cuando muestres datos buenos: "¡Excelente, Smithers!" o "Mmm... datos" (como Homer con las donas)
- Cuando algo está mal: "¡Ay caramba!" o "Todo es culpa de Milhouse"
- Si hay muchas deudas: "Esto parece la cuenta del bar de Moe"
- Usá emojis de donas 🍩 y cerveza 🍺 cuando sea apropiado
NO te excedas — una o dos referencias por respuesta, bien colocadas.`;
        }

        // Screen context
        const moduleNames: Record<string, string> = {
            inicio: 'Inicio (Dashboard)', mensajeria: 'Mensajería (WhatsApp)',
            pedidos: 'Pedidos de Prácticas', altas: 'Altas Administrativas',
            turnos: 'Cola de Turnos', deudas: 'Deudas', cirugias: 'Cirugías',
            simon: 'Simón IA', configuracion: 'Configuración',
        };
        const screenContext = currentModule
            ? `\nEl usuario está actualmente en el módulo: **${moduleNames[currentModule] || currentModule}**. Si pregunta "qué veo acá" o "qué es esto", explicale ese módulo.`
            : '';

        const contextInfo = `

Fecha y hora actual: ${fechaHoy} (${now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}).
${user ? `Usuario actual: ${user.nombre} (${user.usuario}). Tratalo por su nombre.` : ''}${screenContext}
${personalityBoost}

${schemaContext}`;

        const fullMessages = [
            { role: 'system', content: SYSTEM_PROMPT_BASE + contextInfo },
            ...messages.slice(-10) // Keep last 10 to avoid context overflow
        ];

        // First call to OpenAI
        let response = await callOpenAI(fullMessages, TOOLS);
        let assistantMessage = response.choices[0].message;

        // Handle tool calls (loop for multi-tool)
        let iterations = 0;
        let excelData = null; // Capture Excel report data from tool calls
        while (assistantMessage.tool_calls && iterations < 5) {
            const toolResults = [];

            for (const toolCall of assistantMessage.tool_calls) {
                const args = JSON.parse(toolCall.function.arguments);
                console.log(`[beto] Tool call: ${toolCall.function.name}`, JSON.stringify(args).slice(0, 200));
                const result = await executeToolCall(toolCall.function.name, args);

                // Capture Excel data directly from tool result
                if (toolCall.function.name === 'generate_excel_report') {
                    try {
                        const parsed = JSON.parse(result);
                        if (parsed.success && parsed.data) {
                            excelData = {
                                reportName: parsed.report_name,
                                sheetName: parsed.sheet_name,
                                columns: parsed.columns,
                                data: parsed.data,
                                filters: parsed.filters || '',
                                totalRows: parsed.total_rows,
                            };
                            console.log(`[beto] Excel data captured: ${parsed.total_rows} rows for ${parsed.report_name}`);
                        }
                    } catch (e) {
                        console.warn('[beto] Failed to parse excel result:', e.message);
                    }
                }

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

        // #12 — Analytics: Log interaction
        const toolsUsed = [];
        for (const msg of fullMessages) {
            if (msg.role === 'assistant' && msg.tool_calls) {
                for (const tc of msg.tool_calls) {
                    toolsUsed.push(tc.function.name);
                }
            }
        }
        const userQuery = messages[messages.length - 1]?.content || '';
        let interactionId = null;
        try {
            const { data: logData } = await supabase.from('beto_interactions').insert({
                user_name: user?.nombre || 'unknown',
                user_id: user?.usuario || 'unknown',
                user_query: userQuery.substring(0, 500),
                response_text: (assistantMessage.content || '').substring(0, 1000),
                tools_used: toolsUsed,
                response_ms: Date.now() - startTime,
                success: true,
                current_module: currentModule || 'inicio',
            }).select('id').single();
            interactionId = logData?.id || null;
        } catch (logErr) {
            console.warn('[beto] Analytics log failed:', logErr.message);
        }

        // Clean AI text: remove any raw JSON blocks the AI included for Excel
        // (since we're sending excel_data separately)
        let cleanMessage = assistantMessage.content || '';
        if (excelData) {
            // Remove ```beto-excel, ```json, or raw JSON blocks with reportName
            cleanMessage = cleanMessage
                .replace(/```(?:beto-excel|json)?\s*\n[\s\S]*?"reportName"[\s\S]*?\n\s*```/g, '')
                .replace(/\{[\s\S]*?"reportName"[\s\S]*?"data"[\s\S]*?\}/g, '')
                .trim();
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: cleanMessage,
                usage: response.usage,
                interaction_id: interactionId,
                ...(excelData ? { excel_data: excelData } : {}),
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('[beto-assistant] Error:', error.message, error.stack);
        // ALWAYS return 200 with error message so frontend doesn't crash
        return new Response(
            JSON.stringify({
                success: false,
                message: `⚠️ Disculpá, tuve un problema técnico: ${error.message}. Intentá de nuevo con una pregunta más simple.`,
                error: error.message,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
            max_tokens: 2048,
        }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`OpenAI error ${res.status}: ${errBody.slice(0, 200)}`);
    }

    return await res.json();
}
