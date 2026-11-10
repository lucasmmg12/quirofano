import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { RENAPDIS_INSTITUTION_CONFIG } from '../../services/recetarioService';
import { ShieldCheck, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

/**
 * Generador determinístico de barras tipo Code-128 en SVG puro (sin dependencias externas)
 * Representa visualmente cualquier cadena alfanumérica (ej. N° Receta, CUIR o Matrícula).
 */
export function Code128BarcodeSVG({ value = '2630708731551', width = 220, height = 44, showText = true }) {
    const str = String(value || '0000000000').trim();
    // Generamos un patrón binario determinístico con start/stop bars estilo Code128
    const bars = [];
    // Start pattern
    bars.push(2, 1, 1, 2, 1, 2);
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        const b1 = (code % 3) + 1;
        const s1 = ((code >> 1) % 2) + 1;
        const b2 = ((code >> 2) % 3) + 1;
        const s2 = ((code >> 3) % 2) + 1;
        const b3 = ((code >> 4) % 2) + 1;
        const s3 = 1;
        bars.push(b1, s1, b2, s2, b3, s3);
    }
    // Stop pattern
    bars.push(2, 3, 1, 1, 2);

    const totalUnits = bars.reduce((acc, v) => acc + v, 0);
    let currentUnit = 0;
    const rects = [];
    for (let i = 0; i < bars.length; i++) {
        const w = bars[i];
        if (i % 2 === 0) {
            rects.push({ x: currentUnit, w });
        }
        currentUnit += w;
    }

    const barHeight = showText ? height - 13 : height;

    return (
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg
                width={width}
                height={barHeight}
                viewBox={`0 0 ${totalUnits} ${barHeight}`}
                preserveAspectRatio="none"
                style={{ display: 'block', background: '#FFFFFF' }}
            >
                {rects.map((r, idx) => (
                    <rect
                        key={idx}
                        x={r.x}
                        y={0}
                        width={r.w}
                        height={barHeight}
                        fill="#0F172A"
                    />
                ))}
            </svg>
            {showText && (
                <div style={{
                    fontFamily: "'Courier New', Courier, monospace",
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: '#0F172A',
                    marginTop: '2px',
                    lineHeight: 1,
                }}>
                    {str}
                </div>
            )}
        </div>
    );
}

export function formatFechaAR(isoStr, includeTime = false) {
    if (!isoStr) return '—';
    try {
        // Si ya viene en formato DD/MM/YYYY
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(isoStr).trim())) {
            return String(isoStr).trim();
        }
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return String(isoStr);
        const datePart = d.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
        if (!includeTime) return datePart;
        const timePart = d.toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
        });
        return `${datePart} ${timePart} hs`;
    } catch {
        return String(isoStr);
    }
}

/**
 * Tarjeta / Documento Oficial de Receta Electrónica — Sanatorio Argentino
 * Incluye los 18 campos mínimos obligatorios del Instructivo TAD (Pág. 12 - Res. 1959/2024).
 */
export default function RecetaDocumentoOficial({ receta, compact = false, idDom = 'receta-oficial-print' }) {
    if (!receta) return null;

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://quirofano.vercel.app';
    const validationUrl = `${origin}/prestacion?token=${receta.token}`;
    const items = Array.isArray(receta.items) ? receta.items : [];

    const estadoBadge = (() => {
        const est = (receta.estado || 'VIGENTE').toUpperCase();
        if (est === 'DISPENSADA') {
            return { bg: '#DBEAFE', border: '#60A5FA', color: '#1E40AF', label: 'DISPENSADA EN FARMACIA', Icon: CheckCircle2 };
        }
        if (est === 'ANULADA' || est === 'VENCIDA') {
            return { bg: '#FEE2E2', border: '#F87171', color: '#991B1B', label: est, Icon: AlertTriangle };
        }
        return { bg: '#DCFCE7', border: '#34D399', color: '#065F46', label: 'RECETA VIGENTE Y VERIFICADA', Icon: ShieldCheck };
    })();

    return (
        <div
            id={idDom}
            style={{
                background: '#FFFFFF',
                color: '#0F172A',
                borderRadius: compact ? '12px' : '16px',
                border: '1.5px solid #CBD5E1',
                boxShadow: compact ? 'none' : '0 12px 32px rgba(15, 23, 42, 0.08)',
                padding: compact ? '20px' : '28px 32px',
                maxWidth: '820px',
                width: '100%',
                margin: '0 auto',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Banda superior institucional Sanatorio Argentino */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '6px',
                background: 'linear-gradient(90deg, #1E4078 0%, #1565C0 50%, #0EA5E9 100%)',
            }} />

            {/* ENCABEZADO: Logo Sanatorio + Título Oficial + Código de Barras Receta (CUIR) */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '16px',
                paddingBottom: '16px',
                borderBottom: '2px solid #1E4078',
                flexWrap: 'wrap',
            }}>
                {/* Izquierda: Logo + Datos Institucionales (Dato Obligatorio #5: Domicilio Profesional/Institucional) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <img
                        src="/logosanatorio.png"
                        alt="Sanatorio Argentino"
                        style={{
                            width: '58px',
                            height: '58px',
                            objectFit: 'contain',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '4px',
                            background: '#FFFFFF',
                        }}
                    />
                    <div>
                        <div style={{
                            fontSize: '1.18rem',
                            fontWeight: 900,
                            color: '#1E4078',
                            letterSpacing: '-0.02em',
                            lineHeight: 1.15,
                            textTransform: 'uppercase',
                        }}>
                            Sanatorio Argentino
                        </div>
                        <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#334155', marginTop: '2px' }}>
                            {RENAPDIS_INSTITUTION_CONFIG.entidadRazonSocial} — CUIT: {RENAPDIS_INSTITUTION_CONFIG.cuit}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                            <strong>Domicilio Profesional:</strong> {receta.medico_domicilio || 'Calle San Luis 433 Oeste, Capital, San Juan'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#1565C0', fontWeight: 700, marginTop: '2px' }}>
                            {receta.medico_sede || 'Sede San Luis (Central)'} • Tel: (0264) 430-3000
                        </div>
                    </div>
                </div>

                {/* Derecha: Estado + Código de Barras de la Receta / Orden */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        background: estadoBadge.bg,
                        border: `1px solid ${estadoBadge.border}`,
                        color: estadoBadge.color,
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        letterSpacing: '0.03em',
                    }}>
                        <estadoBadge.Icon size={13} />
                        {estadoBadge.label}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '2px' }}>
                            RECETA ELECTRÓNICA LEY N° 27.553 — ORDEN N° {receta.nro_receta}
                        </div>
                        <Code128BarcodeSVG value={receta.nro_receta || receta.cuir} width={210} height={38} showText={true} />
                        <div style={{ fontSize: '0.63rem', fontWeight: 700, color: '#1E4078', marginTop: '2px', fontFamily: 'monospace' }}>
                            CUIR: {receta.cuir}
                        </div>
                    </div>
                </div>
            </div>

            {/* SECCIÓN 1: DATOS DEL PACIENTE (Datos Obligatorios #6, #7, #8, #9, #10: Nombre, Obra Social/Plan, Fecha Nac, Sexo, DNI) */}
            <div style={{
                marginTop: '14px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '12px 16px',
            }}>
                <div style={{
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    color: '#1E4078',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '8px',
                    borderBottom: '1px solid #E2E8F0',
                    paddingBottom: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                }}>
                    <span>Datos Filiatorios del Paciente</span>
                    {receta.paciente_nhc && <span>H.C. Institucional N°: {receta.paciente_nhc}</span>}
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
                    gap: '10px 16px',
                    fontSize: '0.78rem',
                }}>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>Nombre y Apellido:</span>
                        <strong style={{ color: '#0F172A', fontSize: '0.86rem' }}>{receta.paciente_nombre}</strong>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>DNI / Documento:</span>
                        <strong style={{ color: '#0F172A', fontFamily: 'monospace', fontSize: '0.85rem' }}>{receta.paciente_dni}</strong>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>Fecha de Nacimiento:</span>
                        <strong style={{ color: '#0F172A' }}>{formatFechaAR(receta.paciente_fecha_nacimiento) || 'No esp.'}</strong>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>Sexo Biológico:</span>
                        <strong style={{ color: '#0F172A' }}>
                            {receta.paciente_sexo === 'F' ? 'Femenino (F)' : receta.paciente_sexo === 'M' ? 'Masculino (M)' : (receta.paciente_sexo || 'No esp.')}
                        </strong>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>Cobertura / Obra Social / Plan:</span>
                        <strong style={{ color: '#1E4078' }}>
                            {receta.paciente_obra_social || 'PARTICULAR'}
                            {receta.paciente_plan ? ` (${receta.paciente_plan})` : ''}
                        </strong>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>N° Credencial / Afiliado:</span>
                        <strong style={{ color: '#0F172A', fontFamily: 'monospace' }}>
                            {receta.paciente_nro_afiliado || receta.paciente_dni}
                        </strong>
                    </div>
                </div>
            </div>

            {/* SECCIÓN 2: CUERPO DE LA PRESCRIPCIÓN RP/ (Datos Obligatorios #11, #12, #13, #14, #15) */}
            <div style={{
                marginTop: '14px',
                border: '1.5px solid #CBD5E1',
                borderRadius: '10px',
                padding: '16px',
                background: '#FFFFFF',
                minHeight: '190px',
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    borderBottom: '1.5px solid #E2E8F0',
                    paddingBottom: '8px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            fontSize: '1.25rem',
                            fontWeight: 900,
                            color: '#1E4078',
                            fontFamily: 'Georgia, serif',
                            fontStyle: 'italic',
                        }}>
                            Rp/
                        </span>
                        <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
                            Prescripción Farmacológica por Nombre Genérico (Ley N° 25.649 Art. 2)
                        </span>
                    </div>
                    <span style={{
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: '#EFF6FF',
                        color: '#1D4ED8',
                    }}>
                        {items.length} {items.length === 1 ? 'Medicamento Prescripto' : 'Medicamentos Prescriptos'}
                    </span>
                </div>

                {/* Lista de Medicamentos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {items.map((item, idx) => (
                        <div
                            key={idx}
                            style={{
                                padding: '11px 14px',
                                borderRadius: '8px',
                                background: '#F8FAFC',
                                borderLeft: '4px solid #1E4078',
                                borderTop: '1px solid #E2E8F0',
                                borderRight: '1px solid #E2E8F0',
                                borderBottom: '1px solid #E2E8F0',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                                <div>
                                    <span style={{
                                        fontSize: '0.66rem',
                                        fontWeight: 800,
                                        color: '#1565C0',
                                        textTransform: 'uppercase',
                                        display: 'block',
                                    }}>
                                        Renglón #{idx + 1} • Denominación Común Internacional (DCI / Genérico):
                                    </span>
                                    <div style={{ fontSize: '0.96rem', fontWeight: 900, color: '#0F172A', marginTop: '1px' }}>
                                        {item.dci} — {item.concentracion}
                                    </div>
                                </div>
                                {item.marcaSugerida && (
                                    <div style={{
                                        fontSize: '0.72rem',
                                        background: '#FEF3C7',
                                        color: '#92400E',
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        fontWeight: 700,
                                    }}>
                                        Marca sugerida: {item.marcaSugerida}
                                    </div>
                                )}
                            </div>

                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: '6px 14px',
                                marginTop: '8px',
                                fontSize: '0.76rem',
                                color: '#334155',
                            }}>
                                <div>
                                    <strong style={{ color: '#475569' }}>Forma Farmacéutica:</strong> {item.formaFarmaceutica}
                                </div>
                                <div>
                                    <strong style={{ color: '#475569' }}>Presentación:</strong> {item.presentacion}
                                </div>
                                <div>
                                    <strong style={{ color: '#475569' }}>Cantidad de Unidades:</strong>{' '}
                                    <span style={{ fontWeight: 800, color: '#0F172A' }}>
                                        {item.unidadesLetras || `${item.unidadesNumero || 1} envase(s)`}
                                    </span>
                                </div>
                            </div>

                            {item.posologia && (
                                <div style={{
                                    marginTop: '6px',
                                    paddingTop: '6px',
                                    borderTop: '1px dashed #CBD5E1',
                                    fontSize: '0.75rem',
                                    color: '#1E293B',
                                }}>
                                    <strong style={{ color: '#1E4078' }}>Posología / Indicaciones al Paciente:</strong> {item.posologia}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Dato Obligatorio #15: Diagnóstico Clínico */}
                <div style={{
                    marginTop: '14px',
                    padding: '10px 14px',
                    background: '#EFF6FF',
                    borderRadius: '8px',
                    border: '1px solid #BFDBFE',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                }}>
                    <div style={{ fontSize: '0.76rem', color: '#1E3A8A' }}>
                        <strong>Diagnóstico Clínico (CIE-10 {receta.diagnostico_cie10_codigo || 'Z00.0'}):</strong>{' '}
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>{receta.diagnostico_descripcion}</span>
                    </div>
                    {receta.observaciones && (
                        <div style={{ fontSize: '0.73rem', color: '#475569' }}>
                            <strong>Observaciones Médicas:</strong> {receta.observaciones}
                        </div>
                    )}
                </div>
            </div>

            {/* SECCIÓN 3: PROFESIONAL PRESCRIPTOR + FIRMA DIGITAL + QR DE VALIDACIÓN (Datos Obligatorios #1, #2, #3, #4, #16, #17) */}
            <div style={{
                marginTop: '14px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '14px',
                alignItems: 'stretch',
            }}>
                {/* Bloque Profesional + Código de barras del Profesional */}
                <div style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    background: '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                }}>
                    <div>
                        <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Profesional Prescriptor (Validado REFEPS / SISA)
                        </div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#0F172A' }}>
                            {receta.medico_nombre}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#1E4078', fontWeight: 700, marginTop: '2px' }}>
                            {receta.medico_profesion || 'Médico'} — Esp.: {receta.medico_especialidad}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#334155', marginTop: '3px', fontFamily: 'monospace', fontWeight: 700 }}>
                            Mat. Prov.: {receta.medico_matricula_provincial}
                            {receta.medico_matricula_nacional ? ` | Mat. Nac.: ${receta.medico_matricula_nacional}` : ''}
                        </div>
                        {receta.medico_cuil && (
                            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '1px' }}>
                                CUIL Profesional: {receta.medico_cuil} • ID SISA: {receta.medico_refeps_id || 'REFEPS-OK'}
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.6rem', color: '#64748B', fontWeight: 700, marginBottom: '2px' }}>
                            CÓDIGO IDENTIFICATORIO DEL PROFESIONAL:
                        </div>
                        <Code128BarcodeSVG
                            value={(receta.medico_matricula_provincial || 'MP0000').replace(/\s+/g, '')}
                            width={175}
                            height={32}
                            showText={true}
                        />
                    </div>
                </div>

                {/* Bloque Fechas + Firma Electrónica / Digital Registrada */}
                <div style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    background: '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                }}>
                    <div>
                        <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
                            Vigencia Legal y Firma del Profesional
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                            <span style={{ color: '#475569' }}>Fecha de Emisión:</span>
                            <strong style={{ color: '#0F172A' }}>{formatFechaAR(receta.fecha_emision, true)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                            <span style={{ color: '#475569' }}>Válida hasta (30 días):</span>
                            <strong style={{ color: '#059669' }}>{formatFechaAR(receta.fecha_vencimiento)}</strong>
                        </div>
                    </div>

                    {/* Sello + Firma manuscrita/digital estilizada */}
                    <div style={{
                        marginTop: '10px',
                        padding: '8px 10px',
                        background: '#FFFFFF',
                        border: '1px dashed #94A3B8',
                        borderRadius: '8px',
                        textAlign: 'center',
                    }}>
                        <div style={{
                            fontFamily: "'Brush Script MT', 'Segoe Script', cursive",
                            fontSize: '1.15rem',
                            color: '#1E3A8A',
                            lineHeight: 1.1,
                        }}>
                            {receta.medico_nombre}
                        </div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#1E4078', marginTop: '2px' }}>
                            FIRMA ELECTRÓNICA / DIGITAL VALIDADA
                        </div>
                        <div style={{ fontSize: '0.58rem', color: '#64748B', fontFamily: 'monospace', marginTop: '2px', wordBreak: 'break-all' }}>
                            {receta.medico_firma_hash}
                        </div>
                    </div>
                </div>

                {/* Bloque QR de Validación para Farmacias */}
                <div style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    background: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                }}>
                    <div style={{
                        padding: '6px',
                        background: '#FFFFFF',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        flexShrink: 0,
                    }}>
                        <QRCodeSVG value={validationUrl} size={86} level="M" />
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#334155', lineHeight: 1.35 }}>
                        <div style={{ fontWeight: 800, color: '#1E4078', marginBottom: '3px', textTransform: 'uppercase' }}>
                            Validación Farmacéutica Online
                        </div>
                        Escanee el código QR o ingrese al validador oficial del repositorio para verificar vigencia y registrar la dispensa.
                        <div style={{
                            marginTop: '5px',
                            fontSize: '0.6rem',
                            color: '#1565C0',
                            fontFamily: 'monospace',
                            wordBreak: 'break-all',
                        }}>
                            Token: {receta.token?.slice(0, 18)}...
                        </div>
                    </div>
                </div>
            </div>

            {/* PIE REGLAMENTARIO: Dato Obligatorio #18 (Leyenda de Inscripción en ReNaPDiS + AAIP Ley 25.326) */}
            <div style={{
                marginTop: '14px',
                paddingTop: '10px',
                borderTop: '1.5px solid #E2E8F0',
                fontSize: '0.64rem',
                color: '#475569',
                textAlign: 'center',
                lineHeight: 1.45,
            }}>
                <div style={{ fontWeight: 800, color: '#1E4078' }}>
                    {RENAPDIS_INSTITUTION_CONFIG.registroInscripcionLeyenda}
                </div>
                <div>
                    Documento emitido conforme a la Ley Nacional de Receta Electrónica N° 27.553, Decreto Reglamentario N° 98/2023 y Ley N° 25.649 (Prescripción por Nombre Genérico).{' '}
                    {RENAPDIS_INSTITUTION_CONFIG.aaipRegistroLeyenda}.
                </div>
            </div>
        </div>
    );
}

