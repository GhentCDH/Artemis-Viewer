# Changing fonts

The interface uses two global font roles defined in `app/src/app.css`:

- `--font-ui` for controls and interface text
- `--font-readable` for longer-form text

To change a font:

1. Add the self-hosted `.woff2` file to this directory. Include every weight the app uses, currently `400` and `700` for the UI font.
2. Update the font preloads and matching `@font-face` declarations in `app/src/app.html`.
3. Update `--font-ui` or `--font-readable` in `app/src/app.css`. Keep an appropriate system-font fallback.
4. Run the app and check the browser Network panel for successful font requests. Verify regular and bold text, wrapping, overflow, and required character coverage.

Components should reference the global font tokens instead of naming font families directly. Confirm that the font license permits self-hosting and redistribution before committing the files.
