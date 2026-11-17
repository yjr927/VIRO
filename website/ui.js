'use strict';
document.querySelector('#saved-nav')?.addEventListener('click', () => {
  const control = document.querySelector('#favorites-filter');
  control.checked = true;
  control.dispatchEvent(new Event('change'));
});
fetch('./data/creations.json', {cache:'no-store'}).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => {
  if (Array.isArray(data.items)) document.querySelector('#stat-creations').textContent = data.items.length;
}).catch(() => {});
