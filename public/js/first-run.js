(function(){
  function selectCharacter(id){
    fetch('/setup/characters/api/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    }).then(function(r){ return r.json(); })
      .then(function(resp){ 
        if (resp && resp.success !== false) { 
          window.location.href = '/'; 
        } else {
          alert('Failed to select character: ' + (resp.error || 'Unknown error'));
        }
      })
      .catch(function(err){ 
        alert('Error selecting character: ' + err.message);
      });
  }

  function onClick(e){
    var t = e.target;
    var id = null;
    if (t && t.classList && t.classList.contains('btn-select')) {
      id = parseInt(t.getAttribute('data-id'), 10);
    } else if (t && t.closest) {
      var card = t.closest('.skull-card');
      if (card) id = parseInt(card.getAttribute('data-id'), 10);
    }
    if (id) selectCharacter(id);
  }

  function loadCharacterInfo() {
    // Get all character info elements
    var infoElements = document.querySelectorAll('.character-info');
    infoElements.forEach(function(el) {
      var charId = el.getAttribute('data-id');
      // Find character data from page context (rendered by EJS)
      var card = el.closest('.skull-card');
      if (card) {
        // For now, just show a placeholder - parts count is in charactersWithInfo
        // This will be populated by the EJS template
        el.innerHTML = '<i class="bi bi-info-circle"></i> Click to select';
      }
    });
  }

  if (document && document.addEventListener) {
    document.addEventListener('click', onClick, false);
    document.addEventListener('DOMContentLoaded', loadCharacterInfo, false);
  }
})();

