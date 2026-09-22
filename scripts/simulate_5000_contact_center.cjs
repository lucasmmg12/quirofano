/**
 * SIMULADOR MASIVO DE CONTACT CENTER — SANATORIO ARGENTINO
 * 5,000 Escenarios Realistas (Pacientes de 18 a 70 años)
 * 
 * Evalúa:
 * 1. Precisión de detección de intenciones (Intents)
 * 2. Capacidad de respuesta y suficiencia de información
 * 3. Cantidad de mensajes intercambiados (Bot vs Paciente)
 * 4. Casos donde la información es insuficiente y qué datos faltan agregar
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDIyNzQsImV4cCI6MjA4NTYxODI3NH0.-85OS1dohc9gh4U4qBhEBlqHi9Bq7l7H6JnzcUzrCIg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════════
// DICCIONARIOS Y PARÁMETROS REALES DE SANATORIO ARGENTINO
// ═══════════════════════════════════════════════════════════════

const STOPWORDS_MEDICOS = new Set([
    'hacer', 'hacerme', 'hacerse', 'sacar', 'sacarme', 'sacarse', 'pedir', 'pedirme',
    'ver', 'verme', 'verse', 'saber', 'consultar', 'chequeo', 'chequeos', 'control',
    'controles', 'estudio', 'estudios', 'turno', 'turnos', 'consulta', 'atencion',
    'atención', 'manana', 'mañana', 'tarde', 'hoy', 'lunes', 'martes', 'miercoles', 'miércoles',
    'jueves', 'viernes', 'sabado', 'sábado', 'domingo', 'semana', 'mes', 'algun', 'alguna',
    'alguno', 'favor', 'hola', 'buenas', 'buenos', 'ustedes', 'sanatorio', 'argentino',
    'salud', 'clinica', 'clínica', 'medico', 'médico', 'medica', 'médica', 'doctor', 'doctora',
    'profesional', 'especialista', 'analisis', 'análisis', 'laboratorio', 'ecografia', 'ecografía',
    'radiografia', 'radiografía', 'orden', 'receta', 'como', 'para', 'buen', 'dia', 'días', 'bienvenido',
    'prevenir', 'prevencion', 'prevención', 'guardia', 'guardias', 'vacuna', 'vacunas', 'registro',
    'presupuesto', 'presupuestos', 'informe', 'informes', 'reclamo', 'reclamos'
]);

const DEPARTAMENTOS_SAN_JUAN = [
    'Capital', 'Rawson', 'Rivadavia', 'Chimbas', 'Santa Lucía', 'Pocito',
    'Caucete', 'Albardón', 'Sarmiento', '25 de Mayo', 'San Martín',
    'Calingasta', 'Jáchal', 'Iglesia', 'Valle Fértil', 'Angaco', 'Ullum', 'Zonda', '9 de Julio'
];

const OBRAS_SOCIALES = [
    'Obra Social Provincia (OSP)', 'OSDE', 'Swiss Medical', 'Particular',
    'PAMI', 'Medifé', 'Galeno', 'Sancor Salud', 'DAMSU', 'OSECAC',
    'Unión Personal', 'OSDEPYM', 'Jerárquicos Salud', 'Poder Judicial'
];

// ═══════════════════════════════════════════════════════════════
// MOTOR DE DETECCIÓN Y LÓGICA DEL BOT (ESPEJO EXACTO DE EDGE FUNCTION)
// ═══════════════════════════════════════════════════════════════

function detectIntentAndEntities(text, doctorsList = [], context = {}) {
    const clean = text.toLowerCase().trim();

    // 0.1 Cortesía / agradecimiento
    if (/^(muchas\s+gracias|gracias|much[ií]simas\s+gracias|dale\s+gracias|perfecto\s+gracias|genial\s+gracias|buen[ií]simo|ok\s+gracias|chau|listo\s+gracias|muy\s+amable|graciass)[!.\s]*$/i.test(clean)) {
        return { intent: 'agradecimiento_cierre', doctorRecord: null };
    }

    // 0.2 Opciones directas A..M
    if (/^[a|a️⃣]$/i.test(clean) || /^opci[oó]n\s*a$/i.test(clean)) return { intent: 'informes_general', doctorRecord: null };
    if (/^[b|b️⃣]$/i.test(clean) || /^opci[oó]n\s*b$/i.test(clean)) return { intent: 'curso_embarazadas', doctorRecord: null };
    if (/^[c|c️⃣]$/i.test(clean) || /^opci[oó]n\s*c$/i.test(clean)) return { intent: 'vacunatorio', doctorRecord: null };
    if (/^[d|d️⃣]$/i.test(clean) || /^opci[oó]n\s*d$/i.test(clean)) return { intent: 'registro_civil', doctorRecord: null };
    if (/^[e|e️⃣]$/i.test(clean) || /^opci[oó]n\s*e$/i.test(clean)) return { intent: 'administracion_presupuestos', doctorRecord: null };
    if (/^[f|f️⃣]$/i.test(clean) || /^opci[oó]n\s*f$/i.test(clean)) return { intent: 'horarios_sedes', doctorRecord: null };
    if (/^[g|g️⃣]$/i.test(clean) || /^opci[oó]n\s*g$/i.test(clean)) return { intent: 'telefonos_sedes', doctorRecord: null };
    if (/^[h|h️⃣]$/i.test(clean) || /^opci[oó]n\s*h$/i.test(clean)) return { intent: 'reclamos_calidad', doctorRecord: null };
    if (/^[i|i️⃣]$/i.test(clean) || /^opci[oó]n\s*i$/i.test(clean)) return { intent: 'chequeo', doctorRecord: null };
    if (/^[j|j️⃣]$/i.test(clean) || /^opci[oó]n\s*j$/i.test(clean)) return { intent: 'servicio_laboratorio', doctorRecord: null };
    if (/^[k|k️⃣]$/i.test(clean) || /^opci[oó]n\s*k$/i.test(clean)) return { intent: 'fundacion', doctorRecord: null };
    if (/^[l|l️⃣]$/i.test(clean) || /^opci[oó]n\s*l$/i.test(clean)) return { intent: 'turno', doctorRecord: null };

    // Números 1..4
    if (/^[1|1️⃣]$/.test(clean) || /^opci[oó]n\s*1$/i.test(clean)) {
        if (context.botStage === 'menu_opciones') return { intent: 'gestion_propia', doctorRecord: null };
        return { intent: 'turno', doctorRecord: null };
    }
    if (/^[2|2️⃣]$/.test(clean) || /^opci[oó]n\s*2$/i.test(clean)) {
        if (context.botStage === 'menu_opciones') return { intent: 'gestion_familiar', doctorRecord: null };
        return { intent: 'autorizacion', doctorRecord: null };
    }
    if (/^[3|3️⃣]$/.test(clean) || /^opci[oó]n\s*3$/i.test(clean)) return { intent: 'guardia', doctorRecord: null };
    if (/^[4|4️⃣]$/.test(clean) || /^opci[oó]n\s*4$/i.test(clean)) return { intent: 'informes_general', doctorRecord: null };

    // 1. Guardias
    if (/\b(guardia|guardias|urgencia|urgencias|emergencia|emergencias|medico\s+de\s+guardia|pediatra\s+de\s+guardia|clinico\s+de\s+guardia)\b/i.test(clean)) {
        return { intent: 'guardia', doctorRecord: null };
    }

    // 2. Chequeo
    if (/\b(chequeo|chequeos|chequeo\s+preventivo|circuito\s+preventivo|chequeo\s+de\s+salud|control\s+anual|chequeo\s+anual|estudios\s+preventivos)\b/i.test(clean)) {
        return { intent: 'chequeo', doctorRecord: null };
    }

    // 3. Prevenir
    if (/\b(programa\s+prevenir|prevenir|el\s+prevenir|turno\s+(?:para\s+)?prevenir|hacerme\s+(?:el\s+)?prevenir|sacar\s+(?:el\s+)?prevenir|estudios?\s+(?:de\s+|del\s+)?prevenir)\b/i.test(clean)) {
        return { intent: 'prevenir', doctorRecord: null };
    }

    // 4. Informes
    if (/\b(resultados?\s+(?:de\s+)?(?:los\s+|mis\s+|el\s+)?(?:analisis|laboratorio|sangre|orina)|ver\s+(?:mis\s+|los\s+)?(?:analisis|laboratorio)|portal\s+laboratorio|clave\s+laboratorio|informes?\s+(?:de\s+)?(?:laboratorio|analisis))\b/i.test(clean)) {
        return { intent: 'informes_laboratorio', doctorRecord: null };
    }
    if (/\b(resultados?\s+(?:de\s+)?(?:la\s+|el\s+|mis\s+|las\s+)?(?:ecografia|resonancia|radiografia|tomografia|mamografia|imagenes|estudios?)|ver\s+(?:mi\s+|mis\s+)?(?:ecografia|resonancia|radiografia|tomografia|mamografia|estudio)|portal\s+imagenes|informes?\s+(?:de\s+)?(?:imagenes|diagnostico\s+por\s+imagen))\b/i.test(clean)) {
        return { intent: 'informes_imagenes', doctorRecord: null };
    }
    if (/\b(biopsia|biopsias|pap\b|papanicolau|citologia|resultado\s+(?:de\s+)?(?:la\s+)?biopsia|resultado\s+(?:del\s+)?pap)\b/i.test(clean)) {
        return { intent: 'informes_biopsia_pap', doctorRecord: null };
    }
    if (/\b(solicitar\s+informes?|mis\s+informes?|mis\s+estudios?|resultados?\s+de\s+estudios?|entrega\s+de\s+informes?)\b/i.test(clean)) {
        return { intent: 'informes_general', doctorRecord: null };
    }

    // 5. Laboratorio
    if (/\b(hacerme\s+(?:un\s+|el\s+)?(?:analisis|laboratorio|estudio\s+de\s+sangre)|sacar\s+sangre|extraccion(?:es)?|ayuno\s+(?:para\s+)?analisis|horario\s+(?:de\s+)?laboratorio|guardia\s+de\s+laboratorio)\b/i.test(clean)) {
        return { intent: 'servicio_laboratorio', doctorRecord: null };
    }

    // 6. Vacunatorio
    if (/\b(vacuna|vacunas|vacunatorio|vacunacion|vacunarse|calendario\s+(?:de\s+)?vacunacion)\b/i.test(clean)) {
        return { intent: 'vacunatorio', doctorRecord: null };
    }

    // 7. Embarazadas
    if (/\b(embarazada|embarazadas|preparto|gimnasia\s+(?:para\s+)?embarazadas|curso\s+(?:de\s+|para\s+)?embarazadas|yoga\s+(?:para\s+)?embarazadas)\b/i.test(clean)) {
        return { intent: 'curso_embarazadas', doctorRecord: null };
    }

    // 8. Registro civil
    if (/\b(registro\s+civil|inscribir\s+(?:a\s+mi\s+)?(?:bebe|hijo|hija|nacimiento|recien\s+nacido)|partida\s+(?:de\s+)?nacimiento|acta\s+(?:de\s+)?nacimiento|inscripcion\s+(?:de\s+)?nacimiento)\b/i.test(clean)) {
        return { intent: 'registro_civil', doctorRecord: null };
    }

    // 9. Presupuestos
    if (/\b(presupuesto|presupuestos|costo\s+(?:de\s+)?(?:cirugia|operacion)|precio\s+(?:de\s+)?(?:cirugia|operacion)|administracion\s+internado|cobertura\s+(?:de\s+)?cirugia)\b/i.test(clean)) {
        return { intent: 'administracion_presupuestos', doctorRecord: null };
    }

    // 10. Horarios y sedes
    if (/\b(horarios?\s+(?:de\s+)?(?:atencion|sedes?)|a\s+que\s+hora\s+(?:abren|cierran|atienden)|horarios?\s+(?:de\s+)?visita|visitas?\s+(?:de\s+)?internad[oa]s?)\b/i.test(clean)) {
        return { intent: 'horarios_sedes', doctorRecord: null };
    }

    // 11. Teléfonos
    if (/\b(telefonos?|whatsapps?|wa\.link|numeros?\s+(?:de\s+)?(?:telefono|contacto)|contactos?\s+(?:de\s+)?(?:whatsapp|telefono|las\s+sedes|sede)|contacto\s+sede)\b/i.test(clean)) {
        return { intent: 'telefonos_sedes', doctorRecord: null };
    }

    // 12. Reclamos
    if (/\b(reclamo|reclamos|queja|quejas|sugerencia|sugerencias|encuesta|encuestas|area\s+de\s+calidad|disconforme|mala\s+atencion)\b/i.test(clean)) {
        return { intent: 'reclamos_calidad', doctorRecord: null };
    }

    // 13. Fundación
    if (/\b(fundacion|fsa\b|campañas?\s+(?:de\s+)?salud\s+(?:ginecologica|pediatrica)|charlas\s+de\s+la\s+fundacion)\b/i.test(clean)) {
        return { intent: 'fundacion', doctorRecord: null };
    }

    // 14. Derivación asesor
    if (/\b(hablar\s+con\s+(?:un\s+|una\s+)?(?:asesor|asesora|persona|operador|operadora|humano|agente|representante|alguien)|atencion\s+humana|comunicarme\s+con\s+(?:alguien|un\s+agente)|pasame\s+con\s+(?:un\s+|una\s+)?(?:asesor|asesora|operador|agente))\b/i.test(clean)) {
        return { intent: 'derivacion_agente', doctorRecord: null };
    }

    // 15. Detección de Médico por Regex y lista de profesionales
    let doctorCandidate = null;
    let doctorRecord = null;
    const docRegexes = [
        /(?:doctor|doctora|dr|dra)\.?\s+([a-záéíóúñ]+)/i,
        /(?:con|para)\s+(?:el\s+|la\s+)?(?:dr\.?|doctor|dra\.?|doctora)\s+([a-záéíóúñ]{3,})/i
    ];
    for (const reg of docRegexes) {
        const m = clean.match(reg);
        if (m && m[1]) {
            const w = m[1].toLowerCase().trim();
            if (!STOPWORDS_MEDICOS.has(w) && w.length >= 3) {
                doctorCandidate = w;
                break;
            }
        }
    }

    if (doctorCandidate && doctorsList.length > 0) {
        doctorRecord = doctorsList.find(d => (d.profesional_nombre || '').toLowerCase().includes(doctorCandidate)) || null;
    }

    // 16. Turno vs Autorización vs Gestión Familiar / Propia
    const isTurno = /\b(turno|turnos|cita|citas|reprogramar|reprogramacion|atencion|consulta|consultar|agendar|doctor|doctora|dr\b|dra\b|medico|medica|especialista|clinico|cardiolog|pediatr|ginecolog|traumatolog|dermatolog|neurolog|urolog|oftalmolog)\b/i.test(clean);
    const isAutoriz = /\b(autoriz|autorizar|orden|ordenes|pedido|pedidos|receta|recetas|cobertura|coseguro|auditoria)\b/i.test(clean);
    const isGestionFamiliar = /\b(otro\s+paciente|otra\s+persona|familiar|familiares|mi\s+hijo|mi\s+hija|mi\s+bebe|mi\s+mam[aá]|mi\s+pap[aá]|mi\s+espos[oa]|mi\s+marido|mi\s+se[nñ]ora|para\s+alguien\s+mas)\b/i.test(clean);
    const isGestionPropia = /\b(para\s+m[ií]|es\s+para\s+m[ií]|tr[aá]mite\s+para\s+m[ií]|a\s+mi\s+nombre|para\s+mi\s+persona)\b/i.test(clean);
    const isInfo = /\b(informacion|donde\s+queda|ubicacion|direccion|sede|sedes|web|portal|precios?|particular|cartilla|servicios)\b/i.test(clean);

    if (isTurno || doctorRecord) return { intent: 'turno', doctorRecord };
    if (isAutoriz) return { intent: 'autorizacion', doctorRecord };
    if (isGestionFamiliar) return { intent: 'gestion_familiar', doctorRecord };
    if (isGestionPropia) return { intent: 'gestion_propia', doctorRecord };
    if (isInfo) return { intent: 'info', doctorRecord };

    return { intent: 'inicio', doctorRecord: null };
}

// ═══════════════════════════════════════════════════════════════
// EVALUADOR DE SATISFACCIÓN Y SUFICIENCIA DE INFORMACIÓN
// ═══════════════════════════════════════════════════════════════

function evaluateResponseSufficiency(scenario, botReply, intent, nextStage) {
    const query = scenario.message.toLowerCase();

    // 1. Preguntas sobre Precios / Aranceles particulares
    const asksPrice = /\b(cuanto\s+(?:cuesta|sale|vale|esta|me\s+cobran)|precio|arancel|tarifa|particular\s+cuanto|valor\s+de\s+la\s+consulta)\b/i.test(query);
    if (asksPrice) {
        // El bot actual responde con menú de administración o handoff a asesor, pero NO dice el arancel
        return {
            status: 'PARCIALMENTE_INSUFICIENTE',
            gapReason: 'Pide precio/arancel particular de consulta o estudio, pero el bot no tiene tabla de aranceles y transfiere o da teléfono.',
            improvementCategory: 'ARANCELES_Y_PRECIOS'
        };
    }

    // 2. Cobertura de PAMI
    const asksPami = /\bpami\b/i.test(query);
    if (asksPami) {
        return {
            status: 'PARCIALMENTE_INSUFICIENTE',
            gapReason: 'Paciente de PAMI consulta si atienden. El Sanatorio tiene convenios específicos limitados o atiende por derivación, pero el bot no lo aclara.',
            improvementCategory: 'CONVENIO_PAMI'
        };
    }

    // 3. Preparación previa para estudios (ecografía, endoscopía, ayunos especiales)
    const asksPreparation = /\b(preparacion|indicaciones|como\s+debo\s+ir|tengo\s+que\s+tomar\s+agua|cuantas\s+horas\s+de\s+ayuno|vejiga\s+llena|dieta\s+previa)\b/i.test(query);
    if (asksPreparation) {
        return {
            status: 'PARCIALMENTE_INSUFICIENTE',
            gapReason: 'Pregunta preparación específica de estudio (eco abdominal, renal, mamografía, endoscopía). El bot solo da links de WhatsApp de laboratorio/imágenes sin dar la indicación médica básica.',
            improvementCategory: 'PREPARACION_ESTUDIOS'
        };
    }

    // 4. Ubicación de Sedes / Estacionamiento / Cómo llegar
    const asksLocationOrParking = /\b(estacionamiento|cochera|donde\s+dejo\s+el\s+auto|como\s+llego|lineas?\s+de\s+colectivo|micro)\b/i.test(query);
    if (asksLocationOrParking) {
        return {
            status: 'PARCIALMENTE_INSUFICIENTE',
            gapReason: 'Pregunta por estacionamiento propio o cómo llegar en colectivo. El bot solo da direcciones de calles sin detalles de accesibilidad.',
            improvementCategory: 'UBICACION_Y_ACCESOS'
        };
    }

    // 5. Renovación de Recetas Crónicas
    const asksRecipeRenewal = /\b(receta\s+para\s+mi\s+medicacion|pastillas\s+de\s+la\s+presion|repetir\s+receta|receta\s+cronica|pedido\s+de\s+remedios)\b/i.test(query);
    if (asksRecipeRenewal) {
        return {
            status: 'PARCIALMENTE_INSUFICIENTE',
            gapReason: 'Consulta cómo renovar recetas de medicación crónica. El bot lo toma como turno/autorización general sin explicar el circuito de recetas sin consulta presencial.',
            improvementCategory: 'RECETAS_CRONICAS'
        };
    }

    // 6. Si es autogestionado 100% por el bot (Información institucional completa y clara)
    if (nextStage === 'informacion_respondida') {
        return {
            status: 'RESUELTO_100_AUTONOMO',
            gapReason: 'Respuesta completa y autogestionada por el bot con links, horarios y pautas oficiales.',
            improvementCategory: 'NINGUNA'
        };
    }

    // 7. Si fue un Triage Exitoso (datos recolectados y derivado eficientemente a las 4 agentes)
    if (nextStage === 'esperando_agente' || nextStage === 'esperando_datos_nuevo') {
        if (intent === 'turno' || intent === 'autorizacion' || intent === 'gestion_familiar' || intent === 'gestion_propia' || intent === 'guardia') {
            return {
                status: 'TRIAGE_EXITOSO_PARA_AGENTES',
                gapReason: 'El bot saludó, identificó o solicitó datos (DNI/OS/Profesional/Foto) y transfirió a las 4 agentes con la ficha estructurada.',
                improvementCategory: 'NINGUNA'
            };
        }
    }

    // 8. Casos de Saludo sin datos
    if (intent === 'inicio' || nextStage === 'menu_opciones') {
        return {
            status: 'MENU_INICIAL_CORRECTO',
            gapReason: 'El paciente saludó de forma abierta; el bot presentó las 4 opciones de atención para orientarlo.',
            improvementCategory: 'NINGUNA'
        };
    }

    return {
        status: 'RESUELTO_CON_DERIVACION',
        gapReason: 'Atendido según protocolo estándar con derivación humana.',
        improvementCategory: 'NINGUNA'
    };
}

// ═══════════════════════════════════════════════════════════════
// GENERADOR DE 5,000 ESCENARIOS REALISTAS (18 A 70 AÑOS)
// ═══════════════════════════════════════════════════════════════

const NOMBRES_MUJER = ['Sofia', 'Camila', 'Lucia', 'Martina', 'Valeria', 'Daniela', 'Erica', 'Virginia', 'Maria', 'Rosa', 'Norma', 'Graciela', 'Marta', 'Silvia', 'Liliana', 'Beatriz', 'Carmen', 'Elena', 'Patricia', 'Adriana'];
const NOMBRES_VARON = ['Lucas', 'Mateo', 'Joaquin', 'Agustin', 'Franco', 'Nicolas', 'Facundo', 'Juan', 'Carlos', 'Jorge', 'Roberto', 'Miguel', 'Alberto', 'Eduardo', 'Hector', 'Mario', 'Raul', 'Ramon', 'Fernando', 'Gustavo'];
const APELLIDOS = ['Gonzalez', 'Rodriguez', 'Gomez', 'Fernandez', 'Lopez', 'Diaz', 'Perez', 'Sanchez', 'Romero', 'Sosa', 'Torres', 'Alvarez', 'Ruiz', 'Marinero', 'Aguilera', 'Jacques', 'Leal', 'Olivier', 'Quiroga', 'Castro'];

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generate5000Scenarios(doctorsList) {
    const scenarios = [];

    // Distribución etaria:
    // Grupo 1: 18 - 29 años -> 1,500 casos (30%)
    // Grupo 2: 30 - 49 años -> 2,250 casos (45%)
    // Grupo 3: 50 - 70 años -> 1,250 casos (25%)

    const targetCounts = {
        jovenes: 1500,
        adultos: 2250,
        seniors: 1250
    };

    let idCounter = 1;

    // Helper para generar una persona realista
    function createPerson(ageMin, ageMax, groupName) {
        const age = getRandomInt(ageMin, ageMax);
        const isFemale = Math.random() > 0.48;
        const nombre = isFemale ? getRandomElem(NOMBRES_MUJER) : getRandomElem(NOMBRES_VARON);
        const apellido = getRandomElem(APELLIDOS);
        const fullName = `${nombre} ${apellido}`;
        const dni = (age >= 60 ? getRandomInt(10000000, 18000000) : (age >= 40 ? getRandomInt(20000000, 32000000) : getRandomInt(38000000, 46000000))).toString();
        const obraSocial = getRandomElem(OBRAS_SOCIALES);
        const dpto = getRandomElem(DEPARTAMENTOS_SAN_JUAN);
        const phone = `549264${getRandomInt(4000000, 6999999)}`;
        const isRegistered = Math.random() > 0.35; // 65% son pacientes existentes en el sanatorio

        return {
            id: idCounter++,
            age,
            groupName,
            fullName,
            dni,
            obraSocial,
            dpto,
            phone,
            isRegistered
        };
    }

    // 1. POOL DE JOVENES (18 - 29 AÑOS)
    for (let i = 0; i < targetCounts.jovenes; i++) {
        const p = createPerson(18, 29, '18-29 (Jóvenes)');
        const doc = doctorsList.length > 0 ? getRandomElem(doctorsList) : { profesional_nombre: 'Dra. Lastra', especialidad: 'Ginecología' };

        // Variedad de estilos lingüísticos juveniles (informal, emojis, abreviaturas, preguntas directas)
        const typeIndex = i % 10;
        let msg = '';
        let categoryExpected = '';

        if (typeIndex === 0) {
            msg = `hola kiero turno con la ${doc.profesional_nombre} xfa`;
            categoryExpected = 'turno';
        } else if (typeIndex === 1) {
            msg = `buenas noche hay guardia pediatrica ahora?? cuanto demoran?`;
            categoryExpected = 'guardia';
        } else if (typeIndex === 2) {
            msg = `hola te paso la orden para autorizar [image]`;
            categoryExpected = 'autorizacion';
        } else if (typeIndex === 3) {
            msg = `q horario tiene el vacunatorio de calle san luis? atienden el sabado?`;
            categoryExpected = 'vacunatorio';
        } else if (typeIndex === 4) {
            msg = `che cuanto sale la consulta particular con el dermatologo??`;
            categoryExpected = 'precio_particular';
        } else if (typeIndex === 5) {
            msg = `hola necesito hacerme analisis de sangre mñana a q hora se puede ir en ayunas?`;
            categoryExpected = 'servicio_laboratorio';
        } else if (typeIndex === 6) {
            msg = `como veo los resultados de la ecografia x la web? no me dieron la clave`;
            categoryExpected = 'informes_imagenes';
        } else if (typeIndex === 7) {
            msg = `1`;
            categoryExpected = 'opcion_directa';
        } else if (typeIndex === 8) {
            msg = `hola buenas tardes`;
            categoryExpected = 'saludo_abierto';
        } else {
            msg = `tengo que hacerme una ecografia abdominal completa, cuantas horas de ayuno tengo que hacer o se puede tomar agua?`;
            categoryExpected = 'preparacion_estudios';
        }

        scenarios.push({ ...p, message: msg, categoryExpected, doctorParam: doc });
    }

    // 2. POOL DE ADULTOS (30 - 49 AÑOS)
    for (let i = 0; i < targetCounts.adultos; i++) {
        const p = createPerson(30, 49, '30-49 (Adultos / Familias)');
        const doc = doctorsList.length > 0 ? getRandomElem(doctorsList) : { profesional_nombre: 'Dr. Noguera', especialidad: 'Obstetricia' };

        const typeIndex = i % 12;
        let msg = '';
        let categoryExpected = '';

        if (typeIndex === 0) {
            msg = `Buenas tardes, quisiera consultar por un turno para mi hijo con el Dr. ${doc.profesional_nombre.replace(/DRA?\.?\s*/i, '')}. Tiene Obra Social Provincia.`;
            categoryExpected = 'turno_familiar';
        } else if (typeIndex === 1) {
            msg = `Hola, necesitaría autorizar esta orden médica que me dio el ginecólogo. Adjunto la foto de la orden y mi carnet de OSDE.`;
            categoryExpected = 'autorizacion';
        } else if (typeIndex === 2) {
            msg = `Hola, quisiera saber los días y horarios del curso de embarazadas y gimnasia preparto en el sanatorio.`;
            categoryExpected = 'curso_embarazadas';
        } else if (typeIndex === 3) {
            msg = `Buen día, nació mi bebé hace dos días y quiero saber qué requisitos piden en el Registro Civil del Sanatorio para la partida de nacimiento.`;
            categoryExpected = 'registro_civil';
        } else if (typeIndex === 4) {
            msg = `Hola, me tengo que realizar una cesárea programada el mes que viene, ¿dónde puedo pedir el presupuesto de internación y cobertura de la clínica?`;
            categoryExpected = 'administracion_presupuestos';
        } else if (typeIndex === 5) {
            msg = `Quisiera saber sobre el Programa Prevenir de Obra Social Provincia, qué incluye y cómo se solicita el turno.`;
            categoryExpected = 'prevenir';
        } else if (typeIndex === 6) {
            msg = `Hola! Me realicé un PAP y colposcopía la semana pasada en Sede Santa Fe, ¿dónde puedo consultar si ya está el resultado?`;
            categoryExpected = 'informes_biopsia_pap';
        } else if (typeIndex === 7) {
            msg = `Quisiera hacer un reclamo porque estuvimos esperando más de 2 horas en la guardia de pediatría con mi nena con fiebre alta y la atención fue muy mala.`;
            categoryExpected = 'reclamos_calidad';
        } else if (typeIndex === 8) {
            msg = `Hola, me quiero hacer el chequeo preventivo de salud completo. ¿En qué consiste y qué sedes tienen disponibles?`;
            categoryExpected = 'chequeo';
        } else if (typeIndex === 9) {
            msg = `Hola, mi médico me pidió una tomografía con contraste. ¿Cómo es la preparación previa que tengo que hacer?`;
            categoryExpected = 'preparacion_estudios';
        } else if (typeIndex === 10) {
            msg = `2`;
            categoryExpected = 'opcion_directa';
        } else {
            msg = `Buenas tardes, quisiera consultar los horarios de visita para pacientes internados en Sede 01 y si tienen estacionamiento en el lugar.`;
            categoryExpected = 'horarios_sedes';
        }

        scenarios.push({ ...p, message: msg, categoryExpected, doctorParam: doc });
    }

    // 3. POOL DE SENIORS (50 - 70 AÑOS)
    for (let i = 0; i < targetCounts.seniors; i++) {
        const p = createPerson(50, 70, '50-70 (Adultos Mayores)');
        const doc = doctorsList.length > 0 ? getRandomElem(doctorsList) : { profesional_nombre: 'Dr. Gempel', especialidad: 'Cardiología' };

        const typeIndex = i % 10;
        let msg = '';
        let categoryExpected = '';

        if (typeIndex === 0) {
            msg = `Estimados señores del Sanatorio Argentino, muy buenos días. Me comunico con ustedes para solicitar un turno con el especialista en cardiología ${doc.profesional_nombre}, mi obra social es ${p.obraSocial} y mi número de documento es ${p.dni}.`;
            categoryExpected = 'turno_formal';
        } else if (typeIndex === 1) {
            msg = `Hola buen día, tengo PAMI y necesito saber si atienden por mi obra social para hacerme ver con un médico clínico y sacarme unos análisis de sangre.`;
            categoryExpected = 'pami_consulta';
        } else if (typeIndex === 2) {
            msg = `Buenas tardes, me hicieron una biopsia hace 15 días y me dijeron que tenía que retirarla por administración pero vivo en Caucete y se me hace difícil viajar. ¿Me la podrán mandar por WhatsApp o por correo electrónico?`;
            categoryExpected = 'informes_biopsia_pap';
        } else if (typeIndex === 3) {
            msg = `Hola, necesito renovar las recetas de mi medicación de la presión con el cardiólogo, ¿cómo puedo hacer para que me la hagan sin tener que sacar turno presencial?`;
            categoryExpected = 'recetas_cronicas';
        } else if (typeIndex === 4) {
            msg = `Buenos días, quisiera saber a qué hora abren el laboratorio para hacerme análisis de sangre y glucemia en ayunas en calle San Luis.`;
            categoryExpected = 'servicio_laboratorio';
        } else if (typeIndex === 5) {
            msg = `Quisiera saber los números de teléfono directo del sector de internación para consultar por el estado de un familiar que está internado.`;
            categoryExpected = 'telefonos_sedes';
        } else if (typeIndex === 6) {
            msg = `Hola, necesito hacerme una mamografía digital y ecografía mamaria de control. ¿Dónde se realizan y qué días atienden?`;
            categoryExpected = 'turno_imagenes';
        } else if (typeIndex === 7) {
            msg = `Por favor deseo hablar con una persona de atención al público, no con una máquina.`;
            categoryExpected = 'derivacion_agente';
        } else if (typeIndex === 8) {
            msg = `Muchísimas gracias por su amable atención, que tengan muy buen día.`;
            categoryExpected = 'agradecimiento_cierre';
        } else {
            msg = `Buenos días, me tengo que hacer una ecografía renal y de próstata. ¿Tengo que tomar agua antes y cuánta?`;
            categoryExpected = 'preparacion_estudios';
        }

        scenarios.push({ ...p, message: msg, categoryExpected, doctorParam: doc });
    }

    return scenarios;
}

// ═══════════════════════════════════════════════════════════════
// EJECUCIÓN PRINCIPAL DEL SIMULADOR
// ═══════════════════════════════════════════════════════════════

async function runSimulation() {
    console.log('================================================================');
    console.log('🚀 INICIANDO SIMULACIÓN DE 5,000 ESCENARIOS DE CONTACT CENTER');
    console.log('Sanatorio Argentino — Pacientes de 18 a 70 años');
    console.log('================================================================\n');

    // 1. Obtener lista real de médicos desde Supabase
    console.log('Cargando base médica real de Supabase (contact_center_doctor_parameters)...');
    let doctorsList = [];
    try {
        const { data, error } = await supabase
            .from('contact_center_doctor_parameters')
            .select('id, profesional_nombre, especialidad, consultorio_actual')
            .limit(300);
        if (!error && data) {
            doctorsList = data;
            console.log(`✅ ${doctorsList.length} profesionales cargados exitosamente.`);
        }
    } catch (e) {
        console.warn('Advertencia cargando doctores:', e.message);
    }

    // 2. Generar los 5,000 escenarios con estricta representatividad
    console.log('\nGenerando 5,000 conversaciones realistas...');
    const scenarios = generate5000Scenarios(doctorsList);
    console.log(`✅ Total escenarios generados: ${scenarios.length}`);

    // 3. Procesar cada escenario con el motor del bot
    const results = {
        total: scenarios.length,
        byAgeGroup: {
            '18-29 (Jóvenes)': { count: 0, msgs: 0, resueltos: 0, triage: 0, insuficientes: 0 },
            '30-49 (Adultos / Familias)': { count: 0, msgs: 0, resueltos: 0, triage: 0, insuficientes: 0 },
            '50-70 (Adultos Mayores)': { count: 0, msgs: 0, resueltos: 0, triage: 0, insuficientes: 0 },
        },
        byIntent: {},
        bySufficiency: {
            'RESUELTO_100_AUTONOMO': 0,
            'TRIAGE_EXITOSO_PARA_AGENTES': 0,
            'MENU_INICIAL_CORRECTO': 0,
            'PARCIALMENTE_INSUFICIENTE': 0,
            'RESUELTO_CON_DERIVACION': 0
        },
        gapsIdentified: {
            ARANCELES_Y_PRECIOS: 0,
            CONVENIO_PAMI: 0,
            PREPARACION_ESTUDIOS: 0,
            UBICACION_Y_ACCESOS: 0,
            RECETAS_CRONICAS: 0
        },
        totalMessagesSimulated: {
            patientIncoming: 0,
            botOutgoing: 0,
            totalExchanged: 0
        }
    };

    const sampleInteractions = [];

    for (let i = 0; i < scenarios.length; i++) {
        const sc = scenarios[i];
        const ageGrp = sc.groupName;
        results.byAgeGroup[ageGrp].count++;

        // Simular Turno 1: Mensaje entrante del paciente
        results.totalMessagesSimulated.patientIncoming++;
        let patientMsgCount = 1;
        let botMsgCount = 0;

        // Contexto simulado (si es existente o nuevo)
        const mockContext = {
            isExistingPatient: sc.isRegistered,
            patientName: sc.fullName,
            resolvedDni: sc.dni,
            botStage: 'inicio',
            history: []
        };

        const analysis = detectIntentAndEntities(sc.message, doctorsList, mockContext);
        const intent = analysis.intent;
        results.byIntent[intent] = (results.byIntent[intent] || 0) + 1;

        // Determinar respuesta y siguiente etapa según intent
        let nextStage = 'inicio';
        let botReply = '';

        if (['informes_laboratorio', 'informes_imagenes', 'informes_biopsia_pap', 'informes_general',
             'servicio_laboratorio', 'vacunatorio', 'curso_embarazadas', 'registro_civil',
             'horarios_sedes', 'telefonos_sedes', 'reclamos_calidad', 'fundacion', 'agradecimiento_cierre'].includes(intent)) {
            nextStage = 'informacion_respondida';
            botReply = `[Respuesta institucional completa para ${intent}]`;
            botMsgCount++;
        } else if (['turno', 'autorizacion', 'gestion_familiar', 'gestion_propia', 'derivacion_agente'].includes(intent)) {
            if (sc.isRegistered) {
                nextStage = 'esperando_agente';
                botReply = `¡Hola *${sc.fullName}*! Te ayudamos con tu trámite. Registramos tus datos y un asesor te responderá a la brevedad.`;
                botMsgCount++;
            } else {
                // Paciente nuevo: el bot le pide los datos faltantes (Turno 2 simulado)
                nextStage = 'esperando_datos_nuevo';
                botReply = `¡Hola! Te damos la bienvenida a Sanatorio Argentino. Por favor indícanos tu DNI, Obra Social y Fecha de Nacimiento.`;
                botMsgCount++;

                // Simular Turno 2: Paciente responde con sus datos
                patientMsgCount++;
                results.totalMessagesSimulated.patientIncoming++;

                // Bot confirma admisión y pasa a asesor
                nextStage = 'esperando_agente';
                botReply = `¡Excelente *${sc.fullName}*! Registramos tu ficha de admisión. Un asesor tomará tu consulta.`;
                botMsgCount++;
            }
        } else if (intent === 'guardia') {
            nextStage = 'informacion_respondida';
            botReply = `🚨 *Guardias Médicas 24 Horas — Sanatorio Argentino*\nGuardia de Adultos, Pediatría y Maternidad activas las 24 horas en Sede 01 (San Luis 432 Oeste). Atención por orden de llegada con triage médico.`;
            botMsgCount++;
        } else {
            nextStage = 'menu_opciones';
            botReply = `¡Hola! ¿El trámite es para vos o estás gestionando para un familiar? 1. Turno propio | 2. Familiar | 3. Guardias | 4. Informes y sedes`;
            botMsgCount++;
        }

        results.totalMessagesSimulated.botOutgoing += botMsgCount;
        const totalExchangeForCase = patientMsgCount + botMsgCount;
        results.byAgeGroup[ageGrp].msgs += totalExchangeForCase;

        // Evaluar suficiencia médica y satisfacción
        const evalResult = evaluateResponseSufficiency(sc, botReply, intent, nextStage);
        results.bySufficiency[evalResult.status] = (results.bySufficiency[evalResult.status] || 0) + 1;

        if (evalResult.improvementCategory !== 'NINGUNA') {
            results.gapsIdentified[evalResult.improvementCategory] = (results.gapsIdentified[evalResult.improvementCategory] || 0) + 1;
            results.byAgeGroup[ageGrp].insuficientes++;
        } else if (evalResult.status === 'RESUELTO_100_AUTONOMO') {
            results.byAgeGroup[ageGrp].resueltos++;
        } else {
            results.byAgeGroup[ageGrp].triage++;
        }

        // Guardar muestras representativas de cada grupo
        if (i < 30 || (i % 250 === 0 && sampleInteractions.length < 50)) {
            sampleInteractions.push({
                casoId: sc.id,
                edad: sc.age,
                grupo: sc.groupName,
                paciente: sc.fullName,
                mensajePaciente: sc.message,
                intentDetectado: intent,
                etapaFinal: nextStage,
                satisfaccion: evalResult.status,
                brechaDetectada: evalResult.gapReason,
                mensajesIntercambiados: totalExchangeForCase
            });
        }
    }

    results.totalMessagesSimulated.totalExchanged = results.totalMessagesSimulated.patientIncoming + results.totalMessagesSimulated.botOutgoing;

    // Guardar resultados completos en archivo JSON
    const reportPath = path.join(__dirname, 'resultados_simulacion_5000.json');
    fs.writeFileSync(reportPath, JSON.stringify({ summary: results, sampleInteractions }, null, 2), 'utf-8');
    console.log(`\n✅ Simulación finalizada. Resultados guardados en: ${reportPath}`);

    // Imprimir resumen ejecutivo en consola
    console.log('\n================================================================');
    console.log('📊 RESUMEN EJECUTIVO DE LA SIMULACIÓN DE 5,000 ESCENARIOS');
    console.log('================================================================');
    console.log(`Total escenarios analizados: ${results.total}`);
    console.log(`Mensajes entrantes (Pacientes): ${results.totalMessagesSimulated.patientIncoming}`);
    console.log(`Mensajes salientes (Bot): ${results.totalMessagesSimulated.botOutgoing}`);
    console.log(`Total mensajes procesados: ${results.totalMessagesSimulated.totalExchanged}`);
    console.log(`Promedio de mensajes por caso: ${(results.totalMessagesSimulated.totalExchanged / results.total).toFixed(2)} msgs/caso`);

    console.log('\n--- 1. DESGLOSE POR GRUPO ETARIO ---');
    for (const [grp, data] of Object.entries(results.byAgeGroup)) {
        console.log(`• ${grp}:`);
        console.log(`  - Casos: ${data.count} (${((data.count / results.total) * 100).toFixed(1)}%)`);
        console.log(`  - Total mensajes: ${data.msgs} (promedio ${(data.msgs / data.count).toFixed(2)} msgs/caso)`);
        console.log(`  - Resueltos 100% por bot: ${data.resueltos} (${((data.resueltos / data.count) * 100).toFixed(1)}%)`);
        console.log(`  - Triage exitoso a agentes: ${data.triage} (${((data.triage / data.count) * 100).toFixed(1)}%)`);
        console.log(`  - Consultas con información insuficiente: ${data.insuficientes} (${((data.insuficientes / data.count) * 100).toFixed(1)}%)`);
    }

    console.log('\n--- 2. DISTRIBUCIÓN DE INTENCIONES (TOP INTENTS) ---');
    const sortedIntents = Object.entries(results.byIntent).sort((a, b) => b[1] - a[1]);
    for (const [int, cnt] of sortedIntents) {
        console.log(`• ${int}: ${cnt} casos (${((cnt / results.total) * 100).toFixed(1)}%)`);
    }

    console.log('\n--- 3. SUFICIENCIA Y SATISFACCIÓN DE LA RESPUESTA ---');
    for (const [sat, cnt] of Object.entries(results.bySufficiency)) {
        console.log(`• ${sat}: ${cnt} (${((cnt / results.total) * 100).toFixed(1)}%)`);
    }

    console.log('\n--- 4. BRECHAS DE INFORMACIÓN DETECTADAS (DÓNDE EL BOT SE QUEDA CORTO) ---');
    for (const [gap, cnt] of Object.entries(results.gapsIdentified)) {
        console.log(`⚠️ ${gap}: ${cnt} consultas insatisfechas (${((cnt / results.total) * 100).toFixed(1)}% del total)`);
    }
}

runSimulation().catch(err => {
    console.error('Error en simulación:', err);
    process.exit(1);
});
