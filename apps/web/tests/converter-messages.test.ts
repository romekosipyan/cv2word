import { describe, expect, it } from "vitest";

import {
  messageForErrorCode,
  validateSelectedFile,
} from "@/components/converter/messages";
import { MAX_UPLOAD_BYTES } from "@/lib/pdf/limits";

describe("US-001 converter messages", () => {
  it("states exact byte and page limits on server rejection codes", () => {
    expect(messageForErrorCode("too_large")).toContain("10 MiB");
    expect(messageForErrorCode("too_large")).toContain(
      MAX_UPLOAD_BYTES.toLocaleString(),
    );
    expect(messageForErrorCode("too_many_pages")).toContain("5-page");
    expect(messageForErrorCode("too_many_pages")).toContain("1–5");
    expect(messageForErrorCode("unsupported_type")).toMatch(/PDF/i);
  });

  it("advises on non-PDF and oversized files without claiming server authority", () => {
    const png = new File([new Uint8Array([1, 2, 3])], "scan.png", {
      type: "image/png",
    });
    const badType = validateSelectedFile(png);
    expect(badType.ok).toBe(false);
    if (!badType.ok) {
      expect(badType.code).toBe("unsupported_type");
    }

    const huge = new File(
      [new Uint8Array(MAX_UPLOAD_BYTES + 1)],
      "big.pdf",
      { type: "application/pdf" },
    );
    const tooBig = validateSelectedFile(huge);
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) {
      expect(tooBig.code).toBe("too_large");
      expect(tooBig.message).toContain("10 MiB");
    }

    const ok = validateSelectedFile(
      new File([new Uint8Array([1])], "resume.pdf", {
        type: "application/pdf",
      }),
    );
    expect(ok.ok).toBe(true);
  });
});
