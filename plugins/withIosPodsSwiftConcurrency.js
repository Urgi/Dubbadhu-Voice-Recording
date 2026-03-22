/**
 * Xcode 16 defaults to strict Swift concurrency; expo-modules-core may fail to compile
 * with errors like "unknown attribute 'MainActor'" / Sendable violations.
 * This injects a Pod post_install hook to set SWIFT_STRICT_CONCURRENCY = minimal for all Pods.
 *
 * @type {import('@expo/config-plugins').ConfigPlugin}
 */
const { withPodfile } = require('@expo/config-plugins')

const MARKER =
  '# [expo] SWIFT_VERSION=5.10 + SWIFT_STRICT_CONCURRENCY=minimal (all Pods; Xcode 16.4 / EAS)'

const RUBY_SNIPPET = `
  ${MARKER}
  # Use Swift 5.10 language mode for every Pod. Xcode 16.4 + Swift 6 toolchain still emits
  # "sending 'self' risks causing data races" for RN 0.83 targets (RCTSwiftUI, RNScreens, etc.)
  # when left at Swift 6.0, which breaks EAS iOS Release builds.
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |build_config|
      build_config.build_settings['SWIFT_VERSION'] = '5.10'
      build_config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
    end
  end
`

/** Remove older injected blocks so prebuild does not stack duplicate hooks. */
function stripLegacyExpoSwiftSnippet(contents) {
  const patterns = [
    // Plugin v1 (long Expo-only comment)
    `\n  # [expo] SWIFT_VERSION=6.0 + SWIFT_STRICT_CONCURRENCY=minimal (Xcode 16 / ExpoModulesCore)\n` +
      `  installer.pods_project.targets.each do |target|\n` +
      `    target.build_configurations.each do |build_config|\n` +
      `      build_config.build_settings['SWIFT_VERSION'] = '6.0'\n` +
      `      build_config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'\n` +
      `    end\n` +
      `  end\n` +
      `  # Expo / EX* pods: use Swift 5.10 language mode on Xcode 16.4 / Swift 6.1 to avoid strict-concurrency /\n` +
      `  # MainActor issues across expo-modules-core, ExpoDomWebView, expo-file-system, etc. (toolchain unchanged).\n` +
      `  installer.pods_project.targets.each do |target|\n` +
      `    next unless target.name =~ /\\A(Expo|EX)/\n` +
      `    target.build_configurations.each do |build_config|\n` +
      `      build_config.build_settings['SWIFT_VERSION'] = '5.10'\n` +
      `    end\n` +
      `  end\n`,
    // Plugin v1 (short comment — common in checked-in Podfiles)
    `\n  # [expo] SWIFT_VERSION=6.0 + SWIFT_STRICT_CONCURRENCY=minimal (Xcode 16 / ExpoModulesCore)\n` +
      `  installer.pods_project.targets.each do |target|\n` +
      `    target.build_configurations.each do |build_config|\n` +
      `      build_config.build_settings['SWIFT_VERSION'] = '6.0'\n` +
      `      build_config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'\n` +
      `    end\n` +
      `  end\n` +
      `  # Expo / EX* pods: Swift 5.10 (see plugins/withIosPodsSwiftConcurrency.js).\n` +
      `  installer.pods_project.targets.each do |target|\n` +
      `    next unless target.name =~ /\\A(Expo|EX)/\n` +
      `    target.build_configurations.each do |build_config|\n` +
      `      build_config.build_settings['SWIFT_VERSION'] = '5.10'\n` +
      `    end\n` +
      `  end\n`,
  ]

  let out = contents
  for (const p of patterns) {
    out = out.split(p).join('')
  }
  return out
}

/**
 * Insert snippet right after the closing `)` of `react_native_post_install(...)` inside post_install.
 */
function injectAfterReactNativePostInstall(contents) {
  if (contents.includes(MARKER)) return contents

  contents = stripLegacyExpoSwiftSnippet(contents)
  if (contents.includes(MARKER)) return contents

  const needle = 'react_native_post_install('
  const start = contents.indexOf(needle)
  if (start === -1) {
    console.warn(
      '[withIosPodsSwiftConcurrency] Could not find react_native_post_install in Podfile; skipping injection.',
    )
    return contents
  }

  let i = start + needle.length - 1
  let depth = 0
  for (; i < contents.length; i++) {
    const c = contents[i]
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) {
        const insertPos = i + 1
        return contents.slice(0, insertPos) + RUBY_SNIPPET + contents.slice(insertPos)
      }
    }
  }

  console.warn('[withIosPodsSwiftConcurrency] Could not match closing paren for react_native_post_install.')
  return contents
}

module.exports = function withIosPodsSwiftConcurrency(config) {
  return withPodfile(config, (cfg) => {
    cfg.modResults.contents = injectAfterReactNativePostInstall(cfg.modResults.contents)
    return cfg
  })
}
