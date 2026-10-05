import { TRANSIENT_PROVIDER_ERROR_CODES } from "@/lib/communications/provider-adapter";

/**
 * A one-line plain-language reason for a failed send, from its shared provider
 * error code (G5.1). Safe for the browser: no server imports.
 */
export function describeDeliveryFailure(errorCode: string | null | undefined): string {
  if (errorCode && TRANSIENT_PROVIDER_ERROR_CODES.includes(errorCode)) {
    return "Temporary provider problem — will retry automatically";
  }
  switch (errorCode) {
    case "provider_auth_error":
      return "Email provider rejected the API key — check RESEND_API_KEY";
    case "provider_config_error":
      return "Email provider configuration problem — check the sending domain and RESEND_FROM_EMAIL";
    case "invalid_request":
      return "The provider rejected this message";
    case "provider_not_configured":
      return "No email provider configured";
    default:
      return "Delivery failed";
  }
}
