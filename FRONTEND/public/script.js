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
const suggestionsList = document.getElementById('suggestionsList'); // Added suggestions list element

let currentDownloadId = null;
let currentPreviewId = null;
let downloadStartTime = null;
let lastDownloadedSong = null;
let currentPreviewData = null;
let debounceTimer; // Added debounce timer

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Hide status panel initially
    statusContainer.classList.remove('show');

    // Theme Toggle Logic
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;
    const icon = themeToggle.querySelector('i');

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    }

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        
        if (body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            localStorage.setItem('theme', 'light');
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    });

    // Add input event listeners to remove error states when user starts typing
    document.getElementById('songName').addEventListener('input', function () {
        this.classList.remove('error');
    });

    document.getElementById('artist').addEventListener('input', function () {
        this.classList.remove('error');
    });

    // Autocomplete functionality
    const songInput = document.getElementById('songName');
    
    songInput.addEventListener('input', function(e) {
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            suggestionsList.classList.remove('show');
            return;
        }
        
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchSuggestions(query);
        }, 300);
    });

    // Close suggestions when clicking outside
    document.addEventListener('click', function(e) {
        if (!songInput.contains(e.target) && !suggestionsList.contains(e.target)) {
            suggestionsList.classList.remove('show');
        }
    });

    // Animate download card on load
    const downloadCard = document.querySelector('.download-card');
    if (downloadCard) {
        downloadCard.style.opacity = '0';
        downloadCard.style.transform = 'translateY(20px)';
        downloadCard.style.transition = 'all 0.6s ease-out';
        setTimeout(() => {
            downloadCard.style.opacity = '1';
            downloadCard.style.transform = 'translateY(0)';
        }, 100);
    }

    // Interactive Background Shapes
    document.addEventListener('mousemove', (e) => {
        const shapes = document.querySelectorAll('.shape');

        shapes.forEach((shape, index) => {
            const speed = (index + 1) * 20;
            const xOffset = (window.innerWidth / 2 - e.clientX) / speed;
            const yOffset = (window.innerHeight / 2 - e.clientY) / speed;
            
            // Apply subtle parallax effect
            shape.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
        });
    });
});

// Clear form functionality
clearBtn.addEventListener('click', function () {
    clearForm();
    hideAudioPlayer();
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
    }
    
    // Show player with animation
    audioPlayerContainer.style.display = 'block';
    audioPlayerContainer.style.opacity = '0';
    audioPlayerContainer.style.transform = 'translateY(20px)';
    
    // Animate in
    setTimeout(() => {
        audioPlayerContainer.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        audioPlayerContainer.style.opacity = '1';
        audioPlayerContainer.style.transform = 'translateY(0)';
    }, 10);
    
    // Store current preview data
    currentPreviewData = previewData;
}

function hideAudioPlayer() {
    // Animate out
    audioPlayerContainer.style.opacity = '0';
    audioPlayerContainer.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        audioPlayerContainer.style.display = 'none';
        audioPlayer.pause();
        audioSource.src = '';
        currentPreviewData = null;
    }, 500);
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
        document.getElementById('songName').classList.add('error');
        document.getElementById('songName').focus();
        return;
    }

    if (!artist) {
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
        
        // Add subtle animation to the download card
        const downloadCard = document.querySelector('.download-card');
        if (downloadCard) {
            downloadCard.style.boxShadow = '0 35px 70px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(78, 205, 196, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.9)';
            setTimeout(() => {
                downloadCard.style.boxShadow = 'var(--glass-shadow)';
            }, 1000);
        }

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
                // Pass the previewUrl (direct audio link) to speed up download
                startSimultaneousDownload(data.songUrl, data.songName, data.artist, data.previewUrl);
                
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

async function startSimultaneousDownload(songUrl, songName, artist, audioUrl = null) {
    try {
        console.log('🎵 Starting simultaneous preview + download for:', songName);
        if (audioUrl) console.log('⚡ Using direct audio URL for fast download');
        
        // Don't show status panel again - it's already visible from search
        // Just update the existing status to download
        updateUIState('downloading', 'Starting download...', 10, 'fas fa-download');
        
        const response = await fetch('/api/direct-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                songUrl,
                audioUrl, // Send the direct audio URL if available
                songName,
                artist
            })
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

    } catch (error) {
        console.error('Simultaneous download failed:', error);
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

function updateUIState(status, text, progress, icon = 'fas fa-search') {
    statusIcon.className = `status-icon ${status}`;
    statusIcon.innerHTML = `<i class="${icon}"></i>`;
    statusText.textContent = text;

    // Update progress text
    const progressText = document.getElementById('progressText');
    if (progressText) {
        progressText.textContent = `${Math.round(progress)}%`;
    }

    // Show/hide download indicator
    const downloadIndicator = document.getElementById('downloadIndicator');
    if (downloadIndicator) {
        if (status === 'downloading' || status === 'searching') {
            downloadIndicator.classList.add('active');
        } else {
            downloadIndicator.classList.remove('active');
        }
    }

    // Smooth progress bar animation
    const currentProgress = parseInt(progressFill.style.width) || 0;
    animateProgress(currentProgress, progress);
    
    // Add pulse effect to progress bar when downloading
    if (status === 'downloading') {
        progressFill.style.boxShadow = '0 0 15px rgba(255, 107, 107, 0.8)';
    } else {
        progressFill.style.boxShadow = '0 0 15px rgba(255, 107, 107, 0.5)';
    }
}

function animateProgress(from, to) {
    const duration = 600; // 600ms animation
    const steps = 25;
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
}

// Function to retry the last download
function retryLastDownload() {
    if (lastDownloadedSong) {
        document.getElementById('songName').value = lastDownloadedSong.songName;
        document.getElementById('artist').value = lastDownloadedSong.artist;
        resultContainer.innerHTML = '';
        statusContainer.classList.remove('show');
        resetUI();
    }
}

function showStatusPanel() {
    statusContainer.classList.add('show');
    resultContainer.innerHTML = '';
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
        downloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`;
    } else {
        downloadBtn.classList.remove('loading');
        downloadBtn.innerHTML = `
            <i class="fas fa-download"></i>
            Download
        `;
    }
}

// iTunes API Autocomplete Functions
async function fetchSuggestions(query) {
    try {
        // Use iTunes Search API
        const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            renderSuggestions(data.results);
        } else {
            suggestionsList.classList.remove('show');
        }
    } catch (error) {
        console.error('Error fetching suggestions:', error);
    }
}

function renderSuggestions(results) {
    suggestionsList.innerHTML = '';
    
    results.forEach(result => {
        const li = document.createElement('li');
        li.className = 'suggestion-item';
        
        // Create content
        const title = document.createElement('div');
        title.className = 'suggestion-title';
        title.textContent = result.trackName;
        
        const artist = document.createElement('div');
        artist.className = 'suggestion-artist';
        artist.textContent = result.artistName;
        
        li.appendChild(title);
        li.appendChild(artist);
        
        li.addEventListener('click', () => {
            selectSuggestion(result);
        });
        
        suggestionsList.appendChild(li);
    });
    
    suggestionsList.classList.add('show');
}

function selectSuggestion(result) {
    document.getElementById('songName').value = result.trackName;
    document.getElementById('artist').value = result.artistName;
    suggestionsList.classList.remove('show');
    
    // Remove error classes if any
    document.getElementById('songName').classList.remove('error');
    document.getElementById('artist').classList.remove('error');
}
