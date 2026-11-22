import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  // xmlbuilder2 (pulled in through the metadata package) extends Node's EventEmitter
  resolve: { alias: { events: 'events/' } },
  // Cornerstone's DICOM loader ships web workers and WASM codecs that Vite must not pre-bundle.
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    // core/tools have circular imports; keep module execution order when pre-bundling them
    rolldownOptions: { output: { strictExecutionOrder: true } },
    // the codecs are CommonJS/Emscripten builds: pre-bundle them so the ESM loader can import a default export
    include: [
      'dicom-parser',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
      '@cornerstonejs/codec-libjxl/decodewasmjs',
    ],
  },
  worker: { format: 'es' },
  build: { rolldownOptions: { output: { strictExecutionOrder: true } } },
})
