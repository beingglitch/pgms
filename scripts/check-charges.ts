import {
  splitEvenly,
  rentShare,
  effectiveRent,
  planAllocations,
  summariseCharges,
  addPeriods,
  periodsBetween,
  daysInPeriod,
  rentForPeriod,
  pendingRentPeriods,
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

// Rent resolution order: a per-tenant override always wins, otherwise it's
// whatever's on the tenant's own record - never recomputed from the room.
check("per-tenant override wins", effectiveRent({ rentAmount: 5000, rentOverride: 6500 }), 6500);
check("no override -> own amount", effectiveRent({ rentAmount: 8000, rentOverride: null }), 8000);

// Calendar-month arithmetic.
check("add periods forward", addPeriods("2026-11", 3), "2027-02");
check("add periods back", addPeriods("2026-01", -1), "2025-12");
check("periods between", periodsBetween("2026-04", "2026-07"), ["2026-04", "2026-05", "2026-06", "2026-07"]);
check("periods between, reversed is empty", periodsBetween("2026-07", "2026-04"), []);
check("days in Feb 2028 (leap)", daysInPeriod("2028-02"), 29);
check("days in Aug", daysInPeriod("2026-08"), 31);

// Arrive on the 13th: rent runs from the 14th to the 31st, 18 of August's
// 31 days, and falls due the day they arrive.
const aug13 = rentForPeriod(5000, "2026-08-13", "2026-08");
check("join 13 Aug: 18 days charged", aug13.days, 18);
check("join 13 Aug: 5000 * 18/31", aug13.amount, 2903.23);
check("join 13 Aug: due on the join date", aug13.dueDate.toISOString().slice(0, 10), "2026-08-13");
check(
  "join 13 Aug: covers 14th to 31st",
  aug13.partial && [aug13.partial.from.toISOString().slice(0, 10), aug13.partial.to.toISOString().slice(0, 10)],
  ["2026-08-14", "2026-08-31"]
);

// Every month after the join month is the full amount, due on the 1st.
const sep = rentForPeriod(5000, "2026-08-13", "2026-09");
check("following month is full rent", sep.amount, 5000);
check("following month due on the 1st", sep.dueDate.toISOString().slice(0, 10), "2026-09-01");
check("following month isn't partial", sep.partial, null);

// Joining on the 1st is simply a full month.
check("join on the 1st: full month", rentForPeriod(5000, "2026-08-01", "2026-08").amount, 5000);
// Joining on the last day: nothing left to charge this month.
check("join on the 31st: nothing this month", rentForPeriod(5000, "2026-08-31", "2026-08").amount, 0);

// Entered in late August but living here since 13 April: every month from
// April (pro-rated, 17 of 30 days) through August is created at once, plus
// September because 28 Aug + 7 lead days reaches into it.
const backfill = pendingRentPeriods(5000, "2026-04-13", new Date("2026-08-28T00:00:00Z"), 7, new Set());
check(
  "backfill April to September",
  backfill.map((p) => [p.period, p.amount]),
  [
    ["2026-04", 2833.33],
    ["2026-05", 5000],
    ["2026-06", 5000],
    ["2026-07", 5000],
    ["2026-08", 5000],
    ["2026-09", 5000],
  ]
);
check(
  "backfill: only April is partial",
  backfill.map((p) => (p.partial ? "partial" : "full")),
  ["partial", "full", "full", "full", "full", "full"]
);

// The lead window decides when next month appears: 20 Aug + 7 is still
// August, 25 Aug + 7 crosses into September.
check(
  "lead window not yet reached",
  pendingRentPeriods(5000, "2026-08-01", new Date("2026-08-20T00:00:00Z"), 7, new Set(["2026-08"])).map((p) => p.period),
  []
);
check(
  "lead window reached",
  pendingRentPeriods(5000, "2026-08-01", new Date("2026-08-25T00:00:00Z"), 7, new Set(["2026-08"])).map((p) => p.period),
  ["2026-09"]
);
check(
  "zero lead: only on the 1st",
  pendingRentPeriods(5000, "2026-08-01", new Date("2026-08-31T00:00:00Z"), 0, new Set(["2026-08"])).map((p) => p.period),
  []
);

// Months already billed are skipped, not re-created.
check(
  "already-billed months are skipped",
  pendingRentPeriods(5000, "2026-04-13", new Date("2026-08-28T00:00:00Z"), 0, new Set(["2026-04", "2026-05", "2026-06"])).map((p) => p.period),
  ["2026-07", "2026-08"]
);

// Nothing before the join month, ever.
check("no periods before joining", pendingRentPeriods(5000, "2026-09-05", new Date("2026-08-28T00:00:00Z"), 0, new Set()).length, 0);

// Second tenant arrives on the 18th: the reading that ran 1st-18th is billed
// entirely to whoever was already there. The newcomer has no days in it.
const handover = roomOccupantWeights(
  [
    { id: "first", joinDate: "2026-07-01" },
    { id: "second", joinDate: "2026-08-18" },
  ],
  "2026-08-01",
  "2026-08-18"
);
check("handover reading: newcomer has no share", handover.get("second"), 0);
check("handover reading: existing tenant has all of it", handover.get("first"), 17);

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

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
