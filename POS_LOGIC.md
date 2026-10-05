# Chai Shotts Cafe - POS & Smart Ordering System Logic

This document explains the core architecture, data flow, and business logic of the Chai Shotts Cafe Point of Sale (POS) and Customer QR Ordering system.

## 1. System Architecture Overview

The system is a real-time web application built with HTML, CSS, and Vanilla JavaScript. It uses **Firebase Firestore** as the primary real-time database, allowing instant synchronization between the customer's phone and the admin's dashboard.

### Core Files
* **`index.html` & `js/customer.js`**: The customer-facing menu, cart, and order tracking interface.
* **`admin.html` & `js/admin.js`**: The staff POS dashboard for managing live orders, billing, and requests.
* **`js/db.js`**: The centralized database abstraction layer. It handles all reads/writes to Firebase and includes a LocalStorage fallback (`mockDB`) for offline development.

---

## 2. Session Management & Table Occupancy

A "Session" represents a customer or group sitting at a specific table. 

### Session Lifecycle
1. **QR Scan / URL Entry**: Customer visits `index.html?table=1`.
2. **Validation**: The system checks if the device already has an active session ID in its browser local storage (`cs_active_session_id`). 
   * If the URL `table` parameter doesn't match the saved session's table, the old session is discarded to prevent "ghost" sessions.
3. **Table Conflict Resolution (The Join Flow)**:
   * If Table 1 is empty, a new session document is created in the `sessions` collection with status `open`.
   * If Table 1 is **already occupied** by "Person A", and "Person B" tries to join:
     1. Person B's app blocks them and shows **"Waiting for Admin Approval"**.
     2. A request (`type: 'join_session'`) is sent to the Admin Dashboard.
     3. The Admin clicks **Approve** (Person B inherits Person A's session ID and joins their bill) or **Reject** (Person B is denied and asked to choose a different table).

---

## 3. The Ordering Flow (Customer to Admin)

1. **Cart Management**: Items are added to a local `cart` object in `customer.js`.
2. **Order Placement**: When "Place Order" is clicked, a document is created in the `orders` collection linked to the active `sessionId`.
3. **Admin Live Orders**: 
   * The Admin Dashboard listens to the `orders` collection in real-time.
   * New orders pop up in the "Live Orders" kanban board under the **"New / Received"** column.
4. **Order Status Lifecycle**:
   * `received` ➔ `preparing` ➔ `ready` ➔ `served`.
   * As the Admin drags-and-drops the order across columns in the dashboard, `db.orders.updateStatus()` is called.
   * The customer's UI (Live Order Tracker) updates in real-time to show the progress.

---

## 4. Billing & Checkout Logic

The POS handles mathematical consolidation of all orders tied to a single session.

### Ghost Item Prevention
When an Admin manually changes the quantity of an item from the "Bill Details" modal, the system uses a robust deduplication script in `db.sessions.updateItemQuantity()`. It scans *all* orders under that session, consolidates duplicates of the product into a single record, and zeroes out the rest to prevent mathematically impossible "ghost" items from inflating the bill.

### Taxes & Loyalty
* **GST / Taxes**: Can be globally toggled on/off from the Admin settings. If active, a flat 5% (2.5% CGST + 2.5% SGST) is applied to the taxable subtotal.
* **Loyalty Discount**: Checked against the customer's phone number. If they are eligible for a 10% discount (e.g., on their 5th visit), the discount is deducted *before* GST is calculated.

### Payment & Closing
1. When the customer is done, the Admin clicks **"Mark Paid"** or the customer pays via the simulated **UPI QR Code**.
2. The session status changes from `open` to `paid`.
3. A `closedAt` timestamp is added.
4. The table is instantly freed up for the next customer.
5. The session data moves to the "Bill Manager & History" tab and is logged into the Sales Analytics charts.

---

## 5. Admin Utilities & Requests

* **Waiter Calls**: Customers can click "Call Waiter", which writes a `waiter` request to the database. The Admin gets a bell chime and can click "Dismiss/Resolve" to clear it.
* **Sales Analytics**: Aggregates `paid` sessions to display hourly traffic, top-selling items, and revenue timelines using Chart.js.
* **Digital Receipts**: Uses `jsPDF` to generate 80mm thermal-printer formatted PDF receipts natively in the browser.
