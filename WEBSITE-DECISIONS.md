# Website decisions (davey-website)

- **Separate repo** `davey-website` holds the custom domain daveypersonalfinance.com (approved by David, 2026-10-16). The user site herringtondavid11-dotcom.github.io (AASA, /plaid/oauth, /privacy, /support) is untouched, because a custom domain on the user site would redirect github.io and break universal links and the Plaid redirect URI.
- **Static, no build step**: HTML, CSS and vanilla JS. Fonts: Inter (body) and Plus Jakarta Sans 700/800 (headings) from Google Fonts with display=swap.
- **Contrast**: brand slate #6E849A is 3.9:1 on white, so secondary text uses #52667B (5.9:1). Gold is used only as a fill with navy text (8.1:1); gold-toned text on light uses #8A6210 (5.5:1).
- **Draft screenshots** come from the app's existing dark-mode App Store captures (`docs/screenshots/dark`). The feature images are mapped to the closest real screens: Views for "Connect everything", Investments for "Goals", Transactions for "Bills". Replace them with demo-mode captures (spec §3) in the next pass.
- **Charts** use the app's validated categorical palette (light mode) and are labelled "Sample data".
- **Placeholder prices** match the app's StoreKit test products: $7.99/month, $59.99/year (save 37%). Edit `CONFIG.prices` in assets/js/site.js.
- **Waitlist**: until `CONFIG.formspreeEndpoint` is set, submitting opens a pre-filled email to the support address.
- **Privacy and Support** link to the existing pages on herringtondavid11-dotcom.github.io, so their URLs and content stay unchanged.
- **No social proof** and no App Store badge until the listing exists ("Coming soon to iPhone").
