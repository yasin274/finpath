/* ============================================================
   FINPATH — клиент бэкенда

   Обычный скрипт без сборки: страницы Finpath — статические HTML, и тащить
   ради одного файла бандлер значило бы усложнить проект вдвое. Поэтому здесь
   IIFE и один глобальный объект window.FinpathApi.
   ============================================================ */
(function () {
  'use strict';

  var TOKEN_KEY = 'finpath-token';

  /**
   * Адрес API.
   *
   * Обычно дашборд раздаёт тот же Express, что и API, — тогда достаточно
   * относительного /api, и вопрос CORS не возникает вовсе. Но страницу часто
   * открывают и просто файлом с диска (протокол file:), и с Live Server на
   * другом порту: там относительный путь ведёт в никуда, поэтому откатываемся
   * на localhost. Переопределить можно, задав window.FINPATH_API_BASE до
   * подключения этого файла.
   */
  function resolveBase() {
    if (typeof window.FINPATH_API_BASE === 'string') return window.FINPATH_API_BASE;
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      return '/api';
    }
    return 'http://localhost:4400/api';
  }

  var BASE = resolveBase();

  /* ---------- Хранилище токена ------------------------------------- */

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      // Приватный режим или заблокированные куки — работаем как гость.
      return null;
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      /* сессия просто не переживёт перезагрузку страницы */
    }
  }

  /* ---------- Ошибки ------------------------------------------------ */

  /**
   * Ошибка с текстом, уже пригодным для показа пользователю.
   *
   * Бэкенд формулирует сообщения по-русски и по делу («Неверный email или
   * пароль»), поэтому клиенту незачем их переписывать — достаточно донести.
   */
  function ApiError(message, status, code, details) {
    var error = new Error(message);
    error.name = 'ApiError';
    error.status = status;
    error.code = code;
    error.details = details;
    return error;
  }

  /** Первое понятное сообщение из details валидации, если оно там есть. */
  function firstDetail(details) {
    if (!details) return null;
    for (var field in details) {
      if (Object.prototype.hasOwnProperty.call(details, field)) {
        var list = details[field];
        if (list && list.length) return list[0];
      }
    }
    return null;
  }

  function request(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    var init = { method: method, headers: headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    return fetch(BASE + path, init).then(function (response) {
      return response
        .json()
        .catch(function () {
          // Сюда попадаем, когда сервер не поднят или вернул HTML вместо JSON.
          throw ApiError('Сервер недоступен или вернул неразбираемый ответ', response.status);
        })
        .then(function (payload) {
          if (response.ok && payload && payload.success !== false) {
            return payload.data;
          }

          var err = (payload && payload.error) || {};

          // Токен протух или его нет — дальше держать его смысла нет.
          if (response.status === 401) setToken(null);

          throw ApiError(
            firstDetail(err.details) || err.message || 'Неизвестная ошибка',
            response.status,
            err.code,
            err.details
          );
        });
    });
  }

  /** Собирает query-строку, пропуская пустые значения. */
  function query(params) {
    var parts = [];
    for (var key in params) {
      if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
      var value = params[key];
      if (value === undefined || value === null || value === '') continue;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  window.FinpathApi = {
    getToken: getToken,
    setToken: setToken,
    query: query,

    get: function (path) {
      return request('GET', path);
    },
    post: function (path, body) {
      return request('POST', path, body);
    },
    patch: function (path, body) {
      return request('PATCH', path, body);
    },
    del: function (path) {
      return request('DELETE', path);
    }
  };
})();
