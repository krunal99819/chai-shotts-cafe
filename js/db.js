import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { defaultCategories, defaultProducts } from './menu-data.js';

// Global variables for Firebase references
let app, auth, firestore;
let firebaseInitialized = false;

// Check configuration and initialize Firebase if set
const useFirebase = isFirebaseConfigured();

if (useFirebase) {
    try {
        // Dynamic import or loading via script is possible, but since we are in ES modules:
        // We import statically from the CDN
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
        const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");

        app = initializeApp(firebaseConfig);
        firestore = getFirestore(app);
        auth = getAuth(app);
        firebaseInitialized = true;
        console.log("Firebase initialized successfully.");
        // Seed default products and categories if Firestore is empty
        seedFirestoreIfNeeded();
    } catch (error) {
        console.error("Failed to initialize Firebase, falling back to LocalStorage mock database.", error);
        firebaseInitialized = false;
    }
} else {
    console.log("Using Mock LocalStorage database. Paste Firebase keys in js/firebase-config.js to connect to the cloud.");
}

// ----------------------------------------------------
// LOCAL STORAGE MOCK IMPLEMENTATION (Realtime Fallback)
// ----------------------------------------------------

const mockDB = {
    // Initial Seed Helpers
    init() {
        if (!localStorage.getItem('cs_categories')) {
            localStorage.setItem('cs_categories', JSON.stringify(defaultCategories));
        }
        if (!localStorage.getItem('cs_products')) {
            localStorage.setItem('cs_products', JSON.stringify(defaultProducts));
        }
        if (!localStorage.getItem('cs_orders')) {
            localStorage.setItem('cs_orders', JSON.stringify([]));
        }
        if (!localStorage.getItem('cs_sessions')) {
            localStorage.setItem('cs_sessions', JSON.stringify([]));
        }
        if (!localStorage.getItem('cs_requests')) {
            localStorage.setItem('cs_requests', JSON.stringify([]));
        }
        // Initialize Default Users
        if (!localStorage.getItem('cs_users')) {
            localStorage.setItem('cs_users', JSON.stringify([
                { email: 'admin@chaishotts.com', role: 'admin', name: 'Admin Staff', password: 'admin' }
            ]));
        }
        if (!localStorage.getItem('cs_settings')) {
            localStorage.setItem('cs_settings', JSON.stringify({ gstEnabled: false }));
        }
    },

    // Listeners state
    listeners: {
        categories: [],
        products: [],
        orders: [],
        sessions: [],
        requests: [],
        auth: [],
        settings: []
    },

    trigger(type, data) {
        this.listeners[type].forEach(cb => cb(data));
    },

    setupStorageListeners() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'cs_categories' && e.newValue) {
                mockDB.trigger('categories', JSON.parse(e.newValue));
            }
            if (e.key === 'cs_products' && e.newValue) {
                mockDB.trigger('products', JSON.parse(e.newValue));
            }
            if (e.key === 'cs_orders' && e.newValue) {
                mockDB.trigger('orders', JSON.parse(e.newValue));
            }
            if (e.key === 'cs_sessions' && e.newValue) {
                mockDB.trigger('sessions', JSON.parse(e.newValue));
            }
            if (e.key === 'cs_requests' && e.newValue) {
                mockDB.trigger('requests', JSON.parse(e.newValue));
            }
            if (e.key === 'cs_settings' && e.newValue) {
                mockDB.trigger('settings', JSON.parse(e.newValue));
            }
        });
    }
};

mockDB.init();
mockDB.setupStorageListeners();

// ----------------------------------------------------
// UNIFIED DATABASE API (Firebase vs Mock)
// ----------------------------------------------------

export const db = {
    isFirebase: firebaseInitialized,

    categories: {
        listen(callback) {
            if (firebaseInitialized) {
                // Firebase Firestore Realtime Listener
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ collection, onSnapshot, query, orderBy }) => {
                    const q = query(collection(firestore, 'categories'), orderBy('sortOrder', 'asc'));
                    onSnapshot(q, (snapshot) => {
                        const categories = [];
                        snapshot.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));
                        callback(categories);
                    });
                });
            } else {
                mockDB.listeners.categories.push(callback);
                callback(JSON.parse(localStorage.getItem('cs_categories') || '[]'));
            }
        },
        async add(category) {
            if (firebaseInitialized) {
                const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await addDoc(collection(firestore, 'categories'), category);
            } else {
                const categories = JSON.parse(localStorage.getItem('cs_categories') || '[]');
                category.id = 'cat_' + Date.now();
                categories.push(category);
                localStorage.setItem('cs_categories', JSON.stringify(categories));
                mockDB.trigger('categories', categories);
            }
        },
        async update(id, data) {
            if (firebaseInitialized) {
                const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await updateDoc(doc(firestore, 'categories', id), data);
            } else {
                const categories = JSON.parse(localStorage.getItem('cs_categories') || '[]');
                const idx = categories.findIndex(c => c.id === id);
                if (idx !== -1) {
                    categories[idx] = { ...categories[idx], ...data };
                    localStorage.setItem('cs_categories', JSON.stringify(categories));
                    mockDB.trigger('categories', categories);
                }
            }
        },
        async delete(id) {
            if (firebaseInitialized) {
                const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await deleteDoc(doc(firestore, 'categories', id));
            } else {
                const categories = JSON.parse(localStorage.getItem('cs_categories') || '[]');
                const filtered = categories.filter(c => c.id !== id);
                localStorage.setItem('cs_categories', JSON.stringify(filtered));
                mockDB.trigger('categories', filtered);
            }
        }
    },

    products: {
        listen(callback) {
            if (firebaseInitialized) {
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ collection, onSnapshot }) => {
                    onSnapshot(collection(firestore, 'products'), (snapshot) => {
                        const products = [];
                        snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
                        callback(products);
                    });
                });
            } else {
                mockDB.listeners.products.push(callback);
                callback(JSON.parse(localStorage.getItem('cs_products') || '[]'));
            }
        },
        async add(product) {
            if (firebaseInitialized) {
                const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await addDoc(collection(firestore, 'products'), product);
            } else {
                const products = JSON.parse(localStorage.getItem('cs_products') || '[]');
                product.id = 'prod_' + Date.now();
                products.push(product);
                localStorage.setItem('cs_products', JSON.stringify(products));
                mockDB.trigger('products', products);
            }
        },
        async update(id, data) {
            if (firebaseInitialized) {
                const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await updateDoc(doc(firestore, 'products', id), data);
            } else {
                const products = JSON.parse(localStorage.getItem('cs_products') || '[]');
                const idx = products.findIndex(p => p.id === id);
                if (idx !== -1) {
                    products[idx] = { ...products[idx], ...data };
                    localStorage.setItem('cs_products', JSON.stringify(products));
                    mockDB.trigger('products', products);
                }
            }
        },
        async delete(id) {
            if (firebaseInitialized) {
                const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await deleteDoc(doc(firestore, 'products', id));
            } else {
                const products = JSON.parse(localStorage.getItem('cs_products') || '[]');
                const filtered = products.filter(p => p.id !== id);
                localStorage.setItem('cs_products', JSON.stringify(filtered));
                mockDB.trigger('products', filtered);
            }
        }
    },

    orders: {
        listen(callback) {
            if (firebaseInitialized) {
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ collection, onSnapshot, query, orderBy }) => {
                    const q = query(collection(firestore, 'orders'), orderBy('createdAt', 'desc'));
                    onSnapshot(q, (snapshot) => {
                        const orders = [];
                        snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
                        callback(orders);
                    });
                });
            } else {
                mockDB.listeners.orders.push(callback);
                callback(JSON.parse(localStorage.getItem('cs_orders') || '[]'));
            }
        },
        async add(order) {
            order.createdAt = Date.now();
            order.status = "received";
            if (firebaseInitialized) {
                const { collection, addDoc, doc, updateDoc, arrayUnion } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                const docRef = await addDoc(collection(firestore, 'orders'), order);
                // Also update the session
                if (order.sessionId) {
                    const sessionRef = doc(firestore, 'sessions', order.sessionId);
                    await updateDoc(sessionRef, {
                        orderIds: arrayUnion(docRef.id),
                        totalAmount: increment(order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0))
                    });
                }
                return docRef.id;
            } else {
                const orders = JSON.parse(localStorage.getItem('cs_orders') || '[]');
                order.id = 'ord_' + Date.now();
                orders.push(order);
                localStorage.setItem('cs_orders', JSON.stringify(orders));

                // Merge into table session
                if (order.sessionId) {
                    const sessions = JSON.parse(localStorage.getItem('cs_sessions') || '[]');
                    const sessIdx = sessions.findIndex(s => s.id === order.sessionId);
                    if (sessIdx !== -1) {
                        sessions[sessIdx].orderIds.push(order.id);
                        const orderTotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                        sessions[sessIdx].totalAmount += orderTotal;
                        localStorage.setItem('cs_sessions', JSON.stringify(sessions));
                        mockDB.trigger('sessions', sessions);
                    }
                }

                mockDB.trigger('orders', orders);
                return order.id;
            }
        },
        async updateStatus(id, status) {
            if (firebaseInitialized) {
                const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await updateDoc(doc(firestore, 'orders', id), { status });
            } else {
                const orders = JSON.parse(localStorage.getItem('cs_orders') || '[]');
                const idx = orders.findIndex(o => o.id === id);
                if (idx !== -1) {
                    orders[idx].status = status;
                    localStorage.setItem('cs_orders', JSON.stringify(orders));
                    mockDB.trigger('orders', orders);
                }
            }
        }
    },

    sessions: {
        listen(callback) {
            if (firebaseInitialized) {
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ collection, onSnapshot, query, orderBy }) => {
                    const q = query(collection(firestore, 'sessions'), orderBy('createdAt', 'desc'));
                    onSnapshot(q, (snapshot) => {
                        const sessions = [];
                        snapshot.forEach(doc => sessions.push({ id: doc.id, ...doc.data() }));
                        callback(sessions);
                    });
                });
            } else {
                mockDB.listeners.sessions.push(callback);
                callback(JSON.parse(localStorage.getItem('cs_sessions') || '[]'));
            }
        },
        async getActive(tableNumber) {
            tableNumber = parseInt(tableNumber);
            if (firebaseInitialized) {
                const { collection, getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                const q = query(collection(firestore, 'sessions'), 
                    where('tableNumber', '==', tableNumber), 
                    where('status', '==', 'open')
                );
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    return { id: doc.id, ...doc.data() };
                }
                return null;
            } else {
                const sessions = JSON.parse(localStorage.getItem('cs_sessions') || '[]');
                const active = sessions.find(s => s.tableNumber === tableNumber && s.status === 'open');
                return active || null;
            }
        },
        async create(tableNumber, customerName, customerPhone = "", locationLabel = "", orderZone = "table") {
            tableNumber = parseInt(tableNumber);
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
                paymentMethod: null
            };

            if (firebaseInitialized) {
                const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                const docRef = await addDoc(collection(firestore, 'sessions'), newSession);
                return { id: docRef.id, ...newSession };
            } else {
                const sessions = JSON.parse(localStorage.getItem('cs_sessions') || '[]');
                newSession.id = 'sess_' + Date.now();
                sessions.push(newSession);
                localStorage.setItem('cs_sessions', JSON.stringify(sessions));
                mockDB.trigger('sessions', sessions);
                return newSession;
            }
        },
        async close(sessionId, paymentMethod) {
            if (firebaseInitialized) {
                const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await updateDoc(doc(firestore, 'sessions', sessionId), {
                    status: 'paid',
                    closedAt: Date.now(),
                    paymentMethod
                });
            } else {
                const sessions = JSON.parse(localStorage.getItem('cs_sessions') || '[]');
                const idx = sessions.findIndex(s => s.id === sessionId);
                if (idx !== -1) {
                    sessions[idx].status = 'paid';
                    sessions[idx].closedAt = Date.now();
                    sessions[idx].paymentMethod = paymentMethod;
                    localStorage.setItem('cs_sessions', JSON.stringify(sessions));
                    mockDB.trigger('sessions', sessions);
                }
            }
        },
        async deleteItem(sessionId, productId) {
            if (firebaseInitialized) {
                const { collection, getDocs, doc, updateDoc, query, where } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                const q = query(collection(firestore, 'orders'), where('sessionId', '==', sessionId));
                const snapshot = await getDocs(q);
                
                let newTotalAmount = 0;
                for (const d of snapshot.docs) {
                    const orderData = d.data();
                    const updatedItems = orderData.items.filter(item => item.productId !== productId);
                    if (updatedItems.length !== orderData.items.length) {
                        await updateDoc(doc(firestore, 'orders', d.id), { items: updatedItems });
                    }
                    if (orderData.status !== 'cancelled') {
                        newTotalAmount += updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                    }
                }
                
                await updateDoc(doc(firestore, 'sessions', sessionId), { totalAmount: newTotalAmount });
            } else {
                const orders = JSON.parse(localStorage.getItem('cs_orders') || '[]');
                let newTotalAmount = 0;
                
                orders.forEach(o => {
                    if (o.sessionId === sessionId) {
                        o.items = o.items.filter(item => item.productId !== productId);
                        if (o.status !== 'cancelled') {
                            newTotalAmount += o.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                        }
                    }
                });
                
                localStorage.setItem('cs_orders', JSON.stringify(orders));
                mockDB.trigger('orders', orders);

                const sessions = JSON.parse(localStorage.getItem('cs_sessions') || '[]');
                const idx = sessions.findIndex(s => s.id === sessionId);
                if (idx !== -1) {
                    sessions[idx].totalAmount = newTotalAmount;
                    localStorage.setItem('cs_sessions', JSON.stringify(sessions));
                    mockDB.trigger('sessions', sessions);
                }
            }
        }
    },

    requests: {
        listen(callback) {
            if (firebaseInitialized) {
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ collection, onSnapshot, query, orderBy }) => {
                    const q = query(collection(firestore, 'requests'), orderBy('createdAt', 'desc'));
                    onSnapshot(q, (snapshot) => {
                        const requests = [];
                        snapshot.forEach(doc => requests.push({ id: doc.id, ...doc.data() }));
                        callback(requests);
                    });
                });
            } else {
                mockDB.listeners.requests.push(callback);
                callback(JSON.parse(localStorage.getItem('cs_requests') || '[]'));
            }
        },
        async add(tableNumber, type, locationLabel = "") {
            tableNumber = parseInt(tableNumber);
            const request = {
                tableNumber,
                type, // 'waiter', 'bill_digital', 'bill_printed'
                status: 'pending',
                locationLabel: locationLabel || "Table " + tableNumber,
                createdAt: Date.now()
            };

            if (firebaseInitialized) {
                const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await addDoc(collection(firestore, 'requests'), request);
            } else {
                const requests = JSON.parse(localStorage.getItem('cs_requests') || '[]');
                request.id = 'req_' + Date.now();
                requests.push(request);
                localStorage.setItem('cs_requests', JSON.stringify(requests));
                mockDB.trigger('requests', requests);
            }
        },
        async complete(id) {
            if (firebaseInitialized) {
                const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await updateDoc(doc(firestore, 'requests', id), { status: 'completed' });
            } else {
                const requests = JSON.parse(localStorage.getItem('cs_requests') || '[]');
                const idx = requests.findIndex(r => r.id === id);
                if (idx !== -1) {
                    requests[idx].status = 'completed';
                    localStorage.setItem('cs_requests', JSON.stringify(requests));
                    mockDB.trigger('requests', requests);
                }
            }
        }
    },

    auth: {
        async login(email, password) {
            if (firebaseInitialized) {
                const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                // Fetch user role from users collection
                const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                const userDoc = await getDoc(doc(firestore, 'users', userCredential.user.uid));
                if (userDoc.exists()) {
                    return { uid: userCredential.user.uid, email, ...userDoc.data() };
                }
                return { uid: userCredential.user.uid, email, role: 'staff', name: 'Staff Member' };
            } else {
                const users = JSON.parse(localStorage.getItem('cs_users') || '[]');
                const user = users.find(u => u.email === email && u.password === password);
                if (user) {
                    const loggedInUser = { email: user.email, role: user.role, name: user.name };
                    sessionStorage.setItem('cs_active_user', JSON.stringify(loggedInUser));
                    mockDB.trigger('auth', loggedInUser);
                    return loggedInUser;
                }
                throw new Error("Invalid credentials");
            }
        },
        async logout() {
            if (firebaseInitialized) {
                const { signOut } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
                await signOut(auth);
            } else {
                sessionStorage.removeItem('cs_active_user');
                mockDB.trigger('auth', null);
            }
        },
        getCurrentUser() {
            if (firebaseInitialized) {
                const user = auth.currentUser;
                if (!user) return null;
                // Since firestore fetch is async, we return user info if cached or mock for simplicity
                return { uid: user.uid, email: user.email };
            } else {
                const cached = sessionStorage.getItem('cs_active_user');
                return cached ? JSON.parse(cached) : null;
            }
        },
        listenState(callback) {
            if (firebaseInitialized) {
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js").then(({ onAuthStateChanged }) => {
                    onAuthStateChanged(auth, async (user) => {
                        if (user) {
                            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                            const userDoc = await getDoc(doc(firestore, 'users', user.uid));
                            if (userDoc.exists()) {
                                callback({ uid: user.uid, email: user.email, ...userDoc.data() });
                            } else {
                                callback({ uid: user.uid, email: user.email, role: 'staff', name: 'Staff Member' });
                            }
                        } else {
                            callback(null);
                        }
                    });
                });
            } else {
                mockDB.listeners.auth.push(callback);
                callback(this.getCurrentUser());
            }
        }
    },

    settings: {
        listen(callback) {
            if (firebaseInitialized) {
                import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ doc, onSnapshot }) => {
                    onSnapshot(doc(firestore, 'settings', 'global'), (docSnap) => {
                        if (docSnap.exists()) {
                            callback(docSnap.data());
                        } else {
                            callback({ gstEnabled: false });
                        }
                    });
                });
            } else {
                mockDB.listeners.settings.push(callback);
                const settings = JSON.parse(localStorage.getItem('cs_settings') || '{"gstEnabled":false}');
                callback(settings);
            }
        },
        async setGst(enabled) {
            if (firebaseInitialized) {
                const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                await setDoc(doc(firestore, 'settings', 'global'), { gstEnabled: enabled }, { merge: true });
            } else {
                const settings = { gstEnabled: enabled };
                localStorage.setItem('cs_settings', JSON.stringify(settings));
                mockDB.trigger('settings', settings);
            }
        }
    }
};

async function seedFirestoreIfNeeded() {
    try {
        const { collection, getDocs, doc, setDoc, limit, query } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        
        // 1. Seed Products
        const prodSnap = await getDocs(query(collection(firestore, 'products'), limit(1)));
        if (prodSnap.empty) {
            console.log("Seeding default products to Firestore...");
            for (const prod of defaultProducts) {
                const { id, ...data } = prod;
                await setDoc(doc(firestore, 'products', id || 'prod_' + Date.now() + Math.random()), {
                    ...data,
                    inStock: true
                });
            }
        }

        // 2. Seed Categories
        const catSnap = await getDocs(query(collection(firestore, 'categories'), limit(1)));
        if (catSnap.empty) {
            console.log("Seeding default categories to Firestore...");
            for (const cat of defaultCategories) {
                const { id, ...data } = cat;
                await setDoc(doc(firestore, 'categories', id || 'cat_' + Date.now() + Math.random()), data);
            }
        }

        // 3. Seed Settings
        const settingsSnap = await getDocs(query(collection(firestore, 'settings'), limit(1)));
        if (settingsSnap.empty) {
            console.log("Seeding default settings to Firestore...");
            await setDoc(doc(firestore, 'settings', 'global'), {
                gstEnabled: false
            });
        }
        console.log("Firestore seeding check completed successfully.");
    } catch (e) {
        console.error("Firestore auto-seeding failed:", e);
    }
}

export default db;
