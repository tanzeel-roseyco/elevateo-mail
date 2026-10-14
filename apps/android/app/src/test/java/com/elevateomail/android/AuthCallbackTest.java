package com.elevateomail.android;

import java.net.URI;
import org.junit.Test;
import static org.junit.Assert.*;

public final class AuthCallbackTest {
    private static final URI REGISTERED = URI.create("https://auth.example.invalid/mobile/callback");
    @Test public void acceptsExactRegisteredState() {
        assertTrue(AuthCallback.matches(URI.create("https://auth.example.invalid/mobile/callback?code=x&state=nonce"), REGISTERED, "nonce"));
    }
    @Test public void rejectsLookalikeHost() {
        assertFalse(AuthCallback.matches(URI.create("https://auth.example.invalid.evil.invalid/mobile/callback?state=nonce"), REGISTERED, "nonce"));
    }
    @Test public void rejectsDuplicateState() {
        assertFalse(AuthCallback.matches(URI.create("https://auth.example.invalid/mobile/callback?state=nonce&state=nonce"), REGISTERED, "nonce"));
    }
}
