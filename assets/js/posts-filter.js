/* ==========================================================================
   posts-filter.js  -  메인(/) 및 글 목록(/archive/) 카테고리·보기 방식 전환
   ========================================================================== */
(function () {
  'use strict';

  function initBrowser(root) {
    var collection = root.querySelector('[data-collection]');
    if (!collection) return;

    var cards = Array.prototype.slice.call(collection.querySelectorAll('.card'));
    var catBtns = Array.prototype.slice.call(root.querySelectorAll('[data-cat]'));
    var viewBtns = Array.prototype.slice.call(root.querySelectorAll('[data-view-btn]'));
    var countEl = root.querySelector('[data-count-label]');
    var syncUrl = document.body.classList.contains('layout-archive');

    var state = {
      category: 'all',
      view: root.getAttribute('data-default-view') || 'card'
    };

    var params = new URLSearchParams(location.search);
    var pCat = params.get('category');
    if (pCat && catBtns.some(function (b) { return b.getAttribute('data-cat') === pCat; })) {
      state.category = pCat;
    }
    var pView = params.get('view');
    if (pView === 'card' || pView === 'list') {
      state.view = pView;
    }

    function apply(pushState) {
      var visible = 0;

      cards.forEach(function (card) {
        var cat = card.getAttribute('data-category') || '';
        var ok = (state.category === 'all' || cat === state.category);
        card.hidden = !ok;
        if (ok) visible++;
      });

      if (countEl) {
        countEl.textContent = (state.category !== 'all') ? (visible + ' / ' + cards.length) : String(cards.length);
      }

      catBtns.forEach(function (btn) {
        var active = btn.getAttribute('data-cat') === state.category;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      collection.setAttribute('data-view', state.view);
      viewBtns.forEach(function (btn) {
        var active = btn.getAttribute('data-view-btn') === state.view;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      if (pushState && syncUrl && window.history && window.history.replaceState) {
        var next = new URLSearchParams();
        if (state.category !== 'all') next.set('category', state.category);
        if (state.view !== (root.getAttribute('data-default-view') || 'card')) next.set('view', state.view);
        var qs = next.toString();
        var nextUrl = location.pathname + (qs ? '?' + qs : '') + (location.hash || '');
        window.history.replaceState(null, '', nextUrl);
      }
    }

    catBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.category = btn.getAttribute('data-cat') || 'all';
        apply(true);
      });
    });

    viewBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-view-btn');
        if (v === 'card' || v === 'list') {
          state.view = v;
          apply(true);
        }
      });
    });

    apply(false);
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-post-browser]'), initBrowser);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
