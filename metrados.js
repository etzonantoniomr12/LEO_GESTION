// ==========================================
// MÓDULO METRADOS
// Espejo del módulo Registro Fotos pero para
// la hoja METRADOS del mismo Spreadsheet.
// ==========================================

const METRADOS_SHEET_ID = '1njOr6ofptBELf1Ja7Hw4w7HakcOqqkagAnZta4nBGVA';
const METRADOS_CSV_URL  = `https://docs.google.com/spreadsheets/d/${METRADOS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=METRADOS`;

// Estas son las únicas columnas que se muestran en la pantalla.  Las columnas
// DRIVE_ID_*, NOMBRE_FOTO_* y #* se conservan solo como datos auxiliares para
// poder abrir/cargar las fotos, nunca se presentan como columnas de la tabla.
const COLUMNAS_VISIBLES_MET = [
    'ITEM', 'FECHA', 'ACTIVIDAD', 'PARTIDA', 'KM INICIAL', 'KM FINAL',
    'LADO', 'METRADO', 'UNIDAD', 'TRAMO', 'FOTO_ANTES', 'FOTO_DURANTE',
    'FOTO_DESPUES'
];

// --- Estado global del módulo ---
let datosMetrados       = [];
let filtradosMetrados   = [];
let paginaMetrados      = 1;
const ITEMS_POR_PAG_MET = 25;
let criteriosMet        = [];
let metradosCargados    = false;

// ==========================================
// SELECTORES DOM (acceso lazy)
// ==========================================
function $m(id) { return document.getElementById(id); }

// ==========================================
// INICIALIZACIÓN
// ==========================================
function inicializarMetrados() {
    if (metradosCargados) {
        // Ya cargado: solo re-renderizar con filtros limpios
        return;
    }
    cargarDatosMetrados();
}

function limpiarFiltrosMetrados() {
    criteriosMet = [];
    renderSortUIMet();
    ['met-filter-fecha-op','met-filter-kmi-op','met-filter-kmf-op'].forEach(id => {
        const el = $m(id); if (el) el.value = 'ALL';
    });
    ['met-filter-fecha-val','met-filter-kmi-val','met-filter-kmf-val','met-filter-partida'].forEach(id => {
        const el = $m(id); if (el) el.value = '';
    });
    ['met-filter-lado','met-filter-tramo'].forEach(id => {
        const el = $m(id); if (el) el.value = 'ALL';
    });
}

// ==========================================
// CARGA Y PARSEO DE DATOS
// ==========================================
function cargarDatosMetrados() {
    const loading = $m('met-loading');
    if (loading) loading.classList.remove('hidden');

    Papa.parse(METRADOS_CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            datosMetrados     = procesarDatosMetrados(results.data);
            filtradosMetrados = [...datosMetrados];
            metradosCargados  = true;

            poblarSelectoresMet();
            aplicarFiltrosMet();

            if (loading) loading.classList.add('hidden');
        },
        error: () => {
            if (loading) loading.innerHTML =
                `<p class="text-red-500 font-bold text-center p-8">Error al cargar METRADOS. Revisa la conexión o verifica que la hoja exista y sea pública.</p>`;
        }
    });
}

function procesarDatosMetrados(raw) {
    return raw.map(fila => {
        // Google Sheets puede devolver BOM, espacios o cambios de mayúsculas
        // en los encabezados. Normalizar aquí evita leer una columna distinta.
        const normalizada = {};
        Object.keys(fila || {}).forEach(k => {
            normalizada[String(k).replace(/^\uFEFF/, '').trim().toUpperCase()] = fila[k];
        });
        const valor = (...nombres) => {
            for (const nombre of nombres) {
                if (normalizada[nombre] !== undefined && normalizada[nombre] !== null) {
                    return String(normalizada[nombre]).trim();
                }
            }
            return '';
        };
        const kmI = valor('KM INICIAL', 'KM INI.');
        const kmF = valor('KM FINAL', 'KM FIN.');
        const fotoAntes = valor('FOTO_ANTES', 'FOTO ANTES');
        const fotoDurante = valor('FOTO_DURANTE', 'FOTO DURANTE');
        const fotoDespues = valor('FOTO_DESPUES', 'FOTO DESPUES');
        const idAntes = valor('DRIVE_ID_ANTES');
        const idDurante = valor('DRIVE_ID_DURANTE');
        const idDespues = valor('DRIVE_ID_DESPUES');
        return {
            fecha:             valor('FECHA'),
            actividad:         valor('ACTIVIDAD'),
            partida:           valor('PARTIDA'),
            kmInicial:          kmI !== '' ? kmI : '',
            kmFinal:            kmF !== '' ? kmF : '',
            lado:              valor('LADO'),
            metrado:           valor('METRADO'),
            unidad:            valor('UNIDAD'),
            tramo:             valor('TRAMO'),
            // Fotos (Drive IDs para miniaturas)
            driveIdAntes:      idAntes || _extraerDriveIdMet(fotoAntes),
            driveIdDurante:    idDurante || _extraerDriveIdMet(fotoDurante),
            driveIdDespues:    idDespues || _extraerDriveIdMet(fotoDespues),
            fotoAntes,
            fotoDurante,
            fotoDespues,
            // Nombres de archivo (para ordenamiento cronológico)
            nombreFotoAntes:   valor('NOMBRE_FOTO_ANTES'),
            nombreFotoDurante: valor('NOMBRE_FOTO_DURANTE'),
            nombreFotoDespues: valor('NOMBRE_FOTO_DESPUES'),
            // Conteos
            cntAntes:   parseInt(valor('#ANTES')   || '0', 10) || (fotoAntes ? 1 : 0),
            cntDurante: parseInt(valor('#DURANTE') || '0', 10) || (fotoDurante ? 1 : 0),
            cntDespues: parseInt(valor('#DESPUES') || '0', 10) || (fotoDespues ? 1 : 0),
        };
    }).filter(d => d.actividad !== ''); // Ignorar filas completamente vacías
}

function _extraerDriveIdMet(valor) {
    if (!valor) return '';
    const texto = String(valor).trim();
    const match = texto.match(/\/d\/([a-zA-Z0-9_-]+)/) || texto.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : (/^[a-zA-Z0-9_-]{20,}$/.test(texto) ? texto : '');
}

function _refFotoMet(d, tipo) {
    const id = tipo === 'antes' ? d.driveIdAntes : tipo === 'durante' ? d.driveIdDurante : d.driveIdDespues;
    const url = tipo === 'antes' ? d.fotoAntes : tipo === 'durante' ? d.fotoDurante : d.fotoDespues;
    return id || url || '';
}

function _enlaceFotoMet(ref) {
    if (!ref) return '';
    return /^https?:\/\//i.test(ref) ? ref : `https://drive.google.com/file/d/${ref}/view`;
}

function _numeroKmMet(valor) {
    if (valor === undefined || valor === null || valor === '') return NaN;
    // Acepta tanto 43000 como el formato vial 43+000.
    const texto = String(valor).trim().replace(/\s/g, '').replace(',', '.');
    if (/^\d+(?:\.\d+)?\+\d+$/.test(texto)) return Number(texto.replace('+', ''));
    return Number(texto);
}

function poblarSelectoresMet() {
    const lados  = [...new Set(datosMetrados.map(d => d.lado).filter(Boolean))].sort();
    const tramos = [...new Set(datosMetrados.map(d => d.tramo).filter(Boolean))].sort();

    const selLado  = $m('met-filter-lado');
    const selTramo = $m('met-filter-tramo');
    if (selLado)  selLado.innerHTML  = '<option value="ALL">Todos</option>' + lados.map(v => `<option value="${v}">${v}</option>`).join('');
    if (selTramo) selTramo.innerHTML = '<option value="ALL">Todos</option>' + tramos.map(v => `<option value="${v}">${v}</option>`).join('');
}

// ==========================================
// CONFIGURAR EVENTOS (llamado desde DOMContentLoaded)
// ==========================================
function configurarEventosMet() {
    const btnB = $m('met-btn-buscar');
    if (btnB) btnB.addEventListener('click', aplicarFiltrosMet);

    const fPartida = $m('met-filter-partida');
    if (fPartida) fPartida.addEventListener('keyup', e => { if (e.key === 'Enter') aplicarFiltrosMet(); });

    const btnPrev = $m('met-btn-prev');
    const btnNext = $m('met-btn-next');
    if (btnPrev) btnPrev.addEventListener('click', () => cambiarPaginaMet(-1));
    if (btnNext) btnNext.addEventListener('click', () => cambiarPaginaMet(1));
}

// ==========================================
// FILTRADO Y ORDENAMIENTO
// ==========================================
function aplicarFiltrosMet() {
    const fechaOp   = ($m('met-filter-fecha-op')  || {value:'ALL'}).value;
    const fechaVal  = ($m('met-filter-fecha-val') || {value:''}).value;
    const kmiOp     = ($m('met-filter-kmi-op')    || {value:'ALL'}).value;
    const kmiVal    = parseFloat(($m('met-filter-kmi-val') || {value:''}).value);
    const kmfOp     = ($m('met-filter-kmf-op')    || {value:'ALL'}).value;
    const kmfVal    = parseFloat(($m('met-filter-kmf-val') || {value:''}).value);
    const lado      = ($m('met-filter-lado')      || {value:'ALL'}).value;
    const tramo     = ($m('met-filter-tramo')     || {value:'ALL'}).value;
    const partida   = (($m('met-filter-partida')  || {value:''}).value || '').toLowerCase().trim();
    const palabras  = partida ? partida.split(/\s+/) : [];

    filtradosMetrados = datosMetrados.filter(d => {
        // FECHA
        if (fechaOp !== 'ALL' && fechaVal) {
            if (fechaOp === 'eq'  && d.fecha !== fechaVal) return false;
            if (fechaOp === 'gte' && d.fecha < fechaVal)  return false;
            if (fechaOp === 'lte' && d.fecha > fechaVal)  return false;
        }
        // KM INICIAL
        if (kmiOp !== 'ALL' && !isNaN(kmiVal)) {
            const v = _numeroKmMet(d.kmInicial);
            if (kmiOp === 'eq'  && v !== kmiVal) return false;
            if (kmiOp === 'gte' && v < kmiVal)   return false;
            if (kmiOp === 'lte' && v > kmiVal)   return false;
        }
        // KM FINAL
        if (kmfOp !== 'ALL' && !isNaN(kmfVal)) {
            const v = _numeroKmMet(d.kmFinal);
            if (kmfOp === 'eq'  && v !== kmfVal) return false;
            if (kmfOp === 'gte' && v < kmfVal)   return false;
            if (kmfOp === 'lte' && v > kmfVal)   return false;
        }
        // LADO
        if (lado !== 'ALL' && d.lado !== lado) return false;
        // TRAMO
        if (tramo !== 'ALL' && d.tramo !== tramo) return false;
        // PARTIDA (búsqueda por palabras)
        if (palabras.length > 0) {
            const txt = d.partida.toLowerCase();
            if (!palabras.every(p => txt.includes(p))) return false;
        }
        return true;
    });

    // Ordenamiento multicriterio
    if (criteriosMet.length === 0) {
        // Default: más reciente primero por fecha
        filtradosMetrados.sort((a, b) => {
            if (a.fecha < b.fecha) return 1;
            if (a.fecha > b.fecha) return -1;
            return 0;
        });
    } else {
        filtradosMetrados.sort((a, b) => {
            for (let i = 0; i < criteriosMet.length; i++) {
                const crit = criteriosMet[i];
                let valA = _getCampoMet(a, crit.columna);
                let valB = _getCampoMet(b, crit.columna);

                // Para columnas de foto: ordenar por nombre de archivo
                if (crit.columna === 'nombreFotoAntes' || crit.columna === 'nombreFotoDurante' || crit.columna === 'nombreFotoDespues') {
                    const kA = _extraerClaveFotoMet(valA);
                    const kB = _extraerClaveFotoMet(valB);
                    if (!kA && !kB) continue;
                    if (!kA) return 1;
                    if (!kB) return -1;
                    valA = kA; valB = kB;
                }

                if (valA === valB) continue;
                const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true });
                return crit.dir === 'asc' ? cmp : -cmp;
            }
            return 0;
        });
    }

    paginaMetrados = 1;
    renderizarTablaMet();
}

function _getCampoMet(obj, campo) {
    return obj[campo] !== undefined ? obj[campo] : '';
}

function _extraerClaveFotoMet(nombreFoto) {
    if (!nombreFoto) return '';
    const sinExt = nombreFoto.replace(/\.[^.]+$/, '');
    const match  = sinExt.match(/(\d{8}[_\-]\d{6})/);
    return match ? match[1] : sinExt;
}

// ==========================================
// SORT UI
// ==========================================
const COLUMNAS_MET = [
    'fecha','actividad','partida','kmInicial','kmFinal','lado',
    'metrado','unidad','tramo',
    'nombreFotoAntes','nombreFotoDurante','nombreFotoDespues',
    'cntAntes','cntDurante','cntDespues'
];

function toggleSortMet(columna) {
    const idx = criteriosMet.findIndex(c => c.columna === columna);
    if (idx === -1) {
        criteriosMet.push({ columna, dir: 'asc' });
    } else if (criteriosMet[idx].dir === 'asc') {
        criteriosMet[idx].dir = 'desc';
    } else {
        criteriosMet.splice(idx, 1);
    }
    renderSortUIMet();
    aplicarFiltrosMet();
}

function renderSortUIMet() {
    COLUMNAS_MET.forEach(col => {
        const circulo = $m(`met-sort-pri-${col}`);
        const btn     = $m(`met-sort-btn-${col}`);
        const icon    = $m(`met-sort-icon-${col}`);
        if (!circulo || !btn || !icon) return;

        const idx = criteriosMet.findIndex(c => c.columna === col);
        if (idx === -1) {
            circulo.className = 'absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold text-white bg-transparent opacity-0 transition-all';
            circulo.textContent = '';
            btn.className = 'absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center bg-transparent text-slate-300 transition-colors';
            icon.style.transform = 'rotate(0deg)';
        } else {
            circulo.textContent = idx + 1;
            const dir = criteriosMet[idx].dir;
            if (dir === 'asc') {
                circulo.className = 'absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold text-white bg-slate-700 opacity-100 shadow-md transition-all';
                btn.className = 'absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center text-white bg-slate-700 shadow-sm transition-colors';
                icon.style.transform = 'rotate(180deg)';
            } else {
                circulo.className = 'absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold text-white bg-emerald-500 opacity-100 shadow-md transition-all';
                btn.className = 'absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center text-white bg-emerald-500 shadow-sm transition-colors';
                icon.style.transform = 'rotate(0deg)';
            }
        }
    });
}

// ==========================================
// PAGINACIÓN
// ==========================================
function cambiarPaginaMet(delta) {
    const total = Math.ceil(filtradosMetrados.length / ITEMS_POR_PAG_MET);
    const nueva = paginaMetrados + delta;
    if (nueva >= 1 && nueva <= total) {
        paginaMetrados = nueva;
        renderizarTablaMet();
        $m('met-main-container') && $m('met-main-container').scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ==========================================
// RENDERIZADO DE TABLA
// ==========================================
function _thMet(col, label, widthCls = 'w-[80px] min-w-[80px]') {
    return `<th class="px-2 py-4 ${widthCls} text-center border-l border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors relative select-none" onclick="toggleSortMet('${col}')">
        <div id="met-sort-pri-${col}" class="absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold text-white bg-transparent opacity-0 transition-all"></div>
        <div class="pb-3 text-[11px]">${label}</div>
        <div id="met-sort-btn-${col}" class="absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center bg-transparent text-slate-300 transition-colors">
            <svg id="met-sort-icon-${col}" xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/>
            </svg>
        </div>
    </th>`;
}

function _thMetWide(col, label, widthCls = 'w-[160px] min-w-[160px]') {
    return `<th class="px-4 py-4 ${widthCls} text-center border-l border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors relative select-none" onclick="toggleSortMet('${col}')">
        <div id="met-sort-pri-${col}" class="absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold text-white bg-transparent opacity-0 transition-all"></div>
        <div class="pb-3 text-[11px]">${label}</div>
        <div id="met-sort-btn-${col}" class="absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center bg-transparent text-slate-300 transition-colors">
            <svg id="met-sort-icon-${col}" xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/>
            </svg>
        </div>
    </th>`;
}

function construirCabecerasMet() {
    const thead = $m('met-tabla-head');
    if (!thead) return;
    thead.innerHTML = `
    <tr class="bg-slate-50 border-b-2 border-[#1c2541] text-[11px] uppercase tracking-wider text-slate-500 font-bold">
        <th class="px-2 py-4 w-[40px] min-w-[40px] text-center">ITEM</th>
        ${_thMet('fecha',     'Fecha',     'w-[90px] min-w-[90px]')}
        ${_thMetWide('actividad', 'Actividad', 'w-[160px] min-w-[160px]')}
        ${_thMetWide('partida',   'Partida',   'w-[240px] min-w-[240px]')}
        ${_thMet('kmInicial', 'KM Inicial', 'w-[90px] min-w-[90px]')}
        ${_thMet('kmFinal',   'KM Final',   'w-[90px] min-w-[90px]')}
        ${_thMet('lado',      'Lado',      'w-[70px] min-w-[70px]')}
        ${_thMet('metrado',   'Metrado',   'w-[80px] min-w-[80px]')}
        ${_thMet('unidad',    'Unidad',    'w-[70px] min-w-[70px]')}
        ${_thMet('tramo',     'Tramo',     'w-[100px] min-w-[100px]')}
        ${_thMetWide('nombreFotoAntes',   'FOTO_ANTES',   'w-[160px] min-w-[160px]')}
        ${_thMetWide('nombreFotoDurante', 'FOTO_DURANTE', 'w-[160px] min-w-[160px]')}
        ${_thMetWide('nombreFotoDespues', 'FOTO_DESPUES', 'w-[160px] min-w-[160px]')}
    </tr>`;
}

function _celda_foto_met(driveId, nombreFoto, sufijo) {
    if (!driveId) return `<span class="text-slate-400 italic text-xs">Sin foto</span>`;
    if (/^https?:\/\//i.test(driveId) && !_extraerDriveIdMet(driveId)) {
        return `<div class="relative w-full h-24 flex items-center justify-center bg-slate-50" id="met-foto-${sufijo}-${_hashFotoMet(driveId)}">
            <img src="${_escaparHtmlMet(driveId)}" loading="lazy" class="foto-miniatura" alt="${_escaparHtmlMet(nombreFoto || 'Foto')}" onerror="this.replaceWith(document.createTextNode('Ver foto'))">
        </div>`;
    }
    return `
    <div class="relative w-full h-24 flex items-center justify-center bg-slate-50" id="met-foto-${sufijo}-${driveId}">
        <span class="nombre-foto-oculto">${nombreFoto || ''}</span>
        <svg class="animate-spin h-6 w-6 text-[#0ea5e9]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>`;
}

function _escaparHtmlMet(valor) {
    return String(valor || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function _hashFotoMet(valor) {
    return String(valor).replace(/[^a-zA-Z0-9_-]/g, '').slice(-32);
}

async function renderizarTablaMet() {
    construirCabecerasMet();

    const tbody   = $m('met-tabla-body');
    const counter = $m('met-counter-info');
    const pagInfo = $m('met-pagination-info');
    const btnPrev = $m('met-btn-prev');
    const btnNext = $m('met-btn-next');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (counter) counter.innerText = `Filtro actual: ${filtradosMetrados.length} registros`;

    if (filtradosMetrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" class="text-center py-12 text-slate-500">No se encontraron resultados.</td></tr>`;
        if (pagInfo) pagInfo.innerText = 'Mostrando 0 a 0 de 0 registros';
        if (btnPrev) btnPrev.disabled = true;
        if (btnNext) btnNext.disabled = true;
        return;
    }

    const inicio  = (paginaMetrados - 1) * ITEMS_POR_PAG_MET;
    const fin     = Math.min(inicio + ITEMS_POR_PAG_MET, filtradosMetrados.length);
    const pagina  = filtradosMetrados.slice(inicio, fin);
    const totalP  = Math.ceil(filtradosMetrados.length / ITEMS_POR_PAG_MET);

    if (pagInfo) pagInfo.innerText = `Mostrando ${inicio+1} a ${fin} de ${filtradosMetrados.length} registros (Pág ${paginaMetrados}/${totalP})`;
    if (btnPrev) btnPrev.disabled = paginaMetrados === 1;
    if (btnNext) btnNext.disabled = paginaMetrados === totalP;

    // FASE 1: Renderizar filas con spinners
    pagina.forEach((d, i) => {
        const gIdx = inicio + i + 1;
        const tr   = document.createElement('tr');
        tr.className = 'bg-white hover:bg-blue-50 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-default';

        const refA = _refFotoMet(d, 'antes');
        const refD = _refFotoMet(d, 'durante');
        const refE = _refFotoMet(d, 'despues');
        const fotoA = refA ? `<td class="celda-foto border-l border-slate-300 bg-slate-50/50 cursor-pointer" onclick="abrirEnDriveMet('${_escaparHtmlMet(refA)}')">${_celda_foto_met(refA, d.nombreFotoAntes, 'A-'+gIdx)}</td>` : `<td class="px-3 py-4 text-center border-l border-slate-200"><span class="text-slate-300 italic text-xs">—</span></td>`;
        const fotoD = refD ? `<td class="celda-foto border-l border-slate-300 bg-slate-50/50 cursor-pointer" onclick="abrirEnDriveMet('${_escaparHtmlMet(refD)}')">${_celda_foto_met(refD, d.nombreFotoDurante, 'D-'+gIdx)}</td>` : `<td class="px-3 py-4 text-center border-l border-slate-200"><span class="text-slate-300 italic text-xs">—</span></td>`;
        const fotoE = refE ? `<td class="celda-foto border-l border-slate-300 bg-slate-50/50 cursor-pointer" onclick="abrirEnDriveMet('${_escaparHtmlMet(refE)}')">${_celda_foto_met(refE, d.nombreFotoDespues, 'E-'+gIdx)}</td>` : `<td class="px-3 py-4 text-center border-l border-slate-200"><span class="text-slate-300 italic text-xs">—</span></td>`;

        // Indicador visual de completitud (todos 3 tiempos)
        const completo = d.cntAntes > 0 && d.cntDurante > 0 && d.cntDespues > 0;
        const badgeA   = _badge(d.cntAntes,   completo);
        const badgeD   = _badge(d.cntDurante, completo);
        const badgeE   = _badge(d.cntDespues, completo);

        tr.innerHTML = `
            <td class="px-2 py-3 text-center w-[40px] min-w-[40px]"><div class="font-bold text-slate-400 text-xs">${gIdx}</div></td>
            <td class="px-2 py-3 text-center border-l border-slate-200 w-[90px] min-w-[90px] break-words">
                <div class="mx-auto text-slate-600 font-mono text-[11px]">${d.fecha || '-'}</div>
            </td>
            <td class="px-3 py-3 w-[160px] min-w-[160px] whitespace-normal break-words border-l border-slate-200">
                <div class="text-xs text-slate-700 font-semibold leading-snug">${d.actividad || '-'}</div>
            </td>
            <td class="px-3 py-3 w-[240px] min-w-[240px] whitespace-normal break-words border-l border-slate-200">
                <div class="text-xs text-slate-600 leading-snug">${d.partida || '-'}</div>
            </td>
            <td class="px-2 py-3 text-center border-l border-slate-200 w-[80px] min-w-[80px] break-words">
                <div class="mx-auto text-slate-500 font-mono text-[11px]">${d.kmInicial !== '' ? d.kmInicial : '-'}</div>
            </td>
            <td class="px-2 py-3 text-center border-l border-slate-200 w-[80px] min-w-[80px] break-words">
                <div class="mx-auto text-slate-500 font-mono text-[11px]">${d.kmFinal !== '' ? d.kmFinal : '-'}</div>
            </td>
            <td class="px-2 py-3 text-center border-l border-slate-200 w-[70px] min-w-[70px] break-words">
                <div class="mx-auto text-slate-600 font-semibold text-[11px]">${d.lado || '-'}</div>
            </td>
            <td class="px-2 py-3 text-center border-l border-slate-200 w-[80px] min-w-[80px] break-words">
                <div class="mx-auto text-slate-700 font-bold text-[11px]">${d.metrado !== '' ? d.metrado : '-'}</div>
            </td>
            <td class="px-2 py-3 text-center border-l border-slate-200 w-[70px] min-w-[70px] break-words">
                <div class="mx-auto text-slate-500 text-[11px]">${d.unidad || '-'}</div>
            </td>
            <td class="px-2 py-3 text-center border-l border-slate-200 w-[100px] min-w-[100px] break-words">
                <div class="mx-auto text-slate-500 text-[11px] leading-snug">${d.tramo || '-'}</div>
            </td>
            ${fotoA}
            ${fotoD}
            ${fotoE}
        `;
        tbody.appendChild(tr);
    });

    // FASE 2: Cargar fotos en lote
    const ids = [];
    pagina.forEach((d, i) => {
        const gIdx = inicio + i + 1;
        if (d.driveIdAntes)   ids.push({ id: d.driveIdAntes,   key: `met-foto-A-${gIdx}-${d.driveIdAntes}`,   containerId: `met-foto-A-${gIdx}` });
        if (d.driveIdDurante) ids.push({ id: d.driveIdDurante, key: `met-foto-D-${gIdx}-${d.driveIdDurante}`, containerId: `met-foto-D-${gIdx}` });
        if (d.driveIdDespues) ids.push({ id: d.driveIdDespues, key: `met-foto-E-${gIdx}-${d.driveIdDespues}`, containerId: `met-foto-E-${gIdx}` });
    });

    const uniqueIds = [...new Set(ids.map(x => x.id))];
    if (uniqueIds.length > 0 && typeof GAS_THUMBS_URL !== 'undefined' && GAS_THUMBS_URL !== 'PEGAR_AQUI_LA_URL_DEL_SCRIPT_MINIATURAS') {
        try {
            const resp = await fetch(GAS_THUMBS_URL, { method: 'POST', body: JSON.stringify({ ids: uniqueIds }) });
            const data = await resp.json();
            if (data.success && data.data) {
                ids.forEach(({ id, containerId }) => {
                    const container = document.getElementById(containerId);
                    if (container && data.data[id]) {
                        container.innerHTML = `<img src="${data.data[id]}" loading="lazy" class="foto-miniatura">`;
                    } else if (container) {
                        container.innerHTML = `<span class="text-xs text-slate-400">🔗 Ver foto</span>`;
                    }
                });
            } else {
                ids.forEach(({ containerId }) => {
                    const c = document.getElementById(containerId);
                    if (c) c.innerHTML = `<span class="text-xs text-slate-400">Ver foto</span>`;
                });
            }
        } catch (e) {
            ids.forEach(({ containerId }) => {
                const c = document.getElementById(containerId);
                if (c) c.innerHTML = `<span class="text-xs text-slate-400">🔗 Ver foto</span>`;
            });
        }
    }
}

function _badge(cnt, completo) {
    if (cnt === 0) return `<span class="inline-block w-6 h-6 rounded-full bg-red-100 text-red-500 text-[10px] font-bold flex items-center justify-center">0</span>`;
    const cls = completo ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600';
    return `<span class="inline-block w-6 h-6 rounded-full ${cls} text-[10px] font-bold flex items-center justify-center">${cnt}</span>`;
}

// ==========================================
// VISOR DE FOTO (Drive nativo)
// ==========================================
function abrirEnDriveMet(id) {
    if (!id) return;
    const destino = /^https?:\/\//i.test(id) ? id : `https://drive.google.com/file/d/${id}/view`;
    window.open(destino, '_blank');
}

// ==========================================
// EXPORTACIÓN CSV
// ==========================================
function exportarCSVMet() {
    if (filtradosMetrados.length === 0) { alert('No hay registros para exportar.'); return; }
    const data = filtradosMetrados.map((d, i) => ({
        'ITEM': i + 1, 'FECHA': d.fecha, 'ACTIVIDAD': d.actividad, 'PARTIDA': d.partida,
        'KM INICIAL': d.kmInicial, 'KM FINAL': d.kmFinal, 'LADO': d.lado,
        'METRADO': d.metrado, 'UNIDAD': d.unidad, 'TRAMO': d.tramo,
        'FOTO_ANTES': _enlaceFotoMet(_refFotoMet(d, 'antes')),
        'FOTO_DURANTE': _enlaceFotoMet(_refFotoMet(d, 'durante')),
        'FOTO_DESPUES': _enlaceFotoMet(_refFotoMet(d, 'despues'))
    }));
    const csv = Papa.unparse(data, { quotes: true, header: true, newline: '\n' });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Metrados_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ==========================================
// EXPORTACIÓN EXCEL
// ==========================================
async function exportarXLSXMet() {
    if (filtradosMetrados.length === 0) { alert('No hay registros para exportar.'); return; }
    const btn = document.getElementById('btn-export-xlsx');
    const origText = btn ? btn.innerHTML : '';
    try {
        if (btn) { btn.innerHTML = 'Construyendo Excel...'; btn.disabled = true; }
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Metrados');
        ws.columns = [
            { header: 'Ítem',       key: 'item',      width: 6  },
            { header: 'Fecha',      key: 'fecha',     width: 14 },
            { header: 'Actividad',  key: 'actividad', width: 30 },
            { header: 'Partida',    key: 'partida',   width: 40 },
            { header: 'KM Inicial', key: 'kmi',       width: 12 },
            { header: 'KM Final',   key: 'kmf',       width: 12 },
            { header: 'Lado',       key: 'lado',      width: 8  },
            { header: 'Metrado',    key: 'metrado',   width: 10 },
            { header: 'Unidad',     key: 'unidad',    width: 8  },
            { header: 'Tramo',      key: 'tramo',     width: 12 },
            { header: 'Foto ANTES',    key: 'fotoA', width: 20 },
            { header: 'Foto DURANTE',  key: 'fotoD', width: 20 },
            { header: 'Foto DESPUES',  key: 'fotoE', width: 20 },
        ];
        const hr = ws.getRow(1);
        hr.height = 25;
        hr.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B132B' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });
        filtradosMetrados.forEach((d, i) => {
            const row = ws.addRow({
                item: i+1, fecha: d.fecha, actividad: d.actividad, partida: d.partida,
                kmi: d.kmInicial, kmf: d.kmFinal, lado: d.lado, metrado: d.metrado,
                unidad: d.unidad, tramo: d.tramo,
                fotoA: _refFotoMet(d, 'antes')   ? { text: 'Ver ANTES 🔗',   hyperlink: _enlaceFotoMet(_refFotoMet(d, 'antes')) } : '',
                fotoD: _refFotoMet(d, 'durante') ? { text: 'Ver DURANTE 🔗', hyperlink: _enlaceFotoMet(_refFotoMet(d, 'durante')) } : '',
                fotoE: _refFotoMet(d, 'despues') ? { text: 'Ver DESPUES 🔗', hyperlink: _enlaceFotoMet(_refFotoMet(d, 'despues')) } : ''
            });
            row.height = 22;
            row.eachCell(cell => {
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.border = { top: { style:'thin', color:{argb:'FFCBCFD8'} }, bottom: { style:'thin', color:{argb:'FFCBCFD8'} }, left: { style:'thin', color:{argb:'FFCBCFD8'} }, right: { style:'thin', color:{argb:'FFCBCFD8'} } };
                if (i % 2 === 1) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF8FAFC' } };
            });
        });
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        const buffer = await wb.xlsx.writeBuffer();
        saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Metrados_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch(e) { console.error(e); alert('Error al generar Excel: ' + e.message); }
    finally { if (btn) { btn.innerHTML = origText; btn.disabled = false; } }
}

// ==========================================
// EXPORTACIÓN PDF (simplificado, sin fotos embebidas para velocidad)
// ==========================================
async function exportarPDFMet() {
    if (filtradosMetrados.length === 0) { alert('No hay registros para exportar.'); return; }
    const btn = document.getElementById('btn-export-pdf');
    const origText = btn ? btn.innerHTML : '';
    try {
        if (btn) { btn.innerHTML = 'Generando PDF...'; btn.disabled = true; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'pt', 'a4'); // Landscape para más columnas
        const tableData = filtradosMetrados.map((d, i) => [
            i+1, d.fecha, d.actividad, d.partida,
            d.kmInicial, d.kmFinal, d.lado, d.metrado, d.unidad, d.tramo
        ]);
        doc.autoTable({
            head: [['#','Fecha','Actividad','Partida','KM Ini','KM Fin','Lado','Metrado','Unidad','Tramo']],
            body: tableData,
            startY: 40,
            theme: 'grid',
            styles: { fontSize: 7, valign: 'middle', halign: 'center', cellPadding: 2 },
            headStyles: { fillColor: [11,19,43], textColor: [255,255,255] },
            columnStyles: { 2: { cellWidth: 70, halign:'left' }, 3: { cellWidth: 90, halign:'left' } }
        });
        doc.save(`Metrados_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e) { console.error(e); alert('Error al generar PDF.'); }
    finally { if (btn) { btn.innerHTML = origText; btn.disabled = false; } }
}

// ==========================================
// DESCARGAR FOTOS (ZIP vía Apps Script)
// ==========================================
// ==========================================
// EXPORTACIÓN WORD (LÓGICA DEL GENERADOR PYTHON)
// ==========================================
function _dataUrlABytesMet(dataUrl) {
    const base64 = String(dataUrl || '').split(',')[1];
    if (!base64) return null;
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
}

async function _urlADataUrlMet(url) {
    if (!url) return '';
    if (/^data:image\//i.test(url)) return url;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function _obtenerImagenesWordMet(registros) {
    const referencias = [];
    const agregar = (d, tipo, id) => {
        const ref = _refFotoMet(d, tipo);
        if (ref) referencias.push({ d, tipo, ref, id: id || '' });
    };
    registros.forEach(d => {
        agregar(d, 'antes', d.driveIdAntes);
        agregar(d, 'durante', d.driveIdDurante);
        agregar(d, 'despues', d.driveIdDespues);
    });

    const resultado = new Map();
    const ids = [...new Set(referencias.map(x => x.id).filter(Boolean))];
    if (ids.length && typeof GAS_THUMBS_URL !== 'undefined') {
        try {
            const resp = await fetch(GAS_THUMBS_URL, { method: 'POST', body: JSON.stringify({ ids }) });
            const data = await resp.json();
            if (data.success && data.data) Object.entries(data.data).forEach(([id, dataUrl]) => resultado.set(id, dataUrl));
        } catch (e) {
            console.warn('No se pudieron obtener las miniaturas para Word:', e);
        }
    }

    for (const item of referencias) {
        const dataUrl = item.id ? resultado.get(item.id) : item.ref;
        if (!dataUrl) continue;
        try {
            const imagen = /^data:image\//i.test(dataUrl) ? dataUrl : await _urlADataUrlMet(dataUrl);
            const bytes = _dataUrlABytesMet(imagen);
            if (bytes) resultado.set(`${item.d.__metWordKey}|${item.tipo}`, bytes);
        } catch (e) {
            console.warn('Foto omitida en Word:', item.ref, e);
        }
    }
    return resultado;
}

function _textoTituloWordMet(d) {
    const actividad = d.partida || d.actividad || 'Actividad sin descripción';
    const lado = d.lado ? ` lado ${d.lado.toLowerCase()}` : '';
    const km = d.kmInicial || d.kmFinal ? ` km ${d.kmInicial || ''}-${d.kmFinal || ''}` : '';
    return `${actividad}${lado}${km}`.trim();
}

async function exportarWordMet() {
    if (filtradosMetrados.length === 0) { alert('No hay registros para exportar.'); return; }
    if (typeof docx === 'undefined') {
        alert('No se pudo cargar el generador de documentos Word. Verifica tu conexión a Internet.');
        return;
    }
    const btn = document.getElementById('btn-export-word');
    const original = btn ? btn.innerHTML : '';
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = 'Generando Word...'; }
        filtradosMetrados.forEach((d, i) => { d.__metWordKey = String(i); });
        const imagenes = await _obtenerImagenesWordMet(filtradosMetrados);
        const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Table, TableCell, TableRow, WidthType, BorderStyle } = docx;
        const children = [];

        filtradosMetrados.forEach((d, i) => {
            if (i > 0) children.push(new Paragraph({ pageBreakBefore: true }));
            const fecha = d.fecha || '-';
            const tramo = `ACTIVIDAD: ${d.actividad || '-'}  |  TRAMO: ${d.tramo || '-'}`;
            children.push(new Table({
                width: { size: 35, type: WidthType.PERCENTAGE }, alignment: AlignmentType.RIGHT,
                rows: [new TableRow({ cells: [new TableCell({
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `FECHA: ${fecha}`, bold: true, font: 'Arial', size: 24 })] })],
                    borders: { top: { style: BorderStyle.SINGLE, size: 10, color: '2F6B85' }, bottom: { style: BorderStyle.SINGLE, size: 10, color: '2F6B85' }, left: { style: BorderStyle.SINGLE, size: 10, color: '2F6B85' }, right: { style: BorderStyle.SINGLE, size: 10, color: '2F6B85' } }
                })] })]
            }));
            children.push(new Paragraph({ spacing: { before: 140, after: 80 }, children: [new TextRun({ text: tramo, bold: true, font: 'Arial', size: 24, highlight: 'yellow' })] }));
            children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: _textoTituloWordMet(d), bold: true, font: 'Arial', size: 28 })] }));
            ['antes', 'durante', 'despues'].forEach(tipo => {
                const bytes = imagenes.get(`${d.__metWordKey}|${tipo}`);
                if (bytes) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new ImageRun({ data: bytes, transformation: { height: 257, width: 385 } })] }));
            });
        });

        const documento = new Document({ sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, children }] });
        const blob = await Packer.toBlob(documento);
        saveAs(blob, `METRADOS_${new Date().toISOString().slice(0, 10)}.docx`);
    } catch (e) {
        console.error(e);
        alert('Error al generar Word: ' + e.message);
    } finally {
        filtradosMetrados.forEach(d => delete d.__metWordKey);
        if (btn) { btn.innerHTML = original; btn.disabled = false; }
    }
}

async function descargarFotosMet() {
    const btn = document.getElementById('btn-download-zip');
    const fotos = [];
    filtradosMetrados.forEach((d, i) => {
        if (d.driveIdAntes)   fotos.push({ id: d.driveIdAntes,   nombre: d.nombreFotoAntes   || `ANTES_${i+1}.jpg`   });
        if (d.driveIdDurante) fotos.push({ id: d.driveIdDurante, nombre: d.nombreFotoDurante || `DURANTE_${i+1}.jpg` });
        if (d.driveIdDespues) fotos.push({ id: d.driveIdDespues, nombre: d.nombreFotoDespues || `DESPUES_${i+1}.jpg` });
    });
    if (fotos.length === 0) { alert('No hay fotos en el filtro actual.'); return; }
    if (!confirm(`¿Descargar ${fotos.length} foto(s) en un ZIP?`)) return;
    const origText = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = 'Compilando en la nube...'; btn.disabled = true; }
    try {
        const response = await fetch(GAS_ZIP_URL, {
            method: 'POST',
            body: JSON.stringify({ archivos: fotos, nombreZip: `Metrados_${new Date().toISOString().slice(0,10)}.zip` })
        });
        const result = await response.json();
        if (result.success && result.downloadUrl) {
            window.location.href = result.downloadUrl;
        } else {
            alert('Error al generar ZIP: ' + (result.error || 'Desconocido'));
        }
    } catch(e) { alert('Error de conexión con el servidor.'); }
    finally { if (btn) { btn.innerHTML = origText; btn.disabled = false; } }
}

// ==========================================
// ARRANQUE DESDE DOMContentLoaded
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    configurarEventosMet();
    const btnWord = $m('btn-export-word');
    if (btnWord) btnWord.addEventListener('click', exportarWordMet);
});
