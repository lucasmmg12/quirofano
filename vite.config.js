import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { synthesizeSimonSpeech, ELEVENLABS_VOICES_CATALOG, DEFAULT_FEMALE_VOICE_ID, DEFAULT_TTS_MODEL_ID } from './sync-server/elevenlabsTts.mjs'

function elevenLabsVitePlugin() {
  // Middleware ElevenLabs TTS (incluye voces masculinas para Tótem y femeninas para Simón IA)
  return {
    name: 'elevenlabs-tts-middleware',
    configureServer(server) {
      server.middlewares.use('/api/elevenlabs/voices', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          voices: ELEVENLABS_VOICES_CATALOG,
          defaultVoiceId: DEFAULT_FEMALE_VOICE_ID,
          defaultModelId: DEFAULT_TTS_MODEL_ID,
          configured: Boolean(process.env.ELEVENLABS_API_KEY)
        }));
      });

      server.middlewares.use('/api/elevenlabs/tts', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }
        try {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
          }
          const payload = JSON.parse(body || '{}');
          const { audioBuffer, characterCount, voiceId, modelId } = await synthesizeSimonSpeech({
            text: payload.text,
            voiceId: payload.voiceId || DEFAULT_FEMALE_VOICE_ID,
            modelId: payload.modelId || DEFAULT_TTS_MODEL_ID,
          });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('X-Character-Count', String(characterCount));
          res.setHeader('X-Voice-Id', voiceId);
          res.setHeader('X-Model-Id', modelId);
          res.end(audioBuffer);
        } catch (err) {
          console.error('[ElevenLabs TTS] Error:', err.message);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'Error generando voz con ElevenLabs' }));
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.ELEVENLABS_API_KEY && !process.env.ELEVENLABS_API_KEY) {
    process.env.ELEVENLABS_API_KEY = env.ELEVENLABS_API_KEY;
  }

  return {
    plugins: [react(), elevenLabsVitePlugin()],
    // ── Browser compatibility: 2020+ ──
    build: {
      target: ['es2020', 'chrome80', 'firefox74', 'safari13.1', 'edge80'],
      cssTarget: ['chrome80', 'firefox74', 'safari13.1', 'edge80'],
    },
    esbuild: {
      target: 'es2020',
    },
    server: {
      port: 5173,
      open: true,
      hmr: {
        port: 5173,
      },
      proxy: {
        // Proxy al sync-server local para consultas SALUS
        '/api/salus': {
          target: 'http://localhost:3456',
          changeOrigin: true,
          // Si el sync-server no está corriendo, no crashear Vite
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.warn('[Vite Proxy] Sync server no disponible:', err.message);
            });
          },
        },
        // Proxy para Simon IA RAG API
        '/rag-api': {
          target: 'https://contactcenter-1.onrender.com/api',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rag-api/, ''),
        },
      },
    },
  };
})
