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
- Use gpt-4o-mini-transcribe for audio transcription.
- Use gpt-5-mini to analyze the transcription and decide if the user told a
  story about a special day. ONLY STORIES THAT MENTION BOTH THE OCCASION AND WHO
  IT IS FOR SHOULD BE ACCEPTED. SMALL TALK OR VAGUE STATEMENTS (e.g. "I'm in a
  good mood today") ARE NOT ENOUGH.
- Use gpt-5-mini to write the custom card message (2-3 sentences) and the gift
  box's speech bubble text.
- Get the analysis result back as JSON.
  Example: {"special_day": true, "occasion": "birthday", "hero": "Mom",
            "card": "...", "bubble": "..."}
- All text shown on the page (buttons, card, speech bubble) is in Korean.

## Gift box personality
The gift box is named ATO (아토), a native Korean word that means "gift." It is
warm and cheerful and speaks politely (존댓말). It loves turning someone's special
day into a memory they will keep for a long time, and it likes to use pretty
native Korean words (한아름, 아름드리, 도담도담, etc.).

## Styling

- Use the Google Font "Jua" for all text.
- Draw the gift box, balloons, and card with CSS/SVG.
- Use warm pastel colors (cream, light pink, light yellow).

## OpenAI API Key
The project is designed to run locally without committing any real API keys.

Use a local environment variable or a secure config file instead of checking credentials into the repository.