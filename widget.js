(function () {
  var API = 'https://vitrina-interactiva-production.up.railway.app';

  function getStoreId() {
    try {
      if (window.LS && window.LS.store && window.LS.store.id) return String(window.LS.store.id);
      if (window.__NUBE_SDK__ && window.__NUBE_SDK__.store && window.__NUBE_SDK__.store.id) return String(window.__NUBE_SDK__.store.id);
      if (window.LS_store_id) return String(window.LS_store_id);
    } catch (e) {}
    return null;
  }

  function getCurrentPage() {
    var path = window.location.pathname;
    if (path === '/' || path === '') return 'home';
    if (path.match(/\/productos\//) || path.match(/\/products\//)) return 'product';
    if (path.match(/\/categorias\//) || path.match(/\/collections?\//)) return 'catalog';
    return 'other';
  }

  function injectStyles() {
    if (document.getElementById('vi-styles')) return;
    var style = document.createElement('style');
    style.id = 'vi-styles';
    style.textContent = [
      '.vi-section{margin:32px auto;max-width:1200px;padding:0 16px}',
      '.vi-title{font-size:18px;font-weight:700;margin-bottom:14px;color:#111}',
      '.vi-wrap{position:relative;display:block;width:100%}',
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
      '.vi-close{position:absolute;top:8px;right:10px;font-size:16px;cursor:pointer;color:#aaa;background:none;border:none;padding:0;line-height:1}'
    ].join('');
    document.head.appendChild(style);
  }

  function buildLook(look) {
    var wrap = document.createElement('div');
    wrap.className = 'vi-wrap';
    var img = document.createElement('img');
    img.src = look.image_url;
    img.alt = look.title || 'Look';
    wrap.appendChild(img);

    var dots = typeof look.dots === 'string' ? JSON.parse(look.dots) : look.dots;
    var activePopup = null;

    dots.forEach(function (d) {
      var dot = document.createElement('div');
      dot.className = 'vi-dot';
      dot.style.left = d.x + '%';
      dot.style.top = d.y + '%';

      var popup = document.createElement('div');
      popup.className = 'vi-popup';
      popup.innerHTML =
        '<button class="vi-close">\xd7</button>' +
        (d.foto ? '<img src="' + d.foto + '" alt="">' : '') +
        '<div class="vi-popup-name">' + (d.nombre || 'Producto') + '</div>' +
        (d.precio ? '<div class="vi-popup-price">' + d.precio + '</div>' : '') +
        '<a class="vi-popup-btn" href="' + (d.url || '#') + '">Ver producto</a>';

      if (d.x > 55) popup.style.right = (100 - d.x + 3) + '%';
      else popup.style.left = (d.x + 3) + '%';
      if (d.y > 60) popup.style.bottom = (100 - d.y + 2) + '%';
      else popup.style.top = d.y + '%';

      popup.querySelector('.vi-close').addEventListener('click', function (e) {
        e.stopPropagation();
        popup.classList.remove('open');
        activePopup = null;
      });
      dot.addEventListener('click', function (e) {
        e.stopPropagation();
        if (activePopup && activePopup !== popup) activePopup.classList.remove('open');
        popup.classList.toggle('open');
        activePopup = popup.classList.contains('open') ? popup : null;
      });

      wrap.appendChild(dot);
      wrap.appendChild(popup);
    });

    document.addEventListener('click', function () {
      if (activePopup) { activePopup.classList.remove('open'); activePopup = null; }
    });

    return wrap;
  }

  function render(looks) {
    if (!looks || !looks.length) return;
    injectStyles();

    looks.forEach(function (look) {
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
  }

  function fetchLooks(storeId) {
    var currentPage = getCurrentPage();
    var pages = [currentPage];
    if (currentPage !== 'all') pages.push('all');

    var allLooks = [];
    var pending = pages.length;

    pages.forEach(function (page) {
      fetch(API + '/api/public/looks?store_id=' + storeId + '&page=' + page)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.looks) allLooks = allLooks.concat(data.looks);
          pending--;
          if (pending === 0) render(allLooks);
        })
        .catch(function () { pending--; if (pending === 0) render(allLooks); });
    });
  }

  function init() {
    var storeId = getStoreId();
    if (storeId) {
      fetchLooks(storeId);
    } else {
      // Fallback: buscar store_id por dominio
      var domain = window.location.hostname;
      fetch(API + '/api/public/store?domain=' + encodeURIComponent(domain))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.store_id) fetchLooks(data.store_id);
        })
        .catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
