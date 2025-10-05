// --- Element Selectors ---
const characterInput = document.getElementById('character-input');
const styleSelector = document.getElementById('style-selector');
const scriptInput = document.getElementById('script-input');
const generateBtn = document.getElementById('generate-btn');
//...(rest of selectors are the same)
const loadingIndicator = document.getElementById('loading-indicator');
const storyboardOutput = document.getElementById('storyboard-output');
const errorMessage = document.getElementById('error-message');
const actionsContainer = document.getElementById('actions-container');
const playAnimationBtn = document.getElementById('play-animation-btn');
const animationPlayer = document.getElementById('animation-player');
const playerImage = document.getElementById('player-image');
const playerSceneLabel = document.getElementById('player-scene-label');
const playerSceneText = document.getElementById('player-scene-text');
const progressBar = document.getElementById('progress-bar');
const closePlayerBtn = document.getElementById('close-player-btn');
const modificationModal = document.getElementById('modification-modal');
const modalImage = document.getElementById('modal-image');
const modalLoader = document.getElementById('modal-loader');
const modalError = document.getElementById('modal-error');
const cancelModalBtn = document.getElementById('cancel-modal-btn');

const API_KEY = ""; // PASTE YOUR KEY HERE FOR LOCAL TESTING

// --- State Variables ---
let conversationHistory = [];
let storyboardData = [];
let animationTimeoutId = null;
let currentlyEditingIndex = -1;

// --- NEW: Helper to get creative direction ---
function getCreativeDirection() {
    const characterDescription = characterInput.value.trim();
    const characterPrompt = characterDescription 
        ? `CRITICAL RULE: The characters must strictly match this description: "${characterDescription}". ` 
        : '';

    const activeStyleBtn = styleSelector.querySelector('.style-btn.active');
    const stylePrompt = `The visual style must be: "${activeStyleBtn.dataset.style}". `;

    return { characterPrompt, stylePrompt };
}

// --- Core Functions (Updated) ---
async function handleGenerateStoryboard() {
    const fullScript = scriptInput.value.trim();
    if (!fullScript) { return displayError("Please enter a script first."); }
    
    // Reset UI and state
    Object.assign(generateBtn, { disabled: true, textContent: 'Generating...' });
    storyboardOutput.innerHTML = '';
    actionsContainer.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    conversationHistory = [];
    storyboardData = [];
    
    const { characterPrompt, stylePrompt } = getCreativeDirection();

    const sceneCount = 5;
    try {
        const initialPrompt = `You are a storyboard artist AI. Your task is to generate a visual storyboard based on the script below, following my creative direction precisely. I will prompt you for each scene sequentially. ${characterPrompt}${stylePrompt}Here is the full script:\n\n---\n${fullScript}\n---\n\nFirst, provide the action text for Scene 1 and then generate the image for Scene 1.`;
        conversationHistory.push({ role: "user", parts: [{ text: initialPrompt }] });
        
        for (let i = 1; i <= sceneCount; i++) {
            document.getElementById('loading-text').textContent = `Generating Scene ${i} of ${sceneCount}...`;
            const panelData = await generatePanel(null); 
            
            if (panelData.error) {
                const placeholderImg = `https://placehold.co/1280x720/1f2937/4b5563?text=Image+Failed`;
                const errorTxt = `Scene ${i} Failed: ${panelData.message}`;
                storyboardData.push({ imageUrl: placeholderImg, text: errorTxt, originalPrompt: 'Generation Failed', error: true });
                createStoryboardPanel(placeholderImg, errorTxt, i - 1, true);
            } else {
                storyboardData.push({ ...panelData, originalPrompt: panelData.text });
                createStoryboardPanel(panelData.imageUrl, panelData.text, i - 1);
            }

            if (i < sceneCount) {
                const followupPrompt = `Excellent. Using the original script and adhering to the character and style rules, please now provide the action text and generate the image for Scene ${i + 1}.`;
                conversationHistory.push({ role: "user", parts: [{ text: followupPrompt }] });
            }
        }
        actionsContainer.classList.remove('hidden');
    } catch (error) {
        console.error('Storyboard Generation Error:', error);
        displayError(error.message || 'An unknown error occurred.');
    } finally {
        loadingIndicator.classList.add('hidden');
        Object.assign(generateBtn, { disabled: false, textContent: 'Generate Storyboard' });
    }
}

async function handleModification(modification) {
    if (currentlyEditingIndex === -1) return;

    modalLoader.classList.remove('hidden');
    modalImage.style.opacity = '0.5';
    modalError.classList.add('hidden');
    
    const { characterPrompt, stylePrompt } = getCreativeDirection();

    try {
        const currentScene = storyboardData[currentlyEditingIndex];
        const originalImage = currentScene.imageUrl;
        const newPrompt = `Follow these rules: ${characterPrompt}${stylePrompt}With those rules in mind, apply the following modification to this image while keeping the composition consistent: "${modification}".`;
        
        const panelData = await generatePanel(newPrompt, originalImage);
        
        if (panelData.error) {
            modalError.textContent = `Modification Failed: ${panelData.message}`;
            modalError.classList.remove('hidden');
        } else {
            storyboardData[currentlyEditingIndex].imageUrl = panelData.imageUrl;
            document.querySelector(`#panel-${currentlyEditingIndex} img`).src = panelData.imageUrl;
            modalImage.src = panelData.imageUrl;
        }

    } catch(error) {
        console.error("Regeneration failed:", error);
        modalError.textContent = `An unexpected error occurred.`;
        modalError.classList.remove('hidden');
    } finally {
        modalLoader.classList.add('hidden');
        modalImage.style.opacity = '1';
    }
}

// --- Unchanged Functions (generatePanel, createStoryboardPanel, etc.) ---
async function generatePanel(prompt, baseImage = null) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${API_KEY}`;
    let requestContents;
    if (baseImage) {
        const base64Data = baseImage.split(',')[1];
        requestContents = [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: 'image/png', data: base64Data } }] }];
    } else { requestContents = conversationHistory; }
    const payload = { contents: requestContents, generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } };
    const response = await fetchWithRetry(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    const candidate = result.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) { return { error: true, message: 'The AI response was empty, invalid, or blocked.' }; }
    if (!baseImage) { conversationHistory.push(candidate.content); }
    const parts = candidate.content.parts;
    const textPart = parts.find(p => p.text);
    const imagePart = parts.find(p => p.inlineData);
    if (!imagePart) { const refusalText = textPart?.text || 'The model refused to generate an image.'; return { error: true, message: refusalText }; }
    const sceneText = textPart?.text || storyboardData[currentlyEditingIndex]?.originalPrompt || "Description not provided.";
    return { error: false, text: sceneText, imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` };
}
function createStoryboardPanel(imageUrl, text, index, isError = false) {
    const panel = document.createElement('div');
    panel.id = `panel-${index}`;
    panel.className = 'storyboard-panel bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-gray-700 flex flex-col';
    const img = document.createElement('img');
    img.src = imageUrl;
    img.className = 'w-full h-auto object-cover aspect-video';
    const textContainer = document.createElement('div');
    textContainer.className = 'p-4 flex-grow flex flex-col justify-between';
    if (isError) { textContainer.innerHTML = `<p class="text-sm font-bold text-red-400 mb-2">SHOT ${index + 1} FAILED</p><p class="text-red-300 text-sm">${text}</p>`; } 
    else { textContainer.innerHTML = `<p class="text-lg font-bold text-indigo-400">SHOT ${index + 1}</p>`;
        const modifyBtn = document.createElement('button');
        modifyBtn.textContent = 'Modify Scene';
        modifyBtn.className = 'mt-4 bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-600 transition text-sm self-start';
        modifyBtn.onclick = () => openModificationModal(index);
        textContainer.appendChild(modifyBtn);
    }
    panel.appendChild(img);
    panel.appendChild(textContainer);
    storyboardOutput.appendChild(panel);
}
function openModificationModal(index) {
    currentlyEditingIndex = index;
    modalImage.src = storyboardData[index].imageUrl;
    modificationModal.classList.remove('hidden');
    modalError.classList.add('hidden');
}
function startAnimation() { animationPlayer.classList.remove('hidden'); playScene(0); }
function stopAnimation() { animationPlayer.classList.add('hidden'); if (animationTimeoutId) clearTimeout(animationTimeoutId); animationTimeoutId = null; }
function playScene(index) {
    const playableScenes = storyboardData.filter(s => !s.error);
    if (index >= playableScenes.length) { return stopAnimation(); }
    const panel = playableScenes[index];
    playerImage.src = panel.imageUrl;
    playerSceneLabel.textContent = `SHOT ${storyboardData.indexOf(panel) + 1}`;
    playerSceneText.textContent = panel.originalPrompt;
    const animationClasses = ['animate-zoom-in', 'animate-pan-right', 'animate-pan-left', 'animate-pan-down'];
    const randomAnimation = animationClasses[Math.floor(Math.random() * animationClasses.length)];
    playerImage.className = `w-full h-full object-cover player-image-transition ${randomAnimation}`;
    progressBar.className = 'h-full bg-emerald-500 progress-bar-animate';
    animationTimeoutId = setTimeout(() => playScene(index + 1), 5000);
}
function displayError(message) { errorMessage.querySelector('p').textContent = message; errorMessage.classList.remove('hidden'); }
async function fetchWithRetry(url, options, retries = 3, delay = 1000) { for (let i = 0; i < retries; i++) { try { const response = await fetch(url, options); if (!response.ok) throw new Error(`API request failed: ${response.status}`); return response; } catch (error) { if (i === retries - 1) throw error; await new Promise(res => setTimeout(res, delay * 2 ** i)); } } }

// --- Event Listeners ---
generateBtn.addEventListener('click', handleGenerateStoryboard);
playAnimationBtn.addEventListener('click', startAnimation);
closePlayerBtn.addEventListener('click', stopAnimation);
cancelModalBtn.addEventListener('click', () => modificationModal.classList.add('hidden'));

// --- Style Selector Logic ---
function updateStyleButtons() {
    styleSelector.querySelectorAll('.style-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-gray-700', 'text-gray-300');
        if (btn.classList.contains('active')) {
            btn.classList.remove('bg-gray-700', 'text-gray-300');
            btn.classList.add('bg-indigo-600', 'text-white');
        }
    });
}

styleSelector.addEventListener('click', (e) => {
    if (e.target.classList.contains('style-btn')) {
        styleSelector.querySelectorAll('.style-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        updateStyleButtons();
    }
});

// --- Initial Page Setup ---
// Add base styling to all buttons on page load, preventing class overwrites
document.querySelectorAll('.style-btn').forEach(btn => {
    btn.classList.add('font-semibold', 'py-2', 'px-5', 'rounded-lg', 'transition', 'text-sm', 'hover:bg-gray-600');
});
document.querySelectorAll('.control-btn').forEach(btn => {
    btn.classList.add('bg-gray-700', 'text-white', 'font-semibold', 'py-2', 'px-4', 'rounded-lg', 'hover:bg-indigo-600', 'transition', 'text-sm');
    btn.addEventListener('click', () => handleModification(btn.dataset.mod));
});

// Set initial active button color
updateStyleButtons();
