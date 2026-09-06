const { withEntitlementsPlist } = require('@expo/config-plugins')

/**
 * Strips aps-environment entitlement added automatically by expo-notifications.
 * Allows using local notifications in Expo without requiring remote Apple Push
 * Notification capabilities or invalidating the App Store provisioning profile.
 */
module.exports = function withNoPushEntitlements(config) {
  return withEntitlementsPlist(config, (modConfig) => {
    delete modConfig.modResults['aps-environment']
    return modConfig
  })
}
