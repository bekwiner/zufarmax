document.addEventListener('DOMContentLoaded', () => {
    // Top-tier interactions
    const tgWebApp = window.Telegram?.WebApp;
    const canHaptic = Boolean(
        tgWebApp?.HapticFeedback &&
        typeof tgWebApp?.isVersionAtLeast === 'function' &&
        tgWebApp.isVersionAtLeast('6.1')
    );

    const haptic = (type = 'light') => {
        if (canHaptic) {
            if (type === 'light') tgWebApp.HapticFeedback.impactOccurred('light');
            else if (type === 'success') tgWebApp.HapticFeedback.notificationOccurred('success');
            else tgWebApp.HapticFeedback.selectionChanged();
        }
    };

    const STATIC_DATA = JSON.parse(JSON.stringify(window.STORE_DATA || {
        diamonds: [],
        uc: [],
        gold: [],
        tg: [],
        accounts: []
    }));
    const STORE_DATA = {
        diamonds: [],
        uc: [],
        gold: [],
        tg: [],
        accounts: []
    };
    window.STORE_DATA = STORE_DATA;
    const KNOWN_CATEGORY_META = {
        diamonds: { title: 'Free Fire', badge: 'Almazlar', target: 'sub-dia', icon: 'assets/img/freefire.webp' },
        uc: { title: 'PUBG Mobile', badge: 'UC Paketlar', target: 'sub-uc', icon: 'assets/img/pubg.png' },
        gold: { title: 'Standoff 2', badge: 'Gold & Promo', target: 'sub-gold', icon: 'assets/img/standoff.png' },
        tg: { title: 'Telegram', badge: 'Premium & Stars', target: 'sub-tg', icon: 'assets/img/telegram.png' }
    };
    let CATEGORY_META = {};
    let accountsHydrated = false;
    let catalogHydrated = false;
    let catalogLoadFailed = false;
    let DYNAMIC_CATEGORIES = {};
    let currentDynamicKey = null;
    let selectedSettingsModelKey = null;
    let selectedSettingsBrandKey = null;
    let settingsDetailsExpanded = false;
    let DEVICE_SETTINGS = [];
    let heroSliderTimer = null;
    let PAYMENT_CARD_NUMBER = '8600 1234 5678 9012';
    let PAYMENT_CARD_COPY = PAYMENT_CARD_NUMBER.replace(/\s+/g, '');
    let PAYMENT_CARD_LABEL = 'Humo / Uzcard';
    let PAYMENT_CARD_OWNER = 'Ism Familiya';
    const fallbackIcons = {
        diamonds: 'assets/freefire/110.webp',
        uc: 'assets/pubg-uc/60-uc.webp',
        gold: 'assets/banner/standoff-2-gold.webp',
        tg: 'assets/img/telegram.png'
    };

    const buildMapById = (arr = []) => {
        const map = new Map();
        arr.forEach((item) => map.set(String(item.id), item));
        return map;
    };

    const enrichCatalogItems = (items = [], categoryKey) => {
        const staticMap = buildMapById(STATIC_DATA[categoryKey] || []);
        const defaultIcon = fallbackIcons[categoryKey] || 'assets/img/logo.JPG';
        return items.map((item) => {
            const fromStatic = staticMap.get(String(item.id)) || {};
            return {
                ...fromStatic,
                ...item,
                icon: item.icon || fromStatic.icon || defaultIcon,
                bonus: item.bonus || fromStatic.bonus || '0'
            };
        });
    };
    const titleCase = (text) => String(text || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
    const normalizeCategoryMetaKey = (key) => String(key || '').trim().toLowerCase() === 'telegram' ? 'tg' : String(key || '').trim().toLowerCase();
    const applyCategoryMeta = (metaMap = {}) => {
        CATEGORY_META = {};
        Object.entries(metaMap || {}).forEach(([rawKey, rawValue]) => {
            const key = normalizeCategoryMetaKey(rawKey);
            if (!key || !rawValue || typeof rawValue !== 'object') return;
            const next = {
                title: String(rawValue.name || rawValue.title || KNOWN_CATEGORY_META[key]?.title || titleCase(key)),
                badge: String(rawValue.badge || KNOWN_CATEGORY_META[key]?.badge || 'Xizmatlar'),
                icon: String(rawValue.icon || KNOWN_CATEGORY_META[key]?.icon || 'assets/img/logo.JPG')
            };
            CATEGORY_META[key] = next;
            if (KNOWN_CATEGORY_META[key]) {
                KNOWN_CATEGORY_META[key] = { ...KNOWN_CATEGORY_META[key], ...next };
            }
        });
    };

    const enrichAccounts = (items = []) => {
        const byId = buildMapById(STATIC_DATA.accounts || []);
        const byTitle = new Map((STATIC_DATA.accounts || []).map((x) => [String(x.title), x]));
        return items.map((item) => {
            const fallback = byId.get(String(item.id)) || byTitle.get(String(item.title)) || {};
            const skinsRaw = item.skins ?? item.sk ?? item.meta?.skins ?? fallback.skins ?? fallback.sk ?? fallback.meta?.skins;
            const skinsNum = Number(skinsRaw);
            const mergedStats = {
                ...(fallback.stats || {}),
                ...(item.stats || {})
            };
            if (Number.isFinite(skinsNum)) {
                mergedStats.clothes = skinsNum;
            } else if (mergedStats.clothes == null) {
                mergedStats.clothes = 0;
            }
            return {
                ...fallback,
                ...item,
                images: item.images || fallback.images || ['assets/banner/accaunt.jpeg'],
                stats: mergedStats
            };
        });
    };

    // Load Telegram WebApp User Data
    if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
        const user = window.Telegram.WebApp.initDataUnsafe.user;
        const profName = document.getElementById('prof-name');
        const profAvatar = document.getElementById('prof-avatar');
        const profUID = document.getElementById('prof-uid');

        if (profName) profName.innerText = (user.first_name + ' ' + (user.last_name || '')).trim().toUpperCase();
        if (profUID) profUID.innerText = '#' + user.id;
        if (profAvatar) profAvatar.src = user.photo_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${user.id}`;
    }

    const showToast = (msg) => {
        const t = document.getElementById('toast');
        t.querySelector('span').innerText = msg;
        t.classList.add('show');
        haptic('success');
        setTimeout(() => t.classList.remove('show'), 3000);
    };
    window.showToast = showToast;
    const escapeHtml = (value) => String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    const productInfoModal = document.getElementById('product-info-modal');
    window.openProductInfo = (item) => {
        if (!item || !productInfoModal) return;
        const titleEl = document.getElementById('product-info-title');
        const priceEl = document.getElementById('product-info-price');
        const descEl = document.getElementById('product-info-description');
        if (titleEl) titleEl.textContent = String(item.title || 'Mahsulot');
        if (priceEl) priceEl.textContent = `${Number(item.price || 0).toLocaleString()} UZS`;
        if (descEl) {
            const desc = String(item.description || '').trim();
            descEl.textContent = desc || 'Bu mahsulot uchun hozircha qoshimcha malumot kiritilmagan.';
        }
        productInfoModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };
    window.closeProductInfo = () => {
        if (!productInfoModal) return;
        productInfoModal.classList.remove('active');
        document.body.style.overflow = '';
    };
    const bindProductInfoButton = (button, item) => {
        if (!button) return;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            window.openProductInfo(item);
        });
    };
    const formatOrderTime = (value) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return 'Hozirgina';
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const y = new Date(now);
        y.setDate(now.getDate() - 1);
        const isYesterday = d.toDateString() === y.toDateString();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        if (isToday) return `Bugun ${hh}:${mm}`;
        if (isYesterday) return `Kecha ${hh}:${mm}`;
        return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hh}:${mm}`;
    };
    const getOrderStatusUI = (rawStatus, rawPaymentStatus) => {
        const s = String(rawStatus || '').toLowerCase();
        const ps = String(rawPaymentStatus || '').toLowerCase();
        if (ps === 'id_error') {
            return { icon: 'fa-id-card', iconBg: 'rgba(255,71,87,0.1)', iconColor: '#ff7a8a', label: 'ID xato', badgeStyle: 'color:#ff7a8a; background: rgba(255,71,87,0.08); border: 1px solid rgba(255,71,87,0.25);' };
        }
        if (ps === 'fake_receipt') {
            return { icon: 'fa-triangle-exclamation', iconBg: 'rgba(255,71,87,0.1)', iconColor: '#ff4757', label: 'Soxta chek', badgeStyle: 'color:#ff4757; background: rgba(255,71,87,0.08); border: 1px solid rgba(255,71,87,0.25);' };
        }
        if (s === 'done') {
            return { icon: 'fa-check', iconBg: 'rgba(0,229,255,0.1)', iconColor: 'var(--primary)', label: 'Bajarildi', badgeStyle: 'color:var(--primary); background: rgba(0,229,255,0.05); border: 1px solid rgba(0,229,255,0.3);' };
        }
        if (s === 'processing') {
            return { icon: 'fa-spinner fa-spin', iconBg: 'rgba(0,255,137,0.1)', iconColor: '#00ff89', label: 'Jarayonda', badgeStyle: 'color:#00ff89; background: rgba(0,255,137,0.08); border: 1px solid rgba(0,255,137,0.25);' };
        }
        if (s === 'cancelled') {
            return { icon: 'fa-xmark', iconBg: 'rgba(255,71,87,0.1)', iconColor: '#ff4757', label: 'Bekor', badgeStyle: 'color:#ff7a8a; background: rgba(255,71,87,0.08); border: 1px solid rgba(255,71,87,0.25);' };
        }
        return { icon: 'fa-clock', iconBg: 'rgba(255,204,0,0.1)', iconColor: '#ffcc00', label: 'Kutilmoqda', badgeStyle: 'color:#000; background:#ffcc00; border: none;' };
    };
    let myOrdersExpanded = false;
    let myOrdersCache = [];
    const renderMyOrders = (items = []) => {
        const box = document.getElementById('my-orders-list');
        if (!box) return;
        if (!Array.isArray(items) || items.length === 0) {
            box.innerHTML = `<div class="glass-panel" style="padding:14px; text-align:center; color:var(--text-muted); font-size:0.78rem; font-weight:700;">Hozircha buyurtmalar yo'q.</div>`;
            return;
        }
        const visibleItems = myOrdersExpanded ? items : items.slice(0, 5);
        const listHtml = visibleItems.map((order) => {
            const ui = getOrderStatusUI(order.status, order.paymentStatus);
            const title = escapeHtml(order.productTitle || 'Buyurtma');
            const dateText = formatOrderTime(order.createdAt);
            return `
                <div class="glass-panel ripple" style="padding: 12px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 36px; height: 36px; background: ${ui.iconBg}; border-radius: 10px; display: flex; justify-content: center; align-items: center; color: ${ui.iconColor}; font-size: 1.1rem; flex: none;">
                        <i class="fa-solid ${ui.icon}"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 800; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-family: monospace;">${dateText}</div>
                    </div>
                    <div style="font-size: 0.65rem; font-weight: 800; padding: 4px 8px; border-radius: 6px; flex: none; ${ui.badgeStyle}">${ui.label}</div>
                </div>
            `;
        }).join('');
        const moreBtnHtml = (!myOrdersExpanded && items.length > 5)
            ? `<button id="my-orders-more-btn" class="btn-sec" style="width:100%; height:38px; margin-top:6px;">Ko'proq</button>`
            : '';
        box.innerHTML = listHtml + moreBtnHtml;
        const moreBtn = document.getElementById('my-orders-more-btn');
        if (moreBtn) {
            moreBtn.onclick = () => {
                myOrdersExpanded = true;
                renderMyOrders(myOrdersCache);
            };
        }
    };
    const loadMyOrders = async () => {
        const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (!tgUser?.id) return;
        try {
            const resp = await fetch(`/api/orders/${tgUser.id}`, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const payload = await resp.json().catch(() => ({}));
            const rows = Array.isArray(payload?.data) ? payload.data : [];
            myOrdersCache = rows;
            myOrdersExpanded = false;
            renderMyOrders(rows);
        } catch (err) {
            console.warn('Orders API xatosi:', err);
        }
    };
    const loadProfileBalance = async () => {
        const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        const balEl = document.getElementById('prof-balance');
        const refBalEl = document.getElementById('page-ref-earned');
        if (!tgUser?.id || !balEl) return 0;
        try {
            const resp = await fetch(`/api/users/${tgUser.id}/balance`, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const payload = await resp.json().catch(() => ({}));
            const balance = Number(payload?.data?.balance || 0);
            profileBalance = balance;
            balEl.textContent = `${balance.toLocaleString()} almaz`;
            if (refBalEl) refBalEl.textContent = balance.toLocaleString();
            return balance;
        } catch (err) {
            console.warn('Balance API xatosi:', err);
            return Number(profileBalance || 0);
        }
    };

    const applyPaymentUi = () => {
        const cardLabelEl = document.getElementById('pay-card-label');
        const cardNumberEl = document.getElementById('pay-card-number');
        const cardOwnerEl = document.getElementById('pay-card-owner');
        if (cardLabelEl) cardLabelEl.textContent = PAYMENT_CARD_LABEL;
        if (cardNumberEl) cardNumberEl.textContent = PAYMENT_CARD_NUMBER;
        if (cardOwnerEl) cardOwnerEl.textContent = `Karta egasi: ${PAYMENT_CARD_OWNER}`;
    };

    const loadPaymentConfig = async () => {
        try {
            const resp = await fetch('/api/payment-config', { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const payload = await resp.json().catch(() => ({}));
            const data = payload?.data || {};
            const cardLabel = String(data.cardLabel || '').trim();
            const cardNumber = String(data.cardNumber || '').trim();
            const cardOwner = String(data.cardOwner || '').trim();
            if (cardLabel) PAYMENT_CARD_LABEL = cardLabel;
            if (cardNumber) PAYMENT_CARD_NUMBER = cardNumber;
            PAYMENT_CARD_COPY = PAYMENT_CARD_NUMBER.replace(/\s+/g, '');
            if (cardOwner) PAYMENT_CARD_OWNER = cardOwner;
        } catch (err) {
            console.warn('Payment config API xatosi:', err);
        } finally {
            applyPaymentUi();
        }
    };
    applyPaymentUi();

    window.copyCard = () => {
        navigator.clipboard.writeText(PAYMENT_CARD_COPY).then(() => showToast('Karta raqamidan nusxa olindi.'));
    };

    // Navigation
    const navs = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.tab-page');
    window.navTo = (id) => {
        haptic();
        navs.forEach(n => n.classList.toggle('active', n.getAttribute('data-target') === id));
        pages.forEach(p => p.classList.toggle('active', p.id === id));
        window.scrollTo(0, 0);
        if (id === 'page-help') initSupportChat();
        if (id === 'page-ref') loadReferrals();
        if (id === 'page-prof') {
            loadMyOrders();
            loadProfileBalance();
        }
        if (id === 'page-acc') {
            renderSettingsPage();
            loadDeviceSettingsFromBackend();
        }
    };
    navs.forEach(n => n.addEventListener('click', e => { e.preventDefault(); navTo(n.getAttribute('data-target')); }));

    // Removed buggy JS ripple. Buttons will use CSS-based active states.

    // Live Ticker Logic
    const initLiveTicker = () => {
        const ticker = document.getElementById('live-ticker-text');
        if (!ticker) return;

        const msgs = [
            'Muvaffaqiyatli yetkazildi: <span style="font-weight:900; color:var(--primary)">1060 Olmos</span>.',
            'Muvaffaqiyatli ulandi: <span style="font-weight:900; color:var(--primary)">Telegram Premium 1 oy</span>.',
            'Yetkazildi: <span style="font-weight:900; color:var(--primary)">5700 Standoff Gold</span>.',
            'Yangi xarid: <span style="font-weight:900; color:var(--primary)">PUBG Mobile 660 UC</span>.',
            'Yetkazildi: <span style="font-weight:900; color:var(--primary)">2180 Olmos (Free Fire)</span>.',
            'Muvaffaqiyatli ulandi: <span style="font-weight:900; color:var(--primary)">Telegram 100 Stars</span>.'
        ];

        setInterval(() => {
            // Re-trigger animation
            ticker.style.animation = 'none';
            ticker.offsetHeight; /* trigger reflow */
            ticker.style.animation = null;

            const randomMsg = msgs[Math.floor(Math.random() * msgs.length)];
            ticker.innerHTML = `<i class="fa-solid fa-fire glow-icon" style="color:var(--primary)"></i> ${randomMsg}`;
        }, 5000);
    };

    setTimeout(initLiveTicker, 1000);
    // Referral System
    const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    const refCode = tgUserId ? `ref_${tgUserId}` : 'ref_0000';
    let refLink = document.getElementById('page-ref-link')?.textContent?.trim() || `https://t.me/unknown_bot?start=${refCode}`;
    let refCount = 0;
    let refBonus = 0;
    let profileBalance = 0;
    let refToday = 0;
    let refBonusPerUser = 4;
    let invitedUsers = [];

    const updateRefUI = () => {
        const linkEl = document.getElementById('page-ref-link');
        const pageCount = document.getElementById('page-ref-count');
        const pageEarned = document.getElementById('page-ref-earned');
        const pageToday = document.getElementById('page-ref-today');
        const profTotal = document.getElementById('prof-ref-total');
        const refList = document.getElementById('page-ref-users');
        const refListEmpty = document.getElementById('page-ref-users-empty');

        if (linkEl) linkEl.textContent = refLink;
        if (pageCount) pageCount.textContent = refCount.toLocaleString();
        if (pageEarned) pageEarned.textContent = profileBalance.toLocaleString();
        if (pageToday) pageToday.textContent = refToday.toLocaleString();
        if (profTotal) profTotal.textContent = `${refCount.toLocaleString()} ta`;

        if (refList) {
            refList.innerHTML = invitedUsers.map((user) => {
                const displayName = escapeHtml(user.displayName);
                const handle = escapeHtml(user.username ? `@${user.username}` : `ID ${user.invitedId}`);
                return `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
                        <div style="min-width:0;">
                            <div style="font-size:0.82rem; font-weight:800; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayName}</div>
                            <div style="font-size:0.68rem; color:var(--text-muted);">${handle}</div>
                        </div>
                        <div style="font-size:0.65rem; color:#00ff89; font-weight:800;">+${refBonusPerUser}</div>
                    </div>
                `;
            }).join('');
        }

        if (refListEmpty) {
            refListEmpty.style.display = invitedUsers.length ? 'none' : 'block';
        }
    };

    const setRefLinkByUsername = (username) => {
        if (!username) return;
        refLink = `https://t.me/${username}?start=${refCode}`;
        updateRefUI();
    };

    const extractUsernameFromLink = (value) => {
        const match = String(value || '').match(/https?:\/\/t\.me\/([A-Za-z0-9_]+)/i);
        return match ? match[1] : null;
    };

    const resolveBotUsername = async () => {
        const fromReceiver = window.Telegram?.WebApp?.initDataUnsafe?.receiver?.username;
        if (fromReceiver) return fromReceiver;

        try {
            const resp = await fetch('/api/bot-info', { cache: 'no-store' });
            if (resp.ok) {
                const payload = await resp.json();
                const fromApi = payload?.data?.username;
                if (fromApi) return fromApi;
            }
        } catch (err) {
            console.warn('Bot username API xatosi:', err);
        }

        return extractUsernameFromLink(document.getElementById('page-ref-link')?.textContent);
    };

    const loadReferrals = async () => {
        if (!tgUserId) return;
        try {
            const resp = await fetch(`/api/referrals/${tgUserId}`, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const payload = await resp.json();
            const data = payload?.data || {};

            refCount = Number(data.invites || 0);
            refBonus = Number(data.bonus || 0);
            refToday = Number(data.bonusToday || 0);
            refBonusPerUser = Number(data.bonusPerUser || 4);
            invitedUsers = Array.isArray(data.invitedUsers) ? data.invitedUsers : [];
            updateRefUI();
        } catch (err) {
            console.warn('Referral API xatosi:', err);
        }
    };
    let redeemProducts = [];
    let redeemSelectedProduct = null;
    const renderRedeemProducts = () => {
        const wrap = document.getElementById('redeem-products');
        if (!wrap) return;
        if (!redeemProducts.length) {
            wrap.innerHTML = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">Free Fire mahsulotlari topilmadi.</div>`;
            return;
        }
        wrap.innerHTML = redeemProducts.map((p) => {
            const selected = redeemSelectedProduct && String(redeemSelectedProduct.id) === String(p.id);
            return `
                <div onclick="selectRedeemProduct('${String(p.id).replace(/'/g, "\\'")}')"
                    style="padding:9px 10px; border:1px solid ${selected ? 'rgba(0,229,255,.65)' : 'rgba(255,255,255,.08)'}; background:${selected ? 'rgba(0,229,255,.08)' : 'rgba(255,255,255,.02)'}; border-radius:10px; margin-bottom:7px; cursor:pointer;">
                    <div style="font-size:0.84rem; font-weight:800; color:#fff;">${p.title}</div>
                    <div style="font-size:0.66rem; color:var(--text-muted);">Free Fire · Miqdor (qty): <b style="color:var(--primary)">${Number(p.qty || 0)}</b></div>
                </div>
            `;
        }).join('');
    };
    const updateRedeemEligibility = () => {
        const status = document.getElementById('redeem-status');
        const uidWrap = document.getElementById('redeem-uid-wrap');
        const sendBtn = document.getElementById('btn-redeem-send');
        const uidInput = document.getElementById('redeem-uid-input');
        const confirmBox = document.getElementById('redeem-confirm-box');
        const uid = String(uidInput?.value || '').trim();
        if (!redeemSelectedProduct) {
            if (status) status.textContent = 'Mahsulot tanlang.';
            if (uidWrap) uidWrap.style.display = 'none';
            if (confirmBox) confirmBox.style.display = 'none';
            if (sendBtn) sendBtn.disabled = true;
            return;
        }
        const need = Number(redeemSelectedProduct.qty || 0);
        const have = Number(profileBalance || 0);
        if (have < need) {
            if (status) status.textContent = `Almaz miqdori yetmaydi. Kerak: ${need}, balans: ${have}`;
            if (uidWrap) uidWrap.style.display = 'none';
            if (confirmBox) confirmBox.style.display = 'none';
            if (sendBtn) sendBtn.disabled = true;
            return;
        }
        if (status) status.textContent = `Balans yetarli. ID kiriting. Kerak: ${need}, balans: ${have}`;
        if (uidWrap) uidWrap.style.display = '';
        if (uid.length >= 5) {
            if (confirmBox) confirmBox.style.display = '';
            const view = document.getElementById('redeem-uid-view');
            if (view) view.textContent = uid;
            if (sendBtn) sendBtn.disabled = false;
        } else {
            if (confirmBox) confirmBox.style.display = 'none';
            if (sendBtn) sendBtn.disabled = true;
        }
    };
    window.selectRedeemProduct = (id) => {
        redeemSelectedProduct = redeemProducts.find((p) => String(p.id) === String(id)) || null;
        renderRedeemProducts();
        updateRedeemEligibility();
    };
    window.openRedeemModal = async () => {
        const modal = document.getElementById('redeem-modal');
        const input = document.getElementById('redeem-uid-input');
        const confirmBox = document.getElementById('redeem-confirm-box');
        const sendBtn = document.getElementById('btn-redeem-send');
        const view = document.getElementById('redeem-uid-view');
        const status = document.getElementById('redeem-status');
        const productsWrap = document.getElementById('redeem-products');
        const uidWrap = document.getElementById('redeem-uid-wrap');
        if (input) input.value = '';
        if (view) view.textContent = '—';
        if (confirmBox) confirmBox.style.display = 'none';
        if (uidWrap) uidWrap.style.display = 'none';
        if (sendBtn) sendBtn.disabled = true;
        if (status) status.textContent = 'Mahsulot tanlang.';
        redeemSelectedProduct = null;
        redeemProducts = [];
        if (productsWrap) productsWrap.innerHTML = `<div style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">Mahsulotlar yuklanmoqda...</div>`;
        await loadProfileBalance();
        try {
            const resp = await fetch('/api/catalog', { cache: 'no-store' });
            const payload = await resp.json().catch(() => ({}));
            const items = Array.isArray(payload?.data?.diamonds) ? payload.data.diamonds : [];
            redeemProducts = items
                .map((x) => ({ id: String(x.id), title: String(x.title || 'Mahsulot'), qty: Number(x.qty || 0) }))
                .filter((x) => x.qty > 0)
                .sort((a, b) => a.qty - b.qty);
        } catch {
            redeemProducts = [];
        }
        renderRedeemProducts();
        if (modal) modal.classList.add('active');
    };
    window.closeRedeemModal = () => {
        const modal = document.getElementById('redeem-modal');
        if (modal) modal.classList.remove('active');
    };
    window.onRedeemUidInput = () => {
        updateRedeemEligibility();
    };
    window.sendRedeemRequest = async () => {
        const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (!tgUser?.id) {
            showToast('Telegram user topilmadi');
            return;
        }
        const uid = String(document.getElementById('redeem-uid-input')?.value || '').trim();
        if (!redeemSelectedProduct) {
            showToast('Avval mahsulot tanlang');
            return;
        }
        if (Number(profileBalance || 0) < Number(redeemSelectedProduct.qty || 0)) {
            showToast('Almaz miqdori yetmaydi');
            return;
        }
        if (!uid || uid.length < 5) {
            showToast('UID ni to\'g\'ri kiriting');
            return;
        }
        const btn = document.getElementById('btn-redeem-diamonds');
        const sendBtn = document.getElementById('btn-redeem-send');
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.7';
        }
        if (sendBtn) sendBtn.disabled = true;
        try {
            const resp = await fetch('/api/balance/redeem-diamonds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: String(tgUser.id),
                    gameUid: uid,
                    productId: String(redeemSelectedProduct.id || '')
                })
            });
            const payload = await resp.json().catch(() => ({}));
            if (!resp.ok || payload?.ok === false) {
                throw new Error(payload?.message || 'Almaz chiqarib bo\'lmadi');
            }
            const d = payload?.data || {};
            showToast(`Zapros yuborildi: ${Number(d.redeemedQty || 0)} almaz, qoldiq ${Number(d.balanceAfter || 0)}`);
            window.closeRedeemModal();
            await loadProfileBalance();
            await loadMyOrders();
        } catch (err) {
            showToast(err.message || 'Almaz chiqarishda xatolik');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
            }
            if (sendBtn) sendBtn.disabled = false;
        }
    };

    const btnCopyRef = document.getElementById('btn-copy-ref');
    if (btnCopyRef) {
        btnCopyRef.onclick = async () => {
            try {
                await navigator.clipboard.writeText(refLink);
                showToast('Referal havola nusxalandi');
            } catch {
                showToast('Havolani nusxalab bo\'lmadi');
            }
        };
    }

    updateRefUI();
    loadPaymentConfig();
    loadReferrals();
    loadMyOrders();
    loadProfileBalance();
    resolveBotUsername().then(setRefLinkByUsername);
    setInterval(() => {
        const refPage = document.getElementById('page-ref');
        if (refPage?.classList.contains('active')) loadReferrals();
    }, 15000);
    setInterval(() => {
        const profPage = document.getElementById('page-prof');
        if (profPage?.classList.contains('active')) {
            loadMyOrders();
            loadProfileBalance();
        }
    }, 8000);

    // Global Checkout State
    let currItem = null;
    let currType = null;
    let confirmedUID = '';
    let confirmedNickname = '';
    let receiptImageData = '';

    const resolveTelegramUser = () => {
        const fromUnsafe = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (fromUnsafe?.id) return fromUnsafe;

        const initData = window.Telegram?.WebApp?.initData || '';
        if (!initData) return null;

        try {
            const params = new URLSearchParams(initData);
            const rawUser = params.get('user');
            if (!rawUser) return null;
            const parsed = JSON.parse(rawUser);
            return parsed?.id ? parsed : null;
        } catch {
            return null;
        }
    };

    // Sheet Modal Control
    const sheet = document.getElementById('checkout-core');
    window.openSheet = (item, type) => {
        haptic();
        currItem = item;
        currType = type;

        // Reset Steps & Form UI
        document.getElementById('uid-input').value = '';
        document.getElementById('id-found').classList.remove('active');
        document.getElementById('btn-check-id').style.display = 'block';
        document.getElementById('btn-next-2').style.display = 'none';
        document.getElementById('found-nickname').innerText = '-';
        confirmedNickname = '';
        receiptImageData = '';

        // Reset File Upload UI
        const fileInp = document.getElementById('receipt-file');
        fileInp.value = '';
        document.getElementById('upload-area').classList.remove('has-file');
        document.getElementById('up-icon').className = 'fa-solid fa-cloud-arrow-up';
        document.getElementById('up-icon').style.color = 'var(--text-muted)';
        document.getElementById('up-title').innerText = 'Chekni bu yerga yuklang';
        document.getElementById('up-desc').innerText = 'To\'lov qilinganligini tasdiqlovchi skrinshot';

        const subBtn = document.getElementById('btn-submit-order');
        subBtn.disabled = true;
        subBtn.style.opacity = '0.5';
        subBtn.style.display = 'none';

        // Routing Logic: Account skips ID check
        if (type === 'acc') {
            confirmedUID = 'N/A';
            confirmedNickname = 'Account order';
            setupBillStep();
            setStep(2);
        } else {
            setStep(1);
        }

        sheet.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    window.closeSheet = () => {
        sheet.classList.remove('active');
        document.body.style.overflow = '';
    };

    const closeSheetBtn = document.getElementById('close-sheet');
    if (closeSheetBtn) closeSheetBtn.addEventListener('click', closeSheet);
    if (sheet) sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

    const setStep = (num) => {
        document.querySelectorAll('.step-pane').forEach((el, i) => {
            el.classList.toggle('active', i + 1 === num);
        });
    };

    // Step 1: UID local confirm (no backend lookup)
    window.verifyUID = async () => {
        const val = String(document.getElementById('uid-input').value || '').trim();
        if (val.length < 5) {
            showToast('ID noto\'g\'ri formatda'); return;
        }

        const btn = document.getElementById('btn-check-id');
        const loader = document.getElementById('uid-loader');
        btn.style.display = 'none';
        loader.style.display = 'flex';

        try {
            if (currType === 'dia') {
                const resp = await fetch('/api/player/lookup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid: val, game: 'ff' })
                });
                const payload = await resp.json().catch(() => ({}));
                if (!resp.ok || payload.ok === false) {
                    throw new Error(payload.message || 'Nickname topilmadi');
                }
                document.getElementById('found-nickname').innerText = String(payload?.data?.nickname || val);
                confirmedNickname = String(payload?.data?.nickname || '');
            } else {
                await new Promise((resolve) => setTimeout(resolve, 450));
                document.getElementById('found-nickname').innerText = val;
                confirmedNickname = '';
            }

            loader.style.display = 'none';
            document.getElementById('id-found').classList.add('active');
            confirmedUID = val;
            haptic('success');
            document.getElementById('btn-next-2').style.display = 'block';
        } catch (err) {
            loader.style.display = 'none';
            btn.style.display = '';
            showToast(err.message || 'ID tekshirib bo\'lmadi');
        }
    };

    window.goStep = (num) => {
        if (num === 2) setupBillStep();
        setStep(num);
    };

    // Step 2: Billing Initialization & Upload Listener
    const setupBillStep = () => {
        document.getElementById('checkout-desc').innerText = `Tanlangan paket: ${currItem.title}`;
        document.getElementById('co-price').innerText = currItem.price.toLocaleString() + ' UZS';
        document.getElementById('co-total').innerText = currItem.price.toLocaleString() + ' UZS';
        document.getElementById('bill-uid').innerText = confirmedUID;
    };

    window.handleFile = (input) => {
        if (input.files && input.files[0]) {
            const f = input.files[0];
            const area = document.getElementById('upload-area');
            const preview = document.getElementById('receipt-preview');

            area.classList.add('has-file');
            document.getElementById('up-icon').className = 'fa-solid fa-file-circle-check';
            document.getElementById('up-icon').style.color = 'var(--primary)';
            document.getElementById('up-title').innerText = f.name.substring(0, 15) + '...';
            document.getElementById('up-desc').innerText = 'Fayl tayyor! To\'lovni tasdiqlashingiz mumkin.';

            const reader = new FileReader();
            reader.onload = function (e) {
                preview.src = e.target.result;
                preview.style.display = 'block';
                receiptImageData = String(e.target.result || '');
            }
            reader.readAsDataURL(f);

            const subBtn = document.getElementById('btn-submit-order');
            subBtn.disabled = false;
            subBtn.style.display = 'inline-flex';
            subBtn.style.justifyContent = 'center';
            subBtn.style.alignItems = 'center';
            subBtn.style.gap = '6px';
            subBtn.style.opacity = '1';
            showToast('Chek yuklandi. Tasdiqlash tugmasini bosing.');
            haptic('selection');
        }
    };

    // Step 3: Real order submission
    window.submitOrder = async () => {
        if (!receiptImageData) {
            showToast('Avval chekni yuklang');
            return;
        }

        setStep(3);
        const loader = document.getElementById('sys-loader');
        const success = document.getElementById('sys-success');

        loader.style.display = 'flex';
        success.style.display = 'none';
        try {
            const tgUser = resolveTelegramUser();
            if (!tgUser?.id) {
                throw new Error('Telegram user topilmadi. Mini appni bot tugmasidan qayta oching');
            }
            const category = currType === 'dia' ? 'diamonds' : currType === 'uc' ? 'uc' : currType === 'gold' ? 'gold' : currType === 'tg' ? 'telegram' : 'accounts';
            const productId = currItem?.id || `web-${Date.now()}`;
            const productTitle = currItem?.title || 'Unknown';
            const amount = Number(currItem?.price || 0);

            if (!productId || !productTitle || !amount) {
                throw new Error('Buyurtma ma\'lumotlari to\'liq emas. Sahifani qayta oching');
            }

            const resp = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: String(tgUser.id),
                    userFirstName: tgUser.first_name || null,
                    userLastName: tgUser.last_name || null,
                    userUsername: tgUser.username || null,
                    productId,
                    productTitle,
                    amount,
                    gameUid: confirmedUID,
                    playerNickname: confirmedNickname || null,
                    category,
                    paymentCard: PAYMENT_CARD_NUMBER,
                    receiptImage: receiptImageData
                })
            });
            const payload = await resp.json().catch(() => ({}));
            if (!resp.ok || payload.ok === false) {
                throw new Error(payload.message || 'Buyurtma yuborilmadi');
            }
            loader.style.display = 'none';
            success.style.display = 'block';
            document.getElementById('order-id-display').innerText = '#' + (payload?.data?.id || 'ORD-UNKNOWN');
            loadMyOrders();
            haptic('success');
        } catch (err) {
            loader.style.display = 'none';
            showToast(err.message || 'Xatolik yuz berdi');
            setStep(2);
        }
    };


    // --- Render logic --- 
    const renderDias = (data, container) => {
        const cont = document.getElementById(container);
        if (!cont) return;
        cont.innerHTML = '';
        if (!catalogHydrated) {
            cont.innerHTML = `<div style="grid-column:1/-1; padding:24px 16px; text-align:center; color:var(--text-muted); font-size:0.8rem; font-weight:700;">Mahsulotlar yuklanmoqda...</div>`;
            return;
        }
        if (catalogLoadFailed && (!Array.isArray(data) || data.length === 0)) {
            cont.innerHTML = `<div style="grid-column:1/-1; padding:24px 16px; text-align:center; color:var(--text-muted); font-size:0.8rem; font-weight:700;">Mahsulotlarni yuklab bo'lmadi.</div>`;
            return;
        }
        if (!Array.isArray(data) || data.length === 0) {
            cont.innerHTML = `<div style="grid-column:1/-1; padding:24px 16px; text-align:center; color:var(--text-muted); font-size:0.8rem; font-weight:700;">Hozircha mahsulot yo'q.</div>`;
            return;
        }
        const isUC = container === 'all-uc';
        const isFF = container === 'all-diamonds';
        data.forEach(item => {
            const d = document.createElement('div');
            d.className = 'glass-panel dia-card ripple';
            d.style.padding = '12px 10px';
            d.innerHTML = `
                <button class="product-info-btn" type="button" aria-label="Mahsulot haqida">
                    <i class="fa-solid fa-circle-info"></i>
                </button>
                <img src="${item.icon}" class="dia-img" alt="diamond" style="width:${isUC ? '100px' : (isFF ? '85px' : '42px')}; height:${isUC ? '100px' : (isFF ? '85px' : '42px')}; object-fit:contain; margin-bottom:${(isUC || isFF) ? '12px' : '10px'};">
                <div class="dia-title" style="font-size:0.75rem; font-weight:800; margin-bottom:4px; display:${(isUC || isFF) ? 'none' : 'block'};">${item.title}</div>
                <div class="dia-bonus" style="font-size:0.6rem; color:var(--primary); font-weight:900; margin-bottom:4px; display:${(isUC || isFF) ? 'none' : 'block'};">${item.bonus !== '0' ? '+' + item.bonus : ''}</div>
                <div class="dia-price" style="font-size:0.85rem; font-weight:900; color:#fff;">${item.price.toLocaleString()} UZS</div>
            `;
            d.onclick = () => openSheet(item, 'dia');
            bindProductInfoButton(d.querySelector('.product-info-btn'), item);
            cont.appendChild(d);
        });
    };

    // Account Detail Modal Control
    const accModal = document.getElementById('acc-modal-drawer');
    const accImageZoomModal = document.getElementById('acc-image-zoom-modal');
    const accImageZoom = document.getElementById('acc-image-zoom');
    window.openAccImageZoom = (src) => {
        const s = String(src || '').trim();
        if (!s || !accImageZoomModal || !accImageZoom) return;
        accImageZoom.src = s;
        accImageZoomModal.classList.add('active');
    };
    window.closeAccImageZoom = () => {
        if (!accImageZoomModal) return;
        accImageZoomModal.classList.remove('active');
    };
    window.openAccModal = (item) => {
        haptic();

        document.getElementById('modal-acc-title').innerText = item.title;
        document.getElementById('modal-acc-price').innerText = item.price.toLocaleString() + ' UZS';

        const clothesEl = document.getElementById('modal-acc-clothes');
        const lvlEl = document.getElementById('modal-acc-level');
        const platformEl = document.getElementById('modal-acc-platform');
        if (clothesEl) clothesEl.innerText = (item.stats?.clothes ?? 0) + ' ta';
        if (lvlEl) lvlEl.innerText = `${item.level} Level`;
        if (platformEl) platformEl.innerText = `Ulangan: ${item.meta?.platform || item.platform || "Noma'lum"}`;

        // Update account image (single centered fit, no horizontal scroll)
        const carousel = document.querySelector('.acc-carousel');
        const rawImages = Array.isArray(item.images) ? item.images.map((x) => String(x || '').trim()).filter(Boolean) : [];
        const fallbackImage = 'assets/banner/accaunt.jpeg';
        const mainImage = rawImages[0] || fallbackImage;
        const overviewImages = rawImages.slice(1, 6);
        if (carousel) {
            carousel.innerHTML = `
                <img src="${mainImage}" alt="acc"
                    style="width:100%;height:100%;object-fit:contain;object-position:center;cursor:zoom-in;"
                    onclick="window.openAccImageZoom(this.src)">
            `;
        }
        const overviewWrap = document.getElementById('modal-acc-overview-wrap');
        const overviewGrid = document.getElementById('modal-acc-overview-grid');
        if (overviewWrap && overviewGrid) {
            if (overviewImages.length) {
                overviewWrap.style.display = '';
                overviewGrid.innerHTML = overviewImages.map((src, idx) => `
                    <div style="aspect-ratio:1/1;border:1px solid rgba(0,229,255,.25);border-radius:10px;overflow:hidden;background:rgba(255,255,255,.02);cursor:zoom-in;position:relative"
                        onclick='window.openAccImageZoom(${JSON.stringify(src)})'>
                        <img src="${src}" alt="obzor-${idx + 1}" style="width:100%;height:100%;object-fit:cover;">
                    </div>
                `).join('');
            } else {
                overviewWrap.style.display = 'none';
                overviewGrid.innerHTML = '';
            }
        }

        // Setup Buy Button inside Modal
        const buyBtn = document.querySelector('#acc-modal-drawer .btn-prime');
        buyBtn.onclick = () => {
            closeAccModal();
            openSheet(item, 'acc');
        };

        accModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    window.closeAccModal = () => {
        accModal.classList.remove('active');
        window.closeAccImageZoom();
        document.body.style.overflow = '';
    };

    // Account Filtering Logic
    window.accFilters = { cat: 'all', price: 'all' };

    window.applyAccFilter = (type, value) => {
        haptic();
        window.accFilters[type] = value;

        // Update UI active states for chips
        const containerId = type === 'cat' ? 'cat-filters' : 'price-filters';
        const chips = document.getElementById(containerId).querySelectorAll('.filter-chip');
        chips.forEach(chip => {
            const onclick = chip.getAttribute('onclick');
            if (onclick && onclick.includes(`'${value}'`)) chip.classList.add('active');
            else chip.classList.remove('active');
        });

        // Re-render
        renderAccs(STORE_DATA.accounts, 'all-accounts');
    };

    const renderAccs = (data, container) => {
        const cont = document.getElementById(container);
        if (!cont) return;
        if (!accountsHydrated) {
            cont.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.78rem; font-weight:700;">Akkauntlar yuklanmoqda...</div>`;
            return;
        }
        if (catalogLoadFailed && (!Array.isArray(data) || data.length === 0)) {
            cont.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.78rem; font-weight:700;">Akkauntlarni yuklab bo'lmadi.</div>`;
            return;
        }

        let filtered = [...data];

        // Apply Category Filter
        if (window.accFilters.cat !== 'all') {
            filtered = filtered.filter(a => a.badge === window.accFilters.cat || (window.accFilters.cat === 'YANGI' && a.badge === 'NEW'));
        }

        // Apply Price Filter
        if (window.accFilters.price !== 'all') {
            if (window.accFilters.price === 'cheap') filtered = filtered.filter(a => a.price < 100000);
            else if (window.accFilters.price === 'mid') filtered = filtered.filter(a => a.price >= 100000 && a.price <= 300000);
            else if (window.accFilters.price === 'high') filtered = filtered.filter(a => a.price > 300000);
        }

        cont.innerHTML = '';
        if (filtered.length === 0) {
            cont.innerHTML = `<div style="padding:40px 20px; text-align:center; color:var(--text-muted); font-size:0.8rem; font-weight:700;">Bu filtrga mos akkauntlar topilmadi.</div>`;
            return;
        }

        filtered.forEach(item => {
            const d = document.createElement('div');
            d.className = 'glass-panel acc-card ripple';
            d.style.cssText = 'padding:10px; display:flex; gap:12px; align-items:center; margin-bottom:10px;';
            d.innerHTML = `
                <div style="width:80px; height:80px; border-radius:12px; overflow:hidden; flex:none;">
                    <img src="${item.images[0]}" alt="acc" style="width:100%; height:100%; object-fit:cover;">
                </div>
                <div class="acc-body" style="flex:1; min-width:0; text-align:left;">
                    <div style="font-weight:800; font-size:0.85rem; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.title}</div>
                    <div style="color:var(--primary); font-weight:900; font-size:0.85rem; margin-bottom:6px;">${(item.price / 1000).toFixed(0)}k UZS</div>
                    <div class="acc-meta" style="display:flex; gap:10px; font-size:0.65rem; color:var(--text-muted); font-weight:700;">
                        <span><i class="fa-solid fa-star" style="color:#FFD700; margin-right:3px;"></i>${item.level}</span>
                        <span><i class="fa-solid fa-shirt" style="margin-right:3px;"></i>${item.stats?.clothes ?? 0}</span>
                    </div>
                </div>
                <button class="btn-sec" style="padding:0; width:64px; height:26px; font-size:0.6rem; border-radius:6px; flex:none;" onclick="event.stopPropagation(); window.openAccModal(${JSON.stringify(item).replace(/"/g, '&quot;')})">BATAFSIL</button>
            `;
            d.onclick = () => window.openAccModal(item);
            cont.appendChild(d);
        });
    };

    window.openTopOrder = (item, type) => {
        if (item) openSheet(item, type);
    };
    window.openDynamicCategory = (key) => {
        currentDynamicKey = String(key || '');
        const items = DYNAMIC_CATEGORIES[currentDynamicKey] || [];
        const titleEl = document.getElementById('dynamic-cat-title');
        const subtitleEl = document.getElementById('dynamic-cat-subtitle');
        if (titleEl) titleEl.textContent = titleCase(currentDynamicKey);
        if (subtitleEl) subtitleEl.textContent = !catalogHydrated
            ? 'Mahsulotlar yuklanmoqda...'
            : `${items.length} ta paket mavjud.`;
        renderDias(items, 'all-dynamic');
        navTo('sub-dynamic');
    };

    const SETTINGS_FIELDS = [
        ['General / Обзор', 'general'],
        ['Red Dot / Коллиматор', 'redDot'],
        ['2X', 'x2'],
        ['4X', 'x4'],
        ['AWM', 'awm'],
        ['Free Look', 'freeLook'],
        ['DPI', 'dpi']
    ];
    const resolveSettingsImageSrc = (raw) => {
        const v = String(raw || '').trim();
        if (!v) return 'assets/img/logo.JPG';
        if (v.startsWith('//')) return `https:${v}`;
        if (/^http:\/\//i.test(v)) return v.replace(/^http:\/\//i, 'https://');
        return v;
    };

    const renderSettingsPage = () => {
        const brandWrap = document.getElementById('settings-model-list');
        const modelWrap = document.getElementById('settings-brand-model-list');
        const emptyEl = document.getElementById('settings-model-empty');
        const cardEl = document.getElementById('settings-model-card');
        const imageEl = document.getElementById('settings-model-image');
        const titleEl = document.getElementById('settings-model-title');
        const tipEl = document.getElementById('settings-model-tip');
        const itemsEl = document.getElementById('settings-model-items');
        if (!brandWrap || !modelWrap || !emptyEl || !cardEl || !imageEl || !titleEl || !itemsEl) return;

        const models = Array.isArray(DEVICE_SETTINGS) ? DEVICE_SETTINGS : [];
        if (!models.length) {
            brandWrap.innerHTML = `<div class="filter-chip active">Brand yo'q</div>`;
            modelWrap.innerHTML = `<div class="filter-chip">Model yo'q</div>`;
            emptyEl.style.display = '';
            cardEl.style.display = 'none';
            selectedSettingsModelKey = null;
            selectedSettingsBrandKey = null;
            return;
        }

        const brands = [...new Set(models.map((x) => String(x.brand || '').trim()).filter(Boolean))];
        if (!selectedSettingsBrandKey || !brands.includes(selectedSettingsBrandKey)) {
            selectedSettingsBrandKey = brands[0];
        }

        brandWrap.innerHTML = brands.map((brand) => `
            <div class="filter-chip ${selectedSettingsBrandKey === brand ? 'active' : ''}" onclick="openSettingsBrand('${brand.replace(/'/g, "\\'")}')">${escapeHtml(brand)}</div>
        `).join('');

        const brandModels = models.filter((x) => String(x.brand || '').trim() === selectedSettingsBrandKey);
        const modelIds = brandModels.map((x) => String(x.id));
        const prevModelKey = selectedSettingsModelKey;
        if (!selectedSettingsModelKey || !modelIds.includes(selectedSettingsModelKey)) {
            selectedSettingsModelKey = modelIds[0] || null;
        }
        if (String(prevModelKey || '') !== String(selectedSettingsModelKey || '')) {
            settingsDetailsExpanded = false;
        }

        if (!brandModels.length || !selectedSettingsModelKey) {
            modelWrap.innerHTML = `<div class="filter-chip active">Model yo'q</div>`;
            emptyEl.style.display = '';
            cardEl.style.display = 'none';
            return;
        }

        modelWrap.innerHTML = ``;

        const selected = brandModels.find((x) => String(x.id) === String(selectedSettingsModelKey)) || brandModels[0];
        const imageSrc = resolveSettingsImageSrc(selected?.imagePhone);
        imageEl.onerror = () => { imageEl.src = 'assets/img/logo.JPG'; };
        imageEl.src = imageSrc;
        titleEl.textContent = `${selected?.brand || 'Brand'} ${selected?.model || ''}`.trim();
        itemsEl.innerHTML = SETTINGS_FIELDS.map(([label, key]) => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 10px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02);">
                <span style="font-size:0.74rem; color:var(--text-muted); font-weight:700;">${escapeHtml(label)}</span>
                <span style="font-size:0.82rem; color:#fff; font-weight:900;">${escapeHtml(String(Number(selected?.[key] || 0)))}</span>
            </div>
        `).join('');
        itemsEl.style.display = settingsDetailsExpanded ? 'flex' : 'none';
        cardEl.style.cursor = 'pointer';
        cardEl.onclick = () => {
            settingsDetailsExpanded = !settingsDetailsExpanded;
            itemsEl.style.display = settingsDetailsExpanded ? 'flex' : 'none';
            if (tipEl) tipEl.textContent = settingsDetailsExpanded ? 'Yopish uchun bosing' : 'Telefonni bosing';
        };
        if (tipEl) tipEl.textContent = settingsDetailsExpanded ? 'Yopish uchun bosing' : 'Telefonni bosing';
        emptyEl.style.display = 'none';
        cardEl.style.display = '';
    };

    window.openSettingsModel = (key) => {
        selectedSettingsModelKey = String(key || '');
        renderSettingsPage();
    };
    window.openSettingsBrand = (brand) => {
        selectedSettingsBrandKey = String(brand || '');
        selectedSettingsModelKey = null;
        settingsDetailsExpanded = false;
        renderSettingsPage();
    };

    const renderCategoryEntrypoints = () => {
        const quickWrap = document.querySelector('.quick-services-wrap');
        const mainWrap = document.getElementById('main-services');
        if (!quickWrap || !mainWrap) return;

        const knownKeys = ['diamonds', 'uc', 'gold', 'tg'];
        const visibleKnownKeys = knownKeys.filter((key) => Array.isArray(STORE_DATA[key]) && STORE_DATA[key].length > 0);
        const dynamicKeys = Object.keys(DYNAMIC_CATEGORIES || {}).filter((key) => Array.isArray(DYNAMIC_CATEGORIES[key]) && DYNAMIC_CATEGORIES[key].length > 0);
        const allKeys = [...visibleKnownKeys, ...dynamicKeys];

        quickWrap.innerHTML = allKeys.map((key) => {
            const customMeta = CATEGORY_META[key] || {};
            const meta = KNOWN_CATEGORY_META[key] || {
                title: customMeta.title || titleCase(key),
                badge: customMeta.badge || 'Xizmatlar',
                target: `openDynamicCategory('${key}')`,
                icon: customMeta.icon || (DYNAMIC_CATEGORIES[key]?.[0]?.icon || 'assets/img/logo.JPG')
            };
            const clickExpr = KNOWN_CATEGORY_META[key] ? `navTo('${meta.target}')` : meta.target;
            return `
                <div class="qs-item ripple" onclick="${clickExpr}"
                    style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 12px 5px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
                    <div style="width: 44px; height: 44px; background: rgba(0, 229, 255, 0.1); border-radius: 12px; display: flex; justify-content: center; align-items: center; border: 1px solid rgba(0, 229, 255, 0.2);">
                        <img src="${meta.icon}" alt="${meta.title}"
                            style="width: 28px; height: 28px; object-fit: contain; filter: drop-shadow(0 0 5px rgba(0,229,255,0.4));">
                    </div>
                    <span style="font-size: 0.65rem; font-weight: 800; color: #fff;">${meta.title}</span>
                </div>
            `;
        }).join('');

        const staticCards = Array.from(mainWrap.querySelectorAll('.service-card-lux'));
        staticCards.forEach((el) => {
            const onclick = el.getAttribute('onclick') || '';
            const staticMap = {
                'sub-dia': 'diamonds',
                'sub-uc': 'uc',
                'sub-gold': 'gold',
                'sub-tg': 'tg'
            };
            const staticKey = Object.keys(staticMap).find((routeKey) => onclick.includes(routeKey));
            if (staticKey) {
                const key = staticMap[staticKey];
                const visible = visibleKnownKeys.includes(key);
                el.style.display = visible ? '' : 'none';
                if (visible) {
                    const meta = KNOWN_CATEGORY_META[key] || CATEGORY_META[key];
                    const img = el.querySelector('img');
                    const title = el.querySelector('.lux-srv-title');
                    const badge = el.querySelector('.lux-srv-badge');
                    if (img && meta?.icon) img.src = meta.icon;
                    if (title && meta?.title) title.textContent = meta.title;
                    if (badge && meta?.badge) badge.textContent = meta.badge;
                }
                return;
            }
            el.remove();
        });

        const prevDynamicCards = Array.from(mainWrap.querySelectorAll('[data-dynamic-card]'));
        prevDynamicCards.forEach((el) => {
            const key = String(el.getAttribute('data-dynamic-card') || '');
            if (!dynamicKeys.includes(key)) el.remove();
        });

        dynamicKeys.forEach((key) => {
            const existing = mainWrap.querySelector(`[data-dynamic-card="${key}"]`);
            if (existing) {
                existing.style.display = '';
                return;
            }
            const dynamicMeta = CATEGORY_META[key] || {};
            const icon = dynamicMeta.icon || DYNAMIC_CATEGORIES[key]?.[0]?.icon || 'assets/img/logo.JPG';
            const card = document.createElement('div');
            card.className = 'service-card-lux ripple';
            card.setAttribute('data-dynamic-card', key);
            card.setAttribute('onclick', `openDynamicCategory('${key}')`);
            card.innerHTML = `
                <div class="lux-icon-wrap">
                    <div class="lux-glow"></div>
                    <img src="${icon}" alt="${titleCase(key)}">
                </div>
                <div class="lux-srv-title">${dynamicMeta.title || titleCase(key)}</div>
                <div class="lux-srv-badge">${dynamicMeta.badge || 'Yangi kategoriya'}</div>
            `;
            mainWrap.appendChild(card);
        });
    };

    const renderHomeNews = (items = []) => {
        const box = document.getElementById('home-news-list');
        if (!box) return;
        const rows = Array.isArray(items) ? items : [];
        if (!rows.length) {
            box.innerHTML = `<div class="glass-panel" style="padding:12px; color:var(--text-muted); font-size:0.78rem; font-weight:700;">Hozircha yangilik yo'q.</div>`;
            return;
        }
        box.innerHTML = rows.map((item) => `
            <div class="glass-panel ripple" style="padding:12px; display:flex; align-items:flex-start; gap:10px;">
                <div style="width:30px; height:30px; border-radius:9px; flex:none; background:rgba(0,229,255,0.1); color:var(--primary); display:flex; align-items:center; justify-content:center; border:1px solid rgba(0,229,255,0.25);">
                    <i class="fa-solid fa-bullhorn" style="font-size:0.85rem;"></i>
                </div>
                <div style="min-width:0; flex:1;">
                    <div style="font-size:0.85rem; color:#fff; font-weight:900; line-height:1.35;">${escapeHtml(item.title || 'Yangilik')}</div>
                    <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; margin-top:4px;">${escapeHtml(item.time || 'Hozirgina')}</div>
                </div>
            </div>
        `).join('');
    };
    const renderHomeHot = () => {
        const wrap = document.getElementById('home-hot-wrap');
        const listEl = document.getElementById('home-hot-list');
        if (!wrap || !listEl) return;
        const hotItems = [];
        const categories = [
            { key: 'diamonds', type: 'dia' },
            { key: 'uc', type: 'uc' },
            { key: 'gold', type: 'gold' },
            { key: 'tg', type: 'tg' }
        ];
        categories.forEach(({ key, type }) => {
            (STORE_DATA[key] || []).forEach((item) => {
                if (item?.hot === true) hotItems.push({ ...item, __type: type });
            });
        });
        if (!hotItems.length) {
            wrap.style.display = 'none';
            listEl.innerHTML = '';
            return;
        }
        wrap.style.display = '';
        listEl.innerHTML = hotItems.slice(0, 12).map((item, index) => `
            <div class="dia-card ripple" data-hot-index="${index}" onclick='window.openTopOrder(${JSON.stringify(item).replace(/"/g, '&quot;')}, "${item.__type}")' style="min-width: 140px;">
                <div style="position: absolute; top: 0; right: 0; background: #FF4757; color: #fff; font-size: 0.6rem; font-weight: 900; padding: 3px 10px; border-radius: 0 16px 0 10px; box-shadow: 0 2px 5px rgba(255,71,87,0.4); z-index: 10;">HOT</div>
                <button class="product-info-btn" type="button" aria-label="Mahsulot haqida" style="right:12px; top:34px;">
                    <i class="fa-solid fa-circle-info"></i>
                </button>
                <img src="${escapeHtml(item.icon || 'assets/img/logo.JPG')}" class="dia-img" style="width: 60px; height: 60px; object-fit: contain; margin-bottom: 12px; margin-top: 5px;">
                <div class="dia-title" style="font-size: 0.82rem; font-weight: 800;">${escapeHtml(item.title || 'Mahsulot')}</div>
                <div class="dia-price" style="font-size: 0.88rem;">${Number(item.price || 0).toLocaleString()} UZS</div>
            </div>
        `).join('');
        hotItems.slice(0, 12).forEach((item, index) => {
            const card = listEl.querySelector(`[data-hot-index="${index}"]`);
            bindProductInfoButton(card?.querySelector('.product-info-btn'), item);
        });
    };
    const loadHomeNews = async () => {
        try {
            const resp = await fetch('/api/news', { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const payload = await resp.json().catch(() => ({}));
            const rows = Array.isArray(payload?.data) ? payload.data : [];
            renderHomeNews(rows);
        } catch (err) {
            console.warn('News API xatosi:', err);
            renderHomeNews([]);
        }
    };

    const rerenderStore = () => {
        renderDias(STORE_DATA.diamonds || [], 'all-diamonds');
        renderDias(STORE_DATA.uc || [], 'all-uc');
        renderDias(STORE_DATA.gold || [], 'all-gold');
        renderDias(STORE_DATA.tg || [], 'all-tg');
        renderAccs(STORE_DATA.accounts || [], 'all-accounts');
        renderCategoryEntrypoints();
        renderHomeHot();
        renderSettingsPage();
    };

    const loadDeviceSettingsFromBackend = async () => {
        try {
            const resp = await fetch('/api/device-settings', { cache: 'no-store' });
            if (!resp.ok) return;
            const payload = await resp.json().catch(() => ({}));
            const rows = Array.isArray(payload?.data) ? payload.data : [];
            DEVICE_SETTINGS = rows;
            renderSettingsPage();
        } catch (err) {
            console.warn('Device settings API xatosi:', err);
        }
    };

    const loadHeroBannersFromBackend = async () => {
        const sliderEl = document.getElementById('hero-slider');
        const dotsEl = document.getElementById('hero-dots');
        if (!sliderEl || !dotsEl) return;
        try {
            const resp = await fetch('/api/hero-banners', { cache: 'no-store' });
            if (!resp.ok) return;
            const payload = await resp.json().catch(() => ({}));
            const rows = Array.isArray(payload?.data) ? payload.data : [];
            if (!rows.length) return;

            sliderEl.innerHTML = rows.map((row) => {
                const title = escapeHtml(String(row?.title || 'Banner'));
                const image = escapeHtml(String(row?.image || 'assets/img/logo.JPG'));
                const target = escapeHtml(String(row?.actionTarget || 'page-home'));
                const btnText = escapeHtml(String(row?.buttonText || 'Xarid qilish'));
                const btnIcon = escapeHtml(String(row?.buttonIcon || 'fa-solid fa-bolt'));
                const btnBg = String(row?.buttonBg || '').trim();
                const btnStyle = btnBg ? `background:${escapeHtml(btnBg)}; color:#000;` : '';
                return `
                    <div class="hero-slide"
                        style="min-width: 100%; height: 100%; position:relative; padding: 30px 20px; display: flex; flex-direction: column; justify-content: flex-end;">
                        <div style="position:absolute; inset:0; background: linear-gradient(to top, rgba(6,7,19,0.9) 0%, transparent 60%), url('${image}') center top/cover; z-index: -1;"></div>
                        <h1 class="title-xl" style="font-size: 1.3rem; margin-bottom: 10px;">${title}</h1>
                        <button class="btn-prime hero-slide-action" data-target="${target}" style="width:fit-content; border-radius:30px; padding:8px 20px; font-size: 0.8rem; ${btnStyle}">
                            <i class="${btnIcon}"></i> ${btnText}
                        </button>
                    </div>
                `;
            }).join('');

            dotsEl.innerHTML = rows.map((_, i) => `
                <div class="dot ${i === 0 ? 'active' : ''}" style="width:${i === 0 ? 24 : 8}px; height:8px; border-radius:4px; background:${i === 0 ? 'var(--primary)' : 'rgba(255,255,255,0.3)'};"></div>
            `).join('');
            currSlide = 0;
            sliderEl.style.transform = 'translateX(0%)';

            sliderEl.querySelectorAll('.hero-slide-action').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const target = String(btn.getAttribute('data-target') || 'page-home');
                    if (typeof window.navTo === 'function') window.navTo(target);
                });
            });
            startHeroAutoSlide();
        } catch (err) {
            console.warn('Hero banners API xatosi:', err);
        }
    };

    const loadCatalogFromBackend = async () => {
        try {
            const resp = await fetch('/api/catalog', { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const payload = await resp.json().catch(() => ({}));
            const data = payload?.data || {};
            applyCategoryMeta(data.categoryMeta || {});
            const mergeCatalog = (key, sourceObj, prop, enrichKey = key) => {
                if (!Object.prototype.hasOwnProperty.call(sourceObj, prop)) return;
                const next = Array.isArray(sourceObj[prop]) ? sourceObj[prop] : [];
                STORE_DATA[key] = enrichCatalogItems(next, enrichKey);
            };
            mergeCatalog('diamonds', data, 'diamonds', 'diamonds');
            mergeCatalog('uc', data, 'uc', 'uc');
            mergeCatalog('gold', data, 'gold', 'gold');
            if (Object.prototype.hasOwnProperty.call(data, 'tg')) {
                mergeCatalog('tg', data, 'tg', 'tg');
            } else if (Object.prototype.hasOwnProperty.call(data, 'telegram')) {
                mergeCatalog('tg', data, 'telegram', 'tg');
            }
            STORE_DATA.accounts = enrichAccounts(data.accounts || []);
            accountsHydrated = true;
            const reserved = new Set(['diamonds', 'uc', 'gold', 'tg', 'telegram', 'accounts', 'categoryMeta']);
            DYNAMIC_CATEGORIES = {};
            Object.entries(data).forEach(([key, value]) => {
                if (reserved.has(key)) return;
                if (!Array.isArray(value) || value.length === 0) return;
                DYNAMIC_CATEGORIES[key] = enrichCatalogItems(value, key);
            });
            catalogHydrated = true;
            catalogLoadFailed = false;
            rerenderStore();
        } catch (err) {
            console.warn('Catalog API xatosi:', err);
            catalogHydrated = true;
            catalogLoadFailed = true;
            accountsHydrated = true;
            DYNAMIC_CATEGORIES = {};
            STORE_DATA.diamonds = [];
            STORE_DATA.uc = [];
            STORE_DATA.gold = [];
            STORE_DATA.tg = [];
            STORE_DATA.accounts = [];
            rerenderStore();
        }
    };

    // Mount Arrays
    rerenderStore();
    loadCatalogFromBackend();
    loadDeviceSettingsFromBackend();
    loadHeroBannersFromBackend();
    loadHomeNews();


    // Hero Auto Slider Logic
    const slider = document.getElementById('hero-slider');
    const dotsContainer = document.getElementById('hero-dots');
    const dots = () => (dotsContainer ? dotsContainer.children : []);
    let currSlide = 0;
    const totalSlides = () => {
        const count = slider?.children?.length || 0;
        return count > 0 ? count : 1;
    };

    const moveSlide = () => {
        currSlide = (currSlide + 1) % totalSlides();
        if (slider) {
            slider.style.transform = `translateX(-${currSlide * 100}%)`;
            // Update dots
            const liveDots = dots();
            for (let i = 0; i < liveDots.length; i++) {
                if (i === currSlide) {
                    liveDots[i].classList.add('active');
                    liveDots[i].style.width = '24px';
                    liveDots[i].style.height = '8px';
                    liveDots[i].style.borderRadius = '4px';
                    liveDots[i].style.background = 'var(--primary)';
                } else {
                    liveDots[i].classList.remove('active');
                    liveDots[i].style.width = '8px';
                    liveDots[i].style.height = '8px';
                    liveDots[i].style.borderRadius = '50%';
                    liveDots[i].style.background = 'rgba(255,255,255,0.3)';
                }
            }
        }
    };
    const startHeroAutoSlide = () => {
        if (heroSliderTimer) {
            clearInterval(heroSliderTimer);
            heroSliderTimer = null;
        }
        if (!slider || totalSlides() <= 1) return;
        heroSliderTimer = setInterval(moveSlide, 3000);
    };
    startHeroAutoSlide();

    // Support Chat Q&A Logic
    const HELP_ANSWERS = {
        time: "Barcha xaridlar tizimimiz orqali avtomatik tekshiriladi va odatda **1-15 daqiqa** ichida hisobingizga tushadi. Agar yuklama ko'p bo'lsa, 30 daqiqagacha cho'zilishi mumkin.",
        not_received: "Agar 30 daqiqadan ko'p vaqt o'tgan bo'lsa va almazlar kelmagan bo'lsa, iltimos, to'lov chekini va o'yin ID-ingizni adminimizga yuboring. Biz darhol tekshirib beramiz.",
        safety: "Biz faqat rasmiy hamkorlar orqali ishlaymiz. Har bir akkaunt va xizmat uchun **100% kafolat** beramiz. UID orqali to'ldirish butunlay xavfsiz va bloklanish xavfi yo'q.",
        dasturchi: "Agar sizga yordam kerak bo'lsa, iltimos, adminimizga murojaat qiling: @aruzff"
    };

    window.showHelpAnswer = (key) => {
        haptic();
        const box = document.getElementById('help-ans-box');
        const text = document.getElementById('help-ans-text');

        if (box && text && HELP_ANSWERS[key]) {
            box.classList.remove('show');
            void box.offsetWidth; // trigger reflow
            text.innerHTML = HELP_ANSWERS[key];
            box.classList.add('show');

            // Auto-scroll to answer
            setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
    };

    // Real Chat Logic
    const chatCont = document.getElementById('chat-messages');
    let chatInitiated = false;

    window.addChatBubble = (text, type = 'agent') => {
        if (!chatCont) return;
        const b = document.createElement('div');
        b.className = `bubble ${type}`;
        b.innerHTML = text;
        const kb = document.getElementById('chat-keyboard');
        if (kb) chatCont.insertBefore(b, kb);
        else chatCont.appendChild(b);
        chatCont.scrollTop = chatCont.scrollHeight;
    };

    window.handleChatReply = (key) => {
        const questions = {
            time: "Qancha vaqtda tushadi?",
            not_received: "Almaz kelmadi?",
            safety: "Xavfsizmi?",
            dasturchi: "texnik yordam kerak?"
        };

        if (!questions[key]) return;

        haptic();
        addChatBubble(questions[key], 'user');

        // Show Typing
        const typing = document.createElement('div');
        typing.className = 'typing';
        typing.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        const kb = document.getElementById('chat-keyboard');
        if (kb) chatCont.insertBefore(typing, kb);
        else chatCont.appendChild(typing);
        chatCont.scrollTop = chatCont.scrollHeight;

        setTimeout(() => {
            typing.remove();
            addChatBubble(HELP_ANSWERS[key], 'agent');
            haptic('success');
        }, 1500);
    };

    window.initSupportChat = () => {
        if (chatInitiated || !chatCont) return;
        chatInitiated = true;

        // Clear only bubbles, keep keyboard
        const bubbles = chatCont.querySelectorAll('.bubble, .typing');
        bubbles.forEach(b => b.remove());

        setTimeout(() => {
            addChatBubble("Assalomu alaykum! Men sizga qanday yordam bera olaman? 😊", 'agent');
        }, 500);
    };

});
