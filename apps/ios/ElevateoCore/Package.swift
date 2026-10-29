// swift-tools-version:6.0
// AIDEV-NOTE: Linux-buildable core for the iOS app; app target (apps/ios/Elevateo) depends on this package.
import PackageDescription

let package = Package(
    name: "ElevateoCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "ElevateoCore", targets: ["ElevateoCore"])
    ],
    dependencies: [
        // AIDEV-NOTE: pinned exactly; provides SHA-256 for PKCE S256 where CryptoKit is unavailable (Linux).
        .package(url: "https://github.com/apple/swift-crypto.git", exact: "3.9.1")
    ],
    targets: [
        .target(
            name: "ElevateoCore",
            dependencies: [
                .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux]))
            ],
            swiftSettings: [
                .swiftLanguageMode(.v6)
            ]
        ),
        .testTarget(
            name: "ElevateoCoreTests",
            dependencies: ["ElevateoCore"],
            swiftSettings: [
                .swiftLanguageMode(.v6)
            ]
        ),
    ]
)
