import db from './db.js';
import soundEffects from './audio.js';

// State
let knownOrderIds = new Set();
let activeOrders = [];

// DOM Elements
const elements = {
    newOrdersContainer: document.getElementById('newOrdersContainer'),
    preparingContainer: document.getElementById('preparingContainer'),
    newCount: document.getElementById('newCount'),
    prepCount: document.getElementById('prepCount'),
    colNewBadge: document.getElementById('colNewBadge'),
    colPrepBadge: document.getElementById('colPrepBadge'),
    btnLogout: document.getElementById('btnKdsLogout')
};

// ==========================================================================
// 1. AUTHENTICATION & ACCESS CONTROL
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Authenticate Role
    db.auth.listenState(user => {
        if (!user || (user.role !== 'kitchen' && user.role !== 'admin')) {
            alert("Unauthorized. Access restricted to Kitchen & Admin staff.");
            window.location.href = 'login.html';
            return;
        }
        
        // Start KDS Panel
        initKds();
    });
});

function initKds() {
    // 1. Listen to orders in real-time
    db.orders.listen(handleIncomingOrders);

    // 2. Setup Timer to check for delayed tickets every 10 seconds
    setInterval(updateTicketTimes, 10000);

    // 3. Logout action
    elements.btnLogout.addEventListener('click', async () => {
        if (confirm("Do you want to log out from Kitchen Console?")) {
            await db.auth.logout();
            window.location.href = 'login.html';
        }
    });
}

// ==========================================================================
// 2. REALTIME LISTENERS & QUEUES
// ==========================================================================

function handleIncomingOrders(orders) {
    activeOrders = orders;
    
    // Filter down to active kitchen tickets
    const newTickets = orders.filter(o => o.status === 'received');
    const prepTickets = orders.filter(o => o.status === 'preparing');

    // Play chime sound if a brand new ticket is detected
    let hasNewTicket = false;
    newTickets.forEach(o => {
        if (!knownOrderIds.has(o.id)) {
            knownOrderIds.add(o.id);
            hasNewTicket = true;
        }
    });

    if (hasNewTicket) {
        soundEffects.playOrder();
    }

    // Render columns
    renderQueue(newTickets, elements.newOrdersContainer, 'received');
    renderQueue(prepTickets, elements.preparingContainer, 'preparing');

    // Update Counters
    elements.newCount.innerText = newTickets.length;
    elements.prepCount.innerText = prepTickets.length;
    elements.colNewBadge.innerText = `${newTickets.length} Tickets`;
    elements.colPrepBadge.innerText = `${prepTickets.length} Active`;
}

function renderQueue(tickets, container, type) {
    if (tickets.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #5e6f68; width:100%;">
                <i class="fa-solid fa-circle-check" style="font-size: 3rem; color: #1f5e3b; margin-bottom: 12px;"></i>
                <p style="font-size: 1.1rem; font-weight:600;">Queue Clear!</p>
            </div>
        `;
        return;
    }

    let html = "";
    
    // Sort oldest tickets to top/front
    const sorted = [...tickets].sort((a,b) => a.createdAt - b.createdAt);

    sorted.forEach(ticket => {
        const timeElapsed = getTimeElapsedString(ticket.createdAt);
        const delayedClass = isTicketDelayed(ticket.createdAt) ? "delayed" : "";
        
        let itemsHTML = "";
        ticket.items.forEach(item => {
            const itemNotes = item.notes ? `<div class="kds-item-notes"><i class="fa-solid fa-triangle-exclamation"></i> Notes: "${item.notes}"</div>` : "";
            itemsHTML += `
                <div class="kds-item-row">
                    <div>
                        <div class="kds-item-name">${item.name}</div>
                        ${itemNotes}
                    </div>
                    <div class="kds-item-qty">x${item.quantity}</div>
                </div>
            `;
        });

        const orderNotesHTML = ticket.notes ? `<div class="kds-ticket-notes"><i class="fa-solid fa-quote-left"></i> Customer instructions: "${ticket.notes}"</div>` : "";

        let buttonHTML = "";
        if (type === 'received') {
            buttonHTML = `
                <button class="kds-action-btn btn-kds-prepare" data-order-id="${ticket.id}">
                    <i class="fa-solid fa-fire-burner"></i> Start Cooking
                </button>
            `;
        } else if (type === 'preparing') {
            buttonHTML = `
                <button class="kds-action-btn btn-kds-ready" data-order-id="${ticket.id}">
                    <i class="fa-solid fa-bell-concierge"></i> Mark Ready
                </button>
            `;
        }

        html += `
            <div class="kds-card ${delayedClass}" data-ticket-id="${ticket.id}" data-created-at="${ticket.createdAt}">
                <div class="kds-card-header">
                    <span class="kds-table-num">TABLE ${ticket.tableNumber}</span>
                    <span class="kds-time-elapsed" data-time-node="true">
                        <i class="fa-solid fa-clock"></i> ${timeElapsed}
                    </span>
                </div>
                <div class="kds-card-body">
                    <div style="font-size: 0.85rem; color:#8ea298; margin-bottom:12px;">
                        Cust: ${ticket.customerName} | ID: #${ticket.id.slice(-6).toUpperCase()}
                    </div>
                    ${itemsHTML}
                    ${orderNotesHTML}
                </div>
                <div>
                    ${buttonHTML}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Bind action events
    container.querySelectorAll('.kds-action-btn').forEach(btn => {
        btn.addEventListener('click', handleActionClick);
    });
}

// ==========================================================================
// 3. EVENT HANDLERS
// ==========================================================================

async function handleActionClick(e) {
    const btn = e.currentTarget;
    const orderId = btn.dataset.orderId;
    btn.disabled = true;

    if (btn.classList.contains('btn-kds-prepare')) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing...';
        await db.orders.updateStatus(orderId, 'preparing');
    } else if (btn.classList.contains('btn-kds-ready')) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
        // Advance to ready (food is prepared, alert waiter/cashier)
        await db.orders.updateStatus(orderId, 'ready');
    }
}

// ==========================================================================
// 4. TIMERS & DELAY ALERTS
// ==========================================================================

function updateTicketTimes() {
    const timeNodes = document.querySelectorAll('[data-time-node="true"]');
    timeNodes.forEach(node => {
        const card = node.closest('.kds-card');
        const createdAt = parseInt(card.dataset.createdAt);
        node.innerHTML = `<i class="fa-solid fa-clock"></i> ${getTimeElapsedString(createdAt)}`;
        
        // Add delayed flash animation if ticket exceeds threshold
        if (isTicketDelayed(createdAt)) {
            card.classList.add('delayed');
        } else {
            card.classList.remove('delayed');
        }
    });
}

function getTimeElapsedString(timestamp) {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    if (diffMins === 0) {
        return `${diffSecs}s ago`;
    }
    return `${diffMins}m ${diffSecs}s ago`;
}

function isTicketDelayed(timestamp) {
    const thresholdMs = 5 * 60 * 1000; // 5 Minutes warning threshold for testing
    return (Date.now() - timestamp) > thresholdMs;
}
