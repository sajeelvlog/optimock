# Make the portal live on every device

This version replaces browser-only storage with Firebase Realtime Database. When an administrator adds a student, publishes an exam, or a student submits a result, open copies of the website update automatically.

## Before you begin

This starter is for a private demonstration only. The original app has browser-side passwords, a hard-coded administrator password, and answer keys sent to student browsers. Do not share the public link with real students until we replace that demo login with proper Firebase Authentication and server-side grading.

## Three simple setup steps

1. Create a free Firebase project at https://console.firebase.google.com/.
2. Add a Web App, then create a Realtime Database. Choose a nearby location. For a first private test only, select Test Mode.
3. Copy the Firebase configuration object into firebase-config.js, replacing every PASTE value.

Firebase describes Realtime Database as a JSON database that automatically synchronizes updates to connected clients. Its official setup guide is at https://firebase.google.com/docs/database/web/start.

## Test it

1. Open the site in two different browsers or phones.
2. Log in as admin with password adminpass on one device.
3. Add a student or publish an exam.
4. On the second device, refresh once if it was already on an inactive tab. New changes then appear live while both copies remain open.

## Put it online

Upload this folder to any static host. Firebase Hosting, GitHub Pages, and Netlify can host plain HTML, CSS, and JavaScript. Each visitor needs the public site URL; they do not need to install anything.

## Important next upgrade

Before real student use, ask me to add:

- Firebase Authentication instead of passwords stored in the database.
- Database security rules so students see only their own data.
- Server-side exam grading so answer keys cannot be inspected in the browser.
