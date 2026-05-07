// Supabase Edge Function: beto-assistant
// Asistente personal AI para ADM-QUI — Sanatorio Argentino
// Usa OpenAI GPT-4.1 con function calling para consultas y acciones sobre la DB

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ═══════════════════════════════════════
// SYSTEM PROMPT — Personalidad de Beto
// ═══════════════════════════════════════
const SYSTEM_PROMPT = `Eres **Beto**, el asistente personal inteligente del Sistema de Administración del Sanatorio Argentino (ADM-QUI).

## Tu Personalidad
- Sos cordial, profesional y directo. Usás español rioplatense natural (vos, tenés, querés).
- Tratá al usuario de "vos" y sé amigable pero eficiente.
- Cuando expliques datos financieros o médicos, sé claro y preciso.
- Si el usuario pregunta algo que no podés resolver, decilo honestamente.
- Cuando muestres datos, usalos en formato legible con emojis para mejorar la lectura.
- Si te piden explicar el sistema, usá analogías simples y, cuando sea posible, describí diagramas con texto.
- IMPORTANTE: Cuando el usuario diga "hoy", "mañana", "esta semana", etc., calculá la fecha correspondiente basándote en la fecha actual que te paso en el contexto.

## El Sistema ADM-QUI
Es el sistema integral de administración del Sanatorio Argentino. Tiene estos módulos:

1. **Pedidos de Prácticas** — Gestión de pedidos médicos con nomenclador
2. **Cirugías** — Panel de cirugías programadas con envío de WhatsApp a pacientes. Tabla: \`surgeries\`. Estados: lila (sin mensaje), amarillo (en revisión), verde (autorizado), azul (paciente confirmó), rojo (problema), precaución.
3. **Deudas** — Seguimiento de deuda de pacientes por obra social (categorías: Sin contactar, Contactado, Compromiso pago, Plan de pago, Deuda judicial, Sin deuda SALUS)
4. **Asociaciones** — Cirugías de asociaciones médicas (Cirujanos, Ginecólogos, Traumatólogos, etc.) con documentación pendiente
5. **Laboratorios** — Biopsias de anatomía patológica asignadas a laboratorios
6. **Altas** — Control de altas médicas con responsable y estado
7. **Mensajería** — Chat WhatsApp bidireccional con pacientes
8. **Métricas** — Dashboard de KPIs y analytics
9. **Turnos** — Administración de turnos
10. **SIMÓN** — Sistema de procesamiento de documentos con IA

## Tablas principales en la base de datos:
- \`surgeries\`: nombre, dni, telefono, obra_social, fecha_cirugia, medico, modulo, status (lila/amarillo/verde/azul/rojo/precaucion), excluido, ausente (null=pendiente, 0=realizada, 1=suspendida)
- \`deudas_pacientes\`: paciente, obra_social, factura_nro, monto, categoria, telefono, observaciones
- \`asociaciones_cirugias\`: fecha_realizacion, nombre_paciente, especialidad, nombre_cirugia, estado, cirujano, asociacion, docs_completos
- \`laboratorios_anatomia\`: fecha_visita, paciente, laboratorio, biopsia_simple, biopsia_ampliada
- \`admqui_usuarios\`: usuario, nombre, iniciales, activo

## Reglas de Seguridad
- NUNCA reveles contraseñas, API keys, ni información técnica sensible.
- Respetá el rol del usuario. Si alguien no tiene permisos, no ejecutes la acción.
- Para acciones de ESCRITURA (modificar, eliminar), SIEMPRE pedí confirmación antes.
- Para acciones de LECTURA (consultar datos), ejecutá directamente.

## Formato de Respuesta
- Usá Markdown para formatear tus respuestas.
- Para tablas de datos, usá formato de tabla Markdown.
- Para explicaciones del sistema, usá listas y headers claros.
- Sé conciso pero completo.`;

// ═══════════════════════════════════════
// TOOLS — Function Calling definitions
// ═══════════════════════════════════════
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'query_deudas',
            description: 'Consulta información de deudas de pacientes. Puede filtrar por obra social, categoría, paciente, o traer un resumen general.',
            parameters: {
                type: 'object',
                properties: {
                    obra_social: { type: 'string', description: 'Filtrar por obra social (ej: OSDE, Swiss Medical)' },
                    categoria: { type: 'string', description: 'Filtrar por categoría de deuda (ej: Sin contactar, Compromiso pago)' },
                    paciente: { type: 'string', description: 'Buscar por nombre de paciente (búsqueda parcial)' },
                    resumen: { type: 'boolean', description: 'Si true, devuelve un resumen agregado por obra social' },
                    limit: { type: 'number', description: 'Cantidad máxima de resultados (default 20)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'query_asociaciones',
            description: 'Consulta cirugías de asociaciones médicas. Puede filtrar por asociación, fecha, paciente, estado de documentos.',
            parameters: {
                type: 'object',
                properties: {
                    asociacion: { type: 'string', description: 'Nombre de la asociación (ej: Asociación de Cirujanos)' },
                    fecha_desde: { type: 'string', description: 'Fecha desde en formato YYYY-MM-DD' },
                    fecha_hasta: { type: 'string', description: 'Fecha hasta en formato YYYY-MM-DD' },
                    paciente: { type: 'string', description: 'Buscar por nombre de paciente' },
                    docs_pendientes: { type: 'boolean', description: 'Si true, solo muestra cirugías con documentos pendientes' },
                    limit: { type: 'number', description: 'Cantidad máxima de resultados (default 20)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'query_laboratorios',
            description: 'Consulta biopsias de anatomía patológica asignadas a laboratorios.',
            parameters: {
                type: 'object',
                properties: {
                    laboratorio: { type: 'string', description: 'Nombre del laboratorio' },
                    paciente: { type: 'string', description: 'Buscar por nombre de paciente' },
                    fecha_desde: { type: 'string', description: 'Fecha desde en formato YYYY-MM-DD' },
                    limit: { type: 'number', description: 'Cantidad máxima de resultados (default 20)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'query_cirugias',
            description: 'Consulta cirugías programadas del Sanatorio Argentino. Tabla: surgeries. IMPORTANTE: si el usuario pregunta por las cirugías de "hoy", usá la fecha actual como fecha_desde y fecha_hasta.',
            parameters: {
                type: 'object',
                properties: {
                    paciente: { type: 'string', description: 'Buscar por nombre de paciente' },
                    medico: { type: 'string', description: 'Buscar por médico/cirujano' },
                    status: { type: 'string', description: 'Estado: lila, amarillo, verde, azul, rojo, precaucion' },
                    obra_social: { type: 'string', description: 'Filtrar por obra social' },
                    fecha_desde: { type: 'string', description: 'Fecha desde en formato YYYY-MM-DD. Para "hoy" usá la fecha actual.' },
                    fecha_hasta: { type: 'string', description: 'Fecha hasta en formato YYYY-MM-DD. Para "hoy" usá la misma fecha que fecha_desde.' },
                    incluir_excluidos: { type: 'boolean', description: 'Si true, incluye cirugías de módulos excluidos (default false)' },
                    limit: { type: 'number', description: 'Cantidad máxima de resultados (default 50)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_system_metrics',
            description: 'Obtiene métricas y estadísticas generales del sistema: totales de deudas, cirugías pendientes, documentación incompleta, etc.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'explain_system',
            description: 'Explica cómo funciona una parte del sistema ADM-QUI al usuario. Módulos disponibles del menú lateral: inicio, mensajeria, pedidos, altas, turnos, deudas, cirugias, simon, configuracion, asociaciones, laboratorios, metricas.',
            parameters: {
                type: 'object',
                properties: {
                    modulo: { type: 'string', description: 'El módulo a explicar: inicio, mensajeria, pedidos, altas, turnos, deudas, cirugias, simon, configuracion, asociaciones, laboratorios, metricas' }
                },
                required: ['modulo']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generate_report',
            description: 'Genera un reporte completo sobre un área del sistema. Consolida datos de múltiples fuentes y presenta un informe detallado. Útil cuando el usuario pide un "reporte", "informe", "resumen ejecutivo" o "análisis".',
            parameters: {
                type: 'object',
                properties: {
                    tipo: { type: 'string', description: 'Tipo de reporte: deudas_general, cirugias_dia, cirugias_semana, asociaciones_pendientes, laboratorios_pendientes, resumen_ejecutivo, actividad_mensajeria' },
                    fecha_desde: { type: 'string', description: 'Fecha desde en formato YYYY-MM-DD' },
                    fecha_hasta: { type: 'string', description: 'Fecha hasta en formato YYYY-MM-DD' }
                },
                required: ['tipo']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'query_altas',
            description: 'Consulta altas médicas administrativas del sanatorio. Tabla: altas_medicas.',
            parameters: {
                type: 'object',
                properties: {
                    paciente: { type: 'string', description: 'Buscar por nombre de paciente' },
                    responsable: { type: 'string', description: 'Buscar por responsable asignado' },
                    estado: { type: 'string', description: 'Estado del alta' },
                    fecha_desde: { type: 'string', description: 'Fecha desde en formato YYYY-MM-DD' },
                    limit: { type: 'number', description: 'Cantidad máxima de resultados (default 20)' }
                }
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
            case 'query_deudas': return await queryDeudas(args);
            case 'query_asociaciones': return await queryAsociaciones(args);
            case 'query_laboratorios': return await queryLaboratorios(args);
            case 'query_cirugias': return await queryCirugias(args);
            case 'get_system_metrics': return await getSystemMetrics();
            case 'explain_system': return explainSystem(args.modulo as string);
            case 'generate_report': return await generateReport(args);
            case 'query_altas': return await queryAltas(args);
            default: return JSON.stringify({ error: `Tool ${name} no encontrado` });
        }
    } catch (err) {
        return JSON.stringify({ error: err.message });
    }
}

async function queryDeudas(args: Record<string, unknown>): Promise<string> {
    const limit = (args.limit as number) || 20;

    if (args.resumen) {
        const { data, error } = await supabase
            .from('deudas_pacientes')
            .select('obra_social, monto, categoria');
        if (error) throw error;

        const resumen: Record<string, { total: number; count: number; categorias: Record<string, number> }> = {};
        for (const row of (data || [])) {
            const os = row.obra_social || 'Sin OS';
            if (!resumen[os]) resumen[os] = { total: 0, count: 0, categorias: {} };
            resumen[os].total += parseFloat(row.monto) || 0;
            resumen[os].count++;
            const cat = row.categoria || 'Sin categorizar';
            resumen[os].categorias[cat] = (resumen[os].categorias[cat] || 0) + 1;
        }
        return JSON.stringify({ tipo: 'resumen', data: resumen, total_registros: data?.length || 0 });
    }

    let query = supabase.from('deudas_pacientes').select('*').limit(limit);
    if (args.obra_social) query = query.ilike('obra_social', `%${args.obra_social}%`);
    if (args.categoria) query = query.ilike('categoria', `%${args.categoria}%`);
    if (args.paciente) query = query.ilike('paciente', `%${args.paciente}%`);

    const { data, error } = await query.order('monto', { ascending: false });
    if (error) throw error;
    return JSON.stringify({ tipo: 'listado', data: data || [], count: data?.length || 0 });
}

async function queryAsociaciones(args: Record<string, unknown>): Promise<string> {
    const limit = (args.limit as number) || 20;
    let query = supabase.from('asociaciones_cirugias').select('*').limit(limit);

    if (args.asociacion) query = query.ilike('asociacion', `%${args.asociacion}%`);
    if (args.paciente) query = query.ilike('nombre_paciente', `%${args.paciente}%`);
    if (args.fecha_desde) query = query.gte('fecha_realizacion', args.fecha_desde);
    if (args.fecha_hasta) query = query.lte('fecha_realizacion', args.fecha_hasta);
    if (args.docs_pendientes) query = query.or('docs_completos.is.null,docs_completos.eq.false');

    const { data, error } = await query.order('fecha_realizacion', { ascending: false });
    if (error) throw error;
    return JSON.stringify({ tipo: 'listado', data: data || [], count: data?.length || 0 });
}

async function queryLaboratorios(args: Record<string, unknown>): Promise<string> {
    const limit = (args.limit as number) || 20;
    let query = supabase.from('laboratorios_anatomia').select('*').limit(limit);

    if (args.laboratorio) query = query.ilike('laboratorio', `%${args.laboratorio}%`);
    if (args.paciente) query = query.ilike('paciente', `%${args.paciente}%`);
    if (args.fecha_desde) query = query.gte('fecha_visita', args.fecha_desde);

    const { data, error } = await query.order('fecha_visita', { ascending: false });
    if (error) throw error;
    return JSON.stringify({ tipo: 'listado', data: data || [], count: data?.length || 0 });
}

async function queryCirugias(args: Record<string, unknown>): Promise<string> {
    const limit = (args.limit as number) || 50;
    let query = supabase.from('surgeries').select('id, nombre, dni, telefono, obra_social, fecha_cirugia, medico, modulo, status, ausente, excluido, notas').limit(limit);

    // Por defecto excluir las excluidas
    if (!args.incluir_excluidos) query = query.eq('excluido', false);

    if (args.paciente) query = query.ilike('nombre', `%${args.paciente}%`);
    if (args.medico) query = query.ilike('medico', `%${args.medico}%`);
    if (args.status) query = query.eq('status', args.status);
    if (args.obra_social) query = query.ilike('obra_social', `%${args.obra_social}%`);
    if (args.fecha_desde) query = query.gte('fecha_cirugia', args.fecha_desde);
    if (args.fecha_hasta) query = query.lte('fecha_cirugia', args.fecha_hasta);

    const { data, error } = await query.order('fecha_cirugia', { ascending: true }).order('nombre', { ascending: true });
    if (error) throw error;

    // Resumir para que no sea demasiado largo
    const resumen = {
        tipo: 'listado',
        total: data?.length || 0,
        por_status: {} as Record<string, number>,
        por_medico: {} as Record<string, number>,
        cirugias: (data || []).map(s => ({
            nombre: s.nombre,
            fecha: s.fecha_cirugia,
            medico: s.medico,
            obra_social: s.obra_social,
            status: s.status,
            modulo: s.modulo,
            ausente: s.ausente,
        })),
    };

    for (const s of (data || [])) {
        const st = s.status || 'sin_status';
        resumen.por_status[st] = (resumen.por_status[st] || 0) + 1;
        const med = s.medico || 'Sin médico';
        resumen.por_medico[med] = (resumen.por_medico[med] || 0) + 1;
    }

    return JSON.stringify(resumen);
}

async function getSystemMetrics(): Promise<string> {
    const metrics: Record<string, unknown> = {};

    // Deudas
    const { count: totalDeudas } = await supabase.from('deudas_pacientes').select('*', { count: 'exact', head: true });
    const { data: deudaSums } = await supabase.from('deudas_pacientes').select('monto');
    const totalMonto = (deudaSums || []).reduce((sum, r) => sum + (parseFloat(r.monto) || 0), 0);
    metrics.deudas = { total_pacientes: totalDeudas, monto_total: totalMonto };

    // Cirugías - hoy
    const hoy = new Date().toISOString().split('T')[0];
    const { count: cirugiasHoy } = await supabase.from('surgeries').select('*', { count: 'exact', head: true })
        .eq('excluido', false).eq('fecha_cirugia', hoy);
    const { count: cirugiasPendientes } = await supabase.from('surgeries').select('*', { count: 'exact', head: true })
        .eq('excluido', false).gte('fecha_cirugia', hoy).or('ausente.is.null,and(ausente.neq.0,ausente.neq.1)');
    metrics.cirugias = { hoy: cirugiasHoy, pendientes_total: cirugiasPendientes };

    // Asociaciones
    const { count: totalAsoc } = await supabase.from('asociaciones_cirugias').select('*', { count: 'exact', head: true });
    const { count: docsPendientes } = await supabase.from('asociaciones_cirugias')
        .select('*', { count: 'exact', head: true })
        .or('docs_completos.is.null,docs_completos.eq.false');
    metrics.asociaciones = { total: totalAsoc, docs_pendientes: docsPendientes };

    // Laboratorios
    const { count: totalLabs } = await supabase.from('laboratorios_anatomia').select('*', { count: 'exact', head: true });
    metrics.laboratorios = { total: totalLabs };

    metrics.fecha_actual = hoy;

    return JSON.stringify(metrics);
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
- 📝 Templates predefinidos con variables dinámicas (\{paciente\}, \{fecha_cirugia\}, etc.)
- 🖼️ Soporte multimedia (imágenes, documentos, audios)
- 🔔 Notificaciones de mensajes nuevos (badge rojo con contador)
- 📞 Múltiples líneas WhatsApp configurables
- 👤 Identificación del operador que envía cada mensaje

**Flujo:**
1. El paciente envía un WhatsApp al sanatorio
2. Llega al sistema en tiempo real
3. El operador ve el mensaje y responde desde acá
4. Se puede usar templates para respuestas rápidas`,

        pedidos: `## 📋 Pedidos de Prácticas
Gestión de pedidos médicos con nomenclador integrado.

**Funcionalidades:**
- 🔍 Búsqueda en nomenclador de prácticas (miles de códigos)
- 🛒 Carrito de prácticas (similar a un e-commerce: agregás, quitás, modificás)
- 🖨️ Impresión de pedidos en formato profesional
- 📲 Envío por WhatsApp al paciente
- 📂 Historial de pedidos anteriores
- 👤 Carga de datos del paciente (nombre, DNI, obra social, teléfono)

**Soporta:** Prácticas ambulatorias e internación.`,

        altas: `## 📤 Altas Administrativas (Altas Adm)
Control y seguimiento de altas médicas hospitalarias.

**Funcionalidades:**
- 📅 Registro de fecha de ingreso y fecha de alta
- 👨‍⚕️ Asignación de responsable del alta
- 📊 Estado del alta (pendiente, en proceso, completada)
- 📝 Notas internas y observaciones
- 🔍 Filtros por fecha, responsable y estado
- 📋 Seguimiento de diagnósticos

**Objetivo:** Asegurar que todas las altas tengan la documentación completa antes de darle el alta definitiva al paciente.`,

        turnos: `## 🕐 Cola de Turnos
Administración y gestión de la cola de turnos del sanatorio.

**Funcionalidades:**
- 📋 Vista de turnos programados del día
- ⏰ Gestión de espera y llamado de pacientes
- 📊 Estadísticas de tiempos de espera
- 🔄 Actualización en tiempo real del estado de cada turno`,

        deudas: `## 💰 Módulo de Deudas
Seguimiento completo de la deuda de pacientes por obra social.

**Categorías de seguimiento:**
1. 🔴 **Sin contactar** — Paciente con deuda sin ningún intento de contacto
2. 📞 **Contactado** — Se intentó contactar al paciente
3. 🤝 **Compromiso de pago** — El paciente se comprometió a pagar
4. 📆 **Plan de pago** — Se acordó un plan de cuotas
5. ⚖️ **Deuda judicial** — Derivado a gestión legal
6. ✅ **Sin deuda SALUS** — Regularizado en el sistema hospitalario

**Flujo:**
1. Los datos se importan desde SALUS automáticamente vía sync
2. Se categorizan según el estado de gestión
3. Se puede enviar WhatsApp al paciente para recordarle el pago
4. Se exporta a Excel para reportes gerenciales

**Métricas clave:** Deuda Bruta, Cobros, Notas de Crédito, Balance Neto.`,

        cirugias: `## 🔪 Módulo de Cirugías
Panel principal de cirugías programadas con bot automático de WhatsApp.

**Sistema de estados (colores):**
- 🟣 **Lila** — Cirugía cargada, sin mensaje enviado
- 🟡 **Amarillo** — Documentación en revisión
- 🟢 **Verde** — Autorizada, esperando confirmación del paciente
- 🔵 **Azul** — Paciente confirmó asistencia, indicaciones enviadas
- 🔴 **Rojo** — Problema (doc faltante, paciente no responde, tel inválido)
- ⚠️ **Precaución** — Requiere atención especial

**Funcionalidades:**
- 📋 Carga masiva desde Excel de SALUS
- 📲 Bot automático de WhatsApp (notificación → solicitud docs → autorización → indicaciones)
- 🔍 Filtros por fecha, cirujano, estado, obra social
- 💰 Presupuestos de cirugías
- 📊 Estadísticas por estado

**Flujo automatizado:** Lila → Amarillo (se envía WA) → Verde (admin autoriza) → Azul (paciente confirma)`,

        simon: `## 🤖 SIMÓN IA — Sistema Inteligente de Monitoreo
Pipeline de procesamiento de documentos con inteligencia artificial.

**Funcionalidades:**
- 📄 Carga y clasificación automática de documentos
- 🧠 Extracción de datos con IA (nombres, fechas, diagnósticos)
- ✅ Validación automática de documentación
- 📊 Dashboard de documentos procesados

**Casos de uso:**
- Procesamiento de documentación preoperatoria
- Clasificación de estudios médicos
- Extracción de datos de formularios escaneados`,

        configuracion: `## ⚙️ Configuración
Panel de administración del sistema.

**Opciones:**
- 👤 Gestión de usuarios (crear, activar/desactivar)
- 🔑 Cambio de contraseñas
- 📞 Configuración de líneas WhatsApp
- 📝 Templates de mensajes
- 🔧 Parámetros generales del sistema
- 📊 Logs de actividad y auditoría`,

        asociaciones: `## 🏥 Módulo de Asociaciones
Gestiona las cirugías que pertenecen a asociaciones médicas profesionales.

**Asociaciones registradas:**
- Asociación de Cirujanos
- Asociación de Ginecólogos
- Asociación de Traumatólogos
- Asociación de Cirujanos Pediatras
- ORL (Particular)

**Flujo:**
1. Las cirugías se sincronizan desde SALUS automáticamente
2. Se organizan en "carritos" mensuales por asociación
3. Se marca si la documentación está completa (✅) o pendiente (❌)
4. Cuando está todo completo, se genera la constancia de entrega
5. Se puede exportar a Excel

**Filtros:** Por asociación, fecha, paciente, obra social, estado.`,

        laboratorios: `## 🔬 Módulo de Laboratorios
Gestiona las biopsias de anatomía patológica asignadas a laboratorios externos.

**Laboratorios:**
- LDA - Dra. Aguero o Dra Rios
- LAB. CEDAP
- LAB.INST.PATOLOG.CUYO

**Tipos de biopsia:**
- Biopsia por congelación
- Biopsia simple
- Biopsia ampliada

Cada laboratorio tiene su portal propio con acceso web donde puede ver sus biopsias asignadas.`,

        metricas: `## 📊 Módulo de Métricas
Dashboard de KPIs y analytics del sistema.

**Indicadores:**
- Cirugías realizadas vs programadas
- Deuda cobrada vs pendiente
- Documentación completada en asociaciones
- Tiempos de respuesta en mensajería
- Actividad por usuario/operador

Permite ver tendencias y tomar decisiones basadas en datos.`,
    };

    return explicaciones[modulo] || `No tengo información detallada sobre el módulo "${modulo}". Los módulos del menú son: ${Object.keys(explicaciones).join(', ')}.`;
}

// ═══════════════════════════════════════
// REPORT GENERATION
// ═══════════════════════════════════════

async function generateReport(args: Record<string, unknown>): Promise<string> {
    const tipo = args.tipo as string;
    const hoy = new Date().toISOString().split('T')[0];
    const fechaDesde = (args.fecha_desde as string) || hoy;
    const fechaHasta = (args.fecha_hasta as string) || hoy;

    switch (tipo) {
        case 'cirugias_dia': {
            const { data } = await supabase.from('surgeries')
                .select('nombre, fecha_cirugia, medico, obra_social, modulo, status, ausente, telefono')
                .eq('excluido', false).eq('fecha_cirugia', fechaDesde)
                .order('nombre');
            const porStatus: Record<string, number> = {};
            const porMedico: Record<string, number> = {};
            for (const s of (data || [])) {
                porStatus[s.status || 'sin_status'] = (porStatus[s.status || 'sin_status'] || 0) + 1;
                porMedico[s.medico || 'Sin médico'] = (porMedico[s.medico || 'Sin médico'] || 0) + 1;
            }
            return JSON.stringify({
                reporte: 'Cirugías del Día', fecha: fechaDesde, total: data?.length || 0,
                por_status: porStatus, por_medico: porMedico,
                detalle: (data || []).map(s => ({ paciente: s.nombre, medico: s.medico, os: s.obra_social, modulo: s.modulo, status: s.status })),
            });
        }

        case 'cirugias_semana': {
            const desde = fechaDesde;
            const d = new Date(fechaDesde); d.setDate(d.getDate() + 7);
            const hasta = d.toISOString().split('T')[0];
            const { data } = await supabase.from('surgeries')
                .select('nombre, fecha_cirugia, medico, obra_social, status, ausente')
                .eq('excluido', false).gte('fecha_cirugia', desde).lte('fecha_cirugia', hasta)
                .order('fecha_cirugia').order('nombre');
            const porDia: Record<string, number> = {};
            for (const s of (data || [])) { porDia[s.fecha_cirugia] = (porDia[s.fecha_cirugia] || 0) + 1; }
            return JSON.stringify({
                reporte: 'Cirugías de la Semana', desde, hasta, total: data?.length || 0,
                por_dia: porDia,
                detalle: (data || []).map(s => ({ paciente: s.nombre, fecha: s.fecha_cirugia, medico: s.medico, os: s.obra_social, status: s.status })),
            });
        }

        case 'deudas_general': {
            const { data } = await supabase.from('deudas_pacientes').select('paciente, obra_social, monto, categoria, factura_nro');
            const porCategoria: Record<string, { count: number; monto: number }> = {};
            const porOS: Record<string, { count: number; monto: number }> = {};
            let totalMonto = 0;
            for (const d of (data || [])) {
                const m = parseFloat(d.monto) || 0; totalMonto += m;
                const cat = d.categoria || 'Sin categorizar';
                if (!porCategoria[cat]) porCategoria[cat] = { count: 0, monto: 0 };
                porCategoria[cat].count++; porCategoria[cat].monto += m;
                const os = d.obra_social || 'Sin OS';
                if (!porOS[os]) porOS[os] = { count: 0, monto: 0 };
                porOS[os].count++; porOS[os].monto += m;
            }
            return JSON.stringify({
                reporte: 'Reporte General de Deudas', total_pacientes: data?.length || 0,
                monto_total: totalMonto, por_categoria: porCategoria, por_obra_social: porOS,
            });
        }

        case 'asociaciones_pendientes': {
            const { data } = await supabase.from('asociaciones_cirugias')
                .select('nombre_paciente, asociacion, nombre_cirugia, fecha_realizacion, docs_completos')
                .or('docs_completos.is.null,docs_completos.eq.false')
                .order('fecha_realizacion', { ascending: false }).limit(50);
            const porAsoc: Record<string, number> = {};
            for (const a of (data || [])) { porAsoc[a.asociacion || 'Sin asoc'] = (porAsoc[a.asociacion || 'Sin asoc'] || 0) + 1; }
            return JSON.stringify({
                reporte: 'Asociaciones con Documentación Pendiente', total: data?.length || 0,
                por_asociacion: porAsoc,
                detalle: (data || []).map(a => ({ paciente: a.nombre_paciente, cirugia: a.nombre_cirugia, asociacion: a.asociacion, fecha: a.fecha_realizacion })),
            });
        }

        case 'resumen_ejecutivo': {
            // Consolidar todo
            const { count: totalDeudas } = await supabase.from('deudas_pacientes').select('*', { count: 'exact', head: true });
            const { data: deudaSums } = await supabase.from('deudas_pacientes').select('monto');
            const totalMonto = (deudaSums || []).reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);

            const { count: cirugiasHoy } = await supabase.from('surgeries').select('*', { count: 'exact', head: true })
                .eq('excluido', false).eq('fecha_cirugia', hoy);
            const { count: cirugiasPend } = await supabase.from('surgeries').select('*', { count: 'exact', head: true })
                .eq('excluido', false).gte('fecha_cirugia', hoy).or('ausente.is.null,and(ausente.neq.0,ausente.neq.1)');

            const { count: docsPend } = await supabase.from('asociaciones_cirugias')
                .select('*', { count: 'exact', head: true })
                .or('docs_completos.is.null,docs_completos.eq.false');

            const { count: totalLabs } = await supabase.from('laboratorios_anatomia').select('*', { count: 'exact', head: true });

            return JSON.stringify({
                reporte: 'Resumen Ejecutivo', fecha: hoy,
                deudas: { total_pacientes: totalDeudas, monto_total: totalMonto },
                cirugias: { hoy: cirugiasHoy, pendientes: cirugiasPend },
                asociaciones: { docs_pendientes: docsPend },
                laboratorios: { total_registros: totalLabs },
            });
        }

        default:
            return JSON.stringify({ error: `Tipo de reporte "${tipo}" no reconocido. Tipos disponibles: deudas_general, cirugias_dia, cirugias_semana, asociaciones_pendientes, resumen_ejecutivo` });
    }
}

// ═══════════════════════════════════════
// ALTAS QUERY
// ═══════════════════════════════════════

async function queryAltas(args: Record<string, unknown>): Promise<string> {
    const limit = (args.limit as number) || 20;
    let query = supabase.from('altas_medicas').select('*').limit(limit);

    if (args.paciente) query = query.ilike('paciente', `%${args.paciente}%`);
    if (args.responsable) query = query.ilike('responsable', `%${args.responsable}%`);
    if (args.estado) query = query.ilike('estado', `%${args.estado}%`);
    if (args.fecha_desde) query = query.gte('fecha_alta', args.fecha_desde);

    const { data, error } = await query.order('fecha_alta', { ascending: false });
    if (error) throw error;
    return JSON.stringify({ tipo: 'listado', data: data || [], count: data?.length || 0 });
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

        // Build messages with system prompt
        const now = new Date();
        const fechaHoy = now.toISOString().split('T')[0];
        const contextInfo = `\n\nFecha y hora actual: ${fechaHoy} (${now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}).` +
            (user ? `\nUsuario actual: ${user.nombre} (${user.usuario}). Tratalo por su nombre.` : '');

        const fullMessages = [
            { role: 'system', content: SYSTEM_PROMPT + contextInfo },
            ...messages.slice(-20) // Keep last 20 messages for context
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
                console.log(`[beto] Tool call: ${toolCall.function.name}`, args);
                const result = await executeToolCall(toolCall.function.name, args);

                toolResults.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: result,
                });
            }

            // Continue conversation with tool results
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
            temperature: 0.4,
            max_tokens: 2048,
        }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${errBody}`);
    }

    return await res.json();
}
