# 🔄 Guía de Arquitectura: Automatización 100% Desatendida de Sincronización SALUS ↔ Supabase

> **Sanatorio Argentino — Gobernanza de Datos y Cuidados Críticos (QOAG)**  
> **Autor:** Lucas Marinero / Grow Labs  
> **Fecha de Documentación:** Septiembre 2026  
> **Estado:** Documentado / Listo para activación cuando se requiera

---

## 1. Contexto y Diagnóstico Actual

### 1.1. ¿Cómo funciona hoy?
* **Base de Origen:** **SALUS SQL Server** en red local (`128.223.16.29:2450`, base `SALUS`).
* **Base Cloud:** **Supabase PostgreSQL** (`hakysnqiryimxbwdslwe.supabase.co`).
* **Estado actual de sincronización:** **Bajo Demanda / Manual**.
  * Los datos que visualizan los tableros (UCI, Guardia, Dossier 360 y Beto) corresponden a los últimos cortes sincronizados mediante scripts Node.js (`daily_sync_job.mjs`, `sync_kinesiologia_uci.mjs`, `sync_guardia_indicadores.mjs`).
  * Actualmente **no hay un demonio o tarea programada en ejecución permanente en segundo plano**. Si no se ejecuta una sincronización, los datos en Supabase permanecen congelados en la última fecha ejecutada.

### 1.2. ¿Por qué se requiere un intermediario local?
La base de datos de SALUS (`128.223.16.29`) reside en una **subred privada interna protegida por el firewall institucional del Sanatorio Argentino**. Por estrictas normas de seguridad médica, SALUS no tiene IP pública ni puertos abiertos a Internet. Por ende, Supabase en la nube no puede conectarse directamente a SALUS; requiere que un equipo dentro de la red local del Sanatorio extraiga los datos y los envíe a Supabase.

---

## 2. Diagrama de Flujo de Datos

```mermaid
flowchart TD
    subgraph RedLocal [Red Privada Sanatorio Argentino]
        SALUS[(SALUS SQL Server\n128.223.16.29:2450)]
        Scheduler[Windows Task Scheduler\n(06:00 AM y cada 2 hs)]
        SyncJob[Node.js Engine\n(daily_sync_job.mjs)]
        
        Scheduler -->|Disparo Silencioso e Invisible| SyncJob
        SyncJob -->|1. Consulta SQL Server\n(Admisiones, VLISE, Kinesiología, Guardia)| SALUS
        SALUS -->|2. Datos Crudos Sanitarios| SyncJob
    end

    subgraph Nube [Supabase Cloud]
        SyncJob -->|3. Upsert Desduplicado y Blindado| Supabase[(PostgreSQL Supabase\ncalidad_*, guardia_*)]
    end

    subgraph Clientes [Consumo Multiplataforma]
        Supabase -->|Lectura Reactiva en Tiempo Real| DashboardWeb[Tablero de Gobernanza / UCI]
        Supabase -->|Dossier Clínico 360| FichaPaciente[Expediente del Paciente y ARM]
        Supabase -->|Consultas Asistenciales IA| BetoIA[Beto Asistente Virtual]
        Supabase -->|Acceso Móvil| DispositivosMoviles[Celulares / Tablets Médicos]
    end

    style RedLocal fill:#EFF6FF,stroke:#3B82F6,stroke-width:2px
    style Nube fill:#ECFDF5,stroke:#10B981,stroke-width:2px
    style Clientes fill:#F8FAFC,stroke:#64748B,stroke-width:2px
```

---

## 3. Plan de Automatización 100% Desatendida

Para que la actualización sea totalmente automática (sin intervención humana ni ventanas emergentes), se implementa una **Tarea Programada de Windows (Task Scheduler)**.

### 3.1. Frecuencia y Disparadores Recomendados
1. **Pase de Guardia Matutino (06:00 AM diario):**
   * Sincroniza todas las internaciones, altas, evoluciones y estudios solicitados durante la noche.
2. **Refresco Diurno (Cada 2 horas entre 07:00 y 21:00 hs):**
   * Mantiene actualizado el censo de camas críticas, los ingresos de guardia y los parámetros de kinesiología (ARM y weaning).
3. **Arranque del Sistema (On Logon / Inicio de sesión):**
   * Si la computadora estuvo apagada durante la noche o el fin de semana, apenas el operador inicia sesión se ejecuta una sincronización inmediata de puesta al día.

---

## 4. Componentes Técnicos Ya Desarrollados

Los scripts necesarios ya se encuentran desarrollados y probados en el repositorio:

| Archivo | Ubicación | Función |
| :--- | :--- | :--- |
| `daily_sync_job.mjs` | `sync-server/` | Motor maestro ETL que extrae admisiones (45 días), camas, VLISE laboratorio, imágenes, diagnósticos y kinesiología UCI. |
| `sync_censo_camas.mjs` | `sync-server/` | Sincronizador del censo en tiempo real de las 16 camas de UCI e Intermedia. |
| `sync_guardia_indicadores.mjs` | `sync-server/` | Consolidador mensual de los 9 indicadores de Guardia Clínica en `guardia_indicadores_resumen`. |
| `run_daily_sync.bat` | `sync-server/` | Batch ejecutor con timestamp y logging rotativo en `sync-server/logs/`. |
| `Actualizar SALUS.bat` | Raíz del proyecto | Lanzador del servidor Express local en puerto `3456` para sync manual. |

---

## 5. Instrucciones para la Activación Futura

Cuando la gerencia o el equipo técnico decida activar la automatización, solo deben seguirse estos pasos:

### Paso 1: Crear el Lanzador Silencioso (VBScript)
Para evitar que aparezca una ventana negra de CMD en la pantalla mientras los administrativos trabajan, se crea un archivo `run_silent.vbs` en `sync-server/`:

```vbscript
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c """ & "C:\Users\Sanatorio Argentino\Desktop\Proyectos\Sistema ADM-QUI\sync-server\run_daily_sync.bat" & """", 0, False
```

### Paso 2: Registrar la Tarea en Windows Task Scheduler
Abrir PowerShell como Administrador y ejecutar:

```powershell
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"C:\Users\Sanatorio Argentino\Desktop\Proyectos\Sistema ADM-QUI\sync-server\run_silent.vbs`""

# Disparador 1: Diario a las 06:00 AM
$triggerDaily = New-ScheduledTaskTrigger -Daily -At "06:00"

# Disparador 2: Al iniciar sesión
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "SALUS_Sync_Diario_Automatico" -Action $action -Trigger @($triggerDaily, $triggerLogon) -Settings $settings -Description "Sincronización Automática Diaria SALUS a Supabase para Gobernanza y Tableros"
```

### Paso 3: Verificación del Funcionamiento
* Se puede forzar una ejecución de prueba en cualquier momento desde PowerShell:
  ```powershell
  Start-ScheduledTask -TaskName "SALUS_Sync_Diario_Automatico"
  ```
* Verificar que en la carpeta `sync-server/logs/` se genere el archivo `daily_sync_YYYYMMDD_HHMM.log` con el resultado:
  ```text
  [INFO] Iniciando Sincronizacion Diaria SALUS -> Supabase: 11/09/2026 06:00:00
  [SUCCESS] Sincronizacion finalizada exitosamente.
  ```

---

## 6. Recomendación de Arquitectura Definitiva (Servidor 24/7)

Si bien esta PC de desarrollo puede ejecutar la tarea programada mientras esté encendida:
* **Mejor Práctica Institucional:** La recomendación a largo plazo es instalar este mismo directorio `sync-server` en un **servidor local de sistemas o máquina virtual del Sanatorio que permanezca encendido 24/7/365**.
* De esta manera, las sincronizaciones nocturnas de las 06:00 AM se ejecutarán de forma garantizada todos los días del año, incluso durante fines de semana, feriados o vacaciones.
