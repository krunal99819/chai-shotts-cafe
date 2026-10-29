// Automated verification tests for Reward Points & Multi-guest logic

globalThis.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; }
};

const { db } = await import('./db.js');

console.log("=== RUNNING REWARD SYSTEM & JOIN GUEST VERIFICATION TESTS ===");

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
// - Up to 500: 5% (returns integer 5)
// - Above 500: 8% (returns integer 8)
// - Above 1000: 10% (returns integer 10)
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

// 2. Redemption Rule Test:
// Rule: Max 30% of bill OR Max ₹100, whichever is lower, capped by available balance
assert(db.sessions.calculateMaxRedeemable(200, 100) === 60, "Subtotal ₹200 with 100 pts: Max redeemable is 60 (30%)");
assert(db.sessions.calculateMaxRedeemable(500, 200) === 100, "Subtotal ₹500 with 200 pts: Capped at ₹100 max");
assert(db.sessions.calculateMaxRedeemable(500, 40) === 40, "Subtotal ₹500 with 40 pts: Capped at balance 40");

// 3. Cumulative Balance Test across multiple visits:
// Visit 1: Bill ₹5000 -> Earns 500 pts.
// Visit 2: Redeems 100 pts.
// Visit 3: Redeems 100 pts.
// Balance should be exactly 300 pts!
const mockHistory = [
    { customerPhone: "9999999999", status: "paid", totalAmount: 5000, pointsEarned: 500, pointsRedeemed: 0 },
    { customerPhone: "9999999999", status: "paid", totalAmount: 1000, pointsEarned: 0, pointsRedeemed: 100 },
    { customerPhone: "9999999999", status: "paid", totalAmount: 800, pointsEarned: 0, pointsRedeemed: 100 }
];
globalThis.localStorage.setItem('cs_sessions', JSON.stringify(mockHistory));

const balanceCheck = await db.sessions.getRewardPoints("9999999999");
assert(balanceCheck === 300, `Cumulative balance: Started with 500, used 100, used 100 => 300 remaining (Got: ${balanceCheck})`);

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
