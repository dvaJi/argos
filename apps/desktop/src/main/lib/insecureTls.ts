import { is } from "@electron-toolkit/utils";

export function isInsecureTlsAllowed(): boolean {
  return is.dev || process.env.ARGOS_ALLOW_INSECURE_TLS === "1";
}
