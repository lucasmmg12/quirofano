@echo off
set SUPABASE_ACCESS_TOKEN=sbp_5b15e67cd11ce4fd0768b3c956db8f7968d4f6b1
npx supabase functions deploy whatsapp-webhook --project-ref hakysnqiryimxbwdslwe --no-verify-jwt
pause
