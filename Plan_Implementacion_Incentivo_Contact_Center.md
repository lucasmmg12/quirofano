# Plan Integral de Implementación: Esquema de Incentivos y Productividad - Contact Center
**Sanatorio Argentino | Innovación y Transformación Digital & Recursos Humanos**  
**Fecha:** Septiembre 2026  
**Documento Base:** `Propuesta_Incentivo_Contact_Center_v13.pdf`  
**Destinatarios:** Lucas Marinero, Carolina Balaguer (RRHH), Lic. Sergio Femenía  

---

## 1. Resumen Ejecutivo del Esquema (Propuesta v13)

El nuevo modelo de compensación variable para el Contact Center moderniza el adicional histórico fijo, convirtiéndolo en un **esquema de productividad transparente, medible y acumulativo** sin perjudicar los derechos adquiridos de las colaboradoras.

### Pilares Fundamentales
1. **Piso Garantizado (100% Intacto):**  
   - Se mantiene el adicional histórico de **$139.470,59** garantizado al 100% para cada operadora. No sufre deducciones ni penalizaciones por no alcanzar metas variables.
2. **Potencial Máximo de Duplicación (Techo 200%):**  
   - Mediante productividad se puede percibir un adicional variable de hasta **+$139.470,59**, alcanzando un incentivo total de **$278.941,18** por colaboradora.
3. **Independencia Total de Bolsas (50% / 25% / 25%):**  
   - Las tres métricas se liquidan de forma aislada. Si una métrica no llega a la meta, no invalida ni bloquea el cobro de las otras dos.
4. **Escalonamiento Progresivo (10 Niveles):**  
   - Se premia cada tramo de mejora a partir del umbral base, evitando la frustración de esquemas binarios (todo o nada).

### Estructura de Bolsas y Ponderación

| Bolsa / Indicador | Alcance | Ponderación | Adicional Máximo Variable | Umbral Base (Escalón 0) | Meta Objetivo (Escalón 5) | Tope Máximo (Escalón 10) | Paso por Escalón |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Mensajes / Conversaciones** | Grupal | 50% | **+$69.735,29** | 6.500 msjs | 7.500 msjs (+$34.867,65) | 8.500 msjs (+$69.735,29) | +200 msjs = +$6.973,53 |
| **2. Turnos Otorgados** | Grupal | 25% | **+$34.867,65** | 3.052 turnos | 3.687 turnos (+$17.433,82) | 4.324 turnos (+$34.867,65) | +127 turnos = +$3.486,76 |
| **3. Asistencia Efectiva** | Individual | 25% | **+$34.867,65** | 50,0% | 55,0% (+$17.433,82) | 60,0% o más (+$34.867,65) | +1,0% asoc. = +$3.486,76 |
| **TOTAL VARIABLE ADICIONAL** | - | 100% | **+$139.470,59** | - | **+$69.735,29** | **+$139.470,59** | - |
| **TOTAL LIQUIDABLE (Base + Var)**| - | - | **$278.941,18** | **$139.470,59** | **$209.205,88** | **$278.941,18** | - |

---

## 2. Respuestas a los Puntos de Recursos Humanos (Carolina Balaguer)

A continuación se detallan las definiciones operativas para consensuar en la reunión con el Lic. Sergio Femenía:

### Punto 1: Metodología de Medición y Validación de Indicadores
* **Mensajes Respondidos / Conversaciones Gestionadas (Grupal):**
  - *Fuente:* Base de datos analítica del sistema CRM / WhatsApp (`contact_center_conversations` y `contact_center_messages`).
  - *Criterio de Inclusión:* Conversaciones entrantes que fueron atendidas o transferidas a agentes humanas del Contact Center (excluye interacciones resueltas 100% por bot sin derivación).
* **Turnos Otorgados (Grupal):**
  - *Fuente:* Sistema SALUS vía vista `[SALUS].[dbo].[VLISE_Visitas]`.
  - *Criterio de Inclusión:* Citas creadas en el mes calendario (`[Fecha Hora Creacion] >= 1° del mes y < 1° del mes siguiente`), donde `[Usuario Creacion Nombre]` coincide con el equipo y `[Paciente] <> 'TURNOS ONLINE, PACIENTE'`.
* **Asistencia Efectiva de Pacientes (Individual):**
  - *Cálculo:*  
    $$\text{Tasa de Asistencia Individual} = \frac{\text{Turnos Asistidos}}{\text{Turnos Asistidos} + \text{Ausencias Injustificadas}} \times 100$$
  - *Exclusiones Validadas:* No se penaliza a la operadora por turnos cancelados o reprogramados con previo aviso del paciente antes de la fecha de la cita.

---

### Punto 2: Determinación de la Asistencia Individual y Ventana Temporal
* **El Reto Operativo:** Una cita asignada el día 29 del mes en curso puede tener su fecha de visita médica en los primeros días del mes siguiente. Si se midiera sobre turnos creados en el mes, habría citas aún no ejecutadas al día de corte.
* **Solución Técnica Consensuada (Enfoque por Fecha de Visita):**
  - Para calcular la variable de asistencia de cada operadora en la liquidación del mes $M$, se auditan **las citas cuya `[Fecha Visita]` tuvo lugar durante el mes $M$ y cuyo `[Usuario Creacion Nombre]` haya sido dicha operadora**.
  - De esta manera, al primer día del mes siguiente, el 100% de esas visitas ya tiene un estado definitivo en SALUS (`Realizada / Asistió`, `Ausente injustificada`, `Anulada`).
  - Esto garantiza **cierre inmediato sin demoras** para que RRHH liquide en tiempo y forma.

---

### Punto 3: Licencias, Vacaciones y Cambios en la Dotación (Ajuste FTE)
* **Principio de Equidad:** Las colaboradoras no deben verse perjudicadas en las metas grupales por gozar de licencias legales (enfermedad, maternidad, vacaciones reglamentarias).
* **Calibración Base de Dotación:** La meta de 7.500 mensajes y 3.687 turnos corresponde a una capacidad instalada nominal de **3,5 FTE** (3 operadoras plenas a 2.000 msjs + 1 ingresante al 50% = 1.500 msjs).
* **Fórmula de Prorrateo Dinámico por Días Trabajados:**
  - Se calcula el coeficiente de dotación efectiva del mes:
    $$\text{FTE\_Efectivo} = \sum_{i=1}^{N} \frac{\text{Días Hábiles Trabajados por Agente } i}{\text{Días Hábiles Laborales del Mes}}$$
  - Si una agente tiene licencia aprobada por RRHH durante $D$ días en un mes de $H$ días hábiles:
    $$\text{Target Grupal Ajustado} = \text{Target Nominal} \times \left( \frac{\text{FTE\_Efectivo}}{\text{FTE\_Nominal}} \right)$$
  - *Ejemplo práctico:* Si una agente estuvo de vacaciones medio mes (10 de 20 días hábiles), la dotación efectiva pasa de 3,5 a 3,0 FTE. El target de mensajes del Escalón 5 se ajusta automáticamente de 7.500 a 6.428 mensajes. El equipo no sufre un castigo por la ausencia reglamentaria.

---

### Punto 4: Curva de Aprendizaje de Nuevas Incorporaciones
* **Caso Específico Érica Leal:**
  - **Agosto 2026 (Ingreso a mediados de mes):** Período de inducción e instalación. Participación con piso garantizado histórico ($139.470,59) y absorción del 25% de la carga operativa.
  - **Septiembre y Octubre 2026 (Curva al 50%):** Su aporte esperado al equipo se pondera en 1.500 mensajes/mes (50% de una operadora experimentada).
  - **Noviembre 2026 en adelante (Plena Autonomía - 100%):** Se integra con objetivo de 2.000 mensajes, elevando el objetivo del equipo a 8.000 mensajes para 4 operadoras plenas.
* **Caso María Antonella Acosta:**
  - Baja registrada en septiembre de 2026. Se le liquida su parte proporcional según los días efectivamente trabajados hasta su cese, según las normas laborales de RRHH.

---

### Punto 5: Periodicidad, Modalidad y Responsable de Validación
* **Periodicidad:** Mensual, liquidada a mes vencido.
* **Cronograma Operativo de Cierre:**
  - **Día 1 al 2 hábil del mes siguiente:** Ejecución del job automático de consolidación en el sistema ADM-QUI (cruce SALUS + CRM WhatsApp).
  - **Día 3 hábil:** Revisión y firma del Informe de Cierre de Productividad por el responsable del área (**Lucas Marinero**).
  - **Día 4 hábil:** Envío formal del reporte a Recursos Humanos (**Carolina Balaguer**) para su carga en el recibo de haberes bajo el ítem *"Adicional Variable Productividad Contact Center"*.

---

### Punto 6: Cronograma de Entrada en Vigencia
* **Fase Piloto / Simulación (Agosto - Septiembre 2026):**
  - Corrida retroactiva con datos reales de agosto y septiembre para contrastar el comportamiento de las métricas con el equipo y validar los números con Sergio Femenía.
* **Entrada en Vigencia Formal:**
  - **1 de Octubre de 2026** (liquidándose en los primeros días de Noviembre 2026 con los haberes de Octubre).

---

## 3. Modelo Matemático y Mapeo de Tablas de Liquidación

### 3.1. Bolsa 1: Mensajes / Conversaciones (Grupal - Ponderación 50%)
* **Target Base:** 6.500 | **Meta Objetivo:** 7.500 | **Tope:** 8.500  
* **Valor por Escalón:** $6.973,53

| Escalón | Rango de Mensajes Grupales | Monto Variable por Operadora |
| :---: | :---: | :---: |
| **0** | < 6.700 | $0,00 |
| **1** | 6.700 - 6.899 | $6.973,53 |
| **2** | 6.900 - 7.099 | $13.947,06 |
| **3** | 7.100 - 7.299 | $20.920,59 |
| **4** | 7.300 - 7.499 | $27.894,12 |
| **5 (Meta)** | 7.500 - 7.699 | **$34.867,65** |
| **6** | 7.700 - 7.899 | $41.841,17 |
| **7** | 7.900 - 8.099 | $48.814,70 |
| **8** | 8.100 - 8.299 | $55.788,23 |
| **9** | 8.300 - 8.499 | $62.761,76 |
| **10 (Tope)** | $\ge$ 8.500 | **$69.735,29** |

---

### 3.2. Bolsa 2: Turnos Otorgados (Grupal - Ponderación 25%)
* **Target Base:** 3.052 | **Meta Objetivo:** 3.687 | **Tope:** 4.324  
* **Paso:** ~127 turnos | **Valor por Escalón:** $3.486,76

| Escalón | Rango de Turnos Otorgados | Monto Variable por Operadora |
| :---: | :---: | :---: |
| **0** | < 3.179 | $0,00 |
| **1** | 3.179 - 3.305 | $3.486,76 |
| **2** | 3.306 - 3.432 | $6.973,53 |
| **3** | 3.433 - 3.559 | $10.460,29 |
| **4** | 3.560 - 3.686 | $13.947,06 |
| **5 (Meta)** | 3.687 - 3.813 | **$17.433,82** |
| **6** | 3.814 - 3.940 | $20.920,59 |
| **7** | 3.941 - 4.067 | $24.407,35 |
| **8** | 4.068 - 4.194 | $27.894,12 |
| **9** | 4.195 - 4.323 | $31.380,88 |
| **10 (Tope)** | $\ge$ 4.324 | **$34.867,65** |

---

### 3.3. Bolsa 3: Asistencia Efectiva (Individual - Ponderación 25%)
* **Target Base:** 50,0% | **Meta Objetivo:** 55,0% | **Tope:** 60,0%  
* **Paso:** +1,0% | **Valor por Escalón:** $3.486,76

| Escalón | % Asistencia Individual | Monto Variable Individual |
| :---: | :---: | :---: |
| **0** | < 51,0% | $0,00 |
| **1** | 51,0% - 51,9% | $3.486,76 |
| **2** | 52,0% - 52,9% | $6.973,53 |
| **3** | 53,0% - 53,9% | $10.460,29 |
| **4** | 54,0% - 54,9% | $13.947,06 |
| **5 (Meta)** | 55,0% - 55,9% | **$17.433,82** |
| **6** | 56,0% - 56,9% | $20.920,59 |
| **7** | 57,0% - 57,9% | $24.407,35 |
| **8** | 58,0% - 58,9% | $27.894,12 |
| **9** | 59,0% - 59,9% | $31.380,88 |
| **10 (Tope)** | $\ge$ 60,0% | **$34.867,65** |

---

## 4. Arquitectura de Datos y Extracción SQL en SALUS

### 4.1. Consulta Optimizada para Indicadores de Turnos y Asistencia
Se consolida la consulta analítica sobre `[SALUS].[dbo].[VLISE_Visitas]` parametrizada para el mes de análisis:

```sql
-- Consolidación Mensual de Productividad y Asistencia Contact Center
DECLARE @FechaInicio DATETIME = '2026-08-01 00:00:00';
DECLARE @FechaFin    DATETIME = '2026-09-01 00:00:00';

-- 1. Métricas de Turnos Creados en el Período (Bolsa 2 Grupal)
SELECT 
    [Usuario Creacion Nombre] AS Agente,
    COUNT(DISTINCT [idVisita]) AS TurnosCreados
FROM [SALUS].[dbo].[VLISE_Visitas]
WHERE [Fecha Hora Creacion] >= @FechaInicio
  AND [Fecha Hora Creacion] <  @FechaFin
  AND [Usuario Creacion Nombre] IN (
      'OLIVIER ESQUIVEL, SOFIA FERNANDA',
      'ACOSTA ESQUIVEL, MARIA ANTONELLA',
      'JACQUES SORIA, VIRGINIA',
      'AGUILERA CARDOZO, DANIELA ROMINA',
      'LEAL,ERICA'
  )
  AND [Paciente] <> 'TURNOS ONLINE, PACIENTE'
GROUP BY [Usuario Creacion Nombre];

-- 2. Métricas de Asistencia Efectiva (Bolsa 3 Individual)
-- Se toman los turnos cuya cita médica ocurrió en el mes evaluado
SELECT 
    [Usuario Creacion Nombre] AS Agente,
    COUNT(DISTINCT [idVisita]) AS TotalCitasProgramadas,
    SUM(CASE WHEN LOWER([Asistencia]) LIKE '%asist%' OR LOWER([Asistencia]) LIKE '%realiz%' THEN 1 ELSE 0 END) AS CitasAsistidas,
    SUM(CASE WHEN [Asistencia] IS NULL OR LOWER([Asistencia]) LIKE '%injustificada%' OR LOWER([Asistencia]) LIKE '%ausen%' THEN 1 ELSE 0 END) AS AusenciasInjustificadas,
    ROUND(
        (SUM(CASE WHEN LOWER([Asistencia]) LIKE '%asist%' OR LOWER([Asistencia]) LIKE '%realiz%' THEN 1.0 ELSE 0.0 END) /
        NULLIF(SUM(CASE WHEN LOWER([Asistencia]) NOT LIKE '%anulad%' AND LOWER([Asistencia]) NOT LIKE '%cancel%' THEN 1.0 ELSE 0.0 END), 0)
        ) * 100.0, 2
    ) AS PorcentajeAsistenciaEfectiva
FROM [SALUS].[dbo].[VLISE_Visitas]
WHERE [Fecha Visita] >= @FechaInicio
  AND [Fecha Visita] <  @FechaFin
  AND [Usuario Creacion Nombre] IN (
      'OLIVIER ESQUIVEL, SOFIA FERNANDA',
      'ACOSTA ESQUIVEL, MARIA ANTONELLA',
      'JACQUES SORIA, VIRGINIA',
      'AGUILERA CARDOZO, DANIELA ROMINA',
      'LEAL,ERICA'
  )
  AND [Paciente] <> 'TURNOS ONLINE, PACIENTE'
GROUP BY [Usuario Creacion Nombre];
```

---

## 5. Diseño e Integración en el Sistema (Vite + React)

Siguiendo las normas de diseño institucional de Sanatorio Argentino (Fondo blanco `bg-white`, tipografía Sans-serif legible, acentos en Azul Institucional `#003B71` y bordes suaves `rounded-lg`):

### 5.1. Módulos a Incorporar en el Sistema
1. **Pestaña "Incentivos y Productividad" en el Dashboard del Contact Center:**
   - **Indicadores en Tiempo Real:** Termómetros visuales para cada una de las 3 bolsas (Progreso actual vs. Meta del Escalón 5 y Escalón 10).
   - **Simulador de Liquidación:** Calculadora interactiva donde el equipo y la jefatura ven la proyección de cobro al día de la fecha.
   - **Desglose Individual vs. Grupal:** Vista pública de los totales grupales y vista de privacidad para la tasa individual de asistencia de cada colaboradora.
2. **Generador del Informe de Cierre para RRHH:**
   - Botón de emisión de reporte oficial en PDF/Excel firmado con el desglose exacto:
     - Días trabajados y licencias cargadas.
     - Coeficiente FTE aplicado.
     - Escalones alcanzados en las 3 bolsas.
     - Importe a transferir a la liquidación de sueldos.

### 5.2. Esquema de Base de Datos para Persistencia de Cierres (Supabase)
```sql
CREATE TABLE public.contact_center_incentivos_mensuales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo VARCHAR(7) NOT NULL, -- '2026-08', '2026-09', etc.
    agente_nombre VARCHAR(120) NOT NULL,
    agente_salus_user VARCHAR(120) NOT NULL,
    estado_dotacion VARCHAR(30) DEFAULT 'ACTIVA', -- 'ACTIVA', 'LICENCIA', 'BAJA', 'CURVA_APRENDIZAJE'
    dias_habiles_mes INT NOT NULL,
    dias_trabajados INT NOT NULL,
    fte_ponderado NUMERIC(3,2) NOT NULL,
    base_garantizada NUMERIC(12,2) DEFAULT 139470.59,
    mensajes_grupales_total INT NOT NULL,
    escalon_mensajes INT NOT NULL,
    monto_mensajes NUMERIC(12,2) NOT NULL,
    turnos_grupales_total INT NOT NULL,
    escalon_turnos INT NOT NULL,
    monto_turnos NUMERIC(12,2) NOT NULL,
    asistencia_pct NUMERIC(5,2) NOT NULL,
    escalon_asistencia INT NOT NULL,
    monto_asistencia NUMERIC(12,2) NOT NULL,
    total_variable NUMERIC(12,2) NOT NULL,
    total_a_liquidar NUMERIC(12,2) NOT NULL,
    fecha_cierre TIMESTAMPTZ DEFAULT now(),
    validado_por VARCHAR(100),
    aprobado_rrhh BOOLEAN DEFAULT false
);
```

---

## 6. Próximos Pasos para la Reunión con Sergio Femenía y Carolina Balaguer

1. **Compartir la Minuta de Respuesta:** Enviar a Carolina Balaguer el documento con las aclaraciones operativas resueltas en este plan.
2. **Presentar Simulación con Datos Reales:** Mostrar el cálculo retroactivo de Agosto y Septiembre 2026 utilizando los datos consolidados de SALUS y WhatsApp.
3. **Firmar el Criterio de Entrada en Vigencia:** Formalizar el 1 de Octubre de 2026 como fecha oficial de inicio del esquema de productividad.
