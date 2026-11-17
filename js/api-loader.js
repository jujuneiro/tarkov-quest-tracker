/* =====================================================================
   api-loader.js — загрузка ВСЕХ квестов на русском языке.
   ---------------------------------------------------------------------
   Источник 1 (основной): готовые файлы json.tarkov.dev — те же, что
     использует сам сайт tarkov.dev (не зависят от упавшего GraphQL):
       tasks      — структура квестов (трейдер, карта, уровень, цели, награды)
       tasks_ru   — русские названия квестов и текст целей
       traders_ru — русские имена трейдеров
       maps_ru    — русские названия карт
   Источник 2 (запасной): GraphQL api.tarkov.dev.
   Результат кэшируется в localStorage на 12 часов.

   Безопасность: обычные HTTPS-запросы из браузера. Игра не затрагивается.

   Использование:
     TarkovApi.load()                      -> из кэша, если свежий
     TarkovApi.load({force:true})          -> принудительно с сайта
     TarkovApi.load({gameMode:'pve'})      -> квесты режима PvE (по умолчанию 'regular')
   ===================================================================== */
(function () {
  'use strict';

  var JSON_BASE  = 'https://json.tarkov.dev/';
  var ENDPOINT   = 'https://api.tarkov.dev/graphql';
  var CACHE_KEY  = 'tqt_api_cache_v2_';       // + режим игры
  var CACHE_TTL  = 12 * 60 * 60 * 1000;       // 12 часов
  var TIMEOUT_MS = 25000;
  var ROUBLES_ID = '5449016a4bdc2d6f028b456f'; // id предмета «Рубли»

  function timeoutFetch(url, opts) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    opts = Object.assign({}, opts || {}, { signal: ctrl.signal });
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }

  /* ---------------- Источник 1: json.tarkov.dev ---------------- */
  function fromJson(gm) {
    var b = JSON_BASE + gm + '/';
    return Promise.all([
      timeoutFetch(b + 'tasks'), timeoutFetch(b + 'tasks_ru'),
      timeoutFetch(b + 'traders_ru'), timeoutFetch(b + 'maps_ru')
    ]).then(function (r) { return normalizeJson(r[0], r[1], r[2], r[3]); });
  }

  function fmtNum(n) { try { return Number(n).toLocaleString('ru'); } catch (e) { return String(n); } }

  function normalizeJson(tasksRes, ru, tr, mp) {
    var tasks = (tasksRes && tasksRes.data && tasksRes.data.tasks) || {};
    var T = (ru && ru.data) || {}, TR = (tr && tr.data) || {}, MP = (mp && mp.data) || {};
    var seen = {}, out = [];

    Object.keys(tasks).forEach(function (id) {
      var t = tasks[id];
      var name = T[id + ' name'];
      if (!name) return; // нет русского названия — пропускаем

      var trader = TR[t.trader + ' Nickname'] || '';
      var map = t.map ? (MP[t.map + ' Name'] || 'Любая') : 'Любая';
      // У некоторых квестов есть варианты для BEAR и USEC: различаем их в названии
      var faction = t.factionName && t.factionName !== 'Any' ? t.factionName : '';
      var title = name + (faction ? ' (' + faction + ')' : '');

      // Убираем дубли (одно и то же название у того же трейдера на той же карте)
      var key = title + '|' + trader + '|' + map;
      if (seen[key]) return;
      seen[key] = 1;

      // Цели: текст по id цели из tasks_ru
      var objectives = (t.objectives || []).map(function (o) {
        var d = (T[o.id] || '').trim();
        return d && o.optional ? '(необязательно) ' + d : d;
      }).filter(Boolean);

      // Награда: рубли, опыт и репутация (предметы-награды по id не переводим)
      var reward = [];
      var fr = t.finishRewards || {};
      (fr.items || []).forEach(function (r) {
        if (r.item === ROUBLES_ID && r.count) reward.push(fmtNum(r.count) + ' ₽');
      });
      if (t.experience) reward.push(fmtNum(t.experience) + ' опыта');
      (fr.traderStanding || []).forEach(function (s) {
        var n = TR[s.trader + ' Nickname'];
        if (n && s.standing) reward.push('репутация ' + n + ' ' + (s.standing > 0 ? '+' : '') + s.standing);
      });

      out.push({
        id: id, name: title, trader: trader, map: map,
        level_required: typeof t.minPlayerLevel === 'number' ? t.minPlayerLevel : null,
        objective: objectives.join(' • '), objectives: objectives,
        items: [], reward: reward.join(', '),
        status: 'available', wikiLink: t.wikiLink || '',
        kappa: !!t.kappaRequired, verified: true, source: 'api'
      });
    });
    return out;
  }

  /* ---------------- Источник 2 (запасной): GraphQL ---------------- */
  var QUERY =
    'query { tasks(lang: ru) { id name wikiLink minPlayerLevel trader { name } map { name } objectives { description } } }';

  function fromGraphql() {
    return timeoutFetch(ENDPOINT + '?query=' + encodeURIComponent(QUERY)).catch(function () {
      return timeoutFetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY })
      });
    }).then(function (json) {
      if (!json || !json.data || !Array.isArray(json.data.tasks)) {
        var m = json && json.errors && json.errors[0];
        throw new Error((m && (m.message || m)) || 'Пустой ответ API');
      }
      return json.data.tasks.map(function (t) {
        var objs = (t.objectives || []).map(function (o) { return (o.description || '').trim(); }).filter(Boolean);
        return {
          id: t.id, name: t.name, trader: t.trader ? t.trader.name : '', map: t.map ? t.map.name : 'Любая',
          level_required: typeof t.minPlayerLevel === 'number' ? t.minPlayerLevel : null,
          objective: objs.join(' • '), objectives: objs, items: [], reward: '',
          status: 'available', wikiLink: t.wikiLink || '', verified: true, source: 'api'
        };
      });
    });
  }

  /* ---------------- Кэш и главная функция ---------------- */
  function readCache(gm) {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY + gm));
      return c && Array.isArray(c.quests) ? c : null;
    } catch (e) { return null; }
  }
  function writeCache(gm, quests, via) {
    try { localStorage.setItem(CACHE_KEY + gm, JSON.stringify({ savedAt: Date.now(), via: via, quests: quests })); }
    catch (e) { /* хранилище переполнено — не критично */ }
  }

  function load(opts) {
    opts = opts || {};
    var gm = opts.gameMode === 'pve' ? 'pve' : 'regular';
    var cached = readCache(gm);

    if (!opts.force && cached && (Date.now() - cached.savedAt) < CACHE_TTL) {
      return Promise.resolve({ quests: cached.quests, fromCache: true, hasDetails: true, via: cached.via });
    }

    return fromJson(gm).then(
      function (q) { return { quests: q, via: 'json' }; },
      function (e1) {
        return fromGraphql().then(
          function (q) { return { quests: q, via: 'graphql' }; },
          function (e2) { throw new Error(e1.message + '; запасной источник: ' + e2.message); }
        );
      }
    ).then(function (r) {
      if (!r.quests.length) throw new Error('Получен пустой список квестов');
      writeCache(gm, r.quests, r.via);
      return { quests: r.quests, fromCache: false, hasDetails: true, via: r.via };
    }).catch(function (err) {
      if (cached) { // нет сети: показываем последний сохранённый список
        return { quests: cached.quests, fromCache: true, hasDetails: true, via: cached.via,
                 warning: 'Не удалось обновить список (' + err.message + '). Показан сохранённый.' };
      }
      throw err;
    });
  }

  function clearCache() {
    try { ['regular', 'pve'].forEach(function (m) { localStorage.removeItem(CACHE_KEY + m); }); } catch (e) {}
  }

  window.TarkovApi = { load: load, clearCache: clearCache, _normalizeJson: normalizeJson };
})();
