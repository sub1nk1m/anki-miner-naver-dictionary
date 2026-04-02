// Inject Popup UI
const styleText = `
    #naver-dict-popup {
        all: initial;
        position: fixed;
        z-index: 2147483647;
        background: rgba(30, 30, 30, 0.95);
        color: #f0f0f0;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        padding: 16px;
        width: 320px;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-sizing: border-box;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: none;
        pointer-events: auto;
    }
    
    #naver-dict-popup.visible {
        display: block;
        animation: fadeIn 0.15s ease-out forwards;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .word-reading {
        font-size: 14px;
        color: #aaaaaa;
        margin-bottom: 2px;
    }

    .word-main {
        font-size: 24px;
        font-weight: bold;
        color: #ffffff;
        margin-bottom: 12px;
        line-height: 1.2;
    }

    .word-meaning {
        font-size: 15px;
        color: #e0e0e0;
        line-height: 1.5;
        margin-bottom: 16px;
        max-height: 150px;
        overflow-y: auto;
    }

    .word-example {
        font-size: 13px;
        color: #b0b0b0;
        line-height: 1.4;
        margin-bottom: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: 8px;
        display: none;
    }

    .add-anki-btn {
        background: #00c73c;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 10px;
        width: 100%;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s ease, transform 0.1s ease;
    }

    .add-anki-btn:hover {
        background: #00e043;
    }

    .add-anki-btn:active {
        transform: scale(0.98);
    }

    .add-anki-btn.success {
        background: #20a0ff;
    }
    
    .add-anki-btn.error {
        background: #ff4a4a;
    }
`;

const container = document.createElement('div');
const shadowRoot = container.attachShadow({ mode: 'open' });

const styleSheet = document.createElement('style');
styleSheet.textContent = styleText;
shadowRoot.appendChild(styleSheet);

const popup = document.createElement('div');
popup.id = 'naver-dict-popup';
popup.innerHTML = `
    <div class="word-reading" id="nd-reading"></div>
    <div class="word-main" id="nd-word"></div>
    <div class="word-meaning" id="nd-meaning"></div>
    <div class="word-example" id="nd-example"></div>
    <button class="add-anki-btn" id="nd-anki-btn">+ Add to Anki</button>
`;
shadowRoot.appendChild(popup);
document.documentElement.appendChild(container);

// State
let lastContextX = 0;
let lastContextY = 0;
let popupVisible = false;
let currentData = null;

// Track last right click position for context menu popup
document.addEventListener('contextmenu', (e) => {
    lastContextX = e.clientX;
    lastContextY = e.clientY;
});

// Listen for context menu triggers from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "CONTEXT_MENU_LOOKUP") {
        const text = request.text;
        if (!text || text.trim().length === 0) return;
        
        chrome.runtime.sendMessage({ type: "LOOKUP", text: text }, (response) => {
            if (chrome.runtime.lastError) return;
            
            if (response && response.success) {
                showPopup(lastContextX, lastContextY, response.data);
            } else {
                hidePopup();
                console.warn("Naver Dictionary: No definition found.");
            }
        });
    }
});

function showPopup(x, y, data) {
    currentData = data;
    
    shadowRoot.getElementById('nd-word').textContent = data.word;
    shadowRoot.getElementById('nd-reading').textContent = data.reading;
    shadowRoot.getElementById('nd-meaning').textContent = data.meaning;
    
    const exampleDiv = shadowRoot.getElementById('nd-example');
    if (data.example) {
        exampleDiv.innerHTML = data.example;
        exampleDiv.style.display = 'block';
    } else {
        exampleDiv.style.display = 'none';
        exampleDiv.innerHTML = '';
    }
    
    const btn = shadowRoot.getElementById('nd-anki-btn');
    btn.textContent = "+ Add to Anki";
    btn.className = "add-anki-btn";
    
    popup.classList.add('visible');
    popupVisible = true;
    
    // Position
    const padding = 20;
    let finalX = x + padding;
    let finalY = y + padding;
    
    const rect = popup.getBoundingClientRect();
    if (finalX + 320 > window.innerWidth) {
        finalX = x - 320 - padding;
    }
    if (finalY + rect.height > window.innerHeight) {
        finalY = y - rect.height - padding;
    }
    
    popup.style.left = finalX + 'px';
    popup.style.top = finalY + 'px';
}

function hidePopup() {
    popup.classList.remove('visible');
    popupVisible = false;
    currentData = null;
    lastExtractedText = "";
}

// Removed old mousemove hover listeners

// Hide on outside click
document.addEventListener('mousedown', (e) => {
    if (popupVisible && e.composedPath().indexOf(container) === -1) {
        hidePopup();
    }
});

// Handle Anki Button Click
shadowRoot.getElementById('nd-anki-btn').addEventListener('click', (e) => {
    if (!currentData) return;
    
    const btn = e.target;
    btn.textContent = "Adding...";
    
    chrome.runtime.sendMessage({ type: "ADD_TO_ANKI", data: currentData }, (response) => {
        if (chrome.runtime.lastError) {
             btn.textContent = "Error";
             btn.className = "add-anki-btn error";
             return;
        }

        if (response && response.success) {
            btn.textContent = "Added!";
            btn.className = "add-anki-btn success";
        } else {
            btn.textContent = "Error: " + (response ? response.error : 'Unknown');
            btn.className = "add-anki-btn error";
        }
        
        setTimeout(() => {
            if (btn.classList.contains('success')) {
                hidePopup();
            }
        }, 2000);
    });
});
