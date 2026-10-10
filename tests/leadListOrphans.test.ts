import { describe, it, expect } from "vitest";
import { planOrphanReassignment } from "../server/lib/leadListOrphans";

const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 12, 0, s)).toISOString();

describe("planOrphanReassignment", () => {
  const lists = [
    { id: 1, name: "A", created_date: t(0), member_count: 2 },
    { id: 2, name: "B", created_date: t(100), member_count: 1 },
  ];

  it("links members to the list created just before them", () => {
    const plan = planOrphanReassignment(lists, [
      { id: 10, npi: "111", created_date: t(1) },
      { id: 11, npi: "222", created_date: t(3) },
      { id: 12, npi: "333", created_date: t(101) },
    ]);
    expect(plan.assignments).toEqual([
      { listId: 1, memberIds: [10, 11] },
      { listId: 2, memberIds: [12] },
    ]);
    expect(plan.unmatched).toEqual([]);
  });

  it("leaves members outside the window or before any list unmatched", () => {
    const plan = planOrphanReassignment(
      lists,
      [
        { id: 20, npi: "1", created_date: t(-5) },
        { id: 21, npi: "2", created_date: t(60) },
      ],
      30_000,
    );
    expect(plan.assignments).toEqual([]);
    expect(plan.unmatched).toEqual([20, 21]);
  });

  it("doesn't put the same NPI on a list twice", () => {
    const plan = planOrphanReassignment(lists, [
      { id: 30, npi: "555", created_date: t(1) },
      { id: 31, npi: "555", created_date: t(2) },
    ]);
    expect(plan.assignments).toEqual([{ listId: 1, memberIds: [30] }]);
    expect(plan.unmatched).toEqual([31]);
  });

  it("treats rows without timestamps as unmatched", () => {
    const plan = planOrphanReassignment(lists, [{ id: 40, npi: "1", created_date: null }]);
    expect(plan.unmatched).toEqual([40]);
  });
});
