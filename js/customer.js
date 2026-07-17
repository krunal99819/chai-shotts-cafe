import db from './db.js';
import soundEffects from './audio.js';

// State Variables
let tableNumber = null;
let activeSession = null;
let activeOrdersListener = null;
let activeSessionListener = null;
let menuProducts = [];
let menuCategories = [];
let currentCategory = 'all';
let searchQuery = '';
let cart = {}; // Format: { productId: { product, quantity, notes } }
let activeOrderId = null; // Track most recent order ID placed
let gstEnabled = false; // Synchronized global GST configuration flag

// DOM Elements
const elements = {
    tableIndicator: document.getElementById('tableIndicator'),
    menuContainer: document.getElementById('menuContainer'),
    categoriesList: document.getElementById('categoriesList'),
    menuSearch: document.getElementById('menuSearch'),
    
    // Floating Cart Bar
    cartFloatingBar: document.getElementById('cartFloatingBar'),
    cartItemsCount: document.getElementById('cartItemsCount'),
    cartTotalPrice: document.getElementById('cartTotalPrice'),
    btnViewCart: document.getElementById('btnViewCart'),
    
    // Drawer
    cartDrawer: document.getElementById('cartDrawer'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    drawerClose: document.getElementById('drawerClose'),
    cartItemsList: document.getElementById('cartItemsList'),
    orderNotes: document.getElementById('orderNotes'),
    btnPlaceOrder: document.getElementById('btnPlaceOrder'),
    
    // Bill calculation inside drawer
    drawerSubtotal: document.getElementById('drawerSubtotal'),
    drawerTax: document.getElementById('drawerTax'),
    drawerGrandTotal: document.getElementById('drawerGrandTotal'),
    runningBillSection: document.getElementById('runningBillSection'),
    runningBillList: document.getElementById('runningBillList'),
    runningBillMergeRow: document.getElementById('runningBillMergeRow'),
    runningSessionAmount: document.getElementById('runningSessionAmount'),

    // Modals
    customerInfoModal: document.getElementById('customerInfoModal'),
    btnStartSession: document.getElementById('btnStartSession'),
    custNameInput: document.getElementById('custNameInput'),
    custTableInput: document.getElementById('custTableInput'),
    custPhoneInput: document.getElementById('custPhoneInput'),
    tableInputGroup: document.getElementById('tableInputGroup'),
    orderZoneSelect: document.getElementById('orderZoneSelect'),
    hotelInputGroup: document.getElementById('hotelInputGroup'),
    hotelRoomInput: document.getElementById('hotelRoomInput'),
    otherInputGroup: document.getElementById('otherInputGroup'),
    otherPlaceInput: document.getElementById('otherPlaceInput'),
    
    waiterConfirmModal: document.getElementById('waiterConfirmModal'),
    btnCallWaiter: document.getElementById('btnCallWaiter'),
    btnConfirmWaiterCall: document.getElementById('btnConfirmWaiterCall'),
    btnCancelWaiter: document.getElementById('btnCancelWaiter'),
    
    billOptionsModal: document.getElementById('billOptionsModal'),
    btnRequestBill: document.getElementById('btnRequestBill'),
    btnBillDigital: document.getElementById('btnBillDigital'),
    btnBillPrinted: document.getElementById('btnBillPrinted'),
    btnCloseBillOptions: document.getElementById('btnCloseBillOptions'),
    
    paymentModal: document.getElementById('paymentModal'),
    upiQrCanvas: document.getElementById('upiQrCanvas'),
    paymentAmount: document.getElementById('paymentAmount'),
    btnSimulatePaySuccess: document.getElementById('btnSimulatePaySuccess'),
    btnPayCounter: document.getElementById('btnPayCounter'),
    btnClosePayment: document.getElementById('btnClosePayment'),
    
    feedbackModal: document.getElementById('feedbackModal'),
    btnSubmitFeedback: document.getElementById('btnSubmitFeedback'),
    feedbackText: document.getElementById('feedbackText'),
    
    // Live Order Tracker
    liveOrderTracker: document.getElementById('liveOrderTracker'),
    trackerOrderId: document.getElementById('trackerOrderId'),
    stepReceived: document.getElementById('stepReceived'),
    stepPreparing: document.getElementById('stepPreparing'),
    stepReady: document.getElementById('stepReady'),
    stepServed: document.getElementById('stepServed')
};

// ==========================================================================
// 1. APPLICATION INITIALIZATION & ROUTING
// ==========================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initApp();
    });
} else {
    initApp();
}

async function initApp() {
    // Check if there is an active session stored in LocalStorage for this device/browser
    const savedSessionId = localStorage.getItem('cs_active_session_id');
    let sessionRestored = false;
    
    if (savedSessionId) {
        try {
            const savedSession = await db.sessions.getSession(savedSessionId);
            if (savedSession && savedSession.status === 'open') {
                activeSession = savedSession;
                tableNumber = savedSession.tableNumber;
                
                // Update table indicator
                if (savedSession.orderZone === 'table') {
                    elements.tableIndicator.innerHTML = `<i class="fa-solid fa-chair"></i> Table ${tableNumber}`;
                } else {
                    elements.tableIndicator.innerHTML = `<i class="fa-solid fa-map-pin"></i> ${savedSession.locationLabel}`;
                }
                
                // Prefill inputs
                elements.custNameInput.value = savedSession.customerName;
                elements.custPhoneInput.value = savedSession.customerPhone || "";
                
                // Hide registration modal
                elements.customerInfoModal.classList.remove('open');
                
                listenToSessionChanges(savedSession.id);
                syncRunningBill();
                sessionRestored = true;
            } else {
                localStorage.removeItem('cs_active_session_id');
            }
        } catch (e) {
            console.error("Error restoring saved session:", e);
            localStorage.removeItem('cs_active_session_id');
        }
    }
    
    // Parse Table Number from URL
    const urlParams = new URLSearchParams(window.location.search);
    const tableParam = urlParams.get('table');
    
    if (!sessionRestored) {
        if (tableParam) {
            tableNumber = parseInt(tableParam);
            elements.tableIndicator.innerHTML = `<i class="fa-solid fa-chair"></i> Table ${tableNumber}`;
            
            // Prefill and hide table input
            elements.custTableInput.value = tableNumber;
            elements.tableInputGroup.style.display = 'none';
            elements.orderZoneSelect.value = 'table';
            elements.orderZoneSelect.disabled = true; // Lock zone to inside table
            
            // Check for active session
            await checkActiveSession();
        } else {
            // No table specified -> Display unified modal asking for Table number
            elements.tableInputGroup.style.display = 'block';
            elements.customerInfoModal.classList.add('open');
        }
    } else {
        if (tableNumber) {
            elements.custTableInput.value = tableNumber;
        }
    }
    
    // 3. Load Menu Data (Categories & Products)
    db.categories.listen(loadCategories);
    db.products.listen(loadProducts);
    
    // Load global settings (GST config)
    db.settings.listen(settings => {
        gstEnabled = settings.gstEnabled || false;
        // Dynamically update UI calculations
        updateCartUI();
        if (elements.cartDrawer.classList.contains('open')) {
            renderCartDrawerList();
        }
        if (activeSession) {
            syncRunningBill();
        }
    });

    // 4. Setup Event Listeners
    setupEventListeners();
}

function setupEventListeners() {
    // Session Registration
    elements.btnStartSession.addEventListener('click', handleCreateSession);

    // Toggle dynamic fields in registration modal
    elements.orderZoneSelect.addEventListener('change', (e) => {
        const zone = e.target.value;
        elements.tableInputGroup.style.display = zone === 'table' ? 'block' : 'none';
        elements.hotelInputGroup.style.display = zone === 'hotel' ? 'block' : 'none';
        elements.otherInputGroup.style.display = zone === 'other' ? 'block' : 'none';
        
        const phoneLabel = document.querySelector('label[for="custPhoneInput"]');
        if (phoneLabel) {
            phoneLabel.innerHTML = zone === 'other' ? 'Mobile Number *' : 'Mobile Number (Optional)';
        }
    });

    // Search and Filters
    elements.menuSearch.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderMenu();
    });

    // Cart Drawer actions
    elements.btnViewCart.addEventListener('click', openCartDrawer);
    elements.drawerClose.addEventListener('click', closeCartDrawer);
    elements.drawerBackdrop.addEventListener('click', closeCartDrawer);
    elements.btnPlaceOrder.addEventListener('click', handlePlaceOrder);

    // Call Waiter Modal
    elements.btnCallWaiter.addEventListener('click', () => {
        elements.waiterConfirmModal.classList.add('open');
    });
    elements.btnCancelWaiter.addEventListener('click', () => {
        elements.waiterConfirmModal.classList.remove('open');
    });
    elements.btnConfirmWaiterCall.addEventListener('click', handleWaiterCall);

    // Request Bill Modal
    elements.btnRequestBill.addEventListener('click', () => {
        if (!activeSession) {
            alert("You don't have an active session yet. Please add items and order first!");
            return;
        }
        elements.billOptionsModal.classList.add('open');
    });
    elements.btnCloseBillOptions.addEventListener('click', () => {
        elements.billOptionsModal.classList.remove('open');
    });
    elements.btnBillPrinted.addEventListener('click', handlePrintedBillRequest);
    elements.btnBillDigital.addEventListener('click', handleDigitalBillRequest);

    // Payment Modal Controls
    elements.btnClosePayment.addEventListener('click', () => {
        elements.paymentModal.classList.remove('open');
    });
    elements.btnPayCounter.addEventListener('click', () => {
        elements.paymentModal.classList.remove('open');
        alert("Please visit the billing counter. Tell them you are from " + (activeSession?.locationLabel || "your table"));
    });
    elements.btnSimulatePaySuccess.addEventListener('click', handleSimulatedPayment);

    // Feedback rating stars
    const starBtns = document.querySelectorAll('.star-btn');
    starBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const starVal = parseInt(e.target.dataset.star);
            const ratingType = e.target.dataset.type;
            const siblingStars = e.target.parentElement.querySelectorAll('.star-btn');
            
            // Mark rating state
            e.target.parentElement.dataset.value = starVal;
            
            siblingStars.forEach(s => {
                const sVal = parseInt(s.dataset.star);
                if (sVal <= starVal) {
                    s.style.color = 'var(--color-accent-gold)';
                } else {
                    s.style.color = '#ccc';
                }
            });
        });
    });

    elements.btnSubmitFeedback.addEventListener('click', handleSubmitFeedback);
}

// ==========================================================================
// 2. OPEN TABLE SESSIONS INTEGRATION
// ==========================================================================

async function checkActiveSession() {
    const session = await db.sessions.getActive(tableNumber);
    if (session) {
        activeSession = session;
        // Hide name prompt if session already exists
        elements.customerInfoModal.classList.remove('open');
        // Retrieve and listen to table session changes
        listenToSessionChanges(session.id);
        // Sync previously ordered items in running bill
        syncRunningBill();
    } else {
        // Prompt for Customer Registration
        elements.customerInfoModal.classList.add('open');
    }
}

async function handleCreateSession() {
    const name = elements.custNameInput.value.trim();
    const phone = elements.custPhoneInput.value.trim();
    const zone = elements.orderZoneSelect.value;
    
    if (!name) {
        alert("Please enter your name to start ordering.");
        return;
    }

    let localTableNum = 0;
    let locationLabel = "";

    if (zone === 'table') {
        const tableVal = parseInt(elements.custTableInput.value);
        if (!tableVal || tableVal < 1 || tableVal > 9) {
            alert("Please enter a valid Table Number between 1 and 9.");
            return;
        }
        localTableNum = tableVal;
        locationLabel = `Table ${localTableNum}`;
    } else if (zone === 'hotel') {
        const room = elements.hotelRoomInput.value.trim();
        if (!room) {
            alert("Please enter your Room Number.");
            return;
        }
        localTableNum = 10; // Virtual table ID for Hotel Partner
        locationLabel = `${room} (HOTEL RELAX INN)`;
    } else if (zone === 'other') {
        const place = elements.otherPlaceInput.value.trim();
        if (!place) {
            alert("Please specify your place/address.");
            return;
        }
        if (!phone || phone.length < 10) {
            alert("Please enter a valid 10-digit Mobile Number (required for deliveries/takeaway).");
            return;
        }
        localTableNum = 11; // Virtual table ID for Outside Deliveries
        locationLabel = `${place} (Takeaway/Delivery)`;
    }

    tableNumber = localTableNum;
    elements.tableIndicator.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${locationLabel}`;

    try {
        // Check if there is already an active session for this table or hotel room
        const sessions = await new Promise(resolve => {
            db.sessions.listen(allSess => {
                resolve(allSess.filter(s => s.status === 'open'));
            });
        });
        
        const activeLocationSess = sessions.find(s => s.tableNumber === localTableNum && (localTableNum < 10 ? true : s.locationLabel.toLowerCase() === locationLabel.toLowerCase()));
        
        if (activeLocationSess) {
            // Rejoining own session if name matches
            if (activeLocationSess.customerName.toLowerCase() === name.toLowerCase()) {
                activeSession = activeLocationSess;
                localStorage.setItem('cs_active_session_id', activeLocationSess.id);
                elements.customerInfoModal.classList.remove('open');
                listenToSessionChanges(activeLocationSess.id);
                syncRunningBill();
                alert(`Welcome back, ${name}! Rejoining your active session for ${locationLabel}.`);
                return;
            } else {
                // Different name! Ask to join the session
                const join = confirm(`${locationLabel} already has an active ordering session started by ${activeLocationSess.customerName}.\n\nWould you like to join their group and order together on the same bill?`);
                if (join) {
                    activeSession = activeLocationSess;
                    localStorage.setItem('cs_active_session_id', activeLocationSess.id);
                    elements.customerInfoModal.classList.remove('open');
                    listenToSessionChanges(activeLocationSess.id);
                    syncRunningBill();
                    alert(`Joined active session started by ${activeLocationSess.customerName}. You can now order together!`);
                    return;
                } else {
                    // Send notification to Admin that another person is trying to access the same table/room!
                    try {
                        await db.requests.add(localTableNum, `duplicate_session:${name} tried to access this location, but declined joining ${activeLocationSess.customerName}'s session.`, locationLabel);
                    } catch (err) {
                        console.error("Failed to notify admin of duplicate session access: ", err);
                    }
                    // Do not allow starting a duplicate active session on the same occupied location
                    alert(`Cannot start a new session on ${locationLabel} while it is occupied. Please wait or select another table.`);
                    return;
                }
            }
        }

        const session = await db.sessions.create(localTableNum, name, phone, locationLabel, zone);
        activeSession = session;
        localStorage.setItem('cs_active_session_id', session.id);
        elements.customerInfoModal.classList.remove('open');
        listenToSessionChanges(session.id);
        alert(`Welcome, ${name}! Your ordering session is active for ${locationLabel}.`);
    } catch (e) {
        console.error(e);
        alert("Failed to start session. Please try again.");
    }
}

function listenToSessionChanges(sessionId) {
    if (activeSessionListener) activeSessionListener(); // Clear old listener

    // Listen to changes in this session (e.g. if Cashier marks table as Paid)
    if (db.isFirebase) {
        // Firestore real-time listener
        import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js").then(({ doc, onSnapshot }) => {
            const { getFirestore } = doc; // Reference helper
            // We use global db to listen
            db.sessions.listen((sessions) => {
                const updated = sessions.find(s => s.id === sessionId);
                if (updated) {
                    handleSessionUpdate(updated);
                }
            });
        });
    } else {
        // Fallback polling or mock trigger
        db.sessions.listen((sessions) => {
            const updated = sessions.find(s => s.id === sessionId);
            if (updated) {
                handleSessionUpdate(updated);
            }
        });
    }
}

function handleSessionUpdate(session) {
    activeSession = session;
    
    // If table session is marked paid/closed, close it out locally
    if (session.status === 'paid') {
        localStorage.removeItem('cs_active_session_id');
        elements.paymentModal.classList.remove('open');
        elements.billOptionsModal.classList.remove('open');
        
        // Play payment success sound
        soundEffects.playPayment();
        
        // Show feedback modal
        elements.feedbackModal.classList.add('open');
        
        // Reset local session state
        activeSession = null;
        cart = {};
        updateCartUI();
        elements.liveOrderTracker.style.display = 'none';
        if (activeOrdersListener) {
            activeOrdersListener();
            activeOrdersListener = null;
        }
    } else {
        syncRunningBill();
        if (elements.cartDrawer.classList.contains('open')) {
            renderCartDrawerList();
        }
        updateCartUI();
    }
}

// ==========================================================================
// 3. MENU RENDERING & CARTS
// ==========================================================================

function loadCategories(categories) {
    menuCategories = categories.filter(c => c.active);
    
    // Add "All Items" Category pill
    let html = `<button class="category-pill active" data-category="all">All</button>`;
    menuCategories.forEach(cat => {
        html += `<button class="category-pill" data-category="${cat.id}">${cat.name}</button>`;
    });
    elements.categoriesList.innerHTML = html;
    
    // Set pill click listeners
    const pills = elements.categoriesList.querySelectorAll('.category-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentCategory = pill.dataset.category;
            renderMenu();
        });
    });
}

function loadProducts(products) {
    menuProducts = products;
    renderMenu();
}

function renderMenu() {
    let filteredProducts = [...menuProducts];
    
    // Filter by Category
    if (currentCategory !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.categoryId === currentCategory);
    }
    
    // Filter by Search Query
    if (searchQuery) {
        filteredProducts = filteredProducts.filter(p => 
            p.name.toLowerCase().includes(searchQuery) || 
            p.description.toLowerCase().includes(searchQuery)
        );
    }

    if (filteredProducts.length === 0) {
        elements.menuContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--color-text-muted);">
                <i class="fa-solid fa-cookie-bite" style="font-size: 2.5rem; margin-bottom: 12px; color: var(--color-accent-gold);"></i>
                <p>No items found. Try searching for something else!</p>
            </div>
        `;
        return;
    }

    // Group items by category to make a beautiful menu layout
    const productsByCategory = {};
    filteredProducts.forEach(prod => {
        if (!productsByCategory[prod.categoryId]) {
            productsByCategory[prod.categoryId] = [];
        }
        productsByCategory[prod.categoryId].push(prod);
    });

    let html = "";
    
    // Order categories as defined in categories collection
    const orderedCategories = [...menuCategories];
    
    orderedCategories.forEach(cat => {
        const items = productsByCategory[cat.id];
        if (items && items.length > 0) {
            html += `
                <div class="menu-category-section animate-fade-in-up">
                    <h2 class="section-title">
                        ${cat.name} <span>${items.length} Items</span>
                    </h2>
                    <div class="product-list">
            `;
            
            items.forEach(prod => {
                const cartQty = cart[prod.id] ? cart[prod.id].quantity : 0;
                const isPopular = prod.isPopular ? `<span class="popular-tag">Popular</span>` : ``;
                const isAvailable = prod.isAvailable !== false;
                
                let actionBtnHTML = "";
                let cardClass = "product-card";
                let imgOverlay = isPopular;

                if (!isAvailable) {
                    cardClass = "product-card out-of-stock-card";
                    imgOverlay = `<span class="out-of-stock-badge">Sold Out</span>`;
                    actionBtnHTML = `
                        <button class="add-btn disabled" disabled style="background-color:var(--color-border); color:var(--color-text-muted); cursor:not-allowed; border-color:var(--color-border);">SOLD OUT</button>
                    `;
                } else if (cartQty > 0) {
                    actionBtnHTML = `
                        <div class="qty-selector">
                            <button class="qty-btn dec-qty" data-prod-id="${prod.id}">-</button>
                            <span class="qty-val">${cartQty}</span>
                            <button class="qty-btn inc-qty" data-prod-id="${prod.id}">+</button>
                        </div>
                    `;
                } else {
                    actionBtnHTML = `
                        <button class="add-btn" data-prod-id="${prod.id}">ADD</button>
                    `;
                }

                html += `
                    <div class="${cardClass}">
                        <div class="product-img-container">
                            <img src="${prod.image}" alt="${prod.name}" onerror="this.src='https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300'">
                            ${imgOverlay}
                        </div>
                        <div class="product-details">
                            <div class="product-info">
                                <h3>${prod.name}</h3>
                                <p>${prod.description}</p>
                            </div>
                            <div class="product-price-action">
                                <span class="price-tag">₹${prod.price}</span>
                                ${actionBtnHTML}
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
    });

    elements.menuContainer.innerHTML = html;
    
    // Bind Add & Qty button triggers
    bindMenuCartButtons();
}

function bindMenuCartButtons() {
    // ADD Buttons
    elements.menuContainer.querySelectorAll('.add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pId = e.target.dataset.prodId;
            updateCartQty(pId, 1);
        });
    });

    // Increase Qty Buttons
    elements.menuContainer.querySelectorAll('.inc-qty').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pId = e.target.dataset.prodId;
            updateCartQty(pId, cart[pId].quantity + 1);
        });
    });

    // Decrease Qty Buttons
    elements.menuContainer.querySelectorAll('.dec-qty').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pId = e.target.dataset.prodId;
            updateCartQty(pId, cart[pId].quantity - 1);
        });
    });
}

function updateCartQty(productId, newQty) {
    if (newQty <= 0) {
        delete cart[productId];
    } else {
        if (!cart[productId]) {
            const product = menuProducts.find(p => p.id === productId);
            cart[productId] = {
                product,
                quantity: newQty,
                notes: ""
            };
        } else {
            cart[productId].quantity = newQty;
        }
    }
    
    updateCartUI();
    renderMenu(); // Re-render menu to update card qty counts
}

function updateCartUI() {
    const keys = Object.keys(cart);
    let totalItems = 0;
    let totalPrice = 0;
    
    keys.forEach(pId => {
        totalItems += cart[pId].quantity;
        totalPrice += (cart[pId].product.price * cart[pId].quantity);
    });

    if (totalItems > 0) {
        elements.cartFloatingBar.style.display = 'flex';
        elements.cartItemsCount.innerText = `${totalItems} ${totalItems === 1 ? 'Item' : 'Items'}`;
        elements.cartTotalPrice.innerText = `₹${totalPrice}`;
    } else {
        elements.cartFloatingBar.style.display = 'none';
        closeCartDrawer();
    }
}

// ==========================================================================
// 4. CART DRAWER OPERATIONS
// ==========================================================================

function openCartDrawer() {
    elements.drawerBackdrop.style.display = 'block';
    setTimeout(() => {
        elements.cartDrawer.classList.add('open');
    }, 10);
    renderCartDrawerList();
}

function closeCartDrawer() {
    elements.cartDrawer.classList.remove('open');
    setTimeout(() => {
        elements.drawerBackdrop.style.display = 'none';
    }, 300);
}

function renderCartDrawerList() {
    const cartKeys = Object.keys(cart);
    let html = "";
    let subtotal = 0;

    cartKeys.forEach(pId => {
        const item = cart[pId];
        const rowTotal = item.product.price * item.quantity;
        subtotal += rowTotal;

        html += `
            <div class="cart-item-row">
                <div class="cart-item-info">
                    <span class="cart-item-name">${item.product.name}</span>
                    <div class="cart-item-price">₹${item.product.price} each</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div class="qty-selector" style="background-color: var(--color-primary-mid);">
                        <button class="qty-btn" style="padding:4px 10px;" onclick="updateDrawerQty('${pId}', ${item.quantity - 1})">-</button>
                        <span class="qty-val" style="font-size:0.8rem;">${item.quantity}</span>
                        <button class="qty-btn" style="padding:4px 10px;" onclick="updateDrawerQty('${pId}', ${item.quantity + 1})">+</button>
                    </div>
                    <span style="font-family:var(--font-heading); font-weight:700; font-size:0.95rem; width:55px; text-align:right;">
                        ₹${rowTotal}
                    </span>
                </div>
            </div>
        `;
    });

    // Make global helper accessible inline
    window.updateDrawerQty = (id, val) => {
        updateCartQty(id, val);
        renderCartDrawerList();
    };

    elements.cartItemsList.innerHTML = html;
    
    // Calculations
    const tax = gstEnabled ? Math.round(subtotal * 0.05) : 0;
    let grandTotal = subtotal + tax;

    elements.drawerSubtotal.innerText = `₹${subtotal}`;
    elements.drawerTax.innerText = `₹${tax}`;
    
    // Display running bill details if session exists
    if (activeSession && activeSession.totalAmount > 0) {
        elements.runningBillMergeRow.style.display = 'flex';
        elements.runningSessionAmount.innerText = `₹${activeSession.totalAmount}`;
        grandTotal += activeSession.totalAmount;
    } else {
        elements.runningBillMergeRow.style.display = 'none';
    }

    elements.drawerGrandTotal.innerText = `₹${grandTotal}`;
}

async function syncRunningBill() {
    if (!activeSession) {
        elements.runningBillSection.style.display = 'none';
        return;
    }
    
    const orders = await new Promise((resolve) => {
        db.orders.listen(allOrders => {
            const sessionOrders = allOrders.filter(o => o.sessionId === activeSession.id && o.status !== 'cancelled');
            resolve(sessionOrders);
        });
    });

    if (orders.length === 0) {
        elements.runningBillSection.style.display = 'none';
        return;
    }

    // Set up live status listener for the most recent order in the queue
    const activeOrder = orders[0]; // first one since listen sorts desc by date
    if (activeOrder && (activeOrder.status !== 'served')) {
        setupOrderTracker(activeOrder);
    } else {
        elements.liveOrderTracker.style.display = 'none';
    }

    // Render list of previously ordered items
    let html = "";
    const mergedItems = {};
    orders.forEach(o => {
        o.items.forEach(item => {
            if (!mergedItems[item.productId]) {
                mergedItems[item.productId] = { name: item.name, quantity: 0, price: item.price };
            }
            mergedItems[item.productId].quantity += item.quantity;
        });
    });

    Object.keys(mergedItems).forEach(id => {
        const item = mergedItems[id];
        html += `
            <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.8rem;">
                <span>${item.name} <strong style="color:var(--color-primary-deep)">x${item.quantity}</strong></span>
                <span>₹${item.price * item.quantity}</span>
            </div>
        `;
    });
    
    elements.runningBillList.innerHTML = html;
    elements.runningBillSection.style.display = 'block';
}

// ==========================================================================
// 5. PLACING AN ORDER & LIVE TRACKING
// ==========================================================================

async function handlePlaceOrder() {
    if (Object.keys(cart).length === 0) {
        alert("Your cart is empty!");
        return;
    }

    // Double check session
    if (!activeSession) {
        // Show session creation popup
        elements.customerInfoModal.classList.add('open');
        closeCartDrawer();
        return;
    }

    const orderItems = Object.keys(cart).map(pId => {
        const item = cart[pId];
        return {
            productId: pId,
            name: item.product.name,
            quantity: item.quantity,
            price: item.product.price,
            notes: item.notes || ""
        };
    });

    const newOrder = {
        sessionId: activeSession.id,
        tableNumber,
        customerName: activeSession.customerName,
        items: orderItems,
        notes: elements.orderNotes.value.trim()
    };

    elements.btnPlaceOrder.disabled = true;
    elements.btnPlaceOrder.innerText = "Placing Order...";

    try {
        const orderId = await db.orders.add(newOrder);
        activeOrderId = orderId;
        
        // Play Chime
        soundEffects.playOrder();
        
        // Success Alert and Drawer Reset
        alert("Your order has been sent to the Kitchen!");
        cart = {};
        elements.orderNotes.value = "";
        updateCartUI();
        closeCartDrawer();
        renderMenu();

        // Listen for status changes on the placed order
        listenToOrderStatus(orderId);
    } catch (e) {
        console.error(e);
        alert("Failed to place order. Please try again.");
    } finally {
        elements.btnPlaceOrder.disabled = false;
        elements.btnPlaceOrder.innerText = "Place Kitchen Order";
    }
}

function listenToOrderStatus(orderId) {
    if (activeOrdersListener) activeOrdersListener(); // Unsubscribe old

    // Live Firestore tracking
    db.orders.listen(orders => {
        const order = orders.find(o => o.id === orderId);
        if (order) {
            setupOrderTracker(order);
        }
    });
}

function setupOrderTracker(order) {
    elements.trackerOrderId.innerText = `ID: #${order.id.slice(-6).toUpperCase()}`;
    elements.liveOrderTracker.style.display = 'block';

    const steps = ['received', 'preparing', 'ready', 'served'];
    const currentIdx = steps.indexOf(order.status);

    // Reset status steps UI
    elements.stepReceived.className = "step-node";
    elements.stepPreparing.className = "step-node";
    elements.stepReady.className = "step-node";
    elements.stepServed.className = "step-node";

    if (currentIdx >= 0) elements.stepReceived.classList.add('completed');
    if (currentIdx >= 1) elements.stepPreparing.classList.add('completed');
    if (currentIdx >= 2) elements.stepReady.classList.add('completed');
    if (currentIdx >= 3) elements.stepServed.classList.add('completed');

    // Highlight current active step
    if (order.status === 'received') elements.stepReceived.className = "step-node active";
    if (order.status === 'preparing') elements.stepPreparing.className = "step-node active";
    if (order.status === 'ready') elements.stepReady.className = "step-node active";
    if (order.status === 'served') {
        elements.stepServed.className = "step-node active";
        // Hide tracker after order is marked served
        setTimeout(() => {
            elements.liveOrderTracker.style.display = 'none';
        }, 8000);
    }
}

// ==========================================================================
// 6. WAITER ASSISTANCE & SERVICE REQUESTS
// ==========================================================================

async function handleWaiterCall() {
    try {
        const loc = activeSession?.locationLabel || ("Table " + tableNumber);
        await db.requests.add(tableNumber, 'waiter', loc);
        soundEffects.playWaiter(); // chime call locally
        elements.waiterConfirmModal.classList.remove('open');
        alert("Assistance requested! Staff will be at " + loc + " shortly.");
    } catch (e) {
        console.error(e);
        alert("Failed to send waiter request. Please notify staff at counter.");
    }
}

async function handlePrintedBillRequest() {
    try {
        const loc = activeSession?.locationLabel || ("Table " + tableNumber);
        await db.requests.add(tableNumber, 'bill_printed', loc);
        elements.billOptionsModal.classList.remove('open');
        alert("Printed bill requested. Staff is bringing the invoice to " + loc);
    } catch (e) {
        console.error(e);
        alert("Failed to send request.");
    }
}

// ==========================================================================
// 7. INVOICE GENERATION & UPI PAYMENT
// ==========================================================================

async function handleDigitalBillRequest() {
    try {
        const loc = activeSession?.locationLabel || ("Table " + tableNumber);
        await db.requests.add(tableNumber, 'bill_digital', loc);
        elements.billOptionsModal.classList.remove('open');
        
        // Fetch all orders placed in this session
        db.orders.listen(async (allOrders) => {
            const sessionOrders = allOrders.filter(o => o.sessionId === activeSession.id && o.status !== 'cancelled');
            
            if (sessionOrders.length === 0) {
                alert("No orders placed yet!");
                return;
            }
            
            // 1. Generate & Download PDF Invoice
            generateInvoicePDF(activeSession, sessionOrders);
            
            // 2. Open UPI QR Code Modal
            openUPIPaymentModal(activeSession.totalAmount);
        });
    } catch (e) {
        console.error(e);
        alert("Failed to request digital bill.");
    }
}

function generateInvoicePDF(session, orders) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: [80, 180] // Receipt printer dimensions (80mm width)
    });

    const margin = 5;
    let y = 10;

    // Header styling
    doc.setFont("Outfit", "bold");
    doc.setFontSize(14);
    doc.setTextColor(12, 43, 32); // Deep Green
    doc.text("CHAI SHOTTS CAFE", 40, y, { align: "center" });
    
    y += 5;
    doc.setFont("Inter", "normal");
    doc.setFontSize(8);
    doc.setTextColor(94, 111, 104);
    doc.text("Shop no, 27 to 32, harij road, Omvedarkconplex,", 40, y, { align: "center" });
    
    y += 4;
    doc.text("sudama circle, Patan, Gujarat 384265", 40, y, { align: "center" });
    
    y += 4;
    doc.text("GSTIN: ", 40, y, { align: "center" });
    
    y += 5;
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, 80 - margin, y);

    // Bill Details
    y += 6;
    doc.setFont("Inter", "bold");
    doc.setFontSize(8);
    doc.setTextColor(12, 43, 32);
    doc.text(`Location: ${session.locationLabel || "Table " + session.tableNumber}`, margin, y);
    doc.text(`Date: ${new Date(session.createdAt).toLocaleDateString()}`, 80 - margin, y, { align: "right" });
    
    y += 4;
    doc.setFont("Inter", "normal");
    doc.text(`Cust: ${session.customerName}`, margin, y);
    doc.text(`Time: ${new Date(session.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`, 80 - margin, y, { align: "right" });
    
    y += 4;
    doc.text(`Invoice: INV-${session.id.slice(-6).toUpperCase()}`, margin, y);

    y += 4;
    doc.line(margin, y, 80 - margin, y);

    // Table Header
    y += 5;
    doc.setFont("Inter", "bold");
    doc.text("Item Name", margin, y);
    doc.text("Qty", 52, y, { align: "right" });
    doc.text("Amount", 80 - margin, y, { align: "right" });

    // Merging items
    const merged = {};
    orders.forEach(o => {
        o.items.forEach(item => {
            if (!merged[item.productId]) {
                merged[item.productId] = { name: item.name, qty: 0, price: item.price };
            }
            merged[item.productId].qty += item.quantity;
        });
    });

    y += 2;
    doc.line(margin, y, 80 - margin, y);
    
    doc.setFont("Inter", "normal");
    let subtotal = 0;
    
    Object.keys(merged).forEach(id => {
        const item = merged[id];
        const rowAmount = item.qty * item.price;
        subtotal += rowAmount;
        y += 5;
        
        // Print truncated item name if too long
        let itemName = item.name;
        if (itemName.length > 20) itemName = itemName.slice(0, 18) + "..";
        
        doc.text(itemName, margin, y);
        doc.text(`${item.qty}`, 52, y, { align: "right" });
        doc.text(`₹${rowAmount}`, 80 - margin, y, { align: "right" });
    });

    y += 4;
    doc.line(margin, y, 80 - margin, y);

    // Calculation Lines
    const tax = gstEnabled ? Math.round(subtotal * 0.05) : 0; // 5% total GST if enabled
    const cgst = (tax / 2).toFixed(2);
    const sgst = (tax / 2).toFixed(2);
    const grandTotal = subtotal + tax;

    y += 5;
    doc.text("Subtotal:", 48, y, { align: "right" });
    doc.text(`₹${subtotal}`, 80 - margin, y, { align: "right" });

    if (gstEnabled) {
        y += 4;
        doc.text("CGST (2.5%):", 48, y, { align: "right" });
        doc.text(`₹${cgst}`, 80 - margin, y, { align: "right" });

        y += 4;
        doc.text("SGST (2.5%):", 48, y, { align: "right" });
        doc.text(`₹${sgst}`, 80 - margin, y, { align: "right" });
    }

    y += 5;
    doc.setFont("Inter", "bold");
    doc.setFontSize(10);
    doc.text("Grand Total:", 48, y, { align: "right" });
    doc.text(`₹${grandTotal}`, 80 - margin, y, { align: "right" });

    y += 7;
    doc.setFont("Outfit", "bold");
    doc.setFontSize(9);
    doc.text("Thank You for Visiting!", 40, y, { align: "center" });
    
    y += 4;
    doc.setFont("Inter", "normal");
    doc.setFontSize(7);
    doc.text("Visit again to satisfy your Chai cravings.", 40, y, { align: "center" });

    // Save and Trigger auto-download
    doc.save(`Invoice_Table_${session.tableNumber}.pdf`);
}

function openUPIPaymentModal(amount) {
    const finalTotal = gstEnabled ? Math.round(amount * 1.05) : amount;
    elements.paymentAmount.innerText = `₹${finalTotal}`;
    elements.paymentModal.classList.add('open');
    
    // Configure Merchant UPI Details
    const merchantUPI = "chaishotts@upi"; // Chai Shotts Payee Address
    const payeeName = "Chai Shotts Cafe";
    const transactionNote = `${activeSession?.locationLabel || "Table " + tableNumber} Ordering Bill`;
    
    // Generate UPI URL
    const upiUrl = `upi://pay?pa=${encodeURIComponent(merchantUPI)}&pn=${encodeURIComponent(payeeName)}&am=${finalTotal}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;
    
    // Generate QR Code on Canvas using QRious
    new QRious({
        element: elements.upiQrCanvas,
        value: upiUrl,
        size: 180,
        background: '#ffffff',
        foreground: '#0c2b20', // Emerald Green QR Code
        level: 'H'
    });
}

async function handleSimulatedPayment() {
    if (!activeSession) return;
    
    try {
        await db.sessions.close(activeSession.id, 'UPI');
        // The listener on snapshot will close modal and trigger rating screen automatically
    } catch (e) {
        console.error(e);
        alert("Failed to simulate payment.");
    }
}

// ==========================================================================
// 8. CUSTOMER FEEDBACK & RATINGS
// ==========================================================================

async function handleSubmitFeedback() {
    const feedbackVal = elements.feedbackText.value.trim();
    
    const foodRating = parseInt(document.querySelector('[data-type="food"]').parentElement.dataset.value || 0);
    const serviceRating = parseInt(document.querySelector('[data-type="service"]').parentElement.dataset.value || 0);

    if (foodRating === 0 || serviceRating === 0) {
        alert("Please select star ratings for both food and service.");
        return;
    }

    // Save feedback to Firestore or MockDB
    const feedbackObject = {
        tableNumber,
        foodRating,
        serviceRating,
        feedback: feedbackVal,
        createdAt: Date.now()
    };

    try {
        // Save in requests list as a completed feedback action log
        const loc = activeSession?.locationLabel || ("Table " + tableNumber);
        await db.requests.add(tableNumber, `feedback: Food ${foodRating}*, Service ${serviceRating}* - "${feedbackVal}"`, loc);
        elements.feedbackModal.classList.remove('open');
        alert("Thank you so much for your rating!");
        
        // Reload page to start fresh
        if (activeSession && activeSession.orderZone === 'table') {
            window.location.search = `?table=${tableNumber}`;
        } else {
            window.location.href = 'index.html';
        }
    } catch (e) {
        console.error(e);
        alert("Failed to save feedback.");
    }
}
