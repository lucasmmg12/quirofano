/**
 * Sanatorio Argentino — Hook de Confirmación por WhatsApp (Contact Center) para CitaOnline (PRODUCCIÓN)
 * Archivo: assets/whatsapp-reserva-hook.js
 *
 * Variables capturadas y enviadas a Supabase Edge Function (send-whatsapp):
 * - phone: Teléfono local normalizado a 10 dígitos sin 0 ni 15 (ej: 2645438114)
 * - whatsappPhone: Teléfono internacional WhatsApp 13 dígitos (ej: 5492645438114)
 * - nombre, apellido, segundoApellido, dni, email, observaciones
 * - fechaHora, fecha, hora
 * - tipoVisita (Estudio / Tipo de Consulta seleccionada)
 * - especialidad (Especialidad médica)
 * - profesional (Profesional / Agenda seleccionada)
 * - sede (Sede y dirección seleccionada en CitaOnline)
 * - obraSocial (Cobertura / Financiador seleccionado)
 * - visitId (ID de turno/visita en SALUS) y patientId (ID de paciente en SALUS)
 */
(function () {
    'use strict';

    // Proteger las variables CSS del diseño institucional Sanatorio Argentino
    // para que la respuesta de /api/citaonline/GetConfiguration de SALUS no las pise.
    try {
        var rootStyle = document.documentElement.style;
        var origSetProperty = rootStyle.setProperty;
        if (origSetProperty) {
            rootStyle.setProperty = function (prop, value, priority) {
                if (typeof prop === 'string' && prop.indexOf('--') === 0) {
                    return;
                }
                return origSetProperty.call(this, prop, value, priority);
            };
        }
    } catch (e) {}

    var SUPABASE_FUNCTION_URL = 'https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/send-whatsapp';
    var sentSignatures = {};
    var lastCapturedForm = null;
    var cachedSessionPatient = {};

    /**
     * Normaliza el número ingresado por el paciente al formato local de 10 dígitos sin 0 ni 15
     * Ejemplo:
     *   "02645438114"       -> "2645438114"
     *   "0264 155438114"    -> "2645438114"
     *   "+54 9 264 543-8114"-> "2645438114"
     *   "155438114"         -> "2645438114"
     */
    function normalizeLocalPhoneDigits(raw) {
        var clean = String(raw || '').replace(/\D/g, '');
        if (!clean) return '';

        if (clean.indexOf('549') === 0 && clean.length >= 13) {
            clean = clean.slice(3);
        } else if (clean.indexOf('54') === 0 && clean.length >= 12) {
            clean = clean.slice(2);
        }

        clean = clean.replace(/^0+/, '');

        if (clean.indexOf('15') === 0 && clean.length === 9) {
            clean = '264' + clean.slice(2);
        }

        if (clean.length === 12) {
            var idx15 = clean.indexOf('15');
            if (idx15 >= 2 && idx15 <= 4) {
                clean = clean.slice(0, idx15) + clean.slice(idx15 + 2);
            }
        }

        if (clean.length > 10) {
            clean = clean.slice(0, 10);
        }

        return clean;
    }

    /**
     * Convierte cualquier teléfono argentino al formato internacional WhatsApp 549XXXXXXXXXX (13 dígitos)
     */
    function formatPhoneForWhatsApp(raw) {
        var local10 = normalizeLocalPhoneDigits(raw);
        if (!local10) return '';
        if (local10.length === 10) {
            return '549' + local10;
        }
        return local10;
    }

    /**
     * Separa un string de fecha y hora en { fecha, hora, fechaHora }
     */
    function splitFechaHora(rawFechaHora, rawDateIso) {
        var str = String(rawFechaHora || rawDateIso || '').replace(/\s+/g, ' ').trim();
        var fecha = '';
        var hora = '';

        var timeMatch = str.match(/(\d{1,2}:\d{2})/);
        if (timeMatch) {
            hora = timeMatch[1] + ' hs';
        }

        var dmyMatch = str.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
        var ymdMatch = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (dmyMatch) {
            fecha = dmyMatch[1].replace(/\-/g, '/');
        } else if (ymdMatch) {
            fecha = ymdMatch[3].padStart(2, '0') + '/' + ymdMatch[2].padStart(2, '0') + '/' + ymdMatch[1];
        } else if (str) {
            fecha = str.replace(/(\s*-\s*)?\d{1,2}:\d{2}(\s*hs)?/i, '').trim();
        }

        return {
            fechaHora: str || [fecha, hora].filter(Boolean).join(' '),
            fecha: fecha || str,
            hora: hora || ''
        };
    }

    /**
     * Inyecta la ayuda visual en el campo #phone de CitaOnline y formatea automáticamente el número
     * eliminando el 0 inicial si el paciente escribe ej. 02645438114.
     */
    function enhancePhoneInput() {
        try {
            var phoneInput = document.getElementById('phone');
            if (!phoneInput || phoneInput.getAttribute('data-sa-wa-enhanced') === '1') return;

            phoneInput.setAttribute('data-sa-wa-enhanced', '1');
            phoneInput.setAttribute('placeholder', 'Ej: 2645438114 (sin 0 ni 15)');
            phoneInput.setAttribute('inputmode', 'numeric');
            phoneInput.setAttribute('autocomplete', 'tel-national');

            var parent = phoneInput.parentElement;
            if (parent && !document.getElementById('__sa_phone_format_hint')) {
                var hint = document.createElement('small');
                hint.id = '__sa_phone_format_hint';
                hint.style.cssText = 'display:block;margin-top:5px;font-size:12px;font-weight:600;color:#004695;line-height:1.35;';
                hint.innerHTML = '📱 Ingresá tu WhatsApp <strong>sin 0 y sin 15</strong> (ejemplo: <strong>2645438114</strong>) para recibir la confirmación del turno.';
                parent.appendChild(hint);
            }

            if (phoneInput.value) {
                var initialClean = normalizeLocalPhoneDigits(phoneInput.value);
                if (initialClean && initialClean !== phoneInput.value) {
                    phoneInput.value = initialClean;
                    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }

            phoneInput.addEventListener('input', function (ev) {
                if (ev && ev.__saInternal) return;
                var rawVal = phoneInput.value || '';
                var digitsOnly = rawVal.replace(/\D/g, '');
                if (/^0+/.test(digitsOnly)) {
                    digitsOnly = digitsOnly.replace(/^0+/, '');
                }
                if (digitsOnly !== rawVal) {
                    phoneInput.value = digitsOnly;
                    var evt = new Event('input', { bubbles: true });
                    evt.__saInternal = true;
                    phoneInput.dispatchEvent(evt);
                }
            });

            var onBlurNormalize = function () {
                var normalized = normalizeLocalPhoneDigits(phoneInput.value);
                if (normalized && normalized !== phoneInput.value) {
                    phoneInput.value = normalized;
                    var evt = new Event('input', { bubbles: true });
                    evt.__saInternal = true;
                    phoneInput.dispatchEvent(evt);
                }
            };
            phoneInput.addEventListener('blur', onBlurNormalize);
            phoneInput.addEventListener('change', onBlurNormalize);
        } catch (e) {}
    }

    try {
        var domObserver = new MutationObserver(function () {
            enhancePhoneInput();
        });
        if (document.documentElement) {
            domObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', enhancePhoneInput);
        } else {
            enhancePhoneInput();
        }
    } catch (e) {}

    function getInputValue(id) {
        var el = document.getElementById(id);
        return el && typeof el.value === 'string' ? el.value.trim() : '';
    }

    /**
     * Extrae todas las etiquetas visibles en la cabecera de confirmación de Angular:
     * - Fecha y hora (.k-i-calendar)
     * - Profesional (.k-i-user)
     * - Tipo de visita y Especialidad (.k-i-information[0]) -> "CONSULTA CLINICA ( CLINICO )"
     * - Cobertura / Obra Social (.k-i-information[1])
     * - Sede y dirección (.k-i-marker-pin)
     */
    function getHeaderInfo() {
        var fechaHora = '';
        var profesional = '';
        var tipoVisita = '';
        var especialidad = '';
        var obraSocial = '';
        var sede = '';

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
                var rawInfo0 = (infoIcons[0].parentElement.textContent || '').trim();
                var parenMatch = rawInfo0.match(/^(.*?)\(\s*(.*?)\s*\)\s*$/);
                if (parenMatch) {
                    tipoVisita = parenMatch[1].trim();
                    especialidad = parenMatch[2].trim();
                } else {
                    especialidad = rawInfo0;
                }
            }
            if (infoIcons && infoIcons.length > 1 && infoIcons[1].parentElement) {
                obraSocial = (infoIcons[1].parentElement.textContent || '').trim();
            }
            var pinIcon = document.querySelector('app-confirmation .k-i-marker-pin');
            if (pinIcon && pinIcon.parentElement) {
                sede = (pinIcon.parentElement.textContent || '').replace(/\s+/g, ' ').trim();
            }
        } catch (e) {}

        return {
            fechaHora: fechaHora,
            profesional: profesional,
            tipoVisita: tipoVisita,
            especialidad: especialidad,
            obraSocial: obraSocial,
            sede: sede
        };
    }

    function captureCurrentFormState() {
        enhancePhoneInput();
        var header = getHeaderInfo();
        var rawPhone = getInputValue('phone') || cachedSessionPatient.phone || '';
        var cleanPhone = normalizeLocalPhoneDigits(rawPhone) || rawPhone;
        var name = getInputValue('name') || cachedSessionPatient.nombre || '';
        var surname = getInputValue('surname') || cachedSessionPatient.apellido || '';
        var lastname = getInputValue('lastname') || cachedSessionPatient.segundoApellido || '';
        var nif = getInputValue('nif') || cachedSessionPatient.dni || '';
        var email = getInputValue('email') || cachedSessionPatient.email || '';
        var reason = getInputValue('reason');

        if (cleanPhone || name || nif || header.profesional) {
            lastCapturedForm = {
                phone: cleanPhone,
                nombre: name,
                apellido: surname,
                segundoApellido: lastname,
                dni: nif,
                email: email,
                observaciones: reason,
                fechaHora: header.fechaHora,
                profesional: header.profesional,
                tipoVisita: header.tipoVisita,
                especialidad: header.especialidad,
                obraSocial: header.obraSocial,
                sede: header.sede
            };
        }
        return lastCapturedForm;
    }

    function dispatchWhatsAppConfirmation(payload) {
        try {
            if (!payload) return;
            var rawInputPhone = String(payload.phone || payload.PatientPhone || cachedSessionPatient.phone || '');
            var cleanLocalPhone = normalizeLocalPhoneDigits(rawInputPhone);
            var formattedWaPhone = formatPhoneForWhatsApp(rawInputPhone);
            var dni = String(payload.dni || payload.NIF || cachedSessionPatient.dni || '').replace(/\D/g, '');
            var patientId = payload.patientId || payload.PatientId || cachedSessionPatient.patientId || null;

            if (!cleanLocalPhone && !dni && !patientId) return;

            var fhParts = splitFechaHora(payload.fechaHora || payload.Date || payload.Hour || '', payload.fechaRaw || payload.Date || '');
            var signatureKey = (formattedWaPhone || dni || patientId) + '|' + (fhParts.fechaHora || '') + '|' + (payload.profesional || '');
            if (sentSignatures[signatureKey]) {
                return;
            }
            sentSignatures[signatureKey] = true;

            var bodyData = {
                action: 'notify_cita_online_reservation',
                lineId: 'contact_center',
                templateName: 'confirmacion_turno_online_automatizacion',
                languageCode: 'es_AR',
                phone: cleanLocalPhone || rawInputPhone,
                whatsappPhone: formattedWaPhone,
                nombre: payload.nombre || payload.PatientName || cachedSessionPatient.nombre || '',
                apellido: payload.apellido || payload.PatientSurname || cachedSessionPatient.apellido || '',
                segundoApellido: payload.segundoApellido || payload.PatientSecondSurname || cachedSessionPatient.segundoApellido || '',
                dni: dni,
                email: payload.email || payload.PatientEMail || cachedSessionPatient.email || '',
                observaciones: payload.observaciones || payload.Reason || '',
                fechaHora: fhParts.fechaHora,
                fecha: payload.fecha || fhParts.fecha || '',
                hora: payload.hora || fhParts.hora || '',
                tipoVisita: payload.tipoVisita || '',
                especialidad: payload.especialidad || '',
                profesional: payload.profesional || '',
                sede: payload.sede || '',
                obraSocial: payload.obraSocial || '',
                visitId: payload.visitId || payload.VisitId || null,
                patientId: patientId
            };

            fetch(SUPABASE_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bodyData),
                keepalive: true
            }).catch(function (err) {
                console.warn('[CitaOnline WhatsApp Hook] No se pudo enviar la notificación:', err);
            });
        } catch (err) {
            console.warn('[CitaOnline WhatsApp Hook] Error interno:', err);
        }
    }

    window.__sendCitaOnlineWhatsApp = dispatchWhatsAppConfirmation;

    // 1. Capturar datos y normalizar teléfono cuando el usuario hace clic en el botón "Reservar"
    document.addEventListener('click', function (ev) {
        try {
            var target = ev.target;
            if (!target) return;
            var btn = target.closest ? target.closest('button.confirmation-button') : target;
            if (btn && btn.classList && btn.classList.contains('confirmation-button')) {
                var phoneInput = document.getElementById('phone');
                if (phoneInput && phoneInput.value) {
                    var norm = normalizeLocalPhoneDigits(phoneInput.value);
                    if (norm && norm !== phoneInput.value) {
                        phoneInput.value = norm;
                        var evt = new Event('input', { bubbles: true });
                        evt.__saInternal = true;
                        phoneInput.dispatchEvent(evt);
                    }
                }
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

    // 2. Interceptar XMLHttpRequest hacia /api/citaonline/
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        this.__citaUrl = typeof url === 'string' ? url : '';
        return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        var xhr = this;
        var urlStr = xhr.__citaUrl || '';

        // Capturar información de sesión si el paciente inicia sesión en CitaOnline
        if (urlStr.indexOf('/api/citaonline/GetUserInformation') !== -1 || urlStr.indexOf('/api/citaonline/Login') !== -1) {
            try {
                if (typeof body === 'string') {
                    var reqLogin = JSON.parse(body);
                    if (reqLogin && reqLogin.User && reqLogin.User.Name) {
                        var possibleDni = String(reqLogin.User.Name).replace(/\D/g, '');
                        if (possibleDni.length >= 7 && possibleDni.length <= 9) {
                            cachedSessionPatient.dni = possibleDni;
                        }
                    }
                }
            } catch (e) {}

            xhr.addEventListener('load', function () {
                try {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        var uResp = JSON.parse(xhr.responseText || '{}');
                        if (uResp) {
                            if (uResp.Id) cachedSessionPatient.patientId = uResp.Id;
                            if (uResp.Nombre) cachedSessionPatient.nombre = uResp.Nombre;
                            if (uResp.EMail) cachedSessionPatient.email = uResp.EMail;
                            if (uResp.NIF) cachedSessionPatient.dni = String(uResp.NIF).replace(/\D/g, '') || cachedSessionPatient.dni;
                            if (uResp.Telefono || uResp.Movil || uResp.Phone) {
                                cachedSessionPatient.phone = normalizeLocalPhoneDigits(uResp.Telefono || uResp.Movil || uResp.Phone);
                            }
                        }
                    }
                } catch (e) {}
            });
        }

        // Interceptar confirmación de reserva /api/citaonline/AddReservation
        if (urlStr.indexOf('/api/citaonline/AddReservation') !== -1) {
            var formSnap = captureCurrentFormState() || {};
            var parsedReq = {};
            try {
                if (typeof body === 'string') {
                    parsedReq = JSON.parse(body);
                    if (parsedReq && parsedReq.PatientPhone) {
                        var cleanedForSalus = normalizeLocalPhoneDigits(parsedReq.PatientPhone);
                        if (cleanedForSalus) {
                            parsedReq.PatientPhone = cleanedForSalus;
                            body = JSON.stringify(parsedReq);
                        }
                    }
                }
            } catch (e) {}

            var statusObj = {};
            try {
                if (parsedReq && typeof parsedReq.Status === 'string') {
                    statusObj = JSON.parse(parsedReq.Status);
                }
            } catch (e) {}

            xhr.addEventListener('load', function () {
                try {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        var resp = {};
                        try {
                            resp = JSON.parse(xhr.responseText || '{}');
                        } catch (e) {}

                        var isSuccess = resp && resp.VisitId != null && !resp.ErrorLimitPlannedVisits && !resp.ErrorLimitSpecialityVisits;
                        if (isSuccess) {
                            var centerObj = statusObj.selectedcenter || {};
                            var sedeStr = [centerObj.name, centerObj.direction].filter(Boolean).join(' - ') || formSnap.sede || '';
                            var visitTypeObj = statusObj.selectedvisittype || {};
                            var tipoVisitaStr = visitTypeObj.name || formSnap.tipoVisita || '';
                            var specObj = statusObj.selectedSpeciality || {};
                            var espStr = specObj.name || formSnap.especialidad || '';
                            var vgObj = statusObj.selectedvirtualgroup || {};
                            var profStr = vgObj.name || formSnap.profesional || '';

                            dispatchWhatsAppConfirmation({
                                phone: parsedReq.PatientPhone || formSnap.phone || cachedSessionPatient.phone || '',
                                nombre: parsedReq.PatientName || formSnap.nombre || cachedSessionPatient.nombre || '',
                                apellido: parsedReq.PatientSurname || formSnap.apellido || '',
                                segundoApellido: parsedReq.PatientSecondSurname || formSnap.segundoApellido || '',
                                dni: parsedReq.NIF || formSnap.dni || cachedSessionPatient.dni || '',
                                email: parsedReq.PatientEMail || formSnap.email || cachedSessionPatient.email || '',
                                observaciones: parsedReq.Reason || formSnap.observaciones || '',
                                fechaHora: formSnap.fechaHora || parsedReq.Date || parsedReq.Hour || statusObj.selecteddate || '',
                                fechaRaw: parsedReq.Date || statusObj.selecteddate || '',
                                tipoVisita: tipoVisitaStr,
                                especialidad: espStr,
                                profesional: profStr,
                                sede: sedeStr,
                                obraSocial: statusObj.insurancepayer || formSnap.obraSocial || '',
                                visitId: resp.VisitId,
                                patientId: parsedReq.PatientId || cachedSessionPatient.patientId || null
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
