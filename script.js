// Estado (checks + evidencias) con persistencia en localStorage
const STORAGE_KEY_V2 = 'luna2000_shutdown_manual_state_v2';
const LEGACY_KEY_V1 = 'luna2000_shutdown_manual_checks_v1';

const state = {
  checks: {},         // { [dataKey]: boolean }
  evidence: {},       // { [dataKey]: { dataUrl, name, ts } }
  meta: { sitio:'', responsable:'', folio:'' }
};

function safeJsonParse(str, fallback){
  try{ return JSON.parse(str); }catch(e){ return fallback; }
}

function loadState(){
  const savedV2 = safeJsonParse(localStorage.getItem(STORAGE_KEY_V2) || '', null);
  if(savedV2 && typeof savedV2 === 'object'){
    Object.assign(state, {
      checks: savedV2.checks || {},
      evidence: savedV2.evidence || {},
      meta: Object.assign({sitio:'', responsable:'', folio:''}, savedV2.meta || {})
    });
    return;
  }
  // Migración desde V1 (solo checks)
  const legacy = safeJsonParse(localStorage.getItem(LEGACY_KEY_V1) || '', null);
  if(legacy && typeof legacy === 'object'){
    state.checks = legacy;
    saveState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify({
    checks: state.checks,
    evidence: state.evidence,
    meta: state.meta
  }));
}

function syncChecksToDom(){
  document.querySelectorAll('input[type="checkbox"][data-key]').forEach(cb => {
    const key = cb.dataset.key;
    cb.checked = !!state.checks[key];
    syncAriaForCheckbox(cb);
  });
}

function syncAriaForCheckbox(cb){
  // ARIA solicitado: <label class="item" role="checkbox" aria-checked="false">
  const label = cb.closest('label.item');
  if(label){
    label.setAttribute('aria-checked', cb.checked ? 'true' : 'false');
  }
}

function sanitizeText(val, maxLen=80){
  val = (val ?? '').toString();
  // Eliminar caracteres de control
  val = val.replace(/[\u0000-\u001F\u007F]/g,'');
  val = val.trim();
  if(val.length > maxLen) val = val.slice(0, maxLen);
  return val;
}

function sanitizeFolio(val){
  val = sanitizeText(val, 40);
  // Permitir alfanumérico, espacio, guion, underscore
  val = val.replace(/[^A-Za-z0-9 _-]/g,'');
  return val;
}

function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function formatTs(ts){
  try{
    const d = new Date(ts);
    return d.toLocaleString('es-MX', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  }catch(e){ return ''; }
}

function setEvidence(key, payload){
  state.evidence[key] = payload;
  saveState();
  renderEvidence(key);
}

function removeEvidence(key){
  delete state.evidence[key];
  saveState();
  renderEvidence(key);
}

function ensureMetaPanel(){
  const card = document.getElementById('validacion')?.closest('.card');
  if(!card) return;
  if(card.querySelector('[data-meta-panel="1"]')) return;

  const panel = document.createElement('div');
  panel.setAttribute('data-meta-panel','1');
  panel.className = 'hr';

  const form = document.createElement('div');
  form.className = 'small';
  form.innerHTML = `
    <div class="row" style="margin-top:10px">
      <span class="pill">Datos del reporte (opcional)</span>
    </div>
    <div style="display:grid; gap:10px; grid-template-columns:1fr; margin-top:10px">
      <label class="pill" style="justify-content:space-between; width:100%">
        <span>Sitio</span>
        <input data-meta="sitio" aria-label="Sitio" placeholder="Ej. Faurecia QRO 0425"
          style="width:55%; background:transparent; border:none; outline:none; color:var(--text)" />
      </label>
      <label class="pill" style="justify-content:space-between; width:100%">
        <span>Responsable</span>
        <input data-meta="responsable" aria-label="Responsable" placeholder="Nombre"
          style="width:55%; background:transparent; border:none; outline:none; color:var(--text)" />
      </label>
      <label class="pill" style="justify-content:space-between; width:100%">
        <span>OT / Folio</span>
        <input data-meta="folio" aria-label="OT o Folio" placeholder="OT-####"
          style="width:55%; background:transparent; border:none; outline:none; color:var(--text)" />
      </label>
    </div>
  `;

  const btnbar = card.querySelector('.btnbar');
  card.insertBefore(panel, btnbar);
  card.insertBefore(form, btnbar);

  form.querySelectorAll('input[data-meta]').forEach(inp => {
    const k = inp.getAttribute('data-meta');

    // Cargar y sanitizar valores
    let v = (state.meta && state.meta[k]) ? state.meta[k] : '';
    v = (k === 'folio') ? sanitizeFolio(v) : sanitizeText(v, 80);
    inp.value = v;
    state.meta[k] = v;

    inp.addEventListener('input', () => {
      const raw = inp.value;
      const clean = (k === 'folio') ? sanitizeFolio(raw) : sanitizeText(raw, 80);
      inp.value = clean;
      state.meta[k] = clean;
      saveState();
    });
  });

  saveState();
}

function enhanceChecklistItems(){
  document.querySelectorAll('label.item').forEach(label => {
    const cb = label.querySelector('input[type="checkbox"][data-key]');
    if(!cb) return;

    // ARIA: mantener aria-checked sincronizado
    label.setAttribute('aria-checked', cb.checked ? 'true' : 'false');

    // Evitar duplicar UI
    if(label.querySelector('[data-ev-ui="1"]')) return;

    const key = cb.dataset.key;

    // Contenedor evidencia
    const ev = document.createElement('div');
    ev.className = 'ev';
    ev.setAttribute('data-ev-ui','1');
    ev.setAttribute('data-ev-key', key);

    // Input archivo
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.className = 'ev-input';
    input.setAttribute('aria-label', `Subir evidencia para ${key}`);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if(!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      setEvidence(key, { dataUrl, name: file.name || 'evidencia', ts: Date.now() });
      input.value = '';
    });

    const actions = document.createElement('div');
    actions.className = 'ev-actions';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Agregar foto';
    addBtn.setAttribute('aria-label', `Agregar foto de evidencia para ${key}`);
    addBtn.addEventListener('click', () => input.click());

    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.textContent = 'Quitar';
    rmBtn.setAttribute('aria-label', `Quitar evidencia para ${key}`);
    rmBtn.addEventListener('click', () => removeEvidence(key));

    const meta = document.createElement('div');
    meta.className = 'ev-meta';
    meta.setAttribute('data-ev-meta', key);
    meta.textContent = 'Sin evidencia adjunta.';

    const thumb = document.createElement('div');
    thumb.className = 'ev-thumb';
    thumb.setAttribute('data-ev-thumb', key);

    actions.appendChild(addBtn);
    actions.appendChild(rmBtn);
    actions.appendChild(meta);

    ev.appendChild(input);
    ev.appendChild(actions);
    ev.appendChild(thumb);

    label.appendChild(ev);
    renderEvidence(key);

    // ARIA: asegurar que el label refleje el estado actual
    syncAriaForCheckbox(cb);
  });
}

function renderEvidence(key){
  const metaEl = document.querySelector(`[data-ev-meta="${CSS.escape(key)}"]`);
  const thumbEl = document.querySelector(`[data-ev-thumb="${CSS.escape(key)}"]`);
  if(!metaEl || !thumbEl) return;

  const ev = state.evidence[key];
  thumbEl.innerHTML = '';

  if(!ev || !ev.dataUrl){
    metaEl.textContent = 'Sin evidencia adjunta.';
    return;
  }

  metaEl.textContent = `Evidencia: ${ev.name || 'imagen'} · ${formatTs(ev.ts)}`;
  const img = document.createElement('img');
  img.src = ev.dataUrl;
  img.alt = `Evidencia ${key}`;
  thumbEl.appendChild(img);
}

function toggleAll(group, stateBool){
  document.querySelectorAll(`.checklist[data-group="${group}"] input[type="checkbox"][data-key]`).forEach(cb => {
    cb.checked = stateBool;
    state.checks[cb.dataset.key] = stateBool;
    syncAriaForCheckbox(cb);
  });
  saveState();
}

function resetAll(){
  document.querySelectorAll('input[type="checkbox"][data-key]').forEach(cb => {
    cb.checked = false;
    state.checks[cb.dataset.key] = false;
    syncAriaForCheckbox(cb);
  });
  saveState();
}

function scrollToId(id){
  const el = document.getElementById(id);
  if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
}

function getChecklistData(){
  const sections = [];
  document.querySelectorAll('.checklist').forEach(list => {
    const group = list.getAttribute('data-group') || 'general';

    // Obtener título desde el H3 previo
    let title = '';
    let prev = list.previousElementSibling;
    while(prev && prev.tagName !== 'H3') prev = prev.previousElementSibling;
    title = prev ? prev.innerText.trim() : group;

    const items = [];
    list.querySelectorAll('label.item').forEach(label => {
      const cb = label.querySelector('input[type="checkbox"][data-key]');
      if(!cb) return;
      const key = cb.dataset.key;
      const textSpan = label.querySelector('span');
      const text = textSpan ? textSpan.innerText.trim() : label.innerText.trim();
      const checked = !!(state.checks[key]);
      const ev = state.evidence[key] || null;
      items.push({ key, text, checked, evidence: ev });
    });

    sections.push({ group, title, items });
  });
  return sections;
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function openSummary(){
  // Validar/sanitizar meta antes del resumen
  state.meta.sitio = sanitizeText(state.meta.sitio, 80);
  state.meta.responsable = sanitizeText(state.meta.responsable, 80);
  state.meta.folio = sanitizeFolio(state.meta.folio);

  // Sincronizar checks desde DOM
  document.querySelectorAll('input[type="checkbox"][data-key]').forEach(cb => {
    state.checks[cb.dataset.key] = cb.checked;
    syncAriaForCheckbox(cb);
  });
  saveState();

  const now = new Date();
  const meta = Object.assign({sitio:'', responsable:'', folio:''}, state.meta || {});
  const sections = getChecklistData();

  const summaryHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Resumen — Manual de apagado seguro BEES Huawei LUNA2000-2015</title>
  <style>
    :root{ --line:#e5e7eb; --muted:#6b7280; }
    *{box-sizing:border-box}
    body{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin:0; color:#111827; background:#fff}
    header{padding:22px 18px; border-bottom:1px solid var(--line)}
    .wrap{max-width:980px; margin:0 auto}
    h1{margin:0; font-size:20px}
    .sub{margin-top:6px; color:var(--muted); font-size:13px; line-height:1.4}
    .toolbar{display:flex; gap:10px; flex-wrap:wrap; margin-top:12px}
    .btn{border:1px solid var(--line); padding:10px 12px; border-radius:12px; background:#f9fafb; cursor:pointer; font-weight:700}
    main{padding:18px}
    .card{border:1px solid var(--line); border-radius:14px; padding:14px; margin-bottom:14px}
    .meta{display:grid; gap:10px; grid-template-columns:1fr}
    @media(min-width:900px){ .meta{grid-template-columns:1fr 1fr 1fr} }
    .kv{border:1px solid var(--line); border-radius:12px; padding:10px 12px; background:#fff}
    .k{font-size:11px; color:var(--muted)}
    .v{font-size:13px; font-weight:700; margin-top:4px}
    h2{font-size:14px; margin:0 0 10px}
    .item{border-top:1px solid var(--line); padding:10px 0}
    .item:first-of-type{border-top:none}
    .top{display:flex; justify-content:space-between; gap:10px; align-items:flex-start}
    .status{font-size:12px; font-weight:800; padding:4px 10px; border-radius:999px; white-space:nowrap}
    .ok{background:#dcfce7; color:#166534}
    .bad{background:#fee2e2; color:#991b1b}
    .text{font-size:13px; line-height:1.4; margin:0}
    .ev{margin-top:10px; display:flex; gap:10px; flex-wrap:wrap; align-items:flex-start}
    .ev img{max-width:340px; width:100%; height:auto; border-radius:12px; border:1px solid var(--line)}
    .evcap{font-size:11px; color:var(--muted)}
    .sig{display:grid; gap:14px; grid-template-columns:1fr; margin-top:18px}
    @media(min-width:900px){ .sig{grid-template-columns:1fr 1fr} }
    .line{border-bottom:1px solid #111827; height:22px}
    @media print{ .toolbar{display:none} header{border:none} main{padding:0 18px 18px} .card{break-inside:avoid} }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>Resumen de evidencia — Manual de apagado seguro BEES Huawei LUNA2000-2015</h1>
      <div class="sub">Generado: <b>${escapeHtml(now.toLocaleString('es-MX'))}</b> · Formato: <b>mediano</b> · Incluye evidencias adjuntas</div>
      <div class="toolbar">
        <button class="btn" onclick="window.print()">Descargar PDF (Imprimir > Guardar como PDF)</button>
        <button class="btn" onclick="window.close()">Cerrar</button>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section class="card">
      <h2>Datos del reporte</h2>
      <div class="meta">
        <div class="kv"><div class="k">Sitio</div><div class="v">${escapeHtml(meta.sitio || '—')}</div></div>
        <div class="kv"><div class="k">Responsable</div><div class="v">${escapeHtml(meta.responsable || '—')}</div></div>
        <div class="kv"><div class="k">OT / Folio</div><div class="v">${escapeHtml(meta.folio || '—')}</div></div>
      </div>
    </section>

    ${sections.map(sec => `
      <section class="card">
        <h2>${escapeHtml(sec.title || sec.group)}</h2>
        ${sec.items.map(it => {
          const statusClass = it.checked ? 'ok' : 'bad';
          const statusText = it.checked ? 'CUMPLE' : 'NO CUMPLE';
          const evBlock = (it.evidence && it.evidence.dataUrl) ? `
            <div class="ev">
              <div>
                <img src="${it.evidence.dataUrl}" alt="Evidencia ${escapeHtml(it.key)}" />
                <div class="evcap">Evidencia: ${escapeHtml(it.evidence.name || 'imagen')} · ${escapeHtml(formatTs(it.evidence.ts) || '')} · ID: ${escapeHtml(it.key)}</div>
              </div>
            </div>
          ` : `
            <div class="evcap">Sin evidencia adjunta · ID: ${escapeHtml(it.key)}</div>
          `;
          return `
            <div class="item">
              <div class="top">
                <p class="text">${escapeHtml(it.text)}</p>
                <span class="status ${statusClass}">${statusText}</span>
              </div>
              ${evBlock}
            </div>
          `;
        }).join('')}
      </section>
    `).join('')}

    <section class="card">
      <h2>Firmas</h2>
      <div class="sig">
        <div><div class="k">Responsable O&M</div><div class="line"></div></div>
        <div><div class="k">Cliente / Seguridad</div><div class="line"></div></div>
      </div>
    </section>
  </main>
</body>
</html>`;

  const w = window.open('', '_blank');
  if(!w){
    alert('El navegador bloqueó la ventana emergente. Habilita pop-ups para generar el resumen.');
    return;
  }
  w.document.open();
  w.document.write(summaryHtml);
  w.document.close();
  w.focus();
}

// Eventos
document.addEventListener('change', (e) => {
  if(e.target && e.target.matches('input[type="checkbox"][data-key]')){
    const key = e.target.dataset.key;
    state.checks[key] = e.target.checked;
    syncAriaForCheckbox(e.target);
    saveState();
  }
});

// Inicialización
loadState();
syncChecksToDom();
ensureMetaPanel();
enhanceChecklistItems();

// Exponer funciones globales (para onclick en HTML)
window.toggleAll = toggleAll;
window.resetAll = resetAll;
window.scrollToId = scrollToId;
window.openSummary = openSummary;