import { expect, type Locator, type Page } from "@playwright/test";

type Point = { x: number; y: number };
type TextPoint = Point & { fontSize: number };
export async function observeNativePaint(page: Page) {
  await page.addInitScript(() => {
    const text = new Map<string, { x: number; y: number; fontSize: number }>();
    const images = new Map<string, { x: number; y: number }>();
    Reflect.set(window, "nativePaintText", text);
    Reflect.set(window, "nativePaintImages", images);
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof fill>) {
      const [value, x, y] = args;
      const size = Number.parseFloat(this.font.match(/[\d.]+px/)?.[0] ?? "16");
      const point = this.getTransform().transformPoint({
        x: x + this.measureText(value).width / 2,
        y: y - size / 3,
      });
      if (this.canvas.width >= innerWidth * 0.6 && this.canvas.height >= innerHeight * 0.6)
        text.set(value, {
          x: (point.x * innerWidth) / this.canvas.width,
          y: (point.y * innerHeight) / this.canvas.height,
          fontSize: (size * Math.abs(this.getTransform().d) * innerHeight) / this.canvas.height,
        });
      Reflect.apply(fill, this, args);
    };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      source: CanvasImageSource,
      ...values: number[]
    ) {
      const dx = values.length === 8 ? values[4] : values[0],
        dy = values.length === 8 ? values[5] : values[1];
      const width = values.length === 8 ? values[6] : values[2],
        height = values.length === 8 ? values[7] : values[3];
      if (
        this.canvas.width >= innerWidth * 0.6 &&
        this.canvas.height >= innerHeight * 0.6 &&
        typeof dx === "number" &&
        typeof dy === "number" &&
        typeof width === "number" &&
        typeof height === "number"
      ) {
        const transform = this.getTransform();
        if (source instanceof HTMLImageElement) {
          const point = transform.transformPoint({ x: dx + width / 2, y: dy + height / 2 });
          const match = source.src.startsWith("data:image/svg+xml,")
            ? decodeURIComponent(source.src.slice(source.src.indexOf(",") + 1)).match(
                /\bd="([^"]+)"/,
              )
            : null;
          images.set(match?.[1] ?? source.src, {
            x: (point.x * innerWidth) / this.canvas.width,
            y: (point.y * innerHeight) / this.canvas.height,
          });
        } else if (source instanceof HTMLCanvasElement && source.matches(".hud-minimap canvas")) {
          Reflect.set(window, "nativePaintMap", {
            a: transform.a,
            b: transform.b,
            c: transform.c,
            d: transform.d,
            e: transform.e,
            f: transform.f,
            dx,
            dy,
            width,
            height,
            scaleX: innerWidth / this.canvas.width,
            scaleY: innerHeight / this.canvas.height,
          });
        }
      }
      Reflect.apply(draw, this, [source, ...values]);
    };
  });
}
export const nativeFrame = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
export async function nativeTextPoint(page: Page, value: string) {
  await expect
    .poll(() => page.evaluate((value) => Reflect.get(window, "nativePaintText")?.has(value), value))
    .toBe(true);
  return page.evaluate(
    (value) => Reflect.get(window, "nativePaintText").get(value) as TextPoint,
    value,
  );
}
export async function clickNativeText(page: Page, value: string) {
  const point = await nativeTextPoint(page, value);
  await page.mouse.click(point.x, point.y);
  await nativeFrame(page);
}
export async function nativeIconPoint(page: Page, source: Locator) {
  const key = await source.evaluate(
    (element) =>
      element.querySelector<HTMLImageElement>("img")?.src ??
      element.querySelector("svg path")?.getAttribute("d") ??
      "",
  );
  await expect
    .poll(() => page.evaluate((key) => Reflect.get(window, "nativePaintImages")?.has(key), key))
    .toBe(true);
  return page.evaluate((key) => Reflect.get(window, "nativePaintImages").get(key) as Point, key);
}
export async function clickNativeIcon(page: Page, source: Locator) {
  const point = await nativeIconPoint(page, source);
  await page.mouse.click(point.x, point.y);
  await nativeFrame(page);
}
export async function nativeMapPoint(page: Page, x: number, y: number) {
  await expect.poll(() => page.evaluate(() => !!Reflect.get(window, "nativePaintMap"))).toBe(true);
  return page.evaluate(
    ({ x, y }) => {
      const m = Reflect.get(window, "nativePaintMap");
      const px = m.dx + x * m.width,
        py = m.dy + y * m.height;
      return {
        x: (m.a * px + m.c * py + m.e) * m.scaleX,
        y: (m.b * px + m.d * py + m.f) * m.scaleY,
      };
    },
    { x, y },
  );
}
