# 🎵 SoundWave - Audio Scraper

A modern, professional audio downloader application that extracts audio content from various music platforms using advanced web scraping techniques with Puppeteer.

![SoundWave](https://img.shields.io/badge/SoundWave-Audio%20Scraper-blue)
![Node.js](https://img.shields.io/badge/Node.js-14%2B-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ⚠️ Important Disclaimer

**This project is for educational purposes only.** It demonstrates web scraping techniques and automation using Puppeteer. Please respect copyright laws, terms of service, and intellectual property rights when using this tool. Always ensure you have the right to download and use any content.

## 🚀 Features

- **Smart Search**: Intelligent song search with artist name support
- **Direct URL Download**: Support for direct JioSaavn URL downloads
- **Modern UI**: Professional, responsive web interface
- **Real-time Progress**: Live download status and progress tracking
- **Multiple Formats**: Supports various audio formats (MP3, MP4, M4A)
- **Background Processing**: Non-blocking download operations
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **File Management**: Automatic cleanup of old downloads

## 🛠️ Technology Stack

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **Puppeteer** - Browser automation and web scraping
- **Axios** - HTTP client for API requests
- **CORS** - Cross-origin resource sharing

### Frontend
- **HTML5** - Semantic markup
- **CSS3** - Modern styling with animations
- **JavaScript (ES6+)** - Interactive functionality
- **Font Awesome** - Icons and visual elements

## 📁 Project Structure

```
Audio_Scrapper/
├── BACKEND/
│   ├── advanced_scraper.js      # Main scraping logic
│   ├── jiosaavn_search.js       # JioSaavn search functionality
│   ├── server.js                # Express server
│   ├── website_configs.js       # Site configurations
│   ├── package.json             # Dependencies and scripts
│   └── test_jiosaavn.js         # Testing utilities
├── FRONTEND/
│   └── public/
│       ├── index.html           # Main web interface
│       ├── script.js            # Client-side JavaScript
│       └── styles.css           # Styling and animations
├── downloads/                   # Downloaded audio files (ignored by git)
├── .gitignore                   # Git ignore rules
└── README.md                    # Project documentation
```

## 🔧 Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn package manager
- Chrome/Chromium browser (for Puppeteer)

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd Audio_Scrapper
   ```

2. **Install dependencies**
   ```bash
   cd BACKEND
   npm install
   ```

3. **Run the application**
   ```bash
   # Development mode (with visible browser)
   npm run dev
   
   # Production mode (headless browser)
   npm run prod
   
   # Standard mode
   npm start
   ```

4. **Access the application**
   - Open your browser and navigate to `http://localhost:3000`
   - The web interface will be available immediately

## 🎯 Usage

### Method 1: Search by Song Name
1. Enter the song name in the "Song Name" field
2. Optionally add the artist name for better accuracy
3. Click "Start Download"
4. Wait for the search and download to complete

### Method 2: Direct URL Download
1. Find the song on JioSaavn manually
2. Copy the complete song URL
3. Paste it in the "JioSaavn URL" field
4. Click "Start Download"

### Download Process
- The application will show real-time progress
- Downloaded files are temporarily stored in the `downloads/` directory
- Files are automatically served for download through the web interface
- Old files are cleaned up automatically after 1 hour

## 🔄 API Endpoints

- `POST /api/search-and-download` - Search and download by song name
- `POST /api/direct-download` - Direct download from URL
- `GET /api/download-status/:downloadId` - Check download progress
- `GET /api/download-file/:downloadId` - Download the completed file

## ⚙️ Configuration

### Environment Variables
- `NODE_ENV` - Set to "production" for headless mode
- `HEADLESS` - Set to "true" to force headless browser mode
- `PORT` - Server port (default: 3000)

### Scripts
- `npm start` - Start the server
- `npm run dev` - Development mode with visible browser
- `npm run prod` - Production mode with headless browser

## 🐛 Troubleshooting

### Common Issues

1. **Search not finding songs**
   - Try more specific song names
   - Include movie/album names
   - Use the direct URL method instead

2. **Download failures**
   - Check your internet connection
   - Ensure the JioSaavn URL is valid and accessible
   - Try a different song that you know exists on the platform

3. **Browser automation issues**
   - Make sure Chrome/Chromium is installed
   - Check if Puppeteer downloaded Chromium successfully
   - Try running in non-headless mode for debugging

## 📝 Development

### Key Components

- **advanced_scraper.js**: Core scraping logic using Puppeteer
- **jiosaavn_search.js**: Automated search functionality
- **server.js**: Express server with API endpoints
- **script.js**: Frontend JavaScript for user interactions

### Adding New Platforms
To add support for new music platforms:
1. Create a new scraper configuration in `website_configs.js`
2. Update the search logic in the appropriate search module
3. Modify the frontend to support the new platform

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚖️ Legal Notice

This tool is created for educational purposes to demonstrate web scraping techniques. Users are responsible for ensuring they comply with:

- Copyright laws in their jurisdiction
- Terms of service of the websites being scraped
- Intellectual property rights of content creators
- Local and international laws regarding content downloading

The developers are not responsible for any misuse of this tool.

## 🙏 Acknowledgments

- [Puppeteer](https://pptr.dev/) for browser automation
- [Express.js](https://expressjs.com/) for the web framework
- [Font Awesome](https://fontawesome.com/) for icons
- The open-source community for inspiration and resources

---

**Built with ❤️ for educational purposes**
