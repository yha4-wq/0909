# Project Guidelines

## Summary
Create a new web page called gift.html where a gift box in the center of the page
opens when the user tells a story about a special day. A custom card and balloons
appear from the box.

## Web page features
- A gift box tied with a ribbon is at the center of the page. The box is closed
  when the page loads.
- The user clicks a button that says "Tell a story", which turns on the microphone
  so that the user can speak about a special day. The user has 10 seconds to
  speak, and a countdown timer is shown while recording.
- If the user talks about a special day (birthday, wedding, graduation, first
  birthday, proposal, anniversary, etc.) and who it is for:
  - the ribbon unties and the lid of the box opens
  - balloons float up out of the box
  - a custom card unfolds above the box with a celebration message written for
    that person and that day
- If the box is already open and the user tells a new special day story, the
  balloons bounce excitedly, confetti falls, and the card message changes to
  match the new story.
- If the user says something that isn't about a special day, the box either stays
  closed or closes again, and a speech bubble fades into view above the box. The
  bubble shows that the box is a little sad and asks the user to share a story
  about a special day.

## Technical specifications
- The text and speech processing will use various ChatGPT models through the
  OpenAI API.
- The browser never calls OpenAI directly. It calls `server.js` on the same
  origin, and the server adds the API key. See "Running it" below.
- Audio transcription: `gpt-transcribe`.
  (The original spec called for `gpt-4o-mini-transcribe`. OpenAI deprecated it on
  2026-08-26 with removal on 2027-02-26, and names `gpt-transcribe` as the
  replacement.)
- Story analysis and card/bubble writing: `gpt-5.6-luna`.
  (The original spec called for `gpt-5-mini`, which is no longer in the current
  model lineup. `gpt-5.6-luna` is the cheapest current text model.)
- Both model IDs are read from `.env`, so swapping them takes one line and no
  code change.
- ONLY STORIES THAT MENTION BOTH THE OCCASION AND WHO IT IS FOR SHOULD BE
  ACCEPTED. SMALL TALK OR VAGUE STATEMENTS (e.g. "I'm in a good mood today") ARE
  NOT ENOUGH.
- Get the analysis result back as JSON.
  Example: {"special_day": true, "occasion": "birthday", "hero": "Mom",
            "card": "...", "bubble": "..."}
- Everything NANAL says (card, speech bubble, status line) is in Korean.
- If the server is not running, or has no key configured, the page falls back to
  local keyword matching so it still works offline.

## Gift box personality
The gift box is named NANAL (나날), a native Korean word that means "day after day, every day." It is
warm and cheerful and speaks politely (존댓말). It loves turning someone's special
day into a memory they will keep for a long time, and it likes to use pretty
native Korean words (한아름, 아름드리, 도담도담, etc.).

## Styling

- Use the Google Font "Jua" for all text.
- Draw the gift box, balloons, and card with CSS/SVG.
- Use warm pastel colors (cream, light pink, light yellow).

## OpenAI API Key
The project is designed to run locally without committing any real API keys.

The key lives only in `01 ato/.env`, which is listed in `.gitignore` and is never
committed. `server.js` reads it at startup and attaches it to outgoing OpenAI
requests. It is never sent to the browser, so it does not appear in the page
source, in devtools, or in the network tab.

Never paste a real key into `.env.example`, into the page, into a commit, or into
a chat window. If a key is ever exposed, revoke it at
https://platform.openai.com/api-keys and issue a new one — rotating is the only
fix, since removing it from a later commit does not remove it from history.

## Running it

```bash
cd "01 ato"
cp .env.example .env      # then put your key in .env
npm start                 # same as: node server.js
```

Then open http://localhost:5173/gift.html

Requires Node 20.6+. There are no dependencies to install.

### Endpoints

| Endpoint           | Method | Purpose                                            |
| ------------------ | ------ | -------------------------------------------------- |
| `/api/health`      | GET    | Reports whether a key is configured and which models are in use |
| `/api/transcribe`  | POST   | Raw audio body in, `{ text }` out                  |
| `/api/story`       | POST   | `{ text }` in, the analysis JSON out               |
| everything else    | GET    | Static files from `01 ato/`                        |
