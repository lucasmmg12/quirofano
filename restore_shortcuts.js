/**
 * Script de restauración de atajos de WhatsApp
 * Recupera las 21 plantillas originales del sistema ADM-QUI
 * que fueron borradas accidentalmente el 29/04/2026
 * 
 * Usa UPSERT para no duplicar las que ya existan
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDIyNzQsImV4cCI6MjA4NTYxODI3NH0.-85OS1dohc9gh4U4qBhEBlqHi9Bq7l7H6JnzcUzrCIg';
const supabase = createClient(supabaseUrl, supabaseKey);

const originalShortcuts = [
  // === DOCUMENTACIÓN ===
  {
    shortcut: '/9',
    label: 'Solicitud de documentación',
    message: 'Estimado/a,\n\nBuenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino.\n\nPara confirmar su turno quirúrgico programado para el día /, solicitamos que nos envíe:\n\n1. Imagen del Pedido Médico\n2. Imagen/Archivo de la Autorización correspondiente de cirugía\n3. Presupuesto autorizado (si aplica)\n\nEs importante destacar que sin la correspondiente autorización, *no podremos confirmar su turno quirúrgico*.\n\n*Asesoramiento en gestión de autorizaciones:*\n\nPara evitar inconvenientes, sugerimos en primera instancia acercarse a nuestras oficinas para que nuestro equipo lo asesore en la gestión de autorizaciones.\n\n¡Saludos cordiales! 😊',
    category: 'documentacion',
    sort_order: 1,
    is_active: true
  },
  {
    shortcut: '/reitero',
    label: 'Reiterar documentación',
    message: 'Nos encontramos a la espera de la documentación solicitada para poder confirmar su turno quirúrgico programado.\nEs importante contar con la misma a la brevedad para el seguimiento administrativo y la correcta confirmación de su intervención.\nLe solicitamos por favor nos envíe la documentación pendiente o confirme la recepción de este mensaje.',
    category: 'documentacion',
    sort_order: 2,
    is_active: true
  },

  // === OBRA SOCIAL ===
  {
    shortcut: '/AUDITORIA',
    label: 'Auditoría Obra Social Provincia',
    message: 'Estimado/a, Buenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino. Para confirmar su turno quirúrgico programado para el día / Le informamos que su gestión de cirugía requiere autorización de *Obra Social Provincia*. Por los plazos, sugerimos que se dirija a su obra social con la documentación para que *Auditoria de Obra Social Provincia* autorice de manera presencial con *FIRMA Y SELLO DE MEDICO AUDITOR* su pedido de cirugía. Por favor una vez que obtenga dicha autorización *acercarse por Administración* para emitir presupuesto correspondientes por diferencias que no cubre su obra social y/o Coseguro. Es importante destacar que *sin la correspondiente autorización, no podremos confirmar su turno quirúrgico*.',
    category: 'obra_social',
    sort_order: 3,
    is_active: true
  },
  {
    shortcut: '/PENDIENTE',
    label: 'Pendiente de autorización',
    message: 'Estimado/a, Buenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino. Para confirmar su turno quirúrgico programado para el día / Le informamos que su gestión de cirugía aún se encuentra pendiente de autorización en el sistema de *Obra Social Provincia*. Por los plazos, sugerimos que se comunique o se dirija a su obra social con la documentación para que Auditoria de Obra Social provincia autorice de manera presencial con *FIRMA Y SELLO DE MEDICO AUDITOR* su pedido de cirugía. Por Favor una vez que obtenga novedades *acercarse por Administración* para emitir presupuesto correspondientes por diferencias que no cubre su obra social y/o Coseguro. Es importante destacar que *sin la correspondiente autorización, no podremos confirmar su turno quirúrgico*.',
    category: 'obra_social',
    sort_order: 4,
    is_active: true
  },
  {
    shortcut: '/RECHAZADO',
    label: 'Rechazado / Pendiente OS',
    message: 'Estimado/a, Buenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino. Para confirmar su turno quirúrgico programado para el día / Le informamos que su gestión de cirugía aún se encuentra pendiente de autorización en el sistema de *Obra Social Provincia*. Por los plazos, sugerimos que se comunique o se dirija a su obra social con la documentación para que Auditoria de Obra Social provincia autorice de manera presencial con *FIRMA Y SELLO DE MEDICO AUDITOR* su pedido de cirugía. Por Favor una vez que obtenga novedades *acercarse por Administración* para emitir presupuesto correspondientes por diferencias que no cubre su obra social y/o Coseguro. Es importante destacar que *sin la correspondiente autorización, no podremos confirmar su turno quirúrgico*.',
    category: 'obra_social',
    sort_order: 5,
    is_active: true
  },
  {
    shortcut: '/10dias',
    label: 'Vigencia 10 días OS',
    message: 'Buenos días 😊. Nos comunicamos desde Administración del Sanatorio Argentino.\nEn relación a su turno quirúrgico programado para el día ___, le informamos que su obra social autoriza la cirugía con una vigencia de 10 días posteriores a la fecha de carga.\nDebido a que la fecha actual de su turno se encuentra fuera de ese plazo autorizado y no es posible modificar dicha vigencia, se imposibilita la realización de la intervención en la fecha prevista.\nSugerimos reprogramar su turno quirúrgico a partir de la fecha habilitada por la autorización vigente.\nLe solicitamos por favor confirmar la recepción de este mensaje.\nQuedamos a disposición para coordinar la nueva fecha.',
    category: 'obra_social',
    sort_order: 6,
    is_active: true
  },
  {
    shortcut: '/NOVEDADES',
    label: 'Consultar novedades OS',
    message: 'Buenos dias, ¿Obtuvo novedades por parte de su obra social?',
    category: 'obra_social',
    sort_order: 7,
    is_active: true
  },

  // === DAMSU ===
  {
    shortcut: '/DAMSU',
    label: 'Autorización DAMSU',
    message: 'Estimado/a,\n\nBuenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino.\n\nPara confirmar su turno quirúrgico programado para el día /\n\nLe informamos que su gestión de cirugía requiere autorización de *DAMSU*.\n\nDebe acercarse por nuestras oficinas con pedido medico y estudios previos para proceder con la carga correspondiente en el sistema de DAMSU.\n\nEs importante destacar que *sin la correspondiente autorización, no podremos confirmar su turno quirúrgico*.',
    category: 'damsu',
    sort_order: 8,
    is_active: true
  },
  {
    shortcut: '/DAMSUCOPAGO',
    label: 'Copago DAMSU',
    message: '⚠️ A partir del dia 1/12/2023 se cobrará *Protocolo de Seguridad y Calidad* por procedimiento mediante internación. El mismo no posee cobertura por su obra social. *Valor $30.000* Puede ser abonado en _Efectivo, debito y tarjeta de Credito_ en *RECEPCION* al momento del ingreso. _Queda debidamente notificado._',
    category: 'damsu',
    sort_order: 9,
    is_active: true
  },

  // === PAGOS Y PRESUPUESTOS ===
  {
    shortcut: '/PAIMN',
    label: 'Pago sin autorización previa',
    message: 'Estimado/a,\n\nBuenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino para confirmar su turno quirúrgico programado para el día /.\n\nDocumentación necesaria para la internación\n\nPor favor, tenga presente los siguientes documentos que deberá presentar en recepción el día de la internación:\n\n* DNI\n* Carnet de obra social\n* Carnet de coseguro\n* Recibo de sueldo o recibo de pago donde figure el descuento de obra social\n* Libreta sanitaria completa\n\nPagos a realizar\n\nTenga en cuenta que su cirugía no requiere de autorización previa, deberá abonar los siguientes servicios:\n\n* Servicio de categorización habitación compartida: $47.000\n* Laboratorio (en caso de no poseer coseguro): $10.000\n* Patólogo (en caso de no poseer coseguro): $13.000\n* Instrumentadora: $47.000\n* Deposito Laboratorio $52.000\n\nImportante\n\n* Si se realiza ligadura de trompas, deberá dirigirse a Administración para gestionar las autorizaciones correspondientes.\n* Los pagos se realizan al momento de ingreso y se aceptan efectivo, débito y crédito.\n\nConfirmación de turno\n\nPara confirmar su turno quirúrgico, por favor responda a este mensaje con "*CONFIRMO TURNO*".\n\n¡Saludos cordiales!',
    category: 'pagos',
    sort_order: 10,
    is_active: true
  },
  {
    shortcut: '/PARTICULAR',
    label: 'Cirugía particular',
    message: 'Estimado/a, Buenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino con motivo de su cirugía programada día /. Importante: Pago y requisitos para cirugía particular Recuerde que, al ser una cirugía particular, es necesario tener cancelado el presupuesto emitido por Administración antes del ingreso. Asegúrese de cumplir con todos los requisitos solicitados en el presupuesto. Documentación necesaria para la internación Por favor, tenga presente los siguientes documentos que deberá presentar al momento de la internación: 1. DNI 2. Recibo de sueldo activo (paciente o tercero) que sirva de garantía, el cual deberá ser firmado al momento de ingreso Confirmación de turno Para confirmar su turno quirúrgico, por favor responda a este mensaje con "CONFIRMO TURNO". ¡Saludos cordiales! 😊',
    category: 'pagos',
    sort_order: 11,
    is_active: true
  },
  {
    shortcut: '/MATERNIDAD',
    label: 'Presupuesto maternidad',
    message: 'Estimado/a, Buenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino con motivo de su cirugía programada día /. Importante: Pago y requisitos para cirugía particular Recuerde que, al poseer PRESUPUESTO POR MATERNIDAD, es necesario tener cancelado el presupuesto emitido por Administración antes del ingreso. Asegúrese de cumplir con todos los requisitos solicitados. Documentación necesaria para la internación Por favor, tenga presente los siguientes documentos que deberá presentar al momento de la internación: 1. DNI 2. Recibo de sueldo activo (paciente o tercero) que sirva de garantía, el cual deberá ser firmado al momento de ingreso. 3. Factura de pagos de Presupuesto por maternidad 4. Factura de ANESTESIA emitida por Administracion. Confirmación de turno Para confirmar su turno quirúrgico, por favor responda a este mensaje con "CONFIRMO TURNO". ¡Saludos cordiales! 😊',
    category: 'pagos',
    sort_order: 12,
    is_active: true
  },
  {
    shortcut: '/DEPOSITO',
    label: 'Depósito sin autorización',
    message: 'Estimado/a, Buenos días. Nos comunicamos desde Administración de Sanatorio Argentino con motivo de su turno quirúrgico programado día /. *Importante: Requisitos para la cirugía* En caso de no poseer autorización emitida por su obra social, deberá: - Abonar un depósito de $90,000 - Firmar una garantía con recibo de sueldo de titular *Reintegro del depósito* El depósito se reintegrará una vez que su obra social autorice el procedimiento. *Consulta previa* Es importante que consulte previamente si corresponde abonar el servicio de categorización conforme a su obra social. *Confirmación de turno* Por favor, confirme su turno quirúrgico enviando *"CONFIRMO TURNO"*. ¡Saludos cordiales!',
    category: 'pagos',
    sort_order: 13,
    is_active: true
  },

  // === CONFIRMACIONES ===
  {
    shortcut: '/CONFIRMACION',
    label: 'Solicitar confirmación',
    message: 'Estimado/a,\n\nBuenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino.\n\nPara confirmar su turno quirúrgico programado para el día /, solicitamos que nos envíe:\n\n*CONFIRMO TURNO*\n\nEn breve, recibirá las indicaciones correspondientes a su intervención.',
    category: 'confirmacion',
    sort_order: 14,
    is_active: true
  },
  {
    shortcut: '/CONFIRMO',
    label: 'Pedir confirmación breve',
    message: 'Por favor confirme asistencia a su turno quirúrgico enviando:\n\n*CONFIRMO TURNO*\n\nEn breve, recibirá las indicaciones correspondientes a su intervención.',
    category: 'confirmacion',
    sort_order: 15,
    is_active: true
  },
  {
    shortcut: '/CONFIRMACIONPV',
    label: 'Confirmación presupuesto vencido',
    message: 'Buenos días 😊. Nos comunicamos desde Administración del Sanatorio Argentino.\nPara confirmar su turno quirúrgico programado para el día ___, le solicitamos que nos responda el siguiente mensaje:\nCONFIRMO TURNO\nAsimismo, le informamos que su presupuesto se encuentra vencido. Será necesario realizar la actualización correspondiente en la oficina de Administración antes del ingreso.\nLa falta de actualización podrá generar demoras en el proceso de admisión el día de su intervención.\nEn breve, recibirá las indicaciones prequirúrgicas correspondientes.\nQuedamos a disposición ante cualquier consulta.',
    category: 'confirmacion',
    sort_order: 16,
    is_active: true
  },

  // === INFORMACIÓN ===
  {
    shortcut: '/CATE',
    label: 'Precios categorización',
    message: '▪️ *Servicio de Categorización Institucional* 🔖\n\n▪️ *Habitacion compartida* $47000.\n\n▪️ *Habitación individual* $124000.\n\n▪️ *Habitación Suite* $140000.',
    category: 'info',
    sort_order: 17,
    is_active: true
  },
  {
    shortcut: '/CATEGORIZACION',
    label: 'Explicación categorización',
    message: 'El *servicio de categorizacion* refiere al *servicio de calidad y seguridad* enfocado en el *paciente*. El mismo cuenta con acreditación *ITAES* , lo cual *su cobertura dependerá de su obra social*. El valor del mismo se categoriza *según el tipo de habitación* que el paciente elige para su *estadía en nuestra institucion*.',
    category: 'info',
    sort_order: 18,
    is_active: true
  },
  {
    shortcut: '/LLAMADAS',
    label: 'No recibimos llamadas',
    message: '⚠ *_Disculpe, no recibimos llamadas ni mensajes de voz por esta vía._* 🔇',
    category: 'info',
    sort_order: 19,
    is_active: true
  }
];

async function restoreShortcuts() {
  console.log('🔄 Restaurando atajos de WhatsApp del sistema ADM-QUI...');
  console.log(`   Total a restaurar: ${originalShortcuts.length} plantillas\n`);

  // Primero veamos qué hay actualmente
  const { data: existing, error: fetchErr } = await supabase
    .from('whatsapp_shortcuts')
    .select('shortcut, label')
    .order('sort_order');

  if (fetchErr) {
    console.error('❌ Error leyendo la base:', fetchErr.message);
    return;
  }

  console.log(`📊 Plantillas actuales en la BD: ${existing?.length || 0}`);
  if (existing?.length) {
    existing.forEach(s => console.log(`   ✓ ${s.shortcut} — ${s.label}`));
  }
  console.log('');

  // Insertar con upsert (ON CONFLICT en shortcut)
  const { data, error } = await supabase
    .from('whatsapp_shortcuts')
    .upsert(originalShortcuts, { onConflict: 'shortcut' })
    .select('shortcut, label');

  if (error) {
    console.error('❌ Error restaurando:', error.message);
    return;
  }

  console.log(`✅ ${data.length} plantillas restauradas exitosamente:\n`);
  data.forEach((s, i) => console.log(`   ${i + 1}. ${s.shortcut} — ${s.label}`));

  // Verificación final
  const { data: final } = await supabase
    .from('whatsapp_shortcuts')
    .select('shortcut, label, category')
    .order('sort_order');

  console.log(`\n📋 Total de plantillas en la BD ahora: ${final?.length || 0}`);
  
  // Agrupar por categoría
  const byCategory = {};
  final?.forEach(s => {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category].push(s.shortcut);
  });
  
  console.log('\n📁 Distribución por categoría:');
  Object.entries(byCategory).forEach(([cat, shortcuts]) => {
    console.log(`   ${cat}: ${shortcuts.length} (${shortcuts.join(', ')})`);
  });
}

restoreShortcuts();
