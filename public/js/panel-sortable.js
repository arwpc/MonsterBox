/**
 * panel-sortable.js — Drag-and-drop panel reordering with collapse for MonsterBox
 * Lazy-loads SortableJS from CDN if not already present.
 *
 * Template usage:
 *   - Add class="sortable-column" to a container whose direct children are reorderable
 *   - Add data-panel-id="unique-id" to each draggable child
 *   - Add class="panel-collapsible" data-panel-id="unique-id" to standalone collapsible cards
 *   - Include this script and call PanelSortable.init('pageKey') on DOMContentLoaded
 */
(function () {
  'use strict';

  // ── CSS ────────────────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent =
    '.panel-drag-handle{cursor:grab;opacity:0.35;margin-right:0.4rem;font-size:1rem;flex-shrink:0;transition:opacity 0.15s;user-select:none}' +
    '.panel-drag-handle:hover{opacity:0.8}' +
    '.panel-drag-handle:active{cursor:grabbing}' +
    '.panel-collapse-toggle{cursor:pointer;opacity:0.35;margin-left:auto;padding-left:0.4rem;font-size:0.8rem;flex-shrink:0;transition:transform 0.2s,opacity 0.15s;user-select:none}' +
    '.panel-collapse-toggle:hover{opacity:0.8}' +
    '.panel-collapse-toggle.collapsed{transform:rotate(-90deg)}' +
    '.sortable-ghost{opacity:0.35}' +
    '.sortable-chosen{box-shadow:0 0 10px rgba(13,110,253,0.3)}';
  document.head.appendChild(css);

  // ── Storage helpers ────────────────────────────────────────────────────
  var PREFIX = 'mb_panel_';

  function sKey(page, kind) { return PREFIX + page + '_' + kind; }

  function loadState(page) {
    try {
      var o = localStorage.getItem(sKey(page, 'order'));
      var c = localStorage.getItem(sKey(page, 'collapsed'));
      return { order: o ? JSON.parse(o) : {}, collapsed: c ? JSON.parse(c) : {} };
    } catch (e) { return { order: {}, collapsed: {} }; }
  }

  function saveOrder(page, data) {
    try { localStorage.setItem(sKey(page, 'order'), JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function saveCollapsed(page, data) {
    try { localStorage.setItem(sKey(page, 'collapsed'), JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  // ── DOM helpers ────────────────────────────────────────────────────────
  function directPanels(parent) {
    var out = [];
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i].hasAttribute('data-panel-id')) out.push(parent.children[i]);
    }
    return out;
  }

  // ── Header injection ──────────────────────────────────────────────────
  function addControls(el, state, page, withHandle) {
    var pid = el.getAttribute('data-panel-id');
    if (!pid) return;

    // Find card-header (may be inside a nested card when el is a col wrapper)
    var header = el.querySelector('.card-header');
    if (!header) return;

    // Ensure flex layout on header
    if (!header.classList.contains('d-flex')) {
      header.classList.add('d-flex', 'align-items-center');
    }

    // Drag handle (prepend)
    if (withHandle && !header.querySelector('.panel-drag-handle')) {
      var h = document.createElement('i');
      h.className = 'bi bi-grip-vertical panel-drag-handle';
      h.title = 'Drag to reorder';
      header.insertBefore(h, header.firstChild);
    }

    // Collapse toggle (append)
    if (!header.querySelector('.panel-collapse-toggle')) {
      var t = document.createElement('i');
      t.className = 'bi bi-chevron-down panel-collapse-toggle';
      t.title = 'Collapse / Expand';
      header.appendChild(t);

      t.addEventListener('click', function (e) {
        e.stopPropagation();
        var card = header.closest('.card');
        if (!card) return;
        // Toggle all card-body elements inside this card (usually just one)
        var bodies = card.querySelectorAll(':scope > .card-body');
        if (!bodies.length) return;
        var wasHidden = bodies[0].style.display === 'none';
        for (var b = 0; b < bodies.length; b++) {
          bodies[b].style.display = wasHidden ? '' : 'none';
        }
        t.classList.toggle('collapsed', !wasHidden);
        state.collapsed[pid] = !wasHidden;
        saveCollapsed(page, state.collapsed);
      });
    }

    // Restore collapsed state
    if (state.collapsed[pid]) {
      var card = header.closest('.card');
      if (card) {
        var bodies = card.querySelectorAll(':scope > .card-body');
        for (var b = 0; b < bodies.length; b++) bodies[b].style.display = 'none';
      }
      var tog = header.querySelector('.panel-collapse-toggle');
      if (tog) tog.classList.add('collapsed');
    }
  }

  // ── Sortable columns ──────────────────────────────────────────────────
  function initColumns(page, state) {
    var cols = document.querySelectorAll('.sortable-column');
    for (var ci = 0; ci < cols.length; ci++) {
      var col = cols[ci];
      var cid = col.getAttribute('data-column-id') || ('col-' + ci);
      var panels = directPanels(col);

      // Inject handles + toggles
      for (var p = 0; p < panels.length; p++) {
        addControls(panels[p], state, page, true);
      }

      // Restore saved order
      var saved = state.order[cid];
      if (saved && Array.isArray(saved)) {
        for (var s = 0; s < saved.length; s++) {
          var panel = col.querySelector(':scope > [data-panel-id="' + saved[s] + '"]');
          if (panel) col.appendChild(panel);
        }
      }

      // Create SortableJS instance (only if >1 panel)
      if (typeof Sortable !== 'undefined' && panels.length > 1) {
        (function (column, colId, pageState) {
          Sortable.create(column, {
            animation: 150,
            handle: '.panel-drag-handle',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            draggable: '[data-panel-id]',
            onEnd: function () {
              var ids = [];
              var items = directPanels(column);
              for (var i = 0; i < items.length; i++) {
                ids.push(items[i].getAttribute('data-panel-id'));
              }
              pageState.order[colId] = ids;
              saveOrder(page, pageState.order);
            }
          });
        })(col, cid, state);
      }
    }
  }

  // ── Standalone collapsible cards ──────────────────────────────────────
  function initCollapsible(page, state) {
    var cards = document.querySelectorAll('.panel-collapsible[data-panel-id]');
    for (var i = 0; i < cards.length; i++) {
      // Skip if inside a sortable-column (already handled)
      if (cards[i].closest('.sortable-column')) continue;
      addControls(cards[i], state, page, false);
    }
  }

  // ── SortableJS lazy-loader ────────────────────────────────────────────
  function loadSortable(cb) {
    if (typeof Sortable !== 'undefined') return cb();
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
    s.onload = cb;
    s.onerror = function () {
      console.warn('PanelSortable: SortableJS CDN load failed — drag disabled');
      cb();
    };
    document.head.appendChild(s);
  }

  // ── Public API ────────────────────────────────────────────────────────
  function init(page) {
    loadSortable(function () {
      var state = loadState(page);
      initColumns(page, state);
      initCollapsible(page, state);
    });
  }

  function reset(page) {
    try { localStorage.removeItem(sKey(page, 'order')); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(sKey(page, 'collapsed')); } catch (e) { /* ignore */ }
    location.reload();
  }

  window.PanelSortable = { init: init, reset: reset };
})();
