/**
 * Serie histórica mensual de cirugías según Estado de Asistencia en SALUS (dbo.TABLEAU_Cirugias + dbo.VLISE_Visitas)
 * Período: Enero 2025 – Noviembre 2026
 * Reglas de Gobernanza Aplicadas:
 * 1. Excluye Agenda 'HEMOTERAPIA' y '() COLOCACION DE MEDICAMENTO' (Pasajes de Hierro ambulatorios).
 * 2. Excluye prácticas menores de 'SUTURA' y pacientes ficticios 'BLOQUE%'.
 * 3. Unifica Sala de Partos dentro de QUIRÓFANOS CENTRALES.
 * 4. Incluye en HEMODINAMIA únicamente procedimientos con Anestesia (Anestesista IS NOT NULL).
 */
export const SALUS_QUIROFANO_ASISTENCIA_MENSUAL = [
  {
    "mes": "2025-01",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 414
  },
  {
    "mes": "2025-01",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 55
  },
  {
    "mes": "2025-01",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 16
  },
  {
    "mes": "2025-01",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 14
  },
  {
    "mes": "2025-01",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 47
  },
  {
    "mes": "2025-01",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Programada",
    "cant": 1
  },
  {
    "mes": "2025-01",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 1
  },
  {
    "mes": "2025-02",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 433
  },
  {
    "mes": "2025-02",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 49
  },
  {
    "mes": "2025-02",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 34
  },
  {
    "mes": "2025-02",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 11
  },
  {
    "mes": "2025-02",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "INTERNADO",
    "cant": 1
  },
  {
    "mes": "2025-02",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 120
  },
  {
    "mes": "2025-02",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 4
  },
  {
    "mes": "2025-02",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 1
  },
  {
    "mes": "2025-03",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 438
  },
  {
    "mes": "2025-03",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 46
  },
  {
    "mes": "2025-03",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 15
  },
  {
    "mes": "2025-03",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 12
  },
  {
    "mes": "2025-03",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 1
  },
  {
    "mes": "2025-03",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 105
  },
  {
    "mes": "2025-03",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 7
  },
  {
    "mes": "2025-04",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 455
  },
  {
    "mes": "2025-04",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 51
  },
  {
    "mes": "2025-04",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 23
  },
  {
    "mes": "2025-04",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 21
  },
  {
    "mes": "2025-04",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 1
  },
  {
    "mes": "2025-04",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 153
  },
  {
    "mes": "2025-04",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 8
  },
  {
    "mes": "2025-04",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 1
  },
  {
    "mes": "2025-05",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 488
  },
  {
    "mes": "2025-05",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 73
  },
  {
    "mes": "2025-05",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 29
  },
  {
    "mes": "2025-05",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 22
  },
  {
    "mes": "2025-05",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 5
  },
  {
    "mes": "2025-05",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "INTERNADO",
    "cant": 2
  },
  {
    "mes": "2025-05",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 158
  },
  {
    "mes": "2025-05",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 14
  },
  {
    "mes": "2025-05",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 3
  },
  {
    "mes": "2025-05",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 3
  },
  {
    "mes": "2025-06",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 421
  },
  {
    "mes": "2025-06",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 50
  },
  {
    "mes": "2025-06",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 19
  },
  {
    "mes": "2025-06",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 11
  },
  {
    "mes": "2025-06",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 1
  },
  {
    "mes": "2025-06",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 150
  },
  {
    "mes": "2025-06",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 14
  },
  {
    "mes": "2025-06",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 1
  },
  {
    "mes": "2025-06",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Programada",
    "cant": 1
  },
  {
    "mes": "2025-06",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "INTERNADO",
    "cant": 1
  },
  {
    "mes": "2025-06",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 1
  },
  {
    "mes": "2025-07",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 492
  },
  {
    "mes": "2025-07",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 58
  },
  {
    "mes": "2025-07",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 23
  },
  {
    "mes": "2025-07",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 19
  },
  {
    "mes": "2025-07",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 1
  },
  {
    "mes": "2025-07",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 191
  },
  {
    "mes": "2025-07",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 7
  },
  {
    "mes": "2025-07",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 7
  },
  {
    "mes": "2025-07",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 2
  },
  {
    "mes": "2025-08",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 493
  },
  {
    "mes": "2025-08",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 53
  },
  {
    "mes": "2025-08",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 20
  },
  {
    "mes": "2025-08",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 19
  },
  {
    "mes": "2025-08",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "INTERNADO",
    "cant": 2
  },
  {
    "mes": "2025-08",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 1
  },
  {
    "mes": "2025-08",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 220
  },
  {
    "mes": "2025-08",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 8
  },
  {
    "mes": "2025-08",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 1
  },
  {
    "mes": "2025-08",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 1
  },
  {
    "mes": "2025-09",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 4
  },
  {
    "mes": "2025-09",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 474
  },
  {
    "mes": "2025-09",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 38
  },
  {
    "mes": "2025-09",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 33
  },
  {
    "mes": "2025-09",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 23
  },
  {
    "mes": "2025-09",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 192
  },
  {
    "mes": "2025-09",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 14
  },
  {
    "mes": "2025-09",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 2
  },
  {
    "mes": "2025-09",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "INTERNADO",
    "cant": 1
  },
  {
    "mes": "2025-10",
    "grupo": "HEMODINAMIA",
    "asistencia": "SUSPENDIDA",
    "cant": 1
  },
  {
    "mes": "2025-10",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 443
  },
  {
    "mes": "2025-10",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 57
  },
  {
    "mes": "2025-10",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 37
  },
  {
    "mes": "2025-10",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 19
  },
  {
    "mes": "2025-10",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 178
  },
  {
    "mes": "2025-10",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 12
  },
  {
    "mes": "2025-10",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 2
  },
  {
    "mes": "2025-10",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 1
  },
  {
    "mes": "2025-11",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 1
  },
  {
    "mes": "2025-11",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 423
  },
  {
    "mes": "2025-11",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 39
  },
  {
    "mes": "2025-11",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 30
  },
  {
    "mes": "2025-11",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 14
  },
  {
    "mes": "2025-11",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 1
  },
  {
    "mes": "2025-11",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "INTERNADO",
    "cant": 1
  },
  {
    "mes": "2025-11",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 173
  },
  {
    "mes": "2025-11",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 7
  },
  {
    "mes": "2025-11",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 2
  },
  {
    "mes": "2025-11",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 1
  },
  {
    "mes": "2025-12",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 3
  },
  {
    "mes": "2025-12",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 446
  },
  {
    "mes": "2025-12",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 36
  },
  {
    "mes": "2025-12",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 30
  },
  {
    "mes": "2025-12",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 9
  },
  {
    "mes": "2025-12",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 3
  },
  {
    "mes": "2025-12",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 164
  },
  {
    "mes": "2025-12",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 13
  },
  {
    "mes": "2025-12",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 4
  },
  {
    "mes": "2025-12",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 1
  },
  {
    "mes": "2025-12",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "INTERNADO",
    "cant": 1
  },
  {
    "mes": "2026-01",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 440
  },
  {
    "mes": "2026-01",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 52
  },
  {
    "mes": "2026-01",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 32
  },
  {
    "mes": "2026-01",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 13
  },
  {
    "mes": "2026-01",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 2
  },
  {
    "mes": "2026-01",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 78
  },
  {
    "mes": "2026-01",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 4
  },
  {
    "mes": "2026-01",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 3
  },
  {
    "mes": "2026-01",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 1
  },
  {
    "mes": "2026-01",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "MARCAR LLEGADA",
    "cant": 1
  },
  {
    "mes": "2026-02",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 3
  },
  {
    "mes": "2026-02",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 416
  },
  {
    "mes": "2026-02",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 45
  },
  {
    "mes": "2026-02",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 37
  },
  {
    "mes": "2026-02",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 8
  },
  {
    "mes": "2026-02",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 147
  },
  {
    "mes": "2026-02",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 3
  },
  {
    "mes": "2026-02",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 3
  },
  {
    "mes": "2026-02",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 1
  },
  {
    "mes": "2026-02",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "INTERNADO",
    "cant": 1
  },
  {
    "mes": "2026-03",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 5
  },
  {
    "mes": "2026-03",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 434
  },
  {
    "mes": "2026-03",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 52
  },
  {
    "mes": "2026-03",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 28
  },
  {
    "mes": "2026-03",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 11
  },
  {
    "mes": "2026-03",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 2
  },
  {
    "mes": "2026-03",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 163
  },
  {
    "mes": "2026-03",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 12
  },
  {
    "mes": "2026-03",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 5
  },
  {
    "mes": "2026-04",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 6
  },
  {
    "mes": "2026-04",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 429
  },
  {
    "mes": "2026-04",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 42
  },
  {
    "mes": "2026-04",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 40
  },
  {
    "mes": "2026-04",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 25
  },
  {
    "mes": "2026-04",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 158
  },
  {
    "mes": "2026-04",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 5
  },
  {
    "mes": "2026-04",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 3
  },
  {
    "mes": "2026-04",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 3
  },
  {
    "mes": "2026-05",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 420
  },
  {
    "mes": "2026-05",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 46
  },
  {
    "mes": "2026-05",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 31
  },
  {
    "mes": "2026-05",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 14
  },
  {
    "mes": "2026-05",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "INTERNADO",
    "cant": 3
  },
  {
    "mes": "2026-05",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 169
  },
  {
    "mes": "2026-05",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 11
  },
  {
    "mes": "2026-05",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 5
  },
  {
    "mes": "2026-05",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "INTERNADO",
    "cant": 1
  },
  {
    "mes": "2026-06",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 7
  },
  {
    "mes": "2026-06",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 442
  },
  {
    "mes": "2026-06",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 51
  },
  {
    "mes": "2026-06",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 47
  },
  {
    "mes": "2026-06",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 14
  },
  {
    "mes": "2026-06",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 174
  },
  {
    "mes": "2026-06",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 7
  },
  {
    "mes": "2026-06",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 6
  },
  {
    "mes": "2026-06",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 2
  },
  {
    "mes": "2026-06",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "INTERNADO",
    "cant": 1
  },
  {
    "mes": "2026-07",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 1
  },
  {
    "mes": "2026-07",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 444
  },
  {
    "mes": "2026-07",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 50
  },
  {
    "mes": "2026-07",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 48
  },
  {
    "mes": "2026-07",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 27
  },
  {
    "mes": "2026-07",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 156
  },
  {
    "mes": "2026-07",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 7
  },
  {
    "mes": "2026-07",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 2
  },
  {
    "mes": "2026-07",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 1
  },
  {
    "mes": "2026-08",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 5
  },
  {
    "mes": "2026-08",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 421
  },
  {
    "mes": "2026-08",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 44
  },
  {
    "mes": "2026-08",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 37
  },
  {
    "mes": "2026-08",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 13
  },
  {
    "mes": "2026-08",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 171
  },
  {
    "mes": "2026-08",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 5
  },
  {
    "mes": "2026-08",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 5
  },
  {
    "mes": "2026-08",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 1
  },
  {
    "mes": "2026-09",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 5
  },
  {
    "mes": "2026-09",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 438
  },
  {
    "mes": "2026-09",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 37
  },
  {
    "mes": "2026-09",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 24
  },
  {
    "mes": "2026-09",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 13
  },
  {
    "mes": "2026-09",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 191
  },
  {
    "mes": "2026-09",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 8
  },
  {
    "mes": "2026-09",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 7
  },
  {
    "mes": "2026-09",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 2
  },
  {
    "mes": "2026-10",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 2
  },
  {
    "mes": "2026-10",
    "grupo": "HEMODINAMIA",
    "asistencia": "NO PROGRAMADA",
    "cant": 1
  },
  {
    "mes": "2026-10",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 458
  },
  {
    "mes": "2026-10",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 45
  },
  {
    "mes": "2026-10",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 27
  },
  {
    "mes": "2026-10",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 20
  },
  {
    "mes": "2026-10",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 1
  },
  {
    "mes": "2026-10",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 212
  },
  {
    "mes": "2026-10",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 12
  },
  {
    "mes": "2026-10",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 2
  },
  {
    "mes": "2026-10",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 1
  },
  {
    "mes": "2026-11",
    "grupo": "HEMODINAMIA",
    "asistencia": "Presente",
    "cant": 2
  },
  {
    "mes": "2026-11",
    "grupo": "HEMODINAMIA",
    "asistencia": "Programada",
    "cant": 2
  },
  {
    "mes": "2026-11",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Presente",
    "cant": 172
  },
  {
    "mes": "2026-11",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "Programada",
    "cant": 153
  },
  {
    "mes": "2026-11",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "NO PROGRAMADA",
    "cant": 24
  },
  {
    "mes": "2026-11",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "URGENCIA",
    "cant": 17
  },
  {
    "mes": "2026-11",
    "grupo": "QUIRÓFANOS CENTRALES",
    "asistencia": "SUSPENDIDA",
    "cant": 11
  },
  {
    "mes": "2026-11",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Presente",
    "cant": 79
  },
  {
    "mes": "2026-11",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "Programada",
    "cant": 63
  },
  {
    "mes": "2026-11",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "NO PROGRAMADA",
    "cant": 4
  },
  {
    "mes": "2026-11",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "SUSPENDIDA",
    "cant": 3
  },
  {
    "mes": "2026-11",
    "grupo": "QUIRÓFANOS HdD",
    "asistencia": "URGENCIA",
    "cant": 1
  }
];
