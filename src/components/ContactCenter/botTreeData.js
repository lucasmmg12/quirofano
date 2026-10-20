/**
 * botTreeData.js
 * Definición estructurada del Árbol de Decisión y Flujograma Conversacional
 * del Chatbot de Sanatorio Argentino (Contact Center / WhatsApp).
 * 
 * Modela la interacción paso a paso entre el paciente y el asistente virtual:
 * [Entrada / Trigger del Paciente] ---> [Acción / Evaluación] ---> [Respuesta Predeterminada] ---> [Bifurcaciones]
 *
 * IMPORTANTE: Este árbol documenta el comportamiento REAL del webhook
 * (supabase/functions/whatsapp-webhook/index.ts). Si se modifica el bot, actualizar aquí también.
 * Versión del árbol: BOT_TREE_VERSION (subir el número cuando cambie la estructura de fábrica).
 */

export const BOT_TREE_VERSION = 2;

export const BOT_TREE_CATEGORIES = {
    inicio: { label: 'Inicio y Saludo', color: '#0284C7', bg: '#E0F2FE', border: '#BAE6FD' },
    turnos: { label: 'Turnos Médicos (SALUS)', color: '#059669', bg: '#DCFCE7', border: '#A7F3D0' },
    gestion: { label: 'Cancelar / Reprogramar', color: '#EA580C', bg: '#FFEDD5', border: '#FED7AA' },
    admision: { label: 'Admisión & Alta Ficha', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
    autorizaciones: { label: 'Autorizaciones', color: '#0891B2', bg: '#CFFAFE', border: '#A5F3FC' },
    estudios: { label: 'Informes y Estudios Web', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
    guardia: { label: 'Guardias 24 hs (Sede 01)', color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
    administracion: { label: 'Presupuestos & Aranceles', color: '#0D9488', bg: '#CCFBF1', border: '#99F6E4' },
    derivacion: { label: 'Derivación / Handoff', color: '#7C3AED', bg: '#F3E8FF', border: '#DDD6FE' },
    ia: { label: 'Motor IA Clínico (GPT-5.5)', color: '#DB2777', bg: '#FCE7F3', border: '#FBCFE8' }
};

const FOOTER = `🔙 *Volver:* Escribí *"Menú"* | 👤 *Agente:* Escribí *"Agente"*`;

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
        title: '1. Saludo Inicial y Menú Principal',
        patientTrigger: 'Saludo libre ("Hola", "Buenas tardes", "Buen día"), "Menú", "Atrás", apertura de chat o reapertura tras 15 min de inactividad',
        patientExamples: ['Hola, buenas tardes', 'Buen día', 'Menú', 'Atrás'],
        systemAction: 'Saluda por el nombre de WhatsApp del contacto (nunca por el nombre legal de SALUS) y despliega el menú de 5 opciones. "Menú"/"Atrás" reinician la gestión en cualquier punto.',
        nodeType: 'bot_response',
        botResponse: `¡Hola {nombre}! 🏥 Te damos la bienvenida a *Sanatorio Argentino*.

¿En qué podemos ayudarte hoy? Por favor seleccioná una opción:

1️⃣ *Solicitar un nuevo turno médico* 🩺
2️⃣ *Consultar mi próximo turno o visita agendada* 📅
3️⃣ *Autorizaciones y órdenes médicas* 📋
4️⃣ *Guardia médica 24 horas y urgencias* 🚨
5️⃣ *Hablar con un agente* 👤 _(Lun a Vie 7:30 a 21 hs, Sáb 8 a 12 hs)_

Podés responder con el número (*1*, *2*, *3*, *4* o *5*) o escribirnos tu consulta.
💡 _Si en cualquier momento deseás volver, escribí *"Menú"* o *"Atrás"*._`,
        availableTags: ['{bot_name}', '{nombre}'],
        childrenIds: ['nodo_turnos_triage', 'nodo_mis_turnos', 'nodo_autorizaciones', 'nodo_guardia_24hs', 'nodo_operador_handoff', 'nodo_estudios_menu', 'nodo_presupuestos', 'nodo_consulta_libre']
    },

    // -------------------------------------------------------------
    // OPCIÓN 1: SOLICITUD DE NUEVO TURNO (TRIAGE DE IDENTIDAD)
    // -------------------------------------------------------------
    {
        id: 'nodo_turnos_triage',
        parentId: 'root_saludo',
        level: 2,
        order: 1,
        category: 'turnos',
        title: '2. Solicitud de Nuevo Turno (Opción 1)',
        patientTrigger: 'Paciente solicita agendar ("1", "Quiero un turno", "Turno con el Dr. X", "Ginecología", "Pediatría")',
        patientExamples: ['1', 'Quiero un turno', 'Necesito turno para ginecología', 'Turno con el Dr. Martínez'],
        systemAction: 'Detecta profesional/especialidad en el mensaje, valida el DNI contra hospital_pacientes (SALUS) y define el camino: paciente registrado o paciente nuevo. Si hay homónimos pregunta con opciones a-, b-, c-.',
        nodeType: 'decision',
        botResponse: `¡Hola! 🏥 Te ayudamos a coordinar tu nuevo turno médico.

Por favor indícanos:
• Número de *DNI del paciente* (sin puntos ni espacios)
• ¿Con qué *profesional* o para qué *especialidad médica* solicitás la atención?
• ¿El turno es para vos o para un familiar / otra persona?
• Preferencia de *días y horarios* (mañana o tarde)
• *Obra Social / Prepaga* y plan (o si tu atención será Particular)

${FOOTER}`,
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
        patientTrigger: 'DNI validado con ficha existente en hospital_pacientes',
        patientExamples: ['28475561', 'Mi DNI es 30123456, turno con cardiología'],
        systemAction: 'Muestra la obra social registrada en la ficha para que la confirme y completa los datos faltantes (especialidad, para quién, preferencia horaria).',
        nodeType: 'bot_response',
        botResponse: `¡Hola {nombre}! 🏥 Te ayudamos a coordinar tu nuevo turno médico.

Por favor indícanos:
• *DNI:* En tu ficha figura *{dni}* (si el turno es para otra persona, indícanos su DNI, Nombre y Apellido)
• ¿Con qué *profesional* o para qué *especialidad médica* solicitás la atención?
• ¿El turno es para vos o para un familiar / otra persona?
• Preferencia de *días y horarios* (mañana o tarde)
• *Obra Social y Plan:* En tu ficha figura *{cobertura}*. Confirmános si seguís teniendo cobertura allí y qué *plan* tenés.

${FOOTER}`,
        availableTags: ['{nombre}', '{dni}', '{cobertura}', '{bot_name}'],
        childrenIds: ['nodo_turno_derivado']
    },

    // 2.A.1 DATOS COMPLETOS -> DERIVACIÓN PARA AGENDAR
    {
        id: 'nodo_turno_derivado',
        parentId: 'nodo_camino_1_registrado',
        level: 4,
        order: 1,
        category: 'turnos',
        title: '2.A.1 Datos Completos → Agente agenda en SALUS',
        patientTrigger: 'Paciente completa especialidad/profesional, preferencia horaria y cobertura',
        patientExamples: ['Para mí, con la Dra. Gómez, a la tarde, OSDE 210'],
        systemAction: 'El bot NO ofrece horarios: registra datos y preferencias, arma el resumen de triage y deriva a la cola de agentes (sin_asignar). El agente agenda el turno en SALUS y confirma por el chat.',
        nodeType: 'bot_response',
        botResponse: `¡Muchas gracias {nombre}! 🏥 Ya registramos todos tus datos y preferencias para coordinar tu turno.

Un agente del equipo de Sanatorio Argentino agendará tu turno en nuestro sistema institucional y te confirmará los detalles a la brevedad.

[Aviso de derivación según cola / horario]`,
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
        patientTrigger: 'DNI no encontrado en SALUS / Paciente sin ficha previa',
        patientExamples: ['35123987', 'No tengo ficha todavía', 'Es mi primera vez en el Sanatorio'],
        systemAction: 'Solicita ÚNICAMENTE los datos obligatorios que falten para la pre-alta. El nombre se exige como Nombre y Apellido (mínimo 2 palabras): un nombre de pila solo se vuelve a pedir.',
        nodeType: 'bot_response',
        botResponse: `Constatamos que *no registrás una ficha previa de paciente en Sanatorio Argentino*.

Para poder abrir tu ficha de paciente en nuestro sistema institucional y coordinar tu atención, necesitamos los siguientes datos obligatorios de admisión:

1️⃣ *Nombre y Apellido* (tal como figuran en tu DNI)
2️⃣ *Número de DNI* (solo números, sin puntos ni espacios)
3️⃣ *Fecha de Nacimiento* (DD/MM/AAAA) o *Edad*
4️⃣ *Obra Social / Prepaga y Plan* (o aclará "Particular" si no poseés cobertura médica)
5️⃣ *Departamento / Localidad de residencia en San Juan* (ej: Capital, Rivadavia, Rawson, Santa Lucía, Chimbas, Pocito, Caucete, etc.)`,
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
        title: '2.B.1 Recepción de Datos y Pre-Alta en SALUS',
        patientTrigger: 'Paciente envía los datos solicitados (en uno o varios mensajes)',
        patientExamples: ['Juan Pérez, DNI 35123987, 12/04/1990, OSDE 210, Rawson'],
        systemAction: 'Extrae los datos con IA, valida completitud, pre-registra al paciente en hospital_pacientes y deriva a un agente con el resumen de admisión.',
        nodeType: 'bot_response',
        botResponse: `¡Muchas gracias! Registramos tus datos de admisión 🏥.
Un agente completará tu ficha en el sistema y continuará con la gestión solicitada a la brevedad.`,
        availableTags: ['{bot_name}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // OPCIÓN 2: CONSULTA DE TURNOS AGENDADOS
    // -------------------------------------------------------------
    {
        id: 'nodo_mis_turnos',
        parentId: 'root_saludo',
        level: 2,
        order: 2,
        category: 'turnos',
        title: '3. Consulta de Turnos Agendados (Opción 2)',
        patientTrigger: 'Paciente consulta turnos ("2", "Mis turnos", "¿Cuándo tengo turno?")',
        patientExamples: ['2', 'Mis turnos', '¿A qué hora tengo el turno?', 'Turno de mi hijo, DNI 50123456'],
        systemAction: 'Pide el DNI si no lo tiene y consulta buscar_turnos_proximos (SALUS + turnos online). Permite consultar por un familiar escribiendo su DNI.',
        nodeType: 'bot_response',
        botResponse: `¡Hola {nombre}! 🏥 Encontramos tu próxima cita agendada en *Sanatorio Argentino*:

{turnos}

ℹ️ *Recomendación:* Recordar presentarse 15 minutos antes con el DNI físico y credencial de la obra social o cobertura médica.

¿Deseás *confirmar la asistencia*, *reprogramar* o *cancelar* algún turno?

💡 *¿Consultás por el turno de otro paciente o familiar?* Indícanos su número de *DNI*.`,
        availableTags: ['{nombre}', '{dni}', '{turnos}'],
        childrenIds: ['nodo_turno_confirmado', 'nodo_gestion_identificacion']
    },

    // 3.A CONFIRMACIÓN DE ASISTENCIA
    {
        id: 'nodo_turno_confirmado',
        parentId: 'nodo_mis_turnos',
        level: 3,
        order: 1,
        category: 'turnos',
        title: '3.A Confirmación de Asistencia',
        patientTrigger: 'Paciente confirma ("Sí", "Confirmo", "Voy a ir")',
        patientExamples: ['Confirmo', 'Sí, voy a ir'],
        systemAction: 'Registra la confirmación y deriva a un agente para dejarla asentada.',
        nodeType: 'bot_response',
        botResponse: `¡Muchas gracias {nombre}! ✅ Registramos tu confirmación del turno.

[Aviso de derivación según cola / horario]`,
        availableTags: ['{nombre}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // 3.B GESTIÓN DE TURNOS: CANCELAR / REPROGRAMAR
    // -------------------------------------------------------------
    {
        id: 'nodo_gestion_identificacion',
        parentId: 'nodo_mis_turnos',
        level: 3,
        order: 2,
        category: 'gestion',
        title: '3.B Cancelar o Reprogramar: Identificación',
        patientTrigger: 'Paciente pide cancelar o reprogramar en cualquier momento ("Quiero cancelar mi turno", "No voy a poder ir", "Quiero reprogramar", "Cambiar el turno"). Tras consultar turnos también vale "cancelar" u "otro día" sueltos.',
        patientExamples: ['Quiero cancelar mi turno', 'No voy a poder ir al turno de mañana', 'Quiero reprogramar', 'Necesito cambiar el turno'],
        systemAction: 'El bot SOLO registra la solicitud: la baja / reprogramación en SALUS la realiza un agente. Pide el DNI si no lo tiene (admite DNI de un familiar) y busca los turnos próximos. Sin límite de anticipación y para todas las agendas.',
        nodeType: 'decision',
        botResponse: `Para cancelar tu turno necesitamos el *DNI del paciente* (solo números, sin puntos). 🪪

Si el turno es de un familiar, escribí el DNI de esa persona.

${FOOTER}`,
        availableTags: ['{nombre}', '{dni}'],
        childrenIds: ['nodo_gestion_sin_turnos', 'nodo_gestion_seleccion']
    },

    // 3.B.1 SIN TURNOS
    {
        id: 'nodo_gestion_sin_turnos',
        parentId: 'nodo_gestion_identificacion',
        level: 4,
        order: 1,
        category: 'gestion',
        title: '3.B.1 Sin Turnos Próximos',
        patientTrigger: 'El DNI no tiene turnos próximos agendados',
        patientExamples: ['30111222 (sin turnos)'],
        systemAction: 'Informa que no hay turnos y permite reintentar con otro DNI o ir al menú para pedir un turno nuevo.',
        nodeType: 'bot_response',
        botResponse: `No encontramos turnos próximos agendados para el DNI *{dni}*. 🔎

Es posible que el turno ya haya sido dado de baja o que esté a nombre de otro paciente.

• Si es de otro paciente o familiar, escribí su *DNI*.
• Para solicitar un turno nuevo, escribí *"Menú"* y elegí la opción 1.

${FOOTER}`,
        availableTags: ['{dni}'],
        childrenIds: []
    },

    // 3.B.2 SELECCIÓN DE TURNO
    {
        id: 'nodo_gestion_seleccion',
        parentId: 'nodo_gestion_identificacion',
        level: 4,
        order: 2,
        category: 'gestion',
        title: '3.B.2 Selección del Turno',
        patientTrigger: 'El paciente tiene 2 o más turnos (con 1 solo turno se selecciona automáticamente)',
        patientExamples: ['1', '1 y 3', 'Todos', 'El del Dr. Pérez'],
        systemAction: 'Lista los turnos numerados (hasta 8). Acepta número, varios números, "Todos", apellido del profesional u horario. "Ninguno" cierra sin cambios. Tras 2 respuestas no interpretadas deriva a un agente.',
        nodeType: 'bot_response',
        botResponse: `Encontramos *3 turnos* próximos de *{nombre}*:

*1)* Lun 12/10 – 09:00 hs – Dr. Pérez (Cardiología)
*2)* Lun 12/10 – 10:30 hs – Dra. Gómez (Laboratorio)
*3)* Jue 15/10 – 16:00 hs – Dr. Ruiz (Traumatología)

¿Cuál querés *cancelar*? Respondé con el número (podés indicar varios, ej.: *1 y 3*) o escribí *Todos*.

💡 Si es de otro paciente, escribí su *DNI*.`,
        availableTags: ['{nombre}'],
        childrenIds: ['nodo_cancelar_confirmacion', 'nodo_reprogramar_preferencia']
    },

    // 3.B.3 CANCELACIÓN: CONFIRMACIÓN
    {
        id: 'nodo_cancelar_confirmacion',
        parentId: 'nodo_gestion_seleccion',
        level: 5,
        order: 1,
        category: 'gestion',
        title: '3.B.3 Cancelar: Confirmación Sí / No',
        patientTrigger: 'Turno/s seleccionado/s con acción "cancelar"',
        patientExamples: ['Sí', 'No', 'Mejor reprogramalo'],
        systemAction: 'Pide confirmación explícita. No se solicita motivo de cancelación. Si el paciente cambia de idea ("mejor reprogramalo") pasa al flujo de reprogramación sin repreguntar datos.',
        nodeType: 'bot_response',
        botResponse: `Turno seleccionado:

📅 Lun 12/10 – 09:00 hs – Dr. Pérez (Cardiología)

¿Confirmás que querés *cancelar* este turno? Respondé *Sí* o *No*.`,
        availableTags: ['{nombre}'],
        childrenIds: ['nodo_cancelar_registrada', 'nodo_cancelar_mantiene']
    },

    // 3.B.3.a CANCELACIÓN REGISTRADA
    {
        id: 'nodo_cancelar_registrada',
        parentId: 'nodo_cancelar_confirmacion',
        level: 6,
        order: 1,
        category: 'gestion',
        title: '3.B.3.a Cancelación Registrada → Agente',
        patientTrigger: 'Paciente confirma ("Sí", "Dale", "Cancelalo", "No voy a poder ir")',
        patientExamples: ['Sí', 'Dale, cancelalo'],
        systemAction: 'Cierra la consulta y deriva (sin_asignar) con motivo estructurado: CANCELAR TURNO | Paciente (DNI) | fecha – hora – profesional [ID]. El agente da de baja en SALUS y confirma por el chat.',
        nodeType: 'bot_response',
        botResponse: `✅ Listo {nombre}, registramos tu solicitud de *cancelación*:

📅 Lun 12/10 – 09:00 hs – Dr. Pérez (Cardiología)

Un agente dará de baja el turno en el sistema y te confirmará por este medio. Si además necesitás un *nuevo turno*, podés indicárselo en este mismo chat.

¡Gracias por avisarnos! Liberar el turno permite que otro paciente pueda atenderse. 🏥

[Aviso de derivación según cola / horario]`,
        availableTags: ['{nombre}'],
        childrenIds: []
    },

    // 3.B.3.b PACIENTE MANTIENE EL TURNO
    {
        id: 'nodo_cancelar_mantiene',
        parentId: 'nodo_cancelar_confirmacion',
        level: 6,
        order: 2,
        category: 'gestion',
        title: '3.B.3.b Paciente Mantiene el Turno',
        patientTrigger: 'Paciente responde "No" / "Mejor no" / "Lo mantengo"',
        patientExamples: ['No', 'Mejor no, lo mantengo'],
        systemAction: 'No deriva: el bot cierra la gestión y queda activo para otra consulta.',
        nodeType: 'bot_response',
        botResponse: `Perfecto {nombre}, *no realizamos cambios*: tu turno se mantiene. 👍

📅 Lun 12/10 – 09:00 hs – Dr. Pérez (Cardiología)

ℹ️ Recordá presentarte 15 minutos antes con tu DNI y credencial de la obra social.

Si necesitás otra cosa, escribí *"Menú"*.`,
        availableTags: ['{nombre}'],
        childrenIds: []
    },

    // 3.B.4 REPROGRAMACIÓN: PREFERENCIA
    {
        id: 'nodo_reprogramar_preferencia',
        parentId: 'nodo_gestion_seleccion',
        level: 5,
        order: 2,
        category: 'gestion',
        title: '3.B.4 Reprogramar: Preferencia de Días/Horarios',
        patientTrigger: 'Turno/s seleccionado/s con acción "reprogramar"',
        patientExamples: ['2', 'Martes o jueves por la tarde', 'Lo antes posible'],
        systemAction: 'Recolecta la preferencia (texto libre u opción 1-4) ANTES de derivar. El bot no muestra disponibilidad de agenda.',
        nodeType: 'bot_response',
        botResponse: `Turno seleccionado:

📅 Lun 12/10 – 09:00 hs – Dr. Pérez (Cardiología)

¿Qué días u horarios te quedan mejor para el nuevo turno? Podés escribirlo libremente (ej.: *"martes o jueves por la tarde"*) o elegir una opción:

1️⃣ Lo antes posible
2️⃣ Por la mañana
3️⃣ Por la tarde
4️⃣ La semana próxima`,
        availableTags: ['{nombre}'],
        childrenIds: ['nodo_reprogramar_profesional']
    },

    // 3.B.5 REPROGRAMACIÓN: PROFESIONAL
    {
        id: 'nodo_reprogramar_profesional',
        parentId: 'nodo_reprogramar_preferencia',
        level: 6,
        order: 1,
        category: 'gestion',
        title: '3.B.5 Reprogramar: ¿Mismo Profesional?',
        patientTrigger: 'Paciente indicó su preferencia de días/horarios',
        patientExamples: ['1', 'Sí, el mismo', 'Me da igual'],
        systemAction: 'Consulta si mantiene el profesional o acepta cualquiera de la especialidad.',
        nodeType: 'bot_response',
        botResponse: `¿Querés mantener al profesional *Dr. Pérez*?

1️⃣ Sí, mismo profesional
2️⃣ Me da igual, cualquiera de la especialidad`,
        availableTags: ['{nombre}'],
        childrenIds: ['nodo_reprogramar_registrada']
    },

    // 3.B.6 REPROGRAMACIÓN REGISTRADA
    {
        id: 'nodo_reprogramar_registrada',
        parentId: 'nodo_reprogramar_profesional',
        level: 7,
        order: 1,
        category: 'gestion',
        title: '3.B.6 Reprogramación Registrada → Agente',
        patientTrigger: 'Paciente elige profesional',
        patientExamples: ['1'],
        systemAction: 'Muestra resumen y deriva (sin_asignar) con motivo estructurado: REPROGRAMAR TURNO | Paciente (DNI) | turno [ID] | Preferencia | Profesional. El agente busca disponibilidad y propone opciones por el chat.',
        nodeType: 'bot_response',
        botResponse: `📋 Listo {nombre}, registramos tu solicitud de *reprogramación*:

📅 Lun 12/10 – 09:00 hs – Dr. Pérez (Cardiología)
🗓️ *Preferencia:* Por la tarde
👨‍⚕️ *Profesional:* Mismo profesional

Un agente buscará disponibilidad y te propondrá las nuevas opciones por este medio.

[Aviso de derivación según cola / horario]`,
        availableTags: ['{nombre}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // OPCIÓN 3: AUTORIZACIONES Y ÓRDENES MÉDICAS
    // -------------------------------------------------------------
    {
        id: 'nodo_autorizaciones',
        parentId: 'root_saludo',
        level: 2,
        order: 3,
        category: 'autorizaciones',
        title: '4. Autorizaciones y Órdenes Médicas (Opción 3)',
        patientTrigger: 'Paciente solicita autorizar una orden ("3", "Autorizar orden", "Autorización de estudio")',
        patientExamples: ['3', 'Necesito autorizar una orden', 'Autorización para una resonancia'],
        systemAction: 'Solicita titular, DNI, Nombre y Apellido, cobertura y la foto de la orden. Nunca asume que una imagen previa es la orden. Paciente nuevo: pasa por los datos de admisión.',
        nodeType: 'bot_response',
        botResponse: `¡Hola {nombre}! 🏥 Te ayudamos con la *autorización* de tu orden médica.

Por favor indícanos:
• ¿La orden médica es a tu nombre, o de otro paciente/familiar?
• *DNI*, *Nombre y Apellido* del paciente titular de la orden médica.
• *Obra Social o Prepaga* y qué *plan* posee (o si es Particular).
• 📸 Envianos la *foto clara y legible de la orden médica* que deseás autorizar.

*(Vigencia de órdenes médicas: 30 días corridos).*`,
        availableTags: ['{nombre}', '{cobertura}'],
        childrenIds: ['nodo_autorizacion_recibida']
    },

    {
        id: 'nodo_autorizacion_recibida',
        parentId: 'nodo_autorizaciones',
        level: 3,
        order: 1,
        category: 'autorizaciones',
        title: '4.A Foto de Orden Recibida → Agente',
        patientTrigger: 'Paciente envía la foto de la orden médica',
        patientExamples: ['[imagen de la orden]', 'Es la foto anterior'],
        systemAction: 'Deriva al equipo de autorizaciones (sin_asignar) con el resumen del trámite.',
        nodeType: 'bot_response',
        botResponse: `¡Muchas gracias {nombre}! 📄 Recibimos la foto de tu orden médica para autorizar.

Un asesor de nuestro equipo de autorizaciones revisará la orden con tu obra social/prepaga y te confirmará la gestión a la brevedad.`,
        availableTags: ['{nombre}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // OPCIÓN 4: GUARDIAS Y URGENCIAS 24 HORAS
    // -------------------------------------------------------------
    {
        id: 'nodo_guardia_24hs',
        parentId: 'root_saludo',
        level: 2,
        order: 4,
        category: 'guardia',
        title: '5. Guardias y Urgencias 24 Horas (Opción 4)',
        patientTrigger: 'Paciente menciona urgencia ("4", "Guardia", "Urgencia", "Emergencia")',
        patientExamples: ['4', 'Tengo una urgencia', '¿Hay guardia pediátrica?', '¿Dónde está la guardia?'],
        systemAction: 'Informa que la guardia funciona las 24 hs ÚNICAMENTE en Sede 01 (San Luis 432 Oeste) y las especialidades disponibles.',
        nodeType: 'bot_response',
        botResponse: `🚨 *Guardias Médicas las 24 Horas — Sanatorio Argentino*

Contamos con un servicio permanente de guardia médica activa las 24 horas, todos los días del año, por orden de llegada con triage de urgencia en nuestra *SEDE 01*:

📍 *Lugar de atención:* San Luis 432 Oeste, Capital, San Juan.

🩺 *Especialidades disponibles de guardia:*
• *Clínica Médica Adultos*
• *Pediatría*
• *Ginecología y Obstetricia*
• *Cardiología*
• *Traumatología* (Guardia pasiva especializada)
• *Cirugía General* (Guardia pasiva especializada)
• *Urología* (Guardia pasiva especializada)`,
        availableTags: ['{bot_name}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // OPCIÓN 5: DERIVACIÓN A AGENTE HUMANO (HANDOFF)
    // -------------------------------------------------------------
    {
        id: 'nodo_operador_handoff',
        parentId: 'root_saludo',
        level: 2,
        order: 5,
        category: 'derivacion',
        title: '6. Derivación a Agente Humano (Opción 5)',
        patientTrigger: 'Paciente pide una persona ("5", "Agente", "Asesor", "Operador") o el bot no logra interpretar sus respuestas',
        patientExamples: ['5', 'Quiero hablar con una persona', 'Agente'],
        systemAction: 'Pasa el chat a la cola (sin_asignar), pausa el bot y elige el mensaje según horario y cantidad de chats en espera. Mientras espera, avisa demoras cada 20 min.',
        nodeType: 'decision',
        botResponse: `Evaluando disponibilidad de agentes y tiempo de espera en cola...`,
        availableTags: ['{bot_name}'],
        childrenIds: ['nodo_handoff_normal', 'nodo_handoff_delay', 'nodo_handoff_fuera_horario']
    },

    // 6.A HANDOFF NORMAL
    {
        id: 'nodo_handoff_normal',
        parentId: 'nodo_operador_handoff',
        level: 3,
        order: 1,
        category: 'derivacion',
        title: '6.A Cola Normal (< Umbral de espera)',
        patientTrigger: 'Cola de espera menor al umbral configurado (ej: < 5 chats)',
        patientExamples: ['Flujo de atención dentro del tiempo esperado'],
        systemAction: 'Transfiere el chat a la cola de agentes (sin_asignar) y pone al bot en pausa.',
        nodeType: 'bot_response',
        botResponse: `👩‍⚕️ Un agente te responderá a la brevedad.
⏰ *Horario de atención:* Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.

💡 _Si deseás volver a consultar con el asistente virtual en cualquier momento, escribí *"Menú"*._`,
        availableTags: ['{nombre}'],
        childrenIds: []
    },

    // 6.B HANDOFF ALTA DEMANDA (DEMORAS)
    {
        id: 'nodo_handoff_delay',
        parentId: 'nodo_operador_handoff',
        level: 3,
        order: 2,
        category: 'derivacion',
        title: '6.B Alta Demanda / Demoras en Cola (>= Umbral)',
        patientTrigger: 'Cola de espera supera el umbral configurado',
        patientExamples: ['Cola con alta saturación en horas pico'],
        systemAction: 'Envía aviso empático de demoras y detalla el horario oficial de atención.',
        nodeType: 'bot_response',
        botResponse: `⚠️ En este momento estamos experimentando una alta demanda en nuestro canal de atención y presentamos algunas demoras. Un asesor te responderá a la brevedad por orden de llegada.

📲 *Gestión de Turnos Online:*
Si deseás solicitar o gestionar un turno médico de forma inmediata sin esperar, podés hacerlo desde la página web del Sanatorio:
👉 https://www.sanatorioargentino.com.ar/turnos-online.html

⏰ *Horario de atención:* Lunes a Viernes de 7:30 a 21:00 hs y Sábados de 8:00 a 12:00 hs.

💡 _Si deseás volver a consultar con el asistente virtual en cualquier momento, escribí *"Menú"*._`,
        availableTags: ['{bot_name}'],
        childrenIds: []
    },

    // 6.C HANDOFF FUERA DE HORARIO
    {
        id: 'nodo_handoff_fuera_horario',
        parentId: 'nodo_operador_handoff',
        level: 3,
        order: 3,
        category: 'derivacion',
        title: '6.C Fuera de Horario de Atención',
        patientTrigger: 'Paciente escribe fuera de la franja (Lun-Vie fuera de 7:30-21 hs, Sáb fuera de 8-12 hs, Domingos y feriados)',
        patientExamples: ['Mensaje a las 23:00 hs o Domingo por la tarde'],
        systemAction: 'Registra el mensaje y notifica cuándo se retoma la atención (máximo un aviso por hora).',
        nodeType: 'bot_response',
        botResponse: `¡Hola! 🏥 Te informamos que en este momento nuestro equipo de atención se encuentra *fuera del horario laboral*.

⏰ *Nuestros horarios de atención son:*
• *Lunes a Viernes:* 7:30 a 21:00 hs
• *Sábados:* 8:00 a 12:00 hs
_(Domingos y Feriados cerrado)_

Tu mensaje quedó registrado y un asesor te responderá en nuestro horario habitual.

📲 *Gestión de Turnos Online 24 hs:*
Recordá que desde la página web de Sanatorio Argentino también podés autogestionar tu turno médico en cualquier momento ingresando en:
👉 https://www.sanatorioargentino.com.ar/turnos-online.html

🚨 *Guardia Médica 24 hs:* Si presentás una urgencia, recordá que nuestra Guardia en Sede Central (San Luis 432 Oeste) atiende las *24 horas*.`,
        availableTags: ['{bot_name}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // CONSULTAS POR TEXTO LIBRE (FUERA DEL MENÚ NUMÉRICO)
    // -------------------------------------------------------------
    {
        id: 'nodo_estudios_menu',
        parentId: 'root_saludo',
        level: 2,
        order: 6,
        category: 'estudios',
        title: '7. Informes y Resultados de Estudios',
        patientTrigger: 'Paciente consulta por resultados ("Informes", "Resultados", "Laboratorio", "Ecografía", "Biopsia")',
        patientExamples: ['Quiero ver mis estudios', 'Resultados de laboratorio', 'Informe de ecografía'],
        systemAction: 'Orienta a la plataforma de descarga correspondiente según el tipo de estudio.',
        nodeType: 'bot_response',
        botResponse: `Para consultar o descargar tus estudios médicos, por favor elegí la opción que corresponda:

🔬 *Laboratorio Online (Glims)*: Análisis de sangre, orina y cultivos.
🩻 *Diagnóstico por Imágenes (Portal ITS)*: Radiografías, ecografías, tomografías y resonancias.
📋 *Anatomía Patológica*: Biopsias, PAP (papanicolau) y estudios histológicos.`,
        availableTags: ['{bot_name}', '{nombre}'],
        childrenIds: ['nodo_estudio_lab', 'nodo_estudio_imagenes', 'nodo_estudio_patologia']
    },

    // 7.A LABORATORIO GLIMS
    {
        id: 'nodo_estudio_lab',
        parentId: 'nodo_estudios_menu',
        level: 3,
        order: 1,
        category: 'estudios',
        title: '7.A Portal Laboratorio Online (Glims)',
        patientTrigger: 'Paciente consulta por Laboratorio ("Laboratorio", "Análisis")',
        patientExamples: ['Laboratorio', 'Quiero mis análisis'],
        systemAction: 'Entrega URL y pautas de acceso al portal Glims con protocolo y DNI.',
        nodeType: 'bot_response',
        botResponse: `Podés descargar tus resultados de análisis clínicos desde nuestro portal online ingresando tu DNI y el código de protocolo impreso en tu comprobante de atención:
🌐 https://sanatorioargentino.com.ar/laboratorio-online

Si no recordás tu número de orden o protocolo, dejanos tu DNI y te ayudamos a recuperarlo.`,
        availableTags: ['{dni}'],
        childrenIds: []
    },

    // 7.B DIAGNÓSTICO POR IMÁGENES ITS
    {
        id: 'nodo_estudio_imagenes',
        parentId: 'nodo_estudios_menu',
        level: 3,
        order: 2,
        category: 'estudios',
        title: '7.B Portal Diagnóstico por Imágenes (ITS)',
        patientTrigger: 'Paciente consulta por Imágenes ("Rayos X", "Tomografía", "Ecografía", "Resonancia")',
        patientExamples: ['Imágenes', 'Ecografía', 'Tomografía'],
        systemAction: 'Entrega URL y credenciales de acceso al portal ITS.',
        nodeType: 'bot_response',
        botResponse: `Tus estudios de imágenes (Rayos X, Tomografía, Ecografía, Mamografía, Densitometría) están disponibles en el portal web ITS:
🌐 https://portal.sanatorioargentino.com.ar

Tu usuario es tu DNI y la contraseña te fue entregada en el comprobante al momento de realizar la práctica.`,
        availableTags: ['{dni}'],
        childrenIds: []
    },

    // 7.C ANATOMÍA PATOLÓGICA Y BIOPSIAS
    {
        id: 'nodo_estudio_patologia',
        parentId: 'nodo_estudios_menu',
        level: 3,
        order: 3,
        category: 'estudios',
        title: '7.C Anatomía Patológica (PAP y Biopsias)',
        patientTrigger: 'Paciente consulta por PAP o biopsia ("PAP", "Biopsia", "Papanicolau")',
        patientExamples: ['Biopsia', 'Resultado de PAP'],
        systemAction: 'Informa plazo de 10 a 15 días hábiles para procesamiento histopatológico.',
        nodeType: 'bot_response',
        botResponse: `Los informes de biopsias y citologías (PAP) tienen un tiempo de procesamiento histopatológico de *10 a 15 días hábiles*.
Si ya transcurrió dicho plazo desde la toma de muestra, por favor indicanos tu DNI para verificar el estado con secretaría de Patología.`,
        availableTags: ['{dni}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // ADMINISTRACIÓN Y PRESUPUESTOS
    // -------------------------------------------------------------
    {
        id: 'nodo_presupuestos',
        parentId: 'root_saludo',
        level: 2,
        order: 7,
        category: 'administracion',
        title: '8. Presupuestos Quirúrgicos y Aranceles',
        patientTrigger: 'Paciente solicita cotización ("Presupuesto", "Cirugía", "Costos de internación", "Aranceles")',
        patientExamples: ['Presupuesto para una cesárea', 'Cuánto cuesta una internación', 'Presupuesto de cirugía'],
        systemAction: 'Solicita foto de la orden médica con código de práctica y cobertura, y deriva al sector de Presupuestos.',
        nodeType: 'bot_response',
        botResponse: `Para cotizaciones y presupuestos de cirugías o internaciones, por favor envianos:
1. Foto legible de la orden médica o indicación quirúrgica con el código de práctica.
2. Tu Obra Social y Plan de cobertura (o si es Particular).

Te derivaremos con el sector de Presupuestos para confeccionar tu presupuesto exacto.`,
        availableTags: ['{nombre}', '{cobertura}'],
        childrenIds: []
    },

    // -------------------------------------------------------------
    // CONSULTA LIBRE CON MOTOR IA
    // -------------------------------------------------------------
    {
        id: 'nodo_consulta_libre',
        parentId: 'root_saludo',
        level: 2,
        order: 8,
        category: 'ia',
        title: '9. Consultas Libres e Información General (IA)',
        patientTrigger: 'Preguntas abiertas no cubiertas por los flujos anteriores (preparaciones, ubicación de sedes, horarios, obras sociales)',
        patientExamples: ['¿Tengo que ir en ayunas para la ecografía abdominal?', '¿Dónde queda la sede Santa Fe?', '¿Atienden OSDE?'],
        systemAction: 'Respuesta generada por el modelo de OpenAI configurado, gobernada por el System Prompt institucional. Puede derivar a un agente (transferToAgent).',
        nodeType: 'ai_engine',
        botResponse: `[Respuesta generada dinámicamente por IA: responde con empatía y precisión sin emitir diagnósticos, orientando al paciente hacia la sede o trámite correspondiente]`,
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
