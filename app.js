// ============================================================
// PORTAL DE INVESTIGACIÓN UNH — app.js v2
// Búsqueda por docente + dashboard + cards de publicaciones
// ============================================================

const SHEETS_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTnX1PTEE3CAOfyx-OLMlowO090KxbxozOPULTdVPEBXHNLA_m_YIybSWcJ68QuzwBI5yZ2aBUlWCv2/pub?output=csv";

let todosLosDatos     = [];   // todas las publicaciones
let docentesMap       = {};   // { nombre: [publicaciones] }
let docenteActual     = null;
let docenteComparado  = null;
let pubFiltradas      = [];
let anioSeleccionado  = "";
let tipoSeleccionado  = "";
let fuenteSeleccionada= "";

// ─────────────────────────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  iniciarConstelacionesHero();
  await cargarDatos();
  configurarBuscador();
  configurarFiltros();
  configurarComparacion();
  document.getElementById("btnVolver").addEventListener("click", volverAlInicio);
});

async function cargarDatos() {
  try {
    const res  = await fetch(SHEETS_CSV);
    const text = await res.text();
    const raw  = parsearCSV(text);

    // Filtrar solo publicaciones reales
    todosLosDatos = raw.filter(d =>
      d.titulo &&
      !d.titulo.startsWith("SIN ") &&
      !d.titulo.startsWith("ERROR") &&
      !d.titulo.startsWith("NO ") &&
      d.docente && d.docente.trim()
    );

    // Agrupar por docente
    docentesMap = {};
    todosLosDatos.forEach(d => {
      const nombre = d.docente.trim();
      if (!docentesMap[nombre]) docentesMap[nombre] = [];
      docentesMap[nombre].push(d);
    });

  } catch (e) {
    console.error("Error cargando datos:", e);
    document.getElementById("estadoInicial").innerHTML =
      '<div class="container"><div class="placeholder-content"><h3>Error al cargar datos</h3><p>No se pudo conectar con la base de datos. Intenta más tarde.</p></div></div>';
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
    const obj = {};
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
// BUSCADOR CON SUGERENCIAS
// ─────────────────────────────────────────────────────────────

function configurarBuscador() {
  const input      = document.getElementById("searchInput");
  const sugerencias = document.getElementById("sugerencias");
  const btnClear   = document.getElementById("btnClear");

  const actualizarActiva = () => {
    const items = sugerencias.querySelectorAll("li");
    items.forEach((item, idx) => {
      const activa = item.classList.contains("activa");
      item.setAttribute("aria-selected", activa ? "true" : "false");
      if (!item.id) item.id = `sug-item-${idx}`;
      if (activa) input.setAttribute("aria-activedescendant", item.id);
    });
    if (!sugerencias.querySelector("li.activa")) input.removeAttribute("aria-activedescendant");
  };

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    btnClear.classList.toggle("visible", q.length > 0);

    if (q.length < 2) {
      cerrarSugerencias();
      return;
    }

    // Buscar docentes que coincidan
    const coincidencias = Object.keys(docentesMap)
      .filter(nombre => nombre.toLowerCase().includes(q))
      .sort((a, b) => {
        // Priorizar los que empiezan con la búsqueda
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b);
      })
      .slice(0, 8);

    if (coincidencias.length === 0) {
      cerrarSugerencias();
      return;
    }

    sugerencias.innerHTML = coincidencias.map(nombre => {
      const pubs    = docentesMap[nombre];
      const dept    = (pubs[0]?.departamento || "").replace("DEPARTAMENTO ACADÉMICO DE ", "");
      const iniciales = obtenerIniciales(nombre);
      return `
        <li data-nombre="${escapar(nombre)}" role="option" aria-selected="false">
          <div class="sug-avatar">${iniciales}</div>
          <div class="sug-info">
            <span class="sug-nombre">${resaltarCoincidencia(escapar(nombre), q)}</span>
            <span class="sug-dept">${dept || "Docente UNH"} · ${pubs.length} pub.</span>
          </div>
        </li>`;
    }).join("");

    sugerencias.classList.add("visible");
    input.setAttribute("aria-expanded", "true");
    actualizarActiva();

    // Click en sugerencia
    sugerencias.querySelectorAll("li").forEach(li => {
      li.addEventListener("click", () => {
        const nombre = li.dataset.nombre;
        input.value  = nombre;
        cerrarSugerencias();
        btnClear.classList.add("visible");
        mostrarDocente(nombre);
      });
    });
  });

  // Navegación con teclado
  input.addEventListener("keydown", e => {
    const items = sugerencias.querySelectorAll("li");
    const activa = sugerencias.querySelector("li.activa");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!activa) items[0]?.classList.add("activa");
      else {
        activa.classList.remove("activa");
        (activa.nextElementSibling || items[0])?.classList.add("activa");
      }
      actualizarActiva();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (activa) {
        activa.classList.remove("activa");
        (activa.previousElementSibling || items[items.length - 1])?.classList.add("activa");
      }
      actualizarActiva();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activa) {
        input.value = activa.dataset.nombre;
        cerrarSugerencias();
        btnClear.classList.add("visible");
        mostrarDocente(activa.dataset.nombre);
      }
    } else if (e.key === "Escape") {
      cerrarSugerencias();
    }
  });

  // Cerrar al hacer click fuera
  document.addEventListener("click", e => {
    if (!e.target.closest(".search-container")) cerrarSugerencias();
  });

  btnClear.addEventListener("click", () => {
    input.value = "";
    btnClear.classList.remove("visible");
    cerrarSugerencias();
    volverAlInicio();
  });
}

function cerrarSugerencias() {
  const sugerencias = document.getElementById("sugerencias");
  const input = document.getElementById("searchInput");
  sugerencias.classList.remove("visible");
  sugerencias.innerHTML = "";
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
}

function resaltarCoincidencia(texto, q) {
  const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
  return texto.replace(regex, "<strong>$1</strong>");
}


// ─────────────────────────────────────────────────────────────
// MOSTRAR PERFIL DE DOCENTE
// ─────────────────────────────────────────────────────────────

function mostrarDocente(nombre) {
  docenteActual = nombre;
  docenteComparado = null;
  const pubs    = docentesMap[nombre] || [];

  if (pubs.length === 0) return;

  const primera  = pubs[0];
  const dept     = (primera.departamento || "").replace("DEPARTAMENTO ACADÉMICO DE ", "");
  const orcid    = primera.orcid_docente || "";
  const iniciales = obtenerIniciales(nombre);

  // Perfil
  document.getElementById("perfilAvatar").textContent = iniciales;
  document.getElementById("perfilNombre").textContent = nombre;
  document.getElementById("perfilDept").textContent   = dept || "Docente UNH";
  document.getElementById("perfilOrcid").innerHTML    = orcid
    ? `ORCID: <a href="https://orcid.org/${orcid}" target="_blank">${orcid}</a>`
    : "";

  // Dashboard
  const enScopus = pubs.filter(p => esBool(p.en_scopus)).length;
  const enWos    = pubs.filter(p => esBool(p.en_wos)).length;
  const citas    = pubs.reduce((s, p) => s + (parseInt(p.citas) || 0), 0);
  const enOA     = pubs.filter(p => (p.open_access||"").match(/gold|green/i)).length;
  const anios    = [...new Set(pubs.map(p => p.anio).filter(Boolean))].sort();
  const rangoAnios = anios.length > 1 ? `${anios[0]}–${anios[anios.length-1]}` : anios[0] || "—";

  animarNum("dTotal",  pubs.length);
  animarNum("dScopus", enScopus);
  animarNum("dWos",    enWos);
  animarNum("dCitas",  citas);
  animarNum("dOA",     enOA);
  document.getElementById("dAnios").textContent = rangoAnios;

  // Filtros de año
  const filtrosAnioDiv = document.getElementById("filtrosAnio");
  anioSeleccionado  = "";
  tipoSeleccionado  = "";
  fuenteSeleccionada= "";

  const aniosUnicos = [...new Set(pubs.map(p => p.anio).filter(Boolean))].sort((a,b) => b - a);
  filtrosAnioDiv.innerHTML = `<button class="chip activo" data-anio="">Todos</button>` +
    aniosUnicos.map(a => `<button class="chip" data-anio="${a}">${a}</button>`).join("");

  filtrosAnioDiv.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      filtrosAnioDiv.querySelectorAll(".chip").forEach(c => c.classList.remove("activo"));
      chip.classList.add("activo");
      anioSeleccionado = chip.dataset.anio;
      renderPublicaciones();
    });
  });

  // Filtro de tipo
  const tipos = [...new Set(pubs.map(p => p.tipo_documento).filter(Boolean))].sort();
  const filtroTipo = document.getElementById("filtroTipo");
  filtroTipo.innerHTML = `<option value="">Todos los tipos</option>` +
    tipos.map(t => `<option value="${t}">${capitalizarTipo(t)}</option>`).join("");

  document.getElementById("filtroFuente").value = "";

  const compararResultado = document.getElementById("compararResultado");
  const compararInput = document.getElementById("compararInput");
  if (compararResultado) {
    compararResultado.innerHTML = "Selecciona un segundo docente para comparar métricas y publicaciones destacadas.";
  }
  if (compararInput) compararInput.value = "";

  // Mostrar sección
  document.getElementById("estadoInicial").style.display  = "none";
  document.getElementById("perfilSection").style.display  = "block";
  document.getElementById("perfilSection").scrollIntoView({ behavior: "smooth", block: "start" });

  renderPublicaciones();
}

function volverAlInicio() {
  docenteActual = null;
  docenteComparado = null;
  document.getElementById("perfilSection").style.display = "none";
  document.getElementById("estadoInicial").style.display = "block";
  document.getElementById("searchInput").value = "";
  document.getElementById("btnClear").classList.remove("visible");
  cerrarModalComparacion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function abrirModalComparacion() {
  const panel = document.getElementById("compararPanel");
  if (!panel) return;
  panel.hidden = false;
  panel.classList.add("visible");
  document.body.style.overflow = "hidden";
}

function cerrarModalComparacion() {
  const panel = document.getElementById("compararPanel");
  if (!panel) return;
  panel.classList.remove("visible");
  panel.hidden = true;
  document.body.style.overflow = "";
}

function configurarComparacion() {
  const btnComparar = document.getElementById("btnComparar");
  const btnCerrar = document.getElementById("btnCerrarComparar");
  const btnAplicar = document.getElementById("btnAplicarComparar");
  const panel = document.getElementById("compararPanel");
  const lista = document.getElementById("listaDocentesComparar");
  const input = document.getElementById("compararInput");

  if (!btnComparar || !btnCerrar || !btnAplicar || !panel || !lista || !input) return;

  btnComparar.addEventListener("click", () => {
    const docentes = Object.keys(docentesMap).sort((a, b) => a.localeCompare(b));
    lista.innerHTML = docentes.map(n => `<option value="${escapar(n)}"></option>`).join("");
    abrirModalComparacion();
    input.focus();
  });

  btnCerrar.addEventListener("click", () => {
    cerrarModalComparacion();
  });

  panel.addEventListener("click", (e) => {
    if (e.target === panel) cerrarModalComparacion();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) cerrarModalComparacion();
  });

  btnAplicar.addEventListener("click", () => {
    if (!docenteActual) return;
    const nombreB = input.value.trim();
    if (!nombreB || !docentesMap[nombreB]) {
      document.getElementById("compararResultado").innerHTML =
        `<div class="comparar-empty">No se encontró el docente seleccionado. Elige un nombre válido de la lista.</div>`;
      return;
    }
    if (nombreB === docenteActual) {
      document.getElementById("compararResultado").innerHTML =
        `<div class="comparar-empty">Selecciona un docente distinto para comparar.</div>`;
      return;
    }

    docenteComparado = nombreB;
    renderComparacion(docenteActual, docenteComparado);
  });
}

function obtenerResumenDocente(nombre) {
  const pubs = [...(docentesMap[nombre] || [])];
  const total = pubs.length;
  const enScopus = pubs.filter(p => esBool(p.en_scopus)).length;
  const enWos = pubs.filter(p => esBool(p.en_wos)).length;
  const citas = pubs.reduce((sum, p) => sum + (parseInt(p.citas, 10) || 0), 0);
  const oa = pubs.filter(p => (p.open_access || "").match(/gold|green/i)).length;
  const anios = [...new Set(pubs.map(p => p.anio).filter(Boolean))].sort();
  const rango = anios.length > 1 ? `${anios[0]}–${anios[anios.length - 1]}` : (anios[0] || "—");

  const top = pubs
    .slice()
    .sort((a, b) => (parseInt(b.citas, 10) || 0) - (parseInt(a.citas, 10) || 0))
    .slice(0, 5)
    .map(p => ({ titulo: p.titulo || "Sin título", citas: parseInt(p.citas, 10) || 0 }));

  return { nombre, total, enScopus, enWos, citas, oa, rango, top };
}

function renderComparacion(nombreA, nombreB) {
  const a = obtenerResumenDocente(nombreA);
  const b = obtenerResumenDocente(nombreB);

  const renderTop = (top) => {
    if (!top.length) return `<li>Sin publicaciones para mostrar</li>`;
    return top
      .map(item => `<li>${escapar(item.titulo)} <strong>(${item.citas} citas)</strong></li>`)
      .join("");
  };

  const col = (r) => `
    <article class="comparar-col">
      <div class="comparar-nombre">${escapar(r.nombre)}</div>
      <div class="comparar-kpis">
        <div class="comparar-kpi"><div class="comparar-kpi-num">${r.total}</div><div class="comparar-kpi-label">Publicaciones</div></div>
        <div class="comparar-kpi"><div class="comparar-kpi-num">${r.citas}</div><div class="comparar-kpi-label">Citas</div></div>
        <div class="comparar-kpi"><div class="comparar-kpi-num">${r.enScopus}</div><div class="comparar-kpi-label">En Scopus</div></div>
        <div class="comparar-kpi"><div class="comparar-kpi-num">${r.enWos}</div><div class="comparar-kpi-label">En WoS</div></div>
        <div class="comparar-kpi"><div class="comparar-kpi-num">${r.oa}</div><div class="comparar-kpi-label">Acceso abierto</div></div>
        <div class="comparar-kpi"><div class="comparar-kpi-num">${escapar(r.rango)}</div><div class="comparar-kpi-label">Rango años</div></div>
      </div>
      <div class="comparar-top-title">Top 5 publicaciones con más citas</div>
      <ol class="comparar-top-list">${renderTop(r.top)}</ol>
    </article>`;

  document.getElementById("compararResultado").innerHTML = `
    <div class="comparar-grid">
      ${col(a)}
      ${col(b)}
    </div>`;
}


// ─────────────────────────────────────────────────────────────
// FILTROS
// ─────────────────────────────────────────────────────────────

function configurarFiltros() {
  document.getElementById("filtroTipo").addEventListener("change", e => {
    tipoSeleccionado = e.target.value;
    renderPublicaciones();
  });
  document.getElementById("filtroFuente").addEventListener("change", e => {
    fuenteSeleccionada = e.target.value;
    renderPublicaciones();
  });
}


// ─────────────────────────────────────────────────────────────
// RENDERIZAR PUBLICACIONES
// ─────────────────────────────────────────────────────────────

function renderPublicaciones() {
  if (!docenteActual) return;
  let pubs = [...(docentesMap[docenteActual] || [])];

  // Aplicar filtros
  if (anioSeleccionado)   pubs = pubs.filter(p => p.anio === anioSeleccionado);
  if (tipoSeleccionado)   pubs = pubs.filter(p => p.tipo_documento === tipoSeleccionado);
  if (fuenteSeleccionada === "scopus") pubs = pubs.filter(p => esBool(p.en_scopus));
  if (fuenteSeleccionada === "wos")    pubs = pubs.filter(p => esBool(p.en_wos));
  if (fuenteSeleccionada === "oa")     pubs = pubs.filter(p => (p.open_access||"").match(/gold|green/i));

  // Ordenar por año desc, luego citas desc
  pubs.sort((a, b) => {
    const anioD = (parseInt(b.anio) || 0) - (parseInt(a.anio) || 0);
    if (anioD !== 0) return anioD;
    return (parseInt(b.citas) || 0) - (parseInt(a.citas) || 0);
  });

  pubFiltradas = pubs;

  // Contador
  document.getElementById("pubContador").textContent =
    `${pubs.length} publicación${pubs.length !== 1 ? "es" : ""} encontrada${pubs.length !== 1 ? "s" : ""}`;

  const grid   = document.getElementById("pubGrid");
  const sinPub = document.getElementById("sinPub");

  if (pubs.length === 0) {
    grid.innerHTML    = "";
    sinPub.style.display = "block";
    return;
  }

  sinPub.style.display = "none";

  grid.innerHTML = pubs.map((p, i) => {
    const citas    = parseInt(p.citas) || 0;
    const enScopus = esBool(p.en_scopus);
    const enWos    = esBool(p.en_wos);
    const esOA     = !!(p.open_access||"").match(/gold|green/i);
    const url      = p.url_doi || p.url_scopus || p.url_wos || "";

    // Color de borde según índice
    let claseCard = "pub-card solo-api";
    if (enScopus && enWos) claseCard = "pub-card scopus-wos";
    else if (enScopus)     claseCard = "pub-card solo-scopus";
    else if (enWos)        claseCard = "pub-card solo-wos";

    const fuentes    = (p.fuentes || "").toLowerCase();
    const enOpenAlex  = fuentes.includes("openalex");
    const enCrossref  = fuentes.includes("crossref");

    const badges = [
      enScopus   ? `<span class="badge badge-scopus">Scopus</span>`       : "",
      enWos      ? `<span class="badge badge-wos">WoS</span>`             : "",
      enOpenAlex ? `<span class="badge badge-openalex">OpenAlex</span>`   : "",
      enCrossref ? `<span class="badge badge-crossref">Crossref</span>`   : "",
      esOA       ? `<span class="badge badge-oa">OA</span>`               : "",
    ].filter(Boolean).join("");

    const tituloHTML = url
      ? `<a href="${escapar(url)}" target="_blank" rel="noopener">${escapar(p.titulo)}</a>`
      : escapar(p.titulo);

    const enlaceHTML = url
      ? `<a href="${escapar(url)}" target="_blank" rel="noopener" class="card-link">
           Ver artículo
           <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10">
             <path d="M1 11L11 1M11 1H4M11 1v7"/>
           </svg>
         </a>`
      : "";

    // Autores: mostrar máximo 3 con botón "ver más"
    const autoresRaw = (p.autores || "").trim();
    let autoresHTML  = "";
    if (autoresRaw) {
      const lista   = autoresRaw.split(";").map(a => a.trim()).filter(Boolean);
      const cardId  = `autores-${i}`;
      if (lista.length > 3) {
        const visibles = lista.slice(0, 3).join("; ");
        const todos    = lista.join("; ");
        autoresHTML = `<span class="autores-corto" id="${cardId}-corto">${escapar(visibles)}</span><span class="autores-largo" id="${cardId}-largo" style="display:none">${escapar(todos)}</span> <button class="btn-ver-mas" onclick="toggleAutores('${cardId}')">ver más</button>`;
      } else {
        autoresHTML = lista.join("; ");
      }
    }

    // Tema principal
    const temaHTML = p.tema_principal
      ? `<span class="card-tema">${escapar(p.tema_principal)}</span>`
      : "";

    // WoS index
    const wosIdxHTML = p.wos_index
      ? `<span class="card-wos-idx">${escapar(p.wos_index)}</span>`
      : "";

    // Idioma
    const idiomaHTML = p.idioma
      ? `<span class="card-idioma">${escapar(p.idioma.toUpperCase().slice(0,2))}</span>`
      : "";

    return `
      <div class="${claseCard}" style="animation-delay:${i * 0.04}s">
        <div class="card-header">
          <span class="card-anio">${p.anio || "—"}</span>
          <div class="card-badges">${badges}${idiomaHTML}</div>
        </div>
        <div class="card-titulo">${tituloHTML}</div>
        ${autoresRaw ? `<div class="card-autores">${autoresHTML}</div>` : ""}
        ${p.revista ? `<div class="card-revista"><span class="card-revista-label">Revista:</span> ${escapar(p.revista)}</div>` : ""}
        ${(temaHTML || wosIdxHTML) ? `<div class="card-meta-row">${temaHTML}${wosIdxHTML}</div>` : ""}
        <div class="card-footer">
          <div class="card-citas">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13">
              <path d="M2 12V4a2 2 0 012-2h8a2 2 0 012 2v5a2 2 0 01-2 2H5l-3 3z"/>
            </svg>
            <span class="card-citas-num">${citas}</span>
            <span style="color:var(--g500)">cita${citas !== 1 ? "s" : ""}</span>
          </div>
          <span class="card-tipo">${capitalizarTipo(p.tipo_documento)}</span>
          ${enlaceHTML}
        </div>
      </div>`;
  }).join("");
}


// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

function esBool(valor) {
  return valor === "True" || valor === "true" || valor === "TRUE" || valor === true;
}

function toggleAutores(id) {
  const corto  = document.getElementById(`${id}-corto`);
  const largo  = document.getElementById(`${id}-largo`);
  const btn    = corto.closest(".card-autores").querySelector(".btn-ver-mas");
  const abierto = largo.style.display !== "none";
  corto.style.display = abierto ? "inline"  : "none";
  largo.style.display = abierto ? "none"    : "inline";
  btn.textContent     = abierto ? "ver más" : "ver menos";
}

function obtenerIniciales(nombre) {
  const palabras = nombre.trim().split(/\s+/);
  if (palabras.length >= 2) {
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
  }
  return nombre.substring(0, 2).toUpperCase();
}

function escapar(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function capitalizarTipo(tipo) {
  if (!tipo) return "";
  const mapa = {
    "journal-article":      "Artículo",
    "article":              "Artículo",
    "book-chapter":         "Capítulo de libro",
    "book":                 "Libro",
    "proceedings-article":  "Conferencia",
    "review":               "Revisión",
    "report":               "Reporte",
    "dataset":              "Dataset",
    "thesis":               "Tesis",
  };
  return mapa[tipo.toLowerCase()] || tipo.charAt(0).toUpperCase() + tipo.slice(1).toLowerCase();
}

function animarNum(id, final) {
  const el  = document.getElementById(id);
  const dur = 800;
  const t0  = performance.now();
  function step(now) {
    const t    = Math.min((now - t0) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(ease * final).toLocaleString("es-PE");
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function iniciarConstelacionesHero() {
  const canvas = document.getElementById("heroConstelaciones");
  const heroBg = document.querySelector(".hero-bg");
  if (!canvas || !heroBg) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let particles = [];
  let rafId = null;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const randomBetween = (min, max) => Math.random() * (max - min) + min;

  function buildParticles() {
    const isMobile = window.innerWidth <= 768;
    const count = isMobile ? 52 : 96;
    const maxSpeed = isMobile ? 0.16 : 0.22;

    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: randomBetween(-maxSpeed, maxSpeed),
      vy: randomBetween(-maxSpeed, maxSpeed),
      r: randomBetween(0.8, 2.1)
    }));
  }

  function resizeCanvas() {
    const rect = heroBg.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    buildParticles();
  }

  function drawFrame() {
    ctx.clearRect(0, 0, width, height);

    const lineDistance = window.innerWidth <= 768 ? 120 : 150;
    const lineDistance2 = lineDistance * lineDistance;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      if (!prefersReducedMotion) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x <= 0 || p.x >= width) p.vx *= -1;
        if (p.y <= 0 || p.y >= height) p.vy *= -1;

        p.x = Math.max(0, Math.min(width, p.x));
        p.y = Math.max(0, Math.min(height, p.y));
      }

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < lineDistance2) {
          const alpha = 1 - dist2 / lineDistance2;
          ctx.strokeStyle = `rgba(188, 220, 255, ${0.34 * alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }

    for (const p of particles) {
      ctx.fillStyle = "rgba(236, 247, 255, .9)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!prefersReducedMotion) {
      rafId = requestAnimationFrame(drawFrame);
    }
  }

  resizeCanvas();
  drawFrame();

  window.addEventListener("resize", () => {
    if (rafId) cancelAnimationFrame(rafId);
    resizeCanvas();
    drawFrame();
  });
}