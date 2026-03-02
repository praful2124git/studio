# **App Name**: LetterLink Live

## Core Features:

- Game Mode Selection & Lobby: Users choose between Single Player, Host Multiplayer, or Join Multiplayer, set a nickname and avatar (emoji), and view connected players in a lobby before starting a game.
- AI Answer Validation Tool: An AI-powered tool leveraging the Gemini API to validate user inputs (Name, Place, Thing) against a target letter, checking for correctness, category relevance, and ensuring the input is not gibberish.
- Multiplayer Game Hosting: Allow a user to create a real-time multiplayer session, generate a unique 4-digit room code, and broadcast game state (target letter, timer) to connected peer players.
- Multiplayer Game Joining: Enable players to join an active multiplayer game session by entering a 4-digit room code, receiving live game updates, and submitting answers to the host.
- Game Round Play Area: Display the current random target letter, a countdown timer, and input fields for Name, Place, and Thing. Players can submit answers manually or have them auto-submitted when the timer ends.
- Human Host Validation: Provide an interface for the host to manually review and approve or reject submitted answers from players during a 'human mode' game session, bypassing AI validation.
- Scoring & Results Display: Calculate and present round results including individual player scores (10 points for unique valid answers, 5 for valid duplicates, 0 for invalid/empty), showing everyone's submissions.

## Style Guidelines:

- Primary color: A rich, muted indigo (#4545A1), providing depth and visual anchor in a dark theme.
- Background color: A very dark, desaturated blue-grey (#181825), inspired by stone, creating a sophisticated and immersive canvas.
- Accent color: A vibrant, clear orange (#FF8000), used for calls to action, highlights, and game feedback, providing energetic contrast to the dark background.
- Headline and body font: 'Fredoka', a rounded sans-serif font, for a playful and friendly, yet clean aesthetic across the application.
- Utilize simple, geometric icons with a solid fill to maintain readability and integrate smoothly with the chosen font and color palette.
- Adopt a clean, spacious layout with a focus on intuitive navigation and clear display of game elements, ensuring optimal usability on both mobile and desktop screens.
- Implement subtle, smooth transitions for state changes and user interactions, enhancing feedback without distracting from gameplay, such as score updates and timer animations.