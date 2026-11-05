import { defineConfig,type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
// Serve React's development preamble as a same-origin module so the production
// script-src policy can stay strict while using Netlify dev.
function externalRefreshPreamble():Plugin {
 return {
  name:'horizon-external-refresh',apply:'serve',enforce:'post',
  configureServer(server){server.middlewares.use('/@horizon/react-refresh',(_req,res)=>{res.setHeader('Content-Type','application/javascript');res.end(react.preambleCode.replace('__BASE__','/'));})},
  transformIndexHtml:{order:'post',handler(html){return html.replace(/<script type="module">[\s\S]*?injectIntoGlobalHook[\s\S]*?<\/script>/,'<script type="module" src="/@horizon/react-refresh"></script>')}}
 }
}
export default defineConfig({ plugins: [react(),externalRefreshPreamble()] })
