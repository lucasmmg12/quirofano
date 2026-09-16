import React, { useState, useMemo } from 'react';
import { 
    BookOpen, X, Copy, Check, Search, Database, Layers, 
    Activity, Bed, FileText, DollarSign, Stethoscope, AlertTriangle 
} from 'lucide-react';

export default function SqlDocumentationModal({ isOpen, onClose, initialTab = 'UCI' }) {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [searchFilter, setSearchFilter] = useState('');
    const [copiedIndex, setCopiedIndex] = useState(null);

    // Sincronizar tab inicial cuando abre
    React.useEffect(() => {
        if (initialTab) setActiveTab(initialTab);
    }, [initialTab, isOpen]);

    const handleCopy = (sqlText, idx) => {
        navigator.clipboard.writeText(sqlText);
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2500);
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999, padding: '20px'
        }}>
            <div style={{
                background: '#FFFFFF', borderRadius: '14px',
                width: '100%', maxWidth: '1100px', height: '90vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #CBD5E1', overflow: 'hidden'
            }}>
                {/* ─── CABECERA DEL MODAL ─── */}
                <div style={{
                    padding: '16px 24px', borderBottom: '1px solid #E2E8F0',
                    background: '#F8FAFC', display: 'flex',
                    flexDirection: 'column', gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '38px', height: '38px', borderRadius: '9px',
                                background: '#EFF6FF', border: '1px solid #BFDBFE',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#1E40AF'
                            }}>
                                <BookOpen size={20} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                                    Repositorio Maestro SQL & Manual de Extracción SALUS
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748B' }}>
                                    Servidor: <code>128.223.16.29:2450</code> · Base de Datos: <code>SALUS</code> · Motor: Transact-SQL (T-SQL)
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            style={{
                                background: '#F1F5F9', border: '1px solid #CBD5E1',
                                borderRadius: '8px', padding: '6px', cursor: 'pointer',
                                color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                            title="Cerrar manual"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* SELECTOR DE PESTAÑAS POR MÓDULO + BUSCADOR */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{
                            display: 'inline-flex', background: '#E2E8F0',
                            padding: '3px', borderRadius: '9px', gap: '3px'
                        }}>
                            {[
                                { id: 'UCI', label: '🏥 Cuidados Críticos (UCI)' },
                                { id: 'GUARDIA', label: '🚑 Guardia Clínica (9 Indicadores)' },
                                { id: 'QUIROFANO', label: '🔪 Quirófano & Cirugías' },
                                { id: 'FACTURACION', label: '💳 Facturación & Cobros' },
                                { id: 'ARQUITECTURA', label: '⚙️ Arquitectura ETL & Sync' }
                            ].map(tab => {
                                const isSel = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        style={{
                                            border: 'none', borderRadius: '7px',
                                            padding: '6px 12px', fontSize: '0.78rem',
                                            fontWeight: isSel ? 800 : 600,
                                            background: isSel ? '#FFFFFF' : 'transparent',
                                            color: isSel ? '#1E40AF' : '#475569',
                                            cursor: 'pointer',
                                            boxShadow: isSel ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Buscador interactivo de tablas y campos */}
                        <div style={{
                            display: 'flex', alignItems: 'center', background: '#FFFFFF',
                            border: '1px solid #CBD5E1', borderRadius: '8px', padding: '4px 10px',
                            gap: '6px', width: '260px'
                        }}>
                            <Search size={14} color="#94A3B8" />
                            <input
                                type="text"
                                placeholder="Filtrar por tabla, CTE o campo..."
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                style={{
                                    border: 'none', outline: 'none', fontSize: '0.76rem',
                                    color: '#1E293B', width: '100%', background: 'transparent'
                                }}
                            />
                            {searchFilter && (
                                <button
                                    onClick={() => setSearchFilter('')}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', padding: 0 }}
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ─── CUERPO DEL REPOSITORIO SQL CON SCROLL ─── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#FFFFFF' }}>
                    
                    {/* ══════════════════════════════════════════════════════ */}
                    {/* TAB 1: CUIDADOS CRÍTICOS (UCI) */}
                    {/* ══════════════════════════════════════════════════════ */}
                    {activeTab === 'UCI' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '14px 18px', borderRadius: '10px' }}>
                                <strong style={{ color: '#1E40AF', fontSize: '0.9rem' }}>
                                    Alcance y Gobernanza de Cuidados Críticos (UCI Adultos)
                                </strong>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#1E3A8A' }}>
                                    Dotación nominal oficial: <strong>16 camas operativas</strong> distribuidas en <strong>Terapia Intensiva (Boxes 1 al 8)</strong> y <strong>Terapia Intermedia (Habitaciones 222 al 229)</strong>.
                                    <br />
                                    <em>Nota crítica:</em> Las unidades pediátricas (<code>UNIDAD 01</code> al <code>05</code>) quedan expresamente excluidas de las consultas de UCI.
                                </p>
                            </div>

                            {/* 1.1 Días Camas de Ocupación con spt_values */}
                            <QueryCard
                                id="uci_ocupacion"
                                title="1. Query Canónica de Días Camas de Ocupación (T-SQL con spt_values)"
                                desc="Expande cada internación en una fila por cada noche pernoctada efectiva dentro del sanatorio utilizando la tabla auxiliar de números spt_values."
                                origin="TABLEAU_Admisiones (SALUS)"
                                target="calidad_admisiones_ocupacion (Supabase)"
                                frequency="Diaria / Bajo demanda vía Sync Server"
                                copied={copiedIndex === 'uci_ocupacion'}
                                onCopy={() => handleCopy(SQL_UCI_OCUPACION, 'uci_ocupacion')}
                                sql={SQL_UCI_OCUPACION}
                            />

                            {/* 1.2 Censo en Tiempo Real de 16 Camas */}
                            <QueryCard
                                id="uci_censo"
                                title="2. Query de Censo en Tiempo Real (16 Camas Operativas: Boxes 1-8 e Intermedia 222-229)"
                                desc="Construye la matriz canónica de las 16 camas de UCI mediante CTE de destino y cruce forense con las admisiones vivas sin alta, ordenadas por Box y Habitación."
                                origin="TABLEAU_Admisiones (SALUS)"
                                target="calidad_censo_camas_uci (Supabase)"
                                frequency="Tiempo real continuo (Polled por sync server)"
                                copied={copiedIndex === 'uci_censo'}
                                onCopy={() => handleCopy(SQL_UCI_CENSO, 'uci_censo')}
                                sql={SQL_UCI_CENSO}
                            />

                            {/* 1.3 Historial Granular de Camas y Traslados */}
                            <QueryCard
                                id="uci_historial"
                                title="3. Query de Historial Granular de Movimientos y Traslados Internos en UCI"
                                desc="Recupera la secuencia longitudinal de cambios de cama de cada paciente internado para el Cronograma Gantt interactivo."
                                origin="TABLEAU_Admisiones & Movimientos (SALUS)"
                                target="calidad_admisiones_camas_historial (Supabase)"
                                frequency="Diaria / Sync Rápido"
                                copied={copiedIndex === 'uci_historial'}
                                onCopy={() => handleCopy(SQL_UCI_HISTORIAL, 'uci_historial')}
                                sql={SQL_UCI_HISTORIAL}
                            />

                            {/* 1.4 Peticiones y Estudios Clínicos de UCI */}
                            <QueryCard
                                id="uci_peticiones"
                                title="4. Query de Estudios Diagnósticos, Laboratorio e Imágenes en UCI"
                                desc="Extrae analíticas bioquímicas, radiografías en cama y estudios complementarios solicitados a pacientes alojados en los Boxes de UCI."
                                origin="VLISE_PeticionesPruebas (SALUS)"
                                target="calidad_peticiones_pruebas (Supabase)"
                                frequency="Diaria / Acumulativa mensual"
                                copied={copiedIndex === 'uci_peticiones'}
                                onCopy={() => handleCopy(SQL_UCI_PETICIONES, 'uci_peticiones')}
                                sql={SQL_UCI_PETICIONES}
                            />

                            {/* 1.5 Kinesiología y Soporte Respiratorio */}
                            <QueryCard
                                id="uci_kine"
                                title="5. Query de Kinesiología y Parámetros de Ventilación Mecánica (Protocolos 580 a 585)"
                                desc="Ingesta de respuestas de protocolos clínicos para monitoreo de Asistencia Respiratoria Mecánica (ARM), destete, FiO2, PEEP y sedoanalgesia."
                                origin="PR InstRespVisitaPaciente, PR PreguntasProtocolo, PR Protocolos (SALUS)"
                                target="calidad_kinesiologia_uci (Supabase)"
                                frequency="Diaria"
                                copied={copiedIndex === 'uci_kine'}
                                onCopy={() => handleCopy(SQL_UCI_KINESIOLOGIA, 'uci_kine')}
                                sql={SQL_UCI_KINESIOLOGIA}
                            />

                            {/* 1.6 Diagnósticos de Egreso y CIE-10 */}
                            <QueryCard
                                id="uci_diag"
                                title="6. Query de Diagnósticos de Egreso y Motivo de Consulta CIE-10"
                                desc="Vincula los códigos diagnósticos formales y motivos de internación con las historias clínicas de UCI para auditoría de mortalidad."
                                origin="TABLEAU_Diagnosticos y motivo consulta (SALUS)"
                                target="calidad_diagnosticos_uci (Supabase)"
                                frequency="Diaria"
                                copied={copiedIndex === 'uci_diag'}
                                onCopy={() => handleCopy(SQL_UCI_DIAGNOSTICOS, 'uci_diag')}
                                sql={SQL_UCI_DIAGNOSTICOS}
                            />

                            {/* 1.7 Fórmulas Clínicas y Benchmarks */}
                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '16px', borderRadius: '10px' }}>
                                <h4 style={{ margin: '0 0 10px 0', color: '#1E40AF', fontSize: '0.88rem' }}>
                                    📐 Fórmulas Matemáticas de los Indicadores UCI
                                </h4>
                                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8rem', color: '#334155', lineHeight: 1.8 }}>
                                    <li><strong>Días Camas Disponibles:</strong> <code>Camas Operativas × Cantidad de Días del Período</code>.</li>
                                    <li><strong>% de Ocupación:</strong> <code>(Días Camas Ocupados / Días Camas Disponibles) × 100</code>. Benchmark UCI: 75% - 85%.</li>
                                    <li><strong>Promedio de Estancia (ALOS):</strong> <code>Sumatoria de días de permanencia / Total de admisiones</code>.</li>
                                    <li><strong>Mortalidad Cruda (% de Defunción):</strong> <code>(Fallecidos en UCI / Total de Egresos de UCI) × 100</code>.</li>
                                    <li><strong>Regla de Imputación Temporal de Defunciones:</strong> Las defunciones se imputan estrictamente por <strong>Fecha de Alta / Óbito</strong> (momento del deceso), no por fecha de ingreso censal. Si un paciente ingresó a fines de un mes (ej. julio) pero falleció en el mes subsiguiente (ej. agosto), el evento y la auditoría clínica se computan formalmente en el mes del deceso (agosto).</li>
                                    <li><strong>Intensidad Diagnóstica:</strong> <code>Total Estudios Clínicos en UCI / Días Camas Ocupados</code>.</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════ */}
                    {/* TAB 2: GUARDIA CLÍNICA (9 INDICADORES) */}
                    {/* ══════════════════════════════════════════════════════ */}
                    {activeTab === 'GUARDIA' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', padding: '14px 18px', borderRadius: '10px' }}>
                                <strong style={{ color: '#92400E', fontSize: '0.9rem' }}>
                                    Gobernanza y Reglas de Negocio de Guardia Clínica
                                </strong>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#78350F' }}>
                                    <strong>Exclusión Obligatoria:</strong> La Guardia Gineco-Obstétrica opera en un circuito asistencial y administrativo separado. Se excluyen expresamente partos, cesáreas y ginecología mediante filtros: 
                                    <code>Especialidad NOT LIKE '%GINECO%' AND Especialidad NOT LIKE '%OBSTETR%' AND Servicio NOT LIKE '%MATERN%'</code>.
                                </p>
                            </div>

                            {/* 2.1 Master Query Consolidada */}
                            <QueryCard
                                id="guardia_master"
                                title="1. Query Canónica Consolidada de Guardia Clínica (Los 9 Indicadores en una Consulta)"
                                desc="Consolidación mensual multi-CTE que calcula de forma simultánea atenciones, demoras, triage, cirugías, reconsultas, reinternaciones y epicrisis."
                                origin="VLISE_Visitas + TABLEAU_Admisiones + PR_RespuestasProtocolo (SALUS)"
                                target="calidad_guardia_indicadores (Supabase)"
                                frequency="Cierre mensual y actualización diaria"
                                copied={copiedIndex === 'guardia_master'}
                                onCopy={() => handleCopy(SQL_GUARDIA_MASTER, 'guardia_master')}
                                sql={SQL_GUARDIA_MASTER}
                            />

                            {/* 2.2 Consultas Nominales y Tiempos de Guardia */}
                            <QueryCard
                                id="guardia_nominal"
                                title="2. Query de Consultas y Auditoría Nominal de Triage (N1, N2, N3)"
                                desc="Auditoría individual por paciente calculando minutos exactos entre llegada a admisión, ingreso a consultorio médico y egreso de guardia."
                                origin="VLISE_Visitas (SALUS)"
                                target="calidad_guardia_consultas (Supabase)"
                                frequency="Diaria"
                                copied={copiedIndex === 'guardia_nominal'}
                                onCopy={() => handleCopy(SQL_GUARDIA_NOMINAL, 'guardia_nominal')}
                                sql={SQL_GUARDIA_NOMINAL}
                            />

                            {/* 2.3 Conversiones Quirúrgicas desde Guardia */}
                            <QueryCard
                                id="guardia_qx"
                                title="3. Query de Conversión a Cirugía (Pases a Quirófano < 48 hs)"
                                desc="Cruce forense por NHC entre la consulta en guardia y la admisión quirúrgica inmediata antes de 48 horas con exclusión ginecológica."
                                origin="VLISE_Visitas + TABLEAU_Admisiones (SALUS)"
                                target="Cálculo dinámico / Auditoría quirúrgica"
                                frequency="Diaria"
                                copied={copiedIndex === 'guardia_qx'}
                                onCopy={() => handleCopy(SQL_GUARDIA_CONVERSION_QX, 'guardia_qx')}
                                sql={SQL_GUARDIA_CONVERSION_QX}
                            />

                            {/* 2.4 Demanda Diagnóstica: Radiología y TAC */}
                            <QueryCard
                                id="guardia_rx"
                                title="4. Query de Estudios de Diagnóstico por Imágenes en Urgencias (TAC y Rx)"
                                desc="Mide la presión diagnóstica sobre el servicio de imágenes derivada de pacientes atendidos en guardia."
                                origin="VLISE_PeticionesPruebasRadiologia (SALUS)"
                                target="calidad_guardia_imagenes (Supabase)"
                                frequency="Diaria"
                                copied={copiedIndex === 'guardia_rx'}
                                onCopy={() => handleCopy(SQL_GUARDIA_IMAGENES, 'guardia_rx')}
                                sql={SQL_GUARDIA_IMAGENES}
                            />

                            {/* 2.5 Metodología de los 9 Indicadores */}
                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '16px', borderRadius: '10px' }}>
                                <h4 style={{ margin: '0 0 10px 0', color: '#1E40AF', fontSize: '0.88rem' }}>
                                    📋 Catálogo de los 9 Indicadores Normados y Benchmarks
                                </h4>
                                <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8rem', color: '#334155', lineHeight: 1.8 }}>
                                    <li><strong>1. Tasa de Conversión a Cirugía:</strong> <code>(Pases a Quirófano &lt; 48hs / Total Consultas) × 100</code>. Benchmark: 8% - 12%.</li>
                                    <li><strong>2. Tiempo de Espera Médico:</strong> <code>DATEDIFF(MINUTE, Entrada Real, Inicio Atención)</code>. Benchmark: &lt; 30 min.</li>
                                    <li><strong>3. Cobertura de Triage:</strong> % de pacientes con clasificación N1, N2 o N3 registrada. Meta: &gt; 95%.</li>
                                    <li><strong>4. Tasa de Reconsulta (72 hs):</strong> Autocruce temporal por NHC a guardia dentro de 3 días. Benchmark: &lt; 7%.</li>
                                    <li><strong>5. Reinternación Temprana (72 hs):</strong> Pacientes derivados de guardia con alta de internación que reingresan antes de 72 hs. Benchmark: &lt; 5%.</li>
                                    <li><strong>6. Demanda de Imágenes (TAC y Rx):</strong> <code>(Tomografías + Radiografías / Total Consultas) × 100</code>. Benchmark: 25 - 35 cada 100.</li>
                                    <li><strong>7. Destinos Post-Guardia:</strong> Trazabilidad del egreso (Domicilio, Piso, UTI, Quirófano, Derivación).</li>
                                    <li><strong>8. Promedio de Estada Clínica:</strong> Días de hospitalización de pacientes ingresados por guardia. Benchmark: 1.5 - 2.5 días.</li>
                                    <li><strong>9. Adherencia a Epicrisis:</strong> % de altas clínicas de guardia con Protocolo 382 completado. Meta institucional: 100%.</li>
                                </ol>
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════ */}
                    {/* TAB 3: QUIRÓFANO & CIRUGÍAS (ADM-QUI) */}
                    {/* ══════════════════════════════════════════════════════ */}
                    {activeTab === 'QUIROFANO' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', padding: '14px 18px', borderRadius: '10px' }}>
                                <strong style={{ color: '#5B21B6', fontSize: '0.9rem' }}>
                                    Módulo Quirúrgico Central (ADM-QUI)
                                </strong>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#4C1D95' }}>
                                    Sincronización de partes quirúrgicos, agendas de quirófano, fojas quirúrgicas con triage de complejidad y presupuestos de pacientes.
                                </p>
                            </div>

                            {/* 3.1 Programación Quirúrgica Central */}
                            <QueryCard
                                id="qx_cirugias"
                                title="1. Query de Programación y Turnos de Quirófano"
                                desc="Extrae cirugías programadas, profesionales intervinientes, quirófano asignado, cobertura e instrucciones quirúrgicas."
                                origin="_PR_AGENDA_QRY_SENZILL + _PR_AGENDA_QRY_QUIROFAN (SALUS)"
                                target="cirugias (Supabase)"
                                frequency="Sync Server (Automático en bucle continuo)"
                                copied={copiedIndex === 'qx_cirugias'}
                                onCopy={() => handleCopy(SQL_QX_CIRUGIAS, 'qx_cirugias')}
                                sql={SQL_QX_CIRUGIAS}
                            />

                            {/* 3.2 Foja Quirúrgica y Procedimientos */}
                            <QueryCard
                                id="qx_foja"
                                title="2. Query de Foja Quirúrgica y Triage de Complejidad"
                                desc="Extrae hasta 4 procedimientos quirúrgicos por intervención y calcula la complejidad de facturación de la admisión."
                                origin="TABLEAU_FojaQuirurgica (SALUS)"
                                target="altas_administrativas / foja (Supabase)"
                                frequency="Diaria / Sync Rápido"
                                copied={copiedIndex === 'qx_foja'}
                                onCopy={() => handleCopy(SQL_QX_FOJA, 'qx_foja')}
                                sql={SQL_QX_FOJA}
                            />

                            {/* 3.3 Presupuestos Quirúrgicos */}
                            <QueryCard
                                id="qx_presupuestos"
                                title="3. Query de Presupuestos de Cirugía y Prácticas"
                                desc="Ingesta de presupuestos emitidos, ítems presupuestados, valores unitarios, estado de aceptación y caducidad."
                                origin="VLISE_Presupuestos (SALUS)"
                                target="presupuestos + presupuestos_items (Supabase)"
                                frequency="Diaria"
                                copied={copiedIndex === 'qx_presupuestos'}
                                onCopy={() => handleCopy(SQL_QX_PRESUPUESTOS, 'qx_presupuestos')}
                                sql={SQL_QX_PRESUPUESTOS}
                            />
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════ */}
                    {/* TAB 4: FACTURACIÓN, COBROS & DEUDAS */}
                    {/* ══════════════════════════════════════════════════════ */}
                    {activeTab === 'FACTURACION' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '14px 18px', borderRadius: '10px' }}>
                                <strong style={{ color: '#065F46', fontSize: '0.9rem' }}>
                                    Circuito Financiero y Facturación Administrativa
                                </strong>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#047857' }}>
                                    Control de deudas de pacientes particulares (Tarifa 042%), conciliación de cobros de cajas, notas de crédito y trazabilidad de facturación internada (Puntos de Venta 21 y 31).
                                </p>
                            </div>

                            {/* 4.1 Deudas de Pacientes */}
                            <QueryCard
                                id="fact_deudas"
                                title="1. Query de Deudas Activas de Pacientes (Tarifa 042% Particulares)"
                                desc="Extrae folios con deuda pendiente, datos de contacto del paciente (teléfono normalizado) y conceptos facturados."
                                origin="TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios (SALUS)"
                                target="deudas_lineas + deudas_pacientes (Supabase)"
                                frequency="Diaria / Sync Rápido"
                                copied={copiedIndex === 'fact_deudas'}
                                onCopy={() => handleCopy(SQL_FACT_DEUDAS, 'fact_deudas')}
                                sql={SQL_FACT_DEUDAS}
                            />

                            {/* 4.2 Cobros y Recaudación */}
                            <QueryCard
                                id="fact_cobros"
                                title="2. Query de Cobros y Recaudación de Cajas"
                                desc="Ingesta de recibos de cobro, medios de pago (efectivo, tarjeta, transferencia), usuario de caja y vinculación por NHC."
                                origin="PR_COBROS_QRY (SALUS)"
                                target="deudas_cobros (Supabase)"
                                frequency="Diaria"
                                copied={copiedIndex === 'fact_cobros'}
                                onCopy={() => handleCopy(SQL_FACT_COBROS, 'fact_cobros')}
                                sql={SQL_FACT_COBROS}
                            />

                            {/* 4.3 Notas de Crédito */}
                            <QueryCard
                                id="fact_nc"
                                title="3. Query de Notas de Crédito Emitidas"
                                desc="Extrae facturas rectificativas y notas de crédito aplicadas para deducir montos adeudados en la cuenta corriente del paciente."
                                origin="PR_FACTURAS_QRY (SALUS)"
                                target="deudas_notas_credito (Supabase)"
                                frequency="Diaria"
                                copied={copiedIndex === 'fact_nc'}
                                onCopy={() => handleCopy(SQL_FACT_NOTAS_CREDITO, 'fact_nc')}
                                sql={SQL_FACT_NOTAS_CREDITO}
                            />

                            {/* 4.4 Altas Administrativas y Facturación Internada */}
                            <QueryCard
                                id="fact_altas"
                                title="4. Query de Altas Administrativas y Facturación Internada (PDV 21 y 31)"
                                desc="Monitoreo del cierre administrativo de la internación, auditoría de historia clínica y verificación de factura emitida."
                                origin="TABLEAU_Admisiones + TABLEAU_Detalle de ventas (SALUS)"
                                target="altas_administrativas + facturas_internadas (Supabase)"
                                frequency="Diaria"
                                copied={copiedIndex === 'fact_altas'}
                                onCopy={() => handleCopy(SQL_FACT_ALTAS, 'fact_altas')}
                                sql={SQL_FACT_ALTAS}
                            />
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════ */}
                    {/* TAB 5: ARQUITECTURA ETL & SYNC SERVER */}
                    {/* ══════════════════════════════════════════════════════ */}
                    {activeTab === 'ARQUITECTURA' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', padding: '16px', borderRadius: '10px' }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#1E40AF', fontSize: '0.95rem' }}>
                                    Arquitectura del Pipeline de Datos (SALUS SQL Server ➔ Sync Server ➔ Supabase)
                                </h4>
                                <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                                    El sistema funciona mediante un agente ETL autónomo en Node.js (<code>sync-server</code>) ejecutado en la red local del Sanatorio. Conecta directamente a SQL Server vía TDS y sincroniza en lotes controlados hacia las tablas PostgreSQL de Supabase Cloud.
                                </p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                                <div style={{ border: '1px solid #E2E8F0', padding: '14px', borderRadius: '8px', background: '#FFFFFF' }}>
                                    <strong style={{ color: '#0F172A', fontSize: '0.85rem' }}>Servidor SQL Server Origen</strong>
                                    <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', fontSize: '0.78rem', color: '#64748B' }}>
                                        <li>IP: <code>128.223.16.29</code> (Puerto 2450)</li>
                                        <li>Base de Datos: <code>SALUS</code></li>
                                        <li>Usuario: <code>SalusConsulta</code></li>
                                        <li>Vistas principales: <code>TABLEAU_*</code> y <code>VLISE_*</code></li>
                                    </ul>
                                </div>

                                <div style={{ border: '1px solid #E2E8F0', padding: '14px', borderRadius: '8px', background: '#FFFFFF' }}>
                                    <strong style={{ color: '#0F172A', fontSize: '0.85rem' }}>Servicio Sync Server (ETL Local)</strong>
                                    <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', fontSize: '0.78rem', color: '#64748B' }}>
                                        <li>Puerto Local: <code>http://127.0.0.1:3456</code></li>
                                        <li>Endpoints: <code>/api/salus/sync-all</code></li>
                                        <li>Modo Rápido: <code>?fast=true</code> (últimos 15-30 días)</li>
                                        <li>Launcher: <code>Actualizar SALUS.bat</code></li>
                                    </ul>
                                </div>

                                <div style={{ border: '1px solid #E2E8F0', padding: '14px', borderRadius: '8px', background: '#FFFFFF' }}>
                                    <strong style={{ color: '#0F172A', fontSize: '0.85rem' }}>Destino Cloud (Supabase PostgreSQL)</strong>
                                    <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', fontSize: '0.78rem', color: '#64748B' }}>
                                        <li>Esquema: <code>public</code></li>
                                        <li>Estrategia de carga: <code>UPSERT</code> con clave única</li>
                                        <li>Tamaño de Lote (Batch): 400 - 500 registros</li>
                                        <li>Timestamp: <code>updated_at = NOW()</code></li>
                                    </ul>
                                </div>
                            </div>

                            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '12px 16px', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <AlertTriangle size={16} color="#D97706" />
                                    <strong style={{ color: '#B45309', fontSize: '0.82rem' }}>Pautas Críticas de Mantenimiento</strong>
                                </div>
                                <p style={{ fontSize: '0.78rem', color: '#92400E', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                                    1. Nunca ejecutar queries sin <code>DATEADD</code> o rango de fechas en tablas con más de 100.000 registros (ej. <code>VLISE_Visitas</code> o <code>PR InstRespVisitaPaciente</code>) para no bloquear el SQL Server en horas pico clínicas.
                                    <br />
                                    2. Todas las queries respetan la zona horaria de Argentina (UTC-3). En T-SQL las fechas se extraen en formato ISO <code>CAST(campo AS DATE)</code> o <code>CONVERT(..., 103)</code>.
                                </p>
                            </div>
                        </div>
                    )}

                </div>

                {/* ─── PIE DE PÁGINA DEL MODAL ─── */}
                <div style={{
                    padding: '12px 24px', background: '#F8FAFC',
                    borderTop: '1px solid #E2E8F0', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        Documentación Normada Sanatorio Argentino · Calidad-QOAG & Grow Labs
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '7px 18px', borderRadius: '7px',
                            border: '1px solid #CBD5E1', background: '#FFFFFF',
                            color: '#334155', fontWeight: 700, fontSize: '0.82rem',
                            cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        Cerrar Manual
                    </button>
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────
// COMPONENTE DE TARJETA DE CONSULTA SQL CON BOTÓN DE COPIADO
// ──────────────────────────────────────────────────────────────────────
function QueryCard({ id, title, desc, origin, target, frequency, copied, onCopy, sql }) {
    return (
        <div style={{
            border: '1px solid #CBD5E1', borderRadius: '10px',
            background: '#FFFFFF', overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
        }}>
            {/* Header de la tarjeta */}
            <div style={{
                padding: '12px 16px', background: '#F8FAFC',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex', alignItems: 'flex-start',
                justifyContent: 'space-between', gap: '12px'
            }}>
                <div>
                    <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                        {title}
                    </h4>
                    <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#475569' }}>
                        {desc}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.7rem', color: '#1E40AF', background: '#EFF6FF', padding: '2px 8px', borderRadius: '5px', border: '1px solid #BFDBFE' }}>
                            <strong>Origen:</strong> {origin}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#047857', background: '#ECFDF5', padding: '2px 8px', borderRadius: '5px', border: '1px solid #A7F3D0' }}>
                            <strong>Destino:</strong> {target}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            <strong>Frecuencia:</strong> {frequency}
                        </span>
                    </div>
                </div>

                <button
                    onClick={onCopy}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        background: copied ? '#ECFDF5' : '#FFFFFF',
                        border: copied ? '1px solid #10B981' : '1px solid #CBD5E1',
                        color: copied ? '#059669' : '#1E40AF',
                        borderRadius: '6px', padding: '5px 10px',
                        fontSize: '0.74rem', fontWeight: 700,
                        cursor: 'pointer', transition: 'all 0.15s ease',
                        flexShrink: 0
                    }}
                    title="Copiar código T-SQL al portapapeles"
                >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? '¡Copiado!' : 'Copiar SQL'}
                </button>
            </div>

            {/* Código SQL */}
            <pre style={{
                margin: 0, padding: '14px',
                background: '#0F172A', color: '#F1F5F9',
                fontSize: '0.75rem', overflowX: 'auto',
                fontFamily: 'Consolas, "Fira Code", monospace',
                lineHeight: 1.45, maxHeight: '320px'
            }}>
                <code>{sql}</code>
            </pre>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────
// CONSTANTES DE CÓDIGO TRANSACT-SQL MAESTRO (SALUS)
// ──────────────────────────────────────────────────────────────────────

const SQL_UCI_OCUPACION = `-- GOBERNANZA UCI: EXTRACCIÓN CANÓNICA DE DÍAS CAMAS DE OCUPACIÓN
-- Servidor: 128.223.16.29:2450 | Base: SALUS
SELECT 
    b.[Número admisión],
    DATEADD(DAY, v.number, CAST(b.[Fecha ingreso] AS DATE)) AS [Fecha Ocupacion],
    b.Especialidad,
    b.idAdmision,
    b.[Fecha ingreso],
    b.[Fecha alta],
    b.Procedencia,
    b.NHC,
    b.Paciente,
    b.[Motivo de alta],
    b.Cliente,
    b.[Estado Conceptos],
    b.Servicio,
    b.Proceso,
    b.Edad,
    b.[Motivo Alta],
    b.[Control ADM finalizado],
    b.Habitación AS habitacion,
    b.Sexo
FROM TABLEAU_Admisiones b
JOIN master.dbo.spt_values v
  ON v.type = 'P' 
  AND v.number <= DATEDIFF(DAY, CAST(b.[Fecha ingreso] AS DATE), CAST(ISNULL(b.[Fecha alta], GETDATE()) AS DATE))
WHERE b.Servicio IN ('UCI', 'TERAPIA INTERMEDIA')
  AND (b.[Fecha alta] >= '2025-06-01' OR b.[Fecha alta] IS NULL)
ORDER BY [Fecha Ocupacion] DESC;`;

const SQL_UCI_CENSO = `-- CENSO EN TIEMPO REAL: 16 CAMAS OPERATIVAS UCI ADULTOS
-- (BOX 1-8 Terapia Intensiva + Hab 222-229 Terapia Intermedia)
WITH CamasTarget AS (
    SELECT 'BOX 1' as hab_target, 1 as orden UNION ALL
    SELECT 'BOX 2', 2 UNION ALL
    SELECT 'BOX 3', 3 UNION ALL
    SELECT 'BOX 4', 4 UNION ALL
    SELECT 'BOX 5', 5 UNION ALL
    SELECT 'BOX 6', 6 UNION ALL
    SELECT 'BOX 7', 7 UNION ALL
    SELECT 'BOX 8', 8 UNION ALL
    SELECT '222', 9 UNION ALL
    SELECT '223', 10 UNION ALL
    SELECT '224', 11 UNION ALL
    SELECT '225', 12 UNION ALL
    SELECT '226', 13 UNION ALL
    SELECT '227', 14 UNION ALL
    SELECT '228', 15 UNION ALL
    SELECT '229', 16
),
AdmisionesActivas AS (
    SELECT 
        CASE 
            WHEN [Habitación] LIKE 'BOX 1%' OR [Habitación] LIKE 'Box 1%' THEN 'BOX 1'
            WHEN [Habitación] LIKE 'BOX 2%' OR [Habitación] LIKE 'Box 2%' THEN 'BOX 2'
            WHEN [Habitación] LIKE 'BOX 3%' OR [Habitación] LIKE 'Box 3%' THEN 'BOX 3'
            WHEN [Habitación] LIKE 'BOX 4%' OR [Habitación] LIKE 'Box 4%' THEN 'BOX 4'
            WHEN [Habitación] LIKE 'BOX 5%' OR [Habitación] LIKE 'Box 5%' THEN 'BOX 5'
            WHEN [Habitación] LIKE 'BOX 6%' OR [Habitación] LIKE 'Box 6%' THEN 'BOX 6'
            WHEN [Habitación] LIKE 'BOX 7%' OR [Habitación] LIKE 'Box 7%' THEN 'BOX 7'
            WHEN [Habitación] LIKE 'BOX 8%' OR [Habitación] LIKE 'Box 8%' THEN 'BOX 8'
            WHEN [Habitación] LIKE '222%' THEN '222'
            WHEN [Habitación] LIKE '223%' THEN '223'
            WHEN [Habitación] LIKE '224%' THEN '224'
            WHEN [Habitación] LIKE '225%' THEN '225'
            WHEN [Habitación] LIKE '226%' THEN '226'
            WHEN [Habitación] LIKE '227%' THEN '227'
            WHEN [Habitación] LIKE '228%' THEN '228'
            WHEN [Habitación] LIKE '229%' THEN '229'
            ELSE NULL
        END as hab_normalizada,
        [Número admisión] as numero_admision,
        CONVERT(VARCHAR(10), [Fecha ingreso], 103) as [F ING],
        [Paciente] as [APELLIDO Y NOMBRE],
        CONVERT(VARCHAR(10), [fechaNacimiento], 103) as [F NAC],
        [NIF] as [DNI],
        [Cliente] as [O SOCIAL],
        COALESCE([Núm. Autorización], [Coseguro], '') as [Nº O SOCIAL],
        CONCAT([Edad], ' a') as [EDAD],
        COALESCE([telefono1], [telefono2], '') as [Nº TELEFONO],
        CASE 
            WHEN [Servicio] = 'UCI' THEN 'UTI'
            WHEN [Servicio] = 'TERAPIA INTERMEDIA' THEN 'INTERMEDIA'
            ELSE 'INT'
        END as [TIPO INTER],
        ROW_NUMBER() OVER(PARTITION BY 
            CASE 
                WHEN [Habitación] LIKE 'BOX 1%' OR [Habitación] LIKE 'Box 1%' THEN 'BOX 1'
                WHEN [Habitación] LIKE 'BOX 2%' OR [Habitación] LIKE 'Box 2%' THEN 'BOX 2'
                WHEN [Habitación] LIKE 'BOX 3%' OR [Habitación] LIKE 'Box 3%' THEN 'BOX 3'
                WHEN [Habitación] LIKE 'BOX 4%' OR [Habitación] LIKE 'Box 4%' THEN 'BOX 4'
                WHEN [Habitación] LIKE 'BOX 5%' OR [Habitación] LIKE 'Box 5%' THEN 'BOX 5'
                WHEN [Habitación] LIKE 'BOX 6%' OR [Habitación] LIKE 'Box 6%' THEN 'BOX 6'
                WHEN [Habitación] LIKE 'BOX 7%' OR [Habitación] LIKE 'Box 7%' THEN 'BOX 7'
                WHEN [Habitación] LIKE 'BOX 8%' OR [Habitación] LIKE 'Box 8%' THEN 'BOX 8'
                WHEN [Habitación] LIKE '222%' THEN '222'
                WHEN [Habitación] LIKE '223%' THEN '223'
                WHEN [Habitación] LIKE '224%' THEN '224'
                WHEN [Habitación] LIKE '225%' THEN '225'
                WHEN [Habitación] LIKE '226%' THEN '226'
                WHEN [Habitación] LIKE '227%' THEN '227'
                WHEN [Habitación] LIKE '228%' THEN '228'
                WHEN [Habitación] LIKE '229%' THEN '229'
            END 
            ORDER BY [Fecha ingreso] DESC) as rn
    FROM TABLEAU_Admisiones
    WHERE [Fecha alta] IS NULL
      AND [Fecha ingreso] >= DATEADD(DAY, -60, GETDATE())
)
SELECT 
    c.hab_target as hab,
    c.orden,
    COALESCE(a.[F ING], '') as fecha_ingreso,
    COALESCE(a.[APELLIDO Y NOMBRE], '') as paciente,
    COALESCE(a.[F NAC], '') as fecha_nacimiento,
    COALESCE(a.[DNI], '') as dni,
    COALESCE(a.[O SOCIAL], '') as obra_social,
    COALESCE(a.[Nº O SOCIAL], '') as numero_afiliado,
    COALESCE(a.[EDAD], '') as edad,
    COALESCE(a.[Nº TELEFONO], '') as telefono,
    COALESCE(a.[TIPO INTER], '') as tipo_internacion,
    COALESCE(a.numero_admision, '') as numero_admision,
    CASE WHEN a.[APELLIDO Y NOMBRE] IS NOT NULL AND a.[APELLIDO Y NOMBRE] != '' THEN 'OCUPADA' ELSE 'LIBRE' END as estado
FROM CamasTarget c
LEFT JOIN AdmisionesActivas a ON c.hab_target = a.hab_normalizada AND a.rn = 1
ORDER BY c.orden;`;

const SQL_UCI_HISTORIAL = `-- HISTORIAL LONGITUDINAL DE TRASLADOS Y MOVIMIENTOS EN CAMAS DE UCI
SELECT 
    m.idAdmision,
    m.numero_admision,
    m.nhc,
    m.paciente,
    m.habitacion,
    m.cama,
    m.servicio,
    m.fecha_inicio,
    m.fecha_fin,
    DATEDIFF(HOUR, m.fecha_inicio, ISNULL(m.fecha_fin, GETDATE())) AS horas_en_cama
FROM calidad_admisiones_camas_historial m
WHERE m.servicio IN ('UCI', 'TERAPIA INTERMEDIA')
ORDER BY m.fecha_inicio DESC;`;

const SQL_UCI_PETICIONES = `-- PETICIONES Y ESTUDIOS DIAGNÓSTICOS EN PACIENTES DE UCI (VLISE)
SELECT 
    CAST(p.IdPeticionDePrueba AS VARCHAR(50)) AS IdPeticion,
    p.[Fecha Solicitud] AS FechaSolicitud,
    CAST(p.IdPaciente AS VARCHAR(50)) AS IdPaciente,
    p.Paciente,
    p.Solicitante,
    CAST(p.[Paciente Edad] AS INT) AS PacienteEdad,
    p.Origen,
    p.[Tipo Visita] AS TipoVisita,
    p.[Tipo Articulo] AS TipoArticulo,
    p.Descripcion1 AS Estudio,
    p.HOSP_Habitacion AS Habitacion,
    p.Cama,
    p.Prioridad,
    p.Articulo_Sección AS Seccion,
    p.Modalidad,
    YEAR(p.[Fecha Solicitud]) AS AnioSolicitud,
    MONTH(p.[Fecha Solicitud]) AS MesSolicitud
FROM VLISE_PeticionesPruebas p
WHERE p.[Fecha Solicitud] >= '2025-06-01'
  AND p.Origen = 'Hospitalización'
  AND (
      p.HOSP_Habitacion LIKE '%Box%' 
      OR p.HOSP_Habitacion LIKE '%BOX%'
      OR p.HOSP_Habitacion LIKE '%222%'
      OR p.HOSP_Habitacion LIKE '%223%'
      OR p.HOSP_Habitacion LIKE '%224%'
      OR p.HOSP_Habitacion LIKE '%226%'
      OR p.HOSP_Habitacion LIKE '%227%'
      OR p.HOSP_Habitacion LIKE '%228%'
      OR p.HOSP_Habitacion LIKE '%229%'
  )
ORDER BY p.[Fecha Solicitud] DESC;`;

const SQL_UCI_KINESIOLOGIA = `-- KINESIOLOGÍA Y SOPORTE RESPIRATORIO UCI (PROTOCOLOS 580 A 585)
SELECT 
    r.id as id_registro_salus,
    COALESCE(v.NHC, CAST(r.idPaciente AS NVARCHAR(50))) as nhc,
    COALESCE(v.Paciente, 'PACIENTE NO NOMBRADO') as paciente,
    r.idPaciente as id_paciente_salus,
    r.idVisita as id_visita,
    v.idHospitalizacion as id_hospitalizacion,
    r.fecha as fecha_hora,
    pr.id as protocolo_id,
    pr.Descripcion as protocolo_nombre,
    g.Descripcion as grupo_nombre,
    pq.Descripcion as parametro,
    r.valorN as valor_numerico,
    r.valorM as valor_texto,
    rt.Descripcion as valor_combo,
    pq.Unidades as unidades,
    v.Responsable as profesional
FROM [PR InstRespVisitaPaciente] r
JOIN [PR PreguntasProtocolo] pp ON r.idPreguntaPr = pp.id
JOIN [PR Preguntas] pq ON pp.idPregunta = pq.id
JOIN [PR GruposProtocolo] g ON pp.idGrupoProtocolo = g.id
JOIN [PR Protocolos] pr ON g.idProtocolo = pr.id
LEFT JOIN [PR RespuestasProtocolo] rp ON r.idRT = rp.id
LEFT JOIN [PR Respuestas] rt ON rp.idRespuesta = rt.id
LEFT JOIN [VLISE_Visitas] v ON r.idVisita = v.idVisita
WHERE pr.id IN (580, 581, 582, 583, 584, 585)
  AND r.fecha >= '2026-01-01'
ORDER BY r.fecha DESC;`;

const SQL_UCI_DIAGNOSTICOS = `-- DIAGNÓSTICOS DE EGRESO Y MOTIVO DE CONSULTA (CIE-10)
SELECT 
    NHC,
    DNI,
    paciente,
    IdVisita,
    [Fecha visita] AS fecha_visita,
    Motivo,
    diagnostico,
    Formulario,
    Centro
FROM [TABLEAU_Diagnosticos y motivo consulta]
WHERE [Fecha visita] >= '2026-01-01'
  AND diagnostico IS NOT NULL 
  AND RTRIM(diagnostico) <> ''
ORDER BY [Fecha visita] DESC;`;

const SQL_GUARDIA_MASTER = `-- GOBERNANZA SALUS: MASTER QUERY GUARDIA CLÍNICA (9 INDICADORES)
DECLARE @FechaDesde DATETIME = '2026-09-01 00:00:00';
DECLARE @FechaHasta DATETIME = '2026-09-30 23:59:59';

WITH 
ConsultasGuardia AS (
    SELECT 
        v.idVisita, v.NHC, v.Paciente, v.[Tipo Visita] AS TipoVisita,
        v.[Fecha Visita] AS FechaVisita,
        v.[Fecha Entrada Real] AS FechaHoraLlegada,
        v.[Fecha Hora Entrada] AS FechaHoraAtencionInicio,
        v.[Fecha Salida Real] AS FechaHoraEgreso,
        CASE 
            WHEN v.[Fecha Entrada Real] IS NOT NULL AND v.[Fecha Hora Entrada] IS NOT NULL 
                 AND v.[Fecha Hora Entrada] >= v.[Fecha Entrada Real]
            THEN DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Hora Entrada])
            ELSE NULL 
        END AS MinutosEsperaAtencion,
        CASE 
            WHEN v.[Fecha Entrada Real] IS NOT NULL AND v.[Fecha Salida Real] IS NOT NULL
                 AND v.[Fecha Salida Real] >= v.[Fecha Entrada Real]
            THEN DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Salida Real])
            ELSE NULL 
        END AS MinutosEstanciaGuardia,
        CASE 
            WHEN v.[Tipo Visita] LIKE '%(N1)%' THEN 'N1 - Emergencia / Crítico'
            WHEN v.[Tipo Visita] LIKE '%(N2)%' THEN 'N2 - Urgencia'
            WHEN v.[Tipo Visita] LIKE '%(N3)%' THEN 'N3 - Urgencia Menor'
            ELSE 'No Categorizado'
        END AS NivelTriage
    FROM VLISE_Visitas v
    WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
      AND v.[Fecha Visita] >= @FechaDesde AND v.[Fecha Visita] <= @FechaHasta
      AND v.Asistencia = 'Presente'
),
ConversionesQx AS (
    SELECT DISTINCT cg.idVisita
    FROM ConsultasGuardia cg
    INNER JOIN TABLEAU_Admisiones adm 
        ON adm.NHC = cg.NHC
       AND adm.[Fecha ingreso] >= cg.FechaHoraLlegada
       AND adm.[Fecha ingreso] <= DATEADD(HOUR, 48, cg.FechaHoraLlegada)
       AND (adm.Especialidad LIKE '%CIRUGIA%' OR adm.Servicio LIKE '%QUIROF%' OR adm.Procedencia = 'Derivado desde Urgencias')
       -- EXCLUSIÓN: Guardia Gineco-Obstétrica es separada
       AND ISNULL(adm.Especialidad, '') NOT LIKE '%GINECO%'
       AND ISNULL(adm.Especialidad, '') NOT LIKE '%OBSTETR%'
       AND ISNULL(adm.Servicio, '') NOT LIKE '%MATERN%'
),
Reconsultas72h AS (
    SELECT DISTINCT v1.idVisita
    FROM ConsultasGuardia v1
    INNER JOIN VLISE_Visitas v2
        ON v1.NHC = v2.NHC AND v2.idVisita <> v1.idVisita
       AND v2.[Grupo Agenda] = 'GUARDIA CLINICA'
       AND v2.[Fecha Entrada Real] > v1.FechaHoraLlegada
       AND v2.[Fecha Entrada Real] <= DATEADD(HOUR, 72, v1.FechaHoraLlegada)
       AND v2.Asistencia = 'Presente'
),
AdmisionesClinicas AS (
    SELECT 
        adm.idAdmision, adm.NHC, adm.[Fecha ingreso] AS FechaIngreso, adm.[Fecha alta] AS FechaAlta,
        ISNULL(adm.Dias, DATEDIFF(DAY, adm.[Fecha ingreso], ISNULL(adm.[Fecha alta], GETDATE()))) AS DiasEstada,
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM TABLEAU_Admisiones re
                WHERE re.NHC = adm.NHC AND re.idAdmision <> adm.idAdmision
                  AND re.[Fecha ingreso] > adm.[Fecha alta]
                  AND re.[Fecha ingreso] <= DATEADD(HOUR, 72, adm.[Fecha alta])
            ) OR adm.Procedencia = 'Reingreso' THEN 1 ELSE 0 
        END AS EsReinternacion72h
    FROM TABLEAU_Admisiones adm
    WHERE adm.Procedencia = 'Derivado desde Urgencias'
      AND adm.Especialidad = 'CLINICO '
      AND adm.[Fecha ingreso] >= @FechaDesde AND adm.[Fecha ingreso] <= @FechaHasta
)
SELECT 
    (SELECT COUNT(*) FROM ConsultasGuardia) AS total_consultas,
    (SELECT COUNT(*) FROM ConversionesQx) AS cantidad_pases_cirugia,
    CAST((SELECT COUNT(*) FROM ConversionesQx) * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS conversion_cirugia_pct,
    CAST((SELECT AVG(MinutosEsperaAtencion * 1.0) FROM ConsultasGuardia WHERE MinutosEsperaAtencion BETWEEN 0 AND 300) AS DECIMAL(6,2)) AS espera_medico_min_promedio,
    CAST((SELECT AVG(MinutosEstanciaGuardia * 1.0) FROM ConsultasGuardia WHERE MinutosEstanciaGuardia BETWEEN 0 AND 600) AS DECIMAL(6,2)) AS permanencia_guardia_min_promedio,
    (SELECT COUNT(*) FROM ConsultasGuardia WHERE NivelTriage <> 'No Categorizado') AS consultas_con_triage,
    CAST((SELECT COUNT(*) FROM ConsultasGuardia WHERE NivelTriage <> 'No Categorizado') * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS cobertura_triage_pct,
    (SELECT COUNT(*) FROM Reconsultas72h) AS cantidad_reconsultas_72h,
    CAST((SELECT COUNT(*) FROM Reconsultas72h) * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS reconsulta_72h_pct,
    (SELECT COUNT(*) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS total_altas_clinicas,
    (SELECT SUM(EsReinternacion72h) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS reinternaciones_72h,
    CAST((SELECT SUM(EsReinternacion72h) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) * 100.0 / 
         NULLIF((SELECT COUNT(*) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL), 0) AS DECIMAL(5,2)) AS reinternacion_72h_pct,
    CAST((SELECT AVG(DiasEstada * 1.0) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS DECIMAL(5,2)) AS promedio_dias_estada;`;

const SQL_GUARDIA_NOMINAL = `-- CONSULTAS ATENDIDAS Y AUDITORÍA DE TIEMPOS DE GUARDIA (VLISE)
SELECT 
    v.idVisita,
    v.NHC,
    v.Paciente,
    v.Profesional,
    v.[Tipo Visita] AS TipoVisita,
    v.[Fecha Visita] AS FechaVisita,
    v.[Fecha Entrada Real] AS FechaHoraLlegada,
    v.[Fecha Hora Entrada] AS FechaHoraAtencionInicio,
    v.[Fecha Salida Real] AS FechaHoraEgreso,
    DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Hora Entrada]) AS MinutosEspera,
    DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Salida Real]) AS MinutosPermanencia,
    v.Asistencia
FROM VLISE_Visitas v
WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
  AND v.Asistencia = 'Presente'
  AND v.[Fecha Visita] >= '2026-09-01'
ORDER BY v.[Fecha Entrada Real] DESC;`;

const SQL_GUARDIA_CONVERSION_QX = `-- TRAZABILIDAD DE PASES A QUIRÓFANO DESDE GUARDIA (< 48 HS)
SELECT 
    v.idVisita,
    v.NHC,
    v.Paciente,
    v.[Fecha Entrada Real] AS FechaGuardia,
    adm.idAdmision,
    adm.[Número admisión],
    adm.[Fecha ingreso] AS FechaQx,
    DATEDIFF(HOUR, v.[Fecha Entrada Real], adm.[Fecha ingreso]) AS HorasHastaCirugia,
    adm.Especialidad,
    adm.Doctor AS Cirujano,
    adm.Servicio
FROM VLISE_Visitas v
INNER JOIN TABLEAU_Admisiones adm 
    ON adm.NHC = v.NHC
   AND adm.[Fecha ingreso] >= v.[Fecha Entrada Real]
   AND adm.[Fecha ingreso] <= DATEADD(HOUR, 48, v.[Fecha Entrada Real])
WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
  AND (adm.Especialidad LIKE '%CIRUGIA%' OR adm.Servicio LIKE '%QUIROF%' OR adm.Procedencia = 'Derivado desde Urgencias')
  AND ISNULL(adm.Especialidad, '') NOT LIKE '%GINECO%'
  AND ISNULL(adm.Especialidad, '') NOT LIKE '%OBSTETR%'
ORDER BY v.[Fecha Entrada Real] DESC;`;

const SQL_GUARDIA_IMAGENES = `-- DEMANDA DIAGNÓSTICA DE IMÁGENES (RADIOLOGÍA Y TAC EN GUARDIA)
SELECT 
    r.IdPeticionDePrueba,
    r.[Fecha Solicitud],
    r.NHC,
    r.Paciente,
    r.Descripcion1 AS Estudio,
    r.Modalidad,
    r.Prioridad,
    r.Articulo_Sección AS Seccion
FROM VLISE_PeticionesPruebasRadiologia r
WHERE r.[Fecha Solicitud] >= '2026-09-01'
  AND (r.Origen LIKE '%Urgencia%' OR r.Origen LIKE '%Guardia%')
ORDER BY r.[Fecha Solicitud] DESC;`;

const SQL_QX_CIRUGIAS = `-- PROGRAMACIÓN QUIRÚRGICA CENTRAL (ADM-QUI)
SELECT TOP 500
    CAST(A.Data AS DATE) AS Data_Fecha,
    A.idPaciente,
    A.nombre AS Paciente,
    A.telefono1,
    A.Descrip AS Procedimiento,
    A.mutua AS ObraSocial,
    A.Ausente,
    A.GrupoAgendas,
    Q.Doctor AS Cirujano,
    V.Instrucciones AS Instrucciones_RTF
FROM _PR_AGENDA_QRY_SENZILL A
LEFT JOIN _PR_AGENDA_QRY_QUIROFAN Q 
    ON A.idPaciente = Q.idPaciente 
    AND CAST(A.Data AS DATE) = CAST(Q.Data AS DATE) 
OUTER APPLY (
    SELECT TOP 1 Instrucciones
    FROM VLIS_PeticionesPruebas_SERVICIO V_Sub
    WHERE V_Sub.IdPaciente = A.idPaciente
      AND V_Sub.Fecha = CAST(A.Data AS DATE)
) V
WHERE CAST(A.Data AS DATE) >= CAST(GETDATE() AS DATE)
ORDER BY A.Data ASC;`;

const SQL_QX_FOJA = `-- FOJA QUIRÚRGICA Y PROCEDIMIENTOS REALIZADOS
SELECT 
    [Núm. Admisión] AS numero_admision,
    [idadmision],
    [Procedimiento quirúrgico],
    [Procedimiento quirúrgico 2],
    [Procedimiento quirúrgico 3],
    [Procedimiento quirúrgico 4],
    [Fecha visita] AS fecha_cirugia
FROM [SALUS].[dbo].[TABLEAU_FojaQuirurgica]
WHERE [Fecha visita] >= CONVERT(VARCHAR(8), DATEADD(DAY, -30, GETDATE()), 112)
ORDER BY [Fecha visita] DESC;`;

const SQL_QX_PRESUPUESTOS = `-- PRESUPUESTOS QUIRÚRGICOS Y DE PRÁCTICAS MÉDICAS
SELECT 
    idPresupuesto,
    idPaciente,
    Paciente,
    NHC,
    fecha,
    Observaciones,
    idArticulo,
    descripcion,
    cantidad,
    importeUnitario,
    [Importe Total Linea],
    [Importe Cobrado],
    Aceptado,
    FechaCaducidad,
    Presup_descripcion
FROM VLISE_Presupuestos
WHERE fecha >= '2026-01-01'
ORDER BY fecha DESC;`;

const SQL_FACT_DEUDAS = `-- EXTRACCIÓN DE DEUDAS ACTIVAS DE PACIENTES (TARIFA 042% PARTICULARES)
SELECT TOP 1000
    T.[Fecha albaran],
    T.Paciente,
    T.Paciente_NHC,
    T.Paciente_NIF,
    T.Tarifa,
    T.Concepto,
    T.[Numero folio],
    T.[Cobrado linea],
    T.[Deuda linea],
    T.[Núm.Admisión],
    T.HOSP_Habitacion,
    V.telefono1,
    V.email
FROM [TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios] AS T
LEFT JOIN VIS_Pacientes AS V 
    ON T.Paciente_NHC = V.NHC
WHERE T.Tarifa LIKE '042%'
  AND T.[Deuda linea] > 0
  AND T.[Numero folio] IS NOT NULL
  AND T.Paciente IS NOT NULL
  AND T.[Fecha albaran] >= '2025-05-01'
ORDER BY T.[Fecha albaran] DESC;`;

const SQL_FACT_COBROS = `-- COBROS Y RECAUDACIÓN DE CAJAS
SELECT 
    t.[IdCobro],
    t.[nombre],
    t.[nombreFiscal],
    t.[NIF],
    t.[descripcion],
    t.[importe2] AS importe,
    t.[comentario],
    CONVERT(VARCHAR(10), t.[fecha], 103) AS [fecha],
    t.[FechaCobro],
    t.[Paciente],
    t.[Paciente_NHC],
    t.[FormaPago],
    t.[Caja],
    t.[Clasificacion],
    t.[UsuarioCobro]
FROM [SALUS].[dbo].[PR_COBROS_QRY] AS t
WHERE t.[FechaCobro] >= '2026-01-01'
ORDER BY t.[FechaCobro] DESC;`;

const SQL_FACT_NOTAS_CREDITO = `-- NOTAS DE CRÉDITO Y RECTIFICATIVAS
WITH FacturasUnicas AS (
    SELECT 
        t.[id],
        t.[fecha] AS FechaOriginal,
        CONVERT(VARCHAR(10), t.[fecha], 103) AS [fecha],
        t.[Paciente_Nombre],
        t.[Paciente_NHC],
        t.[descripcion],
        t.[idPaciente],
        t.[NombreSerie],
        CAST(ABS(t.[ImporteTotal]) AS FLOAT) AS [ImporteTotal],
        ROW_NUMBER() OVER(PARTITION BY t.[id] ORDER BY t.[fecha] DESC) AS NumeroDeFila
    FROM [SALUS].[dbo].[PR_FACTURAS_QRY] AS t
    WHERE t.[fecha] >= '2026-01-01'
      AND t.[NombreSerie] LIKE '%Nota Cr%dito%'
      AND t.[Paciente_Nombre] IS NOT NULL
)
SELECT [id], [fecha], [Paciente_Nombre], [Paciente_NHC], [descripcion], [NombreSerie], [ImporteTotal]
FROM FacturasUnicas 
WHERE NumeroDeFila = 1
ORDER BY FechaOriginal DESC;`;

const SQL_FACT_ALTAS = `-- ALTAS ADMINISTRATIVAS Y FACTURACIÓN INTERNADA (PDV 21 Y 31)
SELECT 
    TA.[Número admisión],
    TA.[Fecha ingreso],
    CAST(TA.[Fecha alta] AS DATE) AS [Fecha alta],
    TA.[Paciente],
    TA.[Cliente],
    TA.[Especialidad],
    TA.[Proceso],
    TA.[Doctor],
    TA.[Motivo de alta],
    TA.[Control ADM finalizado]
FROM [SALUS].[dbo].[TABLEAU_Admisiones] TA
WHERE (TA.[Fecha alta] >= DATEADD(DAY, -60, CAST(GETDATE() AS DATE)) OR TA.[Fecha alta] IS NULL)
ORDER BY TA.[Fecha ingreso] DESC;`;
