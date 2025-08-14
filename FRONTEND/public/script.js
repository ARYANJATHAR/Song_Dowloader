const form = document.getElementById('downloadForm');
const statusContainer = document.getElementById('statusContainer');
const statusText = document.getElementById('statusText');
const statusIcon = document.getElementById('statusIcon');
const progressFill = document.getElementById('progressFill');
const resultContainer = document.getElementById('resultContainer');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn = document.getElementById('clearBtn');

// Audio player elements
const audioPlayerContainer = document.getElementById('audioPlayerContainer');
const audioPlayer = document.getElementById('audioPlayer');
const audioSource = document.getElementById('audioSource');
const playerSongTitle = document.getElementById('playerSongTitle');
const playerSongArtist = document.getElementById('playerSongArtist');
const closePlayerBtn = document.getElementById('closePlayerBtn');

let currentDownloadId = null;
let currentPreviewId = null;
let downloadStartTime = null;
let lastDownloadedSong = null;
let currentPreviewData = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Hide status panel initially
    statusContainer.classList.remove('show');

    // Add input event listeners to remove error states when user starts typing
    document.getElementById('songName').addEventListener('input', function () {
        this.classList.remove('error');
    });

    document.getElementById('artist').addEventListener('input', function () {
        this.classList.remove('error');
    });

    // Mobile menu toggle functionality
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function () {
            navToggle.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Close menu when clicking on a link
        const navLinks = navMenu.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', function () {
                navToggle.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', function (e) {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                navToggle.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
    }

    // Scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    // Observe elements for animation
    const animateElements = document.querySelectorAll('.feature-card, .download-card');
    animateElements.forEach(el => {
        el.classList.add('fade-in');
        observer.observe(el);
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const offsetTop = target.offsetTop - 70; // Account for fixed navbar
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });
});

// Clear form functionality
clearBtn.addEventListener('click', function () {
    clearForm();
    hideAudioPlayer();
    showToast('Form cleared!', 'info');
});

// Clear form function
function clearForm() {
    document.getElementById('songName').value = '';
    document.getElementById('artist').value = '';
    document.getElementById('songName').classList.remove('error');
    document.getElementById('artist').classList.remove('error');
    statusContainer.classList.remove('show');
    resultContainer.innerHTML = '';
    
    // Reset progress
    progressFill.style.width = '0%';
    const progressText = document.getElementById('progressText');
    if (progressText) {
        progressText.textContent = '0%';
    }
    
    resetUI();
}

// Audio player event listeners
closePlayerBtn.addEventListener('click', function () {
    hideAudioPlayer();
});





// Audio player functions
function showAudioPlayer(previewData) {
    playerSongTitle.textContent = previewData.songName || 'Unknown Song';
    playerSongArtist.textContent = previewData.artist || 'Unknown Artist';
    
    // Set audio source using our proxy to avoid CORS issues
    if (previewData.previewUrl) {
        const proxyUrl = `/api/proxy-audio?url=${encodeURIComponent(previewData.previewUrl)}`;
        audioSource.src = proxyUrl;
        audioPlayer.load();
        
        showToast('Preview & Download starting together!', 'success');
    }
    
    // Show player with animation
    audioPlayerContainer.style.display = 'block';
    
    // Store current preview data
    currentPreviewData = previewData;
}

function hideAudioPlayer() {
    audioPlayerContainer.style.display = 'none';
    audioPlayer.pause();
    audioSource.src = '';
    currentPreviewData = null;
}



form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const songName = document.getElementById('songName').value.trim();
    const artist = document.getElementById('artist').value.trim();

    // Clear any previous error states
    document.getElementById('songName').classList.remove('error');
    document.getElementById('artist').classList.remove('error');

    // Validate that both fields are filled
    if (!songName) {
        showToast('Please enter a song name', 'error');
        document.getElementById('songName').classList.add('error');
        document.getElementById('songName').focus();
        return;
    }

    if (!artist) {
        showToast('Please enter an artist name', 'error');
        document.getElementById('artist').classList.add('error');
        document.getElementById('artist').focus();
        return;
    }

    // Store the attempted download info
    lastDownloadedSong = {
        songName: songName,
        artist: artist
    };

    startPreviewAndDownload(songName, artist);
});

async function startPreviewAndDownload(songName, artist) {
    try {
        showStatusPanel();
        hideAudioPlayer(); // Hide any existing player
        const searchQuery = artist ? `${songName} by ${artist}` : songName;
        updateUIState('searching', `Starting search for "${searchQuery}"...`, 5, 'fas fa-search');

        const response = await fetch('/api/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songName, artist })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to start search');
        }

        currentPreviewId = data.previewId;
        downloadStartTime = Date.now();
        updateUIState('searching', 'Search request sent to server...', 10, 'fas fa-paper-plane');

        // Start checking preview status
        setTimeout(checkPreviewAndDownloadStatus, 500);

    } catch (error) {
        showError('Failed to start search: ' + error.message);
        resetUI();
    }
}

async function checkPreviewAndDownloadStatus() {
    if (!currentPreviewId) return;

    try {
        const response = await fetch(`/api/download-status/${currentPreviewId}`);
        const data = await response.json();

        updatePreviewStatus(data);

        if (data.status === 'completed' && data.type === 'preview') {
            // Start both preview and download at the exact same moment
            if (data.songUrl) {
                // Start download request immediately (no await - let it run parallel)
                startSimultaneousDownload(data.songUrl, data.songName, data.artist);
                
                // Show preview immediately (both happen together)
                showAudioPlayer(data);
            } else {
                showAudioPlayer(data);
                resetUI();
            }
        } else if (data.status === 'failed') {
            showError(data.error || 'Search failed');
            resetUI();
        } else {
            // Check more frequently for active searches
            setTimeout(checkPreviewAndDownloadStatus, 1000);
        }

    } catch (error) {
        showError('Failed to check search status');
        resetUI();
    }
}

async function startSimultaneousDownload(songUrl, songName, artist) {
    try {
        console.log('🎵 Starting simultaneous preview + download for:', songName);
        
        // Don't show status panel again - it's already visible from search
        // Just update the existing status to download
        updateUIState('downloading', 'Starting download...', 10, 'fas fa-download');
        
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
        updateUIState('downloading', 'Download started...', 15, 'fas fa-download');
        
        // Start checking download status immediately
        setTimeout(checkDownloadStatus, 1000);
        
        showToast('Preview & Download both active!', 'success');

    } catch (error) {
        console.error('Simultaneous download failed:', error);
        showToast('Preview available, but download failed', 'error');
    }
}

async function startDirectDownloadBackground(songUrl, songName, artist) {
    try {
        console.log('🚀 Starting background download for:', songName);
        
        const response = await fetch('/api/direct-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songUrl })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to start background download');
        }

        currentDownloadId = data.downloadId;
        
        // Start checking download status in background
        setTimeout(checkBackgroundDownloadStatus, 2000);
        
        showToast('Download started in background!', 'success');

    } catch (error) {
        console.error('Background download failed:', error);
        showToast('Preview available, but download failed to start', 'error');
    }
}

async function checkBackgroundDownloadStatus() {
    if (!currentDownloadId) return;

    try {
        const response = await fetch(`/api/download-status/${currentDownloadId}`);
        const data = await response.json();

        if (data.status === 'completed') {
            // Update the result container with download link
            showBackgroundDownloadComplete(data);
        } else if (data.status === 'failed') {
            showToast('Background download failed', 'error');
        } else {
            // Check again
            setTimeout(checkBackgroundDownloadStatus, 2000);
        }

    } catch (error) {
        console.error('Failed to check background download status');
    }
}

function showBackgroundDownloadComplete(data) {
    // Add download success message to result container
    resultContainer.innerHTML = `
        <div class="success-card" style="margin-top: 16px;">
            <i class="fas fa-check-circle" style="font-size: 24px; margin-bottom: 8px;"></i>
            <h4 style="margin-bottom: 8px;">Download Ready!</h4>
            <p style="margin-bottom: 12px; opacity: 0.9; font-size: 0.9rem;">
                Your song has been processed and is ready to download
            </p>
            
            <div class="download-options">
                <a href="${data.downloadUrl}" class="download-link primary" download target="_blank">
                    <i class="fas fa-download"></i>
                    Download Song
                </a>
            </div>
        </div>
    `;
    
    showToast('Song ready for download!', 'success');
}

async function startPreview(songName, artist) {
    try {
        showStatusPanel();
        hideAudioPlayer(); // Hide any existing player
        const searchQuery = artist ? `${songName} by ${artist}` : songName;
        updateUIState('searching', `Starting preview for "${searchQuery}"...`, 5, 'fas fa-search');

        const response = await fetch('/api/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songName, artist })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to start preview');
        }

        currentPreviewId = data.previewId;
        downloadStartTime = Date.now();
        updateUIState('searching', 'Preview request sent to server...', 10, 'fas fa-paper-plane');

        // Start checking preview status
        setTimeout(checkPreviewStatus, 500);

    } catch (error) {
        showError('Failed to start preview: ' + error.message);
        resetUI();
    }
}

async function checkPreviewStatus() {
    if (!currentPreviewId) return;

    try {
        const response = await fetch(`/api/download-status/${currentPreviewId}`);
        const data = await response.json();

        updatePreviewStatus(data);

        if (data.status === 'completed') {
            showAudioPlayer(data);
            resetUI();
        } else if (data.status === 'failed') {
            showError(data.error || 'Preview failed');
            resetUI();
        } else {
            // Check more frequently for active previews
            setTimeout(checkPreviewStatus, 1000);
        }

    } catch (error) {
        showError('Failed to check preview status');
        resetUI();
    }
}

function updatePreviewStatus(data) {
    // Calculate progress percentage
    const progressPercent = Math.round(data.progress || 0);
    const percentStr = progressPercent > 0 ? ` (${progressPercent}%)` : '';

    // Generate dynamic status messages based on progress and status
    let statusText = '';
    let icon = '';
    let className = '';

    switch (data.status) {
        case 'searching':
            if (data.progress < 15) {
                statusText = `Initializing preview search...${percentStr}`;
                icon = 'fas fa-cog fa-spin';
            } else if (data.progress < 25) {
                statusText = `Searching JioSaavn for "${data.songName || 'your song'}"...${percentStr}`;
                icon = 'fas fa-search';
            } else {
                statusText = `Processing search results...${percentStr}`;
                icon = 'fas fa-list-ul';
            }
            className = 'searching';
            break;

        case 'extracting':
            if (data.progress < 40) {
                statusText = `Found song! Preparing preview...${percentStr}`;
                icon = 'fas fa-play';
            } else if (data.progress < 60) {
                statusText = `Extracting audio stream...${percentStr}`;
                icon = 'fas fa-music fa-pulse';
            } else if (data.progress < 80) {
                statusText = `Getting preview URL...${percentStr}`;
                icon = 'fas fa-link';
            } else {
                statusText = `Finalizing preview...${percentStr}`;
                icon = 'fas fa-check-circle';
            }
            className = 'downloading';
            break;

        case 'completed':
            statusText = `Preview ready! (100%)`;
            icon = 'fas fa-check';
            className = 'completed';
            break;

        case 'failed':
            statusText = 'Preview failed';
            icon = 'fas fa-times';
            className = 'failed';
            break;

        default:
            statusText = `Processing preview...${percentStr}`;
            icon = 'fas fa-cog fa-spin';
            className = 'searching';
    }

    updateUIState(className, statusText, data.progress || 0, icon);
}

async function startDirectDownload(songUrl, songName, artist) {
    try {
        // Set download button loading state
        downloadFromPlayerBtn.classList.add('loading');
        downloadFromPlayerBtn.disabled = true;
        
        showStatusPanel();
        updateUIState('downloading', 'Starting download...', 10, 'fas fa-download');

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
        updateUIState('downloading', 'Download started...', 15, 'fas fa-download');

        // Start checking download status
        setTimeout(checkDownloadStatus, 500);

    } catch (error) {
        showError('Failed to start download: ' + error.message);
        resetUI();
    }
}



async function convertPreviewToDownload(previewId) {
    try {
        showStatusPanel();
        updateUIState('downloading', 'Converting preview to download...', 10, 'fas fa-download');

        const response = await fetch('/api/convert-to-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ previewId })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to convert to download');
        }

        currentDownloadId = data.downloadId;
        downloadStartTime = Date.now();
        updateUIState('downloading', 'Download started...', 15, 'fas fa-download');

        // Start checking download status
        setTimeout(checkDownloadStatus, 500);

    } catch (error) {
        showError('Failed to convert to download: ' + error.message);
        resetUI();
    }
}

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
    // Calculate progress percentage
    const progressPercent = Math.round(data.progress || 0);
    const percentStr = progressPercent > 0 ? ` (${progressPercent}%)` : '';

    // Generate dynamic status messages based on progress and status
    let statusText = '';
    let icon = '';
    let className = '';

    switch (data.status) {
        case 'searching':
            if (data.progress < 15) {
                statusText = `Initializing search...${percentStr}`;
                icon = 'fas fa-cog fa-spin';
            } else if (data.progress < 25) {
                statusText = `Searching JioSaavn for "${data.songName || 'your song'}"...${percentStr}`;
                icon = 'fas fa-search';
            } else {
                statusText = `Processing search results...${percentStr}`;
                icon = 'fas fa-list-ul';
            }
            className = 'searching';
            break;

        case 'downloading':
            if (data.progress < 40) {
                statusText = `Found song! Preparing download...${percentStr}`;
                icon = 'fas fa-play';
            } else if (data.progress < 60) {
                statusText = `Extracting audio stream...${percentStr}`;
                icon = 'fas fa-download fa-pulse';
            } else if (data.progress < 80) {
                statusText = `Downloading audio file...${percentStr}`;
                icon = 'fas fa-download';
            } else {
                statusText = `Finalizing download...${percentStr}`;
                icon = 'fas fa-check-circle';
            }
            className = 'downloading';
            break;

        case 'completed':
            statusText = `Download completed successfully! (100%)`;
            icon = 'fas fa-check';
            className = 'completed';
            break;

        case 'failed':
            statusText = 'Download failed';
            icon = 'fas fa-times';
            className = 'failed';
            break;

        default:
            statusText = `Processing...${percentStr}`;
            icon = 'fas fa-cog fa-spin';
            className = 'searching';
    }

    updateUIState(className, statusText, data.progress || 0, icon);
}

function updateUIState(status, text, progress, icon = 'fas fa-search') {
    statusIcon.className = `status-icon ${status}`;
    statusIcon.innerHTML = `<i class="${icon}"></i>`;
    statusText.textContent = text;

    // Update progress text
    const progressText = document.getElementById('progressText');
    if (progressText) {
        progressText.textContent = `${Math.round(progress)}%`;
    }

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
                ${data.fileName ? 'File ready for download' : 'Ready to download'}
            </p>
            
            <div class="download-options">
                <a href="${data.downloadUrl}" class="download-link primary" download target="_blank">
                    <i class="fas fa-download"></i>
                    Download Song
                </a>
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
    setButtonLoading(false);
    currentDownloadId = null;
    currentPreviewId = null;
    downloadStartTime = null;
}

function setButtonLoading(loading) {
    downloadBtn.disabled = loading;
    if (loading) {
        downloadBtn.classList.add('loading');
        downloadBtn.innerHTML = `Processing...`;
    } else {
        downloadBtn.classList.remove('loading');
        downloadBtn.innerHTML = `
            <i class="fas fa-download"></i>
            Download
        `;
    }
}

// Override original functions to include button states
const originalStartPreview = startPreview;

startPreview = async function (songName, artist) {
    setButtonLoading(true);
    return originalStartPreview(songName, artist);
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
`;
document.head.appendChild(style);
