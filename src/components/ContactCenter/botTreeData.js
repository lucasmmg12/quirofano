/**
 * botTreeData.js
 * Definición estructurada del Árbol de Decisión y Flujograma Conversacional
 * del Chatbot de Sanatorio Argentino (Contact Center / WhatsApp).
 * 
 * Modela la interacción paso a paso entre el paciente y el asistente virtual:
 * [Entrada / Trigger del Paciente] ---> [Acción / Evaluación] ---> [Respuesta Predeterminada] ---> [Bifurcaciones]
 */

export const BOT_TREE_CATEGORIES = {
    inicio: { label: 'Inicio y Saludo', color: '#0284C7', bg: '#E0F2FE', border: '#BAE6FD' },
    turnos: { label: 'Turnos Médicos (SALUS)', color: '#059669', bg: '#DCFCE7', border: '#A7F3D0' },
    admision: { label: 'Admisión & Alta Ficha', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
    estudios: { label: 'Informes y Estudios Web', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
    guardia: { label: 'Guardias 24 hs (Sede 01)', color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
    administracion: { label: 'Presupuestos & Aranceles', color: '#0D9488', bg: '#CCFBF1', border: '#99F6E4' },
    derivacion: { label: 'Derivación / Handoff', color: '#7C3AED', bg: '#F3E8FF', border: '#DDD6FE' },
    ia: { label: 'Motor IA Clínico (GPT-5.5)', color: '#DB2777', bg: '#FCE7F3', border: '#FBCFE8' }
};

export const DEFAULT_BOT_TREE_NODES = [
    // -------------------------------------------------------------
    // NODO RAÍZ: INICIO Y SALUDO DEL PACIENTE
    // -------------------------------------------------------------
    {
        id: 'root_saludo',
        parentId: null,
        level: 1,
        order: 1,
        category: 'inicio',
        title: '1. Saludo Inicial del Paciente',
        patientTrigger: 'Saludo libre ("Hola", "Buenas tardes", "Hola Dora", "Buen día", o apertura de chat)',
        patientExamples: ['Hola, buenas tardes', 'Buen día, quisiera hacer una consulta', 'Hola Dora!', 'Hola Sanatorio Argentino'],
        systemAction: 'Identificación de remitente, bienvenida institucional y despliegue del menú de opciones principales.',
        nodeType: 'bot_response',
        botResponse: `¡Hola! 👋 Soy {bot_name}, tu asistente virtual de Sanatorio Argentino.
¿En qué te podemos ayudar hoy?

1️⃣ *Turnos médicos y consultas*
2️⃣ *Informes y resultados de estudios (Laboratorio / Imágenes)*
3️⃣ *Guardias y urgencias 24 hs (Sede San Luis)*
4️⃣ *Hablar con un asesor del Sanatorio*

Por favor, indicame el número de opción o escribí tu consulta directamente.`,
        availableTags: ['{bot_name}', '{nombre}'],
        childrenIds: ['nodo_turnos_triage', 'nodo_mis_turnos', 'nodo_estudios_menu', 'nodo_guardia_24hs', 'nodo_presupuestos', 'nodo_operador_handoff', 'nodo_consulta_libre']
    },

    // -------------------------------------------------------------
    // NIVEL 2: TURNOS MÉDICOS Y ADMISIÓN SALUS (TRIAGE DE IDENTIDAD)
    // -------------------------------------------------------------
    {
        id: 'nodo_turnos_triage',
        parentId: 'root_saludo',
        level: 2,
        order: 1,
        category: 'turnos',
        title: '2. Solicitud de Turno y Triage de Identidad SALUS',
        patientTrigger: 'Paciente solicita agendar ("1", "Quiero un turno", "Turno con médico", "Ginecología", "Pediatría")',
        patientExamples: ['1', 'Quiero un turno', 'Necesito turno para ginecología', 'Turno con el Dr. Martínez'],
        systemAction: 'El bot solicita o valida el DNI del paciente consultando la base de datos de SALUS (hospital_pacientes) para determinar el camino de atención.',
        nodeType: 'decision',
        botResponse: `Con gusto te ayudamos a coordinar tu turno 🩺.
Para verificar tu ficha y darte la mejor atención, por favor ingresá tu número de DNI (sin puntos ni espacios).`,
        availableTags: ['{bot_name}', '{nombre}'],
        childrenIds: ['nodo_camino_1_registrado', 'nodo_camino_2_nuevo']
    },

    // 2.A CAMINO 1: PACIENTE REGISTRADO EN SALUS
    {
        id: 'nodo_camino_1_registrado',
        parentId: 'nodo_turnos_triage',
        level: 3,
        order: 1,
        category: 'turnos',
        title: '2.A Camino 1: Paciente Registrado en SALUS',
        patientTrigger: 'DNI validado con ficha clínica existente en hospital_pacientes',
        patientExamples: ['28475561', 'Mi DNI es 30123456'],
        systemAction: 'Reconoce al paciente por su nombre, confirma su cobertura registrada y solicita especialidad/profesional.',
        nodeType: 'bot_response',
        botResponse: `¡Hola {nombre}! Encontré tu ficha médica en nuestro sistema SALUS ✅.

Para avanzar con la asignación de tu turno, por favor confirmanos:
1. Tu *Obra Social y Plan actual* (o si te atendés de forma Particular).
2. *Especialidad médica* o nombre del profesional con quien deseás atenderte.

Te mostraremos las fechas y horarios disponibles más convenientes para vos.`,
        availableTags: ['{nombre}', '{dni}', '{cobertura}', '{bot_name}'],
        childrenIds: ['nodo_oferta_turnos_salus']
    },

    // 2.A.1 OFRECIMIENTO Y CONFIRMACIÓN DE AGENDAMIENTO
    {
        id: 'nodo_oferta_turnos_salus',
        parentId: 'nodo_camino_1_registrado',
        level: 4,
        order: 1,
        category: 'turnos',
        title: '2.A.1 Oferta de Horarios y Confirmación de Cita',
        patientTrigger: 'Paciente confirma Obra Social y especialidad deseada',
        patientExamples: ['OSP tradicional, para ginecología', 'Swiss Medical con la Dra. Gómez'],
        systemAction: 'Consulta en tiempo real la agenda en SALUS y devuelve opciones disponibles.',
        nodeType: 'bot_response',
        botResponse: `Tenemos las siguientes opciones disponibles en agenda:
📅 *Opción 1:* Martes 29/09 a las 16:30 hs con Dra. Gómez Carrizo (Sede San Luis)
📅 *Opción 2:* Jueves 01/10 a las 10:15 hs con Dra. Gómez Carrizo (Sede San Luis)

Respondé con el número de opción elegida (*1* o *2*) para confirmar tu turno.
Recordá presentarte 15 minutos antes con DNI y carnet de cobertura.`,
        availableTags: ['{nombre}', '{cobertura}'],
        childrenIds: []
    },

    // 2.B CAMINO 2: PACIENTE NO REGISTRADO (PACIENTE NUEVO EN SALUS)
    {
        id: 'nodo_camino_2_nuevo',
        parentId: 'nodo_turnos_triage',
        level: 3,
        order: 2,
        category: 'admision',
        title: '2.B Camino 2: Paciente No Registrado / Nuevo',
        patientTrigger: 'DNI no encontrado en SALUS / Paciente sin Historia Clínica previa',
        patientExamples: ['35123987', 'No tengo ficha todavía', 'Es mi primera vez en el Sanatorio'],
        systemAction: 'Explica de forma empática la necesidad de empadronamiento y solicita los 5 DATOS OBLIGATORIOS de Admisión.',
        nodeType: 'bot_response',
        botResponse: `Hola. Para poder agendarte tu turno y abrir tu Historia Clínica en Sanatorio Argentino, necesitamos registrarte como paciente nuevo en nuestro sistema SALUS 📋.

Por favor, envianos en un solo mensaje los siguientes *5 datos obligatorios*:
1. *Nombre y Apellido completo*
2. *Número de DNI*
3. *Fecha de nacimiento (DD/MM/AAAA)*
4. *Obra Social y Plan* (con N° de carnet/afiliado si tenés foto o credencial)
5. *Teléfono de contacto y Correo electrónico*

En cuanto los recibamos, creamos tu ficha y te ofrecemos los turnos disponibles.`,
        availableTags: ['{bot_name}'],
        childrenIds: ['nodo_recepcion_datos_salus']
    },

    // 2.B.1 RECEPCIÓN DE DATOS OBLIGATORIOS Y ALTA DE FICHA
    {
        id: 'nodo_recepcion_datos_salus',
        parentId: 'nodo_camino_2_nuevo',
        level: 4,
        order: 1,
        category: 'admision',
        title: '2.B.1 Recepción de Datos y Alta en SALUS',
        patientTrigger: 'Paciente envía los 5 datos solicitados en texto o imagen de credencial',
        patientExamples: ['Juan Pérez, DNI 35123987, 12/04/1990, OSDE 210 afiliado 123456, juan@email.com'],
        systemAction: 'Valida completitud de campos, ingresa pre-alta y deriva a mesa de turnos/admisión para validación.',
        nodeType: 'bot_response',
        botResponse: `¡Muchas gracias! Hemos recibido tus datos completos para darte de alta en SALUS 🏥.
Nuestro equipo de Admisión registrará tu Historia Clínica y te contactará a la brevedad para coordinar el turno solicitado con tu cobertura médica.`,
        availableTags: ['{bot_name}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // CONSULTA DE TURNOS EXISTENTES
    // -------------------------------------------------------------
    {
        id: 'nodo_mis_turnos',
        parentId: 'root_saludo',
        level: 2,
        order: 2,
        category: 'turnos',
        title: '3. Consulta y Gestión de Turnos Agendados',
        patientTrigger: 'Paciente consulta turnos agendados ("Mis turnos", "¿Cuándo tengo turno?", "Cancelar turno", "Reprogramar")',
        patientExamples: ['Mis turnos', '¿A qué hora tengo el turno hoy?', 'Quiero cancelar mi turno', 'Reprogramar cita'],
        systemAction: 'Lee los turnos activos en SALUS vinculados al DNI y teléfono del paciente y los lista ordenadamente.',
        nodeType: 'bot_response',
        botResponse: `Tus próximos turnos agendados en Sanatorio Argentino son:
{turnos}

Si necesitás reprogramar o cancelar alguno, avisanos indicando la fecha o te comunicamos con un asesor del sector.`,
        availableTags: ['{nombre}', '{dni}', '{turnos}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // INFORMES Y RESULTADOS DE ESTUDIOS MÉDICOS
    // -------------------------------------------------------------
    {
        id: 'nodo_estudios_menu',
        parentId: 'root_saludo',
        level: 2,
        order: 3,
        category: 'estudios',
        title: '4. Informes y Resultados de Estudios Médicos',
        patientTrigger: 'Paciente solicita estudios ("2", "Informes", "Resultados", "Laboratorio", "Ecografía", "Biopsia")',
        patientExamples: ['2', 'Quiero ver mis estudios', 'Resultados de laboratorio', 'Mis análisis de sangre', 'Informe de ecografía'],
        systemAction: 'Muestra las plataformas digitales de descarga y consulta de informes de Sanatorio Argentino.',
        nodeType: 'bot_response',
        botResponse: `Para consultar o descargar tus estudios médicos, por favor elegí la opción que corresponda:

🔬 *1. Laboratorio Online (Glims)*: Análisis de sangre, orina y cultivos.
🩻 *2. Diagnóstico por Imágenes (Portal ITS)*: Radiografías, ecografías, tomografías y resonancias.
📋 *3. Anatomía Patológica*: Biopsias, PAP (papanicolau) y estudios histológicos.

Escribí el número de opción para recibir el enlace de acceso directo.`,
        availableTags: ['{bot_name}', '{nombre}'],
        childrenIds: ['nodo_estudio_lab', 'nodo_estudio_imagenes', 'nodo_estudio_patologia']
    },

    // 4.A LABORATORIO GLIMS
    {
        id: 'nodo_estudio_lab',
        parentId: 'nodo_estudios_menu',
        level: 3,
        order: 1,
        category: 'estudios',
        title: '4.A Portal Laboratorio Online (Glims)',
        patientTrigger: 'Paciente elige Laboratorio ("1", "Laboratorio", "Análisis")',
        patientExamples: ['1', 'Laboratorio', 'Quiero mis análisis'],
        systemAction: 'Entrega URL y pautas de acceso al portal Glims con protocolo y DNI.',
        nodeType: 'bot_response',
        botResponse: `Podés descargar tus resultados de análisis clínicos desde nuestro portal online ingresando tu DNI y el código de protocolo impreso en tu comprobante de atención:
🌐 https://sanatorioargentino.com.ar/laboratorio-online

Si no recordás tu número de orden o protocolo, dejanos tu DNI y te ayudamos a recuperarlo.`,
        availableTags: ['{dni}'],
        childrenIds: []
    },

    // 4.B DIAGNÓSTICO POR IMÁGENES ITS
    {
        id: 'nodo_estudio_imagenes',
        parentId: 'nodo_estudios_menu',
        level: 3,
        order: 2,
        category: 'estudios',
        title: '4.B Portal Diagnóstico por Imágenes (ITS)',
        patientTrigger: 'Paciente elige Imágenes ("2", "Rayos X", "Tomografía", "Ecografía", "Resonancia")',
        patientExamples: ['2', 'Imágenes', 'Ecografía', 'Tomografía'],
        systemAction: 'Entrega URL y credenciales de acceso al portal ITS.',
        nodeType: 'bot_response',
        botResponse: `Tus estudios de imágenes (Rayos X, Tomografía, Ecografía, Mamografía, Densitometría) están disponibles en el portal web ITS:
🌐 https://portal.sanatorioargentino.com.ar

Tu usuario es tu DNI y la contraseña te fue entregada en el comprobante al momento de realizar la práctica.`,
        availableTags: ['{dni}'],
        childrenIds: []
    },

    // 4.C ANATOMÍA PATOLÓGICA Y BIOPSIAS
    {
        id: 'nodo_estudio_patologia',
        parentId: 'nodo_estudios_menu',
        level: 3,
        order: 3,
        category: 'estudios',
        title: '4.C Anatomía Patológica (PAP y Biopsias)',
        patientTrigger: 'Paciente consulta por PAP o biopsia ("3", "PAP", "Biopsia", "Papanicolau")',
        patientExamples: ['3', 'Biopsia', 'Resultado de PAP'],
        systemAction: 'Informa plazo estricto de 10 a 15 días hábiles para procesamiento histopatológico.',
        nodeType: 'bot_response',
        botResponse: `Los informes de biopsias y citologías (PAP) tienen un tiempo de procesamiento histopatológico de *10 a 15 días hábiles*.
Si ya transcurrió dicho plazo desde la toma de muestra, por favor indicanos tu DNI para verificar el estado con secretaría de Patología.`,
        availableTags: ['{dni}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // GUARDIAS Y URGENCIAS 24 HORAS
    // -------------------------------------------------------------
    {
        id: 'nodo_guardia_24hs',
        parentId: 'root_saludo',
        level: 2,
        order: 4,
        category: 'guardia',
        title: '5. Guardias y Urgencias Médicas 24 Horas',
        patientTrigger: 'Paciente menciona urgencia ("3", "Guardia", "Urgencia", "Emergencia", "Fiebre", "Dolor agudo")',
        patientExamples: ['3', 'Tengo una urgencia', '¿Hay guardia pediátrica?', '¿Dónde está la guardia?'],
        systemAction: 'Dispara advertencia institucional crítica: la guardia atiende las 24 hs ÚNICAMENTE en Sede San Luis 432 Oeste.',
        nodeType: 'bot_response',
        botResponse: `🚨 *Guardia Médica 24 Horas - Sanatorio Argentino*

Nuestras guardias de Adultos, Pediatría y Gineco-Obstetricia atienden las 24 horas, los 365 días del año de forma ininterrumpida exclusivamente en:
📍 **Sede Principal: San Luis 432 Oeste** (entre Jujuy y Aberastain, Ciudad de San Juan).

⚠️ *Importante:* La Sede Santa Fe NO dispone de servicio de guardia de urgencias. Si presentás una urgencia con riesgo inminente, concurrí de inmediato a la guardia o comunicate con el 107.`,
        availableTags: ['{bot_name}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // ADMINISTRACIÓN Y PRESUPUESTOS
    // -------------------------------------------------------------
    {
        id: 'nodo_presupuestos',
        parentId: 'root_saludo',
        level: 2,
        order: 5,
        category: 'administracion',
        title: '6. Presupuestos Quirúrgicos y Aranceles',
        patientTrigger: 'Paciente solicita cotización ("Presupuesto", "Cirugía", "Costos de internación", "Aranceles")',
        patientExamples: ['Presupuesto para una cesárea', 'Cuánto cuesta una internación', 'Presupuesto de cirugía'],
        systemAction: 'Solicita foto de la orden médica con código de práctica y cobertura.',
        nodeType: 'bot_response',
        botResponse: `Para cotizaciones y presupuestos de cirugías o internaciones, por favor envianos:
1. Foto legible de la orden médica o indicación quirúrgica con el código de práctica.
2. Tu Obra Social y Plan de cobertura (o si es Particular).

Te derivaremos con el sector de Presupuestos y Cobranzas para confeccionar tu presupuesto exacto.`,
        availableTags: ['{nombre}', '{cobertura}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // DERIVACIÓN A OPERADOR HUMANO (HANDOFF)
    // -------------------------------------------------------------
    {
        id: 'nodo_operador_handoff',
        parentId: 'root_saludo',
        level: 2,
        order: 6,
        category: 'derivacion',
        title: '7. Derivación a Operador Humano (Handoff)',
        patientTrigger: 'Paciente solicita hablar con una persona ("4", "Operador", "Asesor", "Persona humana", "Representante")',
        patientExamples: ['4', 'Quiero hablar con una persona', 'Comunicate con un asesor', 'Operador por favor'],
        systemAction: 'Evalúa la cantidad de chats en cola no asignados y el horario hábil para disparar el mensaje adecuado.',
        nodeType: 'decision',
        botResponse: `Evaluando disponibilidad de operadores y tiempo de espera en cola...`,
        availableTags: ['{bot_name}'],
        childrenIds: ['nodo_handoff_normal', 'nodo_handoff_delay', 'nodo_handoff_fuera_horario']
    },

    // 7.A HANDOFF NORMAL
    {
        id: 'nodo_handoff_normal',
        parentId: 'nodo_operador_handoff',
        level: 3,
        order: 1,
        category: 'derivacion',
        title: '7.A Cola Normal (< Umbral de espera)',
        patientTrigger: 'Cola de espera menor al umbral configurado (ej: < 5 chats)',
        patientExamples: ['Flujo de atención dentro del tiempo esperado'],
        systemAction: 'Transfiere el chat a la cola de agentes (sin_asignar) y pone al bot en pausa.',
        nodeType: 'bot_response',
        botResponse: `Te estamos derivando con uno de nuestros asesores del Contact Center. Aguardá unos instantes, por favor. El asistente virtual quedará en pausa hasta que finalice la atención humana.`,
        availableTags: ['{nombre}'],
        childrenIds: []
    },

    // 7.B HANDOFF ALTA DEMANDA (DEMORAS)
    {
        id: 'nodo_handoff_delay',
        parentId: 'nodo_operador_handoff',
        level: 3,
        order: 2,
        category: 'derivacion',
        title: '7.B Alta Demanda / Demoras en Cola (>= Umbral)',
        patientTrigger: 'Cola de espera supera el umbral configurado',
        patientExamples: ['Cola con alta saturación en horas pico'],
        systemAction: 'Envía aviso empático de demoras y detalla el horario oficial de atención.',
        nodeType: 'bot_response',
        botResponse: `⚠️ En este momento estamos experimentando una alta demanda en nuestro canal de atención y presentamos algunas demoras. Un asesor te responderá a la brevedad por orden de llegada. El bot quedará en pausa.
⏰ *Horario de atención:* Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.`,
        availableTags: ['{bot_name}'],
        childrenIds: []
    },

    // 7.C HANDOFF FUERA DE HORARIO
    {
        id: 'nodo_handoff_fuera_horario',
        parentId: 'nodo_operador_handoff',
        level: 3,
        order: 3,
        category: 'derivacion',
        title: '7.C Fuera de Horario de Atención',
        patientTrigger: 'Paciente escribe fuera de la franja (después de las 21:00 hs o Domingos)',
        patientExamples: ['Mensaje a las 23:00 hs o Domingo por la tarde'],
        systemAction: 'Registra el mensaje y notifica al paciente cuándo se retomará la respuesta.',
        nodeType: 'bot_response',
        botResponse: `Nuestro equipo de asesores atiende de Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.
Podés dejarnos tu consulta detallada y te responderemos ni bien iniciemos la jornada. Para urgencias médicas, recordá que nuestra Guardia de San Luis 432 Oeste atiende las 24 horas.`,
        availableTags: ['{bot_name}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // CONSULTA LIBRE CON MOTOR IA (GPT-5.5)
    // -------------------------------------------------------------
    {
        id: 'nodo_consulta_libre',
        parentId: 'root_saludo',
        level: 2,
        order: 7,
        category: 'ia',
        title: '8. Consultas Médicas e Información General (GPT-5.5)',
        patientTrigger: 'Preguntas abiertas, dudas sobre preparaciones de estudios, ayuno, ubicación de sedes o estacionamiento',
        patientExamples: ['¿Tengo que ir en ayunas para la ecografía abdominal?', '¿Dónde queda la sede Santa Fe?', '¿Qué colectivos me dejan cerca?'],
        systemAction: 'Procesamiento en tiempo real con modelo OpenAI GPT-5.5 gobernado por el System Prompt clínico institucional.',
        nodeType: 'ai_engine',
        botResponse: `[Respuesta generada dinámicamente por GPT-5.5: responde con empatía y precisión clínica sin emitir diagnósticos presuntivos, orientando al paciente hacia la sede correspondiente y requisitos sanitarios]`,
        availableTags: ['{bot_name}', '{nombre}', '{cobertura}'],
        childrenIds: []
    }
];

/**
 * Convierte el árbol conversacional en directivas estructuradas para el System Prompt
 */
export function generatePromptDirectivesFromTree(nodes = DEFAULT_BOT_TREE_NODES) {
    const lines = [
        '### ESTRUCTURA DEL ÁRBOL CONVERSACIONAL (FLUJOGRAMA DE DECISIÓN):',
        'Debes respetar estrictamente las respuestas predeterminadas y las siguientes bifurcaciones según el mensaje del paciente:'
    ];

    nodes.forEach(node => {
        lines.push(`\n- [${node.title}]`);
        lines.push(`  * Disparador / Entrada del Paciente: ${node.patientTrigger}`);
        lines.push(`  * Acción del Sistema: ${node.systemAction}`);
        if (node.nodeType === 'bot_response') {
            lines.push(`  * Respuesta Predeterminada del Bot:\n"${node.botResponse.replace(/\n/g, ' ')}"`);
        }
    });

    return lines.join('\n');
}
