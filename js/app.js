/* =====================================================================
   app.js — вся логика трекера: состояние, панель, оверлей, синхронизация,
   звуки и пасхалки. Режим выбирается параметром адреса ?mode=overlay.
   Безопасность: только браузер и localStorage, игра не затрагивается.
   ===================================================================== */
(function () {
  'use strict';

  // ---------- Настройки (можно менять) ----------
  var KEY = 'tqt_state_v1';   // ключ в localStorage
  var MAX = 5;                // максимум квестов в пачке
  var EASTER_EVERY = 10;      // пасхалка на каждой N-й смерти пачки

  var P = new URLSearchParams(location.search);
  var MODE = P.get('mode') === 'overlay' ? 'overlay' : 'panel';
  document.body.className = MODE;

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function icon(t) { return (window.TQT_TRADERS[t] || { icon: '📜' }).icon; }
  function fmt(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    s %= 60;
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return (h ? h + ':' : '') + p(m) + ':' + p(s);
  }

  // ---------- Состояние ----------
  // party: текущая пачка. snap — копии квестов (чтобы оверлею не нужен весь список),
  // names — названия сданных в этой пачке квестов.
  var DEF = {
    progress: {}, custom: [], edits: {},
    party: { ids: [], snap: [], names: [], deaths: 0, startedAt: null },
    history: [],
    settings: { sound: true, easter: true, volume: 0.6 }
  };
  function read() {
    var d = clone(DEF);
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') Object.keys(s).forEach(function (k) { d[k] = s[k]; });
    } catch (e) {}
    d.party = Object.assign(clone(DEF.party), d.party);
    d.settings = Object.assign(clone(DEF.settings), d.settings);
    return d;
  }
  var S = read();
  var bc = null;
  try { bc = new BroadcastChannel('tqt'); } catch (e) {}
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    if (bc) bc.postMessage('u'); // сообщаем другому окну (оверлею)
  }

  // ---------- Таймер (оба режима) ----------
  setInterval(function () {
    var t = S.party.startedAt ? fmt(Date.now() - S.party.startedAt) : '';
    if (MODE === 'panel') $('pTimer').textContent = t || '--:--';
    else $('ovTimer').textContent = t;
  }, 1000);

  /* =====================================================================
     ПАНЕЛЬ
     ===================================================================== */
  function initPanel() {
    var Q = window.TQT_BUILTIN_QUESTS.slice(); // базовый список; заменится данными API

    function all() {
      return Q.concat(S.custom).map(function (x) {
        var e = S.edits[x.id];
        return e ? Object.assign({}, x, e) : x;
      });
    }
    function stat(x) {
      return S.party.ids.indexOf(x.id) > -1 ? 'active' : (S.progress[x.id] || 'available');
    }
    function find(id) { return all().filter(function (x) { return x.id === id; })[0]; }
    function say(t) { $('status').textContent = t || ''; }

    // ----- действия с пачкой -----
    function take(id) {
      var x = find(id), p = S.party;
      if (!x || p.ids.indexOf(id) > -1) return;
      if (p.ids.length >= MAX) { say('В пачке уже ' + MAX + ' квестов — сдай или убери один.'); return; }
      p.ids.push(id);
      p.snap.push({ id: x.id, name: x.name, trader: x.trader, map: x.map, objective: x.objective });
      if (p.ids.length === 1) p.startedAt = Date.now();
      save(); render();
    }
    function leave(id, status) { // status: 'completed' | 'failed' | null (просто убрать)
      var p = S.party, i = p.ids.indexOf(id);
      if (i < 0) return;
      if (status === 'completed') p.names.push(p.snap[i].name);
      if (status) S.progress[id] = status;
      p.ids.splice(i, 1); p.snap.splice(i, 1);
      if (!p.ids.length) closeParty();
      save(); render();
    }
    function closeParty() {
      var p = S.party;
      if (p.names.length) {
        S.history.unshift({ names: p.names, deaths: p.deaths, startedAt: p.startedAt, finishedAt: Date.now() });
      }
      S.party = clone(DEF.party);
    }
    function die(delta) {
      var p = S.party;
      if (!p.ids.length) { say('Сначала возьми квест в работу.'); return; }
      p.deaths = Math.max(0, p.deaths + delta);
      save(); render();
    }

    // ----- отрисовка -----
    function renderParty() {
      var p = S.party;
      $('pCount').textContent = '(' + p.ids.length + '/' + MAX + ')';
      $('pDeaths').textContent = p.deaths;
      $('partyList').innerHTML = p.snap.length ? p.snap.map(function (x) {
        return '<div class="pq"><span class="ic">' + icon(x.trader) + '</span>' +
          '<div class="pq-t"><b>' + esc(x.name) + '</b><small>' + esc(x.objective) + '</small></div>' +
          '<button data-a="done" data-id="' + esc(x.id) + '">Сдать</button>' +
          '<button data-a="fail" data-id="' + esc(x.id) + '" title="Провален">✗</button>' +
          '<button data-a="drop" data-id="' + esc(x.id) + '">Убрать</button></div>';
      }).join('') : '<p class="muted">Пачка пуста. Выбери квест ниже и нажми «Взять в работу».</p>';
    }

    var STAT_RU = { available: 'доступен', active: 'в работе', completed: 'выполнен', failed: 'провален' };
    function card(x) {
      var st = stat(x);
      var acts = '';
      if (st === 'active') acts += '<button data-a="done" data-id="' + esc(x.id) + '">Сдать</button>';
      else if (st !== 'completed') acts += '<button class="primary" data-a="take" data-id="' + esc(x.id) + '">Взять в работу</button>';
      else acts += '<button data-a="take" data-id="' + esc(x.id) + '">Взять снова</button>';
      acts += '<button data-a="edit" data-id="' + esc(x.id) + '" title="Править">✎</button>';
      return '<div class="q st-' + st + '"><h4>' + icon(x.trader) + ' ' + esc(x.name) + '</h4>' +
        '<div class="meta">' + esc(x.trader) + ' · ' + esc(x.map) + ' · ур. ' + (x.level_required == null ? '—' : x.level_required) +
        ' · ' + STAT_RU[st] + (x.verified === false ? ' · ⚠ не проверено' : '') + '</div>' +
        '<div class="obj">' + esc(x.objective || '—') + '</div>' +
        (x.items && x.items.length ? '<div class="meta">Нужно: ' + esc(x.items.join(', ')) + '</div>' : '') +
        (x.reward ? '<div class="meta">Награда: ' + esc(x.reward) + '</div>' : '') +
        (x.wikiLink ? '<a href="' + esc(x.wikiLink) + '" target="_blank" rel="noopener">Вики</a>' : '') +
        '<div class="acts">' + acts + '</div></div>';
    }
    function renderList() {
      var s = $('fSearch').value.trim().toLowerCase(), t = $('fTrader').value, m = $('fMap').value,
          st = $('fStatus').value, so = $('fSort').value;
      var arr = all().filter(function (x) {
        return (!s || String(x.name).toLowerCase().indexOf(s) > -1) && (!t || x.trader === t) &&
               (!m || x.map === m) && (!st || stat(x) === st);
      });
      arr.sort(function (a, b) {
        if (so === 'level') {
          var la = a.level_required == null ? 999 : a.level_required, lb = b.level_required == null ? 999 : b.level_required;
          if (la !== lb) return la - lb;
        }
        if (so === 'trader' && a.trader !== b.trader) return String(a.trader).localeCompare(b.trader, 'ru');
        return String(a.name).localeCompare(b.name, 'ru');
      });
      var LIM = 150;
      $('list').innerHTML = arr.slice(0, LIM).map(card).join('');
      $('cnt').textContent = 'Найдено: ' + arr.length + (arr.length > LIM ? ' (показано ' + LIM + ', уточни поиск)' : '');
    }
    function renderHistory() {
      $('hCount').textContent = S.history.length;
      $('history').innerHTML = S.history.map(function (h) {
        return '<div class="hist">' + new Date(h.finishedAt).toLocaleString('ru') + ' — ' +
          h.names.map(esc).join(', ') + ' · 💀 ' + h.deaths + ' · ⏱ ' + fmt(h.finishedAt - h.startedAt) + '</div>';
      }).join('') || '<p class="muted">Пока пусто.</p>';
    }
    function fillSel(id, first, vals) {
      var el = $(id), cur = el.value;
      el.innerHTML = '<option value="">' + first + '</option>' + vals.map(function (v) {
        return '<option>' + esc(v) + '</option>';
      }).join('');
      el.value = cur;
    }
    function uniq(a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }); }
    function refreshFilters() {
      var a = all();
      var traders = uniq(Object.keys(window.TQT_TRADERS).concat(a.map(function (x) { return x.trader; })));
      var maps = uniq(window.TQT_MAPS.concat(a.map(function (x) { return x.map; })));
      fillSel('fTrader', 'Все трейдеры', traders);
      fillSel('fMap', 'Все карты', maps);
      $('trList').innerHTML = traders.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('');
      $('mapList').innerHTML = maps.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('');
    }
    function render() {
      renderParty(); renderList(); renderHistory();
      $('btnSound').textContent = S.settings.sound ? '🔊' : '🔇';
    }

    // ----- загрузка квестов из API -----
    function loadApi(force) {
      say('Загружаю квесты…');
      TarkovApi.load({ force: force }).then(function (r) {
        if (r.quests && r.quests.length) Q = r.quests;
        refreshFilters(); render();
        say('Квестов: ' + Q.length + (r.fromCache ? ' (из кэша)' : ' (свежие данные)') +
            (r.hasDetails ? '' : ' · без наград и предметов') + (r.warning ? ' · ' + r.warning : ''));
      }).catch(function (e) {
        say('Не удалось загрузить квесты (' + e.message + '). Работаю со встроенным списком.');
      });
    }

    // ----- окно правки квеста -----
    function openEdit(id) {
      var x = id ? find(id) : { id: '', name: '', trader: '', map: 'Любая', level_required: '', objective: '', reward: '' };
      $('dTitle').textContent = id ? 'Правка квеста' : 'Новый квест';
      $('dId').value = x.id; $('dName').value = x.name; $('dTrader').value = x.trader;
      $('dMap').value = x.map; $('dLevel').value = x.level_required == null ? '' : x.level_required;
      $('dObj').value = x.objective; $('dReward').value = x.reward || '';
      $('dlg').showModal();
    }
    $('dCancel').onclick = function () { $('dlg').close(); };
    $('dSave').onclick = function () {
      var name = $('dName').value.trim();
      if (!name) { $('dName').focus(); return; }
      var f = {
        name: name, trader: $('dTrader').value.trim(), map: $('dMap').value.trim() || 'Любая',
        level_required: $('dLevel').value === '' ? null : +$('dLevel').value,
        objective: $('dObj').value.trim(), reward: $('dReward').value.trim()
      };
      var id = $('dId').value;
      if (!id) {
        S.custom.push(Object.assign({ id: 'my-' + Date.now(), items: [], status: 'available', verified: true, source: 'custom' }, f));
      } else if (S.custom.some(function (c) { return c.id === id; })) {
        S.custom = S.custom.map(function (c) { return c.id === id ? Object.assign({}, c, f) : c; });
      } else {
        S.edits[id] = f; // правка квеста из списка хранится отдельно и переживает обновление списка
      }
      $('dlg').close(); save(); refreshFilters(); render();
    };

    // ----- события -----
    function onAct(e) {
      var b = e.target.closest('button[data-a]');
      if (!b) return;
      var id = b.getAttribute('data-id'), a = b.getAttribute('data-a');
      if (a === 'take') take(id);
      else if (a === 'done') leave(id, 'completed');
      else if (a === 'fail') leave(id, 'failed');
      else if (a === 'drop') leave(id, null);
      else if (a === 'edit') openEdit(id);
    }
    $('list').onclick = onAct;
    $('partyList').onclick = onAct;
    ['fSearch', 'fTrader', 'fMap', 'fStatus', 'fSort'].forEach(function (id) {
      $(id).addEventListener(id === 'fSearch' ? 'input' : 'change', renderList);
    });
    $('btnDie').onclick = function () { die(1); };
    $('btnUndo').onclick = function () { die(-1); };
    $('btnLoad').onclick = function () { loadApi(true); };
    $('btnAdd').onclick = function () { openEdit(null); };
    $('btnSound').onclick = function () { S.settings.sound = !S.settings.sound; save(); render(); };
    $('btnLink').onclick = function () {
      var url = location.origin + location.pathname + '?mode=overlay';
      if (location.protocol === 'file:') url = location.href.split('?')[0] + '?mode=overlay';
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
        function () { say('Ссылка оверлея скопирована: ' + url); },
        function () { window.prompt('Скопируй ссылку для OBS:', url); }
      );
    };
    $('btnExport').onclick = function () {
      var blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), state: S }, null, 2)],
        { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'tarkov-tracker-progress.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };
    $('btnImport').onclick = function () { $('fileImport').click(); };
    $('fileImport').onchange = function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var obj = JSON.parse(r.result), st = obj.state || obj;
          if (!st || typeof st !== 'object' || !st.party) throw new Error('это не файл прогресса');
          localStorage.setItem(KEY, JSON.stringify(st));
          S = read(); save(); refreshFilters(); render(); say('Прогресс импортирован.');
        } catch (err) { say('Ошибка импорта: ' + err.message); }
      };
      r.readAsText(f);
      e.target.value = '';
    };
    document.addEventListener('keydown', function (e) { // горячая клавиша D = «Я умер»
      var tag = (e.target.tagName || '').toLowerCase();
      if (e.code === 'KeyD' && !e.ctrlKey && !e.metaKey && !e.altKey &&
          tag !== 'input' && tag !== 'select' && tag !== 'textarea' && !$('dlg').open) die(1);
    });
    // синхронизация, если панель открыта в двух вкладках
    window.addEventListener('storage', function (e) { if (e.key === KEY) { S = read(); render(); } });

    refreshFilters(); render();
    loadApi(false); // при старте берём кэш или грузим с сайта
  }

  /* =====================================================================
     ОВЕРЛЕЙ  (?mode=overlay&w=400&h=200&max=5&empty=show&sound=0)
     ===================================================================== */
  function initOverlay() {
    var root = document.documentElement.style;
    root.setProperty('--w', (parseInt(P.get('w'), 10) || 400) + 'px');
    root.setProperty('--h', (parseInt(P.get('h'), 10) || 200) + 'px');
    var OMAX = Math.min(MAX, parseInt(P.get('max'), 10) || MAX);

    // ----- звуки (генерируются в браузере, файлы не нужны) -----
    var ac = null;
    function tone(f, d, t0, type) {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + t0;
      o.type = type || 'square'; o.frequency.value = f;
      g.gain.value = S.settings.volume * 0.2;
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
    }
    function snd(kind) {
      if (!S.settings.sound || P.get('sound') === '0') return;
      try {
        if (kind === 'take') { tone(520, 0.1, 0); tone(780, 0.14, 0.1); }
        else if (kind === 'done') { tone(660, 0.1, 0); tone(880, 0.1, 0.1); tone(1320, 0.2, 0.2); }
        else { tone(220, 0.25, 0, 'sawtooth'); tone(150, 0.4, 0.2, 'sawtooth'); }
      } catch (e) {}
    }

    var prevKey = null, prev = null, bannerTimer = null;

    function easter(n) { // пасхалка на каждой 10-й смерти
      var b = $('ovBanner'), c = $('ovCard');
      b.textContent = '💀 ' + n + ' СМЕРТЕЙ ПОДРЯД. ПЕЛЬМЕНИ ОСТЫВАЮТ…';
      b.classList.remove('show'); c.classList.remove('shake'); void b.offsetWidth;
      b.classList.add('show'); c.classList.add('shake');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(function () { b.classList.remove('show'); c.classList.remove('shake'); }, 4200);
    }

    function render() {
      var p = S.party, snap = p.snap.slice(0, OMAX), key = snap.map(function (x) { return x.id; }).join(',');
      document.body.setAttribute('data-n', snap.length);
      var showEmpty = P.get('empty') === 'show';
      $('ovCard').classList.toggle('off', !snap.length && !showEmpty);

      if (key !== prevKey) { // перерисовываем список только при смене состава пачки
        var old = prevKey ? prevKey.split(',') : [];
        $('ovList').innerHTML = snap.length ? snap.map(function (x) {
          return '<div class="oq' + (old.indexOf(x.id) < 0 ? ' in' : '') + '"><span class="ic">' + icon(x.trader) +
            '</span><div><b>' + esc(x.name) + '</b><span class="o">' + esc(x.objective) + '</span></div></div>';
        }).join('') : '<div class="oq"><div><span class="o">Нет активных квестов</span></div></div>';
        prevKey = key;
      }
      $('ovDeaths').textContent = p.deaths > 0 ? '💀 ' + p.deaths : '';

      if (prev) { // звуки и пасхалки по изменениям состояния
        if (p.ids.length > prev.n) snd('take');
        if (p.names.length > prev.c || S.history.length > prev.h) snd('done');
        if (p.deaths > prev.d) {
          snd('die');
          if (S.settings.easter && p.deaths % EASTER_EVERY === 0) easter(p.deaths);
        }
      }
      prev = { n: p.ids.length, c: p.names.length, h: S.history.length, d: p.deaths };
    }

    function refresh() { S = read(); render(); }
    window.addEventListener('storage', function (e) { if (e.key === KEY) refresh(); });
    if (bc) bc.onmessage = refresh;
    setInterval(refresh, 3000); // страховка, если событие синхронизации не дошло
    render();
  }

  if (MODE === 'panel') initPanel(); else initOverlay();
})();
