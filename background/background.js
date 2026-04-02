const LANG_MAP = {
  'ja': { endpoint: 'jako', tatoeba: 'jpn', tts: 'ja',
          getWord: m => m[1] && m[1][0] ? m[1][0] : '',
          getReading: m => m[0] && m[0][0] ? m[0][0] : '',
          getMeaning: m => m[3] && m[3][0] ? m[3][0] : '' },
  'en': { endpoint: 'enko', tatoeba: 'eng', tts: 'en',
          getWord: m => m[0] && m[0][0] ? m[0][0] : '',
          getReading: m => '',
          getMeaning: m => m[2] && m[2][0] ? m[2][0] : '' },
  'zh': { endpoint: 'zhko', tatoeba: 'cmn', tts: 'zh',
          getWord: m => m[0] && m[0][0] ? m[0][0] : '',
          getReading: m => m[2] && m[2][0] ? m[2][0] : '',
          getMeaning: m => m[3] && m[3][0] ? m[3][0] : '' },
  'fr': { endpoint: 'frko', tatoeba: 'fra', tts: 'fr',
          getWord: m => m[0] && m[0][0] ? m[0][0] : '',
          getReading: m => '',
          getMeaning: m => m[3] && m[3][0] ? m[3][0] : (m[2]&&m[2][0] ? m[2][0] : '') }
};

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "naver-dict-lookup",
        title: "네이버 사전에서 '%s' 검색",
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
             sendResponse({ success: false, error: '검색어가 없습니다.' });
             return true;
        }

        chrome.storage.sync.get({ dictLanguage: 'ja' }, (items) => {
            const langConfig = LANG_MAP[items.dictLanguage] || LANG_MAP['ja'];

            // We iteratively decrease string length to find the longest matching prefix in Naver Dict
            async function performLookup() {
                for (let i = searchText.length; i > 0; i--) {
                    const query = searchText.substring(0, i);
                    const encodedQuery = encodeURIComponent(query);
                    
                    try {
                        const res = await fetch(`https://ac.dict.naver.com/${langConfig.endpoint}/ac?st=11&q=${encodedQuery}`);
                        if (!res.ok) continue;
                        
                        const data = await res.json();
                        if (data.items && data.items[0] && data.items[0].length > 0) {
                            // Found a match
                            const match = data.items[0][0];
                            const reading = langConfig.getReading(match);
                            const word = langConfig.getWord(match) || query;
                            const meaning = langConfig.getMeaning(match);
                            
                            let example = '';
                            try {
                                const tatRes = await fetch(`https://tatoeba.org/en/api_v0/search?from=${langConfig.tatoeba}&to=kor&query=${encodeURIComponent(word)}`);
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
                                    example = '<i>관련 예문을 찾을 수 없습니다.</i>';
                                }
                            } else {
                                example = '<i>예문 데이터를 불러오는데 실패했습니다.</i>';
                            }
                        } catch(e) {
                           console.error("Tatoeba fetch err:", e);
                           example = '<i>예문을 불러오는 중 오류가 발생했습니다.</i>';
                        }
                        
                        return { success: true, data: { word, reading, meaning, example } };
                    }
                } catch (err) {
                    return { success: false, error: err.toString() };
                }
            }
                return { success: false, error: '검색 결과를 찾을 수 없습니다.' };
            }

            performLookup().then(sendResponse);
        });
        return true; // Keep the message channel open for async response
    }

    if (request.type === "ADD_TO_ANKI") {
        chrome.storage.sync.get({
            dictLanguage: 'ja',
            ankiUrl: 'http://127.0.0.1:8765',
            deckName: 'Default',
            modelName: 'Basic',
            fieldWord: 'Expression',
            fieldReading: 'ExpressionFurigana',
            fieldMeaning: 'MainDefinition',
            fieldAudio: 'ExpressionAudio',
            fieldExample: 'Sentence'
        }, (settings) => {
            const word = request.data.word;
            const reading = request.data.reading;
            const meaning = request.data.meaning;
            const example = request.data.example === '<i>관련 예문을 찾을 수 없습니다.</i>' || request.data.example === '<i>예문 데이터를 불러오는데 실패했습니다.</i>' || request.data.example === '<i>예문을 불러오는 중 오류가 발생했습니다.</i>' ? '' : request.data.example;
            
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

            // Audio from Google Translate TTS (supports all languages universally)
            if (settings.fieldAudio) {
                const langConfig = LANG_MAP[settings.dictLanguage] || LANG_MAP['ja'];
                const ttsQuery = settings.dictLanguage === 'ja' && reading ? reading : word;
                note.audio = [{
                    url: `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${langConfig.tts}&q=${encodeURIComponent(ttsQuery)}`,
                    filename: `naver_dict_${settings.dictLanguage}_${word}.mp3`,
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
                sendResponse({ success: false, error: "Anki와 AnkiConnect가 실행 중인지 확인하세요. " + err.toString() });
            });
        });

        return true;
    }
});
