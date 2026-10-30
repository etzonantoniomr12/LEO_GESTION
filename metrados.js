// ==========================================
// MÓDULO METRADOS
// Visualización acumulada desde MET ACUM.
// La exportación utiliza la misma subbase filtrada que alimenta TABLA.
// ==========================================

const METRADOS_SHEET_ID = '1njOr6ofptBELf1Ja7Hw4w7HakcOqqkagAnZta4nBGVA';
const MET_ACUM_CSV_URL  = `https://docs.google.com/spreadsheets/d/${METRADOS_SHEET_ID}/export?format=csv&gid=1620245158`;
const ACTIVIDADES_CSV_URL = `https://docs.google.com/spreadsheets/d/${METRADOS_SHEET_ID}/export?format=csv&gid=1734814133`;
const REPORTE_FOTOS_CSV_URL_MET = `https://docs.google.com/spreadsheets/d/${METRADOS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=REPORTE_FOTOS`;
const PROYECCION_CSV_URL_MET = `https://docs.google.com/spreadsheets/d/${METRADOS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=PROYECCION`;
const PROYECCION_WEB_APP_URL_MET = 'https://script.google.com/macros/s/AKfycbwA-MrgbwJBpwPV_kT7If6pSDQFNYHmyVDSvPKkYh8EAjhqAj1g-RzN26EsLEWVEkY5OA/exec';
const PROYECCION_TOKEN_MET = '84edc423a67b49c8a033601e091b4b09b9e3a10be1004f57b9856683bb0a785d';
const EJES_TRAMOS_CSV_URL = 'CSV HITOS Y EJE/EJES_TRAMOS.csv';
const HITOS_REALES_CSV_URL = 'CSV HITOS Y EJE/HITOS_REALES.csv';
const CRS_UTM_18S_MET = '+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs';
const TRAMOS_MET = ['TRAMO I', 'TRAMO II', 'TRAMO III', 'TRAMO IV', 'TRAMO V', 'TRAMO VI', 'TRAMO VII'];
const COLORES_MESES_MET = ['#2563eb', '#eab308', '#dc2626', '#16a34a', '#9333ea', '#ea580c'];
const MESES_NOMBRE_MET = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// --- Estado global del módulo ---
let datosMetrados       = [];
let filtradosMetrados   = [];
let metradosCargados    = false;
let datosMapaMetCargados = false;
let cargaMapaMetEnCurso = null;
let tramoActivoMet = 'TRAMO I';
let subvistaActivaMet = 'noticias';
let mapaMet = null;
let capaEjeMet = null;
let capaActividadesMet = null;
let ejesPorTramoMet = new Map();
let hitosPorTramoMet = new Map();
let rangosTramoMet = [];
let actividadesConfigMet = new Map();
let ordenActividadesMet = [];
let itemActividadMet = new Map();
let coloresMesMet = new Map();
let ordenSeleccionMesesMet = [];
let periodosDisponiblesMet = [];
let filtroGeneralMet = { actividad: 'ALL', desde: '', hasta: '' };
let periodoDetalleMet = '';
let semanaActivaMapaMet = 'TODAS';
let mesSemanaMapaMet = '';
// Subbase común creada por CARGAR. Tabla conserva todas las filas; mapa y
// análisis consumen exclusivamente su derivación cartográfica válida.
let subBaseFiltradaMet = [];
let subBaseValidaMet = [];
let subBaseInvalidaMet = [];
let tramoSubBaseMet = new Map();
let fotosNoticiasMet = [];
let cargaFotosNoticiasMet = null;
let tokenNoticiasMet = 0;
let fotosCarruselNoticiasMet = [];
let paginaCarruselNoticiasMet = 0;
let temporizadorCarruselNoticiasMet = null;
const miniaturasNoticiasMet = new Map();
const INTERVALO_CARRUSEL_NOTICIAS_MET = 7000;
let datosProyeccionMet = [];
let proyeccionCargadaMet = false;
let cargaProyeccionMet = null;
let actividadFiltroProyeccionMet = 'ALL';

// ==========================================
// SELECTORES DOM (acceso lazy)
// ==========================================
function $m(id) { return document.getElementById(id); }

// ==========================================
// INICIALIZACIÓN
// ==========================================
function inicializarMetrados() {
    cambiarSubvistaMet('noticias');
    if (metradosCargados) {
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
            datosMetrados = procesarDatosMetrados(results.data).filter(d => d.actividad !== '');
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
            // Referencias de fotos usadas únicamente al exportar METRADOS.
            driveIdAntes:      idAntes || _extraerDriveIdMet(fotoAntes),
            driveIdDurante:    idDurante || _extraerDriveIdMet(fotoDurante),
            driveIdDespues:    idDespues || _extraerDriveIdMet(fotoDespues),
            fotoAntes,
            fotoDurante,
            fotoDespues
        };
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

function _enlaceDescargaFotoMet(ref) {
    const id = _extraerDriveIdMet(ref);
    if (id) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
    return /^https?:\/\//i.test(ref) ? ref : '';
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
        ordenActividadesMet = [];
        itemActividadMet = new Map();

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

        const partidasRegistradas = new Set();
        filasActividades.forEach(filaOriginal => {
            const fila = _filaNormalizadaMapaMet(filaOriginal);
            const partida = String(fila.PARTIDA || '').trim();
            const tipo = String(fila.TIPO || '').trim().toUpperCase();
            const limite = _numeroFlexibleMapaMet(
                fila.VAL_MAXIMO ?? fila['VAL_MAXIMO DIARIO'] ?? fila['VALOR MAXIMO']
            );
            const metas = {};
            const metasValidas = {};
            TRAMOS_MET.forEach((nombreTramo, indice) => {
                const valorOriginal = fila[`TRAMO ${indice + 1}`];
                const valorMeta = _numeroFlexibleMapaMet(valorOriginal);
                metas[nombreTramo] = Number.isFinite(valorMeta) ? valorMeta : 0;
                metasValidas[nombreTramo] = String(valorOriginal ?? '').trim() !== '' && Number.isFinite(valorMeta) && valorMeta >= 0;
            });
            const clavePartida = _claveTextoMapaMet(partida);
            const item = String(fila.ITEM || '').trim();
            if (partida && !partidasRegistradas.has(clavePartida)) {
                partidasRegistradas.add(clavePartida);
                ordenActividadesMet.push(partida);
                itemActividadMet.set(clavePartida, item || String(ordenActividadesMet.length));
            }
            if (partida && (tipo === 'P' || tipo === 'L')) {
                actividadesConfigMet.set(clavePartida, {
                    partida,
                    tipo,
                    limite: Number.isFinite(limite) && limite > 0 ? limite : 0,
                    metas,
                    metasValidas
                });
            }
        });
        if (!actividadesConfigMet.size) throw new Error('La hoja ACTIVIDADES no contiene configuraciones válidas.');

        datosMapaMetCargados = true;
        _inicializarControlGeneralMet();
        _crearMapaMetrados();
        renderizarMapaMet(true);
        actualizarAnalisisMapaMet();
        if (subvistaActivaMet === 'noticias') actualizarNoticiasMet();
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
        const cortes = new Set([12, 22, 25, 28, 31, 34, 37, 41, 50]);
        const opciones = [];
        ordenActividadesMet.forEach((partida, indice) => {
            const item = itemActividadMet.get(_claveTextoMapaMet(partida)) || String(indice + 1);
            opciones.push(`<option value="${_escaparHtmlMet(partida)}">${_escaparHtmlMet(item)} · ${_escaparHtmlMet(partida)}</option>`);
            const posicion = indice + 1;
            if (cortes.has(posicion) && posicion < ordenActividadesMet.length) {
                opciones.push(`<option disabled class="font-bold text-slate-400">──────────────</option>`);
            }
        });
        selectorActividad.innerHTML = '<option value="ALL">Todas las actividades</option>' + opciones.join('');
    }
    _renderizarLeyendaActividadesNoticiasMet();
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
    _actualizarControlSemanasMapaMet(true);
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
    _actualizarControlSemanasMapaMet(false);
    renderizarMapaMet(false);
}

function _mesesSeleccionadosMapaMet() {
    return new Set([...document.querySelectorAll('#met-map-months input[type="checkbox"]:checked')].map(input => input.value));
}

function _cantidadSemanasMapaMet(periodo) {
    const [anio, mes] = periodo.split('-').map(Number);
    const diasMes = new Date(anio, mes, 0).getDate();
    const diaInicio = new Date(anio, mes - 1, 1).getDay(); // 0 domingo, 1 lunes...
    const diasPrimera = diaInicio === 0 ? 1 : 8 - diaInicio;
    return Math.min(5, 1 + Math.ceil(Math.max(0, diasMes - diasPrimera) / 7));
}

function _semanaFechaMapaMet(fecha, periodo) {
    const partes = _fechaPartesMet(fecha);
    if (!partes) return null;
    const clave = `${partes.anio}-${String(partes.mes).padStart(2, '0')}`;
    if (clave !== periodo) return null;
    const diaInicio = new Date(partes.anio, partes.mes - 1, 1).getDay();
    const diasPrimera = diaInicio === 0 ? 1 : 8 - diaInicio;
    if (partes.dia <= diasPrimera) return 1;
    return Math.min(5, 2 + Math.floor((partes.dia - diasPrimera - 1) / 7));
}

function _actualizarControlSemanasMapaMet(forzarTodas = false) {
    const meses = [..._mesesSeleccionadosMapaMet()];
    const mesUnico = meses.length === 1 ? meses[0] : '';
    if (forzarTodas || !mesUnico || mesSemanaMapaMet !== mesUnico) semanaActivaMapaMet = 'TODAS';
    mesSemanaMapaMet = mesUnico;
    const cantidad = mesUnico ? _cantidadSemanasMapaMet(mesUnico) : 0;
    document.querySelectorAll('#met-map-weeks .met-week-btn').forEach(boton => {
        const valor = boton.dataset.week;
        const esTodas = valor === 'TODAS';
        const numero = Number(valor);
        boton.disabled = !esTodas && (!mesUnico || numero > cantidad);
        boton.classList.toggle('active', valor === String(semanaActivaMapaMet));
    });
    const resumen = $m('met-map-week-status');
    resumen?.classList.toggle('hidden', !mesUnico);
}

function _seleccionarSemanaMapaMet(valor) {
    const meses = [..._mesesSeleccionadosMapaMet()];
    if (valor !== 'TODAS' && meses.length !== 1) return;
    semanaActivaMapaMet = valor;
    _actualizarControlSemanasMapaMet(false);
    renderizarMapaMet(false);
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
    const mesUnico = meses.size === 1 ? [...meses][0] : '';
    return subBaseValidaMet.filter(registro => {
        if (registro.tramo !== tramoActivoMet || !meses.has(registro.mes)) return false;
        if (!mesUnico || semanaActivaMapaMet === 'TODAS') return true;
        return _semanaFechaMapaMet(registro.original.fecha, mesUnico) === Number(semanaActivaMapaMet);
    });
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

    const resumenSemanas = $m('met-map-week-status');
    const meses = [..._mesesSeleccionadosMapaMet()];
    if (!resumenSemanas || meses.length !== 1) {
        resumenSemanas?.classList.add('hidden');
        return;
    }
    const periodo = meses[0];
    const cantidadSemanas = _cantidadSemanasMapaMet(periodo);
    const registrosMes = subBaseValidaMet.filter(registro => registro.tramo === tramoActivoMet && registro.mes === periodo);
    const filasSemanas = Array.from({ length: cantidadSemanas }, (_, indice) => {
        const semana = indice + 1;
        const cantidad = registrosMes.filter(registro => _semanaFechaMapaMet(registro.original.fecha, periodo) === semana).length;
        return `<div class="met-status-row"><b>SEM ${semana}</b><span>${cantidad} actividad(es) válida(s)</span></div>`;
    }).join('');
    const nombreMes = MESES_NOMBRE_MET[Number(periodo.slice(5)) - 1].toUpperCase();
    resumenSemanas.innerHTML = `<div class="font-extrabold text-slate-700 mb-1">MES ${nombreMes}</div><div class="met-map-status-list">${filasSemanas}</div>`;
    resumenSemanas.classList.remove('hidden');
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

function _referenciasGraficoMet(valores, ignorarCeros = false) {
    const muestra = ignorarCeros ? valores.filter(valor => valor !== 0) : valores;
    if (!muestra.length) return [];
    return [
        { nombre: 'Máximo', valor: Math.max(...muestra), color: '#64748b', linea: 'rgba(100,116,139,.40)' },
        { nombre: 'Promedio', valor: muestra.reduce((a, b) => a + b, 0) / muestra.length, color: '#0284c7', linea: 'rgba(14,165,233,.65)' },
        { nombre: 'Mínimo', valor: Math.min(...muestra), color: '#64748b', linea: 'rgba(100,116,139,.28)' }
    ];
}

function _htmlReferenciasGraficoMet(referencias, escala, altoPlot = 233) {
    return {
        lineas: referencias.map(ref => `<div class="met-ref-line" style="bottom:${36 + (ref.valor / escala) * altoPlot}px;border-color:${ref.linea}"></div>`).join(''),
        resumen: referencias.length
            ? referencias.map(ref => `<div class="met-chart-stat" style="color:${ref.color}"><span>${ref.nombre}</span><span>${_formatearNumeroMet(ref.valor)}</span></div>`).join('')
            : '<div class="met-chart-stat text-slate-500"><span>Sin datos</span></div>'
    };
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
    const escala = Math.max(1, maximo);
    const ancho = Math.max(680, datos.length * 70);
    const referencias = _htmlReferenciasGraficoMet(_referenciasGraficoMet(valores), escala);
    const barras = datos.map(d => `<div class="met-bar-col" title="${_escaparHtmlMet(d.etiqueta)}: ${_formatearNumeroMet(d.valor)}">
        <span class="met-bar-value">${_formatearNumeroMet(d.valor)}</span>
        <div class="met-bar" style="height:${Math.max(d.valor > 0 ? 2 : 0, (d.valor / escala) * 100)}%"></div>
        <span class="met-bar-label">${_escaparHtmlMet(d.etiqueta)}</span>
    </div>`).join('');
    contenedor.innerHTML = `<div class="met-chart-shell">
        <div class="met-chart-stats-fixed">${referencias.resumen}</div>
        <div class="met-chart-scroller"><div class="met-chart" style="width:max(${ancho}px, 100%)">${referencias.lineas}<div class="met-bars">${barras}</div></div></div>
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
    const escala = Math.max(1, ...valores);
    const referencias = _htmlReferenciasGraficoMet(_referenciasGraficoMet(valores, true), escala);
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
        <div class="met-chart-stats-fixed">${referencias.resumen}</div>
        <div class="met-line-chart">${referencias.lineas}
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

// ==========================================
// NOTICIAS DEL ÚLTIMO MES
// ==========================================
function _calcularRankingNoticiasMet() {
    const periodoActual = periodosDisponiblesMet.at(-1) || '';
    const periodoAnterior = periodosDisponiblesMet.at(-2) || '';
    if (!periodoActual) return null;

    const acumulados = new Map();
    datosMetrados.forEach(registro => {
        const periodo = _mesClaveMapaMet(registro.fecha);
        if (periodo !== periodoActual && periodo !== periodoAnterior) return;
        const rango = _tramoPorKmInicialMapaMet(_numeroKmMet(registro.kmInicial));
        if (rango?.nombre !== tramoActivoMet) return;
        const metrado = _numeroFlexibleMapaMet(registro.metrado);
        if (!Number.isFinite(metrado)) return;
        const clave = _claveTextoMapaMet(registro.partida);
        if (!acumulados.has(clave)) acumulados.set(clave, { actual: 0, anterior: 0 });
        acumulados.get(clave)[periodo === periodoActual ? 'actual' : 'anterior'] += metrado;
    });

    const actividades = ordenActividadesMet.map((actividad, orden) => {
        const clave = _claveTextoMapaMet(actividad);
        const configuracion = actividadesConfigMet.get(clave);
        const metaAnual = Number(configuracion?.metas?.[tramoActivoMet]) || 0;
        const metaAnualValida = configuracion?.metasValidas?.[tramoActivoMet] === true;
        const valores = acumulados.get(clave) || { actual: 0, anterior: 0 };
        const metaMensual = metaAnual > 0 ? metaAnual / 12 : 0;
        const metradoValido = Number.isFinite(valores.actual) && valores.actual >= 0;
        const puntoAlerta = !metaAnualValida || !metradoValido;
        const porcentajeGrafico = puntoAlerta
            ? 0
            : (metaAnual === 0 ? 100 : valores.actual / metaMensual * 100);
        const unidad = datosMetrados.find(d => _claveTextoMapaMet(d.partida) === clave)?.unidad || '';
        return {
            actividad,
            clave,
            orden,
            item: itemActividadMet.get(clave) || String(orden + 1),
            actual: valores.actual,
            anterior: valores.anterior,
            delta: valores.actual - valores.anterior,
            metaMensual,
            porcentaje: metaMensual > 0 ? valores.actual / metaMensual * 100 : (valores.actual > 0 ? 100 : 0),
            porcentajeGrafico,
            puntoAlerta,
            unidad
        };
    }).filter(Boolean);

    const mayores = [...actividades]
        .sort((a, b) => b.porcentaje - a.porcentaje || b.actual - a.actual || a.orden - b.orden)
        .slice(0, 10);
    const clavesMayores = new Set(mayores.map(item => item.clave));
    const menores = actividades
        .filter(item => !clavesMayores.has(item.clave))
        .sort((a, b) => a.porcentaje - b.porcentaje || a.actual - b.actual || a.orden - b.orden)
        .slice(0, 10);
    return { periodoActual, periodoAnterior, mayores, menores, actividades };
}

function _htmlTendenciaNoticiasMet(item) {
    const signo = item.delta > 0 ? '↑' : item.delta < 0 ? '↓' : '→';
    const color = item.delta > 0 ? 'text-emerald-600' : item.delta < 0 ? 'text-red-600' : 'text-slate-500';
    const prefijo = item.delta > 0 ? '+' : '';
    return `<span class="${color} font-extrabold whitespace-nowrap">${signo} ${prefijo}${_formatearNumeroMet(item.delta)}${item.unidad ? ` ${_escaparHtmlMet(item.unidad)}` : ''}</span>`;
}

function _htmlRankingNoticiasMet(items, tipo) {
    if (!items.length) return '<p class="p-5 text-sm text-slate-500">No existen actividades para este tramo.</p>';
    const mayor = tipo === 'mayor';
    return items.map((item, indice) => `<div class="met-news-rank-row">
        <span class="met-news-rank-number ${mayor ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">${indice + 1}</span>
        <div class="min-w-0">
            <p class="text-xs font-extrabold text-slate-800 leading-snug">${_escaparHtmlMet(item.actividad)}</p>
            <p class="text-xs text-slate-500 mt-1">${_formatearNumeroMet(item.actual)} de ${_formatearNumeroMet(item.metaMensual)} ${_escaparHtmlMet(item.unidad)}</p>
        </div>
        <div class="text-right">
            <p class="text-sm font-black ${mayor ? 'text-emerald-700' : 'text-red-700'}">${_formatearNumeroMet(item.porcentaje, 1)}%</p>
            <p class="text-xs mt-1">${_htmlTendenciaNoticiasMet(item)}</p>
        </div>
    </div>`).join('');
}

function _renderizarLeyendaActividadesNoticiasMet() {
    const contenedor = $m('met-news-activity-legend-list');
    if (!contenedor) return;
    const cortes = new Set([12, 22, 25, 28, 31, 34, 37, 41, 50]);
    contenedor.innerHTML = ordenActividadesMet.map((partida, indice) => {
        const posicion = indice + 1;
        const item = itemActividadMet.get(_claveTextoMapaMet(partida)) || String(posicion);
        const divisor = cortes.has(posicion) && posicion < ordenActividadesMet.length ? '<div class="met-news-legend-divider"></div>' : '';
        return `<div class="met-news-legend-row"><span class="met-news-legend-item">${_escaparHtmlMet(item)}</span><span>${_escaparHtmlMet(partida)}</span></div>${divisor}`;
    }).join('');
}

function _renderizarGraficoNoticiasMet(items) {
    const contenedor = $m('met-news-progress-chart');
    const eje = $m('met-news-chart-axis');
    const etiquetaMeta = $m('met-news-chart-target-label');
    if (!contenedor || !eje || !etiquetaMeta) return;
    if (!items.length) {
        contenedor.innerHTML = '<div class="h-full grid place-items-center text-sm text-slate-500">No existen actividades para graficar.</div>';
        eje.innerHTML = '';
        etiquetaMeta.classList.add('hidden');
        return;
    }
    etiquetaMeta.classList.remove('hidden');
    const ordenados = [...items].sort((a, b) => a.orden - b.orden);
    const ancho = Math.max(900, ordenados.length * 54);
    const alto = 400;
    const margen = { izquierda: 18, derecha: 24, arriba: 18, abajo: 38 };
    const anchoUtil = ancho - margen.izquierda - margen.derecha;
    const altoUtil = alto - margen.arriba - margen.abajo;
    const maximo = Math.max(100, ...ordenados.map(item => item.porcentajeGrafico));
    const techo = Math.max(100, Math.ceil(maximo / 100) * 100);
    const x = indice => margen.izquierda + (ordenados.length === 1 ? anchoUtil / 2 : indice * anchoUtil / (ordenados.length - 1));
    const y = porcentaje => margen.arriba + altoUtil - (Math.min(porcentaje, techo) / techo * altoUtil);
    const puntos = ordenados.map((item, indice) => `${x(indice)},${y(item.porcentajeGrafico)}`).join(' ');
    const metaY = y(100);
    const baseY = alto - margen.abajo;
    const niveles = [0, techo * 0.25, techo * 0.5, techo * 0.75, techo];
    const grillaHorizontal = niveles.map(valor => `<line x1="${margen.izquierda}" y1="${y(valor)}" x2="${ancho - margen.derecha}" y2="${y(valor)}" stroke="#dbe4ee" stroke-width="1"/>`).join('');
    const grillaVertical = ordenados.map((_, indice) => `<line x1="${x(indice)}" y1="${margen.arriba}" x2="${x(indice)}" y2="${baseY}" stroke="#edf2f7" stroke-width="1"/>`).join('');
    const elementos = ordenados.map((item, indice) => `<g>
        <circle class="met-news-point${item.puntoAlerta ? ' met-news-point-alert' : ''}" cx="${x(indice)}" cy="${y(item.porcentajeGrafico)}" r="${item.puntoAlerta ? 18 : 6}"><title>${_formatearNumeroMet(item.actual)}${item.unidad ? ` ${_escaparHtmlMet(item.unidad)}` : ''} · ${_formatearNumeroMet(item.porcentajeGrafico, 1)}%</title></circle>
        <text x="${x(indice)}" y="${alto - 12}" text-anchor="middle" font-weight="700">${_escaparHtmlMet(item.item)}</text>
    </g>`).join('');
    const area = `${x(0)},${baseY} ${puntos} ${x(ordenados.length - 1)},${baseY}`;
    contenedor.innerHTML = `<svg class="met-news-progress-chart" style="width:${ancho}px" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Porcentaje mensual por actividad">
        <defs><linearGradient id="met-news-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#38bdf8" stop-opacity=".24"/><stop offset="100%" stop-color="#38bdf8" stop-opacity=".02"/></linearGradient></defs>
        ${grillaHorizontal}${grillaVertical}
        <polygon points="${area}" fill="url(#met-news-area-gradient)"/>
        <line x1="${margen.izquierda}" y1="${baseY}" x2="${ancho - margen.derecha}" y2="${baseY}" stroke="#0b132b" stroke-width="1.5"/>
        <line class="met-news-target" x1="${margen.izquierda}" y1="${metaY}" x2="${ancho - margen.derecha}" y2="${metaY}"/>
        <polyline class="met-news-series" points="${puntos}"/>
        ${elementos}
    </svg>`;
    const etiquetas = [...niveles, 100].filter((valor, indice, lista) => valor <= techo && lista.indexOf(valor) === indice).sort((a, b) => b - a);
    eje.innerHTML = etiquetas.map(valor => {
        const posicion = (1 - Math.min(valor, techo) / techo) * 100;
        return `<span class="met-news-chart-axis-label" style="top:${Math.max(2, Math.min(98, posicion))}%">${_formatearNumeroMet(valor, 1)}%</span>`;
    }).join('');
    etiquetaMeta.style.top = `${metaY / alto * 100}%`;
}

async function _cargarFotosNoticiasMet() {
    if (fotosNoticiasMet.length) return fotosNoticiasMet;
    if (cargaFotosNoticiasMet) return cargaFotosNoticiasMet;
    cargaFotosNoticiasMet = _leerCsvMapaMet(REPORTE_FOTOS_CSV_URL_MET, 'Hoja REPORTE_FOTOS')
        .then(filas => {
            fotosNoticiasMet = filas.map((filaOriginal, ordenHoja) => {
                const fila = _filaNormalizadaMapaMet(filaOriginal);
                const inicio = _numeroKmMet(fila.INICIO);
                const tramoPorInicio = _tramoPorKmInicialMapaMet(inicio)?.nombre || null;
                return {
                    ordenHoja,
                    fecha: String(fila.FECHA || '').trim(),
                    driveId: String(fila.DRIVE_FILE_ID || '').trim(),
                    actividad: String(fila.ACTIVIDAD || '').trim(),
                    tramo: tramoPorInicio || _tramoDeclaradoMet(fila.TRAMO),
                    tiempo: _claveTextoMapaMet(fila.TIEMPO)
                };
            }).filter(foto => foto.driveId && foto.actividad && foto.tramo && foto.tiempo === 'DURANTE');
            return fotosNoticiasMet;
        })
        .finally(() => { cargaFotosNoticiasMet = null; });
    return cargaFotosNoticiasMet;
}

function _seleccionarFotosNoticiasMet(ranking) {
    const indice = new Map();
    fotosNoticiasMet.forEach(foto => {
        if (foto.tramo !== tramoActivoMet) return;
        indice.set(`${foto.tramo}|${_claveTextoMapaMet(foto.actividad)}`, foto);
    });
    const preparar = (items, categoria) => items
        .map((item, posicion) => ({
            ...item,
            categoria,
            posicion: posicion + 1,
            foto: item.actual > 0 ? indice.get(`${tramoActivoMet}|${item.clave}`) : null
        }))
        .filter(item => item.foto);
    const menores = preparar(ranking.menores, 'MENOR');
    const mayores = preparar(ranking.mayores, 'MAYOR');
    return [...menores, ...mayores].slice(0, 10);
}

async function _cargarMiniaturasNoticiasMet(ids) {
    const pendientes = [...new Set(ids)].filter(id => !miniaturasNoticiasMet.has(id));
    const servicio = typeof GAS_THUMBS_URL !== 'undefined' ? GAS_THUMBS_URL : '';
    if (!pendientes.length || !servicio || servicio === 'PEGAR_AQUI_LA_URL_DEL_SCRIPT_MINIATURAS') return;
    const respuesta = await fetch(servicio, { method: 'POST', body: JSON.stringify({ ids: pendientes }) });
    const resultado = await respuesta.json();
    if (resultado.success && resultado.data) {
        Object.entries(resultado.data).forEach(([id, dataUrl]) => miniaturasNoticiasMet.set(id, dataUrl));
    }
}

function _htmlTarjetaCarruselNoticiasMet(item) {
    const mayor = item.categoria === 'MAYOR';
    const id = encodeURIComponent(item.foto.driveId);
    const miniatura = miniaturasNoticiasMet.get(item.foto.driveId);
    const imagen = miniatura
        ? `<img src="${_escaparHtmlMet(miniatura)}" loading="lazy" alt="${_escaparHtmlMet(item.actividad)}">`
        : '<div class="h-full min-h-[220px] grid place-items-center text-sm font-semibold text-slate-300">Abrir fotografía en Drive</div>';
    return `<a class="met-news-carousel-card block" href="https://drive.google.com/file/d/${id}/view" target="_blank" rel="noopener noreferrer">
        ${imagen}
        <div class="met-news-carousel-caption">
            <div class="flex items-end justify-between gap-3">
                <div class="min-w-0"><span class="inline-flex px-2 py-0.5 rounded-full text-xs font-black ${mayor ? 'bg-emerald-400 text-emerald-950' : 'bg-red-400 text-red-950'}">TOP ${item.categoria} ${item.posicion}</span><p class="mt-1 text-sm font-extrabold truncate">${_escaparHtmlMet(item.actividad)}</p></div>
                <div class="text-right shrink-0"><p class="font-black">${_formatearNumeroMet(item.porcentaje, 1)}%</p><p class="text-xs text-slate-300">${_escaparHtmlMet(item.foto.fecha || 'Sin fecha')}</p></div>
            </div>
        </div>
    </a>`;
}

function _cantidadPaginasCarruselNoticiasMet() {
    return Math.ceil(fotosCarruselNoticiasMet.length / 2);
}

function _renderizarCarruselNoticiasMet() {
    const stage = $m('met-news-carousel-stage');
    const dots = $m('met-news-carousel-dots');
    if (!stage || !dots) return;
    const paginas = _cantidadPaginasCarruselNoticiasMet();
    const anterior = $m('met-news-prev');
    const siguiente = $m('met-news-next');
    if (!paginas) {
        stage.innerHTML = '<div class="h-full min-h-[220px] grid place-items-center rounded-xl border border-dashed border-slate-600 text-center text-sm text-slate-300 px-6">No se encontraron fotografías DURANTE para las actividades clasificadas.</div>';
        dots.innerHTML = '';
        if (anterior) anterior.disabled = true;
        if (siguiente) siguiente.disabled = true;
        return;
    }
    paginaCarruselNoticiasMet = Math.min(Math.max(paginaCarruselNoticiasMet, 0), paginas - 1);
    const visibles = fotosCarruselNoticiasMet.slice(paginaCarruselNoticiasMet * 2, paginaCarruselNoticiasMet * 2 + 2);
    stage.innerHTML = `<div class="met-news-carousel-pair">${visibles.map(_htmlTarjetaCarruselNoticiasMet).join('')}</div>`;
    dots.innerHTML = Array.from({ length: paginas }, (_, indice) => `<button type="button" class="met-news-carousel-dot ${indice === paginaCarruselNoticiasMet ? 'active' : ''}" data-news-page="${indice}" aria-label="Ver grupo ${indice + 1}"></button>`).join('');
    if (anterior) anterior.disabled = paginas <= 1;
    if (siguiente) siguiente.disabled = paginas <= 1;
}

function _detenerCarruselNoticiasMet() {
    if (temporizadorCarruselNoticiasMet) clearInterval(temporizadorCarruselNoticiasMet);
    temporizadorCarruselNoticiasMet = null;
}

function _iniciarCarruselNoticiasMet() {
    _detenerCarruselNoticiasMet();
    if (subvistaActivaMet !== 'noticias' || _cantidadPaginasCarruselNoticiasMet() <= 1) return;
    temporizadorCarruselNoticiasMet = setInterval(() => _cambiarPaginaCarruselNoticiasMet(1, false), INTERVALO_CARRUSEL_NOTICIAS_MET);
}

function _cambiarPaginaCarruselNoticiasMet(desplazamiento, reiniciar = true) {
    const paginas = _cantidadPaginasCarruselNoticiasMet();
    if (paginas <= 1) return;
    paginaCarruselNoticiasMet = (paginaCarruselNoticiasMet + desplazamiento + paginas) % paginas;
    _renderizarCarruselNoticiasMet();
    if (reiniciar) _iniciarCarruselNoticiasMet();
}

function _irPaginaCarruselNoticiasMet(pagina) {
    const paginas = _cantidadPaginasCarruselNoticiasMet();
    if (!Number.isInteger(pagina) || pagina < 0 || pagina >= paginas) return;
    paginaCarruselNoticiasMet = pagina;
    _renderizarCarruselNoticiasMet();
    _iniciarCarruselNoticiasMet();
}

async function actualizarNoticiasMet() {
    if (subvistaActivaMet !== 'noticias') return;
    _detenerCarruselNoticiasMet();
    const token = ++tokenNoticiasMet;
    const loading = $m('met-news-loading');
    const content = $m('met-news-content');
    const empty = $m('met-news-empty');
    loading?.classList.remove('hidden');
    loading?.classList.add('grid');
    content?.classList.add('hidden');
    empty?.classList.add('hidden');
    empty?.classList.remove('grid');

    const ranking = _calcularRankingNoticiasMet();
    if (!ranking || (!ranking.mayores.length && !ranking.menores.length)) {
        fotosCarruselNoticiasMet = [];
        loading?.classList.add('hidden');
        loading?.classList.remove('grid');
        if (empty) {
            empty.innerHTML = '<div><p class="font-bold text-slate-700">Sin información para Noticias</p><p class="text-sm mt-1">Este tramo no tiene actividades con una meta anual válida.</p></div>';
            empty.classList.remove('hidden');
            empty.classList.add('grid');
        }
        return;
    }

    let errorFotos = '';
    try {
        await _cargarFotosNoticiasMet();
    } catch (error) {
        console.error('No se pudo cargar REPORTE_FOTOS para Noticias:', error);
        errorFotos = 'No se pudieron consultar las fotografías.';
    }
    if (token !== tokenNoticiasMet || subvistaActivaMet !== 'noticias') return;

    const seleccion = _seleccionarFotosNoticiasMet(ranking);
    try {
        await _cargarMiniaturasNoticiasMet(seleccion.map(item => item.foto.driveId));
    } catch (error) {
        console.error('No se pudieron cargar miniaturas de Noticias:', error);
        errorFotos = 'Las fotografías pueden abrirse directamente en Drive.';
    }
    if (token !== tokenNoticiasMet || subvistaActivaMet !== 'noticias') return;

    if ($m('met-news-tramo')) $m('met-news-tramo').textContent = tramoActivoMet;
    if ($m('met-news-subtitle')) {
        const anterior = ranking.periodoAnterior ? ` frente a ${_etiquetaMesMapaMet(ranking.periodoAnterior)}` : '';
        $m('met-news-subtitle').textContent = `${_etiquetaMesMapaMet(ranking.periodoActual)}${anterior} · avance respecto a la meta mensual`;
    }
    if ($m('met-news-top-high')) $m('met-news-top-high').innerHTML = _htmlRankingNoticiasMet(ranking.mayores, 'mayor');
    if ($m('met-news-top-low')) $m('met-news-top-low').innerHTML = _htmlRankingNoticiasMet(ranking.menores, 'menor');
    _renderizarGraficoNoticiasMet(ranking.actividades);
    fotosCarruselNoticiasMet = seleccion;
    paginaCarruselNoticiasMet = 0;
    _renderizarCarruselNoticiasMet();
    if ($m('met-news-photo-note')) $m('met-news-photo-note').textContent = errorFotos;
    loading?.classList.add('hidden');
    loading?.classList.remove('grid');
    content?.classList.remove('hidden');
    _iniciarCarruselNoticiasMet();
}

// ==========================================
// PROYECCIÓN ESTADÍSTICA
// ==========================================
function _normalizarFilaProyeccionMet(fila) {
    const normalizada = {};
    Object.entries(fila || {}).forEach(([clave, valor]) => {
        normalizada[String(clave).replace(/^\uFEFF/, '').trim().toUpperCase()] = valor;
    });
    const texto = nombre => String(normalizada[nombre] ?? '').trim();
    const numero = nombre => _numeroFlexibleMapaMet(normalizada[nombre]);
    return {
        itemProyeccion: texto('ITEM_PROYECCION'),
        tramo: texto('TRAMO').toUpperCase(),
        kmInicial: _numeroKmMet(normalizada.KM_INICIAL),
        kmFinal: _numeroKmMet(normalizada.KM_FINAL),
        itemActividad: texto('ITEM_ACTIVIDAD'),
        actividad: texto('ACTIVIDAD'),
        unidad: texto('UNIDAD'),
        tipo: texto('TIPO'),
        registros: numero('REGISTROS'),
        intervenciones: numero('INTERVENCIONES'),
        ultimaEjecucion: texto('ULTIMA_EJECUCION'),
        frecuenciaDias: numero('FRECUENCIA_DIAS'),
        fechaPropuesta: texto('FECHA_PROPUESTA'),
        diasAtraso: numero('DIAS_ATRASO'),
        prioridad: texto('PRIORIDAD').toUpperCase(),
        confianza: texto('CONFIANZA').toUpperCase(),
        estado: texto('ESTADO').toUpperCase(),
        fechaAnalisis: texto('FECHA_ANALISIS')
    };
}

function _leerHojaProyeccionMet() {
    return new Promise((resolve, reject) => {
        Papa.parse(`${PROYECCION_CSV_URL_MET}&_=${Date.now()}`, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: resultado => {
                const filas = (resultado.data || [])
                    .map(_normalizarFilaProyeccionMet)
                    .filter(fila => fila.actividad && TRAMOS_MET.includes(fila.tramo));
                resolve(filas);
            },
            error: error => reject(new Error(error?.message || 'No se pudo leer la hoja PROYECCION.'))
        });
    });
}

function _mensajeProyeccionMet(texto, tipo = 'info') {
    const mensaje = $m('met-proy-message');
    if (!mensaje) return;
    if (!texto) {
        mensaje.classList.add('hidden');
        return;
    }
    const estilos = {
        info: ['bg-sky-50', 'border-sky-200', 'text-sky-800'],
        ok: ['bg-emerald-50', 'border-emerald-200', 'text-emerald-800'],
        error: ['bg-red-50', 'border-red-200', 'text-red-800']
    };
    mensaje.className = `rounded-xl border px-4 py-3 text-sm font-semibold ${(estilos[tipo] || estilos.info).join(' ')}`;
    mensaje.textContent = texto;
}

async function actualizarProyeccionMet(forzar = false) {
    if (subvistaActivaMet !== 'proyeccion') return;
    if (proyeccionCargadaMet && !forzar) {
        renderizarProyeccionMet();
        return;
    }
    if (cargaProyeccionMet && !forzar) return cargaProyeccionMet;

    const cuerpo = $m('met-proy-body');
    if (cuerpo) cuerpo.innerHTML = '<tr><td colspan="10" class="py-12 text-center text-slate-500">Cargando proyección...</td></tr>';
    _mensajeProyeccionMet('Consultando la hoja PROYECCION...', 'info');

    cargaProyeccionMet = _leerHojaProyeccionMet()
        .then(filas => {
            datosProyeccionMet = filas;
            proyeccionCargadaMet = true;
            _mensajeProyeccionMet('', 'info');
            renderizarProyeccionMet();
        })
        .catch(error => {
            console.error('Error al cargar PROYECCION:', error);
            _mensajeProyeccionMet(`No se pudo cargar PROYECCION: ${error.message || error}`, 'error');
            if (cuerpo) cuerpo.innerHTML = '<tr><td colspan="10" class="py-12 text-center text-red-600">No se pudo cargar la información.</td></tr>';
        })
        .finally(() => { cargaProyeccionMet = null; });

    return cargaProyeccionMet;
}

function renderizarProyeccionMet() {
    const cuerpo = $m('met-proy-body');
    if (!cuerpo) return;
    const filasTramo = datosProyeccionMet.filter(fila => fila.tramo === tramoActivoMet);
    _renderizarFiltroActividadProyeccionMet(filasTramo);
    const filas = actividadFiltroProyeccionMet === 'ALL'
        ? filasTramo
        : filasTramo.filter(fila => fila.actividad === actividadFiltroProyeccionMet);
    const vencidas = filasTramo.filter(fila => fila.estado === 'VENCIDA').length;
    const proximas = filasTramo.filter(fila => fila.estado === 'PROXIMA').length;
    const confianzaAlta = filasTramo.filter(fila => fila.confianza === 'ALTA').length;

    if ($m('met-proy-tramo')) $m('met-proy-tramo').textContent = tramoActivoMet;
    if ($m('met-proy-total')) $m('met-proy-total').textContent = filasTramo.length.toLocaleString('es-PE');
    if ($m('met-proy-vencidas')) $m('met-proy-vencidas').textContent = vencidas.toLocaleString('es-PE');
    if ($m('met-proy-proximas')) $m('met-proy-proximas').textContent = proximas.toLocaleString('es-PE');
    if ($m('met-proy-confianza')) $m('met-proy-confianza').textContent = confianzaAlta.toLocaleString('es-PE');
    if ($m('met-proy-updated')) {
        const fecha = filasTramo.find(fila => fila.fechaAnalisis)?.fechaAnalisis || datosProyeccionMet[0]?.fechaAnalisis || '';
        $m('met-proy-updated').textContent = fecha ? `Análisis: ${fecha}` : '';
    }

    if (!filas.length) {
        const mensaje = filasTramo.length
            ? 'No existen propuestas para la actividad seleccionada.'
            : 'No existen propuestas para este tramo.';
        cuerpo.innerHTML = `<tr><td colspan="10" class="py-14 text-center text-slate-500">${mensaje}</td></tr>`;
        return;
    }

    cuerpo.innerHTML = filas.map(fila => {
        const estadoClase = fila.estado === 'VENCIDA' ? 'vencida' : 'proxima';
        const atraso = fila.estado === 'VENCIDA' && Number.isFinite(fila.diasAtraso)
            ? `${_formatearNumeroMet(fila.diasAtraso, 0)} días`
            : '—';
        return `<tr class="border-b border-slate-200 text-slate-700">
            <td class="px-3 py-3 text-center"><span class="met-proy-badge ${estadoClase}">${_escaparHtmlMet(fila.estado)}</span></td>
            <td class="px-3 py-3 text-center font-extrabold text-[#0b132b]">${_escaparHtmlMet(fila.prioridad)}</td>
            <td class="px-3 py-3 text-center font-black">${_escaparHtmlMet(fila.itemActividad)}</td>
            <td class="px-4 py-3 font-semibold text-slate-900">${_escaparHtmlMet(fila.actividad)}</td>
            <td class="px-3 py-3 text-center whitespace-nowrap font-bold">${_formatearProgMapaMet(fila.kmInicial)} – ${_formatearProgMapaMet(fila.kmFinal)}</td>
            <td class="px-3 py-3 text-center whitespace-nowrap">${_escaparHtmlMet(fila.ultimaEjecucion)}</td>
            <td class="px-3 py-3 text-center whitespace-nowrap">${_formatearNumeroMet(fila.frecuenciaDias, 0)} días</td>
            <td class="px-3 py-3 text-center whitespace-nowrap font-bold">${_escaparHtmlMet(fila.fechaPropuesta)}</td>
            <td class="px-3 py-3 text-center whitespace-nowrap ${fila.estado === 'VENCIDA' ? 'font-bold text-red-700' : ''}">${atraso}</td>
            <td class="px-3 py-3 text-center font-bold">${_escaparHtmlMet(fila.confianza)}</td>
        </tr>`;
    }).join('');
}

function _renderizarFiltroActividadProyeccionMet(filasTramo) {
    const opciones = $m('met-proy-filter-options');
    const boton = $m('met-proy-filter-button');
    const etiqueta = $m('met-proy-filter-label');
    if (!opciones || !boton || !etiqueta) return;

    const resumen = new Map();
    filasTramo.forEach(fila => {
        const actual = resumen.get(fila.actividad) || {
            actividad: fila.actividad,
            item: fila.itemActividad,
            cantidad: 0
        };
        actual.cantidad++;
        resumen.set(fila.actividad, actual);
    });
    const actividades = [...resumen.values()].sort((a, b) => {
        const numeroA = Number(a.item);
        const numeroB = Number(b.item);
        if (Number.isFinite(numeroA) && Number.isFinite(numeroB) && numeroA !== numeroB) return numeroA - numeroB;
        return String(a.item).localeCompare(String(b.item), 'es', { numeric: true });
    });

    if (actividadFiltroProyeccionMet !== 'ALL' && !resumen.has(actividadFiltroProyeccionMet)) {
        actividadFiltroProyeccionMet = 'ALL';
    }
    const seleccion = actividadFiltroProyeccionMet === 'ALL'
        ? null
        : resumen.get(actividadFiltroProyeccionMet);

    etiqueta.textContent = seleccion
        ? `${seleccion.item} · ${seleccion.actividad}`
        : 'Todas las actividades';
    boton.classList.toggle('active', Boolean(seleccion));

    const opcionTodas = `<button type="button" class="met-proy-filter-option ${seleccion ? '' : 'selected'}" data-proy-activity="ALL">
        <span class="font-black">—</span><span class="font-bold">Todas las actividades</span><span class="met-proy-filter-count">${filasTramo.length}</span>
    </button>`;
    opciones.innerHTML = opcionTodas + actividades.map(item => `
        <button type="button" class="met-proy-filter-option ${item.actividad === actividadFiltroProyeccionMet ? 'selected' : ''}" data-proy-activity="${_escaparHtmlMet(item.actividad)}">
            <span class="font-black text-right">${_escaparHtmlMet(item.item)}</span>
            <span>${_escaparHtmlMet(item.actividad)}</span>
            <span class="met-proy-filter-count">${item.cantidad}</span>
        </button>`).join('');
}

function _cerrarFiltroActividadProyeccionMet() {
    const menu = $m('met-proy-filter-menu');
    menu?.classList.add('hidden');
    $m('met-proy-filter-button')?.setAttribute('aria-expanded', 'false');
}

function _alternarFiltroActividadProyeccionMet() {
    const menu = $m('met-proy-filter-menu');
    if (!menu) return;
    const abrir = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !abrir);
    $m('met-proy-filter-button')?.setAttribute('aria-expanded', String(abrir));
}

async function generarProyeccionDesdeLeoMet() {
    const boton = $m('met-proy-generar');
    const textoOriginal = boton?.textContent || 'ACTUALIZAR PROYECCIÓN';
    if (boton) {
        boton.disabled = true;
        boton.textContent = 'GENERANDO...';
    }
    _mensajeProyeccionMet('Apps Script está analizando el historial. Espere...', 'info');

    try {
        const respuesta = await fetch(PROYECCION_WEB_APP_URL_MET, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({ accion: 'GENERAR_PROYECCION', token: PROYECCION_TOKEN_MET })
        });
        if (!respuesta.ok) throw new Error(`Apps Script respondió HTTP ${respuesta.status}`);
        const resultado = await respuesta.json();
        if (!resultado.ok) throw new Error(resultado.mensaje || resultado.error || 'Apps Script no completó la operación.');

        proyeccionCargadaMet = false;
        await actualizarProyeccionMet(true);
        _mensajeProyeccionMet(`${resultado.propuestasGeneradas ?? 0} propuestas generadas correctamente.`, 'ok');
    } catch (error) {
        console.error('No se pudo generar PROYECCION:', error);
        _mensajeProyeccionMet(`No se pudo actualizar la proyección: ${error.message || error}`, 'error');
    } finally {
        if (boton) {
            boton.disabled = false;
            boton.textContent = textoOriginal;
        }
    }
}

function seleccionarTramoMapaMet(tramo) {
    if (!TRAMOS_MET.includes(tramo)) return;
    tramoActivoMet = tramo;
    actividadFiltroProyeccionMet = 'ALL';
    _cerrarFiltroActividadProyeccionMet();
    document.querySelectorAll('.met-tramo-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tramo === tramo));
    aplicarFiltrosMet(true);
    if (subvistaActivaMet === 'noticias') actualizarNoticiasMet();
    if (subvistaActivaMet === 'proyeccion') renderizarProyeccionMet();
}

function cambiarSubvistaMet(vista) {
    if (!['mapa', 'analisis', 'tabla', 'noticias', 'proyeccion'].includes(vista)) return;
    subvistaActivaMet = vista;
    if (vista !== 'noticias') _detenerCarruselNoticiasMet();
    document.querySelectorAll('.met-view-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.metView === vista));
    ['mapa', 'analisis', 'tabla', 'noticias', 'proyeccion'].forEach(nombre => {
        const panel = $m(`met-panel-${nombre}`);
        if (!panel) return;
        const activo = nombre === vista;
        panel.classList.toggle('hidden', !activo);
        if (nombre === 'tabla') panel.classList.toggle('flex', activo);
    });
    $m('met-control-panel')?.classList.toggle('hidden', vista === 'noticias' || vista === 'proyeccion');
    if (vista === 'mapa') setTimeout(() => mapaMet?.invalidateSize(), 50);
    if (vista === 'analisis') actualizarAnalisisMapaMet();
    if (vista === 'tabla') requestAnimationFrame(_alinearTotalTablaMet);
    if (vista === 'noticias') actualizarNoticiasMet();
    if (vista === 'proyeccion') actualizarProyeccionMet();
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
    $m('met-map-weeks')?.addEventListener('click', evento => {
        const boton = evento.target.closest('.met-week-btn');
        if (boton && !boton.disabled) _seleccionarSemanaMapaMet(boton.dataset.week);
    });
    $m('met-analysis-year')?.addEventListener('change', () => {
        _rellenarMesDetalleMet();
        _renderizarDetalleMensualMet();
    });
    $m('met-analysis-month')?.addEventListener('change', evento => {
        periodoDetalleMet = `${$m('met-analysis-year').value}-${evento.target.value}`;
        _renderizarDetalleMensualMet();
    });
    $m('met-news-prev')?.addEventListener('click', () => _cambiarPaginaCarruselNoticiasMet(-1));
    $m('met-news-next')?.addEventListener('click', () => _cambiarPaginaCarruselNoticiasMet(1));
    $m('met-news-carousel-dots')?.addEventListener('click', evento => {
        const boton = evento.target.closest('[data-news-page]');
        if (boton) _irPaginaCarruselNoticiasMet(Number(boton.dataset.newsPage));
    });
    $m('met-news-carousel')?.addEventListener('mouseenter', _detenerCarruselNoticiasMet);
    $m('met-news-carousel')?.addEventListener('mouseleave', _iniciarCarruselNoticiasMet);
    $m('met-proy-generar')?.addEventListener('click', generarProyeccionDesdeLeoMet);
    $m('met-proy-filter-button')?.addEventListener('click', evento => {
        evento.stopPropagation();
        _alternarFiltroActividadProyeccionMet();
    });
    $m('met-proy-filter-options')?.addEventListener('click', evento => {
        const opcion = evento.target.closest('[data-proy-activity]');
        if (!opcion) return;
        actividadFiltroProyeccionMet = opcion.dataset.proyActivity || 'ALL';
        _cerrarFiltroActividadProyeccionMet();
        renderizarProyeccionMet();
    });
    document.addEventListener('click', evento => {
        if (!$m('met-proy-filter-wrap')?.contains(evento.target)) _cerrarFiltroActividadProyeccionMet();
    });
    $m('met-table-scroller')?.addEventListener('scroll', _alinearTotalTablaMet, { passive: true });
    window.addEventListener('resize', _alinearTotalTablaMet, { passive: true });
}

// ==========================================
// FILTRADO Y ORDENAMIENTO
// ==========================================
function aplicarFiltrosMet(ajustarMapa = false) {
    // TABLA conserva también las filas inválidas para facilitar su auditoría.
    filtradosMetrados = subBaseFiltradaMet.filter(d => tramoSubBaseMet.get(d) === tramoActivoMet);
    filtradosMetrados.sort((a, b) => a.ordenHoja - b.ordenHoja);
    renderizarTablaMet();
    renderizarMapaMet(ajustarMapa);
    actualizarAnalisisMapaMet();
}

// ==========================================
// RENDERIZADO DE TABLA
// ==========================================
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
        <th id="met-th-metrado" class="px-3 py-4 text-center border-l border-slate-200">Metrado</th>
        <th class="px-3 py-4 text-center border-l border-slate-200">Unidad</th>
        <th class="px-3 py-4 text-center border-l border-slate-200">Tramo</th>
        <th class="px-3 py-4 text-center border-l border-slate-200">Grupo</th>
    </tr>`;
}

function _escaparHtmlMet(valor) {
    return String(valor || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function _alinearTotalTablaMet() {
    const total = $m('met-table-total');
    const cabecera = $m('met-th-metrado');
    const pie = total?.parentElement;
    if (!total || !cabecera || !pie) return;
    const rectCabecera = cabecera.getBoundingClientRect();
    const rectPie = pie.getBoundingClientRect();
    // La tabla se renderiza mientras su pestaña puede estar oculta. En ese
    // estado el navegador devuelve medidas en cero y no deben guardarse.
    if (!rectCabecera.width || !rectPie.width) return;
    total.style.left = `${rectCabecera.left + rectCabecera.width / 2 - rectPie.left}px`;
    total.style.width = `${Math.max(190, rectCabecera.width - 12)}px`;
}

function _mostrarTotalTablaMet(valor = null, unidad = '') {
    const total = $m('met-table-total');
    if (!total) return;
    if (valor === null) {
        total.innerHTML = '<span class="w-full border-t-2 border-dotted border-white/80"></span>';
        total.title = 'Seleccione una actividad específica para sumar sus metrados.';
    } else {
        total.innerHTML = `<span aria-hidden="true">Σ</span><span class="met-total-value">${_formatearNumeroMet(valor)}${unidad ? ` ${_escaparHtmlMet(unidad)}` : ''}</span>`;
        total.title = `Suma de metrados para ${filtroGeneralMet.actividad}`;
    }
    requestAnimationFrame(_alinearTotalTablaMet);
}

function renderizarTablaMet() {
    construirCabecerasMet();
    const tbody = $m('met-tabla-body');
    const info = $m('met-table-info');
    const total = $m('met-table-total');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!filtradosMetrados.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-12 text-slate-500">No se encontraron resultados para el filtro general.</td></tr>';
        if (info) info.textContent = '0 registros';
        _mostrarTotalTablaMet(filtroGeneralMet.actividad === 'ALL' ? null : 0);
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
    if (filtroGeneralMet.actividad === 'ALL') {
        _mostrarTotalTablaMet();
    } else {
        const suma = filtradosMetrados.reduce((acumulado, fila) => {
            const valor = _numeroFlexibleMapaMet(fila.metrado);
            return acumulado + (Number.isFinite(valor) ? valor : 0);
        }, 0);
        const unidad = filtradosMetrados.find(fila => String(fila.unidad || '').trim())?.unidad || '';
        _mostrarTotalTablaMet(suma, unidad);
    }
}

// ==========================================
// EXPORTACIÓN EXCEL
// ==========================================
function _cerrarMenuExportacionMet() {
    $m('met-export-menu')?.classList.add('hidden');
    $m('btn-export-metrados')?.setAttribute('aria-expanded', 'false');
}

function _filasExportacionTramoMet(tramo) {
    return subBaseFiltradaMet
        .filter(fila => tramoSubBaseMet.get(fila) === tramo)
        .sort((a, b) => a.ordenHoja - b.ordenHoja);
}

function _nombreExcelTramoMet(tramo) {
    const fecha = new Date().toISOString().slice(0, 10);
    return `Metrados_${tramo.replace(/\s+/g, '_')}_${fecha}.xlsx`;
}

async function _crearExcelTramoMet(tramo, registros) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'LEO Gestión';
    wb.created = new Date();
    const ws = wb.addWorksheet('METRADOS', { views: [{ state: 'frozen', ySplit: 4 }] });
    ws.columns = [
        { key: 'fecha', width: 14 }, { key: 'actividad', width: 18 },
        { key: 'partida', width: 48 }, { key: 'kmi', width: 14 },
        { key: 'kmf', width: 14 }, { key: 'lado', width: 11 },
        { key: 'metrado', width: 14 }, { key: 'unidad', width: 11 },
        { key: 'tramo', width: 14 }, { key: 'grupo', width: 13 }
    ];

    ws.mergeCells('A1:J1');
    const titulo = ws.getCell('A1');
    titulo.value = `METRADOS · ${tramo}`;
    titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B132B' } };
    titulo.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
    titulo.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 32;

    ws.mergeCells('A2:J2');
    const detalle = ws.getCell('A2');
    const actividad = filtroGeneralMet.actividad === 'ALL' ? 'Todas las actividades' : filtroGeneralMet.actividad;
    detalle.value = `${actividad} · ${_etiquetaMesMapaMet(filtroGeneralMet.desde)} a ${_etiquetaMesMapaMet(filtroGeneralMet.hasta)} · ${registros.length} registro(s)`;
    detalle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    detalle.font = { bold: true, color: { argb: 'FF1D4ED8' }, size: 10 };
    detalle.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(2).height = 24;

    const encabezados = ['FECHA', 'ACTIVIDAD', 'PARTIDA', 'KM INICIAL', 'KM FINAL', 'LADO', 'METRADO', 'UNIDAD', 'TRAMO', 'GRUPO'];
    const filaEncabezado = ws.getRow(4);
    filaEncabezado.values = encabezados;
    filaEncabezado.height = 26;
    filaEncabezado.eachCell(celda => {
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
        celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        celda.border = { bottom: { style: 'medium', color: { argb: 'FF0B132B' } } };
    });

    registros.forEach((dato, indice) => {
        const metrado = _numeroFlexibleMapaMet(dato.metrado);
        const fila = ws.addRow({
            fecha: dato.fecha,
            actividad: dato.actividad,
            partida: dato.partida,
            kmi: _progresivaParaExcelMet(dato.kmInicial),
            kmf: _progresivaParaExcelMet(dato.kmFinal),
            lado: dato.lado,
            metrado: Number.isFinite(metrado) ? metrado : dato.metrado,
            unidad: dato.unidad,
            tramo: tramoSubBaseMet.get(dato) || dato.tramo || tramo,
            grupo: dato.grupo
        });
        fila.height = 22;
        fila.eachCell((celda, columna) => {
            celda.alignment = {
                vertical: 'middle',
                horizontal: columna === 3 ? 'left' : 'center',
                wrapText: columna === 3
            };
            celda.border = {
                top: { style: 'thin', color: { argb: 'FFD8DEE9' } },
                bottom: { style: 'thin', color: { argb: 'FFD8DEE9' } },
                left: { style: 'thin', color: { argb: 'FFD8DEE9' } },
                right: { style: 'thin', color: { argb: 'FFD8DEE9' } }
            };
            if (indice % 2 === 1) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
        fila.getCell(4).numFmt = '0"+"000';
        fila.getCell(5).numFmt = '0"+"000';
        fila.getCell(7).numFmt = '#,##0.###';
    });

    ws.autoFilter = { from: 'A4', to: 'J4' };
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return wb.xlsx.writeBuffer();
}

async function _guardarExcelMet(buffer, nombre, directorio = null, archivoElegido = null) {
    if (archivoElegido) {
        const escritura = await archivoElegido.createWritable();
        await escritura.write(buffer);
        await escritura.close();
        return;
    }
    if (directorio) {
        const archivo = await directorio.getFileHandle(nombre, { create: true });
        const escritura = await archivo.createWritable();
        await escritura.write(buffer);
        await escritura.close();
        return;
    }
    if (window.showSaveFilePicker) {
        const archivo = await window.showSaveFilePicker({
            suggestedName: nombre,
            types: [{
                description: 'Libro de Excel',
                accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }]
        });
        const escritura = await archivo.createWritable();
        await escritura.write(buffer);
        await escritura.close();
        return;
    }
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre);
}

async function exportarXLSXMet(alcance = 'actual') {
    const btn = $m('btn-export-metrados');
    const contenidoOriginal = btn?.innerHTML || '';
    _cerrarMenuExportacionMet();
    try {
        const tramos = alcance === 'todos' ? TRAMOS_MET : [tramoActivoMet];
        const grupos = tramos.map(tramo => ({ tramo, registros: _filasExportacionTramoMet(tramo) }));
        if (alcance === 'actual' && grupos[0].registros.length === 0) {
            alert('No hay registros visibles en la TABLA para exportar.');
            return;
        }

        let directorio = null;
        let archivoElegido = null;
        if (alcance === 'todos' && window.showDirectoryPicker) {
            directorio = await window.showDirectoryPicker({ mode: 'readwrite' });
        } else if (alcance === 'actual' && window.showSaveFilePicker) {
            archivoElegido = await window.showSaveFilePicker({
                suggestedName: _nombreExcelTramoMet(tramoActivoMet),
                types: [{
                    description: 'Libro de Excel',
                    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
                }]
            });
        }

        if (btn) { btn.disabled = true; btn.textContent = 'GENERANDO EXCEL...'; }
        for (const grupo of grupos) {
            const nombre = _nombreExcelTramoMet(grupo.tramo);
            const buffer = await _crearExcelTramoMet(grupo.tramo, grupo.registros);
            if (alcance === 'todos' && !directorio) {
                saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre);
            } else {
                await _guardarExcelMet(buffer, nombre, directorio, archivoElegido);
            }
        }
        alert(alcance === 'todos'
            ? 'Se generaron 7 archivos Excel, uno por cada tramo.'
            : `Excel generado con ${grupos[0].registros.length} registro(s) de ${tramoActivoMet}.`);
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.error(error);
            alert('Error al generar Excel: ' + (error.message || error));
        }
    } finally {
        if (btn) { btn.innerHTML = contenidoOriginal; btn.disabled = false; }
    }
}

// ==========================================
// ARRANQUE DESDE DOMContentLoaded
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    configurarEventosMet();
    $m('btn-export-metrados')?.addEventListener('click', evento => {
        evento.stopPropagation();
        const menu = $m('met-export-menu');
        const abierto = !menu?.classList.contains('hidden');
        menu?.classList.toggle('hidden', abierto);
        evento.currentTarget.setAttribute('aria-expanded', String(!abierto));
    });
    $m('met-export-menu')?.addEventListener('click', evento => {
        const opcion = evento.target.closest('[data-met-export-scope]');
        if (opcion) exportarXLSXMet(opcion.dataset.metExportScope);
    });
    document.addEventListener('click', evento => {
        if (!$m('met-export-wrap')?.contains(evento.target)) _cerrarMenuExportacionMet();
    });
});
