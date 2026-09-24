import { expect, type Locator, test as base } from "@playwright/test";

export const test = base.extend<{ cpuThrottle: void; diagnostics: string[] }>({
  // E2E_CPU_THROTTLE=6 slows Chromium's CPU like a loaded CI runner, to
  // reproduce timing flakes locally. Off by default.
  cpuThrottle: [
    async ({ browserName, page }, use) => {
      const rate = Number(process.env.E2E_CPU_THROTTLE ?? 0);
      if (browserName === "chromium" && rate > 1) {
        const session = await page.context().newCDPSession(page);
        await session.send("Emulation.setCPUThrottlingRate", { rate });
      }
      await use();
    },
    { auto: true },
  ],
  diagnostics: async ({ page }, use) => {
    const diagnostics: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      const intentionalSurfaceCancellation =
        request.method() === "GET" &&
        (url.pathname === "/api/file-diff" || url.pathname === "/api/image") &&
        request.failure()?.errorText === "net::ERR_ABORTED";
      // Chromium reports the form-post download navigation as an aborted
      // request even though the attachment downloads successfully.
      const intentionalDownloadNavigation =
        request.method() === "POST" &&
        url.pathname === "/api/review-packet/download" &&
        request.failure()?.errorText === "net::ERR_ABORTED";
      if (
        intentionalSurfaceCancellation ||
        intentionalDownloadNavigation ||
        (url.pathname === "/api/events" && request.failure()?.errorText === "net::ERR_ABORTED")
      ) {
        return;
      }
      if (!request.url().startsWith("data:")) {
        diagnostics.push(
          `requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
        );
      }
    });
    page.on("dialog", (dialog) => {
      diagnostics.push(`unexpected browser dialog: ${dialog.type()} ${dialog.message()}`);
      void dialog.dismiss();
    });

    await use(diagnostics);
    expect(diagnostics, "browser diagnostics should stay clean").toEqual([]);
  },
});

export { expect } from "@playwright/test";

/**
 * Open the line composer on the file's first added line the way a person
 * does: hover the line number, click the gutter "+" button.
 *
 * Pierre re-renders the gutter while a deep-linked page settles, which can
 * detach the hover-revealed button between the hover and the click on slow
 * runners. Retry the whole gesture until the composer is open.
 */
export async function openLineComposer(file: Locator): Promise<Locator> {
  const line = file
    .locator('diffs-container [data-line-type="change-addition"][data-column-number]')
    .first();
  const utility = file.locator("diffs-container [data-utility-button]").first();
  const composer = file.getByRole("textbox", { name: /^Comment on additions line / });
  await expect(line).toBeVisible();
  await expect(async () => {
    if (await composer.isVisible()) return;
    await line.hover();
    await utility.click({ timeout: 2_000 });
    await expect(composer).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  return composer;
}
