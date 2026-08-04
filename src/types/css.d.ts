/**
 * Side-effect CSS imports.
 *
 * maplibre-gl ships its control styles as a stylesheet that must be imported
 * for the zoom and geolocate controls to render at all. Metro handles it on
 * web; TypeScript needs to be told the module exists.
 */
declare module '*.css';
