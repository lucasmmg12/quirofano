@echo off
echo ========================================
echo  Deploying whatsapp-webhook (with media persistence)
echo ========================================
for /f "tokens=1,2 delims==" %%a in (.env) do (
    if "%%a"=="SUPABASE_ACCESS_TOKEN" set SUPABASE_ACCESS_TOKEN=%%b
)
npx -y supabase@latest functions deploy whatsapp-webhook --project-ref hakysnqiryimxbwdslwe --no-verify-jwt --use-api
echo.
echo ========================================
echo  Deploy complete!
echo ========================================
pause
