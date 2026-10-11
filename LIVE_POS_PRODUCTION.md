# Chai Shotts Cafe - Live Production POS & Smart QR Ordering System
**Document Version:** 1.0 (Production Release `v=33`)  
**Live Application URL:** [https://krunal99819.github.io/chai-shotts-cafe/](https://krunal99819.github.io/chai-shotts-cafe/)  
**Live Admin URL:** [https://krunal99819.github.io/chai-shotts-cafe/admin.html](https://krunal99819.github.io/chai-shotts-cafe/admin.html)  
**GitHub Repository:** `https://github.com/krunal99819/chai-shotts-cafe.git` (`branch: main`)

---

## 1. Overview & Architecture

Chai Shotts POS is a modern, high-speed, serverless Cafe Management and Smart QR Ordering System powered by **Firebase Firestore**, **Firebase Authentication**, and static **HTML5 / ES6 JavaScript Modules**.

```
                   ┌─────────────────────────────────────────┐
                   │           Firebase Cloud Services       │
                   │  - Authentication (Email & Password)    │
                   │  - Cloud Firestore (Real-time NoSQL)    │
                   │  - Security Rules (Role-based Lock)     │
                   └────────────────────┬────────────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 │                                             │
                 ▼                                             ▼
  ┌──────────────────────────────┐              ┌──────────────────────────────┐
  │      Customer QR Interface   │              │     Admin POS Console        │
  │      (`index.html?table=X`)  │              │      (`admin.html`)          │
  │                              │              │                              │
  │  • Smart 1-Read Menu Cache   │              │  • Real-time Order Queue     │
  │  • Table Session Join / Create│             │  • Dynamic Subtotal Billing  │
  │  • Live Ticket Tracker       │              │  • Table Grid (1-9, Hotel)   │
  │  • Digital Bill (PDF) & UPI  │              │  • Thermal Bill PDF Printer  │
  │  • Waiter Calling System     │              │  • Inventory / Menu Manager  │
  │  • 10-Tier Loyalty Engine    │              │  • Voice TTS Announcements   │
  └──────────────────────────────┘              └──────────────────────────────┘
```

---

## 2. Production Security & Access Control

### 2.1 Admin Authentication Credentials
- **Authorized Admin Email:** `admin@chaishotts.com`
- **Authorized Admin Password:** `Token@7005`
- **Role Lock:** Firestore security rules verify `request.auth.token.email == 'admin@chaishotts.com'` to allow privilege modifications.

### 2.2 Firestore Security Perimeter (`firestore.rules`)
```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isStaff() {
      return isAuthenticated() && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'manager', 'kitchen', 'cashier']);
    }

    // Categories & Products: Public read for customers, restricted write for staff
    match /categories/{catId} {
      allow read: if true;
      allow write: if isStaff();
    }

    match /products/{prodId} {
      allow read: if true;
      allow write: if isStaff();
    }

    // Orders: Kitchen tickets created by customers, managed by staff
    match /orders/{orderId} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if isStaff();
    }

    // Sessions: Open table running bills
    match /sessions/{sessionId} {
      allow read: if true;
      allow create: if true;
      allow update: if true;
      allow delete: if isStaff();
    }

    // Service Requests: Waiter calls & bill requests
    match /requests/{requestId} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if isStaff();
    }

    // Staff accounts: Locked strictly to admin
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && request.auth.uid == userId && request.auth.token.email == 'admin@chaishotts.com'; 
    }

    // Global Settings: GST, store timings
    match /settings/{settingsId} {
      allow read: if true;
      allow write: if isStaff();
    }
  }
}
```

---

## 3. Database Schema & Data Models

### 3.1 Collections & Document Structure

#### A. `/sessions/{sessionId}` (Active Table Visits)
| Field | Type | Description |
|---|---|---|
| `tableNumber` | `number` | Physical Table (1-9) or Zone Code (10=Hotel Relax Inn, 11=Other) |
| `customerName` | `string` | Customer's registered name |
| `customerPhone` | `string` | 10-digit mobile number |
| `locationLabel` | `string` | e.g., `"Table 3"`, `"Room 205 (HOTEL RELAX INN)"` |
| `orderZone` | `string` | `"table"`, `"hotel"`, or `"other"` |
| `status` | `string` | `"open"` or `"paid"` |
| `totalAmount` | `number` | Running subtotal for quick reference |
| `loyaltyStep` | `number` | Lifetime visit count (e.g. 1 to 10) |
| `loyaltyDiscountPercent` | `number` | 10% on 5th order |
| `loyaltyFreeItemReward` | `string|null` | Free Coffee (3rd), Pizza (7th), Movie Room (10th) |
| `createdAt` | `number` | Unix timestamp in milliseconds |
| `closedAt` | `number|null` | Timestamp when marked paid |
| `paymentMethod` | `string|null` | `"cash"`, `"upi"`, `"card"` |

#### B. `/orders/{orderId}` (Kitchen Tickets)
| Field | Type | Description |
|---|---|---|
| `sessionId` | `string` | Foreign key referencing `/sessions/{sessionId}` |
| `tableNumber` | `number` | Table identifier |
| `customerName` | `string` | Customer's name |
| `status` | `string` | `"received"`, `"cooking"`, `"served"`, `"cancelled"` |
| `createdAt` | `number` | Unix timestamp in milliseconds |
| `items` | `array` | List of items: `[{ productId, name, price, quantity, isFree }]` |

#### C. `/products/{productId}` (Menu Catalog)
| Field | Type | Description |
|---|---|---|
| `name` | `string` | Item name (e.g., "Veg Cheese Maggie") |
| `categoryId` | `string` | Foreign key referencing `/categories/{catId}` |
| `price` | `number` | Price in INR |
| `image` | `string` | URL or base64 placeholder |
| `isVeg` | `boolean` | `true` for vegetarian |
| `isAvailable` | `boolean` | In stock flag |
| `spicyLevel` | `number` | Spice level indicator (0 to 3) |

#### D. `/settings/global` (Operational Controls)
| Field | Type | Description |
|---|---|---|
| `gstEnabled` | `boolean` | Enable/Disable 5% GST computation |
| `startTime` | `string` | Store opening time (e.g., `"12:00"`) |
| `endTime` | `string` | Store closing time (e.g., `"01:00"`) |
| `overrideTiming` | `boolean` | Emergency bypass switch |
| `catalogVersion` | `number` | Auto-incrementing version integer for customer caching |

---

## 4. Production Performance & Cost Optimization

To prevent Firebase quota exhaustion on high customer volumes, the system uses multiple cost-saving optimizations:

### 4.1 Extreme 1-Read Menu Caching
Instead of listening live or fetching all 40+ products every time a customer scans a QR:
```javascript
// customer.js
const settings = await db.settings.getAll(); // Exactly 1 read
const remoteVersion = settings.catalogVersion || 1;
const localVersion = parseInt(localStorage.getItem('cs_catalog_version') || '0');

if (remoteVersion === localVersion && localStorage.getItem('cs_cached_products')) {
    // 0 EXTRA READS - Loaded instantly from phone storage
    loadCategories(JSON.parse(localStorage.getItem('cs_cached_categories')));
    loadProducts(JSON.parse(localStorage.getItem('cs_cached_products')));
} else {
    // Only fetches catalog when the Admin updates a price or item
    const categories = await db.categories.getAll();
    const products = await db.products.getAll();
    localStorage.setItem('cs_cached_categories', JSON.stringify(categories));
    localStorage.setItem('cs_cached_products', JSON.stringify(products));
    localStorage.setItem('cs_catalog_version', remoteVersion.toString());
}
```

### 4.2 Scoped Session Queries (No Full-Collection Scans)
- Customer order and bill lookups use `db.orders.getBySession(activeSession.id)` with `where('sessionId', '==', sessionId)` instead of downloading the entire database.
- Active table checks use `db.sessions.getActive(tableNumber)` with `where('tableNumber', '==', tableNumber)` and `limit(1)`.
- Loyalty lookups query past phone visits capped with `limit(15)`.

### 4.3 Capped Admin Listeners
- `db.orders.listen`: Capped at `limit(250)` orders.
- `db.sessions.listen`: Capped at `limit(250)` sessions.
- `db.requests.listen`: Capped at `limit(100)` requests with automatic memory leak unsubscription.

---

## 5. Live Production Core Code (`js/db.js`)

Below is the database abstraction layer currently running in production:

```javascript
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js?v=33';

let auth = null;
let firestore = null;
let firebaseInitialized = false;

if (isFirebaseConfigured()) {
    try {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
        const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
        const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        firestore = getFirestore(app);
        firebaseInitialized = true;
    } catch (e) {
        console.warn("Firebase initialization failed; fallback to Mock DB", e);
    }
}

export const db = {
    isFirebase: firebaseInitialized,

    categories: {
        listen(callback) {
            if (firebaseInitialized) {
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ collection, onSnapshot, query, orderBy }) => {
                    const q = query(collection(firestore, 'categories'), orderBy('sortOrder', 'asc'));
                    onSnapshot(q, (snapshot) => {
                        const categories = [];
                        snapshot.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));
                        callback(categories);
                    });
                });
            }
        },
        async getAll() {
            if (firebaseInitialized) {
                const { collection, getDocs, query, orderBy } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                const q = query(collection(firestore, 'categories'), orderBy('sortOrder', 'asc'));
                const snapshot = await getDocs(q);
                const categories = [];
                snapshot.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));
                return categories;
            }
        },
        async add(category) {
            const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            await addDoc(collection(firestore, 'categories'), category);
            await db.settings.bumpCatalogVersion();
        },
        async update(id, data) {
            const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            await updateDoc(doc(firestore, 'categories', id), data);
            await db.settings.bumpCatalogVersion();
        },
        async delete(id) {
            const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            await deleteDoc(doc(firestore, 'categories', id));
            await db.settings.bumpCatalogVersion();
        }
    },

    products: {
        async getAll() {
            if (firebaseInitialized) {
                const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                const snapshot = await getDocs(collection(firestore, 'products'));
                const products = [];
                snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
                return products;
            }
        },
        async add(product) {
            const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            await addDoc(collection(firestore, 'products'), product);
            await db.settings.bumpCatalogVersion();
        },
        async update(id, data) {
            const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            await updateDoc(doc(firestore, 'products', id), data);
            await db.settings.bumpCatalogVersion();
        },
        async delete(id) {
            const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            await deleteDoc(doc(firestore, 'products', id));
            await db.settings.bumpCatalogVersion();
        }
    },

    orders: {
        listen(callback) {
            if (firebaseInitialized) {
                let unsubscribe = null;
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ collection, onSnapshot, query, orderBy, limit }) => {
                    const q = query(collection(firestore, 'orders'), orderBy('createdAt', 'desc'), limit(250));
                    unsubscribe = onSnapshot(q, (snapshot) => {
                        const orders = [];
                        snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
                        callback(orders);
                    });
                });
                return () => { if (unsubscribe) unsubscribe(); };
            }
        },
        listenDoc(id, callback) {
            if (firebaseInitialized) {
                let unsubscribe = null;
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ doc, onSnapshot }) => {
                    unsubscribe = onSnapshot(doc(firestore, 'orders', id), (docSnap) => {
                        if (docSnap.exists()) {
                            callback({ id: docSnap.id, ...docSnap.data() });
                        }
                    });
                });
                return () => { if (unsubscribe) unsubscribe(); };
            }
        },
        async getBySession(sessionId) {
            if (firebaseInitialized) {
                const { collection, getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                const q = query(collection(firestore, 'orders'), where('sessionId', '==', sessionId));
                const snapshot = await getDocs(q);
                const orders = [];
                snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
                return orders.sort((a,b) => b.createdAt - a.createdAt);
            }
        },
        async add(order) {
            order.createdAt = Date.now();
            order.status = "received";
            if (firebaseInitialized) {
                const { collection, addDoc, doc, updateDoc, arrayUnion, increment } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                const docRef = await addDoc(collection(firestore, 'orders'), order);
                if (order.sessionId) {
                    const sessionRef = doc(firestore, 'sessions', order.sessionId);
                    await updateDoc(sessionRef, {
                        orderIds: arrayUnion(docRef.id),
                        totalAmount: increment(order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0))
                    });
                }
                return docRef.id;
            }
        },
        async updateStatus(id, status) {
            const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            await updateDoc(doc(firestore, 'orders', id), { status });
        }
    },

    sessions: {
        listen(callback) {
            if (firebaseInitialized) {
                let unsubscribe = null;
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ collection, onSnapshot, query, orderBy, limit }) => {
                    const q = query(collection(firestore, 'sessions'), orderBy('createdAt', 'desc'), limit(250));
                    unsubscribe = onSnapshot(q, (snapshot) => {
                        const sessions = [];
                        snapshot.forEach(doc => sessions.push({ id: doc.id, ...doc.data() }));
                        callback(sessions);
                    });
                });
                return () => { if (unsubscribe) unsubscribe(); };
            }
        },
        listenDoc(id, callback) {
            if (firebaseInitialized) {
                let unsubscribe = null;
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ doc, onSnapshot }) => {
                    unsubscribe = onSnapshot(doc(firestore, 'sessions', id), (docSnap) => {
                        if (docSnap.exists()) {
                            callback({ id: docSnap.id, ...docSnap.data() });
                        }
                    });
                });
                return () => { if (unsubscribe) unsubscribe(); };
            }
        },
        async getSession(id) {
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            const docSnap = await getDoc(doc(firestore, 'sessions', id));
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        },
        async getActive(tableNumber, locationLabel = "") {
            tableNumber = parseInt(tableNumber);
            const { collection, getDocs, query, where, limit } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            let q = query(collection(firestore, 'sessions'), 
                where('tableNumber', '==', tableNumber), 
                where('status', '==', 'open'),
                limit(1)
            );
            const snapshot = await getDocs(q);
            return !snapshot.empty ? { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } : null;
        },
        async create(tableNumber, customerName, customerPhone = "", locationLabel = "", orderZone = "table") {
            tableNumber = parseInt(tableNumber);
            const loyaltyInfo = await this.calculateLoyalty(customerPhone);
            const newSession = {
                tableNumber,
                customerName,
                customerPhone,
                locationLabel: locationLabel || "Table " + tableNumber,
                orderZone,
                status: "open",
                createdAt: Date.now(),
                closedAt: null,
                orderIds: [],
                totalAmount: 0,
                paymentMethod: null,
                ...loyaltyInfo
            };
            const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            const docRef = await addDoc(collection(firestore, 'sessions'), newSession);
            return { id: docRef.id, ...newSession };
        },
        async close(sessionId, paymentMethod) {
            const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            await updateDoc(doc(firestore, 'sessions', sessionId), {
                status: 'paid',
                closedAt: Date.now(),
                paymentMethod
            });
        }
    },

    settings: {
        async getAll() {
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            const docSnap = await getDoc(doc(firestore, 'settings', 'global'));
            return docSnap.exists() ? docSnap.data() : { gstEnabled: false };
        },
        async bumpCatalogVersion() {
            const { doc, setDoc, increment } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
            await setDoc(doc(firestore, 'settings', 'global'), { catalogVersion: increment(1) }, { merge: true });
        }
    }
};

export default db;
```

---

## 6. Daily Cafe Operations Workflow

1. **Morning Opening:**
   - Cashier/Manager logs in at `admin.html` with `admin@chaishotts.com` / `Token@7005`.
   - Audio bell alerts turn active on user interaction.
2. **Customer Dine-In:**
   - Customer scans Table QR (e.g. `https://krunal99819.github.io/chai-shotts-cafe/?table=3`).
   - Customer enters Name & 10-digit mobile number.
   - Loyalty status is verified in the background.
3. **Placing & Kitchen Fulfillment:**
   - Order sends ticket to `/orders` collection.
   - Admin POS plays voice announcement: *"New Order Received for Table 3!"*.
   - Kitchen marks status: **Cooking ➔ Served**. Customer tracker updates in real-time.
4. **Checkout & Daily Cashout:**
   - When customer requests bill or visits cash counter, cashier clicks Table on Admin Dashboard.
   - Subtotal is computed dynamically (`Price x Qty`).
   - Cashier selects Cash / Card / UPI and clicks **"Close Session & Settle"**.
   - Session status changes to `paid`, table clears to Green (Available).
