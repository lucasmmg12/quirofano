// Supabase Edge Function: send-security-email
// Envía correos institucionales de ciberseguridad (Códigos OTP de blanqueo/recuperación de contraseña)
// Utiliza Gmail API (OAuth2 con GCP_CLIENT_ID / GCP_CLIENT_SECRET / GCP_REFRESH_TOKEN) o RESEND_API_KEY si está disponible.

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function getGoogleAccessToken(): Promise<string> {
    const clientId = Deno.env.get('GCP_CLIENT_ID');
    const clientSecret = Deno.env.get('GCP_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GCP_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Credenciales OAuth de Google no configuradas');
    }

    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }).toString(),
    });

    if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Error token OAuth: ${txt}`);
    }
    const data = await resp.json();
    return data.access_token;
}

function encodeBase64Url(str: string): string {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const { to, nombre, usuario, code } = await req.json();

        if (!to || !code) {
            return new Response(
                JSON.stringify({ success: false, error: 'Faltan destinatario o código de seguridad' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const subject = `Código de Recuperación de Contraseña: ${code} — Sanatorio Argentino`;
        const htmlBody = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px; background: #FFFFFF; color: #0F172A;">
                <div style="text-align: center; margin-bottom: 18px;">
                    <span style="display: inline-block; padding: 4px 12px; border-radius: 999px; background: #EFF6FF; color: #1E4078; font-size: 12px; font-weight: 700;">
                        CIBERSEGURIDAD — SANATORIO ARGENTINO
                    </span>
                </div>
                <h2 style="margin: 0 0 12px; font-size: 20px; color: #1E293B; text-align: center;">
                    Blanqueo y Restablecimiento de Contraseña
                </h2>
                <p style="font-size: 14px; color: #475569; line-height: 1.5;">
                    Hola <strong>${nombre || usuario || 'Colaborador/a'}</strong> (usuario <code>@${usuario || ''}</code>):
                </p>
                <p style="font-size: 14px; color: #475569; line-height: 1.5;">
                    Recibimos tu solicitud para blanquear y colocar una nueva contraseña en la Plataforma Sanatorio Argentino (ADM-QUI). Ingresá el siguiente código de 6 dígitos en la pantalla del sistema:
                </p>
                <div style="margin: 20px 0; padding: 16px; background: #F8FAFC; border: 2px dashed #1E4078; border-radius: 10px; text-align: center;">
                    <span style="font-size: 28px; font-weight: 800; letter-spacing: 8px; color: #1E4078;">
                        ${code}
                    </span>
                </div>
                <p style="font-size: 12px; color: #64748B; line-height: 1.4;">
                    ⏱️ Este código es válido por <strong>10 minutos</strong>. Si no solicitaste este blanqueo de contraseña, desestimá este mensaje o comunicate con Innovación y Sistemas.
                </p>
            </div>
        `;

        // 1. Intentar con RESEND_API_KEY si está configurada
        const resendKey = Deno.env.get('RESEND_API_KEY');
        if (resendKey) {
            const resendResp = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${resendKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: 'Seguridad Sanatorio Argentino <seguridad@sanatorioargentino.com.ar>',
                    to: [to],
                    subject,
                    html: htmlBody,
                }),
            });
            if (resendResp.ok) {
                return new Response(JSON.stringify({ success: true, provider: 'resend' }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // 2. Intentar con Gmail API (OAuth2)
        const accessToken = await getGoogleAccessToken();
        const rawEmail = [
            `To: ${to}`,
            `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            '',
            htmlBody,
        ].join('\r\n');

        const gmailResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                raw: encodeBase64Url(rawEmail),
            }),
        });

        if (!gmailResp.ok) {
            const errTxt = await gmailResp.text();
            console.error('[send-security-email] Gmail API error:', errTxt);
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'El servidor de correo no pudo despachar el mensaje en este momento. Por favor utilizá la Opción 1 (WhatsApp o App Authenticator).',
                    details: errTxt,
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(JSON.stringify({ success: true, provider: 'gmail' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        console.error('[send-security-email] Exception:', err);
        return new Response(
            JSON.stringify({
                success: false,
                error: 'No se pudo enviar el correo en este momento. Te recomendamos utilizar la Opción 1 (WhatsApp o Código de Autenticación).',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

