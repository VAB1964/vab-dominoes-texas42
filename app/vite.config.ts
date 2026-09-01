import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({base:"/dominoes/",plugins:[react()],build:{outDir:"../deploy/dominoes",emptyOutDir:true},server:{proxy:{"/api/dominoes":{target:"http://127.0.0.1:8787",ws:true}}}});
