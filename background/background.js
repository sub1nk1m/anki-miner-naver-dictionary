chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "naver-dict-lookup",
        title: "Look up '%s' in Naver Dict",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "naver-dict-lookup") {
        chrome.tabs.sendMessage(tab.id, { 
            type: "CONTEXT_MENU_LOOKUP", 
            text: info.selectionText 
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "LOOKUP") {
        const searchText = request.text;
        if (!searchText) {
             sendResponse({ success: false, error: 'Empty query' });
             return true;
        }

        // We iteratively decrease string length to find the longest matching prefix in Naver Dict
        async function performLookup() {
            for (let i = searchText.length; i > 0; i--) {
                const query = searchText.substring(0, i);
                const encodedQuery = encodeURIComponent(query);
                
                try {
                    const res = await fetch(`https://ac.dict.naver.com/jako/ac?st=11&q=${encodedQuery}`);
                    if (!res.ok) continue;
                    
                    const data = await res.json();
                    if (data.items && data.items[0] && data.items[0].length > 0) {
                        // Found a match
                        const match = data.items[0][0];
                        const reading = match[0] && match[0][0] ? match[0][0] : '';
                        const word = match[1] && match[1][0] ? match[1][0] : query;
                        const meaning = match[3] && match[3][0] ? match[3][0] : '';
                        
                        let example = '';
                        try {
                            const tatRes = await fetch(`https://tatoeba.org/en/api_v0/search?from=jpn&to=kor&query=${encodeURIComponent(word)}`);
                            if (tatRes.ok) {
                                const tatData = await tatRes.json();
                                if (tatData.results && tatData.results.length > 0) {
                                    let combinedExamples = '';
                                    const maxSentences = Math.min(tatData.results.length, 3);
                                    
                                    for (let j = 0; j < maxSentences; j++) {
                                        const resItem = tatData.results[j];
                                        
                                        // Prefer furigana HTML transcriptions if available
                                        let jpText = resItem.text;
                                        if (resItem.transcriptions && resItem.transcriptions.length > 0) {
                                            for (const trans of resItem.transcriptions) {
                                                if (trans.html) {
                                                    jpText = trans.html;
                                                    break;
                                                }
                                            }
                                        }
                                        
                                        let krText = '';
                                        // Extract korean translation
                                        if (resItem.translations) {
                                            for (const group of resItem.translations) {
                                                for (const trans of group) {
                                                    if (trans.lang === 'kor') {
                                                        krText = trans.text;
                                                        break;
                                                    }
                                                }
                                                if (krText) break;
                                            }
                                        }
                                        
                                        let currentEx = krText ? `${jpText}<br><span style="color:#888;">${krText}</span>` : jpText;
                                        combinedExamples += `<li style="margin-bottom:8px;">${currentEx}</li>`;
                                    }
                                    
                                    example = `<ul style="margin:0; padding-left:14px; list-style-type:circle;">${combinedExamples}</ul>`;
                                } else {
                                    example = '<i>No example found in corpus.</i>';
                                }
                            } else {
                                example = '<i>Failed to fetch example corpus.</i>';
                            }
                        } catch(e) {
                           console.error("Tatoeba fetch err:", e);
                           example = '<i>Error fetching example.</i>';
                        }
                        
                        return { success: true, data: { word, reading, meaning, example } };
                    }
                } catch (err) {
                    return { success: false, error: err.toString() };
                }
            }
            return { success: false, error: 'No definition found.' };
        }

        performLookup().then(sendResponse);
        return true; // Keep the message channel open for async response
    }

    if (request.type === "ADD_TO_ANKI") {
        chrome.storage.sync.get({
            ankiUrl: 'http://127.0.0.1:8765',
            deckName: 'Default',
            modelName: 'Basic',
            fieldWord: 'Front',
            fieldReading: '',
            fieldMeaning: 'Back',
            fieldAudio: '',
            fieldExample: ''
        }, (settings) => {
            const word = request.data.word;
            const reading = request.data.reading;
            const meaning = request.data.meaning;
            const example = request.data.example === '<i>No example found in corpus.</i>' || request.data.example === '<i>Failed to fetch example corpus.</i>' || request.data.example === '<i>Error fetching example.</i>' ? '' : request.data.example;
            
            const fields = {};
            if (settings.fieldWord) fields[settings.fieldWord] = word;
            if (settings.fieldReading) fields[settings.fieldReading] = reading;
            if (settings.fieldMeaning) fields[settings.fieldMeaning] = meaning;
            if (settings.fieldExample && example) fields[settings.fieldExample] = example;

            const note = {
                deckName: settings.deckName,
                modelName: settings.modelName,
                fields: fields,
                options: {
                    allowDuplicate: false,
                    duplicateScope: 'deck'
                },
                tags: ['naver_dict_extension']
            };

            // Audio from LanguagePod101 (standard fallback for Japanese)
            if (settings.fieldAudio) {
                note.audio = [{
                    url: `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=${encodeURIComponent(word)}&kana=${encodeURIComponent(reading || word)}`,
                    filename: `naver_jako_${word}.mp3`,
                    fields: [settings.fieldAudio]
                }];
            }

            const body = {
                action: 'addNote',
                version: 6,
                params: { note }
            };

            fetch(settings.ankiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    sendResponse({ success: false, error: data.error });
                } else {
                    sendResponse({ success: true });
                }
            })
            .catch(err => {
                sendResponse({ success: false, error: "Make sure Anki and AnkiConnect are running. " + err.toString() });
            });
        });

        return true;
    }
});
