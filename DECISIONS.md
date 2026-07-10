# UI decisions

- `WaveSeparator.svelte` is a shared primitive because the same decorative SVG separator structure is used across the timeline sublayer windows and branding sections. It owns the non-interactive SVG/ARIA contract and exposes its visual tuning through CSS custom properties.
