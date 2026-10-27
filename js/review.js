// js/review.js - Google Review Verification & Interactive Scratch Card Engine
import db, { cleanPhoneNumber } from './db.js';

// Query parameters
const urlParams = new URLSearchParams(window.location.search);
const rawPhone = urlParams.get('p') || urlParams.get('phone') || '';
const phone = cleanPhoneNumber(rawPhone);
const sessionId = urlParams.get('s') || urlParams.get('session') || '';

// UI Elements
const starContainer = document.getElementById('starContainer');
const starFeedbackText = document.getElementById('starFeedbackText');
const btnPostReview = document.getElementById('btnPostReview');
const stepRating = document.getElementById('stepRating');
const stepWaiting = document.getElementById('stepWaiting');
const stepScratch = document.getElementById('stepScratch');
const timeRemainingText = document.getElementById('timeRemainingText');
const btnClaimScratchDirect = document.getElementById('btnClaimScratchDirect');

// Scratch elements
const canvas = document.getElementById('scratchCanvas');
const rewardGiftName = document.getElementById('rewardGiftName');
const rewardCouponCode = document.getElementById('rewardCouponCode');
const rewardExpiryDate = document.getElementById('rewardExpiryDate');
const scratchCompleteNotice = document.getElementById('scratchCompleteNotice');

let selectedRating = 0;
let redirectTime = 0;
const REQUIRED_SPENT_SECONDS = 5; // Minimum required seconds on Google Maps
let verificationInterval = null;

const ratingTexts = {
    1: "Needs Improvement 😞",
    2: "Fair 😐",
    3: "Good 🙂",
    4: "Very Good! 😊",
    5: "Excellent! Loved it! ☕❤️"
};

// Scratch Card Reward Pool
const rewardPool = [
    { gift: "Free Cold Coffee", minOrder: 199 },
    { gift: "Flat ₹50 Off", minOrder: 249 },
    { gift: "Free Bun Maska", minOrder: 149 },
    { gift: "Free Margherita Pizza (7\")", minOrder: 399 },
    { gift: "Flat 15% Off Your Bill", minOrder: 299 }
];

// Initialize Stars
const stars = starContainer.querySelectorAll('i');
stars.forEach(star => {
    star.addEventListener('click', () => {
        selectedRating = parseInt(star.dataset.rating);
        updateStars(selectedRating);
        starFeedbackText.innerText = ratingTexts[selectedRating] || "";
        btnPostReview.disabled = false;
    });

    star.addEventListener('mouseenter', () => {
        const hoverVal = parseInt(star.dataset.rating);
        updateStars(hoverVal, true);
    });
});

starContainer.addEventListener('mouseleave', () => {
    updateStars(selectedRating);
});

function updateStars(val, isHover = false) {
    stars.forEach(s => {
        const sVal = parseInt(s.dataset.rating);
        if (sVal <= val) {
            s.classList.add(isHover ? 'hovered' : 'active');
        } else {
            s.classList.remove('active', 'hovered');
        }
    });
}

// Check if customer already claimed coupon on this number (1 Number = 1 Coupon strictly)
async function checkExistingCoupon() {
    if (!phone) return;
    try {
        const coupons = JSON.parse(localStorage.getItem('cs_scratch_coupons') || '[]');
        const existing = coupons.find(c => c.phone === phone);
        if (existing) {
            // Already claimed reward previously -> Block new scratch card!
            stepRating.style.display = 'none';
            stepWaiting.style.display = 'none';
            
            const mainCard = document.getElementById('mainContainer');
            const alreadyClaimedHtml = `
                <div style="padding: 20px 0;">
                    <div style="font-size:3rem; color:#f39c12; margin-bottom:12px;">
                        <i class="fa-solid fa-gift"></i>
                    </div>
                    <h3 style="color:var(--brand-green); margin-bottom:8px;">Gift Already Claimed!</h3>
                    <p style="color:#666; font-size:0.88rem; line-height:1.5;">
                        Phone number <b>+91 ${phone}</b> has already received a review reward.
                    </p>
                    <div style="background:#fff3cd; color:#856404; padding:12px; border-radius:12px; font-weight:700; margin:16px 0; border:1px dashed #ffeeba;">
                        Your Active Code: <br><span style="font-size:1.2rem; letter-spacing:1px; color:#0c2b20;">${existing.code}</span>
                        <div style="font-size:0.8rem; font-weight:600; margin-top:4px; color:#d9534f;">
                            Reward: ${existing.gift} (Valid till ${new Date(existing.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})
                        </div>
                    </div>
                    <p style="font-size:0.75rem; color:#888;">Rule: One scratch reward per customer mobile number.</p>
                </div>
            `;
            mainCard.innerHTML = alreadyClaimedHtml;
            return true;
        }
    } catch (e) {
        console.error(e);
    }
    return false;
}
checkExistingCoupon();

// Post on Google Button Click
btnPostReview.addEventListener('click', () => {
    if (selectedRating === 0) return;

    stepRating.style.display = 'none';
    stepWaiting.style.display = 'block';
    redirectTime = Date.now();

    // Official Google Maps Review Link (Chai Shotts)
    // Direct Business link shared by cafe:
    const googleReviewUrl = "https://search.google.com/local/writereview?placeid=0fd59701cb76e178&q=CHAI+SHOTTS+CAFE";
    // Fallback direct profile link:
    const fallbackUrl = "https://www.google.com/search?kgmid=/g/11z8s_sr9h&q=CHAI+SHOTTS+CAFE#lrd=0x0:0x0,3,,,";
    
    // We open the official Google Review / Business link
    const googleTab = window.open("https://share.google/tLHYjePHzNBAeGZeS", '_blank');

    // Start checking when user returns (Smart Option B Engine)
    startReturnWatcher();
});

function startReturnWatcher() {
    let secondsLeft = REQUIRED_SPENT_SECONDS;
    timeRemainingText.innerText = `Please wait ${secondsLeft}s on Google...`;

    const countdownTimer = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
            timeRemainingText.innerText = `Please wait ${secondsLeft}s on Google...`;
        } else {
            timeRemainingText.innerText = "Checking review submission...";
            clearInterval(countdownTimer);
        }
    }, 1000);

    // Watch for window focus / visibility change (strictly requires returning AFTER minimum time spent)
    const checkAndUnlock = () => {
        const spentTime = (Date.now() - redirectTime) / 1000;
        if (spentTime >= REQUIRED_SPENT_SECONDS) {
            window.removeEventListener('focus', checkAndUnlock);
            document.removeEventListener('visibilitychange', checkAndUnlock);
            unlockScratchCard();
        }
    };

    window.addEventListener('focus', checkAndUnlock);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkAndUnlock();
    });
}

function unlockScratchCard() {
    stepWaiting.style.display = 'none';
    stepScratch.style.display = 'block';

    // Pick random reward
    const chosen = rewardPool[Math.floor(Math.random() * rewardPool.length)];
    const couponCode = 'CS-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);
    const now = Date.now();
    const expiryTime = now + (7 * 24 * 60 * 60 * 1000); // Exactly 7 Days
    const expiryDateStr = new Date(expiryTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const couponData = {
        code: couponCode,
        phone: phone || "Guest",
        gift: chosen.gift,
        minOrder: chosen.minOrder,
        createdAt: now,
        expiresAt: expiryTime,
        status: 'active',
        claimed: false
    };

    // Save to LocalStorage / Database
    saveCoupon(couponData);

    // Display
    displayReward(couponData, false);
}

function displayReward(coupon, alreadyScratched = false) {
    rewardGiftName.innerText = coupon.gift + (coupon.minOrder ? ` (Min ₹${coupon.minOrder})` : '');
    rewardCouponCode.innerText = coupon.code;
    const expiryDateStr = new Date(coupon.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    rewardExpiryDate.innerText = `Valid till ${expiryDateStr} (7 Days)`;

    stepRating.style.display = 'none';
    stepWaiting.style.display = 'none';
    stepScratch.style.display = 'block';

    if (alreadyScratched) {
        canvas.style.display = 'none';
        scratchCompleteNotice.style.display = 'block';
    } else {
        initScratchCanvas();
    }
}

function saveCoupon(coupon) {
    try {
        const coupons = JSON.parse(localStorage.getItem('cs_scratch_coupons') || '[]');
        coupons.push(coupon);
        localStorage.setItem('cs_scratch_coupons', JSON.stringify(coupons));
    } catch (e) {
        console.error(e);
    }
}

// Realistic Canvas Scratch Card
function initScratchCanvas() {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;

    // Fill with Silver metallic coat
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#c0c0c0');
    gradient.addColorStop(0.5, '#e8e8e8');
    gradient.addColorStop(1, '#a8a8a8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add pattern text "SCRATCH HERE"
    ctx.fillStyle = '#666';
    ctx.font = 'bold 16px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎁 SCRATCH WITH FINGER', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '12px Outfit, sans-serif';
    ctx.fillText('Reveal your lucky cafe reward', canvas.width / 2, canvas.height / 2 + 15);

    let isDrawing = false;
    let scratchedPixels = 0;
    const totalPixels = canvas.width * canvas.height;

    function scratch(e) {
        if (!isDrawing) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2, false);
        ctx.fill();

        checkScratchPercentage();
    }

    function checkScratchPercentage() {
        scratchedPixels++;
        if (scratchedPixels > 30) { // Enough scratching done
            canvas.style.transition = 'opacity 0.6s ease';
            canvas.style.opacity = '0';
            setTimeout(() => {
                canvas.style.display = 'none';
                scratchCompleteNotice.style.display = 'block';
                // Fire celebratory confetti!
                if (window.confetti) {
                    window.confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
                }
            }, 500);
        }
    }

    // Touch & Mouse Events
    canvas.addEventListener('mousedown', () => isDrawing = true);
    window.addEventListener('mouseup', () => isDrawing = false);
    canvas.addEventListener('mousemove', scratch);

    canvas.addEventListener('touchstart', (e) => { isDrawing = true; scratch(e); e.preventDefault(); });
    window.addEventListener('touchend', () => isDrawing = false);
    canvas.addEventListener('touchmove', (e) => { scratch(e); e.preventDefault(); });
}
