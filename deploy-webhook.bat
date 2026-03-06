@echo off
set SUPABASE_ACCESS_TOKEN=sbp_5b15e67cd11ce4fd0768b3c956db8f7968d4f6b1
npx -y supabase@latest functions deploy whatsapp-webhook --project-ref hakysnqiryimxbwdslwe --no-verify-jwt --use-api
pause
