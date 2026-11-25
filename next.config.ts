import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_STANDALONE=1 gera .next/standalone (pasta autossuficiente) para o Docker e para o instalador do Windows.
  // Sem a variável, `npm run dev` e `npm start` seguem como sempre.
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // O banco e os arquivos brutos nunca entram na pasta autossuficiente (o banco fica em CONGRESSO_DB, fora da imagem).
  outputFileTracingExcludes: { "*": ["./data/**", "./dist/**", "./installer/**"] },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
