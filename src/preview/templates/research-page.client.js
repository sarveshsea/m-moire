function switchTab(name, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

let activeTag = null;
function filterByTag(tag, el) {
  if (activeTag === tag) {
    activeTag = null;
    el.classList.remove('active');
    document.querySelectorAll('.insight').forEach(i => i.style.display = '');
    return;
  }

  activeTag = tag;
  document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  document.querySelectorAll('.insight').forEach(i => {
    const tags = i.dataset.tags.split(',');
    i.style.display = tags.includes(tag) ? '' : 'none';
  });

  // Switch to findings tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab-btn').classList.add('active');
  document.getElementById('tab-findings').classList.add('active');
}
