// Este archivo reutiliza la estructura de `script.js` y renderiza una vista vertical
document.addEventListener('DOMContentLoaded', () => {
  renderBranchSelector();
  renderCategoryNav();
  renderVerticalMenu();

  // Al cambiar de sucursal desde el selector del script principal
  document.getElementById('branchMenuSelector')?.addEventListener('click', () => {
    renderCategoryNav();
    renderVerticalMenu();
  });
});

function getBranch() {
  return branchMenus[state.selectedBranch];
}

function renderCategoryNav() {
  const nav = document.getElementById('categoryNav');
  if (!nav) return;
  const branch = getBranch();
  const categories = branch.menu.map((s) => s.title);

  nav.innerHTML = categories.map((title, idx) => `
    <button type="button" class="branch-option" data-idx="${idx}">${title}</button>
  `).join('');

  nav.querySelectorAll('.branch-option').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = Number(btn.dataset.idx);
      const sectionEls = document.querySelectorAll('.menu-section');
      const target = sectionEls[idx];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // marcar activo
        nav.querySelectorAll('.branch-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });
}

function renderVerticalMenu() {
  const content = document.getElementById('menuContent');
  if (!content) return;
  const branch = getBranch();

  content.innerHTML = branch.menu.map((section, sidx) => `
    <section class="menu-section" id="section-${sidx}">
      <h2>${section.title}</h2>
      <ul class="vertical-list">
        ${section.items.map((item) => `
          <li class="vertical-item">
            <img class="thumb" src="img/menu/${(item.name).toLowerCase().replace(/[^a-z0-9]+/g,'_')}.webp" alt="${item.name}" onerror="this.style.background='#121212'">
            <div class="info">
              <span class="name">${item.name}</span>
              ${item.description ? `<span class="desc">${item.description}</span>` : ''}
            </div>
            <div class="price">${item.price > 0 ? formatPrice(item.price) : '$-'}</div>
            <div class="menu-item-actions">
              ${item.available ? `<button type="button" class="add-to-cart" data-name="${item.name}" data-price="${item.price}">Agregar</button>` : `<button type="button" class="add-to-cart disabled" disabled>No disponible</button>`}
            </div>
          </li>
        `).join('')}
      </ul>
    </section>
  `).join('');

  // Actualizar nav para re-marcado al hacer scroll
  const nav = document.getElementById('categoryNav');
  if (!nav) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const sections = Array.from(document.querySelectorAll('.menu-section'));
        const idx = sections.indexOf(entry.target);
        nav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        const btn = nav.querySelector(`button[data-idx="${idx}"]`);
        if (btn) btn.classList.add('active');
      }
    });
  }, { root: null, rootMargin: '-20% 0px -60% 0px', threshold: 0 });

  document.querySelectorAll('.menu-section').forEach((sec) => observer.observe(sec));

  // Añadir funcionalidad de botones 'Agregar' que delega en addToCart()
  document.querySelectorAll('.add-to-cart').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const price = Number(btn.dataset.price);
      // buscar el item real en el menú
      const item = branch.menu.flatMap((s) => s.items).find((i) => i.name === name);
      if (!item || !item.available) return;
      addToCart(item.name, price);
    });
  });
}
