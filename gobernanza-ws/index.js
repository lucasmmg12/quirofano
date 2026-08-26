const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
require('dotenv').config();

const { OpenAI } = require('openai');
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Temp dir for audio chunks
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket.');
    const connectionId = uuidv4();
    
    ws.on('message', async (message, isBinary) => {
        if (!isBinary) {
            console.log('Received non-binary message:', message.toString());
            return;
        }

        const chunkId = uuidv4();
        const tempFilePath = path.join(TEMP_DIR, `${connectionId}_${chunkId}.webm`);
        
        try {
            // Guardar chunk en disco temporalmente
            fs.writeFileSync(tempFilePath, message);
            
            // Enviar a OpenAI Whisper
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: 'whisper-1',
                language: 'es',
                response_format: 'text',
                prompt: 'Entrevista de gobernanza y auditoría de datos, Sanatorio Argentino.',
                temperature: 0.2
            });

            // Eliminar archivo temporal
            fs.unlinkSync(tempFilePath);

            // Enviar texto de vuelta al cliente
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'transcript',
                    text: transcription
                }));
            }
            
        } catch (error) {
            console.error('Error processing audio chunk:', error.message);
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Error transcribing chunk'
                }));
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        // Opcional: limpiar archivos temporales de esta connectionId si quedaron colgados
        fs.readdir(TEMP_DIR, (err, files) => {
            if (err) return;
            files.forEach(file => {
                if (file.startsWith(connectionId)) {
                    try { fs.unlinkSync(path.join(TEMP_DIR, file)); } catch (e) {}
                }
            });
        });
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'gobernanza-ws' });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
});
