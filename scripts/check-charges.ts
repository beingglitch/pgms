import { splitEvenly, rentShare, effectiveRent, planAllocations, summariseCharges, addCalendarMonths, pendingRentCycles, resolveSplitMode } from "@/lib/charges";

let fails = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { fails++; console.log(`FAIL ${label}\n  got      ${a}\n  expected ${e}`); }
  else console.log(`ok   ${label} = ${a}`);
}

// Splitting must be exact: no paise may vanish.
check("split 1000/3", splitEvenly(1000, 3), [333.34, 333.33, 333.33]);
check("split 1000/3 sums to 1000", splitEvenly(1000, 3).reduce((a, b) => a + b, 0), 1000);
check("split 1000/2", splitEvenly(1000, 2), [500, 500]);
check("split 0 parts", splitEvenly(1000, 0), []);
check("split 1234.56/7 sums", Math.round(splitEvenly(1234.56, 7).reduce((a, b) => a + b, 0) * 100) / 100, 1234.56);

// A triple room at 24000: by capacity each bed is 8000 regardless of vacancy.
const triple = { rentAmount: 24000, capacity: 3, splitMode: null, floor: null };
check("triple by capacity, 2 living there", rentShare(triple, 2, "BY_CAPACITY"), 8000);
check("triple by occupants, 2 living there", rentShare(triple, 2, "BY_OCCUPANTS"), 12000);
check("triple by occupants, empty", rentShare(triple, 0, "BY_OCCUPANTS"), 24000);

// Room override beats the property default; floor sits between.
check("room override wins", resolveSplitMode({ splitMode: "CUSTOM", floor: { splitMode: "BY_OCCUPANTS" } }, "BY_CAPACITY"), "CUSTOM");
check("floor beats property", resolveSplitMode({ splitMode: null, floor: { splitMode: "BY_OCCUPANTS" } }, "BY_CAPACITY"), "BY_OCCUPANTS");
check("property default applies", resolveSplitMode({ splitMode: null, floor: { splitMode: null } }, "BY_CAPACITY"), "BY_CAPACITY");

// Rent resolution order.
check("per-tenant override wins", effectiveRent({ rentAmount: 5000, rentOverride: 6500, room: { ...triple, tenants: [{ id: "a" }] } }, "BY_CAPACITY"), 6500);
check("room split used", effectiveRent({ rentAmount: 5000, rentOverride: null, room: { ...triple, tenants: [{ id: "a" }, { id: "b" }] } }, "BY_CAPACITY"), 8000);
check("no room -> own amount", effectiveRent({ rentAmount: 5000, rentOverride: null, room: null }, "BY_CAPACITY"), 5000);
check("CUSTOM mode -> own amount", effectiveRent({ rentAmount: 5000, rentOverride: null, room: { ...triple, splitMode: "CUSTOM", tenants: [] } }, "BY_CAPACITY"), 5000);

// Partial payment: 5000 against rent 8000 + electricity 500, oldest first.
const charges = [
  { id: "rent", amount: 8000, waived: false, allocations: [], type: "RENT" as const, dueDate: "2026-07-05" },
  { id: "elec", amount: 500, waived: false, allocations: [], type: "ELECTRICITY" as const, dueDate: "2026-07-28" },
];
check("partial payment allocation", planAllocations(5000, charges), { allocations: [{ chargeId: "rent", amount: 5000 }], unallocated: 0 });
check("overpayment leaves credit", planAllocations(9000, charges), { allocations: [{ chargeId: "rent", amount: 8000 }, { chargeId: "elec", amount: 500 }], unallocated: 500 });

const partly = [
  { ...charges[0], allocations: [{ amount: 5000 }] },
  charges[1],
];
const s = summariseCharges(partly, new Date("2026-08-05"));
check("summary outstanding", s.total.outstanding, 3500);
check("summary paid", s.total.paid, 5000);
check("summary rent outstanding", s.byType.RENT.outstanding, 3000);
check("summary electricity outstanding", s.byType.ELECTRICITY.outstanding, 500);
check("both overdue as of Aug 5", s.overdue, 3500);

// A waived charge is owed by nobody.
check("waived owes nothing", summariseCharges([{ ...charges[0], waived: true }]).total.outstanding, 0);

// addCalendarMonths clamps to the target month's last day, unlike native
// Date.setMonth (which would roll Jan 31 + 1 month into "Mar 3").
check("add 1 month, Jan 31 -> Feb 28", addCalendarMonths("2026-01-31", 1).toISOString().slice(0, 10), "2026-02-28");
check("add 1 month, normal case (UTC-stable)", addCalendarMonths("2026-08-05", 1).toISOString().slice(0, 10), "2026-09-05");
check("add 0 months is a no-op", addCalendarMonths("2026-08-05", 0).toISOString().slice(0, 10), "2026-08-05");

// The exact scenario rent cycles are built around: joined July 5, and as of
// November 20 every cycle that's started since is due, July through
// November, five of them, each on the same day-of-month they joined on.
const cyclesSoFar = pendingRentCycles("2025-07-05", new Date("2025-11-20T00:00:00Z"), new Set());
check(
  "join July 5, as of Nov 20 -> 5 cycles due",
  cyclesSoFar.map((c) => ({ start: c.start.toISOString().slice(0, 10), period: c.period })),
  [
    { start: "2025-07-05", period: "2025-07" },
    { start: "2025-08-05", period: "2025-08" },
    { start: "2025-09-05", period: "2025-09" },
    { start: "2025-10-05", period: "2025-10" },
    { start: "2025-11-05", period: "2025-11" },
  ]
);

// Cycles already billed are skipped, not re-created.
const partiallyBilled = pendingRentCycles(
  "2025-07-05",
  new Date("2025-11-20T00:00:00Z"),
  new Set(["2025-07", "2025-08", "2025-09"])
);
check(
  "already-billed cycles are skipped",
  partiallyBilled.map((c) => c.period),
  ["2025-10", "2025-11"]
);

// A cycle that hasn't started yet never appears, even with nothing billed.
check(
  "no cycles before the join date",
  pendingRentCycles("2025-07-05", new Date("2025-07-04T00:00:00Z"), new Set()).length,
  0
);

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
