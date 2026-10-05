# Prompt 14 (optional): Best-effort handwriting search

## Goal
Let users search handwritten notes, honestly labelled as approximate. Do this only after 00-13 are stable.

## First, stop and propose
Browsers have no built-in handwriting recognition equivalent to Apple's native framework. Before writing code, report 2-3 options with pros/cons (for example an on-device OCR library such as Tesseract.js, rendering strokes to images, versus a user-opt-in service) covering accuracy on handwriting, bundle size, speed, offline support, licensing, and privacy. **Recommend one and wait for my approval**, because it adds a dependency. Do not choose any option that sends notes off the device by default.

## Then (after approval)
1. Run recognition in a Web Worker, in the background, incrementally for changed pages only. The original strokes are the source of truth; recognized text is a **derived index** that can be deleted and rebuilt at any time.
2. Add recognized text to the search index with a clear "Handwriting match (approximate)" label in results.
3. A "Convert selection to text" action that inserts a new text box and keeps the original ink.
4. Settings: enable/disable handwriting indexing, rebuild index, delete all derived text, show progress. Default: off until the user opts in, with a plain explanation of battery/CPU use.
5. Test accuracy honestly on a few sample handwriting images and report results, including that it may be poor for messy writing. No claims beyond what you measured.

## Do not
Add formula recognition, AI explain/summarize, or any cloud service.

Finish with the required report and STOP.
