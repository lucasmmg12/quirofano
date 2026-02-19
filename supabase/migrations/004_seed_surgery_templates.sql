-- ============================================================
-- SEED: Plantillas de mensajes de cirugía por Obra Social
-- ============================================================

-- === NOTIFICACIÓN INICIAL (72h/48h antes) ===

-- Default (todas las OS)
INSERT INTO surgery_templates (obra_social_pattern, template_type, content) VALUES
('*', 'notificacion', 
'Hola {nombre}, le informamos desde *Sanatorio Argentino* que su cirugía está programada para el *{fecha}* con el Dr./Dra. *{medico}*.

Por favor, responda a este mensaje con la documentación requerida según su cobertura.

Quedamos a su disposición. 🏥'),

-- Provincia / Jerárquicos → Pedir autorización
('Provincia', 'solicitud_doc',
'📋 *Documentación requerida - {obra_social}*

Para continuar con la programación de su cirugía, necesitamos que nos envíe por este chat:

✅ Foto de la *autorización* de su obra social
✅ Foto de su *carnet de afiliado* (frente y dorso)
✅ *DNI* (frente y dorso)

Puede enviar las fotos directamente en este chat. 📸'),

('Jerárquicos', 'solicitud_doc',
'📋 *Documentación requerida - {obra_social}*

Para continuar con la programación de su cirugía, necesitamos que nos envíe por este chat:

✅ Foto de la *autorización* de su obra social
✅ Foto de su *carnet de afiliado* (frente y dorso)
✅ *DNI* (frente y dorso)

Puede enviar las fotos directamente en este chat. 📸'),

-- Prepaga → Validación de carnet
('Prepaga', 'solicitud_doc',
'📋 *Validación de cobertura - {obra_social}*

Para validar su cobertura, necesitamos que nos envíe:

✅ Foto de su *carnet de prepaga* (frente y dorso)
✅ *DNI* (frente y dorso)

Puede enviar las fotos directamente en este chat. 📸'),

-- Default solicitud doc
('*', 'solicitud_doc',
'📋 Para continuar con la programación de su cirugía ({fecha}), necesitamos que nos envíe la documentación correspondiente por este chat.

Puede enviar fotos o PDFs directamente aquí. 📸'),

-- === AUTORIZACIÓN (cuando admin aprueba) ===
('*', 'autorizacion',
'✅ *Documentación aprobada*

{nombre}, su documentación ha sido revisada y *aprobada* correctamente.

Para confirmar su asistencia a la cirugía del *{fecha}*, por favor responda con:
👉 *CONFIRMO* - Para confirmar asistencia
👉 *CANCELAR* - Si necesita reprogramar

Esperamos su confirmación. 🏥'),

-- === INDICACIONES DE INGRESO (cuando paciente confirma) ===
('*', 'indicaciones',
'🏥 *INDICACIONES DE INGRESO - SANATORIO ARGENTINO*

Estimado/a *{nombre}*, le enviamos las indicaciones para su cirugía del *{fecha}*:

📌 *Presentarse:* 2 horas antes del horario pactado
📌 *Traer:* DNI, carnet de obra social, estudios prequirúrgicos
📌 *Ayuno:* Mínimo 8 horas (no ingerir alimentos ni líquidos)
📌 *Medicación:* Consultar con su médico qué medicación suspender
📌 *Vestimenta:* Ropa cómoda, evitar joyas y accesorios
📌 *Acompañante:* Debe contar con un acompañante mayor de edad

⚠️ *Importante:* Si presenta fiebre, síntomas respiratorios o cualquier novedad, comuníquese con nosotros antes de presentarse.

📞 Recepción: (0341) 449-XXXX
📍 Dirección: [Dirección del Sanatorio]

¡Le deseamos una exitosa intervención! 💙')

ON CONFLICT DO NOTHING;
