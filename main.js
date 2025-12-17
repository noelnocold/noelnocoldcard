// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================
const DOM = {
    container: document.getElementById('card-container'),
    inner: document.getElementById('card-inner'),
    frontContent: document.getElementById('card-front-content'),
    controls: document.getElementById('controls'),
    modal: document.getElementById('pre-reminder'),
    startBtn: document.getElementById('start-btn')
};

const STATE = {
    isDragging: false,
    startX: 0,
    startY: 0,
    currentRotationY: 0,
    currentTiltX: 0,
    initialRotationY: 0,
    hasSpokenWelcome: false
};

const CONFIG = {
    // Animation Delays
    INITIAL_DELAY_MS: 2000,
    HEIGHT_EXPAND_MS: 2000, // Thời điểm bắt đầu mở cao
    WIDTH_EXPAND_MS: 2800,  // Thời điểm bắt đầu mở rộng + xoay (sau khi mở cao 1 chút)

    // Physics
    ROTATION_SENSITIVITY: 180 / 160, // 300px = 180 độ
    MAX_TILT: 10,
    TILT_SENSITIVITY: 0.1,
    BARCODE_VALUE: "1256",
    SPEECH_MESSAGE: 'HI people, xoay the card'
};

// Speech voice cache
const SPEECH = { voice: null };

// ==========================================
// 2. INITIALIZATION & ANIMATION
// ==========================================

// Read `stt` from the URL query string, fetch `data.csv` and apply matching Ten/Code.
// Falls back to legacy `name`/`code` query params if CSV unavailable or no match.
async function loadUrlData() {
    const params = new URLSearchParams(window.location.search);
    const sttParam = params.get('stt') || params.get('id');

    const sanitize = (s, max = 200) => {
        if (!s) return '';
        try { s = decodeURIComponent(s); } catch (e) { /* ignore */ }
        s = s.replace(/\+/g, ' ').trim();
        return s.slice(0, max);
    };

    // Helper to apply name/code to UI
    const apply = (name, code, message) => {
        if (name) {
            const el = document.getElementById('card-name');
            if (el) el.textContent = sanitize(name).toUpperCase();
        }
        if (code) {
            const cleaned = sanitize(code);
            CONFIG.BARCODE_VALUE = cleaned;
            const giftEl = document.getElementById('gift-code');
            if (giftEl) giftEl.textContent = cleaned || '***';
        }
        if (message) {
            const cleanedMsg = sanitize(message, 200);
            CONFIG.SPEECH_MESSAGE = cleanedMsg || CONFIG.SPEECH_MESSAGE;
            const sp = document.getElementById('speech-popup');
            if (sp) sp.textContent = CONFIG.SPEECH_MESSAGE;
        }
    };

    // Expect `stt` in URL; if missing, leave defaults and continue to attempt CSV fetch

    // Try fetch data.csv (relative path). This requires the file to be served alongside the page.
    try {
        const resp = await fetch('./DATA/data.csv');
        if (!resp.ok) throw new Error('Failed to fetch data.csv');
        const text = await resp.text();

        // Parse CSV (simple parser for format: STT,Ten,Code)
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length <= 1) throw new Error('No CSV rows');

        // header may be first line
        const header = lines[0].split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(h => h.trim().toLowerCase());
        const sttIdx = header.indexOf('stt');
        const tenIdx = header.indexOf('ten');
        const codeIdx = header.indexOf('code');
        const messIdx = header.indexOf('mess');

        // If header not detected, try fallback positions
        const useHeader = (sttIdx !== -1 && tenIdx !== -1 && codeIdx !== -1);
        let found = false;

        for (let i = useHeader ? 1 : 0; i < lines.length; i++) {
            const cols = lines[i].split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(c => c.trim());
            if (!cols || cols.length < 2) continue;

            let rowStt, rowTen, rowCode, rowMess;
            if (useHeader) {
                rowStt = cols[sttIdx];
                rowTen = cols[tenIdx];
                rowCode = cols[codeIdx];
                rowMess = (messIdx !== -1) ? cols[messIdx] : '';
            } else {
                // assume order STT,Ten,Code
                rowStt = cols[0];
                rowTen = cols[1];
                rowCode = cols[2] || '';
                rowMess = cols[3] || '';
            }

            if (!rowStt) continue;
            // compare numeric values when possible
            if (String(parseInt(rowStt, 10)) === String(parseInt(sttParam, 10))) {
                apply(rowTen, rowCode, rowMess);
                found = true;
                break;
            }
        }

        if (!found) {
            // Not found in CSV — keep defaults (no URL fallbacks when using stt-only URLs)
            apply('', '', '');
        }
    } catch (e) {
        // On any error, fallback to legacy params
        // On fetch / parse error, keep default UI values
        apply('', '', '');
    }
}

async function init() {
    await loadUrlData();
    generateBarcode();
    setupEventListeners();

    // Only start the card intro after user confirms
    if (DOM.startBtn) {
        DOM.startBtn.addEventListener('click', startExperience);
    }

    // Prepare English female voice if available
    if ('speechSynthesis' in window) {
        try {
            window.speechSynthesis.onvoiceschanged = pickEnglishFemaleVoice;
            // Try immediate pick as some browsers already have voices loaded
            pickEnglishFemaleVoice();
        } catch (e) { /* ignore */ }
    }
}

function startExperience() {
    // Hide reminder modal and start intro animation immediately
    if (DOM.modal) {
        DOM.modal.classList.add('hidden');
    }
    CONFIG.INITIAL_DELAY_MS = 0;
    runIntroAnimation();
}

// Tạo mã vạch bằng JsBarcode
function generateBarcode() {
    JsBarcode("#barcode", CONFIG.BARCODE_VALUE, {
        format: "CODE128",
        lineColor: "#ffffff",
        width: 2,
        height: 60, // Chiều cao của các thanh barcode
        displayValue: true,
        background: "transparent",
        fontSize: 14,
        margin: 0
    });
}

// Hiệu ứng Animation khi load trang
function runIntroAnimation() {
    // Bước 1: Đợi 2 giây như yêu cầu
    setTimeout(() => {
        // Bước 2: Hiện chiều cao (vẫn giữ width rất nhỏ)
        DOM.container.classList.add('intro-expand-height');

        // Bước 3: Sau khi chiều cao hiện, hiện chiều rộng và xoay
        setTimeout(() => {
            DOM.container.classList.add('intro-expand-width');

            // Thêm class animation xoay cho phần ruột
            DOM.inner.classList.add('intro-spin');

            // Hiện nút điều khiển
            DOM.controls.classList.remove('opacity-0');

            // Sau khi xoay xong, xóa class animation để trả lại quyền điều khiển cho chuột
            setTimeout(() => {
                DOM.inner.classList.remove('intro-spin');
                // Speak and then show a small popup ~1s after speech ends
                try {
                    speakWelcome().then(() => {
                        // show popup after ~1s using configured message (from CSV or URL)
                        setTimeout(() => showSpeechPopup(CONFIG.SPEECH_MESSAGE, 3000), 100);
                    });
                } catch (e) { /* ignore */ }
            }, 1200);

        }, 800); // Đợi 0.8s cho chiều cao chạy gần xong

    }, CONFIG.INITIAL_DELAY_MS);
}

// ==========================================
// 4. SPEECH (WELCOME MESSAGE)
// ==========================================
function pickEnglishFemaleVoice() {
    try {
        const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
        if (!voices || voices.length === 0) return;

        // lọc các voice hỗ trợ tiếng Anh
        const enVoices = voices.filter(v => (v.lang || '').toLowerCase().startsWith('en'));

        // Từ khóa / tên ưu tiên cho giọng nữ phổ biến trên Android/iOS/Chrome/Safari
        const femaleKeywords = [
            'female', 'samantha', 'zira', 'alva', 'amy', 'alloy', 'fiona', 'tessa', 'amelia', 'maria', 'victoria', 'bella', 'linda', 'aria'
        ];
        const preferredNames = [
            'Google UK English Female',
            'Google US English',
            'Samantha',     // iOS
            'Alva',         // some browsers
            'Amy',          // Amazon/other
            'Microsoft Zira',
            'en-US-Wavenet-F', // wavenet female pattern
            'en-US-Standard-E' // fallback female-like
        ];

        // 1) try to find en-US voice that matches female keywords
        let chosen = enVoices.find(v =>
            (v.lang || '').toLowerCase().startsWith('en-us') &&
            femaleKeywords.some(k => (v.name || '').toLowerCase().includes(k))
        );

        // 2) then try preferred exact names
        if (!chosen) {
            for (const name of preferredNames) {
                const match = enVoices.find(v => v.name && v.name.toLowerCase().indexOf(name.toLowerCase()) !== -1);
                if (match) { chosen = match; break; }
            }
        }

        // 3) fallback: any en-US, or any en voice containing female keyword, or first en voice
        if (!chosen) {
            chosen = enVoices.find(v => (v.lang || '').toLowerCase().startsWith('en-us')) ||
                     enVoices.find(v => femaleKeywords.some(k => (v.name || '').toLowerCase().includes(k))) ||
                     enVoices[0];
        }

        if (chosen) SPEECH.voice = chosen;
    } catch (e) { /* ignore */ }
}
// Make speak return a Promise that resolves on end/error so we can chain UI actions
function speak(text) {
    return new Promise((resolve) => {
        try {
            if (!('speechSynthesis' in window)) return resolve();
            const u = new SpeechSynthesisUtterance(text);
            // ép ngữ cảnh tiếng Anh Mỹ để ưu tiên voice en-US
            u.lang = 'en-US';
            if (SPEECH.voice) u.voice = SPEECH.voice;
            u.rate = 0.9; // Tốc độ nói
            u.pitch = 1.6; // Giọng cao hơn một chút
            u.volume = 1.5; // Âm lượng tối đa
            u.onend = () => resolve();
            u.onerror = () => resolve();
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
        } catch (e) { resolve(); }
    });
}

function speakWelcome() {
    if (STATE.hasSpokenWelcome) return Promise.resolve();
    STATE.hasSpokenWelcome = true;
    const part1 = 'Thank you for joining us, Welcome to. Noel No Cool Season Three.';
    const part2 = '';
    // nói phần 1, chờ 600ms, rồi nói phần 2 (tạo khoảng nghỉ nhẹ)
    return speak(part1).then(() => new Promise(resolve => setTimeout(resolve, 1))).then(() => speak(part2));
}

// Popup display helpers for speech hint
let _speechPopupTimer = null;
function showSpeechPopup(message, duration = 3000) {
    try {
        const el = document.getElementById('speech-popup');
        if (!el) return;
        el.textContent = message;
        el.setAttribute('aria-hidden', 'false');
        el.classList.add('visible');
        if (_speechPopupTimer) clearTimeout(_speechPopupTimer);
        _speechPopupTimer = setTimeout(() => hideSpeechPopup(), duration);
    } catch (e) { /* ignore */ }
}

function hideSpeechPopup() {
    try {
        const el = document.getElementById('speech-popup');
        if (!el) return;
        el.classList.remove('visible');
        el.setAttribute('aria-hidden', 'true');
    } catch (e) { /* ignore */ }
}

// ==========================================
// 3. INTERACTION LOGIC (DRAG & SWIPE)
// ==========================================

function getClientCoords(e) {
    return {
        x: e.touches ? e.touches[0].clientX : e.clientX,
        y: e.touches ? e.touches[0].clientY : e.clientY
    };
}

function setTransform(rotY, tiltX) {
    const rotZ = tiltX * 0.2; // Hiệu ứng nghiêng nhẹ
    DOM.inner.style.transform = `rotateY(${rotY}deg) rotateX(${tiltX}deg) rotateZ(${rotZ}deg)`;
}

function handleStart(e) {
    const coords = getClientCoords(e);
    STATE.isDragging = true;
    STATE.startX = coords.x;
    STATE.startY = coords.y;

    DOM.inner.style.transition = 'none';
    DOM.inner.style.cursor = 'grabbing';

    // Xác định trạng thái xoay hiện tại (đang ở mặt trước hay sau)
    // Chuẩn hóa góc về 0-360
    const normRot = (STATE.currentRotationY % 360 + 360) % 360;
    // Nếu > 90 và <= 270 thì coi như đang ở mặt sau (180), ngược lại là mặt trước (0)
    STATE.initialRotationY = (normRot > 90 && normRot <= 270) ? 180 : 0;
    STATE.currentRotationY = STATE.initialRotationY;
}

function handleMove(e) {
    if (!STATE.isDragging) return;

    const coords = getClientCoords(e);
    const deltaX = coords.x - STATE.startX;
    const deltaY = coords.y - STATE.startY;

    // Tính toán góc xoay Y
    let newRotY = STATE.initialRotationY + (deltaX * CONFIG.ROTATION_SENSITIVITY);

    // Giới hạn góc xoay để không xoay vòng vòng quá đà
    if (STATE.initialRotationY === 0) {
        newRotY = Math.min(Math.max(-90, newRotY), 270);
    } else {
        newRotY = Math.min(Math.max(90, newRotY), 450);
    }
    STATE.currentRotationY = newRotY;

    // Tính toán góc nghiêng X
    const tiltX = deltaY * CONFIG.TILT_SENSITIVITY;
    STATE.currentTiltX = Math.min(Math.max(-CONFIG.MAX_TILT, tiltX), CONFIG.MAX_TILT);

    setTransform(STATE.currentRotationY, STATE.currentTiltX);
}

function handleEnd() {
    if (!STATE.isDragging) return;
    STATE.isDragging = false;

    // Snap về mặt gần nhất
    DOM.inner.style.transition = 'transform 0.4s ease-out';
    DOM.inner.style.cursor = 'grab';

    const revs = Math.round(STATE.currentRotationY / 180);
    STATE.currentRotationY = revs * 180;
    STATE.currentTiltX = 0;

    setTransform(STATE.currentRotationY, STATE.currentTiltX);
}

// ==========================================
// 5. EVENT LISTENERS
// ==========================================

function setupEventListeners() {
    // Mouse
    DOM.container.addEventListener('mousedown', handleStart);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);

    // Touch
    DOM.container.addEventListener('touchstart', handleStart, { passive: false });
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('touchcancel', handleEnd);
}

// Start App
window.onload = init;