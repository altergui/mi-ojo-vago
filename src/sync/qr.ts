import qrcode from 'qrcode-generator';

/** Renders `text` as a scalable inline SVG string (viewBox-based, no fixed pixel size). */
export function renderQrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ scalable: true });
}
