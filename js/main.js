/* ============================================================
   FINPATH — интерактивность лендинга и дашборда
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rub = new Intl.NumberFormat('ru-RU');

  /* ---------- Тема ------------------------------------------------- */
  var THEME_KEY = 'finpath-theme';

  function applyTheme(name) {
    root.setAttribute('data-theme', name);
    document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.themeSet === name);
      btn.setAttribute('aria-pressed', String(btn.dataset.themeSet === name));
    });
    try {
      localStorage.setItem(THEME_KEY, name);
    } catch (e) {
      /* приватный режим — тема просто не запомнится */
    }
  }

  try {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved) applyTheme(saved);
  } catch (e) {}

  document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyTheme(btn.dataset.themeSet);
    });
  });

  /* ---------- Шапка: состояние при скролле ------------------------- */
  var header = document.getElementById('header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-stuck', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Мобильное меню -------------------------------------- */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('is-open');
        burger.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Появление блоков при скролле ------------------------ */
  var revealables = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) {
      el.classList.add('is-in');
    });
  } else {
    // класс включает стартовое скрытие — ставим его только сейчас,
    // когда наблюдатель гарантированно будет создан
    root.classList.add('js-reveal');
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    revealables.forEach(function (el) {
      io.observe(el);
    });

    // Страховка: если наблюдатель не отдал ни одной записи (скрытая вкладка,
    // предрендер, окружение без композитора) — показываем всё принудительно.
    // Контент важнее анимации.
    window.setTimeout(function () {
      if (document.querySelector('.reveal.is-in')) return;
      io.disconnect();
      revealables.forEach(function (el) {
        el.classList.add('is-in');
      });
    }, 1600);
  }

  /* ---------- Бегущая строка: дублируем для бесшовного цикла ------ */
  var marquee = document.getElementById('marquee');
  if (marquee) {
    marquee.innerHTML += marquee.innerHTML;
  }

  /* ---------- Активная ссылка навигации по секциям ---------------- */
  function targetOf(link) {
    var href = link.getAttribute('href') || '';
    // «#» без идентификатора — не селектор, getElementById его отсечёт сам
    if (href.charAt(0) !== '#' || href.length < 2) return null;
    return document.getElementById(href.slice(1));
  }

  var navLinks = Array.prototype.filter.call(
    document.querySelectorAll('.nav__link[href^="#"]'),
    targetOf
  );

  // В навигации дашборда активный пункт задан разметкой (aria-current) —
  // подсветка по скроллу там только мешает.
  var staticNav = !!document.querySelector('.nav__link[aria-current="page"]');

  if (!staticNav && navLinks.length && 'IntersectionObserver' in window) {
    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          navLinks.forEach(function (a) {
            a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id);
          });
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    // одну и ту же секцию могут указывать несколько ссылок — наблюдаем её один раз
    navLinks
      .map(targetOf)
      .filter(function (el, i, all) {
        return all.indexOf(el) === i;
      })
      .forEach(function (el) {
        sectionObserver.observe(el);
      });
  }

  /* ---------- График денежного потока ----------------------------- */
  var MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  var FLOW = {
    'Доход': [286, 371, 468, 402, 561, 624, 497, 668, 806, 690, 574, 742],
    'Расход': [218, 297, 412, 356, 331, 468, 542, 431, 372, 415, 508, 596],
    'Накопления': [68, 74, 56, 46, 230, 156, 42, 237, 434, 275, 66, 146]
  };

  function renderChart(host, key) {
    var data = FLOW[key] || FLOW['Доход'];
    var max = Math.max.apply(null, data);
    var peak = data.indexOf(max);

    host.innerHTML = data
      .map(function (value, i) {
        var h = Math.round((value / max) * 100);
        return (
          '<div class="bar' +
          (i === peak ? ' is-peak' : '') +
          '" style="--h:' +
          h +
          '%;--d:' +
          i * 45 +
          'ms">' +
          '<span class="bar__tip">' +
          rub.format(value * 1000) +
          ' ₽</span>' +
          '<span class="bar__fill"></span>' +
          '<span class="bar__label">' +
          MONTHS[i] +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  var chart = document.getElementById('chart');
  var flowSeg = document.getElementById('flowSeg');

  if (chart) {
    renderChart(chart, 'Доход');

    if (flowSeg) {
      flowSeg.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        flowSeg.querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        renderChart(chart, btn.textContent.trim());
      });
    }
  }

  /* ---------- Универсальные сегментированные переключатели -------- */
  document.querySelectorAll('.seg').forEach(function (seg) {
    if (seg.id === 'flowSeg') return; // у него своя логика
    seg.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      seg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
    });
  });

  /* ---------- Список инвестиций: выбор строки --------------------- */
  document.querySelectorAll('.inv').forEach(function (list) {
    if (list.closest('.app--preview')) return;
    list.addEventListener('click', function (e) {
      var row = e.target.closest('.inv__row');
      if (!row) return;
      list.querySelectorAll('.inv__row').forEach(function (r) {
        r.classList.toggle('is-active', r === row);
      });
    });
  });

  /* ---------- Демо ИИ-ассистента ---------------------------------- */
  var aiForm = document.getElementById('aiForm');
  if (aiForm) {
    var aiInput = document.getElementById('aiInput');
    var aiAnswer = document.getElementById('aiAnswer');

    var CANNED = [
      'За март расходы составили <b>184 200 ₽</b> — это на 6,2% меньше февраля. Основная экономия пришлась на категорию «Транспорт».',
      'К концу месяца на основном счёте останется около <b>168 000 ₽</b> при текущем темпе трат. Резервный фонд трогать не потребуется.',
      'Нашёл <b>3 неактивные подписки</b> на 2 340 ₽ в месяц. Отключение сэкономит 28 080 ₽ в год.',
      'Чтобы закрыть цель «Отпуск» к августу, откладывайте <b>19 400 ₽</b> в месяц. Это 11% от текущего дохода.'
    ];
    var turn = 0;

    var respond = function (question) {
      aiAnswer.innerHTML =
        '<b>Вы:</b> ' +
        question.replace(/[<>]/g, '') +
        '<br><br>' +
        CANNED[turn % CANNED.length];
      aiAnswer.classList.add('is-shown');
      turn++;
    };

    aiForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = aiInput.value.trim();
      if (!q) return;
      respond(q);
      aiInput.value = '';
    });

    document.querySelectorAll('.ai__chip').forEach(function (chip) {
      if (chip.closest('.app--preview') || !chip.closest('.ai')) return;
      chip.addEventListener('click', function () {
        respond(chip.textContent.trim());
      });
    });
  }
})();
