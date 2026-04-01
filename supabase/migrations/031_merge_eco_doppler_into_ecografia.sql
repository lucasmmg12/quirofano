-- Migración: Unificar eco_doppler dentro de ecografia
-- Todas las prácticas que tenían categoría 'eco_doppler' pasan a 'ecografia'

UPDATE nomenclador
SET categoria = 'ecografia'
WHERE categoria = 'eco_doppler';
