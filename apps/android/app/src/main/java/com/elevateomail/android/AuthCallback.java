package com.elevateomail.android;

import java.net.URI;
import java.util.Objects;

/** Pure validation for a future registered HTTPS callback; no token extraction or persistence. */
public final class AuthCallback {
    private AuthCallback() {}

    public static boolean matches(URI callback, URI registered, String expectedState) {
        if (callback == null || registered == null || expectedState == null || expectedState.isBlank()) return false;
        if (!"https".equals(callback.getScheme()) || !"https".equals(registered.getScheme())) return false;
        if (!Objects.equals(callback.getHost(), registered.getHost()) || callback.getPort() != -1) return false;
        if (!Objects.equals(callback.getPath(), registered.getPath())) return false;
        if (callback.getUserInfo() != null || callback.getFragment() != null) return false;
        String query = callback.getRawQuery();
        if (query == null) return false;
        String prefix = "state=";
        int count = 0;
        for (String part : query.split("&", -1)) {
            if (part.startsWith(prefix)) {
                count++;
                if (!part.substring(prefix.length()).equals(expectedState)) return false;
            }
        }
        return count == 1;
    }
}
