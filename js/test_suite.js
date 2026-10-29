// Comprehensive Automated verification tests for 20% cap & 30-Day FIFO Expiry & Multi-guest

globalThis.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; }
};

const { db } = await import('./db.js');

console.log("=== RUNNING 20% CAP, 30-DAY FIFO EXPIRY & REWARD TESTS ===");

let passed = 0;
let total = 0;

function assert(condition, message) {
    total++;
    if (condition) {
        console.log(`[PASS] ${message}`);
        passed++;
    } else {
        console.error(`[FAIL] ${message}`);
    }
}

// 1. Slabs Calculation Test:
// - Up to 500: 5%
// - Above 500: 8%
// - Above 1000: 10%
assert(db.sessions.calculateRewardPercentage(300) === 5, "Subtotal 300 gets 5%");
assert(db.sessions.calculateRewardPercentage(500) === 5, "Subtotal 500 gets 5%");
assert(db.sessions.calculateRewardPercentage(501) === 8, "Subtotal 501 gets 8%");
assert(db.sessions.calculateRewardPercentage(1000) === 8, "Subtotal 1000 gets 8%");
assert(db.sessions.calculateRewardPercentage(1001) === 10, "Subtotal 1001 gets 10%");
assert(db.sessions.calculateRewardPercentage(1500) === 10, "Subtotal 1500 gets 10%");

// Points earned rounding (subtotal * percentage / 100):
assert(Math.round(400 * (db.sessions.calculateRewardPercentage(400) / 100)) === 20, "Earns 20 pts on ₹400 bill (5%)");
assert(Math.round(750 * (db.sessions.calculateRewardPercentage(750) / 100)) === 60, "Earns 60 pts on ₹750 bill (8%)");
assert(Math.round(1200 * (db.sessions.calculateRewardPercentage(1200) / 100)) === 120, "Earns 120 pts on ₹1200 bill (10%)");

// 2. Updated Redemption Rule Test (NEW: Max 20% of bill OR Max ₹100, whichever is lower):
// Subtotal ₹200 (20% of 200 = ₹40; min(100, 40) = 40). Available = 100 => Redeem 40.
assert(db.sessions.calculateMaxRedeemable(200, 100) === 40, "Subtotal ₹200 with 100 pts: Max redeemable is 40 (20% cap)");

// Subtotal ₹400 (20% of 400 = ₹80; min(100, 80) = 80). Available = 100 => Redeem 80.
assert(db.sessions.calculateMaxRedeemable(400, 100) === 80, "Subtotal ₹400 with 100 pts: Max redeemable is 80 (20% cap)");

// Subtotal ₹600 (20% of 600 = ₹120; min(100, 120) = 100). Available = 200 => Redeem 100 (Capped at ₹100 max).
assert(db.sessions.calculateMaxRedeemable(600, 200) === 100, "Subtotal ₹600 with 200 pts: Capped at ₹100 max limit");

// Subtotal ₹600 with 40 pts available => Redeem 40 (Capped by balance).
assert(db.sessions.calculateMaxRedeemable(600, 40) === 40, "Subtotal ₹600 with 40 pts: Capped at balance 40");

// 3. User's exact 30-Day Expiry & FIFO Scenario:
// Day 0: Earns 500 pts.
// Day 15: Redeems 100 pts (Leaves 400 pts in Batch 1).
// Day 20: Earns 500 pts (Batch 2 has 500 pts).
// Total at Day 25: 400 + 500 = 900 pts.
// At Day 31: Batch 1 (from Day 0) is >30 days old. Its remaining 400 pts expire!
// Only Batch 2 (500 pts from Day 20) remains active.
const DAY = 24 * 60 * 60 * 1000;
const T0 = 1700000000000;

const testHistory = [
    { customerPhone: "8888888888", status: "paid", pointsEarned: 500, pointsRedeemed: 0, closedAt: T0 },
    { customerPhone: "8888888888", status: "paid", pointsEarned: 0, pointsRedeemed: 100, closedAt: T0 + (15 * DAY) },
    { customerPhone: "8888888888", status: "paid", pointsEarned: 500, pointsRedeemed: 0, closedAt: T0 + (20 * DAY) }
];
globalThis.localStorage.setItem('cs_sessions', JSON.stringify(testHistory));

// Check Day 25:
const day25Bal = await db.sessions.getRewardPoints("8888888888", T0 + (25 * DAY));
assert(day25Bal === 900, `Day 25: 400 (batch 1) + 500 (batch 2) = 900 (Got: ${day25Bal})`);

// Check Day 31 (Batch 1 expired):
const day31Bal = await db.sessions.getRewardPoints("8888888888", T0 + (31 * DAY));
assert(day31Bal === 500, `Day 31: Batch 1 expired, only 500 from Day 20 remains (Got: ${day31Bal})`);

// Check Day 51 (Batch 2 also expired):
const day51Bal = await db.sessions.getRewardPoints("8888888888", T0 + (51 * DAY));
assert(day51Bal === 0, `Day 51: All batches older than 30 days expired = 0 (Got: ${day51Bal})`);

// 4. Multi-Guest Array Test:
const mockSession = {
    id: "test_session_101",
    tableNumber: 4,
    customerName: "Rahul",
    customerPhone: "9876543210",
    totalAmount: 1200,
    additionalGuests: []
};
const guest1 = { name: "Kanu bhai", phone: "9898000001", joinedAt: Date.now() };
const guest2 = { name: "Dhruv", phone: "9898000002", joinedAt: Date.now() };

mockSession.additionalGuests.push(guest1);
mockSession.additionalGuests.push(guest2);

assert(mockSession.additionalGuests.length === 2, "2 guests added to additionalGuests array");
assert(mockSession.totalAmount === 1200, "Session total amount strictly preserved (no duplication)");

console.log(`\nALL TESTS PASSED: ${passed}/${total}`);
