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
const uploadForm = document.getElementById('corpusUpload');
const uploadInput = document.getElementById('corpusFile');
const uploadResponse = document.getElementById('uploadResponse');

/**
 * Affiche l'indicateur de frappe de l'IA
 */
function showTypingIndicator() {
    const typingHtml = `
        <div id="typing-indicator" class="message ai-message">
            <div class="message-content">
                <i class="fas fa-robot"></i>
                <span>IA réfléchit</span>
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
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
        <div class="message user-message">
            <div class="message-content">
                <i class="fas fa-user"></i>
                <div class="text">${message}</div>
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
        <div class="message ai-message">
            <div class="message-content">
                <i class="fas fa-robot"></i>
                <div class="text">${data.answer}</div>
            </div>
    `;

    // Ajouter les sources si disponibles
    if (data.sources && data.sources.length > 0) {
        html += `
            <div class="sources-box">
                <div class="sources-header">
                    <i class="fas fa-book-open"></i>
                    <span>Sources consultées</span>
                </div>
                <ul class="sources-list">
        `;
        
        data.sources.forEach(source => {
            html += `
                <li class="source-item">
                    <i class="fas fa-file-alt"></i>
                    <span><em>${source.title}</em> — ${source.author}, ${source.date}</span>
                    <span class="score">${source.score}%</span>
                </li>
            `;
        });
        
        html += `</ul></div>`;
    } else if (data.found === false) {
        html += `
            <div class="no-sources">
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
        <div class="message error-message">
            <div class="message-content">
                <i class="fas fa-exclamation-circle"></i>
                <span>${errorMessage}</span>
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
    
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUploadSubmit);
    }

    // Focus automatique sur l'input
    input.focus();
    
    console.log('💬 Chat IA initialisé avec succès');
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * Affiche la réponse JSON de l'upload dans un bloc Swagger-like
 */
function showUploadResponse(payload, status = 'info') {
    if (!uploadResponse) {
        return;
    }

    const title = `[${status.toUpperCase()}]`;
    let body = payload;

    if (typeof payload !== 'string') {
        try {
            body = JSON.stringify(payload, null, 2);
        } catch (error) {
            body = String(payload);
        }
    }

    uploadResponse.textContent = `${title}\n${body}`;
    uploadResponse.setAttribute('data-status', status);
}

async function handleUploadSubmit(event) {
    event.preventDefault();

    if (!uploadInput?.files?.length) {
        showUploadResponse('Sélectionnez un fichier à envoyer.', 'error');
        return;
    }

    try {
        const formData = new FormData(uploadForm);
        showUploadResponse('Envoi en cours...', 'info');

        const response = await fetch('/corpus/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            showUploadResponse(data?.error || 'Erreur serveur', 'error');
            return;
        }

        showUploadResponse(data, 'success');
        uploadInput.value = '';
    } catch (error) {
        console.error('❌ Upload error:', error);
        showUploadResponse(error.message || 'Erreur lors de l\'upload', 'error');
    }
}
