import {
  splitEvenly,
  rentShare,
  effectiveRent,
  planAllocations,
  summariseCharges,
  addCalendarMonths,
  pendingRentCycles,
  nextAnchorOccurrence,
  proratedRent,
  splitByWeights,
  roomOccupantWeights,
} from "@/lib/charges";

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

// A triple room at 24000: split by capacity, fixed regardless of who's
// actually living there right now.
const triple = { rentAmount: 24000, capacity: 3 };
check("triple, per bed", rentShare(triple), 8000);
check("double, per bed", rentShare({ rentAmount: 10000, capacity: 2 }), 5000);
check("single, per bed", rentShare({ rentAmount: 10000, capacity: 1 }), 10000);

// Rent resolution order.
check("per-tenant override wins", effectiveRent({ rentAmount: 5000, rentOverride: 6500, room: triple }), 6500);
check("room split used", effectiveRent({ rentAmount: 5000, rentOverride: null, room: triple }), 8000);
check("no room -> own amount", effectiveRent({ rentAmount: 5000, rentOverride: null, room: null }), 5000);

// A new roommate's first cycle lands on the existing tenant's due-day.
check(
  "next anchor occurrence, later this month",
  nextAnchorOccurrence("2026-08-05", "2026-08-01").toISOString().slice(0, 10),
  "2026-08-05"
);
check(
  "next anchor occurrence, rolls to next month",
  nextAnchorOccurrence("2026-08-05", "2026-08-20").toISOString().slice(0, 10),
  "2026-09-05"
);
check(
  "next anchor occurrence, short month clamp",
  nextAnchorOccurrence("2026-01-31", "2026-02-20").toISOString().slice(0, 10),
  "2026-02-28"
);

// Joined the 20th, room's existing due-day is the 5th: 16 days pro-rated
// off a flat 30-day month, at the room's per-bed rate.
check("prorated rent, 16 days of 5000/mo", proratedRent(5000, 16), 2666.67);
check("prorated rent, whole month", proratedRent(5000, 30), 5000);

// splitByWeights is proportional, not even, and still exact to the paisa.
check("split by weights 2:1", splitByWeights(300, [2, 1]), [200, 100]);
check("split by weights sums exactly", splitByWeights(1000, [1, 1, 1]).reduce((a, b) => a + b, 0), 1000);
check("split by weights, zero weight gets zero", splitByWeights(500, [1, 0]), [500, 0]);

// Room electricity split when a roommate joins partway through the reading
// period: whoever was already there pays the full pre-arrival segment plus
// half the shared segment, the new roommate pays only half the shared one.
const roomWeights = roomOccupantWeights(
  [
    { id: "existing", joinDate: "2026-01-01" },
    { id: "newcomer", joinDate: "2026-08-20" },
  ],
  "2026-08-01",
  "2026-09-05"
);
const roomShares = splitByWeights(3500, [roomWeights.get("existing")!, roomWeights.get("newcomer")!]);
check(
  "existing occupant pays full pre-arrival + half shared",
  roomShares[0] > roomShares[1] * 2,
  true
);
check("room shares sum to the bill", roomShares.reduce((a, b) => a + b, 0), 3500);
check(
  "sole occupant for the whole period gets the whole bill",
  splitByWeights(1000, [...roomOccupantWeights([{ id: "solo", joinDate: "2026-01-01" }], "2026-08-01", "2026-08-31").values()]),
  [1000]
);

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
