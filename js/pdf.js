// Montagem do PDF (A4, mm) com jsPDF + autoTable.
const PDF = (() => {
  const PAGE_W = 210;
  const PAGE_H = 297;
  const M = 14;               // margem lateral
  const CW = PAGE_W - 2 * M;  // largura útil
  const TOP = 18;             // topo das páginas seguintes
  const BOTTOM = PAGE_H - 18; // limite antes do rodapé
  const CATEGORY_ORDER = ['Antes', 'Depois', 'Equipamento', 'Detalhe', 'Outro'];

  // As fontes padrão do PDF usam Latin-1: troca o que estiver fora dele.
  const t = s => String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[ΩΩ]/g, 'Ohm')
    .replace(/…/g, '...')
    .replace(/[^\x00-\xFF]/g, '');

  const hexToRgb = hex => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return [22, 93, 160];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  const fmtDate = iso => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const imgFormat = data => (/^data:image\/png/.test(data) ? 'PNG' : 'JPEG');

  function build(r, s, serviceLabel) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const acc = hexToRgb(s.color);
    let y = 0;

    const ensure = h => {
      if (y + h > BOTTOM) { doc.addPage(); y = TOP; }
    };
    const tableDefaults = {
      margin: { left: M, right: M, top: TOP, bottom: PAGE_H - BOTTOM },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, textColor: [30, 30, 30], lineColor: [215, 220, 228], lineWidth: 0.2 },
    };

    // ---------- cabeçalho ----------
    const header = () => {
      const top = 12;
      let x = M;
      if (s.logo) {
        try {
          const p = doc.getImageProperties(s.logo);
          const h = 18;
          const w = Math.min(42, h * p.width / p.height);
          doc.addImage(s.logo, imgFormat(s.logo), M, top, w, h);
          x = M + w + 4;
        } catch (e) { /* logo inválido: ignora */ }
      }
      doc.setTextColor(25);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(t(s.company || 'Relatório Técnico'), x, top + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(95);
      const contact = [
        s.cnpj && `CNPJ ${s.cnpj}`,
        [s.phone, s.email].filter(Boolean).join('  |  '),
        s.address,
      ].filter(Boolean);
      contact.forEach((line, i) => doc.text(t(line), x, top + 10 + i * 3.8, { maxWidth: 110 }));

      const rx = PAGE_W - M;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...acc);
      doc.text('RELATÓRIO TÉCNICO', rx, top + 5, { align: 'right' });
      doc.setFontSize(10);
      doc.setTextColor(25);
      doc.text(t(`Nº ${r.number || '-'}`), rx, top + 10.5, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(95);
      doc.text(t(`Data: ${fmtDate(r.date)}   |   ${r.status}`), rx, top + 15, { align: 'right' });
      doc.text(t(serviceLabel), rx, top + 19, { align: 'right' });

      const lineY = top + 10 + Math.max(contact.length, 3) * 3.8 + 1;
      doc.setDrawColor(...acc);
      doc.setLineWidth(0.7);
      doc.line(M, lineY, PAGE_W - M, lineY);
      y = lineY + 8;
    };

    const title = text => {
      ensure(16);
      doc.setFillColor(...acc);
      doc.rect(M, y - 4.2, 2.2, 5.6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...acc);
      doc.text(t(text).toUpperCase(), M + 4.5, y);
      y += 4;
    };

    const kvTable = pairs => {
      const items = pairs.filter(([, v]) => v);
      if (!items.length) return false;
      const rows = [];
      for (let i = 0; i < items.length; i += 2) {
        const a = items[i];
        const b = items[i + 1];
        rows.push(b ? [t(a[0]), t(a[1]), t(b[0]), t(b[1])] : [t(a[0]), { content: t(a[1]), colSpan: 3 }]);
      }
      const lw = 28;
      const vw = CW / 2 - lw;
      doc.autoTable({
        ...tableDefaults,
        startY: y,
        body: rows,
        theme: 'grid',
        columnStyles: {
          0: { fontStyle: 'bold', fillColor: [244, 246, 249], cellWidth: lw },
          1: { cellWidth: vw },
          2: { fontStyle: 'bold', fillColor: [244, 246, 249], cellWidth: lw },
          3: { cellWidth: vw },
        },
      });
      y = doc.lastAutoTable.finalY + 8;
      return true;
    };

    const para = (label, text) => {
      if (!text || !String(text).trim()) return;
      ensure(12);
      if (label) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(80);
        doc.text(t(label), M, y);
        y += 4.6;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30);
      for (const ln of doc.splitTextToSize(t(text.trim()), CW)) {
        ensure(5);
        doc.text(ln, M, y);
        y += 4.6;
      }
      y += 3;
    };

    // ---------- conteúdo ----------
    header();

    title('Cliente');
    y += 1.5;
    kvTable([
      ['Nome', r.client.name], ['CPF/CNPJ', r.client.doc],
      ['Telefone', r.client.phone], ['E-mail', r.client.email],
      ['Endereço', r.client.address],
    ]);

    const eq = r.equipment;
    if (Object.values(eq).some(Boolean)) {
      title('Equipamento');
      y += 1.5;
      kvTable([
        ['Equipamento', eq.type], ['Marca', eq.brand], ['Modelo', eq.model],
        ['Nº série', eq.serial], ['Local', eq.location],
      ]);
    }

    const sv = r.service;
    if (Object.values(sv).some(v => v && v.trim())) {
      title('Atendimento');
      y += 4;
      para('Solicitação / problema relatado', sv.request);
      para('Diagnóstico', sv.diagnosis);
      para('Serviço executado', sv.executed);
      para('Materiais / peças utilizadas', sv.materials);
      para('Recomendações', sv.recommendations);
      y += 2;
    }

    const meas = r.measurements.filter(m => m.name || m.value);
    if (meas.length) {
      title('Medições');
      y += 1.5;
      doc.autoTable({
        ...tableDefaults,
        startY: y,
        theme: 'grid',
        head: [['Grandeza', 'Valor', 'Unidade', 'Referência / Obs.']],
        body: meas.map(m => [t(m.name), t(m.value), t(m.unit), t(m.ref)]),
        headStyles: { fillColor: acc, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 249, 251] },
        columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 26, halign: 'right' }, 2: { cellWidth: 22 } },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    if (r.notes && r.notes.trim()) {
      title('Observações');
      y += 4;
      para('', r.notes);
    }

    // ---------- fotos ----------
    if (r.photos.length) {
      title(`Evidências fotográficas (${r.photos.length})`);
      y += 3;
      const gap = 6;
      const cellW = (CW - gap) / 2;
      const boxH = cellW * 0.75;
      let n = 0;
      const groups = CATEGORY_ORDER
        .map(cat => [cat, r.photos.filter(p => (p.category || 'Outro') === cat)])
        .filter(([, list]) => list.length);

      for (const [cat, list] of groups) {
        ensure(10 + boxH);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(60);
        doc.text(t(cat), M, y + 1);
        y += 4;

        for (let i = 0; i < list.length; i += 2) {
          const row = list.slice(i, i + 2);
          doc.setFontSize(8.5);
          const caps = row.map(p => doc.splitTextToSize(t(`Foto ${++n}${p.caption ? ' - ' + p.caption : ''}`), cellW).slice(0, 3));
          const capH = Math.max(...caps.map(c => c.length)) * 3.6;
          ensure(boxH + capH + 6);
          row.forEach((p, j) => {
            const x = M + j * (cellW + gap);
            doc.setFillColor(245, 246, 248);
            doc.rect(x, y, cellW, boxH, 'F');
            const ratio = Math.min(cellW / p.w, boxH / p.h);
            const w = p.w * ratio;
            const h = p.h * ratio;
            try {
              doc.addImage(p.data, imgFormat(p.data), x + (cellW - w) / 2, y + (boxH - h) / 2, w, h, p.id, 'FAST');
            } catch (e) { /* imagem corrompida: deixa o quadro vazio */ }
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(70);
            doc.text(caps[j], x, y + boxH + 4);
          });
          y += boxH + capH + 6;
        }
        y += 2;
      }
    }

    // ---------- assinaturas ----------
    ensure(48);
    y += 6;
    title('Assinaturas');
    y += 4;
    const sigW = (CW - 16) / 2;
    const sigH = sigW / 3;
    const sigs = [
      { img: s.techSignature, name: r.tech.name, sub: ['Técnico responsável', r.tech.reg].filter(Boolean).join(' - ') },
      { img: r.signature.data, name: r.signature.name || r.client.name, sub: 'Cliente / responsável' },
    ];
    sigs.forEach((sg, i) => {
      const x = M + i * (sigW + 16);
      if (sg.img) {
        try { doc.addImage(sg.img, 'PNG', x, y, sigW, sigH); } catch (e) { /* ignora */ }
      }
      doc.setDrawColor(120);
      doc.setLineWidth(0.3);
      doc.line(x, y + sigH + 1, x + sigW, y + sigH + 1);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30);
      doc.text(t(sg.name || ''), x + sigW / 2, y + sigH + 5.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(t(sg.sub), x + sigW / 2, y + sigH + 9.5, { align: 'center' });
    });
    y += sigH + 20;

    if (s.footer) {
      ensure(10);
      doc.setFontSize(8.5);
      doc.setTextColor(90);
      for (const ln of doc.splitTextToSize(t(s.footer), CW)) {
        ensure(4.5);
        doc.text(ln, M, y);
        y += 4;
      }
    }

    // ---------- rodapé em todas as páginas ----------
    const pages = doc.getNumberOfPages();
    const now = new Date();
    const stamp = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(215);
      doc.setLineWidth(0.2);
      doc.line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      doc.text(t(`${r.number || ''}  |  ${s.company || ''}  |  Gerado em ${stamp}`), M, PAGE_H - 8);
      doc.text(`Página ${i} de ${pages}`, PAGE_W - M, PAGE_H - 8, { align: 'right' });
    }

    doc.setProperties({ title: t(`Relatório Técnico ${r.number}`), subject: t(r.client.name), creator: 'RelatórioTec' });
    return doc;
  }

  return { build, fmtDate };
})();
