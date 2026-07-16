/* ==========================================================================
   app.js — Orquestación del flujo, navegación y eventos
   ========================================================================== */
(function () {
  'use strict';
  const $ = UI.$;
  let ultimo = null;     // {calc, diag, carga, desv, entrada} para historial/PDF
  let TRAMOS = [];       // [{mm, len, gm}]
  let equipoActual = null; // ficha del equipo reconocida/guardada en EquipoDB
  let timerModelo = null;

  /* ---------- Init ---------- */
  async function init() {
    // Poblar refrigerantes
    const sel = $('ref');
    PT.LISTA.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r; sel.appendChild(o); });
    await PT.precargarTodos();
    actualizarRefInfo();
    actualizarGuiaDisp();
    registrarSW();
    net();

    // Checklist habilita paso 1
    document.querySelectorAll('#checklist input').forEach(c =>
      c.addEventListener('change', () => {
        const todos = [...document.querySelectorAll('#checklist input')].every(x => x.checked);
        $('btnPaso1').disabled = !todos;
      }));

    // Navegación de pasos
    $('btnPaso1').onclick = () => mostrarPaso(2);
    $('btnAtras2').onclick = () => mostrarPaso(1);
    $('btnPaso2').onclick = () => mostrarPaso(3);
    $('btnAtras3').onclick = () => mostrarPaso(2);
    $('btnPaso3').onclick = () => { if (validarPaso3()) mostrarPaso(4); };
    $('btnAtras4').onclick = () => mostrarPaso(3);
    $('btnCalcular').onclick = diagnosticar;

    // Carga: tramos
    poblarDiametros();
    $('btnAddTramo').onclick = addTramo;
    ['cBase','cFree','cExtraUds'].forEach(id => $(id).addEventListener('input', () => { pintarCarga(); renderComparativa(); }));
    renderTramos();

    // Ajustes
    cargarAjustes();
    $('btnGuardarSet').onclick = guardarAjustes;
    $('sLogo').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const d = await fileToDataURL(f);
      $('logoPrev').innerHTML = '<img src="' + d + '" style="max-height:60px;margin-top:8px;border-radius:8px">';
      $('logoPrev').dataset.logo = d;
    };

    $('ref').onchange = () => {
      actualizarRefInfo(); liveSat(); renderComparativa();
      // Los g/m dependen de la densidad del refrigerante: recalcular tramos.
      TRAMOS.forEach(t => t.gm = Charge.gPorMetro(t.mm, $('ref').value));
      renderTramos();
    };
    $('tipoEquipo').onchange = actualizarGuiaDisp;
    $('dispositivo').onchange = () => { actualizarRefInfo(); renderComparativa(); };
    ['pbaja','palta','ubaja','ualta','relbaja','relalta'].forEach(id => $(id).addEventListener('input', liveSat));

    // Reconocimiento de equipo por modelo (paso 1)
    ['modeloInt','modeloExt'].forEach(id => $(id).addEventListener('input', () => {
      clearTimeout(timerModelo);
      timerModelo = setTimeout(buscarEquipo, 500);
    }));
    $('btnGuardarFicha').onclick = () => guardarFicha(false);

    // Nav inferior
    document.querySelectorAll('.nav button').forEach(b =>
      b.onclick = () => cambiarVista(b.dataset.view, b));

    // Historial / conversor
    $('btnVaciar').onclick = async () => { if (confirm('¿Vaciar todo el historial?')) { await Storage.vaciar(); pintarHist(); } };
    ['cvP','cvPu'].forEach(id => $(id).addEventListener('input', convP));
    ['cvT','cvTu'].forEach(id => $(id).addEventListener('input', convT));

    // Dialogo guardar
    $('gCancel').onclick = () => $('dlgGuardar').close();
    $('gOk').onclick = guardarIntervencion;

    window.addEventListener('online', net);
    window.addEventListener('offline', net);
  }

  function net() {
    const dot = $('netDot');
    if (navigator.onLine) { dot.classList.remove('off'); dot.title = 'En línea'; }
    else { dot.classList.add('off'); dot.title = 'Sin conexión (offline)'; }
  }

  function actualizarRefInfo() {
    const m = PT.meta($('ref').value);
    $('refInfo').textContent = m ? `${m.name} · ${m.type} · glide ${m.glide_K} K · ${m.safety_class}` : '';
    const box = $('tablaRefBox');
    if (box) box.innerHTML = UI.renderTablaReferencia($('ref').value, $('dispositivo').value);
  }
  function actualizarGuiaDisp() {
    $('dispGuia').textContent = UI.textoGuiaDispositivo($('tipoEquipo').value);
    // sugerir automáticamente si está en "desconocido"
    if ($('dispositivo').value === 'desconocido')
      $('dispositivo').value = UI.guiaDispositivo($('tipoEquipo').value);
  }

  function mostrarPaso(n) {
    [1,2,3,4].forEach(i => $('paso' + i).classList.toggle('hidden', i !== n));
    $('resultado').classList.add('hidden');
    document.querySelectorAll('#steps .s').forEach((s, i) => s.classList.toggle('on', i < n));
    if (n === 3) actualizarRefInfo();
    if (n === 4) { pintarCarga(); renderComparativa(); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Reconocimiento de equipo (EquipoDB) ---------- */
  function buscarEquipo() {
    const mi = $('modeloInt').value.trim();
    const me = $('modeloExt').value.trim();
    const hint = $('equipoLookupHint');
    if (!mi && !me) { hint.innerHTML = ''; equipoActual = null; return; }
    hint.textContent = 'Buscando en nuestra base de datos…';
    EquipoDB.buscar(me || mi, mi, me).then(rec => {
      if (rec) {
        equipoActual = rec;
        const fecha = rec.fecha ? new Date(rec.fecha).toLocaleDateString('es-ES') : '';
        hint.innerHTML = '✅ Equipo reconocido' + (fecha ? ' (ficha guardada el ' + fecha + ')' : '') +
          '. Datos rellenados en el paso 2.';
        if (rec.tipoMaquina) $('tipoEquipo').value = rec.tipoMaquina;
        if (rec.refrigerante) $('ref').value = rec.refrigerante;
        if (rec.dispositivo) $('dispositivo').value = rec.dispositivo;
        if (rec.fabricante) $('fabricante').value = rec.fabricante;
        if (rec.cargaBase != null) $('cBase').value = rec.cargaBase;
        if (rec.longitudSinRecarga != null) $('cFree').value = rec.longitudSinRecarga;
        actualizarRefInfo(); actualizarGuiaDisp(); pintarCarga(); renderComparativa();
      } else {
        equipoActual = null;
        const q = encodeURIComponent(((me || '') + ' ' + (mi || '')).trim() + ' ficha técnica refrigerante carga gas');
        hint.innerHTML = 'No encontrado en nuestra base de datos. ' +
          '<a href="https://www.google.com/search?q=' + q + '" target="_blank" rel="noopener">Buscar en internet ↗</a>' +
          ' e introduce los datos manualmente en el paso 2 (luego pulsa «Guardar ficha del equipo»).';
      }
    }).catch(() => { hint.textContent = ''; });
  }

  function fichaDesdeFormulario() {
    const mi = $('modeloInt').value.trim();
    const me = $('modeloExt').value.trim();
    if (!mi && !me) return null;
    return {
      modelo: (me || mi).toUpperCase(),
      modeloInterior: mi, modeloExterior: me,
      fabricante: $('fabricante').value.trim(),
      tipoMaquina: $('tipoEquipo').value,
      refrigerante: $('ref').value,
      dispositivo: $('dispositivo').value,
      cargaBase: parseFloat($('cBase').value) || null,
      longitudSinRecarga: ($('cFree').value !== '' ? parseFloat($('cFree').value) : null),
      fecha: new Date().toISOString(),
      fuente: 'manual'
    };
  }
  async function guardarFicha(silencioso) {
    const rec = fichaDesdeFormulario();
    if (!rec) {
      if (!silencioso) alert('Indica al menos el modelo de la unidad interior o exterior en el paso 1 para poder guardar la ficha.');
      return;
    }
    await EquipoDB.guardar(rec);
    equipoActual = rec;
    const hint = $('fichaHint');
    if (hint) hint.textContent = '✅ Ficha guardada en nuestra base de datos. La próxima vez que introduzcas este modelo se rellenará automáticamente.';
    renderComparativa();
  }

  /* ---------- Vista previa en vivo de SH/SC (para la tabla comparativa) ---------- */
  function previewCalc() {
    const pBajaAbs = PT.aBarAbs(parseFloat($('pbaja').value), $('ubaja').value, $('relbaja').checked);
    const pAltaAbs = PT.aBarAbs(parseFloat($('palta').value), $('ualta').value, $('relalta').checked);
    const tAsp = parseFloat($('tasp').value), tLiq = parseFloat($('tliq').value);
    if (isNaN(pBajaAbs) || isNaN(pAltaAbs) || isNaN(tAsp) || isNaN(tLiq)) return null;
    try {
      return Calculator.calcular({
        ref: $('ref').value, dispositivo: $('dispositivo').value,
        pBaja: parseFloat($('pbaja').value), unidadBaja: $('ubaja').value, relativaBaja: $('relbaja').checked,
        pAlta: parseFloat($('palta').value), unidadAlta: $('ualta').value, relativaAlta: $('relalta').checked,
        tAsp, tLiq, tExt: parseFloat($('text').value), tInt: parseFloat($('tint').value)
      });
    } catch (e) { return null; }
  }

  function renderComparativa() {
    const box = $('tablaCompBox');
    if (!box) return;
    const u = Diagnosis.umbrales($('dispositivo').value);
    const calc = previewCalc();
    const c = cargaActual();
    box.innerHTML = UI.renderTablaComparativa({
      equipoRef: equipoActual,
      cBaseIntro: $('cBase').value !== '' ? parseFloat($('cBase').value) : null,
      cFreeIntro: $('cFree').value !== '' ? parseFloat($('cFree').value) : null,
      cargaNominal: c ? c.total : null,
      shObjetivo: [u.shBajo, u.shAlto], scObjetivo: [u.scBajo, u.scAlto],
      shCalc: calc ? calc.superheat : null, scCalc: calc ? calc.subcooling : null
    });
  }

  /* ---------- Paso 4: tramos y carga ---------- */
  function poblarDiametros() {
    const sel = $('tDiam');
    sel.innerHTML = '';
    Charge.TUBO.forEach(t => {
      const o = document.createElement('option');
      o.value = t.mm; o.textContent = `${t.pulg} (${t.mm} mm)`;
      sel.appendChild(o);
    });
  }
  function addTramo() {
    const mm = parseFloat($('tDiam').value);
    const len = parseFloat($('tLen').value);
    if (isNaN(len) || len <= 0) { alert('Indica los metros del tramo.'); return; }
    TRAMOS.push({ mm, len, gm: Charge.gPorMetro(mm, $('ref').value) });
    $('tLen').value = '';
    renderTramos();
  }
  window.__delTramo = i => { TRAMOS.splice(i, 1); renderTramos(); };
  window.__setGm = (i, v) => { TRAMOS[i].gm = parseFloat(v); pintarCarga(); };

  function renderTramos() {
    const box = $('tramos');
    if (!TRAMOS.length) { box.innerHTML = '<div class="hint" style="padding:6px 0">Sin tramos añadidos.</div>'; pintarCarga(); return; }
    box.innerHTML = TRAMOS.map((t, i) => `
      <div class="metric">
        <span>Ø${t.mm} mm · ${t.len} m</span>
        <b>
          <input type="number" value="${t.gm != null ? t.gm.toFixed(1) : ''}" onchange="__setGm(${i},this.value)"
                 style="width:78px;display:inline-block;padding:5px;font-size:.85rem;text-align:right"> g/m
          <button class="btn-sec" style="padding:3px 9px;margin-left:6px" onclick="__delTramo(${i})">✕</button>
        </b>
      </div>`).join('');
    pintarCarga();
  }

  function cargaActual() {
    return Charge.nominal({
      base: $('cBase').value, free: $('cFree').value,
      tramos: TRAMOS, ref: $('ref').value, extraUds: $('cExtraUds').value
    });
  }
  function pintarCarga() {
    const c = cargaActual();
    const box = $('cargaBox');
    if (!c) { box.innerHTML = '<span class="pill">Carga base pendiente</span> Sin la carga base de fábrica el diagnóstico se dará en % en vez de gramos.'; return; }
    box.innerHTML = `Base <b>${Math.round(c.base)} g</b> + tuberías <b>${Math.round(c.extra)} g</b>${c.extraUds ? ' + uds. <b>' + Math.round(c.extraUds) + ' g</b>' : ''}
      <div class="big">Carga nominal ≈ ${Math.round(c.total)} g (${(c.total/1000).toFixed(2)} kg)</div>`;
  }

  function validarPaso3() {
    const pBajaAbs = PT.aBarAbs(parseFloat($('pbaja').value), $('ubaja').value, $('relbaja').checked);
    const pAltaAbs = PT.aBarAbs(parseFloat($('palta').value), $('ualta').value, $('relalta').checked);
    const val = Validation.validar({ pBajaAbs, pAltaAbs, tAsp: parseFloat($('tasp').value),
      tLiq: parseFloat($('tliq').value), tExt: parseFloat($('text').value), tInt: parseFloat($('tint').value) });
    $('errores').innerHTML = val.ok ? '' : '<div class="err">' + val.errores.join('<br>') + '</div>';
    return val.ok;
  }

  /* ---------- Ajustes ---------- */
  function cargarAjustes() {
    const s = Settings.leer();
    ['tecnico','empresa','nif','telefono','email','carnet'].forEach(k => {
      const el = $('s' + k.charAt(0).toUpperCase() + k.slice(1));
      if (el) el.value = s[k] || '';
    });
    if (s.logo) $('logoPrev').innerHTML = '<img src="' + s.logo + '" style="max-height:60px;margin-top:8px;border-radius:8px">';
    if (s.logo) $('logoPrev').dataset.logo = s.logo;
  }
  function guardarAjustes() {
    const s = {
      tecnico: $('sTecnico').value, empresa: $('sEmpresa').value, nif: $('sNif').value,
      telefono: $('sTelefono').value, email: $('sEmail').value, carnet: $('sCarnet').value,
      logo: $('logoPrev').dataset.logo || ''
    };
    Settings.guardar(s);
    alert('Datos guardados. Aparecerán en la cabecera de los informes.');
  }

  function datosInforme() {
    if (!ultimo) return null;
    return {
      emp: Settings.leer(),
      cli: {
        cliente: $('gCliente').value, ubicacion: $('gUbic').value,
        modelo: $('gModelo').value, fabricante: $('gFab').value,
        tipoEquipo: $('tipoEquipo').value,
        dispositivo: $('dispositivo').selectedOptions[0].textContent
      },
      calc: ultimo.calc, diag: ultimo.diag, carga: ultimo.carga, desv: ultimo.desv,
      obs: $('gObs').value, foto: ultimo.foto || null,
      fecha: new Date().toLocaleString('es-ES')
    };
  }

  /* ---------- Saturación en vivo ---------- */
  function barAbsDe(idP, idU, idR) {
    const v = parseFloat($(idP).value);
    if (isNaN(v)) return NaN;
    return PT.aBarAbs(v, $(idU).value, $(idR).checked);
  }
  function liveSat() {
    const ref = $('ref').value;
    try {
      const bb = barAbsDe('pbaja','ubaja','relbaja');
      const ba = barAbsDe('palta','ualta','relalta');
      $('satBaja').textContent = isNaN(bb) ? '' : 'T. evaporación (dew) ≈ ' + PT.tDew(ref, bb).temp.toFixed(1) + ' °C';
      $('satAlta').textContent = isNaN(ba) ? '' : 'T. condensación (bubble) ≈ ' + PT.tBubble(ref, ba).temp.toFixed(1) + ' °C';
    } catch (e) { /* tabla no cargada aún */ }
  }

  /* ---------- Diagnóstico ---------- */
  function diagnosticar() {
    const ref = $('ref').value;
    const dispositivo = $('dispositivo').value;
    const entrada = {
      ref, dispositivo,
      pBaja: parseFloat($('pbaja').value), unidadBaja: $('ubaja').value, relativaBaja: $('relbaja').checked,
      pAlta: parseFloat($('palta').value), unidadAlta: $('ualta').value, relativaAlta: $('relalta').checked,
      tAsp: parseFloat($('tasp').value), tLiq: parseFloat($('tliq').value),
      tExt: parseFloat($('text').value), tInt: parseFloat($('tint').value)
    };

    const pBajaAbs = PT.aBarAbs(entrada.pBaja, entrada.unidadBaja, entrada.relativaBaja);
    const pAltaAbs = PT.aBarAbs(entrada.pAlta, entrada.unidadAlta, entrada.relativaAlta);
    const val = Validation.validar({ pBajaAbs, pAltaAbs, tAsp: entrada.tAsp, tLiq: entrada.tLiq, tExt: entrada.tExt, tInt: entrada.tInt });

    const errBox = $('errores');
    if (!val.ok) {
      errBox.innerHTML = '<div class="err">' + val.errores.join('<br>') + '</div>';
      return;
    }
    errBox.innerHTML = '';

    const calc = Calculator.calcular(entrada);
    const diag = Diagnosis.diagnosticar(calc, dispositivo);
    const avisos = Validation.coherencia(calc);
    const carga = cargaActual();
    const desv = Charge.desvio(calc, diag, dispositivo, carga ? carga.total : null, $('esVRF').checked);
    ultimo = { calc, diag, entrada, carga, desv };

    // Guardar/actualizar automáticamente la ficha del equipo si se indicó un modelo,
    // para reconocerlo la próxima vez sin tener que volver a introducir sus datos.
    guardarFicha(true);

    UI.renderResultado($('resultado'), calc, diag, avisos, PT.meta(ref), carga, desv);
    $('btnNuevo').onclick = () => { mostrarPaso(1); resetChecklist(); };
    $('btnGuardar').onclick = () => $('dlgGuardar').showModal();
    $('btnPdf').onclick = () => Report.abrirImprimible(datosInforme());
    $('btnCompartir').onclick = async () => {
      const r = await Report.compartir(datosInforme());
      if (r === 'portapapeles') alert('Resumen copiado al portapapeles: pégalo en WhatsApp o el correo.');
      else if (r === 'no') alert('Este navegador no permite compartir. Usa «Informe PDF» y adjunta el archivo.');
    };
    window.scrollTo({ top: 99999, behavior: 'smooth' });
  }

  function resetChecklist() {
    document.querySelectorAll('#checklist input').forEach(c => c.checked = false);
    $('btnPaso1').disabled = true;
  }

  /* ---------- Guardar intervención ---------- */
  async function guardarIntervencion() {
    if (!ultimo) return;
    const foto = $('gFoto').files[0];
    const dataURL = foto ? await fileToDataURL(foto) : null;
    if (dataURL) ultimo.foto = dataURL;   // disponible para el PDF
    const c = ultimo.calc, d = ultimo.diag;
    const reg = {
      fecha: new Date().toISOString(),
      cliente: $('gCliente').value, ubicacion: $('gUbic').value,
      modelo: $('gModelo').value, fabricante: $('gFab').value,
      refrigerante: c.ref,
      pBajaAbs: c.pBajaAbs, pAltaAbs: c.pAltaAbs,
      tAsp: c.tAsp, tLiq: c.tLiq,
      sh: c.superheat, sc: c.subcooling,
      diagnostico: d.titulo, gravedad: d.gravedad,
      cargaNominal: ultimo.carga ? Math.round(ultimo.carga.total) : null,
      desvio: ultimo.desv ? ultimo.desv.texto : null,
      observaciones: $('gObs').value, foto: dataURL
    };
    await Storage.guardar(reg);
    $('dlgGuardar').close();
    ['gCliente','gUbic','gModelo','gFab','gObs'].forEach(id => $(id).value = '');
    $('gFoto').value = '';
    alert('Intervención guardada en el historial.');
  }
  function fileToDataURL(file) {
    return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
  }

  /* ---------- Vistas ---------- */
  function cambiarVista(v, btn) {
    ['Diag','Hist','Conv','Set'].forEach(x => $('view' + x).classList.toggle('hidden', x !== v));
    $('steps').classList.toggle('hidden', v !== 'Diag');
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b === btn));
    if (v === 'Hist') pintarHist();
  }

  async function pintarHist() {
    const cont = $('histList');
    const items = await Storage.listar();
    if (!items.length) { cont.innerHTML = '<div class="hint">Sin intervenciones guardadas.</div>'; return; }
    cont.innerHTML = items.map(it => `
      <div class="hist-item">
        <div class="h"><span>${new Date(it.fecha).toLocaleString()}</span><span>${it.refrigerante}</span></div>
        <div style="font-weight:700;margin-top:4px">${it.diagnostico} <span class="pill">${it.gravedad}</span></div>
        <div class="hint">${it.cliente || ''} ${it.ubicacion ? '· ' + it.ubicacion : ''} ${it.modelo ? '· ' + it.modelo : ''}</div>
        <div class="metric"><span>SH / SC</span><b>${it.sh.toFixed(1)} / ${it.sc.toFixed(1)} K</b></div>
        ${it.cargaNominal ? '<div class="metric"><span>Carga nominal</span><b>' + it.cargaNominal + ' g</b></div>' : ''}
        ${it.desvio ? '<div class="hint">' + it.desvio + '</div>' : ''}
        ${it.observaciones ? '<div class="hint">' + it.observaciones + '</div>' : ''}
        ${it.foto ? '<img src="' + it.foto + '" alt="foto">' : ''}
        <button class="btn-sec" style="margin-top:8px" onclick="window.__borrar(${it.id})">Borrar</button>
      </div>`).join('');
  }
  window.__borrar = async id => { await Storage.borrar(id); pintarHist(); };

  /* ---------- Conversor ---------- */
  function convP() {
    const v = parseFloat($('cvP').value), u = $('cvPu').value;
    if (isNaN(v)) { $('cvPout').textContent = '—'; return; }
    const bar = PT.aBarAbs(v, u, false); // tratar como absoluto para conversión pura
    $('cvPout').innerHTML = `${bar.toFixed(3)} bar · ${(bar*14.5038).toFixed(2)} psi · ${(bar*100).toFixed(1)} kPa · ${(bar/10).toFixed(4)} MPa`;
  }
  function convT() {
    const v = parseFloat($('cvT').value), u = $('cvTu').value;
    if (isNaN(v)) { $('cvTout').textContent = '—'; return; }
    if (u === '°C') $('cvTout').textContent = `${v} °C = ${(v*9/5+32).toFixed(1)} °F`;
    else $('cvTout').textContent = `${v} °F = ${((v-32)*5/9).toFixed(1)} °C`;
  }

  /* ---------- Service worker ---------- */
  function registrarSW() {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
