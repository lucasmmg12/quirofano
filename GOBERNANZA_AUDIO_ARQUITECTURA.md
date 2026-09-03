# Arquitectura y Funcionamiento del Sistema de Audio y Gobernanza
### Sanatorio Argentino · Auditoría Médica, Calidad y Gobernanza de Datos

Este documento detalla en profundidad la arquitectura, componentes, decisiones técnicas y flujos de datos que componen el **Sistema de Captura, Transcripción y Análisis Inteligente de Audios** para el proyecto de Gobernanza en Sanatorio Argentino, abarcando tanto la plataforma Web como la aplicación móvil Android.

---

## 1. Visión General del Ecosistema

El sistema permite a auditores, directivos y personal administrativo registrar entrevistas clínicas y de gobernanza de datos, transcribirlas automáticamente con identificación de interlocutores (diarización), y extraer mediante Inteligencia Artificial resúmenes estructurados, respuestas a cuestionarios y mapas conceptuales.

```mermaid
flowchart TD
    subgraph Clientes ["1. Captura de Audio"]
        WEB["🖥️ Web (React + Vite)\nGobernanzaEntrevistaGrabador.jsx"]
        MOB["📱 Android / iOS (Expo)\napp-gobernanza / App.js"]
    end

    subgraph Streaming ["2. Transcripción en Vivo"]
        DG_WS["⚡ Deepgram WebSocket\n(Nova-2 Live Streaming)"]
    end

    subgraph StorageDB ["3. Persistencia y Almacenamiento"]
        SUPA_ST["🗄️ Supabase Storage\nBucket: 'gobernanza_audios'"]
        SUPA_DB["📊 Supabase PostgreSQL\nTablas: gobernanza_entrevistas / plantillas"]
    end

    subgraph AI_Backend ["4. Procesamiento Inteligente"]
        EDGE["⚡ Edge Function: 'gobernanza-ai'"]
        DG_REST["🎙️ Deepgram Batch API\n(Diarización + Smart Format)"]
        OPENAI["🧠 OpenAI (GPT-4o)\n(Resumen, Minutas, Mermaid, Cuestionario)"]
    end

    WEB -->|Audio Chunks en Vivo (250ms)| DG_WS
    DG_WS -->|Texto en Vivo| WEB

    WEB -->|Subida multipart / webm| SUPA_ST
    MOB -->|Subida m4a / ArrayBuffer| SUPA_ST

    WEB -->|Crear/Actualizar Registro| SUPA_DB
    MOB -->|Crear/Actualizar Registro| SUPA_DB

    WEB -->|Disparo de Acción| EDGE
    MOB -->|Disparo de Acción| EDGE

    EDGE -->|Descarga de Audio| SUPA_ST
    EDGE -->|Audio + Diarización| DG_REST
    DG_REST -->|Transcripción con Speakers| EDGE
    EDGE -->|Estructuración y Análisis| OPENAI
    OPENAI -->|JSON Estructurado| EDGE
    EDGE -->|Guardar Resultado| SUPA_DB
    SUPA_DB -.->|Polling de Estado| WEB
    SUPA_DB -.->|Polling de Estado| MOB
```

---

## 2. Captura de Audio en Plataforma Web (`GobernanzaEntrevistaGrabador.jsx`)

Ubicación del archivo: [`src/components/GobernanzaEntrevistaGrabador.jsx`](file:///c:/Users/Sanatorio%20Argentino/Desktop/Proyectos/Sistema%20ADM-QUI/src/components/GobernanzaEntrevistaGrabador.jsx)

### Características Principales:
1. **Acceso al Micrófono y Visualización:**
   - Usa `navigator.mediaDevices.getUserMedia({ audio: true })`.
   - Conecta la señal a la Web Audio API (`AudioContext`, `createAnalyser`) para renderizar en un `<canvas>` la forma de onda sonora en tiempo real.
   - Solicita `navigator.wakeLock.request('screen')` para impedir que la pantalla se apague y el navegador suspenda la grabación.

2. **Doble Grabación Paralela (Streaming + Respaldo):**
   - **Canal 1 (Deepgram Live WebSocket):** Abre un WebSocket a `wss://api.deepgram.com/v1/listen?language=es&smart_format=true&model=nova-2`. Un `MediaRecorder` secundario envía fragmentos cada 250 ms para mostrar el texto en tiempo real en la pantalla y auto-guardar texto preliminar en Supabase.
   - **Canal 2 (Grabación Continua y Chunks):** Un `MediaRecorder` principal captura el audio completo en formato `audio/webm`. Cada 5 segundos realiza copias de seguridad locales en IndexedDB (`idb-keyval`). Cada 15 minutos o al finalizar, cierra el fragmento y lo sube automáticamente en segundo plano a Supabase Storage (`gobernanza_audios`), actualizando el array `audios_partes` en la base de datos.

3. **Mapeo Manual en Vivo:**
   - Durante la entrevista, el auditor puede seleccionar qué pregunta de la plantilla se está respondiendo. El texto que va llegando del WebSocket de Deepgram se vincula automáticamente a esa pregunta específica (`manualAnswers[qId]`).

4. **Prevención de Pérdida de Datos (Tolerancia a Cortes):**
   - **IndexedDB:** Respaldo constante de fragmentos en el navegador del cliente.
   - **Auto-pausa por visibilidad:** Si la pestaña pierde el foco o entra en segundo plano, la grabación se pausa de forma segura.
   - **Descarga de Emergencia (`handleEmergencyDownload`):** Si la red o el servidor fallan catastróficamente al terminar, se disparan descargas automáticas al disco local del usuario con los archivos `emergencia_audio_...webm` y `emergencia_transcripcion_...txt`.

---

## 3. Captura de Audio en Plataforma Móvil Android (`app-gobernanza`)

Ubicación: [`app-gobernanza/App.js`](file:///c:/Users/Sanatorio%20Argentino/Desktop/Proyectos/Sistema%20ADM-QUI/app-gobernanza/App.js)  
Servicios: [`app-gobernanza/src/services/audioService.js`](file:///c:/Users/Sanatorio%20Argentino/Desktop/Proyectos/Sistema%20ADM-QUI/app-gobernanza/src/services/audioService.js)

### Características Principales:
1. **Configuración Nativa (`app.json`):**
   - Paquete Android: `com.sanatorioargentino.gobernanza`.
   - Permisos: `RECORD_AUDIO`, `WAKE_LOCK`, `INTERNET`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE`.
   - Configuración de plugins de audio para Android e iOS.

2. **Captura con `expo-av`:**
   - Utiliza `Audio.Recording.createAsync` con el preset de audio codificado en AAC / MPEG-4 (`.m4a` a 128 kbps, 44.1 kHz estéreo).
   - Modo de audio configurado con `staysActiveInBackground: true` y `shouldDuckAndroid: true`.
   - Controles interactivos: Iniciar, Pausar, Reanudar y Detener.
   - Visualizador de barras animadas de onda sonora.

3. **Guía de Preguntas Integrada:**
   - Menú desplegable durante la grabación con las preguntas de la plantilla seleccionada para consulta inmediata del auditor.

4. **Codificación y Subida a Supabase Storage:**
   - Al detener la grabación, se verifica la integridad del archivo mediante `expo-file-system`.
   - Se lee el archivo como Base64 y se transforma a `ArrayBuffer` con `base64-arraybuffer`.
   - Se sube al bucket `gobernanza_audios` con Content-Type `audio/m4a`.
   - Se registra la entrevista en `gobernanza_entrevistas` y se dispara la función de análisis `gobernanza-ai`.
   - El cliente móvil realiza polling cada 3 segundos (`monitorEntrevistaProgress`) hasta recibir el resultado final.

---

## 4. Pipeline de Inteligencia Artificial Backend (`gobernanza-ai`)

Ubicación del archivo: [`supabase/functions/gobernanza-ai/index.ts`](file:///c:/Users/Sanatorio%20Argentino/Desktop/Proyectos/Sistema%20ADM-QUI/supabase/functions/gobernanza-ai/index.ts)

### Flujo de Ejecución:
1. **Detección Dinámica de Formato:**
   - Determina el `Content-Type` según la extensión (`.webm`, `.m4a`, `.mp4`, `.mp3`, `.wav`) para asegurar compatibilidad total con navegadores de escritorio y dispositivos móviles Android/iOS.
2. **Transcripción y Diarización con Deepgram Nova-2:**
   - Descarga el audio desde Supabase Storage.
   - Envía el audio binario a `https://api.deepgram.com/v1/listen` con los parámetros:
     - `model=nova-2`
     - `language=es`
     - `diarize=true` (separa a los participantes: Speaker 0, Speaker 1, etc.)
     - `smart_format=true` (puntuación, números y capitalización automática)
     - `keywords`: Palabras clave institucionales como *Sanatorio Argentino*, *Auditoría*, *Gobernanza*, *Liquidaciones*, *Historias Clínicas*.
   - Reconstruye el texto con etiquetas legibles por interlocutor: `[Participante X]: Texto...`.
3. **Análisis Estructurado con OpenAI (GPT-4o):**
   - Recibe la transcripción completa, las preguntas de la plantilla y los participantes.
   - Genera una respuesta en formato JSON que contiene:
     - `resumen`: Síntesis ejecutiva de la reunión.
     - `respuestas_cuestionario`: Mapeo de respuestas específicas encontradas en la conversación para cada una de las preguntas de la plantilla.
     - `mapa_conceptual_mermaid`: Diagrama de flujo conceptual en sintaxis Mermaid (`graph TD`).
     - `minutas`: Puntos clave, decisiones tomadas y tareas pendientes con responsables.
4. **Persistencia del Resultado:**
   - Actualiza la fila en `gobernanza_entrevistas` marcando `estado = 'completado'`.

---

## 5. Modelo de Datos (PostgreSQL en Supabase)

### Tabla `gobernanza_plantillas`
Almacena los cuestionarios preconfigurados por área.
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID (PK) | Identificador único de la plantilla |
| `nombre` | TEXT | Nombre (Ej: "Auditoría de Gobernanza de Datos", "Entrevista RRHH") |
| `preguntas` | JSONB / TEXT[] | Lista ordenada de preguntas del cuestionario |
| `created_at` | TIMESTAMPTZ | Fecha de creación |

### Tabla `gobernanza_entrevistas`
Almacena cada sesión de auditoría realizada.
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | TEXT / UUID (PK) | Identificador de la sesión de entrevista |
| `plantilla_id` | UUID (FK) | Relación con `gobernanza_plantillas` |
| `titulo` | TEXT | Título o nombre de la sesión |
| `audio_url` | TEXT | Nombre del archivo de audio principal en el Storage |
| `audios_partes` | TEXT[] | Lista de nombres de archivos si la grabación fue en múltiples partes |
| `duracion_segundos`| INTEGER | Duración total de la grabación |
| `transcripcion` | TEXT | Transcripción completa generada con diarización de participantes |
| `resumen` | TEXT | Resumen ejecutivo generado por IA |
| `respuestas_cuestionario` | JSONB | Respuestas mapeadas automáticamente por pregunta |
| `mapa_conceptual_mermaid` | TEXT | Código Mermaid para renderizar diagrama conceptual |
| `minutas` | JSONB | Decisiones y compromisos registrados |
| `estado` | TEXT | Estado actual: `'grabando'`, `'procesando'`, `'completado'`, `'error'` |
| `created_at` | TIMESTAMPTZ | Fecha y hora de realización |

### Bucket de Almacenamiento: `gobernanza_audios`
Bucket en Supabase Storage configurado para almacenar de forma segura todos los archivos de audio (`.webm` y `.m4a`) generados por los clientes.

---

## 6. Comandos de Operación y Desarrollo

### Iniciar Aplicación Web:
```bash
npm run dev
```

### Iniciar Aplicación Móvil Android:
```bash
cd app-gobernanza
npm start
```
- Presionar `a` para emulador Android.
- Escanear el QR con **Expo Go** para pruebas en dispositivos físicos.

### Generar APK de Android (Build local o con EAS):
```bash
cd app-gobernanza
npx eas build -p android --profile preview
```
