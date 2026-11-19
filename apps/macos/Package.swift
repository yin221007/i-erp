// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "IERPMac",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "IERPMac", targets: ["IERPMac"])
    ],
    targets: [
        .executableTarget(name: "IERPMac"),
        .testTarget(name: "IERPMacTests", dependencies: ["IERPMac"])
    ],
    swiftLanguageModes: [.v5]
)
