/**
 * Sanatorio Argentino — Hook de Confirmación por WhatsApp (Contact Center) para CitaOnline (PRODUCCIÓN)
 * Archivo: assets/whatsapp-reserva-hook.js
 *
 * Funcionamiento:
 * 1. Guía al paciente para ingresar su número con formato 2645438114 (sin 0 ni 15) y limpia
 *    automáticamente cualquier 0 inicial (ej. 02645438114 -> 2645438114) o 15 intermedio.
 * 2. Captura los datos del formulario de reserva (#phone, #name, #surname, #lastname, #nif, #email)
 *    y los datos del turno seleccionado (fecha/hora, profesional, especialidad) cuando el paciente
 *    presiona el botón "Reservar".
 * 3. Intercepta la respuesta exitosa de /api/citaonline/AddReservation para disparar la Plantilla Oficial
 *    de Meta WhatsApp desde la línea del Contact Center (5492645825637) a través de Supabase Edge Functions.
 * 4. No bloquea ni altera el flujo nativo de SALUS CitaOnline ante cualquier falla de red externa.
 */
(function () {
    'use strict';

    // Proteger las variables CSS del diseño institucional Sanatorio Argentino 2026
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

    /**
     * Normaliza el número ingresado por el paciente al formato local de 10 dígitos sin 0 ni 15
     * Ejemplo:
     *   "02645438114"    -> "2645438114"
     *   "0264 155438114" -> "2645438114"
     *   "+54 9 264 543-8114" -> "2645438114"
     *   "155438114"      -> "2645438114"
     */
    function normalizeLocalPhoneDigits(raw) {
        var clean = String(raw || '').replace(/\D/g, '');
        if (!clean) return '';

        // Si puso prefijo internacional 549 o 54 al principio
        if (clean.indexOf('549') === 0 && clean.length >= 13) {
            clean = clean.slice(3);
        } else if (clean.indexOf('54') === 0 && clean.length >= 12) {
            clean = clean.slice(2);
        }

        // Eliminar siempre el primer cero (o ceros iniciales, ej: 02645438114 -> 2645438114)
        clean = clean.replace(/^0+/, '');

        // Si ingresó solo "15xxxxxxx" (9 dígitos, sin característica de San Juan)
        if (clean.indexOf('15') === 0 && clean.length === 9) {
            clean = '264' + clean.slice(2);
        }

        // Si ingresó característica + 15 + número (ej: 264155438114 -> 12 dígitos)
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

            // Agregar leyenda clara debajo del input #phone
            var parent = phoneInput.parentElement;
            if (parent && !document.getElementById('__sa_phone_format_hint')) {
                var hint = document.createElement('small');
                hint.id = '__sa_phone_format_hint';
                hint.style.cssText = 'display:block;margin-top:5px;font-size:12px;font-weight:600;color:#004695;line-height:1.35;';
                hint.innerHTML = '📱 Ingresá tu WhatsApp <strong>sin 0 y sin 15</strong> (ejemplo: <strong>2645438114</strong>) para recibir la confirmación del turno.';
                parent.appendChild(hint);
            }

            // Si ya tenía un valor precargado (ej. de paciente logueado con 0264...), limpiarlo de inmediato
            if (phoneInput.value) {
                var initialClean = normalizeLocalPhoneDigits(phoneInput.value);
                if (initialClean && initialClean !== phoneInput.value) {
                    phoneInput.value = initialClean;
                    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }

            // En tiempo real: si empieza con 0 o tiene caracteres no numéricos, limpiarlo sin mover el cursor bruscamente
            phoneInput.addEventListener('input', function (ev) {
                if (ev && ev.__saInternal) return;
                var rawVal = phoneInput.value || '';
                var digitsOnly = rawVal.replace(/\D/g, '');
                // Eliminar ceros al inicio inmediatamente (ej: 02645438114 -> 2645438114)
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

            // Al salir del campo (blur / change): aplicar normalización completa a 10 dígitos (ej: 2645438114)
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

    // Observar el DOM de Angular para detectar cuando se monta el paso de confirmación (<app-confirmation>)
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
        enhancePhoneInput();
        var header = getHeaderInfo();
        var rawPhone = getInputValue('phone');
        var cleanPhone = normalizeLocalPhoneDigits(rawPhone) || rawPhone;
        var name = getInputValue('name');
        var surname = getInputValue('surname');
        var lastname = getInputValue('lastname');
        var nif = getInputValue('nif');
        var email = getInputValue('email');
        var reason = getInputValue('reason');

        if (cleanPhone || name || nif) {
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
                especialidad: header.especialidad
            };
        }
        return lastCapturedForm;
    }

    function dispatchWhatsAppConfirmation(payload) {
        try {
            if (!payload) return;
            var rawInputPhone = String(payload.phone || payload.PatientPhone || '');
            var cleanLocalPhone = normalizeLocalPhoneDigits(rawInputPhone);
            var formattedWaPhone = formatPhoneForWhatsApp(rawInputPhone);
            var dni = String(payload.dni || payload.NIF || '').replace(/\D/g, '');
            if (!cleanLocalPhone && !dni) return;

            var signatureKey = (formattedWaPhone || dni) + '|' + (payload.fechaHora || payload.Date || '') + '|' + (payload.profesional || '');
            if (sentSignatures[signatureKey]) {
                return; // Evitar duplicados para la misma reserva
            }
            sentSignatures[signatureKey] = true;

            var bodyData = {
                action: 'notify_cita_online_reservation',
                lineId: 'contact_center',
                phone: cleanLocalPhone || rawInputPhone,
                whatsappPhone: formattedWaPhone,
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

    // Exponer función global por si se invoca también desde main.js
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
                if (typeof body === 'string') {
                    parsedReq = JSON.parse(body);
                    // Asegurar que también a SALUS se envíe el teléfono limpio sin 0 inicial (ej: 2645438114)
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
