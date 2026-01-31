/**
 * Chat IA avec RAG - Frontend JavaScript
 * Gestion de l'interface utilisateur et communication avec l'API
 */

// Variables globales
const input = document.getElementById('userInput');
const messages = document.getElementById('messages');
const sendBtn = document.getElementById('sendBtn');
const sendIcon = document.getElementById('sendIcon');
const sendText = document.getElementById('sendText');

/**
 * Affiche l'indicateur de frappe de l'IA
 */
function showTypingIndicator() {
    const typingHtml = `
        <div id="typing-indicator" class="flex flex-col items-start">
            <div class="max-w-[80%] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100">
                <div class="flex items-center gap-2">
                    <i class="fas fa-robot text-slate-400"></i>
                    <span class="text-slate-300">IA réfléchit</span>
                    <div class="ml-2 inline-flex items-center gap-1">
                        <span class="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-sky-400"></span>
                        <span class="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-sky-400" style="animation-delay:-0.16s"></span>
                        <span class="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-sky-400" style="animation-delay:-0.32s"></span>
                    </div>
                </div>
            </div>
        </div>
    `;
    messages.innerHTML += typingHtml;
    scrollToBottom();
}

/**
 * Supprime l'indicateur de frappe
 */
function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

/**
 * Fait défiler la zone de messages vers le bas
 */
function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
}

/**
 * Efface le message de bienvenue si présent
 */
function clearWelcomeMessage() {
    const welcomeMessage = messages.querySelector('.welcome-message');
    if (welcomeMessage) {
        messages.innerHTML = '';
    }
}

/**
 * Ajoute un message utilisateur à l'interface
 * @param {string} message - Le message de l'utilisateur
 */
function addUserMessage(message) {
    const userMessageHtml = `
        <div class="flex flex-col items-end">
            <div class="max-w-[80%] rounded-2xl border border-sky-500 bg-sky-500 px-4 py-3 text-sm text-white">
                <div class="flex items-start gap-2">
                    <i class="fas fa-user"></i>
                    <div class="leading-relaxed">${message}</div>
                </div>
            </div>
        </div>
    `;
    messages.innerHTML += userMessageHtml;
}

/**
 * Ajoute une réponse IA à l'interface
 * @param {Object} data - Données de la réponse (answer, sources, found)
 */
function addAIResponse(data) {
    let html = `
        <div class="flex flex-col items-start">
            <div class="max-w-[80%] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100">
                <div class="flex items-start gap-2">
                    <i class="fas fa-robot text-slate-400"></i>
                    <div class="leading-relaxed">${data.answer}</div>
                </div>
            </div>
    `;

    // Ajouter les sources si disponibles
    if (data.sources && data.sources.length > 0) {
        html += `
            <div class="mt-2 max-w-[80%] rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-300">
                <div class="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                    <i class="fas fa-book-open"></i>
                    <span>Sources consultées</span>
                </div>
                <ul class="mt-2 space-y-1">
        `;
        
        data.sources.forEach(source => {
            html += `
                <li class="flex items-center gap-2 text-[11px] text-slate-300">
                    <i class="fas fa-file-alt text-slate-500"></i>
                    <span class="flex-1"><em>${source.title}</em> — ${source.author}, ${source.date}</span>
                    <span class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-200">${source.score}%</span>
                </li>
            `;
        });
        
        html += `</ul></div>`;
    } else if (data.found === false) {
        html += `
            <div class="mt-2 max-w-[80%] rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Aucune source pertinente trouvée</span>
            </div>
        `;
    }

    html += '</div>';
    messages.innerHTML += html;
}

/**
 * Ajoute un message d'erreur à l'interface
 * @param {string} errorMessage - Message d'erreur à afficher
 */
function addErrorMessage(errorMessage = "Erreur de communication avec le serveur") {
    const errorHtml = `
        <div class="flex flex-col items-start">
            <div class="max-w-[80%] rounded-2xl border border-rose-700 bg-rose-950 px-4 py-3 text-sm text-rose-200">
                <div class="flex items-center gap-2">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>${errorMessage}</span>
                </div>
            </div>
        </div>
    `;
    messages.innerHTML += errorHtml;
}

/**
 * Active/désactive l'interface utilisateur
 * @param {boolean} disabled - État d'activation
 */
function setUIState(disabled) {
    input.disabled = disabled;
    sendBtn.disabled = disabled;
    
    if (disabled) {
        sendIcon.className = 'fas fa-spinner fa-spin';
    } else {
        sendIcon.className = 'fas fa-paper-plane';
    }
}

/**
 * Envoie un message à l'API et traite la réponse
 * @param {string} message - Message à envoyer
 */
async function sendMessageToAPI(message) {
    try {
        const response = await fetch('/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question: message })
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erreur lors de l\'envoi du message:', error);
        throw error;
    }
}

/**
 * Fonction principale pour envoyer un message
 */
async function sendMessage() {
    const message = input.value.trim();
    
    // Vérification du message
    if (!message) {
        return;
    }

    // Désactiver l'interface
    setUIState(true);
    
    // Effacer le message de bienvenue et ajouter le message utilisateur
    clearWelcomeMessage();
    addUserMessage(message);
    
    // Vider l'input
    input.value = '';
    
    // Afficher l'indicateur de frappe
    showTypingIndicator();

    try {
        // Envoyer le message à l'API
        const data = await sendMessageToAPI(message);
        
        // Supprimer l'indicateur de frappe
        removeTypingIndicator();
        
        // Ajouter la réponse IA
        addAIResponse(data);
        
    } catch (error) {
        // Supprimer l'indicateur de frappe et afficher l'erreur
        removeTypingIndicator();
        addErrorMessage();
    } finally {
        // Réactiver l'interface
        setUIState(false);
        
        // Faire défiler vers le bas et remettre le focus
        scrollToBottom();
        input.focus();
    }
}

/**
 * Gestionnaire d'événement pour la touche Entrée
 * @param {KeyboardEvent} event - Événement clavier
 */
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

/**
 * Initialisation de l'application
 */
function initializeApp() {
    // Ajout des gestionnaires d'événements
    input.addEventListener('keydown', handleKeyPress);
    sendBtn.addEventListener('click', sendMessage);
    
    // Focus automatique sur l'input
    input.focus();
    
    console.log('💬 Chat IA initialisé avec succès');
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', initializeApp);
