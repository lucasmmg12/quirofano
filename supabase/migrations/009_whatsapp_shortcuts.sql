-- =============================================
-- 009: WhatsApp Shortcuts (Atajos de Mensajes Rápidos)
-- Similar a WhatsApp Business quick replies
-- Se activan al escribir "/" en el composer del chat
-- =============================================

CREATE TABLE IF NOT EXISTS whatsapp_shortcuts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shortcut    TEXT NOT NULL UNIQUE,             -- El comando: /saludo, /turno, etc.
    label       TEXT NOT NULL,                    -- Nombre visible: "Saludo inicial", "Confirmar turno"
    message     TEXT NOT NULL,                    -- Cuerpo completo del mensaje
    category    TEXT DEFAULT 'general',           -- Categoría para agrupar: 'saludo', 'turno', 'info'
    sort_order  INT DEFAULT 0,                   -- Orden de aparición en la lista
    is_active   BOOLEAN DEFAULT TRUE,             -- Para activar/desactivar sin borrar
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_whatsapp_shortcuts_category ON whatsapp_shortcuts(category);
CREATE INDEX IF NOT EXISTS idx_whatsapp_shortcuts_active ON whatsapp_shortcuts(is_active) WHERE is_active = TRUE;

-- RLS: permitir lectura y escritura desde el sistema
ALTER TABLE whatsapp_shortcuts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_whatsapp_shortcuts" ON whatsapp_shortcuts
    FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- DATOS INICIALES — Plantillas operativas
-- =============================================
INSERT INTO whatsapp_shortcuts (shortcut, label, message, category, sort_order) VALUES

-- === DOCUMENTACIÓN ===
('/9', 'Solicitud de documentación', E'Estimado/a,\n\nBuenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino.\n\nPara confirmar su turno quirúrgico programado para el día /, solicitamos que nos envíe:\n\n1. Imagen del Pedido Médico\n2. Imagen/Archivo de la Autorización correspondiente de cirugía\n3. Presupuesto autorizado (si aplica)\n\nEs importante destacar que sin la correspondiente autorización, *no podremos confirmar su turno quirúrgico*.\n\n*Asesoramiento en gestión de autorizaciones:*\n\nPara evitar inconvenientes, sugerimos en primera instancia acercarse a nuestras oficinas para que nuestro equipo lo asesore en la gestión de autorizaciones.\n\n¡Saludos cordiales! 😊', 'documentacion', 1),

('/reitero', 'Reiterar documentación', E'Nos encontramos a la espera de la documentación solicitada para poder confirmar su turno quirúrgico programado.\nEs importante contar con la misma a la brevedad para el seguimiento administrativo y la correcta confirmación de su intervención.\nLe solicitamos por favor nos envíe la documentación pendiente o confirme la recepción de este mensaje.', 'documentacion', 2),

-- === OBRA SOCIAL ===
('/AUDITORIA', 'Auditoría Obra Social Provincia', E'Estimado/a, Buenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino. Para confirmar su turno quirúrgico programado para el día / Le informamos que su gestión de cirugía requiere autorización de *Obra Social Provincia*. Por los plazos, sugerimos que se dirija a su obra social con la documentación para que *Auditoria de Obra Social Provincia* autorice de manera presencial con *FIRMA Y SELLO DE MEDICO AUDITOR* su pedido de cirugía. Por favor una vez que obtenga dicha autorización *acercarse por Administración* para emitir presupuesto correspondientes por diferencias que no cubre su obra social y/o Coseguro. Es importante destacar que *sin la correspondiente autorización, no podremos confirmar su turno quirúrgico*.', 'obra_social', 3),

('/PENDIENTE', 'Pendiente de autorización', E'Estimado/a, Buenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino. Para confirmar su turno quirúrgico programado para el día / Le informamos que su gestión de cirugía aún se encuentra pendiente de autorización en el sistema de *Obra Social Provincia*. Por los plazos, sugerimos que se comunique o se dirija a su obra social con la documentación para que Auditoria de Obra Social provincia autorice de manera presencial con *FIRMA Y SELLO DE MEDICO AUDITOR* su pedido de cirugía. Por Favor una vez que obtenga novedades *acercarse por Administración* para emitir presupuesto correspondientes por diferencias que no cubre su obra social y/o Coseguro. Es importante destacar que *sin la correspondiente autorización, no podremos confirmar su turno quirúrgico*.', 'obra_social', 4),

('/RECHAZADO', 'Rechazado / Pendiente OS', E'Estimado/a, Buenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino. Para confirmar su turno quirúrgico programado para el día / Le informamos que su gestión de cirugía aún se encuentra pendiente de autorización en el sistema de *Obra Social Provincia*. Por los plazos, sugerimos que se comunique o se dirija a su obra social con la documentación para que Auditoria de Obra Social provincia autorice de manera presencial con *FIRMA Y SELLO DE MEDICO AUDITOR* su pedido de cirugía. Por Favor una vez que obtenga novedades *acercarse por Administración* para emitir presupuesto correspondientes por diferencias que no cubre su obra social y/o Coseguro. Es importante destacar que *sin la correspondiente autorización, no podremos confirmar su turno quirúrgico*.', 'obra_social', 5),

('/10dias', 'Vigencia 10 días OS', E'Buenos días 😊. Nos comunicamos desde Administración del Sanatorio Argentino.\nEn relación a su turno quirúrgico programado para el día ___, le informamos que su obra social autoriza la cirugía con una vigencia de 10 días posteriores a la fecha de carga.\nDebido a que la fecha actual de su turno se encuentra fuera de ese plazo autorizado y no es posible modificar dicha vigencia, se imposibilita la realización de la intervención en la fecha prevista.\nSugerimos reprogramar su turno quirúrgico a partir de la fecha habilitada por la autorización vigente.\nLe solicitamos por favor confirmar la recepción de este mensaje.\nQuedamos a disposición para coordinar la nueva fecha.', 'obra_social', 6),

('/NOVEDADES', 'Consultar novedades OS', E'Buenos dias, ¿Obtuvo novedades por parte de su obra social?', 'obra_social', 7),

-- === DAMSU ===
('/DAMSU', 'Autorización DAMSU', E'Estimado/a,\n\nBuenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino.\n\nPara confirmar su turno quirúrgico programado para el día /\n\nLe informamos que su gestión de cirugía requiere autorización de *DAMSU*.\n\nDebe acercarse por nuestras oficinas con pedido medico y estudios previos para proceder con la carga correspondiente en el sistema de DAMSU.\n\nEs importante destacar que *sin la correspondiente autorización, no podremos confirmar su turno quirúrgico*.', 'damsu', 8),

('/DAMSUCOPAGO', 'Copago DAMSU', E'⚠️ A partir del dia 1/12/2023 se cobrará *Protocolo de Seguridad y Calidad* por procedimiento mediante internación. El mismo no posee cobertura por su obra social. *Valor $30.000* Puede ser abonado en _Efectivo, debito y tarjeta de Credito_ en *RECEPCION* al momento del ingreso. _Queda debidamente notificado._', 'damsu', 9),

-- === PAGOS Y PRESUPUESTOS ===
('/PAIMN', 'Pago sin autorización previa', E'Estimado/a,\n\nBuenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino para confirmar su turno quirúrgico programado para el día /.\n\nDocumentación necesaria para la internación\n\nPor favor, tenga presente los siguientes documentos que deberá presentar en recepción el día de la internación:\n\n* DNI\n* Carnet de obra social\n* Carnet de coseguro\n* Recibo de sueldo o recibo de pago donde figure el descuento de obra social\n* Libreta sanitaria completa\n\nPagos a realizar\n\nTenga en cuenta que su cirugía no requiere de autorización previa, deberá abonar los siguientes servicios:\n\n* Servicio de categorización habitación compartida: $47.000\n* Laboratorio (en caso de no poseer coseguro): $10.000\n* Patólogo (en caso de no poseer coseguro): $13.000\n* Instrumentadora: $47.000\n* Deposito Laboratorio $52.000\n\nImportante\n\n* Si se realiza ligadura de trompas, deberá dirigirse a Administración para gestionar las autorizaciones correspondientes.\n* Los pagos se realizan al momento de ingreso y se aceptan efectivo, débito y crédito.\n\nConfirmación de turno\n\nPara confirmar su turno quirúrgico, por favor responda a este mensaje con "*CONFIRMO TURNO*".\n\n¡Saludos cordiales!', 'pagos', 10),

('/PARTICULAR', 'Cirugía particular', E'Estimado/a, Buenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino con motivo de su cirugía programada día /. Importante: Pago y requisitos para cirugía particular Recuerde que, al ser una cirugía particular, es necesario tener cancelado el presupuesto emitido por Administración antes del ingreso. Asegúrese de cumplir con todos los requisitos solicitados en el presupuesto. Documentación necesaria para la internación Por favor, tenga presente los siguientes documentos que deberá presentar al momento de la internación: 1. DNI 2. Recibo de sueldo activo (paciente o tercero) que sirva de garantía, el cual deberá ser firmado al momento de ingreso Confirmación de turno Para confirmar su turno quirúrgico, por favor responda a este mensaje con "CONFIRMO TURNO". ¡Saludos cordiales! 😊', 'pagos', 11),

('/MATERNIDAD', 'Presupuesto maternidad', E'Estimado/a, Buenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino con motivo de su cirugía programada día /. Importante: Pago y requisitos para cirugía particular Recuerde que, al poseer PRESUPUESTO POR MATERNIDAD, es necesario tener cancelado el presupuesto emitido por Administración antes del ingreso. Asegúrese de cumplir con todos los requisitos solicitados. Documentación necesaria para la internación Por favor, tenga presente los siguientes documentos que deberá presentar al momento de la internación: 1. DNI 2. Recibo de sueldo activo (paciente o tercero) que sirva de garantía, el cual deberá ser firmado al momento de ingreso. 3. Factura de pagos de Presupuesto por maternidad 4. Factura de ANESTESIA emitida por Administracion. Confirmación de turno Para confirmar su turno quirúrgico, por favor responda a este mensaje con "CONFIRMO TURNO". ¡Saludos cordiales! 😊', 'pagos', 12),

('/DEPOSITO', 'Depósito sin autorización', E'Estimado/a, Buenos días. Nos comunicamos desde Administración de Sanatorio Argentino con motivo de su turno quirúrgico programado día /. *Importante: Requisitos para la cirugía* En caso de no poseer autorización emitida por su obra social, deberá: - Abonar un depósito de $90,000 - Firmar una garantía con recibo de sueldo de titular *Reintegro del depósito* El depósito se reintegrará una vez que su obra social autorice el procedimiento. *Consulta previa* Es importante que consulte previamente si corresponde abonar el servicio de categorización conforme a su obra social. *Confirmación de turno* Por favor, confirme su turno quirúrgico enviando *"CONFIRMO TURNO"*. ¡Saludos cordiales!', 'pagos', 13),

-- === CONFIRMACIONES ===
('/CONFIRMACION', 'Solicitar confirmación', E'Estimado/a,\n\nBuenos días 😊. Nos comunicamos desde Administración de Sanatorio Argentino.\n\nPara confirmar su turno quirúrgico programado para el día /, solicitamos que nos envíe:\n\n*CONFIRMO TURNO*\n\nEn breve, recibirá las indicaciones correspondientes a su intervención.', 'confirmacion', 14),

('/CONFIRMO', 'Pedir confirmación breve', E'Por favor confirme asistencia a su turno quirúrgico enviando:\n\n*CONFIRMO TURNO*\n\nEn breve, recibirá las indicaciones correspondientes a su intervención.', 'confirmacion', 15),

('/CONFIRMACIONPV', 'Confirmación presupuesto vencido', E'Buenos días 😊. Nos comunicamos desde Administración del Sanatorio Argentino.\nPara confirmar su turno quirúrgico programado para el día ___, le solicitamos que nos responda el siguiente mensaje:\nCONFIRMO TURNO\nAsimismo, le informamos que su presupuesto se encuentra vencido. Será necesario realizar la actualización correspondiente en la oficina de Administración antes del ingreso.\nLa falta de actualización podrá generar demoras en el proceso de admisión el día de su intervención.\nEn breve, recibirá las indicaciones prequirúrgicas correspondientes.\nQuedamos a disposición ante cualquier consulta.', 'confirmacion', 16),

-- === INFORMACIÓN ===
('/CATE', 'Precios categorización', E'▪️ *Servicio de Categorización Institucional* 🔖\n\n▪️ *Habitacion compartida* $47000.\n\n▪️ *Habitación individual* $124000.\n\n▪️ *Habitación Suite* $140000.', 'info', 17),

('/CATEGORIZACION', 'Explicación categorización', E'El *servicio de categorizacion* refiere al *servicio de calidad y seguridad* enfocado en el *paciente*. El mismo cuenta con acreditación *ITAES* , lo cual *su cobertura dependerá de su obra social*. El valor del mismo se categoriza *según el tipo de habitación* que el paciente elige para su *estadía en nuestra institucion*.', 'info', 18),

('/LLAMADAS', 'No recibimos llamadas', E'⚠ *_Disculpe, no recibimos llamadas ni mensajes de voz por esta vía._* 🔇', 'info', 19)

ON CONFLICT (shortcut) DO UPDATE SET
    label = EXCLUDED.label,
    message = EXCLUDED.message,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();
