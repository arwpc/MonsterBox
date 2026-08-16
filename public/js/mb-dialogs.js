/* ==========================================================================
   MonsterBox — canonical toast + destructive-confirm helpers
   --------------------------------------------------------------------------
   Native alert and confirm dialogs cannot be styled, block the whole tab, are
   awkward one-handed on a phone, and — the part that matters for a destructive
   action — cannot show WHAT is about to be destroyed. On show night a modal you
   must read and dismiss also arrives at exactly the wrong moment, so plain
   feedback goes to a toast and only genuinely destructive actions get a dialog,
   which names its target.

   This is the single implementation. Several pages used to carry their own copy
   of the same twenty lines; those still work (they simply overwrite these), but
   nothing new needs to.

   Loaded globally from views/layouts/master.ejs, before page scripts.

   Usage:
     window.mbToast('Scene saved', 'success');           // info|success|warning|danger
     var ok = await window.mbConfirm({
       title: 'Delete this scene?',
       detail: '"Rise from Crypt" will be removed permanently.',
       confirmLabel: 'Delete scene'
     });

   ES5 only (var, no arrow functions, no template literals) — this file is
   loaded on every page including the operator dashboard.
   ========================================================================== */
(function () {
    'use strict';

    if (window.mbToast && window.mbConfirm) return;

    function toastRegion() {
        var region = document.querySelector('.mb-toast-region');
        if (!region) {
            region = document.createElement('div');
            region.className = 'mb-toast-region';
            region.setAttribute('role', 'status');
            region.setAttribute('aria-live', 'polite');
            document.body.appendChild(region);
        }
        return region;
    }

    if (!window.mbToast) {
        window.mbToast = function (message, severity) {
            var region = toastRegion();
            var toast = document.createElement('div');
            toast.className = 'mb-toast mb-toast-' + (severity || 'info');
            toast.setAttribute('data-mb-toast', severity || 'info');
            toast.textContent = String(message);
            region.appendChild(toast);
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 4500);
            return toast;
        };
    }

    if (!window.mbConfirm) {
        window.mbConfirm = function (opts) {
            var options = opts || {};
            return new Promise(function (resolve) {
                var backdrop = document.createElement('div');
                backdrop.className = 'mb-modal-backdrop';
                backdrop.innerHTML =
                    '<div class="mb-modal" role="dialog" aria-modal="true">' +
                        '<div class="mb-modal-dialog">' +
                            '<div class="mb-modal-header"><h3 class="mb-modal-title"></h3></div>' +
                            '<div class="mb-modal-body"><p class="mb-modal-detail"></p></div>' +
                            '<div class="mb-modal-footer">' +
                                '<button type="button" class="mb-btn mb-btn-secondary" data-act="cancel">Cancel</button>' +
                                '<button type="button" class="mb-btn mb-btn-danger" data-act="ok"></button>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                backdrop.querySelector('.mb-modal-title').textContent = options.title || 'Are you sure?';
                backdrop.querySelector('.mb-modal-detail').textContent = options.detail || '';
                backdrop.querySelector('[data-act="ok"]').textContent = options.confirmLabel || 'Confirm';

                function close(result) {
                    document.removeEventListener('keydown', onKey);
                    if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                    resolve(result);
                }
                function onKey(e) { if (e.key === 'Escape') close(false); }

                backdrop.addEventListener('click', function (e) {
                    if (e.target === backdrop) { close(false); return; }
                    var act = e.target.closest && e.target.closest('[data-act]');
                    if (act) close(act.getAttribute('data-act') === 'ok');
                });
                document.addEventListener('keydown', onKey);
                document.body.appendChild(backdrop);
                var ok = backdrop.querySelector('[data-act="ok"]');
                if (ok && ok.focus) ok.focus();
            });
        };
    }
})();
