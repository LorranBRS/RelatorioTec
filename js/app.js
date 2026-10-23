(() => {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => {
    const keys = p.split('.');
    const last = keys.pop();
    keys.reduce((a, k) => (a[k] ??= {}), o)[last] = v;
  };

  // ---------------- dados fixos ----------------
  const SERVICE_TYPES = {
    refrigeracao: 'Refrigeração e climatização',
    eletrica: 'Elétrica',
    mecanica: 'Mecânica',
    instalacao: 'Instalação',
    manutencao: 'Manutenção preventiva / corretiva',
    outro: 'Outro',
  };
  const PRESETS = {
    refrigeracao: [
      ['Pressão de sucção', 'psi'], ['Pressão de descarga', 'psi'],
      ['Temperatura de insuflamento', '°C'], ['Temperatura de retorno', '°C'],
      ['Superaquecimento', 'K'], ['Sub-resfriamento', 'K'],
      ['Corrente do compressor', 'A'], ['Tensão de alimentação', 'V'],
    ],
    eletrica: [
      ['Tensão F-N', 'V'], ['Tensão F-F', 'V'], ['Corrente', 'A'],
      ['Resistência de isolamento', 'MOhm'], ['Resistência de aterramento', 'Ohm'], ['Fator de potência', ''],
    ],
    mecanica: [
      ['Vibração', 'mm/s'], ['Temperatura do mancal', '°C'], ['Rotação', 'rpm'],
      ['Folga', 'mm'], ['Torque de aperto', 'N·m'],
    ],
    instalacao: [
      ['Tensão', 'V'], ['Corrente', 'A'], ['Comprimento de tubulação/cabo', 'm'], ['Nivelamento', 'mm/m'],
    ],
    manutencao: [
      ['Horímetro', 'h'], ['Temperatura de operação', '°C'], ['Pressão de operação', 'bar'], ['Corrente', 'A'],
    ],
    outro: [],
  };
  const CATEGORIES = ['Antes', 'Depois', 'Equipamento', 'Detalhe', 'Outro'];
  const DEFAULT_SETTINGS = {
    company: '', cnpj: '', phone: '', email: '', address: '', logo: '', color: '#165da0',
    footer: '', techName: '', techReg: '', techSignature: '',
  };

  let settings = { ...DEFAULT_SETTINGS };
  let current = null;
  let saveTimer = null;
  let sigClient, sigTech;
  let draftTechSig = '';

  function blankReport() {
    return {
      id: uid(), number: null, createdAt: Date.now(), updatedAt: Date.now(),
      date: today(), serviceType: 'refrigeracao', status: 'Concluído',
      client: { name: '', doc: '', phone: '', email: '', address: '' },
      equipment: { type: '', brand: '', model: '', serial: '', location: '' },
      service: { request: '', diagnosis: '', executed: '', materials: '', recommendations: '' },
      tech: { name: settings.techName, reg: settings.techReg, start: '', end: '' },
      photos: [], measurements: [], notes: '',
      signature: { data: '', name: '' },
      deliveries: [],
    };
  }

  // Relatório "vazio" não é gravado no histórico
  const isEmpty = r =>
    ![r.client, r.equipment, r.service].some(o => Object.values(o).some(v => v && String(v).trim())) &&
    !r.photos.length && !r.measurements.length && !r.notes.trim() && !r.signature.data;

  // ---------------- UI utilitários ----------------
  let toastTimer;
  function toast(msg, ms = 2800) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function setSaveState(text) { $('#saveState').textContent = text; }

  function switchTab(name) {
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    if (name === 'historico') renderHistory();
    if (name === 'finalizar') renderChecklist();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function updateHeader() {
    const name = current.client.name ? ` · ${current.client.name}` : '';
    $('#hdrNumber').textContent = (current.number || 'Novo relatório') + name;
  }

  // ---------------- salvar ----------------
  function scheduleSave() {
    setSaveState('Editando…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 700);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    if (isEmpty(current)) { setSaveState(''); return; }
    if (!current.number) current.number = await DB.nextNumber();
    current.updatedAt = Date.now();
    try {
      await DB.putReport(current);
      await DB.set('currentId', current.id);
      setSaveState('Salvo ✓');
    } catch (e) {
      console.error(e);
      setSaveState('Erro ao salvar');
      toast('Não foi possível salvar. O armazenamento do navegador pode estar cheio.');
    }
    updateHeader();
  }

  // ---------------- formulário ----------------
  function fillForm() {
    $$('[data-bind]').forEach(el => { el.value = getPath(current, el.dataset.bind) ?? ''; });
    renderPhotos();
    renderMeasurements();
    renderPreset();
    sigClient.load(current.signature.data);
    renderDeliveries();
    updateHeader();
  }

  function bindForm() {
    $$('[data-bind]').forEach(el => {
      el.addEventListener('input', () => {
        setPath(current, el.dataset.bind, el.value);
        if (el.dataset.bind === 'serviceType') renderPreset();
        if (el.dataset.bind === 'client.name') updateHeader();
        scheduleSave();
      });
    });
  }

  async function openReport(r) {
    await saveNow();
    current = migrate(r);
    fillForm();
    await DB.set('currentId', current.id);
    setSaveState('');
  }

  // Garante campos novos em relatórios antigos/importados
  function migrate(r) {
    const base = blankReport();
    const out = { ...base, ...r };
    for (const k of ['client', 'equipment', 'service', 'tech', 'signature']) out[k] = { ...base[k], ...(r[k] || {}) };
    out.photos = r.photos || [];
    out.measurements = r.measurements || [];
    out.deliveries = r.deliveries || [];
    return out;
  }

  async function newReport() {
    await saveNow();
    current = blankReport();
    fillForm();
    switchTab('dados');
    $('#clientName').focus();
    toast('Novo relatório iniciado');
  }

  // ---------------- fotos ----------------
  async function addPhotos(files) {
    const cat = $('#newPhotoCat').value;
    let ok = 0;
    setSaveState('Processando fotos…');
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const img = await Images.compress(file);
        current.photos.push({ id: uid(), ...img, category: cat, caption: '' });
        ok++;
      } catch (e) {
        toast(`Não foi possível ler ${file.name}`);
      }
    }
    renderPhotos();
    if (ok) {
      toast(ok === 1 ? 'Foto adicionada' : `${ok} fotos adicionadas`);
      await saveNow();
    }
  }

  function renderPhotos() {
    const list = $('#photoList');
    list.innerHTML = current.photos.map((p, i) => `
      <div class="photo" data-id="${p.id}">
        <img src="${p.data}" alt="Foto ${i + 1}" loading="lazy">
        <div class="meta">
          <select data-f="category" aria-label="Categoria">
            ${CATEGORIES.map(c => `<option${c === p.category ? ' selected' : ''}>${c}</option>`).join('')}
          </select>
          <input data-f="caption" value="${esc(p.caption)}" placeholder="Legenda (ex.: serpentina obstruída)">
          <div class="tools">
            <button class="btn small" data-act="up" type="button" title="Mover para trás" ${i === 0 ? 'disabled' : ''}>←</button>
            <button class="btn small" data-act="down" type="button" title="Mover para frente" ${i === current.photos.length - 1 ? 'disabled' : ''}>→</button>
            <button class="btn small danger" data-act="del" type="button" title="Remover">Remover</button>
          </div>
        </div>
      </div>`).join('');
    $('#photoEmpty').hidden = current.photos.length > 0;

    const counts = CATEGORIES.map(c => [c, current.photos.filter(p => p.category === c).length]).filter(([, n]) => n);
    $('#photoSummary').innerHTML = counts.map(([c, n]) => `<span class="chip">${c}: ${n}</span>`).join('');
    const badge = $('#badgePhotos');
    badge.hidden = !current.photos.length;
    badge.textContent = current.photos.length;
  }

  function bindPhotos() {
    $('#newPhotoCat').innerHTML = CATEGORIES.map(c => `<option>${c}</option>`).join('');
    for (const id of ['#photoCamera', '#photoFiles']) {
      $(id).addEventListener('change', e => {
        addPhotos([...e.target.files]);
        e.target.value = '';
      });
    }
    const list = $('#photoList');
    list.addEventListener('input', e => {
      const card = e.target.closest('.photo');
      const f = e.target.dataset.f;
      if (!card || !f) return;
      const p = current.photos.find(x => x.id === card.dataset.id);
      p[f] = e.target.value;
      if (f === 'category') renderPhotos();
      scheduleSave();
    });
    list.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.closest('.photo').dataset.id;
      const i = current.photos.findIndex(x => x.id === id);
      const arr = current.photos;
      if (btn.dataset.act === 'del') {
        if (!confirm('Remover esta foto?')) return;
        arr.splice(i, 1);
      } else {
        const j = btn.dataset.act === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      renderPhotos();
      scheduleSave();
    });
  }

  // ---------------- medições ----------------
  function renderMeasurements() {
    $('#measBody').innerHTML = current.measurements.map((m, i) => `
      <tr data-i="${i}">
        <td><input data-f="name" value="${esc(m.name)}" placeholder="Grandeza" aria-label="Grandeza"></td>
        <td><input data-f="value" value="${esc(m.value)}" placeholder="Valor" inputmode="decimal" aria-label="Valor"></td>
        <td><input data-f="unit" value="${esc(m.unit)}" placeholder="Unid." aria-label="Unidade"></td>
        <td><input data-f="ref" value="${esc(m.ref)}" placeholder="Referência / obs." aria-label="Referência"></td>
        <td><button class="btn icon small danger" data-act="del" type="button" aria-label="Remover linha">✕</button></td>
      </tr>`).join('');
    $('#measEmpty').hidden = current.measurements.length > 0;
  }

  function renderPreset() {
    $('#presetName').textContent = SERVICE_TYPES[current.serviceType] || '';
    $('#btnPreset').disabled = !(PRESETS[current.serviceType] || []).length;
  }

  function bindMeasurements() {
    const body = $('#measBody');
    body.addEventListener('input', e => {
      const tr = e.target.closest('tr');
      if (!tr || !e.target.dataset.f) return;
      current.measurements[+tr.dataset.i][e.target.dataset.f] = e.target.value;
      scheduleSave();
    });
    body.addEventListener('click', e => {
      if (!e.target.closest('[data-act="del"]')) return;
      current.measurements.splice(+e.target.closest('tr').dataset.i, 1);
      renderMeasurements();
      scheduleSave();
    });
    $('#btnAddMeas').addEventListener('click', () => {
      current.measurements.push({ name: '', value: '', unit: '', ref: '' });
      renderMeasurements();
      $('#measBody tr:last-child input').focus();
    });
    $('#btnPreset').addEventListener('click', () => {
      const have = new Set(current.measurements.map(m => m.name.trim().toLowerCase()));
      const add = (PRESETS[current.serviceType] || []).filter(([n]) => !have.has(n.toLowerCase()));
      if (!add.length) { toast('As grandezas do modelo já estão na tabela'); return; }
      current.measurements.push(...add.map(([name, unit]) => ({ name, value: '', unit, ref: '' })));
      renderMeasurements();
      scheduleSave();
      toast(`${add.length} grandezas adicionadas — preencha os valores`);
    });
  }

  // ---------------- finalizar / PDF / entrega ----------------
  function renderChecklist() {
    const r = current;
    const n = c => r.photos.filter(p => p.category === c).length;
    const meas = r.measurements.filter(m => m.value).length;
    const items = [
      [!!r.client.name.trim(), 'Cliente identificado', r.client.name],
      [!!(r.equipment.type || r.equipment.model), 'Equipamento descrito', [r.equipment.type, r.equipment.model].filter(Boolean).join(' ')],
      [!!r.service.executed.trim(), 'Serviço executado descrito', ''],
      [r.photos.length > 0, `${r.photos.length} foto(s)`, `antes: ${n('Antes')} · depois: ${n('Depois')}`],
      [meas > 0, `${meas} medição(ões) com valor`, ''],
      [!!r.signature.data, 'Assinatura do cliente', r.signature.name],
      [!!settings.techSignature, 'Assinatura do técnico', settings.techSignature ? '' : 'cadastre em Configurações'],
      [!!settings.company, 'Dados da empresa no cabeçalho', settings.company || 'cadastre em Configurações'],
    ];
    $('#checklist').innerHTML = items.map(([ok, label, sub]) =>
      `<li class="${ok ? 'ok' : ''}"><span>${esc(label)} ${sub ? `<small>— ${esc(sub)}</small>` : ''}</span></li>`).join('');

    const canFiles = canShareFiles();
    $('#shareHint').textContent = canFiles
      ? 'No celular, "Compartilhar" e "WhatsApp" anexam o PDF diretamente na conversa.'
      : 'Neste navegador o PDF será baixado e a conversa/e-mail será aberto — basta anexar o arquivo baixado.';
  }

  function renderDeliveries() {
    const labels = { whatsapp: 'WhatsApp', email: 'E-mail', share: 'Compartilhado', download: 'PDF baixado' };
    $('#deliveries').innerHTML = (current.deliveries || []).slice(-5).reverse()
      .map(d => `<li>${labels[d.channel] || d.channel} em ${new Date(d.at).toLocaleString('pt-BR')}</li>`).join('');
  }

  async function logDelivery(channel) {
    current.deliveries.push({ channel, at: Date.now() });
    renderDeliveries();
    await saveNow();
  }

  const slug = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

  async function makePdf() {
    if (!current.client.name.trim()) {
      toast('Informe o nome do cliente antes de gerar o PDF');
      switchTab('dados');
      $('#clientName').focus();
      return null;
    }
    await saveNow();
    setSaveState('Gerando PDF…');
    await new Promise(r => setTimeout(r, 30)); // deixa a interface atualizar
    try {
      const doc = PDF.build(current, settings, SERVICE_TYPES[current.serviceType] || '');
      const blob = doc.output('blob');
      const name = `Relatorio_${current.number}_${slug(current.client.name)}.pdf`;
      setSaveState('Salvo ✓');
      return { blob, name, file: new File([blob], name, { type: 'application/pdf' }) };
    } catch (e) {
      console.error(e);
      setSaveState('');
      toast('Erro ao gerar o PDF: ' + e.message);
      return null;
    }
  }

  function download({ blob, name }) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function canShareFiles() {
    try {
      const f = new File(['x'], 'x.pdf', { type: 'application/pdf' });
      return !!(navigator.canShare && navigator.canShare({ files: [f] }));
    } catch { return false; }
  }

  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  function shareMessage() {
    const r = current;
    const tipo = (SERVICE_TYPES[r.serviceType] || 'serviço').toLowerCase();
    return `Olá, ${r.client.name}! Segue o relatório técnico ${r.number} referente ao serviço de ${tipo}` +
      `${r.equipment.type ? ` (${r.equipment.type})` : ''} realizado em ${PDF.fmtDate(r.date)}.` +
      `${settings.company ? `\n\n${settings.company}` : ''}${settings.phone ? ` · ${settings.phone}` : ''}`;
  }

  async function nativeShare(pdf) {
    try {
      await navigator.share({ files: [pdf.file], title: `Relatório ${current.number}`, text: shareMessage() });
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') toast('Não foi possível compartilhar: ' + e.message);
      return false;
    }
  }

  function waPhone(raw) {
    let d = (raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length <= 11) d = '55' + d.replace(/^0+/, ''); // número brasileiro sem DDI
    return d;
  }

  function bindFinalize() {
    sigClient = SignaturePad($('#sigClient'), data => {
      current.signature.data = data;
      scheduleSave();
    });
    $('#btnClearSig').addEventListener('click', () => sigClient.clear());

    $('#btnPreview').addEventListener('click', async () => {
      const win = window.open('', '_blank'); // abre antes do await para não ser bloqueado
      const pdf = await makePdf();
      if (!pdf) { win && win.close(); return; }
      const url = URL.createObjectURL(pdf.blob);
      if (win) win.location.href = url; else download(pdf);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    });

    $('#btnDownload').addEventListener('click', async () => {
      const pdf = await makePdf();
      if (!pdf) return;
      download(pdf);
      toast(`PDF salvo: ${pdf.name}`);
      logDelivery('download');
    });

    $('#btnShare').addEventListener('click', async () => {
      const pdf = await makePdf();
      if (!pdf) return;
      if (canShareFiles()) {
        if (await nativeShare(pdf)) logDelivery('share');
      } else {
        download(pdf);
        toast('Compartilhamento direto indisponível neste navegador — PDF baixado.');
      }
    });

    $('#btnWhats').addEventListener('click', async () => {
      const pdf = await makePdf();
      if (!pdf) return;
      if (canShareFiles() && isMobile()) {
        if (await nativeShare(pdf)) logDelivery('whatsapp');
        return;
      }
      download(pdf);
      const phone = waPhone(current.client.phone);
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(shareMessage())}`;
      window.open(url, '_blank');
      toast('PDF baixado. Anexe o arquivo na conversa do WhatsApp.', 5000);
      logDelivery('whatsapp');
    });

    $('#btnEmail').addEventListener('click', async () => {
      const pdf = await makePdf();
      if (!pdf) return;
      if (canShareFiles() && isMobile()) {
        if (await nativeShare(pdf)) logDelivery('email');
        return;
      }
      download(pdf);
      const subject = `Relatório técnico ${current.number}${settings.company ? ' - ' + settings.company : ''}`;
      location.href = `mailto:${encodeURIComponent(current.client.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareMessage() + '\n\n(PDF em anexo)')}`;
      toast('PDF baixado. Anexe o arquivo ao e-mail.', 5000);
      logDelivery('email');
    });
  }

  // ---------------- histórico ----------------
  async function renderHistory() {
    const q = $('#histSearch').value.trim().toLowerCase();
    const st = $('#histStatus').value;
    const all = (await DB.allReports()).sort((a, b) => b.updatedAt - a.updatedAt);
    const list = all.filter(r => {
      if (st && r.status !== st) return false;
      if (!q) return true;
      return [r.number, r.client?.name, r.client?.doc, r.equipment?.type, r.equipment?.model, r.equipment?.serial, r.equipment?.location]
        .some(v => (v || '').toLowerCase().includes(q));
    });
    $('#histEmpty').hidden = list.length > 0;
    $('#histEmpty').textContent = all.length ? 'Nenhum relatório encontrado com esse filtro.' : 'Nenhum relatório salvo ainda.';
    $('#histList').innerHTML = list.map(r => `
      <article class="hist-item${r.id === current.id ? ' current' : ''}" data-id="${r.id}">
        <div class="hist-top">
          <strong>${esc(r.client?.name || '(sem cliente)')}</strong>
          <span class="status" data-s="${esc(r.status)}">${esc(r.status)}</span>
        </div>
        <div class="hist-sub">
          ${esc(r.number || '')} · ${PDF.fmtDate(r.date)} · ${esc(SERVICE_TYPES[r.serviceType] || '')}
          ${r.equipment?.type ? ` · ${esc(r.equipment.type)}` : ''}
          · ${r.photos?.length || 0} foto(s)
          ${r.deliveries?.length ? ' · enviado' : ''}
        </div>
        <div class="hist-actions">
          <button class="btn small primary" data-act="open" type="button">Abrir</button>
          <button class="btn small" data-act="pdf" type="button">PDF</button>
          <button class="btn small" data-act="dup" type="button" title="Novo relatório com o mesmo cliente e equipamento">Duplicar</button>
          <button class="btn small ghost danger" data-act="del" type="button">Excluir</button>
        </div>
      </article>`).join('');
  }

  function bindHistory() {
    $('#histSearch').addEventListener('input', renderHistory);
    $('#histStatus').addEventListener('change', renderHistory);
    $('#histList').addEventListener('click', async e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.closest('.hist-item').dataset.id;
      const r = await DB.getReport(id);
      if (!r) return;
      switch (btn.dataset.act) {
        case 'open':
          await openReport(r);
          switchTab('dados');
          break;
        case 'pdf': {
          await openReport(r);
          const pdf = await makePdf();
          if (pdf) download(pdf);
          renderHistory();
          break;
        }
        case 'dup': {
          await saveNow();
          const copy = migrate(structuredClone(r));
          Object.assign(copy, {
            id: uid(), number: null, createdAt: Date.now(), updatedAt: Date.now(), date: today(),
            status: 'Concluído', photos: [], notes: '', deliveries: [],
            signature: { data: '', name: '' },
            service: { request: '', diagnosis: '', executed: '', materials: '', recommendations: '' },
            tech: { name: settings.techName || r.tech.name, reg: settings.techReg || r.tech.reg, start: '', end: '' },
            measurements: r.measurements.map(m => ({ ...m, value: '' })),
          });
          current = copy;
          fillForm();
          switchTab('dados');
          toast('Relatório duplicado: cliente e equipamento mantidos');
          break;
        }
        case 'del':
          if (!confirm(`Excluir o relatório ${r.number} de ${r.client.name || 'cliente sem nome'}? Esta ação não pode ser desfeita.`)) return;
          await DB.deleteReport(id);
          if (id === current.id) { current = blankReport(); fillForm(); }
          renderHistory();
          toast('Relatório excluído');
          break;
      }
    });
  }

  // ---------------- configurações ----------------
  function bindSettings() {
    const dlg = $('#dlgSettings');
    const logoPreview = () => {
      $('#logoPreview').hidden = !dlg._logo;
      $('#btnRemoveLogo').hidden = !dlg._logo;
      if (dlg._logo) $('#logoPreview').src = dlg._logo;
    };
    sigTech = SignaturePad($('#sigTech'), data => { draftTechSig = data; });

    $('#btnSettings').addEventListener('click', () => {
      $$('[data-set]').forEach(el => { el.value = settings[el.dataset.set] ?? ''; });
      dlg._logo = settings.logo;
      draftTechSig = settings.techSignature;
      logoPreview();
      dlg.showModal();
      sigTech.load(settings.techSignature);
    });

    $('#logoFile').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        dlg._logo = (await Images.compress(f, { max: 500, type: 'image/png' })).data;
        logoPreview();
      } catch { toast('Imagem do logotipo inválida'); }
      e.target.value = '';
    });
    $('#btnRemoveLogo').addEventListener('click', () => { dlg._logo = ''; logoPreview(); });
    $('#btnClearTechSig').addEventListener('click', () => sigTech.clear());

    $('#btnSaveSettings').addEventListener('click', async () => {
      $$('[data-set]').forEach(el => { settings[el.dataset.set] = el.value.trim(); });
      settings.logo = dlg._logo || '';
      settings.techSignature = draftTechSig;
      await DB.set('settings', settings);
      // preenche o técnico no relatório aberto se ainda estiver em branco
      if (!current.tech.name) current.tech.name = settings.techName;
      if (!current.tech.reg) current.tech.reg = settings.techReg;
      fillForm();
      toast('Configurações salvas');
    });

    $('#btnExport').addEventListener('click', async () => {
      const data = { app: 'RelatorioTec', version: 1, exportedAt: new Date().toISOString(), settings, seq: await DB.get('seq'), reports: await DB.allReports() };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      download({ blob, name: `backup_relatoriotec_${today()}.json` });
    });

    $('#importFile').addEventListener('change', async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (data.app !== 'RelatorioTec' || !Array.isArray(data.reports)) throw new Error('arquivo não é um backup do RelatórioTec');
        if (!confirm(`Importar ${data.reports.length} relatório(s)? Relatórios com o mesmo identificador serão substituídos.`)) return;
        for (const r of data.reports) await DB.putReport(migrate(r));
        const seq = (await DB.get('seq')) || {};
        for (const [y, n] of Object.entries(data.seq || {})) seq[y] = Math.max(seq[y] || 0, n);
        await DB.set('seq', seq);
        if (data.settings && !settings.company && confirm('Importar também as configurações da empresa?')) {
          settings = { ...DEFAULT_SETTINGS, ...data.settings };
          await DB.set('settings', settings);
        }
        dlg.close();
        toast(`${data.reports.length} relatório(s) importado(s)`);
        switchTab('historico');
      } catch (err) {
        toast('Falha na importação: ' + err.message, 5000);
      }
    });
  }

  // ---------------- início ----------------
  async function init() {
    $('#serviceType').innerHTML = Object.entries(SERVICE_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

    settings = { ...DEFAULT_SETTINGS, ...((await DB.get('settings')) || {}) };

    $$('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $$('[data-goto]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.goto)));
    $('#btnNew').addEventListener('click', newReport);

    bindForm();
    bindPhotos();
    bindMeasurements();
    bindFinalize();
    bindHistory();
    bindSettings();

    const lastId = await DB.get('currentId');
    const last = lastId && (await DB.getReport(lastId));
    current = last ? migrate(last) : blankReport();
    fillForm();

    // grava ao sair/minimizar o app
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  init().catch(e => {
    console.error(e);
    toast('Erro ao iniciar: ' + e.message, 8000);
  });
})();
