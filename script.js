const menuButton = document.getElementById('menu');
const nav = document.getElementById('nav');
const statusEl = document.getElementById('storeStatus');
const statusTextEl = document.getElementById('storeStatusText');

if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    nav.classList.toggle('open');
  });

  document.querySelectorAll('.nav a').forEach((link) => {
    link.addEventListener('click', () => nav.classList.remove('open'));
  });
}

function updateStoreStatus() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  let label = 'Cerrado';
  let cssClass = 'status-closed';

  if (totalMinutes >= 19 * 60 && totalMinutes < 19 * 60 + 30) {
    label = 'Abrirá pronto';
    cssClass = 'status-soon';
  } else if (totalMinutes >= 19 * 60 + 30 && totalMinutes < 23 * 60) {
    label = 'Abierto';
    cssClass = 'status-open';
  } else if (totalMinutes >= 23 * 60 && totalMinutes < 23 * 60 + 30) {
    label = 'Pronto cerramos';
    cssClass = 'status-closing';
  } else if (totalMinutes >= 23 * 60 + 30) {
    label = 'Cerrado';
    cssClass = 'status-closed';
  }

  if (statusTextEl) {
    statusTextEl.textContent = label;
  }

  if (statusEl) {
    statusEl.className = `store-status ${cssClass}`;
  }
}

if (statusEl && statusTextEl) {
  updateStoreStatus();
  setInterval(updateStoreStatus, 60000);
}

const baseMenu = [
  {
    title: 'Especialidades',
    items: [
      { name: 'Pollo frito', price: 11000, description: '3 Piezas de pollo de pata o muslo (1/4 de pollo) + colchon de papas', available: true },
      { name: 'Alitas picantes', price: 11000, description: '8 Piezas de alitas + colchon de papas + Salsa picante', available: true },
      { name: 'SPF (Sándwich de pollo)', price: 11000, description: '2 Sandwichs de pollo con pepinillo y salsa de la casa + colchon de papas', available: true },
      { name: 'Mix de pollo frito (Balde)', price: 44000, description: '4 piezas de pollo frito + 10 Alitas picantes + 4 nuggets + 4 Bastones de queso + 2 Sándwiches de pollo + colchon de papas', available: true },
      { name: 'CH-POP', price: 6000, description: 'Pochoclos de pollo trozado con papas', available: true },
      { name: 'Nuggets & CO', price: 11000, description: '7 Nuggets + 5 Bastones de queso + colchon de papas', available: true }
    ]
  },
  {
    title: 'Hamburguesas',
    items: [
      { name: 'Hamburguesa Especial', price: 11000, description: 'Lechuga, tomate, huevo, jamon, queso, carne.', available: true },
      { name: 'Big Taz', price: 13500, description: 'Lechuga, tomate, huevo, jamon, queso, doble carne.', available: true },
      { name: 'Gran Unnie', price: 13500, description: 'Cuádruple hamburguesa, triple queso, lechuga, tomate + Papas.', available: true },
      { name: 'Patinesa', price: 11000, description: 'Hamburguesa rebosada, lechuga, tomate, huevo, jamón, queso.', available: true }
    ]
  },
  {
    title: 'Sandwiches',
    items: [
      { name: 'Lomito Especial', price: 11500, description: 'Lechuga, tomate, huevo, jamon, queso, lomito.', available: true },
      { name: 'Mega Lomo', price: 15500, description: 'Lechuga, tomate, huevo, jamon, queso, doble lomo.', available: true },
      { name: 'Lomito Taz Loco', price: 12500, description: 'Tomate, huevo, 2 tipos de queso, morron, aceituna.', available: true },
      { name: 'Cerdo', price: 12500, description: 'Lechuga, tomate, huevo, jamon, queso, cerdo.', available: true },
      { name: 'Mila Especial', price: 11500, description: 'Lechuga, tomate, huevo, jamon, queso, milanesa.', available: true },
      { name: 'Mega Mila', price: 15500, description: 'Lechuga, tomate, huevo, jamon, queso, doble mila.', available: true }
    ]
  },
  {
    title: 'Extras',
    items: [
      { name: 'Napolitana', price: 13000, description: 'Milanesa napolitana + papas fritas', available: true },
      { name: 'Promo Kids', price: 12000, description: 'Hamburguesa pequeña o 6 nuggets + papas fritas + jugo Baggio + juguete a elección.', available: true },
      { name: 'Vegetariano', price: 7500, description: 'Sabor ahumado y dulce para acompañar.', available: true },
      { name: 'Charles', price: 20000, description: 'Lechuga, tomate, huevo, jamon, queso, carne, pan de miga.', available: true },
      { name: 'Taz Attack', price: 13000, description: 'Hamburguesa al plato, queso, papas fritas, lechuga, tomate, pan.', available: true },
      { name: 'Pancho', price: 3800, description: '', available: true }
    ]
  },
  {
    title: 'Papas',
    items: [
      { name: 'Adicional de papas', price: 1500, description: '', available: true },
      { name: 'Papas fritas grande', price: 8500, description: '', available: true },
      { name: 'Moon', price: 11000, description: 'Papas grandes bañadas en chedar, huevo, jamon, aceitunas', available: true }
    ]
  },
  {
    title: 'Postres',
    items: [
      { name: 'Taz Shake de Dulce de Leche', price: 5000, description: 'Suave, cremoso y con un dulzor clásico.', available: false },
      { name: 'Taz Shake de Oreo', price: 5000, description: 'Suave, cremoso y con un dulzor clásico.', available: false },
      { name: 'Taz Shake de Frutilla', price: 5000, description: 'Suave, cremoso y con un dulzor clásico.', available: false }
    ]
  },
  {
    title: 'Bebidas',
    items: [
      { name: 'Agua mineral', price: 2200, description: '', available: true },
      { name: 'Gaseosa 375ml', price: 3000, description: '', available: true },
      { name: 'Gaseosa 500ml', price: 4000, description: 'Gaseosas y Aguas saborisadas', available: true },
      { name: 'Gaseosa 1L', price: 6000, description: '', available: true },
      { name: 'Gaseosa 1.5L', price: 7500, description: '', available: true },
      { name: 'Jugo de naranja', price: 3500, description: '', available: true }
    ]
  },
  {
    title: 'Cervezas y Aperitivos',
    items: [
      { name: 'Artesanal 1L', price: 0, description: 'Sabor miel, rubia y negra', available: false },
      { name: 'Corona 330ml', price: 0, description: '', available: false },
      { name: 'Lata de cerveza 473ml', price: 0, description: '', available: false },
      { name: 'Fernet', price: 0, description: '', available: false },
      { name: 'Gancia + Sprite', price: 0, description: '', available: false },
      { name: 'Campari + Jugo de naranja', price: 0, description: '', available: false }
    ]
  },
  {
    title: 'Tragos',
    items: [
      { name: 'Sex on the beach', price: 0, description: '', available: false },
      { name: 'Laguna azul', price: 0, description: '', available: false }
    ]
  }
];

function filterMenuByTitles(menu, allowedTitles) {
  return cloneMenu(menu).filter((section) => allowedTitles.includes(section.title));
}

const branchMenus = {
  centro: {
    name: 'Centro',
    whatsapp: '543884496174',
    // El menú base pero sin 'Pancho' (solo disponible en nieva)
    menu: (function(){
      return cloneMenu(baseMenu).map((section) => ({
        ...section,
        items: section.items.filter((it) => it.name !== 'Pancho')
      }));
    })()
  },
  nieva: {
    name: 'Ciudad de Nieva',
    whatsapp: '543884798839',
    // Copia del menú base (sin la sección 'Tragos') — contiene 'Pancho' en 'Extras'
    menu: (function() {
      return cloneMenu(baseMenu).filter((s) => s.title !== 'Tragos');
    })()
  },
  comedero: {
    name: 'Alto Comedero',
    whatsapp: '543885901847',
    menu: filterMenuByTitles(baseMenu, ['Especialidades', 'Bebidas'])
  }
};

const state = {
  selectedBranch: 'centro',
  cart: []
};

function cloneMenu(menu) {
  return menu.map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item }))
  }));
}

function formatPrice(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(value);
}

function renderBranchSelector() {
  const selector = document.getElementById('branchMenuSelector');
  if (!selector) return;

  selector.innerHTML = Object.entries(branchMenus).map(([key, branch]) => `
    <button type="button" class="branch-option ${state.selectedBranch === key ? 'active' : ''}" data-branch="${key}">
      ${branch.name}
    </button>
  `).join('');

  selector.querySelectorAll('.branch-option').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedBranch = button.dataset.branch;
      renderBranchSelector();
      renderMenu();
      closeCart();
    });
  });
}

function renderMenu() {
  const menuContent = document.getElementById('menuContent');
  if (!menuContent) return;

  const branch = branchMenus[state.selectedBranch];

  menuContent.innerHTML = `
    <div class="menu-layout">
      ${branch.menu.map((section) => `
        <section class="menu-section">
          <h2>${section.title}</h2>
          <ul class="menu-list">
            ${section.items.map((item) => {
              const actionLabel = item.available ? 'Agregar' : 'No disponible';
              const disabled = item.available ? '' : 'disabled';
              const actionClass = item.available ? 'add-to-cart' : 'add-to-cart disabled';

              return `
                <li>
                  <div class="menu-item-top">
                    <span class="menu-item-name">${item.name}</span>
                    <div class="menu-item-actions">
                      <span class="menu-item-price">${item.price > 0 ? formatPrice(item.price) : '$-'}</span>
                      <button type="button" class="${actionClass}" data-name="${item.name}" data-price="${item.price}" ${disabled}>
                        ${actionLabel}
                      </button>
                    </div>
                  </div>
                  ${item.description ? `<span class="menu-item-desc">${item.description}</span>` : ''}
                </li>
              `;
            }).join('')}
          </ul>
        </section>
      `).join('')}
    </div>
  `;

  menuContent.querySelectorAll('.add-to-cart').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.name;
      const price = Number(button.dataset.price);
      const item = branch.menu.flatMap((section) => section.items).find((entry) => entry.name === name);
      if (!item || !item.available) return;
      addToCart(item.name, price);
    });
  });
}

function addToCart(name, price) {
  const existingItem = state.cart.find((item) => item.name === name);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    state.cart.push({
      name,
      price,
      quantity: 1,
      branch: state.selectedBranch
    });
  }

  renderCart();
  openCart();
}

function removeFromCart(name) {
  state.cart = state.cart.filter((item) => item.name !== name);
  renderCart();
}

function clearCart() {
  state.cart = [];
  renderCart();
}

function getCartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function renderCart() {
  const cartItems = document.getElementById('cartItems');
  const cartCount = document.getElementById('cartCount');
  const cartTotal = document.getElementById('cartTotal');

  if (!cartItems || !cartCount || !cartTotal) return;

  const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = totalItems;

  if (state.cart.length === 0) {
    cartItems.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
    cartTotal.textContent = formatPrice(0);
    return;
  }

  cartItems.innerHTML = state.cart.map((item) => `
    <div class="cart-item">
      <div>
        <strong>${item.name}</strong>
        <span>${item.quantity} x ${formatPrice(item.price)}</span>
      </div>
      <div class="cart-item-actions">
        <span>${formatPrice(item.price * item.quantity)}</span>
        <button type="button" class="cart-remove" data-name="${item.name}">Eliminar</button>
      </div>
    </div>
  `).join('');

  cartItems.querySelectorAll('.cart-remove').forEach((button) => {
    button.addEventListener('click', () => removeFromCart(button.dataset.name));
  });

  cartTotal.textContent = formatPrice(getCartTotal());
}

function openCart() {
  const panel = document.getElementById('cartPanel');
  const toggle = document.getElementById('cartToggle');
  if (!panel || !toggle) return;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  toggle.setAttribute('aria-expanded', 'true');
}

function closeCart() {
  const panel = document.getElementById('cartPanel');
  const toggle = document.getElementById('cartToggle');
  if (!panel || !toggle) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-expanded', 'false');
}
function finalizePurchase() {
  if (state.cart.length === 0) return;

  const branch = branchMenus[state.selectedBranch];
  const total = getCartTotal();

  // Lista formateada con viñetas, cantidades destacadas y precios
  const productList = state.cart
    .map((item) => `▪️ *${item.quantity}x* ${item.name} (${formatPrice(item.price * item.quantity)})`)
    .join('\n');

  // Estructura limpia usando saltos de línea reales (\n) y negritas de WhatsApp (*texto*)
  const message = 
`🛒 *NUEVO PEDIDO - TAZ ${branch.name.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━

📋 *Detalle del pedido:*
${productList}

━━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL A PAGAR:* ${formatPrice(total)}
━━━━━━━━━━━━━━━━━━━━━

Aguardamos su confirmación. ¡Muchas gracias! 🙌`;

  // encodeURIComponent se encarga de convertir los saltos de línea \n correctamente
  const url = `https://wa.me/${branch.whatsapp}?text=${encodeURIComponent(message)}`;
  
  window.open(url, '_blank');
  clearCart();
  closeCart();
}

function initCart() {
  const cartToggle = document.getElementById('cartToggle');
  const closeCartButton = document.getElementById('closeCart');
  const cancelCartButton = document.getElementById('cancelCart');
  const checkoutCartButton = document.getElementById('checkoutCart');

  if (cartToggle) {
    cartToggle.addEventListener('click', () => {
      const panel = document.getElementById('cartPanel');
      if (!panel) return;
      panel.classList.contains('open') ? closeCart() : openCart();
    });
  }

  if (closeCartButton) {
    closeCartButton.addEventListener('click', closeCart);
  }

  if (cancelCartButton) {
    cancelCartButton.addEventListener('click', () => {
      clearCart();
      closeCart();
    });
  }

  if (checkoutCartButton) {
    checkoutCartButton.addEventListener('click', finalizePurchase);
  }

  renderCart();
}

renderBranchSelector();
renderMenu();
initCart();
