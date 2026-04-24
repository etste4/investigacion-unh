// ============================================================
// PORTAL DE INVESTIGACIÓN UNH — app.js
// Lee Google Sheets publicado como CSV y muestra publicaciones
// ============================================================

const SHEETS_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTnX1PTEE3CAOfyx-OLMlowO090KxbxozOPULTdVPEBXHNLA_m_YIybSWcJ68QuzwBI5yZ2aBUlWCv2/pub?output=csv";
const POR_PAGINA = 20;

// Estado global
let datos        = [];
let datosFiltros = [];
let paginaActual = 1;
let sortCol      = "anio";
let sortDir      = "desc";

// ─────────────────────────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  cargarDatos();
  configurarEventos();
});

async function cargarDatos() {
  try {
    const res  = await fetch(SHEETS_CSV);
    if (!res.ok) throw new Error("Error al cargar datos");
    const text = await res.text();
    datos = parsearCSV(text);
    datos = datos.filter(d => d.titulo && !d.titulo.startsWith("SIN ") && !d.titulo.startsWith("ERROR") && !d.titulo.startsWith("NO "));

    inicializarFiltros();
    aplicarFiltros();
    actualizarMetricas();

    document.getElementById("loading").style.display = "none";
    document.getElementById("tabla-pub").style.display = "table";

  } catch (e) {
    console.error(e);
    document.getElementById("loading").style.display     = "none";
    document.getElementById("error-state").style.display = "flex";
  }
}


// ─────────────────────────────────────────────────────────────
// PARSEAR CSV
// ─────────────────────────────────────────────────────────────

function parsearCSV(text) {
  const lineas  = text.split("\n");
  if (lineas.length < 2) return [];

  const headers = parsearFila(lineas[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const result  = [];

  for (let i = 1; i < lineas.length; i++) {
    const fila = parsearFila(lineas[i]);
    if (fila.every(c => !c.trim())) continue;
    const obj  = {};
    headers.forEach((h, idx) => { obj[h] = (fila[idx] || "").trim(); });
    result.push(obj);
  }

  return result;
}

function parsearFila(linea) {
  const result = [];
  let current  = "";
  let enComilla = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      enComilla = !enComilla;
    } else if (c === "," && !enComilla) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}


// ─────────────────────────────────────────────────────────────
// INICIALIZAR FILTROS DINÁMICOS
// ─────────────────────────────────────────────────────────────

function inicializarFiltros() {
  // Años únicos ordenados desc
  const anios = [...new Set(datos.map(d => d.anio).filter(Boolean))].sort((a, b) => b - a);
  const selAnio = document.getElementById("filtro-anio");
  anios.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    selAnio.appendChild(opt);
  });

  // Departamentos únicos ordenados
  const depts = [...new Set(datos.map(d => d.departamento).filter(Boolean))].sort();
  const selDept = document.getElementById("filtro-dept");
  depts.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d.replace("DEPARTAMENTO ACADÉMICO DE ", "");
    selDept.appendChild(opt);
  });

  // Tipos de documento
  const tipos = [...new Set(datos.map(d => d.tipo_documento).filter(Boolean))].sort();
  const selTipo = document.getElementById("filtro-tipo");
  tipos.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = capitalizarTipo(t);
    selTipo.appendChild(opt);
  });
}


// ─────────────────────────────────────────────────────────────
// MÉTRICAS
// ─────────────────────────────────────────────────────────────

function actualizarMetricas() {
  const total   = datos.length;
  const scopus  = datos.filter(d => d.en_scopus === "True" || d.en_scopus === "true" || d.en_scopus === "TRUE").length;
  const wos     = datos.filter(d => d.en_wos    === "True" || d.en_wos    === "true" || d.en_wos    === "TRUE").length;
  const docentes = new Set(datos.map(d => d.docente).filter(Boolean)).size;

  animarNumero("total-pub",     total);
  animarNumero("total-scopus",  scopus);
  animarNumero("total-wos",     wos);
  animarNumero("total-docentes",docentes);
}

function animarNumero(id, final) {
  const el    = document.getElementById(id);
  const dur   = 1000;
  const inicio = performance.now();

  function step(now) {
    const t = Math.min((now - inicio) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(ease * final).toLocaleString("es-PE");
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}


// ─────────────────────────────────────────────────────────────
// FILTROS Y BÚSQUEDA
// ─────────────────────────────────────────────────────────────

function configurarEventos() {
  const buscar    = document.getElementById("buscar");
  const btnClear  = document.getElementById("btn-clear");
  const filtroAnio  = document.getElementById("filtro-anio");
  const filtroDept  = document.getElementById("filtro-dept");
  const filtroFuente= document.getElementById("filtro-fuente");
  const filtroTipo  = document.getElementById("filtro-tipo");
  const btnExportar = document.getElementById("btn-exportar");

  buscar.addEventListener("input", () => {
    btnClear.classList.toggle("visible", buscar.value.length > 0);
    paginaActual = 1;
    aplicarFiltros();
  });

  btnClear.addEventListener("click", () => {
    buscar.value = "";
    btnClear.classList.remove("visible");
    paginaActual = 1;
    aplicarFiltros();
  });

  [filtroAnio, filtroDept, filtroFuente, filtroTipo].forEach(el => {
    el.addEventListener("change", () => {
      paginaActual = 1;
      aplicarFiltros();
    });
  });

  // Sort por columna
  document.querySelectorAll(".th-sort").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortCol = col;
        sortDir = col === "anio" || col === "citas" ? "desc" : "asc";
      }
      document.querySelectorAll(".sort-icon").forEach(s => { s.className = "sort-icon"; });
      th.querySelector(".sort-icon").className = "sort-icon " + sortDir;
      aplicarFiltros();
    });
  });

  btnExportar.addEventListener("click", exportarCSV);
}

function aplicarFiltros() {
  const q        = document.getElementById("buscar").value.toLowerCase().trim();
  const anio     = document.getElementById("filtro-anio").value;
  const dept     = document.getElementById("filtro-dept").value;
  const fuente   = document.getElementById("filtro-fuente").value;
  const tipo     = document.getElementById("filtro-tipo").value;

  datosFiltros = datos.filter(d => {
    // Búsqueda de texto
    if (q) {
      const haystack = [d.titulo, d.docente, d.revista, d.palabras_clave, d.autores].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    // Año
    if (anio && d.anio !== anio) return false;
    // Departamento
    if (dept && d.departamento !== dept) return false;
    // Fuente
    if (fuente === "scopus"    && !(d.en_scopus === "True" || d.en_scopus === "true" || d.en_scopus === "TRUE")) return false;
    if (fuente === "wos"       && !(d.en_wos    === "True" || d.en_wos    === "true" || d.en_wos    === "TRUE")) return false;
    if (fuente === "openaccess"&& !d.open_access?.toLowerCase().includes("gold") && !d.open_access?.toLowerCase().includes("green")) return false;
    // Tipo
    if (tipo && d.tipo_documento !== tipo) return false;

    return true;
  });

  // Ordenar
  datosFiltros.sort((a, b) => {
    let va = a[sortCol] || "";
    let vb = b[sortCol] || "";
    if (sortCol === "citas" || sortCol === "anio") {
      va = parseFloat(va) || 0;
      vb = parseFloat(vb) || 0;
    } else {
      va = va.toString().toLowerCase();
      vb = vb.toString().toLowerCase();
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  renderTabla();
  renderPaginacion();

  const count = datosFiltros.length;
  document.getElementById("resultados-count").textContent =
    `${count.toLocaleString("es-PE")} publicación${count !== 1 ? "es" : ""} encontrada${count !== 1 ? "s" : ""}`;
}


// ─────────────────────────────────────────────────────────────
// RENDERIZAR TABLA
// ─────────────────────────────────────────────────────────────

function renderTabla() {
  const tbody  = document.getElementById("tabla-body");
  const inicio = (paginaActual - 1) * POR_PAGINA;
  const fin    = inicio + POR_PAGINA;
  const pagina = datosFiltros.slice(inicio, fin);

  if (pagina.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:48px;color:#adb5bd;">
          No se encontraron publicaciones con los filtros aplicados.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = pagina.map((d, i) => {
    const citas      = parseInt(d.citas) || 0;
    const citasClass = citas === 0 ? "citas-0" : citas < 5 ? "citas-low" : citas < 20 ? "citas-mid" : "citas-high";

    const enScopus = d.en_scopus === "True" || d.en_scopus === "true" || d.en_scopus === "TRUE";
    const enWos    = d.en_wos    === "True" || d.en_wos    === "true" || d.en_wos    === "TRUE";
    const esOA     = d.open_access?.toLowerCase().includes("gold") || d.open_access?.toLowerCase().includes("green");

    const badges = [
      enScopus ? `<span class="badge badge-scopus">Scopus</span>` : "",
      enWos    ? `<span class="badge badge-wos">WoS</span>`       : "",
      esOA     ? `<span class="badge badge-oa">OA</span>`         : "",
    ].join("");

    const url   = d.url_doi || d.url_scopus || d.url_wos || "";
    const titulo = escapar(d.titulo || "Sin título");
    const enlace = url
      ? `<a href="${url}" target="_blank" rel="noopener">Ver <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10"><path d="M1 11L11 1M11 1H4M11 1v7"/></svg></a>`
      : "—";

    const deptCorto = (d.departamento || "").replace("DEPARTAMENTO ACADÉMICO DE ", "");

    return `
      <tr style="animation-delay:${i * 0.03}s">
        <td class="td-docente">
          ${escapar(d.docente || "—")}
          ${deptCorto ? `<div style="font-size:10px;color:#adb5bd;font-weight:400;margin-top:2px">${escapar(deptCorto)}</div>` : ""}
        </td>
        <td class="td-titulo">${titulo}</td>
        <td class="td-anio">${d.anio || "—"}</td>
        <td class="td-revista">${escapar(d.revista || "—")}</td>
        <td style="font-size:11px;color:#6c757d;white-space:nowrap">${capitalizarTipo(d.tipo_documento || "")}</td>
        <td class="td-citas"><span class="${citasClass}">${citas}</span></td>
        <td class="td-indices">${badges || '<span style="color:#adb5bd;font-size:11px">—</span>'}</td>
        <td class="td-link">${enlace}</td>
      </tr>`;
  }).join("");
}


// ─────────────────────────────────────────────────────────────
// PAGINACIÓN
// ─────────────────────────────────────────────────────────────

function renderPaginacion() {
  const total  = Math.ceil(datosFiltros.length / POR_PAGINA);
  const pagDiv = document.getElementById("paginacion");

  if (total <= 1) { pagDiv.innerHTML = ""; return; }

  let html = "";

  // Anterior
  html += `<button class="pag-btn" onclick="irAPagina(${paginaActual - 1})" ${paginaActual === 1 ? "disabled" : ""}>‹</button>`;

  // Páginas
  const rango = paginasARender(paginaActual, total);
  let anterior = null;
  for (const p of rango) {
    if (anterior !== null && p - anterior > 1) {
      html += `<button class="pag-btn" disabled>…</button>`;
    }
    html += `<button class="pag-btn ${p === paginaActual ? "activo" : ""}" onclick="irAPagina(${p})">${p}</button>`;
    anterior = p;
  }

  // Siguiente
  html += `<button class="pag-btn" onclick="irAPagina(${paginaActual + 1})" ${paginaActual === total ? "disabled" : ""}>›</button>`;

  pagDiv.innerHTML = html;
}

function paginasARender(actual, total) {
  const paginas = new Set([1, total, actual]);
  for (let i = Math.max(1, actual - 2); i <= Math.min(total, actual + 2); i++) paginas.add(i);
  return [...paginas].sort((a, b) => a - b);
}

function irAPagina(p) {
  const total = Math.ceil(datosFiltros.length / POR_PAGINA);
  if (p < 1 || p > total) return;
  paginaActual = p;
  renderTabla();
  renderPaginacion();
  document.getElementById("publicaciones").scrollIntoView({ behavior: "smooth", block: "start" });
}


// ─────────────────────────────────────────────────────────────
// EXPORTAR CSV
// ─────────────────────────────────────────────────────────────

function exportarCSV() {
  const cols    = ["docente", "departamento", "titulo", "anio", "revista", "tipo_documento", "doi", "citas", "en_scopus", "en_wos", "open_access", "fuentes", "url_doi"];
  const headers = ["Docente", "Departamento", "Título", "Año", "Revista", "Tipo", "DOI", "Citas", "En Scopus", "En WoS", "Acceso Abierto", "Fuentes", "URL"];

  const filas = [headers, ...datosFiltros.map(d => cols.map(c => {
    const v = String(d[c] || "").replace(/"/g, '""');
    return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v}"` : v;
  }))];

  const csv  = filas.map(f => f.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `publicaciones-unh-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}


// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

function escapar(str) {
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;");
}

function capitalizarTipo(tipo) {
  if (!tipo) return "";
  const mapa = {
    "journal-article": "Artículo",
    "article":         "Artículo",
    "book-chapter":    "Capítulo",
    "book":            "Libro",
    "proceedings-article": "Conferencia",
    "review":          "Revisión",
    "report":          "Reporte",
    "dataset":         "Dataset",
    "thesis":          "Tesis",
  };
  return mapa[tipo.toLowerCase()] || tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();
}
