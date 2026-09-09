# Modelo de Gobernanza de Datos: Días Ocupación y Admisiones Hospitalarias
**Sanatorio Argentino — Sistema ADM-QUI / Calidad-QOAG**

---

## 1. Introducción y Propósito

El presente modelo define la arquitectura analítica y técnica para el cálculo de la **Ocupación de Camas y Flujo de Admisiones** en Sanatorio Argentino. 

A diferencia de los modelos tradicionales basados en una única fila por internación (que dificultan el análisis de ocupación transversal en el tiempo), este modelo desdobla cada internación en sus **días cama reales ocupados** (`Fecha Ocupacion`).

Esta misma base de datos y lógica de consulta es **canónica y transversal para todos los servicios del Sanatorio** (Terapia Intensiva - UCI, Neonatología, Internación Clínica, Pediatría, Quirófanos, Cirugía Pediátrica, etc.).

---

## 2. Query Canónica de Extracción (SALUS SQL Server)

```sql
SELECT 
    b.[Número admisión],
    -- Desdobla una fila por cada día natural que la cama estuvo ocupada
    DATEADD(DAY, v.number, CAST(b.[Fecha ingreso] AS DATE)) AS [Fecha Ocupacion],
    b.Especialidad,
    b.idAdmision,
    b.[Fecha ingreso],
    b.[Fecha alta],
    b.Procedencia,
    b.NHC,
    b.Paciente,
    b.[Motivo de alta],
    b.Cliente,
    b.[Estado Conceptos],
    b.Servicio,
    b.Proceso,
    b.Edad,
    b.[Motivo Alta],
    b.[Control ADM finalizado]
FROM TABLEAU_Admisiones b
-- Uso de spt_values como generador de secuencias de días
JOIN master.dbo.spt_values v
  ON v.type = 'P' 
  AND v.number <= DATEDIFF(DAY, CAST(b.[Fecha ingreso] AS DATE), CAST(ISNULL(b.[Fecha alta], GETDATE()) AS DATE))
-- Filtro histórico activo desde el 1 de junio de 2025
WHERE (b.[Fecha alta] >= '2025-06-01' OR b.[Fecha alta] IS NULL)
```

### Mecánica del desdoblamiento:
* Si un paciente ingresa el `2025-06-01` y su alta es el `2025-06-04`, la consulta genera **4 registros**:
  1. `2025-06-01` (Día de ingreso)
  2. `2025-06-02` (Día de estancia)
  3. `2025-06-03` (Día de estancia)
  4. `2025-06-04` (Día de alta)
* Si el paciente sigue internado (`[Fecha alta] IS NULL`), se calcula hasta `GETDATE()`.

---

## 3. Diccionario de Datos

| Campo | Tipo SQL | Descripción / Regla de Negocio |
| :--- | :--- | :--- |
| `id_admision` | `BIGINT` | Identificador único de la admisión en SALUS. |
| `numero_admision` | `VARCHAR(50)` | Código alfanumérico visible de la admisión (ej. `I052802`). |
| `fecha_ocupacion` | `DATE` | Fecha del día específico de cama ocupada. Clave para agrupaciones diarias/mensuales. |
| `fecha_ingreso` | `TIMESTAMPTZ` | Momento exacto de ingreso del paciente a la institución. |
| `fecha_alta` | `TIMESTAMPTZ` | Momento de alta (NULL si permanece internado). |
| `servicio` | `VARCHAR(150)` | Unidad o sector asistencial (`UCI`, `NEONATOLOGÍA`, `INTERNADO`, `PEDIATRÍA`, etc.). |
| `especialidad` | `VARCHAR(150)` | Especialidad médica tratante (`CARDIOLOGIA`, `CIRUGIA`, `CLINICO`, `GINECOLOGIA`, etc.). |
| `procedencia` | `VARCHAR(150)` | Origen del paciente (`Derivado desde Urgencias`, `Especialista`, `Domicilio - Programado`). |
| `nhc` | `VARCHAR(50)` | Número de Historia Clínica del paciente. |
| `paciente` | `VARCHAR(250)` | Apellido y Nombre del paciente. |
| `motivo_de_alta` | `VARCHAR(150)` | Motivo de egreso (`Alta médica`, `Defunción`, `Traslado a Otro Sanatorio/Clinica`). |
| `cliente` | `VARCHAR(200)` | Financiador / Obra Social / Prepaga (`005 - OSDE BINARIO`, `001 - PROVINCIA`, etc.). |
| `estado_conceptos`| `VARCHAR(100)` | Estado administrativo (`Facturación Cerrada`, `Pendiente`). |
| `edad` | `INTEGER` | Edad del paciente al momento del ingreso. |

---

## 4. Clasificaciones y Dimensiones Calculadas

### A. Segmentación por Grupo Etario
* **1. Pediátrico**: `0 a 17 años`
* **2. Adulto Joven**: `18 a 45 años`
* **3. Adulto**: `46 a 65 años`
* **4. Mayor**: `> 65 años`

### B. Segmentación por Categoría de Estancia
Calculado como `DATEDIFF(días, fecha_ingreso, fecha_alta)` por admisión:
* **1. Estancia Corta**: `1 a 2 días`
* **2. Estancia Media**: `3 a 7 días`
* **3. Estancia Larga**: `> 7 días`

---

## 5. Indicadores Clave de Rendimiento (Fórmulas)

### 1. Cantidad de Días Camas Ocupados
$$\text{Días Camas Ocupados} = \text{Total de filas en el período filtrado}$$

### 2. Cantidad de Días Camas Disponibles
$$\text{Días Camas Disponibles} = \text{Camas Totales del Servicio} \times \text{Días del período}$$
* *Ejemplo UCI Total (16 camas: 8 Intensiva [Box 1-8] + 8 Intermedia [Hab 222-229], 437 días transcurridos)*: $16 \times 437 = 6.992 \text{ días disponibles}$.
* *Ejemplo Terapia Intensiva (8 camas)*: $8 \times 437 = 3.496 \text{ días disponibles}$.
* *Ejemplo Terapia Intermedia (8 camas)*: $8 \times 437 = 3.496 \text{ días disponibles}$.

### 3. Porcentaje de Ocupación
$$\% \text{ de Ocupación} = \left( \frac{\text{Días Camas Ocupados}}{\text{Días Camas Disponibles}} \right) \times 100$$
* Semáforo de Gestión:
  * 🟢 **Óptimo**: $75\% \text{ a } 88\%$
  * 🟡 **Capacidad Tensa**: $89\% \text{ a } 95\%$
  * 🔴 **Saturación / Sobreocupación**: $> 95\%$

### 4. Porcentaje de Defunción (Mortalidad Cruda)
$$\% \text{ de Defunción} = \left( \frac{\text{Pacientes únicos con Motivo de Alta = 'Defunción'}}{\text{Total de Pacientes únicos ingresados}} \right) \times 100$$

---

## 6. Estructura de Visualización del Dashboard

El Dashboard replica la suite ejecutiva de Tableau organizada en:
1. **Banda Superior de Filtros**:
   - Selector de **Servicio** (UCI, Neonatología, Internado, etc.).
   - Selector de **Especialidad** (Cardiología, Cirugía, Clínico, etc.).
   - Entrada numérica de **Camas Totales** (parametrizable por sector).
   - Selector de **Rango de Fechas**.
2. **Scorecards Principales**:
   - Días Camas Ocupados.
   - Días Camas Disponibles.
   - % de Ocupación con badge de alerta.
   - % de Defunción.
3. **Módulo de Gráficos**:
   - **Cantidad de Admisiones por Especialidad**: Barras apiladas mensuales mostrando la composición de patologías/especialidades.
   - **Cantidad de Admisiones Totales**: Barras simples mensuales para análisis de estacionalidad.
   - **Motivos de Alta**: Gráfico circular de distribución de egresos.
   - **Rango Etario**: Gráfico circular de pirámide demográfica atendida.
   - **Categorías de Estancias**: Barras apiladas mensuales divididas en Estancia Corta, Media y Larga.
