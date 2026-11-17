/* =====================================================================
   api-loader.js — загрузка ВСЕХ квестов из открытого API tarkov.dev
   на русском языке, с кэшем в localStorage (12 часов).
   ---------------------------------------------------------------------
   Безопасность: это обычный HTTPS-запрос из браузера на сайт tarkov.dev.
   Игра, её процесс и память не затрагиваются.

   Как работает:
   1) Запрос А (основной): название, трейдер, карта, уровень, цели.
      Использует только базовые поля — он должен работать всегда.
   2) Запрос Б (необязательный): награды и предметы. Если API изменит
      схему и запрос Б упадёт, квесты всё равно загрузятся без наград.
   3) Результат приводится к формату трекера и кэшируется.

   Использование (из других файлов):
     const res = await TarkovApi.load();          // из кэша, если свежий
     const res = await TarkovApi.load({force:true}); // принудительно с сайта
     res.quests      -> массив квестов в формате трекера
     res.fromCache   -> true, если взято из кэша
     res.hasDetails  -> true, если удалось получить награды/предметы
   ===================================================================== */
(function () {
  'use strict';

  var ENDPOINT   = 'https://api.tarkov.dev/graphql';
  var CACHE_KEY  = 'tqt_api_cache_v1';
  var CACHE_TTL  = 12 * 60 * 60 * 1000; // 12 часов
  var TIMEOUT_MS = 20000;

  // ---- Запрос А: основа (только простые, стабильные поля) ----
  var QUERY_MAIN =
    'query { tasks(lang: ru) {' +
    '  id name wikiLink minPlayerLevel' +
    '  trader { name }' +
    '  map { name }' +
    '  objectives { description }' +
    '} }';

  // ---- Запрос Б: награды и предметы (может не сработать — это нормально) ----
  var QUERY_DETAILS =
    'query { tasks(lang: ru) {' +
    '  id' +
    '  finishRewards {' +
    '    items { count item { name } }' +
    '    traderStanding { standing trader { name } }' +
    '  }' +
    '  objectives {' +
    '    ... on TaskObjectiveItem { count item { name } }' +
    '  }' +
    '} }';

  // ---- Сетевой вызов с таймаутом ----
  // Сначала пробуем GET: это «простой» запрос без предварительной проверки
  // (preflight), которая у тебя блокировалась. Если не вышло — обычный POST.
  function request(query, usePost) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var p = usePost
      ? fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query: query }),
          signal: ctrl.signal
        })
      : fetch(ENDPOINT + '?query=' + encodeURIComponent(query), { signal: ctrl.signal });
    return p.then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (json) {
      if (!json || !json.data || !Array.isArray(json.data.tasks)) {
        var msg = json && json.errors && json.errors[0] && json.errors[0].message;
        throw new Error(msg || 'Пустой ответ API');
      }
      return json.data.tasks;
    }).catch(function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function gql(query) {
    return request(query, false).catch(function () { return request(query, true); });
  }

  // ---- Приведение к формату трекера ----
  // mainTasks — ответ запроса А; detailTasks — ответ запроса Б или null.
  function normalize(mainTasks, detailTasks) {
    var details = {};
    (detailTasks || []).forEach(function (t) { details[t.id] = t; });

    return mainTasks.map(function (t) {
      var d = details[t.id] || {};

      // Цели: склеиваем все описания в одну строку + оставляем массив
      var objectives = (t.objectives || [])
        .map(function (o) { return (o && o.description || '').trim(); })
        .filter(Boolean);

      // Предметы: берём из целей с предметами (запрос Б), без дублей
      var items = [];
      (d.objectives || []).forEach(function (o) {
        if (o && o.item && o.item.name) {
          var label = o.item.name + (o.count > 1 ? ' ×' + o.count : '');
          if (items.indexOf(label) === -1) items.push(label);
        }
      });

      // Награда: предметы и репутация одной строкой
      var rewardParts = [];
      var fr = d.finishRewards;
      if (fr) {
        (fr.items || []).forEach(function (r) {
          if (r && r.item && r.item.name) {
            rewardParts.push(r.item.name + (r.count > 1 ? ' ×' + r.count : ''));
          }
        });
        (fr.traderStanding || []).forEach(function (s) {
          if (s && s.trader && s.standing) {
            rewardParts.push('репутация ' + s.trader.name + ' ' +
              (s.standing > 0 ? '+' : '') + s.standing);
          }
        });
      }

      return {
        id: t.id,
        name: t.name,
        trader: t.trader ? t.trader.name : '',
        map: t.map ? t.map.name : 'Любая',   // у квестов без карты поле пустое
        level_required: typeof t.minPlayerLevel === 'number' ? t.minPlayerLevel : null,
        objective: objectives.join('; '),
        objectives: objectives,
        items: items,
        reward: rewardParts.join(', '),
        status: 'available',
        wikiLink: t.wikiLink || '',
        verified: true,
        source: 'api'
      };
    });
  }

  // ---- Кэш ----
  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      return (c && Array.isArray(c.quests)) ? c : null;
    } catch (e) { return null; }
  }

  function writeCache(quests, hasDetails) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(), hasDetails: !!hasDetails, quests: quests
      }));
    } catch (e) { /* хранилище переполнено или недоступно — не критично */ }
  }

  // ---- Главная функция ----
  function load(opts) {
    opts = opts || {};
    var cached = readCache();

    if (!opts.force && cached && (Date.now() - cached.savedAt) < CACHE_TTL) {
      return Promise.resolve({
        quests: cached.quests, fromCache: true, hasDetails: !!cached.hasDetails
      });
    }

    return gql(QUERY_MAIN).then(function (mainTasks) {
      // Запрос Б не должен ронять всю загрузку
      return gql(QUERY_DETAILS).then(
        function (detailTasks) { return { mainTasks: mainTasks, detailTasks: detailTasks }; },
        function () { return { mainTasks: mainTasks, detailTasks: null }; }
      );
    }).then(function (r) {
      var quests = normalize(r.mainTasks, r.detailTasks);
      var hasDetails = !!r.detailTasks;
      writeCache(quests, hasDetails);
      return { quests: quests, fromCache: false, hasDetails: hasDetails };
    }).catch(function (err) {
      // Нет сети или API недоступно: отдаём старый кэш, если он есть
      if (cached) {
        return { quests: cached.quests, fromCache: true, hasDetails: !!cached.hasDetails,
                 warning: 'Не удалось обновить список (' + err.message + '). Показан сохранённый.' };
      }
      throw err; // кэша нет — вызывающий код покажет встроенные квесты
    });
  }

  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  }

  window.TarkovApi = { load: load, clearCache: clearCache, _normalize: normalize };
})();
