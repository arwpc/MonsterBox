(function(){
  function selectCharacter(id){
    fetch('/setup/characters/api/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    }).then(function(r){ return r.json(); })
      .then(function(resp){ if (resp && resp.success !== false) { window.location.href = '/'; } })
      .catch(function(){ window.location.href = '/'; });
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

  if (document && document.addEventListener) {
    document.addEventListener('click', onClick, false);
  }
})();

