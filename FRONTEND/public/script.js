const form = document.getElementById('downloadForm');
const statusContainer = document.getElementById('statusContainer');
const statusText = document.getElementById('statusText');
const statusIcon = document.getElementById('statusIcon');
const progressFill = document.getElementById('progressFill');
const resultContainer = document.getElementById('resultContainer');
const downloadBtn = document.getElementById('downloadBtn');

let currentDownloadId = null;
let downloadStartTime = null;

// Show status panel by default
document.addEventListener('DOMContentLoaded', function() {
    statusContainer.classList.add('show');
    updateUIState('ready', 'Ready to download...', 0, 'fas fa-music');
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const songName = document.getElementById('songName').value.trim();
    const artist = document.getElementById('artist').value.trim();
    const songUrl = document.getElementById('songUrl').value.trim();

    // Prioritize direct URL if provided
    if (songUrl) {
        if (!songUrl.includes('jiosaavn.com/song/')) {
            showToast('Please enter a valid JioSaavn song URL', 'error');
            return;
        }
        startDirectDownload(songUrl);
        return;
    }

    if (!songName) {
        showToast('Please enter a song name or paste a JioSaavn URL', 'error');
        return;
    }

    startDownload(songName, artist);
});

async function startDirectDownload(songUrl) {
    try {
        showStatusPanel();
        updateUIState('downloading', 'Starting... 0%', 0, 'fas fa-download');

        const response = await fetch('/api/direct-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songUrl })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to start download');
        }

        currentDownloadId = data.downloadId;
        downloadStartTime = Date.now();
        
        // Start checking status after a brief delay
        setTimeout(checkDownloadStatus, 500);

    } catch (error) {
        showError('Failed to start download: ' + error.message);
        resetUI();
    }
}

async function startDownload(songName, artist) {
    try {
        showStatusPanel();
        updateUIState('searching', 'Starting... 0%', 0, 'fas fa-search');

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
    const statusConfig = {
        'searching': { icon: 'fas fa-search', text: 'Searching...', class: 'searching' },
        'downloading': { icon: 'fas fa-download', text: 'Downloading...', class: 'downloading' },
        'completed': { icon: 'fas fa-check', text: 'Completed!', class: 'completed' },
        'failed': { icon: 'fas fa-times', text: 'Failed', class: 'failed' }
    };

    const config = statusConfig[data.status] || statusConfig['searching'];
    const progress = data.progress || 0;
    const statusText = `${config.text} ${progress}%`;
    
    updateUIState(config.class, statusText, progress, config.icon);
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
    const fileSize = data.fileSize ? (data.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown size';
    
    resultContainer.innerHTML = `
        <div class="success-card">
            <i class="fas fa-check-circle" style="font-size: 36px; margin-bottom: 12px;"></i>
            <h3 style="margin-bottom: 8px; font-size: 1.1rem;">Download Completed!</h3>
            <p style="margin-bottom: 16px; opacity: 0.9; font-size: 0.9rem;">File Size: ${fileSize}</p>
            <a href="${data.downloadUrl}" class="download-link" download>
                <i class="fas fa-download"></i>
                Download Audio File
            </a>
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
        </div>
    `;
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
        background: ${type === 'error' ? '#ff512f' : '#667eea'};
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
    }, 3000);
}

function resetUI() {
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = `
        <i class="fas fa-download"></i>
        <span>Start Download</span>
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
            <span>Start Download</span>
        `;
    }
}

// Override original functions to include button states
const originalStartDirectDownload = startDirectDownload;
const originalStartDownload = startDownload;

startDirectDownload = async function(songUrl) {
    setButtonLoading(true);
    return originalStartDirectDownload(songUrl);
};

startDownload = async function(songName, artist) {
    setButtonLoading(true);
    return originalStartDownload(songName, artist);
};
