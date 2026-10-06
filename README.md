# Goodreads ⇄ StoryGraph

Chrome extension (Manifest V3) that:

- adds an "Open on StoryGraph" link to Goodreads book pages, and "Open on Goodreads" to StoryGraph book pages
- mirrors shelf status both ways: to read, currently reading, read, did not finish

You must be logged in to both sites in the same browser. No data leaves your browser except requests to goodreads.com and thestorygraph.com.

## Install

1. Open `chrome://extensions` and enable Developer mode.
2. Click "Load unpacked" and select this folder.

## Notes

- Relies on both sites' current page markup, so it may break when they change.
- StoryGraph → Goodreads sync opens the Goodreads book page in a background tab and clicks the shelf button.
- Not affiliated with Goodreads or The StoryGraph.
