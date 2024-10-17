import * as opentype from "opentype.js";
import type { Context } from "./context.js";
import { TextAlign, TextBaseline } from "./types.js";

/** Map containing all the fonts available for use */
const _fonts: Record<string, RegisteredFont> = {};

/** The default font family to use for text */
// const DEFAULT_FONT_FAMILY = 'source';

export type Font = {
  /** The font family to set */
  family: string;
  /** An integer representing the font size to use */
  size?: number;
  binary?: string | Buffer | ArrayBuffer | Uint8Array;
  weight?: number;
  style?: string;
  variant?: string;
  loaded?: boolean;
  font?: opentype.Font | null;
  load?: (cb: CallableFunction) => void;
  loadSync?: () => Font;
  loadPromise?: () => Promise<void>;
};

class RegisteredFont {
  fontData: string | Buffer | ArrayBuffer | Uint8Array;
  family: string;
  weight: number;
  style: string;
  variant: string;
  loaded: boolean;
  font: opentype.Font;

  constructor(
    fontData: string | Buffer | ArrayBuffer | Uint8Array,
    family: string,
    weight?: number,
    style?: string,
    variant?: string,
  ) {
    this.fontData = fontData;
    this.family = family;
    this.weight = weight;
    this.style = style;
    this.variant = variant;
    this.loaded = false;
    this.font = null;
  }

  _load(cb: () => void) {
    if (this.loaded) {
      if (cb) cb();
      return;
    }

    const onLoad = (err: any, font: opentype.Font) => {
      if (err) throw new Error("Could not load font: " + err);
      this.loaded = true;
      this.font = font;
      if (cb) cb();
    };

    if (typeof this.fontData === "string") {
      if (this.fontData.startsWith("data:")) {
        // Base64 string
        const base64Data = this.fontData.split(",")[1];
        const fontBuffer = Buffer.from(base64Data, "base64");
        try {
          this.font = opentype.parse(fontBuffer);
          this.loaded = true;
          if (cb) cb();
        } catch (err) {
          throw new Error("Could not parse font data: " + err);
        }
      } else {
        // Assume it's a file path
        opentype.load(this.fontData, onLoad);
      }
    } else if (
      Buffer.isBuffer(this.fontData) ||
      this.fontData instanceof ArrayBuffer ||
      this.fontData instanceof Uint8Array
    ) {
      // Font data is a buffer
      try {
        this.font = opentype.parse(this.fontData);
        this.loaded = true;
        if (cb) cb();
      } catch (err) {
        throw new Error("Could not parse font data: " + err);
      }
    } else {
      throw new Error("Invalid font data");
    }
  }

  loadSync() {
    if (this.loaded) {
      return this;
    }
    try {
      if (typeof this.fontData === "string") {
        if (this.fontData.startsWith("data:")) {
          // Base64 string
          const base64Data = this.fontData.split(",")[1];
          const fontBuffer = Buffer.from(base64Data, "base64");
          this.font = opentype.parse(fontBuffer);
        } else {
          // Load from file path
          this.font = opentype.loadSync(this.fontData);
        }
      } else if (
        Buffer.isBuffer(this.fontData) ||
        this.fontData instanceof ArrayBuffer ||
        this.fontData instanceof Uint8Array
      ) {
        // Parse font data from buffer
        this.font = opentype.parse(this.fontData);
      } else {
        throw new Error("Invalid font data");
      }
      this.loaded = true;
      return this;
    } catch (err) {
      throw new Error("Could not load font: " + err);
    }
  }

  load() {
    return this.loadPromise();
  }

  loadPromise() {
    return new Promise<void>((res, rej) => {
      try {
        this._load(() => res());
      } catch (err) {
        rej(err);
      }
    });
  }
}

/**
 * Register Font
 *
 * @returns Font instance
 */
export function registerFont(
  /** Font data: file path, base64 string, or Buffer */
  fontData: string | Buffer | ArrayBuffer | Uint8Array,
  /** The name to give the font */
  family: string,
  /** The font weight to use */
  weight?: number,
  /** Font style */
  style?: string,
  /** Font variant */
  variant?: string,
) {
  _fonts[family] = new RegisteredFont(
    fontData,
    family,
    weight,
    style,
    variant,
  );
  return _fonts[family];
}

/**@ignore */
export const debug_list_of_fonts = _fonts;

/**
 * Find Font
 *
 * Search the `fonts` array for a given font family name
 */
function findFont(
  /** The name of the font family to search for */
  family: string,
): RegisteredFont | undefined {
  if (_fonts[family]) return _fonts[family];
  family = Object.keys(_fonts)[0];
  return _fonts[family];
}

/** Process Text Path */
export function processTextPath(
  /** The {@link Context} to paint on */
  ctx: Context,
  /** The text to write to the given Context */
  text: string,
  /** X position */
  x: number,
  /** Y position */
  y: number,
  /** Indicates whether or not the font should be filled */
  fill: boolean,
  hAlign: TextAlign,
  vAlign: TextBaseline,
) {
  const font = findFont(ctx._font.family);
  if (!font) {
    // eslint-disable-next-line no-console
    console.warn("Font missing", ctx._font);
    return;
  }
  const metrics = measureText(ctx, text);
  /* if(hAlign === 'start' || hAlign === 'left')  x = x; */
  if (hAlign === "end" || hAlign === "right") x = x - metrics.width;
  if (hAlign === "center") x = x - metrics.width / 2;

  /* if(vAlign === 'alphabetic') y = y; */
  if (vAlign === "top") y = y + metrics.emHeightAscent;
  if (vAlign === "middle")
    y = y + metrics.emHeightAscent / 2 + metrics.emHeightDescent / 2;
  if (vAlign === "bottom") y = y + metrics.emHeightDescent;
  const size = ctx._font.size;
  if (!font.loaded) {
    console.warn("font not loaded yet", ctx._font);
    return;
  }
  const path = font.font.getPath(text, x, y, size);
  ctx.beginPath();
  path.commands.forEach(function (cmd) {
    switch (cmd.type) {
      case "M":
        ctx.moveTo(cmd.x, cmd.y);
        break;
      case "Q":
        ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
        break;
      case "L":
        ctx.lineTo(cmd.x, cmd.y);
        break;
      case "C":
        ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        break;
      case "Z": {
        ctx.closePath();
        fill ? ctx.fill() : ctx.stroke();
        ctx.beginPath();
        break;
      }
    }
  });
}

type TextMetrics = {
  width: number;
  emHeightAscent: number;
  emHeightDescent: number;
};

/** Measure Text */
export function measureText(
  /** The {@link Context} to paint on */
  ctx: Context,
  /** The text to measure */
  text: string,
): TextMetrics {
  const font = findFont(ctx._font.family);
  if (!font) {
    console.warn("WARNING. Can't find font family ", ctx._font);
    return { width: 10, emHeightAscent: 8, emHeightDescent: 2 };
  }
  if (!font.font) {
    console.warn("WARNING. Can't find font family ", ctx._font);
    return { width: 10, emHeightAscent: 8, emHeightDescent: 2 };
  }
  const fsize = ctx._font.size;
  const glyphs = font.font.stringToGlyphs(text);
  let advance = 0;
  glyphs.forEach(function (g) {
    advance += g.advanceWidth;
  });

  return {
    width: (advance / font.font.unitsPerEm) * fsize,
    emHeightAscent: (font.font.ascender / font.font.unitsPerEm) * fsize,
    emHeightDescent: (font.font.descender / font.font.unitsPerEm) * fsize,
  };
}
