/* =====================================================================
   quests.js — справочники и ЗАПАСНОЙ набор квестов
   ---------------------------------------------------------------------
   ВАЖНО: основной источник квестов — кнопка «Загрузить все квесты»
   (js/api-loader.js, данные tarkov.dev на русском). Этот файл нужен,
   чтобы трекер работал без интернета и чтобы ты мог добавлять свои квесты.

   Встроенные квесты написаны по памяти и помечены verified: false.
   Цели описаны в общих чертах, конкретные предметы и числа я
   намеренно не вписывал, чтобы не выдумывать. Точные данные подтянет API.
   ===================================================================== */

// ----- Справочник трейдеров: имя -> иконка (emoji). Добавляй свои. -----
window.TQT_TRADERS = {
  'Прапор':      { icon: '🔫' },
  'Терапевт':    { icon: '💊' },
  'Скупщик':     { icon: '💰' },
  'Лыжник':      { icon: '🎿' },
  'Миротворец':  { icon: '🕊️' },
  'Механик':     { icon: '🔧' },
  'Барахольщик': { icon: '🎒' },
  'Егерь':       { icon: '🌲' },
  'Реферал':     { icon: '🏆' }
};

// ----- Справочник карт. «Любая» — для квестов без привязки к карте. -----
window.TQT_MAPS = [
  'Любая', 'Нулевая точка', 'Таможня', 'Лес', 'Завод', 'Развязка',
  'Берег', 'Маяк', 'Резерв', 'Лаборатория', 'Улицы Таркова', 'Эпицентр'
];

// ----- Запасной набор квестов. Формат — как в ТЗ + служебные поля. -----
// Поля: id, name, trader, map, level_required (null = неизвестно),
//       objective, items[], reward, status, verified, source
window.TQT_BUILTIN_QUESTS = [
  { id: 'b-debut', name: 'Дебют', trader: 'Прапор', map: 'Таможня',
    level_required: 1,
    objective: 'Убить диких на Таможне и сдать Прапору запрошенное оружие',
    items: [], reward: '', status: 'available', verified: false, source: 'builtin' },

  { id: 'b-shortage', name: 'Нехватка', trader: 'Терапевт', map: 'Любая',
    level_required: 1,
    objective: 'Найти в рейде и сдать Терапевту запрошенные медицинские припасы',
    items: [], reward: '', status: 'available', verified: false, source: 'builtin' },

  { id: 'b-sanitary-1', name: 'Санитарные нормы — часть 1', trader: 'Терапевт', map: 'Берег',
    level_required: null,
    objective: 'Найти медицинские припасы на Берегу и сдать Терапевту',
    items: [], reward: '', status: 'available', verified: false, source: 'builtin' },

  { id: 'b-sanitary-2', name: 'Санитарные нормы — часть 2', trader: 'Терапевт', map: 'Берег',
    level_required: null,
    objective: 'Продолжение «Санитарных норм»: выполнить задание Терапевта на Берегу',
    items: [], reward: '', status: 'available', verified: false, source: 'builtin' },

  { id: 'b-aquarius-1', name: 'Операция «Водолей» — часть 1', trader: 'Терапевт', map: 'Любая',
    level_required: null,
    objective: 'Выполнить задание Терапевта из цепочки «Операция «Водолей»»',
    items: [], reward: '', status: 'available', verified: false, source: 'builtin' },

  { id: 'b-gunsmith-1', name: 'Оружейник — часть 1', trader: 'Механик', map: 'Любая',
    level_required: null,
    objective: 'Собрать оружие по заданным параметрам и сдать Механику',
    items: [], reward: '', status: 'available', verified: false, source: 'builtin' },

  { id: 'b-gunsmith-2', name: 'Оружейник — часть 2', trader: 'Механик', map: 'Любая',
    level_required: null,
    objective: 'Собрать оружие по заданным параметрам и сдать Механику',
    items: [], reward: '', status: 'available', verified: false, source: 'builtin' },

  { id: 'b-gunsmith-3', name: 'Оружейник — часть 3', trader: 'Механик', map: 'Любая',
    level_required: null,
    objective: 'Собрать оружие по заданным параметрам и сдать Механику',
    items: [], reward: '', status: 'available', verified: false, source: 'builtin' },

  { id: 'b-search-mission', name: 'Поисковая миссия', trader: 'Миротворец', map: 'Любая',
    level_required: null,
    objective: 'Найти в рейде запрошенные предметы и сдать Миротворцу',
    items: [], reward: '', status: 'available', verified: false, source: 'builtin' },

  { id: 'b-acquaintance', name: 'Знакомство', trader: 'Егерь', map: 'Любая',
    level_required: null,
    objective: 'Найти в рейде и сдать Егерю запрошенные предметы',
    items: [], reward: '', status: 'available', verified: false, source: 'builtin' }
];

// Примечание: здесь меньше квестов, чем 15-20 из первоначального ТЗ.
// Это сознательно: пустые «заглушки» были бы бесполезны, а выдуманные цели вредны.
// Свой квест добавляется копированием любой строки выше с новым id вида 'my-001'.
