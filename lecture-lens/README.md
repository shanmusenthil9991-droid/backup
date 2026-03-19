# 🔭 LectureLens – Smart Study Assistant

A Chrome extension that helps students understand lecture videos instantly using AI.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Video Analysis** | Summarizes any lecture video with structured notes |
| **Smart MCQs** | Generates 20 practice questions tailored to content type |
| **Math Support** | MCQs include step-by-step solved solutions |
| **Electrical/Electronics** | Questions include circuit diagram hints |
| **Coding Lectures** | Code snippets and expected output in answers |
| **Story/Literature** | Story-focused comprehension questions |
| **Non-educational Detection** | Politely rejects entertainment content |

---

## 🚀 Installation

### Step 1: Download the Extension
Unzip the `lecture-lens` folder to a location on your computer.

### Step 2: Open Chrome Extensions
1. Open **Google Chrome**
2. Go to `chrome://extensions/` in the address bar
3. Enable **Developer Mode** (toggle in top-right corner)

### Step 3: Load the Extension
1. Click **"Load unpacked"**
2. Select the `lecture-lens` folder
3. The LectureLens icon will appear in your toolbar

### Step 4: Get Your API Key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account and generate an API key
3. Click the LectureLens extension icon
4. Enter your API key (starts with `sk-ant-`)
5. Click **Save**

---

## 📖 How to Use

1. **Navigate to a YouTube lecture video**
2. Click the **LectureLens** icon in your toolbar
3. The video title will be detected automatically

### Analyze Button
- Click **"Analyze Video"** to get a full structured summary
- Includes: Overview, Key Concepts, Formulas, Applications

### MCQ Button  
- Click **"Generate MCQs"** to create 20 practice questions
- Click any question to expand the answer + explanation
- Math questions show complete step-by-step solutions
- Electrical questions include circuit diagrams

---

## 🎯 Content Type Detection

| Content Type | What You Get |
|---|---|
| 📐 **Math** | MCQs with full step-by-step solutions |
| ⚡ **Electrical/Electronics** | MCQs with circuit diagram hints |
| 💻 **Programming/Code** | MCQs with code snippets & output |
| 🔬 **Science** | Conceptual MCQs with explanations |
| 📖 **Story/Literature** | Comprehension & analysis questions |
| 🎓 **General Lecture** | Comprehensive knowledge MCQs |
| 🎬 **Entertainment** | Pop-up warning: not study material |

---

## ⚙️ Technical Details

- **AI Model**: Claude Sonnet 4 (claude-sonnet-4-20250514)
- **API**: Anthropic Claude API
- **Key Storage**: Locally in Chrome storage (never sent anywhere else)
- **Transcript**: Automatically extracted from YouTube where available
- **Fallback**: Uses video title + description when transcript unavailable

---

## 🛠️ Troubleshooting

**"No video detected"** – Make sure you're on a `youtube.com/watch?v=...` URL

**"Invalid API key"** – Double-check your key starts with `sk-ant-` and is active

**"Rate limit exceeded"** – Wait 30 seconds and try again

**"Not Study Material" popup** – The video content appears to be entertainment, not educational

---

## 📁 File Structure

```
lecture-lens/
├── manifest.json          # Extension configuration
├── popup.html             # Main UI
├── css/
│   └── popup.css          # Styles
├── js/
│   ├── popup.js           # Main logic + AI integration
│   ├── content.js         # YouTube page interaction
│   └── background.js      # Service worker
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

*Built with Claude AI · For students, by design*
