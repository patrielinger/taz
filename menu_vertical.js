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
  const categories = branch.menu.map((section) => ({
    title: section.title,
    count: section.items.length
  }));

  nav.innerHTML = `
    <div class="category-nav-head">
      <div>
        <span class="category-kicker">Explorá el menú</span>
        <strong>Elegí una categoría</strong>
      </div>
      <span class="category-hint">Tocá para ir</span>
    </div>
    <div class="category-options" role="list">
      ${categories.map((category, idx) => `
        <button
          type="button"
          class="category-option ${idx === 0 ? 'active' : ''}"
          data-idx="${idx}"
          aria-controls="section-${idx}"
          aria-label="Ver categoría ${category.title}"
          role="listitem"
        >
          <span class="category-number">${String(idx + 1).padStart(2, '0')}</span>
          <span class="category-option-main">
            <span class="category-option-title">${category.title}</span>
            <span class="category-option-meta">${category.count} ${category.count === 1 ? 'producto' : 'productos'}</span>
          </span>
          <span class="category-arrow" aria-hidden="true">→</span>
        </button>
      `).join('')}
    </div>
  `;

  const buttons = nav.querySelectorAll('.category-option');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const target = document.getElementById(`section-${idx}`);

      if (!target) return;

      buttons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-current', 'false');
      });

      btn.classList.add('active');
      btn.setAttribute('aria-current', 'true');

      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

      // En móvil, deja visible la categoría seleccionada.
      btn.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      });
    });
  });

  if (buttons[0]) buttons[0].setAttribute('aria-current', 'true');
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
            <img loading="lazy" class="thumb" src="${item.photo && item.photo.length ? item.photo : 'img/menu/' + (item.name).toLowerCase().replace(/[^a-z0-9]+/g,'_') + '.webp'}" alt="${item.name}" onerror="this.style.background='#121212'; this.src='';">
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
        if (btn) {
          btn.classList.add('active');
          btn.setAttribute('aria-current', 'true');
          btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
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
