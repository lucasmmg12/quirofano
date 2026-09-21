/**
 * contactCenterQuickReplies.js
 * Catálogo exclusivo de Atajos y Respuestas Rápidas para el CONTACT CENTER.
 * 
 * NOTA DE ARQUITECTURA:
 * Totalmente aislado del sistema de Control de Cirugías (ADM-QUI).
 * Optimizado para máxima velocidad y mínimo consumo de RAM con indexación O(1).
 */

import { supabase } from '../lib/supabase.js';

// Catálogo inmutable institucional precargado en memoria (0 ms latencia)
export const DEFAULT_QUICK_REPLIES = Object.freeze([
    // Saludos de agentes de Contact Center
    {
        id: 'dan',
        shortcut: 'dan',
        title: 'Saludo Daniela Aguilera',
        content: '¡Hola! Mi nombre es Daniela Aguilera de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'daguilera'
    },
    {
        id: 'dani',
        shortcut: 'dani',
        title: 'Saludo Daniela Aguilera (alt)',
        content: '¡Hola! Mi nombre es Daniela Aguilera de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'daguilera'
    },
    {
        id: 'daniela',
        shortcut: 'daniela',
        title: 'Saludo Daniela Aguilera (nombre completo)',
        content: '¡Hola! Mi nombre es Daniela Aguilera de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'daguilera'
    },
    {
        id: 'vir',
        shortcut: 'vir',
        title: 'Saludo Virginia Jacques',
        content: '¡Hola! Mi nombre es Virginia Jacques de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'vjacques'
    },
    {
        id: 'virginia',
        shortcut: 'virginia',
        title: 'Saludo Virginia Jacques (alt)',
        content: '¡Hola! Mi nombre es Virginia Jacques de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'vjacques'
    },
    {
        id: 'vic',
        shortcut: 'vic',
        title: 'Saludo Virginia Jacques (alias vic)',
        content: '¡Hola! Mi nombre es Virginia Jacques de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'vjacques'
    },
    {
        id: 'sof',
        shortcut: 'sof',
        title: 'Saludo Sofia Olivieri',
        content: '¡Hola! Mi nombre es Sofia Olivieri de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'solivier'
    },
    {
        id: 'sofi',
        shortcut: 'sofi',
        title: 'Saludo Sofia Olivieri (sofi)',
        content: '¡Hola! Mi nombre es Sofia Olivieri de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'solivier'
    },
    {
        id: 'sofia',
        shortcut: 'sofia',
        title: 'Saludo Sofia Olivieri (sofia)',
        content: '¡Hola! Mi nombre es Sofia Olivieri de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'solivier'
    },
    {
        id: 'sil',
        shortcut: 'sil',
        title: 'Saludo Sofia Olivieri (alias sil)',
        content: '¡Hola! Mi nombre es Sofia Olivieri de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'solivier'
    },
    {
        id: 'eri',
        shortcut: 'eri',
        title: 'Saludo Erica Leal',
        content: '¡Hola! Mi nombre es Erica Leal de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'eleal'
    },
    {
        id: 'erica',
        shortcut: 'erica',
        title: 'Saludo Erica Leal (alt)',
        content: '¡Hola! Mi nombre es Erica Leal de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'eleal'
    },
    {
        id: 'emi',
        shortcut: 'emi',
        title: 'Saludo Erica Leal (alias emi)',
        content: '¡Hola! Mi nombre es Erica Leal de Sanatorio Argentino, ¿en qué puedo ayudarte hoy?',
        category: 'saludo',
        agentId: 'eleal'
    },

    // Respuestas médicas de Contact Center (según panel institucional)
    {
        id: 'psiquiatras',
        shortcut: 'psiquiatras',
        title: 'Psiquiatras',
        content: '*En Sede 3 (calle San Luis 463 oeste)*\n- Dra Diaz Mariangeles: Consulta $90.000 atiende los dias miercoles, jueves y viernes\n- Dr Varea. Consulta $90.000 debe solicitar turno de manera personal en Sede 3 (calle San Luis 463 oeste)\n\n*En Sede Santa Fe (Santa Fe 263 este)*\n- Dra Vidal: Consulta $60.000 Atiende los dias martes en la mañana.',
        category: 'medicos'
    },
    {
        id: 'psi',
        shortcut: 'psi',
        title: 'Psiquiatras (corto)',
        content: '*En Sede 3 (calle San Luis 463 oeste)*\n- Dra Diaz Mariangeles: Consulta $90.000 atiende los dias miercoles, jueves y viernes\n- Dr Varea. Consulta $90.000 debe solicitar turno de manera personal en Sede 3 (calle San Luis 463 oeste)\n\n*En Sede Santa Fe (Santa Fe 263 este)*\n- Dra Vidal: Consulta $60.000 Atiende los dias martes en la mañana.',
        category: 'medicos'
    },
    {
        id: 'bosi',
        shortcut: 'bosi',
        title: 'Bosi',
        content: 'El Dr Bosi trabaja en Sede 2 (calle San Luis 433 oeste) los días miércoles de 17 a 20 hs, jueves de 9 a 12 hs y viernes de 13 a 16 hs.',
        category: 'medicos'
    },
    {
        id: 'depositolab',
        shortcut: 'depositolab',
        title: 'deposito lab',
        content: 'Su obra social requiere autorización previa en laboratorio, por lo tanto para evitar demoras en el circuito de chequeo le solicitaremos un depósito ($30.000) para realizar la extracción. Al finalizar el chequeo se verificara la autorización.',
        category: 'laboratorio'
    },
    {
        id: 'lab',
        shortcut: 'lab',
        title: 'deposito lab (corto)',
        content: 'Su obra social requiere autorización previa en laboratorio, por lo tanto para evitar demoras en el circuito de chequeo le solicitaremos un depósito ($30.000) para realizar la extracción. Al finalizar el chequeo se verificara la autorización.',
        category: 'laboratorio'
    },
    {
        id: 'despedida',
        shortcut: 'despedida',
        title: 'despedida',
        content: 'Apreciamos mucho tu tiempo y confianza. En este momento, damos por finalizada la conversación con nuestro agente. Si necesitas ayuda nuevamente, no dudes en escribirnos! ¡Gracias por elegirnos!',
        category: 'cierre'
    },
    {
        id: 'varea',
        shortcut: 'varea',
        title: 'Varea',
        content: 'Por nueva disposicion del Dr ya no se otorgan turnos por este medio. Debera solicitarlo de manera presencial por Sede 3 (calle San Luis 463 oeste). Disculpe.',
        category: 'medicos'
    },
    {
        id: 'stolsing',
        shortcut: 'stolsing',
        title: 'Stolsing Carlos',
        content: 'Para solicitar turnos con Dr Stolsing Carlos debe comunicarse al siguiente numero 2645470600 y sera atendido por su secretaria.',
        category: 'medicos'
    },
    {
        id: 'depositolabo',
        shortcut: 'depositolabo',
        title: 'Deposito Labo',
        content: 'Su obra social requiere autorizacion previa, por lo tanto para evitar demoras en el circuito de chequeo le solicitaremos un deposito ($30.000) para realizar la extraccion. Al finalizar el chequeo se verificara la autorizacion.',
        category: 'laboratorio'
    },
    {
        id: 'polisomnografia',
        shortcut: 'polisomnografia',
        title: 'polisomnografia',
        content: 'Para Polisomnografia debe comunicarse al siguiente numero 2645664252 Camila secretaria de Dr Fullana.',
        category: 'estudios'
    },
    {
        id: 'poliso',
        shortcut: 'poliso',
        title: 'polisomnografia (corto)',
        content: 'Para Polisomnografia debe comunicarse al siguiente numero 2645664252 Camila secretaria de Dr Fullana.',
        category: 'estudios'
    },
    {
        id: 'beltran',
        shortcut: 'beltran',
        title: 'Beltran',
        content: 'Si ud desea solicitar turno con la dra Beltran Ana María, debe comunicarse al 2644173996.\nLa dra no atenderá por el momento de manera presencial, si por videollamada y se coordina directamente con ella.',
        category: 'medicos'
    },
    {
        id: 'disculpas',
        shortcut: 'disculpas',
        title: 'disculpas',
        content: 'Le pedimos disculpas por las demoras, nos encontramos sin internet en el Servidor imposibilitando el envio de msj.',
        category: 'general'
    },
    {
        id: 'tiempo',
        shortcut: 'tiempo',
        title: 'tiempo',
        content: 'En caso de no recibir respuesta, cerraremos el chat en los próximos minutos.',
        category: 'cierre'
    },
    {
        id: 'campanachequeo',
        shortcut: 'campanachequeo',
        title: 'Campana chequeo',
        content: '¡Hola {{name}}! ¡Tu salud es lo primero! 🩺 En Sanatorio Argentino, te ofrecemos un Chequeo Preventivo de Salud integral para detectar factores de riesgo y orientarte en su control.\n\n¿Qué incluye?\n\n- Consulta clínica inicial\n- Análisis completos de sangre y orina\n- Consulta cardiológica y ECG\n- Ecografías (según criterio médico)\n- Radiografía de tórax\n- Densitometría ósea y mamografía (según indicación)\n- Consulta clínica final con recomendaciones personalizadas y derivación a especialistas si es necesario.\n\n¿Cuándo? De lunes a sábados por la mañana, a partir de las 8 hs. ¡Completa tu chequeo en aproximadamente 4 horas!\n\n¿Para quién? ¡Para todos! No esperes a sentirte mal para priorizar tu bienestar.',
        category: 'chequeo'
    },
    {
        id: 'chequeo',
        shortcut: 'chequeo',
        title: 'Chequeo',
        content: '¡Hola {{name}}! 🩺 En Sanatorio Argentino, tu salud es lo primero. Te invitamos a realizar un Chequeo Preventivo de Salud integral para detectar factores de riesgo y orientarte en su control. Incluye consulta clínica, análisis de sangre y orina, consulta cardiológica, ecografías, radiografía de tórax, y más. ¡Agenda tu turno y cuida tu salud! 💙',
        category: 'chequeo'
    },
    {
        id: 'gempel',
        shortcut: 'gempel',
        title: 'sobreturno GEMPEL JP',
        content: 'En caso de necesitar SOBRETURNO, debe asistir personalmente el día de atención de su médico y consultarle a la secretaria si puede agendarse.\nDias de atencion: *Martes 12.30hs y Jueves 13.30hs* en Sede 3 (calle San Luis 463 oeste)',
        category: 'medicos'
    },
    {
        id: 'sobreturnogempel',
        shortcut: 'sobreturnogempel',
        title: 'sobreturno GEMPEL JP (alt)',
        content: 'En caso de necesitar SOBRETURNO, debe asistir personalmente el día de atención de su médico y consultarle a la secretaria si puede agendarse.\nDias de atencion: *Martes 12.30hs y Jueves 13.30hs* en Sede 3 (calle San Luis 463 oeste)',
        category: 'medicos'
    },
    {
        id: 'ecomamaria',
        shortcut: 'ecomamaria',
        title: 'ecomamaria',
        content: 'OSP autoriza la Ecografía mamaria presentando el informe de la mamografia, le parece que primero agendemos el turno de la mamografia. Y una vez que ya tenga el informe agendamos para las ecografias?',
        category: 'estudios'
    },
    {
        id: 'gastro',
        shortcut: 'gastro',
        title: 'gastro',
        content: '*En Sede 2 (calle San Luis 433 oeste)*\n\nDr. Ponce: Martes y Jueves a las 13hs\nDr. Galvarini: Martes y jueves a las 8.30hs\nDr. Arancibia: Miercoles a las 13hs\n\n*En Sede 3 (calle San Luis 463 oeste)*\n\nDr. Arancibia: Martes a las 17hs',
        category: 'medicos'
    },
    {
        id: 'sj',
        shortcut: 'sj',
        title: 'sj',
        content: 'Hola! gracias por tu contacto.\nUsted se esta comunicando a Sanatorio Argentino de la provincia de *San Juan*.',
        category: 'general'
    },
    {
        id: 'cito',
        shortcut: 'cito',
        title: 'cito',
        content: 'Usted debe comunicarse con citología al 2644552540.',
        category: 'laboratorio'
    },
    {
        id: 'sobreturno',
        shortcut: 'sobreturno',
        title: 'sobreturno',
        content: 'En caso de necesitar SOBRETURNO, debe asistir personalmente el día de atención de su médico y consultarle a la secretaria si puede agendarse.',
        category: 'general'
    },
    {
        id: 'cancelar',
        shortcut: 'cancelar',
        title: 'cancelar',
        content: 'Su turno fue cancelado, muchas gracias.',
        category: 'general'
    },
    {
        id: 'kerman',
        shortcut: 'kerman',
        title: 'kerman',
        content: 'Para solicitar turno con el Dr Kerman Javier debe comunicarse con su secretaria al 2645222005.',
        category: 'medicos'
    },
    {
        id: 'ojonoscobran',
        shortcut: 'ojonoscobran',
        title: 'Ojonoscobran',
        content: 'Hola {{name}}, soy {{agent_name}} de *Sanatorio Argentino*, gracias por contactarnos.Te escribo por tu consulta realizada {{tipo_consulta}}',
        category: 'general'
    },
    {
        id: 'neurociruj',
        shortcut: 'neurociruj',
        title: 'neurociruj',
        content: 'El Dr Jacamo es neurocirujano.\nTiene turno para . Para reservar el turno debe abonar la consulta con anticipación, el valor es de $20 mil.\npato.neuro.mp',
        category: 'medicos'
    },
    {
        id: 'prevenir',
        shortcut: 'prevenir',
        title: 'prevenir',
        content: '*Importante:*Requisitos para realizarse el Papanicolaou\n-No estar en el periodo menstrual\n-No tener relaciones sexuales 48 hs anteriores al estudio\n-No realizar duchas vaginales en el lapso de 48 hs antes\n-No aplicar ningún tratamiento medico vaginal (óvulos o cremas) durante las ultimas 48 hs\n-No tener infección vaginal.\n\nA fin de asegurarse de que los resultados de la prueba sean lo mas preciso posibles.',
        category: 'estudios'
    },
    {
        id: 'holainicial',
        shortcut: 'holainicial',
        title: 'Hola inicial',
        content: 'Hola {{name}}, soy {{agent_name}} de Sanatorio Argentino, gracias por tu contacto.Te escribo por tu consulta realizada {{tipo_consulta}}',
        category: 'saludo'
    },
    {
        id: 'hola',
        shortcut: 'hola',
        title: 'Hola inicial (alt)',
        content: 'Hola {{name}}, soy {{agent_name}} de Sanatorio Argentino, gracias por tu contacto.Te escribo por tu consulta realizada {{tipo_consulta}}',
        category: 'saludo'
    },

    // Atajos generales de Contact Center
    {
        id: 'turnos',
        shortcut: 'turnos',
        title: 'Gestión de Turnos',
        content: 'Para solicitar o reprogramar un turno, por favor indícanos el nombre del profesional o la especialidad que buscas, junto con tu franja horaria de preferencia.',
        category: 'general'
    },
    {
        id: 'autorizaciones',
        shortcut: 'autorizaciones',
        title: 'Autorizaciones y Cobertura',
        content: 'Para gestionar autorizaciones de estudios, por favor envíanos una foto nítida de la orden médica donde se observe el diagnóstico, firma y sello profesional, junto con tu DNI.',
        category: 'general'
    },
    {
        id: 'sedes',
        shortcut: 'sedes',
        title: 'Sedes y Direcciones',
        content: '*Nuestras Sedes en San Juan:*\n• Sede Central: San Luis 432 Oeste\n• Sede 2: San Luis 433 Oeste\n• Sede 3: San Luis 463 Oeste\n• Sede Santa Fe: Santa Fe 263 Este',
        category: 'general'
    },

    // Nuevas plantillas institucionales (Sedes, Especialidades, Aranceles y Circuitos)
    {
        id: 'saldivar',
        shortcut: 'saldivar',
        title: 'saldivar',
        content: 'La dra Saldivar no tiene turnos pronto, por lo general.\nEn caso de necesitar un sobreturno, es como particular, abonando 35 mil.',
        category: 'medicos'
    },
    {
        id: 'sedesf',
        shortcut: 'sedesf',
        title: 'sedesf',
        content: 'SEDE SANTA FE: Santa Fe 263 -e- Capital\nSector1\nhttps://wa.me/5492645291593\nSector2\nhttps://wa.me/5492645810760\nCitología\nhttps://wa.me/5492644552540\nLaboratorio\nhttps://wa.me/5492644609384\nDiagnóstico por Imagen\nhttps://wa.me/5492644368557',
        category: 'sedes'
    },
    {
        id: 'sede3',
        shortcut: 'sede3',
        title: 'sede3',
        content: 'SEDE 03: San Luis 463 (oeste)\n\nRecepción de consultorios\nhttps://wa.link/q1khuw',
        category: 'sedes'
    },
    {
        id: 'sede2',
        shortcut: 'sede2',
        title: 'sede2',
        content: 'SEDE 02: San Luis 433 -o- Capital\n\nRecepción de Consultorios\nhttps://wa.link/x0ov0y\nAdministración\nhttps://wa.link/4po00r\nFertilidad\nhttps://wa.link/kfqzc2\nFundación\nhttps://wa.link/iazmw0',
        category: 'sedes'
    },
    {
        id: 'sede1',
        shortcut: 'sede1',
        title: 'sede1',
        content: 'SEDE 01: San Luis 432 -o- Capital\n\nPrimer piso: Consultorios, Diagnóstico por imágen. Atención recién nacido\nhttps://wa.link/ori86c\nChequeo\nhttps://wa.link/ori86c\nLaboratorio\nhttps://wa.link/17bfdt\nRecepción internación\nhttps://wa.link/xpsjx4',
        category: 'sedes'
    },
    {
        id: 'fertilidad',
        shortcut: 'fertilidad',
        title: 'fertilidad',
        content: 'Sanatorio Argentino cuenta con un *Centro de Medicina Reproductiva*, desde este contacto le brindarán información. ✅\n\n*Centro Fertilidad:*\nhttps://wa.link/kfqzc2',
        category: 'especialidades'
    },
    {
        id: 'chequeoinfo',
        shortcut: 'chequeoinfo',
        title: 'chequeo (completo con detalles)',
        content: 'El *Chequeo Preventivo de Salud en Sanatorio Argentino* tiene como finalidad detectar e identificar los factores de riesgo y, además, orientar a las personas en el tratamiento de los mismos y su control.\nSe completa en 4 horas aprox. y la consulta clínica final se agenda en el mismo momento, incluye:\n🩺 Consulta clínica inicial.\n💉 Análisis de sangre y orina completos (Estudios de laboratorio bioquímico).\n🫀 Consulta cardiológica y ECG.\n🧖‍♀️ Ecografías (según criterio médico ecografía mamaria, abdominal, renal y vesical, tiroidea).\n☢️ Radiografía de tórax.\n📑 Según indicación del médico clínico: Densitometría Ósea y Mamografía.\nConsulta clínica final con recomendaciones personales realizadas por el médico en base a los estudios. Derivación a médico ginecólogo, urólogo, gastroenterólogo, endocrinólogo, nutricionista u otros especialistas.\nEste chequeo anual lo deben realizar todas las personas, sin relación a la presencia de malestar o síntomas de enfermedad.\n¿Desea un turno? ✅',
        category: 'chequeo'
    },
    {
        id: 'sedesantafe',
        shortcut: 'sedesantafe',
        title: 'sede santa fe',
        content: 'Sede Santa Fe (calle santa fe 263 este)',
        category: 'sedes'
    },
    {
        id: 'sede3dir',
        shortcut: 'sede3dir',
        title: 'sede3 (dirección)',
        content: 'Sede 3 (calle San Luis oeste 463)',
        category: 'sedes'
    },
    {
        id: 'sede2dir',
        shortcut: 'sede2dir',
        title: 'sede2 (dirección)',
        content: 'Sede 2 (calle San Luis oeste 433)',
        category: 'sedes'
    },
    {
        id: 'sede1dir',
        shortcut: 'sede1dir',
        title: 'sede1 (dirección)',
        content: 'Sede 1 (calle San Luis oeste 432)',
        category: 'sedes'
    },
    {
        id: 'hierro',
        shortcut: 'hierro',
        title: 'hierro',
        content: '*Gestión previa al turno:*\n1- Consultar en Administración cobertura de su obra socia para la práctica Sede 2 (calle San Luis) wsp 2644809396\n\n*Dia del turno*\n1- NO hace falta ayuno\n2- Asistir una hora antes del turno\n3- Anunciarse con el guardia de seguridad\n4- Esperar ser llamado por recepción para admisión de internación.\n5- DeBe asistir con un acompañante (mayor de edad) SIN EXCEPCIÓN\n6- En caso de no poder asistir o cancelar el turno comunicarse al 2645314479 (solo mensaje de wsp)',
        category: 'estudios'
    },
    {
        id: 'labwsps',
        shortcut: 'labwsps',
        title: 'lab (teléfonos whatsapp)',
        content: 'Comuníquese con laboratorio al WhatsApp:\n🎆 Sede santa fe 2644609384\n🎆 Sede san Luis 2644867408\nSaludos cordiales. 👉🏼',
        category: 'laboratorio'
    },
    {
        id: 'especialidad',
        shortcut: 'especialidad',
        title: 'especialidad',
        content: 'Disculpe, lamentablemente no poseemos en este momento la especialidad solicitada 😔.',
        category: 'general'
    },
    {
        id: 'eco',
        shortcut: 'eco',
        title: 'ECO (arancel)',
        content: 'Debe abonar por protocolo de la Cámara de Diagnóstico 4000',
        category: 'estudios'
    },
    {
        id: 'plus',
        shortcut: 'plus',
        title: 'PLUS (adicional médico)',
        content: 'El Dr. cobra adicional de 8000.',
        category: 'medicos'
    },
    {
        id: 'confirmo',
        shortcut: 'confirmo',
        title: 'CONFIRMO',
        content: 'Coloque CONFIRMO si acepta el mismo.',
        category: 'general'
    },
    {
        id: 'laboratoriolink',
        shortcut: 'laboratoriolink',
        title: 'laboratorio (enlace directo)',
        content: 'Sanatorio Argentino cuenta con 4 Sedes de atención los teléfonos son los siguientes, desde estos contactos le brindaran información sobre Servicios y Especialidades de cada una. ✅\n\nLaboratorio\nhttps://wa.link/17bfdt',
        category: 'laboratorio'
    },
    {
        id: 'godoymeglioli',
        shortcut: 'godoymeglioli',
        title: 'Dr. Godoy Meglioli',
        content: 'Para solicitar turno con el Dr, elegí el mejor horario ingresando al siguiente link: https://www.neocita.com/drenriquegodoymeglioli\no comunicate al 2645698113',
        category: 'medicos'
    },
    {
        id: 'godoy',
        shortcut: 'godoy',
        title: 'Dr. Godoy Meglioli (corto)',
        content: 'Para solicitar turno con el Dr, elegí el mejor horario ingresando al siguiente link: https://www.neocita.com/drenriquegodoymeglioli\no comunicate al 2645698113',
        category: 'medicos'
    },
    {
        id: 'monitoreofetal',
        shortcut: 'monitoreofetal',
        title: 'Monitoreo fetal',
        content: 'Preparación: Comer algo dulce media hora antes del estudio (chocolate, bebida cola) esto favorecerá para que el bebé se mueva mientras se realiza el estudio.',
        category: 'estudios'
    },
    {
        id: 'monitoreo',
        shortcut: 'monitoreo',
        title: 'Monitoreo fetal (corto)',
        content: 'Preparación: Comer algo dulce media hora antes del estudio (chocolate, bebida cola) esto favorecerá para que el bebé se mueva mientras se realiza el estudio.',
        category: 'estudios'
    },

    // Tercer lote institucional (Densitometría, Vacunatorio, RN, Administración, Reintegros, Turnos y Sedes)
    {
        id: 'densitometria',
        shortcut: 'densitometria',
        title: 'Densitometria',
        content: 'Preparación: Suspender suplemento de calcio (si toma) al menos 72 hs antes del estudio. Concurrir con ropa cómoda y sin metales (tachas, broches, etc)',
        category: 'estudios'
    },
    {
        id: 'densito',
        shortcut: 'densito',
        title: 'Densitometria (corto)',
        content: 'Preparación: Suspender suplemento de calcio (si toma) al menos 72 hs antes del estudio. Concurrir con ropa cómoda y sin metales (tachas, broches, etc)',
        category: 'estudios'
    },
    {
        id: 'despedidag',
        shortcut: 'despedidag',
        title: 'despedidag (con enlace encuesta)',
        content: '¡Gracias por comunicarte con el Sanatorio Argentino! 🏥\nDamos por finalizada esta conversación.\nSi nuestra atención te fue de ayuda hoy, nos sumarías un montón dejándonos 5 estrellas aquí: https://oqdslqa.s.gy/sede1 ⭐\n¡Que tengas un excelente día!',
        category: 'cierre'
    },
    {
        id: 'pendiente',
        shortcut: 'pendiente',
        title: 'pendiente',
        content: '¡Listo, su solicitud de autorización ha sido cargada correctamente! ✔️\nQuedando la misma *pendiente de auditoria.*\nEn 24/48 hs habiles 🕒 consulte si autorizaron o no su estudio por este medio o mediante la APP CIDI.\nEn el caso de que no lo autorice, de igual manera puede realizarse su estudio abonando de manera particular con posibilidad de reintegro.',
        category: 'autorizaciones'
    },
    {
        id: 'mamariados',
        shortcut: 'mamariados',
        title: 'mamaria Dos',
        content: 'Obra Social Provincia autoriza la ecografía mamaria una vez que posea el informe de su mamografía.',
        category: 'estudios'
    },
    {
        id: 'mamografia',
        shortcut: 'mamografia',
        title: 'mamografia',
        content: 'Para solicitar autorización de ecografía mamaria necesitamos que realice una *captura* del resultado de la mamografía.\n*No PDF*',
        category: 'estudios'
    },
    {
        id: 'administracion',
        shortcut: 'administracion',
        title: 'administracion',
        content: 'Comuníquese con Sede San Luis Norte sector Administración:\n📱 WhatsApp 2644809396\nO acercarse personalmente en primer piso de Sede 2 (calle San Luis 433 oeste) en horario de Lunes a Viernes para reintegros de 7hs a 16hs y para consultas generales y autorizaciones de 7hs a 20hs\nSaludos cordiales.👉🏼',
        category: 'administracion'
    },
    {
        id: 'admin',
        shortcut: 'admin',
        title: 'administracion (corto)',
        content: 'Comuníquese con Sede San Luis Norte sector Administración:\n📱 WhatsApp 2644809396\nO acercarse personalmente en primer piso de Sede 2 (calle San Luis 433 oeste) en horario de Lunes a Viernes para reintegros de 7hs a 16hs y para consultas generales y autorizaciones de 7hs a 20hs\nSaludos cordiales.👉🏼',
        category: 'administracion'
    },
    {
        id: 'rn',
        shortcut: 'rn',
        title: 'RN (Recién Nacido)',
        content: 'Se realiza de Lunes a Viernes por orden de llegada\nNEONATOLOGÍA: DE 14 A 17 HS\nOFTALMOLOGÍA (RECIÉN NACIDO HASTA 1 AÑO ): DE 14 A 15:30 HS\nOTOEMISIONES (RECIÉN NACIDO HASTA 3 AÑOS ): DE 14 A 16 HS\nCONSULTE POR AUTORIZACIONES Y OBRAS SOCIALES',
        category: 'pediatria'
    },
    {
        id: 'vacunatorio',
        shortcut: 'vacunatorio',
        title: 'vacunatorio',
        content: 'Vacunatorio: 💉\nFunciona Sede 2 - calle San Luis 433 (o)\n\nCuenta con todas las vacunas oficiales y extraoficiales;\ny se adhiere a las campañas nacionales de vacunación. Para la compra de vacunas extraoficiales se aceptan obras sociales, tarjetas de crédito y débito.\n\nHorario de atención: 🕒\nDe lunes a viernes de 7:30 a 20:30 hs y sábados de 8:30 a 12:30 hs\n\nDesde el siguiente link puedes ver y descargar\nel calendario 📅 de vacunas:\n\nhttp://www.sanatorioargentino.com.ar/uploads/calendariovacunacion2018-sanatorioargentino-4082.pdf\n\n0️⃣ Cero para volver al Menu Principal ❗',
        category: 'vacunatorio'
    },
    {
        id: 'vacunas',
        shortcut: 'vacunas',
        title: 'vacunatorio (corto)',
        content: 'Vacunatorio: 💉\nFunciona Sede 2 - calle San Luis 433 (o)\n\nCuenta con todas las vacunas oficiales y extraoficiales;\ny se adhiere a las campañas nacionales de vacunación. Para la compra de vacunas extraoficiales se aceptan obras sociales, tarjetas de crédito y débito.\n\nHorario de atención: 🕒\nDe lunes a viernes de 7:30 a 20:30 hs y sábados de 8:30 a 12:30 hs\n\nDesde el siguiente link puedes ver y descargar\nel calendario 📅 de vacunas:\n\nhttp://www.sanatorioargentino.com.ar/uploads/calendariovacunacion2018-sanatorioargentino-4082.pdf\n\n0️⃣ Cero para volver al Menu Principal ❗',
        category: 'vacunatorio'
    },
    {
        id: 'reintegros',
        shortcut: 'reintegros',
        title: 'reintegros',
        content: '▪️ *Reintegros* : 🔄\n\n*Horarios de reintegros* 🕒 :\n\n✔️De Lunes a Viernes de *8 hs a 12 hs*, debe presentarse con *comprobante de pago/factura (Requisito Obligatorio)* .\n\n⚠️ _Los Reintegros por autorizaciones pendientes, pueden demorar hasta *72 hs hábiles* para su correcta autorización._',
        category: 'administracion'
    },
    {
        id: 'reintegro',
        shortcut: 'reintegro',
        title: 'reintegros (corto)',
        content: '▪️ *Reintegros* : 🔄\n\n*Horarios de reintegros* 🕒 :\n\n✔️De Lunes a Viernes de *8 hs a 12 hs*, debe presentarse con *comprobante de pago/factura (Requisito Obligatorio)* .\n\n⚠️ _Los Reintegros por autorizaciones pendientes, pueden demorar hasta *72 hs hábiles* para su correcta autorización._',
        category: 'administracion'
    },
    {
        id: 'rx',
        shortcut: 'rx',
        title: 'RX (Rayos X)',
        content: 'Rx es por orden de llegada, guardia pasiva de 8 a 20 hs de lunes a viernes y días sábados de 8 a 12 hs',
        category: 'estudios'
    },
    {
        id: 'gineco',
        shortcut: 'gineco',
        title: 'gineco (preparación)',
        content: 'Preparación: beber 1 litro de agua en el transcurso de media hora anterior al estudio, reteniendo el líquido (no orinar)',
        category: 'estudios'
    },
    {
        id: 'pedidomedico',
        shortcut: 'pedidomedico',
        title: 'pedido medico',
        content: 'Para una mejor atención le pedimos por favor adjunte captura del pedido médico',
        category: 'general'
    },
    {
        id: 'ordenmedica',
        shortcut: 'ordenmedica',
        title: 'pedido medico (alt)',
        content: 'Para una mejor atención le pedimos por favor adjunte captura del pedido médico',
        category: 'general'
    },
    {
        id: 'abdomen',
        shortcut: 'abdomen',
        title: 'abdomen (preparación)',
        content: 'Preparación: Ayuno de 6 hs previas al estudio. Puede tomar té con poca cantidad de endulzante o agua en caso que lo desee. No ingerir nada sólido',
        category: 'estudios'
    },
    {
        id: 'hemato',
        shortcut: 'hemato',
        title: 'hemato (CELSA)',
        content: 'Es un servicio tercerizado del Sanatorio.\nDebe comunicarse con CELSA tel: 0264 422-7065 Dra Roca Maria del Rosario.\nSaludos',
        category: 'especialidades'
    },
    {
        id: 'autorizado',
        shortcut: 'autorizado',
        title: 'autorizado',
        content: 'Sus estudios fueron autorizados con éxito',
        category: 'autorizaciones'
    },
    {
        id: 'datos',
        shortcut: 'datos',
        title: 'Datos',
        content: 'Indíqueme los siguientes datos del paciente:\nDNI (sin puntos ni espacios):\nNombre y Apellido :\nObra social:\nDepartamento donde vive:\nFecha de nacimiento:',
        category: 'admision'
    },
    {
        id: 'datospaciente',
        shortcut: 'datospaciente',
        title: 'Datos (alt)',
        content: 'Indíqueme los siguientes datos del paciente:\nDNI (sin puntos ni espacios):\nNombre y Apellido :\nObra social:\nDepartamento donde vive:\nFecha de nacimiento:',
        category: 'admision'
    },
    {
        id: 'dni',
        shortcut: 'dni',
        title: 'Dni',
        content: 'Por favor indique numero de DNI del paciente sin puntos ni espacios.',
        category: 'admision'
    },
    {
        id: 'turnoasignado',
        shortcut: 'turnoasignado',
        title: 'turno asignado',
        content: 'Su turno fue asignado para el día {{fecha_turno}} con el Dr. {{medico}} en Sede {{sede}} . Lo esperamos.',
        category: 'turnos'
    },
    {
        id: 'sedescompletas',
        shortcut: 'sedescompletas',
        title: 'Sedes (completo institucional)',
        content: 'Sanatorio Argentino cuenta con 4 Sedes de atención los teléfonos son los siguientes, desde estos contactos le brindaran información sobre Servicios y Especialidades de cada una. ✅\n\nSEDE 01: San Luis 432 -o- Capital\n\nPrimer piso: Consultorios, Diagnóstico por imágen. Atención recién nacido\nhttps://wa.link/ori86c\nChequeo\nhttps://wa.link/ori86c\nLaboratorio\nhttps://wa.link/17bfdt\nRecepción internación\nhttps://wa.link/xpsjx4\n\nSEDE 02: San Luis 433 -o- Capital\n\nRecepción de Consultorios\nhttps://wa.link/x0ov0y\nAdministración\nhttps://wa.link/4po00r\nFertilidad\nhttps://wa.link/kfqzc2\nFundación\nhttps://wa.link/iazmw0\n\nSEDE 03: San Luis 463 (oeste)\n\nRecepción de consultorios\nhttps://wa.link/q1khuw\n\nSEDE SANTA FE: Santa Fe 263 -e- Capital\nSector1\nhttps://wa.me/5492645291593\nSector2\nhttps://wa.me/5492645810760\nCitología\nhttps://wa.me/5492644552540\nLaboratorio\nhttps://wa.me/5492644609384\nDiagnóstico por Imagen\nhttps://wa.me/5492644368557',
        category: 'sedes'
    }
]);

/**
 * Resuelve variables dinámicas de plantillas institucionales
 * {{name}} -> Nombre del paciente o 'Paciente'
 * {{agent_name}} -> Nombre del operador/agente activo
 * {{tipo_consulta}} -> Motivo de consulta o 'por turnos y consultas médicas'
 * {{fecha_turno}} / {{fecha turno}} -> Fecha del turno asignado
 * {{medico}} -> Nombre del médico asignado
 * {{sede}} -> Sede institucional
 */
export function interpolateQuickReplyVariables(text, context = {}) {
    if (!text) return '';
    let result = text;
    const name = context.patientName || 'Paciente';
    const agentName = context.agentName || 'Atención al Paciente';
    const queryType = context.queryType || 'por turnos y consultas médicas';
    const fechaTurno = context.fechaTurno || context.fecha_turno || '[Fecha y hora]';
    const medico = context.medico || '[Profesional]';
    const sede = context.sede || '[Sede]';

    result = result.replace(/\{\{\s*name\s*\}\}/gi, name);
    result = result.replace(/\{\{\s*agent_name\s*\}\}/gi, agentName);
    result = result.replace(/\{\{\s*tipo_consulta\s*\}\}/gi, queryType);
    result = result.replace(/\{\{\s*(?:fecha_turno|fecha\s+turno|fecha)\s*\}\}/gi, fechaTurno);
    result = result.replace(/\{\{\s*medico\s*\}\}/gi, medico);
    result = result.replace(/\{\{\s*sede\s*\}\}/gi, sede);
    return result;
}

// Mapa O(1) en memoria para coincidencia ultra veloz por comando
const SHORTCUT_MAP = new Map();
DEFAULT_QUICK_REPLIES.forEach(item => {
    SHORTCUT_MAP.set(item.shortcut.toLowerCase(), item);
});

// Cache reactivo en memoria
let cachedQuickReplies = [...DEFAULT_QUICK_REPLIES];

/**
 * Busca coincidencia exacta O(1) de atajo (ej: "dan" -> objeto Daniela)
 */
export function findQuickReplyByShortcut(cmd) {
    if (!cmd) return null;
    const cleanCmd = cmd.replace(/^\//, '').toLowerCase().trim();
    return SHORTCUT_MAP.get(cleanCmd) || null;
}

/**
 * Obtiene la lista actual de respuestas rápidas
 */
export function getContactCenterQuickReplies() {
    return cachedQuickReplies;
}

/**
 * Filtra respuestas rápidas en memoria con cero asignación pesada
 */
export function filterQuickReplies(query) {
    if (!query) return cachedQuickReplies;
    const clean = query.replace(/^\//, '').toLowerCase().trim();
    if (!clean) return cachedQuickReplies;

    return cachedQuickReplies.filter(r => 
        r.shortcut.toLowerCase().startsWith(clean) ||
        r.shortcut.toLowerCase().includes(clean) ||
        r.title.toLowerCase().includes(clean) ||
        r.content.toLowerCase().includes(clean)
    );
}

/**
 * Sincroniza en background con la tabla contact_center_quick_replies si existe
 */
export async function syncQuickRepliesFromDb() {
    try {
        const { data, error } = await supabase
            .from('contact_center_quick_replies')
            .select('*')
            .order('title', { ascending: true });

        if (!error && data && data.length > 0) {
            const mapped = data.map(d => ({
                id: String(d.id || d.shortcut),
                shortcut: d.shortcut,
                title: d.title,
                content: d.content,
                category: d.category || 'general',
                agentId: d.agent_id || null
            }));

            // Actualizar mapa O(1)
            mapped.forEach(item => {
                SHORTCUT_MAP.set(item.shortcut.toLowerCase(), item);
            });

            cachedQuickReplies = mapped;
            return mapped;
        }
    } catch (e) {
        console.warn('[QuickReplies] Fallback a respuestas en memoria estática:', e);
    }
    return cachedQuickReplies;
}
