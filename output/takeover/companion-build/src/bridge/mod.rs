// AIDEV-NOTE: Shared containment powers fixtures and the opt-in native companion, never renderer shell commands.
#[cfg(windows)]
pub mod windows;
#[cfg(windows)]
pub mod io;
#[cfg(windows)]
pub mod cli_process;
#[cfg(windows)]
pub mod native_runtime;
pub mod native_protocol;
