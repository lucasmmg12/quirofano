$targetDir = "C:\Users\Sanatorio Argentino\Desktop\Proyectos\Contact Center\rag-backend"

# 1. Crear audio.py
$audioPyContent = @"
import os
import json
import tempfile
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from openai import AsyncOpenAI

router = APIRouter()
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

@router.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_bytes()
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
                temp_audio.write(data)
                temp_audio_path = temp_audio.name
                
            try:
                with open(temp_audio_path, "rb") as audio_file:
                    transcription = await client.audio.transcriptions.create(
                        file=audio_file,
                        model="whisper-1",
                        language="es",
                        response_format="text",
                        prompt="Entrevista de gobernanza y auditoría de datos, Sanatorio Argentino.",
                        temperature=0.2
                    )
                
                await websocket.send_text(json.dumps({
                    "type": "transcript",
                    "text": transcription
                }))
                
            finally:
                if os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)
                    
    except WebSocketDisconnect:
        print("Cliente desconectado de la transcripcion")
    except Exception as e:
        print(f"Error WS: {e}")
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
        except:
            pass
"@
Set-Content -Path "$targetDir\routes\audio.py" -Value $audioPyContent -Encoding UTF8

# 2. Update requirements.txt
$reqPath = "$targetDir\requirements.txt"
if (-not (Select-String -Path $reqPath -Pattern "websockets" -Quiet)) {
    Add-Content -Path $reqPath -Value "websockets==12.0"
}

# 3. Update main.py
$mainPyPath = "$targetDir\main.py"
$mainContent = Get-Content -Path $mainPyPath -Raw

if (-not $mainContent.Contains("from routes.audio import router as audio_router")) {
    $mainContent = $mainContent.Replace(
        "from routes.documents import router as documents_router",
        "from routes.documents import router as documents_router`nfrom routes.audio import router as audio_router"
    )
}

if (-not $mainContent.Contains("app.include_router(audio_router")) {
    $mainContent = $mainContent.Replace(
        "app.include_router(documents_router, prefix=`"/api`")",
        "app.include_router(documents_router, prefix=`"/api`")`napp.include_router(audio_router, prefix=`"/api`")"
    )
}

Set-Content -Path $mainPyPath -Value $mainContent -Encoding UTF8

# 4. Commit and push
Set-Location -Path "C:\Users\Sanatorio Argentino\Desktop\Proyectos\Contact Center"
git add rag-backend/
git commit -m "feat(rag): agregar ruta websocket de audio para gobernanza"
git push
