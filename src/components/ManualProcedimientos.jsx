/**
 * ManualProcedimientos.jsx
 * Manual de Procedimientos Operativos y Guía de Uso Integral — Sistema ADM-QUI
 * Estructura Oficial del Sistema de Gestión de la Calidad (SGC) / Normas ITAES
 * Sanatorio Argentino SRL
 * 
 * Tipografía: Montserrat
 * Elaborado por: Lucas Marinero (Responsable de Innovación y Transformación Digital)
 * Revisado por: Gabriela Iragorre (Responsable Documentos SGC)
 * Aprobado por: Dr. Carlos Buteler (Director Médico)
 */

import React, { useState, useMemo } from 'react';
import {
    BookOpen, Download, Printer, Loader2, CheckCircle2, FileText,
    ArrowRight, Layers, Cpu, ShieldCheck, Activity, Users, HelpCircle,
    FileCheck2, Building, Stethoscope, AlertTriangle, Sparkles, MessageSquare,
    QrCode, Database, RefreshCw, Send, CheckSquare, Clock, Zap, CornerDownRight,
    Search, ChevronDown, ChevronRight, Bookmark, Filter, FileSpreadsheet,
    MessageCircle, Ticket, DollarSign, FolderOpen, Wrench, Receipt, ClipboardCheck,
    History, ClipboardList, PackageCheck, Microscope, Brain, Settings, AlertCircle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Metadatos Institucionales Oficiales SGC ────────────────────────────────
export const DOC_META = {
    codigo: 'ITYS 23',
    revision: '01',
    version: '1.2',
    fechaVigencia: '27/08/2026',
    estado: 'Vigente — Aprobado SGC',
    titulo: 'SISTEMA ADM-QUI — MANUAL DE PROCEDIMIENTOS OPERATIVOS Y GUÍA INTEGRAL',
    sistema: 'SISTEMA ADMINISTRACIÓN (ADM-QUI)',
    departamento: 'INNOVACIÓN Y TRANSFORMACIÓN DIGITAL',
    elaboro: 'Lucas Marinero',
    elaboroCargo: 'Responsable de Innovación y Transformación Digital',
    reviso: 'Gabriela Iragorre',
    revisoCargo: 'Responsable Documentos SGC',
    aprobo: 'Dr. Carlos Buteler',
    aproboCargo: 'Director Médico',
};

// ─── Estructura Exhaustiva de Módulos y Submódulos del Sistema ──────────────
export const SISTEMA_MODULOS = [
    {
        id: 'inicio',
        titulo: 'Módulo 1: Inicio y Dashboard Operativo',
        icono: Layers,
        color: '#1E5799',
        badge: 'General',
        resumen: 'Centro de control unificado con indicadores clave en tiempo real, accesos directos y atajo global Ctrl + K.',
        diagrama: [
            { paso: '1. Login Institucional', desc: 'Validación en Supabase con usuario o correo @sanatorioargentino.com.ar' },
            { paso: '2. Carga de Preferencias', desc: 'Lectura de user_module_preferences para mostrar módulos habilitados' },
            { paso: '3. Dashboard Dinámico', desc: 'Resumen de cirugías del día, turnos en espera y altas pendientes' },
            { paso: '4. Atajo Global [Ctrl+K]', desc: 'Apertura inmediata de la Paleta de Comandos y Asistente Beto IA' }
        ],
        submodulos: [
            {
                nombre: '1.1 Panel de Inicio y KPIs',
                procedimiento: [
                    'Ingresar a la plataforma con las credenciales asignadas.',
                    'Observar en la parte superior el resumen de actividades del día (Cirugías programadas, Pacientes en espera, Altas por auditar).',
                    'Utilizar los accesos directos a los módulos frecuentes configurados en el perfil de usuario.'
                ],
                controles: 'Botones de acceso rápido, tarjetas de KPIs numéricos, banner de novedades institucionales.',
                reglas: 'El tablero se actualiza automáticamente mediante suscripciones Realtime a la base de datos.'
            },
            {
                nombre: '1.2 Paleta de Comandos y Asistente Beto IA (Ctrl + K)',
                procedimiento: [
                    'Presionar la combinación de teclas Ctrl + K en cualquier pantalla.',
                    'Escribir la acción deseada (ej. "Ir a Altas", "Buscar Cirugía de Gómez", "¿Cuántas altas hay hoy?").',
                    'Presionar Enter para navegar de inmediato o interactuar con el asistente inteligente Beto IA.'
                ],
                controles: 'Buscador centralizado con autocompletado y acceso directo a Beto IA.',
                reglas: 'Permite navegación ágil sin necesidad de usar el ratón ni desplegar el menú lateral.'
            }
        ]
    },
    {
        id: 'gobernanza',
        titulo: 'Módulo 2: Gobernanza, Seguridad y Roles',
        icono: ShieldCheck,
        color: '#0D9488',
        badge: 'Seguridad',
        resumen: 'Administración de usuarios, asignación de permisos por perfil, reseteo de contraseñas y auditoría inmutable de actividad.',
        diagrama: [
            { paso: '1. Autenticación', desc: 'Validación de hash y estado activo en admqui_usuarios' },
            { paso: '2. Matriz de Roles', desc: 'Asignación de perfil: Admisión, Facturación, Laboratorios, Admin' },
            { paso: '3. Onboarding de Módulos', desc: 'Configuración personalizada de visibilidad de módulos por usuario' },
            { paso: '4. Activity Audit Log', desc: 'Registro inmutable de cada acción con IP, timestamp y usuario' }
        ],
        submodulos: [
            {
                nombre: '2.1 Gestión de Usuarios y Accesos (admqui_usuarios)',
                procedimiento: [
                    'Acceder a la pestaña "Usuarios" en Gobernanza.',
                    'Para dar de alta: Presionar "Nuevo Usuario", completar Nombre, Apellido, Usuario (ej. jterrera), Iniciales (JT), Correo y Contraseña inicial.',
                    'Para editar o habilitar: Localizar al usuario en la tabla y cambiar el switch de estado a Activo/Inactivo.',
                    'Para resetear contraseña: Usar la opción "Cambiar Contraseña" asignando la clave temporal (ej. 123456).'
                ],
                controles: 'Tabla de usuarios, buscador por nombre/usuario, modal de creación y modal de cambio de contraseña.',
                reglas: 'Solo los usuarios con rol Administrador pueden crear usuarios o modificar contraseñas ajenas.'
            },
            {
                nombre: '2.2 Matriz de Roles y Visibilidad de Módulos',
                procedimiento: [
                    'Seleccionar el usuario a configurar y presionar "Módulos Asignados".',
                    'Marcar los módulos que corresponden a su función operativa (ej. Facturación para analistas de internado).',
                    'Guardar los cambios. El sistema actualiza inmediatamente el menú lateral del colaborador.'
                ],
                controles: 'Checklist interactivo de módulos agrupados por área asistencial y administrativa.',
                reglas: 'Evita la sobrecarga visual y garantiza que cada área acceda estrictamente a su información pertinente.'
            },
            {
                nombre: '2.3 Bitácora Inmutable de Actividad (Activity Audit Log)',
                procedimiento: [
                    'Ingresar a la pestaña "Registro de Actividad".',
                    'Filtrar por rango de fechas, usuario específico o tipo de evento (Login, Traspaso, Devolución, Cambio de Estado).',
                    'Hacer clic en un registro para auditar los datos anteriores y posteriores a la modificación.'
                ],
                controles: 'Tabla de auditoría con orden cronológico, filtros avanzados y visor de cambios en formato JSON.',
                reglas: 'Registro de seguridad no modificable conforme a exigencias de acreditación ITAES.'
            }
        ]
    },
    {
        id: 'cirugías',
        titulo: 'Módulo 3: Control de Cirugías y Triage Quirúrgico',
        icono: Stethoscope,
        color: '#1E5799',
        badge: 'Quirófano',
        resumen: 'Gestión integral de la programación quirúrgica diaria importada de SALUS, pipeline de preparación por WhatsApp y triage de fojas con IA.',
        diagrama: [
            { paso: '1. SALUS Sync', desc: 'Importación de cirugías programadas, cirujano y quirófano' },
            { paso: '2. Pipeline WhatsApp', desc: 'Lila (Sin Mensaje) ➔ Amarillo (Revisión) ➔ Verde (Autorizada) ➔ Azul (Confirmada)' },
            { paso: '3. Recepción Paciente', desc: 'Validación presencial en Admisión y verificación de ayuno' },
            { paso: '4. Triage de Foja IA', desc: 'Escaneo de parte quirúrgico, detección de insumos y biopsias' }
        ],
        submodulos: [
            {
                nombre: '3.1 Programación Quirúrgica y Pipeline WhatsApp',
                procedimiento: [
                    'Verificar en el encabezado la fecha seleccionada y la lista de cirugías sincronizadas de SALUS.',
                    'Hacer clic en el icono de WhatsApp junto al paciente para enviar el mensaje prequirúrgico automático con los requerimientos de internación.',
                    'A medida que el paciente responde y envía órdenes autorizadas, cambiar el estado: Lila ➔ Amarillo ➔ Verde (Autorizada).',
                    'El día de la cirugía, al confirmar la presencia del paciente con ayuno cumplido, marcar en Azul (Confirmada).'
                ],
                controles: 'Selector de fecha, filtros por cirujano y especialidad, botones directos de WhatsApp, selector de estados por color.',
                reglas: 'Toda cirugía en Rojo (Suspendida/Alerta) requiere ingresar obligatoriamente el motivo de cancelación.'
            },
            {
                nombre: '3.2 Triage de Fojas Quirúrgicas con Inteligencia Artificial',
                procedimiento: [
                    'Localizar la intervención finalizada y presionar el botón "Ver Foja / Cargar Foja".',
                    'Subir el archivo PDF o fotografía nítida del parte quirúrgico firmado por cirujano y anestesiólogo.',
                    'El motor de IA analiza el texto médico y resalta automáticamente: Materiales protésicos (mallas, tornillos, suturas especiales) y Biopsias tomadas.',
                    'Cotejar visualmente los elementos detectados con el documento físico y presionar "Confirmar y Guardar".'
                ],
                controles: 'Visor de PDF/imagen, panel lateral de insumos detectados con casillas de verificación y botón de guardado.',
                reglas: 'Si se detecta toma de biopsia, el sistema notifica automáticamente al Módulo de Laboratorios.'
            },
            {
                nombre: '3.3 Reprogramación y Cirugías Suspendidas',
                procedimiento: [
                    'Si una intervención debe posponerse, abrir el modal de edición de la cirugía.',
                    'Seleccionar el estado "Suspendida" o "Reprogramada".',
                    'Elegir el motivo: Causa médica del paciente, falta de autorización de obra social, decisión del cirujano o fuerza mayor.',
                    'Asignar la nueva fecha tentativa para que el sistema emita la alerta de seguimiento en Admisión.'
                ],
                controles: 'Modal de reprogramación con selector de motivos estandarizados y nuevo calendario.',
                reglas: 'Las suspensiones alimentan el indicador mensual de eficiencia de quirófanos de Calidad SGC.'
            }
        ]
    },
    {
        id: 'turnos',
        titulo: 'Módulo 4: Cola de Turnos, Tótem y Boxes',
        icono: Ticket,
        color: '#10B981',
        badge: 'Recepción',
        resumen: 'Control de flujo presencial con tótem de autoservicio para pacientes, llamador central con voz y gestión en Boxes 1 al 8.',
        diagrama: [
            { paso: '1. Tótem Kiosco', desc: 'El paciente ingresa su DNI en pantalla táctil y retira ticket' },
            { paso: '2. Balanceo Inteligente', desc: 'Asignación automática al Box activo con menor tiempo de espera' },
            { paso: '3. Llamador Central', desc: 'Anuncio acústico (campana) y locución por voz del turno y Box' },
            { paso: '4. Atención en Box', desc: 'Recepcionista atiende, deriva o finaliza el trámite registrando tiempos' }
        ],
        submodulos: [
            {
                nombre: '4.1 Tótem de Autoservicio Kiosco (/turno)',
                procedimiento: [
                    'La pantalla táctil opera de forma autónoma en el hall central.',
                    'El paciente introduce su número de DNI utilizando el teclado numérico interactivo.',
                    'Presiona "Obtener Turno". El sistema consulta el balanceo de carga y emite el ticket impreso con letra y número.',
                    'El sistema vuelve automáticamente a la pantalla de inicio tras 8 segundos.'
                ],
                controles: 'Teclado táctil en pantalla, validador de DNI, botón de emisión de turno y reinicio automático.',
                reglas: 'El tótem opera entre las 06:30 y 20:30 hs. Durante ese horario, siempre emite turnos con balanceo de boxes.'
            },
            {
                nombre: '4.2 Pantalla Llamadora Central (/turnollamador)',
                procedimiento: [
                    'Se proyecta de manera continua en los monitores de la sala de espera.',
                    'Al presionar "Llamar Siguiente" desde cualquier Box, la pantalla reproduce una campana de atención y reproduce la locución de voz sintetizada (ej. "Turno A-12, dirigirse al Box 3").',
                    'Muestra el turno actual en tamaño gigante y el historial de los últimos 4 llamados.'
                ],
                controles: 'Visualizador de alta visibilidad, sintetizador de audio y listado lateral de turnos recientes.',
                reglas: 'No requiere intervención manual; se sincroniza por WebSocket/Realtime con Supabase.'
            },
            {
                nombre: '4.3 Gestión de Boxes de Atención (TurnoAdminPanel)',
                procedimiento: [
                    'Cada recepcionista ingresa al sistema y selecciona su Box asignado (1 al 8).',
                    'Presiona "Llamar Siguiente" para convocar al paciente que lleva más tiempo en espera.',
                    'Al iniciar la entrevista presiona "Atendiendo". Si necesita estudios complementarios puede "Derivar" a otro sector.',
                    'Al concluir la gestión presiona "Finalizado". Si el paciente no se presenta tras 3 llamados, presiona "Ausente".'
                ],
                controles: 'Panel de control con botones Llamar, Re-llamar, Atendiendo, Finalizar, Ausente y selector de Box.',
                reglas: 'Calcula métricas exactas de tiempo de espera y tiempo de atención para auditoría de calidad.'
            }
        ]
    },
    {
        id: 'altas',
        titulo: 'Módulo 5: Control de Altas Administrativas',
        icono: ClipboardCheck,
        color: '#8B5CF6',
        badge: 'Internaciones',
        resumen: 'Auditoría administrativa de egresos hospitalarios, normalización de 042 Particulares, internaciones prolongadas y Carrito de Traspaso a Facturación.',
        diagrama: [
            { paso: '1. Sincronización SALUS', desc: 'Importación de admisiones internadas y fecha de egreso médico' },
            { paso: '2. Auditoría Administrativa', desc: 'Control de órdenes, firmas médicas, 042 Particulares y cruza mes' },
            { paso: '3. Carrito de Traspaso', desc: 'Selección de fichas Alta Adm y cálculo de resumen nominal' },
            { paso: '4. Remito TRASP y Firmas', desc: 'Emisión de código TRASP-YYYYMMDD-XXXX y firmas táctiles' }
        ],
        submodulos: [
            {
                nombre: '5.1 Bandeja de Altas y Paginación x10',
                procedimiento: [
                    'Ingresar a "Control de Altas" y filtrar por el mes correspondiente.',
                    'La tabla muestra 10 registros por página para máxima agilidad de carga.',
                    'Auditar cada historia clínica: verificar que cuente con consentimiento informado, orden quirúrgica y epicrisis.',
                    'Asignar el estado correspondiente: "Alta Adm", "Alta Adm. Parcial", "Particular", "Suspendida", "Pasa al mes que viene" o "Interconsulta".'
                ],
                controles: 'Paginador ágil (10 por página), selector de estados desplegable, campo de notas y badges de alerta.',
                reglas: 'Si el cliente es "042 - PARTICULARES" o coincide con el nombre del paciente, el sistema auto-asigna el estado "Particular".'
            },
            {
                nombre: '5.2 Fusión Inteligente de Admisiones Duplicadas',
                procedimiento: [
                    'El sistema identifica automáticamente registros que comparten mismo paciente y fecha de ingreso.',
                    'Agrupa los registros en una sola fila visual destacada con el badge azul [🔗 Fusionada].',
                    'Al hacer clic en el badge se expande el desglose de los números de admisión agrupados para auditar sus prestaciones.'
                ],
                controles: 'Badge interactivo colapsable con desglose de números de admisión fusionados.',
                reglas: 'Garantiza que no se generen traspasos duplicados ni se omita ninguna admisión en la liquidación.'
            },
            {
                nombre: '5.3 Internaciones Prolongadas (Cruza Mes) y Garantías',
                procedimiento: [
                    'Para pacientes ingresados en un mes que continúan internados en el mes siguiente, revisar la alerta de "Cruza Mes".',
                    'Si el paciente no posee cobertura total de obra social, ingresar en la columna "Garantías" el monto del pagaré o comprobante de transferencia retenido.',
                    'Adjuntar foto del pagaré firmado para resguardo de Tesorería.'
                ],
                controles: 'Indicador visual de Cruza Mes, modal de carga de garantías/pagarés con carga de fotos de comprobante.',
                reglas: 'Ningún paciente particular puede ser derivado a Facturación sin el respaldo de pagaré o cancelación previa.'
            },
            {
                nombre: '5.4 Carrito de Traspaso y Remito Oficial TRASP',
                procedimiento: [
                    'Marcar las casillas de verificación de las admisiones en estado "Alta Adm" que están listas para liquidar.',
                    'Presionar el botón "Generar Traspaso" ubicado en la barra superior.',
                    'Comprobar en el modal el listado nominal de historias clínicas y total de fichas.',
                    'Completar el nombre del responsable que entrega (Admisión) y quien recibe (Facturación).',
                    'Capturar ambas firmas digitales sobre la pantalla táctil.',
                    'Presionar "Confirmar Traspaso": El sistema genera el código TRASP-YYYYMMDD-XXXX, descarga la constancia en PDF y transfiere las fichas a Facturación.'
                ],
                controles: 'Barra flotante de selección múltiple, modal con lienzo de firmas táctiles (SignaturePad) y generador de PDF.',
                reglas: 'El remito digital TRASP es el único documento formal válido para certificar el traspaso de expedientes.'
            }
        ]
    },
    {
        id: 'facturacion',
        titulo: 'Módulo 6: Facturación Internado y Devoluciones',
        icono: Receipt,
        color: '#EF4444',
        badge: 'Liquidación',
        resumen: 'Espacio de trabajo para analistas liquidadores con asignación nominal, detección automática de facturas de SALUS y circuito formal de devoluciones.',
        diagrama: [
            { paso: '1. Fichas Recibidas', desc: 'Ingreso desde Control de Altas con número de remito TRASP' },
            { paso: '2. Asignación Analista', desc: 'Distribución a Jorge Terrera, Paola Illanes, Inés Dona, etc.' },
            { paso: '3. Liquidación SALUS', desc: 'Detección automática de facturas en Puntos de Venta 21 y 31' },
            { paso: '4. Devolución si Faltan Datos', desc: 'Carrito de Devolución con motivo obligatorio y remito DEV' }
        ],
        submodulos: [
            {
                nombre: '6.1 Asignación Nominal a Analistas Liquidadores',
                procedimiento: [
                    'Ingresar a la pestaña principal de "Facturación".',
                    'Seleccionar las fichas y asignar el analista responsable mediante el menú desplegable (ej. Jorge Terrera - JT).',
                    'Cada liquidador puede filtrar por "Mis Fichas Asignadas" para trabajar exclusivamente sobre su lote de expedientes.'
                ],
                controles: 'Selector de analistas con iniciales, filtro personalizado por responsable y contador de fichas por analista.',
                reglas: 'Permite medir la productividad individual y la velocidad de liquidación por liquidador.'
            },
            {
                nombre: '6.2 Detección Automática de Facturas SALUS (PDV 21/31)',
                procedimiento: [
                    'El analista liquida y emite la factura en el sistema central SALUS (SQL Server).',
                    'El sync-server de ADM-QUI detecta la emisión del comprobante en los puntos de venta 21 o 31.',
                    'El sistema actualiza de forma automática el estado de la ficha a "Facturada", incorporando el número de factura, tipo y fecha de comprobante.'
                ],
                controles: 'Insignia verde "Facturada" con número de comprobante vinculado e icono de sincronización.',
                reglas: 'Evita la doble carga manual y previene errores de tipeo en los números de factura.'
            },
            {
                nombre: '6.3 Carrito de Devoluciones y Remito DEV a Altas',
                procedimiento: [
                    'Si una historia clínica presenta inconsistencias (ej. falta firma del médico en foja, falta voucher de prótesis), presionar "Añadir a Devolución".',
                    'Seleccionar el motivo de rechazo estandarizado y escribir una observación detallada para Admisión.',
                    'Al completar el lote de fichas rechazadas, presionar "Generar Remito de Devolución".',
                    'Capturar las firmas de Facturación y Admisión: El sistema emite el remito DEV y retorna las historias a la bandeja de Altas para subsanación.'
                ],
                controles: 'Carrito flotante de devoluciones, selector de motivos de rechazo, modal de firmas y generador de remito PDF.',
                reglas: 'Toda devolución debe estar debidamente justificada y queda registrada en el Historial de Devoluciones.'
            },
            {
                nombre: '6.4 Historial de Devoluciones y Auditoría',
                procedimiento: [
                    'Acceder a la pestaña "Historial de Devoluciones" dentro de Facturación.',
                    'Consultar la lista histórica de expedientes devueltos con fecha, analista emisor, motivo y fecha de subsanación.',
                    'Exportar el reporte mensual para análisis del Comité de Calidad y reducción de no conformidades.'
                ],
                controles: 'Tabla histórica con filtros por motivo y analista, botón de exportación a Excel.',
                reglas: 'Permite identificar las causas recurrentes de devolución para capacitar al personal de Admisión.'
            }
        ]
    },
    {
        id: 'deudas_presupuestos',
        titulo: 'Módulo 7: Deudas, Coseguros y Presupuestos',
        icono: DollarSign,
        color: '#F59E0B',
        badge: 'Finanzas',
        resumen: 'Recuperación de cuentas corrientes de pacientes, planes de pago en cuotas, convenios de coseguros y emisión formal de presupuestos médicos.',
        diagrama: [
            { paso: '1. Registro de Deuda', desc: 'Carga de saldo por coseguro, prótesis o diferencia particular' },
            { paso: '2. Plan de Pagos / WhatsApp', desc: 'Acuerdo en cuotas y envío de recordatorio formal con enlace' },
            { paso: '3. Cotización Presupuesto', desc: 'Desglose de derechos de quirófano, honorarios y descartables' },
            { paso: '4. Emisión PDF & Envío', desc: 'Generación de presupuesto con validez de 15 a 30 días' }
        ],
        submodulos: [
            {
                nombre: '7.1 Gestión y Recuperación de Deudas de Pacientes',
                procedimiento: [
                    'Ingresar a "Deudas" y buscar al paciente por DNI o apellido.',
                    'Registrar el concepto de la deuda (Coseguro no autorizado, insumo especial, internación particular).',
                    'Configurar el plan de pago si se pactó en cuotas (efectivo, transferencia, tarjeta de crédito).',
                    'Presionar el botón de WhatsApp para enviar el recordatorio institucional de regularización.'
                ],
                controles: 'Buscador de pacientes, formulario de registro de deuda, simulador de cuotas y botón WhatsApp.',
                reglas: 'Al cancelar la totalidad del saldo, el sistema emite el certificado digital de "Libre de Deuda".'
            },
            {
                nombre: '7.2 Emisión Formal de Presupuestos Quirúrgicos',
                procedimiento: [
                    'Ingresar a "Presupuestos" y presionar "Nuevo Presupuesto".',
                    'Cargar los datos del paciente, cirujano responsable y código de procedimiento solicitado.',
                    'Desglosar los conceptos: Derecho de quirófano, honorarios médicos y anestésicos, días de cama (piso/UTI), descartables y prótesis.',
                    'Definir la validez de la cotización (15 a 30 días) y presionar "Generar PDF".',
                    'Enviar el presupuesto oficial membretado directamente al WhatsApp del paciente.'
                ],
                controles: 'Calculadora de conceptos quirúrgicos, selector de validez, visor de PDF y botón de envío directo.',
                reglas: 'Todo presupuesto oficial lleva firma digital de la Administración y cláusula de vigencia arancelaria.'
            }
        ]
    },
    {
        id: 'mensajeria',
        titulo: 'Módulo 8: Mensajería WhatsApp Multilínea',
        icono: MessageSquare,
        color: '#2563EB',
        badge: 'Comunicaciones',
        resumen: 'Centro de mensajería unificada con pacientes utilizando Línea Estándar (BuilderBot) y Línea Oficial (Meta Cloud API con ventana de 24 hs).',
        diagrama: [
            { paso: '1. Selección de Línea', desc: 'Línea Estándar (Operativa) vs Línea Meta Cloud API (Oficial)' },
            { paso: '2. Verificación Ventana 24h', desc: 'Si >24h desde último mensaje del paciente, exige plantilla HSM' },
            { paso: '3. Template Manager', desc: 'Plantillas institucionales con variables {{nombre}}, {{fecha}}, etc.' },
            { paso: '4. Registro en Conversación', desc: 'Historial unificado y trazabilidad de entrega/lectura' }
        ],
        submodulos: [
            {
                nombre: '8.1 Chat en Vivo y Ventana de 24 Horas de Meta',
                procedimiento: [
                    'Ingresar a "Mensajería ➔ Chat" para ver las conversaciones activas con pacientes.',
                    'Si el paciente escribió hace menos de 24 horas, la ventana está abierta: se puede responder con texto libre o adjuntos.',
                    'Si pasaron más de 24 horas, el sistema bloquea el texto libre y activa el selector de "Plantillas Aprobadas (HSM)".'
                ],
                controles: 'Bandeja de chats estilo WhatsApp Web, indicador de estado de ventana 24h y selector de plantillas.',
                reglas: 'Cumplimiento estricto de las normativas de Meta Cloud API para evitar sanciones o bloqueos de línea.'
            },
            {
                nombre: '8.2 Template Manager y Envíos Masivos Prequirúrgicos',
                procedimiento: [
                    'Ingresar a "Plantillas WhatsApp" para administrar los modelos de mensaje autorizados.',
                    'Para envíos masivos: Seleccionar el lote de cirugías del día siguiente y presionar "Envío Masivo de Indicaciones".',
                    'El sistema personaliza automáticamente las variables: {{nombre}}, {{fecha_cirugia}}, {{horario_presentacion}}, {{medico}}.',
                    'Verificar la cola de envíos y confirmar.'
                ],
                controles: 'Editor de plantillas con vista previa en vivo, motor de variables automáticas y despachador en lote.',
                reglas: 'Cada envío masivo incorpora un intervalo de 2 a 4 segundos entre mensajes para no saturar la API.'
            }
        ]
    },
    {
        id: 'asociaciones_lab',
        titulo: 'Módulo 9: Asociaciones Médicas y Laboratorios',
        icono: Microscope,
        color: '#0891B2',
        badge: 'Trazabilidad Externa',
        resumen: 'Agrupación gremial de fojas quirúrgicas para asociaciones médicas y trazabilidad de biopsias con reglas Facturar vs Entregar.',
        diagrama: [
            { paso: '1. Agrupación por Entidad', desc: 'Colegio Médico, Asociación Médica de San Juan, etc.' },
            { paso: '2. Acta de Entrega PDF', desc: 'Generación de remito con detalle nominal de fojas y firmas' },
            { paso: '3. Derivación de Biopsias', desc: 'Clasificación hacia CEDAP, Agüero, Ríos o Cuyo' },
            { paso: '4. Regla Facturar vs Entregar', desc: 'Facturación institucional o entrega física con firma de paciente' }
        ],
        submodulos: [
            {
                nombre: '9.1 Entrega de Fojas a Asociaciones Médicas',
                procedimiento: [
                    'Ingresar a "Entrega Asociaciones" y filtrar por la entidad correspondiente (ej. Asociación Médica de San Juan).',
                    'Seleccionar las fojas quirúrgicas auditadas que corresponden al período de entrega.',
                    'Presionar "Emitir Constancia de Entrega": Se genera el acta PDF detallando números de historia clínica, nombres de pacientes y cirujanos.',
                    'Firmar el acta física y digitalmente al entregar los expedientes al cadete o representante gremial.'
                ],
                controles: 'Selector de asociación médica, tabla de fojas listas para entrega y generador de remito PDF.',
                reglas: 'Garantiza la trazabilidad legal de que las órdenes originales fueron entregadas a la entidad médica.'
            },
            {
                nombre: '9.2 Trazabilidad de Anatomía Patológica (LaboratoriosPanel)',
                procedimiento: [
                    'Ingresar a "Anatomía Patológica" para revisar las muestras de biopsia extraídas en quirófano.',
                    'Asignar el laboratorio de destino: CEDAP, Agüero, Ríos o Cuyo.',
                    'Aplicar la regla correspondiente: 1) "Facturar" (el Sanatorio liquida la anatomía a la obra social) o 2) "Entregar" (el familiar retira la muestra para gestionarla externamente).',
                    'Si se entrega al paciente: Capturar en el sistema la firma digital y número de DNI de quien retira la muestra.'
                ],
                controles: 'Selector de laboratorios patológicos, botones Facturar / Entregar, modal de firma de retiro y portal web.',
                reglas: 'Ninguna muestra biológica puede egresar del Sanatorio sin constancia nominal firmada con DNI.'
            }
        ]
    },
    {
        id: 'activos',
        titulo: 'Módulo 10: Activos Médicos y Etiquetas QR',
        icono: Wrench,
        color: '#475569',
        badge: 'Electromedicina',
        resumen: 'Inventario técnico de equipamiento quirúrgico, generación de etiquetas con código QR e historial de calibraciones y mantenimientos.',
        diagrama: [
            { paso: '1. Registro del Activo', desc: 'Carga de marca, modelo, número de serie y ubicación' },
            { paso: '2. Emisión de Código QR', desc: 'Generación de etiqueta QR adherible para el equipo' },
            { paso: '3. Escaneo e Inspección', desc: 'Auditoría física rápida con celular o tablet' },
            { paso: '4. Bitácora de Mantenimiento', desc: 'Registro de calibraciones y controles preventivos' }
        ],
        submodulos: [
            {
                nombre: '10.1 Inventario de Electromedicina y Quirófanos',
                procedimiento: [
                    'Ingresar a "Gestión de Activos" para consultar el inventario de equipamiento.',
                    'Para dar de alta un equipo: Presionar "Nuevo Activo", completar Nombre (ej. Torre Laparoscopía Storz), Número de Serie, Quirófano/Ubicación y Fecha de adquisición.',
                    'Asignar el estado operativo: "En Servicio", "En Mantenimiento", "En Calibración" o "De Baja".'
                ],
                controles: 'Tabla de activos médicos, filtros por quirófano y estado operativo, modal de carga de equipamiento.',
                reglas: 'Cumplimiento de las directivas de seguridad tecnológica del paciente conforme a ITAES.'
            },
            {
                nombre: '10.2 Impresión de Etiquetas QR y Bitácora Técnica',
                procedimiento: [
                    'Seleccionar el equipo y presionar "Imprimir Etiqueta QR".',
                    'Adherir la etiqueta plastificada sobre el chasis del equipo médico.',
                    'Cualquier auditor o técnico puede escanear el QR con su móvil para acceder instantáneamente a la ficha técnica.',
                    'Registrar en la bitácora cada mantenimiento preventivo, cambio de repuestos o calibración anual con firma del técnico.'
                ],
                controles: 'Generador de etiquetas QR para rotuladoras térmicas, bitácora de eventos técnicos con fotos.',
                reglas: 'Los equipos con mantenimiento vencido muestran un badge de advertencia rojo que alerta al Jefe de Quirófano.'
            }
        ]
    },
    {
        id: 'beto',
        titulo: 'Módulo 11: Asistente Inteligente Beto IA',
        icono: Brain,
        color: '#6366F1',
        badge: 'Inteligencia Artificial',
        resumen: 'Asistente virtual exclusivo de ADM-QUI para consultas analíticas en lenguaje natural, reportes ejecutivos en PDF y telemetría.',
        diagrama: [
            { paso: '1. Activación [Ctrl + K]', desc: 'Apertura del widget flotante o panel completo de Beto IA' },
            { paso: '2. Consulta en Lenguaje Natural', desc: '"¿Cuántas cirugías hay mañana?", "¿Altas pendientes de PAMI?"' },
            { paso: '3. Procesamiento en Tiempo Real', desc: 'Análisis instantáneo sobre la base de datos de Supabase' },
            { paso: '4. Reportes & Excel', desc: 'Emisión de resúmenes en PDF y exportaciones masivas a Excel' }
        ],
        submodulos: [
            {
                nombre: '11.1 Chat Analítico y Respuestas en Lenguaje Natural',
                procedimiento: [
                    'Hacer clic en el avatar animado de Beto en la barra lateral o presionar Ctrl + K.',
                    'Escribir la consulta médica o administrativa en lenguaje cotidiano.',
                    'Beto analiza la base de datos en tiempo real y devuelve la respuesta con métricas, gráficos y tablas comparativas.',
                    'Hacer clic en los botones de acción rápida para profundizar en el análisis de pacientes o prestaciones.'
                ],
                controles: 'Widget interactivo, campo de prompt conversacional, selector de preguntas frecuentes y modo presentación.',
                reglas: 'Beto es exclusivo de ADM-QUI y no debe confundirse con otros asistentes corporativos externos.'
            },
            {
                nombre: '11.2 Generación de Reportes Ejecutivos en PDF y Excel',
                procedimiento: [
                    'Solicitar a Beto un resumen de gestión (ej. "Generar reporte de cirugías del mes por cirujano").',
                    'Al finalizar la respuesta, presionar el botón "Descargar Reporte PDF".',
                    'El sistema genera un informe ejecutivo membretado con gráficos, tablas de control y firma institucional.',
                    'Para análisis estadístico avanzado, presionar "Exportar a Excel (.xlsx)".'
                ],
                controles: 'Botones de exportación rápida a PDF estructurado y archivo de hoja de cálculo Excel.',
                reglas: 'Los reportes PDF de Beto aplican el estándar visual institucional de Sanatorio Argentino.'
            },
            {
                nombre: '11.3 Beto Analytics y Gestión de Reglas',
                procedimiento: [
                    'Ingresar a "Beto Analytics" para auditar el rendimiento del asistente.',
                    'Consultar el volumen de preguntas por sector, tiempos de respuesta y tasa de satisfacción de los usuarios.',
                    'En "Gestión de Reglas", actualizar los criterios y directivas que Beto utiliza para interpretar las consultas complejas.'
                ],
                controles: 'Dashboard de telemetría de IA, gráficos de uso horario y editor de reglas institucionales.',
                reglas: 'Permite refinar continuamente la precisión del modelo adaptándolo a las nuevas normativas sanatoriales.'
            }
        ]
    },
    {
        id: 'guardia_auditoria',
        titulo: 'Módulo 12: Guardias Ambulatorias y Auditoría HC',
        icono: Activity,
        color: '#E11D48',
        badge: 'Calidad Médica',
        resumen: 'Monitoreo de atención en Guardia Ambulatoria (~5.800 consultas/mes), control documental de Historias Clínicas y generación de informes ITAES.',
        diagrama: [
            { paso: '1. Triage de Guardia', desc: 'Clasificación de gravedad por código de color Rojo, Amarillo, Verde' },
            { paso: '2. Tiempos de Espera', desc: 'Monitoreo en vivo de tiempos de atención y desvíos' },
            { paso: '3. Auditoría Documental HC', desc: 'Checklist de consentimiento, foja, anestesia, epicrisis y enfermería' },
            { paso: '4. Dictamen ITAES', desc: 'Registro de No Conformidades y emisión de acta de auditoría' }
        ],
        submodulos: [
            {
                nombre: '12.1 Consultas de Guardia Ambulatoria (GuardiaPanel)',
                procedimiento: [
                    'Ingresar a "Consultas Guardia" para auditar el flujo de urgencias en tiempo real.',
                    'Monitorear la distribución de consultas por nivel de triage (Rojo: Emergencia, Amarillo: Urgencia, Verde: Consulta común).',
                    'Verificar los tiempos de espera promedio en sala y alertar al jefe de guardia ante congestión.',
                    'Trazabilidad de pacientes derivados desde guardia hacia quirófano o piso de internación.'
                ],
                controles: 'Panel de control con código de colores, temporizadores de espera y gráficos de afluencia horaria.',
                reglas: 'Permite dimensionar la dotación médica y de enfermería según los picos de demanda del sanatorio.'
            },
            {
                nombre: '12.2 Auditoría de Historias Clínicas (AuditoriaHistoriasPanel)',
                procedimiento: [
                    'Ingresar a "Auditoría H.C." y seleccionar el expediente internado a auditar.',
                    'Completar el checklist de calidad: 1) Consentimiento informado firmado por paciente/tutor, 2) Foja quirúrgica completa, 3) Protocolo anestésico, 4) Epicrisis médica de alta, 5) Hojas de enfermería con signos vitales.',
                    'Si falta documentación, marcar la casilla de "No Conformidad" especificando el profesional o servicio responsable.',
                    'Guardar la evaluación para alimentar el índice mensual de calidad documental.'
                ],
                controles: 'Checklist interactivo con puntaje porcentual de cumplimiento, campo de no conformidades y filtros.',
                reglas: 'Cumplimiento estricto del estándar de registro clínico exigido por la acreditación ITAES.'
            },
            {
                nombre: '12.3 Informes de Auditoría en PDF (AuditoriaPDFPanel)',
                procedimiento: [
                    'Ingresar a "Auditoría HC PDF" y definir el período mensual a consolidar.',
                    'Presionar "Generar Informe de Auditoría SGC": El sistema compila los índices de completitud, médicos con observaciones y porcentaje de no conformidades.',
                    'Descargar el informe oficial firmado para elevar al Comité de Calidad y Dirección Médica.'
                ],
                controles: 'Selector de período, generador de PDF con gráficos de barra y tablas de desvío.',
                reglas: 'Documento formal requerido en las auditorías externas periódicas de calidad y seguridad del paciente.'
            }
        ]
    },
    {
        id: 'configuracion',
        titulo: 'Módulo 13: Configuración y Conectividad SALUS',
        icono: Settings,
        color: '#334155',
        badge: 'Infraestructura',
        resumen: 'Monitoreo del servidor de sincronización con SQL Server, estado de endpoints, reinicio de servicios y mantenimiento general.',
        diagrama: [
            { paso: '1. Conexión SQL Server', desc: 'Monitoreo del estado del sync-server local en puerto 3001' },
            { paso: '2. Endpoints de Sync', desc: 'Cirugías, Admisiones, Pacientes, Turnos y Facturación SALUS' },
            { paso: '3. Script de Respaldo', desc: 'Ejecución de "Actualizar SALUS.bat" ante interrupciones de red' },
            { paso: '4. Diagnóstico de Salud', desc: 'Visualización de logs de sincronización y latencia de base de datos' }
        ],
        submodulos: [
            {
                nombre: '13.1 Estado de Sincronización SALUS (sync-server)',
                procedimiento: [
                    'Ingresar a "Configuración" para verificar los indicadores de salud del sistema.',
                    'Verificar que el indicador de "Servidor SALUS" figure en verde (Online).',
                    'Si el indicador está en rojo, presionar el botón "Sincronizar SALUS Ahora" para forzar la actualización de datos.',
                    'Si persiste la desconexión, ejecutar el acceso directo "Actualizar SALUS.bat" en el servidor local de Innovación.'
                ],
                controles: 'Indicadores de estado (badges de salud), botón de sincronización manual y visor de logs.',
                reglas: 'La sincronización automática se ejecuta cada 60 segundos garantizando datos actualizados.'
            },
            {
                nombre: '13.2 Preferencias Globales y Personalización de Interfaz',
                procedimiento: [
                    'En Configuración, ajustar las preferencias visuales (modo diurno clínico, tipografía Montserrat, accesibilidad).',
                    'Configurar las líneas telefónicas predeterminadas para los envíos de WhatsApp.',
                    'Definir las alertas de stock para insumos críticos en el triage de fojas.'
                ],
                controles: 'Selectores de configuración del sistema, campos de teléfono institucional y umbrales de alerta.',
                reglas: 'Las modificaciones de configuración global quedan registradas en el log de auditoría del sistema.'
            }
        ]
    }
];

function drawWatermark(doc) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.saveGraphicsState();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(32);
    doc.setTextColor(242, 245, 249);
    doc.text('SANATORIO ARGENTINO', W / 2, H / 2, {
        align: 'center',
        angle: 45,
    });
    doc.restoreGraphicsState();
}

function drawHeader(doc, pageNum, totalPages) {
    const W = doc.internal.pageSize.getWidth();
    const CW = W - 28;
    const ML = 14;

    drawWatermark(doc);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.setTextColor(0, 0, 0);

    // Col 1: Logo + Sanatorio Argentino SRL + Departamento
    doc.rect(ML, 10, 48, 20, 'S');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('SANATORIO', ML + 24, 14.5, { align: 'center' });
    doc.text('ARGENTINO SRL', ML + 24, 18, { align: 'center' });
    doc.line(ML + 4, 19.5, ML + 44, 19.5);
    doc.setFontSize(6.5);
    doc.text('INNOVACIÓN Y', ML + 24, 23.5, { align: 'center' });
    doc.text('TRANSFORMACIÓN DIGITAL', ML + 24, 27, { align: 'center' });

    // Col 2: Título Oficial
    doc.rect(ML + 48, 10, CW - 96, 20, 'S');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('MANUAL DE PROCEDIMIENTOS OPERATIVOS:', ML + 52, 14.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    const titleLines = doc.splitTextToSize(DOC_META.titulo, CW - 104);
    doc.text(titleLines, ML + 48 + ((CW - 96) / 2), 20.5, { align: 'center' });

    // Col 3: Código + Revisión + Paginación
    doc.rect(ML + CW - 48, 10, 48, 20, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(DOC_META.codigo, ML + CW - 24, 15.5, { align: 'center' });
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Revisión Nº ' + DOC_META.revision, ML + CW - 24, 21.5, { align: 'center' });
    doc.setFontSize(7.5);
    doc.text(`Pág. ${pageNum} de ${totalPages || '{total_pages_count_string}'}`, ML + CW - 24, 27.5, { align: 'center' });

    // Fila Inferior: Advertencia de copia no controlada
    doc.setFillColor(235, 238, 242);
    doc.rect(ML, 30, CW, 5, 'FD');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('VALIDO SOLO EN FORMATO ELECTRÓNICO – LAS COPIAS EN PAPEL CARECEN DE VALOR', ML + (CW / 2), 33.5, { align: 'center' });
}

function drawSignatures(doc, y = 254) {
    const W = doc.internal.pageSize.getWidth();
    const CW = W - 28;
    const ML = 14;
    const colW = CW / 3;
    const boxH = 26;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.setTextColor(0, 0, 0);

    doc.rect(ML, y, CW, boxH, 'S');
    doc.line(ML + colW, y, ML + colW, y + boxH);
    doc.line(ML + colW * 2, y, ML + colW * 2, y + boxH);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('ELABORADO:', ML + 2, y + 4.5);
    doc.text('REVISADO:', ML + colW + 2, y + 4.5);
    doc.text('APROBADO:', ML + colW * 2 + 2, y + 4.5);

    // Elaborado: Lucas Marinero
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(DOC_META.elaboro, ML + colW / 2, y + 16, { align: 'center' });
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'normal');
    doc.text('Responsable de Innovación y', ML + colW / 2, y + 20, { align: 'center' });
    doc.text('Transformación Digital', ML + colW / 2, y + 23.5, { align: 'center' });

    // Revisado: Gabriela Iragorre
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(DOC_META.reviso, ML + colW + colW / 2, y + 16, { align: 'center' });
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'normal');
    doc.text(DOC_META.revisoCargo, ML + colW + colW / 2, y + 20.5, { align: 'center' });

    // Aprobado: Dr. Carlos Buteler
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(DOC_META.aprobo, ML + colW * 2 + colW / 2, y + 16, { align: 'center' });
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'normal');
    doc.text(DOC_META.aproboCargo, ML + colW * 2 + colW / 2, y + 20.5, { align: 'center' });
}

function addPage(doc, counters) {
    drawSignatures(doc, 254);
    doc.addPage();
    counters.page += 1;
    drawHeader(doc, counters.page, '{total_pages_count_string}');
    return 38;
}

function checkPageBreak(doc, counters, y, neededHeight = 15) {
    if (y + neededHeight > 250) {
        return addPage(doc, counters);
    }
    return y;
}

function sectionTitle(doc, text, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(text.toUpperCase(), 14, y + 4.5);
    return y + 7.5;
}

function subTitle(doc, text, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 87, 153);
    doc.text(text, 14 + 2, y + 4);
    return y + 6.5;
}

function para(doc, text, y, indent = 14) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 39, 46);
    const lines = doc.splitTextToSize(text, W - indent - 14);
    doc.text(lines, indent, y);
    return y + lines.length * 3.8 + 1.5;
}

function bulletList(doc, items, y, indent = 20) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 39, 46);
    for (const item of items) {
        doc.setFillColor(41, 128, 185);
        doc.circle(indent - 4, y - 1, 0.7, 'F');
        const lines = doc.splitTextToSize(item, W - indent - 14);
        doc.text(lines, indent, y);
        y += lines.length * 3.8 + 1;
    }
    return y + 1.5;
}

function stepList(doc, items, y, indent = 20) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 39, 46);
    for (let i = 0; i < items.length; i++) {
        const num = `${i + 1}.`;
        doc.setFont('helvetica', 'bold');
        doc.text(num, indent - 6, y);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(items[i], W - indent - 14);
        doc.text(lines, indent, y);
        y += lines.length * 3.8 + 1.2;
    }
    return y + 1.5;
}

function noteBox(doc, text, y) {
    const W = doc.internal.pageSize.getWidth();
    const CW = W - 28;
    const ML = 14;
    let lines = doc.splitTextToSize(text, CW - 12);
    const boxH = lines.length * 3.8 + 7;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(ML, y, CW, boxH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 87, 153);
    doc.text('[PAUTA DE CONTROL / AUDITORÍA SGC]', ML + 4, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(lines, ML + 4, y + 8.5);
    return y + boxH + 3;
}

function drawFlowBox(doc, text, x, y, w, h, bg = [240, 245, 255], border = [30, 87, 153]) {
    doc.setFillColor(...bg);
    doc.setDrawColor(...border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 39, 46);
    const lines = doc.splitTextToSize(text, w - 4);
    const textY = y + (h / 2) - ((lines.length - 1) * 2);
    doc.text(lines, x + (w / 2), textY, { align: 'center' });
}

function drawFlowArrow(doc, x1, y1, x2, y2) {
    doc.setDrawColor(30, 87, 153);
    doc.setLineWidth(0.4);
    doc.line(x1, y1, x2, y2);
    doc.setFillColor(30, 87, 153);
    if (x1 === x2) {
        doc.triangle(x2 - 1.5, y2 - 2, x2 + 1.5, y2 - 2, x2, y2, 'FD');
    } else {
        doc.triangle(x2 - 2, y2 - 1.5, x2 - 2, y2 + 1.5, x2, y2, 'FD');
    }
}

/**
 * Generador exhaustivo del Manual de Procedimientos en PDF
 */
export async function generateManualPDF() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const counters = { page: 1 };
    
    // ── Página 1: Encabezado + Tablas de Control SGC ──
    drawHeader(doc, 1, '{total_pages_count_string}');
    let y = 37;

    // Tabla 1: REVISIONES
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [
            [{ content: 'CONTROL DE REVISIONES Y ACTUALIZACIONES SGC', colSpan: 4, styles: { halign: 'left', fillColor: [235, 238, 242], textColor: [0, 0, 0], fontStyle: 'bold' } }],
            ['N°', 'Descripción de los cambios', 'Autor', 'Fecha vigencia']
        ],
        body: [
            ['00', 'Versión original del sistema de admisión quirúrgica y triage', 'Lucas Marinero', '20/03/2024'],
            ['01', 'Revisión integral: Módulos de Altas, 042 Particulares, Facturación, Turnos, Beto IA, Laboratorios y Devoluciones', 'Lucas Marinero', DOC_META.fechaVigencia]
        ],
        theme: 'plain',
        headStyles: { fontSize: 7, fontStyle: 'bold', fillColor: [245, 247, 250], textColor: [0, 0, 0], halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { fontSize: 7, textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { cellWidth: 100 },
            2: { halign: 'center', cellWidth: 44 },
            3: { halign: 'center', cellWidth: 28 },
        },
        styles: { cellPadding: 1.5 }
    });

    y = doc.lastAutoTable.finalY + 3.5;

    // Tabla 2: DOCUMENTOS DE REFERENCIA
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [
            [{ content: 'DOCUMENTOS DE REFERENCIA INSTITUCIONAL', colSpan: 2, styles: { halign: 'left', fillColor: [235, 238, 242], textColor: [0, 0, 0], fontStyle: 'bold' } }],
            ['Código', 'Título del documento']
        ],
        body: [
            ['SGC-PR-01', 'Manual del Sistema de Gestión de la Calidad (SGC) — Sanatorio Argentino'],
            ['ITAES-EST-04', 'Estándares de Acreditación de Establecimientos de Salud — ITAES'],
            ['ITYS-05', 'Procedimiento Operativo de Seguridad, Acceso y Confidencialidad en Sistemas'],
            ['ADM-QUI-02', 'Procedimiento de Admisión Quirúrgica y Circuito de Triage de Fojas']
        ],
        theme: 'plain',
        headStyles: { fontSize: 7, fontStyle: 'bold', fillColor: [245, 247, 250], textColor: [0, 0, 0], halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { fontSize: 7, textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 40 },
            1: { cellWidth: 142 },
        },
        styles: { cellPadding: 1.5 }
    });

    y = doc.lastAutoTable.finalY + 4;

    // 1. OBJETIVO
    y = sectionTitle(doc, '1. OBJETIVO DEL MANUAL:', y);
    y = para(doc, 'Establecer los procedimientos operativos estandarizados, responsabilidades funcionales y pautas de control para la totalidad de módulos que conforman el Sistema de Admisión Quirúrgica y Control Administrativo (ADM-QUI) del Sanatorio Argentino. Este manual sirve de guía de trabajo obligatoria para todo el personal asistencial y administrativo, garantizando la trazabilidad de historias clínicas, la precisión en facturación y el cumplimiento de las normativas de acreditación hospitalaria ITAES.', y);

    // 2. CAMPO DE APLICACIÓN
    y = checkPageBreak(doc, counters, y, 20);
    y = sectionTitle(doc, '2. CAMPO DE APLICACIÓN Y ALCANCE:', y);
    y = para(doc, 'Este manual es de aplicación directa y obligatoria para las áreas de: Innovación y Transformación Digital, Admisión Central y Quirúrgica, Recepción y Gestión de Turnos, Control de Altas Administrativas, Facturación Internado, Quirófanos Centrales, Laboratorios de Anatomía Patológica, Auditoría Médica y Recuperación de Cuentas del Sanatorio Argentino SRL.', y);

    // 3. DEFINICIONES
    y = checkPageBreak(doc, counters, y, 30);
    y = sectionTitle(doc, '3. DEFINICIONES Y GLOSARIO DE TÉRMINOS:', y);
    y = bulletList(doc, [
        'ADM-QUI: Plataforma web integral para gestión de admisiones quirúrgicas, turnos, altas y facturación.',
        'SALUS: Sistema hospitalario central (SQL Server) fuente de datos demográficos y de internación.',
        'BETO IA: Asistente virtual con Inteligencia Artificial integrado exclusivamente a ADM-QUI para soporte y analítica.',
        'CONTROL DE ALTAS: Auditoría administrativa previa al traspaso de expedientes hospitalarios a Facturación.',
        'PARTICULAR (042): Paciente sin cobertura de obra social o con cliente registrado con su propio nombre.',
        'REMITO DE TRASPASO: Acta digital formal con código oficial (TRASP-YYYYMMDD-XXXX) y firmas de entrega y recepción.',
        'REMITO DE DEVOLUCIÓN: Constancia digital de rechazo de ficha desde Facturación hacia Control de Altas.',
        'TRIAGE DE FOJA: Análisis y detección inteligente de insumos protésicos y biopsias desde fojas quirúrgicas.',
        'META CLOUD API: Protocolo oficial de mensajería empresarial de WhatsApp sujeto a la ventana de 24 horas.',
        'LUP (Lección de Un Punto): Documento instructivo focalizado en un único procedimiento específico.',
        'ITAES: Instituto Técnico para la Acreditación de Establecimientos de Salud.'
    ], y);

    // ── 4. DESGLOSE EXHAUSTIVO MÓDULO POR MÓDULO ──
    y = checkPageBreak(doc, counters, y, 20);
    y = sectionTitle(doc, '4. PROCEDIMIENTOS OPERATIVOS EXHAUSTIVOS (MÓDULO POR MÓDULO):', y);

    for (const mod of SISTEMA_MODULOS) {
        y = checkPageBreak(doc, counters, y, 30);
        y = subTitle(doc, mod.titulo, y);
        y = para(doc, mod.resumen, y);

        // Submódulos
        for (const sub of mod.submodulos) {
            y = checkPageBreak(doc, counters, y, 25);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(30, 87, 153);
            doc.text(`▸ ${sub.nombre}:`, 16, y + 3.5);
            y += 5.5;

            y = stepList(doc, sub.procedimiento, y, 22);
            y = para(doc, `Controles & Acciones: ${sub.controles}`, y, 20);
            y = para(doc, `Pauta / Regla SGC: ${sub.reglas}`, y, 20);
            y += 1;
        }
    }

    // ── 5. PLAN DE CONTINGENCIA ──
    y = checkPageBreak(doc, counters, y, 40);
    y = sectionTitle(doc, '5. PLAN DE CONTINGENCIA ANTE FALLAS DE SISTEMA:', y);
    y = para(doc, 'Ante contingencias técnicas imprevistas, el personal aplicará los siguientes protocolos aprobados por el SGC:', y);
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Incidencia Técnica', 'Procedimiento de Contingencia Inmediato', 'Responsable']],
        body: [
            ['Caída de sync-server SALUS', 'Ejecutar script local "Actualizar SALUS.bat" y verificar log de conexión SQL', 'Operador / Innovación'],
            ['Corte de conectividad a Internet', 'Registrar admisiones en planillas de contingencia manual hasta restablecimiento', 'Personal de Admisión'],
            ['Expiración ventana 24hs WhatsApp', 'Utilizar exclusivamente plantillas oficiales HSM aprobadas en el módulo de Mensajería', 'Operador de Mensajería'],
            ['Falla de pantalla llamadora de turnos', 'Realizar llamado a viva voz indicando número de turno y Box correspondiente', 'Recepción Central'],
            ['Inconsistencia en facturación SALUS', 'Verificar correlatividad de comprobantes en PDV 21/31 y sincronizar altas', 'Facturación / Sistemas']
        ],
        theme: 'plain',
        headStyles: { fontSize: 7, fontStyle: 'bold', fillColor: [235, 238, 242], textColor: [0, 0, 0], halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { fontSize: 7, textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 48 },
            1: { cellWidth: 94 },
            2: { halign: 'center', cellWidth: 40 },
        },
        styles: { cellPadding: 1.8 }
    });

    y = doc.lastAutoTable.finalY + 4;
    y = checkPageBreak(doc, counters, y, 20);
    y = noteBox(doc, 'Este manual es de cumplimiento mandatorio. Toda revisión o modificación debe ser gestionada a través del Departamento de Innovación y Transformación Digital y aprobada formalmente por la Dirección Médica del Sanatorio Argentino SRL.', y);

    drawSignatures(doc, 254);

    doc.putTotalPages('{total_pages_count_string}');
    doc.save(`Manual_Operativo_${DOC_META.codigo.replace(/\s+/g, '_')}_ADM-QUI_v${DOC_META.version}.pdf`);
}

// ─── Componente React Principal con Tipografía Montserrat ────────────────────
export default function ManualProcedimientos() {
    const [activeTab, setActiveTab] = useState('explorador'); // 'explorador' | 'documento' | 'diagramas'
    const [selectedModuleId, setSelectedModuleId] = useState(SISTEMA_MODULOS[0].id);
    const [searchFilter, setSearchFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const handleDownload = async () => {
        setLoading(true);
        setDone(false);
        try {
            await generateManualPDF();
            setDone(true);
            setTimeout(() => setDone(false), 4000);
        } catch (err) {
            console.error('Error generando PDF:', err);
            alert('Error al generar el PDF. Verificar consola.');
        } finally {
            setLoading(false);
        }
    };

    const selectedModule = useMemo(() => {
        return SISTEMA_MODULOS.find(m => m.id === selectedModuleId) || SISTEMA_MODULOS[0];
    }, [selectedModuleId]);

    const filteredModules = useMemo(() => {
        if (!searchFilter.trim()) return SISTEMA_MODULOS;
        const q = searchFilter.toLowerCase();
        return SISTEMA_MODULOS.filter(m =>
            m.titulo.toLowerCase().includes(q) ||
            m.resumen.toLowerCase().includes(q) ||
            m.submodulos.some(s => s.nombre.toLowerCase().includes(q) || s.controles.toLowerCase().includes(q))
        );
    }, [searchFilter]);

    return (
        <div style={{
            minHeight: '100vh',
            background: '#F8FAFC',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontFamily: "'Montserrat', sans-serif"
        }}>
            {/* Barra Superior de Control */}
            <div style={{
                width: '100%',
                maxWidth: '1100px',
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '18px 24px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '14px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #1E5799 0%, #2980B9 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        boxShadow: '0 4px 10px rgba(30,87,153,0.25)'
                    }}>
                        <BookOpen size={24} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
                            Manual de Procedimientos y Guía Operativa SGC
                        </h2>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748B', fontWeight: 500 }}>
                            Código: <strong>{DOC_META.codigo}</strong> • Revisión Nº {DOC_META.revision} • Estándar ITAES
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        display: 'flex',
                        background: '#F1F5F9',
                        borderRadius: '10px',
                        padding: '3px',
                        gap: '2px'
                    }}>
                        <button
                            onClick={() => setActiveTab('explorador')}
                            style={{
                                padding: '7px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                background: activeTab === 'explorador' ? '#FFFFFF' : 'transparent',
                                color: activeTab === 'explorador' ? '#1E5799' : '#64748B',
                                fontWeight: activeTab === 'explorador' ? 700 : 600,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                boxShadow: activeTab === 'explorador' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            Explorador Módulo a Módulo
                        </button>
                        <button
                            onClick={() => setActiveTab('documento')}
                            style={{
                                padding: '7px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                background: activeTab === 'documento' ? '#FFFFFF' : 'transparent',
                                color: activeTab === 'documento' ? '#1E5799' : '#64748B',
                                fontWeight: activeTab === 'documento' ? 700 : 600,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                boxShadow: activeTab === 'documento' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            Vista A4 SGC Oficial
                        </button>
                        <button
                            onClick={() => setActiveTab('diagramas')}
                            style={{
                                padding: '7px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                background: activeTab === 'diagramas' ? '#FFFFFF' : 'transparent',
                                color: activeTab === 'diagramas' ? '#1E5799' : '#64748B',
                                fontWeight: activeTab === 'diagramas' ? 700 : 600,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                boxShadow: activeTab === 'diagramas' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            Diagramas de Flujo
                        </button>
                    </div>

                    <button
                        onClick={() => window.print()}
                        style={{
                            padding: '9px 16px',
                            background: '#F8FAFC',
                            color: '#334155',
                            border: '1px solid #CBD5E1',
                            borderRadius: '10px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Printer size={16} /> Imprimir
                    </button>

                    <button
                        onClick={handleDownload}
                        disabled={loading}
                        style={{
                            padding: '9px 20px',
                            background: done ? '#16A34A' : 'linear-gradient(135deg, #1E5799 0%, #2980B9 100%)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 2px 8px rgba(30,87,153,0.25)'
                        }}
                    >
                        {loading ? (
                            <>
                                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                Generando PDF...
                            </>
                        ) : done ? (
                            <>
                                <CheckCircle2 size={16} />
                                ¡Descargado!
                            </>
                        ) : (
                            <>
                                <Download size={16} />
                                Descargar Manual PDF Completo
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* TAB 1: Explorador Módulo por Módulo */}
            {activeTab === 'explorador' && (
                <div style={{
                    width: '100%',
                    maxWidth: '1100px',
                    display: 'grid',
                    gridTemplateColumns: '320px 1fr',
                    gap: '20px',
                    alignItems: 'start'
                }}>
                    {/* Menú Lateral de Módulos */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        padding: '16px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Buscar módulo o función..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px 8px 36px',
                                    borderRadius: '10px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.82rem',
                                    fontFamily: "'Montserrat', sans-serif",
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
                            {filteredModules.map((mod) => {
                                const Icon = mod.icono;
                                const isSelected = mod.id === selectedModuleId;
                                return (
                                    <button
                                        key={mod.id}
                                        onClick={() => setSelectedModuleId(mod.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: isSelected ? '#EFF6FF' : 'transparent',
                                            borderLeft: isSelected ? '4px solid #1E5799' : '4px solid transparent',
                                            color: isSelected ? '#1E5799' : '#334155',
                                            fontWeight: isSelected ? 700 : 500,
                                            fontSize: '0.83rem',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease',
                                            fontFamily: "'Montserrat', sans-serif"
                                        }}
                                    >
                                        <Icon size={18} color={isSelected ? '#1E5799' : '#64748B'} style={{ flexShrink: 0 }} />
                                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {mod.titulo}
                                        </span>
                                        <ChevronRight size={14} color={isSelected ? '#1E5799' : '#CBD5E1'} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Detalle Exhaustivo del Módulo Seleccionado */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        padding: '28px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '24px'
                    }}>
                        {/* Cabecera del Módulo */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '16px' }}>
                            <div>
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '3px 10px',
                                    borderRadius: '8px',
                                    background: '#EFF6FF',
                                    color: '#1E5799',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    marginBottom: '8px'
                                }}>
                                    <Bookmark size={12} /> {selectedModule.badge}
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                                    {selectedModule.titulo}
                                </h3>
                                <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: '#475569', lineHeight: 1.5 }}>
                                    {selectedModule.resumen}
                                </p>
                            </div>
                        </div>

                        {/* Diagrama de Flujo del Módulo */}
                        <div>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Layers size={16} color="#1E5799" /> Diagrama de Flujo del Proceso:
                            </h4>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${selectedModule.diagrama.length}, 1fr)`,
                                gap: '8px',
                                background: '#F8FAFC',
                                padding: '14px',
                                borderRadius: '12px',
                                border: '1px solid #E2E8F0'
                            }}>
                                {selectedModule.diagrama.map((step, idx) => (
                                    <div key={idx} style={{
                                        background: '#FFFFFF',
                                        borderRadius: '8px',
                                        padding: '10px',
                                        border: '1px solid #CBD5E1',
                                        textAlign: 'center',
                                        position: 'relative'
                                    }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1E5799' }}>{step.paso}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', lineHeight: 1.3 }}>{step.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Submódulos con Guía Paso a Paso */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Sparkles size={16} color="#1E5799" /> Submódulos y Procedimiento Paso a Paso:
                            </h4>

                            {selectedModule.submodulos.map((sub, idx) => (
                                <div key={idx} style={{
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '12px',
                                    padding: '18px',
                                    background: '#FFFFFF',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1E5799' }} />
                                        <h5 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                            {sub.nombre}
                                        </h5>
                                    </div>

                                    {/* Pasos */}
                                    <div style={{ paddingLeft: '14px', marginBottom: '12px' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                                            Instrucciones de Uso:
                                        </div>
                                        <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.84rem', color: '#334155', lineHeight: 1.5 }}>
                                            {sub.procedimiento.map((p, pIdx) => (
                                                <li key={pIdx}>{p}</li>
                                            ))}
                                        </ol>
                                    </div>

                                    {/* Controles & Reglas */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px', background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', fontSize: '0.78rem' }}>
                                        <div>
                                            <strong style={{ color: '#1E5799' }}>Controles y Pantallas:</strong>
                                            <p style={{ margin: '2px 0 0 0', color: '#475569' }}>{sub.controles}</p>
                                        </div>
                                        <div>
                                            <strong style={{ color: '#059669' }}>Pauta de Control SGC / Regla:</strong>
                                            <p style={{ margin: '2px 0 0 0', color: '#475569' }}>{sub.reglas}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: Vista A4 SGC Oficial */}
            {activeTab === 'documento' && (
                <div style={{
                    width: '100%',
                    maxWidth: '960px',
                    background: '#FFFFFF',
                    borderRadius: '4px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.1)',
                    border: '1px solid #D1D5DB',
                    padding: '36px',
                    position: 'relative',
                    color: '#000000',
                    fontSize: '13px',
                    lineHeight: 1.6
                }}>
                    {/* Marca de agua */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-45deg)',
                        fontSize: '68px',
                        fontWeight: 900,
                        color: 'rgba(0,0,0,0.03)',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                        pointerEvents: 'none',
                        letterSpacing: '4px'
                    }}>
                        SANATORIO ARGENTINO
                    </div>

                    {/* Encabezado Oficial */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '16px' }}>
                        <tbody>
                            <tr>
                                <td style={{ border: '1.5px solid #000', width: '25%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 800, lineHeight: '1.2' }}>
                                        SANATORIO<br />ARGENTINO SRL
                                    </div>
                                    <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '6px 0' }} />
                                    <div style={{ fontSize: '9px', fontWeight: 700, lineHeight: '1.2' }}>
                                        {DOC_META.departamento}
                                    </div>
                                </td>
                                <td style={{ border: '1.5px solid #000', width: '50%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em' }}>MANUAL DE PROCEDIMIENTOS OPERATIVOS:</div>
                                    <div style={{ fontSize: '13px', fontWeight: 800, marginTop: '4px' }}>
                                        {DOC_META.titulo}
                                    </div>
                                </td>
                                <td style={{ border: '1.5px solid #000', width: '25%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.05em' }}>{DOC_META.codigo}</div>
                                    <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 600 }}>Revisión Nº {DOC_META.revision}</div>
                                    <div style={{ fontSize: '10px', marginTop: '2px', color: '#4B5563' }}>Documento Institucional SGC</div>
                                </td>
                            </tr>
                            <tr>
                                <td colSpan={3} style={{ border: '1.5px solid #000', background: '#E5E7EB', padding: '4px', textAlign: 'center', fontSize: '10px', fontWeight: 800 }}>
                                    VALIDO SOLO EN FORMATO ELECTRÓNICO – LAS COPIAS EN PAPEL CARECEN DE VALOR
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Revisiones */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '14px', fontSize: '11px' }}>
                        <thead>
                            <tr>
                                <th colSpan={4} style={{ border: '1px solid #000', background: '#E5E7EB', padding: '4px 8px', textAlign: 'left', fontWeight: 800 }}>
                                    CONTROL DE REVISIONES Y ACTUALIZACIONES SGC
                                </th>
                            </tr>
                            <tr style={{ background: '#F3F4F6' }}>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '40px', textAlign: 'center', fontWeight: 700 }}>Nº</th>
                                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 700 }}>Descripción de los cambios</th>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '180px', textAlign: 'center', fontWeight: 700 }}>Autor</th>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '110px', textAlign: 'center', fontWeight: 700 }}>Fecha vigencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>00</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Versión original del sistema de admisión quirúrgica y triage</td>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>Lucas Marinero</td>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>20/03/2024</td>
                            </tr>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>01</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Revisión integral: Módulos de Altas, 042 Particulares, Facturación, Turnos, Beto IA, Laboratorios y Devoluciones</td>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>Lucas Marinero</td>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{DOC_META.fechaVigencia}</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Referencias */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '20px', fontSize: '11px' }}>
                        <thead>
                            <tr>
                                <th colSpan={2} style={{ border: '1px solid #000', background: '#E5E7EB', padding: '4px 8px', textAlign: 'left', fontWeight: 800 }}>
                                    DOCUMENTOS DE REFERENCIA INSTITUCIONAL
                                </th>
                            </tr>
                            <tr style={{ background: '#F3F4F6' }}>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '140px', textAlign: 'center', fontWeight: 700 }}>Código</th>
                                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 700 }}>Título del documento</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>SGC-PR-01</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Manual del Sistema de Gestión de la Calidad (SGC) — Sanatorio Argentino</td>
                            </tr>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>ITAES-EST-04</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Estándares de Acreditación de Establecimientos de Salud — ITAES</td>
                            </tr>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>ITYS-05</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Procedimiento Operativo de Seguridad, Acceso y Confidencialidad en Sistemas</td>
                            </tr>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>ADM-QUI-02</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Procedimiento de Admisión Quirúrgica y Circuito de Triage de Fojas</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Contenido Exhaustivo */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 6px 0' }}>1. OBJETIVO DEL MANUAL:</h3>
                            <p style={{ margin: 0, paddingLeft: '14px', textAlign: 'justify', color: '#1F2937' }}>
                                Establecer los procedimientos operativos estandarizados, responsabilidades funcionales y pautas de control para la totalidad de módulos que conforman el Sistema de Admisión Quirúrgica y Control Administrativo (ADM-QUI) del Sanatorio Argentino. Este manual sirve de guía de trabajo obligatoria para todo el personal asistencial y administrativo, garantizando la trazabilidad de historias clínicas, la precisión en facturación y el cumplimiento de las normativas de acreditación hospitalaria ITAES.
                            </p>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 6px 0' }}>2. CAMPO DE APLICACIÓN Y ALCANCE:</h3>
                            <p style={{ margin: 0, paddingLeft: '14px', textAlign: 'justify', color: '#1F2937' }}>
                                Este manual es de aplicación directa y obligatoria para las áreas de: Innovación y Transformación Digital, Admisión Central y Quirúrgica, Recepción y Gestión de Turnos, Control de Altas Administrativas, Facturación Internado, Quirófanos Centrales, Laboratorios de Anatomía Patológica, Auditoría Médica y Recuperación de Cuentas del Sanatorio Argentino SRL.
                            </p>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 6px 0' }}>3. DEFINICIONES Y GLOSARIO DE TÉRMINOS:</h3>
                            <ul style={{ margin: 0, paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '4px', color: '#1F2937' }}>
                                <li><strong>ADM-QUI:</strong> Plataforma web integral para gestión de admisiones quirúrgicas, turnos, altas y facturación.</li>
                                <li><strong>SALUS:</strong> Sistema hospitalario central (SQL Server) fuente de datos demográficos y de internación.</li>
                                <li><strong>BETO IA:</strong> Asistente virtual con Inteligencia Artificial integrado exclusivamente a ADM-QUI para soporte y analítica.</li>
                                <li><strong>CONTROL DE ALTAS:</strong> Auditoría administrativa previa al traspaso de expedientes hospitalarios a Facturación.</li>
                                <li><strong>PARTICULAR (042):</strong> Paciente sin cobertura de obra social o con cliente registrado con su propio nombre.</li>
                                <li><strong>REMITO DE TRASPASO:</strong> Acta digital formal con código oficial (TRASP-YYYYMMDD-XXXX) y firmas de entrega y recepción.</li>
                                <li><strong>REMITO DE DEVOLUCIÓN:</strong> Constancia digital de rechazo de ficha desde Facturación hacia Control de Altas.</li>
                                <li><strong>TRIAGE DE FOJA:</strong> Análisis y detección inteligente de insumos protésicos y biopsias desde fojas quirúrgicas.</li>
                                <li><strong>META CLOUD API:</strong> Protocolo oficial de mensajería empresarial de WhatsApp sujeto a la ventana de 24 horas.</li>
                                <li><strong>LUP (Lección de Un Punto):</strong> Documento instructivo focalizado en un único procedimiento específico.</li>
                                <li><strong>ITAES:</strong> Instituto Técnico para la Acreditación de Establecimientos de Salud.</li>
                            </ul>
                        </div>

                        {/* Procedimientos Módulo por Módulo */}
                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 12px 0' }}>4. PROCEDIMIENTOS OPERATIVOS EXHAUSTIVOS (MÓDULO POR MÓDULO):</h3>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', paddingLeft: '10px' }}>
                                {SISTEMA_MODULOS.map((mod, mIdx) => (
                                    <div key={mIdx} style={{ borderLeft: `3px solid ${mod.color}`, paddingLeft: '14px' }}>
                                        <strong style={{ color: mod.color, fontSize: '13px' }}>{mod.titulo}:</strong>
                                        <p style={{ margin: '3px 0 8px 0', color: '#374151', fontSize: '12px' }}>{mod.resumen}</p>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {mod.submodulos.map((sub, sIdx) => (
                                                <div key={sIdx} style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: '6px', fontSize: '11.5px' }}>
                                                    <div style={{ fontWeight: 'bold', color: '#1E293B' }}>▸ {sub.nombre}</div>
                                                    <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px', color: '#4B5563' }}>
                                                        {sub.procedimiento.map((p, pIdx) => (
                                                            <li key={pIdx}>{p}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Contingencias */}
                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 6px 0' }}>5. PLAN DE CONTINGENCIA ANTE FALLAS DE SISTEMA:</h3>
                            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', fontSize: '11px' }}>
                                <thead>
                                    <tr style={{ background: '#E5E7EB' }}>
                                        <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left', width: '30%', fontWeight: 700 }}>Incidencia Técnica</th>
                                        <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left', width: '50%', fontWeight: 700 }}>Procedimiento de Contingencia</th>
                                        <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', width: '20%', fontWeight: 700 }}>Responsable</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700 }}>Caída de sync-server SALUS</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Ejecutar script local "Actualizar SALUS.bat" y verificar log de conexión SQL</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Operador / Innovación</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700 }}>Corte de conectividad a Internet</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Registrar admisiones en planillas de contingencia manual hasta restablecimiento</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Personal de Admisión</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700 }}>Expiración ventana 24hs WhatsApp</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Utilizar exclusivamente plantillas oficiales HSM aprobadas en el módulo de Mensajería</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Operador Mensajería</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700 }}>Falla de pantalla de turnos</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Realizar llamado a viva voz indicando número de turno y Box correspondiente</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Recepción Central</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pie de Firmas Oficial */}
                    <div style={{ marginTop: '30px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', fontSize: '11px' }}>
                            <tbody>
                                <tr style={{ height: '90px' }}>
                                    <td style={{ border: '1.5px solid #000', width: '33.33%', padding: '6px', verticalAlign: 'top', position: 'relative' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 600 }}>ELABORADO:</div>
                                        <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center' }}>
                                            <div style={{ fontWeight: 800, fontSize: '12px' }}>{DOC_META.elaboro}</div>
                                            <div style={{ fontSize: '9.5px', color: '#4B5563', marginTop: '2px', fontWeight: 500 }}>{DOC_META.elaboroCargo}</div>
                                        </div>
                                    </td>
                                    <td style={{ border: '1.5px solid #000', width: '33.33%', padding: '6px', verticalAlign: 'top', position: 'relative' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 600 }}>REVISADO:</div>
                                        <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center' }}>
                                            <div style={{ fontWeight: 800, fontSize: '12px' }}>{DOC_META.reviso}</div>
                                            <div style={{ fontSize: '9.5px', color: '#4B5563', marginTop: '2px', fontWeight: 500 }}>{DOC_META.revisoCargo}</div>
                                        </div>
                                    </td>
                                    <td style={{ border: '1.5px solid #000', width: '33.33%', padding: '6px', verticalAlign: 'top', position: 'relative' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 600 }}>APROBADO:</div>
                                        <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center' }}>
                                            <div style={{ fontWeight: 800, fontSize: '12px' }}>{DOC_META.aprobo}</div>
                                            <div style={{ fontSize: '9.5px', color: '#4B5563', marginTop: '2px', fontWeight: 500 }}>{DOC_META.aproboCargo}</div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 3: Diagramas de Flujo Interactivos */}
            {activeTab === 'diagramas' && (
                <div style={{
                    width: '100%',
                    maxWidth: '1100px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px'
                }}>
                    {/* Diagrama 1: Flujo General */}
                    <div style={{ background: '#FFF', borderRadius: '14px', padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <Layers color="#1E5799" size={20} />
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>1. Diagrama General del Flujo Hospitalario en ADM-QUI</h3>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'center' }}>
                            <div style={{ background: '#EFF6FF', border: '1.5px solid #93C5FD', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase' }}>Paso 1</div>
                                <div style={{ fontWeight: 800, color: '#1E3A8A', marginTop: '4px' }}>SALUS Sync</div>
                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>Sincronización en tiempo real SQL Server</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center' }}><ArrowRight color="#94A3B8" /></div>
                            <div style={{ background: '#ECFDF5', border: '1.5px solid #6EE7B7', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065F46', textTransform: 'uppercase' }}>Paso 2</div>
                                <div style={{ fontWeight: 800, color: '#064E3B', marginTop: '4px' }}>Turnos & Admisión</div>
                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>Tótem táctil y Boxes 1-8</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center' }}><ArrowRight color="#94A3B8" /></div>
                            <div style={{ background: '#F5F3FF', border: '1.5px solid #C4B5FD', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5B21B6', textTransform: 'uppercase' }}>Paso 3</div>
                                <div style={{ fontWeight: 800, color: '#4C1D95', marginTop: '4px' }}>Control de Altas</div>
                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>Auditoría 042 y Remito TRASP</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center' }}><ArrowRight color="#94A3B8" /></div>
                            <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>Paso 4</div>
                                <div style={{ fontWeight: 800, color: '#7F1D1D', marginTop: '4px' }}>Facturación SALUS</div>
                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>Detección PDV 21/31 / Devolución</div>
                            </div>
                        </div>
                    </div>

                    {/* Diagrama 2: Pipeline de Cirugías */}
                    <div style={{ background: '#FFF', borderRadius: '14px', padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <Stethoscope color="#1E5799" size={20} />
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>2. Pipeline Quirúrgico por Estados WhatsApp</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 160px', background: '#F3E8FF', border: '1.5px solid #D8B4FE', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontWeight: 800, color: '#6B21A8' }}>🟣 Lila: Sin Mensaje</div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#581C87' }}>Importado de SALUS. Revisar número de celular.</p>
                            </div>
                            <div style={{ flex: '1 1 160px', background: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontWeight: 800, color: '#92400E' }}>🟡 Amarillo: En Revisión</div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#78350F' }}>Mensaje prequirúrgico emitido. Esperando órdenes.</p>
                            </div>
                            <div style={{ flex: '1 1 160px', background: '#DCFCE7', border: '1.5px solid #86EFAC', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontWeight: 800, color: '#166534' }}>🟢 Verde: Autorizada</div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#14532D' }}>Cobertura validada y quirófano reservado.</p>
                            </div>
                            <div style={{ flex: '1 1 160px', background: '#DBEAFE', border: '1.5px solid #93C5FD', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontWeight: 800, color: '#1E40AF' }}>🔵 Azul: Confirmada</div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#1E3A8A' }}>Paciente ratificó asistencia y ayuno preoperatorio.</p>
                            </div>
                            <div style={{ flex: '1 1 160px', background: '#FEE2E2', border: '1.5px solid #FCA5A5', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontWeight: 800, color: '#991B1B' }}>🔴 Rojo: Alerta</div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#7F1D1D' }}>Cirugía suspendida o reprogramada.</p>
                            </div>
                        </div>
                    </div>

                    {/* Diagrama 3: Circuito de Traspaso y Devolución */}
                    <div style={{ background: '#FFF', borderRadius: '14px', padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <FileCheck2 color="#1E5799" size={20} />
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>3. Circuito Cerrado de Traspaso y Devolución de Historias Clínicas</h3>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center' }}>
                            <div style={{ background: '#F8FAFC', border: '2px dashed #94A3B8', borderRadius: '12px', padding: '16px' }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#1E293B', fontWeight: 800 }}>Control de Altas Administrativas</h4>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: '#475569' }}>
                                    <li>Auditoría médica y administrativa</li>
                                    <li>Mapeo automático a Particular (042)</li>
                                    <li>Generación de Remito TRASP con 2 firmas</li>
                                </ul>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16A34A', background: '#DCFCE7', padding: '2px 8px', borderRadius: '6px' }}>TRASP (Pase) ➔</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 8px', borderRadius: '6px' }}>⬅ DEV (Rechazo)</span>
                            </div>
                            <div style={{ background: '#F8FAFC', border: '2px dashed #94A3B8', borderRadius: '12px', padding: '16px' }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#1E293B', fontWeight: 800 }}>Facturación Internado</h4>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: '#475569' }}>
                                    <li>Asignación a analistas liquidadores</li>
                                    <li>Detección de facturas SALUS PDV 21/31</li>
                                    <li>Carrito de Devolución con motivo formal</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600;1,700&display=swap');
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @media print {
                    body { background: white !important; padding: 0 !important; font-family: 'Montserrat', sans-serif !important; }
                    button, .no-print { display: none !important; }
                }
            `}</style>
        </div>
    );
}
