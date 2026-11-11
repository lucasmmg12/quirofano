import React from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { RENAPDIS_INSTITUTION_CONFIG } from '../../services/recetarioService';
import { normalizarFechaNacimientoReNaPDiS, formatFechaReNaPDiS } from '../../utils/recetaPdfGenerator';

/**
 * Generador determinístico de barras tipo Code-128 en SVG puro (sin dependencias externas).
 * Representa visualmente el Número de Orden y el Número de Afiliado igual que MisRx / ReNaPDiS.
 */
export function Code128BarcodeSVG({
    value = '2630708731551',
    width = 270,
    height = 68,
    showText = true,
    fontSize = '1.05rem',
}) {
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

    const barHeight = showText ? height - 22 : height;

    return (
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg
                width={width}
                height={barHeight}
                viewBox={`0 0 ${totalUnits} ${barHeight}`}
                preserveAspectRatio="none"
                style={{ display: 'block', background: 'transparent', maxWidth: '100%' }}
            >
                {rects.map((r, idx) => (
                    <rect
                        key={idx}
                        x={r.x}
                        y={0}
                        width={r.w}
                        height={barHeight}
                        fill="#000000"
                    />
                ))}
            </svg>
            {showText && (
                <div
                    style={{
                        fontFamily: "'Courier New', Courier, monospace",
                        fontSize,
                        fontWeight: 500,
                        letterSpacing: '0.06em',
                        color: '#000000',
                        marginTop: '3px',
                        lineHeight: 1.1,
                    }}
                >
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
 * Extrae solo DD/MM/AAAA limpia para el campo Fecha Nacimiento del formato clásico
 */
export function extraerFechaNacimientoCorta(rawVal) {
    const norm = normalizarFechaNacimientoReNaPDiS(rawVal);
    const match = String(norm).match(/(\d{2}\/\d{2}\/\d{4})/);
    return match ? match[1] : norm;
}

/**
 * Formatea fecha y hora de emisión como "03/11/2026 20:22"
 */
export function formatEmitidaSinHs(isoStr) {
    const f = formatFechaReNaPDiS(isoStr, true);
    return f.replace(/\s*hs$/i, '');
}

/**
 * Documento Oficial de Receta Electrónica — Sanatorio Argentino
 * Diseño vertical clásico homologado ReNaPDiS / Ministerio de Salud de la Nación
 * con identidad institucional exclusiva de Sanatorio Argentino.
 */
export default function RecetaDocumentoOficial({ receta, compact = false, idDom = 'receta-oficial-print' }) {
    if (!receta) return null;

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://quirofano.vercel.app';
    const validationUrl = `${origin}/prestacion?token=${receta.token}`;
    const items = Array.isArray(receta.items) ? receta.items : [];

    const fechaOrden = formatFechaReNaPDiS(receta.fecha_emision, false);
    const fechaEmitidaHora = formatEmitidaSinHs(receta.fecha_emision);
    const nroOrden = String(receta.nro_receta || '2630708731551').trim();

    // Número de afiliado limpio para el segundo código de barras
    const rawAfiliado = String(receta.paciente_nro_afiliado || receta.paciente_dni || '38460116').trim();
    const nroAfiliadoBarcode = rawAfiliado.replace(/[^0-9A-Za-z]/g, '') || '38460116';

    // CUIL sin guiones o formateado limpio
    const cuilRaw =
        receta.paciente_cuil ||
        (receta.paciente_dni && /^\d{7,8}$/.test(String(receta.paciente_dni).trim())
            ? `20${String(receta.paciente_dni).trim()}9`
            : '');
    const cuilClean = String(cuilRaw).replace(/[^0-9]/g, '') || String(receta.paciente_cuil || '—');

    const fechaNacCorta = extraerFechaNacimientoCorta(receta.paciente_fecha_nacimiento);

    // Formatear REFEPS numérico y Matrícula con Ministerio de Salud de San Juan
    const refepsNum = String(receta.medico_refeps_id || '541038074668').replace(/^REFEPS[-\s]*/i, '');
    const matProvRaw = String(receta.medico_matricula_provincial || 'MP 3412').trim();
    const matProvDisplay = matProvRaw.toUpperCase().includes('MINISTERIO')
        ? matProvRaw
        : `${matProvRaw.replace(/^MP\s*/i, 'MPJ ')} (MINISTERIO DE SALUD DE SAN JUAN San Juan)`;

    const direccionProfesional =
        receta.medico_domicilio ||
        'Calle San Luis 433 Oeste - CAPITAL - SAN JUAN';

    const estadoUpper = (receta.estado || 'VIGENTE').toUpperCase();

    return (
        <div
            id={idDom}
            style={{
                background: '#FFFFFF',
                color: '#000000',
                borderRadius: compact ? '6px' : '8px',
                border: '1px solid #D1D5DB',
                boxShadow: compact ? 'none' : '0 8px 28px rgba(15, 23, 42, 0.08)',
                padding: compact ? '24px 26px' : '32px 38px 24px',
                maxWidth: '680px',
                width: '100%',
                margin: '0 auto',
                fontFamily: "Arial, Helvetica, 'Segoe UI', sans-serif",
                position: 'relative',
                overflow: 'hidden',
                lineHeight: 1.35,
            }}
        >
            {/* Fondo de ondas institucionales en azul con alta transparencia (detrás de todo el contenido) */}
            <svg
                aria-hidden="true"
                viewBox="0 0 680 960"
                preserveAspectRatio="none"
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 0,
                }}
            >
                <defs>
                    <linearGradient id="saWaveGradTop" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#005BB5" stopOpacity="0.065" />
                        <stop offset="50%" stopColor="#1E4078" stopOpacity="0.035" />
                        <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.015" />
                    </linearGradient>
                    <linearGradient id="saWaveGradMid" x1="100%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#0284C7" stopOpacity="0.045" />
                        <stop offset="50%" stopColor="#005BB5" stopOpacity="0.03" />
                        <stop offset="100%" stopColor="#1E4078" stopOpacity="0.01" />
                    </linearGradient>
                    <linearGradient id="saWaveGradBottom" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#1E4078" stopOpacity="0.06" />
                        <stop offset="60%" stopColor="#005BB5" stopOpacity="0.03" />
                        <stop offset="100%" stopColor="#0284C7" stopOpacity="0.01" />
                    </linearGradient>
                </defs>

                {/* Onda suave superior */}
                <path
                    d="M0,0 L680,0 L680,155 C540,210 420,95 260,145 C140,182 60,150 0,120 Z"
                    fill="url(#saWaveGradTop)"
                />
                <path
                    d="M-20,95 C150,165 330,45 510,115 C590,145 645,130 700,105"
                    fill="none"
                    stroke="#005BB5"
                    strokeOpacity="0.075"
                    strokeWidth="1.6"
                />
                <path
                    d="M-20,125 C170,190 350,70 530,140 C605,168 655,150 700,128"
                    fill="none"
                    stroke="#0284C7"
                    strokeOpacity="0.055"
                    strokeWidth="1.2"
                />

                {/* Ondas diagonales centrales (estilo marca de agua clínica sutil) */}
                <path
                    d="M0,360 C180,295 340,430 520,365 C600,336 645,350 680,375 L680,585 C510,645 340,515 160,575 C80,602 30,590 0,565 Z"
                    fill="url(#saWaveGradMid)"
                />
                <path
                    d="M-20,430 C160,355 340,505 520,425 C600,390 650,410 700,435"
                    fill="none"
                    stroke="#005BB5"
                    strokeOpacity="0.06"
                    strokeWidth="1.5"
                />
                <path
                    d="M-20,462 C180,385 360,535 540,455 C615,422 660,440 700,465"
                    fill="none"
                    stroke="#1E4078"
                    strokeOpacity="0.045"
                    strokeWidth="1.1"
                />

                {/* Onda suave inferior */}
                <path
                    d="M0,785 C145,730 310,845 485,785 C580,752 635,770 680,795 L680,960 L0,960 Z"
                    fill="url(#saWaveGradBottom)"
                />
                <path
                    d="M-20,815 C150,750 330,870 510,805 C595,775 650,795 700,820"
                    fill="none"
                    stroke="#005BB5"
                    strokeOpacity="0.07"
                    strokeWidth="1.5"
                />
                <path
                    d="M-20,842 C175,780 350,895 535,832 C610,806 655,822 700,845"
                    fill="none"
                    stroke="#0284C7"
                    strokeOpacity="0.05"
                    strokeWidth="1.1"
                />
            </svg>

            {/* Contenedor de primer plano por encima de las ondas */}
            <div style={{ position: 'relative', zIndex: 1 }}>
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

            {/* Sello de agua si está Anulada o Dispensada */}
            {estadoUpper !== 'VIGENTE' && (
                <div
                    style={{
                        position: 'absolute',
                        top: '14px',
                        right: '16px',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: estadoUpper === 'DISPENSADA' ? '#DBEAFE' : '#FEE2E2',
                        color: estadoUpper === 'DISPENSADA' ? '#1E40AF' : '#991B1B',
                        border: `1px solid ${estadoUpper === 'DISPENSADA' ? '#93C5FD' : '#FCA5A5'}`,
                    }}
                >
                    {estadoUpper === 'DISPENSADA' ? 'DISPENSADA EN FARMACIA' : estadoUpper}
                </div>
            )}

            {/* ─── 1. ENCABEZADO CENTRADO: "receta electrónica | SANATORIO ARGENTINO" ─── */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '14px',
                    marginBottom: '22px',
                    paddingTop: '2px',
                }}
            >
                <div
                    style={{
                        textAlign: 'right',
                        color: '#1E4078',
                        fontWeight: 700,
                        fontSize: '1.18rem',
                        lineHeight: 1.05,
                        letterSpacing: '0.02em',
                    }}
                >
                    <div>receta</div>
                    <div>electrónica</div>
                </div>

                {/* Arco separador institucional */}
                <svg width="14" height="48" viewBox="0 0 14 48" style={{ flexShrink: 0 }}>
                    <path
                        d="M3 3 C 11 15, 11 33, 3 45"
                        stroke="#1E4078"
                        strokeWidth="2.4"
                        fill="none"
                        strokeLinecap="round"
                    />
                </svg>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img
                        src="/logosanatorio.png"
                        alt="Sanatorio Argentino"
                        style={{
                            width: '42px',
                            height: '42px',
                            objectFit: 'contain',
                        }}
                    />
                    <div style={{ textAlign: 'left', lineHeight: 1.08 }}>
                        <div
                            style={{
                                fontSize: '1.22rem',
                                fontWeight: 900,
                                color: '#1E4078',
                                letterSpacing: '-0.02em',
                            }}
                        >
                            sanatorio
                        </div>
                        <div
                            style={{
                                fontSize: '1.22rem',
                                fontWeight: 900,
                                color: '#1E4078',
                                letterSpacing: '-0.02em',
                            }}
                        >
                            argentino
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── 2. FECHA ÓRDEN + DOBLE CÓDIGO DE BARRAS CENTRADO ─── */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    marginBottom: '20px',
                }}
            >
                <div style={{ fontSize: '1.02rem', marginBottom: '12px', color: '#000000' }}>
                    <strong>Fecha Órden:</strong> {fechaOrden}
                </div>

                <div style={{ fontSize: '1.02rem', fontWeight: 700, marginBottom: '6px', color: '#000000' }}>
                    Órden Nro:
                </div>
                <Code128BarcodeSVG
                    value={nroOrden}
                    width={290}
                    height={70}
                    showText={true}
                    fontSize="1.15rem"
                />

                <div style={{ fontSize: '1.02rem', fontWeight: 700, marginTop: '12px', marginBottom: '6px', color: '#000000' }}>
                    NroAfiliado:
                </div>
                <Code128BarcodeSVG
                    value={nroAfiliadoBarcode}
                    width={260}
                    height={54}
                    showText={true}
                    fontSize="1.08rem"
                />
            </div>

            {/* ─── 3. DATOS DEL PACIENTE Y COBERTURA (ALINEADO A LA IZQUIERDA) ─── */}
            <div
                style={{
                    fontSize: '0.92rem',
                    color: '#000000',
                    lineHeight: 1.32,
                    marginBottom: '18px',
                }}
            >
                <div>
                    <strong>OS:</strong> {receta.paciente_obra_social || 'PARTICULAR'}
                </div>
                <div>
                    <strong>Afiliado:</strong> {receta.paciente_nombre || '—'}
                </div>
                <div>
                    <strong>D.N.I.:</strong> {receta.paciente_dni || '—'}
                </div>
                <div>
                    <strong>CUIL:</strong> {cuilClean}
                </div>
                <div>
                    <strong>Sexo:</strong> {receta.paciente_sexo || 'F'}
                </div>
                <div>
                    <strong>Fecha Nacimiento:</strong> {fechaNacCorta}
                </div>
                <div>
                    <strong>Diagnóstico:</strong>{' '}
                    {receta.diagnostico_descripcion || 'control clinico'}
                    {receta.diagnostico_cie10_codigo ? ` (${receta.diagnostico_cie10_codigo})` : ''}
                </div>
                <div>
                    <strong>Plan:</strong> {receta.paciente_plan || 'GENERAL'}
                </div>
            </div>

            {/* ─── 4. SECCIÓN RP/ (MEDICAMENTOS O PRÁCTICAS PRESCRIPTAS) ─── */}
            <div style={{ marginBottom: '26px', color: '#000000' }}>
                <div
                    style={{
                        fontSize: '1.05rem',
                        fontWeight: 700,
                        marginBottom: '10px',
                    }}
                >
                    RP/
                </div>

                <ul
                    style={{
                        margin: '0 0 0 22px',
                        padding: 0,
                        listStyleType: 'disc',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                    }}
                >
                    {items.map((item, idx) => {
                        const tituloPrincipal = [
                            item.dci,
                            item.concentracion,
                            item.formaFarmaceutica && item.formaFarmaceutica !== 'Práctica / Estudio diagnóstico'
                                ? item.formaFarmaceutica
                                : null,
                            item.presentacion && item.presentacion !== 'Orden de práctica médica'
                                ? `(${item.presentacion})`
                                : null,
                        ]
                            .filter(Boolean)
                            .join(' ');

                        return (
                            <li key={idx} style={{ fontSize: '0.98rem', lineHeight: 1.35 }}>
                                <div style={{ fontStyle: 'italic' }}>
                                    {tituloPrincipal || 'Prescripción médica'}
                                    {item.marcaSugerida ? ` — Sugerido: ${item.marcaSugerida}` : ''}
                                </div>
                                <div>
                                    <strong>Cantidad:</strong> {item.unidadesNumero || 1}
                                    {item.unidadesLetras ? (
                                        <span style={{ fontSize: '0.84rem', color: '#334155' }}>
                                            {' '}
                                            ({item.unidadesLetras})
                                        </span>
                                    ) : null}
                                </div>
                                {item.posologia && (
                                    <div style={{ fontSize: '0.85rem', color: '#1E293B', marginTop: '2px' }}>
                                        <strong>Indicaciones:</strong> {item.posologia}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>

                {receta.observaciones && (
                    <div style={{ marginTop: '10px', fontSize: '0.86rem', color: '#1E293B' }}>
                        <strong>Nota / Observaciones:</strong> {receta.observaciones}
                    </div>
                )}
            </div>

            {/* ─── 5. FIRMADO ELECTRÓNICAMENTE POR: (DATOS DEL PROFESIONAL) ─── */}
            <div
                style={{
                    fontSize: '0.9rem',
                    color: '#000000',
                    lineHeight: 1.32,
                    marginBottom: '6px',
                }}
            >
                <div
                    style={{
                        fontSize: '1.02rem',
                        fontWeight: 700,
                        fontStyle: 'italic',
                        marginBottom: '3px',
                    }}
                >
                    Firmado electrónicamente por:
                </div>
                <div>
                    <strong>Profesional:</strong> {receta.medico_nombre || '—'}
                </div>
                <div>
                    <strong>REFEPS:</strong> {refepsNum}
                </div>
                <div>
                    <strong>Matricula:</strong> {matProvDisplay}
                </div>
                <div>
                    <strong>Profesión:</strong> {receta.medico_profesion || 'Médico'}
                    {receta.medico_especialidad ? ` (${receta.medico_especialidad})` : ''}
                </div>
                <div>
                    <strong>Dirección:</strong> {direccionProfesional}
                </div>
            </div>

            {/* ─── 6. EMITIDA + LÍNEA DIVISORIA ─── */}
            <div
                style={{
                    textAlign: 'center',
                    fontSize: '0.88rem',
                    color: '#6B7280',
                    fontWeight: 700,
                    marginTop: '8px',
                    paddingBottom: '4px',
                    borderBottom: '1.5px solid #000000',
                }}
            >
                Emitida: {fechaEmitidaHora}
            </div>

            {/* ─── 7. LOGO INSTITUCIONAL SANATORIO ARGENTINO (IZQ) + FIRMA ELECTRÓNICA QR (DER) ─── */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 4px 16px',
                    gap: '16px',
                }}
            >
                {/* Solo el logo de Sanatorio Argentino */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <img
                        src="/logosanatorio.png"
                        alt="Sanatorio Argentino"
                        style={{
                            width: '66px',
                            height: '66px',
                            objectFit: 'contain',
                        }}
                    />
                </div>

                {/* Derecha: Firma Electrónica + Código QR */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1rem', color: '#1F2937' }}>Firma Electrónica:</span>
                    <div style={{ background: 'rgba(255,255,255,0.85)', padding: '2px', borderRadius: '4px' }}>
                        <QRCodeSVG value={validationUrl} size={78} level="M" bgColor="transparent" />
                    </div>
                </div>
            </div>

            {/* ─── 8. LEYENDA DE FIRMA OLÓGRAFA + PIE MINISTERIO DE SALUD DE LA NACIÓN ─── */}
            <div
                style={{
                    textAlign: 'center',
                    fontSize: '0.84rem',
                    color: '#6B7280',
                    paddingBottom: '12px',
                    borderBottom: '1.5px solid #000000',
                }}
            >
                La firma electrónica sustituye legalmente a la firma ológrafa
            </div>

            <div
                style={{
                    textAlign: 'center',
                    fontSize: '0.78rem',
                    color: '#000000',
                    paddingTop: '6px',
                    lineHeight: 1.35,
                }}
            >
                Esta receta fue creada por un emisor inscripto y validado en el Registro de Recetarios Electrónicos del
                Ministerio de Salud de la Nación (Resolución RL-2024-91317760-APN-SSVEIYES#MS —{' '}
                {RENAPDIS_INSTITUTION_CONFIG.entidadRazonSocial} — CUIR: {receta.cuir})
            </div>
            </div>
        </div>
    );
}
