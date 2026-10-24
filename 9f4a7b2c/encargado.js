/* Pantalla del encargado: carga el cierre del día. */
(async () => {
  const T = TAZ;
  const $ = (id) => document.getElementById(id);
  const user = await T.session('Encargado');
  if (!user) return;

  const fullName = [user.name, user.lastName].filter(Boolean).join(' ') || user.username;
  const myBranch = T.branch(user.branch);
  $('who').textContent = `${fullName}, sucursal ${myBranch}`;

  $('eSuc').innerHTML = T.BRANCHES.map((b) => `<option>${T.esc(b)}</option>`).join('');
  $('eSuc').value = myBranch;
  $('moneyFields').innerHTML = T.FIELDS.map(([k, l]) => `<label id="g_${k}">${l}<input id="f_${k}" inputmode="decimal" placeholder="0"></label>`).join('');

  const typed = () => T.FIELDS.reduce((s, [k]) => s + T.amount($(`f_${k}`).value), 0);
  const paint = () => {
    const centro = $('eSuc').value === 'Centro'; // Tiraxy solo se usa en Centro
    $('g_tiraxy').hidden = !centro;
    if (!centro) $('f_tiraxy').value = '';
    $('eTotal').textContent = T.money(typed());
  };
  const now = () => {
    const d = new Date();
    $('eFecha').value = T.iso(d);
    $('eHora').value = d.toTimeString().slice(0, 5);
  };

  $('encForm').addEventListener('input', paint);
  $('eSuc').addEventListener('change', paint);

  $('encForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      fecha: $('eFecha').value, hora: $('eHora').value, sucursal: $('eSuc').value,
      notas: $('eNotas').value.trim(), stock: $('eStock').value.trim()
    };
    T.FIELDS.forEach(([k]) => { body[k] = T.amount($(`f_${k}`).value); });
    if (!typed() && !(await T.ask('El total es $0. ¿Enviar el registro igual?', 'Enviar'))) return;

    $('send').disabled = true;
    try {
      const res = await T.api('/api/records', { method: 'POST', body });
      T.toast(res.duplicate ? res.message : (res.warning || 'Registro enviado.'), res.duplicate || res.warning ? 'warn' : 'ok');
      $('encForm').reset();
      $('eSuc').value = myBranch;
      now(); paint();
    } catch (err) {
      T.toast(`No se pudo enviar: ${err.message}`, 'error');
    } finally {
      $('send').disabled = false;
    }
  });

  $('logout').addEventListener('click', T.logout);
  now(); paint();
})();
