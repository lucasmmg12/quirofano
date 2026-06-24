import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';

// ─── EXPORTACIÓN A EXCEL ───
export function exportMetricasToExcel(metricas, config, rangoNombre) {
    if (!metricas || !metricas.turnosRaw) return;

    // Mapear datos crudos a formato legible
    const data = metricas.turnosRaw.map(t => {
        const tramiteLabel = config.find(c => c.tipo_tramite === t.tipo_tramite)?.label || t.tipo_tramite;
        const espera = t.llamado_at ? Math.round((new Date(t.llamado_at) - new Date(t.created_at)) / 60000) : '';
        const atencion = t.hora_inicio && t.hora_fin ? Math.round((new Date(t.hora_fin) - new Date(t.hora_inicio)) / 60000) : '';

        return {
            'Nro. Turno': t.numero_turno,
            'Paciente (DNI)': t.paciente_dni || 'N/A',
            'Trámite': tramiteLabel,
            'Estado': t.estado,
            'Box Asignado': t.box_asignado === 99 ? 'UCI' : (t.box_asignado || 'N/A'),
            'Fecha Creación': new Date(t.created_at).toLocaleString(),
            'Llamado': t.llamado_at ? new Date(t.llamado_at).toLocaleString() : '',
            'Finalizado': t.hora_fin ? new Date(t.hora_fin).toLocaleString() : '',
            'Espera (min)': espera,
            'Atención (min)': atencion,
            'Derivado a': t.derivado_a_box || ''
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Turnos');

    const fileName = `Exportacion_Turnos_${rangoNombre.replace(/\s+/g, '_')}_${new Date().getTime()}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

// ─── ALGORITMO DE OPINIÓN PROFESIONAL ───
function generarOpinionProfesional(metricas) {
    let opinion = "";

    // Análisis de Volumen
    if (metricas.total > 200) {
        opinion += "El volumen de pacientes durante este período ha sido significativamente alto, indicando un nivel de demanda máximo para la capacidad operativa. ";
    } else if (metricas.total > 80) {
        opinion += "Se registró un volumen de pacientes moderado a alto, manteniendo una demanda constante pero manejable. ";
    } else {
        opinion += "El flujo de pacientes se ha mantenido en niveles bajos a normales, permitiendo un manejo desahogado de la demanda. ";
    }

    // Análisis de Espera
    if (metricas.esperaPromedio > 20) {
        opinion += "Se observan demoras considerables en los tiempos de espera promediando más de 20 minutos por paciente, lo que sugiere posibles cuellos de botella en la recepción o falta de disponibilidad inmediata en los boxes. ";
    } else if (metricas.esperaPromedio > 10) {
        opinion += "Los tiempos de espera se encuentran dentro de rangos operativos aceptables, aunque con cierto margen de mejora para optimizar la fluidez. ";
    } else {
        opinion += "El rendimiento en la sala de espera es óptimo, con derivaciones rápidas a los boxes que garantizan una experiencia de atención ágil. ";
    }

    // Análisis de Atención
    if (metricas.tiempoPromedio > 15) {
        opinion += "La duración de la atención en los boxes es extendida, lo que puede deberse a un alto volumen de trámites complejos (ej. Internaciones, Auditorías). ";
    } else {
        opinion += "Los tiempos de atención interna son eficientes y expeditivos, favoreciendo una alta rotación en los puestos de trabajo.";
    }

    return opinion;
}

// ─── EXPORTACIÓN A PDF (ESTILO REVISTA) ───
export async function generateMetricasPdf(metricas, rangoNombre, chartsElementId) {
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 1. Diseño de Portada / Encabezado (Magazine Style)
    // Fondo de acento lateral corporativo
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(0, 0, 40, pageHeight, 'F');
    doc.setFillColor(59, 130, 246); // Blue-500
    doc.rect(40, 0, 8, pageHeight, 'F');

    // Título Principal
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("INFORME GERENCIAL", 70, 70);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(16);
    doc.setTextColor(100, 116, 139);
    doc.text("Análisis de Rendimiento ADM-QUI", 70, 95);

    // Detalles del periodo
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(`Período de análisis: ${rangoNombre.toUpperCase()}`, 70, 130);
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString()}`, 70, 145);

    // Línea separadora
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1.5);
    doc.line(70, 160, pageWidth - 40, 160);

    // 2. Opinión Profesional (IA Algorítmica)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Resumen Ejecutivo y Opinión Profesional", 70, 190);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    const opinionText = generarOpinionProfesional(metricas);
    const splitOpinion = doc.splitTextToSize(`" ${opinionText} "`, pageWidth - 120);
    
    // Caja de opinión
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(70, 205, pageWidth - 110, splitOpinion.length * 15 + 20, 5, 5, 'F');
    doc.text(splitOpinion, 85, 225);

    let startY = 205 + (splitOpinion.length * 15 + 20) + 30;

    // 3. Métricas Clave (KPIs)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Indicadores Clave de Rendimiento (KPIs)", 70, startY);

    const kpiData = [
        ["Total Pacientes (Volumen)", `${metricas.total}`],
        ["Pacientes Atendidos Efectivos", `${metricas.atendidos}`],
        ["Tiempo Promedio de Espera", `${metricas.esperaPromedio} min`],
        ["Tiempo Promedio de Atención", `${metricas.tiempoPromedio} min`],
    ];

    doc.autoTable({
        startY: startY + 15,
        margin: { left: 70, right: 40 },
        body: kpiData,
        theme: 'plain',
        styles: { fontSize: 11, cellPadding: 8, borderBottomWidth: 0.5, borderBottomColor: [226, 232, 240] },
        columnStyles: {
            0: { fontStyle: 'bold', textColor: [71, 85, 105] },
            1: { fontStyle: 'bold', textColor: [15, 23, 42], halign: 'right' }
        }
    });

    startY = doc.lastAutoTable.finalY + 40;

    // 4. Inserción de Gráficos (html2canvas)
    if (chartsElementId) {
        const chartsEl = document.getElementById(chartsElementId);
        if (chartsEl) {
            try {
                // Agregar nueva página para los gráficos para que se vea limpio
                doc.addPage();
                // Redibujar márgenes en la nueva página
                doc.setFillColor(30, 41, 59); doc.rect(0, 0, 40, pageHeight, 'F');
                doc.setFillColor(59, 130, 246); doc.rect(40, 0, 8, pageHeight, 'F');

                doc.setFont("helvetica", "bold");
                doc.setFontSize(14);
                doc.setTextColor(30, 41, 59);
                doc.text("Visualización de Datos y Tendencias", 70, 50);

                const canvas = await html2canvas(chartsEl, { 
                    scale: 1.5, // Balance entre calidad y tamaño de PDF
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                });
                
                const imgData = canvas.toDataURL('image/jpeg', 0.8);
                const imgProps = doc.getImageProperties(imgData);
                const pdfWidth = pageWidth - 110;
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                doc.addImage(imgData, 'JPEG', 70, 70, pdfWidth, pdfHeight);
            } catch (err) {
                console.error("Error capturando gráficos:", err);
            }
        }
    }

    // Pie de página
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text(`Sanatorio Argentino - Sistema ADM-QUI | Página ${i} de ${pageCount}`, 70, pageHeight - 20);
    }

    doc.save(`Reporte_Gerencial_${rangoNombre.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
}
