import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';
import { Audio } from 'expo-av';
import {
  Mic,
  Square,
  Play,
  Pause,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Clock,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ArrowLeft,
  AlertCircle,
  Share2,
} from 'lucide-react-native';

import {
  getPlantillas,
  getHistorialEntrevistas,
  uploadAudioAndAnalyze,
  monitorEntrevistaProgress,
} from './src/services/audioService';

const { width } = Dimensions.get('window');

// Opciones personalizadas de alta calidad compatibles con Android/iOS
const RECORDING_OPTIONS = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

export default function App() {
  // Pestañas principales: 'grabar' | 'historial'
  const [activeTab, setActiveTab] = useState('grabar');

  // Datos
  const [plantillas, setPlantillas] = useState([]);
  const [loadingPlantillas, setLoadingPlantillas] = useState(true);
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  // Selección y flujo de grabación
  const [selectedPlantilla, setSelectedPlantilla] = useState(null);
  const [showQuestions, setShowQuestions] = useState(false);

  // Grabación
  const [recording, setRecording] = useState(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);

  // Animación del visualizador de onda
  const waveAnim1 = useRef(new Animated.Value(15)).current;
  const waveAnim2 = useRef(new Animated.Value(30)).current;
  const waveAnim3 = useRef(new Animated.Value(45)).current;
  const waveAnim4 = useRef(new Animated.Value(25)).current;
  const waveAnim5 = useRef(new Animated.Value(35)).current;

  // Estados de subida y procesamiento
  const [processingState, setProcessingState] = useState(null); // 'uploading' | 'analyzing' | null
  const [statusMessage, setStatusMessage] = useState('');
  const [currentEntrevistaId, setCurrentEntrevistaId] = useState(null);

  // Vista de resultados
  const [resultadoEntrevista, setResultadoEntrevista] = useState(null);

  // Cargar plantillas al iniciar
  useEffect(() => {
    cargarPlantillas();
  }, []);

  // Cargar historial al cambiar de pestaña
  useEffect(() => {
    if (activeTab === 'historial') {
      cargarHistorial();
    }
  }, [activeTab]);

  // Cronómetro de grabación
  useEffect(() => {
    let interval;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Animación de onda sonora mientras graba
  useEffect(() => {
    let loop;
    if (isRecording && !isPaused) {
      const createAnimation = (anim, min, max, duration) => {
        return Animated.sequence([
          Animated.timing(anim, {
            toValue: max,
            duration: duration,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: min,
            duration: duration,
            useNativeDriver: false,
          }),
        ]);
      };

      loop = Animated.loop(
        Animated.parallel([
          createAnimation(waveAnim1, 10, 55, 300),
          createAnimation(waveAnim2, 15, 75, 450),
          createAnimation(waveAnim3, 20, 90, 380),
          createAnimation(waveAnim4, 15, 65, 420),
          createAnimation(waveAnim5, 10, 50, 350),
        ])
      );
      loop.start();
    } else {
      Animated.parallel([
        Animated.timing(waveAnim1, { toValue: 12, duration: 200, useNativeDriver: false }),
        Animated.timing(waveAnim2, { toValue: 18, duration: 200, useNativeDriver: false }),
        Animated.timing(waveAnim3, { toValue: 24, duration: 200, useNativeDriver: false }),
        Animated.timing(waveAnim4, { toValue: 18, duration: 200, useNativeDriver: false }),
        Animated.timing(waveAnim5, { toValue: 12, duration: 200, useNativeDriver: false }),
      ]).start();
    }

    return () => {
      if (loop) loop.stop();
    };
  }, [isRecording, isPaused]);

  async function cargarPlantillas() {
    try {
      setLoadingPlantillas(true);
      const data = await getPlantillas();
      setPlantillas(data);
    } catch (err) {
      Alert.alert('Error', 'No se pudieron cargar las plantillas de auditoría.');
    } finally {
      setLoadingPlantillas(false);
    }
  }

  async function cargarHistorial() {
    try {
      setLoadingHistorial(true);
      const data = await getHistorialEntrevistas();
      setHistorial(data);
    } catch (err) {
      Alert.alert('Error', 'No se pudo cargar el historial de entrevistas.');
    } finally {
      setLoadingHistorial(false);
    }
  }

  // Formato de tiempo (mm:ss)
  const formatTime = secs => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Formato de fecha legible
  const formatDate = isoString => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Iniciar grabación
  async function startRecording() {
    try {
      if (!permissionResponse || permissionResponse.status !== 'granted') {
        const response = await requestPermission();
        if (response.status !== 'granted') {
          Alert.alert('Permiso Denegado', 'Se requiere acceso al micrófono para grabar la entrevista.');
          return;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        RECORDING_OPTIONS
      );

      setRecording(newRecording);
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
    } catch (err) {
      console.error('Error al iniciar grabación:', err);
      Alert.alert('Error', 'No se pudo iniciar la grabación del micrófono.');
    }
  }

  // Pausar / Reanudar grabación
  async function togglePauseRecording() {
    if (!recording) return;
    try {
      if (isPaused) {
        await recording.startAsync();
        setIsPaused(false);
      } else {
        await recording.pauseAsync();
        setIsPaused(true);
      }
    } catch (e) {
      console.error('Error pausando grabación:', e);
    }
  }

  // Detener grabación y procesar con Supabase e IA
  async function stopRecording() {
    if (!recording) return;

    try {
      setIsRecording(false);
      setIsPaused(false);

      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = recording.getURI();
      setRecording(null);

      if (!uri) {
        Alert.alert('Error', 'No se encontró el archivo de audio grabado.');
        return;
      }

      // Generar UUID v4 válido para PostgreSQL
      const generateUUID = () =>
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });

      // Iniciar proceso de subida y análisis
      const entrevistaId = generateUUID();
      setCurrentEntrevistaId(entrevistaId);
      setProcessingState('uploading');
      setStatusMessage('Guardando y subiendo audio...');

      await uploadAudioAndAnalyze({
        fileUri: uri,
        entrevistaId,
        plantillaId: selectedPlantilla?.id,
        titulo: `${selectedPlantilla?.nombre || 'Entrevista'} (${new Date().toLocaleDateString('es-AR')})`,
        duracionSegundos: duration,
        onStatusUpdate: msg => setStatusMessage(msg),
      });

      setProcessingState('analyzing');
      setStatusMessage('Analizando audio con IA (Deepgram + GPT)...');

      // Monitorear progreso de la IA
      monitorEntrevistaProgress(
        entrevistaId,
        progress => {
          if (progress.transcripcionParcial) {
            setStatusMessage('Transcribiendo respuestas en vivo...');
          }
        },
        resultadoCompletado => {
          setProcessingState(null);
          setStatusMessage('');
          setResultadoEntrevista(resultadoCompletado);
          setDuration(0);
        },
        error => {
          setProcessingState(null);
          setStatusMessage('');
          Alert.alert(
            'Aviso de Procesamiento',
            'El audio se guardó correctamente. La IA sigue procesando en segundo plano, podrás consultar el resultado en la pestaña Historial.',
            [{ text: 'Entendido', onPress: () => setSelectedPlantilla(null) }]
          );
        }
      );
    } catch (err) {
      console.error('Error al finalizar grabación:', err);
      setProcessingState(null);
      setStatusMessage('');
      Alert.alert('Error', 'Hubo un inconveniente al procesar la grabación: ' + err.message);
    }
  }

  // Cancelar grabación
  function cancelRecording() {
    Alert.alert(
      'Cancelar Grabación',
      '¿Estás seguro de que deseas descartar esta grabación?',
      [
        { text: 'Continuar grabando', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: async () => {
            if (recording) {
              try {
                await recording.stopAndUnloadAsync();
              } catch (e) {}
              setRecording(null);
            }
            setIsRecording(false);
            setIsPaused(false);
            setDuration(0);
            setSelectedPlantilla(null);
          },
        },
      ]
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // VISTA: PANTALLA DE RESULTADOS DETALLADOS
  // ═══════════════════════════════════════════════════════════════
  if (resultadoEntrevista) {
    const respuestas = resultadoEntrevista.respuestas_cuestionario || [];
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setResultadoEntrevista(null);
              setSelectedPlantilla(null);
            }}
          >
            <ArrowLeft color="#0D3B66" size={20} />
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {resultadoEntrevista.titulo || 'Resultado de Auditoría'}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.resultsScroll} contentContainerStyle={{ padding: 20 }}>
          {/* Badge de Estado */}
          <View style={styles.successBadgeContainer}>
            <CheckCircle2 color="#10B981" size={24} />
            <Text style={styles.successBadgeText}>Auditoría Procesada con Éxito</Text>
          </View>

          {/* Tarjeta de Resumen Ejecutivo */}
          <View style={styles.resultCard}>
            <View style={styles.cardHeaderRow}>
              <Sparkles color="#3B82F6" size={20} />
              <Text style={styles.cardSectionTitle}>Resumen Ejecutivo (IA)</Text>
            </View>
            <Text style={styles.resumenText}>
              {resultadoEntrevista.resumen || 'Sin resumen generado.'}
            </Text>
          </View>

          {/* Tarjeta de Cuestionario y Respuestas */}
          {respuestas.length > 0 && (
            <View style={styles.resultCard}>
              <View style={styles.cardHeaderRow}>
                <FileText color="#0D3B66" size={20} />
                <Text style={styles.cardSectionTitle}>Respuestas Identificadas</Text>
              </View>

              {respuestas.map((item, idx) => {
                const pregunta = typeof item === 'string' ? `Punto ${idx + 1}` : item.pregunta || `Punto ${idx + 1}`;
                const respuesta = typeof item === 'string' ? item : item.respuesta || 'No se detectó respuesta específica.';
                return (
                  <View key={idx} style={styles.qaItem}>
                    <Text style={styles.qaQuestion}>{idx + 1}. {pregunta}</Text>
                    <Text style={styles.qaAnswer}>{respuesta}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Tarjeta de Transcripción Completa */}
          <View style={styles.resultCard}>
            <View style={styles.cardHeaderRow}>
              <Mic color="#64748B" size={20} />
              <Text style={styles.cardSectionTitle}>Transcripción Completa</Text>
            </View>
            <Text style={styles.transcriptText}>
              {resultadoEntrevista.transcripcion || 'Transcripción no disponible.'}
            </Text>
          </View>

          {/* Botón Nueva Auditoría */}
          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={() => {
              setResultadoEntrevista(null);
              setSelectedPlantilla(null);
              setActiveTab('grabar');
            }}
          >
            <Text style={styles.primaryActionText}>Realizar Otra Auditoría</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // VISTA: PANTALLA DE PROCESAMIENTO / CARGA
  // ═══════════════════════════════════════════════════════════════
  if (processingState) {
    return (
      <SafeAreaView style={[styles.container, styles.centerContent]}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.processingBox}>
          <ActivityIndicator size="large" color="#0D3B66" style={{ marginBottom: 24 }} />
          <Text style={styles.processingTitle}>
            {processingState === 'uploading' ? 'Subiendo Grabación' : 'Analizando con IA'}
          </Text>
          <Text style={styles.processingSubtitle}>{statusMessage}</Text>
          <View style={styles.progressBarBackground}>
            <View style={styles.progressBarFill} />
          </View>
          <Text style={styles.processingNote}>
            Por favor, no cierres la aplicación mientras se completa la subida inicial.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // VISTA: PANTALLA DE GRABACIÓN ACTIVA
  // ═══════════════════════════════════════════════════════════════
  if (selectedPlantilla) {
    const preguntas = selectedPlantilla.preguntas || [];
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        {/* Header de Grabación */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (isRecording) {
                cancelRecording();
              } else {
                setSelectedPlantilla(null);
              }
            }}
          >
            <ArrowLeft color="#0D3B66" size={20} />
            <Text style={styles.backButtonText}>Atrás</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, paddingHorizontal: 8 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {selectedPlantilla.nombre}
            </Text>
            <Text style={styles.headerSubtitle}>
              {isRecording ? (isPaused ? 'En Pausa' : 'Grabando Entrevista...') : 'Listo para grabar'}
            </Text>
          </View>
        </View>

        {/* Guía de Preguntas Colapsable */}
        {preguntas.length > 0 && (
          <View style={styles.guideContainer}>
            <TouchableOpacity
              style={styles.guideToggle}
              onPress={() => setShowQuestions(!showQuestions)}
            >
              <View style={styles.guideToggleLeft}>
                <FileText color="#3B82F6" size={18} />
                <Text style={styles.guideToggleText}>
                  Guía de Preguntas ({preguntas.length})
                </Text>
              </View>
              {showQuestions ? <ChevronUp color="#64748B" size={18} /> : <ChevronDown color="#64748B" size={18} />}
            </TouchableOpacity>

            {showQuestions && (
              <ScrollView style={styles.questionsList} nestedScrollEnabled>
                {preguntas.map((q, idx) => (
                  <View key={idx} style={styles.questionCard}>
                    <Text style={styles.questionIndex}>{idx + 1}</Text>
                    <Text style={styles.questionText}>{q}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Zona Central de Grabación */}
        <View style={styles.recordMainArea}>
          {/* Cronómetro */}
          <Text style={[styles.timerText, isPaused && { color: '#F59E0B' }]}>
            {formatTime(duration)}
          </Text>

          {/* Visualizador de Onda Sonora */}
          <View style={styles.waveformRow}>
            {[waveAnim1, waveAnim2, waveAnim3, waveAnim4, waveAnim5].map((anim, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.waveBar,
                  { height: anim },
                  isRecording && !isPaused && { backgroundColor: '#3B82F6' },
                  isPaused && { backgroundColor: '#F59E0B' },
                ]}
              />
            ))}
          </View>

          {/* Estado de grabación */}
          <Text style={styles.recordingStatusLabel}>
            {isRecording
              ? isPaused
                ? 'Grabación pausada temporalmente'
                : 'Micrófono activo · Registro continuo'
              : 'Presiona el botón para comenzar'}
          </Text>

          {/* Botones de Control */}
          <View style={styles.controlsRow}>
            {isRecording && (
              <TouchableOpacity
                style={[styles.secondaryButton, styles.pauseButton]}
                onPress={togglePauseRecording}
              >
                {isPaused ? <Play color="#0D3B66" size={24} /> : <Pause color="#0D3B66" size={24} />}
              </TouchableOpacity>
            )}

            {/* Botón Principal (Grabar / Finalizar) */}
            <TouchableOpacity
              style={[
                styles.mainRecordButton,
                isRecording && styles.mainRecordButtonActive,
              ]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? <Square color="#FFFFFF" size={32} /> : <Mic color="#FFFFFF" size={36} />}
            </TouchableOpacity>

            {isRecording && (
              <TouchableOpacity
                style={[styles.secondaryButton, styles.cancelButton]}
                onPress={cancelRecording}
              >
                <Text style={styles.cancelButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // VISTA: PANTALLA PRINCIPAL (SELECCIÓN DE PLANTILLAS O HISTORIAL)
  // ═══════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header Institucional Sanatorio Argentino */}
      <View style={styles.mainHeader}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>SA</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>SANATORIO ARGENTINO</Text>
            <Text style={styles.brandSubtitle}>Auditoría Médica y Gobernanza</Text>
          </View>
        </View>

        {/* Selector de Pestañas */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'grabar' && styles.tabButtonActive]}
            onPress={() => setActiveTab('grabar')}
          >
            <Mic color={activeTab === 'grabar' ? '#0D3B66' : '#64748B'} size={18} />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'grabar' && styles.tabButtonTextActive,
              ]}
            >
              Nueva Auditoría
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'historial' && styles.tabButtonActive]}
            onPress={() => setActiveTab('historial')}
          >
            <Clock color={activeTab === 'historial' ? '#0D3B66' : '#64748B'} size={18} />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'historial' && styles.tabButtonTextActive,
              ]}
            >
              Historial ({historial.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* CONTENIDO DE PESTAÑA: NUEVA AUDITORÍA */}
      {activeTab === 'grabar' && (
        <View style={{ flex: 1 }}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Plantillas de Auditoría</Text>
            <TouchableOpacity onPress={cargarPlantillas} style={styles.iconRefresh}>
              <RefreshCw color="#64748B" size={16} />
            </TouchableOpacity>
          </View>

          {loadingPlantillas ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color="#0D3B66" />
              <Text style={styles.loadingText}>Cargando plantillas institucionales...</Text>
            </View>
          ) : (
            <FlatList
              data={plantillas}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 20 }}
              renderItem={({ item }) => {
                const qCount = (item.preguntas || []).length;
                return (
                  <TouchableOpacity
                    style={styles.templateCard}
                    activeOpacity={0.7}
                    onPress={() => setSelectedPlantilla(item)}
                  >
                    <View style={styles.templateCardContent}>
                      <View style={styles.templateIconWrapper}>
                        <FileText color="#0D3B66" size={24} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.templateTitle}>{item.nombre}</Text>
                        <Text style={styles.templateSubtitle}>
                          {qCount > 0 ? `${qCount} preguntas guiadas` : 'Cuestionario libre'}
                        </Text>
                      </View>
                      <View style={styles.startBadge}>
                        <Text style={styles.startBadgeText}>Iniciar</Text>
                        <ChevronRight color="#FFFFFF" size={14} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      {/* CONTENIDO DE PESTAÑA: HISTORIAL */}
      {activeTab === 'historial' && (
        <View style={{ flex: 1 }}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Entrevistas Registradas</Text>
            <TouchableOpacity onPress={cargarHistorial} style={styles.iconRefresh}>
              <RefreshCw color="#64748B" size={16} />
            </TouchableOpacity>
          </View>

          {loadingHistorial ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color="#0D3B66" />
              <Text style={styles.loadingText}>Cargando historial de grabaciones...</Text>
            </View>
          ) : historial.length === 0 ? (
            <View style={styles.centerContent}>
              <AlertCircle color="#94A3B8" size={40} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>Aún no hay entrevistas grabadas</Text>
              <Text style={styles.emptySubtitle}>
                Inicia una nueva auditoría desde la pestaña anterior para grabar y transcribir.
              </Text>
            </View>
          ) : (
            <FlatList
              data={historial}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 20 }}
              renderItem={({ item }) => {
                const isCompleted = item.estado === 'completado';
                return (
                  <TouchableOpacity
                    style={styles.historyCard}
                    activeOpacity={0.7}
                    onPress={() => setResultadoEntrevista(item)}
                  >
                    <View style={styles.historyCardHeader}>
                      <Text style={styles.historyTitle} numberOfLines={1}>
                        {item.titulo || 'Entrevista sin título'}
                      </Text>
                      <View
                        style={[
                          styles.statusTag,
                          isCompleted ? styles.statusTagCompleted : styles.statusTagProcessing,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusTagText,
                            isCompleted ? styles.statusTagTextCompleted : styles.statusTagTextProcessing,
                          ]}
                        >
                          {isCompleted ? 'Completado' : 'Procesando'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.historyDate}>
                      {formatDate(item.created_at)}
                      {item.duracion_segundos ? ` · ${formatTime(item.duracion_segundos)}` : ''}
                    </Text>

                    {item.resumen ? (
                      <Text style={styles.historySummary} numberOfLines={2}>
                        {item.resumen}
                      </Text>
                    ) : null}

                    <View style={styles.historyCardFooter}>
                      <Text style={styles.viewDetailText}>Ver informe completo</Text>
                      <ChevronRight color="#3B82F6" size={16} />
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// ESTILOS: ESTÉTICA CLÍNICA LIMPIA (SANATORIO ARGENTINO)
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  // Main Header
  mainHeader: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoBadge: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#0D3B66',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoBadgeText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 1,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#0D3B66',
    fontWeight: '700',
  },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  iconRefresh: {
    padding: 6,
  },

  // Plantillas Cards
  templateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  templateCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  templateIconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  templateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  templateSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  startBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D3B66',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 4,
  },
  startBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Header Secundario (Grabación / Resultados)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backButtonText: {
    color: '#0D3B66',
    fontWeight: '700',
    marginLeft: 4,
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },

  // Guía de Preguntas Colapsable
  guideContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  guideToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  guideToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guideToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  questionsList: {
    maxHeight: 180,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  questionCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  questionIndex: {
    fontWeight: '800',
    color: '#3B82F6',
    marginRight: 8,
    fontSize: 13,
  },
  questionText: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
    lineHeight: 18,
  },

  // Zona Central de Grabación
  recordMainArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  timerText: {
    fontSize: 64,
    fontWeight: '300',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
    marginBottom: 32,
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    gap: 12,
    marginBottom: 32,
  },
  waveBar: {
    width: 8,
    backgroundColor: '#CBD5E1',
    borderRadius: 4,
  },
  recordingStatusLabel: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 40,
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  mainRecordButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#0D3B66',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D3B66',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  mainRecordButtonActive: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  secondaryButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButton: {
    backgroundColor: '#FEF3C7',
  },
  cancelButton: {
    backgroundColor: '#FEE2E2',
  },
  cancelButtonText: {
    color: '#EF4444',
    fontSize: 20,
    fontWeight: '700',
  },

  // Pantalla de Procesamiento
  processingBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: width - 48,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  processingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  processingSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
  },
  progressBarBackground: {
    width: '100%',
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    width: '75%',
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 3,
  },
  processingNote: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },

  // Pantalla de Resultados
  resultsScroll: {
    flex: 1,
  },
  successBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  successBadgeText: {
    color: '#065F46',
    fontWeight: '700',
    fontSize: 14,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  resumenText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
  },
  qaItem: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  qaQuestion: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  qaAnswer: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },
  transcriptText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },
  primaryActionButton: {
    backgroundColor: '#0D3B66',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // Historial Cards
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 10,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusTagCompleted: {
    backgroundColor: '#ECFDF5',
  },
  statusTagProcessing: {
    backgroundColor: '#FEF3C7',
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTagTextCompleted: {
    color: '#059669',
  },
  statusTagTextProcessing: {
    color: '#D97706',
  },
  historyDate: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 8,
  },
  historySummary: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 12,
  },
  historyCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    paddingTop: 8,
  },
  viewDetailText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
});
