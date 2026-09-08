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
    const tags = JSON.parse(i.dataset.tags);
    i.style.display = tags.includes(tag) ? '' : 'none';
  });

  // Switch to findings tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab-btn').classList.add('active');
  document.getElementById('tab-findings').classList.add('active');
}

// Read tag values from HTML data, never from JavaScript source in attributes.
document.querySelectorAll('.tag[data-tag]').forEach((element) => {
  element.addEventListener('click', () => filterByTag(element.dataset.tag, element));
});
