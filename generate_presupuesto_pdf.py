import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.pdfgen import canvas

# ─── CLASE PARA NUMERACIÓN Y ENCABEZADOS DE PÁGINA (TWO-PASS CANVAS) ───
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        page_width, page_height = A4
        
        # Omitir encabezado en portada (página 1)
        if self._pageNumber > 1:
            # Header
            self.setStrokeColor(colors.HexColor('#0284c7'))
            self.setLineWidth(1)
            self.line(40, page_height - 42, page_width - 40, page_height - 42)
            
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor('#0f172a'))
            self.drawString(40, page_height - 35, "GROW LABS")
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor('#64748b'))
            self.drawString(100, page_height - 35, "— Soluciones de Software, Automatización e Inteligencia de IA")
            
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor('#0284c7'))
            self.drawRightString(page_width - 40, page_height - 35, "PROPUESTA TÉCNICA · PROYECTO PULSO-HUB (ANR)")

        # Footer en todas las páginas
        self.setStrokeColor(colors.HexColor('#e2e8f0'))
        self.setLineWidth(0.8)
        self.line(40, 42, page_width - 40, 42)
        
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor('#64748b'))
        self.drawString(40, 30, "Documento confidencial elaborado para Sanatorio Argentino S.R.L. · Convocatoria ANR 2026 (ASJDI)")
        
        page_text = f"Página {self._pageNumber} de {page_count}"
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor('#0f172a'))
        self.drawRightString(page_width - 40, 30, page_text)
        
        self.restoreState()


def build_pdf(filename="Presupuesto_GrowLabs_SanatorioArgentino_PULSO-HUB.pdf"):
    pdf_path = os.path.abspath(filename)
    
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=54,
        bottomMargin=54
    )

    # ─── PALETA CORPORATIVA GROW LABS ───
    c_primary = colors.HexColor('#0f172a')     # Navy oscuro
    c_blue = colors.HexColor('#0284c7')        # Azul institucional Grow Labs
    c_blue_dark = colors.HexColor('#0369a1')   # Azul fuerte
    c_blue_light = colors.HexColor('#e0f2fe')  # Fondo celeste suave
    c_slate = colors.HexColor('#475569')       # Texto secundario
    c_muted = colors.HexColor('#64748b')       # Texto terciario
    c_border = colors.HexColor('#e2e8f0')      # Bordes de tablas
    c_bg_card = colors.HexColor('#f8fafc')     # Fondos de tarjetas
    c_green = colors.HexColor('#166534')       # Verde éxito
    c_green_bg = colors.HexColor('#dcfce7')

    # ─── ESTILOS DE TIPOGRAFÍA ───
    styles = getSampleStyleSheet()

    # Modificar estilos existentes o añadir nuevos
    style_cover_title = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=c_primary,
        alignment=0,
        spaceAfter=10
    )

    style_cover_subtitle = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=c_blue_dark,
        alignment=0,
        spaceAfter=20
    )

    style_badge = ParagraphStyle(
        'CoverBadge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.white,
        alignment=0
    )

    style_h1 = ParagraphStyle(
        'CustomH1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=19,
        textColor=c_primary,
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )

    style_h2 = ParagraphStyle(
        'CustomH2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=c_blue_dark,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    style_body = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=c_slate,
        spaceAfter=6,
        alignment=4 # Justificado
    )

    style_body_bold = ParagraphStyle(
        'CustomBodyBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=13,
        textColor=c_primary,
        spaceAfter=4
    )

    style_callout = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12.5,
        textColor=c_primary,
        alignment=4
    )

    style_table_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white,
        alignment=1 # Centrado
    )

    style_table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.8,
        leading=10.5,
        textColor=c_primary
    )

    style_table_cell_center = ParagraphStyle(
        'TableCellCenter',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.8,
        leading=10.5,
        textColor=c_primary,
        alignment=1
    )

    style_table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=c_primary
    )

    style_table_cell_money = ParagraphStyle(
        'TableCellMoney',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=c_blue_dark,
        alignment=2 # Derecha
    )

    story = []

    # ═══════════════════════════════════════════════════════════════════════
    # PÁGINA 1: PORTADA INSTITUCIONAL
    # ═══════════════════════════════════════════════════════════════════════
    
    # Barra superior con marca
    table_top_brand = Table([
        [
            Paragraph("<b>GROW LABS</b> &nbsp;|&nbsp; <i>Advanced Software & AI Solutions</i>", ParagraphStyle('B1', fontName='Helvetica-Bold', fontSize=10, textColor=c_blue)),
            Paragraph("FECHA: <b>OCTUBRE 2026</b>", ParagraphStyle('B2', fontName='Helvetica', fontSize=9, textColor=c_muted, alignment=2))
        ]
    ], colWidths=[360, 155])
    table_top_brand.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(table_top_brand)
    story.append(HRFlowable(width="100%", thickness=2, color=c_blue, spaceBefore=4, spaceAfter=24))

    # Badge de Convocatoria
    badge_data = [[
        Paragraph("<b>CONVOCATORIA ANR 2026 — AGENCIA DE INVERSIONES DE SAN JUAN (ASJDI)</b>", style_badge)
    ]]
    badge_table = Table(badge_data, colWidths=[515])
    badge_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_blue),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('ROUNDEDCORNERS', [4, 4, 4, 4]),
    ]))
    story.append(badge_table)
    story.append(Spacer(1, 14))

    story.append(Paragraph("PROPUESTA TÉCNICA Y PRESUPUESTO PROFESIONAL DE HONORARIOS", style_cover_title))
    story.append(Paragraph(
        "Desarrollo, Re-ingeniería Enterprise, Validación y Transferencia de la Plataforma Tecnológica Integrada de Inteligencia Operativa, Datos Gobernados y Agentes de IA: <b>PULSO-HUB</b>",
        style_cover_subtitle
    ))

    story.append(Spacer(1, 10))

    # Ficha técnica de identificación institucional
    ficha_data = [
        [
            Paragraph("<b>PRESTADOR TÉCNICO / CONSULTORA:</b>", style_body_bold),
            Paragraph("<b>GROW LABS</b> — Soluciones de Software, Automatización e Inteligencia Artificial", style_body)
        ],
        [
            Paragraph("<b>DESTINATARIO / BENEFICIARIO:</b>", style_body_bold),
            Paragraph("<b>SANATORIO ARGENTINO S.R.L.</b> (CUIT: 30-60992686-0)", style_body)
        ],
        [
            Paragraph("<b>DESTINATARIO INTERNO:</b>", style_body_bold),
            Paragraph("Dirección de Administración, Finanzas y Transformación Digital", style_body)
        ],
        [
            Paragraph("<b>MODALIDAD DEL PROGRAMA:</b>", style_body_bold),
            Paragraph("Aporte No Reembolsable (ANR) Individual — Asistencia Técnica", style_body)
        ],
        [
            Paragraph("<b>PLAZO DE EJECUCIÓN TOTAL:</b>", style_body_bold),
            Paragraph("<b>6 Meses Calendario</b> (24 semanas operativas)", style_body)
        ],
        [
            Paragraph("<b>PRESUPUESTO TOTAL COTIZADO:</b>", style_body_bold),
            Paragraph("<b>USD 90.000,00</b> (Dólares Estadounidenses Noventa Mil)", ParagraphStyle('M1', fontName='Helvetica-Bold', fontSize=10, textColor=c_blue_dark))
        ],
        [
            Paragraph("<b>CONDICIÓN FISCAL Y FACTURACIÓN:</b>", style_body_bold),
            Paragraph("Emisión homologada de Factura Electrónica Tipo 'A' a mes vencido contra certificación de hitos técnicos", style_body)
        ]
    ]
    t_ficha = Table(ficha_data, colWidths=[185, 330])
    t_ficha.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_bg_card),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t_ficha)

    story.append(Spacer(1, 20))

    # Resumen Ejecutivo Box
    exec_summary_box = [
        [
            Paragraph("<b>SÍNTESIS ESTRATÉGICA DEL PROYECTO:</b><br/>"
                      "El presente documento formaliza la cotización y plan de trabajo de <b>Grow Labs</b> para construir, integrar y validar la plataforma <b>PULSO-HUB</b> en Sanatorio Argentino S.R.L. "
                      "El objetivo principal radica en tomar las capacidades y prototipos funcionales actualmente existentes en la institución (admisiones quirúrgicas, control de altas, contact center automatizado, convenios médicos y liquidaciones) y someterlos a una <b>re-ingeniería de arquitectura empresarial desacoplada</b>, convirtiéndolos en un <b>activo tecnológico e intangible propio de Sanatorio Argentino</b>, altamente escalable, gobernable, seguro y listo para su registro de propiedad intelectual.",
                      style_callout)
        ]
    ]
    t_exec = Table(exec_summary_box, colWidths=[515])
    t_exec.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_blue_light),
        ('BOX', (0,0), (-1,-1), 1, c_blue),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('ROUNDEDCORNERS', [4, 4, 4, 4]),
    ]))
    story.append(t_exec)

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # PÁGINA 2: JUSTIFICACIÓN TÉCNICA Y RE-INGENIERÍA ENTERPRISE
    # ═══════════════════════════════════════════════════════════════════════
    story.append(Paragraph("1. JUSTIFICACIÓN TÉCNICA: DE PROTOTIPOS AISLADOS A UN ACTIVO ENTERPRISE", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_blue, spaceBefore=2, spaceAfter=10))

    story.append(Paragraph(
        "Sanatorio Argentino ha recorrido un camino pionero en la adopción de herramientas tecnológicas avanzadas, validando con éxito el uso de automatizaciones, integración de bases de datos y asistentes de IA en procesos asistenciales y administrativos. Se cuenta hoy con experiencias operativas directas en: "
        "<b>(a) Admisiones Quirúrgicas e Internaciones (ADM-QUI)</b> con seguimiento de fichas clínicas; "
        "<b>(b) Auditoría y Cruce de Facturación OSP (Txt Provincia)</b> con detección de inconsistencias; "
        "<b>(c) Turnero y Contact Center Inteligente</b> operando sobre WhatsApp y AsisteClick; "
        "<b>(d) Módulo de Convenios Médicos</b> con consulta de normativas; y "
        "<b>(e) Liquidaciones de Honorarios Médicos</b> complejas.",
        style_body
    ))

    story.append(Paragraph(
        "<b>¿Por qué cotizar la plataforma como un desarrollo completo si ya existen bases desarrolladas?</b><br/>"
        "Esta es la pregunta medular que fundamenta el proyecto ANR. En el ámbito del software médico y empresarial, existe una brecha insalvable entre un conjunto de herramientas departamentales funcionales y una <b>plataforma tecnológica institucional gobernable</b>. Los desarrollos actuales operan con mecanismos de acceso heterogéneos, dependencias de software acopladas, lógicas de sincronización ad-hoc y carecen de un motor centralizado de seguridad perimetral, auditoría inmutable y control unificado de modelos de lenguaje.",
        style_body
    ))

    story.append(Paragraph(
        "El proyecto <b>PULSO-HUB</b> presupuestado por Grow Labs comprende la <b>re-ingeniería estructural completa</b>, diseñada para:",
        style_body
    ))

    # Puntos de reingenieria
    reeng_points = [
        ("Desacoplamiento Arquitectónico (PULSO-CORE):", "Crear una capa de abstracción independiente de los sistemas de terceros (SALUS, Tango, Bitrix24, Humand). Si un proveedor cambia su versión o API, la lógica de negocio y los agentes institucionales no se rompen."),
        ("Conocimiento Institucional Indexado (PULSO-KNOWLEDGE):", "Consolidar las normativas médicas, coberturas de convenios y guías clínicas en una base vectorial unificada (PostgreSQL + pgvector) con arquitectura RAG (Retrieval-Augmented Generation) de grado corporativo."),
        ("Seguridad Médica y Privacidad (PULSO-SEC & TRUST):", "Garantizar estricto cumplimiento de la Ley 25.326 de Protección de Datos Personales y secreto médico mediante control de acceso granular basado en roles (RBAC) y algoritmos que impiden respuestas alucinadas sin respaldo documental."),
        ("Auditoría Forense Integral (PULSO-AUDIT):", "Registrar de forma inmutable cada consulta médica, interacción de agentes y acción transaccional con marca de tiempo, usuario interviniente y evidencia de fuentes consultadas."),
        ("Activo Intangible Registrable:", "Generar el código fuente, la documentación de arquitectura y el dossier técnico para que Sanatorio Argentino inscriba la propiedad intelectual a su nombre ante la Dirección Nacional del Derecho de Autor (DNDA) y el INPI.")
    ]

    for title, desc in reeng_points:
        story.append(Paragraph(f"• <b>{title}</b> {desc}", style_body))

    story.append(Spacer(1, 10))

    # Cuadro comparativo: Prototipos aislados vs Plataforma PULSO-HUB
    comp_data = [
        [
            Paragraph("<b>DIMENSIÓN</b>", style_table_header),
            Paragraph("<b>ESTADO ACTUAL (PROTOTIPOS AISLADOS)</b>", style_table_header),
            Paragraph("<b>ESTADO META (PULSO-HUB POR GROW LABS)</b>", style_table_header)
        ],
        [
            Paragraph("<b>Arquitectura</b>", style_table_cell_bold),
            Paragraph("Soluciones departamentales independientes con código disperso.", style_table_cell),
            Paragraph("Arquitectura enterprise modular, desacoplada y orientada a eventos.", style_table_cell)
        ],
        [
            Paragraph("<b>Interoperabilidad</b>", style_table_cell_bold),
            Paragraph("Conexiones directas y rígidas a bases de datos transaccionales.", style_table_cell),
            Paragraph("Framework PULSO-DATA con conectores normalizados y ETL incremental.", style_table_cell)
        ],
        [
            Paragraph("<b>Conocimiento e IA</b>", style_table_cell_bold),
            Paragraph("Prompts aislados con riesgo de desactualización o alucinación.", style_table_cell),
            Paragraph("Motor RAG gobernado con citas explícitas de convenios y trazabilidad.", style_table_cell)
        ],
        [
            Paragraph("<b>Seguridad & RBAC</b>", style_table_cell_bold),
            Paragraph("Gestión heterogénea de accesos según cada aplicativo.", style_table_cell),
            Paragraph("Módulo PULSO-SEC centralizado con matriz de permisos por rol y acción.", style_table_cell)
        ],
        [
            Paragraph("<b>Propiedad y Valor</b>", style_table_cell_bold),
            Paragraph("Scripts internos sin valor de activo intangible consolidado.", style_table_cell),
            Paragraph("Plataforma con dossier de propiedad intelectual y potencial de transferencia.", style_table_cell)
        ]
    ]
    t_comp = Table(comp_data, colWidths=[105, 205, 205])
    t_comp.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_primary),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_card]),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_comp)

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # PÁGINA 3: ESTRUCTURA DE EQUIPO Y DESGLOSE DE ROLES (USD 90.000)
    # ═══════════════════════════════════════════════════════════════════════
    story.append(Paragraph("2. DIMENSIONAMIENTO ECONÓMICO: EQUIPO PROFESIONAL Y CARGA HORARIA", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_blue, spaceBefore=2, spaceAfter=10))

    story.append(Paragraph(
        "Para llevar adelante la construcción integral de PULSO-HUB en el plazo estricto de 6 meses (24 semanas), Grow Labs asigna un equipo técnico multidisciplinario de <b>7 profesionales senior y semi-senior</b>, acumulando un total de <b>2.080 horas de ingeniería de software, arquitectura de datos e inteligencia artificial</b>.",
        style_body
    ))
    story.append(Paragraph(
        "La tarifa horaria promedio resultante es de <b>USD 43,27 / hora</b>, perfectamente alineada con los estándares de mercado regional e internacional para servicios especializados de economía del conocimiento aplicados a la salud.",
        style_body
    ))

    story.append(Spacer(1, 6))

    # Tabla de Roles y Costos
    roles_data = [
        [
            Paragraph("<b>PERFIL PROFESIONAL / ROL GROW LABS</b>", style_table_header),
            Paragraph("<b>SÉNIORITY</b>", style_table_header),
            Paragraph("<b>PERÍODO</b>", style_table_header),
            Paragraph("<b>HORAS</b>", style_table_header),
            Paragraph("<b>VALOR HORA</b>", style_table_header),
            Paragraph("<b>TOTAL (USD)</b>", style_table_header),
            Paragraph("<b>%</b>", style_table_header)
        ],
        [
            Paragraph("<b>Lead AI & Software Architect</b><br/><font color='#64748b' size='6.5'>Dirección técnica, PULSO-CORE, orquestación, microservicios y PI.</font>", style_table_cell),
            Paragraph("Staff / Sr.", style_table_cell_center),
            Paragraph("Meses 1 a 6", style_table_cell_center),
            Paragraph("440 hs", style_table_cell_center),
            Paragraph("USD 55,00", style_table_cell_center),
            Paragraph("<b>$ 24.200,00</b>", style_table_cell_money),
            Paragraph("26,89%", style_table_cell_center)
        ],
        [
            Paragraph("<b>Senior Full Stack Engineer</b><br/><font color='#64748b' size='6.5'>PULSO-PORTAL web Vite/React, APIs FastAPI/Node, UI clínica.</font>", style_table_cell),
            Paragraph("Senior", style_table_cell_center),
            Paragraph("Meses 2 a 6", style_table_cell_center),
            Paragraph("480 hs", style_table_cell_center),
            Paragraph("USD 42,00", style_table_cell_center),
            Paragraph("<b>$ 20.160,00</b>", style_table_cell_money),
            Paragraph("22,40%", style_table_cell_center)
        ],
        [
            Paragraph("<b>Senior Data & Interoperability Engineer</b><br/><font color='#64748b' size='6.5'>PULSO-DATA, conectores SALUS (SQL), Tango, Bitrix24 y Humand.</font>", style_table_cell),
            Paragraph("Senior", style_table_cell_center),
            Paragraph("Meses 1 a 5", style_table_cell_center),
            Paragraph("380 hs", style_table_cell_center),
            Paragraph("USD 42,00", style_table_cell_center),
            Paragraph("<b>$ 15.960,00</b>", style_table_cell_money),
            Paragraph("17,73%", style_table_cell_center)
        ],
        [
            Paragraph("<b>AI / NLP & RAG Specialist</b><br/><font color='#64748b' size='6.5'>PULSO-KNOWLEDGE, vectorización pgvector, chunking y prompts.</font>", style_table_cell),
            Paragraph("Senior", style_table_cell_center),
            Paragraph("Meses 2 a 5", style_table_cell_center),
            Paragraph("280 hs", style_table_cell_center),
            Paragraph("USD 45,00", style_table_cell_center),
            Paragraph("<b>$ 12.600,00</b>", style_table_cell_money),
            Paragraph("14,00%", style_table_cell_center)
        ],
        [
            Paragraph("<b>QA Automation & Verification Engineer</b><br/><font color='#64748b' size='6.5'>PULSO-TRUST, pruebas de integración, estrés y confiabilidad.</font>", style_table_cell),
            Paragraph("Semi-Sr.", style_table_cell_center),
            Paragraph("Meses 4 a 6", style_table_cell_center),
            Paragraph("240 hs", style_table_cell_center),
            Paragraph("USD 32,00", style_table_cell_center),
            Paragraph("<b>$ 7.680,00</b>", style_table_cell_money),
            Paragraph("8,53%", style_table_cell_center)
        ],
        [
            Paragraph("<b>Functional & Healthcare Domain Consultant</b><br/><font color='#64748b' size='6.5'>Modelado de procesos asistenciales, admisiones y auditoría.</font>", style_table_cell),
            Paragraph("Senior", style_table_cell_center),
            Paragraph("Meses 1, 2, 6", style_table_cell_center),
            Paragraph("160 hs", style_table_cell_center),
            Paragraph("USD 37,00", style_table_cell_center),
            Paragraph("<b>$ 5.920,00</b>", style_table_cell_money),
            Paragraph("6,58%", style_table_cell_center)
        ],
        [
            Paragraph("<b>Cybersecurity & Compliance Specialist</b><br/><font color='#64748b' size='6.5'>PULSO-SEC, matriz RBAC, auditoría forense, Ley 25.326 y dossier PI.</font>", style_table_cell),
            Paragraph("Senior", style_table_cell_center),
            Paragraph("Meses 1, 3, 6", style_table_cell_center),
            Paragraph("100 hs", style_table_cell_center),
            Paragraph("USD 34,80", style_table_cell_center),
            Paragraph("<b>$ 3.480,00</b>", style_table_cell_money),
            Paragraph("3,87%", style_table_cell_center)
        ],
        [
            Paragraph("<b>TOTAL HONORARIOS PROFESIONALES (GROW LABS)</b>", style_table_cell_bold),
            Paragraph("<b>EQUIPO COMPLETO</b>", style_table_cell_center),
            Paragraph("<b>6 MESES</b>", style_table_cell_center),
            Paragraph("<b>2.080 hs</b>", style_table_cell_center),
            Paragraph("<b>USD 43,27 (prom)</b>", style_table_cell_center),
            Paragraph("<b>$ 90.000,00</b>", ParagraphStyle('TOTM', fontName='Helvetica-Bold', fontSize=9, textColor=c_blue_dark, alignment=2)),
            Paragraph("<b>100,00%</b>", style_table_cell_center)
        ]
    ]

    t_roles = Table(roles_data, colWidths=[175, 45, 55, 45, 55, 95, 45])
    t_roles.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_primary),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, c_bg_card]),
        ('BACKGROUND', (0,-1), (-1,-1), c_blue_light),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_roles)

    story.append(Spacer(1, 10))

    # Matriz de Intervención Mensual por Rol
    story.append(Paragraph("<b>Cronograma Operativo de Asignación por Rol (Mes 1 a Mes 6):</b>", style_body_bold))
    
    matriz_data = [
        [
            Paragraph("<b>ROL PROFESIONAL</b>", style_table_header),
            Paragraph("<b>M1</b>", style_table_header),
            Paragraph("<b>M2</b>", style_table_header),
            Paragraph("<b>M3</b>", style_table_header),
            Paragraph("<b>M4</b>", style_table_header),
            Paragraph("<b>M5</b>", style_table_header),
            Paragraph("<b>M6</b>", style_table_header),
            Paragraph("<b>TOTAL HS</b>", style_table_header)
        ],
        [Paragraph("Lead AI & Software Architect", style_table_cell), Paragraph("80 h", style_table_cell_center), Paragraph("80 h", style_table_cell_center), Paragraph("80 h", style_table_cell_center), Paragraph("80 h", style_table_cell_center), Paragraph("60 h", style_table_cell_center), Paragraph("60 h", style_table_cell_center), Paragraph("<b>440 hs</b>", style_table_cell_bold)],
        [Paragraph("Senior Full Stack Engineer", style_table_cell), Paragraph("—", style_table_cell_center), Paragraph("100 h", style_table_cell_center), Paragraph("100 h", style_table_cell_center), Paragraph("100 h", style_table_cell_center), Paragraph("100 h", style_table_cell_center), Paragraph("80 h", style_table_cell_center), Paragraph("<b>480 hs</b>", style_table_cell_bold)],
        [Paragraph("Senior Data & Interoperability Engineer", style_table_cell), Paragraph("60 h", style_table_cell_center), Paragraph("80 h", style_table_cell_center), Paragraph("100 h", style_table_cell_center), Paragraph("80 h", style_table_cell_center), Paragraph("60 h", style_table_cell_center), Paragraph("—", style_table_cell_center), Paragraph("<b>380 hs</b>", style_table_cell_bold)],
        [Paragraph("AI / NLP & RAG Specialist", style_table_cell), Paragraph("—", style_table_cell_center), Paragraph("60 h", style_table_cell_center), Paragraph("80 h", style_table_cell_center), Paragraph("80 h", style_table_cell_center), Paragraph("60 h", style_table_cell_center), Paragraph("—", style_table_cell_center), Paragraph("<b>280 hs</b>", style_table_cell_bold)],
        [Paragraph("QA Automation Engineer", style_table_cell), Paragraph("—", style_table_cell_center), Paragraph("—", style_table_cell_center), Paragraph("—", style_table_cell_center), Paragraph("60 h", style_table_cell_center), Paragraph("100 h", style_table_cell_center), Paragraph("80 h", style_table_cell_center), Paragraph("<b>240 hs</b>", style_table_cell_bold)],
        [Paragraph("Functional Healthcare Consultant", style_table_cell), Paragraph("80 h", style_table_cell_center), Paragraph("40 h", style_table_cell_center), Paragraph("—", style_table_cell_center), Paragraph("—", style_table_cell_center), Paragraph("—", style_table_cell_center), Paragraph("40 h", style_table_cell_center), Paragraph("<b>160 hs</b>", style_table_cell_bold)],
        [Paragraph("Cybersecurity & Compliance Specialist", style_table_cell), Paragraph("30 h", style_table_cell_center), Paragraph("—", style_table_cell_center), Paragraph("40 h", style_table_cell_center), Paragraph("—", style_table_cell_center), Paragraph("—", style_table_cell_center), Paragraph("30 h", style_table_cell_center), Paragraph("<b>100 hs</b>", style_table_cell_bold)],
        [Paragraph("<b>TOTAL HORAS / MES</b>", style_table_cell_bold), Paragraph("<b>250 h</b>", style_table_cell_bold), Paragraph("<b>360 h</b>", style_table_cell_bold), Paragraph("<b>400 h</b>", style_table_cell_bold), Paragraph("<b>400 h</b>", style_table_cell_bold), Paragraph("<b>380 h</b>", style_table_cell_bold), Paragraph("<b>290 h</b>", style_table_cell_bold), Paragraph("<b>2.080 hs</b>", style_table_cell_bold)],
    ]
    t_matriz = Table(matriz_data, colWidths=[185, 45, 45, 45, 45, 45, 45, 60])
    t_matriz.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_blue_dark),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('BACKGROUND', (0,-1), (-1,-1), c_bg_card),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_matriz)

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # PÁGINA 4: MOTIVOS Y JUSTIFICACIÓN EXHAUSTIVA DE DESEMBOLSOS (PARTE I)
    # ═══════════════════════════════════════════════════════════════════════
    story.append(Paragraph("3. EXPLICACIÓN DETALLADA Y JUSTIFICACIÓN DE CADA DESEMBOLSO", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_blue, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "A continuación, Grow Labs desglosa de manera exhaustiva el destino de los fondos, la justificación operativa, los entregables verificables y el valor estratégico que aporta cada uno de los <b>6 desembolsos mensuales programados</b>:",
        style_body
    ))
    story.append(Spacer(1, 4))

    disbursements_p1 = [
        (
            "DESEMBOLSO 1 — MES 1: USD 11.500,00 (12,78%)",
            "Diagnóstico de Ecosistema, Relevamiento Funcional y Arquitectura Integral",
            "PV01 (Mapa de sistemas, fuentes y procesos) y PV02 (Documento de Arquitectura PULSO-HUB)",
            "El éxito de una plataforma médica depende de un diseño inicial sin fisuras. En este primer mes, los consultores funcionales y el Arquitecto Lead realizan la ingeniería inversa de los esquemas de datos relacionales de SALUS (Sybase/SQL Server), Tango Gestión, Bitrix24 y Humand. Se definen formalmente los diccionarios de datos, las llaves de cruce entre pacientes, internaciones y folios de facturación, y se diseña el blueprint de microservicios desacoplados.<br/>"
            "<b>Justificación operativa y mitigación de riesgo:</b> Evita retrabajos y fallas estructurales posteriores que encarecerían exponencialmente el proyecto. Deja formalizado el documento ERS y el Project Charter aprobado por las autoridades del Sanatorio."
        ),
        (
            "DESEMBOLSO 2 — MES 2: USD 14.500,00 (16,11%)",
            "Construcción del Núcleo Orquestador (PULSO-CORE) y Cimientos del Portal Web",
            "PV03 (Alpha Core de orquestación) e Inicio de PV04 (PULSO-PORTAL) y PV05 (Pipelines)",
            "Se inicia el desarrollo del 'cerebro' de la plataforma: el framework de ejecución de agentes, gestión de sesiones asíncronas y cola de mensajes de alta velocidad (FastAPI/Python y Node.js). Paralelamente, el Senior Full Stack Engineer construye la estructura base del portal web (PULSO-PORTAL) bajo el estándar Vite + React, aplicando el sistema de diseño clínico limpio (fondo blanco, estética Calidad-QOAG, navegación responsiva y accesibilidad hospitalaria).<br/>"
            "<b>Justificación operativa y mitigación de riesgo:</b> Provee la base operativa sobre la cual correrán todos los módulos posteriores, asegurando que la interfaz de usuario sea intuitiva para médicos, administrativos y directivos."
        ),
        (
            "DESEMBOLSO 3 — MES 3: USD 18.500,00 (20,56%)",
            "Interoperabilidad de Datos (PULSO-DATA) y Capa de Conocimiento Semántico (PULSO-KNOWLEDGE)",
            "PV04 (Portal autenticado funcional), PV06 (Knowledge Base RAG) y PV07 (Modelo RBAC inicial)",
            "Representa uno de los hitos técnicos más intensivos. El Ingeniero de Datos monta las tuberías de extracción, transformación y carga (ETL incremental) para consultar las admisiones, cirugías y turnos sin sobrecargar ni bloquear las bases transaccionales de SALUS. Simultáneamente, el Especialista en IA implementa la base vectorial (PostgreSQL con pgvector), segmenta semánticamente cientos de convenios médicos complejos (normas OSP, PAMI, prepagas) y calibra los modelos de embeddings.<br/>"
            "<b>Justificación operativa y mitigación de riesgo:</b> Dota a la plataforma de su memoria institucional inteligente y de la capacidad de interactuar con datos en tiempo real con latencias inferiores a 500 ms."
        )
    ]

    for title, subtitle, deliverables, narrative in disbursements_p1:
        box_data = [
            [
                Paragraph(f"<b>{title}</b> — <font color='{c_blue_dark}'>{subtitle}</font>", style_body_bold)
            ],
            [
                Paragraph(f"<b>Entregables ANR Asociados:</b> {deliverables}", ParagraphStyle('DELIV', fontName='Helvetica-Bold', fontSize=7.8, textColor=c_green))
            ],
            [
                Paragraph(narrative, style_callout)
            ]
        ]
        t_box = Table(box_data, colWidths=[515])
        t_box.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), c_bg_card),
            ('BOX', (0,0), (-1,-1), 1, c_border),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('LINEBELOW', (0,0), (-1,0), 0.5, c_border),
            ('LINEBELOW', (0,1), (-1,1), 0.5, c_border),
        ]))
        story.append(t_box)
        story.append(Spacer(1, 6))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # PÁGINA 5: MOTIVOS Y JUSTIFICACIÓN EXHAUSTIVA DE DESEMBOLSOS (PARTE II)
    # ═══════════════════════════════════════════════════════════════════════
    story.append(Paragraph("3. EXPLICACIÓN DETALLADA Y JUSTIFICACIÓN DE CADA DESEMBOLSO (CONT.)", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_blue, spaceBefore=2, spaceAfter=8))

    disbursements_p2 = [
        (
            "DESEMBOLSO 4 — MES 4: USD 18.500,00 (20,56%)",
            "Seguridad Perimetral (PULSO-SEC), Auditoría Inmutable (PULSO-AUDIT) y Motor Confiable (PULSO-TRUST)",
            "PV05 (Conectores SALUS/Tango concluidos), PV08 (Módulo de Auditoría) y PV09 (Módulo Trust)",
            "En salud, la seguridad y la veracidad de la información son críticas. Este desembolso cubre la implantación de la matriz RBAC que define qué usuario y qué agente pueden ver qué datos (principio de mínimo privilegio). Se construye el módulo PULSO-AUDIT que registra cada consulta en una bitácora inmutable. Asimismo, se implementa el motor PULSO-TRUST, que evalúa algorítmicamente la procedencia de cada respuesta generada por los agentes, exigiendo cita obligatoria de fuentes y bloqueando alucinaciones.<br/>"
            "<b>Justificación operativa y mitigación de riesgo:</b> Protege a Sanatorio Argentino de responsabilidades legales, fugas de datos sensibles (Ley 25.326) y decisiones médicas o administrativas erróneas."
        ),
        (
            "DESEMBOLSO 5 — MES 5: USD 14.500,00 (16,11%)",
            "Despliegue de Agentes Especializados por Proceso y Acciones Transaccionales Seguras",
            "PV10 (Framework PULSO-AGENTS operativo) y PV11 (Casos transaccionales validados)",
            "Se integran los agentes inteligentes específicos en las áreas prioritarias del Sanatorio: (1) Agente de Admisiones y Quirófano (conciliación de historias clínicas y entrega de fichas); (2) Agente de Facturación (auditoría automática OSP y reportes de discrepancias); (3) Agente de Convenios (resolución de coberturas y aranceles); y (4) Agente de Contact Center (asistencia en gestión de turnos). En procesos autorizados, se habilita la ejecución controlada de acciones (ej. actualización de estados o notificaciones automáticas).<br/>"
            "<b>Justificación operativa y mitigación de riesgo:</b> Es el punto donde el Sanatorio captura el retorno de inversión operativo, reduciendo fricciones, horas manuales y errores en facturación."
        ),
        (
            "DESEMBOLSO 6 — MES 6: USD 12.500,00 (13,88%)",
            "Pruebas Integrales, Capacitación, Dossier de Propiedad Intelectual y Cierre",
            "PV12 a PV19 (Pruebas QA, Manuales, Capacitación, Escalabilidad, Dossier PI e Informe Final)",
            "El último desembolso corona el proyecto garantizando su sostenibilidad futura y titularidad. El equipo de QA ejecuta pruebas de estrés y penetración; se realizan jornadas de capacitación avanzada para el equipo de TI y usuarios clave del Sanatorio; se entregan manuales técnicos y funcionales completos; y se redacta el dossier técnico para el registro de la propiedad intelectual a nombre exclusivo de Sanatorio Argentino S.R.L. ante la DNDA / INPI.<br/>"
            "<b>Justificación operativa y mitigación de riesgo:</b> Garantiza la autonomía tecnológica total del Sanatorio, eliminando cualquier atadura cautiva con la consultora y consolidando el activo de innovación."
        )
    ]

    for title, subtitle, deliverables, narrative in disbursements_p2:
        box_data = [
            [
                Paragraph(f"<b>{title}</b> — <font color='{c_blue_dark}'>{subtitle}</font>", style_body_bold)
            ],
            [
                Paragraph(f"<b>Entregables ANR Asociados:</b> {deliverables}", ParagraphStyle('DELIV', fontName='Helvetica-Bold', fontSize=7.8, textColor=c_green))
            ],
            [
                Paragraph(narrative, style_callout)
            ]
        ]
        t_box = Table(box_data, colWidths=[515])
        t_box.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), c_bg_card),
            ('BOX', (0,0), (-1,-1), 1, c_border),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
            ('LINEBELOW', (0,0), (-1,0), 0.5, c_border),
            ('LINEBELOW', (0,1), (-1,1), 0.5, c_border),
        ]))
        story.append(t_box)
        story.append(Spacer(1, 6))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # PÁGINA 6: FORMULARIO DE INVERSIÓN ANR Y FLUJO FINANCIERO MENSUAL
    # ═══════════════════════════════════════════════════════════════════════
    story.append(Paragraph("4. INTEGRACIÓN CON EL FORMULARIO DE INVERSIÓN ANR (SECCIÓN 15)", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_blue, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "A los fines de completar exactamente los casilleros <b>[A COTIZAR]</b> de la <b>Sección 15 del Formulario de Presentación del ANR</b>, Grow Labs presenta la siguiente correspondencia unívoca entre etapas, conceptos de inversión, productos verificables y montos en dólares estadounidenses:",
        style_body
    ))
    story.append(Spacer(1, 3))

    # Tabla ANR Seccion 15
    anr_table_data = [
        [
            Paragraph("<b>ETAPA</b>", style_table_header),
            Paragraph("<b>CONCEPTO / PRODUCTO ENTREGABLE ANR</b>", style_table_header),
            Paragraph("<b>PRODUCTOS VERIFICABLES ASOCIADOS</b>", style_table_header),
            Paragraph("<b>HORAS</b>", style_table_header),
            Paragraph("<b>MONTO (USD)</b>", style_table_header)
        ],
        [
            Paragraph("<b>Etapa 1</b>", style_table_cell_center),
            Paragraph("Diagnóstico, relevamiento y arquitectura integral", style_table_cell),
            Paragraph("<b>PV01</b> (Diagnóstico y mapa) + <b>PV02</b> (Arquitectura PULSO-HUB)", style_table_cell),
            Paragraph("260 hs", style_table_cell_center),
            Paragraph("<b>$ 11.500,00</b>", style_table_cell_money)
        ],
        [
            Paragraph("<b>Etapa 2</b>", style_table_cell_center),
            Paragraph("PULSO-CORE + PULSO-PORTAL", style_table_cell),
            Paragraph("<b>PV03</b> (Núcleo orquestador) + <b>PV04</b> (Portal autenticado web)", style_table_cell),
            Paragraph("380 hs", style_table_cell_center),
            Paragraph("<b>$ 16.500,00</b>", style_table_cell_money)
        ],
        [
            Paragraph("<b>Etapa 3</b>", style_table_cell_center),
            Paragraph("Interoperabilidad, datos y conectores", style_table_cell),
            Paragraph("<b>PV05</b> (Framework PULSO-DATA y conectores a SALUS/Tango)", style_table_cell),
            Paragraph("260 hs", style_table_cell_center),
            Paragraph("<b>$ 11.500,00</b>", style_table_cell_money)
        ],
        [
            Paragraph("<b>Etapa 3</b>", style_table_cell_center),
            Paragraph("Conocimiento institucional inteligente", style_table_cell),
            Paragraph("<b>PV06</b> (Capa PULSO-KNOWLEDGE y RAG semántico)", style_table_cell),
            Paragraph("200 hs", style_table_cell_center),
            Paragraph("<b>$ 8.500,00</b>", style_table_cell_money)
        ],
        [
            Paragraph("<b>Etapa 4</b>", style_table_cell_center),
            Paragraph("Seguridad, auditoría y confiabilidad", style_table_cell),
            Paragraph("<b>PV07</b> (PULSO-SEC) + <b>PV08</b> (PULSO-AUDIT) + <b>PV09</b> (PULSO-TRUST)", style_table_cell),
            Paragraph("320 hs", style_table_cell_center),
            Paragraph("<b>$ 14.000,00</b>", style_table_cell_money)
        ],
        [
            Paragraph("<b>Etapa 5</b>", style_table_cell_center),
            Paragraph("Agentes, integraciones funcionales y acciones controladas", style_table_cell),
            Paragraph("<b>PV10</b> (PULSO-AGENTS) + <b>PV11</b> (Casos transaccionales)", style_table_cell),
            Paragraph("330 hs", style_table_cell_center),
            Paragraph("<b>$ 14.000,00</b>", style_table_cell_money)
        ],
        [
            Paragraph("<b>Etapa 6</b>", style_table_cell_center),
            Paragraph("Pruebas y validación", style_table_cell),
            Paragraph("<b>PV12</b> (Pruebas funcionales/seguridad) + <b>PV13</b> (Validación casos)", style_table_cell),
            Paragraph("180 hs", style_table_cell_center),
            Paragraph("<b>$ 7.500,00</b>", style_table_cell_money)
        ],
        [
            Paragraph("<b>Etapa 6</b>", style_table_cell_center),
            Paragraph("Documentación, capacitación, escalabilidad, PI y cierre", style_table_cell),
            Paragraph("<b>PV14</b> a <b>PV19</b> (Manuales, capacitación, dossier PI y reporte final)", style_table_cell),
            Paragraph("150 hs", style_table_cell_center),
            Paragraph("<b>$ 6.500,00</b>", style_table_cell_money)
        ],
        [
            Paragraph("<b>TOTAL</b>", style_table_cell_bold),
            Paragraph("<b>PRESUPUESTO TOTAL ASISTENCIA TÉCNICA (GROW LABS)</b>", style_table_cell_bold),
            Paragraph("<b>HOMOLOGACIÓN DE PRODUCTOS PV01 A PV19</b>", style_table_cell_bold),
            Paragraph("<b>2.080 hs</b>", style_table_cell_bold),
            Paragraph("<b>$ 90.000,00</b>", ParagraphStyle('ANRTOT', fontName='Helvetica-Bold', fontSize=8.5, textColor=c_blue_dark, alignment=2))
        ]
    ]

    t_anr = Table(anr_table_data, colWidths=[55, 155, 175, 45, 85])
    t_anr.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_primary),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, c_bg_card]),
        ('BACKGROUND', (0,-1), (-1,-1), c_blue_light),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_anr)

    story.append(Spacer(1, 10))

    # Flujo Financiero Mensual
    story.append(Paragraph("<b>Flujo Financiero Mensual de Certificaciones y Facturación:</b>", style_body_bold))

    flujo_data = [
        [
            Paragraph("<b>MES</b>", style_table_header),
            Paragraph("<b>FASES METODOLÓGICAS</b>", style_table_header),
            Paragraph("<b>HITOS Y ENTREGABLES PRINCIPALES</b>", style_table_header),
            Paragraph("<b>FACTURACIÓN (USD)</b>", style_table_header),
            Paragraph("<b>ACUMULADO (USD)</b>", style_table_header),
            Paragraph("<b>% AVANCE</b>", style_table_header)
        ],
        [Paragraph("Mes 1", style_table_cell_center), Paragraph("Relevamiento y Arquitectura", style_table_cell), Paragraph("PV01 y PV02 aprobados", style_table_cell), Paragraph("<b>$ 11.500,00</b>", style_table_cell_money), Paragraph("$ 11.500,00", style_table_cell_center), Paragraph("12,78%", style_table_cell_center)],
        [Paragraph("Mes 2", style_table_cell_center), Paragraph("Core, Portal e Integraciones", style_table_cell), Paragraph("PV03 operativo, inicio PV04 y PV05", style_table_cell), Paragraph("<b>$ 14.500,00</b>", style_table_cell_money), Paragraph("$ 26.000,00", style_table_cell_center), Paragraph("28,89%", style_table_cell_center)],
        [Paragraph("Mes 3", style_table_cell_center), Paragraph("RAG, Vectorización y Seguridad", style_table_cell), Paragraph("PV04 funcional, PV06 RAG y PV07 RBAC", style_table_cell), Paragraph("<b>$ 18.500,00</b>", style_table_cell_money), Paragraph("$ 44.500,00", style_table_cell_center), Paragraph("49,44%", style_table_cell_center)],
        [Paragraph("Mes 4", style_table_cell_center), Paragraph("Conectores, Auditoría y Trust", style_table_cell), Paragraph("PV05 conectores, PV08 Audit y PV09 Trust", style_table_cell), Paragraph("<b>$ 18.500,00</b>", style_table_cell_money), Paragraph("$ 63.000,00", style_table_cell_center), Paragraph("70,00%", style_table_cell_center)],
        [Paragraph("Mes 5", style_table_cell_center), Paragraph("Agentes y Flujos Transaccionales", style_table_cell), Paragraph("PV10 agentes y PV11 transaccionales", style_table_cell), Paragraph("<b>$ 14.500,00</b>", style_table_cell_money), Paragraph("$ 77.500,00", style_table_cell_center), Paragraph("86,11%", style_table_cell_center)],
        [Paragraph("Mes 6", style_table_cell_center), Paragraph("QA, Transferencia, PI y Cierre", style_table_cell), Paragraph("PV12 a PV19 completos y aprobados", style_table_cell), Paragraph("<b>$ 12.500,00</b>", style_table_cell_money), Paragraph("$ 90.000,00", style_table_cell_center), Paragraph("100,00%", style_table_cell_center)],
        [Paragraph("<b>TOTAL</b>", style_table_cell_bold), Paragraph("<b>6 MESES DE EJECUCIÓN</b>", style_table_cell_bold), Paragraph("<b>19 PRODUCTOS VERIFICABLES</b>", style_table_cell_bold), Paragraph("<b>$ 90.000,00</b>", ParagraphStyle('F1', fontName='Helvetica-Bold', fontSize=8, textColor=c_blue_dark, alignment=2)), Paragraph("<b>$ 90.000,00</b>", style_table_cell_bold), Paragraph("<b>100,00%</b>", style_table_cell_bold)]
    ]
    t_flujo = Table(flujo_data, colWidths=[45, 120, 160, 75, 75, 40])
    t_flujo.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_blue_dark),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, c_bg_card]),
        ('BACKGROUND', (0,-1), (-1,-1), c_blue_light),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_flujo)

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════════
    # PÁGINA 7: CONTRAPARTIDA, CONDICIONES COMERCIALES Y FIRMAS
    # ═══════════════════════════════════════════════════════════════════════
    story.append(Paragraph("5. CONTRAPARTIDA, CONDICIONES COMERCIALES Y PROPIEDAD INTELECTUAL", style_h1))
    story.append(HRFlowable(width="100%", thickness=1, color=c_blue, spaceBefore=2, spaceAfter=8))

    # Contrapartida del Sanatorio Argentino Box
    contra_data = [
        [
            Paragraph("<b>ESTRUCTURA DE COFINANCIAMIENTO Y CONTRAPARTIDA (SECCIONES 16 Y 17):</b><br/>"
                      "• <b>Aporte No Reembolsable (ANR Solicitado):</b> <b>USD 90.000,00</b> (Cubre el 100% de la consultoría y desarrollo provisto por Grow Labs).<br/>"
                      "• <b>Contrapartida en Especie de Sanatorio Argentino S.R.L.:</b> Valuada en <b>USD 35.000,00</b>, integrada por: "
                      "(1) Horas dedicadas de la Gerencia de Administración, Jefatura de TI y referentes médicos para entrevistas y validación funcional; "
                      "(2) Servidores on-premise, almacenamiento NAS securizado y conectividad institucional; "
                      "(3) Licencias y ambientes de pruebas réplica de SALUS y Tango.<br/>"
                      "• <b>Costo Total del Proyecto:</b> <b>USD 125.000,00</b> (El ANR financia el 72% del esfuerzo global, ratio óptimo de elegibilidad ante la ASJDI).",
                      style_callout)
        ]
    ]
    t_contra = Table(contra_data, colWidths=[515])
    t_contra.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_bg_card),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_contra)
    story.append(Spacer(1, 8))

    condiciones = [
        ("Titularidad y Propiedad Intelectual Exclusiva:",
         "Grow Labs declara y acuerda formalmente que la totalidad del código fuente, repositorios, algoritmos, prompts, bases de datos vectoriales, esquemas de integración y documentación técnica generados en el marco del proyecto PULSO-HUB serán de <b>propiedad y titularidad exclusiva de SANATORIO ARGENTINO S.R.L.</b> "
         "Se hará entrega formal del Dossier Técnico de Propiedad Intelectual (PV18) debidamente redactado para que la institución pueda tramitar su registro de software ante la Dirección Nacional del Derecho de Autor (DNDA) y/o el Instituto Nacional de la Propiedad Industrial (INPI) como un activo intangible institucional propio."),
        
        ("Transferencia Tecnológica Real y No-Dependencia:",
         "Uno de los principios rectores de Grow Labs es empoderar al cliente. Mediante el hito PV16, se capacitará exhaustivamente al equipo de Sistemas y referentes de Sanatorio Argentino en la administración, configuración de nuevos agentes, actualización de convenios y monitoreo de la plataforma, asegurando total soberanía tecnológica sin dependencia cautiva de terceros."),

        ("Régimen de Facturación y Cumplimiento Impositivo:",
         "Grow Labs emitirá <b>Facturas Electrónicas de Servicios Tipo 'A'</b> (o en la modalidad cambiaria y contractual que determine la ASJDI para convenios en dólares con liquidación oficial al momento del pago), ajustándose rigurosamente a las directrices de rendición contable y auditoría del programa ANR."),

        ("Período de Garantía Técnica y Soporte Post-Entrega:",
         "Grow Labs otorga un <b>período de garantía técnica de 90 días corridos</b> posterior a la recepción definitiva del Producto PV19. Dicha garantía cubre la corrección inmediata de inconsistencias, bugs o fallas de código atribuibles al desarrollo sin costo adicional alguno para el Sanatorio."),

        ("Vigencia de la Propuesta:",
         "La presente cotización técnica y económica mantendrá su plena vigencia por un plazo de <b>45 días corridos</b> a partir de su emisión formal.")
    ]

    for title, desc in condiciones:
        story.append(Paragraph(f"<b>• {title}</b> {desc}", style_body))
        story.append(Spacer(1, 3))

    story.append(Spacer(1, 14))

    # Firmas formales
    firmas_data = [
        [
            Paragraph("<b>POR EL PRESTADOR TÉCNICO:</b><br/><br/><br/><br/>________________________________________<br/><b>GROW LABS</b><br/>Soluciones de Software & IA<br/>Consultor Principal / Dirección Técnica", ParagraphStyle('F1', fontName='Helvetica', fontSize=7.5, leading=10, alignment=1)),
            Paragraph("<b>POR LA EMPRESA BENEFICIARIA:</b><br/><br/><br/><br/>________________________________________<br/><b>SANATORIO ARGENTINO S.R.L.</b><br/>Dirección de Administración y Finanzas<br/>Representante Legal / Apoderado", ParagraphStyle('F2', fontName='Helvetica', fontSize=7.5, leading=10, alignment=1))
        ]
    ]
    t_firmas = Table(firmas_data, colWidths=[250, 250])
    t_firmas.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('BACKGROUND', (0,0), (-1,-1), c_bg_card),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(t_firmas)

    # Construir documento
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF generado exitosamente en: {pdf_path}")
    return pdf_path

if __name__ == '__main__':
    build_pdf()

