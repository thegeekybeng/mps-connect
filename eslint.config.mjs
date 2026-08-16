import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "graphify-out/**",
      "dist/**",
      "venv/**",
      ".venv/**",
      "mps-connect_testers/**"
    ]
  }
];

export default config;
