import React from 'react';
import { Printer } from 'lucide-react';

const InstructivoTemplate = () => {
  const currentDate = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return (
    <div className="bg-gray-100 min-h-screen py-8 flex flex-col items-center justify-center print:bg-white print:py-0">
      {/* Controles para vista en pantalla (se ocultan al imprimir) */}
      <div className="mb-4 flex gap-4 print:hidden">
         <button 
           onClick={() => window.print()} 
           className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow flex items-center gap-2 hover:bg-blue-700 transition-colors"
         >
           <Printer size={18} /> Imprimir a PDF
         </button>
      </div>

      {/* Contenedor formato A4 */}
      <div className="w-[210mm] min-h-[297mm] bg-white text-black mx-auto relative shadow-xl print:shadow-none font-sans text-sm">
        
        {/* Marca de agua (transparente) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-5 z-0">
          <div className="transform -rotate-45 text-[130px] font-bold text-gray-500 whitespace-nowrap select-none">
            SANATORIO ARGENTINO
          </div>
        </div>

        {/* Padding interno para simular márgenes de hoja */}
        <div className="p-[15mm] relative z-10 flex flex-col h-full">
          
          {/* Encabezado Principal */}
          <table className="w-full border-collapse border border-black mb-4">
            <tbody>
              <tr>
                {/* Columna Izquierda - Logo e Info Institucional */}
                <td className="border border-black w-1/4 p-2 text-center align-middle">
                   <div className="flex flex-col items-center justify-center">
                     <div className="w-12 h-12 mb-2 flex items-center justify-center text-blue-600">
                        {/* Reemplazar con el logo oficial del sanatorio */}
                        <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full opacity-80">
                          <path d="M50 5C25.1 5 5 25.1 5 50s20.1 45 45 45 45-20.1 45-45S74.9 5 50 5zm0 80c-19.3 0-35-15.7-35-35S30.7 15 50 15s35 15.7 35 35-15.7 35-35 35z" opacity="0.3"/>
                          <path d="M50 25c-13.8 0-25 11.2-25 25s11.2 25 25 25 25-11.2 25-25-11.2-25-25-25zm0 40c-8.3 0-15-6.7-15-15s6.7-15 15-15 15 6.7 15 15-6.7 15-15 15z"/>
                        </svg>
                     </div>
                     <div className="text-[10px] font-bold leading-tight uppercase text-gray-800">
                       SANATORIO<br/>ARGENTINO SRL
                     </div>
                     <hr className="border-black w-full my-1" />
                     <div className="text-[10px] font-bold leading-tight uppercase text-gray-800">
                       INNOVACIÓN Y<br/>TRANSFORMACIÓN DIGITAL
                     </div>
                   </div>
                </td>

                {/* Columna Central - Título del Documento */}
                <td className="border border-black w-1/2 p-2 text-center align-middle">
                   <div className="text-sm font-semibold tracking-wide">INSTRUCTIVO:</div>
                   <div className="text-xl font-bold mt-2">SISTEMA ADMINISTRACIÓN</div>
                </td>

                {/* Columna Derecha - Código y Paginación */}
                <td className="border border-black w-1/4 p-2 text-center align-middle">
                   <div className="text-2xl font-bold tracking-wider">ITYS 23</div>
                   <div className="text-xs mt-1">Revisión Nº 01</div>
                   <div className="text-xs mt-1">Pág. 1 de 5</div>
                </td>
              </tr>
              {/* Fila Inferior - Advertencia */}
              <tr>
                <td colSpan="3" className="border border-black bg-gray-200 p-1 text-center text-[11px] font-bold uppercase tracking-wide">
                  VALIDO SOLO EN FORMATO ELECTRÓNICO – LAS COPIAS EN PAPEL CARECEN DE VALOR
                </td>
              </tr>
            </tbody>
          </table>

          {/* Tablas de Control Documental */}
          
          {/* 1. REVISIONES */}
          <table className="w-full border-collapse border border-black mb-4 text-xs">
            <thead>
              <tr>
                <th colSpan="4" className="border border-black bg-gray-200 p-1 font-bold text-left pl-2 uppercase">REVISIONES</th>
              </tr>
              <tr className="bg-gray-100">
                <th className="border border-black p-1 w-10 text-center font-semibold">Nº</th>
                <th className="border border-black p-1 text-center font-semibold">Descripción de los cambios</th>
                <th className="border border-black p-1 w-48 text-center font-semibold">Autor</th>
                <th className="border border-black p-1 w-28 text-center font-semibold">Fecha vigencia</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black p-1 text-center">00</td>
                <td className="border border-black p-1 pl-2">Versión original</td>
                <td className="border border-black p-1 text-center capitalize">lucas marinero</td>
                <td className="border border-black p-1 text-center">{currentDate}</td>
              </tr>
            </tbody>
          </table>

          {/* 2. DOCUMENTOS DE REFERENCIA */}
          <table className="w-full border-collapse border border-black mb-6 text-xs">
            <thead>
              <tr>
                <th colSpan="2" className="border border-black bg-gray-200 p-1 font-bold text-left pl-2 uppercase">DOCUMENTOS DE REFERENCIA</th>
              </tr>
              <tr className="bg-gray-100">
                <th className="border border-black p-1 w-1/4 text-center font-semibold">Código</th>
                <th className="border border-black p-1 w-3/4 text-center font-semibold">Título del documento</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black p-1 h-6"></td>
                <td className="border border-black p-1 h-6"></td>
              </tr>
            </tbody>
          </table>

          {/* Cuerpo del Documento (Contenido estructurado) */}
          <div className="flex-1 text-gray-900 text-[13px] leading-relaxed">
            
            <div className="mb-4">
              <h2 className="font-bold mb-1">1. OBJETIVO:</h2>
              <p className="pl-4 text-justify">
                Definir los pasos a realizar para la administración y configuración del <strong>Sistema de Administración</strong>. En este documento se indicarán las diferentes acciones a realizar como guía de usuario para asegurar el correcto flujo de la información.
              </p>
            </div>

            <div className="mb-4">
              <h2 className="font-bold mb-1">2. CAMPO DE APLICACIÓN:</h2>
              <p className="pl-4 text-justify">
                El presente instructivo se aplicará al equipo de Innovación y Transformación Digital y a cualquier usuario administrativo o personal de salud que haga uso del Sistema de Administración para sus operaciones diarias (admisión, liquidación, altas, etc).
              </p>
            </div>

            <div className="mb-4">
              <h2 className="font-bold mb-1">3. DEFINICIONES:</h2>
              <ul className="list-disc pl-8 space-y-1">
                <li><strong>SISTEMA ADM:</strong> Sistema principal de gestión administrativa y operativa de Sanatorio Argentino.</li>
                <li><strong>ITD:</strong> Departamento de Innovación y Transformación Digital.</li>
                <li><strong>LUP:</strong> Lección de Un Punto (instructivo rápido y visual).</li>
                <li><strong>USUARIO CLAVE:</strong> Referente de cada área capacitado para brindar soporte funcional de primer nivel.</li>
              </ul>
            </div>

            <div className="mb-4">
              <h2 className="font-bold mb-1">4. DIAGRAMA DE FLUJO DEL PROCESO:</h2>
              <p className="pl-4 mb-2 text-justify">
                A continuación se detallan los lineamientos de acceso general al módulo de administración:
              </p>
              <ol className="list-decimal pl-8 space-y-1">
                <li>Ingresar a la URL oficial del sistema de admisión.</li>
                <li>Validar credenciales de acceso mediante Supabase Auth.</li>
                <li>Navegar por los módulos disponibles según los permisos otorgados en la matriz de roles.</li>
              </ol>
            </div>
            
          </div>

          {/* Pie de Documento (Firmas) */}
          <table className="w-full border-collapse border border-black mt-auto text-[11px] h-28 table-fixed">
            <tbody>
              <tr>
                <td className="border border-black w-1/3 p-2 align-top relative">
                  <div className="mb-14">ELABORADO:</div>
                  <div className="absolute bottom-2 left-0 w-full text-center">
                    <div className="font-bold capitalize">lucas marinero</div>
                    <div className="text-[10px] text-gray-600">Innovación y Transformación Digital</div>
                  </div>
                </td>
                <td className="border border-black w-1/3 p-2 align-top relative">
                  <div className="mb-14">REVISADO:</div>
                  <div className="absolute bottom-2 left-0 w-full text-center">
                    <div className="font-bold">Gabriela Iragorre</div>
                    <div className="text-[10px] text-gray-600">Responsable Documentos SGC</div>
                  </div>
                </td>
                <td className="border border-black w-1/3 p-2 align-top relative">
                  <div className="mb-14">APROBADO:</div>
                  <div className="absolute bottom-2 left-0 w-full text-center">
                    <div className="font-bold">Dr. Carlos Buteler</div>
                    <div className="text-[10px] text-gray-600">Director Médico</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

        </div>
      </div>
    </div>
  );
};

export default InstructivoTemplate;
