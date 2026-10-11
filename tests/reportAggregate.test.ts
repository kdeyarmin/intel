import { describe, it, expect } from "vitest";
import {
  aggregateReport,
  buildReportCsv,
  buildReportEmail,
  computeNextReportRun,
  partitionRecipients,
  REPORT_DATASETS,
  scheduleSignature,
  summarizeReport,
  zonedTime,
} from "../server/lib/reportAggregate";
// The browser's runner, for parity.
import { aggregateData } from "../src/components/customReports/ReportChart";

const utilRows = [
  { state: "PA", data_year: "2023", hcpcs_description: "Office visit", total_services: 10, total_medicare_payment_amt: 100.5 },
  { state: "PA", data_year: "2023", hcpcs_description: "Office visit", total_services: 5, total_medicare_payment_amt: 50 },
  { state: "OH", data_year: "2023", hcpcs_description: "Echo", total_services: 30, total_medicare_payment_amt: "400" },
  { state: "OH", data_year: "2022", hcpcs_description: "", total_services: 7, total_medicare_payment_amt: 70 },
];

describe("aggregateReport", () => {
  const ds = REPORT_DATASETS.cms_utilization;

  it("matches the browser's aggregateData for grouped and total reports", () => {
    for (const config of [
      { dataset: "cms_utilization", metrics: ["total_services", "total_medicare_payment_amt"], group_by: "hcpcs_description" },
      { dataset: "cms_utilization", metrics: ["total_services"], group_by: "state" },
      { dataset: "cms_utilization", metrics: ["total_services", "total_medicare_payment_amt"], group_by: "" },
    ]) {
      expect(aggregateReport(utilRows, config, ds)).toEqual(aggregateData(utilRows, config));
    }
  });

  it("agrees with the browser when filters leave nothing: no rows, not a zero total", () => {
    const config = { dataset: "cms_utilization", metrics: ["total_services"], group_by: "", filters: { state: "TX" } };
    expect(aggregateReport(utilRows, config, ds)).toEqual([]);
    expect(aggregateData(utilRows, config)).toEqual([]);
  });

  it("filters by year (as text) and state", () => {
    const rows = aggregateReport(utilRows, { metrics: ["total_services"], group_by: "state", filters: { year: 2023, state: "oh" } }, ds);
    expect(rows).toEqual([{ group: "OH", total_services: 30 }]);
  });

  it("counts rows for count metrics instead of summing NPIs", () => {
    const rows = aggregateReport(
      [{ npi: "1234567893", state: "PA" }, { npi: "1234567894", state: "PA" }, { npi: "1234567895", state: "OH" }],
      { metrics: ["npi"], group_by: "state" },
      REPORT_DATASETS.locations,
    );
    expect(rows).toEqual([{ group: "PA", npi: 2 }, { group: "OH", npi: 1 }]);
  });

  it("returns nothing when no row survives the filters", () => {
    expect(aggregateReport(utilRows, { metrics: ["total_services"], filters: { state: "TX" } }, ds)).toEqual([]);
  });
});

describe("computeNextReportRun (US Eastern)", () => {
  it("handles wall-clock times across daylight saving", () => {
    expect(zonedTime(2026, 1, 15, 8, 0).toISOString()).toBe("2026-01-15T13:00:00.000Z"); // EST
    expect(zonedTime(2026, 7, 15, 8, 0).toISOString()).toBe("2026-07-15T12:00:00.000Z"); // EDT
  });

  it("runs daily at the scheduled time, later today or tomorrow", () => {
    const s = { frequency: "daily", schedule_time: "08:00" };
    expect(computeNextReportRun(s, new Date("2026-03-02T12:00:00Z")).toISOString()).toBe("2026-03-02T13:00:00.000Z");
    expect(computeNextReportRun(s, new Date("2026-03-02T13:00:00Z")).toISOString()).toBe("2026-03-03T13:00:00.000Z");
  });

  it("runs weekly on the chosen weekday, crossing the DST change", () => {
    // Monday 2026-03-02 09:00 ET has passed; next Monday is 2026-03-09, after DST starts (Mar 8).
    const next = computeNextReportRun({ frequency: "weekly", schedule_day: "Monday", schedule_time: "09:00" }, new Date("2026-03-02T15:00:00Z"));
    expect(next.toISOString()).toBe("2026-03-09T13:00:00.000Z");
  });

  it("runs monthly on the chosen day and tolerates stale or missing values", () => {
    expect(computeNextReportRun({ frequency: "monthly", schedule_day: "15", schedule_time: "07:30" }, new Date("2026-01-20T00:00:00Z")).toISOString())
      .toBe("2026-02-15T12:30:00.000Z");
    // "Monday" left over from a weekly schedule → day 1; missing time → 08:00.
    expect(computeNextReportRun({ frequency: "monthly", schedule_day: "Monday" }, new Date("2026-01-20T00:00:00Z")).toISOString())
      .toBe("2026-02-01T13:00:00.000Z");
    expect(computeNextReportRun({}, new Date("2026-01-20T00:00:00Z")).getUTCDay()).toBe(1); // weekly, Monday
  });

  it("moves a time in the spring-forward gap to after the gap, and picks the first of a repeated time", () => {
    // 2026-03-08 02:30 ET doesn't exist (clocks jump 02:00 → 03:00): run at 03:30 EDT.
    expect(zonedTime(2026, 3, 8, 2, 30).toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(zonedTime(2026, 3, 8, 8, 0).toISOString()).toBe("2026-03-08T12:00:00.000Z");
    // 2026-11-01 01:30 ET happens twice: the first (EDT) one.
    expect(zonedTime(2026, 11, 1, 1, 30).toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(computeNextReportRun({ frequency: "daily", schedule_time: "02:30" }, new Date("2026-03-08T05:00:00Z")).toISOString())
      .toBe("2026-03-08T07:30:00.000Z");
  });

  it("changes signature when the schedule changes", () => {
    expect(scheduleSignature({ frequency: "weekly", schedule_day: "Monday", schedule_time: "08:00" }))
      .not.toBe(scheduleSignature({ frequency: "daily", schedule_day: "Monday", schedule_time: "08:00" }));
  });
});

describe("report email", () => {
  const metrics = [{ key: "total_services", label: "Total Services" }];
  const rows = [{ group: "<b>Echo</b>", total_services: 30 }, { group: "=cmd()", total_services: 10.25 }];

  it("escapes HTML and explains what the numbers are based on", () => {
    const email = buildReportEmail({ name: "Weekly", datasetLabel: "Utilization", groupLabel: "Service", metrics, rows, sourceRowCount: 500, summary: "Echo leads.", manageUrl: "https://app.example.org/CustomReports" });
    expect(email.subject).toBe("Weekly: Utilization report");
    expect(email.html).toContain("&lt;b&gt;Echo&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Echo</b>");
    expect(email.text).toContain("Based on the latest 500 Utilization records.");
    expect(email.text).toContain("Manage this schedule: https://app.example.org/CustomReports");
  });

  it("writes a CSV that spreadsheets can't execute", () => {
    expect(buildReportCsv({ groupLabel: "Service", metrics, rows })).toBe("Service,Total Services\r\n<b>Echo</b>,30\r\n'=cmd(),10.25\r\n");
    // Text that starts like a formula is escaped even when it starts like a number; numbers stay numbers.
    expect(buildReportCsv({ groupLabel: "G", metrics, rows: [{ group: "-1+2", total_services: -5 }, { group: "+1", total_services: 1 }] }))
      .toBe("G,Total Services\r\n'-1+2,-5\r\n'+1,1\r\n");
  });

  it("summarizes the leading group", () => {
    expect(summarizeReport([{ group: "OH", n: 30 }, { group: "PA", n: 10 }], [{ key: "n", label: "Services" }], "State"))
      .toBe("OH leads 2 state groups on services with 30 (75% of 40).");
  });
});

describe("partitionRecipients", () => {
  it("allows app users and allowed domains only", () => {
    const { allowed, blocked } = partitionRecipients(
      ["Admin@Example.com", "boss@caremetric.ai", "stranger@gmail.com", "admin@example.com", "nope"],
      new Set(["admin@example.com"]),
      ["caremetric.ai"],
    );
    expect(allowed).toEqual(["admin@example.com", "boss@caremetric.ai"]);
    expect(blocked).toEqual(["stranger@gmail.com"]);
  });

  it("blocks a pending or disabled account even on an allowed domain", () => {
    const { allowed, blocked } = partitionRecipients(
      ["gone@caremetric.ai", "new@caremetric.ai"],
      new Set(),
      ["caremetric.ai"],
      new Set(["gone@caremetric.ai"]),
    );
    expect(allowed).toEqual(["new@caremetric.ai"]);
    expect(blocked).toEqual(["gone@caremetric.ai"]);
  });

  it("returns allowed addresses beyond the cap instead of dropping them", () => {
    const many = Array.from({ length: 27 }, (_, i) => `u${i}@caremetric.ai`);
    const { allowed, overflow } = partitionRecipients(many, new Set(), ["caremetric.ai"]);
    expect(allowed).toHaveLength(25);
    expect(overflow).toEqual(["u25@caremetric.ai", "u26@caremetric.ai"]);
  });
});

describe("report grouping", () => {
  it("keeps long values that share a 30-character prefix as separate groups, in both aggregators", () => {
    const a = "Established patient office or other outpatient visit, 30 minutes";
    const b = "Established patient office or other outpatient visit, 20 minutes";
    const rows = [
      { hcpcs_description: a, total_services: 5 },
      { hcpcs_description: b, total_services: 7 },
    ];
    const config = { dataset: "cms_utilization", group_by: "hcpcs_description", metrics: ["total_services"] } as any;
    const ds = REPORT_DATASETS.cms_utilization;
    expect(aggregateReport(rows, config, ds).map((r) => r.group)).toEqual([b, a]);
    expect(aggregateData(rows, config).map((r: any) => r.group)).toEqual([b, a]);
  });
});
