/**
 * Nomenclador Exclusivo — Pedidos Marcela
 * Prácticas de Doppler Periférico, Adicionales de imagen,
 * y solicitudes especiales (Internación Domiciliaria, Oxigenoterapia, Certificados).
 */

export const MARCELA_CATEGORIES = [
    { id: 'all', label: 'Todos' },
    { id: 'domiciliaria', label: 'Int. Domiciliaria' },
    { id: 'oxigenoterapia', label: 'Oxigenoterapia' },
    { id: 'certificado', label: 'Certificados' },
    { id: 'hemodialisis', label: 'Hemodiálisis' },
    { id: 'doppler', label: 'Doppler Periférico' },
    { id: 'cardiologia', label: 'Cardiología' },
    { id: 'adicionales', label: 'Adicionales' },
];

export const MARCELA_PRACTICES = [
    // === INTERNACIÓN DOMICILIARIA ===
    { code: 'ID-DOM', name: 'Solicito Internación Domiciliaria', category: 'domiciliaria',
        fields: ['app', 'diagnostico', 'visita_medica', 'visita_enfermeria', 'visita_kinesiologia', 'medicacion'] },

    // === OXIGENOTERAPIA ===
    { code: 'OXI-CONC', name: 'Solicito Oxigenoterapia con Concentrador de Oxígeno', category: 'oxigenoterapia',
        fields: ['requerimiento_diario', 'dosis', 'horas'] },

    // === CERTIFICADOS ===
    { code: 'CERT-INT', name: 'Certificado de Internación en Terapia Intensiva/Intermedia', category: 'certificado',
        fields: ['diagnostico', 'horas_validez'] },

    // === HEMODIÁLISIS ===
    { code: '270107', name: 'Hemodiálisis', category: 'hemodialisis' },

    // === DOPPLER PERIFÉRICO ===
    { code: '180124', name: 'Eco Doppler arterial vasos de cuello', category: 'doppler', uImagen: 276 },
    { code: '180119', name: 'Eco Doppler vasos, venoso, superficial, profundo de ambos miembros', category: 'doppler', uImagen: 393 },
    { code: '180120', name: 'Eco Doppler arterial ambos miembros', category: 'doppler', uImagen: 393 },
    { code: '180136', name: 'Eco Doppler fetal', category: 'doppler', uImagen: 230 },
    { code: '180132', name: 'Eco Doppler otros órganos por región', category: 'doppler', uImagen: 230 },
    { code: '180130', name: 'Eco Doppler color pulsado para pacientes con cardiopatías', category: 'doppler', uImagen: 231 },
    { code: '180131', name: 'Eco Doppler color tocoginecológico', category: 'doppler', uImagen: 124 },
    { code: '180134', name: 'Eco Doppler color transesofágico', category: 'doppler', uImagen: 394 },
    { code: '180802', name: 'Eco Doppler transcraneal', category: 'doppler', uImagen: 231 },

    // === CARDIOLOGÍA ===
    { code: '180130', name: 'Ecocardiograma', category: 'cardiologia' },

    // === ADICIONALES ===
    { code: '340012', name: 'Tomografía computada reconstrucción 3D (Adicional)', category: 'adicionales', uImagen: 250 },
    { code: '340015', name: 'Tomografía computada alta resolución', category: 'adicionales', uImagen: 250 },
    { code: '341025', name: 'Adicional por estudio con anestesia (Adicional)', category: 'adicionales', uImagen: 510 },
    { code: '341014', name: 'Contraste oral E.V.', category: 'adicionales', uInsumo: 737 },
];

export const MARCELA_CATEGORY_COLORS = {
    domiciliaria: '#7C3AED',
    oxigenoterapia: '#0EA5E9',
    certificado: '#F59E0B',
    hemodialisis: '#EF4444',
    doppler: '#EC4899',
    cardiologia: '#EF4444',
    adicionales: '#14B8A6',
};
