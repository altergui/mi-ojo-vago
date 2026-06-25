/** Fit a box of the given aspect ratio (width/height) inside a container. */
export function fitBox(containerW: number, containerH: number, aspect: number): { width: number; height: number } {
  let h = containerH;
  let w = h * aspect;
  if (w > containerW) {
    w = containerW;
    h = w / aspect;
  }
  return { width: w, height: h };
}
