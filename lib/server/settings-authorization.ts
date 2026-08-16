import {
  isAdminSession,
  shouldChangePassword,
  type AppSession,
} from "@/lib/server/auth/helpers";
import { SETTINGS_ERROR_CODES } from "@/lib/site-settings";

export type SettingsAuthorizationFailure = {
  status: 401 | 403;
  body: {
    error:
      | typeof SETTINGS_ERROR_CODES.authenticationRequired
      | typeof SETTINGS_ERROR_CODES.administratorRequired
      | typeof SETTINGS_ERROR_CODES.passwordChangeRequired;
  };
};

export function getSettingsAuthorizationFailure(
  session: AppSession,
): SettingsAuthorizationFailure | null {
  if (!session) {
    return {
      status: 401,
      body: { error: SETTINGS_ERROR_CODES.authenticationRequired },
    };
  }

  if (!isAdminSession(session)) {
    return {
      status: 403,
      body: { error: SETTINGS_ERROR_CODES.administratorRequired },
    };
  }

  if (shouldChangePassword(session)) {
    return {
      status: 403,
      body: { error: SETTINGS_ERROR_CODES.passwordChangeRequired },
    };
  }

  return null;
}
