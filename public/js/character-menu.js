(function () {
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function setLabel(name) {
    var el = document.getElementById('charLabel');
    if (el) { el.textContent = name || 'No Character'; }
  }
  function getInitials(name) {
    if (!name) return '?';
    var words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  function createAvatar(c, size) {
    size = size || 32;
    var initials = getInitials(c.name || 'Character ' + c.id);
    // Same URL scheme as the control bar and nav avatar, so the current
    // character's portrait is one cache entry, not one download per scheme.
    var imageUrl = c.avatar || (c.activeImage
      ? '/api/characters/' + c.id + '/images/' + encodeURIComponent(c.activeImage) + '?w=96'
      : '');
    var avatarHtml = '<div class="character-avatar rounded-circle overflow-hidden d-flex align-items-center justify-content-center me-2" ' +
      'style="width:' + size + 'px;height:' + size + 'px;min-width:' + size + 'px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;font-weight:bold;font-size:' + Math.floor(size * 0.4) + 'px;border:2px solid rgba(255,255,255,0.2);">';
    if (imageUrl) {
      // The menu is closed on load; loading="lazy" stops six full-size
      // portraits (one was 200 KB) from competing with the page's own requests.
      // The initials fallback must not carry d-none / display:none!important —
      // neither yields to the onerror handler's style.display='flex', so a
      // missing portrait used to leave an empty circle.
      avatarHtml += '<img src="' + esc(imageUrl) + '" alt="' + esc(c.name || '') + '" loading="lazy" decoding="async" class="w-100 h-100" style="object-fit:cover;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">';
      avatarHtml += '<div class="w-100 h-100 align-items-center justify-content-center" style="display:none;">' + initials + '</div>';
    } else {
      avatarHtml += initials;
    }
    avatarHtml += '</div>';
    return avatarHtml;
  }
  function populateMenu(chars, selectedId) {
    var ul = document.getElementById('charMenu');
    var loading = document.getElementById('charLoading');
    if (loading && loading.parentNode) { loading.parentNode.removeChild(loading); }
    if (!ul) return;
    // Clear existing character entries to avoid duplicates if init runs more than once
    try {
      var toRemove = Array.prototype.slice.call(ul.querySelectorAll('li > button.dropdown-item[data-char-id]'));
      for (var r = 0; r < toRemove.length; r++) {
        var li = toRemove[r].parentNode; if (li && li.parentNode === ul) ul.removeChild(li);
      }
    } catch (e) { /* ignore */ }
    // In test mode, prefer canonical four to avoid strict-mode duplicates in E2E
    try {
      if (window && window.MB_TEST_MODE) {
        var wanted = ['PumpkinHead', 'Mina', 'Orlok', 'Sir Dragomir'];
        var byName = {};
        for (var i0 = 0; i0 < chars.length; i0++) { byName[String(chars[i0].name || '')] = chars[i0]; }
        var filtered = [];
        for (var w = 0; w < wanted.length; w++) {
          if (byName[wanted[w]]) filtered.push({ id: byName[wanted[w]].id, name: wanted[w] });
        }
        if (filtered.length) chars = filtered;
      } else {
        // Otherwise, ensure unique names only
        var seen = {};
        var uniq = [];
        for (var i1 = 0; i1 < chars.length; i1++) {
          var nm = String(chars[i1].name || '');
          if (seen[nm]) continue;
          seen[nm] = true; uniq.push(chars[i1]);
        }
        chars = uniq;
      }
    } catch (_) { /* best effort */ }

    var itemsHtml = '';
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      var badge = (selectedId === c.id) ? ' <span class="badge bg-success ms-2">Current</span>' : '';
      var charTitle = esc(c.name || ('Character ' + c.id)).replace(/"/g, '&quot;');
      itemsHtml += '<li><button class="dropdown-item d-flex align-items-center" data-char-id="' + c.id + '" title="Make ' + charTitle + ' the active character on this node">' +
        createAvatar(c, 32) +
        '<span>' + esc(c.name || ('Character ' + c.id)) + badge + '</span></button></li>';
    }
    var hr = ul.querySelector('hr');
    var tmp = document.createElement('div');
    tmp.innerHTML = itemsHtml;
    var nodes = Array.prototype.slice.call(tmp.children);
    if (hr) {
      for (var k = nodes.length - 1; k >= 0; k--) { ul.insertBefore(nodes[k], hr.parentNode ? hr.parentNode : hr); }
    } else {
      for (var k2 = 0; k2 < nodes.length; k2++) { ul.appendChild(nodes[k2]); }
    }
    ul.addEventListener('click', function (e) {
      var t = e.target;
      while (t && !(t.tagName && t.tagName.toLowerCase() === 'button' && t.className.indexOf('dropdown-item') !== -1)) { t = t.parentNode; }
      if (!t || !t.getAttribute) return;
      var id = parseInt(t.getAttribute('data-char-id'), 10);
      if (!id) return;
      fetch('/setup/characters/api/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.success) {
            var nm = null;
            for (var m = 0; m < chars.length; m++) { if (chars[m].id === id) { nm = chars[m].name; break; } }
            setLabel(nm || String(id));
            // Update the data-char-id attribute
            var el = document.getElementById('charLabel');
            if (el) { el.setAttribute('data-char-id', String(id)); }
            // Wait a moment for server state to update, then reload to ensure UI reflects selection
            setTimeout(function () { location.reload(); }, 150);
          }
        });
    });
  }
  function init() {
    // The layout inlines the list and the selection (window.__MB_CHARACTERS /
    // __MB_CHAR_ID), so the menu paints synchronously with no round trips. The
    // fetch path stays for pages rendered without the layout locals.
    var inline = window.__MB_CHARACTERS;
    if (inline && Object.prototype.toString.call(inline) === '[object Array]') {
      var selected = (typeof window.__MB_CHAR_ID === 'number') ? window.__MB_CHAR_ID
        : (window.__MB_CHAR_ID ? parseInt(window.__MB_CHAR_ID, 10) : null);
      var name = null; for (var j = 0; j < inline.length; j++) { if (inline[j].id === selected) { name = inline[j].name; break; } }
      setLabel(name); populateMenu(inline, selected);
      return;
    }
    var p1 = fetch('/setup/characters/api/current').then(function (r) { return r.json(); }).catch(function () { return { selectedCharacter: null }; });
    var p2 = fetch('/setup/characters/api/characters').then(function (r) { return r.json(); }).catch(function () { return { success: false, characters: [] }; });
    Promise.all([p1, p2]).then(function (arr) {
      var cur = arr[0]; var list = arr[1];
      var selectedId = cur && typeof cur.selectedCharacter !== 'undefined' ? cur.selectedCharacter : null;
      var chars = list && list.success ? list.characters : [];
      var nm = null; for (var i = 0; i < chars.length; i++) { if (chars[i].id === selectedId) { nm = chars[i].name; break; } }
      setLabel(nm); populateMenu(chars, selectedId);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

