// ==========================================
// ESTADO GLOBAL
// ==========================================
const SHEET_ID = '1njOr6ofptBELf1Ja7Hw4w7HakcOqqkagAnZta4nBGVA';
// Registro Fotos siempre debe leer REPORTE_FOTOS, no la pestaña predeterminada.
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=REPORTE_FOTOS`;

// Navegación Sidebar
let isSidebarOpen = false;
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    isSidebarOpen = !isSidebarOpen;
    
    if (isSidebarOpen) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        // Pequeño delay para la opacidad
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

function cambiarVista(vista, esManual = true) {
    const viewRegistro   = document.getElementById('view-registro');
    const viewAsistencia = document.getElementById('view-asistencia');
    const viewMetrados   = document.getElementById('view-metrados');
    const btnRegistro    = document.getElementById('btn-nav-registro');
    const btnAsistencia  = document.getElementById('btn-nav-asistencia');
    const btnMetrados    = document.getElementById('btn-nav-metrados');
    const btnExportWord  = document.getElementById('btn-export-word');
    
    // Guardar en session
    sessionStorage.setItem('vistaActual', vista);

    // Si fue un cambio de ventana del usuario, limpiamos los filtros de la ventana de destino
    if (esManual) {
        if (vista === 'registro')   limpiarFiltrosRegistro();
        if (vista === 'asistencia' && typeof limpiarFiltrosAsistencia === 'function') limpiarFiltrosAsistencia();
        if (vista === 'metrados'   && typeof limpiarFiltrosMetrados   === 'function') limpiarFiltrosMetrados();
    }

    // Estilos activos
    const clsActive   = ['bg-[#0ea5e9]/10', 'text-[#0ea5e9]'];
    const clsInactive = ['text-slate-600', 'hover:bg-slate-100'];

    // Ocultar todas las vistas y desactivar todos los botones
    [viewRegistro, viewAsistencia, viewMetrados].forEach(v => v && v.classList.add('hidden'));
    [btnRegistro, btnAsistencia, btnMetrados].forEach(b => {
        if (!b) return;
        b.classList.remove(...clsActive);
        b.classList.add(...clsInactive);
    });

    const headerMain       = document.getElementById('header-actions-main');
    const headerAsistencia = document.getElementById('header-actions-asistencia');

    if (vista === 'registro') {
        viewRegistro && viewRegistro.classList.remove('hidden');
        btnRegistro  && (btnRegistro.classList.remove(...clsInactive), btnRegistro.classList.add(...clsActive));
        headerMain       && headerMain.classList.remove('hidden');
        headerAsistencia && headerAsistencia.classList.add('hidden');
        btnExportWord    && btnExportWord.classList.add('hidden');
        cargarDatos();
        
    } else if (vista === 'asistencia') {
        viewAsistencia && viewAsistencia.classList.remove('hidden');
        btnAsistencia  && (btnAsistencia.classList.remove(...clsInactive), btnAsistencia.classList.add(...clsActive));
        headerMain       && headerMain.classList.add('hidden');
        headerAsistencia && headerAsistencia.classList.remove('hidden');
        if (typeof cargarDatosAsistencia === 'function') cargarDatosAsistencia();

    } else if (vista === 'metrados') {
        viewMetrados && viewMetrados.classList.remove('hidden');
        btnMetrados  && (btnMetrados.classList.remove(...clsInactive), btnMetrados.classList.add(...clsActive));
        headerMain       && headerMain.classList.remove('hidden');
        headerAsistencia && headerAsistencia.classList.add('hidden');
        btnExportWord    && btnExportWord.classList.remove('hidden');
        if (typeof inicializarMetrados === 'function') inicializarMetrados();
    }
    
    if (window.innerWidth < 1024 && isSidebarOpen) toggleSidebar();
}

let datosGlobales = [];
let datosFiltrados = [];
let paginaActual = 1;
const itemsPorPagina = 25;
let criteriosOrdenamiento = []; // NUEVO ESTADO MULTI-SORT

// IMPORTANTE: URL del Web App de Google Apps Script para generar ZIPs
// Una vez publiques tu Script, pega la URL aquí:
const GAS_ZIP_URL = "https://script.google.com/macros/s/AKfycbyDCCaKC7tOQoGJRZ6rMfUXkWevAfXnYf1Hj-c5Bz8fRXJ3UWvi6krePpzgv0GVgKeN2w/exec";

// IMPORTANTE: URL del Web App de Google Apps Script para las Miniaturas
// Pega aquí la URL de tu segundo Apps Script:
const GAS_THUMBS_URL = "https://script.google.com/macros/s/AKfycby3n2oEBpKtFzLxv_kw8mfTpV-TDJRwxQFwzZ2pwcSgCh0JXRzhUh3szx04YXpZ63tK/exec";

// Evita volver a pedir fotos al ordenar, filtrar o regresar de página.
const CACHE_MINIATURAS_REG = new Map();
const MAX_CACHE_MINIATURAS_REG = 150;
const TAMANO_LOTE_MINIATURAS_REG = 20;

// Elementos del DOM
const dom = {
    tablaBody: document.getElementById('tabla-body'),
    loading: document.getElementById('loading-overlay'),
    counter: document.getElementById('counter-info'),
    
    // Filtros
    fGrupo: document.getElementById('filter-grupo'),
    fUsuario: document.getElementById('filter-usuario'),
    fDescripcion: document.getElementById('filter-descripcion'),
    fFechaOp: document.getElementById('filter-fecha-op'),
    fFechaVal: document.getElementById('filter-fecha-val'),
    
    // Contadores Exportación y Búsqueda
    btnBuscar: document.getElementById('btn-buscar'),
    btnXlsx: document.getElementById('btn-export-xlsx'),
    btnZip: document.getElementById('btn-download-zip'),
    
    // Paginación
    btnPrev: document.getElementById('btn-prev-page'),
    btnNext: document.getElementById('btn-next-page'),
    pagInfo: document.getElementById('pagination-info')
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    configurarEventos();
    
    // Restaurar vista y cargar solo los datos de esa vista (esManual = false)
    const vistaGuardada = sessionStorage.getItem('vistaActual') || 'registro';
    cambiarVista(vistaGuardada, false);
});

function limpiarFiltrosRegistro() {
    // Borrar filtros de sessionStorage
    sessionStorage.removeItem('fGrupo');
    sessionStorage.removeItem('fUsuario');
    sessionStorage.removeItem('fDescripcion');
    sessionStorage.removeItem('fFechaOp');
    sessionStorage.removeItem('fFechaVal');
    
    // Resetear controles visuales
    dom.fGrupo.value = 'ALL';
    dom.fUsuario.value = 'ALL';
    dom.fDescripcion.value = '';
    dom.fFechaOp.value = 'ALL';
    dom.fFechaVal.value = '';
    
    // Resetear ordenamiento multi-criterio y su UI
    criteriosOrdenamiento = [];
    renderSortUI();
}

function configurarEventos() {
    // Filtros: Ya no disparan "aplicarFiltros" al instante, solo cambian su estilo visual si quieres.
    // Ahora todo se dispara al presionar el botón "Buscar".
    dom.btnBuscar.addEventListener('click', aplicarFiltros);
    
    // Permitir buscar al presionar "Enter" en la caja de descripción
    dom.fDescripcion.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            aplicarFiltros();
        }
    });
    
    // Exportaciones
    dom.btnXlsx.addEventListener('click', () => {
        const vista = sessionStorage.getItem('vistaActual');
        if (vista === 'metrados' && typeof exportarXLSXMet === 'function') exportarXLSXMet();
        else exportarXLSX();
    });
    dom.btnZip.addEventListener('click', () => {
        const vista = sessionStorage.getItem('vistaActual');
        if (vista === 'metrados' && typeof descargarFotosMet === 'function') descargarFotosMet();
        else descargarFotosVisibles();
    });
    
    // Paginación
    dom.btnPrev.addEventListener('click', () => cambiarPagina(-1));
    dom.btnNext.addEventListener('click', () => cambiarPagina(1));
}

// ==========================================
// CARGA Y PARSEO DE DATOS
// ==========================================
function cargarDatos() {
    Papa.parse(CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            datosGlobales = procesarDatos(results.data);
            datosFiltrados = [...datosGlobales];
            
            poblarSelectores();
            
            // ==============================================================
            // Restaurar filtros desde sessionStorage (si existen)
            // ==============================================================
            if(sessionStorage.getItem('fGrupo')) dom.fGrupo.value = sessionStorage.getItem('fGrupo');
            if(sessionStorage.getItem('fUsuario')) dom.fUsuario.value = sessionStorage.getItem('fUsuario');
            if(sessionStorage.getItem('fDescripcion')) dom.fDescripcion.value = sessionStorage.getItem('fDescripcion');
            if(sessionStorage.getItem('fFechaOp')) dom.fFechaOp.value = sessionStorage.getItem('fFechaOp');
            if(sessionStorage.getItem('fFechaVal')) dom.fFechaVal.value = sessionStorage.getItem('fFechaVal');

            aplicarFiltros();
            
            dom.loading.classList.add('hidden');
        },
        error: (error) => {
            console.error('Error:', error);
            dom.loading.innerHTML = `<p class="text-red-500 font-bold">Error al cargar datos. Revisa la conexión.</p>`;
        }
    });
}

function procesarDatos(raw) {
    return raw.map(fila => {
        // Tolera BOM, espacios o cambios de mayúsculas en encabezados.
        const normalizada = {};
        Object.keys(fila || {}).forEach(k => {
            normalizada[String(k).replace(/^\uFEFF/, '').trim().toUpperCase()] = fila[k];
        });
        const valor = (...nombres) => {
            for (const nombre of nombres) {
                const dato = normalizada[nombre];
                if (dato !== undefined && dato !== null) return String(dato).trim();
            }
            return '';
        };
        const desc = valor('DESCRIPCION');
        // Extraer el 'Tiempo' (última línea de la descripción si existe)
        const lineasDesc = desc.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let tiempoExtrayido = "Sin definir";
        
        if (lineasDesc.length > 0) {
            const ultima = lineasDesc[lineasDesc.length - 1].toLowerCase();
            if (ultima.includes('antes') || ultima.includes('durante') || ultima.includes('despu')) {
                tiempoExtrayido = lineasDesc[lineasDesc.length - 1]; // Mantener capitalización original si se desea, o normalizar
            }
        }

        return {
            grupo: valor('GRUPO'),
            usuario: valor('USUARIO').replace(/\s+/g, ' ').toUpperCase(),
            fecha: valor('FECHA'),
            descripcion: desc,
            tiempo: tiempoExtrayido,
            zona: valor('ZONA_UTM'),
            utmNorte: valor('UTM_NORTE'),
            utmEste: valor('UTM_ESTE'),
            driveId: valor('DRIVE_FILE_ID'),
            nombreFoto: valor('NOMBRE_FOTO')
        };
    });
}

function guardarMiniaturaRegistro(id, dataUrl) {
    if (!id || !dataUrl) return;
    if (CACHE_MINIATURAS_REG.has(id)) CACHE_MINIATURAS_REG.delete(id);
    CACHE_MINIATURAS_REG.set(id, dataUrl);
    while (CACHE_MINIATURAS_REG.size > MAX_CACHE_MINIATURAS_REG) {
        CACHE_MINIATURAS_REG.delete(CACHE_MINIATURAS_REG.keys().next().value);
    }
}

function poblarSelectores() {
    // Extraer valores únicos y ordenados
    const grupos = [...new Set(datosGlobales.map(d => d.grupo).filter(Boolean))].sort();
    const usuarios = [...new Set(datosGlobales.map(d => d.usuario).filter(Boolean))].sort();

    // Resetear selects antes de poblarlos (evita duplicación en recarga)
    dom.fGrupo.innerHTML = '<option value="ALL">Todos</option>';
    dom.fUsuario.innerHTML = '<option value="ALL">Todos</option>';

    grupos.forEach(g => dom.fGrupo.add(new Option(g, g)));
    usuarios.forEach(u => dom.fUsuario.add(new Option(u, u)));
}

// ==========================================
// HELPER: Extraer clave de ordenamiento del nombre de foto
// Formato esperado: TIMEPHOTO_AAAAMMDD_HHMMSS.JPG (o variaciones)
// Extrae la parte "AAAAMMDD_HHMMSS" que es comparable lexicográficamente
// ==========================================
function extraerClaveFoto(nombreFoto) {
    if (!nombreFoto) return '';
    // Quitar extensión
    const sinExt = nombreFoto.replace(/\.[^.]+$/, '');
    // Intentar extraer patron: 8 dígitos seguidos de _ y 6 dígitos (AAAAMMDD_HHMMSS)
    const match = sinExt.match(/(\d{8}[_\-]\d{6})/);
    if (match) return match[1]; // "20260626_143022" → comparable directamente
    // Fallback: usar el nombre completo sin extensión
    return sinExt;
}

// ==========================================
// FILTRADO Y ORDENAMIENTO
// ==========================================
function aplicarFiltros() {
    const valGrupo = dom.fGrupo.value;
    const valUsuario = dom.fUsuario.value;
    const valDesc = dom.fDescripcion.value.toLowerCase().trim();
    const valFechaOp = dom.fFechaOp.value;
    const valFechaVal = dom.fFechaVal.value;

    const palabrasDesc = valDesc ? valDesc.split(/\s+/) : [];

    // ==============================================================
    // Guardar filtros actuales en sessionStorage
    // ==============================================================
    sessionStorage.setItem('fGrupo', valGrupo);
    sessionStorage.setItem('fUsuario', valUsuario);
    sessionStorage.setItem('fDescripcion', dom.fDescripcion.value);
    sessionStorage.setItem('fFechaOp', valFechaOp);
    sessionStorage.setItem('fFechaVal', valFechaVal);

    datosFiltrados = datosGlobales.filter(d => {
        const matchGrupo = valGrupo === 'ALL' || d.grupo === valGrupo;
        const matchUsuario = valUsuario === 'ALL' || d.usuario === valUsuario;
        
        const descMinuscula = d.descripcion.toLowerCase();
        const matchDesc = palabrasDesc.length === 0 || palabrasDesc.every(p => descMinuscula.includes(p));
        
        let matchFecha = true;
        if (valFechaOp !== 'ALL' && valFechaVal) {
            // Se comparan como strings alfabéticos (ISO 8601: YYYY-MM-DD permite esto)
            if (valFechaOp === 'eq') matchFecha = d.fecha === valFechaVal;
            else if (valFechaOp === 'gte') matchFecha = d.fecha >= valFechaVal;
            else if (valFechaOp === 'lte') matchFecha = d.fecha <= valFechaVal;
        }

        return matchGrupo && matchUsuario && matchDesc && matchFecha;
    });

    // ==============================================================
    // Ordenamiento Multicriterio Dinámico
    // ==============================================================
    if (criteriosOrdenamiento.length === 0) {
        // Orden por defecto: por nombre de foto (TIMEPHOTO_AAAAMMDD_HHMMSS.JPG) de más reciente a más antiguo
        datosFiltrados.sort((a, b) => {
            const keyA = extraerClaveFoto(a.nombreFoto);
            const keyB = extraerClaveFoto(b.nombreFoto);
            if (!keyA && !keyB) return 0;   // ambos vacíos: indiferente
            if (!keyA) return 1;             // A sin foto → va al final
            if (!keyB) return -1;            // B sin foto → va al final
            return keyB.localeCompare(keyA); // más reciente arriba
        });
    } else {
        datosFiltrados.sort((a, b) => {
            for (let i = 0; i < criteriosOrdenamiento.length; i++) {
                const crit = criteriosOrdenamiento[i];
                let valA = a[crit.columna] || '';
                let valB = b[crit.columna] || '';
                
                if (valA !== valB) {
                    if (crit.dir === 'asc') return valA.localeCompare(valB, undefined, {numeric: true});
                    else return valB.localeCompare(valA, undefined, {numeric: true});
                }
            }
            // Desempate final: usar nombre de foto (fecha+hora exacta). Sin foto → al final.
            const keyA = extraerClaveFoto(a.nombreFoto);
            const keyB = extraerClaveFoto(b.nombreFoto);
            if (!keyA && !keyB) return 0;
            if (!keyA) return 1;
            if (!keyB) return -1;
            // La dirección del desempate sigue la del último criterio activo
            const ultimaDir = criteriosOrdenamiento[criteriosOrdenamiento.length - 1].dir;
            return ultimaDir === 'asc' ? keyA.localeCompare(keyB) : keyB.localeCompare(keyA);
        });
    }

    paginaActual = 1; // Resetear página al filtrar/ordenar
    renderizarTabla();
}

// ==========================================
// FUNCIONES DE INTERFAZ Y ORDENAMIENTO UI
// ==========================================
function toggleSort(columna) {
    const idx = criteriosOrdenamiento.findIndex(c => c.columna === columna);
    
    if (idx === -1) {
        // Estado 0 -> Estado 1 (Ascendente)
        criteriosOrdenamiento.push({ columna: columna, dir: 'asc' });
    } else {
        if (criteriosOrdenamiento[idx].dir === 'asc') {
            // Estado 1 -> Estado 2 (Descendente)
            criteriosOrdenamiento[idx].dir = 'desc';
        } else {
            // Estado 2 -> Estado 0 (Desactivar)
            criteriosOrdenamiento.splice(idx, 1);
        }
    }
    
    renderSortUI();
    aplicarFiltros();
}

function renderSortUI() {
    const columnasPosibles = ['grupo', 'usuario', 'fecha', 'descripcion', 'utmNorte', 'utmEste', 'nombreFoto'];
    
    columnasPosibles.forEach(col => {
        const circuloPri = document.getElementById(`sort-pri-${col}`);
        const btnFondo = document.getElementById(`sort-btn-${col}`);
        const icono = document.getElementById(`sort-icon-${col}`);
        
        if (!circuloPri || !btnFondo || !icono) return;
        
        const idx = criteriosOrdenamiento.findIndex(c => c.columna === col);
        
        if (idx === -1) {
            // Estado 0: Desactivado
            circuloPri.className = "absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold text-white bg-transparent opacity-0 transition-all";
            circuloPri.textContent = '';
            
            btnFondo.className = "absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center bg-transparent text-slate-300 transition-colors";
            icono.style.transform = 'rotate(0deg)';
        } else {
            // Activo
            const prioridad = idx + 1;
            circuloPri.textContent = prioridad;
            
            const dir = criteriosOrdenamiento[idx].dir;
            if (dir === 'asc') {
                // Estado 1: Ascendente (A-Z) -> Azul Metálico (slate-700)
                circuloPri.className = "absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold text-white bg-slate-700 opacity-100 shadow-md transition-all";
                btnFondo.className = "absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center text-white bg-slate-700 shadow-sm transition-colors";
                icono.style.transform = 'rotate(180deg)'; // Flecha abajo (creciente hacia abajo)
            } else {
                // Estado 2: Descendente (Z-A) -> Verde (emerald-500)
                circuloPri.className = "absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold text-white bg-emerald-500 opacity-100 shadow-md transition-all";
                btnFondo.className = "absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center text-white bg-emerald-500 shadow-sm transition-colors";
                icono.style.transform = 'rotate(0deg)'; // Flecha arriba (creciente hacia arriba)
            }
        }
    });
}

function cambiarPagina(delta) {
    const totalPaginas = Math.ceil(datosFiltrados.length / itemsPorPagina);
    const nuevaPagina = paginaActual + delta;
    
    if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
        paginaActual = nuevaPagina;
        renderizarTabla();
        // Subir scroll al principio de la tabla
        document.getElementById('main-container').scrollTo({top: 0, behavior: 'smooth'});
    }
}

async function renderizarTabla() {
    dom.tablaBody.innerHTML = '';
    dom.counter.innerText = `Filtro actual: ${datosFiltrados.length} registros`;

    // Deshabilitar botones si no hay datos
    const hayDatos = datosFiltrados.length > 0;
    if (dom.btnXlsx) dom.btnXlsx.disabled = !hayDatos;
    dom.btnZip.disabled = !hayDatos;

    if (!hayDatos) {
        dom.tablaBody.innerHTML = `<tr><td colspan="8" class="text-center py-12 text-slate-500">No se encontraron resultados para estos filtros.</td></tr>`;
        dom.pagInfo.innerText = "Mostrando 0 a 0 de 0 registros";
        dom.btnPrev.disabled = true;
        dom.btnNext.disabled = true;
        return;
    }

    // Calcular índices de paginación
    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = Math.min(inicio + itemsPorPagina, datosFiltrados.length);
    const paginaDatos = datosFiltrados.slice(inicio, fin);
    
    // Actualizar controles UI de paginación
    const totalPaginas = Math.ceil(datosFiltrados.length / itemsPorPagina);
    dom.pagInfo.innerText = `Mostrando ${inicio + 1} a ${fin} de ${datosFiltrados.length} registros (Pág ${paginaActual}/${totalPaginas})`;
    dom.btnPrev.disabled = paginaActual === 1;
    dom.btnNext.disabled = paginaActual === totalPaginas;

    // PRIMERA FASE: Dibujar la tabla con Spinners (Cargando)
    const contenedoresFotos = [];
    paginaDatos.forEach((fila, index) => {
        const globalIndex = inicio + index + 1;
        const tr = document.createElement('tr');
        tr.className = 'tabla-fila bg-white hover:bg-brand-50 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 z-10 relative cursor-default';

        let htmlFoto;
        if (fila.driveId) {
            // El índice evita IDs HTML duplicados si una foto se repite.
            const containerId = `foto-container-${globalIndex}-${fila.driveId}`;
            contenedoresFotos.push({ id: fila.driveId, containerId });
            htmlFoto = `
            <div class="relative w-full h-24 flex items-center justify-center bg-slate-50" id="${containerId}">
                <span class="nombre-foto-oculto">${fila.nombreFoto || ''}</span>
                <svg class="animate-spin h-6 w-6 text-brand-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            </div>`;
        } else {
            htmlFoto = `<span class="text-slate-400 italic text-xs">Sin foto</span>`;
        }

        tr.innerHTML = `
            <td class="px-2 py-4 w-6 text-center">
                <div class="font-bold text-slate-500">${globalIndex}</div>
            </td>
            <td class="px-2 py-4 text-center border-l border-slate-300">
                <div class="texto-vertical mx-auto font-medium text-slate-800">${fila.grupo || '-'}</div>
            </td>
            <td class="px-2 py-4 text-center border-l border-slate-300">
                <div class="texto-vertical mx-auto text-slate-600">${fila.usuario || '-'}</div>
            </td>
            <td class="px-2 py-4 text-center border-l border-slate-300">
                <div class="texto-vertical mx-auto text-slate-500 font-mono text-sm">${fila.fecha || '-'}</div>
            </td>
            <td class="px-6 py-4 w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words border-l border-slate-300">
                <div class="text-sm text-slate-700 leading-relaxed">${fila.descripcion ? fila.descripcion.replace(/\n/g, '<br>') : '-'}</div>
            </td>
            <td class="px-2 py-4 text-center border-l border-slate-300">
                <div class="texto-vertical mx-auto text-slate-500 font-mono text-sm">${fila.utmNorte || '-'}</div>
            </td>
            <td class="px-2 py-4 text-center border-l border-slate-300">
                <div class="texto-vertical mx-auto text-slate-500 font-mono text-sm">${fila.utmEste || '-'}</div>
            </td>
            <td class="celda-foto border-l border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer" onclick="abrirEnDrive('${fila.driveId}')">
                ${htmlFoto}
            </td>
        `;

        dom.tablaBody.appendChild(tr);
    });

    // SEGUNDA FASE: Cargar fotos en Lote (Batching) vía Apps Script
    const idsBatch = [...new Set(contenedoresFotos.map(({ id }) => id))];
    const pintarMiniaturas = (fuente) => {
        contenedoresFotos.forEach(({ id, containerId }) => {
            const container = document.getElementById(containerId);
            if (container && fuente[id]) {
                container.innerHTML = `<span class="nombre-foto-oculto">Oculto</span><img src="${fuente[id]}" loading="lazy" class="foto-miniatura">`;
            }
        });
    };
    const enCache = Object.fromEntries(CACHE_MINIATURAS_REG.entries());
    pintarMiniaturas(enCache);
    const idsPendientes = idsBatch.filter(id => !CACHE_MINIATURAS_REG.has(id));

    if (idsPendientes.length > 0 && GAS_THUMBS_URL !== "PEGAR_AQUI_LA_URL_DEL_SCRIPT_MINIATURAS") {
        // Mismo patrón validado en Metrados: la respuesta del Apps Script se
        // procesa de 20 fotos y se pinta antes de solicitar el lote siguiente.
        for (let i = 0; i < idsPendientes.length; i += TAMANO_LOTE_MINIATURAS_REG) {
            const lote = idsPendientes.slice(i, i + TAMANO_LOTE_MINIATURAS_REG);
            try {
                const resp = await fetch(GAS_THUMBS_URL, {
                    method: 'POST',
                    body: JSON.stringify({ ids: lote })
                });
                const data = await resp.json();
                if (data.success && data.data) {
                    Object.entries(data.data).forEach(([id, dataUrl]) => guardarMiniaturaRegistro(id, dataUrl));
                    pintarMiniaturas(data.data);
                }
            } catch (error) {
                console.error('Error al cargar un lote de fotos de Registro:', error);
            }

            // Solo los elementos del lote que fallaron muestran respaldo; los
            // demás lotes continúan cargando sin bloquear la página completa.
            lote.forEach(id => {
                if (CACHE_MINIATURAS_REG.has(id)) return;
                contenedoresFotos.filter(item => item.id === id).forEach(({ containerId }) => {
                    const container = document.getElementById(containerId);
                    if (container) container.innerHTML = `<span class="text-xs text-slate-400 font-medium">🔗 Ver Foto</span>`;
                });
            });
        }
    }
}

// ==========================================
// VISOR DE FOTOGRAFÍA (DRIVE NATIVO)
// ==========================================
function abrirEnDrive(id) {
    if (!id || id === 'undefined') return;
    
    // Abrimos siempre la vista nativa de Google Drive en una nueva pestaña
    window.open(`https://drive.google.com/file/d/${id}/view`, '_blank');
}

// ==========================================
// EXPORTACIÓN ZIP (APPS SCRIPT)
// ==========================================

async function descargarFotosVisibles() {
    if (datosFiltrados.length === 0) return;

    // Filtramos solo los registros que tienen fotos (driveId válido)
    const fotos = datosFiltrados.filter(d => d.driveId).map((fila, index) => {
        return {
            id: fila.driveId,
            nombre: fila.nombreFoto || `Evidencia_${fila.grupo}_${fila.fecha}_${index+1}.jpg`
        };
    });

    const total = fotos.length;
    if (total === 0) { alert('No hay fotos para descargar en el filtro actual.'); return; }

    const confirmacion = confirm(`¿Descargar ${total} foto(s) en un ZIP?\nUsaremos el servidor en la nube para procesar esto al instante.`);
    if (!confirmacion) return;

    if (GAS_ZIP_URL === "PEGAR_AQUI_LA_URL_DEL_SCRIPT") {
        alert("¡Alto! Aún no has pegado la URL del Apps Script en el código (script.js).");
        return;
    }

    const originalText = dom.btnZip.innerHTML;
    
    // Mostramos estado de carga general
    dom.btnZip.innerHTML = `<div class="loader" style="width:16px;height:16px;border-width:2px;border-color:white;border-top-color:transparent;"></div> Compilando en la nube...`;
    dom.btnZip.disabled = true;

    try {
        const response = await fetch(GAS_ZIP_URL, {
            method: 'POST',
            body: JSON.stringify({
                archivos: fotos,
                nombreZip: `Evidencias_${new Date().toISOString().slice(0,10)}.zip`
            })
        });

        const result = await response.json();

        if (result.success && result.downloadUrl) {
            // Éxito: Google nos devolvió el link del ZIP listo
            window.location.href = result.downloadUrl;
        } else {
            // Error devuelto por el Script
            alert('Hubo un error al generar el ZIP en el servidor:\n' + (result.error || 'Desconocido'));
        }

    } catch (error) {
        console.error('Error de red al solicitar ZIP:', error);
        alert('Error de conexión con el servidor de Google Apps Script. Revisa la consola.');
    } finally {
        // Restauramos el botón
        dom.btnZip.innerHTML = originalText;
        dom.btnZip.disabled = false;
    }
}

// ==========================================
// REGISTRO SERVICE WORKER (PWA)
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado con éxito: ', reg.scope))
            .catch(err => console.log('Fallo al registrar el Service Worker: ', err));
    });
}


/* Exportación PDF retirada del encabezado compartido el 2026-09-01.
   Se conserva temporalmente este bloque como referencia interna; no se carga
   ni se puede ejecutar desde la interfaz. */
/*
async function exportarPDF() {
    if (datosFiltrados.length === 0) {
        alert("No hay registros para exportar.");
        return;
    }

    const total = datosFiltrados.length;
    const confirmacion = confirm(`¿Descargar PDF con ${total} registro(s)?\nTiempo estimado: ~${Math.ceil((total * 0.5) / 60)} min porque descargará las fotos para incrustarlas.`);
    if (!confirmacion) return;

    const originalText = dom.btnPdf.innerHTML;
    const esperar = (ms) => new Promise(r => setTimeout(r, ms));

    // Helper para cargar imagen y convertir a base64 DataURL (Formato PNG mantiene transparencia)
    const urlToDataURL = (url, isJpeg = false) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL(isJpeg ? 'image/jpeg' : 'image/png', 0.8));
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });
    };

    try {
        dom.btnPdf.innerHTML = `<div class="loader" style="width:16px;height:16px;border-width:2px;border-color:white;border-top-color:transparent;"></div> Preparando PDF...`;

        // Precargar logos (en formato PNG para respetar transparencia)
        const logoData = await urlToDataURL('LOGOS/LOGO_FINAL.png', false);
        const iconData = await urlToDataURL('LOGOS/ICONO_pdf.png', false);

        // ==============================================================
        // NUEVA LOGICA: Pedir imágenes seguras al Servidor de Miniaturas
        // ==============================================================
        dom.btnPdf.innerHTML = `<div class="loader" style="width:16px;height:16px;border-width:2px;border-color:white;border-top-color:transparent;"></div> Autorizando fotos...`;
        
        const todosLosIds = datosFiltrados.map(d => d.driveId).filter(id => id);
        const mapaBase64 = {}; // Aquí guardaremos las imágenes en Base64 devueltas por el servidor

        if (GAS_THUMBS_URL !== "PEGAR_AQUI_LA_URL_DEL_SCRIPT_MINIATURAS" && todosLosIds.length > 0) {
            const tamanoLote = 50; // Descargamos de 50 en 50 para no saturar
            let lotesProcesados = 0;
            const totalLotes = Math.ceil(todosLosIds.length / tamanoLote);

            for (let i = 0; i < todosLosIds.length; i += tamanoLote) {
                lotesProcesados++;
                dom.btnPdf.innerHTML = `<div class="loader" style="width:16px;height:16px;border-width:2px;border-color:white;border-top-color:transparent;"></div> Descargando fotos seguras (Lote ${lotesProcesados}/${totalLotes})...`;
                
                const loteIds = todosLosIds.slice(i, i + tamanoLote);
                try {
                    const resp = await fetch(GAS_THUMBS_URL, {
                        method: 'POST',
                        body: JSON.stringify({ ids: loteIds })
                    });
                    const data = await resp.json();
                    
                    // El servidor V1 nos devuelve directamente el Base64 listo para el PDF
                    if (data.success && data.data) {
                        Object.assign(mapaBase64, data.data);
                    }
                } catch (err) {
                    console.error("Error pidiendo lote al servidor de miniaturas:", err);
                }
            }
        }

        // ==============================================================
        // Construir la lista final fusionando los Base64 seguros
        // ==============================================================
        dom.btnPdf.innerHTML = `<div class="loader" style="width:16px;height:16px;border-width:2px;border-color:white;border-top-color:transparent;"></div> Compilando datos...`;
        const filasConBase64 = [];
        
        for (let i = 0; i < datosFiltrados.length; i++) {
            const fila = datosFiltrados[i];
            let base64Foto = null;

            if (fila.driveId && mapaBase64[fila.driveId]) {
                // Ya tenemos la foto segura en Base64 devuelta por Apps Script
                base64Foto = mapaBase64[fila.driveId];
            }

            filasConBase64.push({
                ...fila,
                base64Foto: base64Foto
            });
        }

        dom.btnPdf.innerHTML = `<div class="loader" style="width:16px;height:16px;border-width:2px;border-color:white;border-top-color:transparent;"></div> Generando archivo PDF...`;

        // Iniciar jsPDF (Portrait, pts, A4) para respetar estética vertical
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'pt', 'a4');

        // Columnas que queremos verticales (como en pantalla)
        const verticalCols = [1, 2, 3, 5, 6];

        const tableData = filasConBase64.map((d, index) => [
            index + 1,
            d.grupo || '-',
            d.usuario || '-',
            d.fecha || '-',
            d.descripcion || '-',
            d.utmNorte || '-',
            d.utmEste || '-',
            d.base64Foto ? '' : 'Sin foto'
        ]);

        doc.autoTable({
            head: [['Ítem', 'Grupo', 'Usuario', 'Fecha', 'Descripción', 'UTM Norte', 'UTM Este', 'Evidencia Fotográfica']],
            body: tableData,
            startY: 70, // Espacio para logos
            theme: 'grid',
            styles: { fontSize: 8, valign: 'middle', halign: 'center', cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.5 },
            headStyles: { fillColor: [11, 19, 43], textColor: [255, 255, 255], minCellHeight: 60 },
            columnStyles: {
                0: { cellWidth: 25 },
                4: { cellWidth: 'auto', halign: 'left' }, // Descripción ocupa el espacio restante
                7: { cellWidth: 100 }, // Foto
                // Columnas verticales más delgadas
                1: { cellWidth: 25 },
                2: { cellWidth: 25 },
                3: { cellWidth: 25 },
                5: { cellWidth: 30 },
                6: { cellWidth: 30 }
            },
            rowPageBreak: 'avoid',
            didDrawPage: function (data) {
                // Header Logos SOLO en la primera hoja (data.pageNumber es la página que se está dibujando ahora)
                if (data.pageNumber === 1) {
                    if (iconData) doc.addImage(iconData, 'PNG', 40, 20, 25, 30);
                    if (logoData) doc.addImage(logoData, 'PNG', 75, 25, 90, 20);
                }
                
                // Footer con número de página correcto
                let str = "Página " + data.pageNumber;
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 15);
            },
            didParseCell: function(data) {
                // Dar alto a filas con foto o a las celdas verticales
                if (data.section === 'body') {
                    const rowData = filasConBase64[data.row.index];
                    if (rowData.base64Foto) {
                        data.cell.styles.minCellHeight = 85;
                    } else {
                        data.cell.styles.minCellHeight = 70; // mínimo para texto vertical
                    }
                }
            },
            willDrawCell: function (data) {
                // Ocultar texto normal si la columna es vertical
                if (verticalCols.includes(data.column.index)) {
                    // Solo guardamos si el array tiene algo, para que en la hoja 2 no se borre el customText
                    if (data.cell.text && data.cell.text.length > 0) {
                        data.cell.customText = data.cell.text.join(' ');
                    }
                    data.cell.text = []; // Vaciar array para que autoTable no lo dibuje horizontal
                }
            },
            didDrawCell: function (data) {
                // Dibujar texto vertical manualmente
                if (verticalCols.includes(data.column.index) && data.cell.customText) {
                    doc.setTextColor(data.section === 'head' ? 255 : 50);
                    doc.setFontSize(data.cell.styles.fontSize);
                    // Coordenadas para dibujar desde abajo hacia arriba (ángulo 90 counter-clockwise)
                    const textWidth = doc.getTextWidth(data.cell.customText);
                    const x = data.cell.x + (data.cell.width / 2) + 3; // +3 para centrar baseline
                    // Iniciar un poco más arriba del borde inferior
                    const y = data.cell.y + data.cell.height - ((data.cell.height - textWidth)/2); 
                    
                    doc.text(data.cell.customText, x, y, { angle: 90 });
                }

                // Dibujar foto incrustada
                if (data.section === 'body' && data.column.index === 7) {
                    const rowData = filasConBase64[data.row.index];
                    if (rowData.base64Foto) {
                        const imgW = 90;
                        const imgH = 75;
                        const x = data.cell.x + (data.cell.width - imgW) / 2;
                        const y = data.cell.y + (data.cell.height - imgH) / 2;
                        
                        try {
                            doc.addImage(rowData.base64Foto, 'JPEG', x, y, imgW, imgH);
                        } catch(e) {
                            console.error("Error al incrustar imagen PDF", e);
                        }
                    }
                }
            }
        });

        doc.save(`Reporte_Evidencias_${new Date().toISOString().slice(0,10)}.pdf`);
        alert('✅ PDF generado con éxito.');

    } catch (e) {
        console.error("Error al exportar PDF:", e);
        alert('Hubo un error al generar el PDF. Revisa la consola.');
    } finally {
        dom.btnPdf.innerHTML = originalText;
    }
}
*/

// ==========================================
// EXPORTACIÓN A CSV (Texto Puro)
// ==========================================
function exportarCSV() {
    if (datosFiltrados.length === 0) {
        alert('No hay registros para exportar.');
        return;
    }

    const csvData = datosFiltrados.map((d, index) => ({
        'ITEM': index + 1,
        'GRUPO': d.grupo,
        'USUARIO': d.usuario,
        'FECHA': d.fecha,
        'DESCRIPCION': d.descripcion.replace(/\n/g, ' '), // Limpiar saltos de línea para el CSV si lo deseas, aunque Papa.unparse lo maneja
        'UTM NORTE': d.utmNorte,
        'UTM ESTE': d.utmEste,
        'EVIDENCIA FOTOGRAFICA': d.nombreFoto || 'Sin Foto'
    }));

    // Convertir JSON a CSV string usando PapaParse
    const csvString = Papa.unparse(csvData, {
        quotes: true,
        delimiter: ",",
        header: true,
        newline: "\n"
    });

    // Crear un Blob y descargarlo
    const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' }); // \uFEFF es el BOM para que Excel lea los acentos UTF-8
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ==========================================
// EXPORTACIÓN A EXCEL (.xlsx)
// ==========================================
async function exportarXLSX() {
    if (datosFiltrados.length === 0) {
        alert('No hay registros para exportar.');
        return;
    }

    const totalRows = datosFiltrados.length;
    const confirmacion = confirm(`¿Descargar XLSX con ${totalRows} registro(s)?\nSe generará al instante.`);
    if (!confirmacion) return;

    const btnXlsx = document.getElementById('btn-export-xlsx');
    const originalText = btnXlsx.innerHTML;

    try {
        btnXlsx.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg> Construyendo Excel...`;
        btnXlsx.disabled = true;

        // --- Crear workbook con ExcelJS ---
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'GestorDescargas';
        workbook.created = new Date();

        const ws = workbook.addWorksheet('Evidencias');

        ws.columns = [
            { header: 'Ítem',                  key: 'item',        width: 6  },
            { header: 'Grupo',                 key: 'grupo',       width: 14 },
            { header: 'Usuario',               key: 'usuario',     width: 18 },
            { header: 'Fecha',                 key: 'fecha',       width: 14 },
            { header: 'Descripción',           key: 'descripcion', width: 50 },
            { header: 'UTM Norte',             key: 'utmNorte',    width: 14 },
            { header: 'UTM Este',              key: 'utmEste',     width: 14 },
            { header: 'Evidencia Fotográfica', key: 'evidencia',   width: 25 }
        ];

        // Estilo fila de encabezado
        const headerRow = ws.getRow(1);
        headerRow.height = 25;
        headerRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B132B' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF1C2541' } },
                bottom: { style: 'thin', color: { argb: 'FF1C2541' } },
                left: { style: 'thin', color: { argb: 'FF1C2541' } },
                right: { style: 'thin', color: { argb: 'FF1C2541' } }
            };
        });

        // Agregar filas de datos
        for (let i = 0; i < datosFiltrados.length; i++) {
            const d = datosFiltrados[i];
            
            // Si hay foto, armamos la fórmula de HYPERLINK nativa de Excel
            let cellEvidencia = 'Sin foto';
            if (d.driveId) {
                const urlDrive = `https://drive.google.com/file/d/${d.driveId}/view`;
                cellEvidencia = { text: 'Ver Foto 🔗', hyperlink: urlDrive };
            }

            const row = ws.addRow({
                item:        i + 1,
                grupo:       d.grupo || '',
                usuario:     d.usuario || '',
                fecha:       d.fecha || '',
                descripcion: d.descripcion || '',
                utmNorte:    d.utmNorte || '',
                utmEste:     d.utmEste || '',
                evidencia:   cellEvidencia
            });

            // Alto de fila normal (ya no necesitamos celdas gigantes para fotos)
            row.height = 30;

            // Estilo general de la fila
            row.eachCell((cell, colNumber) => {
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFCBCFD8' } },
                    bottom: { style: 'thin', color: { argb: 'FFCBCFD8' } },
                    left: { style: 'thin', color: { argb: 'FFCBCFD8' } },
                    right: { style: 'thin', color: { argb: 'FFCBCFD8' } }
                };
                if (i % 2 === 1) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                }
                
                // Si es la columna de Evidencia y tiene link, pintar de azul
                if (colNumber === 8 && d.driveId) {
                    cell.font = { color: { argb: 'FF2563EB' }, underline: true, bold: true };
                }
            });
        }

        ws.views = [{ state: 'frozen', ySplit: 1 }];

        // Generar y descargar
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        saveAs(blob, `Evidencias_${new Date().toISOString().slice(0, 10)}.xlsx`);

    } catch (e) {
        console.error('Error al exportar XLSX:', e);
        alert('Hubo un error al generar el Excel. Revisa la consola: ' + e.message);
    } finally {
        btnXlsx.innerHTML = originalText;
        btnXlsx.disabled = false;
    }
}
