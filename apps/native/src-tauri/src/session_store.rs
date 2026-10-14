#[derive(Debug, PartialEq, Eq)]
pub enum StoreError {
    InvalidSession,
    Unavailable,
}

/// Native-only refresh material store. Callers must serialize access and never expose reads to IPC.
pub struct SessionStore;

impl SessionStore {
    const SERVICE: &'static str = "com.elevateo.mail.native-session";
    const ACCOUNT: &'static str = "refresh-token";

    pub fn save(refresh_token: &str) -> Result<(), StoreError> {
        if refresh_token.is_empty() || refresh_token.len() > 8192 || refresh_token.chars().any(char::is_whitespace) {
            return Err(StoreError::InvalidSession);
        }
        #[cfg(any(target_os = "windows", target_os = "macos"))]
        {
            let entry = keyring::Entry::new(Self::SERVICE, Self::ACCOUNT).map_err(|_| StoreError::Unavailable)?;
            entry.set_password(refresh_token).map_err(|_| StoreError::Unavailable)
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            Err(StoreError::Unavailable)
        }
    }

    pub fn load() -> Result<Option<String>, StoreError> {
        #[cfg(any(target_os = "windows", target_os = "macos"))]
        {
            let entry = keyring::Entry::new(Self::SERVICE, Self::ACCOUNT).map_err(|_| StoreError::Unavailable)?;
            match entry.get_password() {
                Ok(value) => Ok(Some(value)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(_) => Err(StoreError::Unavailable),
            }
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            Err(StoreError::Unavailable)
        }
    }

    /// Local removal alone does not prove server revocation; caller must also use the agreed route.
    pub fn clear() -> Result<(), StoreError> {
        #[cfg(any(target_os = "windows", target_os = "macos"))]
        {
            let entry = keyring::Entry::new(Self::SERVICE, Self::ACCOUNT).map_err(|_| StoreError::Unavailable)?;
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(_) => Err(StoreError::Unavailable),
            }
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            Err(StoreError::Unavailable)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_or_oversize_token_before_os_call() {
        assert_eq!(SessionStore::save(""), Err(StoreError::InvalidSession));
        assert_eq!(SessionStore::save(&"x".repeat(8193)), Err(StoreError::InvalidSession));
    }

    #[test]
    fn rejects_control_or_whitespace_token_before_os_call() {
        assert_eq!(SessionStore::save("a b"), Err(StoreError::InvalidSession));
        assert_eq!(SessionStore::save("a\nb"), Err(StoreError::InvalidSession));
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    #[test]
    fn unsupported_platform_fails_closed() {
        assert_eq!(SessionStore::load(), Err(StoreError::Unavailable));
        assert_eq!(SessionStore::clear(), Err(StoreError::Unavailable));
    }
}
