// ==========================================
// MÓDULO METRADOS
// Visualización acumulada desde MET ACUM.
// La exportación continúa leyendo exclusivamente la hoja METRADOS.
// ==========================================

const METRADOS_SHEET_ID = '1njOr6ofptBELf1Ja7Hw4w7HakcOqqkagAnZta4nBGVA';
const MET_ACUM_CSV_URL  = `https://docs.google.com/spreadsheets/d/${METRADOS_SHEET_ID}/export?format=csv&gid=1620245158`;
const ACTIVIDADES_CSV_URL = `https://docs.google.com/spreadsheets/d/${METRADOS_SHEET_ID}/export?format=csv&gid=1734814133`;
const EJES_TRAMOS_CSV_URL = 'CSV HITOS Y EJE/EJES_TRAMOS.csv';
const HITOS_REALES_CSV_URL = 'CSV HITOS Y EJE/HITOS_REALES.csv';
const CRS_UTM_18S_MET = '+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs';
const TRAMOS_MET = ['TRAMO I', 'TRAMO II', 'TRAMO III', 'TRAMO IV', 'TRAMO V', 'TRAMO VI', 'TRAMO VII'];
const COLORES_MESES_MET = ['#2563eb', '#eab308', '#dc2626', '#16a34a', '#9333ea', '#ea580c'];
const MESES_NOMBRE_MET = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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
// Copia íntegra de A:L en el orden físico recibido de la hoja. Esta colección
// es exclusiva para Excel: nunca se ordena ni se limita por filtros visuales.
let datosMetradosExportacion = [];
let filtradosMetrados   = [];
let paginaMetrados      = 1;
const ITEMS_POR_PAG_MET = 15;
let criteriosMet        = [];
let metradosCargados    = false;
let datosMapaMetCargados = false;
let cargaMapaMetEnCurso = null;
let tramoActivoMet = 'TRAMO I';
let subvistaActivaMet = 'mapa';
let mapaMet = null;
let capaEjeMet = null;
let capaActividadesMet = null;
let ejesPorTramoMet = new Map();
let hitosPorTramoMet = new Map();
let rangosTramoMet = [];
let actividadesConfigMet = new Map();
let coloresMesMet = new Map();
let ordenSeleccionMesesMet = [];
let periodosDisponiblesMet = [];
let filtroGeneralMet = { actividad: 'ALL', desde: '', hasta: '' };
let periodoDetalleMet = '';
// Subbase común creada por CARGAR. Tabla conserva todas las filas; mapa y
// análisis consumen exclusivamente su derivación cartográfica válida.
let subBaseFiltradaMet = [];
let subBaseValidaMet = [];
let subBaseInvalidaMet = [];
let tramoSubBaseMet = new Map();
// Conserva miniaturas recientes para evitar volver a solicitarlas al paginar,
// ordenar o aplicar filtros. El límite protege la memoria del navegador.
const CACHE_MINIATURAS_MET = new Map();
const MAX_CACHE_MINIATURAS_MET = 150;
const TAMANO_LOTE_MINIATURAS_MET = 20;

// ==========================================
// SELECTORES DOM (acceso lazy)
// ==========================================
function $m(id) { return document.getElementById(id); }

// ==========================================
// INICIALIZACIÓN
// ==========================================
function inicializarMetrados() {
    if (metradosCargados) {
        asegurarMapaMetradosVisible();
        return;
    }
    cargarDatosMetrados();
}

function limpiarFiltrosMetrados() {
    tramoActivoMet = 'TRAMO I';
    document.querySelectorAll('.met-tramo-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tramo === tramoActivoMet));
    if (datosMapaMetCargados) _establecerFiltroPredeterminadoMet(true);
}

// ==========================================
// CARGA Y PARSEO DE DATOS
// ==========================================
function cargarDatosMetrados() {
    const loading = $m('met-loading');
    if (loading) loading.classList.remove('hidden');

    Papa.parse(MET_ACUM_CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
            const filasLeidas = procesarDatosMetrados(results.data);
            // La tabla solo muestra registros con actividad, pero el Excel debe
            // conservar cualquier fila que tenga información en A:L y respetar
            // exactamente la posición de origen.
            datosMetradosExportacion = filasLeidas.filter(_tieneDatosExportablesMet);
            datosMetrados     = datosMetradosExportacion.filter(d => d.actividad !== '');
            filtradosMetrados = [...datosMetrados];
            metradosCargados  = true;

            try {
                await cargarDatosGeograficosMet();
            } catch (error) {
                console.error('No se pudo preparar el mapa de metrados:', error);
                const estado = $m('met-map-status');
                if (estado) estado.textContent = `No se pudo cargar el mapa: ${error.message || error}`;
            } finally {
                if (loading) loading.classList.add('hidden');
            }
        },
        error: () => {
            if (loading) loading.innerHTML =
                `<p class="text-red-500 font-bold text-center p-8">Error al cargar MET ACUM. Revisa la conexión o verifica que la hoja exista y sea pública.</p>`;
        }
    });
}

function procesarDatosMetrados(raw) {
    return raw.map((fila, ordenHoja) => {
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
            ordenHoja,
            fecha:             valor('FECHA'),
            grupo:             valor('GRUPO'),
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
    });
}

function _tieneDatosExportablesMet(d) {
    return [
        d.fecha, d.actividad, d.partida, d.kmInicial, d.kmFinal, d.lado,
        d.metrado, d.unidad, d.tramo, d.fotoAntes, d.fotoDurante, d.fotoDespues,
        d.driveIdAntes, d.driveIdDurante, d.driveIdDespues
    ].some(valor => String(valor || '').trim() !== '');
}

function _leerRegistrosParaExcelMet() {
    // Excel no se construye desde la tabla renderizada ni desde el CSV que
    // procesa PapaParse. Se consulta la respuesta estructurada de Google
    // Sheets, cuya propiedad table.rows conserva una entrada por cada fila.
    const url = `https://docs.google.com/spreadsheets/d/${METRADOS_SHEET_ID}/gviz/tq?tqx=out:json&sheet=METRADOS&_export=${Date.now()}`;
    return fetch(url)
        .then(resp => {
            if (!resp.ok) throw new Error(`Google Sheets respondió HTTP ${resp.status}`);
            return resp.text();
        })
        .then(texto => {
            const inicio = texto.indexOf('{');
            const fin = texto.lastIndexOf('}');
            if (inicio < 0 || fin < inicio) throw new Error('Respuesta inválida de Google Sheets.');

            const tabla = JSON.parse(texto.slice(inicio, fin + 1)).table;
            const encabezados = tabla.cols.map(col => String(col.label || '').trim());
            const filas = tabla.rows || [];
            const datosCrudos = filas.map(fila => {
                const registro = {};
                encabezados.forEach((encabezado, indice) => {
                    if (!encabezado) return;
                    const celda = fila.c?.[indice];
                    // f conserva exactamente el texto mostrado por Sheets:
                    // fechas, progresivas como 16+000 y números formateados.
                    registro[encabezado] = celda ? (celda.f ?? celda.v ?? '') : '';
                });
                return registro;
            });
            const registros = procesarDatosMetrados(datosCrudos);
            if (registros.length !== filas.length) {
                throw new Error(`Control de integridad falló: Sheets entregó ${filas.length} filas y se prepararon ${registros.length}.`);
            }
            return registros.sort((a, b) => a.ordenHoja - b.ordenHoja);
        });
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

function _enlaceDescargaFotoMet(ref) {
    const id = _extraerDriveIdMet(ref);
    return id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` : _enlaceFotoMet(ref);
}

function _numeroKmMet(valor) {
    if (valor === undefined || valor === null || valor === '') return NaN;
    // Acepta tanto 43000 como el formato vial 43+000.
    const texto = String(valor).trim().replace(/\s/g, '').replace(',', '.');
    if (/^\d+(?:\.\d+)?\+\d+$/.test(texto)) return Number(texto.replace('+', ''));
    return Number(texto);
}

// ==========================================
// MAPA DE METRADOS
// ==========================================
async function _leerCsvMapaMet(url, nombreFuente) {
    let respuesta;
    try {
        respuesta = await fetch(url);
    } catch (error) {
        throw new Error(`${nombreFuente}: no se pudo establecer conexión.`);
    }
    if (!respuesta.ok) {
        throw new Error(`${nombreFuente}: el servidor respondió HTTP ${respuesta.status}.`);
    }
    const texto = await respuesta.text();
    const resultado = Papa.parse(texto, { header: true, skipEmptyLines: true });
    if (!resultado.data?.length) {
        throw new Error(`${nombreFuente}: el archivo está vacío o no tiene filas válidas.`);
    }
    return resultado.data;
}

function _filaNormalizadaMapaMet(fila) {
    const salida = {};
    Object.entries(fila || {}).forEach(([clave, valor]) => {
        salida[String(clave).replace(/^\uFEFF/, '').trim().toUpperCase().replace(/\s+/g, ' ')] = valor;
    });
    return salida;
}

function _claveTextoMapaMet(valor) {
    return String(valor || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/\s+/g, ' ').trim();
}

function _numeroFlexibleMapaMet(valor) {
    if (typeof valor === 'number') return valor;
    let texto = String(valor ?? '').trim().replace(/\s/g, '');
    if (texto === '') return NaN;
    if (texto.includes(',') && texto.includes('.')) {
        texto = texto.lastIndexOf('.') > texto.lastIndexOf(',')
            ? texto.replace(/,/g, '')
            : texto.replace(/\./g, '').replace(',', '.');
    } else if (texto.includes(',')) {
        texto = /^-?\d{1,3}(,\d{3})+$/.test(texto) ? texto.replace(/,/g, '') : texto.replace(',', '.');
    }
    return Number(texto);
}

async function cargarDatosGeograficosMet() {
    if (datosMapaMetCargados) {
        asegurarMapaMetradosVisible();
        return;
    }
    if (cargaMapaMetEnCurso) return cargaMapaMetEnCurso;

    cargaMapaMetEnCurso = (async () => {
        const [filasEje, filasHitos, filasActividades] = await Promise.all([
            _leerCsvMapaMet(EJES_TRAMOS_CSV_URL, 'EJES_TRAMOS.csv'),
            _leerCsvMapaMet(HITOS_REALES_CSV_URL, 'HITOS_REALES.csv'),
            _leerCsvMapaMet(ACTIVIDADES_CSV_URL, 'Hoja ACTIVIDADES')
        ]);

        ejesPorTramoMet = new Map(TRAMOS_MET.map(nombre => [nombre, []]));
        hitosPorTramoMet = new Map(TRAMOS_MET.map(nombre => [nombre, []]));
        actividadesConfigMet = new Map();

        filasEje.forEach(filaOriginal => {
            const fila = _filaNormalizadaMapaMet(filaOriginal);
            const tramo = String(fila.TRAMO || '').trim().toUpperCase();
            const punto = {
                orden: _numeroFlexibleMapaMet(fila.ORDEN),
                prog: _numeroFlexibleMapaMet(fila.PROGRESIVAS),
                este: _numeroFlexibleMapaMet(fila.ESTE),
                norte: _numeroFlexibleMapaMet(fila.NORTE)
            };
            if (ejesPorTramoMet.has(tramo) && Object.values(punto).every(Number.isFinite)) {
                ejesPorTramoMet.get(tramo).push(punto);
            }
        });
        ejesPorTramoMet.forEach(puntos => puntos.sort((a, b) => a.orden - b.orden));

        filasHitos.forEach(filaOriginal => {
            const fila = _filaNormalizadaMapaMet(filaOriginal);
            const tramo = String(fila.TRAMO || '').trim().toUpperCase();
            const punto = {
                hito: _numeroFlexibleMapaMet(fila.HITO),
                este: _numeroFlexibleMapaMet(fila.ESTE),
                norte: _numeroFlexibleMapaMet(fila.NORTE)
            };
            if (hitosPorTramoMet.has(tramo) && Object.values(punto).every(Number.isFinite)) {
                hitosPorTramoMet.get(tramo).push(punto);
            }
        });
        hitosPorTramoMet.forEach(puntos => puntos.sort((a, b) => a.hito - b.hito));

        rangosTramoMet = TRAMOS_MET.map(nombre => {
            const hitos = hitosPorTramoMet.get(nombre) || [];
            if (!hitos.length) throw new Error(`No hay hitos válidos para ${nombre}.`);
            return { nombre, min: hitos[0].hito, max: hitos[hitos.length - 1].hito };
        });

        filasActividades.forEach(filaOriginal => {
            const fila = _filaNormalizadaMapaMet(filaOriginal);
            const partida = String(fila.PARTIDA || '').trim();
            const tipo = String(fila.TIPO || '').trim().toUpperCase();
            const limite = _numeroFlexibleMapaMet(
                fila.VAL_MAXIMO ?? fila['VAL_MAXIMO DIARIO'] ?? fila['VALOR MAXIMO']
            );
            const metas = {};
            TRAMOS_MET.forEach((nombreTramo, indice) => {
                const valorMeta = _numeroFlexibleMapaMet(fila[`TRAMO ${indice + 1}`]);
                metas[nombreTramo] = Number.isFinite(valorMeta) ? valorMeta : 0;
            });
            if (partida && (tipo === 'P' || tipo === 'L') && Number.isFinite(limite) && limite > 0) {
                actividadesConfigMet.set(_claveTextoMapaMet(partida), { partida, tipo, limite, metas });
            }
        });
        if (!actividadesConfigMet.size) throw new Error('La hoja ACTIVIDADES no contiene configuraciones válidas.');

        datosMapaMetCargados = true;
        _inicializarControlGeneralMet();
        _crearMapaMetrados();
        renderizarMapaMet(true);
        actualizarAnalisisMapaMet();
    })();

    try {
        await cargaMapaMetEnCurso;
    } finally {
        cargaMapaMetEnCurso = null;
    }
}

function _crearMapaMetrados() {
    if (mapaMet || typeof L === 'undefined') return;
    mapaMet = L.map('met-map', { preferCanvas: true, zoomControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap'
    }).addTo(mapaMet);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(mapaMet);
    capaEjeMet = L.layerGroup().addTo(mapaMet);
    capaActividadesMet = L.layerGroup().addTo(mapaMet);
    L.control.zoom({ position: 'bottomleft' }).addTo(mapaMet);
    mapaMet.setView([-13.5, -74.5], 7);
}

function _utmALatLngMapaMet(este, norte) {
    if (typeof proj4 === 'undefined') return null;
    const convertido = proj4(CRS_UTM_18S_MET, 'WGS84', [Number(este), Number(norte)]);
    return [convertido[1], convertido[0]];
}

function _mesClaveMapaMet(fecha) {
    const texto = String(fecha || '').trim();
    let m = texto.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    m = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}`;
    const fechaJs = new Date(texto);
    if (!Number.isNaN(fechaJs.getTime())) return `${fechaJs.getFullYear()}-${String(fechaJs.getMonth() + 1).padStart(2, '0')}`;
    return 'SIN FECHA';
}

function _etiquetaMesMapaMet(clave) {
    if (clave === 'SIN FECHA') return 'Sin fecha';
    const [anio, mes] = clave.split('-').map(Number);
    return new Intl.DateTimeFormat('es-PE', { month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(anio, mes - 1, 1))).replace('.', '');
}

function _inicializarControlGeneralMet() {
    periodosDisponiblesMet = [...new Set(datosMetrados.map(d => _mesClaveMapaMet(d.fecha)).filter(mes => mes !== 'SIN FECHA'))].sort();
    const selectorActividad = $m('met-control-actividad');
    if (selectorActividad) {
        const partidas = [...new Set(datosMetrados.map(d => d.partida).filter(p => actividadesConfigMet.has(_claveTextoMapaMet(p))))]
            .sort((a, b) => a.localeCompare(b, 'es'));
        selectorActividad.innerHTML = '<option value="ALL">Todas las actividades</option>' + partidas
            .map(p => `<option value="${_escaparHtmlMet(p)}">${_escaparHtmlMet(p)}</option>`).join('');
    }
    const anios = [...new Set(periodosDisponiblesMet.map(periodo => periodo.slice(0, 4)))];
    ['met-control-anio-inicio', 'met-control-anio-final'].forEach(id => {
        const selector = $m(id);
        if (selector) selector.innerHTML = anios.map(anio => `<option value="${anio}">${anio}</option>`).join('');
    });
    _establecerFiltroPredeterminadoMet(true);
}

function _mesesDisponiblesAnioMet(anio) {
    return periodosDisponiblesMet.filter(periodo => periodo.startsWith(`${anio}-`)).map(periodo => periodo.slice(5));
}

function _rellenarMesesControlMet(tipo, preferido = '') {
    const anio = $m(`met-control-anio-${tipo}`)?.value || '';
    const selector = $m(`met-control-mes-${tipo}`);
    if (!selector) return;
    const meses = _mesesDisponiblesAnioMet(anio);
    selector.innerHTML = meses.map(mes => `<option value="${mes}">${MESES_NOMBRE_MET[Number(mes) - 1]}</option>`).join('');
    selector.value = meses.includes(preferido) ? preferido : (tipo === 'inicio' ? meses[0] : meses[meses.length - 1]);
}

function _establecerFiltroPredeterminadoMet(ejecutar = false) {
    if (!periodosDisponiblesMet.length) return;
    const ultimo = periodosDisponiblesMet[periodosDisponiblesMet.length - 1];
    const [anio, mes] = ultimo.split('-');
    if ($m('met-control-actividad')) $m('met-control-actividad').value = 'ALL';
    if ($m('met-control-anio-inicio')) $m('met-control-anio-inicio').value = anio;
    if ($m('met-control-anio-final')) $m('met-control-anio-final').value = anio;
    _rellenarMesesControlMet('inicio', mes);
    _rellenarMesesControlMet('final', mes);
    if (ejecutar) _buscarControlGeneralMet();
}

function _leerFiltroControlMet() {
    const actividad = $m('met-control-actividad')?.value || 'ALL';
    const desde = `${$m('met-control-anio-inicio')?.value || ''}-${$m('met-control-mes-inicio')?.value || ''}`;
    const hasta = `${$m('met-control-anio-final')?.value || ''}-${$m('met-control-mes-final')?.value || ''}`;
    return { actividad, desde, hasta };
}

function _tramoDeclaradoMet(valor) {
    const texto = String(valor || '').trim().toUpperCase().replace(/\s+/g, ' ');
    return TRAMOS_MET.find(tramo => tramo === texto) || null;
}

function _construirSubBaseMet() {
    subBaseFiltradaMet = datosMetrados.filter(d => {
        const periodo = _mesClaveMapaMet(d.fecha);
        if (periodo < filtroGeneralMet.desde || periodo > filtroGeneralMet.hasta) return false;
        return filtroGeneralMet.actividad === 'ALL' || d.partida === filtroGeneralMet.actividad;
    }).sort((a, b) => a.ordenHoja - b.ordenHoja);

    subBaseValidaMet = [];
    subBaseInvalidaMet = [];
    tramoSubBaseMet = new Map();
    subBaseFiltradaMet.forEach(original => {
        const preparado = _prepararRegistroMapaMet(original);
        if (preparado.ignorado) {
            const tramo = _tramoDeclaradoMet(original.tramo);
            subBaseInvalidaMet.push({ original, motivo: preparado.ignorado, tramo });
            if (tramo) tramoSubBaseMet.set(original, tramo);
            return;
        }
        subBaseValidaMet.push(preparado);
        tramoSubBaseMet.set(original, preparado.tramo);
    });
    _numerarRegistrosMapaMet(subBaseValidaMet);
}

function _buscarControlGeneralMet() {
    const nuevo = _leerFiltroControlMet();
    const error = $m('met-control-error');
    if (!/^\d{4}-\d{2}$/.test(nuevo.desde) || !/^\d{4}-\d{2}$/.test(nuevo.hasta) || nuevo.desde > nuevo.hasta) {
        if (error) { error.textContent = 'El periodo final no puede ser anterior al periodo inicial.'; error.classList.remove('hidden'); }
        return;
    }
    if (error) error.classList.add('hidden');
    filtroGeneralMet = nuevo;
    _construirSubBaseMet();
    _reconstruirLeyendaMapaMet();
    periodoDetalleMet = _periodosEnFiltroMet().at(-1) || nuevo.hasta;
    aplicarFiltrosMet();
}

function _periodosEnFiltroMet() {
    return periodosDisponiblesMet.filter(periodo => periodo >= filtroGeneralMet.desde && periodo <= filtroGeneralMet.hasta);
}

function _reconstruirLeyendaMapaMet() {
    const periodos = _periodosEnFiltroMet();
    const ultimo = periodos[periodos.length - 1];
    ordenSeleccionMesesMet = ultimo ? [ultimo] : [];
    coloresMesMet = new Map(ultimo ? [[ultimo, COLORES_MESES_MET[0]]] : []);
    const porAnio = new Map();
    periodos.forEach(periodo => {
        const anio = periodo.slice(0, 4);
        if (!porAnio.has(anio)) porAnio.set(anio, []);
        porAnio.get(anio).push(periodo);
    });
    const contenedor = $m('met-map-months');
    if (!contenedor) return;
    contenedor.innerHTML = [...porAnio.entries()].map(([anio, meses]) => `<div>
        <p class="text-[10px] font-extrabold text-slate-700 mb-1.5">${anio}</p>
        <div class="met-year-months">${meses.map(periodo => {
            const mes = periodo.slice(5);
            const activo = periodo === ultimo;
            const color = activo ? COLORES_MESES_MET[0] : '#94a3b8';
            return `<label class="met-month-chip cursor-pointer" style="--month-color:${color}">
                <input type="checkbox" class="sr-only" value="${periodo}" ${activo ? 'checked' : ''}>
                <span class="inline-flex items-center gap-1 px-1.5 py-1 rounded-full border border-slate-200 text-[9px] font-semibold transition">
                    <i class="met-month-dot w-2 h-2 rounded-full"></i>${MESES_NOMBRE_MET[Number(mes) - 1].slice(0, 3)}
                </span>
            </label>`;
        }).join('')}</div>
    </div>`).join('');
}

function _cambiarMesVisibleMet(input) {
    const periodo = input.value;
    if (input.checked) {
        if (ordenSeleccionMesesMet.length >= 6) {
            input.checked = false;
            const estado = $m('met-map-status');
            if (estado) estado.textContent = 'Puede mostrar como máximo 6 meses simultáneamente.';
            return;
        }
        if (!ordenSeleccionMesesMet.includes(periodo)) ordenSeleccionMesesMet.push(periodo);
        const usados = new Set(coloresMesMet.values());
        coloresMesMet.set(periodo, COLORES_MESES_MET.find(color => !usados.has(color)) || COLORES_MESES_MET[0]);
    } else {
        ordenSeleccionMesesMet = ordenSeleccionMesesMet.filter(valor => valor !== periodo);
        coloresMesMet.delete(periodo);
    }
    document.querySelectorAll('#met-map-months input').forEach(entrada => {
        const etiqueta = entrada.closest('label');
        if (etiqueta) etiqueta.style.setProperty('--month-color', entrada.checked ? (_colorMesMapaMet(entrada.value)) : '#94a3b8');
    });
    renderizarMapaMet(false);
}

function _mesesSeleccionadosMapaMet() {
    return new Set([...document.querySelectorAll('#met-map-months input[type="checkbox"]:checked')].map(input => input.value));
}

function _tramoPorKmInicialMapaMet(km) {
    if (!Number.isFinite(km) || !rangosTramoMet.length) return null;
    for (let i = 0; i < rangosTramoMet.length; i++) {
        const rango = rangosTramoMet[i];
        const ultimo = i === rangosTramoMet.length - 1;
        if (km >= rango.min && (ultimo ? km <= rango.max : km < rango.max)) return rango;
    }
    return null;
}

function _hitoMasCercanoMapaMet(tramo, km) {
    const hitos = hitosPorTramoMet.get(tramo) || [];
    if (!hitos.length || !Number.isFinite(km)) return null;
    let mejor = hitos[0];
    let distancia = Math.abs(mejor.hito - km);
    for (let i = 1; i < hitos.length; i++) {
        const actual = Math.abs(hitos[i].hito - km);
        // En empate se conserva el hito menor porque la lista es ascendente.
        if (actual < distancia) {
            mejor = hitos[i];
            distancia = actual;
        }
    }
    return mejor;
}

function _nivelMetradoMapaMet(metrado, limite) {
    if (!Number.isFinite(metrado) || !Number.isFinite(limite) || limite <= 0) return 1;
    if (metrado <= limite / 2) return 1;
    if (metrado <= limite) return 2;
    if (metrado <= limite * 2) return 3;
    return 4;
}

function _prepararRegistroMapaMet(d) {
    const configuracion = actividadesConfigMet.get(_claveTextoMapaMet(d.partida));
    if (!configuracion) return { ignorado: 'Actividad sin configuración' };

    const inicio = _numeroKmMet(d.kmInicial);
    const fin = _numeroKmMet(d.kmFinal);
    if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return { ignorado: 'Progresiva inválida' };
    const corredorMin = rangosTramoMet[0]?.min;
    const corredorMax = rangosTramoMet[rangosTramoMet.length - 1]?.max;
    if (inicio < corredorMin || inicio > corredorMax || fin < corredorMin || fin > corredorMax || fin < inicio) {
        return { ignorado: 'Fuera del corredor' };
    }

    const rango = _tramoPorKmInicialMapaMet(inicio);
    if (!rango) return { ignorado: 'Sin tramo' };
    const metrado = _numeroFlexibleMapaMet(d.metrado);
    if (!Number.isFinite(metrado)) return { ignorado: 'Metrado inválido' };
    const base = {
        original: d,
        configuracion,
        tipo: configuracion.tipo,
        tramo: rango.nombre,
        inicio,
        fin,
        metrado,
        nivel: _nivelMetradoMapaMet(metrado, configuracion.limite),
        mes: _mesClaveMapaMet(d.fecha)
    };

    if (configuracion.tipo === 'P') {
        const promedio = (inicio + fin) / 2;
        const tramoPromedio = _tramoPorKmInicialMapaMet(promedio);
        const objetivo = tramoPromedio?.nombre === rango.nombre ? promedio : inicio;
        const hito = _hitoMasCercanoMapaMet(rango.nombre, objetivo);
        return hito ? { ...base, hito, objetivo } : { ignorado: 'Sin hito puntual' };
    }

    const hitoInicio = _hitoMasCercanoMapaMet(rango.nombre, inicio);
    const finUsado = Math.min(fin, rango.max);
    const hitoFinal = _hitoMasCercanoMapaMet(rango.nombre, finUsado);
    return hitoInicio && hitoFinal
        ? { ...base, hitoInicio, hitoFinal, finUsado }
        : { ignorado: 'Sin hitos lineales' };
}

function _registrosVisiblesMapaMet() {
    const meses = _mesesSeleccionadosMapaMet();
    return subBaseValidaMet.filter(registro => registro.tramo === tramoActivoMet && meses.has(registro.mes));
}

function _numerarRegistrosMapaMet(registros) {
    _periodosEnFiltroMet().forEach(periodo => {
        let numero = 0;
        TRAMOS_MET.forEach(tramo => {
            registros
                .filter(registro => registro.mes === periodo && registro.tramo === tramo)
                .sort((a, b) => a.original.ordenHoja - b.original.ordenHoja)
                .forEach(registro => { registro.etiqueta = ++numero; });
        });
    });
}

function _actualizarResumenLeyendaMet() {
    const estado = $m('met-map-status');
    if (!estado) return;
    const filas = _periodosEnFiltroMet().map(periodo => {
        const registros = subBaseValidaMet.filter(registro => registro.tramo === tramoActivoMet && registro.mes === periodo);
        const etiquetas = registros.map(registro => registro.etiqueta).filter(Number.isFinite);
        const rango = etiquetas.length ? `etiquetas ${Math.min(...etiquetas)}–${Math.max(...etiquetas)}` : 'sin etiquetas';
        return `<div class="met-status-row"><b>${_escaparHtmlMet(_etiquetaMesMapaMet(periodo))}</b><span>${registros.length} válido(s) · ${rango}</span></div>`;
    }).join('');
    const invalidos = subBaseInvalidaMet.filter(registro => registro.tramo === tramoActivoMet).length;
    estado.innerHTML = `<div class="font-extrabold text-slate-700 mb-1">${tramoActivoMet}</div><div class="met-map-status-list">${filas}</div>${invalidos ? `<div class="mt-1.5 pt-1.5 border-t border-slate-200 text-slate-500">${invalidos} inválido(s) conservado(s) en TABLA.</div>` : ''}`;
}

function _formatearProgMapaMet(valor) {
    if (!Number.isFinite(valor)) return '-';
    const km = Math.floor(valor / 1000);
    const metros = valor - km * 1000;
    const decimales = Math.abs(metros - Math.round(metros)) > 0.001 ? 1 : 0;
    return `${km}+${metros.toFixed(decimales).padStart(decimales ? 5 : 3, '0')}`;
}

function _colorMesMapaMet(mes) {
    return coloresMesMet.get(mes) || '#2563eb';
}

function _ladosLineaMapaMet(lado) {
    const texto = _claveTextoMapaMet(lado).replace(/\s/g, '');
    if ((texto.includes('LD') && texto.includes('LI')) || texto === 'AMBOS') return ['LD', 'LI'];
    if (texto.includes('LI')) return ['LI'];
    if (texto.includes('LD')) return ['LD'];
    return ['EJE'];
}

function _segmentoEjeMapaMet(registro) {
    const eje = ejesPorTramoMet.get(registro.tramo) || [];
    const ini = registro.hitoInicio.hito;
    const fin = registro.hitoFinal.hito;
    if (ini !== fin) {
        const puntos = eje.filter(p => p.prog >= Math.min(ini, fin) && p.prog <= Math.max(ini, fin));
        if (puntos.length >= 2) return puntos.map(p => ({ este: p.este, norte: p.norte }));
    }

    const indice = Math.max(0, eje.findIndex(p => p.prog === ini));
    const centro = eje[indice] || { este: registro.hitoInicio.este, norte: registro.hitoInicio.norte };
    const anterior = eje[Math.max(0, indice - 1)] || centro;
    const siguiente = eje[Math.min(eje.length - 1, indice + 1)] || centro;
    let dx = siguiente.este - anterior.este;
    let dy = siguiente.norte - anterior.norte;
    let longitud = Math.hypot(dx, dy);
    if (!longitud) { dx = 1; dy = 0; longitud = 1; }
    const mitad = 15;
    return [
        { este: centro.este - dx / longitud * mitad, norte: centro.norte - dy / longitud * mitad },
        { este: centro.este + dx / longitud * mitad, norte: centro.norte + dy / longitud * mitad }
    ];
}

function _desplazarSegmentoMapaMet(puntos, lado, carril) {
    const signo = lado === 'LD' ? 1 : lado === 'LI' ? -1 : 0;
    const distancia = signo === 0 ? 0 : 9 + carril * 8;
    return puntos.map((punto, indice) => {
        const anterior = puntos[Math.max(0, indice - 1)];
        const siguiente = puntos[Math.min(puntos.length - 1, indice + 1)];
        let dx = siguiente.este - anterior.este;
        let dy = siguiente.norte - anterior.norte;
        let longitud = Math.hypot(dx, dy);
        if (!longitud) { dx = 1; dy = 0; longitud = 1; }
        // Normal derecha respecto al crecimiento: (dy, -dx).
        return {
            este: punto.este + signo * dy / longitud * distancia,
            norte: punto.norte - signo * dx / longitud * distancia
        };
    });
}

function _asignarCarrilesMapaMet(lineales) {
    const porLado = { LD: [], LI: [], EJE: [] };
    lineales.sort((a, b) => a.original.ordenHoja - b.original.ordenHoja).forEach(registro => {
        _ladosLineaMapaMet(registro.original.lado).forEach(lado => porLado[lado].push({
            registro,
            lado,
            ini: Math.min(registro.hitoInicio.hito, registro.hitoFinal.hito),
            fin: Math.max(registro.hitoInicio.hito, registro.hitoFinal.hito),
            carril: 0
        }));
    });

    const resultado = [];
    Object.values(porLado).forEach(elementos => {
        const carriles = [];
        elementos.forEach(elemento => {
            let carril = carriles.findIndex(intervalos => intervalos.every(i => elemento.fin < i.ini || elemento.ini > i.fin));
            if (carril < 0) { carril = carriles.length; carriles.push([]); }
            carriles[carril].push({ ini: elemento.ini, fin: elemento.fin });
            elemento.carril = carril;
            resultado.push(elemento);
        });
    });
    return resultado;
}

function _popupLineaMapaMet(registro) {
    const d = registro.original;
    return `<div class="met-popup-title">#${registro.etiqueta} · ${_escaparHtmlMet(d.partida)}</div>
        <div class="met-popup-grid">
            <div><b>Fecha</b></div><div>${_escaparHtmlMet(d.fecha || '-')}</div>
            <div><b>Tramo</b></div><div>${registro.tramo}</div>
            <div><b>KM inicio – final</b></div><div>${_formatearProgMapaMet(registro.inicio)} – ${_formatearProgMapaMet(registro.fin)}</div>
            <div><b>Metrado</b></div><div>${_escaparHtmlMet(d.metrado)} ${_escaparHtmlMet(d.unidad)}</div>
        </div>`;
}

function _popupPuntosMapaMet(grupo) {
    const primero = grupo[0];
    const actividades = new Set(grupo.map(registro => registro.original.partida));
    const titulo = actividades.size === 1 ? primero.original.partida : 'ACTIVIDADES PUNTUALES';
    const filas = grupo.map(registro => {
        const d = registro.original;
        const actividad = actividades.size > 1 ? `<div class="font-bold text-slate-900 mb-1">${_escaparHtmlMet(d.partida)}</div>` : '';
        return `<div class="mb-2 last:mb-0"><b>#${registro.etiqueta}</b>${actividad}
            <div class="met-popup-grid">
                <div><b>Fecha</b></div><div>${_escaparHtmlMet(d.fecha || '-')}</div>
                <div><b>Tramo</b></div><div>${registro.tramo}</div>
                <div><b>KM inicio – final</b></div><div>${_formatearProgMapaMet(registro.inicio)} – ${_formatearProgMapaMet(registro.fin)}</div>
                <div><b>Metrado</b></div><div>${_escaparHtmlMet(d.metrado)} ${_escaparHtmlMet(d.unidad)}</div>
            </div></div>`;
    }).join('');
    return `<div class="met-popup-title">${_escaparHtmlMet(titulo)}</div><div class="met-popup-list">${filas}</div>`;
}

function _dibujarEjeMapaMet(ajustarVista) {
    if (!mapaMet || !capaEjeMet) return;
    capaEjeMet.clearLayers();
    const eje = ejesPorTramoMet.get(tramoActivoMet) || [];
    const latLngs = eje.map(p => _utmALatLngMapaMet(p.este, p.norte)).filter(Boolean);
    if (latLngs.length < 2) return;
    const linea = L.polyline(latLngs, { color: '#0b132b', weight: 4, opacity: 0.88 }).addTo(capaEjeMet);

    const hitos = hitosPorTramoMet.get(tramoActivoMet) || [];
    hitos.filter((h, i) => h.hito % 1000 === 0 || i === 0 || i === hitos.length - 1).forEach(hito => {
        const latLng = _utmALatLngMapaMet(hito.este, hito.norte);
        if (!latLng) return;
        L.circleMarker(latLng, { radius: 3, color: '#0b132b', weight: 1, fillColor: '#ffffff', fillOpacity: 1, interactive: true })
            .bindTooltip(_formatearProgMapaMet(hito.hito), { direction: 'top', opacity: 0.9 })
            .addTo(capaEjeMet);
    });
    if (ajustarVista) mapaMet.fitBounds(linea.getBounds(), { padding: [28, 28], maxZoom: 14 });
}

function renderizarMapaMet(ajustarVista = false) {
    if (!datosMapaMetCargados || !mapaMet || !capaActividadesMet) return;
    _dibujarEjeMapaMet(ajustarVista);
    capaActividadesMet.clearLayers();

    const visibles = _registrosVisiblesMapaMet();
    const puntuales = visibles.filter(r => r.tipo === 'P');
    const lineales = visibles.filter(r => r.tipo === 'L');
    const radios = [0, 17.5, 27.5, 37.5, 47.5];

    _asignarCarrilesMapaMet(lineales).forEach(elemento => {
        const registro = elemento.registro;
        const puntos = _desplazarSegmentoMapaMet(_segmentoEjeMapaMet(registro), elemento.lado, elemento.carril);
        const latLngs = puntos.map(p => _utmALatLngMapaMet(p.este, p.norte)).filter(Boolean);
        if (latLngs.length < 2) return;
        const linea = L.polyline(latLngs, {
            color: _colorMesMapaMet(registro.mes),
            weight: 8,
            opacity: 0.84,
            lineCap: 'round',
            lineJoin: 'round'
        }).bindPopup(_popupLineaMapaMet(registro)).addTo(capaActividadesMet);
        linea.bindTooltip(String(registro.etiqueta), {
            permanent: true,
            direction: 'center',
            className: 'met-sequence-label',
            opacity: 1
        });
    });

    const gruposPuntuales = new Map();
    puntuales.forEach(registro => {
        const clave = `${registro.hito.hito}|${registro.mes}`;
        if (!gruposPuntuales.has(clave)) gruposPuntuales.set(clave, []);
        gruposPuntuales.get(clave).push(registro);
    });
    gruposPuntuales.forEach(grupo => {
        const nivel = Math.max(...grupo.map(r => r.nivel));
        const hito = grupo[0].hito;
        const color = _colorMesMapaMet(grupo[0].mes);
        const latLng = _utmALatLngMapaMet(hito.este, hito.norte);
        if (!latLng) return;
        const circulo = L.circleMarker(latLng, {
            radius: radios[nivel],
            color,
            weight: nivel === 4 ? 3 : 2,
            fillColor: color,
            fillOpacity: 0.42
        }).bindPopup(_popupPuntosMapaMet(grupo)).addTo(capaActividadesMet);
        circulo.bindTooltip(grupo.map(registro => registro.etiqueta).join(', '), {
            permanent: true,
            direction: 'center',
            className: 'met-sequence-label',
            opacity: 1
        });
    });

    _actualizarResumenLeyendaMet();
}

function actualizarAnalisisMapaMet() {
    if (!datosMapaMetCargados) return;
    const bloqueado = $m('met-analysis-locked');
    const contenido = $m('met-analysis-content');
    if (filtroGeneralMet.actividad === 'ALL') {
        bloqueado?.classList.remove('hidden');
        contenido?.classList.add('hidden');
        return;
    }
    bloqueado?.classList.add('hidden');
    contenido?.classList.remove('hidden');

    const periodos = _periodosEnFiltroMet();
    const serie = periodos.map(periodo => {
        const mensual = _datosActividadTramoMet(filtroGeneralMet.actividad, periodo, periodo)
            .reduce((suma, registro) => suma + registro.metrado, 0);
        return { clave: periodo, etiqueta: _etiquetaMesMapaMet(periodo), valor: mensual };
    });
    _renderizarGraficoMet('met-chart-monthly', serie);
    _renderizarAnilloAnualMet();
    _poblarDetalleAnalisisMet();
    _renderizarDetalleMensualMet();
}

function _fechaPartesMet(fecha) {
    const texto = String(fecha || '').trim();
    let m = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) return { dia: Number(m[1]), mes: Number(m[2]), anio: Number(m[3]) };
    m = texto.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    return m ? { dia: Number(m[3]), mes: Number(m[2]), anio: Number(m[1]) } : null;
}

function _datosActividadTramoMet(actividad, desde, hasta) {
    return subBaseValidaMet
        .filter(registro => registro.original.partida === actividad && registro.tramo === tramoActivoMet && registro.mes >= desde && registro.mes <= hasta)
        .map(registro => ({ original: registro.original, periodo: registro.mes, metrado: registro.metrado, fecha: _fechaPartesMet(registro.original.fecha) }));
}

function _formatearNumeroMet(valor, maxDecimales = 2) {
    return Number(valor || 0).toLocaleString('es-PE', { maximumFractionDigits: maxDecimales });
}

function _renderizarGraficoMet(id, datos) {
    const contenedor = $m(id);
    if (!contenedor) return;
    if (!datos.length) {
        contenedor.innerHTML = '<div class="h-64 grid place-items-center text-sm text-slate-400">Sin datos para el periodo seleccionado.</div>';
        return;
    }
    const valores = datos.map(d => d.valor);
    const maximo = Math.max(0, ...valores);
    const minimo = Math.min(...valores);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const escala = Math.max(1, maximo);
    const ancho = Math.max(680, datos.length * 70);
    const altoPlot = 233;
    const referencias = [
        { nombre: 'Máximo', valor: maximo, color: '#64748b', linea: 'rgba(100,116,139,.40)' },
        { nombre: 'Promedio', valor: media, color: '#0284c7', linea: 'rgba(14,165,233,.65)' },
        { nombre: 'Mínimo', valor: minimo, color: '#64748b', linea: 'rgba(100,116,139,.28)' }
    ];
    const lineasReferencia = referencias.map(ref => `<div class="met-ref-line" style="bottom:${36 + (ref.valor / escala) * altoPlot}px;border-color:${ref.linea}"></div>`).join('');
    const resumenFijo = referencias.map(ref => `<div class="met-chart-stat" style="color:${ref.color}"><span>${ref.nombre}</span><span>${_formatearNumeroMet(ref.valor)}</span></div>`).join('');
    const barras = datos.map(d => `<div class="met-bar-col" title="${_escaparHtmlMet(d.etiqueta)}: ${_formatearNumeroMet(d.valor)}">
        <span class="met-bar-value">${_formatearNumeroMet(d.valor)}</span>
        <div class="met-bar" style="height:${Math.max(d.valor > 0 ? 2 : 0, (d.valor / escala) * 100)}%"></div>
        <span class="met-bar-label">${_escaparHtmlMet(d.etiqueta)}</span>
    </div>`).join('');
    contenedor.innerHTML = `<div class="met-chart-shell">
        <div class="met-chart-stats-fixed">${resumenFijo}</div>
        <div class="met-chart-scroller"><div class="met-chart" style="width:max(${ancho}px, 100%)">${lineasReferencia}<div class="met-bars">${barras}</div></div></div>
    </div>`;
    const desplazamiento = contenedor.querySelector('.met-chart-scroller');
    requestAnimationFrame(() => { desplazamiento.scrollLeft = desplazamiento.scrollWidth; });
}

function _renderizarGraficoLinealMet(id, datos) {
    const contenedor = $m(id);
    if (!contenedor) return;
    if (!datos.length) {
        contenedor.innerHTML = '<div class="h-64 grid place-items-center text-sm text-slate-400">Sin datos para el periodo seleccionado.</div>';
        return;
    }
    const valores = datos.map(d => Number(d.valor) || 0);
    const significativos = valores.filter(valor => valor !== 0);
    const escala = Math.max(1, ...valores);
    const altoPlot = 233;
    const referencias = significativos.length ? [
        { nombre: 'Máximo', valor: Math.max(...significativos), color: '#64748b', linea: 'rgba(100,116,139,.40)' },
        { nombre: 'Promedio', valor: significativos.reduce((a, b) => a + b, 0) / significativos.length, color: '#0284c7', linea: 'rgba(14,165,233,.65)' },
        { nombre: 'Mínimo', valor: Math.min(...significativos), color: '#64748b', linea: 'rgba(100,116,139,.28)' }
    ] : [];
    const lineasReferencia = referencias.map(ref => `<div class="met-ref-line" style="bottom:${36 + (ref.valor / escala) * altoPlot}px;border-color:${ref.linea}"></div>`).join('');
    const resumenFijo = referencias.length
        ? referencias.map(ref => `<div class="met-chart-stat" style="color:${ref.color}"><span>${ref.nombre}</span><span>${_formatearNumeroMet(ref.valor)}</span></div>`).join('')
        : '<div class="met-chart-stat text-slate-500"><span>Sin datos</span></div>';
    const divisor = Math.max(1, datos.length - 1);
    const posiciones = datos.map((dato, indice) => ({
        dato,
        x: indice / divisor * 100,
        y: (Number(dato.valor) || 0) / escala * 100,
        indice
    }));
    const polilinea = posiciones.map(punto => `${punto.x},${100 - punto.y}`).join(' ');
    const puntos = posiciones.map(punto => `<button type="button" class="met-line-point" aria-label="${_formatearNumeroMet(punto.dato.valor)}" data-value="${_formatearNumeroMet(punto.dato.valor)}" style="left:${punto.x}%;bottom:${punto.y}%"></button>`).join('');
    const etiquetas = posiciones
        .filter(punto => punto.indice === 0 || punto.indice === datos.length - 1 || (punto.indice + 1) % 5 === 0)
        .map(punto => `<span class="met-line-axis-label" style="left:${punto.x}%">${_escaparHtmlMet(punto.dato.etiqueta)}</span>`).join('');
    contenedor.innerHTML = `<div class="met-chart-shell">
        <div class="met-chart-stats-fixed">${resumenFijo}</div>
        <div class="met-line-chart">${lineasReferencia}
            <div class="met-line-plot">
                <svg class="met-line-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${polilinea}" fill="none" stroke="#0284c7" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>
                ${puntos}
            </div>
            <div class="met-line-axis">${etiquetas}</div>
        </div>
    </div>`;
}

function _htmlAnilloMet(titulo, subtitulo, actual, meta, unidad) {
    const porcentaje = meta > 0 ? actual / meta * 100 : null;
    let fondo = 'conic-gradient(#e2e8f0 0 100%)';
    if (porcentaje !== null && porcentaje <= 100) {
        fondo = `conic-gradient(#0b132b 0 ${Math.max(0, porcentaje)}%, #e2e8f0 ${Math.max(0, porcentaje)}% 100%)`;
    } else if (porcentaje !== null) {
        const exceso = Math.min(100, porcentaje - 100);
        fondo = `conic-gradient(#dc2626 0 ${exceso}%, transparent ${exceso}% 100%), conic-gradient(#0b132b 0 100%)`;
    }
    const centro = porcentaje === null
        ? '<div class="text-xl font-extrabold text-slate-500">SIN META</div>'
        : `<div class="text-3xl font-extrabold ${porcentaje > 100 ? 'text-red-600' : 'text-[#0b132b]'}">${_formatearNumeroMet(porcentaje, 1)}%</div><div class="text-[10px] text-slate-500 mt-1">${_formatearNumeroMet(actual)} de ${_formatearNumeroMet(meta)} ${_escaparHtmlMet(unidad || '')}</div>`;
    return `<h3 class="font-bold text-slate-900 text-center">${titulo}</h3><p class="text-xs text-slate-500 text-center mb-5">${subtitulo}</p>
        <div class="met-ring" style="background:${fondo}"><div class="met-ring-center">${centro}</div></div>`;
}

function _configActividadActualMet() {
    return actividadesConfigMet.get(_claveTextoMapaMet(filtroGeneralMet.actividad));
}

function _renderizarAnilloAnualMet() {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = hoy.getMonth() + 1;
    const inicio = mes >= 9 ? anio : anio - 1;
    const desde = `${inicio}-09`;
    const hasta = `${inicio + 1}-08`;
    const numeroGestion = Math.max(1, inicio - 2024);
    const actual = _datosActividadTramoMet(filtroGeneralMet.actividad, desde, hasta).reduce((s, r) => s + r.metrado, 0);
    const config = _configActividadActualMet();
    const meta = config?.metas?.[tramoActivoMet] || 0;
    const unidad = datosMetrados.find(d => d.partida === filtroGeneralMet.actividad)?.unidad || '';
    const tarjeta = $m('met-ring-annual-card');
    if (tarjeta) tarjeta.innerHTML = _htmlAnilloMet(`Año de gestión ${numeroGestion}`, `Sep ${inicio} – Ago ${inicio + 1}`, actual, meta, unidad);
}

function _poblarDetalleAnalisisMet() {
    const periodos = _periodosEnFiltroMet();
    if (!periodos.length) return;
    if (!periodos.includes(periodoDetalleMet)) periodoDetalleMet = periodos[periodos.length - 1];
    const anios = [...new Set(periodos.map(p => p.slice(0, 4)))];
    const selectorAnio = $m('met-analysis-year');
    if (selectorAnio) {
        selectorAnio.innerHTML = anios.map(anio => `<option value="${anio}">${anio}</option>`).join('');
        selectorAnio.value = periodoDetalleMet.slice(0, 4);
    }
    _rellenarMesDetalleMet(periodoDetalleMet.slice(5));
}

function _rellenarMesDetalleMet(preferido = '') {
    const anio = $m('met-analysis-year')?.value;
    const periodos = _periodosEnFiltroMet().filter(p => p.startsWith(`${anio}-`));
    const selector = $m('met-analysis-month');
    if (!selector) return;
    selector.innerHTML = periodos.map(p => `<option value="${p.slice(5)}">${MESES_NOMBRE_MET[Number(p.slice(5)) - 1]}</option>`).join('');
    const meses = periodos.map(p => p.slice(5));
    selector.value = meses.includes(preferido) ? preferido : meses[meses.length - 1];
    periodoDetalleMet = `${anio}-${selector.value}`;
}

function _renderizarDetalleMensualMet() {
    if (!periodoDetalleMet || filtroGeneralMet.actividad === 'ALL') return;
    const [anio, mes] = periodoDetalleMet.split('-').map(Number);
    const diasMes = new Date(anio, mes, 0).getDate();
    const registros = _datosActividadTramoMet(filtroGeneralMet.actividad, periodoDetalleMet, periodoDetalleMet);
    const porDia = new Map();
    registros.forEach(r => {
        const dia = r.fecha?.dia;
        if (dia) porDia.set(dia, (porDia.get(dia) || 0) + r.metrado);
    });
    const serie = Array.from({ length: diasMes }, (_, indice) => ({ clave: indice + 1, etiqueta: String(indice + 1), valor: porDia.get(indice + 1) || 0 }));
    _renderizarGraficoLinealMet('met-chart-daily', serie);
    const actual = registros.reduce((s, r) => s + r.metrado, 0);
    const config = _configActividadActualMet();
    const metaAnual = config?.metas?.[tramoActivoMet] || 0;
    const unidad = datosMetrados.find(d => d.partida === filtroGeneralMet.actividad)?.unidad || '';
    const tarjeta = $m('met-ring-month-card');
    if (tarjeta) tarjeta.innerHTML = _htmlAnilloMet('Meta mensual', _etiquetaMesMapaMet(periodoDetalleMet), actual, metaAnual > 0 ? metaAnual / 12 : 0, unidad);
}

function seleccionarTramoMapaMet(tramo) {
    if (!TRAMOS_MET.includes(tramo)) return;
    tramoActivoMet = tramo;
    document.querySelectorAll('.met-tramo-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tramo === tramo));
    aplicarFiltrosMet();
    renderizarMapaMet(true);
}

function cambiarSubvistaMet(vista) {
    if (!['mapa', 'analisis', 'tabla'].includes(vista)) return;
    subvistaActivaMet = vista;
    document.querySelectorAll('.met-view-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.metView === vista));
    ['mapa', 'analisis', 'tabla'].forEach(nombre => {
        const panel = $m(`met-panel-${nombre}`);
        if (!panel) return;
        const activo = nombre === vista;
        panel.classList.toggle('hidden', !activo);
        if (nombre === 'tabla') panel.classList.toggle('flex', activo);
    });
    if (vista === 'mapa') setTimeout(() => mapaMet?.invalidateSize(), 50);
    if (vista === 'analisis') actualizarAnalisisMapaMet();
}

function asegurarMapaMetradosVisible() {
    if (!datosMapaMetCargados) {
        cargarDatosGeograficosMet().catch(error => console.error(error));
        return;
    }
    setTimeout(() => {
        mapaMet?.invalidateSize();
        if (subvistaActivaMet === 'mapa') renderizarMapaMet(false);
    }, 50);
}

// Excel debe recibir un número para que se pueda sumar, filtrar o reutilizar.
// La apariencia vial se aplica después mediante el formato de celda 0+000.
function _progresivaParaExcelMet(valor) {
    const numero = _numeroKmMet(valor);
    return Number.isFinite(numero) ? numero : valor;
}

function poblarSelectoresMet() {}

// ==========================================
// CONFIGURAR EVENTOS (llamado desde DOMContentLoaded)
// ==========================================
function configurarEventosMet() {
    $m('met-control-buscar')?.addEventListener('click', _buscarControlGeneralMet);
    $m('met-control-limpiar')?.addEventListener('click', () => _establecerFiltroPredeterminadoMet(true));
    $m('met-control-anio-inicio')?.addEventListener('change', () => _rellenarMesesControlMet('inicio'));
    $m('met-control-anio-final')?.addEventListener('change', () => _rellenarMesesControlMet('final'));

    document.querySelectorAll('.met-tramo-tab').forEach(btn => {
        btn.addEventListener('click', () => seleccionarTramoMapaMet(btn.dataset.tramo));
    });
    document.querySelectorAll('.met-view-tab').forEach(btn => {
        btn.addEventListener('click', () => cambiarSubvistaMet(btn.dataset.metView));
    });
    $m('met-map-months')?.addEventListener('change', evento => {
        if (evento.target.matches('input[type="checkbox"]')) _cambiarMesVisibleMet(evento.target);
    });
    $m('met-analysis-year')?.addEventListener('change', () => {
        _rellenarMesDetalleMet();
        _renderizarDetalleMensualMet();
    });
    $m('met-analysis-month')?.addEventListener('change', evento => {
        periodoDetalleMet = `${$m('met-analysis-year').value}-${evento.target.value}`;
        _renderizarDetalleMensualMet();
    });
}

// ==========================================
// FILTRADO Y ORDENAMIENTO
// ==========================================
function aplicarFiltrosMet() {
    // TABLA conserva también las filas inválidas para facilitar su auditoría.
    filtradosMetrados = subBaseFiltradaMet.filter(d => tramoSubBaseMet.get(d) === tramoActivoMet);
    filtradosMetrados.sort((a, b) => a.ordenHoja - b.ordenHoja);
    renderizarTablaMet();
    renderizarMapaMet(false);
    actualizarAnalisisMapaMet();
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
        <th class="px-3 py-4 text-center">Fecha</th>
        <th class="px-3 py-4 text-center border-l border-slate-200">Actividad</th>
        <th class="px-4 py-4 text-center border-l border-slate-200 min-w-[300px]">Partida</th>
        <th class="px-3 py-4 text-center border-l border-slate-200">KM inicial</th>
        <th class="px-3 py-4 text-center border-l border-slate-200">KM final</th>
        <th class="px-3 py-4 text-center border-l border-slate-200">Lado</th>
        <th class="px-3 py-4 text-center border-l border-slate-200">Metrado</th>
        <th class="px-3 py-4 text-center border-l border-slate-200">Unidad</th>
        <th class="px-3 py-4 text-center border-l border-slate-200">Tramo</th>
        <th class="px-3 py-4 text-center border-l border-slate-200">Grupo</th>
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

function _guardarMiniaturaMet(id, dataUrl) {
    if (!id || !dataUrl) return;
    if (CACHE_MINIATURAS_MET.has(id)) CACHE_MINIATURAS_MET.delete(id);
    CACHE_MINIATURAS_MET.set(id, dataUrl);
    while (CACHE_MINIATURAS_MET.size > MAX_CACHE_MINIATURAS_MET) {
        CACHE_MINIATURAS_MET.delete(CACHE_MINIATURAS_MET.keys().next().value);
    }
}

async function renderizarTablaMetLegacy() {
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
            <td class="px-2 py-3 w-[90px] min-w-[90px] whitespace-normal break-words border-l border-slate-200">
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
        // El ID del contenedor debe coincidir exactamente con el creado por
        // _celda_foto_met: incluye tipo, índice global y DRIVE_ID.
        if (d.driveIdAntes)   ids.push({ id: d.driveIdAntes,   containerId: `met-foto-A-${gIdx}-${d.driveIdAntes}` });
        if (d.driveIdDurante) ids.push({ id: d.driveIdDurante, containerId: `met-foto-D-${gIdx}-${d.driveIdDurante}` });
        if (d.driveIdDespues) ids.push({ id: d.driveIdDespues, containerId: `met-foto-E-${gIdx}-${d.driveIdDespues}` });
    });

    const uniqueIds = [...new Set(ids.map(x => x.id))];
    const pintarMiniaturas = (fuente) => {
        ids.forEach(({ id, containerId }) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            if (fuente[id]) {
                container.innerHTML = `<img src="${fuente[id]}" loading="lazy" class="foto-miniatura" alt="Foto de metrado">`;
            }
        });
    };

    // Mostrar inmediatamente las miniaturas ya descargadas en esta sesión.
    const enCache = Object.fromEntries(CACHE_MINIATURAS_MET.entries());
    pintarMiniaturas(enCache);
    const idsPendientes = uniqueIds.filter(id => !CACHE_MINIATURAS_MET.has(id));

    if (idsPendientes.length > 0 && typeof GAS_THUMBS_URL !== 'undefined' && GAS_THUMBS_URL !== 'PEGAR_AQUI_LA_URL_DEL_SCRIPT_MINIATURAS') {
        // Un panel puede tener 75 fotos. Apps Script responde mejor a lotes
        // pequeños; cada lote pinta sus fotos antes de pedir el siguiente.
        for (let i = 0; i < idsPendientes.length; i += TAMANO_LOTE_MINIATURAS_MET) {
            const lote = idsPendientes.slice(i, i + TAMANO_LOTE_MINIATURAS_MET);
            try {
                const resp = await fetch(GAS_THUMBS_URL, { method: 'POST', body: JSON.stringify({ ids: lote }) });
                const data = await resp.json();
                if (data.success && data.data) {
                    Object.entries(data.data).forEach(([id, dataUrl]) => _guardarMiniaturaMet(id, dataUrl));
                    pintarMiniaturas(data.data);
                }
            } catch (e) {
                console.warn('No se pudo cargar un lote de miniaturas de Metrados:', e);
            }

            // Solo las fotos de este lote que realmente fallaron muestran el
            // enlace de respaldo; las demás continúan cargando normalmente.
            lote.forEach(id => {
                if (CACHE_MINIATURAS_MET.has(id)) return;
                ids.filter(item => item.id === id).forEach(({ containerId }) => {
                    const container = document.getElementById(containerId);
                    if (container) container.innerHTML = `<span class="text-xs text-slate-400">🔗 Ver foto</span>`;
                });
            });
        }
    }
}

function renderizarTablaMet() {
    construirCabecerasMet();
    const tbody = $m('met-tabla-body');
    const info = $m('met-table-info');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!filtradosMetrados.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-12 text-slate-500">No se encontraron resultados para el filtro general.</td></tr>';
        if (info) info.textContent = '0 registros';
        return;
    }
    const fragmento = document.createDocumentFragment();
    filtradosMetrados.forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'bg-white hover:bg-blue-50 transition-colors';
        tr.innerHTML = `
            <td class="px-3 py-2.5 text-center text-[11px] font-mono text-slate-600">${_escaparHtmlMet(d.fecha || '-')}</td>
            <td class="px-3 py-2.5 border-l border-slate-200 text-xs font-semibold text-slate-700">${_escaparHtmlMet(d.actividad || '-')}</td>
            <td class="px-4 py-2.5 border-l border-slate-200 text-xs text-slate-700">${_escaparHtmlMet(d.partida || '-')}</td>
            <td class="px-3 py-2.5 text-center border-l border-slate-200 text-[11px] font-mono">${_escaparHtmlMet(d.kmInicial || '-')}</td>
            <td class="px-3 py-2.5 text-center border-l border-slate-200 text-[11px] font-mono">${_escaparHtmlMet(d.kmFinal || '-')}</td>
            <td class="px-3 py-2.5 text-center border-l border-slate-200 text-[11px]">${_escaparHtmlMet(d.lado || '-')}</td>
            <td class="px-3 py-2.5 text-center border-l border-slate-200 text-xs font-bold">${_escaparHtmlMet(d.metrado || '-')}</td>
            <td class="px-3 py-2.5 text-center border-l border-slate-200 text-[11px]">${_escaparHtmlMet(d.unidad || '-')}</td>
            <td class="px-3 py-2.5 text-center border-l border-slate-200 text-[11px]">${_escaparHtmlMet(d.tramo || tramoActivoMet)}</td>
            <td class="px-3 py-2.5 text-center border-l border-slate-200 text-[11px]">${_escaparHtmlMet(d.grupo || '-')}</td>`;
        fragmento.appendChild(tr);
    });
    tbody.appendChild(fragmento);
    if (info) info.textContent = `${filtradosMetrados.length.toLocaleString('es-PE')} registros · ${tramoActivoMet} · ${_etiquetaMesMapaMet(filtroGeneralMet.desde)} a ${_etiquetaMesMapaMet(filtroGeneralMet.hasta)}`;
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
    const btn = document.getElementById('btn-export-metrados');
    const origText = btn ? btn.innerHTML : '';
    try {
        if (btn) { btn.innerHTML = 'Leyendo METRADOS...'; btn.disabled = true; }
        const registros = await _leerRegistrosParaExcelMet();
        if (registros.length === 0) { alert('No hay registros para exportar.'); return; }

        if (btn) btn.innerHTML = 'Construyendo Excel...';
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('METRADOS');
        ws.columns = [
            { header: 'FECHA',        key: 'fecha',     width: 14 },
            { header: 'ACTIVIDAD',    key: 'actividad', width: 16 },
            { header: 'PARTIDA',      key: 'partida',   width: 42 },
            { header: 'KM INICIAL',   key: 'kmi',       width: 14 },
            { header: 'KM FINAL',     key: 'kmf',       width: 14 },
            { header: 'LADO',         key: 'lado',      width: 10 },
            { header: 'METRADO',      key: 'metrado',   width: 12 },
            { header: 'UNIDAD',       key: 'unidad',    width: 10 },
            { header: 'TRAMO',        key: 'tramo',     width: 14 },
            { header: 'FOTO_ANTES',   key: 'fotoA',     width: 22 },
            { header: 'FOTO_DURANTE', key: 'fotoD',     width: 22 },
            { header: 'FOTO_DESPUES', key: 'fotoE',     width: 22 },
        ];
        const hr = ws.getRow(1);
        hr.height = 25;
        hr.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B132B' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });
        registros.forEach((d, i) => {
            const row = ws.addRow({
                fecha: d.fecha, actividad: d.actividad, partida: d.partida,
                kmi: _progresivaParaExcelMet(d.kmInicial),
                kmf: _progresivaParaExcelMet(d.kmFinal), lado: d.lado, metrado: d.metrado,
                unidad: d.unidad, tramo: d.tramo,
                fotoA: _refFotoMet(d, 'antes')   ? { text: 'DESCARGAR FOTO', hyperlink: _enlaceDescargaFotoMet(_refFotoMet(d, 'antes')) } : '',
                fotoD: _refFotoMet(d, 'durante') ? { text: 'DESCARGAR FOTO', hyperlink: _enlaceDescargaFotoMet(_refFotoMet(d, 'durante')) } : '',
                fotoE: _refFotoMet(d, 'despues') ? { text: 'DESCARGAR FOTO', hyperlink: _enlaceDescargaFotoMet(_refFotoMet(d, 'despues')) } : ''
            });
            row.height = 22;
            row.eachCell(cell => {
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.border = { top: { style:'thin', color:{argb:'FFCBCFD8'} }, bottom: { style:'thin', color:{argb:'FFCBCFD8'} }, left: { style:'thin', color:{argb:'FFCBCFD8'} }, right: { style:'thin', color:{argb:'FFCBCFD8'} } };
                if (i % 2 === 1) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF8FAFC' } };
            });
            // D y E: valor numérico real (p. ej. 15200), con vista vial 15+200.
            row.getCell('kmi').numFmt = '0"+"000';
            row.getCell('kmf').numFmt = '0"+"000';
        });
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        const buffer = await wb.xlsx.writeBuffer();
        saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Metrados_${new Date().toISOString().slice(0,10)}.xlsx`);
        console.info(`Excel METRADOS generado con ${registros.length} registros en orden de hoja.`);
        alert(`Excel generado con ${registros.length} registros de METRADOS.`);
    } catch(e) { console.error(e); alert('Error al generar Excel: ' + e.message); }
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
    return d.partida || d.actividad || 'Partida sin descripción';
}

function _textoKmWordMet(d) {
    return `KM INICIAL: ${d.kmInicial || '-'}    KM FINAL: ${d.kmFinal || '-'}`;
}

function _progresivaEnMetrosMet(valor) {
    const numero = _numeroKmMet(valor);
    if (Number.isNaN(numero)) return NaN;
    // 43+000 se interpreta como 43000; un valor 43.0 se interpreta como km.
    return numero < 1000 ? numero * 1000 : numero;
}

function _grupoPorProgresivaMet(valor) {
    const metros = _progresivaEnMetrosMet(valor);
    if (Number.isNaN(metros)) return 'SIN ASIGNAR';
    if (metros < 45000) return 'GP-01';
    if (metros < 90000) return 'GP-03';
    if (metros < 138000) return 'GP-04';
    if (metros <= 174300) return 'GP-05';
    if (metros > 174300) return 'ERROR';
    return 'SIN ASIGNAR';
}

function _tramoPorProgresivaMet(valor, tramoRegistrado) {
    const metros = _progresivaEnMetrosMet(valor);
    if (!Number.isNaN(metros)) {
        if (metros <= 23800) return 'I';
        if (metros <= 62500) return 'II';
        if (metros <= 77250) return 'III';
        if (metros <= 107850) return 'IV';
        if (metros <= 161450) return 'V';
        if (metros <= 172000) return 'VI';
        if (metros <= 174100) return 'VII';
    }
    return String(tramoRegistrado || 'SIN TRAMO').replace(/^TRAMO\s*/i, '').trim() || 'SIN TRAMO';
}

function _textoSeguroNombreArchivoMet(texto) {
    return String(texto || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

async function _generarWordUnicoMet() {
    if (filtradosMetrados.length === 0) { alert('No hay registros para exportar.'); return; }
    if (typeof docx === 'undefined') {
        alert('No se pudo cargar el generador de documentos Word. Verifica tu conexión a Internet.');
        return;
    }
    const btn = document.getElementById('met-btn-export-word') || document.getElementById('btn-export-word');
    const original = btn ? btn.innerHTML : '';
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = 'Generando Word...'; }
        filtradosMetrados.forEach((d, i) => { d.__metWordKey = String(i); });
        const imagenes = await _obtenerImagenesWordMet(filtradosMetrados);
        const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType } = docx;
        const children = [];

        filtradosMetrados.forEach((d, i) => {
            const esPrimeraHoja = i === 0;
            const altoFoto = esPrimeraHoja ? 205 : 235;
            const anchoFoto = esPrimeraHoja ? 307 : 352;

            // Solo la primera hoja lleva cabecera de fecha, grupo y tramo.
            if (esPrimeraHoja) {
                children.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 90 },
                    children: [new TextRun({ text: `FECHA: ${d.fecha || '-'}`, bold: true, font: 'Arial', size: 24 })]
                }));
                children.push(new Paragraph({
                    spacing: { after: 120 },
                    children: [new TextRun({ text: `GRUPO: ${d.grupo || d.actividad || '-'}    TRAMO: ${d.tramo || '-'}`, bold: true, font: 'Arial', size: 22 })]
                }));
            }

            // Cada partida empieza en una página nueva a partir de la segunda,
            // por lo que sus tres fotos nunca se mezclan con la partida siguiente.
            children.push(new Paragraph({
                pageBreakBefore: !esPrimeraHoja,
                alignment: AlignmentType.CENTER,
                spacing: { after: 45 },
                keepNext: true,
                children: [new TextRun({ text: _textoTituloWordMet(d), bold: true, font: 'Arial', size: 26 })]
            }));
            children.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 },
                keepNext: true,
                children: [new TextRun({ text: _textoKmWordMet(d), bold: true, font: 'Arial', size: 20 })]
            }));
            ['antes', 'durante', 'despues'].forEach(tipo => {
                const bytes = imagenes.get(`${d.__metWordKey}|${tipo}`);
                if (!bytes) return;
                children.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 75 },
                    children: [new ImageRun({ data: bytes, transformation: { height: altoFoto, width: anchoFoto } })]
                }));
            });
        });

        const documento = new Document({
            sections: [{
                properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } },
                children
            }]
        });
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

let colaWordsMet = [];

function _fechaNombreWordMet(fecha) {
    const iso = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
    const local = String(fecha || '').match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (local) return `${local[1].padStart(2, '0')}-${local[2].padStart(2, '0')}-${local[3]}`;
    return _textoSeguroNombreArchivoMet(fecha || 'SIN-FECHA');
}

function _crearColaWordsMet() {
    const trabajos = new Map();
    filtradosMetrados.forEach(d => {
        const progresiva = d.kmInicial || d.kmFinal;
        const grupo = _grupoPorProgresivaMet(progresiva);
        const tramo = _tramoPorProgresivaMet(progresiva, d.tramo);
        const clave = `${grupo}|${tramo}`;
        if (!trabajos.has(clave)) trabajos.set(clave, { grupo, tramo, registros: [], estado: 'Pendiente', error: '' });
        trabajos.get(clave).registros.push(d);
    });
    return [...trabajos.values()]
        .map((t, id) => ({ ...t, id, registros: t.registros.sort((a, b) => _progresivaEnMetrosMet(a.kmInicial) - _progresivaEnMetrosMet(b.kmInicial)) }))
        .sort((a, b) => `${a.grupo}-${a.tramo}`.localeCompare(`${b.grupo}-${b.tramo}`, undefined, { numeric: true }));
}

function _nombreWordColaMet(trabajo) {
    const grupo = String(trabajo.grupo).replace(/^GP-/i, '').padStart(2, '0');
    const fecha = _fechaNombreWordMet(trabajo.registros[0]?.fecha);
    return `GRUPO ${grupo} - ${fecha} TRAMO ${trabajo.tramo}.docx`;
}

function _mostrarColaWordsMet() {
    document.getElementById('met-word-queue')?.remove();
    const panel = document.createElement('div');
    panel.id = 'met-word-queue';
    panel.className = 'fixed inset-0 z-[100] bg-slate-950/70 flex items-center justify-center p-4';
    const filas = colaWordsMet.map(t => `<div class="flex items-center justify-between gap-4 py-3 border-b border-slate-200">
        <div><p class="font-bold text-slate-800">${_nombreWordColaMet(t)}</p><p class="text-sm text-slate-500">${t.registros.length} partidas · ${t.estado}${t.error ? `: ${t.error}` : ''}</p></div>
        <button data-word-id="${t.id}" ${t.estado === 'Generando' ? 'disabled' : ''} class="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold text-sm disabled:opacity-50">Generar y descargar</button>
    </div>`).join('');
    panel.innerHTML = `<div class="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"><div class="p-5 border-b border-slate-200 flex justify-between"><div><h2 class="font-bold text-lg">Cola de documentos Word</h2><p class="text-sm text-slate-500">${colaWordsMet.length} documento(s). Descarga uno por uno para controlar el proceso.</p></div><button id="met-word-close" class="text-2xl text-slate-500">×</button></div><div class="px-5 max-h-[65vh] overflow-y-auto">${filas}</div></div>`;
    document.body.appendChild(panel);
    panel.querySelector('#met-word-close').addEventListener('click', () => panel.remove());
    panel.querySelectorAll('[data-word-id]').forEach(b => b.addEventListener('click', () => generarWordColaMet(Number(b.dataset.wordId))));
}

async function _crearBlobWordColaMet(trabajo) {
    const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType } = docx;
    trabajo.registros.forEach((d, i) => { d.__metWordKey = String(i); });
    try {
        const imagenes = await _obtenerImagenesWordMet(trabajo.registros);
        const children = [];
        trabajo.registros.forEach((d, i) => {
            const primera = i === 0;
            const alto = primera ? 205 : 235;
            const ancho = primera ? 307 : 352;
            if (primera) {
                children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 90 }, children: [new TextRun({ text: `FECHA: ${d.fecha || '-'}`, bold: true, font: 'Arial', size: 24 })] }));
                children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `GRUPO: ${trabajo.grupo}    TRAMO: ${trabajo.tramo}`, bold: true, font: 'Arial', size: 22 })] }));
            }
            children.push(new Paragraph({ pageBreakBefore: !primera, alignment: AlignmentType.CENTER, spacing: { after: 45 }, children: [new TextRun({ text: _textoTituloWordMet(d), bold: true, font: 'Arial', size: 26 })] }));
            children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: _textoKmWordMet(d), bold: true, font: 'Arial', size: 20 })] }));
            ['antes', 'durante', 'despues'].forEach(tipo => {
                const bytes = imagenes.get(`${d.__metWordKey}|${tipo}`);
                if (bytes) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 75 }, children: [new ImageRun({ data: bytes, transformation: { height: alto, width: ancho } })] }));
            });
        });
        return await Packer.toBlob(new Document({ sections: [{ properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } }, children }] }));
    } finally {
        trabajo.registros.forEach(d => delete d.__metWordKey);
    }
}

async function generarWordColaMet(id) {
    const trabajo = colaWordsMet.find(t => t.id === id);
    if (!trabajo || trabajo.estado === 'Generando') return;
    if (typeof docx === 'undefined') { alert('No se pudo cargar el generador Word. Verifica tu conexión.'); return; }
    trabajo.estado = 'Generando'; trabajo.error = ''; _mostrarColaWordsMet();
    try {
        saveAs(await _crearBlobWordColaMet(trabajo), _nombreWordColaMet(trabajo));
        trabajo.estado = 'Descargado';
    } catch (e) {
        console.error(e);
        trabajo.estado = 'Error'; trabajo.error = e.message || 'Error desconocido';
    }
    _mostrarColaWordsMet();
}

function exportarWordMet() {
    window.open('https://drive.google.com/drive/folders/1HDNKmVu2XRf0mqtdnxd-4ndJw8hmkhJG?usp=drive_link', '_blank', 'noopener');
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
    $m('btn-export-metrados')?.addEventListener('click', exportarXLSXMet);
});
