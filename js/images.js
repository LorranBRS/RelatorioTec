// Redução de imagens antes de guardar (fotos do celular têm vários MB).
const Images = (() => {
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.src = src;
    });
  }

  // Retorna { data (dataURL), w, h }
  async function compress(file, { max = 1600, type = 'image/jpeg', quality = 0.82 } = {}) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(img, 0, 0, w, h);
      return { data: canvas.toDataURL(type, quality), w, h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return { compress, loadImage };
})();
