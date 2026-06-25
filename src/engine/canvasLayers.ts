/**
 * Manages the stack of overlaid <canvas> elements a game draws into.
 * Ported from Amblyotris initDomElements (game.ts:911-952): each named layer
 * is an absolutely-positioned canvas with an increasing z-index.
 */
export class CanvasLayers<Name extends string> {
  readonly canvases: Record<Name, HTMLCanvasElement>;
  readonly ctx: Record<Name, CanvasRenderingContext2D>;

  constructor(host: HTMLElement, names: readonly Name[]) {
    host.style.position = 'relative';
    this.canvases = {} as Record<Name, HTMLCanvasElement>;
    this.ctx = {} as Record<Name, CanvasRenderingContext2D>;
    names.forEach((name, i) => {
      const cnv = document.createElement('canvas');
      cnv.style.position = 'absolute';
      cnv.style.top = '50%';
      cnv.style.left = '50%';
      cnv.style.transform = 'translate(-50%, -50%)';
      cnv.style.zIndex = String(i);
      host.appendChild(cnv);
      this.canvases[name] = cnv;
      this.ctx[name] = cnv.getContext('2d') as CanvasRenderingContext2D;
    });
  }

  /** Sets both the pixel buffer and the displayed size of every layer (1:1, no stretch). */
  resize(width: number, height: number): void {
    (Object.values(this.canvases) as HTMLCanvasElement[]).forEach((cnv) => {
      cnv.width = width;
      cnv.height = height;
      cnv.style.width = `${width}px`;
      cnv.style.height = `${height}px`;
    });
  }

  clear(name: Name, width: number, height: number): void {
    this.ctx[name].clearRect(0, 0, width, height);
  }

  destroy(): void {
    (Object.values(this.canvases) as HTMLCanvasElement[]).forEach((c) => c.remove());
  }
}
