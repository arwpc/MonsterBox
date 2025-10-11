(function () {
  // Ensure external script runs even if inline scripts are blocked by CSP
  try {
    function toggleSpanById(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var t = (el.textContent || '').trim();
      el.textContent = (t === 'Start') ? 'Stop' : 'Start';
    }

    function handlePotentialToggle(target) {
      try {
        var btn = target && target.closest && target.closest('button');
        if (!btn) return;
        if (btn.id === 'btnToggleInputVU') {
          toggleSpanById('input-vu-toggle');
          return;
        }
        if (btn.id === 'btnToggleOutputVU') {
          toggleSpanById('output-vu-toggle');
          return;
        }
        var txt = (btn.textContent || '').trim();
        if (txt.includes('Input Monitoring')) toggleSpanById('input-vu-toggle');
        if (txt.includes('Output Monitoring')) toggleSpanById('output-vu-toggle');
      } catch (_) { }
    }

    // Bind immediately and also after DOM ready for safety
    document.addEventListener('pointerdown', function (e) { handlePotentialToggle(e.target); }, true);
    document.addEventListener('click', function (e) { handlePotentialToggle(e.target); }, true);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      // no-op
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.addEventListener('pointerdown', function (e) { handlePotentialToggle(e.target); }, true);
        document.addEventListener('click', function (e) { handlePotentialToggle(e.target); }, true);
      });
    }
  } catch (e) {
    // Swallow errors in test/CI
  }
})();

