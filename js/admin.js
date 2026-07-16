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
    prodPopular: document.getElementById('prodPopular'),
    prodAvailable: document.getElementById('prodAvailable'),
    catName: document.getElementById('catName'),
    menuCatalogFilter: document.getElementById('menuCatalogFilter'),
    catalogListContainer: document.getElementById('catalogListContainer'),
    toggleGstConfig: document.getElementById('toggleGstConfig'),
    
    // QR Manager
    qrHostUrl: document.getElementById('qrHostUrl'),
    qrPrintGrid: document.getElementById('qrPrintGrid')
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
}

function handleOrdersUpdate(orders) {
    allOrders = orders;
    updateDashboardMetrics();
    renderLiveOrdersQueue();
    if (selectedSession) {
        loadCheckoutDrawer(selectedSession);
    }
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
    doc.text("Shop No. 5, Wood-house Avenue, City", 40, y, { align: "center" });
    
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
}

function handleProductsUpdate(products) {
    allProducts = products;
    renderMenuCatalog();
    updateDashboardMetrics(); // update charts data
}

function setupMenuEditorActions() {
    // 1. Save Product Submission
    elements.productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = elements.prodName.value.trim();
        const catId = elements.prodCategory.value;
        const price = parseInt(elements.prodPrice.value);
        const desc = elements.prodDescription.value.trim();
        const img = elements.prodImage.value.trim() || "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300";
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
            elements.productForm.reset();
        } catch (err) {
            console.error(err);
            alert("Failed to save product.");
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
                elements.prodImage.value = prod.image || "";
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
// 8. SALES ANALYTICS (Chart.js Integration)
// ==========================================================================

function renderAnalyticsCharts() {
    const paidSessions = allSessions.filter(s => s.status === 'paid');
    
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
    allOrders.filter(o => o.status === 'served').forEach(o => {
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

    // Chart 3: Daily Revenue Performance (Last 7 Days)
    const dailyRev = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dailyRev[d.toDateString()] = { label: d.toLocaleDateString([], {weekday: 'short', day: 'numeric'}), val: 0 };
    }

    paidSessions.forEach(s => {
        const dateStr = new Date(s.closedAt).toDateString();
        if (dailyRev[dateStr]) {
            dailyRev[dateStr].val += s.totalAmount;
        }
    });

    const revenueLabels = Object.values(dailyRev).map(item => item.label);
    const revenueData = Object.values(dailyRev).map(item => item.val);

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
