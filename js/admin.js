import db from './db.js';
import soundEffects from './audio.js';

// State Variables
let currentTab = 'tabDashboard';
let allSessions = [];
let allOrders = [];
let allRequests = [];
let allCategories = [];
let allProducts = [];
let selectedSession = null;
let selectedTable = null;
let editingProductId = null; // Track product edit state
let activeBillingSessionId = null; // Track active session ID in billing manager modal
let initialOrdersLoaded = false; // Track if orders list has completed its initial database read
let knownOrderIds = new Set(); // Keep track of seen order IDs to prevent duplicate alerts
let uploadedImageBase64 = ""; // Track base64 data for uploaded product image
let gstEnabled = false; // Synchronized global GST configuration flag

// Chart instances (to destroy/recreate on data change)
let trafficChartInstance = null;
let itemsChartInstance = null;
let revenueChartInstance = null;

// DOM Elements
const elements = {
    sidebarItems: document.querySelectorAll('.sidebar-menu .menu-item'),
    pageTitleText: document.getElementById('pageTitleText'),
    liveClock: document.getElementById('liveClock'),
    adminStaffName: document.getElementById('adminStaffName'),
    adminStaffRole: document.getElementById('adminStaffRole'),
    btnAdminLogout: document.getElementById('btnAdminLogout'),
    
    // Overview Metrics
    mTodaySales: document.getElementById('mTodaySales'),
    mTotalOrders: document.getElementById('mTotalOrders'),
    mActiveTables: document.getElementById('mActiveTables'),
    mActiveRequests: document.getElementById('mActiveRequests'),
    sidebarRequestBadge: document.getElementById('sidebarRequestBadge'),
    
    // POS Floor Map
    posTableGrid: document.getElementById('posTableGrid'),
    externalSessionsGrid: document.getElementById('externalSessionsGrid'),
    
    // POS Checkout Drawer
    checkoutPanelEmpty: document.getElementById('checkoutPanelEmpty'),
    checkoutPanelActive: document.getElementById('checkoutPanelActive'),
    checkoutTableHeader: document.getElementById('checkoutTableHeader'),
    checkoutStatusBadge: document.getElementById('checkoutStatusBadge'),
    checkoutCustomerHeader: document.getElementById('checkoutCustomerHeader'),
    checkoutItemsList: document.getElementById('checkoutItemsList'),
    checkoutSubtotal: document.getElementById('checkoutSubtotal'),
    checkoutTax: document.getElementById('checkoutTax'),
    checkoutGrandTotal: document.getElementById('checkoutGrandTotal'),
    btnPOSReprintInvoice: document.getElementById('btnPOSReprintInvoice'),
    
    // Queues
    adminOrdersContainer: document.getElementById('adminOrdersContainer'),
    adminRequestsContainer: document.getElementById('adminRequestsContainer'),
    orderFilters: document.querySelectorAll('[data-order-filter]'),
    
    // Menu Editor Forms & Catalog
    productForm: document.getElementById('productForm'),
    categoryForm: document.getElementById('categoryForm'),
    prodName: document.getElementById('prodName'),
    prodCategory: document.getElementById('prodCategory'),
    prodPrice: document.getElementById('prodPrice'),
    prodDescription: document.getElementById('prodDescription'),
    prodImage: document.getElementById('prodImage'),
    prodImageFile: document.getElementById('prodImageFile'),
    prodImagePreviewContainer: document.getElementById('prodImagePreviewContainer'),
    prodImagePreview: document.getElementById('prodImagePreview'),
    btnClearUploadedImage: document.getElementById('btnClearUploadedImage'),
    uploadLabelText: document.getElementById('uploadLabelText'),
    prodPopular: document.getElementById('prodPopular'),
    prodAvailable: document.getElementById('prodAvailable'),
    catName: document.getElementById('catName'),
    adminCategoriesList: document.getElementById('adminCategoriesList'),
    menuCatalogFilter: document.getElementById('menuCatalogFilter'),
    catalogListContainer: document.getElementById('catalogListContainer'),
    toggleGstConfig: document.getElementById('toggleGstConfig'),
    
    // QR Manager
    qrHostUrl: document.getElementById('qrHostUrl'),
    qrPrintGrid: document.getElementById('qrPrintGrid'),
    
    // Bill History & Manager DOM
    billSearchInput: document.getElementById('billSearchInput'),
    billStatusFilter: document.getElementById('billStatusFilter'),
    billHistoryTableBody: document.getElementById('billHistoryTableBody'),
    analyticsFilter: document.getElementById('analyticsFilter'),
    
    // Bill Detail Modal
    billDetailModal: document.getElementById('billDetailModal'),
    billModalTitle: document.getElementById('billModalTitle'),
    btnMinimizeBillModal: document.getElementById('btnMinimizeBillModal'),
    billCustomerEditSection: document.getElementById('billCustomerEditSection'),
    billEditCustName: document.getElementById('billEditCustName'),
    billEditCustPhone: document.getElementById('billEditCustPhone'),
    btnSaveBillCustomerDetails: document.getElementById('btnSaveBillCustomerDetails'),
    billModalItemsContainer: document.getElementById('billModalItemsContainer'),
    billAddItemSection: document.getElementById('billAddItemSection'),
    billAddProductSelect: document.getElementById('billAddProductSelect'),
    billAddProductQty: document.getElementById('billAddProductQty'),
    btnConfirmBillAddItem: document.getElementById('btnConfirmBillAddItem'),
    billModalGrandTotal: document.getElementById('billModalGrandTotal'),
    btnPrintReceiptFromModal: document.getElementById('btnPrintReceiptFromModal'),
    btnCloseBillModal: document.getElementById('btnCloseBillModal')
};

// ==========================================================================
// 1. AUTHENTICATION & GLOBAL TIMER
// ==========================================================================

function startAdminApp() {
    // Authenticate Role
    db.auth.listenState(user => {
        if (!user || user.role !== 'admin') {
            alert("Access denied. Directing to login.");
            window.location.href = 'login.html';
            return;
        }

        elements.adminStaffName.innerText = user.name || "Admin User";
        elements.adminStaffRole.innerText = "POS Admin Panel";
        
        initAdminPanel();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAdminApp);
} else {
    startAdminApp();
}

function initAdminPanel() {
    // 1. Start Clock
    startClock();

    // 2. Setup Navigation Routing
    setupNavigation();

    // 3. Bind Live Database Listeners
    db.sessions.listen(handleSessionsUpdate);
    db.orders.listen(handleOrdersUpdate);
    db.requests.listen(handleRequestsUpdate);
    db.categories.listen(handleCategoriesUpdate);
    db.products.listen(handleProductsUpdate);
    // Listen to global settings (GST config)
    db.settings.listen(settings => {
        gstEnabled = settings.gstEnabled || false;
        elements.toggleGstConfig.checked = gstEnabled;
        if (selectedSession) {
            loadCheckoutDrawer(selectedSession);
        }
    });

    elements.toggleGstConfig.addEventListener('change', async (e) => {
        const checked = e.target.checked;
        await db.settings.setGst(checked);
    });

    // 4. Bind Action Listeners
    setupCheckoutActions();
    setupMenuEditorActions();
    bindBillManagerEvents();

    // 5. Logout Button
    elements.btnAdminLogout.addEventListener('click', async () => {
        if (confirm("Log out from POS Admin Console?")) {
            await db.auth.logout();
            window.location.href = 'login.html';
        }
    });

    // 6. Generate Printable QRs
    generateTableQRSheets();
    elements.qrHostUrl.addEventListener('input', generateTableQRSheets);
}

function startClock() {
    setInterval(() => {
        const now = new Date();
        elements.liveClock.innerHTML = `<i class="fa-regular fa-clock"></i> ${now.toLocaleTimeString()}`;
    }, 1000);
}

// ==========================================================================
// 2. DASHBOARD NAVIGATION TABS
// ==========================================================================

function setupNavigation() {
    elements.sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.dataset.target;
            
            // Toggle sidebar active tabs
            elements.sidebarItems.forEach(li => li.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            // Toggle view containers
            document.querySelectorAll('.tab-content').forEach(view => view.classList.remove('active'));
            document.getElementById(targetTab).classList.add('active');
            
            currentTab = targetTab;
            
            // Dynamic page title update
            const tabName = e.currentTarget.innerText.trim();
            elements.pageTitleText.innerText = tabName;

            // Re-render graphs if entering Analytics tab
            if (targetTab === 'tabAnalytics') {
                renderAnalyticsCharts();
            } else if (targetTab === 'tabBills') {
                renderBillHistory();
            }
        });
    });
}

// ==========================================================================
// 3. REALTIME DATA PROCESSORS & OVERVIEW METRICS
// ==========================================================================

function handleSessionsUpdate(sessions) {
    allSessions = sessions;
    updateDashboardMetrics();
    renderFloorLayoutMap();
    
    // Refresh checkout panel if the selected session changed
    if (selectedSession) {
        const current = allSessions.find(s => s.id === selectedSession.id);
        if (current) {
            loadCheckoutDrawer(current);
        } else {
            resetCheckoutPanel();
        }
    }
    
    if (currentTab === 'tabBills') {
        renderBillHistory();
    }
}

function handleOrdersUpdate(orders) {
    if (!initialOrdersLoaded) {
        orders.forEach(o => knownOrderIds.add(o.id));
        initialOrdersLoaded = true;
        allOrders = orders;
        updateDashboardMetrics();
        renderLiveOrdersQueue();
        if (selectedSession) {
            loadCheckoutDrawer(selectedSession);
        }
        if (currentTab === 'tabBills') {
            renderBillHistory();
        }
        return;
    }
    
    const newOrders = orders.filter(o => !knownOrderIds.has(o.id));
    orders.forEach(o => knownOrderIds.add(o.id));
    
    allOrders = orders;
    
    if (newOrders.length > 0) {
        const receivedNewOrders = newOrders.filter(o => o.status === 'received');
        if (receivedNewOrders.length > 0) {
            playNewOrderSound();
            showNewOrderToast(receivedNewOrders[0]);
        }
    }
    
    updateDashboardMetrics();
    renderLiveOrdersQueue();
    if (selectedSession) {
        loadCheckoutDrawer(selectedSession);
    }
    
    if (currentTab === 'tabBills') {
        renderBillHistory();
    }
}

function playNewOrderSound() {
    try {
        // 1. Play warm double-bell order chime from audio context
        if (soundEffects && typeof soundEffects.playOrder === 'function') {
            soundEffects.playOrder();
        }
        
        // 2. Play speech synthesis voice alert
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Terminate previous alerts to prevent piling up
            
            const utterance = new SpeechSynthesisUtterance("New order, please check");
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            
            // Query for English voice locale if supported
            const voices = window.speechSynthesis.getVoices();
            const englishVoice = voices.find(v => v.lang.startsWith('en'));
            if (englishVoice) {
                utterance.voice = englishVoice;
            }
            
            window.speechSynthesis.speak(utterance);
        }
    } catch (e) {
        console.error("Notification sound playback error:", e);
    }
}

function showNewOrderToast(order) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const locLabel = order.locationLabel || (order.tableNumber ? `Table ${order.tableNumber}` : "New Order");
    const custName = order.customerName || "Guest";
    const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const itemsList = order.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
    
    const toast = document.createElement('div');
    toast.className = 'toast-card';
    
    toast.innerHTML = `
        <div style="font-weight:bold; font-size:0.95rem; display:flex; align-items:center; justify-content:space-between; width:100%;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-bell-concierge" style="color:var(--color-accent-gold-dark);"></i>
                New Order: ${locLabel}
            </span>
            <button class="btn-close-toast" style="background:none; border:none; color:var(--color-text-muted); cursor:pointer; font-size:1.1rem; padding:0; line-height:1;" onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
        <div style="font-size:0.8rem; color:var(--color-primary-deep); font-weight:600; margin-top:6px;">
            Customer: ${custName}
        </div>
        <div style="font-size:0.78rem; color:var(--color-text-muted); margin-top:4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${itemsList}">
            Ordered ${itemsCount} items: ${itemsList}
        </div>
        <div style="margin-top:10px; display:flex; justify-content:flex-end;">
            <button class="btn-primary" style="padding:4px 8px; font-size:0.75rem; border-radius:4px; background-color:var(--color-primary-deep); border-color:var(--color-primary-deep); color:white;" onclick="this.parentElement.parentElement.remove()">Dismiss</button>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove after 6 seconds with fade-out
    setTimeout(() => {
        if (toast && toast.parentElement) {
            toast.style.animation = "toastFadeOut 0.5s ease forwards";
            setTimeout(() => {
                if (toast && toast.parentElement) {
                    toast.remove();
                }
            }, 500);
        }
    }, 6000);
}

let unresolvedRequestCount = 0;
function handleRequestsUpdate(requests) {
    allRequests = requests;
    
    // Check if new requests have arrived to trigger audio notifications
    const pending = requests.filter(r => r.status === 'pending');
    
    if (pending.length > unresolvedRequestCount) {
        const newest = pending[0]; // first item in sorted list
        if (newest) {
            if (newest.type === 'waiter' || newest.type.startsWith('duplicate_session')) {
                soundEffects.playWaiter(); // bell chime
            } else if (newest.type.includes('bill')) {
                soundEffects.playBill(); // cash register chime
            }
        }
    }
    unresolvedRequestCount = pending.length;
    
    // Update metric counters and sidebar badge alert
    updateDashboardMetrics();
    renderRequestsQueue();
    renderFloorLayoutMap(); // Redraw map to show notification dots on tables
}

function updateDashboardMetrics() {
    const todayStr = new Date().toDateString();
    
    // 1. Calculate Today's Revenue (sum total paid sessions today)
    const paidToday = allSessions.filter(s => s.status === 'paid' && new Date(s.closedAt).toDateString() === todayStr);
    const revenue = paidToday.reduce((sum, s) => sum + s.totalAmount, 0);
    elements.mTodaySales.innerText = `₹${revenue}`;

    // 2. Count Active Orders
    const activeOrders = allOrders.filter(o => o.status !== 'served' && o.status !== 'cancelled');
    elements.mTotalOrders.innerText = activeOrders.length;

    // 3. Count Running Tables
    const runningTables = allSessions.filter(s => s.status === 'open' && s.tableNumber <= 9);
    elements.mActiveTables.innerText = `${runningTables.length} / 9`;

    // 4. Pending Requests
    const pendingReqs = allRequests.filter(r => r.status === 'pending');
    elements.mActiveRequests.innerText = pendingReqs.length;

    if (pendingReqs.length > 0) {
        elements.sidebarRequestBadge.innerText = pendingReqs.length;
        elements.sidebarRequestBadge.style.display = 'inline-block';
    } else {
        elements.sidebarRequestBadge.style.display = 'none';
    }
}

// ==========================================================================
// 4. FLOOR MAP GRID & CHECKOUT POS
// ==========================================================================

function renderFloorLayoutMap() {
    let html = "";
    
    // Generate Table map nodes for Table 1 to 9
    for (let tNum = 1; tNum <= 9; tNum++) {
        const activeSess = allSessions.find(s => s.tableNumber === tNum && s.status === 'open');
        const pendingReqs = allRequests.filter(r => r.tableNumber === tNum && r.status === 'pending');
        const hasWaiterCall = pendingReqs.some(r => r.type === 'waiter');
        const hasBillCall = pendingReqs.some(r => r.type.includes('bill'));
        
        let nodeClass = "available";
        let statusText = "Available";
        let amtText = "";
        
        if (activeSess) {
            nodeClass = "occupied";
            statusText = "Occupied";
            amtText = `₹${activeSess.totalAmount}`;
        }
        
        if (hasBillCall) {
            nodeClass = "bill-requested";
            statusText = "Bill Requested";
        }

        const callDot = hasWaiterCall ? `<div class="waiter-call-glowing-dot"></div>` : "";

        html += `
            <div class="table-node ${nodeClass}" data-table-num="${tNum}">
                ${callDot}
                <div class="table-node-num">${tNum}</div>
                <div class="table-node-status">${statusText}</div>
                <div class="table-node-amount">${amtText}</div>
            </div>
        `;
    }

    elements.posTableGrid.innerHTML = html;

    // Bind map click triggers
    elements.posTableGrid.querySelectorAll('.table-node').forEach(node => {
        node.addEventListener('click', (e) => {
            const tNum = parseInt(e.currentTarget.dataset.tableNum);
            const sess = allSessions.find(s => s.tableNumber === tNum && s.status === 'open');
            
            if (sess) {
                selectedTable = tNum;
                loadCheckoutDrawer(sess);
            } else {
                alert(`Table ${tNum} is currently available.`);
            }
        });
    });

    // Render External Sessions (Table Number >= 10: Hotel Partner)
    const externalSessList = allSessions.filter(s => s.status === 'open' && s.tableNumber >= 10);
    
    if (externalSessList.length === 0) {
        elements.externalSessionsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--color-text-muted); font-size: 0.85rem; border: 1.5px dashed var(--color-border); border-radius: var(--radius-md); width:100%;">
                No active Hotel Relax Inn deliveries right now.
            </div>
        `;
    } else {
        let extHtml = "";
        externalSessList.forEach(sess => {
            const pendingReqs = allRequests.filter(r => r.tableNumber === sess.tableNumber && r.status === 'pending' && r.type.includes('bill'));
            const hasWaiterCall = allRequests.some(r => r.tableNumber === sess.tableNumber && r.status === 'pending' && r.type === 'waiter');
            const hasBillCall = pendingReqs.length > 0;
            
            let cardColor = "#28a745"; // Default green
            let statusLabel = "Active Session";
            
            if (hasBillCall) {
                cardColor = "#fd7e14"; // Orange
                statusLabel = "Bill Requested";
            } else {
                cardColor = "#dc3545"; // Red
            }

            const callDot = hasWaiterCall ? `<div class="waiter-call-glowing-dot" style="top:10px; right:10px;"></div>` : "";

            let locName = sess.locationLabel || "External";
            if (locName.length > 20) locName = locName.slice(0, 18) + "..";

            extHtml += `
                <div class="table-node occupied" data-ext-session-id="${sess.id}" style="border-color:${cardColor}; text-align:left; padding: 12px; display:flex; flex-direction:column; justify-content:space-between; height:100px;">
                    ${callDot}
                    <div>
                        <div style="font-weight:800; font-size:0.9rem; color:var(--color-primary-deep); margin-bottom:2px;">${locName}</div>
                        <div style="font-size:0.7rem; color:var(--color-text-muted);">${sess.customerName}</div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed var(--color-border); padding-top:6px; margin-top:6px;">
                        <span style="font-size:0.65rem; font-weight:700; color:${cardColor};">${statusLabel}</span>
                        <span style="font-family:var(--font-heading); font-weight:700; font-size:0.85rem; color:var(--color-primary-deep);">₹${sess.totalAmount}</span>
                    </div>
                </div>
            `;
        });

        elements.externalSessionsGrid.innerHTML = extHtml;

        // Bind external session clicks to checkout drawer
        elements.externalSessionsGrid.querySelectorAll('.table-node').forEach(card => {
            card.addEventListener('click', (e) => {
                const sId = e.currentTarget.dataset.extSessionId;
                const sess = allSessions.find(s => s.id === sId && s.status === 'open');
                if (sess) {
                    selectedTable = sess.tableNumber;
                    loadCheckoutDrawer(sess);
                }
            });
        });
    }
}

function loadCheckoutDrawer(session) {
    selectedSession = session;
    elements.checkoutPanelEmpty.style.display = 'none';
    elements.checkoutPanelActive.style.display = 'block';
    
    elements.checkoutTableHeader.innerText = `${session.locationLabel || "Table #" + session.tableNumber} Session`;
    elements.checkoutCustomerHeader.innerText = `Customer: ${session.customerName} | Phone: ${session.customerPhone || "N/A"}`;
    
    // Check if table has requested bill
    const pendingReqs = allRequests.filter(r => r.tableNumber === session.tableNumber && r.status === 'pending' && r.type.includes('bill'));
    if (pendingReqs.length > 0) {
        elements.checkoutStatusBadge.innerText = "BILL REQUESTED";
        elements.checkoutStatusBadge.className = "badge badge-warning";
    } else {
        elements.checkoutStatusBadge.innerText = "OCCUPIED / OPEN";
        elements.checkoutStatusBadge.className = "badge badge-danger";
    }

    // Retrieve and aggregate all items ordered across the session
    const sessionOrders = allOrders.filter(o => o.sessionId === session.id && o.status !== 'cancelled');
    
    let itemsHtml = "";
    const consolidatedItems = {};
    
    sessionOrders.forEach(order => {
        order.items.forEach(item => {
            if (!consolidatedItems[item.productId]) {
                consolidatedItems[item.productId] = { name: item.name, qty: 0, price: item.price };
            }
            consolidatedItems[item.productId].qty += item.quantity;
        });
    });

    const keys = Object.keys(consolidatedItems);
    if (keys.length === 0) {
        itemsHtml = `<div style="text-align:center; padding:20px; font-size:0.85rem; color:var(--color-text-muted);">No items ordered yet.</div>`;
    } else {
        keys.forEach(pId => {
            const item = consolidatedItems[pId];
            itemsHtml += `
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; margin-bottom:8px;">
                    <span>
                        <button class="btn-delete-bill-item" data-prod-id="${pId}" style="background:none; border:none; color:#dc3545; padding:0; margin-right:8px; cursor:pointer;" title="Delete item from bill">
                            <i class="fa-solid fa-trash-can" style="font-size:0.75rem;"></i>
                        </button>
                        ${item.name} <strong style="color:var(--color-primary-deep)">x${item.qty}</strong>
                    </span>
                    <span style="font-family:var(--font-heading); font-weight:700;">₹${item.qty * item.price}</span>
                </div>
            `;
        });
    }

    elements.checkoutItemsList.innerHTML = itemsHtml;

    // Bind delete bill item buttons
    elements.checkoutItemsList.querySelectorAll('.btn-delete-bill-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const pId = e.currentTarget.dataset.prodId;
            const item = consolidatedItems[pId];
            if (confirm(`Remove "${item.name}" entirely from Table Session?`)) {
                try {
                    await db.sessions.deleteItem(session.id, pId);
                    // Fetch updated session details and reload checkout drawer
                    const sessions = await new Promise(resolve => {
                        db.sessions.listen(allSess => {
                            resolve(allSess);
                        });
                    });
                    const updatedSess = sessions.find(s => s.id === session.id);
                    if (updatedSess) {
                        loadCheckoutDrawer(updatedSess);
                    }
                } catch (err) {
                    console.error(err);
                    alert("Failed to delete item from session.");
                }
            }
        });
    });

    // Billing Totals (GST conditionally configured)
    const subtotal = session.totalAmount;
    const tax = gstEnabled ? Math.round(subtotal * 0.05) : 0;
    const grandTotal = subtotal + tax;

    elements.checkoutSubtotal.innerText = `₹${subtotal}`;
    elements.checkoutTax.innerText = `₹${tax}`;
    elements.checkoutGrandTotal.innerText = `₹${grandTotal}`;
}

function resetCheckoutPanel() {
    selectedSession = null;
    selectedTable = null;
    elements.checkoutPanelActive.style.display = 'none';
    elements.checkoutPanelEmpty.style.display = 'block';
}

function setupCheckoutActions() {
    // Checkout Method click triggers
    document.querySelectorAll('.btn-checkout-action').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!selectedSession) return;
            const method = e.currentTarget.dataset.method;
            
            if (confirm(`Confirm checkout of ₹${selectedSession.totalAmount} for Table ${selectedSession.tableNumber} using [${method}]?`)) {
                // 1. Close table session
                await db.sessions.close(selectedSession.id, method);
                
                // 2. Resolve any pending bill requests for this table
                const billRequests = allRequests.filter(r => r.tableNumber === selectedSession.tableNumber && r.status === 'pending' && r.type.includes('bill'));
                for (let req of billRequests) {
                    await db.requests.complete(req.id);
                }

                // 3. Clear Table POS selection
                alert(`Table ${selectedSession.tableNumber} checked out successfully.`);
                resetCheckoutPanel();
            }
        });
    });

    // POS Print Invoice helper
    elements.btnPOSReprintInvoice.addEventListener('click', () => {
        if (!selectedSession) return;
        const sessionOrders = allOrders.filter(o => o.sessionId === selectedSession.id && o.status !== 'cancelled');
        reprintPOSInvoice(selectedSession, sessionOrders);
    });
}

function reprintPOSInvoice(session, orders) {
    // Generates invoice using jsPDF (80mm width layout)
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p', unit: 'mm', format: [80, 170]
    });

    const margin = 5;
    let y = 10;

    doc.setFont("Outfit", "bold");
    doc.setFontSize(14);
    doc.setTextColor(12, 43, 32);
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
    doc.line(margin, y, 80 - margin, y);

    y += 6;
    doc.setFont("Inter", "bold");
    doc.text(`Location: ${session.locationLabel || "Table " + session.tableNumber} [DUPLICATE]`, margin, y);
    doc.text(`Date: ${new Date(session.createdAt).toLocaleDateString()}`, 80 - margin, y, { align: "right" });
    
    y += 4;
    doc.setFont("Inter", "normal");
    doc.text(`Cust: ${session.customerName}`, margin, y);
    doc.text(`Invoice: INV-${session.id.slice(-6).toUpperCase()}`, margin, y);

    y += 4;
    doc.line(margin, y, 80 - margin, y);

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
        doc.text(item.name.slice(0,18), margin, y);
        doc.text(`${item.qty}`, 52, y, { align: "right" });
        doc.text(`₹${rowAmount}`, 80 - margin, y, { align: "right" });
    });

    y += 4;
    doc.line(margin, y, 80 - margin, y);

    const tax = gstEnabled ? Math.round(subtotal * 0.05) : 0;
    const grandTotal = subtotal + tax;

    y += 5;
    doc.text("Subtotal:", 48, y, { align: "right" });
    doc.text(`₹${subtotal}`, 80 - margin, y, { align: "right" });

    if (gstEnabled) {
        y += 4;
        doc.text("GST (5%):", 48, y, { align: "right" });
        doc.text(`₹${tax}`, 80 - margin, y, { align: "right" });
    }

    y += 5;
    doc.setFont("Inter", "bold");
    doc.setFontSize(10);
    doc.text("Grand Total:", 48, y, { align: "right" });
    doc.text(`₹${grandTotal}`, 80 - margin, y, { align: "right" });

    y += 8;
    doc.setFont("Outfit", "bold");
    doc.setFontSize(8);
    doc.text("Reprinted from Admin POS", 40, y, { align: "center" });

    doc.save(`POS_Bill_Table_${session.tableNumber}.pdf`);
}

// ==========================================================================
// 5. LIVE ORDER QUEUES
// ==========================================================================

let activeOrderFilter = 'all';
function renderLiveOrdersQueue() {
    // Bind filters
    elements.orderFilters.forEach(pill => {
        pill.addEventListener('click', (e) => {
            elements.orderFilters.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeOrderFilter = pill.dataset.orderFilter;
            renderLiveOrdersQueue();
        });
    });

    let filtered = allOrders.filter(o => o.status !== 'cancelled');
    if (activeOrderFilter !== 'all') {
        filtered = filtered.filter(o => o.status === activeOrderFilter);
    } else {
        // Default "All Active" skips served orders to focus on pending tickets
        filtered = filtered.filter(o => o.status !== 'served');
    }

    if (filtered.length === 0) {
        elements.adminOrdersContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 40px; color:var(--color-text-muted);">
                <i class="fa-solid fa-receipt" style="font-size: 2.5rem; margin-bottom: 12px; color: var(--color-accent-gold);"></i>
                <p>No active orders in this queue.</p>
            </div>
        `;
        return;
    }

    let html = "";
    filtered.forEach(order => {
        let itemsHtml = "";
        order.items.forEach(item => {
            itemsHtml += `
                <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.85rem;">
                    <span>${item.name} <strong>x${item.quantity}</strong></span>
                </div>
            `;
        });

        const notesHTML = order.notes ? `<div style="font-size:0.8rem; background:#f4f4f4; padding:6px; margin-top:8px; border-radius:var(--radius-sm); border-left: 2px solid var(--color-accent-gold);">"${order.notes}"</div>` : "";

        // Status pill
        let statusBadge = `<span class="badge badge-warning">${order.status.toUpperCase()}</span>`;
        if (order.status === 'preparing') statusBadge = `<span class="badge badge-success" style="background:#fd7e14; color:white; border-color:#fd7e14">${order.status.toUpperCase()}</span>`;
        if (order.status === 'ready') statusBadge = `<span class="badge badge-info">${order.status.toUpperCase()}</span>`;

        // Buttons
        let buttonsHTML = `
            <button class="btn-secondary btn-order-action" data-action="cancel" data-id="${order.id}">Cancel</button>
        `;

        if (order.status === 'received') {
            buttonsHTML += `
                <button class="btn-primary btn-order-action" data-action="preparing" data-id="${order.id}">Accept & Cook</button>
            `;
        } else if (order.status === 'preparing') {
            buttonsHTML += `
                <button class="btn-primary btn-order-action" data-action="ready" data-id="${order.id}" style="background-color:#fd7e14; border-color:#fd7e14;">Mark Ready</button>
            `;
        } else if (order.status === 'ready') {
            buttonsHTML += `
                <button class="btn-primary btn-order-action" data-action="served" data-id="${order.id}" style="background-color:var(--color-primary-light); border-color:var(--color-primary-light);">Served</button>
            `;
        }

        // Retrieve dynamic location text from the session
        const sess = allSessions.find(s => s.id === order.sessionId);
        const locationText = sess ? (sess.locationLabel || `Table ${order.tableNumber}`) : `Table ${order.tableNumber}`;

        html += `
            <div class="admin-order-card">
                <div class="admin-order-card-header">
                    <span style="font-weight:700; color:var(--color-primary-deep)">${locationText.toUpperCase()}</span>
                    ${statusBadge}
                </div>
                <div class="admin-order-card-body">
                    <div style="font-size: 0.75rem; color:var(--color-text-muted); margin-bottom:10px;">
                        Customer: ${order.customerName} | Time: ${new Date(order.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                    </div>
                    ${itemsHtml}
                    ${notesHTML}
                </div>
                <div class="admin-order-card-footer">
                    ${buttonsHTML}
                </div>
            </div>
        `;
    });

    elements.adminOrdersContainer.innerHTML = html;

    // Bind Order Action clicks
    elements.adminOrdersContainer.querySelectorAll('.btn-order-action').forEach(btn => {
        btn.addEventListener('click', handleOrderActionClick);
    });
}

async function handleOrderActionClick(e) {
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    const orderId = btn.dataset.id;
    btn.disabled = true;

    if (action === 'preparing') {
        await db.orders.updateStatus(orderId, 'preparing');
    } else if (action === 'ready') {
        await db.orders.updateStatus(orderId, 'ready');
    } else if (action === 'served') {
        await db.orders.updateStatus(orderId, 'served');
    } else if (action === 'cancel') {
        if (confirm("Are you sure you want to cancel this order ticket?")) {
            await db.orders.updateStatus(orderId, 'cancelled');
        }
    }
}

// ==========================================================================
// 6. SERVICE CALLS
// ==========================================================================

function renderRequestsQueue() {
    const pending = allRequests.filter(r => r.status === 'pending');
    
    if (pending.length === 0) {
        elements.adminRequestsContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 40px; color:var(--color-text-muted);">
                <i class="fa-solid fa-bell-slash" style="font-size: 2.5rem; margin-bottom: 12px; color: var(--color-border);"></i>
                <p>No active service calls at this time.</p>
            </div>
        `;
        return;
    }

    let html = "";
    pending.forEach(req => {
        let typeBadge = `<span class="badge badge-warning"><i class="fa-solid fa-utensils"></i> Call Waiter</span>`;
        if (req.type === 'bill_printed') typeBadge = `<span class="badge badge-danger" style="background:#8b4f2c; color:white; border-color:#8b4f2c;"><i class="fa-solid fa-print"></i> Printed Invoice</span>`;
        if (req.type === 'bill_digital') typeBadge = `<span class="badge badge-info"><i class="fa-solid fa-file-pdf"></i> Digital PDF Bill</span>`;
        if (req.type.startsWith('feedback:')) typeBadge = `<span class="badge badge-success"><i class="fa-solid fa-heart"></i> Feedback Sent</span>`;
        if (req.type.startsWith('duplicate_session:')) typeBadge = `<span class="badge badge-danger" style="background:#dc3545; color:white; border-color:#dc3545;"><i class="fa-solid fa-triangle-exclamation"></i> Session Warning</span>`;

        let detailsText = "Requested waiter service.";
        if (req.type === 'bill_printed') detailsText = "Wants paper bill delivered to table.";
        if (req.type === 'bill_digital') detailsText = "Downloaded digital PDF. Needs UPI verification / cashier approval.";
        if (req.type.startsWith('feedback:')) detailsText = req.type.replace('feedback:', '');
        if (req.type.startsWith('duplicate_session:')) detailsText = req.type.replace('duplicate_session:', '');

        const locationText = req.locationLabel || `Table ${req.tableNumber}`;
        html += `
            <div class="request-card pending">
                <div>
                    <div class="request-card-header">
                        <span>${locationText.toUpperCase()}</span>
                        <span class="request-time">${getTimeAgoString(req.createdAt)}</span>
                    </div>
                    <div style="margin-bottom:12px;">
                        ${typeBadge}
                    </div>
                    <p style="font-size:0.85rem; color:var(--color-text-dark); margin-bottom:16px;">${detailsText}</p>
                </div>
                <button class="btn-primary btn-resolve-request" data-req-id="${req.id}" style="width:100%; padding: 8px; font-size: 0.8rem;">
                    <i class="fa-solid fa-check"></i> Dismiss / Resolve
                </button>
            </div>
        `;
    });

    elements.adminRequestsContainer.innerHTML = html;

    // Bind resolve button
    elements.adminRequestsContainer.querySelectorAll('.btn-resolve-request').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const reqId = e.currentTarget.dataset.reqId;
            e.currentTarget.disabled = true;
            await db.requests.complete(reqId);
        });
    });
}

function getTimeAgoString(timestamp) {
    const elapsed = Date.now() - timestamp;
    const mins = Math.floor(elapsed / 60000);
    if (mins === 0) return "Just now";
    return `${mins}m ago`;
}

// ==========================================================================
// 7. MENU CATALOG EDITOR
// ==========================================================================

function handleCategoriesUpdate(categories) {
    allCategories = categories;
    
    // 1. Populate category selectors in Forms
    let formOptions = `<option value="">Select Category</option>`;
    let catalogOptions = `<option value="all">All Categories</option>`;
    
    categories.forEach(cat => {
        formOptions += `<option value="${cat.id}">${cat.name}</option>`;
        catalogOptions += `<option value="${cat.id}">${cat.name}</option>`;
    });
    
    elements.prodCategory.innerHTML = formOptions;
    elements.menuCatalogFilter.innerHTML = catalogOptions;
    
    renderAdminCategories();
}

function handleProductsUpdate(products) {
    allProducts = products;
    renderMenuCatalog();
    updateDashboardMetrics(); // update charts data
    
    renderAdminCategories();
}

function renderAdminCategories() {
    const listEl = document.getElementById('adminCategoriesList');
    if (!listEl) return;
    
    if (allCategories.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; color:var(--color-text-muted); font-size:0.8rem; padding:8px;">No categories found</div>`;
        return;
    }
    
    let html = "";
    allCategories.forEach(cat => {
        const prodCount = allProducts.filter(p => p.categoryId === cat.id).length;
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; border-bottom:1px solid var(--color-border); font-size:0.82rem;">
                <span style="font-weight:500; color:var(--color-text);">${cat.name} <span style="font-size:0.75rem; color:var(--color-text-muted); font-weight:normal;">(${prodCount} items)</span></span>
                <button class="btn-delete-category" data-id="${cat.id}" data-name="${cat.name}" data-count="${prodCount}" style="background:transparent; border:none; color:#ff4d4d; cursor:pointer; padding:2px 6px; border-radius:3px; font-size:0.85rem;" title="Delete Category">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
    });
    listEl.innerHTML = html;
    
    // Bind delete category button listeners
    listEl.querySelectorAll('.btn-delete-category').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const catId = e.currentTarget.dataset.id;
            const catName = e.currentTarget.dataset.name;
            const count = parseInt(e.currentTarget.dataset.count);
            
            if (count > 0) {
                const proceed = confirm(`WARNING: The category "${catName}" has ${count} product(s) assigned to it.\n\nDeleting this category will leave these products uncategorized. Are you sure you want to delete it?`);
                if (!proceed) return;
            } else {
                const proceed = confirm(`Are you sure you want to delete the category "${catName}"?`);
                if (!proceed) return;
            }
            
            try {
                await db.categories.delete(catId);
                alert(`Category "${catName}" deleted successfully.`);
            } catch (err) {
                console.error(err);
                alert("Failed to delete category: " + err.message);
            }
        });
    });
}

function compressImage(base64Str, maxWidth = 400, maxHeight = 400) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Export to JPEG with 0.7 quality to keep size tiny
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => {
            resolve(base64Str);
        };
    });
}

function setupMenuEditorActions() {
    // 1. Save Product Submission
    elements.productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = elements.prodName.value.trim();
        const catId = elements.prodCategory.value;
        const price = parseInt(elements.prodPrice.value);
        const desc = elements.prodDescription.value.trim();
        const img = uploadedImageBase64 || elements.prodImage.value.trim() || "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300";
        const popular = elements.prodPopular.checked;

        const productData = {
            name,
            categoryId: catId,
            price,
            description: desc,
            image: img,
            isPopular: popular,
            isAvailable: elements.prodAvailable.checked
        };

        try {
            if (editingProductId) {
                // Update product
                await db.products.update(editingProductId, productData);
                alert("Product updated successfully!");
                editingProductId = null;
                elements.productForm.querySelector('button[type="submit"]').innerHTML = '<i class="fa-solid fa-save"></i> Save Product';
            } else {
                // Save new product
                await db.products.add(productData);
                alert("New product added!");
            }
            
            // Reset custom image states
            uploadedImageBase64 = "";
            elements.prodImageFile.value = "";
            elements.uploadLabelText.textContent = "Upload Image from PC";
            elements.prodImagePreviewContainer.style.display = "none";
            elements.prodImagePreview.src = "";
            
            elements.productForm.reset();
        } catch (err) {
            console.error(err);
            alert("Failed to save product: " + err.message);
        }
    });

    // File upload change listener
    elements.prodImageFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const rawBase64 = event.target.result;
                
                // Show loading status
                elements.uploadLabelText.textContent = "Compressing Image...";
                
                // Compress image to fit Firestore limits and load faster
                const compressedBase64 = await compressImage(rawBase64, 400, 400);
                
                uploadedImageBase64 = compressedBase64;
                elements.prodImagePreview.src = uploadedImageBase64;
                elements.prodImagePreviewContainer.style.display = "block";
                elements.uploadLabelText.textContent = "Selected: " + (file.name.length > 20 ? file.name.slice(0, 17) + "..." : file.name);
                
                // Clear URL input to avoid conflict
                elements.prodImage.value = "";
            };
            reader.readAsDataURL(file);
        }
    });

    // Clear uploaded image button
    elements.btnClearUploadedImage.addEventListener('click', () => {
        uploadedImageBase64 = "";
        elements.prodImageFile.value = "";
        elements.uploadLabelText.textContent = "Upload Image from PC";
        elements.prodImagePreviewContainer.style.display = "none";
        elements.prodImagePreview.src = "";
    });

    // Clear file selection if they type a URL instead
    elements.prodImage.addEventListener('input', () => {
        if (elements.prodImage.value.trim()) {
            uploadedImageBase64 = "";
            elements.prodImageFile.value = "";
            elements.uploadLabelText.textContent = "Upload Image from PC";
            elements.prodImagePreviewContainer.style.display = "none";
            elements.prodImagePreview.src = "";
        }
    });

    // 2. Save Category Submission
    elements.categoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = elements.catName.value.trim();
        try {
            await db.categories.add({
                name,
                active: true,
                sortOrder: allCategories.length + 1
            });
            alert("New category added.");
            elements.categoryForm.reset();
        } catch (err) {
            console.error(err);
            alert("Failed to save category.");
        }
    });

    // 3. Catalog category filter change
    elements.menuCatalogFilter.addEventListener('change', renderMenuCatalog);
}

function renderMenuCatalog() {
    const filterCat = elements.menuCatalogFilter.value;
    let filtered = allProducts;
    
    if (filterCat !== 'all') {
        filtered = allProducts.filter(p => p.categoryId === filterCat);
    }

    if (filtered.length === 0) {
        elements.catalogListContainer.innerHTML = `
            <div style="text-align:center; padding:24px; color:var(--color-text-muted); font-size:0.9rem;">
                No products found in this category.
            </div>
        `;
        return;
    }

    let html = "";
    filtered.forEach(p => {
        const availChecked = p.isAvailable ? "checked" : "";
        const categoryName = allCategories.find(c => c.id === p.categoryId)?.name || "Other";

        html += `
            <div class="menu-admin-item-row" data-id="${p.id}">
                <img class="menu-admin-item-img" src="${p.image}" alt="" onerror="this.src='https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=100'">
                <div style="flex-grow:1;">
                    <div style="font-weight:700; font-size:0.9rem; color:var(--color-primary-deep);">${p.name}</div>
                    <div style="font-size:0.75rem; color:var(--color-text-muted);">${categoryName} | ₹${p.price}</div>
                </div>
                <div style="display:flex; align-items:center; gap:16px;">
                    <label style="display:flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:600; cursor:pointer;">
                        <input type="checkbox" class="toggle-stock" ${availChecked} data-id="${p.id}"> In Stock
                    </label>
                    <button class="btn-secondary btn-edit-catalog" data-id="${p.id}" style="padding: 4px 10px; font-size:0.7rem;"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-secondary btn-delete-catalog" data-id="${p.id}" style="padding: 4px 10px; font-size:0.7rem; border-color:#dc3545; color:#dc3545;"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
    });

    elements.catalogListContainer.innerHTML = html;

    // Bind stock toggle
    elements.catalogListContainer.querySelectorAll('.toggle-stock').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            const pId = e.target.dataset.id;
            const inStock = e.target.checked;
            await db.products.update(pId, { isAvailable: inStock });
        });
    });

    // Bind edit catalog button
    elements.catalogListContainer.querySelectorAll('.btn-edit-catalog').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pId = e.currentTarget.dataset.id;
            const prod = allProducts.find(p => p.id === pId);
            
            if (prod) {
                editingProductId = pId;
                elements.prodName.value = prod.name;
                elements.prodCategory.value = prod.categoryId;
                elements.prodPrice.value = prod.price;
                elements.prodDescription.value = prod.description || "";
                if (prod.image && prod.image.startsWith('data:image/')) {
                    uploadedImageBase64 = prod.image;
                    elements.prodImagePreview.src = prod.image;
                    elements.prodImagePreviewContainer.style.display = "block";
                    elements.uploadLabelText.textContent = "Change Uploaded Image";
                    elements.prodImage.value = "";
                } else {
                    uploadedImageBase64 = "";
                    elements.prodImageFile.value = "";
                    elements.uploadLabelText.textContent = "Upload Image from PC";
                    elements.prodImagePreviewContainer.style.display = "none";
                    elements.prodImagePreview.src = "";
                    elements.prodImage.value = prod.image || "";
                }
                elements.prodPopular.checked = prod.isPopular || false;
                elements.prodAvailable.checked = prod.isAvailable !== false;
                
                // Scroll form to view and rename save button
                elements.prodName.focus();
                elements.productForm.querySelector('button[type="submit"]').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Product';
            }
        });
    });

    // Bind delete catalog button
    elements.catalogListContainer.querySelectorAll('.btn-delete-catalog').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const pId = e.currentTarget.dataset.id;
            if (confirm("Are you sure you want to permanently delete this product from menu?")) {
                await db.products.delete(pId);
            }
        });
    });
}

// ==========================================================================
// 7.5 BILL MANAGER & HISTORY
// ==========================================================================

function bindBillManagerEvents() {
    const searchInput = document.getElementById('billSearchInput');
    const statusFilter = document.getElementById('billStatusFilter');
    const btnMinimizeModal = document.getElementById('btnMinimizeBillModal');
    const btnCloseModal = document.getElementById('btnCloseBillModal');
    const modalOverlay = document.getElementById('billDetailModal');
    const btnSaveCustomer = document.getElementById('btnSaveBillCustomerDetails');
    const btnConfirmAddItem = document.getElementById('btnConfirmBillAddItem');
    const btnPrintReceipt = document.getElementById('btnPrintReceiptFromModal');
    const analyticsFilter = document.getElementById('analyticsFilter');

    // 1. Search and status filters
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderBillHistory();
        });
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            renderBillHistory();
        });
    }

    // 2. Modal Close / Minimize
    if (btnMinimizeModal) btnMinimizeModal.addEventListener('click', closeBillModal);
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeBillModal);
    
    // Close modal when clicking outside modal box
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeBillModal();
        });
    }

    // 3. Save Customer details
    if (btnSaveCustomer) {
        btnSaveCustomer.addEventListener('click', async () => {
            if (!activeBillingSessionId) return;
            const nameEl = document.getElementById('billEditCustName');
            const phoneEl = document.getElementById('billEditCustPhone');
            if (!nameEl || !phoneEl) return;
            
            const name = nameEl.value.trim();
            const phone = phoneEl.value.trim();
            if (!name) {
                alert("Customer Name is required.");
                return;
            }
            try {
                await db.sessions.updateDetails(activeBillingSessionId, name, phone);
                alert("Customer details updated successfully!");
                
                // Reload running details
                const sessions = await new Promise(resolve => db.sessions.listen(resolve));
                const updated = sessions.find(s => s.id === activeBillingSessionId);
                if (updated) openBillModal(updated.id);
            } catch (e) {
                console.error(e);
                alert("Failed to update customer details.");
            }
        });
    }

    // 4. Add item to running bill
    if (btnConfirmAddItem) {
        btnConfirmAddItem.addEventListener('click', async () => {
            if (!activeBillingSessionId) return;
            const selectEl = document.getElementById('billAddProductSelect');
            const qtyEl = document.getElementById('billAddProductQty');
            if (!selectEl || !qtyEl) return;
            
            const pId = selectEl.value;
            const qty = parseInt(qtyEl.value);
            if (!pId) {
                alert("Please select a product to add.");
                return;
            }
            if (!qty || qty < 1) {
                alert("Please specify a valid quantity.");
                return;
            }
    
            const product = allProducts.find(p => p.id === pId);
            const sessions = await new Promise(resolve => db.sessions.listen(resolve));
            const session = sessions.find(s => s.id === activeBillingSessionId);
            
            if (!product || !session) return;
    
            const newOrder = {
                sessionId: session.id,
                tableNumber: session.tableNumber,
                customerName: session.customerName,
                status: "served", // Auto-served
                items: [
                    {
                        productId: product.id,
                        name: product.name,
                        price: product.price,
                        quantity: qty
                    }
                ],
                totalAmount: product.price * qty
            };
    
            try {
                await db.orders.add(newOrder);
                alert(`Added ${qty}x ${product.name} to the bill.`);
                qtyEl.value = 1;
                
                // Reload details
                openBillModal(session.id);
            } catch (e) {
                console.error(e);
                alert("Failed to add item: " + e.message);
            }
        });
    }

    // 5. Print Receipt from modal
    if (btnPrintReceipt) {
        btnPrintReceipt.addEventListener('click', () => {
            if (!activeBillingSessionId) return;
            const sessions = allSessions;
            const session = sessions.find(s => s.id === activeBillingSessionId);
            if (!session) return;
            const sessionOrders = allOrders.filter(o => o.sessionId === session.id && o.status !== 'cancelled');
            reprintPOSInvoice(session, sessionOrders);
        });
    }

    // 6. Analytics filter event listener
    if (analyticsFilter) {
        analyticsFilter.addEventListener('change', () => {
            renderAnalyticsCharts();
        });
    }
}

function renderBillHistory() {
    const listEl = document.getElementById('billHistoryTableBody');
    const searchInputEl = document.getElementById('billSearchInput');
    const statusFilterEl = document.getElementById('billStatusFilter');
    
    if (!listEl || !searchInputEl || !statusFilterEl) return;
    
    const query = searchInputEl.value.toLowerCase().trim();
    const statusFilter = statusFilterEl.value; // 'all', 'open', 'paid'
    
    // Filter active + past sessions
    let filtered = allSessions.filter(s => s.status === 'open' || s.status === 'paid');
    
    if (statusFilter !== 'all') {
        filtered = filtered.filter(s => s.status === statusFilter);
    }
    
    if (query) {
        filtered = filtered.filter(s => {
            const name = (s.customerName || "").toLowerCase();
            const phone = (s.customerPhone || "").toLowerCase();
            const loc = (s.locationLabel || "table " + s.tableNumber).toLowerCase();
            return name.includes(query) || phone.includes(query) || loc.includes(query);
        });
    }
    
    // Sort by Date (newest first)
    filtered.sort((a, b) => b.createdAt - a.createdAt);
    
    if (filtered.length === 0) {
        listEl.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:20px; color:var(--color-text-muted);">
                    No bills found matching your criteria.
                </td>
            </tr>
        `;
        return;
    }
    
    let html = "";
    filtered.forEach(session => {
        const dateStr = new Date(session.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        const locLabel = session.locationLabel || `Table ${session.tableNumber}`;
        const total = session.totalAmount;
        const tax = gstEnabled ? Math.round(total * 0.05) : 0;
        const grandTotal = total + tax;
        
        let statusBadge = "";
        let actionBtn = "";
        
        if (session.status === 'open') {
            statusBadge = `<span class="badge badge-danger">Running (Open)</span>`;
            actionBtn = `<button class="btn-primary btn-view-bill-detail" data-id="${session.id}" style="padding: 6px 12px; font-size:0.75rem;"><i class="fa-solid fa-edit"></i> View & Edit</button>`;
        } else {
            statusBadge = `<span class="badge badge-success">Checked Out (Paid)</span>`;
            actionBtn = `<button class="btn-secondary btn-view-bill-detail" data-id="${session.id}" style="padding: 6px 12px; font-size:0.75rem;"><i class="fa-solid fa-receipt"></i> View Receipt</button>`;
        }
        
        html += `
            <tr style="border-bottom:1px solid var(--color-border);">
                <td style="padding:10px;">${dateStr}</td>
                <td style="padding:10px; font-weight:bold;">${locLabel}</td>
                <td style="padding:10px;">${session.customerName}</td>
                <td style="padding:10px;">${session.customerPhone || "N/A"}</td>
                <td style="padding:10px;">${statusBadge}</td>
                <td style="padding:10px; text-align:right; font-weight:bold; font-family:var(--font-heading);">₹${grandTotal}</td>
                <td style="padding:10px; text-align:center;">${actionBtn}</td>
            </tr>
        `;
    });
    
    listEl.innerHTML = html;
    
    // Bind click actions to view details
    listEl.querySelectorAll('.btn-view-bill-detail').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sId = e.currentTarget.dataset.id;
            openBillModal(sId);
        });
    });
}

async function openBillModal(sessionId) {
    activeBillingSessionId = sessionId;
    
    const sessions = allSessions;
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    
    const modalTitle = document.getElementById('billModalTitle');
    const editCustName = document.getElementById('billEditCustName');
    const editCustPhone = document.getElementById('billEditCustPhone');
    const itemsContainer = document.getElementById('billModalItemsContainer');
    const customerEditSection = document.getElementById('billCustomerEditSection');
    const addItemSection = document.getElementById('billAddItemSection');
    const addProductSelect = document.getElementById('billAddProductSelect');
    const modalGrandTotal = document.getElementById('billModalGrandTotal');
    const modalOverlay = document.getElementById('billDetailModal');
    
    if (!modalTitle || !editCustName || !editCustPhone || !itemsContainer || !modalGrandTotal) return;
    
    const locLabel = session.locationLabel || `Table ${session.tableNumber}`;
    modalTitle.innerText = `${locLabel} Billing Session`;
    
    // Prefill customer name and phone
    editCustName.value = session.customerName;
    editCustPhone.value = session.customerPhone || "";
    
    // Retrieve all orders associated with this session (excluding cancelled ones)
    const sessionOrders = allOrders.filter(o => o.sessionId === session.id && o.status !== 'cancelled');
    
    // Consolidate ordered items
    const consolidatedItems = {};
    sessionOrders.forEach(order => {
        order.items.forEach(item => {
            if (!consolidatedItems[item.productId]) {
                consolidatedItems[item.productId] = { name: item.name, qty: 0, price: item.price };
            }
            consolidatedItems[item.productId].qty += item.quantity;
        });
    });
    
    const keys = Object.keys(consolidatedItems);
    let itemsHtml = "";
    
    if (keys.length === 0) {
        itemsHtml = `<div style="text-align:center; padding:15px; font-size:0.85rem; color:var(--color-text-muted);">No items ordered yet.</div>`;
    } else {
        keys.forEach(pId => {
            const item = consolidatedItems[pId];
            if (session.status === 'open') {
                // Editable row for open running bills
                itemsHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; margin-bottom:8px; border-bottom:1px solid #f5f5f5; padding-bottom:6px;">
                        <span>
                            <button class="btn-modal-delete-item" data-prod-id="${pId}" style="background:none; border:none; color:#dc3545; padding:0; margin-right:8px; cursor:pointer;" title="Remove item">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                            ${item.name}
                        </span>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <input type="number" class="modal-qty-input" data-prod-id="${pId}" value="${item.qty}" min="1" max="100" style="width:50px; padding:3px; font-size:0.8rem; text-align:center;">
                            <span style="font-weight:bold; font-family:var(--font-heading); min-width:55px; text-align:right;">₹${item.qty * item.price}</span>
                        </div>
                    </div>
                `;
            } else {
                // Static read-only row for closed bills
                itemsHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #f9f9f9;">
                        <span>${item.name} <strong style="color:var(--color-primary-deep)">x${item.qty}</strong></span>
                        <span style="font-weight:bold; font-family:var(--font-heading);">₹${item.qty * item.price}</span>
                    </div>
                `;
            }
        });
    }
    
    itemsContainer.innerHTML = itemsHtml;
    
    // Bind change quantity input listeners
    if (session.status === 'open') {
        itemsContainer.querySelectorAll('.modal-qty-input').forEach(input => {
            input.addEventListener('change', async (e) => {
                const pId = e.target.dataset.prodId;
                const newQty = parseInt(e.target.value);
                if (newQty && newQty >= 1) {
                    try {
                        await db.sessions.updateItemQuantity(session.id, pId, newQty);
                        openBillModal(session.id); // Reload details
                    } catch (err) {
                        console.error(err);
                        alert("Failed to update item quantity.");
                    }
                }
            });
        });
        
        // Bind item deletion listeners
        itemsContainer.querySelectorAll('.btn-modal-delete-item').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const pId = e.currentTarget.dataset.prodId;
                const item = consolidatedItems[pId];
                if (confirm(`Remove "${item.name}" entirely from this table bill?`)) {
                    try {
                        await db.sessions.deleteItem(session.id, pId);
                        openBillModal(session.id); // Reload details
                    } catch (err) {
                        console.error(err);
                        alert("Failed to delete item.");
                    }
                }
            });
        });
    }
    
    // Configure inputs visibility based on status
    if (session.status === 'open') {
        editCustName.disabled = false;
        editCustPhone.disabled = false;
        if (customerEditSection) customerEditSection.style.display = "block";
        if (addItemSection) addItemSection.style.display = "block";
        
        // Load product select list options
        if (addProductSelect) {
            let selectHtml = `<option value="">-- Choose Menu Item --</option>`;
            allProducts.forEach(prod => {
                if (prod.isAvailable) {
                    selectHtml += `<option value="${prod.id}">${prod.name} (₹${prod.price})</option>`;
                }
            });
            addProductSelect.innerHTML = selectHtml;
        }
    } else {
        // Read-only mode for closed bills
        editCustName.disabled = true;
        editCustPhone.disabled = true;
        if (customerEditSection) customerEditSection.style.display = "none";
        if (addItemSection) addItemSection.style.display = "none";
    }
    
    // Calculate total & taxes
    const total = session.totalAmount;
    const tax = gstEnabled ? Math.round(total * 0.05) : 0;
    const grandTotal = total + tax;
    modalGrandTotal.innerText = `₹${grandTotal}`;
    
    // Show Modal
    if (modalOverlay) modalOverlay.classList.add('open');
}

function closeBillModal() {
    const modalOverlay = document.getElementById('billDetailModal');
    if (modalOverlay) {
        modalOverlay.classList.remove('open');
    }
    activeBillingSessionId = null;
}

// ==========================================================================
// 8. SALES ANALYTICS (Chart.js Integration)
// ==========================================================================

function renderAnalyticsCharts() {
    const filterEl = document.getElementById('analyticsFilter');
    const period = filterEl ? filterEl.value : "7days";
    
    // Calculate timestamps
    const now = Date.now();
    let threshold = 0;
    const today = new Date();
    today.setHours(0,0,0,0);
    const startOfToday = today.getTime();
    
    if (period === 'today') {
        threshold = startOfToday;
    } else if (period === '7days') {
        threshold = now - (7 * 24 * 60 * 60 * 1000);
    } else if (period === '30days') {
        threshold = now - (30 * 24 * 60 * 60 * 1000);
    } else if (period === '90days') {
        threshold = now - (90 * 24 * 60 * 60 * 1000);
    } else if (period === '180days') {
        threshold = now - (180 * 24 * 60 * 60 * 1000);
    }
    
    const paidSessions = allSessions.filter(s => s.status === 'paid' && s.closedAt >= threshold);
    const ordersFiltered = allOrders.filter(o => o.status === 'served' && o.createdAt >= threshold);
    
    // Destroy existing instances to clean up canvases
    if (trafficChartInstance) trafficChartInstance.destroy();
    if (itemsChartInstance) itemsChartInstance.destroy();
    if (revenueChartInstance) revenueChartInstance.destroy();

    // Chart 1: Hourly Order Traffic (Peak Hours)
    const hourBins = Array(24).fill(0);
    paidSessions.forEach(s => {
        const hour = new Date(s.closedAt).getHours();
        hourBins[hour] += s.orderIds.length;
    });

    // We slice to active hours 9 AM to 11 PM (9 to 23)
    const trafficLabels = [];
    const trafficData = [];
    for (let h = 9; h <= 23; h++) {
        const displayHour = h > 12 ? `${h-12} PM` : h === 12 ? '12 PM' : `${h} AM`;
        trafficLabels.push(displayHour);
        trafficData.push(hourBins[h]);
    }

    const trafficCtx = document.getElementById('trafficChart').getContext('2d');
    trafficChartInstance = new Chart(trafficCtx, {
        type: 'bar',
        data: {
            labels: trafficLabels,
            datasets: [{
                label: 'Orders Cooked',
                data: trafficData,
                backgroundColor: 'rgba(223, 168, 86, 0.7)',
                borderColor: 'var(--color-accent-gold)',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    // Chart 2: Top Selling Menu Items
    const productSales = {};
    ordersFiltered.forEach(o => {
        o.items.forEach(item => {
            if (!productSales[item.name]) productSales[item.name] = 0;
            productSales[item.name] += item.quantity;
        });
    });

    const topItems = Object.keys(productSales)
        .map(name => ({ name, qty: productSales[name] }))
        .sort((a,b) => b.qty - a.qty)
        .slice(0, 5);

    const itemsCtx = document.getElementById('itemsChart').getContext('2d');
    itemsChartInstance = new Chart(itemsCtx, {
        type: 'doughnut',
        data: {
            labels: topItems.map(i => i.name),
            datasets: [{
                data: topItems.map(i => i.qty),
                backgroundColor: [
                    '#0c2b20', '#1f5e3b', '#dfa856', '#b8853b', '#4d2f18'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'right' } }
        }
    });

    // Chart 3: Revenue Performance (Dynamic labels / groupings)
    let revenueLabels = [];
    let revenueData = [];
    
    if (period === 'today') {
        const hourlyRev = Array(24).fill(0);
        paidSessions.forEach(s => {
            const hr = new Date(s.closedAt).getHours();
            hourlyRev[hr] += s.totalAmount;
        });
        for (let h = 9; h <= 23; h++) {
            const label = h > 12 ? `${h-12} PM` : h === 12 ? '12 PM' : `${h} AM`;
            revenueLabels.push(label);
            revenueData.push(hourlyRev[h]);
        }
    } else if (period === '7days') {
        const dailyRev = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dailyRev[d.toDateString()] = { label: d.toLocaleDateString([], {weekday: 'short', day: 'numeric'}), val: 0 };
        }
        paidSessions.forEach(s => {
            const dateStr = new Date(s.closedAt).toDateString();
            if (dailyRev[dateStr]) dailyRev[dateStr].val += s.totalAmount;
        });
        revenueLabels = Object.values(dailyRev).map(item => item.label);
        revenueData = Object.values(dailyRev).map(item => item.val);
    } else if (period === '30days') {
        const dailyRev = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dailyRev[d.toDateString()] = { label: d.toLocaleDateString([], {day: 'numeric', month: 'short'}), val: 0 };
        }
        paidSessions.forEach(s => {
            const dateStr = new Date(s.closedAt).toDateString();
            if (dailyRev[dateStr]) dailyRev[dateStr].val += s.totalAmount;
        });
        revenueLabels = Object.values(dailyRev).map(item => item.label);
        revenueData = Object.values(dailyRev).map(item => item.val);
    } else if (period === '90days') {
        const weeklyRev = {};
        for (let i = 11; i >= 0; i--) {
            const start = now - ((i + 1) * 7 * 24 * 60 * 60 * 1000);
            weeklyRev[i] = { label: `Wk -${i}`, val: 0, start, end: start + (7 * 24 * 60 * 60 * 1000) };
        }
        paidSessions.forEach(s => {
            for (let i = 0; i < 12; i++) {
                if (s.closedAt >= weeklyRev[i].start && s.closedAt < weeklyRev[i].end) {
                    weeklyRev[i].val += s.totalAmount;
                    break;
                }
            }
        });
        revenueLabels = Object.values(weeklyRev).map(item => item.label);
        revenueData = Object.values(weeklyRev).map(item => item.val);
    } else if (period === '180days') {
        const monthlyRev = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            monthlyRev[d.getMonth()] = { label: d.toLocaleDateString([], {month: 'long'}), val: 0 };
        }
        paidSessions.forEach(s => {
            const m = new Date(s.closedAt).getMonth();
            if (monthlyRev[m] !== undefined) {
                monthlyRev[m].val += s.totalAmount;
            }
        });
        revenueLabels = Object.values(monthlyRev).map(item => item.label);
        revenueData = Object.values(monthlyRev).map(item => item.val);
    }

    const revenueCtx = document.getElementById('revenueChart').getContext('2d');
    revenueChartInstance = new Chart(revenueCtx, {
        type: 'line',
        data: {
            labels: revenueLabels,
            datasets: [{
                label: 'Revenue (₹)',
                data: revenueData,
                fill: true,
                backgroundColor: 'rgba(12, 43, 32, 0.05)',
                borderColor: 'var(--color-primary-deep)',
                borderWidth: 3,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });

    // Render Tabular Product Sales Performance
    const productTableBody = document.getElementById('productSalesTableBody');
    if (productTableBody) {
        const stats = {};
        ordersFiltered.forEach(o => {
            o.items.forEach(item => {
                const pId = item.productId;
                if (!stats[pId]) {
                    const prodInfo = allProducts.find(p => p.id === pId);
                    let catName = "Other";
                    if (prodInfo && allCategories) {
                        const cat = allCategories.find(c => c.id === prodInfo.categoryId);
                        if (cat) catName = cat.name;
                    }
                    stats[pId] = {
                        name: item.name,
                        category: catName,
                        sold: 0,
                        price: item.price,
                        revenue: 0
                    };
                }
                stats[pId].sold += item.quantity;
                stats[pId].revenue += (item.price * item.quantity);
            });
        });

        const sortedProducts = Object.values(stats).sort((a, b) => b.sold - a.sold);

        let tableHtml = "";
        if (sortedProducts.length === 0) {
            tableHtml = `
                <tr>
                    <td colspan="5" style="text-align:center; padding:16px; color:var(--color-text-muted);">
                        No sales recorded for this period.
                    </td>
                </tr>
            `;
        } else {
            sortedProducts.forEach(prod => {
                tableHtml += `
                    <tr style="border-bottom:1px solid var(--color-border);">
                        <td style="padding:12px 10px; font-weight:500;">${prod.name}</td>
                        <td style="padding:12px 10px; color:var(--color-text-muted);">${prod.category}</td>
                        <td style="padding:12px 10px; text-align:center; font-weight:bold; color:var(--color-primary-deep);">${prod.sold}</td>
                        <td style="padding:12px 10px; text-align:right; font-family:var(--font-heading);">₹${prod.price}</td>
                        <td style="padding:12px 10px; text-align:right; font-family:var(--font-heading); font-weight:bold;">₹${prod.revenue}</td>
                    </tr>
                `;
            });
        }
        productTableBody.innerHTML = tableHtml;
    }
}

// ==========================================================================
// 9. QR CODE MANAGER
// ==========================================================================

function generateTableQRSheets() {
    const hostUrl = elements.qrHostUrl.value.trim();
    
    // 1. Render Master Unified QR Card only
    let html = `
        <div class="qr-card-print" style="border-color:var(--color-accent-gold); box-shadow:0 0 15px rgba(223,168,86,0.3); grid-column: 1 / -1; max-width:320px; margin: 40px auto; padding: 24px;">
            <h3 style="font-family:var(--font-heading); font-weight:800; font-size:1.4rem; color:var(--color-primary-deep);">CHAI SHOTTS</h3>
            <div style="font-size:0.8rem; text-transform:uppercase; font-weight:700; color:var(--color-accent-gold-dark); letter-spacing:0.5px; margin-top:2px;">Master QR Menu</div>
            <div class="qr-card-print-img" style="margin:20px auto; width:150px; height:150px; display:flex; justify-content:center; align-items:center;">
                <canvas id="qrCanvasMaster"></canvas>
            </div>
            <div style="font-family:var(--font-heading); font-weight:800; font-size:1.15rem; color:var(--color-primary-deep)">SCAN TO ORDER DIRECTLY</div>
            <div style="font-size:0.75rem; color:var(--color-text-muted); margin-top:4px; line-height:1.4;">
                Select your table number and enter your name to start ordering!
            </div>
        </div>
    `;
    
    elements.qrPrintGrid.innerHTML = html;

    // Draw Master QR code on Canvas
    const masterCanvas = document.getElementById("qrCanvasMaster");
    if (masterCanvas) {
        new QRious({
            element: masterCanvas,
            value: `${hostUrl}/index.html`,
            size: 150,
            background: '#ffffff',
            foreground: '#0c2b20',
            level: 'H'
        });
    }
}
