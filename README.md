# CLC Verses

Memory Verses for CLC All-In Groups

[Live Site](https://clc-verses.netlify.app/)

[![Netlify Status](https://api.netlify.com/api/v1/badges/cf36e717-6f83-4b8b-8197-926e6919d1ab/deploy-status)](https://app.netlify.com/sites/clc-verses/deploys)


## Description

This project is a flashcard companion for the [Christ Led Communities'](https://www.clchq.org/) (CLC) 2-Year All-In Curriculum. It displays the memory verses from each module of the curriculum so members can review and memorize them, with support for two Bible translations (NIV and ESV).

## Features

- **Module View**: Verses are organized into 12 color-coded modules matching the All-In curriculum. Click a module card to open its verse set.
- **All Verses View**: A flat list of every verse across all modules, with each card labeled by module.
- **Translation Toggle**: Switch between NIV and ESV on any screen — the active translation persists as you navigate.
- **Accordion Verse Cards**: Click a verse reference to expand it and read the full text; clicking another card collapses the previous one.
- **Responsive Design**: Works on both desktop and mobile devices.
- **Smooth Transitions**: Uses the View Transitions API where supported, with a FLIP/fade fallback for other browsers.

## Technologies Used

- **HTML** — page structure
- **CSS** — styling and responsive layout
- **JavaScript** — rendering, module navigation, translation switching, and animations
- **data.js** — all verse data and translation text stored as a plain JS object

## How to Use

1. **Open the application** at [https://clc-verses.netlify.app/](https://clc-verses.netlify.app/).
2. **Choose a view**: Use the **Modules / All Verses** toggle to browse by module or see every verse at once.
3. **Select a translation**: Click **NIV** or **ESV** to switch Bible versions.
4. **Open a module**: In Modules view, click any module card to open its verse list.
5. **Read a verse**: Click a verse reference card to expand it and reveal the full text. Click again (or click another card) to collapse it.
6. **Go back**: Use the **← All Modules** button to return to the module grid.

## Live Site

[https://clc-verses.netlify.app/](https://clc-verses.netlify.app/)

## Contributing

1. **Fork the repository** to your own GitHub account.
2. **Create a new branch** for your changes.
3. **Make your changes** to the codebase.
4. **Commit and push** your changes to your fork.
5. **Open a pull request** to merge into the main repository.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
