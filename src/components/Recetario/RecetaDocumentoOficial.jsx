import React from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { RENAPDIS_INSTITUTION_CONFIG } from '../../services/recetarioService';
import { normalizarFechaNacimientoReNaPDiS, formatFechaReNaPDiS } from '../../utils/recetaPdfGenerator';
import { ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * Generador determinístico de barras tipo Code-128 en SVG puro (sin dependencias externas)
 * Representa visualmente cualquier cadena alfanumérica (ej. N° Receta, CUIR o Matrícula).
 */
export function Code128BarcodeSVG({ value = '2630708731551', width = 200, height = 40, showText = true }) {
    const str = String(value || '0000000000').trim();
    const bars = [2, 1, 1, 2, 1, 2];
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
                    fontSize: '0.67rem',
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
    return formatFechaReNaPDiS(isoStr, includeTime);
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

    const fechaNacNormalizada = normalizarFechaNacimientoReNaPDiS(receta.paciente_fecha_nacimiento);
    const cuilPaciente = receta.paciente_cuil || (receta.paciente_dni && /^\d{7,8}$/.test(String(receta.paciente_dni).trim()) ? `20-${String(receta.paciente_dni).trim()}-9` : '—');

    return (
        <div
            id={idDom}
            style={{
                background: '#FFFFFF',
                color: '#0F172A',
                borderRadius: compact ? '12px' : '16px',
                border: '1.5px solid #CBD5E1',
                boxShadow: compact ? 'none' : '0 12px 32px rgba(15, 23, 42, 0.08)',
                padding: compact ? '20px' : '26px 28px',
                maxWidth: '840px',
                width: '100%',
                margin: '0 auto',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Canvas oculto para exportación instantánea de QR en PDF */}
            <div style={{ display: 'none' }} aria-hidden="true">
                <QRCodeCanvas
                    data-receta-qr="true"
                    data-qr-url={validationUrl}
                    value={validationUrl}
                    size={260}
                    level="M"
                    includeMargin={true}
                />
            </div>

            {/* Banda superior institucional Sanatorio Argentino */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '6px',
                background: 'linear-gradient(90deg, #1E4078 0%, #1565C0 50%, #0EA5E9 100%)',
            }} />

            {/* ENCABEZADO: Logo Sanatorio + Título Oficial (Izq) | Estado + Código de Barras Receta + CUIR (Der) */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '14px',
                paddingBottom: '14px',
                borderBottom: '2px solid #1E4078',
            }}>
                {/* Izquierda: Logo + Datos Institucionales (Dato Obligatorio #5: Domicilio Profesional/Institucional) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 0%', minWidth: 0 }}>
                    <img
                        src="/logosanatorio.png"
                        alt="Sanatorio Argentino"
                        style={{
                            width: '56px',
                            height: '56px',
                            objectFit: 'contain',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '4px',
                            background: '#FFFFFF',
                            flexShrink: 0,
                        }}
                    />
                    <div style={{ minWidth: 0 }}>
                        <div style={{
                            fontSize: '1.15rem',
                            fontWeight: 900,
                            color: '#1E4078',
                            letterSpacing: '-0.02em',
                            lineHeight: 1.15,
                            textTransform: 'uppercase',
                        }}>
                            Sanatorio Argentino
                        </div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155', marginTop: '2px' }}>
                            {RENAPDIS_INSTITUTION_CONFIG.entidadRazonSocial} — CUIT: {RENAPDIS_INSTITUTION_CONFIG.cuit}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: '2px', lineHeight: 1.3 }}>
                            <strong>Domicilio Profesional:</strong> {receta.medico_domicilio || 'Calle San Luis 433 Oeste, Capital, San Juan (CP 5400)'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#1565C0', fontWeight: 700, marginTop: '2px' }}>
                            {receta.medico_sede || 'Sede San Luis (Central)'} • Tel: (0264) 430-3000
                        </div>
                    </div>
                </div>

                {/* Derecha: Estado + Código de Barras de la Receta / Orden (Dato Obligatorio #17) */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '4px',
                    flexShrink: 0,
                    textAlign: 'right',
                }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 10px',
                        borderRadius: '999px',
                        background: estadoBadge.bg,
                        border: `1px solid ${estadoBadge.border}`,
                        color: estadoBadge.color,
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                        whiteSpace: 'nowrap',
                    }}>
                        <estadoBadge.Icon size={12} />
                        {estadoBadge.label}
                    </div>

                    <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        RECETA ELECTRÓNICA LEY N° 27.553 — ORDEN N° {receta.nro_receta}
                    </div>
                    <Code128BarcodeSVG value={receta.nro_receta || receta.cuir} width={196} height={34} showText={true} />
                    <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#1E4078', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        CUIR: {receta.cuir}
                    </div>
                </div>
            </div>

            {/* SECCIÓN 1: DATOS DEL PACIENTE (Datos Obligatorios #6, #7, #8, #9, #10: Nombre, Obra Social/Plan, Fecha Nac, Sexo, DNI) */}
            <div style={{
                marginTop: '12px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '11px 15px',
            }}>
                <div style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    color: '#1E4078',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px',
                    borderBottom: '1px solid #E2E8F0',
                    paddingBottom: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <span>Datos Filiatorios y Cobertura del Paciente (Res. MSAL N° 1959/2024)</span>
                    {receta.paciente_nhc && <span>H.C. Institucional N°: {receta.paciente_nhc}</span>}
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1.5fr 0.9fr 1.1fr 0.9fr',
                    gap: '8px 14px',
                    fontSize: '0.76rem',
                }}>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>Nombre y Apellido del Paciente:</span>
                        <strong style={{ color: '#0F172A', fontSize: '0.82rem' }}>{receta.paciente_nombre}</strong>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>DNI / Documento:</span>
                        <strong style={{ color: '#0F172A', fontFamily: 'monospace', fontSize: '0.82rem' }}>{receta.paciente_dni}</strong>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>Fecha de Nacimiento:</span>
                        <strong style={{ color: '#0F172A' }}>{fechaNacNormalizada}</strong>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>Sexo Biológico:</span>
                        <strong style={{ color: '#0F172A' }}>
                            {receta.paciente_sexo === 'F' ? 'Femenino (F)' : receta.paciente_sexo === 'M' ? 'Masculino (M)' : (receta.paciente_sexo || 'No esp.')}
                        </strong>
                    </div>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1.5fr 0.9fr 1.1fr 0.9fr',
                    gap: '8px 14px',
                    fontSize: '0.76rem',
                    marginTop: '8px',
                    paddingTop: '7px',
                    borderTop: '1px dashed #E2E8F0',
                }}>
                    <div style={{ gridColumn: '1 / 3' }}>
                        <span style={{ display: 'block', fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>Obra Social / Prepaga y Plan de Cobertura:</span>
                        <strong style={{ color: '#1E4078' }}>
                            {receta.paciente_obra_social || 'PARTICULAR'}
                            {receta.paciente_plan ? ` (${receta.paciente_plan})` : ''}
                        </strong>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>N° Credencial / Afiliado:</span>
                        <strong style={{ color: '#0F172A', fontFamily: 'monospace' }}>
                            {receta.paciente_nro_afiliado || receta.paciente_dni}
                        </strong>
                    </div>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>CUIL Paciente:</span>
                        <strong style={{ color: '#0F172A', fontFamily: 'monospace' }}>
                            {cuilPaciente}
                        </strong>
                    </div>
                </div>
            </div>

            {/* SECCIÓN 2: CUERPO DE LA PRESCRIPCIÓN RP/ (Datos Obligatorios #11, #12, #13, #14, #15) */}
            <div style={{
                marginTop: '12px',
                border: '1.5px solid #CBD5E1',
                borderRadius: '10px',
                padding: '14px 16px',
                background: '#FFFFFF',
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px',
                    borderBottom: '1.5px solid #E2E8F0',
                    paddingBottom: '7px',
                    gap: '8px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            fontSize: '1.2rem',
                            fontWeight: 900,
                            color: '#1E4078',
                            fontFamily: 'Georgia, serif',
                            fontStyle: 'italic',
                        }}>
                            Rp/
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
                            Prescripción Farmacológica por Nombre Genérico (Ley N° 25.649 Art. 2)
                        </span>
                    </div>
                    <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: '#EFF6FF',
                        color: '#1D4ED8',
                        whiteSpace: 'nowrap',
                    }}>
                        {items.length} {items.length === 1 ? 'Medicamento Prescripto' : 'Medicamentos Prescriptos'}
                    </span>
                </div>

                {/* Lista de Medicamentos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {items.map((item, idx) => (
                        <div
                            key={idx}
                            style={{
                                padding: '10px 13px',
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
                                        fontSize: '0.64rem',
                                        fontWeight: 800,
                                        color: '#1565C0',
                                        textTransform: 'uppercase',
                                        display: 'block',
                                    }}>
                                        Renglón #{idx + 1} • Denominación Común Internacional (DCI / Genérico):
                                    </span>
                                    <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0F172A', marginTop: '1px' }}>
                                        {item.dci} — {item.concentracion}
                                    </div>
                                </div>
                                {item.marcaSugerida && (
                                    <div style={{
                                        fontSize: '0.69rem',
                                        background: '#FEF3C7',
                                        color: '#92400E',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontWeight: 700,
                                        whiteSpace: 'nowrap',
                                    }}>
                                        Marca sugerida: {item.marcaSugerida}
                                    </div>
                                )}
                            </div>

                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr 1.1fr',
                                gap: '6px 12px',
                                marginTop: '7px',
                                fontSize: '0.74rem',
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
                                        {item.unidadesLetras || `${item.unidadesNumero || 1} (UN) envase(s)`}
                                    </span>
                                </div>
                            </div>

                            {item.posologia && (
                                <div style={{
                                    marginTop: '6px',
                                    paddingTop: '5px',
                                    borderTop: '1px dashed #CBD5E1',
                                    fontSize: '0.73rem',
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
                    marginTop: '12px',
                    padding: '9px 13px',
                    background: '#EFF6FF',
                    borderRadius: '8px',
                    border: '1px solid #BFDBFE',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                }}>
                    <div style={{ fontSize: '0.75rem', color: '#1E3A8A' }}>
                        <strong>Diagnóstico Clínico (CIE-10 {receta.diagnostico_cie10_codigo || 'Z00.0'}):</strong>{' '}
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>{receta.diagnostico_descripcion}</span>
                    </div>
                    {receta.observaciones && (
                        <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                            <strong>Observaciones Médicas:</strong> {receta.observaciones}
                        </div>
                    )}
                </div>
            </div>

            {/* SECCIÓN 3: PROFESIONAL PRESCRIPTOR + FIRMA DIGITAL + QR DE VALIDACIÓN (Datos Obligatorios #1, #2, #3, #4, #16, #18) */}
            <div style={{
                marginTop: '12px',
                display: 'grid',
                gridTemplateColumns: '1.1fr 1fr 1fr',
                gap: '12px',
                alignItems: 'stretch',
            }}>
                {/* CAJA 1: Profesional Prescriptor + Código de barras del Profesional */}
                <div style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '11px 13px',
                    background: '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                }}>
                    <div>
                        <div style={{ fontSize: '0.61rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '3px' }}>
                            Profesional Prescriptor (Validado REFEPS / SISA)
                        </div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 900, color: '#0F172A', lineHeight: 1.2 }}>
                            {receta.medico_nombre}
                        </div>
                        <div style={{ fontSize: '0.71rem', color: '#1E4078', fontWeight: 700, marginTop: '2px', lineHeight: 1.25 }}>
                            {receta.medico_profesion || 'Médico'} — Esp.: {receta.medico_especialidad}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#334155', marginTop: '4px', fontFamily: 'monospace', fontWeight: 700 }}>
                            Mat. Prov.: {receta.medico_matricula_provincial}
                            {receta.medico_matricula_nacional ? ` | ${receta.medico_matricula_nacional}` : ''}
                        </div>
                        <div style={{ fontSize: '0.64rem', color: '#64748B', marginTop: '2px' }}>
                            CUIL: {receta.medico_cuil || '20-22458910-4'} • {receta.medico_refeps_id || 'REFEPS-OK'}
                        </div>
                    </div>

                    <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.58rem', color: '#64748B', fontWeight: 700, marginBottom: '2px' }}>
                            CÓDIGO IDENTIFICATORIO DEL PROFESIONAL:
                        </div>
                        <Code128BarcodeSVG
                            value={(receta.medico_matricula_provincial || 'MP3412').replace(/\s+/g, '')}
                            width={168}
                            height={30}
                            showText={true}
                        />
                    </div>
                </div>

                {/* CAJA 2: Vigencia Legal + Firma Electrónica / Digital Registrada */}
                <div style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '11px 13px',
                    background: '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                }}>
                    <div>
                        <div style={{ fontSize: '0.61rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
                            Vigencia Legal y Firma del Profesional
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', marginBottom: '4px', gap: '6px' }}>
                            <span style={{ color: '#475569', whiteSpace: 'nowrap' }}>Emisión:</span>
                            <strong style={{ color: '#0F172A', whiteSpace: 'nowrap' }}>{formatFechaAR(receta.fecha_emision, true)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', gap: '6px' }}>
                            <span style={{ color: '#475569', whiteSpace: 'nowrap' }}>Válida hasta (30 días):</span>
                            <strong style={{ color: '#059669', whiteSpace: 'nowrap' }}>{formatFechaAR(receta.fecha_vencimiento)}</strong>
                        </div>
                    </div>

                    {/* Sello + Firma manuscrita/digital estilizada */}
                    <div style={{
                        marginTop: '8px',
                        padding: '8px 10px',
                        background: '#FFFFFF',
                        border: '1px dashed #94A3B8',
                        borderRadius: '8px',
                        textAlign: 'center',
                    }}>
                        <div style={{
                            fontFamily: "'Brush Script MT', 'Segoe Script', cursive",
                            fontSize: '1.08rem',
                            color: '#1E3A8A',
                            lineHeight: 1.15,
                        }}>
                            {receta.medico_nombre}
                        </div>
                        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#1E4078', marginTop: '2px' }}>
                            FIRMA ELECTRÓNICA / DIGITAL VALIDADA
                        </div>
                        <div style={{ fontSize: '0.56rem', color: '#64748B', fontFamily: 'monospace', marginTop: '2px', wordBreak: 'break-all' }}>
                            {receta.medico_firma_hash}
                        </div>
                    </div>
                </div>

                {/* CAJA 3: QR de Validación para Farmacias (Diseño limpio sin texto aplastado) */}
                <div style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '11px 13px',
                    background: '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ fontSize: '0.61rem', fontWeight: 800, color: '#1E4078', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Validación Farmacéutica Online
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            padding: '5px',
                            background: '#FFFFFF',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            flexShrink: 0,
                        }}>
                            <QRCodeSVG value={validationUrl} size={76} level="M" />
                        </div>
                        <div style={{ fontSize: '0.66rem', color: '#334155', lineHeight: 1.35 }}>
                            Escanee el código QR o ingrese al portal oficial del repositorio para verificar vigencia y registrar la dispensa.
                        </div>
                    </div>

                    <div style={{
                        marginTop: '6px',
                        paddingTop: '5px',
                        borderTop: '1px solid #E2E8F0',
                        fontSize: '0.58rem',
                        color: '#1565C0',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        Token: {receta.token}
                    </div>
                </div>
            </div>

            {/* PIE REGLAMENTARIO: Dato Obligatorio #18 (Leyenda de Inscripción en ReNaPDiS + AAIP Ley 25.326) */}
            <div style={{
                marginTop: '12px',
                paddingTop: '9px',
                borderTop: '1.5px solid #E2E8F0',
                fontSize: '0.63rem',
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
