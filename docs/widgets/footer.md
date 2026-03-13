# Footer Widget

## Purpose

Simple dashboard footer displaying version info and branding.

## Configuration

No specific configuration keys. Uses `dashboard.title` for the brand name.

## Layout

```json
{ "type": "footer" }
```

Typically the last entry in the layout array. Uses `contentVisibility: "auto"` for deferred rendering.

## Source

- `src/widgets/footer/index.js`
