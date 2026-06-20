/**
 * VITRINA INTERACTIVA — Servidor Railway
 * App Tiendanube #34738
 * Shoppable images: imágenes con puntos que muestran productos
 */

const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── CONFIG ────────────────────────────────────────────────────────────────
const VI_APP_ID   = process.env.VI_APP_ID   || '34738';
const VI_SECRET   = process.env.VI_SECRET   || '57fdd2e43b0235ac901d0f113f2113dbae12a7a88e5ff387';
const SUPA_URL    = process.env.SUPA_URL    || 'https://drkbluugqiofsedmppjk.supabase.co';
const SUPA_KEY    = process.env.SUPA_KEY    || 'sb_publishable_IHiLnxEsfLJngPBFKpoe5w_LZBTp6qB';
const BASE_URL    = process.env.BASE_URL    || 'https://vitrina-interactiva-production.up.railway.app';

// ─── SUPABASE ──────────────────────────────────────────────────────────────
async function supa(method, table, body, params) {
  let url = `${SUPA_URL}/rest/v1/${table}`;
  if (params) url += '?' + params;
  const opts = {
    method,
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (method === 'GET') { const t = await r.text(); return t ? JSON.parse(t) : []; }
  return r.ok;
}

// ─── COOKIES ───────────────────────────────────────────────────────────────
function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}
function setCookie(res, name, value, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`);
}

// ─── AUTH MIDDLEWARE ────────────────────────────────────────────────────────
function auth(req, res, next) {
  const storeId = getCookie(req, 'vi_store') || req.query.store_id;
  if (!storeId) return res.redirect('/install');
  req.storeId = storeId;
  next();
}

// ─── HEALTH ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ app: 'Vitrina Interactiva', version: '1.0.0', status: 'ok' });
});

// ─── OAUTH ─────────────────────────────────────────────────────────────────
app.get('/install', (req, res) => {
  res.redirect(`https://www.tiendanube.com/apps/${VI_APP_ID}/authorize`);
});

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Falta el código de autorización');
  try {
    const r = await axios.post('https://www.tiendanube.com/apps/authorize/token', {
      client_id: VI_APP_ID,
      client_secret: VI_SECRET,
      grant_type: 'authorization_code',
      code
    });
    const { access_token, user_id } = r.data;
    await supa('POST', 'vi_tiendas', [{ store_id: String(user_id), token: access_token, installed_at: new Date().toISOString() }]);
    console.log(`✅ Tienda instalada: ${user_id}`);
    setCookie(res, 'vi_store', String(user_id));
    res.redirect('/panel');
  } catch (e) {
    console.error('OAuth error:', e.response?.data || e.message);
    res.status(500).send('<h2>Error al instalar Vitrina Interactiva</h2><p>Intentá de nuevo desde el panel de TN.</p>');
  }
});

// ─── WEBHOOK DESINSTALACIÓN ─────────────────────────────────────────────────
app.post('/webhook/uninstall', async (req, res) => {
  res.sendStatus(200);
  const storeId = req.body?.store_id || req.body?.id;
  if (storeId) {
    await supa('DELETE', `vi_tiendas?store_id=eq.${storeId}`, null);
    await supa('DELETE', `vi_looks?store_id=eq.${storeId}`, null);
    console.log(`🔌 Tienda desinstalada: ${storeId}`);
  }
});

// ─── API: LOOKS ────────────────────────────────────────────────────────────
app.get('/api/looks', auth, async (req, res) => {
  try {
    const looks = await supa('GET', `vi_looks?store_id=eq.${req.storeId}&order=created_at.desc`);
    res.json({ ok: true, looks: looks || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/looks', auth, async (req, res) => {
  try {
    const { id, title, image_url, dots, active } = req.body;
    if (!image_url || !dots) return res.status(400).json({ error: 'Faltan image_url o dots' });
    const row = {
      store_id: req.storeId,
      title: title || 'Look',
      image_url,
      dots: typeof dots === 'string' ? dots : JSON.stringify(dots),
      active: active !== false,
      updated_at: new Date().toISOString()
    };
    if (id) {
      await supa('PATCH', `vi_looks?id=eq.${id}&store_id=eq.${req.storeId}`, row);
      res.json({ ok: true, id });
    } else {
      row.id = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      row.created_at = new Date().toISOString();
      await supa('POST', 'vi_looks', [row]);
      res.json({ ok: true, id: row.id });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/looks/:id', auth, async (req, res) => {
  try {
    await supa('DELETE', `vi_looks?id=eq.${req.params.id}&store_id=eq.${req.storeId}`, null);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SCRIPT NUBSDK (se registra en portal partners → Scripts) ──────────────
app.get('/script.js', async (req, res) => {
  const storeId = req.query.store_id;
  if (!storeId) return res.status(400).send('// store_id requerido');

  try {
    const looks = await supa('GET', `vi_looks?store_id=eq.${storeId}&active=eq.true&order=created_at.desc`);
    const activeLooks = Array.isArray(looks) ? looks : [];

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(`
(function() {
  var looks = ${JSON.stringify(activeLooks)};
  if (!looks.length) return;

  var style = document.createElement('style');
  style.textContent = [
    '.vi-wrap{position:relative;display:inline-block;width:100%}',
    '.vi-wrap img{display:block;width:100%;border-radius:8px}',
    '.vi-dot{position:absolute;width:26px;height:26px;background:#7c3aed;border:3px solid #fff;border-radius:50%;transform:translate(-50%,-50%);cursor:pointer;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.3)}',
    '.vi-dot::after{content:"";position:absolute;inset:-4px;border-radius:50%;background:rgba(124,58,237,.35);animation:vi-pulse 2s infinite}',
    '@keyframes vi-pulse{0%{transform:scale(.8);opacity:1}100%{transform:scale(2);opacity:0}}',
    '.vi-popup{position:absolute;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);padding:12px;width:180px;z-index:20;display:none;font-family:inherit}',
    '.vi-popup.open{display:block}',
    '.vi-popup img{width:100%;border-radius:6px;margin-bottom:8px;display:block}',
    '.vi-popup-name{font-size:13px;font-weight:700;color:#111;margin-bottom:4px}',
    '.vi-popup-price{font-size:14px;font-weight:700;color:#7c3aed;margin-bottom:10px}',
    '.vi-popup-btn{display:block;text-align:center;background:#7c3aed;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none}',
    '.vi-popup-btn:hover{background:#6d28d9}',
    '.vi-close{position:absolute;top:8px;right:10px;font-size:16px;cursor:pointer;color:#aaa;background:none;border:none;padding:0;line-height:1}',
    '.vi-section{margin:32px auto;max-width:1200px;padding:0 16px}',
    '.vi-title{font-size:18px;font-weight:700;margin-bottom:14px;color:#111}'
  ].join('');
  document.head.appendChild(style);

  function buildLook(look) {
    var wrap = document.createElement('div');
    wrap.className = 'vi-wrap';
    var img = document.createElement('img');
    img.src = look.image_url;
    img.alt = look.title || 'Look';
    wrap.appendChild(img);

    var dots = typeof look.dots === 'string' ? JSON.parse(look.dots) : look.dots;
    var activePopup = null;

    dots.forEach(function(d) {
      var dot = document.createElement('div');
      dot.className = 'vi-dot';
      dot.style.left = d.x + '%';
      dot.style.top  = d.y + '%';

      var popup = document.createElement('div');
      popup.className = 'vi-popup';
      popup.innerHTML =
        '<button class="vi-close" aria-label="Cerrar">\xd7</button>' +
        (d.foto ? '<img src="' + d.foto + '" alt="">' : '') +
        '<div class="vi-popup-name">' + (d.nombre || 'Producto') + '</div>' +
        (d.precio ? '<div class="vi-popup-price">' + d.precio + '</div>' : '') +
        '<a class="vi-popup-btn" href="' + (d.url || '#') + '">Ver producto</a>';

      if (d.x > 55) popup.style.right = (100 - d.x + 3) + '%';
      else           popup.style.left  = (d.x + 3) + '%';
      if (d.y > 60)  popup.style.bottom = (100 - d.y + 2) + '%';
      else           popup.style.top    = d.y + '%';

      popup.querySelector('.vi-close').addEventListener('click', function(e) {
        e.stopPropagation();
        popup.classList.remove('open');
        activePopup = null;
      });

      dot.addEventListener('click', function(e) {
        e.stopPropagation();
        if (activePopup && activePopup !== popup) activePopup.classList.remove('open');
        popup.classList.toggle('open');
        activePopup = popup.classList.contains('open') ? popup : null;
      });

      wrap.appendChild(dot);
      wrap.appendChild(popup);
    });

    document.addEventListener('click', function() {
      if (activePopup) { activePopup.classList.remove('open'); activePopup = null; }
    });

    return wrap;
  }

  looks.forEach(function(look) {
    var section = document.createElement('div');
    section.className = 'vi-section';
    if (look.title) {
      var h = document.createElement('h3');
      h.className = 'vi-title';
      h.textContent = look.title;
      section.appendChild(h);
    }
    section.appendChild(buildLook(look));

    var target = document.getElementById('vi-looks') ||
                 document.querySelector('.main-content') ||
                 document.querySelector('main') ||
                 document.body;
    target.appendChild(section);
  });
})();
`);
  } catch (e) {
    console.error('Script error:', e.message);
    res.status(500).send('// Error cargando Vitrina Interactiva');
  }
});

// ─── PANEL DE ADMINISTRACIÓN ────────────────────────────────────────────────
app.get('/panel', auth, (req, res) => {
  const storeId = req.storeId;
  const scriptUrl = `${BASE_URL}/script.js?store_id=${storeId}`;
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vitrina Interactiva</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;color:#222;min-height:100vh}
header{background:#fff;border-bottom:1px solid #e0e0e0;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
header h1{font-size:17px;font-weight:700}
.store-badge{font-size:11px;color:#888;background:#f3f4f6;padding:3px 10px;border-radius:99px}
.container{display:grid;grid-template-columns:1fr 320px;gap:0;height:calc(100vh - 53px)}
.canvas{padding:20px;overflow:auto;display:flex;flex-direction:column;gap:14px}
.sidebar{background:#fff;border-left:1px solid #e0e0e0;display:flex;flex-direction:column;overflow:hidden}
.url-row{display:flex;gap:8px}
.url-row input{flex:1;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;outline:none;transition:border-color .2s}
.url-row input:focus{border-color:#7c3aed}
.url-row button{padding:9px 16px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;white-space:nowrap}
.url-row button:hover{background:#6d28d9}
.hint{font-size:12px;color:#666;background:#fffbe6;border:1px solid #fde68a;border-radius:6px;padding:8px 12px}
.img-wrap{position:relative;display:none;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1);user-select:none}
.img-wrap img{display:block;width:100%}
.img-wrap.active{display:inline-block}
.dot{position:absolute;width:26px;height:26px;background:#7c3aed;border:3px solid #fff;border-radius:50%;transform:translate(-50%,-50%);cursor:pointer;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;transition:transform .15s}
.dot:hover{transform:translate(-50%,-50%) scale(1.1)}
.dot.sel{background:#ea580c;box-shadow:0 0 0 3px #fff,0 0 0 5px #ea580c}
.tabs{display:flex;border-bottom:1px solid #e0e0e0;flex-shrink:0}
.tab{flex:1;padding:11px;font-size:12px;font-weight:600;text-align:center;cursor:pointer;color:#888;border-bottom:2px solid transparent;transition:color .2s,border-color .2s}
.tab.active{color:#7c3aed;border-bottom-color:#7c3aed}
.tab-pane{display:none;flex:1;overflow-y:auto;padding:16px}
.tab-pane.active{display:block}
label{display:block;font-size:11px;font-weight:600;color:#555;margin-bottom:4px}
input[type=text]{width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;outline:none;margin-bottom:12px}
input[type=text]:focus{border-color:#7c3aed}
.btn{display:block;width:100%;padding:9px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:6px;transition:opacity .15s}
.btn:hover{opacity:.85}
.btn-p{background:#7c3aed;color:#fff}
.btn-s{background:#d1fae5;color:#065f46}
.btn-d{background:#fee2e2;color:#dc2626}
.look-card{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;margin-bottom:8px;transition:border-color .15s,background .15s}
.look-card:hover{border-color:#7c3aed;background:#faf5ff}
.look-thumb{width:50px;height:38px;object-fit:cover;border-radius:5px;background:#f0f0f0;flex-shrink:0}
.look-info{flex:1;min-width:0}
.look-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.look-meta{font-size:11px;color:#aaa;margin-top:2px}
.del-btn{background:none;border:none;cursor:pointer;color:#dc2626;font-size:18px;padding:0 4px;line-height:1;flex-shrink:0}
.dot-row{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;margin-bottom:5px;font-size:12px;transition:border-color .15s,background .15s}
.dot-row:hover,.dot-row.sel{border-color:#7c3aed;background:#f5f0ff}
.dot-num{width:20px;height:20px;background:#7c3aed;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
.empty{text-align:center;color:#bbb;font-size:13px;padding:28px 0}
hr{border:none;border-top:1px solid #e5e7eb;margin:12px 0}
.code-box{background:#1e1e2e;color:#a6e3a1;font-family:monospace;font-size:11px;padding:12px;border-radius:8px;word-break:break-all;line-height:1.7;margin-bottom:8px}
.copy-btn{width:100%;padding:9px;background:#1e1e2e;color:#a6e3a1;border:1px solid #45475a;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}
.copy-btn:hover{background:#313244}
.section-title{font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
</style>
</head>
<body>
<header>
  <h1>🛍️ Vitrina Interactiva</h1>
  <span class="store-badge">Tienda #${storeId}</span>
</header>

<div class="container">
  <div class="canvas">
    <div class="url-row">
      <input id="imgUrl" type="text" placeholder="URL de la imagen del look (subila en TN → Contenido → Archivos)">
      <button onclick="loadImg()">Cargar imagen</button>
    </div>
    <div class="hint" id="hint" style="display:none">
      👆 Hacé click sobre la imagen para agregar un punto en cada producto. Luego completá los datos en el panel derecho.
    </div>
    <div class="img-wrap" id="imgWrap">
      <img id="mainImg" src="" alt="">
    </div>
  </div>

  <div class="sidebar">
    <div class="tabs">
      <div class="tab active" data-tab="looks">Mis Looks</div>
      <div class="tab" data-tab="editor">Editor</div>
      <div class="tab" data-tab="script">Integración</div>
    </div>

    <!-- LOOKS -->
    <div class="tab-pane active" id="tab-looks">
      <button class="btn btn-p" onclick="nuevoLook()" style="margin-bottom:12px">+ Nuevo look</button>
      <div id="looks-list"><div class="empty">Cargando...</div></div>
    </div>

    <!-- EDITOR -->
    <div class="tab-pane" id="tab-editor">
      <div id="ed-empty" class="empty" style="margin-top:40px">
        <div style="font-size:32px;margin-bottom:8px">🖼️</div>
        Cargá una imagen y hacé<br>click para agregar puntos
      </div>
      <div id="ed-content" style="display:none">
        <div class="section-title">Look</div>
        <label>Título</label>
        <input id="f-title" type="text" placeholder="Ej: Look de verano">
        <hr>
        <div class="section-title">Puntos</div>
        <div id="dot-list"></div>
        <hr>
        <div id="dot-edit"></div>
        <button class="btn btn-s" onclick="guardarLook()">💾 Guardar look</button>
        <button class="btn btn-d" onclick="descartarLook()">Descartar cambios</button>
      </div>
    </div>

    <!-- SCRIPT -->
    <div class="tab-pane" id="tab-script">
      <p style="font-size:13px;margin-bottom:14px;line-height:1.5">
        Registrá esta URL en el portal de partners de TN:<br>
        <strong>Tu app → Scripts → Agregar script</strong>
      </p>
      <div class="section-title">URL del script</div>
      <div class="code-box">${scriptUrl}</div>
      <button class="copy-btn" onclick="copyScript()">📋 Copiar URL</button>
      <hr>
      <div class="section-title">Configuración en TN</div>
      <p style="font-size:12px;color:#666;line-height:1.6">
        • Tipo: <strong>Storefront</strong><br>
        • Evento: <strong>DOMContentLoaded</strong><br>
        • Scope: <strong>storefront</strong>
      </p>
    </div>
  </div>
</div>

<script>
var STORE = '${storeId}';
var state = { looks: [], editId: null, dots: [], selDot: null };

// ── Cargar looks ──────────────────────────────────────────────────────────
async function cargarLooks() {
  try {
    var r = await fetch('/api/looks');
    var data = await r.json();
    state.looks = data.looks || [];
    renderLooks();
  } catch(e) { document.getElementById('looks-list').innerHTML = '<div class="empty">Error al cargar</div>'; }
}

function renderLooks() {
  var el = document.getElementById('looks-list');
  if (!state.looks.length) {
    el.innerHTML = '<div class="empty"><div style="font-size:28px;margin-bottom:8px">📸</div>Todavía no tenés looks.<br>¡Creá el primero!</div>';
    return;
  }
  el.innerHTML = state.looks.map(function(l) {
    var dots = typeof l.dots === 'string' ? JSON.parse(l.dots) : l.dots;
    return '<div class="look-card" onclick="editarLook(\\''+l.id+'\\')">'+
      '<img class="look-thumb" src="'+l.image_url+'" onerror="this.style.background=\\'#e5e7eb\\';this.style.display=\\'block\\'">'+
      '<div class="look-info"><div class="look-name">'+(l.title||'Sin título')+'</div>'+
      '<div class="look-meta">'+dots.length+' punto'+(dots.length!==1?'s':'')+'</div></div>'+
      '<button class="del-btn" onclick="event.stopPropagation();eliminarLook(\\''+l.id+'\\')">×</button>'+
      '</div>';
  }).join('');
}

// ── Nuevo look ────────────────────────────────────────────────────────────
function nuevoLook() {
  state.editId = null;
  state.dots = [];
  state.selDot = null;
  document.getElementById('imgUrl').value = '';
  document.getElementById('mainImg').src = '';
  document.getElementById('imgWrap').classList.remove('active');
  document.getElementById('hint').style.display = 'none';
  document.getElementById('f-title').value = '';
  renderEditor();
  switchTab('editor');
}

function editarLook(id) {
  var look = state.looks.find(function(l){return l.id===id;});
  if (!look) return;
  state.editId = id;
  var dots = typeof look.dots === 'string' ? JSON.parse(look.dots) : look.dots;
  state.dots = dots.map(function(d,i){return Object.assign({},d,{_id:i+1});});
  state.selDot = null;
  document.getElementById('imgUrl').value = look.image_url;
  document.getElementById('f-title').value = look.title || '';
  var img = document.getElementById('mainImg');
  img.src = look.image_url;
  img.onload = function() {
    document.getElementById('imgWrap').classList.add('active');
    document.getElementById('hint').style.display = 'block';
    renderDots(); renderEditor();
  };
  switchTab('editor');
}

async function eliminarLook(id) {
  if (!confirm('¿Eliminar este look?')) return;
  await fetch('/api/looks/'+id, {method:'DELETE'});
  await cargarLooks();
}

// ── Imagen ────────────────────────────────────────────────────────────────
function loadImg() {
  var url = document.getElementById('imgUrl').value.trim();
  if (!url) return;
  var img = document.getElementById('mainImg');
  img.src = url;
  img.onload = function() {
    document.getElementById('imgWrap').classList.add('active');
    document.getElementById('hint').style.display = 'block';
    renderDots(); renderEditor();
  };
  img.onerror = function() { alert('No se pudo cargar la imagen. Verificá la URL.'); };
}

// ── Click en imagen ───────────────────────────────────────────────────────
document.getElementById('imgWrap').addEventListener('click', function(e) {
  if (e.target.classList.contains('dot')) return;
  var rect = this.getBoundingClientRect();
  var x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(2));
  var y = parseFloat(((e.clientY - rect.top)  / rect.height * 100).toFixed(2));
  var id = Date.now();
  state.dots.push({_id:id,x:x,y:y,nombre:'',precio:'',url:'',foto:''});
  state.selDot = id;
  renderDots(); renderEditor();
  switchTab('editor');
});

// ── Dots ──────────────────────────────────────────────────────────────────
function renderDots() {
  document.querySelectorAll('.dot').forEach(function(d){d.remove();});
  var wrap = document.getElementById('imgWrap');
  state.dots.forEach(function(d,i) {
    var el = document.createElement('div');
    el.className = 'dot'+(d._id===state.selDot?' sel':'');
    el.textContent = i+1;
    el.style.left = d.x+'%';
    el.style.top  = d.y+'%';
    el.addEventListener('click',function(e){e.stopPropagation();state.selDot=d._id;renderDots();renderEditor();});
    wrap.appendChild(el);
  });
}

// ── Editor ────────────────────────────────────────────────────────────────
function renderEditor() {
  var hasImg = document.getElementById('imgWrap').classList.contains('active');
  document.getElementById('ed-empty').style.display   = hasImg ? 'none'  : 'block';
  document.getElementById('ed-content').style.display = hasImg ? 'block' : 'none';
  if (!hasImg) return;

  var dl = document.getElementById('dot-list');
  if (!state.dots.length) {
    dl.innerHTML = '<p style="font-size:12px;color:#aaa;text-align:center;padding:8px 0">Hacé click en la imagen para agregar puntos</p>';
  } else {
    dl.innerHTML = state.dots.map(function(d,i) {
      return '<div class="dot-row'+(d._id===state.selDot?' sel':'')+'" onclick="selDot('+d._id+')">'+
        '<div class="dot-num">'+(i+1)+'</div>'+
        '<span style="flex:1">'+(d.nombre||'<em style=color:#aaa>Sin nombre</em>')+'</span>'+
        '<button onclick="event.stopPropagation();borrarDot('+d._id+')" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:16px;line-height:1">×</button>'+
        '</div>';
    }).join('');
  }

  var de = document.getElementById('dot-edit');
  var dot = state.dots.find(function(d){return d._id===state.selDot;});
  if (!dot) { de.innerHTML = ''; return; }
  var idx = state.dots.indexOf(dot)+1;
  de.innerHTML =
    '<div class="section-title">Punto '+idx+'</div>'+
    '<label>Nombre del producto *</label>'+
    '<input id="e-nom" type="text" value="'+esc(dot.nombre)+'" placeholder="Ej: Remera azul">'+
    '<label>Precio *</label>'+
    '<input id="e-precio" type="text" value="'+esc(dot.precio)+'" placeholder="Ej: $ 12.500">'+
    '<label>URL del producto *</label>'+
    '<input id="e-url" type="text" value="'+esc(dot.url)+'" placeholder="https://tutienda.com/...">'+
    '<label>URL foto del producto (opcional)</label>'+
    '<input id="e-foto" type="text" value="'+esc(dot.foto)+'" placeholder="https://...">'+
    '<button class="btn btn-p" onclick="saveDot()">Guardar punto</button>';
}

function selDot(id) { state.selDot=id; renderDots(); renderEditor(); }
function esc(s) { return (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function borrarDot(id) {
  state.dots = state.dots.filter(function(d){return d._id!==id;});
  if (state.selDot===id) state.selDot=null;
  renderDots(); renderEditor();
}

function saveDot() {
  var dot = state.dots.find(function(d){return d._id===state.selDot;});
  if (!dot) return;
  dot.nombre = document.getElementById('e-nom').value.trim();
  dot.precio = document.getElementById('e-precio').value.trim();
  dot.url    = document.getElementById('e-url').value.trim();
  dot.foto   = document.getElementById('e-foto').value.trim();
  renderDots(); renderEditor();
}

// ── Guardar look ──────────────────────────────────────────────────────────
async function guardarLook() {
  var url   = document.getElementById('imgUrl').value.trim();
  var title = document.getElementById('f-title').value.trim() || 'Look';
  if (!url) return alert('Ingresá la URL de la imagen primero');
  if (!state.dots.length) return alert('Agregá al menos un punto');

  var cleanDots = state.dots.map(function(d){
    return {x:d.x,y:d.y,nombre:d.nombre,precio:d.precio,url:d.url,foto:d.foto};
  });

  var body = {title:title,image_url:url,dots:cleanDots,active:true};
  if (state.editId) body.id = state.editId;

  try {
    var r = await fetch('/api/looks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var data = await r.json();
    if (data.ok) {
      await cargarLooks();
      switchTab('looks');
      alert('✅ Look guardado correctamente');
    } else {
      alert('Error: '+(data.error||'No se pudo guardar'));
    }
  } catch(e) { alert('Error de conexión'); }
}

function descartarLook() { nuevoLook(); switchTab('looks'); }

// ── Tabs ──────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===name);});
  document.querySelectorAll('.tab-pane').forEach(function(c){c.classList.toggle('active',c.id==='tab-'+name);});
}
document.querySelectorAll('.tab').forEach(function(t){
  t.addEventListener('click',function(){switchTab(t.dataset.tab);});
});

// ── Script copy ───────────────────────────────────────────────────────────
function copyScript() {
  navigator.clipboard.writeText('${scriptUrl}').then(function(){
    var btn = document.querySelector('.copy-btn');
    btn.textContent = '✅ ¡Copiado!';
    setTimeout(function(){btn.textContent='📋 Copiar URL';},2000);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────
cargarLooks();
</script>
</body>
</html>`);
});

// ─── START ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🛍️  Vitrina Interactiva corriendo en puerto ${PORT}`);
});
