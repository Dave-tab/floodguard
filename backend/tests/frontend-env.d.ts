// Lets the backend type-check frontend modules imported for contract tests (Vite provides this at build time).
interface ImportMetaEnv { readonly [key: string]: string | undefined }
interface ImportMeta { readonly env: ImportMetaEnv }
