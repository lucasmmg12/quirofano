// auditoria-handler.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

/* =========================
   Tipos base
   ========================= */
interface DatosPaciente {
  nombre?: string;
  dni?: string;
  fecha_nacimiento?: string;
  sexo?: string;
  telefono?: string;
  direccion?: string;
  obra_social?: string;
  habitacion?: string;
  estaEnUCI: boolean;
  errores_admision: string[];
}

interface Evolucion {
  fecha: string;
  texto: string;
}

interface Advertencia {
  tipo: string;
  descripcion: string;
  fecha?: string;
}

interface Comunicacion {
  sector: string;
  responsable: string;
  motivo: string;
  urgencia: string;
  errores: string[];
  mensaje: string;
  matricula?: string;
}

interface Doctor {
  nombre: string;
  matricula?: string;
}

interface FojaQuirurgica {
  bisturi_armonico: string | null;
  equipo_quirurgico: Array<{ rol: string; nombre: string }>;
  fecha_cirugia: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  errores: string[];
}

interface ResultadosFoja {
  fojas: FojaQuirurgica[];
  errores_generales: string[];
}

interface DiaInternacion {
  fecha: string; // DD/MM/YYYY
  tieneEvolucion: boolean;
  tieneFojaQuirurgica: boolean;
  estudios: Array<{ tipo: string; categoria: string }>;
}

/* ======== NUEVO: Estudios ======== */
type CategoriaEstudio = "Imagenes" | "Laboratorio" | "Procedimientos";

interface Estudio {
  categoria: CategoriaEstudio;
  tipo: string;
  fecha?: string | null; // DD/MM/YYYY
  hora?: string | null; // HH:mm
  lugar?: string | null;
  resultado?: string | null;
  informe_presente: boolean;
  advertencias: string[];
  numero_hoja?: number; // Número de página donde se encontró el estudio
}

/* ======== NUEVO: Terapia Intensiva/Intermedia ======== */
interface CriterioTerapia {
  tipo: 'mayor' | 'menor';
  nombre: string;
  presente: boolean;
  evidencia?: string;
}

interface ClasificacionDiaTerapia {
  fecha: string;
  clasificacion: 'terapia_intensiva' | 'terapia_intermedia' | 'internacion_general' | 'no_corresponde_terapia';
  criteriosMayores: CriterioTerapia[];
  criteriosMenores: CriterioTerapia[];
  justificacion: string;
  errores: string[];
  advertencias: string[];
}

interface ResultadoTerapia {
  esTerapia: boolean;
  diasTerapiaIntensiva: number;
  diasTerapiaIntermedia: number;
  diasInternacionGeneral: number;
  clasificacionPorDia: ClasificacionDiaTerapia[];
  erroresGenerales: string[];
}

/* ======== NUEVO: Interconsultas ======== */
interface Interconsulta {
  fecha: string;
  hora?: string;
  especialidad: string;
  solicitante?: { nombre: string; matricula?: string };
  consultor: { nombre: string; matricula?: string };
  motivo: string;
  diagnostico?: string;
  practicas_realizadas: string[];
  indicaciones: string[];
  errores: string[];
}

/* ======== NUEVO: Prácticas Excluidas ======== */
interface PracticaExcluida {
  tipo: string;
  categoria: 'puncion' | 'cateter' | 'procedimiento_especial';
  fecha?: string;
  ubicacion_documento: 'evolucion' | 'foja_ambulatoria' | 'interconsulta';
  profesional?: { nombre: string; matricula?: string };
  requiere_autorizacion: boolean;
  facturacion_aparte: boolean;
  codigo_nomenclador?: string;
  advertencia: string;
}

/* ======== NUEVO: Endoscopías ======== */
interface FojaEndoscopia {
  tipo: 'endoscopia';
  procedimiento: string;
  fecha: string;
  hora_inicio?: string;
  hora_fin?: string;
  endoscopista: { nombre: string; matricula?: string };
  ayudante?: { nombre: string; matricula?: string };
  anestesista?: { nombre: string; matricula?: string };
  hallazgos?: string;
  biopsias: boolean;
  errores: string[];
}

/* ======== NUEVO: Prácticas Ambulatorias ======== */
interface PracticaAmbulatoria {
  tipo: string;
  fecha: string;
  hora?: string;
  profesional?: { nombre: string; matricula?: string };
  ubicacion: 'durante_internacion';
  requiere_autorizacion: boolean;
  errores: string[];
}

/* =========================
   Utilidades
   ========================= */
function normalizarTextoPDF(texto: string): string {
  texto = texto.replace(/\f/g, " ");
  texto = texto.replace(/\r\n/g, "\n");
  texto = texto.replace(/\r/g, "\n");
  const lineas = texto.split("\n");
  const lineasLimpias = lineas.map((l) => l.replace(/[ \t]+/g, " ").trim());
  texto = lineasLimpias.join("\n");
  texto = texto.replace(/^Página\s+\d+\s+de\s+\d+\s*$/gim, "");
  texto = texto.replace(/^Fecha\s+impresión:.*?$/gim, "");
  return texto;
}

// Construye fecha sin depender del parser de JS
function makeDate(d: string, hms?: string): Date {
  const [ddStr, mmStr, yyyyStr] = d.split("/");
  const dd = Number(ddStr);
  const mm = Number(mmStr);
  let yyyy = Number(yyyyStr);
  if (yyyy < 100) yyyy += 2000;
  let hh = 0,
    mi = 0,
    ss = 0;
  if (hms) {
    const parts = hms.split(":");
    hh = Number(parts[0] ?? 0);
    mi = Number(parts[1] ?? 0);
    ss = Number(parts[2] ?? 0);
  }
  return new Date(yyyy, mm - 1, dd, hh, mi, ss);
}

// Serializa en fecha y hora LOCAL con offset, evitando corrimientos de UTC
function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offHH = pad(Math.floor(abs / 60));
  const offMM = pad(abs % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${offHH}:${offMM}`;
}

function extractIngresoAlta(text: string): { ingreso: Date | null; alta: Date | null } {
  let ingreso: Date | null = null;
  let alta: Date | null = null;

  // Usamos el texto normalizado que PRESERVA los saltos de línea para evitar
  // unir "Fecha Alta:" vacío con una fecha de abajo.
  const textoLineas = normalizarTextoPDF(text).split('\n');

  // Regex más estrictas que asumen que el valor está en la misma línea o la siguiente inmediata
  const reIngreso = /(?:fecha\s+(?:de\s+)?ingreso|ingreso)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})(?:\s+(\d{1,2}:\d{2}))?/i;
  const reAlta = /(?:fecha\s+(?:de\s+)?alta|alta|egreso)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})(?:\s+(\d{1,2}:\d{2}))?/i;

  // Recorremos las primeras 200 líneas (donde suelen estar los encabezados)
  for (let i = 0; i < Math.min(textoLineas.length, 200); i++) {
    const linea = textoLineas[i].trim();

    if (!ingreso) {
      const m = linea.match(reIngreso);
      if (m) {
        const fecha = m[1];
        const hora = m[2];
        const dt = makeDate(fecha, hora);
        if (!Number.isNaN(dt.getTime())) {
          ingreso = dt;
        }
      }
    }

    if (!alta) {
      const m = linea.match(reAlta);
      if (m) {
        // Validación extra: asegurarse que no sea "Fecha Alta: Fecha Impresión: 20/02/2026"
        // Si hay etiquetas 'intrusas' entre 'Alta' y la fecha, probablemente es un falso positivo por concatenación visual
        // Pero aquí estamos procesando línea por línea, así que es más seguro.
        // Solo cuidamos que la fecha pertenezca al campo.
        const fecha = m[1];
        const hora = m[2];
        const dt = makeDate(fecha, hora);
        if (!Number.isNaN(dt.getTime())) {
          alta = dt;
        }
      }
    }
  }

  // Backup: Si no encontramos nada línea por línea, intentamos búsqueda global pero SIN colapasar agresivamente
  // Solo si es absolutamente necesario. Por ahora confiamos en la lectura línea a línea.

  return { ingreso, alta };
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Reglas:
 * - Egresado: ingreso incluido, alta EXCLUIDA.
 * - Internado: ingreso incluido, HOY incluido.
 * - Mismo día: 0 días.
 */
function diasHospitalizacionCalc(ingreso: Date, alta: Date | null): number {
  const MS_DIA = 1000 * 60 * 60 * 24;
  const si = startOfDay(ingreso);
  if (alta && !Number.isNaN(alta.getTime())) {
    const sa = startOfDay(alta);
    const diff = Math.floor((sa.getTime() - si.getTime()) / MS_DIA);
    return Math.max(0, diff);
  }
  const hoy = startOfDay(new Date());
  const diffIncluyendoHoy =
    Math.floor((hoy.getTime() - si.getTime()) / MS_DIA) + 1;
  return Math.max(1, diffIncluyendoHoy);
}

/* =========================
   Extracción de datos del paciente
   ========================= */
function extraerDatosPaciente(texto: string): DatosPaciente {
  const datos: DatosPaciente = { errores_admision: [], estaEnUCI: false };
  const tx = normalizarTextoPDF(texto);
  const lineas = tx.split("\n");
  const textoInicial = lineas.slice(0, 120).join("\n");

  const patronesNombre = [
    /nombre[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,]+)/i,
    /paciente[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,]+)/i,
    /apellido[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,]+)/i,
  ];
  for (const patron of patronesNombre) {
    const m = textoInicial.match(patron);
    if (m && m[1].trim().length > 3) {
      datos.nombre = m[1].trim();
      break;
    }
  }
  if (!datos.nombre) datos.errores_admision.push("Nombre del paciente no encontrado");

  const patronesDni = [/dni[:\s]*(\d{7,8})/i, /documento[:\s]*(\d{7,8})/i];
  for (const patron of patronesDni) {
    const m = textoInicial.match(patron);
    if (m) {
      datos.dni = m[1];
      break;
    }
  }
  if (!datos.dni) datos.errores_admision.push("DNI del paciente no encontrado");

  const nac = textoInicial.match(
    /fecha[:\s]*nacimiento[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i
  );
  if (nac) datos.fecha_nacimiento = nac[1];
  else datos.errores_admision.push("Fecha de nacimiento no encontrada");

  const mSexo = textoInicial.match(
    /sexo[:\s]*(mujer|hombre|femenino|masculino|f|m)/i
  );
  if (mSexo) {
    const s = mSexo[1].toLowerCase();
    if (s === "f" || s === "femenino") datos.sexo = "Femenino";
    else if (s === "m" || s === "masculino") datos.sexo = "Masculino";
    else datos.sexo = s.charAt(0).toUpperCase() + s.slice(1);
  } else datos.errores_admision.push("Sexo del paciente no especificado");

  const patronesOS = [
    /obra[\s_]*social[\s:]*(\d+[\s-]*[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+)/i,
    /obra[\s_]*social[\s:]*([A-Za-zÁÉÍÓÚáéíóúñÑ\s]+)/i,
  ];
  for (const p of patronesOS) {
    const m = textoInicial.match(p);
    if (m && m[1].trim().length > 2) {
      datos.obra_social = m[1].trim();
      break;
    }
  }
  if (!datos.obra_social) datos.obra_social = "No encontrada";

  const reHabGenerico =
    /habitación[:\s]*([A-Za-z0-9\s\-]+)|habitacion[:\s]*([A-Za-z0-9\s\-]+)|hab[:\s]*([A-Za-z0-9\s\-]+)|box[:\s]*([A-Za-z0-9\s\-]+)|sala[:\s]*([A-Za-z0-9\s\-]+)/i;

  let habMatch =
    textoInicial.match(reHabGenerico)?.slice(1).find(Boolean) || null;

  const matchBoxGlobal = tx.match(/box[:\s-]*([A-Za-z0-9\- ]+)/i);
  if (matchBoxGlobal) {
    const val = (matchBoxGlobal[0] || "").replace(/^.*?box[:\s-]*/i, "").trim();
    if (val) habMatch = `BOX ${val}`.replace(/\s+/g, " ").trim();
  } else if (!habMatch) {
    const mAll =
      tx.match(reHabGenerico)?.slice(1).find(Boolean) || null;
    if (mAll) habMatch = String(mAll).trim();
  }

  if (habMatch) {
    const raw = habMatch.replace(/[ ,]+-?$/, "").trim();
    datos.habitacion = /^box\b/i.test(raw) ? raw.toUpperCase() : raw;
  } else {
    datos.habitacion = "No encontrada";
  }

  // Detectar si el paciente está en UCI
  // Buscar en habitación y en todo el texto
  const patronesUCI = [
    /\bUCI\b/i,
    /\bUTI\b/i,
    /\bunidad\s+de\s+cuidados\s+intensivos\b/i,
    /\bcuidados\s+intensivos\b/i,
    /\bterapia\s+intensiva\b/i,
  ];

  // Verificar en la habitación
  if (datos.habitacion) {
    for (const patron of patronesUCI) {
      if (patron.test(datos.habitacion)) {
        datos.estaEnUCI = true;
        break;
      }
    }
  }

  // Si no se detectó en habitación, buscar en el texto completo
  if (!datos.estaEnUCI) {
    const textoCompleto = tx.toLowerCase();
    for (const patron of patronesUCI) {
      let match;
      const regex = new RegExp(patron.source, patron.flags + 'g');
      while ((match = regex.exec(textoCompleto)) !== null) {
        // Verificar que no sea solo una mención pasajera
        // Buscar contexto alrededor (habitación, sector, servicio)
        const inicio = Math.max(0, match.index - 100);
        const fin = Math.min(textoCompleto.length, match.index + match[0].length + 200);
        const contexto = textoCompleto.substring(inicio, fin);
        if (
          /habitaci[oó]n|sector|servicio|internado|ubicaci[oó]n|ubicado|paciente|ingreso/i.test(
            contexto
          )
        ) {
          datos.estaEnUCI = true;
          break;
        }
      }
      if (datos.estaEnUCI) break;
    }
  }

  return datos;
}

/* =========================
   Evoluciones
   ========================= */
function extraerEvolucionesMejorado(
  texto: string,
  ingreso: Date,
  alta: Date,
  estaEnUCI: boolean = false
): {
  errores: string[];
  evolucionesRepetidas: Evolucion[];
  advertencias: Advertencia[];
  diasConEvolucion: Set<string>;
} {
  const textoNormalizado = normalizarTextoPDF(texto);
  const errores: string[] = [];
  const evolucionesRepetidas: Evolucion[] = [];
  const advertencias: Advertencia[] = [];
  const diasConEvolucion = new Set<string>();

  const patronVisita =
    /visita[\s_]+(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+\d{1,2}:\d{2})?/gi;

  // Patrones base para evoluciones diarias
  const patronesEvolDiaria = [
    /evolución[\s_\n]+médica[\s_\n]+diaria/i,
    /evolución[\s_\n]+medica[\s_\n]+diaria/i,
    /evolucion[\s_\n]+médica[\s_\n]+diaria/i,
    /evolucion[\s_\n]+medica[\s_\n]+diaria/i,
    /evol[\s_\n]+médica[\s_\n]+diaria/i,
    /evol[\s_\n]+medica[\s_\n]+diaria/i,
    /evolución[\s_\n]+diaria/i,
    /evolucion[\s_\n]+diaria/i,
  ];

  // Si está en UCI, agregar patrones específicos para UCI
  if (estaEnUCI) {
    patronesEvolDiaria.push(
      /UCI[\s\-_]*Hoja[\s\-_]*de[\s\-_]*Evolucion/i,
      /UCI[\s\-_]*Hoja[\s\-_]*de[\s\-_]*Evoluci[oó]n/i,
      /UTI[\s\-_]*Hoja[\s\-_]*de[\s\-_]*Evolucion/i,
      /UTI[\s\-_]*Hoja[\s\-_]*de[\s\-_]*Evoluci[oó]n/i,
      /UCI[\s\-_]*[\-]*[\s\-_]*Hoja[\s\-_]*Evolucion/i,
      /UCI[\s\-_]*[\-]*[\s\-_]*Hoja[\s\-_]*Evoluci[oó]n/i,
      /hoja[\s\-_]*de[\s\-_]*evolucion[\s\-_]*UCI/i,
      /hoja[\s\-_]*de[\s\-_]*evoluci[oó]n[\s\-_]*UCI/i,
      /hoja[\s\-_]*de[\s\-_]*evolucion[\s\-_]*UTI/i,
      /hoja[\s\-_]*de[\s\-_]*evoluci[oó]n[\s\-_]*UTI/i
    );
  }

  const visitasEncontradas: Array<{ fecha: string; posicion: number }> = [];
  let match;
  while ((match = patronVisita.exec(textoNormalizado)) !== null) {
    visitasEncontradas.push({ fecha: match[1], posicion: match.index });
  }

  const fechaAdmisionDate = ingreso;
  const fechaAltaDate = alta;
  const visitasPorFecha = new Map<string, number>();

  for (const v of visitasEncontradas) {
    const fechaStr = v.fecha;
    const posicion = v.posicion;
    try {
      const [d, m, a] = fechaStr.split("/");
      const fechaVisita = new Date(`${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
      if (
        fechaVisita >= new Date(fechaAdmisionDate.toDateString()) &&
        fechaVisita <= new Date(fechaAltaDate.toDateString())
      ) {
        visitasPorFecha.set(fechaStr, (visitasPorFecha.get(fechaStr) || 0) + 1);
        const bloque = textoNormalizado.substring(posicion, posicion + 2000);
        for (const p of patronesEvolDiaria) {
          if (bloque.match(p)) {
            diasConEvolucion.add(fechaStr);
            break;
          }
        }
      }
    } catch { }
  }

  const fechasYa = new Set<string>();
  for (const [fechaStr] of visitasPorFecha) {
    if (fechasYa.has(fechaStr)) continue;
    fechasYa.add(fechaStr);
    try {
      const [d, m, a] = fechaStr.split("/");
      const f = new Date(`${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
      if (!diasConEvolucion.has(fechaStr)) {
        if (f.getTime() === new Date(fechaAdmisionDate.toDateString()).getTime()) {
          // día de admisión: ok
        } else if (f.getTime() === new Date(fechaAltaDate.toDateString()).getTime()) {
          advertencias.push({
            tipo: "Día de alta sin evolución",
            descripcion: `⚠️ ADVERTENCIA: ${fechaStr} - Día de alta, usualmente no requiere evolución diaria`,
            fecha: fechaStr,
          });
        } else {
          const nombreEvolucion = estaEnUCI
            ? "'UCI - Hoja de Evolucion' o 'Evolución médica diaria'"
            : "'Evolución médica diaria'";
          errores.push(`❌ CRÍTICO: ${fechaStr} - Falta ${nombreEvolucion}`);
        }
      }
    } catch { }
  }

  // ========= NUEVO: Verificación día por día de todos los días de internación =========
  // Generar todos los días desde ingreso hasta alta
  const todosLosDias: string[] = [];
  const inicio = startOfDay(fechaAdmisionDate);
  const fin = startOfDay(fechaAltaDate);
  const MS_DIA = 1000 * 60 * 60 * 24;

  let fechaActual = new Date(inicio);
  while (fechaActual <= fin) {
    const dia = String(fechaActual.getDate()).padStart(2, "0");
    const mes = String(fechaActual.getMonth() + 1).padStart(2, "0");
    const anio = fechaActual.getFullYear();
    todosLosDias.push(`${dia}/${mes}/${anio}`);
    fechaActual = new Date(fechaActual.getTime() + MS_DIA);
  }

  // Para cada día del rango, buscar si existe evolución en el texto
  const diasVerificados = new Set<string>();

  for (const fechaStr of todosLosDias) {
    // Evitar duplicar errores ya reportados por la lógica anterior
    if (diasVerificados.has(fechaStr)) continue;
    diasVerificados.add(fechaStr);

    try {
      const [d, m, a] = fechaStr.split("/");
      const fechaDia = new Date(`${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
      const fechaDiaInicio = startOfDay(fechaDia);
      const fechaDiaFin = new Date(fechaDiaInicio.getTime() + MS_DIA - 1);

      // Buscar evolución para este día de múltiples formas:
      // 1. Buscar "visita" con esta fecha (método original que funcionaba)
      // 2. Buscar fecha cerca de patrones de evolución
      // 3. Buscar patrones de evolución y luego verificar si hay fecha cerca

      let tieneEvolucion = false;

      // Método 1: Buscar "visita" con esta fecha (más confiable)
      const patronVisitaConFecha = new RegExp(
        `visita[\\s_]+${fechaStr.replace(/\//g, "[\\s/]")}(?:[\\s]+\\d{1,2}:\\d{2})?`,
        "gi"
      );
      let matchVisita;
      while ((matchVisita = patronVisitaConFecha.exec(textoNormalizado)) !== null) {
        const posicionVisita = matchVisita.index;
        const bloqueVisita = textoNormalizado.substring(posicionVisita, posicionVisita + 2000);
        for (const patronEvol of patronesEvolDiaria) {
          if (patronEvol.test(bloqueVisita)) {
            tieneEvolucion = true;
            diasConEvolucion.add(fechaStr);
            break;
          }
        }
        if (tieneEvolucion) break;
      }

      // Método 2: Buscar fecha cerca de evoluciones (si no se encontró con método 1)
      if (!tieneEvolucion) {
        // Variaciones del formato de fecha
        const variacionesFecha = [
          fechaStr, // DD/MM/YYYY
          `${d}/${m}/${a}`, // Sin padding
          `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${a}`, // Con padding
          `${d}\\s*/\\s*${m}\\s*/\\s*${a}`, // Con espacios opcionales
        ];

        for (const fechaVariante of variacionesFecha) {
          const patronFecha = new RegExp(
            `(?:${fechaVariante.replace(/\//g, "[\\s/]")})`,
            "gi"
          );
          let matchFecha;

          while ((matchFecha = patronFecha.exec(textoNormalizado)) !== null) {
            const posicionFecha = matchFecha.index;
            // Buscar en un rango más amplio (3000 caracteres) alrededor de la fecha
            const inicioBusqueda = Math.max(0, posicionFecha - 1000);
            const finBusqueda = Math.min(
              textoNormalizado.length,
              posicionFecha + matchFecha[0].length + 2000
            );
            const bloqueAlrededor = textoNormalizado.substring(inicioBusqueda, finBusqueda);

            // Verificar si en este bloque hay algún patrón de evolución
            for (const patronEvol of patronesEvolDiaria) {
              if (patronEvol.test(bloqueAlrededor)) {
                tieneEvolucion = true;
                diasConEvolucion.add(fechaStr);
                break;
              }
            }
            if (tieneEvolucion) break;
          }
          if (tieneEvolucion) break;
        }
      }

      // Método 3: Buscar evoluciones y luego verificar fecha cerca (último recurso)
      if (!tieneEvolucion) {
        for (const patronEvol of patronesEvolDiaria) {
          let matchEvol;
          const regexEvol = new RegExp(patronEvol.source, patronEvol.flags + 'g');
          while ((matchEvol = regexEvol.exec(textoNormalizado)) !== null) {
            const posicionEvol = matchEvol.index;
            // Buscar fecha en un rango alrededor de la evolución
            const inicioBusqueda = Math.max(0, posicionEvol - 1500);
            const finBusqueda = Math.min(
              textoNormalizado.length,
              posicionEvol + matchEvol[0].length + 500
            );
            const bloqueAlrededor = textoNormalizado.substring(inicioBusqueda, finBusqueda);

            // Buscar la fecha en este bloque
            const patronFechaEnBloque = new RegExp(
              `(?:${fechaStr.replace(/\//g, "[\\s/]")}|${d}[\\s/]+${m}[\\s/]+${a})`,
              "gi"
            );
            if (patronFechaEnBloque.test(bloqueAlrededor)) {
              tieneEvolucion = true;
              diasConEvolucion.add(fechaStr);
              break;
            }
          }
          if (tieneEvolucion) break;
        }
      }

      // Si no se encontró evolución para este día, verificar si es día de admisión o alta
      if (!tieneEvolucion && !diasConEvolucion.has(fechaStr)) {
        const esDiaAdmision =
          fechaDiaInicio.getTime() === startOfDay(fechaAdmisionDate).getTime();
        const esDiaAlta =
          fechaDiaInicio.getTime() === startOfDay(fechaAltaDate).getTime();

        if (esDiaAdmision) {
          // Día de admisión: generalmente no requiere evolución diaria
          // No agregar error
        } else if (esDiaAlta) {
          // Día de alta: verificar si ya se agregó advertencia
          const yaTieneAdvertencia = advertencias.some(
            (a) => a.fecha === fechaStr && a.tipo === "Día de alta sin evolución"
          );
          if (!yaTieneAdvertencia) {
            advertencias.push({
              tipo: "Día de alta sin evolución",
              descripcion: `⚠️ ADVERTENCIA: ${fechaStr} - Día de alta, usualmente no requiere evolución diaria`,
              fecha: fechaStr,
            });
          }
        } else {
          // Día intermedio sin evolución: error crítico
          const nombreEvolucion = estaEnUCI
            ? "'UCI - Hoja de Evolucion' o 'Evolución médica diaria'"
            : "'Evolución médica diaria'";

          // Verificar que no se haya agregado ya este error
          const yaTieneError = errores.some((e) => e.includes(fechaStr));
          if (!yaTieneError) {
            errores.push(`❌ CRÍTICO: ${fechaStr} - Falta ${nombreEvolucion}`);
          }
        }
      }
    } catch (error) {
      // Ignorar errores de parsing de fecha
    }
  }
  // ========= FIN NUEVO =========

  return { errores, evolucionesRepetidas, advertencias, diasConEvolucion };
}

/* =========================
   Alta médica / Epicrisis
   ========================= */
function verificarAltaMedica(texto: string): string[] {
  const errores: string[] = [];
  const ultimasLineas = texto.split("\n").slice(-500).join("\n");
  const patronesAlta = [
    /alta\s+médica/i,
    /alta\s+medica/i,
    /registro\s+de\s+alta/i,
    /egreso\s+sanatorial/i,
    /egreso\s+hospitalario/i,
    /discharge/i,
    /egreso/i,
  ];
  let ok = false;
  for (const p of patronesAlta) {
    if (ultimasLineas.match(p)) {
      ok = true;
      break;
    }
  }
  if (!ok) errores.push("❌ CRÍTICO: Falta registro de alta médica");
  return errores;
}

function verificarEpicrisis(texto: string): string[] {
  const errores: string[] = [];
  const lineas = texto.split("\n");
  const patrones = [/epicrisis/i, /epicrísis/i];

  const inicioUltimaHoja = Math.max(0, lineas.length - 400);
  const ult = lineas.slice(inicioUltimaHoja);
  let ok = false;
  for (const l of ult) {
    if (l.trim().length === 0) continue;
    for (const p of patrones) {
      if (p.test(l)) {
        ok = true;
        break;
      }
    }
    if (ok) break;
  }

  if (!ok) errores.push("⚠️ ADVERTENCIA: No se encontró documento de epicrisis");
  return errores;
}

/* =========================
   NUEVO: Terapia Intensiva/Intermedia
   Criterios basados en normativa médica oficial
   ========================= */

// Criterios MAYORES - Requieren UTI (Terapia Intensiva)
const PATRONES_CRITERIOS_MAYORES: Record<string, RegExp[]> = {
  // 1. INSUFICIENCIA RESPIRATORIA AGUDA
  ventilacion_mecanica_invasiva: [
    /ventilaci[oó]n\s+mec[aá]nica\s+invasiva/i,
    /\bVMI\b/i,
    /\bARM\b/i,  // Asistencia Respiratoria Mecánica
    /\bIOT\b/i,  // Intubación Orotraqueal
    /intubado/i,
    /tubo\s+endotraqueal/i,
  ],
  insuficiencia_respiratoria_grave: [
    /insuficiencia\s+respiratoria\s+aguda/i,
    /IRA\s+grave/i,
    /hipoxemia\s+severa/i,
    /hipercapnia/i,
    /agotamiento\s+respiratorio/i,
    /obstrucci[oó]n\s+grave\s+v[ií]a\s+a[eé]rea/i,
  ],
  asma_epoc_grave: [
    /asma\s+grave/i,
    /EPOC\s+grave/i,
    /exacerbaci[oó]n\s+severa/i,
    /status\s+asm[aá]tico/i,
  ],

  // 2. INESTABILIDAD HEMODINÁMICA / SHOCK
  shock: [
    /shock\s+(s[eé]ptico|cardiog[eé]nico|hipovolémico|obstructivo|anafiláctico)/i,
    /fallo\s+circulatorio/i,
    /colapso\s+hemodin[aá]mico/i,
  ],
  drogas_vasoactivas: [
    /noradrenalina/i,
    /adrenalina/i,
    /dopamina/i,
    /dobutamina/i,
    /vasopresina/i,
    /drogas\s+vasoactivas/i,
    /vasopresores/i,
    /inotr[oó]picos/i,
  ],
  arritmias_graves: [
    /arritmia\s+grave/i,
    /compromiso\s+hemodin[aá]mico/i,
    /fibrilaci[oó]n\s+ventricular/i,
    /taquicardia\s+ventricular/i,
    /bradicardia\s+severa/i,
  ],
  insuficiencia_cardiaca_aguda: [
    /insuficiencia\s+card[ií]aca\s+aguda/i,
    /edema\s+pulmonar/i,
    /bajo\s+gasto\s+card[ií]aco/i,
  ],

  // 3. DETERIORO NEUROLÓGICO AGUDO
  deterioro_conciencia: [
    /alteraci[oó]n\s+aguda\s+conciencia/i,
    /Glasgow\s*[≤<]\s*8/i,
    /GCS\s*[≤<]\s*8/i,
    /\bcoma\b/i,
    /deterioro\s+r[aá]pido/i,
  ],
  status_epileptico: [
    /status\s+epil[eé]ptico/i,
    /convulsiones\s+prolongadas/i,
    /crisis\s+convulsivas\s+refractarias/i,
  ],
  acv_grave: [
    /ACV\s+agudo/i,
    /accidente\s+cerebrovascular/i,
    /riesgo\s+de\s+herniaci[oó]n/i,
    /compromiso\s+v[ií]a\s+a[eé]rea/i,
  ],
  hipertension_intracraneal: [
    /aumento\s+presi[oó]n\s+intracraneal/i,
    /hipertensi[oó]n\s+endocraneana/i,
    /\bPIC\s+elevada/i,
  ],

  // 4. FALLO RENAL AGUDO GRAVE
  dialisis_urgencia: [
    /di[aá]lisis\s+de\s+urgencia/i,
    /hemodi[aá]lisis/i,
    /terapia\s+de\s+reemplazo\s+renal/i,
    /\bTRR\b/i,
    /sobrecarga\s+de\s+volumen/i,
    /hiperkalemia\s+severa/i,
    /acidosis\s+metab[oó]lica\s+severa/i,
  ],

  // 5. DISFUNCIÓN METABÓLICA/ENDOCRINA GRAVE
  cetoacidosis_diabetica: [
    /cetoacidosis\s+diab[eé]tica/i,
    /\bCAD\b/i,
    /estado\s+hiperosmolar/i,
    /acidosis\s+severa/i,
  ],
  alteraciones_electroliticas: [
    /hiperkalemia\s+severa/i,
    /hiponatremia\s+severa/i,
    /alteraciones\s+electrol[ií]ticas\s+extremas/i,
    /riesgo\s+de\s+arritmias/i,
  ],

  // 6. INSUFICIENCIA HEPÁTICA GRAVE
  insuficiencia_hepatica: [
    /insuficiencia\s+hep[aá]tica\s+aguda/i,
    /falla\s+hep[aá]tica\s+fulminante/i,
    /encefalopat[ií]a\s+hep[aá]tica/i,
  ],
};

// Criterios MENORES - Pueden requerir Terapia Intermedia o monitorización intensiva
const PATRONES_CRITERIOS_MENORES: Record<string, RegExp[]> = {
  // MONITORIZACIÓN INTENSIVA
  monitorizacion_invasiva: [
    /cat[eé]ter\s+arterial/i,
    /l[ií]nea\s+arterial/i,
    /cat[eé]ter\s+venoso\s+central/i,
    /\bCVC\b/i,
    /Swan-Ganz/i,
    /monitoreo\s+PIC/i,
    /monitoreo\s+hemodin[aá]mico\s+invasivo/i,
  ],

  // VENTILACIÓN NO INVASIVA
  vmni: [
    /ventilaci[oó]n\s+no\s+invasiva/i,
    /\bVMNI\b/i,
    /\bCPAP\b/i,
    /\bBiPAP\b/i,
    /c[aá]nula\s+de\s+alto\s+flujo/i,
  ],

  // POST-OPERATORIO DE ALTO RIESGO
  postoperatorio_alto_riesgo: [
    /postoperatorio\s+cirug[ií]a\s+card[ií]aca/i,
    /post\s+neurocirug[ií]a/i,
    /cirug[ií]a\s+grandes\s+vasos/i,
    /trasplante/i,
    /postoperatorio\s+inmediato/i,
    /cirug[ií]a\s+mayor/i,
  ],

  // POLITRAUMATISMO
  politraumatismo: [
    /politraumatismo/i,
    /trauma\s+grave/i,
    /m[uú]ltiples\s+lesiones/i,
    /TCE\s+grave/i,  // Traumatismo Craneoencefálico
  ],

  // QUEMADURAS GRAVES
  quemaduras: [
    /grandes\s+quemados/i,
    /quemaduras\s+extensas/i,
    /quemaduras\s+graves/i,
  ],

  // INTOXICACIONES
  intoxicacion_grave: [
    /intoxicaci[oó]n\s+grave/i,
    /sobredosis/i,
    /riesgo\s+vital/i,
  ],

  // SEPSIS (sin shock)
  sepsis_sin_shock: [
    /sepsis(?!\\s+grave|\\s+severa|\\s+shock)/i,
    /riesgo\s+de\s+shock\s+s[eé]ptico/i,
    /infecci[oó]n\s+grave/i,
  ],
};

function evaluarCriteriosTerapia(texto: string): {
  criteriosMayores: CriterioTerapia[];
  criteriosMenores: CriterioTerapia[];
} {
  const criteriosMayores: CriterioTerapia[] = [];
  const criteriosMenores: CriterioTerapia[] = [];

  // Evaluar criterios mayores
  for (const [nombre, patrones] of Object.entries(PATRONES_CRITERIOS_MAYORES)) {
    let presente = false;
    let evidencia = '';

    for (const patron of patrones) {
      const match = texto.match(patron);
      if (match) {
        presente = true;
        evidencia = match[0];
        break;
      }
    }

    criteriosMayores.push({
      tipo: 'mayor',
      nombre: nombre.replace(/_/g, ' '),
      presente,
      evidencia
    });
  }

  // Evaluar criterios menores
  for (const [nombre, patrones] of Object.entries(PATRONES_CRITERIOS_MENORES)) {
    let presente = false;
    let evidencia = '';

    for (const patron of patrones) {
      const match = texto.match(patron);
      if (match) {
        presente = true;
        evidencia = match[0];
        break;
      }
    }

    criteriosMenores.push({
      tipo: 'menor',
      nombre: nombre.replace(/_/g, ' '),
      presente,
      evidencia
    });
  }

  return { criteriosMayores, criteriosMenores };
}

function clasificarDiaTerapia(
  fecha: string,
  evolucionTexto: string
): ClasificacionDiaTerapia {
  const { criteriosMayores, criteriosMenores } = evaluarCriteriosTerapia(evolucionTexto);

  const mayoresPresentes = criteriosMayores.filter(c => c.presente).length;
  const menoresPresentes = criteriosMenores.filter(c => c.presente).length;

  let clasificacion: ClasificacionDiaTerapia['clasificacion'];
  let justificacion: string;
  const errores: string[] = [];
  const advertencias: string[] = [];

  // Lógica de clasificación
  if (mayoresPresentes >= 1) {
    // Con 1 o más criterios mayores → Terapia Intensiva
    clasificacion = 'terapia_intensiva';
    justificacion = `Cumple ${mayoresPresentes} criterio(s) mayor(es): ${criteriosMayores.filter(c => c.presente).map(c => c.nombre).join(', ')}`;
  } else if (menoresPresentes >= 2) {
    // Con 2 o más criterios menores → Terapia Intensiva
    clasificacion = 'terapia_intensiva';
    justificacion = `Cumple ${menoresPresentes} criterios menores: ${criteriosMenores.filter(c => c.presente).map(c => c.nombre).join(', ')}`;
  } else if (menoresPresentes === 1) {
    // Con 1 criterio menor → Terapia Intermedia
    clasificacion = 'terapia_intermedia';
    justificacion = `Cumple 1 criterio menor: ${criteriosMenores.filter(c => c.presente).map(c => c.nombre).join(', ')}`;
  } else {
    // Sin criterios → No corresponde a terapia
    clasificacion = 'internacion_general';
    justificacion = 'No cumple criterios de terapia intensiva ni intermedia';
  }

  return {
    fecha,
    clasificacion,
    criteriosMayores,
    criteriosMenores,
    justificacion,
    errores,
    advertencias
  };
}

function analizarTerapia(
  texto: string,
  ingreso: Date,
  alta: Date,
  estaEnUCI: boolean
): ResultadoTerapia {
  if (!estaEnUCI) {
    return {
      esTerapia: false,
      diasTerapiaIntensiva: 0,
      diasTerapiaIntermedia: 0,
      diasInternacionGeneral: 0,
      clasificacionPorDia: [],
      erroresGenerales: []
    };
  }

  const clasificacionPorDia: ClasificacionDiaTerapia[] = [];
  let diasTerapiaIntensiva = 0;
  let diasTerapiaIntermedia = 0;
  let diasInternacionGeneral = 0;

  // Generar todos los días de internación
  const todosLosDias: string[] = [];
  const inicio = startOfDay(ingreso);
  const fin = startOfDay(alta);
  const MS_DIA = 1000 * 60 * 60 * 24;

  let fechaActual = new Date(inicio);
  while (fechaActual <= fin) {
    const dia = String(fechaActual.getDate()).padStart(2, "0");
    const mes = String(fechaActual.getMonth() + 1).padStart(2, "0");
    const anio = fechaActual.getFullYear();
    todosLosDias.push(`${dia}/${mes}/${anio}`);
    fechaActual = new Date(fechaActual.getTime() + MS_DIA);
  }

  // Para cada día, buscar la evolución y clasificar
  const patronVisita = /visita\s+(\d{1,2}\/\d{1,2}\/\d{4})/gi;

  for (const fechaStr of todosLosDias) {
    // Buscar evolución de este día
    const regex = new RegExp(`visita\\s+${fechaStr.replace(/\//g, '\\/')}`, 'gi');
    let match = regex.exec(texto);

    if (match) {
      // Extraer el bloque de evolución (siguiente 2000 caracteres)
      const bloqueEvolucion = texto.substring(match.index, match.index + 2000);
      const clasificacion = clasificarDiaTerapia(fechaStr, bloqueEvolucion);
      clasificacionPorDia.push(clasificacion);

      // Contar días por tipo
      if (clasificacion.clasificacion === 'terapia_intensiva') {
        diasTerapiaIntensiva++;
      } else if (clasificacion.clasificacion === 'terapia_intermedia') {
        diasTerapiaIntermedia++;
      } else if (clasificacion.clasificacion === 'internacion_general') {
        diasInternacionGeneral++;
      }
    }
  }

  return {
    esTerapia: true,
    diasTerapiaIntensiva,
    diasTerapiaIntermedia,
    diasInternacionGeneral,
    clasificacionPorDia,
    erroresGenerales: []
  };
}

/* =========================
   NUEVO: Interconsultas
   ========================= */
const ESPECIALIDADES_MEDICAS = [
  'cardiología', 'neurología', 'neurocirugía', 'traumatología',
  'cirugía general', 'cirugía cardiovascular', 'infectología',
  'nefrología', 'gastroenterología', 'hematología', 'oncología',
  'neumología', 'endocrinología', 'reumatología', 'dermatología',
  'oftalmología', 'otorrinolaringología', 'urología', 'ginecología',
  'psiquiatría', 'clínica médica', 'medicina interna', 'anestesiología',
  'terapia intensiva', 'cuidados paliativos', 'nutrición'
];

function identificarEspecialidad(texto: string): string | null {
  const textoNorm = texto.toLowerCase().trim();

  // Primero intentar coincidencias exactas con límites de palabra
  for (const esp of ESPECIALIDADES_MEDICAS) {
    const patron = new RegExp(`\\b${esp}\\b`, 'i');
    if (patron.test(textoNorm)) {
      return esp.charAt(0).toUpperCase() + esp.slice(1);
    }
  }

  // Abreviaturas y variantes comunes (ordenadas por especificidad)
  const patronesEspecialidad: Array<[RegExp, string]> = [
    // Especialidades completas primero (más específicas)
    [/\bhematolog[ií]a\b/i, 'Hematología'],
    [/\bgastroenterolog[ií]a\b/i, 'Gastroenterología'],
    [/\bcardiolog[ií]a\b/i, 'Cardiología'],
    [/\bneurolog[ií]a\b/i, 'Neurología'],
    [/\btraumatolog[ií]a\b/i, 'Traumatología'],
    [/\binfectolog[ií]a\b/i, 'Infectología'],
    [/\bnefrolog[ií]a\b/i, 'Nefrología'],
    [/\boncolog[ií]a\b/i, 'Oncología'],
    [/\bneumolog[ií]a\b/i, 'Neumología'],
    [/\bendocrinolog[ií]a\b/i, 'Endocrinología'],
    [/\bdermatolog[ií]a\b/i, 'Dermatología'],
    [/\boftalmolog[ií]a\b/i, 'Oftalmología'],
    [/\botorrinolaringolog[ií]a\b/i, 'Otorrinolaringología'],
    [/\burolog[ií]a\b/i, 'Urología'],
    [/\bginecolog[ií]a\b/i, 'Ginecología'],
    [/\bpediatr[ií]a\b/i, 'Pediatría'],
    [/\bpsiquiatr[ií]a\b/i, 'Psiquiatría'],
    [/\banestesiolog[ií]a\b/i, 'Anestesiología'],
    [/\bradiolog[ií]a\b/i, 'Radiología'],
    [/\bcirug[ií]a\s+general\b/i, 'Cirugía General'],
    [/\bcirug[ií]a\s+cardiovascular\b/i, 'Cirugía Cardiovascular'],
    [/\bcirug[ií]a\s+tor[aá]cica\b/i, 'Cirugía Torácica'],
    [/\bterapia\s+intensiva\b/i, 'Terapia Intensiva'],
    [/\bmedicina\s+interna\b/i, 'Medicina Interna'],
    [/\bmedicina\s+familiar\b/i, 'Medicina Familiar'],

    // Abreviaturas (después de las completas)
    [/\bhemato\b/i, 'Hematología'],
    [/\bgastro\b/i, 'Gastroenterología'],
    [/\bcardio\b/i, 'Cardiología'],
    [/\bneuro\b/i, 'Neurología'],
    [/\btraumato\b/i, 'Traumatología'],
    [/\binfecto\b/i, 'Infectología'],
    [/\bnefro\b/i, 'Nefrología'],
    [/\bonco\b/i, 'Oncología'],
    [/\bneumo\b/i, 'Neumología'],
    [/\bendocrino\b/i, 'Endocrinología'],
    [/\bcir\s*gen\b/i, 'Cirugía General'],
    [/\buti\b/i, 'Terapia Intensiva'],
    [/\buci\b/i, 'Terapia Intensiva'],
    [/\borl\b/i, 'Otorrinolaringología'],
  ];

  // Buscar coincidencias en orden (las más específicas primero)
  for (const [patron, especialidad] of patronesEspecialidad) {
    if (patron.test(textoNorm)) {
      return especialidad;
    }
  }

  return null;
}

function extraerInterconsultas(texto: string): Interconsulta[] {
  const interconsultas: Interconsulta[] = [];
  const lineas = texto.split('\n');

  const PATRONES_INTERCONSULTA = [
    /interconsulta\s+(?:a\s+)?([a-záéíóúñ\s]+)/i,
    /consulta\s+(?:a\s+)?([a-záéíóúñ\s]+)/i,
    /evaluaci[oó]n\s+por\s+([a-záéíóúñ\s]+)/i,
    /valoraci[oó]n\s+por\s+([a-záéíóúñ\s]+)/i
  ];

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];

    for (const patron of PATRONES_INTERCONSULTA) {
      const match = linea.match(patron);
      if (match) {
        const especialidadCruda = match[1].trim();
        const especialidad = identificarEspecialidad(especialidadCruda);

        if (especialidad) {
          const bloqueInter = lineas.slice(i, i + 50).join('\n');

          // Extraer fecha
          const fechaMatch = bloqueInter.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
          const fecha = fechaMatch ? fechaMatch[1] : '';

          // Extraer hora
          const horaMatch = bloqueInter.match(/(\d{1,2}:\d{2})/);
          const hora = horaMatch ? horaMatch[1] : undefined;

          // Extraer consultor
          const consultorMatch = bloqueInter.match(/(?:consultor|m[eé]dico)[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,]{5,40})/i);
          const consultorNombre = consultorMatch ? consultorMatch[1].trim() : '';

          const matriculaMatch = bloqueInter.match(/(?:mp|mn|matr[ií]cula)[:\s]*(\d{3,6})/i);
          const matricula = matriculaMatch ? matriculaMatch[1] : undefined;

          // Extraer motivo
          const motivoMatch = bloqueInter.match(/motivo[:\s]*([^\n]{10,200})/i);
          const motivo = motivoMatch ? motivoMatch[1].trim() : '';

          // Extraer diagnóstico
          const diagnosticoMatch = bloqueInter.match(/diagn[oó]stico[:\s]*([^\n]{10,200})/i);
          const diagnostico = diagnosticoMatch ? diagnosticoMatch[1].trim() : undefined;

          const errores: string[] = [];
          if (!consultorNombre) errores.push('Falta nombre del médico consultor');
          if (!matricula) errores.push('Falta matrícula del médico consultor');
          if (!motivo) errores.push('Falta motivo de interconsulta');

          interconsultas.push({
            fecha,
            hora,
            especialidad,
            consultor: { nombre: consultorNombre, matricula },
            motivo,
            diagnostico,
            practicas_realizadas: [],
            indicaciones: [],
            errores
          });
        }
      }
    }
  }

  return interconsultas;
}

/* =========================
   NUEVO: Prácticas Excluidas
   ========================= */
const PRACTICAS_EXCLUIDAS_CONFIG = {
  punciones: [
    {
      patron: /punci[oó]n\s+lumbar/i,
      nombre: 'Punción lumbar',
      requiere_autorizacion: true,
      facturacion_aparte: true,
      codigo: '34.01.01'
    },
    {
      patron: /punci[oó]n\s+pleural|toracocentesis/i,
      nombre: 'Punción pleural / Toracocentesis',
      requiere_autorizacion: true,
      facturacion_aparte: true,
      codigo: '34.02.01'
    },
    {
      patron: /punci[oó]n\s+asc[ií]tica|paracentesis/i,
      nombre: 'Punción ascítica / Paracentesis',
      requiere_autorizacion: true,
      facturacion_aparte: true,
      codigo: '34.03.01'
    },
    {
      patron: /punci[oó]n\s+articular/i,
      nombre: 'Punción articular',
      requiere_autorizacion: true,
      facturacion_aparte: true
    }
  ],
  cateteres: [
    {
      patron: /cat[eé]ter\s+venoso\s+central|\bCVC\b/i,
      nombre: 'Catéter venoso central',
      requiere_autorizacion: false,
      facturacion_aparte: true,
      codigo: '35.01.01'
    },
    {
      patron: /cat[eé]ter\s+arterial/i,
      nombre: 'Catéter arterial',
      requiere_autorizacion: false,
      facturacion_aparte: true
    },
    {
      patron: /\bPICC\b|cat[eé]ter\s+central\s+de\s+inserci[oó]n\s+perif[eé]rica/i,
      nombre: 'PICC (Catéter central de inserción periférica)',
      requiere_autorizacion: true,
      facturacion_aparte: true
    },
    {
      patron: /cat[eé]ter\s+Swan-Ganz/i,
      nombre: 'Catéter Swan-Ganz',
      requiere_autorizacion: true,
      facturacion_aparte: true
    },
    {
      patron: /cat[eé]ter\s+epidural/i,
      nombre: 'Catéter epidural',
      requiere_autorizacion: false,
      facturacion_aparte: true
    }
  ],
  procedimientos_especiales: [
    {
      patron: /drenaje\s+tor[aá]cico|tubo\s+de\s+t[oó]rax/i,
      nombre: 'Drenaje torácico',
      requiere_autorizacion: false,
      facturacion_aparte: true
    },
    {
      patron: /traqueostom[ií]a/i,
      nombre: 'Traqueostomía',
      requiere_autorizacion: true,
      facturacion_aparte: true
    },
    {
      patron: /gastrostom[ií]a/i,
      nombre: 'Gastrostomía',
      requiere_autorizacion: true,
      facturacion_aparte: true
    }
  ]
};

function detectarPracticasExcluidas(texto: string): PracticaExcluida[] {
  const practicasDetectadas: PracticaExcluida[] = [];

  for (const [categoriaKey, practicas] of Object.entries(PRACTICAS_EXCLUIDAS_CONFIG)) {
    for (const practica of practicas) {
      let match;
      const regex = new RegExp(practica.patron.source, practica.patron.flags + 'g');

      while ((match = regex.exec(texto)) !== null) {
        // Extraer contexto alrededor
        const inicio = Math.max(0, match.index - 500);
        const fin = Math.min(texto.length, match.index + 500);
        const contexto = texto.substring(inicio, fin);

        // Determinar ubicación del documento
        let ubicacion: PracticaExcluida['ubicacion_documento'] = 'evolucion';
        if (/foja\s+ambulatoria/i.test(contexto)) {
          ubicacion = 'foja_ambulatoria';
        } else if (/interconsulta/i.test(contexto)) {
          ubicacion = 'interconsulta';
        }

        // Extraer fecha
        const fechaMatch = contexto.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
        const fecha = fechaMatch ? fechaMatch[1] : undefined;

        // Generar advertencia
        let advertencia = `⚠️ ${practica.nombre} detectada`;
        if (practica.requiere_autorizacion && practica.facturacion_aparte) {
          advertencia += ' - REQUIERE AUTORIZACIÓN PREVIA y se factura por separado del módulo';
        } else if (practica.requiere_autorizacion) {
          advertencia += ' - REQUIERE AUTORIZACIÓN PREVIA';
        } else if (practica.facturacion_aparte) {
          advertencia += ' - Se factura por separado del módulo';
        }
        if ('codigo' in practica && practica.codigo) {
          advertencia += ` (Código: ${practica.codigo})`;
        }

        const categoria = categoriaKey === 'punciones' ? 'puncion' :
          categoriaKey === 'cateteres' ? 'cateter' :
            'procedimiento_especial';

        practicasDetectadas.push({
          tipo: practica.nombre,
          categoria: categoria as PracticaExcluida['categoria'],
          fecha,
          ubicacion_documento: ubicacion,
          requiere_autorizacion: practica.requiere_autorizacion,
          facturacion_aparte: practica.facturacion_aparte,
          codigo_nomenclador: 'codigo' in practica ? practica.codigo : undefined,
          advertencia
        });
      }
    }
  }

  return practicasDetectadas;
}

/* =========================
   NUEVO: Endoscopías
   ========================= */
const PATRONES_ENDOSCOPIA = [
  /videoendoscop[ií]a\s+digestiva\s+(alta|baja)/i,
  /videocolonoscop[ií]a/i,
  /colonoscop[ií]a/i,
  /gastroscop[ií]a/i,
  /esofagogastroduodenoscop[ií]a/i,
  /\bVEDA\b/i,
  /\bVCC\b/i,
  /broncoscop[ií]a/i,
  /cistoscop[ií]a/i,
  /histeroscop[ií]a/i,
  /artroscop[ií]a/i
];

function detectarEndoscopias(texto: string): FojaEndoscopia[] {
  const endoscopias: FojaEndoscopia[] = [];
  const procedimientosEncontrados = new Set<string>(); // Evitar duplicados

  // Patrones mejorados con nombres de procedimientos
  const patronesMejorados = [
    { patron: /\b(veda|endoscop[ií]a\s+digestiva\s+alta|endoscop[ií]a\s+alta)\b/gi, nombre: 'VEDA (Endoscopía Digestiva Alta)' },
    { patron: /\b(colonoscop[ií]a|videocolonoscop[ií]a)\b/gi, nombre: 'Colonoscopía' },
    { patron: /\b(broncoscop[ií]a|fibrobroncoscop[ií]a)\b/gi, nombre: 'Broncoscopía' },
    { patron: /\b(rectosigmoidoscop[ií]a)\b/gi, nombre: 'Rectosigmoidoscopía' },
    { patron: /\b(gastroscop[ií]a)\b/gi, nombre: 'Gastroscopía' },
  ];

  for (const { patron, nombre } of patronesMejorados) {
    const regex = new RegExp(patron.source, patron.flags);
    let match;

    while ((match = regex.exec(texto)) !== null) {
      // Crear clave única para evitar duplicados
      const claveUnica = `${nombre}-${match.index}`;
      if (procedimientosEncontrados.has(claveUnica)) continue;

      // Extraer bloque de contexto (ampliado hacia atrás para encontrar fecha de Foja)
      const inicioBloque = Math.max(0, match.index - 3000);
      const finBloque = Math.min(texto.length, match.index + 2000);
      const bloque = texto.substring(inicioBloque, finBloque);

      // Verificar que realmente sea una foja de endoscopía (no solo mención)
      // Buscamos indicadores cerca del match (en un rango menor) para no confundir con otras fojas
      const contextoCercano = texto.substring(Math.max(0, match.index - 500), Math.min(texto.length, match.index + 500));
      const esFojaEndoscopia = /(?:foja|hoja|informe).*(?:endoscop|procedimiento)/i.test(contextoCercano) ||
        /(?:endoscopista|hallazgos|biopsias)/i.test(contextoCercano);

      if (!esFojaEndoscopia) continue;

      // Extraer fecha (buscar con prioridad en etiquetas explícitas)
      const patronesFecha = [
        /(?:fecha|realizado|f\.)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i, // Fecha: 15/01/2026
        /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/, // 15/01/2026 (solo)
        /visita[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i // Visita: 15/01/2026
      ];

      let fecha = '';

      // Intentar encontrar una fecha válida
      for (const p of patronesFecha) {
        // Buscar todas las ocurrencias y tomar la más cercana al procedimiento (pero anterior o muy cercana)
        const matches = [...bloque.matchAll(new RegExp(p, 'gi'))];

        // Filtrar fechas inválidas (ej: me 00)
        const fechasValidas = matches.filter(m => {
          const parts = m[1].split('/');
          const d = parseInt(parts[0], 10);
          const mon = parseInt(parts[1], 10);
          return d >= 1 && d <= 31 && mon >= 1 && mon <= 12;
        });

        if (fechasValidas.length > 0) {
          // Tomamos la última encontrada en el bloque (asumiendo que es la más cercana al header de la foja actual)
          // ya que el bloque va desde -3000 hasta +2000, la fecha de la foja debería estar antes del procedimiento
          fecha = fechasValidas[fechasValidas.length - 1][1];
          break;
        }
      }

      // Extraer horas
      const horaInicioMatch = bloque.match(/hora\s+inicio[:\s]*(\d{1,2}:\d{2})/i);
      const hora_inicio = horaInicioMatch ? horaInicioMatch[1] : undefined;

      const horaFinMatch = bloque.match(/hora\s+(?:fin|t[eé]rmino)[:\s]*(\d{1,2}:\d{2})/i);
      const hora_fin = horaFinMatch ? horaFinMatch[1] : undefined;

      // Extraer endoscopista (mejorado)
      const endoscopistaMatch = bloque.match(/(?:endoscopista|m[eé]dico|realiz[oó])[:\s]*(?:dr\.?\s*|dra\.?\s*)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/i);
      const endoscopistaNombre = endoscopistaMatch ? endoscopistaMatch[1].trim() : '';

      // Extraer matrícula
      const matriculaMatch = bloque.match(/(?:mp|mn|m\.?p\.?|matr[ií]cula)[:\s#]*(\d{3,7})/i);
      const matricula = matriculaMatch ? matriculaMatch[1] : undefined;

      // Extraer hallazgos (mejorado)
      const hallazgosMatch = bloque.match(/hallazgos?[:\s]*([^\n]{10,500})/i);
      let hallazgos = hallazgosMatch ? hallazgosMatch[1].trim() : undefined;

      // Limpiar hallazgos si es muy largo o tiene basura
      if (hallazgos && hallazgos.length > 200) {
        hallazgos = hallazgos.substring(0, 197) + '...';
      }

      // Detectar biopsias
      const biopsias = /biopsia|muestra\s+histol[oó]gica|toma\s+de\s+muestra/i.test(bloque);

      // Validaciones y errores
      const errores: string[] = [];
      if (!endoscopistaNombre) errores.push('Falta nombre del endoscopista');
      if (!matricula) errores.push('Falta matrícula del endoscopista');
      if (!fecha) errores.push('Falta fecha del procedimiento');
      if (!hora_inicio && !hora_fin) errores.push('Faltan horarios del procedimiento');

      procedimientosEncontrados.add(claveUnica);

      endoscopias.push({
        tipo: 'endoscopia',
        procedimiento: nombre,
        fecha,
        hora_inicio,
        hora_fin,
        endoscopista: { nombre: endoscopistaNombre, matricula },
        hallazgos,
        biopsias,
        errores
      });
    }
  }

  return endoscopias;
}

/* =========================
   NUEVO: Prácticas Ambulatorias
   ========================= */
const PATRONES_PRACTICAS_AMBULATORIAS = [
  /curaci[oó]n/i,
  /extracci[oó]n\s+de\s+puntos/i,
  /retiro\s+de\s+drenaje/i,
  /cambio\s+de\s+sonda/i,
  /infiltraci[oó]n/i,
  /bloqueo\s+nervioso/i
];

function detectarPracticasAmbulatorias(
  texto: string,
  fechaIngreso: Date,
  fechaAlta: Date
): PracticaAmbulatoria[] {
  const practicas: PracticaAmbulatoria[] = [];

  for (const patron of PATRONES_PRACTICAS_AMBULATORIAS) {
    let match;
    const regex = new RegExp(patron.source, patron.flags + 'g');

    while ((match = regex.exec(texto)) !== null) {
      const bloque = texto.substring(match.index - 500, match.index + 500);

      const fechaMatch = bloque.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (fechaMatch) {
        const [d, m, a] = fechaMatch[1].split('/');
        const fechaPractica = new Date(Number(a), Number(m) - 1, Number(d));

        // Verificar si está en rango de internación
        if (fechaPractica >= fechaIngreso && fechaPractica <= fechaAlta) {
          const horaMatch = bloque.match(/(\d{1,2}:\d{2})/);

          practicas.push({
            tipo: match[0],
            fecha: fechaMatch[1],
            hora: horaMatch ? horaMatch[1] : undefined,
            ubicacion: 'durante_internacion',
            requiere_autorizacion: true,
            errores: []
          });
        }
      }
    }
  }

  return practicas;
}

/* =========================
   NUEVO: Extracción de Estudios y Generación de Lista de Días
   ========================= */

// Patrones para detectar estudios médicos
const PATRONES_ESTUDIOS = {
  imagenes: [
    { nombre: 'RX de Tórax', patron: /(?:rx|radiograf[ií]a)\s+(?:de\s+)?t[oó]rax/i },
    { nombre: 'RX de Abdomen', patron: /(?:rx|radiograf[ií]a)\s+(?:de\s+)?abdomen/i },
    { nombre: 'TAC', patron: /\b(?:TAC|tomograf[ií]a|TC)\b/i },
    { nombre: 'Ecografía', patron: /ecograf[ií]a/i },
    { nombre: 'RMN', patron: /\b(?:RMN|resonancia\s+magn[eé]tica)\b/i },
    { nombre: 'Ecocardiograma', patron: /ecocardiograma/i },
  ],
  laboratorio: [
    { nombre: 'Hemograma', patron: /hemograma/i },
    { nombre: 'Laboratorio', patron: /laboratorio(?:\s+completo)?/i },
    { nombre: 'Gasometría', patron: /gasom[eé]tria/i },
    { nombre: 'Cultivos', patron: /cultivos?/i },
    { nombre: 'PCR', patron: /\bPCR\b/i },
    { nombre: 'Procalcitonina', patron: /procalcitonina/i },
  ],
  procedimientos: [
    { nombre: 'ECG', patron: /\b(?:ECG|electrocardiograma)\b/i },
    { nombre: 'EEG', patron: /\b(?:EEG|electroencefalograma)\b/i },
    { nombre: 'Espirometría', patron: /espirometr[ií]a/i },
  ],
};

interface EstudioDetectado {
  tipo: string;
  fecha: string;
  categoria: 'imagenes' | 'laboratorio' | 'procedimientos';
}

/* =========================
   Doctores / Foja
   ========================= */
function extraerDoctores(texto: string): {
  residentes: Doctor[];
  cirujanos: Doctor[];
  otros: Doctor[];
} {
  const doctores = {
    residentes: [] as Doctor[],
    cirujanos: [] as Doctor[],
    otros: [] as Doctor[],
  };
  const lineas = texto.split("\n");
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(/(mp|mn|matrícula)[:\s]*(\d{3,6})/i);
    if (m) {
      const matricula = m[2];
      let nombre: string | null = null;
      for (let j = Math.max(0, i - 3); j < Math.min(i + 3, lineas.length); j++) {
        const mn = lineas[j].match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,]+)/);
        if (mn && mn[1].trim().length > 5) {
          nombre = mn[1].trim();
          break;
        }
      }
      if (nombre) {
        const contexto = lineas
          .slice(Math.max(0, i - 5), Math.min(i + 5, lineas.length))
          .join(" ")
          .toLowerCase();
        if (/cirujano|cirugia|operacion|quirurgico/i.test(contexto)) {
          doctores.cirujanos.push({ nombre, matricula });
        } else if (/residente|resident|evolucion/i.test(contexto)) {
          doctores.residentes.push({ nombre, matricula });
        } else {
          doctores.otros.push({ nombre, matricula });
        }
      }
    }
  }
  return doctores;
}

function validarEquipoQuirurgicoUnico(foja: FojaQuirurgica): string[] {
  const errores: string[] = [];
  const equipo = foja.equipo_quirurgico;
  if (!equipo || equipo.length === 0) return errores;

  const crit = ["cirujano", "primer_ayudante", "instrumentador", "anestesista"];
  const porRol: Record<string, string> = {};
  for (const m of equipo) {
    const rol = m.rol;
    const nombre = m.nombre.trim().toUpperCase();
    if (crit.includes(rol)) porRol[rol] = nombre;
  }
  const roles = Object.keys(porRol);
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const r1 = roles[i],
        r2 = roles[j];
      if (porRol[r1] === porRol[r2]) {
        errores.push(
          `❌ CRÍTICO: El ${r1.replace("_", " ")} y el ${r2.replace(
            "_",
            " "
          )} tienen el mismo nombre: ${porRol[r1]}. Deben ser diferentes.`
        );
      }
    }
  }
  return errores;
}

function analizarFojaQuirurgica(texto: string): ResultadosFoja {
  const resultados: ResultadosFoja = {
    fojas: [],
    errores_generales: [],
  };

  const patronesFoja = [
    /foja\s+quirúrgica/i,
    /hoja\s+quirúrgica/i,
    /protocolo\s+quirúrgico/i,
    /protocolo\s+operatorio/i,
    /registro\s+quirúrgico/i,
    /parte\s+quirúrgico/i,
  ];

  // Buscar todas las ocurrencias de "foja quirúrgica"
  const ocurrencias: Array<{ patron: RegExp; index: number }> = [];
  for (const patron of patronesFoja) {
    let match;
    const regex = new RegExp(patron.source, patron.flags + 'g');
    while ((match = regex.exec(texto)) !== null) {
      ocurrencias.push({ patron, index: match.index });
    }
  }

  // Filtrar ocurrencias duplicadas muy cercanas (probablemente la misma foja)
  ocurrencias.sort((a, b) => a.index - b.index);
  const ocurrenciasFiltradas: Array<{ patron: RegExp; index: number }> = [];
  for (let i = 0; i < ocurrencias.length; i++) {
    const actual = ocurrencias[i];
    // Si hay una ocurrencia anterior muy cerca (menos de 200 caracteres), ignorar esta
    if (i === 0 || actual.index - ocurrencias[i - 1].index > 200) {
      ocurrenciasFiltradas.push(actual);
    }
  }

  // Si no se encontró ninguna ocurrencia, verificar con indicadores
  if (ocurrenciasFiltradas.length === 0) {
    const indicadores = [
      /cirujano[:\s]*([A-Z][A-Z\s,]+)/i,
      /anestesista[:\s]*([A-Z][A-Z\s,]+)/i,
      /hora\s+comienzo[:\s]*(\d{1,2}:\d{2})/i,
      /bisturí\s+armónico/i,
    ];
    let count = 0;
    for (const r of estosIndicadores(indicadores, texto)) if (r) count++;
    if (count < 2) {
      // NOTA: No es un error crítico - simplemente no hubo cirugía
      // Devolvemos resultados vacíos sin errores
      return resultados;
    }
  }

  // Analizar cada ocurrencia para encontrar foja quirúrgicas válidas
  for (const ocurrencia of ocurrenciasFiltradas) {
    const inicio = ocurrencia.index;

    // Buscar fecha ANTES de "foja quirúrgica" (hasta 3000 caracteres antes)
    const inicioBusqueda = Math.max(0, inicio - 3000);
    const bloqueAnterior = texto.substring(inicioBusqueda, inicio);

    // Buscar patrones de fecha en el bloque anterior (visita, intervención planificada, etc.)
    const patronesFechaAnterior = [
      /visita\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})/i,
      /intervenci[oó]n\s+planificada\s+para\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})/i, // Fecha y hora juntas
      /(?:^|\s|:)(\d{1,2}\/\d{1,2}\/\d{4})(?:\s|$|,|\.)/i, // Fecha sola (captura generica en bloque anterior)
    ];

    let fechaEncontradaAntes: string | null = null;
    let horaEncontradaAntes: string | null = null;

    for (const patron of patronesFechaAnterior) {
      // Usar matchAll y tomar el ULTIMO resultado (más cercano a la foja)
      const matches = [...bloqueAnterior.matchAll(new RegExp(patron, 'gi'))];
      if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        fechaEncontradaAntes = lastMatch[1];
        if (lastMatch[2]) {
          horaEncontradaAntes = lastMatch[2];
        }
        break;
      }
    }

    // Analizar un bloque más amplio (4000 caracteres) para detectar tipo de procedimiento y equipo
    const trozoValidacion = texto.substring(inicio, Math.min(inicio + 4000, texto.length));

    // Detectar si es una endoscopía o procedimiento endoscópico
    // Detectar si es una endoscopía o procedimiento endoscópico (soporte para terminaciones a/o y corrección de typos)
    // Regex ajustado para: Videoesofagogastrico (sin 'o' intermedia)
    const esEndoscopia = /\b(endoscop[ií]a|gastroscop[ií]a|colonoscop[ií]a|broncoscop[ií]a|videoesofagogastr[íi]c[ao]|videoesofagogastr[oó]gic[ao]|videoesofagogastroduodenoscop[ií]a|video\s*esofagogastr[íi]c[ao]|video\s*esofagogastr[oó]gic[ao]|video\s*colonoscop[ií]a)\b/i.test(trozoValidacion);

    // Buscar miembros del equipo quirúrgico en el bloque de validación
    // Regex relajado para aceptar asteriscos, puntos, etc. (ej: ****SIN ANESTESIA****)
    const regexNombre = "[A-ZÁÉÍÓÚÑ\\*][A-ZÁÉÍÓÚÑ,\\s\\*\\.\\-\\(\\)]{2,60}";

    // Check específico para sin anestesia
    const sinAnestesia = /\*+SIN ANESTESIA\*+/i.test(trozoValidacion) || /SIN\s+ANESTESIA/i.test(trozoValidacion);

    const tieneAnestesistaCerca = new RegExp(`anestesista[:\\s]*(${regexNombre})`, 'i').test(trozoValidacion) || sinAnestesia;
    const tieneEndoscopistaCerca = new RegExp(`endoscopista[:\\s]*(${regexNombre})`, 'i').test(trozoValidacion);
    const tieneCirujanoCerca = new RegExp(`cirujano[:\\s]*(${regexNombre})`, 'i').test(trozoValidacion);

    let esValida = false;
    let rangoBusqueda = 5000; // Rango por defecto para cirugías normales

    // Validación flexible:
    if (tieneAnestesistaCerca) {
      esValida = true;
      if (esEndoscopia) {
        rangoBusqueda = 3000;
      } else if (!tieneCirujanoCerca) {
        rangoBusqueda = 3000;
      }
    } else if (tieneCirujanoCerca) {
      // Si tiene Cirujano, lo consideramos válido (incluso sin anestesista explícito)
      // Esto cubre casos como "SIN ANESTESIA" que no haya macheado arriba, o procedimientos locales
      esValida = true;
      if (esEndoscopia) {
        rangoBusqueda = 3000;
      }
    } else if (tieneEndoscopistaCerca) {
      // Si solo tiene endoscopista, también es válido para ese tipo
      esValida = true;
      rangoBusqueda = 3000;
    }

    // Si no es válida, ignorar esta ocurrencia
    if (!esValida) {
      continue;
    }

    // Analizar un bloque del tamaño apropiado según el tipo de procedimiento
    const trozo = texto.substring(inicio, Math.min(inicio + rangoBusqueda, texto.length));

    // Crear una foja individual para esta ocurrencia
    const foja: FojaQuirurgica = {
      bisturi_armonico: null,
      equipo_quirurgico: [],
      fecha_cirugia: null,
      hora_inicio: null,
      hora_fin: null,
      errores: [],
    };

    // Buscar bisturí armónico
    const patronesBisturi = [
      /uso\s+de\s+bisturí\s+armónico\??[:\s]*(si|no)/i,
      /bisturí\s+armónico\??[:\s]*(si|no)/i,
      /armónico\??[:\s]*(si|no)/i,
      /bisturí.*?(si|no)/i,
      /armónico.*?(si|no)/i,
    ];
    for (const p of patronesBisturi) {
      const m = trozo.match(p);
      if (m) {
        foja.bisturi_armonico = m[1].toUpperCase();
        break;
      }
    }

    // Buscar equipo quirúrgico
    // Regex relajado para nombres (reutilizando lógica similar a la validación)
    const regexNombreCaptura = "([A-ZÁÉÍÓÚÑ\\*][A-ZÁÉÍÓÚÑ,\\s\\*\\.\\-\\(\\)]{2,60})";

    const patronesEquipo = [
      { rol: 'cirujano', patrón: new RegExp(`cirujano[:\\s]*${regexNombreCaptura}`, 'i') },
      { rol: 'anestesista', patrón: new RegExp(`anestesista[:\\s]*${regexNombreCaptura}`, 'i') },
      { rol: 'endoscopista', patrón: new RegExp(`endoscopista[:\\s]*${regexNombreCaptura}`, 'i') },
      { rol: 'instrumentador', patrón: new RegExp(`instrumentador\\/?a?[:\\s]*${regexNombreCaptura}`, 'i') },
      { rol: 'primer_ayudante', patrón: new RegExp(`primer\\s+ayudante[:\\s]*${regexNombreCaptura}`, 'i') },
      { rol: 'ayudante_residencia', patrón: new RegExp(`ayudante\\s+residencia[:\\s]*${regexNombreCaptura}`, 'i') },
      { rol: 'ayudante', patrón: new RegExp(`ayudante[:\\s]*${regexNombreCaptura}`, 'i') },
    ];
    const vistos = new Set<string>();

    for (const { rol, patrón: p } of patronesEquipo) {
      const matches = trozo.matchAll(new RegExp(p.source, 'gi'));
      for (const m of matches) {
        if (!m[1]) continue;

        const palabrasFinNombre = [
          'cirujano', 'cirug', 'anestesista', 'endoscopista', 'instrumentador', 'ayudante',
          'responsable', 'primer', 'tipo de visita', 'tipo', 'fecha', 'hora',
          'diagnostico', 'procedimiento', 'matricula', 'especialidad'
        ];

        let nombre = m[1].trim();

        for (const palabra of palabrasFinNombre) {
          const index = nombre.toLowerCase().indexOf(palabra);
          if (index > 5) {
            nombre = nombre.substring(0, index).trim();
            break;
          }
        }

        nombre = nombre
          .replace(/\s+(Anestesista|Endoscopista|Instrumentador|Ayudante|Cirujano|Responsable|Fecha|Hora)\s*$/i, '')
          .replace(/\s+(Tipo|de|para|en)\s+[A-ZÁÉÍÓÚÑ]+\s*$/i, '')
          .trim();

        if (nombre.toLowerCase().startsWith('residencia ') || nombre.toLowerCase().startsWith('residencia,')) {
          nombre = nombre.replace(/^residencia[\s,]+/i, '').trim();
        }

        if (nombre.length > 3) {
          const key = `${rol}:${nombre}`;

          if (rol === 'ayudante') {
            const yaExisteResidencia = foja.equipo_quirurgico.some(
              e => e.rol === 'ayudante_residencia' &&
                (e.nombre === nombre || e.nombre.toLowerCase().includes(nombre.toLowerCase()) ||
                  nombre.toLowerCase().includes(e.nombre.toLowerCase()))
            );
            if (yaExisteResidencia) {
              continue;
            }
          }

          if (!vistos.has(key)) {
            vistos.add(key);
            foja.equipo_quirurgico.push({ rol, nombre });
          }
        }
      }
    }

    // Buscar hora de inicio y fecha
    const patronesHoraInicio = [
      /hora\s+comienzo[:\s]*(\d{1,2}:\d{2})/i,
      /hora\s+inicio[:\s]*(\d{1,2}:\d{2})/i,
      /comienzo[:\s]*(\d{1,2}:\d{2})/i,
    ];
    let gotInicio = false;
    for (const p of patronesHoraInicio) {
      const m = trozo.match(p);
      if (m) {
        foja.hora_inicio = m[1];
        gotInicio = true;
        const antes = trozo.substring(0, m.index ?? 0);
        const pf = [/fecha[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i, /(\d{1,2}\/\d{1,2}\/\d{4})/];
        let fOK = false;
        for (const r of pf) {
          const f = antes.match(r);
          if (f) {
            foja.fecha_cirugia = f[1];
            fOK = true;
            break;
          }
        }
        // Si no encontró fecha antes de la hora, buscar después
        if (!fOK) {
          const despues = trozo.substring((m.index ?? 0) + m[0].length, Math.min((m.index ?? 0) + m[0].length + 200, trozo.length));
          for (const r of pf) {
            const f = despues.match(r);
            if (f) {
              foja.fecha_cirugia = f[1];
              fOK = true;
              break;
            }
          }
        }
        // Si aún no se encontró fecha, buscar en todo el bloque de la foja
        if (!fOK) {
          for (const r of pf) {
            const f = trozo.match(r);
            if (f) {
              foja.fecha_cirugia = f[1];
              fOK = true;
              break;
            }
          }
        }
        if (!fOK)
          foja.errores.push(
            "❌ CRÍTICO: Fecha de cirugía no encontrada en foja quirúrgica"
          );
        break;
      }
    }
    // Si no se encontró hora de inicio, intentar buscar fecha de todas formas
    if (!gotInicio) {
      // Buscar fecha en todo el bloque aunque no haya hora
      const pf = [/fecha[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i, /(\d{1,2}\/\d{1,2}\/\d{4})/];
      for (const r of pf) {
        const f = trozo.match(r);
        if (f) {
          foja.fecha_cirugia = f[1];
          break;
        }
      }
      foja.errores.push(
        "❌ CRÍTICO: Hora de comienzo no encontrada en foja quirúrgica"
      );
    }

    // Usar fecha y hora encontradas ANTES de "foja quirúrgica" si no se encontraron en el bloque
    if (fechaEncontradaAntes && !foja.fecha_cirugia) {
      foja.fecha_cirugia = fechaEncontradaAntes;
    }
    if (horaEncontradaAntes && !foja.hora_inicio) {
      foja.hora_inicio = horaEncontradaAntes;
    }

    // Buscar hora de fin
    const patronesHoraFin = [
      /hora\s+finalización[:\s]*(\d{1,2}:\d{2})/i,
      /hora\s+fin[:\s]*(\d{1,2}:\d{2})/i,
      /finalización[:\s]*(\d{1,2}:\d{2})/i,
    ];
    for (const p of patronesHoraFin) {
      const m = trozo.match(p);
      if (m) {
        foja.hora_fin = m[1];
        break;
      }
    }
    if (!foja.hora_fin)
      foja.errores.push(
        "⚠️ ADVERTENCIA: Hora de finalización no encontrada en foja quirúrgica"
      );

    // Validación final según el tipo de procedimiento
    const tieneCirujano = foja.equipo_quirurgico.some(e => e.rol === 'cirujano');
    const tieneAnestesista = foja.equipo_quirurgico.some(e => e.rol === 'anestesista');
    const tieneEndoscopista = foja.equipo_quirurgico.some(e => e.rol === 'endoscopista');

    let esValidaFinal = false;

    // Validación flexible: aceptar si tiene Anestesista (procedimientos menores)
    // O si tiene Cirujano + Anestesista (cirugías mayores)
    if (tieneAnestesista) {
      // Si tiene Anestesista, es válida (cubre la mayoría de casos)
      esValidaFinal = true;
    } else if (tieneCirujano && tieneEndoscopista) {
      // Caso especial: Cirujano + Endoscopista
      esValidaFinal = true;
    } else if (tieneCirujano && esEndoscopia) {
      // Endoscopía con Cirujano pero sin Anestesista explícito
      esValidaFinal = true;
    } else if (tieneCirujano && tieneAnestesista) {
      // Cirugía mayor: requiere ambos
      esValidaFinal = true;
    }

    // Solo agregar la foja si cumple con los requisitos
    if (esValidaFinal) {
      // Verificar si ya existe una foja con la misma fecha y mismo equipo (evitar duplicados)
      const esDuplicada = resultados.fojas.some(fojaExistente => {
        if (foja.fecha_cirugia && fojaExistente.fecha_cirugia) {
          // Normalizar fechas para comparar
          const partes1 = foja.fecha_cirugia.split('/');
          const partes2 = fojaExistente.fecha_cirugia.split('/');
          if (partes1.length === 3 && partes2.length === 3) {
            const fecha1 = `${partes1[0].padStart(2, '0')}/${partes1[1].padStart(2, '0')}/${partes1[2]}`;
            const fecha2 = `${partes2[0].padStart(2, '0')}/${partes2[1].padStart(2, '0')}/${partes2[2]}`;
            if (fecha1 === fecha2) {
              // Si tienen la misma fecha, verificar hora de inicio
              if (foja.hora_inicio && fojaExistente.hora_inicio && foja.hora_inicio !== fojaExistente.hora_inicio) {
                return false;
              }

              // Comparar equipos completos para determinar si es la misma cirugía
              // Generamos un set de "Rol:Nombre" para cada una
              const equipo1 = new Set(foja.equipo_quirurgico.map(e => `${e.rol}:${e.nombre}`));
              const equipo2 = new Set(fojaExistente.equipo_quirurgico.map(e => `${e.rol}:${e.nombre}`));

              // Si el tamaño es diferente o el contenido es diferente, son distintas
              if (equipo1.size !== equipo2.size) return false;

              let sonIdenticos = true;
              for (const miembro of equipo1) {
                if (!equipo2.has(miembro)) {
                  sonIdenticos = false;
                  break;
                }
              }

              if (sonIdenticos) return true; // Fecha igual, equipo idéntico -> Duplicada
            }
          }
        }
        return false;
      });

      if (!esDuplicada) {
        resultados.fojas.push(foja);
      }
    }
  }

  // Si no se encontró ninguna foja válida pero había ocurrencias
  // NOTA: No generamos advertencia - puede ser que simplemente no hubo cirugía
  // o que las menciones sean contextuales sin implicar una cirugía real

  return resultados;
}

/* =========================
   Generar lista de días de internación
   ========================= */
function generarListaDiasInternacion(
  ingreso: Date,
  alta: Date,
  diasConEvolucion: Set<string>,
  resultadosFoja: ResultadosFoja,
  estudios: Estudio[],
  estaEnUCI: boolean
): DiaInternacion[] {
  const listaDias: DiaInternacion[] = [];
  const inicio = startOfDay(ingreso);
  const fin = startOfDay(alta);
  const MS_DIA = 1000 * 60 * 60 * 24;

  // Crear un mapa de fechas de cirugía para acceso rápido
  const fechasCirugia = new Set<string>();
  for (const foja of resultadosFoja.fojas) {
    if (foja.fecha_cirugia) {
      // Normalizar formato de fecha (DD/MM/YYYY) - convertir 5/11/2025 a 05/11/2025
      const partes = foja.fecha_cirugia.split('/');
      if (partes.length === 3) {
        const dia = partes[0].padStart(2, '0');
        const mes = partes[1].padStart(2, '0');
        const anio = partes[2];
        const fechaNormalizada = `${dia}/${mes}/${anio}`;
        fechasCirugia.add(fechaNormalizada);
        // También agregar la fecha original por si acaso
        fechasCirugia.add(foja.fecha_cirugia);
      } else {
        fechasCirugia.add(foja.fecha_cirugia);
      }
    }
  }

  // Crear un mapa de estudios por fecha
  const estudiosPorFecha = new Map<string, Array<{ tipo: string; categoria: string }>>();
  for (const estudio of estudios) {
    if (estudio.fecha) {
      if (!estudiosPorFecha.has(estudio.fecha)) {
        estudiosPorFecha.set(estudio.fecha, []);
      }
      estudiosPorFecha.get(estudio.fecha)!.push({
        tipo: estudio.tipo,
        categoria: estudio.categoria,
      });
    }
  }

  let fechaActual = new Date(inicio);
  while (fechaActual <= fin) {
    const dia = String(fechaActual.getDate()).padStart(2, "0");
    const mes = String(fechaActual.getMonth() + 1).padStart(2, "0");
    const anio = fechaActual.getFullYear();
    const fechaStr = `${dia}/${mes}/${anio}`;

    const tieneEvolucion = diasConEvolucion.has(fechaStr);
    const tieneFojaQuirurgica = fechasCirugia.has(fechaStr);
    const estudiosDelDia = estudiosPorFecha.get(fechaStr) || [];

    listaDias.push({
      fecha: fechaStr,
      tieneEvolucion,
      tieneFojaQuirurgica,
      estudios: estudiosDelDia,
    });

    fechaActual = new Date(fechaActual.getTime() + MS_DIA);
  }

  return listaDias;
}

function* estosIndicadores(regs: RegExp[], txt: string) {
  for (const r of regs) yield r.test(txt);
}

/* =========================
   NUEVO: Extraer Estudios
   ========================= */
function extraerEstudios(texto: string) {
  const tx = normalizarTextoPDF(texto);
  const lineas = tx.split("\n");

  const reFecha = /(\b\d{1,2}\/\d{1,2}\/\d{2,4}\b)/i;
  const reHora = /(\b\d{1,2}:\d{2}(?::\d{2})?\b)/;
  const reInforme = /(informe|impresi[oó]n|conclusi[oó]n|resultado)/i;
  const rePagina = /p[aá]gina\s+(\d+)/i;

  const patronesImagenes: Array<[RegExp, string]> = [
    [/\b(tac|tc|tomograf[ií]a)\b.*?(cerebro|cr[aá]neo|t[oó]rax|abdomen|pelvis|columna|cuello)?/i, "TAC"],
    [/\b(rm|rmn|resonancia)\b.*?(cerebro|cr[aá]neo|columna|rodilla|hombro|abdomen|pelvis|t[oó]rax)?/i, "Resonancia Magnética"],
    [/\b(rx|radiograf[ií]a|r[ xg]rafia)\b.*?(t[oó]rax|columna|miembro|mano|muñeca|cadera|pelvis)?/i, "Radiografía"],
    [/\b(eco|ecograf[ií]a|ultrasonido)\b.*?(abdominal|hep[aá]tico|vesicular|renal|tiroides|obst[eé]trica|doppler|partes blandas)?/i, "Ecografía"],
    [/\bdoppler\b.*?(venoso|arterial|miembros|carot[ií]deo)?/i, "Doppler"],
    [/\bangiotac|angio[-\s]?rm\b/i, "Angio"],
  ];
  const patronesLab: Array<[RegExp, string]> = [
    [/\bhemograma( completo)?\b/i, "Hemograma"],
    [/\bpcr\b(?![-\w])/i, "PCR"],
    [/\bvsg\b/i, "VSG"],
    [/\bglucemia\b/i, "Glucemia"],
    [/\bcreatinin(a|emia)?\b/i, "Creatinina"],
    [/\burea\b/i, "Urea"],
    [/\bionograma|sodio|potasio|cloro\b/i, "Ionograma"],
    [/\bhepatic[oa]|tgo|tgp|gamm?aglutamil|bilirrubin(a|as)?\b/i, "Perfil hepático"],
    [/\bur[ie]nalisis|sumario de orina|orina completa\b/i, "Orina completa"],
  ];
  const patronesProc: Array<[RegExp, string]> = [
    [/\bendoscop[ií]a (alta|digestiva alta)\b/i, "Endoscopía alta"],
    [/\bcolonoscop[ií]a\b/i, "Colonoscopía"],
    [/\bbroncoscop[ií]a\b/i, "Broncoscopía"],
    [/\beco[-\s]?cardiogram?a\b/i, "Ecocardiograma"],
    [/\becg|electrocardiograma\b/i, "Electrocardiograma"],
    [/\bparacentesis|toracocentesis|punci[oó]n lumbar\b/i, "Procedimiento"],
    [/\b(ktr|kine|kinesio|kinesiolog[íi]a|kinesioterapia|kinesioter\w+|kine\.|ktr\.)\b/i, "Kinesiología"],
  ];

  let paginaActual = 1;
  const paginasExamenesComplementarios = new Set<number>();
  const paginasEstudiosEntregados = new Set<number>();
  let dentroDeExamenesComplementarios = false;
  let dentroDeEstudiosEntregados = false;

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const matchPagina = linea.match(rePagina);
    if (matchPagina) {
      paginaActual = Number(matchPagina[1]);
    }

    if (/ex[áa]menes\s+complementarios/i.test(linea)) {
      dentroDeExamenesComplementarios = true;
      paginasExamenesComplementarios.add(paginaActual);
    }

    if (/estudios\s+entregados\s+por\s+el\s+paciente/i.test(linea)) {
      dentroDeEstudiosEntregados = true;
      paginasEstudiosEntregados.add(paginaActual);
    }

    if (/(evoluci[oó]n|visita|alta\s+m[eé]dica|epicrisis|foja|cirug[íi]a)/i.test(linea) &&
      !dentroDeExamenesComplementarios && !dentroDeEstudiosEntregados) {
      dentroDeExamenesComplementarios = false;
      dentroDeEstudiosEntregados = false;
    }

    if (dentroDeExamenesComplementarios) {
      paginasExamenesComplementarios.add(paginaActual);
    }
    if (dentroDeEstudiosEntregados) {
      paginasEstudiosEntregados.add(paginaActual);
    }
  }

  paginaActual = 1;
  const estudios: Estudio[] = [];
  const sesionesKinesiologia: Array<{ hoja: number; linea: string }> = [];

  const tipoDetectado = (base: string, linea: string) => {
    const tiposSinLugar = [
      "Kinesiología",
      "Perfil hepático",
      "Hemograma",
      "PCR",
      "VSG",
      "Glucemia",
      "Creatinina",
      "Urea",
      "Orina completa",
      "Ionograma"
    ];
    if (tiposSinLugar.includes(base)) return base;

    const zona =
      linea.match(
        /de\s+(t[oó]rax|abdomen|pelvis|columna|cerebro|cr[aá]neo|cuello|rodilla|hombro|hep[aá]tico|renal|tiroides|obst[eé]trica|venoso|arterial|car[oó]tideo)/i
      )?.[1] || "";
    return zona ? `${base} de ${zona}` : base;
  };

  const pushEstudio = (categoria: CategoriaEstudio, tipo: string, linea: string, numHoja: number) => {
    const fecha = linea.match(reFecha)?.[1] || null;
    const hora = linea.match(reHora)?.[1] || null;
    const informe_presente = reInforme.test(linea);
    const advertencias: string[] = [];
    if (!informe_presente) advertencias.push("sin informe");
    if (!fecha) advertencias.push("sin fecha");
    const lugar = linea.match(/servicio[:\s]+([a-z0-9\s]+)$/i)?.[1] || null;
    let resultado: string | null = null;
    const mRes = linea.match(/(resultado|impresi[oó]n|conclusi[oó]n)[:\s-]+(.{10,200})/i);
    if (mRes) resultado = mRes[2].trim();

    estudios.push({
      categoria,
      tipo: tipoDetectado(tipo, linea),
      fecha,
      hora,
      lugar,
      resultado,
      informe_presente,
      advertencias,
      numero_hoja: numHoja,
    });
  };

  for (let i = 0; i < lineas.length; i++) {
    const lRaw = lineas[i];
    const matchPagina = lRaw.match(rePagina);
    if (matchPagina) {
      paginaActual = Number(matchPagina[1]);
    }

    const l = lRaw.trim();
    if (!l) continue;

    const esExamenExterno = paginasExamenesComplementarios.has(paginaActual) ||
      paginasEstudiosEntregados.has(paginaActual);

    for (const [re, label] of patronesProc) {
      if (re.test(l) && label === "Kinesiología") {
        sesionesKinesiologia.push({ hoja: paginaActual, linea: l });
        pushEstudio("Procedimientos", label, l, paginaActual);
        break;
      }
    }

    if (esExamenExterno) continue;

    for (const [re, label] of patronesImagenes) {
      if (re.test(l)) {
        pushEstudio("Imagenes", label, l, paginaActual);
        break;
      }
    }
    for (const [re, label] of patronesLab) {
      if (re.test(l)) {
        pushEstudio("Laboratorio", label, l, paginaActual);
        break;
      }
    }

    for (const [re, label] of patronesProc) {
      if (re.test(l) && label !== "Kinesiología") {
        pushEstudio("Procedimientos", label, l, paginaActual);
        break;
      }
    }
  }

  const visto = new Set<string>();
  const dedup: Estudio[] = [];
  for (const e of estudios) {
    if (e.tipo === "Kinesiología") continue;
    const key = `${e.categoria}|${(e.tipo || "").toUpperCase()}|${e.fecha || "NA"}`;
    if (!visto.has(key)) {
      visto.add(key);
      dedup.push(e);
    }
  }

  const paginasUnicasKinesiologia = new Set(sesionesKinesiologia.map(s => s.hoja));
  const totalSesionesKinesiologia = paginasUnicasKinesiologia.size;

  // En lugar de generar múltiples entradas (una por hoja) para Kinesiología,
  // agregamos un único resumen visible en la UI.
  if (totalSesionesKinesiologia > 0) {
    dedup.push({
      categoria: "Procedimientos",
      tipo: `Sesiones de Kinesiología = ${totalSesionesKinesiologia}`,
      fecha: null,
      hora: null,
      lugar: null,
      resultado: null,
      informe_presente: true,
      advertencias: [],
      numero_hoja: Math.min(...Array.from(paginasUnicasKinesiologia)),
    });
  }

  const conteo = {
    total: dedup.length,
    imagenes: dedup.filter((e) => e.categoria === "Imagenes").length,
    laboratorio: dedup.filter((e) => e.categoria === "Laboratorio").length,
    procedimientos: dedup.filter((e) => e.categoria === "Procedimientos").length,
    kinesiologia: totalSesionesKinesiologia,
  };

  const erroresEstudios: string[] = [];
  for (const e of dedup) {
    if (!e.informe_presente && e.tipo !== "Kinesiología") {
      erroresEstudios.push(
        `Estudio sin informe: [${e.categoria}] ${e.tipo}${e.fecha ? ` (${e.fecha})` : ""} (Hoja ${e.numero_hoja})`
      );
    }
  }

  return { estudios: dedup, erroresEstudios, conteo };
}

/* =========================
   Comunicaciones (incluye estudios)
   ========================= */
function generarComunicacionesOptimizadas(
  erroresEvolucion: string[],
  advertencias: Advertencia[],
  erroresAltaMedica: string[],
  erroresEpicrisis: string[],
  erroresAdmision: string[],
  erroresFoja: string[],
  doctores: { residentes: Doctor[]; cirujanos: Doctor[]; otros: Doctor[] },
  resultadosFoja: ResultadosFoja,
  estudios: Estudio[],
  erroresEstudios: string[]
): Comunicacion[] {
  const comunicaciones: Comunicacion[] = [];

  if (erroresAdmision.length > 0) {
    comunicaciones.push({
      sector: "Admisión",
      responsable: "Personal de Admisión",
      motivo: "Datos de admisión incompletos",
      urgencia: "ALTA",
      errores: erroresAdmision,
      mensaje:
        "Se detectaron errores en los datos de admisión del paciente. Completar antes del envío a la Obra Social.",
    });
  }

  if (erroresEvolucion.length > 0) {
    const set = new Set<string>();
    const residentes = doctores.residentes.filter((r) => {
      if (set.has(r.nombre)) return false;
      set.add(r.nombre);
      return true;
    });
    const nombres =
      residentes.length > 0
        ? residentes.map((r) => `Dr/a ${r.nombre}`).join(", ")
        : "Equipo de Residentes";
    comunicaciones.push({
      sector: "Residentes",
      responsable: nombres,
      motivo: "Problemas en evoluciones médicas diarias",
      urgencia: "ALTA",
      errores: erroresEvolucion,
      mensaje:
        "Se detectaron días sin evolución médica diaria. Revisar y completar.",
    });
  }

  if (advertencias.length > 0) {
    comunicaciones.push({
      sector: "Residentes",
      responsable: "Equipo de Residentes",
      motivo: "Advertencias sobre evoluciones médicas",
      urgencia: "MEDIA",
      errores: advertencias.map((a) => a.descripcion),
      mensaje:
        "Se detectaron advertencias relacionadas con evoluciones. Revisar.",
    });
  }

  const faltaAlta = erroresAltaMedica.some((e) => /alta/i.test(e));
  if (faltaAlta) {
    const set = new Set<string>();
    const cir = doctores.cirujanos.filter((c) => {
      if (set.has(c.nombre)) return false;
      set.add(c.nombre);
      return true;
    });
    const nombres =
      cir.length > 0 ? cir.map((c) => `Dr/a ${c.nombre}`).join(", ") : "Cirujano Responsable";
    comunicaciones.push({
      sector: "Cirugía",
      responsable: nombres,
      motivo: "Falta registro de alta médica",
      urgencia: "CRÍTICA",
      errores: erroresAltaMedica.filter((e) => /alta/i.test(e)),
      mensaje:
        "Se detectó ausencia de alta médica. Completar antes del envío a la Obra Social.",
    });
  }

  if (erroresEpicrisis.length > 0) {
    const set = new Set<string>();
    const cir = doctores.cirujanos.filter((c) => {
      if (set.has(c.nombre)) return false;
      set.add(c.nombre);
      return true;
    });
    const nombres =
      cir.length > 0 ? cir.map((c) => `Dr/a ${c.nombre}`).join(", ") : "Cirujano Responsable";
    comunicaciones.push({
      sector: "Cirugía",
      responsable: nombres,
      motivo: "Advertencia: epicrisis no detectada",
      urgencia: "MEDIA",
      errores: erroresEpicrisis,
      mensaje: "No se encontró documento de epicrisis. Verificar si es necesario.",
    });
  }

  // Recolectar todos los errores de todas las foja
  const todosErroresFoja: string[] = [...erroresFoja, ...resultadosFoja.errores_generales];
  for (const foja of resultadosFoja.fojas) {
    todosErroresFoja.push(...foja.errores);
  }

  if (todosErroresFoja.length > 0) {
    const set = new Set<string>();
    const cir = doctores.cirujanos.filter((c) => {
      if (set.has(c.nombre)) return false;
      set.add(c.nombre);
      return true;
    });
    const nombres =
      cir.length > 0 ? cir.map((c) => `Dr/a ${c.nombre}`).join(", ") : "Cirujano Responsable";
    const mensaje = resultadosFoja.fojas.length > 1
      ? `Se detectaron inconsistencias en ${resultadosFoja.fojas.length} foja quirúrgicas. Completar.`
      : "Se detectaron inconsistencias en la foja quirúrgica. Completar.";
    comunicaciones.push({
      sector: "Cirugía",
      responsable: nombres,
      motivo: "Problemas en foja quirúrgica",
      urgencia: "ALTA",
      errores: todosErroresFoja,
      mensaje,
    });
  }

  // Verificar bisturí armónico en todas las foja
  const tieneBisturiArmonico = resultadosFoja.fojas.some(f => f.bisturi_armonico === "SI");
  if (tieneBisturiArmonico) {
    const set = new Set<string>();
    const cir = doctores.cirujanos.filter((c) => {
      if (set.has(c.nombre)) return false;
      set.add(c.nombre);
      return true;
    });
    const nombres =
      cir.length > 0 ? cir.map((c) => `Dr/a ${c.nombre}`).join(", ") : "Cirujano Responsable";
    comunicaciones.push({
      sector: "Cirugía",
      responsable: nombres,
      motivo: "Uso de bisturí armónico - Requiere autorización especial",
      urgencia: "CRÍTICA",
      errores: ["Se utilizó bisturí armónico"],
      mensaje:
        "Se detectó uso de BISTURÍ ARMÓNICO. Verificar autorización de la Obra Social previa a facturación.",
    });
  }

  const sinInforme = estudios.filter((e) => !e.informe_presente);
  if (sinInforme.length > 0) {
    const list = (cat: CategoriaEstudio) =>
      sinInforme
        .filter((e) => e.categoria === cat)
        .map((e) => `${e.tipo}${e.fecha ? ` (${e.fecha})` : ""}`)
        .join("; ");

    if (sinInforme.some((e) => e.categoria === "Imagenes")) {
      comunicaciones.push({
        sector: "Diagnóstico por Imágenes",
        responsable: "Jefe/a de Servicio",
        motivo: "Estudios de imágenes sin informe",
        urgencia: "ALTA",
        errores: sinInforme
          .filter((e) => e.categoria === "Imagenes")
          .map(
            (e) => `[Imagenes] ${e.tipo}${e.fecha ? ` (${e.fecha})` : ""}`
          ),
        mensaje: `Faltan informes en: ${list("Imagenes")}. Adjuntar antes del envío a la Obra Social.`,
      });
    }
    if (sinInforme.some((e) => e.categoria === "Laboratorio")) {
      comunicaciones.push({
        sector: "Laboratorio",
        responsable: "Jefe/a de Laboratorio",
        motivo: "Estudios de laboratorio sin resultado/informe",
        urgencia: "MEDIA",
        errores: sinInforme
          .filter((e) => e.categoria === "Laboratorio")
          .map(
            (e) => `[Laboratorio] ${e.tipo}${e.fecha ? ` (${e.fecha})` : ""}`
          ),
        mensaje: `Faltan resultados claros en: ${list(
          "Laboratorio"
        )}. Adjuntar reporte normalizado.`,
      });
    }
    if (sinInforme.some((e) => e.categoria === "Procedimientos")) {
      comunicaciones.push({
        sector: "Endoscopía / Procedimientos",
        responsable: "Responsable de Procedimientos",
        motivo: "Procedimientos sin informe",
        urgencia: "ALTA",
        errores: sinInforme
          .filter((e) => e.categoria === "Procedimientos")
          .map(
            (e) =>
              `[Procedimientos] ${e.tipo}${e.fecha ? ` (${e.fecha})` : ""}`
          ),
        mensaje:
          "Faltan informes y conclusiones de procedimientos. Cargar documentación.",
      });
    }
  }

  if (erroresEstudios.length > 0) {
    comunicaciones.push({
      sector: "Coordinación de Historias Clínicas",
      responsable: "Equipo Coordinación",
      motivo: "Normalización de estudios",
      urgencia: "MEDIA",
      errores: erroresEstudios,
      mensaje:
        "Se detectaron estudios sin informe o sin fecha. Normalizar documentación para auditoría externa.",
    });
  }

  return comunicaciones;
}

/* =========================
   Handler principal
   ========================= */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const pdfText = formData.get("pdfText") as string;
    const nombreArchivo = formData.get("nombreArchivo") as string;

    if (!pdfText || !nombreArchivo) {
      return new Response(
        JSON.stringify({ error: "Faltan datos requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { ingreso, alta } = extractIngresoAlta(pdfText);

    if (!ingreso || Number.isNaN(ingreso.getTime())) {
      return new Response(
        JSON.stringify({
          error: "No se pudo extraer la fecha de ingreso (dato obligatorio)",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const altaValida = !!(alta && !Number.isNaN(alta.getTime()));
    const fechaAlta = altaValida ? alta! : new Date();
    const pacienteInternado = !altaValida;

    const datosPaciente = extraerDatosPaciente(pdfText);

    const {
      errores: erroresEvolucion,
      evolucionesRepetidas,
      advertencias,
      diasConEvolucion,
    } = extraerEvolucionesMejorado(
      pdfText,
      ingreso,
      fechaAlta,
      datosPaciente.estaEnUCI
    );

    let erroresAltaMedica: string[] = [];
    let erroresEpicrisis: string[] = [];
    if (pacienteInternado) {
      erroresAltaMedica = ["⚠️ No aplica: paciente internado (sin alta registrada)"];
      erroresEpicrisis = ["⚠️ No aplica: paciente internado (sin alta registrada)"];
    } else {
      erroresAltaMedica = verificarAltaMedica(pdfText);
      erroresEpicrisis = verificarEpicrisis(pdfText);
    }

    const doctores = extraerDoctores(pdfText);
    const resultadosFoja = analizarFojaQuirurgica(pdfText);



    // Validar equipo quirúrgico único para cada foja
    for (const foja of resultadosFoja.fojas) {
      const erroresEquipoUnico = validarEquipoQuirurgicoUnico(foja);
      if (erroresEquipoUnico.length > 0) {
        foja.errores.push(...erroresEquipoUnico);
      }
    }

    const {
      estudios,
      erroresEstudios,
      conteo: estudiosConteo,
    } = extraerEstudios(pdfText);

    // ===== NUEVO: Análisis de Terapia Intensiva/Intermedia =====
    const resultadoTerapia = analizarTerapia(
      pdfText,
      ingreso,
      fechaAlta,
      datosPaciente.estaEnUCI
    );

    // ===== NUEVO: Detectar Interconsultas =====
    const interconsultas = extraerInterconsultas(pdfText);

    // ===== NUEVO: Detectar Prácticas Excluidas =====
    const practicasExcluidas = detectarPracticasExcluidas(pdfText);

    // ===== NUEVO: Detectar Endoscopías =====
    const endoscopias = detectarEndoscopias(pdfText);

    // ===== NUEVO: Detectar Prácticas Ambulatorias =====
    const practicasAmbulatorias = detectarPracticasAmbulatorias(
      pdfText,
      ingreso,
      fechaAlta
    );

    // Recolectar todos los errores de foja para pasar a comunicaciones
    const todosErroresFoja: string[] = [...resultadosFoja.errores_generales];
    for (const foja of resultadosFoja.fojas) {
      todosErroresFoja.push(...foja.errores);
    }

    const comunicaciones = generarComunicacionesOptimizadas(
      erroresEvolucion,
      advertencias,
      erroresAltaMedica,
      erroresEpicrisis,
      datosPaciente.errores_admision,
      todosErroresFoja,
      doctores,
      resultadosFoja,
      estudios,
      erroresEstudios
    );

    const totalErrores =
      datosPaciente.errores_admision.length +
      erroresEvolucion.length +
      todosErroresFoja.length +
      (pacienteInternado ? 0 : erroresAltaMedica.length) +
      (pacienteInternado ? 0 : erroresEpicrisis.length) +
      erroresEstudios.length;

    const diasHospitalizacion = diasHospitalizacionCalc(
      ingreso,
      altaValida ? fechaAlta : null
    );

    // Generar lista de días de internación
    // Convertir estudios al formato esperado
    const estudiosParaLista = estudios.map(e => ({
      tipo: e.tipo,
      categoria: (e.categoria.charAt(0).toUpperCase() + e.categoria.slice(1)) as any,
      fecha: e.fecha,
      informe_presente: true,
      advertencias: []
    }));

    const listaDiasInternacion = generarListaDiasInternacion(
      ingreso,
      fechaAlta,
      diasConEvolucion,
      resultadosFoja,
      estudiosParaLista,
      datosPaciente.estaEnUCI
    );

    const resultado = {
      nombreArchivo,
      datosPaciente,
      fechaIngreso: toLocalISO(ingreso),
      fechaAlta: toLocalISO(fechaAlta),
      pacienteInternado,
      diasHospitalizacion,
      erroresAdmision: datosPaciente.errores_admision,
      erroresEvolucion,
      evolucionesRepetidas,
      advertencias,
      erroresAltaMedica,
      erroresEpicrisis,
      erroresFoja: todosErroresFoja,
      // Mantener compatibilidad con frontend: estructura híbrida (nueva + antigua)
      resultadosFoja: {
        // Nueva estructura (array de foja) - para futuras mejoras
        fojas: resultadosFoja.fojas,
        errores_generales: resultadosFoja.errores_generales,
        // Estructura antigua para compatibilidad con frontend actual
        bisturi_armonico: resultadosFoja.fojas.length > 0
          ? resultadosFoja.fojas[0].bisturi_armonico
          : (resultadosFoja.fojas.some(f => f.bisturi_armonico === "SI") ? "SI" :
            resultadosFoja.fojas.some(f => f.bisturi_armonico === "NO") ? "NO" : null),
        equipo_quirurgico: resultadosFoja.fojas.length > 0
          ? resultadosFoja.fojas[0].equipo_quirurgico
          : [],
        fecha_cirugia: resultadosFoja.fojas.length > 0
          ? resultadosFoja.fojas[0].fecha_cirugia
          : null,
        hora_inicio: resultadosFoja.fojas.length > 0
          ? resultadosFoja.fojas[0].hora_inicio
          : null,
        hora_fin: resultadosFoja.fojas.length > 0
          ? resultadosFoja.fojas[0].hora_fin
          : null,
        errores: todosErroresFoja,
      } as any, // Type assertion para permitir estructura híbrida
      doctores,
      estudios,
      estudiosConteo,
      erroresEstudios,
      sesionesKinesiologia: estudiosConteo.kinesiologia,
      comunicaciones,
      totalErrores,
      estado: totalErrores > 0 ? "Pendiente de corrección" : "Aprobado",
      listaDiasInternacion, // Nueva lista de días con su estado
      // ===== NUEVO: Datos de Terapia Intensiva/Intermedia =====
      resultadoTerapia: datosPaciente.estaEnUCI ? resultadoTerapia : undefined,
      diasTerapiaIntensiva: resultadoTerapia.diasTerapiaIntensiva,
      diasTerapiaIntermedia: resultadoTerapia.diasTerapiaIntermedia,
      diasInternacionGeneral: resultadoTerapia.diasInternacionGeneral,
      // ===== NUEVO: Interconsultas =====
      interconsultas,
      // ===== NUEVO: Prácticas Excluidas =====
      practicasExcluidas,
      // ===== NUEVO: Endoscopías =====
      endoscopias,
      // ===== NUEVO: Prácticas Ambulatorias =====
      practicasAmbulatorias,
    };

    // Persistencia
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("hc_auditorias")
      .insert({
        nombre_archivo: nombreArchivo,
        nombre_paciente: datosPaciente.nombre || "No encontrado",
        dni_paciente: datosPaciente.dni || "No encontrado",
        obra_social: datosPaciente.obra_social || "No encontrada",
        habitacion: datosPaciente.habitacion || "No encontrada",
        fecha_ingreso: toLocalISO(ingreso),
        fecha_alta: pacienteInternado ? null : toLocalISO(fechaAlta),
        total_errores: totalErrores,
        errores_admision: datosPaciente.errores_admision.length,
        errores_evoluciones: erroresEvolucion.length,
        errores_foja_quirurgica: todosErroresFoja.length,
        errores_alta_medica: pacienteInternado ? 0 : erroresAltaMedica.length,
        errores_epicrisis: pacienteInternado ? 0 : erroresEpicrisis.length,
        bisturi_armonico: resultadosFoja.fojas.some(f => f.bisturi_armonico === "SI") ? "SI" :
          resultadosFoja.fojas.some(f => f.bisturi_armonico === "NO") ? "NO" : "No determinado",
        estado: totalErrores > 0 ? "Pendiente de corrección" : "Aprobado",
        estudios_total: estudiosConteo.total,
        estudios_imagenes: estudiosConteo.imagenes,
        estudios_laboratorio: estudiosConteo.laboratorio,
        estudios_procedimientos: estudiosConteo.procedimientos,
        sesiones_kinesiologia: estudiosConteo.kinesiologia,
        estudios,
        errores_estudios: erroresEstudios,
        errores_detalle: [
          ...datosPaciente.errores_admision.map((e) => ({
            tipo: "Admisión",
            descripcion: e,
          })),
          ...erroresEvolucion.map((e) => ({ tipo: "Evolución", descripcion: e })),
          ...advertencias.map((a) => ({ tipo: a.tipo, descripcion: a.descripcion })),
          ...resultadosFoja.errores_generales.map((e) => ({
            tipo: "Foja Quirúrgica",
            descripcion: e,
          })),
          ...resultadosFoja.fojas.flatMap((foja, idx) =>
            foja.errores.map((e) => ({
              tipo: `Foja Quirúrgica ${resultadosFoja.fojas.length > 1 ? `#${idx + 1}` : ''}`,
              descripcion: e,
            }))
          ),
          ...(pacienteInternado ? [] : erroresAltaMedica.map((e) => ({ tipo: "Alta Médica", descripcion: e }))),
          ...(pacienteInternado ? [] : erroresEpicrisis.map((e) => ({ tipo: "Epicrisis", descripcion: e }))),
          ...erroresEstudios.map((e) => ({ tipo: "Estudios", descripcion: e })),
        ],
        comunicaciones,
        datos_adicionales: {
          doctores,
          resultadosFoja,
          diasHospitalizacion,
          advertencias,
        },
      })
      .select();

    if (error) {
      console.error("Error guardando en BD:", error);
      throw new Error(`Error al guardar en la base de datos: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.error("No se devolvieron datos tras el insert");
      throw new Error("No se pudo crear el registro de auditoría");
    }

    const auditoriaId = data[0].id;


    // ========= NUEVO: Guardar médicos y errores por médico (con logs) =========
    console.log("BUILD auditar-pdf 2025-10-30 19:35");
    console.log("DEBUG: Iniciando guardado de médicos...");
    console.log("DEBUG: resultadosFoja completo:", resultadosFoja);
    console.log("DEBUG: Número de foja encontradas:", resultadosFoja.fojas.length);

    const medicosIds: Record<string, string> = {};

    // Iterar sobre todas las foja quirúrgicas
    for (let idxFoja = 0; idxFoja < resultadosFoja.fojas.length; idxFoja++) {
      const foja = resultadosFoja.fojas[idxFoja];
      console.log(`DEBUG: Procesando foja #${idxFoja + 1}, equipo quirúrgico length:`, foja.equipo_quirurgico?.length);

      if (foja.equipo_quirurgico && foja.equipo_quirurgico.length > 0) {
        console.log("DEBUG: Hay equipo quirúrgico, procesando...");

        const medicosToInsert = foja.equipo_quirurgico.map((m) => ({
          auditoria_id: auditoriaId,
          nombre_completo: m.nombre,
          rol: m.rol,
          fecha_cirugia: foja.fecha_cirugia || null,
          nombre_archivo: nombreArchivo,
          paciente_dni: datosPaciente.dni || "No encontrado",
          paciente_nombre: datosPaciente.nombre || "No encontrado",
        }));

        console.log("DEBUG: medicosToInsert a guardar:", medicosToInsert);

        const { data: medicosData, error: errorMedicos } = await supabase
          .from("hc_medicos_foja_quirurgica")
          .insert(medicosToInsert)
          .select("id, nombre_completo, rol");

        console.log("DEBUG: resultado insert medicos:", medicosData);
        console.log("DEBUG: error insert medicos:", errorMedicos);

        if (errorMedicos) {
          console.error("Error guardando médicos en BD:", errorMedicos);
        } else if (medicosData) {
          for (const m of medicosData) {
            const key = `${m.nombre_completo}|${m.rol}`;
            medicosIds[key] = m.id;
          }
        }
      } else {
        console.log(`DEBUG: NO hay equipo quirúrgico en foja #${idxFoja + 1}`);
      }
    }

    const erroresMedicosToInsert: Array<{
      auditoria_id: string | undefined;
      medico_id: string;
      nombre_medico: string;
      rol_medico: string;
      tipo_error: "Foja Quirúrgica" | "Epicrisis" | "Alta Médica" | "Bisturí Armónico";
      descripcion: string;
      severidad: "CRÍTICO" | "ALTA" | "MEDIA" | "ADVERTENCIA";
    }> = [];

    const agregarError = (
      nombre: string,
      rol: string,
      tipo: "Foja Quirúrgica" | "Epicrisis" | "Alta Médica" | "Bisturí Armónico",
      desc: string,
      severidad: "CRÍTICO" | "ALTA" | "MEDIA" | "ADVERTENCIA"
    ) => {
      const key = `${nombre}|${rol}`;
      const medicoId = medicosIds[key];
      if (medicoId) {
        erroresMedicosToInsert.push({
          auditoria_id: auditoriaId,
          medico_id: medicoId,
          nombre_medico: nombre,
          rol_medico: rol,
          tipo_error: tipo,
          descripcion: desc,
          severidad,
        });
      }
    };

    // Agregar errores de foja quirúrgica para cada foja
    for (const foja of resultadosFoja.fojas) {
      if (foja.errores?.length) {
        foja.equipo_quirurgico
          .filter((m) => m.rol === "cirujano")
          .forEach((c) => {
            foja.errores.forEach((e) =>
              agregarError(c.nombre, "cirujano", "Foja Quirúrgica", e, "CRÍTICO")
            );
          });
      }

      if (foja.bisturi_armonico === "SI") {
        foja.equipo_quirurgico
          .filter((m) => m.rol === "cirujano")
          .forEach((c) => {
            agregarError(
              c.nombre,
              "cirujano",
              "Bisturí Armónico",
              "Se utilizó bisturí armónico - Requiere autorización especial",
              "CRÍTICO"
            );
          });
      }
    }

    // Errores generales de foja (no asociados a una foja específica)
    if (resultadosFoja.errores_generales?.length) {
      // Para errores generales, usar todos los cirujanos de todas las foja
      const todosCirujanos = resultadosFoja.fojas.flatMap(f =>
        f.equipo_quirurgico.filter(m => m.rol === "cirujano")
      );
      const cirujanosUnicos = Array.from(new Set(todosCirujanos.map(c => c.nombre)));
      for (const nombreCirujano of cirujanosUnicos) {
        resultadosFoja.errores_generales.forEach((e) =>
          agregarError(nombreCirujano, "cirujano", "Foja Quirúrgica", e, "CRÍTICO")
        );
      }
    }

    if (!pacienteInternado && erroresEpicrisis?.length) {
      // Para epicrisis, usar todos los cirujanos de todas las foja
      const todosCirujanos = resultadosFoja.fojas.flatMap(f =>
        f.equipo_quirurgico.filter(m => m.rol === "cirujano")
      );
      const cirujanosUnicos = Array.from(new Set(todosCirujanos.map(c => c.nombre)));
      for (const nombreCirujano of cirujanosUnicos) {
        erroresEpicrisis.forEach((e) =>
          agregarError(nombreCirujano, "cirujano", "Epicrisis", e, "MEDIA")
        );
      }
    }

    if (!pacienteInternado && erroresAltaMedica?.length) {
      // Para alta médica, usar todos los cirujanos de todas las foja
      const todosCirujanos = resultadosFoja.fojas.flatMap(f =>
        f.equipo_quirurgico.filter(m => m.rol === "cirujano")
      );
      const cirujanosUnicos = Array.from(new Set(todosCirujanos.map(c => c.nombre)));
      for (const nombreCirujano of cirujanosUnicos) {
        erroresAltaMedica.forEach((e) => {
          const sev = /crítico/i.test(e) ? "CRÍTICO" : "ALTA";
          agregarError(nombreCirujano, "cirujano", "Alta Médica", e, sev);
        });
      }
    }

    if (erroresMedicosToInsert.length > 0) {
      const { error: errorErroresMedicos } = await supabase
        .from("hc_errores_medicos")
        .insert(erroresMedicosToInsert);

      console.log("DEBUG: insert errores_medicos error:", errorErroresMedicos);
      if (errorErroresMedicos) {
        console.error("Error guardando errores de médicos:", errorErroresMedicos);
      }
    }
    // ========= FIN NUEVO =========

    return new Response(
      JSON.stringify({ success: true, resultado, auditoriaId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error procesando PDF:", error);
    return new Response(
      JSON.stringify({
        error: "Error procesando el archivo PDF",
        details: error?.message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});