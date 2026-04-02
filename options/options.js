async function fetchModelFields() {
    const ankiUrl = document.getElementById('ankiUrl').value;
    const modelName = document.getElementById('modelName').value;
    if (!modelName) return;

    try {
        const res = await fetch(ankiUrl, { 
            method: 'POST', 
            body: JSON.stringify({ action: "modelFieldNames", version: 6, params: { modelName } }) 
        }).then(r => r.json());

        if (res.result) {
            const fields = res.result;
            const selects = ['fieldWord', 'fieldReading', 'fieldMeaning', 'fieldAudio', 'fieldExample'];
            
            selects.forEach(id => {
                const selectElement = document.getElementById(id);
                const currentValue = selectElement.value; 
                
                selectElement.innerHTML = '<option value="">-- None --</option>';
                
                fields.forEach(field => {
                    const opt = document.createElement('option');
                    opt.value = field;
                    opt.textContent = field;
                    selectElement.appendChild(opt);
                });

                if (fields.includes(currentValue)) {
                    selectElement.value = currentValue;
                }
            });
        }
    } catch(e) {
        console.error("Failed to fetch model fields:", e);
    }
}

async function fetchAnkiData() {
    const ankiUrl = document.getElementById('ankiUrl').value;
    const deckSelect = document.getElementById('deckName');
    const modelSelect = document.getElementById('modelName');
    
    // Save current selections before refetching
    const currentDeck = deckSelect.value;
    const currentModel = modelSelect.value;

    try {
        const [decksRes, modelsRes] = await Promise.all([
            fetch(ankiUrl, { method: 'POST', body: JSON.stringify({ action: "deckNames", version: 6 }) }).then(r => r.json()),
            fetch(ankiUrl, { method: 'POST', body: JSON.stringify({ action: "modelNames", version: 6 }) }).then(r => r.json())
        ]);

        if (decksRes.result) {
            deckSelect.innerHTML = '';
            decksRes.result.forEach(deck => {
                const opt = document.createElement('option');
                opt.value = deck;
                opt.textContent = deck;
                deckSelect.appendChild(opt);
            });
            if (decksRes.result.includes(currentDeck)) {
                deckSelect.value = currentDeck;
            }
        }

        if (modelsRes.result) {
            modelSelect.innerHTML = '';
            modelsRes.result.forEach(model => {
                const opt = document.createElement('option');
                opt.value = model;
                opt.textContent = model;
                modelSelect.appendChild(opt);
            });
            if (modelsRes.result.includes(currentModel)) {
                modelSelect.value = currentModel;
            }
        }
        
        await fetchModelFields();
    } catch (e) {
        console.error("Failed to load from Anki:", e);
        alert("Failed to load Decks/Models from Anki. Make sure Anki and AnkiConnect are running.");
    }
}

// Load saved settings
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get({
        ankiUrl: 'http://127.0.0.1:8765',
        deckName: 'Default',
        modelName: 'Basic',
        fieldWord: 'Front',
        fieldReading: '',
        fieldMeaning: 'Back',
        fieldAudio: '',
        fieldExample: ''
    }, (items) => {
        document.getElementById('ankiUrl').value = items.ankiUrl;
        
        // Add current saved options so they display immediately before fetch completes
        const deckOpt = document.createElement('option');
        deckOpt.value = items.deckName;
        deckOpt.textContent = items.deckName;
        document.getElementById('deckName').appendChild(deckOpt);
        document.getElementById('deckName').value = items.deckName;

        const modelOpt = document.createElement('option');
        modelOpt.value = items.modelName;
        modelOpt.textContent = items.modelName;
        document.getElementById('modelName').appendChild(modelOpt);
        document.getElementById('modelName').value = items.modelName;

        const selects = ['fieldWord', 'fieldReading', 'fieldMeaning', 'fieldAudio', 'fieldExample'];
        selects.forEach(id => {
            const selectElement = document.getElementById(id);
            const val = items[id];
            selectElement.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val ? val : '-- None --';
            selectElement.appendChild(opt);
            selectElement.value = val;
        });
        
        // Listen to model change to fetch fields for the new model
        document.getElementById('modelName').addEventListener('change', fetchModelFields);

        // Try to fetch updated lists automatically on load
        fetchAnkiData();
    });
});

document.getElementById('fetchAnkiBtn').addEventListener('click', () => {
    fetchAnkiData();
});

// Save settings
document.getElementById('saveBtn').addEventListener('click', () => {
    const ankiUrl = document.getElementById('ankiUrl').value;
    const deckName = document.getElementById('deckName').value;
    const modelName = document.getElementById('modelName').value;
    const fieldWord = document.getElementById('fieldWord').value;
    const fieldReading = document.getElementById('fieldReading').value;
    const fieldMeaning = document.getElementById('fieldMeaning').value;
    const fieldAudio = document.getElementById('fieldAudio').value;
    const fieldExample = document.getElementById('fieldExample').value;

    chrome.storage.sync.set({
        ankiUrl,
        deckName,
        modelName,
        fieldWord,
        fieldReading,
        fieldMeaning,
        fieldAudio,
        fieldExample
    }, () => {
        const status = document.getElementById('status');
        status.style.display = 'block';
        setTimeout(() => {
            status.style.display = 'none';
        }, 2000);
    });
});
