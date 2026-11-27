/**
 * seed_reuniones_dxi.mjs
 * 1. Ejecuta la migración 073_gob_reuniones_servicio.sql en Supabase
 * 2. Precarga el 100% de la documentación oficial de Diagnóstico por Imágenes (DxI):
 *    - Informes Ejecutivos Mensuales RDIR 04: Julio, Agosto, Septiembre y Octubre 2026
 *    - Revisión por la Dirección: Julio - Octubre 2026
 *    - Propuesta y Gestión de Objetivos 2027 (OBJ 1 a 4 con checklists accionables)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLocal = resolve(__dirname, '.env');
const envRoot = resolve(__dirname, '..', '.env');
dotenv.config({ path: fs.existsSync(envLocal) ? envLocal : envRoot });
dotenv.config({ path: envRoot, override: false });

const projectRef = 'hakysnqiryimxbwdslwe';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.VITE_SUPABASE_URL || `https://${projectRef}.supabase.co`;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const OBJETIVO_INFORME_RDIR04 =
    'Presentar a la Dirección el estado mensual del servicio para facilitar el seguimiento del Plan de Acción, el análisis de oportunidades de mejora, la evaluación de los Indicadores del Servicio y la toma de decisiones.';

const DXI_INFORMES_2026 = [
    // =========================================================================
    // JULIO 2026
    // =========================================================================
    {
        sector_id: 'DXI',
        servicio_nombre: 'Diagnóstico por Imágenes',
        periodo: '2026-07',
        codigo_registro: 'RDIR 04',
        objetivo_informe: OBJETIVO_INFORME_RDIR04,
        responsable: 'Valeria Mercado',
        tutor: 'Sergio Femenia',
        fecha_reunion: '31/08/2026',
        participantes: 'Barcia Gaspar, Guillermo Sánchez y Valeria Mercado',
        estado_general: 'Favorable, con oportunidades de mejora',
        resumen_ejecutivo:
            'Durante la reunión se revisó la producción, disponibilidad operativa y principales planes de acción de Diagnóstico por Imágenes. En julio se realizaron aproximadamente 8.563 estudios. Se observó crecimiento en tomografía y ecografía, mientras que mamografía y densitometría estuvieron afectadas por indisponibilidad técnica de equipos.\n\n' +
            'El principal desvío continúa siendo la identificación inequívoca del paciente, tanto por generación de registros duplicados como por asociación incorrecta de estudios. Se acordó profundizar el trabajo con Calidad y Sistemas, identificando causas y responsables del error y evaluando barreras tecnológicas que impidan nuevas duplicaciones.\n\n' +
            'Respecto de la continuidad operativa, quedó documentado el procedimiento de contingencia ante caídas o cambios de servidor/PACS, y se coordinará la contingencia necesaria durante las próximas obras eléctricas y eventuales movimientos de equipos.\n\n' +
            'En tecnología, se planteó formalizar un plan de prioridades 2026/2027, contemplando renovación de equipos y alternativas para automatizar la generación/transcripción de informes.\n\n' +
            'Tomografía muestra evolución favorable (+7,5%) y se avanzó en la implementación de espinogramas (pendiente validación de códigos con Convenios). Se analizaron franjas de ecografía, ecocardiografía y ergometría, requiriéndose mayor cobertura médica matutina, así como ordenar la conducción y cobertura de Kinesiología.',
        compromisos_acordados: [
            { nro: 1, compromiso: 'Elaborar con Calidad un plan específico para disminuir pacientes duplicados y errores de identificación.', responsable: 'Diagnóstico por Imágenes / Calidad', fecha_seguimiento: 'Próxima reunión' },
            { nro: 2, compromiso: 'Analizar causas de duplicaciones por sector/usuario y generar información específica que permita intervenir sobre los casos recurrentes.', responsable: 'Calidad / Sistemas / Diagnóstico', fecha_seguimiento: 'Septiembre 2026' },
            { nro: 3, compromiso: 'Evaluar barreras técnicas en el sistema para impedir o dificultar la creación de pacientes duplicados.', responsable: 'Sistemas / Calidad', fecha_seguimiento: 'Próxima reunión' },
            { nro: 4, compromiso: 'Mantener formalizado y disponible el procedimiento de contingencia ante caída o cambio de servidor/PACS.', responsable: 'Diagnóstico / Sistemas', fecha_seguimiento: 'Implementado – revisión periódica' },
            { nro: 5, compromiso: 'Coordinar con Sistemas la contingencia tecnológica y operativa ante las próximas obras eléctricas y eventuales movimientos de equipos.', responsable: 'Diagnóstico / Sistemas / Mantenimiento', fecha_seguimiento: 'Antes del inicio de la obra' },
            { nro: 6, compromiso: 'Elaborar prioridades de inversión tecnológica y renovación de equipamiento del servicio.', responsable: 'Dres. Gaspar Barcia y Guillermo Sánchez Colpas / Dirección', fecha_seguimiento: 'Próxima reunión' },
            { nro: 7, compromiso: 'Retomar el proyecto de generación/transcripción automática de informes médicos y definir modelo de supervisión.', responsable: 'Diagnóstico / Sistemas / Dirección', fecha_seguimiento: 'Seguimiento próxima reunión' },
            { nro: 8, compromiso: 'Validar con Convenios los códigos y modalidad de facturación de espinogramas y corregir la comunicación antes de su difusión definitiva.', responsable: 'Diagnóstico / Convenios / Facturación', fecha_seguimiento: 'Inmediato' },
            { nro: 9, compromiso: 'Difundir la disponibilidad de espinogramas a traumatólogos y áreas derivadoras una vez validado el circuito.', responsable: 'Diagnóstico / Comunicación', fecha_seguimiento: 'Posterior a validación de Convenios' },
            { nro: 10, compromiso: 'Definir cobertura médica para aprovechar las nuevas franjas disponibles de ecografía/ecocardiografía.', responsable: 'Jefatura médica / Diagnóstico', fecha_seguimiento: 'Septiembre 2026' },
            { nro: 11, compromiso: 'Reunirse con la conducción de Cardiología para organizar cobertura de ecocardiografía, especialmente en mañanas y urgencias.', responsable: 'Dirección / Diagnóstico / Cardiología', fecha_seguimiento: 'Próxima reunión' },
            { nro: 12, compromiso: 'Ampliar franjas de ergometría incorporando profesionales adicionales.', responsable: 'Diagnóstico / Cardiología', fecha_seguimiento: 'Seguimiento septiembre 2026' },
            { nro: 13, compromiso: 'Revisar la cobertura horaria y organización de Kinesiología, asegurando continuidad y reemplazos.', responsable: 'Dirección / Diagnóstico / Kinesiología', fecha_seguimiento: 'Próxima reunión' },
            { nro: 14, compromiso: 'Revisar institucionalmente la continuidad contractual de profesionales que presenten antecedentes reiterados de incidentes, respetando las condiciones contractuales y el circuito formal correspondiente.', responsable: 'Dirección / Jefatura médica / Asesoramiento legal', fecha_seguimiento: 'Tratamiento reservado – inmediato' }
        ],
        compromisos_sugeridos: [
            { nro: 1, compromiso: 'Crear indicador mensual de duplicaciones: cantidad, causa, sector de origen y reincidencia por usuario.', responsable: 'Calidad / Sistemas', fecha_sugerida: 'Octubre 2026' },
            { nro: 2, compromiso: 'Incorporar como indicador los estudios incorrectamente asociados o informados sobre otro paciente.', responsable: 'Diagnóstico / Calidad', fecha_sugerida: 'Octubre 2026' },
            { nro: 3, compromiso: 'Crear una matriz de disponibilidad por equipo, franja horaria y profesional para detectar capacidad ociosa y restricciones médicas.', responsable: 'Diagnóstico', fecha_sugerida: 'Mensual' },
            { nro: 4, compromiso: 'Definir metas específicas de producción para tomografía, mamografía, densitometría, ecografía y estudios cardiológicos.', responsable: 'Dirección / Jefatura médica', fecha_sugerida: 'Octubre 2026' },
            { nro: 5, compromiso: 'Medir el impacto económico y productivo de la indisponibilidad de equipos por fallas técnicas.', responsable: 'Diagnóstico / Dirección', fecha_sugerida: 'Mensual' },
            { nro: 6, compromiso: 'Incorporar un plan preventivo de contingencia por equipo crítico, incluyendo alternativa de derivación y tiempo máximo de recuperación.', responsable: 'Diagnóstico / Mantenimiento', fecha_sugerida: 'Octubre 2026' },
            { nro: 7, compromiso: 'Medir cantidad de pacientes del chequeo con informe final efectivamente realizado y derivaciones generadas por hallazgos.', responsable: 'Diagnóstico / Chequeos', fecha_sugerida: 'Octubre 2026' }
        ],
        plan_accion: [
            { codigo: 'PA-01', accion: 'Implementar identificación inequívoca y control de pacientes duplicados.', vinculo_bitrix: '', responsable: 'Dirección + Calidad / Servicio', fecha_objetivo: '31/08/2026', estado: 'En curso', avance_mes: 'Se está trabajando con Calidad en un plan de capacitación para reforzar la identificación inequívoca del paciente y el control de registros duplicados.', dificultad: 'Controlar identidad y vinculación correcta de solicitud, estudio e imágenes.' },
            { codigo: 'PA-05', accion: 'Implementar medidas de continuidad operativa, infraestructura y contingencia tecnológica.', vinculo_bitrix: 'https://sanatorioargentino.bitrix24.es/workgroups/group/119/tasks/task/view/5111/', responsable: 'Dirección + TYS / Servicio', fecha_objetivo: '15/12/2026', estado: 'Cumplido', avance_mes: 'Se trabajó con T&S en instructivos para utilizar los equipos de Diagnóstico por Imágenes ante falta de acceso al PACS.', dificultad: 'Aplicar contingencias por caída de PACS, conectividad y energía.' },
            { codigo: 'PA-10', accion: 'Priorizar proyectos tecnológicos según adopción, continuidad, impacto y retorno.', vinculo_bitrix: '', responsable: 'Dirección + TYS / Servicio', fecha_objetivo: '31/08/2026', estado: 'En curso', avance_mes: 'Renovación tecnológica iniciada: nuevo equipo de mamografía, nuevo densitómetro, planificación de renovación de ecógrafos, actualización del PACS y trabajo con Sistemas para el Portal del Paciente.', dificultad: 'Priorizar PACS, portal, integración y renovación tecnológica.' },
            { codigo: 'PA-16', accion: 'Consolidar producción, derivaciones, captación y sustentabilidad del Servicio.', vinculo_bitrix: 'https://sanatorioargentino.bitrix24.es/company/personal/user/39/tasks/task/view/5649/', responsable: 'Dirección + Comunicación/Comercial + Servicio', fecha_objetivo: '31/10/2026', estado: 'En curso', avance_mes: 'Se trabaja para incrementar Tomografía mediante contacto con profesionales, difusión en grupos de interés y acciones comerciales orientadas a evitar fuga de demanda.', dificultad: 'Consolidar producción, derivaciones y captación de estudios.' }
        ],
        oportunidades_mejora: [
            { codigo: 'OM-01', oportunidad: 'Fortalecer la identificación inequívoca y la correcta vinculación de estudios al paciente.', origen: 'Seguridad del paciente / hallazgos del servicio', accion_propuesta: 'Reforzar capacitación, doble verificación y criterios homogéneos antes de seleccionar al paciente e iniciar el estudio.', responsable: 'Servicio + Calidad', estado: 'En curso' },
            { codigo: 'OM-02', oportunidad: 'Mejorar la gestión y resolución de reportes, priorizando hallazgos críticos.', origen: '78 reportes recibidos como sector destino; 18% de resolución; 4 hallazgos críticos; 26,8 días promedio de cierre.', accion_propuesta: 'Revisar circuito de seguimiento, responsables y plazos; priorizar casos críticos y monitorear cierres.', responsable: 'Servicio + Calidad', estado: 'En curso' },
            { codigo: 'OM-03', oportunidad: 'Incrementar la captación de chequeos y acercarse progresivamente a la meta gerencial.', origen: '388 chequeos en julio frente a meta de 525.', accion_propuesta: 'Fortalecer captación, confirmación de turnos y acciones con empresas/personal; monitorear asistencia efectiva.', responsable: 'Servicio + Comunicación/Comercial', estado: 'En curso' },
            { codigo: 'OM-04', oportunidad: 'Sostener producción y reducir capacidad ociosa en franjas de menor utilización.', origen: 'Ocupación de ecografía 91,5%; viernes con menor utilización relativa.', accion_propuesta: 'Revisar agendas y disponibilidad por día/franja, priorizando espacios de menor ocupación.', responsable: 'Servicio', estado: 'En curso' }
        ],
        indicadores: [
            { codigo_salus: 'ECOGRAFIA', indicador: 'Ecografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 6086, resultado_actual: 6481, variacion: 0.0649, tendencia: 'Mejora', comentario: 'Julio 2026. La ecografía concentra el mayor volumen de actividad y la ocupación de equipos alcanza 91,5%.' },
            { codigo_salus: 'TOMOGRAFIA', indicador: 'Tomografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 373, resultado_actual: 401, variacion: 0.0751, tendencia: 'Mejora', comentario: 'Julio 2026. Se mantienen acciones específicas para incrementar derivaciones y captación.' },
            { codigo_salus: 'MAMOGRAFIA', indicador: 'Mamografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 681, resultado_actual: 714, variacion: 0.0485, tendencia: 'Mejora', comentario: 'Julio 2026. Actividad acompañada por renovación tecnológica del equipo.' },
            { codigo_salus: 'RADIOLOGIA', indicador: 'Radiografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 1630, resultado_actual: 1458, variacion: -0.1055, tendencia: 'Deterioro', comentario: 'Julio 2026. 701 pacientes generaron 1.458 solicitudes de estudios.' },
            { codigo_salus: 'DENSITOMETRIA', indicador: 'Densitometrías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 98, resultado_actual: 8, variacion: -0.9184, tendencia: 'Deterioro', comentario: 'Julio 2026. Afectada por indisponibilidad técnica; se continuará monitoreando evolución del equipo.' },
            { codigo_salus: 'ECOCARDIO', indicador: 'Ecocardiogramas', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 195, resultado_actual: 196, variacion: 0.0051, tendencia: 'Estable', comentario: '' },
            { codigo_salus: '', indicador: 'Resultado de Encuestas de Satisfacción de Pacientes', unidad: 'Cantidad', meta: 'Mayor a 4', resultado_anterior: null, resultado_actual: null, variacion: null, tendencia: 'Sin dato', comentario: '' },
            { codigo_salus: '', indicador: 'Cumplimiento de la rutina mensual de Bitrix', unidad: '%', meta: 'Subtareas vencidas vs totales', resultado_anterior: null, resultado_actual: null, variacion: 0.1429, tendencia: 'Estable', comentario: 'Derivado de PA-17: medir usuarios activos, tareas vencidas/cerradas y proyectos con seguimiento.' },
            { codigo_salus: '', indicador: 'ITAES % Avance autoevaluación del Servicio', unidad: '%', meta: 'Tendencia creciente', resultado_anterior: null, resultado_actual: null, variacion: null, tendencia: 'Estable', comentario: 'Seguimiento ejecutivo.' }
        ],
        necesidades_direccion: [
            { tipo: 'Apoyo / decisión', necesidad: 'Formalizar el circuito para comunicar y tratar errores de identificación o asignación de estudios.', fundamento: 'Prevenir pedidos informales de eliminación de registros y fortalecer la seguridad del paciente.', decision_requerida: 'Definir circuito institucional, responsables y mecanismo de registro/escalamiento.', responsable_resolucion: 'Dirección + Calidad + T&S' },
            { tipo: 'Apoyo / decisión', necesidad: 'Reforzar con profesionales la verificación de identidad antes de seleccionar al paciente o iniciar el estudio.', fundamento: 'Objetivo de estudios correctamente vinculados al paciente: 100%.', decision_requerida: 'Acompañar capacitación y reforzar doble verificación en los puntos críticos.', responsable_resolucion: 'Dirección + Calidad + Servicio' }
        ],
        hallazgos_notas: [
            { texto: 'Formalizar el circuito para comunicar y tratar errores de identificación o asignación de estudios en Diagnóstico por Imágenes, evitando pedidos informales de eliminación de registros.', etiqueta: 'HALLAZGO REUNIÓN CON TyS' },
            { texto: 'Reforzar con los profesionales de Diagnóstico por Imágenes la verificación de identidad antes de seleccionar al paciente o iniciar el estudio.', etiqueta: 'HALLAZGO REUNIÓN CON TyS' }
        ],
        insights_clave: [
            'Producción mensual de ~9.258 estudios totales en modalidades trazadas (+6,5% en Ecografía y +7,5% en Tomografía).',
            'Densitometría descendió a 8 estudios (-91,8%) por parada técnica previa a puesta en marcha de nuevo equipamiento.',
            'PA-05 (Contingencia PACS/Infraestructura) alcanzó estado Cumplido con instructivos operativos formalizados junto a T&S.',
            'Prioridad crítica de seguridad: eliminar registros duplicados y errores de asociación paciente-estudio (14 compromisos acordados).'
        ],
        fotos: []
    },

    // =========================================================================
    // AGOSTO 2026
    // =========================================================================
    {
        sector_id: 'DXI',
        servicio_nombre: 'Diagnóstico por Imágenes',
        periodo: '2026-08',
        codigo_registro: 'RDIR 04',
        objetivo_informe: OBJETIVO_INFORME_RDIR04,
        responsable: 'Valeria Mercado',
        tutor: 'Sergio Femenia',
        fecha_reunion: 'Pendiente de confirmar',
        participantes: 'Barcia Gaspar, Guillermo Sánchez y Valeria Mercado',
        estado_general: 'Favorable, con oportunidades de mejora',
        resumen_ejecutivo:
            'Presentación de Informe Ejecutivo mensual de Agosto 2026. Se verifica crecimiento generalizado en todas las modalidades diagnósticas respecto de julio: Ecografías (+3,9%), Radiografías (+29,2%), Mamografías (+1,8%), Ecocardiogramas (+4,8%) y fuerte recuperación de Densitometrías (de 8 a 111 estudios). Durante agosto se ejecutó el mantenimiento preventivo de UPS en Sede Santa Fe (tres ecógrafos y mamógrafo) y la capacitación con aplicacionista para licenciadas de Mamografía.',
        compromisos_acordados: [],
        compromisos_sugeridos: [],
        plan_accion: [
            { codigo: 'PA-01', accion: 'Implementar identificación inequívoca y control de pacientes duplicados.', vinculo_bitrix: '', responsable: 'Dirección + Calidad / Servicio', fecha_objetivo: '31/10/2026', estado: 'En curso', avance_mes: 'Se mantiene el trabajo con Calidad para reforzar la identificación inequívoca del paciente y el control de registros duplicados.', dificultad: 'Controlar identidad y vinculación correcta de solicitud, estudio e imágenes.' },
            { codigo: 'PA-05', accion: 'Implementar medidas de continuidad operativa, infraestructura y contingencia tecnológica.', vinculo_bitrix: 'https://sanatorioargentino.bitrix24.es/workgroups/group/119/tasks/task/view/5111/', responsable: 'Dirección + TYS / Servicio', fecha_objetivo: '15/12/2026', estado: 'Cumplido', avance_mes: 'Se mantienen instructivos y circuitos de contingencia para utilizar los equipos ante falta de acceso al PACS. Durante agosto se realizó mantenimiento de las UPS de los tres ecógrafos y mamografía de Sede Santa Fe.', dificultad: 'Aplicar contingencias por caída de PACS, conectividad y energía.' },
            { codigo: 'PA-10', accion: 'Priorizar proyectos tecnológicos según adopción, continuidad, impacto y retorno.', vinculo_bitrix: '', responsable: 'Dirección + TYS / Servicio', fecha_objetivo: '31/10/2026', estado: 'En curso', avance_mes: 'Se continúa con la renovación tecnológica. Para el próximo listado de recambio se priorizan Eco 2 Sede Santa Fe (Voluson E8) y Eco 2 Sede San Luis (Alpinion).', dificultad: 'Definir prioridad, presupuesto y cronograma de renovación.' },
            { codigo: 'PA-16', accion: 'Consolidar producción, derivaciones, captación y sustentabilidad del Servicio.', vinculo_bitrix: 'https://sanatorioargentino.bitrix24.es/company/personal/user/39/tasks/task/view/5649/', responsable: 'Dirección + Comunicación/Comercial + Servicio', fecha_objetivo: '31/10/2026', estado: 'En curso', avance_mes: 'Se continúa monitoreando producción por modalidad y oportunidades para incrementar derivaciones y utilización de capacidad instalada.', dificultad: 'Consolidar producción, derivaciones y captación de estudios.' }
        ],
        oportunidades_mejora: [
            { codigo: 'OM-01', oportunidad: 'Fortalecer la identificación inequívoca y la correcta vinculación de estudios al paciente.', origen: 'Seguridad del paciente / hallazgos del servicio', accion_propuesta: 'Reforzar capacitación, doble verificación y criterios homogéneos antes de seleccionar al paciente e iniciar el estudio.', responsable: 'Servicio + Calidad', estado: 'En curso' },
            { codigo: 'OM-02', oportunidad: 'Mejorar la gestión y resolución de reportes, priorizando hallazgos críticos.', origen: '78 reportes recibidos como sector destino; 18% de resolución; 4 hallazgos críticos; 26,8 días promedio de cierre.', accion_propuesta: 'Revisar circuito de seguimiento, responsables y plazos; priorizar casos críticos y monitorear cierres.', responsable: 'Servicio + Calidad', estado: 'En curso' },
            { codigo: 'OM-03', oportunidad: 'Incrementar la captación de chequeos y acercarse progresivamente a la meta gerencial.', origen: '388 chequeos en julio frente a meta de 525.', accion_propuesta: 'Fortalecer captación, confirmación de turnos y acciones con empresas/personal; monitorear asistencia efectiva.', responsable: 'Servicio + Comunicación/Comercial', estado: 'En curso' },
            { codigo: 'OM-04', oportunidad: 'Fortalecer el mantenimiento preventivo, la capacitación y la renovación tecnológica de equipos críticos.', origen: 'Continuidad operativa / tecnología', accion_propuesta: 'Se realizó mantenimiento de UPS de los tres ecógrafos y mamografía de Sede Santa Fe; se capacitó a las licenciadas de Mamografía con aplicacionista y se mantienen como prioridades de recambio Eco 2 Santa Fe (Voluson E8) y Eco 2 San Luis (Alpinion).', responsable: 'Servicio + TYS + Mantenimiento', estado: 'En curso' }
        ],
        indicadores: [
            { codigo_salus: 'ECOGRAFIA', indicador: 'Ecografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 6481, resultado_actual: 6732, variacion: 0.0387, tendencia: 'Mejora', comentario: 'Agosto 2026. Incremento respecto de julio. El tablero general informa 7.099 ecografías.' },
            { codigo_salus: 'TOMOGRAFIA', indicador: 'Tomografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 401, resultado_actual: 403, variacion: 0.005, tendencia: 'Estable', comentario: 'Agosto 2026. Incremento respecto de julio; se mantiene el trabajo sobre derivaciones y captación.' },
            { codigo_salus: 'MAMOGRAFIA', indicador: 'Mamografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 714, resultado_actual: 727, variacion: 0.0182, tendencia: 'Mejora', comentario: 'Agosto 2026. Se realizó capacitación con aplicacionista para las licenciadas de Mamografía y mantenimiento de UPS.' },
            { codigo_salus: 'RADIOLOGIA', indicador: 'Radiografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 1458, resultado_actual: 1884, variacion: 0.2922, tendencia: 'Mejora', comentario: 'Agosto 2026. Incremento respecto de julio. Dato tomado del total visible en el tablero.' },
            { codigo_salus: 'DENSITOMETRIA', indicador: 'Densitometrías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 8, resultado_actual: 111, variacion: 12.875, tendencia: 'Mejora', comentario: 'Agosto 2026. Incremento significativo respecto de julio; se continuará monitoreando utilización del equipo.' },
            { codigo_salus: 'ECOCARDIO', indicador: 'Ecocardiogramas', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 187, resultado_actual: 196, variacion: 0.0481, tendencia: 'Mejora', comentario: '' },
            { codigo_salus: '', indicador: 'Resultado de Encuestas de Satisfacción de Pacientes', unidad: 'Cantidad', meta: 'Mayor a 4', resultado_anterior: null, resultado_actual: null, variacion: 0.1429, tendencia: 'Estable', comentario: 'Sin dato informado para agosto.' },
            { codigo_salus: '', indicador: 'Cumplimiento de la rutina mensual de Bitrix', unidad: '%', meta: 'Subtareas al día', resultado_anterior: null, resultado_actual: null, variacion: null, tendencia: 'Estable', comentario: '' }
        ],
        necesidades_direccion: [
            { tipo: 'Apoyo / decisión', necesidad: 'Formalizar el circuito para comunicar y tratar errores de identificación o asignación de estudios.', fundamento: 'Prevenir pedidos informales de eliminación de registros y fortalecer la seguridad del paciente.', decision_requerida: 'Definir circuito institucional, responsables y mecanismo de registro/escalamiento.', responsable_resolucion: 'Dirección + Calidad + T&S' }
        ],
        hallazgos_notas: [
            { texto: 'Registrar mantenimiento preventivo de UPS de Sede Santa Fe (tres ecógrafos y mamografía).', etiqueta: 'ACTIVIDAD REALIZADA EN AGOSTO' },
            { texto: 'Registrar capacitación de licenciadas de Mamografía realizada junto con la aplicacionista.', etiqueta: 'ACTIVIDAD REALIZADA EN AGOSTO' },
            { texto: 'Registrar renovación prioritaria de equipos de ecografía: Eco 2 Sede Santa Fe (Voluson E8) y Eco 2 Sede San Luis (Alpinion).', etiqueta: 'EN SEGUIMIENTO' }
        ],
        insights_clave: [
            'Recuperación contundente de Densitometrías (8 → 111 estudios) tras normalización operativa del equipo.',
            'Fuerte repunte en Radiografías (+29,2%, 1.884 estudios) y crecimiento sostenido en Ecografías (6.732 estudios, +3,9%).',
            'Mantenimiento preventivo de UPS ejecutado en Sede Santa Fe para proteger 3 ecógrafos y mamógrafo.',
            'Se definen como prioridades de renovación tecnológica Eco 2 Santa Fe (Voluson E8) y Eco 2 San Luis (Alpinion).'
        ],
        fotos: []
    },

    // =========================================================================
    // SEPTIEMBRE 2026
    // =========================================================================
    {
        sector_id: 'DXI',
        servicio_nombre: 'Diagnóstico por Imágenes',
        periodo: '2026-09',
        codigo_registro: 'RDIR 04',
        objetivo_informe: OBJETIVO_INFORME_RDIR04,
        responsable: 'Valeria Mercado',
        tutor: 'Sergio Femenia',
        fecha_reunion: 'Pendiente de confirmar',
        participantes: 'Barcia Gaspar, Guillermo Sánchez y Valeria Mercado',
        estado_general: 'Favorable, con oportunidades de mejora',
        resumen_ejecutivo:
            'El servicio presenta una evolución favorable de su producción, destacándose el crecimiento de tomografías (+15,9%), radiografías (+11,5%), ecocardiogramas (+15,0%) y densitometrías (+98,2%). Las ecografías aumentaron un 1,6% alcanzando su pico cuatrimestral (6.841 estudios).\n\n' +
            'En infraestructura, se encuentra operativo el densitómetro de Santa Fe y se avanzó con la instalación del mamógrafo de San Luis. Se proyecta la renovación de dos ecógrafos durante 2027.\n\n' +
            'Persisten oportunidades de mejora en la identificación inequívoca de pacientes, la organización de ecografías de guardia y la entrega oportuna de informes de ecocardiografía. Se requiere formalizar criterios de urgencia, mejorar la comunicación entre sectores y fortalecer los controles de recepción.\n\n' +
            'La prioridad es consolidar el crecimiento productivo, garantizar la seguridad del paciente y mejorar la continuidad y oportunidad de las prestaciones.',
        compromisos_acordados: [],
        compromisos_sugeridos: [],
        plan_accion: [
            { codigo: 'PA-01', accion: 'Implementar identificación inequívoca y control de pacientes duplicados.', vinculo_bitrix: '', responsable: 'Dirección + Calidad / Servicio', fecha_objetivo: '31/10/2026', estado: 'En curso', avance_mes: 'Se mantiene el trabajo con Calidad para reforzar la identificación inequívoca del paciente y el control de registros duplicados.', dificultad: 'Controlar identidad y vinculación correcta de solicitud, estudio e imágenes.' },
            { codigo: 'PA-05', accion: 'Implementar medidas de continuidad operativa, infraestructura y contingencia tecnológica.', vinculo_bitrix: 'https://sanatorioargentino.bitrix24.es/workgroups/group/119/tasks/task/view/5111/', responsable: 'Dirección + TYS / Servicio', fecha_objetivo: '15/12/2026', estado: 'Cumplido', avance_mes: 'Se mantiene el seguimiento de la continuidad operativa de los equipos y de las necesidades de infraestructura. El densitómetro de Sede Santa Fe se encuentra operativo; el mamógrafo de Sede San Luis está en fase de instalación.', dificultad: 'Aplicar contingencias por caída de PACS, conectividad y energía.' },
            { codigo: 'PA-10', accion: 'Priorizar proyectos tecnológicos según adopción, continuidad, impacto y retorno.', vinculo_bitrix: '', responsable: 'Dirección + TYS / Servicio', fecha_objetivo: '31/10/2026', estado: 'En curso', avance_mes: 'Se propone gestionar y programar el recambio de Eco 2 Sede Santa Fe y Eco 2 Sede San Luis como próximas prioridades tecnológicas, en paralelo al seguimiento de la instalación del mamógrafo de Sede San Luis.', dificultad: 'Definir prioridad, presupuesto y cronograma de renovación.' },
            { codigo: 'PA-16', accion: 'Consolidar producción, derivaciones, captación y sustentabilidad del Servicio.', vinculo_bitrix: 'https://sanatorioargentino.bitrix24.es/company/personal/user/39/tasks/task/view/5649/', responsable: 'Dirección + Comunicación/Comercial + Servicio', fecha_objetivo: '31/10/2026', estado: 'En curso', avance_mes: 'Se continúa monitoreando producción por modalidad y oportunidades para incrementar derivaciones y utilización de capacidad instalada.', dificultad: 'Consolidar producción, derivaciones y captación de estudios.' }
        ],
        oportunidades_mejora: [
            { codigo: 'OM-01', oportunidad: 'Fortalecer la identificación inequívoca y la correcta vinculación de estudios al paciente.', origen: 'Seguridad del paciente / hallazgos del servicio', accion_propuesta: 'Reforzar capacitación, doble verificación y criterios homogéneos antes de seleccionar al paciente e iniciar el estudio.', responsable: 'Servicio + Calidad', estado: 'En curso' },
            { codigo: 'OM-02', oportunidad: 'Mejorar la gestión y resolución de reportes, priorizando hallazgos críticos.', origen: '78 reportes recibidos como sector destino; 18% de resolución; 4 hallazgos críticos; 26,8 días promedio de cierre.', accion_propuesta: 'Revisar circuito de seguimiento, responsables y plazos; priorizar casos críticos y monitorear cierres.', responsable: 'Servicio + Calidad', estado: 'En curso' },
            { codigo: 'OM-03', oportunidad: 'Incrementar la captación de chequeos y acercarse progresivamente a la meta gerencial.', origen: '388 chequeos en julio frente a meta de 525.', accion_propuesta: 'Fortalecer captación, confirmación de turnos y acciones con empresas/personal; monitorear asistencia efectiva.', responsable: 'Servicio + Comunicación/Comercial', estado: 'En curso' },
            { codigo: 'OM-04', oportunidad: 'Fortalecer el mantenimiento, la instalación y la renovación tecnológica de equipos críticos.', origen: 'Continuidad operativa y actualización tecnológica', accion_propuesta: 'Se encuentra operativo el densitómetro de Sede Santa Fe. El mamógrafo de Sede San Luis está en fase de instalación. Se propone gestionar el recambio de Eco 2 Santa Fe y Eco 2 San Luis.', responsable: 'Servicio + TYS + Mantenimiento', estado: 'En curso' }
        ],
        indicadores: [
            { codigo_salus: 'ECOGRAFIA', indicador: 'Ecografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 6732, resultado_actual: 6841, variacion: 0.0162, tendencia: 'Mejora', comentario: 'Septiembre: 6.848 estudios (Sede 3: 150; Sede San Luis: 2.982; Sede Santa Fe: 3.539; guardias: 174). En agosto se registraron 6.731.' },
            { codigo_salus: 'TOMOGRAFIA', indicador: 'Tomografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 402, resultado_actual: 466, variacion: 0.1592, tendencia: 'Mejora', comentario: 'Septiembre: surge de Listados/Visitas/Cantidad de pacientes atendidos por servicio (Grupo de Agenda).' },
            { codigo_salus: 'MAMOGRAFIA', indicador: 'Mamografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 727, resultado_actual: 775, variacion: 0.066, tendencia: 'Mejora', comentario: 'Septiembre: 774 mamografías (Sede San Luis: 172; Sede Santa Fe: 602). El mamógrafo de Sede San Luis está en fase de instalación.' },
            { codigo_salus: 'RADIOLOGIA', indicador: 'Radiografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 1845, resultado_actual: 2057, variacion: 0.1149, tendencia: 'Mejora', comentario: 'Septiembre: surge de Listados/Visitas/Cantidad de pacientes atendidos por servicio (Grupo de Agenda).' },
            { codigo_salus: 'DENSITOMETRIA', indicador: 'Densitometrías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 111, resultado_actual: 220, variacion: 0.982, tendencia: 'Mejora', comentario: 'Septiembre: surge de Listados/Visitas/Cantidad de pacientes atendidos por servicio utilizando filtro de Agenda: Densito.' },
            { codigo_salus: 'ECOCARDIO', indicador: 'Ecocardiogramas', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 187, resultado_actual: 215, variacion: 0.1497, tendencia: 'Mejora', comentario: 'Surge de Listado de Menú Ver/Lista de Visitas.' },
            { codigo_salus: '', indicador: 'Resultado de Encuestas de Satisfacción de Pacientes', unidad: 'Cantidad', meta: 'Mayor a 4', resultado_anterior: null, resultado_actual: null, variacion: 0.1429, tendencia: 'Estable', comentario: 'Sin dato informado.' },
            { codigo_salus: '', indicador: 'Cumplimiento de la rutina mensual de Bitrix', unidad: '%', meta: 'Subtareas al día', resultado_anterior: null, resultado_actual: null, variacion: null, tendencia: 'Estable', comentario: '' }
        ],
        necesidades_direccion: [],
        hallazgos_notas: [],
        insights_clave: [
            'Mes récord del período: las 6 modalidades diagnósticas mostraron tendencia de Mejora en simultáneo.',
            'Salto productivo en Tomografía (+15,9%, 466 estudios), Densitometría (+98,2%, 220 estudios) y Radiografía (2.057 estudios).',
            'Densitómetro de Sede Santa Fe 100% operativo y avance en obra de instalación del mamógrafo en Sede San Luis.',
            'Foco asistencial en ordenar demanda de ecografías de guardia y tiempos de entrega de informes de ecocardiografía.'
        ],
        fotos: []
    },

    // =========================================================================
    // OCTUBRE 2026
    // =========================================================================
    {
        sector_id: 'DXI',
        servicio_nombre: 'Diagnóstico por Imágenes',
        periodo: '2026-10',
        codigo_registro: 'RDIR 04',
        objetivo_informe: OBJETIVO_INFORME_RDIR04,
        responsable: 'Valeria Mercado',
        tutor: 'Sergio Femenia',
        fecha_reunion: 'Pendiente de confirmar',
        participantes: 'Barcia Gaspar, Guillermo Sánchez y Valeria Mercado',
        estado_general: 'Favorable, con oportunidades de mejora',
        resumen_ejecutivo:
            'Presentación de Informe Ejecutivo mensual de Octubre 2026. Hito tecnológico clave: el nuevo mamógrafo de Sede San Luis entró en producción el 29/10/2026, impulsando Mamografía a su récord del período con 851 estudios (+9,8% respecto a septiembre). Ecocardiogramas creció +6,5% (229 estudios) y Tomografía sostuvo su nivel alto (464 estudios, estable), mientras que Ecografías (6.501), Radiografías (1.672) y Densitometrías (184) registraron moderación estacional respecto del pico de septiembre.',
        compromisos_acordados: [],
        compromisos_sugeridos: [],
        plan_accion: [
            { codigo: 'PA-01', accion: 'Implementar identificación inequívoca y control de pacientes duplicados.', vinculo_bitrix: '', responsable: 'Dirección + Calidad / Servicio', fecha_objetivo: '31/10/2026', estado: 'En curso', avance_mes: 'Se mantiene el trabajo con Calidad para reforzar la identificación inequívoca del paciente y el control de registros duplicados.', dificultad: 'Controlar identidad y vinculación correcta de solicitud, estudio e imágenes.' },
            { codigo: 'PA-05', accion: 'Implementar medidas de continuidad operativa, infraestructura y contingencia tecnológica.', vinculo_bitrix: 'https://sanatorioargentino.bitrix24.es/workgroups/group/119/tasks/task/view/5111/', responsable: 'Dirección + TYS / Servicio', fecha_objetivo: '15/12/2026', estado: 'Cumplido', avance_mes: 'Se mantiene el seguimiento de la continuidad operativa de los equipos y de las necesidades de infraestructura. El densitómetro de Sede Santa Fe se encuentra operativo y el mamógrafo de Sede San Luis está produciendo desde el 29/10.', dificultad: 'Aplicar contingencias por caída de PACS, conectividad y energía.' },
            { codigo: 'PA-10', accion: 'Priorizar proyectos tecnológicos según adopción, continuidad, impacto y retorno.', vinculo_bitrix: '', responsable: 'Dirección + TYS / Servicio', fecha_objetivo: '31/10/2026', estado: 'En curso', avance_mes: 'Se propone gestionar y programar el recambio de Eco 2 Sede Santa Fe y Eco 2 Sede San Luis como próximas prioridades tecnológicas, en paralelo al seguimiento de la puesta en marcha del mamógrafo de Sede San Luis.', dificultad: 'Definir prioridad, presupuesto y cronograma de renovación.' },
            { codigo: 'PA-16', accion: 'Consolidar producción, derivaciones, captación y sustentabilidad del Servicio.', vinculo_bitrix: 'https://sanatorioargentino.bitrix24.es/company/personal/user/39/tasks/task/view/5649/', responsable: 'Dirección + Comunicación/Comercial + Servicio', fecha_objetivo: '31/10/2026', estado: 'En curso', avance_mes: 'Se continúa monitoreando producción por modalidad y oportunidades para incrementar derivaciones y utilización de capacidad instalada.', dificultad: 'Consolidar producción, derivaciones y captación de estudios.' }
        ],
        oportunidades_mejora: [
            { codigo: 'OM-01', oportunidad: 'Fortalecer la identificación inequívoca y la correcta vinculación de estudios al paciente.', origen: 'Seguridad del paciente / hallazgos del servicio', accion_propuesta: 'Reforzar capacitación, doble verificación y criterios homogéneos antes de seleccionar al paciente e iniciar el estudio.', responsable: 'Servicio + Calidad', estado: 'En curso' },
            { codigo: 'OM-02', oportunidad: 'Mejorar la gestión y resolución de reportes, priorizando hallazgos críticos.', origen: 'Reportes institucionales recibidos', accion_propuesta: 'Revisar circuito de seguimiento, responsables y plazos; priorizar casos críticos y monitorear cierres.', responsable: 'Servicio + Calidad', estado: 'En curso' },
            { codigo: 'OM-03', oportunidad: 'Fortalecer el mantenimiento, la instalación y la renovación tecnológica de equipos críticos.', origen: 'Continuidad operativa y actualización tecnológica', accion_propuesta: 'Se encuentra operativo el densitómetro de Sede Santa Fe. El mamógrafo de Sede San Luis entró en producción el 29/10. Se propone gestionar el recambio de Eco 2 Santa Fe y Eco 2 San Luis.', responsable: 'Servicio + TYS + Mantenimiento', estado: 'En curso' }
        ],
        indicadores: [
            { codigo_salus: 'ECOGRAFIA', indicador: 'Ecografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 6841, resultado_actual: 6501, variacion: -0.0497, tendencia: 'Deterioro', comentario: 'Octubre: se registraron 6.501 estudios validados frente a 6.841 de septiembre.' },
            { codigo_salus: 'TOMOGRAFIA', indicador: 'Tomografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 466, resultado_actual: 464, variacion: -0.0043, tendencia: 'Estable', comentario: 'Octubre: surge de Listados/Visitas/Cantidad de pacientes atendidos por servicio (Grupo de Agenda).' },
            { codigo_salus: 'MAMOGRAFIA', indicador: 'Mamografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 775, resultado_actual: 851, variacion: 0.0981, tendencia: 'Mejora', comentario: 'Octubre: 851 Mamografías (Sede San Luis: 58; Sede Santa Fe: 793), frente a 775 en septiembre. El mamógrafo de Sede San Luis está en funcionamiento desde el día 29/10.' },
            { codigo_salus: 'RADIOLOGIA', indicador: 'Radiografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 2057, resultado_actual: 1672, variacion: -0.1872, tendencia: 'Deterioro', comentario: 'Octubre: surge de Listados/Visitas/Cantidad de pacientes atendidos por servicio (Grupo de Agenda).' },
            { codigo_salus: 'DENSITOMETRIA', indicador: 'Densitometrías', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 220, resultado_actual: 184, variacion: -0.1636, tendencia: 'Deterioro', comentario: 'Octubre: surge de Listados/Visitas/Cantidad de pacientes atendidos por servicio utilizando filtro de Agenda: Densito.' },
            { codigo_salus: 'ECOCARDIO', indicador: 'Ecocardiogramas', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: 215, resultado_actual: 229, variacion: 0.0651, tendencia: 'Mejora', comentario: 'Surge de Listado de Menú Ver/Lista de Visitas.' },
            { codigo_salus: '', indicador: 'Resultado de Encuestas de Satisfacción de Pacientes', unidad: 'Cantidad', meta: 'Mayor a 4', resultado_anterior: null, resultado_actual: null, variacion: null, tendencia: 'Sin dato', comentario: 'Sin dato informado para Octubre.' },
            { codigo_salus: '', indicador: 'Cumplimiento de la rutina mensual de Bitrix', unidad: '%', meta: 'Subtareas al día', resultado_anterior: null, resultado_actual: null, variacion: null, tendencia: 'Estable', comentario: '' }
        ],
        necesidades_direccion: [],
        hallazgos_notas: [],
        insights_clave: [
            'Puesta en marcha productiva del nuevo Mamógrafo en Sede San Luis desde el 29/10/2026.',
            'Récord cuatrimestral en Mamografías (851 estudios, +9,8% en el mes de concientización) y Ecocardiogramas (229 estudios, +6,5%).',
            'Tomografía consolida su nuevo piso productivo en 464 estudios mensuales (+15,7% vs julio).',
            'Cierre de ciclo Julio–Octubre con base lista para formulación de metas cuantitativas 2027.'
        ],
        fotos: []
    }
];

const DXI_REVISION_DIRECCION = {
    sector_id: 'DXI',
    servicio_nombre: 'Diagnóstico por Imágenes',
    periodo_evaluado: 'Julio - Octubre 2026',
    periodos_incluidos: ['2026-07', '2026-08', '2026-09', '2026-10'],
    sintesis_ejecutiva:
        'El Servicio de Diagnóstico por Imágenes presenta un período favorable, con avances concretos en continuidad operativa, renovación tecnológica y producción de varias modalidades. Se destaca el crecimiento de Tomografía, la recuperación de Densitometría y el incremento de Mamografía al cierre del período, junto con la puesta en funcionamiento del nuevo mamógrafo de Sede San Luis. Persisten oportunidades de mejora relevantes en identificación inequívoca del paciente, resolución de reportes y consolidación de la captación y uso de capacidad instalada. La Dirección considera necesario que el servicio cierre estos pendientes y, con su equipo, formule objetivos 2027 medibles y priorizados.',
    metodologia:
        'La revisión se elaboró a partir de los Informes Ejecutivos mensuales del Servicio de Diagnóstico por Imágenes correspondientes a julio, agosto, septiembre y octubre de 2026. Se analizaron los cuatro compromisos principales del Plan de Acción de la Revisión, las oportunidades de mejora, los indicadores de producción y las necesidades informadas a Dirección. Como antecedentes complementarios se consideraron temas trabajados previamente por Dirección, Calidad y Tecnología y Sistemas vinculados con PACS, identificación segura, continuidad operativa y aprovechamiento de la capacidad diagnóstica.',
    resultados_generales: [
        {
            codigo: 'PA-01',
            eje: 'Identificación inequívoca y control de pacientes duplicados',
            estado_cierre: 'Avance parcial',
            avance_observado: 'Se mantuvo el trabajo con Calidad, capacitación y doble verificación.',
            lectura_direccion: 'El riesgo no se encuentra cerrado. Persisten errores de identificación/asignación y falta un indicador estable de duplicaciones y estudios mal vinculados.'
        },
        {
            codigo: 'PA-05',
            eje: 'Continuidad operativa, infraestructura y contingencia tecnológica',
            estado_cierre: 'Cumplido',
            avance_observado: 'Instructivos de contingencia, mantenimiento de UPS, densitómetro operativo y nuevo mamógrafo en funcionamiento desde 29/10.',
            lectura_direccion: 'Se logró una mejora concreta de continuidad. Debe sostenerse el mantenimiento preventivo y probar periódicamente los circuitos de contingencia.'
        },
        {
            codigo: 'PA-10',
            eje: 'Priorización y renovación tecnológica',
            estado_cierre: 'Avance significativo',
            avance_observado: 'Nuevo mamógrafo, nuevo densitómetro y priorización del recambio de dos ecógrafos.',
            lectura_direccion: 'Existe una hoja de renovación clara, pero quedan decisiones de presupuesto, cronograma y priorización de Eco 2 Santa Fe y Eco 2 San Luis.'
        },
        {
            codigo: 'PA-16',
            eje: 'Producción, derivaciones, captación y sustentabilidad',
            estado_cierre: 'Avance significativo',
            avance_observado: 'Crecimiento de Tomografía y mejoras en varias modalidades, con seguimiento de capacidad y derivaciones.',
            lectura_direccion: 'El avance productivo es positivo, pero todavía falta comparar sistemáticamente contra presupuesto/capacidad y transformar el seguimiento en metas concretas por modalidad.'
        }
    ],
    evaluacion_ejes: [
        {
            titulo: 'Eje 1 - Seguridad del paciente: identificación inequívoca',
            objetivo: 'Reducir pacientes duplicados y errores de asociación entre solicitud, paciente, estudio e imágenes.',
            avances: [
                'Se trabajó con Calidad en capacitación y refuerzo de la doble verificación.',
                'Se formalizó la necesidad de un circuito institucional para comunicar y tratar errores de identificación o asignación.',
                'El servicio recibió 78 reportes como sector destino; se informó 18% de resolución, 4 hallazgos críticos y 26,8 días promedio de cierre.'
            ],
            evaluacion_direccion: 'Avance parcial. El tema se mantuvo activo durante todo el período, lo que confirma que continúa siendo un riesgo relevante y no un problema cerrado.',
            pendiente_principal: 'Crear indicadores mensuales de duplicaciones, estudios mal asociados, causa, sector/usuario de origen y reincidencia; mejorar el porcentaje y tiempo de resolución de reportes.'
        },
        {
            titulo: 'Eje 2 - Continuidad operativa e infraestructura tecnológica',
            objetivo: 'Asegurar continuidad ante fallas de PACS, conectividad, energía y equipamiento crítico.',
            avances: [
                'Se documentaron instructivos para operar frente a indisponibilidad de PACS.',
                'Se realizó mantenimiento de UPS de ecógrafos y mamografía en Sede Santa Fe.',
                'El densitómetro de Sede Santa Fe quedó operativo.',
                'El nuevo mamógrafo de Sede San Luis comenzó a producir el 29/10/2026.'
            ],
            evaluacion_direccion: 'Cumplido para el período. El desafío pasa a ser sostener la prevención, probar contingencias y medir indisponibilidad/tiempo de recuperación de los equipos críticos.',
            pendiente_principal: 'Sostener pruebas periódicas de contingencia y medir horas de indisponibilidad por equipo crítico.'
        },
        {
            titulo: 'Eje 3 - Renovación tecnológica',
            objetivo: 'Priorizar tecnología según impacto clínico, continuidad, adopción y retorno.',
            avances: [
                'Se incorporó nueva tecnología en Mamografía y Densitometría.',
                'Se definieron como próximas prioridades Eco 2 Sede Santa Fe (Voluson E8) y Eco 2 Sede San Luis (Alpinion).',
                'Se mantuvo el trabajo con TYS sobre PACS y continuidad tecnológica.'
            ],
            evaluacion_direccion: 'Avance significativo. El servicio ya identifica prioridades, pero debe convertirlas en un plan formal de renovación con criticidad, costo, fecha y beneficio esperado.',
            pendiente_principal: 'Formalizar plan de inversión 2027 (Eco 2 Santa Fe, Eco 2 San Luis y definición de Resonador).'
        },
        {
            titulo: 'Eje 4 - Producción, captación y sustentabilidad',
            objetivo: 'Aumentar producción, derivaciones y utilización de la capacidad instalada, reduciendo fuga de demanda.',
            avances: [
                'Tomografía pasó de 401 estudios en julio a 464 en octubre (+15,7%).',
                'Ecografías se mantuvieron en un nivel alto: 6.481 en julio, 6.841 en septiembre y 6.501 en octubre.',
                'Densitometría se recuperó desde 8 estudios en julio a 184 en octubre, luego de la puesta operativa del equipo.',
                'Ecocardiogramas pasaron de 196 en julio a 229 en octubre.',
                'Radiografías mostraron crecimiento en agosto-septiembre y caída en octubre.'
            ],
            evaluacion_direccion: 'Avance significativo, pero todavía no es posible evaluar plenamente la sustentabilidad porque las metas continúan expresadas como "según presupuesto mensual" sin mostrar en el informe la brecha concreta contra presupuesto, capacidad disponible o margen.',
            pendiente_principal: 'Definir metas cuantitativas mensuales por modalidad y mostrar brecha real vs presupuesto y capacidad instalada.'
        }
    ],
    evolucion_indicadores: [
        { indicador: 'Ecografías', valores: { '2026-07': 6481, '2026-08': 6732, '2026-09': 6841, '2026-10': 6501 }, lectura: 'Volumen alto y estable; pico en septiembre.' },
        { indicador: 'Tomografías', valores: { '2026-07': 401, '2026-08': 403, '2026-09': 466, '2026-10': 464 }, lectura: 'Crecimiento relevante y sostenido desde julio (+15,7%).' },
        { indicador: 'Mamografías', valores: { '2026-07': 714, '2026-08': 727, '2026-09': 775, '2026-10': 851 }, lectura: 'Crecimiento al cierre del período, con fuerte incremento en octubre.' },
        { indicador: 'Radiografías', valores: { '2026-07': 1458, '2026-08': 1884, '2026-09': 2057, '2026-10': 1672 }, lectura: 'Mejora hasta septiembre; descenso en octubre.' },
        { indicador: 'Densitometrías', valores: { '2026-07': 8, '2026-08': 111, '2026-09': 220, '2026-10': 184 }, lectura: 'Recuperación marcada tras indisponibilidad/equipo.' },
        { indicador: 'Ecocardiogramas', valores: { '2026-07': 196, '2026-08': 196, '2026-09': 215, '2026-10': 229 }, lectura: 'Tendencia creciente.' }
    ],
    nota_validacion: 'Los valores definitivos informados por el servicio son 851 mamografías y 6.501 ecografías para octubre 2026. La serie fue corregida en el Informe Ejecutivo.',
    logros_periodo: [
        'Sostenimiento de un alto volumen de ecografías y crecimiento de Tomografía.',
        'Recuperación de Densitometría luego de la indisponibilidad técnica.',
        'Renovación tecnológica con nuevo densitómetro y nuevo mamógrafo.',
        'Mamógrafo de Sede San Luis en funcionamiento desde el 29/10/2026.',
        'Formalización de circuitos de contingencia tecnológica y mantenimiento preventivo.',
        'Mayor visibilidad de problemas de seguridad del paciente vinculados a identificación y asociación de estudios.',
        'Definición preliminar de prioridades de renovación para ecógrafos.'
    ],
    pendientes_alertas: [
        'Cerrar el circuito de identificación inequívoca y disminuir efectivamente duplicaciones/errores de asociación.',
        'Mejorar la resolución de reportes y reducir los tiempos de cierre, priorizando hallazgos críticos.',
        'Sostener una fuente única y un método uniforme de extracción de indicadores, evitando futuras diferencias entre datos cuantitativos y comentarios ejecutivos.',
        'Mostrar mensualmente producción real versus presupuesto y, cuando corresponda, capacidad utilizada.',
        'Definir cronograma y presupuesto de renovación de Eco 2 Santa Fe y Eco 2 San Luis.',
        'Medir indisponibilidad de equipos críticos y su impacto productivo/económico.',
        'Completar un indicador de experiencia/satisfacción del paciente, actualmente sin datos.',
        'Continuar el trabajo sobre cobertura médica y organización de ecografías/ecocardiografía en franjas críticas.'
    ],
    conclusion_direccion:
        'La Dirección considera que el Servicio de Diagnóstico por Imágenes presenta un desempeño favorable en el período julio-octubre 2026, con avances significativos en producción, continuidad operativa y renovación tecnológica. La prioridad de cierre debe concentrarse en tres aspectos: (1) fortalecer la seguridad de identificación del paciente y la resolución de reportes; (2) consolidar una fuente única y confiable de indicadores; y (3) transformar el seguimiento de producción en metas concretas de capacidad, captación y sustentabilidad por modalidad. El crecimiento futuro del servicio deberá apoyarse en información confiable, planificación tecnológica y aprovechamiento de la capacidad instalada.',
    pedido_proximo_ejercicio: {
        titulo: 'Pedido de Dirección al Servicio para el ejercicio 2027',
        intro: 'Se solicita a la responsable y al equipo del Servicio de Diagnóstico por Imágenes realizar una reunión interna de análisis del presente cierre y elevar a Dirección una propuesta de objetivos para el ejercicio 2027 (entre 3 y 5 objetivos priorizados):',
        requisitos: [
            'Situación de partida / línea de base',
            'Resultado que se pretende alcanzar',
            'Indicador y fórmula de medición',
            'Meta cuantitativa y plazo',
            'Responsable principal',
            'Principales acciones (3 a 5)',
            'Necesidades de inversión o apoyo de Dirección'
        ],
        temas_recomendados: 'Seguridad e identificación inequívoca; producción y utilización de capacidad; experiencia del paciente; disponibilidad y tiempos de informes; renovación tecnológica; mantenimiento/contingencia; consistencia y trazabilidad de indicadores; captación y derivación interna/externa.'
    }
};

const DXI_OBJETIVOS_2027 = [
    {
        sector_id: 'DXI',
        servicio_nombre: 'Diagnóstico por Imágenes',
        anio_ejercicio: 2027,
        periodo_etiqueta: 'Noviembre 2026 - Octubre 2027',
        fecha_presentacion: 'Noviembre 2026',
        orden: 1,
        objetivo: 'Reducir las duplicaciones y errores de asociación de estudios, fortaleciendo la identificación inequívoca del paciente.',
        linea_base: 'Avance parcial en 2026. Persisten errores de identificación/asignación y estudios mal vinculados.',
        resultado_esperado: 'Disminución efectiva de duplicaciones y errores de asociación entre paciente, solicitud, estudio e imágenes.',
        indicador: 'Errores de identificación / cantidad de estudios realizados',
        formula_medicion: 'Del registro de incidentes de reporte de Dora y del PACS de imágenes.',
        meta: 'Reducir la cantidad de errores de identificación (< 0,1% de estudios)',
        plazo: '2027-05-31',
        responsable: 'Valeria Mercado (Servicio DxI) + Referente de Seguridad/Calidad + Sistemas',
        acciones_principales: [
            { id: 'a1', texto: 'Definir e implementar indicador mensual de duplicaciones y estudios mal asociados (con causa y origen).', completada: true },
            { id: 'a2', texto: 'Reforzar capacitación y doble verificación en todos los puestos de recepción y técnicos.', completada: false },
            { id: 'a3', texto: 'Formalizar circuito institucional de comunicación y tratamiento de errores de identificación/asignación.', completada: false },
            { id: 'a4', texto: 'Mejorar la gestión y seguimiento de reportes, con foco en hallazgos críticos.', completada: false },
            { id: 'a5', texto: 'Auditorías periódicas de cumplimiento del protocolo de identificación.', completada: false }
        ],
        necesidades_apoyo: 'Apoyo de Calidad para protocolo y auditorías. Apoyo de Sistemas/TYS para reportes desde PACS y alertas de duplicación. Tiempo de capacitación del personal.',
        estado: 'En ejecución',
        progreso_pct: 20
    },
    {
        sector_id: 'DXI',
        servicio_nombre: 'Diagnóstico por Imágenes',
        anio_ejercicio: 2027,
        periodo_etiqueta: 'Noviembre 2026 - Octubre 2027',
        fecha_presentacion: 'Noviembre 2026',
        orden: 2,
        objetivo: 'Aumentar la captación y el uso efectivo de la capacidad instalada por modalidad, definiendo metas de producción vinculadas a presupuesto y capacidad disponible.',
        linea_base: 'El período 2026 mostró crecimiento (Tomografía +15,7%, Mamografía hasta 851 estudios en octubre, recuperación de Densitometría). Sin embargo, las metas continúan expresadas como "según presupuesto mensual" sin mostrar sistemáticamente la brecha entre producción real, presupuesto y capacidad instalada.',
        resultado_esperado: 'Metas de producción claras por modalidad (y sede cuando corresponda), con seguimiento mensual de producción real versus meta.',
        indicador: 'Producción real / Meta de producción (o capacidad disponible) por modalidad',
        formula_medicion: 'Estudios realizados / Meta definida (o capacidad teórica disponible) × 100, por modalidad.',
        meta: 'Definir metas anuales y mensuales por modalidad y alcanzar ≥ 90% de la producción objetivo.',
        plazo: '2027-05-31',
        responsable: 'Valeria Mercado (Responsable del Servicio de Diagnóstico por Imágenes)',
        acciones_principales: [
            { id: 'b1', texto: 'Definir metas de producción 2027 por modalidad (y sede) junto con Dirección y áreas clínicas.', completada: false },
            { id: 'b2', texto: 'Establecer tablero mensual de producción real vs meta vs capacidad vs presupuesto.', completada: true },
            { id: 'b3', texto: 'Analizar variaciones y causas (agenda, cobertura médica, derivaciones, fallas técnicas).', completada: false },
            { id: 'b4', texto: 'Implementar acciones de captación y derivación interna/externa según desvíos.', completada: false },
            { id: 'b5', texto: 'Revisar trimestralmente el cumplimiento y ajustar metas o recursos.', completada: false }
        ],
        necesidades_apoyo: 'Apoyo de Sistemas para reportes unificados de producción y capacidad. Articulación con Dirección para definición de metas y presupuesto. Apoyo comercial/captación si se requieren acciones externas.',
        estado: 'En ejecución',
        progreso_pct: 20
    },
    {
        sector_id: 'DXI',
        servicio_nombre: 'Diagnóstico por Imágenes',
        anio_ejercicio: 2027,
        periodo_etiqueta: 'Noviembre 2026 - Octubre 2027',
        fecha_presentacion: 'Noviembre 2026',
        orden: 3,
        objetivo: 'Priorizar y ejecutar el plan de renovación tecnológica y sostener la continuidad operativa de los equipos críticos.',
        linea_base: 'Avance significativo en 2026: nuevo mamógrafo (Sede San Luis operativo desde 29/10) y nuevo densitómetro. Se definieron como próximas prioridades Eco 2 Santa Fe (Voluson E8) y Eco 2 San Luis (Alpinion). Falta definición de la compra del resonador.',
        resultado_esperado: 'Plan de renovación tecnológica formalizado y disponibilidad sostenida de equipos críticos.',
        indicador: 'Disponibilidad de equipos críticos (%) + % de cumplimiento del plan de renovación tecnológica',
        formula_medicion: 'Horas de equipo disponible / Horas programadas × 100.',
        meta: 'Formalizar el plan de renovación 2027 (Eco 2 Santa Fe, Eco 2 San Luis, Resonador) con fechas y presupuesto. Alcanzar ≥ 95% de disponibilidad de equipos.',
        plazo: '2027-05-31',
        responsable: 'Valeria Mercado (Servicio DxI) + AGC / T&S',
        acciones_principales: [
            { id: 'c1', texto: 'Elaborar plan formal de renovación tecnológica 2027 (criticidad, costo, beneficio, cronograma).', completada: true },
            { id: 'c2', texto: 'Gestionar con Dirección la aprobación de presupuesto y priorización de Eco 2 Santa Fe, Eco 2 San Luis y Resonador.', completada: false },
            { id: 'c3', texto: 'Implementar medición mensual de indisponibilidad de equipos críticos e impacto productivo.', completada: false },
            { id: 'c4', texto: 'Sostener mantenimiento preventivo y pruebas periódicas de circuitos de contingencia.', completada: true },
            { id: 'c5', texto: 'Seguir el avance de instalación y puesta en marcha de los equipos priorizados.', completada: false }
        ],
        necesidades_apoyo: 'Decisión y presupuesto de Dirección para recambio de ecógrafos y definición de resonador. Apoyo de TYS para evaluación técnica, compra e instalación. Continuidad del soporte de mantenimiento.',
        estado: 'En ejecución',
        progreso_pct: 40
    },
    {
        sector_id: 'DXI',
        servicio_nombre: 'Diagnóstico por Imágenes',
        anio_ejercicio: 2027,
        periodo_etiqueta: 'Noviembre 2026 - Octubre 2027',
        fecha_presentacion: 'Noviembre 2026',
        orden: 4,
        objetivo: 'Mejorar la resolución de reportes de Dora.',
        linea_base: 'En el período se informó 18% de resolución de reportes, 4 hallazgos críticos y 26,8 días promedio de cierre.',
        resultado_esperado: 'Mejora sustancial en el porcentaje y tiempo de resolución de reportes (especialmente críticos).',
        indicador: 'Métrica de resolución y tiempo de cierre en Dora',
        formula_medicion: 'Reportes cerrados con evidencia / Total reportes recibidos × 100 (Fuente: Dora).',
        meta: '90% de los reportes cerrados con evidencia.',
        plazo: '2027-05-31',
        responsable: 'Valeria Mercado (Servicio DxI) + Referente de Calidad / Experiencia del Paciente',
        acciones_principales: [
            { id: 'd1', texto: 'Establecer metas mensuales de resolución y tiempos máximos de cierre de reportes en Dora.', completada: false },
            { id: 'd2', texto: 'Priorizar tratamiento inmediato (< 72 hs) de hallazgos críticos de seguridad.', completada: false },
            { id: 'd3', texto: 'Documentar evidencia verificable de cierre junto con Calidad y Experiencia del Paciente.', completada: false }
        ],
        necesidades_apoyo: 'Apoyo de Calidad / Experiencia del Paciente para diseño de encuesta y gestión de reportes. Apoyo de Sistemas para extracción de tiempos de informe desde PACS/RIS.',
        estado: 'En ejecución',
        progreso_pct: 0
    }
];

async function runMigration() {
    if (!accessToken) {
        console.warn('⚠️ SUPABASE_ACCESS_TOKEN no encontrado, asumiendo que la tabla ya existe.');
        return;
    }
    const sqlPath = resolve(__dirname, '..', 'migrations', '073_gob_reuniones_servicio.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🛠️ Ejecutando migración 073_gob_reuniones_servicio.sql en Supabase...');
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Error SQL (${res.status}): ${text}`);
    }
    console.log('✅ Migración 073 ejecutada correctamente.');
    // Dar 1.5s a PostgREST para refrescar caché de esquema
    await new Promise(r => setTimeout(r, 1500));
}

async function seedDxi() {
    await runMigration();

    console.log('📥 Precargando Informes Ejecutivos Mensuales DxI (Jul–Oct 2026)...');
    const { error: e1 } = await supabase
        .from('gob_reuniones_informes')
        .upsert(DXI_INFORMES_2026, { onConflict: 'sector_id,periodo' });
    if (e1) throw e1;
    console.log(`   → ${DXI_INFORMES_2026.length} informes mensuales RDIR 04 cargados.`);

    console.log('📥 Precargando Revisión por la Dirección DxI (Julio - Octubre 2026)...');
    const { error: e2 } = await supabase
        .from('gob_reuniones_revision')
        .upsert([DXI_REVISION_DIRECCION], { onConflict: 'sector_id,periodo_evaluado' });
    if (e2) throw e2;
    console.log('   → 1 Revisión por la Dirección cargada.');

    console.log('📥 Precargando Propuesta de Objetivos 2027 DxI (4 objetivos accionables)...');
    const { error: e3 } = await supabase
        .from('gob_reuniones_objetivos')
        .upsert(DXI_OBJETIVOS_2027, { onConflict: 'sector_id,anio_ejercicio,orden' });
    if (e3) throw e3;
    console.log(`   → ${DXI_OBJETIVOS_2027.length} objetivos 2027 cargados.`);

    console.log('🎉 Seed completo de Reuniones de Servicio (DxI) finalizado con éxito.');
}

seedDxi().then(() => process.exit(0)).catch(err => {
    console.error('❌ Error en seed_reuniones_dxi:', err);
    process.exit(1);
});
