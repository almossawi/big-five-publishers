(function() {
  var el = document.getElementById('site-footer');
  if (!el) return;

  fetch('footer.html')
    .then(function(r) {
      if (!r.ok) throw new Error('footer load failed');
      return r.text();
    })
    .then(function(html) {
      el.innerHTML = html;
    })
    .catch(function() { /* leave footer empty */ });
})();
