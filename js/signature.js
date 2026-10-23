// Área de assinatura com dedo/caneta/mouse. Resolução interna fixa (600x200).
function SignaturePad(canvas, onChange) {
  const ctx = canvas.getContext('2d');
  const box = canvas.closest('.sig-box');
  let drawing = false;
  let last = null;

  function style() {
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    ctx.fillStyle = '#111';
  }
  style();

  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * canvas.width / r.width,
      y: (e.clientY - r.top) * canvas.height / r.height,
    };
  };
  const setSigned = v => box && box.classList.toggle('signed', v);

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    last = pos(e);
    ctx.beginPath();
    ctx.arc(last.x, last.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
    setSigned(true);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    onChange(canvas.toDataURL('image/png'));
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return {
    clear(notify = true) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSigned(false);
      if (notify) onChange('');
    },
    load(data) {
      this.clear(false);
      if (!data) return;
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); style(); };
      img.src = data;
      setSigned(true);
    },
  };
}
