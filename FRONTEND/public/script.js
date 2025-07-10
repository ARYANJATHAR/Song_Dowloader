const form = document.getElementById('downloadForm');
const statusContainer = document.getElementById('statusContainer');
const statusText = document.getElementById('statusText');
const statusIcon = document.getElementById('statusIcon');
const progressFill = document.getElementById('progressFill');
const resultContainer = document.getElementById('resultContainer');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn = document.getElementById('clearBtn');

let currentDownloadId = null;
let downloadStartTime = null;
let lastDownloadedSong = null;

// Client-Side Storage Manager using IndexedDB
class AudioStorageManager {
    constructor() {
        this.dbName = 'AudioDownloaderDB';
        this.dbVersion = 1;
        this.storeName = 'audioFiles';
        this.maxStorageSize = 100 * 1024 * 1024; // 100MB limit
        this.init();
    }

    async init() {
        try {
            this.db = await this.openDB();
            await this.loadStoredAudios();
            await this.cleanupOldFiles();
        } catch (error) {
            console.error('Failed to initialize storage:', error);
        }
    }

    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('songName', 'songName', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    async saveAudio(songName, artist, audioBlob, originalUrl) {
        try {
            const audioData = {
                id: Date.now().toString(),
                songName: songName.trim(),
                artist: (artist || '').trim(),
                audioBlob: audioBlob,
                originalUrl: originalUrl,
                timestamp: Date.now(),
                size: audioBlob.size,
                downloadDate: new Date().toISOString()
            };

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            await store.put(audioData);
            
            await this.loadStoredAudios();
            this.showToast(`"${songName}" saved to browser storage!`, 'success');
            
            return audioData.id;
        } catch (error) {
            console.error('Failed to save audio:', error);
            this.showToast('Failed to save audio to storage', 'error');
            throw error;
        }
    }

    async getAllAudios() {
        try {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('Failed to get audios:', error);
            return [];
        }
    }

    async getAudio(id) {
        try {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            return new Promise((resolve, reject) => {
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('Failed to get audio:', error);
            return null;
        }
    }

    async deleteAudio(id) {
        try {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            await store.delete(id);
            
            await this.loadStoredAudios();
            this.showToast('Audio removed from storage', 'info');
        } catch (error) {
            console.error('Failed to delete audio:', error);
            this.showToast('Failed to delete audio', 'error');
        }
    }

    async cleanupOldFiles() {
        try {
            const audios = await this.getAllAudios();
            if (audios.length > 15) { // Keep only last 15 files
                const sortedAudios = audios.sort((a, b) => a.timestamp - b.timestamp);
                const toDelete = sortedAudios.slice(0, audios.length - 15);
                
                for (const audio of toDelete) {
                    await this.deleteAudio(audio.id);
                }
            }
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
    }

    async loadStoredAudios() {
        try {
            const audios = await this.getAllAudios();
            const container = document.getElementById('storedAudiosContainer');
            
            if (!container) {
                // Create container if it doesn't exist
                this.createStoredAudiosContainer();
                return this.loadStoredAudios();
            }

            if (audios.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No stored audio files</p>';
                return;
            }

            const sortedAudios = audios.sort((a, b) => b.timestamp - a.timestamp);
            
            container.innerHTML = `
                <h3 style="margin-bottom: 15px; color: #333;">
                    <i class="fas fa-music" style="margin-right: 8px;"></i>
                    Stored Audio Files (${audios.length})
                </h3>
                <div class="stored-audios-list">
                    ${sortedAudios.map(audio => `
                        <div class="stored-audio-item" data-id="${audio.id}">
                            <div class="audio-info">
                                <div class="audio-title">${audio.songName}</div>
                                ${audio.artist ? `<div class="audio-artist">by ${audio.artist}</div>` : ''}
                                <div class="audio-meta">
                                    ${new Date(audio.downloadDate).toLocaleDateString()} • 
                                    ${(audio.size / (1024 * 1024)).toFixed(1)}MB
                                </div>
                            </div>
                            <div class="audio-actions">
                                <button onclick="audioStorage.playAudio('${audio.id}')" class="action-btn play-btn" title="Play">
                                    <i class="fas fa-play"></i>
                                </button>
                                <button onclick="audioStorage.downloadAudio('${audio.id}')" class="action-btn download-btn" title="Download">
                                    <i class="fas fa-download"></i>
                                </button>
                                <button onclick="audioStorage.deleteAudio('${audio.id}')" class="action-btn delete-btn" title="Delete">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (error) {
            console.error('Failed to load stored audios:', error);
        }
    }

    createStoredAudiosContainer() {
        const mainContainer = document.querySelector('.main-container');
        if (mainContainer && !document.getElementById('storedAudiosContainer')) {
            const container = document.createElement('div');
            container.id = 'storedAudiosContainer';
            container.className = 'stored-audios-container';
            mainContainer.appendChild(container);
        }
    }

    async playAudio(id) {
        try {
            const audio = await this.getAudio(id);
            if (!audio) {
                this.showToast('Audio file not found', 'error');
                return;
            }

            // Create audio URL from blob
            const audioUrl = URL.createObjectURL(audio.audioBlob);
            
            // Create and show audio player modal
            this.showAudioPlayer(audio, audioUrl);
            
        } catch (error) {
            console.error('Failed to play audio:', error);
            this.showToast('Failed to play audio', 'error');
        }
    }

    showAudioPlayer(audio, audioUrl) {
        // Remove existing player if any
        const existingPlayer = document.getElementById('audioPlayerModal');
        if (existingPlayer) {
            existingPlayer.remove();
        }

        // Create modal backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.onclick = () => this.closeAudioPlayer();

        // Create player modal
        const playerModal = document.createElement('div');
        playerModal.id = 'audioPlayerModal';
        playerModal.className = 'audio-player-modal';
        
        playerModal.innerHTML = `
            <div class="player-header">
                <h3>${audio.songName}</h3>
                ${audio.artist ? `<p>by ${audio.artist}</p>` : ''}
                <button class="close-btn" onclick="audioStorage.closeAudioPlayer()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="player-content">
                <audio id="audioPlayer" controls autoplay style="width: 100%;">
                    <source src="${audioUrl}" type="audio/mp4">
                    <source src="${audioUrl}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>
            <div class="player-footer">
                <button onclick="audioStorage.downloadAudio('${audio.id}')" class="download-btn-modal">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(playerModal);

        // Auto-cleanup URL when audio ends
        const audioElement = document.getElementById('audioPlayer');
        audioElement.addEventListener('ended', () => {
            URL.revokeObjectURL(audioUrl);
        });
    }

    closeAudioPlayer() {
        const backdrop = document.querySelector('.modal-backdrop');
        const modal = document.getElementById('audioPlayerModal');
        
        if (backdrop) backdrop.remove();
        if (modal) modal.remove();
    }

    async downloadAudio(id) {
        try {
            const audio = await this.getAudio(id);
            if (!audio) {
                this.showToast('Audio file not found', 'error');
                return;
            }

            const audioUrl = URL.createObjectURL(audio.audioBlob);
            const a = document.createElement('a');
            a.href = audioUrl;
            a.download = `${audio.songName}${audio.artist ? ` - ${audio.artist}` : ''}.mp4`;
            a.click();
            
            // Cleanup
            setTimeout(() => URL.revokeObjectURL(audioUrl), 1000);
            
            this.showToast('Download started!', 'success');
            
        } catch (error) {
            console.error('Failed to download audio:', error);
            this.showToast('Failed to download audio', 'error');
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        // Position toast
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#7c3aed'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-weight: 500;
            max-width: 300px;
            animation: slideInRight 0.3s ease-out;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize storage manager
const audioStorage = new AudioStorageManager();

// Show status panel by default when needed
document.addEventListener('DOMContentLoaded', function() {
    // Hide status panel initially
    statusContainer.classList.remove('show');
    
    // Initialize storage and load stored audios
    setTimeout(() => {
        if (audioStorage) {
            audioStorage.createStoredAudiosContainer();
            audioStorage.loadStoredAudios();
        }
    }, 1000);
});

// Clear form functionality
clearBtn.addEventListener('click', function() {
    clearForm();
    showToast('Form cleared!', 'info');
});

// Clear form function
function clearForm() {
    document.getElementById('songName').value = '';
    document.getElementById('artist').value = '';
    statusContainer.classList.remove('show');
    resultContainer.innerHTML = '';
    resetUI();
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const songName = document.getElementById('songName').value.trim();
    const artist = document.getElementById('artist').value.trim();

    if (!songName) {
        showToast('Please enter a song name', 'error');
        return;
    }

    // Store the attempted download info
    lastDownloadedSong = {
        songName: songName,
        artist: artist
    };

    startDownload(songName, artist);
});

async function startDownload(songName, artist) {
    try {
        showStatusPanel();
        const searchQuery = artist ? `${songName} by ${artist}` : songName;
        updateUIState('searching', `Starting search for "${searchQuery}"...`, 5, 'fas fa-rocket');

        const response = await fetch('/api/search-and-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songName, artist })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to start download');
        }

        currentDownloadId = data.downloadId;
        downloadStartTime = Date.now();
        updateUIState('searching', 'Search request sent to server...', 10, 'fas fa-paper-plane');
        
        // Start checking status after a brief delay
        setTimeout(checkDownloadStatus, 500);

    } catch (error) {
        showError('Failed to start download: ' + error.message);
        resetUI();
    }
}

async function checkDownloadStatus() {
    if (!currentDownloadId) return;

    try {
        const response = await fetch(`/api/download-status/${currentDownloadId}`);
        const data = await response.json();

        updateStatus(data);

        if (data.status === 'completed') {
            showSuccess(data);
            resetUI();
        } else if (data.status === 'failed') {
            showError(data.error || 'Download failed');
            resetUI();
        } else {
            // Check more frequently for active downloads
            setTimeout(checkDownloadStatus, 1000);
        }

    } catch (error) {
        showError('Failed to check download status');
        resetUI();
    }
}

function updateStatus(data) {
    // Calculate elapsed time
    const elapsedTime = downloadStartTime ? Math.floor((Date.now() - downloadStartTime) / 1000) : 0;
    const timeStr = elapsedTime > 0 ? ` (${elapsedTime}s)` : '';
    
    // Generate dynamic status messages based on progress and status
    let statusText = '';
    let icon = '';
    let className = '';
    
    switch(data.status) {
        case 'searching':
            if (data.progress < 15) {
                statusText = `Initializing search...${timeStr}`;
                icon = 'fas fa-cog fa-spin';
            } else if (data.progress < 25) {
                statusText = `Searching JioSaavn for "${data.songName || 'your song'}"...${timeStr}`;
                icon = 'fas fa-search';
            } else {
                statusText = `Processing search results...${timeStr}`;
                icon = 'fas fa-list-ul';
            }
            className = 'searching';
            break;
            
        case 'downloading':
            if (data.progress < 40) {
                statusText = `Found song! Preparing download...${timeStr}`;
                icon = 'fas fa-play';
            } else if (data.progress < 60) {
                statusText = `Extracting audio stream...${timeStr}`;
                icon = 'fas fa-download fa-pulse';
            } else if (data.progress < 80) {
                statusText = `Downloading audio file...${timeStr}`;
                icon = 'fas fa-download';
            } else {
                statusText = `Finalizing download...${timeStr}`;
                icon = 'fas fa-check-circle';
            }
            className = 'downloading';
            break;
            
        case 'completed':
            const totalTime = downloadStartTime ? Math.floor((Date.now() - downloadStartTime) / 1000) : 0;
            statusText = `Download completed in ${totalTime}s!`;
            icon = 'fas fa-check';
            className = 'completed';
            break;
            
        case 'failed':
            statusText = 'Download failed';
            icon = 'fas fa-times';
            className = 'failed';
            break;
            
        default:
            statusText = `Processing...${timeStr}`;
            icon = 'fas fa-cog fa-spin';
            className = 'searching';
    }
    
    updateUIState(className, statusText, data.progress || 0, icon);
}

function updateUIState(status, text, progress, icon = 'fas fa-search') {
    statusIcon.className = `status-icon ${status}`;
    statusIcon.innerHTML = `<i class="${icon}"></i>`;
    statusText.textContent = text;
    
    // Smooth progress bar animation
    const currentProgress = parseInt(progressFill.style.width) || 0;
    animateProgress(currentProgress, progress);
}

function animateProgress(from, to) {
    const duration = 500; // 500ms animation
    const steps = 20;
    const stepSize = (to - from) / steps;
    const stepDuration = duration / steps;
    
    let currentStep = 0;
    
    const animate = () => {
        if (currentStep <= steps) {
            const currentValue = from + (stepSize * currentStep);
            progressFill.style.width = Math.min(currentValue, to) + '%';
            currentStep++;
            setTimeout(animate, stepDuration);
        }
    };
    
    animate();
}

function showSuccess(data) {
    // Store the last downloaded song info
    lastDownloadedSong = {
        songName: document.getElementById('songName').value,
        artist: document.getElementById('artist').value,
        downloadUrl: data.downloadUrl,
        fileName: data.fileName
    };
    
    resultContainer.innerHTML = `
        <div class="success-card">
            <i class="fas fa-check-circle" style="font-size: 36px; margin-bottom: 12px;"></i>
            <h3 style="margin-bottom: 8px; font-size: 1.1rem;">Audio Downloaded Successfully!</h3>
            <p style="margin-bottom: 16px; opacity: 0.9; font-size: 0.9rem;">
                ${data.fileName ? 'File ready for download and storage' : 'Ready to download'}
            </p>
            
            <div class="download-options">
                <a href="${data.downloadUrl}" class="download-link primary" download target="_blank">
                    <i class="fas fa-download"></i>
                    Download to Device
                </a>
                
                <button onclick="saveToClientStorage('${data.downloadUrl}', '${lastDownloadedSong.songName}', '${lastDownloadedSong.artist}')" 
                        class="download-link secondary">
                    <i class="fas fa-save"></i>
                    Save to Browser
                </button>
            </div>
            
            <button class="download-another-button" onclick="startNewDownload()">
                <i class="fas fa-plus"></i>
                Download Another Song
            </button>
        </div>
    `;
}

function showError(message) {
    const formattedMessage = message.replace(/\n/g, '<br>');
    
    resultContainer.innerHTML = `
        <div class="error-card">
            <i class="fas fa-exclamation-triangle" style="font-size: 20px; margin-bottom: 8px;"></i>
            <strong>Error Occurred</strong><br>
            <div style="margin-top: 6px; opacity: 0.9; font-size: 0.85rem;">${formattedMessage}</div>
            <button class="retry-button" onclick="retryLastDownload()">
                <i class="fas fa-redo"></i>
                Try Again
            </button>
            <button class="download-another-button" onclick="startNewDownload()">
                <i class="fas fa-plus"></i>
                Try Different Song
            </button>
        </div>
    `;
}

// Function to start a new download (clears form)
function startNewDownload() {
    clearForm();
    document.getElementById('songName').focus();
    showToast('Ready for new download!', 'success');
}

// Function to retry the last download
function retryLastDownload() {
    if (lastDownloadedSong) {
        document.getElementById('songName').value = lastDownloadedSong.songName;
        document.getElementById('artist').value = lastDownloadedSong.artist;
        resultContainer.innerHTML = '';
        statusContainer.classList.remove('show');
        resetUI();
        showToast('Form restored. Click Download to retry!', 'info');
    } else {
        showToast('No previous download to retry', 'error');
    }
}

function showStatusPanel() {
    statusContainer.classList.add('show');
    resultContainer.innerHTML = '';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#7c3aed'};
        color: white;
        border-radius: 12px;
        box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        z-index: 1000;
        font-weight: 600;
        max-width: 280px;
        font-size: 0.9rem;
        animation: slideInRight 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 1500);
}

function resetUI() {
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = `
        <i class="fas fa-download"></i>
        Download
    `;
    currentDownloadId = null;
    downloadStartTime = null;
}

function setButtonLoading(loading) {
    downloadBtn.disabled = loading;
    if (loading) {
        downloadBtn.innerHTML = `
            <div class="spinner"></div>
            <span>Processing...</span>
        `;
    } else {
        downloadBtn.innerHTML = `
            <i class="fas fa-download"></i>
            Download
        `;
    }
}

// Override original functions to include button states
const originalStartDownload = startDownload;

startDownload = async function(songName, artist) {
    setButtonLoading(true);
    return originalStartDownload(songName, artist);
};

// Add slide animations for toast
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }

    .stored-audios-container {
        margin-top: 30px;
        background: white;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        max-width: 600px;
        margin-left: auto;
        margin-right: auto;
    }

    .stored-audios-list {
        max-height: 400px;
        overflow-y: auto;
    }

    .stored-audio-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        margin: 8px 0;
        background: #f8fafc;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        transition: all 0.2s ease;
    }

    .stored-audio-item:hover {
        background: #f1f5f9;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .audio-info {
        flex: 1;
        margin-right: 12px;
    }

    .audio-title {
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 4px;
    }

    .audio-artist {
        color: #6b7280;
        font-size: 0.9em;
        margin-bottom: 2px;
    }

    .audio-meta {
        color: #9ca3af;
        font-size: 0.8em;
    }

    .audio-actions {
        display: flex;
        gap: 6px;
    }

    .action-btn {
        padding: 8px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.9em;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 36px;
        height: 36px;
    }

    .play-btn {
        background: #10b981;
        color: white;
    }

    .play-btn:hover {
        background: #059669;
        transform: scale(1.05);
    }

    .download-btn {
        background: #3b82f6;
        color: white;
    }

    .download-btn:hover {
        background: #2563eb;
        transform: scale(1.05);
    }

    .delete-btn {
        background: #ef4444;
        color: white;
    }

    .delete-btn:hover {
        background: #dc2626;
        transform: scale(1.05);
    }

    .download-options {
        display: flex;
        gap: 10px;
        margin-bottom: 16px;
        flex-wrap: wrap;
    }

    .download-link.secondary {
        background: #6b7280;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        transition: all 0.2s ease;
        border: none;
        cursor: pointer;
        font-size: 0.9rem;
    }

    .download-link.secondary:hover {
        background: #4b5563;
        transform: translateY(-1px);
    }

    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .audio-player-modal {
        background: white;
        border-radius: 12px;
        padding: 20px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        position: relative;
    }

    .player-header {
        text-align: center;
        margin-bottom: 20px;
        position: relative;
    }

    .player-header h3 {
        margin: 0 0 8px 0;
        color: #1f2937;
    }

    .player-header p {
        margin: 0;
        color: #6b7280;
        font-size: 0.9em;
    }

    .close-btn {
        position: absolute;
        top: -10px;
        right: -10px;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .close-btn:hover {
        background: #dc2626;
    }

    .player-content {
        margin-bottom: 20px;
    }

    .player-footer {
        text-align: center;
    }

    .download-btn-modal {
        background: #7c3aed;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 8px;
    }

    .download-btn-modal:hover {
        background: #6d28d9;
    }
`;
document.head.appendChild(style);

// Save audio to client storage function
async function saveToClientStorage(downloadUrl, songName, artist) {
    try {
        audioStorage.showToast('Downloading and saving to browser...', 'info');
        
        // Fetch the audio file
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch audio file');
        }
        
        const audioBlob = await response.blob();
        
        // Save to IndexedDB
        await audioStorage.saveAudio(songName, artist, audioBlob, downloadUrl);
        
    } catch (error) {
        console.error('Failed to save to client storage:', error);
        audioStorage.showToast('Failed to save audio to browser storage', 'error');
    }
}
