# macOS Genius Reference Notes

This project needs to maintain parity with the legacy macOS "Genius" study app located at `https://github.com/Tangorin-AP/genius-srcfrg`. To help guide future feature validation, this document records the main components that exist in the native app and how they map to the Next.js implementation.

## Reference repository structure

The macOS project is an Objective-C Cocoa application. Some noteworthy directories that surface feature expectations are:

- `Model/` — defines core data entities such as `GeniusItem`, `GeniusAssociation`, and compatibility bridges for v1 pairings. These map to Prisma models (items, pairs, associations) in our backend.
- `View/` and `Controllers/` — contain the AppKit table views and inspector panels that drive deck editing, including score display and reset actions.
- `Quiz/` — includes quiz generation logic that uses the association scores to prioritize study items.

## UI behavior to match

- **Deck table columns**: The macOS deck view keeps question, answer, and score columns visible simultaneously, with the score column aligned to the right. Our web `DeckTable` component should preserve this layout and keep the score column accessible via sticky positioning and horizontal scrolling when needed.
- **Score management**: The native app exposes commands such as `resetItemScore:` and responds to score change notifications. Equivalent interactions in the web app should allow resetting study history and keep the score indicator updated.

## Next steps

- Audit `DeckTable` and related server actions to ensure the score column remains visible at narrow widths and that score reset functionality is reachable, mirroring the macOS inspector behavior.
- Compare quiz generation logic with the `QuizModel` Objective-C implementation to ensure prioritization by score matches expectations.
