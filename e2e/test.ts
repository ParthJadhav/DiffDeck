import { expect, test as base } from "@playwright/test";

export const test = base.extend<{ diagnostics: string[] }>({
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
