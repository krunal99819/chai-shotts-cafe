import db, { cleanPhoneNumber } from './db.js?v=20';
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
let globalSettings = {}; // Cache global configuration settings

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
    
    // Parse Table Number from URL
    const urlParams = new URLSearchParams(window.location.search);
    const tableParam = urlParams.get('table');

    if (savedSessionId) {
        try {
            const savedSession = await db.sessions.getSession(savedSessionId);
            
            // If scanning a NEW table, ignore the old saved session
            if (tableParam && savedSession && savedSession.tableNumber !== parseInt(tableParam)) {
                localStorage.removeItem('cs_active_session_id');
            } else if (savedSession && savedSession.status === 'open') {
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
    
    // Load global settings (GST, Timings, Overrides)
    db.settings.listen(settings => {
        globalSettings = settings || {};
        gstEnabled = globalSettings.gstEnabled || false;
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
            phoneLabel.innerHTML = 'Mobile Number *';
        }
    });

    // Search and Filters
    elements.menuSearch.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderMenu();
    });

    // Zomato style category floating menu triggers
    const floatBtn = document.getElementById('floatingCategoryBtn');
    const floatMenu = document.getElementById('floatingCategoryMenu');
    const closeFloatMenu = document.getElementById('closeFloatingMenu');

    if (floatBtn && floatMenu) {
        floatBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            floatMenu.classList.toggle('open');
        });
        
        document.addEventListener('click', (e) => {
            if (!floatMenu.contains(e.target) && e.target !== floatBtn) {
                floatMenu.classList.remove('open');
            }
        });
    }
    if (closeFloatMenu && floatMenu) {
        closeFloatMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            floatMenu.classList.remove('open');
        });
    }

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
        openBillSummaryModal();
    });
    elements.btnCloseBillOptions.addEventListener('click', () => {
        elements.billOptionsModal.classList.remove('open');
    });
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
    // We no longer silently adopt the active session here.
    // Instead, we force the user to enter their name/phone.
    // handleCreateSession() will take care of joining or rejecting.
    elements.customerInfoModal.classList.add('open');
}

async function handleCreateSession() {
    const originalBtnText = elements.btnStartSession.innerHTML;
    elements.btnStartSession.disabled = true;
    elements.btnStartSession.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    
    try {
        if (!isStoreOpen(globalSettings)) {
            const start = globalSettings.startTime || "12:00";
            const end = globalSettings.endTime || "01:00";
            alert(`Chai Shotts is currently closed.\nOnline Ordering hours: ${formatTime12h(start)} to ${formatTime12h(end)}.\nOrders can only be accepted during these hours unless manual overrides are enabled.`);
            return;
        }

        const name = elements.custNameInput.value.trim();
        const phone = elements.custPhoneInput.value.trim();
        const zone = elements.orderZoneSelect.value;
        const cleanedPhone = cleanPhoneNumber(phone);
        
        if (!name) {
            alert("Please enter your name to start ordering.");
            return;
        }

        if (!cleanedPhone || cleanedPhone.length !== 10) {
            alert("Please enter a valid 10-digit Mobile Number (compulsory to start ordering).");
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
            const roomNum = parseInt(room.replace(/\D/g, ''));
            if (isNaN(roomNum) || roomNum < 201 || roomNum > 216) {
                alert("Only Room Numbers between 201 and 216 are allowed for Hotel Relax Inn.");
                return;
            }
            localTableNum = 10;
            locationLabel = `Room ${roomNum} (HOTEL RELAX INN)`;
        } else if (zone === 'other') {
            const place = elements.otherPlaceInput.value.trim();
            if (!place) {
                alert("Please specify your place/address.");
                return;
            }
            localTableNum = 11;
            locationLabel = `${place} (Takeaway/Delivery)`;
        }

        tableNumber = localTableNum;
        elements.tableIndicator.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${locationLabel}`;

        const sessions = await db.sessions.getAllOpen();
        const activeLocationSess = sessions.find(s => s.tableNumber === localTableNum && (localTableNum < 10 ? true : s.locationLabel.toLowerCase() === locationLabel.toLowerCase()));
        
        if (activeLocationSess) {
            if (activeLocationSess.customerName.toLowerCase() === name.toLowerCase()) {
                activeSession = activeLocationSess;
                localStorage.setItem('cs_active_session_id', activeLocationSess.id);
                elements.customerInfoModal.classList.remove('open');
                listenToSessionChanges(activeLocationSess.id);
                syncRunningBill();
                alert(`Welcome back, ${name}! Rejoining your active session for ${locationLabel}.`);
                return;
            } else {
                elements.btnStartSession.innerHTML = '<i class="fa-solid fa-clock"></i> Waiting for Admin Approval...';
                
                // Submit join request
                const reqId = await db.requests.add(localTableNum, "join_session", locationLabel, {
                    joinName: name,
                    joinPhone: cleanedPhone,
                    joinZone: zone,
                    sessionId: activeLocationSess.id
                });
                
                // Wait for admin approval
                await new Promise((resolve, reject) => {
                    const unsub = db.requests.listenOne(reqId, (reqData) => {
                        if (reqData.status === 'completed') { // Admin approved
                            unsub();
                            resolve(true);
                        } else if (reqData.status === 'rejected') { // Admin rejected
                            unsub();
                            resolve(false);
                        }
                    });
                }).then(async (approved) => {
                    if (approved) {
                        activeSession = activeLocationSess;
                        localStorage.setItem('cs_active_session_id', activeLocationSess.id);
                        elements.customerInfoModal.classList.remove('open');
                        listenToSessionChanges(activeLocationSess.id);
                        syncRunningBill();
                        alert(`Joined active session started by ${activeLocationSess.customerName}. You can now order together!`);
                    } else {
                        alert(`Request to join ${locationLabel} was rejected by Admin.\nPlease choose an available table.`);
                        elements.custTableInput.value = "";
                        
                        // Add red notice
                        let notice = document.getElementById('tableNoticeMsg');
                        if (!notice) {
                            notice = document.createElement('div');
                            notice.id = 'tableNoticeMsg';
                            notice.style.color = 'red';
                            notice.style.fontSize = '0.85rem';
                            notice.style.marginTop = '4px';
                            elements.custTableInput.parentNode.appendChild(notice);
                        }
                        notice.innerText = `Change table number because ${locationLabel} is already occupied.`;
                    }
                });
                return;
            }
        }

        const session = await db.sessions.create(localTableNum, name, cleanedPhone, locationLabel, zone);
        activeSession = session;
        localStorage.setItem('cs_active_session_id', session.id);
        elements.customerInfoModal.classList.remove('open');
        listenToSessionChanges(session.id);
        alert(`Welcome, ${name}! Your ordering session is active for ${locationLabel}.`);
        
        let notice = document.getElementById('tableNoticeMsg');
        if (notice) notice.remove();
        
    } catch (e) {
        console.error(e);
        alert("Failed to start session. Please try again.");
    } finally {
        elements.btnStartSession.disabled = false;
        elements.btnStartSession.innerHTML = originalBtnText;
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
    
    // Render loyalty card progress
    renderLoyaltyCard(session);
    
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
        
        // Hide loyalty card
        renderLoyaltyCard(null);
        
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

function renderLoyaltyCard(session) {
    const container = document.getElementById('loyaltyCardContainer');
    const statusText = document.getElementById('loyaltyStatusText');
    const stampsGrid = document.getElementById('loyaltyStampsGrid');
    
    if (!container || !statusText || !stampsGrid) return;
    
    if (!session || !session.customerPhone) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    const step = session.loyaltyStep || 1;
    const cycleStep = (step - 1) % 10; // 0-indexed step in the 10-stamp card
    
    let nextRewardMsg = "";
    if (cycleStep < 2) nextRewardMsg = `(Next Reward: Free Cold Coffee at Step 3)`;
    else if (cycleStep < 4) nextRewardMsg = `(Next Reward: 10% OFF Bill at Step 5)`;
    else if (cycleStep < 6) nextRewardMsg = `(Next Reward: Free Margherita Pizza at Step 7)`;
    else if (cycleStep < 9) nextRewardMsg = `(Next Reward: Free Private Movie Room at Step 10)`;
    else nextRewardMsg = `(Completed! You are on Step 10. Private Movie Room Free!)`;

    statusText.innerText = `Step ${cycleStep + 1} of 10 ${nextRewardMsg}`;
    
    let gridHtml = "";
    for (let i = 0; i < 10; i++) {
        let classes = "loyalty-stamp-slot";
        let content = "";
        
        if (i < cycleStep) {
            classes += " stamped";
            content = `<span class="loyalty-stamp-number">${i + 1}</span>`;
        } else if (i === cycleStep) {
            classes += " active-step";
            content = `<span class="loyalty-stamp-number">${i + 1}</span>`;
        } else {
            content = `<span class="loyalty-stamp-number">${i + 1}</span>`;
        }
        
        // Add little label tag inside slots for rewards
        let rewardTag = "";
        if (i === 2) rewardTag = `<span class="loyalty-stamp-gift"><i class="fa-solid fa-glass-water"></i> Coffee</span>`;
        else if (i === 4) rewardTag = `<span class="loyalty-stamp-gift"><i class="fa-solid fa-percent"></i> 10% Off</span>`;
        else if (i === 6) rewardTag = `<span class="loyalty-stamp-gift"><i class="fa-solid fa-pizza-slice"></i> Pizza</span>`;
        else if (i === 9) rewardTag = `<span class="loyalty-stamp-gift"><i class="fa-solid fa-film"></i> Movie</span>`;
        
        gridHtml += `
            <div class="${classes}">
                ${content}
                ${rewardTag}
            </div>
        `;
    }
    stampsGrid.innerHTML = gridHtml;
}

// ==========================================================================
// 3. MENU RENDERING & CARTS
// ==========================================================================

function loadCategories(categories) {
    menuCategories = categories.filter(c => c.active);
    
    // Add "All Items" Category pill
    let html = `<button class="category-pill active" data-category="all">All</button>`;
    getSortedCategories().forEach(cat => {
        html += `<button class="category-pill" data-category="${cat.id}">${cat.name}</button>`;
    });
    elements.categoriesList.innerHTML = html;
    
    // Set pill click listeners
    const pills = elements.categoriesList.querySelectorAll('.category-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            const catId = pill.dataset.category;
            
            currentCategory = catId;
            renderMenu();
            renderFloatingCategoryMenu();
            
            // Scroll to menu top
            elements.menuContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
    renderFloatingCategoryMenu();
}

function loadProducts(products) {
    menuProducts = products;
    renderMenu();
    renderFloatingCategoryMenu();
}

function renderMenu() {
    let filteredProducts = [...menuProducts];
    
    // Filter by Search Query
    if (searchQuery) {
        filteredProducts = filteredProducts.filter(p => 
            p.name.toLowerCase().includes(searchQuery) || 
            p.description.toLowerCase().includes(searchQuery)
        );
    }

    // 1. If we are in "All Categories" view and NOT searching, show the Category Grid
    if (currentCategory === 'all' && !searchQuery) {
        // Hide horizontal categories bar wrappers
        const catWrapper = document.querySelector('.categories-wrapper');
        if (catWrapper) catWrapper.style.display = 'none';
        
        let gridHtml = `
            <div class="explore-menu-section animate-fade-in-up">
                <h2 class="explore-menu-title">Explore Menu</h2>
                <div class="category-grid">
        `;
        
        getSortedCategories().forEach(cat => {
            const catEmoji = getCategoryEmoji(cat);
            const count = menuProducts.filter(p => p.categoryId === cat.id && p.isAvailable !== false).length;
            
            // Skip categories with no available items
            if (count === 0) return;
            
            gridHtml += `
                <div class="category-grid-card" data-category="${cat.id}">
                    <div class="category-grid-icon">
                        ${catEmoji}
                    </div>
                    <div class="category-grid-info">
                        <h3>${cat.name}</h3>
                        <span>${count} Items</span>
                    </div>
                </div>
            `;
        });
        
        gridHtml += `
                </div>
            </div>
        `;
        
        elements.menuContainer.innerHTML = gridHtml;
        
        // Bind click listeners to grid cards
        elements.menuContainer.querySelectorAll('.category-grid-card').forEach(card => {
            card.addEventListener('click', () => {
                const catId = card.dataset.category;
                currentCategory = catId;
                
                // Show horizontal categories bar wrapper
                if (catWrapper) catWrapper.style.display = 'block';
                
                // Sync active horizontal pill
                const pills = elements.categoriesList.querySelectorAll('.category-pill');
                pills.forEach(p => {
                    if (p.dataset.category === catId) {
                        p.classList.add('active');
                        p.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    } else {
                        p.classList.remove('active');
                    }
                });
                
                renderMenu();
                renderFloatingCategoryMenu();
                // Scroll to top
                elements.menuContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
        
        return;
    }

    // 2. If a specific category is selected, or we are searching:
    // Show horizontal categories bar wrapper
    const catWrapper = document.querySelector('.categories-wrapper');
    if (catWrapper) catWrapper.style.display = 'block';
    
    // Filter by selected category (if not searching)
    let displayProducts = filteredProducts;
    if (currentCategory !== 'all' && !searchQuery) {
        displayProducts = filteredProducts.filter(p => p.categoryId === currentCategory);
    }
    
    if (displayProducts.length === 0) {
        let backBtnHTML = "";
        if (currentCategory !== 'all' || searchQuery) {
            backBtnHTML = `<button class="btn-back-categories" style="background:var(--color-primary-deep); color:white; border:none; padding:8px 16px; border-radius:var(--radius-sm); font-weight:600; cursor:pointer; margin-top:12px;"><i class="fa-solid fa-arrow-left"></i> Back to Categories</button>`;
        }
        elements.menuContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--color-text-muted);">
                <i class="fa-solid fa-cookie-bite" style="font-size: 2.5rem; margin-bottom: 12px; color: var(--color-accent-gold);"></i>
                <p>No items found.</p>
                ${backBtnHTML}
            </div>
        `;
        
        const btnBack = elements.menuContainer.querySelector('.btn-back-categories');
        if (btnBack) {
            btnBack.addEventListener('click', () => {
                currentCategory = 'all';
                searchQuery = '';
                if (elements.menuSearch) elements.menuSearch.value = '';
                // Sync active horizontal pill
                const pills = elements.categoriesList.querySelectorAll('.category-pill');
                pills.forEach(p => {
                    if (p.dataset.category === 'all') p.classList.add('active');
                    else p.classList.remove('active');
                });
                renderMenu();
                renderFloatingCategoryMenu();
            });
        }
        return;
    }

    // Group items by category for rendering
    const productsByCategory = {};
    displayProducts.forEach(prod => {
        if (!productsByCategory[prod.categoryId]) {
            productsByCategory[prod.categoryId] = [];
        }
        productsByCategory[prod.categoryId].push(prod);
    });

    let html = "";
    
    // If a specific category is selected, render a "Back" header block
    if (currentCategory !== 'all' && !searchQuery) {
        const catObj = menuCategories.find(c => c.id === currentCategory);
        const catName = catObj ? catObj.name : "Category";
        html += `
            <div class="category-header-bar animate-fade-in-up" style="display:flex; align-items:center; gap:12px; margin-bottom:18px;">
                <button class="btn-back-categories-header" style="background:none; border:none; font-size:0.85rem; color:var(--color-primary-deep); cursor:pointer; padding:6px 12px; border-radius:var(--radius-sm); border:1.5px solid var(--color-border); font-weight:700; display:flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-arrow-left"></i> All Categories
                </button>
                <h2 style="font-size:1.1rem; font-weight:800; color:var(--color-primary-deep); margin:0;">${catName}</h2>
            </div>
        `;
    } else if (searchQuery) {
        html += `
            <div class="category-header-bar animate-fade-in-up" style="display:flex; align-items:center; gap:12px; margin-bottom:18px;">
                <button class="btn-back-categories-header" style="background:none; border:none; font-size:0.85rem; color:var(--color-primary-deep); cursor:pointer; padding:6px 12px; border-radius:var(--radius-sm); border:1.5px solid var(--color-border); font-weight:700; display:flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-arrow-left"></i> Clear Search
                </button>
                <h2 style="font-size:1.1rem; font-weight:800; color:var(--color-primary-deep); margin:0;">Search Results</h2>
            </div>
        `;
    }

    // Render category list section
    const orderedCategories = getSortedCategories();
    orderedCategories.forEach(cat => {
        const items = productsByCategory[cat.id];
        if (items && items.length > 0) {
            html += `
                <div class="menu-category-section animate-fade-in-up" id="cat-header-${cat.id}">
                    <h2 class="section-title" style="margin-top:0;">
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
    
    // Bind back button trigger in header
    const btnBackHeader = elements.menuContainer.querySelector('.btn-back-categories-header');
    if (btnBackHeader) {
        btnBackHeader.addEventListener('click', () => {
            currentCategory = 'all';
            if (searchQuery) {
                searchQuery = '';
                if (elements.menuSearch) elements.menuSearch.value = '';
            }
            
            // Sync active horizontal pill
            const pills = elements.categoriesList.querySelectorAll('.category-pill');
            pills.forEach(p => {
                if (p.dataset.category === 'all') p.classList.add('active');
                else p.classList.remove('active');
            });
            renderMenu();
            renderFloatingCategoryMenu();
        });
    }

    // Bind Add & Qty button triggers
    bindMenuCartButtons();
}

// ── Category display order (matches owner's desired menu sequence) ──
const CATEGORY_ORDER = [
    'savan',          // 0.1  Savan Special
    'waffle',         // 1    Waffles
    'mini',           // 2    Mini
    'nacho',          // 3    Nachos
    'starter',        // 3.1  Starter's
    'sandwich',       // 3.2  Sandwich
    'pancake',        // 4    Pancake
    'burger',         // 5    Burger
    'pizza',          // 6    Pizza
    'garlic',         // 7    Garlic Bread
    'fries',          // 8    Fries
    'maggi',          // 9    Maggie
    'samosa',         // 10   Samosa
    'momo',           // 11   Fry Momos
    'fruit',          // 11.1 Fruit Shots
    'brownie',        // 12   Brownies
    'shake',          // 13   Shakes
    'cold coffee',    // 14   Cold Coffee
    'mojito',         // 14.1 Mojitos & Special Drinks
    'cold drink',     // 14.2 Cold Drinks
    'tea',            // 15   Tea & Coffee
];

function getSortedCategories() {
    return [...menuCategories].sort((a, b) => {
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        let aIdx = CATEGORY_ORDER.length;
        let bIdx = CATEGORY_ORDER.length;
        for (let i = 0; i < CATEGORY_ORDER.length; i++) {
            if (aIdx === CATEGORY_ORDER.length && aName.includes(CATEGORY_ORDER[i])) aIdx = i;
            if (bIdx === CATEGORY_ORDER.length && bName.includes(CATEGORY_ORDER[i])) bIdx = i;
        }
        return aIdx - bIdx;
    });
}

function getCategoryEmoji(cat) {
    const name = (cat.name || '').toLowerCase();
    
    if (name.includes('savan')) return '⭐';
    if (name.includes('waffle')) return '🧇';
    if (name.includes('mini')) return '🍢';
    if (name.includes('nacho')) return '🌮';
    if (name.includes('starter')) return '🥘';
    if (name.includes('sandwich')) return '🥪';
    if (name.includes('pancake')) return '🥞';
    if (name.includes('burger')) return '🍔';
    if (name.includes('pizza')) return '🍕';
    if (name.includes('garlic') || name.includes('bread')) return '🍞';
    if (name.includes('fries')) return '🍟';
    if (name.includes('maggi') || name.includes('noodle')) return '🍜';
    if (name.includes('samosa')) return '🔶';
    if (name.includes('momo') || name.includes('dumpling')) return '🥟';
    if (name.includes('fruit') || name.includes('shot')) return '🍓';
    if (name.includes('brownie')) return '🍫';
    if (name.includes('shake')) return '🥤';
    if (name.includes('cold coffee')) return '🧋';
    if (name.includes('mojito') || name.includes('special drink')) return '🍹';
    if (name.includes('cold drink') || name.includes('soda')) return '🥂';
    if (name.includes('chai') || name.includes('tea') || name.includes('coffee')) return '☕';
    if (name.includes('pasta')) return '🍝';
    if (name.includes('combo') || name.includes('offer')) return '🎁';
    if (name.includes('ice') || name.includes('cream') || name.includes('kulfi')) return '🍦';
    if (name.includes('cake') || name.includes('dessert')) return '🍰';
    
    // Fallback
    return '🍽️';
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

function adjustLoyaltyFreeRewardInCart() {
    if (!activeSession || !activeSession.loyaltyFreeItemReward) return;
    
    const rewardItemName = activeSession.loyaltyFreeItemReward;
    const rewardProductId = `reward_${rewardItemName.replace(/\s+/g, '_').toLowerCase()}`;
    
    // Calculate subtotal of non-free items
    let subtotal = 0;
    Object.keys(cart).forEach(pId => {
        if (pId !== rewardProductId) {
            subtotal += cart[pId].product.price * cart[pId].quantity;
        }
    });
    
    if (subtotal >= 299) {
        if (!cart[rewardProductId]) {
            cart[rewardProductId] = {
                product: {
                    id: rewardProductId,
                    name: `${rewardItemName} (Free Loyalty Reward)`,
                    price: 0,
                    isFree: true
                },
                quantity: 1,
                notes: "Loyalty Program Reward"
            };
        }
    } else {
        if (cart[rewardProductId]) {
            delete cart[rewardProductId];
        }
    }
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
    
    // Adjust loyalty rewards automatically
    adjustLoyaltyFreeRewardInCart();
    
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

        const priceText = item.product.price === 0 ? "Free" : `₹${item.product.price} each`;
        const totalText = item.product.price === 0 ? "Free" : `₹${rowTotal}`;

        html += `
            <div class="cart-item-row">
                <div class="cart-item-info">
                    <span class="cart-item-name">${item.product.name}</span>
                    <div class="cart-item-price">${priceText}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${item.product.isFree ? `<span style="font-size:0.75rem; color:var(--color-accent-gold-dark); font-weight:700;">LOYALTY GIFT</span>` : `
                    <div class="qty-selector" style="background-color: var(--color-primary-mid);">
                        <button class="qty-btn" style="padding:4px 10px;" onclick="updateDrawerQty('${pId}', ${item.quantity - 1})">-</button>
                        <span class="qty-val" style="font-size:0.8rem;">${item.quantity}</span>
                        <button class="qty-btn" style="padding:4px 10px;" onclick="updateDrawerQty('${pId}', ${item.quantity + 1})">+</button>
                    </div>`}
                    <span style="font-family:var(--font-heading); font-weight:700; font-size:0.95rem; width:55px; text-align:right;">
                        ${totalText}
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
    let discount = 0;
    if (activeSession && activeSession.loyaltyDiscountPercent > 0) {
        discount = Math.round(subtotal * (activeSession.loyaltyDiscountPercent / 100));
    }
    
    const taxableSubtotal = Math.max(0, subtotal - discount);
    const tax = gstEnabled ? Math.round(taxableSubtotal * 0.05) : 0;
    let grandTotal = taxableSubtotal + tax;

    elements.drawerSubtotal.innerText = `₹${subtotal}`;
    
    // Render/toggle discount line in UI
    let discountRow = document.getElementById('drawerDiscountRow');
    if (!discountRow) {
        discountRow = document.createElement('div');
        discountRow.id = 'drawerDiscountRow';
        discountRow.className = 'bill-summary-row';
        discountRow.style.color = '#1e7e34';
        discountRow.style.fontWeight = '600';
        elements.drawerSubtotal.parentElement.insertAdjacentElement('afterend', discountRow);
    }
    
    if (discount > 0) {
        discountRow.style.display = 'flex';
        discountRow.innerHTML = `<span>Loyalty Discount (10% Off)</span><span>-₹${discount}</span>`;
    } else {
        discountRow.style.display = 'none';
    }

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
    const bottomContainer = document.getElementById('menuRunningBillContainer');
    const bottomItems = document.getElementById('menuRunningBillItems');
    
    if (!activeSession) {
        elements.runningBillSection.style.display = 'none';
        if (bottomContainer) bottomContainer.style.display = 'none';
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
        if (bottomContainer) bottomContainer.style.display = 'none';
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
    let bottomHtml = "";
    const mergedItems = {};
    let subtotal = 0;

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
        const rowTotal = item.price * item.quantity;
        subtotal += rowTotal;

        const totalText = item.price === 0 ? "Free" : `₹${rowTotal}`;

        html += `
            <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.8rem;">
                <span>${item.name} <strong style="color:var(--color-primary-deep)">x${item.quantity}</strong></span>
                <span>${totalText}</span>
            </div>
        `;
        
        bottomHtml += `
            <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:0.85rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom:4px;">
                <span>${item.name} <strong style="color:var(--color-accent-gold)">x${item.quantity}</strong></span>
                <span style="font-weight:700;">${totalText}</span>
            </div>
        `;
    });
    
    elements.runningBillList.innerHTML = html;
    elements.runningBillSection.style.display = 'block';

    // Update bottom of menu running bill box
    if (bottomContainer && bottomItems) {
        bottomItems.innerHTML = bottomHtml;
        bottomContainer.style.display = 'block';
        
        let discount = 0;
        if (activeSession.loyaltyDiscountPercent > 0) {
            discount = Math.round(subtotal * (activeSession.loyaltyDiscountPercent / 100));
        }
        
        const taxableSubtotal = Math.max(0, subtotal - discount);
        const tax = gstEnabled ? Math.round(taxableSubtotal * 0.05) : 0;
        const grandTotal = taxableSubtotal + tax;
        
        document.getElementById('menuRunningSubtotal').innerText = `₹${subtotal}`;
        
        const discountRow = document.getElementById('menuRunningDiscountRow');
        const discountVal = document.getElementById('menuRunningDiscount');
        if (discount > 0) {
            if (discountRow) discountRow.style.display = 'flex';
            if (discountVal) discountVal.innerText = `-₹${discount}`;
        } else {
            if (discountRow) discountRow.style.display = 'none';
        }
        
        document.getElementById('menuRunningTax').innerText = `₹${tax}`;
        document.getElementById('menuRunningGrandTotal').innerText = `₹${grandTotal}`;
    }
}

function renderFloatingCategoryMenu() {
    const listEl = document.getElementById('floatingCategoryList');
    if (!listEl) return;
    
    let html = "";
    const activeAll = currentCategory === 'all' ? 'active' : '';
    html += `
        <div class="floating-menu-item ${activeAll}" data-category="all">
            <span>All Items</span>
            <span class="floating-menu-count">${menuProducts.length}</span>
        </div>
    `;
    
    getSortedCategories().forEach(cat => {
        const count = menuProducts.filter(p => p.categoryId === cat.id).length;
        const active = currentCategory === cat.id ? 'active' : '';
        html += `
            <div class="floating-menu-item ${active}" data-category="${cat.id}">
                <span>${cat.name}</span>
                <span class="floating-menu-count">${count}</span>
            </div>
        `;
    });
    
    listEl.innerHTML = html;
    
    // Bind click handlers to floating menu items
    listEl.querySelectorAll('.floating-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const catId = item.dataset.category;
            currentCategory = catId;
            
            // Sync horizontal category pills
            const pills = elements.categoriesList.querySelectorAll('.category-pill');
            pills.forEach(p => {
                if (p.dataset.category === catId) {
                    p.classList.add('active');
                    p.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                } else {
                    p.classList.remove('active');
                }
            });
            
            // Re-render menu
            renderMenu();
            
            // Close floating menu
            const floatingMenu = document.getElementById('floatingCategoryMenu');
            if (floatingMenu) floatingMenu.classList.remove('open');
            
            // Scroll to target header
            if (catId === 'all') {
                elements.menuContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                const targetHeader = document.getElementById(`cat-header-${catId}`);
                if (targetHeader) {
                    targetHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    elements.menuContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
            
            // Re-render floating list state
            renderFloatingCategoryMenu();
        });
    });
}

function setupCategoryObserver() {
    if (!('IntersectionObserver' in window)) return;
    
    const observerOptions = {
        root: null,
        rootMargin: '-15% 0px -75% 0px',
        threshold: 0
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const catId = entry.target.id.replace('cat-header-', '');
                
                // Sync the active pill at the top
                const pills = elements.categoriesList.querySelectorAll('.category-pill');
                pills.forEach(p => {
                    if (p.dataset.category === catId) {
                        p.classList.add('active');
                    } else {
                        p.classList.remove('active');
                    }
                });
                
                // Sync the active item in the floating list
                const floatList = document.getElementById('floatingCategoryList');
                if (floatList) {
                    floatList.querySelectorAll('.floating-menu-item').forEach(item => {
                        if (item.dataset.category === catId) {
                            item.classList.add('active');
                        } else {
                            item.classList.remove('active');
                        }
                    });
                }
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.menu-category-section').forEach(section => {
        observer.observe(section);
    });
}

// ==========================================================================
// 5. PLACING AN ORDER & LIVE TRACKING
// ==========================================================================

async function handlePlaceOrder() {
    if (!isStoreOpen(globalSettings)) {
        const start = globalSettings.startTime || "12:00";
        const end = globalSettings.endTime || "01:00";
        alert(`Chai Shotts is currently closed.\nOnline Ordering hours: ${formatTime12h(start)} to ${formatTime12h(end)}.\nOrders can only be accepted during these hours unless manual overrides are enabled.`);
        return;
    }

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

async function openBillSummaryModal() {
    try {
        const itemsBody = document.getElementById('billPopupItemsBody');
        const locSpan = document.getElementById('billPopupLocation');
        const dateSpan = document.getElementById('billPopupDate');
        
        const subtotalSpan = document.getElementById('billPopupSubtotal');
        const discountRow = document.getElementById('billPopupDiscountRow');
        const discountSpan = document.getElementById('billPopupDiscount');
        const taxSpan = document.getElementById('billPopupTax');
        const grandTotalSpan = document.getElementById('billPopupGrandTotal');
        
        if (!itemsBody || !locSpan || !dateSpan || !subtotalSpan || !taxSpan || !grandTotalSpan) return;

        locSpan.innerText = activeSession?.locationLabel || `Table ${tableNumber}`;
        dateSpan.innerText = new Date(activeSession?.createdAt || Date.now()).toLocaleDateString();

        // Fetch all orders placed in this session
        const orders = await new Promise((resolve) => {
            db.orders.listen(allOrders => {
                const sessionOrders = allOrders.filter(o => o.sessionId === activeSession.id && o.status !== 'cancelled');
                resolve(sessionOrders);
            });
        });

        if (orders.length === 0) {
            alert("No orders placed yet!");
            return;
        }

        // Consolidate items
        const merged = {};
        let subtotal = 0;
        orders.forEach(o => {
            o.items.forEach(item => {
                if (!merged[item.productId]) {
                    merged[item.productId] = { name: item.name, qty: 0, price: item.price };
                }
                merged[item.productId].qty += item.quantity;
            });
        });

        let itemsHtml = "";
        Object.keys(merged).forEach(id => {
            const item = merged[id];
            const rowTotal = item.qty * item.price;
            subtotal += rowTotal;
            
            const priceText = item.price === 0 ? "Free" : `₹${rowTotal}`;
            itemsHtml += `
                <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                    <td style="padding: 6px 0;">${item.name}</td>
                    <td style="padding: 6px 0; text-align: center;">${item.qty}</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 700;">${priceText}</td>
                </tr>
            `;
        });
        
        itemsBody.innerHTML = itemsHtml;
        
        // Discount
        let discount = 0;
        if (activeSession && activeSession.loyaltyDiscountPercent > 0) {
            discount = Math.round(subtotal * (activeSession.loyaltyDiscountPercent / 100));
        }

        const taxableSubtotal = Math.max(0, subtotal - discount);
        const tax = gstEnabled ? Math.round(taxableSubtotal * 0.05) : 0;
        const grandTotal = taxableSubtotal + tax;

        subtotalSpan.innerText = `₹${subtotal}`;
        if (discount > 0) {
            if (discountRow) discountRow.style.display = 'flex';
            if (discountSpan) discountSpan.innerText = `-₹${discount}`;
        } else {
            if (discountRow) discountRow.style.display = 'none';
        }
        taxSpan.innerText = `₹${tax}`;
        grandTotalSpan.innerText = `₹${grandTotal}`;

        elements.billOptionsModal.classList.add('open');
    } catch (e) {
        console.error(e);
        alert("Failed to build bill summary.");
    }
}

async function handleDigitalBillRequest() {
    try {
        const loc = activeSession?.locationLabel || ("Table " + tableNumber);
        await db.requests.add(tableNumber, 'bill_digital', loc);
        
        // Fetch all orders placed in this session
        db.orders.listen(async (allOrders) => {
            const sessionOrders = allOrders.filter(o => o.sessionId === activeSession.id && o.status !== 'cancelled');
            if (sessionOrders.length === 0) return;
            generateInvoicePDF(activeSession, sessionOrders);
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
        
        let itemName = item.name;
        if (itemName.length > 20) itemName = itemName.slice(0, 18) + "..";
        
        const priceText = item.price === 0 ? "Free" : `₹${rowAmount}`;
        
        doc.text(itemName, margin, y);
        doc.text(`${item.qty}`, 52, y, { align: "right" });
        doc.text(priceText, 80 - margin, y, { align: "right" });
    });

    y += 4;
    doc.line(margin, y, 80 - margin, y);

    // Calculations
    let discount = 0;
    if (session.loyaltyDiscountPercent > 0) {
        discount = Math.round(subtotal * (session.loyaltyDiscountPercent / 100));
    }
    
    const taxableSubtotal = Math.max(0, subtotal - discount);
    const tax = gstEnabled ? Math.round(taxableSubtotal * 0.05) : 0;
    const grandTotal = taxableSubtotal + tax;

    y += 5;
    doc.text("Subtotal:", 48, y, { align: "right" });
    doc.text(`₹${subtotal}`, 80 - margin, y, { align: "right" });

    if (discount > 0) {
        y += 4;
        doc.text("Loyalty Discount (10%):", 48, y, { align: "right" });
        doc.text(`-₹${discount}`, 80 - margin, y, { align: "right" });
    }

    if (gstEnabled) {
        const cgst = (tax / 2).toFixed(2);
        const sgst = (tax / 2).toFixed(2);
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
        const loc = activeSession?.locationLabel || ("Table " + tableNumber);
        const name = activeSession?.customerName || "N/A";
        const phone = activeSession?.customerPhone || "N/A";
        const zone = activeSession?.orderZone || "table";
        
        const feedbackString = `feedback: Name: ${name} | Phone: ${phone} | Zone: ${zone} | Food ${foodRating}* | Service ${serviceRating}* | Review: "${feedbackVal}"`;
        
        await db.requests.add(tableNumber, feedbackString, loc);
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

function isStoreOpen(settings) {
    if (!settings) return true; // Default open if settings list not resolved
    if (settings.overrideTiming) return true;
    
    const startTimeStr = settings.startTime || "12:00";
    const endTimeStr = settings.endTime || "01:00";
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMin;
    
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const startTimeMinutes = startH * 60 + startM;
    
    const [endH, endM] = endTimeStr.split(':').map(Number);
    const endTimeMinutes = endH * 60 + endM;
    
    if (endTimeMinutes > startTimeMinutes) {
        return (currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes);
    } else {
        return (currentTimeMinutes >= startTimeMinutes || currentTimeMinutes <= endTimeMinutes);
    }
}

function formatTime12h(timeStr) {
    if (!timeStr) return "";
    const [hStr, mStr] = timeStr.split(':');
    let h = parseInt(hStr);
    const m = mStr || "00";
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${m} ${ampm}`;
}
