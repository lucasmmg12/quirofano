/**
 * Sanatorio Argentino — Hook de Confirmación por WhatsApp (Contact Center) para CitaOnline
 * Archivo: assets/whatsapp-reserva-hook.js
 *
 * Funcionamiento:
 * 1. Captura los datos del formulario de reserva (#phone, #name, #surname, #lastname, #nif, #email)
 *    y los datos del turno seleccionado (fecha/hora, profesional, especialidad) cuando el paciente
 *    presiona el botón "Reservar".
 * 2. Intercepta la respuesta de /api/citaonline/AddReservation (y cuenta con modo de prueba local
 *    cuando corre en localhost) para disparar la notificación por WhatsApp desde la línea del Contact Center
 *    (5492645825637) a través de la Edge Function segura de Supabase.
 * 3. No bloquea ni altera el flujo nativo de SALUS CitaOnline ante cualquier falla de red externa.
 */
(function () {
    'use strict';

    // Proteger las variables CSS del diseño institucional Sanatorio Argentino 2026
    // para que la respuesta de /api/citaonline/GetConfiguration de SALUS no las pise
    // con los colores antiguos (rojo #ff0000, celeste viejo, etc.).
    try {
        var rootStyle = document.documentElement.style;
        var origSetProperty = rootStyle.setProperty;
        if (origSetProperty) {
            rootStyle.setProperty = function (prop, value, priority) {
                if (typeof prop === 'string' && prop.indexOf('--') === 0) {
                    return; // Mantener la paleta oficial definida en assets/forms.css
                }
                return origSetProperty.call(this, prop, value, priority);
            };
        }
    } catch (e) {}

    var SUPABASE_FUNCTION_URL = 'https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/send-whatsapp';
    var IS_LOCAL_TEST = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    var simulateSalusInLocal = IS_LOCAL_TEST; // En localhost por defecto simula el OK de SALUS para no ensuciar agendas reales
    var sentSignatures = {};
    var lastCapturedForm = null;

    function showToast(msg, bg) {
        if (!IS_LOCAL_TEST) return;
        try {
            var el = document.getElementById('__sa_wa_toast');
            if (!el) {
                el = document.createElement('div');
                el.id = '__sa_wa_toast';
                el.style.cssText = 'position:fixed;top:16px;right:16px;z-index:999999;padding:12px 18px;border-radius:10px;color:#fff;font-family:Poppins,sans-serif;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.22);transition:all 0.25s ease;';
                document.body.appendChild(el);
            }
            el.style.background = bg || '#0284c7';
            el.style.display = 'block';
            el.textContent = msg;
        } catch (e) {}
    }

    function mountLocalTestBanner() {
        if (!IS_LOCAL_TEST) return;
        try {
            if (document.getElementById('__sa_local_test_bar')) return;
            var bar = document.createElement('div');
            bar.id = '__sa_local_test_bar';
            bar.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:999998;background:#0f172a;color:#f8fafc;padding:10px 14px;border-radius:10px;font-family:Poppins,sans-serif;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,0.28);border:1px solid #334155;max-width:360px;';
            bar.innerHTML =
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-weight:700;color:#38bdf8;">' +
                '<span>🧪 Modo Prueba Local — WhatsApp CitaOnline</span>' +
                '</div>' +
                '<div style="font-size:11px;color:#cbd5e1;margin-bottom:8px;">' +
                'Envía mensaje directo por ventana abierta 24h (sin consumir plantilla Meta).' +
                '</div>' +
                '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-size:11px;color:#e2e8f0;">' +
                '<input type="checkbox" id="__sa_sim_salus_chk" checked style="cursor:pointer;" />' +
                '<span>Simular reserva SALUS (no agendar turno real en SALUS)</span>' +
                '</label>';
            document.body.appendChild(bar);
            var chk = document.getElementById('__sa_sim_salus_chk');
            if (chk) {
                chk.addEventListener('change', function () {
                    simulateSalusInLocal = Boolean(chk.checked);
                });
            }
        } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountLocalTestBanner);
    } else {
        mountLocalTestBanner();
    }

    function getInputValue(id) {
        var el = document.getElementById(id);
        return el && typeof el.value === 'string' ? el.value.trim() : '';
    }

    function getHeaderInfo() {
        var fechaHora = '';
        var profesional = '';
        var especialidad = '';

        try {
            var calIcon = document.querySelector('.icons-confirmation .k-i-calendar');
            if (calIcon && calIcon.parentElement) {
                fechaHora = (calIcon.parentElement.textContent || '').trim();
            }
            var userIcon = document.querySelector('.icons-confirmation .k-i-user');
            if (userIcon && userIcon.parentElement) {
                profesional = (userIcon.parentElement.textContent || '').trim();
            }
            var infoIcons = document.querySelectorAll('.icons-confirmation .k-i-information');
            if (infoIcons && infoIcons.length > 0 && infoIcons[0].parentElement) {
                especialidad = (infoIcons[0].parentElement.textContent || '').trim();
            }
        } catch (e) {}

        return {
            fechaHora: fechaHora,
            profesional: profesional,
            especialidad: especialidad
        };
    }

    function captureCurrentFormState() {
        var header = getHeaderInfo();
        var phone = getInputValue('phone');
        var name = getInputValue('name');
        var surname = getInputValue('surname');
        var lastname = getInputValue('lastname');
        var nif = getInputValue('nif');
        var email = getInputValue('email');
        var reason = getInputValue('reason');

        if (phone || name || nif) {
            lastCapturedForm = {
                phone: phone,
                nombre: name,
                apellido: surname,
                segundoApellido: lastname,
                dni: nif,
                email: email,
                observaciones: reason,
                fechaHora: header.fechaHora,
                profesional: header.profesional,
                especialidad: header.especialidad
            };
        }
        return lastCapturedForm;
    }

    function dispatchWhatsAppConfirmation(payload) {
        try {
            if (!payload) return;
            var rawPhone = String(payload.phone || payload.PatientPhone || '').replace(/\D/g, '');
            var dni = String(payload.dni || payload.NIF || '').replace(/\D/g, '');
            if (!rawPhone && !dni) return;

            var signatureKey = (rawPhone || dni) + '|' + (payload.fechaHora || payload.Date || '') + '|' + (payload.profesional || '');
            if (sentSignatures[signatureKey]) {
                return; // Evitar duplicados para la misma reserva
            }
            sentSignatures[signatureKey] = true;

            var bodyData = {
                action: 'notify_cita_online_reservation',
                lineId: 'contact_center',
                useFreeText: IS_LOCAL_TEST || rawPhone.indexOf('2645438114') !== -1,
                phone: payload.phone || payload.PatientPhone || '',
                nombre: payload.nombre || payload.PatientName || '',
                apellido: payload.apellido || payload.PatientSurname || '',
                segundoApellido: payload.segundoApellido || payload.PatientSecondSurname || '',
                dni: payload.dni || payload.NIF || '',
                email: payload.email || payload.PatientEMail || '',
                fechaHora: payload.fechaHora || payload.Date || payload.Hour || '',
                profesional: payload.profesional || '',
                especialidad: payload.especialidad || '',
                obraSocial: payload.obraSocial || '',
                visitId: payload.visitId || payload.VisitId || null
            };

            showToast('⏳ Enviando confirmación WhatsApp a ' + (bodyData.phone || dni) + '...', '#0284c7');

            fetch(SUPABASE_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bodyData),
                keepalive: true
            })
                .then(function (r) { return r.json(); })
                .then(function (res) {
                    if (res && res.success) {
                        showToast('✅ WhatsApp enviado a ' + (res.phone || bodyData.phone) + ' (' + (res.mode || 'template') + ')', '#16a34a');
                    } else {
                        showToast('⚠️ Error enviando WhatsApp: ' + JSON.stringify(res), '#dc2626');
                    }
                })
                .catch(function (err) {
                    console.warn('[CitaOnline WhatsApp Hook] No se pudo enviar la notificación:', err);
                    showToast('❌ Error de red enviando WhatsApp', '#dc2626');
                });
        } catch (err) {
            console.warn('[CitaOnline WhatsApp Hook] Error interno:', err);
        }
    }

    // Exponer función global por si se invoca también desde main.js
    window.__sendCitaOnlineWhatsApp = dispatchWhatsAppConfirmation;

    // 1. Capturar datos cuando el usuario hace clic en el botón "Reservar"
    document.addEventListener('click', function (ev) {
        try {
            var target = ev.target;
            if (!target) return;
            var btn = target.closest ? target.closest('button.confirmation-button') : target;
            if (btn && btn.classList && btn.classList.contains('confirmation-button')) {
                var snap = captureCurrentFormState();
                setTimeout(function () {
                    var successAlert = document.querySelector('app-confirmation .alert-success');
                    if (successAlert && snap) {
                        dispatchWhatsAppConfirmation(snap);
                    }
                }, 2500);
            }
        } catch (e) {}
    }, true);

    // 2. Interceptar XMLHttpRequest hacia /api/citaonline/AddReservation
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        this.__citaUrl = typeof url === 'string' ? url : '';
        return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        var xhr = this;
        if (xhr.__citaUrl && xhr.__citaUrl.indexOf('/api/citaonline/AddReservation') !== -1) {
            var formSnap = captureCurrentFormState() || {};
            var parsedReq = {};
            try {
                if (typeof body === 'string') parsedReq = JSON.parse(body);
            } catch (e) {}

            var statusObj = {};
            try {
                if (parsedReq && typeof parsedReq.Status === 'string') {
                    statusObj = JSON.parse(parsedReq.Status);
                }
            } catch (e) {}

            // Si estamos en localhost y el modo "Simular reserva SALUS" está activo:
            // no golpeamos la base de datos de SALUS para no ocupar un turno real del médico,
            // simulamos la respuesta exitosa de AddReservation y disparamos el WhatsApp real.
            if (IS_LOCAL_TEST && simulateSalusInLocal) {
                setTimeout(function () {
                    var fakeResp = JSON.stringify({
                        VisitId: 999999,
                        Charge: false,
                        UploadFoto: false,
                        ErrorLimitPlannedVisits: false,
                        ErrorLimitSpecialityVisits: false
                    });
                    try {
                        Object.defineProperty(xhr, 'status', { value: 200, configurable: true });
                        Object.defineProperty(xhr, 'statusText', { value: 'OK', configurable: true });
                        Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
                        Object.defineProperty(xhr, 'responseText', { value: fakeResp, configurable: true });
                        Object.defineProperty(xhr, 'response', { value: fakeResp, configurable: true });
                    } catch (e) {}

                    dispatchWhatsAppConfirmation({
                        phone: parsedReq.PatientPhone || formSnap.phone || '',
                        nombre: parsedReq.PatientName || formSnap.nombre || '',
                        apellido: parsedReq.PatientSurname || formSnap.apellido || '',
                        segundoApellido: parsedReq.PatientSecondSurname || formSnap.segundoApellido || '',
                        dni: parsedReq.NIF || formSnap.dni || '',
                        email: parsedReq.PatientEMail || formSnap.email || '',
                        fechaHora: formSnap.fechaHora || parsedReq.Date || parsedReq.Hour || '',
                        profesional: (statusObj.selectedvirtualgroup && statusObj.selectedvirtualgroup.name) || formSnap.profesional || '',
                        especialidad: (statusObj.selectedSpeciality && statusObj.selectedSpeciality.name) || formSnap.especialidad || '',
                        obraSocial: statusObj.insurancepayer || '',
                        visitId: 999999
                    });

                    xhr.dispatchEvent(new Event('readystatechange'));
                    xhr.dispatchEvent(new ProgressEvent('load'));
                    xhr.dispatchEvent(new ProgressEvent('loadend'));
                }, 400);
                return;
            }

            xhr.addEventListener('load', function () {
                try {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        var resp = {};
                        try {
                            resp = JSON.parse(xhr.responseText || '{}');
                        } catch (e) {}

                        var isSuccess = resp && resp.VisitId != null && !resp.ErrorLimitPlannedVisits && !resp.ErrorLimitSpecialityVisits;
                        if (isSuccess) {
                            dispatchWhatsAppConfirmation({
                                phone: parsedReq.PatientPhone || formSnap.phone || '',
                                nombre: parsedReq.PatientName || formSnap.nombre || '',
                                apellido: parsedReq.PatientSurname || formSnap.apellido || '',
                                segundoApellido: parsedReq.PatientSecondSurname || formSnap.segundoApellido || '',
                                dni: parsedReq.NIF || formSnap.dni || '',
                                email: parsedReq.PatientEMail || formSnap.email || '',
                                fechaHora: formSnap.fechaHora || parsedReq.Date || parsedReq.Hour || '',
                                profesional: (statusObj.selectedvirtualgroup && statusObj.selectedvirtualgroup.name) || formSnap.profesional || '',
                                especialidad: (statusObj.selectedSpeciality && statusObj.selectedSpeciality.name) || formSnap.especialidad || '',
                                obraSocial: statusObj.insurancepayer || '',
                                visitId: resp.VisitId
                            });
                        }
                    }
                } catch (err) {
                    console.warn('[CitaOnline WhatsApp Hook] Error procesando respuesta AddReservation:', err);
                }
            });
        }
        return origSend.apply(this, arguments);
    };
})();
