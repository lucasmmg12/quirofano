/**
 * LoginScreen — Pantalla de autenticación institucional con Ciberseguridad Integrada
 * - Paso 1: Credenciales (Usuario / Contraseña)
 * - Paso 2: Actualización obligatoria de contraseña en próximo ingreso (must_change_password)
 * - Paso 3: Autenticación Multifactor Híbrida (2FA: WhatsApp OTP o Google/Microsoft Authenticator QR)
 *           con opción de recordar equipo habitual por 30 días.
 */
import { useState, useRef, useEffect } from 'react';
import {
    Lock, User, Eye, EyeOff, Loader2, AlertCircle, Brain, Sparkles,
    ShieldCheck, Smartphone, QrCode, CheckCircle2, ArrowLeft, KeyRound, RefreshCw, Copy,
    UserPlus, Camera, Mail, Building2, Briefcase, Monitor, LogOut
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
    login,
    changePassword,
    updateUserSecurityContact,
    getPasswordRecoveryOptions,
    requestPasswordRecoveryOtp,
    resetForgottenPassword,
    requestWhatsAppOtp,
    verifyWhatsAppOtp,
    generateTotpSecret,
    getTotpUri,
    verifyAndSaveTotp,
    finalizeSession,
    checkOrClaimUserSession,
    generateSessionToken,
    submitUserAccessRequest,
    uploadAvatarFileOnly,
    validateStrictCellphone,
    normalizeLegacyPhoneTo10Digits,
} from '../services/authService';
import { logAction } from '../services/auditService';

const REQUESTABLE_ROLES = [
    { value: 'operador', label: 'Operador / Admisión / Quirófano / Facturación' },
    { value: 'contact_center', label: 'Agente Contact Center' },
    { value: 'gobernanza', label: 'Gobernanza de Datos / Calidad' },
    { value: 'gobernanza_dashboard', label: 'Gobernanza (Solo Dashboard)' },
    { value: 'uci', label: 'Indicadores UCI' },
    { value: 'activos', label: 'Gestión de Activos' },
];

export default function LoginScreen({ onLogin }) {
    // Steps: 'credentials' | 'change_password' | 'confirm_contact' | 'mfa' | 'concurrent_session' | 'forgot_password' | 'request_account'
    const [step, setStep] = useState('credentials');
    const [pendingUser, setPendingUser] = useState(null);
    const [requiresMfaAfterPwd, setRequiresMfaAfterPwd] = useState(false);
    const [concurrentConflict, setConcurrentConflict] = useState(null);
    const [failedPasswordPrompt, setFailedPasswordPrompt] = useState(false);

    // Step 1: Credentials
    const [usuario, setUsuario] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Step 2 & 2.5: Mandatory Password Change + Confirmación de Contacto Real (WhatsApp + Email real)
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [securityPhone, setSecurityPhone] = useState('');
    const [securityEmail, setSecurityEmail] = useState('');

    // Step Forgot Password: Blanqueo y Restablecimiento Autónomo de Contraseña
    const [recoveryUsername, setRecoveryUsername] = useState('');
    const [recoveryInfo, setRecoveryInfo] = useState(null);
    const [recoveryMethod, setRecoveryMethod] = useState('whatsapp'); // 'whatsapp' | 'totp' | 'email'
    const [recoveryOtpSent, setRecoveryOtpSent] = useState(false);
    const [recoveryCode, setRecoveryCode] = useState('');
    const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
    const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
    const [recoveryRealEmail, setRecoveryRealEmail] = useState('');
    const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);

    // Step 3: Hybrid MFA (WhatsApp OTP or Authenticator QR)
    const [mfaMethod, setMfaMethod] = useState('whatsapp'); // 'whatsapp' | 'totp'
    const [whatsappPhone, setWhatsappPhone] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [totpSecret, setTotpSecret] = useState('');
    const [showQrSetup, setShowQrSetup] = useState(false);
    const [trustDevice, setTrustDevice] = useState(true);
    const [copiedSecret, setCopiedSecret] = useState(false);

    // Step 4: Solicitud de Alta de Usuario ("Comunicáte con el Administrador")
    const [reqForm, setReqForm] = useState({
        nombre: '',
        dni: '',
        usuario_sugerido: '',
        email: '',
        telefono_whatsapp: '',
        area_sector: '',
        cargo: '',
        rol_solicitado: 'operador',
        motivo: '',
        avatar_url: '',
    });
    const [uploadingReqAvatar, setUploadingReqAvatar] = useState(false);
    const [reqSubmittedSuccess, setReqSubmittedSuccess] = useState(false);
    const reqFileInputRef = useRef(null);

    // Shared UI state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [infoMsg, setInfoMsg] = useState('');
    const [shake, setShake] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, [step]);

    const triggerShake = () => {
        setShake(true);
        setTimeout(() => setShake(false), 500);
    };

    const prepareMfaStep = (userObj) => {
        setError('');
        setInfoMsg('');
        setOtpCode('');
        const preferred = userObj.mfa_method === 'totp' || userObj.has_totp ? 'totp' : 'whatsapp';
        setMfaMethod(preferred);
        setWhatsappPhone(userObj.telefono_whatsapp || '');
        setOtpSent(false);

        if (userObj.totp_secret && userObj.totp_secret.length % 8 === 0) {
            setTotpSecret(userObj.totp_secret);
            setShowQrSetup(false);
        } else {
            setTotpSecret(generateTotpSecret(16));
            setShowQrSetup(true);
        }
        setStep('mfa');
    };

    const completeLoginSuccess = async (userObj, forceTakeover = false) => {
        const LAB_USERS = ['aguero', 'cedap', 'cuyo'];
        const loginUser = (userObj.usuario || '').toLowerCase();
        if (LAB_USERS.includes(loginUser)) {
            setError('Esta cuenta es exclusiva del portal de laboratorio. Acceda desde su enlace dedicado.');
            triggerShake();
            localStorage.removeItem('admqui_session');
            sessionStorage.removeItem('admqui_session');
            setStep('credentials');
            return;
        }

        const tokenToUse = userObj.sessionToken || generateSessionToken();
        setLoading(true);
        const sessionCheck = await checkOrClaimUserSession(userObj.id, tokenToUse, forceTakeover);
        setLoading(false);

        if (sessionCheck.status === 'account_disabled') {
            setError(sessionCheck.error || 'Esta cuenta se encuentra deshabilitada.');
            triggerShake();
            setStep('credentials');
            return;
        }

        if (sessionCheck.status === 'conflict' && !forceTakeover) {
            setPendingUser({ ...userObj, sessionToken: tokenToUse });
            setConcurrentConflict({
                otherDeviceLabel: sessionCheck.otherDeviceLabel || 'Otra PC / Dispositivo',
                otherStartedAt: sessionCheck.otherStartedAt,
                otherLastHeartbeat: sessionCheck.otherLastHeartbeat,
            });
            setError('');
            setInfoMsg('');
            setStep('concurrent_session');
            return;
        }

        const session = finalizeSession({ ...userObj, sessionToken: sessionCheck.sessionToken || tokenToUse });
        await logAction('login', {
            usuario: session.usuario,
            mfa: Boolean(userObj.mfa_enabled),
            forced_takeover: Boolean(forceTakeover),
        });
        onLogin(session);
    };

    const handleForceTakeoverFromLogin = async () => {
        if (!pendingUser) return;
        setError('');
        await completeLoginSuccess(pendingUser, true);
    };

    const handleCancelConcurrentLogin = () => {
        setPendingUser(null);
        setConcurrentConflict(null);
        setPassword('');
        setError('');
        setInfoMsg('');
        setStep('credentials');
    };

    // === PASO 1: LOGIN INICIAL ===
    const handleCredentialsSubmit = async (e) => {
        e.preventDefault();
        if (!usuario.trim() || !password) {
            setError('Completá usuario y contraseña');
            triggerShake();
            return;
        }

        setLoading(true);
        setError('');
        setInfoMsg('');
        setFailedPasswordPrompt(false);

        const result = await login(usuario, password);
        setLoading(false);

        if (!result.success) {
            setError(result.error);
            if ((result.error || '').toLowerCase().includes('incorrectos')) {
                setFailedPasswordPrompt(true);
            }
            triggerShake();
            setPassword('');
            return;
        }

        // Verificar bloqueo de cuentas exclusivas de laboratorio
        const targetUser = result.user || result.pendingUser;
        const LAB_USERS = ['aguero', 'cedap', 'cuyo'];
        if (LAB_USERS.includes((targetUser?.usuario || '').toLowerCase())) {
            setError('Esta cuenta es exclusiva del portal de laboratorio. Acceda desde su enlace dedicado.');
            triggerShake();
            setPassword('');
            localStorage.removeItem('admqui_session');
            sessionStorage.removeItem('admqui_session');
            return;
        }

        if (result.requiresPasswordChange) {
            const pUser = result.pendingUser;
            setPendingUser(pUser);
            setRequiresMfaAfterPwd(Boolean(result.requiresMfa));
            setNewPassword('');
            setConfirmPassword('');
            setSecurityPhone(normalizeLegacyPhoneTo10Digits(pUser?.telefono_whatsapp || ''));
            // Si aún no confirmó su contacto real, dejamos el mail vacío para que coloque su mail real nuevamente
            setSecurityEmail(pUser?.datos_contacto_confirmados ? (pUser?.email || '') : '');
            setStep('change_password');
            return;
        }

        if (result.requiresContactConfirmation) {
            const pUser = result.pendingUser;
            setPendingUser(pUser);
            setRequiresMfaAfterPwd(Boolean(result.requiresMfa));
            setSecurityPhone(normalizeLegacyPhoneTo10Digits(pUser?.telefono_whatsapp || ''));
            // Pedimos que ingrese nuevamente su mail real ya que algunas cuentas tenían mails ficticios
            setSecurityEmail('');
            setStep('confirm_contact');
            return;
        }

        if (result.requiresMfa) {
            setPendingUser(result.pendingUser);
            prepareMfaStep(result.pendingUser);
            return;
        }

        if (result.requiresSessionTakeover) {
            setPendingUser(result.pendingUser);
            setConcurrentConflict(result.conflictInfo || { otherDeviceLabel: 'Otro dispositivo / navegador' });
            setStep('concurrent_session');
            return;
        }

        await logAction('login', { usuario: result.user.usuario });
        onLogin(result.user);
    };

    // === PASO 2: CAMBIO OBLIGATORIO DE CONTRASEÑA + CONFIRMACIÓN DE WHATSAPP Y MAIL REAL ===
    const handlePasswordChangeSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!newPassword || !confirmPassword) {
            setError('Completá y confirmá tu nueva contraseña');
            triggerShake();
            return;
        }
        if (newPassword.length < 6) {
            setError('La nueva contraseña debe tener al menos 6 caracteres');
            triggerShake();
            return;
        }
        if (newPassword.trim() === '123456') {
            setError('Por seguridad no podés usar "123456". Elegí una clave personal.');
            triggerShake();
            return;
        }
        if (newPassword === password) {
            setError('La nueva contraseña debe ser distinta a la contraseña anterior');
            triggerShake();
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Las contraseñas ingresadas no coinciden');
            triggerShake();
            return;
        }

        const phoneCheck = validateStrictCellphone(securityPhone);
        if (!phoneCheck.valid) {
            setError(phoneCheck.error);
            triggerShake();
            return;
        }

        const cleanEmail = String(securityEmail || '').trim().toLowerCase();
        if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            setError('Ingresá tu dirección de correo electrónico real y válida (ej: tu_correo@gmail.com)');
            triggerShake();
            return;
        }

        setLoading(true);
        const res = await changePassword(pendingUser.id, password, newPassword, cleanEmail, phoneCheck.clean);
        setLoading(false);

        if (!res.success) {
            setError(res.error || 'No se pudo actualizar la contraseña');
            triggerShake();
            return;
        }

        const updatedUser = {
            ...pendingUser,
            email: cleanEmail,
            telefono_whatsapp: phoneCheck.clean,
            datos_contacto_confirmados: true,
        };
        setPendingUser(updatedUser);

        await logAction('cambio_password_obligatorio', {
            usuario: pendingUser.usuario,
            email_confirmado: cleanEmail,
        });
        setPassword(newPassword);

        if (requiresMfaAfterPwd) {
            prepareMfaStep(updatedUser);
        } else {
            await completeLoginSuccess(updatedUser);
        }
    };

    // === PASO 2.5: CONFIRMACIÓN OBLIGATORIA DE MAIL REAL Y WHATSAPP DE SEGURIDAD ===
    const handleConfirmContactSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const phoneCheck = validateStrictCellphone(securityPhone);
        if (!phoneCheck.valid) {
            setError(phoneCheck.error);
            triggerShake();
            return;
        }

        const cleanEmail = String(securityEmail || '').trim().toLowerCase();
        if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            setError('Por favor colocá nuevamente tu correo electrónico real y válido.');
            triggerShake();
            return;
        }

        setLoading(true);
        const res = await updateUserSecurityContact(pendingUser.id, cleanEmail, phoneCheck.clean);
        setLoading(false);

        if (!res.success) {
            setError(res.error || 'No se pudieron actualizar tus datos de seguridad');
            triggerShake();
            return;
        }

        const updatedUser = {
            ...pendingUser,
            email: cleanEmail,
            telefono_whatsapp: phoneCheck.clean,
            datos_contacto_confirmados: true,
        };
        setPendingUser(updatedUser);

        await logAction('confirmacion_contacto_seguridad', {
            usuario: pendingUser.usuario,
            email: cleanEmail,
        });

        if (requiresMfaAfterPwd) {
            prepareMfaStep(updatedUser);
        } else {
            await completeLoginSuccess(updatedUser);
        }
    };

    // === FLUJO: ¿OLVIDASTE TU CONTRASEÑA? BLANQUEAR Y RESTABLECER CLAVE ===
    const openForgotPasswordFlow = async () => {
        setError('');
        setInfoMsg('');
        setFailedPasswordPrompt(false);
        const currentUsername = usuario.trim();
        setRecoveryUsername(currentUsername);
        setRecoveryInfo(null);
        setRecoveryMethod('whatsapp');
        setRecoveryOtpSent(false);
        setRecoveryCode('');
        setRecoveryNewPassword('');
        setRecoveryConfirmPassword('');
        setRecoveryRealEmail('');
        setStep('forgot_password');

        if (currentUsername) {
            setLoading(true);
            const info = await getPasswordRecoveryOptions(currentUsername);
            setLoading(false);
            if (info?.found) {
                setRecoveryInfo(info);
                if (info.has_whatsapp) {
                    setRecoveryMethod('whatsapp');
                    await handleSendRecoveryCode('whatsapp', info);
                } else if (info.has_totp) {
                    setRecoveryMethod('totp');
                } else {
                    setRecoveryMethod('email');
                    await handleSendRecoveryCode('email', info);
                }
            }
        }
    };

    const handleLookupRecoveryUser = async (e) => {
        e.preventDefault();
        setError('');
        setInfoMsg('');

        if (!recoveryUsername.trim()) {
            setError('Ingresá tu nombre de usuario para iniciar el blanqueo de contraseña');
            triggerShake();
            return;
        }

        setLoading(true);
        const info = await getPasswordRecoveryOptions(recoveryUsername);
        setLoading(false);

        if (!info.found) {
            setError(info.error || 'No se encontró ningún usuario activo con ese nombre.');
            triggerShake();
            return;
        }

        setRecoveryInfo(info);
        setRecoveryOtpSent(false);
        setRecoveryCode('');
        // Priorizar Opción 1 (WhatsApp y enviar código automáticamente de inmediato)
        if (info.has_whatsapp) {
            setRecoveryMethod('whatsapp');
            await handleSendRecoveryCode('whatsapp', info);
        } else if (info.has_totp) {
            setRecoveryMethod('totp');
        } else {
            setRecoveryMethod('email');
            await handleSendRecoveryCode('email', info);
        }
    };

    const handleSendRecoveryCode = async (channel, infoOverride = null) => {
        const targetInfo = infoOverride || recoveryInfo;
        if (!targetInfo?.user_id) return;
        setError('');
        setInfoMsg('');
        setLoading(true);
        const res = await requestPasswordRecoveryOtp(targetInfo.user_id, channel);
        setLoading(false);

        if (!res.success) {
            setError(res.error || 'No se pudo enviar el código de verificación.');
            triggerShake();
            return;
        }

        setRecoveryOtpSent(true);
        if (res.channel === 'whatsapp_fallback') {
            setInfoMsg(`Código de 6 dígitos enviado directamente a tu WhatsApp registrado (${res.maskedDestination}) como respaldo inmediato.`);
        } else if (channel === 'whatsapp') {
            setInfoMsg(`✅ Código de 6 dígitos enviado por WhatsApp a tu celular registrado (${res.maskedDestination}). Ingresalo abajo.`);
        } else {
            setInfoMsg(`✅ Código de 6 dígitos enviado a tu correo electrónico registrado (${res.maskedDestination}).`);
        }
    };

    const handleResetForgottenPasswordSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setInfoMsg('');

        if (!recoveryInfo?.user_id) return;

        const cleanCode = recoveryCode.replace(/\D/g, '');
        if (cleanCode.length !== 6) {
            setError('Ingresá el código de verificación de 6 dígitos.');
            triggerShake();
            return;
        }

        if (!recoveryNewPassword || !recoveryConfirmPassword) {
            setError('Escribí y confirmá tu nueva contraseña personal.');
            triggerShake();
            return;
        }
        if (recoveryNewPassword.trim().length < 6) {
            setError('La nueva contraseña debe tener al menos 6 caracteres.');
            triggerShake();
            return;
        }
        if (recoveryNewPassword.trim() === '123456') {
            setError('Por seguridad no podés usar "123456". Elegí una clave personal.');
            triggerShake();
            return;
        }
        if (recoveryNewPassword.trim() !== recoveryConfirmPassword.trim()) {
            setError('Las contraseñas ingresadas no coinciden.');
            triggerShake();
            return;
        }

        let emailToSave = null;
        if (!recoveryInfo.datos_contacto_confirmados || recoveryRealEmail.trim()) {
            const candidate = recoveryRealEmail.trim().toLowerCase();
            if (!candidate || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
                setError('Por favor ingresá nuevamente tu correo electrónico real y válido para dejarlo actualizado en tu cuenta.');
                triggerShake();
                return;
            }
            emailToSave = candidate;
        }

        const cleanNewPwd = recoveryNewPassword.trim();

        setLoading(true);
        const res = await resetForgottenPassword({
            userId: recoveryInfo.user_id,
            method: recoveryMethod,
            code: cleanCode,
            newPassword: cleanNewPwd,
            newEmail: emailToSave,
            totpSecret: recoveryInfo.totp_secret || null,
        });

        if (!res.success) {
            setLoading(false);
            setError(res.error || 'No se pudo restablecer la contraseña.');
            triggerShake();
            return;
        }

        await logAction('blanqueo_recuperacion_password', {
            usuario: recoveryInfo.usuario,
            metodo: recoveryMethod,
        });

        const resolvedUsername = res.usuario || recoveryInfo.usuario;
        const loginRes = await login(resolvedUsername, cleanNewPwd);
        setLoading(false);

        if (loginRes.success && loginRes.user) {
            setRecoveryInfo(null);
            await logAction('login', { usuario: loginRes.user.usuario, mfa: recoveryMethod, via: 'blanqueo_password' });
            onLoginSuccess(loginRes.user);
            return;
        }

        if (loginRes.success && loginRes.requiresSessionTakeover) {
            setRecoveryInfo(null);
            setPendingUser(loginRes.pendingUser);
            setSessionConflict(loginRes.conflictInfo);
            setStep('session_conflict');
            return;
        }

        setUsuario(resolvedUsername);
        setPassword(cleanNewPwd);
        setRecoveryInfo(null);
        setStep('credentials');
        setInfoMsg('¡Contraseña blanqueada y restablecida con éxito! Hacé clic en Ingresar.');
    };

    // === PASO 3A: ENVIAR CÓDIGO WHATSAPP OTP ===
    const handleSendWhatsAppOtp = async () => {
        setError('');
        setInfoMsg('');
        const phoneToSend = whatsappPhone;
        const phoneCheck = validateStrictCellphone(phoneToSend);
        if (!phoneCheck.valid) {
            setError(phoneCheck.error);
            triggerShake();
            return;
        }

        setLoading(true);
        const res = await requestWhatsAppOtp(pendingUser.id, phoneCheck.clean);
        setLoading(false);

        if (!res.success) {
            setError((res.error || 'No se pudo enviar el código por WhatsApp.') + ' Si no te llega el mensaje, ingresá mediante autenticación con el QR.');
            triggerShake();
            return;
        }

        setOtpSent(true);
        setInfoMsg(`Código de 6 dígitos enviado por WhatsApp al ${res.telefono_whatsapp}`);
    };

    // === PASO 4: SOLICITUD DE ALTA DE USUARIO ===
    const handleReqAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        try {
            setUploadingReqAvatar(true);
            const url = await uploadAvatarFileOnly(file, reqForm.usuario_sugerido || 'solicitud');
            setReqForm(prev => ({ ...prev, avatar_url: url }));
        } catch (err) {
            setError(err.message || 'No se pudo subir la foto de perfil');
            triggerShake();
        } finally {
            setUploadingReqAvatar(false);
        }
    };

    const handleNameChangeAutoSuggestUser = (val) => {
        const parts = val.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(Boolean);
        let suggested = reqForm.usuario_sugerido;
        if (!suggested && parts.length >= 2) {
            suggested = (parts[0][0] + parts[parts.length - 1]).replace(/[^a-z0-9]/g, '');
        }
        setReqForm(prev => ({
            ...prev,
            nombre: val,
            usuario_sugerido: prev.usuario_sugerido || suggested,
            email: (!prev.email && suggested) ? `${suggested}@sanatorioargentino.com.ar` : prev.email,
        }));
    };

    const handleRequestAccountSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setInfoMsg('');

        const phoneCheck = validateStrictCellphone(reqForm.telefono_whatsapp);
        if (!phoneCheck.valid) {
            setError(phoneCheck.error);
            triggerShake();
            return;
        }

        if (!reqForm.nombre.trim() || !reqForm.usuario_sugerido.trim() || !reqForm.email.trim()) {
            setError('Completá Nombre y Apellido, Usuario sugerido y Email');
            triggerShake();
            return;
        }

        try {
            setLoading(true);
            await submitUserAccessRequest({
                ...reqForm,
                telefono_whatsapp: phoneCheck.clean,
                rol_solicitado: reqForm.rol_solicitado === 'admin' ? 'operador' : reqForm.rol_solicitado,
            });
            await logAction('solicitud_alta_usuario', {
                usuario_sugerido: reqForm.usuario_sugerido,
                nombre: reqForm.nombre,
                rol_solicitado: reqForm.rol_solicitado,
            });
            setReqSubmittedSuccess(true);
        } catch (err) {
            setError(err.message || 'No se pudo enviar la solicitud');
            triggerShake();
        } finally {
            setLoading(false);
        }
    };

    // === PASO 3B: VERIFICAR 2FA (WHATSAPP O TOTP) ===
    const handleMfaVerifySubmit = async (e) => {
        e.preventDefault();
        setError('');

        const cleanCode = otpCode.replace(/\D/g, '');
        if (cleanCode.length !== 6) {
            setError('Ingresá el código de 6 dígitos');
            triggerShake();
            return;
        }

        setLoading(true);
        let res;
        if (mfaMethod === 'whatsapp') {
            res = await verifyWhatsAppOtp(pendingUser.id, cleanCode, trustDevice);
        } else {
            res = await verifyAndSaveTotp(pendingUser.id, totpSecret, cleanCode, trustDevice);
        }
        setLoading(false);

        if (!res.success) {
            setError(res.error || 'Código inválido. Verificá e intentá nuevamente.');
            triggerShake();
            return;
        }

        await completeLoginSuccess({
            ...pendingUser,
            telefono_whatsapp: whatsappPhone || pendingUser.telefono_whatsapp,
        });
    };

    const handleCopyTotpSecret = () => {
        if (!totpSecret) return;
        navigator.clipboard?.writeText(totpSecret);
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
    };

    const totpUri = pendingUser && totpSecret ? getTotpUri(pendingUser.usuario, totpSecret) : '';
    const qrImageUrl = totpUri
        ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(totpUri)}`
        : '';

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#fff',
            fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
            overflowY: 'auto',
            padding: '20px 0',
        }}>
            {/* Background image at 50% opacity */}
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
                backgroundImage: "url('/SANARG2021_fondo.webp')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                opacity: 0.5,
                pointerEvents: 'none',
            }} />

            {/* Login Card */}
            <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: step === 'request_account' ? '540px' : (step === 'mfa' || step === 'change_password' || step === 'confirm_contact' || step === 'forgot_password') ? '490px' : '440px',
                margin: '0 20px',
                animation: 'loginFadeIn 0.4s ease-out',
            }}>
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    padding: '36px 34px 32px',
                    boxShadow: '0 8px 40px rgba(30,64,120,0.10), 0 2px 8px rgba(0,0,0,0.04)',
                    animation: shake ? 'shakeX 0.4s ease-out' : 'none',
                }}>
                    {/* Logo */}
                    <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                        <img
                            src="/logosanatorio.png"
                            alt="Sanatorio Argentino"
                            style={{
                                width: '64px', height: '64px',
                                objectFit: 'contain',
                                borderRadius: '14px',
                                boxShadow: '0 4px 12px rgba(30,64,120,0.12)',
                            }}
                        />
                    </div>

                    {/* Error Alert */}
                    {error && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 14px', borderRadius: '10px',
                            background: '#FEF2F2',
                            border: '1px solid #FECACA',
                            marginBottom: '16px',
                            animation: 'loginFadeIn 0.2s ease-out',
                        }}>
                            <AlertCircle size={16} style={{ color: '#DC2626', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.8rem', color: '#DC2626', fontWeight: 500 }}>{error}</span>
                        </div>
                    )}

                    {/* Aviso especial cuando fallan la contraseña: guiar al proceso de blanqueo */}
                    {step === 'credentials' && failedPasswordPrompt && (
                        <div style={{
                            padding: '12px 14px',
                            borderRadius: '12px',
                            background: '#EFF6FF',
                            border: '1.5px solid #93C5FD',
                            marginBottom: '16px',
                            animation: 'loginFadeIn 0.2s ease-out',
                        }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1E3A8A', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <KeyRound size={15} /> ¿Te olvidaste tu contraseña?
                            </div>
                            <p style={{ margin: '0 0 10px', fontSize: '0.75rem', color: '#1E40AF', lineHeight: 1.4 }}>
                                Debés <strong>volver a hacer el proceso de blanqueo de contraseña</strong>. Mediante un <strong>mensaje a tu WhatsApp</strong>, un <strong>código de autenticación</strong> (App Authenticator) o tu <strong>correo electrónico</strong> podés restablecerla y colocar una nueva.
                            </p>
                            <button
                                type="button"
                                onClick={openForgotPasswordFlow}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#1E4078',
                                    color: '#FFFFFF',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                }}
                            >
                                <KeyRound size={14} /> Blanquear mi contraseña y colocar una nueva
                            </button>
                        </div>
                    )}

                    {/* Info Alert */}
                    {infoMsg && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 14px', borderRadius: '10px',
                            background: '#ECFDF5',
                            border: '1px solid #A7F3D0',
                            marginBottom: '16px',
                            animation: 'loginFadeIn 0.2s ease-out',
                        }}>
                            <CheckCircle2 size={16} style={{ color: '#059669', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.8rem', color: '#065F46', fontWeight: 500 }}>{infoMsg}</span>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* PASO 1: CREDENCIALES DE ACCESO                            */}
                    {/* ========================================================= */}
                    {step === 'credentials' && (
                        <form onSubmit={handleCredentialsSubmit}>
                            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                                <h1 style={{
                                    margin: '0 0 6px',
                                    fontSize: '1.45rem',
                                    fontWeight: 800,
                                    color: '#1E293B',
                                    letterSpacing: '-0.02em',
                                }}>
                                    Ingresa con tu usuario
                                </h1>
                                <p style={{
                                    margin: 0,
                                    fontSize: '0.85rem',
                                    color: '#94A3B8',
                                    fontWeight: 500,
                                }}>
                                    Plataforma integral de Sanatorio Argentino
                                </p>
                            </div>

                            {/* USUARIO */}
                            <div style={{ marginBottom: '18px' }}>
                                <label style={{
                                    display: 'block',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    color: '#374151',
                                    marginBottom: '8px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.8px',
                                }}>
                                    Usuario
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <User size={17} style={{
                                        position: 'absolute', left: '14px', top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: '#94A3B8', pointerEvents: 'none',
                                    }} />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={usuario}
                                        onChange={e => setUsuario(e.target.value)}
                                        placeholder="Ingresá tu usuario"
                                        autoComplete="username"
                                        style={{
                                            width: '100%',
                                            padding: '13px 14px 13px 44px',
                                            borderRadius: '10px',
                                            border: '1.5px solid #E5E7EB',
                                            background: '#F9FAFB',
                                            color: '#1E293B',
                                            fontSize: '0.9rem',
                                            fontWeight: 500,
                                            outline: 'none',
                                            transition: 'all 0.2s ease',
                                            boxSizing: 'border-box',
                                        }}
                                        onFocus={e => {
                                            e.target.style.borderColor = '#1E4078';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(30,64,120,0.08)';
                                            e.target.style.background = '#FFFFFF';
                                        }}
                                        onBlur={e => {
                                            e.target.style.borderColor = '#E5E7EB';
                                            e.target.style.boxShadow = 'none';
                                            e.target.style.background = '#F9FAFB';
                                        }}
                                    />
                                </div>
                            </div>

                            {/* CONTRASEÑA */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label style={{
                                        display: 'block',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        color: '#374151',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.8px',
                                    }}>
                                        Contraseña
                                    </label>
                                    <button
                                        type="button"
                                        onClick={openForgotPasswordFlow}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: 0,
                                            color: '#1E4078',
                                            fontSize: '0.73rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            textDecoration: 'underline',
                                        }}
                                    >
                                        ¿Olvidaste tu contraseña? Blanquear clave
                                    </button>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <Lock size={17} style={{
                                        position: 'absolute', left: '14px', top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: '#94A3B8', pointerEvents: 'none',
                                    }} />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete="current-password"
                                        style={{
                                            width: '100%',
                                            padding: '13px 44px 13px 44px',
                                            borderRadius: '10px',
                                            border: '1.5px solid #E5E7EB',
                                            background: '#F9FAFB',
                                            color: '#1E293B',
                                            fontSize: '0.9rem',
                                            fontWeight: 500,
                                            outline: 'none',
                                            transition: 'all 0.2s ease',
                                            boxSizing: 'border-box',
                                        }}
                                        onFocus={e => {
                                            e.target.style.borderColor = '#1E4078';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(30,64,120,0.08)';
                                            e.target.style.background = '#FFFFFF';
                                        }}
                                        onBlur={e => {
                                            e.target.style.borderColor = '#E5E7EB';
                                            e.target.style.boxShadow = 'none';
                                            e.target.style.background = '#F9FAFB';
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={{
                                            position: 'absolute', right: '12px', top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'none', border: 'none',
                                            cursor: 'pointer', color: '#94A3B8',
                                            padding: '4px', display: 'flex',
                                        }}
                                    >
                                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: loading ? '#2C5282' : '#1E4078',
                                    color: '#FFFFFF',
                                    fontSize: '0.95rem',
                                    fontWeight: 700,
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 12px rgba(30,64,120,0.25)',
                                }}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                        Verificando...
                                    </>
                                ) : (
                                    'Iniciar Sesión'
                                )}
                            </button>

                            <p style={{
                                textAlign: 'center',
                                marginTop: '18px',
                                marginBottom: 0,
                                fontSize: '0.75rem',
                                color: '#94A3B8',
                                fontWeight: 500,
                            }}>
                                ¿No tenés cuenta?{' '}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setError('');
                                        setInfoMsg('');
                                        setReqSubmittedSuccess(false);
                                        setStep('request_account');
                                    }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        color: '#1E4078',
                                        fontWeight: 700,
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        textDecoration: 'underline',
                                    }}
                                >
                                    Comunicáte con el Administrador
                                </button>
                            </p>
                        </form>
                    )}

                    {/* ========================================================= */}
                    {/* PASO 2: ACTUALIZACIÓN OBLIGATORIA DE CONTRASEÑA Y CONTACTO*/}
                    {/* ========================================================= */}
                    {step === 'change_password' && pendingUser && (
                        <form onSubmit={handlePasswordChangeSubmit}>
                            <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 12px', borderRadius: '999px',
                                    background: '#EFF6FF', color: '#1D4ED8',
                                    fontSize: '0.72rem', fontWeight: 700, marginBottom: '6px',
                                }}>
                                    <KeyRound size={14} /> ACTUALIZACIÓN DE CIBERSEGURIDAD
                                </div>
                                <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: '#1E293B' }}>
                                    Hola, {pendingUser.nombre}
                                </h2>
                            </div>

                            {/* Aviso Institucional de Ciberseguridad */}
                            <div style={{
                                padding: '11px 13px',
                                borderRadius: '10px',
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                marginBottom: '16px',
                                fontSize: '0.74rem',
                                color: '#1E3A8A',
                                lineHeight: 1.42,
                            }}>
                                <strong style={{ display: 'block', marginBottom: '3px', color: '#1E4078' }}>
                                    🛡️ Estamos mejorando nuestra Ciberseguridad:
                                </strong>
                                Para proteger tu cuenta es necesario que configures tu <strong>contraseña personal</strong>, dejes registrado tu <strong>número de celular (WhatsApp)</strong> para poder comunicarnos siempre ahí, y <strong>coloques nuevamente tu correo electrónico real</strong> (ya que algunas cuentas tenían correos ficticios por defecto). Estos canales te permitirán blanquear tu clave si la olvidás.
                            </div>

                            <div style={{ marginBottom: '12px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.71rem', fontWeight: 700,
                                    color: '#374151', marginBottom: '5px', textTransform: 'uppercase',
                                }}>
                                    Nueva Contraseña Personal *
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Lock size={16} style={{
                                        position: 'absolute', left: '14px', top: '50%',
                                        transform: 'translateY(-50%)', color: '#94A3B8',
                                    }} />
                                    <input
                                        ref={inputRef}
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Mínimo 6 caracteres (distinta de 123456)"
                                        style={{
                                            width: '100%', padding: '11px 42px 11px 40px',
                                            borderRadius: '10px', border: '1.5px solid #CBD5E1',
                                            background: '#F8FAFC', fontSize: '0.88rem', boxSizing: 'border-box',
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        style={{
                                            position: 'absolute', right: '12px', top: '50%',
                                            transform: 'translateY(-50%)', background: 'none', border: 'none',
                                            cursor: 'pointer', color: '#94A3B8',
                                        }}
                                    >
                                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.71rem', fontWeight: 700,
                                    color: '#374151', marginBottom: '5px', textTransform: 'uppercase',
                                }}>
                                    Repetir Nueva Contraseña *
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Lock size={16} style={{
                                        position: 'absolute', left: '14px', top: '50%',
                                        transform: 'translateY(-50%)', color: '#94A3B8',
                                    }} />
                                    <input
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="Confirmá tu nueva contraseña"
                                        style={{
                                            width: '100%', padding: '11px 14px 11px 40px',
                                            borderRadius: '10px', border: '1.5px solid #CBD5E1',
                                            background: '#F8FAFC', fontSize: '0.88rem', boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                {newPassword && confirmPassword && newPassword === confirmPassword && newPassword.length >= 6 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px', fontSize: '0.73rem', color: '#059669', fontWeight: 600 }}>
                                        <CheckCircle2 size={14} /> Las contraseñas coinciden y cumplen los requisitos
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: '12px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.71rem', fontWeight: 700,
                                    color: '#374151', marginBottom: '5px', textTransform: 'uppercase',
                                }}>
                                    Tu Celular con WhatsApp (10 dígitos sin +549 ni 15) *
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Smartphone size={16} style={{
                                        position: 'absolute', left: '14px', top: '50%',
                                        transform: 'translateY(-50%)', color: '#94A3B8',
                                    }} />
                                    <input
                                        type="tel"
                                        value={securityPhone}
                                        onChange={e => setSecurityPhone(e.target.value)}
                                        placeholder="2645438114"
                                        style={{
                                            width: '100%', padding: '11px 14px 11px 40px',
                                            borderRadius: '10px', border: '1.5px solid #CBD5E1',
                                            background: '#F8FAFC', fontSize: '0.88rem', fontWeight: 600, boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#0369A1', fontWeight: 600, marginTop: '3px' }}>
                                    Formato obligatorio: <strong>2645438114</strong> (para recibir avisos y códigos de blanqueo).
                                </div>
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.71rem', fontWeight: 700,
                                    color: '#374151', marginBottom: '5px', textTransform: 'uppercase',
                                }}>
                                    Tu Correo Electrónico Real (colocar nuevamente) *
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Mail size={16} style={{
                                        position: 'absolute', left: '14px', top: '50%',
                                        transform: 'translateY(-50%)', color: '#94A3B8',
                                    }} />
                                    <input
                                        type="email"
                                        value={securityEmail}
                                        onChange={e => setSecurityEmail(e.target.value)}
                                        placeholder="Ingresá tu mail real (ej: nombre@gmail.com)"
                                        style={{
                                            width: '100%', padding: '11px 14px 11px 40px',
                                            borderRadius: '10px', border: '1.5px solid #CBD5E1',
                                            background: '#F8FAFC', fontSize: '0.88rem', boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '3px' }}>
                                    Colocá tu mail real en uso (algunas cuentas tenían asignado <code>{pendingUser.email}</code> de forma ficticia).
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
                                    background: '#1E4078', color: '#FFFFFF', fontSize: '0.92rem',
                                    fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    boxShadow: '0 4px 12px rgba(30,64,120,0.25)',
                                }}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
                                        Guardando clave y datos de seguridad...
                                    </>
                                ) : (
                                    'Guardar Contraseña, Contacto y Continuar'
                                )}
                            </button>
                        </form>
                    )}

                    {/* ========================================================= */}
                    {/* PASO 2.5: CONFIRMACIÓN DE CONTACTO DE CIBERSEGURIDAD      */}
                    {/* (Para usuarios que ya cambiaron su clave pero aún no      */}
                    {/*  confirmaron su WhatsApp y su Mail real)                  */}
                    {/* ========================================================= */}
                    {step === 'confirm_contact' && pendingUser && (
                        <form onSubmit={handleConfirmContactSubmit}>
                            <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 12px', borderRadius: '999px',
                                    background: '#EFF6FF', color: '#1D4ED8',
                                    fontSize: '0.72rem', fontWeight: 700, marginBottom: '6px',
                                }}>
                                    <ShieldCheck size={14} /> FORTALECIMIENTO DE CIBERSEGURIDAD
                                </div>
                                <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: '#1E293B' }}>
                                    Actualización de Contacto Oficial
                                </h2>
                            </div>

                            <div style={{
                                padding: '12px 14px',
                                borderRadius: '10px',
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                marginBottom: '16px',
                                fontSize: '0.75rem',
                                color: '#1E3A8A',
                                lineHeight: 1.45,
                            }}>
                                <strong style={{ display: 'block', marginBottom: '4px', color: '#1E4078' }}>
                                    🛡️ Estamos mejorando nuestra Ciberseguridad en Sanatorio Argentino
                                </strong>
                                Por este motivo es necesario que dejes registrado un <strong>número de celular con WhatsApp</strong> para poder comunicarnos siempre ahí y que <strong>coloques nuevamente tu correo electrónico real</strong> (ya que algunas cuentas estaban con mails ficticios). Con estos datos podrás blanquear y restablecer tu contraseña en caso de olvidarla.
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.72rem', fontWeight: 700,
                                    color: '#374151', marginBottom: '6px', textTransform: 'uppercase',
                                }}>
                                    Tu Celular con WhatsApp (10 dígitos sin +549 ni 15) *
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Smartphone size={16} style={{
                                        position: 'absolute', left: '14px', top: '50%',
                                        transform: 'translateY(-50%)', color: '#94A3B8',
                                    }} />
                                    <input
                                        type="tel"
                                        value={securityPhone}
                                        onChange={e => setSecurityPhone(e.target.value)}
                                        placeholder="2645438114"
                                        style={{
                                            width: '100%', padding: '12px 14px 12px 40px',
                                            borderRadius: '10px', border: '1.5px solid #CBD5E1',
                                            background: '#F8FAFC', fontSize: '0.9rem', fontWeight: 600, boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                <div style={{ fontSize: '0.69rem', color: '#0369A1', fontWeight: 600, marginTop: '4px' }}>
                                    Formato obligatorio: <strong>2645438114</strong> (sin +549, sin 15 y sin espacios).
                                </div>
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.72rem', fontWeight: 700,
                                    color: '#374151', marginBottom: '6px', textTransform: 'uppercase',
                                }}>
                                    Tu Correo Electrónico Real (colocar nuevamente) *
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Mail size={16} style={{
                                        position: 'absolute', left: '14px', top: '50%',
                                        transform: 'translateY(-50%)', color: '#94A3B8',
                                    }} />
                                    <input
                                        type="email"
                                        value={securityEmail}
                                        onChange={e => setSecurityEmail(e.target.value)}
                                        placeholder="Ingresá tu correo electrónico real"
                                        style={{
                                            width: '100%', padding: '12px 14px 12px 40px',
                                            borderRadius: '10px', border: '1.5px solid #CBD5E1',
                                            background: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                <div style={{ fontSize: '0.69rem', color: '#64748B', marginTop: '4px' }}>
                                    Escribí tu correo real (anteriormente figuraba <code>{pendingUser.email}</code>).
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
                                    background: '#1E4078', color: '#FFFFFF', fontSize: '0.92rem',
                                    fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    boxShadow: '0 4px 12px rgba(30,64,120,0.25)',
                                }}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
                                        Guardando datos de seguridad...
                                    </>
                                ) : (
                                    'Confirmar Datos de Ciberseguridad y Continuar'
                                )}
                            </button>
                        </form>
                    )}

                    {/* ========================================================= */}
                    {/* PASO BLANQUEO: ¿OLVIDASTE TU CONTRASEÑA?                  */}
                    {/* ========================================================= */}
                    {step === 'forgot_password' && (
                        <div>
                            <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 12px', borderRadius: '999px',
                                    background: '#EFF6FF', color: '#1E4078',
                                    fontSize: '0.72rem', fontWeight: 700, marginBottom: '6px',
                                }}>
                                    <KeyRound size={14} /> BLANQUEO Y RECUPERACIÓN DE CLAVE
                                </div>
                                <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: '#1E293B' }}>
                                    Restablecer Contraseña
                                </h2>
                                <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748B', lineHeight: 1.4 }}>
                                    Estamos mejorando nuestra ciberseguridad: si olvidaste tu contraseña debés volver a realizar el proceso de validación para blanquearla y colocar una nueva.
                                </p>
                            </div>

                            {!recoveryInfo ? (
                                <form onSubmit={handleLookupRecoveryUser}>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{
                                            display: 'block', fontSize: '0.72rem', fontWeight: 700,
                                            color: '#374151', marginBottom: '6px', textTransform: 'uppercase',
                                        }}>
                                            Tu Nombre de Usuario *
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <User size={16} style={{
                                                position: 'absolute', left: '14px', top: '50%',
                                                transform: 'translateY(-50%)', color: '#94A3B8',
                                            }} />
                                            <input
                                                type="text"
                                                value={recoveryUsername}
                                                onChange={e => setRecoveryUsername(e.target.value)}
                                                placeholder="Ingresá tu usuario"
                                                style={{
                                                    width: '100%', padding: '12px 14px 12px 40px',
                                                    borderRadius: '10px', border: '1.5px solid #CBD5E1',
                                                    background: '#F8FAFC', fontSize: '0.9rem', boxSizing: 'border-box',
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        style={{
                                            width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
                                            background: '#1E4078', color: '#FFFFFF', fontSize: '0.9rem',
                                            fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        }}
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
                                                Buscando cuenta...
                                            </>
                                        ) : (
                                            'Continuar con el Blanqueo de Contraseña'
                                        )}
                                    </button>
                                </form>
                            ) : (
                                <form onSubmit={handleResetForgottenPasswordSubmit}>
                                    <div style={{
                                        padding: '10px 12px', borderRadius: '10px',
                                        background: '#F8FAFC', border: '1px solid #E2E8F0',
                                        marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                                                {recoveryInfo.nombre} <span style={{ color: '#64748B', fontWeight: 600 }}>(@{recoveryInfo.usuario})</span>
                                            </div>
                                            <div style={{ fontSize: '0.69rem', color: '#64748B' }}>
                                                Elegí cómo validar tu identidad para blanquear tu clave:
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setRecoveryInfo(null); setError(''); setInfoMsg(''); }}
                                            style={{
                                                background: 'none', border: 'none', color: '#1E4078',
                                                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline',
                                            }}
                                        >
                                            Cambiar usuario
                                        </button>
                                    </div>

                                    {/* 1RA OPCIÓN PRINCIPAL: WHATSAPP O CÓDIGO DE AUTENTICACIÓN */}
                                    <div style={{ marginBottom: '10px' }}>
                                        <div style={{ fontSize: '0.69rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', marginBottom: '6px' }}>
                                            1ra Opción (Recomendada): WhatsApp o Código de Autenticación
                                        </div>
                                        <div style={{
                                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px',
                                            background: '#F1F5F9', padding: '4px', borderRadius: '10px',
                                        }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setRecoveryMethod('whatsapp');
                                                    setError('');
                                                    setInfoMsg('');
                                                    if (recoveryInfo?.has_whatsapp && !recoveryOtpSent) {
                                                        handleSendRecoveryCode('whatsapp');
                                                    }
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                                                    padding: '9px 6px', borderRadius: '8px', border: 'none',
                                                    background: recoveryMethod === 'whatsapp' ? '#FFFFFF' : 'transparent',
                                                    color: recoveryMethod === 'whatsapp' ? '#047857' : '#64748B',
                                                    boxShadow: recoveryMethod === 'whatsapp' ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
                                                    fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                                                }}
                                            >
                                                <Smartphone size={14} /> Mensaje WhatsApp
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setRecoveryMethod('totp'); setError(''); setInfoMsg(''); }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                                                    padding: '9px 6px', borderRadius: '8px', border: 'none',
                                                    background: recoveryMethod === 'totp' ? '#FFFFFF' : 'transparent',
                                                    color: recoveryMethod === 'totp' ? '#1E4078' : '#64748B',
                                                    boxShadow: recoveryMethod === 'totp' ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
                                                    fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                                                }}
                                            >
                                                <QrCode size={14} /> Código Autenticación
                                            </button>
                                        </div>
                                    </div>

                                    {/* 2DA OPCIÓN: CORREO ELECTRÓNICO */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRecoveryMethod('email');
                                                setError('');
                                                setInfoMsg('');
                                                handleSendRecoveryCode('email');
                                            }}
                                            style={{
                                                width: '100%', padding: '8px 10px', borderRadius: '9px',
                                                border: recoveryMethod === 'email' ? '1.5px solid #1E4078' : '1px solid #CBD5E1',
                                                background: recoveryMethod === 'email' ? '#EFF6FF' : '#FFFFFF',
                                                color: recoveryMethod === 'email' ? '#1E4078' : '#475569',
                                                fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                            }}
                                        >
                                            <Mail size={14} /> 2da Opción: Enviar código al Correo Electrónico ({recoveryInfo.masked_email || 'sin correo'})
                                        </button>
                                    </div>

                                    {/* DETALLE DEL MÉTODO SELECCIONADO */}
                                    {recoveryMethod === 'whatsapp' && (
                                        <div style={{
                                            background: '#F0FDF4', border: '1px solid #BBF7D0',
                                            borderRadius: '10px', padding: '11px 12px', marginBottom: '12px',
                                        }}>
                                            {recoveryInfo.has_whatsapp ? (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                                    <div style={{ fontSize: '0.74rem', color: '#065F46', lineHeight: 1.35 }}>
                                                        {recoveryOtpSent
                                                            ? <>Código de 6 dígitos enviado al WhatsApp: <strong>{recoveryInfo.masked_whatsapp}</strong></>
                                                            : <>Se enviará un código de 6 dígitos al WhatsApp registrado: <strong>{recoveryInfo.masked_whatsapp}</strong></>}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={loading}
                                                        onClick={() => handleSendRecoveryCode('whatsapp')}
                                                        style={{
                                                            padding: '7px 12px', borderRadius: '8px', border: 'none',
                                                            background: '#059669', color: '#FFFFFF',
                                                            fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                        }}
                                                    >
                                                        <Smartphone size={13} /> {recoveryOtpSent ? 'Reenviar WhatsApp' : 'Enviar WhatsApp'}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.73rem', color: '#991B1B', fontWeight: 600 }}>
                                                    Tu cuenta aún no tiene un celular registrado. Probá con Código de Autenticación, la 2da Opción (Mail) o pedile el blanqueo al Administrador.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {recoveryMethod === 'totp' && (
                                        <div style={{
                                            background: '#EFF6FF', border: '1px solid #BFDBFE',
                                            borderRadius: '10px', padding: '11px 12px', marginBottom: '12px',
                                            fontSize: '0.74rem', color: '#1E3A8A', lineHeight: 1.4, textAlign: 'center',
                                        }}>
                                            <div style={{ marginBottom: '6px' }}>
                                                Abrí tu app <strong>Google Authenticator</strong> o <strong>Microsoft Authenticator</strong> e ingresá el código de 6 dígitos de <strong>Sanatorio Argentino ({recoveryInfo.usuario})</strong>.
                                            </div>
                                            {recoveryInfo.totp_secret && (
                                                <div style={{ marginTop: '6px' }}>
                                                    <div style={{
                                                        display: 'inline-block', padding: '8px', background: '#FFFFFF',
                                                        borderRadius: '10px', border: '1px solid #DBEAFE', marginBottom: '6px',
                                                    }}>
                                                        <img
                                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=6&data=${encodeURIComponent(buildOtpAuthUri(recoveryInfo.usuario, recoveryInfo.totp_secret))}`}
                                                            alt="QR Authenticator"
                                                            style={{ width: '135px', height: '135px', display: 'block' }}
                                                        />
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: '#475569' }}>
                                                        Clave manual: <code style={{ background: '#DBEAFE', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, color: '#1E3A8A' }}>{recoveryInfo.totp_secret}</code>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {recoveryMethod === 'email' && (
                                        <div style={{
                                            background: '#F8FAFC', border: '1px solid #CBD5E1',
                                            borderRadius: '10px', padding: '11px 12px', marginBottom: '12px',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                                <div style={{ fontSize: '0.73rem', color: '#334155', lineHeight: 1.35 }}>
                                                    Correo registrado: <strong>{recoveryInfo.masked_email}</strong>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={loading}
                                                    onClick={() => handleSendRecoveryCode('email')}
                                                    style={{
                                                        padding: '7px 12px', borderRadius: '8px', border: 'none',
                                                        background: '#1E4078', color: '#FFFFFF',
                                                        fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                    }}
                                                >
                                                    <Mail size={13} /> {recoveryOtpSent ? 'Reenviar código' : 'Enviar código al Mail'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* CÓDIGO DE 6 DÍGITOS */}
                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={{
                                            display: 'block', fontSize: '0.71rem', fontWeight: 700,
                                            color: '#374151', marginBottom: '5px', textTransform: 'uppercase', textAlign: 'center',
                                        }}>
                                            Código de Verificación (6 dígitos) *
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            value={recoveryCode}
                                            onChange={e => setRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            placeholder="000000"
                                            style={{
                                                width: '100%', padding: '10px', borderRadius: '10px',
                                                border: '2px solid #CBD5E1', background: '#FFFFFF',
                                                fontSize: '1.25rem', fontWeight: 800, color: '#1E293B',
                                                textAlign: 'center', letterSpacing: '8px', boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>

                                    {/* NUEVA CONTRASEÑA */}
                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{
                                            display: 'block', fontSize: '0.71rem', fontWeight: 700,
                                            color: '#374151', marginBottom: '4px', textTransform: 'uppercase',
                                        }}>
                                            Colocar Nueva Contraseña Personal *
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <Lock size={15} style={{
                                                position: 'absolute', left: '12px', top: '50%',
                                                transform: 'translateY(-50%)', color: '#94A3B8',
                                            }} />
                                            <input
                                                type={showRecoveryPassword ? 'text' : 'password'}
                                                value={recoveryNewPassword}
                                                onChange={e => setRecoveryNewPassword(e.target.value)}
                                                placeholder="Mínimo 6 caracteres (distinta de 123456)"
                                                style={{
                                                    width: '100%', padding: '10px 38px 10px 36px',
                                                    borderRadius: '9px', border: '1.5px solid #CBD5E1',
                                                    background: '#F8FAFC', fontSize: '0.86rem', boxSizing: 'border-box',
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowRecoveryPassword(!showRecoveryPassword)}
                                                style={{
                                                    position: 'absolute', right: '10px', top: '50%',
                                                    transform: 'translateY(-50%)', background: 'none', border: 'none',
                                                    cursor: 'pointer', color: '#94A3B8',
                                                }}
                                            >
                                                {showRecoveryPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={{
                                            display: 'block', fontSize: '0.71rem', fontWeight: 700,
                                            color: '#374151', marginBottom: '4px', textTransform: 'uppercase',
                                        }}>
                                            Confirmar Nueva Contraseña *
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <Lock size={15} style={{
                                                position: 'absolute', left: '12px', top: '50%',
                                                transform: 'translateY(-50%)', color: '#94A3B8',
                                            }} />
                                            <input
                                                type={showRecoveryPassword ? 'text' : 'password'}
                                                value={recoveryConfirmPassword}
                                                onChange={e => setRecoveryConfirmPassword(e.target.value)}
                                                placeholder="Repetí tu nueva contraseña"
                                                style={{
                                                    width: '100%', padding: '10px 12px 10px 36px',
                                                    borderRadius: '9px', border: '1.5px solid #CBD5E1',
                                                    background: '#F8FAFC', fontSize: '0.86rem', boxSizing: 'border-box',
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {!recoveryInfo.datos_contacto_confirmados && (
                                        <div style={{ marginBottom: '14px' }}>
                                            <label style={{
                                                display: 'block', fontSize: '0.71rem', fontWeight: 700,
                                                color: '#374151', marginBottom: '4px', textTransform: 'uppercase',
                                            }}>
                                                Tu Correo Electrónico Real (colocar nuevamente) *
                                            </label>
                                            <input
                                                type="email"
                                                value={recoveryRealEmail}
                                                onChange={e => setRecoveryRealEmail(e.target.value)}
                                                placeholder="Ingresá tu correo electrónico real"
                                                style={{
                                                    width: '100%', padding: '10px 12px',
                                                    borderRadius: '9px', border: '1.5px solid #CBD5E1',
                                                    background: '#F8FAFC', fontSize: '0.86rem', boxSizing: 'border-box',
                                                }}
                                            />
                                            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '3px' }}>
                                                Estamos mejorando nuestra ciberseguridad: ingresá tu mail real ya que algunas cuentas tenían correos ficticios.
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        style={{
                                            width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                                            background: '#1E4078', color: '#FFFFFF', fontSize: '0.9rem',
                                            fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                            boxShadow: '0 4px 12px rgba(30,64,120,0.2)',
                                        }}
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                                Restableciendo contraseña...
                                            </>
                                        ) : (
                                            <>
                                                <ShieldCheck size={16} /> Blanquear y Guardar Nueva Contraseña
                                            </>
                                        )}
                                    </button>
                                </form>
                            )}

                            <button
                                type="button"
                                onClick={() => { setStep('credentials'); setError(''); setInfoMsg(''); }}
                                style={{
                                    width: '100%', marginTop: '10px', padding: '8px',
                                    background: 'none', border: 'none', color: '#64748B',
                                    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                }}
                            >
                                <ArrowLeft size={14} /> Volver al inicio de sesión
                            </button>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* PASO 3: AUTENTICACIÓN MULTIFACTOR HÍBRIDA (2FA)           */}
                    {/* ========================================================= */}
                    {step === 'mfa' && pendingUser && (
                        <form onSubmit={handleMfaVerifySubmit}>
                            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 12px', borderRadius: '999px',
                                    background: '#ECFDF5', color: '#047857',
                                    fontSize: '0.72rem', fontWeight: 700, marginBottom: '6px',
                                }}>
                                    <ShieldCheck size={14} /> VERIFICACIÓN EN 2 PASOS (2FA)
                                </div>
                                <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: '#1E293B' }}>
                                    Protección de Cuenta
                                </h2>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                                    Elegí cómo querés validar tu identidad en este equipo:
                                </p>
                            </div>

                            {/* Selector de Método 2FA: WhatsApp vs Google Authenticator */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
                                background: '#F1F5F9', padding: '4px', borderRadius: '12px',
                                marginBottom: '18px',
                            }}>
                                <button
                                    type="button"
                                    onClick={() => { setMfaMethod('whatsapp'); setError(''); setInfoMsg(''); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        padding: '10px 8px', borderRadius: '9px', border: 'none',
                                        background: mfaMethod === 'whatsapp' ? '#FFFFFF' : 'transparent',
                                        color: mfaMethod === 'whatsapp' ? '#047857' : '#64748B',
                                        boxShadow: mfaMethod === 'whatsapp' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                                        fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                >
                                    <Smartphone size={15} /> Código WhatsApp
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setMfaMethod('totp'); setError(''); setInfoMsg(''); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        padding: '10px 8px', borderRadius: '9px', border: 'none',
                                        background: mfaMethod === 'totp' ? '#FFFFFF' : 'transparent',
                                        color: mfaMethod === 'totp' ? '#1E4078' : '#64748B',
                                        boxShadow: mfaMethod === 'totp' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                                        fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                >
                                    <QrCode size={15} /> App Authenticator
                                </button>
                            </div>

                            {/* OPCIÓN A: WHATSAPP OTP */}
                            {mfaMethod === 'whatsapp' && (
                                <div style={{
                                    background: '#F8FAFC', border: '1px solid #E2E8F0',
                                    borderRadius: '12px', padding: '14px', marginBottom: '16px',
                                }}>
                                    <label style={{
                                        display: 'block', fontSize: '0.71rem', fontWeight: 700,
                                        color: '#475569', marginBottom: '6px', textTransform: 'uppercase',
                                    }}>
                                        Tu Celular con WhatsApp (10 dígitos sin +549 ni 15)
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <input
                                            type="tel"
                                            value={whatsappPhone}
                                            onChange={e => setWhatsappPhone(e.target.value)}
                                            placeholder="2645438114"
                                            style={{
                                                flex: 1, padding: '10px 12px', borderRadius: '8px',
                                                border: '1.5px solid #CBD5E1', background: '#FFFFFF',
                                                fontSize: '0.86rem', fontWeight: 600, color: '#1E293B',
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleSendWhatsAppOtp}
                                            disabled={loading}
                                            style={{
                                                padding: '10px 14px', borderRadius: '8px', border: 'none',
                                                background: '#059669', color: '#FFFFFF',
                                                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px',
                                            }}
                                        >
                                            {otpSent ? <RefreshCw size={13} /> : <Smartphone size={13} />}
                                            {otpSent ? 'Reenviar' : 'Enviar código'}
                                        </button>
                                    </div>
                                    <p style={{ margin: '0 0 4px', fontSize: '0.69rem', color: '#0369A1', fontWeight: 600 }}>
                                        Formato obligatorio: <strong>2645438114</strong> (sin +549, sin 15 y sin espacios).
                                    </p>
                                    <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: '#64748B', lineHeight: 1.35 }}>
                                        El bot oficial de Sanatorio Argentino te enviará al instante un código de 6 dígitos por WhatsApp.
                                    </p>

                                    <div style={{
                                        padding: '10px 12px',
                                        borderRadius: '10px',
                                        background: '#EFF6FF',
                                        border: '1px solid #BFDBFE',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px',
                                    }}>
                                        <div style={{ fontSize: '0.73rem', color: '#1E3A8A', lineHeight: 1.4, fontWeight: 600 }}>
                                            ¿No te llega el código por WhatsApp? Ingresá mediante <strong>autenticación con el QR</strong> (App Authenticator).
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMfaMethod('totp');
                                                setShowQrSetup(true);
                                                setError('');
                                                setInfoMsg('');
                                            }}
                                            style={{
                                                alignSelf: 'flex-start',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '7px 12px',
                                                borderRadius: '8px',
                                                border: '1px solid #1E4078',
                                                background: '#FFFFFF',
                                                color: '#1E4078',
                                                fontSize: '0.74rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <QrCode size={14} /> Ingresar mediante Autenticación con QR
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* OPCIÓN B: GOOGLE / MICROSOFT AUTHENTICATOR (QR) */}
                            {mfaMethod === 'totp' && (
                                <div style={{
                                    background: '#F8FAFC', border: '1px solid #E2E8F0',
                                    borderRadius: '12px', padding: '14px', marginBottom: '16px',
                                    textAlign: 'center',
                                }}>
                                    {showQrSetup ? (
                                        <>
                                            <p style={{ margin: '0 0 6px', fontSize: '0.76rem', color: '#334155', fontWeight: 600 }}>
                                                1. Abrí la app <strong>Google Authenticator</strong> o <strong>Microsoft Authenticator</strong> en tu celular, tocá <strong>"+" → "Escanear código QR"</strong>:
                                            </p>
                                            <p style={{ margin: '0 0 10px', fontSize: '0.68rem', color: '#64748B' }}>
                                                (No escanees con la cámara normal de fotos; hacelo desde la app autenticadora o elegí la pestaña <strong>"📱 Código WhatsApp"</strong> arriba).
                                            </p>
                                            <div style={{
                                                display: 'inline-block', padding: '10px', background: '#FFFFFF',
                                                borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '8px',
                                            }}>
                                                <img
                                                    src={qrImageUrl}
                                                    alt="Código QR 2FA"
                                                    style={{ width: '175px', height: '175px', display: 'block' }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                <code style={{
                                                    fontSize: '0.72rem', background: '#E2E8F0', padding: '4px 8px',
                                                    borderRadius: '6px', color: '#1E293B', fontWeight: 700, letterSpacing: '1px',
                                                }}>
                                                    {totpSecret}
                                                </code>
                                                <button
                                                    type="button"
                                                    onClick={handleCopyTotpSecret}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: '#1E4078', fontSize: '0.72rem', fontWeight: 600,
                                                        display: 'flex', alignItems: 'center', gap: '3px',
                                                    }}
                                                >
                                                    <Copy size={12} /> {copiedSecret ? 'Copiado' : 'Copiar clave'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTotpSecret(generateTotpSecret(16))}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: '#059669', fontSize: '0.72rem', fontWeight: 600,
                                                        display: 'flex', alignItems: 'center', gap: '3px',
                                                    }}
                                                >
                                                    <RefreshCw size={12} /> Nuevo QR
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ padding: '4px 0' }}>
                                            <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#334155', fontWeight: 600 }}>
                                                Abrí tu aplicación autenticadora en el celular e ingresá el código de 6 dígitos de <strong>Sanatorio Argentino</strong>.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => setShowQrSetup(true)}
                                                style={{
                                                    background: 'none', border: 'none', color: '#1E4078',
                                                    fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
                                                    textDecoration: 'underline',
                                                }}
                                            >
                                                ¿Necesitás volver a escanear el código QR?
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* INPUT DEL CÓDIGO DE 6 DÍGITOS */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.72rem', fontWeight: 700,
                                    color: '#374151', marginBottom: '6px', textTransform: 'uppercase',
                                    textAlign: 'center',
                                }}>
                                    Código de Verificación (6 dígitos)
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={otpCode}
                                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    style={{
                                        width: '100%', padding: '12px', borderRadius: '10px',
                                        border: '2px solid #CBD5E1', background: '#FFFFFF',
                                        fontSize: '1.35rem', fontWeight: 800, color: '#1E293B',
                                        textAlign: 'center', letterSpacing: '8px', boxSizing: 'border-box',
                                    }}
                                />
                            </div>

                            {/* CHECKBOX: RECORDAR ESTA PC POR 30 DÍAS */}
                            <label style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '10px 12px', borderRadius: '8px',
                                background: '#EFF6FF', border: '1px solid #BFDBFE',
                                marginBottom: '18px', cursor: 'pointer', fontSize: '0.78rem',
                                color: '#1E3A8A', fontWeight: 600,
                            }}>
                                <input
                                    type="checkbox"
                                    checked={trustDevice}
                                    onChange={e => setTrustDevice(e.target.checked)}
                                    style={{ width: '16px', height: '16px', accentColor: '#1E4078', cursor: 'pointer' }}
                                />
                                <span>Confiar en esta PC de trabajo por 30 días</span>
                            </label>

                            <button
                                type="submit"
                                disabled={loading || otpCode.length !== 6}
                                style={{
                                    width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
                                    background: otpCode.length === 6 ? '#1E4078' : '#94A3B8',
                                    color: '#FFFFFF', fontSize: '0.92rem', fontWeight: 700,
                                    cursor: otpCode.length === 6 && !loading ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                }}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
                                        Verificando código...
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck size={17} /> Verificar e Ingresar al Sistema
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => { setStep('credentials'); setError(''); setInfoMsg(''); }}
                                style={{
                                    width: '100%', marginTop: '10px', padding: '8px',
                                    background: 'none', border: 'none', color: '#64748B',
                                    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                }}
                            >
                                <ArrowLeft size={14} /> Volver al inicio de sesión
                            </button>
                        </form>
                    )}

                    {/* ========================================================= */}
                    {/* PASO 3.5: BLOQUEO DE SESIÓN SIMULTÁNEA EN OTRO EQUIPO     */}
                    {/* ========================================================= */}
                    {step === 'concurrent_session' && (
                        <div style={{ padding: '4px 0' }}>
                            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
                                <div style={{
                                    width: '56px', height: '56px', borderRadius: '50%',
                                    background: '#FEF3C7', border: '2px solid #F59E0B',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 12px', color: '#D97706',
                                }}>
                                    <Monitor size={28} />
                                </div>
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '4px 12px', borderRadius: '999px',
                                    background: '#FEF3C7', color: '#B45309',
                                    fontSize: '0.72rem', fontWeight: 800, marginBottom: '8px',
                                    textTransform: 'uppercase', letterSpacing: '0.4px',
                                }}>
                                    <AlertCircle size={13} /> Control de Sesión Única
                                </div>
                                <h2 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                                    Sesión Abierta en Otro Dispositivo
                                </h2>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
                                    Detectamos que el usuario <strong>@{pendingUser?.usuario}</strong> ya tiene una sesión activa en otro dispositivo. Por políticas de ciberseguridad no se permiten 2 usuarios conectados en simultáneo con la misma cuenta.
                                </p>
                            </div>

                            <div style={{
                                background: '#F8FAFC', border: '1.5px solid #E2E8F0',
                                borderRadius: '12px', padding: '12px 14px', marginBottom: '18px',
                            }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>
                                    Dispositivo con sesión abierta actualmente:
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                                    <Monitor size={16} color="#1E4078" />
                                    <span>{concurrentConflict?.otherDeviceLabel || 'Otro dispositivo / navegador'}</span>
                                </div>
                                {concurrentConflict?.otherLastHeartbeat && (
                                    <div style={{ fontSize: '0.73rem', color: '#059669', fontWeight: 600, marginTop: '4px' }}>
                                        ● En línea ahora (última actividad: {new Date(concurrentConflict.otherLastHeartbeat).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                                    </div>
                                )}
                            </div>

                            <div style={{
                                fontSize: '0.76rem', fontWeight: 700, color: '#334155',
                                textAlign: 'center', marginBottom: '12px',
                            }}>
                                Seleccioná obligatoriamente una opción para continuar:
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={handleForceTakeoverFromLogin}
                                    style={{
                                        width: '100%', padding: '13px 16px', borderRadius: '10px', border: 'none',
                                        background: 'linear-gradient(135deg, #1E4078 0%, #1E3A8A 100%)',
                                        color: '#FFFFFF', fontSize: '0.86rem', fontWeight: 800,
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        boxShadow: '0 4px 12px rgba(30, 64, 120, 0.25)',
                                    }}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
                                            Cerrando la otra sesión e ingresando...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck size={17} />
                                            Cerrar la sesión en el otro dispositivo y permanecer en este
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={handleCancelConcurrentLogin}
                                    style={{
                                        width: '100%', padding: '12px 16px', borderRadius: '10px',
                                        border: '1.5px solid #CBD5E1', background: '#FFFFFF',
                                        color: '#475569', fontSize: '0.83rem', fontWeight: 700,
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    }}
                                >
                                    <LogOut size={16} />
                                    Mantener la otra sesión y salir de este dispositivo
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ========================================================= */}
                    {/* PASO 4: FORMULARIO SOLICITUD DE ALTA DE USUARIO           */}
                    {/* ========================================================= */}
                    {step === 'request_account' && (
                        reqSubmittedSuccess ? (
                            <div style={{ textAlign: 'center', padding: '12px 4px' }}>
                                <div style={{
                                    width: '56px', height: '56px', borderRadius: '50%',
                                    background: '#ECFDF5', color: '#059669',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 14px', border: '2px solid #A7F3D0',
                                }}>
                                    <CheckCircle2 size={30} />
                                </div>
                                <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                                    ¡Solicitud Enviada al Administrador!
                                </h2>
                                <p style={{ margin: '0 0 18px', fontSize: '0.84rem', color: '#475569', lineHeight: 1.5 }}>
                                    Tu pedido de alta para el usuario <strong>@{reqForm.usuario_sugerido}</strong> quedó registrado en la pestaña de <strong>Gestión de Usuarios y Roles</strong>. Cuando el administrador apruebe tu alta, recibirás tus credenciales por WhatsApp al <strong>{reqForm.telefono_whatsapp}</strong>.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStep('credentials');
                                        setReqSubmittedSuccess(false);
                                    }}
                                    style={{
                                        width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
                                        background: '#1E4078', color: '#FFFFFF', fontSize: '0.9rem', fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Volver al Inicio de Sesión
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleRequestAccountSubmit}>
                                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '4px 12px', borderRadius: '999px',
                                        background: '#EFF6FF', color: '#1E4078',
                                        fontSize: '0.71rem', fontWeight: 700, marginBottom: '6px',
                                    }}>
                                        <UserPlus size={14} /> SOLICITUD DE ALTA DE USUARIO
                                    </div>
                                    <h2 style={{ margin: '0 0 4px', fontSize: '1.22rem', fontWeight: 800, color: '#1E293B' }}>
                                        Solicitar Cuenta al Administrador
                                    </h2>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                                        Completá tus datos laborales para que Sistemas evalúe y apruebe tu acceso.
                                    </p>
                                </div>

                                {/* Foto de Perfil Opcional */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    background: '#F8FAFC', border: '1px solid #E2E8F0',
                                    borderRadius: '12px', padding: '10px 14px', marginBottom: '14px',
                                }}>
                                    <div
                                        onClick={() => reqFileInputRef.current?.click()}
                                        style={{
                                            width: '50px', height: '50px', borderRadius: '50%',
                                            background: reqForm.avatar_url ? `url(${reqForm.avatar_url}) center/cover` : '#1E4078',
                                            color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', flexShrink: 0, border: '2px solid #CBD5E1', position: 'relative',
                                        }}
                                    >
                                        {!reqForm.avatar_url && <Camera size={20} />}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>
                                            Foto de Perfil Institucional (Opcional)
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                            Podés cargar tu foto ahora o personalizarla luego desde tu perfil.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={uploadingReqAvatar}
                                        onClick={() => reqFileInputRef.current?.click()}
                                        style={{
                                            padding: '6px 11px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                            background: '#FFFFFF', color: '#1E4078', fontSize: '0.74rem',
                                            fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {uploadingReqAvatar ? 'Subiendo...' : (reqForm.avatar_url ? 'Cambiar foto' : 'Subir foto')}
                                    </button>
                                    <input
                                        ref={reqFileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleReqAvatarUpload}
                                        style={{ display: 'none' }}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: '10px', marginBottom: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.69rem', fontWeight: 700, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                                            Nombre y Apellido Completo *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={reqForm.nombre}
                                            onChange={e => handleNameChangeAutoSuggestUser(e.target.value)}
                                            placeholder="Ej: María Laura Gómez"
                                            style={{
                                                width: '100%', padding: '9px 11px', borderRadius: '8px',
                                                border: '1.5px solid #CBD5E1', fontSize: '0.83rem', boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.69rem', fontWeight: 700, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                                            DNI *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            inputMode="numeric"
                                            value={reqForm.dni}
                                            onChange={e => setReqForm(prev => ({ ...prev, dni: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                                            placeholder="Ej: 38123456"
                                            style={{
                                                width: '100%', padding: '9px 11px', borderRadius: '8px',
                                                border: '1.5px solid #CBD5E1', fontSize: '0.83rem', boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.69rem', fontWeight: 700, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                                            Usuario Sugerido *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={reqForm.usuario_sugerido}
                                            onChange={e => setReqForm(prev => ({ ...prev, usuario_sugerido: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))}
                                            placeholder="Ej: mgomez"
                                            style={{
                                                width: '100%', padding: '9px 11px', borderRadius: '8px',
                                                border: '1.5px solid #CBD5E1', fontSize: '0.83rem', fontFamily: 'monospace', boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.69rem', fontWeight: 700, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                                            Email Institucional / Personal *
                                        </label>
                                        <input
                                            type="email"
                                            required
                                            value={reqForm.email}
                                            onChange={e => setReqForm(prev => ({ ...prev, email: e.target.value }))}
                                            placeholder="mgomez@sanatorioargentino.com.ar"
                                            style={{
                                                width: '100%', padding: '9px 11px', borderRadius: '8px',
                                                border: '1.5px solid #CBD5E1', fontSize: '0.83rem', boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Celular con validación estricta 2645438114 */}
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '0.69rem', fontWeight: 700, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Celular WhatsApp (10 dígitos exactos, sin +549 ni 15) *
                                    </label>
                                    <input
                                        type="tel"
                                        required
                                        value={reqForm.telefono_whatsapp}
                                        onChange={e => setReqForm(prev => ({ ...prev, telefono_whatsapp: e.target.value }))}
                                        placeholder="2645438114"
                                        style={{
                                            width: '100%', padding: '9px 11px', borderRadius: '8px',
                                            border: `1.5px solid ${
                                                !reqForm.telefono_whatsapp
                                                    ? '#CBD5E1'
                                                    : validateStrictCellphone(reqForm.telefono_whatsapp).valid
                                                        ? '#10B981'
                                                        : '#EF4444'
                                            }`,
                                            fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.5px', boxSizing: 'border-box',
                                        }}
                                    />
                                    <div style={{
                                        marginTop: '4px', fontSize: '0.7rem',
                                        color: !reqForm.telefono_whatsapp
                                            ? '#64748B'
                                            : validateStrictCellphone(reqForm.telefono_whatsapp).valid
                                                ? '#059669'
                                                : '#DC2626',
                                        fontWeight: 600,
                                    }}>
                                        {!reqForm.telefono_whatsapp
                                            ? 'Formato obligatorio: 2645438114 (No se acepta +5492645438114, ni 155438114, ni espacios).'
                                            : validateStrictCellphone(reqForm.telefono_whatsapp).valid
                                                ? '✓ Formato de 10 dígitos válido'
                                                : validateStrictCellphone(reqForm.telefono_whatsapp).error}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.69rem', fontWeight: 700, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                                            Área / Sector *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={reqForm.area_sector}
                                            onChange={e => setReqForm(prev => ({ ...prev, area_sector: e.target.value }))}
                                            placeholder="Ej: Admisión Quirófano / Guardia"
                                            style={{
                                                width: '100%', padding: '9px 11px', borderRadius: '8px',
                                                border: '1.5px solid #CBD5E1', fontSize: '0.82rem', boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.69rem', fontWeight: 700, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                                            Cargo / Puesto *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={reqForm.cargo}
                                            onChange={e => setReqForm(prev => ({ ...prev, cargo: e.target.value }))}
                                            placeholder="Ej: Recepcionista / Facturista"
                                            style={{
                                                width: '100%', padding: '9px 11px', borderRadius: '8px',
                                                border: '1.5px solid #CBD5E1', fontSize: '0.82rem', boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '0.69rem', fontWeight: 700, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Rol de Acceso Solicitado *
                                    </label>
                                    <select
                                        value={reqForm.rol_solicitado}
                                        onChange={e => setReqForm(prev => ({ ...prev, rol_solicitado: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '9px 11px', borderRadius: '8px',
                                            border: '1.5px solid #CBD5E1', fontSize: '0.83rem', background: '#FFFFFF',
                                            fontWeight: 600, color: '#1E293B', boxSizing: 'border-box',
                                        }}
                                    >
                                        {REQUESTABLE_ROLES.map(r => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '0.69rem', fontWeight: 700, color: '#374151', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Módulos requeridos / Observaciones
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={reqForm.motivo}
                                        onChange={e => setReqForm(prev => ({ ...prev, motivo: e.target.value }))}
                                        placeholder="Indicá brevemente qué tareas o módulos vas a utilizar..."
                                        style={{
                                            width: '100%', padding: '8px 11px', borderRadius: '8px',
                                            border: '1.5px solid #CBD5E1', fontSize: '0.8rem', resize: 'vertical', boxSizing: 'border-box',
                                        }}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    style={{
                                        width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
                                        background: '#1E4078', color: '#FFFFFF', fontSize: '0.9rem', fontWeight: 700,
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        boxShadow: '0 4px 12px rgba(30,64,120,0.25)',
                                    }}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
                                            Enviando solicitud...
                                        </>
                                    ) : (
                                        <>
                                            <UserPlus size={17} /> Enviar Solicitud de Alta
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => { setStep('credentials'); setError(''); setInfoMsg(''); }}
                                    style={{
                                        width: '100%', marginTop: '10px', padding: '8px',
                                        background: 'none', border: 'none', color: '#64748B',
                                        fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                    }}
                                >
                                    <ArrowLeft size={14} /> Volver al inicio de sesión
                                </button>
                            </form>
                        )
                    )}
                </div>

                {/* Acceso público directo a Simón IA */}
                {step === 'credentials' && (
                    <div style={{
                        marginTop: '18px',
                        padding: '14px 18px',
                        background: 'linear-gradient(135deg, rgba(238, 242, 255, 0.9) 0%, rgba(224, 231, 255, 0.6) 100%)',
                        border: '1.5px solid #C7D2FE',
                        borderRadius: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.08)',
                        textAlign: 'center',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3730A3', fontWeight: 700, fontSize: '0.84rem' }}>
                            <Brain size={18} color="#4F46E5" />
                            <span>Simón IA · Asistente Institucional</span>
                            <span style={{ background: '#4F46E5', color: '#fff', fontSize: '0.62rem', padding: '1px 6px', borderRadius: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Libre</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.74rem', color: '#4B5563', lineHeight: 1.35 }}>
                            Consultá directivas médicas, coberturas de obras sociales y aranceles sin iniciar sesión.
                        </p>
                        <Link
                            to="/simon"
                            style={{
                                marginTop: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                width: '100%',
                                padding: '9px 14px',
                                background: '#4F46E5',
                                color: '#FFFFFF',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                borderRadius: '8px',
                                textDecoration: 'none',
                                boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)',
                            }}
                        >
                            <Sparkles size={14} />
                            <span>Chatear con Simón IA ahora</span>
                        </Link>
                    </div>
                )}

                {/* Footer */}
                <p style={{
                    textAlign: 'center',
                    marginTop: '16px',
                    fontSize: '0.72rem',
                    color: '#94A3B8',
                    fontWeight: 500,
                }}>
                    Sistema ADM-QUI · Sanatorio Argentino © 2026
                </p>
            </div>

            <style>{`
                @keyframes shakeX {
                    0%, 100% { transform: translateX(0); }
                    20% { transform: translateX(-8px); }
                    40% { transform: translateX(8px); }
                    60% { transform: translateX(-4px); }
                    80% { transform: translateX(4px); }
                }
                @keyframes loginFadeIn {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
