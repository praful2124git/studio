
# LetterLink Live

A real-time multiplayer word game powered by AI.

## Deployment Guide

You can deploy this application for free using **Firebase App Hosting**. Follow these steps:

1.  **Push to GitHub**: Initialize a Git repository in this folder and push your code to a new GitHub repository.
2.  **Open Firebase Console**: Go to the [Firebase Console](https://console.firebase.google.com/).
3.  **App Hosting**: Navigate to the "App Hosting" section in the sidebar.
4.  **Create a Backend**: Click "Get started" or "Create a backend" and connect your GitHub repository.
5.  **Configure**: select your repository and the main branch. Firebase will automatically detect the Next.js setup.
6.  **Deploy**: Click "Finish" and wait for the build to complete. Your app will be live on a `.web.app` subdomain!

## Features

- **Real-time Multiplayer**: Powered by Firestore listeners.
- **AI Judge**: Uses Genkit and Gemini to validate "Name, Place, Animal, Thing" answers.
- **Manual Mode**: Allows the host to manually score rounds.
- **Persistent Profiles**: Anonymous authentication and Firestore integration save your scores across sessions.
