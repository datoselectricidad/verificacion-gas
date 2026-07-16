/* ==========================================================================
   ui.js — Helpers de interfaz y renderizado del resultado
   ========================================================================== */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const fx = (v, d = 1) => (isNaN(v) || v === null) ? '—' : v.toFixed(d);

  function guiaDispositivo(tipoEquipo) {
    // Sugerencia del dispositivo más probable segun tipo
    const t = tipoEquipo || '';
    if (/capilar/i.test(t)) return 'capilar';
    if (/VRF|Aerotermia|Chiller/i.test(t)) return 'eev';
    if (/comercial|Cámara/i.test(t)) return 'txv';
    if (/Split|Cassette|Conductos/i.test(t)) return 'txv';
    return 'txv';
  }

  function textoGuiaDispositivo(tipoEquipo) {
    const sug = guiaDispositivo(tipoEquipo);
    const nombres = { txv: 'TXV (termostática)', eev: 'EEV (electrónica)', capilar: 'Capilar' };
    return 'Guía: en un «' + tipoEquipo + '» lo más habitual es ' + nombres[sug] +
           '. El capilar es un tubo fino largo sin bulbo; la TXV tiene bulbo en la aspiración; la EEV es una válvula con conexión eléctrica (motor paso a paso).';
  }

  function renderResultado(box, calc, diag, avisos, meta, carga, desv) {
    const g = diag.gravedad;
    let causasHTML = diag.causas.map(c =>
      `<div class="causa"><span>${c.texto}</span><span class="stars">${c.estrellas}</span></div>`).join('');
    let accHTML = diag.acciones.map(a => `<li>${a}</li>`).join('');
    let avisosHTML = avisos.length
      ? `<div class="note warn">⚠️ ${avisos.join('<br>⚠️ ')}</div>` : '';

    let mezclaNota = (meta && meta.glide_K > 1)
      ? `<div class="note">Mezcla zeotropa (glide ≈ ${meta.glide_K} K): recalentamiento calculado con punto de rocío (dew) y subenfriamiento con punto de burbuja (bubble).</div>`
      : '';

    let extrapNota = calc.extrapolado
      ? `<div class="note warn">Alguna presión queda fuera del rango de la tabla P/T: valor extrapolado, fiabilidad reducida.</div>` : '';

    // Bloque de carga nominal (exacta) + desvío (estimado)
    let bloqueCarga = '';
    if (carga && carga.total) {
      const det = carga.tramos.map(t =>
        `<div class="metric"><span>Ø${t.mm} mm · ${t.len} m × ${fx(t.gm)} g/m</span><b>${Math.round(t.gramos)} g</b></div>`).join('');
      const freeNota = carga.free > 0
        ? `<div class="metric"><span>Descuento ${carga.free} m sin recarga</span><b>−${Math.round(carga.tramos.reduce((s,t)=>s+t.gramos,0) - carga.extra)} g</b></div>` : '';
      bloqueCarga = `
        <h2 style="margin-top:16px">Carga de refrigerante</h2>
        <div class="metric"><span>Carga base de fábrica</span><b>${Math.round(carga.base)} g</b></div>
        ${det}
        ${freeNota}
        <div class="metric"><span>Recarga por tuberías (neta)</span><b>${Math.round(carga.extra)} g</b></div>
        ${carga.extraUds ? `<div class="metric"><span>Ajuste unidades interiores</span><b>${Math.round(carga.extraUds)} g</b></div>` : ''}
        <div class="metric"><span><b>CARGA NOMINAL (debería tener)</b></span><b class="big">${Math.round(carga.total)} g</b></div>
        <div class="hint">Cálculo exacto: base de placa + recarga por metros de línea de líquido${carga.free > 0 ? ', descontados los ' + carga.free + ' m incluidos de fábrica' : ''}.</div>`;
    }
    let bloqueDesvio = '';
    if (desv && desv.texto) {
      bloqueDesvio = `
        <h2 style="margin-top:16px">Desvío de carga (estimación)</h2>
        <div class="note" style="border:1px solid var(--accent);color:var(--txt);font-size:.95rem;font-weight:700">${desv.texto}</div>
        <div class="note warn">La cantidad real solo se conoce pesando. El rango procede del desvío del ${desv.param || 'parámetro de control'} respecto a su objetivo.</div>`;
    }

    box.innerHTML = `
      <div class="verdict g-${g}">${diag.color} ${diag.titulo}<br><span style="font-size:.8rem;font-weight:600">Gravedad: ${g}</span></div>

      <div class="metric"><span>Refrigerante</span><b>${calc.ref}</b></div>
      <div class="metric"><span>Temp. evaporación</span><b>${fx(calc.tEvap)} °C</b></div>
      <div class="metric"><span>Temp. condensación</span><b>${fx(calc.tCond)} °C</b></div>
      <div class="metric"><span>Recalentamiento (SH)</span><b>${fx(calc.superheat)} K</b></div>
      <div class="metric"><span>Subenfriamiento (SC)</span><b>${fx(calc.subcooling)} K</b></div>
      <div class="metric"><span>Lift térmico</span><b>${fx(calc.lift)} K</b></div>
      <div class="metric"><span>ΔT evaporador</span><b>${fx(calc.dtEvap)} K</b></div>
      <div class="metric"><span>ΔT condensador</span><b>${fx(calc.dtCond)} K</b></div>

      <h2 style="margin-top:16px">Posibles causas</h2>
      ${causasHTML}

      <h2 style="margin-top:16px">Acciones recomendadas</h2>
      <ul class="acc">${accHTML}</ul>

      ${bloqueCarga}
      ${bloqueDesvio}

      ${avisosHTML}${mezclaNota}${extrapNota}

      <div class="row" style="margin-top:14px">
        <button class="btn-sec" id="btnPdf" style="flex:1">🖨️ Informe PDF</button>
        <button class="btn-sec" id="btnCompartir" style="flex:1">📤 Compartir</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn-sec" id="btnNuevo" style="flex:1">Nuevo diagnóstico</button>
        <button class="btn-primary" id="btnGuardar" style="margin-top:0;flex:1">Guardar</button>
      </div>

      <div class="note warn" style="margin-top:14px">Ayuda al diagnóstico basada en las mediciones introducidas. No sustituye los procedimientos del fabricante. Antes de añadir o recuperar refrigerante, verifica especificaciones, condiciones y normativa vigente.</div>
    `;
    box.classList.remove('hidden');
  }

  /* ---------- Tabla de referencia (Paso 3) ----------
     Ayuda visual: rango normal de SH/SC para el refrigerante y dispositivo
     de expansión seleccionados, antes de introducir ninguna medida. */
  function renderTablaReferencia(ref, dispositivo) {
    if (!ref || !global.Diagnosis) return '';
    const u = global.Diagnosis.umbrales(dispositivo);
    const m = global.PT ? global.PT.meta(ref) : null;
    const nombresDisp = { txv: 'TXV (termostática)', eev: 'EEV (electrónica)', capilar: 'capilar', desconocido: 'desconocido' };
    return `
      <table class="tabla-ref">
        <thead><tr><th>Parámetro (valores normales)</th><th>Rango correcto</th></tr></thead>
        <tbody>
          <tr><td>Recalentamiento (SH)</td><td>${u.shBajo}–${u.shAlto} K</td></tr>
          <tr><td>Subenfriamiento (SC)</td><td>${u.scBajo}–${u.scAlto} K</td></tr>
          ${m ? `<tr><td>Glide de ${ref}</td><td>${m.glide_K} K</td></tr>` : ''}
        </tbody>
      </table>
      <div class="hint">Rangos orientativos para <b>${ref}</b> con dispositivo de expansión «${nombresDisp[dispositivo] || dispositivo}». Úsalos como primera referencia visual; el fabricante del equipo prevalece siempre.</div>`;
  }

  /* ---------- Tabla comparativa (Paso 4) ----------
     Columna 1: valores correctos (de fábrica / de referencia).
     Columna 2: valores introducidos/calculados, en verde si están dentro
     de los valores correctos y en rojo si están fuera. */
  function renderTablaComparativa(d) {
    const filas = [];
    function fila(nombre, refTxt, valTxt, ok) {
      const cls = ok === null ? '' : (ok ? 'cmp-ok' : 'cmp-bad');
      filas.push(`<tr><td>${nombre}</td><td>${refTxt}</td><td class="${cls}">${valTxt}</td></tr>`);
    }

    const eq = d.equipoRef;
    let hayReferencia = false;

    if (eq && eq.cargaBase) {
      hayReferencia = true;
      const okBase = d.cBaseIntro != null && Math.abs(d.cBaseIntro - eq.cargaBase) <= eq.cargaBase * 0.05;
      fila('Carga base de fábrica', Math.round(eq.cargaBase) + ' g',
           d.cBaseIntro != null ? Math.round(d.cBaseIntro) + ' g' : '—',
           d.cBaseIntro != null ? okBase : null);
    }
    if (eq && eq.longitudSinRecarga != null) {
      hayReferencia = true;
      const okFree = d.cFreeIntro != null && d.cFreeIntro <= eq.longitudSinRecarga + 0.01;
      fila('Longitud máx. sin recarga', eq.longitudSinRecarga + ' m',
           d.cFreeIntro != null ? d.cFreeIntro + ' m' : '—',
           d.cFreeIntro != null ? okFree : null);
    }

    const okSH = d.shCalc != null && !isNaN(d.shCalc) ? (d.shCalc >= d.shObjetivo[0] && d.shCalc <= d.shObjetivo[1]) : null;
    fila('Recalentamiento (SH)', d.shObjetivo[0] + '–' + d.shObjetivo[1] + ' K',
         (d.shCalc != null && !isNaN(d.shCalc)) ? d.shCalc.toFixed(1) + ' K' : '—', okSH);

    const okSC = d.scCalc != null && !isNaN(d.scCalc) ? (d.scCalc >= d.scObjetivo[0] && d.scCalc <= d.scObjetivo[1]) : null;
    fila('Subenfriamiento (SC)', d.scObjetivo[0] + '–' + d.scObjetivo[1] + ' K',
         (d.scCalc != null && !isNaN(d.scCalc)) ? d.scCalc.toFixed(1) + ' K' : '—', okSC);

    const nota = hayReferencia
      ? '<div class="hint">Verde = dentro de los valores correctos de funcionamiento · Rojo = fuera de rango.</div>'
      : '<div class="hint">Sin ficha del equipo guardada: se muestran solo los rangos normales de SH/SC. Guarda la ficha en el paso 2 para comparar también la carga de fábrica.</div>';

    return `<table class="tabla-comp">
        <thead><tr><th></th><th>Valor correcto</th><th>Introducido / calculado</th></tr></thead>
        <tbody>${filas.join('')}</tbody>
      </table>${nota}`;
  }

  global.UI = { $, fx, guiaDispositivo, textoGuiaDispositivo, renderResultado, renderTablaReferencia, renderTablaComparativa };
})(window);
