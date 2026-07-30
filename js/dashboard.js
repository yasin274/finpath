/* ============================================================
   FINPATH — источник данных дашборда

   Правило работы файла:
   • гость видит РОВНО ту разметку, что лежит в dashboard.html, — это и есть
     демо-режим. Лендинг зовёт «Открыть демо», и ссылка не должна упираться в
     пустой экран или в форму входа;
   • вошедший пользователь получает те же блоки, но заполненные из API.

   Из-за этого демо-данные здесь НЕ дублируются: они уже в HTML, и второй их
   экземпляр в JS неизбежно разошёлся бы с первым.
   ============================================================ */
(function () {
  'use strict';

  var api = window.FinpathApi;
  if (!api) return;

  var rub = new Intl.NumberFormat('ru-RU');
  var MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  /** Сколько операций показывает панель «Операции» — столько же, сколько в макете. */
  var TX_LIMIT = 6;
  /** Глубина графика денежного потока. */
  var FLOW_MONTHS = 12;

  var state = { user: null, accounts: [], categories: [] };

  /* ---------- Вспомогательное ------------------------------------- */

  function $(id) {
    return document.getElementById(id);
  }

  /**
   * Экранирование перед вставкой через innerHTML.
   *
   * Описания операций и названия счетов пишет сам пользователь. Без этого
   * «<img onerror=…>» в названии счёта выполнялся бы у него же в браузере при
   * каждом открытии дашборда.
   */
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /** «3 428 900» + «,00» — под разметку .balance__amount с отдельным .frac. */
  function splitAmount(value) {
    var negative = value < 0;
    var abs = Math.abs(value);
    var whole = Math.floor(abs);
    var cents = Math.round((abs - whole) * 100);

    return {
      int: (negative ? '−' : '') + rub.format(whole),
      frac: ',' + String(cents).padStart(2, '0')
    };
  }

  function money(value) {
    return rub.format(Math.round(value)) + ' ₽';
  }

  function formatDate(iso) {
    var d = new Date(iso);
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(-2);
  }

  /** Буква для круглой «аватарки» операции. */
  function initial(text) {
    var trimmed = String(text || '').trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '•';
  }

  /* ---------- Отрисовка блоков ------------------------------------ */

  function renderIdentity(user) {
    var login = user.email.split('@')[0];

    var greeting = $('fpGreeting');
    if (greeting) greeting.textContent = 'Здравствуйте, ' + login;

    var avatar = $('fpAvatar');
    if (avatar) {
      avatar.textContent = login.slice(0, 2).toUpperCase();
      avatar.setAttribute('aria-label', 'Профиль: ' + user.email);
    }

    var notice = $('fpNotice');
    if (notice) {
      notice.innerHTML =
        'Данные аккаунта ' +
        esc(user.email) +
        '. Инвестиции, цели и ИИ-ассистент пока демонстрационные. ' +
        '<a href="index.html" class="back-link">Вернуться на сайт</a>';
    }
  }

  function renderBalance(overview) {
    var amount = $('fpBalance');
    if (amount) {
      var parts = splitAmount(overview.totalBalance);
      amount.innerHTML =
        '<span class="cur">₽</span>' + esc(parts.int) + '<span class="frac">' + esc(parts.frac) + '</span>';
    }

    /**
     * Под балансом показываем чистый поток за период, а не процент «за месяц»:
     * процент требует остатка на начало периода, а его нет — история операций
     * у нового аккаунта начинается с нуля, и любая цифра там была бы выдумкой.
     */
    var delta = $('fpBalanceDelta');
    if (delta) {
      var net = overview.net;
      var up = net >= 0;
      delta.style.color = up ? '' : 'var(--down)';
      delta.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        (up ? '<path d="M7 17 17 7M9 7h8v8"/>' : '<path d="M17 7 7 17M15 17H7V9"/>') +
        '</svg> ' +
        (up ? '+' : '−') +
        esc(money(Math.abs(net))) +
        ' за период';
    }
  }

  /**
   * Подписи к «каплям» распределения баланса.
   *
   * Сама SVG-фигура декоративная и остаётся из макета — из данных приходят
   * только три подписи, ровно на тех же позициях. Перерисовывать каплю под
   * произвольное число счетов пришлось бы вместе с фильтром размытия, а
   * выигрыш в точности при этом нулевой.
   */
  var BLOB_SPOTS = [
    { left: '14.3%', top: '56%', onLime: false },
    { left: '49%', top: '51%', onLime: true },
    { left: '85%', top: '54%', onLime: false }
  ];

  function renderBlobs(accounts) {
    var host = $('fpBlobLabels');
    if (!host) return;

    // Три самых крупных счёта: подписей всего три, и показать надо главные.
    var top = accounts
      .slice()
      .sort(function (a, b) {
        return Math.abs(b.balance) - Math.abs(a.balance);
      })
      .slice(0, BLOB_SPOTS.length);

    host.innerHTML = top
      .map(function (account, i) {
        var spot = BLOB_SPOTS[i];
        return (
          '<div class="blob-label' +
          (spot.onLime ? ' blob-label--on-lime' : '') +
          '" style="left:' + spot.left + ';top:' + spot.top + '">' +
          '<b>' + esc(rub.format(Math.round(account.balance))) + '</b>' +
          '<span>' + esc(account.name) + '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderCards(accounts) {
    var first = accounts[0];
    var second = accounts[1];

    if (first) {
      var name1 = $('fpCard1Name');
      var sum1 = $('fpCard1Sum');
      if (name1) name1.textContent = first.name;
      if (sum1) sum1.textContent = money(first.balance);
    }

    var slot2 = $('fpCard2Slot');
    if (second) {
      var name2 = $('fpCard2Name');
      var sum2 = $('fpCard2Sum');
      if (name2) name2.textContent = second.name;
      if (sum2) sum2.textContent = money(second.balance);
      if (slot2) slot2.hidden = false;
    } else if (slot2) {
      // Второй карты нет — показывать чужую демо-карту рядом со своей нельзя.
      slot2.hidden = true;
    }
  }

  function renderTransactions(items) {
    var host = $('fpTx');
    if (!host) return;

    if (!items.length) {
      host.innerHTML = '<p class="fp-empty">Операций пока нет — добавьте первую.</p>';
      return;
    }

    host.innerHTML = items
      .map(function (tx) {
        var title = tx.description || tx.categoryName || tx.accountName;
        var income = tx.kind === 'INCOME';
        return (
          '<div class="tx__row">' +
          '<span class="brand" aria-hidden="true">' + esc(initial(title)) + '</span>' +
          '<span class="tx__name">' + esc(title) + '</span>' +
          '<span class="tx__date">' + esc(formatDate(tx.occurredAt)) + '</span>' +
          '<span class="tx__sum ' + (income ? 'up' : 'down') + '">' +
          // U+2212 «минус», а не дефис: в макете используется именно он.
          (income ? '+' : '−') + esc(money(tx.amount)) +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderCategories(summary) {
    var total = $('fpDonutTotal');
    if (total) total.textContent = rub.format(Math.round(summary.total));

    var period = $('fpCatPeriod');
    if (period) period.textContent = periodLabel(summary.period);

    var slices = summary.categories;

    /**
     * Кольцо строится из stroke-dasharray в процентах длины окружности
     * (r = 15.9 подобран так, что она равна 100). Смещение каждого сегмента —
     * сумма долей предыдущих со знаком минус.
     */
    var arcs = $('fpDonutArcs');
    if (arcs) {
      var offset = 0;
      arcs.innerHTML = slices
        .map(function (slice) {
          var dash = slice.share;
          var markup =
            '<circle cx="21" cy="21" r="15.9" fill="none" stroke="' + esc(slice.color) + '" ' +
            'stroke-width="5" stroke-dasharray="' + dash + ' ' + (100 - dash) + '" ' +
            'stroke-dashoffset="' + -offset + '" stroke-linecap="round"/>';
          offset += dash;
          return markup;
        })
        .join('');
    }

    var donut = $('fpDonut');
    if (donut) {
      donut.setAttribute(
        'aria-label',
        slices.length
          ? slices
              .map(function (s) {
                return s.name + ' ' + s.share + '%';
              })
              .join(', ')
          : 'Расходов за период нет'
      );
    }

    var legend = $('fpLegend');
    if (legend) {
      legend.innerHTML = slices.length
        ? slices
            .map(function (slice) {
              return (
                '<div class="legend__row">' +
                '<span class="legend__swatch" style="--c:' + esc(slice.color) + '"></span>' +
                esc(slice.name) +
                '<span class="num">' + esc(rub.format(Math.round(slice.total))) + '</span>' +
                '</div>'
              );
            })
            .join('')
        : '<p class="fp-empty">Расходов за период нет</p>';
    }
  }

  /** «март 2026» — как в макете. */
  function periodLabel(period) {
    var to = new Date(period.to);
    return MONTHS_SHORT[to.getMonth()].toLowerCase() + ' ' + to.getFullYear();
  }

  function renderCashflow(months) {
    var labels = months.map(function (row) {
      // '2026-03' → 'Мар'. Индекс месяца берём из строки, а не через Date:
      // разбор '2026-03' как даты уводит в UTC и на границе часовых поясов
      // может сдвинуть подпись на месяц назад.
      var index = parseInt(row.month.slice(5), 10) - 1;
      return MONTHS_SHORT[index] || row.month;
    });

    var flow = {
      'Доход': months.map(function (row) { return row.income; }),
      'Расход': months.map(function (row) { return row.expense; }),
      'Накопления': months.map(function (row) { return row.savings; })
    };

    // Отрисовку столбцов держит main.js — он же обслуживает превью на лендинге.
    if (window.Finpath && window.Finpath.setFlow) {
      window.Finpath.setFlow(flow, labels, 1);
    }

    var amount = $('fpFlowAmount');
    if (amount) {
      var totalIncome = flow['Доход'].reduce(function (sum, value) { return sum + value; }, 0);
      var parts = splitAmount(totalIncome);
      amount.innerHTML =
        '<span class="cur">₽</span>' + esc(parts.int) + '<span class="frac">' + esc(parts.frac) + '</span>';
    }
  }

  /* ---------- Загрузка данных -------------------------------------- */

  function loadDashboard() {
    // Все шесть запросов независимы — последовательный их запуск дал бы шесть
    // раундтрипов подряд там, где хватает одного ожидания.
    return Promise.all([
      api.get('/summary/overview'),
      api.get('/summary/by-category' + api.query({ limit: 4 })),
      api.get('/summary/cashflow' + api.query({ months: FLOW_MONTHS })),
      api.get('/transactions' + api.query({ limit: TX_LIMIT })),
      api.get('/accounts'),
      api.get('/categories')
    ]).then(function (results) {
      var overview = results[0];
      var byCategory = results[1];
      var cashflow = results[2];
      var transactions = results[3];

      state.accounts = results[4].accounts;
      state.categories = results[5].categories;

      renderBalance(overview);
      renderBlobs(overview.accounts);
      renderCards(state.accounts);
      renderCategories(byCategory);
      renderCashflow(cashflow.months);
      renderTransactions(transactions.items);
      fillTransactionForm();
    });
  }

  /* ---------- Модальные окна --------------------------------------- */

  function openModal(id) {
    var modal = $(id);
    if (!modal) return;
    modal.hidden = false;
    var field = modal.querySelector('input, select');
    if (field) field.focus();
  }

  function closeModal(modal) {
    if (modal) modal.hidden = true;
  }

  // Закрытие по крестику, фону и Esc — три привычных способа, и ни один из них
  // пользователь не должен искать.
  document.addEventListener('click', function (e) {
    // e.target — не обязательно элемент (клик может прийти на сам документ),
    // поэтому наличие closest проверяем, а не предполагаем.
    if (!e.target || !e.target.closest) return;
    var closer = e.target.closest('[data-fp-close]');
    if (closer) closeModal(closer.closest('.fp-modal'));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.fp-modal:not([hidden])').forEach(closeModal);
  });

  function showError(id, message) {
    var box = $(id);
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  /* ---------- Вход и регистрация ----------------------------------- */

  var authMode = 'login';

  function setupAuth() {
    var tabs = $('fpAuthTabs');
    var form = $('fpAuthForm');
    var submit = $('fpAuthSubmit');
    var title = $('fpAuthTitle');

    if (tabs) {
      tabs.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;

        authMode = btn.dataset.mode;
        tabs.querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });

        var register = authMode === 'register';
        if (title) title.textContent = register ? 'Регистрация в Finpath' : 'Вход в Finpath';
        if (submit) submit.textContent = register ? 'Создать аккаунт' : 'Войти';
        if (form) {
          form.password.setAttribute('autocomplete', register ? 'new-password' : 'current-password');
        }
        showError('fpAuthError', '');
      });
    }

    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      showError('fpAuthError', '');

      var payload = { email: form.email.value.trim(), password: form.password.value };

      if (submit) submit.disabled = true;

      api
        .post(authMode === 'register' ? '/auth/register' : '/auth/login', payload)
        .then(function (data) {
          api.setToken(data.token);
          // Перезагрузка, а не точечное обновление: демо-разметка на странице
          // уже перемешана бы с настоящими данными, и надёжнее начать с чистого
          // листа, чем вычищать её вручную блок за блоком.
          window.location.reload();
        })
        .catch(function (error) {
          showError('fpAuthError', error.message);
          if (submit) submit.disabled = false;
        });
    });
  }

  /* ---------- Новая операция --------------------------------------- */

  var txKind = 'EXPENSE';

  function fillTransactionForm() {
    var accountSelect = $('fpTxAccount');
    if (accountSelect) {
      accountSelect.innerHTML = state.accounts
        .map(function (account) {
          return '<option value="' + esc(account.id) + '">' + esc(account.name) + '</option>';
        })
        .join('');
    }

    fillCategoryOptions();
  }

  /** Категории фильтруем по типу операции: расход не относят к «Зарплате». */
  function fillCategoryOptions() {
    var select = $('fpTxCategory');
    if (!select) return;

    var options = state.categories.filter(function (category) {
      return category.kind === txKind;
    });

    select.innerHTML =
      '<option value="">Без категории</option>' +
      options
        .map(function (category) {
          return '<option value="' + esc(category.id) + '">' + esc(category.name) + '</option>';
        })
        .join('');
  }

  function setupTransactionForm() {
    var kinds = $('fpTxKind');
    var form = $('fpTxForm');
    var submit = $('fpTxSubmit');

    if (kinds) {
      kinds.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;

        txKind = btn.dataset.kind;
        kinds.querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        fillCategoryOptions();
      });
    }

    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      showError('fpTxError', '');

      var payload = {
        accountId: form.accountId.value,
        amount: Number(form.amount.value),
        kind: txKind,
        description: form.description.value.trim() || undefined,
        categoryId: form.categoryId.value || null
      };

      // Пустое поле даты означает «сегодня» — сервер подставит его сам.
      if (form.occurredAt.value) payload.occurredAt = form.occurredAt.value;

      if (submit) submit.disabled = true;

      api
        .post('/transactions', payload)
        .then(function () {
          form.reset();
          closeModal($('fpTxModal'));
          // Обновляем весь дашборд, а не только ленту: операция меняет и
          // остаток счёта, и разбивку по категориям, и график.
          return loadDashboard();
        })
        .catch(function (error) {
          showError('fpTxError', error.message);
        })
        .then(function () {
          if (submit) submit.disabled = false;
        });
    });
  }

  /* ---------- Режимы ------------------------------------------------ */

  function enterDemoMode() {
    var authBtn = $('fpAuthBtn');
    if (authBtn) {
      authBtn.textContent = 'Войти';
      authBtn.onclick = function () {
        openModal('fpAuthModal');
      };
    }

    var addBtn = $('fpAddBtn');
    if (addBtn) addBtn.hidden = true;

    // Разметку не трогаем вовсе: то, что уже в HTML, и есть демо-данные.
  }

  function enterLiveMode(user) {
    state.user = user;
    renderIdentity(user);

    var authBtn = $('fpAuthBtn');
    if (authBtn) {
      authBtn.textContent = 'Выйти';
      authBtn.title = user.email;
      authBtn.onclick = function () {
        api.setToken(null);
        window.location.reload();
      };
    }

    var addBtn = $('fpAddBtn');
    if (addBtn) {
      addBtn.hidden = false;
      addBtn.onclick = function () {
        openModal('fpTxModal');
      };
    }

    return loadDashboard().catch(function (error) {
      // Данные не поехали, но пользователь вошёл — честно говорим об этом,
      // вместо того чтобы оставить на экране демо-цифры под его именем.
      var notice = $('fpNotice');
      if (notice) {
        notice.innerHTML =
          'Не удалось загрузить данные: ' + esc(error.message) +
          '. <a href="index.html" class="back-link">Вернуться на сайт</a>';
      }
    });
  }

  /* ---------- Старт -------------------------------------------------- */

  setupAuth();
  setupTransactionForm();

  if (!api.getToken()) {
    enterDemoMode();
    return;
  }

  api
    .get('/auth/me')
    .then(function (data) {
      return enterLiveMode(data.user);
    })
    .catch(function () {
      // Токен протух, сервер не поднят или база недоступна — во всех случаях
      // показать демо лучше, чем сломанный экран. Токен при 401 уже сброшен
      // в api.js.
      enterDemoMode();
    });
})();
