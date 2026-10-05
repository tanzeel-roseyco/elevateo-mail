fn main() {
    // AIDEV-NOTE: Register commands so app ACL denies invocation outside the bundled window capability.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["prepare_draft"])
    )).expect("Could not generate native permissions");
}
