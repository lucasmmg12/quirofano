' Iniciar_Servicio_Automatico_SALUS.vbs
' Inicia el servidor de sincronización SALUS en segundo plano (sin ventana de consola)
' para que funcione 24/7 de forma ininterrumpida en esta PC (128.223.17.60).

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strCurDir = fso.GetParentFolderName(WScript.ScriptFullName)
strSyncDir = strCurDir & "\sync-server"

' Liberar instancia previa en puerto 3456 si existe
WshShell.Run "cmd /c for /f ""tokens=5"" %p in ('netstat -ano ^| findstr :3456 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %p >nul 2>&1", 0, True

' Iniciar node index.js en modo invisible (0 = oculto, False = no esperar)
WshShell.CurrentDirectory = strSyncDir
WshShell.Run "cmd /c node index.js", 0, False

WScript.Echo "Servidor SALUS Sync iniciado en segundo plano con exito." & vbCrLf & _
             "Escuchando en http://128.223.17.60:3456 y sincronizando con Supabase."
