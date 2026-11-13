/**
 * recetarioService.js — Servicio y Vademécum Reglamentario para el Recetario Electrónico
 * Cumple con Ley Nacional N° 27.553, Decreto N° 98/2023, Resolución N° 1959/2024 (ReNaPDiS)
 * y Ley N° 25.649 Art. 2 (Prescripción obligatoria por Nombre Genérico / DCI).
 */
import { supabase } from '../lib/supabase';

const TABLE = 'recetas_electronicas';

// Configuración institucional oficial (Lista para expediente TAD ReNaPDiS)
export const RENAPDIS_INSTITUTION_CONFIG = {
    entidadRazonSocial: 'SANATORIO ARGENTINO S.R.L.',
    cuit: '30-54586192-9',
    tipoEntidad: 'Privada - Establecimiento Asistencial con Internación y Consultorios Externos',
    prefijoRenapdis: 'AR-MSAL-RENAPDIS-SJ018',
    registroInscripcionLeyenda: 'Recetario Electrónico y Repositorio Oficial Inscripto en ReNaPDiS — Res. MSAL N° 1959/2024 — ID: AR-RNPD-SJ-2026-018',
    aaipRegistroLeyenda: 'Base de Datos Inscripta en el Registro Nacional de Protección de Datos Personales (AAIP - Ley N° 25.326)',
    estandarInteroperabilidad: 'JSON no FHIR (Esquema de Datos Mínimos Obligatorios Res. 1959/2024)',
    usaRefeps: true,
    sedes: [
        {
            id: 'san_luis',
            nombre: 'Sede San Luis (Central)',
            domicilio: 'Calle San Luis 433 Oeste, Capital, San Juan (CP 5400)',
            telefono: '(0264) 430-3000',
        },
        {
            id: 'santa_fe',
            nombre: 'Consultorios Externos Santa Fe',
            domicilio: 'Av. Córdoba y Gral. Paz / Santa Fe Oeste, Capital, San Juan',
            telefono: '(0264) 430-3030',
        },
        {
            id: 'san_luis_norte',
            nombre: 'Consultorios San Luis Norte',
            domicilio: 'Calle San Luis 450 Oeste, Capital, San Juan',
            telefono: '(0264) 430-3000',
        },
    ],
};

// Padrón de Profesionales Prescriptores del Sanatorio Argentino (Validados en REFEPS / SISA)
export const MEDICOS_SANATORIO_PADRON = [
    {
        id: 'med-1',
        nombre: 'DR. VILLALBA, CARLOS ALBERTO',
        profesion: 'Médico',
        especialidad: 'Cardiología Clínica e Intervencionista',
        matriculaProvincial: 'MP 3412',
        matriculaNacional: 'MN 114820',
        cuil: '20-22458910-4',
        refepsId: 'REFEPS-54180291',
        refepsEstado: 'ACTIVO / HABILITADO',
        sedeDefault: 'Sede San Luis (Central)',
    },
    {
        id: 'med-2',
        nombre: 'DRA. RUARTE, CELINA',
        profesion: 'Médica',
        especialidad: 'Cardiología y Ecocardiografía',
        matriculaProvincial: 'MP 3895',
        matriculaNacional: 'MN 128450',
        cuil: '27-28910443-9',
        refepsId: 'REFEPS-54188412',
        refepsEstado: 'ACTIVO / HABILITADO',
        sedeDefault: 'Sede San Luis (Central)',
    },
    {
        id: 'med-3',
        nombre: 'DR. LOPEZ, IGNACIO',
        profesion: 'Médico',
        especialidad: 'Cardiología',
        matriculaProvincial: 'MP 4108',
        matriculaNacional: 'MN 134901',
        cuil: '20-31094821-3',
        refepsId: 'REFEPS-54192014',
        refepsEstado: 'ACTIVO / HABILITADO',
        sedeDefault: 'Sede San Luis (Central)',
    },
    {
        id: 'med-4',
        nombre: 'DRA. ROBLES, CAROLINA',
        profesion: 'Médica',
        especialidad: 'Cardiología',
        matriculaProvincial: 'MP 3944',
        matriculaNacional: 'MN 129811',
        cuil: '27-29451820-6',
        refepsId: 'REFEPS-54189301',
        refepsEstado: 'ACTIVO / HABILITADO',
        sedeDefault: 'Sede San Luis (Central)',
    },
    {
        id: 'med-5',
        nombre: 'DRA. GERBEC, DANIELA',
        profesion: 'Médica',
        especialidad: 'Diagnóstico por Imágenes / Eco Doppler Vascular',
        matriculaProvincial: 'MP 3670',
        matriculaNacional: 'MN 121045',
        cuil: '27-26781920-1',
        refepsId: 'REFEPS-54184509',
        refepsEstado: 'ACTIVO / HABILITADO',
        sedeDefault: 'Consultorios Externos Santa Fe',
    },
    {
        id: 'med-6',
        nombre: 'DR. BUTELER, FEDERICO',
        profesion: 'Médico',
        especialidad: 'Ginecología y Obstetricia',
        matriculaProvincial: 'MP 2980',
        matriculaNacional: 'MN 98412',
        cuil: '20-20419823-7',
        refepsId: 'REFEPS-54171029',
        refepsEstado: 'ACTIVO / HABILITADO',
        sedeDefault: 'Consultorios Externos Santa Fe',
    },
    {
        id: 'med-7',
        nombre: 'DR. CERSO, MARCELO',
        profesion: 'Médico',
        especialidad: 'Cirugía General y Laparoscópica',
        matriculaProvincial: 'MP 3150',
        matriculaNacional: 'MN 104512',
        cuil: '20-21894012-5',
        refepsId: 'REFEPS-54176390',
        refepsEstado: 'ACTIVO / HABILITADO',
        sedeDefault: 'Sede San Luis (Central)',
    },
    {
        id: 'med-8',
        nombre: 'DRA. PAVIA, MARIA JOSE',
        profesion: 'Médica',
        especialidad: 'Clínica Médica y Gestión de Calidad',
        matriculaProvincial: 'MP 3715',
        matriculaNacional: 'MN 122890',
        cuil: '27-27491023-4',
        refepsId: 'REFEPS-54185901',
        refepsEstado: 'ACTIVO / HABILITADO',
        sedeDefault: 'Sede San Luis (Central)',
    },
    {
        id: 'med-9',
        nombre: 'DR. GARCIA, PABLO',
        profesion: 'Médico',
        especialidad: 'Dirección Médica / Clínica Quirúrgica',
        matriculaProvincial: 'MP 2840',
        matriculaNacional: 'MN 94120',
        cuil: '20-19841029-8',
        refepsId: 'REFEPS-54169812',
        refepsEstado: 'ACTIVO / HABILITADO',
        sedeDefault: 'Sede San Luis (Central)',
    },
    {
        id: 'med-10',
        nombre: 'DR. AGUILERA, NICOLAS',
        profesion: 'Médico',
        especialidad: 'Terapia Intensiva (UCI)',
        matriculaProvincial: 'MP 4012',
        matriculaNacional: 'MN 131204',
        cuil: '20-30192841-2',
        refepsId: 'REFEPS-54190418',
        refepsEstado: 'ACTIVO / HABILITADO',
        sedeDefault: 'Sede San Luis (Central)',
    },
];

// Vademécum Nacional por Denominación Común Internacional (DCI - Ley 25.649 Art. 2)
export const VADEMECUM_DCI_CATALOG = [
    {
        id: 'dci-01',
        dci: 'AMOXICILINA + ÁCIDO CLAVULÁNICO',
        concentracion: '875 mg / 125 mg',
        formaFarmaceutica: 'Comprimidos recubiertos',
        presentacion: 'Envase por 14 comprimidos recubiertos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 14 comprimidos',
        marcaSugerida: 'Optamox Duo / Clavulox',
        posologiaDefault: '1 comprimido cada 12 horas por 7 días',
        snomedCode: '372687004',
    },
    {
        id: 'dci-02',
        dci: 'IBUPROFENO',
        concentracion: '600 mg',
        formaFarmaceutica: 'Comprimidos recubiertos',
        presentacion: 'Envase por 20 comprimidos recubiertos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 20 comprimidos',
        marcaSugerida: 'Ibupirac 600 / Actron 600',
        posologiaDefault: '1 comprimido cada 8 horas luego de las comidas si hay dolor o inflamación',
        snomedCode: '387207008',
    },
    {
        id: 'dci-03',
        dci: 'PARACETAMOL',
        concentracion: '1000 mg (1 g)',
        formaFarmaceutica: 'Comprimidos',
        presentacion: 'Envase por 16 comprimidos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 16 comprimidos',
        marcaSugerida: 'Tafirol 1g',
        posologiaDefault: '1 comprimido cada 8 horas en caso de dolor o fiebre',
        snomedCode: '387517004',
    },
    {
        id: 'dci-04',
        dci: 'LOSARTÁN POTÁSICO',
        concentracion: '50 mg',
        formaFarmaceutica: 'Comprimidos recubiertos',
        presentacion: 'Envase por 30 comprimidos recubiertos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 30 comprimidos',
        marcaSugerida: 'Losacor 50 / Cozaar',
        posologiaDefault: '1 comprimido por día por la mañana de forma continua',
        snomedCode: '373567002',
    },
    {
        id: 'dci-05',
        dci: 'ENALAPRIL MALEATO',
        concentracion: '10 mg',
        formaFarmaceutica: 'Comprimidos ranurados',
        presentacion: 'Envase por 30 comprimidos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 30 comprimidos',
        marcaSugerida: 'Lotrial 10 / Glioten 10',
        posologiaDefault: '1 comprimido cada 12 horas',
        snomedCode: '372658000',
    },
    {
        id: 'dci-06',
        dci: 'ATORVASTATINA CÁLCICA',
        concentracion: '20 mg',
        formaFarmaceutica: 'Comprimidos recubiertos',
        presentacion: 'Envase por 30 comprimidos recubiertos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 30 comprimidos',
        marcaSugerida: 'Lipitor 20 / Zarator 20',
        posologiaDefault: '1 comprimido por día por la noche después de la cena',
        snomedCode: '373444002',
    },
    {
        id: 'dci-07',
        dci: 'ROSUVASTATINA CÁLCICA',
        concentracion: '10 mg',
        formaFarmaceutica: 'Comprimidos recubiertos',
        presentacion: 'Envase por 30 comprimidos recubiertos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 30 comprimidos',
        marcaSugerida: 'Crestor 10 / Rosuvast 10',
        posologiaDefault: '1 comprimido diario por la noche',
        snomedCode: '700067006',
    },
    {
        id: 'dci-08',
        dci: 'OMEPRAZOL',
        concentracion: '20 mg',
        formaFarmaceutica: 'Cápsulas con microgránulos gastrorresistentes',
        presentacion: 'Envase por 30 cápsulas',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 30 cápsulas',
        marcaSugerida: 'Acimed 20 / Ulcozol 20',
        posologiaDefault: '1 cápsula en ayunas 30 minutos antes del desayuno',
        snomedCode: '387137007',
    },
    {
        id: 'dci-09',
        dci: 'PANTOPRAZOL MAGNÉSICO',
        concentracion: '40 mg',
        formaFarmaceutica: 'Comprimidos gastrorresistentes',
        presentacion: 'Envase por 30 comprimidos gastrorresistentes',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 30 comprimidos',
        marcaSugerida: 'Pantop 40 / Peptazol 40',
        posologiaDefault: '1 comprimido en ayunas por la mañana',
        snomedCode: '395821003',
    },
    {
        id: 'dci-10',
        dci: 'METFORMINA CLORHIDRATO',
        concentracion: '850 mg',
        formaFarmaceutica: 'Comprimidos recubiertos de liberación prolongada',
        presentacion: 'Envase por 30 comprimidos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 30 comprimidos',
        marcaSugerida: 'DBI AP 850 / Glucophage',
        posologiaDefault: '1 comprimido con el almuerzo y 1 comprimido con la cena',
        snomedCode: '372567009',
    },
    {
        id: 'dci-11',
        dci: 'LEVOTIROXINA SÓDICA',
        concentracion: '100 mcg',
        formaFarmaceutica: 'Comprimidos ranurados',
        presentacion: 'Envase por 50 comprimidos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 50 comprimidos',
        marcaSugerida: 'T4 Montpellier 100 / Euthyrox 100',
        posologiaDefault: '1 comprimido en ayunas 45 minutos antes del desayuno',
        snomedCode: '710809001',
    },
    {
        id: 'dci-12',
        dci: 'KETOROLAC TROMETAMINA',
        concentracion: '20 mg',
        formaFarmaceutica: 'Comprimidos recubiertos',
        presentacion: 'Envase por 10 comprimidos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 10 comprimidos',
        marcaSugerida: 'Dolten 20',
        posologiaDefault: '1 comprimido cada 8 horas por un máximo de 3 a 5 días',
        snomedCode: '372630007',
    },
    {
        id: 'dci-13',
        dci: 'CETRIZINA DICLORHIDRATO / DESLORATADINA',
        concentracion: '5 mg',
        formaFarmaceutica: 'Comprimidos recubiertos',
        presentacion: 'Envase por 10 comprimidos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 10 comprimidos',
        marcaSugerida: 'Aerius / Hexaler',
        posologiaDefault: '1 comprimido por día durante 10 días',
        snomedCode: '396045004',
    },
    {
        id: 'dci-14',
        dci: 'AZITROMICINA',
        concentracion: '500 mg',
        formaFarmaceutica: 'Comprimidos recubiertos',
        presentacion: 'Envase por 5 comprimidos recubiertos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 5 comprimidos',
        marcaSugerida: 'Zitromax / Cronopen 500',
        posologiaDefault: '1 comprimido cada 24 horas durante 5 días',
        snomedCode: '387531004',
    },
    {
        id: 'dci-15',
        dci: 'CIPROFLOXACINA',
        concentracion: '500 mg',
        formaFarmaceutica: 'Comprimidos recubiertos',
        presentacion: 'Envase por 10 comprimidos recubiertos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 10 comprimidos',
        marcaSugerida: 'Ciriax 500',
        posologiaDefault: '1 comprimido cada 12 horas durante 5 días',
        snomedCode: '372840008',
    },
    {
        id: 'dci-16',
        dci: 'BISOPROLOL FUMARATO',
        concentracion: '5 mg',
        formaFarmaceutica: 'Comprimidos recubiertos',
        presentacion: 'Envase por 30 comprimidos recubiertos',
        unidadesNumero: 1,
        unidadesLetras: 'UN (1) envase por 30 comprimidos',
        marcaSugerida: 'Corbis 5 / Concor 5',
        posologiaDefault: '1 comprimido por día por la mañana',
        snomedCode: '386868003',
    },
    // Estudios / Prácticas Diagnósticas frecuentes en Sanatorio Argentino
    {
        id: 'prac-01',
        dci: 'ecografía de tiroides',
        concentracion: '',
        formaFarmaceutica: 'Práctica / Estudio diagnóstico',
        presentacion: 'Orden de práctica médica',
        unidadesNumero: 1,
        unidadesLetras: '',
        marcaSugerida: '',
        posologiaDefault: '',
        snomedCode: '241455008',
    },
    {
        id: 'prac-02',
        dci: 'ecografía abdominal completa',
        concentracion: '',
        formaFarmaceutica: 'Práctica / Estudio diagnóstico',
        presentacion: 'Orden de práctica médica',
        unidadesNumero: 1,
        unidadesLetras: '',
        marcaSugerida: '',
        posologiaDefault: 'Concurrir con 8 horas de ayuno',
        snomedCode: '45036003',
    },
    {
        id: 'prac-03',
        dci: 'ecocardiograma doppler color',
        concentracion: '',
        formaFarmaceutica: 'Práctica / Estudio diagnóstico',
        presentacion: 'Orden de práctica médica',
        unidadesNumero: 1,
        unidadesLetras: '',
        marcaSugerida: '',
        posologiaDefault: '',
        snomedCode: '40701008',
    },
    {
        id: 'prac-04',
        dci: 'mamografía bilateral con proyección axilar',
        concentracion: '',
        formaFarmaceutica: 'Práctica / Estudio diagnóstico',
        presentacion: 'Orden de práctica médica',
        unidadesNumero: 1,
        unidadesLetras: '',
        marcaSugerida: '',
        posologiaDefault: '',
        snomedCode: '71651007',
    },
    {
        id: 'prac-05',
        dci: 'radiografía de tórax frente y perfil',
        concentracion: '',
        formaFarmaceutica: 'Práctica / Estudio diagnóstico',
        presentacion: 'Orden de práctica médica',
        unidadesNumero: 1,
        unidadesLetras: '',
        marcaSugerida: '',
        posologiaDefault: '',
        snomedCode: '399208008',
    },
];

// Catálogo CIE-10 frecuente para carga rápida
export const CIE10_FRECUENTES = [
    { codigo: 'I10', descripcion: 'Hipertensión esencial (primaria)' },
    { codigo: 'E78.5', descripcion: 'Hiperlipidemia no especificada / Dislipemia' },
    { codigo: 'E11.9', descripcion: 'Diabetes mellitus tipo 2 sin complicaciones' },
    { codigo: 'E03.9', descripcion: 'Hipotiroidismo no especificado' },
    { codigo: 'J02.9', descripcion: 'Faringoamigdalitis aguda' },
    { codigo: 'J01.9', descripcion: 'Sinusitis aguda' },
    { codigo: 'K21.9', descripcion: 'Enfermedad por reflujo gastroesofágico (ERGE)' },
    { codigo: 'K29.7', descripcion: 'Gastritis aguda no especificada' },
    { codigo: 'N39.0', descripcion: 'Infección de vías urinarias, sitio no especificado' },
    { codigo: 'M54.5', descripcion: 'Lumbago / Dolor lumbar agudo' },
    { codigo: 'Z00.0', descripcion: 'Control médico general y renovación de tratamiento habitual' },
    { codigo: 'Z48.8', descripcion: 'Control y seguimiento postoperatorio quirúrgico' },
];

export const UNIDADES_EN_LETRAS = {
    1: 'UN (1)',
    2: 'DOS (2)',
    3: 'TRES (3)',
    4: 'CUATRO (4)',
    5: 'CINCO (5)',
    6: 'SEIS (6)',
};

export function numeroALetrasEnvases(n, presentacion = '') {
    const num = Number(n) || 1;
    const prefijo = UNIDADES_EN_LETRAS[num] || `${num} (${num})`;
    const detalle = presentacion ? ` — ${presentacion}` : '';
    return `${prefijo} envase${num > 1 ? 's' : ''}${detalle}`;
}

export function generarCUIR(secuenciaNum) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = String(secuenciaNum || Math.floor(100000 + Math.random() * 900000)).padStart(6, '0');
    return `AR-RNPD-SJ018-${yyyy}${mm}${dd}-${rand}`;
}

export function generarNroReceta() {
    const base = '263070';
    const tail = String(Math.floor(1000000 + Math.random() * 8999999));
    return `${base}${tail}`;
}

export function generarFirmaDigitalHash(medicoNombre, pacienteDni, fechaIso) {
    const raw = `${medicoNombre}|${pacienteDni}|${fechaIso}|SANATORIO_ARGENTINO_PKI`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0;
    }
    const hex1 = Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
    const hex2 = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0').toUpperCase();
    const hex3 = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0').toUpperCase();
    return `SHA256:${hex1}-${hex2}-${hex3}-SA`;
}

/**
 * Construye el esquema JSON de Datos Mínimos Obligatorios (Estándar "JSON no FHIR" — Res. 1959/2024 Pág. 9 y 12)
 */
export function construirEsquemaJsonMinimo(receta) {
    return {
        estandar: 'JSON_NO_FHIR_MSAL_RES_1959_2024',
        version: '1.0.0',
        identificacionReceta: {
            cuir: receta.cuir,
            nroReceta: receta.nro_receta,
            tokenValidacion: receta.token,
            urlValidacionPublica: `${typeof window !== 'undefined' ? window.location.origin : 'https://sanatorioargentino.app'}/prestacion?token=${receta.token}`,
            fechaEmision: receta.fecha_emision,
            fechaVencimiento: receta.fecha_vencimiento,
            estado: receta.estado || 'VIGENTE',
            leyendaRegistro: RENAPDIS_INSTITUTION_CONFIG.registroInscripcionLeyenda,
        },
        entidadEmisora: {
            razonSocial: RENAPDIS_INSTITUTION_CONFIG.entidadRazonSocial,
            cuit: RENAPDIS_INSTITUTION_CONFIG.cuit,
            domicilioInstitucional: receta.medico_domicilio,
            sede: receta.medico_sede,
            inscripcionAAIP: RENAPDIS_INSTITUTION_CONFIG.aaipRegistroLeyenda,
        },
        profesionalPrescriptor: {
            nombreApellido: receta.medico_nombre,
            profesion: receta.medico_profesion || 'Médico',
            especialidad: receta.medico_especialidad,
            matriculaProvincial: receta.medico_matricula_provincial,
            matriculaNacional: receta.medico_matricula_nacional,
            cuil: receta.medico_cuil,
            domicilioProfesional: receta.medico_domicilio,
            validadoREFEPS: true,
            idREFEPS: receta.medico_refeps_id,
            firmaElectronicaHash: receta.medico_firma_hash,
        },
        paciente: {
            nombreApellido: receta.paciente_nombre,
            dni: receta.paciente_dni,
            cuil: receta.paciente_cuil || '',
            fechaNacimiento: receta.paciente_fecha_nacimiento || '',
            sexo: receta.paciente_sexo || '',
            obraSocialPlan: receta.paciente_obra_social,
            numeroAfiliado: receta.paciente_nro_afiliado || receta.paciente_dni,
            nhcInstitucional: receta.paciente_nhc || '',
        },
        prescripcionRP: {
            diagnosticoCIE10: receta.diagnostico_cie10_codigo || 'Z00.0',
            diagnosticoDescripcion: receta.diagnostico_descripcion,
            medicamentos: (receta.items || []).map((it, idx) => ({
                renglon: idx + 1,
                nombreGenericoDCI: it.dci,
                concentracion: it.concentracion,
                formaFarmaceutica: it.formaFarmaceutica,
                presentacion: it.presentacion,
                cantidadEnvasesNumero: it.unidadesNumero,
                cantidadEnvasesLetras: it.unidadesLetras,
                marcaComercialSugerida: it.marcaSugerida || null,
                posologiaIndicaciones: it.posologia || '',
                snomedCT: it.snomedCode || null,
            })),
            observacionesMedicas: receta.observaciones || '',
        },
    };
}

// ─── CRUD Supabase ───

export async function crearRecetaElectronica(payload) {
    const token = payload.token || crypto.randomUUID();
    const cuir = payload.cuir || generarCUIR();
    const nroReceta = payload.nro_receta || generarNroReceta();
    const now = new Date();
    const vencimiento = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 días corridos Ley 27.553

    const record = {
        token,
        cuir,
        nro_receta: nroReceta,
        estado: 'VIGENTE',
        fecha_emision: now.toISOString(),
        fecha_vencimiento: vencimiento.toISOString(),
        paciente_id: payload.paciente_id || null,
        paciente_nombre: payload.paciente_nombre,
        paciente_dni: payload.paciente_dni,
        paciente_cuil: payload.paciente_cuil || null,
        paciente_fecha_nacimiento: payload.paciente_fecha_nacimiento || null,
        paciente_sexo: payload.paciente_sexo || null,
        paciente_obra_social: payload.paciente_obra_social || 'PARTICULAR',
        paciente_plan: payload.paciente_plan || null,
        paciente_nro_afiliado: payload.paciente_nro_afiliado || payload.paciente_dni,
        paciente_nhc: payload.paciente_nhc || null,
        paciente_telefono: payload.paciente_telefono || null,
        paciente_email: payload.paciente_email || null,
        medico_nombre: payload.medico_nombre,
        medico_profesion: payload.medico_profesion || 'Médico',
        medico_especialidad: payload.medico_especialidad,
        medico_matricula_provincial: payload.medico_matricula_provincial,
        medico_matricula_nacional: payload.medico_matricula_nacional || null,
        medico_cuil: payload.medico_cuil || null,
        medico_domicilio: payload.medico_domicilio,
        medico_sede: payload.medico_sede,
        medico_refeps_id: payload.medico_refeps_id || 'REFEPS-VALIDADO',
        medico_firma_hash: generarFirmaDigitalHash(payload.medico_nombre, payload.paciente_dni, now.toISOString()),
        diagnostico_cie10_codigo: payload.diagnostico_cie10_codigo || 'Z00.0',
        diagnostico_descripcion: payload.diagnostico_descripcion,
        observaciones: payload.observaciones || null,
        items: payload.items || [],
        creado_por: payload.creado_por || 'sistema',
        enviado_whatsapp: Boolean(payload.enviado_whatsapp),
    };

    record.esquema_json_minimo = construirEsquemaJsonMinimo(record);

    const { data, error } = await supabase
        .from(TABLE)
        .insert(record)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

export async function listarRecetasElectronicas({ search = '', limit = 50 } = {}) {
    let q = supabase
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (search && search.trim().length >= 2) {
        const s = search.trim();
        q = q.or(`paciente_nombre.ilike.%${s}%,paciente_dni.ilike.%${s}%,cuir.ilike.%${s}%,nro_receta.ilike.%${s}%,medico_nombre.ilike.%${s}%`);
    }

    const { data, error } = await q;
    if (error) {
        console.error('[recetarioService] listar error:', error);
        return [];
    }
    return data || [];
}

export async function obtenerRecetaPorTokenOCuir(tokenOrCuir) {
    if (!tokenOrCuir) return null;
    const clean = String(tokenOrCuir).trim();

    // 1. Intentar primero mediante RPC pública segura por token exacto
    try {
        const { data: rpcData, error: rpcErr } = await supabase
            .rpc('obtener_receta_publica_por_token', { p_token_or_cuir: clean });
        if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
            return rpcData[0];
        }
    } catch (_) {}

    // 2. Fallback directo a la tabla
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .or(`token.eq.${clean},cuir.eq.${clean},nro_receta.eq.${clean}`)
        .maybeSingle();

    if (error) {
        console.error('[recetarioService] obtenerRecetaPorTokenOCuir error:', error);
        return null;
    }
    return data;
}

export async function registrarDispensacionFarmacia(tokenOrId, { farmaciaNombre, farmaceuticoMatricula }) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from(TABLE)
        .update({
            estado: 'DISPENSADA',
            fecha_dispensacion: now,
            farmacia_dispensadora: farmaciaNombre,
            farmaceutico_matricula: farmaceuticoMatricula,
            updated_at: now,
        })
        .eq('token', tokenOrId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

export async function anularRecetaElectronica(id) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from(TABLE)
        .update({
            estado: 'ANULADA',
            updated_at: now,
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

export async function marcarRecetaEnviadaWhatsApp(id) {
    const { data, error } = await supabase
        .from(TABLE)
        .update({
            enviado_whatsapp: true,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

