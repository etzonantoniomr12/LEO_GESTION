const URL_PADRON = 'https://docs.google.com/spreadsheets/d/1zzBPvdO-CortXfI1aY77PLZeb860cGCo7IUwQNZq8YM/export?format=csv&gid=0';
const URL_ASISTENCIA = 'https://docs.google.com/spreadsheets/d/1zzBPvdO-CortXfI1aY77PLZeb860cGCo7IUwQNZq8YM/export?format=csv&gid=736418888';

let asistDatosCargados = false;

// Estado global de asistencia
let asistPadron = {}; // { GRUPO: { capataz: "", trabajadores: [ {dni, nombre, cargo} ] } }
let asistBruto = {}; // Agrupado por MES (ej. "2026-07") -> luego DNI -> FECHA
let asistMeses = []; // ["2026-07", ...]
let asistDiasPorMes = {}; // { "2026-07": ["01", "02", ...] }

let asistFiltros = {
    grupo: 'ALL',
    cargo: 'ALL',
    nombre: '',
    tipo: 'OFICIAL', // OFICIAL o EXTRA
    mes: '' // El mes actualmente seleccionado
};

// Intentar recuperar filtros de sessionStorage
const savedFiltros = sessionStorage.getItem('asistFiltros');
if (savedFiltros) {
    try {
        const parsed = JSON.parse(savedFiltros);
        asistFiltros = { ...asistFiltros, ...parsed };
    } catch (e) {}
}

function guardarFiltrosAsistencia() {
    sessionStorage.setItem('asistFiltros', JSON.stringify(asistFiltros));
}

function limpiarFiltrosAsistencia() {
    // Resetear filtros de estado
    asistFiltros.grupo = 'ALL';
    asistFiltros.cargo = 'ALL';
    asistFiltros.nombre = '';
    asistFiltros.tipo = 'OFICIAL';
    // Mantenemos el mes para que al volver a asistencia se recuerde
    guardarFiltrosAsistencia();
    
    // Resetear controles visuales (si ya están en el DOM)
    if (aDom.filterGrupo) aDom.filterGrupo.value = 'ALL';
    if (aDom.filterCargo) aDom.filterCargo.value = 'ALL';
    if (aDom.filterNombre) aDom.filterNombre.value = '';
    
    // Marcar datos como desactualizados para forzar recarga en la siguiente visita
    asistDatosCargados = false;
}

// Referencias DOM
const aDom = {
    loading: document.getElementById('asist-loading'),
    tabsMeses: document.getElementById('asist-tabs-meses'),
    filterGrupo: document.getElementById('asist-filter-grupo'),
    filterCargo: document.getElementById('asist-filter-cargo'),
    filterNombre: document.getElementById('asist-filter-nombre'),
    btnBuscar: document.getElementById('asist-btn-buscar'),
    tablaHead: document.getElementById('asist-tabla-head'),
    tablaBody: document.getElementById('asist-tabla-body'),
    tabOficial: document.getElementById('asist-tab-oficial'),
    tabExtra: document.getElementById('asist-tab-extra')
};

async function cargarDatosAsistencia() {
    if (asistDatosCargados) return; // Evitar recargar
    aDom.loading.classList.remove('hidden');
    aDom.loading.classList.add('flex');

    try {
        // Descargar ambos CSV en paralelo
        const [resPadron, resAsistencia] = await Promise.all([
            fetch(URL_PADRON),
            fetch(URL_ASISTENCIA)
        ]);

        const csvPadron = await resPadron.text();
        const csvAsistencia = await resAsistencia.text();

        // Parsear con PapaParse
        const parsedPadron = Papa.parse(csvPadron, { header: true, skipEmptyLines: true }).data;
        const parsedAsist = Papa.parse(csvAsistencia, { header: true, skipEmptyLines: true }).data;

        procesarPadron(parsedPadron);
        procesarAsistencia(parsedAsist);
        
        asistDatosCargados = true;
        
        // Inicializar UI
        inicializarTabsMeses();
        llenarCombosAsistencia();
        
        // Restaurar estado de los combos
        aDom.filterGrupo.value = asistFiltros.grupo;
        aDom.filterCargo.value = asistFiltros.cargo;
        aDom.filterNombre.value = asistFiltros.nombre;

        // Restaurar tipo (OFICIAL/EXTRA)
        asistCambiarTipo(asistFiltros.tipo, false); // false para no renderizar aún
        
        if (asistMeses.length > 0) {
            // Si el mes guardado existe en los datos, usar ese, sino el primero
            if (asistFiltros.mes && asistMeses.includes(asistFiltros.mes)) {
                seleccionarMes(asistFiltros.mes);
            } else {
                seleccionarMes(asistMeses[0]);
            }
        }

    } catch (err) {
        console.error("Error al cargar asistencia:", err);
        alert("Ocurrió un error al descargar la asistencia. Comprueba tu conexión.");
    } finally {
        aDom.loading.classList.add('hidden');
        aDom.loading.classList.remove('flex');
    }
}

function procesarPadron(data) {
    asistPadron = {};
    data.forEach(row => {
        const grupo = row.GRUPO ? row.GRUPO.trim() : '';
        const capataz = row.CAPATAZ ? row.CAPATAZ.trim() : '';
        const dni = row.DNI ? row.DNI.trim() : '';
        const nombre = row.NOMBRES ? row.NOMBRES.trim() : '';
        const cargo = row.CARGO ? row.CARGO.trim() : '';

        if (!grupo || !dni) return;

        if (!asistPadron[grupo]) {
            asistPadron[grupo] = { capataz: capataz, trabajadores: [] };
        }
        asistPadron[grupo].trabajadores.push({ dni, nombre, cargo });
    });
}

function procesarAsistencia(data) {
    asistBruto = {};
    asistDiasPorMes = {};
    
    // Objeto temporal para sacar meses y días únicos
    let fechasSet = {};

    data.forEach(row => {
        const fechaStr = row.FECHA ? row.FECHA.trim() : '';
        const dni = row.DNI ? row.DNI.trim() : '';
        const asistencia = row.ASISTENCIA ? row.ASISTENCIA.trim() : '';
        const grupo = row.GRUPO ? row.GRUPO.trim() : '';
        const nombre = row.NOMBRE ? row.NOMBRE.trim() : '';
        const cargo = row.CARGO ? row.CARGO.trim() : '';

        if (!fechaStr || !dni) return;

        // Extraer Año-Mes y Día (asumiendo formato YYYY-MM-DD del CSV nativo de Sheets)
        // O podría venir como DD/MM/YYYY. Intentamos extraer.
        let mesLlave = "";
        let diaLlave = "";
        
        // Detectar formato
        if (fechaStr.includes('-')) {
            const partes = fechaStr.split('-');
            if (partes[0].length === 4) { // YYYY-MM-DD
                mesLlave = partes[0] + "-" + partes[1];
                diaLlave = partes[2];
            } else { // DD-MM-YYYY
                mesLlave = partes[2] + "-" + partes[1];
                diaLlave = partes[0];
            }
        } else if (fechaStr.includes('/')) {
            const partes = fechaStr.split('/');
            // Usualmente DD/MM/YYYY en español
            if (partes[2].length === 4) {
                mesLlave = partes[2] + "-" + partes[1];
                diaLlave = partes[0];
            }
        }

        if (!mesLlave) return;

        if (!asistBruto[mesLlave]) {
            asistBruto[mesLlave] = {};
            fechasSet[mesLlave] = new Set();
        }
        
        fechasSet[mesLlave].add(diaLlave);

        if (!asistBruto[mesLlave][dni]) {
            asistBruto[mesLlave][dni] = { grupo, nombre, cargo, marcas: {} };
        }
        asistBruto[mesLlave][dni].marcas[diaLlave] = asistencia;
    });

    // Ordenar los meses
    asistMeses = Object.keys(asistBruto).sort();

    // Generar TODOS los días de cada mes calendario (del 1 al último día)
    for (let m of asistMeses) {
        const [anio, numMes] = m.split('-');
        // Obtener el número de días del mes (el día 0 del mes siguiente nos da el último día del mes actual)
        const diasEnElMes = new Date(parseInt(anio), parseInt(numMes), 0).getDate();
        
        asistDiasPorMes[m] = [];
        for (let i = 1; i <= diasEnElMes; i++) {
            asistDiasPorMes[m].push(i.toString().padStart(2, '0')); // "01", "02", ..., "31"
        }
    }
}

function inicializarTabsMeses() {
    aDom.tabsMeses.innerHTML = '';
    const mesesNombres = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    asistMeses.forEach(mesVal => {
        const [anio, numMes] = mesVal.split('-');
        const nombreDisplay = mesesNombres[parseInt(numMes)] + " " + anio;
        
        const btn = document.createElement('button');
        // Estilo de pestaña moderno colgando hacia arriba
        btn.className = `px-6 py-2 rounded-t-lg font-bold text-[13px] whitespace-nowrap border-x border-t transition-all asist-tab-mes cursor-pointer -mb-[1px] relative z-0`;
        btn.dataset.mes = mesVal;
        btn.innerText = nombreDisplay.toUpperCase();
        btn.onclick = () => seleccionarMes(mesVal);
        
        aDom.tabsMeses.appendChild(btn);
    });
}

function seleccionarMes(mesVal) {
    asistFiltros.mes = mesVal;
    guardarFiltrosAsistencia();
    
    // Actualizar estilos UI de las pestañas superiores
    document.querySelectorAll('.asist-tab-mes').forEach(btn => {
        if (btn.dataset.mes === mesVal) {
            // Estilo azul metálico activo para pestaña de mes seleccionada
            btn.classList.add('bg-[#0b132b]', 'text-white', 'border-[#0b132b]', 'shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.1)]', 'z-20');
            btn.classList.remove('bg-slate-200', 'text-slate-500', 'border-transparent', 'border-slate-300', 'hover:bg-slate-300', 'z-0');
        } else {
            // Estilo apagado (mismo que pestañas inferiores inactivas)
            btn.classList.add('bg-slate-200', 'text-slate-500', 'border-slate-300', 'hover:bg-slate-300', 'z-0');
            btn.classList.remove('bg-[#0b132b]', 'text-white', 'border-transparent', 'border-[#0b132b]', 'shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.1)]', 'z-20');
        }
    });

    renderizarAsistencia();
}

function asistCambiarTipo(tipo, render = true) {
    asistFiltros.tipo = tipo;
    guardarFiltrosAsistencia();
    
    // Estética tipo AutoCAD Civil 3D (Pestañas inferiores colgantes estilo carpeta invertida)
    const clsActive = ['bg-white', 'text-slate-800', 'font-bold', 'border-x', 'border-b', 'border-slate-200', 'shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]', 'z-10'];
    const clsInactive = ['bg-slate-200', 'text-slate-500', 'hover:bg-slate-300', 'border-x', 'border-b', 'border-slate-300', 'font-semibold', 'z-0', 'shadow-none'];

    if (tipo === 'OFICIAL') {
        aDom.tabOficial.classList.remove(...clsInactive);
        aDom.tabOficial.classList.add(...clsActive);
        
        aDom.tabExtra.classList.remove(...clsActive);
        aDom.tabExtra.classList.add(...clsInactive);
    } else {
        aDom.tabExtra.classList.remove(...clsInactive);
        aDom.tabExtra.classList.add(...clsActive);
        
        aDom.tabOficial.classList.remove(...clsActive);
        aDom.tabOficial.classList.add(...clsInactive);
    }
    
    if(render) renderizarAsistencia();
}

function llenarCombosAsistencia() {
    const grupos = new Set();
    const cargos = new Set();

    // Recopilar grupos y cargos del padrón oficial
    Object.keys(asistPadron).forEach(g => {
        grupos.add(g);
        asistPadron[g].trabajadores.forEach(t => { if (t.cargo) cargos.add(t.cargo); });
    });

    // Incluir grupos/cargos del personal extra (no están en padrón)
    Object.values(asistBruto).forEach(mes => {
        Object.values(mes).forEach(t => {
            if (t.grupo) grupos.add(t.grupo);
            if (t.cargo) cargos.add(t.cargo);
        });
    });

    // Construir HTML de una sola vez (evita reparseo de DOM por cada opción)
    const gruposOrdenados = Array.from(grupos).sort();
    const cargosOrdenados = Array.from(cargos).sort();

    const cGrupo = aDom.filterGrupo;
    const cCargo = aDom.filterCargo;
    
    cGrupo.innerHTML = '<option value="ALL">Todos</option>' +
        gruposOrdenados.map(g => `<option value="${g}">${g}</option>`).join('');

    cCargo.innerHTML = '<option value="ALL">Todos los cargos</option>' +
        cargosOrdenados.map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderizarAsistencia() {
    const mesActual = asistFiltros.mes;
    if (!mesActual || !asistBruto[mesActual]) {
        aDom.tablaHead.innerHTML = '<tr><th class="p-4 text-center">No hay datos para este mes</th></tr>';
        aDom.tablaBody.innerHTML = '';
        return;
    }

    const dias = asistDiasPorMes[mesActual];
    
    // Identificar qué días no tienen ningún registro
    const diasVacios = new Set();
    const dataDelMes = asistBruto[mesActual];
    dias.forEach(d => {
        let tieneRegistro = false;
        Object.values(dataDelMes).forEach(worker => {
            if (worker.marcas && worker.marcas[d]) tieneRegistro = true;
        });
        if (!tieneRegistro) diasVacios.add(d);
    });

    // 1. Generar Cabeceras
    const nombresDiasCortos = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
    const [anioMes, numMesStr] = mesActual.split('-');
    
    let theadHtml = `
        <tr>
            <th class="px-1 py-2 min-w-[30px] max-w-[30px] w-[30px] text-center border-l border-slate-200 bg-slate-200/95 backdrop-blur sticky left-0 z-50">#</th>
            <th class="px-2 py-2 min-w-[120px] max-w-[120px] w-[120px] text-center border-l border-slate-200 bg-slate-200/95 backdrop-blur sticky left-[30px] z-50">GRUPO</th>
            <th class="px-3 py-2 min-w-[250px] max-w-[250px] w-[250px] text-left border-l border-slate-200 bg-slate-200/95 backdrop-blur sticky left-[150px] z-50 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.05)]">NOMBRE</th>
            <th class="px-2 py-2 min-w-[80px] max-w-[80px] w-[80px] text-center border-l border-slate-200 bg-slate-200/95 backdrop-blur sticky left-[400px] z-50">DNI</th>
            <th class="px-2 py-2 min-w-[150px] max-w-[150px] w-[150px] text-center border-l border-r-2 border-r-dashed border-r-slate-400 bg-slate-200/95 backdrop-blur sticky left-[480px] z-50 shadow-[4px_0_6px_-2px_rgba(0,0,0,0.05)]">CARGO</th>
    `;
    
    dias.forEach(d => {
        // Calcular el día de la semana
        const dateObj = new Date(parseInt(anioMes), parseInt(numMesStr) - 1, parseInt(d));
        const diaSemana = nombresDiasCortos[dateObj.getDay()];
        
        // Estética visual de la cabecera para los días sin registro (feriados/domingos)
        const bgCabecera = diasVacios.has(d) ? 'bg-[#e0f2fe]/80 border-blue-200' : 'bg-slate-200/50 border-slate-200';
        const textColorDia = diasVacios.has(d) ? 'text-blue-500' : 'text-slate-500';
        
        theadHtml += `
            <th class="p-0 min-w-[32px] max-w-[32px] w-[32px] text-center border-l tracking-tighter text-[11px] select-none ${bgCabecera}">
                <div class="flex flex-col items-center justify-center h-full space-y-0.5 py-1">
                    <span class="font-bold text-slate-700">${d}</span>
                    <span class="text-[9px] font-semibold ${textColorDia}">${diaSemana}</span>
                </div>
            </th>
        `;
    });
    theadHtml += `</tr>`;
    aDom.tablaHead.innerHTML = theadHtml;

    // 2. Preparar Datos y Filtrar
    let htmlContent = '';
    let itemContador = 1;

    // Obtener los grupos ordenados
    const gruposOrdenados = Array.from(new Set([
        ...Object.keys(asistPadron),
        ...Object.values(dataDelMes).map(t => t.grupo)
    ])).sort();

    // Palabras del filtro de búsqueda
    const terminosBusqueda = asistFiltros.nombre.toLowerCase().split(' ').filter(p => p.length > 0);

    gruposOrdenados.forEach(grupo => {
        // Ignorar si hay filtro de grupo
        if (asistFiltros.grupo !== 'ALL' && asistFiltros.grupo !== grupo) return;

        let capataz = asistPadron[grupo] ? asistPadron[grupo].capataz : '';
        
        let trabajadoresRenderizar = [];

        if (asistFiltros.tipo === 'OFICIAL') {
            // Sacar del Padrón Oficial
            if (asistPadron[grupo]) {
                asistPadron[grupo].trabajadores.forEach(padron => {
                    const asistDni = dataDelMes[padron.dni] ? dataDelMes[padron.dni].marcas : {};
                    trabajadoresRenderizar.push({
                        dni: padron.dni,
                        nombre: padron.nombre,
                        cargo: padron.cargo,
                        marcas: asistDni
                    });
                });
            }
        } else {
            // Sacar Extras (Tienen asistencia pero no están en Padrón)
            const dnisPadron = asistPadron[grupo] ? new Set(asistPadron[grupo].trabajadores.map(t => t.dni)) : new Set();
            
            Object.keys(dataDelMes).forEach(dni => {
                const tInfo = dataDelMes[dni];
                if (tInfo.grupo === grupo && !dnisPadron.has(dni)) {
                    trabajadoresRenderizar.push({
                        dni: dni,
                        nombre: tInfo.nombre,
                        cargo: tInfo.cargo,
                        marcas: tInfo.marcas
                    });
                }
            });
        }

        // Aplicar Filtros (Cargo y Nombre)
        trabajadoresRenderizar = trabajadoresRenderizar.filter(t => {
            if (asistFiltros.cargo !== 'ALL' && t.cargo !== asistFiltros.cargo) return false;
            
            if (terminosBusqueda.length > 0) {
                const nombreT = (t.nombre || "").toLowerCase();
                // Retorna false si algún término no está en el nombre (todas las palabras deben coincidir)
                if (!terminosBusqueda.every(termino => nombreT.includes(termino))) {
                    return false;
                }
            }
            return true;
        });

        if (trabajadoresRenderizar.length === 0) return; // Si no hay nadie tras filtrar, saltar grupo

        // Ordenar alfabéticamente
        trabajadoresRenderizar.sort((a, b) => a.nombre.localeCompare(b.nombre));

        // Dibujar Fila Cabecera del Grupo
        htmlContent += `
            <tr class="bg-[#0b132b] text-white shadow-sm">
                <td class="px-2 py-1 font-bold text-center border-r border-[#1c2541] sticky left-0 z-30 bg-[#0b132b] min-w-[150px]" colspan="2">${grupo}</td>
                <td class="px-3 py-1 font-bold border-r border-[#1c2541] text-[11px] sticky left-[150px] z-30 bg-[#0b132b] text-[#0ea5e9] min-w-[250px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.1)]" colspan="1">${capataz ? 'CAPATAZ: ' + capataz : ''}</td>
                <td class="px-2 py-1 bg-[#0b132b] sticky left-[400px] z-30 min-w-[80px]"></td>
                <td class="px-2 py-1 bg-[#0b132b] sticky left-[480px] z-30 min-w-[150px] shadow-[4px_0_6px_-2px_rgba(0,0,0,0.1)] border-r-2 border-r-dashed border-r-slate-400"></td>
                <td colspan="${dias.length}" class="px-2 py-1 bg-[#0b132b]"></td>
            </tr>
        `;

        // Dibujar Trabajadores
        trabajadoresRenderizar.forEach(t => {
            htmlContent += `
                <tr class="hover:bg-slate-100 transition-colors ${asistFiltros.tipo === 'EXTRA' ? 'bg-[#FFEBEE]/30' : ''}">
                    <td class="px-1 py-1 text-center font-medium border-l border-slate-200 text-slate-500 sticky left-0 z-20 ${asistFiltros.tipo === 'EXTRA' ? 'bg-[#fff5f6]' : 'bg-white'} min-w-[30px] max-w-[30px] w-[30px] truncate">${itemContador++}</td>
                    <td class="px-2 py-1 text-center border-l border-slate-200 text-[10px] sticky left-[30px] z-20 ${asistFiltros.tipo === 'EXTRA' ? 'bg-[#fff5f6]' : 'bg-white'} min-w-[120px] max-w-[120px] w-[120px] truncate" title="${grupo}">${grupo}</td>
                    <td class="px-3 py-1 border-l border-slate-200 text-[11px] font-semibold text-slate-700 sticky left-[150px] z-20 ${asistFiltros.tipo === 'EXTRA' ? 'bg-[#fff5f6]' : 'bg-white'} min-w-[250px] max-w-[250px] w-[250px] truncate shadow-[4px_0_6px_-2px_rgba(0,0,0,0.05)]" title="${t.nombre}">${t.nombre}</td>
                    <td class="px-2 py-1 text-center border-l border-slate-200 text-[11px] text-slate-500 sticky left-[400px] z-20 ${asistFiltros.tipo === 'EXTRA' ? 'bg-[#fff5f6]' : 'bg-white'} min-w-[80px] max-w-[80px] w-[80px] truncate">${t.dni}</td>
                    <td class="px-2 py-1 text-center border-l border-r-2 border-r-dashed border-r-slate-400 text-[9px] leading-tight text-slate-600 sticky left-[480px] z-20 ${asistFiltros.tipo === 'EXTRA' ? 'bg-[#fff5f6]' : 'bg-white'} min-w-[150px] max-w-[150px] w-[150px] truncate shadow-[4px_0_6px_-2px_rgba(0,0,0,0.05)]" title="${t.cargo}">${t.cargo}</td>
            `;

            // Marcas
            dias.forEach(d => {
                const marca = t.marcas[d] ? t.marcas[d].toUpperCase() : '';
                
                // Fondo azul claro/bajo si el día no tiene registros en todo el padrón
                let bgCls = diasVacios.has(d) ? 'bg-[#f0f9ff]' : '';
                let textCls = 'text-slate-800';
                
                if (marca === 'F') {
                    bgCls = 'bg-red-500';
                    textCls = 'text-white font-bold';
                } else if (marca === 'P') {
                    textCls = 'text-emerald-700 font-bold';
                } else if (marca) {
                    textCls = 'text-amber-700 font-bold';
                }

                // Ajuste de borde ligeramente más azul si es día vacío
                const borderCls = diasVacios.has(d) ? 'border-blue-100' : 'border-slate-200';

                htmlContent += `<td class="p-0 text-center border-l ${borderCls} text-[11px] min-w-[32px] max-w-[32px] w-[32px] ${bgCls} ${textCls}">${marca}</td>`;
            });

            htmlContent += `</tr>`;
        });
    });

    if (htmlContent === '') {
        htmlContent = `<tr><td colspan="${5 + dias.length}" class="p-8 text-center text-slate-500">No se encontraron resultados</td></tr>`;
    }

    aDom.tablaBody.innerHTML = htmlContent;
}

// Event Listeners de Filtros
function aplicarFiltrosAsistencia() {
    asistFiltros.grupo = aDom.filterGrupo.value;
    asistFiltros.cargo = aDom.filterCargo.value;
    asistFiltros.nombre = aDom.filterNombre.value.trim();
    guardarFiltrosAsistencia();
    renderizarAsistencia();
}

aDom.filterGrupo.addEventListener('change', aplicarFiltrosAsistencia);
aDom.filterCargo.addEventListener('change', aplicarFiltrosAsistencia);
aDom.btnBuscar.addEventListener('click', aplicarFiltrosAsistencia);
aDom.filterNombre.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        aplicarFiltrosAsistencia();
    }
});

// ==========================================
// EXPORTACIÓN EXCEL ASISTENCIA
// ==========================================
async function exportarExcelAsistencia() {
    const tbody = aDom.tablaBody;
    if (!tbody || tbody.querySelectorAll('tr').length === 0 || tbody.innerText.includes('No se encontraron')) {
        alert('No hay registros para exportar.');
        return;
    }
    const btn = document.getElementById('btn-asist-export-xlsx');
    const origText = btn ? btn.innerHTML : '';
    try {
        if (btn) { btn.innerHTML = 'Generando Excel...'; btn.disabled = true; }
        
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Asistencia');
        
        // Analizar Thead para extraer días
        const thead = aDom.tablaHead;
        const ths = thead.querySelectorAll('th');
        const numDias = ths.length - 5;
        
        let columns = [
            { key: 'item', width: 5 },
            { key: 'grupo', width: 15 },
            { key: 'nombre', width: 35 },
            { key: 'dni', width: 12 },
            { key: 'cargo', width: 20 }
        ];
        for (let i=0; i<numDias; i++) columns.push({ key: `d${i}`, width: 4 });
        ws.columns = columns;

        const row1 = ws.getRow(1);
        const row2 = ws.getRow(2);
        row1.height = 20;
        row2.height = 15;
        
        row1.getCell(1).value = 'ITEM';
        row1.getCell(2).value = 'GRUPO';
        row1.getCell(3).value = 'NOMBRE';
        row1.getCell(4).value = 'DNI';
        row1.getCell(5).value = 'CARGO';

        for (let i=5; i<ths.length; i++) {
            const spans = ths[i].querySelectorAll('span');
            if (spans.length >= 2) {
                row1.getCell(i+1).value = spans[0].innerText;
                row2.getCell(i+1).value = spans[1].innerText;
            }
        }

        for (let i = 1; i <= 5; i++) {
            ws.mergeCells(1, i, 2, i);
        }

        for (let i = 1; i <= 2; i++) {
            ws.getRow(i).eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B132B' } };
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = { top: { style:'thin', color:{argb:'FFCBCFD8'} }, bottom: { style:'thin', color:{argb:'FFCBCFD8'} }, left: { style:'thin', color:{argb:'FFCBCFD8'} }, right: { style:'thin', color:{argb:'FFCBCFD8'} } };
            });
        }

        let currentRow = 3;
        const trs = tbody.querySelectorAll('tr');
        
        trs.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            const wsRow = ws.getRow(currentRow);
            
            if (tr.classList.contains('bg-[#0b132b]')) {
                wsRow.getCell(1).value = tds[0] ? tds[0].innerText : '';
                ws.mergeCells(currentRow, 1, currentRow, 2);
                wsRow.getCell(3).value = tds[1] ? tds[1].innerText : '';
                ws.mergeCells(currentRow, 3, currentRow, 5);
                
                wsRow.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B132B' } };
                    cell.font = { bold: true, color: { argb: 'FF0EA5E9' }, size: 10 };
                    cell.alignment = { vertical: 'middle', horizontal: 'left' };
                });
            } else {
                for (let i=0; i<tds.length; i++) {
                    const c = wsRow.getCell(i+1);
                    c.value = tds[i].innerText;
                    c.alignment = { vertical: 'middle', horizontal: i < 2 ? 'center' : (i===2?'left':'center') };
                    c.border = { top: { style:'thin', color:{argb:'FFCBCFD8'} }, bottom: { style:'thin', color:{argb:'FFCBCFD8'} }, left: { style:'thin', color:{argb:'FFCBCFD8'} }, right: { style:'thin', color:{argb:'FFCBCFD8'} } };
                    
                    if (i >= 5) {
                        const m = tds[i].innerText;
                        if (m === 'P') c.font = { color: { argb: 'FF059669' }, bold: true };
                        else if (m === 'F') c.font = { color: { argb: 'FFDC2626' }, bold: true };
                        else if (m) c.font = { color: { argb: 'FFD97706' }, bold: true };
                    }
                }
            }
            currentRow++;
        });

        ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 2 }];
        const buffer = await wb.xlsx.writeBuffer();
        const nombreArchivo = `Asistencia_${asistFiltros.mes}_${asistFiltros.tipo}_${new Date().toISOString().slice(0,10)}.xlsx`;
        saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo);

    } catch(e) {
        console.error(e); alert('Error al generar Excel: ' + e.message);
    } finally {
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
    }
}

// ==========================================
// EXPORTACIÓN PDF ASISTENCIA
// ==========================================
async function exportarPDFAsistencia() {
    const tbody = aDom.tablaBody;
    if (!tbody || tbody.querySelectorAll('tr').length === 0 || tbody.innerText.includes('No se encontraron')) {
        alert('No hay registros para exportar.');
        return;
    }
    const btn = document.getElementById('btn-asist-export-pdf');
    const origText = btn ? btn.innerHTML : '';
    try {
        if (btn) { btn.innerHTML = 'Generando PDF...'; btn.disabled = true; }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'pt', 'a4'); 
        
        const thead = aDom.tablaHead;
        const ths = thead.querySelectorAll('th');
        
        const cabeceraDiaNums = ['ITEM', 'GRUPO', 'NOMBRE', 'DNI', 'CARGO'];
        const cabeceraDiaNoms = ['', '', '', '', ''];
        
        for (let i=5; i<ths.length; i++) {
            const spans = ths[i].querySelectorAll('span');
            if (spans.length >= 2) {
                cabeceraDiaNums.push(spans[0].innerText);
                cabeceraDiaNoms.push(spans[1].innerText);
            }
        }
        
        const headRows = [cabeceraDiaNums, cabeceraDiaNoms];
        const bodyRows = [];
        
        const trs = tbody.querySelectorAll('tr');
        trs.forEach(tr => {
            const rowData = [];
            const tds = tr.querySelectorAll('td');
            if (tr.classList.contains('bg-[#0b132b]')) {
                const grupoTxt = tds[0] ? tds[0].innerText : '';
                const capatazTxt = tds[1] ? tds[1].innerText : '';
                rowData.push(grupoTxt + " " + capatazTxt);
                for (let i=1; i<cabeceraDiaNums.length; i++) rowData.push('');
                bodyRows.push({ content: rowData, styles: { fillColor: [11,19,43], textColor: [14,165,233], fontStyle: 'bold' }});
            } else {
                for (let i=0; i<tds.length; i++) {
                    rowData.push(tds[i].innerText);
                }
                bodyRows.push(rowData);
            }
        });
        
        doc.autoTable({
            head: headRows,
            body: bodyRows.map(r => r.content ? r.content : r),
            startY: 40,
            theme: 'grid',
            styles: { fontSize: 6, valign: 'middle', halign: 'center', cellPadding: 1, lineWidth: 0.1, lineColor: [200,200,200] },
            headStyles: { fillColor: [11,19,43], textColor: [255,255,255], fontSize: 6 },
            columnStyles: { 2: { cellWidth: 70, halign:'left' }, 3: { cellWidth: 35 }, 4: { cellWidth: 50 } },
            didParseCell: function(data) {
                if (data.section === 'body') {
                    const rowInfo = bodyRows[data.row.index];
                    if (rowInfo && rowInfo.styles) {
                        data.cell.styles.fillColor = rowInfo.styles.fillColor;
                        data.cell.styles.textColor = rowInfo.styles.textColor;
                        data.cell.styles.fontStyle = rowInfo.styles.fontStyle;
                        if (data.column.index === 0) {
                            data.cell.colSpan = cabeceraDiaNums.length;
                        }
                    } else if (data.column.index >= 5) {
                        const m = data.cell.raw;
                        if (m === 'P') data.cell.styles.textColor = [5, 150, 105]; // emerald
                        else if (m === 'F') data.cell.styles.textColor = [220, 38, 38]; // red
                        else if (m) data.cell.styles.textColor = [217, 119, 6]; // amber
                        data.cell.styles.fontStyle = 'bold';
                    }
                } else if (data.section === 'head') {
                    if (data.row.index === 0 && data.column.index < 5) {
                        data.cell.rowSpan = 2;
                    }
                }
            }
        });
        
        const nombreArchivo = `Asistencia_${asistFiltros.mes}_${asistFiltros.tipo}_${new Date().toISOString().slice(0,10)}.pdf`;
        doc.save(nombreArchivo);
    } catch(e) { console.error(e); alert('Error al generar PDF.'); }
    finally { if (btn) { btn.innerHTML = origText; btn.disabled = false; } }
}

// Bindeo de botones de exportación Asistencia
document.addEventListener('DOMContentLoaded', () => {
    const btnAsistExcel = document.getElementById('btn-asist-export-xlsx');
    const btnAsistPdf = document.getElementById('btn-asist-export-pdf');
    if (btnAsistExcel) btnAsistExcel.addEventListener('click', exportarExcelAsistencia);
    if (btnAsistPdf) btnAsistPdf.addEventListener('click', exportarPDFAsistencia);
});
