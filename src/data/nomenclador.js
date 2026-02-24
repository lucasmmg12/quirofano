/**
 * Nomenclador Oficial de Prácticas Médicas — Sanatorio Argentino
 * Datos provistos por el equipo administrativo.
 */

export const INTERCONSULTA_SPECIALTIES = [
    'Cardiología',
    'Cirugía',
    'Dermatología',
    'Endocrinología',
    'Diabetología',
    'Gastroenterología',
    'Kinesiología',
    'Neurocirugía',
    'Traumatología',
    'Urología',
];

export const CATEGORIES = [
    { id: 'all', label: 'Todos' },
    { id: 'prorroga', label: 'Prórroga' },
    { id: 'neonatal', label: 'Neonatal' },
    { id: 'anestesia', label: 'Anestesia' },
    { id: 'laboratorio', label: 'Laboratorio' },
    { id: 'hemoterapia', label: 'Hemoterapia' },
    { id: 'cardiologia', label: 'Cardiología' },
    { id: 'interconsulta', label: 'Interconsulta' },
    { id: 'biopsia', label: 'Biopsia' },
    { id: 'instrumentos', label: 'Instrumentos Qx' },
    { id: 'kinesiologia', label: 'Kinesiología' },
    { id: 'radiologia', label: 'Radiología' },
    { id: 'ecografia', label: 'Ecografía' },
    { id: 'eco_doppler', label: 'Eco Doppler' },
    { id: 'ginecologia', label: 'Ginecología' },
    { id: 'tomografia', label: 'Tomografía' },
];

export const PRACTICES = [
    // === PRÓRROGA ===
    { code: 'PRORR', name: 'Solicito autorización de prórroga por (número de días) desde fecha indicada', category: 'prorroga', customField: 'days', customLabel: 'Cantidad de días' },

    // === NEONATAL ===
    { code: 'NEO', name: 'Solicito atención de Recién Nacido', category: 'neonatal' },

    // === ANESTESIA ===
    { code: 'ANEST-III', name: 'Solicito bloqueo de Anestesia complejidad III', category: 'anestesia' },
    { code: 'ANEST-COMP', name: 'Solicito autorización de complejidad de anestesia', category: 'anestesia', customField: 'roman', customLabel: 'Complejidad (I al IX en romanos)' },

    // === LABORATORIO ===
    { code: 'LAB-GF', name: 'Grupo y Factor', category: 'laboratorio' },

    // === HEMOTERAPIA ===
    { code: 'HEMO', name: 'Estudio inmunohematológico', category: 'hemoterapia' },

    // === CARDIOLOGÍA ===
    { code: '420303+180130', name: 'Interconsulta + Ecocardiograma', category: 'cardiologia' },
    { code: '170101+420301', name: 'Interconsulta + ECG', category: 'cardiologia' },
    { code: '170113', name: 'Valoración riesgo cardiovascular prequirúrgica', category: 'cardiologia' },

    // === INTERCONSULTA ===
    { code: '420303', name: 'Interconsulta de', category: 'interconsulta', customField: 'specialty', customLabel: 'Especialidad' },

    // === BIOPSIA ===
    { code: 'PROMAC', name: 'PROMAC - Estudio anatomopatológico', category: 'biopsia' },
    { code: 'PROMAB', name: 'PROMAB - Estudio anatomopatológico', category: 'biopsia' },
    { code: 'PROMAA', name: 'PROMAA - Estudio anatomopatológico', category: 'biopsia' },
    { code: '150104', name: 'Estudio anatomopatológico', category: 'biopsia' },
    { code: '150103', name: 'Estudio anatomopatológico', category: 'biopsia' },
    { code: '150102', name: 'Estudio anatomopatológico', category: 'biopsia' },

    // === INSTRUMENTOS QUIRURGICOS ===
    { code: '06.01.15', name: 'Uso de sistema gamma probe', category: 'instrumentos' },
    { code: '10.7.6', name: 'Ansa Bipolar', category: 'instrumentos' },
    { code: '081010', name: 'Bisturí Armónico', category: 'instrumentos' },

    // === KINESIOLOGÍA ===
    { code: 'KIN', name: 'Sesión de Kinesioterapia', category: 'kinesiologia' },

    // === RADIOLOGÍA ===
    { code: '340907', name: 'Radioscopía', category: 'radiologia' },
    { code: '340905', name: 'Radiografía en Internado', category: 'radiologia' },
    { code: '340103', name: 'Radioscopía con circuito cerrado de TV', category: 'radiologia' },
    { code: '340110', name: 'Densitometría ósea total', category: 'radiologia' },
    { code: '340201', name: 'Radiografía de cráneo, cara, senos paranasales', category: 'radiologia' },
    { code: '340202', name: 'Radiografía de cráneo (p/ exp. subsiguiente)', category: 'radiologia' },
    { code: '340203', name: 'Radiografía de huesos temporal o agujero óptico', category: 'radiologia' },
    { code: '340209', name: 'Radiografía de raquis -columna- primera', category: 'radiologia' },
    { code: '340210', name: 'Por exposición subsiguiente B', category: 'radiologia' },
    { code: '340211', name: 'Radiografía de hombro, húmero, pelvis, caderas, fémur', category: 'radiologia' },
    { code: '340212', name: 'Exposición subsiguiente A', category: 'radiologia' },
    { code: '340213', name: 'Radiografía de codo, antebrazo, muñeca, mano, dedos, rodilla, pierna, tobillo, pie, dedos', category: 'radiologia' },
    { code: '340217', name: 'Por exposición subsiguiente A', category: 'radiologia' },
    { code: '340301', name: 'Radiografía o telerradiografía de tórax', category: 'radiologia' },
    { code: '340302', name: 'Por exposición subsiguiente A', category: 'radiologia' },
    { code: '340421', name: 'Radiografía directa de abdomen', category: 'radiologia' },
    { code: '340422', name: 'Radiografía por exp. subsiguiente', category: 'radiologia' },
    { code: '340601', name: 'Mamografía unilateral', category: 'radiologia' },
    { code: '340602', name: 'Mamografía bilateral', category: 'radiologia' },

    // === ECOGRAFÍA ===
    { code: '340416x2', name: 'Colangiografía intraoperatoria (x2)', category: 'ecografia' },
    { code: '340416+340417', name: 'Colangiografía intraoperatoria', category: 'ecografia' },
    { code: '180104', name: 'Ecografía tocoginecológica', category: 'ecografia' },
    { code: '180105', name: 'Ecografía obstétrica', category: 'ecografia' },
    { code: '180106', name: 'Ecografía mamaria uni o bilateral', category: 'ecografia' },
    { code: '180107', name: 'Ecografía cerebral (con modo B y A)', category: 'ecografia' },
    { code: '180108', name: 'Ecografía de caderas (pediátrico)', category: 'ecografia' },
    { code: '180110', name: 'Ecografía tiroides', category: 'ecografia' },
    { code: '180111', name: 'Ecografía testicular', category: 'ecografia' },
    { code: '180112', name: 'Ecografía completa de abdomen', category: 'ecografia' },
    { code: '180113', name: 'Ecografía hepática, biliar, esplénica o torácica', category: 'ecografia' },
    { code: '180114', name: 'Ecografía de vejiga o próstata', category: 'ecografia' },
    { code: '180116', name: 'Ecografía renal bilateral', category: 'ecografia' },
    { code: '180122', name: 'Ecografía transvaginal o transrectal', category: 'ecografia' },
    { code: '180123', name: 'Ecografía de partes blandas', category: 'ecografia' },
    { code: '180126', name: 'Ecografía de glándulas parótidas', category: 'ecografia' },
    { code: '180127', name: 'Punción guiada por imágenes', category: 'ecografia' },
    { code: '180128', name: 'Marcación con guía ecográfica', category: 'ecografia' },
    { code: '180136', name: 'Ecografía lumbosacra', category: 'ecografia' },
    { code: '180204', name: 'Ecografía obstétrica con translucencia nucal', category: 'ecografia' },
    { code: '180204B', name: 'Diferencia ecografía obstétrica con translucencia nucal', category: 'ecografia' },
    { code: '180205', name: 'Ecografía obstétrica 4D o 5D', category: 'ecografia' },
    { code: '180206', name: 'Scan morfológico fetal', category: 'ecografia' },
    { code: '180206B', name: 'Diferencia scan morfológico fetal', category: 'ecografia' },
    { code: '180207', name: 'Ecografía en habitación', category: 'ecografia' },

    // === ECO DOPPLER ===
    { code: '180130', name: 'Eco Doppler pulsado color cardiopatías', category: 'eco_doppler' },
    { code: '180134', name: 'Eco Doppler color de miembros', category: 'eco_doppler' },
    { code: '180135', name: 'Eco Doppler color otras regiones', category: 'eco_doppler' },
    { code: '180136D', name: 'Eco Doppler color obstétrico', category: 'eco_doppler' },

    // === GINECOLOGÍA ===
    { code: '220101', name: 'Colposcopía', category: 'ginecologia' },
    { code: '220202', name: 'Monitoreo fetal', category: 'ginecologia' },

    // === TOMOGRAFÍA ===
    { code: '340012', name: 'Tomografía computada reconstrucción 3D', category: 'tomografia' },
    { code: '340015', name: 'Tomografía computada alta resolución', category: 'tomografia' },
    { code: '341001', name: 'Tomografía cerebral', category: 'tomografia' },
    { code: '341004', name: 'Tomografía de macizo facial', category: 'tomografia' },
    { code: '341005', name: 'Tomografía de cuello', category: 'tomografia' },
    { code: '341008', name: 'Tomografía de abdomen', category: 'tomografia' },
    { code: '341009', name: 'Tomografía de pelvis', category: 'tomografia' },
    { code: '341010', name: 'Tomografía torácica', category: 'tomografia' },
    { code: '341012', name: 'Tomografía de otros órganos o regiones', category: 'tomografia' },
    { code: '341013', name: 'Tomografía de columna por área', category: 'tomografia' },
    { code: '341014', name: 'Contraste oral E.V.', category: 'tomografia' },
    { code: '341016', name: 'Guía para punción o drenaje bajo TC (gastos)', category: 'tomografia' },
    { code: '341016-H', name: 'Punción guiada por TC (honorarios)', category: 'tomografia' },
    { code: '341017', name: 'Guía para bloqueo radicular (gastos)', category: 'tomografia' },
    { code: '341018', name: 'Tomografía de rodilla con medición', category: 'tomografia' },
    { code: '341019', name: 'Angiotomografía (por área)', category: 'tomografia' },
    { code: '341020', name: 'Cardio TC', category: 'tomografia' },
    { code: '341021', name: 'Scan de calcio', category: 'tomografia' },
    { code: '341022', name: 'Endoscopía virtual', category: 'tomografia' },
    { code: '341023', name: 'Urotomografía', category: 'tomografia' },
    { code: '341024', name: 'TC corporal de baja dosis', category: 'tomografia' },
    { code: '341025', name: 'Adicional por estudio con anestesia', category: 'tomografia' },
    { code: '341028', name: 'TC trifásica', category: 'tomografia' },
];

/** Actualizado a Febrero 2026 */
export const OBRAS_SOCIALES = [
    '001 - PROVINCIA',
    '004 - DAMSU',
    '005 - OSDE BINARIO',
    '024 - PODER JUDICIAL',
    '028 - IOSFA',
    '038 - AVALIAN SALUD Y BIENESTAR COOPERATIVA LIMITADA',
    '042 - PARTICULARES',
    '065 - OMINT S.A.',
    '066 - MEDICUS S.A.',
    '074 - COLMED SALUD',
    '076 - MEDIFE ASOCIACION CIVIL',
    '097 - SANIP SALUD S.A. (MEDISALUD)',
    '121 - SWISS MEDICAL S.A.',
    '135 - JERARQUICOS SALUD',
    '140 - LUIS PASTEUR',
    '172 - RED DE SEGURO MEDICO S.R.L.',
    '186 - BOREAL - COBERTURA DE SALUD S.A.',
    '196 - GALENO ARGENTINA S.A.',
    '199 - O.S DE VIAJANTES VENDEDORES RA',
    '200 - ASOCIACION MUTUAL SANCOR SALUD',
    '206 - UNION PERSONAL',
    '213 - UNIMED S.A.',
    '233 - PREVENCION SALUD S.A.',
    '237 - OSPE - OBRA SOCIAL DE PETROLEROS',
    '258 - OSFATLVF - LUZ Y FUERZA',
    '631 - SANCOR SALUD - PLANES 800',
    '632 - OSPSA - OBRA SOCIAL DEL PERSONAL DE LA SANIDAD ARGENTINA',
    '633 - EMA SALUD S.A.S.',
    '635 - HOSPITAL DE DIA PLENIA S.R.L. (AVERA)',
    '639 - OSDEPYM',
    '641 - ITER MEDICINA S.A.',
    '642 - FEDERADA SALUD',
    '643 - NOBIS S.A.',
    '644 - OSSACRA',
    '645 - PICO - DISEÑO Y ASOC. S.R.L. (HIGEA SALUD)',
    '647 - ROISA (DOCTORED)',
    '650 - BRAMED',
    '652 - EPIC SRL',
    '653 - OSPIP',
    '654 - OSPATCA',
    '655 - OSSEG',
];
