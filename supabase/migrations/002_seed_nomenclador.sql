-- ============================================================
-- SEED: Nomenclador de Prácticas Médicas
-- Datos oficiales del Sanatorio Argentino
-- ============================================================

INSERT INTO nomenclador (code, name, category, custom_field, custom_label) VALUES
-- PRÓRROGA
('PRORR', 'Solicito autorización de prórroga por (número de días) desde fecha indicada', 'prorroga', 'days', 'Cantidad de días'),

-- NEONATAL
('NEO', 'Solicito atención de Recién Nacido', 'neonatal', NULL, NULL),

-- ANESTESIA
('ANEST-III', 'Solicito bloqueo de Anestesia complejidad III', 'anestesia', NULL, NULL),
('ANEST-COMP', 'Solicito autorización de complejidad de anestesia', 'anestesia', 'roman', 'Complejidad (I al IX en romanos)'),

-- LABORATORIO
('LAB-GF', 'Grupo y Factor', 'laboratorio', NULL, NULL),

-- HEMOTERAPIA
('HEMO', 'Estudio inmunohematológico', 'hemoterapia', NULL, NULL),

-- CARDIOLOGÍA
('420303+180130', 'Interconsulta + Ecocardiograma', 'cardiologia', NULL, NULL),
('170101+420301', 'Interconsulta + ECG', 'cardiologia', NULL, NULL),
('170113', 'Valoración riesgo cardiovascular prequirúrgica', 'cardiologia', NULL, NULL),

-- INTERCONSULTA
('420303', 'Interconsulta de', 'interconsulta', 'specialty', 'Especialidad (escribir manualmente)'),

-- BIOPSIA
('PROMAC', 'PROMAC - Estudio anatomopatológico', 'biopsia', NULL, NULL),
('PROMAB', 'PROMAB - Estudio anatomopatológico', 'biopsia', NULL, NULL),
('PROMAA', 'PROMAA - Estudio anatomopatológico', 'biopsia', NULL, NULL),
('150104', 'Estudio anatomopatológico', 'biopsia', NULL, NULL),
('150103', 'Estudio anatomopatológico', 'biopsia', NULL, NULL),
('150102', 'Estudio anatomopatológico', 'biopsia', NULL, NULL),

-- INSTRUMENTOS QUIRÚRGICOS
('06.01.15', 'Uso de sistema gamma probe', 'instrumentos', NULL, NULL),
('10.7.6', 'Ansa Bipolar', 'instrumentos', NULL, NULL),
('081010', 'Bisturí Armónico', 'instrumentos', NULL, NULL),

-- KINESIOLOGÍA
('KIN', 'Sesión de Kinesioterapia', 'kinesiologia', NULL, NULL),

-- RADIOLOGÍA
('340907', 'Radioscopía', 'radiologia', NULL, NULL),
('340905', 'Radiografía en Internado', 'radiologia', NULL, NULL),
('340103', 'Radioscopía con circuito cerrado de TV', 'radiologia', NULL, NULL),
('340110', 'Densitometría ósea total', 'radiologia', NULL, NULL),
('340201', 'Radiografía de cráneo, cara, senos paranasales', 'radiologia', NULL, NULL),
('340202', 'Radiografía de cráneo (p/ exp. subsiguiente)', 'radiologia', NULL, NULL),
('340203', 'Radiografía de huesos temporal o agujero óptico', 'radiologia', NULL, NULL),
('340209', 'Radiografía de raquis -columna- primera', 'radiologia', NULL, NULL),
('340210', 'Por exposición subsiguiente B', 'radiologia', NULL, NULL),
('340211', 'Radiografía de hombro, húmero, pelvis, caderas, fémur', 'radiologia', NULL, NULL),
('340212', 'Exposición subsiguiente A', 'radiologia', NULL, NULL),
('340213', 'Radiografía de codo, antebrazo, muñeca, mano, dedos, rodilla, pierna, tobillo, pie, dedos', 'radiologia', NULL, NULL),
('340217', 'Por exposición subsiguiente A', 'radiologia', NULL, NULL),
('340301', 'Radiografía o telerradiografía de tórax', 'radiologia', NULL, NULL),
('340302', 'Por exposición subsiguiente A (tórax)', 'radiologia', NULL, NULL),
('340421', 'Radiografía directa de abdomen', 'radiologia', NULL, NULL),
('340422', 'Radiografía por exp. subsiguiente (abdomen)', 'radiologia', NULL, NULL),
('340601', 'Mamografía unilateral', 'radiologia', NULL, NULL),
('340602', 'Mamografía bilateral', 'radiologia', NULL, NULL),

-- ECOGRAFÍA
('340416x2', 'Colangiografía intraoperatoria (x2)', 'ecografia', NULL, NULL),
('340416+340417', 'Colangiografía intraoperatoria', 'ecografia', NULL, NULL),
('180104', 'Ecografía tocoginecológica', 'ecografia', NULL, NULL),
('180105', 'Ecografía obstétrica', 'ecografia', NULL, NULL),
('180106', 'Ecografía mamaria uni o bilateral', 'ecografia', NULL, NULL),
('180107', 'Ecografía cerebral (con modo B y A)', 'ecografia', NULL, NULL),
('180108', 'Ecografía de caderas (pediátrico)', 'ecografia', NULL, NULL),
('180110', 'Ecografía tiroides', 'ecografia', NULL, NULL),
('180111', 'Ecografía testicular', 'ecografia', NULL, NULL),
('180112', 'Ecografía completa de abdomen', 'ecografia', NULL, NULL),
('180113', 'Ecografía hepática, biliar, esplénica o torácica', 'ecografia', NULL, NULL),
('180114', 'Ecografía de vejiga o próstata', 'ecografia', NULL, NULL),
('180116', 'Ecografía renal bilateral', 'ecografia', NULL, NULL),
('180122', 'Ecografía transvaginal o transrectal', 'ecografia', NULL, NULL),
('180123', 'Ecografía de partes blandas', 'ecografia', NULL, NULL),
('180126', 'Ecografía de glándulas parótidas', 'ecografia', NULL, NULL),
('180127', 'Punción guiada por imágenes', 'ecografia', NULL, NULL),
('180128', 'Marcación con guía ecográfica', 'ecografia', NULL, NULL),
('180136', 'Ecografía lumbosacra', 'ecografia', NULL, NULL),
('180204', 'Ecografía obstétrica con translucencia nucal', 'ecografia', NULL, NULL),
('180204B', 'Diferencia ecografía obstétrica con translucencia nucal', 'ecografia', NULL, NULL),
('180205', 'Ecografía obstétrica 4D o 5D', 'ecografia', NULL, NULL),
('180206', 'Scan morfológico fetal', 'ecografia', NULL, NULL),
('180206B', 'Diferencia scan morfológico fetal', 'ecografia', NULL, NULL),
('180207', 'Ecografía en habitación', 'ecografia', NULL, NULL),

-- ECO DOPPLER
('180130', 'Eco Doppler pulsado color cardiopatías', 'eco_doppler', NULL, NULL),
('180134', 'Eco Doppler color de miembros', 'eco_doppler', NULL, NULL),
('180135', 'Eco Doppler color otras regiones', 'eco_doppler', NULL, NULL),
('180136D', 'Eco Doppler color obstétrico', 'eco_doppler', NULL, NULL),

-- GINECOLOGÍA
('220101', 'Colposcopía', 'ginecologia', NULL, NULL),
('220202', 'Monitoreo fetal', 'ginecologia', NULL, NULL),

-- TOMOGRAFÍA
('340012', 'Tomografía computada reconstrucción 3D', 'tomografia', NULL, NULL),
('340015', 'Tomografía computada alta resolución', 'tomografia', NULL, NULL),
('341001', 'Tomografía cerebral', 'tomografia', NULL, NULL),
('341004', 'Tomografía de macizo facial', 'tomografia', NULL, NULL),
('341005', 'Tomografía de cuello', 'tomografia', NULL, NULL),
('341008', 'Tomografía de abdomen', 'tomografia', NULL, NULL),
('341009', 'Tomografía de pelvis', 'tomografia', NULL, NULL),
('341010', 'Tomografía torácica', 'tomografia', NULL, NULL),
('341012', 'Tomografía de otros órganos o regiones', 'tomografia', NULL, NULL),
('341013', 'Tomografía de columna por área', 'tomografia', NULL, NULL),
('341014', 'Contraste oral E.V.', 'tomografia', NULL, NULL),
('341016', 'Guía para punción o drenaje bajo TC (gastos)', 'tomografia', NULL, NULL),
('341016-H', 'Punción guiada por TC (honorarios)', 'tomografia', NULL, NULL),
('341017', 'Guía para bloqueo radicular (gastos)', 'tomografia', NULL, NULL),
('341018', 'Tomografía de rodilla con medición', 'tomografia', NULL, NULL),
('341019', 'Angiotomografía (por área)', 'tomografia', NULL, NULL),
('341020', 'Cardio TC', 'tomografia', NULL, NULL),
('341021', 'Scan de calcio', 'tomografia', NULL, NULL),
('341022', 'Endoscopía virtual', 'tomografia', NULL, NULL),
('341023', 'Urotomografía', 'tomografia', NULL, NULL),
('341024', 'TC corporal de baja dosis', 'tomografia', NULL, NULL),
('341025', 'Adicional por estudio con anestesia', 'tomografia', NULL, NULL),
('341028', 'TC trifásica', 'tomografia', NULL, NULL)

ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  custom_field = EXCLUDED.custom_field,
  custom_label = EXCLUDED.custom_label,
  updated_at = NOW();
