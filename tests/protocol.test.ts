import { expect, test } from "bun:test";
import { imageMimeType } from "../src/server/protocol.js";

test("previews the image formats the UI previewed before, with their real MIME types", () => {
  expect(imageMimeType("a/b/photo.TIFF")).toBe("image/tiff");
  expect(imageMimeType("scan.tif")).toBe("image/tiff");
  expect(imageMimeType("shot.heic")).toBe("image/heic");
  expect(imageMimeType("shot.heif")).toBe("image/heif");
  expect(imageMimeType("logo.png")).toBe("image/png");
  expect(imageMimeType(".png")).toBeNull();
  expect(imageMimeType("notes.txt")).toBeNull();
});
