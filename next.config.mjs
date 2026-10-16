/** @type {import('next').NextConfig} */
const nextConfig = {
  // unpdf trae pdf.js empaquetado para servidores y lo carga por su cuenta.
  // Dejar que Next lo vuelva a empaquetar rompe esa carga; afuera del bundle
  // queda tal cual se probó (lib/extractos/pdf.ts, solo servidor).
  serverExternalPackages: ['unpdf'],
};

export default nextConfig;
