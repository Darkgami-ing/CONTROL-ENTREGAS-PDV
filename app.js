"use strict";

const API_URL = "https://script.google.com/macros/s/AKfycbwayndYVz0ZT-PueVkxenuDJKn3u6viEq6d-Pw3SYtgYZHy3yNSkoKd5_KYQ9liCUMh/exec";
const TOKEN_KEY = "control_entregas_token";

const state = {
  user: null,
  view: "resumen",
  records: [],
  users: [],
  summary: { PENDIENTE: 0, SUBIDO: 0, INVALIDO: 0 },
  filters: { search: "", status: "TODOS", operation: "TODAS" },
  photos: [],
  scanner: null,
  loadingData: false,
};

const app = document.querySelector("#app");
const toastElement = document.querySelector("#toast");
const modalElement = document.querySelector("#modal");

const ROLE_LABELS = {
  ADMINISTRADOR: "Administrador",
  ENCARGADO: "Encargado de PDV",
  PDV: "PDV",
  REPARTIDOR: "Repartidor",
};

const STATUS_LABELS = {
  PENDIENTE: "Pendiente",
  SUBIDO: "Subido al sistema",
  INVALIDO: "Inválido",
};

const OPERATION_LABELS = {
  ENTREGA: "Entrega de pedido",
  NO_ENTREGADO: "No se pudo entregar",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusBadge(status) {
  const css = status === "SUBIDO" ? "uploaded" : status === "INVALIDO" ? "invalid" : "pending";
  return `<span class="badge badge-${css}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function operationLabel(operation) {
  return OPERATION_LABELS[operation] || operation || "—";
}

function roleLabel(role) {
  return ROLE_LABELS[role] || role || "—";
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function api(action, payload = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ ...payload, action, ...(token ? { token } : {}) }),
      redirect: "follow",
      cache: "no-store",
    });
  } catch (_error) {
    throw new Error("No se pudo conectar con Google. Revisa tu conexión a internet.");
  }

  let data;
  try {
    data = await response.json();
  } catch (_error) {
    throw new Error("Google Apps Script devolvió una respuesta no válida.");
  }

  if (!data.ok) {
    if (Number(data.status) === 401 && action !== "login") {
      setToken(null);
      state.user = null;
    }
    const error = new Error(data.error || "No se pudo completar la operación.");
    error.status = Number(data.status || response.status || 500);
    throw error;
  }
  return data;
}

function renderLoading(message = "Conectando con Google…") {
  app.innerHTML = `
    <main class="loading-page">
      <section class="loading-card">
        <div class="spinner" style="margin:0 auto 16px"></div>
        <strong>${escapeHtml(message)}</strong>
      </section>
    </main>`;
}

function brand() {
  return `
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">CE</div>
      <div>
        <div class="brand-name">Control de Entregas</div>
        <div class="brand-sub">Gestión de evidencias PDV</div>
      </div>
    </div>`;
}

function renderAuth(mode) {
  const setup = mode === "setup";
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card">
        ${brand()}
        <h1 class="auth-title">${setup ? "Configurar administrador" : "Iniciar sesión"}</h1>
        <p class="auth-copy">${setup
          ? "Crea la primera cuenta. Desde ella podrás registrar encargados, PDV y repartidores."
          : "Ingresa con el usuario y la contraseña asignados a tu rol."}</p>
        <form id="${setup ? "setup-form" : "login-form"}" autocomplete="on">
          <div class="field">
            <label for="auth-username">Usuario</label>
            <input class="input" id="auth-username" name="username" minlength="3" maxlength="40" autocomplete="username" autocapitalize="none" required>
          </div>
          <div class="field">
            <label for="auth-password">Contraseña</label>
            <input class="input" id="auth-password" name="password" type="password" minlength="8" maxlength="100" autocomplete="${setup ? "new-password" : "current-password"}" required>
            ${setup ? '<p class="helper">Usa al menos 8 caracteres.</p>' : ""}
          </div>
          ${setup ? `
            <div class="field">
              <label for="auth-confirm">Confirmar contraseña</label>
              <input class="input" id="auth-confirm" name="confirm" type="password" minlength="8" maxlength="100" autocomplete="new-password" required>
            </div>` : ""}
          <button class="btn btn-primary btn-block" type="submit" data-submit-label="${setup ? "Crear administrador" : "Ingresar"}">
            ${setup ? "Crear administrador" : "Ingresar"}
          </button>
        </form>
      </section>
    </main>`;
  document.querySelector("#auth-username")?.focus();
}

async function boot() {
  renderLoading();
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    try {
      const result = await api("me");
      state.user = result.user;
      await enterApp();
      return;
    } catch (_error) {
      setToken(null);
    }
  }

  try {
    const result = await api("setupStatus");
    renderAuth(result.needsSetup ? "setup" : "login");
  } catch (error) {
    renderConnectionError(error.message);
  }
}

function renderConnectionError(message) {
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card">
        ${brand()}
        <h1 class="auth-title">No pudimos abrir el sistema</h1>
        <p class="auth-copy">${escapeHtml(message)}</p>
        <button class="btn btn-primary btn-block" type="button" data-action="retry">Reintentar</button>
      </section>
    </main>`;
}

async function submitAuth(form, setup) {
  const formData = new FormData(form);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  if (setup && password !== String(formData.get("confirm") || "")) {
    showToast("Las contraseñas no coinciden.", "error");
    return;
  }
  const button = form.querySelector("button[type='submit']");
  setBusy(button, true, setup ? "Creando…" : "Ingresando…");
  try {
    const result = await api(setup ? "setup" : "login", { username, password });
    setToken(result.token);
    state.user = result.user;
    await enterApp();
    showToast(setup ? "Administrador creado correctamente." : "Sesión iniciada.", "success");
  } catch (error) {
    showToast(error.message, "error");
    setBusy(button, false);
  }
}

async function enterApp() {
  state.view = state.user.role === "REPARTIDOR" ? "nueva" : "resumen";
  renderShell();
  await loadData();
}

function navItems() {
  if (state.user.role === "REPARTIDOR") {
    return [
      { id: "nueva", icon: "＋", label: "Nueva gestión" },
      { id: "registros", icon: "▤", label: "Mis registros" },
    ];
  }
  return [
    { id: "resumen", icon: "⌂", label: "Resumen" },
    { id: "registros", icon: "▤", label: "Registros" },
    { id: "usuarios", icon: "♙", label: "Usuarios" },
  ];
}

function navButtons(mobile = false) {
  return navItems().map((item) => `
    <button class="${mobile ? "" : "nav-btn "}${state.view === item.id ? "active" : ""}" type="button" data-view="${item.id}" aria-current="${state.view === item.id ? "page" : "false"}">
      <span class="nav-ico" aria-hidden="true">${item.icon}</span>
      <span>${escapeHtml(item.label)}</span>
    </button>`).join("");
}

function viewTitle() {
  return navItems().find((item) => item.id === state.view)?.label || "Control de entregas";
}

function renderShell() {
  const columns = navItems().length;
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        ${brand()}
        <nav class="sidebar-nav" aria-label="Navegación principal">${navButtons()}</nav>
        <div class="account-box">
          <div class="account-name">${escapeHtml(state.user.username)}</div>
          <div class="account-role">${escapeHtml(roleLabel(state.user.role))}</div>
          <button class="btn btn-outline btn-block" type="button" data-action="change-password">Cambiar contraseña</button>
          <button class="btn btn-outline btn-block" type="button" data-action="logout">Cerrar sesión</button>
        </div>
      </aside>
      <div class="main-wrap">
        <header class="topbar">
          <div>
            <h1 class="top-title" id="view-title">${escapeHtml(viewTitle())}</h1>
            <p class="top-sub">${escapeHtml(roleLabel(state.user.role))} · ${escapeHtml(state.user.username)}</p>
          </div>
          <div class="top-actions">
            <button class="btn btn-icon mobile-menu" type="button" data-action="change-password" aria-label="Cambiar contraseña">🔑</button>
            <button class="btn btn-icon mobile-menu" type="button" data-action="logout" aria-label="Cerrar sesión">↪</button>
          </div>
        </header>
        <main class="content" id="content"></main>
      </div>
      <nav class="bottom-nav" style="grid-template-columns:repeat(${columns},1fr)" aria-label="Navegación móvil">${navButtons(true)}</nav>
    </div>`;
  renderView();
}

async function loadData(options = {}) {
  state.loadingData = true;
  if (!options.silent) renderViewLoading();
  try {
    const requests = [api("listRecords"), api("summary")];
    if (state.user.role !== "REPARTIDOR") requests.push(api("listUsers"));
    const [recordsResult, summaryResult, usersResult] = await Promise.all(requests);
    state.records = recordsResult.records || [];
    state.summary = summaryResult.summary || { PENDIENTE: 0, SUBIDO: 0, INVALIDO: 0 };
    state.users = usersResult?.users || [];
    state.loadingData = false;
    renderView();
  } catch (error) {
    state.loadingData = false;
    if (error.status === 401) {
      showToast("Tu sesión terminó. Ingresa nuevamente.", "error");
      await boot();
      return;
    }
    renderViewError(error.message);
  }
}

function renderViewLoading() {
  const content = document.querySelector("#content");
  if (!content) return;
  content.innerHTML = `<div class="empty"><div class="spinner" style="margin:0 auto 12px"></div><strong>Cargando información…</strong></div>`;
}

function renderViewError(message) {
  const content = document.querySelector("#content");
  if (!content) return;
  content.innerHTML = `
    <div class="empty">
      <strong>No se pudo cargar la información</strong>
      <p>${escapeHtml(message)}</p>
      <button class="btn btn-primary" style="margin-top:14px" type="button" data-action="reload">Reintentar</button>
    </div>`;
}

function renderView() {
  const title = document.querySelector("#view-title");
  if (title) title.textContent = viewTitle();
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
    button.setAttribute("aria-current", button.dataset.view === state.view ? "page" : "false");
  });
  if (state.loadingData) return;
  if (state.view === "resumen") renderOverview();
  else if (state.view === "registros") renderRecords();
  else if (state.view === "usuarios") renderUsers();
  else renderNewRecord();
}

function totalRecords() {
  return Number(state.summary.PENDIENTE || 0) + Number(state.summary.SUBIDO || 0) + Number(state.summary.INVALIDO || 0);
}

function renderOverview() {
  const content = document.querySelector("#content");
  if (!content) return;
  const total = totalRecords();
  const uploaded = Number(state.summary.SUBIDO || 0);
  const progress = total ? Math.round((uploaded / total) * 100) : 0;
  const recent = state.records.slice(0, 5);
  content.innerHTML = `
    <section class="hero">
      <div>
        <span class="eyebrow">RESUMEN OPERATIVO</span>
        <h2>Hola, ${escapeHtml(state.user.username)}</h2>
        <p>Consulta el estado de las gestiones visibles para tu rol y atiende primero los registros pendientes.</p>
      </div>
      <div class="hero-total"><span>Total visible</span><strong>${total}</strong></div>
    </section>
    <section class="summary-grid" aria-label="Resumen por estado">
      ${summaryCard("PENDIENTE", "!", "tone-amber", "Esperan revisión")}
      ${summaryCard("SUBIDO", "✓", "tone-green", "Procesadas correctamente")}
      ${summaryCard("INVALIDO", "×", "tone-red", "Marcadas como inválidas")}
    </section>
    <section class="grid-two">
      <article class="card">
        <div class="card-head"><h3 class="card-title">Actividad reciente</h3><p class="card-copy">Últimas gestiones registradas.</p></div>
        <div class="card-body">
          ${recent.length ? recent.map((record) => `
            <div class="recent-row">
              ${statusBadge(record.reviewStatus)}
              <div class="recent-main"><b>${escapeHtml(record.guideCode)}</b><small>${escapeHtml(record.courierUsername)} · ${formatDate(record.createdAt)}</small></div>
              <button class="btn btn-icon" type="button" data-action="open-records" aria-label="Ver registros">›</button>
            </div>`).join("") : emptyInline("Aún no existen gestiones.")}
        </div>
      </article>
      <article class="card">
        <div class="card-head"><h3 class="card-title">Avance procesado</h3><p class="card-copy">Porcentaje subido al sistema.</p></div>
        <div class="card-body">
          <div class="progress-ring" style="--value:${progress}%"><div><span><strong>${progress}%</strong>completado</span></div></div>
        </div>
      </article>
    </section>`;
}

function summaryCard(status, icon, tone, description) {
  return `
    <button class="summary-card ${tone}" type="button" data-status-shortcut="${status}">
      <span class="summary-icon" aria-hidden="true">${icon}</span>
      <span><b>${escapeHtml(STATUS_LABELS[status])}</b><small>${escapeHtml(description)}</small></span>
      <strong>${Number(state.summary[status] || 0)}</strong>
    </button>`;
}

function emptyInline(message) {
  return `<div class="empty"><strong>Sin información</strong><p>${escapeHtml(message)}</p></div>`;
}

function filteredRecords() {
  const query = state.filters.search.trim().toUpperCase();
  return state.records.filter((record) => {
    const matchesSearch = !query || [record.guideCode, record.courierUsername, record.pdvUsername, record.managerUsername, record.comment]
      .some((value) => String(value || "").toUpperCase().includes(query));
    const matchesStatus = state.filters.status === "TODOS" || record.reviewStatus === state.filters.status;
    const matchesOperation = state.filters.operation === "TODAS" || record.operation === state.filters.operation;
    return matchesSearch && matchesStatus && matchesOperation;
  });
}

function renderRecords() {
  const content = document.querySelector("#content");
  if (!content) return;
  const records = filteredRecords();
  content.innerHTML = `
    <section class="card filters" aria-label="Filtros de registros">
      <input class="input" id="record-search" type="search" value="${escapeHtml(state.filters.search)}" placeholder="Buscar guía, repartidor o PDV…" aria-label="Buscar registros">
      <select class="select" id="status-filter" aria-label="Filtrar por estado">
        ${option("TODOS", "Todos los estados", state.filters.status)}
        ${option("PENDIENTE", "Pendientes", state.filters.status)}
        ${option("SUBIDO", "Subidos al sistema", state.filters.status)}
        ${option("INVALIDO", "Inválidos", state.filters.status)}
      </select>
      <select class="select" id="operation-filter" aria-label="Filtrar por operación">
        ${option("TODAS", "Todas las operaciones", state.filters.operation)}
        ${option("ENTREGA", "Entrega de pedido", state.filters.operation)}
        ${option("NO_ENTREGADO", "No se pudo entregar", state.filters.operation)}
      </select>
    </section>
    <p class="records-count">${records.length} registro${records.length === 1 ? "" : "s"} visible${records.length === 1 ? "" : "s"}</p>
    ${records.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Guía / operación</th><th>Responsables</th><th>Comentario</th><th>Evidencias</th><th>Estado</th></tr></thead>
          <tbody>${records.map(recordRow).join("")}</tbody>
        </table>
      </div>
      <div class="mobile-records">${records.map(recordCard).join("")}</div>` : emptyInline("Prueba cambiando los filtros o registra una nueva gestión.")}`;
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function recordRow(record) {
  return `
    <tr>
      <td>${formatDate(record.createdAt)}</td>
      <td><b>${escapeHtml(record.guideCode)}</b><div class="meta">${escapeHtml(operationLabel(record.operation))}</div></td>
      <td><b>${escapeHtml(record.courierUsername)}</b><div class="meta">PDV: ${escapeHtml(record.pdvUsername)} · Enc.: ${escapeHtml(record.managerUsername || "—")}</div></td>
      <td class="wrap">${escapeHtml(record.comment || "Sin comentario")}</td>
      <td>${photoButtons(record)}</td>
      <td>${recordStatusControl(record)}</td>
    </tr>`;
}

function recordCard(record) {
  return `
    <article class="record-card">
      <div class="record-top"><div><small>${formatDate(record.createdAt)}</small><div class="record-code">${escapeHtml(record.guideCode)}</div></div>${statusBadge(record.reviewStatus)}</div>
      <div class="record-grid">
        <div><small>Operación</small><b>${escapeHtml(operationLabel(record.operation))}</b></div>
        <div><small>Repartidor</small><b>${escapeHtml(record.courierUsername)}</b></div>
        <div><small>PDV</small><b>${escapeHtml(record.pdvUsername)}</b></div>
        <div><small>Encargado</small><b>${escapeHtml(record.managerUsername || "—")}</b></div>
      </div>
      <p class="record-comment">${escapeHtml(record.comment || "Sin comentario")}</p>
      <div class="record-actions">${photoButtons(record)}${recordStatusControl(record)}</div>
    </article>`;
}

function photoButtons(record) {
  const ids = Array.isArray(record.photoIds) ? record.photoIds : [];
  if (!ids.length) return '<span class="meta">Sin fotos</span>';
  return `<div class="photo-buttons">${ids.map((id, index) => `
    <button class="btn btn-icon" type="button" data-photo-id="${escapeHtml(id)}" aria-label="Ver evidencia ${index + 1}">${index + 1}</button>`).join("")}</div>`;
}

function canReviewRecords() {
  return state.user.role === "ADMINISTRADOR" || state.user.role === "PDV";
}

function recordStatusControl(record) {
  if (!canReviewRecords()) return statusBadge(record.reviewStatus);
  return `
    <select class="select status-select" data-record-status="${escapeHtml(record.id)}" aria-label="Estado de la guía ${escapeHtml(record.guideCode)}">
      ${option("PENDIENTE", "Pendiente", record.reviewStatus)}
      ${option("SUBIDO", "Subido al sistema", record.reviewStatus)}
      ${option("INVALIDO", "Inválido", record.reviewStatus)}
    </select>`;
}

function renderNewRecord() {
  const content = document.querySelector("#content");
  if (!content) return;
  content.innerHTML = `
    <section class="card form-card">
      <div class="form-banner">
        <span class="eyebrow">REGISTRO DE CAMPO</span>
        <h2>Nueva gestión</h2>
        <p>Escanea la guía, registra el resultado y adjunta de 1 a 3 evidencias.</p>
      </div>
      <form class="form-body" id="record-form">
        <div class="form-step">
          <label class="section-label" for="guide-code">1. Código de guía</label>
          <div class="guide-row">
            <input class="input" id="guide-code" name="guideCode" minlength="4" maxlength="80" autocomplete="off" autocapitalize="characters" placeholder="Escanea o escribe el código" required>
            <button class="btn btn-dark" type="button" data-action="scan">▣ Escanear</button>
          </div>
          <p class="helper">También admite lectores físicos de código de barras.</p>
        </div>
        <div class="form-step">
          <span class="section-label">2. Tipo de operación</span>
          <div class="operation-grid" role="radiogroup" aria-label="Tipo de operación">
            <button class="operation-option good" type="button" data-operation="ENTREGA" role="radio" aria-checked="false"><b>✓ Entrega de pedido</b><small>La entrega fue realizada.</small></button>
            <button class="operation-option bad" type="button" data-operation="NO_ENTREGADO" role="radio" aria-checked="false"><b>× No se pudo entregar</b><small>La entrega no fue completada.</small></button>
          </div>
          <input type="hidden" id="operation" name="operation" required>
        </div>
        <div class="form-step">
          <span class="counter" id="photo-counter">${state.photos.length}/3</span>
          <span class="section-label">3. Evidencias fotográficas</span>
          <div class="photo-actions">
            <button class="btn btn-outline" type="button" data-action="camera">▣ Tomar foto</button>
            <button class="btn btn-outline" type="button" data-action="gallery">▧ Elegir de galería</button>
          </div>
          <input id="camera-input" type="file" accept="image/*" capture="environment" hidden>
          <input id="gallery-input" type="file" accept="image/*" multiple hidden>
          <div class="photo-grid" id="photo-grid">${photoPreviewHtml()}</div>
          <p class="helper">Obligatorio: entre 1 y 3 fotos. Se comprimen antes de subirlas.</p>
        </div>
        <div class="form-step">
          <label class="section-label" for="record-comment">4. Comentario</label>
          <textarea class="textarea" id="record-comment" name="comment" maxlength="500" placeholder="Agrega una observación breve…"></textarea>
          <p class="helper"><span id="comment-count">0</span>/500 caracteres</p>
        </div>
        <div class="form-step">
          <button class="btn btn-primary btn-block" type="submit">Guardar gestión</button>
        </div>
      </form>
    </section>`;
}

function photoPreviewHtml() {
  return state.photos.map((photo, index) => `
    <div class="photo-thumb">
      <img src="${photo.preview}" alt="Evidencia ${index + 1}">
      <button class="photo-remove" type="button" data-remove-photo="${index}" aria-label="Eliminar evidencia ${index + 1}">×</button>
    </div>`).join("");
}

async function addPhotos(fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  const available = 3 - state.photos.length;
  if (available <= 0) {
    showToast("Solo puedes adjuntar hasta 3 fotos.", "error");
    return;
  }
  const selected = files.slice(0, available);
  showToast("Preparando fotografías…");
  try {
    for (const file of selected) state.photos.push(await compressImage(file));
    if (files.length > available) showToast("Se agregaron únicamente las fotos disponibles.");
    renderPhotoPreviews();
  } catch (_error) {
    showToast("No se pudo procesar una de las imágenes.", "error");
  }
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const preview = canvas.toDataURL("image/jpeg", 0.8);
        resolve({ mimeType: "image/jpeg", base64: preview.split(",")[1], preview });
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoPreviews() {
  const grid = document.querySelector("#photo-grid");
  const counter = document.querySelector("#photo-counter");
  if (grid) grid.innerHTML = photoPreviewHtml();
  if (counter) counter.textContent = `${state.photos.length}/3`;
}

async function submitRecord(form) {
  const guideCode = String(form.guideCode.value || "").trim().toUpperCase();
  const operation = String(form.operation.value || "");
  const comment = String(form.comment.value || "").trim();
  if (!operation) {
    showToast("Selecciona el tipo de operación.", "error");
    return;
  }
  if (state.photos.length < 1) {
    showToast("Adjunta al menos una fotografía.", "error");
    return;
  }
  const button = form.querySelector("button[type='submit']");
  setBusy(button, true, "Guardando…");
  try {
    await api("createRecord", {
      guideCode,
      operation,
      comment,
      photos: state.photos.map(({ mimeType, base64 }) => ({ mimeType, base64 })),
    });
    state.photos = [];
    state.filters = { search: "", status: "TODOS", operation: "TODAS" };
    showToast("Gestión guardada correctamente.", "success");
    await loadData({ silent: true });
    state.view = "registros";
    renderView();
  } catch (error) {
    showToast(error.message, "error");
    setBusy(button, false);
  }
}

function createRoleOptions() {
  if (state.user.role === "ENCARGADO") return ["PDV"];
  if (state.user.role === "PDV") return ["REPARTIDOR"];
  return ["ENCARGADO", "PDV", "REPARTIDOR", "ADMINISTRADOR"];
}

function renderUsers() {
  const content = document.querySelector("#content");
  if (!content) return;
  const roles = createRoleOptions();
  content.innerHTML = `
    <section class="users-layout">
      <article class="card sticky">
        <div class="card-head"><h2 class="card-title">Crear cuenta</h2><p class="card-copy">La asignación jerárquica se completa automáticamente.</p></div>
        <form class="card-body" id="user-form">
          <div class="field"><label for="new-username">Usuario</label><input class="input" id="new-username" name="username" minlength="3" maxlength="40" autocomplete="off" autocapitalize="none" required></div>
          <div class="field"><label for="new-password">Contraseña</label><input class="input" id="new-password" name="password" type="password" minlength="8" maxlength="100" autocomplete="new-password" required><p class="helper">Mínimo 8 caracteres.</p></div>
          <div class="field"><label for="new-role">Rol</label><select class="select" id="new-role" name="role">${roles.map((role) => option(role, roleLabel(role), roles[0])).join("")}</select></div>
          <div id="assignment-fields"></div>
          <button class="btn btn-primary btn-block" type="submit">Crear cuenta</button>
        </form>
      </article>
      <article class="card">
        <div class="card-head"><h2 class="card-title">Usuarios visibles</h2><p class="card-copy">${state.users.length} cuenta${state.users.length === 1 ? "" : "s"} según tu nivel de acceso.</p></div>
        <div class="card-body">
          ${state.users.length ? `
            <div class="table-wrap desktop-users"><table><thead><tr><th>Usuario</th><th>Rol</th><th>PDV</th><th>Encargado</th><th>Estado / acciones</th></tr></thead><tbody>${state.users.map(userRow).join("")}</tbody></table></div>
            <div class="mobile-users">${state.users.map(userCard).join("")}</div>` : emptyInline("Crea la primera cuenta subordinada.")}
        </div>
      </article>
    </section>`;
  updateAssignmentFields();
}

function updateAssignmentFields() {
  const container = document.querySelector("#assignment-fields");
  const role = document.querySelector("#new-role")?.value;
  if (!container || !role) return;
  if (role === "PDV") {
    if (state.user.role === "ENCARGADO") {
      container.innerHTML = `<div class="field"><label>Encargado asignado</label><div class="assignment">${escapeHtml(state.user.username)} (automático)</div></div>`;
      return;
    }
    const managers = state.users.filter((user) => user.role === "ENCARGADO" && user.status === "ACTIVO");
    container.innerHTML = `<div class="field"><label for="manager-id">Encargado asignado</label><select class="select" id="manager-id" name="managerId" required><option value="">Seleccionar encargado…</option>${managers.map((user) => option(user.id, user.username, "")).join("")}</select>${!managers.length ? '<p class="helper">Primero crea un encargado activo.</p>' : ""}</div>`;
    return;
  }
  if (role === "REPARTIDOR") {
    if (state.user.role === "PDV") {
      container.innerHTML = `<div class="field"><label>PDV asignado</label><div class="assignment">${escapeHtml(state.user.username)} · Encargado heredado automáticamente</div></div>`;
      return;
    }
    const pdvs = state.users.filter((user) => user.role === "PDV" && user.status === "ACTIVO");
    container.innerHTML = `<div class="field"><label for="pdv-id">PDV asignado</label><select class="select" id="pdv-id" name="pdvId" required><option value="">Seleccionar PDV…</option>${pdvs.map((user) => option(user.id, `${user.username} · Enc. ${user.managerUsername}`, "")).join("")}</select>${!pdvs.length ? '<p class="helper">Primero crea un PDV activo.</p>' : ""}</div>`;
    return;
  }
  container.innerHTML = '<p class="helper" style="margin:-6px 0 16px">Este rol no necesita una asignación adicional.</p>';
}

function canManageUser(user) {
  if (user.id === state.user.id) return false;
  if (state.user.role === "ADMINISTRADOR") return true;
  if (state.user.role === "ENCARGADO") return user.role === "PDV" && user.managerId === state.user.id;
  if (state.user.role === "PDV") return user.role === "REPARTIDOR" && user.pdvId === state.user.id;
  return false;
}

function userStatusControl(user) {
  if (!canManageUser(user)) return statusBadge(user.status === "ACTIVO" ? "SUBIDO" : "INVALIDO").replace("Subido al sistema", "Activo").replace("Inválido", "Inactivo");
  return `<select class="select status-select" data-user-status="${escapeHtml(user.id)}" aria-label="Estado de ${escapeHtml(user.username)}">${option("ACTIVO", "Activo", user.status)}${option("INACTIVO", "Inactivo", user.status)}</select>`;
}

function userActions(user) {
  const reset = canManageUser(user)
    ? `<button class="btn btn-icon" type="button" data-reset-password="${escapeHtml(user.id)}" aria-label="Restablecer contraseña de ${escapeHtml(user.username)}" title="Restablecer contraseña">🔑</button>`
    : "";
  return `<div class="user-actions">${userStatusControl(user)}${reset}</div>`;
}

function userRow(user) {
  return `<tr><td><b>${escapeHtml(user.username)}</b><div class="meta">Creado: ${formatDate(user.createdAt)}</div></td><td>${escapeHtml(roleLabel(user.role))}</td><td>${escapeHtml(user.pdvUsername || "—")}</td><td>${escapeHtml(user.managerUsername || "—")}</td><td>${userActions(user)}</td></tr>`;
}

function userCard(user) {
  return `
    <article class="user-card">
      <div class="user-top"><div><b>${escapeHtml(user.username)}</b><div class="meta">${escapeHtml(roleLabel(user.role))}</div></div>${userActions(user)}</div>
      <div class="user-grid"><div><small>PDV</small><b>${escapeHtml(user.pdvUsername || "—")}</b></div><div><small>Encargado</small><b>${escapeHtml(user.managerUsername || "—")}</b></div></div>
    </article>`;
}

async function submitUser(form) {
  const formData = new FormData(form);
  const payload = {
    username: String(formData.get("username") || "").trim(),
    password: String(formData.get("password") || ""),
    role: String(formData.get("role") || ""),
    managerId: String(formData.get("managerId") || ""),
    pdvId: String(formData.get("pdvId") || ""),
  };
  const button = form.querySelector("button[type='submit']");
  setBusy(button, true, "Creando…");
  try {
    await api("createUser", payload);
    showToast("Cuenta creada correctamente.", "success");
    await loadData({ silent: true });
  } catch (error) {
    showToast(error.message, "error");
    setBusy(button, false);
  }
}

function openChangePasswordModal() {
  openModal("Cambiar mi contraseña", `
    <form id="change-password-form">
      <div class="field"><label for="current-password">Contraseña actual</label><input class="input" id="current-password" name="currentPassword" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="new-password-self">Nueva contraseña</label><input class="input" id="new-password-self" name="newPassword" type="password" minlength="8" maxlength="100" autocomplete="new-password" required><p class="helper">Mínimo 8 caracteres y debe ser diferente de la actual.</p></div>
      <div class="field"><label for="confirm-password-self">Confirmar nueva contraseña</label><input class="input" id="confirm-password-self" name="confirmPassword" type="password" minlength="8" maxlength="100" autocomplete="new-password" required></div>
      <button class="btn btn-primary btn-block" type="submit">Actualizar contraseña</button>
    </form>`);
  document.querySelector("#current-password")?.focus();
}

function openResetPasswordModal(user) {
  openModal(`Restablecer contraseña: ${user.username}`, `
    <form id="reset-password-form" data-user-id="${escapeHtml(user.id)}">
      <p class="auth-copy" style="margin-top:0">La cuenta cerrará todas sus sesiones y deberá ingresar con la nueva contraseña.</p>
      <div class="field"><label for="reset-password">Nueva contraseña</label><input class="input" id="reset-password" name="newPassword" type="password" minlength="8" maxlength="100" autocomplete="new-password" required></div>
      <div class="field"><label for="reset-confirm">Confirmar contraseña</label><input class="input" id="reset-confirm" name="confirmPassword" type="password" minlength="8" maxlength="100" autocomplete="new-password" required></div>
      <button class="btn btn-primary btn-block" type="submit">Restablecer contraseña</button>
    </form>`);
  document.querySelector("#reset-password")?.focus();
}

async function submitChangePassword(form) {
  const data = new FormData(form);
  const currentPassword = String(data.get("currentPassword") || "");
  const newPassword = String(data.get("newPassword") || "");
  if (newPassword !== String(data.get("confirmPassword") || "")) {
    showToast("Las nuevas contraseñas no coinciden.", "error");
    return;
  }
  const button = form.querySelector("button[type='submit']");
  setBusy(button, true, "Actualizando…");
  try {
    const result = await api("changePassword", { currentPassword, newPassword });
    setToken(result.token);
    await closeModal();
    showToast("Contraseña actualizada. Las sesiones anteriores fueron cerradas.", "success");
  } catch (error) {
    showToast(error.message, "error");
    setBusy(button, false);
  }
}

async function submitResetPassword(form) {
  const data = new FormData(form);
  const newPassword = String(data.get("newPassword") || "");
  if (newPassword !== String(data.get("confirmPassword") || "")) {
    showToast("Las contraseñas no coinciden.", "error");
    return;
  }
  const button = form.querySelector("button[type='submit']");
  setBusy(button, true, "Restableciendo…");
  try {
    await api("resetUserPassword", { id: form.dataset.userId, newPassword });
    await closeModal();
    showToast("Contraseña restablecida y sesiones anteriores cerradas.", "success");
  } catch (error) {
    showToast(error.message, "error");
    setBusy(button, false);
  }
}

async function updateRecordStatus(select) {
  const id = select.dataset.recordStatus;
  const record = state.records.find((item) => item.id === id);
  const previous = record?.reviewStatus;
  select.disabled = true;
  try {
    await api("updateRecordStatus", { id, status: select.value });
    if (record) record.reviewStatus = select.value;
    const summaryResult = await api("summary");
    state.summary = summaryResult.summary;
    renderRecords();
    showToast("Estado actualizado.", "success");
  } catch (error) {
    if (previous) select.value = previous;
    select.disabled = false;
    showToast(error.message, "error");
  }
}

async function updateUserStatus(select) {
  const id = select.dataset.userStatus;
  const user = state.users.find((item) => item.id === id);
  const previous = user?.status;
  select.disabled = true;
  try {
    await api("updateUserStatus", { id, status: select.value });
    if (user) user.status = select.value;
    renderUsers();
    showToast("Estado de la cuenta actualizado.", "success");
  } catch (error) {
    if (previous) select.value = previous;
    select.disabled = false;
    showToast(error.message, "error");
  }
}

async function showPhoto(id) {
  openModal("Evidencia fotográfica", '<div class="empty"><div class="spinner" style="margin:0 auto 12px"></div><strong>Cargando evidencia…</strong></div>');
  try {
    const result = await api("getPhoto", { id });
    const body = modalElement.querySelector(".modal-body");
    if (body) body.innerHTML = `<img class="modal-image" src="data:${escapeHtml(result.mimeType)};base64,${result.base64}" alt="Evidencia de entrega">`;
  } catch (error) {
    const body = modalElement.querySelector(".modal-body");
    if (body) body.innerHTML = emptyInline(error.message);
  }
}

function openModal(title, body) {
  modalElement.innerHTML = `
    <section class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header class="modal-head"><h3>${escapeHtml(title)}</h3><button class="btn btn-icon" type="button" data-action="close-modal" aria-label="Cerrar">×</button></header>
      <div class="modal-body">${body}</div>
    </section>`;
  modalElement.hidden = false;
}

async function openScanner() {
  if (!window.Html5Qrcode) {
    showToast("El lector no pudo cargarse. Puedes escribir o usar un lector físico.", "error");
    return;
  }
  openModal("Escanear guía", '<div id="reader"></div><p class="helper" style="padding:4px 4px 0">Apunta la cámara al código QR o de barras.</p>');
  try {
    state.scanner = new Html5Qrcode("reader", { verbose: false });
    await state.scanner.start(
      { facingMode: "environment" },
      { fps: 12, qrbox: { width: 280, height: 170 }, aspectRatio: 1.45 },
      async (decodedText) => {
        const input = document.querySelector("#guide-code");
        if (input) input.value = String(decodedText || "").trim().toUpperCase();
        await closeModal();
        showToast("Código capturado.", "success");
      },
      () => {},
    );
  } catch (_error) {
    await closeModal();
    showToast("No se pudo abrir la cámara. Revisa el permiso del navegador.", "error");
  }
}

async function closeModal() {
  if (state.scanner) {
    try { await state.scanner.stop(); } catch (_error) {}
    try { state.scanner.clear(); } catch (_error) {}
    state.scanner = null;
  }
  modalElement.hidden = true;
  modalElement.innerHTML = "";
}

async function logout() {
  try { await api("logout"); } catch (_error) {}
  setToken(null);
  state.user = null;
  state.records = [];
  state.users = [];
  state.photos = [];
  await boot();
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent.trim();
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.originalLabel;
}

let toastTimer;
function showToast(message, type = "") {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.className = `toast show ${type}`.trim();
  toastTimer = setTimeout(() => { toastElement.className = "toast"; }, 3500);
}

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.target.id === "setup-form") await submitAuth(event.target, true);
  else if (event.target.id === "login-form") await submitAuth(event.target, false);
  else if (event.target.id === "record-form") await submitRecord(event.target);
  else if (event.target.id === "user-form") await submitUser(event.target);
  else if (event.target.id === "change-password-form") await submitChangePassword(event.target);
  else if (event.target.id === "reset-password-form") await submitResetPassword(event.target);
});

document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.view = viewButton.dataset.view;
    renderView();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const shortcut = event.target.closest("[data-status-shortcut]");
  if (shortcut) {
    state.filters.status = shortcut.dataset.statusShortcut;
    state.view = "registros";
    renderView();
    return;
  }

  const operationButton = event.target.closest("[data-operation]");
  if (operationButton) {
    document.querySelectorAll("[data-operation]").forEach((button) => {
      const selected = button === operationButton;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-checked", selected ? "true" : "false");
    });
    const input = document.querySelector("#operation");
    if (input) input.value = operationButton.dataset.operation;
    return;
  }

  const removeButton = event.target.closest("[data-remove-photo]");
  if (removeButton) {
    state.photos.splice(Number(removeButton.dataset.removePhoto), 1);
    renderPhotoPreviews();
    return;
  }

  const photoButton = event.target.closest("[data-photo-id]");
  if (photoButton) {
    await showPhoto(photoButton.dataset.photoId);
    return;
  }

  const resetPasswordButton = event.target.closest("[data-reset-password]");
  if (resetPasswordButton) {
    const user = state.users.find((item) => item.id === resetPasswordButton.dataset.resetPassword);
    if (user && canManageUser(user)) openResetPasswordModal(user);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === "retry") await boot();
  else if (action === "reload") await loadData();
  else if (action === "logout") await logout();
  else if (action === "change-password") openChangePasswordModal();
  else if (action === "scan") await openScanner();
  else if (action === "camera") document.querySelector("#camera-input")?.click();
  else if (action === "gallery") document.querySelector("#gallery-input")?.click();
  else if (action === "close-modal") await closeModal();
  else if (action === "open-records") { state.view = "registros"; renderView(); }
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "camera-input" || event.target.id === "gallery-input") {
    await addPhotos(event.target.files);
    event.target.value = "";
  } else if (event.target.id === "status-filter") {
    state.filters.status = event.target.value;
    renderRecords();
  } else if (event.target.id === "operation-filter") {
    state.filters.operation = event.target.value;
    renderRecords();
  } else if (event.target.id === "new-role") {
    updateAssignmentFields();
  } else if (event.target.matches("[data-record-status]")) {
    await updateRecordStatus(event.target);
  } else if (event.target.matches("[data-user-status]")) {
    await updateUserStatus(event.target);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "record-search") {
    state.filters.search = event.target.value;
    const cursor = event.target.selectionStart;
    renderRecords();
    const next = document.querySelector("#record-search");
    next?.focus();
    next?.setSelectionRange(cursor, cursor);
  } else if (event.target.id === "record-comment") {
    const count = document.querySelector("#comment-count");
    if (count) count.textContent = String(event.target.value.length);
  } else if (event.target.id === "guide-code") {
    event.target.value = event.target.value.toUpperCase();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.target.id === "guide-code" && event.key === "Enter") {
    event.preventDefault();
    event.target.value = event.target.value.trim().toUpperCase();
    showToast("Código de guía capturado.", "success");
  }
});

modalElement.addEventListener("click", async (event) => {
  if (event.target === modalElement) await closeModal();
});

boot();
