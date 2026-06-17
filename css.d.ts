/**
 * Ambient declaration so the root layout's `import '../global.css'` (the
 * NativeWind v4 entry, wired in metro.config.js) type-checks. Metro/Babel handle
 * the actual CSS at build time; this only satisfies the TypeScript side-effect
 * import. Runtime behavior is unchanged.
 */
declare module '*.css';
