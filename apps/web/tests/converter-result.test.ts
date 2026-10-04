import { afterEach, describe, expect, it, vi } from "vitest";

import { DOWNLOAD_FILENAME, JobApiError } from "@/components/converter/jobApi";
import * as jobApi from "@/components/converter/jobApi";
import {
  CONVERT_ANOTHER_CTA,
  DELETE_FILES_CTA,
  DOWNLOAD_CTA,
  DOWNLOAD_STARTED_NOTE,
  FORBIDDEN_DOWNLOAD_CLAIM_PATTERNS,
  READY_BODY,
  READY_HEADING,
  formatExpiryLabel,
} from "@/components/converter/resultCopy";
import { FIDELITY_WARNING } from "@/lib/copy";

describe("US-020 result copy", () => {
  it("offers the four ready-state actions and required fidelity warning", () => {
    expect(DOWNLOAD_CTA).toBe("Download editable DOCX");
    expect(DELETE_FILES_CTA).toBe("Delete my files");
    expect(CONVERT_ANOTHER_CTA).toBe("Convert another resume");
    expect(READY_HEADING.toLowerCase()).toMatch(/ready/);
    expect(READY_BODY.toLowerCase()).toMatch(/download|editable|docx|word/);
    expect(FIDELITY_WARNING).toBe(
      "Formatting may change. Review your resume after conversion.",
    );
  });

  it("formats expiry without job ids or secrets", () => {
    const future = new Date("2099-06-15T14:30:00.000Z").toISOString();
    const label = formatExpiryLabel(future, Date.parse("2099-01-01T00:00:00Z"));
    expect(label).toMatch(/Available until/i);
    expect(label.toLowerCase()).toMatch(/expires automatically/);
    expect(label.toLowerCase()).toMatch(/closing the tab is not deletion/);
    expect(label).not.toMatch(/Bearer|secret|token|job_/i);

    const past = new Date("2000-01-01T00:00:00.000Z").toISOString();
    const expired = formatExpiryLabel(past, Date.parse("2026-10-04T00:00:00Z"));
    expect(expired.toLowerCase()).toMatch(/expired/);
  });

  it("does not treat download start as proof the user saved or opened the file", () => {
    const blob = `${DOWNLOAD_STARTED_NOTE} ${READY_BODY} ${READY_HEADING}`;
    for (const pattern of FORBIDDEN_DOWNLOAD_CLAIM_PATTERNS) {
      expect(blob).not.toMatch(pattern);
    }
    expect(DOWNLOAD_STARTED_NOTE.toLowerCase()).toMatch(
      /does not confirm|not confirm/,
    );
    expect(DOWNLOAD_STARTED_NOTE.toLowerCase()).toMatch(/download again|again/);
  });

  it("keeps forbidden product claims out of ready-state copy", () => {
    const blob = [
      DOWNLOAD_CTA,
      DELETE_FILES_CTA,
      CONVERT_ANOTHER_CTA,
      READY_HEADING,
      READY_BODY,
      DOWNLOAD_STARTED_NOTE,
      formatExpiryLabel("2099-01-01T00:00:00.000Z"),
      FIDELITY_WARNING,
    ].join(" ");
    expect(blob.toLowerCase()).not.toMatch(/perfect layout|100%|ats guaranteed/);
    expect(blob.toLowerCase()).not.toMatch(/pixel[- ]identical/);
  });
});

describe("US-020 authenticated download client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GETs /api/jobs/{id}/download with Bearer auth and no query secrets", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": `attachment; filename="${DOWNLOAD_FILENAME}"`,
          "cache-control": "no-store",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const blob = await jobApi.downloadJob("job-abc", "secret-xyz");
    expect(blob.size).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/jobs/job-abc/download");
    expect(url).not.toMatch(/secret|token|=/);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret-xyz");
  });

  it("surfaces expired/unauthorized without inventing a saved-file claim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "expired" }), {
          status: 410,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    let caught: unknown;
    try {
      await jobApi.downloadJob("job-gone", "secret");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(JobApiError);
    expect((caught as JobApiError).code).toBe("expired");
    expect((caught as JobApiError).message.toLowerCase()).not.toMatch(
      /saved|opened successfully/,
    );
  });

  it("default download filename matches the product contract", () => {
    expect(DOWNLOAD_FILENAME).toBe("resume-editable.docx");
  });
});
