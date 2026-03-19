// content.js – injected into YouTube pages
// Extracts video title, description, and transcript

(function() {
  'use strict';

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getVideoInfo') {
      getVideoInfo().then(sendResponse).catch(err => {
        sendResponse({ error: err.message });
      });
      return true; // Keep channel open for async
    }
    if (message.action === 'getTranscript') {
      getTranscript().then(sendResponse).catch(err => {
        sendResponse({ error: err.message });
      });
      return true;
    }
  });

  async function getVideoInfo() {
    const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim()
      || document.querySelector('h1.title')?.textContent?.trim()
      || document.title.replace(' - YouTube', '').trim();

    const channelName = document.querySelector('#channel-name a')?.textContent?.trim()
      || document.querySelector('ytd-channel-name a')?.textContent?.trim()
      || 'Unknown Channel';

    const videoId = new URLSearchParams(window.location.search).get('v');
    const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;

    // Get description
    let description = '';
    const descEl = document.querySelector('#description-inline-expander yt-attributed-string')
      || document.querySelector('#description .yt-core-attributed-string');
    if (descEl) description = descEl.textContent?.trim().slice(0, 500) || '';

    return { title, channelName, videoId, thumbnail, description, url: window.location.href };
  }

  async function getTranscript() {
    // Try to get transcript via YouTube's transcript panel
    try {
      // First check if transcript button exists
      const moreActionsBtn = document.querySelector('button[aria-label="More actions"]');
      
      // Try to find transcript via the "..." menu approach
      const transcript = await extractTranscriptFromPage();
      return { transcript };
    } catch(e) {
      return { transcript: null, error: e.message };
    }
  }

  async function extractTranscriptFromPage() {
    // Method 1: Check if transcript panel is already open
    const existingSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (existingSegments.length > 0) {
      return extractSegmentText(existingSegments);
    }

    // Method 2: Try clicking the transcript button
    // Look for the transcript option in the "more" menu
    const moreBtn = document.querySelector('ytd-watch-metadata #expand');
    
    // Method 3: Use the video description + title as fallback context
    const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim()
      || document.title.replace(' - YouTube', '').trim();
    
    const descEls = document.querySelectorAll('#description yt-attributed-string');
    let description = '';
    descEls.forEach(el => { description += el.textContent + ' '; });

    // Method 4: Try to click "Show transcript" via engagement panel
    try {
      // Find and click the "..." menu
      const menuBtns = document.querySelectorAll('ytd-menu-renderer button');
      let transcriptOpened = false;
      
      for (const btn of menuBtns) {
        if (btn.getAttribute('aria-label')?.toLowerCase().includes('more')) {
          btn.click();
          await sleep(600);
          
          // Look for transcript option in dropdown
          const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer');
          for (const item of menuItems) {
            if (item.textContent?.toLowerCase().includes('transcript')) {
              item.click();
              await sleep(1200);
              transcriptOpened = true;
              break;
            }
          }
          break;
        }
      }

      if (transcriptOpened) {
        const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
        if (segments.length > 0) return extractSegmentText(segments);
      }
    } catch(e) {
      // silently continue
    }

    // Return null if we can't get transcript – we'll use title + description
    return null;
  }

  function extractSegmentText(segments) {
    let text = '';
    segments.forEach(seg => {
      const textEl = seg.querySelector('.segment-text, yt-formatted-string');
      if (textEl) text += textEl.textContent.trim() + ' ';
    });
    return text.trim() || null;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

})();
