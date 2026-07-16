// Compressão de imagens no navegador.
//
// Contexto: fotos de imóveis são persistidas em base64 na coluna
// properties.images. Sem compressão, uma única foto chegava a 542 kB e a
// tabela inteira era baixada em cada abertura do app — um dos principais
// consumidores de egress do Supabase. Toda foto passa a ser redimensionada e
// recomprimida antes de salvar, e a listagem usa apenas uma miniatura leve.

const FULL_MAX_DIM  = 1600  // lado maior da foto completa (detalhe/edição)
const FULL_QUALITY  = 0.8
const THUMB_MAX_DIM = 480   // lado maior da miniatura (grids e cards)
const THUMB_QUALITY = 0.72

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error('Falha ao decodificar a imagem'))
    img.src = src
  })
}

function scaleToJpeg(img: HTMLImageElement, maxDim: number, quality: number): string {
  // Nunca amplia — só reduz quando o lado maior excede o limite
  const scale  = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const width  = Math.round(img.naturalWidth  * scale)
  const height = Math.round(img.naturalHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width  = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador')

  // Fundo branco: JPEG não tem transparência (PNGs transparentes ficariam pretos)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', quality)
}

/** Arquivo selecionado pelo usuário → data URL JPEG comprimida (máx. 1600px). */
export async function compressImageFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    return scaleToJpeg(img, FULL_MAX_DIM, FULL_QUALITY)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** Data URL de uma foto → miniatura JPEG leve (máx. 480px, ~15-25 kB). */
export async function makeThumbnail(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl)
  return scaleToJpeg(img, THUMB_MAX_DIM, THUMB_QUALITY)
}
